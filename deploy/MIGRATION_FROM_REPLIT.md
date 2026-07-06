# FPS Connect — Migratie vanuit Replit naar eigen server

## Overzicht

Deze procedure beschrijft hoe de huidige Replit-omgeving (development + productie-deployment op `fire-asset-management.replit.app`) wordt gemigreerd naar een eigen productieserver.

**Replit blijft de development- en build-omgeving.** Alleen de productie-runtime verhuist.

---

## Wat er gemigreerd wordt

| Component | Bron (Replit) | Doel (eigen server) |
|---|---|---|
| Code | Replit Git-repo | Git clone op eigen server |
| Database | Replit Helium PostgreSQL | Eigen PostgreSQL 16 |
| Object Storage | Replit Object Storage (bucket) | S3/MinIO of GCS |
| Secrets | Replit Secrets (global) | `.env.production` (server-only) |
| Domein | `fire-asset-management.replit.app` | `fpsbrandpreventie.nl` (eigen) |

---

## Stap 1 — Database exporteren vanuit Replit

Open een Replit Shell en voer uit:

```bash
pg_dump "$DATABASE_URL" --no-owner --no-acl -Fc -f /tmp/fps_replit_export.dump
```

Download het bestand via de Replit-bestandsverkenner of:

```bash
# Via een tijdelijke HTTPS-endpoint als het bestand groot is:
python3 -m http.server 8888 &
curl -O https://$REPLIT_DEV_DOMAIN/tmp/fps_replit_export.dump
```

Controleer de dump:
```bash
pg_restore --list /tmp/fps_replit_export.dump | head -30
```

### Controle op testdata vóór export

Voer in Replit Shell uit:
```bash
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM gebruikers WHERE email LIKE '%test%' OR email LIKE '%demo%';"
psql "$DATABASE_URL" -c "SELECT naam, email, rol FROM gebruikers ORDER BY aangemaakt_op;"
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM gebouwen;"
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM activiteiten;"
```

Verwijder testdata expliciet vóór export als die aanwezig is.

---

## Stap 2 — Object Storage exporteren vanuit Replit

```bash
# Installeer rclone als dat nog niet aanwezig is
curl https://rclone.org/install.sh | sudo bash

# Configureer rclone voor Replit Object Storage
# (gebruik de Replit S3-compatibele credentials uit de Replit Secrets-pagina)
rclone config create replit-storage s3 \
  provider Other \
  access_key_id "$AWS_ACCESS_KEY_ID" \
  secret_access_key "$AWS_SECRET_ACCESS_KEY" \
  endpoint "$S3_ENDPOINT"

# Exporteer alle bestanden
rclone copy replit-storage:fps-bucket /tmp/storage-export/ --progress
```

---

## Stap 3 — Database importeren op eigen server

```bash
# Op de eigen server — nadat de containers draaien (stap 5 INSTALL_PRODUCTION.md)
scp fps_replit_export.dump jouwserver:/tmp/

# Importeer in de productie-container
docker compose -f deploy/docker-compose.production.yml exec db \
  pg_restore -h localhost -U fps_app -d fps_production \
  --no-owner --no-acl --clean --if-exists /tmp/fps_replit_export.dump
```

Controleer na import:
```bash
docker compose -f deploy/docker-compose.production.yml exec db \
  psql -U fps_app -d fps_production -c "
SELECT versienummer, status, is_actief FROM kantoor_releases WHERE is_actief = true;
SELECT COUNT(*) AS gebruikers FROM gebruikers;
SELECT COUNT(*) AS gebouwen FROM gebouwen;
"
```

---

## Stap 4 — Object Storage importeren op eigen server

```bash
# Vanuit de tijdelijke export naar de productie-bucket
rclone copy /tmp/storage-export/ productie-storage:fps-production-bucket --progress
```

---

## Stap 5 — DNS overzetten

1. Stel het A-record van `fpsbrandpreventie.nl` in op het IP-adres van de nieuwe server.
2. Wacht op DNS-propagatie (tot 24 uur).
3. Controleer: `dig fpsbrandpreventie.nl A`

Caddy haalt automatisch het Let's Encrypt-certificaat op zodra DNS klopt.

---

## Stap 6 — Verificatie na migratie

```bash
# HTTPS en healthcheck
curl -s https://fpsbrandpreventie.nl/api/healthz

# Actieve release
curl -s https://fpsbrandpreventie.nl/api/kantoor-release/actief | python3 -m json.tool

# Login testen via de browser
open https://fpsbrandpreventie.nl
```

Controleer in de applicatie:
- Login met TOTP werkt
- Gebouwen zijn zichtbaar
- Documenten zijn beschikbaar
- Upload werkt (test met een PDF)
- Beheer > Kantoor Release toont v1.0.0

---

## Stap 7 — Replit-productie-deployment deactiveren

Na succesvolle migratie en verificatie:
1. Ga naar de Replit-projectpagina
2. Klik op "Deployments"
3. Pauzeer of verwijder de `fire-asset-management.replit.app`-deployment

**Doe dit pas na minimaal 48 uur stabiele werking op de eigen server.**

---

## Migratierisico's

| Risico | Kans | Maatregel |
|---|---|---|
| DNS-propagatie duurt langer dan verwacht | Middel | Wacht 24 uur; controleer met `dig` |
| Dump incompleet door actieve sessies | Laag | Dump buiten kantooruren uitvoeren |
| Ontbrekende storage-bestanden | Laag | Vergelijk bestandsaantallen na rclone |
| TOTP-codes werken niet na migratie | Laag | TOTP is per gebruiker opgeslagen in DB; migreert mee |
| Sessies ongeldig na herstart | Geen | Verwacht gedrag; gebruikers loggen opnieuw in |
