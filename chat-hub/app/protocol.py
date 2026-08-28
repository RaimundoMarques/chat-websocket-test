"""Protocolo JSON do chatHub (cliente <-> servidor)."""

from __future__ import annotations

from typing import Any


# --- Tipos enviados pelo cliente ---
AUTH = "auth"
LOGOUT = "logout"
CREATE_ROOM = "create_room"
JOIN_ROOM = "join_room"
LEAVE_ROOM = "leave_room"
LIST_ROOMS = "list_rooms"
LIST_USERS = "list_users"
LIST_UNITS = "list_units"
CREATE_UNIT = "create_unit"
ADMIN_CREATE_USER = "admin_create_user"
ADMIN_UPDATE_USER = "admin_update_user"
ADMIN_RESET_PASSWORD = "admin_reset_password"
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
UNITS_LIST = "units_list"
UNIT_CREATED = "unit_created"
USER_CREATED = "user_created"
USER_UPDATED = "user_updated"
PASSWORD_RESET = "password_reset"
ROOM_UPDATE = "room_update"
ROOM_PERMISSIONS_UPDATED = "room_permissions_updated"
CHAT_MESSAGE = "chat"
CHAT_HISTORY = "chat_history"
SYSTEM = "system"


def ok(msg_type: str, **payload: Any) -> dict[str, Any]:
    return {"type": msg_type, **payload}


def error(code: str, message: str) -> dict[str, Any]:
    return {"type": ERROR, "code": code, "message": message}
