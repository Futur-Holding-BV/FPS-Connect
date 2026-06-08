---
name: FireVault authentication & mandatory TOTP 2FA
description: Why FireVault uses hand-rolled session auth with mandatory authenticator-app TOTP, and the non-obvious constraints (otplib version, iframe cookies, bootstrap).
---

# FireVault auth

Real login with **mandatory** authenticator-app TOTP. Replaces the old demo "portalkeuze" role switcher; the logged-in account's `rol` now drives which portal renders. Data routes are gated server-side with `requireAuth`; only `/auth/*` and `/healthz` are public.

## Decision: hand-rolled session auth, not Clerk/Replit Auth
**Why:** Replit-managed Clerk does NOT support MFA, and Replit Auth has no native authenticator-app TOTP. The product requires user-chosen TOTP as a hard requirement, so a managed provider could not satisfy it. Custom auth also integrates the existing `gebruikers`/`rol` model directly.
**How to apply:** stack is express-session + connect-pg-simple (PG store), bcryptjs (password hash), otplib (TOTP), qrcode (QR data URL). If asked to "switch to Clerk/Replit Auth", warn that mandatory TOTP would be lost.

## otplib MUST stay on v12
**Why:** otplib v13 is a completely different functional/guardrails API with no `authenticator` export; esbuild bundling fails with "No matching export ... for import authenticator". The code uses the classic `authenticator.generateSecret/keyuri/check`.
**How to apply:** keep `otplib` pinned to ^12 in api-server. Do not let it float to 13.

## Cookies: Secure + SameSite=None + trust proxy
**Why:** the app runs inside the Replit iframe preview (cross-site context), so the session cookie must be `SameSite=None; Secure` and Express must `trust proxy`. Frontend is same-origin with `/api` via the shared proxy, so the default same-origin `customFetch` credentials work — do NOT modify the shared custom-fetch lib.
**How to apply:** testing the backend with curl over `http://localhost:80` will NOT persist a Secure cookie. Use `https://$REPLIT_DEV_DOMAIN` with a cookie jar; compute TOTP in a node script using otplib from the returned secret.

## Login is a session state machine
password check → `session.pendingUserId`; if `tweeFactorIngeschakeld` is false → setup (generate secret held in session until `2fa/activeren` succeeds, then persist + enable) else → verify; on success set `session.userId`. `login` returns `{status: "setup_2fa" | "verify_2fa"}`.

## Bootstrap a first password via SQL
**Why:** `gebruikers` create/edit now hash passwords but those routes require auth — chicken-and-egg for the very first admin. 
**How to apply:** hash with bcryptjs in a node script run *inside* `artifacts/api-server` (so node_modules resolves) and `UPDATE gebruikers SET wachtwoord=...`. After testing 2FA against a real account, reset `twee_factor_ingeschakeld=false, totp_secret=NULL` so the user's own first login shows the QR setup.
