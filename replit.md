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

## Ontwikkelstop & roadmap

> De volledige detailuitwerking per fase staat in [`docs/roadmap/`](docs/roadmap/README.md): [gebouwd](docs/roadmap/gebouwd.md), [actief](docs/roadmap/actief.md), [parallel spoor](docs/roadmap/parallel-spoor.md), [geparkeerd](docs/roadmap/geparkeerd.md). Hieronder staan alleen de harde Ontwikkelstop-regel en het overzicht (de sporen).

V1.0 ("Administratief gereed voor uitvoering" — een project volledig binnen de app voorbereiden, zonder Excel, losse e-mails of externe documenten) is afgerond. V1.0, V1.1 (Rollen & bevoegdheden) en V1.2 (Bibliotheek & documentstructuur) zijn gebouwd; de eerstvolgende actieve fase is V1.3 (Spots & uitvoering). Parallel hieraan is — met formeel akkoord van de gebruiker — de Fase 1-basis van drie modules gebouwd (HRM/Personeel, Dossiermodule, Offerte Intelligence); zie het parallelle spoor hieronder.

**Ontwikkelstop (harde projectregel).** Blijft als principe gelden: per fase pas bouwen ná formeel akkoord op die fase; start geen latere fasen vooruit. De actieve fasen V1.3 (spots & uitvoering), V1.4 (opleverrapportage) en V1.5 (rapportenmodule) staan vast op de roadmap, maar worden elk pas gebouwd ná formeel akkoord op die fase. **Uitzondering met formeel akkoord:** de Fase 1-basis van het parallelle spoor (HRM/Personeel, Dossiermodule, Offerte Intelligence) is bewust vooruit gebouwd; de diepere uitwerking ervan blijft geparkeerd (geen AI-logica, geen automatische offerteverzending, geen salarisadministratie). Verlof (opname/opbouw/saldo's + CAO-kaders) is op expliciet verzoek van de gebruiker — als afwijking van de oorspronkelijke afbakening — wél meegenomen in de HRM Fase 1-basis; zie [docs/roadmap/parallel-spoor.md](docs/roadmap/parallel-spoor.md). Geparkeerd (verder weg, NIET vooruit uitbouwen): mobiele monteur-app (V2.0), de volledige HRM-module FPS Groep (V3.0) incl. verlof/uren/gereedschap, de CRM-module, en de aparte bibliotheeklaag voor s.g.-constructies (deuren/opwaarderingen). (AI-fotoherkenning spotafwerking en AI-bibliotheekvalidatie zijn op verzoek vooruit gebouwd; zie [docs/roadmap/gebouwd.md](docs/roadmap/gebouwd.md).) Bestaande scaffolds (o.a. `artifacts/firevault/src/pages/crm/`) niet verder uitbouwen.

**Roadmap — sporen (per fase formeel akkoord vóór bouw):**

_Gebouwd:_
- **V1.0** — Administratief gereed voor uitvoering
- **V1.1** — Rollen & bevoegdheden
- **V1.2** — Bibliotheek & documentstructuur (applicaties, toepassingen, documenten, ETA's, koppelingen, versiebeheer)
- **DMS / Documentenbibliotheek** — uitbreiding op V1.2 + dossiers, met formeel akkoord gebouwd: detail/logboek, polymorfe koppelingen (gebouw/klant/offerte/dossier), duplicaatdetectie (sha256 + fuzzy), goedkeuringsflow, signaleringen (verlopen/binnenkort/controle/ter goedkeuring), DMS-dashboard, audittrail, downloadlogging en read-only mobiele documentenweergave. **Inclusief het V1.5-bevriezingsdeel op dossiers** (`POST /dossiers/:id/definitief` bevriest revisie + PDF per gekoppeld document; definitieve dossiers serveren de bevroren snapshot). Hergebruikt de bestaande document-AI; geen nieuwe/geparkeerde AI. Zie [docs/roadmap/gebouwd.md](docs/roadmap/gebouwd.md)
- **AI Spotherkenning met zelflerende correcties** en **AI Bibliotheekvalidatie** — op verzoek vooruit gebouwd; AI stelt voor, een mens bevestigt, AI keurt nooit zelfstandig juridisch goed. Zie [docs/roadmap/gebouwd.md](docs/roadmap/gebouwd.md) voor de bouwdetails

_Actief (vastgelegd; elk pas bouwen ná formeel akkoord op die fase) — detail in [docs/roadmap/actief.md](docs/roadmap/actief.md):_
- **V1.3** — Spots & uitvoering (spotflow, plattegronden, toewijzingen, voorbereide spots, clustering)
- **V1.4** — Opleverrapportage (voorblad, rapportopmaak, e-mailselectie, bijlagenpakket, definitief maken)
- **V1.5** — Rapportenmodule (definitieve rapporten per gebouw, centrale rapportenbibliotheek, versiebeheer rapporten, bevriezing documenten, zoek- en filterfuncties, koppeling naar CRM/onderhoud/klantportaal, formele opleverstatus incl. reactietermijn met automatische herstart bij een nieuwe rapportversie)

_Parallel spoor (Fase 1-basis gebouwd met formeel akkoord; diepere uitwerking blijft geparkeerd) — detail in [docs/roadmap/parallel-spoor.md](docs/roadmap/parallel-spoor.md):_
- **HRM / Personeel** — Fase 1-basis: medewerkers, functiehuis, opleidingen/certificaten, bekwaamheidsmatrix, verlofsoorten (incl. bijzondere/CAO-naslag) en — op expliciet verzoek — verlofsaldo's (opbouw/opname) + verlofaanvragen + onboarding (CAO/verlofuren/aanvang dienstverband). Bewust GEEN salarisadministratie. Web-pagina + read-mostly mobiele schermen
- **Dossiermodule** — Fase 1-basis: dossiers per gebouw met status concept → definitief → gearchiveerd. Het juridisch sluitende, bevroren opleverdossier blijft V1.5
- **Offerte Intelligence** — Fase 1-basis: ALLEEN voorbereiding (regels uit spots, sjablonen). Bewust GEEN AI-calculatie en GEEN automatische verzending; een mens stelt op en verstuurt

_Geparkeerd (NIET vooruit bouwen) — detail in [docs/roadmap/geparkeerd.md](docs/roadmap/geparkeerd.md):_
- **V2.0** — Mobiele monteur-app (mijn werk, gebouwen, plattegronden, spots, foto's, offline synchronisatie, routeplanning)
- **V3.0** — Personeel / Medewerkerportaal, uitgebouwd tot een **HRM-module voor de volledige FPS Groep** (verlof, uren, gereedschap, opleidingen, contracten, bekwaamheidsmatrix, werving, mobiele medewerkersapp, AI-coaches); zie [docs/roadmap/geparkeerd.md](docs/roadmap/geparkeerd.md)
- **AI Brandveiligheidsmanager / AI Calculator / Klantmodule** — strategische lijn: klantportaal, documentbeheer, continuïteitslaag project↔onderhoud en AI-calculatie/offerte/klantmanager; zie [docs/roadmap/geparkeerd.md](docs/roadmap/geparkeerd.md)
- **S.G. Constructies** — aparte bibliotheeklaag voor scheidende/bouwkundige constructies, branddeuren en opwaarderingen (zie [docs/roadmap/geparkeerd.md](docs/roadmap/geparkeerd.md))
- **CRM-module** — bredere CRM; bewust achtergesteld op V1.5 (bestaande scaffold niet verder uitbouwen)
- **AI-uitbreidingen** — verdere AI-functionaliteit (confidence-drempel "controle nodig" bij lage zekerheid, periodieke documentcontrole, matcher uitbreiden); de reeds gebouwde AI-functies staan onder Gebouwd

Volgorde-wijziging (vastgelegd, vervangt de eerdere ordening): Rollen & bevoegdheden is V1.1 (gebouwd). De bibliotheekherstructurering verschuift naar V1.2, gevolgd door Spots & uitvoering (V1.3) en Opleverrapportage (V1.4). Nieuw is V1.5 Rapportenmodule: een centrale, juridisch correcte rapportenbibliotheek met definitieve rapporten per gebouw, versiebeheer en documentbevriezing. Dit wordt bewust als kernonderdeel behandeld (geen "extra wens") en krijgt voorrang boven een bredere CRM. De eerdere V2.1 (Medewerkerportaal Desktop) en V2.2 (Medewerkermodule mobiel) zijn samengevoegd tot V3.0 (Personeel / Medewerkerportaal). De Ontwikkelstop blijft als principe gelden: per fase pas bouwen ná formeel akkoord.

## Openstaande correcties

Afrondpunten / herstelacties — geen roadmapfasen, maar opschoonwerk dat nog blijft liggen. Bewust apart gehouden zodat ze niet tussen de grote roadmaponderdelen zweven.

### Meetwaarden volledig uit spots verwijderen

Spots tonen of bewaren geen losse meetwaarden (WRD/EW/EI-minuten) meer; de werendheid wordt uitsluitend afgeleid uit de testnorm van de gekoppelde toepassing (zie `voorzieningen/detail.tsx`). De invoervelden zijn al verwijderd en de afleiding via testnorm werkt grotendeels. DB-kolommen (`wbdbo`, `wrd`) blijven voor legacy fallback — niet droppen.

Nog op te schonen — de legacy WBDBO/WRD/classificatie-weergave verwijderen uit:
- web plattegrond zijpaneel;
- mobiele spotdetailpagina;
- QR-label.

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
