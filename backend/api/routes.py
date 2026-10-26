import uuid
import asyncio
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from backend.models import (
    RunRequest, StatusEnum, ExecutionMode, OpenBrowserRequest,
    DetectRequest, DetectResponse, SavedRecipe, ServiceConfig
)
from backend.config import get_settings
from backend.services.repo_manager import RepoManager
from backend.services.detector import StackDetector
from backend.services.env_manager import EnvManager
from backend.services.process_runner import ProcessRunner
from backend.services.project_meta import ProjectMetaManager

router = APIRouter(prefix="/api")

active_runs: dict[str, dict] = {}
ws_connections: dict[str, list[WebSocket]] = {}

settings = get_settings()
repo_manager = RepoManager(settings)
detector = StackDetector()
env_manager = EnvManager()
process_runner = ProcessRunner()

def broadcast_log(run_id: str, message: str):
    try:
        print(f"[{run_id}] {message}", flush=True)
    except Exception:
        pass

    if run_id in active_runs:
        active_runs[run_id]["logs"].append(message)

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

@router.post("/open-browser")
def open_browser_endpoint(req: OpenBrowserRequest):
    """
    Sistem varsayilan web tarayicisinda verilen URL'yi acar.
    Tauri WebView veya masaustu calisma ortamlarinda target='_blank' engellendiginde calisir.
    """
    url = req.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL cannot be empty")

    import os, sys, subprocess, webbrowser

    opened = False
    # 1. Windows uzerinde en saglikli yontem: os.startfile
    if hasattr(os, "startfile"):
        try:
            os.startfile(url)
            opened = True
        except Exception:
            pass

    # 2. Python webbrowser modul destegi
    if not opened:
        try:
            opened = webbrowser.open(url)
        except Exception:
            pass

    # 3. Windows cmd start fallback
    if not opened and sys.platform == "win32":
        try:
            subprocess.Popen(f'start "" "{url}"', shell=True)
            opened = True
        except Exception:
            pass

    return {"status": "ok", "url": url, "opened": opened}

@router.get("/open-browser")
def open_browser_get(url: str):
    return open_browser_endpoint(OpenBrowserRequest(url=url))

@router.post("/detect", response_model=DetectResponse)
async def detect_project_stack(req: DetectRequest):
    """
    Projeyi çalıştırmadan önce teknolojilerini, giriş noktasını, bağımlılıklarını
    ve çalıştırma komutlarını tespit eden ön analiz API'si.
    Daha önce başarıyla çalıştırılmış repolar için analizi atlayarak doğrudan kayıtlı talimatları döndürür.
    """
    if not req.repo_url and not req.local_path:
        raise HTTPException(status_code=400, detail="Either 'repo_url' or 'local_path' must be provided.")

    # 1. Önceden başarıyla çalıştırılmış kayıtlı reçete var mı kontrol et
    query = req.repo_url or req.local_path
    cached_match = ProjectMetaManager.find_cached_recipe(query, settings.workspace_dir)
    if cached_match:
        target_dir, recipe, meta = cached_match
        fw = recipe.get("framework", "generic_python")
        saved_services = recipe.get("services") or []
        if not saved_services:
            fresh_info = detector.analyze(target_dir, port=recipe.get("port", req.port))
            saved_services = getattr(fresh_info, "services", []) or [
                {
                    "id": "backend",
                    "role": "backend",
                    "name": f"Backend Service ({fw.upper()})",
                    "framework": fw,
                    "working_dir": ".",
                    "install_command": recipe.get("install_command"),
                    "run_command": recipe.get("run_command"),
                    "port": recipe.get("port", req.port),
                    "enabled": True
                }
            ]
        return DetectResponse(
            framework=fw,
            is_standard=recipe.get("is_standard", True),
            install_command=recipe.get("install_command"),
            run_command=recipe.get("run_command"),
            has_dockerfile=(target_dir / "Dockerfile").exists(),
            entrypoint=recipe.get("entrypoint"),
            detected_files=[],
            project_name=meta.get("repo_name", target_dir.name),
            path=target_dir.as_posix(),
            repo_owner=meta.get("repo_owner"),
            cached=True,
            last_run_status="SUCCESS",
            saved_recipe=SavedRecipe(**{**recipe, "services": saved_services}),
            services=[ServiceConfig(**s) for s in saved_services]
        )

    # 2. Kayıtlı reçete yoksa repoyu hazırla ve StackDetector ile analiz et
    run_id = f"det_{uuid.uuid4().hex[:8]}"
    try:
        run_req = RunRequest(repo_url=req.repo_url, local_path=req.local_path, port=req.port)
        target_dir = await asyncio.to_thread(repo_manager.prepare_repo, run_req, run_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    stack_info = detector.analyze(target_dir, port=req.port)
    meta = ProjectMetaManager.get_meta(target_dir)
    raw_services = getattr(stack_info, "services", []) or []

    return DetectResponse(
        framework=stack_info.framework,
        is_standard=stack_info.is_standard,
        install_command=stack_info.install_command,
        run_command=stack_info.run_command,
        has_dockerfile=stack_info.has_dockerfile,
        entrypoint=stack_info.entrypoint,
        detected_files=getattr(stack_info, "detected_files", []),
        project_name=meta.get("repo_name", target_dir.name),
        path=target_dir.as_posix(),
        repo_owner=meta.get("repo_owner"),
        cached=False,
        last_run_status=meta.get("last_run_status", "NEVER_RUN"),
        services=[ServiceConfig(**s) for s in raw_services]
    )

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
        active_runs[run_id]["target_dir"] = target_dir
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
            log("[AI Planner] Autonomous analysis engine engaged...")
            ai_stack_info, decision_logs = ai_planner.plan(target_dir, port=request.port)
            for dlog in decision_logs:
                log(dlog)
            stack_info = ai_stack_info
            active_runs[run_id]["framework"] = stack_info.framework

        # Kullanıcı tespit pop-up'ında komutları özelleştirdiyse uygula
        if request.custom_run_command:
            stack_info.run_command = request.custom_run_command
            log(f"Custom run command applied: {request.custom_run_command}")
        if request.custom_install_command is not None:
            stack_info.install_command = request.custom_install_command
            log(f"Custom install command applied: {request.custom_install_command}")

        enabled_services = [s for s in (request.services or []) if s.enabled and s.run_command]

        # Multi-service execution path when multiple tiers are configured
        if len(enabled_services) > 1:
            active_runs[run_id]["ports"] = [s.port for s in enabled_services]
            active_runs[run_id]["services"] = [s.model_dump() for s in enabled_services]
            active_runs[run_id]["status"] = StatusEnum.INSTALLING

            import sys
            for svc in enabled_services:
                if active_runs.get(run_id, {}).get("status") == StatusEnum.STOPPED:
                    return
                svc_dir = (target_dir / (svc.working_dir or ".")).resolve()
                if not svc_dir.exists():
                    svc_dir = target_dir

                if svc.install_command and svc.install_command.strip():
                    log(f"--> Step 3 [{svc.role.upper()}]: Installing dependencies in '{svc.working_dir or '.'}'...")
                    first_tok = svc.install_command.strip().split()[0].lower()
                    if first_tok in ("pip", "python"):
                        await asyncio.to_thread(env_manager.create_venv, svc_dir, log, run_id)
                    log(f"[{svc.role.upper()}] $ {svc.install_command}")
                    ok = await asyncio.to_thread(
                        env_manager.install_dependencies, svc_dir, svc.install_command, log, run_id
                    )
                    if not ok:
                        log(f"[ERROR] Dependency installation failed for {svc.name} ({svc.role.upper()})!")
                        active_runs[run_id]["status"] = StatusEnum.FAILED
                        return

            if active_runs.get(run_id, {}).get("status") == StatusEnum.STOPPED:
                return

            active_runs[run_id]["status"] = StatusEnum.RUNNING
            spawned_procs = []
            import os

            for idx, svc in enumerate(enabled_services):
                svc_dir = (target_dir / (svc.working_dir or ".")).resolve()
                if not svc_dir.exists():
                    svc_dir = target_dir

                py_bin = env_manager.get_python_bin(svc_dir)
                if not py_bin.exists():
                    py_bin = env_manager.get_python_bin(target_dir)
                py_exec = str(py_bin) if py_bin.exists() else sys.executable

                cmd = svc.run_command.strip().split()
                if cmd[0] == "flask" and "--app" not in cmd and stack_info.entrypoint:
                    cmd = ["flask", "--app", stack_info.entrypoint] + cmd[1:]
                if cmd[0] in ("uvicorn", "flask", "streamlit"):
                    cmd = [py_exec, "-m", cmd[0]] + cmd[1:]
                elif cmd[0] == "python":
                    cmd[0] = py_exec

                await asyncio.to_thread(process_runner.free_port, svc.port, log)
                log(f"--> Step 4 [{svc.role.upper()} :{svc.port}]: Launching $ {' '.join(cmd)}")

                proc_key = run_id if idx == 0 else f"{run_id}:{svc.id}"
                prefix = f"[{svc.role.upper()} :{svc.port}] "
                py_paths = [str(target_dir.resolve()), str(svc_dir.resolve())]
                existing_py_path = os.environ.get("PYTHONPATH", "")
                if existing_py_path:
                    py_paths.append(existing_py_path)

                proc = process_runner.start(
                    proc_key,
                    cmd,
                    svc_dir,
                    log_cb=lambda m, pfx=prefix: log(f"{pfx}{m}"),
                    extra_env={"PYTHONPATH": os.pathsep.join(dict.fromkeys(py_paths))}
                )
                spawned_procs.append((svc, proc, proc_key))

            log("--> Performing multi-service port health checks...")
            any_healthy = False
            all_healthy = True
            for svc, proc, proc_key in spawned_procs:
                h = await process_runner.check_health(svc.port, timeout_seconds=25.0, run_id=proc_key)
                if h:
                    any_healthy = True
                    log(f"[SUCCESS] {svc.name} ({svc.role.upper()}) is live at http://localhost:{svc.port}")
                else:
                    all_healthy = False
                    log(f"[ERROR] {svc.name} ({svc.role.upper()}) failed to respond on port :{svc.port}.")

            active_runs[run_id]["is_healthy"] = any_healthy
            if all_healthy:
                primary_port = enabled_services[0].port
                log(f"[SUCCESS] All {len(enabled_services)} service tiers are live!")
                ProjectMetaManager.record_run_result(
                    repo_dir=target_dir,
                    status="SUCCESS",
                    recipe={
                        "framework": stack_info.framework,
                        "install_command": enabled_services[0].install_command,
                        "run_command": enabled_services[0].run_command,
                        "port": primary_port,
                        "entrypoint": stack_info.entrypoint,
                        "is_standard": stack_info.is_standard,
                        "services": [s.model_dump() for s in enabled_services]
                    },
                    repo_url=request.repo_url
                )
                log("[INFO] Multi-service execution blueprint saved to 'My Repos' profile.")
            elif not any_healthy:
                active_runs[run_id]["status"] = StatusEnum.FAILED
            return

        # Single-service adjustments if 1 service was passed in request.services
        svc_work_dir = target_dir
        if len(enabled_services) == 1:
            only_svc = enabled_services[0]
            stack_info.install_command = only_svc.install_command
            stack_info.run_command = only_svc.run_command
            request.port = only_svc.port
            active_runs[run_id]["port"] = only_svc.port
            active_runs[run_id]["services"] = [only_svc.model_dump()]
            cand_dir = (target_dir / (only_svc.working_dir or ".")).resolve()
            if cand_dir.exists():
                svc_work_dir = cand_dir

        python_bin = env_manager.get_python_bin(svc_work_dir)

        # ==========================================
        # 3. ADIM: SANAL ORTAM & BAĞIMLILIKLAR (.venv)
        # ==========================================
        if active_runs.get(run_id, {}).get("status") == StatusEnum.STOPPED:
            return

        if stack_info.install_command:
            log("--> Step 3: Preparing virtual environment and installing dependencies...")
            active_runs[run_id]["status"] = StatusEnum.INSTALLING
            
            first_tok = stack_info.install_command.strip().split()[0].lower()
            if first_tok in ("pip", "python"):
                python_bin = await asyncio.to_thread(env_manager.create_venv, svc_work_dir, log, run_id)
                if active_runs.get(run_id, {}).get("status") == StatusEnum.STOPPED:
                    return

            log(f"$ {stack_info.install_command}")
            
            success = await asyncio.to_thread(env_manager.install_dependencies, svc_work_dir, stack_info.install_command, log, run_id)
            if active_runs.get(run_id, {}).get("status") == StatusEnum.STOPPED:
                return
            if not success:
                log("[ERROR] Dependency installation failed!")
                active_runs[run_id]["status"] = StatusEnum.FAILED
                ProjectMetaManager.record_run_result(
                    repo_dir=target_dir,
                    status="FAILED",
                    repo_url=request.repo_url
                )
                return
        else:
            log("--> Step 3: Skipping dependency installation (No requirements specified).")

        # ==========================================
        # 4. ADIM: UYGULAMAYI BAŞLAT VE PORTU DİNLE
        # ==========================================
        if active_runs.get(run_id, {}).get("status") == StatusEnum.STOPPED:
            return
        log(f"--> Step 4: Launching application (Port: {request.port})...")
        active_runs[run_id]["status"] = StatusEnum.RUNNING

        if not stack_info.run_command:
            log("[ERROR] No executable launch command found.")
            active_runs[run_id]["status"] = StatusEnum.FAILED
            ProjectMetaManager.record_run_result(
                repo_dir=target_dir,
                status="FAILED",
                repo_url=request.repo_url
            )
            return

        cmd = stack_info.run_command.split()
        import os, sys
        py_exec = str(python_bin) if python_bin.exists() else sys.executable

        # Auto-inject --app for flask if entrypoint is in a subfolder (e.g. src/app.py) and --app wasn't specified
        if cmd[0] == "flask" and "--app" not in cmd and stack_info.entrypoint:
            cmd = ["flask", "--app", stack_info.entrypoint] + cmd[1:]

        if cmd[0] in ("uvicorn", "flask", "streamlit"):
            cmd = [py_exec, "-m", cmd[0]] + cmd[1:]
        elif cmd[0] == "python":
            cmd[0] = py_exec

        await asyncio.to_thread(process_runner.free_port, request.port, log)
        log(f"$ {' '.join(cmd)}")
        py_paths = [str(target_dir.resolve()), str(svc_work_dir.resolve())]
        existing_py_path = os.environ.get("PYTHONPATH", "")
        if existing_py_path:
            py_paths.append(existing_py_path)
        proc = process_runner.start(
            run_id,
            cmd,
            svc_work_dir,
            log_cb=log,
            extra_env={"PYTHONPATH": os.pathsep.join(dict.fromkeys(py_paths))}
        )

        # Uygulama gerçekten ayağa kalktı mı? Hedef porta HTTP isteği atarak test ediyoruz
        log("--> Performing port health check...")
        healthy = await process_runner.check_health(request.port, timeout_seconds=25.0, run_id=run_id)
        active_runs[run_id]["is_healthy"] = healthy
        if healthy:
            log(f"[SUCCESS] Application is live at http://localhost:{request.port}")
            ProjectMetaManager.record_run_result(
                repo_dir=target_dir,
                status="SUCCESS",
                recipe={
                    "framework": stack_info.framework,
                    "install_command": stack_info.install_command,
                    "run_command": stack_info.run_command,
                    "port": request.port,
                    "entrypoint": stack_info.entrypoint,
                    "is_standard": stack_info.is_standard,
                    "services": [s.model_dump() for s in enabled_services] if enabled_services else getattr(stack_info, "services", [])
                },
                repo_url=request.repo_url
            )
            log("[INFO] Execution instructions automatically saved to 'My Repos' profile.")
        elif proc.poll() is not None and proc.returncode != 0:
            active_runs[run_id]["status"] = StatusEnum.FAILED
            log(f"[ERROR] Application process exited unexpectedly (Exit code: {proc.returncode}).")
            ProjectMetaManager.record_run_result(
                repo_dir=target_dir,
                status="FAILED",
                repo_url=request.repo_url
            )
        else:
            log(f"[INFO] Process spawned (PID active). Awaiting port response: http://localhost:{request.port}")

    except Exception as e:
        log(f"[ERROR] Critical Error: {str(e)}")
        active_runs[run_id]["status"] = StatusEnum.FAILED
        if 'target_dir' in locals() and target_dir and target_dir.exists():
            ProjectMetaManager.record_run_result(
                repo_dir=target_dir,
                status="FAILED",
                repo_url=request.repo_url
            )

@router.post("/stop/{run_id}")
def stop_run(run_id: str):
    if run_id in active_runs:
        active_runs[run_id]["status"] = StatusEnum.STOPPED
        t_dir = active_runs[run_id].get("target_dir")
        if t_dir and getattr(t_dir, "exists", lambda: False)():
            ProjectMetaManager.record_run_result(t_dir, status="STOPPED")
    env_stopped = env_manager.stop(run_id)
    proc_stopped = process_runner.stop(run_id)
    return {"stopped": env_stopped or proc_stopped}
    return {"stopped": env_stopped or proc_stopped}

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
    "alt_ports": [8000, 8001, 8002, 3000],
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
def list_projects(sort_by: str = "recent", status: Optional[str] = None):
    projects = []
    if settings.workspace_dir.exists():
        for d in settings.workspace_dir.iterdir():
            if not d.is_dir() or d.name.startswith("det_"):
                continue

            meta = ProjectMetaManager.get_meta(d)
            recipe = meta.get("saved_recipe") or {}
            framework = meta.get("framework") or recipe.get("framework")
            if not framework:
                try:
                    stack = detector.analyze(d, port=8000)
                    framework = stack.framework
                    meta["framework"] = framework
                    ProjectMetaManager.save_meta(d, meta)
                except Exception:
                    framework = "generic_python"

            proj_item = {
                "id": d.name,
                "name": meta.get("repo_name") or d.name,
                "owner": meta.get("repo_owner") or "Local",
                "repo_url": meta.get("repo_url") or "",
                "path": d.as_posix(),
                "framework": framework,
                "is_standard": meta.get("is_standard", True),
                "has_dockerfile": (d / "Dockerfile").exists(),
                "created_at": meta.get("created_at", d.stat().st_mtime),
                "last_run_at": meta.get("last_run_at", 0),
                "last_run_status": meta.get("last_run_status", "NEVER_RUN"),
                "saved_recipe": meta.get("saved_recipe")
            }

            if status and status != "all":
                if proj_item["last_run_status"].upper() != status.upper():
                    continue

            projects.append(proj_item)

    # Sorting
    if sort_by == "name_asc":
        projects.sort(key=lambda x: (x["name"] or "").lower())
    elif sort_by == "name_desc":
        projects.sort(key=lambda x: (x["name"] or "").lower(), reverse=True)
    elif sort_by == "status":
        order = {"SUCCESS": 1, "RUNNING": 2, "NEVER_RUN": 3, "STOPPED": 4, "FAILED": 5}
        projects.sort(key=lambda x: order.get(x["last_run_status"], 99))
    elif sort_by == "created":
        projects.sort(key=lambda x: x["created_at"] or 0, reverse=True)
    else:  # recent
        projects.sort(key=lambda x: (x["last_run_at"] or 0, x["created_at"] or 0), reverse=True)

    return projects

@router.delete("/projects/{project_name}")
def delete_project(project_name: str):
    import os
    import stat
    import shutil
    import subprocess

    target = settings.workspace_dir / project_name
    if not target.exists() or not target.is_dir():
        raise HTTPException(status_code=404, detail="Project not found")

    # 1. Stop any active processes associated with this workspace
    for run_id, proc in list(process_runner._processes.items()):
        try:
            if run_id in active_runs:
                process_runner.stop(run_id)
        except Exception:
            pass

    # 2. Windows-safe deletion: Clear read-only flags (especially for .git files)
    def _handle_readonly(func, path, exc_info):
        try:
            os.chmod(path, stat.S_IWRITE)
            func(path)
        except Exception:
            pass

    try:
        shutil.rmtree(target, onerror=_handle_readonly)
    except Exception:
        pass

    # 3. Fallback for Windows native force removal
    if target.exists():
        try:
            subprocess.run(f'cmd /c rmdir /s /q "{target}"', shell=True, check=False)
        except Exception:
            pass

    if target.exists():
        raise HTTPException(
            status_code=500,
            detail=f"Could not completely delete '{project_name}'. A process or background application may be locking a file."
        )

    return {"status": "deleted", "project": project_name}


@router.get("/ports")
async def get_active_ports():
    ports = await asyncio.to_thread(process_runner.list_active_ports, 3000, 9999)
    ws_root_norm = str(settings.workspace_dir.resolve()).replace("\\", "/").lower()

    # Map active_runs by port
    port_to_run = {}
    for r_id, r_data in active_runs.items():
        if r_data.get("status") in (StatusEnum.RUNNING, StatusEnum.INSTALLING):
            t_dir = r_data.get("target_dir")
            t_path = Path(t_dir) if t_dir else None
            meta = ProjectMetaManager.get_meta(t_path) if (t_path and t_path.exists()) else {}
            run_ports = r_data.get("ports") or ([r_data["port"]] if r_data.get("port") else [])
            for p_num in run_ports:
                port_to_run[int(p_num)] = {
                    "run_id": r_id,
                    "repo_name": meta.get("repo_name") or (t_path.name if t_path else "Managed Repo"),
                    "repo_owner": meta.get("repo_owner") or "Local",
                    "repo_url": meta.get("repo_url") or "",
                    "workspace_id": t_path.name if t_path else "",
                    "workspace_path": t_path.as_posix() if t_path else "",
                    "framework": r_data.get("framework") or meta.get("framework") or "python",
                    "status": r_data.get("status")
                }

    running_repos = []
    DEV_PROCESS_PREFIXES = (
        "python", "node", "uvicorn", "gunicorn", "flask", "streamlit",
        "gradio", "deno", "bun", "go", "java", "dotnet", "ruby", "php",
        "cargo", "nginx", "caddy", "httpd", "docker", "vite", "next"
    )
    OS_BG_PROCESSES = {
        "svchost.exe", "system", "spotify.exe", "anydesk.exe",
        "ntkdaemon.exe", "camera.remoteservice.exe", "orca.exe",
        "searchindexer.exe", "spoolsv.exe", "lsass.exe"
    }

    for item in ports:
        p = item["port"]
        proc_lower = (item.get("process_name") or "").lower()
        item["is_managed"] = False
        item["repo_name"] = None
        item["repo_owner"] = None
        item["repo_url"] = None
        item["workspace_id"] = None
        item["workspace_path"] = None
        item["framework"] = None

        if p == 7000:
            item["label"] = "Repo Runner Frontend (Protected)"
            item["category"] = "system"
        elif p == 7001:
            item["label"] = "Repo Runner Backend API (Protected)"
            item["category"] = "system"
        elif p in port_to_run:
            r_info = port_to_run[p]
            item["is_managed"] = True
            item["category"] = "repo"
            item["run_id"] = r_info["run_id"]
            item["repo_name"] = r_info["repo_name"]
            item["repo_owner"] = r_info["repo_owner"]
            item["repo_url"] = r_info["repo_url"]
            item["workspace_id"] = r_info["workspace_id"]
            item["workspace_path"] = r_info["workspace_path"]
            item["framework"] = r_info["framework"]
            item["label"] = f"Running Repo: {r_info['repo_name']}"
            running_repos.append(item)
        else:
            # Check if executable_path or command_line belongs to a Repo Runner workspace
            exec_norm = (item.get("executable_path") or "").replace("\\", "/")
            cmd_norm = (item.get("command_line") or "").replace("\\", "/")
            combined_lower = f"{exec_norm} {cmd_norm}".lower()

            matched_ws = None
            if ws_root_norm in combined_lower and settings.workspace_dir.exists():
                for ws_dir in settings.workspace_dir.iterdir():
                    if ws_dir.is_dir():
                        ws_path_lower = ws_dir.resolve().as_posix().lower()
                        if ws_path_lower in combined_lower:
                            matched_ws = ws_dir
                            break

            if matched_ws is not None:
                meta = ProjectMetaManager.get_meta(matched_ws)
                recipe = meta.get("saved_recipe") or {}
                item["is_managed"] = True
                item["category"] = "repo"
                item["repo_name"] = meta.get("repo_name") or matched_ws.name
                item["repo_owner"] = meta.get("repo_owner") or "Local"
                item["repo_url"] = meta.get("repo_url") or ""
                item["workspace_id"] = matched_ws.name
                item["workspace_path"] = matched_ws.as_posix()
                item["framework"] = meta.get("framework") or recipe.get("framework") or "python"
                item["label"] = f"Running Repo: {item['repo_name']}"
                running_repos.append(item)
            elif proc_lower in OS_BG_PROCESSES:
                item["category"] = "os_background"
                item["label"] = "OS / Desktop Background Service"
                item["is_protected"] = True
            elif proc_lower.startswith(DEV_PROCESS_PREFIXES) or (8000 <= p <= 8999) or (3000 <= p <= 4999):
                item["category"] = "external"
                item["label"] = "External Dev Server"
            else:
                item["category"] = "os_background"
                item["label"] = "Local Background Process"

    dev_ports = [item for item in ports if item["category"] in ("repo", "external", "system")]

    # Find suggested free port starting from 8000
    used_set = {item["port"] for item in ports}
    suggested = 8000
    while suggested in used_set or suggested in (7000, 7001):
        suggested += 1

    return {
        "ports": dev_ports,
        "all_ports": ports,
        "running_repos": running_repos,
        "running_repos_count": len(running_repos),
        "active_ports_count": len(dev_ports),
        "suggested_free_port": suggested
    }


@router.get("/ports/check/{port}")
async def check_port_status(port: int):
    info = await asyncio.to_thread(process_runner.inspect_port, port)
    if port == 7000:
        info["label"] = "Repo Runner Frontend (Protected)"
    elif port == 7001:
        info["label"] = "Repo Runner Backend API (Protected)"
    else:
        info["label"] = "Local Process"
    return info


@router.post("/ports/free/{port}")
async def free_target_port(port: int):
    if port in (7000, 7001):
        raise HTTPException(
            status_code=400,
            detail=f"Port {port} is reserved by Repo Runner system and cannot be terminated."
        )

    # Stop any tracked active_runs on this port
    for r_id, r_data in list(active_runs.items()):
        run_ports = r_data.get("ports") or ([int(r_data["port"])] if r_data.get("port") else [])
        if port in run_ports and r_data.get("status") in (StatusEnum.RUNNING, StatusEnum.INSTALLING, StatusEnum.CLONING):
            process_runner.stop(r_id)
            r_data["status"] = StatusEnum.STOPPED
            r_data["is_healthy"] = False

    killed_pids = await asyncio.to_thread(process_runner.free_port, port)
    return {
        "status": "freed",
        "port": port,
        "killed_pids": killed_pids
    }
