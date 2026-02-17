import json
import os
from pydantic import BaseModel, Field
from typing import Optional, List

class ServerConfig(BaseModel):
    host: str = "0.0.0.0"
    port: int = 8001
    reload: bool = True

class AIConfig(BaseModel):
    api_key: str
    model: str = "gemini-2.0-flash"

class ObsidianConfig(BaseModel):
    vault_path: Optional[str] = None
    persist_directory: Optional[str] = None
    api_key: Optional[str] = None
    url: str = "http://host.docker.internal:27123"

class FilesystemConfig(BaseModel):
    allowed_paths: List[str] = Field(default_factory=list)

class AppConfig(BaseModel):
    server: ServerConfig = Field(default_factory=ServerConfig)
    ai: AIConfig
    obsidian: ObsidianConfig
    filesystem: Optional[FilesystemConfig] = None

def load_config(config_path: Optional[str] = None) -> AppConfig:
    """
    Loads configuration by merging:
    1. Base structure from elo.config.json
    2. Sensitive data from environment variables (.env)
    3. Docker-specific path automation
    """
    # 1. Find and load elo.config.json
    possible_json_paths = [
        "elo.config.json",
        "/app/elo.config.json",
        os.path.join(os.path.dirname(__file__), "..", "..", "elo.config.json"),
        os.path.join(os.path.dirname(__file__), "..", "..", "..", "elo.config.json")
    ]
    
    config_dict = {}
    for p in possible_json_paths:
        if os.path.exists(p):
            with open(p, "r") as f:
                config_dict = json.load(f)
            break
            
    # 2. Map JSON keys to AppConfig structure (handling flattening/renaming)
    # We want to preserve the internal AppConfig structure for the rest of the app.
    
    # AI Config
    ai_data = config_dict.get("ai", {})
    ai_config = {
        "api_key": os.getenv("GOOGLE_API_KEY", ""),
        "model": ai_data.get("model", os.getenv("AI_MODEL", "gemini-2.0-flash"))
    }
    
    # Obsidian Config
    obs_data = config_dict.get("obsidian", {})
    obs_config = {
        "vault_path": os.getenv("VAULT_PATH"),
        "api_key": os.getenv("OBSIDIAN_API_KEY"),
        "url": obs_data.get("url", os.getenv("OBSIDIAN_URL", "http://host.docker.internal:27123")),
        "persist_directory": os.getenv("PERSIST_DIRECTORY")
    }
    
    # Server Config (mostly defaults or env)
    server_config = {
        "host": os.getenv("SERVER_HOST", "0.0.0.0"),
        "port": int(os.getenv("SERVER_PORT", 8001)),
        "reload": os.getenv("SERVER_RELOAD", "true").lower() == "true"
    }

    full_config_dict = {
        "server": server_config,
        "ai": ai_config,
        "obsidian": obs_config
    }
    
    config = AppConfig(**full_config_dict)
    
    # 3. Automate vault_path for Docker
    is_docker = os.path.exists("/.dockerenv") or os.environ.get("DOCKER_CONTAINER") == "true"
    
    if not config.obsidian.vault_path:
        if is_docker and os.path.exists("/data/vault"):
            config.obsidian.vault_path = "/data/vault"

    # 4. Automate filesystem allowed_paths for Docker
    if is_docker:
        config.filesystem = FilesystemConfig(allowed_paths=["/app", "/data/vault"])

    # 5. Automate persist_directory resolution
    if config.obsidian:
        # Default to 'workspace/chromadb' if not set
        if not config.obsidian.persist_directory:
            if is_docker:
                config.obsidian.persist_directory = "/app/workspace/chromadb"
            else:
                config.obsidian.persist_directory = os.path.abspath("workspace/chromadb")
            
    return config
