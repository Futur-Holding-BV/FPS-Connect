#!/usr/bin/env bash
# Legt de vingerafdruk van het échte pushtoken (Replit-secret GITHUB_TOKEN_PUSH)
# vast in docs/push-token-vingerafdruk.json. Draaien vanuit de Replit-shell na
# elke tokenrotatie, daarna committen en pushen.
set -euo pipefail

if [ -z "${GITHUB_TOKEN_PUSH:-}" ]; then
  echo "FOUT: GITHUB_TOKEN_PUSH staat niet in de omgeving." >&2
  exit 1
fi

WORTEL=$(git rev-parse --show-toplevel)
HASH=$(printf %s "$GITHUB_TOKEN_PUSH" | sha256sum | cut -d' ' -f1)
EXP=$(curl -sI -H "Authorization: token ${GITHUB_TOKEN_PUSH}" https://api.github.com/user \
  | grep -i github-authentication-token-expiration | tr -d '\r' | cut -d' ' -f2- | sed 's/^ *//')
LOGIN=$(curl -s -H "Authorization: token ${GITHUB_TOKEN_PUSH}" https://api.github.com/user \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).login||'?'))")

printf '{\n  "toelichting": "Vingerafdruk van het GitHub-pushtoken dat Replit werkelijk gebruikt (Replit-secret GITHUB_TOKEN_PUSH). Bijwerken bij elke tokenrotatie: scripts/git/update-token-vingerafdruk.sh. De sha256-hash is niet omkeerbaar en bevat geen geheim.",\n  "sha256": "%s",\n  "github_login": "%s",\n  "verloopt_op": "%s",\n  "vastgelegd_op": "%s"\n}\n' \
  "$HASH" "$LOGIN" "$EXP" "$(date -u +%FT%TZ)" > "$WORTEL/docs/push-token-vingerafdruk.json"

echo "Bijgewerkt: docs/push-token-vingerafdruk.json (verloopt: ${EXP:-onbekend})"
