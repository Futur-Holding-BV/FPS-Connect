# FPS Connect — Productie-installatie

Instructies voor een verse installatie op een eigen Ubuntu LTS-server, volledig los van Replit.

## Serververeisten

| Component | Minimum | Aanbevolen |
|---|---|---|
| OS | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS |
| CPU | 2 vCPU | 4 vCPU |
| RAM | 4 GB | 8 GB |
| Schijf | 40 GB SSD | 100 GB SSD |
| Docker | 24+ | 26+ |
| Docker Compose | 2.20+ | 2.27+ |

## Stap 1 — Server voorbereiden

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y docker.io docker-compose-plugin git curl

# Docker starten
sudo systemctl enable docker && sudo systemctl start docker
sudo usermod -aG docker $USER
# Log opnieuw in na usermod
```

## Stap 2 — Repository ophalen

```bash
git clone https://github.com/jouwnaam/fps-connect.git /opt/fps-connect
cd /opt/fps-connect
```

## Stap 3 — Productie-omgeving configureren

```bash
cd deploy/
cp ENV_PRODUCTION.example .env.production
nano .env.production   # Vul alle CHANGEME-waarden in

# Stel ook het Postgres-wachtwoord in als losse var (Docker Compose leest dit):
echo "POSTGRES_PASSWORD=JOUW_VEILIG_WACHTWOORD" >> .env.production
```

Vereiste waarden in `.env.production` — zie [ENV_PRODUCTION.example](ENV_PRODUCTION.example).

## Stap 4 — Caddyfile aanpassen

```bash
nano deploy/Caddyfile
# Vervang fpsbrandpreventie.nl door je eigen domein
```

Zorg dat het DNS-record van je domein wijst naar het IP-adres van deze server **vóór** je Caddy start. Caddy haalt automatisch een Let's Encrypt-certificaat op.

## Stap 5 — Database-migraties uitvoeren

```bash
cd /opt/fps-connect
docker compose -f deploy/docker-compose.production.yml --env-file deploy/.env.production run --rm migrate
```

Verwacht output: `All statements were executed. No errors.`

## Stap 6 — Applicatie starten

```bash
docker compose -f deploy/docker-compose.production.yml --env-file deploy/.env.production up -d
```

## Stap 7 — Eerste hoofdbeheerder aanmaken

Er is nog geen gebruiker in een verse database. Maak de eerste hoofdbeheerder aan via de API:

```bash
curl -s -X POST https://jouwdomein.nl/api/auth/registreer-eerste-beheerder \
  -H "Content-Type: application/json" \
  -d '{"naam":"René","email":"rene@fpsbrandpreventie.nl","wachtwoord":"TijdelijkWachtwoord123!"}'
```

> Zie de applicatie-documentatie voor de exacte route; bij een bestaande migratie vanuit Replit wordt dit overgeslagen.

## Stap 8 — Nul-backup maken

Direct na installatie, vóór het invoeren van echte data:

```bash
docker compose -f deploy/docker-compose.production.yml --env-file deploy/.env.production \
  --profile backup run --rm backup
ls -lh deploy/db-backups/
```

## Stap 9 — Smoke test

```bash
# Healthcheck
curl -s https://jouwdomein.nl/api/healthz

# Release actief
curl -s https://jouwdomein.nl/api/kantoor-release/actief | python3 -m json.tool
```

## Stap 10 — Automatische dagelijkse backup instellen

```bash
# Crontab voor de server-gebruiker die Docker mag draaien
crontab -e
```

Voeg toe:
```
0 3 * * * cd /opt/fps-connect && docker compose -f deploy/docker-compose.production.yml --env-file deploy/.env.production --profile backup run --rm backup >> /var/log/fps-backup.log 2>&1
```

## Logbestanden controleren

```bash
docker compose -f deploy/docker-compose.production.yml logs api --tail=100 -f
docker compose -f deploy/docker-compose.production.yml logs frontend --tail=50
```

## Updaten naar een nieuwe versie

```bash
cd /opt/fps-connect
git pull
docker compose -f deploy/docker-compose.production.yml --env-file deploy/.env.production build
docker compose -f deploy/docker-compose.production.yml --env-file deploy/.env.production run --rm migrate
docker compose -f deploy/docker-compose.production.yml --env-file deploy/.env.production up -d
```
