# Banco de dados (PostgreSQL)

O chatHub usa **PostgreSQL 16** como banco, subindo via Docker Compose.

## Serviços

| Serviço       | Imagem / build        | Porta  |
|---------------|-----------------------|--------|
| `db`          | `postgres:16-alpine`  | `5432` |
| `chat-hub`    | build local           | `8765` |

O serviço `db` usa `pull_policy: never`: **não baixa** da internet; a imagem `postgres:16-alpine` precisa já existir na máquina (`docker images`).

O `chat-hub` só sobe depois do healthcheck do Postgres (`pg_isready`).

## Variáveis de ambiente

Arquivo `chat-hub/.env` (copie de `.env.example`):

| Variável | Descrição | Padrão |
|----------|-----------|--------|
| `POSTGRES_USER` | Usuário do banco | `chathub` |
| `POSTGRES_PASSWORD` | Senha | `chathub` |
| `POSTGRES_DB` | Nome do banco | `chathub` |
| `POSTGRES_HOST` | Host (`localhost` no host; `db` no container) | `localhost` |
| `POSTGRES_PORT` | Porta | `5432` |
| `PORT` | Porta WebSocket | `8765` |
| `DATABASE_URL` | URL completa (opcional) | montada em `app/config.py` |

- **Docker Compose** lê `.env` para o Postgres e passa `POSTGRES_HOST=db` ao serviço `chat-hub`.
- **App local** (`python -m app`) carrega `.env` via `python-dotenv` e usa `POSTGRES_HOST=localhost`.

## Schema (arquivo único)

**Fonte única de verdade:** `db/init.sql`

- Qualquer mudança de estrutura de tabelas deve ser feita **somente** nesse arquivo.
- Não criar migrations, nem outros `.sql` de schema.
- Em desenvolvimento, após alterar o schema, recrie o volume (apaga dados locais):

```bash
docker-compose down -v
docker-compose up -d
```

O Docker aplica `init.sql` na **primeira** criação do volume. O app também roda o arquivo no startup (`ensure_schema`) com statements idempotentes (`IF NOT EXISTS`).

| Tabela | Conteúdo |
|--------|----------|
| `users` | id, username, profile (`host`/`member`) |
| `rooms` | id, name, created_by |
| `room_members` | presença atual na sala |
| `messages` | histórico de chat por sala |

No startup do servidor:

1. Conecta no pool (`asyncpg`)
2. Garante o schema (`ensure_schema` → `db/init.sql`)
3. Limpa `room_members` (presença é do processo atual)
4. Carrega salas existentes para a memória

## O que é persistido

- Usuário no `auth` (upsert por `username`)
- Criação de sala / entrada / saída de membros
- Cada mensagem de `chat`

Tempo real (broadcast) continua em memória; o banco guarda o estado e o histórico.

## Como subir

```bash
# sobe Postgres + servidor
docker-compose up -d --build

# só o banco (app rodando no host)
docker-compose up -d db
pip install -r requirements.txt
python -m app
```

## Volume

Dados em `chathub_pgdata`. Para zerar o banco:

```bash
docker-compose down -v
```
