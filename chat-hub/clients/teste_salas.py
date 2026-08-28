"""Simula host criando sala + vários members entrando."""

from __future__ import annotations

import asyncio
import json
import sys

import websockets

URI = "ws://localhost:8765"


async def recv_until(ws, expected_types: set[str] | str, timeout: float = 5.0) -> dict:
    if isinstance(expected_types, str):
        expected_types = {expected_types}
    expected_types = set(expected_types) | {"error"}
    while True:
        raw = await asyncio.wait_for(ws.recv(), timeout=timeout)
        data = json.loads(raw)
        if data.get("type") in expected_types:
            return data


async def main() -> None:
    print("Simulação chatHub: 1 host + 4 members (sem limite de sala)")

    host_ws = await websockets.connect(URI)
    member_sockets = []

    try:
        await host_ws.send(
            json.dumps({"type": "auth", "username": "HostAna", "profile": "host"})
        )
        print("HostAna:", await recv_until(host_ws, "auth_ok"))

        await host_ws.send(json.dumps({"type": "create_room", "name": "Sala Demo"}))
        created = await recv_until(host_ws, "room_created")
        print("HostAna:", created)
        if created.get("type") == "error":
            return

        room_id = created["room"]["room_id"]

        async def join_member(name: str):
            ws = await websockets.connect(URI)
            await ws.send(
                json.dumps({"type": "auth", "username": name, "profile": "member"})
            )
            print(f"{name}:", await recv_until(ws, "auth_ok"))
            await ws.send(json.dumps({"type": "join_room", "room_id": room_id}))
            joined = await recv_until(ws, "room_joined")
            print(f"{name}:", joined)
            assert joined.get("type") == "room_joined", joined
            await ws.send(json.dumps({"type": "chat", "text": f"Oi, sou {name}"}))
            return ws

        member_sockets = await asyncio.gather(
            join_member("Bob"),
            join_member("Carol"),
            join_member("David"),
            join_member("Eve"),
        )

        # member não cria sala
        async with websockets.connect(URI) as ws:
            await ws.send(
                json.dumps({"type": "auth", "username": "MemberOnly", "profile": "member"})
            )
            await recv_until(ws, "auth_ok")
            await ws.send(json.dumps({"type": "create_room", "name": "Hack"}))
            denied = await recv_until(ws, "error")
            print("MemberOnly create (esperado forbidden):", denied)
            assert denied.get("code") == "forbidden", denied

        await host_ws.send(
            json.dumps({"type": "chat", "text": "Bem-vindos à Sala Demo!"})
        )
        await asyncio.sleep(0.5)
        print("OK — múltiplos membros e perfil host validados.")
    finally:
        for ws in member_sockets:
            await ws.close()
        await host_ws.close()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        sys.exit(0)
    except ConnectionRefusedError:
        print(f"Não conectou em {URI}. Suba o servidor primeiro.")
        sys.exit(1)
