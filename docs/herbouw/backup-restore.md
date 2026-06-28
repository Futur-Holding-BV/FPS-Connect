# Back-up en herstel

FPS Connect heeft twee back-uplagen:
1. **Database** — dagelijks via `pg_dump` + object storage (al ingericht)
2. **Broncode + configuratie** — dagelijks via Git-bundle + versleutelde export

---

## Laag 1 — Database back-up (bestaand systeem)

De API-server maakt dagelijks om **03:00** automatisch een database-back-up
via `backupService.ts`. Back-ups worden opgeslagen in S3/object storage.

### Handmatige back-up starten

Via de applicatie: **Beheer → Back-up & Herstel → Back-up starten**

Via de API:
```bash
curl -X POST https://connect.fps-brandpreventie.nl/api/backups \
  -H "Cookie: <hoofdbeheerder-sessiecookie>"
```

Via de commandoregel:
```bash
pg_dump $DATABASE_URL \
  --format=custom \
  --no-owner \
  --no-acl \
  --file=fps_$(date +%Y%m%d_%H%M).dump

# Gzip comprimeren
gzip fps_$(date +%Y%m%d_%H%M).dump
```

### Database herstellen

Via de applicatie: **Beheer → Back-up & Herstel → Herstel** (vereist bevestigingstekst)

Via de commandoregel:
```bash
# Herstel van .dump-bestand
pg_restore \
  --dbname=$DATABASE_URL \
  --no-owner \
  --clean \
  --if-exists \
  fps_20250101.dump

# Herstel van SQL-bestand (plain)
psql $DATABASE_URL < fps_20250101.sql
```

---

## Laag 2 — Broncode-export (dagelijks)

### Wat wordt geëxporteerd

| Onderdeel | Formaat | Versleuteld |
|---|---|---|
| Volledige Git-repository | `.bundle` (git-bundle) | Ja (AES-256-GCM) |
| Database-schema (Drizzle TypeScript) | `.tar.gz` | Ja |
| Gegenereerde SQL-migraties | `.tar.gz` | Ja |
| `.env.example` | `.txt` | Nee (bevat geen secrets) |
| Herbouwdocumentatie (`docs/herbouw/`) | `.tar.gz` | Nee |
| Exportmanifest (checksums) | `.json` | Nee |

### Handmatige broncode-export uitvoeren

```bash
pnpm --filter @workspace/scripts run broncode-export
```

Dit maakt een exportpakket aan in `exports/` met alle bovenstaande bestanden.

### Automatische dagelijkse export instellen

Voeg een cron-taak toe op de server:

```cron
# /etc/cron.d/fps-backup
# Elke dag om 03:30 (na de database-back-up om 03:00)
30 3 * * * fps-user /home/fps-user/fps-connect/scripts/dagelijkse-export.sh >> /var/log/fps-backup.log 2>&1
```

Inhoud van `scripts/dagelijkse-export.sh`:
```bash
#!/bin/bash
set -e

cd /home/fps-user/fps-connect

# Broncode-export uitvoeren
pnpm --filter @workspace/scripts run broncode-export

# Exporteer naar NAS
rsync -avz --delete exports/ nas:/volume1/fps-backups/broncode/

# Verificatie
echo "$(date): Broncode-export geslaagd" >> /var/log/fps-backup.log
```

---

## Versleuteling

Back-ups worden versleuteld met AES-256-GCM via OpenSSL.

### Versleutelen

```bash
openssl enc -aes-256-gcm \
  -pbkdf2 \
  -k "$BACKUP_WACHTWOORD" \
  -in fps_backup.tar.gz \
  -out fps_backup.tar.gz.enc
```

### Ontsleutelen

```bash
openssl enc -d -aes-256-gcm \
  -pbkdf2 \
  -k "$BACKUP_WACHTWOORD" \
  -in fps_backup.tar.gz.enc \
  -out fps_backup.tar.gz
```

> **Bewaar het back-upwachtwoord op een veilige plek buiten de server**,
> bijvoorbeeld in een wachtwoordmanager of in een afgedrukte noodenvelop
> die veilig wordt opgeborgen bij de eigenaar.

---

## Tweede opslaglocatie (NAS / fysieke schijf)

### Synology NAS via rsync

```bash
# SSH-sleutel-based authenticatie instellen op NAS
ssh-copy-id fps-user@nas-ip

# Dagelijkse sync
rsync -avz --delete \
  exports/ \
  fps-user@nas-ip:/volume1/fps-backups/broncode/
```

### Externe schijf

```bash
# Koppel schijf
mount /dev/sdb1 /mnt/backup-schijf

# Kopieer exports
cp -r exports/ /mnt/backup-schijf/fps/$(date +%Y-%m-%d)/

# Ontkoppel veilig
umount /mnt/backup-schijf
```

---

## Retentie-beleid

| Back-uptype | Bewaartermijn |
|---|---|
| Dagelijkse database-back-up | 90 dagen (S3) |
| Wekelijkse snapshot | 1 jaar (NAS) |
| Maandelijkse archief-export | 7 jaar (juridische bewaartermijn) |
| Broncode-bundel | 1 jaar (NAS) + onbeperkt in Git |

---

## Volledig herstel (noodscenario)

Bij volledig verlies van de server:

```bash
# 1. Nieuwe server opzetten (zie installatie.md)

# 2. Repository herstellen vanuit Git-bundle
git clone fps-connect-backup.bundle fps-connect
cd fps-connect
git remote set-url origin https://github.com/fps-brandpreventie/fps-connect.git

# 3. Dependencies installeren
pnpm install

# 4. Omgevingsvariabelen herstellen
#    (uit wachtwoordkluis of versleuteld back-up)
cp .env.example .env
nano .env

# 5. Database herstellen
createdb fps_connect
pg_restore --dbname=$DATABASE_URL fps_backup_latest.dump

# 6. Object storage koppelen (S3-sleutels instellen in .env)

# 7. Starten en verificeren
pnpm --filter @workspace/api-server run build
curl http://localhost:8080/healthz
```

Doorlooptijd bij goed voorbereide herbouw: **2–4 uur**.
