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

CREATE TABLE IF NOT EXISTS units (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Perfis válidos:
-- 'member': apenas membro (não pode virar host, não pode criar sala)
-- 'host': apenas host (cria salas, tem acesso host)
-- 'host_member': pode alternar livremente entre host e member
-- 'admin': gerenciador do sistema (painel admin + todas permissões)
CREATE TABLE IF NOT EXISTS users (
    id              TEXT PRIMARY KEY,
    username        TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    profile         TEXT NOT NULL CHECK (profile IN ('admin', 'host', 'member', 'host_member')),
    unit_id         TEXT REFERENCES units(id) ON DELETE SET NULL,
    session_token   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migrações idempotentes para schemas existentes
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS unit_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_token TEXT;

-- Migra dados de schemas anteriores se existia factory_id ou institution_id
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='factory_id') THEN
        UPDATE users SET unit_id = factory_id WHERE unit_id IS NULL AND factory_id IS NOT NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='institution_id') THEN
        UPDATE users SET unit_id = institution_id WHERE unit_id IS NULL AND institution_id IS NOT NULL;
    END IF;
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;

-- Atualiza restrição de perfil para incluir 'host_member'
DO $$
BEGIN
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_profile_check;
    ALTER TABLE users ADD CONSTRAINT users_profile_check CHECK (profile IN ('admin', 'host', 'member', 'host_member'));
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;

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
