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

## Mobile auth = signed bearer token, not cookies
The Expo app can't keep the `Secure; SameSite=None` session cookie in the Replit iframe, so it uses
`POST /auth/mobile/login` (email+wachtwoord+TOTP) → stateless HMAC bearer token (`lib/token.ts`,
30-day exp). `requireAuth` accepts `Bearer` and re-checks the user is still `actief` per request.
**How to apply:** mobile must send `Authorization: Bearer <token>`; the shared fetch layer wires this
via `setAuthTokenGetter`. Token secret falls back to a dev default — set a real `SESSION_SECRET`.
