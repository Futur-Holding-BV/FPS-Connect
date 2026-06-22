# FPS Connect — Architectuuroverzicht

> Opgesteld juni 2026. Doel: veilig fundament voor zelfstandige module-uitbreiding.

---

## 1. Huidige architectuur

### Monorepo-structuur

```
fps-connect/
├── artifacts/
│   ├── api-server/          Expressbackend (poort 8080, pad /api)
│   ├── firevault/           FPS Connect webapp (React + Vite)
│   ├── monteur-app/         FPS Monteur mobiele app (Expo)
│   └── mockup-sandbox/      UI-prototyping (alleen dev)
├── lib/
│   ├── db/                  PostgreSQL-schema (Drizzle ORM, bron van waarheid)
│   ├── api-spec/            OpenAPI YAML (bron van waarheid voor API-contract)
│   ├── api-zod/             Gegenereerde Zod-schema's (nooit handmatig bewerken)
│   ├── api-client-react/    Gegenereerde React Query-hooks (nooit handmatig bewerken)
│   ├── permissies/          Gedeelde rol/bevoegdhedenlogica
│   └── object-storage-web/  Bestandsupload hulpfuncties
├── scripts/                 Kwaliteitscontrole, e2e-tests, seedscripts
└── docs/                    Roadmap, architectuur (dit bestand)
```

### Aanvraag-stroom

```
Browser / Expo-app
      │
      ▼
Shared reverse proxy (poort 80)
      │ pad /api/*
      ▼
api-server (Express, poort 8080)
      │ requireAuth middleware
      │ requireBevoegdheid(module, niveau)
      ▼
Route handler → Drizzle ORM → PostgreSQL
```

### Gedeeld type-systeem

```
lib/db schema  ──────►  lib/api-spec (OpenAPI YAML)
                              │
                      pnpm run codegen
                         ┌────┴────┐
                         ▼         ▼
                    api-zod     api-client-react
                  (Zod schemas) (React Query hooks)
                         │         │
                    api-server  firevault / monteur-app
                    (validatie)  (data fetching)
```

Codegen uitvoeren na elke OpenAPI-wijziging:
```
pnpm --filter @workspace/api-spec run codegen
```

---

## 2. Centrale entiteit: Gebouw

Alle inhoudelijke modules koppelen terug naar **één gebouw**. `gebouwen` is de
centrale entiteit. Elke module die gebouwgebonden data opslaat, heeft een
`gebouw_id` FK (camelCase `gebouwId` in Drizzle, snake_case `gebouw_id` in API).

### Tabellen met directe gebouw-FK

| Tabel | Module | Relatie |
|---|---|---|
| `verdiepingen` | Gebouwen | 1:N |
| `voorzieningen` | Spots | N:1 |
| `inspecties` | Inspecties | N:1 |
| `onderhoud_werkorders` | Onderhoud | N:1 |
| `documenten` | Documenten | N:1 (polymorf) |
| `dossiers` | Dossiers | N:1 |
| `rapporten` | Rapporten | N:1 |
| `opnames` | Opname | N:1 |
| `calculaties` | Calculaties | N:1 |
| `mod_calc_headers` | Module Calculatie | N:1 |
| `offertes` | Offertes | N:1 |
| `gebouw_toewijzingen` | Toegangsbeheer | N:1 |
| `gebouw_partijen` | Relaties | N:1 |

### Tabellen zonder gebouw-FK (platformbreed)

`gebruikers`, `werkgevers`, `medewerkers`, `opleidingen`, `gereedschappen`,
`chat_gesprekken`, `toolbox_berichten`, `backups`, `abonnementen`

---

## 3. Conflicten en dubbele structuren

### 3a. Opgelost: dubbele portal-definitie in App.tsx

**Probleem (was):** `BeheerderPortal` en `PermissiePortal` bevatten exact
dezelfde ~60 routes, waardoor elke nieuwe route op twee plekken moest worden
toegevoegd. Bovendien ontbrak `/hall-of-fame` in `PermissiePortal` — een stille
bug.

**Oplossing (nu):** Eén `ConnectPortal` component. `AdaptieveDashboard`
selecteert het juiste dashboard op basis van rol/bevoegdheden. Portalkeuze
via `Portalen()`:

```
hoofdbeheerder / beheerder  →  ConnectPortal
gebruiker (met bevoegdheden) →  ConnectPortal
gebruiker (geen bevoegdheden) → GeenToegang
klant                         →  KlantPortal
monteur / controleur (legacy) →  MonteurPortal
```

### 3b. Opgelost: orphaned /connect/-routes

**Probleem (was):** Drie routes bestonden parallel aan hun opvolgers:
- `/connect/calculatie` naast `/modules/calculatie`
- `/connect/planning` naast `/modules/planning`
- `/connect/hrm` naast `/personeel`

**Oplossing (nu):** Expliciete `<Redirect>` routes zodat oude links niet
stilletjes 404'en maar doorsturen naar de geconsolideerde paden.

### 3c. Openstaand: twee calculatie-API's

**Probleem (blijft):** Twee afzonderlijke calculatie-implementaties:

| Route | Bestand | Gebruik |
|---|---|---|
| `GET /api/calculaties` | `routes/calculaties.ts` | Legacy, eenvoudige begrotingsregels |
| `GET /api/modules/calculaties` | `routes/mod-calculatie.ts` | Rijker model met tarieven + normtijden |

De legacy calculatie-API is nog actief omdat `pages/connect/calculatie.tsx` er gebruik
van maakt. Migratiestrategie: wanneer de Connect-calculatiepagina volledig naar
`/modules/calculatie` is overgegaan, kan `/api/calculaties` worden verwijderd.

### 3d. Openstaand: inconsistente API-padnaamgeving

Huidige patronen door elkaar:
- Meervoud: `/gebouwen`, `/voorzieningen`, `/calculaties`
- Enkelvoud: `/opname`, `/dashboard`, `/systeem`
- Module-prefix: `/modules/calculaties`, `/modules/planning`

Aanbeveling: meervoud als standaard voor resource-collections. Bij nieuwe
routes altijd meervoud gebruiken. Bestaande routes niet omnoemen (breaking change).

### 3e. Openstaand: planning als groot data-eiland

`pages/modules/planning/index.tsx` (985 regels) en
`pages/connect/planning.tsx` (1252 regels) bevatten elk hun eigen
datafiltering en state-management. Ze gebruiken de gegenereerde hooks, maar
voeren zware clientside-transformaties uit die idealiter in de API afgehandeld
worden.

---

## 4. Definitieve mappenstructuur

### 4a. Frontend — `artifacts/firevault/src/`

```
src/
├── App.tsx                     Routeregistratie, portalkeuze
├── context/                    Auth, Rol, Achievement, Taal
├── hooks/                      Gedeelde hooks (useBevoegdheid, useGebouwId, ...)
├── lib/                        Hulpfuncties, feature-flags, module-foundation
├── layouts/                    BeheerderLayout, MonteurLayout, KlantLayout
├── components/
│   ├── ui/                     shadcn/ui basiscomponenten
│   └── [gedeelde domeincomponenten]
└── pages/
    ├── auth/                   Login, wachtwoord-vergeten, -reset
    ├── uitnodiging/            Accountactivatie
    ├── dashboard/              beheerder, monteur, klant
    ├── gebouwen/               index, detail, plattegrond, print
    ├── voorzieningen/          index, detail, nieuw, qr
    ├── inspecties/             index, detail
    ├── onderhoud/              index
    ├── opname/                 index, detail
    ├── rapporten/              index
    ├── documenten/             index
    ├── dossiers/               index
    ├── modules/
    │   ├── calculatie/         index, nieuw, detail
    │   └── planning/           index, medewerkers, afwezigheid
    ├── personeel/              index, detail
    ├── gereedschappen/         index, detail
    ├── uren/                   index, weekstaten
    ├── hall-of-fame/           (pagina-bestand)
    ├── berichten/              index
    ├── toolbox/                index
    ├── crm/                    index, detail
    ├── offertes/               index
    ├── one/                    dashboard, gebouwen, documenten, rapporten, abonnementen
    ├── klant/                  rapportages
    ├── beheer/                 toepassingen, bibliotheek, login-pogingen, ...
    ├── abonnementen/           index
    ├── info/                   index
    └── [geen /connect/ meer]   (deprecated pad, redirects in App.tsx)
```

**Regels:**
- Elke module heeft een eigen map onder `pages/`
- Subpagina's leven in de map van de bovenliggende route
- Geen geneste `modules/` prefix voor nieuwe modules — direct op `pages/`-niveau
- `connect/` als prefix is verouderd — gebruik alleen `modules/` of top-niveau

### 4b. Backend — `artifacts/api-server/src/routes/`

Elke module heeft één routebestand. Naamgeving: meervoud, kebab-case.

```
routes/
├── index.ts           Aggregeert alle routers, past requireAuth toe
├── health.ts          Publiek
├── auth.ts            Publiek
├── uitnodiging.ts     Publiek
├── dashboard.ts
├── gebouwen.ts        Centrale entiteit — bevat ook verdiepingen, plattegrond
├── voorzieningen.ts   Spots
├── classificatie.ts   Spot-typen (referentiedata)
├── fabrikanten.ts     Fabrikanten (referentiedata)
├── inspecties.ts
├── onderhoud.ts
├── opname.ts          Veldopname (CWU-instap)
├── calculaties.ts     [legacy — te migreren naar mod-calculatie]
├── mod-calculatie.ts  Calculatiemodule
├── rapporten.ts
├── documenten.ts
├── dossiers.ts
├── planning-module.ts
├── offertes.ts
├── projecten.ts
├── constructie-templates.ts
├── hrm.ts
├── personeel → hrm.ts (HRM-module bevat personeel)
├── gereedschappen.ts
├── uren.ts
├── mijn-werk.ts       Mobiel: werkdag-overzicht
├── werkdag.ts
├── toolbox.ts
├── berichten → chat.ts
├── chat.ts
├── crm.ts
├── gebruikers.ts
├── profielen.ts       Bevoegdhedenprofielen
├── abonnementen.ts
├── storage.ts         Bestandsopslag proxy
├── emails.ts
├── mail.ts
├── backups.ts
├── achievements.ts
├── systeem.ts
└── info.ts
```

### 4c. Database — `lib/db/src/schema/`

Eén bestand per domein. Centrale entiteiten bovenaan `index.ts` exporteren.

---

## 5. Technische basis voor module-uitbreiding

### 5a. Bevoegdhedenpatroon

Elke module gebruikt het drielaagse patroon:

**Backend (route handler):**
```typescript
// Minimumniveau: 1=lezen, 2=schrijven, 3=aanmaken, 4=verwijderen
const lezenModule  = requireBevoegdheid("module_naam", 1);
const schrijvenModule = requireBevoegdheid("module_naam", 2);

router.get("/module-naam",       lezenModule,    listHandler);
router.post("/module-naam",      schrijvenModule, createHandler);
router.patch("/module-naam/:id", schrijvenModule, updateHandler);
```

**Frontend (hook):**
```typescript
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";

function MijnModulePagina() {
  const { heeftNiveau } = useBevoegdheid();
  const kanSchrijven = heeftNiveau("module_naam", 2);
  // ...
}
```

**Bevoegdheden-sleutels (bestaand):**

| Sleutel | Module |
|---|---|
| `gebouwen` | Gebouwenbeheer |
| `voorzieningen` | Spots |
| `inspecties` | Inspecties |
| `onderhoud` | Onderhoud |
| `documenten` | Documenten |
| `dossiers` | Dossiers |
| `planning` | Planning |
| `calculaties` | Calculatie |
| `rapporten` | Rapporten |
| `hrm` | HRM |
| `personeel` | Personeelsbeheer |
| `crm` | Relaties |
| `offertes` | Offertes |
| `gebruikers` | Gebruikersbeheer |

Bij elke nieuwe module: voeg de sleutel toe aan `lib/permissies/src/index.ts`
(type) en aan de Bevoegdheden-beheerder-UI (`/beheer/profielen`).

### 5b. Gebouw-ID patroon

Elke module die gebouwgebonden data toont, gebruikt `useGebouwId()`:

```typescript
// artifacts/firevault/src/hooks/use-gebouw-id.ts
import { useParams } from "wouter";

export function useGebouwId(): number | null {
  const params = useParams<{ id?: string; gebouwId?: string }>();
  const raw = params.id ?? params.gebouwId;
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return isNaN(n) ? null : n;
}
```

Gebruik:
```typescript
function MijnModulePagina() {
  const gebouwId = useGebouwId();
  const { data } = useListMijnModuleItems(
    gebouwId ? { gebouw_id: gebouwId } : skipToken
  );
}
```

### 5c. Nieuwe module toevoegen — checklist

Een nieuwe module is klaar als alle stappen zijn doorlopen:

#### Stap 1 — DB schema
- [ ] Bestand aanmaken in `lib/db/src/schema/<module>.ts`
- [ ] Export toevoegen aan `lib/db/src/schema/index.ts`
- [ ] Schema pushen: `pnpm --filter @workspace/db run push`

#### Stap 2 — API contract
- [ ] Schemas en paden toevoegen aan `lib/api-spec/openapi.yaml`
  - Meervoud voor resource-collections (`/mijn-modules`)
  - `gebouw_id` als query-parameter bij gebouwgebonden resources
- [ ] Codegen uitvoeren: `pnpm --filter @workspace/api-spec run codegen`

#### Stap 3 — Backend
- [ ] `artifacts/api-server/src/routes/<module>.ts` aanmaken
  - `requireBevoegdheid("<module>", niveau)` per endpoint
  - `magBijGebouw()` gebruiken voor object-level toegangscontrole
- [ ] Router registreren in `artifacts/api-server/src/routes/index.ts`

#### Stap 4 — Frontend
- [ ] Pagina aanmaken in `artifacts/firevault/src/pages/<module>/`
- [ ] Route toevoegen aan `ConnectPortal` in `App.tsx` (één plek)
- [ ] Nav-item toevoegen in `artifacts/firevault/src/layouts/beheerder-layout.tsx`
- [ ] Bevoegdhedencheck via `useBevoegdheid()` in de pagina

#### Stap 5 — Bevoegdheden
- [ ] Sleutel toevoegen aan `lib/permissies/src/index.ts`
- [ ] Sleutel zichtbaar maken in profielen-beheer

#### Stap 6 — Kwaliteitscontrole
- [ ] `pnpm run typecheck` — geen nieuwe fouten
- [ ] Seed data aanmaken als de module een lege staat heeft (zie HRM gotcha)

### 5d. Mobiele module toevoegen — aanvullende stappen

- [ ] Schermen aanmaken in `artifacts/monteur-app/app/<module>/`
- [ ] Route registreren in `artifacts/monteur-app/app/_layout.tsx`
- [ ] Menu-item toevoegen in `artifacts/monteur-app/app/menu.tsx` (met sleutel + icoon)
- [ ] Bearer-auth: API-aanroepen via `getApiUrl()` helper (geen root-relative paden)
- [ ] Expo typed routes regenereren na nieuw routebestand: herstart expo-workflow

### 5e. Contract-first werkwijze

De OpenAPI spec is **altijd leidend**. Volgorde bij elke API-wijziging:

```
1. Wijzig lib/api-spec/openapi.yaml
2. pnpm --filter @workspace/api-spec run codegen
3. Pas route handler aan op de gegenereerde Zod-schema's
4. Pas frontend aan op de gegenereerde hooks
```

Nooit de gegenereerde bestanden in `lib/api-zod/` of `lib/api-client-react/`
handmatig bewerken — ze worden overschreven bij de volgende codegen.

---

## Bijlage: Bekende gotchas

| Onderwerp | Gotcha |
|---|---|
| Legacy rollen | `"beheerder"`, `"monteur"`, `"controleur"` zitten nog in de DB; cast naar `string` bij vergelijking in `Portalen()` |
| otplib versie | Blijft op v12 — v13 breekt de esbuild-bundle (andere API, geen `authenticator`-export) |
| Sessiecookie | `SameSite=None; Secure` — testen via `https://$REPLIT_DEV_DOMAIN`, nooit via `http://localhost` |
| Bearer vs sessie | Mobiel gebruikt HMAC bearer token, nooit sessiecookies. Bearerpad mag NIET door `connect-pg-simple` sessionMiddleware |
| DB push | `pnpm --filter @workspace/db run push` faalt op TTY — additieve kolommen via directe `ALTER TABLE` SQL |
| Codegen na OpenAPI | Altijd uitvoeren na elke YAML-wijziging, anders stale hooks |
| Orval `enabled` | `{ query: { enabled } }` geeft TS2741 — gate op UI-niveau, niet op hook-niveau |
| HRM lege catalogi | Functies/opleidingen zijn user-managed, niet geseed — geef empty-state, geen nep-data |
| Planning data-eiland | `modules/planning` is een groot lokaal-state component — afbouwen richting server-side filtering |
