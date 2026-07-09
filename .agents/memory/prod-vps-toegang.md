---
name: Productie-VPS SSH-toegang & deploy
description: Bewezen deploypad naar de productie-VPS (TransIP) en de valkuilen die eerdere pogingen lieten stranden.
---

# Productie-VPS SSH-toegang & deploy (TransIP)

**Status (9 juli 2026): OPGELOST — release a8a8dc7c succesvol uitgerold via het gereconstrueerde originele pad.**

**Bewezen deploypad:**
- SSH als **`rene`** (lid docker-groep) met sleutel `fps_productie_nieuw` (ed25519, commentaar `fps-productie-beheer`); geautoriseerd in `/home/rene/.ssh/authorized_keys`. `fps-beheer` heeft GEEN sleutel; hardening uit SERVER_HARDENING.md is nooit toegepast.
- Repo staat in **`/opt/fps-one`** — NIET `/opt/fps-connect` (oude runbook-claim was fout, net als de "ssh2 vanuit Replit"-claim).
- Server pullt zelf van GitHub (`vinkrene-jpg/fps-one`); volgorde: back-up (pg_dump via deploy-db-1) → git pull → compose build → run --rm migrate → up -d → healthz.
- `deploy/.env.production` is ongetrackt op de server en moet blijven staan.

**Valkuilen (bevestigd):**
- `.dockerignore` moet `scripts/*` + `!scripts/package.json` bevatten (Dockerfile.caddy kopieert scripts/package.json); kaal `scripts` breekt de caddy-build. Sinds commit `c93e4b42` correct op main.
- Lange servercommando's (build/migrate) altijd losgekoppeld draaien met `nohup ... & echo $! > pidfile` en peilen via `kill -0 $(cat pidfile)` — NIET `pgrep -f "docker compose.*build"` (matcht zijn eigen ssh-shell → eeuwig "loopt nog").
- Een lokaal gedode ssh-sessie neemt het remote voorgrond-commando mee (SIGHUP) — synchron draaien van migraties over ssh met krappe timeout is riskant.
- Secret-saves van de gebruiker belandden herhaaldelijk in het verkeerde paneel (account-/deployment-secrets); PROD_SSH_KEY bleef een UUID, PROD_SSH_KEY_V2 leeg. Sleutel is uiteindelijk via chat gedeeld → **blootgesteld; rotatie geadviseerd**.
- TransIP-paneel "SSH-sleutels" geldt alleen bij herinstallatie; webconsole verhaspelt plakwerk naar hoofdletters.
- `/tmp` op Replit is vluchtig: sleutelbestand na omgevingsherstart opnieuw aanmaken.

**Restpunt:** handmatige weblogin-smoketest (TOTP) door gebruiker; sleutelrotatie bij gelegenheid.

**Productie-config gaten (9 juli 2026):**
- `deploy/.env.production` heeft GEEN mailvariabelen (AZURE_TENANT_ID/CLIENT_ID/CLIENT_SECRET, MAIL_FROM, MAIL_MAILBOX) → uitnodigings- en wachtwoord-vergeten-mails komen op productie nooit aan; "gebruiker kan niet inloggen" eerst hierop checken (login_pogingen-tabel geeft bewijs). Dev heeft ze wél.
- De api-container logt 0 regels (json-file driver, maar leeg) — LOG_LEVEL nakijken; debugging loopt nu noodgedwongen via de login_pogingen-tabel en DB-queries.
