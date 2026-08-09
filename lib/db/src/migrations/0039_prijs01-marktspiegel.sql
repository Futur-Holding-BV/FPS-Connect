-- PRIJS_01 §8 — de marktspiegel. Een achtergronddienst die, op aanvraag (nooit
-- doorlopend), voor een prijsafspraak, financieel contract of een vrije vraag
-- naar buiten kijkt: "dit betaal je, dit vraagt de markt". Elke vergelijking
-- draagt verplicht een vindplaats en datum; wat niet gevonden is blijft leeg.
-- Het systeem adviseert NOOIT om over te stappen (§8.3, §9).
--
-- Additieve migratie (genummerd, drift-gecheckt zoals 0037/0038; GEEN drizzle push).
CREATE TABLE IF NOT EXISTS marktspiegel_onderzoeken (
  id             serial PRIMARY KEY,
  -- 'prijsafspraak' | 'financieel_contract' | 'vrij'
  onderwerp_type text NOT NULL,
  onderwerp_id   integer,
  vraag          text NOT NULL,
  -- 'bezig' | 'klaar' | 'fout'
  status         text NOT NULL DEFAULT 'bezig',
  resultaat      jsonb,
  fout           text,
  aangevraagd_door integer,
  -- 'afloop' | 'prijsverhoging' | 'handmatig'
  aanleiding     text NOT NULL DEFAULT 'handmatig',
  aangemaakt_op  timestamp NOT NULL DEFAULT now(),
  klaar_op       timestamp
);

CREATE INDEX IF NOT EXISTS marktspiegel_onderzoeken_status_idx
  ON marktspiegel_onderzoeken (status);
CREATE INDEX IF NOT EXISTS marktspiegel_onderzoeken_onderwerp_idx
  ON marktspiegel_onderzoeken (onderwerp_type, onderwerp_id);
