"""Estado em memória + persistência PostgreSQL."""

from __future__ import annotations

import json
from typing import Any
from uuid import uuid4

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
        self,
        websocket: Any,
        username: str = "",
        password: str = "",
        session_token: str = "",
        user_id: str = "",
    ) -> tuple[User | None, dict[str, Any]]:
        # 1. Autenticação por session_token existente (ex: reload/F5)
        if session_token and user_id:
            if not db.is_connected():
                return None, P.error("db_offline", "Database is not connected.")
            user_data, err = await repo.authenticate_user_by_token(user_id, session_token)
            if err or not user_data:
                return None, P.error("invalid_session", "Session expired or invalid. Please sign in again.")
            user_id = user_data["user_id"]
            username = user_data["username"]
            profile = user_data["profile"]
            unit_id = user_data["unit_id"]
            active_session_token = session_token
        else:
            # 2. Autenticação por usuário e senha
            username = (username or "").strip()
            password = (password or "").strip()

            if not username:
                return None, P.error("invalid_username", "Please provide a username.")
            if not password:
                return None, P.error("invalid_password", "Please provide a password.")

            active_session_token = str(uuid4())

            if db.is_connected():
                user_data, err = await repo.authenticate_user(
                    username, password, active_session_token
                )
                if err or not user_data:
                    return None, P.error("invalid_credentials", "Invalid username or password.")
                user_id = user_data["user_id"]
                username = user_data["username"]
                profile = user_data["profile"]
                unit_id = user_data["unit_id"]
            else:
                user_id = str(uuid4())[:8]
                profile = "member"
                unit_id = "ICCT"

        # Encerra qualquer sessão anterior ativa com este mesmo user_id / username (case-insensitive)
        old_sockets = [
            u.websocket
            for u in self.users_by_id.values()
            if (u.user_id == user_id or u.username.lower() == username.lower())
            and u.websocket != websocket
        ]

        for old_ws in old_sockets:
            try:
                await old_ws.send(
                    json.dumps(
                        P.error(
                            "session_replaced",
                            "You were disconnected because this account logged in from another window or device.",
                        ),
                        ensure_ascii=False,
                    )
                )
            except (OSError, RuntimeError):
                pass
            await self.disconnect(old_ws)
            try:
                await old_ws.close(code=4001, reason="session_replaced")
            except (OSError, RuntimeError):
                pass

        if websocket in self.users_by_ws:
            await self.disconnect(websocket)

        user = User(
            user_id=user_id,
            username=username,
            profile=profile,
            websocket=websocket,
            session_token=active_session_token,
            unit_id=unit_id,
        )

        self.users_by_ws[websocket] = user
        self.users_by_id[user.user_id] = user
        return user, P.ok(P.AUTH_OK, user=user.to_public())

    async def change_profile(
        self, user: User, role: str
    ) -> tuple[User | None, dict[str, Any]]:
        if user.room_id:
            return None, P.error(
                "in_room",
                "Saia da sala antes de trocar o perfil.",
            )

        role = (role or "").strip().lower()

        # Se o usuário é 'host_member' ou 'admin', pode alternar sua active_role entre 'host' e 'member'
        if user.profile in ("host_member", "admin"):
            if role not in ("host", "member"):
                return None, P.error("invalid_role", "Escolha 'host' ou 'member'.")
            user.active_role = role
            return user, P.ok(P.PROFILE_CHANGED, user=user.to_public())

        # Se o usuário possui perfil fixo ('member' ou 'host')
        if user.profile in ("member", "host"):
            if role != user.profile:
                return None, P.error(
                    "forbidden_role_change",
                    f"Seu perfil é '{user.profile}' fixo. Não é permitido alternar de perfil.",
                )
            return user, P.ok(P.PROFILE_CHANGED, user=user.to_public())

        return None, P.error("invalid_profile", "Perfil não suportado.")

    async def create_user_admin(
        self,
        admin_user: User,
        username: str,
        password: str,
        profile: str,
        unit_id: str = "ICCT",
    ) -> tuple[dict[str, Any] | None, dict[str, Any]]:
        if admin_user.profile != "admin":
            return None, P.error("forbidden", "Only admins can create users.")

        profile = (profile or "member").strip().lower()
        if profile not in VALID_PROFILES:
            return None, P.error("invalid_profile", "Invalid profile role.")

        user_data, err = await repo.create_user(
            username=username,
            password=password,
            profile=profile,
            unit_id=unit_id,
        )
        if err:
            if err == "user_already_exists":
                return None, P.error("user_exists", f"User '{username}' already exists.")
            return None, P.error(err, "Failed to create user.")

        return user_data, P.ok(P.USER_CREATED, user=user_data)

    async def update_user_admin(
        self,
        admin_user: User,
        user_id: str,
        profile: str,
        unit_id: str,
    ) -> tuple[bool, dict[str, Any]]:
        if admin_user.profile != "admin":
            return False, P.error("forbidden", "Only admins can edit users.")

        profile = (profile or "").strip().lower()
        if profile not in VALID_PROFILES:
            return False, P.error("invalid_profile", "Invalid profile role.")

        ok_updated, err = await repo.update_user(
            user_id=user_id,
            profile=profile,
            unit_id=unit_id,
        )
        if not ok_updated:
            return False, P.error(err or "update_failed", "Failed to update user.")

        # Atualiza o objeto do usuário ativo se estiver online
        target_user = self.users_by_id.get(user_id)
        if target_user:
            target_user.profile = profile
            target_user.unit_id = unit_id
            try:
                await target_user.websocket.send(
                    json.dumps(P.ok(P.PROFILE_CHANGED, user=target_user.to_public()))
                )
            except (OSError, RuntimeError):
                pass

        return True, P.ok(P.USER_UPDATED, user_id=user_id)

    async def reset_password_admin(
        self, admin_user: User, user_id: str, new_password: str
    ) -> tuple[bool, dict[str, Any]]:
        if admin_user.profile != "admin":
            return False, P.error("forbidden", "Only admins can reset passwords.")

        ok_reset, err = await repo.admin_reset_password(user_id, new_password)
        if not ok_reset:
            return False, P.error(err or "reset_failed", "Failed to reset password.")

        return True, P.ok(P.PASSWORD_RESET, user_id=user_id)

    async def create_unit_admin(
        self,
        admin_user: User,
        unit_id: str,
        name: str,
    ) -> tuple[dict[str, Any] | None, dict[str, Any]]:
        if admin_user.profile != "admin":
            return None, P.error("forbidden", "Only admins can create units.")

        unit_data, err = await repo.create_unit(
            unit_id=unit_id,
            name=name,
        )
        if err:
            if err == "unit_already_exists":
                return None, P.error(
                    "unit_exists", f"Unit code '{unit_id}' already exists."
                )
            return None, P.error(err, "Failed to create unit.")

        return unit_data, P.ok(P.UNIT_CREATED, unit=unit_data)

    async def list_units(self) -> dict[str, Any]:
        items = await repo.list_units() if db.is_connected() else []
        return P.ok(P.UNITS_LIST, units=items)

    async def create_room(
        self,
        user: User,
        name: str,
        is_private: bool = False,
        allowed_usernames: list[str] | None = None,
    ) -> tuple[Room | None, dict[str, Any]]:
        can_create = user.profile in ROOM_CREATOR_PROFILES and (
            user.profile == "admin" or getattr(user, "active_role", user.profile) == "host"
        )
        if not can_create:
            return None, P.error(
                "forbidden",
                "Apenas usuários com perfil ou modo 'host' podem criar salas.",
            )
        if user.room_id:
            return None, P.error(
                "already_in_room", "Saia da sala atual antes de criar outra."
            )

        name = (name or "").strip()
        if not name:
            return None, P.error("invalid_room_name", "Informe o nome da sala.")

        cleaned_allowed: set[str] = set()
        if is_private:
            cleaned_allowed.add(user.username.lower())
            if allowed_usernames:
                for u in allowed_usernames:
                    u_clean = (u or "").strip().lower()
                    if u_clean:
                        cleaned_allowed.add(u_clean)

        room = Room(
            name=name,
            created_by=user.user_id,
            is_private=is_private,
            allowed_usernames=cleaned_allowed,
        )
        await repo.create_room(room)
        room.member_ids.add(user.user_id)
        self.rooms[room.room_id] = room
        user.room_id = room.room_id

        return room, P.ok(P.ROOM_CREATED, room=room.to_public())

    async def join_room(
        self, user: User, room_id: str
    ) -> tuple[Room | None, dict[str, Any]]:
        if user.room_id:
            return None, P.error("already_in_room", "Você já está em uma sala.")

        room = self.rooms.get(room_id)
        if not room:
            return None, P.error("room_not_found", "Sala não encontrada.")

        if room.is_private:
            is_creator = (user.user_id == room.created_by)
            is_allowed = (user.username.lower() in {u.lower() for u in room.allowed_usernames})
            if not is_creator and not is_allowed:
                return None, P.error(
                    "forbidden_room",
                    "Esta sala é reservada. Você não tem permissão para entrar.",
                )

        room.member_ids.add(user.user_id)
        user.room_id = room.room_id
        await repo.add_member(room.room_id, user.user_id)
        return room, P.ok(P.ROOM_JOINED, room=room.to_public())

    async def add_room_member_permission(
        self, user: User, room_id: str, target_username: str
    ) -> tuple[Room | None, dict[str, Any]]:
        room = self.rooms.get(room_id)
        if not room:
            return None, P.error("room_not_found", "Sala não encontrada.")

        if room.created_by != user.user_id:
            return None, P.error(
                "forbidden", "Apenas o criador da sala pode gerenciar convidados."
            )

        target_clean = (target_username or "").strip().lower()
        if not target_clean:
            return None, P.error("invalid_username", "Informe o username.")

        room.allowed_usernames.add(target_clean)
        await repo.add_room_allowed_user(room.room_id, target_clean)
        return room, P.ok(P.ROOM_PERMISSIONS_UPDATED, room=room.to_public())

    async def remove_room_member_permission(
        self, user: User, room_id: str, target_username: str
    ) -> tuple[Room | None, dict[str, Any], User | None]:
        room = self.rooms.get(room_id)
        if not room:
            return None, P.error("room_not_found", "Sala não encontrada."), None

        if room.created_by != user.user_id:
            return None, P.error(
                "forbidden", "Apenas o criador da sala pode gerenciar convidados."
            ), None

        target_clean = (target_username or "").strip().lower()
        creator_user = self.users_by_id.get(room.created_by)
        if creator_user and target_clean == creator_user.username.lower():
            return None, P.error("cannot_remove_creator", "Não é possível remover o criador da sala."), None

        room.allowed_usernames.discard(target_clean)
        await repo.remove_room_allowed_user(room.room_id, target_clean)

        # Se o usuário removido estiver atualmente conectado na sala, expulsa-o da sala
        kicked_user: User | None = None
        for member in self.room_members(room):
            if member.username.lower() == target_clean:
                kicked_user = member
                member.room_id = None
                room.member_ids.discard(member.user_id)
                if db.is_connected():
                    await repo.remove_member(room.room_id, member.user_id)
                break

        return room, P.ok(P.ROOM_PERMISSIONS_UPDATED, room=room.to_public()), kicked_user

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

    async def list_users(self) -> dict[str, Any]:
        db_users = await repo.list_all_users() if db.is_connected() else []
        online_usernames = {u.username.lower() for u in self.users_by_id.values()}

        known_map = {u["username"].lower(): dict(u) for u in db_users}
        for u in self.users_by_id.values():
            if u.username.lower() not in known_map:
                known_map[u.username.lower()] = {
                    "user_id": u.user_id,
                    "username": u.username,
                    "profile": u.profile,
                    "unit_id": u.unit_id or "ICCT",
                    "unit_name": u.unit_id or "ICCT",
                }

        users_list = []
        for u_data in sorted(known_map.values(), key=lambda x: x["username"].lower()):
            users_list.append({
                "user_id": u_data["user_id"],
                "username": u_data["username"],
                "profile": u_data["profile"],
                "unit_id": u_data.get("unit_id", "ICCT"),
                "unit_name": u_data.get("unit_name", "ICCT"),
                "is_online": u_data["username"].lower() in online_usernames,
            })
        return P.ok(P.USERS_LIST, users=users_list)

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
