---
name: Dev-API sessiebewijs via https
description: Hoe je in dev met curl/fetch een ingelogde sessie krijgt op de api-server
---
De sessiecookie (`fps.sid`) is `Secure`; over plain `http://localhost:8080` stuurt express-session **geen** Set-Cookie terug (login geeft 200 zonder cookie, 2FA-verify faalt dan met "Geen actieve inlogpoging").

**How to apply:** bewijsscripts en curl-sessies in dev altijd via `https://$REPLIT_DEV_DOMAIN/api` laten lopen (zie `scripts/src/verificatie-notitie01.ts` als voorbeeld, incl. TOTP-login met de vaste e2e-accounts). Loginflow: POST /auth/login → status `verify_2fa`/`setup_2fa` → POST /auth/2fa/verify met cookie.

Verder: klant-toegang tot een gebouw loopt via `gebouw_toewijzingen` + een `gebouw_publicaties`-rij met status `gepubliceerd` — NIET via `gebouwen.klant_id`.
