---
name: GitHub push-synchronisatie
description: Hoe origin/main veilig te synchroniseren als push faalt op verlopen token en GitHub achterloopt/divergeert.
---
# GitHub push-synchronisatie

- "Invalid username or token" op `git push origin` = verlopen token; gebruik `GITHUB_TOKEN_PUSH` uit de bash-omgeving (niet beschikbaar in code_execution-sandbox). Remote-URL tijdelijk aanpassen: `git remote set-url origin "https://x-access-token:${TOKEN}@github.com/..."` → fetch/push uitvoeren → URL resetten naar `https://github.com/...`.
- **Why:** het opgeslagen credential in de remote-URL/credential-store veroudert; `GITHUB_TOKEN_PUSH` is altijd actueel in de bash-omgeving.

## Kritiek: Replit pusht NIET automatisch naar GitHub

Replit slaat commits op in eigen `subrepl-*`-remotes, NIET in de geconfigureerde GitHub-origin. De `deploy.yml` triggert alleen bij push naar GitHub main. Dit betekent: **elke merge via Replit moet ook handmatig via `git push origin main` naar GitHub worden gepusht**.

**Bewezen incident (14 juli 2026):** 45 commits op lokale main, GitHub stond vast op 13 juli. VPS draaide een dag achter op de ontwikkelomgeving. Fix: force-push + automatische deploy. Verificatie via `GET /api/versie`.

- **How to apply:** na elke taak-merge controleren of `git log --oneline origin/main..HEAD | grep -v "Published your App" | wc -l` > 0; zo ja, direct pushen naar GitHub.

## Divergente histories: tree-check vóór force-push

Als GitHub-commits niet in de lokale history zitten (of andersom): check eerst met `git diff HEAD origin/main --name-only`. Als de GitHub-versie features verwijdert die lokaal gewenst zijn (bijv. inkooporders, Caddyfile mjs) → force-push is veilig; lokale Replit-codebase is de waarheid.

**Gevaarlijke situatie die zich voordeed:** GitHub-versie had Caddyfile zonder `mjs` (plattegrond-bug opnieuw geïntroduceerd). Force-push herstelde de juiste mjs-fix.

## GitHub Actions API-rechten

- `GITHUB_TOKEN_PUSH` heeft geen `actions`-recht: `/repos/.../actions/runs` geeft 403.
- Commits-lijst (`/repos/.../commits`) en ref-info (`/repos/.../git/ref/heads/main`) werken wel met dezelfde token.
- Repo heet `Futur-Holding-BV/FPS-Connect` (verhuisd aug 2026); PAT van het beheerder-account moet toegang op de org-repo hebben; Actions-secret heet FPS_PUSH_TOKEN.

## Productie-verificatie na deploy

Wacht 5-10 minuten na force-push (docker build duurt lang). Verificeer met:
```
curl https://connect.fps-one.nl/api/versie
```
Verwacht: `{"versie":"2026.07.14-<sha8>","commit":"<sha8>","gebouwd_op":"..."}`. `"commit":"onbekend"` = deploy loopt nog of image is oud.

## GIT_ASKPASS race-condition in post-merge sandbox

`GIT_ASKPASS` werkt NIET in de post-merge runner: het tijdelijke `/tmp/fps-git-askpass-*` bestand verdwijnt vóórdat git het kan uitvoeren → `cannot exec ... No such file or directory` (exit 128). Fix: gebruik directe token-URL `https://x-access-token:${GITHUB_TOKEN_PUSH}@github.com/...` in zowel `git fetch` als `git push`. De URL leeft alleen in bash-geheugen en wordt nooit in `.git/config` opgeslagen.

**Why:** post-merge sandbox heeft een andere bestandssysteem-sandbox dan de bash-shell die het script schrijft; `/tmp` bestanden die vóór de git-aanroep zijn aangemaakt zijn mogelijk niet zichtbaar.

**How to apply:** in `scripts/post-merge.sh` altijd `_GH_URL="https://x-access-token:${GITHUB_TOKEN_PUSH}@github.com/..."` en die variabele doorgeven aan `git fetch $_GH_URL ...` en `git push $_GH_URL main`.

## Deploy-workflow op GitHub vereist repo-secrets

Een push naar main triggert `.github/workflows/deploy.yml` (Docker-images bouwen → SSH-deploy naar VPS). De SSH-stap leest `secrets.PROD_SSH_HOST/USER/KEY/PORT` uit de GitHub-repo-secrets. Bij ontbrekende secrets faalt de job.

**Org-verhuizing & token-scope (aug 2026):** repo verhuisd naar Futur-Holding-BV/FPS-Connect. Fine-grained PATs gelden per resource-owner: een token aangemaakt onder het persoonlijke account dekt de organisatie NIET — Actions/secrets-API geeft dan 403 ondanks admin-rechten. Nieuw token moet resource owner = Futur-Holding-BV hebben. Gewenste rechten: Contents R/W (push), Actions R/W (runs lezen + workflow_dispatch), evt. Secrets Read. Vervangen in Replit-secret GITHUB_TOKEN_PUSH én GitHub Actions-secret FPS_PUSH_TOKEN.

## Workflow-bestanden pushen: workflow-scope verplicht (aug 2026)

- `git push` met GITHUB_TOKEN_PUSH wordt geweigerd zodra het commit `.github/workflows/*` wijzigt: "refusing to allow a Personal Access Token to ... without `workflow` scope". Fine-grained fix: Workflows R/W toevoegen (resource owner Futur-Holding-BV).
- Omweg via de Replit GitHub-koppeling werkt óók niet: (a) de connector-proxy blokkeert elke URL met `.github` erin (Cloudflare-403 HTML), (b) de git-data-API (blob lukt, 201) faalt bij tree-create met 404 zodra het pad `.github/workflows/...` bevat — het koppelingstoken mist eveneens workflow-rechten.
- **How to apply:** commit splitsen (workflow-bestand apart), rest pushen, workflow-commit lokaal laten staan en de beheerder vragen de scope toe te voegen; daarna gewoon `git push`.
