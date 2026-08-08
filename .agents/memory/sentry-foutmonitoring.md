---
name: Sentry-foutmonitoring (SENTRY_01)
description: Hoe de Sentry-koppeling van de productie-API in elkaar zit en welke valstrikken erbij horen.
---

- Init in `artifacts/api-server/src/instrument.ts`, allereerste import in index.ts; zonder `SENTRY_DSN` géén init (dev/CI sturen nooit events). Alleen error monitoring; org `futur-holding`, project `fps-connect-api`, EU `de.sentry.io`.
- **Privacy-scrub is allowlist-gebaseerd** (`scrubEvent`, unit-getest in `__tests__/sentry-scrub.test.ts`): alleen fout+tags+methode+queryloos pad+eigen `verzoek`-context blijven; user/extra/breadcrumbs/headers/body gaan er onvoorwaardelijk uit. **Why:** loon/IBAN/persoonsgegevens; strip-gebaseerd scrubben werd door review afgekeurd — SDK-integraties voegen zelf context toe.
- Alleen de onverwachte 500-tak van de centrale foutafhandelaar stuurt naar Sentry, met tag `verwijzingscode` (FPS-code = zoeksleutel). Geen `setupExpressErrorHandler` — één foutpad.
- `@sentry/node` staat in build.mjs-externals (otel require-hooks niet bundelbaar); `pnpm deploy --prod` levert hem mee.
- **Peer-split valstrik:** `@sentry/node` brengt `@opentelemetry/api` mee; drizzle-orm peert daar optioneel op → twee drizzle-instanties → duizenden TS2769-fouten. Fix: `@opentelemetry/api` expliciet als dependency in ELKE workspace die drizzle-orm gebruikt (lib/db, scripts, api-server).
- Sourcemap-upload = stap 5b in `scripts/deploy-production.sh`, niet-blokkerend; release móet exact `${GIT_COMMIT}` zijn. **Valstrik:** onder `set -euo pipefail` stopt een grep-zonder-treffer in een command substitution de hele deploy — altijd `|| true` binnen de substitutie.
- `SENTRY_DSN`/`SENTRY_AUTH_TOKEN` staan alleen in `deploy/.env.production` op de VPS (bewust niet in VERPLICHTE_VARS).
