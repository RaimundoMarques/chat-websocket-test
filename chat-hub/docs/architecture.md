# Arquitetura

## Estrutura de pastas

```
chat-hub/
├── app/                     # Backend
│   ├── __main__.py          # python -m app
│   ├── main.py              # Startup: DB + WebSocket
│   ├── config.py            # Porta, limites, DATABASE_URL
│   ├── db.py                # Pool asyncpg
│   ├── repository.py        # SQL (users, rooms, messages)
│   ├── models.py            # User, Room
│   ├── protocol.py          # Tipos de mensagem JSON
│   ├── hub.py               # Regras + sync memória/DB
│   └── handler.py           # WebSocket handler
├── db/
│   └── init.sql             # Schema PostgreSQL
├── clients/
├── docs/
├── docker-compose.yml       # chat-hub + postgres
├── Dockerfile
└── requirements.txt
```

## Responsabilidades

| Módulo | Papel |
|--------|-------|
| `main.py` | Conecta DB, carrega salas, sobe WebSocket |
| `db.py` | Pool e bootstrap do schema |
| `repository.py` | Inserts/updates/queries |
| `handler.py` | Parse JSON e broadcast |
| `hub.py` | Regras de negócio + sincroniza com o banco |
| `config.py` | Constantes e `DATABASE_URL` |

## Fluxo

```
Cliente → handler → hub (memória) → repository → PostgreSQL
                 ↘ broadcast WebSocket (membros online)
```

## Estado

| Onde | O quê |
|------|-------|
| Memória (`HubState`) | Conexões WebSocket, membros online, salas ativas |
| PostgreSQL | users, rooms, room_members, messages |

Ao reiniciar o servidor, `room_members` é limpo (presença ao vivo) e as **salas** são recarregadas do banco.

## Docker

```
docker-compose up -d --build
```

Sobe `db` (Postgres) e `chat-hub` (app), com dependência no healthcheck do banco.
