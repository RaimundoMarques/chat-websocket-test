"""Estado em memória + persistência PostgreSQL."""

from __future__ import annotations

from typing import Any

from app import db
from app import protocol as P
from app import repository as repo
from app.config import ROOM_CREATOR_PROFILES, VALID_PROFILES
from app.models import Room, User


class HubState:
    def __init__(self) -> None:
        self.users_by_ws: dict[Any, User] = {}
        self.users_by_id: dict[str, User] = {}
        self.rooms: dict[str, Room] = {}

    async def load_from_db(self) -> None:
        await repo.load_rooms_into(self.rooms)

    def get_user(self, websocket: Any) -> User | None:
        return self.users_by_ws.get(websocket)

    async def authenticate(
        self, websocket: Any, username: str, profile: str
    ) -> tuple[User | None, dict[str, Any]]:
        username = (username or "").strip()
        profile = (profile or "").strip().lower()

        if not username:
            return None, P.error("invalid_username", "Informe um username.")
        if profile not in VALID_PROFILES:
            return None, P.error(
                "invalid_profile",
                f"Perfil inválido. Use: {', '.join(sorted(VALID_PROFILES))}",
            )
        if any(u.username == username for u in self.users_by_id.values()):
            # Se for uma reconexão (ex: refresh de página rápido), desconecta o socket anterior
            old_user = next((u for u in self.users_by_id.values() if u.username == username), None)
            if old_user and old_user.websocket != websocket:
                await self.disconnect(old_user.websocket)
                try:
                    await old_user.websocket.close()
                except (OSError, RuntimeError):
                    pass

        if websocket in self.users_by_ws:
            await self.disconnect(websocket)

        user = User(username=username, profile=profile, websocket=websocket)
        user.user_id = await repo.upsert_user(user.user_id, username, profile)

        self.users_by_ws[websocket] = user
        self.users_by_id[user.user_id] = user
        return user, P.ok(P.AUTH_OK, user=user.to_public())

    async def change_profile(
        self, user: User, profile: str
    ) -> tuple[User | None, dict[str, Any]]:
        if user.room_id:
            return None, P.error(
                "in_room",
                "Saia da sala antes de trocar o perfil.",
            )

        profile = (profile or "").strip().lower()
        if profile not in VALID_PROFILES:
            return None, P.error(
                "invalid_profile",
                f"Perfil inválido. Use: {', '.join(sorted(VALID_PROFILES))}",
            )

        if user.profile == profile:
            return user, P.ok(P.PROFILE_CHANGED, user=user.to_public())

        user.profile = profile
        user.user_id = await repo.upsert_user(user.user_id, user.username, profile)
        return user, P.ok(P.PROFILE_CHANGED, user=user.to_public())

    async def create_room(
        self, user: User, name: str
    ) -> tuple[Room | None, dict[str, Any]]:
        if user.profile not in ROOM_CREATOR_PROFILES:
            return None, P.error(
                "forbidden",
                "Apenas usuários com perfil 'host' podem criar salas.",
            )
        if user.room_id:
            return None, P.error(
                "already_in_room", "Saia da sala atual antes de criar outra."
            )

        name = (name or "").strip()
        if not name:
            return None, P.error("invalid_room_name", "Informe o nome da sala.")

        room = Room(
            name=name,
            created_by=user.user_id,
        )
        room.member_ids.add(user.user_id)
        self.rooms[room.room_id] = room
        user.room_id = room.room_id

        await repo.create_room(room)
        return room, P.ok(P.ROOM_CREATED, room=room.to_public())

    async def join_room(
        self, user: User, room_id: str
    ) -> tuple[Room | None, dict[str, Any]]:
        if user.room_id:
            return None, P.error("already_in_room", "Você já está em uma sala.")

        room = self.rooms.get(room_id)
        if not room:
            return None, P.error("room_not_found", "Sala não encontrada.")

        room.member_ids.add(user.user_id)
        user.room_id = room.room_id
        await repo.add_member(room.room_id, user.user_id)
        return room, P.ok(P.ROOM_JOINED, room=room.to_public())

    async def leave_room(
        self, user: User
    ) -> tuple[Room | None, dict[str, Any], bool]:
        if not user.room_id:
            return None, P.error("not_in_room", "Você não está em nenhuma sala."), False

        room = self.rooms.get(user.room_id)
        room_id = user.room_id
        user.room_id = None

        if not room:
            return None, P.ok(P.ROOM_LEFT, room_id=room_id), False

        room.member_ids.discard(user.user_id)
        if db.is_connected():
            await repo.remove_member(room_id, user.user_id)

        deleted = False
        if not room.member_ids:
            # Mantém a sala no banco/listagem; só zera membros vivos
            pass

        return room, P.ok(P.ROOM_LEFT, room_id=room_id), deleted

    async def list_rooms(self) -> dict[str, Any]:
        # Memória reflete presença ao vivo; sincroniza counts dos membros online
        rooms = [r.to_public() for r in self.rooms.values()]
        return P.ok(P.ROOMS_LIST, rooms=rooms)

    async def disconnect(self, websocket: Any) -> tuple[User | None, Room | None]:
        user = self.users_by_ws.pop(websocket, None)
        if not user:
            return None, None

        self.users_by_id.pop(user.user_id, None)
        room = None
        if user.room_id:
            room = self.rooms.get(user.room_id)
            if room:
                room.member_ids.discard(user.user_id)
                if db.is_connected():
                    await repo.remove_member(room.room_id, user.user_id)
        user.room_id = None
        return user, room

    def room_members(self, room: Room) -> list[User]:
        return [
            self.users_by_id[uid]
            for uid in room.member_ids
            if uid in self.users_by_id
        ]

    async def save_chat(self, room_id: str, user_id: str, text: str) -> dict[str, Any]:
        row = await repo.save_message(room_id, user_id, text)
        return {"id": row["id"], "ts": row["created_at"].isoformat()}
