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
- **V1.1** — Bibliotheekherstructurering & Documenten (naar voren gehaald: eerstvolgende fase, vóór Spots & Uitvoering en vóór de mobiele monteur-app)
- **V1.2** — Spots & Uitvoering
- **V1.3** — Opleverrapportage
- **V2.0** — Mobiele monteur-app (monteurflow: werk, route, plattegronden, spots, foto's, gereedmelden)
- **V2.1** — Medewerkerportaal Desktop (HRM-module, mogelijke vervanger Apployed)
- **V2.2** — Medewerkermodule mobiel (optionele module naast monteurmodule)

Volgorde-wijziging (vastgelegd): de bibliotheekherstructurering is op verzoek naar voren gehaald naar V1.1. De opleverrapportage (V1.3) leunt op een betrouwbare, gestructureerde bibliotheek (toepassingen + gekoppelde ETA's/DoP's/classificatierapporten), dus de bibliotheek wordt eerst op orde gebracht. De Ontwikkelstop blijft gelden: bouwen pas ná formeel akkoord op V1.0.

### V2.1 — Medewerkerportaal Desktop (vastgelegd, NIET bouwen voor V2.0 afgerond)

NIET bouwen voor V2.0 (mobiele monteurflow) formeel akkoord is. Mogelijke vervanger van Apployed. De bevoegdheden-matrix in `lib/permissies` wordt uitgebreid met module-ID's `personeel` en `verlof` zodat toegang per gebruiker instelbaar blijft.

Doelgroepen: hoofdbeheerder, beheerder-financien, HRM-adviseur.

Functies (desktop/webapp):
- Medewerkersprofielen (persoonsgegevens, noodcontact, BSN/contractgegevens)
- Contractbeheer (type, uren, looptijd, verlengingen)
- Verlofsaldo en verlofopbouw (automatisch of handmatig)
- Verlofaanvragen — aanvragen, goedkeuren/afwijzen, kalenderoverzicht
- Ziekte en verzuim bijhouden
- Urenoverzichten per medewerker of team
- Documenten (arbeidsovereenkomsten, loonstroken, certificaten)
- Opleidingen en cursussen (bijhouden voortgang en certificaten)
- Gereedschap en materieel beheer per medewerker
- Rapportages (verlofsaldo, verzuimpercentage, urenbezetting)

### V2.2 — Medewerkermodule mobiel (optionele module in FPS Monteur-app, NIET bouwen voor V2.1)

De FPS Monteur-app wordt modulair: modules per gebruiker aan- of uitzetten via bevoegdheden-matrix.

- **Monteurmodule** (bestaand doel V2.0): werk, route, plattegronden, spots, foto's, gereedmelden.
- **Medewerkermodule** (V2.2): eigen profiel, verlof aanvragen, verlofsaldo bekijken, uren invullen, weekplanning inzien, eigen gereedschap bekijken, instructies/cursussen afronden.

### V1.1 — Bibliotheekherstructurering & Documenten (vastgelegde architectuur, ~90-95% definitief)

NIET bouwen tijdens V1.0. Pas bouwen na formeel akkoord op V1.0; dit is dan de eerstvolgende fase (vóór Spots & Uitvoering en vóór de mobiele monteur-app). Onderstaande architectuur is vastgelegd om verschuiven te voorkomen.

Doel: de bibliotheek wordt de centrale kennisbank voor alle brandveiligheidsapplicaties, toepassingen en onderliggende documentatie.

**Status bestaande scaffold (reeds aanwezig — basis ~90% klaar):**
- Applicaties: tabel `voorziening_types` (code, naam, categorie, volgorde) + read-only catalogusweergave in `beheer/bibliotheek.tsx` (tab Applicaties).
- Toepassingen: tabel `labels` (typeCode, naam, fabrikant, testnorm, testrapportId) + volledige CRUD + Excel-import (XLSX) in `beheer/bibliotheek.tsx` en `beheer/toepassingen.tsx`.
- Testrapporten: tabel `testrapporten` (naam, fabrikant, norm, rapportnummer, pdfUrl, gearchiveerd) + CRUD via `routes/classificatie.ts`.
- Koppeling spot ↔ toepassing: junctietabel `voorziening_labels` (many-to-many) + pickers in het spotformulier.
- AI-analyse (deels): bestaande AI leest tekeningbestanden (nette naam, tekeningtype, verdieping) en gebouwbeelden — nog NIET voor bibliotheekdocumenten (ETA/DoP/classificatie).

**Nog te bouwen (gap t.o.v. specificatie):**
- Centrale documentbibliotheek met documenttypes ETA's, classificatierapporten, productcertificaten, DoP's, verwerkingsvoorschriften (nu alleen `testrapporten`).
- Veel-op-veel koppeling Document ↔ Applicatie (één ETA aan meerdere applicaties).
- Versiebeheer/revisies: documenten nooit overschrijven; oude revisies bewaren; statusveld per document (actueel, controle nodig, vervangen, mogelijk verouderd, ingetrokken).
- Historische bevriezing: definitieve opleverrapporten gekoppeld aan de documentversies die op dat moment geldig waren; nieuwe versies mogen definitieve rapporten nooit wijzigen.
- AI-documentanalyse voor bibliotheekdocumenten: fabrikant, product, documenttype, EN-norm, revisie, datum herkennen + documentnaam voorstellen.
- Documentcontrole (later): periodieke controle op leverancierswebsites, nieuwe versies als voorstel tonen.

Structuur (hiërarchie):
- **Applicaties** — genummerd (1.1, 1.2, 2.5, enz.). Een applicatie = situatie die op locatie voorkomt.
- **Toepassingen** — onder iedere applicatie (bv. Mulcol Multicollar Slim, Hilti CFS-C P, Rockwool systeem, Nullifire systeem). Een toepassing = gekozen oplossing.
- **Documenten** — centrale documentbibliotheek: ETA's, classificatierapporten, testrapporten, productcertificaten, DoP's, verwerkingsvoorschriften.

AI-documentanalyse (na upload): AI herkent fabrikant, product, documenttype, EN-norm, revisie en datum, en stelt een documentnaam voor.

Koppelingen: Document ↔ Applicatie is een veel-op-veel relatie (één ETA kan aan meerdere applicaties gekoppeld zijn).

Versiebeheer: documenten nooit overschrijven. Een nieuwe versie wordt als nieuwe revisie opgeslagen; oude revisies blijven bewaard. Status per document: actueel, controle nodig, vervangen, mogelijk verouderd, ingetrokken.

Historische bevriezing: definitieve opleverrapporten blijven gekoppeld aan de documentversies die op dat moment geldig waren. Nieuwe documentversies mogen nieuwe rapporten en conceptrapporten beïnvloeden, maar NOOIT reeds definitieve rapporten wijzigen.

Documentcontrole (later): periodieke controle op leverancierswebsites, nieuwe versies als voorstel tonen; de beheerder beslist.

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
