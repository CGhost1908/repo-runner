import asyncio
import csv
import io
import os
import re
import subprocess
import threading
import httpx
from pathlib import Path
from typing import Callable, Optional

PROTECTED_PORTS = {7000, 7001}


class ProcessRunner:
    def __init__(self):
        self._processes: dict[str, subprocess.Popen] = {}
        self._pid_details_cache: dict[int, dict] = {}

    def _get_process_names(self) -> dict[int, str]:
        """Returns a mapping of PID -> process image name on Windows/POSIX."""
        pid_map: dict[int, str] = {}
        if os.name == "nt":
            try:
                res = subprocess.run(
                    ["tasklist", "/FO", "CSV", "/NH"],
                    capture_output=True,
                    text=True,
                    check=False
                )
                reader = csv.reader(io.StringIO(res.stdout))
                for row in reader:
                    if len(row) >= 2:
                        try:
                            pid_map[int(row[1])] = row[0]
                        except ValueError:
                            pass
            except Exception:
                pass
        return pid_map

    def _get_pid_extended_info(self, pids: set[int]) -> dict[int, dict]:
        """
        Fetches ExecutablePath and CommandLine for the given PIDs (cached per PID).
        """
        missing = [p for p in pids if p > 0 and p not in self._pid_details_cache]
        if missing and os.name == "nt":
            try:
                import json
                filter_str = " OR ".join(f"ProcessId={p}" for p in missing[:25])
                ps_cmd = (
                    f"Get-CimInstance Win32_Process -Filter \"{filter_str}\" | "
                    "Select-Object ProcessId,Name,ExecutablePath,CommandLine | ConvertTo-Json -Compress"
                )
                res = subprocess.run(
                    ["powershell", "-NoProfile", "-Command", ps_cmd],
                    capture_output=True,
                    text=True,
                    timeout=3.0,
                    check=False
                )
                raw = (res.stdout or "").strip()
                if raw:
                    parsed = json.loads(raw)
                    if isinstance(parsed, dict):
                        parsed = [parsed]
                    for item in parsed:
                        pid_val = int(item.get("ProcessId") or 0)
                        if pid_val > 0:
                            self._pid_details_cache[pid_val] = {
                                "executable_path": item.get("ExecutablePath") or "",
                                "command_line": item.get("CommandLine") or "",
                                "name": item.get("Name") or ""
                            }
            except Exception:
                pass
            for p in missing:
                self._pid_details_cache.setdefault(p, {"executable_path": "", "command_line": "", "name": ""})
        return {p: self._pid_details_cache.get(p, {}) for p in pids}

    def _scan_all_tcp_listeners(self) -> dict[int, list[dict]]:
        """
        Scans all TCP LISTENING sockets on the host and groups them by port.
        """
        port_map: dict[int, list[dict]] = {}
        if os.name == "nt":
            try:
                res = subprocess.run(
                    ["netstat", "-ano"],
                    capture_output=True,
                    text=True,
                    check=False
                )
                pid_names = self._get_process_names()
                pattern = re.compile(
                    r"^\s*TCP\s+(\S+):(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$",
                    re.IGNORECASE
                )
                for line in res.stdout.splitlines():
                    match = pattern.match(line)
                    if not match:
                        continue
                    addr, port_str, pid_str = match.group(1), match.group(2), match.group(3)
                    port_num = int(port_str)
                    pid = int(pid_str)
                    if pid <= 0:
                        continue
                    entries = port_map.setdefault(port_num, [])
                    if not any(e["pid"] == pid and e["address"] == addr for e in entries):
                        entries.append({
                            "pid": pid,
                            "process_name": pid_names.get(pid, "unknown"),
                            "address": f"{addr}:{port_num}"
                        })
            except Exception:
                pass
        return port_map

    def list_active_ports(self, min_port: int = 3000, max_port: int = 9999) -> list[dict]:
        """
        Lists active TCP listening ports within the development port range [min_port, max_port].
        """
        port_map = self._scan_all_tcp_listeners()
        relevant_ports = [p for p in sorted(port_map.keys()) if min_port <= p <= max_port]
        target_pids = {item["pid"] for p in relevant_ports for item in port_map[p]}
        ext_info = self._get_pid_extended_info(target_pids)

        results = []
        for port_num in relevant_ports:
            listeners = port_map[port_num]
            primary = listeners[0]
            p_ext = ext_info.get(primary["pid"], {})
            all_pids = sorted({item["pid"] for item in listeners})
            addresses = sorted({item["address"] for item in listeners})
            results.append({
                "port": port_num,
                "in_use": True,
                "pid": primary["pid"],
                "pids": all_pids,
                "process_name": primary["process_name"],
                "executable_path": p_ext.get("executable_path", ""),
                "command_line": p_ext.get("command_line", ""),
                "addresses": addresses,
                "is_protected": port_num in PROTECTED_PORTS,
                "processes": listeners
            })
        return results

    def inspect_port(self, port: int) -> dict:
        """
        Inspects a single target port to see if it is occupied and suggests the next available port.
        """
        port_map = self._scan_all_tcp_listeners()
        listeners = port_map.get(port, [])
        in_use = len(listeners) > 0

        # Find next available port starting from max(8000, port + 1) if occupied
        suggested = port
        if in_use:
            candidate = max(8000, port + 1)
            while candidate in port_map or candidate in PROTECTED_PORTS:
                candidate += 1
            suggested = candidate

        return {
            "port": port,
            "in_use": in_use,
            "is_protected": port in PROTECTED_PORTS,
            "processes": listeners,
            "suggested_free_port": suggested
        }

    def free_port(self, port: int, log_cb: Optional[Callable[[str], None]] = None) -> list[int]:
        """
        Ensures the target port is free before launching a new application.
        Terminates any lingering process occupying the target port on Windows/POSIX.
        Returns a list of terminated PIDs.
        """
        if port in PROTECTED_PORTS:
            return []

        killed_pids: list[int] = []
        if os.name == "nt":
            try:
                port_map = self._scan_all_tcp_listeners()
                listeners = port_map.get(port, [])
                pids_to_kill = {
                    item["pid"]
                    for item in listeners
                    if item["pid"] > 0 and item["pid"] != os.getpid()
                }

                for pid in pids_to_kill:
                    if log_cb:
                        log_cb(f"[INFO] Port {port} is in use by PID {pid}. Releasing port...")
                    subprocess.run(
                        ["taskkill", "/F", "/T", "/PID", str(pid)],
                        capture_output=True,
                        text=True,
                        check=False
                    )
                    killed_pids.append(pid)
            except Exception:
                pass
        return killed_pids

    def start(
        self,
        run_id: str,
        cmd: list[str],
        cwd: Path,
        log_cb: Optional[Callable[[str], None]] = None,
        extra_env: Optional[dict[str, str]] = None
    ) -> subprocess.Popen:
        if run_id in self._processes:
            self.stop(run_id)

        env = os.environ.copy()
        env["PYTHONUNBUFFERED"] = "1"
        env["PYTHONIOENCODING"] = "utf-8"
        if extra_env:
            env.update(extra_env)

        # Strip leading KEY=VALUE env assignments (e.g. PORT=3000 npm start)
        actual_cmd = list(cmd)
        while actual_cmd and "=" in actual_cmd[0] and not actual_cmd[0].startswith("-"):
            k, v = actual_cmd.pop(0).split("=", 1)
            if k.isidentifier():
                env[k] = v
            else:
                actual_cmd.insert(0, f"{k}={v}")
                break

        if actual_cmd and os.name == "nt":
            exe_lower = actual_cmd[0].lower()
            if exe_lower in ("npm", "yarn", "pnpm", "npx"):
                actual_cmd[0] = f"{actual_cmd[0]}.cmd"

        process = subprocess.Popen(
            actual_cmd,
            cwd=str(cwd),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
            env=env
        )
        self._processes[run_id] = process

        if log_cb and process.stdout:
            def _stream_output():
                for line in iter(process.stdout.readline, ""):
                    log_cb(line.rstrip())
                if process.stdout:
                    process.stdout.close()

            threading.Thread(target=_stream_output, daemon=True).start()

        return process

    def stop(self, run_id: str) -> bool:
        keys_to_stop = [
            k for k in list(self._processes.keys())
            if k == run_id or k.startswith(f"{run_id}:")
        ]
        if not keys_to_stop:
            return False

        for key in keys_to_stop:
            process = self._processes.get(key)
            if not process:
                continue
            try:
                if os.name == "nt":
                    subprocess.run(
                        ["taskkill", "/F", "/T", "/PID", str(process.pid)],
                        capture_output=True,
                        check=False
                    )
                else:
                    process.terminate()
                    process.wait(timeout=3)
            except Exception:
                try:
                    process.kill()
                except Exception:
                    pass
            finally:
                self._processes.pop(key, None)
        return True

    def get_process(self, run_id: str) -> Optional[subprocess.Popen]:
        return self._processes.get(run_id)

    async def check_health(self, port: int, timeout_seconds: float = 5.0, run_id: Optional[str] = None) -> bool:
        url = f"http://127.0.0.1:{port}"
        loop = asyncio.get_running_loop()
        start_time = loop.time()

        # Give process a tiny moment to start or fail on invalid args
        await asyncio.sleep(0.4)

        async with httpx.AsyncClient() as client:
            while (loop.time() - start_time) < timeout_seconds:
                if run_id and run_id in self._processes:
                    if self._processes[run_id].poll() is not None:
                        return False
                try:
                    res = await client.get(url, timeout=0.5)
                    if res.status_code in [200, 301, 302, 404]:
                        if run_id and run_id in self._processes:
                            if self._processes[run_id].poll() is not None:
                                return False
                        return True
                except (httpx.ConnectError, httpx.TimeoutException):
                    await asyncio.sleep(0.25)
        return False
