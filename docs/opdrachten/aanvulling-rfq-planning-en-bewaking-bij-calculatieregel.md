AANVULLING — RFQ-planning en bewaking bij calculatieregels

Doel:
Connect moet leveranciersoffertes per calculatieregel kunnen aanvragen, plannen en bewaken, zodat prijsaanvragen niet meer via losse Outlook-mails, handmatige lijstjes en losse prijsinvoer verlopen.

Scope:
Alleen offerteaanvragen aan leveranciers vanuit calculatie- en werkbegrotingsregels.
Geen algemene projectplanning wijzigen.
Geen bestellingen plaatsen.
Geen leveranciers automatisch kiezen zonder akkoord van gebruiker.

1. RFQ aanmaken vanuit calculatieregel

Bij iedere calculatieregel moet de gebruiker kunnen kiezen:

- Offerte aanvragen
- Leverancier(s) selecteren
- Gewenste reactiedatum invullen
- Uiterste beslisdatum invullen
- Gewenste leverdatum invullen
- Bijlagen toevoegen
- Extra toelichting toevoegen

Connect maakt daarna een RFQ-dossier gekoppeld aan:

- calculatie
- calculatie-eenheid
- hoofdstuk
- calculatieregel
- project/gebouw
- leverancier(s)
- verzonden e-mails
- ontvangen offertes
- gekozen offerte
- interne status

2. AI ondersteunt de aanvraag

AI stelt automatisch een conceptaanvraag op op basis van:

- omschrijving calculatieregel
- hoeveelheid
- eenheid
- projectlocatie
- beschikbare tekeningen/documenten
- gewenste leverdatum
- eventuele technische eisen
- certificaten/ETA/DoP/brandclassificatie indien relevant

De gebruiker moet de aanvraag altijd kunnen controleren en aanpassen vóór verzending.

3. Planning en bewaking

Per RFQ moet Connect bewaken:

- datum aanvraag verzonden
- gewenste reactiedatum
- uiterste beslisdatum
- gewenste leverdatum
- status offerte ontvangen ja/nee
- status intern verwerkt ja/nee
- risico op vertraging ja/nee

AI moet signaleren:

- leverancier heeft nog niet gereageerd
- reactiedatum nadert
- reactiedatum is overschreden
- offerte is ontvangen maar nog niet verwerkt
- offerte is verwerkt maar nog niet gekozen
- gewenste leverdatum komt in gevaar
- prijs ontbreekt nog in calculatie/werkbegroting

4. Interne taken

Bij ontbrekende of late offertes moet Connect automatisch interne acties klaarzetten voor de verantwoordelijke gebruiker:

- leverancier nabellen
- herinneringsmail sturen
- alternatief leverancier zoeken
- offerte beoordelen
- prijs verwerken in calculatie
- levertijd verwerken in inkoopplanning

Deze acties mogen niet verdwijnen in een algemene takenlijst, maar moeten zichtbaar blijven bij:

- de calculatieregel
- het RFQ-dossier
- het calculatie-/werkbegrotingsoverzicht
- de werkinbox

5. Leveranciercommunicatie

Bij het verzenden van de aanvraag moet voor de leverancier duidelijk zijn:

- projectnaam
- omschrijving aanvraag
- gevraagde prijs
- gevraagde levertijd
- uiterste reactiedatum
- bijlagen
- contactpersoon FPS
- hoe de offerte moet worden aangeleverd

AI mag herinneringsmails voorstellen, maar niet automatisch versturen zonder gebruikersinstemming.

6. Offerte ontvangen en verwerken

Wanneer een offerte binnenkomt via mail of upload, moet AI herkennen bij welke RFQ deze hoort.

AI stelt voor:

- offerte koppelen aan bestaande RFQ
- prijs overnemen
- levertijd overnemen
- voorwaarden samenvatten
- afwijkingen signaleren
- certificaten/documenten koppelen
- offerte markeren als ontvangen

De gebruiker moet alle overgenomen waarden controleren en bevestigen.

7. Vergelijking meerdere leveranciers

Als meerdere leveranciers reageren, moet Connect een vergelijking tonen met minimaal:

- leverancier
- prijs
- levertijd
- geldigheid offerte
- opmerkingen/voorwaarden
- ontbrekende gegevens
- risico-indicatie
- AI-samenvatting

AI mag een voorkeursadvies geven, maar de gebruiker kiest definitief.

8. Statussen

Gebruik minimaal deze RFQ-statussen:

- Concept
- Verzonden
- Wacht op leverancier
- Herinnering nodig
- Offerte ontvangen
- Intern te verwerken
- Verwerkt
- Gekozen
- Afgewezen
- Vervallen

9. Acceptatiecriteria

De functie is akkoord wanneer:

- een RFQ vanuit één calculatieregel kan worden aangemaakt
- leverancieraanvraag als conceptmail wordt opgesteld
- verzonden aanvraag gekoppeld blijft aan de calculatieregel
- reactiedatum en leverdatum worden bewaakt
- ontbrekende offertes zichtbaar worden gesignaleerd
- ontvangen offerte aan RFQ gekoppeld kan worden
- prijs en levertijd na bevestiging in calculatie/werkbegroting worden verwerkt
- meerdere offertes vergelijkbaar zijn
- gebruiker altijd eindcontrole houdt
- er geen bestellingen worden geplaatst

Belangrijk:
Deze functie is geen algemene planningsmodule. Het is RFQ-bewaking per calculatieregel, met koppeling naar calculatie, werkbegroting, mail, documenten en inkoopvoorbereiding.