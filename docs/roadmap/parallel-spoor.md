# Roadmap — Parallel spoor (formeel akkoord gebruiker)

Apart spoor naast de hoofdroadmap (V1.x). De gebruiker heeft de Ontwikkelstop **formeel opgeheven voor de Fase 1-basis** van drie modules, die parallel aan de hoofdroadmap zijn gebouwd. Zie [`README.md`](./README.md) voor het overzicht en [`replit.md`](../../replit.md) voor de Ontwikkelstop-regel en de drie sporen.

**Reikwijdte van het akkoord.** Het formele akkoord geldt uitsluitend voor de hieronder beschreven Fase 1-basis (gedeeld datamodel, rechten, navigatie en basisschermen + een MVP per module). De diepere uitwerking blijft onder de Ontwikkelstop: de volledige HRM-module FPS Groep (V3.0) en de strategische AI-lijn (AI Calculator / AI Offertegenerator / Klantmodule) staan onverkort [geparkeerd](./geparkeerd.md) en worden NIET vooruit gebouwd.

**Harde uitsluitingen Fase 1 (vastgelegd):**
- GEEN AI-logica in deze modules (geen AI-calculatie, geen AI-offerte, geen AI-personeelsadvies).
- GEEN automatische offerteverzending — Offerte Intelligence bereidt uitsluitend voor; een mens stelt op en verstuurt.
- GEEN salarisadministratie.

**Uitbreiding op expliciet verzoek van de gebruiker (afwijking van de oorspronkelijke afbakening).** De oorspronkelijke opdracht sloot verlofregistratie uit. De gebruiker heeft dit tijdens de bouw expliciet teruggedraaid en gevraagd om verlofopname, -opbouw en -saldo's op basis van de CAO's mee te nemen — inclusief bijzondere verlofsoorten, ADV (2 uur/week Metaal & Techniek), bouwvak (4 weken) en kerstsluiting (2 weken), de juridische kaders en een toelichting voor werknemers over wanneer verlof opgenomen moet worden of vervalt. Aanvullend is gevraagd om bij het aanmaken van een gebruiker de HRM-module als onboarding te vullen met de juiste CAO, verlofuren en aanvang dienstverband, met controlemechanismen. Deze verloffunctionaliteit is daarom bewust wél gebouwd; uitsluitend salarisadministratie blijft uitgesloten.

## Module 1 — HRM / Personeel (Fase 1-basis gebouwd)

MVP-basis voor personeelsbeheer, bewust los van salarisadministratie. Verlof (opname, opbouw, saldo's en CAO-kaders) is op expliciet verzoek van de gebruiker wél meegenomen — zie de uitbreidingsnotitie hierboven.

**Gebouwd (Fase 1-basis):**
- Datamodel `lib/db/src/schema/hrm.ts`: medewerkers, functiehuis (functies, kantoor vs. veld), opleidingen/certificaten, bekwaamheidsmatrix, verlofsoorten (incl. bijzondere verlofsoorten/CAO-naslag) en — op verzoek — verlofsaldo's (beginsaldo/opbouw/opname/saldo per jaar) en verlofaanvragen.
- Rechten: module-ID `personeel` in `lib/permissies`, gegate via de bevoegdheden-matrix (niet via rol-strings).
- Backend: routes in `artifacts/api-server/src/routes/hrm.ts` (medewerkers, functies, opleidingen, verlofsoorten, verlofsaldo's, verlofaanvragen, HRM-stats, CAO-opties), achter `requireBevoegdheid`. Onboarding bouwt het verlofsaldo server-side pro rata op uit de CAO-norm.
- Web (firevault): pagina `pages/personeel/index.tsx` met statistieken en tabs Medewerkers, Functiehuis, Opleidingen en Verlof, inclusief aanmaakdialogen en een onboarding-dialoog (CAO, verlofuren, aanvang dienstverband met controlemechanismen).
- Mobiel (monteur-app): read-mostly schermen `app/hrm/index.tsx` (dashboard), `app/hrm/opleidingen.tsx` en `app/hrm/kennisbank.tsx`.

**Bewust NIET in Fase 1:** salarisadministratie, beoordeling & ontwikkeling, werving & selectie, planning/inzetbaarheid en AI-coaches — dit hoort bij de geparkeerde V3.0 HRM-module FPS Groep.

## Module 2 — Dossiermodule (Fase 1-basis gebouwd)

MVP-basis voor het samenstellen en vastleggen van dossiers per gebouw/project.

**Gebouwd (Fase 1-basis):**
- Datamodel `lib/db/src/schema/dossiers.ts`: dossiers met status (concept → definitief → gearchiveerd).
- Rechten: module-ID `dossiers` in `lib/permissies`.
- Backend: routes in `artifacts/api-server/src/routes/dossiers.ts`, achter `requireBevoegdheid`.
- Web (firevault): pagina `pages/dossiers/index.tsx` met lijst, aanmaken, definitief maken en archiveren.

**Afbakening t.o.v. V1.5 (Rapportenmodule):** de dossiermodule is een lichte Fase 1-basis; de juridisch sluitende, gepersisteerde en bevroren opleverdossiers met versiebeheer blijven onderdeel van [V1.5](./actief.md).

## Module 3 — Offerte Intelligence (Fase 1-basis gebouwd, ALLEEN voorbereiding)

MVP-basis die offertes **voorbereidt** op basis van uit-spots-regels. Bewust geen AI en geen verzending.

**Gebouwd (Fase 1-basis):**
- Datamodel `lib/db/src/schema/offertes.ts`: offertes en offerte-sjablonen.
- Rechten: module-ID `offertes` in `lib/permissies`.
- Backend: routes in `artifacts/api-server/src/routes/offertes.ts` (offertes, offerte-sjablonen, regels uit spots), achter `requireBevoegdheid`.
- Web (firevault): pagina `pages/offertes/index.tsx` met lijst, aanmaken en het voorbereiden van regels uit de spots van een gebouw.

**Bewust NIET in Fase 1:** AI-calculatie, AI-gegenereerde conceptofferte, automatische verzending naar de opdrachtgever — dit hoort bij de geparkeerde strategische AI-lijn (stap K4). De voorbereiding levert regels aan; een medewerker stelt de offerte op en verstuurt.

## Navigatie & rechten (gedeeld)

- Web: nieuwe sidebargroep "Organisatie" in `beheerder-layout.tsx` met items Personeel, Dossiers en Offertes, gegate op de bevoegdheden-matrix (`heeftNiveau`) en voorzien van een "In uitvoering"-badge.
- i18n: nav-sleutels in alle ondersteunde talen.
- Mobiel: ingang "Personeel" in de header van het gebouwenoverzicht naar het HRM-dashboard.
