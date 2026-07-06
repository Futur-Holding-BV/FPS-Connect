#!/usr/bin/env bash
# Freshclam update — draait periodiek om ClamAV virusdefinities bij te houden.
# Interval: elke 4 uur (via de workflow: opnieuw opstarten).

set -euo pipefail

FRESHCLAM="/nix/store/j01wsla7rfrgjv3605l561mni4b4ka05-clamav-1.4.3/bin/freshclam"
CONF="/home/runner/workspace/config/clamav/freshclam.conf"
DB_DIR="/home/runner/workspace/data/clamav-db"

mkdir -p "$DB_DIR"

if [ ! -f "$FRESHCLAM" ]; then
  echo "$(date -Iseconds) FOUT: freshclam niet gevonden"
  exit 0
fi

echo "$(date -Iseconds) ClamAV update gestart..."
"$FRESHCLAM" --config-file="$CONF" 2>&1 | while IFS= read -r line; do
  echo "$(date -Iseconds) $line"
done || echo "$(date -Iseconds) Update afgerond (eventuele fout genegeerd)"

echo "$(date -Iseconds) Slaap 14400s (4 uur) voor volgende update..."
sleep 14400
