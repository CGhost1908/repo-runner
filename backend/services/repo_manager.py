import re
import subprocess
from pathlib import Path
from backend.config import Settings
from backend.models import RunRequest
from backend.services.project_meta import ProjectMetaManager

class RepoManager:
    def __init__(self, settings: Settings):
        self.settings = settings

    def prepare_repo(self, request: RunRequest, run_id: str) -> Path:
        if request.local_path:
            clean_str = request.local_path.strip().strip('"').strip("'")
            local_path = Path(clean_str).resolve()
            if not local_path.exists() or not local_path.is_dir():
                raise FileNotFoundError(f"Local path does not exist or is not a directory: {clean_str}")
            # Ensure metadata exists for local repository
            ProjectMetaManager.get_meta(local_path)
            return local_path

        if request.repo_url:
            return self._clone_repo(request.repo_url, run_id)

        raise ValueError("Either 'repo_url' or 'local_path' must be provided.")

    def _clone_repo(self, repo_url: str, run_id: str) -> Path:
        repo_name, repo_owner, clean_url = ProjectMetaManager.parse_repo_info(repo_url)

        # 1. Check if a previously prepared workspace with .venv already exists for this repo
        if self.settings.workspace_dir.exists():
            candidates = []
            for d in self.settings.workspace_dir.iterdir():
                if not d.is_dir() or d.name.startswith("det_"):
                    continue
                meta = ProjectMetaManager.get_meta(d)
                # Check url match or clean name match
                if (meta.get("repo_url") and meta.get("repo_url").lower() == clean_url.lower()) or \
                   (meta.get("repo_name") == repo_name and (meta.get("repo_owner") == repo_owner or repo_owner == "Local")) or \
                   (d.name == repo_name or d.name.endswith(f"_{repo_name}")):
                    if (d / ".git").exists():
                        candidates.append((d, meta))

            # Prefer candidates that already have .venv or successful recipe
            successful = [c[0] for c in candidates if c[1].get("last_run_status") == "SUCCESS"]
            if successful:
                return sorted(successful, key=lambda x: x.stat().st_mtime, reverse=True)[0]

            with_venv = [c[0] for c in candidates if (c[0] / ".venv").exists()]
            if with_venv:
                return sorted(with_venv, key=lambda x: x.stat().st_mtime, reverse=True)[0]

            if candidates:
                return sorted([c[0] for c in candidates], key=lambda x: x.stat().st_mtime, reverse=True)[0]

        # 2. Name cleanly by project name (e.g. "iso-cartoon-talker")
        target_dir = self.settings.workspace_dir / repo_name
        if target_dir.exists():
            existing_meta = ProjectMetaManager.get_meta(target_dir)
            # If same repo or empty, use it
            if existing_meta.get("repo_owner") in (repo_owner, "Local") or not any(target_dir.iterdir()):
                pass
            else:
                # Name collision with different owner: disambiguate cleanly
                target_dir = self.settings.workspace_dir / f"{repo_owner}_{repo_name}"

        if target_dir.exists() and (target_dir / ".git").exists():
            ProjectMetaManager.get_meta(target_dir)
            return target_dir

        target_dir.mkdir(parents=True, exist_ok=True)

        cmd = ["git", "clone", "--depth", "1", repo_url, str(target_dir)]
        result = subprocess.run(cmd, capture_output=True, text=True, check=False)
        if result.returncode != 0:
            raise RuntimeError(f"Git clone failed: {result.stderr.strip()}")

        # Initialize and save metadata
        meta = ProjectMetaManager.get_meta(target_dir)
        meta["repo_name"] = repo_name
        meta["repo_owner"] = repo_owner
        meta["repo_url"] = clean_url
        ProjectMetaManager.save_meta(target_dir, meta)

        return target_dir
