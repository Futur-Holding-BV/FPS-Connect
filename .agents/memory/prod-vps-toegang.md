---
name: Productie-VPS SSH-toegang
description: Stand van zaken en valkuilen rond SSH-toegang tot de productie-VPS (TransIP) voor deploys vanaf Replit.
---

# Productie-VPS SSH-toegang (TransIP)

**Status (9 juli 2026): deploy GEPAUZEERD — geen werkende SSH-toegang vanaf Replit.**

- VPS: `fps-beheer@149.210.181.47` (`fps-connect-prod`), repo in `/opt/fps-connect`, runbook in `docs/PRODUCTION_RUNBOOK.md`.
- CI is groen op mergecommit `a8a8dc7`; productie draait en is gezond (`https://connect.fps-one.nl/api/healthz`). Er is niets op de VPS gewijzigd.
- Een Replit-gegenereerd ed25519-sleutelpaar staat in `/tmp/fps_deploy_nieuw` (privé, mode 600) — /tmp is vluchtig; publieke sleutel eindigt op `...Zd9hLFM replit-deploy-fps-connect`. Nog NIET geautoriseerd op de VPS.

**Valkuilen (bevestigd in de praktijk):**
- Het secret `PROD_SSH_KEY` bevatte hardnekkig een 36-tekens UUID (sleutel-ID, geen sleutel). Meerdere "opnieuw opgeslagen"-pogingen van de gebruiker kwamen nooit aan: propagatie zelf werkt aantoonbaar direct (getest met eigen env var + vers workflow-proces), dus de saves belandden elders (account-/deployment-secrets i.p.v. app-secrets). Verificatiepatroon: tijdelijke workflow die `wc -c` van de secretwaarde print.
- TransIP-paneel "SSH-sleutels" geldt alleen bij HERINSTALLATIE van de VPS; een draaiende server pikt ze niet op (bevestigd: Permission denied na toevoegen in paneel).
- De TransIP-webconsole zet geplakte tekst om naar HOOFDLETTERS — handmatige consolecommando's zijn onbetrouwbaar; gebruiker wil ze niet meer.
- Wachtwoord van `fps-beheer` is niet beschikbaar; wachtwoord-SSH is door de gebruiker uitgesloten.

**Resterende ontgrendelroutes:** (1) origineel privésleutelbestand met bestaande toegang aanleveren als app-secret; (2) publieke sleutel op de VPS autoriseren vanaf een machine die al toegang heeft; (3) handmatige deploy volgens runbook vanaf zo'n machine.
