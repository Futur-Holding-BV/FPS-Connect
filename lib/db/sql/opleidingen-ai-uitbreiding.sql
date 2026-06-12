-- Opleidingen-uitbreiding (additief, idempotent).
-- Drizzle "db push" faalt onder non-TTY (interactieve truncate-prompt); pas daarom
-- additief toe via: psql "$DATABASE_URL" -f lib/db/sql/opleidingen-ai-uitbreiding.sql
-- Moet een-op-een overeenkomen met lib/db/src/schema/hrm.ts.

-- Onderscheid opleiding/cursus + door AI voorstelbare velden per functie.
ALTER TABLE opleidingen ADD COLUMN IF NOT EXISTS soort text NOT NULL DEFAULT 'cursus';
ALTER TABLE opleidingen ADD COLUMN IF NOT EXISTS niveau text;
ALTER TABLE opleidingen ADD COLUMN IF NOT EXISTS opleider text;
ALTER TABLE opleidingen ADD COLUMN IF NOT EXISTS studieduur text;
ALTER TABLE opleidingen ADD COLUMN IF NOT EXISTS studiebelasting text;
ALTER TABLE opleidingen ADD COLUMN IF NOT EXISTS lesvorm text;
ALTER TABLE opleidingen ADD COLUMN IF NOT EXISTS kosten_indicatie text;
ALTER TABLE opleidingen ADD COLUMN IF NOT EXISTS kosten_werkgever_pct integer;
ALTER TABLE opleidingen ADD COLUMN IF NOT EXISTS kosten_werknemer_pct integer;

-- Koppeling functie <-> opleiding (veel-op-veel).
CREATE TABLE IF NOT EXISTS functie_opleidingen (
  id serial PRIMARY KEY,
  functie_id integer NOT NULL REFERENCES functies(id) ON DELETE CASCADE,
  opleiding_id integer NOT NULL REFERENCES opleidingen(id) ON DELETE CASCADE,
  aangemaakt_op timestamp NOT NULL DEFAULT now(),
  CONSTRAINT functie_opleidingen_uniek UNIQUE (functie_id, opleiding_id)
);
CREATE INDEX IF NOT EXISTS functie_opleidingen_functie_idx ON functie_opleidingen (functie_id);
CREATE INDEX IF NOT EXISTS functie_opleidingen_opleiding_idx ON functie_opleidingen (opleiding_id);
