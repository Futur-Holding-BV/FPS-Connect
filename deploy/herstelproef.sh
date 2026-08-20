#!/bin/bash
# FPS Connect — BACKUP_01: herstelproef.
#
# Zet de nieuwste staffel-set uit /srv/fps-backup terug in een LEGE omgeving
# (verse postgres + verse minio + de bestaande api-image) en bewijst dat:
#   1. de database volledig terugkomt;
#   2. alle bestanden terugkomen in een verse objectopslag;
#   3. de applicatie start en een echte gebruiker kan inloggen (incl. 2FA);
#   4. een document uit de herstelde opslag te openen is (checksum-gelijk
#      aan de back-upset).
# Raakt productie NIET aan: eigen docker-netwerk, eigen containers, poort
# alleen op 127.0.0.1. Ruimt zichzelf op (KEEP=1 laat de omgeving staan).
#
# Gebruik op de VPS:  sudo ./herstelproef.sh
set -euo pipefail
shopt -s nullglob

BACKUP_ROOT="${BACKUP_DOEL:-/srv/fps-backup}"
API_IMAGE="${HERSTEL_API_IMAGE:-deploy-api:latest}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/backup-set-validatie.sh
source "$SCRIPT_DIR/backup-set-validatie.sh"

nieuwste_dagset() {
  local nieuwste="" nieuwste_naam="" pad naam
  for pad in "$BACKUP_ROOT"/dagelijks/20??-??-??; do
    [ -d "$pad" ] || continue
    naam=$(basename "$pad")
    if [ -z "$nieuwste" ] || [[ "$naam" > "$nieuwste_naam" ]]; then
      nieuwste="$pad"
      nieuwste_naam="$naam"
    fi
  done
  printf '%s' "$nieuwste"
}

SET="${HERSTEL_SET:-$(nieuwste_dagset)}"
[ -n "$SET" ] || { echo "FOUT: geen dagelijkse back-upset gevonden onder $BACKUP_ROOT"; exit 1; }
[ -d "$SET" ] || { echo "FOUT: back-upset bestaat niet: $SET"; exit 1; }

# Herstel uitsluitend uit de immutable dagelijkse staffel, nooit uit een live
# productiepad of losse dump. realpath voorkomt omzeiling met ../ of symlinks.
BACKUP_ROOT_REAL=$(realpath "$BACKUP_ROOT")
SET_REAL=$(realpath "$SET")
case "$SET_REAL" in
  "$BACKUP_ROOT_REAL"/dagelijks/20??-??-??) ;;
  *) echo "FOUT: herstelset valt buiten $BACKUP_ROOT_REAL/dagelijks: $SET_REAL"; exit 1 ;;
esac
SET="$SET_REAL"

if ! valideer_reguliere_backupinhoud "$SET"; then
  echo "FOUT: herstelset bevat een symlink of speciaal bestand; herstelproef niet gestart"
  exit 1
fi
[ -f "$SET/manifest.json" ] || { echo "FOUT: manifest.json ontbreekt in $SET"; exit 1; }
[ -f "$SET/sha256sums.txt" ] || { echo "FOUT: sha256sums.txt ontbreekt in $SET"; exit 1; }
(cd "$SET" && sha256sum -c --quiet sha256sums.txt) || {
  echo "FOUT: checksumcontrole van $SET is mislukt; herstelproef niet gestart"
  exit 1
}

# Unieke namen maken parallelle of afgebroken proeven herkenbaar. Geen van deze
# namen kan samenvallen met productie-services (api, db of minio).
RUN_ID="$$"
NET="fps-herstelproef-$RUN_ID"
PFX="herstelproef-$RUN_ID"
T0=$(date +%s)
stap() { echo "== [$(( $(date +%s) - T0 ))s] $*"; }

# gevoelige tijdelijke bestanden: root-only (0700) en altijd opruimen
TMPD=$(mktemp -d /tmp/herstelproef.XXXXXX)
chmod 0700 "$TMPD"
exec 9>"/tmp/fps-herstelproef.lock"
flock -n 9 || { echo "FOUT: er draait al een herstelproef"; exit 1; }

# TOTP-hulpje (RFC 6238) — geen extra pakketten nodig
cat > "$TMPD"/totp.py <<'PYEOF'
import sys,base64,hmac,hashlib,struct,time
s=sys.argv[1].strip().replace(" ","").upper()
s+="="*((8-len(s)%8)%8)
key=base64.b32decode(s)
c=int(time.time())//30
h=hmac.new(key,struct.pack(">Q",c),hashlib.sha1).digest()
o=h[19]&15
print(str((struct.unpack(">I",h[o:o+4])[0]&0x7fffffff)%1000000).zfill(6))
PYEOF

opruimen() {
  docker rm -f "${PFX}-api" "${PFX}-minio" "${PFX}-db" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  rm -rf "$TMPD"
}
if [ -n "${KEEP:-}" ]; then
  trap 'rm -rf "$TMPD"' EXIT   # geheimen ruimen we ALTIJD op, ook met KEEP=1
else
  trap opruimen EXIT
fi
docker rm -f "${PFX}-api" "${PFX}-minio" "${PFX}-db" >/dev/null 2>&1 || true
docker network rm "$NET" >/dev/null 2>&1 || true

stap "checksum-geldige set bevestigd; lege geïsoleerde omgeving aanmaken — set: $SET"
docker network create "$NET" >/dev/null
docker run -d --name "${PFX}-db" --network "$NET" \
  -e POSTGRES_USER=fps_app -e POSTGRES_PASSWORD=herstelproef -e POSTGRES_DB=fps_production \
  postgres:16-alpine >/dev/null
docker run -d --name "${PFX}-minio" --network "$NET" \
  -e MINIO_ROOT_USER=fps_minio -e MINIO_ROOT_PASSWORD=herstelproefgeheim \
  minio/minio server /data >/dev/null
# wachten tot de db ECHT klaar is (init herstart postgres; pg_isready is te vroeg true)
for i in $(seq 1 60); do
  docker exec "${PFX}-db" psql -U fps_app -d fps_production -Atc "SELECT 1" >/dev/null 2>&1 && sleep 2 && \
  docker exec "${PFX}-db" psql -U fps_app -d fps_production -Atc "SELECT 1" >/dev/null 2>&1 && break
  sleep 1
done
docker exec "${PFX}-db" psql -U fps_app -d fps_production -Atc "SELECT 1" >/dev/null 2>&1 || {
  echo "FOUT: geïsoleerde hersteldatabase werd niet gereed"
  exit 1
}

# database-dump: gewoon gz, of age-versleuteld (dan is René's privésleutel nodig)
if [ -f "$SET/db.sql.gz" ]; then
  stap "database terugzetten uit $SET/db.sql.gz"
  gunzip -c "$SET/db.sql.gz" | docker exec -i "${PFX}-db" psql -q -U fps_app -d fps_production >/dev/null
elif [ -f "$SET/db.sql.gz.age" ]; then
  if [ -z "${AGE_KEY_FILE:-}" ] || [ ! -f "${AGE_KEY_FILE:-}" ]; then
    echo "FOUT: de set is versleuteld (db.sql.gz.age). Start met AGE_KEY_FILE=/pad/naar/age-privesleutel"
    echo "      (de privésleutel ligt bij René, bewust NIET op deze server)."
    exit 1
  fi
  stap "database terugzetten uit $SET/db.sql.gz.age (age-ontsleuteling)"
  age -d -i "$AGE_KEY_FILE" < "$SET/db.sql.gz.age" | gunzip -c \
    | docker exec -i "${PFX}-db" psql -q -U fps_app -d fps_production >/dev/null
else
  echo "FOUT: geen db.sql.gz of db.sql.gz.age in $SET"; exit 1
fi
RIJEN=$(docker exec "${PFX}-db" psql -U fps_app -d fps_production -Atc "SELECT count(*) FROM gebruikers")
stap "database hersteld: $RIJEN gebruikers"

stap "bestanden terugzetten naar verse MinIO"
docker run --rm --network "$NET" -v "$SET/bestanden/fps-production:/restore:ro" \
  --entrypoint /bin/sh minio/mc:latest -c "
  mc alias set h http://${PFX}-minio:9000 fps_minio herstelproefgeheim &&
  mc mb h/fps-production &&
  mc mirror /restore h/fps-production" >/dev/null
OBJ=$(docker run --rm --network "$NET" --entrypoint /bin/sh minio/mc:latest -c "
  mc alias set h http://${PFX}-minio:9000 fps_minio herstelproefgeheim >/dev/null &&
  mc ls -r h/fps-production | wc -l")
stap "objectopslag hersteld: $OBJ objecten"

stap "applicatie starten tegen de herstelde omgeving"
# De herstelcontainer krijgt bewust GEEN kopie van .env.production. Hij heeft
# uitsluitend de minimale, niet-productie runtimeconfiguratie nodig. Daardoor
# kunnen Azure, mail, Sentry, AI, betaal- en overige integraties tijdens een
# proef geen extern effect hebben of productiegeheimen ontvangen.
docker image inspect "$API_IMAGE" >/dev/null 2>&1 || {
  echo "FOUT: herstel-API-image ontbreekt: $API_IMAGE"
  exit 1
}
cat > "$TMPD"/herstel.env <<EOF
NODE_ENV=production
PORT=8080
SESSION_SECRET=herstelproef-sessie-${RUN_ID}-alleen-lokaal
PUBLIEKE_APP_URL=http://127.0.0.1:8899
HERSTELPROEF=1
MAIL_ENABLED=false
SENTRY_DSN=
SENTRY_DSN_WEB=
AZURE_TENANT_ID=
AZURE_CLIENT_ID=
AZURE_CLIENT_SECRET=
OPENAI_API_KEY=
DATABASE_URL=postgresql://fps_app:herstelproef@${PFX}-db:5432/fps_production
S3_ENDPOINT=http://${PFX}-minio:9000
S3_PUBLIC_ENDPOINT=http://127.0.0.1:9899
S3_BUCKET=fps-production
S3_ACCESS_KEY_ID=fps_minio
S3_SECRET_ACCESS_KEY=herstelproefgeheim
S3_REGION=us-east-1
EOF
docker run -d --name "${PFX}-api" --network "$NET" -p 127.0.0.1:8899:8080 \
  --env-file "$TMPD"/herstel.env -e NODE_ENV=production -e PORT=8080 \
  "$API_IMAGE" >/dev/null
HEALTH_OK=0
for i in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:8899/api/healthz > "$TMPD"/health.json 2>/dev/null; then
    HEALTH_OK=1
    break
  fi
  sleep 2
done
[ "$HEALTH_OK" -eq 1 ] || {
  echo "FOUT: herstel-API gaf binnen 120 seconden geen gezonde /api/healthz"
  exit 1
}
HEALTH=$(cat "$TMPD"/health.json)
python3 - "$TMPD"/health.json <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as bestand:
    status = json.load(bestand)
if status.get("status") != "ok":
    raise SystemExit("FOUT: herstel-API healthz bevat geen status=ok")
PY
stap "healthz: $HEALTH"

stap "proefaccount inloggen op de herstelde applicatie (incl. 2FA)"
docker exec "${PFX}-db" psql -q -U fps_app -d fps_production -c "
  INSERT INTO gebruikers (naam, email, rol, wachtwoord, actief)
  VALUES ('Herstelproef', 'herstelproef@fps-one.nl', 'hoofdbeheerder', '\$2b\$10\$qWiIJg7YfoK8ihX4WbMUJO6v8vcCueRfuQNINGaghy5Ef2/KOj646', true)"
LOGIN=$(curl -s -D "$TMPD"/headers.txt -o "$TMPD"/login.json -w "%{http_code}" \
  -H "X-Forwarded-Proto: https" -X POST http://127.0.0.1:8899/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"herstelproef@fps-one.nl","wachtwoord":"HerstelProef!2026"}')
[ "$LOGIN" = "200" ] || {
  echo "FOUT: login stap 1 gaf HTTP $LOGIN: $(cat "$TMPD"/login.json)"
  exit 1
}
# Secure-cookie komt over http niet in een curl-jar; handmatig meenemen
COOKIE=$(awk '
  BEGIN { IGNORECASE=1 }
  /^set-cookie:/ {
    sub(/^[^:]*:[[:space:]]*/, "")
    sub(/;.*/, "")
    print
    exit
  }
' "$TMPD"/headers.txt) || true
[ -n "$COOKIE" ] || {
  echo "FOUT: login stap 1 gaf geen sessiecookie"
  exit 1
}
stap "login stap 1: HTTP $LOGIN ($(cat "$TMPD"/login.json))"
SECRET=$(curl -s -H "X-Forwarded-Proto: https" -H "Cookie: $COOKIE" -X POST \
  http://127.0.0.1:8899/api/auth/2fa/setup | python3 -c "import sys,json;print(json.load(sys.stdin)['secret'])")
CODE=$(python3 "$TMPD"/totp.py "$SECRET")
# NB: curl eindigt op deze call soms met exit 23 (afgekapte body) terwijl de
# server 200 geeft en de sessie geldig is; daarom niet op curl-exit vertrouwen.
TFA=$(curl -s -o "$TMPD"/act.json -w "%{http_code}" -H "X-Forwarded-Proto: https" -H "Cookie: $COOKIE" \
  -X POST http://127.0.0.1:8899/api/auth/2fa/activeren -H "Content-Type: application/json" \
  -d "{\"code\":\"$CODE\"}") || true
[ "$TFA" = "200" ] || { echo "FOUT: 2FA-activeren gaf HTTP $TFA: $(cat "$TMPD"/act.json)"; exit 1; }
stap "login stap 2 (2FA-activeren): HTTP $TFA"

stap "document openen uit de herstelde bestandsopslag"
DOCPAD=$(docker exec "${PFX}-db" psql -U fps_app -d fps_production -Atc \
  "SELECT pdf_url FROM documenten WHERE pdf_url IS NOT NULL LIMIT 1")
case "$DOCPAD" in
  /objects/*) ;;
  *) echo "FOUT: herstelde database bevat geen geldig documentpad onder /objects/"; exit 1 ;;
esac
SET_DOCUMENT="$SET/bestanden/fps-production${DOCPAD#/objects}"
[ -f "$SET_DOCUMENT" ] || {
  echo "FOUT: document uit herstelde database ontbreekt in de herstelset"
  exit 1
}
echo "documentpad uit herstelde DB: $DOCPAD"
DOC=$(curl -s -H "X-Forwarded-Proto: https" -H "Cookie: $COOKIE" -o "$TMPD"/doc.bin \
  -w "%{http_code}" "http://127.0.0.1:8899/api/storage$DOCPAD")
[ "$DOC" = "200" ] || {
  echo "FOUT: document ophalen gaf HTTP $DOC"
  exit 1
}
BYTES=$(stat -c %s "$TMPD"/doc.bin)
[ "$BYTES" -gt 0 ] || { echo "FOUT: hersteld document is leeg"; exit 1; }
KOP=$(head -c 5 "$TMPD"/doc.bin)
[ "$KOP" = "%PDF-" ] || {
  echo "FOUT: hersteld document begint niet met een PDF-header"
  exit 1
}
stap "document: HTTP $DOC, $BYTES bytes, begint met: $KOP"
SUM_APP=$(sha256sum "$TMPD"/doc.bin | cut -d" " -f1)
SUM_SET=$(sha256sum "$SET_DOCUMENT" | cut -d" " -f1)
[ "$SUM_APP" = "$SUM_SET" ] || {
  echo "FOUT: checksum document wijkt af van de herstelset"
  exit 1
}
CHECK="IDENTIEK"
stap "checksum document vs back-upset: $CHECK"

T=$(( $(date +%s) - T0 ))
echo ""
echo "HERSTELPROEF KLAAR in ${T}s — set: $SET ($(du -sh "$SET" | cut -f1))"
echo "gebruikers=$RIJEN objecten=$OBJ healthz=$HEALTH login=$LOGIN 2fa=$TFA document=$DOC/${BYTES}b checksum=$CHECK"
