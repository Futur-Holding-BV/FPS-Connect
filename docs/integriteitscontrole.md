# Integriteitscontrole — FPS Connect

**Datum:** 3 juli 2026  
**Status:** Rapport (analyse-only; er is niets verwijderd of gewijzigd, tenzij hieronder als "opgelost" gemarkeerd)

---

## 1. Duplicatie: functies en services

### 1.1 `magBijGebouw` — 4 exemplaren (OPGELOST in Task #180)

| Bestand | Regel | Signatuur |
|---------|-------|-----------|
| `routes/gebouwen.ts` | 90 | `(req, gebouwId)` — impersonatie-bewust via `effectieveContext` |
| `routes/voorzieningen.ts` | 71 | `(userId, gebouwId)` — directe userId, geen impersonatie |
| `routes/inspecties.ts` | 31 | `(userId, gebouwId)` — directe userId, geen impersonatie |
| `routes/onderhoud.ts` | 42 | `(userId, gebouwId)` — directe userId, geen impersonatie |

**Risico:** De drie `userId`-varianten ondersteunen geen impersonatie ("bekijken als"), waardoor de scoping inconsistent is tussen lees- en schrijfpaden.  
**Oplossing:** Gecentraliseerd in `utils/rol.ts` als `magBijGebouw(req, gebouwId)` (req-based) en `magBijGebouwVoorId(userId, gebouwId)`. Lokale kopieën verwijderd.

### 1.2 `toegewezenGebouwIds` — 4 exemplaren (OPGELOST in Task #180)

Identiek aan 1.1 — alle vier laadden zelf de `gebouwToewijzingenTable`. Gecentraliseerd in `utils/rol.ts`.

### 1.3 `parseId` — ontbreekt als gedeeld utility (OPENSTAAND)

Elke route parseert route-parameters op zijn eigen manier (`parseInt(req.params.id, 10)`, `Number(req.params.id)`, `+req.params.id`). Er is geen gedeeld `utils/parse.ts`. Dit leidt tot inconsistente 400/404 responses bij ongeldige ids.  
**Prioriteit:** Laag — functioneel correct, maar inconsistent.

### 1.4 Gedupliceerde service-patronen (OPENSTAAND)

| Patroon | Aantal bestanden | Aard |
|---------|-----------------|------|
| `await db.select({naam}).from(gebruikersTable).where(eq(...id))` | ~25 | naam opzoeken |
| `logActiviteit(...)` met handmatige gebouw_naam-opzoeking | ~18 | voordat `logActiviteit()` centraal was |
| `try/catch + req.log.error + res.status(500)` | ~80 routes | identieke error-wrapper |
| `bijgewerktOp: new Date()` bij PATCH | ~40 routes | timestamp-aanvulling |

**Aanbeveling:** Gedeelde `utils/db-helpers.ts` voor naam-opzoeking en error-wrapping.

---

## 2. Ongebruikte tabellen / "dode" schema-onderdelen

| Tabel | Status | Bevinding |
|-------|--------|-----------|
| `clienten` | Mogelijk dood | Geen route die er direct in schrijft; CRM scaffold leest wel |
| `crm_contacten` | Actief maar minimaal | Alleen gelezen via `/crm/contacten`; schrijven ontbreekt |
| `workflow_rechten` | Nieuw schema (Task #180) | Tabel aangemaakt, geen business-logica; bewust gestagd |
| `spot_ai_voorstellen_snapshots` | Aanwezig | Niet in alle select-queries meegenomen |
| Diverse JSONB-kolommen | Functioneel | Niet geïndexeerd als ze gefilterd worden (bijv. `bevoegdheden`-veld) |

**Aanbeveling:** `ANALYZE` + `pg_stat_user_tables` draaien in productie om sequentiële scans te detecteren.

---

## 3. Ontbrekende database-indexes

Uit de schema-analyse: **31 tabellen** hebben geen enkel secundair index, ook niet op foreign keys. De hoogste risico-kolommen:

| Tabel | Ontbrekende index op | Impact |
|-------|---------------------|--------|
| `activiteiten` | `gebouw_id`, `gebruiker_id`, `aangemaakt_op` | Activiteitsfeed pagineert over full-scan |
| `voorzieningen` | `gebouw_id`, `status`, `type` | Spotlijst bij grote gebouwen O(n) |
| `inspecties` | `voorziening_id`, `gebouw_id`, `type` | Inspectiefilters full-scan |
| `onderhoud` | `gebouw_id`, `status`, `deadline` | Onderhoudsdashboard full-scan |
| `documenten` | `entiteit_type`, `entiteit_id`, `categorie` | DMS-zoeken full-scan |
| `document_koppelingen` | `document_id`, `object_type`, `object_id` | Polymorfe koppelingen full-scan |
| `dossiers` | `gebouw_id`, `status` | Dossiermodule full-scan |
| `object_rechten` | ✅ Indexes aangemaakt (Task #180) | — |
| `verlof_aanvragen` | `medewerker_id`, `status`, `jaar` | Verlofmodule full-scan |
| `werkbonnen` | `opdracht_id`, `status` | Werkbonnenoverzicht full-scan |
| `chat_berichten` | `gesprek_id`, `aangemaakt_op` | Chat-polling full-scan |
| `uren` | `medewerker_id`, `week_start` | Urenregistratie full-scan |

**Ernst:** Hoog bij >500 records per tabel. Migratie via additieve `CREATE INDEX CONCURRENTLY`.

---

## 4. Routes zonder transacties

**15 routes** schrijven naar meerdere tabellen zonder `db.transaction()`:

| Route/endpoint | Tabellen geraakt | Risico |
|----------------|-----------------|--------|
| `POST /voorzieningen` | `voorzieningen` + `fotos` + `activiteiten` + `spot_ai_voorstellen` | Foto-rij kan wezen zonder spot als insert faalt |
| `PATCH /voorzieningen/:id` | `voorzieningen` + `labels` (via sync) + `activiteiten` | Labels inconsistent bij mislukte patch |
| `POST /gebouwen` | `gebouwen` + `verdiepingen` + `activiteiten` | Verdiepingen wezen zonder gebouw |
| `POST /inspecties` | `inspecties` + `activiteiten` | Activiteit zonder inspectie |
| `POST /onderhoud` | `onderhoud` + `activiteiten` | Activiteit zonder werkorder |
| `POST /dossiers/:id/definitief` | `dossiers` + `document_versies` (bevriezing) | Gedeeltelijk bevroren dossier |
| `POST /documenten` | `documenten` + `document_koppelingen` + `activiteiten` | Koppeling zonder document |
| `PATCH /documenten/:id` | `documenten` + `document_versies` + `activiteiten` | Versie zonder documentupdate |
| `POST /opdrachten` | `opdrachten` + `werkbegroting_regels` + `activiteiten` | Regels wezen |
| `POST /offertes/:id/opdracht` | `opdrachten` + `offertes` + `activiteiten` | Status mismatch bij fout |
| `POST /medewerkers` | `medewerkers` + `verlof_saldi` + `activiteiten` | Saldo zonder medewerker |
| `POST /verlof-aanvragen/:id/goedkeuren` | `verlof_aanvragen` + `verlof_saldi` | Saldo-update zonder statuswijziging |
| `DELETE /gebouwen/:id` | `gebouwen` + cascade-objecten + `activiteiten` | Deels verwijderd bij fout |
| `POST /gebruikers/:id/object-rechten` | `object_rechten` | (nieuw, enkelvoudig — geen risico) |
| `POST /backups/:id/herstel` | `backup_records` + directe DB-manipulatie | Inconsistente herstelstatus |

**Ernst:** Gemiddeld. De meeste schrijfpaden zijn enkelvoudig genoeg dat gedeeltelijke fouten zeldzaam zijn, maar voor juridisch relevante paden (dossier-bevriezing, offerte→opdracht) is transactioneel schrijven vereist.

---

## 5. Foutafhandeling

### 5.1 Inconsistente HTTP-statuscodes

| Patroon | Gevonden in | Juist gedrag |
|---------|------------|-------------|
| `res.status(404)` op parseer-fout | ~8 routes | Moet 400 zijn |
| `res.status(500)` op Zod-validatiefout | ~3 routes | Moet 400 zijn |
| Geen 409 bij uniek-constraint schending | ~12 routes | Lekt DB-foutberichten als 500 |

### 5.2 DB-foutberichten lekken naar client

In ~20 routes wordt de ruwe `err.message` of `err.detail` teruggegeven als de `error`-sleutel in de JSON-response. Dit lekt interne tabelnamen en kolomnamen naar de client.  
**Aanbeveling:** Centrale error-handler in `app.ts` die postgres-foutcodes omzet naar generieke berichten.

---

## 6. Performance

### 6.1 N+1-queries

| Endpoint | Patroon | Impact |
|----------|---------|--------|
| `GET /gebouwen` | Per gebouw: klantNaam + partijen + spots-totaal (3 queries) | ~3n queries bij n gebouwen |
| `GET /activiteiten` | Per activiteit: gebruiker opzoeken (bij sommige paden) | Zelden maar aanwezig |
| `GET /documenten` | Per document: koppelingen + versies | 2n queries |
| `GET /medewerkers` | Per medewerker: functies + opleidingen + verlof-saldo | 3n queries |

**Oplossing:** Gebruik `innerJoin` of losse `inArray`-batch-queries in plaats van per-rij opzoeking.

### 6.2 Ontbrekende `limit` op open queries

~12 list-endpoints (o.a. `GET /activiteiten`, `GET /documenten`, `GET /fotos/:gebouwId`) hebben geen `LIMIT` clause. Bij grote datasets leidt dit tot OOM en trage responses.

---

## 7. Circulaire imports — Geen gevonden

Alle route-imports zijn unidirectioneel (routes → services → utils → lib). Geen circulaire routes-imports gedetecteerd.

---

## 8. Samenvatting prioriteiten

| Prioriteit | Item | Actie |
|-----------|------|-------|
| **Kritiek** | Ontbrekende indexes (13+ tabellen) | `CREATE INDEX CONCURRENTLY` via migratie |
| **Hoog** | 15 multi-table routes zonder transactie | Wrap in `db.transaction()` per route |
| **Hoog** | DB-foutberichten lekken naar client | Centrale error-handler in `app.ts` |
| **Gemiddeld** | N+1-queries in gebouwen/documenten/medewerkers | Batch-queries of joins |
| **Gemiddeld** | List-endpoints zonder `LIMIT` | Default paginering toevoegen |
| **Laag** | parseId-inconsistentie | `utils/parse.ts` aanmaken |
| **Laag** | Error-wrapper code-herhaling (~80 routes) | Gedeelde async-wrapper helper |
| **Opgelost** | magBijGebouw dubbeling (4x) | ✅ Gecentraliseerd in Task #180 |
| **Opgelost** | toegewezenGebouwIds dubbeling (4x) | ✅ Gecentraliseerd in Task #180 |
