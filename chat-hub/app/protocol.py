"""Protocolo JSON do chatHub (cliente <-> servidor)."""

from __future__ import annotations

from typing import Any


# --- Tipos enviados pelo cliente ---
AUTH = "auth"
CREATE_ROOM = "create_room"
JOIN_ROOM = "join_room"
LEAVE_ROOM = "leave_room"
LIST_ROOMS = "list_rooms"
CHAT = "chat"
CHANGE_PROFILE = "change_profile"

# --- Tipos enviados pelo servidor ---
AUTH_OK = "auth_ok"
ERROR = "error"
PROFILE_CHANGED = "profile_changed"
ROOM_CREATED = "room_created"
ROOM_JOINED = "room_joined"
ROOM_LEFT = "room_left"
ROOMS_LIST = "rooms_list"
ROOM_UPDATE = "room_update"
CHAT_MESSAGE = "chat"
CHAT_HISTORY = "chat_history"
SYSTEM = "system"


def ok(msg_type: str, **payload: Any) -> dict[str, Any]:
    return {"type": msg_type, **payload}


def error(code: str, message: str) -> dict[str, Any]:
    return {"type": ERROR, "code": code, "message": message}
