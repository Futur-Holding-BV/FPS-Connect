# Documentarchitectuur FPS Connect

**Status:** ontwerp, geen code gewijzigd  
**Datum:** 2026-07-02  
**Scope:** Referentiedocumenten, operationele documenten en procesdocumenten — opslag, versiebeheer, eigenaarschap, rechten, AI-index, zoekfunctionaliteit en archivering per categorie. Aanvulling met een AI-zoekplatform als tweede manier van werken, volledig synchroon met de bestaande mappenstructuur.

---

## Uitgangspunten

### Bestaande infrastructuur (niet wijzigen)

De bestaande documentinfrastructuur van Connect bestaat uit vier lagen die intact blijven:

**1. Centrale bibliotheek** (`documenten`-tabel)  
Referentiedocumenten met versiebeheer op basis van `groep_id` + `revisie_nummer`. Typen: `eta`, `classificatierapport`, `testrapport`, `productcertificaat`, `dop`, `verwerkingsvoorschrift`, `productblad`, `opleverrapport`. Statussen: `actueel`, `controle_nodig`, `vervangen`, `mogelijk_verouderd`, `ingetrokken`. Goedkeuringsflow: `concept` → `ter_goedkeuring` → `goedgekeurd` / `afgekeurd`. Duplicaatdetectie op SHA-256-hash.

**2. Object Storage** (S3 of GCS, backend-agnostisch)  
Padconventie: `/objects/{entityId}/{bestandType}/{uuid}`. Bestandstypen: `foto`, `rapport`, `tekening`, `bijlage`, `algemeen`, `factuur`. Downloads via `/api/storage`; upload-URL's via `getObjectEntityUploadURL()`.

**3. Polymorfe koppelingen** (`document_koppelingen`-tabel)  
Eén document kan aan meerdere entiteiten worden gekoppeld: `gebouw`, `klant`, `offerte`, `dossier`, `voorziening`. Referentiële integriteit bewust niet hard afgedwongen (orphan-tolerant).

**4. Dossiermodule**  
Dossiers koppelen verwijzingen naar bibliotheekdocumenten. Status: `concept` → `in_behandeling` → `definitief`. Bij `definitief`: bevriezing per dossier-item (`bevrorenRevisieNummer`, `bevrorenPdfUrl`) — daarna immutable.

### Bestaande AI-capaciteiten

- `document-ai.ts`: PDF-tekst → extractie van naam, fabrikant, product, documenttype, EN-norm, rapportnummer, revisie, datum, getest_voor, betrouwbaarheid
- `ai_geanalyseerd` (boolean) + `ai_metadata` (JSONB) op de documenten-tabel
- AI-bibliotheekvalidatie: spots worden vergeleken met de bibliotheek
- AI-spot-herkenning: foto → type + fabrikant-voorstel

### Ontwerpprincipe

De bestaande mappenstructuur (filter op type, status, fabrikant, koppeling) wordt niet aangepast. AI-zoeken wordt een tweede ingang naast het bestaande bladeren — beide tonen altijd dezelfde data.

---

## Definitie van de drie categorieën

| Categorie | Aard | Eigenaar | Primaire binding |
|---|---|---|---|
| **Referentiedocumenten** | Gedeelde kennisbronnen over producten en methoden; onafhankelijk van projecten | Bibliotheek-beheerder, fabrikant als bron | Toepassing (label/product) |
| **Operationele documenten** | Vastlegging van uitgevoerde handelingen en situaties in het veld | Uitvoerende partij (monteur, beheerder) | Gebouw, spot, werkbon, medewerker |
| **Procesdocumenten** | Output van bedrijfsprocessen; hebben een eigen workflow-lifecycle | Procesverantwoordelijke (commercieel, HR, projectleider) | Offerte, dossier, medewerker, rapport |

---

## Categorie 1 — Referentiedocumenten

**Voorbeelden:** ETA's, classificatierapporten, testrapporten, productcertificaten, Declarations of Performance (DoP), verwerkingsvoorschriften, productbladen

### Opslag

Opgeslagen in de centrale bibliotheek (`documenten`-tabel) met PDF in Object Storage onder `/objects/{documentId}/rapport/{uuid}`. Het pad wordt in `pdf_url` bewaard. Bestandsgrootte en SHA-256-hash worden client-side berekend en opgeslagen voor duplicaatdetectie.

Referentiedocumenten worden nooit overschreven: een nieuwe versie is altijd een nieuwe rij. De oude rij blijft bestaan met status `vervangen`.

### Versiebeheer

Elke document-groep heeft een `groep_id` (UUID) die alle versies samenbindt. Het `revisie_nummer` loopt monotoon op (1, 2, 3…). De afdwinging van single-actueel — nooit meer dan één `actueel` per `groep_id` — vindt plaats op server-side bij het aanmaken van een revisie (de vorige `actueel`-rij krijgt status `vervangen`).

Statusverloop per revisie:

```
actueel
  ├── bij nieuwe revisie        → vervangen
  ├── bij externe herroeping    → ingetrokken
  ├── bij signaleringscheck     → controle_nodig (automatisch, reversibel)
  └── bij twijfel na AI-analyse → mogelijk_verouderd (handmatig bevestigbaar)
```

Versies worden nooit verwijderd. Ze zijn leesbaar voor iedereen met bibliotheek-leesrechten.

### Eigenaarschap

Eigenaarschap ligt bij de **bibliotheek-beheerder** van de werkgever die het document heeft opgenomen. De fabrikant (naam, FK via `fabrikant_id` op labels-tabel) is de inhoudelijke bron, niet de systeem-eigenaar.

Bij betrouwbaarheid `laag` uit de AI-analyse is bevestiging door een beheerder vereist voordat het document `goedgekeurd` kan worden.

### Rechten

Bevoegdheid `bibliotheek` met vier niveaus:

| Niveau | Kan |
|---|---|
| 1 — Lezen | Document bekijken, downloaden, zoeken |
| 2 — Bewerken | Metadata aanpassen, toepassingen koppelen |
| 3 — Indienen | Nieuw document uploaden, revisie aanmaken, goedkeuring aanvragen |
| 4 — Goedkeuren | Goedkeuringsflow afronden (goedgekeurd / afgekeurd) |

Gearchiveerde documenten zijn leesbaar op niveau 1, maar niet meer bewerkbaar (niveau 2–4 geeft 409).

### AI-index

Bestaande velden die de AI-index voeden:

- `ai_metadata` JSONB — bevat de extractie-uitvoer van `document-ai.ts` (naam, fabrikant, product, EN-norm, rapportnummer, revisie, datum, getest_voor, betrouwbaarheid, toelichting)
- `ai_geanalyseerd` boolean — geeft aan of de indexering al heeft plaatsgevonden

Uitbreiding voor het AI-zoekplatform (zie §5):

- Bij upload en bij elke revisie wordt de PDF opnieuw door de chunk-indexer gestuurd
- Chunks worden opgeslagen in de `document_chunks`-tabel met vector-embeddings
- De `ai_geanalyseerd`-vlag wordt ook gebruikt als trigger voor herindexering: `false` → indexer loopt opnieuw

### Zoekfunctionaliteit

**Bestaand (blijft ongewijzigd):**
Filterbalk in de Bibliotheek-tab: documenttype, status, fabrikant (vrije tekst), geldigheid (verlopen / binnenkort / ok). Resultaten gesorteerd op bijgewerkt-datum (aflopend).

**Nieuw (AI-zoeken):**
Semantische zoekvraag in vrije tekst, naast de bestaande filterbalk. Voorbeelden van geldige vragen:

- "Welke ETA's zijn beschikbaar voor brandwerende doorvoeringen?"
- "Toon producten van Hilti met EI 60-certificering."
- "Is er documentatie voor flexibele doorvoeringen in plafonds?"

Resultaten tonen relevantiescore, excerpt van de relevante passage en de bestaande documentkaart. Filters zijn combineerbaar met de semantische vraag.

### Archivering

Een referentiedocument wordt gearchiveerd door `gearchiveerd = true` te zetten (bevoegdheid 3). Gearchiveerde documenten:

- Blijven zichtbaar in de bibliotheek via een apart filter ("Archief")
- Zijn leesbaar en downloadbaar, niet bewerkbaar
- Worden verwijderd uit de actieve AI-index (chunks worden gemarkeerd als inactief, niet verwijderd)
- Bij koppeling aan een definitief dossier: de bevroren snapshot (`bevrorenPdfUrl`) vertegenwoordigt de toestand op het moment van bevriezing, ongeacht latere archivering

---

## Categorie 2 — Operationele documenten

**Voorbeelden:** spot-foto's (voor/na), gebouwplattegronden, werkbon-bijlagen, LMRA's, veiligheidsmeldingen, toolbox-documenten, veiligheidsincidenten-bijlagen, medewerker-documenten (HRM)

### Opslag

Operationele documenten zijn altijd gebonden aan een specifieke entiteit. Ze staan in Object Storage met een entiteit-specifiek pad, nooit in de centrale bibliotheek:

| Document | Pad | Tabel |
|---|---|---|
| Spot-foto voor/na | `/objects/{gebouwId}/foto/{uuid}` | `voorzieningen` (voor/na foto-velden) |
| Plattegrond PDF | `/objects/{gebouwId}/tekening/{uuid}` | `verdiepingen.plattegrond_url` |
| LMRA-bijlage | `/objects/{entityId}/bijlage/{uuid}` | `veiligheid_lmras` |
| Toolbox-PDF | `/objects/{entityId}/rapport/{uuid}` | `veiligheid_toolboxen` |
| Incident-bijlage | `/objects/{entityId}/bijlage/{uuid}` | `veiligheid_incidenten` |
| Medewerker-document | `/objects/medewerker/{medewerkerId}/{type}/{uuid}` | `medewerker_documenten` |
| Werkbon-bijlage | `/objects/{entityId}/bijlage/{uuid}` | `planning_items` of `werkbonnen` |

HRM-documenten (arbeidscontract, VCA-certificaat, loonstrook, etc.) staan in de `medewerker_documenten`-tabel, niet in de centrale bibliotheek. Ze delen de Object Storage-infrastructuur maar geen enkele andere tabel.

### Versiebeheer

Operationele documenten hebben geen versiereeksen zoals de bibliotheek. De regels per type:

- **Spot-foto's:** elke upload is een momentopname. Meerdere voor-foto's en na-foto's zijn toegestaan. Verwijdering is mogelijk voor de monteur die de foto maakte.
- **Plattegrond:** het PDF-plattegrond-veld per verdieping is overschrijfbaar (een her-upload vervangt de vorige). Geen historische versies bewaard — de SVG-annotaties (spots, scheidingen, logo) zijn de persistente laag.
- **LMRA / Toolbox / Incident:** na afronden immutable. Bijlagen zijn onderdeel van het afgesloten record.
- **Medewerker-document:** het type dient als discriminator. Er kunnen meerdere documenten van hetzelfde type bestaan (bijv. opeenvolgende arbeidscontracten). Geen automatische vervanging; de beheerder beheert de volledigheid zelf.

### Eigenaarschap

| Document | Systeem-eigenaar | Inhoudelijk verantwoordelijke |
|---|---|---|
| Spot-foto | Maker-monteur (`maker_monteur_id`) | Uitvoerende monteur |
| Plattegrond | Gebouwbeheerder | Tekenaar / projectleider |
| LMRA | Uitvoerende (`veiligheid_lmras`) | Uitvoerende medewerker |
| Toolbox | Initiator (`aangemaaktDoorId`) | Veiligheidscoördinator |
| Medewerker-document | HR-beheerder | HR-medewerker |

### Rechten

- **Spot-foto's:** uploaden = monteur-bevoegdheid; bekijken = iedereen met toegang tot het gebouw; verwijderen = eigen foto of beheerder.
- **Plattegrond:** bekijken = spots-leesbevoegdheid; uploaden/vervangen = alleen beheerder.
- **LMRA:** invullen = eigen LMRA (requireAuth); bekijken afgesloten = toolbox-leesrecht (niveau 1); bewerken = toolbox-schrijfrecht (niveau 3) of eigen openstaande LMRA.
- **Toolbox:** publiceren = schrijfrecht (niveau 3); afronden = medewerker voor eigen afronding.
- **Medewerker-document:** uploaden/bekijken = personeel-schrijfrecht (niveau 2); eigen documenten = medewerker mag eigen dossier inzien via `/mijn/certificaten`.

### AI-index

| Document | AI-toepassing |
|---|---|
| Spot-foto | AI-spot-herkenning: type + fabrikant-voorstel na foto-upload |
| Toolbox-PDF | AI-analyse: vragenset genereren uit PDF-inhoud; batch-generatie meerdere toolboxen |
| LMRA-context | AI-voorstel: standaardantwoorden op basis van activiteit + locatie |
| Incident-omschrijving | AI-voorstel: ernst + categorie + acties |
| Medewerker-document (arbeidscontract) | AI-contract-analyse: kernbedingen + risico-signalering |
| Plattegrond | Geen tekst-extractie (SVG/PDF zonder doorzoekbare tekst) |

Operationele documenten worden niet opgenomen in de gedeelde vector-index voor AI-zoeken. Ze worden bevraagd via gestructureerde API-filters (entiteit-ID, datum, status, monteur). De reden: foto's en plattegronden bevatten geen indexeerbare tekst; LMRA's en toolboxen zijn werkgever-intern en mogen niet via cross-entiteit-zoekopdrachten bevraagd worden.

**Uitzondering:** Toolbox-inhoud en incident-omschrijvingen worden wél geïndexeerd voor compliance-rapportage — maar uitsluitend per werkgever en alleen doorzoekbaar voor gebruikers met toolbox-leesrecht.

### Zoekfunctionaliteit

**Bestaand (blijft ongewijzigd):**
Filterlijsten per entiteit: spot-foto's via spot-detailpagina, LMRA's via veiligheids-dashboard, medewerker-documenten via medewerker-detailpagina.

**Nieuw (AI-zoeken — beperkt domein):**
Toolbox-compliance-zoekvraag: "Welke medewerkers hebben de toolbox 'Werken op hoogte' van mei 2026 nog niet afgerond?" Incident-zoekvraag: "Toon incidenten van het type valgevaar in de afgelopen 6 maanden." HRM-zoekvraag: "Welke medewerkers hebben een verlopen VCA-certificaat?"

### Archivering

- **Spot-foto's:** blijven bewaard zolang de spot bestaat. Bij spot-archivering blijven foto's bewaard maar zijn ze alleen via de archiefweergave zichtbaar.
- **LMRA / Toolbox:** afgeronde records zijn immutable en niet te verwijderen. Ze worden niet gearchiveerd, maar worden na de bewaarperiode (wettelijk bepaald) gemarkeerd als `voor_verwijdering` door een beheerder.
- **Medewerker-documenten:** bij offboarding van een medewerker blijven documenten bewaard conform de AVG-bewaarplicht (7 jaar na uitdiensttreding). De medewerker-entiteit krijgt status `gearchiveerd`; de documenten blijven leesbaar voor HR-beheerder.
- **Plattegrond:** de vorige PDF-versie wordt bij her-upload overschreven. Er is geen terugrolmogelijkheid op plattegrond-niveau; de SVG-annotaties (spots, scheidingen) zijn de persistente laag en blijven bewaard.

---

## Categorie 3 — Procesdocumenten

**Voorbeelden:** offertes + bijlagen, klantcontracten, arbeidscontracten, ZZP-overeenkomsten, dossiers (project/gebouw), opleverrapporten (V1.4), rapporten (V1.5), Studio-templates, facturen, loonstroken

### Opslag

Procesdocumenten worden door een bedrijfsproces voortgebracht en hebben een eigen workflow-lifecycle. Ze staan niet in de centrale bibliotheek.

| Document | Pad / Tabel |
|---|---|
| Offerte-bijlage | `/objects/{offerteId}/bijlage/{uuid}` — `offerte_bijlagen`-tabel |
| Klantcontract | `/objects/{offerteId}/bijlage/{uuid}` — `offerte_klant_contracten`-tabel |
| ZZP-overeenkomst | `/objects/medewerker/{medewerkerId}/bijlage/{uuid}` — `zzp_overeenkomsten`-tabel |
| Arbeidscontract | `/objects/medewerker/{medewerkerId}/bijlage/{uuid}` — `medewerker_documenten`-tabel |
| Loonstrook | `/objects/medewerker/{medewerkerId}/bijlage/{uuid}` — `medewerker_documenten`-tabel |
| Dossier-document | Verwijzing naar bibliotheekdocument of losse upload; bevroren snapshot in `bevroren_pdf_url` |
| Opleverrapport / Rapport | Gegenereerd via `print.tsx` (live) of V1.5-bevriezing (snapshot) |
| Studio-template | Object Storage of DB-blob via `organisatie`-tabel (`document_type`-entiteit per werkgever) |

Procesdocumenten die als PDF worden gegenereerd (offerte via DDS, rapport via print.tsx) worden niet apart opgeslagen tot het moment van bevriezing.

### Versiebeheer

| Document | Versiemodel |
|---|---|
| Offerte | `offerte_versies`-tabel (versie 1, 2, 3…); elke versie is een snapshot van de offerte-staat |
| Dossier | Eénmalige bevriezing bij `definitief`; daarna immutable; geen tussenversies |
| Rapport (V1.5) | Definitieve rapporten per gebouw; versiebeheer via rapportenbibliotheek; bevriezing zoals dossier |
| ZZP-overeenkomst | Geen ingebouwde versieketen; vervangen door nieuwe upload + type als discriminator |
| Medewerker-contract | Opeenvolgende contracten naast elkaar; geen automatische vervanging |
| Studio-template | Versie per documenttype per werkgever; upsert op `(werkgever_id, document_type)` |

### Eigenaarschap

| Document | Eigenaar |
|---|---|
| Offerte | Commercieel team (bevoegdheid `offertes`) |
| Dossier | Projectverantwoordelijke (bevoegdheid `gebouwen` of `offertes`) |
| Rapport | Opdrachtverantwoordelijke (gebouwen-bevoegdheid + rapport-rol) |
| Klantcontract | Klant (via portaal-token, tijdelijk) + commercieel team |
| Medewerker-document | HR-beheerder (bevoegdheid `personeel` 2) |
| ZZP-overeenkomst | HR-beheerder (bevoegdheid `personeel` 2) |
| Studio-template | Systeem-beheerder (bevoegdheid `systeem` 2) |

### Rechten

| Document | Lezen | Schrijven / Indienen | Bevriezing / Definitief |
|---|---|---|---|
| Offerte | `offertes` 1 | `offertes` 2 | `offertes` 2 |
| Dossier | `gebouwen` 1 | `gebouwen` 2 | `gebouwen` 2 (daarna 409 op alle mutaties) |
| Klantcontract | Portaal-token (publiek tijdelijk) + `offertes` 1 | `offertes` 2 | `offertes` 2 |
| Medewerker-document | `personeel` 1 + eigen dossier medewerker | `personeel` 2 | Niet van toepassing |
| ZZP-overeenkomst | `personeel` 1 | `personeel` 2 | Niet van toepassing |
| Rapport | `gebouwen` 1 | Configuratie: `gebouwen` 2 | `gebouwen` 2 (V1.5) |
| Studio-template | `systeem` 1 | `systeem` 2 | Niet van toepassing |

Definitief verklaarde dossiers retourneren 409 op alle schrijfoperaties (POST, PATCH, DELETE) op dossier-documenten — ook als de UI dit niet toont.

### AI-index

| Document | AI-toepassing |
|---|---|
| Offerte-secties | AI-schrijven per sectie (`/offerte-secties/:id/ai-schrijven`); presentatieniveau-voorstel |
| Offerte e-mail | AI-e-mail genereren op basis van offerte-inhoud |
| Klantcontract | AI-advies: kernbedingen + risico-signalering |
| Arbeidscontract | AI-contract-analyse: bedingen + risico's |
| ZZP-overeenkomst | AI-vullen: standaard ZZP-clausules voorstellen |
| Dossier (definitief) | Geen AI-index — bevroren content is juridische toestand, geen voorstel |
| Rapport | Geen AI-index op definitieve rapporten — wel op concept tijdens opbouw |

### Zoekfunctionaliteit

**Bestaand (blijft ongewijzigd):**
Offertes: filter op status, klant, datum, medewerker. Dossiers: filter op gebouw, status. Medewerker-documenten: filter per medewerker-detailpagina.

**Nieuw (AI-zoeken):**
- "Toon alle offertes voor klant X met een sectionhoofdstuk over branddeuren."
- "Welke dossiers zijn dit kwartaal definitief geworden?"
- "Toon medewerkers waarbij het arbeidscontract ontbreekt of verlopen is."

Procesdocumenten worden geïndexeerd op metadata-niveau (klant, datum, status, type), niet op volledige tekst-inhoud — met uitzondering van offerte-secties (tekst is bewust door een gebruiker ingevoerd en volledig indexeerbaar).

### Archivering

| Document | Archiveringsregel |
|---|---|
| Offerte definitief verloren/gewonnen | Status-wijziging; blijft leesbaar in historielijst; niet verwijderbaar |
| Dossier definitief | Status `gearchiveerd` na afrondingsdatum (beheerder zet handmatig); bevroren snapshot permanent |
| Medewerker-document | Bij offboarding: bewaarplicht 7 jaar na uitdiensttreding (AVG art. 5 lid 1 sub e); niet verwijderbaar door beheerder; systeem-verwijdering na bewaarperiode |
| ZZP-overeenkomst | Idem medewerker-document, zelfde bewaarperiode |
| Rapport definitief (V1.5) | Onmiddellijk immutable na bevriezing; gearchiveerd na projectafsluiting |
| Studio-template | Versie-intrekking via status-update; vorige versies bewaard als historisch record |

---

## AI-zoekplatform

### Ontwerp

Het AI-zoekplatform is een **tweede ingang** bovenop de bestaande documentinfrastructuur. De bestaande mappenstructuur, filternavigatie en URL-structuur blijven ongewijzigd. Beide systemen lezen uit dezelfde database en hetzelfde Object Storage.

```
Gebruiker
  ├── Bestaande manier: Bibliotheek-tab → filter op type/status/fabrikant → lijst
  └── Nieuwe manier:    AI-zoekbalk → vrije vraag → gerangschikte resultaten
            │
            └── Beide wegen → zelfde documenten-tabel → zelfde data
```

### Componenten

**1. Chunk-indexer** (`services/ai-zoek-indexer.ts`)

Getriggerd door documentgebeurtenissen:

| Gebeurtenis | Actie indexer |
|---|---|
| Document geüpload (nieuw) | PDF-tekst extraheren → chunks aanmaken → embeddings genereren → opslaan in `document_chunks` |
| Revisie aangemaakt | Chunks van vorige revisie deactiveren → nieuwe chunks aanmaken voor nieuwe revisie |
| Document `actueel` → `ingetrokken` | Chunks deactiveren (niet verwijderen — audittrail) |
| Document gearchiveerd | Chunks uit actieve index verwijderen (behoudt archief-zoekvlag) |
| `ai_geanalyseerd` gezet op false | Herindexering plannen |

De chunk-indexer is asynchroon: de upload-route retourneert direct; de indexer draait op de achtergrond. De `ai_geanalyseerd`-vlag geeft de status van de indexering aan.

**2. Vector-opslag** (`document_chunks`-tabel)

```sql
CREATE TABLE document_chunks (
  id              SERIAL PRIMARY KEY,
  document_id     INTEGER NOT NULL REFERENCES documenten(id) ON DELETE CASCADE,
  revisie_nummer  INTEGER NOT NULL,
  chunk_index     INTEGER NOT NULL,
  tekst           TEXT NOT NULL,
  embedding       VECTOR(1536),          -- OpenAI text-embedding-3-small
  metadata        JSONB NOT NULL DEFAULT '{}',
  actief          BOOLEAN NOT NULL DEFAULT true,
  aangemaakt_op   TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX ON document_chunks USING hnsw (embedding vector_cosine_ops)
  WHERE actief = true;
```

Metadata-inhoud per chunk: `{ documenttype, fabrikant, groep_id, revisie_nummer, geldig_tot, goedkeuring_status, doel_types[] }` — zodat filters op metadata gecombineerd kunnen worden met de semantische zoekvraag.

**3. Embedding-generatie**

Model: `text-embedding-3-small` (OpenAI, al beschikbaar via Replit OpenAI-integratie). Chunk-grootte: maximaal 500 tokens met 50-token overlap voor continuïteit over pagina-grenzen heen.

**4. Zoek-API**

Nieuw endpoint naast de bestaande filtervorm:

```
POST /documenten/zoeken
Body: {
  vraag:      string,           // vrije tekst, verplicht
  type?:      string,           // documenttype-filter (optioneel)
  fabrikant?: string,           // fabrikant-filter (optioneel)
  limiet?:    number            // max resultaten, standaard 10
}
Response: {
  resultaten: [{
    document_id:    number,
    score:          number,     // cosinus-relevantie 0.0–1.0
    excerpt:        string,     // relevante passage uit de chunk
    document:       Document    // volledig document-object
  }]
}
```

De bestaande `GET /documenten` (filter-gebaseerd) wordt niet gewijzigd.

**5. Synchronisatie-garantie**

Beide systemen zijn synchroon op het niveau van de database als bron van waarheid. De regel: een document dat bestaat in de `documenten`-tabel bestaat altijd in de bestaande filternavigatie. Een document dat bestaat in de `documenten`-tabel en `ai_geanalyseerd = true` heeft, bestaat ook in de vector-index.

De enige latentie is de indexeringstijd na upload (asynchroon, typisch < 10 seconden). In die tijd is het document via de bestaande filternavigatie al zichtbaar, maar nog niet via AI-zoeken. Dit wordt in de UI aangegeven met een "Wordt geïndexeerd…"-indicator op de documentkaart.

### Frontend-integratie

De AI-zoekbalk wordt toegevoegd boven de bestaande filterbalk in de Bibliotheek-tab. Via een toggle schakelt de gebruiker tussen:

- **Bladeren** (bestaand): filterbalk + gepagineerde lijst, ongewijzigd
- **AI-zoeken** (nieuw): zoekbalk + gerangschikte resultaten met excerpt

Bij "Bladeren" is de AI-zoekbalk leeg en inactief. Bij "AI-zoeken" zijn de bestaande filters inactief (de semantische zoekvraag vervangt de filterlogica, optionele type/fabrikant-filters zijn combineerbaar).

De toggle-instelling wordt bewaard in localStorage per gebruiker.

### Welke documenten worden geïndexeerd

| Categorie | Geïndexeerd voor AI-zoeken |
|---|---|
| Referentiedocumenten (bibliotheek) | Volledig — tekst + metadata |
| Toolbox-inhoud | Gedeeltelijk — tekst per werkgever, alleen voor toolbox-bevoegde gebruikers |
| Offerte-secties | Gedeeltelijk — tekst per klant, alleen voor offerte-bevoegde gebruikers |
| Operationele foto's | Niet — geen indexeerbare tekst |
| HRM-medewerker-documenten | Alleen metadata (type, naam, geldig_tot) — geen volledige tekst (AVG-privacybescherming) |
| Definitieve dossiers | Niet — bevroren juridische documenten worden niet herparseerd |

---

## Synchronisatiemodel: bestaand + AI

```
Upload of revisie
        │
        ▼
documenten-tabel (bron van waarheid)
        │
        ├──► GET /documenten (filter) ─────► Bestaande Bibliotheek-tab
        │         altijd synchroon
        │
        └──► Chunk-indexer (asynchroon)
                   │
                   ▼
           document_chunks + embeddings
                   │
                   └──► POST /documenten/zoeken ──► AI-zoektab
                             leest van zelfde documenten-tabel
                             voor metadata-verrijking
```

De bron van waarheid is en blijft de `documenten`-tabel. De vector-index is een afgeleid systeem: hij kan volledig worden herbouwd vanuit de `documenten`-tabel zonder dataverlies. Een rebuild-script (`scripts/herindexeer-documenten.ts`) voert de chunk-indexer uit over alle actieve documenten met `ai_geanalyseerd = false`.

---

## Samenvatting per dimensie

| Dimensie | Referentie | Operationeel | Proces |
|---|---|---|---|
| **Opslag** | Centrale bibliotheek + `/objects/{id}/rapport/` | Per entiteit-pad per type | Per proces-entiteit-pad |
| **Versiebeheer** | groep_id + revisie_nummer, immutable | Geen versieketen (foto/LMRA) of overwrite (plattegrond) | Versie-tabel (offerte) of éénmalige bevriezing (dossier) |
| **Eigenaarschap** | Bibliotheek-beheerder | Uitvoerende partij | Procesverantwoordelijke |
| **Rechten** | bibliotheek 1–4 + goedkeuringsflow | Entiteit-gebonden rechten + requireAuth voor eigen records | Module-bevoegdheid + 409 na definitief |
| **AI-index** | Volledig: tekst + metadata + vector-embeddings | Beperkt: AI-voorstel per type (foto, LMRA, incident) | Beperkt: offerte-secties en contractanalyse |
| **Zoekfunctionaliteit** | Bestaand filter + nieuw AI-zoeken (semantisch) | Bestaand filter per entiteit; AI alleen toolbox/HRM-metadata | Bestaand filter; AI op metadata + offerte-tekst |
| **Archivering** | gearchiveerd-vlag; chunks deactiveren; bevroren snapshot in dossier | Per type: foto bij spot, LMRA immutable, HRM 7-jaar bewaarplicht | Status-wijziging; dossier definitief = permanent; medewerker AVG 7 jaar |
