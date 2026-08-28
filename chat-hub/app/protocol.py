"""Protocolo JSON do chatHub (cliente <-> servidor)."""

from __future__ import annotations

from typing import Any


# --- Tipos enviados pelo cliente ---
AUTH = "auth"
CREATE_ROOM = "create_room"
JOIN_ROOM = "join_room"
LEAVE_ROOM = "leave_room"
LIST_ROOMS = "list_rooms"
LIST_USERS = "list_users"
CHAT = "chat"
CHANGE_PROFILE = "change_profile"
ADD_ROOM_MEMBER = "add_room_member"
REMOVE_ROOM_MEMBER = "remove_room_member"

# --- Tipos enviados pelo servidor ---
AUTH_OK = "auth_ok"
ERROR = "error"
PROFILE_CHANGED = "profile_changed"
ROOM_CREATED = "room_created"
ROOM_JOINED = "room_joined"
ROOM_LEFT = "room_left"
ROOMS_LIST = "rooms_list"
USERS_LIST = "users_list"
ROOM_UPDATE = "room_update"
ROOM_PERMISSIONS_UPDATED = "room_permissions_updated"
CHAT_MESSAGE = "chat"
CHAT_HISTORY = "chat_history"
SYSTEM = "system"


def ok(msg_type: str, **payload: Any) -> dict[str, Any]:
    return {"type": msg_type, **payload}


def error(code: str, message: str) -> dict[str, Any]:
    return {"type": ERROR, "code": code, "message": message}
