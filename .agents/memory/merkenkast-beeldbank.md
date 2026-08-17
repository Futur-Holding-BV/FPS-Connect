---
name: Merkenkast & Beeldbank (MERK_01)
description: Patronen en valkuilen van de merkenkast (werkgever-huisstijl) en beeldbank (foto-aggregatie) onder Commercie.
---

## Regels
- **Werkgever-huisstijl = enige merkbron.** Merkenkast (`/crm/merkenkast`) leest alleen uit `werkgevers` (logo_varianten jsonb, merk_kleuren jsonb, lettertype, omschrijving_kort/lang). Beheer op Organisatie → Documentopmaak (`MerkenkastVelden` in documentopmaak.tsx). Nooit een tweede merkgegevens-opslag bouwen.
- **Beeldbank = live aggregatie, geen kopieën.** `verzamelFotos()` in routes/beeldbank.ts leest 4 bronnen (fotos→voorzieningen, opname_fotos→…→opnames, inspectie_bevindingen.foto_urls JSON-array per index, beeldbank_uploads). Nieuwe fotobron = daar toevoegen ÉN in `zoekGebouwenVoorLegacyPad` (storage.ts) voor de download-ACL.
- **Aggregatie is in-memory** (alles ophalen → filteren/pagineren in Node). Bewuste keuze bij huidige volumes; bij groei naar DB-side union/paginering verplaatsen.
- **Upload-schrijf-ACL fail-closed:** beperkte veldgebruikers mogen alleen uploaden mét gebouw_id binnen hun toewijzing (403, ook geen "algemeen"); gebouw/opdracht-referenties valideren (400).

## Waarom
Reviewer-afwijzingen: download-URLs naar niet-bestaande route, IDOR via vrije gebouw_id/object_path bij upload, storage-ACL dekte inspectie/upload-paden niet.

## Hoe toepassen
- Download-URL van een `/objects/…`-pad = ALTIJD `/api/storage/objects/<rest>` (segmentsgewijs ge-encodeerd). **`/api/storage/files?path=…` bestaat NIET als route** ("Cannot GET"), het dode patroon in facturen/offertes/snagstream/mandagstaat/aanvraagstroom is aug 2026 als defect gefixt (helper lib/storageObjectsUrl.ts + datamigratie); nieuwe code altijd storageObjectsUrl() gebruiken.
- Bewijsscript: `scripts/src/verificatie-merk01.ts` (37 checks); bevat een centrale-directory zip-parser (`zipInhoudAlsTekst`) om archiver-zips (gestreamd, deflate) op inhoud te controleren — raw latin1-scan werkt niet op gecomprimeerde entries.
- archiver v8 is ESM met named exports: `import { ZipArchive } from "archiver"; new ZipArchive({ zlib: { level: 6 } })` — geen default-functie meer (esbuild-warning "import default undefined" = deze fout).
