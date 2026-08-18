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

# ─── Tijdmeting per stap (DEPLOY_SNELHEID_01) ────────────────────────────────
# Elke hoofdstap meldt zijn duur als machine-leesbare regel "TIJD|<stap>|<n>s".
# De GitHub Actions-workflow leest die regels uit de deploy-uitvoer en zet ze
# in de waarschuwingsmail wanneer de totale uitrol de tijdgrens overschrijdt.
STAP_START=$(date +%s)
stap_tijd() {
  local nu; nu=$(date +%s)
  echo "TIJD|$1|$((nu - STAP_START))s"
  STAP_START=$nu
}

# ─── STAP 1: naar de productiemap ────────────────────────────────────────────
cd /opt/fps-one

# ─── PRE-DEPLOYMENT: verplichte omgevingsvariabelen controleren ───────────────
# Stopt de deployment met exit 1 als een verplichte variabele ontbreekt of leeg
# is in deploy/.env.production. Verstuurt geen e-mail hier (mail-config zelf
# kan de ontbrekende variabele zijn) — de foutmelding in de Actions-run is
# de primaire signalering.
echo "=== PRE-CHECK: verplichte omgevingsvariabelen ==="
ENV_BESTAND="deploy/.env.production"
if [ ! -f "${ENV_BESTAND}" ]; then
  echo "FOUT: ${ENV_BESTAND} ontbreekt op de server." >&2
  echo "Zie docs/productie-env-checklist.md voor de installatie-instructies." >&2
  exit 1
fi

VERPLICHTE_VARS=(
  "DATABASE_URL"
  "SESSION_SECRET"
  "OPENAI_API_KEY"
  "GOOGLE_MAPS_API_KEY"
  "MINIO_ROOT_PASSWORD"
  "AZURE_CLIENT_ID"
  "AZURE_CLIENT_SECRET"
  "AZURE_TENANT_ID"
  "MAIL_FROM"
  "MAIL_MAILBOX"
)

ONTBREKENDE_VARS=()
for _VAR in "${VERPLICHTE_VARS[@]}"; do
  _WAARDE=$(grep -E "^${_VAR}=" "${ENV_BESTAND}" 2>/dev/null | head -1 | cut -d'=' -f2- || true)
  if [ -z "${_WAARDE}" ]; then
    ONTBREKENDE_VARS+=("${_VAR}")
  fi
done

if [ "${#ONTBREKENDE_VARS[@]}" -gt 0 ]; then
  echo "FOUT: De volgende verplichte variabelen ontbreken of zijn leeg in ${ENV_BESTAND}:" >&2
  for _VAR in "${ONTBREKENDE_VARS[@]}"; do
    echo "  - ${_VAR}" >&2
  done
  echo "Zie docs/productie-env-checklist.md voor de volledige documentatie." >&2
  exit 1
fi
echo "Pre-check geslaagd: alle ${#VERPLICHTE_VARS[@]} verplichte variabelen aanwezig."

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

# ─── Versiecheck als functie ──────────────────────────────────────────────────
# Controleert dat /api/versie de verwachte commit meldt. Defense-in-depth naast
# de healthcheck: als de nieuwe containers niet starten maar de oude stack nog
# draait, geeft /api/healthz "status":"ok" terwijl de verkeerde code loopt.
# Neemt één argument: de volledige (lange) SHA van de verwachte commit.
# Vergelijkt met de korte hash die de API teruggeeft (GIT_COMMIT = --short).
versiecheck() {
  local verwachte_lang="$1"
  local verwachte_kort
  verwachte_kort="$(git rev-parse --short "${verwachte_lang}")"
  echo "Versiecheck: verwacht commit ${verwachte_kort} op https://connect.fps-one.nl/api/versie ..."
  local pogingen=6   # 6 x 5s = max ~30s extra wachttijd na geslaagde healthcheck
  local i
  for i in $(seq 1 "${pogingen}"); do
    local antwoord commit_in_api
    antwoord="$(curl -fsS --max-time 10 https://connect.fps-one.nl/api/versie 2>/dev/null || true)"
    # Haalt het commit-veld op zonder externe afhankelijkheden (geen jq/node vereist).
    commit_in_api="$(printf '%s' "${antwoord}" | grep -o '"commit":"[^"]*"' | head -1 | cut -d'"' -f4 || true)"
    if [ "${commit_in_api}" = "${verwachte_kort}" ]; then
      echo "Versiecheck geslaagd: /api/versie meldt commit ${commit_in_api} (verwacht ${verwachte_kort})."
      return 0
    fi
    echo "Versiecheck: API meldt '${commit_in_api}', verwacht '${verwachte_kort}' (poging ${i}/${pogingen}), 5s wachten..."
    sleep 5
  done
  echo "FOUT: /api/versie meldt niet de verwachte commit na ${pogingen} pogingen." >&2
  echo "  Verwacht (kort): ${verwachte_kort}" >&2
  echo "  Laatste API-antwoord: ${antwoord}" >&2
  return 1
}

# Controleert dat de monteuromgeving (/app, MONTEUR_NU_01) de nieuwe release
# serveert. De caddy-image bakt versie.json met de korte commit in de
# webexport; wijkt die af, dan draait een oude caddy-image en moet de deploy
# als mislukt gelden (zelfde oordeel als de API-versiecheck).
app_versiecheck() {
  local verwachte_lang="$1"
  local verwachte_kort
  verwachte_kort="$(git rev-parse --short "${verwachte_lang}")"
  echo "Versiecheck /app: verwacht commit ${verwachte_kort} op https://connect.fps-one.nl/app/versie.json ..."
  local pogingen=6
  local i
  for i in $(seq 1 "${pogingen}"); do
    local antwoord commit_in_app
    antwoord="$(curl -fsS --max-time 10 https://connect.fps-one.nl/app/versie.json 2>/dev/null || true)"
    commit_in_app="$(printf '%s' "${antwoord}" | grep -o '"commit":"[^"]*"' | head -1 | cut -d'"' -f4 || true)"
    if [ "${commit_in_app}" = "${verwachte_kort}" ]; then
      echo "Versiecheck /app geslaagd: versie.json meldt commit ${commit_in_app}."
      return 0
    fi
    echo "Versiecheck /app: meldt '${commit_in_app}', verwacht '${verwachte_kort}' (poging ${i}/${pogingen}), 5s wachten..."
    sleep 5
  done
  echo "FOUT: /app/versie.json meldt niet de verwachte commit na ${pogingen} pogingen." >&2
  echo "  Laatste antwoord: ${antwoord}" >&2
  return 1
}

# ─── STAP 2: databaseback-up (bestaande compose backup-opdracht) ─────────────
# --profile backup is vereist: de backup-service zit in het "backup"-profiel
# en is standaard uitgesloten van compose-commando's zonder die vlag.
echo "=== STAP 2: databaseback-up maken ==="
${COMPOSE} --profile backup run --rm -T backup

# Verifieer dat er daadwerkelijk een bruikbare back-up is weggeschreven:
# een deploy zonder werkende back-up mag niet doorgaan.
# Let op: onder set -o pipefail geeft `ls | head` exit 141 (SIGPIPE) zodra er
# veel back-ups staan — head sluit de pipe na de eerste regel. Daarom || true;
# de lege-string-check hieronder vangt het echte foutgeval af.
NIEUWSTE_BACKUP="$(ls -t deploy/db-backups/*.sql.gz 2>/dev/null | head -1 || true)"
if [ -z "${NIEUWSTE_BACKUP}" ] || [ ! -s "${NIEUWSTE_BACKUP}" ]; then
  echo "FOUT: geen (niet-lege) back-up gevonden in deploy/db-backups/." >&2
  exit 1
fi
if command -v gzip >/dev/null 2>&1; then
  gzip -t "${NIEUWSTE_BACKUP}"
fi
echo "Back-up OK: ${NIEUWSTE_BACKUP} ($(du -h "${NIEUWSTE_BACKUP}" | cut -f1))"
stap_tijd "databaseback-up"

# ─── STAP 3: nieuwste code ophalen ───────────────────────────────────────────
echo "=== STAP 3: git fetch origin ==="
git fetch origin

# ─── DEPLOY_COMMIT validatie ─────────────────────────────────────────────────
# DEPLOY_COMMIT (= GITHUB_SHA uit de workflow) moet een volledige 40-tekens
# hex-SHA zijn. Een lege waarde is toegestaan: dan wordt origin/main gebruikt.
# Een ingevulde waarde die géén geldige SHA is (bijv. een taknaam of typefouten)
# wordt hier direct afgeblokt, vóórdat git reset --hard er iets mee doet.
if [ -n "${DEPLOY_COMMIT:-}" ]; then
  if ! printf '%s' "${DEPLOY_COMMIT}" | grep -qE '^[0-9a-f]{40}$'; then
    echo "FOUT: DEPLOY_COMMIT '${DEPLOY_COMMIT}' is geen geldige volledige hex-SHA (40 tekens)." >&2
    echo "Verwacht: 40 hexadecimale tekens (0-9, a-f). Controleer de workflow-configuratie." >&2
    exit 1
  fi
  echo "DEPLOY_COMMIT validatie OK: ${DEPLOY_COMMIT}"
fi

# ─── STAP 4: werkmap exact gelijk zetten aan de uitgerolde commit ────────────
# reset --hard (geen pull): de server volgt de uitgerolde commit altijd exact,
# ook na een force-push of lokale servercommit. De ongetrackte
# deploy/.env.production en deploy/db-backups/ blijven hierbij onaangeroerd.
# DEPLOY_COMMIT komt uit de workflow (GITHUB_SHA): een handmatige dispatch op
# een tak rolt zo écht die tak uit (nodig voor terugval-testruns) in plaats
# van stilzwijgend origin/main. Zonder DEPLOY_COMMIT (handmatig draaien op de
# server) blijft origin/main het veilige standaarddoel.
DEPLOY_DOEL="${DEPLOY_COMMIT:-origin/main}"
echo "=== STAP 4: git reset --hard ${DEPLOY_DOEL} ==="
git reset --hard "${DEPLOY_DOEL}"
echo "Server staat nu op commit: $(git rev-parse HEAD)"

# Versie-informatie voor de images: wordt via build-args in beide images
# gebakken (zie docker-compose.production.yml) en is daarna zichtbaar in de
# taakbalk van de app en via GET /api/versie en GET /api/status — zo is
# controleerbaar dat deze release ook echt draait.
# Typecheck ín het api-image: alleen bij een NOODFIX-uitrol (de workflow geeft
# TYPECHECK_IN_IMAGE=1 mee wanneer de controles vooraf zijn overgeslagen).
# Default veilig "1" voor wie dit script handmatig draait.
export TYPECHECK_IN_IMAGE="${TYPECHECK_IN_IMAGE:-1}"
echo "Typecheck in api-image: ${TYPECHECK_IN_IMAGE} (1=ja/NOODFIX of handmatig, 0=al op de runner gedaan)"
export GIT_COMMIT="$(git rev-parse --short HEAD)"
export GIT_COMMIT_LANG="$(git rev-parse HEAD)"
export BUILD_TIJD="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
export DEPLOY_NUMMER="$(date -u +%Y%m%d%H%M%S)"
# UITROL_BEWAKING_01: gedeelde sleutel voor terugmeldingen van de workflow.
# Reist base64-gecodeerd mee over SSH (shell-veilig, nooit rauw in de
# commandoregel); leeg bij handmatig draaien (endpoint dan 503).
export UITROL_RAPPORT_SLEUTEL="$(printf '%s' "${UITROL_RAPPORT_SLEUTEL_B64:-}" | base64 -d 2>/dev/null || true)"
echo "Release-versie: ${BUILD_TIJD%%T*} — commit ${GIT_COMMIT} (deploy #${DEPLOY_NUMMER})"
stap_tijd "code-ophalen"

# ─── SCHIJFBEWAKING (DEPLOY_SNELHEID_01 punt 5) ──────────────────────────────
# Vóór het bouwen: staat de schijf boven de 85%, dan eerst zelf oude Docker-
# images opruimen. Blijft hij daarna boven de 85%, dan meldt het script dat
# met een machine-leesbare SCHIJF_ALARM-regel; de Actions-workflow verstuurt
# daarop dezelfde faalmail naar René (mail gaat altijd vanaf de runner, de
# server zelf mailt nooit). De uitrol gaat gewoon door — een volle schijf is
# een waarschuwing, het bouwen zelf faalt vanzelf hard als het echt niet past.
SCHIJF_GRENS=85
schijf_pct() {
  local pad="/var/lib/docker"
  [ -d "${pad}" ] || pad="/"
  df -P "${pad}" | awk 'NR==2 {gsub("%","",$5); print $5}'
}
SCHIJF_PCT="$(schijf_pct)"
echo "Schijfgebruik vóór het bouwen: ${SCHIJF_PCT}%"
if [ "${SCHIJF_PCT}" -gt "${SCHIJF_GRENS}" ]; then
  echo "Schijf boven ${SCHIJF_GRENS}% — oude Docker-images opruimen..."
  docker image prune -af || true
  docker builder prune -af || true
  SCHIJF_PCT="$(schijf_pct)"
  echo "Schijfgebruik na opruimen: ${SCHIJF_PCT}%"
  if [ "${SCHIJF_PCT}" -gt "${SCHIJF_GRENS}" ]; then
    echo "SCHIJF_ALARM|${SCHIJF_PCT}"
    echo "WAARSCHUWING: schijf staat ook na opruimen boven ${SCHIJF_GRENS}% (${SCHIJF_PCT}%)." >&2
  fi
fi
stap_tijd "schijfbewaking"

# ─── STAP 5: API bouwen (mét Docker-cache) ───────────────────────────────────
# DEPLOY_SNELHEID_01: --no-cache is hier bewust weggehaald — Docker hergebruikt
# onveranderde lagen (dependencies e.d.), de gewijzigde bronlagen worden altijd
# opnieuw gebouwd omdat de git-checkout net is ververst. De reden waarom
# migrate WEL --no-cache houdt (schema in het image gebakken, incident
# 13 juli 2026) geldt niet voor api en caddy.
echo "=== STAP 5: API-image bouwen ==="
${COMPOSE} build api
stap_tijd "api-image-bouwen"

# ─── STAP 6: database-migraties uitvoeren ────────────────────────────────────
# Het migrate-image MOET zelf ook zonder cache herbouwd worden: het schema zit
# in het image gebakken. Een verouderd migrate-image meldt "geen migraties"
# met exit 0 terwijl er niets is doorgevoerd (dit brak de login op productie
# op 13 juli 2026). Daarom hier: vers bouwen, migreren, en daarna verifiëren.
#
# SCHEMA_01 (aug 2026): drizzle-kit push is vervangen door de migratierunner
# (genummerde bestanden in lib/db/src/migrations/, registratie in
# schema_migraties). Ná de migraties draaien twee onafhankelijke controles:
#  1. schema-healthcheck (bestaand vangnet, kritieke kolommen);
#  2. schema-drift-check (vergelijkt de hele database met lib/db/schema-
#     verwachting.txt en meldt élk verschil in de deploylog).
# ─── STAP 5b: sourcemaps naar Sentry (SENTRY_01) ─────────────────────────────
# Uploadt de sourcemaps uit de zojuist gebouwde api-image naar Sentry, zodat
# stacktraces naar echte bronbestanden wijzen i.p.v. dist/index.mjs. Faalt of
# ontbreekt hier iets, dan gaat de deploy gewoon door — een mislukte
# sourcemap-upload is nooit een reden om een werkende release tegen te houden.
echo "=== STAP 5b: sourcemaps naar Sentry uploaden ==="
# NB: onder set -euo pipefail mag een grep-zonder-treffer de deploy niet
# stoppen — vandaar de expliciete || true.
SENTRY_AUTH_TOKEN="$( (grep -E '^SENTRY_AUTH_TOKEN=' deploy/.env.production 2>/dev/null || true) | head -1 | cut -d= -f2-)"
if [ -z "${SENTRY_AUTH_TOKEN}" ]; then
  echo "WAARSCHUWING: SENTRY_AUTH_TOKEN ontbreekt in deploy/.env.production — sourcemap-upload overgeslagen (deploy gaat door)."
else
  SENTRY_TMP="$(mktemp -d)"
  SENTRY_CID=""
  set +e
  API_IMAGE="$(${COMPOSE} images -q api | head -1 || true)"
  if [ -z "${API_IMAGE}" ]; then
    echo "WAARSCHUWING: api-image niet gevonden — sourcemap-upload overgeslagen."
  else
    SENTRY_CID="$(docker create "${API_IMAGE}")"
    docker cp "${SENTRY_CID}:/app/dist" "${SENTRY_TMP}/dist" \
      && docker run --rm -v "${SENTRY_TMP}/dist:/work" -e SENTRY_AUTH_TOKEN="${SENTRY_AUTH_TOKEN}" \
           getsentry/sentry-cli sourcemaps upload \
           --url https://de.sentry.io \
           --org futur-holding \
           --project fps-connect-api \
           --release "${GIT_COMMIT}" \
           /work \
      && echo "Sourcemaps geüpload voor release ${GIT_COMMIT}." \
      || echo "WAARSCHUWING: sourcemap-upload mislukt — deploy gaat door."
  fi
  [ -n "${SENTRY_CID}" ] && docker rm -f "${SENTRY_CID}" >/dev/null 2>&1
  rm -rf "${SENTRY_TMP}"
  set -e
fi
stap_tijd "sentry-sourcemaps"

echo "=== STAP 6: migraties (migrate-image vers bouwen + migratierunner + verificatie) ==="
${COMPOSE} build --no-cache migrate
${COMPOSE} run --rm -T migrate
${COMPOSE} run --rm -T migrate pnpm --filter @workspace/db run schema-healthcheck
echo "=== STAP 6b: schema-drift-check (database vs. vastgelegde verwachting) ==="
${COMPOSE} run --rm -T migrate pnpm --filter @workspace/db run drift-check
stap_tijd "migraties"

# ─── STAP 7: Caddy/frontend bouwen (mét Docker-cache) ────────────────────────
# Zie stap 5: --no-cache bewust weggehaald (DEPLOY_SNELHEID_01).
echo "=== STAP 7: Caddy/frontend-image bouwen ==="
${COMPOSE} build caddy
stap_tijd "caddy-image-bouwen"

# ─── STAP 8: containers starten ──────────────────────────────────────────────
# LET OP (18 aug 2026): `up -d` mag het script hier NIET afbreken. Toen de
# nieuwe api-container bij het opstarten crashte, faalde `up -d` zelf
# ("dependency failed to start") en stopte set -e het script vóórdat de
# healthcheck en de automatische rollback hieronder ooit draaiden — de kapotte
# stack bleef staan (Caddy hercreëerd maar nooit gestart, site plat). Een
# mislukte start valt daarom bewust door naar de healthcheck, die de rollback
# aftrapt. De api-crashlog wordt direct getoond zodat de oorzaak in de
# Actions-run zichtbaar is.
echo "=== STAP 8: docker compose up -d ==="
if ! ${COMPOSE} up -d --remove-orphans db api caddy; then
  echo "WAARSCHUWING: 'docker compose up' meldde een fout (containerstart mislukt?)." >&2
  echo "--- Api-crashlog (startfout) ---" >&2
  ${COMPOSE} logs --tail=100 api >&2 || true
  echo "Door naar de healthcheck; die rolt zo nodig automatisch terug." >&2
fi
stap_tijd "containers-starten"

# ─── STAP 9 + 10: healthcheck + versiecheck; beide moeten slagen ─────────────
# De healthcheck bewijst dat de API antwoordt. De versiecheck bewijst daarna
# dat de JUISTE release antwoordt. Zonder versiecheck zou een scenario waarbij
# de nieuwe containers crashen maar de oude stack nog draait als geslaagd
# worden gemarkeerd.
echo "=== STAP 9/10: healthcheck + versiecheck ==="
DEPLOY_VERSIE_COMMIT="$(git rev-parse HEAD)"
VERSIECHECK_GESLAAGD=0
if healthcheck; then
  stap_tijd "healthcheck"
  if versiecheck "${DEPLOY_VERSIE_COMMIT}" && app_versiecheck "${DEPLOY_VERSIE_COMMIT}"; then
    # Opschonen van oude images (ouder dan 72u) — alleen bij een gezonde release.
    docker image prune -f --filter "until=72h" || true
    echo "Deploy voltooid: release is gezond en de juiste versie draait (API én /app)."
    exit 0
  fi
  echo "FOUT: healthcheck geslaagd maar versiecheck (API of /app) faalde — de OUDE release draait mogelijk nog." >&2
  echo "Automatische rollback wordt gestart..." >&2
  VERSIECHECK_GESLAAGD=1   # markeer dat healthcheck slaagde maar versiecheck niet (voor logging)
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
  # Versievariabelen verversen: anders bakt de rollback-rebuild het commitlabel
  # van de KAPOTTE release in de images en meldt /api/versie de verkeerde
  # commit terwijl de code wél de vorige gezonde versie is (gezien in de
  # terugvaltestrun van 18 aug 2026).
  export GIT_COMMIT="$(git rev-parse --short HEAD)"
  export GIT_COMMIT_LANG="$(git rev-parse HEAD)"
  export BUILD_TIJD="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  # Ook hier mag een falende build/start het script niet afbreken (set -e):
  # de healthcheck hieronder is het oordeel en meldt anders nooit dat
  # handmatige interventie nodig is.
  ${COMPOSE} build api caddy || echo "WAARSCHUWING: rollback-build meldde een fout." >&2
  if ! ${COMPOSE} up -d --remove-orphans db api caddy; then
    echo "WAARSCHUWING: 'docker compose up' faalde ook tijdens de rollback." >&2
    ${COMPOSE} logs --tail=100 api >&2 || true
  fi
fi

echo "Healthcheck na rollback gestart..."
if healthcheck; then
  # Versiecheck na rollback: bevestig dat de VORIGE commit draait en niet
  # per ongeluk een onbekende tussenstap (bijv. gecachte nieuwe image).
  if versiecheck "${VORIGE_COMMIT}"; then
    echo "Rollback geslaagd: productie draait weer op de vorige gezonde versie (${VORIGE_COMMIT})." >&2
  else
    echo "FOUT: rollback-healthcheck slaagde maar versiecheck meldt verkeerde commit." >&2
    echo "Handmatige interventie vereist — zie deploy/ROLLBACK_PRODUCTION.md (Niveau 2)." >&2
  fi
else
  echo "FOUT: rollback-healthcheck faalt OOK. Handmatige interventie vereist — zie deploy/ROLLBACK_PRODUCTION.md (Niveau 2)." >&2
fi

# De run faalt altijd als de oorspronkelijke healthcheck faalde, ook als de
# rollback zelf slaagde: de deploy an sich is mislukt en dat moet zichtbaar
# zijn in GitHub Actions.
exit 1
