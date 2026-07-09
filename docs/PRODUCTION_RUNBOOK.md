# FPS Connect — Production Runbook

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
