from enum import Enum
from pathlib import Path
from typing import Optional
from pydantic import BaseModel, Field

class ExecutionMode(str, Enum):
    STANDARD = "standard"
    DEEP_AI = "deep_ai"

class ExecutionEnvironment(str, Enum):
    VENV = "venv"
    DOCKER = "docker"

class StatusEnum(str, Enum):
    IDLE = "idle"
    CLONING = "cloning"
    ANALYZING = "analyzing"
    AWAITING_HITL = "awaiting_hitl"
    INSTALLING = "installing"
    RUNNING = "running"
    STOPPED = "stopped"
    FAILED = "failed"

class EnvVarItem(BaseModel):
    key: str
    value: str = ""
    default_value: str = ""
    is_secret: bool = False
    is_empty: bool = True
    source: str = ".env"

class ServiceConfig(BaseModel):
    id: str = "backend"
    role: str = "backend"  # "backend" | "frontend" | "worker"
    name: str = "Backend API"
    framework: str = "generic"
    working_dir: str = "."
    install_command: Optional[str] = None
    run_command: Optional[str] = None
    port: int = 8000
    enabled: bool = True

class RunRequest(BaseModel):
    repo_url: Optional[str] = None
    local_path: Optional[str] = None
    port: int = Field(default=8000, description="Target port for the application")
    mode: ExecutionMode = ExecutionMode.STANDARD
    preferred_env: Optional[ExecutionEnvironment] = None
    custom_run_command: Optional[str] = None
    custom_install_command: Optional[str] = None
    services: Optional[list[ServiceConfig]] = None
    env_vars: Optional[dict[str, str]] = None

class DetectRequest(BaseModel):
    repo_url: Optional[str] = None
    local_path: Optional[str] = None
    port: int = Field(default=8000, description="Target port for the application")

class SavedRecipe(BaseModel):
    framework: str
    install_command: Optional[str] = None
    run_command: Optional[str] = None
    port: int = 8000
    entrypoint: Optional[str] = None
    is_standard: bool = True
    services: list[ServiceConfig] = Field(default_factory=list)
    env_vars: dict[str, str] = Field(default_factory=dict)

class DetectResponse(BaseModel):
    framework: str
    is_standard: bool
    install_command: Optional[str] = None
    run_command: Optional[str] = None
    has_dockerfile: bool = False
    entrypoint: Optional[str] = None
    detected_files: list[str] = Field(default_factory=list)
    project_name: str
    path: str
    repo_owner: Optional[str] = None
    cached: bool = False
    last_run_status: Optional[str] = None
    saved_recipe: Optional[SavedRecipe] = None
    services: list[ServiceConfig] = Field(default_factory=list)
    env_vars: list[EnvVarItem] = Field(default_factory=list)

class HitlDecisionRequest(BaseModel):
    run_id: str
    environment: ExecutionEnvironment
    proceed_deep_mode: bool = True

class RunStatus(BaseModel):
    run_id: str
    status: StatusEnum
    port: int
    framework: Optional[str] = None
    is_healthy: bool = False
    logs: list[str] = Field(default_factory=list)

class LogMessage(BaseModel):
    run_id: str
    level: str = "INFO"
    message: str
    timestamp: float

class UserSettings(BaseModel):
    ollama_url: str = "http://localhost:11434"
    openai_key: Optional[str] = ""
    gemini_key: Optional[str] = ""
    default_ai_engine: str = "ollama"
    default_port: int = 8000
    alt_ports: list[int] = Field(default_factory=lambda: [8000, 8001, 8002, 3000])
    preferred_env: str = "venv"
    workspace_dir: str = ""

class OpenBrowserRequest(BaseModel):
    url: str
