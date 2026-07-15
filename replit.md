# FPS Brandpreventie

FPS Brandpreventie is een Nederlands platform voor het registreren, beheren en inspecteren van brandpreventieve gebouwvoorzieningen (branddeur, doorvoering, brandklep, manchet, coating, etc.).

> **Ontwikkelfilosofie:** Zie [`docs/ontwikkelfilosofie.md`](docs/ontwikkelfilosofie.md) — verplicht referentiedocument voor alle toekomstige werkzaamheden. Kernregel: stabiliteit van de kantoorversie heeft altijd voorrang op nieuwe functionaliteit.
>
> **Kwaliteitskader:** Zie [`docs/kwaliteitskader.md`](docs/kwaliteitskader.md) — verplicht Kwaliteits-, Validatie- en Uitvoeringskader. Kernregel: een taak is pas gereed wanneer het volledige bedrijfsproces aantoonbaar correct functioneert (Definition of Done, bewijsvoering, business-scenario-validatie); build/typecheck is noodzakelijk maar nooit voldoende.

## Naamgeving (platform)

Het platform heeft twee namen, afhankelijk van de doelgroep:
- **FPS Connect** — interne naam. Gebruik voor interne schermen, de beheeromgeving, interne navigatie, documentatie en beheerdersrollen.
- **FPS One** — klantnaam. Gebruik uitsluitend richting klanten: klantportaal, klantlogin, e-mails/notificaties aan klanten, opleverrapporten en klantgerichte teksten.

Bestaande termen worden consequent volgens deze tweedeling vervangen (stapsgewijs, telkens beoordeelbaar in de preview).

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — API server starten (poort 8080)
- `pnpm --filter @workspace/firevault run dev` — Frontend starten (poort 25392)
- `pnpm run typecheck` — volledige typecheck
- `pnpm run build` — typecheck + build alle packages
- `pnpm --filter @workspace/api-spec run codegen` — API hooks en Zod schemas regenereren
- `pnpm --filter @workspace/db run push` — DB schema pushen (dev only)
- `pnpm --filter @workspace/scripts run security-scan` — beveiligingsscan (pnpm audit + verouderde pakketten), rapporteert alleen, wijzigt niets
- `pnpm --filter @workspace/scripts run kwaliteitscheck` — volledige kwaliteitscontrole (typecheck alle packages, build, OpenAPI-drift, DB schema, architectuur, security); rapporteert alleen, wijzigt niets. Zie [docs/kwaliteitscontrole.md](docs/kwaliteitscontrole.md).
- `pnpm --filter @workspace/scripts run pre-publish-validatie` — 10 kritieke identiteitsflows end-to-end valideren tegen dev, met DB-bewijsvoering; api-server vooraf herstarten i.v.m. login-rate-limiter.
- Vereiste env: `DATABASE_URL` — Postgres connectiestring

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + shadcn/ui + TailwindCSS + wouter routing
- API: Express 5, OpenAPI spec-first met Orval codegen
- DB: PostgreSQL + Drizzle ORM
- Validatie: Zod (zod/v4), drizzle-zod
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI bronspecificatie (source of truth voor API contract)
- `lib/api-client-react/src/generated/api.ts` — gegenereerde React Query hooks
- `lib/db/src/schema/index.ts` — Drizzle databaseschema (source of truth voor DB)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/firevault/src/pages/` — React paginacomponenten

## Feature flags

Modules worden per omgeving aan/uit gezet via `VITE_FEATURE_*` variabelen in `artifacts/firevault/.env`:

| Variabele | Standaard | Betekenis |
|---|---|---|
| `VITE_FEATURE_PLANNING=true` | **aan** | Planning V1 ingeschakeld voor pilot |
| `VITE_FEATURE_CALCULATIE=false` | **uit** | Calculatie uitgeschakeld voor pilot |

- Als een module uitgeschakeld is, verdwijnt het nav-item automatisch en toont de route "niet beschikbaar in pilot".
- Zie `artifacts/firevault/src/lib/feature-flags.ts` voor de implementatie.

## Architecture decisions

- Contract-first API: OpenAPI spec wordt eerst geschreven, daarna codegen uitvoeren voor types en hooks
- Alle API routes leven onder `/api` prefix; frontend en backend draaien op aparte poorten via de shared proxy
- DB kolommen camelCase in TypeScript, snake_case in API-antwoorden (handmatige mapping in route handlers)
- shadcn/ui components voor consistente UI; wouter voor lichte client-side routing
- Seed data zit in de PostgreSQL database (geen mock data in de frontend)

## Authenticatie & beveiliging

- Echte login met **verplichte** authenticator-app TOTP (tweestapsverificatie); de rol van het ingelogde account bepaalt welk portaal verschijnt.
- Eigen sessie-auth (express-session + connect-pg-simple), `bcryptjs` voor wachtwoorden, `otplib` voor TOTP, `qrcode` voor de QR-code. Reden: Replit-managed Clerk en Replit Auth ondersteunen geen verplichte authenticator-app MFA.
- `otplib` blijft op v12 (v13 heeft een andere API zonder `authenticator`-export en breekt de esbuild-bundle).
- Sessiecookie is `SameSite=None; Secure` + `trust proxy` (Replit-iframe). Backend testen via `https://$REPLIT_DEV_DOMAIN` met een cookie jar — niet via `http://localhost:80`.
- Alleen `/auth/*`, `/healthz` en `/installatie*` zijn publiek; alle dataroutes staan achter `requireAuth`.
- **Eerste-installatie bootstrap** (`GET`/`POST /installatie`): fail-closed via advisory lock + hertelling in transactie; hergebruikt dezelfde aanmaak-/hash-logica als `POST /gebruikers` via `lib/gebruiker-aanmaken.ts`.

## Product

FPS Brandpreventie biedt:
- **Dashboard** met live statistieken: gebouwen, voorzieningen, onderhoud en aankomende inspectiedatums
- **Gebouwenbeheer**: registratie van gebouwen met verdiepingen, 3D CSS-weergave, zoekfunctie
- **Voorzieningenoverzicht**: 10+ object types (branddeur, doorvoering, brandklep, manchet, coating…), statusfiltering, detailpagina's
- **Inspecties**: oplevering, periodiek, jaarlijks en herstel inspecties bijhouden
- **Onderhoud**: werkorders met prioriteit, deadline, toewijzing en statussturing
- **Gebruikersbeheer**: rollen beheerder, monteur, controleur en klant
- **Abonnementen**: 3 pakketten (Basis €149, Beheer €349, Volledig €699/maand)

## Roadmap

Zie [`docs/roadmap/README.md`](docs/roadmap/README.md) voor het volledige overzicht (Gebouwd / Actief / Parallel / Geparkeerd) en de harde Ontwikkelstop-regel.

**Status (juli 2026):** V1.0 t/m V1.4 + DMS + Governance & Approval Engine zijn gebouwd. Actief: V1.5 Rapportenmodule (grotendeels gebouwd) en Document Design System. De Ontwikkelstop is opgeheven (13 juni 2026) — elk increment wordt afzonderlijk en terugdraaibaar opgeleverd, met de volgorde: DDS → V1.5 → S.G. Constructies → V2.0 → V3.0/CRM.

## User preferences

- Alle UI-tekst volledig in het Nederlands
- Geen emoji's in de code of UI
- Rode/oranje primaire kleur (HSL 12 90% 50%), donkere sidebar
- Altijd meerkeuzevragen stellen via de `user_query` tool — nooit als platte tekst in het antwoord

## Gotchas

- Voer na elke OpenAPI wijziging altijd `pnpm --filter @workspace/api-spec run codegen` uit
- Route handlers moeten `bijgewerktOp: new Date()` meesturen bij PATCH/PUT
- `pnpm run dev` niet uitvoeren vanuit de root — gebruik workflows

## Deploybeleid

**Replit is uitsluitend een ontwikkel- en testomgeving.** De Replit autoscale-deployment is uitgeschakeld. Productie is `connect.fps-one.nl` (VPS), bereikbaar via het automatische pad: Agent-merge → `scripts/post-merge.sh` → `git push` naar GitHub → `deploy.yml` triggert → VPS bouwt en herstart (10–15 minuten).

Noodzakelijke fixes gaan direct naar productie zodra GitHub CI groen is, zonder aparte staging-cyclus of aparte reviewer-goedkeuring per fix (uitzonderingen: destructieve migratie, beveiligingsrisico, deploymentfout). Het leidende beleid — de gates, de smoketest en de bekende aandachtspunten — staat in [`docs/PRODUCTION_RUNBOOK.md`](docs/PRODUCTION_RUNBOOK.md); de deploymenthandleiding is [`docs/deployment.md`](docs/deployment.md).

## Pointers

- Zie de `pnpm-workspace` skill voor workspace structuur, TypeScript setup en package details
