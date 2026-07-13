# FPS Connect — Productie-installatie

Stap-voor-stap installatie op een eigen Ubuntu LTS-server, volledig los van Replit.

---

## Serververeisten

| Component | Minimum | Aanbevolen |
|---|---|---|
| OS | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS |
| CPU | 2 vCPU | 4 vCPU |
| RAM | 4 GB | 8 GB |
| Schijf | 40 GB SSD | 100 GB SSD |
| Docker | 24+ | 26+ |
| Docker Compose | 2.20+ | 2.27+ |

---

## Productie-architectuur

```
Internet
  │  HTTPS 443 / HTTP 80
  ▼
caddy   — HTTPS (Let's Encrypt automatisch), statische frontend
  │
  ├── /api/*  →  api:8080  (Express 5, Node 24)
  │                │
  │               db:5432  (PostgreSQL 16)
  │
  └── /*      →  /srv/public  (Vite-build, ingebakken in Caddy-image)

Alle services: intern netwerk, geen publieke poorten behalve via Caddy.
```

> Vroeger waren er twee lagen (nginx + Caddy). Dit is vereenvoudigd: Caddy bedient zowel HTTPS, statische bestanden als de API-proxy. Nginx is verwijderd.

---

## Stap 1 — Server beveiligen

Voer **eerst** de volledige server-hardening uit vóór installatie van de applicatie.
Zie [SERVER_HARDENING.md](SERVER_HARDENING.md) voor de volledige procedure.

Minimaal vóór verdergaan:
- [ ] Beheergebruiker aangemaakt met SSH-key
- [ ] Root SSH-login uitgeschakeld
- [ ] UFW actief (poorten 22, 80, 443)
- [ ] Docker geïnstalleerd

---

## Stap 2 — Repository ophalen

```bash
git clone https://github.com/jouwnaam/fps-connect.git /opt/fps-connect
cd /opt/fps-connect
```

---

## Stap 3 — Omgevingsvariabelen instellen

```bash
cd deploy/
cp ENV_PRODUCTION.example .env.production
nano .env.production   # Vul alle CHANGEME-waarden in
```

> Zie het hoofdstuk **Productie-secrets** hieronder voor het rechtenbeheer van dit bestand.

Minimaal vereist:
```
DATABASE_URL=postgres://fps_app:WACHTWOORD@db:5432/fps_production
POSTGRES_PASSWORD=WACHTWOORD  # zelfde als in DATABASE_URL
SESSION_SECRET=<openssl rand -base64 48>
NODE_ENV=production
```

Rechten instellen:
```bash
chmod 600 .env.production
chown fps-beheer:fps-beheer .env.production
```

---

## Stap 4 — Caddyfile aanpassen

```bash
nano deploy/Caddyfile
# Vervang fpsbrandpreventie.nl door je eigen domein
```

Zorg dat het DNS-record wijst naar het server-IP **vóór** het starten van Caddy (anders mislukt het Let's Encrypt-certificaat).

---

## Stap 5 — Database-migraties uitvoeren

```bash
cd /opt/fps-connect
docker compose -f deploy/docker-compose.production.yml --env-file deploy/.env.production run --rm migrate
```

Verwacht: `All statements were executed. No errors.`

---

## Stap 6 — Applicatie starten

```bash
docker compose -f deploy/docker-compose.production.yml --env-file deploy/.env.production up -d --build
docker compose -f deploy/docker-compose.production.yml ps
```

Alle services moeten `running` zijn, behalve `migrate` (die eindigt met `exited 0`).

---

## Stap 7 — Nul-backup maken

Direct na installatie, vóór het invoeren van echte data:

```bash
docker compose -f deploy/docker-compose.production.yml --env-file deploy/.env.production \
  --profile backup run --rm backup
ls -lh deploy/db-backups/

# Objectopslag (geüploade bestanden) spiegelen naar deploy/minio-backups/
docker compose -f deploy/docker-compose.production.yml --env-file deploy/.env.production \
  --profile backup run --rm backup-minio
ls -lh deploy/minio-backups/
```

---

## Stap 8 — Livegang-scenario (DNS)

Volg dit scenario stap voor stap. Zet DNS pas om als alles hieronder groen is.

### Fase 1 — Testen via IP-adres

```bash
# Let's Encrypt werkt alleen met een domeinnaam.
# Test eerst via het IP-adres met een tijdelijk certificaat.
# Zet in Caddyfile tijdelijk:
#   :80 { ... }   (of gebruik localhost.direct voor HTTP-test)

# Healthcheck
curl -s http://SERVER_IP/api/healthz

# Database bereikbaar
curl -s http://SERVER_IP/api/kantoor-release/actief

# Frontend laadt
curl -sI http://SERVER_IP/ | grep "200\|301"
```

### Fase 2 — HTTPS controleren

```bash
# Stel domein in Caddyfile in op jouw domein
# Zorg voor tijdelijk DNS-record (bijv. test-subdomain) of laat Caddy
# tijdelijk een self-signed certificaat gebruiken:
#   tls internal   (in Caddyfile, alleen voor test)

curl -sI https://test.jouwdomein.nl/api/healthz | head -5
# Verwacht: HTTP/2 200
```

### Fase 3 — Volledige smoke test vóór DNS-overgang

```bash
# Login werkt (TOTP)
open https://test.jouwdomein.nl

# Gebouwen (na handmatig inloggen in browser, dan cookies.txt opslaan)
curl -s -b cookies.txt https://test.jouwdomein.nl/api/gebouwen | python3 -m json.tool

# Documenten en uploads testen via de applicatie-UI
# Rapportages testen via de applicatie-UI
# Backupstatus controleren
ls -lh deploy/db-backups/
```

### Fase 4 — DNS overzetten

Pas nadat alle bovenstaande stappen slagen:

```bash
# Stel A-record in bij je DNS-provider:
# fpsbrandpreventie.nl  →  A  →  SERVER_IP

# Wacht op propagatie (max 24 uur)
dig fpsbrandpreventie.nl A
# Verwacht: SERVER_IP

# Caddy haalt automatisch een Let's Encrypt-certificaat op
# Controleer na 2-5 minuten:
curl -sI https://fpsbrandpreventie.nl/ | head -5
```

### Fase 5 — Eindcontrole na DNS-overgang

```bash
curl -s https://fpsbrandpreventie.nl/api/healthz
curl -s https://fpsbrandpreventie.nl/api/kantoor-release/actief | python3 -m json.tool
curl -sI https://fpsbrandpreventie.nl/ | grep -i "strict-transport"
```

---

## Productie-secrets

> Zie ook [ENV_PRODUCTION.example](ENV_PRODUCTION.example) voor alle benodigde variabelen.

### Regels

- **Nooit in Git** — `.env.production` staat in `.gitignore`. Controleer: `git ls-files deploy/.env.production` geeft niets terug.
- **Nooit in broncode** — geen enkele `process.env.*` waarde hardcoded in code.
- **Nooit in backups zonder encryptie** — backups bevatten alleen data, geen secrets. De `.env.production` zit nooit in een database-dump.
- **Rechtenbeheer** — bestand eigendom van `fps-beheer`, rechten `600` (alleen eigenaar kan lezen/schrijven).
- **Rotatiebeleid** — roteer minimaal jaarlijks:
  - `SESSION_SECRET` — genereer nieuw met `openssl rand -base64 48`; alle gebruikers worden uitgelogd
  - `POSTGRES_PASSWORD` — stop eerst de api, pas het wachtwoord aan in PostgreSQL en in `.env.production`, start daarna opnieuw
  - AI-sleutels en Azure-secrets — via de respectieve providers, pas direct bij in `.env.production`
- **Herstelprocedure secrets** — bewaar een versleuteld exemplaar van `.env.production` op een andere locatie (bijv. een wachtwoordmanager of versleuteld tekstbestand op een offline apparaat). Herstel door het bestand terug te plaatsen en `docker compose up -d` uit te voeren.

### .gitignore instellen

```bash
echo "deploy/.env.production" >> .gitignore
echo "deploy/db-backups/" >> .gitignore
git add .gitignore && git commit -m "gitignore: productie-secrets en backups uitsluiten"
```

---

## Object Storage — fasegericht advies

### Fase 1 — MinIO lokaal op dezelfde VPS (aanbevolen startpunt; standaard ingebouwd)

**Wanneer:** bij opstart, weinig data, beperkt budget.

De services `minio` en `minio-init` (bucket-aanmaak) zitten standaard in
`deploy/docker-compose.production.yml`, inclusief het volume `minio_data` en
een Caddy-route voor presigned browser-uploads
(`/fps-production/*` → `minio:9000`). Er hoeft niets aan de compose-file
toegevoegd te worden.

Configureer in `.env.production` (zie `ENV_PRODUCTION.example`):
```
S3_BUCKET=fps-production
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=fps_minio
S3_SECRET_ACCESS_KEY=<zelfde als MINIO_ROOT_PASSWORD>
S3_ENDPOINT=http://minio:9000
S3_PUBLIC_ENDPOINT=https://connect.fps-one.nl
MINIO_ROOT_USER=fps_minio
MINIO_ROOT_PASSWORD=<sterk wachtwoord, bijv. openssl rand -hex 24>
```

`S3_ENDPOINT` is het interne adres (server-side lezen/schrijven binnen het
Docker-netwerk); `S3_PUBLIC_ENDPOINT` is het publieke domein waarop de
browser presigned uploads aanlevert — Caddy stuurt die door naar MinIO met
behoud van de Host-header, anders klopt de SigV4-handtekening niet.

**Voordelen:** volledig lokaal, geen externe afhankelijkheden, S3-compatibel API.
**Nadelen:** data op dezelfde schijf als de applicatie — enkelvoudig foutpunt.

---

### Fase 2 — Aparte storage-server (aanbevolen bij groei)

**Wanneer:** zodra de schijf van de applicatieserver voor >50% vol is, of bij meer dan ~5 GB aan documenten.

- Zet een tweede VPS op (bijv. 2 vCPU, 4 GB RAM, 200 GB SSD)
- Installeer MinIO op de storage-server
- Configureer `S3_ENDPOINT` in `.env.production` op het interne IP van de storage-server
- Netwerk: alleen poort 9000 open tussen applicatieserver en storage-server (niet publiek)
- Dagelijkse `rclone sync` naar externe locatie als off-site backup

**Voordelen:** storage-schijf onafhankelijk van applicatie, aparte schaalbaarheid.

---

### Fase 3 — Externe S3-provider (optioneel, bij hoge eisen)

**Wanneer:** hoge beschikbaarheidseisen, geografische redundantie, of compliance-eisen (NEN 7510, ISO 27001).

Opties:
- **AWS S3** (eu-west-1 = Ierland, eu-central-1 = Frankfurt)
- **Cloudflare R2** (geen egress-kosten, EU-opslaglocatie)
- **Hetzner Object Storage** (100% EU, goedkoop, S3-compatibel)
- **Exoscale SOS** (Zwitsers, AVG-vriendelijk)

Aanpassing in `.env.production`:
```
S3_BUCKET=fps-production
AWS_REGION=eu-central-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
# S3_ENDPOINT weglaten voor AWS; instellen voor andere providers
```

**Waarom deze volgorde voor FPS Connect:** bij opstart is MinIO lokaal de snelste en goedkoopste optie zonder externe afhankelijkheden. Naarmate de hoeveelheid documenten groeit, is het logisch om storage af te splitsen. Een externe provider is alleen zinvol als de beschikbaarheids- of compliance-eisen dat vereisen.

---

## Automatische dagelijkse backup

```bash
crontab -e
```

```
# Database backup dagelijks 03:00
0 3 * * * cd /opt/fps-connect && docker compose -f deploy/docker-compose.production.yml --env-file deploy/.env.production --profile backup run --rm backup >> /var/log/fps-backup.log 2>&1

# Objectopslag-backup (geüploade bestanden) dagelijks 03:30
30 3 * * * cd /opt/fps-connect && docker compose -f deploy/docker-compose.production.yml --env-file deploy/.env.production --profile backup run --rm backup-minio >> /var/log/fps-backup.log 2>&1

# Opschoning: bewaar maximaal 30 dumps
15 3 * * * find /opt/fps-connect/deploy/db-backups -name "fps_*.sql.gz" -mtime +30 -delete

# Backup-controle dagelijks 06:00
0 6 * * * /opt/fps-connect/deploy/check-backup.sh >> /var/log/fps-backup-check.log 2>&1
```

---

## Updaten naar nieuwe versie

```bash
cd /opt/fps-connect

# 1. Backup vóór update
docker compose -f deploy/docker-compose.production.yml --env-file deploy/.env.production \
  --profile backup run --rm backup

# 2. Nieuwe code
git pull

# 3. Herbouwen en migreren
docker compose -f deploy/docker-compose.production.yml --env-file deploy/.env.production build
docker compose -f deploy/docker-compose.production.yml --env-file deploy/.env.production run --rm migrate
docker compose -f deploy/docker-compose.production.yml --env-file deploy/.env.production up -d

# 4. Verificatie
curl -s https://fpsbrandpreventie.nl/api/healthz
```

---

## Productie Acceptatie

Beantwoord elk punt met ja/nee vóór ingebruikname met echte bedrijfsdata.

**Infrastructuur**
- [ ] Server gehard (zie SERVER_HARDENING.md)
- [ ] SSH via key-only, root-login uitgeschakeld
- [ ] Firewall actief (alleen poorten 22, 80, 443)
- [ ] Automatische security-updates actief

**Docker & Applicatie**
- [ ] Docker gezond (`docker compose ps` — alle services running)
- [ ] PostgreSQL gezond (`pg_isready` groen)
- [ ] Storage gezond (MinIO/S3 bereikbaar, upload/download getest)
- [ ] HTTPS actief (Caddy-certificaat geldig)
- [ ] Alle 6 acceptatiechecks in Kantoor Release groen

**Data & Beveiliging**
- [ ] `.env.production` alleen leesbaar voor `fps-beheer` (chmod 600)
- [ ] `.env.production` staat NIET in Git
- [ ] Backups getest (nul-backup aanwezig en integer)
- [ ] Restore-drill uitgevoerd (zie BACKUP_RESTORE_PRODUCTION.md)

**Netwerk & Monitoring**
- [ ] DNS actief (`dig fpsbrandpreventie.nl A` geeft server-IP)
- [ ] Monitoring-crontab ingesteld
- [ ] Logging actief (Docker logs + journalctl)

**Scheiding**
- [ ] Productie-database is NIET de Replit-database
- [ ] Productie-storage is NIET de Replit-bucket
- [ ] Development kan productie niet bereiken

**Rollback**
- [ ] Rollback-procedure getest (zie ROLLBACK_PRODUCTION.md)
- [ ] Rollback-backup-bestandsnaam genoteerd

**Eindoordeel**
- [ ] FPS Connect is gereed voor invoer van echte bedrijfsdata
