# FPS Connect — Statusanalyse en Heroriëntatie

**Datum:** 28 juli 2026
**Methode:** Directe inspectie van de actuele broncode (github.com/vinkrene-jpg/fps-one, commit `cf4d715`, 25 juli 2026) plus verificatie van bestaande projectdocumentatie tegen die code. Geen aannames, geen Replit-rapportage als bron — alles hieronder is zelf nagelezen in bestanden, schema's en routes.

---

## 1. Kernconclusie vooraf

FPS Connect heeft, in tegenstelling tot Sparki, **al een aanzienlijke hoeveelheid governance-documentatie**: `kwaliteitskader.md`, `ontwikkelfilosofie.md`, `architectuur.md`, `PROJECT_STATUS.md`, `technische-schuld.md` (Top 100), `PRODUCTION_RUNBOOK.md`, en een roadmap met expliciete Gebouwd/Actief/Parallel/Geparkeerd-indeling. Dit is geen ongestructureerd project. De problemen die zijn opgetreden zitten niet in een gebrek aan documentatie, maar in:

1. **Drift tussen documentatie en werkelijkheid** — meerdere keren gevonden dat een document een oplossing meldt die niet (meer) klopt met de live situatie (zie §5).
2. **Losse eindjes die niet aan elkaar geknoopt zijn** — functionaliteit bestaat, maar de verbinding ertussen ontbreekt (zie §4, medewerker-onboarding).
3. **Twee databronnen voor hetzelfde gegeven** — parallelle velden/tabellen die uiteen kunnen lopen (zie §5).

---

## 2. Architectuur — huidige structuur

**Stack:** pnpm workspaces, Node.js 24, TypeScript 5.9, React + Vite (frontend), Express 5 (backend), PostgreSQL + Drizzle ORM, Zod v4, contract-first via OpenAPI (`lib/api-spec/openapi.yaml` is bron van waarheid, codegen genereert Zod-schema's en React Query-hooks).

**Centrale entiteit:** `gebouw` (building) — bijna alle modules hangen aan een `gebouw_id`. Platformbrede tabellen zonder gebouw-FK: `gebruikers`, `werkgevers`, `medewerkers`, `opleidingen`, `gereedschappen`, `chat_gesprekken`, `backups`, `abonnementen`.

**Modulestructuur:** één routebestand per module in `artifacts/api-server/src/routes/`, één pagina-map per module in `artifacts/firevault/src/pages/`. Drielaags bevoegdhedenpatroon (backend `requireBevoegdheid`, frontend `useBevoegdheid`) is consistent toegepast en gedocumenteerd met een concrete checklist voor nieuwe modules (`architectuur.md §5c`).

**Bekende, al gedocumenteerde architectuurconflicten (nog niet allemaal opgelost):**

| # | Probleem | Status |
|---|---|---|
| 3a | Dubbele portal-definitie (`BeheerderPortal`/`PermissiePortal`, ~60 dubbele routes) | ✅ Opgelost — samengevoegd tot `ConnectPortal` |
| 3b | Orphaned `/connect/`-routes naast opvolgers | ✅ Opgelost — redirects |
| 3c | **Twee calculatie-API's** (`/api/calculaties` legacy naast `/api/modules/calculaties`) | ❌ Open — legacy blijft actief zolang `pages/connect/calculatie.tsx` ernaar verwijst |
| 3d | Inconsistente API-padnaamgeving (enkelvoud/meervoud/module-prefix door elkaar) | ❌ Open — geaccepteerd risico, geen breaking change gewenst |
| 3e | Planning-module als "data-eiland" (985 + 1252 regels clientside state/filtering) | ❌ Open |

---

## 3. Deploymentrealiteit (rechtstreeks geverifieerd, niet aangenomen)

- **Twee omgevingen, geen drie:** Replit dev/test en de VPS-productie (`connect.fps-one.nl`). Er is geen aparte staging-omgeving.
- **Replit autoscale-deployment is uitgeschakeld.** Replit dient uitsluitend als ontwikkelomgeving.
- **Automatische deploy-keten:** Agent-merge in Replit → `scripts/post-merge.sh` → push naar GitHub `main` → GitHub Actions (`deploy.yml`) → VPS bouwt en herstart binnen 10–15 minuten. **Geen menselijke goedkeuringsstap.** Dit is een bewust, gedateerd besluit (10 juli 2026): productie fungeert momenteel zelf als acceptatieomgeving.
- GitHub is bevestigd de source of truth voor productiecode (niet Replit's eigen deployment-mechanisme).
- Rollback-procedure bestaat (`deploy/ROLLBACK_PRODUCTION.md`), evenals een dagelijkse backup-leeftijd/integriteitscheck (`deploy/check-backup.sh`) en een dagelijkse GitHub-token-health-check met e-mailwaarschuwing.

**Risico van dit model:** elke opdracht die als "klaar" wordt gemeld staat vrijwel direct live op kantoor. Hier is inmiddels een apart document voor opgesteld (`docs/OMGEVINGSBEWUSTZIJN.md`, deze sessie), dat referentieplicht is naast `kwaliteitskader.md` en `ontwikkelfilosofie.md`.

---

## 4. Functionaliteit — gebouwd, gedeeltelijk, ontbrekend

Uit `docs/PROJECT_STATUS.md`, geverifieerd waar mogelijk:

**Volledig gebouwd (100%):** Gebouwenbeheer, Spots & Uitvoering, Plattegronden, Bibliotheek & Documenten, DMS, Inspecties, Onderhoud, Rollen & Bevoegdheden, AI Spotherkenning, AI Bibliotheekvalidatie, HRM/Personeel (Fase 1-basis), Dossiermodule (Fase 1-basis), Offerte Intelligence (Fase 1-basis), Planning (week-grid V1), Communicatie/Berichten.

**Gedeeltelijk:** Document Design System (70%), V1.4 Opleverrapportage inmiddels gebouwd volgens `roadmap/actief.md` (was 60%, nu afgerond incl. bevriezing en reactietermijn-statusmachine, 8 juli 2026).

**Concreet gat, zelf gevonden en niet in de bestaande status-documenten benoemd:** het aanmaken van een gebruikersaccount triggert **niet** automatisch het starten van medewerker-onboarding. Er ligt al een specificatie voor de gewenste oplossing (drieledige keuze bij gebruikersaanmaak), maar deze is nooit geïmplementeerd — bevestigd door de daadwerkelijke `POST /gebruikers`-route te lezen. Instructie hiervoor is deze sessie al opgesteld en klaargezet.

**Geparkeerd (bewust, met formeel akkoord):** V2.0 mobiele monteurflow (volledig), V3.0 HRM/medewerkerportaal, CRM volledig, S.G. Constructies, Fase 2 Bedrijfsbesturing.

---

## 5. Technische schuld en data-trust — zelf geverifieerd, niet alleen overgenomen

Er bestaat al een Top-100-lijst (`technische-schuld.md`, 3 juli 2026). Steekproef tegen de huidige code:

| Item | Lijst zegt | Werkelijkheid (nu geverifieerd) |
|---|---|---|
| #14 Dossier-bevriezing niet atomair | Open, P1 | ✅ **Inmiddels opgelost** — draait in `db.transaction()` |
| #1–7 Ontbrekende indexen (voorzieningen, activiteiten, inspecties, onderhoud, chat, documenten) | Open, P1 | ❌ **Nog steeds open, bevestigd** — patroon wordt elders wel toegepast (audit, gebruikers, financieel) maar niet op deze tabellen |
| #24 Geen rate-limiting op `/auth/*` | Open, P1 | ❌ **Nog steeds open, bevestigd** — geen `express-rate-limit` of vergelijkbaar in het hele project |

**Nieuw gevonden, niet op de bestaande lijst:**

- **`dienstverband` bestaat dubbel** — op `gebruikers` (default `"intern"`) én op `medewerkers` (default `"vast"`), met verschillende waardensets. Twee bronnen van waarheid voor hetzelfde gegeven; risico op drift.
- **`CONNECT_AI_ENABLED`-regressierisico.** Deze vlag stond eerder al eens structureel `false` op productie (`.env.production`, niet in git), waardoor de echte Document Intelligence-AI nooit draaide en alles op een zwakke bestandsnaam-heuristiek terugviel. Dit is destijds gevonden en gefixt, maar omdat het bestand buiten versiebeheer valt kan het onopgemerkt terugkeren. Verificatie-opdracht is deze sessie al klaargezet, resultaat nog niet binnen.
- **Geen extern error-monitoring/APM** (geen Sentry of vergelijkbaar) — wel nette gestructureerde logging (`pino`, met redactie van auth-headers/cookies), maar fouten worden alleen zichtbaar via logs, niet proactief gemeld.
- **Geen achtergrondtaken/cron-systeem aanwezig** — bewuste keuze waar mogelijk (bijv. reactietermijn-status wordt bij lezen afgeleid, niet via worker), maar betekent ook dat er geen centrale plek is voor toekomstige geplande taken (bijv. periodieke opschoning, herinneringen).

---

## 6. Productierisico's — samengevat

**Kritiek (nodig vóór verdere uitbreiding, niet later):**
1. Rate-limiting op `/auth/*` — brute-force op TOTP/wachtwoord is nu mogelijk op een systeem dat al live is.
2. Bevestigen dat `CONNECT_AI_ENABLED` en de OpenAI-sleutel op productie nu daadwerkelijk actief zijn (in verificatie).
3. Ontbrekende indexen op de zes/zeven genoemde tabellen — volledige table scans bij groeiende data op kantoor.

**Belangrijk (voor een professionele bedrijfsapp):**
4. Extern error-monitoring/alerting toevoegen — nu volledig afhankelijk van handmatig loggen bekijken.
5. Twee calculatie-API's samenvoegen zodra de legacy-pagina is uitgefaseerd.
6. Dubbel `dienstverband`-veld consolideren tot één bron van waarheid.
7. Medewerker-onboarding koppelen aan gebruikersaanmaak (instructie al klaargezet).

**Later:**
8. Planning-module herstructureren (data-eiland afbouwen richting server-side filtering).
9. API-padnaamgeving consistent maken (alleen bij nieuwe routes, niet retroactief).

---

## 7. Aanbevolen bouwvolgorde

1. **Verificatie-uitkomsten afwachten** van de reeds ingestuurde opdrachten (omgevingsdocument, rate-limiting, indexen, `CONNECT_AI_ENABLED`-check) — geen nieuwe taken bovenop bouwen vóór deze bevestigd zijn.
2. Medewerker-onboarding-koppeling (al klaargezet) — sluit een concreet, gebruikersgericht gat.
3. Dubbel `dienstverband`-veld consolideren — klein, geïsoleerd, voorkomt toekomstige inconsistentie.
4. Extern error-monitoring toevoegen — vergroot zichtbaarheid vóór er meer bedrijven/gebruikers op het platform komen.
5. Pas daarna: legacy calculatie-API uitfaseren en planning-module herstructureren — grotere, risicovollere taken die een stabiele basis vereisen.

Elke stap: klein, geïsoleerd, met de Definition of Done uit `kwaliteitskader.md`, en onafhankelijk geverifieerd tegen de daadwerkelijke commit vóórdat de volgende stap start — niet op basis van een "klaar"-melding alleen.
