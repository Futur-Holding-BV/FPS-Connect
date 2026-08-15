-- ACTIEPUNTEN — zes punten van 15 aug 2026 toevoegen aan de zijrandlijst
-- van de hoofdbeheerder. Achteraan de bestaande lijst, in de volgorde
-- waarin René ze aandroeg. Idempotent: alleen invoegen als de titel nog
-- niet bestaat.
WITH basis AS (
  SELECT COALESCE(MAX(volgorde), 0) AS max_v FROM actiepunten
), nieuw (offset_v, titel, categorie, omschrijving) AS (
  VALUES
    (10, 'Ticket naar Denko — foutcode 90094', 'platform',
     'De werk-inbox loopt vast op beheerderstoestemming. Alles aan onze kant is gemeten en goed. Blokkeert de hele mailkoppeling.'),
    (20, 'Ticket naar TransIP — koersa.online', 'platform',
     'Vastgelopen nameserverwijziging bij de registry; alleen TransIP kan dat opruimen.'),
    (30, 'Oud Azure-geheim verwijderen', 'platform',
     'Pas nadat de mailkoppeling écht werkt; de systeemmail gebruikt het nog.'),
    (40, 'VPS herstarten', 'platform',
     'De server meldt bij inloggen dat een herstart vereist is.'),
    (50, 'Uitzoeken waarom Platform, Adviescentrum en Planner geen bouwcontrole draaien', 'platform',
     'Die drie staan grijs op het beheerscherm en kunnen dus ongemerkt kapotte code uitrollen.'),
    (60, 'Beslissen waarvoor het kantoorscherm rood mag worden', 'overig',
     'Voorstel: product plat, uitrol mislukt, back-up niet gemaakt — en níét bij een mislukte bouwcontrole.')
)
INSERT INTO actiepunten (titel, omschrijving, categorie, status, volgorde, bijgewerkt_op)
SELECT n.titel, n.omschrijving, n.categorie, 'open', basis.max_v + n.offset_v, NOW()
FROM nieuw n, basis
WHERE NOT EXISTS (SELECT 1 FROM actiepunten a WHERE a.titel = n.titel);
