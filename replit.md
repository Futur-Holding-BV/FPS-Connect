# FireVault

FireVault is een Nederlands brandpreventie platform voor het registreren, beheren en inspecteren van brandpreventieve gebouwvoorzieningen (branddeur, doorvoering, brandklep, manchet, coating, etc.).

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — API server starten (poort 8080)
- `pnpm --filter @workspace/firevault run dev` — Frontend starten (poort 25392)
- `pnpm run typecheck` — volledige typecheck
- `pnpm run build` — typecheck + build alle packages
- `pnpm --filter @workspace/api-spec run codegen` — API hooks en Zod schemas regenereren
- `pnpm --filter @workspace/db run push` — DB schema pushen (dev only)
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

## Product

FireVault biedt:
- **Dashboard** met live statistieken: gebouwen, voorzieningen, onderhoud en aankomende inspectiedatums
- **Gebouwenbeheer**: registratie van gebouwen met verdiepingen, 3D CSS-weergave, zoekfunctie
- **Voorzieningenoverzicht**: 10+ object types (branddeur, doorvoering, brandklep, manchet, coating…), statusfiltering, detailpagina's
- **Inspecties**: oplevering, periodiek, jaarlijks en herstel inspecties bijhouden
- **Onderhoud**: werkorders met prioriteit, deadline, toewijzing en statussturing
- **Gebruikersbeheer**: rollen beheerder, monteur, controleur en klant
- **Abonnementen**: 3 pakketten (Basis €149, Beheer €349, Volledig €699/maand)

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
