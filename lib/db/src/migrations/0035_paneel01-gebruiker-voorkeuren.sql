-- PANEEL_01 §4.4 / MENU_01 §4.3 — generiek per-gebruiker UI-voorkeurenmechanisme.
-- Eén tabel voor alle UI-voorkeuren (sleutel -> waarde) per gebruiker.
CREATE TABLE IF NOT EXISTS gebruiker_voorkeuren (
  id serial PRIMARY KEY,
  gebruiker_id integer NOT NULL REFERENCES gebruikers(id) ON DELETE CASCADE,
  sleutel text NOT NULL,
  waarde jsonb NOT NULL,
  bijgewerkt_op timestamp NOT NULL DEFAULT now()
);

-- Eén rij per gebruiker + sleutel; grondslag voor de upsert (ON CONFLICT).
CREATE UNIQUE INDEX IF NOT EXISTS gebruiker_voorkeuren_gebruiker_id_sleutel_unique
  ON gebruiker_voorkeuren (gebruiker_id, sleutel);
