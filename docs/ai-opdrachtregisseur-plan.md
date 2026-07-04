# Implementatieplan — AI Opdrachtregisseur & Adaptieve Uitvoeringsassistent
*Versie 1.0 — concept ter goedkeuring*

---

## 1. Probleemstelling

Op dit moment dreigen FPS One (adviescentrum) en FPS Connect (operationeel) twee aparte werelden te worden: aanvraag en AI-analyse verdwijnen bij de overgang, werkvoorbereiding begint opnieuw, uitvoering heeft onvoldoende context, oplevering sluit niet aan op het oorspronkelijke advies.

Dit plan brengt beide systemen samen via één gedeeld datamodel: het **Project Intelligence Model (PIM)**. FPS One is de voorkant, FPS Connect is de operationele bron van waarheid. Er is één opdracht, één dossier, één AI-context.

---

## 2. Kernarchitectuur

### 2.1 Project Intelligence Model (PIM)

Het PIM is een persistent record, 1:1 gekoppeld aan een opdracht (`pim_modellen.opdracht_id UNIQUE`). Het groeit door alle fasen heen — geen fase begint ooit opnieuw met een lege context.

**Sectionering (alle JSONB-velden):**

| Sectie | Gevuld in fase | Inhoud |
|---|---|---|
| `aanvraag_context` | Aanvraag (FPS One) | Organisatie, klant, gebouw, uploadbeschrijving, vrije tekst |
| `advies_context` | Advies AI-analyse | Werkzaamheden, risico's, aannames, ontbrekende info, vragen, norm-indicaties, VOP-aandachtspunten |
| `werkvoorbereiding_context` | Werkvoorbereiding | Werkpakketten, materialen, gereedschappen, competenties, veiligheidseisen, foto-eisen, meerwerkrisico's, controlepunten |
| `inkoop_context` | Inkoop | Koppeling naar inkoopplan_id (bestaande tabel), gekozen artikelen per stap |
| `uitvoering_log` | Uitvoering | Verwijzingen naar `pim_uitvoering_stappen.id[]`, samenvattende status |
| `oplevering_context` | Oplevering | Volledigheidscheck output, certificering, onderhoudsnota |

### 2.2 PIM-statusmachine

Één nieuw veld `ai_fase` op de bestaande `opdrachten` tabel (additief, nullable). Overgangen alleen via expliciete API-actie + menselijke bevestiging.

```
null
  → nieuw              (opdracht aangemaakt via FPS One aanvraag)
  → in_analyse         (AI bezig met aanvraaganalyse)
  → advies_gereed      (mens heeft analyse goedgekeurd)
  → offerte_nodig      (optioneel tussenstap)
  → werkvoorbereiding  (werkvoorbereider gestart)
  → inkoop             (inkoopplan vastgesteld)
  → uitvoering         (monteur gestart)
  → oplevering         (volledigheidscheck gestart)
  → afgerond           (opleverdossier definitief)
```

De bestaande `status` (actief/afgerond/gepauzeerd/geannuleerd) blijft ongewijzigd en staat los van `ai_fase`.

### 2.3 Relatie FPS One ↔ FPS Connect

FPS One **heeft geen eigen projectdatabase**. Zodra een klant of beheerder een aanvraag start in FPS One, wordt er in één transactie aangemaakt in Connect:

1. Een conceptopdracht (`opdrachten` record, status `actief`, `ai_fase = nieuw`)
2. Een PIM-record (`pim_modellen` record)
3. Documentkoppelingen via de bestaande `document_koppelingen` tabel

FPS One toont daarna dezelfde opdracht via de bestaande API, maar gefilterd op klantperspectief (geen marge, geen inkoopprijzen, geen interne notities).

### 2.4 AI-gateway

De bestaande `aiGateway.ts` wordt hergebruikt ongewijzigd. Model-slots:
- Analyse documenten: `vision` + `reasoning` (gpt-5)
- Werkvoorbereiding genereren: `reasoning` (gpt-5)
- Inkoop motivaties: `default` (gpt-4o)
- Uitvoering stap genereren: `vision` (gpt-5, inclusief foto-analyse)
- Oplevering check: `default` (gpt-4o)

Alle aanroepen worden gelogd in de bestaande `ai_aanroepen` tabel, aangevuld met `entiteitstype = 'pim'` en `entiteit_id = pim_id`.

### 2.5 Documentopslag

De bestaande DMS-infrastructuur (`documenten`, `document_koppelingen`, `document_logboek`, object storage) wordt hergebruikt zonder wijziging. Alle PIM-artefacten (aanvraagdocumenten, adviesrapport PDF, fotorapport oplevering) worden als normale documenten opgeslagen en via `document_koppelingen` aan de opdracht gekoppeld.

### 2.6 Rechtenmodel

| Actie | Bevoegdheid |
|---|---|
| Aanvraag indienen (FPS One) | Beheerder intern namens klant — geen klantlogin vereist |
| PIM lezen (Connect) | Iedereen met opdracht-leestoegang (`offertes` niveau 1) |
| Fase-overgang bevestigen | Projectleider / beheerder (`offertes` niveau 2) |
| Advies goedkeuren of afwijzen | Beheerder (`offertes` niveau 2) |
| Werkvoorbereiding AI genereren | Beheerder (`offertes` niveau 2) |
| Uitvoeringsstap voltooien | Monteur met opdrachttoewijzing (toewijzingscheck à la mijn-werk, niet `offertes`-bevoegdheid) |
| Afwijking goedkeuren | Projectleider / beheerder (`offertes` niveau 2) |
| Oplevering definitief | Beheerder (`rapporten` niveau 2) |
| Klant ziet interne velden | Nooit — expliciete klantperspectief-filter in endpoint (geen generieke org-scoping) |

> **Architectuurcorrectie:** het plan had organisatiescheiding via `organisatie_id`/`req.session.organisatieId` beschreven, maar dat patroon bestaat niet in deze codebase. Autorisatie verloopt via bestaande bevoegdheden-matrix + toewijzingscheck. Klantperspectief-filter is een expliciete projectie in de GET /pim endpoint (wegfilteren van interne secties voor de klantrol), niet een tenant-scope.

### 2.7 Audittrail

- Fase-overgangen: gelogd in bestaande `document_logboek` tabel (actie = `pim_fase_overgang`)
- Alle AI-aanroepen: bestaand `ai_aanroepen` record met `entiteitstype = 'pim'`
- Upload, goedkeuring, afwijzing, wijzigingen: bestaand `document_logboek`
- Geen nieuwe audit-tabel nodig

---

## 3. Nieuwe DB-componenten

### 3.1 Tabel `pim_modellen`

```
id                    serial PK
opdracht_id           integer FK opdrachten.id UNIQUE (1:1)
aanvraag_context      jsonb    — upload info, tekst, klant, gebouw
advies_context        jsonb    — AI analyse output
werkvoorbereiding_context jsonb
inkoop_context        jsonb    — verwijzing inkoopplan_id + stap-artikel koppelingen
uitvoering_log        jsonb    — stap-id's, samenvattende status
oplevering_context    jsonb    — volledigheidscheck, certificering
aanvraag_via_one      boolean  default false
aangemaakt_op         timestamp
bijgewerkt_op         timestamp
```

### 3.2 Tabel `pim_uitvoering_stappen`

```
id                    serial PK
pim_id                integer FK pim_modellen.id
stap_nr               integer
status                text     — open | actief | voltooid | afgeweken | overgeslagen
instructie_json       jsonb    — doel, handeling, artikelen, gereedschappen,
                                 veiligheid, productinstructie, foto_opdracht,
                                 controlevraag
antwoorden_json       jsonb    — monteur responses
foto_urls             text[]   — object-storage paden
ai_analyse_json       jsonb    — AI beoordeling foto's + antwoorden
afwijking_json        jsonb    — afwijkingdetail, voorgestelde oplossingen, beslissing
voltooid_op           timestamp
voltooid_door_id      integer FK gebruikers.id
bepaald_door_ai       boolean  default true
aangemaakt_op         timestamp
bijgewerkt_op         timestamp
```

### 3.3 Additieve kolom op `opdrachten`

```sql
ALTER TABLE opdrachten
  ADD COLUMN ai_fase text;                        -- nullable; aanvraag_via_one in pim_modellen (zie 3.4)
```

### 3.4 Additieve kolom op `document_koppelingen` (CHECK-constraint uitbreiden)

De bestaande CHECK-constraint in `document_koppelingen` staat alleen `('gebouw','klant','offerte','dossier','voorziening')` toe als `doel_type`. PIM-documenten koppelen aan opdrachten vereist uitbreiding:

```sql
ALTER TABLE document_koppelingen
  DROP CONSTRAINT document_koppelingen_doel_type_check;
ALTER TABLE document_koppelingen
  ADD CONSTRAINT document_koppelingen_doel_type_check
  CHECK (doel_type IN ('gebouw','klant','offerte','dossier','voorziening','opdracht'));
```

Dit wordt ook doorgevoerd in het Drizzle-schema.

### 3.5 Concurrency-bescherming op `pim_uitvoering_stappen`

De SyncQueue-retry (MAX_POGINGEN) op mobiel kan een stap-voltooiing dupliceren. Vereiste guards:

```sql
-- Maximaal één actieve/afgeweken stap per PIM tegelijk
CREATE UNIQUE INDEX pim_stap_actief_uniq
  ON pim_uitvoering_stappen (pim_id)
  WHERE status IN ('actief', 'afgeweken');
```

Alle fase-overgangen en stap-voltooiingen verlopen in één DB-transactie met status-guard (409 als stap al voltooid).

> **Verwijderd:** `inkoopplan_regels.uitvoering_stap_ref` — deze koppeling had een temporele inversie: uitvoeringsstappen bestaan pas ná inkoop. In plaats daarvan bevat `pim.inkoop_context` een mapping `werkpakket_sleutel → [artikel_ids]`; de AI-stapgenerator leest inkoop_context per werkpakket uit het PIM zonder FK naar nog-niet-bestaande stappen.

---

## 4. Nieuwe API-endpoints

Alle onder `/api`, achter bestaande `requireAuth` + bevoegdhedencheck.

| Endpoint | Methode | Beschrijving |
|---|---|---|
| `/aanvragen` | POST | FPS One: aanvraag indienen, maakt conceptopdracht + PIM in één transactie |
| `/opdrachten/:id/pim` | GET | PIM ophalen (klantperspectief of intern afhankelijk van rol) |
| `/opdrachten/:id/pim/fase` | PATCH | Fase-overgang, logt in document_logboek |
| `/opdrachten/:id/pim/analyseer` | POST | AI-analyse van aanvraagdocumenten, vult `advies_context` |
| `/opdrachten/:id/pim/advies/bevestig` | POST | Mens keurt analyse goed, zet fase naar `advies_gereed` |
| `/opdrachten/:id/pim/advies/rapport` | POST | Genereer PDF adviesrapport via DDS |
| `/opdrachten/:id/pim/werkvoorbereiding/genereer` | POST | AI genereert werkpakketten + PIM context, vult `werkvoorbereiding_context` |
| `/opdrachten/:id/pim/uitvoering/start` | POST | Start uitvoeringsfase, genereert stap 1 |
| `/opdrachten/:id/pim/uitvoering/huidige-stap` | GET | Actieve stap ophalen |
| `/opdrachten/:id/pim/uitvoering/stap/:stapId/voltooien` | POST | Stap voltooien (antwoorden + foto's), AI bepaalt volgende stap |
| `/opdrachten/:id/pim/uitvoering/stap/:stapId/afwijking` | POST | Afwijking registreren, AI stelt oplossingen voor, wacht op menselijke beslissing |
| `/opdrachten/:id/pim/uitvoering/stap/:stapId/afwijking/beslis` | POST | Mens beslist over afwijking, uitvoering gaat verder of stopt |
| `/opdrachten/:id/pim/oplevering/controleer` | POST | AI-volledigheidscheck |
| `/opdrachten/:id/pim/oplevering/genereer` | POST | Opleverdossier + fotorapport genereren |

**Bestaande endpoints die worden uitgebreid (niet vervangen):**
- `POST /opdrachten/:id/uitvoeringsplanning/genereer` — krijgt optionele PIM-context mee als die beschikbaar is
- `POST /opdrachten/:id/inkoopplanning/genereer` — krijgt optionele PIM-werkvoorbereiding_context mee

---

## 5. Nieuwe UI-componenten

### 5.1 FPS One (firevault `/one/`)
- **Adviescentrum pagina** (`/one/adviescentrum`) — beheerder dient aanvraag in namens klant: klant/gebouw selecteren, documenten uploaden, tekst toevoegen, AI-analyse starten (geen klantlogin vereist)
- **Aanvraag detail** (`/one/aanvragen/:id`) — AI-rapport bekijken, status volgen, aanvullingen indienen

### 5.2 FPS Connect (firevault)
- **Opdracht detail — tab "AI Regisseur"** — PIM-status, fase-overgangen, analyse inzien, goedkeuren/afwijzen
- **Werkvoorbereiding pagina** — bovenaan: PIM-analysekaart (inklapbaar) met risico's, aannames, open vragen uit Adviescentrum
- **Uitvoering scherm** (`/opdrachten/:id/uitvoering`) — stap-voor-stap weergave, foto upload, afwijking registreren

### 5.3 Monteur-app
- **Uitvoering scherm** (`/uitvoering/[opdrachtId]`) — mobiele versie van de adaptieve gids, één stap tegelijk, camera integratie

---

## 6. Fasering — 7 incrementen

Elk increment levert een stabiel, testbaar checkpoint op. Geen increment wijzigt bestaande tabel-schema's destructief of breekt bestaande routes.

---

### **Fase A — PIM Foundation** *(backend only, geen AI)*

**Doel:** Het gedeelde datamodel aanmaken. Geen UI, geen AI.

**Scope:**
- Nieuwe tabellen: `pim_modellen`, `pim_uitvoering_stappen`
- Additieve kolommen: `opdrachten.ai_fase`, `opdrachten.aanvraag_via_one`
- Additieve kolom: `inkoopplan_regels.uitvoering_stap_ref`
- `POST /aanvragen` — maakt conceptopdracht + pim_model in één transactie (geen AI, alleen structuur)
- `GET /opdrachten/:id/pim` — leest PIM
- `PATCH /opdrachten/:id/pim/fase` — zet fase, logt in `document_logboek`
- Schema-healthcheck uitbreiden met `pim_modellen` en `pim_uitvoering_stappen`
- OpenAPI spec + codegen voor alle PIM-types

**Regressie:** Nul. Puur additief.

**Testbaar als:** `POST /aanvragen` → conceptopdracht + PIM aangemaakt → `GET /pim` geeft leeg model → `PATCH /fase` logt overgang.

---

### **Fase B — Adviescentrum AI** *(FPS One + AI)*

**Doel:** Klant of beheerder kan via FPS One een aanvraag met documenten indienen. AI analyseert en vult `advies_context`.

**Scope:**
- `POST /opdrachten/:id/pim/analyseer` — upload documenten + vrije tekst → AI (vision + reasoning) → vult `advies_context` JSONB
- `POST /opdrachten/:id/pim/advies/bevestig` — menselijke goedkeuring, zet `ai_fase = advies_gereed`
- `POST /opdrachten/:id/pim/advies/rapport` — PDF via DDS, opgeslagen als DMS-document gekoppeld aan opdracht
- FPS One pagina `/one/adviescentrum`: upload-formulier, AI-analyse weergave, goedkeuringsknop
- FPS Connect: nieuwe "AI Regisseur" tab in opdracht-detail met adviescontext leesonly voor werkvoorbereider
- AI-prompt voor aanvraaganalyse: output bevat — aangevraagde werkzaamheden, herkende locaties, risico's, aannames, ontbrekende informatie, vragen aan opdrachtgever, competentie-indicaties (VOP), inschattingsnormen, of opname nodig is
- AI logt in `ai_aanroepen` (module = 'pim_advies', entiteitstype = 'pim')

**Regressie:** FPS One `one/` pagina's zijn scaffold; geen bestaande functionaliteit geraakt.

**Testbaar als:** Documenten Beekstraat 9A uploaden → AI-rapport bevat vluchtrouteaanduidingen + noodverlichting + VOP-aandachtspunt + gordijnen-risico → beheerder keurt goed → fase = `advies_gereed`.

---

### **Fase C — Werkvoorbereiding AI met PIM** *(FPS Connect)*

**Doel:** Werkvoorbereider ziet de Adviescentrum-analyse en kan AI een volledigere werkvoorbereiding laten genereren op basis van PIM-context.

**Scope:**
- `POST /opdrachten/:id/pim/werkvoorbereiding/genereer` — nieuw endpoint naast het bestaande uitvoeringsplanning/genereer:
  - Input: volledige PIM `advies_context` + bestaande werkbegroting-regels
  - Output vult `werkvoorbereiding_context`: werkpakketten, uitvoeringsvolgorde, materialen, specifieke artikelen, gereedschappen, competenties, veiligheidseisen, foto-eisen per werkpakket, meerwerkrisico's, controlepunten
  - Alles bewerkbaar door werkvoorbereider vóór vaststelling
- Bestaand `POST /opdrachten/:id/uitvoeringsplanning/genereer` uitbreiden: als PIM aanwezig is, wordt `werkvoorbereiding_context` als context meegegeven (optioneel, no-op als PIM leeg)
- FPS Connect werkvoorbereiding pagina: PIM-analysekaart bovenaan (inklapbaar) met risico's en open vragen

**Regressie:** Bestaande werkvoorbereiding-routes ongewijzigd. PIM-context is opt-in additief.

**Testbaar als:** Werkvoorbereider opent opdracht met `advies_gereed` → ziet PIM-analyse → klikt "Genereer werkvoorbereiding" → output bevat VOP-competentie + 10m-centraaldoos-eis + vluchtrouteposities + foto-eisen.

---

### **Fase D — Inkoop AI met PIM** *(FPS Connect)*

**Doel:** Inkoopplanning-AI gebruikt PIM-werkvoorbereiding_context voor rijkere artikelmotivaties en koppelt artikelen aan uitvoeringsstappen.

**Scope:**
- Bestaand `POST /opdrachten/:id/inkoopplanning/genereer` uitbreiden: als PIM aanwezig, meegeven van `werkvoorbereiding_context` → `aiMotivatie` per regel bevat nu ook norm/risico-context
- Per inkoopplan-regel: UI toevoegen voor `uitvoering_stap_ref` (koppeling aan uitvoeringsstap — wordt gevuld na Fase E)
- `inkoop_context` in PIM bijwerken na vaststelling inkoopplan
- UI uitbreiden: per inkoopplan-regel tonen "toepassing binnen opdracht" en "bijbehorende uitvoeringsstap"

**Regressie:** Bestaande inkoopplanning volledig behouden; PIM-context is opt-in additief.

**Testbaar als:** Inkoopplan genereren voor opdracht met PIM → motivaties refereren aan aanvraaganalyse → knopcilinder en noodverlichtingsarmaturen correct herkend.

---

### **Fase E — Adaptieve Uitvoering** *(web API + Connect UI)*

**Doel:** AI genereert uitvoeringsstappen één voor één op basis van de volledige PIM. Projectleider kan via web de gids volgen en afwijkingen afhandelen.

**Scope:**
- `POST /opdrachten/:id/pim/uitvoering/start` — genereert stap 1, zet `ai_fase = uitvoering`
- `GET /opdrachten/:id/pim/uitvoering/huidige-stap` — actieve stap ophalen
- `POST /opdrachten/:id/pim/uitvoering/stap/:stapId/voltooien` — monteur stuurt antwoorden + foto-urls mee; AI (vision) analyseert, bepaalt volgende stap, schrijft stap terug naar `pim_uitvoering_stappen`; nieuwe stap aangemaakt
- `POST /opdrachten/:id/pim/uitvoering/stap/:stapId/afwijking` — AI benoemt afwijking, stelt oplossingen voor, zet status `afgeweken`, blokkeert verdergaan
- `POST /opdrachten/:id/pim/uitvoering/stap/:stapId/afwijking/beslis` — mens besluit: doorgaan (met aanpassing) of stoppen
- AI mag nooit meer dan één stap vrijgeven; AI mag scope nooit zelfstandig wijzigen
- FPS Connect: nieuw scherm `/opdrachten/:id/uitvoering` — stap-voor-stap weergave, foto upload, afwijking registreren

**Regressie:** Nieuw scherm, nieuwe endpoints; niets bestaand geraakt.

**Testbaar als:** Start uitvoering → stap 1 verschijnt → foto uploaden → AI analyseert → stap 2 verschijnt met context van stap 1 → afwijking registreren → AI blokkeert → projectleider beslist → doorgaan.

---

### **Fase F — Adaptieve Uitvoering mobiel** *(monteur-app)*

**Doel:** Monteur voert de adaptieve gids uit op de mobiele app. Zelfde API als Fase E.

**Scope:**
- Nieuw scherm `uitvoering/[opdrachtId].tsx` in monteur-app
- Offline-first: actieve stap + instructie gecached in AsyncStorage zodra stap wordt geladen; antwoorden en foto's gebufferd in SyncQueue en gesynchroniseerd zodra verbinding hersteld; AI-stap genereren vereist wel een live serververbinding (AI kan niet lokaal draaien), maar reeds geladen stap kan offline worden ingevuld en foto's kunnen offline worden gemaakt
- Camera-integratie: Expo ImagePicker (al aanwezig in andere schermen), foto upload via bestaand object-storage endpoint
- Bestaande `mijn-werk.tsx` ongewijzigd: "Start adaptieve gids" als navigatieknop op taakdetail
- Stap-weergave: doel, handeling, artikelen, gereedschappen, veiligheidscontrole, foto-opdracht, confirmatie-knop
- Afwijking-flow: AI-melding zichtbaar, monteur kan doorgaan pas nadat projectleider heeft goedgekeurd

**Regressie:** Bestaande mijn-werk, werkdag, planning ongewijzigd. Nieuw scherm.

**Testbaar als:** Monteur opent opdracht → tikt "Start gids" → stap verschijnt → foto maken → AI-reactie zichtbaar → volgende stap.

---

### **Fase G — Oplevering AI** *(FPS Connect)*

**Doel:** Na uitvoering controleert AI volledigheid en genereert het opleverdossier automatisch op basis van PIM.

**Scope:**
- `POST /opdrachten/:id/pim/oplevering/controleer` — AI-check: alle stappen voltooid? alle foto's aanwezig? alle afwijkingen besloten? ontbrekende punten als lijst
- `POST /opdrachten/:id/pim/oplevering/genereer` — AI genereert: opleverrapport (via DDS + bestaande `print.tsx` structuur als basis), fotorapport (overzicht per stap), overdrachtsnotitie onderhoud; opgeslagen als DMS-documenten
- `ai_fase = oplevering → afgerond` na menselijke bevestiging
- Bestaand `print.tsx` opleverrapport: optioneel PIM-samenvattingsblok toegevoegd (additief)
- Koppeling naar bestaande onderhoud-module: `ai_fase = afgerond` triggert bestaande onderhoud-workflow

**Regressie:** Bestaand print.tsx ongewijzigd; PIM-blok is optioneel. Onderhoud-module niet gewijzigd.

**Testbaar als:** Alle stappen voltooid → controleer → AI signaleert ontbrekende foto → foto toegevoegd → opnieuw controleer → groen → opleverdossier aangemaakt in DMS.

---

## 7. Bouwvolgorde en parallellisme

```
A (PIM Foundation)
  └─► B (Adviescentrum AI)     — start zodra A gemerged
  └─► C (Werkvoorbereiding)    — start zodra A gemerged, parallel met B
        └─► D (Inkoop)         — start zodra C gemerged
              └─► E (Uitvoering web + API)  — start zodra D gemerged
                    ├─► F (Uitvoering mobiel)  — start zodra E-API stabiel is
                    └─► G (Oplevering)          — start zodra E gemerged
```

B en C kunnen parallel zodra A is gemerged. F en G kunnen parallel zodra E stabiel is.

---

## 8. Wat bewust NIET gebouwd wordt

| Onderdeel | Reden |
|---|---|
| Voorraadmodule, busvoorraad | Geparkeerd per spec |
| Automatische leverancierskoppeling / automatische bestellingen | Geparkeerd per spec |
| Volledige onderhoudscyclus (V3.0) | Geparkeerd per roadmap |
| Geavanceerde normvalidatie (automatisch) | Geparkeerd per spec |
| Automatische prijswijzigingen | Geparkeerd per spec |
| Externe klantgoedkeuring op alle workflowstappen | Geparkeerd per spec |
| Nieuwe Stripe- of abonnementswijzigingen | Uitdrukkelijk niet doen per spec |
| Dubbele loginstructuur | Bestaande auth hergebruiken |
| Parallelle klantadministratie | Connect is bron van waarheid |
| AI-besluiten zonder menselijke goedkeuring op operationele/financiële acties | Ontwerpprincipe |

---

## 9. Regressierisico's — expliciete lijst

| Regressiegebied | Risico | Maatregel |
|---|---|---|
| Login + sessie | Nieuwe `/aanvragen` route publiek of onjuist auth | Route staat achter `requireAuth`; test: unauthenticated → 401 |
| Organisatiescheiding | PIM-queries zonder org-filter | Alle PIM-routes filteren op `req.session.organisatieId` |
| Abonnementsstatus | Adviescentrum zichtbaar zonder abonnement | Bevoegdhedencheck op Adviescentrum-gebruik |
| Stripe checkout/portal | Geen aanraking | Geen wijzigingen aan betalingsroutes |
| Dashboard statistieken | `opdrachten.ai_fase` nullable → tellers breken niet | Alle bestaande queries negeren het nullable veld |
| Bestaande Connect-projecten | `opdrachten` schema-additief | ALTER TABLE addColumnOnly; bestaande rijen krijgen ai_fase = null |
| Documenten-module | DMS ongewijzigd | PIM gebruikt document_koppelingen als consumer, geen schrijven naar documenten zelf |
| Rechtenstructuur | Klant ziet interne velden | Server-side klantperspectief-filter op alle PIM GET-routes |
| Bestaande werkvoorbereiding routes | PIM-context opt-in | Bestaande routes werken zonder PIM; nieuw endpoint staat ernaast |
| Bestaande inkoopplanning | Idem | PIM-context is optionele parameter |
| monteur-app mijn-werk | Bestaande schermen ongewijzigd | Nieuw scherm via navigatie, geen wijzigingen in bestaande componenten |

---

## 10. Minimale Fase 1 oplevering (per spec)

De spec eist dat Fase 1 minstens oplevert:

| # | Eis | Gedekt door |
|---|---|---|
| 1 | Aanvraag met documenten uploaden via FPS One | Fase B |
| 2 | Conceptopdracht automatisch aangemaakt in Connect | Fase A |
| 3 | Documenten in beide omgevingen gekoppeld aan zelfde opdracht | Fase A + B |
| 4 | AI-analyse opgeslagen in gedeeld opdrachtmodel | Fase B |
| 5 | Connect Werkvoorbereiding kan analyse openen | Fase B + C |
| 6 | AI maakt werkpakketten, materialen, gereedschappen, controlepunten | Fase C |
| 7 | AI maakt eerste inkoopvoorstel | Fase D |
| 8 | AI genereert eerste adaptieve uitvoeringsstap | Fase E |
| 9 | Monteur ziet één stap tegelijk | Fase E (web) + F (mobiel) |
| 10 | Monteur kan foto toevoegen per stap | Fase E + F |
| 11 | Foto onderdeel van opdrachtcontext | Fase E (in PIM uitvoeringLog) |
| 12 | Oplevering gebruikt stappen en foto's | Fase G |

---

## 11. Testcase — Beekstraat/Bleekstraat 9A Goor (Oude Wolbers)

De AI-analyse van de aanvraagdocumenten (foto-overzicht/opname, begroting, offerte) moet bij Fase B zonder menselijke sturing herkennen:

- Vluchtrouteaanduidingen (locaties/posities)
- Noodverlichtingsarmaturen
- Knopcilinder
- Meerdere locaties/posities
- 230V-aansluitpunten
- VOP-competentie als aandachtspunt
- Vrije werkplek
- Maximaal 10 meter tot centraaldoos als uitgangspunt
- Gordijnen bij achterdeur als risico
- Opleverrapport/certificaat als opleverpunt

De AI mag niet adviseren dat FPS dit niet kan uitvoeren. Standaarduitgangspunt: FPS-uitvoering binnen eigen competenties, met VOP-aandachtspunten en menselijke controle.

---

## 12. Eindrapportage (bij oplevering)

Na implementatie lever ik een technische rapportage op met:
- Toegevoegde/aangepaste tabellen
- Hoe FPS One en Connect dezelfde opdracht delen
- Waar AI-context wordt opgeslagen
- Hoe documenten worden gekoppeld
- Hoe rechten zijn geborgd
- Geïmplementeerde statusovergangen
- Bewust niet gebouwde onderdelen
- Testresultaten per acceptatiecriterium

---

*Status: concept ter goedkeuring — geen code aangemaakt.*
