-- GEBRUIKERS_01 aanvulling: externe adviseur / dienstverlener (bv. externe
-- boekhouder of HRM-adviseur). Krijgt een account met functie en rechten,
-- maar GEEN medewerkerprofiel, aanstelling, contract, verlofopbouw of
-- contractbewaking. Wel vastgelegd: bedrijf, contactpersoon, waarvoor
-- ingeschakeld en tot wanneer de toegang geldt.
CREATE TABLE IF NOT EXISTS externe_adviseurs (
  id serial PRIMARY KEY,
  gebruiker_id integer NOT NULL UNIQUE REFERENCES gebruikers(id) ON DELETE CASCADE,
  bedrijf text NOT NULL,
  contactpersoon text,
  ingeschakeld_voor text NOT NULL,
  functietitel text,
  toegang_tot date NOT NULL,
  aangemaakt_op timestamp NOT NULL DEFAULT now(),
  bijgewerkt_op timestamp NOT NULL DEFAULT now()
);
