"""Modelos in-memory do chatHub."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from uuid import uuid4


@dataclass
class User:
    username: str
    profile: str  # host | member
    websocket: Any
    user_id: str = field(default_factory=lambda: str(uuid4())[:8])
    room_id: str | None = None

    def to_public(self) -> dict[str, Any]:
        return {
            "user_id": self.user_id,
            "username": self.username,
            "profile": self.profile,
            "room_id": self.room_id,
        }


@dataclass
class Room:
    name: str
    created_by: str  # user_id
    room_id: str = field(default_factory=lambda: str(uuid4())[:8])
    member_ids: set[str] = field(default_factory=set)

    def to_public(self) -> dict[str, Any]:
        return {
            "room_id": self.room_id,
            "name": self.name,
            "created_by": self.created_by,
            "members": sorted(self.member_ids),
            "member_count": len(self.member_ids),
        }
