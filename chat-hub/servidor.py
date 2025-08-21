# servidor.py
import asyncio
import websockets

# Lista de clientes conectados
connected_clients = set()

async def handler(websocket):
    # adiciona cliente
    connected_clients.add(websocket)
    client_name = f"Cliente{len(connected_clients)}"
    
    # avisa os outros que entrou
    await asyncio.gather(*[
        client.send(f"🔔 {client_name} entrou no chat")
        for client in connected_clients
        if client != websocket
    ])

    try:
        async for message in websocket:
            # repassa a mensagem para todos os outros
            await asyncio.gather(*[
                client.send(f"{client_name} disse: {message}")
                for client in connected_clients
                if client != websocket
            ])
    except websockets.ConnectionClosed:
        pass
    finally:
        # remove cliente desconectado
        connected_clients.remove(websocket)
        # avisa os outros que saiu
        await asyncio.gather(*[
            client.send(f"❌ {client_name} saiu do chat")
            for client in connected_clients
        ])

async def main():
    async with websockets.serve(handler, "0.0.0.0", 8765):  # importante usar 0.0.0.0 no Docker
        print("Servidor Hub rodando em ws://0.0.0.0:8765")
        await asyncio.Future()  # mantém rodando

asyncio.run(main())
