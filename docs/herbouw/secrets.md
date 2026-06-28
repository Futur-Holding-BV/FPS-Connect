# Secrets en omgevingsvariabelen — volledig overzicht

Per variabele staat aangegeven: doel, verplicht/optioneel, en waar
opnieuw aan te vragen. Sla nooit echte waarden op in Git.

---

## Database

| Variabele | Doel | Verplicht | Opnieuw aan te vragen bij |
|---|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | **Ja** | Eigen database / hosting provider (Neon, Supabase, Railway, eigen server) |

**Formaat:** `postgresql://gebruiker:wachtwoord@host:5432/databasenaam`

**Genereren voor eigen server:**
```bash
openssl rand -hex 32   # gebruik als wachtwoord
```

---

## Sessie

| Variabele | Doel | Verplicht | Opnieuw aan te vragen bij |
|---|---|---|---|
| `SESSION_SECRET` | Ondertekening sessiecookies | **Ja** | Zelf genereren — nooit opvragen |

**Genereren:**
```bash
openssl rand -hex 64
```

> Als dit geheim wijzigt, worden alle actieve gebruikerssessies ongeldig.

---

## Object Storage (S3-compatibel)

| Variabele | Doel | Verplicht | Opnieuw aan te vragen bij |
|---|---|---|---|
| `S3_ENDPOINT` | URL van de S3-server | **Ja** | Afhankelijk van provider |
| `S3_REGION` | Regio van de bucket | **Ja** | Afhankelijk van provider |
| `S3_BUCKET` | Naam van de bucket | **Ja** | Afhankelijk van provider |
| `S3_ACCESS_KEY_ID` | Toegangssleutel | **Ja** | Zie hieronder per provider |
| `S3_SECRET_ACCESS_KEY` | Geheime sleutel | **Ja** | Zie hieronder per provider |

### MinIO (eigen server)
- Eigen instelling — geen externe aanvraag nodig
- Genereer credentials via MinIO-beheerinterface (poort 9001)
- Of: `mc admin user add fps fps_app_user <sterk-wachtwoord>`

### Backblaze B2
- https://www.backblaze.com/b2 → Account → App Keys → Add a New Application Key
- Selecteer bucket: `fps-connect-bestanden`

### AWS S3
- https://console.aws.amazon.com → IAM → Users → Create user
- Voeg toe: `AmazonS3FullAccess` (of maak een beperkte IAM-policy)
- Genereer Access Key

### Cloudflare R2
- https://dash.cloudflare.com → R2 → Overview → Manage R2 API tokens

---

## Microsoft Graph — e-mail

| Variabele | Doel | Verplicht | Opnieuw aan te vragen bij |
|---|---|---|---|
| `AZURE_TENANT_ID` | Azure AD tenant-ID | **Ja** | Azure Portal → Azure Active Directory → Overview |
| `AZURE_CLIENT_ID_NEW` | App Registration client-ID | **Ja** | Azure Portal → App registrations → FPS Connect Mail |
| `AZURE_CLIENT_SECRET` | App Registration secret | **Ja** | Azure Portal → App registrations → Certificates & secrets → New client secret |
| `MAIL_MAILBOX` | Gedeelde postbus (verzender) | **Ja** | Microsoft 365 Admin Center → Shared mailboxes |
| `MAIL_FROM` | Weergavenaam + e-mailadres | **Ja** | Zelf instellen |

**Volledige setupinstructies:** zie [microsoft-graph.md](microsoft-graph.md)

**Verlooptermijn secrets:** Azure client secrets vervallen na 24 maanden.
Plan een agenda-herinnering op de vervaldatum.

---

## AI — OpenAI

| Variabele | Doel | Verplicht | Opnieuw aan te vragen bij |
|---|---|---|---|
| `OPENAI_API_KEY` | OpenAI API-toegang (GPT-5, vision) | **Ja** | https://platform.openai.com/api-keys |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | Replit AI Integrations proxy | Alleen in Replit | Automatisch ingevuld via Replit AI Integrations |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | Base URL voor Replit proxy | Alleen in Replit | Automatisch ingevuld via Replit AI Integrations |

**Functies die AI gebruiken:**
- Gebouw AI-invullen (GPT-4o vision + geocode)
- Spot AI-voorstel (foto → spottype, toepassing)
- AI bibliotheekvalidatie
- HRM opleidingsvoorstel per functie
- Offerte Intelligence

**Kosten:** zie https://openai.com/pricing — gebruik GPT-4o voor vision,
GPT-4o-mini voor bulk-taken. GPT-5 voor complexe redeneertrouwen.

---

## Google Maps

| Variabele | Doel | Verplicht | Opnieuw aan te vragen bij |
|---|---|---|---|
| `GOOGLE_MAPS_API_KEY` | Kaartweergave gebouwen + geocode | Optioneel | https://console.cloud.google.com → APIs & Services → Credentials → Create credentials → API Key |

**Vereiste APIs inschakelen in Google Cloud:**
- Maps Embed API
- Geocoding API
- Street View Static API (voor gebouw-AI-vision)

**Beperking instellen** (aanbevolen): beperk de API-sleutel tot bovenstaande APIs
en tot het serverdomein.

---

## Replit-specifieke variabelen

Deze variabelen worden automatisch ingevuld door het Replit-platform en
hoeven niet handmatig te worden ingesteld buiten Replit.

| Variabele | Doel | Opnieuw nodig bij |
|---|---|---|
| `REPLIT_DOMAINS` | Automatische domeinrouting | Eigen deployment: gebruik `DOMAIN` in Caddyfile |
| `REPLIT_DEV_DOMAIN` | Development-domein | Niet nodig buiten Replit |
| `PORT` | Serverpoort (automatisch toegewezen) | Eigen server: hardcode `8080` |
| `BASE_PATH` | URL-basispad van de app | Eigen server: `"/"` |

---

## Interne variabelen (geen aanvraag nodig)

| Variabele | Doel | Instelling |
|---|---|---|
| `NODE_ENV` | Productiemodus | `production` |
| `LOG_LEVEL` | Logdetailniveau | `info` (standaard) |
| `PRIVATE_OBJECT_DIR` | S3-pad privébestanden | `private` |
| `PUBLIC_OBJECT_SEARCH_PATHS` | Publieke S3-paden | `public/logos,public/assets` |

---

## Niet gebruikte / geparkeerde variabelen

| Variabele | Status | Toelichting |
|---|---|---|
| `GOOGLE_CLOUD_BUCKET` | Alternatief voor S3 | Gebruik S3 als S3_BUCKET leeg is |
| `CLERK_*` | Niet in gebruik | Eigen sessie-auth (bcrypt + TOTP) gebruikt in plaats van Clerk |
| `RESEND_API_KEY` | Niet in gebruik | Microsoft Graph gebruikt in plaats van Resend |
| `SMTP_*` | Niet in gebruik | Microsoft Graph gebruikt in plaats van SMTP |
| `EXPO_PUBLIC_DOMAIN` | Optioneel (mobiele app) | Domein van de API voor de Expo-app |

---

## Geheimenbeheer in productie

### Aanbevolen aanpak

1. **GitHub Actions Secrets** — voor CI/CD-pipelines
2. **Docker secrets / .env.docker** — voor selfhost Docker
3. **Wachtwoordmanager** (Bitwarden, 1Password, Vaultwarden) — voor handmatige
   toegang door beheerders
4. **Afgedrukte noodenvelop** bij de eigenaar — voor catastrofisch scenario

### Nooit doen

- `.env` met echte waarden in Git
- Secrets in logbestanden of foutmeldingen (API redacteert al upstream-fouten)
- Secrets e-mailen of in Slack/Teams plaatsen
- Secrets in Docker image (gebruik altijd runtime environment variables)

---

## Jaarlijkse controle

Plan elk jaar een controle:

- [ ] Azure client secret verlopen? → nieuw aanmaken
- [ ] OpenAI API key nog actief? → roteer periodiek
- [ ] S3 access keys rotatie
- [ ] SESSION_SECRET rotatie (sessies worden ongeldig — buiten kantooruren)
- [ ] Google Maps key nog bruikbaar? → check quotagebruik
