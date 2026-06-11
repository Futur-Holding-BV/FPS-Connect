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

V1.0 ("Administratief gereed voor uitvoering" — een project volledig binnen de app voorbereiden, zonder Excel, losse e-mails of externe documenten) is afgerond. V1.0, V1.1 (Rollen & bevoegdheden) en V1.2 (Bibliotheek & documentstructuur) zijn gebouwd; de eerstvolgende actieve fase is V1.3 (Spots & uitvoering).

**Ontwikkelstop (harde projectregel).** Blijft als principe gelden: per fase pas bouwen ná formeel akkoord op die fase; start geen latere fasen vooruit. De actieve fasen V1.3 (spots & uitvoering), V1.4 (opleverrapportage) en V1.5 (rapportenmodule) staan vast op de roadmap, maar worden elk pas gebouwd ná formeel akkoord op die fase. Geparkeerd (verder weg, NIET vooruit uitbouwen): mobiele monteur-app (V2.0), personeel/medewerkerportaal incl. verlof/uren/gereedschap (V3.0), de CRM-module, en de aparte bibliotheeklaag voor s.g.-constructies (deuren/opwaarderingen). (AI-fotoherkenning spotafwerking en AI-bibliotheekvalidatie zijn op verzoek vooruit gebouwd; zie de eigen secties.) Bestaande scaffolds (o.a. `artifacts/firevault/src/pages/crm/`) niet verder uitbouwen.

**Roadmap — drie sporen (per fase formeel akkoord vóór bouw):**

_Gebouwd:_
- **V1.0** — Administratief gereed voor uitvoering
- **V1.1** — Rollen & bevoegdheden
- **V1.2** — Bibliotheek & documentstructuur (applicaties, toepassingen, documenten, ETA's, koppelingen, versiebeheer)
- **AI Spotherkenning met zelflerende correcties** en **AI Bibliotheekvalidatie** — op verzoek vooruit gebouwd; AI stelt voor, een mens bevestigt, AI keurt nooit zelfstandig juridisch goed. Zie de eigen secties voor de bouwdetails

_Actief (vastgelegd; elk pas bouwen ná formeel akkoord op die fase):_
- **V1.3** — Spots & uitvoering (spotflow, plattegronden, toewijzingen, voorbereide spots, clustering)
- **V1.4** — Opleverrapportage (voorblad, rapportopmaak, e-mailselectie, bijlagenpakket, definitief maken)
- **V1.5** — Rapportenmodule (definitieve rapporten per gebouw, centrale rapportenbibliotheek, versiebeheer rapporten, bevriezing documenten, zoek- en filterfuncties, koppeling naar CRM/onderhoud/klantportaal, formele opleverstatus incl. reactietermijn met automatische herstart bij een nieuwe rapportversie)

_Geparkeerd (NIET vooruit bouwen):_
- **V2.0** — Mobiele monteur-app (mijn werk, gebouwen, plattegronden, spots, foto's, offline synchronisatie, routeplanning)
- **V3.0** — Personeel / Medewerkerportaal, uitgebouwd tot een **HRM-module voor de volledige FPS Groep** (verlof, uren, gereedschap, opleidingen, contracten, bekwaamheidsmatrix, werving, mobiele medewerkersapp, AI-coaches); zie de eigen sectie
- **AI Brandveiligheidsmanager / AI Calculator / Klantmodule** — strategische lijn: klantportaal, documentbeheer, continuïteitslaag project↔onderhoud en AI-calculatie/offerte/klantmanager; zie de eigen sectie
- **S.G. Constructies** — aparte bibliotheeklaag voor scheidende/bouwkundige constructies, branddeuren en opwaarderingen (zie de eigen sectie)
- **CRM-module** — bredere CRM; bewust achtergesteld op V1.5 (bestaande scaffold niet verder uitbouwen)
- **AI-uitbreidingen** — verdere AI-functionaliteit (confidence-drempel "controle nodig" bij lage zekerheid, periodieke documentcontrole, matcher uitbreiden); de reeds gebouwde AI-functies staan onder Gebouwd

Volgorde-wijziging (vastgelegd, vervangt de eerdere ordening): Rollen & bevoegdheden is V1.1 (gebouwd). De bibliotheekherstructurering verschuift naar V1.2, gevolgd door Spots & uitvoering (V1.3) en Opleverrapportage (V1.4). Nieuw is V1.5 Rapportenmodule: een centrale, juridisch correcte rapportenbibliotheek met definitieve rapporten per gebouw, versiebeheer en documentbevriezing. Dit wordt bewust als kernonderdeel behandeld (geen "extra wens") en krijgt voorrang boven een bredere CRM. De eerdere V2.1 (Medewerkerportaal Desktop) en V2.2 (Medewerkermodule mobiel) zijn samengevoegd tot V3.0 (Personeel / Medewerkerportaal). De Ontwikkelstop blijft als principe gelden: per fase pas bouwen ná formeel akkoord.

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
- AI Bibliotheekvalidatie (koppelvoorstellen; toegevoegd na V1.2, vooruit op verzoek): endpoint `POST /documenten/ai-koppelvoorstellen` (uitvoeren = bibliotheek niveau 3) vergelijkt de actuele documenten met bestaande toepassingen via de bestaande matcher (`stelToepassingenVoor` in `services/document-ai.ts`) en stelt ontbrekende Document↔Toepassing-koppelingen voor. Voorstellen zijn GEEL/over te nemen, overgenomen koppelingen NEUTRAAL (AI-state kleurconventie). Koppelingen opslaan = niveau ≥2 (`useSetDocumentToepassingen`). De beheerder neemt per voorstel of per document over; AI koppelt nooit zelfstandig.

**Bevriezing — voorbereid, niet voltooid in V1.2:** alleen onveranderlijke documentrevisies (nooit overschrijven). De daadwerkelijke koppeling definitief-rapport ↔ documentversie landt in V1.5 (Rapportenmodule), waar definitieve opleverrapporten worden gepersisteerd.

**Nog te bouwen (later, NIET in V1.2-scope):**
- Documentcontrole: periodieke controle op leverancierswebsites, nieuwe versies als voorstel tonen; de beheerder beslist.

Structuur (hiërarchie):
- **Applicaties** — genummerd (1.1, 1.2, 2.5, enz.). Een applicatie = situatie die op locatie voorkomt.
- **Toepassingen** — onder iedere applicatie (bv. Mulcol Multicollar Slim, Hilti CFS-C P, Rockwool systeem, Nullifire systeem). Een toepassing = gekozen oplossing.
- **Documenten** — centrale documentbibliotheek: ETA's, classificatierapporten, testrapporten, productcertificaten, DoP's, verwerkingsvoorschriften.

(AI-documentanalyse, koppelingen, versiebeheer, historische bevriezing en documentcontrole staan hierboven onder "Gebouwd in V1.2" en "Nog te bouwen".)

### S.G. Constructies als aparte bibliotheeklaag (vastgelegd, geparkeerd — NIET vooruit bouwen)

Nieuw vastgelegd onderdeel, geparkeerd onder de ontwikkelstop. Naast de bestaande keten Applicatie → Toepassing → Document komt een aparte bibliotheeklaag voor s.g.-constructies: scheidende/bouwkundige constructies, branddeuren en opwaarderingen (een bestaande constructie naar een hogere brandwerendheid brengen). Reden voor een eigen laag: een s.g.-constructie is geen spot-afwerking maar de onderliggende bouwkundige scheiding waarop afwerkingen rusten; de AI stelt deze bewust NIET vast (zie de AI-fotoherkenning-sectie). Datamodel, koppelingen (bv. s.g.-constructie ↔ document/toepassing) en UI worden uitgewerkt bij formeel akkoord op deze fase.

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

**Formele opleverstatus & reactietermijn (vastgelegd, nog te bouwen in V1.5).** Een definitief rapport beheert ook de formele opleverstatus — een statusmachine per rapportversie:
- **Definitief verzonden** — bij definitief maken/versturen krijgt het rapport deze status; verzenddatum wordt vastgelegd; de reactietermijn start automatisch (standaard 14 dagen, configureerbaar); einddatum wordt berekend → status **Reactietermijn loopt**.
- **Juridisch gereedgemeld / Reactietermijn verstreken** — na het verstrijken van de termijn zonder reactie. Dit wordt gelogd bij zowel het gebouw als het rapport.
- **Vervangen door nieuwe versie** — bij reactie van opdrachtgever of een aanpassing: oude versie blijft bewaard, nieuwe versie wordt aangemaakt met nieuwe verzenddatum; de reactietermijn herstart daarbij automatisch (nieuwe termijn vanaf de nieuwe verzenddatum). De oude termijn wordt afgesloten met reden "vervangen door nieuwe versie".

Weergave in gebouwkaart → rapporten-tab, per rapport: rapportversie, datum verzonden, reactietermijn tot, dagen resterend, status, eventuele reactie opdrachtgever, en "vervangen door versie x".

Implementatienotitie (vastgelegd voor later): de overgang naar "verstreken" kan afgeleid worden bij lezen (verzenddatum + termijn) zodat geen achtergrondworker nodig is; de logregel bij gebouw/rapport mag lui of via een dagelijkse job worden weggeschreven. De termijn (14 dagen) wordt configureerbaar, niet hardgecodeerd.

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

#### HRM-module FPS Groep — volledige uitwerking van V3.0 (vastgelegd, toekomstige richting — NIET bouwen)

Strategische ontwerpopdracht, vastgelegd als toekomstige richting. Valt onder de Ontwikkelstop en de V3.0-regel (NIET bouwen vóór formeel akkoord en vóór V2.0 is afgerond). Dit is de grote visie achter V3.0: geen losse personeelsadministratie maar een geïntegreerde HRM-module die de medewerker over de volledige loopbaan begeleidt (sollicitatie → opleiding → inzetbaarheid → beoordeling → doorgroei → uitstroom).

**Scope (FPS Groep-breed):** FPS Bouw, FPS Brandpreventie, FPS Onderhoud en toekomstige werkmaatschappijen zoals Fuegro. Volledig integreerbaar met planning, projecten, opleidingen, kwaliteitsborging en de mobiele medewerkersapp.

**Doelgroepen:** monteurs brandpreventie (CAO Metaal & Techniek), timmermannen bouw (CAO Bouw & Infra), kantoorpersoneel (CAO Metaal & Techniek), projectleiders, werkvoorbereiders, directie, HRM, externe inhuur, uitzendkrachten, leerlingen/BBL.

**Hoofdmodules:**
1. **Personeelsdossiers** — per medewerker: persoons- en contactgegevens, contracten, functie, salarisgegevens, werkmaatschappij, CAO-indeling, documenten (identiteitsbewijzen, rijbewijs, verklaringen), verzuimgegevens, historie.
2. **Functiehuis** — per werkmaatschappij. FPS Bouw: timmerman, voorman, uitvoerder, projectleider. FPS Brandpreventie: monteur, applicateur, voorman, projectleider. Kantoor: administratie, werkvoorbereiding, calculatie, HRM, financieel, directie. Per functie: taken, verantwoordelijkheden, competenties, opleidingsvereisten, doorgroeipad.
3. **Opleidingen & certificeringen** — VCA, BHV, hoogwerker, rolsteiger, veilig werken, producttrainingen, interne opleidingen, toolboxen. Automatische signalering van verlopen certificaten/opleidingen en verplichte herhalingen.
4. **Bekwaamheidsmatrix** — per medewerker registreren welke werkzaamheden, producten, inspecties en zelfstandige projecten zijn toegestaan, met bekwaamheidsniveaus (voorbeeld Hilti-applicaties: niet bevoegd / onder begeleiding / zelfstandig / specialist / trainer).
5. **Beoordeling & ontwikkeling** — functionerings- en beoordelingsgesprekken, persoonlijke doelstellingen, ontwikkelplannen, competentiebeoordelingen, opleidingsadviezen.
6. **Planning & inzetbaarheid** — koppeling met de projectplanning (beschikbaarheid, vakanties, verlof, ziekte, opleidingen, certificeringen). Het systeem voorkomt inzet van medewerkers zonder de juiste bevoegdheden.
7. **Werving & selectie** — vacatures, sollicitaties, gesprekken, beoordelingen, contractvoorstellen, onboarding.
8. **Fuegro-integratie** — leerlingen, uitzendkrachten, externe monteurs, opleidingstrajecten, uitlenen van personeel.

**Mobiele medewerkersapp** (eigen app per medewerker, als modulaire uitbreiding van de FPS Monteur-app):
- Persoonlijk dashboard: agenda, projecten, werkbonnen, opleidingen, certificaten, verlofsaldo, berichten.
- Mijn projecten: projectinformatie, contactpersonen, werkbonnen, tekeningen, documenten, veiligheidsinformatie.
- Mijn opleidingen: behaalde opleidingen, verlopen certificaten, inschrijven, toolboxen bekijken, digitale toetsen.
- Digitale toolboxen: video, tekst, foto's, quizvragen, digitale ondertekening.
- Verlof & verzuim: verlof aanvragen, verlofhistorie, ziekmelding, herstelmelding.
- Beoordelingen: persoonlijke doelstellingen, ontwikkelpunten, opleidingsadviezen.
- Kennisbank: productinformatie, applicaties, werkinstructies, montagehandleidingen, ETA's, DoP's.

**AI-functionaliteit** (conform de bestaande AI-conventie: AI stelt voor, een mens beslist):
- **AI Persoonlijke Coach** (per medewerker): opleidings-, certificerings-, veiligheids- en loopbaanadvies.
- **AI Projectcoach**: analyseert uitgevoerde werkzaamheden, productiviteit, kwaliteit, foutmeldingen en opleidingsbehoefte.
- **AI Management Dashboard**: inzicht in bezettingsgraad, opleidingsstatus, verloop, verzuim, productiviteit en competentieontwikkeling.

**Strategische doelstelling:** uitgroeien tot een centraal platform voor personeelsontwikkeling, kwaliteitsborging, planning en kennismanagement binnen de volledige FPS Groep.

**Latere aanvulling (vastgelegd):** een bonus- & prestatiemodule (kwartaalbonussen, productiviteit, doorgroei van monteurs) sluit naadloos op deze HRM-module aan en maakt het systeem aantrekkelijker voor medewerkers.

### AI Brandveiligheidsmanager / AI Calculator / Klantmodule (strategische lijn, vastgelegd — toekomstige richting, NIET bouwen)

Strategische roadmaplijn, vastgelegd als toekomstige richting; nog niet bouwen (Ontwikkelstop). Conform de bestaande AI-conventie: AI stelt voor en een mens controleert/bevestigt; de AI verstuurt nooit zelfstandig definitieve offertes.

**Onderdelen:**
- **Klantportaal** — gebouwdossiers, definitieve documenten, werkbonnen en communicatie.
- **Documentenbeheer** — projectdocumentatie, versiebeheer, toegangscontrole, definitieve archivering en klantinformatie.
- **Continuïteitslaag project ↔ onderhoud** — definitieve projectdocumenten vormen de input voor onderhoud, herinspecties en mogelijke onderhoudscontracten.
- **AI-klantverwerking** — verwerkt klantwerkbonnen, foto's en documenten, reageert richting klant binnen afgesproken kaders en maakt werkbonvoorstellen.
- **Zelflerend** — AI leert van spots, oplossingen, uren, materialen, calculaties en offertes.
- **AI-calculatie & offerte** — op basis van spots: voorzieningen voorstellen, risico's benoemen, een interne calculatie maken en later een conceptofferte genereren. Het bestaande FPS-offerteformat is het uitgangspunt voor de offertegenerator. AI mag voorlopig geen definitieve offertes zelfstandig versturen; altijd controle door een medewerker.

**Voorgestelde strategische fasering (door de gebruiker aangedragen — OPEN BESLISSING):** deze fasering hergebruikt versienummers die in de bestaande, vastgelegde roadmap al iets anders betekenen (V1.3 = Spots & uitvoering — momenteel in aanbouw; V1.4 = Opleverrapportage; V1.5 = Rapportenmodule; V2.0 = Mobiele monteur-app). De definitieve inpassing/nummering is nog niet besloten en wordt pas vastgelegd na formeel akkoord; tot dan blijft de bestaande nummering leidend.
- V1.3 — huidige inspectie-/documentfunctionaliteit afronden.
- V1.4 — Document Management & Dossierbeheer.
- V1.5 — Klantportaal en gebouwdossiers.
- V2.0 — AI Calculator, AI Offertegenerator en AI Klantmanager.

### AI-fotoherkenning spotafwerking (gebouwd — eerste versie; vooruit op de roadmap op verzoek)

**Status: gebouwd.** Op uitdrukkelijk verzoek vooruit op de roadmap gebouwd (de Ontwikkelstop blijft als principe gelden voor de overige geparkeerde fasen). De AI als hulpmiddel, nooit als beslisser: AI herkent en stelt voor, mens accepteert. AI keurt nooit zelfstandig juridisch goed; de formele koppeling blijft gebaseerd op de bibliotheek en geaccepteerde rapporten.

**Gebouwd (eerste versie):**
- DB: tabel `spot_ai_voorstellen` (leerset; onveranderlijke jsonb-snapshot van AI-voorstel + monteurkeuze, foto-voor/na-url, afwijking-vlag, herkomst, bevestiger) + kolommen `ai_te_controleren` en `ai_voorstel_id` op `voorzieningen`. Additief via directe ALTER SQL.
- Backend `services/spot-ai.ts`: gpt-4o vision via de Replit OpenAI-proxy; foto-voor + foto-na als base64 via ObjectStorage. Twee-traps: vision → wand/plafond + applicatie-code + observaties (product/fabrikant), daarna een deterministische matcher tegen `labels` (toepassingen) en het actuele gekoppelde document. Bevestigde leerset-correcties worden als few-shot voorbeelden geïnjecteerd (gebouwspecifiek per gebouw, generiek globaal). AI stelt bewust GEEN s.g.-constructie/brandwerendheid vast.
- Endpoints: `POST /voorzieningen/ai-spotvoorstel` (analyse vóór de spot bestaat, op objectPaths), `POST /voorzieningen/:id/ai-voorstel` (leerset persisteren + afwijking berekenen + spot markeren), `POST /voorzieningen/:id/ai-controle` (beheerder bevestigt, kiest gebouwspecifiek/generiek, wist de vlag).
- Mobiel (monteur-app): flow foto-voor → foto-na → AI-paneel → amber voorinvulling (wand/plafond, applicatie, toepassing, document read-only) → overige velden; bij opslaan wordt de leerset gepersisteerd.
- Web (firevault, beheerder-review): rode gestreepte ring op gemarkeerde spots in de plattegrond, "Te controleren"-filter/teller + rode stip in de voorzieningenlijst, en een review-paneel in de spotdetail (foto's voor/na, AI-voorstel amber vs. gekozen toepassing, verplichte radio gebouwspecifiek/generiek, bevestig-knop die de markering laat verdwijnen).

**Bevoegdheden (vastgelegd in de bouw):** AI-voorstel maken/persisteren = niveau 3 (zodat de monteur die de spot maakt mag persisteren). AI-controle bevestigen = niveau 4 (volledig beheer), bewust hoger dan aanmaken zodat de monteur zijn eigen afwijking niet zelf kan bevestigen. De web-review wordt gegate via `useBevoegdheid().heeftNiveau("voorzieningen", 4)`, niet via rol-strings.

**Afwijking-bepaling:** een spot wordt voor beheerder-controle gemarkeerd wanneer de monteur een andere toepassing kiest dan de eerste AI-suggestie. Alleen een suggestie met score > 0 telt mee (een score-0 "hint" wordt mobiel niet voorinvuld en mag dus geen valse controle veroorzaken).

**Nog te doen (later):** confidence-drempel "controle nodig" bij lage zekerheid; periodieke documentcontrole; uitbreiden van de matcher naarmate de bibliotheek groeit.

Afhankelijkheid (harde randvoorwaarde): eerst moet de bibliotheekketen Applicatie -> Toepassing -> Document goed staan (V1.2) en de mobiele fotoflow met foto vóór/ná beschikbaar zijn (V2.0). Zonder een betrouwbare bibliotheek heeft de AI niets om aan te koppelen.

Workflow:
- Foto vóór staat al bij de voorbereide spot of wordt eerder gemaakt.
- Monteur maakt foto ná.
- AI vergelijkt/inspecteert de foto ná.
- AI doet een voorstel: applicatie, toepassing, product/fabrikant, brand- of rookwerendheid, waarschijnlijk rapport/ETA uit de bibliotheek, en mate van zekerheid (confidence-score).
- Monteur accepteert of past aan.
- Bij lage zekerheid: markeren als "controle nodig".
- Beheerder kan later corrigeren.
- Correcties worden opgeslagen als trainings-/leervoorbeelden (leerset).

Sluit aan op de bestaande AI-conventie in de app: AI-voorstellen zijn GEEL/bewerkbaar tot een mens bevestigt; geaccepteerd/bevestigd is NEUTRAAL (zie "AI-state kleurconventie").

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
