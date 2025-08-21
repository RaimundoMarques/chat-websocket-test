# monitor.py - Painel de monitoramento do chat
import asyncio
import websockets
import json
from datetime import datetime
import sys

class ChatMonitor:
    def __init__(self):
        self.connected_clients = set()
        self.messages = []
        self.uri = "ws://localhost:8765"
        
    async def connect(self):
        try:
            async with websockets.connect(self.uri) as websocket:
                print("🔍 Monitor conectado ao hub")
                print("=" * 50)
                
                async def receive_messages():
                    try:
                        async for message in websocket:
                            timestamp = datetime.now().strftime("%H:%M:%S")
                            
                            # Analisa o tipo de mensagem
                            if "🔔" in message:
                                # Cliente entrou
                                client_name = message.split("🔔 ")[1].split(" entrou")[0]
                                self.connected_clients.add(client_name)
                                print(f"[{timestamp}] 🟢 {client_name} entrou no chat")
                                self.messages.append(f"[{timestamp}] 🟢 {client_name} entrou no chat")
                                
                            elif "❌" in message:
                                # Cliente saiu
                                client_name = message.split("❌ ")[1].split(" saiu")[0]
                                self.connected_clients.discard(client_name)
                                print(f"[{timestamp}] 🔴 {client_name} saiu do chat")
                                self.messages.append(f"[{timestamp}] 🔴 {client_name} saiu do chat")
                                
                            elif "disse:" in message:
                                # Mensagem de chat
                                parts = message.split(" disse: ")
                                if len(parts) == 2:
                                    client_name = parts[0]
                                    msg_content = parts[1]
                                    print(f"[{timestamp}] 💬 {client_name}: {msg_content}")
                                    self.messages.append(f"[{timestamp}] 💬 {client_name}: {msg_content}")
                                else:
                                    print(f"[{timestamp}] 📨 {message}")
                                    self.messages.append(f"[{timestamp}] 📨 {message}")
                            
                            # Mostra estatísticas a cada 10 mensagens
                            if len(self.messages) % 10 == 0:
                                self.show_stats()
                                
                    except websockets.ConnectionClosed:
                        print("❌ Monitor desconectado do servidor")
                        return
                
                async def show_periodic_stats():
                    while True:
                        await asyncio.sleep(30)  # Mostra stats a cada 30 segundos
                        self.show_stats()
                
                # Executa recebimento de mensagens e estatísticas periódicas
                await asyncio.gather(receive_messages(), show_periodic_stats())
                
        except ConnectionRefusedError:
            print(f"❌ Erro: Não foi possível conectar ao servidor em {self.uri}")
            print("Verifique se o servidor está rodando e acessível")
        except Exception as e:
            print(f"❌ Erro inesperado: {e}")
    
    def show_stats(self):
        print("\n" + "=" * 50)
        print("📊 ESTATÍSTICAS DO CHAT")
        print("=" * 50)
        print(f"👥 Clientes conectados: {len(self.connected_clients)}")
        if self.connected_clients:
            print(f"📝 Clientes: {', '.join(sorted(self.connected_clients))}")
        print(f"💬 Total de mensagens: {len(self.messages)}")
        print(f"⏰ Última atualização: {datetime.now().strftime('%H:%M:%S')}")
        print("=" * 50)
    
    def show_recent_messages(self, count=10):
        print(f"\n📨 ÚLTIMAS {count} MENSAGENS:")
        print("-" * 50)
        for msg in self.messages[-count:]:
            print(msg)
        print("-" * 50)

async def main():
    monitor = ChatMonitor()
    
    print("🔍 MONITOR DE CHAT - PAINEL DE ADMINISTRAÇÃO")
    print("=" * 60)
    print("Este monitor mostra:")
    print("• Clientes conectados/desconectados")
    print("• Todas as mensagens trocadas")
    print("• Estatísticas em tempo real")
    print("• Histórico completo do chat")
    print("=" * 60)
    
    try:
        await monitor.connect()
    except KeyboardInterrupt:
        print("\n🔍 Monitor encerrado pelo usuário")
        # Mostra estatísticas finais
        monitor.show_stats()
        monitor.show_recent_messages(20)
        sys.exit(0)

if __name__ == "__main__":
    asyncio.run(main()) 