# FPS Connect — Backup & Restore Productie

## Backupstrategie

| Type | Frequentie | Bewaarperiode | Locatie |
|---|---|---|---|
| Database dump (gzip) | Dagelijks 03:00 | 30 dagen | `/opt/fps-connect/deploy/db-backups/` |
| Object Storage sync | Dagelijks 04:00 | Altijd | Externe bucket of `rsync` naar backup-server |
| Volledige snapshot | Wekelijks | 4 weken | Server-snapshot via hostingprovider |

---

## Automatische dagelijkse database-backup

### Instellen (eenmalig)

```bash
crontab -e
```

Voeg toe:
```
# Database backup elke nacht om 03:00
0 3 * * * cd /opt/fps-connect && docker compose -f deploy/docker-compose.production.yml --env-file deploy/.env.production --profile backup run --rm backup >> /var/log/fps-backup.log 2>&1

# Opschoning: bewaar maximaal 30 dumps
15 3 * * * find /opt/fps-connect/deploy/db-backups -name "fps_*.sql.gz" -mtime +30 -delete
```

### Handmatige backup

```bash
cd /opt/fps-connect
docker compose -f deploy/docker-compose.production.yml --env-file deploy/.env.production \
  --profile backup run --rm backup
```

### Backup controleren

```bash
ls -lh deploy/db-backups/
# Verwacht: fps_YYYYMMDD_HHMMSS.sql.gz

# Integriteitscontrole
gunzip -t deploy/db-backups/fps_laatste.sql.gz && echo "OK" || echo "CORRUPT"
```

---

## Object Storage backup

### Naar externe S3-bucket (aanbevolen)

```bash
# Eenmalig instellen
rclone config create backup-storage s3 \
  provider AWS \
  region eu-west-1 \
  access_key_id BACKUP_KEY_ID \
  secret_access_key BACKUP_SECRET

# Dagelijkse sync (toevoegen aan crontab)
0 4 * * * rclone sync fps-production-storage:fps-production backup-storage:fps-backup/$(date +\%Y\%m\%d)/ >> /var/log/fps-storage-backup.log 2>&1
```

### Via rsync naar backup-server

```bash
rsync -avz --delete /opt/fps-connect/deploy/uploads/ \
  backup-user@backup-server:/backups/fps-storage/ \
  >> /var/log/fps-storage-rsync.log 2>&1
```

---

## Restore-procedure database

### Volledige restore (noodgeval)

```bash
# 1. Stop de API-server
docker compose -f deploy/docker-compose.production.yml stop api

# 2. Maak een noodbackup van de huidige staat
docker compose -f deploy/docker-compose.production.yml exec db \
  pg_dump -U fps_app fps_production | gzip > /tmp/noodbackup_$(date +%Y%m%d_%H%M%S).sql.gz

# 3. Database leegmaken
docker compose -f deploy/docker-compose.production.yml exec db \
  psql -U fps_app -d postgres -c "DROP DATABASE fps_production; CREATE DATABASE fps_production OWNER fps_app;"

# 4. Restore uitvoeren
gunzip -c deploy/db-backups/fps_YYYYMMDD_HHMMSS.sql.gz | \
  docker compose -f deploy/docker-compose.production.yml exec -T db \
  pg_restore -U fps_app -d fps_production --no-owner --no-acl

# 5. API-server herstarten
docker compose -f deploy/docker-compose.production.yml start api

# 6. Verificatie
curl -s https://fpsbrandpreventie.nl/api/healthz
curl -s https://fpsbrandpreventie.nl/api/kantoor-release/actief
```

### Gedeeltelijke restore (specifieke tabel)

```bash
# Voorbeeld: alleen kantoor_releases herstellen
gunzip -c deploy/db-backups/fps_YYYYMMDD.sql.gz | \
  docker compose -f deploy/docker-compose.production.yml exec -T db \
  pg_restore -U fps_app -d fps_production -t kantoor_releases --no-owner --data-only
```

---

## Droge restore-controle (restore drill)

Voer dit uit op een testserver of met een tijdelijke container, zonder de productiedatabase aan te raken:

```bash
# Start een tijdelijke PostgreSQL-container
docker run -d --name fps-restore-test \
  -e POSTGRES_DB=fps_test \
  -e POSTGRES_USER=fps_app \
  -e POSTGRES_PASSWORD=testpass \
  postgres:16-alpine

# Wacht tot container gereed is
sleep 5

# Restore in testcontainer
gunzip -c deploy/db-backups/fps_YYYYMMDD.sql.gz | \
  docker exec -i fps-restore-test \
  pg_restore -U fps_app -d fps_test --no-owner --no-acl

# Controleer
docker exec fps-restore-test psql -U fps_app -d fps_test -c "
SELECT versienummer, status, is_actief FROM kantoor_releases;
SELECT COUNT(*) AS gebruikers FROM gebruikers;
SELECT COUNT(*) AS gebouwen FROM gebouwen;
"

# Opruimen
docker rm -f fps-restore-test
echo "Restore drill geslaagd"
```

---

## Backup-monitoring

Voeg een eenvoudige controle toe die een waarschuwing geeft als de backup meer dan 25 uur oud is:

```bash
# /opt/fps-connect/deploy/check-backup.sh
#!/bin/bash
LATEST=$(ls -t /opt/fps-connect/deploy/db-backups/fps_*.sql.gz 2>/dev/null | head -1)
if [ -z "$LATEST" ]; then
  echo "WAARSCHUWING: Geen backupbestand gevonden"
  exit 1
fi
AGE=$(( ($(date +%s) - $(stat -c %Y "$LATEST")) / 3600 ))
if [ "$AGE" -gt 25 ]; then
  echo "WAARSCHUWING: Laatste backup is ${AGE} uur oud: $LATEST"
  exit 1
fi
echo "OK: Laatste backup is ${AGE} uur oud: $(basename $LATEST)"
```

```bash
chmod +x /opt/fps-connect/deploy/check-backup.sh
# Toevoegen aan crontab (controle elke ochtend om 06:00)
0 6 * * * /opt/fps-connect/deploy/check-backup.sh | mail -s "FPS Backup Status" admin@fpsbrandpreventie.nl
```
