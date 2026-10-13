# Repo Runner MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the MVP of Repo Runner featuring a Python FastAPI backend that clones Git repositories or scans local paths, detects Python frameworks, provisions isolated virtual environments (`.venv`), installs dependencies, injects user-defined ports, launches the process, verifies health on the specified port, and streams live terminal logs via WebSocket to a desktop-ready dashboard.

**Architecture:** A modular Python FastAPI backend acting as the engine. It handles repo ingestion, dependency inspection, virtual environment isolation, non-blocking subprocess execution with live stdout/stderr capture, port healthcheck polling, and real-time WebSocket event dispatching. The UI connects to this engine via REST and WebSockets.

**Tech Stack:** Python 3.10+, FastAPI, Uvicorn, WebSockets, Pydantic v2, Pytest, Vanilla JS / Pure Semantic CSS (Embedded UI).

## Global Constraints

- Backend must be 100% Python.
- Python virtual environment is isolated inside the project directory (`.venv`).
- Configurable default ports: Backend `8000`, Frontend `3000`, with fallback support.
- All live logs and HITL status updates stream over WebSocket `/ws/logs/{run_id}`.
- SQLite / Standalone projects are targeted for Phase 1.

---

### Task 1: Project Setup, Configuration & Models

**Files:**
- Create: `pyproject.toml`
- Create: `backend/__init__.py`
- Create: `backend/config.py`
- Create: `backend/models.py`
- Create: `tests/__init__.py`
- Create: `tests/test_config.py`

**Interfaces:**
- Produces: `Settings` object in `backend.config` (with `workspace_dir`, `default_backend_port`, `default_frontend_port`).
- Produces: `Pydantic` models in `backend.models`: `RunRequest`, `RunStatus`, `HitlDecisionRequest`, `LogMessage`.

- [ ] **Step 1: Write failing test for configuration and models**

```python
# tests/test_config.py
from backend.config import get_settings
from backend.models import RunRequest, RunStatus, LogMessage

def test_settings_default_values():
    settings = get_settings()
    assert settings.default_backend_port == 8000
    assert settings.default_frontend_port == 3000
    assert settings.workspace_dir.exists()

def test_run_request_validation():
    req = RunRequest(repo_url="https://github.com/example/sample.git", port=8000)
    assert req.repo_url == "https://github.com/example/sample.git"
    assert req.port == 8000
    assert req.local_path is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_config.py -v`  
Expected: FAIL (ModuleNotFoundError or Import error)

- [ ] **Step 3: Write minimal implementation**

```toml
# pyproject.toml
[project]
name = "repo-runner"
version = "0.1.0"
description = "Automated repo runner and environment orchestrator"
authors = [{ name = "Repo Runner Team" }]
dependencies = [
    "fastapi>=0.110.0",
    "uvicorn[standard]>=0.28.0",
    "pydantic>=2.6.0",
    "pydantic-settings>=2.2.0",
    "httpx>=0.27.0",
    "websockets>=12.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0.0",
    "pytest-asyncio>=0.23.0",
]
```

```python
# backend/__init__.py
"""Repo Runner Backend Package"""
```

```python
# backend/config.py
from pathlib import Path
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    workspace_dir: Path = Path.home() / ".repo-runner" / "workspaces"
    default_backend_port: int = 8000
    default_frontend_port: int = 3000
    port_pool: list[int] = [8000, 3000, 8001, 8002]

    class Config:
        env_prefix = "REPO_RUNNER_"

def get_settings() -> Settings:
    settings = Settings()
    settings.workspace_dir.mkdir(parents=True, exist_ok=True)
    return settings
```

```python
# backend/models.py
from enum import Enum
from pathlib import Path
from typing import Optional
from pydantic import BaseModel, Field

class ExecutionMode(str, Enum):
    STANDARD = "standard"
    DEEP_AI = "deep_ai"

class ExecutionEnvironment(str, Enum):
    VENV = "venv"
    DOCKER = "docker"

class StatusEnum(str, Enum):
    IDLE = "idle"
    CLONING = "cloning"
    ANALYZING = "analyzing"
    AWAITING_HITL = "awaiting_hitl"
    INSTALLING = "installing"
    RUNNING = "running"
    STOPPED = "stopped"
    FAILED = "failed"

class RunRequest(BaseModel):
    repo_url: Optional[str] = None
    local_path: Optional[str] = None
    port: int = Field(default=8000, description="Target port for the application")
    mode: ExecutionMode = ExecutionMode.STANDARD
    preferred_env: Optional[ExecutionEnvironment] = None

class HitlDecisionRequest(BaseModel):
    run_id: str
    environment: ExecutionEnvironment
    proceed_deep_mode: bool = True

class LogMessage(BaseModel):
    run_id: str
    level: str = "INFO"
    message: str
    timestamp: float
```

```python
# tests/__init__.py
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_config.py -v`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add pyproject.toml backend/ tests/
git commit -m "feat: setup project config, models, and initial tests"
```

---

### Task 2: Repo Ingestion (Git Clone & Local Path Validator)

**Files:**
- Create: `backend/services/repo_manager.py`
- Create: `tests/test_repo_manager.py`

**Interfaces:**
- Consumes: `Settings` from `backend.config`, `RunRequest` from `backend.models`.
- Produces: `RepoManager.prepare_repo(request: RunRequest, run_id: str) -> Path`

- [ ] **Step 1: Write failing test for repo manager**

```python
# tests/test_repo_manager.py
import pytest
from pathlib import Path
from backend.config import Settings
from backend.models import RunRequest
from backend.services.repo_manager import RepoManager

def test_prepare_repo_from_existing_local_path(tmp_path):
    sample_dir = tmp_path / "my_project"
    sample_dir.mkdir()
    (sample_dir / "main.py").write_text("print('hello')")

    settings = Settings(workspace_dir=tmp_path / "workspaces")
    manager = RepoManager(settings)

    req = RunRequest(local_path=str(sample_dir))
    target_path = manager.prepare_repo(req, run_id="run-123")

    assert target_path == sample_dir
    assert (target_path / "main.py").exists()

def test_prepare_repo_invalid_local_path(tmp_path):
    settings = Settings(workspace_dir=tmp_path / "workspaces")
    manager = RepoManager(settings)
    req = RunRequest(local_path=str(tmp_path / "non_existing"))

    with pytest.raises(FileNotFoundError):
        manager.prepare_repo(req, run_id="run-456")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_repo_manager.py -v`  
Expected: FAIL with `ModuleNotFoundError: No module named 'backend.services'`

- [ ] **Step 3: Write minimal implementation**

```python
# backend/services/__init__.py
"""Services package"""
```

```python
# backend/services/repo_manager.py
import re
import subprocess
from pathlib import Path
from backend.config import Settings
from backend.models import RunRequest

class RepoManager:
    def __init__(self, settings: Settings):
        self.settings = settings

    def prepare_repo(self, request: RunRequest, run_id: str) -> Path:
        if request.local_path:
            local_path = Path(request.local_path).resolve()
            if not local_path.exists() or not local_path.is_dir():
                raise FileNotFoundError(f"Local path does not exist or is not a directory: {request.local_path}")
            return local_path

        if request.repo_url:
            return self._clone_repo(request.repo_url, run_id)

        raise ValueError("Either 'repo_url' or 'local_path' must be provided.")

    def _clone_repo(self, repo_url: str, run_id: str) -> Path:
        # Sanitize folder name from repo url
        repo_name = re.sub(r"[^a-zA-Z0-9_\-]", "_", repo_url.rstrip("/").split("/")[-1].removesuffix(".git"))
        target_dir = self.settings.workspace_dir / f"{run_id}_{repo_name}"
        target_dir.mkdir(parents=True, exist_ok=True)

        # Execute git clone
        cmd = ["git", "clone", "--depth", "1", repo_url, str(target_dir)]
        result = subprocess.run(cmd, capture_output=True, text=True, check=False)
        if result.returncode != 0:
            raise RuntimeError(f"Git clone failed: {result.stderr.strip()}")

        return target_dir
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_repo_manager.py -v`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/services/ tests/test_repo_manager.py
git commit -m "feat: implement repo manager for git cloning and local directory resolution"
```

---

### Task 3: Python Stack Detector & Run Command Generator

**Files:**
- Create: `backend/services/detector.py`
- Create: `tests/test_detector.py`

**Interfaces:**
- Consumes: Project directory `Path`, target `port: int`.
- Produces: `StackInfo` dataclass (contains `framework`, `install_commands`, `run_command`, `has_dockerfile`, `is_standard`).

- [ ] **Step 1: Write failing test for detector**

```python
# tests/test_detector.py
from pathlib import Path
from backend.services.detector import StackDetector

def test_detect_fastapi_project(tmp_path):
    (tmp_path / "requirements.txt").write_text("fastapi\nuvicorn\n")
    (tmp_path / "main.py").write_text("from fastapi import FastAPI\napp = FastAPI()\n")

    detector = StackDetector()
    info = detector.analyze(tmp_path, port=8000)

    assert info.is_standard is True
    assert info.framework == "fastapi"
    assert "pip install -r requirements.txt" in info.install_command
    assert "--port 8000" in info.run_command

def test_detect_flask_project(tmp_path):
    (tmp_path / "requirements.txt").write_text("flask\n")
    (tmp_path / "app.py").write_text("from flask import Flask\napp = Flask(__name__)\n")

    detector = StackDetector()
    info = detector.analyze(tmp_path, port=5000)

    assert info.is_standard is True
    assert info.framework == "flask"
    assert "--port=5000" in info.run_command or "--port 5000" in info.run_command

def test_detect_unknown_project(tmp_path):
    (tmp_path / "main.rs").write_text("fn main() {}")

    detector = StackDetector()
    info = detector.analyze(tmp_path, port=8000)

    assert info.is_standard is False
    assert info.framework == "unknown"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_detector.py -v`  
Expected: FAIL with `ModuleNotFoundError: No module named 'backend.services.detector'`

- [ ] **Step 3: Write minimal implementation**

```python
# backend/services/detector.py
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

@dataclass
class StackInfo:
    framework: str
    is_standard: bool
    install_command: Optional[str]
    run_command: Optional[str]
    has_dockerfile: bool
    entrypoint: Optional[str] = None

class StackDetector:
    def analyze(self, repo_dir: Path, port: int = 8000) -> StackInfo:
        has_dockerfile = (repo_dir / "Dockerfile").exists() or (repo_dir / "docker-compose.yml").exists()

        req_txt = repo_dir / "requirements.txt"
        pyproject = repo_dir / "pyproject.toml"

        # Check Python
        if req_txt.exists() or pyproject.exists():
            return self._analyze_python(repo_dir, port, has_dockerfile)

        # Check Node.js
        package_json = repo_dir / "package.json"
        if package_json.exists():
            return StackInfo(
                framework="node",
                is_standard=True,
                install_command="npm install",
                run_command=f"PORT={port} npm start",
                has_dockerfile=has_dockerfile
            )

        # Unknown / Deep AI Mode
        return StackInfo(
            framework="unknown",
            is_standard=False,
            install_command=None,
            run_command=None,
            has_dockerfile=has_dockerfile
        )

    def _analyze_python(self, repo_dir: Path, port: int, has_dockerfile: bool) -> StackInfo:
        req_content = ""
        if (repo_dir / "requirements.txt").exists():
            req_content = (repo_dir / "requirements.txt").read_text(encoding="utf-8", errors="ignore").lower()

        install_cmd = "pip install -r requirements.txt" if (repo_dir / "requirements.txt").exists() else "pip install ."

        # Detect FastAPI
        if "fastapi" in req_content or (repo_dir / "main.py").exists() and "fastapi" in (repo_dir / "main.py").read_text(encoding="utf-8", errors="ignore").lower():
            run_cmd = f"uvicorn main:app --host 0.0.0.0 --port {port}"
            return StackInfo(
                framework="fastapi",
                is_standard=True,
                install_command=install_cmd,
                run_command=run_cmd,
                has_dockerfile=has_dockerfile,
                entrypoint="main.py"
            )

        # Detect Flask
        if "flask" in req_content or (repo_dir / "app.py").exists():
            run_cmd = f"flask run --host=0.0.0.0 --port={port}"
            return StackInfo(
                framework="flask",
                is_standard=True,
                install_command=install_cmd,
                run_command=run_cmd,
                has_dockerfile=has_dockerfile,
                entrypoint="app.py"
            )

        # Detect Django
        if (repo_dir / "manage.py").exists():
            run_cmd = f"python manage.py runserver 0.0.0.0:{port}"
            return StackInfo(
                framework="django",
                is_standard=True,
                install_command=install_cmd,
                run_command=run_cmd,
                has_dockerfile=has_dockerfile,
                entrypoint="manage.py"
            )

        # Generic Python
        entry = "main.py" if (repo_dir / "main.py").exists() else "app.py" if (repo_dir / "app.py").exists() else None
        run_cmd = f"python {entry} --port {port}" if entry else None
        return StackInfo(
            framework="generic_python",
            is_standard=True if entry else False,
            install_command=install_cmd,
            run_command=run_cmd,
            has_dockerfile=has_dockerfile,
            entrypoint=entry
        )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_detector.py -v`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/services/detector.py tests/test_detector.py
git commit -m "feat: implement stack detector for framework and port-injected commands"
```

---

### Task 4: Virtual Environment Manager & Dependency Installer

**Files:**
- Create: `backend/services/env_manager.py`
- Create: `tests/test_env_manager.py`

**Interfaces:**
- Consumes: Project directory `Path`.
- Produces: `EnvManager.create_venv(repo_dir: Path) -> Path` (returns path to python executable).
- Produces: `EnvManager.install_dependencies(repo_dir: Path, install_cmd: str, log_callback) -> bool`

- [ ] **Step 1: Write failing test for env manager**

```python
# tests/test_env_manager.py
from pathlib import Path
from backend.services.env_manager import EnvManager

def test_venv_paths(tmp_path):
    manager = EnvManager()
    python_bin = manager.get_python_bin(tmp_path)
    assert python_bin.parent.name.lower() in ["scripts", "bin"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_env_manager.py -v`  
Expected: FAIL with `ModuleNotFoundError: No module named 'backend.services.env_manager'`

- [ ] **Step 3: Write minimal implementation**

```python
# backend/services/env_manager.py
import os
import sys
import subprocess
from pathlib import Path
from typing import Callable, Optional

class EnvManager:
    def get_python_bin(self, repo_dir: Path) -> Path:
        venv_dir = repo_dir / ".venv"
        if os.name == "nt":
            return venv_dir / "Scripts" / "python.exe"
        return venv_dir / "bin" / "python"

    def create_venv(self, repo_dir: Path, log_cb: Optional[Callable[[str], None]] = None) -> Path:
        venv_dir = repo_dir / ".venv"
        python_bin = self.get_python_bin(repo_dir)

        if not python_bin.exists():
            if log_cb:
                log_cb(f"Creating isolated virtual environment at {venv_dir}...")
            cmd = [sys.executable, "-m", "venv", str(venv_dir)]
            subprocess.run(cmd, check=True, capture_output=True)
            if log_cb:
                log_cb("Virtual environment created successfully.")

        return python_bin

    def install_dependencies(
        self,
        repo_dir: Path,
        install_command: str,
        log_cb: Optional[Callable[[str], None]] = None
    ) -> bool:
        python_bin = self.get_python_bin(repo_dir)
        if not python_bin.exists():
            self.create_venv(repo_dir, log_cb)

        # Replace 'pip' with the venv's python -m pip
        venv_pip_cmd = [str(python_bin), "-m", "pip"] + install_command.split()[1:]

        if log_cb:
            log_cb(f"Running installation: {' '.join(venv_pip_cmd)}")

        process = subprocess.Popen(
            venv_pip_cmd,
            cwd=str(repo_dir),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
        )

        if process.stdout:
            for line in process.stdout:
                if log_cb:
                    log_cb(line.rstrip())

        process.wait()
        return process.returncode == 0
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_env_manager.py -v`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/services/env_manager.py tests/test_env_manager.py
git commit -m "feat: implement virtual environment manager and dependency installer"
```

---

### Task 5: Process Runner, Port Healthcheck & Lifecycle Controller

**Files:**
- Create: `backend/services/process_runner.py`
- Create: `tests/test_process_runner.py`

**Interfaces:**
- Consumes: Target command, working directory `Path`, port `int`, `log_callback`.
- Produces: `ProcessRunner.start(run_id, command, cwd, port, log_cb)`, `ProcessRunner.stop(run_id)`, `ProcessRunner.is_healthy(port: int) -> bool`

- [ ] **Step 1: Write failing test for healthcheck and runner**

```python
# tests/test_process_runner.py
import pytest
from backend.services.process_runner import ProcessRunner

@pytest.mark.asyncio
async def test_healthcheck_unreachable_port():
    runner = ProcessRunner()
    healthy = await runner.check_health(port=59999, timeout_seconds=0.5)
    assert healthy is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_process_runner.py -v`  
Expected: FAIL with `ModuleNotFoundError: No module named 'backend.services.process_runner'`

- [ ] **Step 3: Write minimal implementation**

```python
# backend/services/process_runner.py
import asyncio
import subprocess
import httpx
from pathlib import Path
from typing import Callable, Optional

class ProcessRunner:
    def __init__(self):
        self._processes: dict[str, subprocess.Popen] = {}

    def start(
        self,
        run_id: str,
        cmd: list[str],
        cwd: Path,
        log_cb: Optional[Callable[[str], None]] = None
    ) -> subprocess.Popen:
        if run_id in self._processes:
            self.stop(run_id)

        process = subprocess.Popen(
            cmd,
            cwd=str(cwd),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
        )
        self._processes[run_id] = process

        if log_cb and process.stdout:
            def _stream_output():
                for line in iter(process.stdout.readline, ""):
                    log_cb(line.rstrip())
                process.stdout.close()

            import threading
            threading.Thread(target=_stream_output, daemon=True).start()

        return process

    def stop(self, run_id: str) -> bool:
        process = self._processes.get(run_id)
        if not process:
            return False

        try:
            process.terminate()
            process.wait(timeout=3)
        except Exception:
            process.kill()
        finally:
            del self._processes[run_id]
        return True

    def get_process(self, run_id: str) -> Optional[subprocess.Popen]:
        return self._processes.get(run_id)

    async def check_health(self, port: int, timeout_seconds: float = 5.0) -> bool:
        url = f"http://127.0.0.1:{port}"
        start_time = asyncio.get_event_loop().time()

        async with httpx.AsyncClient() as client:
            while (asyncio.get_event_loop().time() - start_time) < timeout_seconds:
                try:
                    res = await client.get(url, timeout=1.0)
                    if res.status_code in [200, 301, 302, 404]:
                        return True
                except (httpx.ConnectError, httpx.TimeoutException):
                    await asyncio.sleep(0.5)
        return False
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_process_runner.py -v`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/services/process_runner.py tests/test_process_runner.py
git commit -m "feat: implement process runner with background streaming and health checking"
```

---

### Task 6: FastAPI WebSocket & REST API Endpoints

**Files:**
- Create: `backend/api/__init__.py`
- Create: `backend/api/routes.py`
- Create: `backend/main.py`
- Create: `tests/test_api.py`

**Interfaces:**
- Produces: REST endpoints `POST /api/run`, `POST /api/stop`, `GET /api/status/{run_id}`.
- Produces: WebSocket endpoint `/ws/logs/{run_id}`.

- [ ] **Step 1: Write failing test for REST API**

```python
# tests/test_api.py
from fastapi.testclient import TestClient
from backend.main import app

def test_api_status_idle():
    client = TestClient(app)
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_api.py -v`  
Expected: FAIL (cannot import `app` from `backend.main`)

- [ ] **Step 3: Write minimal implementation**

```python
# backend/api/__init__.py
"""API Package"""
```

```python
# backend/api/routes.py
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

# In-memory orchestrator state
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
        for ws in ws_connections[run_id]:
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
    def log(msg: str):
        asyncio.run_coroutine_threadsafe(broadcast_log(run_id, msg), asyncio.get_event_loop())

    try:
        log("--> Adım 1: Repo hazırlanıyor...")
        target_dir = repo_manager.prepare_repo(request, run_id)
        log(f"Repo hazırlandı: {target_dir}")

        log("--> Adım 2: Teknoloji stack analizi yapılıyor...")
        stack_info = detector.analyze(target_dir, port=request.port)
        active_runs[run_id]["framework"] = stack_info.framework
        log(f"Tespit edilen çatı: {stack_info.framework} (Standart Mod: {stack_info.is_standard})")

        if not stack_info.is_standard:
            log("⚠️ UYARI: Bu proje standart şablonlarımız dışında. AI Derin Modu gerekli.")
            active_runs[run_id]["status"] = StatusEnum.AWAITING_HITL
            return

        log("--> Adım 3: Sanal ortam hazırlanıyor ve bağımlılıklar yükleniyor...")
        active_runs[run_id]["status"] = StatusEnum.INSTALLING
        python_bin = env_manager.create_venv(target_dir, log_cb=log)
        if stack_info.install_command:
            success = env_manager.install_dependencies(target_dir, stack_info.install_command, log_cb=log)
            if not success:
                log("❌ HATA: Bağımlılık kurulumu başarısız oldu!")
                active_runs[run_id]["status"] = StatusEnum.FAILED
                return

        log(f"--> Adım 4: Uygulama başlatılıyor (Port: {request.port})...")
        active_runs[run_id]["status"] = StatusEnum.RUNNING
        cmd = stack_info.run_command.split()
        if cmd[0] == "uvicorn":
            cmd[0] = str(target_dir / ".venv" / "Scripts" / "uvicorn.exe") if (target_dir / ".venv" / "Scripts" / "uvicorn.exe").exists() else str(python_bin)
            if cmd[0] == str(python_bin):
                cmd = [str(python_bin), "-m", "uvicorn"] + stack_info.run_command.split()[1:]

        process_runner.start(run_id, cmd, target_dir, log_cb=log)

        log("--> Port sağlık kontrolü yapılıyor...")
        healthy = await process_runner.check_health(request.port, timeout_seconds=8.0)
        active_runs[run_id]["is_healthy"] = healthy
        if healthy:
            log(f"✅ Başarılı! Uygulama http://localhost:{request.port} üzerinde canlı yayında.")
        else:
            log(f"⚠️ Port henüz yanıt vermedi veya uygulama sessiz başlatıldı.")

    except Exception as e:
        log(f"❌ Kritik Hata: {str(e)}")
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
```

```python
# backend/main.py
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from backend.api.routes import router, ws_connections, broadcast_log

app = FastAPI(title="Repo Runner Engine")
app.include_router(router)

static_dir = Path(__file__).parent / "static"
static_dir.mkdir(parents=True, exist_ok=True)
app.mount("/ui", StaticFiles(directory=str(static_dir), html=True), name="static")

@app.websocket("/ws/logs/{run_id}")
async def websocket_logs(websocket: WebSocket, run_id: str):
    await websocket.accept()
    if run_id not in ws_connections:
        ws_connections[run_id] = []
    ws_connections[run_id].append(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_connections[run_id].remove(websocket)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_api.py -v`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/api/ backend/main.py tests/test_api.py
git commit -m "feat: implement FastAPI REST routes and WebSocket live log broadcasting"
```

---

### Task 7: Desktop Dashboard UI & Embedded Preview

**Files:**
- Create: `backend/static/index.html`
- Create: `backend/static/style.css`
- Create: `backend/static/app.js`

**Interfaces:**
- Consumes: REST `/api/run`, `/api/stop`, `/api/status`, WebSocket `/ws/logs/{run_id}`.
- Produces: Clean responsive dashboard with Git URL input, local folder selector, live console, port status card, and embedded web preview iframe.

- [ ] **Step 1: Create static UI files**

```html
<!-- backend/static/index.html -->
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Repo Runner</title>
  <link rel="stylesheet" href="/ui/style.css">
</head>
<body class="app-body">
  <div class="app-layout">
    <header class="app-header">
      <div class="header-branding">
        <h1 class="header-title">
          <span class="header-icon">🚀</span> Repo Runner
        </h1>
        <p class="header-subtitle">Otonom Repo Analiz ve Çalıştırma Motoru</p>
      </div>
      <div id="statusBadge" class="status-badge status-ready">
        Hazır
      </div>
    </header>

    <!-- Run Controls Panel -->
    <section class="controls-panel">
      <div class="controls-grid">
        <div class="form-group repo-group">
          <label class="form-label" for="repoInput">Git Repo Linki veya Yerel Dizin</label>
          <input id="repoInput" type="text" placeholder="https://github.com/kullanici/repo.git veya C:/projeler/app" class="form-input">
        </div>
        <div class="form-group port-group">
          <label class="form-label" for="portInput">Hedef Port</label>
          <input id="portInput" type="number" value="8000" class="form-input">
        </div>
      </div>
      <div class="button-group">
        <button id="runBtn" class="btn btn-primary">
          ▶ Projeyi Analiz Et ve Çalıştır
        </button>
        <button id="stopBtn" class="btn btn-danger hidden">
          ⏹ Durdur
        </button>
      </div>
    </section>

    <!-- Live Grid (Terminal Logs & Preview Window) -->
    <main class="dashboard-grid">
      <!-- Terminal Console Panel -->
      <section class="panel terminal-panel">
        <div class="panel-header">
          <span class="panel-title">Canlı Terminal Logları</span>
          <button id="clearLogBtn" class="btn-link">Temizle</button>
        </div>
        <div id="terminalLog" class="terminal-body">
          <div class="log-placeholder">// Beklemede. Başlatmak için yukarıdaki formu kullanın.</div>
        </div>
      </section>

      <!-- Preview Window Panel -->
      <section class="panel preview-panel">
        <div class="panel-header">
          <span class="panel-title">Önizleme Ekranı</span>
          <a id="openBrowserLink" href="#" target="_blank" class="btn-link preview-link hidden">Tarayıcıda Aç ↗</a>
        </div>
        <div id="previewContainer" class="preview-body">
          <p class="preview-placeholder">Uygulama çalıştığında web görüntüsü burada belirecektir.</p>
        </div>
      </section>
    </main>
  </div>
  <script src="/ui/app.js"></script>
</body>
</html>
```

```css
/* backend/static/style.css */
:root {
  --bg-main: #020617;
  --bg-card: #0f172a;
  --bg-card-header: #020617;
  --border-color: #1e293b;
  --border-focus: #6366f1;
  --text-main: #f8fafc;
  --text-muted: #94a3b8;
  --text-dim: #64748b;
  --accent-primary: #4f46e5;
  --accent-primary-hover: #4338ca;
  --accent-danger: #e11d48;
  --accent-danger-hover: #be123c;
  --accent-terminal: #34d399;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body.app-body {
  background-color: var(--bg-main);
  color: var(--text-main);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  min-height: 100vh;
}

.app-layout {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 16px;
}

.header-title {
  font-size: 1.5rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-subtitle {
  font-size: 0.875rem;
  color: var(--text-muted);
  margin-top: 4px;
}

.status-badge {
  padding: 6px 14px;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
  background-color: #1e293b;
  color: var(--text-muted);
}

.status-badge.status-ready { background-color: #1e293b; color: var(--text-muted); }
.status-badge.status-processing { background-color: #451a03; color: #fdba74; }
.status-badge.status-running { background-color: #064e3b; color: #6ee7b7; }
.status-badge.status-stopped { background-color: #4c0519; color: #fda4af; }

.controls-panel {
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.controls-grid {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 16px;
}

@media (max-width: 768px) {
  .controls-grid { grid-template-columns: 1fr; }
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
}

.form-input {
  background-color: var(--bg-card-header);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 10px 14px;
  color: var(--text-main);
  font-size: 0.875rem;
  outline: none;
  transition: border-color 0.2s;
}

.form-input:focus {
  border-color: var(--border-focus);
}

.button-group {
  display: flex;
  gap: 12px;
}

.btn {
  padding: 10px 18px;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: background-color 0.2s;
}

.btn-primary {
  flex: 1;
  background-color: var(--accent-primary);
  color: #ffffff;
}

.btn-primary:hover {
  background-color: var(--accent-primary-hover);
}

.btn-danger {
  background-color: var(--accent-danger);
  color: #ffffff;
}

.btn-danger:hover {
  background-color: var(--accent-danger-hover);
}

.dashboard-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

@media (max-width: 992px) {
  .dashboard-grid { grid-template-columns: 1fr; }
}

.panel {
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  height: 480px;
  overflow: hidden;
}

.panel-header {
  background-color: var(--bg-card-header);
  border-bottom: 1px solid var(--border-color);
  padding: 12px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.panel-title {
  font-size: 0.75rem;
  font-family: monospace;
  font-weight: 600;
  color: var(--text-muted);
}

.btn-link {
  background: none;
  border: none;
  font-size: 0.75rem;
  color: var(--text-dim);
  cursor: pointer;
  text-decoration: none;
}

.btn-link:hover {
  color: var(--text-main);
}

.preview-link {
  color: var(--accent-primary);
}

.terminal-body {
  background-color: #020617;
  padding: 16px;
  font-family: monospace;
  font-size: 0.75rem;
  color: var(--accent-terminal);
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  user-select: text;
}

.log-placeholder {
  color: var(--text-dim);
}

.preview-body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #020617;
}

.preview-placeholder {
  font-size: 0.75rem;
  color: var(--text-dim);
}

.preview-iframe {
  width: 100%;
  height: 100%;
  border: none;
}

.hidden {
  display: none !important;
}
```

```javascript
// backend/static/app.js
let currentRunId = null;
let ws = null;

const runBtn = document.getElementById("runBtn");
const stopBtn = document.getElementById("stopBtn");
const repoInput = document.getElementById("repoInput");
const portInput = document.getElementById("portInput");
const terminalLog = document.getElementById("terminalLog");
const statusBadge = document.getElementById("statusBadge");
const previewContainer = document.getElementById("previewContainer");
const openBrowserLink = document.getElementById("openBrowserLink");

function appendLog(text) {
  const line = document.createElement("div");
  line.textContent = text;
  terminalLog.appendChild(line);
  terminalLog.scrollTop = terminalLog.scrollHeight;
}

runBtn.addEventListener("click", async () => {
  const value = repoInput.value.trim();
  const port = parseInt(portInput.value.trim(), 10) || 8000;
  if (!value) {
    alert("Lütfen bir repo linki veya yerel klasör yolu girin!");
    return;
  }

  const payload = value.startsWith("http") ? { repo_url: value, port } : { local_path: value, port };
  terminalLog.innerHTML = "";
  appendLog(`[Sistem] Başlatılıyor: ${value}`);

  statusBadge.className = "status-badge status-processing";
  statusBadge.textContent = "İşleniyor...";
  runBtn.disabled = true;

  try {
    const res = await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    currentRunId = data.run_id;

    stopBtn.classList.remove("hidden");
    connectWebSocket(currentRunId, port);
  } catch (err) {
    appendLog(`[Hata] Sunucuya bağlanılamadı: ${err.message}`);
    runBtn.disabled = false;
  }
});

stopBtn.addEventListener("click", async () => {
  if (!currentRunId) return;
  await fetch(`/api/stop/${currentRunId}`, { method: "POST" });
  appendLog("[Sistem] Uygulama durduruldu.");
  stopBtn.classList.add("hidden");
  runBtn.disabled = false;
  statusBadge.className = "status-badge status-stopped";
  statusBadge.textContent = "Durduruldu";
});

function connectWebSocket(runId, port) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${protocol}//${window.location.host}/ws/logs/${runId}`);

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    appendLog(data.message);

    if (data.message.includes("canlı yayında")) {
      statusBadge.className = "status-badge status-running";
      statusBadge.textContent = `Çalışıyor (${port})`;
      showPreview(port);
    }
  };

  ws.onclose = () => {
    runBtn.disabled = false;
  };
}

function showPreview(port) {
  const url = `http://localhost:${port}`;
  openBrowserLink.href = url;
  openBrowserLink.classList.remove("hidden");
  previewContainer.innerHTML = `<iframe src="${url}" class="preview-iframe"></iframe>`;
}
```

- [ ] **Step 2: Commit UI files**

```bash
git add backend/static/
git commit -m "feat: add desktop-ready web dashboard with live terminal stream and iframe preview"
```

---

### Task 8: Verification & End-to-End Test

- [ ] **Step 1: Run complete test suite**

Run: `pytest tests/ -v`  
Expected: All tests pass.

- [ ] **Step 2: Smoke test FastAPI server start**

Run: `uvicorn backend.main:app --port 8000` (or test client check)  
Expected: Server boots and `/ui` serves `index.html`.

- [ ] **Step 3: Final MVP Commit**

```bash
git add .
git commit -m "chore: complete MVP implementation of repo runner"
```
