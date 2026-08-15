KLANTLOOS_01 — Connect volledig klantloos maken

Uitgangspunt: Connect is de binnenlaag. Er komt geen externe gebruiker
in. Klanten wonen in het Platform. Verkeer gaat uitsluitend van binnen
naar buiten.

Deze opdracht kent vier fasen. Fase 1 mag pas beginnen als fase 0 is
opgeleverd en beoordeeld.

── FASE 0 — TELLEN, NIETS WIJZIGEN ──

Meet op PRODUCTIE en rapporteer:
1. Hoeveel gebruikers hebben de rol klant. Per stuk: aangemaakt op,
   laatst ingelogd, en aan welke gebouwen toegewezen.
2. Hoeveel gebouwen staan als gepubliceerd geregistreerd.
3. Is er ooit iets vastgelegd door een klant — een bevestigde
   rapportontvangst, een ingediende melding, een AVG-verzoek.
4. Welke ingangen zijn bereikbaar voor een ingelogde medewerker
   ZONDER de bijbehorende modulerechten. Loop daarvoor projecten,
   opname en workflow ingang voor ingang na en rapporteer per ingang
   welke rechtencontrole eraan hangt, of geen.

Een uitkomst van nul is een antwoord. Niets interpreteren, niets
wijzigen. Lever dit op en stop.

── FASE 1 — EERST DE GATEN DICHTEN ──

Breng elke ingang uit punt 4 onder de gewone rechtencontrole van zijn
module. Geen uitzonderingen, geen tijdelijke doorlaat.

Bewijs: een script dat als medewerker zonder die rechten elke
betreffende ingang aanroept en aantoont dat er 403 terugkomt, en dat
dezelfde ingang mét rechten gewoon werkt.

Pas als dit groen is verder.

── FASE 2 — DE KLANT ERUIT ──

Verwijderen:
- de rol klant en alles wat eraan hangt in de rechtenlaag
- alle middlewares die "of klant" toestaan; elke ingang die daarop
  leunde valt terug op de gewone rechtencontrole van zijn module
- de klantpoort met zijn allowlist
- de zeven One-schermen en hun navigatie-ingangen
- de klantgebonden filters in de handlers die alleen bestonden om
  klanten iets minder te tonen

NIET verwijderen:
- het klantenbestand in het CRM — dat is de klant als bedrijf en
  staat volledig los van de inlogrol
- de publicatievastlegging per gebouw; die blijft, maar betekent
  vanaf nu "klaargezet om naar buiten te gaan" in plaats van
  "zichtbaar voor de klant binnen Connect"
- het klantportaal voor offerte-ondertekening, als dat vóór de
  inlogpoort zit en dus geen ingelogde gebruiker vereist. Controleer
  dat expliciet en meld wat je vindt.

Bestaat er volgens fase 0 een klantaccount, dan wordt het niet
verwijderd maar gedeactiveerd, met vermelding in het rapport.

── FASE 3 — WATERDICHT MAKEN ──

Draai de bestaande buildcontrole om. Hij faalt voortaan wanneer:
- de rol klant ergens opnieuw wordt ingevoerd, in welke vorm dan ook
- een middleware met "of klant" terugkeert
- er een ingang bestaat zonder rechtencontrole van een module

Plus een controle die aantoont dat er geen enkele route meer bestaat
die op iets anders dan modulerechten steunt.

── OPLEVEREN ──

Per fase een apart bericht. Bij fase 0 alleen de cijfers. Bij fase 3
de uitdraai van de omgekeerde controle die faalt op een opzettelijk
teruggezette klantverwijzing, en daarna slaagt zodra die weer weg is.