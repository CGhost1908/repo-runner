import json
import re
import time
from pathlib import Path
from typing import Optional, Tuple, Dict, Any

META_FILENAME = ".repo-runner-meta.json"

class ProjectMetaManager:
    @staticmethod
    def parse_repo_info(repo_url_or_path: str, local_dir: Optional[Path] = None) -> Tuple[str, str, str]:
        """
        Parses repo URL or local path to extract (repo_name, repo_owner, repo_url).
        Examples:
          https://github.com/CGhost1908/iso-cartoon-talker -> ("iso-cartoon-talker", "CGhost1908", url)
          git@github.com:foo/bar.git -> ("bar", "foo", url)
          Local directory -> Checks .git/config or falls back to folder name
        """
        clean_input = (repo_url_or_path or "").strip()

        # Check git remote in local_dir if available
        if local_dir and (local_dir / ".git" / "config").exists():
            try:
                git_cfg = (local_dir / ".git" / "config").read_text(encoding="utf-8", errors="ignore")
                match = re.search(r'url\s*=\s*([^\r\n]+)', git_cfg)
                if match:
                    remote_url = match.group(1).strip()
                    if remote_url and not clean_input:
                        clean_input = remote_url
            except Exception:
                pass

        # Parse GitHub / GitLab / Bitbucket remote URLs
        is_remote_url = clean_input.startswith("http://") or clean_input.startswith("https://") or clean_input.startswith("git@")
        if is_remote_url:
            url_match = re.search(r'[:/]([a-zA-Z0-9_\-]+)/([a-zA-Z0-9_\-\.]+?)(?:\.git)?/?$', clean_input)
            if url_match:
                owner = url_match.group(1)
                raw_repo = url_match.group(2)
                if raw_repo.endswith(".git"):
                    raw_repo = raw_repo[:-4]
                repo_name = re.sub(r"[^a-zA-Z0-9_\-]", "_", raw_repo)
                return repo_name, owner, clean_input

        # Local folder fallback
        folder_name = Path(clean_input).name if clean_input else (local_dir.name if local_dir else "project")
        # Strip legacy 8-hex hash if present (e.g. 62481d6f_iso-cartoon-talker -> iso-cartoon-talker)
        hash_match = re.match(r'^[0-9a-f]{8}_(.*)$', folder_name)
        if hash_match:
            repo_name = hash_match.group(1)
        else:
            repo_name = folder_name

        return repo_name, "Local", clean_input

    @classmethod
    def get_meta(cls, repo_dir: Path) -> Dict[str, Any]:
        """
        Loads existing .repo-runner-meta.json or synthesizes and saves default metadata.
        """
        meta_file = repo_dir / META_FILENAME
        if meta_file.exists():
            try:
                with open(meta_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    # Validate basic keys
                    if "repo_name" in data and "repo_owner" in data:
                        return data
            except Exception:
                pass

        # Synthesize from directory and git config
        repo_name, repo_owner, repo_url = cls.parse_repo_info("", local_dir=repo_dir)
        try:
            mtime = repo_dir.stat().st_mtime
        except Exception:
            mtime = time.time()

        # Check if venv already exists (indicates it might have been provisioned before)
        has_venv = (repo_dir / ".venv").exists()
        last_status = "SUCCESS" if has_venv else "NEVER_RUN"
        last_run = mtime if has_venv else 0

        data = {
            "id": repo_dir.name,
            "repo_name": repo_name,
            "repo_owner": repo_owner,
            "repo_url": repo_url,
            "path": repo_dir.as_posix(),
            "created_at": mtime,
            "last_run_at": last_run,
            "last_run_status": last_status,
            "saved_recipe": None
        }

        cls.save_meta(repo_dir, data)
        return data

    @classmethod
    def save_meta(cls, repo_dir: Path, data: Dict[str, Any]) -> None:
        """
        Saves metadata atomically to .repo-runner-meta.json
        """
        try:
            meta_file = repo_dir / META_FILENAME
            temp_file = repo_dir / f"{META_FILENAME}.tmp"
            with open(temp_file, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            temp_file.replace(meta_file)
        except Exception as e:
            print(f"[ProjectMetaManager] Failed to save metadata in {repo_dir}: {e}")

    @classmethod
    def record_run_result(
        cls,
        repo_dir: Path,
        status: str,
        recipe: Optional[Dict[str, Any]] = None,
        repo_url: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Records the outcome of a run (SUCCESS, FAILED, STOPPED).
        If SUCCESS and recipe provided, saves the exact execution instructions.
        """
        meta = cls.get_meta(repo_dir)
        meta["last_run_at"] = time.time()
        meta["last_run_status"] = status
        if repo_url and not meta.get("repo_url"):
            meta["repo_url"] = repo_url
            r_name, r_owner, _ = cls.parse_repo_info(repo_url, local_dir=repo_dir)
            if r_owner and r_owner != "Local":
                meta["repo_owner"] = r_owner
            if r_name:
                meta["repo_name"] = r_name

        if status == "SUCCESS" and recipe:
            meta["saved_recipe"] = {
                "framework": recipe.get("framework", "generic_python"),
                "install_command": recipe.get("install_command"),
                "run_command": recipe.get("run_command"),
                "port": recipe.get("port", 8000),
                "entrypoint": recipe.get("entrypoint"),
                "is_standard": recipe.get("is_standard", True),
                "services": recipe.get("services") or [],
                "env_vars": recipe.get("env_vars") or {}
            }
            if "framework" in recipe:
                meta["framework"] = recipe["framework"]

        cls.save_meta(repo_dir, meta)
        return meta

    @classmethod
    def find_cached_recipe(cls, repo_url_or_path: str, workspace_dir: Path) -> Optional[Tuple[Path, Dict[str, Any], Dict[str, Any]]]:
        """
        Searches workspace directories for a previous successful run of this repository.
        Returns (target_dir, saved_recipe, meta) if found, else None.
        """
        if not workspace_dir.exists():
            return None

        clean_input = (repo_url_or_path or "").strip()
        if not clean_input:
            return None

        # 1. If it's a direct local path
        local_candidate = Path(clean_input.strip('"').strip("'"))
        if local_candidate.exists() and local_candidate.is_dir():
            meta = cls.get_meta(local_candidate)
            if meta.get("last_run_status") == "SUCCESS" and meta.get("saved_recipe"):
                return local_candidate, meta["saved_recipe"], meta

        # 2. If it's a repo URL or name, find matching workspace directory
        target_name, target_owner, _ = cls.parse_repo_info(clean_input)
        target_name_lower = target_name.lower()

        candidates = []
        for d in workspace_dir.iterdir():
            if not d.is_dir() or d.name.startswith("det_"):
                continue

            meta = cls.get_meta(d)
            meta_name = (meta.get("repo_name") or d.name).lower()
            meta_owner = (meta.get("repo_owner") or "").lower()
            meta_url = (meta.get("repo_url") or "").lower()

            # Exact match by URL, or name + owner, or name
            is_match = False
            if clean_input.lower() in meta_url or (meta_url and meta_url in clean_input.lower()):
                is_match = True
            elif target_name_lower and (meta_name == target_name_lower or d.name.lower().endswith(f"_{target_name_lower}")):
                if target_owner and target_owner.lower() != "local":
                    if meta_owner == target_owner.lower() or target_owner.lower() in meta_url:
                        is_match = True
                    else:
                        is_match = True
                else:
                    is_match = True

            if is_match and meta.get("last_run_status") == "SUCCESS" and meta.get("saved_recipe"):
                candidates.append((d, meta["saved_recipe"], meta))

        if candidates:
            # Sort by last_run_at descending (most recent first)
            candidates.sort(key=lambda x: x[2].get("last_run_at", 0), reverse=True)
            return candidates[0]

        return None
