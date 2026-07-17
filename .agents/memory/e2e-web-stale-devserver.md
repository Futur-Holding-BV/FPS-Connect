---
name: E2E-web stale dev-server
description: e2e-web-runner hergebruikt bestaande firevault dev-server (isBereikbaar-check), wat stale code kan serveren na codewijzigingen
---

## Regel

`scripts/src/e2e-web-run.ts` regel ~106: als `isBereikbaar(service.healthUrl)` true geeft,
wordt de bestaande dev-server hergebruikt — er wordt GEEN nieuwe opgestart.

## Gevolg

Als de firevault workflow draaide vóór codewijzigingen, draait de e2e test tegen de oude
compilatie. Playwright YAML-snapshot verraadt stale code: zoek discrepantie tussen de
paragraph-tekst in de snapshot en de huidige broncode.

**Concreet incident:** wizard-tekst in snapshot was "hieronder" (oud enkelvoudig formulier),
broncode had "in de volgende stappen" (nieuwe 14-stappenwizard) → test 23 faalde.

## Oplossing

Voer `restart_workflow "artifacts/firevault: web"` uit VÓÓR het starten van e2e-web,
zodat de runner de bestaande server als "niet bereikbaar" beschouwt en een verse start.

**Why:** De runner stopt de server die hijzelf startte. Als de WORKFLOW de server
draaiende houdt én de runner hergebruikt die, krijg je stale compilatie zonder foutmelding.

## Hoe toepassen

Bij elke "wizard/formulier toont niet de juiste stap/inhoud" e2e-failure:
1. Stop de firevault workflow
2. Herstart e2e-web
3. Pas DAN code aan als het nog steeds faalt
