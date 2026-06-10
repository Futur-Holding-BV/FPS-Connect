---
name: Tekening-type "document" en zichtbaar_monteur
description: documenten zijn intern; zichtbaarheid moet op 3 plekken gesynchroniseerd blijven
---

`tekeningen` heeft een type-veld; type `"document"` = intern PDF-rapport (geüpload onder "Overige tekeningen en documenten"). Plus boolean kolom `zichtbaarMonteur` / API-veld `zichtbaar_monteur` (NOT NULL DEFAULT false, required in OpenAPI Tekening).

**Regel — twee invarianten die op meerdere plekken tegelijk afgedwongen moeten blijven:**
1. Documenten verschijnen NOOIT in het opleverrapport → `print.tsx` filtert `t.type !== "document"` in `projectTekeningen` (enige render-pad).
2. Documenten zijn alleen zichtbaar voor niet-beheerders als `zichtbaar_monteur` aangevinkt is → server filtert in GET `/gebouwen/:id/tekeningen` voor alle rollen behalve beheerder/hoofdbeheerder (via `effectieveContext`). Mobiel `gebouw/[id].tsx` dubbel-filtert `zichtbaar_monteur===true`. POST/PATCH/DELETE staan achter `requireRol("beheerder","hoofdbeheerder")`.

**Waarom:** zichtbaarheid is list-level, geen access control — `/api/storage` heeft (nog) geen per-object ACL, dus wie de URL kent kan een document fetchen. Behandel `zichtbaar_monteur` als zichtbaarheidsfilter, niet als beveiliging.

**Let op:** dit verzoek overrulede bewust de mobiele ontwikkelstop (alleen lezen/tonen van documenten in de monteur-app).
