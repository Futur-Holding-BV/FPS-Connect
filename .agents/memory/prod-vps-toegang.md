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

**Automatische GitHub-deploy — status (bevestigd):**
- De "Deploy naar productie"-workflow is nog NOOIT groen geweest: elke run faalde of werd geskipt. Een recente run faalde bij de SSH-stap met `error: missing server host` — de job las environment-scoped secrets (leeg); repo-level `PROD_SSH_HOST/USER/KEY/PORT` bestaan inmiddels wél en het `production`-environment heeft geen required reviewers meer.
- De correcte single-job workflow (push→appleboy/ssh-action→`/opt/fps-one/deploy`→pull+build+migrate+up -d) wordt pas actief zodra hij op origin/main staat. Het bevestigen van de eerste échte deploy is daarmee per definitie een POST-MERGE activiteit: vereist GitHub Actions-observatie én servertoegang. Zonder SSH kan de agent alleen healthz + de GitHub-run controleren, niet de VPS-git-HEAD/containers.

**Structurele productie-config-gaten:**
- Productie mist mailvariabelen (Azure Graph + afzender/postbus) → uitnodigings-
  en wachtwoord-vergeten-mails komen daar nooit aan; bij "gebruiker kan niet
  inloggen" eerst hierop checken (login_pogingen-tabel geeft bewijs). Dev heeft ze wél.
- De api-container logt vrijwel niets (LOG_LEVEL nakijken); debugging loopt via de
  login_pogingen-tabel en DB-queries.
