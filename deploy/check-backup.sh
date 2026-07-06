#!/bin/bash
# FPS Connect — Dagelijkse backup-bewakingsscript
# Geeft een waarschuwing als de laatste backup meer dan 25 uur oud is.
# Gebruik: toevoegen aan crontab, optioneel e-mail sturen bij fout.

BACKUP_DIR="/opt/fps-connect/deploy/db-backups"

LATEST=$(ls -t "$BACKUP_DIR"/fps_*.sql.gz 2>/dev/null | head -1)

if [ -z "$LATEST" ]; then
  echo "WAARSCHUWING: Geen backupbestand gevonden in $BACKUP_DIR"
  exit 1
fi

AGE=$(( ($(date +%s) - $(stat -c %Y "$LATEST")) / 3600 ))

if [ "$AGE" -gt 25 ]; then
  echo "WAARSCHUWING: Laatste backup is ${AGE} uur oud: $(basename "$LATEST")"
  exit 1
fi

gunzip -t "$LATEST" 2>/dev/null
if [ $? -ne 0 ]; then
  echo "FOUT: Laatste backup is corrupt: $(basename "$LATEST")"
  exit 2
fi

echo "OK: Laatste backup is ${AGE} uur oud en integer: $(basename "$LATEST")"
exit 0
