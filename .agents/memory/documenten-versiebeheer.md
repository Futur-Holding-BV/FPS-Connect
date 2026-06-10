---
name: Documenten versiebeheer (V1.2)
description: Onveranderlijkheids-invarianten van de documentbibliotheek — single-actueel en revisie-overerving — en testrapport backward-compat.
---

De bibliotheek-documenten (`documenten` + `document_toepassingen`/`document_applicaties`) zijn revisie-gebaseerd: één `groep_id` per logisch document, `revisie_nummer` oplopend, copy-on-revision.

## Single 'actueel' per groep — afdwingen op ZOWEL revisie ALS PATCH
Er mag per `groep_id` hoogstens één rij met status `actueel` zijn.
- **Waarom:** `mapLabel` doet `.find(status === 'actueel')` en de lijst-filter `alleen_actueel` gaan ervan uit dat er precies één is. Twee actuele rijen → willekeurige keuze + dubbele rijen in de lijst.
- **Hoe toepassen:** copy-on-revision zet de oude actuele rij op `vervangen`. Maar de PATCH-statusroute moet óók weigeren om een oudere (niet-nieuwste) revisie terug op `actueel` te zetten — anders ontstaat de twee-actueel-toestand alsnog. Guard = `revisie_nummer === max(revisie_nummer) voor de groep`.

## Revisie erft bron-velden bij weggelaten waarden
Bij `POST /documenten/:id/revisies` worden ontbrekende velden (m.n. `pdf_url`, fabrikant/metadata, `ai_metadata`) overgenomen van de bron-rij.
- **Waarom:** inhoud is onveranderlijk via PATCH (alleen status/gearchiveerd), dus een naam-/metadata-correctie kan alléén via een nieuwe revisie. Het frontend-formulier reset `pdf_url` naar `""` (alleen gevuld bij nieuwe upload); zonder overerving zou een metadata-only revisie stil de PDF kwijtraken terwijl de PDF-dragende rij `vervangen` wordt.
- **Hoe toepassen:** server-side `b.veld ?? bron.veld` (defensief, los van wat het formulier stuurt).

## Testrapport backward-compat
De oude `testrapporten`-tabel is opgegaan in `documenten` (documenttype `testrapport`). `labels.testrapportId` blijft fysiek bestaan (deprecaten, niet droppen — monteur-app + spotformulier hangen aan het embedded `testrapport`-object). `mapLabel` leidt het embedded testrapport af uit `document_toepassingen` (nieuwste/actuele testrapport-doc) met fallback op legacy `testrapportId`.
