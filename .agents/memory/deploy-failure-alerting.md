---
name: Deploy-failure alerting (GitHub Actions)
description: How the production deploy workflow notifies on failure, and why it calls Graph directly instead of the app's mail service.
---

`.github/workflows/deploy.yml` has an `if: failure()` step after the deploy
step that emails de beheerder when the SSH deploy step fails (build, migration, or
post-deploy healthcheck).

**Why call Microsoft Graph directly from the runner instead of the app's
`services/email.ts`:** the GitHub Actions runner has no network path to the
app's internal API/service layer during a failed deploy (and the app itself
may be the thing that's down). So the workflow does its own client-credentials
OAuth token request + `sendMail` call via curl/node, reusing the same Azure
app registration and MAIL_FROM/MAIL_MAILBOX convention as the app.

**Non-obvious requirement:** these are GitHub Actions repo secrets
(`AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`,
`RENE_ALERT_EMAIL`), separate from the Replit environment's own copies of the
same Azure values — they must be added independently under GitHub repo
Settings > Secrets and variables > Actions, or the notification step silently
no-ops (exits 0 with a warning) rather than failing the run.

The step intentionally never notifies on a successful deploy (avoid mail
fatigue) and always exits 0 on its own errors so a broken notification path
never masks the real deploy failure in the Actions UI.

**DEPLOY_SNELHEID_01 (aug 2026):** OTA-stap alleen bij wijzigingen in artifacts/monteur-app, lib/api-client-react of lib/ontwerp én alleen --platform android; api/caddy-builds mét cache (migrate blijft --no-cache, schema-in-image). Tijdbewaking: serverscript print TIJD|stap|Ns, workflow tee't ssh-uitvoer en mailt via dezelfde Graph-flow bij >480s of SCHIJF_ALARM (schijf na prune nog >85%); uitrol wordt daarop niet afgebroken, mail komt altijd van de Actions-runner.

## Bewaking mag alleen gemeten feiten melden
Incident: token-health-check mailde "deploys GEPAUZEERD" terwijl deploys gewoon slaagden — hij toetste een ánder token (Actions-secret) dan het echte Replit-pushtoken en beweerde ongetoetst een gevolg dat architectonisch onmogelijk was (deploy-keten loopt via SSH, niet via het PAT).
**Regel:** een bewakingsmelding beschrijft (a) wat exact is vastgesteld, (b) gemeten werkelijkheid (bv. laatste push, laatste geslaagde deploy-run) en (c) het feitelijke gevolg — nooit een aangenomen toestand. Fail-closed: zonder geverifieerde identiteitskoppeling (sha256-vingerafdruk, niet-geheim, in de repo) geen conclusie over het echte token. 401 = verlopen; 403 apart houden (rate limit/policy). Anti-mailmoeheid: alleen urgente statussen dagelijks, rest wekelijks. Het PAT kan geen Actions-secrets zetten (403) — secret-sync blijft handwerk.
