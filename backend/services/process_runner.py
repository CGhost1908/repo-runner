import asyncio
import subprocess
import threading
import httpx
from pathlib import Path
from typing import Callable, Optional

class ProcessRunner:
    def __init__(self):
        self._processes: dict[str, subprocess.Popen] = {}

    def start(
        self,
        run_id: str,
        cmd: list[str],
        cwd: Path,
        log_cb: Optional[Callable[[str], None]] = None
    ) -> subprocess.Popen:
        if run_id in self._processes:
            self.stop(run_id)

        process = subprocess.Popen(
            cmd,
            cwd=str(cwd),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
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
        process = self._processes.get(run_id)
        if not process:
            return False

        try:
            process.terminate()
            process.wait(timeout=3)
        except Exception:
            process.kill()
        finally:
            if run_id in self._processes:
                del self._processes[run_id]
        return True

    def get_process(self, run_id: str) -> Optional[subprocess.Popen]:
        return self._processes.get(run_id)

    async def check_health(self, port: int, timeout_seconds: float = 5.0) -> bool:
        url = f"http://127.0.0.1:{port}"
        loop = asyncio.get_running_loop()
        start_time = loop.time()

        async with httpx.AsyncClient() as client:
            while (loop.time() - start_time) < timeout_seconds:
                try:
                    res = await client.get(url, timeout=0.5)
                    if res.status_code in [200, 301, 302, 404]:
                        return True
                except (httpx.ConnectError, httpx.TimeoutException):
                    await asyncio.sleep(0.2)
        return False
