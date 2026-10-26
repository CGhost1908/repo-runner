from pathlib import Path
from fastapi.testclient import TestClient
from backend.main import app
from backend.services.project_meta import ProjectMetaManager

def test_parse_repo_info_github_url():
    name, owner, url = ProjectMetaManager.parse_repo_info("https://github.com/CGhost1908/iso-cartoon-talker")
    assert name == "iso-cartoon-talker"
    assert owner == "CGhost1908"

def test_parse_repo_info_with_git_suffix():
    name, owner, url = ProjectMetaManager.parse_repo_info("https://github.com/symNistaken/steam-agentai.git")
    assert name == "steam-agentai"
    assert owner == "symNistaken"

def test_parse_repo_info_local_folder_strips_hash():
    name, owner, url = ProjectMetaManager.parse_repo_info("C:/Users/Eren/.repo-runner/workspaces/62481d6f_iso-cartoon-talker")
    assert name == "iso-cartoon-talker"
    assert owner == "Local"

def test_record_and_find_cached_recipe(tmp_path):
    repo_dir = tmp_path / "my-test-repo"
    repo_dir.mkdir()
    (repo_dir / "app.py").write_text("print('hello')", encoding="utf-8")

    # Record run result
    ProjectMetaManager.record_run_result(
        repo_dir=repo_dir,
        status="SUCCESS",
        recipe={
            "framework": "flask",
            "install_command": "pip install -r requirements.txt",
            "run_command": "flask run --port 8000",
            "port": 8000,
            "entrypoint": "app.py",
            "is_standard": True
        },
        repo_url="https://github.com/testowner/my-test-repo"
    )

    # Verify cached recipe is discovered
    cached = ProjectMetaManager.find_cached_recipe("https://github.com/testowner/my-test-repo", tmp_path)
    assert cached is not None
    target_dir, recipe, meta = cached
    assert target_dir == repo_dir
    assert recipe["framework"] == "flask"
    assert recipe["run_command"] == "flask run --port 8000"
    assert meta["repo_owner"] == "testowner"
    assert meta["last_run_status"] == "SUCCESS"

def test_api_detect_uses_cached_recipe(tmp_path, monkeypatch):
    import backend.api.routes as routes
    monkeypatch.setattr(routes.settings, "workspace_dir", tmp_path)
    monkeypatch.setattr(routes.repo_manager.settings, "workspace_dir", tmp_path)

    repo_dir = tmp_path / "cached-app"
    repo_dir.mkdir()
    (repo_dir / "main.py").write_text("print('live')", encoding="utf-8")

    ProjectMetaManager.record_run_result(
        repo_dir=repo_dir,
        status="SUCCESS",
        recipe={
            "framework": "fastapi",
            "install_command": "pip install -r requirements.txt",
            "run_command": "python -m uvicorn main:app --port 8000",
            "port": 8000,
            "entrypoint": "main.py",
            "is_standard": True
        },
        repo_url="https://github.com/fastowner/cached-app"
    )

    client = TestClient(app)
    res = client.post("/api/detect", json={"repo_url": "https://github.com/fastowner/cached-app", "port": 8000})
    assert res.status_code == 200
    data = res.json()
    assert data["cached"] is True
    assert data["last_run_status"] == "SUCCESS"
    assert data["framework"] == "fastapi"
    assert data["repo_owner"] == "fastowner"
    assert data["run_command"] == "python -m uvicorn main:app --port 8000"
