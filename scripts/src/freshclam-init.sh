#!/usr/bin/env bash
# Freshclam initialisatie — downloadt de ClamAV virusdefinities.
# Wordt eenmalig uitgevoerd bij eerste opstarten en daarna dagelijks.

set -euo pipefail

FRESHCLAM="/nix/store/j01wsla7rfrgjv3605l561mni4b4ka05-clamav-1.4.3/bin/freshclam"
CONF="/home/runner/workspace/config/clamav/freshclam.conf"
DB_DIR="/home/runner/workspace/data/clamav-db"

mkdir -p "$DB_DIR"

if [ ! -f "$FRESHCLAM" ]; then
  echo "FOUT: freshclam binary niet gevonden: $FRESHCLAM"
  exit 1
fi

echo "$(date -Iseconds) — ClamAV database-update gestart..."
"$FRESHCLAM" --config-file="$CONF" 2>&1 | while IFS= read -r line; do
  echo "$(date -Iseconds) freshclam: $line"
done

echo "$(date -Iseconds) — ClamAV database-update voltooid."
ls -lh "$DB_DIR/"*.cvd "$DB_DIR/"*.cld 2>/dev/null || echo "Geen database-bestanden gevonden (update mislukt?)"
