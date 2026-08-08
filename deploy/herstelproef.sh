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
SET="/srv/fps-backup/dagelijks/$(ls -1 /srv/fps-backup/dagelijks | sort | tail -1)"
NET=fps-herstel
PFX=herstel
T0=$(date +%s)
stap() { echo "== [$(( $(date +%s) - T0 ))s] $*"; }

# gevoelige tijdelijke bestanden: root-only (0700) en altijd opruimen
TMPD=$(mktemp -d /tmp/herstelproef.XXXXXX)
chmod 0700 "$TMPD"

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
  docker rm -f ${PFX}-api ${PFX}-minio ${PFX}-db >/dev/null 2>&1 || true
  docker network rm $NET >/dev/null 2>&1 || true
  rm -rf "$TMPD"
}
if [ -n "${KEEP:-}" ]; then
  trap 'rm -rf "$TMPD"' EXIT   # geheimen ruimen we ALTIJD op, ook met KEEP=1
else
  trap opruimen EXIT
fi
docker rm -f ${PFX}-api ${PFX}-minio ${PFX}-db >/dev/null 2>&1 || true
docker network rm $NET >/dev/null 2>&1 || true

stap "lege omgeving aanmaken (netwerk + verse db + verse minio) — set: $SET"
docker network create $NET >/dev/null
docker run -d --name ${PFX}-db --network $NET \
  -e POSTGRES_USER=fps_app -e POSTGRES_PASSWORD=herstelproef -e POSTGRES_DB=fps_production \
  postgres:16-alpine >/dev/null
docker run -d --name ${PFX}-minio --network $NET \
  -e MINIO_ROOT_USER=fps_minio -e MINIO_ROOT_PASSWORD=herstelproefgeheim \
  minio/minio server /data >/dev/null
# wachten tot de db ECHT klaar is (init herstart postgres; pg_isready is te vroeg true)
for i in $(seq 1 60); do
  docker exec ${PFX}-db psql -U fps_app -d fps_production -Atc "SELECT 1" >/dev/null 2>&1 && sleep 2 && \
  docker exec ${PFX}-db psql -U fps_app -d fps_production -Atc "SELECT 1" >/dev/null 2>&1 && break
  sleep 1
done

# database-dump: gewoon gz, of age-versleuteld (dan is René's privésleutel nodig)
if [ -f "$SET/db.sql.gz" ]; then
  stap "database terugzetten uit $SET/db.sql.gz"
  gunzip -c "$SET/db.sql.gz" | docker exec -i ${PFX}-db psql -q -U fps_app -d fps_production >/dev/null
elif [ -f "$SET/db.sql.gz.age" ]; then
  if [ -z "${AGE_KEY_FILE:-}" ] || [ ! -f "${AGE_KEY_FILE:-}" ]; then
    echo "FOUT: de set is versleuteld (db.sql.gz.age). Start met AGE_KEY_FILE=/pad/naar/age-privesleutel"
    echo "      (de privésleutel ligt bij René, bewust NIET op deze server)."
    exit 1
  fi
  stap "database terugzetten uit $SET/db.sql.gz.age (age-ontsleuteling)"
  age -d -i "$AGE_KEY_FILE" < "$SET/db.sql.gz.age" | gunzip -c \
    | docker exec -i ${PFX}-db psql -q -U fps_app -d fps_production >/dev/null
else
  echo "FOUT: geen db.sql.gz of db.sql.gz.age in $SET"; exit 1
fi
RIJEN=$(docker exec ${PFX}-db psql -U fps_app -d fps_production -Atc "SELECT count(*) FROM gebruikers")
stap "database hersteld: $RIJEN gebruikers"

stap "bestanden terugzetten naar verse MinIO"
docker run --rm --network $NET -v "$SET/bestanden/fps-production:/restore:ro" \
  --entrypoint /bin/sh minio/mc:latest -c "
  mc alias set h http://${PFX}-minio:9000 fps_minio herstelproefgeheim &&
  mc mb h/fps-production &&
  mc mirror /restore h/fps-production" >/dev/null
OBJ=$(docker run --rm --network $NET --entrypoint /bin/sh minio/mc:latest -c "
  mc alias set h http://${PFX}-minio:9000 fps_minio herstelproefgeheim >/dev/null &&
  mc ls -r h/fps-production | wc -l")
stap "objectopslag hersteld: $OBJ objecten"

stap "applicatie starten tegen de herstelde omgeving"
grep -vE "^(DATABASE_URL|POSTGRES_|S3_|PG)" /opt/fps-one/deploy/.env.production > "$TMPD"/herstel.env
cat >> "$TMPD"/herstel.env <<EOF
DATABASE_URL=postgresql://fps_app:herstelproef@${PFX}-db:5432/fps_production
S3_ENDPOINT=http://${PFX}-minio:9000
S3_PUBLIC_ENDPOINT=http://127.0.0.1:9899
S3_BUCKET=fps-production
S3_ACCESS_KEY_ID=fps_minio
S3_SECRET_ACCESS_KEY=herstelproefgeheim
S3_REGION=us-east-1
EOF
docker run -d --name ${PFX}-api --network $NET -p 127.0.0.1:8899:8080 \
  --env-file "$TMPD"/herstel.env -e NODE_ENV=production -e PORT=8080 \
  deploy-api:latest >/dev/null
for i in $(seq 1 60); do
  curl -sf http://127.0.0.1:8899/api/healthz >/dev/null 2>&1 && break; sleep 2
done
HEALTH=$(curl -s http://127.0.0.1:8899/api/healthz)
stap "healthz: $HEALTH"

stap "proefaccount inloggen op de herstelde applicatie (incl. 2FA)"
docker exec ${PFX}-db psql -q -U fps_app -d fps_production -c "
  INSERT INTO gebruikers (naam, email, rol, wachtwoord, actief)
  VALUES ('Herstelproef', 'herstelproef@fps-one.nl', 'hoofdbeheerder', '\$2b\$10\$qWiIJg7YfoK8ihX4WbMUJO6v8vcCueRfuQNINGaghy5Ef2/KOj646', true)"
LOGIN=$(curl -s -D "$TMPD"/headers.txt -o "$TMPD"/login.json -w "%{http_code}" \
  -H "X-Forwarded-Proto: https" -X POST http://127.0.0.1:8899/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"herstelproef@fps-one.nl","wachtwoord":"HerstelProef!2026"}')
# Secure-cookie komt over http niet in een curl-jar; handmatig meenemen
COOKIE=$(grep -i "set-cookie" "$TMPD"/headers.txt | head -1 | sed "s/^[Ss]et-[Cc]ookie: //" | cut -d";" -f1) || true
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
DOCPAD=$(docker exec ${PFX}-db psql -U fps_app -d fps_production -Atc \
  "SELECT pdf_url FROM documenten WHERE pdf_url IS NOT NULL LIMIT 1")
echo "documentpad uit herstelde DB: $DOCPAD"
DOC=$(curl -s -H "X-Forwarded-Proto: https" -H "Cookie: $COOKIE" -o "$TMPD"/doc.bin \
  -w "%{http_code}" "http://127.0.0.1:8899/api/storage$DOCPAD")
BYTES=$(stat -c %s "$TMPD"/doc.bin)
KOP=$(head -c 5 "$TMPD"/doc.bin)
stap "document: HTTP $DOC, $BYTES bytes, begint met: $KOP"
SUM_APP=$(sha256sum "$TMPD"/doc.bin | cut -d" " -f1)
SUM_SET=$(sha256sum "$SET/bestanden/fps-production${DOCPAD#/objects}" | cut -d" " -f1)
if [ "$SUM_APP" = "$SUM_SET" ]; then CHECK="IDENTIEK"; else CHECK="AFWIJKEND ($SUM_APP vs $SUM_SET)"; fi
stap "checksum document vs back-upset: $CHECK"

T=$(( $(date +%s) - T0 ))
echo ""
echo "HERSTELPROEF KLAAR in ${T}s — set: $SET ($(du -sh "$SET" | cut -f1))"
echo "gebruikers=$RIJEN objecten=$OBJ healthz=$HEALTH login=$LOGIN 2fa=$TFA document=$DOC/${BYTES}b checksum=$CHECK"
