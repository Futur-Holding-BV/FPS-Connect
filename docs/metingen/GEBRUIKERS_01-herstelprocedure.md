# GEBRUIKERS_01 v2 — Herstelprocedure migratie 0101

**Migratie:** `lib/db/src/migrations/0101_gebruikers01_v2_functiehuis_rechten.sql`
**Aard:** niet-destructief (additief + soft-updates). Elke mutatie is
terugdraaibaar op basis van de snapshot-tabel `gebruikers01_v2_snapshot`, die
de volledige begintoestand vastlegt **vóór** alle mutaties.

Deze procedure beschrijft de concrete, inverse restore vanuit de snapshot en
verwijst naar het veilige dry-run-script dat het herstel binnen een transactie
test en **altijd** terugdraait.

---

## 1. Wat migratie 0101 wijzigt (en dus hersteld wordt)

| # | Mutatie in 0101 | Snapshot-bron | Inverse (herstel) |
|---|-----------------|---------------|-------------------|
| 1 | `functies.werkgever_id = NULL`, `functies.werkmaatschappij = ''` (globalisering) | `object_type='functie'` (volledige rij als jsonb) | `werkgever_id` en `werkmaatschappij` terugzetten uit snapshot |
| 2 | `functies.actief = false` voor ID 8 en 9 | `object_type='functie'` | `actief` terugzetten uit snapshot (8/9 reactiveren) |
| 3 | Profiel-koppeling `functies.profiel_id` (ID10→Project-admin, ID11→Administratie, overige op naam) | `object_type='functie'` (bevat `profiel_id`) | `profiel_id` terugzetten uit snapshot |
| 4 | Zestien ontbrekende functies aangemaakt | `object_type='nieuwe_functie'` (alleen werkelijk ingevoegde rijen) | precies deze functies inactiveren; later toegevoegde functies blijven ongemoeid |
| 5 | (Backfill) afwijkingen + audit-log gevuld | — (additief) | **Niet terugdraaien** — additief en veilig te laten staan |

De backfill schrijft alleen naar de nieuwe tabellen
(`gebruiker_bevoegdheid_afwijkingen`, `bevoegdheid_audit_log`) en raakt
bestaande kolommen niet aan. `gebruikers.bevoegdheden` (de legacy-matrix)
blijft ongewijzigd. Herstel hoeft die tabellen dus niet leeg te maken; wie een
volledig schone terugkeer wil, kan ze apart legen (zie §4).

> **Let op — append-only audit-log:** `bevoegdheid_audit_log` heeft
> DB-triggers die UPDATE en DELETE weigeren. Handmatig opschonen van die tabel
> lukt daarom alleen door eerst de triggers te droppen (zie §4), of door de
> tabel als geheel te droppen.

---

## 2. Voorwaarden

- Migratie 0101 is uitgevoerd en de snapshot-tabel `gebruikers01_v2_snapshot`
  is gevuld (één rij per functie, plus refs voor medewerkers/aanstellingen).
- Herstel gebeurt op **dev/acceptatie**, nooit blind op productie. Draai eerst
  de dry-run (§3), verifieer de tellingen, en pas dan het echte herstel (§4).
- Maak vóór een echt herstel een reguliere DB-backup (zie
  `BACKUP_01_herstelproef.md`). De snapshot is een gerichte, niet-volledige
  momentopname; een DB-backup blijft de primaire vangnet.

---

## 3. Dry-run (verplichte eerste stap, wijzigt niets)

Er is een dedicated script dat de volledige inverse-herstel-SQL uitvoert binnen
**één transactie die altijd wordt teruggedraaid** (ROLLBACK), ook bij succes.
Het telt de geraakte rijen, vergelijkt die met de snapshot-aantallen, en
verifieert daarna dat de live-data ongewijzigd is.

```bash
pnpm --filter @workspace/scripts run herstel-gebruikers01-v2-dryrun
```

Verwachte uitkomst:

- `Functies hersteld uit snapshot` — geraakte rijen == aantal `functie`-snapshots.
- `medewerkers.functie_id hersteld` / `aanstellingen.functie_id hersteld`
  — geraakte rijen == bijbehorende snapshot-refs.
- `Functies 8/9 zouden reactiveren` — binnen de transactie weer `actief=true`.
- `Door 0101 aangemaakte functies zouden inactief worden` — alleen de rijen uit
  het snapshot-type `nieuwe_functie`.
- Na ROLLBACK: `Live: alle functies nog globaal` en
  `Live: functies 8/9 nog inactief` én de nieuwe functies nog actief — bewijs
  dat er niets blijvend wijzigde.

Slaagt de dry-run niet, dan klopt de snapshot niet of is de datatoestand
gewijzigd; onderzoek dat vóór een echt herstel.

---

## 4. Echt herstel (bewuste, transactionele actie)

Het echte herstel is dezelfde SQL als de dry-run, maar met `COMMIT` in plaats
van `ROLLBACK`. Voer het **altijd in één expliciete transactie** uit, zodat een
tussentijdse fout alles terugdraait.

```sql
BEGIN;

-- 1 + 2. functies: globalisering + inactivering ongedaan maken.
UPDATE functies f
SET werkgever_id     = (s.snapshot ->> 'werkgever_id')::integer,
    werkmaatschappij = COALESCE(s.snapshot ->> 'werkmaatschappij', ''),
    actief           = (s.snapshot ->> 'actief')::boolean,
    profiel_id       = (s.snapshot ->> 'profiel_id')::integer,
    bijgewerkt_op    = NOW()
FROM gebruikers01_v2_snapshot s
WHERE s.object_type = 'functie'
  AND s.object_id   = f.id;

-- 3. Alleen de door 0101 ingevoegde functies inactiveren.
UPDATE functies f
SET actief = false,
    bijgewerkt_op = NOW()
FROM gebruikers01_v2_snapshot s
WHERE s.object_type = 'nieuwe_functie'
  AND s.object_id   = f.id;

-- 4. medewerkers.functie_id terugzetten.
UPDATE medewerkers m
SET functie_id = (s.snapshot ->> 'functie_id')::integer
FROM gebruikers01_v2_snapshot s
WHERE s.object_type = 'medewerker_functie_ref'
  AND s.object_id   = m.id;

-- 5. medewerker_aanstellingen.functie_id terugzetten.
UPDATE medewerker_aanstellingen ma
SET functie_id = (s.snapshot ->> 'functie_id')::integer
FROM gebruikers01_v2_snapshot s
WHERE s.object_type = 'aanstelling_functie_ref'
  AND s.object_id   = ma.id;

-- Controleer de tellingen hier (zie dry-run) vóór COMMIT.
COMMIT;
```

### Optioneel: nieuwe tabellen opschonen (volledige terugkeer)

Alleen doen als een volledige terugkeer naar de pre-migratietoestand is
gewenst. De audit-log is append-only en vereist dat de triggers eerst weg zijn:

```sql
BEGIN;
DROP TRIGGER IF EXISTS bal_geen_update ON bevoegdheid_audit_log;
DROP TRIGGER IF EXISTS bal_geen_delete ON bevoegdheid_audit_log;
TRUNCATE gebruiker_bevoegdheid_afwijkingen;
TRUNCATE bevoegdheid_audit_log;
-- Triggers herstellen als de tabel blijft bestaan:
CREATE TRIGGER bal_geen_update BEFORE UPDATE ON bevoegdheid_audit_log
  FOR EACH ROW EXECUTE FUNCTION bevoegdheid_audit_log_append_only();
CREATE TRIGGER bal_geen_delete BEFORE DELETE ON bevoegdheid_audit_log
  FOR EACH ROW EXECUTE FUNCTION bevoegdheid_audit_log_append_only();
COMMIT;
```

De snapshot-tabel `gebruikers01_v2_snapshot` mag blijven staan als audittrail;
verwijder haar pas als het herstel definitief geaccepteerd is.

---

## 5. Verificatie na herstel

Draai het verificatiescript en controleer dat de verwachte toestand klopt (of,
na een volledig herstel, dat de pre-migratietoestand terug is):

```bash
pnpm --filter @workspace/scripts run verificatie-gebruikers01-v2
```

Aanvullende handmatige controles:

- `SELECT id, actief, werkmaatschappij, profiel_id FROM functies WHERE id IN (8,9);`
  — na volledig herstel weer de oorspronkelijke waarden uit de snapshot.
- Steekproef: vergelijk `functies` met hun snapshot-rij
  (`gebruikers01_v2_snapshot WHERE object_type='functie'`).

---

## 6. Samenvatting

- **Altijd eerst** de dry-run draaien; die wijzigt gegarandeerd niets (ROLLBACK).
- Echt herstel is dezelfde SQL met `COMMIT`, binnen één transactie.
- De snapshot-tabel is de bron van waarheid voor de inverse; een DB-backup
  blijft het primaire vangnet.
- De audit-log is append-only op DB-niveau; opschonen vereist bewust de
  triggers droppen.
