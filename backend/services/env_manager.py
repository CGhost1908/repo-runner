import os
import re
import sys
import time
import threading
import subprocess
from pathlib import Path
from typing import Callable, Optional

class EnvManager:
    def __init__(self):
        self._active_procs: dict[str, subprocess.Popen] = {}

    def stop(self, key: str) -> bool:
        proc = self._active_procs.pop(key, None)
        if proc and proc.poll() is None:
            try:
                proc.terminate()
                proc.wait(timeout=2)
            except Exception:
                try:
                    proc.kill()
                except Exception:
                    pass
            return True
        return False

    def get_python_bin(self, repo_dir: Path) -> Path:
        venv_dir = repo_dir / ".venv"
        if os.name == "nt":
            return venv_dir / "Scripts" / "python.exe"
        return venv_dir / "bin" / "python"

    def create_venv(self, repo_dir: Path, log_cb: Optional[Callable[[str], None]] = None, run_id: str = "") -> Path:
        venv_dir = repo_dir / ".venv"
        python_bin = self.get_python_bin(repo_dir)

        if python_bin.exists():
            if log_cb:
                log_cb(f"[OK] Reusing existing virtual environment at {venv_dir}")
            return python_bin

        if log_cb:
            log_cb(f"Creating isolated virtual environment at {venv_dir}...")

        cmd = [sys.executable, "-m", "venv", str(venv_dir)]
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        if run_id:
            self._active_procs[run_id] = proc

        start_t = time.time()
        last_reported = 0
        while proc.poll() is None:
            time.sleep(0.5)
            elapsed = int(time.time() - start_t)
            if elapsed > 0 and elapsed % 3 == 0 and elapsed != last_reported:
                last_reported = elapsed
                if log_cb:
                    log_cb(f"[WAIT] Provisioning isolated Python environment (.venv)... ({elapsed}s)")

        if run_id:
            self._active_procs.pop(run_id, None)

        if proc.returncode != 0:
            raise RuntimeError("Virtual environment creation was interrupted or failed.")

        if log_cb:
            log_cb("Virtual environment created successfully.")

        return python_bin

    def _run_pip_cmd(
        self,
        venv_cmd: list[str],
        repo_dir: Path,
        log_cb: Optional[Callable[[str], None]] = None,
        run_id: str = ""
    ) -> int:
        env = os.environ.copy()
        env["PYTHONUNBUFFERED"] = "1"
        process = subprocess.Popen(
            venv_cmd,
            cwd=str(repo_dir),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
            env=env
        )
        if run_id:
            self._active_procs[run_id] = process

        state = {"last_log": time.time(), "start": time.time(), "done": False, "last_pkg": ""}

        def _heartbeat():
            while not state["done"] and process.poll() is None:
                time.sleep(1.0)
                idle = time.time() - state["last_log"]
                if idle >= 4.0 and not state["done"] and process.poll() is None:
                    elapsed = int(time.time() - state["start"])
                    pkg_hint = f" [{state['last_pkg']}]" if state["last_pkg"] else ""
                    if log_cb:
                        log_cb(f"[WAIT] Downloading / installing packages{pkg_hint}... ({elapsed}s elapsed)")
                    state["last_log"] = time.time()

        hb_thread = threading.Thread(target=_heartbeat, daemon=True)
        hb_thread.start()

        if process.stdout:
            for line in process.stdout:
                state["last_log"] = time.time()
                clean_line = line.rstrip()
                if clean_line.startswith("Collecting ") or clean_line.startswith("Downloading "):
                    parts = clean_line.split()
                    if len(parts) >= 2:
                        state["last_pkg"] = parts[1]
                if log_cb and clean_line:
                    log_cb(clean_line)

        state["done"] = True
        process.wait()
        if run_id:
            self._active_procs.pop(run_id, None)
        return process.returncode

    def install_dependencies(
        self,
        repo_dir: Path,
        install_command: str,
        log_cb: Optional[Callable[[str], None]] = None,
        run_id: str = ""
    ) -> bool:
        tokens = install_command.strip().split()
        if not tokens:
            return True

        # Handle Node.js package managers (npm, yarn, pnpm, bun)
        if tokens[0].lower() in ("npm", "npm.cmd", "yarn", "yarn.cmd", "pnpm", "pnpm.cmd", "bun"):
            exe = tokens[0]
            if os.name == "nt" and not exe.lower().endswith(".cmd") and exe.lower() in ("npm", "yarn", "pnpm"):
                exe = f"{exe}.cmd"
            node_cmd = [exe] + tokens[1:]
            if log_cb:
                log_cb(f"Running Node installation in {repo_dir.name}: {' '.join(node_cmd)}")
            returncode = self._run_pip_cmd(node_cmd, repo_dir, log_cb, run_id=run_id)
            return returncode == 0

        python_bin = self.get_python_bin(repo_dir)
        if not python_bin.exists():
            self.create_venv(repo_dir, log_cb, run_id=run_id)

        # Replace 'pip' with the venv's python -m pip
        if tokens and tokens[0] == "pip":
            if len(tokens) > 1 and tokens[1] == "install":
                venv_cmd = [str(python_bin), "-m", "pip", "install", "--progress-bar", "off"] + tokens[2:]
            else:
                venv_cmd = [str(python_bin), "-m", "pip"] + tokens[1:]
        else:
            venv_cmd = [str(python_bin), "-m"] + tokens

        if log_cb:
            log_cb(f"Running installation: {' '.join(venv_cmd)}")

        returncode = self._run_pip_cmd(venv_cmd, repo_dir, log_cb, run_id=run_id)
        if returncode == 0:
            self._install_undeclared_imports(repo_dir, python_bin, log_cb, run_id)
            return True

        # Check if stopped by user
        if returncode < 0 or (run_id and run_id not in self._active_procs and returncode == 15):
            return False

        # Fallback: If requirements.txt failed due to strict old version pins (e.g. Pillow==9.5.0 on Python 3.13)
        req_file = repo_dir / "requirements.txt"
        if "requirements.txt" in install_command and req_file.exists():
            if log_cb:
                log_cb("[WARN] Strict version pin conflict or C-build error detected (e.g. Python 3.13+ wheel mismatch).")
                log_cb("[RETRY] Retrying installation with flexible package versions (--prefer-binary)...")

            raw_lines = req_file.read_text(encoding="utf-8", errors="ignore").splitlines()
            unpinned_pkgs = []
            for line in raw_lines:
                clean = line.split("#")[0].strip()
                if not clean or clean.startswith("-"):
                    continue
                # Strip ==, <=, ~=, >= version constraints to fetch compatible pre-built wheel
                pkg_name = re.split(r"[=~<>!]", clean)[0].strip()
                if pkg_name:
                    unpinned_pkgs.append(pkg_name)

            if unpinned_pkgs:
                fallback_cmd = [str(python_bin), "-m", "pip", "install", "--progress-bar", "off", "--prefer-binary"] + unpinned_pkgs
                if log_cb:
                    log_cb(f"$ pip install --prefer-binary {' '.join(unpinned_pkgs)}")
                rc2 = self._run_pip_cmd(fallback_cmd, repo_dir, log_cb, run_id=run_id)
                if rc2 == 0:
                    return True

                # Stage 3: Install packages individually so one broken optional package doesn't block the app
                if log_cb:
                    log_cb("[RETRY] Installing packages individually to bypass broken optional dependencies...")
                installed_any = False
                for pkg in unpinned_pkgs:
                    single_cmd = [str(python_bin), "-m", "pip", "install", "--progress-bar", "off", "--prefer-binary", pkg]
                    rc_single = self._run_pip_cmd(single_cmd, repo_dir, log_cb, run_id=run_id)
                    if rc_single == 0:
                        installed_any = True
                    else:
                        if log_cb:
                            log_cb(f"[WARN] Skipped incompatible package: {pkg}")
                return installed_any

        return False

    def _install_undeclared_imports(
        self,
        repo_dir: Path,
        python_bin: Path,
        log_cb: Optional[Callable[[str], None]] = None,
        run_id: str = ""
    ) -> None:
        """
        Scans project .py files for common third-party imports that authors frequently forget
        to list in requirements.txt (e.g., 'jwt' -> PyJWT + cryptography, 'dotenv' -> python-dotenv)
        and installs any missing ones into .venv automatically.
        """
        COMMON_IMPORT_TO_PIP = {
            "jwt": ["PyJWT", "cryptography"],
            "dotenv": ["python-dotenv"],
            "yaml": ["PyYAML"],
            "bs4": ["beautifulsoup4"],
            "PIL": ["Pillow"],
            "cv2": ["opencv-python-headless"],
            "supabase": ["supabase"],
            "litellm": ["litellm"]
        }

        detected_roots: set[str] = set()
        import ast

        try:
            for py_file in repo_dir.rglob("*.py"):
                parts_lower = {p.lower() for p in py_file.parts}
                if parts_lower & {".venv", "venv", "env", "node_modules", "__pycache__", ".git", "tests"}:
                    continue
                content = py_file.read_text(encoding="utf-8", errors="ignore")
                try:
                    tree = ast.parse(content)
                except SyntaxError:
                    continue
                # Only inspect top-level module imports (ignores optional imports inside try/except or functions)
                for node in tree.body:
                    if isinstance(node, ast.Import):
                        for alias in node.names:
                            root_mod = alias.name.split(".")[0]
                            if root_mod in COMMON_IMPORT_TO_PIP:
                                detected_roots.add(root_mod)
                    elif isinstance(node, ast.ImportFrom) and node.module:
                        root_mod = node.module.split(".")[0]
                        if root_mod in COMMON_IMPORT_TO_PIP:
                            detected_roots.add(root_mod)
        except Exception:
            return

        if not detected_roots:
            return

        missing_pip_pkgs: list[str] = []
        for mod_name in sorted(detected_roots):
            chk = subprocess.run(
                [str(python_bin), "-c", f"import {mod_name}"],
                capture_output=True,
                text=True,
                check=False
            )
            if chk.returncode != 0:
                for pkg in COMMON_IMPORT_TO_PIP[mod_name]:
                    if pkg not in missing_pip_pkgs:
                        missing_pip_pkgs.append(pkg)

        if missing_pip_pkgs:
            if log_cb:
                log_cb(f"[AUTO-HEAL] Detected undeclared imports in source code. Installing: {', '.join(missing_pip_pkgs)}...")
            heal_cmd = [str(python_bin), "-m", "pip", "install", "--progress-bar", "off"] + missing_pip_pkgs
            self._run_pip_cmd(heal_cmd, repo_dir, log_cb, run_id=run_id)
