import uuid
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from backend.models import RunRequest, StatusEnum, ExecutionMode
from backend.config import get_settings
from backend.services.repo_manager import RepoManager
from backend.services.detector import StackDetector
from backend.services.env_manager import EnvManager
from backend.services.process_runner import ProcessRunner

router = APIRouter(prefix="/api")

active_runs: dict[str, dict] = {}
ws_connections: dict[str, list[WebSocket]] = {}

settings = get_settings()
repo_manager = RepoManager(settings)
detector = StackDetector()
env_manager = EnvManager()
process_runner = ProcessRunner()

def broadcast_log(run_id: str, message: str):
    """
    Log Mesajı Dağıtıcı:
    Gelen mesajı hem sunucu terminaline yazar hem de WebSocket ile ön yüze (React/Tauri) canlı fırlatır.
    """
    try:
        print(f"[{run_id}] {message}", flush=True)
    except Exception:
        pass

    # Log geçmişini sakla (Sayfayı yenileyen veya geç bağlanan kullanıcı geçmişi görebilsin)
    if run_id in active_runs:
        active_runs[run_id]["logs"].append(message)

    # Bağlı olan tüm WebSocket istemcilerine anında gönder
    if run_id in ws_connections and ws_connections[run_id]:
        loop = getattr(broadcast_log, "loop", None)
        for ws in list(ws_connections[run_id]):
            try:
                if loop and loop.is_running():
                    asyncio.run_coroutine_threadsafe(
                        ws.send_json({"run_id": run_id, "message": message}),
                        loop
                    )
            except Exception:
                pass

from backend.services.ai_planner import AIPlanner
ai_planner = AIPlanner()

@router.get("/health")
def health():
    return {"status": "ok"}

@router.post("/run")
async def start_run(request: RunRequest):
    """
    Kullanıcı 'Projeyi Çalıştır' butonuna bastığında çağrılan ana API uç noktası.
    Hemen bir işlem kimliği (run_id) üretir ve asıl ağır işi arka plana (background task) bırakır.
    """
    broadcast_log.loop = asyncio.get_running_loop()
    run_id = str(uuid.uuid4())[:8]

    # İşlem durumunu ilk başta 'Klonlanıyor' olarak kaydediyoruz
    active_runs[run_id] = {
        "status": StatusEnum.CLONING,
        "logs": [],
        "port": request.port,
        "framework": None,
        "is_healthy": False
    }

    # Sunucu kilitlenmesin diye pipeline'ı arka planda bağımsız bir görev olarak başlatıyoruz:
    asyncio.create_task(_execute_pipeline(run_id, request))
    return {"run_id": run_id, "status": "started"}

async def _execute_pipeline(run_id: str, request: RunRequest):
    """
    ANA ÇALIŞTIRMA BORU HATTI (4 Basit Adım):
    1. Repoyu Hazırla (Git Clone veya Yerel Dizin)
    2. Projeyi Tanı (FastAPI / Flask / Django / Node / HTML)
    3. Bağımlılıkları Yükle (Sanal Ortam .venv + pip install)
    4. Uygulamayı Başlat ve Port Sağlık Kontrolü Yap
    """
    def log(msg: str):
        broadcast_log(run_id, msg)

    try:
        # ==========================================
        # 1. ADIM: PROJEYİ HAZIRLA
        # ==========================================
        log("--> Step 1: Preparing repository...")
        # Git clone uzun sürebileceği için sunucuyu dondurmamak adına thread'de çalıştırıyoruz
        target_dir = await asyncio.to_thread(repo_manager.prepare_repo, request, run_id)
        log(f"Repository ready: {target_dir}")

        # ==========================================
        # 2. ADIM: TEKNOLOJİYİ TESPİT ET
        # ==========================================
        log("--> Step 2: Analyzing technology stack...")
        stack_info = detector.analyze(target_dir, port=request.port)
        active_runs[run_id]["framework"] = stack_info.framework
        log(f"Detected framework: {stack_info.framework} (Standard Mode: {stack_info.is_standard})")

        # Eğer proje standart kurallarımıza uymuyorsa Yapay Zeka Planlayıcı devreye girer
        if not stack_info.is_standard or request.mode == ExecutionMode.DEEP_AI:
            log("🧠 [AI Deep Mode] Autonomous analysis engine engaged...")
            ai_stack_info, decision_logs = ai_planner.plan(target_dir, port=request.port)
            for dlog in decision_logs:
                log(dlog)
            stack_info = ai_stack_info
            active_runs[run_id]["framework"] = stack_info.framework

        python_bin = env_manager.get_python_bin(target_dir)

        # ==========================================
        # 3. ADIM: SANAL ORTAM & BAĞIMLILIKLAR (.venv)
        # ==========================================
        if stack_info.install_command:
            log("--> Step 3: Preparing virtual environment and installing dependencies...")
            active_runs[run_id]["status"] = StatusEnum.INSTALLING
            
            # Sanal ortamı (.venv) oluştur
            python_bin = await asyncio.to_thread(env_manager.create_venv, target_dir, log)
            log(f"💻 $ {stack_info.install_command}")
            
            # pip install komutunu çalıştır (pip bitene kadar logları anlık ekrana yazar)
            success = await asyncio.to_thread(env_manager.install_dependencies, target_dir, stack_info.install_command, log)
            if not success:
                log("❌ ERROR: Dependency installation failed!")
                active_runs[run_id]["status"] = StatusEnum.FAILED
                return
        else:
            log("--> Step 3: Skipping dependency installation (No requirements specified).")

        # ==========================================
        # 4. ADIM: UYGULAMAYI BAŞLAT VE PORTU DİNLE
        # ==========================================
        log(f"--> Step 4: Launching application (Port: {request.port})...")
        active_runs[run_id]["status"] = StatusEnum.RUNNING

        if not stack_info.run_command:
            log("❌ ERROR: No executable launch command found.")
            active_runs[run_id]["status"] = StatusEnum.FAILED
            return

        cmd = stack_info.run_command.split()
        if cmd[0] == "uvicorn":
            uvicorn_exe = target_dir / ".venv" / "Scripts" / "uvicorn.exe"
            if uvicorn_exe.exists():
                cmd[0] = str(uvicorn_exe)
            else:
                cmd = [str(python_bin), "-m", "uvicorn"] + cmd[1:]
        elif cmd[0] == "python":
            if python_bin.exists():
                cmd[0] = str(python_bin)
            else:
                import sys
                cmd[0] = sys.executable

        log(f"💻 $ {' '.join(cmd)}")
        # Süreci arka planda başlat (ProcessRunner çıktıları sürekli log fonksiyonuna aktarır)
        process_runner.start(run_id, cmd, target_dir, log_cb=log)

        # Uygulama gerçekten ayağa kalktı mı? Hedef porta HTTP isteği atarak test ediyoruz
        log("--> Performing port health check...")
        healthy = await process_runner.check_health(request.port, timeout_seconds=6.0)
        active_runs[run_id]["is_healthy"] = healthy
        if healthy:
            log(f"✅ Success! Application is live at http://localhost:{request.port}")
        else:
            log(f"ℹ️ Process spawned (PID active). Awaiting port response: http://localhost:{request.port}")

    except Exception as e:
        log(f"❌ Critical Error: {str(e)}")
        active_runs[run_id]["status"] = StatusEnum.FAILED

@router.post("/stop/{run_id}")
def stop_run(run_id: str):
    success = process_runner.stop(run_id)
    if run_id in active_runs:
        active_runs[run_id]["status"] = StatusEnum.STOPPED
    return {"stopped": success}

@router.get("/status/{run_id}")
def get_status(run_id: str):
    if run_id not in active_runs:
        raise HTTPException(status_code=404, detail="Run not found")
    return active_runs[run_id]

# Settings store
user_settings_state = {
    "ollama_url": "http://localhost:11434",
    "openai_key": "",
    "gemini_key": "",
    "default_ai_engine": "ollama",
    "default_port": 8000,
    "alt_ports": [8001, 8002, 3000],
    "preferred_env": "venv",
    "workspace_dir": str(settings.workspace_dir)
}

@router.get("/settings")
def get_user_settings():
    return user_settings_state

@router.post("/settings")
def update_user_settings(new_settings: dict):
    user_settings_state.update(new_settings)
    return {"status": "saved", "settings": user_settings_state}

@router.get("/system/stats")
def get_system_stats():
    import sys
    total_runs = len(active_runs)
    running_count = sum(1 for r in active_runs.values() if r.get("status") == StatusEnum.RUNNING)
    healthy_count = sum(1 for r in active_runs.values() if r.get("is_healthy"))

    workspace_projects = []
    if settings.workspace_dir.exists():
        workspace_projects = [f.name for f in settings.workspace_dir.iterdir() if f.is_dir()]

    return {
        "total_runs": total_runs,
        "running_now": running_count,
        "healthy_now": healthy_count,
        "saved_projects_count": len(workspace_projects),
        "python_version": sys.version.split()[0],
        "workspace_dir": str(settings.workspace_dir),
        "ai_engine": user_settings_state["default_ai_engine"]
    }

@router.get("/projects")
def list_projects():
    projects = []
    if settings.workspace_dir.exists():
        for d in settings.workspace_dir.iterdir():
            if d.is_dir():
                stack = detector.analyze(d, port=8000)
                projects.append({
                    "id": d.name,
                    "name": d.name,
                    "path": d.as_posix(),
                    "framework": stack.framework,
                    "is_standard": stack.is_standard,
                    "has_dockerfile": stack.has_dockerfile,
                    "created_at": d.stat().st_mtime
                })
    return sorted(projects, key=lambda x: x["created_at"], reverse=True)

@router.delete("/projects/{project_name}")
def delete_project(project_name: str):
    import shutil
    target = settings.workspace_dir / project_name
    if target.exists() and target.is_dir():
        shutil.rmtree(target, ignore_errors=True)
        return {"status": "deleted", "project": project_name}
    raise HTTPException(status_code=404, detail="Project not found")
