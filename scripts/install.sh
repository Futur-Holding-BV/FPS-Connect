#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  FPS Connect — Eén-commando installatiescript (Linux)
#
#  Ondersteunde systemen: Ubuntu 22.04+, Ubuntu 24.04+, Debian 12+
#
#  Gebruik (als root of via sudo):
#    curl -fsSL https://raw.githubusercontent.com/fps-brandpreventie/fps-connect/main/scripts/install.sh | sudo bash
#
#  Of vanuit de gekloonde repository:
#    sudo bash scripts/install.sh
#
#  Wat dit script doet:
#    1. OS detecteren en vereisten controleren
#    2. Node.js 24 + pnpm 9 installeren
#    3. PostgreSQL 15 installeren en configureren
#    4. Caddy reverse proxy installeren
#    5. Systeemgebruiker 'fps' aanmaken
#    6. Repository klonen (of bestaande gebruiken)
#    7. Omgevingsvariabelen configureren
#    8. Dependencies installeren
#    9. Database initialiseren
#   10. Applicatie bouwen
#   11. Systemd-services aanmaken en starten
#   12. Installatie valideren
#
#  Na installatie: bewerk /etc/fps-connect/api.env met echte secrets.
# ─────────────────────────────────────────────────────────────

set -euo pipefail

# ── Configuratie ──────────────────────────────────────────────
APP_DIR="/opt/fps-connect"
APP_USER="fps"
APP_GROUP="fps"
NODE_VERSION="24"
PNPM_VERSION="9"
PG_VERSION="15"
REPO_URL="${FPS_REPO_URL:-https://github.com/fps-brandpreventie/fps-connect.git}"
REPO_BRANCH="${FPS_REPO_BRANCH:-main}"

# Kleuren voor output
GROEN="\033[0;32m"
GEEL="\033[1;33m"
ROOD="\033[0;31m"
BLAUW="\033[0;34m"
RESET="\033[0m"

# ── Hulpfuncties ──────────────────────────────────────────────
log()    { echo -e "${BLAUW}[install]${RESET} $*"; }
ok()     { echo -e "${GROEN}[  ok  ]${RESET} $*"; }
warn()   { echo -e "${GEEL}[ warn ]${RESET} $*"; }
fout()   { echo -e "${ROOD}[ fout ]${RESET} $*"; exit 1; }

stap() {
  echo ""
  echo -e "${BLAUW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo -e "${BLAUW}  Stap $1: $2${RESET}"
  echo -e "${BLAUW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
}

bevestig() {
  read -r -p "  $1 [j/N] " ant
  [[ "$ant" =~ ^[jJyY]$ ]]
}

# ── Stap 0: Root-controle en OS-detectie ──────────────────────
stap 0 "Vereisten controleren"

if [[ $EUID -ne 0 ]]; then
  fout "Dit script moet als root (of via sudo) worden uitgevoerd."
fi

if [[ ! -f /etc/os-release ]]; then
  fout "Geen /etc/os-release gevonden — ondersteund OS niet herkend."
fi

source /etc/os-release

case "$ID" in
  ubuntu|debian) ok "OS herkend: $PRETTY_NAME" ;;
  *) warn "Niet getest op $PRETTY_NAME — doorgaan op eigen risico."
     bevestig "Toch doorgaan?" || exit 0 ;;
esac

command -v curl  >/dev/null || apt-get install -y curl
command -v git   >/dev/null || apt-get install -y git
command -v gnupg >/dev/null || apt-get install -y gnupg

ok "Basisvereisten aanwezig"

# ── Stap 1: Node.js 24 ────────────────────────────────────────
stap 1 "Node.js ${NODE_VERSION} installeren"

if node --version 2>/dev/null | grep -q "^v${NODE_VERSION}"; then
  ok "Node.js $(node --version) al geïnstalleerd"
else
  log "NodeSource repository toevoegen..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash -
  apt-get install -y nodejs
  ok "Node.js $(node --version) geïnstalleerd"
fi

# ── Stap 2: pnpm ──────────────────────────────────────────────
stap 2 "pnpm ${PNPM_VERSION} installeren"

if command -v pnpm >/dev/null; then
  ok "pnpm $(pnpm --version) al geïnstalleerd"
else
  npm install -g pnpm@${PNPM_VERSION} --no-update-notifier
  ok "pnpm $(pnpm --version) geïnstalleerd"
fi

# ── Stap 3: PostgreSQL 15 ─────────────────────────────────────
stap 3 "PostgreSQL ${PG_VERSION} installeren"

if command -v psql >/dev/null && psql --version | grep -q "${PG_VERSION}"; then
  ok "PostgreSQL ${PG_VERSION} al geïnstalleerd"
else
  log "PostgreSQL repository toevoegen..."
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    | gpg --dearmor -o /usr/share/keyrings/postgresql.gpg
  echo "deb [signed-by=/usr/share/keyrings/postgresql.gpg] \
    https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list
  apt-get update
  apt-get install -y postgresql-${PG_VERSION}
  systemctl enable postgresql
  systemctl start postgresql
  ok "PostgreSQL ${PG_VERSION} geïnstalleerd en gestart"
fi

# Database aanmaken
DB_NAAM="fps_connect"
DB_GEBRUIKER="fps_db"
DB_WACHTWOORD=$(openssl rand -hex 32)

if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_GEBRUIKER}'" | grep -q 1; then
  ok "PostgreSQL-gebruiker '${DB_GEBRUIKER}' bestaat al"
else
  sudo -u postgres psql -c "CREATE USER ${DB_GEBRUIKER} WITH PASSWORD '${DB_WACHTWOORD}';"
  sudo -u postgres psql -c "CREATE DATABASE ${DB_NAAM} OWNER ${DB_GEBRUIKER};"
  sudo -u postgres psql -d ${DB_NAAM} -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"
  sudo -u postgres psql -d ${DB_NAAM} -c "CREATE EXTENSION IF NOT EXISTS \"pg_trgm\";"
  ok "Database '${DB_NAAM}' aangemaakt"
fi

DATABASE_URL="postgresql://${DB_GEBRUIKER}:${DB_WACHTWOORD}@localhost:5432/${DB_NAAM}"

# ── Stap 4: Caddy ─────────────────────────────────────────────
stap 4 "Caddy reverse proxy installeren"

if command -v caddy >/dev/null; then
  ok "Caddy $(caddy version | head -1) al geïnstalleerd"
else
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
    | gpg --dearmor -o /usr/share/keyrings/caddy.gpg
  echo "deb [signed-by=/usr/share/keyrings/caddy.gpg] \
    https://dl.cloudsmith.io/public/caddy/stable/deb/debian any-version main" \
    > /etc/apt/sources.list.d/caddy.list
  apt-get update
  apt-get install -y caddy
  ok "Caddy geïnstalleerd"
fi

# ── Stap 5: Systeemgebruiker aanmaken ─────────────────────────
stap 5 "Systeemgebruiker '${APP_USER}' aanmaken"

if id "${APP_USER}" &>/dev/null; then
  ok "Gebruiker '${APP_USER}' bestaat al"
else
  useradd --system --shell /bin/bash --create-home \
    --home-dir /home/${APP_USER} \
    --comment "FPS Connect service account" \
    "${APP_USER}"
  ok "Gebruiker '${APP_USER}' aangemaakt"
fi

# ── Stap 6: Repository ────────────────────────────────────────
stap 6 "Repository ophalen"

if [[ -d "${APP_DIR}/.git" ]]; then
  ok "Repository bestaat al op ${APP_DIR}"
  log "Nieuwste code ophalen..."
  sudo -u ${APP_USER} git -C "${APP_DIR}" pull --ff-only origin "${REPO_BRANCH}" || warn "Git pull mislukt — ga verder met bestaande code"
elif [[ -f "$(pwd)/pnpm-workspace.yaml" ]]; then
  # Script draait vanuit de repository — gebruik huidige directory
  APP_DIR="$(pwd)"
  ok "Draait vanuit bestaande repository: ${APP_DIR}"
else
  log "Repository klonen naar ${APP_DIR}..."
  git clone --branch "${REPO_BRANCH}" "${REPO_URL}" "${APP_DIR}"
  chown -R ${APP_USER}:${APP_GROUP} "${APP_DIR}"
  ok "Repository gekloned"
fi

# ── Stap 7: Omgevingsvariabelen ───────────────────────────────
stap 7 "Omgevingsvariabelen configureren"

ENV_DIR="/etc/fps-connect"
ENV_API="${ENV_DIR}/api.env"
mkdir -p "${ENV_DIR}"
chmod 750 "${ENV_DIR}"

SESSION_SECRET=$(openssl rand -hex 64)

if [[ -f "${ENV_API}" ]]; then
  ok "api.env bestaat al — niet overschreven"
  warn "Controleer ${ENV_API} voor ontbrekende variabelen"
else
  cat > "${ENV_API}" << ENVEOF
# FPS Connect API — omgevingsvariabelen
# Bewerk dit bestand met echte waarden na installatie.
NODE_ENV=production
PORT=8080
DATABASE_URL=${DATABASE_URL}
SESSION_SECRET=${SESSION_SECRET}

# Object storage — VUL IN
S3_ENDPOINT=https://s3.example.com
S3_REGION=eu-west-1
S3_BUCKET=fps-connect-bestanden
S3_ACCESS_KEY_ID=WIJZIG_MIJ
S3_SECRET_ACCESS_KEY=WIJZIG_MIJ

# Microsoft Graph — VUL IN
AZURE_TENANT_ID=WIJZIG_MIJ
AZURE_CLIENT_ID_NEW=WIJZIG_MIJ
AZURE_CLIENT_SECRET=WIJZIG_MIJ
MAIL_MAILBOX=postbus@fps-brandpreventie.nl
MAIL_FROM=FPS Connect <noreply@fps-brandpreventie.nl>

# AI — VUL IN
OPENAI_API_KEY=WIJZIG_MIJ

# Google Maps — VUL IN (optioneel)
GOOGLE_MAPS_API_KEY=WIJZIG_MIJ
ENVEOF
  chmod 600 "${ENV_API}"
  chown root:${APP_GROUP} "${ENV_API}"
  ok "api.env aangemaakt in ${ENV_API}"
fi

# Frontend feature flags
ENV_WEB="${APP_DIR}/artifacts/firevault/.env"
if [[ ! -f "${ENV_WEB}" ]]; then
  cat > "${ENV_WEB}" << WEBEOF
PORT=3000
BASE_PATH=/
VITE_FEATURE_PLANNING=true
VITE_FEATURE_CALCULATIE=false
WEBEOF
  ok "Frontend .env aangemaakt"
fi

# ── Stap 8: Dependencies installeren ─────────────────────────
stap 8 "pnpm dependencies installeren"

cd "${APP_DIR}"
sudo -u ${APP_USER} pnpm install --frozen-lockfile
ok "Dependencies geïnstalleerd"

# Codegeneratie (types + hooks)
sudo -u ${APP_USER} pnpm --filter @workspace/api-spec run codegen 2>/dev/null || warn "Codegen mislukt — continue"
ok "Codegeneratie klaar"

# ── Stap 9: Database initialiseren ────────────────────────────
stap 9 "Database schema initialiseren"

export DATABASE_URL="${DATABASE_URL}"
sudo -u ${APP_USER} -E DATABASE_URL="${DATABASE_URL}" \
  pnpm --filter @workspace/db run push || warn "DB push mislukt — schema mogelijk al aanwezig"
ok "Database schema toegepast"

# ── Stap 10: Applicatie bouwen ────────────────────────────────
stap 10 "Applicatie bouwen"

# API-server
sudo -u ${APP_USER} pnpm --filter @workspace/api-server run build
ok "API-server gebouwd"

# Frontend
sudo -u ${APP_USER} -E PORT=3000 -E BASE_PATH=/ \
  pnpm --filter @workspace/firevault run build
ok "Frontend gebouwd"

# ── Stap 11: Systemd-services ─────────────────────────────────
stap 11 "Systemd-services aanmaken"

# API-server service
cat > /etc/systemd/system/fps-api.service << SVCEOF
[Unit]
Description=FPS Connect API Server
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=${APP_USER}
Group=${APP_GROUP}
WorkingDirectory=${APP_DIR}/artifacts/api-server
EnvironmentFile=${ENV_API}
ExecStart=/usr/bin/node --enable-source-maps ./dist/index.mjs
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=fps-api

# Beveiligingsbeperkingen
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=${APP_DIR}

[Install]
WantedBy=multi-user.target
SVCEOF

# Caddy configuratie
DOMAIN_NAAM="${FPS_DOMAIN:-connect.fps-brandpreventie.nl}"
ACME_EMAIL_ADDR="${FPS_ACME_EMAIL:-beheerder@fps-brandpreventie.nl}"

mkdir -p /etc/caddy
cat > /etc/caddy/Caddyfile << CADDYEOF
{
  admin off
  email ${ACME_EMAIL_ADDR}
}

${DOMAIN_NAAM} {
  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
    X-Content-Type-Options "nosniff"
    X-Frame-Options "SAMEORIGIN"
    -Server
  }

  handle /api/* {
    reverse_proxy localhost:8080
  }

  handle {
    root * ${APP_DIR}/artifacts/firevault/dist
    try_files {path} {path}/ /index.html
    file_server
  }
}
CADDYEOF

systemctl daemon-reload
systemctl enable fps-api
systemctl start fps-api || warn "fps-api start mislukt — controleer ${ENV_API}"
systemctl enable caddy
systemctl restart caddy || warn "Caddy start mislukt — controleer domein en poorten"
ok "Services aangemaakt en gestart"

# ── Stap 12: Validatie ────────────────────────────────────────
stap 12 "Installatie valideren"

sleep 5  # Wacht tot API opgestart is

API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/healthz 2>/dev/null || echo "000")
if [[ "$API_STATUS" == "200" ]]; then
  ok "API bereikbaar (HTTP 200)"
else
  warn "API niet bereikbaar (HTTP ${API_STATUS}) — controleer logs: journalctl -u fps-api -n 50"
fi

# ── Afsluiting ────────────────────────────────────────────────
echo ""
echo -e "${GROEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${GROEN}  FPS Connect installatie voltooid!${RESET}"
echo -e "${GROEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""
echo "  Volgende stappen:"
echo "  1. Vul de secrets in:   sudo nano ${ENV_API}"
echo "  2. Herstart de API:     sudo systemctl restart fps-api"
echo "  3. Volledige validatie: sudo -u ${APP_USER} pnpm --filter @workspace/scripts run valideer-installatie"
echo "  4. Beheerder aanmaken:  zie docs/herbouw/rollen-rechten.md"
echo ""
echo "  Logs bekijken:"
echo "    journalctl -u fps-api -f"
echo "    journalctl -u caddy -f"
echo ""
echo "  Database:"
echo "    DATABASE_URL=${DATABASE_URL}"
echo "    (bewaar dit op een veilige plek)"
echo ""
