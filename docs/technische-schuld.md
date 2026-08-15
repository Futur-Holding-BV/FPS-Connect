# Technische Schuld — FPS Connect (Top 100)

**Datum:** 3 juli 2026 (opgesteld) · samenvattingstabel herrekend 10 augustus 2026  
**Methode:** Statische analyse, codebase-scan, runtime-patronen.  
**Kolommen:** Impact (1–5), Risico (1–5), Oplostijd (uren), Prioriteit (P1–P4)

> P1 = Nu. P2 = Binnen sprint. P3 = Volgende kwartaal. P4 = Backlog.

---

## Categorie A — Database & Persistentie

| # | Item | Impact | Risico | Uren | Prio |
|---|------|--------|--------|------|------|
| 1 | Geen index op `voorzieningen.gebouw_id` — opgelost: `voorzieningen_gebouw_idx` (geverifieerd 7 aug 2026) | 5 | 4 | 0 | ✅ |
| 2 | Geen index op `activiteiten.gebouw_id` + `aangemaakt_op` — opgelost: `activiteiten_gebouw_tijdstip_idx` (geverifieerd 7 aug 2026) | 5 | 4 | 0 | ✅ |
| 3 | Geen index op `inspecties.gebouw_id` + `type` — opgelost: `inspecties_gebouw_type_idx` (geverifieerd 7 aug 2026) | 4 | 4 | 0 | ✅ |
| 4 | Geen index op `onderhoud` + status + deadline — opgelost: `onderhoud_gebouw_status_deadline_idx` (geverifieerd 7 aug 2026) | 5 | 4 | 0 | ✅ |
| 5 | Geen index op `chat_berichten.gesprek_id` — opgelost: `chat_berichten_gesprek_aangemaakt_idx` (geverifieerd 7 aug 2026) | 5 | 5 | 0 | ✅ |
| 6 | Geen index op `document_koppelingen` — opgelost: `document_koppelingen_doel_idx` (geverifieerd 7 aug 2026) | 4 | 4 | 0 | ✅ |
| 7 | Index entiteit_type+entiteit_id — opgelost 7 aug 2026 via migratie 0005 (eerste testmigratie SCHEMA_01). NB: `documenten` heeft deze kolommen niet (DMS koppelt via het al geïndexeerde document_koppelingen); de ongeïndexeerde tabel was `compliance_signalen` → `compliance_signalen_entiteit_idx` | 4 | 4 | 0 | ✅ |
| 8 | Geen index op `dossiers.gebouw_id` + `status` | 3 | 3 | 1 | P2 |
| 9 | Geen index op `verlof_aanvragen.medewerker_id` + `status` | 3 | 3 | 1 | P2 |
| 10 | Geen index op `uren.medewerker_id` + `week_start` | 3 | 3 | 1 | P2 |
| 11 | Geen index op `werkbonnen.opdracht_id` + `status` | 3 | 3 | 1 | P2 |
| 12 | Geen index op `fotos.voorziening_id` (N+1-fotoqueries) | 4 | 3 | 1 | P2 |
| 13 | Multi-table routes zonder transactie — opgelost 7 aug 2026. Inventarisatie: geen 15 maar 8 échte gevallen (regie-voorwaarden PUT; brandstof-import upload/regel-PATCH/laden; veiligheid-toolbox POST/PATCH/ai-analyse; wagenpark-sync per voertuig). Alle 8 onder `db.transaction()` gebracht. Steekproef-gedragsbewijs: geforceerde vragen-insert-fout op toolbox-create → 500 zonder achtergebleven toolbox-rij; happypad 201 | 5 | 4 | 0 | ✅ |
| 14 | Dossier-bevriezing niet atomair — opgelost: draait in `db.transaction()` (geverifieerd 7 aug 2026) | 5 | 5 | 0 | ✅ |
| 15 | maak-opdracht in transactie — opgelost 7 aug 2026: opdracht + werkbegroting + regels + totalen in één db.transaction. Bewijs: scripts/src/bewijs-transacties-15-16.ts (geforceerde begroting-fout → 500 zonder halve opdracht-rij; daarna happypad 201) | 4 | 4 | 0 | ✅ |
| 16 | verlofgoedkeuring saldo-transactie — was al gedekt: WorkflowEngine draait status+saldo (row-lock)+auditlog in één transactie. Gedragsbewijs 7 aug 2026 via scripts/src/bewijs-transacties-15-16.ts (geforceerde saldo-fout → status blijft 'aangevraagd'; happypad saldo 40→32 + logregel) | 4 | 4 | 0 | ✅ |
| 17 | List-endpoints zonder `LIMIT` — 12 endpoints geven onbeperkt veel rijen terug | 4 | 3 | 8 | P2 |
| 18 | `GET /activiteiten` geen paginering — bij grote datasets OOM-risico | 4 | 3 | 2 | P2 |
| 19 | `JSONB`-kolom `bevoegdheden` nooit geïndexeerd als gefilterd | 3 | 2 | 1 | P3 |
| 20 | DB-push faalt op additieve UNIQUE (bekende workaround: directe ALTER SQL) — niet gedocumenteerd | 3 | 3 | 2 | P2 |

---

## Categorie B — Beveiliging & Autorisatie

| # | Item | Impact | Risico | Uren | Prio |
|---|------|--------|--------|------|------|
| 21 | DB-foutberichten lekten naar client — opgelost 7 aug 2026: `veiligeFoutmelding()` scrubt DB-details op alle 15 gevonden lekpunten (backups, security-validation, magazijn, facturen, import, wagenpark); rest valt onder centrale handler (#36) | 5 | 4 | 0 | ✅ |
| 22 | Ruwe `constraint`-namen in 409-responses zichtbaar voor client | 3 | 2 | 4 | P2 |
| 23 | `magBijGebouw(userId, ...)` in 3 routes ondersteunde geen impersonatie — nu opgelost (Task #180) | 4 | 3 | 0 | ✅ |
| 24 | Rate-limiting op `/auth/*` — opgelost (limiters bestonden al: 5/15min per IP+account, 50/15min per IP, 3/uur wachtwoordroutes; account-lockout na 5 fouten). 7 aug 2026 aangevuld: elke blokkade wordt gelogd (WARN met ip+e-mail+limiter). Bewijs: 6e foute poging → HTTP 429 + logregel | 5 | 4 | 0 | ✅ |
| 25 | AI-begrenzing — opgelost 7 aug 2026, centraal in de AI-gateway (dekt élke AI-aanroep): per gebruiker max 20/min (AI_MAX_PER_GEBRUIKER_PER_MIN) + dagplafond €25 (AI_DAGPLAFOND_EUR) gemeten uit ai_aanroepen; nette meldingen. Bewijs: `scripts/src/verificatie-ai-limieten.ts` (3e aanroep geblokkeerd, andere gebruiker mag wel; plafondtest geblokkeerd met dagplafond-melding) | 4 | 3 | 0 | ✅ |
| 26 | `X-Gebruiker-Override` header niet geverifieerd op geldig integer — passthrough bij malformed waarde | 3 | 3 | 1 | P2 |
| 27 | Sessie-cookie `maxAge` niet geconfigureerd — sessie eindigt nooit server-side | 3 | 3 | 2 | P2 |
| 28 | `MAIL_API_KEY` / `GOOGLE_MAPS_API_KEY` server-side maar niet geroteerd — geen expiry-mechanisme | 3 | 2 | 4 | P3 |
| 29 | AI-endpoints hebben geen input-lengte-limiet — XL-prompts naar OpenAI mogelijk | 3 | 3 | 2 | P2 |
| 30 | Bestandsuploads controleren MIME-type niet server-side — content-type spoof mogelijk | 4 | 3 | 4 | P2 |
| 31 | `requireBevoegdheid` queries altijd naar DB — geen caching, extra latency + aanvalsoppervlak | 3 | 2 | 4 | P3 |
| 32 | `klant`-rol heeft toegang tot alle GET-endpoints binnen zijn gebouw — vervallen 15 aug 2026: KLANTLOOS_01 heeft de klant-rol volledig uit Connect verwijderd (klanten wonen in het Platform) | 3 | 3 | 0 | ✅ |
| 33 | `backup_records.lokaal_pad` zichtbaar in API response — informatielekking | 2 | 2 | 1 | P3 |
| 102 | Projecten-router draait op gebouwen/crm-rechten i.p.v. een eigen module `projecten` (idem opname op gebouwen/voorzieningen, workflow op organisatie 1–4). Bewust NIET rechtgetrokken tijdens KLANTLOOS_01 (15 aug 2026): rechttrekken zou medewerkers toegang ontnemen precies in de week van ingebruikname. Rechttrekken = nieuwe module-sleutels + presets bijwerken + migratie | 3 | 2 | 8 | P3 |
| 103 | MIGRATIE_DUBBEL — zes migratienummers bestaan elk twee keer: 0007 (fie-jaarrealisaties-ak-adviezen / schemadrift-dev-prod-gelijk), 0010 (mail-notitie-koppeling-scoping / nummer-kenmerkketen), 0013 (mailbox-sync-status / wvb-stroom), 0014 (werkinbox-token-gezondheid / wvb-signaal-dedup), 0032 (kalender / veldpresets-projectenrecht), 0033 (uren01c-slot-verbruik-per-regel / werkbak02). **NIET hernoemen/opruimen:** ze zijn op productie uitgevoerd en onder hun huidige bestandsnaam geregistreerd in `schema_migraties`; hernoemen breekt die registratie en blokkeert elke volgende deploy (SCHEMA_01). De volgorde binnen een paar is deterministisch: de migratierunner sorteert op de volledige bestandsnaam. Nieuwe dubbelen worden geblokkeerd door `check-migratie-hernoeming.mjs` (uitzonderingslijst = exact deze zes paren) | 3 | 2 | 0 | ✅ |

---

## Categorie C — Foutafhandeling & Robuustheid

| # | Item | Impact | Risico | Uren | Prio |
|---|------|--------|--------|------|------|
| 34 | `res.status(404)` op parseer-fouten (moet 400 zijn) — ~8 routes | 3 | 2 | 4 | P2 |
| 35 | `res.status(500)` op validatiefouten (moet 400 zijn) — ~3 routes | 3 | 2 | 2 | P2 |
| 36 | Centrale error-handler — opgelost 7 aug 2026: `middlewares/foutafhandelaar.ts` ná alle routes; onverwachte fout → volledige log met verwijzingscode FPS-XXXXXXXX, client krijgt alleen neutrale melding + code; kapotte JSON → nette 400. Bewijs: testapp met DB-constraintfout → 500 zonder details, code in log | 4 | 3 | 0 | ✅ |
| 37 | TS7030 "not all code paths return a value" in 80+ route-handlers — stille undefined-responses | 3 | 2 | 16 | P2 |
| 38 | `try/catch` boilerplate in ~80 routes — duplicaat 40 regels per route | 2 | 1 | 8 | P3 |
| 39 | `workflowService.transiteer()` gooit bij ongeldige overgang maar caller vangt niet altijd af | 3 | 3 | 4 | P2 |
| 40 | PDF-generatie (`html2canvas-pro`) geen timeout — kan request permanent blokkeren | 3 | 3 | 2 | P2 |
| 41 | `analyseerSpot()` geen retry-logica — bij OpenAI 503 verliest gebruiker zijn foto-upload | 3 | 2 | 4 | P3 |
| 42 | `mailparser` geen timeout op IMAP-verbinding — hangt onbeperkt bij netwerkstoringen | 3 | 3 | 2 | P2 |
| 43 | `pg_dump` in backup-service geen `--lock-wait-timeout` — kan productie blokkeren | 4 | 3 | 1 | P2 |
| 44 | Herstel-flow (`POST /backups/:id/herstel`) niet idempotent — dubbele aanroep overschrijft data | 4 | 4 | 4 | P2 |

---

## Categorie D — Performance

| # | Item | Impact | Risico | Uren | Prio |
|---|------|--------|--------|------|------|
| 45 | N+1 in `GET /gebouwen` — opgelost 7 aug 2026: spotstats (count+laatste spot) via één GROUP BY-query en klantnamen via één inArray-query i.p.v. 2 queries per gebouw (partijen waren al gebatcht). Meting dev met 102 gebouwen: mediaan 43,3 ms → 31,9 ms (−26%), querytal per verzoek van ~209 naar 7 | 5 | 4 | 0 | ✅ |
| 46 | N+1 in `GET /documenten`: per document 2 queries (koppelingen + versies) | 4 | 3 | 4 | P2 |
| 47 | N+1 in `GET /medewerkers`: per medewerker 3 queries (functies, opleidingen, verlof) | 4 | 3 | 4 | P2 |
| 48 | N+1 in spotlijst: per spot `getLabelsVoorVoorziening()` (1 query) | 4 | 3 | 4 | P2 |
| 49 | `requireBevoegdheid` doet per request 1 DB-query — geen in-memory cache | 3 | 2 | 4 | P3 |
| 50 | `laadPermissies()` (nieuw, Task #180) doet 3 DB-queries per request — kan gebundeld worden met `requireAuth` | 3 | 2 | 4 | P3 |
| 51 | Chat-polling elke 5s per client — geen WebSocket/SSE | 3 | 2 | 16 | P3 |
| 52 | Plattegrond SVG-render op elke request gegenereerd — geen CDN/caching | 3 | 2 | 8 | P3 |
| 53 | `analyseerGebouwVrijeTekst()` blokkeert request-thread tijdens OpenAI-call | 3 | 2 | 4 | P3 |
| 54 | Geen gzip/brotli-compressie op Express API-responses | 3 | 2 | 1 | P2 |
| 55 | `SELECT *` in ~30 routes — onnodige kolommen overdragen (incl. grote JSONB-velden) | 2 | 1 | 16 | P3 |

---

## Categorie E — Code-kwaliteit & Onderhoudbaarheid

| # | Item | Impact | Risico | Uren | Prio |
|---|------|--------|--------|------|------|
| 56 | `parseId` inconsistent: `parseInt`, `Number()`, `+param` in 60+ routes | 2 | 1 | 8 | P3 |
| 57 | Magic numbers in queries (bijv. `LIMIT 50`, `LIMIT 100`) zonder constante | 2 | 1 | 4 | P3 |
| 58 | Inline SQL-strings in sommige routes i.p.v. Drizzle ORM | 2 | 2 | 4 | P3 |
| 59 | `effectieveContext(req)` soms twee keer aangeroepen in dezelfde handler | 2 | 1 | 4 | P3 |
| 60 | Inconsistente snake_case/camelCase mapping — sommige routes mappen handmatig, andere niet | 3 | 2 | 16 | P2 |
| 61 | `bijgewerktOp: new Date()` in 40+ PATCH-handlers — niet via Drizzle `$onUpdate` hook | 2 | 1 | 4 | P3 |
| 62 | Lange route-bestanden (gebouwen.ts 1700+ regels, voorzieningen.ts 1300+ regels) | 3 | 2 | 16 | P3 |
| 63 | Geen gestandaardiseerde paginering-response (sommige `{ items, totaal }`, andere platte array) | 3 | 2 | 8 | P2 |
| 64 | Geen OpenAPI-validatie van request-body server-side — Zod gebruikt maar niet overal | 3 | 2 | 16 | P2 |
| 65 | `console.log` in sommige service-bestanden (i.p.v. `logger`) | 2 | 1 | 2 | P3 |
| 66 | Verouderde `// TODO`-comments (10+ aangetroffen) zonder ticket-koppeling | 1 | 1 | 4 | P4 |

---

## Categorie F — Frontend

| # | Item | Impact | Risico | Uren | Prio |
|---|------|--------|--------|------|------|
| 67 | Geen global error boundary in React-app — onafgehandelde fouten tonen lege pagina | 4 | 3 | 4 | P2 |
| 68 | `useQuery` hooks zonder `staleTime` — data refetcht bij elke re-render | 3 | 2 | 4 | P2 |
| 69 | Geen skeleton loaders op 8+ paginacomponenten — layout-shift bij laden | 2 | 1 | 8 | P3 |
| 70 | `window.location.reload()` als refresh-mechanisme in 3 componenten | 2 | 2 | 2 | P3 |
| 71 | Inline-stijlen naast Tailwind (inconsistent) | 1 | 1 | 4 | P4 |
| 72 | Grote component-bestanden (beheer/*.tsx > 500 regels) — geen opsplitsing | 2 | 1 | 8 | P3 |
| 73 | Hardcoded NL-strings in sommige components — geen i18n-laag (bewust, maar niet gedocumenteerd) | 1 | 1 | 0 | P4 |
| 74 | `useEffect` met side-effects die `fetch()` direct aanroepen (i.p.v. React Query) — 4 gevallen | 3 | 2 | 4 | P2 |
| 75 | Geen `Suspense` boundary om lazy-loaded routes | 2 | 1 | 2 | P3 |
| 76 | PDF-preview in `iframe` zonder `sandbox`-attribuut | 3 | 2 | 1 | P2 |
| 77 | `localStorage`-gebruik zonder encryptie (spot-frequentie, DDS-draft) | 2 | 2 | 2 | P3 |
| 78 | Lange `App.tsx` — alle routes in één bestand (200+ regels) | 2 | 1 | 2 | P3 |
| 79 | Formulieren zonder `<form>` element (geen Enter-submit, geen autofill) | 2 | 1 | 8 | P3 |
| 80 | Geen `aria-label` op icon-only knoppen | 2 | 2 | 4 | P3 |

---

## Categorie G — DevOps & Observability

| # | Item | Impact | Risico | Uren | Prio |
|---|------|--------|--------|------|------|
| 81 | Geen structured logging voor business-events (offerte verstuurd, dossier definitief) | 3 | 2 | 8 | P2 |
| 82 | Geen health-check endpoint voor DB-verbinding (alleen `/healthz` die altijd 200 geeft) | 4 | 3 | 2 | P2 |
| 83 | Geen alerting op backup-failures — opgelost 7 aug 2026: mislukte of verdacht kleine back-up → blokkerende melding aan alle hoofdbeheerders (`gebruikers_meldingen` type `backup_alarm`); bewezen via `scripts/src/verificatie-backup-alarm.ts` (gesaboteerde pg_dump → melding). Restore eenmalig bewezen: meest recente prod-backup teruggezet in proefdatabase (298 tabellen, rijaantallen identiek aan live, 0 fouten) | 4 | 4 | 0 | ✅ |
| 84 | Geen Sentry/error-tracking in productie — opgelost 8 aug 2026 (SENTRY_01): `@sentry/node` alleen error monitoring (tracing/profiling uit), init in `src/instrument.ts` (start door zonder `SENTRY_DSN`), aangehaakt op de bestaande foutafhandelaar met tag `verwijzingscode`; privacy-scrub in `beforeSend` (geen body/cookie/authorization/querystring); sourcemap-upload als niet-blokkerende stap 5b in deployscript; release = `GIT_COMMIT` | 4 | 3 | 0 | ✅ |
| 85 | Geen performance-monitoring (p95-latency onbekend) | 3 | 2 | 4 | P2 |
| 86 | `pnpm run typecheck` niet in CI (alleen lokaal) | 3 | 3 | 2 | P2 |
| 87 | drizzle-kit push uit deployproces — opgelost 7 aug 2026 (SCHEMA_01): migratierunner (`lib/db/scripts/migrate.mjs`) + tabel `schema_migraties`; push-script bestaat alleen nog voor lokaal werk | 4 | 4 | 0 | ✅ |
| 88 | schema.sql snapshot — opgelost 7 aug 2026: `lib/db/schema.sql` uit productie gegenereerd (nulpunt) + `schema-verwachting.txt` + drift-check bij elke deploy. Bevinding: 13 timestamp-kolommen zijn prod `without time zone` vs dev `with time zone` (FACTUUR_02/AANVRAAG_01) — gemeld, aparte opdracht | 4 | 4 | 0 | ✅ |
| 89 | E2E-tests enkel op Chromium — geen cross-browser coverage | 2 | 1 | 8 | P3 |
| 90 | Geen load-tests — capaciteit bij 50 gelijktijdige gebruikers onbekend | 3 | 3 | 8 | P2 |
| 101 | `artifacts/api-server/Dockerfile` is een ongebruikte, inhoudelijk afgeweken kopie van `deploy/Dockerfile.api` (alpine vs slim, andere stages) — compose bouwt uitsluitend met `deploy/Dockerfile.api`; valstrik bij de volgende bouwwijziging (gemeld 8 aug 2026, SENTRY_01) | 2 | 3 | 1 | P3 |

---

## Categorie H — Dependencies & Versiebeheer

| # | Item | Impact | Risico | Uren | Prio |
|---|------|--------|--------|------|------|
| 91 | `otplib` vastzittend op v12 (v13 breekt bundle) — geen upgrade-pad gedocumenteerd | 3 | 3 | 8 | P2 |
| 92 | `html2canvas` vervangen door `html2canvas-pro` (fork) — upstream onduidelijk | 3 | 2 | 4 | P3 |
| 93 | `nodemailer` in `externals` van build maar ook als runtime dep vereist — fragiel | 3 | 3 | 2 | P2 |
| 94 | `pdfjs-dist` v6 met aparte worker-import — upgrade v7 breekt worker-pad | 3 | 2 | 8 | P3 |
| 95 | Geen `engines` field in package.json — Node-versie impliciet (24 vereist) | 2 | 2 | 1 | P3 |
| 96 | 3 moderate npm-kwetsbaarheden in dev-dependencies (pnpm audit) | 2 | 1 | 2 | P3 |
| 97 | `@workspace/*` pakketten hebben geen versie-semantics — breaking changes onzichtbaar | 2 | 2 | 8 | P3 |

---

## Categorie I — Technische Schuld (architectureel)

| # | Item | Impact | Risico | Uren | Prio |
|---|------|--------|--------|------|------|
| 98 | Productie-migratiehistorie — opgelost 7 aug 2026 (SCHEMA_01): genummerde migraties in `lib/db/src/migrations/` (0001–0004 = basislijn, geregistreerd zonder herdraaien; 0005 = eerste echte migratie), registratietabel met tijdstip, pre-check die stopt bij onbekende migratiestand | 5 | 5 | 0 | ✅ |
| 99 | Geen event-sourcing / audit-log voor kritieke statusovergangen (offerte→definitief, dossier-bevriezing) | 4 | 3 | 40 | P2 |
| 100 | Geen CQRS/separation: read-queries en business-logica zitten in dezelfde route-handlers | 3 | 2 | 80 | P3 |

---

## Samenvatting

_Herrekend op 15 augustus 2026 uit de werkelijke markeringen in de tabellen hierboven (per rij ✅/opgelost vs P1/P2/P3/P4; uren = som van de Uren-kolom per prioriteit). Wijziging t.o.v. 10 aug: #32 opgelost via KLANTLOOS_01 (−8 uur P2), nieuw item #102 (P3, ~8 uur), nieuw item #103 (MIGRATIE_DUBBEL, vastgelegd/afgesloten)._

| Prioriteit | Aantal items | Totaal uren |
|-----------|-------------|------------|
| **P1 — Nu** | 0 | — |
| **P2 — Sprint** | 40 | ~205 |
| **P3 — Kwartaal** | 36 | ~272 |
| **P4 — Backlog** | 3 | ~8 |
| **Opgelost** | 24 | — |
| **Totaal** | **103** | **~485 uur** |

> De zwaarste schuld zit in de ontbrekende productie-migratiehistorie (#98), de N+1-queries op de kernlijsten (#45–48), ontbrekende transacties op juridisch relevante paden (#14–16), en de ontbrekende backup-alerting (#83).
>
> _Historische noot: de openstaande P1-punten uit de oorspronkelijke opname (juli 2026) zijn inmiddels allemaal opgelost of anders geprioriteerd — er staat op 10 augustus 2026 geen P1 meer open._

---

## Bijwerkplicht

Elke opdracht die een schuldpunt oplost, markeert de betreffende rij (✅ + korte opgelost-notitie met datum) **én** herrekent de samenvattingstabel hierboven — beide in dezelfde commit. Zo blijft de telling altijd gelijklopen met de werkelijke markeringen in de tabellen.
