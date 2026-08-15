ACTIEPUNTEN — zeven punten toevoegen aan de zijrandlijst

Voeg deze actiepunten toe aan de bestaande actiepuntenlijst
(hoofdbeheerder, zijrand). Niets anders wijzigen aan die module.

1. titel: "Leesquery draaien op de VPS — klantaccounts tellen"
   categorie: platform
   omschrijving: Telt klantaccounts, gepubliceerde gebouwen en of er
   ooit klantactiviteit is vastgelegd. Hoort bij KLANTLOOS_01 fase 0.
   Uitvoeren op de VPS in /opt/fps-one/deploy via de databasecontainer.
   Uitkomst terugkoppelen. Nul is een antwoord.

2. titel: "Controleren of productie op 92072d9 draait"
   categorie: platform
   omschrijving: Versiepagina openen. Staat er iets anders, dan loopt
   productie achter op wat er in GitHub staat.

3. titel: "Controleren welke AI-sleutel productie gebruikt"
   categorie: testen
   omschrijving: Eén document laten analyseren. Werkt het niet, dan
   liep de AI via de proxy van Replit en moet er een eigen
   OpenAI-sleutel op de server komen. Het AI-verbruik hangt anders aan
   het account van Replit.

4. titel: "Drie recent gebouwde schermen nalopen"
   categorie: testen
   omschrijving: Akkoordpoort op opdrachten, de inkoopbon die uit een
   materiaalaanvraag ontstaat, en de prijsafspraken. Zichtbaar =
   niets achtergebleven in een andere omgeving.

5. titel: "Fouten verzamelen die het werken belemmeren"
   categorie: platform
   omschrijving: Per fout: welk scherm, wat geprobeerd, wat ging mis.
   Wordt één reparatieopdracht, gerangschikt naar wat het werken het
   hardst blokkeert. Dit heeft voorrang op alle andere punten.

6. titel: "Zes dubbele migratienummers oplossen"
   categorie: platform
   omschrijving: 0007, 0010, 0013, 0014, 0032 en 0033 bestaan elk
   twee keer. Daardoor hangt de uitvoervolgorde af van hoe de
   uitvoerder sorteert. Dit is de oorzaak onder de scheefstand van
   11 augustus.

7. titel: "Controleren of FPS_PUSH_TOKEN in GitHub staat"
   categorie: platform
   omschrijving: GitHub → Settings → Secrets → Actions. Zonder dit
   secret meldt de dagelijkse tokencontrole alleen in de logs in
   plaats van per mail.

Zet ze in deze volgorde, met punt 5 bovenaan.