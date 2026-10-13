import re
import subprocess
from pathlib import Path
from backend.config import Settings
from backend.models import RunRequest

class RepoManager:
    def __init__(self, settings: Settings):
        self.settings = settings

    def prepare_repo(self, request: RunRequest, run_id: str) -> Path:
        if request.local_path:
            local_path = Path(request.local_path).resolve()
            if not local_path.exists() or not local_path.is_dir():
                raise FileNotFoundError(f"Local path does not exist or is not a directory: {request.local_path}")
            return local_path

        if request.repo_url:
            return self._clone_repo(request.repo_url, run_id)

        raise ValueError("Either 'repo_url' or 'local_path' must be provided.")

    def _clone_repo(self, repo_url: str, run_id: str) -> Path:
        raw_name = repo_url.rstrip("/").split("/")[-1]
        if raw_name.endswith(".git"):
            raw_name = raw_name[:-4]
        repo_name = re.sub(r"[^a-zA-Z0-9_\-]", "_", raw_name)
        target_dir = self.settings.workspace_dir / f"{run_id}_{repo_name}"
        target_dir.mkdir(parents=True, exist_ok=True)

        cmd = ["git", "clone", "--depth", "1", repo_url, str(target_dir)]
        result = subprocess.run(cmd, capture_output=True, text=True, check=False)
        if result.returncode != 0:
            raise RuntimeError(f"Git clone failed: {result.stderr.strip()}")

        return target_dir
