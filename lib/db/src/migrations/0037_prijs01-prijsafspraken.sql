-- PRIJS_01 §3 — Prijsafspraken (jaarprijzen, staffels, toeslagen) als eigen
-- tabel met geldigheidsperioden. Nooit overschrijven: een nieuwe jaarprijs is
-- een nieuwe regel met een nieuwe periode; de oude blijft staan (§9).
--
-- Overlap-weigering op DB-niveau (§3): voor elke datum is precies één prijs
-- geldig per leverancier, artikel(code) en staffel. Dat wordt afgedwongen met
-- een EXCLUDE-constraint (btree_gist) i.p.v. stil oplossen. De app-laag geeft
-- daarbovenop een nette 409 met de botsende regel; de DB-constraint is het
-- vangnet.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS prijsafspraken (
  id serial PRIMARY KEY,
  leverancier_id integer NOT NULL REFERENCES leveranciers(id),
  -- artikel_id NULL = leverancierscode nog niet gekoppeld aan een eigen artikel
  -- (§4: onbekend artikel wordt NOOIT automatisch aangemaakt).
  artikel_id integer REFERENCES mod_calc_artikelen(id) ON DELETE SET NULL,
  leverancier_artikelcode text,
  leverancier_omschrijving text,
  prijs numeric(12,4) NOT NULL,
  eenheid text NOT NULL,
  excl_btw boolean NOT NULL DEFAULT true,
  valuta text NOT NULL DEFAULT 'EUR',
  geldig_van date NOT NULL,
  geldig_tot date NOT NULL,
  -- Staffel: vanaf dit aantal geldt deze prijs; 0 = basisprijs.
  staffel_vanaf real NOT NULL DEFAULT 0,
  -- Toeslagen die apart gelden: [{soort,bedrag,eenheid?}]
  -- soort: transport | spoed | kleine_order | anders
  toeslagen jsonb NOT NULL DEFAULT '[]',
  bron_prijslijst text,
  bron_datum date,
  bron text NOT NULL DEFAULT 'handmatig',
  import_id integer,
  aangemaakt_door integer,
  aangemaakt_op timestamp NOT NULL DEFAULT now(),
  bijgewerkt_op timestamp NOT NULL DEFAULT now(),
  -- Rollback van een import zet teruggedraaid_op i.p.v. delete, zodat de
  -- historie traceerbaar blijft (§4).
  teruggedraaid_op timestamp
);

-- Overlap-weigering: per (leverancier, artikel of artikelcode, staffel) mag de
-- geldigheidsperiode niet overlappen met een andere, niet-teruggedraaide regel.
-- Inclusieve grenzen '[]' — geldig_tot telt mee als geldige dag.
ALTER TABLE prijsafspraken
  ADD CONSTRAINT prijsafspraken_geen_overlap
  EXCLUDE USING gist (
    leverancier_id WITH =,
    (coalesce(artikel_id, -1)) WITH =,
    (coalesce(nullif(leverancier_artikelcode, ''), '-')) WITH =,
    staffel_vanaf WITH =,
    daterange(geldig_van, geldig_tot, '[]') WITH &&
  )
  WHERE (teruggedraaid_op IS NULL);

CREATE INDEX IF NOT EXISTS prijsafspraken_leverancier_idx ON prijsafspraken (leverancier_id);
CREATE INDEX IF NOT EXISTS prijsafspraken_artikel_idx ON prijsafspraken (artikel_id);
CREATE INDEX IF NOT EXISTS prijsafspraken_import_idx ON prijsafspraken (import_id);

-- §3: het brondocument (de prijslijst) wordt gekoppeld via document_koppelingen
-- met doeltype 'prijsafspraak'. De CHECK-constraint uitbreiden.
ALTER TABLE document_koppelingen DROP CONSTRAINT IF EXISTS document_koppelingen_doel_type_check;
ALTER TABLE document_koppelingen ADD CONSTRAINT document_koppelingen_doel_type_check
  CHECK (doel_type IN ('gebouw','klant','offerte','dossier','voorziening','opdracht','voertuig','prijsafspraak'));

-- §6: instelbare marge voor de factuurcontrole (procentpunten).
ALTER TABLE app_instellingen
  ADD COLUMN IF NOT EXISTS prijsafwijking_marge_pct real NOT NULL DEFAULT 2;
