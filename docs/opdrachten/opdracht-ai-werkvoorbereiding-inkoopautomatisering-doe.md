# Opdracht – AI Werkvoorbereiding & Inkoopautomatisering

## Doel

Wanneer een offerte wordt omgezet naar een opdracht moet FPS Connect automatisch de volledige werkvoorbereiding opstarten.

Niet door alles automatisch uit te voeren, maar door AI alle voorbereidende werkzaamheden te laten uitvoeren.

De projectleider blijft verantwoordelijk voor de uiteindelijke keuzes en goedkeuringen.

---

# Nieuwe projectworkflow

Wanneer de offerte de status **Opdracht** krijgt, start automatisch de volgende workflow.

Offerte

↓

Opdracht

↓

AI maakt werkbegroting

↓

Projectleider controleert

↓

Projectleider geeft akkoord

↓

Planning

↓

AI maakt inkoopvoorstel

↓

Projectleider controleert

↓

Projectleider geeft akkoord

↓

AI verstuurt bestellingen

↓

Leveringen bewaken

↓

Uitvoering

---

# Stap 1 – Werkbegroting

Na opdracht maakt AI automatisch een werkbegroting.

AI gebruikt hiervoor:

* calculatie;
* gekozen producten;
* arbeid;
* onderaanneming;
* materieel;
* meerwerk;
* projectinformatie.

Werkbegroting bevat onder andere:

* arbeid per fase;
* materiaaloverzicht;
* materieellijst;
* onderaanneming;
* verwachte kosten;
* projectmarge;
* open aandachtspunten.

Status:

**Wacht op controle projectleider**

---

# Stap 2 – Controle projectleider

Projectleider controleert:

* werkbegroting;
* planning;
* risico's;
* materiaal;
* onderaanneming.

Mogelijkheden:

* Goedkeuren
* Terug naar werkvoorbereiding
* Aanpassen
* Opmerkingen toevoegen

Na akkoord start automatisch de volgende stap.

---

# Stap 3 – Planning

Planning blijft bewust handmatig.

Projectleider bepaalt:

* startdatum;
* werkdagen;
* werktijden;
* toegewezen medewerkers;
* fasering;
* oplevermomenten.

AI doet eventueel voorstellen, maar plant nooit zelfstandig personeel in.

---

# Stap 4 – AI Inkoopvoorstel

Na goedkeuring van de planning maakt AI automatisch een volledig inkoopvoorstel.

Per artikel wordt bepaald:

* leverancier;
* hoeveelheid;
* gewenste leverdatum;
* project;
* afleveradres;
* fase waarin materiaal nodig is.

---

# Artikelbron

Tijdens de calculatiefase moet per artikel worden vastgelegd waar de prijs vandaan komt.

Keuzes:

## Jaarprijslijst

Artikel is afkomstig uit een actuele prijslijst.

Opslaan:

* leverancier;
* artikelnummer;
* prijs;
* kortingsafspraken;
* geldigheidsdatum.

## Offerte leverancier

Artikel is gebaseerd op een ontvangen offerte.

Opslaan:

* leverancier;
* offertedatum;
* offertestatus;
* geldigheidsduur;
* offertebestand;
* afgesproken prijs;
* contactpersoon leverancier.

## Vrije prijs

Eenmalige prijs.

AI weet dat hiervoor mogelijk opnieuw een prijs moet worden opgevraagd.

---

# AI bepaalt bestelwijze

Wanneer AI de inkoop voorbereidt controleert hij:

Komt artikel uit jaarprijslijst?

↓

Gebruik prijslijst.

Of:

Komt artikel uit leverancierofferte?

↓

Gebruik offerte.

Controleer of deze nog geldig is.

Wanneer verlopen:

AI waarschuwt:

"Leveranciersofferte verlopen. Nieuwe prijs aanvragen."

---

# Leverplanning

AI maakt automatisch een leverplanning.

Bijvoorbeeld:

Week 31

Brandwerende deuren

Bestellen uiterlijk:

5 juli

Leveren:

14 juli

Week 32

Doorvoeringen

Bestellen:

10 juli

Leveren:

18 juli

Week 34

Beglazing

Bestellen:

25 juli

Leveren:

6 augustus

De planning sluit aan op de projectplanning.

---

# Controle projectleider

Projectleider krijgt een overzicht.

Per leverancier:

* artikelen;
* aantallen;
* prijzen;
* afleverdatum;
* project;
* totaalbedrag.

Mogelijkheden:

* Goedkeuren
* Aanpassen
* Leverancier wijzigen
* Bestelling uitstellen
* Niet bestellen

---

# Automatisch bestellen

Pas na goedkeuring van de projectleider mogen bestellingen automatisch worden verzonden.

Verzenden kan via:

* e-mail;
* leverancierportaal;
* API-koppeling (indien beschikbaar).

Alle verzonden bestellingen worden opgeslagen in het projectdossier.

---

# Leverbewaking

Na verzending bewaakt AI:

* orderbevestiging ontvangen;
* levertijd;
* gewijzigde levertijd;
* deelleveringen;
* ontbrekende artikelen.

Bij afwijkingen ontvangt de projectleider een melding.

Voorbeeld:

"Leverancier verwacht levering drie dagen later dan gepland. Dit kan invloed hebben op de start van fase 2."

---

# Inkoopdashboard

Toon per project:

Nog te bestellen

Besteld

Bevestigd

Onderweg

Geleverd

Achterstallig

Open prijsaanvragen

Verlopen offertes

---

# AI Inkoopcoach

AI analyseert voortdurend de inkoop.

Voorbeelden:

* Dit product is goedkoper verkrijgbaar bij leverancier B.
* Deze leverancier levert gemiddeld twee dagen sneller.
* De offerte van leverancier X verloopt over vijf dagen.
* Voor dit project ontbreken nog drie bestellingen.
* Door twee bestellingen samen te voegen kan op transport worden bespaard.
* De benodigde materialen voor week 34 zijn nog niet besteld.

AI doet uitsluitend voorstellen.

De projectleider beslist.

---

# Koppeling met financieel systeem

Na ontvangst van de factuur herkent AI automatisch:

* leverancier;
* bestelling;
* project;
* artikelen;
* bedragen.

AI koppelt de factuur aan:

* project;
* bestelling;
* leverancier;
* grootboek;
* kostensoort.

De financiële administratie controleert alleen nog het voorstel voordat de gegevens naar AccountView worden gesynchroniseerd.

---

# Eindresultaat

Wanneer een opdracht wordt aangenomen hoeft de werkvoorbereider niet opnieuw alle gegevens handmatig op te bouwen.

AI gebruikt de calculatie als basis en stelt automatisch een complete werkbegroting, inkoopplanning en bestelvoorstellen op.

De projectleider houdt de volledige regie en geeft op de beslismomenten akkoord.

Hierdoor wordt de administratieve belasting sterk verminderd, terwijl de controle over planning, inkoop en financiën volledig behouden blijft.
