---
name: Spotnummer (auto-volgnummer) ontwerp
description: Hoe voorzieningen/spots hun nummer krijgen en tonen in web + mobile.
---

## Regel
`objectnummer` is het "Spotnummer". Het wordt server-side gegenereerd als `<gebouwAfkorting>-<per-gebouw volgnummer>` (bv. `BRA-1`, `BRA-2`). Afkorting = beginletters van elk woord in gebouwnaam (max 3), anders eerste 3 letters, fallback `GEB`. Volgnummer = hoogste bestaand per-gebouw nummer + 1, met globale uniciteits-loop (objectnummer is globaal uniek in DB).

## Endpoint
`GET /gebouwen/:id/volgend-spotnummer` → `{ spotnummer }`. Clients (web inline-form, web nieuw.tsx, mobile create-form) prefetchen dit en tonen het read-only. POST `/voorzieningen` genereert zelf als `objectnummer` leeg is.

## Race-bescherming (belangrijk)
Generatie is read-then-insert buiten een transactie → twee gelijktijdige POSTs kunnen hetzelfde nummer kiezen. **De POST-insert zit daarom in een retry-loop: bij Postgres unique-violation `code === "23505"` wordt een vers spotnummer gegenereerd en opnieuw geprobeerd (max 5x), anders 409.** Prefetchte (verouderde) client-nummers worden zo transparant gecorrigeerd i.p.v. een 500.

## Marker-weergave (web SVG + mobile webview)
Spots tonen het volgnummer = laatste cijfers van objectnummer via regex `/(\d+)$/`, fallback hele objectnummer. NIET meer `type.slice(0,2)`. Web en mobile moeten dezelfde extractie gebruiken; mobile webview-JS is ES5-stijl en de spots-array moet `objectnummer` bevatten.

**Why:** gebruikers willen een uniek, leesbaar volgnummer per spot i.p.v. de 2-letter type-afkorting.
