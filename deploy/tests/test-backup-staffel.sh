#!/bin/bash
# Geïsoleerde regressieproeven voor backup-staffel.sh en check-offsite-backup.sh.
# Gebruikt alleen tijdelijke mappen en fake rsync/Graph-programma's; Docker,
# productie, Azure en /srv/fps-backup worden nooit benaderd.
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEST_ROOT=$(mktemp -d /tmp/fps-backup-staffel-test.XXXXXX)
trap 'rm -rf "$TEST_ROOT"' EXIT

VANDAAG=$(date +%F)
GISTEREN=$(date -d yesterday +%F)
TEST_TELLER=0

log_ok() {
  TEST_TELLER=$((TEST_TELLER + 1))
  echo "ok $TEST_TELLER - $1"
}

faal() {
  echo "NIET OK: $*" >&2
  exit 1
}

assert_gelijk() {
  local verwacht="$1" werkelijk="$2" toelichting="$3"
  [ "$verwacht" = "$werkelijk" ] || \
    faal "$toelichting (verwacht '$verwacht', kreeg '$werkelijk')"
}

assert_bestaat() {
  [ -e "$1" ] || faal "ontbreekt: $1"
}

assert_niet_bestaat() {
  [ ! -e "$1" ] || faal "had niet mogen bestaan: $1"
}

maak_fixture() {
  local naam="$1"
  FIXTURE="$TEST_ROOT/$naam"
  DEPLOY="$FIXTURE/deploy"
  DOEL="$FIXTURE/doel"
  BIN="$FIXTURE/bin"
  ALERT_LOG="$FIXTURE/alerts.log"
  mkdir -p "$DEPLOY/db-backups" "$DEPLOY/minio-backups/fps-production/docs" "$DOEL" "$BIN"

  printf 'CREATE TABLE backup_test(id integer);\n' \
    | gzip > "$DEPLOY/db-backups/fps_oud.sql.gz"
  sleep 0.02
  printf 'CREATE TABLE backup_test(id integer); INSERT INTO backup_test VALUES (1);\n' \
    | gzip > "$DEPLOY/db-backups/fps_nieuw.sql.gz"
  printf 'testdocument\n' > "$DEPLOY/minio-backups/fps-production/docs/test.pdf"
  printf 'services: {}\n' > "$DEPLOY/docker-compose.production.yml"
  printf 'DATABASE_URL=mag-niet-lekken\nAZURE_CLIENT_SECRET=ook-niet-lekken\n' \
    > "$DEPLOY/.env.production"

  cat > "$BIN/rsync" <<'SH'
#!/bin/bash
set -euo pipefail
if [ "${FAKE_RSYNC_FAIL:-0}" = "1" ]; then
  exit 23
fi
if [ -n "${FAKE_RSYNC_WACHT_MARKER:-}" ]; then
  : > "$FAKE_RSYNC_WACHT_MARKER"
  while [ ! -e "${FAKE_RSYNC_VRIJGAVE:?}" ]; do sleep 0.05; done
fi
argumenten=("$@")
bron="${argumenten[${#argumenten[@]}-2]}"
doel="${argumenten[${#argumenten[@]}-1]}"
mkdir -p "$doel"
cp -a "${bron%/}/." "$doel/"
SH
  cat > "$BIN/backup-alert" <<'SH'
#!/bin/bash
set -euo pipefail
if [ "${FAKE_ALERT_FAIL:-0}" = "1" ]; then
  exit 9
fi
printf '%s\t%s\n' "$1" "${2%%$'\n'*}" >> "${ALERT_LOG:?}"
SH
  # Als de productiescripts per ongeluk nog head gebruiken, maakt deze fake de
  # oorspronkelijke exit-141-regressie direct zichtbaar.
  cat > "$BIN/head" <<'SH'
#!/bin/bash
exit 141
SH
  chmod +x "$BIN/rsync" "$BIN/backup-alert" "$BIN/head"
}

voer_staffel_uit() {
  local datum="$1"
  shift
  env \
    PATH="$BIN:$PATH" \
    ALERT_LOG="$ALERT_LOG" \
    BACKUP_DEPLOY_DIR="$DEPLOY" \
    BACKUP_DOEL="$DOEL" \
    BACKUP_DATUM="$datum" \
    BACKUP_TEST_MODE=1 \
    BACKUP_ALERT_COMMAND="$BIN/backup-alert" \
    BACKUP_MIGRATIESTAND_COMMAND="printf '0001_test | 2026-08-20\n'" \
    "$@" \
    bash "$ROOT/deploy/backup-staffel.sh"
}

voer_bewaker_uit() {
  local -a extra=("$@")
  env \
    PATH="$BIN:$PATH" \
    ALERT_LOG="$ALERT_LOG" \
    BACKUP_DEPLOY_DIR="$DEPLOY" \
    BACKUP_DOEL="$DOEL" \
    BACKUP_DATUM="$VANDAAG" \
    BACKUP_TEST_MODE=1 \
    BACKUP_ALERT_COMMAND="$BIN/backup-alert" \
    BACKUP_SKIP_INAPP=1 \
    BACKUP_SKIP_NAS_CHECK=1 \
    "${extra[@]}" \
    bash "$ROOT/deploy/check-offsite-backup.sh"
}

json_veld() {
  node -e '
    const fs = require("node:fs");
    const data = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const value = process.argv[2].split(".").reduce((cursor, key) => cursor?.[key], data);
    process.stdout.write(value === null ? "null" : String(value ?? ""));
  ' "$1" "$2"
}

# 1. Veel dumps + een head die altijd 141 geeft: selectie blijft slagen.
maak_fixture "succes-zonder-sigpipe"
voer_staffel_uit "$VANDAAG" > "$FIXTURE/uitvoer.log"
SET="$DOEL/dagelijks/$VANDAAG"
assert_bestaat "$SET/db.sql.gz"
assert_bestaat "$SET/bestanden/fps-production/docs/test.pdf"
assert_bestaat "$SET/manifest.json"
assert_bestaat "$SET/sha256sums.txt"
(cd "$SET" && sha256sum -c --quiet sha256sums.txt)
assert_gelijk "geslaagd" "$(json_veld "$DOEL/status.json" uitkomst)" "successtatus"
assert_gelijk "fps_nieuw.sql.gz" "$(json_veld "$SET/manifest.json" database.bron)" "nieuwste dump"
if grep -R -q -E 'mag-niet-lekken|ook-niet-lekken' "$DOEL"; then
  faal "een envwaarde is in de back-upset beland"
fi
log_ok "bronselectie gebruikt geen vroeg afgeknotte pipe en volledige set is controleerbaar"

# 2. Fout tijdens de nieuwe run: originele 23, atomaire foutstatus, directe
# Graph-mail en de vorige volledige set byte-identiek behouden.
maak_fixture "fout-behoudt-vorige"
voer_staffel_uit "$GISTEREN" >/dev/null
VORIGE_SET="$DOEL/dagelijks/$GISTEREN"
VOOR_HASH=$(tar -C "$VORIGE_SET" -cf - . | sha256sum | cut -d' ' -f1)
set +e
voer_staffel_uit "$VANDAAG" FAKE_RSYNC_FAIL=1 > "$FIXTURE/fout.log" 2>&1
RC=$?
set -e
assert_gelijk "23" "$RC" "originele rsync-exitcode"
assert_gelijk "fout" "$(json_veld "$DOEL/status.json" uitkomst)" "foutstatus"
assert_gelijk "23" "$(json_veld "$DOEL/status.json" exit_code)" "exitcode in status"
assert_gelijk "dagelijks/$GISTEREN" "$(json_veld "$DOEL/status.json" laatste_geslaagde_set)" "vorige successet"
assert_niet_bestaat "$DOEL/dagelijks/$VANDAAG"
NA_HASH=$(tar -C "$VORIGE_SET" -cf - . | sha256sum | cut -d' ' -f1)
assert_gelijk "$VOOR_HASH" "$NA_HASH" "vorige set bleef byte-identiek"
assert_gelijk "1" "$(wc -l < "$ALERT_LOG" | tr -d ' ')" "exact één directe faalmail"
if find "$DOEL/dagelijks" -maxdepth 1 -type d -name ".${VANDAAG}.tmp.*" -print -quit | grep -q .; then
  faal "tijdelijke dagset bleef na fout achter"
fi
node -e 'JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"))' "$DOEL/status.json"
log_ok "foutstatus is atomair, exitcode blijft 23 en vorige set blijft intact"

# 3. SIGTERM wordt als 143 + TERM vastgelegd, staging wordt opgeruimd en ook
# dit pad verstuurt precies één directe faalmail.
maak_fixture "signaalstatus"
WACHT_MARKER="$FIXTURE/rsync-wacht"
VRIJGAVE="$FIXTURE/rsync-vrijgave"
env \
  PATH="$BIN:$PATH" \
  ALERT_LOG="$ALERT_LOG" \
  BACKUP_DEPLOY_DIR="$DEPLOY" \
  BACKUP_DOEL="$DOEL" \
  BACKUP_DATUM="$VANDAAG" \
  BACKUP_TEST_MODE=1 \
  BACKUP_ALERT_COMMAND="$BIN/backup-alert" \
  BACKUP_MIGRATIESTAND_COMMAND="printf ok" \
  FAKE_RSYNC_WACHT_MARKER="$WACHT_MARKER" \
  FAKE_RSYNC_VRIJGAVE="$VRIJGAVE" \
  bash "$ROOT/deploy/backup-staffel.sh" > "$FIXTURE/signaal.log" 2>&1 &
PID=$!
for _ in $(seq 1 100); do
  [ -e "$WACHT_MARKER" ] && break
  sleep 0.05
done
assert_bestaat "$WACHT_MARKER"
kill -TERM "$PID"
# Bash verwerkt een trap pas nadat het huidige voorgrondcommando terugkeert.
# Laat de fake rsync daarom uit zijn wachtlus komen; de reeds ontvangen TERM
# wordt daarna door backup-staffel.sh als 143 afgehandeld.
: > "$VRIJGAVE"
set +e
wait "$PID"
RC=$?
set -e
assert_gelijk "143" "$RC" "SIGTERM-exitcode"
assert_gelijk "TERM" "$(json_veld "$DOEL/status.json" signaal)" "signaal in status"
assert_gelijk "143" "$(json_veld "$DOEL/status.json" exit_code)" "signaalexitcode in status"
assert_niet_bestaat "$DOEL/dagelijks/$VANDAAG"
assert_gelijk "1" "$(wc -l < "$ALERT_LOG" | tr -d ' ')" "exact één signaalmail"
log_ok "SIGTERM schrijft geldige status en ruimt de onvolledige set op"

# 4. Een oude successet geeft ondanks twee controles maar één dagelijkse
# Graph-herinnering. De bewaker mag daarbij geen productie/Docker raken.
maak_fixture "herinnering-dedupe"
voer_staffel_uit "$GISTEREN" >/dev/null
STATUS_PAD="$DOEL/status.json"
node - "$STATUS_PAD" <<'NODE'
const fs = require("node:fs");
const pad = process.argv[2];
const status = JSON.parse(fs.readFileSync(pad, "utf8"));
status.uitkomst = "fout";
status.detail = "testfout";
status.laatste_run = new Date().toISOString();
status.laatste_geslaagde_run = new Date(Date.now() - 30 * 3600_000).toISOString();
fs.writeFileSync(pad, `${JSON.stringify(status, null, 2)}\n`);
NODE
set +e
voer_bewaker_uit > "$FIXTURE/bewaker-1.log" 2>&1
RC1=$?
voer_bewaker_uit > "$FIXTURE/bewaker-2.log" 2>&1
RC2=$?
set -e
assert_gelijk "1" "$RC1" "eerste ongezonde controle"
assert_gelijk "1" "$RC2" "tweede ongezonde controle"
assert_gelijk "1" "$(wc -l < "$ALERT_LOG" | tr -d ' ')" "één herinnering per dag"
assert_bestaat "$DOEL/.alarmstatus/staffel-herinnering-$VANDAAG"
log_ok "oude successet geeft hoogstens één Graph-herinnering per kalenderdag"

# 5. Een fout na een nog verse successet blijft een in-app/logalarm, maar geeft
# geen voortijdige Graph-herinnering.
maak_fixture "verse-succes-geen-herinnering"
voer_staffel_uit "$VANDAAG" >/dev/null
node - "$DOEL/status.json" <<'NODE'
const fs = require("node:fs");
const pad = process.argv[2];
const status = JSON.parse(fs.readFileSync(pad, "utf8"));
status.uitkomst = "fout";
status.detail = "latere testfout";
status.laatste_run = new Date().toISOString();
fs.writeFileSync(pad, `${JSON.stringify(status, null, 2)}\n`);
NODE
set +e
voer_bewaker_uit > "$FIXTURE/vers.log" 2>&1
RC=$?
set -e
assert_gelijk "1" "$RC" "fout blijft zichtbaar"
assert_niet_bestaat "$ALERT_LOG"
log_ok "verse successet onderdrukt de dagelijkse Graph-herinnering"

# 6. Een mislukte Graph-poging zet geen verzonden-marker, maar blijft wel
# atomair zichtbaar als mislukte dag. Een volgende controle mag opnieuw
# proberen en markeert pas na een werkelijk geslaagde verzending.
maak_fixture "herinnering-retry-na-mailfout"
voer_staffel_uit "$GISTEREN" >/dev/null
node - "$DOEL/status.json" <<'NODE'
const fs = require("node:fs");
const pad = process.argv[2];
const status = JSON.parse(fs.readFileSync(pad, "utf8"));
status.uitkomst = "fout";
status.detail = "testfout";
status.laatste_run = new Date().toISOString();
status.laatste_geslaagde_run = new Date(Date.now() - 30 * 3600_000).toISOString();
fs.writeFileSync(pad, `${JSON.stringify(status, null, 2)}\n`);
NODE
set +e
voer_bewaker_uit FAKE_ALERT_FAIL=1 > "$FIXTURE/mailfout.log" 2>&1
RC1=$?
set -e
assert_gelijk "1" "$RC1" "bewaker blijft ongezond bij mailfout"
assert_niet_bestaat "$DOEL/.alarmstatus/staffel-herinnering-$VANDAAG"
DAGSTATUS="$DOEL/.alarmstatus/staffel-herinnering-status-$VANDAAG.json"
assert_bestaat "$DAGSTATUS"
assert_gelijk "mislukt" "$(json_veld "$DAGSTATUS" uitkomst)" "mislukte Graph-dag blijft zichtbaar"
assert_gelijk "1" "$(json_veld "$DAGSTATUS" pogingen)" "eerste mislukte Graph-poging geregistreerd"
set +e
voer_bewaker_uit FAKE_ALERT_FAIL=1 > "$FIXTURE/mailfout-2.log" 2>&1
RC2=$?
set -e
assert_gelijk "1" "$RC2" "bewaker blijft ongezond bij tweede mailfout"
assert_niet_bestaat "$DOEL/.alarmstatus/staffel-herinnering-$VANDAAG"
assert_gelijk "2" "$(json_veld "$DAGSTATUS" pogingen)" "tweede mislukte Graph-poging geregistreerd"
set +e
voer_bewaker_uit > "$FIXTURE/mailherstel.log" 2>&1
RC3=$?
set -e
assert_gelijk "1" "$RC3" "bewaker blijft ongezond na mailherstel"
assert_gelijk "1" "$(wc -l < "$ALERT_LOG" | tr -d ' ')" "één geslaagde herinnering"
assert_bestaat "$DOEL/.alarmstatus/staffel-herinnering-$VANDAAG"
assert_gelijk "geslaagd" "$(json_veld "$DAGSTATUS" uitkomst)" "alleen echte mail-success sluit de dag succesvol af"
set +e
voer_bewaker_uit > "$FIXTURE/mail-na-succes.log" 2>&1
RC4=$?
set -e
assert_gelijk "1" "$RC4" "bewaker blijft ongezond na succesvolle herinnering"
assert_gelijk "1" "$(wc -l < "$ALERT_LOG" | tr -d ' ')" "geen tweede geslaagde herinnering op dezelfde dag"
log_ok "mislukte Graph-dag blijft zichtbaar en pas één echte verzending sluit de dag succesvol af"

# 7. Als het proces crasht nadat Graph succes meldde maar vóór de successtatus,
# blijft de dag onzeker en wordt niet blind opnieuw verzonden.
maak_fixture "herinnering-crash-na-graph-succes"
voer_staffel_uit "$GISTEREN" >/dev/null
node - "$DOEL/status.json" <<'NODE'
const fs = require("node:fs");
const pad = process.argv[2];
const status = JSON.parse(fs.readFileSync(pad, "utf8"));
status.uitkomst = "fout";
status.detail = "testfout";
status.laatste_run = new Date().toISOString();
status.laatste_geslaagde_run = new Date(Date.now() - 30 * 3600_000).toISOString();
fs.writeFileSync(pad, `${JSON.stringify(status, null, 2)}\n`);
NODE
set +e
voer_bewaker_uit BACKUP_TEST_CRASH_NA_GRAPH_SUCCES=1 > "$FIXTURE/crash.log" 2>&1
RC1=$?
set -e
assert_gelijk "137" "$RC1" "testproces is na Graph-succes hard gestopt"
assert_gelijk "1" "$(wc -l < "$ALERT_LOG" | tr -d ' ')" "Graph kreeg vóór de crash precies één bericht"
DAGSTATUS="$DOEL/.alarmstatus/staffel-herinnering-status-$VANDAAG.json"
assert_gelijk "bezig" "$(json_veld "$DAGSTATUS" uitkomst)" "onafgeronde poging bleef vooraf duurzaam geregistreerd"
set +e
voer_bewaker_uit > "$FIXTURE/na-crash.log" 2>&1
RC2=$?
voer_bewaker_uit > "$FIXTURE/na-crash-2.log" 2>&1
RC3=$?
set -e
assert_gelijk "1" "$RC2" "eerste controle na crash blijft ongezond"
assert_gelijk "1" "$RC3" "tweede controle na crash blijft ongezond"
assert_gelijk "1" "$(wc -l < "$ALERT_LOG" | tr -d ' ')" "onzekere poging wordt niet dubbel verzonden"
assert_niet_bestaat "$DOEL/.alarmstatus/staffel-herinnering-$VANDAAG"
assert_gelijk "onzeker" "$(json_veld "$DAGSTATUS" uitkomst)" "crashdag wordt niet vals als geslaagd gemarkeerd"
log_ok "crash na Graph-succes blijft onzeker en veroorzaakt geen tweede verzending"

# 8. Transportverlies nadat Graph het bericht mogelijk accepteerde is onzeker,
# niet retrybaar en nooit vals geslaagd.
maak_fixture "herinnering-onzekere-transportuitkomst"
voer_staffel_uit "$GISTEREN" >/dev/null
node - "$DOEL/status.json" <<'NODE'
const fs = require("node:fs");
const pad = process.argv[2];
const status = JSON.parse(fs.readFileSync(pad, "utf8"));
status.uitkomst = "fout";
status.detail = "testfout";
status.laatste_run = new Date().toISOString();
status.laatste_geslaagde_run = new Date(Date.now() - 30 * 3600_000).toISOString();
fs.writeFileSync(pad, `${JSON.stringify(status, null, 2)}\n`);
NODE
cat > "$BIN/docker" <<'SH'
#!/bin/bash
printf 'mogelijk-geaccepteerd\n' >> "${ALERT_LOG:?}"
# Bewust dezelfde numerieke exitcode als een bekende Node/Graph-afwijzing.
# Zonder geldige sentinel moet dit altijd als Docker-transportverlies gelden.
exit 5
SH
chmod +x "$BIN/docker"
set +e
voer_bewaker_uit BACKUP_ALERT_COMMAND= > "$FIXTURE/onzeker.log" 2>&1
RC1=$?
voer_bewaker_uit BACKUP_ALERT_COMMAND= > "$FIXTURE/onzeker-2.log" 2>&1
RC2=$?
set -e
assert_gelijk "1" "$RC1" "bewaker blijft ongezond bij onzekere Graph-uitkomst"
assert_gelijk "1" "$RC2" "volgende controle blijft ongezond zonder retry"
assert_gelijk "1" "$(wc -l < "$ALERT_LOG" | tr -d ' ')" "mogelijk geaccepteerde mail wordt niet dubbel verzonden"
DAGSTATUS="$DOEL/.alarmstatus/staffel-herinnering-status-$VANDAAG.json"
assert_gelijk "onzeker" "$(json_veld "$DAGSTATUS" uitkomst)" "transportverlies blijft eerlijk onzeker"
assert_gelijk "5" "$(json_veld "$DAGSTATUS" exit_code)" "onzekere overlappende transportexitcode blijft zichtbaar"
assert_niet_bestaat "$DOEL/.alarmstatus/staffel-herinnering-$VANDAAG"
log_ok "onzekere Graph-transportuitkomst veroorzaakt geen retry of valse successtatus"

# 9. Een corrupte set wordt door herstelproef.sh geweigerd vóór ook maar één
# Docker-/containerhandeling kan starten.
maak_fixture "herstel-weigert-corrupt"
voer_staffel_uit "$VANDAAG" >/dev/null
SET="$DOEL/dagelijks/$VANDAAG"
printf 'corruptie\n' >> "$SET/manifest.json"
DOCKER_CALLED="$FIXTURE/docker-called"
cat > "$BIN/docker" <<'SH'
#!/bin/bash
: > "${DOCKER_CALLED:?}"
exit 99
SH
chmod +x "$BIN/docker"
set +e
env \
  PATH="$BIN:$PATH" \
  DOCKER_CALLED="$DOCKER_CALLED" \
  BACKUP_DOEL="$DOEL" \
  HERSTEL_SET="$SET" \
  bash "$ROOT/deploy/herstelproef.sh" > "$FIXTURE/herstel-corrupt.log" 2>&1
RC=$?
set -e
assert_gelijk "1" "$RC" "corrupte set blokkeert herstelproef"
assert_niet_bestaat "$DOCKER_CALLED"
log_ok "checksumfout blokkeert de herstelproef vóór Docker"

# 8. Het productie-bewijsscript accepteert geen symlink als dagset, ook niet
# wanneer status.json exact naar de verwachte datum wijst.
maak_fixture "bewijs-weigert-symlinkset"
BEWIJS_DIR="$FIXTURE/bewijs/deploy"
mkdir -p "$BEWIJS_DIR" "$DOEL/dagelijks" "$FIXTURE/buiten"
cp "$ROOT/deploy/backup-bewijs-productie.sh" "$BEWIJS_DIR/"
cp "$ROOT/deploy/backup-set-validatie.sh" "$BEWIJS_DIR/"
ln -s "$FIXTURE/buiten" "$DOEL/dagelijks/$VANDAAG"
cat > "$BEWIJS_DIR/backup-staffel.sh" <<'SH'
#!/bin/bash
set -euo pipefail
NU=$(date -u +%Y-%m-%dT%H:%M:%SZ)
cat > "${BACKUP_DOEL:?}/status.json" <<JSON
{
  "laatste_run": "$NU",
  "uitkomst": "geslaagd",
  "set": "dagelijks/${BACKUP_DATUM:?}",
  "laatste_geslaagde_run": "$NU",
  "laatste_geslaagde_set": "dagelijks/${BACKUP_DATUM:?}"
}
JSON
SH
cat > "$BEWIJS_DIR/herstelproef.sh" <<'SH'
#!/bin/bash
: > "${HERSTEL_CALLED:?}"
SH
chmod +x "$BEWIJS_DIR/backup-staffel.sh" "$BEWIJS_DIR/herstelproef.sh"
set +e
env \
  BACKUP_DOEL="$DOEL" \
  HERSTEL_CALLED="$FIXTURE/herstel-called" \
  bash "$BEWIJS_DIR/backup-bewijs-productie.sh" staffel_en_herstelproef \
  > "$FIXTURE/bewijs-symlink.log" 2>&1
RC=$?
set -e
assert_gelijk "1" "$RC" "symlinkset blokkeert productiebewijs"
assert_niet_bestaat "$FIXTURE/herstel-called"
log_ok "productiebewijs weigert een symlink als dagelijkse set"

# 9. Ook een inhoudelijk plausibele set met een oude status mag niet als bewijs
# voor de zojuist gestarte workflowrun dienen.
maak_fixture "bewijs-weigert-stale-status"
BEWIJS_DIR="$FIXTURE/bewijs/deploy"
mkdir -p "$BEWIJS_DIR" "$DOEL/dagelijks/$VANDAAG"
cp "$ROOT/deploy/backup-bewijs-productie.sh" "$BEWIJS_DIR/"
cp "$ROOT/deploy/backup-set-validatie.sh" "$BEWIJS_DIR/"
cat > "$BEWIJS_DIR/backup-staffel.sh" <<'SH'
#!/bin/bash
set -euo pipefail
OUDE_RUN="2000-01-01T00:00:00Z"
cat > "${BACKUP_DOEL:?}/status.json" <<JSON
{
  "laatste_run": "$OUDE_RUN",
  "uitkomst": "geslaagd",
  "set": "dagelijks/${BACKUP_DATUM:?}",
  "laatste_geslaagde_run": "$OUDE_RUN",
  "laatste_geslaagde_set": "dagelijks/${BACKUP_DATUM:?}"
}
JSON
SH
cp "$BEWIJS_DIR/backup-staffel.sh" "$BEWIJS_DIR/herstelproef.sh"
chmod +x "$BEWIJS_DIR/backup-staffel.sh" "$BEWIJS_DIR/herstelproef.sh"
set +e
env BACKUP_DOEL="$DOEL" \
  bash "$BEWIJS_DIR/backup-bewijs-productie.sh" alleen_staffel \
  > "$FIXTURE/bewijs-stale.log" 2>&1
RC=$?
set -e
assert_gelijk "1" "$RC" "stale status blokkeert productiebewijs"
log_ok "productiebewijs weigert status van vóór de huidige run"

# 10. Een symlink in de MinIO-bron mag nooit in een gepubliceerde set komen.
maak_fixture "staffel-weigert-symlink-inhoud"
ln -s /etc/hosts "$DEPLOY/minio-backups/fps-production/docs/buiten-set"
set +e
voer_staffel_uit "$VANDAAG" > "$FIXTURE/staffel-symlink.log" 2>&1
RC=$?
set -e
assert_gelijk "1" "$RC" "symlinkbron blokkeert staffel"
assert_niet_bestaat "$DOEL/dagelijks/$VANDAAG"
node - "$DOEL/status.json" <<'NODE'
const fs = require("node:fs");
const status = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (status.uitkomst !== "fout") throw new Error("symlinkfout ontbreekt in status");
NODE
log_ok "staffel publiceert geen set met een symlink in de inhoud"

# 11. Ook een handmatige herstelproef weigert een na publicatie toegevoegde
# symlink vóór Docker, zelfs wanneer die niet in de checksumlijst staat.
maak_fixture "herstel-weigert-symlink-inhoud"
voer_staffel_uit "$VANDAAG" >/dev/null
SET="$DOEL/dagelijks/$VANDAAG"
ln -s /etc/hosts "$SET/bestanden/fps-production/docs/buiten-set"
DOCKER_CALLED="$FIXTURE/docker-called"
cat > "$BIN/docker" <<'SH'
#!/bin/bash
: > "${DOCKER_CALLED:?}"
exit 99
SH
chmod +x "$BIN/docker"
set +e
env \
  PATH="$BIN:$PATH" \
  DOCKER_CALLED="$DOCKER_CALLED" \
  BACKUP_DOEL="$DOEL" \
  HERSTEL_SET="$SET" \
  bash "$ROOT/deploy/herstelproef.sh" > "$FIXTURE/herstel-symlink.log" 2>&1
RC=$?
set -e
assert_gelijk "1" "$RC" "symlinkinhoud blokkeert herstelproef"
assert_niet_bestaat "$DOCKER_CALLED"
log_ok "herstelproef weigert symlinks in de set vóór Docker"

# 12. Het Actions-bewijsscript voert dezelfde inhoudscontrole zelfstandig uit,
# ook wanneer een kwaadwillige/stub staffel een ogenschijnlijk verse status zet.
maak_fixture "bewijs-weigert-symlink-inhoud"
BEWIJS_DIR="$FIXTURE/bewijs/deploy"
mkdir -p "$BEWIJS_DIR"
cp "$ROOT/deploy/backup-bewijs-productie.sh" "$BEWIJS_DIR/"
cp "$ROOT/deploy/backup-set-validatie.sh" "$BEWIJS_DIR/"
cat > "$BEWIJS_DIR/backup-staffel.sh" <<'SH'
#!/bin/bash
set -euo pipefail
SET="${BACKUP_DOEL:?}/dagelijks/${BACKUP_DATUM:?}"
mkdir -p "$SET/bestanden/fps-production"
ln -s /etc/hosts "$SET/bestanden/fps-production/buiten-set"
NU=$(date -u +%Y-%m-%dT%H:%M:%SZ)
cat > "$BACKUP_DOEL/status.json" <<JSON
{
  "laatste_run": "$NU",
  "uitkomst": "geslaagd",
  "set": "dagelijks/$BACKUP_DATUM",
  "laatste_geslaagde_run": "$NU",
  "laatste_geslaagde_set": "dagelijks/$BACKUP_DATUM"
}
JSON
SH
cat > "$BEWIJS_DIR/herstelproef.sh" <<'SH'
#!/bin/bash
: > "${HERSTEL_CALLED:?}"
SH
chmod +x "$BEWIJS_DIR/backup-staffel.sh" "$BEWIJS_DIR/herstelproef.sh"
set +e
env \
  BACKUP_DOEL="$DOEL" \
  HERSTEL_CALLED="$FIXTURE/herstel-called" \
  bash "$BEWIJS_DIR/backup-bewijs-productie.sh" staffel_en_herstelproef \
  > "$FIXTURE/bewijs-inhoud-symlink.log" 2>&1
RC=$?
set -e
assert_gelijk "1" "$RC" "symlinkinhoud blokkeert productiebewijs"
assert_niet_bestaat "$FIXTURE/herstel-called"
log_ok "productiebewijs weigert zelfstandig symlinks in de setinhoud"

# 13. Een reeds bestaande symlink op de verwachte dagset mag niet als
# checksum-geldige set worden hergebruikt of als publicatiedoel dienen.
maak_fixture "staffel-weigert-bestaande-symlinkset"
voer_staffel_uit "$GISTEREN" >/dev/null
ln -s "$DOEL/dagelijks/$GISTEREN" "$DOEL/dagelijks/$VANDAAG"
set +e
voer_staffel_uit "$VANDAAG" > "$FIXTURE/bestaande-symlinkset.log" 2>&1
RC=$?
set -e
assert_gelijk "1" "$RC" "bestaande symlinkset blokkeert staffel"
[ -L "$DOEL/dagelijks/$VANDAAG" ] || faal "symlinkset is onverwacht gewijzigd"
node - "$DOEL/status.json" <<'NODE'
const fs = require("node:fs");
const status = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (status.uitkomst !== "fout") throw new Error("foutstatus voor symlinkset ontbreekt");
NODE
log_ok "staffel hergebruikt geen bestaande symlink als dagset"

# 16. De beheerde planning bevat de volledige dagelijkse keten op de actuele
# productiemap en is idempotent.
maak_fixture "beheerde-backupplanning"
CRONPAD="$FIXTURE/fps-connect-backup"
env FPS_ROOT_DIR=/opt/fps-one FPS_BACKUP_CRON_TARGET="$CRONPAD" \
  bash "$ROOT/deploy/install-backup-schedule.sh" >/dev/null
assert_bestaat "$CRONPAD"
grep -Fq "0 3 * * * root" "$CRONPAD" || faal "03:00 databaseback-up ontbreekt"
grep -Fq "30 3 * * * root" "$CRONPAD" || faal "03:30 objectopslagback-up ontbreekt"
grep -Fq "0 4 * * * root" "$CRONPAD" || faal "04:00 staffel ontbreekt"
grep -Fq "0 8 * * * root" "$CRONPAD" || faal "08:00 bewaking ontbreekt"
grep -Fq "/opt/fps-one" "$CRONPAD" || faal "actuele productiemap ontbreekt"
if grep -Fq "/opt/fps-connect" "$CRONPAD"; then
  faal "obsolete productiemap staat nog in de beheerde planning"
fi
CRON_SUM=$(sha256sum "$CRONPAD" | cut -d" " -f1)
env FPS_ROOT_DIR=/opt/fps-one FPS_BACKUP_CRON_TARGET="$CRONPAD" \
  bash "$ROOT/deploy/install-backup-schedule.sh" >/dev/null
assert_gelijk "$CRON_SUM" "$(sha256sum "$CRONPAD" | cut -d" " -f1)" \
  "tweede planninginstallatie is niet idempotent"
log_ok "productiedeploy beheert de volledige 03:00-08:00 back-upplanning"

# 17. known_hosts bevat alleen de vooraf gepinde hostkey, nooit alle
# onbevestigde ssh-keyscan-uitvoer.
maak_fixture "ssh-hostkey-pin"
ssh-keygen -q -t ed25519 -N "" -f "$FIXTURE/verwacht" </dev/null
ssh-keygen -q -t ed25519 -N "" -f "$FIXTURE/aanvaller" </dev/null
awk '{ print "backup.example " $1 " " $2 }' \
  "$FIXTURE/verwacht.pub" "$FIXTURE/aanvaller.pub" > "$FIXTURE/scan"
cat > "$BIN/ssh-keyscan" <<'SH'
#!/bin/bash
cat "${FAKE_SSH_SCAN:?}"
SH
chmod +x "$BIN/ssh-keyscan"
FINGERPRINT=$(ssh-keygen -lf "$FIXTURE/verwacht.pub" -E sha256 | awk '{ print $2 }')
env \
  PROD_SSH_HOST=backup.example \
  PROD_SSH_PORT=22 \
  PROD_SSH_HOST_FINGERPRINT="$FINGERPRINT" \
  SSH_KEYSCAN_BIN="$BIN/ssh-keyscan" \
  FAKE_SSH_SCAN="$FIXTURE/scan" \
  bash "$ROOT/deploy/pin-ssh-host-key.sh" "$FIXTURE/known_hosts" >/dev/null
assert_gelijk "1" "$(wc -l < "$FIXTURE/known_hosts" | tr -d ' ')" \
  "known_hosts bevat niet exact één sleutel"
VERWACHT_BLOB=$(awk '{ print $2 }' "$FIXTURE/verwacht.pub")
AANVALLER_BLOB=$(awk '{ print $2 }' "$FIXTURE/aanvaller.pub")
grep -Fq "$VERWACHT_BLOB" "$FIXTURE/known_hosts" || faal "gepinde hostkey ontbreekt"
if grep -Fq "$AANVALLER_BLOB" "$FIXTURE/known_hosts"; then
  faal "ongepinde hostkey is ten onrechte geaccepteerd"
fi
set +e
env \
  PROD_SSH_HOST=backup.example \
  PROD_SSH_PORT=22 \
  PROD_SSH_HOST_FINGERPRINT="SHA256:past-niet" \
  SSH_KEYSCAN_BIN="$BIN/ssh-keyscan" \
  FAKE_SSH_SCAN="$FIXTURE/scan" \
  bash "$ROOT/deploy/pin-ssh-host-key.sh" "$FIXTURE/verkeerd-known-hosts" \
  > "$FIXTURE/verkeerd.log" 2>&1
RC=$?
set -e
assert_gelijk "1" "$RC" "afwijkende hostkey-fingerprint blokkeert niet"
assert_niet_bestaat "$FIXTURE/verkeerd-known-hosts"
log_ok "Actions accepteert uitsluitend de vooraf gepinde VPS-hostkey"

echo "Alle $TEST_TELLER back-upstaffelproeven zijn geslaagd."