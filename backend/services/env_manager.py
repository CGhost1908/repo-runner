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
        tokens = install_command.split()
        if tokens and tokens[0] == "pip":
            venv_cmd = [str(python_bin), "-m", "pip"] + tokens[1:]
        else:
            venv_cmd = [str(python_bin), "-m"] + tokens

        if log_cb:
            log_cb(f"Running installation: {' '.join(venv_cmd)}")

        process = subprocess.Popen(
            venv_cmd,
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
