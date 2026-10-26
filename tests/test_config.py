from backend.config import get_settings
from backend.models import RunRequest, RunStatus, LogMessage

def test_settings_default_values():
    settings = get_settings()
    assert settings.default_backend_port == 7001
    assert settings.default_frontend_port == 7000
    assert settings.workspace_dir.exists()

def test_run_request_validation():
    req = RunRequest(repo_url="https://github.com/example/sample.git", port=8000)
    assert req.repo_url == "https://github.com/example/sample.git"
    assert req.port == 8000
    assert req.local_path is None
