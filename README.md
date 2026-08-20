# FPS Connect

FPS Connect is het interne ERP van FPS voor calculatie, opdrachten, uitvoering en bedrijfsvoering door FPS-medewerkers. Het is de binnenlaag van FPS en nadrukkelijk geen klantomgeving.

## Locaties

| Onderdeel | Locatie |
|---|---|
| Productie | [https://connect.fps-one.nl](https://connect.fps-one.nl) |
| Broncode | [Futur-Holding-BV/FPS-Connect](https://github.com/Futur-Holding-BV/FPS-Connect), branch `main` |
| Productieserver | VPS `fps-connect-prod`, Ubuntu 24.04 LTS, `149.210.181.47`, repository `/opt/fps-one` |
| Ontwikkeling/test | Replit-preview en een afzonderlijke Replit PostgreSQL-database |

Er is geen stagingomgeving. Replit heeft geen toegang tot de productiedatabase op de VPS.

## Starten en controleren

Vereist: Node.js 24, pnpm 10, `DATABASE_URL` en `pnpm install`.

```bash
# Start in Replit bij voorkeur via de bestaande workflows
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/firevault run dev
pnpm --filter @workspace/monteur-app run dev

pnpm test
pnpm run typecheck
pnpm run build
pnpm --filter @workspace/scripts run kwaliteitscheck
```

Na wijziging van `lib/api-spec/openapi.yaml`: `pnpm --filter @workspace/api-spec run codegen`. `pnpm --filter @workspace/db run push` is alleen voor ontwikkeling; productie gebruikt genummerde, na uitrol onveranderlijke migraties.

## Repositorykaart en gegevensmodel

- `artifacts/firevault/`: React/Vite-webapp **FPS Connect**.
- `artifacts/api-server/`: Express-API en routes.
- `artifacts/monteur-app/`: Expo-app **FPS Monteur**, op dezelfde API.
- `artifacts/mockup-sandbox/`: ontwerp- en componentproeven, niet productie.
- `lib/api-spec/openapi.yaml`: API-contract; `lib/api-client-react/` en `lib/api-zod/` zijn gegenereerd.
- `lib/db/src/schema/index.ts`: PostgreSQL-model; `lib/db/src/migrations/`: productiemigraties.
- `lib/`: gedeelde reken-, rechten-, ontwerp-, opslag- en monitoringcode.
- `scripts/`, `deploy/` en `.github/workflows/`: controles, bewijs, beheer en deployment.
- `docs/`: kaders, runbooks, architectuur en het opdrachtarchief.

Bedrijfsdata staan in PostgreSQL; documenten en media in MinIO/S3-compatibele objectopslag, niet in Git.

## Uitrollen en bewijzen

Route: merge → `scripts/post-merge.sh` → GitHub `main` → `.github/workflows/deploy.yml` → VPS. Productie maakt eerst een back-up en voert daarna pull, containerbuild, migraties, herstart en healthcheck uit; doorgaans staat een merge binnen 10–15 minuten live.

Voor een gewone uitrol moeten GitHub CI, typecheck, dubbele-routecontrole en klantloos-controle groen zijn. De automatische smoketest controleert `/api/healthz`, login en een geauthenticeerde, niet-lege `/api/gebruikers`; controleer daarna handmatig Jacqueline-login en de geraakte bedrijfsflow. Alleen een handmatige noodfix met vastgelegde `noodfix_reden` mag gates omzeilen. Zie [`docs/PRODUCTION_RUNBOOK.md`](docs/PRODUCTION_RUNBOOK.md), [`docs/kwaliteitskader.md`](docs/kwaliteitskader.md) en [`docs/OMGEVINGSBEWUSTZIJN.md`](docs/OMGEVINGSBEWUSTZIJN.md).

## Afhankelijkheden en aangrenzende systemen

1. **FPS Monteur** staat hier en gebruikt de Connect-API. Expo/EAS verzorgt OTA-JavaScriptupdates; native wijzigingen vereisen een app-build.
2. **FPS One Platform** is de externe klantomgeving in een andere codebase en op een andere server. Connect publiceert alleen opleverdocumenten naar het Platform; locatie van die code/server is hier onbekend.
3. **FPS Planner** bezit woningen, bewoners en afspraken onder Uitvoering; Connect bezit mensen, tijd en capaciteit. Een actuele aparte code-/serverlocatie is hier onbekend.

Overige diensten: PostgreSQL, MinIO/S3, Microsoft Graph/Azure, OpenAI via Replit AI Integrations met gedocumenteerde key-fallback, Google Maps Embed, Sentry, GitHub Actions en AccountView.

Geheimen staan alleen in Replit Secrets, GitHub Secrets of `/opt/fps-one/deploy/.env.production`. `AZURE_CLIENT_SECRET`, `GITHUB_TOKEN_PUSH` en `EXPO_TOKEN` kunnen verlopen; actuele vervaldata zijn onbekend. Roteer `SESSION_SECRET`, `POSTGRES_PASSWORD`, AI-sleutels en Azure-secrets minimaal jaarlijks.

## Niet bouwen in Connect

- Geen klantlogin, externe gebruikers of algemene klantomgeving: die horen in FPS One Platform.
- Geen inkomende Platform-synchronisatie; alleen opleverdocumenten gaan naar buiten.
- Geen tweede bron voor woningen, bewoners of afspraken buiten Planner onder Uitvoering.
- Geen facturen, offertes, foto's, personeelsdata, exports of uploads in Git; gebruik database/objectopslag.
- Geen designexperimenten in productiecode; gebruik `artifacts/mockup-sandbox`.