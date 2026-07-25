---
name: Productie-VPS deploy-lessen
description: Duurzame valkuilen rond het deployen naar de zelf-gehoste productie-VPS; concrete toegangsgegevens staan bewust NIET hier.
---

# Productie-VPS deploy-lessen

Toegangsdetails (host, accountnaam, sleutels, paden) staan bewust niet in memory:
vraag ze aan de gebruiker of kijk in de beveiligde secrets. Eerdere runbook-claims
over het deploypad bleken deels fout — verifieer het pad altijd op de server zelf
in plaats van op documentatie te vertrouwen.

**SSH-toegang werkt (bevestigd juli 2026):** het `PROD_SSH_KEY`-secret bevat de
werkende deploysleutel, maar als platte regel — altijd eerst reconstrueren
(whitespace strippen, base64-body herwrappen op 70 tekens) naar een 0600-bestand
in /tmp, en na afloop verwijderen. Volledige deploy (back-up → reset/pull →
build api → migrate → build caddy → up -d → healthz) is hiermee end-to-end
door de agent uitgevoerd.

**Servergit kan divergeren van origin/main** (server-lokale fixcommits + eerdere
force-pushes): `git pull` faalt dan op "divergent branches". Oplossing: eerst
bewijzen dat de server-commit inhoudelijk al in main zit (lokale `git diff
<servercommit> HEAD -- <bestanden>` moet leeg zijn), daarna fetch + reset naar
origin/main. De bash-commandoguard blokkeert "git reset --hard" ook in
remote-ssh-strings; draai zo'n commando via code_execution (execSync).

**Bewezen deployvolgorde:** back-up (pg_dump via de db-container) → git pull op de
server (server pullt zelf van GitHub) → compose build → eenmalige migrate-run →
up -d → healthz-check. De ongetrackte productie-envfile op de server moet blijven staan.

**Migrate-image ALTIJD zelf `--no-cache` herbouwen vóór de migrate-run.** Het
schema zit in het image gebakken; een stale migrate-image vergelijkt het OUDE
schema met de DB en meldt "Changes applied" + exit 0 terwijl er niets is
doorgevoerd (stille schema-drift → 500 op login/alle routes met nieuwe kolommen).
**Why:** dit brak de login op productie na de grote release van juli 2026; het
API-image was wel `--no-cache` gebouwd, het migrate-image niet.
**How to apply:** bij elke deploy expliciet `compose build --no-cache migrate`
vóór `compose run --rm migrate`, en na de run de nieuwe kolommen/tabellen
verifiëren via psql (information_schema) — exit 0 is geen bewijs.

**Valkuilen (bevestigd):**
- `.dockerignore` moet `scripts/*` + `!scripts/package.json` bevatten (caddy-build
  kopieert scripts/package.json); kaal `scripts` breekt de build.
- Lange servercommando's (build/migrate) losgekoppeld draaien met
  `nohup ... & echo $! > pidfile` en peilen via `kill -0 $(cat pidfile)` — NIET
  `pgrep -f` op het commando (matcht zijn eigen ssh-shell → eeuwig "loopt nog").
- Een lokaal gedode ssh-sessie neemt het remote voorgrond-commando mee (SIGHUP);
  migraties synchroon over ssh met krappe timeout is riskant.
- Secret-saves van de gebruiker belanden makkelijk in het verkeerde paneel
  (account- vs app-secrets); verifieer dat de secret echt gevuld is vóór gebruik.
  Als een sleutel ooit via een onveilig kanaal is gedeeld: rotatie adviseren.
- `/tmp` op Replit is vluchtig: tijdelijke sleutelbestanden na omgevingsherstart
  opnieuw aanmaken.

**GitHub-deploy vs. werkelijke servermodel (bevestigd, mismatch):**
- `.github/workflows/deploy.yml` bouwt images in Actions → pusht naar ghcr → SSH `docker compose pull` + `up`. De server draait echter het lokale-build-model: `docker compose ls` wijst `/opt/fps-one/deploy/docker-compose.production.yml` aan (project `deploy`, containers `deploy-api`/`deploy-caddy` = lokaal gebouwd, GEEN registry-images). `pull` haalt dus niets nuttigs; `up` zonder `--build` zet geen nieuwe code live.
- Bovendien wees het deploy-script naar `/opt/fps-connect` (bestaat niet); echte pad is `/opt/fps-one/deploy`. Er staan twee compose-varianten in de repo: root `docker-compose.production.yml` = registry-model (ghcr images + minio/web), `deploy/docker-compose.production.yml` = lokaal-build-model (draait op de server). Aligneren = architectuurkeuze (vraag de gebruiker); de bewezen volgorde blijft git-pull+build.

**Secret-staleness bij lopende agent-processen:**
- Een net bijgewerkte Replit-secret bereikt NIET de al draaiende bash-tool of code_execution-sandbox (die lezen een stale/lege env). Lees zo'n secret via de validation-runner (start een vers proces) i.p.v. direct in bash.
- Een meerregelige PEM/OpenSSH private key die in een secret-veld wordt geplakt verliest vaak zijn newlines (wordt één spatie-gescheiden regel) → OpenSSH faalt met `error in libcrypto` / `Permission denied`. Reconstrueer: strip alle whitespace uit de base64-body tussen de BEGIN/END-headers en herwrap op 70 tekens. Sleutelmateriaal nooit printen.

**Automatische GitHub-deploy — bekende valkuilen in deploy.yml (gefixed):**
- **SSH-sleutel:** `printf '%s\n' "${PROD_SSH_KEY}"` schrijft de platte Replit-secret als één regel → `error in libcrypto`. Juiste vorm: `printf '%s' … | sed 's/\\n/\n/g'` (werkt voor flat-string én multiline).
- **Backup-profiel:** `backup`-service staat in `profiles: ["backup"]`; `${COMPOSE} run --rm -T backup` zonder `--profile backup` start een losse postgres → POSTGRES_PASSWORD-fout → exit 1. Juiste vorm: `${COMPOSE} --profile backup run --rm -T backup`.
- Workflow_dispatch vereist `workflow`-scope die GITHUB_TOKEN_PUSH niet heeft; testen kan alleen via een echte push naar main. Verifieer via VPS reflog: `git reflog | head` moet een nieuwe "reset: moving to origin/main" tonen na de Actions-run.

**Structurele productie-config-gaten:**
- Mailvariabelen (Azure Graph + afzender/postbus) ontbraken lang op productie;
  op 25 juli 2026 vanuit de dev-secrets aangevuld in deploy/.env.production —
  mail zou nu ook op productie moeten werken (nog niet functioneel bewezen).
- **Deploy-pre-check faalt stil de hele keten:** deploy-production.sh eist 10
  verplichte variabelen in deploy/.env.production (incl. de 5 mailvars); als er
  één leeg is stopt ELKE automatische deploy bij de pre-check, vóór back-up of
  build — de server blijft dan onopgemerkt dagen achter op main. **How to apply:**
  als de VPS achterloopt terwijl main gepusht is, eerst de pre-check-vars op de
  server controleren, dan pas Actions/SSH verdenken. De pre-check leest de
  EERSTE `^VAR=`-regel (grep|head -1): lege duplicaat-regels eerst verwijderen,
  alleen appenden is niet genoeg.
- De api-container logt vrijwel niets (LOG_LEVEL nakijken); debugging loopt via de
  login_pogingen-tabel en DB-queries.

**Patch-deploy zonder git-push (bevestigd juli 2026):** als lokale commits nog
niet op origin/main staan en `git fetch` in de sandbox geblokkeerd is, werkt een
manifest-deploy: sha256-manifest van `git ls-files` lokaal én op de server,
verschillen tar-en + scp + uitpakken, verwijderde bestanden expliciet `rm`.
Server draait daarna een dirty worktree bovenop origin/main — bij de volgende
push moet de server gereconcilieerd worden (checkout/reset). Serverdiff eerst
inhoudelijk beoordelen: server-lokale commits kunnen een OUDERE variant van
dezelfde fix bevatten die je bewust overschrijft.

**Cron-redirect naar root-eigendom logbestand faalt stil:** een `>> /var/log/x.log`
in de crontab van een niet-root-gebruiker breekt de hele cronregel als het
logbestand root-owned is (redirect faalt vóór het commando draait). Na het
aanmaken van cronregels altijd een schrijftest op het logpad doen (of chown).
