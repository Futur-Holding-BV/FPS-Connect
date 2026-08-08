# Meting BACKUP_01 — Herstelproef in lege omgeving

Datum: 8 augustus 2026 · Uitvoering: `herstelproef.sh` op de productie-VPS
(eigen docker-netwerk, raakt productie niet) · Set: `dagelijks/2026-08-08`.
Alle waarden hieronder zijn **GEMETEN** uit de scriptuitvoer.

## Uitkomst (letterlijke uitvoer)

```
== [0s]  lege omgeving aanmaken (netwerk + verse db + verse minio)
== [5s]  database terugzetten uit /srv/fps-backup/dagelijks/2026-08-08/db.sql.gz
== [14s] database hersteld: 6 gebruikers
== [14s] bestanden terugzetten naar verse MinIO
== [16s] objectopslag hersteld: 164 objecten
== [21s] healthz: {"status":"ok"}
== [21s] login stap 1: HTTP 200 ({"status":"setup_2fa"})
== [21s] login stap 2 (2FA-activeren): HTTP 200
== [22s] document: HTTP 200, 1537761 bytes, begint met: %PDF-
== [22s] checksum document vs back-upset: IDENTIEK
HERSTELPROEF KLAAR in 22s — set: /srv/fps-backup/dagelijks/2026-08-08 (110M)
```

## Acceptatie-eisen §8

| Eis | Bewijs |
|---|---|
| DB terug in lege omgeving | verse postgres:16-container, 6 gebruikers na restore |
| Bestanden terug in lege opslag | verse MinIO, 164 objecten (gelijk aan bron) |
| Applicatie start en werkt | healthz ok; volledige UI-login incl. 2FA (screenshot) |
| Document uit herstelde bucket opent | `Kabelgoot_door_wand.pdf` via de app, HTTP 200, sha256 **identiek** aan de set |
| Gemeten duur | **22 s** (volledig, incl. containers aanmaken) |
| Omvang eerste kopie | **110 MB** (db-dump 266 KB gz + 164 bestanden 109 MB + config/manifest) |

## Screenshotbewijs

- `bewijs/BACKUP_01_herstelproef_login.png` — inlogpagina van de herstelde app
  (via herstel-Caddy op de teruggezette web-build).
- `bewijs/BACKUP_01_herstelproef_ingelogd.png` — ingelogd als proefaccount
  "Herstelproef" op de herstelde omgeving ("Welkom bij FPS Connect,
  Herstelproef"), draaiend op uitsluitend teruggezette data.

## Reproduceren

```
ssh rene@149.210.181.47
sudo /usr/local/bin/herstelproef.sh          # ruimt zichzelf op
sudo KEEP=1 /usr/local/bin/herstelproef.sh   # laat de omgeving staan voor inspectie
```

Valkuilen die het script al afvangt (voor toekomstige aanpassers):
- postgres-init herstart de server: wacht op twee geslaagde `SELECT 1`-checks,
  niet op `pg_isready`;
- Secure-sessiecookie: over http `X-Forwarded-Proto: https` meesturen en de
  cookie handmatig uit de headers halen;
- login is altijd tweetraps (2FA-setup/verify) — curl-flow zit in het script;
- curl eindigt op de 2FA-activeren-call soms met exit 23 bij een geslaagde
  200; beoordeel de HTTP-status, niet de curl-exitcode;
- envnamen voor S3 zijn `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY`.
