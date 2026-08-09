-- 0032 — KALENDER_01: jaarkalender.
-- Eén nieuw invoerbaar item (collectieve vrije dag) + eigen terugkerende
-- afspraken. Afgeleide items (APK, keuringen, verlof, verjaardagen) worden
-- gelezen uit hun bron en NIET gekopieerd (KALENDER_01 §3/§7).

CREATE TABLE IF NOT EXISTS collectieve_vrije_dagen (
  id SERIAL PRIMARY KEY,
  werkgever_id INTEGER REFERENCES werkgevers(id) ON DELETE SET NULL, -- NULL = alle BV's
  datum TEXT NOT NULL,                                              -- yyyy-mm-dd
  naam TEXT NOT NULL,
  verlofsoort_id INTEGER NOT NULL REFERENCES verlofsoorten(id),
  -- rapport van de afboeking (aantal verwerkt, negatieve saldi) als jsonb
  afboek_rapport JSONB,
  aangemaakt_door_id INTEGER REFERENCES gebruikers(id) ON DELETE SET NULL,
  aangemaakt_op TIMESTAMP NOT NULL DEFAULT now(),
  bijgewerkt_op TIMESTAMP NOT NULL DEFAULT now()
);
-- Eén collectieve dag per datum per werkgever (NULL-werkgever apart genomen).
CREATE UNIQUE INDEX IF NOT EXISTS collectieve_vrije_dagen_uniek
  ON collectieve_vrije_dagen (COALESCE(werkgever_id, 0), datum);

-- Koppeling: welke verlofaanvragen horen bij welke collectieve dag, zodat
-- terugdraaien (§4.4.4) exact weet wat er ingetrokken moet worden.
ALTER TABLE verlofaanvragen
  ADD COLUMN IF NOT EXISTS collectieve_dag_id INTEGER REFERENCES collectieve_vrije_dagen(id) ON DELETE SET NULL;

-- Eigen terugkerende afspraken (§5.1) — alleen voor zaken zonder bron elders.
CREATE TABLE IF NOT EXISTS kalender_afspraken (
  id SERIAL PRIMARY KEY,
  titel TEXT NOT NULL,
  omschrijving TEXT,
  start_datum TEXT NOT NULL,                       -- yyyy-mm-dd
  herhaling TEXT NOT NULL DEFAULT 'jaarlijks',     -- geen | jaarlijks | halfjaarlijks | kwartaal
  eind_datum TEXT,                                 -- t/m; NULL = geen einde
  aantal_herhalingen INTEGER,                      -- alternatief voor eind_datum
  werkgever_id INTEGER REFERENCES werkgevers(id) ON DELETE SET NULL,
  aangemaakt_op TIMESTAMP NOT NULL DEFAULT now(),
  bijgewerkt_op TIMESTAMP NOT NULL DEFAULT now()
);

-- Uniciteitsgrendel: nooit twee verlofaanvragen voor dezelfde collectieve dag
-- en dezelfde medewerker (race tussen bulk-afboeken en indiensttredings-hook).
CREATE UNIQUE INDEX IF NOT EXISTS verlofaanvragen_collectieve_dag_medewerker_uidx
  ON verlofaanvragen (collectieve_dag_id, medewerker_id)
  WHERE collectieve_dag_id IS NOT NULL;
