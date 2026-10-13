from pathlib import Path
from backend.services.env_manager import EnvManager

def test_venv_paths(tmp_path):
    manager = EnvManager()
    python_bin = manager.get_python_bin(tmp_path)
    assert python_bin.parent.name.lower() in ["scripts", "bin"]
    assert "python" in python_bin.name.lower()
