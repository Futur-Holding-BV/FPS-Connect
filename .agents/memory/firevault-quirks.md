---
name: FPS Brandpreventie quirks
description: Non-obvious build/typecheck quirks for the firevault + api-server monorepo
---

# FPS Brandpreventie quirks

## Generated React Query hooks require `queryKey` in query options
The Orval-generated query hooks (e.g. `useGetVoorziening`) type their `query` option as the full
`UseQueryOptions` which **requires `queryKey`**. Passing `{ query: { enabled: x } }` alone fails
`tsc` with "Property 'queryKey' is missing". Several pre-existing pages (detail/qr/nieuw) already
fail typecheck this way.
**How to apply:** Don't pass a bare `{ query: { enabled } }`. Either omit options (call the hook only
when the id is guaranteed, e.g. gate the component mount) or include a `queryKey`.

## api-server TS7030 (noImplicitReturns) — since July 2026 fully green; keep it that way
`tsconfig.base.json` sets `noImplicitReturns: true`. Route handlers that mix `return res.json(...)`
with bare `res.json(...)` trigger TS7030. The last pre-existing offenders were fixed on 2026-07-09;
`pnpm --filter @workspace/api-server run typecheck` is now green.
**How to apply:** new/edited handlers must keep return style consistent (value-return handlers →
`return res.status(...)...`; void/`Promise<void>` handlers → `res.status(...)...; return;`).
For `.then(cb)` promise chains, a ternary expression avoids TS7030 where an if-without-else return would trip it.

## React is 19 → no pnpm overrides for Uppy v5
Catalog pins `react`/`react-dom` to 19.1.0. The object-storage skill's warning about adding
`pnpm.overrides` (for React 18 + Uppy v5 peer `react>=19`) does NOT apply here — skip it.

## pdfjs-dist v6 API
`pdfjsLib.getDocument(...)` takes an **object** (`{ url }`), not a string. Set the worker via
`import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"` then
`pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl`.

## Object storage serving
Store the upload `objectPath` (already includes `/objects/...`) in DB. Serve via
`fetch(\`/api/storage${objectPath}\`)` — do NOT add `/objects/` again. Storage router sits behind
`requireAuth`, so images load only for authenticated sessions.

## PDF spot-coordinate contract (web ↔ mobile)
Spot `locatie_x/y` are stored in **pdf.js page-1 rendered-pixel space at `scale: 2`**. Both the web
plattegrond AND the Expo monteur-app render page 1 at `scale: 2` and place/store taps in that same
space, so markers line up across clients.
**Why:** any client that renders the PDF at a different scale will place markers at drifted positions.
**How to apply:** never change the render scale on only one client; if you change it, migrate stored
coords or change both clients together.

## Login risk IP must come from `req.ip`, not raw X-Forwarded-For
`app.set("trust proxy", 1)` is configured, so Express resolves `req.ip` from the trusted Replit
proxy chain. Do NOT manually parse `req.headers["x-forwarded-for"]` for security signals — that
header is client-spoofable and lets an attacker forge a "known" IP to suppress the new-IP login
alert. The login-risk helper (`legLoginPogingVast`) compares each successful login's ip/user-agent
against prior successful logins to flag `nieuwApparaat`/`nieuwIp`.
**How to apply:** use `req.ip` for any trust/security decision; only the value Express derives via
trust-proxy is reliable.

## Some pages keep a LOCAL row type that shadows the generated schema
`pages/gebruikers/index.tsx` declares its own `Gebruiker`-shaped type instead of importing the
Orval-generated one. Adding a field to the OpenAPI schema + codegen is NOT enough — the local type
must be updated too or `tsc` reports "Property X does not exist".
**How to apply:** after extending a generated schema, grep the consuming page for a hand-written
type and update both.

## Gebouw "AI aanvullen" = vrije tekst OF reeds ingevulde velden als basis
De backend-AI verwacht één vrij tekstveld (`beschrijving`); de frontend (`gebouw-aanmaken-dialog.tsx`)
bouwt die beschrijving zelf op uit reeds ingevulde formuliervelden (naam/adres/postcode+stad/type)
wanneer het AI-tekstvak leeg is (`aiTekst.trim() || beschrijvingUitVelden()`). De merge vult via de
`vul(huidig, nieuw)`-helper ALLEEN lege velden aan — door de gebruiker ingevulde waarden worden nooit
overschreven. Backend doet twee stappen: (1) LLM-extractie van genoemde velden + geocode-query,
(2) geocoding + satelliet-vision als verrijking.
**Why:** gebruiker verwachtte dat de AI-knop aanvult op basis van wat al is ingevuld; de oude versie
eiste losse vrije tekst en deed schijnbaar niets. Knop heet nu "AI aanvullen".
**How to apply:** voeg nieuwe formuliervelden die als AI-basis moeten dienen toe aan
`beschrijvingUitVelden()`; gebruik `vul()` (niet `res.x ?? v.x`) zodat handmatige invoer voorrang houdt.

## Mobile auth = signed bearer token, not cookies
The Expo app can't keep the `Secure; SameSite=None` session cookie in the Replit iframe, so it uses
`POST /auth/mobile/login` (email+wachtwoord+TOTP) → stateless HMAC bearer token (`lib/token.ts`,
30-day exp). `requireAuth` accepts `Bearer` and re-checks the user is still `actief` per request.
**How to apply:** mobile must send `Authorization: Bearer <token>`; the shared fetch layer wires this
via `setAuthTokenGetter`. Token secret falls back to a dev default — set a real `SESSION_SECRET`.

## Mobiele lijsten leeg/blijven-laden = HTTP 304 dat RN-fetch bereikt
Express stuurt ETag-validators en geeft 304 Not Modified op conditionele GETs. De gedeelde
`custom-fetch.ts` ziet 304 als niet-OK (`response.ok` is false buiten 200–299) en gooit dus een
`ApiError` (304 staat ook in `NO_BODY_STATUS` → geen body). In een browser zie je dit NOOIT: de
browser handelt 304 transparant af en geeft de gecachete body als 200 terug. React Native's fetch
geeft de 304 wél rechtstreeks door → de hook faalt/retryt → lijst blijft leeg of laadt eindeloos.
Puur mobiel, web werkt prima — daarom misleidend.
**Why:** de gebouwenlijst (en elke RN-lijst) leek leeg terwijl `GET /api/gebouwen` server-side gewoon
200 met 7 gebouwen teruggaf; het verschil zit in hoe RN vs. browser 304 afhandelt.
**How to apply:** een middleware in `app.ts` str/ipt voor verzoeken met `Authorization: Bearer ` de
conditionele headers (`if-none-match`, `if-modified-since`), zodat de server mobiel ALTIJD een
volledige 200 met body stuurt. De web-app (sessie-cookies, geen Authorization-header) houdt zijn
304-optimalisatie. Reproduceer met een gemunt HMAC-token + `If-None-Match` via `http://localhost:80`.

## Tekeningen openen via ingebouwde TekeningViewer, niet ruwe storage-link
Tekening-links openden voorheen `/api/storage${url}` in een nieuw browser-tab → grote PDF/afbeelding
startte linksboven (niet gecentreerd). Opgelost met herbruikbare `gebouwen/tekening-viewer.tsx`
(Dialog): PDF via pdf.js scale:2 → dataURL, afbeeldingen direct, beide `object-contain` in een
`flex items-center justify-center` container = passend + gecentreerd. Multi-pagina nav + "Nieuw
tabblad"-fallback. Gebruikt in gebouw-bouwlagen.tsx (TekeningRegels) en gebouw-tekeningen.tsx.
**How to apply:** pdf.js render-effect MOET in cleanup `renderTask.cancel()` + `loadingTask.destroy()`
aanroepen (anders blijft zwaar werk draaien bij sluiten/wisselen); reset `aantalPaginas` naar 1 bij
open/url-wissel om stale paginatie te voorkomen.

## "Spots" = gebruikersterm voor voorzieningen (UI-tekst)
De gebruiker wil voorzieningen in de UI consequent "Spots" noemen (bv. dashboard: "Totaal Spots",
"Goedgekeurde Spots", "Afgekeurde Spots"). Data/veldnamen blijven `voorzieningen` /
`*_voorzieningen` in DB + API-contract; alleen de zichtbare labels gebruiken "Spots".
**Why:** spots zijn de markers op de plattegrond; de gebruiker hanteert die term en wil hem overal aanhouden.
**How to apply:** nieuwe UI-tekst voor voorzieningen → schrijf "Spot(s)"; hernoem geen schema/API-velden.

## Plattegrond = verdieping.plattegrond_url; overige tekeningen = tekening-rijen (twee bronnen)
Plattegronden worden centraal per gebouw beheerd en als ondergrond opgeslagen op
`verdieping.plattegrond_url` (upload → client-render naar dataURL → vision-AI koppelt aan bouwlaag →
update/create verdieping). De "Overige tekeningen"-sectie toont losse `tekening`-rijen en filtert
`type !== "plattegrond"`. De plattegrond-achtergrond-renderer moet zowel PDF (pdfjs) als afbeelding
(Image→canvas fallback) aankunnen, want `plattegrond_url` kan beide zijn.
**Why:** twee aparte opslagplekken; een tekening met `type==="plattegrond"` valt in een gat — niet
zichtbaar bij Overige tekeningen én niet als ondergrond (die leest `verdieping.plattegrond_url`).
**How to apply:** in gebouw-tekeningen.tsx ALTIJD het AI-voorgestelde `tekening_type` normaliseren
naar een toegestaan type (helper `veiligType` → fallback "overig") vóór setType én vóór opslaan;
AI-vision kan nog steeds "plattegrond" teruggeven ook al staat het niet in de keuzelijst.

## Plattegrond moet "fit to view" op laden (anders lijken spots verdwenen)
De plattegrond-SVG rendert de PDF op scale 2 (grote afbeelding, bv. 2380x1684px). Zonder
auto-fit start de view op {x:0,y:0,zoom:1} en zie je alleen de linkerbovenhoek. Seed-spots hebben
kleine coords (60-400) en vallen toevallig in die hoek; een nieuw geplaatste spot krijgt grote
coords (bv. 2001,1822) en valt buiten het zichtbare deel → gebruiker "ziet de spot niet terug".
**Why:** klacht "spot niet terug op tekening" was puur een viewport-probleem, niet de opslag.
**How to apply:** fitToView() centreert+schaalt op containerafmetingen + pdfDims; auto-fit via
useEffect op pdfDims; klikcoords klemmen op [0,W]x[0,H]. Coördinatenopslag (scale 2) NIET wijzigen —
web en mobile moeten matchen.

## OpenAI = Replit AI-integratie-proxy, niet de eigen OPENAI_API_KEY
De eigen `OPENAI_API_KEY` had geen quota (429 `insufficient_quota`), waardoor e-mail-AI én
gebouw-"AI invullen" stilletjes lege/null resultaten gaven — wat als "upload werkt niet" /
"AI werkt niet" werd gemeld terwijl de upload/parse zelf prima werkten.
**Why:** de AI-services slikken fouten in en retourneren een leeg resultaat, dus een quota/billing-fout
is onzichtbaar in de UI; alleen de server-log toont de 429.
**How to apply:** bouw OpenAI-clients via de centrale helper `artifacts/api-server/src/lib/openai.ts`
(`maakOpenAiClient()` + `heeftOpenAi()`). Die geeft voorrang aan de proxy-env-vars
`AI_INTEGRATIONS_OPENAI_BASE_URL` + `AI_INTEGRATIONS_OPENAI_API_KEY` (gezet via
`setupReplitAIIntegrations`), met fallback op `OPENAI_API_KEY`. Geen eigen billing nodig.
Modellen blijven gpt-4o/gpt-4o-mini (proxy ondersteunt ze; project gebruikt ze al). Herstart de
api-server na het provisioneren zodat de nieuwe env-vars geladen worden.

## requireRol middleware widens req.params → TS2345 on `parseInt(req.params.x)`
Adding any middleware (e.g. `requireRol(...)`) before a route handler changes Express 5's overload
resolution so `req.params.x` is typed `string | string[]`. A bare `parseInt(req.params.id)` then emits
`TS2345: 'string | string[]' not assignable to 'string'` — a NEW error you introduced by adding the guard.
**Fix:** wrap every `req.params.*` read in `String(...)`: `parseInt(String(req.params.id))`. This is the
established baseline pattern across the routes and keeps the typecheck count flat. Do this for ALL param
reads in a handler you add a guard to (path id AND nested ids like `:fotoId`/`:scheidingId`).
**Note (separate issue):** the `TS7030` ("not all code paths return a value") errors are pre-existing and
tolerated; esbuild bundles fine. Keep added branches consistent with the handler's existing return style
(value-return handlers → `return res.status(403)...`; void handlers → `res.status(403)...; return;`) so you
don't flip a clean handler into TS7030.

## api-server draait een esbuild-bundle (build && start) — geen watch/HMR
De api-server-workflow doet `pnpm run build && pnpm run start`; de draaiende `dist/index.mjs` is een
momentopname. Wijzigingen in `lib/*` of `routes/*` worden pas actief NA een workflow-herstart — anders
blijft de oude bundle draaien.
**Why:** na een DB-migratie (bv. `DROP TABLE document_applicaties`) plus de bijbehorende codewijziging
bleef de oude bundle de gedropte tabel query'en → 500 op `GET /documenten` ("relation does not exist"),
terwijl de broncode al correct was. Geen codebug, alleen een stale build.
**How to apply:** na ELKE backend-bron- of DB-schemawijziging die de server raakt: herstart
`artifacts/api-server: API Server`. Een 500 met "relation/column does not exist" terwijl de broncode
schoon is = vrijwel altijd stale bundle → eerst herstarten vóór codejacht.

## `pnpm --filter @workspace/db run push` kan blokkeren op een interactieve TTY-prompt
Bij bestaande schema-drift (bv. een al-bestaande unique-constraint die drizzle-kit wil toepassen) vraagt
`drizzle-kit push` interactief "Do you want to truncate?" en faalt dan in de non-interactieve shell met
`Error: Interactive prompts require a TTY terminal`. Je eigen additieve kolommen worden dan NIET gepusht.
**Why:** push wil ALLE diffs toepassen, ook drift die niets met je wijziging te maken heeft; één
truncate-prompt blokkeert de hele push.
**How to apply:** voor puur additieve kolommen, pas ze direct toe via SQL
(`ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...`) i.p.v. de interactieve push — veilig en geen dataverlies.
Gebruik de `executeSql`-callback in code_execution.

## xlsx (SheetJS) import: interop-guard + zichtbare fouten
`import * as XLSX from "xlsx"` kan afhankelijk van het bundler-pad de functies onder `.default`
zetten i.p.v. op de namespace → `XLSX.read`/`XLSX.utils` is dan undefined en de parse faalt.
Gebruik een interop-guard: `xlsxApi = typeof XLSX.read === "function" ? XLSX : (XLSX.default ?? XLSX)`.
**Why:** de Toepassingen-import "deed niets" doordat parse-fouten in een lege `catch{}` verdwenen en
een leeg resultaat eruit zag als "0 rijen"; daarnaast meldde elke POST-fout misleidend "mogelijk
duplicaat".
**How to apply:** bij elke Excel-import: lees via de interop-guard én toon parse-/0-rij-/serverfouten
zichtbaar (eigen `importFout`-state + melding), nooit slikken. Per-rij API-fouten via een
`foutmelding(err, standaard)`-helper (status 401/403 + `e.data.error`), niet een generieke tekst.
