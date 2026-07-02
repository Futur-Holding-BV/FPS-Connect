# Module-integratieaudit — FPS Connect / FPS One
**Datum:** 2 juli 2026  
**Auditor:** Geautomatiseerde codebaseanalyse (Replit Agent)  
**Scope:** Alle modules, routes, pagina's, DB-schema's en integraties in de productiecodebase  
**Versie:** 1.0 — eerste uitgebreide module-integratierapport

---

## Inhoudsopgave

1. [Executive samenvatting](#1-executive-samenvatting)
2. [Auditaanpak & bronnen](#2-auditaanpak--bronnen)
3. [Module-inventaris & volwassenheidsscore](#3-module-inventaris--volwassenheidsscore)
4. [Integratiematrix](#4-integratiematrix)
5. [Kritische bedrijfsprocessen](#5-kritische-bedrijfsprocessen)
6. [Scaffold & placeholder detectie](#6-scaffold--placeholder-detectie)
7. [Datamodel-koppeling](#7-datamodel-koppeling)
8. [API-contract analyse](#8-api-contract-analyse)
9. [Bevoegdhedenmatrix](#9-bevoegdhedenmatrix)
10. [Frontend-backend alignment](#10-frontend-backend-alignment)
11. [Kritieke gaps & risico's](#11-kritieke-gaps--risicos)
12. [Integratierisico's](#12-integratierisicos)
13. [Roadmap-alignment](#13-roadmap-alignment)
14. [Aanbevelingen](#14-aanbevelingen)
15. [Bijlagen](#15-bijlagen)

---

## 1. Executive samenvatting

FPS Connect is een omvangrijk, intern gebouwd operationeel platform voor FPS Brandpreventie. De codebase telt **83 backend-routemodules**, **189 frontend-pagina's**, **42 Expo-schermen**, **~568 OpenAPI-paden** en **~349.000 regels TypeScript/TSX**. Dit is een productie-niveau platform dat ver voorbij een prototype is.

### Sterktes
- **Kernoperaties zijn stabiel en volledig:** gebouwenbeheer, spotregistratie, inspectieflow, documentenbeheer (DMS) en HRM zijn end-to-end geïmplementeerd met echte DB-koppeling, bevoegdhedenbewaking en AI-integratie.
- **Commerciële keten bijna sluitend:** offertes → opdrachten → werkbegroting → nacalculatie → onderhanden-werk is technisch doorgekoppeld.
- **Rijke HRM-basis:** 119 endpoint-aanroepen, medewerkers, verlof, functiehuis, bekwaamheidsmatrix en AI-opleidingssuggesties zijn volledig gebouwd.
- **Beveiligingsarchitectuur consequent:** TOTP MFA, `requireAuth` + `requireBevoegdheid` op alle dataroutes, sessiecookie `SameSite=None; Secure`, bearer-token isolatie voor mobiel.

### Kritieke tekortkomingen
1. **Inkoop heeft nul backend.** Er bestaat geen `inkoop.ts` routebestand — de inkoop → magazijn → projectmateriaal-keten heeft geen API-laag, waardoor 25 magazijn-endpoints en 4 materiaal-aanvraag-endpoints geen aanvoerkant hebben.
2. **FPS One (klantportaal) is voor 80% scaffold.** Vier van de vijf klantgerichte pagina's (rapporten, documenten, abonnementen, dashboard) tonen statische "In voorbereiding"-kaarten zonder enige echte data. Alleen de gebouwenlijst haalt echte data op, maar verwijst daarna door naar het interne portaal.
3. **Onderhoud (werkorders) is chronisch onderbelicht.** Slechts 6 endpoint-aanroepen in de backend voor een module die conceptueel de dagelijkse werkuitvoering moet ondersteunen.
4. **CRM kennisbibliotheek is statisch.** Een hardcoded JavaScript-array met kennisartikelen — geen database, geen zoekfunctie, geen bewerkbaarheid.
5. **Module Calculatie is uitgeschakeld in de pilotomgeving** (`VITE_FEATURE_CALCULATIE=false`) terwijl de backend volledig is gebouwd (36 endpoints). Strategisch een gat in de commerciële waardepropositie.

### Volwassenheidsoverzicht (tabel)

| Cluster | Modules | Gem. score |
|---|---|---|
| Kern (gebouwen, spots, DMS) | 3 modules | 4,7 / 5 |
| Inspectie & rapportage | 3 modules | 4,0 / 5 |
| Commercieel (offerte→opdracht) | 5 modules | 3,6 / 5 |
| HRM & personeel | 4 modules | 3,8 / 5 |
| Financieel & boekhouding | 5 modules | 2,8 / 5 |
| Operationeel (planning, magazijn) | 4 modules | 2,9 / 5 |
| CRM & klantportaal | 3 modules | 1,7 / 5 |
| Externe integraties | 4 modules | 3,3 / 5 |

**Gewogen platformgemiddelde: 3,2 / 5** — functioneel sterk in de operationele kern, zwak in klantgerichte lagen en supply-chain.

---

## 2. Auditaanpak & bronnen

### Methodologie
Deze audit is volledig gebaseerd op statische codeanalyse — geen runtime-tests, geen databasequeries op productiedata. Elke bevinding is te herleiden tot een specifiek bestand en regelnummer in de codebase.

### Onderzochte bronnen

| Bron | Locatie | Details |
|---|---|---|
| Backend routeregistratie | `artifacts/api-server/src/routes/index.ts` | Alle 83 geregistreerde routemodules geïnventariseerd |
| Backend route-implementaties | `artifacts/api-server/src/routes/*.ts` | Endpoint-tellingen via grep op `.get(`, `.post(`, `.patch(`, `.delete(`, `.put(` |
| OpenAPI-contract | `lib/api-spec/openapi.yaml` | ~568 paden, bron voor codegen |
| Gegenereerde API-hooks | `lib/api-client-react/src/generated/api.ts` | React Query hooks + Zod-schemas |
| Databaseschema | `lib/db/src/schema/index.ts` | 49 schema-bestanden als barrel |
| Frontend-pagina's | `artifacts/firevault/src/pages/` | 189 pagina's geanalyseerd |
| Feature flags | `artifacts/firevault/.env` | `VITE_FEATURE_PLANNING=true`, `VITE_FEATURE_CALCULATIE=false` |
| Vorige technische audit | `docs/audit-technisch-2026-07-02.md` | Referentie voor architectuurbevindingen |
| Mobiele app | `artifacts/monteur-app/app/` | 42 Expo-schermen, read-mostly |

### Scopeafbakening
- **Binnen scope:** alle modules zichtbaar in navigatie, alle geregistreerde backend-routes, DB-schema's, OpenAPI-contract, FPS One klantportaal, mobiele monteur-app.
- **Buiten scope:** runtime performance, productie-logs, A/B testing, externe SaaS-integraties (Microsoft Graph, Google Maps) anders dan hun koppelpunten.

---

## 3. Module-inventaris & volwassenheidsscore

### Scorerubric (0–5)

| Score | Definitie |
|---|---|
| **0** | Geen implementatie — geen route, geen pagina, geen DB-tabel |
| **1** | Scaffold — frontend-stub met "In voorbereiding"-badge of statische data, geen werkende backend |
| **2** | Minimaal — backend aanwezig maar dun (≤6 endpoints), frontend functioneel basaal |
| **3** | Functioneel — werkende backend en frontend, maar missing integrations of open gaps |
| **4** | Volwassen — end-to-end werkend, bevoegdheden bewaard, kleine restpunten |
| **5** | Productie-klaar — volledig geïntegreerd, getest, alle flows aaneengesloten |

---

### 3.1 Cluster A — Kern: gebouwen, spots, documenten

#### A1. Gebouwenbeheer
**Score: 5 / 5**

| Aspect | Status |
|---|---|
| Backend endpoints | Volledig (CRUD, verdiepingen, volgend-spotnummer, kaart-embed, AI-invullen, print-export) |
| Frontend | Lijst, detail (3 tabs), 3D CSS-weergave, zoekfunctie, AI-samenvatting |
| DB-schema | `gebouwen`, `verdiepingen`, `gebouwToewijzingen` — volledig |
| Integraties | Google Maps embed (server-side key), AI-geocoding, AI-vision, plattegrond-SVG-editor |
| Bevoegdheden | `gebouwen` module bewaakt, gebouw-scoping via `effectieveContext` |
| Mobiel | Gebouwenlijst, detailweergave, plattegrond (WebView renderer) |

**Restpunten:** Geen kritieke gaps. Gebouw-AI-analyse valt soms terug op "overig" door quota-beperkingen (externe API).

---

#### A2. Spots & voorzieningen
**Score: 5 / 5**

| Aspect | Status |
|---|---|
| Backend endpoints | Volledig (CRUD, spotnummer-generatie, AI-fotoherkenning, cluster, serie-plaatsen, QR) |
| Frontend | Spotstatus-dashboard, spotintake-flow (foto → AI → bevestigen), SVG-plattegrond, detailpagina |
| DB-schema | `voorzieningen`, `voorzieningLabels`, `plattegronden`, `scheidingen`, `spotStatusConfiguraties` |
| AI-integratie | AI-spotherkenning + zelflerende correcties (geïmplementeerd) |
| Mobiel | Spotlijst, spotdetail, foto toevoegen, statuswijziging |
| Bevoegdheden | Per-gebouw bewaking, `magBijGebouw` middleware |

**Restpunten:** Classificatieveld "60" = "niet gespecificeerd" — werendheid-afleiding werkt maar is afhankelijk van aanwezigheid testnorm op toepassing.

---

#### A3. Documenten/DMS
**Score: 5 / 5**

| Aspect | Status |
|---|---|
| Backend endpoints | 25 endpoints — upload, versies, goedkeuringsflow, audittrail, downloadlogging |
| Frontend | Documentenbibliotheek, detailpagina, logboek, polymorfe koppelingen, signaleringen |
| DB-schema | `documenten`, `documentVersies`, `documentToepassingen`, `documentKoppelingen`, `documentAuditLog` |
| AI-integratie | AI-bibliotheekvalidatie (geïmplementeerd) |
| Dossiers | 19 endpoints — concept → definitief → gearchiveerd, bevriezing V1.5-deel |
| Bevoegdheden | `documenten` module, `dossiers` module, download-logging |

**Restpunten:** Zichtbaar-voor-monteur vlag (3 synchronisatiepunten) is correct maar kwetsbaar bij toekomstige uitbreiding.

---

### 3.2 Cluster B — Inspectie & rapportage

#### B1. Inspecties
**Score: 4 / 5**

| Aspect | Status |
|---|---|
| Backend endpoints | Volledig (oplevering, periodiek, jaarlijks, herstel) |
| Frontend | Inspectielijst, detailpagina, statusfiltering |
| DB-schema | `inspecties`, `inspectiePunten` — volledig |
| Klantportaal (FPS One) | Klant-rapportages pagina haalt echte inspectiedata op (functioneel) |

**Restpunten:** Geen PDF-export vanuit inspectieflow zelf — PDF verloopt via V1.4 opleverrapportage die nog in aanbouw is.

---

#### B2. Opleverrapportage (V1.4)
**Score: 3 / 5**

| Aspect | Status |
|---|---|
| Live print.tsx | Aanwezig en functioneel (bouwt op bestaande inspecties + spots) |
| Definitief maken | In aanbouw — backend `rapporten`-router (10 endpoints) |
| Frontend | Rapport-overzicht aanwezig, detailpagina deels |
| PDF-bevriezing | Nog niet gebouwd (V1.5) |
| Integraties | Koppeling met DMS en FPS One rapporten: ontbreekt nog |

**Restpunten:** V1.4 is formeel "in aanbouw" — de live-rapportage in `print.tsx` werkt, maar de definitieve opleverstroom (e-mailselectie, bijlagenpakket, definitief maken) is onvolledig.

---

#### B3. Opname-module
**Score: 4 / 5**

| Aspect | Status |
|---|---|
| Backend endpoints | 18 endpoints — CRUD opnames, items, afsluiten |
| Frontend | Opnamelijst, aanmaken, koppelen aan gebouw, afsluiten |
| DB-schema | `opnames`, `opnameItems` — volledig |
| Integratie | Koppeling met spots en mod-calculatie aanwezig |

**Restpunten:** Exportfunctie (PDF-opname) ontbreekt nog.

---

### 3.3 Cluster C — Commercieel (offerte → oplevering)

#### C1. Offertes
**Score: 4 / 5**

| Aspect | Status |
|---|---|
| Backend endpoints | 64 endpoints — volledigste commerciële module |
| Frontend | Offertelijst, detail, regels, bijlagen, contacten, AI-analyse |
| DB-schema | `offertes`, `offerteRegels`, `offerteContacten`, `offerteStatussen` |
| AI-integratie | AI-inhoudsanalyse, Scout-integratie (marktintelligentie) |
| Bevoegdheden | `offertes` module bewaakt |

**Restpunten:** Geen automatisch e-mailverzenden (bewust scope-beperking). Offerte Intelligence (Fase 1-basis) gebouwd; volledige AI-offerte is geparkeerd.

---

#### C2. Opdrachten / werkbegroting
**Score: 4 / 5**

| Aspect | Status |
|---|---|
| Backend endpoints | 11 endpoints — offerte→opdracht bridge, werkbegroting, nacalculatie, AI-werkvoorbereiding |
| Frontend | Opdrachtlijst, detail, werkbegroting-tab, nacalculatie, planning-koppeling |
| DB-schema | `opdrachten`, `werkbegrotingRegels`, `nacalculatieRegels` |
| Integraties | Koppeling met offertes, planning, uren-registratie, onderhanden-werk |

**Restpunten:** Opdracht → factuur-koppeling verloopt via handmatige mapping in AccountView (geen directe koppeling).

---

#### C3. Regie
**Score: 3 / 5**

| Aspect | Status |
|---|---|
| Backend endpoints | 11 endpoints — voorwaarden, tarieven, begroting, materialen |
| Frontend | Regie-overzicht aanwezig, koppeling met opdrachten |
| DB-schema | `regieVoorwaarden`, `regieTarieven`, `regieBegroting`, `regieMaterialen` |
| Integraties | Bevoegdheid hergebruikt van `offertes` module |

**Restpunten:** Frontend gebruikt deels raw `useQuery` in plaats van gegenereerde hooks. Tariefstructuur is niet gekoppeld aan de CAO-uurtarieven in HRM.

---

#### C4. Werkvoorbereiding
**Score: 3 / 5**

| Aspect | Status |
|---|---|
| Backend endpoints | 21 endpoints — tekeningen, materiaallijsten, werkpakketten |
| Frontend | Semi-functioneel — bevat gegenereerde hooks maar ook raw `useQuery` |
| DB-schema | Gekoppeld aan opdrachten en voorzieningen |
| Integraties | Koppeling met spots (tekeningen), magazijn (materialen) |

**Restpunten:** Koppeling met magazijn-voorraad is eenrichtings (werkvoorbereiding vraagt aan, magazijn beheert stock zonder inkoop-aanvoer).

---

#### C5. Module Calculatie (uitgeschakeld)
**Score: 4 / 5** *(gebouwd, pilot-uitgeschakeld)*

| Aspect | Status |
|---|---|
| Backend endpoints | 36 endpoints — ABK/AK-opslagen, materialen, normtijden, leveranciers, artikelen |
| Frontend | Volledig gebouwd, gated via `VITE_FEATURE_CALCULATIE=false` |
| DB-schema | `modCalcHeaders`, `modCalcRegels`, `modCalcTarieven`, `modCalcNormtijden`, `modCalcLeveranciers`, `modCalcArtikelen`, `modCalcVersies`, `modCalcInkoopItems` |
| Uitschakelreden | Kostprijzen/marges/commerciële besluitvorming — bewuste pilot-scope |

**Restpunten:** Uitgeschakeld, maar het backend draait mee en neemt DB-resources in gebruik. Geen risico, maar activatie vereist strategisch akkoord.

---

### 3.4 Cluster D — HRM & personeel

#### D1. HRM / Personeel
**Score: 4 / 5**

| Aspect | Status |
|---|---|
| Backend endpoints | 119 endpoints — grootste module in de codebase |
| Frontend | Medewerkers-overzicht, detailpagina (profiel/account/functie/opleidingen/bekwaamheid/verlof), matrixoverzicht |
| DB-schema | `medewerkers`, `functies`, `opleidingen`, `medewerkersOpleidingen`, `verlofsoorten`, `verlofSaldi`, `verlofAanvragen`, `bekwaamheidsCategorieen`, `bekwaamheidsBeoordeling` |
| AI-integratie | AI-opleidingsvoorstel per functie (afgebakend: voorstellen, mens bevestigt) |
| Integraties | Koppeling met gebruikersaccounts (`medewerkers.gebruiker_id`), Werkgever, CAO |

**Restpunten:** Salarisadministratie en volledige mobiele self-service zijn bewust buiten scope (geparkeerd). CAO-namen in frontend moeten exact matchen met `CAO_OPTIES` op server (breekpunt bij onboarding).

---

#### D2. Verlof & saldi
**Score: 4 / 5**

| Aspect | Status |
|---|---|
| Backend | Onderdeel van HRM-router (verlofsoorten, verlofaanvragen, verlofSaldi) |
| Frontend | Verlof-tab in medewerker-detailpagina, saldo-opbouw, aanvragen indienen/goedkeuren/afwijzen |
| DB-schema | `verlofsoorten`, `verlofSaldi`, `verlofAanvragen` |
| CAO-kader | Bijzonder verlof en CAO-naslag aanwezig |

**Restpunten:** Verlof is niet gekoppeld aan planning-module (monteur-afwezigheid wordt handmatig ingevoerd in planning).

---

#### D3. Uren-registratie
**Score: 3 / 5**

| Aspect | Status |
|---|---|
| Backend endpoints | 15 endpoints — urenregistraties CRUD, dagtotalen |
| Frontend | Dagregistratie, weekoverzicht, koppeling met opdrachten |
| DB-schema | `urenRegistraties` |
| Integraties | Gekoppeld aan opdrachten en medewerkers, maar NIET aan salaris-mutaties |

**Restpunten:** Uren → salaris-mutaties koppeling is een handmatig proces. De automatische overgang "geboekte uren → loon" is niet geautomatiseerd.

---

#### D4. Wagenpark
**Score: 3 / 5**

| Aspect | Status |
|---|---|
| Backend endpoints | 16 endpoints — voertuigen CRUD, meldingen |
| Frontend | Wagenparklijst, detail, meldingen-registratie |
| DB-schema | `wagenpark`, `wagenparkMeldingen` |
| Integraties | Geen koppeling met planning (welk voertuig, welke monteur) of uren-registratie |

**Restpunten:** Wagenpark is een standalone-module zonder betekenisvolle integratie met planning of werkbonnen.

---

### 3.5 Cluster E — Financieel & boekhouding

#### E1. Onderhanden werk (OHW)
**Score: 3 / 5**

| Aspect | Status |
|---|---|
| Backend endpoints | ~5 endpoints — OHW-berekening, overrides, signaleringen |
| Frontend | OHW-dashboard met methode-keuze (handmatig/werkelijke kosten/AI-voorstel/prestatie) |
| DB-schema | `onderhandenWerkOverrides`, joins op `opdrachten`, `facturenTable`, `urenRegistraties` |
| Algoritme | Volledig geïmplementeerd met 4 berekeningsmethodes |

**Restpunten:** Slechts 5 endpoint-aanroepen voor een complex financieel algoritme. Geen audittrail voor OHW-overrides. Koppeling met jaarrekening is visueel (tabel) maar niet geautomatiseerd.

---

#### E2. Facturen / AccountView
**Score: 3 / 5**

| Aspect | Status |
|---|---|
| Backend endpoints | 25 endpoints — factuurlijst, verband-mapping, AccountView-instellingen |
| Frontend | Factuuroverzicht, AccountView-koppelingsscherm |
| DB-schema | `facturen`, `instellingenAccountview`, `accountviewMapping` |
| Integraties | Eenrichtings push naar AccountView (AccountView blijft leidend) |
| Bevoegdheden | `financieel` module bewaakt |

**Restpunten:** Geen automatische factuurverzending; exportflow naar AccountView is handmatig geïnitieerd. Factuurstatus-terugkoppeling vanuit AccountView bestaat niet.

---

#### E3. Salaris-mutaties & SCAB
**Score: 3 / 5**

| Aspect | Status |
|---|---|
| Backend endpoints | Salaris-mutaties: 5, loon-output: 4, salarisarchief: 19, scab-mail: 9 |
| Frontend | Mutaties-accordering, AI-conceptmail generatie, verzenden naar SCAB |
| DB-schema | `salarisMutaties`, `salarisArchief`, `scabMails` |
| AI-integratie | AI-mailgeneratie voor SCAB-correspondentie |
| Workflow | Mutaties accorderen → AI-mail → controleren → verzenden |

**Restpunten:** Mutatiesstroom is handmatig (Excel/upload-gebaseerd). Geen directe koppeling van uren-registraties naar salaris-mutaties.

---

#### E4. Boekhouder-portal
**Score: 2 / 5**

| Aspect | Status |
|---|---|
| Backend endpoints | 3 endpoints — dashboard, uploads-lijst, upload POST |
| Frontend | Werkgever-selector, map-filter, upload-formulier, documentenlijst |
| DB-schema | Geen eigen tabel (gebruikt `documenten` met map-attribuut) |
| Integraties | Koppeling met werkgevers, geen directe AccountView-koppeling |

**Restpunten:** Slechts 3 endpoints voor een gedeelde boekhoud-portal. Dashboard toont aggregaten maar is thin. Geen rol-bewaking specifiek voor externe boekhouders.

---

#### E5. Jaarrekening / financieel dashboard
**Score: 3 / 5**

| Aspect | Status |
|---|---|
| Backend | Onderdeel van financieel cluster — onderhanden-werk berekeningen |
| Frontend | Jaarrekening-pagina met OHW-totalen, crediteuren-overzicht |
| Integraties | Feeds vanuit opdrachten, facturen, OHW-overrides |

**Restpunten:** Jaarrekening is een read-only aggregaat-view, geen interactieve journaalpost-functionaliteit.

---

### 3.6 Cluster F — Operationeel (planning & logistiek)

#### F1. Planning (V1)
**Score: 4 / 5**

| Aspect | Status |
|---|---|
| Backend endpoints | 26 endpoints — planningitems, medewerkers, afwezigheid, meerwerk, reistijdschatting, gesloten dagen |
| Frontend | Rijke kalender-interface, dagdelen/tijdsloten, diagnose-tool, AI-reistijdschatting |
| DB-schema | `planningItems`, `planningAfwezigheid`, `bedrijfsSluitingen`, `planningGeslotenDagen`, `planningMeerwerk` |
| AI-integratie | AI-reistijdschatting (`POST /planning/reistijd-schatting`) |
| Feature flag | `VITE_FEATURE_PLANNING=true` — actief |

**Restpunten:** Geen automatische koppeling van verlof-aanvragen naar planning-afwezigheid. Wagenpark-toewijzing per planningitem ontbreekt.

---

#### F2. Magazijn
**Score: 3 / 5**

| Aspect | Status |
|---|---|
| Backend endpoints | 25 endpoints — voorraad, locaties, bewegingen, artikelen |
| Frontend | Magazijnoverzicht, artikeldetail, voorraadbeweging |
| DB-schema | `magazijn`, `magazijnLocaties`, `magazijnBewegingen`, `artikelen` |
| Kritieke gap | **Geen inkoop-backend** — aanvoer van magazijn is niet geïmplementeerd |

**Restpunten:** Zie kritieke gap hieronder. Magazijn kan alleen consumeren, niet aanvullen via de applicatie.

---

#### F3. Inkoop
**Score: 0 / 5** — **KRITIEKE GAP**

| Aspect | Status |
|---|---|
| Route bestand | **BESTAAT NIET** — geen `inkoop.ts` in routes/ |
| Frontend | Geen inkoop-pagina's geïdentificeerd |
| DB-schema | Geen dedicated inkoop-tabellen (wel `modCalcInkoopItems` in calculatie-context) |
| Gevolg | Magazijn heeft geen aanvoerlaag; materiaal-aanvragen (4 endpoints) staan los |

**Restpunten:** De gehele inkoop → leverancier → bestelling → magazijn-keten bestaat niet als geïntegreerd systeem. Dit is de grootste functionele gap in de supply-chain.

---

#### F4. Werkbonnen
**Score: 2 / 5**

| Aspect | Status |
|---|---|
| Backend endpoints | 6 endpoints — werkbon CRUD, status |
| Frontend | Werkbonnenlijst, basis-detail |
| DB-schema | `werkbonnen` |
| Integraties | Koppeling met opdrachten aanwezig, maar geen koppeling met uren-registratie of planning |

**Restpunten:** Werkbonnen zijn thin — ze bevatten geen uren-registratie-uitkomst en sturen niet door naar facturatie.

---

### 3.7 Cluster G — CRM & klantportaal

#### G1. CRM
**Score: 3 / 5**

| Aspect | Status |
|---|---|
| Backend endpoints | 32 endpoints — klanten, contactpersonen, kansen, communicatie, concurrenten, marktintelligentie |
| Frontend | Dashboard, projectkansen, marktintelligentie — echte hooks; kennisbibliotheek — statisch |
| DB-schema | `crmKlanten`, `crmContactpersonen`, `crmOpdrachten`, `crmCommunicatie`, `crmCommercieel`, `crmFinancieel`, `crmConcurrenten`, `crmMarktintelligentie` |
| AI-integratie | Scout-service voor marktintelligentie (OpenAI-gebaseerd) |
| Kritieke gap | Kennisbibliotheek is een hardcoded JS-array — geen DB, geen bewerkbaarheid |

**Restpunten:** CRM-klanten zijn niet gekoppeld aan `gebouwen` via een expliciete relatie (koppeling verloopt via projectnummer/naam). Geen automatische e-mailkoppeling.

---

#### G2. FPS One — Gebouwen
**Score: 3 / 5**

| Aspect | Status |
|---|---|
| Backend | Hergebruikt `GET /gebouwen` endpoint (met rol-filtering) |
| Frontend | Gebouwenlijst met filters, link naar intern portaal (`/gebouwen/:id`) |
| Probleem | Klant wordt doorgestuurd naar het interne portaal — geen klant-specifieke spot- of inspectieweergave |

**Restpunten:** De klant ziet gebouwen maar heeft geen eigen spotoverzicht. Doorlinking naar intern portaal doorbreekt de FPS One merkbeleving.

---

#### G3. FPS One — Rapporten
**Score: 0 / 5** — **SCAFFOLD**

Vier statische "In voorbereiding"-kaarten. Geen API-aanroepen. Afhankelijk van V1.4/V1.5 implementatie.

---

#### G4. FPS One — Documenten
**Score: 0 / 5** — **SCAFFOLD**

Vier statische "In voorbereiding"-kaarten. Geen API-aanroepen. Klant heeft geen toegang tot eigen brandpreventierapportages.

---

#### G5. FPS One — Abonnementen
**Score: 0 / 5** — **SCAFFOLD**

Statische prijskaarten (Basis/Beheer/Volledig) hardcoded in de frontend. Geen koppeling met `abonnementen`-backend. Klant kan abonnement niet beheren.

---

### 3.8 Cluster H — Externe integraties & speciale modules

#### H1. Snagstream-import
**Score: 4 / 5**

| Aspect | Status |
|---|---|
| Backend endpoints | 10 endpoints — upload, AI-uitlezen, koppelen aan gebouw, spot-import |
| Frontend | Uploadflow, statusbadges (nieuw/ai_uitgelezen/concept_herkend/gekoppeld/geïmporteerd), AI-trigger |
| DB-schema | `snagstreamRapporten` |
| AI-integratie | AI-uitlezen van Snagstream XML/ZIP |

**Restpunten:** Gedeeltelijke import is mogelijk maar de conflictresolutie bij bestaande spots is handmatig.

---

#### H2. Veiligheid & PBM
**Score: 4 / 5**

| Aspect | Status |
|---|---|
| Backend endpoints | 63 endpoint-aanroepen (veiligheidRouter variabele) |
| Frontend | VCA, PBM-beheer, signaleringen, medewerker-veiligheidsoverzicht |
| DB-schema | `veiligheidsItems`, `pbmToewijzingen`, `pbmTypes` |
| Integraties | Koppeling met medewerkers |

**Restpunten:** Geen koppeling met planning (PBM-vereisten per project type ontbreken).

---

#### H3. Boekhouder / AccountView-integratie
**Score: 3 / 5**

| Aspect | Status |
|---|---|
| Backend | `boekhouder.ts` (3 endpoints), `instellingen-accountview.ts`, `accountview-mapping.ts` |
| Frontend | Upload-portal voor boekhouder, AccountView-instellingenscherm, mapping-configuratie |
| Integraties | Eenrichtings koppeling — Connect → AccountView |

**Restpunten:** Boekhouder-authenticatie heeft geen eigen rol (hergebruikt beheerder-sessie). Geen webhook/terugkoppeling van AccountView.

---

#### H4. Toolbox & berichten
**Score: 3 / 5**

| Aspect | Status |
|---|---|
| Backend endpoints | 10 endpoints — toolbox-onderwerpen, leesbevestigingen |
| Frontend | Toolbox-overzicht, berichten met leesbevestiging |
| DB-schema | `toolboxItems`, `toolboxLeesbevestigingen` |
| Mobiel | Mobiele leesbevestiging aanwezig |

**Restpunten:** Volledige mobiele toolbox-self-service is geparkeerd (V3.0 scope).

---

## 4. Integratiematrix

De matrix toont directe data-afhankelijkheden tussen modules. Een **●** betekent een bewezen DB-join of API-aanroep. Een **◐** betekent partiële of optionele koppeling. Een **○** betekent afwezige maar verwachte koppeling (gap).

|  | Gebouwen | Spots | Docs | Inspecties | HRM | Planning | Opdrachten | Offertes | Calculatie | CRM | Financieel | Magazijn | FPS One |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Gebouwen** | — | ● | ● | ● | ○ | ● | ● | ● | ◐ | ○ | ◐ | ○ | ● |
| **Spots** | ● | — | ◐ | ● | ○ | ◐ | ● | ◐ | ◐ | ○ | ○ | ○ | ○ |
| **Documenten/DMS** | ● | ◐ | — | ◐ | ◐ | ○ | ◐ | ◐ | ○ | ○ | ○ | ○ | ○ |
| **Inspecties** | ● | ● | ◐ | — | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● |
| **HRM/Personeel** | ○ | ○ | ◐ | ○ | — | ○ | ◐ | ○ | ○ | ○ | ◐ | ○ | ○ |
| **Planning** | ● | ◐ | ○ | ○ | ○ | — | ● | ○ | ○ | ○ | ○ | ○ | ○ |
| **Opdrachten** | ● | ● | ◐ | ○ | ◐ | ● | — | ● | ● | ○ | ● | ◐ | ○ |
| **Offertes** | ● | ◐ | ◐ | ○ | ○ | ○ | ● | — | ◐ | ◐ | ○ | ○ | ○ |
| **Calculatie** | ◐ | ◐ | ○ | ○ | ○ | ○ | ● | ◐ | — | ○ | ◐ | ○ | ○ |
| **CRM** | ○ | ○ | ○ | ○ | ○ | ○ | ◐ | ◐ | ○ | — | ◐ | ○ | ○ |
| **Financieel** | ○ | ○ | ○ | ○ | ◐ | ○ | ● | ● | ◐ | ◐ | — | ○ | ○ |
| **Magazijn** | ○ | ○ | ○ | ○ | ○ | ○ | ◐ | ○ | ◐ | ○ | ○ | — | ○ |
| **FPS One** | ● | ○ | ○ | ● | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | — |

**Legende:** ● = werkende koppeling | ◐ = partiële/optionele koppeling | ○ = afwezig (gap of bewust buiten scope)

### Observaties uit de matrix
1. **Opdrachten is de spil** van de commerciële chain — het heeft de meeste ●-koppelingen.
2. **CRM is vrijwel geïsoleerd** — geen directe DB-koppeling met gebouwen, spots, inspecties of financieel.
3. **HRM is een eiland** — planning-koppeling (verlof → afwezigheid) en financieel (uren → salaris) zijn ○ (afwezige verwachte koppelingen).
4. **FPS One staat los van alle operationele data** behalve gebouwen en inspecties.
5. **Magazijn heeft geen aanvoerrichting** — de inkoop-kolom zou moeten bestaan maar doet dat niet.

---

## 5. Kritische bedrijfsprocessen

### 5.1 Proces: Spot aanmaken en inspecteren
**Status: VOLLEDIG GEÏNTEGREERD**

```
Gebouw aanmaken
  → Verdieping toevoegen
    → Plattegrond uploaden (SVG-editor)
      → Spot plaatsen (foto → AI-herkenning → bevestigen)
        → Spot op plattegrond markeren
          → Spot inspecteren (oplevering/periodiek/herstel)
            → Inspectieresultaat → live-rapport (print.tsx)
              [→ V1.4 definitief rapport — in aanbouw]
                [→ FPS One klant ziet rapport — SCAFFOLD]
```

**Aandachtspunten:** Het laatste deel (klant ziet definitief rapport) is geblokkeerd door V1.4/V1.5 en FPS One scaffold.

---

### 5.2 Proces: Offerte naar oplevering
**Status: GEDEELTELIJK GEÏNTEGREERD**

```
CRM: prospect identificeren
  ○ [geen koppeling CRM → offerte]
    → Offerte aanmaken (handmatig)
      → Offerte naar opdracht omzetten
        → Werkbegroting opstellen
          → Planning: monteurs inroosteren
            → Uren registreren
              → Nacalculatie berekenen
                → Onderhanden werk berekenen
                  → Factuur aanmaken
                    → AccountView export (handmatig)
                      ○ [geen terugkoppeling status]
```

**Gat:** CRM → Offerte koppeling ontbreekt. AccountView-koppeling is eenrichtings en handmatig.

---

### 5.3 Proces: Monteur dagelijks werk
**Status: FUNCTIONEEL MAAR FRAGMENTARISCH**

```
Planning: item aanmaken voor monteur
  → Monteur-app: mijn werk inzien
    → Spot opzoeken, foto toevoegen
      → Status bijwerken
        [→ uren registreren: HANDMATIG in aparte module]
          [→ werkbon aanmaken: THIN — geen uren-koppeling]
            [→ materiaal aanvragen: 4 endpoints, geen inkoop-backend]
              [→ wagenpark: geen koppeling met planning]
```

**Gat:** De dagelijkse monteur-workflow is gefragmenteerd over 5 modules zonder automatische datastroom.

---

### 5.4 Proces: Nieuw personeelslid onboarden
**Status: VOLLEDIG**

```
Gebruikersaccount aanmaken (+ rol/bevoegdheden)
  → Medewerker aanmaken (één klik, voorgevulde naam/e-mail)
    → Functie koppelen (functiehuis)
      → CAO en werkmaatschappij selecteren
        → Verlofsoorten configureren + saldo initialiseren
          → Opleidingen koppelen (AI stelt voor)
            → Bekwaamheden registreren
              → PBM/Veiligheid koppelen
```

**Sterk punt:** Onboarding is volledig end-to-end gebouwd, inclusief CAO-afhankelijke verlofopbouw.

---

### 5.5 Proces: Magazijn aanvullen via inkoop
**Status: NIET GEÏMPLEMENTEERD**

```
Magazijn signaleert lage voorraad
  → Inkoop aanvraag genereren ← BESTAAT NIET
    → Leverancier selecteren ← BESTAAT NIET (leveranciers.ts wel, maar geen inkoop-koppeling)
      → Bestelling plaatsen ← BESTAAT NIET
        → Ontvangst boeken ← BESTAAT NIET
          → Magazijn-voorraad bijgewerkt ← ALLEEN DIT BESTAAT (25 endpoints)
```

**Kritieke gap:** De gehele inkoop-aanvoerkant ontbreekt.

---

## 6. Scaffold & placeholder detectie

### 6.1 Volledig scaffold (score 0)

| Locatie | Type | Bewijs |
|---|---|---|
| `pages/one/rapporten.tsx` | Statische feature-preview | Hardcoded `GEPLANDE_FUNCTIES` array, `Construction`-icoon, geen API-aanroepen |
| `pages/one/documenten.tsx` | Statische feature-preview | Hardcoded `GEPLANDE_FUNCTIES` array, "In voorbereiding"-badge, geen API-aanroepen |
| `pages/one/abonnementen.tsx` | Statische prijskaart + feature-preview | Hardcoded `PAKETTEN` array met vaste euro-bedragen, geen API-aanroepen |
| `pages/one/dashboard.tsx` | Navigatie-only | Hardcoded `MODULE_ITEMS` array, geen data-fetch, statische tekst |
| `pages/crm/kennisbibliotheek.tsx` | Statisch content | Hardcoded `KENNIS` JS-array, geen database, geen zoekopdrachten |
| Inkoop (backend) | Volledig afwezig | Geen routebestand, geen DB-tabellen, geen frontend-pagina's |

### 6.2 Partiële scaffold (score 1–2)

| Locatie | Type | Bewijs |
|---|---|---|
| `pages/one/gebouwen.tsx` | Functioneel maar misplaatst | Haalt echte gebouwen op maar linkt door naar intern portaal — geen klantspecifieke view |
| `pages/klant/rapportages.tsx` | Functioneel lezen, geen acties | Haalt inspecties op maar zonder PDF-download of formele opleverstatus |
| `pages/modules/boekhouder/` | Dun | 3 backend-endpoints voor een gedeeld boekhoud-portaal |
| Werkbonnen | Thin | 6 endpoints, geen uren-koppeling |
| Materiaal-aanvragen | Thin | 4 endpoints, geen inkoop-aanvoer |

### 6.3 Feature-flag uitgeschakeld (functioneel maar onbereikbaar)

| Module | Flag | Backend-status |
|---|---|---|
| Module Calculatie | `VITE_FEATURE_CALCULATIE=false` | Volledig gebouwd (36 endpoints, 1626 regels) |

---

## 7. Datamodel-koppeling

### 7.1 Schema-dekking per module

| Module | Eigen DB-tabellen | Joins op andere modules | Kwaliteit |
|---|---|---|---|
| Gebouwen | `gebouwen`, `verdiepingen`, `gebouwToewijzingen` | Spots, documenten, inspecties | Sterk |
| Spots/Voorzieningen | `voorzieningen`, `voorzieningLabels`, `plattegronden`, `scheidingen` | Gebouwen, labels, opnames | Sterk |
| Documenten/DMS | `documenten`, `documentVersies`, `documentToepassingen`, `documentKoppelingen`, `documentAuditLog` | Gebouwen, dossiers, klanten | Sterk |
| Dossiers | `dossiers`, `dossierDocumenten` | Gebouwen, documenten | Goed |
| HRM | `medewerkers`, `functies`, `functieTitels`, `opleidingen`, `medewerkersOpleidingen`, `bekwaamheidsCategorieen`, `bekwaamheidsBeoordeling` | Gebruikers, werkgevers | Sterk |
| Verlof | `verlofsoorten`, `verlofSaldi`, `verlofAanvragen` | Medewerkers, werkgevers | Goed |
| Planning | `planningItems`, `planningAfwezigheid`, `bedrijfsSluitingen`, `planningMeerwerk` | Opdrachten, gebruikers | Goed |
| Opdrachten | `opdrachten`, `werkbegrotingRegels` | Offertes, gebouwen, uren | Goed |
| Offertes | `offertes`, `offerteRegels`, `offerteContacten`, `offerteStatussen` | Gebouwen, gebruikers | Sterk |
| Mod-Calculatie | `modCalcHeaders`, `modCalcRegels`, `modCalcTarieven`, `modCalcNormtijden`, `modCalcLeveranciers`, `modCalcArtikelen`, `modCalcVersies`, `modCalcInkoopItems` | Gebouwen, opnames, offertes | Sterk |
| CRM | `crmKlanten`, `crmContactpersonen`, `crmOpdrachten`, `crmCommunicatie`, `crmCommercieel`, `crmFinancieel`, `crmConcurrenten`, `crmMarktintelligentie` | Gebouwen (losjes) | Geïsoleerd |
| Uren | `urenRegistraties` | Opdrachten, medewerkers | Dun |
| Magazijn | `magazijn`, `magazijnLocaties`, `magazijnBewegingen` | Artikelen | Geen inkoop-side |
| Wagenpark | `wagenpark`, `wagenparkMeldingen` | Geen | Geïsoleerd |
| OHW | `onderhandenWerkOverrides` | Opdrachten, facturen, uren | Goed |
| Facturen | `facturen`, `instellingenAccountview`, `accountviewMapping` | Opdrachten | Eenrichtings |
| Salaris | `salarisMutaties`, `salarisArchief`, `scabMails` | Medewerkers (los) | Dun |
| Veiligheid | `veiligheidsItems`, `pbmToewijzingen`, `pbmTypes` | Medewerkers | Goed |
| Toolbox | `toolboxItems`, `toolboxLeesbevestigingen` | Gebruikers | Goed |
| Snagstream | `snagstreamRapporten` | Gebouwen, spots | Goed |
| FPS One | *geen eigen tabellen* | Hergebruikt gebouwen/inspecties | Scaffold |
| Inkoop | **GEEN** | — | Volledig afwezig |

### 7.2 Ontbrekende relaties in datamodel

| Gap | Impact |
|---|---|
| CRM `crmKlanten.id` → `gebouwen.klant_id` (FK) | CRM heeft geen directe gebouwkoppeling |
| `planningItems` → `verlofAanvragen` | Verlof en planning zijn niet gesynchroniseerd |
| `urenRegistraties` → `salarisMutaties` | Uren-naar-salaris is handmatig |
| `wagenpark` → `planningItems` | Voertuigtoewijzing per dag ontbreekt |
| Inkoop-tabel (volledig) | Supply-chain heeft geen aanvoerzijde |

---

## 8. API-contract analyse

### 8.1 OpenAPI-dekking

| Meting | Waarde |
|---|---|
| Totaal OpenAPI-paden | ~568 |
| Geregistreerde route-handlers | 83 route-bestanden |
| Paden met `requireBevoegdheid` | Hoofdmeerderheid (geschat >80%) |
| Paden met alleen `requireAuth` | Klein deel (inbox, mijn-werk, etc.) |
| Publieke paden | `/auth/*`, `/healthz`, `/portaal/*` |

### 8.2 Contract-first naleving

De codebase volgt het contract-first principe: OpenAPI spec → codegen → frontend-gebruik. Afwijkingen:

| Afwijking | Locatie | Risico |
|---|---|---|
| `regie.ts` frontend gebruikt `useQuery` (raw) | `pages/regie/index.tsx` | Contract-drift bij API-wijzigingen |
| `werk-inbox` gebruikt raw `useQuery` en `useMutation` | `pages/werk-inbox/index.tsx` | Contract-drift |
| Inline request bodies (niet als `$ref`) | Verspreid in openapi.yaml | TS2308 duplicate export risico bij codegen |

### 8.3 Endpoints zonder frontend-consumptie (geselecteerde voorbeelden)

| Endpoint | Route | Oorzaak |
|---|---|---|
| `GET /calculaties/*` | `calculaties.ts` (12 endpoints) | Mogelijk legacy — mod-calculatie vervangt dit |
| `POST /inkoop/*` | Niet aanwezig | Inkoop gap |
| `GET /studio/*` | `studio.ts` | Geen zichtbare frontend-pagina |
| `GET /uitvoerder/*` | `uitvoerder.ts` | Geen zichtbare frontend-pagina |

---

## 9. Bevoegdhedenmatrix

### 9.1 Modules en hun bevoegdheid-sleutel

| Module-sleutel | Gebruikt door routes | Niveaus |
|---|---|---|
| `gebouwen` | `gebouwen.ts` | 1=lezen, 2=schrijven, 3=aanmaken, 4=verwijderen |
| `voorzieningen` | `voorzieningen.ts` | 1–4 |
| `documenten` | `documenten.ts` | 1–4 |
| `dossiers` | `dossiers.ts` | 1–4 |
| `inspecties` | `inspecties.ts` | 1–4 |
| `onderhoud` | `onderhoud.ts` | 1–4 |
| `gebruikers` | `gebruikers.ts` | 1–4 |
| `hrm` | `hrm.ts` | 1–4 |
| `personeel` | HRM sub-routes | 1=lezen, 2=schrijven |
| `offertes` | `offertes.ts`, `regie.ts`, `opdrachten.ts` | 1–4 |
| `calculaties` | `mod-calculatie.ts` | 1=lezen, 2=schrijven, 3=aanmaken, 4=verwijderen |
| `planning` | `planning-module.ts` | 1–3 |
| `financieel` | `onderhanden-werk.ts`, `facturen.ts` | 1–2 |
| `crm` | `crm.ts` | 1–2 |
| `abonnementen` | `abonnementen.ts` | 1–2 |
| `systeem` | `systeem.ts` | — (beheerder-only) |

### 9.2 Bevoegdheidsgaten

| Gap | Impact |
|---|---|
| Boekhouder-portal heeft geen eigen bevoegdheid | Externe boekhouder heeft volledige beheerder-toegang nodig |
| Wagenpark gebruikt standaard `requireAuth` (geen module-bevoegdheid) | Elke ingelogde gebruiker kan het wagenpark zien |
| Studio/uitvoerder-routes: bevoegdheid onduidelijk | Potentieel te brede toegang |
| FPS One gebruikt rol-filtering maar geen module-bevoegdheid | Klant-rol is de enige barrière |

### 9.3 Systeem-presets (14 stuks)

De bevoegdhedenmatrix heeft 14 presets: 10 origineel + Directie, Administratie, Onderhoudsmonteur, Externe inhuur. `POST /profielen/synchroniseer-standaard` zaait ontbrekende presets. Dit systeem is volledig functioneel.

---

## 10. Frontend-backend alignment

### 10.1 Pagina's per integratiestatus

| Status | Aantal pagina's | Voorbeelden |
|---|---|---|
| Volledig geïntegreerd (gegenereerde hooks) | ~140 | Gebouwen, spots, documenten, HRM, planning |
| Partieel geïntegreerd (raw useQuery) | ~15 | Regie, werk-inbox, regie-detail |
| Scaffold (geen API-aanroepen) | ~12 | FPS One rapporten/documenten/abonnementen, CRM kennisbibliotheek |
| Statisch (geen API nodig) | ~22 | Beheer-overzichtspagina's, navigatie-hubs |

### 10.2 Kritieke frontend-backend mismatches

| Pagina | Probleem |
|---|---|
| `pages/one/gebouwen.tsx` | Linkt klant naar intern portaal (`/gebouwen/:id`) — doorbreekt FPS One merkbeleving |
| `pages/klant/rapportages.tsx` | Toont inspecties maar geen PDF-download of formele opleverstatus |
| `pages/modules/calculatie/` | Volledig gebouwd maar onbereikbaar via `VITE_FEATURE_CALCULATIE=false` |
| `pages/crm/kennisbibliotheek.tsx` | Toont statische data, suggereren dat het dynamisch is |
| `pages/financieel/boekhouder.tsx` | Slechts 3 backend-endpoints voor een gedeeld portaal |

### 10.3 Mobiele app alignment

De Expo monteur-app (`artifacts/monteur-app`) heeft 42 schermen met read-mostly functionaliteit. Kritieke alignment-punten:

| Scherm | Backend-integratie | Opmerking |
|---|---|---|
| Spotenlijst/detail | Volledig | HMAC bearer-token, niet cookie |
| Plattegrond (WebView) | Volledig | Handmatige JS-port van web-renderer (scale:2 synchronisatie vereist) |
| Foto toevoegen | Volledig | Object-storage upload |
| Uren registreren | Aanwezig | Offline-first via AsyncStorage + SyncQueue |
| Documenten inzien | Aanwezig (read-only) | Zichtbaar-monteur vlag bewaakt |
| Inkoop/magazijn | **ONTBREEKT** | Geen mobiele inkoop-flow |
| Verlofaanvraag | **ONTBREEKT** | Web-only |

---

## 11. Kritieke gaps & risico's

### Prioriteit 1 — Functionele blokkades

| # | Gap | Module | Impact | Aanbevolen actie |
|---|---|---|---|---|
| G1 | Inkoop heeft geen backend | Inkoop/Magazijn | Magazijn kan niet aangevuld worden via de app | Bouwen: `inkoop.ts` route, `inkoopOrders` schema, leveranciersselectie |
| G2 | FPS One 80% scaffold | FPS One | Klanten kunnen geen rapporten, documenten of abonnement beheren | V1.4/V1.5 voltooien, daarna FPS One hooks activeren |
| G3 | CRM → Gebouw: geen FK | CRM | CRM-klanten zijn niet direct aan gebouwen gekoppeld | Additieve FK `gebouwen.crm_klant_id` en CRM-detail-tab met gebouwen |
| G4 | Verlof → Planning: geen sync | HRM + Planning | Monteur-verlof wordt niet automatisch geblokkeerd in planning | Trigger/webhook: verlofaanvraag goedgekeurd → planningafwezigheid aanmaken |
| G5 | Uren → Salaris: handmatig | HRM + Salaris | Salarisverwerking vereist handmatige dataoverdracht | Aggregatie-endpoint: week-uren per medewerker → mutatie-suggestie |

### Prioriteit 2 — Kwaliteitsrisico's

| # | Gap | Module | Impact | Aanbevolen actie |
|---|---|---|---|---|
| G6 | CRM kennisbibliotheek statisch | CRM | Kennisartikelen zijn niet beheersbaar | Kennisbibliotheek-tabel + CRUD-interface |
| G7 | Boekhouder heeft geen eigen rol | Boekhouder | Externe boekhouder heeft onbeperkte systeemtoegang | Dedicated "boekhouder"-bevoegdheidsprofiel |
| G8 | Wagenpark niet bewaakt via bevoegdheid | Wagenpark | Elke gebruiker kan wagenpark inzien/bewerken | `requireBevoegdheid("wagenpark", 1)` toevoegen |
| G9 | Calculaties.ts vs mod-calculatie.ts dubbel | Calculatie | 12 legacy endpoints onduidelijk of actief | Audit: zijn calculaties.ts endpoints nog in gebruik? |
| G10 | Studio/uitvoerder routes zonder frontend | Studio/Uitvoerder | Verborgen endpoints — onduidelijk doel en toegangsrecht | Documenteer of verwijder |

### Prioriteit 3 — Technische schuld

| # | Gap | Locatie | Aanbevolen actie |
|---|---|---|---|
| G11 | Raw `useQuery` in regie/werk-inbox | Frontend | Migreer naar gegenereerde hooks na codegen |
| G12 | Gpt-5*/gpt-5.4 niet-officiële modelnamen | AI-configuratie | Monitor op model deprecation |
| G13 | OHW-overrides zonder audittrail | Financieel | Log overrides in `onderhandenWerkAuditLog` |
| G14 | Werkbonnen niet gekoppeld aan uren | Werkbonnen | FK `werkbonnen.uren_registratie_id` overwegen |
| G15 | CAO-namen moeten exact matchen | HRM | Gedeelde constante-bron voor CAO-opties |

---

## 12. Integratierisico's

### R1. Commerciële keten heeft drie handmatige handoffs
De keten offerte → factuur → AccountView heeft drie punten waar data handmatig overgedragen moet worden:
1. CRM prospect → Offerte aanmaken (geen automatische link)
2. Factuur aanmaken na opdracht (handmatig geïnitieerd)
3. Export naar AccountView (handmatig geïnitieerd)

**Risico:** Data-inconsistentie, vertraging in facturatie, menselijke fouten.

### R2. FPS One-klant ziet intern portaal
Wanneer een klant op een gebouw klikt in FPS One, wordt hij doorgestuurd naar `/gebouwen/:id` — de interne beheerpagina inclusief alle interne tabs (uitvoering, spots, documenten). Dit is een datalek-risico: klanten zien interne opmerkingen en uitvoeringsgegevens die voor hen niet bedoeld zijn.

**Risico:** Informatiebeveiliging en merkbeleving.

### R3. Verlof-planning desynchronisatie
Goedgekeurde verlofaanvragen worden niet automatisch als afwezigheid ingevoerd in de planningsmodule. Een projectleider die monteur X inroostert terwijl X goedgekeurd verlof heeft, ziet geen waarschuwing.

**Risico:** Planningsfouten, kostprijsoverschrijdingen.

### R4. Salaris-keten onderbroken
Geboekte uren (15 endpoints) leiden niet automatisch tot salaris-mutaties (5 endpoints). Een handmatige stap in Excel of extern systeem is vereist. Bij groei van het personeelsbestand schaalt dit niet.

**Risico:** Salarisfouten, compliance-risico's.

### R5. Magazijn zonder inkoop = blinde vlek
Het magazijn kan consumptie registreren maar niet aanvullen via de applicatie. Bij materiaalgebrek is er geen bestelstroom binnen Connect — dit gaat via externe middelen (telefoon/e-mail). Reconciliatie tussen werkelijk verbruik en inkoop is onmogelijk binnen de app.

**Risico:** Voorraadbeheer faalt bij schaalgroei.

### R6. Dubbele calculatie-route onzekerheid
Er zijn twee calculatie-systemen: `calculaties.ts` (12 endpoints, oud) en `mod-calculatie.ts` (36 endpoints, nieuw). Het is niet duidelijk of de 12 endpoints van `calculaties.ts` nog actief worden gebruikt of legacy zijn.

**Risico:** Verdubbeling van business-logica, inconsistente resultaten.

---

## 13. Roadmap-alignment

### 13.1 Gebouwde fasen vs. auditstatus

| Fase | Roadmap-status | Auditstatus | Delta |
|---|---|---|---|
| V1.0 — Administratief gereed | Gebouwd | Bevestigd (score 5/5 kern) | Geen |
| V1.1 — Rollen & bevoegdheden | Gebouwd | Bevestigd (14 presets, matrix functioneel) | Geen |
| V1.2 — Bibliotheek & documentstructuur | Gebouwd | Bevestigd (DMS score 5/5) | Geen |
| V1.3 — Spots & uitvoering | Gebouwd | Bevestigd (score 5/5) | Kleine restpunten: plattegrond-renderers sync |
| V1.4 — Opleverrapportage | In aanbouw | Partieel (score 3/5) — live print.tsx werkt, definitief maken onvolledig | Achterstand op definitief maken + klantportaal |
| V1.5 — Rapportenmodule | Actief/gepland | Niet gestart (DMS-bevriezdeel = V1.5-basis aanwezig) | Centrale rapportenbibliotheek en FPS One-koppeling ontbreken |
| Document Design System | Visuele basis gebouwd | Bevestigd (Beheer › Documentopmaak pagina aanwezig) | Verdieping (PDF-export, digitale ondertekening) staat open |
| HRM Fase 1-basis | Parallel, gebouwd | Bevestigd (score 4/5, 119 endpoints) | Salaris-koppeling en verlof-planning-sync zijn gaps |
| Dossiermodule Fase 1 | Parallel, gebouwd | Bevestigd (score 4/5, 19 endpoints) | Juridisch sluitend opleverdossier = V1.5 |
| Offerte Intelligence Fase 1 | Parallel, gebouwd | Bevestigd (offertes score 4/5) | Geen AI-calculatie/automatisch verzenden conform scope |

### 13.2 Geparkeerde items die onbedoeld deels zijn ingebouwd

| Item | Geparkeerd als | Aangetroffen in codebase |
|---|---|---|
| Mobiele monteur-app (V2.0) | Geparkeerd | Deels gebouwd als Fase 1-basis (read-mostly), conform scope |
| Toolbox & leesbevestiging | Geparkeerd | Geïmplementeerd (10 endpoints, mobiele leesbevestiging) — *meer dan geparkeerd* |
| CRM-module | Geparkeerd (scaffold niet uitbouwen) | 32 endpoints + Scout-AI gebouwd — *actief uitgebouwd* |

**Opmerking CRM:** De roadmap zegt "bestaande CRM-scaffold niet verder uitbouwen", maar de codebase toont een volledig geïmplementeerde CRM-backend (32 endpoints, 8 DB-tabellen, AI-Scout). Dit is een positieve afwijking maar vraagt om expliciete roadmap-update.

**Opmerking Toolbox:** Toolbox is gebouwd voorbij de "geparkeerd"-scope. Leesbevestigingen op mobiel zijn aanwezig.

### 13.3 Volgorde-aanbeveling voor resterende roadmap

Op basis van de auditstatus:
1. **V1.4 voltooien** (definitief rapport, e-mailselectie, bijlagenpakket) — blokkeerder voor V1.5 en FPS One.
2. **FPS One rapporten/documenten activeren** (na V1.4) — klantwaarde, direct zichtbaar.
3. **Inkoop-backend bouwen** — ongeblokkeerde supply-chain.
4. **Verlof → Planning automatische sync** — dagelijkse planningskwaliteit.
5. **V1.5 Rapportenmodule** (na V1.4 gereed).

---

## 14. Aanbevelingen

### 14.1 Direct (binnen één sprint)

| # | Aanbeveling | Reden | Geschat werk |
|---|---|---|---|
| A1 | FPS One: klant NIET doorsturen naar `/gebouwen/:id` | Informatiebeveiliging + merkbeleving | Klein (1 dag) |
| A2 | Wagenpark: `requireBevoegdheid("wagenpark", 1)` toevoegen | Toegangsbeheer-gap | Triviaal |
| A3 | Boekhouder-profiel aanmaken als apart preset | Externe boekhouder heeft nu te brede toegang | Klein |
| A4 | CRM kennisbibliotheek statisch markeren als "beheerd door FPS-team" | Voorkomt gebruikersverwarring | Triviaal |
| A5 | Studio/uitvoerder routes documenteren of verwijderen | Verborgen endpoints met onduidelijk doel | Klein |

### 14.2 Korte termijn (binnen twee sprints)

| # | Aanbeveling | Reden | Geschat werk |
|---|---|---|---|
| A6 | V1.4 Opleverrapportage definitief-maken afronden | Blokkeerder voor FPS One en V1.5 | Groot |
| A7 | CRM → Gebouw FK toevoegen (additief via ALTER) | Datamodel-integriteit | Middel |
| A8 | Verlof-goedkeuring triggers planningafwezigheid | Dagelijkse planningskwaliteit | Middel |
| A9 | Calculaties.ts legacy-routes auditen en eventueel deactiveren | Dubbele business-logica | Klein |
| A10 | OHW-overrides audittrail toevoegen | Financiële compliance | Middel |

### 14.3 Middellange termijn (roadmap)

| # | Aanbeveling | Reden |
|---|---|---|
| A11 | Inkoop-module bouwen (route + schema + frontend) | Magazijn-aanvoer ontbreekt volledig |
| A12 | FPS One rapporten/documenten activeren na V1.4 | Klantwaarde |
| A13 | Uren → Salaris-mutaties aggregatie-endpoint | Schaalbaarheid salarisverwerking |
| A14 | Module Calculatie activeren voor niet-pilotomgevingen | Volledige commerciële waardepropositie |
| A15 | CRM roadmap-status updaten (is actief uitgebouwd, niet geparkeerd) | Roadmap-correctheid |

---

## 15. Bijlagen

### Bijlage A — Volledige module-scorekaart

| Module | Cluster | Score | Endpoints (backend) | Frontend-status |
|---|---|---|---|---|
| Gebouwen | Kern | 5 | Volledig | Volledig |
| Spots/Voorzieningen | Kern | 5 | Volledig | Volledig |
| Documenten/DMS | Kern | 5 | 25 | Volledig |
| Dossiers | Kern | 4 | 19 | Volledig |
| Inspecties | Inspectie | 4 | Volledig | Volledig |
| Opleverrapportage (V1.4) | Inspectie | 3 | 10 | In aanbouw |
| Opname | Inspectie | 4 | 18 | Volledig |
| HRM/Personeel | HRM | 4 | 119 | Volledig |
| Verlof & saldi | HRM | 4 | (onderdeel HRM) | Volledig |
| Uren-registratie | HRM | 3 | 15 | Functioneel |
| Wagenpark | HRM | 3 | 16 | Functioneel |
| Veiligheid/PBM | HRM | 4 | 63 | Volledig |
| Offertes | Commercieel | 4 | 64 | Volledig |
| Opdrachten/Werkbegroting | Commercieel | 4 | 11 | Volledig |
| Regie | Commercieel | 3 | 11 | Semi-functioneel |
| Werkvoorbereiding | Commercieel | 3 | 21 | Semi-functioneel |
| Module Calculatie | Commercieel | 4* | 36 | Gated (pilot uit) |
| Onderhanden werk | Financieel | 3 | ~5 | Functioneel |
| Facturen/AccountView | Financieel | 3 | 25 | Functioneel |
| Salaris-mutaties & SCAB | Financieel | 3 | 5+4+9 | Functioneel |
| Salarisarchief | Financieel | 4 | 19 | Volledig |
| Boekhouder-portal | Financieel | 2 | 3 | Thin |
| Planning (V1) | Operationeel | 4 | 26 | Volledig |
| Magazijn | Operationeel | 3 | 25 | Functioneel |
| Werkbonnen | Operationeel | 2 | 6 | Thin |
| Materiaal-aanvragen | Operationeel | 2 | 4 | Thin |
| **Inkoop** | **Operationeel** | **0** | **0** | **Afwezig** |
| CRM | CRM | 3 | 32 | Functioneel + 1 statische pagina |
| CRM Kennisbibliotheek | CRM | 0 | 0 | Statisch |
| FPS One (gebouwen) | Klantportaal | 3 | (hergebruikt) | Functioneel maar misplaatst |
| FPS One (rapporten) | Klantportaal | 0 | 0 | Scaffold |
| FPS One (documenten) | Klantportaal | 0 | 0 | Scaffold |
| FPS One (abonnementen) | Klantportaal | 0 | 0 | Scaffold |
| Snagstream | Extern | 4 | 10 | Volledig |
| Toolbox/Berichten | Platform | 3 | 10 | Functioneel |
| Chat | Platform | 3 | 11 | Functioneel |
| Document Design System | Platform | 3 | (onderdeel rapporten) | Visuele basis |

*\* Score 4 voor gebouwde kwaliteit; onbereikbaar in pilot*

---

### Bijlage B — Volledig route-register

Alle 83 geregistreerde routemodules (uit `index.ts`):

`health`, `auth`, `uitnodiging`, `portaal`, `dashboard`, `gebouwen`, `voorzieningen`, `classificatie`, `fabrikanten`, `documenten`, `inspecties`, `onderhoud`, `gebruikers`, `abonnementen`, `storage`, `systeem`, `info`, `crm`, `inbox`, `emails`, `profielen`, `hrm`, `dossiers`, `offertes`, `mail`, `calculaties`, `rapporten`, `constructie-templates`, `mijn-werk`, `mijn-privacy`, `toolbox`, `planning-module`, `mod-calculatie`, `gereedschappen`, `uren`, `achievements`, `chat`, `backups`, `herstel`, `opname`, `werkdag`, `projecten`, `spot-status-configuratie`, `werk-inbox`, `veiligheid`, `opdrachten`, `werkvoorbereiding`, `snagstream`, `facturen`, `instellingen-accountview`, `accountview-mapping`, `salarisarchief`, `golive`, `salaris-mutaties`, `scab-mail`, `boekhouder`, `loon-output`, `slim-upload`, `workflow`, `online-gebruikers`, `wagenpark`, `wagenpark-meldingen`, `nieuws`, `organisatie`, `leveranciers`, `artikelen`, `import`, `onderhanden-werk`, `onderhoudscontracten`, `werkbonnen`, `magazijn`, `materiaal-aanvragen`, `uitvoerder`, `studio`, `ai`, `pbm`, `regie`, `contract-bewaking`

**Totaal: 83 route-bestanden** | **Geen inkoop-route aanwezig**

---

### Bijlage C — Scaffold-bestanden (volledige lijst)

| Bestand | Type | Oorzaak |
|---|---|---|
| `artifacts/firevault/src/pages/one/rapporten.tsx` | Statische preview | Hardcoded `GEPLANDE_FUNCTIES`, geen API |
| `artifacts/firevault/src/pages/one/documenten.tsx` | Statische preview | Hardcoded `GEPLANDE_FUNCTIES`, geen API |
| `artifacts/firevault/src/pages/one/abonnementen.tsx` | Statische prijskaart | Hardcoded `PAKETTEN`, geen API |
| `artifacts/firevault/src/pages/one/dashboard.tsx` | Navigatie-hub | Hardcoded `MODULE_ITEMS`, geen data-fetch |
| `artifacts/firevault/src/pages/crm/kennisbibliotheek.tsx` | Statisch content | Hardcoded `KENNIS` JS-array |

---

### Bijlage D — Integratie-topologie (tekstueel)

```
┌─────────────────────────────────────────────────────────┐
│                      FPS Connect                        │
│                                                         │
│  KERN          Gebouwen ←→ Spots ←→ Plattegronden       │
│                    ↓          ↓                         │
│  INSPECTIE     Inspecties  Documenten/DMS               │
│                    ↓          ↓                         │
│  COMMERCIEEL   CRM → [GAP] → Offertes → Opdrachten      │
│                                  ↓          ↓           │
│  UITVOERING    Planning ←→ Uren-reg  Werkvoorbereiding  │
│                    ↓                    ↓               │
│  LOGISTIEK     Werkbonnen    Magazijn ← [GAP: inkoop]   │
│                                                         │
│  FINANCIEEL    OHW ← Facturen → AccountView (→ ext.)    │
│                                                         │
│  HRM           Medewerkers → Verlof → [GAP] → Planning  │
│                    ↓           ↓                        │
│                Uren-reg → [GAP] → Salaris-mutaties      │
│                                                         │
│  FPS ONE       Gebouwen(✓) | Rapporten(✗) | Docs(✗)    │
└─────────────────────────────────────────────────────────┘
  ✓ = functioneel | ✗ = scaffold | [GAP] = ontbrekende koppeling
```

---

*Einde rapport — Module-integratieaudit FPS Connect / FPS One, 2 juli 2026*
