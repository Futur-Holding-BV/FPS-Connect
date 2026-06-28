# Fase 3 – Enterprise Workflow Engine & Disaster Recovery Platform

De basis van de Workflow Designer en de Disaster Recovery is goed. Nu wil ik deze doorontwikkelen tot een van de onderscheidende onderdelen van FPS Connect.

Belangrijk uitgangspunt:

Connect is geen verzameling losse modules.
Connect is een bedrijfsplatform waarvan de workflows bepalen hoe de software zich gedraagt.

De sidebar blijft zoals deze nu is opgebouwd.
Projecten, Calculaties, Offertes enz. blijven navigatiemodules.

De Workflow Designer wordt de configuratielaag van het complete systeem.

----------------------------------------
1. Workflow Engine uitbreiden
----------------------------------------

Per workflowstap moeten de volgende eigenschappen zichtbaar én configureerbaar worden.

Algemeen
- Naam
- Omschrijving
- Kleur
- Status
- Actief/inactief

Gebruikers
- Betrokken functies
- Hoofdverantwoordelijke
- Vervanger
- Benodigde rechten

Gebruikte modules
Bijvoorbeeld:
- Projecten
- Gebouwen
- Calculaties
- Offertes
- Planning
- Uitvoering
- Facturen
- DMS
- HRM
- Wagenpark

Gebruikte objecten
Bijvoorbeeld:
- Project
- Gebouw
- Offerte
- Calculatie
- Werkbegroting
- Factuur
- Opleverrapport
- Spot

Output
Welke objecten worden aangemaakt of gewijzigd.

AI-acties
- AI leest
- AI controleert
- AI koppelt
- AI voorspelt
- AI schrijft concept
- AI beoordeelt
- AI wacht op akkoord
- AI start vervolgactie

Beslisregels

Voorbeeld:

IF offertebedrag > €25.000
THEN directie akkoord

IF AI confidence <90%
THEN menselijke controle

IF opdrachtgever = woningcorporatie
THEN standaardcontract gebruiken

IF afwijking uitvoering
THEN projectleider akkoord verplicht

----------------------------------------
2. Workflow relaties zichtbaar maken
----------------------------------------

Per kaart tonen:

Gebruikt data uit:
← Projecten
← Gebouwen
← DMS

Maakt aan:
→ Offerte
→ Werkbegroting

Start workflows:
→ Van opdracht naar uitvoering

Beïnvloedt:
→ Planning
→ Inkoop
→ Financiële administratie
→ Dashboard
→ KPI's

Wanneer een workflow wordt aangepast moet direct zichtbaar zijn welke andere processen hierdoor geraakt worden.

----------------------------------------
3. Workflow bekijken vanuit verschillende perspectieven
----------------------------------------

Voeg filters toe.

Per functie

Bijvoorbeeld:

Calculator

Werkvoorbereider

Projectleider

Planner

Monteur

Administratie

Directie

Een gebruiker ziet uitsluitend:

- eigen taken
- overdrachten
- beslismomenten
- AI-acties

Per module

Bijvoorbeeld:

Calculaties

Planning

Facturen

Offertes

Opleverrapportage

Per object

Bijvoorbeeld:

Levenscyclus Offerte

Levenscyclus Factuur

Levenscyclus Project

Levenscyclus Opleverrapport

----------------------------------------
4. Workflow Impact Analyzer
----------------------------------------

Wanneer een beheerder een workflow wijzigt:

Connect berekent automatisch:

Welke workflows worden geraakt

Welke AI-acties veranderen

Welke formulieren veranderen

Welke rechten veranderen

Welke dashboards veranderen

Welke exports veranderen

Welke rapportages veranderen

Toon dit visueel vóór de wijziging wordt opgeslagen.

----------------------------------------
5. Workflow Templates
----------------------------------------

Maak workflows tenant-specifiek.

Een bedrijf moet eigen workflows kunnen hebben zonder broncode aan te passen.

Voorbeelden:

Brandpreventie

Bouwbedrijf

Onderhoud

Installatie

Servicebedrijf

Adviesbureau

Een template bevat:

- workflows
- functies
- rollen
- AI-acties
- beslisregels
- modules
- objectrelaties

----------------------------------------
6. Workflow Export / Import
----------------------------------------

Maak exporteerbaar:

Workflow

Rollen

AI-regels

Beslisregels

Formulieren

Objectrelaties

Rapporttemplates

Normregels

Zodat een volledige bedrijfsconfiguratie kan worden geïmporteerd in een nieuwe Connect-installatie.

----------------------------------------
7. Disaster Recovery uitbreiden
----------------------------------------

Voeg een volledige Recovery Manager toe.

Niet alleen database herstellen.

Ook:

- Workflows
- AI-configuratie
- Rollen
- Rechten
- Rapporttemplates
- Calculatienormregels
- Dashboards
- API-koppelingen
- E-mailconfiguratie
- Wagenparkconfiguratie
- DMS-instellingen

Alles moet automatisch kunnen worden teruggezet.

----------------------------------------
8. Recovery Dashboard
----------------------------------------

Maak een systeemdashboard.

Status van:

🟢 PostgreSQL

🟢 API

🟢 Frontend

🟢 AI Gateway

🟢 Azure Graph

🟢 MinIO

🟢 Back-ups

🟢 HTTPS

🟢 Docker

🟢 Caddy

🟢 Workflows

🟢 Storage

Toon waarschuwingen:

Certificaat verloopt

Back-up mislukt

Database groeit snel

Workflow bevat fouten

AI-koppeling offline

----------------------------------------
9. Recovery Readiness Score
----------------------------------------

Introduceer een score die aangeeft hoe snel een volledige omgeving opnieuw opgebouwd kan worden.

Bijvoorbeeld:

Recovery Readiness

96%

Controlepunten:

✓ Laatste back-up succesvol

✓ Laatste restore-test succesvol

✓ Alle secrets aanwezig

✓ Docker images beschikbaar

✓ Workflows compleet

✓ AI-configuratie compleet

✓ Gebruikers aanwezig

✓ Rapporttemplates aanwezig

⚠ Azure Secret verloopt over 14 dagen

⚠ Laatste restore-test ouder dan 30 dagen

----------------------------------------
10. Eén klik Restore Test
----------------------------------------

Voeg een functie toe:

'Voer Disaster Recovery Test uit'

Connect controleert automatisch:

- Installatiescript
- Docker-compose
- Secrets
- Database restore
- Workflow restore
- AI-configuratie
- API's
- Outlook Graph
- Storage
- HTTPS
- Gebruikers
- Modules
- Rapportages

Genereer daarna automatisch een rapport met:

- Geslaagd
- Mislukt
- Waarschuwingen
- Adviezen

----------------------------------------
11. Architectuur
----------------------------------------

De Workflow Engine wordt de centrale procesmotor van Connect.

De Disaster Recovery Manager wordt de centrale herstelmotor.

Samen moeten zij ervoor zorgen dat:

- Connect volledig configureerbaar is per bedrijf.
- Een nieuwe klant binnen korte tijd operationeel kan zijn met een workflowtemplate.
- Een complete omgeving na een calamiteit volledig kan worden hersteld zonder handmatige configuratie.
- De volledige bedrijfskennis (workflows, AI, regels en configuratie) net zo belangrijk wordt behandeld als de database zelf.