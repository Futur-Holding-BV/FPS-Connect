# Opdracht – AI Factuurcentrum & Automatische Factuurverwerking

## Doel

Bouw binnen FPS Connect een centraal **AI Factuurcentrum**.

Het doel is dat inkomende facturen vrijwel volledig automatisch worden verwerkt.

De financiële administratie moet niet langer bezig zijn met het zoeken naar de juiste projectleider, project, bestelling of grootboekrekening.

AI doet alle voorbereiding.

De financiële administratie controleert, corrigeert indien nodig en accordeert.

---

# Stap 1 – Automatisch ophalen

Koppel de algemene financiële mailbox.

Bijvoorbeeld:

* facturen@fps...
* administratie@fps...

Nieuwe e-mails met facturen worden automatisch geïmporteerd in Connect.

Niet alleen PDF's.

Ook:

* UBL
* XML
* Scan
* JPG
* PNG

---

# Stap 2 – AI Documentherkenning

AI leest automatisch:

* leverancier;
* factuurnummer;
* factuurdatum;
* btw;
* totaalbedrag;
* betalingsconditie;
* ordernummer;
* pakbonnummer;
* referentie;
* projectnummer;
* afleveradres;
* omschrijving.

AI bepaalt tevens:

Is dit:

* projectfactuur;
* huurfactuur;
* leasefactuur;
* verzekering;
* softwareabonnement;
* energie;
* telefoon;
* kantoor;
* gereedschap;
* algemene kosten;
* onbekend.

---

# Stap 3 – AI Controle

## Projectfacturen

AI controleert automatisch:

Bestaat de bestelling?

↓

Komt leverancier overeen?

↓

Kloppen aantallen?

↓

Kloppen prijzen?

↓

Zijn artikelen geleverd?

↓

Bestaat project?

↓

Bestaat opdracht?

↓

Komt de factuur overeen met de inkooporder?

Daarna geeft AI een oordeel.

Bijvoorbeeld:

✔ Volledig akkoord.

Of:

⚠ Twee artikelen wijken af.

---

# Stap 4 – Automatische routering

AI bepaalt wie moet controleren.

Voorbeelden:

Projectfactuur

↓

Projectleider

Verzekering

↓

Financiële administratie

Leaseauto

↓

Directie

Software

↓

ICT / Financiële administratie

Kantoor

↓

Projectadministratie

Iedere factuur komt automatisch op de juiste werkvoorraad terecht.

---

# Stap 5 – Accorderen

Gebruiker ziet:

Factuur

AI-samenvatting

Controlepunten

Bestelling

Project

Leverancier

Eventuele afwijkingen

Knoppen:

* Akkoord
* Afkeuren
* Aanpassen
* Doorsturen
* Vraag stellen

---

# Afgekeurde facturen

Wanneer een factuur wordt afgekeurd:

Gebruiker kiest reden.

Bijvoorbeeld:

* verkeerde prijs;
* verkeerde aantallen;
* levering ontbreekt;
* verkeerde leverancier;
* dubbele factuur;
* onbekende kosten;
* project klopt niet.

AI maakt automatisch een nette conceptmail.

Voorbeeld:

"Wij kunnen deze factuur momenteel niet verwerken omdat de gefactureerde aantallen afwijken van de bestelling. Graag ontvangen wij een aangepaste factuur of een toelichting."

De gebruiker controleert de tekst.

Na akkoord verstuurt Connect de e-mail.

De volledige correspondentie wordt gekoppeld aan de factuur.

---

# Terugkerende facturen

AI leert leveranciers herkennen.

Bijvoorbeeld:

Centraal Beheer

↓

Autoverzekering

Microsoft

↓

Microsoft 365

KPN

↓

Telefonie

Rabobank

↓

Lease

SAA

↓

Verzekering

Deze facturen worden automatisch onder de juiste categorie geplaatst.

---

# Contractcontrole

Wanneer een factuur gekoppeld is aan een contract controleert AI:

* klopt de afgesproken prijs;
* indexering correct;
* looptijd;
* opzegtermijn;
* afwijkingen;
* extra kosten;
* dubbele facturatie.

---

# AI Herkent Besparingen

Voorbeelden:

"Autoverzekering is dit jaar 14% duurder."

"Microsoft factureert 28 licenties terwijl slechts 21 actief zijn."

"Softwarecontract loopt automatisch door."

"Leasecontract loopt over drie maanden af."

"Er worden twee vergelijkbare abonnementen betaald."

---

# Financiële werkvoorraad

Maak een dashboard:

## Nieuwe facturen

Nog te beoordelen.

## Wacht op projectleider

## Wacht op financiële administratie

## Afgekeurd

## Teruggestuurd

## Gereed voor AccountView

Iedere factuur heeft een duidelijke status.

---

# Synchronisatie AccountView

Na definitieve goedkeuring:

Connect stuurt naar AccountView:

* leverancier;
* grootboek;
* kostenplaats;
* kostendrager;
* project;
* btw;
* bedrag;
* document.

AccountView blijft leidend voor de boekhouding.

---

# AI leert continu

Iedere correctie wordt gebruikt om AI slimmer te maken.

Wanneer een gebruiker een leverancier drie keer aan hetzelfde grootboek koppelt, stelt AI dit voortaan automatisch voor.

Wanneer een projectleider een bepaalde leverancier altijd aan projectkosten koppelt, leert AI dit patroon.

---

# Dashboard Directie

Nieuwe tegel:

**Factuuranalyse**

Toon:

* nieuwe facturen;
* afgekeurde facturen;
* afwijkingen;
* prijsstijgingen;
* dubbele facturen;
* openstaande goedkeuringen;
* mogelijke besparingen;
* contractafwijkingen.

---

# Eindresultaat

Het verwerken van inkomende facturen wordt een kort controleproces in plaats van een administratief zoekproces.

AI leest, begrijpt, controleert, koppelt en routeert iedere factuur automatisch.

De financiële administratie hoeft voornamelijk nog:

* de AI-voorstellen te controleren;
* uitzonderingen te beoordelen;
* facturen goed te keuren;
* afgekeurde facturen met één klik terug te sturen.

Hierdoor ontstaat een snelle, uniforme en schaalbare factuurverwerking die volledig geïntegreerd is met projecten, inkoop, contracten en AccountView.
