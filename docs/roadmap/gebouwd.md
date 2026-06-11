# Roadmap — Gebouwd

Afgeronde fasen met definitief model. Zie [`README.md`](./README.md) voor het overzicht en [`replit.md`](../../replit.md) voor de Ontwikkelstop-regel en de drie sporen.

## V1.2 — Bibliotheek & documentstructuur (gebouwd — definitief model)

Formeel akkoord en gebouwd. Volgt op V1.1 (Rollen & bevoegdheden) en gaat vóór V1.3 (Spots & uitvoering).

Doel: de bibliotheek is de centrale kennisbank voor alle brandveiligheidsapplicaties, toepassingen en onderliggende documentatie.

**Status bestaande scaffold (reeds aanwezig vóór V1.2):**
- Applicaties: tabel `voorziening_types` (code, naam, categorie, volgorde) + read-only catalogusweergave in `beheer/bibliotheek.tsx` (tab Applicaties).
- Toepassingen: tabel `labels` (typeCode, naam, fabrikant, testnorm, testrapportId) + volledige CRUD + Excel-import (XLSX) in `beheer/bibliotheek.tsx` en `beheer/toepassingen.tsx`.
- Koppeling spot ↔ toepassing: junctietabel `voorziening_labels` (many-to-many) + pickers in het spotformulier.
- AI-analyse (deels): bestaande AI leest tekeningbestanden (nette naam, tekeningtype, verdieping) en gebouwbeelden.

**Gebouwd in V1.2 (definitief model):**
- Centrale documentbibliotheek: tabel `documenten` met documenttypes ETA, classificatierapport, testrapport, productcertificaat, DoP, verwerkingsvoorschrift. Enum-velden als tekstkolommen (geen pgEnum — pgEnum breekt het SQL-DDL-workflow). Schema in `lib/db/src/schema/documenten.ts`.
- Samenvoeging testrapporten: de oude `testrapporten`-tabel is opgegaan in `documenten` (documenttype 'testrapport') via een idempotente SQL-migratie (INSERT ... SELECT met NOT EXISTS-guard). `labels.testrapportId` blijft fysiek bestaan (deprecaten, niet droppen); `mapLabel` leidt het embedded `testrapport`-object af uit `document_toepassingen` met fallback op legacy `testrapportId`.
- Twee veel-op-veel koppelingen: Document ↔ Applicatie via `document_applicaties` (voorziening_type_code) EN Document ↔ Toepassing via `document_toepassingen` (label_id). Eén ETA kan aan meerdere applicaties/toepassingen hangen.
- Versiebeheer/revisies (onveranderlijk): documenten worden nooit overschreven. Een revisie is een transactie (copy-on-revision): nieuwe rij met zelfde `groep_id`, `revisie_nummer = max+1`, status 'actueel'; de oude rij krijgt status 'vervangen'; junctie-rijen worden gekopieerd. PATCH wijzigt uitsluitend status/gearchiveerd/koppelingen — nooit naam/pdfUrl/metadata.
- Statusveld per document: actueel, controle nodig, vervangen, mogelijk verouderd, ingetrokken.
- AI-documentanalyse: endpoint `POST /documenten/ai-analyse` leest geüploade PDF-tekst (client-side pdf.js-extractie) → fabrikant, product, documenttype, EN-norm, revisie, datum + documentnaam-voorstel met betrouwbaarheidsindicatie. Voorstellen zijn GEEL/bewerkbaar; gebruiker bevestigt (NEUTRAAL).
- Frontend: tab "Documenten" in `beheer/bibliotheek.tsx` (`documenten-tab.tsx`): lijst + filters (type/status/fabrikant/alleen-actueel/incl-gearchiveerd), detail met revisiehistorie, upload + AI-voorstel, koppelen aan toepassing(en)/applicatie(s), statusbeheer en archiveren.
- Bevoegdheden (module "bibliotheek"): lezen = ingelogd; aanmaken/revisie/AI-analyse = niveau ≥3; status/archief/koppelingen = niveau ≥2.
- AI Bibliotheekvalidatie (koppelvoorstellen; toegevoegd na V1.2, vooruit op verzoek): endpoint `POST /documenten/ai-koppelvoorstellen` (uitvoeren = bibliotheek niveau 3) vergelijkt de actuele documenten met bestaande toepassingen via de bestaande matcher (`stelToepassingenVoor` in `services/document-ai.ts`) en stelt ontbrekende Document↔Toepassing-koppelingen voor. Voorstellen zijn GEEL/over te nemen, overgenomen koppelingen NEUTRAAL (AI-state kleurconventie). Koppelingen opslaan = niveau ≥2 (`useSetDocumentToepassingen`). De beheerder neemt per voorstel of per document over; AI koppelt nooit zelfstandig.

**Bevriezing — voorbereid, niet voltooid in V1.2:** alleen onveranderlijke documentrevisies (nooit overschrijven). De daadwerkelijke koppeling definitief-rapport ↔ documentversie landt in V1.5 (Rapportenmodule), waar definitieve opleverrapporten worden gepersisteerd.

**Nog te bouwen (later, NIET in V1.2-scope):**
- Documentcontrole: periodieke controle op leverancierswebsites, nieuwe versies als voorstel tonen; de beheerder beslist.

Structuur (hiërarchie):
- **Applicaties** — genummerd (1.1, 1.2, 2.5, enz.). Een applicatie = situatie die op locatie voorkomt.
- **Toepassingen** — onder iedere applicatie (bv. Mulcol Multicollar Slim, Hilti CFS-C P, Rockwool systeem, Nullifire systeem). Een toepassing = gekozen oplossing.
- **Documenten** — centrale documentbibliotheek: ETA's, classificatierapporten, testrapporten, productcertificaten, DoP's, verwerkingsvoorschriften.

(AI-documentanalyse, koppelingen, versiebeheer, historische bevriezing en documentcontrole staan hierboven onder "Gebouwd in V1.2" en "Nog te bouwen".)

## AI-fotoherkenning spotafwerking (gebouwd — eerste versie; vooruit op de roadmap op verzoek)

**Status: gebouwd.** Op uitdrukkelijk verzoek vooruit op de roadmap gebouwd (de Ontwikkelstop blijft als principe gelden voor de overige geparkeerde fasen). De AI als hulpmiddel, nooit als beslisser: AI herkent en stelt voor, mens accepteert. AI keurt nooit zelfstandig juridisch goed; de formele koppeling blijft gebaseerd op de bibliotheek en geaccepteerde rapporten.

**Gebouwd (eerste versie):**
- DB: tabel `spot_ai_voorstellen` (leerset; onveranderlijke jsonb-snapshot van AI-voorstel + monteurkeuze, foto-voor/na-url, afwijking-vlag, herkomst, bevestiger) + kolommen `ai_te_controleren` en `ai_voorstel_id` op `voorzieningen`. Additief via directe ALTER SQL.
- Backend `services/spot-ai.ts`: gpt-4o vision via de Replit OpenAI-proxy; foto-voor + foto-na als base64 via ObjectStorage. Twee-traps: vision → wand/plafond + applicatie-code + observaties (product/fabrikant), daarna een deterministische matcher tegen `labels` (toepassingen) en het actuele gekoppelde document. Bevestigde leerset-correcties worden als few-shot voorbeelden geïnjecteerd (gebouwspecifiek per gebouw, generiek globaal). AI stelt bewust GEEN s.g.-constructie/brandwerendheid vast.
- Endpoints: `POST /voorzieningen/ai-spotvoorstel` (analyse vóór de spot bestaat, op objectPaths), `POST /voorzieningen/:id/ai-voorstel` (leerset persisteren + afwijking berekenen + spot markeren), `POST /voorzieningen/:id/ai-controle` (beheerder bevestigt, kiest gebouwspecifiek/generiek, wist de vlag).
- Mobiel (monteur-app): flow foto-voor → foto-na → AI-paneel → amber voorinvulling (wand/plafond, applicatie, toepassing, document read-only) → overige velden; bij opslaan wordt de leerset gepersisteerd.
- Web (firevault, beheerder-review): rode gestreepte ring op gemarkeerde spots in de plattegrond, "Te controleren"-filter/teller + rode stip in de voorzieningenlijst, en een review-paneel in de spotdetail (foto's voor/na, AI-voorstel amber vs. gekozen toepassing, verplichte radio gebouwspecifiek/generiek, bevestig-knop die de markering laat verdwijnen).

**Bevoegdheden (vastgelegd in de bouw):** AI-voorstel maken/persisteren = niveau 3 (zodat de monteur die de spot maakt mag persisteren). AI-controle bevestigen = niveau 4 (volledig beheer), bewust hoger dan aanmaken zodat de monteur zijn eigen afwijking niet zelf kan bevestigen. De web-review wordt gegate via `useBevoegdheid().heeftNiveau("voorzieningen", 4)`, niet via rol-strings.

**Afwijking-bepaling:** een spot wordt voor beheerder-controle gemarkeerd wanneer de monteur een andere toepassing kiest dan de eerste AI-suggestie. Alleen een suggestie met score > 0 telt mee (een score-0 "hint" wordt mobiel niet voorinvuld en mag dus geen valse controle veroorzaken).

**Nog te doen (later):** confidence-drempel "controle nodig" bij lage zekerheid; periodieke documentcontrole; uitbreiden van de matcher naarmate de bibliotheek groeit.

Afhankelijkheid (harde randvoorwaarde): eerst moet de bibliotheekketen Applicatie -> Toepassing -> Document goed staan (V1.2) en de mobiele fotoflow met foto vóór/ná beschikbaar zijn (V2.0). Zonder een betrouwbare bibliotheek heeft de AI niets om aan te koppelen.

Workflow:
- Foto vóór staat al bij de voorbereide spot of wordt eerder gemaakt.
- Monteur maakt foto ná.
- AI vergelijkt/inspecteert de foto ná.
- AI doet een voorstel: applicatie, toepassing, product/fabrikant, brand- of rookwerendheid, waarschijnlijk rapport/ETA uit de bibliotheek, en mate van zekerheid (confidence-score).
- Monteur accepteert of past aan.
- Bij lage zekerheid: markeren als "controle nodig".
- Beheerder kan later corrigeren.
- Correcties worden opgeslagen als trainings-/leervoorbeelden (leerset).

Sluit aan op de bestaande AI-conventie in de app: AI-voorstellen zijn GEEL/bewerkbaar tot een mens bevestigt; geaccepteerd/bevestigd is NEUTRAAL (zie "AI-state kleurconventie").
