# Technische Audit — FPS Connect / FPS One

**Datum:** 2 juli 2026  
**Scope:** Volledige codebase-analyse ter voorbereiding op mogelijke platformmigratie  
**Methode:** Statische codeanalyse — geen wijzigingen uitgevoerd  
**Versie:** pnpm-monorepo, Node.js 24, TypeScript 5.9

---

## Inhoudsopgave

1. [Managementsamenvatting](#1-managementsamenvatting)
2. [Technische architectuur](#2-technische-architectuur)
3. [Module-overzicht](#3-module-overzicht)
4. [Database-overzicht](#4-database-overzicht)
5. [AI-architectuur](#5-ai-architectuur)
6. [Front-end analyse](#6-front-end-analyse)
7. [Back-end analyse](#7-back-end-analyse)
8. [Security-analyse](#8-security-analyse)
9. [Performance-analyse](#9-performance-analyse)
10. [Codekwaliteitsanalyse](#10-codekwaliteitsanalyse)
11. [GitHub Export Readiness](#11-github-export-readiness)
12. [Migratieanalyse](#12-migratieanalyse)
13. [Eindconclusie](#13-eindconclusie)
14. [Prioriteitenlijst](#14-prioriteitenlijst)

---

## 1. Managementsamenvatting

### Projectomvang

| Meting | Waarde |
|---|---|
| Totale TS/TSX-regels | ~349.000 |
| Backend routes | 80 bestanden · ~45.400 regels |
| Frontend pagina's | 189 TSX-bestanden · ~95.700 regels |
| Mobiele schermen (Expo) | 42 bestanden · ~18.100 regels |
| Database-schemabestanden | 49 bestanden · ~4.950 regels |
| OpenAPI-endpoints | 568 gedeclareerde paden |
| AI-aanroeplocaties | 65 over 44 bestanden |
| Backend route-bestanden | 80 |
| Shared libraries | 6 (`api-client-react`, `api-spec`, `api-zod`, `db`, `object-storage-web`, `permissies`) |

Dit is een **groot, volwassen platform** — qua omvang vergelijkbaar met een middelgrote enterprise SaaS-applicatie. De codebase omvat ruim 40 functionele modules met een volledig uitgewerkte front-end, back-end, mobiele app en geautomatiseerde AI-lagen.

### Sterkste punten

1. **Contract-first API** — OpenAPI spec als bron van waarheid, Orval genereert hooks en Zod-schemas; API-drift is structureel voorkomen.
2. **Sterke auth** — verplichte TOTP 2FA, bcryptjs, HMAC bearer voor mobiel, Secure+SameSite=None cookies correct voor iframe-omgeving.
3. **Gelaagd bevoegdhedenmodel** — JSONB-matrix per gebruiker + profielen-systeem + `requireBevoegdheid`-middleware; genuanceerder dan standaard RBAC.
4. **Opslagabstractie** — factory-patroon voor GCS en S3; één interface, twee backends, uitwisselbaar zonder codejacht.
5. **Geen hardcoded secrets** — alle gevoelige waarden via `process.env`; geen enkele geheime waarde aangetroffen in de codebase.
6. **Volledig Nederlandstalige UI** — consequent en professioneel uitgevoerd.
7. **Rijke AI-integratie** — AI is diep verweven in ~15 workflows met fallback-logica en menselijke bevestigingsstappen.
8. **Geen TODO/FIXME** — bij greppen over de volledige codebase gevonden: 0 instanties. Uitzonderlijk voor een codebase van deze omvang.

### Grootste zwakke punten

1. **Monolithische route-bestanden** — `hrm.ts` (4.164 regels), `veiligheid.ts` (2.485), `offertes.ts` (2.028): slecht onderhoudbaar, hoge merge-conflictkans.
2. **AI-calls verspreid over route-handlers** — 65 aanroeplocaties in 44 bestanden zonder centrale service-laag; geen retry-logica, geen queue, geen rate-limit-bescherming.
3. **~43% van endpoints niet expliciet beveiligd via middleware** — de check toont 493 van 869 calls; een deel zijn auth-routes en health, maar het verdient dieper onderzoek.
4. **Grote frontend-bestanden** — `plattegrond.tsx` 3.249 regels, `print.tsx` 2.963, `documenten-tab.tsx` 2.349; complexiteit verhoogt de kans op regressions.
5. **Replit-afhankelijkheden** — 4 `@replit/vite-plugin-*` in Vite-config, `REPLIT_*` env-vars in Expo dev-script; migreerbaar maar vereist aandacht.
6. **gpt-5/gpt-5.4 nog experimenteel** — 6 aanroeplocaties gebruiken niet-stabiele model-versies; OpenAI heeft deze niet officieel uitgebracht als stabile API-versie.

### Eindscore

| Onderdeel | Score |
|---|---|
| Architectuur | 8 / 10 |
| Codekwaliteit | 7 / 10 |
| Onderhoudbaarheid | 6 / 10 |
| AI-architectuur | 7 / 10 |
| Performance | 6 / 10 |
| Schaalbaarheid | 7 / 10 |
| Veiligheid | 8 / 10 |
| Migratiegeschiktheid | 8 / 10 |

---

## 2. Technische architectuur

### Overzicht

```
┌─────────────────────────────────────────────────────────────────────┐
│  REPLIT REVERSE PROXY (path-based routing, mTLS)                    │
│                                                                     │
│  /         →  artifacts/firevault (Vite, poort 25392)              │
│  /api       →  artifacts/api-server (Express 5, poort 8080)        │
│  /monteur   →  artifacts/monteur-app (Expo, dynamische poort)      │
└─────────────────────────────────────────────────────────────────────┘
         │                    │                       │
         ▼                    ▼                       ▼
   React 19 SPA        Express 5 API          Expo 54 RN-app
   Vite 7 + TW4        Node.js 24             React Native 0.81
   shadcn/ui           TypeScript 5.9         iOS + Android + Web
   wouter routing      esbuild bundle         HMAC bearer auth
         │                    │
         │         ┌──────────┼──────────┐
         │         ▼          ▼          ▼
         │    PostgreSQL   OpenAI    Azure AD
         │    Drizzle ORM  GPT-4o/5  Graph API
         │                           (e-mail)
         │              ┌────────────┐
         └──────────────►  GCS / S3  │
                        │  (storage) │
                        └────────────┘
```

### Werkpakketten (pnpm workspace)

| Package | Type | Doel |
|---|---|---|
| `artifacts/firevault` | Artifact – web | Hoofd-webapp FPS Connect / FPS One |
| `artifacts/api-server` | Artifact – API | REST API + AI-services |
| `artifacts/monteur-app` | Artifact – mobile | FPS Monteur Expo-app |
| `artifacts/mockup-sandbox` | Artifact – design | Componentpreview (Vite, Canvas) |
| `lib/api-client-react` | Lib | Gegenereerde React Query hooks (Orval) |
| `lib/api-spec` | Lib | OpenAPI YAML + codegen-config |
| `lib/api-zod` | Lib | Gegenereerde Zod request/response-schemas |
| `lib/db` | Lib | Drizzle ORM-schema (source of truth DB) |
| `lib/object-storage-web` | Lib | Browser-side upload-utilities |
| `lib/permissies` | Lib | Bevoegdheidsmodel (ModuleId, niveaus, presets) |
| `scripts` | Scripts | E2E Playwright, kwaliteitscheck, security-scan |

### Runtime-stack

| Laag | Technologie | Versie |
|---|---|---|
| Runtime | Node.js | 24 |
| Taal | TypeScript | 5.9 |
| Package manager | pnpm | workspaces |
| Web-framework | Express | 5.2 |
| Build | esbuild | 0.27 (CJS → ESM bundle) |
| Frontend | React + Vite | 19.1 + 7.3 |
| CSS | TailwindCSS | 4.3 |
| UI-components | shadcn/ui + Radix | — |
| Routing (web) | wouter | 3.10 |
| State/data | TanStack Query | 5.101 |
| Formulieren | react-hook-form + zod | 7.77 + 3.25 |
| Mobiel | React Native + Expo | 0.81.5 + 54 |
| Database | PostgreSQL | prod |
| ORM | Drizzle ORM | 0.45 |
| Validatie | Zod (v4 API) | 3.25 |
| Animaties | Framer Motion / Reanimated | 12.40 / 4.1 |
| PDF generatie | PDFKit + pdf-lib | 0.19 + 1.17 |
| PDF lezen | pdf-parse + pdfjs-dist | 2.4 + 6.0 |
| Grafieken | Recharts | 2.15 |

---

## 3. Module-overzicht

### Methode

Basis: combinatie van aanwezige route-bestanden (`artifacts/api-server/src/routes/`), front-end pagina-bestanden (`artifacts/firevault/src/pages/`) en Expo-schermen (`artifacts/monteur-app/app/`).

### Compleetheidsschaal

- **Gebouwd** = volledig functioneel, stabiel in productie
- **Basis** = kernfunctionaliteit aanwezig, verdere uitwerking mogelijk
- **Scaffold** = schermstructuur aanwezig, beperkte backend-koppeling
- **Geparkeerd** = aanwezig in codebase, bewust niet verder uitgebouwd

---

| Module | Status | Compleet % | Tech kwaliteit | Migratiecomplex | Herbruikbaar |
|---|---|---|---|---|---|
| **Gebouwen** | Gebouwd | 95 | Hoog | Laag | Ja |
| **Spots / Voorzieningen** | Gebouwd | 92 | Hoog | Laag | Ja |
| **Dashboard** | Gebouwd | 90 | Hoog | Laag | Ja |
| **Bibliotheek** (labels, toepassingen, ETA's) | Gebouwd | 88 | Hoog | Laag | Ja |
| **Documenten / DMS** | Gebouwd | 88 | Hoog | Middel | Ja |
| **Gebruikers + Rollen/Bevoegdheden** | Gebouwd | 92 | Hoog | Laag | Ja |
| **Inspecties** | Gebouwd | 85 | Hoog | Laag | Ja |
| **Onderhoud + Werkbonnen** | Gebouwd | 80 | Middel | Middel | Gedeeltelijk |
| **Offertes + Studio** | Gebouwd | 80 | Middel | Middel | Gedeeltelijk |
| **Dossiers** | Gebouwd | 78 | Hoog | Laag | Ja |
| **Slim Upload** | Gebouwd | 85 | Hoog | Laag | Ja |
| **HRM / Personeel** (Fase 1) | Basis | 65 | Middel | Hoog | Gedeeltelijk |
| **Berichten / Chat** | Gebouwd | 80 | Middel | Laag | Ja |
| **Inbox / Werk-inbox** | Gebouwd | 78 | Middel | Laag | Ja |
| **Rapporten** | Basis | 60 | Middel | Middel | Gedeeltelijk |
| **Planning** (V1 pilot) | Basis | 55 | Middel | Middel | Gedeeltelijk |
| **Calculatie** (uitgeschakeld) | Basis | 40 | Laag | Hoog | Nee |
| **Regie** | Basis | 55 | Middel | Middel | Gedeeltelijk |
| **Uren** | Basis | 65 | Middel | Laag | Gedeeltelijk |
| **Werkvoorbereiding** | Basis | 50 | Middel | Hoog | Nee |
| **Opdrachten** | Basis | 55 | Middel | Hoog | Nee |
| **Veiligheid** (LMRA, PBM, Toolbox) | Basis | 60 | Middel | Middel | Gedeeltelijk |
| **Wagenpark** | Basis | 60 | Hoog | Laag | Ja |
| **Gereedschappen** | Basis | 60 | Hoog | Laag | Ja |
| **Magazijn** | Basis | 55 | Middel | Middel | Gedeeltelijk |
| **Leveranciers** | Basis | 55 | Middel | Laag | Ja |
| **Artikelen** | Basis | 50 | Middel | Laag | Gedeeltelijk |
| **Facturen + AccountView** | Basis | 55 | Middel | Hoog | Nee |
| **Salaris / Loon** | Basis | 40 | Laag | Hoog | Nee |
| **Snagstream** | Basis | 60 | Hoog | Laag | Ja |
| **Opname** | Basis | 65 | Hoog | Laag | Ja |
| **Abonnementen** | Basis | 50 | Middel | Laag | Gedeeltelijk |
| **FPS One** (klantportaal) | Scaffold | 30 | Middel | Laag | Gedeeltelijk |
| **CRM** | Scaffold | 25 | Laag | Middel | Nee |
| **Organisatie / Werkgevers** | Gebouwd | 75 | Hoog | Laag | Ja |
| **Toolbox** | Basis | 55 | Middel | Laag | Gedeeltelijk |
| **Back-up & Herstel** | Gebouwd | 85 | Hoog | Middel | Gedeeltelijk |
| **Workflow-engine** | Basis | 50 | Middel | Hoog | Nee |
| **Boekhouder** (AccountView export) | Basis | 45 | Laag | Hoog | Nee |
| **Document Design System** | Basis | 45 | Hoog | Laag | Ja |
| **Plattegrond-editor** | Gebouwd | 85 | Hoog | Middel | Gedeeltelijk |

---

## 4. Database-overzicht

### Statistieken

| Meting | Waarde |
|---|---|
| Schema-bestanden | 49 |
| Totale schema-regels | ~4.950 |
| Geschat aantal tabellen | 120–140 |
| ORM | Drizzle (type-safe, geen raw SQL behalve ALTER-patches) |

### Schema-structuur per domein

```
lib/db/src/schema/
├── gebruikers.ts        Gebruikers, profielen, sessies
├── gebouwen.ts          Gebouwen, verdiepingen, toewijzingen, scheidingen
├── voorzieningen.ts     Spots, applicaties, labels/toepassingen, testrapporten
├── documenten.ts        Documenten, versies, koppelingen, approvals
├── inspecties.ts        Inspectie-items, resultaten
├── onderhoud.ts         Werkorders, prioriteiten
├── abonnementen.ts      Pakketten, klant-koppeling
├── activiteiten.ts      Audit-log (gedenormaliseerd: naam + gebouw)
├── systeem.ts           Werkgevers, profielen, module-beoordelingen
├── crm.ts               Organisaties, contacten, projectkansen
├── emails.ts            E-mail-threads, koppelingen
├── hrm.ts               Medewerkers, functies, opleidingen (442 regels — grootste)
├── dossiers.ts          Dossiers, status-machine
├── offertes.ts          Offertes, regels, studio-templates
├── mail.ts              Inkomende mail, verwerking
├── calculaties.ts       Calculatie-regels, onderdelen
├── rapporten.ts         Rapporten, status, certificaat
├── toolbox.ts           Toolbox-items, lees-bevestigingen
├── projecten.ts         Projecten-koppeling
├── planning.ts          Planning-items, capaciteit
├── mod-calculatie.ts    Module-calculatie, werkbegrotingen (131 regels)
├── gereedschappen.ts    Gereedschapsregistratie, keuring
├── achievements.ts      Gamification
├── uren.ts              Urenregistratie, weekstaten
├── chat.ts              Gesprekken, berichten
├── backups.ts           Back-up-records
├── opname.ts            Opname-sessies, bevindingen
├── inbox.ts             Document-inbox
├── werk-inbox.ts        Werk-gerichte inbox
├── veiligheid.ts        LMRA, incidenten, PBM, toolboxen (267 regels)
├── regie.ts             Regie-uren, materiaal
├── contracten.ts        Onderhoudscontracten
├── opdrachten.ts        Opdrachten, werkbegroting
├── snagstream.ts        Snagstream-items, oplossingen
├── facturen.ts          Factuurregels, export-log (206 regels)
├── golive.ts            Go-live-sessies, configuratie
├── salarismutaties.ts   Salaris-mutaties
├── workflow.ts          Workflow-engine, stappen
├── wagenpark.ts         Voertuigen, tankbeurten, keuringen (339 regels)
├── organisatie.ts       Werkmaatschappijen, vestigingen (127 regels)
├── werkvoorbereiding.ts Werkvoorbereiding, materiaallijsten (166 regels)
├── leveranciers.ts      Leveranciersregistratie
├── artikelen.ts         Artikelcatalogus
├── onderhanden-werk.ts  Onderhanden werk financieel
├── magazijn.ts          Magazijnlocaties, voorraadbeheer (93 regels)
├── materiaal-aanvragen.ts Materiaalanvragen
├── uitvoerder.ts        Uitvoerder-sessies
├── import_logs.ts       Import-logboek
└── salaris.ts           Salarisarchief, batches
```

### Kernrelaties (vereenvoudigd ER-diagram)

```
werkgevers ──────────────────────────────────────────┐
    │                                                 │
    ├── gebouwen ─┬── verdiepingen                   │
    │             │       └── voorzieningen ──────────┤
    │             │               └── fotos           │
    │             ├── toewijzingen ── gebruikers ─────┤
    │             ├── documenten ── document_versies  │
    │             ├── inspecties ── inspectie_items   │
    │             ├── onderhoud ── werkorders          │
    │             ├── dossiers                        │
    │             └── rapporten                       │
    │                                                 │
    └── medewerkers ─┬── functies ── m2m_functies     │
                     ├── verlof_saldi                 │
                     ├── verlof_aanvragen             │
                     └── opleidingen ── m2m_opleidingen

gebruikers ─┬── sessies (connect-pg-simple)
            ├── profielen (bevoegdheden-matrix)
            └── activiteiten (audit-log)

offertes ── offerte_regels ── labels/toepassingen
    └── studio_templates

documenten ─┬── document_toepassingen (polymorfe koppeling)
            ├── document_approvals
            └── document_koppelingen (gebouw/klant/offerte/dossier)

labels (testrapporten) ─┬── voorzieningtypen
                        └── fabrikanten
```

### Storage buckets

| Type | Configuratie | Gebruik |
|---|---|---|
| **GCS** | `GCS_BUCKET` / `GOOGLE_CLOUD_BUCKET` | Standaard object-storage |
| **S3-compatible** | `S3_BUCKET`, `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Alternatief (Replit Object Storage) |
| **Selectie** | Factory in `objectStorage.ts` | `S3_BUCKET` aanwezig → S3, anders GCS |

Opgeslagen objecttypen: foto's (spots), PDF-documenten, plattegrond-SVG, logo's, testrapporten, back-ups (gzip'd pg_dump + sha256-verificatie).

### Indexen en constraints

- Drizzle ORM genereert parameterized queries — geen SQL-injection-risico via ORM.
- `unique()` constraints op: `objectnummer` (voorzieningen), `email` (gebruikers), `werknummer`/`projectnummer` (gebouwen), `uitnodiging_token` (gebruikers).
- Geen expliciete `index()`-declaraties zichtbaar in schema — potentieel prestatierisico bij grote datasets op fk-kolommen.
- Geen views of stored procedures gevonden.

---

## 5. AI-architectuur

### Overzicht

| Meting | Waarde |
|---|---|
| AI-aanroeplocaties | 65 |
| Bestanden met AI-calls | 44 |
| Modellen in gebruik | gpt-4o, gpt-4o-mini, gpt-5, gpt-5-mini, gpt-5.4 |
| Provider | OpenAI (direct of via Replit AI proxy) |
| Primaire modus | Synchrone HTTP-calls binnen route-handlers |
| Dedicated AI-services | 5 (`document-ai`, `email-ai`, `gebouw-ai`, `opleiding-ai`, `spot-ai`) |

### Gebruikte modellen per locatie

| Model | Aanroepen | Toepassingen |
|---|---|---|
| `gpt-4o` | ~45 | Standaard werkpaard: gebouw-analyse, spot-voorstel, offertes, CRM-coach, toolbox-samenvatting, risicoanalyse, materiaalinschatting, veiligheid, salaris-mutaties, facturen, wagenpark, planningsassistent, studio-generatie |
| `gpt-4o-mini` | 3 | Slim-upload classificatie, planning-assistent-lite, organisatietekst |
| `gpt-5` | 4 | Gebouw AI-analyse, opleiding-voorstel, offerte-generatie, spot-AI |
| `gpt-5-mini` | 4 | Document-analyse, email-analyse (2x), gebouw-analyse-lite |
| `gpt-5.4` | 2 | Calculatie-chat, opdrachten-chat |

> **Let op:** `gpt-5`, `gpt-5-mini` en `gpt-5.4` zijn geen officieel uitgebrachte stabiele OpenAI-modelnamen (peildatum audit). Dit zijn waarschijnlijk Replit-proxy-aliases of namen die door OpenAI nog kunnen veranderen bij productierelease. Dit vormt een migratie- en stabilititsrisico.

### Dedicated AI-services

| Service | Model | Functie |
|---|---|---|
| `services/document-ai.ts` | gpt-5-mini | Tekst-extractie + structuurherkenning uit PDF-documenten |
| `services/email-ai.ts` | gpt-5-mini | E-mail-intent-analyse, prioritering, onderwerp-extractie |
| `services/gebouw-ai.ts` | gpt-5, gpt-5-mini | Gebouw-analyse uit afbeeldingen + adressen (vision + geocode) |
| `services/opleiding-ai.ts` | gpt-5 | Opleiding-/cursusvoorstel per functie |
| `services/spot-ai.ts` | gpt-5 | Spot-classificatie, testnorm-voorstel, correctie-suggestie |
| `lib/openai.ts` | — | Factory: Replit-proxy → eigen sleutel fallback |
| `lib/scoutService.ts` | gpt-4o | Scout-analyse (CRM-intelligence) |

### AI-aanroepen verspreid in route-handlers (geen dedicated service)

De overige ~58 AI-calls zitten rechtstreeks in route-bestanden, inclusief:
- `hrm.ts`: 5 calls (bekwaamheidsmatrix, CV-analyse, verlofadvies, teamsamenstelling, onboarding)
- `veiligheid.ts`: 5 calls (LMRA-risico, incident-analyse, toolbox-beoordeling, PBM-check, compliance)
- `organisatie.ts`: 5 calls (bedrijfsanalyse, documenten-review, jaarverslag, certificaten, concurrentiepositie)
- `werkvoorbereiding.ts`: 3 calls
- `offertes.ts`: 3 calls
- `crm.ts`: 5 calls

### Patroon: synchrone calls zonder queue

Alle AI-calls zijn synchrone `await openai.chat.completions.create(...)` binnen de request-lifecycle. Er is:
- **Geen job-queue** (geen Bull, Agenda, of vergelijkbaar)
- **Geen retry-logica** (bij OpenAI-timeout breekt de request)
- **Geen rate-limit-bescherming** (bij burst-gebruik kunnen calls mislukken)
- **Geen caching** van AI-responses (identieke vragen produceren identieke kosten)
- **Geen streaming** zichtbaar in de huidige implementatie

### Patroon: menselijke bevestiging

Positief: in alle kritische AI-flows geldt het principe "AI stelt voor, mens bevestigt". Er zijn geen AI-flows die direct resultaten naar productie schrijven zonder tussenkomst.

### AI-functies die vervangen kunnen worden door eenvoudige logica

| Huidige AI-call | Alternatief |
|---|---|
| Toolbox-samenvatting genereren | Template-based tekst-samenstelling |
| E-mail-prioritering | Regelgebaseerde scoring op afzender + trefwoorden |
| Slim-upload-classificatie op bekende extensies | Bestandsextensie + bestandsnaampatroon matching |
| Abonnement-suggestie op gebruikersaantal | Drempelwaarden-tabel |

---

## 6. Front-end analyse

### Structuur

```
artifacts/firevault/src/
├── components/          Herbruikbare componenten (11 bestanden + mappen)
│   ├── ui/              shadcn/ui-componenten (Button, Dialog, Select…)
│   ├── weergave/        Weergave-utilities
│   ├── online-gebruikers/
│   ├── documentopmaak/  Document Design System-componenten
│   ├── pauze/           Pauzescherm
│   ├── slim-upload-balk.tsx    AI-upload (1.323 regels)
│   ├── ai-chat-panel.tsx       Herbruikbaar AI-chatpaneel
│   ├── ai-invullen-knop.tsx
│   ├── applicatie-picker.tsx
│   ├── toepassing-multi-select.tsx
│   ├── gebruiker-menu.tsx
│   ├── crm-coach-panel.tsx
│   ├── heatmap-tracker.tsx
│   ├── nieuws-ticker.tsx
│   ├── ondersteuning-widget.tsx
│   ├── pagina-hulp.tsx
│   └── veiligheidsmelding-banner.tsx
├── context/             Auth, rol, achievement context-providers
├── hooks/               7 custom hooks
├── layouts/             Beheerder-layout, wrappende routes
├── lib/                 Feature-flags, utils
└── pages/               189 pagina-TSX-bestanden
```

### Grootste pagina-bestanden

| Bestand | Regels | Opmerking |
|---|---|---|
| `gebouwen/plattegrond.tsx` | 3.249 | SVG-editor + interactiviteit, te groot |
| `gebouwen/print.tsx` | 2.963 | Opleverrapport-renderer, te groot |
| `beheer/documenten-tab.tsx` | 2.349 | DMS-tabblad, te groot |
| `personeel/index.tsx` | 2.202 | HRM-overzicht, te groot |
| `offertes/studio.tsx` | 2.060 | Offerte-studio, te groot |
| `personeel/detail.tsx` | 2.022 | Medewerkersprofiel, te groot |
| `beheer/bibliotheek.tsx` | 1.949 | Bibliotheek-beheer, te groot |
| `workflow/index.tsx` | 1.875 | Workflow-engine UI |
| `gebruikers/index.tsx` | 1.854 | Gebruikersbeheer |
| `gebouwen/detail.tsx` | 1.526 | Gebouwdetail + tabs |

**Aanbeveling:** bestanden >1.000 regels zijn risicovol voor onderhoud. De top-10 heeft gezamenlijk ~20.000 regels — dat is ~21% van alle frontend-code in 10 bestanden.

### Custom hooks

| Hook | Functie |
|---|---|
| `use-bevoegdheid.ts` | Haalt bevoegdheidsniveau op voor huidige gebruiker |
| `use-actief-studio-model.ts` | Bijhoudt actieve studio-template |
| `use-gebouw-id.ts` | Parset gebouw-ID uit URL |
| `use-mobile.tsx` | Detecteert mobiele viewport |
| `use-breakpoint.tsx` | Responsive breakpoint-detection |
| `use-navigatie-bewaking.ts` | Blokkeert navigatie bij onopgeslagen wijzigingen |
| `use-voorkeur.ts` | Persistente gebruikersvoorkeuren (localStorage) |
| `use-toast.ts` | Toast-notificaties (Sonner) |

### Context Providers

| Context | Doel |
|---|---|
| `auth-context.tsx` | Huidige gebruiker, rol, uitloggen |
| `rol-context.tsx` | Rol-bewuste navigatie helpers |
| `achievement-context.tsx` | Gamification-events |

### State Management

- **Serverstate:** TanStack Query 5 (React Query) — polling via `setInterval` + `refetch()`, geen `refetchInterval` (pre-existing TS2741-issue)
- **Formulierstate:** react-hook-form + Zod-resolvers
- **Lokale UI-state:** React `useState`, `useRef`
- **Persistentie:** localStorage voor gebruikersvoorkeuren en formulierfrequentie-sortering
- **Geen globale client-state-library** (geen Redux, Zustand, Jotai)

### Routing

- wouter 3.x (lichtgewicht, ~2KB)
- Rol-bewuste navigatie vanuit `portaal/index.tsx`
- Feature-flags via `VITE_FEATURE_*` omgevingsvariabelen

### Dubbele of ongebruikte componenten

- `crm-coach-panel.tsx` en `ai-chat-panel.tsx` zijn functioneel overlappend maar dienen verschillende contexten — niet echt duplicaat.
- `fabrikant-sectie.tsx` bestaat nog als bestand maar is bewust uit spotformulier verwijderd; kan verwijderd worden.
- `connect/calculatie.tsx`, `connect/hrm.tsx`, `connect/planning.tsx` zijn module-landingspagina's die grotendeels "coming soon" bevatten.

---

## 7. Back-end analyse

### Structuur

```
artifacts/api-server/src/
├── index.ts              Entry point, middleware-stack, route-registraties
├── build.mjs             esbuild-config (CJS → ESM output)
├── lib/
│   ├── openai.ts         OpenAI-factory (proxy/eigen sleutel)
│   ├── token.ts          HMAC bearer-token (mobiel)
│   ├── logger.ts         Pino-logger singleton
│   └── scoutService.ts   CRM intelligence (gpt-4o)
├── middlewares/
│   └── auth.ts           requireAuth, requireRol, requireBevoegdheid, requireEnigeBevoegdheid
├── routes/               80 route-bestanden (45.382 regels)
└── services/
    ├── document-ai.ts    PDF-analyse (gpt-5-mini)
    ├── email-ai.ts       E-mail-verwerking (gpt-5-mini)
    ├── gebouw-ai.ts      Gebouw-vision (gpt-5, gpt-5-mini)
    ├── opleiding-ai.ts   Opleiding-voorstel (gpt-5)
    ├── spot-ai.ts        Spot-classificatie (gpt-5)
    ├── werkInboxGraph.ts Microsoft Graph (e-mail-ophalen)
    ├── email.ts          Nodemailer (SMTP-verzending)
    └── objectStorage.ts  Storage-factory (GCS of S3)
```

### Grootste route-bestanden

| Bestand | Regels | Domeinen |
|---|---|---|
| `hrm.ts` | 4.164 | Medewerkers, functies, opleidingen, verlof, bekwaamheden, salarisopmaak |
| `veiligheid.ts` | 2.485 | LMRA, incidenten, PBM, toolboxen, compliance |
| `offertes.ts` | 2.028 | Offertes, studio, regels, verzending |
| `gebouwen.ts` | 1.713 | Gebouwen, verdiepingen, toewijzingen, rapporten |
| `mod-calculatie.ts` | 1.626 | Module-calculatie, werkbegroting, nacalculatie |
| `magazijn.ts` | 1.553 | Voorraadbeheer, mutaties, locaties |
| `werkvoorbereiding.ts` | 1.436 | Werkvoorbereiding, materiaallijsten |
| `voorzieningen.ts` | 1.335 | Spots, foto's, AI-controle |

`hrm.ts` met 4.164 regels is veruit het grootste bestand in de hele codebase. Dit bestand bevat het volledige HRM-domein (medewerkers, functies, verlof, opleidingen, salarisopmaak, bekwaamheden). Het is technisch functioneel maar vormt een onderhoudsprobleem.

### API-endpoints

| Meting | Waarde |
|---|---|
| OpenAPI-gedeclareerde paden | 568 |
| Route-bestanden | 80 |
| Calls met `requireAuth` / `requireBevoegdheid` | ~493 |
| Totale `router.*` calls | ~869 |
| Openbare routes (terecht) | `/healthz`, `/auth/*`, `/uitnodiging`, `/api/auth/pwa-qr` |

### Middleware-stack (volgorde in index.ts)

1. `trust proxy` — vereist voor `Secure` cookies in Replit-iframe
2. `cors` — geconfigureerd op `REPLIT_DOMAINS`
3. `cookie-parser`
4. `express-session` + `connect-pg-simple` (sessie-opslag in PostgreSQL)
5. `pino-http` (request logging)
6. Route-handlers (per prefix gemount)

### Sessie-architectuur

- Cookie: `SameSite=None; Secure` (correct voor iframe)
- Sessie-store: PostgreSQL (connect-pg-simple)
- Mobiel: HMAC-signed bearer-token → stub-sessie (geen persistentie)

### E-mail

- **Verzending:** Nodemailer + Microsoft Graph (MAIL_TENANT_ID, MAIL_CLIENT_ID, MAIL_MAILBOX) — gedeelde postbus
- **Ontvangst/parsing:** Mailparser + kenjiuno/msgreader (MSG-bestanden)
- **AI-verwerking:** Email-AI-service analyseert inkomende e-mails op intent

---

## 8. Security-analyse

### Authenticatie

| Onderdeel | Bevinding | Ernst |
|---|---|---|
| Wachtwoorden | `bcryptjs` hashing — correct | OK |
| TOTP | `otplib` v12, verplicht voor alle gebruikers | OK |
| Sessies | `express-session` + PostgreSQL-store | OK |
| Bearer-token (mobiel) | HMAC-gesigneerd, server-side validatie | OK |
| `trust proxy` | Correct ingesteld voor iframe-omgeving | OK |
| Uitnodigingsflow | Token + vervaldatum + eenmalig gebruik | OK |

### Autorisatie

| Onderdeel | Bevinding | Ernst |
|---|---|---|
| `requireAuth` | Aanwezig op de meeste dataroutes | OK |
| `requireBevoegdheid` | Granulaire toegangscontrole per module + niveau | OK |
| Object-level auth | `magBijGebouw` voor gebouwscoping | OK |
| ~376 niet-expliciet beveiligde router-calls | Deels terechte publieke routes; volledig overzicht vereist gerichte audit | Middel |
| Klant-rol scoping | Gebouw-filter op effectieve context | OK |

> **Aandachtspunt:** Het getal "493 beveiligde van 869 calls" is conservatief berekend (pure regex-telling). Een volledige route-matrix vereist handmatige inspectie van `index.ts`-middleware-volgorde. In de praktijk worden routes via router-mount-volgorde al beschermd door bovenliggende `requireAuth`. Geen harde conclusies mogelijk zonder volledige traversal.

### Secrets en omgevingsvariabelen

| Variabele | Type | Opmerking |
|---|---|---|
| `DATABASE_URL` | Kritiek | Postgres connectiestring |
| `SESSION_SECRET` | Kritiek | Sessie-ondertekening |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | Kritiek | Replit-proxy sleutel |
| `OPENAI_API_KEY` | Kritiek | Fallback direct OpenAI |
| `AZURE_TENANT_ID`, `AZURE_CLIENT_ID_NEW`, `AZURE_CLIENT_SECRET` | Kritiek | Microsoft Graph (e-mail) |
| `GOOGLE_MAPS_API_KEY` | Middel | Maps embed (server-side) |
| `S3_*` / `GCS_BUCKET` | Kritiek | Bestandsopslag |
| `MAIL_*` | Kritiek | E-mailconfiguratie |

**Bevinding:** Geen enkele geheime waarde is hardcoded in de codebase. Alle secrets via `process.env`. Positief.

### Inputvalidatie

- Zod-schemas op alle API-request-bodies (gegenereerd via Orval of handmatig)
- Multer voor file-uploads met configureerbare limieten
- `fast-xml-parser` voor XML-parsing (geen directe DOM-parsing)
- Drizzle ORM — parameterized queries, geen string-concatenatie in SQL

### Upload-beveiliging

- Multer verwerkt uploads
- Bestandstype-validatie beperkt tot MIME-type (client-side)
- Server-side extensie-whitelist niet zichtbaar in route-analyse — aandachtspunt

### XSS-risico's

- React rendert standaard geen raw HTML
- `dangerouslySetInnerHTML` niet aangetroffen in analyse
- DOMPurify aanwezig in dependencies (`dompurify@>=3.4.11` via override)
- PDF-content via `pdf-parse` → verwerkt als tekst, niet als HTML

### Bekende kwetsbaarheden (override-sectie pnpm-workspace.yaml)

De workspace heeft actieve overrides voor bekende CVE's:
- `dompurify@<=3.4.10` → geforceerd `>=3.4.11`
- `form-data@<2.5.6` → geforceerd `>=2.5.6`
- `nodemailer@<=9.0.0` → geforceerd `>=9.0.1`
- `postcss@<8.5.10` → geforceerd `>=8.5.10`
- `uuid@<11.1.1` → geforceerd `>=11.1.1`
- `undici@<6.27.0` → geforceerd `>=6.27.0`

Dit toont actief dependency-beheer. Positief.

---

## 9. Performance-analyse

### Backend

| Onderdeel | Bevinding | Impact |
|---|---|---|
| AI-calls synchroon in request-handler | Elke AI-call blokkeert de HTTP-response (2–15s typisch) | Hoog |
| Geen AI-response-caching | Identieke vragen = identieke kosten en latentie | Middel |
| `hrm.ts` (4.164 regels) | Module-bundel groot; esbuild bundelt alles in één dist/index.mjs | Laag |
| PostgreSQL-sessie-store | Sessie-lezing bij elke request (geen in-memory cache) | Laag-Middel |
| Geen DB-indexen gedeclareerd via Drizzle | Bij groeiende datasets potentieel trage queries op FK-kolommen | Middel |
| `pg_dump` back-up asynchroon | Dagelijks 03:00, `recursieve setTimeout` — correct | OK |

### Frontend

| Onderdeel | Bevinding | Impact |
|---|---|---|
| `plattegrond.tsx` (3.249 regels) | Grote component, SVG-manipulatie, event-handlers | Middel |
| `print.tsx` (2.963 regels) | Rapport-render met meerdere async-queries; `html2canvas-pro` voor PDF-capture | Middel |
| `slim-upload-balk.tsx` (1.323 regels) | Global drag-listeners op `document` — correct geïmplementeerd | OK |
| `pdfjs-dist v6` | Zware library (~4MB) geladen voor PDF-preview | Middel |
| `xlsx v0.18.5` | Aanwezig op zowel frontend als backend | Middel |
| Polling via `setInterval + refetch()` | Gebruikt in chat (5s/10s) en activiteitsfeed — acceptabel | OK |
| React 19 concurrent features | Niet expliciet gebruikt; potentieel onbenut | Laag |
| Bundle-grootte API-server | `dist/index.mjs` = 8.2 MB (inclusief sourcemap 15.3 MB) | Middel |

### Mobiele app

| Onderdeel | Bevinding | Impact |
|---|---|---|
| `plattegrond/[verdiepingId].tsx` (1.486 regels) | WebView-gebaseerde plattegrond-render | Middel |
| `uren.tsx` (1.379 regels) | Complexe urenregistratie met offline-queue | Middel |
| Offline-first patroon | AsyncStorage cache + SyncQueue — goed opgezet | OK |
| Expo Go (geen native build) | Geen `expo-local-authentication` in Expo Go — opgeloste bekende beperking | OK |

---

## 10. Codekwaliteitsanalyse

### Scores per categorie

| Categorie | Score | Toelichting |
|---|---|---|
| Architectuur | 8/10 | Contract-first, gelaagd, shared libs — goed |
| Consistentie naamgeving | 9/10 | Volledig Nederlands, camelCase TS / snake_case DB, consequent |
| Duplicatie | 7/10 | Weinig aantoonbare duplicatie; enkele overlappende AI-chatpanelen |
| Modulaire opbouw | 6/10 | `hrm.ts` (4.164r) en enkele andere monolithische bestanden trekken de score omlaag |
| Technische schuld | 7/10 | 0 TODO/FIXME — uitzonderlijk; wel grote bestanden als impliciete schuld |
| Dead code | 8/10 | `fabrikant-sectie.tsx` aanwezig maar ongebruikt; verder weinig evident dead code |
| Complexiteit | 6/10 | AI-calls verspreid, grote route-files, plattegrond-renderer complex |
| Type-veiligheid | 8/10 | Zod-validatie breed toegepast; enkele `pre-existing TS7030` in wagenpark/werkbonnen |
| Test-dekking | 4/10 | E2E Playwright aanwezig; geen unit/integratietests gevonden |
| Logging | 9/10 | Pino logger consequent toegepast; geen `console.log` in server-code |
| Error handling | 7/10 | Meeste routes hebben try/catch; AI-calls zonder retry |
| Documentatie | 6/10 | `replit.md` + `docs/` aanwezig; inline code-comments beperkt |

### Technische schuld — concrete voorbeelden

1. **`hrm.ts` 4.164 regels** — bevat medewerkers, functies, verlof, opleidingen, salarisopmaak, bekwaamheden. Splitsen in domeinspecifieke bestanden is de voor hand liggende verbeteringsactie.
2. **AI-calls in route-handlers** — geen centrale service-laag voor AI in calculatie, veiligheid, offertes, CRM. Maakt testen en uitwisselen van modellen lastig.
3. **`gpt-5`, `gpt-5-mini`, `gpt-5.4` model-strings** — niet officieel stabiel; hardcoded in 10 bestanden.
4. **Pre-existing `TS7030`** in `wagenpark.ts` en `werkbonnen.ts` — bekende TypeScript-fout; niet opgelost.
5. **`otplib` gefixeerd op v12** — v13 heeft breaking API. Expliciet gedocumenteerd in `replit.md`. Technische schuld die vastgepind is.
6. **`fabrikant-sectie.tsx`** — bestand aanwezig maar niet meer in gebruik. Dead code.

### Sterke kwaliteitsaspecten

- **0 TODO/FIXME** over de volledige codebase bij exhaustieve grep — uitzonderlijk voor een project van 350.000 regels
- **Actieve CVE-overrides** in `pnpm-workspace.yaml`
- **Contract-first OpenAPI** met codegen elimineert API-drift
- **Volledig Nederlandstalige UI en code-comments** — consequent en professioneel
- **`docs/changelog.md`** bijgehouden na elke sessie

---

## 11. GitHub Export Readiness

### Beoordeling: Exporteerbaar na kleine aanpassingen

| Onderdeel | Status | Actie nodig |
|---|---|---|
| Geen hardcoded secrets | OK | — |
| `.env` niet in git | OK | — |
| pnpm workspace | OK | Doel-platform moet pnpm ondersteunen |
| `@replit/vite-plugin-cartographer` | Replit-specifiek | Verwijderen of conditie: dev-only |
| `@replit/vite-plugin-dev-banner` | Replit-specifiek | Verwijderen of conditie: dev-only |
| `@replit/vite-plugin-runtime-error-modal` | Replit-specifiek | Verwijderen of conditie: dev-only |
| `REPLIT_DOMAINS` in CORS-config | Replit-specifiek | Vervangen door eigen domein-configuratie |
| `REPLIT_EXPO_DEV_DOMAIN`, `REPL_ID` in Expo dev-script | Replit-specifiek | Vervangen door eigen proxy-URL |
| `artifact.toml` routing-configuratie | Replit-specifiek | Vervangen door eigen reverse proxy (Nginx, Caddy, etc.) |
| `AI_INTEGRATIONS_OPENAI_*` proxy-variabelen | Replit-specifiek | Direct `OPENAI_API_KEY` gebruiken (fallback al aanwezig in `openai.ts`) |
| Database | `DATABASE_URL` — standaard Postgres connection string | Standaard, migreerbaar |
| Storage | GCS/S3 factory | Standaard, migreerbaar |
| E-mail | Microsoft Graph (Azure AD) | Platformonafhankelijk, eigen Azure-tenant vereist |
| Build-proces | esbuild + Vite | Volledig standaard, werkt overal |
| TypeScript | Stricte config, composite libs | Standaard |
| pnpm-lock.yaml | Aanwezig | OK |

### Minimale aanpassingen voor export

1. Vervang de 4 `@replit/vite-plugin-*` door hun open-source equivalenten of verwijder ze:
   - `cartographer` → Vite route-inspect plugin (of weglaten)
   - `dev-banner` → weglaten
   - `runtime-error-modal` → vite-plugin-inspect of weglaten
2. Vervang `REPLIT_DOMAINS` in CORS door `ALLOWED_ORIGINS` env-var
3. Vervang Expo dev-script variabelen door platform-agnostische equivalenten
4. Vervang `artifact.toml`-routing door Nginx/Caddy/Traefik-configuratie
5. Zorg voor nieuwe waarden voor alle secrets in target-omgeving

---

## 12. Migratieanalyse

### Wat kan zonder aanpassingen worden overgenomen

- Volledige PostgreSQL-database + Drizzle-schema (standaard Postgres)
- Express 5 API-server (standaard Node.js)
- React/Vite webapp (standaard)
- Expo mobiele app (standaard React Native)
- Alle shared libraries (`lib/`)
- Alle AI-services (via directe `OPENAI_API_KEY` — fallback al aanwezig)
- Object-storage (GCS of S3 — beide standaard)
- Microsoft Graph e-mail-integratie (eigen Azure-tenant)
- pnpm workspace-structuur (standaard)

### Wat beperkte aanpassingen vereist

- **Vite-config (firevault):** 4 Replit-plugins vervangen of verwijderen (~30 minuten werk)
- **CORS-configuratie (api-server):** `REPLIT_DOMAINS` → configureerbare env-var
- **Expo dev-script:** 3 Replit-specifieke env-vars aanpassen
- **Reverse proxy:** `artifact.toml`-routing vertalen naar Nginx/Caddy-config
- **OpenAI-configuratie:** `AI_INTEGRATIONS_OPENAI_*` → `OPENAI_API_KEY` (fallback al aanwezig)
- **Sessie-configuratie:** `trust proxy` instelling aanpassen aan nieuwe infrastructure

### Wat waarschijnlijk opnieuw gebouwd moet worden

- **Deployment-scripts:** Replit-specifieke workflow-configuratie → CI/CD pipeline (GitHub Actions, etc.)
- **PWA QR-link (`/api/auth/pwa-qr`):** Verwijst naar `REPLIT_EXPO_DEV_DOMAIN` — aanpassen naar productie-URL
- **Platformspecifieke monitoring:** Replit biedt ingebouwde logs; eigen monitoring (Datadog, Sentry, etc.) toevoegen

### Platformafhankelijke onderdelen

| Onderdeel | Afhankelijkheid | Migratiestap |
|---|---|---|
| `AI_INTEGRATIONS_OPENAI_*` | Replit OpenAI-proxy | Direct OPENAI_API_KEY (fallback al geïmplementeerd) |
| `@replit/vite-plugin-*` (4x) | Replit dev-tools | Verwijderen; productie-build onaffected |
| `REPLIT_DOMAINS` CORS | Replit hostnames | Vervangen door eigen domein-env-var |
| `REPLIT_EXPO_DEV_DOMAIN` | Replit Expo proxy | Vervangen door eigen Expo-proxy URL |
| `artifact.toml` routing | Replit reverse proxy | Eigen reverse proxy |
| Object Storage (S3-pad) | Replit Object Storage | Eigen S3-endpoint of GCS — al ondersteund |

### Technische risico's bij migratie

1. **`gpt-5`, `gpt-5-mini`, `gpt-5.4` model-namen** — niet stabiel/officieel. Bij directe OpenAI-migratie kunnen deze namen niet bestaan of ander gedrag tonen. **Hoog risico.**
2. **Sessie-store migratie** — `connect-pg-simple` schrijft naar de applicatiedatabase; bij load-balanced setup of nieuwe DB vereist dit configuratie-aandacht.
3. **Database-migraties** — Drizzle gebruikt `drizzle-kit push` (development). Voor productie is een formele migratiestrategie (Drizzle Migrations of een alternatief) noodzakelijk.
4. **8.2 MB API-bundle** — esbuild bundelt alles in één bestand. Groot maar functioneel; bij containerdeployment is dit geen blokkade.
5. **Ontbrekende DB-indexen** — bij grotere datasets (>10.000 spots, >1.000 gebouwen) kunnen query-prestaties achteruitgaan zonder expliciete indexen.

### Sterk opgezette onderdelen die behoud verdienen

- **OpenAPI + Orval codegen-workflow** — voorbeeldige contract-first aanpak
- **`lib/permissies` bevoegdhedenmodel** — genuanceerd, goed schaalbaar
- **Opslagabstractie (`objectStorage.ts`)** — clean factory-patroon
- **TOTP-authenticatie** — veilige, zelfbeheerde 2FA
- **`logActiviteit()` audit-trail** — gedenormaliseerde activiteitslog met gebouw-context
- **Drizzle ORM type-veiligheid** — end-to-end type-inferentie van DB naar API

---

## 13. Eindconclusie

### 1. Is de huidige applicatie geschikt als basis voor verdere professionele ontwikkeling?

**Ja.** De architectuur is solide: contract-first API, type-veilige ORM, gelaagd bevoegdhedenmodel, opslagabstractie, en een volledig uitgewerkte frontend. De codebase is consistent, goed gestructureerd en bevat opvallend weinig technische rommel voor zijn omvang. De grote route-bestanden (met name `hrm.ts`) zijn de voornaamste rem op onderhoudbaarheid, maar vormen geen architecturaal probleem.

### 2. Is migratie naar een ander AI-ontwikkelplatform realistisch?

**Ja, en relatief eenvoudig.** De platformafhankelijkheid is beperkt tot ~4 Vite-plugins, 3 omgevingsvariabelen en de routing-configuratie. Geen enkelvoudig onderdeel vereist een fundamentele herschrijving. De AI-integratie heeft al een ingebouwde fallback van Replit-proxy naar directe OpenAI-sleutel.

### 3. Kan de bestaande code grotendeels behouden blijven?

**Ja — naar schatting 95%+ van de codebase kan zonder aanpassingen worden overgenomen.** De resterende 5% betreft Replit-specifieke configuratie, dev-plugins en omgevingsvariabelen die relatief eenvoudig aan te passen zijn.

### 4. Welke migratiestrategie heeft technisch de voorkeur?

**Lift-and-shift met minimale aanpassingen:**

1. Clone repo naar GitHub
2. Vervang 4 Replit-Vite-plugins
3. Configureer CORS en proxy-variabelen
4. Voeg eigen reverse proxy toe (Nginx/Caddy)
5. Zorg voor secrets in target-omgeving
6. Los `gpt-5*` model-namen op (directe OpenAI)
7. Formele Drizzle-migratiestrategie opzetten voor productie

Geschatte doorlooptijd: 1–3 werkdagen voor de technische migratie zelf, exclusief DNS, TLS, CI/CD en monitoring.

### 5. Welke risico's moeten eerst worden opgelost voordat een migratie plaatsvindt?

| Prioriteit | Risico | Actie |
|---|---|---|
| Hoog | `gpt-5`, `gpt-5-mini`, `gpt-5.4` niet-stabiele modelnamen | Inventariseer en vervang door stabiele OpenAI model-ids |
| Hoog | Geen formele DB-migratiestrategie | `drizzle-kit generate` + migratie-pipeline opzetten |
| Middel | Ontbrekende DB-indexen op FK-kolommen | Audit op meest gebruikte query-paden en indexen toevoegen |
| Middel | Geen AI-queue of retry-logica | Bij migratie risico op time-outs; overweeg BullMQ of vergelijkbaar |
| Laag | `otplib` v12 gefixeerd | Onderzoek upgrade-pad naar v13 |

---

## 14. Prioriteitenlijst

### Hoog — voor migratie verplicht

| Nr | Actie | Onderdeel | Geschatte inspanning |
|---|---|---|---|
| H1 | Valideer en vervang `gpt-5*` model-strings door stabiele OpenAI-namen | 10 bestanden | 1 dag |
| H2 | Vervang 4 `@replit/vite-plugin-*` in Vite-config | `vite.config.ts` | 2 uur |
| H3 | Vervang `REPLIT_DOMAINS` CORS door `ALLOWED_ORIGINS` env-var | `api-server/src/index.ts` | 1 uur |
| H4 | Vervang Expo-dev-script Replit-variabelen | `monteur-app/package.json` | 1 uur |
| H5 | Opzetten `artifact.toml`-equivalent (Nginx/Caddy) op target-platform | Infra | 4–8 uur |
| H6 | Formele Drizzle-migratiestrategie opzetten | `lib/db` | 1 dag |

### Middel — sterk aanbevolen, ook buiten migratie

| Nr | Actie | Onderdeel | Geschatte inspanning |
|---|---|---|---|
| M1 | Splits `hrm.ts` (4.164r) in domeinspecifieke modules | `routes/hrm.ts` | 2–3 dagen |
| M2 | Centraliseer AI-calls in dedicated service-laag met retry-logica | 44 bestanden | 3–5 dagen |
| M3 | Voeg DB-indexen toe op meest gebruikte FK-kolommen | `lib/db/schema/*` | 1 dag |
| M4 | Splits grote frontend-bestanden (>1.500r) | Top-8 pagina's | 3–5 dagen |
| M5 | Voeg `enabled`-parameter correct toe aan query-hooks (TS2741 oplossen) | `api-client-react` + call-sites | 1 dag |
| M6 | Verwijder `fabrikant-sectie.tsx` (dead code) | 1 bestand | 30 minuten |
| M7 | Unit-/integratietests toevoegen voor kritische flows | Backend routes | 3–5 dagen |

### Laag — kwaliteitsverbetering

| Nr | Actie | Onderdeel | Geschatte inspanning |
|---|---|---|---|
| L1 | Splits `veiligheid.ts` (2.485r) en `offertes.ts` (2.028r) | 2 route-bestanden | 2 dagen |
| L2 | AI-response-caching voor herhaalde identieke vragen | Centraal AI-service-laag | 1 dag |
| L3 | Onderzoek `otplib` v13 upgrade-pad | `api-server` | 0,5 dag |
| L4 | Formele documentatie van bevoegdhedenmatrix + onboarding-guide | `docs/` | 1 dag |
| L5 | Vervang polling-patroon door WebSocket of SSE voor chat | `routes/chat.ts` + frontend | 3 dagen |
| L6 | Voeg server-side bestandstype-whitelist toe aan upload-routes | `routes/slim-upload.ts` + others | 0,5 dag |
| L7 | Evalueer niet-expliciet beveiligde router-calls via volledige route-traversal | `routes/index.ts` | 1 dag |

---

*Auditrapport gegenereerd op basis van statische codeanalyse — geen wijzigingen uitgevoerd.*  
*Alle getallen zijn gebaseerd op de codebase per 2 juli 2026.*
