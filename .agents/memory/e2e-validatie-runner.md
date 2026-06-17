---
name: E2E menu-test validatiestap
description: Hoe de e2e-menu validatiestap zelf de api-server + expo opstart voordat Playwright draait
---

# E2E menu-test als validatiestap

De `e2e-menu` validatiestap draait `pnpm --filter @workspace/scripts run e2e-monteur-ci`,
een wrapper die de benodigde services zelf verzorgt en pas daarna `playwright test` start.

**Regel:** een validatie-/CI-stap die afhankelijk is van langlopende workflows
(api-server, expo) mag NIET aannemen dat die al draaien. Een validatierun is een
geïsoleerd shell-commando; de `restart_workflow`-tool is daar niet beschikbaar.

**Why:** validatieruns starten geen workflows. Tijdens een merge/CI staan de
workflows vaak uit (zie ook de "not started"-status in system reminders). Zonder
self-boot faalt de stap met 502 op de health-checks.

**How to apply:** de wrapper pollt per service een health-URL (api-server
`http://localhost:8080/api/healthz`, expo `https://$REPLIT_EXPO_DEV_DOMAIN/status`),
hergebruikt een al draaiende instantie, en spawnt anders het dev-commando
`detached` met de juiste env (api: `PORT=8080`; expo: `PORT=21646`,
`BASE_PATH=/monteur-app/`). Alleen zelf-opgestarte processen worden na afloop
gekilld (procesgroep via negatieve pid), zodat bestaande dev-workflows blijven
draaien. De Playwright-config gebruikt Nix-chromium (`which chromium`), dus er is
geen browser-download nodig — alleen `@playwright/test` moet geïnstalleerd zijn.
