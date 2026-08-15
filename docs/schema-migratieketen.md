# Schema-migratieketen (SCHEMA_01)

Hoe database-schemawijzigingen worden beheerd sinds 7 augustus 2026.

## Basisregel

Elke schemawijziging = een nieuw genummerd bestand `lib/db/src/migrations/NNNN_*.sql`
(opvolgend nummer, nooit een gat laten). Verboden alternatieven:

- `apply-additive.mjs` — bevroren als legacy, nooit meer gebruiken
- `drizzle-kit push` — verwijderd uit het deployproces
- Handmatige ALTER's rechtstreeks op productie zonder bijbehorende migratie

## Werkwijze

1. **Schrijf de migratie** — nieuw bestand `lib/db/src/migrations/NNNN_beschrijving.sql`
2. **Test lokaal** — `pnpm --filter @workspace/db run migrate`
3. **Ververs de schemaverwachting** — `pnpm --filter @workspace/db run drift-check -- --update`  
   → `lib/db/schema-verwachting.txt` groeit mee
4. **CI-controle vóór merge** — zie §Bewaker hieronder
5. **Deploy** — de migratierunner in `deploy.yml` voert de openstaande migraties automatisch uit

`lib/db/schema.sql` is het prod-nulpunt van 7 aug 2026 — nooit handmatig bijwerken.

## Immutabiliteitsregel

**Een migratiebestand mag NOOIT worden hernoemd of verwijderd nadat het gedeployed is.**

De migratierunner (`migrate.mjs`) legt elke uitgevoerde migratie vast in de tabel
`schema_migraties` (naam + sha256-checksum). Als een naam in die tabel niet meer
overeenkomt met een bestand in de repo, stopt de runner hard:

```
[migrate] STOP: de database bevat migraties die niet in de repo staan
```

Elke volgende deploy is dan geblokkeerd totdat het probleem handmatig is opgelost.

## Bewaker: check-hernoeming

Er is een CI-check die hernoemen/verwijderen *vóór* merge naar main detecteert:

```bash
pnpm --filter @workspace/db run check-hernoeming
# of direct:
node lib/db/scripts/check-migratie-hernoeming.mjs
```

De check vergelijkt `lib/db/src/migrations/` t.o.v. `origin/main` via
`git diff --diff-filter=DR` en faalt met exit 1 als er hernoemde of verwijderde
bestanden zijn. Als `origin/main` niet bereikbaar is, faalt de check ook hard
(fail-closed) — voer in CI altijd een expliciete `git fetch origin main --depth=1`
uit vóór de check.

De check is ook geregistreerd als Replit-validatiestap (`migratie-hernoeming`)
en als stap in `.github/workflows/ci.yml` (met expliciete fetch).

## Pre-push hook

Om de check ook *vóór* een push naar GitHub te laten draaien installeert
`scripts/install.sh` automatisch een `.git/hooks/pre-push` hook (idempotent).
De hook herkent zichzelf aan de markering `fps-migratie-hernoeming-hook-v1`.

**Gedrag:**

- Als `origin/main` lokaal bekend is (normale werksituatie), roept de hook
  `pnpm --filter @workspace/db run check-hernoeming` aan. De push wordt
  geblokkeerd bij een schending.
- Als `origin/main` lokaal **niet** bekend is (verse checkout, volledig offline),
  slaat de hook over met een mededeling en laat de push door. De CI-check en
  Replit-validatiestap vangen het daarna alsnog op.

**Handmatige installatie** (als `scripts/install.sh` nog niet is gedraaid):

```bash
bash scripts/install.sh   # installeert ook de hook
```

Of alleen de hook installeren door `stap 8b` te kopiëren uit `scripts/install.sh`.

## Uitzondering: VERWEESD-reconciliatie

Gebruik dit pad **uitsluitend** als:
- een migratie aantoonbaar al gedeployed is (staat in prod-`schema_migraties`), én
- het netto schema-effect nul is (de migratie heeft een object aangemaakt dat door
  een directe opvolger weer volledig is verwijderd), én
- het bestand door een fout al uit de repo verdwenen is

### Herstelstappen (zonder SSH-toegang tot productie)

1. Voeg de naam toe aan de `VERWEESD`-lijst bovenin `lib/db/scripts/migrate.mjs`:
   ```js
   const VERWEESD = [
     "0043_oud-bestandsnaam.sql",  // netto effect: nul — reden
   ];
   ```
2. Documenteer in de comment:
   - welke migratie(s) zijn toegevoegd,
   - waarom het netto schema-effect nul is,
   - welke definitieve migratie het schema-correcte eindresultaat levert.
3. Deploy — de runner verwijdert de verweesd registratie vóór de pre-check.
4. Na merge naar main verdwijnt de diff automatisch: de bewaker vergelijkt
   altijd t.o.v. origin/main, dus het verwijderde bestand is dan niet meer
   "weg t.o.v. main". Er is geen aparte whitelist nodig.

### Incident-referentie (15 aug 2026)

Materiaal01-fase3-ontwikkeling: `0043_materiaal01-fase3-inkoopbon.sql` en
`0048_materiaal01-fase3-cleanup.sql` tijdelijk gedeployed, daarna hernoemd.
Netto effect nul (0043 voegde `resultaat_inkoopbon_id` toe; 0048 verwijderde die
kolom). Opgelost via de VERWEESD-reconciliatie; definitieve keten gebruikt 0044.
