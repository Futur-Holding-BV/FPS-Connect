# Opdracht – Workflow Engine & Besluitvormingsmodel FPS Connect

## Doel

Bouw een centrale **Workflow Engine** voor FPS Connect.

Deze engine wordt de motor achter alle bedrijfsprocessen.

Het gaat nadrukkelijk **niet alleen om rechten**, maar om de volledige besluitvorming binnen het bedrijf.

Het systeem moet altijd weten:

* Waar bevindt het project zich?
* Welke stap is afgerond?
* Wie is nu verantwoordelijk?
* Wie moet controleren?
* Wie moet goedkeuren?
* Wie mag definitief maken?
* Wie moet automatisch een melding ontvangen?
* Welke stap blokkeert de voortgang?

De Workflow Engine moet alle modules van Connect aansturen.

---

# Filosofie

Er zijn drie verschillende onderdelen die samen het proces bepalen.

## 1. Rollen

Rollen bepalen:

**Wie mag iets doen?**

Voorbeelden:

* Bedrijfsleider
* Projectleider
* Werkvoorbereider / Calculator
* HRM
* Projectadministratie
* Financiële administratie
* Planner
* Monteur

---

## 2. Bevoegdheden

Bevoegdheden bepalen:

**Wat mag iemand doen?**

Bijvoorbeeld:

* Lezen
* Aanmaken
* Wijzigen
* Verwijderen
* Goedkeuren
* Definitief maken
* Verzenden
* Bestellen
* Factureren

Inclusief financiële limieten.

---

## 3. Workflow

Workflow bepaalt:

**Wie is NU aan zet?**

Dat is de kern van Connect.

---

# Workflow zichtbaar maken

Bij ieder project moet bovenaan altijd een workflow zichtbaar zijn.

Bijvoorbeeld:

Project aangemaakt

↓

Opname

↓

Calculatie

↓

Offerte

↓

Opdracht

↓

Werkvoorbereiding

↓

Planning

↓

Uitvoering

↓

Oplevering

↓

Facturatie

↓

Onderhoud

De huidige stap wordt duidelijk gemarkeerd.

De gebruiker ziet direct waar het project zich bevindt.

---

# Verantwoordelijke per stap

Iedere workflowstap krijgt automatisch:

* eigenaar
* verantwoordelijke
* vervanger
* deadline
* status

Voorbeeld:

Werkbegroting

Status:

Wacht op controle

Verantwoordelijke:

Projectleider

Deadline:

Morgen 16:00

---

# Persoonlijke meldingen

Iedere gebruiker krijgt een persoonlijk dashboard.

Niet met algemene meldingen.

Maar:

## Wacht op jou

Voorbeeld:

Werkbegroting Project Vink staat klaar.

Meerwerk Project Domijn wacht op akkoord.

Factuur Project Delta controleren.

Planning Project Hengelo ontbreekt.

De gebruiker ziet alleen acties waarvoor hij verantwoordelijk is.

---

# Automatische meldingen

Bij iedere overgang ontvangt de volgende verantwoordelijke automatisch een melding.

Voorbeelden:

Werkvoorbereider:

"Calculatie afgerond."

↓

Projectleider ontvangt:

"De werkbegroting van Project Vink staat klaar voor controle."

Na goedkeuring:

Bedrijfsleider ontvangt:

"Offerte wacht op definitieve vrijgave."

Na akkoord:

Projectadministratie ontvangt:

"Offerte mag worden verzonden."

Na opdracht:

Werkvoorbereider ontvangt:

"Opdracht ontvangen. Werkvoorbereiding kan worden gestart."

Na werkvoorbereiding:

Projectleider ontvangt:

"Werkvoorbereiding staat klaar voor controle."

Na controle:

Planner ontvangt:

"Project kan ingepland worden."

Na planning:

Monteur ontvangt:

"Werkbon staat klaar."

Na uitvoering:

Projectleider ontvangt:

"Werk gereed gemeld."

Na oplevering:

Projectadministratie ontvangt:

"Project gereed voor facturatie."

Na facturatie:

Financiële administratie ontvangt:

"Factuur staat klaar."

---

# Workflowstatus

Iedere stap kent vaste statussen.

Concept

↓

In behandeling

↓

Wacht op controle

↓

Goedgekeurd

↓

Definitief

↓

Uitgevoerd

↓

Afgerond

↓

Gearchiveerd

Iedere status bepaalt automatisch wie de volgende verantwoordelijke wordt.

---

# Goedkeuringen

Belangrijke onderdelen krijgen een vaste workflow.

## Calculatie

Werkvoorbereider maakt.

↓

Projectleider controleert.

↓

Bedrijfsleider keurt definitief goed.

---

## Offerte

Werkvoorbereider maakt.

↓

Projectleider controleert.

↓

Bedrijfsleider geeft vrij.

↓

Projectadministratie verzendt.

---

## Meerwerk

Monteur meldt.

↓

Werkvoorbereider calculeert.

↓

Projectleider controleert.

↓

Bedrijfsleider keurt goed indien boven limiet.

↓

Offerte naar klant.

↓

Na akkoord automatisch onderdeel van opdracht.

---

## Inkoop

Werkvoorbereider maakt bestelling.

Bij overschrijding financiële limiet:

automatisch naar projectleider.

Daarna eventueel bedrijfsleider.

---

## Facturatie

Projectadministratie maakt concept.

↓

Financiële administratie controleert.

↓

Factuur verzenden.

---

# Financiële limieten

Per rol instelbaar.

Voorbeeld:

Werkvoorbereider

Maximaal €2.500

Projectleider

Maximaal €10.000

Bedrijfsleider

Onbeperkt

Bij overschrijding wordt automatisch een goedkeuringsworkflow gestart.

---

# Dashboard

Iedere gebruiker krijgt een eigen dashboard.

Voorbeeld Projectleider:

Vandaag wachten op jou

* Werkbegroting controleren
* Offerte goedkeuren
* Meerwerk beoordelen
* Oplevering controleren

Voorbeeld Werkvoorbereider:

Vandaag

* Nieuwe opdracht voorbereiden
* Materialen bestellen
* Meerwerk calculeren

Voorbeeld Bedrijfsleider:

* Offertes boven limiet
* Grote inkopen
* Projecten met vertraging
* Open financiële goedkeuringen

---

# Projectdashboard

Op de projectkaart moet altijd zichtbaar zijn:

Projectstatus

██████████░░░░░░

✓ Opname

✓ Calculatie

✓ Offerte

✓ Opdracht

✓ Werkvoorbereiding

□ Planning

□ Uitvoering

□ Oplevering

□ Facturatie

□ Onderhoud

Daaronder:

**Wacht momenteel op:**

Projectleider

Werkbegroting controleren

Sinds:

2 dagen

Deadline:

Morgen

---

# Workflowhistorie

Iedere overgang wordt opgeslagen.

Toon:

* gebruiker
* datum
* tijd
* actie
* opmerkingen

Volledige audittrail.

---

# AI Workflowcoach

AI ondersteunt de workflow.

Voorbeelden:

"Project staat al vijf dagen stil bij de werkvoorbereiding."

"Deze offerte wacht al twaalf dagen op goedkeuring."

"De planning kan worden gestart."

"Meerwerk MW-004 is goedgekeurd maar nog niet toegevoegd aan de opdracht."

"De werkbegroting is gereed. Informeer de projectleider."

AI mag herinneringen voorstellen.

AI mag blokkades signaleren.

AI mag adviseren.

AI mag nooit zelfstandig goedkeuren of workflowstappen uitvoeren.

---

# Beheer

Maak een centrale beheerpagina:

**Workflowbeheer**

Hier kunnen per proces worden ingesteld:

* workflowstappen;
* verantwoordelijke rol;
* goedkeuringsvolgorde;
* financiële limieten;
* automatische meldingen;
* herinneringen;
* escalaties;
* uitzonderingen.

Alles zonder programmeerwerk.

---

# Eindresultaat

FPS Connect krijgt één centrale Workflow Engine die alle modules aanstuurt.

De gebruiker hoeft nooit meer na te denken:

"Wie moet hier nu iets mee doen?"

Dat is altijd zichtbaar.

Iedere medewerker ziet uitsluitend de acties waarvoor hij verantwoordelijk is.

Projecten lopen hierdoor automatisch door de organisatie zonder dat werkzaamheden blijven liggen.

De Workflow Engine wordt daarmee één van de belangrijkste onderdelen van FPS Connect en vormt samen met de Projectkaart de ruggengraat van het volledige platform.
