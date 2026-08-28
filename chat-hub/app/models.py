"""Modelos in-memory do chatHub."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from uuid import uuid4


@dataclass
class User:
    username: str
    profile: str  # admin | host | member | host_member
    websocket: Any
    session_token: str = ""
    active_role: str = ""  # Role ativa no lobby/sala ('host' | 'member' | 'admin')
    user_id: str = field(default_factory=lambda: str(uuid4())[:8])
    room_id: str | None = None
    unit_id: str | None = "ICCT"

    def __post_init__(self) -> None:
        if not self.active_role:
            self.active_role = "host" if self.profile in ("host", "host_member") else self.profile

    def to_public(self) -> dict[str, Any]:
        return {
            "user_id": self.user_id,
            "username": self.username,
            "profile": self.profile,
            "active_role": self.active_role,
            "room_id": self.room_id,
            "session_token": self.session_token,
            "unit_id": self.unit_id or "ICCT",
        }


@dataclass
class Unit:
    id: str
    name: str

    def to_dict(self) -> dict[str, Any]:
        return {"id": self.id, "name": self.name}


@dataclass
class Room:
    name: str
    created_by: str  # user_id
    room_id: str = field(default_factory=lambda: str(uuid4())[:8])
    is_private: bool = False
    member_ids: set[str] = field(default_factory=set)
    allowed_usernames: set[str] = field(default_factory=set)

    def to_public(self) -> dict[str, Any]:
        return {
            "room_id": self.room_id,
            "name": self.name,
            "created_by": self.created_by,
            "is_private": self.is_private,
            "members": sorted(self.member_ids),
            "member_count": len(self.member_ids),
            "allowed_usernames": sorted(self.allowed_usernames),
        }
