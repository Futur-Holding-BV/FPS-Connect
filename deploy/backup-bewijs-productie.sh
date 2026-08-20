#!/bin/bash
# Productiebewijs voor de externe staffel. Dit script wordt door de handmatige
# GitHub Actions-workflow als root uitgevoerd en accepteert alleen de set die de
# zojuist voltooide staffelrun voor de lokale kalenderdag heeft gepubliceerd.
set -Eeuo pipefail

ACTIE="${1:-}"
case "$ACTIE" in
  alleen_staffel|staffel_en_herstelproef) ;;
  *) echo "FOUT: actie moet alleen_staffel of staffel_en_herstelproef zijn" >&2; exit 2 ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/backup-set-validatie.sh
source "$SCRIPT_DIR/backup-set-validatie.sh"
DOEL="${BACKUP_DOEL:-/srv/fps-backup}"
VERWACHTE_DATUM="$(date +%F)"
START_EPOCH="$(date -u +%s)"

echo "BACK-UPBEWIJS|stap=staffel|start=$(date -Is)"
BACKUP_DATUM="$VERWACHTE_DATUM" \
  bash "$SCRIPT_DIR/backup-staffel.sh"

python3 - "$DOEL/status.json" "$DOEL" "$VERWACHTE_DATUM" "$START_EPOCH" <<'PY'
import datetime as dt
import json
import os
import re
import sys
from pathlib import Path

status_pad, doel_pad, verwachte_datum, start_epoch = sys.argv[1:]
if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", verwachte_datum):
    raise SystemExit("FOUT: verwachte datum heeft geen geldig formaat")

with open(status_pad, "r", encoding="utf-8") as bestand:
    status = json.load(bestand)

verwachte_set = f"dagelijks/{verwachte_datum}"
if status.get("uitkomst") != "geslaagd":
    raise SystemExit("FOUT: status.json meldt geen geslaagde run")
if status.get("set") != verwachte_set:
    raise SystemExit("FOUT: status.json wijst niet naar de set van deze kalenderdag")
if status.get("laatste_geslaagde_set") != verwachte_set:
    raise SystemExit("FOUT: laatste_geslaagde_set is niet de zojuist gebouwde set")
if status.get("laatste_geslaagde_run") != status.get("laatste_run"):
    raise SystemExit("FOUT: laatste geslaagde run is niet de zojuist voltooide run")

laatste_run = str(status.get("laatste_run") or "")
try:
    gemeten = dt.datetime.fromisoformat(laatste_run.replace("Z", "+00:00"))
except ValueError as fout:
    raise SystemExit("FOUT: laatste_run is geen geldige ISO-datum") from fout
if gemeten.tzinfo is None:
    gemeten = gemeten.replace(tzinfo=dt.timezone.utc)
gemeten_epoch = gemeten.timestamp()
nu_epoch = dt.datetime.now(dt.timezone.utc).timestamp()
if gemeten_epoch < int(start_epoch) - 5 or gemeten_epoch > nu_epoch + 300:
    raise SystemExit("FOUT: status.json is niet van de zojuist gestarte bewijsrun")

doel = Path(doel_pad)
if doel.is_symlink():
    raise SystemExit("FOUT: back-updoel mag geen symlink zijn")
doel = doel.resolve(strict=True)
dagelijks = doel / "dagelijks"
if dagelijks.is_symlink():
    raise SystemExit("FOUT: dagelijks-map mag geen symlink zijn")
dagelijks = dagelijks.resolve(strict=True)
kandidaat = dagelijks / verwachte_datum
if kandidaat.is_symlink():
    raise SystemExit("FOUT: dagelijkse set mag geen symlink zijn")
opgelost = kandidaat.resolve(strict=True)
if opgelost.parent != dagelijks or opgelost.name != verwachte_datum:
    raise SystemExit("FOUT: dagelijkse set valt buiten de toegestane staffelmap")
if not opgelost.is_dir():
    raise SystemExit("FOUT: dagelijkse set is geen map")

print(
    "BACK-UPBEWIJS|uitkomst=geslaagd"
    f"|laatste_run={laatste_run}"
    f"|set={verwachte_set}"
    f"|omvang_bytes={status.get('omvang_bytes')}"
    f"|dagelijks={status.get('aantal_dagelijks')}"
    f"|wekelijks={status.get('aantal_wekelijks')}"
    f"|maandelijks={status.get('aantal_maandelijks')}"
)
PY

SET_PAD="$DOEL/dagelijks/$VERWACHTE_DATUM"
if ! valideer_reguliere_backupinhoud "$SET_PAD"; then
  echo "FOUT: set bevat een symlink of speciaal bestand" >&2
  exit 1
fi
if [ ! -f "$SET_PAD/db.sql.gz" ] && [ ! -f "$SET_PAD/db.sql.gz.age" ]; then
  echo "FOUT: set bevat geen databasebestand" >&2
  exit 1
fi
[ -f "$SET_PAD/manifest.json" ] || { echo "FOUT: manifest ontbreekt" >&2; exit 1; }
[ -f "$SET_PAD/sha256sums.txt" ] || { echo "FOUT: checksumlijst ontbreekt" >&2; exit 1; }
(cd "$SET_PAD" && sha256sum -c --quiet sha256sums.txt)

python3 - "$SET_PAD/manifest.json" <<'PY'
import json
import sys
from pathlib import Path

manifest = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
database = manifest.get("database", {})
bestanden = manifest.get("bestanden", {})
if manifest.get("geheimen_opgenomen") is not False:
    raise SystemExit("FOUT: manifest bevestigt niet dat geheimen zijn uitgesloten")
if database.get("bestand") not in {"db.sql.gz", "db.sql.gz.age"}:
    raise SystemExit("FOUT: manifest bevat geen geldig databasebestand")
if int(database.get("bytes") or 0) <= 0:
    raise SystemExit("FOUT: databasebestand is leeg volgens manifest")
if int(bestanden.get("aantal") or 0) <= 0:
    raise SystemExit("FOUT: manifest bevat geen objectopslagbestanden")
if int(bestanden.get("bytes") or 0) <= 0:
    raise SystemExit("FOUT: objectopslag is leeg volgens manifest")
print(
    "BACK-UPBEWIJS|checksums=ok"
    f"|db={database.get('bestand')}"
    f"|bestanden={bestanden.get('aantal')}"
    f"|bestanden_bytes={bestanden.get('bytes')}"
    f"|versleuteld={manifest.get('versleuteld')}"
    "|geheimen_opgenomen=false"
)
PY

if [ "$ACTIE" = "staffel_en_herstelproef" ]; then
  echo "HERSTELBEWIJS|stap=lege-geisoleerde-omgeving|start=$(date -Is)"
  BACKUP_DOEL="$DOEL" HERSTEL_SET="$SET_PAD" \
    bash "$SCRIPT_DIR/herstelproef.sh"
fi