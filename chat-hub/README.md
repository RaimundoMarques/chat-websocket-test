# chatHub

Chat em tempo real via WebSocket, com salas, perfis e **PostgreSQL**.

Backend Python (`asyncio` + `websockets` + `asyncpg`). Frontend web em [`../web`](../web/README.md).

## Documentação

Tudo está em **[docs/](docs/README.md)**:

- [Visão geral](docs/overview.md)
- [Começando](docs/getting-started.md)
- [Arquitetura](docs/architecture.md)
- [API WebSocket](docs/api.md)
- [Perfis e salas](docs/rooms-and-profiles.md)
- [Banco de dados](docs/database.md)

## Variáveis de ambiente

Copie o exemplo e ajuste se necessário:

```bash
cp .env.example .env
```

| Variável | Descrição | Padrão |
|----------|-----------|--------|
| `POSTGRES_USER` | Usuário do banco | `chathub` |
| `POSTGRES_PASSWORD` | Senha do banco | `chathub` |
| `POSTGRES_DB` | Nome do banco | `chathub` |
| `POSTGRES_HOST` | Host (`localhost` no host; `db` no Docker) | `localhost` |
| `POSTGRES_PORT` | Porta do Postgres | `5432` |
| `PORT` | Porta WebSocket do app | `8765` |
| `DATABASE_URL` | URL completa (opcional; sobrescreve as vars acima) | montada automaticamente |

O `docker-compose.yml` lê o `.env` e define `POSTGRES_HOST=db` no serviço `chat-hub`.

## Quick start

```bash
docker-compose up -d --build
python clients/cliente.py
```

Sobe Postgres (`localhost:5432`) e WebSocket (`ws://localhost:8765`).

## Desenvolvimento local (sem container do app)

```bash
docker-compose up -d db
pip install -r requirements.txt
python -m app
```

O app carrega `chat-hub/.env` e conecta em `POSTGRES_HOST=localhost`.

## Clientes de teste

```bash
python clients/cliente.py      # CLI interativo
python clients/teste_salas.py    # cenários automatizados
```

Atalhos do CLI: `/auth`, `/create`, `/rooms`, `/join`, `/leave`, `/help`

## Frontend

Interface React em [`../web`](../web/README.md):

```bash
cd ../web && npm install && npm run dev
```
