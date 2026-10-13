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

class RunRequest(BaseModel):
    repo_url: Optional[str] = None
    local_path: Optional[str] = None
    port: int = Field(default=8000, description="Target port for the application")
    mode: ExecutionMode = ExecutionMode.STANDARD
    preferred_env: Optional[ExecutionEnvironment] = None

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
    alt_ports: list[int] = Field(default_factory=lambda: [8001, 8002, 3000])
    preferred_env: str = "venv"
    workspace_dir: str = ""
