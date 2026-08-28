"""Acesso ao PostgreSQL — operações simples do chatHub."""

from __future__ import annotations

from typing import Any
from uuid import uuid4

from app import db
from app.models import Room, Unit
from app.security import hash_password, verify_password


async def ensure_seed_data() -> None:
    """Garante dados iniciais de units (ICCT, F1, F2) e usuário admin."""
    async with db.pool().acquire() as conn:
        # Units padrão: ICCT, F1, F2
        await conn.execute(
            """
            INSERT INTO units (id, name)
            VALUES
                ('ICCT', 'Instituto Cal-Comp de Tecnologia e Inovação'),
                ('F1', 'Fábrica F1'),
                ('F2', 'Fábrica F2')
            ON CONFLICT (id) DO NOTHING
            """
        )

        # Usuário admin padrão
        admin_row = await conn.fetchrow(
            "SELECT id, password_hash FROM users WHERE LOWER(username) = 'admin'"
        )
        admin_hash = hash_password("admin123")
        if not admin_row:
            await conn.execute(
                """
                INSERT INTO users (id, username, password_hash, profile, unit_id)
                VALUES ($1, 'admin', $2, 'admin', 'ICCT')
                """,
                str(uuid4())[:8],
                admin_hash,
            )
        else:
            # Garante perfil 'admin' e redefine a senha do admin para 'admin123' se estiver sem senha ou com senha padrão de migração 'user123'
            current_hash = admin_row["password_hash"] or ""
            should_reset = (
                not current_hash
                or verify_password("user123", current_hash)
            )
            new_hash = admin_hash if should_reset else current_hash

            await conn.execute(
                """
                UPDATE users
                   SET profile = 'admin',
                       password_hash = $2,
                       unit_id = COALESCE(unit_id, 'ICCT')
                 WHERE id = $1
                """,
                admin_row["id"],
                new_hash,
            )

        # Migra outros usuários legados que possam ter ficado sem hash ou sem unit_id
        legacy_users = await conn.fetch(
            "SELECT id, username, password_hash, unit_id FROM users WHERE LOWER(username) != 'admin'"
        )
        default_user_hash = hash_password("user123")
        for u in legacy_users:
            new_pwd = u["password_hash"] if u["password_hash"] else default_user_hash
            new_unit = u["unit_id"] if u["unit_id"] else "ICCT"
            await conn.execute(
                """
                UPDATE users
                   SET password_hash = $2,
                       unit_id = $3
                 WHERE id = $1
                """,
                u["id"],
                new_pwd,
                new_unit,
            )


async def authenticate_user(
    username: str, password: str, session_token: str
) -> tuple[dict[str, Any] | None, str | None]:
    """
    Autentica usuário por username e senha.
    Retorna (user_dict, None) em caso de sucesso ou (None, error_code).
    """
    async with db.pool().acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT u.id, u.username, u.password_hash, u.profile,
                   u.unit_id, un.name AS unit_name
              FROM users u
              LEFT JOIN units un ON un.id = u.unit_id
             WHERE LOWER(u.username) = LOWER($1)
            """,
            username.strip(),
        )
        if not row:
            return None, "user_not_found"

        if not verify_password(password, row["password_hash"]):
            return None, "invalid_password"

        await conn.execute(
            """
            UPDATE users
               SET session_token = $2, updated_at = NOW()
             WHERE id = $1
            """,
            row["id"],
            session_token,
        )

        return {
            "user_id": row["id"],
            "username": row["username"],
            "profile": row["profile"],
            "unit_id": row["unit_id"] or "ICCT",
            "unit_name": row["unit_name"] or (row["unit_id"] or "ICCT"),
            "session_token": session_token,
        }, None


async def authenticate_user_by_token(
    user_id: str, session_token: str
) -> tuple[dict[str, Any] | None, str | None]:
    """
    Autentica usuário pelo session_token gravado no banco de dados.
    """
    if not user_id or not session_token:
        return None, "invalid_session"

    async with db.pool().acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT u.id, u.username, u.profile,
                   u.unit_id, un.name AS unit_name, u.session_token
              FROM users u
              LEFT JOIN units un ON un.id = u.unit_id
             WHERE u.id = $1
            """,
            user_id.strip(),
        )
        if not row:
            return None, "user_not_found"

        if not row["session_token"] or row["session_token"] != session_token:
            return None, "invalid_session"

        return {
            "user_id": row["id"],
            "username": row["username"],
            "profile": row["profile"],
            "unit_id": row["unit_id"] or "ICCT",
            "unit_name": row["unit_name"] or (row["unit_id"] or "ICCT"),
            "session_token": session_token,
        }, None


async def create_user(
    username: str,
    password: str,
    profile: str,
    unit_id: str = "ICCT",
) -> tuple[dict[str, Any] | None, str | None]:
    """Cria novo usuário com senha hasheada."""
    username = username.strip()
    if not username:
        return None, "invalid_username"
    if not password or len(password) < 3:
        return None, "invalid_password_length"

    async with db.pool().acquire() as conn:
        exists = await conn.fetchval(
            "SELECT 1 FROM users WHERE LOWER(username) = LOWER($1)", username
        )
        if exists:
            return None, "user_already_exists"

        user_id = str(uuid4())[:8]
        pwd_hash = hash_password(password)

        await conn.execute(
            """
            INSERT INTO users (id, username, password_hash, profile, unit_id)
            VALUES ($1, $2, $3, $4, $5)
            """,
            user_id,
            username,
            pwd_hash,
            profile,
            unit_id,
        )

        return {
            "user_id": user_id,
            "username": username,
            "profile": profile,
            "unit_id": unit_id,
        }, None


async def update_user(
    user_id: str,
    profile: str,
    unit_id: str,
) -> tuple[bool, str | None]:
    """Atualiza dados de um usuário pelo Admin."""
    async with db.pool().acquire() as conn:
        res = await conn.execute(
            """
            UPDATE users
               SET profile = $2,
                   unit_id = $3,
                   updated_at = NOW()
             WHERE id = $1
            """,
            user_id,
            profile,
            unit_id,
        )
        if res == "UPDATE 0":
            return False, "user_not_found"
        return True, None


async def admin_reset_password(user_id: str, new_password: str) -> tuple[bool, str | None]:
    """Redefine a senha de um usuário."""
    if not new_password or len(new_password) < 3:
        return False, "invalid_password_length"

    pwd_hash = hash_password(new_password)
    async with db.pool().acquire() as conn:
        res = await conn.execute(
            "UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1",
            user_id,
            pwd_hash,
        )
        if res == "UPDATE 0":
            return False, "user_not_found"
        return True, None


async def update_profile(user_id: str, profile: str) -> None:
    async with db.pool().acquire() as conn:
        await conn.execute(
            "UPDATE users SET profile = $2, updated_at = NOW() WHERE id = $1",
            user_id,
            profile,
        )


async def list_units() -> list[dict[str, Any]]:
    async with db.pool().acquire() as conn:
        rows = await conn.fetch("SELECT id, name FROM units ORDER BY id ASC")
    return [{"id": r["id"], "name": r["name"]} for r in rows]


async def create_unit(
    unit_id: str, name: str
) -> tuple[dict[str, Any] | None, str | None]:
    unit_id = unit_id.strip().upper()
    name = name.strip()
    if not unit_id or not name:
        return None, "invalid_unit_data"

    async with db.pool().acquire() as conn:
        exists = await conn.fetchval(
            "SELECT 1 FROM units WHERE id = $1", unit_id
        )
        if exists:
            return None, "unit_already_exists"

        await conn.execute(
            """
            INSERT INTO units (id, name)
            VALUES ($1, $2)
            """,
            unit_id,
            name,
        )
        return {"id": unit_id, "name": name}, None


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
            """
            SELECT u.id, u.username, u.profile,
                   u.unit_id,
                   un.name AS unit_name
              FROM users u
              LEFT JOIN units un ON un.id = u.unit_id
             ORDER BY u.username ASC
            """
        )
    return [
        {
            "user_id": row["id"],
            "username": row["username"],
            "profile": row["profile"],
            "unit_id": row["unit_id"] or "ICCT",
            "unit_name": row["unit_name"] or (row["unit_id"] or "ICCT"),
        }
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
