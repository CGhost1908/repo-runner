import uuid
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from backend.models import RunRequest, StatusEnum
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
    if run_id in active_runs:
        active_runs[run_id]["logs"].append(message)
    if run_id in ws_connections:
        for ws in list(ws_connections[run_id]):
            try:
                await ws.send_json({"run_id": run_id, "message": message})
            except Exception:
                pass

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
        target_dir = repo_manager.prepare_repo(request, run_id)
        await broadcast_log(run_id, f"Repo hazırlandı: {target_dir}")

        await broadcast_log(run_id, "--> Adım 2: Teknoloji stack analizi yapılıyor...")
        stack_info = detector.analyze(target_dir, port=request.port)
        active_runs[run_id]["framework"] = stack_info.framework
        await broadcast_log(run_id, f"Tespit edilen çatı: {stack_info.framework} (Standart Mod: {stack_info.is_standard})")

        if not stack_info.is_standard:
            await broadcast_log(run_id, "⚠️ UYARI: Bu proje standart şablonlarımız dışında. AI Derin Modu gerekli.")
            active_runs[run_id]["status"] = StatusEnum.AWAITING_HITL
            return

        await broadcast_log(run_id, "--> Adım 3: Sanal ortam hazırlanıyor ve bağımlılıklar yükleniyor...")
        active_runs[run_id]["status"] = StatusEnum.INSTALLING
        python_bin = env_manager.create_venv(target_dir, log_cb=log)
        if stack_info.install_command:
            success = env_manager.install_dependencies(target_dir, stack_info.install_command, log_cb=log)
            if not success:
                await broadcast_log(run_id, "❌ HATA: Bağımlılık kurulumu başarısız oldu!")
                active_runs[run_id]["status"] = StatusEnum.FAILED
                return

        await broadcast_log(run_id, f"--> Adım 4: Uygulama başlatılıyor (Port: {request.port})...")
        active_runs[run_id]["status"] = StatusEnum.RUNNING
        cmd = stack_info.run_command.split()
        if cmd[0] == "uvicorn":
            uvicorn_exe = target_dir / ".venv" / "Scripts" / "uvicorn.exe"
            if uvicorn_exe.exists():
                cmd[0] = str(uvicorn_exe)
            else:
                cmd = [str(python_bin), "-m", "uvicorn"] + cmd[1:]
        elif cmd[0] == "python":
            cmd[0] = str(python_bin)

        process_runner.start(run_id, cmd, target_dir, log_cb=log)

        await broadcast_log(run_id, "--> Port sağlık kontrolü yapılıyor...")
        healthy = await process_runner.check_health(request.port, timeout_seconds=8.0)
        active_runs[run_id]["is_healthy"] = healthy
        if healthy:
            await broadcast_log(run_id, f"✅ Başarılı! Uygulama http://localhost:{request.port} üzerinde canlı yayında.")
        else:
            await broadcast_log(run_id, "⚠️ Port henüz yanıt vermedi veya uygulama sessiz başlatıldı.")

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
                    "path": str(d),
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
