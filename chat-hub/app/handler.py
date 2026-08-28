"""Handler WebSocket do chatHub."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

import asyncpg
import websockets

from app import protocol as P
from app import repository as repo
from app.hub import HubState
from app.models import Room, User


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _send(websocket: Any, payload: dict[str, Any]) -> None:
    await websocket.send(json.dumps(payload, ensure_ascii=False))


async def _broadcast_room(
    state: HubState,
    room: Room,
    payload: dict[str, Any],
    *,
    exclude_user_id: str | None = None,
) -> None:
    raw = json.dumps(payload, ensure_ascii=False)
    for member in state.room_members(room):
        if exclude_user_id and member.user_id == exclude_user_id:
            continue
        try:
            await member.websocket.send(raw)
        except (OSError, RuntimeError):
            pass


async def _notify_room_update(state: HubState, room: Room) -> None:
    await _broadcast_room(
        state,
        room,
        P.ok(P.ROOM_UPDATE, room=room.to_public()),
    )


async def _send_chat_history(websocket: Any, room_id: str) -> None:
    messages = await repo.list_room_messages(room_id)
    await _send(
        websocket,
        P.ok(P.CHAT_HISTORY, room_id=room_id, messages=messages),
    )


async def _broadcast_rooms_list_to_lobby(state: HubState) -> None:
    """Atualiza a lista de salas para usuários autenticados no lobby."""
    payload = await state.list_rooms()
    raw = json.dumps(payload, ensure_ascii=False)
    for user in state.users_by_id.values():
        if user.room_id is not None:
            continue
        try:
            await user.websocket.send(raw)
        except (OSError, RuntimeError):
            pass


async def _broadcast_users_list(state: HubState) -> None:
    """Atualiza a lista de usuários conhecidos/online para todos os clientes."""
    payload = await state.list_users()
    raw = json.dumps(payload, ensure_ascii=False)
    for user in state.users_by_id.values():
        try:
            await user.websocket.send(raw)
        except (OSError, RuntimeError):
            pass


class ConnectionHandler:
    def __init__(self, state: HubState) -> None:
        self.state = state

    async def handle(self, websocket: Any) -> None:
        try:
            async for raw in websocket:
                try:
                    await self._on_message(websocket, raw)
                except websockets.ConnectionClosed:
                    raise
                except (asyncpg.PostgresError, OSError, RuntimeError, ValueError, KeyError) as exc:
                    print(f"Error handling message: {exc}", flush=True)
                    await _send(websocket, P.error("server_error", "Erro interno no servidor."))
        except websockets.ConnectionClosed:
            pass
        finally:
            await self._on_disconnect(websocket)

    async def _on_disconnect(self, websocket: Any) -> None:
        try:
            user, room = await self.state.disconnect(websocket)
            if user and room:
                await _broadcast_room(
                    self.state,
                    room,
                    P.ok(
                        P.SYSTEM,
                        room_id=room.room_id,
                        event="user_left",
                        user=user.to_public(),
                        ts=_now_iso(),
                    ),
                )
                await _notify_room_update(self.state, room)
            await _broadcast_rooms_list_to_lobby(self.state)
            await _broadcast_users_list(self.state)
        except (OSError, RuntimeError):
            pass

    async def _on_message(self, websocket: Any, raw: str | bytes) -> None:
        try:
            data = json.loads(raw)
        except (TypeError, json.JSONDecodeError):
            await _send(websocket, P.error("invalid_json", "Envie mensagens em JSON."))
            return

        if not isinstance(data, dict) or "type" not in data:
            await _send(
                websocket,
                P.error("invalid_message", "Mensagem deve ter o campo 'type'."),
            )
            return

        msg_type = data.get("type")
        user = self.state.get_user(websocket)

        if msg_type == P.AUTH:
            user, response = await self.state.authenticate(
                websocket,
                data.get("username", ""),
                data.get("profile", "member"),
            )
            await _send(websocket, response)
            if user and response.get("type") == P.AUTH_OK:
                await _send(websocket, await self.state.list_rooms())
                await _send(websocket, await self.state.list_users())
                await _broadcast_users_list(self.state)
            return

        if user is None:
            await _send(websocket, P.error("unauthenticated", "Faça auth primeiro."))
            return

        if msg_type == P.CREATE_ROOM:
            room, response = await self.state.create_room(
                user,
                data.get("name", ""),
                is_private=bool(data.get("is_private", False)),
                allowed_usernames=data.get("allowed_usernames") or [],
            )
            await _send(websocket, response)
            if room and response.get("type") == P.ROOM_CREATED:
                await _send_chat_history(websocket, room.room_id)
                await _broadcast_rooms_list_to_lobby(self.state)
            return

        if msg_type == P.ADD_ROOM_MEMBER:
            room, response = await self.state.add_room_member_permission(
                user, data.get("room_id", ""), data.get("username", "")
            )
            await _send(websocket, response)
            if room and response.get("type") == P.ROOM_PERMISSIONS_UPDATED:
                await _notify_room_update(self.state, room)
                await _broadcast_rooms_list_to_lobby(self.state)
            return

        if msg_type == P.REMOVE_ROOM_MEMBER:
            room, response, kicked_user = await self.state.remove_room_member_permission(
                user, data.get("room_id", ""), data.get("username", "")
            )
            await _send(websocket, response)
            if room and response.get("type") == P.ROOM_PERMISSIONS_UPDATED:
                if kicked_user:
                    try:
                        await _send(
                            kicked_user.websocket,
                            P.ok(P.ROOM_LEFT, room_id=room.room_id),
                        )
                        await _send(
                            kicked_user.websocket,
                            P.error("kicked", "Você foi removido da sala pelo Host."),
                        )
                    except (OSError, RuntimeError):
                        pass
                await _notify_room_update(self.state, room)
                await _broadcast_rooms_list_to_lobby(self.state)
            return

        if msg_type == P.JOIN_ROOM:
            room, response = await self.state.join_room(user, data.get("room_id", ""))
            await _send(websocket, response)
            if room and response.get("type") == P.ROOM_JOINED:
                await _send_chat_history(websocket, room.room_id)
                await _broadcast_room(
                    self.state,
                    room,
                    P.ok(
                        P.SYSTEM,
                        room_id=room.room_id,
                        event="user_joined",
                        user=user.to_public(),
                        ts=_now_iso(),
                    ),
                    exclude_user_id=user.user_id,
                )
                await _notify_room_update(self.state, room)
                await _broadcast_rooms_list_to_lobby(self.state)
            return

        if msg_type == P.LEAVE_ROOM:
            room, response, deleted = await self.state.leave_room(user)
            await _send(websocket, response)
            if room and not deleted and response.get("type") == P.ROOM_LEFT:
                await _broadcast_room(
                    self.state,
                    room,
                    P.ok(
                        P.SYSTEM,
                        room_id=room.room_id,
                        event="user_left",
                        user=user.to_public(),
                        ts=_now_iso(),
                    ),
                )
                await _notify_room_update(self.state, room)
            if response.get("type") == P.ROOM_LEFT:
                await _broadcast_rooms_list_to_lobby(self.state)
            return

        if msg_type == P.LIST_ROOMS:
            await _send(websocket, await self.state.list_rooms())
            return

        if msg_type == P.LIST_USERS:
            await _send(websocket, await self.state.list_users())
            return

        if msg_type == P.CHANGE_PROFILE:
            _, response = await self.state.change_profile(
                user, data.get("profile", "")
            )
            await _send(websocket, response)
            if response.get("type") == P.PROFILE_CHANGED:
                await _broadcast_users_list(self.state)
            return

        if msg_type == P.CHAT:
            await self._handle_chat(user, data.get("text", ""))
            return

        await _send(
            websocket,
            P.error("unknown_type", f"Tipo de mensagem desconhecido: {msg_type}"),
        )

    async def _handle_chat(self, user: User, text: str) -> None:
        text = (text or "").strip()
        if not text:
            await _send(user.websocket, P.error("empty_message", "Mensagem vazia."))
            return
        if not user.room_id:
            await _send(
                user.websocket,
                P.error("not_in_room", "Entre em uma sala para conversar."),
            )
            return

        room = self.state.rooms.get(user.room_id)
        if not room:
            await _send(user.websocket, P.error("room_not_found", "Sala não encontrada."))
            return

        meta = await self.state.save_chat(room.room_id, user.user_id, text)

        payload = P.ok(
            P.CHAT_MESSAGE,
            room_id=room.room_id,
            id=meta["id"],
            from_user=user.to_public(),
            text=text,
            ts=meta["ts"],
        )
        await _broadcast_room(self.state, room, payload)
