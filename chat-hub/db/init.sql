-- =============================================================================
-- chatHub — ÚNICO arquivo de schema do PostgreSQL
-- =============================================================================
-- REGRA DO PROJETO:
--   Toda alteração de estrutura de tabelas (CREATE/ALTER/DROP/INDEX) deve ser
--   feita NESTE arquivo. Não criar migrations, nem outros .sql de schema.
--
-- Como aplicar mudança em ambiente de desenvolvimento:
--   1. Edite este arquivo
--   2. Recrie o volume do Postgres (apaga dados locais):
--        docker-compose down -v
--        docker-compose up -d
--
-- Na primeira criação do volume, o Docker executa este script automaticamente
-- (docker-entrypoint-initdb.d). O app também reexecuta statements idempotentes
-- no startup (IF NOT EXISTS) via ensure_schema.
-- =============================================================================

CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    username    TEXT NOT NULL UNIQUE,
    profile     TEXT NOT NULL CHECK (profile IN ('host', 'member')),
    session_token TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migração idempotente caso a coluna session_token ainda não exista em base já criada
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_token TEXT;

CREATE TABLE IF NOT EXISTS rooms (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    created_by  TEXT NOT NULL REFERENCES users(id),
    is_private  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migração idempotente caso a coluna is_private ainda não exista em base já criada
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS room_allowed_users (
    room_id     TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    username    TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (room_id, username)
);

CREATE INDEX IF NOT EXISTS idx_room_allowed_users_username
    ON room_allowed_users (username);

CREATE TABLE IF NOT EXISTS room_members (
    room_id     TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (room_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
    id          BIGSERIAL PRIMARY KEY,
    room_id     TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id     TEXT NOT NULL REFERENCES users(id),
    text        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_room_created
    ON messages (room_id, created_at);
