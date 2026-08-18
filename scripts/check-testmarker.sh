#!/usr/bin/env bash
# ─── FPS ONE — testmarker-controle ───────────────────────────────────────────
# Scant api-server bronbestanden op sabotage-/terugvaltest-markers.
# Achtergrond: op 18 aug 2026 belandde een bewust kapot startblok
# ("ROLLBACKTEST HERSTEL_BUNDEL_01") via een taakmerge op main en
# veroorzaakte een mislukte productie-deploy van ~10 min.
#
# Gebruik:
#   scripts/check-testmarker.sh [TAKNAAM]
#
# TAKNAAM is optioneel. Geef de branch-/takkenaam mee zodat terugvaltestrakken
# bewust worden uitgezonderd. Wordt weggelaten, dan geldt de controle altijd.
#
# Uitzondering: takken waarvan de naam "terugvaltest" of "rollbacktest" bevat
# (hoofdletterongevoelig) worden overgeslagen — die mogen de marker hebben.
#
# Exitcodes:
#   0 — geen markers gevonden (of tak is een terugvaltesttak)
#   1 — marker gevonden; deploy/push mag NIET doorgaan

set -euo pipefail

MARKERS="ROLLBACKTEST\|TERUGVALTEST"
SCAN_DIR="artifacts/api-server/src"
TAK="${1:-}"

# ─── Uitzondering voor terugvaltestrakken ─────────────────────────────────────
# Verlaag naar kleine letters voor een hoofdletterongevoelige vergelijking.
TAK_LOWER="$(printf '%s' "${TAK}" | tr '[:upper:]' '[:lower:]')"
case "${TAK_LOWER}" in
  *terugvaltest* | *rollbacktest*)
    echo "Testmarker-controle: tak '${TAK}' is een terugvaltesttak — controle bewust overgeslagen."
    exit 0
    ;;
esac

# ─── Bronmap aanwezig? ────────────────────────────────────────────────────────
if ! [ -d "${SCAN_DIR}" ]; then
  echo "WAARSCHUWING: map '${SCAN_DIR}' niet gevonden — testmarker-controle overgeslagen." >&2
  exit 0
fi

# ─── Grep op alle TypeScript/JavaScript bestanden ────────────────────────────
# grep geeft exit 1 als er niets gevonden wordt (gewenst gedrag, maar hier
# vangen we dat op met || true zodat set -e ons niet verliest bij een lege scan).
GEVONDEN="$(grep -rn --include="*.ts" --include="*.js" --include="*.mjs" \
  "${MARKERS}" "${SCAN_DIR}" 2>/dev/null || true)"

if [ -n "${GEVONDEN}" ]; then
  echo "" >&2
  echo "╔══════════════════════════════════════════════════════════════════╗" >&2
  echo "║  GEBLOKKEERD: testmarker gevonden in api-server bronbestanden   ║" >&2
  echo "╚══════════════════════════════════════════════════════════════════╝" >&2
  echo "" >&2
  echo "Gevonden markers (ROLLBACKTEST / TERUGVALTEST):" >&2
  echo "${GEVONDEN}" >&2
  echo "" >&2
  echo "Verwijder de testmarker vóórdat je naar main pusht of deployt." >&2
  echo "" >&2
  echo "Wil je toch een echte terugvaltest uitvoeren?" >&2
  echo "  → Gebruik een tak met 'terugvaltest' of 'rollbacktest' in de naam," >&2
  echo "    of start de workflow_dispatch handmatig op zo'n tak." >&2
  echo "  → Gebruik NOOIT de noodfix-bypass voor deze controle." >&2
  echo "" >&2
  exit 1
fi

echo "Testmarker-controle geslaagd: geen ROLLBACKTEST/TERUGVALTEST-markers aangetroffen."
