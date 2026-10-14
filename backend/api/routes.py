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

async def broadcast_log(run_id: str, message: str):
    # Print to console so user sees live logs in terminal (safe on Windows)
    try:
        print(f"[{run_id}] {message}", flush=True)
    except Exception:
        try:
            safe_msg = message.encode("ascii", "replace").decode("ascii")
            print(f"[{run_id}] {safe_msg}", flush=True)
        except Exception:
            pass

    if run_id in active_runs:
        active_runs[run_id]["logs"].append(message)
    if run_id in ws_connections:
        for ws in list(ws_connections[run_id]):
            try:
                await ws.send_json({"run_id": run_id, "message": message})
            except Exception:
                pass

from backend.services.ai_planner import AIPlanner
ai_planner = AIPlanner()

@router.get("/health")
def health():
    return {"status": "ok"}

@router.post("/run")
async def start_run(request: RunRequest):
    run_id = str(uuid.uuid4())[:8]
    active_runs[run_id] = {
        "status": StatusEnum.CLONING,
        "logs": [],
        "port": request.port,
        "framework": None,
        "is_healthy": False
    }

    asyncio.create_task(_execute_pipeline(run_id, request))
    return {"run_id": run_id, "status": "started"}

async def _execute_pipeline(run_id: str, request: RunRequest):
    loop = asyncio.get_running_loop()

    def log(msg: str):
        asyncio.run_coroutine_threadsafe(broadcast_log(run_id, msg), loop)

    try:
        await broadcast_log(run_id, "--> Adım 1: Repo hazırlanıyor...")
        target_dir = await asyncio.to_thread(repo_manager.prepare_repo, request, run_id)
        await broadcast_log(run_id, f"Repo hazırlandı: {target_dir}")

        await broadcast_log(run_id, "--> Adım 2: Teknoloji stack analizi yapılıyor...")
        stack_info = detector.analyze(target_dir, port=request.port)
        active_runs[run_id]["framework"] = stack_info.framework
        await broadcast_log(run_id, f"Tespit edilen çatı: {stack_info.framework} (Standart Mod: {stack_info.is_standard})")

        # If not standard or user explicitly requested AI Deep Mode, trigger AI Planner
        if not stack_info.is_standard or request.mode == ExecutionMode.DEEP_AI:
            await broadcast_log(run_id, "🧠 [AI Derin Mod] Otonom analiz motoru devreye girdi...")
            ai_stack_info, decision_logs = ai_planner.plan(target_dir, port=request.port)
            for dlog in decision_logs:
                await broadcast_log(run_id, dlog)
            stack_info = ai_stack_info
            active_runs[run_id]["framework"] = stack_info.framework

        python_bin = env_manager.get_python_bin(target_dir)

        # Step 3: Dependencies installation (if needed)
        if stack_info.install_command:
            await broadcast_log(run_id, "--> Adım 3: Sanal ortam hazırlanıyor ve bağımlılıklar yükleniyor...")
            active_runs[run_id]["status"] = StatusEnum.INSTALLING
            python_bin = await asyncio.to_thread(env_manager.create_venv, target_dir, log)
            await broadcast_log(run_id, f"💻 $ {stack_info.install_command}")
            success = await asyncio.to_thread(env_manager.install_dependencies, target_dir, stack_info.install_command, log)
            if not success:
                await broadcast_log(run_id, "❌ HATA: Bağımlılık kurulumu başarısız oldu!")
                active_runs[run_id]["status"] = StatusEnum.FAILED
                return
        else:
            await broadcast_log(run_id, "--> Adım 3: Bağımlılık kurulumu atlanıyor (Gereksinim yok).")

        # Step 4: Launching application
        await broadcast_log(run_id, f"--> Adım 4: Uygulama başlatılıyor (Port: {request.port})...")
        active_runs[run_id]["status"] = StatusEnum.RUNNING

        if not stack_info.run_command:
            await broadcast_log(run_id, "❌ HATA: Çalıştırılabilir bir komut bulunamadı.")
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

        await broadcast_log(run_id, f"💻 $ {' '.join(cmd)}")
        process_runner.start(run_id, cmd, target_dir, log_cb=log)

        await broadcast_log(run_id, "--> Port sağlık kontrolü yapılıyor...")
        healthy = await process_runner.check_health(request.port, timeout_seconds=6.0)
        active_runs[run_id]["is_healthy"] = healthy
        if healthy:
            await broadcast_log(run_id, f"✅ Başarılı! Uygulama http://localhost:{request.port} üzerinde canlı yayında.")
        else:
            await broadcast_log(run_id, f"ℹ️ Süreç başlatıldı (PID aktif). Port yanıtı bekleniyor: http://localhost:{request.port}")

    except Exception as e:
        await broadcast_log(run_id, f"❌ Kritik Hata: {str(e)}")
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
