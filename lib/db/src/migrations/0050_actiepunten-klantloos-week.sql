-- ACTIEPUNTEN — zeven punten toevoegen aan de zijrandlijst van de
-- hoofdbeheerder (15 aug 2026). Volgorde: punt "Fouten verzamelen" bovenaan
-- van deze reeks, daarna de rest; alles achteraan de bestaande lijst.
-- Idempotent: alleen invoegen als de titel nog niet bestaat.
WITH basis AS (
  SELECT COALESCE(MAX(volgorde), 0) AS max_v FROM actiepunten
), nieuw (offset_v, titel, categorie, omschrijving) AS (
  VALUES
    (10, 'Fouten verzamelen die het werken belemmeren', 'platform',
     'Per fout: welk scherm, wat geprobeerd, wat ging mis. Wordt één reparatieopdracht, gerangschikt naar wat het werken het hardst blokkeert. Dit heeft voorrang op alle andere punten.'),
    (20, 'Leesquery draaien op de VPS — klantaccounts tellen', 'platform',
     'Telt klantaccounts, gepubliceerde gebouwen en of er ooit klantactiviteit is vastgelegd. Hoort bij KLANTLOOS_01 fase 0. Uitvoeren op de VPS in /opt/fps-one/deploy via de databasecontainer. Uitkomst terugkoppelen. Nul is een antwoord.'),
    (30, 'Controleren of productie op 92072d9 draait', 'platform',
     'Versiepagina openen. Staat er iets anders, dan loopt productie achter op wat er in GitHub staat.'),
    (40, 'Controleren welke AI-sleutel productie gebruikt', 'testen',
     'Eén document laten analyseren. Werkt het niet, dan liep de AI via de proxy van Replit en moet er een eigen OpenAI-sleutel op de server komen. Het AI-verbruik hangt anders aan het account van Replit.'),
    (50, 'Drie recent gebouwde schermen nalopen', 'testen',
     'Akkoordpoort op opdrachten, de inkoopbon die uit een materiaalaanvraag ontstaat, en de prijsafspraken. Zichtbaar = niets achtergebleven in een andere omgeving.'),
    (60, 'Zes dubbele migratienummers oplossen', 'platform',
     '0007, 0010, 0013, 0014, 0032 en 0033 bestaan elk twee keer. Daardoor hangt de uitvoervolgorde af van hoe de uitvoerder sorteert. Dit is de oorzaak onder de scheefstand van 11 augustus.'),
    (70, 'Controleren of FPS_PUSH_TOKEN in GitHub staat', 'platform',
     'GitHub → Settings → Secrets → Actions. Zonder dit secret meldt de dagelijkse tokencontrole alleen in de logs in plaats van per mail.')
)
INSERT INTO actiepunten (titel, omschrijving, categorie, status, volgorde, bijgewerkt_op)
SELECT n.titel, n.omschrijving, n.categorie, 'open', basis.max_v + n.offset_v, NOW()
FROM nieuw n, basis
WHERE NOT EXISTS (SELECT 1 FROM actiepunten a WHERE a.titel = n.titel);
