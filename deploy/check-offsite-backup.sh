#!/bin/bash
# FPS Connect — BACKUP_01: bewaking van de externe kopie.
#
# Draait dagelijks op de VPS (cron, 08:00) en controleert:
#   1. dat er vandaag/gisteren een complete staffel-set is gebouwd (< 36 uur);
#   2. dat die set niet verdacht klein is t.o.v. de vorige (< 50%);
#   3. dat de NAS binnen 36 uur een pull heeft gedaan (marker van fps-nas-pull.sh).
#      Zolang het NAS-account nog geen sleutel heeft ("wacht op NAS") wordt
#      alleen gewaarschuwd in de logregel, niet gealarmeerd.
#
# Bij een probleem wordt een in-app melding aan alle hoofdbeheerders gezet
# via hetzelfde kanaal als SCHULD_01 punt 83 (gebruikers_meldingen, type
# backup_alarm) — rechtstreeks in de database, want de api-container logt
# nauwelijks en dit script draait op de host.
set -uo pipefail

DOEL="/srv/fps-backup"
DEPLOY_DIR="/opt/fps-one/deploy"
MARKER="/var/lib/fps-nas/laatste-verbinding"
MAX_UUR=36
LOGP="[check-offsite $(date -Is)]"

PROBLEMEN=()

# ── 1+2. staffel-set vers en niet verdacht klein ────────────────────────────
NIEUWSTE=$(ls -1d "$DOEL"/dagelijks/*/ 2>/dev/null | sort | tail -1)
# status.json is leidend: een set van gisteren kan binnen 36 uur vallen
# terwijl de run van vandaag is MISLUKT — dat moet wél alarmeren.
if [ -f "$DOEL/status.json" ]; then
  UITKOMST=$(grep -o '"uitkomst": *"[^"]*"' "$DOEL/status.json" | cut -d'"' -f4)
  if [ "$UITKOMST" != "geslaagd" ]; then
    DETAIL=$(grep -o '"detail": *"[^"]*"' "$DOEL/status.json" | cut -d'"' -f4)
    PROBLEMEN+=("laatste staffelrun is niet geslaagd (uitkomst: ${UITKOMST:-onbekend}; $DETAIL)")
  fi
fi
if [ -z "$NIEUWSTE" ]; then
  PROBLEMEN+=("er is nog nooit een staffel-set gebouwd in $DOEL")
else
  SETDATUM=$(basename "$NIEUWSTE")
  LEEFTIJD_U=$(( ($(date +%s) - $(date -d "$SETDATUM" +%s)) / 3600 ))
  if [ "$LEEFTIJD_U" -gt "$MAX_UUR" ]; then
    PROBLEMEN+=("nieuwste back-upset ($SETDATUM) is $LEEFTIJD_U uur oud (max $MAX_UUR)")
  fi
  VORIGE=$(ls -1d "$DOEL"/dagelijks/*/ 2>/dev/null | sort | tail -2 | head -1)
  if [ -n "$VORIGE" ] && [ "$VORIGE" != "$NIEUWSTE" ]; then
    B_NIEUW=$(du -sb "$NIEUWSTE" | cut -f1)
    B_VORIG=$(du -sb "$VORIGE" | cut -f1)
    if [ "$B_VORIG" -gt 0 ] && [ "$B_NIEUW" -lt $(( B_VORIG / 2 )) ]; then
      PROBLEMEN+=("nieuwste set is verdacht klein: $B_NIEUW bytes tegenover $B_VORIG bytes gisteren")
    fi
  fi
fi

# ── 3. NAS-pull binnen 36 uur ───────────────────────────────────────────────
NAS_ACTIEF=false
if grep -q "^ssh" /home/fps-nas/.ssh/authorized_keys 2>/dev/null || \
   sudo grep -q "ssh-" /home/fps-nas/.ssh/authorized_keys 2>/dev/null; then
  NAS_ACTIEF=true
fi
if [ "$NAS_ACTIEF" = true ]; then
  if [ ! -f "$MARKER" ]; then
    PROBLEMEN+=("de NAS heeft nog nooit een kopie opgehaald (geen marker)")
  else
    PULL_U=$(( ($(date +%s) - $(stat -c %Y "$MARKER")) / 3600 ))
    if [ "$PULL_U" -gt "$MAX_UUR" ]; then
      PROBLEMEN+=("laatste NAS-ophaling is $PULL_U uur geleden (max $MAX_UUR)")
    fi
  fi
else
  echo "$LOGP NAS-account heeft nog geen sleutel — pull-controle overgeslagen (wacht op NAS)"
fi

# ── melden ──────────────────────────────────────────────────────────────────
if [ ${#PROBLEMEN[@]} -eq 0 ]; then
  echo "$LOGP OK: externe kopie gezond"
  exit 0
fi

TEKST="Externe back-upkopie: $(printf '%s; ' "${PROBLEMEN[@]}")Zonder externe kopie is er geen herstel bij uitval van de server."
echo "$LOGP ALARM: $TEKST"

docker compose -f "$DEPLOY_DIR/docker-compose.production.yml" \
  --env-file "$DEPLOY_DIR/.env.production" exec -T db \
  psql -U fps_app -d fps_production -v tekst="$TEKST" <<'SQL'
INSERT INTO gebruikers_meldingen (type, omschrijving, urgentie, status, gebruiker_id, gebruiker_naam)
SELECT 'backup_alarm', :'tekst', 'blokkerend', 'nieuw', id, naam
FROM gebruikers WHERE rol = 'hoofdbeheerder' AND actief = true;
SQL
exit 1
