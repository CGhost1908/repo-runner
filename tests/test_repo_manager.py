import pytest
from pathlib import Path
from backend.config import Settings
from backend.models import RunRequest
from backend.services.repo_manager import RepoManager

def test_prepare_repo_from_existing_local_path(tmp_path):
    sample_dir = tmp_path / "my_project"
    sample_dir.mkdir()
    (sample_dir / "main.py").write_text("print('hello')", encoding="utf-8")

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
