---
name: Uitzendbureau CRM-koppeling (FACTUUR_01)
description: FK-patroon uitzendbureau_id, migratieregels en deploy-pad voor additieve kolommen
---
- `gebruikers.uitzendbureau_id` en `medewerkers.uitzendbureau_id` (FK crm_klanten, set null) zijn bron van waarheid; `bedrijf_uitzendbureau` (tekst) blijft als naam-cache — NIET verwijderen zonder aparte opdracht.
- Org-types uitgebreid met `uitzendbureau`/`inlener`; koppelen flipt type alleen vanaf leverancier/overig/null; andere typen worden server-side geweigerd (400).
- Migratie (`scripts/src/migreer-uitzendbureau-koppelingen.ts`): alleen exact-één naam-match koppelen, hercheck kardinaliteit BINNEN de transactie (race met gelijktijdig aangemaakte naamgenoot); rest → beheerpagina Personeel → Uitzendbureau-koppelingen.
- **Deploy-les:** een los .sql-bestand in lib/db/sql/ draait nergens automatisch; additieve kolommen/FK's moeten in `lib/db/scripts/apply-additive.mjs` (draait in Dockerfile.migrate vóór drizzle push).
- gebruikers-schema heeft de FK bewust ZONDER `.references()` (importcyclus crm↔gebruikers); FK bestaat op DB-niveau via apply-additive.
