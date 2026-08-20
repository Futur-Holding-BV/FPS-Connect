#!/bin/bash
# FPS Connect — BACKUP_01: bewaking van de externe kopie.
#
# Draait dagelijks op de VPS (cron, 08:00) en controleert:
#   1. dat de laatste staffelrun geslaagd is en een complete set < 36 uur oud is;
#   2. dat die set niet verdacht klein is t.o.v. de vorige (< 50%);
#   3. dat de NAS binnen 36 uur een pull heeft gedaan zodra de sleutel actief is.
#
# Een staffelfout mailt al direct vanuit backup-staffel.sh. Deze bewaker stuurt
# daarna hoogstens één Graph-herinnering per kalenderdag zolang er geen verse
# (<24 uur) geslaagde set is. De bestaande blokkerende in-app melding blijft.
set -Eeuo pipefail
shopt -s nullglob

DOEL="${BACKUP_DOEL:-/srv/fps-backup}"
DEPLOY_DIR="${BACKUP_DEPLOY_DIR:-/opt/fps-one/deploy}"
COMPOSE_BESTAND="${BACKUP_COMPOSE_BESTAND:-$DEPLOY_DIR/docker-compose.production.yml}"
ENV_BESTAND="${BACKUP_ENV_BESTAND:-$DEPLOY_DIR/.env.production}"
MARKER="${BACKUP_NAS_MARKER:-/var/lib/fps-nas/laatste-verbinding}"
NAS_SLEUTELS="${BACKUP_NAS_AUTHORIZED_KEYS:-/home/fps-nas/.ssh/authorized_keys}"
MAX_UUR="${BACKUP_MAX_UUR:-36}"
SUCCES_MAX_UUR="${BACKUP_SUCCES_MAX_UUR:-24}"
VANDAAG="${BACKUP_DATUM:-$(date +%F)}"
LOGP="[check-offsite $(date -Is)]"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=deploy/backup-alert.sh
source "$SCRIPT_DIR/backup-alert.sh"

PROBLEMEN=()
UITKOMST=""
DETAIL=""
LAATSTE_GESLAAGDE_RUN=""
LAATSTE_GESLAAGDE_SET=""
GESLAAGD_UUR_OUD=""

voeg_probleem_toe() {
  PROBLEMEN+=("$1")
}

vind_nieuwste_twee_sets() {
  local nieuwste="" vorige="" pad naam nieuwste_naam="" vorige_naam=""
  for pad in "$DOEL"/dagelijks/20??-??-??; do
    [ -d "$pad" ] || continue
    naam=$(basename "$pad")
    if [ -z "$nieuwste" ] || [[ "$naam" > "$nieuwste_naam" ]]; then
      vorige="$nieuwste"
      vorige_naam="$nieuwste_naam"
      nieuwste="$pad"
      nieuwste_naam="$naam"
    elif [ -z "$vorige" ] || [[ "$naam" > "$vorige_naam" ]]; then
      vorige="$pad"
      vorige_naam="$naam"
    fi
  done
  NIEUWSTE="$nieuwste"
  VORIGE="$vorige"
}

lees_status() {
  local uitvoer
  local -a velden=()
  uitvoer=$(mktemp)
  if ! python3 - "$DOEL/status.json" > "$uitvoer" <<'PY'
import json
import re
import sys

try:
    with open(sys.argv[1], "r", encoding="utf-8") as bestand:
        status = json.load(bestand)
except (OSError, json.JSONDecodeError):
    raise SystemExit(2)

uitkomst = str(status.get("uitkomst") or "")
detail = re.sub(r"\s+", " ", str(status.get("detail") or ""))[:500]
laatste_run = str(
    status.get("laatste_geslaagde_run")
    or (status.get("laatste_run") if uitkomst == "geslaagd" else "")
    or ""
)
laatste_set = str(
    status.get("laatste_geslaagde_set")
    or (status.get("set") if uitkomst == "geslaagd" else "")
    or ""
)
sys.stdout.write("\0".join([uitkomst, detail, laatste_run, laatste_set]) + "\0")
PY
  then
    rm -f "$uitvoer"
    return 1
  fi
  mapfile -d '' -t velden < "$uitvoer"
  rm -f "$uitvoer"
  [ "${#velden[@]}" -eq 4 ] || return 1
  UITKOMST="${velden[0]}"
  DETAIL="${velden[1]}"
  LAATSTE_GESLAAGDE_RUN="${velden[2]}"
  LAATSTE_GESLAAGDE_SET="${velden[3]}"
}

geslaagde_set_is_vers() {
  local succes_ts nu_ts
  [ -n "$LAATSTE_GESLAAGDE_RUN" ] || return 1
  succes_ts=$(date -d "$LAATSTE_GESLAAGDE_RUN" +%s 2>/dev/null) || return 1
  nu_ts=$(date +%s)
  GESLAAGD_UUR_OUD=$(( (nu_ts - succes_ts) / 3600 ))
  [ "$GESLAAGD_UUR_OUD" -lt "$SUCCES_MAX_UUR" ]
}

schrijf_dagelijkse_herinnering_status() {
  local uitkomst="${1:?uitkomst ontbreekt}"
  local exitcode="${2:--}"
  local verhoog_pogingen="${3:-0}"
  local detail="${4:-}"
  local alarmmap="$DOEL/.alarmstatus"
  local statuspad="$alarmmap/staffel-herinnering-status-$VANDAAG.json"
  local tijdelijk tijdstip
  mkdir -p "$alarmmap"
  tijdelijk=$(mktemp "$alarmmap/.staffel-herinnering-status.XXXXXX")
  tijdstip=$(date -Is)
  python3 - "$statuspad" "$tijdelijk" "$VANDAAG" "$tijdstip" "$uitkomst" "$exitcode" "$verhoog_pogingen" "$detail" <<'PY'
import json
import os
import sys

(
    bestaand_pad,
    tijdelijk_pad,
    datum,
    tijdstip,
    uitkomst,
    exitcode,
    verhoog_pogingen,
    detail,
) = sys.argv[1:]
bestaand = {}
try:
    with open(bestaand_pad, "r", encoding="utf-8") as bestand:
        bestaand = json.load(bestand)
except (OSError, json.JSONDecodeError):
    pass

try:
    pogingen = int(bestaand.get("pogingen", 0))
except (ValueError, TypeError):
    pogingen = 0
if verhoog_pogingen == "1":
    pogingen += 1

status = {
    "uitkomst": uitkomst,
    "datum": datum,
    "pogingen": pogingen,
    "bijgewerkt_op": tijdstip,
}
laatste_poging = bestaand.get("laatste_poging")
if verhoog_pogingen == "1":
    laatste_poging = tijdstip
if laatste_poging:
    status["laatste_poging"] = laatste_poging
if exitcode != "-":
    status["exit_code"] = int(exitcode)
if detail:
    status["detail"] = detail

with open(tijdelijk_pad, "w", encoding="utf-8") as bestand:
    json.dump(status, bestand, ensure_ascii=False, indent=2)
    bestand.write("\n")
    bestand.flush()
    os.fsync(bestand.fileno())
PY
  mv -f "$tijdelijk" "$statuspad"
}

dagelijkse_herinnering_is_geblokkeerd() {
  local alarmmap="$DOEL/.alarmstatus"
  local marker="$alarmmap/staffel-herinnering-$VANDAAG"
  local statuspad="$alarmmap/staffel-herinnering-status-$VANDAAG.json"
  mkdir -p "$alarmmap"
  HERINNERING_DAGSTATUS=""
  if [ -e "$marker" ]; then
    HERINNERING_DAGSTATUS="geslaagd"
    return 0
  fi
  [ -f "$statuspad" ] || return 1
  HERINNERING_DAGSTATUS=$(python3 - "$statuspad" <<'PY'
import json
import sys

try:
    with open(sys.argv[1], "r", encoding="utf-8") as bestand:
        status = json.load(bestand)
    print(str(status.get("uitkomst") or "onleesbaar"))
except (OSError, json.JSONDecodeError):
    print("onleesbaar")
PY
)
  case "$HERINNERING_DAGSTATUS" in
    mislukt)
      return 1
      ;;
    bezig)
      schrijf_dagelijkse_herinnering_status \
        "onzeker" "-" 0 \
        "Vorige Graph-poging is niet afgerond; niet opnieuw verzonden om een dubbel bericht te voorkomen."
      HERINNERING_DAGSTATUS="onzeker"
      return 0
      ;;
    geslaagd|onzeker|onleesbaar)
      return 0
      ;;
    *)
      HERINNERING_DAGSTATUS="onleesbaar"
      return 0
      ;;
  esac
}

markeer_dagelijkse_herinnering_bezig() {
  schrijf_dagelijkse_herinnering_status "bezig" "-" 1
}

markeer_dagelijkse_herinnering_verstuurd() {
  local alarmmap="$DOEL/.alarmstatus"
  local marker="$alarmmap/staffel-herinnering-$VANDAAG"
  local tijdelijk
  schrijf_dagelijkse_herinnering_status "geslaagd" "-" 0
  tijdelijk=$(mktemp "$alarmmap/.staffel-herinnering.XXXXXX")
  printf '%s\n' "$(date -Is)" > "$tijdelijk"
  mv -f "$tijdelijk" "$marker"
}

markeer_dagelijkse_herinnering_mislukt() {
  local exitcode="${1:?exitcode ontbreekt}"
  schrijf_dagelijkse_herinnering_status "mislukt" "$exitcode" 0
}

markeer_dagelijkse_herinnering_onzeker() {
  local exitcode="${1:?exitcode ontbreekt}"
  schrijf_dagelijkse_herinnering_status \
    "onzeker" "$exitcode" 0 \
    "Graph-uitkomst is door timeout of transportverlies niet betrouwbaar vast te stellen; niet opnieuw verzonden."
}

stuur_in_app_melding() {
  local tekst="$1"
  if [ "${BACKUP_SKIP_INAPP:-0}" = "1" ]; then
    return 0
  fi
  if [ -n "${BACKUP_INAPP_COMMAND:-}" ]; then
    "$BACKUP_INAPP_COMMAND" "$tekst"
    return
  fi
  docker compose -f "$COMPOSE_BESTAND" \
    --env-file "$ENV_BESTAND" exec -T db \
    psql -U fps_app -d fps_production -v tekst="$tekst" <<'SQL'
INSERT INTO gebruikers_meldingen (type, omschrijving, urgentie, status, gebruiker_id, gebruiker_naam)
SELECT 'backup_alarm', :'tekst', 'blokkerend', 'nieuw', id, naam
FROM gebruikers WHERE rol = 'hoofdbeheerder' AND actief = true;
SQL
}

mkdir -p "$DOEL"
exec 8>"$DOEL/.check-offsite.lock"
if ! flock -n 8; then
  echo "$LOGP controle draait al; tweede run overgeslagen"
  exit 0
fi

# ── 1+2. staffel-set vers, compleet en niet verdacht klein ─────────────────
vind_nieuwste_twee_sets
if [ ! -f "$DOEL/status.json" ]; then
  voeg_probleem_toe "status.json ontbreekt"
elif ! lees_status; then
  voeg_probleem_toe "status.json is geen geldige JSON"
elif [ "$UITKOMST" != "geslaagd" ]; then
  voeg_probleem_toe "laatste staffelrun is niet geslaagd (uitkomst: ${UITKOMST:-onbekend}; ${DETAIL:-geen detail})"
fi

if [ -z "$NIEUWSTE" ]; then
  voeg_probleem_toe "er is nog nooit een staffel-set gebouwd in $DOEL"
else
  SETDATUM=$(basename "$NIEUWSTE")
  SET_TS=$(date -d "$SETDATUM" +%s 2>/dev/null || printf '0')
  if [ "$SET_TS" -eq 0 ]; then
    voeg_probleem_toe "nieuwste back-upset heeft een ongeldige datum: $SETDATUM"
  else
    LEEFTIJD_U=$(( ($(date +%s) - SET_TS) / 3600 ))
    if [ "$LEEFTIJD_U" -gt "$MAX_UUR" ]; then
      voeg_probleem_toe "nieuwste back-upset ($SETDATUM) is $LEEFTIJD_U uur oud (max $MAX_UUR)"
    fi
  fi

  if [ ! -f "$NIEUWSTE/manifest.json" ] || [ ! -f "$NIEUWSTE/sha256sums.txt" ]; then
    voeg_probleem_toe "nieuwste set mist manifest.json of sha256sums.txt"
  elif ! (cd "$NIEUWSTE" && sha256sum -c --quiet sha256sums.txt); then
    voeg_probleem_toe "nieuwste set faalt de checksumcontrole"
  fi

  if [ -n "$VORIGE" ]; then
    B_NIEUW=$(du -sb "$NIEUWSTE" | cut -f1)
    B_VORIG=$(du -sb "$VORIGE" | cut -f1)
    if [ "$B_VORIG" -gt 0 ] && [ "$B_NIEUW" -lt $(( B_VORIG / 2 )) ]; then
      voeg_probleem_toe "nieuwste set is verdacht klein: $B_NIEUW bytes tegenover $B_VORIG bytes gisteren"
    fi
  fi
fi

# ── 3. NAS-pull binnen 36 uur ───────────────────────────────────────────────
if [ "${BACKUP_SKIP_NAS_CHECK:-0}" = "1" ]; then
  echo "$LOGP NAS-controle overgeslagen door geïsoleerde regressieproef"
else
  NAS_ACTIEF=false
  if grep -q "ssh-" "$NAS_SLEUTELS" 2>/dev/null; then
    NAS_ACTIEF=true
  fi
  if [ "$NAS_ACTIEF" = true ]; then
    if [ ! -f "$MARKER" ]; then
      voeg_probleem_toe "de NAS heeft nog nooit een kopie opgehaald (geen marker)"
    else
      PULL_U=$(( ($(date +%s) - $(stat -c %Y "$MARKER")) / 3600 ))
      if [ "$PULL_U" -gt "$MAX_UUR" ]; then
        voeg_probleem_toe "laatste NAS-ophaling is $PULL_U uur geleden (max $MAX_UUR)"
      fi
    fi
  else
    echo "$LOGP NAS-account heeft nog geen sleutel — pull-controle overgeslagen (wacht op NAS)"
  fi
fi

# ── melden ──────────────────────────────────────────────────────────────────
if [ "${#PROBLEMEN[@]}" -eq 0 ]; then
  echo "$LOGP OK: externe kopie gezond"
  exit 0
fi

TEKST="Externe back-upkopie: $(printf '%s; ' "${PROBLEMEN[@]}")Zonder externe kopie is er geen herstel bij uitval van de server."
echo "$LOGP ALARM: $TEKST"
stuur_in_app_melding "$TEKST" || \
  echo "$LOGP WAARSCHUWING: in-app back-upmelding kon niet worden opgeslagen." >&2

# Alleen de staffelfout wordt per Graph herinnerd; een verse geslaagde set
# onderdrukt de herinnering ook als alleen de NAS-ophaling achterloopt.
if ! geslaagde_set_is_vers; then
  if ! dagelijkse_herinnering_is_geblokkeerd; then
    HERINNERING="De externe back-upstaffel heeft nog geen geslaagde set van minder dan $SUCCES_MAX_UUR uur oud.

Controle: $(date -Is)
Laatste geslaagde run: ${LAATSTE_GESLAAGDE_RUN:-onbekend}
Laatste geslaagde set: ${LAATSTE_GESLAAGDE_SET:-onbekend}
Problemen: $(printf '%s; ' "${PROBLEMEN[@]}")

Dit is de enige staffelherinnering voor $VANDAAG. De vorige volledige set blijft beschikbaar."
    markeer_dagelijkse_herinnering_bezig
    if stuur_backup_graph_mail "FPS Connect: externe back-upstaffel nog niet hersteld" "$HERINNERING"; then
      if [ "${BACKUP_TEST_CRASH_NA_GRAPH_SUCCES:-0}" = "1" ]; then
        if [ "${BACKUP_TEST_MODE:-0}" != "1" ]; then
          echo "$LOGP WAARSCHUWING: crashhaak is alleen toegestaan in testmodus." >&2
          exit 1
        fi
        kill -KILL "$$"
      fi
      markeer_dagelijkse_herinnering_verstuurd
    else
      graph_exit=$?
      if [ "${BACKUP_GRAPH_UITKOMST:-onzeker}" = "mislukt" ]; then
        markeer_dagelijkse_herinnering_mislukt "$graph_exit"
        echo "$LOGP WAARSCHUWING: dagelijkse Graph-herinnering is aantoonbaar mislukt; volgende controle mag opnieuw proberen." >&2
      else
        markeer_dagelijkse_herinnering_onzeker "$graph_exit"
        echo "$LOGP WAARSCHUWING: Graph-uitkomst is onzeker; geen automatische retry om dubbel mailen te voorkomen." >&2
      fi
    fi
  else
    case "$HERINNERING_DAGSTATUS" in
      geslaagd)
        echo "$LOGP Graph-herinnering is vandaag al verzonden; geen tweede verzending"
        ;;
      onzeker|bezig)
        echo "$LOGP vorige Graph-poging heeft een onzekere uitkomst; geen tweede verzending om dubbel mailen te voorkomen" >&2
        ;;
      *)
        echo "$LOGP Graph-dagstatus is niet betrouwbaar leesbaar; fail-closed geen tweede verzending" >&2
        ;;
    esac
  fi
elif [ -n "$GESLAAGD_UUR_OUD" ]; then
  echo "$LOGP geen Graph-herinnering: laatste geslaagde set is $GESLAAGD_UUR_OUD uur oud"
fi

exit 1
