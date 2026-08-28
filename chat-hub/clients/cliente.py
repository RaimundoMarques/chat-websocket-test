# cliente CLI do chatHub (protocolo JSON)
import asyncio
import json
import sys

import websockets

URI = "ws://localhost:8765"


def parse_cmd(line: str) -> dict | None:
    line = line.strip()
    if not line:
        return None

    if line.startswith("/"):
        parts = line.split(maxsplit=2)
        cmd = parts[0].lower()

        if cmd == "/auth":
            # /auth nome senha
            if len(parts) < 3:
                print("Uso: /auth <username> <password>")
                return None
            return {"type": "auth", "username": parts[1], "password": parts[2]}

        if cmd == "/create":
            name = parts[1] if len(parts) > 1 else ""
            if not name:
                print("Uso: /create <nome_da_sala>")
                return None
            return {"type": "create_room", "name": name}

        if cmd == "/join":
            if len(parts) < 2:
                print("Uso: /join <room_id>")
                return None
            return {"type": "join_room", "room_id": parts[1]}

        if cmd == "/leave":
            return {"type": "leave_room"}

        if cmd == "/rooms":
            return {"type": "list_rooms"}

        if cmd == "/help":
            print(
                "Comandos:\n"
                "  /auth <user> <host|member>\n"
                "  /create <nome>\n"
                "  /join <room_id>\n"
                "  /leave\n"
                "  /rooms\n"
                "  /help\n"
                "  (texto livre = mensagem de chat)"
            )
            return None

        print(f"Comando desconhecido: {cmd}. Digite /help")
        return None

    return {"type": "chat", "text": line}


def pretty(data: dict) -> None:
    t = data.get("type")
    if t == "chat":
        user = data.get("from_user", {})
        print(f"💬 {user.get('username')}: {data.get('text')}")
    elif t == "system":
        user = data.get("user", {})
        print(f"🔔 [{data.get('event')}] {user.get('username')}")
    elif t == "error":
        print(f"❌ {data.get('code')}: {data.get('message')}")
    elif t == "rooms_list":
        rooms = data.get("rooms") or []
        if not rooms:
            print("📭 Nenhuma sala aberta.")
        else:
            print("📋 Salas:")
            for r in rooms:
                print(
                    f"  - {r['name']} ({r['room_id']}) "
                    f"{r['member_count']} online"
                )
    elif t == "chat_history":
        messages = data.get("messages") or []
        print(f"📜 Histórico ({len(messages)} mensagens):")
        for m in messages:
            user = m.get("from_user", {})
            print(f"  💬 {user.get('username')}: {m.get('text')}")
    elif t in ("auth_ok", "room_created", "room_joined", "room_left", "room_update"):
        print(f"✅ {t}: {json.dumps(data, ensure_ascii=False)}")
    else:
        print(f"📨 {json.dumps(data, ensure_ascii=False)}")


async def client() -> None:
    print("chatHub cliente — digite /help")
    async with websockets.connect(URI) as ws:

        async def send_loop() -> None:
            loop = asyncio.get_event_loop()
            while True:
                line = await loop.run_in_executor(None, input, "> ")
                msg = parse_cmd(line)
                if msg:
                    await ws.send(json.dumps(msg))

        async def recv_loop() -> None:
            async for raw in ws:
                try:
                    pretty(json.loads(raw))
                except json.JSONDecodeError:
                    print(f"📨 {raw}")

        await asyncio.gather(send_loop(), recv_loop())


if __name__ == "__main__":
    try:
        asyncio.run(client())
    except KeyboardInterrupt:
        print("\nCliente encerrado")
        sys.exit(0)
    except ConnectionRefusedError:
        print(f"Não conectou em {URI}. Suba o servidor primeiro.")
        sys.exit(1)
