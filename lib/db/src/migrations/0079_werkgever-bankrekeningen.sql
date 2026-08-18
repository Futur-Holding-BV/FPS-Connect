-- ADMINISTRATIE_01 fase 2 — bankrekeningen per werkmaatschappij.
-- Lijst van rekeningen (IBAN + tenaamstelling + doelen) vervangt het enkele
-- werkgevers.iban-veld. Het bestaande nummer wordt per werkmaatschappij
-- overgenomen met standaard alle doelen (ontvangst, crediteuren, loon).
-- G-rekening blijft als keuze bestaan maar wordt nergens automatisch gevuld.

CREATE TABLE IF NOT EXISTS werkgever_bankrekeningen (
  id serial PRIMARY KEY,
  werkgever_id integer NOT NULL REFERENCES werkgevers(id) ON DELETE CASCADE,
  iban text NOT NULL,
  tenaamstelling text NOT NULL,
  doelen text[] NOT NULL DEFAULT '{}',
  aangemaakt_op timestamp NOT NULL DEFAULT now(),
  bijgewerkt_op timestamp NOT NULL DEFAULT now(),
  CONSTRAINT werkgever_bankrekeningen_wg_iban_uniek UNIQUE (werkgever_id, iban)
);

-- Wijzigingslog: wie, wanneer, wat — een gewijzigd rekeningnummer is de
-- klassieke fraudetruc, dus elke mutatie wordt vastgelegd én gemaild.
CREATE TABLE IF NOT EXISTS werkgever_bankrekening_logs (
  id serial PRIMARY KEY,
  werkgever_id integer NOT NULL,
  bankrekening_id integer,
  actie text NOT NULL,
  wijzigingen jsonb NOT NULL DEFAULT '{}'::jsonb,
  gebruiker_id integer,
  gebruiker_naam text,
  tijdstip timestamp NOT NULL DEFAULT now()
);

-- Overname van het bestaande enkele nummer per werkmaatschappij.
INSERT INTO werkgever_bankrekeningen (werkgever_id, iban, tenaamstelling, doelen)
SELECT id, upper(replace(trim(iban), ' ', '')), naam, ARRAY['ontvangst','crediteuren','loon']
FROM werkgevers
WHERE iban IS NOT NULL AND trim(iban) <> ''
ON CONFLICT (werkgever_id, iban) DO NOTHING;

INSERT INTO werkgever_bankrekening_logs (werkgever_id, bankrekening_id, actie, wijzigingen, gebruiker_naam)
SELECT werkgever_id, id, 'overgenomen',
       jsonb_build_object('iban', iban, 'tenaamstelling', tenaamstelling, 'doelen', to_jsonb(doelen)),
       'Migratie 0079 (overname bestaand veld)'
FROM werkgever_bankrekeningen;
