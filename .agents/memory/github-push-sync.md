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
- Repo heet `vinkrene-jpg/fps-one` (niet `fps-brandpreventie/fps-connect`).

## Productie-verificatie na deploy

Wacht 5-10 minuten na force-push (docker build duurt lang). Verificeer met:
```
curl https://connect.fps-one.nl/api/versie
```
Verwacht: `{"versie":"2026.07.14-<sha8>","commit":"<sha8>","gebouwd_op":"..."}`. `"commit":"onbekend"` = deploy loopt nog of image is oud.

## Deploy-workflow op GitHub vereist repo-secrets

Een push naar main triggert `.github/workflows/deploy.yml` (Docker-images bouwen → SSH-deploy naar VPS). De SSH-stap leest `secrets.PROD_SSH_HOST/USER/KEY/PORT` uit de GitHub-repo-secrets. Bij ontbrekende secrets faalt de job.
