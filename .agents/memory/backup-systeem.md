---
name: Back-up & Herstel systeem
description: Architectuur en gotcha's voor de database back-up module in FPS Brandpreventie.
---

# Back-up & Herstel systeem

## Architectuur

- **DB**: `backup_records` tabel in `lib/db/src/schema/backups.ts` (aangemaakt via directe SQL, niet drizzle push vanwege interactieve TTY-eis)
- **Service**: `artifacts/api-server/src/lib/backupService.ts`
  - `maakBackup(soort, userId)` — voert pg_dump uit, gzipped, berekent sha256-checksum, uploadt naar object storage
  - `controleerBackup(id)` — downloadt dump, verifieert gzip + SQL-header + checksum
  - `herstelBackup(id)` — download dump + psql restore (onomkeerbaar)
  - `planDagelijksBackup()` — recursieve setTimeout, plant om 03:00 elke nacht
- **Object storage**: Bestanden opgeslagen onder `backups/{slug}/db.sql.gz` en `backups/{slug}/config.json` via nieuwe methoden in `ObjectStorageService`:
  - `uploadBackupFile(slug, filename, data, contentType)`
  - `downloadBackupFile(slug, filename)` → Buffer
  - `streamBackupFile(slug, filename, downloadNaam)` → Web Response (voor download-endpoint)
  - `deleteBackupFiles(slug)` → verwijdert alle bestanden voor een back-up
- **API routes**: `artifacts/api-server/src/routes/backups.ts`
  - GET/POST `/api/backups` (systeem bevoegdheid niveau 1/2)
  - GET `/api/backups/:id/download?bestand=db|config`
  - POST `/api/backups/:id/controleer`
  - POST `/api/backups/:id/herstel` (requireRol("hoofdbeheerder") + bevestiging="HERSTEL BEVESTIGEN")
  - DELETE `/api/backups/:id` (requireRol("hoofdbeheerder"))
- **Web UI**: `artifacts/firevault/src/pages/beheer/backup.tsx` (raw fetch, geen gegenereerde hooks)
- **Nav**: Toegevoegd aan beheerder-layout.tsx onder toonSysteem guard + omgevingVanLocatie

## Dagelijkse back-up

Gepland via `planDagelijksBackup()` aangeroepen in `artifacts/api-server/src/index.ts` na server-start. Gebruikt `.unref()` op de timer zodat het proces niet opengehouden wordt.

## pg_dump patroon

- Gebruik PGPASSWORD env-var (NIET wachtwoord in command-args)
- `spawn("pg_dump", args, { env })` met `--host`, `--port`, `--username`, `--format=plain`
- Uitvoer: Buffer → gzip → sha256 → upload

## Herstel-beveiliging

- Route: requireRol("hoofdbeheerder") 
- Body: `{ bevestiging: "HERSTEL BEVESTIGEN" }` (exacte match, anders 400)
- UI: 2-staps dialoog (waarschuwing → bevestigingstekst)

**Why:** Herstel overschrijft de volledige database — geen gedeeltelijk herstel, geen undo. Dubbele drempel voorkomt accidentele trigger.

## Gotcha's

- drizzle push faalt als er interactieve bevestiging vereist is (TTY) → gebruik directe psql CREATE TABLE IF NOT EXISTS voor nieuwe tabellen
- ObjectStorageService-methoden voor back-up vallen buiten het `/objects/` pad; gebruik `PRIVATE_OBJECT_DIR + "/backups/{slug}/"` als opslагpad in GCS
- `req.session.userId` (niet `gebruikerId`) is het correcte veld in route handlers
- `parseInt(String(req.params.id), 10)` is het juiste patroon voor Express 5 (params type = `string | string[]`)
- Web UI gebruikt raw fetch (geen Orval-hooks) — gated op `toonSysteem` bevoegdheid via `useBevoegdheid`
