# chatHub — frontend

Interface web do chatHub (Vite + React + TypeScript).

## Pré-requisitos

- **Backend** e Postgres rodando — ver [chat-hub/README.md](../chat-hub/README.md)
- Node.js 18+ (testado com 20.x)

## Desenvolvimento

```bash
# 1. Backend (em outro terminal)
cd ../chat-hub
docker-compose up -d --build

# 2. Frontend
npm install
npm run dev
```

Abre em `http://localhost:5173` e conecta em `ws://localhost:8765`.

### URL do WebSocket

Por padrão usa `ws://localhost:8765`. Para alterar, defina `VITE_WS_URL`:

```bash
# Bash
VITE_WS_URL=ws://localhost:8765 npm run dev

# PowerShell
$env:VITE_WS_URL="ws://localhost:8765"; npm run dev
```

Ou crie um `.env` na raiz de `web/`:

```
VITE_WS_URL=ws://localhost:8765
```

## Fluxo na UI

1. Entrar com username + perfil (`host` ou `member`)
2. Host cria sala; member atualiza a lista e entra
3. Conversar na sala

## Estrutura

```
web/
├── src/
│   ├── App.tsx       # UI principal (login, lobby, sala)
│   ├── lib/ws.ts     # Cliente WebSocket
│   └── types.ts      # Tipos do protocolo
├── public/
└── vite.config.ts
```

Protocolo completo: [API WebSocket](../chat-hub/docs/api.md).

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Servidor de desenvolvimento (porta 5173) |
| `npm run build` | Type-check + build de produção |
| `npm run preview` | Preview do build local |
