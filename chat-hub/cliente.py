# cliente.py
import asyncio
import websockets
import sys

async def client(name):
    uri = "ws://localhost:8765"  # se rodar no host
    # uri = "ws://chat-hub:8765" # se rodar em container com docker-compose
    
    try:
        async with websockets.connect(uri) as websocket:
            print(f"{name} conectado ao hub")

            async def send_messages():
                try:
                    while True:
                        # Usa run_in_executor para não bloquear o loop de eventos
                        msg = await asyncio.get_event_loop().run_in_executor(None, input, f"{name} > ")
                        await websocket.send(msg)
                except asyncio.CancelledError:
                    print(f"\n{name} desconectando...")
                    return

            async def receive_messages():
                try:
                    async for message in websocket:
                        print(f"{name} recebeu: {message}")
                except websockets.ConnectionClosed:
                    print(f"{name} desconectado do servidor")
                    return

            # Executa as duas tarefas simultaneamente
            await asyncio.gather(send_messages(), receive_messages())
            
    except ConnectionRefusedError:
        print(f"Erro: Não foi possível conectar ao servidor em {uri}")
        print("Verifique se o servidor está rodando e acessível")
    except Exception as e:
        print(f"Erro inesperado: {e}")

# roda cliente com nome fixo
if __name__ == "__main__":
    try:
        asyncio.run(client("ClienteX"))
    except KeyboardInterrupt:
        print("\nCliente encerrado pelo usuário")
        sys.exit(0)
