# FPS Brandpreventie

FPS Brandpreventie is een Nederlands platform voor het registreren, beheren en inspecteren van brandpreventieve gebouwvoorzieningen (branddeur, doorvoering, brandklep, manchet, coating, etc.).

> **Ontwikkelfilosofie:** Zie [`docs/ontwikkelfilosofie.md`](docs/ontwikkelfilosofie.md) — verplicht referentiedocument voor alle toekomstige werkzaamheden. Kernregel: stabiliteit van de kantoorversie heeft altijd voorrang op nieuwe functionaliteit.

## Naamgeving (platform)

Het platform heeft twee namen, afhankelijk van de doelgroep:
- **FPS Connect** — interne naam. Gebruik voor interne schermen, de beheeromgeving, interne navigatie, documentatie en beheerdersrollen.
- **FPS One** — klantnaam. Gebruik uitsluitend richting klanten: klantportaal, klantlogin, e-mails/notificaties aan klanten, opleverrapporten en klantgerichte teksten.

Bestaande termen (klantomgeving, klantenportaal, gebruikersomgeving, appnaam) worden consequent volgens deze tweedeling vervangen. De rename raakt veel schermen en wordt daarom stapsgewijs en zichtbaar doorgevoerd (kleine increments, telkens beoordeelbaar in de preview).

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — API server starten (poort 8080)
- `pnpm --filter @workspace/firevault run dev` — Frontend starten (poort 25392)
- `pnpm run typecheck` — volledige typecheck
- `pnpm run build` — typecheck + build alle packages
- `pnpm --filter @workspace/api-spec run codegen` — API hooks en Zod schemas regenereren
- `pnpm --filter @workspace/db run push` — DB schema pushen (dev only)
- `pnpm --filter @workspace/scripts run security-scan` — beveiligingsscan (pnpm audit + verouderde pakketten), rapporteert alleen, wijzigt niets
- `pnpm --filter @workspace/scripts run kwaliteitscheck` — volledige kwaliteitscontrole (typecheck alle packages, build, OpenAPI-drift, DB schema, architectuur, security); rapporteert alleen, wijzigt niets. Zie [docs/kwaliteitscontrole.md](docs/kwaliteitscontrole.md).
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

- Pilotomgeving: Planning aan, Calculatie uit.
- Als een module uitgeschakeld is, verdwijnt het nav-item automatisch en toont de route "niet beschikbaar in pilot".
- Calculatie moet worden doorontwikkeld in een geïsoleerde omgeving; het raakt kostprijzen, tarieven, marges en commerciële besluitvorming.
- Zie `artifacts/firevault/src/lib/feature-flags.ts` voor de implementatie.

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
- Alleen `/auth/*`, `/healthz` en `/installatie*` zijn publiek; alle dataroutes staan achter `requireAuth`.
- **Eerste-installatie bootstrap** (`/first-install`, `GET`/`POST /installatie`): zolang de `gebruikers`-tabel leeg is (bijv. een verse eigen-hosting-installatie), kan hierlangs eenmalig de eerste hoofdbeheerder aangemaakt worden. Zodra er één gebruiker bestaat, is dit pad permanent en fail-closed dicht (403), ook bij gelijktijdige verzoeken (advisory lock + hertelling in transactie). Hergebruikt dezelfde aanmaak-/hash-logica als `POST /gebruikers` via `lib/gebruiker-aanmaken.ts`.

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

V1.0 ("Administratief gereed voor uitvoering" — een project volledig binnen de app voorbereiden, zonder Excel, losse e-mails of externe documenten) is afgerond. V1.0, V1.1 (Rollen & bevoegdheden), V1.2 (Bibliotheek & documentstructuur), — naar feitelijke status — V1.3 (Spots & uitvoering) en V1.4 (Opleverrapportage) zijn gebouwd; de eerstvolgende actieve fase is V1.5 (Rapportenmodule, deels al gebouwd via V1.4 — restscope: centrale rapportenbibliotheek, koppelingen, volledige reactietermijn-statusmachine). Parallel hieraan is — met formeel akkoord van de gebruiker — de Fase 1-basis van drie modules gebouwd (HRM/Personeel, Dossiermodule, Offerte Intelligence); zie het parallelle spoor hieronder.

**Ontwikkelstop — opgeheven (13 juni 2026).** De gebruiker heeft de Ontwikkelstop expliciet opgeheven en gevraagd de volledige openstaande roadmap te bouwen; per-fase formeel akkoord vooraf is niet meer vereist. De enige harde eis is zorgvuldig en beoordeelbaar bouwen: elk increment wordt als één op zichzelf staande, terugdraaibare checkpoint opgeleverd, zodat een increment dat architecturaal negatief uitpakt afzonderlijk teruggerold kan worden. De bouwvolgorde volgt afhankelijkheden (architectplan + `.local/session_plan.md`): Document Design System (visuele basis) → V1.4 Opleverrapportage → V1.5 Rapportenmodule → S.G. Constructies → V2.0 mobiel → biometrie/toolbox → V3.0/CRM/klantportaal → strategische AI-lijn. V1.3 en de overige Gebouwd-items blijven ongewijzigd. De roadmap-secties hieronder blijven als statusoverzicht (Gebouwd/Actief/Parallel/Geparkeerd) en worden per increment bijgewerkt. **Uitzondering met formeel akkoord:** de Fase 1-basis van het parallelle spoor (HRM/Personeel, Dossiermodule, Offerte Intelligence) is bewust vooruit gebouwd; de diepere uitwerking ervan blijft geparkeerd (geen AI-logica, geen automatische offerteverzending, geen salarisadministratie). Verlof (opname/opbouw/saldo's + CAO-kaders) is op expliciet verzoek van de gebruiker — als afwijking van de oorspronkelijke afbakening — wél meegenomen in de HRM Fase 1-basis; zie [docs/roadmap/parallel-spoor.md](docs/roadmap/parallel-spoor.md). Geparkeerd (verder weg, NIET vooruit uitbouwen): mobiele monteur-app (V2.0), de volledige HRM-module FPS Groep (V3.0) incl. verlof/uren/gereedschap, de CRM-module, en S.G. Constructies (herzien: een samengestelde-constructie spottype binnen Spots + constructietemplates in de Bibliotheek, inclusief deuren/opwaarderingen; géén aparte bibliotheeklaag meer). (AI-fotoherkenning spotafwerking en AI-bibliotheekvalidatie zijn op verzoek vooruit gebouwd; zie [docs/roadmap/gebouwd.md](docs/roadmap/gebouwd.md).) Eveneens met expliciet akkoord, als afgebakende uitzondering op de "geen AI-logica"-regel van het parallelle spoor: AI die per functie passende opleidingen/cursussen *voorstelt* in de HRM-opleidingenmodule (alleen voorstellen, een mens bevestigt en slaat op — geen AI-personeelsadvies); zie [docs/roadmap/parallel-spoor.md](docs/roadmap/parallel-spoor.md). Bestaande scaffolds (o.a. `artifacts/firevault/src/pages/crm/`) niet verder uitbouwen.

**Roadmap — sporen (per fase formeel akkoord vóór bouw):**

_Gebouwd:_
- **V1.0** — Administratief gereed voor uitvoering
- **V1.1** — Rollen & bevoegdheden
- **V1.2** — Bibliotheek & documentstructuur (applicaties, toepassingen, documenten, ETA's, koppelingen, versiebeheer)
- **V1.3** — Spots & uitvoering (feitelijke status: gebouwd) — spotflow web+mobiel, plattegrond SVG-editor + mobiele renderer, scheidingen, toewijzingen, voorbereide spots, clusters + serie plaatsen; restpunten zijn verfijning/gebruiksvriendelijkheid (detail in [docs/roadmap/gebouwd.md](docs/roadmap/gebouwd.md))
- **DMS / Documentenbibliotheek** — uitbreiding op V1.2 + dossiers, met formeel akkoord gebouwd: detail/logboek, polymorfe koppelingen (gebouw/klant/offerte/dossier), duplicaatdetectie (sha256 + fuzzy), goedkeuringsflow, signaleringen (verlopen/binnenkort/controle/ter goedkeuring), DMS-dashboard, audittrail, downloadlogging en read-only mobiele documentenweergave. **Inclusief het V1.5-bevriezingsdeel op dossiers** (`POST /dossiers/:id/definitief` bevriest revisie + PDF per gekoppeld document; definitieve dossiers serveren de bevroren snapshot). Hergebruikt de bestaande document-AI; geen nieuwe/geparkeerde AI. Zie [docs/roadmap/gebouwd.md](docs/roadmap/gebouwd.md)
- **AI Spotherkenning met zelflerende correcties** en **AI Bibliotheekvalidatie** — op verzoek vooruit gebouwd; AI stelt voor, een mens bevestigt, AI keurt nooit zelfstandig juridisch goed. Zie [docs/roadmap/gebouwd.md](docs/roadmap/gebouwd.md) voor de bouwdetails
- **V1.4** — Opleverrapportage (8 juli 2026) — acht rapporttypes als sectie-presets (o.a. Werkpakket monteur, Voortgangsrapportage, Opleverrapport brandveiligheid, Opleverdossier compleet) met afvinkbare secties incl. "Alles selecteren", spotselectie per verdieping/cluster/individueel, handmatige e-mailselectie naast AI-filter, bijlagenbundel-PDF (ETA's/certificaten/tekeningen), en een gepersisteerde `opleverrapporten`-entiteit met "definitief maken" + documentbevriezing. Bouwt voort op de bestaande live-rapportage in `print.tsx`. Zie [docs/roadmap/gebouwd.md](docs/roadmap/gebouwd.md)

_Actief (vastgelegd; elk pas bouwen ná formeel akkoord op die fase) — detail in [docs/roadmap/actief.md](docs/roadmap/actief.md):_
- **V1.5** — Rapportenmodule — **deels al gebouwd via V1.4** (gepersisteerde definitieve rapporten + bevriezing); restscope: centrale rapportenbibliotheek met zoek-/filterfuncties, koppeling naar CRM/onderhoud/klantportaal, en de volledige formele-opleverstatus-statusmachine (reactietermijn loopt/verstreken/vervangen door nieuwe versie)
- **Document Design System** — modulebrede documentmotor: drie templatefamilies (A klantdocumenten, B HRM/juridisch, C interne operationele), per-werkmaatschappij centraal beheer (bouwt op de Werkgever-entiteit), versiebeheer + PDF + latere digitale ondertekening. Eerste oplevering — **visuele basis gebouwd (13 juni 2026)**: herbruikbare documentcomponenten + previewpagina onder Beheer › Documentopmaak (`/beheer/documentopmaak`, gated op systeem). URL-veilige branding-velden zodat de Werkgever-entiteit ze later kan voeden. **Versiebeheer Document Studio-modellen gebouwd (8 juli 2026)**: exact één actief (goedgekeurd) model per werkgever/documenttype, nieuwe uploads altijd als concept, AI werkt alleen op concepten (server-side afgedwongen), expliciet goedkeuren archiveert het oude model en activeert het nieuwe, volledige versiegeschiedenis zichtbaar en terug te zetten, bestaande offertes blijven gekoppeld aan hun oorspronkelijke modelversie. Verdieping (PDF, digitale ondertekening, per-werkmaatschappij centraal beheer) volgt. Detail in [docs/roadmap/document-design-system.md](docs/roadmap/document-design-system.md)
- **Update-voorblad bij login** — voorstel (ontwerp + datamodel klaar, 8 juli 2026), **nog geen formeel akkoord, NIET bouwen**: versiebeheer-/changelogpopup die per gebruiker bijhoudt welke release al gezien is en bij een nieuwe gepubliceerde release één keer een voorblad toont (versienummer, releasedatum, wijzigingen, nieuwe functies, opgeloste bugs, aandachtspunten); publiceren staat los van deployen zodat een kritieke bugfix nooit hierop hoeft te wachten. Detail in [docs/roadmap/update-voorblad-login.md](docs/roadmap/update-voorblad-login.md)

_Parallel spoor (Fase 1-basis gebouwd met formeel akkoord; diepere uitwerking blijft geparkeerd) — detail in [docs/roadmap/parallel-spoor.md](docs/roadmap/parallel-spoor.md):_
- **HRM / Personeel** — Fase 1-basis: medewerkers, functiehuis, opleidingen/certificaten (onderscheid opleiding vs. cursus + rijke velden: niveau MBO/HBO/WO-UT/anders, opleider, studieduur, studiebelasting, lesvorm, kostenverdeling werkgever/werknemer, functie-koppeling via M2M), bekwaamheidsmatrix, verlofsoorten (incl. bijzondere/CAO-naslag) en — op expliciet verzoek — verlofsaldo's (opbouw/opname) + verlofaanvragen + onboarding (CAO/verlofuren/aanvang dienstverband). Met expliciet akkoord (afgebakende AI-uitzondering): AI stelt per functie passende opleidingen/cursussen *voor* (`POST /functies/:id/opleidingen-voorstel`); een mens accepteert en pas dan worden ze opgeslagen en aan de functie gekoppeld — geen AI-personeelsadvies. Met formeel akkoord "breed en praktisch" verder uitgebouwd binnen deze Fase 1-diepte: de module draait op de bestaande gebruikersaccounts (`medewerkers.gebruiker_id`) — een bestaande gebruiker is in één klik te onboarden als medewerker met voorgevulde naam/e-mail, en de account/rol-koppeling is overal zichtbaar. Een medewerker-detailpagina (`/personeel/:id`) brengt profiel, account/rol, functie, opleidingen (met verloopsignalering), bekwaamheden (per categorie/niveau, bewerkbaar) en verlof (saldo + aanvragen indienen/goedkeuren/afwijzen) samen. Gating via de bevoegdheden-matrix (`personeel`, lezen 1 / schrijven 2), niet via rol-strings. Bewust BUITEN scope (Ontwikkelstop / V3.0): salarisadministratie, AI-personeelsadvies/-coaches, werving & selectie, beoordeling & ontwikkeling, ziekte/verzuim, planning & inzetbaarheid, en volledige mobiele self-service voorbij de bestaande read-mostly schermen. Web-pagina + read-mostly mobiele schermen
- **Dossiermodule** — Fase 1-basis: dossiers per gebouw met status concept → definitief → gearchiveerd. Het juridisch sluitende, bevroren opleverdossier blijft V1.5
- **Offerte Intelligence** — Fase 1-basis: ALLEEN voorbereiding (regels uit spots, sjablonen). Bewust GEEN AI-calculatie en GEEN automatische verzending; een mens stelt op en verstuurt

_Geparkeerd (NIET vooruit bouwen) — detail in [docs/roadmap/geparkeerd.md](docs/roadmap/geparkeerd.md):_
- **V2.0** — Mobiele monteur-app (mijn werk, gebouwen, plattegronden, spots, foto's, offline synchronisatie, routeplanning); biometrisch inloggen (vingerafdruk/gezichtsherkenning) als optionele snelle ontgrendeling — op verzoek vastgelegd, geparkeerd
- **Toolbox & berichten met leesbevestiging (mobiel)** — projectleider/directeur plaatst toolbox-onderwerpen en berichten in FPS Connect; monteur/personeel leest ze in de FPS Monteur-app en bevestigt "gelezen en begrepen" (leesbevestiging met audittrail). Leunt op V2.0/V3.0 — op verzoek vastgelegd, geparkeerd
- **V3.0** — Personeel / Medewerkerportaal, uitgebouwd tot een **HRM-module voor de volledige FPS Groep** (verlof, uren, gereedschap, opleidingen, contracten, bekwaamheidsmatrix, werving, mobiele medewerkersapp, AI-coaches); zie [docs/roadmap/geparkeerd.md](docs/roadmap/geparkeerd.md)
- **AI Brandveiligheidsmanager / AI Calculator / Klantmodule** — strategische lijn: klantportaal, documentbeheer, continuïteitslaag project↔onderhoud en AI-calculatie/offerte/klantmanager; zie [docs/roadmap/geparkeerd.md](docs/roadmap/geparkeerd.md)
- **S.G. Constructies** — herzien (op verzoek): GEEN aparte bibliotheeklaag, maar een samengestelde-constructie spottype binnen Spots (meerdere onderdelen/toepassingen per spot) + constructietemplates in de Bibliotheek; meetwaarde/brandwerendheid afgeleid, niet handmatig (zie [docs/roadmap/geparkeerd.md](docs/roadmap/geparkeerd.md))
- **CRM-module** — bredere CRM; bewust achtergesteld op V1.5 (bestaande scaffold niet verder uitbouwen)
- **AI-uitbreidingen** — verdere AI-functionaliteit (confidence-drempel "controle nodig" bij lage zekerheid, periodieke documentcontrole, matcher uitbreiden); de reeds gebouwde AI-functies staan onder Gebouwd
- **Fase 2 — Bedrijfsbesturing, calculatie & managementinformatie** (strategische horizon NÁ de huidige Connect-roadmap; **geen bouwopdracht**, NIET vooruit bouwen) — Connect groeit van operationeel platform naar bedrijfsbesturingssysteem: calculatie/projectbegroting als fundament, projectcontrol, project health, klantintelligence, capaciteitsinzicht, managementdashboard, en een eenrichtingskoppeling Connect → AccountView (AccountView blijft leidend voor boekhouding). Iedere toekomstige functie moet één van vijf kernvragen beter beantwoorden. Huidige prioriteiten blijven ongewijzigd (Connect operationeel afronden, FPS One geen prioriteit, geen vertragende nieuwe modules). Detail in [docs/roadmap/fase-2-bedrijfsbesturing.md](docs/roadmap/fase-2-bedrijfsbesturing.md)

Volgorde-wijziging (vastgelegd, vervangt de eerdere ordening): Rollen & bevoegdheden is V1.1 (gebouwd). De bibliotheekherstructurering verschuift naar V1.2, gevolgd door Spots & uitvoering (V1.3) en Opleverrapportage (V1.4). Nieuw is V1.5 Rapportenmodule: een centrale, juridisch correcte rapportenbibliotheek met definitieve rapporten per gebouw, versiebeheer en documentbevriezing. Dit wordt bewust als kernonderdeel behandeld (geen "extra wens") en krijgt voorrang boven een bredere CRM. De eerdere V2.1 (Medewerkerportaal Desktop) en V2.2 (Medewerkermodule mobiel) zijn samengevoegd tot V3.0 (Personeel / Medewerkerportaal). De Ontwikkelstop blijft als principe gelden: per fase pas bouwen ná formeel akkoord.

## Openstaande correcties

Afrondpunten / herstelacties — geen roadmapfasen, maar opschoonwerk dat nog blijft liggen. Bewust apart gehouden zodat ze niet tussen de grote roadmaponderdelen zweven.

### Meetwaarden volledig uit spots verwijderen — afgerond

Spots tonen of bewaren geen losse meetwaarden (WRD/EW/EI-minuten) meer; de werendheid wordt uitsluitend afgeleid uit de testnorm van de gekoppelde toepassing (zie `voorzieningen/detail.tsx`). De invoervelden waren al verwijderd; de legacy WBDBO/WRD/classificatie-weergave is nu ook overal weg:
- web plattegrond zijpaneel — bevatte al geen meetwaarden-weergave (toont type/status/cluster/monteurs/foto's);
- mobiele spotdetailpagina — idem; `classificatie`/`wbdbo`/`wrd` staan nog in het prop-type maar worden niet getoond;
- QR-label (`voorzieningen/qr.tsx`) — leidt de werendheid nu uitsluitend af uit de testnorm; de legacy fallback op de spot-velden is verwijderd.

DB-kolommen (`wbdbo`, `wrd`) en de bijbehorende prop-typevelden blijven bestaan voor legacy fallback — niet droppen; ze worden alleen niet meer weergegeven.

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
