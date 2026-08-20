#!/usr/bin/env bash
# Installeert de volledige dagelijkse back-upketen als beheerd /etc/cron.d-bestand.
set -euo pipefail

ROOT="${FPS_ROOT_DIR:-/opt/fps-one}"
DOEL="${FPS_BACKUP_CRON_TARGET:-/etc/cron.d/fps-connect-backup}"

case "$ROOT" in
  /*) ;;
  *) echo "FOUT: FPS_ROOT_DIR moet een absoluut pad zijn." >&2; exit 1 ;;
esac
if printf '%s' "$ROOT" | grep -q '[[:space:]%]'; then
  echo "FOUT: FPS_ROOT_DIR bevat onveilige tekens voor cron." >&2
  exit 1
fi

if [ "$DOEL" = "/etc/cron.d/fps-connect-backup" ] && [ "$(id -u)" -ne 0 ]; then
  exec sudo -n env FPS_ROOT_DIR="$ROOT" FPS_BACKUP_CRON_TARGET="$DOEL" bash "$0"
fi

TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
cat > "$TMP" <<CRON
# Beheerd door FPS Connect — handmatige wijzigingen worden bij deploy vervangen.
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
MAILTO=""

# Brondumps vóór de externe immutable staffel.
0 3 * * * root /usr/bin/flock -n /run/lock/fps-db-backup.lock /bin/bash -lc 'cd $ROOT && docker compose -f deploy/docker-compose.production.yml --env-file deploy/.env.production --profile backup run --rm -T backup' >> /var/log/fps-backup.log 2>&1
15 3 * * * root /usr/bin/find $ROOT/deploy/db-backups -type f -name 'fps_*.sql.gz' -mtime +30 -delete
30 3 * * * root /usr/bin/flock -n /run/lock/fps-minio-backup.lock /bin/bash -lc 'cd $ROOT && docker compose -f deploy/docker-compose.production.yml --env-file deploy/.env.production --profile backup run --rm -T backup-minio' >> /var/log/fps-backup.log 2>&1

# Complete set en bewaking.
0 4 * * * root /usr/bin/flock -n /run/lock/fps-backup-staffel.lock /usr/bin/env BACKUP_DEPLOY_DIR=$ROOT/deploy BACKUP_DOEL=/srv/fps-backup /bin/bash $ROOT/deploy/backup-staffel.sh >> /var/log/fps-backup-staffel.log 2>&1
0 8 * * * root /usr/bin/flock -n /run/lock/fps-backup-check.lock /usr/bin/env BACKUP_DEPLOY_DIR=$ROOT/deploy BACKUP_DOEL=/srv/fps-backup /bin/bash $ROOT/deploy/check-offsite-backup.sh >> /var/log/fps-backup-check.log 2>&1
CRON

mkdir -p "$(dirname "$DOEL")"
if [ -f "$DOEL" ] && cmp -s "$TMP" "$DOEL"; then
  echo "Back-upplanning is al actueel: $DOEL"
  exit 0
fi

install -m 0644 "$TMP" "$DOEL"
echo "Back-upplanning geïnstalleerd: $DOEL (03:00, 03:30, 04:00 en 08:00)."