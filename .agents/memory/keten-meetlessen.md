---
name: KETEN_01 ketenmeting lessen
description: Duurzame lessen uit de klikkende ketenmeting proces 1–11 (tabellen, UI-gaten, meetpatronen)
---

## Openstaande app-gaten (bewust NIET gerepareerd — meetopdracht; bouwlijst in docs/metingen/KETEN_01_eindrapport.md)
- **Portaal-ondertekenen kapot**: in `portaal/index.tsx` rendert het handtekening-canvas alleen bij `actieFase==="tekenen"`; op de naam-stap is het ge-unmount → `canvasRef.current=null` → `bevestigHandtekening()` retourneert stil, POST `/portaal/:token/ondertekenen` vertrekt nooit. Klant ziet géén fout ("schijnbaar gelukt").
- Verkoopfactuur **samenstellen** ontbreekt in de UI (alleen upload); opdracht **afsluiten**-knop ontbreekt (API kent PATCH status=afgerond wel).
- Geen UI-flow voor "akkoord op alleen een calculatie → alsnog offerte".

## Tabellen/gedrag (niet gokken)
- Werkbegroting = `project_begrotingen` + `werkbegroting_regels` (er is géén tabel "werkbegrotingen").
- AI-uitvoeringsplanning op de opdrachtpagina schrijft naar `uitvoeringsplannen`/`uitvoeringsplan_taken`, NIET `planning_items` (losse planning-items = aparte Planning-module).
- Uren boeken vereist een `medewerkers`-rij gekoppeld aan de gebruiker (anders 400); akkoordpoort geeft 422 AKKOORD_ONTBREEKT.
- Opdracht zonder gekoppelde offerte = onbekend bedrag = fail-closed boven de €10k-band → akkoord vastleggen geeft 422 GOEDKEURING_VEREIST (ook grond C).
- Portaaltokens staan plain in `offerte_portaal_tokens`; seed offerte(status/portaal_status=verzonden)+token volstaat om het portaal te openen. ProposalStudio hangt op `/offertes/:id`.

## Meetpatronen (Playwright)
**Why:** één onbegrensde klik at in run 1 het hele testbudget op waardoor alle latere stappen in de nasleep "Failed query"-ruis gaven.
**How to apply:** in meetspecs altijd `page.setDefaultTimeout(8–10s)` (óók op elke `browser.newPage()`), en bij elke gemeten mutatie een `page.waitForResponse`-wachter starten vóór de klik zodat het rapport status+body bewijst i.p.v. gokt. Weiger-varianten toetsen op respons-code + DB-eindtoestand samen.
