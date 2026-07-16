#!/bin/bash
set -e
# Zorg dat workspace-binaries (waaronder tsc) bereikbaar zijn, ook in non-login
# omgevingen zoals de post-merge runner (prepare lifecycle roept tsc --build aan).
export PATH="$PWD/node_modules/.bin:$PATH"

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

# Stap 1: Additieve schemaherstel — voegt ontbrekende tabellen en kolommen toe
# via idempotente IF NOT EXISTS SQL-statements. Draait vóór reconcile en push
# zodat het drizzle-diff klein blijft en geen interactieve prompts triggert.
_HUIDIGE_STAP="Stap 1: apply-additive (schemaherstel)"
pnpm --filter @workspace/db run apply-additive

# Stap 2: Trek Postgres' standaard '<tabel>_<kolom>_key' unique-constraintnamen gelijk met de
# door Drizzle verwachte '_unique'-conventie. Zonder deze stap breekt 'drizzle-kit push'
# tijdens een merge (non-TTY) af op de defensieve "truncate?"-prompt bij een naam-mismatch,
# waardoor geen enkele additieve wijziging wordt toegepast. Hernoemen is niet-destructief.
_HUIDIGE_STAP="Stap 2: reconcile (constraint-namen)"
pnpm --filter @workspace/db run reconcile

# Stap 3: --force: sla interactieve data-loss prompts over (non-TTY omgeving). Stale kolommen
# die Drizzle wil droppen worden vooraf handmatig via directe SQL verwijderd zodat
# --force nooit onbedoeld echte data verwijdert.
_HUIDIGE_STAP="Stap 3: push-force (drizzle-kit schema push)"
pnpm --filter @workspace/db run push-force

# Stap 3b: 'drizzle-kit push --force' kan de handmatig aangemaakte
# gebruiker_profielen-UNIQUE-constraint (en vergelijkbare additieve constraints)
# als "drift" beschouwen en droppen. apply-additive is idempotent (IF NOT EXISTS /
# DO-block met pg_constraint-check), dus opnieuw draaien ná de push herstelt dit
# zonder gevolgen als er niets ontbreekt. Voorkomt dat elke merge opnieuw handmatig
# hersteld moet worden.
_HUIDIGE_STAP="Stap 3b: apply-additive (post-push herstel constraints)"
pnpm --filter @workspace/db run apply-additive

# Stap 4: Schema-healthcheck — voert een lees-only SELECT uit op de kerntabellen om te
# bevestigen dat alle kritieke kolommen daadwerkelijk aanwezig zijn in de database.
# Faalt met exit 1 en een duidelijke foutmelding als een tabel of kolom ontbreekt.
# De merge wordt alleen groen gerapporteerd als deze stap slaagt.
_HUIDIGE_STAP="Stap 4: schema-healthcheck"
pnpm --filter @workspace/db run schema-healthcheck

# Stap 5: Seed Document Studio-model voor opleverrapport (idempotent; slaat over als reeds aanwezig).
_HUIDIGE_STAP="Stap 5: seed-studio-opleverrapport"
pnpm --filter @workspace/scripts run seed-studio-opleverrapport

# Stap 6: Seed standaard rechten-profielen (presets). INSERT-ONLY en idempotent:
# ontbrekende systeem-presets worden aangemaakt, bestaande NOOIT overschreven
# (handmatige aanpassingen blijven behouden). Voorkomt lege profielen-tabel →
# "kies functie" die geen bevoegdheden vult.
_HUIDIGE_STAP="Stap 6: seed-profielen"
pnpm --filter @workspace/scripts run seed-profielen

# Stappen 1-6 voltooid — verwijder de ERR-trap; stap 7 heeft eigen foutafhandeling.
trap - ERR

# Stap 7: Push naar GitHub zodat GitHub Actions (deploy.yml) automatisch triggert
# en de productie-VPS (connect.fps-one.nl) binnen 15 minuten de nieuwe code draait.
# Faalt niet-fataal: als de push mislukt wordt een waarschuwing geprint maar stopt
# het post-merge script NIET (set -e wordt tijdelijk uitgeschakeld).
#
# Token-validatie: vóór de push wordt het token gecontroleerd via de GitHub API.
# Een verlopen of ongeldig token geeft een expliciete foutmelding met instructies
# om het token te vernieuwen, zodat het probleem niet stil verborgen blijft.
#
# Beveiligingsaanpak: authenticatie via GIT_ASKPASS (tijdelijk hulpscript in /tmp).
# Het token wordt NOOIT in .git/config of de remote-URL opgeslagen. Het hulpscript
# wordt altijd opgeruimd via een trap, ook bij onderbreking (SIGINT/SIGTERM/EXIT).
if [ -z "${GITHUB_TOKEN_PUSH:-}" ]; then
  echo "WAARSCHUWING: GITHUB_TOKEN_PUSH is niet ingesteld — push naar GitHub overgeslagen." >&2
  echo "Stel GITHUB_TOKEN_PUSH in als Replit-secret om automatische deploys te activeren." >&2
else
  LOCAL_SHA=$(git rev-parse HEAD)

  # Valideer het token via de GitHub API vóór de push.
  # Geeft een duidelijke foutmelding als het token verlopen of ongeldig is,
  # zodat "token verlopen" niet opgaat als generieke push-fout.
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
    echo "  2. Maak een nieuw PAT aan met 'Contents: Write' scope op de fps-one repo" >&2
    echo "  3. Update Replit: Secrets > GITHUB_TOKEN_PUSH" >&2
    echo "  4. Update GitHub: fps-one repo > Settings > Secrets > Actions > GITHUB_TOKEN_PUSH" >&2
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

    # Maak een tijdelijk GIT_ASKPASS-hulpscript aan dat het token uitvoert.
    # Git roept dit script aan voor de gebruikersnaam (geeft "x-access-token") en
    # het wachtwoord (geeft het token). Het script staat in /tmp zodat het nooit
    # in de git working tree terechtkomt.
    _ASKPASS_FILE=$(mktemp /tmp/fps-git-askpass-XXXXXX)
    chmod 700 "$_ASKPASS_FILE"
    # Schrijf het hulpscript; 'Username' → statisch; 'Password' → token
    cat > "$_ASKPASS_FILE" <<'ASKPASS_EOF'
#!/bin/bash
case "$1" in
  Username*) echo "x-access-token" ;;
  Password*) echo "${GITHUB_TOKEN_PUSH}" ;;
esac
ASKPASS_EOF
    # Ruim het hulpscript altijd op, ook bij EXIT/SIGINT/SIGTERM
    trap 'rm -f "$_ASKPASS_FILE"' EXIT INT TERM
    export GIT_ASKPASS="$_ASKPASS_FILE"
    set +e
    git push https://github.com/vinkrene-jpg/fps-one.git main 2>&1
    PUSH_EXIT=$?
    set -e
    unset GIT_ASKPASS
    rm -f "$_ASKPASS_FILE"
    trap - EXIT INT TERM
    if [ "$PUSH_EXIT" -eq 0 ]; then
      echo "GitHub push geslaagd (commit: ${LOCAL_SHA:0:8}) — deploy.yml wordt automatisch gestart."
    else
      echo "WAARSCHUWING: GitHub push mislukt (exit $PUSH_EXIT). De VPS wordt NIET automatisch bijgewerkt." >&2
      echo "Handmatig herstellen: controleer GITHUB_TOKEN_PUSH en voer 'git push origin main' uit." >&2

      # ─── E-mailmelding bij mislukte push ────────────────────────────────────
      _stuur_faalmelding \
        "Stap 7: GitHub push naar productie" \
        "${LOCAL_SHA}" \
        "Exit-code: ${PUSH_EXIT}

  1. Controleer of GITHUB_TOKEN_PUSH geldig is (niet verlopen).
  2. Voer handmatig uit: git push https://github.com/vinkrene-jpg/fps-one.git main
  3. Controleer daarna of GitHub Actions (deploy.yml) is gestart en groen is.
  4. Zie docs/PRODUCTION_RUNBOOK.md voor het volledige deploybeleid."
      # ────────────────────────────────────────────────────────────────────────
    fi
  fi
fi
