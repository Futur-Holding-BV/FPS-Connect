#!/usr/bin/env bash
# ─── FPS ONE — productie-deployscript ────────────────────────────────────────
# Draait OP de VPS (149.210.181.47) en voert de volledige release uit in de
# vastgelegde volgorde. Wordt aangeroepen door .github/workflows/deploy.yml,
# die dit bestand eerst naar /tmp op de server kopieert en het daar uitvoert.
#
# Waarom vanuit /tmp: stap 4 (git reset --hard) vervangt de bestanden in
# /opt/fps-one — óók dit script. Een script dat zichzelf tijdens uitvoering
# overschrijft, kan halverwege breken. De kopie in /tmp is daar immuun voor
# en is bovendien altijd de versie uit de zojuist gepushte commit.
#
# Bij iedere fout stopt het script direct (set -euo pipefail).
# Er worden nergens secrets gelezen of getoond; alle geheimen blijven in
# /opt/fps-one/deploy/.env.production op de server.

set -euo pipefail

# ─── STAP 1: naar de productiemap ────────────────────────────────────────────
cd /opt/fps-one

# Alle compose-commando's delen dezelfde compose-file en env-file.
# --env-file is vereist: de compose-file interpoleert ${DATABASE_URL} en
# ${POSTGRES_PASSWORD} uit .env.production.
COMPOSE="docker compose -f deploy/docker-compose.production.yml --env-file deploy/.env.production"

# Huidige (nog gezonde) commit onthouden vóór de reset, zodat we automatisch
# kunnen terugrollen als de nieuwe release de healthcheck niet haalt.
VORIGE_COMMIT="$(git rev-parse HEAD)"
echo "Huidige (mogelijk terug te rollen) commit: ${VORIGE_COMMIT}"

# ─── Healthcheck als functie (stap 9/10, ook hergebruikt na rollback) ────────
# Pollt de PUBLIEKE healthz-route via het productiedomein en eist letterlijk
# "status":"ok" in het antwoord. `up -d` slaagt al zodra containers gestart
# zijn en zegt niets over een halve migratie of een api die niet opstart.
healthcheck() {
  echo "Healthcheck gestart op https://connect.fps-one.nl/api/healthz ..."
  local pogingen=30   # 30 x 5s = max ~150s wachttijd
  local i
  for i in $(seq 1 "${pogingen}"); do
    local antwoord
    antwoord="$(curl -fsS --max-time 10 https://connect.fps-one.nl/api/healthz 2>/dev/null || true)"
    if printf '%s' "${antwoord}" | grep -q '"status":"ok"'; then
      echo "Healthcheck geslaagd (poging ${i}/${pogingen}): ${antwoord}"
      return 0
    fi
    echo "API nog niet gezond (poging ${i}/${pogingen}), 5s wachten..."
    sleep 5
  done

  echo "FOUT: healthz gaf geen status ok binnen de timeout." >&2
  ${COMPOSE} ps || true
  echo "--- Laatste api-logs ---" >&2
  ${COMPOSE} logs --tail=80 api || true
  echo "--- Laatste caddy-logs ---" >&2
  ${COMPOSE} logs --tail=40 caddy || true
  return 1
}

# ─── STAP 2: databaseback-up (bestaande compose backup-opdracht) ─────────────
echo "=== STAP 2: databaseback-up maken ==="
${COMPOSE} run --rm -T backup

# Verifieer dat er daadwerkelijk een bruikbare back-up is weggeschreven:
# een deploy zonder werkende back-up mag niet doorgaan.
NIEUWSTE_BACKUP="$(ls -t deploy/db-backups/*.sql.gz 2>/dev/null | head -1)"
if [ -z "${NIEUWSTE_BACKUP}" ] || [ ! -s "${NIEUWSTE_BACKUP}" ]; then
  echo "FOUT: geen (niet-lege) back-up gevonden in deploy/db-backups/." >&2
  exit 1
fi
if command -v gzip >/dev/null 2>&1; then
  gzip -t "${NIEUWSTE_BACKUP}"
fi
echo "Back-up OK: ${NIEUWSTE_BACKUP} ($(du -h "${NIEUWSTE_BACKUP}" | cut -f1))"

# ─── STAP 3: nieuwste code ophalen ───────────────────────────────────────────
echo "=== STAP 3: git fetch origin ==="
git fetch origin

# ─── STAP 4: werkmap exact gelijk zetten aan origin/main ────────────────────
# reset --hard (geen pull): de server volgt main altijd exact, ook na een
# force-push of lokale servercommit. De ongetrackte deploy/.env.production
# en deploy/db-backups/ blijven hierbij onaangeroerd.
echo "=== STAP 4: git reset --hard origin/main ==="
git reset --hard origin/main
echo "Server staat nu op commit: $(git rev-parse HEAD)"

# ─── STAP 5: API bouwen zonder cache ─────────────────────────────────────────
echo "=== STAP 5: API-image bouwen (--no-cache) ==="
${COMPOSE} build --no-cache api

# ─── STAP 6: database-migraties uitvoeren ────────────────────────────────────
# Het migrate-image MOET zelf ook zonder cache herbouwd worden: het schema zit
# in het image gebakken. Een verouderd migrate-image meldt "Changes applied"
# met exit 0 terwijl er niets is doorgevoerd (dit brak de login op productie
# op 13 juli 2026). Daarom hier: vers bouwen, migreren, en daarna het schema
# aantoonbaar verifiëren met de puur-lezende schema-healthcheck.
echo "=== STAP 6: migraties (migrate-image vers bouwen + push + verificatie) ==="
${COMPOSE} build --no-cache migrate
${COMPOSE} run --rm -T migrate
${COMPOSE} run --rm -T migrate pnpm --filter @workspace/db run schema-healthcheck

# ─── STAP 7: Caddy/frontend bouwen zonder cache ──────────────────────────────
echo "=== STAP 7: Caddy/frontend-image bouwen (--no-cache) ==="
${COMPOSE} build --no-cache caddy

# ─── STAP 8: containers starten ──────────────────────────────────────────────
echo "=== STAP 8: docker compose up -d ==="
${COMPOSE} up -d --remove-orphans db api caddy

# ─── STAP 9 + 10: healthcheck; alleen slagen bij status ok ───────────────────
echo "=== STAP 9/10: healthcheck ==="
if healthcheck; then
  # Opschonen van oude images (ouder dan 72u) — alleen bij een gezonde release.
  docker image prune -f --filter "until=72h" || true
  echo "Deploy voltooid: release is gezond."
  exit 0
fi

# ─── Automatische rollback (behouden uit de bestaande workflow) ──────────────
# De nieuwe release is NIET gezond. In plaats van de kapotte stack te laten
# draaien, rollen we terug naar de vorige gezonde commit. LET OP: dit rolt
# alleen de applicatiecode terug (Niveau 1 uit deploy/ROLLBACK_PRODUCTION.md);
# een rollback mét schema-/databasewijzigingen (Niveau 2) blijft handmatig.
echo "Release is NIET gezond. Automatische rollback naar ${VORIGE_COMMIT} gestart..." >&2

if [ "${VORIGE_COMMIT}" = "$(git rev-parse HEAD)" ]; then
  echo "WAARSCHUWING: geen vorige commit om naar terug te rollen (eerste deploy?)." >&2
else
  git reset --hard "${VORIGE_COMMIT}"
  ${COMPOSE} build api caddy
  ${COMPOSE} up -d --remove-orphans db api caddy
fi

echo "Healthcheck na rollback gestart..."
if healthcheck; then
  echo "Rollback geslaagd: productie draait weer op de vorige gezonde versie (${VORIGE_COMMIT})." >&2
else
  echo "FOUT: rollback-healthcheck faalt OOK. Handmatige interventie vereist — zie deploy/ROLLBACK_PRODUCTION.md (Niveau 2)." >&2
fi

# De run faalt altijd als de oorspronkelijke healthcheck faalde, ook als de
# rollback zelf slaagde: de deploy an sich is mislukt en dat moet zichtbaar
# zijn in GitHub Actions.
exit 1
