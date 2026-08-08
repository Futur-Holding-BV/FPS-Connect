-- WVB_01: werkvoorbereiding als stroom
--
-- 1. Dagdeeltarieven als eigen tariefsoort in regie_tarieven (niet stilzwijgend
--    4 uur rekenen): tariefsoort 'uur' | 'dagdeel'.
-- 2. Vooraf-regelen-checklist per opdracht (toegang, vergunning, V&G,
--    hoogwerker, ...): expliciete regels met afvink-audit.

ALTER TABLE regie_tarieven
  ADD COLUMN IF NOT EXISTS tariefsoort text NOT NULL DEFAULT 'uur';

CREATE TABLE IF NOT EXISTS opdracht_checklist_items (
  id serial PRIMARY KEY,
  opdracht_id integer NOT NULL REFERENCES opdrachten(id) ON DELETE CASCADE,
  label text NOT NULL,
  categorie text NOT NULL DEFAULT 'overig',
  afgevinkt boolean NOT NULL DEFAULT false,
  afgevinkt_door_id integer REFERENCES gebruikers(id) ON DELETE SET NULL,
  afgevinkt_op timestamp,
  volgorde integer NOT NULL DEFAULT 0,
  aangemaakt_op timestamp NOT NULL DEFAULT now(),
  bijgewerkt_op timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS opdracht_checklist_opdracht_idx
  ON opdracht_checklist_items (opdracht_id);
