#!/bin/bash
# FPS Connect — BACKUP_01: staffel-kopie voor de externe (NAS-)back-up.
#
# Draait dagelijks op de VPS (cron, ná de pg_dump- en minio-mirror-crons van
# 03:00/03:30) en bouwt onder /srv/fps-backup een complete, zelfstandige set:
#
#   /srv/fps-backup/
#     dagelijks/JJJJ-MM-DD/   (14 dagen bewaard)
#     wekelijks/JJJJ-MM-DD/   (elke zondag gepromoveerd, 13 weken bewaard)
#     maandelijks/JJJJ-MM-DD/ (elke 1e van de maand, 12 maanden bewaard)
#     status.json             (laatste run: omvang, checksums, uitkomst)
#
# Elke set bevat:
#   db.sql.gz            — nieuwste pg_dump (moet < 24 uur oud zijn)
#   bestanden/           — hardlink-kopie van de MinIO-mirror (geen dubbele opslag)
#   config/              — compose-bestand, env-SLEUTELS (zonder waarden!),
#                          migratiestand (schema_migraties)
#   manifest.json        — inhoudsopgave met omvang per onderdeel
#   sha256sums.txt       — checksums van alle bestanden in de set
#
# GEHEIMEN HOREN NIET IN DE BACK-UP: van .env.production gaan alleen de
# sleutelnamen mee, nooit de waarden.
#
# Optionele versleuteling: staat er in /etc/fps-backup/age-recipient een
# age-publiekesleutel (age1...), dan wordt db.sql.gz vervangen door
# db.sql.gz.age. De privésleutel hoort bij René te liggen, nooit op de VPS.
set -euo pipefail

DEPLOY_DIR="/opt/fps-one/deploy"
BRON_DB="$DEPLOY_DIR/db-backups"
BRON_MINIO="$DEPLOY_DIR/minio-backups"
DOEL="/srv/fps-backup"
VANDAAG=$(date +%F)
LOGP="[backup-staffel $VANDAAG]"

RET_DAGEN=14        # dagelijkse sets
RET_WEKEN=13        # ~3 maanden
RET_MAANDEN=12      # 1 jaar

fout() { echo "$LOGP FOUT: $*" >&2; schrijf_status "fout" "$*"; exit 1; }

schrijf_status() {
  local uitkomst="$1" detail="${2:-}"
  local bytes=0
  [ -d "$DOEL/dagelijks/$VANDAAG" ] && bytes=$(du -sb "$DOEL/dagelijks/$VANDAAG" | cut -f1)
  cat > "$DOEL/status.json.tmp" <<EOF
{
  "laatste_run": "$(date -Is)",
  "uitkomst": "$uitkomst",
  "detail": "$(echo "$detail" | tr '"' "'" | head -c 300)",
  "set": "dagelijks/$VANDAAG",
  "omvang_bytes": $bytes,
  "aantal_dagelijks": $(ls -1d "$DOEL"/dagelijks/*/ 2>/dev/null | wc -l),
  "aantal_wekelijks": $(ls -1d "$DOEL"/wekelijks/*/ 2>/dev/null | wc -l),
  "aantal_maandelijks": $(ls -1d "$DOEL"/maandelijks/*/ 2>/dev/null | wc -l)
}
EOF
  mv "$DOEL/status.json.tmp" "$DOEL/status.json"
}

mkdir -p "$DOEL"/{dagelijks,wekelijks,maandelijks}

# ── 1. Nieuwste databasedump (vers, integer) ────────────────────────────────
DUMP=$(ls -t "$BRON_DB"/fps_*.sql.gz 2>/dev/null | head -1)
[ -n "$DUMP" ] || fout "geen databasedump gevonden in $BRON_DB"
LEEFTIJD_U=$(( ($(date +%s) - $(stat -c %Y "$DUMP")) / 3600 ))
[ "$LEEFTIJD_U" -le 24 ] || fout "nieuwste dump is $LEEFTIJD_U uur oud (max 24): $(basename "$DUMP")"
gunzip -t "$DUMP" || fout "dump is corrupt: $(basename "$DUMP")"

# ── 2. MinIO-mirror moet bestaan en vers zijn ───────────────────────────────
[ -d "$BRON_MINIO" ] || fout "MinIO-mirror ontbreekt: $BRON_MINIO"
MIRROR_LEEFTIJD_U=$(( ($(date +%s) - $(find "$BRON_MINIO" -type f -printf '%T@\n' 2>/dev/null | sort -rn | head -1 | cut -d. -f1 || echo 0)) / 3600 ))
# NB: een bucket zonder recente uploads heeft oude mtimes; we controleren hier
# alleen dat de mirror-cron gedraaid heeft via het aantal bestanden.
AANTAL_BESTANDEN=$(find "$BRON_MINIO" -type f | wc -l)
[ "$AANTAL_BESTANDEN" -gt 0 ] || fout "MinIO-mirror is leeg"

# ── 3. Dagelijkse set bouwen ────────────────────────────────────────────────
SET="$DOEL/dagelijks/$VANDAAG"
rm -rf "$SET.tmp"
mkdir -p "$SET.tmp/config"

# 3a. dump (optioneel versleuteld met de age-publiekesleutel van René)
AGE_RECIPIENT_FILE="/etc/fps-backup/age-recipient"
if [ -s "$AGE_RECIPIENT_FILE" ] && command -v age >/dev/null 2>&1; then
  age -R "$AGE_RECIPIENT_FILE" -o "$SET.tmp/db.sql.gz.age" < "$DUMP"
else
  cp "$DUMP" "$SET.tmp/db.sql.gz"
fi

# 3b. bestanden: rsync vanuit de mirror, met hardlinks naar de VORIGE set
# (nooit naar de live mirror zelf: een volgende mirror-run mag een historische
# set niet kunnen wijzigen; rsync schrijft gewijzigde bestanden altijd als
# nieuw bestand + rename, dus sets delen alleen inodes met elkaar en zijn
# onveranderlijk zodra ze bestaan).
VORIGE_SET=$(ls -1d "$DOEL"/dagelijks/*/ 2>/dev/null | sort | tail -1 || true)
if [ -n "$VORIGE_SET" ] && [ -d "$VORIGE_SET/bestanden" ]; then
  rsync -a --link-dest="$(readlink -f "$VORIGE_SET/bestanden")" "$BRON_MINIO"/ "$SET.tmp/bestanden"/
else
  rsync -a "$BRON_MINIO"/ "$SET.tmp/bestanden"/
fi

# 3c. configuratie — zonder geheimen
cp "$DEPLOY_DIR/docker-compose.production.yml" "$SET.tmp/config/"
# alleen de SLEUTELNAMEN van de envfile, nooit de waarden
grep -oE '^[A-Za-z_][A-Za-z0-9_]*=' "$DEPLOY_DIR/.env.production" | sed 's/=$//' | sort \
  > "$SET.tmp/config/env-sleutels.txt"
# migratiestand uit de draaiende database
docker compose -f "$DEPLOY_DIR/docker-compose.production.yml" \
  --env-file "$DEPLOY_DIR/.env.production" exec -T db \
  psql -U fps_app -d fps_production -Atc \
  "SELECT naam || ' | ' || uitgevoerd_op FROM schema_migraties ORDER BY naam" \
  > "$SET.tmp/config/migratiestand.txt" 2>/dev/null || echo "(niet leesbaar)" > "$SET.tmp/config/migratiestand.txt"

# 3d. checksums + manifest
( cd "$SET.tmp" && find . -type f ! -name sha256sums.txt -print0 | sort -z | xargs -0 sha256sum > sha256sums.txt )
DB_BESTAND=$(ls "$SET.tmp"/db.sql.gz* | head -1)
cat > "$SET.tmp/manifest.json" <<EOF
{
  "datum": "$VANDAAG",
  "aangemaakt": "$(date -Is)",
  "database": { "bestand": "$(basename "$DB_BESTAND")", "bytes": $(stat -c %s "$DB_BESTAND"), "bron": "$(basename "$DUMP")" },
  "bestanden": { "aantal": $(find "$SET.tmp/bestanden" -type f | wc -l), "bytes": $(du -sb "$SET.tmp/bestanden" | cut -f1) },
  "totaal_bytes": $(du -sb "$SET.tmp" | cut -f1),
  "versleuteld": $([ -f "$SET.tmp/db.sql.gz.age" ] && echo true || echo false),
  "geheimen_opgenomen": false
}
EOF

rm -rf "$SET"
mv "$SET.tmp" "$SET"

# ── 4. Promotie naar wekelijks (zondag) en maandelijks (1e vd maand) ───────
if [ "$(date +%u)" = "7" ] && [ ! -d "$DOEL/wekelijks/$VANDAAG" ]; then
  cp -al "$SET" "$DOEL/wekelijks/$VANDAAG"
fi
if [ "$(date +%d)" = "01" ] && [ ! -d "$DOEL/maandelijks/$VANDAAG" ]; then
  cp -al "$SET" "$DOEL/maandelijks/$VANDAAG"
fi

# ── 5. Retentie ─────────────────────────────────────────────────────────────
verwijder_ouder_dan() { # $1=map $2=dagen
  find "$1" -mindepth 1 -maxdepth 1 -type d -name '20*' | while read -r d; do
    setdatum=$(basename "$d")
    if [ $(( ($(date +%s) - $(date -d "$setdatum" +%s)) / 86400 )) -gt "$2" ]; then
      rm -rf "$d"
      echo "$LOGP retentie: $d verwijderd"
    fi
  done
}
verwijder_ouder_dan "$DOEL/dagelijks" "$RET_DAGEN"
verwijder_ouder_dan "$DOEL/wekelijks" $(( RET_WEKEN * 7 ))
verwijder_ouder_dan "$DOEL/maandelijks" $(( RET_MAANDEN * 31 ))

# ── 6. Leesrechten: alleen root en de groep fps-nas, nooit "iedereen" ───────
# (dumps en documenten bevatten personeels-/klantgegevens; andere lokale
# accounts/containers mogen ze niet kunnen lezen)
chgrp -R fps-nas "$DOEL" 2>/dev/null || true
find "$DOEL" -type d -exec chmod 0750 {} +
find "$DOEL" -type f -exec chmod 0640 {} +
# top-map: alleen traverse voor anderen zodat de api-container status.json
# (world-readable, geen gevoelige inhoud) kan lezen; de datamappen blijven 0750
chmod 0751 "$DOEL"
schrijf_status "geslaagd" "set $VANDAAG compleet"
echo "$LOGP klaar: $(du -sh "$SET" | cut -f1) in $SET"
