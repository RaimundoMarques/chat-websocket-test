"""Pool de conexões PostgreSQL (asyncpg)."""

from __future__ import annotations

from pathlib import Path

import asyncpg

from app.config import DATABASE_URL

_pool: asyncpg.Pool | None = None


async def connect() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=10)
    return _pool


async def close() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def is_connected() -> bool:
    return _pool is not None


def pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("Banco não conectado. Chame db.connect() no startup.")
    return _pool


async def ensure_schema() -> None:
    """Garante schema se o volume já existia sem init.sql (dev local)."""
    init_path = Path(__file__).resolve().parent.parent / "db" / "init.sql"
    sql = init_path.read_text(encoding="utf-8")
    async with pool().acquire() as conn:
        await conn.execute(sql)


async def reset_live_memberships() -> None:
    """Presença é do processo atual: limpa membros ao subir o servidor."""
    async with pool().acquire() as conn:
        await conn.execute("DELETE FROM room_members")
