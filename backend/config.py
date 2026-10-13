from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    workspace_dir: Path = Path.home() / ".repo-runner" / "workspaces"
    default_backend_port: int = 8000
    default_frontend_port: int = 3000
    port_pool: list[int] = [8000, 3000, 8001, 8002]

    model_config = SettingsConfigDict(env_prefix="REPO_RUNNER_")

def get_settings() -> Settings:
    settings = Settings()
    settings.workspace_dir.mkdir(parents=True, exist_ok=True)
    return settings
