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

V1.0 ("Administratief gereed voor uitvoering" — een project volledig binnen de app voorbereiden, zonder Excel, losse e-mails of externe documenten) is afgerond. De huidige lopende fase is V1.1 (Rollen & bevoegdheden).

**Ontwikkelstop (harde projectregel).** Blijft als principe gelden: per fase pas bouwen ná formeel akkoord op die fase; start geen latere fasen vooruit. Geparkeerd tot hun fase formeel akkoord is en NIET vooruit uitbouwen: bibliotheek/versiebeheer & documentbewaking (V1.2), spots & uitvoering (V1.3), opleverrapportage (V1.4), rapportenmodule (V1.5), mobiele monteur-app (V2.0), personeel/medewerkerportaal incl. verlof/uren/gereedschap (V3.0), en de CRM-module. Bestaande scaffolds (o.a. `artifacts/firevault/src/pages/crm/`) niet verder uitbouwen.

**Roadmap (volgorde, per fase formeel akkoord vóór bouw):**
- **V1.0** — Administratief gereed voor uitvoering — Afgerond
- **V1.1** — Rollen & bevoegdheden — Lopend
- **V1.2** — Bibliotheek & documentstructuur (applicaties, toepassingen, documenten, ETA's, koppelingen, versiebeheer)
- **V1.3** — Spots & uitvoering (spotflow, plattegronden, toewijzingen, voorbereide spots, clustering)
- **V1.4** — Opleverrapportage (voorblad, rapportopmaak, e-mailselectie, bijlagenpakket, definitief maken)
- **V1.5** — Rapportenmodule (definitieve rapporten per gebouw, centrale rapportenbibliotheek, versiebeheer rapporten, bevriezing documenten, zoek- en filterfuncties, koppeling naar CRM/onderhoud/klantportaal)
- **V2.0** — Mobiele monteur-app (mijn werk, gebouwen, plattegronden, spots, foto's, offline synchronisatie, routeplanning)
- **V3.0** — Personeel / Medewerkerportaal (verlof, uren, gereedschap, opleidingen, contracten, HRM)

Volgorde-wijziging (vastgelegd, vervangt de eerdere ordening): Rollen & bevoegdheden is nu V1.1 (lopend). De bibliotheekherstructurering verschuift naar V1.2, gevolgd door Spots & uitvoering (V1.3) en Opleverrapportage (V1.4). Nieuw is V1.5 Rapportenmodule: een centrale, juridisch correcte rapportenbibliotheek met definitieve rapporten per gebouw, versiebeheer en documentbevriezing. Dit wordt bewust als kernonderdeel behandeld (geen "extra wens") en krijgt voorrang boven een bredere CRM. De eerdere V2.1 (Medewerkerportaal Desktop) en V2.2 (Medewerkermodule mobiel) zijn samengevoegd tot V3.0 (Personeel / Medewerkerportaal). De Ontwikkelstop blijft als principe gelden: per fase pas bouwen ná formeel akkoord.

### V1.2 — Bibliotheek & documentstructuur (gebouwd — definitief model)

Formeel akkoord en gebouwd. Volgt op V1.1 (Rollen & bevoegdheden) en gaat vóór V1.3 (Spots & uitvoering).

Doel: de bibliotheek is de centrale kennisbank voor alle brandveiligheidsapplicaties, toepassingen en onderliggende documentatie.

**Status bestaande scaffold (reeds aanwezig vóór V1.2):**
- Applicaties: tabel `voorziening_types` (code, naam, categorie, volgorde) + read-only catalogusweergave in `beheer/bibliotheek.tsx` (tab Applicaties).
- Toepassingen: tabel `labels` (typeCode, naam, fabrikant, testnorm, testrapportId) + volledige CRUD + Excel-import (XLSX) in `beheer/bibliotheek.tsx` en `beheer/toepassingen.tsx`.
- Koppeling spot ↔ toepassing: junctietabel `voorziening_labels` (many-to-many) + pickers in het spotformulier.
- AI-analyse (deels): bestaande AI leest tekeningbestanden (nette naam, tekeningtype, verdieping) en gebouwbeelden.

**Gebouwd in V1.2 (definitief model):**
- Centrale documentbibliotheek: tabel `documenten` met documenttypes ETA, classificatierapport, testrapport, productcertificaat, DoP, verwerkingsvoorschrift. Enum-velden als tekstkolommen (geen pgEnum — pgEnum breekt het SQL-DDL-workflow). Schema in `lib/db/src/schema/documenten.ts`.
- Samenvoeging testrapporten: de oude `testrapporten`-tabel is opgegaan in `documenten` (documenttype 'testrapport') via een idempotente SQL-migratie (INSERT ... SELECT met NOT EXISTS-guard). `labels.testrapportId` blijft fysiek bestaan (deprecaten, niet droppen); `mapLabel` leidt het embedded `testrapport`-object af uit `document_toepassingen` met fallback op legacy `testrapportId`.
- Twee veel-op-veel koppelingen: Document ↔ Applicatie via `document_applicaties` (voorziening_type_code) EN Document ↔ Toepassing via `document_toepassingen` (label_id). Eén ETA kan aan meerdere applicaties/toepassingen hangen.
- Versiebeheer/revisies (onveranderlijk): documenten worden nooit overschreven. Een revisie is een transactie (copy-on-revision): nieuwe rij met zelfde `groep_id`, `revisie_nummer = max+1`, status 'actueel'; de oude rij krijgt status 'vervangen'; junctie-rijen worden gekopieerd. PATCH wijzigt uitsluitend status/gearchiveerd/koppelingen — nooit naam/pdfUrl/metadata.
- Statusveld per document: actueel, controle nodig, vervangen, mogelijk verouderd, ingetrokken.
- AI-documentanalyse: endpoint `POST /documenten/ai-analyse` leest geüploade PDF-tekst (client-side pdf.js-extractie) → fabrikant, product, documenttype, EN-norm, revisie, datum + documentnaam-voorstel met betrouwbaarheidsindicatie. Voorstellen zijn GEEL/bewerkbaar; gebruiker bevestigt (NEUTRAAL).
- Frontend: tab "Documenten" in `beheer/bibliotheek.tsx` (`documenten-tab.tsx`): lijst + filters (type/status/fabrikant/alleen-actueel/incl-gearchiveerd), detail met revisiehistorie, upload + AI-voorstel, koppelen aan toepassing(en)/applicatie(s), statusbeheer en archiveren.
- Bevoegdheden (module "bibliotheek"): lezen = ingelogd; aanmaken/revisie/AI-analyse = niveau ≥3; status/archief/koppelingen = niveau ≥2.

**Bevriezing — voorbereid, niet voltooid in V1.2:** alleen onveranderlijke documentrevisies (nooit overschrijven). De daadwerkelijke koppeling definitief-rapport ↔ documentversie landt in V1.5 (Rapportenmodule), waar definitieve opleverrapporten worden gepersisteerd.

**Nog te bouwen (later, NIET in V1.2-scope):**
- Documentcontrole: periodieke controle op leverancierswebsites, nieuwe versies als voorstel tonen; de beheerder beslist.

Structuur (hiërarchie):
- **Applicaties** — genummerd (1.1, 1.2, 2.5, enz.). Een applicatie = situatie die op locatie voorkomt.
- **Toepassingen** — onder iedere applicatie (bv. Mulcol Multicollar Slim, Hilti CFS-C P, Rockwool systeem, Nullifire systeem). Een toepassing = gekozen oplossing.
- **Documenten** — centrale documentbibliotheek: ETA's, classificatierapporten, testrapporten, productcertificaten, DoP's, verwerkingsvoorschriften.

AI-documentanalyse (na upload): AI herkent fabrikant, product, documenttype, EN-norm, revisie en datum, en stelt een documentnaam voor.

Koppelingen: Document ↔ Applicatie is een veel-op-veel relatie (één ETA kan aan meerdere applicaties gekoppeld zijn).

Versiebeheer: documenten nooit overschrijven. Een nieuwe versie wordt als nieuwe revisie opgeslagen; oude revisies blijven bewaard. Status per document: actueel, controle nodig, vervangen, mogelijk verouderd, ingetrokken.

Historische bevriezing: bereid in V1.2 onveranderlijke documentrevisies voor (documenten nooit overschrijven). De bevriezing zelf — definitieve opleverrapporten blijven gekoppeld aan de documentversies die op dat moment geldig waren, en nieuwe versies wijzigen reeds definitieve rapporten nooit — wordt voltooid in V1.5 (Rapportenmodule), zodra definitieve rapporten worden gepersisteerd.

Documentcontrole (later): periodieke controle op leverancierswebsites, nieuwe versies als voorstel tonen; de beheerder beslist.

### V1.4 — Opleverrapportage (vastgelegd)

Bouwt voort op de bibliotheek (V1.2). Onderdelen: voorblad, rapportopmaak, e-mailselectie, bijlagenpakket en definitief maken van het rapport. De opleverrapportage wordt nu live gegenereerd in `print.tsx`; deze fase brengt de opmaak en het samenstellen op orde. Het gepersisteerd en onveranderlijk vastleggen van definitieve rapporten gebeurt in V1.5.

**Rapporttypes (vastgelegd, nog te bouwen in V1.4/V1.5).** Het rapportsamenstellen wordt typegestuurd met vier vaste rapporttypes; elk type is een voorinstelling van de secties (checkboxen) hieronder:
1. **Werkpakket monteur** (voor uitvoering) — projectgegevens, contactpersonen, relevante e-mails, plattegronden, spots, toegewezen werkzaamheden. Bewust GEEN ETA's of certificaten. (Leunt aan tegen de mobiele monteur-app V2.0.)
2. **Tussentijdse voortgangsrapportage** (voor opdrachtgever) — voortgang, aantallen spots, foto's, opmerkingen, eventueel openstaande punten.
3. **Opleverrapport brandveiligheid** (definitieve oplevering) — voorblad, opdrachtomschrijving, juridische uitgangspunten, plattegronden, spots, foto's, gebruikte applicaties, gebruikte toepassingen.
4. **Opleverdossier compleet** (archief/opdrachtgever/verzekeraar) — opleverrapport + ETA's, classificatierapporten, certificaten, relevante tekeningen, relevante e-mails, overige bijlagen.

**Sectie-checkboxen per rapport (samenstellen):** Voorblad, Projectomschrijving, Relevante e-mails, Plattegronden, Spotdetails, Foto's, ETA's, Classificatierapporten, Productcertificaten, Tekeningen, Juridische bijlagen, plus "Alles selecteren". Elk rapporttype zet een eigen standaard-selectie; de gebruiker kan per rapport afvinken.

**Concept vs. definitief (kern van V1.4 → persisteren in V1.5):**
- **Concept rapport** — blijft dynamisch; volgt actuele data en documentversies.
- **Definitief rapport** — wordt opgeslagen, krijgt een versienummer, **bevriest de gebruikte documentversies** en komt in de centrale rapportenmodule (V1.5) terecht. Bevriezing bouwt voort op de onveranderlijke documentrevisies uit V1.2.

Afhankelijkheid: de inhoud van rapporttype 3 (gebruikte applicaties/toepassingen) en 4 (ETA's/classificatierapporten/certificaten) leunt direct op de keten Applicatie → Toepassing → Document. Een schone, afgeleide documenthiërarchie is daarmee een randvoorwaarde voor juridisch correcte opleverrapporten.

### V1.5 — Rapportenmodule (nieuwe fase, vastgelegd)

Doel: een centrale rapportenbibliotheek met definitieve, juridisch correcte opleverrapporten per gebouw. Bewust als kernonderdeel van het product behandeld (geen "extra wens") en met voorrang boven een bredere CRM-module: voor FPS is een juridisch correct dossier met definitieve rapporten waardevoller dan uitgebreide CRM-functionaliteit.

Functies:
- Definitieve rapporten per gebouw (gepersisteerd, niet meer live-gegenereerd zoals nu in `print.tsx`)
- Centrale rapportenbibliotheek met zoek- en filterfuncties
- Versiebeheer van rapporten
- Bevriezing documenten: een definitief rapport blijft gekoppeld aan de documentversies die op het moment van vaststellen geldig waren; latere documentversies wijzigen definitieve rapporten nooit
- Koppelingen naar CRM, onderhoud en klantportaal

Afhankelijkheid: bevriezing vereist een gepersisteerde 'definitief opleverrapport'-entiteit. Nu genereert `print.tsx` het opleverrapport live uit actuele data; er is geen rapport-tabel. De volledige bevriezing landt daarom in deze fase (V1.5), bovenop de onveranderlijke documentrevisies uit V1.2.

### V3.0 — Personeel / Medewerkerportaal (vastgelegd, NIET bouwen voor V2.0 afgerond)

Consolideert de eerdere V2.1 (desktop) en V2.2 (mobiel). NIET bouwen voordat V2.0 (mobiele monteurflow) formeel akkoord is. Mogelijke vervanger van Apployed. De bevoegdheden-matrix in `lib/permissies` wordt uitgebreid met module-ID's `personeel` en `verlof` zodat toegang per gebruiker instelbaar blijft.

Doelgroepen: hoofdbeheerder, beheerder-financien, HRM-adviseur.

Desktop/webapp:
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

Mobiel (optionele module in FPS Monteur-app): de app wordt modulair, modules per gebruiker aan- of uitzetten via de bevoegdheden-matrix.
- **Monteurmodule** (V2.0): werk, route, plattegronden, spots, foto's, gereedmelden.
- **Medewerkermodule** (V3.0): eigen profiel, verlof aanvragen, verlofsaldo bekijken, uren invullen, weekplanning inzien, eigen gereedschap bekijken, instructies/cursussen afronden.

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
