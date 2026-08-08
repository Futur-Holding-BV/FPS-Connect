-- WAGENPARK_01 — autodocumenten, instelbare documentsoorten, elektrische bus, vaste garage, RDW-herkomst.
--
-- 1. 'voertuig' als toegestaan doeltype op document_koppelingen (de check zit in de database).
-- 2. documentsoorten: door de beheerder zelf te beheren soorten met vervaldatum-vlag en waarschuwingstermijn.
--    Startset wordt eenmalig gezaaid; bewerkbaar en verwijderbaar (geen ingebakken lijst).
-- 3. documenten.documentsoort_id verwijst naar de gekozen soort.
-- 4. voertuigen: aandrijving, vaste garage (naam+e-mail), RDW-herkomststempel.

-- 1) doeltype 'voertuig' (en alvast 'financieel_contract' bewust NIET — dat is CONTRACT_01)
ALTER TABLE document_koppelingen
  DROP CONSTRAINT IF EXISTS document_koppelingen_doel_type_check;
ALTER TABLE document_koppelingen
  ADD CONSTRAINT document_koppelingen_doel_type_check
  CHECK (doel_type IN ('gebouw','klant','offerte','dossier','voorziening','opdracht','voertuig'));

-- 2) documentsoorten (context onderscheidt straks voertuig- van contractsoorten; CONTRACT_01 hergebruikt dit)
CREATE TABLE IF NOT EXISTS documentsoorten (
  id                 serial PRIMARY KEY,
  context            text NOT NULL DEFAULT 'voertuig',
  naam               text NOT NULL,
  heeft_vervaldatum  boolean NOT NULL DEFAULT true,
  waarschuwing_dagen integer NOT NULL DEFAULT 30,
  aangemaakt_op      timestamp NOT NULL DEFAULT now(),
  bijgewerkt_op      timestamp NOT NULL DEFAULT now(),
  CONSTRAINT documentsoorten_context_check CHECK (context IN ('voertuig','financieel_contract')),
  CONSTRAINT documentsoorten_waarschuwing_check CHECK (waarschuwing_dagen >= 0 AND waarschuwing_dagen <= 365),
  CONSTRAINT documentsoorten_context_naam_uniek UNIQUE (context, naam)
);

-- Startset (éénmalig; daarna volledig beheerbaar)
INSERT INTO documentsoorten (context, naam, heeft_vervaldatum, waarschuwing_dagen) VALUES
  ('voertuig', 'Kentekenbewijs',      false, 0),
  ('voertuig', 'Verzekeringspolis',   true,  30),
  ('voertuig', 'Groene kaart',        true,  30),
  ('voertuig', 'Leasecontract',       true,  60),
  ('voertuig', 'Onderhoudscontract',  true,  60),
  ('voertuig', 'Schaderapport',       false, 0),
  ('voertuig', 'Keuringsrapport',     true,  30),
  ('voertuig', 'Tankpas/laadpas',     true,  30)
ON CONFLICT (context, naam) DO NOTHING;

-- 3) koppeling document → soort
ALTER TABLE documenten
  ADD COLUMN IF NOT EXISTS documentsoort_id integer REFERENCES documentsoorten(id) ON DELETE SET NULL;

-- 4) voertuigvelden
ALTER TABLE voertuigen
  ADD COLUMN IF NOT EXISTS aandrijving text NOT NULL DEFAULT 'diesel',
  ADD COLUMN IF NOT EXISTS garage_naam text,
  ADD COLUMN IF NOT EXISTS garage_email text,
  ADD COLUMN IF NOT EXISTS rdw_opgehaald_op timestamp;
ALTER TABLE voertuigen
  DROP CONSTRAINT IF EXISTS voertuigen_aandrijving_check;
ALTER TABLE voertuigen
  ADD CONSTRAINT voertuigen_aandrijving_check
  CHECK (aandrijving IN ('diesel','benzine','elektrisch','hybride'));
