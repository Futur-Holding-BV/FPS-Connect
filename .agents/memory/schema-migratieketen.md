---
name: Schemawijzigingen via genummerde migraties (SCHEMA_01)
description: Hoe DB-schemawijzigingen sinds 7 aug 2026 moeten — migratierunner, drift-check, apply-additive bevroren.
---

**Regel:** elke schemawijziging = nieuw genummerd bestand `lib/db/migrations/NNNN_*.sql` (opvolgend), nooit meer via `apply-additive.mjs` (bevroren als legacy) of drizzle-kit push (uit deploy verwijderd).

**Why:** prod en dev dreven uiteen doordat losse .sql-bestanden nooit op prod draaiden; de migratierunner (`lib/db/scripts/migrate.mjs`, `pnpm --filter @workspace/db run migrate`) registreert alles in `schema_migraties` (checksum, idempotent) en de deploy voert hem automatisch uit.

**How to apply:**
1. Nieuwe migratie schrijven → op dev draaien via `pnpm --filter @workspace/db run migrate`.
2. `lib/db/scripts/schema-drift-check.mjs --update` draaien zodat `schema-verwachting.txt` meegroeit; drift-check draait ook in deploy (stap 6b, niet-fataal tenzij `SCHEMA_DRIFT_FATAAL=1`).
3. `lib/db/schema.sql` is het prod-nulpunt van 7 aug 2026 — niet handmatig bijwerken.
4. Bekende restdrift dev↔prod: 13 timestamp-kolommen `with/without time zone` + 1 default-verschil; aparte opdracht.
