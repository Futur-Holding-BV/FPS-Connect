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

## api-server has pre-existing TS7030 errors; build ignores them
`tsconfig.base.json` sets `noImplicitReturns: true`. Many route handlers mix `return res.json(...)`
with bare `res.json(...)`, triggering TS7030 across ALL route files (even untouched ones). The
esbuild bundle does NOT enforce this, so the server runs fine. `pnpm run typecheck` will report these.
**How to apply:** Don't treat these as your regression; don't try to fix them all. Keep new handlers
consistent (a handler with no early-return branch won't add an error).

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

## Gebouw "AI invullen" = vrije tekst, niet gestructureerde velden
De gebouw-aanmaak-AI verwacht één vrij tekstveld (`beschrijving`), niet losse adres/postcode/stad
inputs. Backend doet twee stappen: (1) LLM-extractie van expliciet genoemde velden + een
geocode-zoekopdracht uit de tekst, (2) geocoding + satelliet-vision als verrijking. Door de
gebruiker genoemde waarden hebben ALTIJD voorrang op de AI-schatting (merge met `?? visie`).
**Why:** gebruiker vond de starre adresvelden te beperkend; wil vrij beschrijven en AI vult de rest.
**How to apply:** het analyse-resultaat levert ook naam/adres/stad/postcode terug zodat het
onderste formulier (incl. die velden) automatisch gevuld wordt; geocoding/satelliet is optioneel
(resultaat blijft `gevonden:true` puur uit de tekst).

## Mobile auth = signed bearer token, not cookies
The Expo app can't keep the `Secure; SameSite=None` session cookie in the Replit iframe, so it uses
`POST /auth/mobile/login` (email+wachtwoord+TOTP) → stateless HMAC bearer token (`lib/token.ts`,
30-day exp). `requireAuth` accepts `Bearer` and re-checks the user is still `actief` per request.
**How to apply:** mobile must send `Authorization: Bearer <token>`; the shared fetch layer wires this
via `setAuthTokenGetter`. Token secret falls back to a dev default — set a real `SESSION_SECRET`.

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
