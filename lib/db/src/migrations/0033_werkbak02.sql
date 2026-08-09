-- WERKBAK_02 — teamoverleg, eigen taken en de AI-workflow.
-- Geen nieuwe meldingentabel: werkbak_items wordt uitgebreid.

-- Wekelijkse overleggen: vastlegging zodat blok 1 de week erna kan tonen wat
-- er is afgesproken. Geen notulen-document, alleen de feiten.
CREATE TABLE IF NOT EXISTS overleggen (
  id serial PRIMARY KEY,
  datum text NOT NULL,
  aanwezigen text[] NOT NULL DEFAULT '{}',
  besproken jsonb,
  aangemaakt_door integer REFERENCES gebruikers(id) ON DELETE SET NULL,
  aangemaakt_op timestamp NOT NULL DEFAULT now()
);

-- Eigen taken: eigenaar zit al in gebruiker_id; erbij komen de verplichte
-- datum, meewerkers (bijwerken maar niet afronden) en de koppeling aan het
-- overleg waarop de taak is weggezet (voedt blok 1 van de week erna).
ALTER TABLE werkbak_items ADD COLUMN IF NOT EXISTS deadline text;
ALTER TABLE werkbak_items ADD COLUMN IF NOT EXISTS meewerker_ids integer[] NOT NULL DEFAULT '{}';
ALTER TABLE werkbak_items ADD COLUMN IF NOT EXISTS overleg_id integer REFERENCES overleggen(id) ON DELETE SET NULL;

-- Sterren: persoonlijk en privé (§7.3). Nooit zichtbaar voor een ander,
-- geen invloed op gewicht. Voor mail hangt de ster aan de conversatie.
CREATE TABLE IF NOT EXISTS workflow_sterren (
  id serial PRIMARY KEY,
  gebruiker_id integer NOT NULL REFERENCES gebruikers(id) ON DELETE CASCADE,
  doel_type text NOT NULL, -- 'werkbak' | 'mail_conversatie'
  doel_sleutel text NOT NULL, -- werkbak: item-id; mail: conversation_id
  sterren integer NOT NULL,
  aangemaakt_op timestamp NOT NULL DEFAULT now(),
  bijgewerkt_op timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS workflow_sterren_uidx
  ON workflow_sterren (gebruiker_id, doel_type, doel_sleutel);
