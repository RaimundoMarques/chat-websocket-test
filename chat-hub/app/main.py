"""Ponto de entrada do servidor chatHub."""

from __future__ import annotations

import asyncio

import websockets

from app import db
from app.config import DATABASE_URL, HOST, PORT
from app.handler import ConnectionHandler
from app.hub import HubState


async def main() -> None:
    print(f"Conectando ao PostgreSQL...", flush=True)
    await db.connect()
    await db.ensure_schema()
    await db.reset_live_memberships()

    state = HubState()
    await state.load_from_db()
    handler = ConnectionHandler(state)

    async with websockets.serve(handler.handle, HOST, PORT):
        print(f"chatHub rodando em ws://{HOST}:{PORT}", flush=True)
        print(f"DB: {DATABASE_URL.split('@')[-1]}", flush=True)
        try:
            await asyncio.Future()
        except asyncio.CancelledError:
            pass

    await db.close()


if __name__ == "__main__":
    asyncio.run(main())
