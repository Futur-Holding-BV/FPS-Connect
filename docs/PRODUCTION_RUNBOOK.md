# FPS Connect — Production Runbook

## Servergegevens

| Gegeven | Waarde |
|---|---|
| VPS naam | fps-connect-prod |
| VPS IP | 149.210.181.47 |
| Domein | connect.fps-one.nl |
| OS | Ubuntu 24.04 LTS |
| Deploymentpad | /opt/fps-connect |
| Beheerdersgebruiker | fps-beheer |
| SSH-poort | 22 |

---

## Configuratiebestanden

| Bestand | Pad op VPS |
|---|---|
| Compose file | /opt/fps-connect/deploy/docker-compose.production.yml |
| Env file | /opt/fps-connect/deploy/.env.production |
| Caddyfile | /opt/fps-connect/deploy/Caddyfile (ingebakken in image) |

---

## Standaard deployment-commando's

Alle commando's worden uitgevoerd als `fps-beheer` vanuit `/opt/fps-connect`.

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

## Open punten

### SSH-sleutelbeheer

**Open punt — vastleggen vanaf welke machine de private SSH-sleutel beschikbaar is.**

Wat bekend is:
- Sleutelnaam: `fps_productie` (ed25519, commentaar `fps-productie-beheer`)
- Publiek sleutelformaat: `ssh-keygen -t ed25519 -C "fps-productie-beheer" -f ~/.ssh/fps_productie`
- Geautoriseerd op VPS: `/home/fps-beheer/.ssh/authorized_keys`
- Vorige deployments zijn uitgevoerd via de Node.js `ssh2`-bibliotheek vanuit de Replit-omgeving, waarbij de private key als Replit-secret beschikbaar was

**Nog niet vastgelegd:**
- Op welke naam de private key als Replit-secret stond opgeslagen (niet meer aanwezig in de huidige secretslijst)
- Of er een lokale kopie van de private key op een andere machine staat
- Of de TransIP-sleutel `rene@fps-one.nl` overeenkomt met de `fps_productie`-sleutel

**Actie vereist:** bevestig waar de private key `fps_productie` bewaard is en sla deze opnieuw op als Replit-secret zodat geautomatiseerde deploys vanuit Replit weer mogelijk zijn.

---

## Rollback

Zie [deploy/ROLLBACK_PRODUCTION.md](../deploy/ROLLBACK_PRODUCTION.md) voor de volledige rollback-procedure.

Bij een mislukte deploy:
1. Noteer het backup-bestandsnaam van vóór de deploy
2. Voer de rollback-procedure uit
3. Controleer healthcheck na rollback
