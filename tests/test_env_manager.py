from pathlib import Path
from backend.services.env_manager import EnvManager

def test_venv_paths(tmp_path):
    manager = EnvManager()
    python_bin = manager.get_python_bin(tmp_path)
    assert python_bin.parent.name.lower() in ["scripts", "bin"]
    assert "python" in python_bin.name.lower()

def test_pip_install_command_structure(tmp_path, monkeypatch):
    manager = EnvManager()
    # Mock create_venv
    monkeypatch.setattr(manager, "create_venv", lambda repo_dir, log_cb, run_id: Path("fake_python.exe"))
    # Mock get_python_bin
    fake_py = tmp_path / "python.exe"
    fake_py.write_text("", encoding="utf-8")
    monkeypatch.setattr(manager, "get_python_bin", lambda repo_dir: fake_py)

    captured_cmds = []
    def mock_run_pip(cmd, repo_dir, log_cb, run_id):
        captured_cmds.append(cmd)
        return 0

    monkeypatch.setattr(manager, "_run_pip_cmd", mock_run_pip)

    success = manager.install_dependencies(tmp_path, "pip install -r requirements.txt")
    assert success is True
    assert len(captured_cmds) == 1
    cmd = captured_cmds[0]
    # Check that pip is immediately followed by install, NOT --progress-bar
    pip_idx = cmd.index("pip")
    install_idx = cmd.index("install")
    prog_idx = cmd.index("--progress-bar")
    assert install_idx == pip_idx + 1
    assert prog_idx > install_idx

