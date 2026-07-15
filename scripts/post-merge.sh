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
# Beveiligingsaanpak: authenticatie via GIT_ASKPASS (tijdelijk hulpscript in /tmp).
# Het token wordt NOOIT in .git/config of de remote-URL opgeslagen. Het hulpscript
# wordt altijd opgeruimd via een trap, ook bij onderbreking (SIGINT/SIGTERM/EXIT).
if [ -z "${GITHUB_TOKEN_PUSH:-}" ]; then
  echo "WAARSCHUWING: GITHUB_TOKEN_PUSH is niet ingesteld — push naar GitHub overgeslagen." >&2
else
  LOCAL_SHA=$(git rev-parse HEAD)
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
    echo "Handmatig herstellen: git push origin main (met geldig GITHUB_TOKEN_PUSH)." >&2
  fi
fi
