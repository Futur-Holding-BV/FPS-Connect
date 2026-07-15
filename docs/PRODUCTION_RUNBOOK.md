# FPS Connect — Production Runbook

## Omgevingsscheiding: één productie-URL (vastgesteld 14 juli 2026)

**`connect.fps-one.nl` is de enige productieomgeving.** Er zijn drie losstaande omgevingen:

| Omgeving | URL | Database | Gebruik |
|---|---|---|---|
| VPS productie | `https://connect.fps-one.nl` | VPS PostgreSQL | Eindgebruikers, echte data |
| Replit autoscale | Replit-publieke URL | Replit PostgreSQL | **Niet voor eindgebruikers** |
| Replit dev | `localhost` / Replit-preview | Replit PostgreSQL | Ontwikkeling & testen |

**Automatische doorstuur:** De frontend (`firevault`) stuurt elk verzoek dat binnenkomt op een andere hostname dan `localhost`, `127.0.0.1` of `connect.fps-one.nl` automatisch door naar `https://connect.fps-one.nl` (inclusief pad en querystring). Eindgebruikers die per ongeluk de Replit-URL openen, worden daardoor direct doorgestuurd naar de juiste omgeving.

**Let op bij agent-tools:** `executeSql { environment: "production" }` in de Replit-agent raadpleegt de **Replit**-database, niet de VPS-database. Voor productiedata: SSH naar de VPS of gebruik de productie-backups.

---

## Automatische deploy na Replit-merge (vastgesteld 15 juli 2026)

Na elke taakmerge in Replit pusht het post-merge script (`scripts/post-merge.sh`, Stap 7) automatisch naar `github.com/vinkrene-jpg/fps-one` (main branch). GitHub Actions (`deploy.yml`) triggert hierop direct en de VPS draait binnen 10-15 minuten op de nieuwe code.

- **Vereist secret:** `GITHUB_TOKEN_PUSH` (al geconfigureerd in Replit Secrets)
- **Niet-fataal:** als de push mislukt, waarschuwt het script maar stopt het post-merge proces niet
- **Handmatig herstellen bij mislukking:** `git push origin main` (met geldig `GITHUB_TOKEN_PUSH`)

---

## Deploybeleid: productie als acceptatieomgeving (vastgesteld 10 juli 2026)

Dit beleid is leidend voor het hele runbook en voor alle deploys.

**Context.** Productie is momenteel de actieve acceptatie-/testomgeving. Noodzakelijke
fixes worden **direct naar productie gedeployed zodra GitHub CI groen is** — zonder aparte
staging-cyclus en zonder aparte productie-goedkeuring per fix. Dit vervangt het eerdere
proces "deploy pas ná goedkeuring van een reviewer".

**Verplichte gates (alle vier groen vóór deploy):**

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

**Benodigde GitHub Secrets voor de smoketest:**
- `SMOKETEST_EMAIL` — e-mailadres van het smoketest-account
- `SMOKETEST_PASSWORD` — wachtwoord van dat account

Als de secrets ontbreken, wordt de smoketest overgeslagen met een waarschuwing (de deploy mislukt er niet door).

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
