---
name: Prod curl/Playwright sessie-bewijs
description: Valkuilen bij tijdelijk prod-testaccount + curl 2FA-flow + Playwright-screenshot
---
- Sessie-cookies zijn Secure: curl-jar blijft leeg over http://localhost; gebruik https via $REPLIT_DEV_DOMAIN (dev) of het publieke domein (prod).
- 2FA-flow: POST /auth/login (status setup_2fa) → /auth/2fa/setup (pendingUserId in sessie) → otplib-code → /auth/2fa/activeren; alles met dezelfde cookie-jar.
- HttpOnly-cookies staan in de jar als `#HttpOnly_domein...`; `grep -v '^#'` filtert ze weg — parse op cookienaam.
- Playwright addCookies: gebruik `{ name, value, url }` (niet domain/path los) tegen "Invalid cookie fields"; chromium via `which chromium` (NixOS).
- **SSH + bcrypt-hash:** een hash met `$2b$10$…` in een dubbelgequote ssh-commandostring wordt door de remote shell geëxpandeerd → corrupt wachtwoord ("Onjuiste inloggegevens"). Pipe SQL via stdin (`ssh … < file.sql`).
- Kolommen: gebruikers.wachtwoord (niet wachtwoord_hash), totp_secret, twee_factor_ingeschakeld.
