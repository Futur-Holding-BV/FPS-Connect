# Installatie — opbouw vanaf nul

## Vereisten

| Software | Minimale versie | Installatie |
|---|---|---|
| Node.js | 24.x LTS | `nvm install 24` of https://nodejs.org |
| pnpm | 9.x | `npm install -g pnpm@9` |
| PostgreSQL | 15.x | Zie [database.md](database.md) |
| Git | 2.x | Systeem-pakketbeheer |

**Optioneel:**
- `pg_dump` / `pg_restore` — voor back-up en herstel
- `openssl` — voor versleuteling back-ups
- `docker` / `docker-compose` — voor lokale PostgreSQL

---

## Stap 1 — Repository klonen

```bash
git clone https://github.com/fps-brandpreventie/fps-connect.git
cd fps-connect
```

> Als de repository nog niet bestaat op GitHub: zie sectie
> [Git-repository aanmaken](#git-repository-aanmaken) onderaan.

---

## Stap 2 — Omgevingsvariabelen instellen

```bash
# API-server
cp .env.example .env
nano .env   # vul alle WIJZIG_MIJ-waarden in

# Frontend feature flags
cp artifacts/firevault/.env.example artifacts/firevault/.env
nano artifacts/firevault/.env
```

Minimale vereisten om op te starten:
- `DATABASE_URL` — PostgreSQL connection string
- `SESSION_SECRET` — minimaal 64 tekens (`openssl rand -hex 64`)
- `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` — object storage

---

## Stap 3 — Dependencies installeren

```bash
pnpm install
```

Dit installeert alle workspace-packages in één keer.

---

## Stap 4 — Database opzetten

```bash
# Database aanmaken (als die nog niet bestaat)
createdb fps_connect

# Schema toepassen
pnpm --filter @workspace/db run push

# Optioneel: standaard seeddata laden
pnpm --filter @workspace/db run seed
```

Zie [database.md](database.md) voor meer details.

---

## Stap 5 — Codegeneratie uitvoeren

Na elke wijziging in de OpenAPI-specificatie:

```bash
pnpm --filter @workspace/api-spec run codegen
```

Dit genereert:
- `lib/api-client-react/src/generated/api.ts` — React Query hooks
- `lib/api-zod/src/generated/` — Zod-validatoren

---

## Stap 6 — Lokaal starten

```bash
# API-server (poort 8080)
pnpm --filter @workspace/api-server run dev

# Frontend (poort 25392)
pnpm --filter @workspace/firevault run dev
```

Of via de Replit-workflows (aanbevolen in Replit-omgeving).

---

## Stap 7 — Verificatie

```bash
# API bereikbaar?
curl http://localhost:8080/healthz

# Typecheck — geen fouten verwacht
pnpm run typecheck

# Kwaliteitscheck (uitgebreid)
pnpm --filter @workspace/scripts run kwaliteitscheck
```

---

## Stap 8 — Eerste beheerder aanmaken

Na een verse installatie bestaat er nog geen gebruiker.
Start de API-server en roep de bootstrap-route aan:

```bash
curl -X POST http://localhost:8080/api/auth/bootstrap \
  -H "Content-Type: application/json" \
  -d '{
    "naam": "Systeembeheerder",
    "email": "beheerder@fps-brandpreventie.nl",
    "wachtwoord": "KiesEenSterkWachtwoord!"
  }'
```

> De bootstrap-route is alleen beschikbaar als er nog geen hoofdbeheerder bestaat.
> Na aanmaken is de route permanent geblokkeerd.

---

## Git-repository aanmaken

Als de repository nog niet bestaat op GitHub:

```bash
# 1. Maak repository aan op GitHub (via website of gh CLI)
gh repo create fps-brandpreventie/fps-connect --private

# 2. Remote toevoegen
git remote add origin https://github.com/fps-brandpreventie/fps-connect.git

# 3. Eerste push
git push -u origin main
```

### GitHub repository-instellingen (aanbevolen)

- **Zichtbaarheid:** Private
- **Branch protection op `main`:** verplicht pull request + review
- **Secrets opslaan:** via GitHub Actions Secrets (nooit in code)
- **Toegang:** alleen betrokken ontwikkelaars

### .gitignore controleren

Zorg dat het volgende al in `.gitignore` staat:

```
.env
artifacts/firevault/.env
artifacts/monteur-app/.env
node_modules/
dist/
build/
.tsbuildinfo
*.local
```

---

## Mobiele app (Expo)

```bash
# Dependencies voor monteur-app
pnpm --filter @workspace/monteur-app install

# Expo Development Server
pnpm --filter @workspace/monteur-app run dev

# Build voor productie (EAS Build)
npx eas build --platform android --profile production
npx eas build --platform ios --profile production
```

Vereisten voor productie-build:
- Expo-account met EAS-plan
- `EXPO_PUBLIC_DOMAIN` ingesteld op de productie-API-URL
- Android keystore / iOS provisioning profile
