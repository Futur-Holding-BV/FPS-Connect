# FPS Connect — Herbouwhandleiding (master)

Dit document beschrijft hoe het volledige FPS-platform opnieuw kan worden
opgebouwd vanaf een lege server of na volledig verlies van de huidige omgeving.

**Bewaarplaatsen van dit document:**
- Git-repository (primair)
- Versleutelde back-up op NAS / eigenaarschijf (dagelijkse export)

---

## Inhoudsopgave

1. [Repositorystructuur](#1-repositorystructuur)
2. [Installatie en lokale opbouw](installatie.md)
3. [Database — schema, migraties en seed](database.md)
4. [Microsoft Graph — e-mail en Azure AD](microsoft-graph.md)
5. [Opslag en bestanden (S3)](opslag.md)
6. [Rollen en bevoegdheden](rollen-rechten.md)
7. [Domeinen en TLS](domeinen.md)
8. [Deployment naar productie](../../docs/deployment.md)
9. [Back-up en herstel](backup-restore.md)
10. [Periodieke herbouwtest](#10-periodieke-herbouwtest)

---

## 1. Repositorystructuur

Het platform is een **pnpm-monorepo**. Alle code staat in één Git-repository.

```
fps-connect/                       ← Git-root (één monorepo)
│
├── artifacts/
│   ├── api-server/               ← Backend (Express 5 / Node.js 24)
│   ├── firevault/                ← FPS Connect web-app (React + Vite)
│   ├── monteur-app/              ← FPS Monteur mobiele app (Expo)
│   └── mockup-sandbox/           ← Design-sandbox (intern)
│
├── lib/
│   ├── api-spec/                 ← OpenAPI-specificatie (bron van waarheid)
│   ├── api-client-react/         ← Gegenereerde React Query hooks
│   ├── api-zod/                  ← Gegenereerde Zod-validators
│   ├── db/                       ← Drizzle ORM schema + migraties
│   └── permissies/               ← Gedeeld bevoegdhedensysteem
│
├── scripts/                      ← DevOps, kwaliteitscheck, export
├── docs/                         ← Alle documentatie
│   └── herbouw/                  ← Herbouwhandleidingen (dit mapje)
│
├── .env.example                  ← Alle variabelen zonder echte waarden
├── pnpm-workspace.yaml
└── package.json
```

### Git-strategie

- **Monorepo in één externe repository** (GitHub of GitLab)
- Eén `main`-branch — altijd deploybaar
- Feature branches voor grote wijzigingen
- Geen secrets in Git — zie `.gitignore` en `.env.example`

### Wat hoort wél in Git

| Bestand/map | In Git? | Toelichting |
|---|---|---|
| Alle broncode | Ja | |
| `lib/db/src/schema/` | Ja | Drizzle-schema = bron van DB-structuur |
| `lib/db/drizzle/` | Ja | Gegenereerde migraties |
| `scripts/src/seed*.ts` | Ja | Seeddata (geen productiedata) |
| `.env.example` | Ja | Sjabloon zonder waarden |
| `.env` | **Nooit** | Staat in `.gitignore` |
| `artifacts/firevault/.env` | **Nooit** | Staat in `.gitignore` |
| `node_modules/` | **Nooit** | |
| `dist/` / `build/` | **Nooit** | Altijd herbouwbaar |

---

## 10. Periodieke herbouwtest

Plan minimaal **eenmaal per kwartaal** een herbouwtest:

```bash
# 1. Maak een nieuwe lege PostgreSQL-database aan
createdb fps_connect_herbouwtest

# 2. Herstel de meest recente back-up
DATABASE_URL="postgresql://...fps_connect_herbouwtest" \
  pnpm --filter @workspace/scripts run herstel-backup --latest

# 3. Zet een verse Node.js-omgeving op (zie installatie.md)
nvm use 24
pnpm install

# 4. Druk het schema op de testdatabase
DATABASE_URL="postgresql://...fps_connect_herbouwtest" \
  pnpm --filter @workspace/db run push

# 5. Start de API-server en verifieer /healthz
pnpm --filter @workspace/api-server run dev &
curl http://localhost:8080/healthz

# 6. Bouw de frontend
pnpm --filter @workspace/firevault run build

# 7. Noteer de testdatum en het resultaat
echo "Herbouwtest $(date '+%Y-%m-%d'): GESLAAGD" >> docs/herbouw/testlog.md
```

Bewaar `testlog.md` in Git zodat er een audittrail is.
