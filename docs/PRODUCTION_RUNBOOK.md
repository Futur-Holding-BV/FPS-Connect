# FPS Connect — Production Runbook

## Omgevingsscheiding: één productie-URL (vastgesteld 15 juli 2026)

**`connect.fps-one.nl` is de enige productieomgeving.** Er zijn twee omgevingen:

| Omgeving | URL | Database | Gebruik |
|---|---|---|---|
| VPS productie | `https://connect.fps-one.nl` | VPS PostgreSQL | Eindgebruikers, echte data |
| Replit dev | `localhost` / Replit-preview | Replit PostgreSQL | Ontwikkeling & testen |

**Replit autoscale-deployment is uitgeschakeld.** De Replit-deployment (`deploymentTarget = "autoscale"`) is verwijderd uit de configuratie. Replit dient uitsluitend als ontwikkel- en testomgeving. De enige weg naar productie is via het automatische pad Agent-merge → `scripts/post-merge.sh` → `git push` naar GitHub → `deploy.yml` triggert → VPS bouwt en herstart.

**Server-side redirect:** De frontend (`firevault`) stuurt via een inline script in `index.html` elk verzoek dat binnenkomt op een andere hostname dan `localhost`, `127.0.0.1` of `connect.fps-one.nl` direct door naar `https://connect.fps-one.nl` (inclusief pad en querystring). Deze redirect werkt ook als React niet laadt of de JS-bundle stuk is — het script staat vóór de React-bundle in de HTML.

**Let op bij agent-tools:** `executeSql { environment: "production" }` in de Replit-agent raadpleegt de **Replit**-database, niet de VPS-database. Voor productiedata: SSH naar de VPS of gebruik de productie-backups.

---

## Automatische deploy na Replit-merge (vastgesteld 15 juli 2026; bijgewerkt 16 juli 2026)

Na elke taakmerge in Replit pusht het post-merge script (`scripts/post-merge.sh`, Stap 7a+7) automatisch naar `github.com/Futur-Holding-BV/FPS-Connect` (main branch). GitHub Actions (`deploy.yml`) triggert hierop direct en de VPS draait binnen 10-15 minuten op de nieuwe code.

### Stap 7a: auto-sync vóór GitHub-push (structurele fix 16 juli 2026)

Vóór elke `git push` fetcht het post-merge script automatisch `origin/main`. Als GitHub commits heeft die Replit niet kent (divergentie), wordt automatisch `git merge --no-edit` uitgevoerd vóór de push. Hierdoor worden "fetch first"-afwijzingen structureel voorkomen.

### Vereiste Replit Secrets

| Secret | Gebruik |
|---|---|
| `GITHUB_TOKEN_PUSH` | Git-push naar GitHub vanuit post-merge.sh |

### Vereiste GitHub Repository Secrets (voor automatische deploy via GitHub Actions)

GitHub Actions (`deploy.yml`) SSHt naar de VPS om `deploy-production.sh` te draaien. Daarvoor zijn drie GitHub Repository Secrets verplicht — **deze worden niet automatisch ingesteld, René moet ze handmatig configureren** via GitHub.com > Settings > Secrets and variables > Actions:

| Secret | Waarde | Verplicht |
|---|---|---|
| `PROD_SSH_KEY` | Volledige PEM-inhoud van de SSH-privésleutel (inclusief `-----BEGIN`/`-----END`-regels) | **Ja** |
| `PROD_SSH_HOST` | `149.210.181.47` | **Ja** |
| `PROD_SSH_USER` | `rene` | **Ja** |
| `PROD_SSH_PORT` | `22` (optioneel; standaard 22) | Nee |
| `SMOKETEST_EMAIL` | E-mailadres smoketest-account | Nee |
| `SMOKETEST_PASSWORD` | Wachtwoord smoketest-account | Nee |
| `EXPO_TOKEN` | Expo access token (account `futur-holding`) voor de automatische OTA-update van de monteur-app na elke deploy | Nee* |

\* `EXPO_TOKEN` staat sinds 16 augustus 2026 ingesteld als GitHub Actions secret; de eerste automatische OTA-update is diezelfde dag aantoonbaar geland op het `production`-kanaal (update-groep `9732cfb2`, deploy `afbc2b5`). Zonder `EXPO_TOKEN` slaagt de deploy gewoon, maar wordt de OTA-update-stap met een waarschuwing overgeslagen en stuurt de workflow een e-mail naar René (zie "OTA-update bewaking" hieronder) — monteurs krijgen dan geen automatische app-update en er moet handmatig `npx eas-cli update --channel production` gedraaid worden (zie `docs/monteur-app-apk.md`).

### OTA-update bewaking (EXPO_TOKEN verloop of eas-cli fout)

Wanneer de OTA-updatestap wordt overgeslagen omdat `EXPO_TOKEN` ontbreekt, of wanneer `eas-cli` een foutcode teruggeeft, stuurt de workflow automatisch een e-mail naar René via dezelfde Microsoft 365/Graph-koppeling als de overige deploy-meldingen. De deploy zelf slaagt (de web- en API-containers zijn op dat moment al live); alleen de app-update is niet uitgerold.

- **Token ontbreekt:** het e-mailonderwerp is "FPS Connect: OTA-update monteur-app OVERGESLAGEN — EXPO_TOKEN ontbreekt". Voeg het token toe via GitHub → Settings → Secrets and variables → Actions (secret naam: `EXPO_TOKEN`).
- **eas-cli fout:** het onderwerp is "FPS Connect: OTA-update monteur-app GEFAALD — eas-cli fout". Raadpleeg de Actions-run voor de foutuitvoer.
- **Handmatige herstelstap:** draai in beide gevallen handmatig `cd artifacts/monteur-app && npx eas-cli update --channel production --platform android`.

De meldingstap loopt alleen als de mailconfig (`AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `RENE_ALERT_EMAIL`) aanwezig is; ontbreekt die, dan verschijnt alleen een waarschuwing in de run-logs.

Als `PROD_SSH_KEY` of `PROD_SSH_HOST` ontbreken, stopt de GitHub Actions workflow onmiddellijk met een foutmelding maar mislukt de _merge_ er niet door.

**Tijdelijke workaround als GitHub Actions niet geconfigureerd is:** Voer `scripts/deploy-production.sh` direct op de VPS uit (SSH naar `rene@149.210.181.47`, zie sectie "Handmatig deployen" hieronder).

### Overige eigenschappen

- **Niet-fataal voor merge:** als de push mislukt, waarschuwt het script maar stopt het post-merge proces niet
- **Token-validatie:** vóór elke push valideert het script het token via de GitHub API (`/user`); een verlopen token geeft een expliciete foutmelding met vernieuwingsinstructies (geen stille fout)
- **Bijna-verlopen waarschuwing:** als de vervaldatum binnen 14 dagen valt, print Stap 7 een waarschuwing in de post-merge logs
- **Dagelijkse health-check:** `.github/workflows/token-health-check.yml` controleert elke dag om 08:00 UTC of het token nog geldig is en stuurt een e-mail aan René als het verlopen of bijna-verlopen is
- **Handmatig herstellen bij mislukking:** zie de sectie "GITHUB_TOKEN_PUSH vernieuwen" hieronder

---

## GITHUB_TOKEN_PUSH vernieuwen

`GITHUB_TOKEN_PUSH` is een persoonlijk access-token (PAT) van het GitHub-account `vinkrene-jpg`. PAT's hebben een vervaldatum. Als het token verloopt stopt de automatische deploy-keten. De dagelijkse health-check (`token-health-check.yml`) stuurt een e-mail zodra het token verlopen is of binnen 14 dagen verloopt.

### Stappen om het token te vernieuwen

1. **Nieuw token aanmaken of bestaande verlengen**
   - Ga naar [github.com/settings/personal-access-tokens](https://github.com/settings/personal-access-tokens) (ingelogd als `vinkrene-jpg`)
   - Kies het bestaande deploy-token en verleng het, of maak een nieuw token aan
   - Vereiste scope: **Contents: Write** op de `Futur-Holding-BV/FPS-Connect` repository (fine-grained PAT) of `repo` (classic PAT). Let op: sinds de verhuizing van de repo naar de organisatie moet het token (van account `vinkrene-jpg`) expliciet toegang hebben op de organisatie-repo.
   - Stel de vervaldatum in op maximaal 1 jaar; noteer de nieuwe vervaldatum

2. **Replit Secret bijwerken**
   - Open de Replit-editor voor dit project
   - Ga naar het slotje (Secrets) in de linker zijbalk
   - Zoek `GITHUB_TOKEN_PUSH` en vervang de waarde door het nieuwe token

3. **GitHub Actions Secret bijwerken**
   - Ga naar `github.com/Futur-Holding-BV/FPS-Connect` > Settings > Secrets and variables > Actions
   - Zoek `FPS_PUSH_TOKEN` en vervang de waarde door het nieuwe token (Actions-secretnamen mogen niet met `GITHUB_` beginnen; dit is hetzelfde PAT als het Replit-secret `GITHUB_TOKEN_PUSH`)
   - Dit secret is nodig voor de dagelijkse health-check workflow

4. **Controleer de werking**
   - Open een Replit-shell en voer uit:
     ```bash
     curl -sS -H "Authorization: token $GITHUB_TOKEN_PUSH" https://api.github.com/user
     ```
   - Verwacht: JSON met `"login": "vinkrene-jpg"` en HTTP 200
   - Of start de health-check handmatig via GitHub Actions > "GitHub push-token gezondheidscheck" > "Run workflow"

### Welke twee plekken moeten gesynchroniseerd blijven

| Locatie | Secretnaam | Gebruikt door |
|---|---|---|
| Replit Secrets | `GITHUB_TOKEN_PUSH` | `scripts/post-merge.sh` (Stap 7) |
| GitHub repo Secrets | `FPS_PUSH_TOKEN` | `.github/workflows/token-health-check.yml` |

> **Let op:** de Actions-secretnaam is `FPS_PUSH_TOKEN` (niet `GITHUB_TOKEN_PUSH`), omdat GitHub Actions-secretnamen niet met `GITHUB_` mogen beginnen. Beide bevatten dezelfde PAT-waarde.

### Benodigde GitHub Actions secrets token-health-check

De workflow `.github/workflows/token-health-check.yml` vereist vijf verplichte GitHub Actions secrets. De workflow valideert actief of de vier Azure/mail-secrets aanwezig zijn; ontbreekt er één, dan faalt de workflow direct met een expliciete foutmelding en een lijst van de ontbrekende secrets. Daarnaast is `FPS_PUSH_TOKEN` nodig zodat de workflow het token zelf kan controleren — ontbreekt dit secret, dan rapporteert de workflow `status=ontbreekt` (token onbekend) en probeert vervolgens alsnog de mail te sturen.

| Secret | Doel | Gevalideerd door workflow |
|---|---|---|
| `FPS_PUSH_TOKEN` | PAT waarvan de geldigheid wordt gecontroleerd (zelfde waarde als Replit-secret `GITHUB_TOKEN_PUSH`) | Nee — token wordt als `ontbreekt` gerapporteerd |
| `AZURE_TENANT_ID` | Microsoft Graph OAuth — tenant voor Graph-mailkoppeling | **Ja — ontbreken → `exit 1`** |
| `AZURE_CLIENT_ID` | Microsoft Graph OAuth — client-id van de Azure-app | **Ja — ontbreken → `exit 1`** |
| `AZURE_CLIENT_SECRET` | Microsoft Graph OAuth — client-secret van de Azure-app | **Ja — ontbreken → `exit 1`** |
| `RENE_ALERT_EMAIL` | E-mailadres van de ontvanger van token-waarschuwingen | **Ja — ontbreken → `exit 1`** |
| `MAIL_FROM` | Zichtbaar afzenderadres (fallback: `noreply@fpsbrandpreventie.nl`) | Nee |
| `MAIL_MAILBOX` | Gedeelde postbus die via Graph verzendt (fallback: `app@fpsbrandpreventie.nl`) | Nee |

Ook na geslaagde validatie faalt de workflow (zichtbaar als rode run) als de Azure-token-aanvraag of het Graph-sendMail-verzoek mislukt, zodat elke alert-leveringsfout zichtbaar is.

Configureer de ontbrekende secrets via: **github.com/Futur-Holding-BV/FPS-Connect → Settings → Secrets and variables → Actions**.

### Wat te doen als de push al mislukt is

Als er een merge heeft plaatsgevonden met een verlopen token is de VPS niet bijgewerkt. Herstel:

```bash
# In een Replit-shell, nadat het token vernieuwd is:
git push https://github.com/Futur-Holding-BV/FPS-Connect.git main
# (het script gebruikt GIT_ASKPASS; handmatig: voeg token toe aan de URL of stel GIT_ASKPASS in)
```

Of trigger de deploy handmatig via GitHub Actions > `deploy.yml` > "Run workflow".

---

## Verwijzingscode terugzoeken in Sentry (SENTRY_01, 8 aug 2026)

Meldt een gebruiker een fout met een `FPS-`-code (bijv. `FPS-3A9C1B04`)?

1. Open Sentry (EU): `https://futur-holding.de.sentry.io`, project **fps-connect-api**.
2. Zoek in Issues op de tag: `verwijzingscode:FPS-3A9C1B04`.
3. Het event toont de stacktrace (bronbestand + regelnummer dankzij de sourcemap-upload in deploystap 5b), de release (commit-SHA) en methode/pad van het verzoek. Request body, cookies, authorization-headers en querystrings worden bewust nooit meegestuurd.

Geen event te vinden? Dan is de fout van vóór de Sentry-koppeling of ontbrak `SENTRY_DSN` — zoek dan op de code in de containerlogs: `docker logs deploy-api-1 2>&1 | grep FPS-3A9C1B04`.

---

## Deploybeleid: productie als acceptatieomgeving (vastgesteld 10 juli 2026)

Dit beleid is leidend voor het hele runbook en voor alle deploys.

**Context.** Productie is momenteel de actieve acceptatie-/testomgeving. Noodzakelijke
fixes worden **direct naar productie gedeployed zodra GitHub CI groen is** — zonder aparte
staging-cyclus en zonder aparte productie-goedkeuring per fix. Dit vervangt het eerdere
proces "deploy pas ná goedkeuring van een reviewer".

**Verplichte gates (alle vier groen vóór deploy):**

0. Pre-deploy controles in `deploy.yml` zelf: de workflow draait `pnpm run typecheck`,
   `check-dubbele-routes` en `klant-poort-check` vóórdat de VPS wordt aangeraakt.
   Faalt één van deze controles, dan wordt er **niets** uitgerold — een push met rode
   typecheck bereikt de server dus nooit (ingevoerd na het incident van 8 aug 2026,
   waarbij gemangelde `opname.ts` ~15 min live stond).
1. GitHub CI groen.
2. Geen destructieve databasemigratie zonder expliciete waarschuwing.
3. Geen verzwakking van de beveiliging.
4. Deploy via de bekende route: `rene@149.210.181.47`, repo in `/opt/fps-one` (server
   pullt zelf van GitHub; volgorde: back-up → git pull → compose build → migrate → up -d
   → healthz).

**Geautomatiseerde smoketest (GitHub Actions):**

Na elke deploy via `deploy.yml` voert de workflow automatisch drie API-checks uit vanaf de Actions runner (externe toegang, zelfde route als een eindgebruiker):

1. `GET /api/healthz` → verwacht `{"status":"ok"}`
2. `POST /api/auth/login` met de smoketest-credentials (GitHub Secret `SMOKETEST_EMAIL` + `SMOKETEST_PASSWORD`) → verwacht HTTP 200 + sessiecookie
3. `GET /api/gebruikers` met die sessie → verwacht een niet-lege lijst

Bij falen stuurt de workflow automatisch een e-mail naar René (via de Graph/mail-koppeling). Bij succes geen e-mail.

**Automatische OTA-update monteur-app:** na een geslaagde deploy + smoketest publiceert `deploy.yml` automatisch een EAS Update op kanaal `production` (`npx eas-cli update --channel production --non-interactive`), zodat monteurs bij de volgende app-start de nieuwste JS-code krijgen. Vereist GitHub Secret `EXPO_TOKEN`; ontbreekt dat, dan wordt deze stap met een waarschuwing overgeslagen (de deploy faalt er niet op). Native wijzigingen vergen nog steeds een nieuwe APK — zie `docs/monteur-app-apk.md`.

**Benodigde GitHub Secrets voor de smoketest:**
- `SMOKETEST_EMAIL` — e-mailadres van het smoketest-account
- `SMOKETEST_PASSWORD` — wachtwoord van dat account

Als de secrets ontbreken, wordt de smoketest overgeslagen met een waarschuwing (de deploy mislukt er niet door).

**Noodfix: gate bewust passeren**

De pre-deploy controles (typecheck, dubbele-routes, klant-poort) kunnen in een
noodgeval bewust worden overgeslagen — bijvoorbeeld als productie plat ligt en de
controles zelf de blokkade zijn (kapotte CI-tooling, een typefout in een controle-
script). Dat kan uitsluitend handmatig:

1. Ga naar GitHub → Actions → workflow "Deploy naar productie" → **Run workflow**.
2. Vul in het invoerveld `noodfix` exact de waarde `NOODFIX` in (hoofdletters).
3. Start de run. De workflow logt een duidelijke waarschuwing
   ("NOODFIX-BYPASS ACTIEF") en slaat alleen de drie controle-stappen over;
   de deploy-stappen en de post-deploy smoketest draaien gewoon.

Een gewone push naar `main` kan de gate **nooit** omzeilen: de bypass werkt alleen
via `workflow_dispatch` met die expliciete input. Herstel na een noodfix altijd zo
snel mogelijk de reguliere situatie (controles groen op de eerstvolgende commit).

**Aanvullende handmatige smoketest na elke deploy:**

- [ ] Jacqueline login werkt
- [ ] De geraakte functionaliteit werkt

**Bij falende smoketest:** direct fixen → opnieuw deployen → opnieuw testen.

**Geen aparte productie-goedkeuring vereist**, behalve bij één van deze drie
uitzonderingen: destructieve migratie, beveiligingsrisico of deploymentfout.

**Bekende aandachtspunten bij de smoketest (nog niet opgelost, zie changelog 9 juli 2026):**

- **Mailvariabelen ontbreken op productie.** `deploy/.env.production` mist de Microsoft 365
  Graph-variabelen (`AZURE_TENANT_ID`/`AZURE_CLIENT_ID`/`AZURE_CLIENT_SECRET`/`MAIL_FROM`/
  `MAIL_MAILBOX`); uitnodigings- en wachtwoord-vergeten-mails komen daardoor niet aan. Test
  loginflows daarom met accounts die al een wachtwoord hebben.
- **Post-merge faalmelding-fallback.** Als de Graph-e-mailconfiguratie ontbreekt of faalt,
  probeert `scripts/post-merge.sh` een melding via `SLACK_WEBHOOK_URL` (Slack Incoming Webhook)
  en daarna via `NTFY_URL` (ntfy push-service). Stel minstens één van deze als Replit-secret in
  om zeker te zijn dat faalberichten aankomen. Volgorde: Graph-e-mail → Slack → ntfy.
- **Api-container logt 0 regels op productie.** Bewijsvoering van geslaagde/mislukte logins
  loopt via de `login_pogingen`-tabel (read-only DB-query), niet via de container-logs.

---

## Servergegevens

| Gegeven | Waarde |
|---|---|
| VPS naam | fps-connect-prod |
| VPS IP | 149.210.181.47 |
| Domein | connect.fps-one.nl |
| OS | Ubuntu 24.04 LTS |
| Deploymentpad | /opt/fps-one |
| SSH-gebruiker voor deploys | rene (lid van docker-groep) |
| SSH-poort | 22 |

---

## Configuratiebestanden

| Bestand | Pad op VPS |
|---|---|
| Compose file | /opt/fps-one/deploy/docker-compose.production.yml |
| Env file | /opt/fps-one/deploy/.env.production (ongetrackt, blijft bij pulls staan) |
| Caddyfile | /opt/fps-one/deploy/Caddyfile (ingebakken in image) |

---

## Standaard deployment-commando's

Alle commando's worden uitgevoerd als `rene` vanuit `/opt/fps-one`.

### Pre-release backup

```bash
docker compose -f deploy/docker-compose.production.yml \
  --env-file deploy/.env.production \
  --profile backup run --rm backup
```

Controleer na backup:
```bash
ls -lh deploy/db-backups/ | head -3
gunzip -t deploy/db-backups/fps_*.sql.gz | tail -1
```

### Code ophalen

```bash
git pull origin main
```

### Caddy rebuild (na frontend- of Caddyfile-wijziging)

```bash
docker compose -f deploy/docker-compose.production.yml \
  --env-file deploy/.env.production \
  build --no-cache caddy
```

### Caddy herstarten

```bash
docker compose -f deploy/docker-compose.production.yml \
  --env-file deploy/.env.production \
  up -d caddy
```

### Volledige stack herstarten (inclusief API)

```bash
docker compose -f deploy/docker-compose.production.yml \
  --env-file deploy/.env.production \
  up -d
```

### Healthcheck

```bash
curl -s https://connect.fps-one.nl/api/healthz
```

Verwacht: `{"status":"ok"}`

### Containerstatus

```bash
docker compose -f deploy/docker-compose.production.yml ps
```

### API-logs controleren op fouten

```bash
docker compose -f deploy/docker-compose.production.yml \
  logs api --tail=200 | grep -i "error\|warn"
```

---

## Standaard deploy-volgorde

1. Backup maken (zie boven)
2. `git pull origin main`
3. Bij uitsluitend frontend-wijziging: alleen caddy rebuilden en herstarten
4. Bij API-wijziging: `build --no-cache api` + `up -d api`
5. Bij DB-schemawijziging: eerst `run --rm migrate`, dan containers herstarten
6. Healthcheck uitvoeren

## Schemawijzigingen (SCHEMA_01, sinds 7 aug 2026)

- **Elke schemawijziging = een genummerd bestand** in `lib/db/src/migrations/` (`NNNN_naam.sql`, oplopend, met toelichting bovenaan). Nooit meer via `drizzle-kit push` op productie; het `push`-script bestaat alleen nog voor lokaal ontwikkelwerk. `apply-additive.mjs` is bevroren — geen nieuwe stappen toevoegen.
- De migratierunner (`pnpm --filter @workspace/db run migrate`) houdt in de tabel `schema_migraties` bij wat wanneer gedraaid heeft, voert alleen openstaande migraties uit (elk in een eigen transactie) en stopt als de database migraties kent die de repo niet heeft.
- `lib/db/schema.sql` is de momentopname van productie (nulpunt 7 aug 2026). `lib/db/schema-verwachting.txt` is de compacte verwachting waar de drift-check (`run drift-check`) de database bij elke deploy tegen aflegt; bij een nieuwe migratie hoort dit bestand mee te veranderen (`drift-check --update` tegen een volledig gemigreerde database, daarna de prod-specifieke verschillen controleren).
- Snel controleren of een migratie gedraaid heeft: `SELECT * FROM schema_migraties ORDER BY uitgevoerd_op DESC;`

---

## Bekende problemen

### Kantoor-FortiGate blokkeert connect.fps-one.nl

Het kantoornetwerk blokkeert toegang tot `connect.fps-one.nl` via de FortiGate-firewall. Oplossingen:

- Gebruik een mobiel datanetwerk (hotspot) om de applicatie te bereiken vanuit het kantoor
- Vraag de netwerkbeheerder om `connect.fps-one.nl` op de whitelist te zetten
- De API (`/api/healthz`) is wel bereikbaar voor server-side monitoring buiten het kantoornetwerk

---

## SSH-sleutelbeheer (gereconstrueerd en bevestigd, 9 juli 2026)

- Sleutelbestand: `C:\Users\rene\.ssh\fps_productie_nieuw` (ed25519, commentaar `fps-productie-beheer`)
- Geautoriseerd op VPS: `/home/rene/.ssh/authorized_keys` — deploys lopen als **`rene`**, niet als `fps-beheer`
- `fps-beheer` heeft géén geautoriseerde sleutel; de hardening uit `deploy/SERVER_HARDENING.md` (AllowUsers, PasswordAuthentication no) is nooit toegepast
- De eerdere claim dat deployments via de Node.js `ssh2`-bibliotheek liepen is weerlegd: daar is geen bewijs voor gevonden; deploys gaan via gewone `ssh -i <sleutel> rene@149.210.181.47`
- **Aanbevolen:** de sleutel is op 9 juli 2026 in de chat gedeeld en daarmee blootgesteld — vervang hem bij gelegenheid (nieuwe sleutel genereren, publieke sleutel toevoegen aan `/home/rene/.ssh/authorized_keys`, oude regel verwijderen)

### Bekende valkuil: .dockerignore en scripts/package.json

`deploy/Dockerfile.caddy` kopieert `scripts/package.json`; de `.dockerignore` moet daarom `scripts/*` + `!scripts/package.json` bevatten (niet kaal `scripts`). Sinds commit `c93e4b42` staat dit correct op `main`.

---

## Rollback

Zie [deploy/ROLLBACK_PRODUCTION.md](../deploy/ROLLBACK_PRODUCTION.md) voor de volledige rollback-procedure.

Bij een mislukte deploy:
1. Noteer het backup-bestandsnaam van vóór de deploy
2. Voer de rollback-procedure uit
3. Controleer healthcheck na rollback

### Automatische rollback (deploy-script)

`scripts/deploy-production.sh` voert na containers-start een health-poll uit (max 150 seconden, elke 5 seconden `GET /api/healthz`). Als de healthcheck na de timeout geen `{"status":"ok"}` geeft, rolt het script **automatisch** terug:

1. `git reset --hard <vorige-commit>` — applicatiecode terug naar de vorige versie
2. `docker compose build api caddy` — images opnieuw bouwen
3. `docker compose up -d` — containers herstarten
4. Opnieuw healthcheck na rollback

De automatische rollback dekt alleen Niveau 1 (applicatiecode). Een rollback mét schemawijzigingen (Niveau 2) blijft handmatig — zie `deploy/ROLLBACK_PRODUCTION.md`.

---

## Versie controleren

### Via de Systeemstatus-pagina

Log in als hoofdbeheerder op `https://connect.fps-one.nl` en ga naar **Instellingen → Systeemstatus**. De pagina toont:
- Actieve Git-commit (met link naar GitHub)
- Versienummer en builddatum
- Verbindingsstatus van DB, objectopslag, mail en AI

### Via de API (publiek, geen auth vereist)

```bash
# Versie-informatie
curl -s https://connect.fps-one.nl/api/versie | python3 -m json.tool

# Verbindingsstatus
curl -s https://connect.fps-one.nl/api/versie/status | python3 -m json.tool
```

Verwachte output `/api/versie`:
```json
{
  "versie": "2026.07.16-a1b2c3d",
  "commit": "a1b2c3d",
  "gebouwd_op": "2026-07-16T14:23:00Z"
}
```

Verwachte output `/api/versie/status`:
```json
{
  "db": "ok",
  "opslag": "ok",
  "mail": "ok",
  "ai": "ok",
  "aangemaakt_op": "2026-07-16T14:25:00.000Z"
}
```

---

## Smoketest handmatig triggeren

### Via GitHub Actions UI

1. Ga naar `https://github.com/Futur-Holding-BV/FPS-Connect/actions/workflows/deploy.yml`
2. Klik op **"Run workflow"** → branch `main` → **"Run workflow"**
3. De deploy-workflow start opnieuw inclusief de volledige smoketest (15 checks)

### Handmatig via curl (lokaal)

```bash
BASE="https://connect.fps-one.nl"

# 1. Healthcheck
curl -s "$BASE/api/healthz"

# 2. Versie
curl -s "$BASE/api/versie"

# 3. Systeemstatus
curl -s "$BASE/api/versie/status"

# 4. Login (gebruik smoketest-account)
curl -c /tmp/cookie.txt -s -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"SMOKETEST_EMAIL","wachtwoord":"SMOKETEST_PASSWORD"}'

# 5. Dashboard stats (met sessie)
curl -b /tmp/cookie.txt -s "$BASE/api/dashboard/stats"

rm -f /tmp/cookie.txt
```

---

## Omgevingsvariabelen checklist

Zie [`docs/productie-env-checklist.md`](productie-env-checklist.md) voor de volledige tabel van verplichte en optionele productie-omgevingsvariabelen, inclusief welke uitsluitend op de VPS staan en welke ook als GitHub Actions secret moeten worden ingesteld.

`scripts/deploy-production.sh` controleert automatisch de tien verplichte variabelen vóór elke deployment. Ontbreekt er één, dan stopt de deployment met een duidelijke foutmelding.

---

## Vóór de merge: bewijs eerst het gemelde scenario

Vóór de merge — dus vóór het automatisch naar productie gaat: het gemelde probleem is vers getest en aantoonbaar opgelost, niet aangenomen. "Het compileert" of "de tests slagen" is geen bewijs dat het gemelde scenario werkt. Toon het scenario zelf, uitgevoerd na de wijziging, met resultaat. Dit staat los van — en gaat vooraf aan — de vijf controles hieronder, die pas ná de deploy draaien en dus nooit voorkomen dat een niet-geverifieerde wijziging al zichtbaar is voor het kantoor.

## Definition of Done (voor toekomstige taken)

Een taak is pas **gereed voor productie** wanneer:

1. **GitHub CI groen** — typecheck + build slagen
2. **Post-merge stap 4 (schema-healthcheck) groen** — alle kritieke kolommen aanwezig
3. **GitHub Actions smoketest groen** — alle 15 checks slagen op `connect.fps-one.nl`
4. **Systeemstatus zichtbaar** — `/beheer/systeemstatus` toont de nieuwe commit
5. **Geen rollback getriggerd** — automatische rollback is niet geactiveerd

Kortweg: **pas gereed na geslaagde smoketests op `connect.fps-one.nl` met de nieuwe commit zichtbaar op `/beheer/systeemstatus`.**
