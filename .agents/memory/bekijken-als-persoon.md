---
name: Bekijken als persoon (impersonatie)
description: Persoonsgerichte "Bekijken als" — hoofdbeheerder bekijkt portaal+data van een echt teamlid; welke endpoints de effectieve context moeten gebruiken.
---

# Bekijken als <persoon>

Hoofdbeheerder kiest een echt teamlid en ziet exact diens portaal (op basis van diens rol) én precies diens toegewezen projecten. Impersonatie beïnvloedt UITSLUITEND datafiltering.

## Backend
- `effectieveContext(req)` in `artifacts/api-server/src/utils/rol.ts` is de bron van waarheid voor datafiltering. Het levert `{userId, rol, impersonatie}`.
- Gate: alleen als echte sessie-rol === "hoofdbeheerder" ÉN header `x-gebruiker-override` = geldig ander userId dat bestaat, `actief` is en rol ≠ "viewer" → return dat teamlid. Anders eigen identiteit.
- **Permissie-gating (`requireRol`) blijft ALTIJD op de echte sessie-rol.** `effectieveContext` raakt dat niet aan.

## Regel: ALLE leesfilter-endpoints moeten effectieveContext gebruiken
**Why:** Bij de eerste ombouw kreeg alleen `GET /gebouwen` (list) + `magBijGebouw` de effectieve context. Detail/sub-resource routes (`/gebouwen/:id`, `/:id/kaart`, `/:id/verdiepingen`, `/gebouwen/partij-opties`, verdieping-voorzieningen) bleven op `req.session.userId` + lokale `gebruikerRol()` draaien → een hoofdbeheerder-in-impersonatie kon via directe URL data zien die het teamlid niet mag. Architect markeerde dit als bypass.
**How to apply:** Elke route die op `userId`/`rol` filtert (toewijzingscheck, scope) moet `const {userId, rol} = await effectieveContext(req)` gebruiken — niet alleen list-endpoints. Na conversie werd de lokale `gebruikerRol()`-helper in gebouwen.ts overbodig en verwijderd.

## Regel: UI permissie-gating volgt de EFFECTIEVE rol, niet de echte rol
**Why:** `gebouwen/detail.tsx` én `gebouwen/plattegrond.tsx` berekenden `isBeheerder`/`magBewerken` uit `useAuth().gebruiker.rol` (echte rol). Een hoofdbeheerder die "bekijken als" monteur/controleur gebruikte zag dan nog steeds beheerderknoppen (o.a. "Teamlid toevoegen") terwijl het monteurportaal getoond werd — verwarrend en lijkt op een lek.
**How to apply:** Frontend capability-gating (welke knoppen/acties tonen) moet `const { rol } = useRol()` (effectieve rol) gebruiken, zodat de preview exact klopt. Dit is veilig want de backend dwingt schrijven sowieso op de ECHTE sessie-rol af (`requireRol` + `magBijGebouw` met `echteRol`); de UI-gating is alleen voor weergave. Gebruik `useAuth().gebruiker` alleen nog voor identiteit (naam/id), niet voor rol-gating.

## Frontend
- `rol-context.tsx`: geïmiteerde persoon `{id,naam,rol,functietitels}` in localStorage (`fps.bekijkenAlsPersoon`); `rol` = `persoon.rol`. `useRol()` geeft `{rol (effectief), echteRol, kanWisselen, persoon}`.
- `custom-fetch.ts`: `setGebruikerOverrideGetter`, stuurt header `x-gebruiker-override` = id.
- `gebruiker-menu.tsx` `BekijkenAlsSelector` (alleen voor hoofdbeheerder gemount): selector van actieve teamleden + "Eigen weergave" reset. Bevat een `useEffect` die de opgeslagen persoon reconcilieert met de actuele `useListGebruikers`-data: reset bij verwijderd/inactief account, werkt rol/naam/functietitel bij als die serverzijde wijzigden (zodat getoonde portaal klopt).
