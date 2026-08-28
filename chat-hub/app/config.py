"""Configurações do chatHub."""

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8765"))

# Perfis que podem criar salas
ROOM_CREATOR_PROFILES = frozenset({"admin", "host", "host_member"})

# Perfis válidos no sistema
VALID_PROFILES = frozenset({"admin", "host", "member", "host_member"})

# PostgreSQL
POSTGRES_USER = os.getenv("POSTGRES_USER", "chathub")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "chathub")
POSTGRES_DB = os.getenv("POSTGRES_DB", "chathub")
POSTGRES_HOST = os.getenv("POSTGRES_HOST", "localhost")
POSTGRES_PORT = os.getenv("POSTGRES_PORT", "5432")


def _build_database_url() -> str:
    return (
        f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}"
        f"@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"
    )


DATABASE_URL = os.getenv("DATABASE_URL") or _build_database_url()
