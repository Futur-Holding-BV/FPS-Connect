-- AANVRAAG_01 §1 — Migratie 0128: intake-FK kolommen
-- aanvraag_voorstellen: nullable FKs naar inbox, klant, contact, gebouw, opname, calculatie, werkmaatschappij
-- mod_calc_headers: aanvraag_voorstel_id, opdrachtgever FK's, werkmaatschappij FK
-- gebouw_partijen: klant_id, contactpersoon_id FK's + unieke partial index

-- ── aanvraag_voorstellen ──────────────────────────────────────────────────────

ALTER TABLE aanvraag_voorstellen
  ADD COLUMN IF NOT EXISTS inbox_item_id          integer REFERENCES inbox_items(id)         ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS klant_id               integer REFERENCES crm_klanten(id)          ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contactpersoon_id      integer REFERENCES crm_contactpersonen(id)  ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS gebouw_id              integer REFERENCES gebouwen(id)              ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS opname_id              integer REFERENCES opnames(id)               ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS calculatie_id          integer REFERENCES mod_calc_headers(id)      ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS werkmaatschappij_id    integer REFERENCES werkgevers(id)            ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS aanvraag_voorstellen_inbox_item_idx
  ON aanvraag_voorstellen(inbox_item_id) WHERE inbox_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS aanvraag_voorstellen_klant_idx
  ON aanvraag_voorstellen(klant_id) WHERE klant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS aanvraag_voorstellen_contactpersoon_idx
  ON aanvraag_voorstellen(contactpersoon_id) WHERE contactpersoon_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS aanvraag_voorstellen_gebouw_idx
  ON aanvraag_voorstellen(gebouw_id) WHERE gebouw_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS aanvraag_voorstellen_opname_idx
  ON aanvraag_voorstellen(opname_id) WHERE opname_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS aanvraag_voorstellen_calculatie_idx
  ON aanvraag_voorstellen(calculatie_id) WHERE calculatie_id IS NOT NULL;

-- Unieke partial index: één calculatie mag maar aan één voorstel hangen
CREATE UNIQUE INDEX IF NOT EXISTS aanvraag_voorstellen_calculatie_uq
  ON aanvraag_voorstellen(calculatie_id) WHERE calculatie_id IS NOT NULL;

-- ── mod_calc_headers ──────────────────────────────────────────────────────────

ALTER TABLE mod_calc_headers
  ADD COLUMN IF NOT EXISTS aanvraag_voorstel_id           integer REFERENCES aanvraag_voorstellen(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS opdrachtgever_klant_id         integer REFERENCES crm_klanten(id)           ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS opdrachtgever_contactpersoon_id integer REFERENCES crm_contactpersonen(id)  ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS werkmaatschappij_id            integer REFERENCES werkgevers(id)             ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS mod_calc_headers_aanvraag_voorstel_uq
  ON mod_calc_headers(aanvraag_voorstel_id) WHERE aanvraag_voorstel_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS mod_calc_headers_opdrachtgever_klant_idx
  ON mod_calc_headers(opdrachtgever_klant_id) WHERE opdrachtgever_klant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS mod_calc_headers_opdrachtgever_contact_idx
  ON mod_calc_headers(opdrachtgever_contactpersoon_id) WHERE opdrachtgever_contactpersoon_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS mod_calc_headers_werkmaatschappij_idx
  ON mod_calc_headers(werkmaatschappij_id) WHERE werkmaatschappij_id IS NOT NULL;

-- ── gebouw_partijen ───────────────────────────────────────────────────────────

ALTER TABLE gebouw_partijen
  ADD COLUMN IF NOT EXISTS klant_id          integer REFERENCES crm_klanten(id)         ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contactpersoon_id integer REFERENCES crm_contactpersonen(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS gebouw_partijen_klant_idx
  ON gebouw_partijen(klant_id) WHERE klant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS gebouw_partijen_contactpersoon_idx
  ON gebouw_partijen(contactpersoon_id) WHERE contactpersoon_id IS NOT NULL;

-- Unieke partial: per gebouw+type+klant maar één partijregel (waar klant gevuld is)
CREATE UNIQUE INDEX IF NOT EXISTS gebouw_partijen_gebouw_type_klant_uq
  ON gebouw_partijen(gebouw_id, type, klant_id) WHERE klant_id IS NOT NULL;
