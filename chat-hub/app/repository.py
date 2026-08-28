"""Acesso ao PostgreSQL — operações simples do chatHub."""

from __future__ import annotations

from typing import Any

from app import db
from app.models import Room


async def upsert_user(
    user_id: str, username: str, profile: str, session_token: str
) -> str:
    """
    Garante usuário no banco e armazena o token da sessão ativa.
    Se username já existir (case-insensitive), reutiliza o id persistido e atualiza o session_token.
    Retorna o user_id definitivo.
    """
    async with db.pool().acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id FROM users WHERE LOWER(username) = LOWER($1)", username
        )
        if row:
            await conn.execute(
                """
                UPDATE users
                   SET profile = $2, session_token = $3, updated_at = NOW()
                 WHERE id = $1
                """,
                row["id"],
                profile,
                session_token,
            )
            return row["id"]

        await conn.execute(
            """
            INSERT INTO users (id, username, profile, session_token)
            VALUES ($1, $2, $3, $4)
            """,
            user_id,
            username,
            profile,
            session_token,
        )
        return user_id


async def get_user_session_token(user_id: str) -> str | None:
    async with db.pool().acquire() as conn:
        return await conn.fetchval(
            "SELECT session_token FROM users WHERE id = $1", user_id
        )


async def clear_user_session(user_id: str, session_token: str | None = None) -> None:
    async with db.pool().acquire() as conn:
        if session_token:
            await conn.execute(
                "UPDATE users SET session_token = NULL, updated_at = NOW() WHERE id = $1 AND session_token = $2",
                user_id,
                session_token,
            )
        else:
            await conn.execute(
                "UPDATE users SET session_token = NULL, updated_at = NOW() WHERE id = $1",
                user_id,
            )


async def list_all_users() -> list[dict[str, Any]]:
    async with db.pool().acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, username, profile FROM users ORDER BY username ASC"
        )
    return [
        {"user_id": row["id"], "username": row["username"], "profile": row["profile"]}
        for row in rows
    ]


async def create_room(room: Room) -> None:
    async with db.pool().acquire() as conn, conn.transaction():
        await conn.execute(
            """
            INSERT INTO rooms (id, name, created_by, is_private)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                is_private = EXCLUDED.is_private
            """,
            room.room_id,
            room.name,
            room.created_by,
            room.is_private,
        )
        for username in room.allowed_usernames:
            await conn.execute(
                """
                INSERT INTO room_allowed_users (room_id, username)
                VALUES ($1, $2)
                ON CONFLICT DO NOTHING
                """,
                room.room_id,
                username,
            )
        for uid in room.member_ids:
            await conn.execute(
                """
                INSERT INTO room_members (room_id, user_id)
                VALUES ($1, $2)
                ON CONFLICT DO NOTHING
                """,
                room.room_id,
                uid,
            )


async def add_room_allowed_user(room_id: str, username: str) -> None:
    async with db.pool().acquire() as conn:
        await conn.execute(
            """
            INSERT INTO room_allowed_users (room_id, username)
            VALUES ($1, $2)
            ON CONFLICT DO NOTHING
            """,
            room_id,
            username,
        )


async def remove_room_allowed_user(room_id: str, username: str) -> None:
    async with db.pool().acquire() as conn:
        await conn.execute(
            "DELETE FROM room_allowed_users WHERE room_id = $1 AND username = $2",
            room_id,
            username,
        )


async def add_member(room_id: str, user_id: str) -> None:
    async with db.pool().acquire() as conn:
        await conn.execute(
            """
            INSERT INTO room_members (room_id, user_id)
            VALUES ($1, $2)
            ON CONFLICT DO NOTHING
            """,
            room_id,
            user_id,
        )


async def remove_member(room_id: str, user_id: str) -> None:
    async with db.pool().acquire() as conn:
        await conn.execute(
            "DELETE FROM room_members WHERE room_id = $1 AND user_id = $2",
            room_id,
            user_id,
        )


async def delete_room(room_id: str) -> None:
    async with db.pool().acquire() as conn:
        await conn.execute("DELETE FROM rooms WHERE id = $1", room_id)


async def list_rooms() -> list[dict[str, Any]]:
    async with db.pool().acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT r.id, r.name, r.created_by, r.is_private,
                   COALESCE(
                     array_agg(DISTINCT m.user_id) FILTER (WHERE m.user_id IS NOT NULL),
                     '{}'
                   ) AS members,
                   COALESCE(
                     array_agg(DISTINCT a.username) FILTER (WHERE a.username IS NOT NULL),
                     '{}'
                   ) AS allowed_usernames
              FROM rooms r
              LEFT JOIN room_members m ON m.room_id = r.id
              LEFT JOIN room_allowed_users a ON a.room_id = r.id
             GROUP BY r.id
             ORDER BY r.created_at
            """
        )
    rooms = []
    for row in rows:
        members = list(row["members"] or [])
        allowed = list(row["allowed_usernames"] or [])
        rooms.append(
            {
                "room_id": row["id"],
                "name": row["name"],
                "created_by": row["created_by"],
                "is_private": bool(row["is_private"]),
                "members": sorted(members),
                "member_count": len(members),
                "allowed_usernames": sorted(allowed),
            }
        )
    return rooms


async def load_rooms_into(target: dict[str, Room]) -> None:
    """Carrega salas do banco (sem membros ativos — presença é em memória)."""
    async with db.pool().acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT r.id, r.name, r.created_by, r.is_private,
                   COALESCE(
                     array_agg(DISTINCT a.username) FILTER (WHERE a.username IS NOT NULL),
                     '{}'
                   ) AS allowed_usernames
              FROM rooms r
              LEFT JOIN room_allowed_users a ON a.room_id = r.id
             GROUP BY r.id
             ORDER BY r.created_at
            """
        )
    for row in rows:
        allowed = set(row["allowed_usernames"] or [])
        target[row["id"]] = Room(
            room_id=row["id"],
            name=row["name"],
            created_by=row["created_by"],
            is_private=bool(row["is_private"]),
            member_ids=set(),
            allowed_usernames=allowed,
        )


async def save_message(room_id: str, user_id: str, text: str) -> dict[str, Any]:
    async with db.pool().acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO messages (room_id, user_id, text)
            VALUES ($1, $2, $3)
            RETURNING id, created_at
            """,
            room_id,
            user_id,
            text,
        )
    return {"id": row["id"], "created_at": row["created_at"]}


async def list_room_messages(room_id: str) -> list[dict[str, Any]]:
    async with db.pool().acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT m.id, m.text, m.created_at,
                   u.id AS user_id, u.username, u.profile
              FROM messages m
              JOIN users u ON u.id = m.user_id
             WHERE m.room_id = $1
             ORDER BY m.created_at, m.id
            """,
            room_id,
        )
    return [
        {
            "id": row["id"],
            "from_user": {
                "user_id": row["user_id"],
                "username": row["username"],
                "profile": row["profile"],
                "room_id": room_id,
            },
            "text": row["text"],
            "ts": row["created_at"].isoformat(),
        }
        for row in rows
    ]
