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
4. Restdrift dev↔prod is per 7 aug 2026 volledig opgelost (migratie 0007); drift-check draait schoon op dev én prod. Documentatie over "bekende drift" van vóór die datum is stale — altijd live verifiëren (prod-schemadump diffen tegen schema-verwachting.txt) vóór je een drift-fix bouwt.
5. Handmatig een migratie op prod toepassen kan veilig door het runner-patroon na te bootsen: SQL + INSERT in schema_migraties (naam + sha256-checksum van het repo-bestand) in één transactie; de deploy-runner slaat 'm daarna over.

- Post-merge (2026-08-10): scripts/post-merge.sh draait nu migrate + drift-check i.p.v. apply-additive/reconcile/push-force; drizzle push in non-TTY liep vast op interactieve prompt (incident: opnames_nummer_unique ontbrak in DB terwijl schema .unique() had → migratie 0045). Drift na merge = taak-agent leverde schemawijziging zonder genummerde migratie; agent vult 'm aan.

## Verweesde prod-registraties (STOP "database loopt vóór op de code")
Tijdelijk gedeployde en daarna hernoemde/verwijderde migratiebestanden laten rijen achter in prod-`schema_migraties` → migrate.mjs STOPt elke deploy. Herstel zonder SSH: gerichte reconciliatie-stap in migrate.mjs (expliciete namenlijst `VERWEESD`, DELETE vóór de pre-check) — alleen voor namen waarvan het netto schema-effect aantoonbaar nul is; al het overige onbekende blijft harde STOP. Les: nooit een al gedeployde migratie hernoemen; incident 15 aug 2026 (materiaal01-fase3 0043/0048).

## CI-bewaker (check-hernoeming)
`lib/db/scripts/check-migratie-hernoeming.mjs` detecteert hernoemde/verwijderde migraties t.o.v. origin/main via `git diff --diff-filter=DR`. Faalt met exit 1 + expliciete SCHEMA_01-foutmelding. Script ook bereikbaar als `pnpm --filter @workspace/db run check-hernoeming` en Replit-validatiestap `migratie-hernoeming`. Volledig herstelpad staat in `docs/schema-migratieketen.md`.

## Nummerbotsing na parallelle merges (0083, 18 aug 2026)
Twee taken introduceren onafhankelijk hetzelfde migratienummer → check-hernoeming/CI-poort blokkeert álle deploys. Herstel: het NIEUWE (nog niet op prod gedraaide) bestand hernummeren naar het eerstvolgende vrije nummer, en in migrate.mjs een gerichte `HERNUMMERD`-reconciliatie (exact paar, alleen bij identieke checksum, vóór de pre-check) zodat dev/CI-databases met de oude registratienaam meebewegen. Alleen de dev-DB updaten is niet genoeg (architect-afwijzing): elke andere DB met de oude rij zou hard STOPpen.
