"""Application settings loaded from environment / .env."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic import BaseModel, Field

_ENV_PATH = Path(__file__).resolve().parent.parent.parent / ".env"


def _load_dotenv() -> None:
    load_dotenv(_ENV_PATH)


class Settings(BaseModel):
    """Runtime configuration (Pydantic v2 model, values from env after load)."""

    APP_NAME: str = Field(default="KeeFoo")
    DATABASE_URL: str = Field(default="sqlite:///./keefoo_dev.db")
    DEBUG: bool = Field(default=True)
    SECRET_KEY: str = Field(default="dev-secret-change-in-production-use-32chars")
    DEEPSEEK_API_KEY: str = Field(default="")
    CLAUDE_API_KEY: str = Field(default="")
    TUSHARE_TOKEN: str = Field(default="")
    AKSHARE_CACHE_TTL: int = Field(default=60, ge=1)


@lru_cache
def get_settings() -> Settings:
    _load_dotenv()
    debug_raw = os.getenv("DEBUG", "True")
    return Settings(
        APP_NAME=os.getenv("APP_NAME", "KeeFoo"),
        DATABASE_URL=os.getenv("DATABASE_URL", "sqlite:///./keefoo_dev.db"),
        DEBUG=str(debug_raw).lower() in ("true", "1", "yes"),
        SECRET_KEY=os.getenv("SECRET_KEY", "dev-secret-change-in-production-use-32chars"),
        DEEPSEEK_API_KEY=os.getenv("DEEPSEEK_API_KEY", ""),
        CLAUDE_API_KEY=os.getenv("CLAUDE_API_KEY", ""),
        TUSHARE_TOKEN=os.getenv("TUSHARE_TOKEN", ""),
        AKSHARE_CACHE_TTL=int(os.getenv("AKSHARE_CACHE_TTL", "60") or "60"),
    )
