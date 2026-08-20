# Replit opdracht – Visuele Workflow Designer voor FPS Connect

Bouw in FPS Connect een vaste module in de sidebar: **Workflow Designer**.

Doel:
FPS Connect moet een visueel, bewerkbaar workflow-overzicht krijgen waarin zichtbaar is hoe werkprocessen door de verschillende afdelingen lopen, waar beslissingen worden genomen en wanneer een afdeling het proces overneemt.

Dit mag geen statisch schema zijn. Het moet direct interactief en bewerkbaar zijn.

## Plaatsing

Voeg in de sidebar een nieuwe hoofdmodule toe:

**Organisatie**

* Workflow Designer

Of plaats deze onder **Connect Beheer** als dat logischer is.

## Basiswerking

De Workflow Designer toont bedrijfsprocessen als visuele flow met afdelingen als kolommen/swimlanes.

Voorbeelden van afdelingen:

* Commercie
* Calculatie
* Werkvoorbereiding
* Projectleiding
* Planning
* Uitvoering
* Controle / oplevering
* Financiële administratie
* Directie

Elke afdeling heeft een eigen kolom.

Binnen die kolommen staan proceskaarten.

Voorbeelden van proceskaarten:

* Aanvraag beoordelen
* Calculatie maken
* Offerte versturen
* Opdracht verwerken
* Werkbegroting maken
* Materiaalbehoefte bepalen
* Inkoopplanning maken
* Inkoopbon controleren
* Bestelling versturen
* Orderbevestiging controleren
* Factuur beoordelen
* Projectleider akkoord
* Factuur klaarzetten voor betaling
* Opleverrapport maken
* Rapport naar klant versturen

## Slepen en aanpassen

Proceskaarten moeten met drag-and-drop verplaatst kunnen worden:

* binnen dezelfde afdeling;
* naar een andere afdeling;
* hoger/lager in de workflow;
* vóór of na een beslismoment.

Wanneer een kaart wordt versleept, moet de workflowvolgorde worden opgeslagen.

Voorbeeld:
De kaart **“Factuur beoordelen”** staat bij Projectleiding, maar blijkt eigenlijk eerst bij Financiële administratie te horen. De gebruiker moet deze kaart kunnen verslepen naar de juiste afdeling en positie.

## Beslismomenten

Voeg besliskaarten toe.

Voorbeelden:

* Akkoord?
* Factuur klopt met inkoopbon?
* Materiaal op tijd leverbaar?
* Offerte geaccepteerd?
* Projectleider akkoord?
* Afwijking gevonden?
* Klant akkoord?

Een besliskaart heeft minimaal twee uitgangen:

* Ja
* Nee

Bij “Nee” moet een alternatieve route zichtbaar zijn, bijvoorbeeld:

* terug naar werkvoorbereiding;
* vraag om correctie;
* afwijking melden;
* handmatige controle nodig;
* directie akkoord nodig.

## Workflowtypes

Maak direct minimaal deze workflows volledig zichtbaar en bewerkbaar:

1. Van aanvraag naar offerte
2. Van opdracht naar uitvoering
3. Van calculatie naar werkbegroting
4. Van werkbegroting naar inkoop
5. Van inkomende factuur naar betaling
6. Van uitvoering naar opleverrapport
7. Van melding naar herstelactie
8. Van e-mail naar actievoorstel

## AI meenemen in de workflow

Elke proceskaart moet kunnen aangeven of AI een rol heeft.

Gebruik bijvoorbeeld labels:

* AI leest
* AI controleert
* AI koppelt
* AI stelt voor
* AI maakt concept
* AI wacht op akkoord
* Mens akkoord nodig
* Automatisch na akkoord

Voorbeeld bij inkomende factuur:

1. Mail komt binnen bij factuur@
2. AI herkent factuur
3. AI koppelt aan project
4. AI vergelijkt met inkoopbon
5. Beslissing: klopt de factuur?
6. Financiële administratie beoordeelt
7. Projectleider akkoord
8. Na akkoord: factuur klaarzetten voor betaling
9. Mail markeren als afgehandeld

## Kaart bewerken

Elke proceskaart moet aanklikbaar zijn en een edit-paneel openen.

In dat paneel kan de gebruiker aanpassen:

* titel;
* afdeling/eigenaar;
* beschrijving;
* invoer/input;
* output;
* verantwoordelijke rol;
* AI-taak;
* verplicht akkoord door;
* volgende stap;
* uitzonderingsroute;
* gekoppelde module;
* status actief/inactief.

## Realistische voorbeelddata

Gebruik geen lege workflow.

Vul de workflows direct met realistische FPS-processen.

Minimaal één workflow moet volledig diepgaand zijn uitgewerkt:

**Inkomende factuur → AI-controle → akkoord → verwerking**

Inclusief:

* factuurmail;
* projectkoppeling;
* inkoopbon;
* controle door AI;
* akkoord financiële administratie;
* akkoord projectleider;
* status afgehandeld;
* vervolgactie.

## Done looks like

Deze opdracht is pas klaar wanneer:

* de Workflow Designer zichtbaar is in de sidebar;
* afdelingen als visuele kolommen/swimlanes zichtbaar zijn;
* proceskaarten realistische inhoud hebben;
* kaarten versleept kunnen worden;
* beslismomenten zichtbaar zijn;
* kaarten bewerkt kunnen worden;
* AI-rollen per stap zichtbaar zijn;
* wijzigingen worden opgeslagen;
* minimaal de factuurworkflow volledig uitgewerkt en testbaar is.

Niet opleveren als alleen een statisch schema of lege kaarten zijn gebouwd.
