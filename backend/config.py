"""Configuration loader for Quran-AI backend.

Loads settings lazily without raising at import time and avoids reading `.env`
files during pytest runs or when `load_dotenv_file=False`.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

DEFAULT_CORS_ORIGINS: tuple[str, ...] = (
    "http://localhost:3000",
    "http://127.0.0.1:3000",
)

DEFAULT_OPENROUTER_MODEL = "nvidia/nemotron-3.5-lightning:free"
RETIRED_OPENROUTER_MODELS: frozenset[str] = frozenset({
    "meta-llama/llama-3.3-70b-instruct:free",
    "openrouter/free",
})

_PLACEHOLDER_OPENROUTER = "your_openrouter_api_key_here"
_PLACEHOLDER_TAVILY = "your_tavily_api_key_here"


def parse_cors_origins(raw: str | None) -> tuple[str, ...]:
    """Parse comma-separated CORS origins, never allowing wildcard `*`."""
    if not raw:
        return DEFAULT_CORS_ORIGINS
    origins = tuple(
        origin.strip().rstrip("/")
        for origin in raw.split(",")
        if origin.strip() and origin.strip() != "*"
    )
    return origins if origins else DEFAULT_CORS_ORIGINS


@dataclass(frozen=True, slots=True)
class Settings:
    """Immutable application settings."""

    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_model: str = DEFAULT_OPENROUTER_MODEL
    tavily_api_key: str = ""
    cors_origins: tuple[str, ...] = DEFAULT_CORS_ORIGINS
    alquran_api_base: str = "https://api.alquran.cloud/v1"
    quran_com_api_base: str = "https://api.quran.com/api/v4"
    http_timeout_seconds: float = 12.0
    cache_ttl_seconds: int = 3600
    cache_max_entries: int = 512
    max_agent_turns: int = 6
    app_version: str = "3.0"

    @property
    def ai_configured(self) -> bool:
        """Return True if a non-placeholder OpenRouter key is configured."""
        key = self.openrouter_api_key.strip()
        return bool(key and key != _PLACEHOLDER_OPENROUTER)

    @property
    def tavily_configured(self) -> bool:
        """Return True if a non-placeholder Tavily key is configured."""
        key = self.tavily_api_key.strip()
        return bool(key and key != _PLACEHOLDER_TAVILY)


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if not raw:
        return default
    try:
        val = float(raw)
        return val if val > 0 else default
    except ValueError:
        return default


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if not raw:
        return default
    try:
        val = int(raw)
        return val if val > 0 else default
    except ValueError:
        return default


def load_settings(load_dotenv_file: bool = False) -> Settings:
    """Build Settings from environment variables.

    Skips loading `backend/.env` when `load_dotenv_file` is False or when
    running under pytest (`PYTEST_CURRENT_TEST` present in `os.environ`).
    """
    if load_dotenv_file and "PYTEST_CURRENT_TEST" not in os.environ:
        dotenv_path = Path(__file__).with_name(".env")
        if dotenv_path.is_file():
            load_dotenv(dotenv_path, override=False)

    raw_model = os.getenv("OPENROUTER_MODEL", DEFAULT_OPENROUTER_MODEL).strip()
    if not raw_model or raw_model in RETIRED_OPENROUTER_MODELS:
        raw_model = DEFAULT_OPENROUTER_MODEL

    return Settings(
        openrouter_api_key=os.getenv("OPENROUTER_API_KEY", "").strip(),
        openrouter_base_url=os.getenv(
            "OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"
        ).strip()
        or "https://openrouter.ai/api/v1",
        openrouter_model=raw_model,
        tavily_api_key=os.getenv("TAVILY_API_KEY", "").strip(),
        cors_origins=parse_cors_origins(os.getenv("CORS_ORIGINS")),
        alquran_api_base=os.getenv(
            "ALQURAN_API_BASE", "https://api.alquran.cloud/v1"
        ).rstrip("/"),
        quran_com_api_base=os.getenv(
            "QURAN_COM_API_BASE", "https://api.quran.com/api/v4"
        ).rstrip("/"),
        http_timeout_seconds=_env_float("HTTP_TIMEOUT_SECONDS", 12.0),
        cache_ttl_seconds=_env_int("CACHE_TTL_SECONDS", 3600),
        cache_max_entries=_env_int("CACHE_MAX_ENTRIES", 512),
        max_agent_turns=_env_int("MAX_AGENT_TURNS", 6),
    )
