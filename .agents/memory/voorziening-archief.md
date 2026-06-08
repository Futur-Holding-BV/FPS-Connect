---
name: Voorziening archief-levenscyclus
description: Archiveren/terugplaatsen van spots en autorisatie-regels.
---

## Rolregels (server-side AFDWINGEN, niet alleen UI)
- Archiveren (`gearchiveerd=true`): toegestaan voor o.a. monteur (mobiel).
- Terug plaatsen / de-archiveren (`gearchiveerd=false`): UITSLUITEND beheerder/hoofdbeheerder.

**Why:** UI-gating verbergt alleen de knop; een ingelogde monteur kan anders direct PATCH `/voorzieningen/:id/archief` met `{gearchiveerd:false}` sturen. Architect-review markeerde dit als broken access control.

**How to apply:** In de archief-handler, bij `!gearchiveerd` eerst de rol van `req.session.userId` opzoeken en 403 geven als geen beheerder/hoofdbeheerder. De route deelt archive+restore, dus geen `requireRol` op de hele route (anders kan monteur niet archiveren) — check binnen de handler.

## Client: archief-lijst alleen voor beheerder ophalen
- Niet `useListVoorzieningen({gearchiveerd:true})` onvoorwaardelijk aanroepen — dan fetcht iedereen archiefdata.
- Plaats de hook in een child-component die alleen via `{isBeheerder && <Sectie/>}` gemonteerd wordt; zo draait de query nooit voor niet-beheerders en vermijd je de TS2741 `enabled`-quirk.

## Velden
- DB: `gearchiveerd` boolean notNull default false + `gearchiveerdOp` timestamp nullable.
- Floor-list (`/verdiepingen/:id/voorzieningen`) sluit archived UIT; `/voorzieningen` toont default alleen actieve, `gearchiveerd=true` → alleen archief.
