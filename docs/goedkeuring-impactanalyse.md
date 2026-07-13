# Governance & Approval Engine — Impact- en Architectuuranalyse

**Datum:** 13 juli 2026  
**Fase:** Kernmotor + pilot inkoopbon & offertes (volledig gebouwd)  
**Auteur:** FPS Connect — intern document

---

## 1. Scope en doel

De Governance & Approval Engine (intern: "goedkeuringsmotor") is een generieke, herbruikbare motor voor bedrijfskritieke besluiten die een formeel goedkeuringsproces vereisen. De motor is bewust niet gekoppeld aan één specifiek proces: elke koppeling is een dunne adapter op dezelfde kernel.

**Primaire use cases (gebouwd):**
- Inkoopbon: concept → goedgekeurd
- Offerte: concept → verzonden (geblokkeerd tot goedgekeurd)

**Toekomstige use cases (zelfde motor, zonder architectuurwijziging):**
- HRM-besluiten (functiewijziging, verlofoverschrijding buiten CAO)
- Facturen boven drempel
- Contractwijzigingen

---

## 2. Architectuuroverzicht

### 2.1 Lagen

```
┌──────────────────────────────────────────────────────────────────┐
│  Frontend (React + React Query)                                   │
│  GoedkeuringWidget  /beheer/goedkeuringsbeleid  /goedkeuringen-   │
│  dashboard                                                        │
└────────────────────────┬─────────────────────────────────────────┘
                         │ HTTPS / OpenAPI contract
┌────────────────────────▼─────────────────────────────────────────┐
│  API Server (Express 5)                                           │
│  routes/goedkeuring.ts  ←→  services/goedkeuring-engine.ts       │
│  services/goedkeuringBewaking.ts (escalatie achtergrondtaak)      │
└────────────────────────┬─────────────────────────────────────────┘
                         │ Drizzle ORM
┌────────────────────────▼─────────────────────────────────────────┐
│  PostgreSQL                                                       │
│  goedkeuring_beleidsregels  goedkeuring_aanvragen                 │
│  goedkeuring_stappen        goedkeuring_escalaties                │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 State machine goedkeuringsaanvraag

```
[concept] ──indienen──▶ [ingediend] ──goedkeuren──▶ [goedgekeurd]
                            │                              │
                          afwijzen                  (motor voert
                            │                       workflow-transitie
                            ▼                        uit via viaGoedkeuring)
                        [afgewezen]
                            │
                        intrekken
                            │
                            ▼
                       [ingetrokken]
                            │
               materiële wijziging na goedkeuring
                            │
                            ▼
                        [vervangen] ──(nieuwe aanvraag automatisch)──▶ [ingediend]
```

### 2.3 Koppelingspatroon (workflow-engine blokkade)

De motor integreert met de bestaande workflow-engine (`workflow-configs.ts`) via een bewust minimale koppeling:

1. Workflow-config roept `checkVereistGoedkeuring(objectType, objectId)` aan
2. Als er een beleidsregel van toepassing is: de transitie wordt **geblokkeerd** met HTTP 422 + code `VOORWAARDE`
3. De goedkeuringsmotor voert de transitie zelf uit via `vervangGoedgekeurdeAanvraag()` + `viaGoedkeuring: true`
4. `viaGoedkeuring: true` bypassed bewust de precheck en bevoegdheidscheck (dit is het **enige** geautoriseerde pad)

Dit patroon vereist **geen wijziging** van de workflow-engine en laat bestaande transitielogica intact.

---

## 3. Impact op bestaande modules

### 3.1 Inkoopbon (impact: laag)

| Gebied | Impact |
|--------|--------|
| DB-schema | Geen wijziging; 4 nieuwe tabellen toegevoegd (additief) |
| API | Geen breuk; PATCH status geeft nu soms 422 |
| Frontend | GoedkeuringWidget toegevoegd als extra kaart; bestaande UI ongewijzigd |
| Bevoegdheden | Nieuwe module `goedkeuring` (additief; bestaande presets krijgen niveau 0 tot ze bijgewerkt worden) |

### 3.2 Offertes (impact: laag-middel)

| Gebied | Impact |
|--------|--------|
| DB-schema | Geen wijziging |
| API | Verzenden (POST /offertes/:id/verzenden) geeft nu soms 422 |
| Frontend | Goedkeuring-tab toegevoegd in offertestudio; GoedkeuringWidget geïntegreerd |
| Intrekken | Nieuw eindpunt POST /offertes/:id/intrekken (was impliciet via status-PATCH) |
| Materiële wijziging | PATCH /offertes/:id met bedragwijziging/sectie-update markeert bestaande aanvraag als "vervangen" |

### 3.3 Bevoegdhedenmatrix (impact: laag)

Nieuwe module `goedkeuring` met vier niveaus:
- Niveau 1: aanvragen inzien
- Niveau 2: eigen aanvragen indienen
- Niveau 3: aanvragen goedkeuren/afwijzen
- Niveau 4: beleidsregels beheren

Bestaande presets zijn niet automatisch bijgewerkt; een hoofdbeheerder wijst niveau toe via `/beheer/rollen-rechten`.

### 3.4 Audit trail (impact: geen)

Alle mutaties op `goedkeuring_aanvragen` en `goedkeuring_stappen` gaan via de bestaande audit-middleware (automatisch). Mutaties op `goedkeuring_beleidsregels` (POST/PATCH/DELETE) maken bovendien expliciete `logAudit()`-aanroepen met `oudeWaarde`/`nieuweWaarde`, zodat elke beleidswijziging volledig herleidbaar is.

---

## 4. Gap-analyse (toestand voor vs. na deze taak)

| Gap | Status voor | Status na |
|-----|-------------|-----------|
| Inkoopbon-blokkade | Gebouwd | Gebouwd |
| Offerte-blokkade | Gebouwd | Gebouwd |
| GoedkeuringWidget (status/acties) | Gebouwd | Gebouwd |
| GoedkeuringWidget tijdlijn (stappen) | Niet gebouwd | **Gebouwd** |
| Audit logging beleidswijzigingen | Niet gebouwd | **Gebouwd** |
| E-mailnotificaties | Gebouwd | Gebouwd |
| Escalatie & bewaking | Gebouwd | Gebouwd |
| Goedkeuringen-dashboard | Gebouwd | Gebouwd |
| Beleidsregelscherm | Gebouwd | Gebouwd |
| Roadmap docs (gebouwd.md) bijgewerkt | Niet bijgewerkt (stale) | **Bijgewerkt** |
| Impact- en architectuuranalyse (dit document) | Niet aanwezig | **Aanwezig** |
| Business scenario bewijsvoering | Niet aanwezig | **Aanwezig** |

---

## 5. Risico-inventarisatie

### 5.1 Vier-ogen bypass (R01 — hoog)

**Risico:** een gebruiker die zelf een aanvraag heeft ingediend, keurt zijn eigen aanvraag goed.  
**Mitigatie:** `magGoedkeuren()` in `goedkeuring-engine.ts` sluit de indiener expliciet uit als de beleidsregel `vier_ogen_verplichting = true` bevat. Server-side afgedwongen; frontend toont de knop niet.

### 5.2 Race condition N-van-M (R02 — middel)

**Risico:** twee goedkeurders klikken gelijktijdig; aanvraag springt onverwacht naar `goedgekeurd`.  
**Mitigatie:** `ontvangen_goedkeuringen` wordt bij elke stap atomisch bijgewerkt in een transactie; de status-transitie naar `goedgekeurd` vindt alleen plaats als de drempel precies bereikt is (niet overschreden). Idempotent: dezelfde gebruiker kan niet twee keer goedkeuren.

### 5.3 Materiële wijziging na goedkeuring zonder nieuwe aanvraag (R03 — laag-middel)

**Risico:** een offerte wordt na goedkeuring inhoudelijk gewijzigd zonder nieuwe goedkeuringsronde.  
**Mitigatie:** `checkVereistNieuweGoedkeuring()` in `workflow-configs.ts` detecteert bedragwijziging, sectiewijziging en begrotingsregelwijziging. Bij detectie wordt de bestaande aanvraag gemarkeerd als `vervangen` en automatisch een nieuwe aanvraag ingediend.

### 5.4 Verouderd beleid-snapshot (R04 — laag)

**Risico:** het beleid wijzigt terwijl een aanvraag loopt; historische aanvragen lijken het nieuwe beleid te weerspiegelen.  
**Mitigatie:** `beleid_snapshot` (jsonb) slaat het beleid ten tijde van indienen op. Alle historische aanvragen zijn altijd juridisch correct, ook als het beleidsregel later gewijzigd of verwijderd wordt.

### 5.5 Escalatieachterstand bij stilstaande cron (R05 — laag)

**Risico:** de achtergrondtaak `goedkeuringBewaking` draait uurlijks; bij herstart van de API-server worden gemiste escalaties niet terug-ingehaald.  
**Mitigatie:** escalaties zijn deterministisch (vergelijken `ingediend_op` met `NOW()`); bij de eerstvolgende run worden alle gemiste escalaties alsnog verwerkt. Er zijn geen "verloren" escalaties.

---

## 6. Aanbevelingen voor toekomstige koppelingen

1. **Gebruik hetzelfde koppelingspatroon** als inkoopbon/offerte: workflow-config blokkeert met 422, motor voert uit via `viaGoedkeuring: true`.
2. **Registreer een nieuwe `document_type`** in de beleidsregelscherm-config (frontend), niet in de databasecode.
3. **Test vier-ogen-verplichting expliciet** bij elke nieuwe koppeling, ook als de beleidsregel `min_bedrag = 0` heeft.
4. **Houd `beleid_snapshot` actueel**: de motor slaat het snapshot automatisch op; herschrijf `serialiseerBeleidsregel()` als het schema van `GoedkeuringBeleidsregel` wijzigt.
5. **Voeg expliciete logAudit-aanroepen toe** voor elke nieuwe entiteitsmutatie die beleidswijzigingen raakt (bestaand patroon in `goedkeuring.ts` te volgen).

---

*Dit document is het verplichte impactanalyse-deliverable bij de Governance & Approval Engine-implementatie, conform het FPS Connect kwaliteitskader.*
