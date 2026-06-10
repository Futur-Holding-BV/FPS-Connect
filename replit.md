# FPS Brandpreventie

FPS Brandpreventie is een Nederlands platform voor het registreren, beheren en inspecteren van brandpreventieve gebouwvoorzieningen (branddeur, doorvoering, brandklep, manchet, coating, etc.).

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — API server starten (poort 8080)
- `pnpm --filter @workspace/firevault run dev` — Frontend starten (poort 25392)
- `pnpm run typecheck` — volledige typecheck
- `pnpm run build` — typecheck + build alle packages
- `pnpm --filter @workspace/api-spec run codegen` — API hooks en Zod schemas regenereren
- `pnpm --filter @workspace/db run push` — DB schema pushen (dev only)
- `pnpm --filter @workspace/scripts run security-scan` — beveiligingsscan (pnpm audit + verouderde pakketten), rapporteert alleen, wijzigt niets
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

## Architecture decisions

- Contract-first API: OpenAPI spec wordt eerst geschreven, daarna codegen uitvoeren voor types en hooks
- Alle API routes leven onder `/api` prefix; frontend en backend draaien op aparte poorten via de shared proxy
- DB kolommen camelCase in TypeScript, snake_case in API-antwoorden (handmatige mapping in route handlers)
- shadcn/ui components voor consistente UI; wouter voor lichte client-side routing
- Seed data zit in de PostgreSQL database (geen mock data in de frontend)

## Authenticatie & beveiliging

- Echte login met **verplichte** authenticator-app TOTP (tweestapsverificatie). De portalkeuze-demo is vervangen; de rol van het ingelogde account bepaalt welk portaal verschijnt.
- Eigen sessie-auth (express-session + connect-pg-simple), `bcryptjs` voor wachtwoorden, `otplib` voor TOTP, `qrcode` voor de QR-code. Reden: Replit-managed Clerk en Replit Auth ondersteunen geen verplichte authenticator-app MFA.
- `otplib` blijft op v12 (v13 heeft een andere API zonder `authenticator`-export en breekt de esbuild-bundle).
- Sessiecookie is `SameSite=None; Secure` + `trust proxy` omdat de app in de Replit-iframe draait. Backend testen via `https://$REPLIT_DEV_DOMAIN` met een cookie jar — niet via `http://localhost:80` (Secure cookie blijft dan niet bewaard).
- Alleen `/auth/*` en `/healthz` zijn publiek; alle dataroutes staan achter `requireAuth`.

## Product

FPS Brandpreventie biedt:
- **Dashboard** met live statistieken: gebouwen, voorzieningen, onderhoud en aankomende inspectiedatums
- **Gebouwenbeheer**: registratie van gebouwen met verdiepingen, 3D CSS-weergave, zoekfunctie
- **Voorzieningenoverzicht**: 10+ object types (branddeur, doorvoering, brandklep, manchet, coating…), statusfiltering, detailpagina's
- **Inspecties**: oplevering, periodiek, jaarlijks en herstel inspecties bijhouden
- **Onderhoud**: werkorders met prioriteit, deadline, toewijzing en statussturing
- **Gebruikersbeheer**: rollen beheerder, monteur, controleur en klant
- **Abonnementen**: 3 pakketten (Basis €149, Beheer €349, Volledig €699/maand)

## Ontwikkelstop & roadmap (Versie 1.0)

Doel Versie 1.0: "Administratief gereed voor uitvoering" — een project moet volledig binnen de app voorbereid kunnen worden, zonder Excel, losse e-mails of externe documenten.

**Ontwikkelstop (harde projectregel).** Tot Versie 1.0 formeel akkoord is: géén nieuwe modules of grote functionaliteiten starten. Geparkeerd blijven en NIET uitbouwen: mobiele monteur-app, CRM-module, onderhoudsmodule, klantportaal, abonnementen, afspraakplanner, bibliotheek/versiebeheer, documentbewaking, urenregistratie, verlofmodule, gereedschapbeheer. Bestaande scaffolds (o.a. `artifacts/firevault/src/pages/crm/`) niet verder uitbouwen.

**Roadmap (volgorde, na formeel akkoord per fase):**
- **V1.0** — Administratief gereed voor uitvoering (huidige focus)
- **V1.1** — Spots & Uitvoering
- **V1.2** — Opleverrapportage
- **V1.3** — Bibliotheek & Documenten
- **V2.0** — Mobiele monteur-app

## User preferences

- Alle UI-tekst volledig in het Nederlands
- Geen emoji's in de code of UI
- Rode/oranje primaire kleur (HSL 12 90% 50%), donkere sidebar

## Gotchas

- Voer na elke OpenAPI wijziging altijd `pnpm --filter @workspace/api-spec run codegen` uit
- Route handlers moeten `bijgewerktOp: new Date()` meesturen bij PATCH/PUT
- `pnpm run dev` niet uitvoeren vanuit de root — gebruik workflows

## Pointers

- Zie de `pnpm-workspace` skill voor workspace structuur, TypeScript setup en package details
