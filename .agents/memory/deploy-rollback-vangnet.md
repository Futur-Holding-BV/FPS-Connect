---
name: Deploy-terugval vangnet
description: Waarom `docker compose up -d` in het deployscript nooit fataal mag zijn en wat de rollback-rebuild moet verversen.
---

# Deploy-terugval vangnet (HERSTEL_BUNDEL_01, 18 aug 2026)

- **Rule:** in `scripts/deploy-production.sh` mag `docker compose up -d` nooit het script afbreken; een startfout valt door naar de healthcheck (met api-crashlog), die de automatische rollback aftrapt. Zelfde geldt voor build/up in de rollback-tak.
  - **Why:** een crashende api-container laat `up -d` zelf falen ("dependency failed to start"); met `set -e` stopte het script vóór healthcheck/rollback en bleef de kapotte stack staan (site plat, 18 aug 2026).
- **Rule:** na de rollback-`git reset` moeten GIT_COMMIT/GIT_COMMIT_LANG/BUILD_TIJD opnieuw geëxporteerd worden vóór de rebuild, anders meldt `/api/versie` het commitlabel van de kapotte release terwijl de gezonde code draait.
- **Terugval testen:** workflow_dispatch van deploy.yml op een tak rolt via `DEPLOY_COMMIT=GITHUB_SHA` echt die tak uit (zonder die variabele reset het serverscript naar origin/main). Een test-crash moet typecheck overleven → conditionele throw op een env-var, geen kale top-level throw (unreachable code blokkeert de pre-push-typecheck).
