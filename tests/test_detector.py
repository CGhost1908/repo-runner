from pathlib import Path
from backend.services.detector import StackDetector

def test_detect_fastapi_project(tmp_path):
    (tmp_path / "requirements.txt").write_text("fastapi\nuvicorn\n", encoding="utf-8")
    (tmp_path / "main.py").write_text("from fastapi import FastAPI\napp = FastAPI()\n", encoding="utf-8")

    detector = StackDetector()
    info = detector.analyze(tmp_path, port=8000)

    assert info.is_standard is True
    assert info.framework == "fastapi"
    assert "pip install -r requirements.txt" in info.install_command
    assert "--port 8000" in info.run_command

def test_detect_flask_project(tmp_path):
    (tmp_path / "requirements.txt").write_text("flask\n", encoding="utf-8")
    (tmp_path / "app.py").write_text("from flask import Flask\napp = Flask(__name__)\n", encoding="utf-8")

    detector = StackDetector()
    info = detector.analyze(tmp_path, port=5000)

    assert info.is_standard is True
    assert info.framework == "flask"
    assert "--port=5000" in info.run_command or "--port 5000" in info.run_command

def test_detect_unknown_project(tmp_path):
    (tmp_path / "main.rs").write_text("fn main() {}", encoding="utf-8")

    detector = StackDetector()
    info = detector.analyze(tmp_path, port=8000)

    assert info.is_standard is False
    assert info.framework == "unknown"

def test_detect_static_html_project(tmp_path):
    (tmp_path / "index.html").write_text("<h1>Hello World</h1>", encoding="utf-8")

    detector = StackDetector()
    info = detector.analyze(tmp_path, port=8000)

    assert info.is_standard is True
    assert info.framework == "static_html"
    assert "http.server 8000" in info.run_command


def test_detect_fullstack_backend_and_frontend_services(tmp_path):
    # Backend in root
    (tmp_path / "requirements.txt").write_text("fastapi\nuvicorn\n", encoding="utf-8")
    (tmp_path / "main.py").write_text("from fastapi import FastAPI\napp = FastAPI()\n", encoding="utf-8")
    # Frontend in frontend/ subfolder
    fe_dir = tmp_path / "frontend"
    fe_dir.mkdir()
    (fe_dir / "package.json").write_text(
        '{"name": "web", "scripts": {"dev": "vite"}, "devDependencies": {"vite": "^5.0.0"}}',
        encoding="utf-8"
    )

    detector = StackDetector()
    info = detector.analyze(tmp_path, port=8000)

    assert info.framework == "fastapi"
    assert len(info.services) == 2
    roles = {s["role"]: s for s in info.services}
    assert "backend" in roles
    assert "frontend" in roles
    assert roles["backend"]["port"] == 8000
    assert roles["frontend"]["working_dir"] == "frontend"
    assert roles["frontend"]["port"] == 5173
    assert "vite" in roles["frontend"]["framework"]
