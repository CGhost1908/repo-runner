import os
from pathlib import Path
from typing import Optional
from backend.services.detector import StackInfo

class AIPlanner:
    """
    AI Deep Mode Planner for exotic or unclassified codebases.
    Inspects repository structure, entry points, and README documentation
    to generate execution strategies and synthesize commands.
    """

    def plan(self, repo_dir: Path, port: int = 8000) -> tuple[StackInfo, list[str]]:
        decision_logs = []
        files = [f.name for f in repo_dir.iterdir() if not f.name.startswith(".")]
        decision_logs.append(f"📁 Taranan ana dizin dosyalari: {', '.join(files[:10])}")

        # Check README.md
        readme_path = repo_dir / "README.md"
        readme_content = ""
        if readme_path.exists():
            readme_content = readme_path.read_text(encoding="utf-8", errors="ignore")[:2000].lower()
            decision_logs.append("📄 README.md belgesi okundu ve analiz edildi.")

        # Check Static Web
        if (repo_dir / "index.html").exists():
            decision_logs.append("✨ [AI Teshisi] Web tabanli on yuz tespit edildi (index.html).")
            decision_logs.append(f"💡 [AI Karari] Python HTTP Server ile {port} portundan yayin yapilacak.")
            return StackInfo(
                framework="static_html",
                is_standard=False,
                install_command=None,
                run_command=f"python -m http.server {port}",
                has_dockerfile=(repo_dir / "Dockerfile").exists(),
                entrypoint="index.html"
            ), decision_logs

        # Check Node.js / Javascript
        if (repo_dir / "package.json").exists() or (repo_dir / "server.js").exists() or (repo_dir / "app.js").exists():
            entry = "server.js" if (repo_dir / "server.js").exists() else "app.js" if (repo_dir / "app.js").exists() else "index.js"
            install = "npm install" if (repo_dir / "package.json").exists() else None
            decision_logs.append(f"✨ [AI Teshisi] Node.js calisma ortami tespit edildi (Giris: {entry}).")
            decision_logs.append(f"💡 [AI Karari] PORT={port} node {entry} komutu ile baslatilacak.")
            return StackInfo(
                framework="node_ai",
                is_standard=False,
                install_command=install,
                run_command=f"node {entry}",
                has_dockerfile=(repo_dir / "Dockerfile").exists(),
                entrypoint=entry
            ), decision_logs

        # Check Python scripts
        py_files = list(repo_dir.glob("*.py"))
        if py_files:
            main_candidate = None
            for cand in ["main.py", "app.py", "server.py", "run.py", "manage.py"]:
                if (repo_dir / cand).exists():
                    main_candidate = cand
                    break
            if not main_candidate and py_files:
                main_candidate = py_files[0].name

            install = "pip install -r requirements.txt" if (repo_dir / "requirements.txt").exists() else None
            decision_logs.append(f"✨ [AI Teshisi] Python projesi tespit edildi (Secilen giris noktasi: {main_candidate}).")
            decision_logs.append(f"💡 [AI Karari] Port {port} enjekte edilerek python {main_candidate} calistirilacak.")
            return StackInfo(
                framework="python_ai",
                is_standard=False,
                install_command=install,
                run_command=f"python {main_candidate} --port {port}",
                has_dockerfile=(repo_dir / "Dockerfile").exists(),
                entrypoint=main_candidate
            ), decision_logs

        # Check Dockerfile
        if (repo_dir / "Dockerfile").exists():
            decision_logs.append("✨ [AI Teshisi] Dockerfile tespit edildi.")
            decision_logs.append(f"💡 [AI Karari] Docker container derlenip port {port} haritalanacak.")
            return StackInfo(
                framework="docker_native",
                is_standard=False,
                install_command=None,
                run_command=f"docker build -t repo_runner_app . && docker run -p {port}:{port} repo_runner_app",
                has_dockerfile=True,
                entrypoint="Dockerfile"
            ), decision_logs

        # Fallback: Static file server
        decision_logs.append("⚠️ [AI Uyarisi] Ozel bir sunucu yapisi bulunamadi, genel dizin sunucusu olarak ayaga kaldiriliyor.")
        return StackInfo(
            framework="generic_http",
            is_standard=False,
            install_command=None,
            run_command=f"python -m http.server {port}",
            has_dockerfile=False,
            entrypoint=None
        ), decision_logs
