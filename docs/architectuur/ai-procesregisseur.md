# Architectuurontwerp — AI Process Orchestrator (APO)

**Status:** Architectuur-backlog. Geen implementatie zonder nieuw expliciet akkoord.  
**Datum analyse:** 3 juli 2026  
**Gebaseerd op:** Spec "Architectuuropdracht – AI als procesregisseur van Connect" + codebase-scan

---

## 1. Context en kernprincipe

### 1.1 Wat er nu is: losse AI-eilanden

Connect heeft al zeven werkende AI-diensten, maar ze staan volledig los van elkaar:

| Service | Functie | Entiteit | Workflow-bewust? |
|---------|---------|----------|-----------------|
| `document-ai.ts` | Documentclassificatie + tekst-extractie | Document | ❌ |
| `spot-ai.ts` | Spotherkenning via foto (vision) | Voorziening | ❌ |
| `gebouw-ai.ts` | Gebouwherkenning, geocode, tekening-analyse | Gebouw | ❌ |
| `opleiding-ai.ts` | Opleidingsvoorstel per functie | Medewerker | ❌ |
| `email-ai.ts` | E-mail parsen + velden extraheren | Inbox | ❌ |
| `classificeerMockAI()` | Inbox-categorisering op bestandsnaam | Inbox-item | ❌ |
| `extraheerAanvraagVeldenMetAi()` | Offerte-aanvraag veld-extractie | Offerte | ✅ (beperkt) |

**Probleem:** elke service kent alleen zijn eigen entiteit. Geen enkele service weet:
- in welke workflowstatus de bijbehorende entiteit zit;
- welke rol de actie mag uitvoeren;
- welke vervolgstap logisch is;
- wat er al eerder door AI of mens is besloten.

### 1.2 Wat de APO toevoegt

De AI Process Orchestrator is **geen nieuwe AI-model** — het is een **coördinatie- en geheugenlaag** bovenop de bestaande AI-services en de bestaande WorkflowEngine. De APO:

1. ontvangt een input-event (document, e-mail, foto, notitie, werkbon);
2. bepaalt context (entiteit, workflow, status, openstaande acties);
3. roept de juiste bestaande AI-service aan;
4. vertaalt het resultaat naar een **gestructureerde AI-taak** met voorstel, vereiste rol en vervolgstap;
5. legt alles vast in het **AI-logboek**;
6. wacht op menselijke bevestiging voor gereserveerde acties.

De APO vervangt geen bestaande AI-service. Hij orchestreert ze.

---

## 2. Datamodel

### 2.1 Nieuwe tabellen (conceptueel — nog niet te bouwen)

#### 2.1.1 `ai_taken` — centrale werkeenheid van de APO

```
ai_taken
  id                  SERIAL PK
  trigger_type        TEXT NOT NULL          -- 'document','email','foto','notitie','werkbon','factuur','rapport','contract','offerteaanvraag'
  trigger_bron_id     INTEGER                -- FK naar inbox_items.id of ander bronobject
  trigger_bron_type   TEXT                   -- 'inbox_item','email','foto','handmatig'
  trigger_inhoud      TEXT                   -- ruwe invoer (bestandsnaam, e-mailonderwerp, enz.)

  entiteit_type       TEXT                   -- 'gebouw','project','offerte','werkbon','medewerker','dossier','onderhoud','klant'
  entiteit_id         INTEGER                -- FK naar betreffende entiteit
  entiteit_naam       TEXT                   -- denormalized cache

  workflow_naam       TEXT                   -- naam van WorkflowConfig (bijv. 'offerte')
  workflow_status     TEXT                   -- status ten tijde van taak-aanmaak
  workflow_stap       TEXT                   -- de stap die de APO voorstelt of bewaakt

  ai_service          TEXT                   -- welke service is aangeroepen (document-ai, spot-ai, enz.)
  ai_model            TEXT                   -- bijv. 'gpt-4o', 'gpt-4o-mini'
  ai_prompt_hash      TEXT                   -- sha256 van prompt (voor audit, niet de prompt zelf)
  ai_invoer_tokens    INTEGER
  ai_uitvoer_tokens   INTEGER
  ai_kosten_eurocent  INTEGER                -- geschatte kosten

  ai_classificatie    TEXT                   -- herkend document/inputtype
  ai_betrouwbaarheid  TEXT                   -- 'hoog','midden','laag'
  ai_voorstel         JSONB NOT NULL         -- het volledige gestructureerde voorstel (zie §2.2)
  ai_redenering       TEXT                   -- uitleg voor de gebruiker
  ai_volgende_actie   TEXT                   -- beschrijving gewenste vervolgstap
  ai_ontbrekende_info TEXT[]                 -- velden die AI mist

  status              TEXT NOT NULL DEFAULT 'wacht_op_gebruiker'
                                             -- wacht_op_gebruiker | akkoord | aangepast | afgewezen | verwerkt | fout | verlopen
  beslissing_door     INTEGER REFERENCES gebruikers(id)
  beslissing_op       TIMESTAMP
  beslissing_reden    TEXT                   -- bij 'aangepast' of 'afgewezen'
  beslissing_aanpassing JSONB               -- wat de gebruiker heeft veranderd t.o.v. het voorstel

  vereiste_rol        TEXT                   -- minimale bevoegdheid om te beslissen (bijv. 'crm:2')
  deadline            TIMESTAMP              -- bewakingsdeadline voor open taken
  herinnering_op      TIMESTAMP             -- wanneer systeem herinnering stuurt
  verlopen_op         TIMESTAMP             -- wanneer taak automatisch verloopt

  aangemaakt_op       TIMESTAMP NOT NULL DEFAULT NOW()
  bijgewerkt_op       TIMESTAMP NOT NULL DEFAULT NOW()
```

#### 2.1.2 `ai_logboek` — complete audit van elke AI-interactie

```
ai_logboek
  id              SERIAL PK
  ai_taak_id      INTEGER REFERENCES ai_taken(id) ON DELETE SET NULL
  tijdstip        TIMESTAMP NOT NULL DEFAULT NOW()
  service         TEXT NOT NULL              -- welke AI-service
  actie           TEXT NOT NULL              -- 'classificatie','extractie','voorstel','heranalyse','fout'
  gebruiker_id    INTEGER REFERENCES gebruikers(id)
  invoer_samenvatting TEXT                  -- niet de volledige prompt (privacy/kosten)
  uitvoer_samenvatting TEXT
  duur_ms         INTEGER
  tokens_gebruikt INTEGER
  fout            TEXT                      -- foutmelding indien aanwezig
  meta            JSONB                     -- extra context
  INDEX op (ai_taak_id), (tijdstip DESC), (service), (gebruiker_id)
```

#### 2.1.3 `ai_kennisobjecten` — lerende basis (toekomst)

```
ai_kennisobjecten
  id              SERIAL PK
  object_type     TEXT NOT NULL              -- 'klant','gebouw','leverancier','product','medewerker'
  object_id       INTEGER NOT NULL
  object_naam     TEXT NOT NULL
  aliassen        TEXT[]                    -- alternatieve namen die AI herkent
  sleutelwoorden  TEXT[]                    -- voor matching
  context_samenvatting TEXT                -- wat AI weet over dit object
  bijgewerkt_op   TIMESTAMP NOT NULL DEFAULT NOW()
  UNIQUE (object_type, object_id)
```

> `ai_kennisobjecten` is de basis voor "herkende klant/gebouw" in de documenten-inbox. In fase 1 wordt het gevuld uit bestaande DB-data (naam, adres, aliassen). In fase 2 wordt het zelflerend (AI corrigeert aliassen na gebruikersbevestiging).

### 2.2 Structuur van `ai_voorstel` (JSONB)

```json
{
  "documenttype": "offerte_document",
  "koppelingen": [
    { "type": "klant",   "id": 14,  "naam": "Bouwbedrijf X",   "betrouwbaarheid": "hoog" },
    { "type": "gebouw",  "id": 42,  "naam": "Kantoor Centrum",  "betrouwbaarheid": "midden" },
    { "type": "offerte", "id": null, "naam": null,              "betrouwbaarheid": "laag", "reden": "geen match gevonden" }
  ],
  "urgentie": "normaal",
  "workflowstap": "offerte_aanmaken",
  "acties": [
    { "type": "taak_klaarzetten", "rol": "crm:2", "omschrijving": "Offerte aanmaken voor klant X" },
    { "type": "koppeling_bevestigen", "rol": "crm:1", "omschrijving": "Gebouw-koppeling controleren" }
  ],
  "ontbrekende_info": ["project_referentie", "contactpersoon_email"],
  "waarschuwingen": ["Zelfde klant heeft al 2 openstaande offertes"]
}
```

---

## 3. Services

### 3.1 AiOrchestrator — kernservice

```
AiOrchestrator
  ├── ontvangEvent(event: ApoEvent): Promise<AiTaak>
  │     Hoofdingang. Altijd asynchroon.
  │
  ├── bepaalContext(event): Promise<ApoContext>
  │     Laadt entiteit, workflow-status, openstaande acties, historische AI-beslissingen.
  │
  ├── routeerNaarService(context): Promise<AiRuweResultaat>
  │     Switch op event.type → roept juiste bestaande AI-service aan.
  │     Nooit direct OpenAI aanroepen — altijd via bestaande service.
  │
  ├── bouwVoorstel(resultaat, context): AiVoorstel
  │     Vertaalt ruwe AI-output naar gestructureerd voorstel + acties + waarschuwingen.
  │
  ├── slaAiTaakOp(voorstel, context): Promise<AiTaak>
  │     Persisteert ai_taken + ai_logboek + logAudit().
  │
  ├── bewakDeadlines(): Promise<void>
  │     Cron-achtige functie: stuurt herinneringen, markeert verlopen taken.
  │
  └── verwerkBeslissing(taakId, beslissing): Promise<void>
        Na menselijke akkoord/aanpassing → triggert WorkflowEngine.transiteer() indien van toepassing.
```

### 3.2 ApoContext — wat de orchestrator weet vóór AI-aanroep

```typescript
interface ApoContext {
  // Input
  event: ApoEvent;

  // Entiteit
  entiteitType: string;
  entiteitId: number | null;
  entiteitNaam: string | null;

  // Workflow
  workflowNaam: string | null;          // naam in WorkflowConfig
  workflowStatus: string | null;        // huidige status van de entiteit
  toegestaneOvergangen: string[];       // wat WorkflowEngine toestaat vanuit huidige status

  // Bevoegdheid
  initiatorGebruikerId: number | null;
  initiatorRol: string;
  vereistBevoegdheid: string;           // minimaal voor beslissen

  // Historiek
  eerdereTaken: AiTaakSamenvatting[];   // vorige APO-taken voor dezelfde entiteit
  openTaken: AiTaakSamenvatting[];      // nog niet besliste taken voor dezelfde entiteit

  // Kennisobjecten
  bekendEntiteiten: AiKennisobject[];   // voor naam-matching

  // Bron
  bronInhoud: string | null;            // tekst uit inbox/email/notitie
  bronBestandspad: string | null;       // object-storage pad voor vision
}
```

### 3.3 Routering naar bestaande AI-services

De APO roept bestaande services aan — hij introduceert geen nieuwe AI-logica:

| Event-type | AI-service | Methode |
|-----------|-----------|---------|
| `document` (PDF/DOCX) | `document-ai.ts` | `analyseerDocumentTekst()` |
| `document` (product-cert) | `document-ai.ts` | `stelToepassingenVoor()` |
| `foto` (spot-foto) | `spot-ai.ts` | `analyseerSpot()` |
| `foto` (gebouw/tekening) | `gebouw-ai.ts` | `analyseerTekening()` / `analyseerPlattegrond()` |
| `email` | `email-ai.ts` | `parseEmailBestand()` |
| `email` (offerte-aanvraag) | `email-ai.ts` + `extraheerAanvraagVeldenMetAi()` | (al aanwezig in inbox.ts) |
| `offerteaanvraag` | direct → `inbox.ts`-flow | (al aanwezig) |
| `notitie` / `werkbon` | `document-ai.ts` (tekst-modus) | `analyseerDocumentTekst()` |
| `opleiding` (HRM) | `opleiding-ai.ts` | `stelOpleidingenVoor()` |

Ontbrekende services die de APO zal aanroepen maar die nog niet bestaan:
- `contract-ai.ts` — contractanalyse (looptijd, verlengingsclausule, risico's)
- `factuur-ai.ts` — factuururherkenning + kostenplaats-suggestie
- `rapport-ai.ts` — rapportanalyse (Snagstream + eigen rapporten)

---

## 4. API's

Alle APO-endpoints zijn intern (geen publieke API). Ze worden aangeroepen vanuit:
- bestaande upload-routes (inbox.ts, slim-upload.ts);
- frontend-acties (gebruiker triggert handmatig);
- achtergrond-scheduler (deadline-bewaking).

### 4.1 Trigger-endpoints (intern, server-to-server)

```
POST /api/apo/events
  Body: { triggerType, bronId, bronType, entiteitType?, entiteitId?, initiatorGebruikerId }
  → Maakt AiTaak aan, start analyse asynchroon
  → Geeft taak-id terug (niet wachten op AI-resultaat)
  Autorisatie: requireAuth (systeem-sessie of gebruiker)

GET /api/apo/taken
  Query: status, entiteitType, entiteitId, mijnTaken, pagina, perPagina
  → Lijst open/afgeronde AI-taken voor de huidige gebruiker
  Autorisatie: requireBevoegdheid (module afhankelijk van entiteitType)

GET /api/apo/taken/:id
  → Detail + volledig ai_voorstel + ai_logboek voor deze taak
  Autorisatie: requireBevoegdheid (idem)

POST /api/apo/taken/:id/beslissen
  Body: { beslissing: 'akkoord'|'aangepast'|'afgewezen', aanpassing?, reden? }
  → Verwerkt beslissing, triggert WorkflowEngine indien van toepassing
  → Schrijft naar ai_taken + ai_logboek + audit_log
  Autorisatie: requireBevoegdheid (vereiste_rol van de taak)

POST /api/apo/taken/:id/heranalyseren
  → Reset taak naar 'wacht_op_gebruiker', start nieuwe AI-analyse
  Autorisatie: requireBevoegdheid (crm:2 of hoger)

GET /api/apo/logboek
  Query: taakId, service, van, tot, pagina
  → Pagineerde AI-logboek (audit-achtig)
  Autorisatie: requireBevoegdheid('systeem', 4) — alleen hoofdbeheerder
```

### 4.2 Frontend-integratiepunten

De APO introduceert **geen nieuwe pagina's** in fase 1. Hij integreert in bestaande schermen via notificatie-badges en taaklijsten:

| Scherm | Integratie |
|--------|-----------|
| `/inbox` | Badge "AI-voorstel klaar", koppelingsuggesties tonen |
| `/gebouwen/:id` | "AI heeft 1 openstaande taak" banner |
| `/offertes/:id` | AI-taak-paneel in zijbalk (voorstel + akkoord-knop) |
| `/personeel/:id` | Opleidingsvoorstel-sectie (al aanwezig, uitbreiden) |
| Beheer › AI-logboek | Nieuw scherm: overzicht alle AI-taken + logboek |

---

## 5. Integratie met bestaande modules

### 5.1 WorkflowEngine (kritieke afhankelijkheid)

De APO gebruikt de WorkflowEngine op twee manieren:

**A — Context lezen (nu al mogelijk):**
```typescript
// Haal huidige workflow-status op voor context-opbouw
const config = workflowService.getConfig("offerte");
const toegestaan = config.overgangen
  .filter(o => o.van === huidigeStatus)
  .map(o => o.naar);
```

**B — Transitie triggeren (na menselijke akkoord):**
```typescript
// Alleen na beslissing === 'akkoord' of 'aangepast'
await workflowService.transiteer({
  config: "offerte",
  entiteit: offerte,
  naar: "ter_goedkeuring",
  context: maakTransitieContext(req),
  reden: "APO: gebruiker akkoord gegeven op AI-voorstel",
});
```

**Blokkade:** WorkflowEngine ondersteunt momenteel geen `systeem`-initiator (alle transities vereisen `req`). De APO heeft een systeem-transitie nodig voor automatische statusovergangen (bijv. na upload → automatisch `ter_beoordeling`). Dit vereist een uitbreiding van `TransitieContext` met een `systeem: true` vlag.

### 5.2 Audit Trail

Elke APO-actie roept `logAudit()` aan met `module: "apo"`:

```typescript
logAudit({
  module: "apo",
  actie: "ai_voorstel_aangemaakt",
  entiteit: "ai_taak",
  entiteitId: taak.id,
  entiteitNaam: `${event.triggerType} → ${entiteitNaam}`,
  nieuweWaarde: { voorstel: taak.aiVoorstel, betrouwbaarheid: taak.aiBetrouwbaarheid },
  gebruikerId: initiatorGebruikerId,
  gebouwId: context.gebouwId,
});
```

`ai_logboek` is aanvullend op de centrale audit_log: het bevat technische details (tokens, duur, model) die niet in audit_log thuishoren.

### 5.3 RBAC / Permissies

De APO respecteert de bestaande `requireBevoegdheid`-middleware. De `vereiste_rol` in een AI-taak wordt afgeleid van de entiteit:

| Entiteit | Vereiste beslisbevoegdheid |
|----------|--------------------------|
| Offerte | `crm:2` |
| Dossier | `rapportages:2` |
| HRM-document | `personeel:2` |
| Spot/voorziening | `voorzieningen:2` |
| Gebouw | `gebouwen:2` |
| Factuur | `systeem:4` (alleen hoofdbeheerder) |
| Contract | `crm:3` |

De APO **controleert nooit zelf** of de gebruiker de bevoegdheid heeft — hij legt `vereiste_rol` vast in de taak en delegeert de check aan `requireBevoegdheid` op het beslissings-endpoint.

### 5.4 Documenten-inbox

De APO is de **primaire aanjager** van de inbox-statusmachine:

```
Upload → POST /inbox/items
  → inbox.ts registreert item (status: 'nieuw')
  → inbox.ts stuurt event naar APO: POST /apo/events { triggerType: 'document', bronId: inboxItemId }
  → APO voert analyse uit (asynchroon)
  → APO update inbox_item.status → 'voorstel_klaar'
  → APO maakt ai_taak aan met voorstel
  → Gebruiker ziet voorstel in /inbox → beslissing
  → APO triggert dispatcher na 'akkoord'
```

De APO vervangt de huidige `classificeerMockAI()` en de directe status-updates.

### 5.5 Kennisobjecten (ai_kennisobjecten)

Vulstrategie voor fase 1 (handmatig, uit bestaande DB):
- `gebouwen` → naam + adres + stad als aliassen
- `klanten` / CRM-contacten → bedrijfsnaam + aliassen
- `medewerkers` → naam + e-mail
- `leveranciers` → naam

De APO matcht tekstfragmenten uit documenten/e-mails tegen deze tabel via fuzzy string matching (geen AI, geen embedding — bewust eenvoudig gehouden voor fase 1).

In fase 2: AI-bevestigde correcties worden teruggeschreven naar aliassen (zelflerend, maar menselijk gecontroleerd).

---

## 6. Veiligheidsgrenzen

### 6.1 Wat AI mag (autonome acties — geen menselijke goedkeuring nodig)

| Actie | Conditie |
|-------|---------|
| Classificeren van document/input | Altijd |
| Koppelingssuggesties doen | Altijd |
| Taken klaarzetten met `status: 'wacht_op_gebruiker'` | Altijd |
| Concepttekst genereren (bijv. offerte-omschrijving) | Altijd, als `concept: true` gemarkeerd |
| Ontbrekende informatie signaleren | Altijd |
| Waarschuwingen genereren (duplicaat, deadline, blokkade) | Altijd |
| Inbox-item naar `voorstel_klaar` zetten | Via WorkflowEngine, geen menselijke actie |
| Herinnering versturen | Na `herinnering_op` verstreken |

### 6.2 Wat AI nooit mag (harde grenzen — altijd menselijke bevestiging)

| Verboden actie | Reden |
|---------------|-------|
| Offerte definitief versturen | Financieel + juridisch |
| Factuur goedkeuren of betaling initiëren | Financieel |
| Contract wijzigen of tekenen | Juridisch |
| Dossier definitief verklaren | Juridisch (bevriezing) |
| HR-besluit nemen (aanstellen, ontslaan, beoordelen) | AVG + arbeidsrecht |
| Veiligheidskritische spotclassificatie definitief maken | Brandveiligheid (NEN-normen) |
| Workflowstatus wijzigen zonder `beslissing_door` ingevuld | Geen spoor wie heeft beslist |
| Gebruikersdata verwijderen | AVG |
| Bevoegdheden wijzigen | Beveiligingskritisch |

Deze grenzen worden **dubbel** afgedwongen:
1. APO-service weigert de actie op code-niveau (geen dispatcher-aanroep zonder `beslissing_door`);
2. WorkflowEngine vereist `TransitieContext` met een echte `gebruikerId` voor gereserveerde overgangen.

### 6.3 AI-output is altijd voorstel, nooit feit

Alle AI-output in het systeem wordt gemarkeerd conform de bestaande **AI-state-kleurconventie** (zie memory: ai-state-kleuren.md):
- AI-voorstel / aangevuld = **geel** (amber-100/700, Sparkles-icoon)
- Geaccepteerd / bevestigd = **neutraal** (secondary + muted-foreground)
- Acties vallen buiten de kleurconventie

---

## 7. Risico's

| # | Risico | Ernst | Kans | Mitigatie |
|---|--------|-------|------|-----------|
| 1 | APO blokkeert bij OpenAI-quota-overschrijding | Hoog | Midden | Fallback op mock-classificatie; `fout`-status in ai_taak |
| 2 | AI-kosten onbeheersbaar bij groot uploadvolume | Hoog | Laag | Token-limiet per taak; dagelijks budget-cap in config; ai_kosten_eurocent bijhouden |
| 3 | AI-hallucination: foute koppeling automatisch verwerkt | Kritiek | Laag | Harde grens §6.2; dispatching altijd na menselijke beslissing |
| 4 | Privacy-lek: AI-prompt bevat gevoelige persoonsdata | Hoog | Midden | Prompt-sanitizer vóór OpenAI-aanroep; geen BSN/loon/medisch in prompt |
| 5 | ai_taken groeit onbeperkt (geen archivering) | Gemiddeld | Hoog | Auto-archiveer `verwerkt`/`verlopen` na 180 dagen |
| 6 | Gebruiker vertrouwt AI blindelings (automation bias) | Hoog | Midden | UI toont altijd betrouwbaarheid + redenering; `laag`-betrouwbaarheid = rode waarschuwing |
| 7 | APO-systeem-transitie omzeilt bevoegdheidscontrole | Kritiek | Laag | Systeem-transitie altijd zonder `beslissingDoor` gelogged; audit-check aanbevolen |
| 8 | Stale kennisobjecten leiden tot verkeerde matches | Laag | Hoog | `bijgewerkt_op` > 30 dagen → match als 'laag' betrouwbaarheid markeren |
| 9 | race-condition: twee APO-instanties verwerken zelfde event | Gemiddeld | Laag | `SELECT FOR UPDATE` op ai_taken bij event-ontvangst; idempotentie-check op bronId |

---

## 8. Teststrategie

### 8.1 Unit tests (geen DB, geen OpenAI)

| Te testen | Methode |
|-----------|---------|
| `bepaalContext()` met mock-entiteiten | Pure functie, geen I/O |
| `bouwVoorstel()` met mock AI-output | Pure functie |
| Veiligheidsgrens: verboden acties worden geweigerd | Parametric test per verboden actie |
| Kennisobject fuzzy-matching | Pure functie |
| ai_voorstel JSONB-schema validatie (Zod) | Schema-test |

### 8.2 Integratietests (testdatabase, geen OpenAI)

| Scenario | Setup |
|----------|-------|
| Upload → APO → ai_taak aangemaakt | Mock AI-service, echte DB |
| Beslissing 'akkoord' → WorkflowEngine-transitie | Mock transitie-check |
| Beslissing 'afgewezen' → geen transitie | Verificatie: status ongewijzigd |
| Deadline verstreken → herinnering gemarkeerd | Tijdsmanipulatie |
| Harde grens: dispatcher geweigerd zonder beslissing_door | Verwacht 403 |

### 8.3 E2E (Playwright, echte OpenAI optioneel)

| Scenario | OpenAI? |
|----------|---------|
| Upload PDF → AI-voorstel zichtbaar in inbox | Mock |
| Gebruiker past koppeling aan → 'aangepast' beslissing | Mock |
| Gebruiker geeft akkoord → workflowstatus verandert | Mock |
| Audit trail toont APO-acties | Mock |
| Verboden actie-knop ontbreekt voor lage bevoegdheid | Mock |

### 8.4 Kosten-/tokentest

Elke AI-aanroep via APO wordt gelogd in `ai_logboek.tokens_gebruikt`. Een wekelijkse test verifieert dat de gemiddelde token-kostprijs per event-type binnen budget blijft. Drempelwaarden worden vastgelegd in een configuratiebestand.

---

## 9. Gefaseerde implementatie

> **Alle fases vereisen nieuw expliciet akkoord vóór bouw.**

### Fase 0 — Fundament (voorwaarde voor alle andere fases)

**Afhankelijkheden:** WorkflowEngine (systeem-transitie uitbreiding), Audit Trail (module: "apo"), RBAC (vereiste_rol per taak-type)

Deliverables:
- `ai_taken`-tabel + `ai_logboek`-tabel (DB-migratie, additief)
- `ai_kennisobjecten`-tabel met vulscript vanuit bestaande DB
- `AiOrchestrator`-class skelet (ontvangEvent, bepaalContext, slaOp)
- `POST /apo/events` + `GET /apo/taken` + `POST /apo/taken/:id/beslissen`
- Logging naar `audit_log` met module "apo"

**Blokkade:** WorkflowEngine systeem-transitie (vereist aparte aanpassing van `TransitieContext`).

### Fase 1 — Inbox-integratie

**Afhankelijkheden:** Fase 0 + Documenten-inbox Fase B (statusmachine via WorkflowEngine)

Deliverables:
- APO koppelen aan `POST /inbox/items` (event-trigger na upload)
- `classificeerMockAI()` vervangen door APO → `document-ai.ts`-aanroep
- Inbox-UI: AI-voorstel tonen als gele kaart, beslissingsknop
- Kennisobject-matching voor klant/gebouw/project uit inbox-tekst

### Fase 2 — Offerte- en werkbon-flow

**Afhankelijkheden:** Fase 1 + `contract-ai.ts` (nieuw), `factuur-ai.ts` (nieuw)

Deliverables:
- APO voor offerte-aanvraag e-mail (vervangt huidige ad-hoc flow in inbox.ts)
- APO voor werkbon-ontvangst (factuur/inkoopbon herkenning)
- AI-taak-paneel in offerte-detailpagina

### Fase 3 — Deadline-bewaking en herinneringen

**Afhankelijkheden:** Fase 2 + mail-service (al aanwezig)

Deliverables:
- `bewakDeadlines()`-scheduler (recursieve setTimeout, analoog aan backup-service)
- E-mailherinnering bij open AI-taken met vervaldatum
- Dashboard "openstaande AI-taken" (Beheer › AI-procesregisseur)

### Fase 4 — Zelflerende kennisobjecten

**Afhankelijkheden:** Fase 3 + goedgekeurde beslissingen als trainingsdata

Deliverables:
- Na 'akkoord'-beslissing: aliassen terugschrijven naar `ai_kennisobjecten`
- Betrouwbaarheid verbetert automatisch over tijd (op basis van acceptatiegraad)
- AI-logboek toont "nauwkeurigheid over tijd" per service

---

## 10. Openstaande beslissingen (vóór implementatie te beantwoorden)

| # | Vraag | Opties | Impact |
|---|-------|--------|--------|
| 1 | Is `ai_logboek` apart van `audit_log`, of worden ze samengevoegd? | Apart (technisch detail vs. business-event) vs. één tabel | Schema-ontwerp |
| 2 | Wie mag AI-taken zien? Alleen de rol die mag beslissen, of iedereen met leesbevoegdheid? | Beperkt vs. breed | UX + RBAC |
| 3 | Krijgt APO een eigen bevoegdheids-module in de RBAC-matrix? | `apo:1/2/4` vs. delegeren aan entiteit-bevoegdheid | RBAC-ontwerp |
| 4 | Hoe wordt budget-cap geconfigureerd? | Hard-coded vs. DB-config vs. env-var | Operationeel |
| 5 | Worden AI-taken per entiteit getoond (zijpaneel) of centraal (losse pagina)? | Beide vs. één | Frontend-ontwerp |
| 6 | Wat gebeurt er met open AI-taken na verwijdering van de entiteit? | CASCADE vs. wees-taken behouden | Data-integriteit |
| 7 | Worden AI-takenprompts bewaard voor audit (GDPR-risico)? | Hash + samenvatting (huidig voorstel) vs. volledige prompt | AVG |
| 8 | Mag de APO zelfstandig een herinnerings-e-mail sturen? | Ja (systeem-actie) vs. nee (gebruiker triggert handmatig) | Gebruikerservaring |

---

## 11. Niet te doen (scope-bewaking)

Conform de opdracht en de bestaande Ontwikkelstop-beperkingen:

- **Geen autonome workflowovergangen** zonder `beslissing_door` ingevuld
- **Geen AI-personeelsadvies** — de opleiding-AI stelt voor, een mens bevestigt
- **Geen automatische offerte-/factuurbetaling**
- **Geen externe AI-agents** (geen LangChain, AutoGPT, multi-agent-frameworks) — de APO is een coördinatie-laag, geen autonoom agent-systeem
- **Geen embeddings/vector-database** in fase 1 — fuzzy string matching is voldoende voor kennisobjecten
- **Geen AI-logboek als vervanging van de centrale audit trail** — het is aanvullend, niet vervangend
- **CRM-module niet uitbreiden** — APO integreert niet met de bestaande CRM-scaffold totdat V1.5 is beoordeeld
