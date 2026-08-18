#!/bin/bash
set -e
# Zorg dat workspace-binaries (waaronder tsc) bereikbaar zijn, ook in non-login
# omgevingen zoals de post-merge runner (prepare lifecycle roept tsc --build aan).
export PATH="$PWD/node_modules/.bin:$PATH"

# ─── Pre-taak sync-verificatie ───────────────────────────────────────────────
# BLOKKEREND (MERGE_01 §3.1): als GitHub main commits bevat die lokaal
# ontbreken, stopt het proces met exit 1 vóór de merge wordt verwerkt.
# Mergen vanuit een verouderde werkruimte heeft op 8 aug 2026 vijf keer
# eerder hersteld werk overschreven (gemangelde routebestanden).
# Zonder GITHUB_TOKEN_PUSH is niet vast te stellen of de werkruimte actueel
# is — dan wordt er dus óók geblokkeerd, niet stilzwijgend overgeslagen.
if [ -z "${GITHUB_TOKEN_PUSH:-}" ]; then
  echo "====================================================" >&2
  echo "FOUT: GITHUB_TOKEN_PUSH ontbreekt — kan niet controleren of de" >&2
  echo "werkruimte gelijk loopt met GitHub main. Mergen vanuit een mogelijk" >&2
  echo "verouderde werkruimte is niet toegestaan (MERGE_01 §3.1)." >&2
  echo "Stel GITHUB_TOKEN_PUSH in als Replit-secret en probeer opnieuw." >&2
  echo "====================================================" >&2
  exit 1
else
  _PRESYNC_ASKPASS=$(mktemp /tmp/fps-presync-askpass-XXXXXX)
  chmod 700 "$_PRESYNC_ASKPASS"
  cat > "$_PRESYNC_ASKPASS" << 'PRESYNC_ASKPASS_EOF'
#!/bin/bash
case "$1" in
  Username*) echo "x-access-token" ;;
  Password*) echo "${GITHUB_TOKEN_PUSH}" ;;
esac
PRESYNC_ASKPASS_EOF
  export GIT_ASKPASS="$_PRESYNC_ASKPASS"
  trap 'rm -f "$_PRESYNC_ASKPASS"; unset GIT_ASKPASS' EXIT INT TERM

  set +e
  git fetch "https://github.com/Futur-Holding-BV/FPS-Connect.git" \
    "main:refs/remotes/fps-presync/main" 2>/dev/null
  _PRESYNC_FETCH_EXIT=$?
  set -e

  unset GIT_ASKPASS
  rm -f "$_PRESYNC_ASKPASS"
  trap - EXIT INT TERM

  if [ "$_PRESYNC_FETCH_EXIT" -ne 0 ]; then
    echo "====================================================" >&2
    echo "FOUT: kon GitHub main niet ophalen (fetch exit ${_PRESYNC_FETCH_EXIT})." >&2
    echo "Zonder geslaagde sync-controle mag er niet gemerged worden" >&2
    echo "(MERGE_01 §3.1). Controleer netwerk/token en probeer opnieuw." >&2
    echo "====================================================" >&2
    exit 1
  fi
  _REMOTE_SHA=$(git rev-parse refs/remotes/fps-presync/main 2>/dev/null || echo "")
  if [ -n "$_REMOTE_SHA" ] && \
     ! git merge-base --is-ancestor "$_REMOTE_SHA" HEAD 2>/dev/null; then
    echo "====================================================" >&2
    echo "FOUT: GitHub main (${_REMOTE_SHA:0:8}) bevat commits die lokaal" >&2
    echo "ontbreken. Mergen vanuit deze verouderde werkruimte zou die" >&2
    echo "commits overschrijven — de merge is GEBLOKKEERD (MERGE_01 §3.1)." >&2
    echo "Ontbrekende remote commits:" >&2
    git log --oneline HEAD.."refs/remotes/fps-presync/main" 2>/dev/null \
      | head -10 >&2 || true
    echo "" >&2
    echo "Herstel: haal eerst main binnen en verwerk de merge daarna opnieuw:" >&2
    echo "  git pull https://github.com/Futur-Holding-BV/FPS-Connect.git main" >&2
    echo "====================================================" >&2
    exit 1
  fi
  echo "Sync-controle geslaagd: werkruimte bevat GitHub main (${_REMOTE_SHA:0:8})."
fi

# ─── Fallback-melding-hulpfunctie ────────────────────────────────────────────
# Probeert een tekstmelding te sturen via Slack of ntfy als de Graph-e-mail
# niet beschikbaar is. Stopt het script NIET bij een fout.
# Gebruik: _stuur_fallback_melding "<titel>" "<berichttekst>"
_stuur_fallback_melding() {
  local _TITEL="${1:-FPS Connect: post-merge FOUT}"
  local _BERICHT="${2:-Onbekende fout}"
  local _GESLAAGD=0

  if [ -n "${SLACK_WEBHOOK_URL:-}" ]; then
    local _SLACK_PAYLOAD
    _SLACK_PAYLOAD=$(TITEL="$_TITEL" BERICHT="$_BERICHT" node -e "
      const tekst = process.env.TITEL + '\n' + process.env.BERICHT;
      console.log(JSON.stringify({ text: tekst }));
    " 2>/dev/null || true)
    if [ -n "${_SLACK_PAYLOAD:-}" ]; then
      local _SLACK_HTTP
      _SLACK_HTTP=$(curl -sS -o /dev/null -w "%{http_code}" \
        -X POST "${SLACK_WEBHOOK_URL}" \
        -H "Content-Type: application/json" \
        -d "$_SLACK_PAYLOAD" 2>/dev/null || echo "000")
      if [ "${_SLACK_HTTP:-000}" -ge 200 ] && [ "${_SLACK_HTTP:-000}" -lt 300 ]; then
        echo "Fallback-melding verzonden via Slack webhook."
        _GESLAAGD=1
      else
        echo "WAARSCHUWING: Slack webhook gaf HTTP ${_SLACK_HTTP:-000}; Slack-melding niet bezorgd." >&2
      fi
    fi
  fi

  if [ "$_GESLAAGD" -eq 0 ] && [ -n "${NTFY_URL:-}" ]; then
    local _NTFY_HTTP
    _NTFY_HTTP=$(curl -sS -o /dev/null -w "%{http_code}" \
      -X POST "${NTFY_URL}" \
      -H "Title: ${_TITEL}" \
      -H "Priority: high" \
      -H "Tags: warning,fps" \
      --data-raw "$_BERICHT" 2>/dev/null || echo "000")
    if [ "${_NTFY_HTTP:-000}" -ge 200 ] && [ "${_NTFY_HTTP:-000}" -lt 300 ]; then
      echo "Fallback-melding verzonden via ntfy (${NTFY_URL})."
      _GESLAAGD=1
    else
      echo "WAARSCHUWING: ntfy gaf HTTP ${_NTFY_HTTP:-000}; ntfy-melding niet bezorgd." >&2
    fi
  fi

  if [ "$_GESLAAGD" -eq 0 ]; then
    echo "WAARSCHUWING: Geen fallback-kanaal beschikbaar (SLACK_WEBHOOK_URL en NTFY_URL zijn niet ingesteld of bereikbaar). Stel minstens één in als Replit-secret." >&2
  fi
}

# ─── Faalmelding-hulpfunctie ─────────────────────────────────────────────────
# Verstuurt een e-mail via Microsoft 365/Graph (client-credentials) wanneer een
# post-merge stap mislukt. Wordt aangeroepen vanuit de ERR-trap hieronder én
# vanuit de push-mislukking-handler in stap 7.
# Als de Graph-e-mail niet beschikbaar is, wordt _stuur_fallback_melding
# aangeroepen zodat de melding altijd ergens aankomt.
# Gebruik: _stuur_faalmelding "<stapnaam>" "<commit-sha>" "<extra-tekst>"
_stuur_faalmelding() {
  local _STAP="${1:-onbekend}"
  local _SHA="${2:-onbekend}"
  local _EXTRA="${3:-}"
  local _TIJDSTIP
  _TIJDSTIP=$(date -u '+%Y-%m-%d %H:%M:%S UTC')

  echo "========================================================" >&2
  echo "FOUT: Post-merge stap mislukt: ${_STAP}" >&2
  echo "Commit:    ${_SHA}" >&2
  echo "Tijdstip:  ${_TIJDSTIP}" >&2
  echo "========================================================" >&2

  local _MAIL_BODY="Post-merge stap MISLUKT op de Replit-omgeving.

Stap:      ${_STAP}
Commit:    ${_SHA}
Tijdstip:  ${_TIJDSTIP}${_EXTRA:+
${_EXTRA}}

Herstelprocedure:
  1. Controleer de Replit workflow-logs voor de exacte foutmelding van bovenstaande stap.
  2. Los het probleem op (bijv. ontbrekende kolom, mislukte seed, schema-mismatch).
  3. Voer de stap handmatig opnieuw uit of start een nieuwe merge om het script opnieuw te draaien.
  4. Zie docs/PRODUCTION_RUNBOOK.md voor het volledige deploybeleid.

De productie-VPS (connect.fps-one.nl) is mogelijk NIET bijgewerkt met de laatste wijzigingen."

  local _MAIL_TITEL="FPS Connect: post-merge stap MISLUKT"

  if [ -z "${AZURE_TENANT_ID:-}" ] || [ -z "${AZURE_CLIENT_ID:-}" ] || \
     [ -z "${AZURE_CLIENT_SECRET:-}" ] || [ -z "${RENE_ALERT_EMAIL:-}" ]; then
    echo "INFO: AZURE_TENANT_ID/AZURE_CLIENT_ID/AZURE_CLIENT_SECRET/RENE_ALERT_EMAIL niet ingesteld — e-mailmelding overgeslagen, fallback wordt geprobeerd." >&2
    _stuur_fallback_melding "$_MAIL_TITEL" "$_MAIL_BODY"
    return
  fi

  local _MAIL_FROM="${MAIL_FROM:-noreply@fpsbrandpreventie.nl}"
  local _MAIL_MAILBOX="${MAIL_MAILBOX:-app@fpsbrandpreventie.nl}"

  local _GRAPH_TOKEN
  _GRAPH_TOKEN=$(curl -fsS -X POST \
    "https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/token" \
    -d "client_id=${AZURE_CLIENT_ID}" \
    -d "client_secret=${AZURE_CLIENT_SECRET}" \
    -d "scope=https://graph.microsoft.com/.default" \
    -d "grant_type=client_credentials" 2>/dev/null \
    | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).access_token||'')}catch(e){console.log('')}})" 2>/dev/null || true)

  if [ -z "${_GRAPH_TOKEN:-}" ]; then
    echo "WAARSCHUWING: Kon geen Graph-token ophalen; e-mailmelding overgeslagen, fallback wordt geprobeerd." >&2
    _stuur_fallback_melding "$_MAIL_TITEL" "$_MAIL_BODY"
    return
  fi

  local _PAYLOAD
  _PAYLOAD=$(MAIL_BODY="$_MAIL_BODY" RENE_EMAIL="$RENE_ALERT_EMAIL" MAIL_FROM="$_MAIL_FROM" node -e "
    const body = {
      message: {
        subject: 'FPS Connect: post-merge stap MISLUKT',
        body: { contentType: 'Text', content: process.env.MAIL_BODY },
        toRecipients: [{ emailAddress: { address: process.env.RENE_EMAIL } }],
        from: { emailAddress: { address: process.env.MAIL_FROM, name: 'FPS Connect' } },
      },
      saveToSentItems: false,
    };
    console.log(JSON.stringify(body));
  " 2>/dev/null || true)

  if [ -n "${_PAYLOAD:-}" ]; then
    local _HTTP
    _HTTP=$(curl -sS -o /tmp/fps-graph-mail-response.json -w "%{http_code}" \
      -X POST "https://graph.microsoft.com/v1.0/users/${_MAIL_MAILBOX}/sendMail" \
      -H "Authorization: Bearer ${_GRAPH_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "$_PAYLOAD" 2>/dev/null || echo "000")
    if [ "${_HTTP:-000}" -ge 200 ] && [ "${_HTTP:-000}" -lt 300 ]; then
      echo "E-mailmelding verzonden naar ${RENE_ALERT_EMAIL}."
    else
      echo "WAARSCHUWING: Graph sendMail gaf HTTP ${_HTTP:-000}; e-mailmelding niet bezorgd, fallback wordt geprobeerd." >&2
      _stuur_fallback_melding "$_MAIL_TITEL" "$_MAIL_BODY"
    fi
    rm -f /tmp/fps-graph-mail-response.json
  fi
}

# ─── ERR-trap voor stappen 1-6 ───────────────────────────────────────────────
# Wordt door bash aangeroepen zodra een commando een niet-nul exitcode geeft
# (gecombineerd met set -e). _HUIDIGE_STAP bijhouden zodat de melding vermeldt
# welke stap precies faalde.
_HUIDIGE_STAP="pnpm install"
_MERGE_SHA=$(git rev-parse HEAD 2>/dev/null || echo "onbekend")
trap '_stuur_faalmelding "$_HUIDIGE_STAP" "$_MERGE_SHA"' ERR

pnpm install --frozen-lockfile

# Stap 0b: Migratienummer-botsingscontrole (MIGRATIE_DUBBEL / SCHEMA_01)
# Vangt dubbele migratienummers en hernoemde/verwijderde bestanden op VOOR de
# migratierunner ze tegenkomt. Incident 18-08-2026: botsing 0083 blokkeerde
# alle uitrol; de controle bestond al (check-hernoeming) maar draaide pas in
# CI ná de push. Door hem hier te herhalen wordt een botsing direct bij de
# merge gesignaleerd in de Replit workflow-log.
_HUIDIGE_STAP="Stap 0b: migratienummer-botsingscontrole (MIGRATIE_DUBBEL)"
pnpm --filter @workspace/db run check-hernoeming

# Stap 1-3 (SCHEMA_01): genummerde migraties draaien + drift-check.
# De oude keten apply-additive → reconcile → drizzle-kit push --force is
# vervallen: push is bevroren sinds SCHEMA_01 en liep in non-TTY merges vast
# op interactieve prompts (incident taak #890: opnames_nummer_unique).
# Taak-agenten leveren schemawijzigingen als genummerde migratie in
# lib/db/src/migrations/; de runner is idempotent en non-interactief.
_HUIDIGE_STAP="Stap 1: migraties (SCHEMA_01)"
pnpm --filter @workspace/db run migrate

# Drift-check waarschuwt (niet-fataal) als schema en database uiteenlopen —
# dat betekent dat een merge een drizzle-schemawijziging zonder migratie
# meebracht; de agent moet die dan alsnog als migratie aanleveren.
_HUIDIGE_STAP="Stap 2: drift-check"
pnpm --filter @workspace/db run drift-check || \
  echo "WAARSCHUWING: schema-drift gedetecteerd — schemawijziging zonder genummerde migratie in de merge? Agent moet 'm aanvullen." >&2

# Stap 4: Schema-healthcheck — voert een lees-only SELECT uit op de kerntabellen om te
# bevestigen dat alle kritieke kolommen daadwerkelijk aanwezig zijn in de database.
# Faalt met exit 1 en een duidelijke foutmelding als een tabel of kolom ontbreekt.
# De merge wordt alleen groen gerapporteerd als deze stap slaagt.
_HUIDIGE_STAP="Stap 4: schema-healthcheck"
pnpm --filter @workspace/db run schema-healthcheck

# Stap 4b: Additieve DB-migraties onboarding-wizard (idempotent; IF NOT EXISTS).
# Nieuwe kolommen op medewerkers + drie nieuwe tabellen voor de 14-stappen wizard.
_HUIDIGE_STAP="Stap 4b: onboarding-wizard migraties"
psql "$DATABASE_URL" <<'WIZARD_SQL'
-- medewerkers: wizard-kolommen (additief)
ALTER TABLE medewerkers ADD COLUMN IF NOT EXISTS medewerker_status TEXT DEFAULT 'concept';
ALTER TABLE medewerkers ADD COLUMN IF NOT EXISTS wizard_voortgang JSONB;

-- hrm_middelen
CREATE TABLE IF NOT EXISTS hrm_middelen (
  id SERIAL PRIMARY KEY,
  medewerker_id INTEGER NOT NULL REFERENCES medewerkers(id) ON DELETE CASCADE,
  categorie TEXT NOT NULL DEFAULT 'overig',
  naam TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'aangevraagd',
  retour_vereist BOOLEAN NOT NULL DEFAULT FALSE,
  gekoppeld_module TEXT,
  aangevraagd_op TIMESTAMP,
  uitgegeven_op TIMESTAMP,
  ontvangst_bevestigd_op TIMESTAMP,
  opmerking TEXT,
  aangevraagd_door_id INTEGER REFERENCES gebruikers(id) ON DELETE SET NULL,
  aangemaakt_op TIMESTAMP NOT NULL DEFAULT NOW(),
  bijgewerkt_op TIMESTAMP NOT NULL DEFAULT NOW()
);

-- hrm_onboarding_taken
CREATE TABLE IF NOT EXISTS hrm_onboarding_taken (
  id SERIAL PRIMARY KEY,
  medewerker_id INTEGER NOT NULL REFERENCES medewerkers(id) ON DELETE CASCADE,
  naam TEXT NOT NULL,
  verantwoordelijke_id INTEGER REFERENCES gebruikers(id) ON DELETE SET NULL,
  deadline TEXT,
  status TEXT NOT NULL DEFAULT 'openstaand',
  bewijs_document_id INTEGER REFERENCES documenten(id) ON DELETE SET NULL,
  opmerking TEXT,
  herinnering_op TIMESTAMP,
  categorie TEXT DEFAULT 'overig',
  volgorde INTEGER DEFAULT 0,
  aangemaakt_op TIMESTAMP NOT NULL DEFAULT NOW(),
  bijgewerkt_op TIMESTAMP NOT NULL DEFAULT NOW()
);

-- hrm_ai_voorstellen
CREATE TABLE IF NOT EXISTS hrm_ai_voorstellen (
  id SERIAL PRIMARY KEY,
  medewerker_id INTEGER NOT NULL REFERENCES medewerkers(id) ON DELETE CASCADE,
  document_id INTEGER REFERENCES documenten(id) ON DELETE SET NULL,
  medewerker_document_id INTEGER,
  veld TEXT NOT NULL,
  huidige_waarde TEXT,
  voorgestelde_waarde TEXT,
  reden TEXT,
  brondocument TEXT,
  paginanummer INTEGER,
  confidence REAL,
  vertrouwen_score REAL,
  bewijskenmerken JSONB,
  impact TEXT DEFAULT 'laag',
  status TEXT NOT NULL DEFAULT 'open',
  beoordeeld_door_id INTEGER REFERENCES gebruikers(id) ON DELETE SET NULL,
  beoordeeld_op TIMESTAMP,
  model_gebruikt TEXT,
  correctie_tekst TEXT,
  aangemaakt_op TIMESTAMP NOT NULL DEFAULT NOW(),
  bijgewerkt_op TIMESTAMP NOT NULL DEFAULT NOW()
);
WIZARD_SQL

# Stap 5: Seed Document Studio-model voor opleverrapport (idempotent; slaat over als reeds aanwezig).
_HUIDIGE_STAP="Stap 5: seed-studio-opleverrapport"
pnpm --filter @workspace/scripts run seed-studio-opleverrapport

# Stap 6: Seed standaard rechten-profielen (presets). INSERT-ONLY en idempotent:
# ontbrekende systeem-presets worden aangemaakt, bestaande NOOIT overschreven
# (handmatige aanpassingen blijven behouden). Voorkomt lege profielen-tabel →
# "kies functie" die geen bevoegdheden vult.
_HUIDIGE_STAP="Stap 6: seed-profielen"
pnpm --filter @workspace/scripts run seed-profielen

# Stap 6b (taak #938): tweede vangnet tegen gemangelde bestanden.
# De primaire poort is de git pre-push hook (.githooks/pre-push); deze stap
# vangt merges die buiten die hook om binnenkomen (taakagent-merges).
# BLOKKEREND: bij een rode typecheck of opmaakschade stopt het script vóór
# de GitHub-push, zodat een kapot bestand nooit richting productie gaat.
# Gecontroleerd wordt de VOLLEDIGE door de merge geïntroduceerde range:
# alles wat GitHub main (presync-ref uit de sync-controle) nog niet heeft.
# Zonder bruikbare basis (geen presync-ref) valt de controle terug op HEAD.
_HUIDIGE_STAP="Stap 6b: opmaakschade-controle (merge-mangeling)"
_OPMAAK_BASIS=$(git rev-parse -q --verify refs/remotes/fps-presync/main 2>/dev/null || echo "")
if [ -n "$_OPMAAK_BASIS" ] && git merge-base --is-ancestor "$_OPMAAK_BASIS" HEAD 2>/dev/null; then
  node scripts/git/check-opmaakschade.mjs "${_OPMAAK_BASIS}..HEAD"
else
  node scripts/git/check-opmaakschade.mjs HEAD
fi

_HUIDIGE_STAP="Stap 6c: volledige workspace-typecheck"
pnpm run typecheck

# Stappen 1-6 voltooid — verwijder de ERR-trap; stap 7 heeft eigen foutafhandeling.
trap - ERR

# Stap 7: Push naar GitHub zodat GitHub Actions (deploy.yml) automatisch triggert
# en de productie-VPS (connect.fps-one.nl) binnen 15 minuten de nieuwe code draait.
# Faalt niet-fataal: als de push mislukt wordt een waarschuwing geprint maar stopt
# het post-merge script NIET (set -e wordt tijdelijk uitgeschakeld).
#
# Authenticatie via directe token-URL ("https://x-access-token:TOKEN@github.com/...").
# GIT_ASKPASS wordt bewust NIET gebruikt: het tijdelijke hulpscript verdwijnt in de
# post-merge sandbox vóórdat git het kan uitvoeren (race-condition, exit 128).
# De token-URL wordt alleen in geheugen gehouden en nooit in .git/config opgeslagen.
if [ -z "${GITHUB_TOKEN_PUSH:-}" ]; then
  echo "WAARSCHUWING: GITHUB_TOKEN_PUSH is niet ingesteld — push naar GitHub overgeslagen." >&2
  echo "Stel GITHUB_TOKEN_PUSH in als Replit-secret om automatische deploys te activeren." >&2
else
  LOCAL_SHA=$(git rev-parse HEAD)
  _GH_URL="https://x-access-token:${GITHUB_TOKEN_PUSH}@github.com/Futur-Holding-BV/FPS-Connect.git"

  # Valideer het token via de GitHub API vóór de push.
  set +e
  HEADERS_FILE=$(mktemp /tmp/fps-gh-headers-XXXXXX)
  GH_HTTP=$(curl -sS \
    -o /tmp/fps-gh-user.json \
    -D "$HEADERS_FILE" \
    -w "%{http_code}" \
    -H "Authorization: token ${GITHUB_TOKEN_PUSH}" \
    -H "Accept: application/vnd.github.v3+json" \
    https://api.github.com/user 2>/dev/null)
  GH_CURL_EXIT=$?
  set -e

  if [ "$GH_CURL_EXIT" -ne 0 ]; then
    echo "WAARSCHUWING: GitHub API niet bereikbaar (curl exit $GH_CURL_EXIT) — push wordt toch geprobeerd." >&2
  elif [ "$GH_HTTP" -eq 401 ] || [ "$GH_HTTP" -eq 403 ]; then
    echo "========================================================" >&2
    echo "FOUT: GITHUB_TOKEN_PUSH is verlopen of ongeldig (HTTP $GH_HTTP)." >&2
    echo "De automatische deploy naar connect.fps-one.nl werkt NIET." >&2
    echo "" >&2
    echo "Token vernieuwen:" >&2
    echo "  1. Ga naar https://github.com/settings/personal-access-tokens" >&2
    echo "  2. Maak een nieuw PAT aan met 'Contents: Write' scope op de Futur-Holding-BV/FPS-Connect repo" >&2
    echo "  3. Update Replit: Secrets > GITHUB_TOKEN_PUSH" >&2
    echo "  4. Update GitHub: Futur-Holding-BV/FPS-Connect repo > Settings > Secrets > Actions > FPS_PUSH_TOKEN" >&2
    echo "  Zie ook: docs/PRODUCTION_RUNBOOK.md (sectie 'GITHUB_TOKEN_PUSH vernieuwen')" >&2
    echo "========================================================" >&2
    rm -f "$HEADERS_FILE" /tmp/fps-gh-user.json
  else
    # Token is geldig — controleer vervaldatum als die aanwezig is in de headers
    EXPIRY=$(grep -i "github-authentication-token-expiration:" "$HEADERS_FILE" \
      | tr -d '\r' | cut -d' ' -f2- | xargs 2>/dev/null || echo "")
    rm -f "$HEADERS_FILE" /tmp/fps-gh-user.json

    if [ -n "${EXPIRY}" ]; then
      EXPIRY_TS=$(date -d "${EXPIRY}" +%s 2>/dev/null || echo "0")
      NOW_TS=$(date +%s)
      DAYS_LEFT=$(( (EXPIRY_TS - NOW_TS) / 86400 ))
      if [ "$DAYS_LEFT" -le 14 ]; then
        echo "WAARSCHUWING: GITHUB_TOKEN_PUSH verloopt over ${DAYS_LEFT} dag(en) (${EXPIRY})." >&2
        echo "Vernieuw het token tijdig om onderbrekingen te voorkomen." >&2
        echo "Zie docs/PRODUCTION_RUNBOOK.md (sectie 'GITHUB_TOKEN_PUSH vernieuwen')." >&2
      fi
    fi

    # ─── Stap 7a: remote-sync vóór push ──────────────────────────────────────
    # Als GitHub main commits bevat die lokaal ontbreken (bijv. door directe
    # VPS-pushes of parallelle taak-merges die tegelijk worden verwerkt),
    # wordt de push afgewezen met "fetch first". Dit blok haalt die commits op
    # en mergt ze automatisch zodat de push altijd kan slagen zonder force-push.
    set +e
    git fetch "$_GH_URL" "main:refs/remotes/fps-postsync/main" 2>&1
    SYNC_FETCH_EXIT=$?
    set -e
    if [ "$SYNC_FETCH_EXIT" -eq 0 ]; then
      REMOTE_MAIN_SHA=$(git rev-parse refs/remotes/fps-postsync/main 2>/dev/null || echo "")
      if [ -n "$REMOTE_MAIN_SHA" ] && \
         ! git merge-base --is-ancestor "$REMOTE_MAIN_SHA" HEAD 2>/dev/null; then
        echo "Remote main (${REMOTE_MAIN_SHA:0:8}) is gewijzigd sinds de pre-check; schone merge proberen..."
        # MERGE_01: een schone merge (zonder conflicten) behoudt beide kanten en
        # is veilig. Bij een CONFLICT wordt er NIET meer stilzwijgend gekozen
        # voor de lokale versie (--ours) — dat overschreef eerder op main
        # hersteld werk. Conflict = stoppen, faalmelding, handmatig oplossen.
        if ! git -c user.email="post-merge@fps-one.nl" -c user.name="FPS Post-merge" \
          merge --no-edit refs/remotes/fps-postsync/main 2>&1; then
          CONFLICTING=$(git diff --name-only --diff-filter=U 2>/dev/null || echo "")
          git merge --abort 2>/dev/null || true
          echo "====================================================" >&2
          echo "FOUT: merge met remote main geeft conflicten in:" >&2
          echo "${CONFLICTING:-onbekend}" >&2
          echo "Automatisch oplossen is niet toegestaan (MERGE_01): dat heeft" >&2
          echo "eerder hersteld werk op main overschreven. De push is NIET" >&2
          echo "uitgevoerd; los de conflicten handmatig op en push daarna." >&2
          echo "====================================================" >&2
          _stuur_faalmelding \
            "Stap 7a: merge-conflict met remote main — push geblokkeerd" \
            "${LOCAL_SHA}" \
            "Conflicterende bestanden:
${CONFLICTING:-onbekend}

  1. Haal main binnen: git pull https://github.com/Futur-Holding-BV/FPS-Connect.git main
  2. Los de conflicten handmatig en inhoudelijk op (geen --ours/--theirs).
  3. Draai pnpm run typecheck en check-dubbele-routes, push daarna naar main."
          exit 1
        fi
        # LOCAL_SHA bijwerken na merge zodat de log het juiste commit-SHA toont
        LOCAL_SHA=$(git rev-parse HEAD)

        # Taak #938: de zojuist binnengehaalde remote-commits zijn NIET door
        # stap 6b/6c gegaan — herhaal beide controles vóór de push. Faalt er
        # één, dan wordt de push geblokkeerd en gaat er een faalmelding uit.
        set +e
        node scripts/git/check-opmaakschade.mjs "refs/remotes/fps-postsync/main..HEAD" HEAD && \
          pnpm run typecheck
        _NA_MERGE_CHECK_EXIT=$?
        set -e
        if [ "$_NA_MERGE_CHECK_EXIT" -ne 0 ]; then
          echo "====================================================" >&2
          echo "FOUT: controle na 7a-merge faalt (opmaakschade of typecheck)." >&2
          echo "De push is NIET uitgevoerd; onderzoek de zojuist gemergde" >&2
          echo "remote-commits (refs/remotes/fps-postsync/main..HEAD)." >&2
          echo "====================================================" >&2
          _stuur_faalmelding \
            "Stap 7a: controle na remote-merge faalt — push geblokkeerd" \
            "${LOCAL_SHA}" \
            "Opmaakschade-controle of typecheck faalde op de na stap 7a binnengehaalde remote-commits. Zie de logs hierboven."
          exit 1
        fi
      else
        echo "Lokale commits bevatten alle remote-commits; directe push."
      fi
    else
      echo "WAARSCHUWING: Pre-push sync-fetch mislukt (exit $SYNC_FETCH_EXIT); push wordt toch geprobeerd." >&2
    fi
    # ─── Einde stap 7a ───────────────────────────────────────────────────────

    set +e
    git push "$_GH_URL" main 2>&1
    PUSH_EXIT=$?
    set -e
    if [ "$PUSH_EXIT" -eq 0 ]; then
      echo "GitHub push geslaagd (commit: ${LOCAL_SHA:0:8}) — deploy.yml wordt automatisch gestart."
    else
      echo "WAARSCHUWING: GitHub push mislukt (exit $PUSH_EXIT). De VPS wordt NIET automatisch bijgewerkt." >&2
      echo "Handmatig herstellen: controleer GITHUB_TOKEN_PUSH en voer 'git push origin main' uit." >&2

      _stuur_faalmelding \
        "Stap 7: GitHub push naar productie" \
        "${LOCAL_SHA}" \
        "Exit-code: ${PUSH_EXIT}

  1. Controleer of GITHUB_TOKEN_PUSH geldig is (niet verlopen).
  2. Voer handmatig uit: git push https://github.com/Futur-Holding-BV/FPS-Connect.git main
  3. Controleer daarna of GitHub Actions (deploy.yml) is gestart en groen is.
  4. Zie docs/PRODUCTION_RUNBOOK.md voor het volledige deploybeleid."
    fi
  fi
fi
