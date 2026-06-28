Bouw in FPS Connect een nieuwe module “Wagenpark” met een Traxgo-koppeling. De module moet primair bedoeld zijn voor wagenparkbeheer, onderhoud, APK/keuringen, kilometerstanden, rittenadministratie, kostenbeheer en beschikbaarheid van bedrijfsbussen. De module mag niet worden ingericht als personeelscontrole- of GPS-volgsysteem voor medewerkers.

Belangrijke ontwerpregel:
Traxgo-data wordt voertuiggericht gebruikt, niet persoonsgericht. Toon data primair per voertuig. Bouw geen medewerker-GPS-tijdlijn, geen gedragsscores, geen automatische werktijdcontrole en geen meldingen zoals “medewerker is te laat”, “medewerker staat stil” of “medewerker rijdt om”.

Maak binnen FPS Connect de module “Wagenpark” met per voertuig minimaal deze velden:

* kenteken
* merk/type
* bouwjaar
* huidige kilometerstand
* APK-datum
* onderhoudsinterval in kilometers en/of datum
* bandenwisselstatus
* verzekeringsgegevens
* lease/eigendom
* gekoppelde Traxgo voertuig-ID
* vaste of tijdelijke chauffeur/gebruiker
* gekoppelde gereedschappen en voorraad in de bus
* schade- en onderhoudsmeldingen
* kostenhistorie

Bouw de Traxgo-koppeling via een aparte integratielaag:

* maak een provider-adapter voor Traxgo
* plaats geen Traxgo-specifieke logica in de bedrijfslogica
* ontwerp de laag zo dat later ook Webfleet, Geotab, FleetComplete of andere aanbieders kunnen worden toegevoegd
* API keys en secrets uitsluitend via environment variables
* log elke synchronisatie: datum/tijd, status, aantal records, fouten en bron
* voorkom dubbele imports
* voeg foutafhandeling en retry-logica toe

Importeer uit Traxgo alleen voertuiggerichte data:

* kilometerstand
* ritten op voertuigniveau
* laatst bekende voertuiglocatie
* draaiuren indien beschikbaar
* brandstof- of laadgegevens indien beschikbaar
* foutmeldingen/diagnosecodes indien beschikbaar

Gebruik deze data voor:

* automatisch onderhoudsadvies
* melding “onderhoud binnenkort nodig”
* melding “APK verloopt binnenkort”
* signalering hoge kilometeropbouw
* signalering langdurige stilstand van een voertuig
* overzicht kosten per voertuig
* rittenadministratie per voertuig
* planning welk voertuig beschikbaar is
* koppeling van voertuigkosten aan projecten wanneer administratief logisch

Privacy-by-design is verplicht:

* standaard geen persoonsgerichte GPS-tijdlijn tonen
* geen prestatie- of gedragsscore per medewerker
* geen automatische werktijdcontrole op basis van GPS
* geen live personeelscontrole
* beperk actuele locatie tot planners en beheerders
* maak bewaartermijnen instelbaar
* maak een exporteerbaar AVG-logboek met: welke voertuigdata wordt opgeslagen, waarom, hoe lang, wie toegang heeft en welke rol deze data mag bekijken
* toon in de module duidelijk deze privacytekst:

“Deze module gebruikt voertuigdata voor wagenparkbeheer, onderhoud, veiligheid, planning en administratie. De data is niet bedoeld voor continue personeelscontrole of beoordeling van individuele medewerkers.”

Maak rollen en rechten:

* Hoofdbeheerder: volledige toegang
* Wagenparkbeheerder: voertuigen, onderhoud, ritten, kosten en schade
* Planner: voertuigbeschikbaarheid en actuele voertuiglocatie
* Projectleider: alleen gekoppelde ritten/kosten op projectniveau
* Monteur: eigen toegewezen voertuig, onderhoudsmeldingen en schade melden
* Klant: geen toegang

Voeg AI-ondersteuning toe, maar uitsluitend voertuiggericht:

* AI voorspelt onderhoud op basis van kilometerstand, interval en gebruik
* AI signaleert afwijkende kosten per voertuig
* AI stelt voor welk voertuig onderhoud nodig heeft
* AI maakt concepttaken voor onderhoud, APK en bandenwissel
* AI koppelt voertuigkosten aan projecten als dat administratief logisch is
* AI mag geen medewerkerprestaties beoordelen op basis van GPS-data

Maak dashboards:

* wagenparkoverzicht
* onderhoudskalender
* APK/keuringen
* voertuigen met aandacht nodig
* kosten per voertuig
* ritten per voertuig
* beschikbaarheid voertuigen
* open schade- en onderhoudsmeldingen
* Traxgo synchronisatiestatus

Resultaat:
FPS Connect krijgt een schaalbare, AVG-bewuste wagenparkmodule met Traxgo-koppeling. De module is gericht op onderhoud, beheer, kosten, veiligheid, planning en beschikbaarheid van voertuigen. De module mag expliciet niet worden gebouwd als personeelsvolgsysteem.
