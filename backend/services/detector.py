from dataclasses import dataclass, field
import json
from pathlib import Path
from typing import Optional, List

@dataclass
class StackInfo:
    framework: str
    is_standard: bool
    install_command: Optional[str]
    run_command: Optional[str]
    has_dockerfile: bool
    entrypoint: Optional[str] = None
    detected_files: List[str] = field(default_factory=list)
    services: List[dict] = field(default_factory=list)

class StackDetector:
    def _find_entrypoint(self, repo_dir: Path, candidates: List[str]) -> Optional[str]:
        # 1. Check root directory first
        for name in candidates:
            if (repo_dir / name).exists():
                return name
        # 2. Check common subdirectories (src/, app/, backend/, server/, api/)
        for sub in ["src", "app", "backend", "server", "api"]:
            sub_dir = repo_dir / sub
            if sub_dir.exists() and sub_dir.is_dir():
                for name in candidates:
                    if (sub_dir / name).exists():
                        return f"{sub}/{name}"
        return None

    def _inspect_package_json(self, pkg_path: Path, default_port: int) -> dict:
        """
        Inspects a package.json file to determine whether it is a Frontend or Backend Node service,
        its framework (vite, nextjs, react, vue, express, node), and optimal install/run commands.
        """
        try:
            data = json.loads(pkg_path.read_text(encoding="utf-8", errors="ignore"))
        except Exception:
            data = {}

        scripts = data.get("scripts") or {}
        deps = {}
        if isinstance(data.get("dependencies"), dict):
            deps.update(data["dependencies"])
        if isinstance(data.get("devDependencies"), dict):
            deps.update(data["devDependencies"])

        dep_keys = {k.lower() for k in deps.keys()}
        dev_script = str(scripts.get("dev") or "")
        start_script = str(scripts.get("start") or "")

        is_vite = "vite" in dep_keys or "vite" in dev_script
        is_next = "next" in dep_keys or "next" in dev_script
        is_cra = "react-scripts" in dep_keys
        is_vue = "@vue/cli-service" in dep_keys or "vue" in dep_keys
        is_astro = "astro" in dep_keys
        is_express = any(k in dep_keys for k in ("express", "fastify", "@nestjs/core", "koa"))

        if is_vite:
            return {
                "role": "frontend",
                "name": "Frontend Client (Vite)",
                "framework": "vite",
                "install_command": "npm install",
                "run_command": f"npm run dev -- --host 0.0.0.0 --port {default_port}",
                "port": default_port
            }
        if is_next:
            return {
                "role": "frontend",
                "name": "Frontend Web (Next.js)",
                "framework": "nextjs",
                "install_command": "npm install",
                "run_command": f"npm run dev -- -p {default_port}",
                "port": default_port
            }
        if is_cra:
            return {
                "role": "frontend",
                "name": "Frontend Client (React)",
                "framework": "react",
                "install_command": "npm install",
                "run_command": f"PORT={default_port} npm start",
                "port": default_port
            }
        if is_astro:
            return {
                "role": "frontend",
                "name": "Frontend Client (Astro)",
                "framework": "astro",
                "install_command": "npm install",
                "run_command": f"npm run dev -- --host 0.0.0.0 --port {default_port}",
                "port": default_port
            }
        if is_vue:
            return {
                "role": "frontend",
                "name": "Frontend Client (Vue)",
                "framework": "vue",
                "install_command": "npm install",
                "run_command": f"npm run dev -- --port {default_port}" if "dev" in scripts else f"npm run serve -- --port {default_port}",
                "port": default_port
            }
        if is_express and "react" not in dep_keys:
            run_cmd = "npm run dev" if "dev" in scripts else f"PORT={default_port} npm start"
            return {
                "role": "backend",
                "name": "Backend API (Node.js)",
                "framework": "node",
                "install_command": "npm install",
                "run_command": run_cmd,
                "port": default_port
            }

        # Fallback Node package.json
        run_cmd = f"PORT={default_port} npm start"
        if "dev" in scripts and "start" not in scripts:
            run_cmd = f"npm run dev -- --port {default_port}"
        return {
            "role": "frontend" if ("react" in dep_keys or "vite" in dev_script) else "backend",
            "name": "Node.js Service",
            "framework": "node",
            "install_command": "npm install",
            "run_command": run_cmd,
            "port": default_port
        }

    def _detect_frontend_subservice(self, repo_dir: Path, fe_port: int) -> Optional[dict]:
        """Checks common frontend subdirectories or root package.json for a frontend tier."""
        for sub in ["frontend", "client", "web", "ui"]:
            pkg = repo_dir / sub / "package.json"
            if pkg.exists():
                info = self._inspect_package_json(pkg, fe_port)
                info["id"] = "frontend"
                info["role"] = "frontend"
                info["working_dir"] = sub
                return info

        root_pkg = repo_dir / "package.json"
        if root_pkg.exists():
            info = self._inspect_package_json(root_pkg, fe_port)
            info["id"] = "frontend"
            info["role"] = "frontend"
            info["working_dir"] = "."
            return info

        return None

    def analyze(self, repo_dir: Path, port: int = 8000) -> StackInfo:
        has_dockerfile = (repo_dir / "Dockerfile").exists() or (repo_dir / "docker-compose.yml").exists()

        common_markers = [
            "requirements.txt", "pyproject.toml", "Pipfile", "setup.py",
            "package.json", "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
            "index.html", "main.py", "app.py", "manage.py", "server.js", "index.js",
            "src/app.py", "src/main.py", "app/main.py",
            "backend/requirements.txt", "backend/main.py", "backend/app.py",
            "frontend/package.json", "client/package.json", "web/package.json",
            "Dockerfile", "docker-compose.yml", ".env", ".env.example"
        ]
        found_markers = [m for m in common_markers if (repo_dir / m).exists()]

        req_txt = repo_dir / "requirements.txt"
        pyproject = repo_dir / "pyproject.toml"
        backend_req = repo_dir / "backend" / "requirements.txt"
        backend_pyproject = repo_dir / "backend" / "pyproject.toml"

        # 1. Check Python Backend (root or backend/ subfolder)
        has_python_root = req_txt.exists() or pyproject.exists()
        has_python_sub = backend_req.exists() or backend_pyproject.exists()

        if has_python_root or has_python_sub:
            py_dir = repo_dir if has_python_root else (repo_dir / "backend")
            py_working_dir = "." if has_python_root else "backend"
            py_stack = self._analyze_python(py_dir, port, has_dockerfile, found_markers)

            services = [
                {
                    "id": "backend",
                    "role": "backend",
                    "name": f"Backend Service ({py_stack.framework.upper()})",
                    "framework": py_stack.framework,
                    "working_dir": py_working_dir,
                    "install_command": py_stack.install_command,
                    "run_command": py_stack.run_command,
                    "port": port,
                    "enabled": True
                }
            ]

            # Check if there is ALSO a Frontend service (e.g. frontend/package.json or root package.json)
            fe_default_port = 5173 if port != 5173 else 3000
            fe_service = self._detect_frontend_subservice(repo_dir, fe_default_port)
            if fe_service:
                services.append({
                    "id": "frontend",
                    "role": "frontend",
                    "name": fe_service["name"],
                    "framework": fe_service["framework"],
                    "working_dir": fe_service["working_dir"],
                    "install_command": fe_service["install_command"],
                    "run_command": fe_service["run_command"],
                    "port": fe_service["port"],
                    "enabled": True
                })

            py_stack.services = services
            return py_stack

        # 2. Check Node.js (root or frontend/client subfolders)
        package_json = repo_dir / "package.json"
        if package_json.exists():
            pkg_info = self._inspect_package_json(package_json, port)
            run_cmd = f"PORT={port} npm start" if pkg_info["framework"] == "node" else pkg_info["run_command"]
            svc = {
                "id": pkg_info["role"],
                "role": pkg_info["role"],
                "name": pkg_info["name"],
                "framework": pkg_info["framework"],
                "working_dir": ".",
                "install_command": "npm install",
                "run_command": run_cmd,
                "port": port,
                "enabled": True
            }
            return StackInfo(
                framework="node",
                is_standard=True,
                install_command="npm install",
                run_command=f"PORT={port} npm start",
                has_dockerfile=has_dockerfile,
                detected_files=found_markers,
                services=[svc]
            )

        fe_sub = self._detect_frontend_subservice(repo_dir, port)
        if fe_sub:
            return StackInfo(
                framework=fe_sub["framework"],
                is_standard=True,
                install_command=fe_sub["install_command"],
                run_command=fe_sub["run_command"],
                has_dockerfile=has_dockerfile,
                detected_files=found_markers,
                services=[{**fe_sub, "enabled": True}]
            )

        # 3. Check Static HTML / Web projects
        if (repo_dir / "index.html").exists():
            run_cmd = f"python -m http.server {port}"
            return StackInfo(
                framework="static_html",
                is_standard=True,
                install_command=None,
                run_command=run_cmd,
                has_dockerfile=has_dockerfile,
                entrypoint="index.html",
                detected_files=found_markers,
                services=[
                    {
                        "id": "frontend",
                        "role": "frontend",
                        "name": "Static HTML Web Server",
                        "framework": "static_html",
                        "working_dir": ".",
                        "install_command": None,
                        "run_command": run_cmd,
                        "port": port,
                        "enabled": True
                    }
                ]
            )

        # 4. Unknown / Deep AI Mode
        return StackInfo(
            framework="unknown",
            is_standard=False,
            install_command=None,
            run_command=None,
            has_dockerfile=has_dockerfile,
            detected_files=found_markers,
            services=[]
        )

    def _analyze_python(self, repo_dir: Path, port: int, has_dockerfile: bool, found_markers: List[str]) -> StackInfo:
        req_content = ""
        if (repo_dir / "requirements.txt").exists():
            req_content = (repo_dir / "requirements.txt").read_text(encoding="utf-8", errors="ignore").lower()

        install_cmd = "pip install -r requirements.txt" if (repo_dir / "requirements.txt").exists() else "pip install ."

        entry = self._find_entrypoint(repo_dir, ["main.py", "app.py", "wsgi.py", "run.py", "server.py"])
        entry_content = ""
        if entry and (repo_dir / entry).exists():
            entry_content = (repo_dir / entry).read_text(encoding="utf-8", errors="ignore").lower()

        # Detect FastAPI
        is_fastapi = "fastapi" in req_content or "fastapi" in entry_content
        if is_fastapi:
            fastapi_entry = self._find_entrypoint(repo_dir, ["main.py", "app.py", "server.py"]) or "main.py"
            module_path = fastapi_entry[:-3].replace("/", ".") if fastapi_entry.endswith(".py") else "main"
            run_cmd = f"uvicorn {module_path}:app --host 0.0.0.0 --port {port}"
            return StackInfo(
                framework="fastapi",
                is_standard=True,
                install_command=install_cmd,
                run_command=run_cmd,
                has_dockerfile=has_dockerfile,
                entrypoint=fastapi_entry,
                detected_files=found_markers
            )

        # Detect Flask
        is_flask = "flask" in req_content or "flask" in entry_content
        if is_flask:
            flask_entry = self._find_entrypoint(repo_dir, ["app.py", "main.py", "wsgi.py", "run.py"]) or "app.py"
            run_cmd = f"flask --app {flask_entry} run --host=0.0.0.0 --port={port}"
            return StackInfo(
                framework="flask",
                is_standard=True,
                install_command=install_cmd,
                run_command=run_cmd,
                has_dockerfile=has_dockerfile,
                entrypoint=flask_entry,
                detected_files=found_markers
            )

        # Detect Django
        django_entry = self._find_entrypoint(repo_dir, ["manage.py"])
        if django_entry:
            run_cmd = f"python {django_entry} runserver 0.0.0.0:{port}"
            return StackInfo(
                framework="django",
                is_standard=True,
                install_command=install_cmd,
                run_command=run_cmd,
                has_dockerfile=has_dockerfile,
                entrypoint=django_entry,
                detected_files=found_markers
            )

        # Detect PyWebView (Desktop Webview App)
        if "pywebview" in req_content or "import webview" in entry_content:
            target_entry = entry or "main.py"
            return StackInfo(
                framework="pywebview",
                is_standard=True,
                install_command=install_cmd,
                run_command=f"python {target_entry}",
                has_dockerfile=has_dockerfile,
                entrypoint=target_entry,
                detected_files=found_markers
            )

        # Detect Streamlit
        if "streamlit" in req_content or "import streamlit" in entry_content:
            target_entry = entry or "app.py"
            return StackInfo(
                framework="streamlit",
                is_standard=True,
                install_command=install_cmd,
                run_command=f"python -m streamlit run {target_entry} --server.port {port}",
                has_dockerfile=has_dockerfile,
                entrypoint=target_entry,
                detected_files=found_markers
            )

        # Detect Gradio
        if "gradio" in req_content or "import gradio" in entry_content:
            target_entry = entry or "app.py"
            return StackInfo(
                framework="gradio",
                is_standard=True,
                install_command=install_cmd,
                run_command=f"python {target_entry}",
                has_dockerfile=has_dockerfile,
                entrypoint=target_entry,
                detected_files=found_markers
            )

        # Generic Python
        if entry:
            run_cmd = f"python {entry} --port {port}" if "--port" in entry_content else f"python {entry}"
        else:
            run_cmd = None
        return StackInfo(
            framework="generic_python",
            is_standard=True if entry else False,
            install_command=install_cmd,
            run_command=run_cmd,
            has_dockerfile=has_dockerfile,
            entrypoint=entry,
            detected_files=found_markers
        )
