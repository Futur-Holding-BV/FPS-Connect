-- Automatisch uitgevoerd bij eerste start van de PostgreSQL-container
-- Maakt vereiste extensies aan

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Sessietabel voor connect-pg-simple (Express sessies)
CREATE TABLE IF NOT EXISTS session (
    sid    VARCHAR      NOT NULL COLLATE "default",
    sess   JSON         NOT NULL,
    expire TIMESTAMP(6) NOT NULL,
    CONSTRAINT session_pkey PRIMARY KEY (sid)
);

CREATE INDEX IF NOT EXISTS IDX_session_expire ON session (expire);
