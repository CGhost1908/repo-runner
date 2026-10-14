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

        # Check Static HTML / Web projects
        if (repo_dir / "index.html").exists():
            return StackInfo(
                framework="static_html",
                is_standard=True,
                install_command=None,
                run_command=f"python -m http.server {port}",
                has_dockerfile=has_dockerfile,
                entrypoint="index.html"
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
        is_fastapi = "fastapi" in req_content
        if not is_fastapi and (repo_dir / "main.py").exists():
            is_fastapi = "fastapi" in (repo_dir / "main.py").read_text(encoding="utf-8", errors="ignore").lower()

        if is_fastapi:
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
        is_flask = "flask" in req_content
        if not is_flask and (repo_dir / "app.py").exists():
            is_flask = "flask" in (repo_dir / "app.py").read_text(encoding="utf-8", errors="ignore").lower()

        if is_flask:
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
