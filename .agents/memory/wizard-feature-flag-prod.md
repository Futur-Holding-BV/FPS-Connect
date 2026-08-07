---
name: Wizard-onboarding feature flag op productie
description: Waarom /personeel/onboarden op connect.fps-one.nl "niet beschikbaar in pilot" toont terwijl de API werkt.
---

# Wizard-onboarding feature flag op productie

`featureFlags.wizardOnboarding` is opt-in: `import.meta.env.VITE_FEATURE_WIZARD_ONBOARDING === "true"` (default UIT). VITE_-vars worden **at build time** in de frontend gebakken; op de VPS staat de variabele niet in de webbuild, dus de route `/personeel/onboarden` (en `/personeel/integriteitstools`) rendert `ModuleNietBeschikbaar`, terwijl de HRM-lijst wél een "Onboarden"-knop toont die ernaartoe linkt.

**Why:** productiecontrole 28 juli 2026 — API-kant (`POST /medewerkers/onboarding`) werkt volledig op productie (201/409/400/404), alleen de UI-route is geblokkeerd. Een "kapotte" onboarding op prod is dus vrijwel zeker deze flag, geen codebug.

**How to apply:** bij UI-klachten over onboarding op productie eerst de flag in de webbuild controleren (deploy/.env.production + build-args), niet de wizard-code debuggen. Flag aanzetten vereist een frontend-rebuild op de VPS.

**Update 7 aug 2026:** flag staat nu standaard AAN in de productie-build: build-arg `VITE_FEATURE_WIZARD_ONBOARDING` (default `true`) in `deploy/Dockerfile.caddy`, doorgegeven via docker-compose (`${VITE_FEATURE_WIZARD_ONBOARDING:-true}`, overschrijfbaar via `.env.production`). Wordt actief bij de eerstvolgende caddy-rebuild/deploy; tot die tijd draait prod nog de oude bundel zonder knop.
