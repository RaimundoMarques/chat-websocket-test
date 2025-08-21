# teste_multi_clientes.py - Script para testar múltiplos clientes
import asyncio
import websockets
import sys
import random
import time

async def client_simulator(name, messages, delay_range=(1, 3)):
    """Simula um cliente que envia mensagens automaticamente"""
    uri = "ws://localhost:8765"
    
    try:
        async with websockets.connect(uri) as websocket:
            print(f"🤖 {name} conectado ao hub")
            
            # Aguarda um pouco antes de começar a enviar mensagens
            await asyncio.sleep(random.uniform(0.5, 2.0))
            
            for msg in messages:
                await websocket.send(msg)
                print(f"🤖 {name} enviou: {msg}")
                
                # Aguarda um tempo aleatório entre mensagens
                delay = random.uniform(delay_range[0], delay_range[1])
                await asyncio.sleep(delay)
            
            # Mantém conectado por mais um tempo
            await asyncio.sleep(5)
            
    except Exception as e:
        print(f"❌ Erro com {name}: {e}")

async def main():
    print("🤖 SIMULADOR DE MÚLTIPLOS CLIENTES")
    print("=" * 50)
    
    # Lista de clientes com suas mensagens
    clients = [
        ("Alice", ["Oi pessoal!", "Como vocês estão?", "Alguém quer conversar?", "Tchau!"]),
        ("Bob", ["Olá!", "Tudo bem?", "Que dia lindo!", "Até mais!"]),
        ("Carol", ["Oi!", "Como vai?", "Legal!", "Foi um prazer!"]),
        ("David", ["E aí?", "Tudo tranquilo?", "Show!", "Valeu!"]),
    ]
    
    # Cria tarefas para todos os clientes
    tasks = []
    for name, messages in clients:
        task = asyncio.create_task(client_simulator(name, messages))
        tasks.append(task)
    
    print(f"🚀 Iniciando {len(clients)} clientes...")
    
    # Executa todos os clientes simultaneamente
    await asyncio.gather(*tasks)
    
    print("✅ Simulação concluída!")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n🤖 Simulação interrompida pelo usuário")
        sys.exit(0) 