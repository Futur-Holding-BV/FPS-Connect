#!/bin/bash
set -e
# Zorg dat workspace-binaries (waaronder tsc) bereikbaar zijn, ook in non-login
# omgevingen zoals de post-merge runner (prepare lifecycle roept tsc --build aan).
export PATH="$PWD/node_modules/.bin:$PATH"
pnpm install --frozen-lockfile
# Stap 1: Additieve schemaherstel — voegt ontbrekende tabellen en kolommen toe
# via idempotente IF NOT EXISTS SQL-statements. Draait vóór reconcile en push
# zodat het drizzle-diff klein blijft en geen interactieve prompts triggert.
pnpm --filter @workspace/db run apply-additive
# Stap 2: Trek Postgres' standaard '<tabel>_<kolom>_key' unique-constraintnamen gelijk met de
# door Drizzle verwachte '_unique'-conventie. Zonder deze stap breekt 'drizzle-kit push'
# tijdens een merge (non-TTY) af op de defensieve "truncate?"-prompt bij een naam-mismatch,
# waardoor geen enkele additieve wijziging wordt toegepast. Hernoemen is niet-destructief.
pnpm --filter @workspace/db run reconcile
# Stap 3: --force: sla interactieve data-loss prompts over (non-TTY omgeving). Stale kolommen
# die Drizzle wil droppen worden vooraf handmatig via directe SQL verwijderd zodat
# --force nooit onbedoeld echte data verwijdert.
pnpm --filter @workspace/db run push-force
# Stap 3b: 'drizzle-kit push --force' kan de handmatig aangemaakte
# gebruiker_profielen-UNIQUE-constraint (en vergelijkbare additieve constraints)
# als "drift" beschouwen en droppen. apply-additive is idempotent (IF NOT EXISTS /
# DO-block met pg_constraint-check), dus opnieuw draaien ná de push herstelt dit
# zonder gevolgen als er niets ontbreekt. Voorkomt dat elke merge opnieuw handmatig
# hersteld moet worden.
pnpm --filter @workspace/db run apply-additive
# Stap 4: Schema-healthcheck — voert een lees-only SELECT uit op de kerntabellen om te
# bevestigen dat alle kritieke kolommen daadwerkelijk aanwezig zijn in de database.
# Faalt met exit 1 en een duidelijke foutmelding als een tabel of kolom ontbreekt.
# De merge wordt alleen groen gerapporteerd als deze stap slaagt.
pnpm --filter @workspace/db run schema-healthcheck
# Stap 5: Seed Document Studio-model voor opleverrapport (idempotent; slaat over als reeds aanwezig).
pnpm --filter @workspace/scripts run seed-studio-opleverrapport
# Stap 6: Seed standaard rechten-profielen (presets). INSERT-ONLY en idempotent:
# ontbrekende systeem-presets worden aangemaakt, bestaande NOOIT overschreven
# (handmatige aanpassingen blijven behouden). Voorkomt lege profielen-tabel →
# "kies functie" die geen bevoegdheden vult.
pnpm --filter @workspace/scripts run seed-profielen
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
    fi
  fi
fi
