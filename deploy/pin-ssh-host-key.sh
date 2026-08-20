#!/usr/bin/env bash
# Bouw known_hosts uitsluitend uit de gescande sleutel waarvan de fingerprint
# exact overeenkomt met de vooraf geverifieerde GitHub Actions-secret.
set -euo pipefail

HOST="${PROD_SSH_HOST:?PROD_SSH_HOST ontbreekt}"
PORT="${PROD_SSH_PORT:-22}"
VERWACHT="${PROD_SSH_HOST_FINGERPRINT:?PROD_SSH_HOST_FINGERPRINT ontbreekt}"
DOEL="${1:-$HOME/.ssh/known_hosts}"
KEYSCAN_BIN="${SSH_KEYSCAN_BIN:-ssh-keyscan}"
KEYGEN_BIN="${SSH_KEYGEN_BIN:-ssh-keygen}"

case "$PORT" in
  ''|*[!0-9]*) echo "FOUT: PROD_SSH_PORT is geen geldig poortnummer." >&2; exit 1 ;;
esac
case "$VERWACHT" in
  SHA256:*) ;;
  *) echo "FOUT: PROD_SSH_HOST_FINGERPRINT moet een SHA256-fingerprint zijn." >&2; exit 1 ;;
esac
if printf '%s' "$HOST$VERWACHT" | grep -q '[[:space:]]'; then
  echo "FOUT: host of fingerprint bevat witruimte." >&2
  exit 1
fi

TMPD=$(mktemp -d)
trap 'rm -rf "$TMPD"' EXIT
SCAN="$TMPD/scan"
MATCHES="$TMPD/matches"
: > "$MATCHES"

if ! "$KEYSCAN_BIN" -p "$PORT" "$HOST" > "$SCAN" 2>/dev/null; then
  echo "FOUT: VPS-hostkeys konden niet worden opgehaald." >&2
  exit 1
fi

while IFS= read -r regel; do
  [ -n "$regel" ] || continue
  case "$regel" in \#*) continue ;; esac
  fingerprint=$(printf '%s\n' "$regel" \
    | "$KEYGEN_BIN" -lf - -E sha256 2>/dev/null \
    | awk 'NR == 1 { print $2 }')
  if [ "$fingerprint" = "$VERWACHT" ]; then
    printf '%s\n' "$regel" >> "$MATCHES"
  fi
done < "$SCAN"

sort -u "$MATCHES" -o "$MATCHES"
AANTAL=$(awk 'NF { aantal++ } END { print aantal + 0 }' "$MATCHES")
if [ "$AANTAL" -ne 1 ]; then
  echo "FOUT: gescande VPS-hostkeys bevatten niet exact één vooraf gepinde sleutel." >&2
  exit 1
fi

mkdir -p "$(dirname "$DOEL")"
install -m 0644 "$MATCHES" "$DOEL"
echo "VPS-hostkey komt exact overeen met de vooraf gepinde fingerprint."