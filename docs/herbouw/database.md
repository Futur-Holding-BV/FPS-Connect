# Database — schema, migraties en seed

## Overzicht

FPS Connect gebruikt **PostgreSQL 15+** via **Drizzle ORM**.

| Onderdeel | Locatie | Doel |
|---|---|---|
| Schema (bron van waarheid) | `lib/db/src/schema/` | TypeScript-definitie van alle tabellen |
| Gegenereerde migraties | `lib/db/drizzle/` | SQL-migraties per schema-versie |
| ORM-configuratie | `lib/db/drizzle.config.ts` | Verbinding + output-pad |
| Seed-script | `lib/db/src/seed.ts` | Basisdata voor een verse omgeving |

---

## Schemastructuur

```
lib/db/src/schema/
├── index.ts              ← exporteert alle tabellen
├── gebruikers.ts         ← accounts, sessies, bevoegdheden, profielen
├── gebouwen.ts           ← gebouwen, verdiepingen, plattegronden
├── voorzieningen.ts      ← spots, labels, clusters, AI-voorstellen
├── planning.ts           ← planning items, afwezigheid, meerwerk
├── opdrachten.ts         ← werkorders, werkbegrotingen
├── inspecties.ts         ← oplevering, periodiek, herstel
├── documenten.ts         ← DMS, dossiers, versiebeheer
├── personeel.ts          ← medewerkers, functies, verlof, bekwaamheden
├── wagenpark.ts          ← voertuigen, brandstofimport, sync-log
├── crm.ts                ← klanten, organisaties, projectkansen
├── uren.ts               ← urenregistraties, weekstaten
├── salaris.ts            ← salarismutaties, SCAB-mail, SEPA-bestanden
├── backups.ts            ← back-upregistraties
└── activiteit.ts         ← activiteiten-feed
```

---

## Verse installatie

### 1. Database aanmaken

```sql
-- Als PostgreSQL-superuser:
CREATE USER fps_user WITH PASSWORD 'STERK_WACHTWOORD';
CREATE DATABASE fps_connect OWNER fps_user;
GRANT ALL PRIVILEGES ON DATABASE fps_connect TO fps_user;

-- Vereiste extensies
\c fps_connect
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- voor fuzzy-zoeken
```

### 2. Schema toepassen

```bash
DATABASE_URL="postgresql://fps_user:wachtwoord@localhost:5432/fps_connect" \
  pnpm --filter @workspace/db run push
```

> `drizzle-kit push` synchroniseert het TypeScript-schema direct naar de database.
> Gebruik dit alleen voor verse installaties of ontwikkelomgevingen.

### 3. Migraties beheren (productie)

Voor productie-updates via migraties:

```bash
# Nieuwe migratie genereren na schemawijziging
pnpm --filter @workspace/db run generate

# Migratie toepassen
pnpm --filter @workspace/db run migrate
```

> Drizzle genereert SQL-migratiebestanden in `lib/db/drizzle/`.
> Commit deze bestanden altijd naar Git vóór deployment.

---

## Seeddata

```bash
# Laad standaard basisdata
pnpm --filter @workspace/db run seed
```

De seed laadt:
- Standaard bevoegdheidsprofielen (presets)
- Spottype-catalogus
- Standaard documenttemplates
- Testgebruiker (alleen in `NODE_ENV=development`)

---

## Verbinding vanuit de applicatie

De API-server leest `DATABASE_URL` uit de omgeving.
Drizzle gebruikt `drizzle-orm/node-postgres` via de `pg` driver.

```typescript
// lib/db/src/client.ts (vereenvoudigd)
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });
```

---

## Sessie-opslag

Express-sessies worden opgeslagen in PostgreSQL via `connect-pg-simple`.
De sessietabel (`session`) wordt automatisch aangemaakt bij eerste start.

```bash
# Handmatig aanmaken (als nodig):
psql $DATABASE_URL -c "
  CREATE TABLE IF NOT EXISTS session (
    sid    VARCHAR NOT NULL COLLATE \"default\",
    sess   JSON    NOT NULL,
    expire TIMESTAMP(6) NOT NULL,
    CONSTRAINT session_pkey PRIMARY KEY (sid)
  );
  CREATE INDEX IF NOT EXISTS IDX_session_expire ON session (expire);
"
```

---

## Back-up en herstel

Zie [backup-restore.md](backup-restore.md) voor volledige instructies.

Snelle database-back-up:

```bash
pg_dump $DATABASE_URL \
  --format=custom \
  --no-owner \
  --no-acl \
  --file=fps_connect_$(date +%Y%m%d).dump
```

Herstel:

```bash
pg_restore \
  --dbname=$DATABASE_URL \
  --no-owner \
  --clean \
  fps_connect_20250101.dump
```

---

## Productie-aanbevelingen

- **Verbindingen:** gebruik PgBouncer als connection pooler bij >10 gelijktijdige gebruikers
- **SSL:** verplicht (`?sslmode=require` in `DATABASE_URL`)
- **Back-ups:** dagelijks via `pg_dump` + opslag in S3 (zie backup-restore.md)
- **Monitoring:** schakel `pg_stat_statements` in voor query-analyse
- **Onderhoud:** plan wekelijks `VACUUM ANALYZE` via `pg_cron`
