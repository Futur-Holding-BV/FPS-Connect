# Architectuurontwerp — Documenten-inbox / Verwerkingswachtrij

**Status:** Architectuur-backlog. Geen implementatie zonder nieuw expliciet akkoord.  
**Datum analyse:** 3 juli 2026  
**Gebaseerd op:** Spec "Toevoeging – Documenten-inbox / Verwerkingswachtrij" + codebase-scan

---

## 1. Wat al bestaat (huidig)

Dit is de meest kritieke bevinding: **de documenten-inbox bestaat al grotendeels**. Vóór enige implementatie moet de huidige staat volledig worden begrepen, zodat er niets dubbel wordt gebouwd.

### 1.1 Database

| Tabel | Bestaat | Inhoud |
|-------|---------|--------|
| `inbox_items` | ✅ | Kernentiteit: bestand, status, AI-velden, koppeling, audit |
| `inbox_audit_log` | ✅ | Per-item actielog (eigen tabel, los van centrale audit_log) |
| `aanvraag_planningen` | ✅ | Offerte-aanvraag flow: AI-extractie, bevestigingsmails, PL-bewaking |

**Huidig statusbereik** (`INBOX_STATUSSEN`):
```
nieuw → geanalyseerd → ter_beoordeling → goedgekeurd → verplaatst → afgewezen
```

**Huidige categorieën** (`INBOX_CATEGORIEEN`): 22 types (snagstream_rapport, offerte_document, factuur, contract, hr_document, product_certificaat, enz.)

**Huidige bestemmingen** (`INBOX_BESTEMMINGEN`): 17 modules

**Ontbrekende kolommen** (t.o.v. spec):
- Geen `urgentie`-veld
- Geen `geparkeerd_tot`-datum (parkeer-workflow)
- Geen `opnieuw_analyseren_op`-datum (heranalyse-scheduler)
- Geen `fout_details`-tekstveld (fout-status)
- Enkelvoudige koppeling (`gekoppeldeEntiteitType/Id/Naam`) — spec wil meervoudige koppelingen (klant + gebouw + project + offerte + dossier tegelijk)

### 1.2 Backend routes (`/inbox/*`)

| Route | Bestaat | Opmerking |
|-------|---------|-----------|
| `GET /inbox/stats` | ✅ | Telt per status |
| `GET /inbox/items` | ✅ | Lijst met status/bestemming-filter |
| `GET /inbox/items/:id` | ✅ | Detail + eigen auditlog |
| `POST /inbox/items` | ✅ | Upload (multipart) + mock-AI classificatie |
| `PATCH /inbox/items/:id` | ✅ | Metadata bijwerken |
| `POST /inbox/items/:id/goedkeuren` | ✅ | Status → goedgekeurd |
| `POST /inbox/items/:id/afwijzen` | ✅ | Status → afgewezen + reden |
| `POST /inbox/items/:id/verplaatsen` | ✅ | Status → verplaatst + bestemming |
| `POST /inbox/items/:id/ter-beoordeling` | ✅ | Status → ter_beoordeling |
| `POST /inbox/offerte-aanvraag` | ✅ | E-mail + bijlagen upload met **echte** OpenAI-extractie (GPT-4o) |
| `POST /inbox/items/:id/parkeren` | ❌ | Ontbreekt |
| `POST /inbox/items/:id/heranalyseren` | ❌ | Ontbreekt |
| `GET /inbox/items/:id/koppelingen` | ❌ | Meervoudige koppelingen ontbreken |
| `POST /inbox/items/:id/verwerken` | ❌ | Definitieve verwerking naar doelmodule ontbreekt |

### 1.3 AI-classificatie: huidig vs. gewenst

**Huidig:** `classificeerMockAI()` — puur op bestandsnaam-patronen (geen AI). Geeft: categorie, bestemming, betrouwbaarheid, samenvatting, redenering, volgende actie. Werkt voor eenvoudige gevallen.

**Uitzondering:** `POST /inbox/offerte-aanvraag` gebruikt al **echte GPT-4o** via OpenAI voor e-mail-extractie (opdrachtgever, gebouw, adres, contactpersoon, enz.).

**Gewenst:** Volledige AI-analyse via `document-ai.ts` (reeds aanwezig: `analyseerDocumentTekst`, `stelToepassingenVoor`). Uitbreiden met herkenning van klant, gebouw, project, offerte, dossier, medewerker.

### 1.4 Frontend (`/inbox`)

- **Pagina bestaat** (`src/pages/inbox/index.tsx`, 796 regels)
- Toont statusfilter (open/goedgekeurd/afgewezen/alles), kaartweergave per item
- Bevat: statistieken-banner, upload-modal, offerte-aanvraag-wizard (werkmaatschappij → upload → verwerken → resultaat)
- `SlimUploadBalk` integreert al met `POST /inbox/items`

---

## 2. Gap-analyse — spec vs. huidig

### 2.1 Statusmachine

| Spec-status | Huidig | Actie |
|-------------|--------|-------|
| `nieuw` | ✅ `nieuw` | — |
| `geanalyseerd` | ✅ `geanalyseerd` | — |
| `voorstel_klaar` | ❌ ontbreekt | Toevoegen — tussenstap na AI-analyse |
| `wacht_op_gebruiker` | ≈ `ter_beoordeling` | Hernoemen of synoniemen definiëren |
| `akkoord` | ≈ `goedgekeurd` | Hernoemen of synoniemen definiëren |
| `aangepast` | ❌ ontbreekt | Toevoegen — voorstel gewijzigd door gebruiker |
| `verwerkt` | ≈ `verplaatst` | Hernoemen (verplaatst impliceert alleen kopie; verwerkt = definitief) |
| `geparkeerd` | ❌ ontbreekt | Toevoegen |
| `afgewezen` | ✅ `afgewezen` | — |
| `fout` | ❌ ontbreekt | Toevoegen — AI-fout, storage-fout, verwerkingsfout |

**Risico bij hernoemen:** `geanalyseerd`/`ter_beoordeling`/`goedgekeurd`/`verplaatst` zijn hardcoded in frontend-kleurmaps en backend-filterlogica. Hernoemen = brekende wijziging. Aanbeveling: **addief uitbreiden** (nieuwe statussen toevoegen, oude behouden als aliases) totdat besloten wordt te migreren.

### 2.2 AI-voorstel inhoud

| Spec-veld | Huidig | Actie |
|-----------|--------|-------|
| Documenttype | ✅ `document_categorie` | — |
| Herkende klant | ❌ | Toevoegen als kolom of aiMetadata-JSON-veld |
| Herkend gebouw | ✅ `snagstream_gebouw` (alleen snagstream) | Generaliseren |
| Herkend project | ✅ `snagstream_project` (alleen snagstream) | Generaliseren |
| Mogelijke koppeling offerte/dossier/medewerker/HRM | ❌ | Toevoegen als JSONB-array `ai_koppeling_voorstellen` |
| Urgentie | ❌ | Kolom toevoegen (`laag`/`normaal`/`hoog`/`kritiek`) |
| Betrouwbaarheid | ✅ `ai_betrouwbaarheid` (`hoog`/`midden`/`laag`) | — |
| Voorgestelde actie | ✅ `ai_volgende_actie` | — |

### 2.3 Meervoudige koppelingen

**Huidig:** één tuple (`gekoppeldeEntiteitType`, `gekoppeldeEntiteitId`, `gekoppeldeEntiteitNaam`).

**Gewenst:** meerdere koppelingen per item (bijv. document is gekoppeld aan gebouw #12 én offerte #34 én dossier #7 tegelijk).

**Oplossing:** aparte tabel `inbox_koppelingen` (polymorfe associatie), analoog aan de bestaande `document_koppelingen`.

### 2.4 Definitieve verwerking

**Huidig:** `verplaatsen`-endpoint zet status naar `verplaatst` maar doet **niets** in de doelmodule. Het document belandt niet daadwerkelijk in DMS/documenten/offerte/HRM.

**Gewenst:** bij status `verwerkt` moet het bestand uit de inbox worden overgezet naar het definitieve opslagpad van de doelmodule, een rij worden aangemaakt in de betreffende tabel (bijv. `documenten`, `medewerker_documenten`), en de inbox-koppeling worden gelegd. Dit vereist een **verwerkings-dispatcher** per bestemming.

---

## 3. Afhankelijkheden van de 5 basisopdrachten

De documenten-inbox raakt alle vijf basisopdrachten. Dit is de reden dat implementatie niet kan starten vóór de basisopdrachten zijn beoordeeld.

### 3.1 Workflow Engine (Opdracht 1) — **kritiek**

De statusovergangen van de inbox moeten via de WorkflowEngine lopen. Huidig worden status-updates direct in de DB geschreven zonder validatie van toegestane overgangen.

**Gewenste integratie:**
```
WorkflowEngine.registreer("inbox_item", {
  beginstatus: "nieuw",
  overgangen: [
    { van: "nieuw",          naar: "geanalyseerd",    rol: "systeem" },
    { van: "geanalyseerd",   naar: "voorstel_klaar",  rol: "systeem" },
    { van: "voorstel_klaar", naar: "wacht_op_gebruiker", rol: "systeem" },
    { van: "wacht_op_gebruiker", naar: "akkoord",     rol: "gebruiker", bevoegdheid: "crm:2" },
    { van: "wacht_op_gebruiker", naar: "aangepast",   rol: "gebruiker", bevoegdheid: "crm:2" },
    { van: "wacht_op_gebruiker", naar: "geparkeerd",  rol: "gebruiker", bevoegdheid: "crm:1" },
    { van: "wacht_op_gebruiker", naar: "afgewezen",   rol: "gebruiker", bevoegdheid: "crm:2", vereist: "reden" },
    { van: ["akkoord", "aangepast"], naar: "verwerkt", rol: "systeem" },
    { van: "geparkeerd",     naar: "wacht_op_gebruiker", rol: "gebruiker" },
    { van: "*",              naar: "fout",             rol: "systeem" },
  ]
})
```

**Blokkade:** WorkflowEngine ondersteunt momenteel geen `systeem`-rol (alleen gebruiker-gedreven overgangen). Dit moet worden uitgebreid voordat de inbox-wachtrij-processor er gebruik van kan maken.

### 3.2 Audit Trail (Opdracht 2) — **hoog**

**Huidig probleem:** de inbox heeft een **eigen** `inbox_audit_log`-tabel die niet is gekoppeld aan de centrale `audit_log`. Dit betekent dat inbox-acties niet zichtbaar zijn in de centrale audit trail (Beheer › Audit trail).

**Gewenste integratie:**
- Elke statusovergang via WorkflowEngine roept automatisch `logAudit()` aan (WorkflowEngine-integratie al aanwezig voor andere modules)
- `inbox_audit_log` blijft als per-item detail-view; centrale `audit_log` voor compliance-overzicht
- Auditmodule moet `module: "inbox"` herkennen in de filter-dropdown

**Onduidelijkheid:** wordt `inbox_audit_log` dan redundant? Beslissing nodig: behouden als rijke item-context (met details), of samenvoegen met centrale audit_log.

### 3.3 RBAC (Opdracht 3 / Task #180) — **gemiddeld**

**Huidig:** inbox-routes zijn beveiligd op `crm:1` (lezen) en `crm:2` (schrijven) module-bevoegdheid. Dit is te grof.

**Gewenste integratie:**
- Gevoelige bestemmingen (HRM-documenten, financieel) vereisen hogere bevoegdheden per actie
- `requireObjectRecht()` kan worden gebruikt voor item-level toegang (bijv. alleen de uploader of een beheerder mag een item afwijzen)
- Rol `voorstel_klaar → akkoord` vereist minimaal `crm:2`; voor HR-bestemmingen `personeel:2`

**Aanbeveling:** eigen bevoegdheids-module `inbox` toevoegen aan de PRESETS-matrix zodat rechten per rol apart zijn in te stellen.

### 3.4 Integriteitscontrole (Opdracht 4) — **laag / informatief**

Bevindingen uit de integriteitscontrole die direct op de inbox van toepassing zijn:
- `inbox_items`-tabel heeft **geen secundaire indexes** op `status`, `geupload_door`, `geupload_op`, `document_categorie` → lijstquery's worden full-scans bij grote aantallen
- `POST /inbox/items` + `POST /inbox/audit_log` worden **niet in een transactie** uitgevoerd (zie technische schuld #14-categorie)
- `classificeerMockAI()` heeft **geen timeout** — als het vervangen wordt door echte AI, geldt dezelfde blokkade als bij andere AI-endpoints

### 3.5 Technische Schuld (Opdracht 5) — **laag / informatief**

Relevante schuld-items die de inbox raken:
- **#13:** Multi-table zonder transactie (POST /inbox/items schrijft item + audit_log zonder atomiciteit)
- **#29:** AI-endpoints zonder input-lengte-limiet (geldt ook voor toekomstige inbox-AI)
- **#30:** Bestandsuploads controleren MIME-type niet server-side
- **#17:** Geen paginering op `GET /inbox/items` (groeit bij intensief gebruik)
- **#84:** Geen Sentry/error-tracking — verwerkingsfouten zijn stille failures

---

## 4. Doelarchitectuur

### 4.1 Componentendiagram

```
┌─────────────────────────────────────────────────────────┐
│ Upload-kanalen                                          │
│  SlimUpload │ Drag-and-drop │ E-mail (.eml/.msg) │ API  │
└─────────────────────┬───────────────────────────────────┘
                      │ POST /inbox/items (multipart)
                      ▼
┌─────────────────────────────────────────────────────────┐
│ Inbox-wachtrij (inbox_items tabel)                      │
│  status: nieuw → geanalyseerd → voorstel_klaar          │
│          → wacht_op_gebruiker → akkoord/aangepast       │
│          → verwerkt / geparkeerd / afgewezen / fout     │
└──────────┬─────────────────────────┬───────────────────┘
           │                         │
           ▼                         ▼
┌──────────────────┐      ┌──────────────────────────────┐
│ AI-analyseur     │      │ Gebruikers-interface          │
│ (achtergrond)    │      │  /inbox — beoordeelpagina     │
│  - classificatie │      │  - voorstel tonen/aanpassen  │
│  - klant-herken. │      │  - akkoord / afwijzen        │
│  - koppel-voorstel│     │  - handmatig koppelen        │
│  - urgentie      │      │  - parkeren / heranalyseren  │
└──────────────────┘      └──────────────────────────────┘
                                      │
                                      ▼ status → verwerkt
                      ┌───────────────────────────────────┐
                      │ Verwerkings-dispatcher             │
                      │  switch (bestemming):              │
                      │   DMS → POST /documenten          │
                      │   Gebouw → koppel aan gebouwen    │
                      │   Offerte → bijlage aan offerte   │
                      │   HRM → medewerker-document       │
                      │   Bibliotheek → label-document    │
                      │   Onderhoud → werkorder-bijlage   │
                      │   …                               │
                      └───────────────────────────────────┘
                                      │
                                      ▼
                      ┌───────────────────────────────────┐
                      │ Doelmodule + Audit Trail           │
                      │ (logAudit + inbox_audit_log)       │
                      └───────────────────────────────────┘
```

### 4.2 Volledig statusdiagram

```
                ┌──────────────────────────────────────────┐
                │                                          │
   upload       ▼          AI-analyse                     │
 ──────────► NIEUW ──────────────────► GEANALYSEERD       │
                                            │              │
                                   AI geslaagd             │
                                            ▼              │
                                    VOORSTEL_KLAAR         │
                                            │              │
                              (systeem meldt aan gebruiker)│
                                            ▼              │
                                  WACHT_OP_GEBRUIKER       │
                                    /    |    \    \       │
                              akkoord  aang. park. afwijs  │
                                /       |     |      \     │
                           AKKOORD AANGEPAST GEPARKEERD AFGEWEZEN
                              \       /          |
                         verwerken             (later terug)
                                \       /
                                VERWERKT  ──── (definitief)

   Vanuit elke status mogelijk:
   → FOUT  (systeem-fout tijdens AI of verwerking)
   → heranalyseren → NIEUW  (gebruiker reset)
```

### 4.3 Meervoudige koppelingen — tabelontwerp

```sql
-- Nieuwe tabel (additief, geen brekende wijziging)
CREATE TABLE inbox_koppelingen (
  id          SERIAL PRIMARY KEY,
  inbox_item_id INTEGER NOT NULL REFERENCES inbox_items(id) ON DELETE CASCADE,
  object_type TEXT NOT NULL,   -- 'gebouw','klant','offerte','dossier','medewerker','onderhoud',…
  object_id   INTEGER NOT NULL,
  object_naam TEXT,            -- denormalized cache
  relatie     TEXT,            -- 'primair','aanvullend','suggestie_ai','bevestigd_gebruiker'
  aangemaakt_op TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (inbox_item_id, object_type, object_id)
);
CREATE INDEX ON inbox_koppelingen (inbox_item_id);
CREATE INDEX ON inbox_koppelingen (object_type, object_id);
```

**Migratie:** bestaande `gekoppeldeEntiteitType/Id/Naam` kolommen migreren naar `inbox_koppelingen` (eenmalig script). Kolommen daarna deprecaten (niet droppen).

### 4.4 Uitgebreid inbox_items schema (additieve wijzigingen)

```sql
-- Alleen nieuwe kolommen; bestaande ongewijzigd
ALTER TABLE inbox_items
  ADD COLUMN urgentie TEXT DEFAULT 'normaal',       -- laag/normaal/hoog/kritiek
  ADD COLUMN ai_koppeling_voorstellen JSONB,        -- [{type,id,naam,betrouwbaarheid}]
  ADD COLUMN geparkeerd_tot DATE,                   -- null = onbepaald
  ADD COLUMN opnieuw_analyseren_op TIMESTAMP,       -- voor heranalyse-scheduler
  ADD COLUMN fout_details TEXT,                     -- foutmelding bij status='fout'
  ADD COLUMN verwerkt_door INTEGER REFERENCES gebruikers(id),
  ADD COLUMN verwerkt_op TIMESTAMP,
  ADD COLUMN verwerking_resultaat JSONB;            -- {doelmodule, doelId, doelNaam, pad}
```

### 4.5 AI-analyseur — servicearchitectuur

De huidige `classificeerMockAI()` wordt vervangen door een asynchrone achtergrond-analyseur. Synchrone classificatie (bij upload) blijft aanwezig als snelle placeholder.

```
POST /inbox/items
  │
  ├─ 1. Sla bestand op in object storage (sync)
  ├─ 2. Maak inbox_item aan met status='nieuw' (sync)
  ├─ 3. Snelle mock-classificatie → status='geanalyseerd' (sync, bestandsnaam-gebaseerd)
  └─ 4. Stuur job naar achtergrond-wachtrij (async, fire-and-forget)
           │
           └─ 5. AI-analyseur (background):
                    a. Haal bestand op uit object storage
                    b. Extraheer tekst (PDF → pdfjs / docx → mammoth)
                    c. Roep OpenAI aan (analyseerDocumentTekst + nieuwe prompt)
                    d. Match herkende namen tegen DB (gebouwen, klanten, medewerkers)
                    e. Update inbox_item: status='voorstel_klaar', ai_koppeling_voorstellen
                    f. logAudit('inbox', 'ai_analyse_voltooid', ...)
                    g. Bij fout: status='fout', fout_details=err.message
```

**Achtergrond-wachtrij:** geen externe queue (Redis/BullMQ) nodig in fase 1 — gebruik `setTimeout(async () => { ... }, 0)` met afvangst. In fase 2 (bij schaling) verplaatsen naar een aparte worker.

---

## 5. Integratiepunten per module

| Module | Type | Wat is nodig bij implementatie |
|--------|------|-------------------------------|
| **Slim Upload** | ✅ Al gekoppeld | Statusbadge in balk uitbreiden met `voorstel_klaar` |
| **DMS / Documenten** | Kern | `verwerkings-dispatcher` maakt `POST /documenten` aan + koppeling |
| **Projecten** | Hoog | Koppel inbox-item aan project via `inbox_koppelingen.object_type='project'` |
| **Gebouwen** | Hoog | Koppel aan gebouw; AI herkent gebouwnaam uit tekst |
| **Offertes** | ✅ Al gedeeltelijk (offerte-aanvraag flow) | Dispatcher koppelt bijlage aan offerte-rij |
| **Werkvoorbereiding** | Gemiddeld | Bijlage koppelen aan werkorder |
| **Oplevering** | Gemiddeld | Opleveringsrapport koppelen aan inspectieset |
| **Onderhoud** | Gemiddeld | Onderhoudsdocument koppelen aan werkorder of contract |
| **HRM** | Hoog (privacy) | Medewerker-document; vereist `personeel:2` bevoegdheid |
| **Bibliotheek** | Gemiddeld | Product-certificaat koppelen aan label |
| **Audit Trail** | Kern | `logAudit()` bij elke statusovergang |
| **AI-logboek** | Toekomst | Nog niet aanwezig; placeholder in `ai_koppeling_voorstellen` |

---

## 6. Acceptatiecriteria (volledigheidscheck per item)

Uit de spec: een document is pas definitief verwerkt wanneer:

| Criterium | Huidig | Toekomst |
|-----------|--------|----------|
| Wie heeft het geüpload | ✅ `geupload_door` FK + naam | — |
| Wat AI heeft voorgesteld | ✅ `ai_samenvatting`, `ai_redenering`, `ai_volgende_actie` | + `ai_koppeling_voorstellen` JSONB |
| Wie akkoord heeft gegeven | ✅ `goedgekeurd_door` + `goedgekeurd_op` | Hernoemen naar `akkoord_door`/`akkoord_op` |
| Waaraan het document is gekoppeld | ⚠️ Alleen enkelvoudig | `inbox_koppelingen` tabel |
| Welke actie daarna is uitgevoerd | ⚠️ Alleen in `inbox_audit_log` | `verwerking_resultaat` JSONB |
| Waar het document terug te vinden is | ❌ Niet opgeslagen | `verwerking_resultaat.doelId` + link in UI |

---

## 7. Bouwvolgorde (gelaagd, als akkoord gegeven)

### Fase A — Versteviging bestaande inbox (geen nieuwe functionaliteit)
1. DB-indexes toevoegen op `status`, `geupload_door`, `geupload_op`
2. `POST /inbox/items` + audit_log in transactie wrappen
3. Paginering toevoegen aan `GET /inbox/items`
4. MIME-type server-side validatie toevoegen
5. Centrale `logAudit()` aanroepen naast `inbox_audit_log` (dubbel schrijven, geen data-verlies)

**Blokkade:** Audit Trail (Opdracht 2) moet klaar zijn.

### Fase B — Statusmachine via WorkflowEngine
1. Ontbrekende statussen toevoegen aan `INBOX_STATUSSEN` (additief)
2. Nieuwe kolommen: `urgentie`, `geparkeerd_tot`, `fout_details`
3. WorkflowEngine-definitie voor `inbox_item`
4. Bestaande directe status-updates vervangen door `WorkflowEngine.transiteer()`
5. Frontend-kleurmaps + labels uitbreiden

**Blokkade:** WorkflowEngine (Opdracht 1) + systeem-rol-ondersteuning.

### Fase C — Meervoudige koppelingen
1. `inbox_koppelingen`-tabel aanmaken
2. Bestaande `gekoppeldeEntiteitType/Id/Naam` migreren
3. CRUD-routes voor koppelingen
4. Frontend: meervoudig koppelen UI

### Fase D — Echte AI-classificatie (asynchroon)
1. `ai_koppeling_voorstellen`-kolom + `opnieuw_analyseren_op`-kolom
2. Achtergrond-analyseur (setTimeout-gebaseerd, fase 1)
3. Prompt uitbreiden: klant/gebouw/project-matching via DB-lookup
4. UI: AI-voorstel weergeven als gele kaart (conform AI-state-kleurconventie)

**Blokkade:** OpenAI-quota beschikbaar; `document-ai.ts` uitbreiden.

### Fase E — Verwerkings-dispatcher
1. `verwerkt`-status + `verwerking_resultaat`-kolom
2. Dispatcher-service per bestemming (DMS als eerste)
3. UI: "Definitief verwerken"-knop met bestemmingskeuze
4. Koppeling van verwerkt document zichtbaar in doelmodule

**Blokkade:** Fase C (koppelingen) + RBAC (Opdracht 3).

---

## 8. Openstaande beslissingen (vóór implementatie te beantwoorden)

| # | Vraag | Opties | Impact |
|---|-------|--------|--------|
| 1 | Worden de huidige statussen hernoemd of uitgebreid? | Hernoem (brekend) vs. additief uitbreiden (backward-compatible) | Hoog — raakt frontend + API |
| 2 | Blijft `inbox_audit_log` bestaan naast centrale `audit_log`? | Beide behouden vs. samenvoegen | Gemiddeld — compliance vs. complexiteit |
| 3 | Eigen `inbox`-module in bevoegdheden-matrix? | Ja (aparte module) vs. onder `crm` (huidig) | Hoog — RBAC-ontwerp |
| 4 | Achtergrond-wachtrij: setTimeout vs. externe queue? | Eenvoudig maar single-threaded vs. schaalbaar | Hoog bij groei |
| 5 | Definitieve verwerking: kopieert bestand of verplaatst? | Kopie (inbox als archief) vs. move (inbox leegt na verwerking) | Juridisch + storage-impact |
| 6 | Heranalyse door gebruiker: reset alle AI-velden? | Volledig reset vs. versioned history | Auditbaarheid |
| 7 | Wat gebeurt er met `aanvraag_planningen`-tabel? | Blijft apart vs. integreren in generieke inbox-flow | Architectuur |

---

## 9. Risico's en aandachtspunten

| Risico | Ernst | Mitigatie |
|--------|-------|-----------|
| Statusmachine-migratie breekt bestaande UI (kleurmaps, filters) | Hoog | Additieve aanpak; legacy-aliases behouden |
| AI-analyseur blokkeert bij OpenAI 503/quota-overschrijding | Hoog | Fallback op mock-classificatie; `fout`-status + retry |
| Verwerkings-dispatcher schrijft dubbel bij retry | Hoog | Idempotentie-check: als `verwerking_resultaat` al gevuld → skip |
| HRM-documenten in inbox: privacygevoelig | Hoog | `personeel:2` bevoegdheid verplicht voor HRM-bestemming |
| Groeiende inbox zonder archivering | Gemiddeld | Auto-archiveer `verwerkt`/`afgewezen` na 90 dagen (instelbaar) |
| `snagstream_*`-kolommen zijn bestemming-specifiek in generieke tabel | Laag | Na meervoudige koppelingen: migreren naar `inbox_koppelingen` + `ai_koppeling_voorstellen` JSONB |

---

## 10. Niet te doen (scope-bewaking)

Conform de opdracht en de Ontwikkelstop-regel geldt voor elke toekomstige implementatie:

- **AI mag documenten NIET zelfstandig definitief verwerken** zonder menselijke bevestiging. De dispatcher mag alleen worden gestart na `status='akkoord'` of `'aangepast'` met een actieve gebruikerssessie.
- **Geen AI-personeelsadvies**: HRM-documenten in de inbox mogen alleen worden geclassificeerd en voorgesteld — niet automatisch aan medewerkers worden gekoppeld.
- **Geen automatische offerte-verzending**: de offerte-aanvraag flow stopt bij het aanmaken van de offerte-conceptrecord. Verzending altijd handmatig.
- **Geen integratie met CRM-module**: de bestaande CRM-scaffold wordt niet uitgebouwd totdat V1.5 is beoordeeld.
