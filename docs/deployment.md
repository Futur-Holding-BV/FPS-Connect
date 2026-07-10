# FPS Connect — Deploymenthandleiding

Replit wordt uitsluitend gebruikt als **ontwikkel- en testomgeving**.
Deze handleiding beschrijft hoe de productieversie van FPS Connect op een
externe server wordt ingericht met een eigen database, object storage en
een gecontroleerd deployment-proces.

> **Deploybeleid (vastgesteld 10 juli 2026): productie als acceptatieomgeving.**
> Productie is momenteel de actieve acceptatie-/testomgeving. Noodzakelijke fixes
> worden **direct naar productie gedeployed zodra GitHub CI groen is** — zonder aparte
> staging-cyclus en zonder aparte productie-goedkeuring per fix. Het eerdere proces
> "deploy pas ná goedkeuring van een reviewer" is hiermee **vervallen**. De vijf gates,
> de smoketest en de uitzonderingen staan als leidend beleid in
> [`docs/PRODUCTION_RUNBOOK.md`](PRODUCTION_RUNBOOK.md). De passages hieronder zijn met
> dat beleid in lijn gebracht.

---

## Inhoudsopgave

1. [Architectuuroverzicht](#1-architectuuroverzicht)
2. [Vereisten](#2-vereisten)
3. [Servervoorbereiding](#3-servervoorbereiding)
4. [Database (PostgreSQL)](#4-database-postgresql)
5. [Object storage (S3-compatibel)](#5-object-storage-s3-compatibel)
6. [Omgevingsvariabelen](#6-omgevingsvariabelen)
7. [GitHub Actions CI/CD](#7-github-actions-cicd)
8. [Eerste deployment](#8-eerste-deployment)
9. [Latere deployments (direct-deploy-beleid)](#9-latere-deployments-direct-deploy-beleid)
10. [TLS / HTTPS](#10-tls--https)
11. [Back-up & onderhoud](#11-back-up--onderhoud)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Architectuuroverzicht

```
Internet
   │
   ▼
[nginx / Cloudflare]       ← HTTPS-terminatie + statische assets
   │          │
   │          ▼
   │     /usr/share/nginx/html  (React SPA)
   │
   ▼ /api/*
[api-server: Node.js]      ← Express 5, poort 8080
   │          │
   │          ▼
   │     [PostgreSQL]       ← sessies + applicatiedata
   │
   └────► [S3-compatibel]  ← foto's, documenten, rapporten
          (R2 / S3 / MinIO)
```

**Backend-agnostische objectopslag**: de api-server detecteert automatisch
welke backend gebruikt moet worden:
- `S3_BUCKET` ingesteld → S3-compatibele backend (productie)
- Niet ingesteld → Replit GCS-backend (Replit-dev)

---

## 2. Vereisten

| Component | Minimaal | Aanbevolen |
|---|---|---|
| **Server** | 1 vCPU, 1 GB RAM | 2 vCPU, 2 GB RAM |
| **OS** | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS |
| **Docker** | 24+ | 27+ |
| **Docker Compose** | v2.20+ | v2.27+ |
| **PostgreSQL** | 15 | 17 (via Docker) |
| **GitHub** | Repository aanwezig | — |

---

## 3. Servervoorbereiding

### Docker installeren (Ubuntu)

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Opnieuw inloggen zodat de groepswijziging actief wordt
```

### Directorystructuur aanmaken

```bash
sudo mkdir -p /opt/fps-connect
sudo chown $USER:$USER /opt/fps-connect
cd /opt/fps-connect

# GitHub Actions SSH-sleutel aanmaken (zie stap 7)
ssh-keygen -t ed25519 -C "fps-connect-deploy" -f ~/.ssh/fps_deploy_key -N ""
cat ~/.ssh/fps_deploy_key.pub >> ~/.ssh/authorized_keys
```

---

## 4. Database (PostgreSQL)

### Optie A: Docker (inclusief in docker-compose.production.yml)

Maak `.env.db` aan in `/opt/fps-connect/`:

```bash
cat > /opt/fps-connect/.env.db << 'EOF'
POSTGRES_USER=fps
POSTGRES_PASSWORD=KIES_EEN_STERK_WACHTWOORD
POSTGRES_DB=fps_connect
EOF
chmod 600 /opt/fps-connect/.env.db
```

De `DATABASE_URL` in `.env.api` wordt dan:
```
DATABASE_URL=postgresql://fps:WACHTWOORD@db:5432/fps_connect
```
*(gebruik `db` als hostnaam — Docker Compose lost dit op)*

### Optie B: Managed database (aanbevolen voor productie)

Gebruik Supabase, Neon, DigitalOcean Managed DB of AWS RDS.
Gebruik de verstrekte connectiestring direct als `DATABASE_URL`.
Verwijder in dat geval de `db`-service uit `docker-compose.production.yml`.

### DB-schema toepassen (eenmalig bij eerste deployment)

```bash
# Vanuit de workspace op Replit (dev-omgeving):
pnpm --filter @workspace/db run push
```

Na elke schemagewijzigde deployment wordt het schema automatisch bijgewerkt
via de deploy-stap in de GitHub Actions workflow.

---

## 5. Object storage (S3-compatibel)

### Cloudflare R2 (aanbevolen — geen egress-kosten)

1. Maak een Cloudflare-account en activeer R2
2. Maak een bucket aan: `fps-connect-productie`
3. Maak een R2 API-token aan met **Object Read & Write** op de bucket
4. Noteer het account-ID (zichtbaar in de R2-dashboardURL)

Resulterende env-variabelen:
```
S3_REGION=auto
S3_BUCKET=fps-connect-productie
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=<token-access-key>
S3_SECRET_ACCESS_KEY=<token-secret>
```

### AWS S3

1. Maak een S3-bucket aan in `eu-west-1` (of de gewenste regio)
2. Maak een IAM-gebruiker aan met de `AmazonS3FullAccess`-policy op de bucket
3. Genereer access keys voor de IAM-gebruiker

```
S3_REGION=eu-west-1
S3_BUCKET=fps-connect-productie
S3_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
S3_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
```

### MinIO (self-hosted)

```bash
docker run -d \
  -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=fps \
  -e MINIO_ROOT_PASSWORD=STERK_WACHTWOORD \
  -v /opt/minio-data:/data \
  minio/minio server /data --console-address :9001
```

```
S3_REGION=us-east-1
S3_BUCKET=fps-connect
S3_ENDPOINT=https://minio.jouwdomein.nl
S3_ACCESS_KEY_ID=fps
S3_SECRET_ACCESS_KEY=STERK_WACHTWOORD
```

---

## 6. Omgevingsvariabelen

Maak `.env.api` aan in `/opt/fps-connect/`:

```bash
cp artifacts/api-server/.env.example /opt/fps-connect/.env.api
nano /opt/fps-connect/.env.api
chmod 600 /opt/fps-connect/.env.api
```

Vul alle `VERANDER_MIJ`-waarden in. De belangrijkste:

| Variabele | Beschrijving |
|---|---|
| `DATABASE_URL` | PostgreSQL connectiestring |
| `SESSION_SECRET` | Willekeurige string ≥ 32 tekens |
| `S3_BUCKET` | Bucketnaam in object storage |
| `S3_ENDPOINT` | Alleen voor R2/MinIO (niet AWS) |
| `S3_ACCESS_KEY_ID` | S3-toegangssleutel |
| `S3_SECRET_ACCESS_KEY` | S3-geheime sleutel |
| `OPENAI_API_KEY` | API-sleutel voor AI-functies |
| `GOOGLE_MAPS_API_KEY` | API-sleutel voor gebouwkaarten |

**SESSION_SECRET genereren:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 7. GitHub Actions CI/CD

### Repository-secrets instellen

Ga naar **GitHub → Repository → Settings → Secrets and variables → Actions**
en voeg toe:

| Secret | Waarde |
|---|---|
| `PROD_SSH_HOST` | IP-adres of hostname van de productieserver |
| `PROD_SSH_USER` | SSH-gebruikersnaam (bijv. `ubuntu`) |
| `PROD_SSH_KEY` | Inhoud van `~/.ssh/fps_deploy_key` (privésleutel) |
| `PROD_SSH_PORT` | SSH-poort (standaard: `22`) |

### Deploybeleid: geen aparte reviewer-goedkeuring meer

> **Vervallen (10 juli 2026).** De eerdere instelling met een `production`-environment en
> **Required reviewers** in GitHub gold onder het oude proces "deploy pas ná goedkeuring
> van een reviewer". Dat proces is vervangen door het direct-deploy-beleid: zodra de
> vijf gates groen zijn wordt direct gedeployed, zonder aparte productie-goedkeuring per
> fix (uitzonderingen: destructieve migratie, beveiligingsrisico of deploymentfout). Zie
> [`docs/PRODUCTION_RUNBOOK.md`](PRODUCTION_RUNBOOK.md) voor het leidende beleid.

**Aan te passen punt in de workflow.** `.github/workflows/deploy.yml` bevat nog
`environment: production` op de deploy-job. Als op dat environment in GitHub een
Required-reviewers-regel staat ingesteld, blijft die een aparte goedkeuring afdwingen en
is dat in strijd met het huidige beleid. Verwijder in dat geval de Required-reviewers op
**GitHub → Settings → Environments → production** (of verwijder de `environment: production`-
regel uit de workflow). De actieve deployroute is echter niet deze SSH-job maar het
handmatig pullen op de server (zie sectie 9); de GitHub-deploy-job draait bovendien pas
als de `PROD_SSH_*`-secrets zijn ingesteld.

### Workflow-bestanden

De CI/CD-configuratie staat in `.github/workflows/`:

- `ci.yml` — draait bij elke push: typecheck + build (dit is gate 1 uit het beleid)
- `deploy.yml` — bouwt Docker images + kan via SSH naar productie deployen

### Deployment starten

De feitelijke productie-deploy verloopt via de bekende route (server pullt zelf); zie
sectie 9. De GitHub Actions-workflow blijft optioneel beschikbaar:

**Handmatig** (GitHub Actions):
1. Ga naar **GitHub → Actions → Deploy naar productie → Run workflow**
2. Kies de branch en optionele image tag
3. De deployment start zonder aparte goedkeuring zodra de gates groen zijn

**Automatisch** (na merge naar `main`):
- CI draait na elke push (gate 1)
- Bij succes op `main` kan de deploy-workflow starten; er is geen goedkeuringswachtrij meer

---

## 8. Eerste deployment

### Docker Compose-bestanden klaarzetten

```bash
cd /opt/fps-connect

# docker-compose.production.yml staat in de repository
# Kopieer het naar de server:
scp docker-compose.production.yml user@server:/opt/fps-connect/

# Pas de REGISTRY-variabele aan indien nodig
export REGISTRY=ghcr.io/fps-brandpreventie
export IMAGE_TAG=latest
```

### Inloggen bij de container registry

Op de productieserver (eenmalig):
```bash
# GitHub Container Registry
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin
```

### Images ophalen en starten

```bash
cd /opt/fps-connect
docker compose -f docker-compose.production.yml pull
docker compose -f docker-compose.production.yml up -d
```

### Controleren

```bash
# Status van alle containers
docker compose -f docker-compose.production.yml ps

# Logs van de api-server
docker compose -f docker-compose.production.yml logs api -f

# Health check
curl http://localhost:8080/healthz
```

---

## 9. Latere deployments (direct-deploy-beleid)

Vanaf 10 juli 2026 geldt: productie is de actieve acceptatieomgeving en noodzakelijke
fixes gaan **direct naar productie zodra de gates groen zijn**, zonder aparte
reviewer-goedkeuring per fix. Het leidende beleid staat in
[`docs/PRODUCTION_RUNBOOK.md`](PRODUCTION_RUNBOOK.md).

**Verplichte gates (alle vier groen vóór deploy):**

1. GitHub CI groen.
2. Geen destructieve databasemigratie zonder expliciete waarschuwing.
3. Geen verzwakking van de beveiliging.
4. Deploy via de bekende route (server pullt zelf van GitHub).

**Deployvolgorde op de server** (`rene@149.210.181.47`, repo in `/opt/fps-one`):

1. **Ontwikkel** op Replit (dev/test) en push naar `main`; CI draait (gate 1)
2. **Back-up** maken (pre-release database-back-up + integriteitscontrole)
3. **`git pull origin main`** op de server
4. **`docker compose build`** van de gewijzigde images
5. **Migreren** (`run --rm migrate`) bij schemawijzigingen — gate 2 bewaken
6. **`up -d`** — containers herstarten (zero-downtime: nieuwe vóór oude)
7. **`/api/healthz`** controleren + de minimale smoketest uitvoeren

**Smoketest na elke deploy:** `/api/healthz`, René login, Jacqueline login,
Gebruikersbeheer opent, en de geraakte functionaliteit werkt.
**Bij falende smoketest:** direct fixen → opnieuw deployen → opnieuw testen.

**Geen aparte productie-goedkeuring vereist**, behalve bij: destructieve migratie,
beveiligingsrisico of deploymentfout.

**Rollback** bij problemen:
```bash
cd /opt/fps-one
# Terug naar de vorige image tag
IMAGE_TAG=<vorige-sha> docker compose -f docker-compose.production.yml up -d
```

---

## 10. TLS / HTTPS

### Optie A: Cloudflare (aanbevolen — geen certificaatbeheer)

1. Zet de DNS van het domein op Cloudflare
2. Activeer "Proxied" voor het A-record
3. Stel SSL/TLS in op "Full (strict)"
4. Cloudflare beëindigt HTTPS; nginx op de server ontvangt HTTP

### Optie B: Let's Encrypt (Certbot)

```bash
sudo apt install certbot
sudo certbot certonly --standalone -d fps-connect.jouwdomein.nl

# Certificaten vernieuwen (automatisch via cron)
sudo crontab -e
# Voeg toe: 0 3 * * * certbot renew --quiet
```

Maak `nginx-ssl.conf` aan en koppel het in `docker-compose.production.yml` via volumes.

---

## 11. Back-up & onderhoud

### Dagelijkse database-back-up

```bash
cat > /opt/fps-connect/backup.sh << 'EOF'
#!/bin/bash
set -e
DATUM=$(date +%Y%m%d_%H%M%S)
docker compose -f /opt/fps-connect/docker-compose.production.yml exec -T db \
  pg_dump -U fps fps_connect | gzip > /opt/backups/fps_connect_${DATUM}.sql.gz
# Bewaar de laatste 30 back-ups
ls -t /opt/backups/fps_connect_*.sql.gz | tail -n +31 | xargs -r rm
EOF
chmod +x /opt/fps-connect/backup.sh
mkdir -p /opt/backups

# Voeg toe aan crontab (dagelijks om 02:00)
crontab -e
# 0 2 * * * /opt/fps-connect/backup.sh
```

### Object storage back-up

Cloudflare R2 en AWS S3 bieden ingebouwde versiebeheer en redundantie.
Voor MinIO: gebruik `mc mirror` om naar een tweede locatie te kopiëren.

---

## 12. Troubleshooting

### API-server start niet op

```bash
docker compose -f docker-compose.production.yml logs api
# Controleer of DATABASE_URL bereikbaar is en alle env-vars zijn ingesteld
```

### Objecten kunnen niet worden geüpload

Controleer S3-variabelen:
```bash
docker compose -f docker-compose.production.yml exec api \
  node -e "console.log(process.env.S3_BUCKET, process.env.S3_REGION)"
```

Zorg dat de S3-bucket bestaat en dat de API-sleutel schrijfrechten heeft.

### Sessies verlopen na herstart

Controleer of `connect-pg-simple` verbinding kan maken met de database.
Sessies worden in de `session`-tabel opgeslagen — zorg dat die aanwezig is:
```sql
-- Wordt automatisch aangemaakt bij de eerste sessie, maar kan ook handmatig:
SELECT * FROM session LIMIT 1;
```

### Presigned upload-URLs werken niet

- Controleer of de S3-bucket CORS-headers toestaat voor het frontend-domein
- Voeg een CORS-regel toe aan de bucket voor `PUT`-verzoeken van het domein

```json
[{
  "AllowedOrigins": ["https://fps-connect.jouwdomein.nl"],
  "AllowedMethods": ["PUT"],
  "AllowedHeaders": ["*"],
  "MaxAgeSeconds": 3600
}]
```
