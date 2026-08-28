# Começando

## Requisitos

- Python 3.11+ **ou** Docker
- PostgreSQL (via Docker Compose)
- Dependências: `websockets`, `asyncpg`, `python-dotenv` (`requirements.txt`)
- Arquivo `.env` (copie de `.env.example`)

## Subir tudo (recomendado)

```bash
docker-compose up -d --build
```

Sobe:

- Postgres em `localhost:5432`
- chatHub em `ws://localhost:8765`

## Só o banco + app no host

```bash
docker-compose up -d db
pip install -r requirements.txt
python -m app
```

`DATABASE_URL` é montada a partir do `.env` (`POSTGRES_*`). No host, `POSTGRES_HOST=localhost`.

## Clientes de teste

```bash
python clients/cliente.py
python clients/teste_salas.py
```

### Atalhos do CLI (`clients/cliente.py`)

```
/auth <username> <host|member>
/create <nome_da_sala>
/rooms
/join <room_id>
/leave
/help
<texto>          → envia chat na sala atual
```

## Fluxo rápido de teste manual

1. `docker-compose up -d --build` (ou `db` + `python -m app`)
2. Terminal B: `python clients/cliente.py` → `/auth Ana host` → `/create Demo`
3. Terminal C: `python clients/cliente.py` → `/auth Bob member` → `/rooms` → `/join <id>`
4. Digitar mensagens em B e C

## Porta

- WebSocket: **8765**
- PostgreSQL: **5432**

Ver também: [Banco de dados](database.md).
