"""Acesso ao PostgreSQL — operações simples do chatHub."""

from __future__ import annotations

from typing import Any

from app import db
from app.models import Room


async def upsert_user(user_id: str, username: str, profile: str) -> str:
    """
    Garante usuário no banco.
    Se username já existir, reutiliza o id persistido e atualiza o profile.
    Retorna o user_id definitivo.
    """
    async with db.pool().acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id FROM users WHERE username = $1", username
        )
        if row:
            await conn.execute(
                """
                UPDATE users
                   SET profile = $2, updated_at = NOW()
                 WHERE id = $1
                """,
                row["id"],
                profile,
            )
            return row["id"]

        await conn.execute(
            """
            INSERT INTO users (id, username, profile)
            VALUES ($1, $2, $3)
            """,
            user_id,
            username,
            profile,
        )
        return user_id


async def create_room(room: Room) -> None:
    async with db.pool().acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                """
                INSERT INTO rooms (id, name, created_by)
                VALUES ($1, $2, $3)
                """,
                room.room_id,
                room.name,
                room.created_by,
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
            SELECT r.id, r.name, r.created_by,
                   COALESCE(
                     array_agg(m.user_id) FILTER (WHERE m.user_id IS NOT NULL),
                     '{}'
                   ) AS members
              FROM rooms r
              LEFT JOIN room_members m ON m.room_id = r.id
             GROUP BY r.id
             ORDER BY r.created_at
            """
        )
    rooms = []
    for row in rows:
        members = list(row["members"] or [])
        rooms.append(
            {
                "room_id": row["id"],
                "name": row["name"],
                "created_by": row["created_by"],
                "members": sorted(members),
                "member_count": len(members),
            }
        )
    return rooms


async def load_rooms_into(target: dict[str, Room]) -> None:
    """Carrega salas do banco (sem membros ativos — presença é em memória)."""
    async with db.pool().acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, name, created_by FROM rooms ORDER BY created_at"
        )
    for row in rows:
        target[row["id"]] = Room(
            room_id=row["id"],
            name=row["name"],
            created_by=row["created_by"],
            member_ids=set(),
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
