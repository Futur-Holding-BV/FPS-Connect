---
name: Voorziening (spot) status toevoegen
description: Wat er nodig is om een nieuwe spot-status toe te voegen — additief, geen DB/backend wijziging.
---

Een nieuwe `voorzieningen.status` waarde toevoegen is **volledig additief**:

1. OpenAPI `Voorziening.status` enum uitbreiden (source of truth) → daarna `pnpm --filter @workspace/api-spec run codegen` (regenereert `VoorzieningStatus` type, zod en api-schemas).
2. Display-maps bijwerken op ALLE plekken die een spot-status renderen/aanbieden (label + kleur + optie). Web: `voorzieningen/voorziening-status-dialog.tsx` (STATUS_OPTIES), `voorzieningen/index.tsx` (STATUSLABEL), `voorzieningen/detail.tsx` (statusKleur + statusLabel), `voorzieningen/qr.tsx` (STATUSKLEUR bg/text hex), `gebouwen/plattegrond.tsx`, `gebouwen/print.tsx`, `gebouwen/gebouw-plattegrond-hero.tsx` (elk STATUSKLEUREN + STATUSLABEL). Mobiel: `monteur-app/constants/spots.ts` (STATUSKLEUREN + STATUSLABEL + STATUS_VOLGORDE — de monteur kiest via ChipRij die over STATUS_VOLGORDE mapt; PdfPlattegrond WebView injecteert STATUSKLEUREN).

**Geen** DB-migratie nodig: `voorzieningen.status` is een plain `text` kolom zonder enum/constraint.
**Geen** backend wijziging nodig: `PATCH /voorzieningen/:id/status` schrijft `req.body.status` direct weg en `mapVoorziening` doet geen zod-parse; `StatusUpdate.status` in OpenAPI is een vrije string (geen enum). De `?status=`-filter is plain string-equality.

**Why:** alle status-weergaven zijn `Record<string,string>` met veilige fallback (geen exhaustive switch op VoorzieningStatus), dus een gemiste plek crasht niet maar toont de rauwe code/grijze stip — makkelijk over het hoofd te zien.

**Let op (out of scope tenzij gevraagd):** dashboard `StatusVerdeling` en `GebouwStats` gebruiken VASTE buckets (totaal/goedgekeurd/afgekeurd/in_bewerking/voorbereid/in_onderhoud); nieuwe statussen tellen daar in geen enkele bucket mee tot je die aggregatie-logica uitbreidt.
