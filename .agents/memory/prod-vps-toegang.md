---
name: Productie-VPS SSH-toegang
description: Reconstructie van het originele deploypad naar de productie-VPS (TransIP) en de bevestigde valkuilen rond SSH-toegang vanaf Replit.
---

# Productie-VPS SSH-toegang (TransIP)

**Status (9 juli 2026): deploy GEPAUZEERD — origineel deploypad gereconstrueerd, wacht op originele sleutel als app-secret.**

- VPS: `149.210.181.47` (`fps-connect-prod`), repo in `/opt/fps-connect`, runbook in `docs/PRODUCTION_RUNBOOK.md`.
- CI groen op mergecommit `a8a8dc7`; productie draait gezond (`https://connect.fps-one.nl/api/healthz`). Niets op de VPS gewijzigd.

**Reconstructie origineel deploypad (bewijs uit transcripten + git):**
- De initiële installatie liep als gebruiker **`rene`** (`ssh rene@149.210.181.47` + git clone naar /opt/fps-connect — stappenplan in sessietranscript). Gebruikersclaim: historische documentatie wijst op `/mnt/home/rene/.ssh/authorized_keys` (= `/home/rene` via rescue-mount) → sleutel geautoriseerd voor `rene`, NIET fps-beheer.
- `fps-beheer` + `AllowUsers fps-beheer` + ssh-copy-id staan alleen in SERVER_HARDENING.md als DOCUMENTATIE; geen bewijs van uitvoering. SSH-probe: alle gebruikers (rene/fps-beheer/root) krijgen `publickey,password` aangeboden → PasswordAuthentication no en AllowUsers zijn NIET toegepast → hardening niet (volledig) uitgevoerd.
- Originele sleutel: `fps_productie_nieuw` (comment `fps-productie-beheer`) op René's pc. Runbook-claim "vorige deploys via Node.js ssh2 vanuit Replit met secret" (commit 7 juli) was al reconstructie-achteraf; secretnaam onbekend, nooit in huidige secretslijst gezien.
- Alle mislukte auth-tests hier liepen tegen **fps-beheer**; tegen **rene** is nooit een echte sleutel getest (secret bevatte steeds een UUID).

**Valkuilen (bevestigd in de praktijk):**
- Secret `PROD_SSH_KEY` bevatte hardnekkig een 36-tekens UUID (sleutel-ID). Propagatie werkt aantoonbaar direct (getest: eigen env var + vers workflow-proces zag hem meteen), dus gebruikers-saves belandden elders (account-/deployment-secrets i.p.v. app-secrets). Verificatiepatroon: tijdelijke workflow die `wc -c` van de secretwaarde print.
- TransIP-paneel "SSH-sleutels" geldt alleen bij HERINSTALLATIE; draaiende server pikt ze niet op (bevestigd: Permission denied).
- TransIP-webconsole zet geplakte tekst om naar HOOFDLETTERS — consolecommando's onbetrouwbaar; gebruiker wil ze niet meer.
- Wachtwoord `fps-beheer` niet beschikbaar; wachtwoord-SSH uitgesloten door gebruiker. Nieuw gegenereerde deploysleutels zijn door de gebruiker afgewezen en verwijderd.

**Herstelroute:** originele `fps_productie_nieuw`-inhoud via requestEnvVar-paneel (PROD_SSH_KEY_V2) → eerst testen als `rene@149.210.181.47`, daarna pas fps-beheer → runbook draaien (let op: /opt/fps-connect eigendom + docker-groep voor rene verifiëren).
