---
name: Productie-VPS deploy-lessen
description: Duurzame valkuilen rond het deployen naar de zelf-gehoste productie-VPS; concrete toegangsgegevens staan bewust NIET hier.
---

# Productie-VPS deploy-lessen

Toegangsdetails (host, accountnaam, sleutels, paden) staan bewust niet in memory:
vraag ze aan de gebruiker of kijk in de beveiligde secrets. Eerdere runbook-claims
over het deploypad bleken deels fout — verifieer het pad altijd op de server zelf
in plaats van op documentatie te vertrouwen.

**Bewezen deployvolgorde:** back-up (pg_dump via de db-container) → git pull op de
server (server pullt zelf van GitHub) → compose build → eenmalige migrate-run →
up -d → healthz-check. De ongetrackte productie-envfile op de server moet blijven staan.

**Valkuilen (bevestigd):**
- `.dockerignore` moet `scripts/*` + `!scripts/package.json` bevatten (caddy-build
  kopieert scripts/package.json); kaal `scripts` breekt de build.
- Lange servercommando's (build/migrate) losgekoppeld draaien met
  `nohup ... & echo $! > pidfile` en peilen via `kill -0 $(cat pidfile)` — NIET
  `pgrep -f` op het commando (matcht zijn eigen ssh-shell → eeuwig "loopt nog").
- Een lokaal gedode ssh-sessie neemt het remote voorgrond-commando mee (SIGHUP);
  migraties synchroon over ssh met krappe timeout is riskant.
- Secret-saves van de gebruiker belanden makkelijk in het verkeerde paneel
  (account- vs app-secrets); verifieer dat de secret echt gevuld is vóór gebruik.
  Als een sleutel ooit via een onveilig kanaal is gedeeld: rotatie adviseren.
- `/tmp` op Replit is vluchtig: tijdelijke sleutelbestanden na omgevingsherstart
  opnieuw aanmaken.

**Structurele productie-config-gaten:**
- Productie mist mailvariabelen (Azure Graph + afzender/postbus) → uitnodigings-
  en wachtwoord-vergeten-mails komen daar nooit aan; bij "gebruiker kan niet
  inloggen" eerst hierop checken (login_pogingen-tabel geeft bewijs). Dev heeft ze wél.
- De api-container logt vrijwel niets (LOG_LEVEL nakijken); debugging loopt via de
  login_pogingen-tabel en DB-queries.
