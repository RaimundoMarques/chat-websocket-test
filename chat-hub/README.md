# Chat Hub - Sistema de Chat em Tempo Real

Um sistema de chat em tempo real usando WebSockets com Python, Docker e monitoramento completo.

## 🚀 Como Usar

### 1. Iniciar o Servidor
```bash
# Inicia o servidor em container Docker
docker-compose up -d --build
```

### 2. Monitor de Chat (Recomendado)
```bash
# Abra um terminal e execute o monitor
python monitor.py
```
O monitor mostra:
- ✅ Clientes conectados/desconectados
- 💬 Todas as mensagens trocadas
- 📊 Estatísticas em tempo real
- 📨 Histórico completo do chat

### 3. Clientes de Chat

#### Cliente Manual
```bash
# Abra outro terminal para um cliente manual
python cliente.py
```

#### Simulador de Múltiplos Clientes
```bash
# Para testar com vários clientes automaticamente
python teste_multi_clientes.py
```

## 📁 Arquivos do Projeto

- `servidor.py` - Servidor WebSocket principal
- `cliente.py` - Cliente manual para chat
- `monitor.py` - Painel de monitoramento/admin
- `teste_multi_clientes.py` - Simulador de múltiplos clientes
- `docker-compose.yml` - Configuração Docker
- `Dockerfile` - Imagem Docker
- `requirements.txt` - Dependências Python

## 🎯 Funcionalidades

### Servidor (`servidor.py`)
- ✅ Gerencia conexões WebSocket
- ✅ Transmite mensagens entre clientes
- ✅ Notifica entrada/saída de usuários
- ✅ Suporte a múltiplos clientes simultâneos

### Cliente (`cliente.py`)
- ✅ Interface de chat interativa
- ✅ Envio e recebimento de mensagens
- ✅ Tratamento de desconexão
- ✅ Suporte a Ctrl+C para sair

### Monitor (`monitor.py`)
- ✅ Visualização de todos os clientes conectados
- ✅ Histórico completo de mensagens
- ✅ Estatísticas em tempo real
- ✅ Timestamps em todas as mensagens
- ✅ Relatórios periódicos automáticos

### Simulador (`teste_multi_clientes.py`)
- ✅ Teste automático com múltiplos clientes
- ✅ Mensagens pré-definidas
- ✅ Delays aleatórios para simular comportamento real
- ✅ Útil para testes de carga

## 🔧 Configuração

### Porta
O servidor roda na porta `8765` por padrão.

### Docker
- Container: `chat-hub`
- Porta mapeada: `8765:8765`
- Restart automático: `unless-stopped`

## 📊 Exemplo de Uso

1. **Terminal 1 - Monitor:**
```bash
python monitor.py
```

2. **Terminal 2 - Cliente 1:**
```bash
python cliente.py
# Digite: "Oi pessoal!"
```

3. **Terminal 3 - Cliente 2:**
```bash
python cliente.py
# Digite: "Olá! Como vai?"
```

4. **Terminal 4 - Simulador:**
```bash
python teste_multi_clientes.py
```

## 🎨 Interface do Monitor

O monitor mostra:
- 🟢 Cliente entrou no chat
- 🔴 Cliente saiu do chat  
- 💬 Mensagem de chat
- 📊 Estatísticas automáticas a cada 30 segundos

## 🛠️ Troubleshooting

### Erro de Conexão
```bash
# Verifique se o container está rodando
docker ps

# Verifique os logs
docker logs chat-hub
```

### Porta em Uso
```bash
# Pare o container
docker-compose down

# Reinicie
docker-compose up -d --build
```

## 📈 Próximas Melhorias

- [ ] Interface web com HTML/CSS/JavaScript
- [ ] Persistência de mensagens em banco de dados
- [ ] Autenticação de usuários
- [ ] Salas de chat separadas
- [ ] Envio de arquivos
- [ ] Emojis e formatação de texto 