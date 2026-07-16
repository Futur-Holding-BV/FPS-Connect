# FPS Connect — Productie omgevingsvariabelen checklist

Overzicht van alle verplichte en optionele omgevingsvariabelen voor de productieomgeving op `connect.fps-one.nl`. Gebruik dit document als referentie bij een nieuwe installatie, een servermigratie of wanneer `scripts/deploy-production.sh` een ontbrekende variabele meldt.

> **Beveiligingsregel:** Sla dit bestand **nooit** op met echte waarden in versiebeheer. Alle geheimen leven uitsluitend in `/opt/fps-one/deploy/.env.production` op de VPS (ongetrackt) en als GitHub Actions secrets.

---

## Verplichte variabelen

Het deploy-script (`scripts/deploy-production.sh`) controleert deze variabelen vóór elke deployment. Ontbreekt er één, dan stopt de deployment met een duidelijke foutmelding.

| Variabele | Locatie | Beschrijving |
|---|---|---|
| `DATABASE_URL` | VPS `.env.production` | PostgreSQL connectiestring, bijv. `postgres://fps_app:WACHTWOORD@db:5432/fps_production` |
| `SESSION_SECRET` | VPS `.env.production` | Willekeurige string ≥ 64 tekens voor sessie-signing. Genereer met: `openssl rand -base64 48` |
| `OPENAI_API_KEY` | VPS `.env.production` | OpenAI API-sleutel (begint met `sk-`). Vereist voor alle AI-functies. |
| `GOOGLE_MAPS_API_KEY` | VPS `.env.production` | Google Maps Embed API-sleutel voor gebouwkaarten. |
| `MINIO_ROOT_PASSWORD` | VPS `.env.production` | MinIO root-wachtwoord; ook het S3_SECRET_ACCESS_KEY voor de API. |
| `AZURE_CLIENT_ID` | VPS `.env.production` | Azure app-registratie Client ID voor Microsoft 365 Graph mail. |
| `AZURE_CLIENT_SECRET` | VPS `.env.production` | Azure app-registratie Client Secret (verloopdatum bijhouden). |
| `AZURE_TENANT_ID` | VPS `.env.production` | Azure Tenant ID van de Microsoft 365-organisatie. |
| `MAIL_FROM` | VPS `.env.production` | Zichtbare afzender, bijv. `noreply@fpsbrandpreventie.nl`. |
| `MAIL_MAILBOX` | VPS `.env.production` | Gedeelde postbus via Graph, bijv. `app@fpsbrandpreventie.nl`. |

---

## GitHub Actions secrets (ook vereist voor de automatische deploy)

| Secret | Beschrijving |
|---|---|
| `PROD_SSH_KEY` | Privésleutel (ed25519 PEM) voor SSH-toegang tot de VPS als `rene`. |
| `PROD_SSH_HOST` | IP-adres van de VPS: `149.210.181.47`. |
| `PROD_SSH_USER` | SSH-gebruiker: `rene`. |
| `PROD_SSH_PORT` | SSH-poort (optioneel; standaard `22`). |
| `SMOKETEST_EMAIL` | E-mailadres van het smoketest-account (minimaal wachtwoord-login zonder TOTP-vereiste). |
| `SMOKETEST_PASSWORD` | Wachtwoord van het smoketest-account. |
| `AZURE_TENANT_ID` | Zelfde waarde als VPS `.env.production` — nodig voor faalmelding per e-mail. |
| `AZURE_CLIENT_ID` | Zelfde waarde als VPS `.env.production` — nodig voor faalmelding per e-mail. |
| `AZURE_CLIENT_SECRET` | Zelfde waarde als VPS `.env.production` — nodig voor faalmelding per e-mail. |
| `MAIL_FROM` | Zelfde waarde als VPS `.env.production` — nodig voor faalmelding per e-mail. |
| `MAIL_MAILBOX` | Zelfde waarde als VPS `.env.production` — nodig voor faalmelding per e-mail. |
| `RENE_ALERT_EMAIL` | E-mailadres voor faalmelding (bijv. `rene@fpsbrandpreventie.nl`). |

---

## Aanbevolen variabelen (niet strikt vereist maar sterk aanbevolen)

| Variabele | Locatie | Beschrijving |
|---|---|---|
| `NODE_ENV` | VPS `.env.production` | Zet op `production`. Activeert beveiligingsoptimalisaties. |
| `PORT` | VPS `.env.production` | Luisterpoort van de API-server; standaard `8080`. |
| `LOG_LEVEL` | VPS `.env.production` | Logniveau; gebruik `warn` of `error` op productie. |
| `CONNECT_AI_ENABLED` | VPS `.env.production` | Zet op `true` om AI-functies in te schakelen. |
| `MAIL_VIA_GRAPH` | VPS `.env.production` | Zet op `true` om Microsoft 365 Graph te gebruiken voor mail. |
| `S3_BUCKET` | VPS `.env.production` | MinIO bucket-naam, bijv. `fps-production`. |
| `S3_REGION` | VPS `.env.production` | S3-regio; gebruik `us-east-1` voor MinIO. |
| `S3_ACCESS_KEY_ID` | VPS `.env.production` | S3/MinIO toegangssleutel (= `MINIO_ROOT_USER`). |
| `S3_SECRET_ACCESS_KEY` | VPS `.env.production` | S3/MinIO geheime sleutel (= `MINIO_ROOT_PASSWORD`). |
| `S3_ENDPOINT` | VPS `.env.production` | Intern MinIO-adres: `http://minio:9000`. |
| `S3_PUBLIC_ENDPOINT` | VPS `.env.production` | Publiek adres voor presigned uploads: `https://connect.fps-one.nl`. |
| `MINIO_ROOT_USER` | VPS `.env.production` | MinIO root-gebruiker, bijv. `fps_minio`. |
| `AVG_ACTIVITEIT_BEWAARDAGEN` | VPS `.env.production` | Bewaarperiode activiteitslog in dagen; standaard `365`. |

---

## Variabelen uitsluitend op de VPS (nooit in GitHub broncode)

De volgende variabelen bevatten geheimen en mogen **nooit** in GitHub secrets, Replit secrets of broncode worden opgeslagen. Ze leven uitsluitend in `/opt/fps-one/deploy/.env.production`:

- `DATABASE_URL` (bevat databasewachtwoord)
- `SESSION_SECRET`
- `MINIO_ROOT_PASSWORD`
- `AZURE_CLIENT_SECRET`
- `S3_SECRET_ACCESS_KEY`

---

## Variabelen op zowel VPS als GitHub Actions

| Variabele | VPS `.env.production` | GitHub Actions secret | Reden |
|---|---|---|---|
| `AZURE_TENANT_ID` | ja | ja | Faalmelding vanuit Actions runner |
| `AZURE_CLIENT_ID` | ja | ja | Faalmelding vanuit Actions runner |
| `AZURE_CLIENT_SECRET` | ja | ja | Faalmelding vanuit Actions runner |
| `MAIL_FROM` | ja | ja | Faalmelding vanuit Actions runner |
| `MAIL_MAILBOX` | ja | ja | Faalmelding vanuit Actions runner |

---

## Systeemstatus controleren

Na een deployment: ga naar `https://connect.fps-one.nl` en log in als hoofdbeheerder. Open **Instellingen → Systeemstatus** om de actieve commit, builddatum en de verbindingsstatus van DB, opslag, mail en AI te zien.

Of via de API (publiek endpoint, geen auth vereist):

```bash
curl -s https://connect.fps-one.nl/api/versie
curl -s https://connect.fps-one.nl/api/versie/status
```

---

## Aandachtspunten

- `AZURE_CLIENT_ID_NEW` in `deploy/ENV_PRODUCTION.example` is een verouderde tijdelijke naam — gebruik `AZURE_CLIENT_ID` in de werkende configuratie.
- De `GITHUB_TOKEN_PUSH`-variabele is een Replit-secret en een GitHub Actions secret; zie `docs/PRODUCTION_RUNBOOK.md` (sectie "GITHUB_TOKEN_PUSH vernieuwen") voor vernieuwingsinstructies.
- Verloopt `AZURE_CLIENT_SECRET`? Vernieuw hem in Azure Portal en update **beide** locaties: VPS `.env.production` en GitHub Actions secrets.
