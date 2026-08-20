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
set -Eeuo pipefail
shopt -s nullglob

DEPLOY_DIR="${BACKUP_DEPLOY_DIR:-/opt/fps-one/deploy}"
BRON_DB="${BACKUP_BRON_DB:-$DEPLOY_DIR/db-backups}"
BRON_MINIO="${BACKUP_BRON_MINIO:-$DEPLOY_DIR/minio-backups}"
DOEL="${BACKUP_DOEL:-/srv/fps-backup}"
VANDAAG="${BACKUP_DATUM:-$(date +%F)}"
LOGP="[backup-staffel $VANDAAG]"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_BESTAND="${BACKUP_COMPOSE_BESTAND:-$DEPLOY_DIR/docker-compose.production.yml}"
ENV_BESTAND="${BACKUP_ENV_BESTAND:-$DEPLOY_DIR/.env.production}"
AGE_RECIPIENT_FILE="${BACKUP_AGE_RECIPIENT_FILE:-/etc/fps-backup/age-recipient}"

RET_DAGEN=14        # dagelijkse sets
RET_WEKEN=13        # ~3 maanden
RET_MAANDEN=12      # 1 jaar

FASE="initialisatie"
FOUT_DETAIL=""
ONTVANGEN_SIGNAAL=""
STAGING=""
PROMOTIE_TMP=""
RUN_GESLAAGD=0
AFSLUITING_BEZIG=0

# shellcheck source=deploy/backup-alert.sh
source "$SCRIPT_DIR/backup-alert.sh"
# shellcheck source=deploy/backup-set-validatie.sh
source "$SCRIPT_DIR/backup-set-validatie.sh"

fout() {
  FOUT_DETAIL="$*"
  echo "$LOGP FOUT: $*" >&2
  return 1
}

tel_dateringen() {
  local map="$1" aantal=0 pad
  for pad in "$map"/20??-??-??; do
    [ -d "$pad" ] && aantal=$((aantal + 1))
  done
  printf '%s' "$aantal"
}

tel_bestanden() {
  local map="$1" aantal=0 pad
  while IFS= read -r -d '' pad; do
    aantal=$((aantal + 1))
  done < <(find "$map" -type f -print0)
  printf '%s' "$aantal"
}

nieuwste_bestand_op_mtime() {
  local nieuwste="" nieuwste_mtime=-1 bestand mtime
  for bestand in "$@"; do
    [ -f "$bestand" ] || continue
    mtime=$(stat -c %Y "$bestand")
    if [ "$mtime" -gt "$nieuwste_mtime" ]; then
      nieuwste="$bestand"
      nieuwste_mtime="$mtime"
    fi
  done
  printf '%s' "$nieuwste"
}

nieuwste_dagset() {
  local uitsluiten="${1:-}" nieuwste="" pad naam
  for pad in "$DOEL"/dagelijks/20??-??-??; do
    [ -d "$pad" ] || continue
    [ "$pad" = "$uitsluiten" ] && continue
    naam=$(basename "$pad")
    if [ -z "$nieuwste" ] || [[ "$naam" > "$(basename "$nieuwste")" ]]; then
      nieuwste="$pad"
    fi
  done
  printf '%s' "$nieuwste"
}

schrijf_status() {
  local uitkomst="$1" detail="${2:-}" exitcode="${3:-0}" signaal="${4:-}"
  local nu bytes=0 status_tmp aantal_d aantal_w aantal_m
  nu=$(date -Is)
  [ -d "$DOEL/dagelijks/$VANDAAG" ] && bytes=$(du -sb "$DOEL/dagelijks/$VANDAAG" | cut -f1)
  aantal_d=$(tel_dateringen "$DOEL/dagelijks")
  aantal_w=$(tel_dateringen "$DOEL/wekelijks")
  aantal_m=$(tel_dateringen "$DOEL/maandelijks")
  status_tmp=$(mktemp "$DOEL/.status.json.XXXXXX")

  STATUS_BESTAAND="$DOEL/status.json" \
  STATUS_UITKOMST="$uitkomst" \
  STATUS_DETAIL="$detail" \
  STATUS_FASE="$FASE" \
  STATUS_EXITCODE="$exitcode" \
  STATUS_SIGNAAL="$signaal" \
  STATUS_NU="$nu" \
  STATUS_SET="dagelijks/$VANDAAG" \
  STATUS_BYTES="$bytes" \
  STATUS_DAGELIJKS="$aantal_d" \
  STATUS_WEKELIJKS="$aantal_w" \
  STATUS_MAANDELIJKS="$aantal_m" \
  python3 > "$status_tmp" <<'PY'
import json
import os

try:
    with open(os.environ["STATUS_BESTAAND"], "r", encoding="utf-8") as bestand:
        bestaand = json.load(bestand)
except (FileNotFoundError, json.JSONDecodeError, OSError):
    bestaand = {}

geslaagd = os.environ["STATUS_UITKOMST"] == "geslaagd"
nu = os.environ["STATUS_NU"]
set_pad = os.environ["STATUS_SET"]
status = {
    "laatste_run": nu,
    "uitkomst": os.environ["STATUS_UITKOMST"],
    "detail": os.environ.get("STATUS_DETAIL", "")[:500],
    "fase": os.environ.get("STATUS_FASE", "onbekend"),
    "exit_code": int(os.environ.get("STATUS_EXITCODE", "0")),
    "signaal": os.environ.get("STATUS_SIGNAAL") or None,
    "set": set_pad,
    "omvang_bytes": int(os.environ.get("STATUS_BYTES", "0")),
    "aantal_dagelijks": int(os.environ.get("STATUS_DAGELIJKS", "0")),
    "aantal_wekelijks": int(os.environ.get("STATUS_WEKELIJKS", "0")),
    "aantal_maandelijks": int(os.environ.get("STATUS_MAANDELIJKS", "0")),
    "laatste_geslaagde_run": (
        nu if geslaagd else bestaand.get("laatste_geslaagde_run")
    ),
    "laatste_geslaagde_set": (
        set_pad if geslaagd else bestaand.get("laatste_geslaagde_set")
    ),
}
json.dump(status, fp=__import__("sys").stdout, ensure_ascii=False, indent=2)
print()
PY
  chmod 0644 "$status_tmp"
  mv -f "$status_tmp" "$DOEL/status.json"
}

bewaar_foutcontext() {
  local exitcode="$1" regel="$2" commando="$3"
  if [ -z "$FOUT_DETAIL" ]; then
    FOUT_DETAIL="commando faalde in fase '$FASE' op regel $regel (exit $exitcode): ${commando:0:180}"
  fi
  return 0
}

ontvang_signaal() {
  ONTVANGEN_SIGNAAL="$1"
  FOUT_DETAIL="run afgebroken door signaal $1"
  exit "$2"
}

afsluiten() {
  local exitcode="$1" detail onderwerp bericht
  [ "$AFSLUITING_BEZIG" -eq 0 ] || exit "$exitcode"
  AFSLUITING_BEZIG=1
  trap - EXIT ERR HUP INT TERM
  set +e

  if [ "$RUN_GESLAAGD" -eq 1 ] && [ "$exitcode" -eq 0 ]; then
    exit 0
  fi
  [ "$exitcode" -ne 0 ] || exitcode=1
  [ -n "$STAGING" ] && [ -d "$STAGING" ] && rm -rf -- "$STAGING"
  [ -n "$PROMOTIE_TMP" ] && [ -d "$PROMOTIE_TMP" ] && rm -rf -- "$PROMOTIE_TMP"
  detail="${FOUT_DETAIL:-onverwachte fout in fase '$FASE' (exit $exitcode)}"
  mkdir -p "$DOEL"/{dagelijks,wekelijks,maandelijks} 2>/dev/null
  schrijf_status "fout" "$detail" "$exitcode" "$ONTVANGEN_SIGNAAL" || \
    echo "$LOGP WAARSCHUWING: status.json kon niet worden bijgewerkt." >&2

  onderwerp="FPS Connect: externe back-upstaffel MISLUKT"
  bericht="De dagelijkse externe back-upstaffel is mislukt.

Tijdstip: $(date -Is)
Fase: $FASE
Exitcode: $exitcode
Signaal: ${ONTVANGEN_SIGNAAL:-geen}
Detail: $detail

De vorige volledige back-upset is niet gewijzigd. Controleer de VPS-run en herstel de staffel. Zolang geen verse geslaagde set bestaat, volgt hoogstens één herinnering per dag."
  stuur_backup_graph_mail "$onderwerp" "$bericht" || \
    echo "$LOGP WAARSCHUWING: directe Graph-faalmail kon niet worden verzonden." >&2
  exit "$exitcode"
}

trap 'bewaar_foutcontext "$?" "$LINENO" "$BASH_COMMAND"' ERR
trap 'ontvang_signaal HUP 129' HUP
trap 'ontvang_signaal INT 130' INT
trap 'ontvang_signaal TERM 143' TERM
trap 'afsluiten "$?"' EXIT

FASE="doelmap en runlock"
mkdir -p "$DOEL"/{dagelijks,wekelijks,maandelijks}
exec 9>"$DOEL/.backup-staffel.lock"
flock -n 9 || fout "er draait al een back-upstaffelrun"

# ── 1. Nieuwste databasedump (vers, integer) ────────────────────────────────
FASE="databasedump selecteren"
DUMP=$(nieuwste_bestand_op_mtime "$BRON_DB"/fps_*.sql.gz)
[ -n "$DUMP" ] || fout "geen databasedump gevonden in $BRON_DB"
LEEFTIJD_U=$(( ($(date +%s) - $(stat -c %Y "$DUMP")) / 3600 ))
[ "$LEEFTIJD_U" -le 24 ] || fout "nieuwste dump is $LEEFTIJD_U uur oud (max 24): $(basename "$DUMP")"
FASE="databasedump valideren"
gunzip -t "$DUMP" || fout "dump is corrupt: $(basename "$DUMP")"

# ── 2. MinIO-mirror moet bestaan en vers zijn ───────────────────────────────
FASE="MinIO-mirror valideren"
[ -d "$BRON_MINIO" ] || fout "MinIO-mirror ontbreekt: $BRON_MINIO"
# NB: een bucket zonder recente uploads heeft oude mtimes; we controleren hier
# alleen dat de mirror-cron gedraaid heeft via het aantal bestanden.
AANTAL_BESTANDEN=$(tel_bestanden "$BRON_MINIO")
[ "$AANTAL_BESTANDEN" -gt 0 ] || fout "MinIO-mirror is leeg"

# ── 3. Dagelijkse set bouwen ────────────────────────────────────────────────
SET="$DOEL/dagelijks/$VANDAAG"
if [ -e "$SET" ] || [ -L "$SET" ]; then
  FASE="bestaande dagset valideren"
  [ -d "$SET" ] || fout "bestaande dagset is geen directory"
  valideer_reguliere_backupinhoud "$SET" || \
    fout "bestaande dagset bevat een symlink of speciaal bestand"
  [ -f "$SET/sha256sums.txt" ] || fout "dagset $SET bestaat al maar mist sha256sums.txt"
  (cd "$SET" && sha256sum -c --quiet sha256sums.txt) || \
    fout "dagset $SET bestaat al maar de checksums kloppen niet"
  schrijf_status "geslaagd" "set $VANDAAG bestond al en is checksum-geldig" 0 ""
  RUN_GESLAAGD=1
  echo "$LOGP klaar: bestaande volledige set $SET is ongewijzigd"
  exit 0
fi

FASE="tijdelijke dagset aanmaken"
STAGING=$(mktemp -d "$DOEL/dagelijks/.${VANDAAG}.tmp.XXXXXX")
mkdir -p "$STAGING/config"

# 3a. dump (optioneel versleuteld met de age-publiekesleutel van René)
FASE="databasedump kopiëren"
if [ -s "$AGE_RECIPIENT_FILE" ] && command -v age >/dev/null 2>&1; then
  age -R "$AGE_RECIPIENT_FILE" -o "$STAGING/db.sql.gz.age" < "$DUMP"
  DB_BESTAND="$STAGING/db.sql.gz.age"
else
  cp "$DUMP" "$STAGING/db.sql.gz"
  DB_BESTAND="$STAGING/db.sql.gz"
fi

# 3b. bestanden: rsync vanuit de mirror, met hardlinks naar de VORIGE set
# (nooit naar de live mirror zelf: een volgende mirror-run mag een historische
# set niet kunnen wijzigen; rsync schrijft gewijzigde bestanden altijd als
# nieuw bestand + rename, dus sets delen alleen inodes met elkaar en zijn
# onveranderlijk zodra ze bestaan).
FASE="bestanden kopiëren"
VORIGE_SET=$(nieuwste_dagset "")
if [ -n "$VORIGE_SET" ] && [ -d "$VORIGE_SET/bestanden" ]; then
  rsync -a --link-dest="$(readlink -f "$VORIGE_SET/bestanden")" "$BRON_MINIO"/ "$STAGING/bestanden"/
else
  rsync -a "$BRON_MINIO"/ "$STAGING/bestanden"/
fi

# 3c. configuratie — zonder geheimen
FASE="configuratie zonder geheimen vastleggen"
[ -f "$COMPOSE_BESTAND" ] || fout "compose-bestand ontbreekt: $COMPOSE_BESTAND"
[ -f "$ENV_BESTAND" ] || fout "productie-envbestand ontbreekt: $ENV_BESTAND"
cp "$COMPOSE_BESTAND" "$STAGING/config/"
# alleen de SLEUTELNAMEN van de envfile, nooit de waarden
grep -oE '^[A-Za-z_][A-Za-z0-9_]*=' "$ENV_BESTAND" | sed 's/=$//' | sort \
  > "$STAGING/config/env-sleutels.txt"
# migratiestand uit de draaiende database
FASE="migratiestand vastleggen"
if [ -n "${BACKUP_MIGRATIESTAND_COMMAND:-}" ]; then
  bash -c "$BACKUP_MIGRATIESTAND_COMMAND" > "$STAGING/config/migratiestand.txt"
else
  docker compose -f "$COMPOSE_BESTAND" \
    --env-file "$ENV_BESTAND" exec -T db \
    psql -U fps_app -d fps_production -Atc \
    "SELECT naam || ' | ' || uitgevoerd_op FROM schema_migraties ORDER BY naam" \
    > "$STAGING/config/migratiestand.txt"
fi

# 3d. checksums + manifest
FASE="manifest maken"
if ! valideer_reguliere_backupinhoud "$STAGING"; then
  fout "Back-upbron bevat een symlink of speciaal bestand; onveilige set niet gepubliceerd" 1
fi
BESTANDEN_AANTAL=$(tel_bestanden "$STAGING/bestanden")
BESTANDEN_BYTES=$(du -sb "$STAGING/bestanden" | cut -f1)
PAYLOAD_BYTES=$(du -sb "$STAGING" | cut -f1)
MANIFEST_DATUM="$VANDAAG" \
MANIFEST_AANGEMAAKT="$(date -Is)" \
MANIFEST_DB_BESTAND="$(basename "$DB_BESTAND")" \
MANIFEST_DB_BYTES="$(stat -c %s "$DB_BESTAND")" \
MANIFEST_DB_BRON="$(basename "$DUMP")" \
MANIFEST_BESTANDEN_AANTAL="$BESTANDEN_AANTAL" \
MANIFEST_BESTANDEN_BYTES="$BESTANDEN_BYTES" \
MANIFEST_PAYLOAD_BYTES="$PAYLOAD_BYTES" \
MANIFEST_VERSLEUTELD="$([ -f "$STAGING/db.sql.gz.age" ] && echo true || echo false)" \
python3 > "$STAGING/manifest.json" <<'PY'
import json
import os
import sys

manifest = {
    "datum": os.environ["MANIFEST_DATUM"],
    "aangemaakt": os.environ["MANIFEST_AANGEMAAKT"],
    "database": {
        "bestand": os.environ["MANIFEST_DB_BESTAND"],
        "bytes": int(os.environ["MANIFEST_DB_BYTES"]),
        "bron": os.environ["MANIFEST_DB_BRON"],
    },
    "bestanden": {
        "aantal": int(os.environ["MANIFEST_BESTANDEN_AANTAL"]),
        "bytes": int(os.environ["MANIFEST_BESTANDEN_BYTES"]),
    },
    "payload_bytes_voor_checksums": int(os.environ["MANIFEST_PAYLOAD_BYTES"]),
    "versleuteld": os.environ["MANIFEST_VERSLEUTELD"] == "true",
    "geheimen_opgenomen": False,
    "checksum_bereik": "alle bestanden behalve sha256sums.txt zelf",
}
json.dump(manifest, sys.stdout, ensure_ascii=False, indent=2)
print()
PY

FASE="checksums maken en verifiëren"
(
  cd "$STAGING"
  find . -type f ! -name sha256sums.txt -print0 \
    | LC_ALL=C sort -z \
    | xargs -0 -r sha256sum > sha256sums.txt
  sha256sum -c --quiet sha256sums.txt
)

FASE="dagset atomair publiceren"
mv "$STAGING" "$SET"
STAGING=""

# ── 4. Promotie naar wekelijks (zondag) en maandelijks (1e vd maand) ───────
promoveer_set() {
  local soort="$1" doelmap="$DOEL/$soort" einddoel="$DOEL/$soort/$VANDAAG"
  [ ! -e "$einddoel" ] || return 0
  PROMOTIE_TMP="$doelmap/.${VANDAAG}.tmp.$$"
  rm -rf -- "$PROMOTIE_TMP"
  cp -al "$SET" "$PROMOTIE_TMP"
  mv "$PROMOTIE_TMP" "$einddoel"
  PROMOTIE_TMP=""
}

FASE="week- en maandpromotie"
[ "$(date +%u)" != "7" ] || promoveer_set "wekelijks"
[ "$(date +%d)" != "01" ] || promoveer_set "maandelijks"

# ── 5. Retentie ─────────────────────────────────────────────────────────────
verwijder_ouder_dan() { # $1=map $2=dagen
  local map="$1" dagen="$2" pad setdatum set_ts leeftijd
  for pad in "$map"/20??-??-??; do
    [ -d "$pad" ] || continue
    setdatum=$(basename "$pad")
    set_ts=$(date -d "$setdatum" +%s 2>/dev/null) || continue
    leeftijd=$(( ($(date +%s) - set_ts) / 86400 ))
    if [ "$leeftijd" -gt "$dagen" ]; then
      rm -rf -- "$pad"
      echo "$LOGP retentie: $pad verwijderd"
    fi
  done
}
FASE="retentie toepassen"
verwijder_ouder_dan "$DOEL/dagelijks" "$RET_DAGEN"
verwijder_ouder_dan "$DOEL/wekelijks" $(( RET_WEKEN * 7 ))
verwijder_ouder_dan "$DOEL/maandelijks" $(( RET_MAANDEN * 31 ))

# ── 6. Leesrechten: alleen root en de groep fps-nas, nooit "iedereen" ───────
# (dumps en documenten bevatten personeels-/klantgegevens; andere lokale
# accounts/containers mogen ze niet kunnen lezen)
FASE="leesrechten instellen"
chgrp -R fps-nas "$DOEL" 2>/dev/null || true
find "$DOEL" -type d -exec chmod 0750 {} +
find "$DOEL" -type f -exec chmod 0640 {} +
# top-map: alleen traverse voor anderen zodat de api-container status.json
# (world-readable, geen gevoelige inhoud) kan lezen; de datamappen blijven 0750
chmod 0751 "$DOEL"
FASE="successtatus publiceren"
schrijf_status "geslaagd" "set $VANDAAG compleet en checksums geverifieerd" 0 ""
RUN_GESLAAGD=1
echo "$LOGP klaar: $(du -sh "$SET" | cut -f1) in $SET"
