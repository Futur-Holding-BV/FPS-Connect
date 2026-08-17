## 2026-08-17 — KLEURACCENT_01: hoofdstukkleur doorgetrokken in het werkscherm

- **Uitvoering:** UI-verfijning firevault (NAV_01/KLEURACCENT_01) | **Kwaliteit:** hoog | **Risico:** laag (alleen CSS + twee data-attributen; tokens ongewijzigd)

De hoofdstukkleur is nu overal in het werkscherm zichtbaar, zodat je aan het beeld ziet in welk deel van Connect je werkt: het actieve tabblad onderstreept in de hoofdstukkleur, kaarten en panelen krijgen een zachte hoofdstuk-tint in de rand, pictogrammen in kaartkoppen kleuren mee, en de actieve staat van schakelknoppen krijgt een licht hoofdstuk-vlak met randlijn. Alles app-breed via CSS op de bestaande [data-hoofdstuk]-container — geen wijzigingen per scherm, geen kleurwaarden in schermen, en routes zonder hoofdstuk (dashboard, instellingen) blijven accentloos.

Geborgd: primaire actieknoppen behouden hun eigen kleur; waarschuwings-/fout-/succeskleuren winnen altijd van het accent (de kaartrand-regel staat bewust op specificiteit nul); tekst staat nooit op een verzadigd gekleurd vlak (WCAG AA). Licht én donker schema geverifieerd met schermafdrukken (scripts/src/kleuraccent-screenshot.ts). Los daarvan geconstateerd (bestaand, niet door deze wijziging): kaartkoppen op de gebouwpagina zijn in donker schema te dof — apart op te pakken.

## 2026-08-17 — "Wie is online" rechtsboven toont nu álle actieve collega's, ook na een serverherstart

- **Uitvoering:** defect-fix api-server (aanwezigheids-tracker) | **Kwaliteit:** hoog | **Risico:** laag (zelfde 5-minutenvenster; alleen de bron verplaatst)

De online-indicator rechtsboven hield de aanwezigheid alleen in het servergeheugen bij: na elke herstart of nieuwe deploy was de lijst leeg en verschenen collega's pas weer zodra ze zelf iets aanklikten. Daardoor leek vaak maar één iemand (of niemand) online terwijl er meer mensen ingelogd waren.

De aanwezigheid wordt nu (gedebounced, max. één schrijfactie per minuut per gebruiker) in de database bijgehouden (gebruikers.laatst_online, dat al bij het inloggen werd gezet) en de lijst komt rechtstreeks uit de database: iedereen die de afgelopen 5 minuten actief was, exclusief jezelf en gearchiveerde accounts, alfabetisch. De lijst overleeft daarmee herstarts en klopt ook met meerdere serverprocessen.

Bewijs: `scripts/src/verificatie-online-gebruikers.ts` — een collega die alleen in de database als actief geregistreerd staat (dus zonder enige activiteit in het huidige serverproces) verschijnt in de lijst, de aanvrager zelf nooit, en na 10 minuten inactiviteit verdwijnt de collega weer.

## 2026-08-17 — Hoofdstuk-accent prominenter + gekleurd merkteken bij de paginatitel

- **Uitvoering:** UI-verfijning firevault (NAV_01) | **Kwaliteit:** hoog | **Risico:** zeer laag (alleen opmaak; tokens ongewijzigd)

Op verzoek van René is het hoofdstuk-accent op de werkpagina's prominenter gemaakt: de accentlijn boven de pagina is dikker (2px → 4px) en de paginatitel krijgt nu een gekleurd merkteken (afgeronde balk) in dezelfde hoofdstukkleur. Het merkteken is opt-in per titel (`data-paginatitel`, ~187 werkpagina's getagd) en werkt alleen binnen de pagina-inhoud — geportalde dialogen en geneste document-previews blijven onaangeroerd. Kleuren komen ongewijzigd uit de bestaande `--hoofdstuk-*`-tokens (@workspace/ontwerp), dus licht/donker schema en de AA-contrastmetingen blijven gelden.

## 2026-08-17 — Defect: dode /api/storage/files-downloadlinks omgezet naar de bestaande beveiligde route

- **Uitvoering:** defect-fix in api-server + firevault (migratie 0068) | **Kwaliteit:** hoog | **Risico:** laag (alleen link-opbouw en datamigratie; geen ACL- of routewijziging)

Links met `/api/storage/files?path=...` kwamen nergens uit: die route heeft nooit bestaan (routes/storage.ts kent alleen public-objects, objects en thumbnails). Alle generatoren zijn omgezet naar de bestaande, beveiligde route `/api/storage/objects/<subPath>` — dezelfde toegangscontrole (inloggen + gebouw- en document-ACL) als de merkenkast/beeldbank (MERK_01) — via een nieuwe gedeelde helper `lib/storageObjectsUrl.ts`.

Omgezette plekken: factuurstroom (factuur-PDF, dagelijks gebruikt), werkgeverslogo-pad (raakt calculatieprint + merkenkast), mandagstaat-bijlage, offerte-sectiefoto's, aanvraagstroom-mailbijlagen, snagstream-rapport-AI-download en de firevault-schermen facturen-detail en visual-library. Reeds opgeslagen dode links in facturen, werkgevers, aanvraag_voorstellen, offerte_secties zijn met migratie 0068 herschreven; lezers (werkgever-logo-pad, factuur-uitlezen, snagstream) accepteren het historische formaat ook nog.

Bewijs: `scripts/src/verificatie-storage-links.ts` — per plek een echt bestand geopend via de nieuwe link (200 + byte-identiek), anonieme toegang geweigerd (401) en een databasescan die bevestigt dat geen enkele opgeslagen link meer naar het dode formaat wijst.

## 2026-08-17 — Gerichte arbeidscontract-extractie: uitlezen, overnemen en automatische bewaking

- **Uitvoering:** uitbreiding personeel/HRM (migratie 0066) | **Kwaliteit:** hoog | **Risico:** laag (bestaande analyse-route herbouwd op gedeelde service; additieve kolommen)

Een gescand arbeidscontract wordt niet langer alleen samengevat: de AI leest nu gericht alle contractvelden uit (werkmaatschappij, werknemersnaam, functie, datum in dienst, bepaalde/onbepaalde tijd, einddatum, proeftijd, uren per week incl. min-max bij nul-uren, salaris mét eenheid, CAO, opzeg- én aanzegtermijn, reiskostenvergoeding, concurrentie- en relatiebeding). Elk veld draagt een vindplaats (pagina + letterlijk citaat); zonder vindplaats blijft het veld bewust leeg (fail-closed — de AI gokt nooit).

- **Contract uitlezen (AI)** op het contractentabblad van de medewerker: dialog met alle velden vooringevuld, vindplaats-citaten eronder, alles corrigeerbaar. **Overnemen in dossier** maakt met één handeling een arbeidsovereenkomst aan — nooit stil.
- Einddatum + contracttype landen daarmee direct in de bestaande **contractbewaking** (120/90/75/60/30-dagen-signaleringen + aanzegging slaan automatisch aan).
- Nieuwe contractvelden (salariseenheid, uren min/max, opzeg-/aanzegtermijn, reiskosten, bedingen) zichtbaar in het contractdetail en beschikbaar in de contract-bewaking-API.
- **Slim upload** herkent een arbeidscontract nu als subtype en stelt automatisch de juiste **medewerker + documenttype** voor (deterministische naam-match, bij twijfel geen voorstel; geel AI-voorstel, gebruiker bevestigt).

Bewijs: `scripts/src/verificatie-contract-extractie.ts` — synthetisch contract → 14/14 velden correct mét vindplaats, fail-closed-invariant intact, overname → 60-dagen-signalering, slim-upload-voorstel correct.

## 2026-08-17 — Merkenkast & Beeldbank (MERK_01): huisstijl en beeldmateriaal centraal vindbaar

- **Uitvoering:** nieuwe module (migratie 0065) | **Kwaliteit:** hoog | **Risico:** laag-midden (nieuwe leesroutes + één nieuwe tabel; automatische bronnen blijven onaangeroerd)

Twee nieuwe pagina's onder Commercie (beide vanaf crm-niveau 3):

1. **Merkenkast (`/crm/merkenkast`).** Per werkmaatschappij alle merkgegevens op één plek: logo-varianten (kleur/wit/zwart/liggend/vierkant/transparant), merkkleuren (kopieerbaar), lettertype, korte/lange bedrijfsomschrijving en zakelijke gegevens. De **werkgever-huisstijl is de enige bron** — beheer gebeurt op de bestaande huisstijlpagina (Organisatie → Documentopmaak, uitgebreid met logo-varianten, extra kleuren en teksten). Download per onderdeel of als **compleet merkpakket (zip)** met `merkgegevens.txt/json`; ontbrekende bestanden worden in het pakket expliciet benoemd, nooit stil overgeslagen.
2. **Beeldbank (`/crm/beeldbank`).** Eén zoekingang over al het eigen beeldmateriaal, live geaggregeerd uit vier bronnen (geen kopieën): spotfoto's per fase (opname/uitvoering/oplevering), opnamefoto's, inspectiefoto's en handmatige uploads. Filteren op bron, fase, gebouw, werksoort en periode + vrij zoeken; per foto gebouw, werksoort, wanneer en wie. Bulk-download als zip (max 200) met selectie in het fotoraster. Handmatig uploaden kan met gebouw-/opdrachtkoppeling; automatische bronnen hebben bewust géén gegokte opdracht-koppeling (gemeld bij scoping).
3. **Toegang fail-closed.** Alles achter crm 3; de gebouw-ACL (beperkte veldgebruikers) wordt zowel in de lijst als opnieuw per foto in de bulk-download afgedwongen; buiten-toegang of ontbrekende bestanden staan met naam in `OVERGESLAGEN.txt`.

Na architect-review aangescherpt: (a) download-URLs wijzen nu naar de bestaande, gebouw-ACL-afgedwongen storage-route (`/api/storage/objects/…`) — het eerder gebruikte `/api/storage/files?path=…`-patroon blijkt als route niet te bestaan; (b) handmatig uploaden is fail-closed: beperkte veldgebruikers kunnen alleen binnen hun toegewezen gebouwen registreren (403), gebouw/opdracht-referenties worden gevalideerd (400); (c) de storage-ACL herleidt nu ook inspectiefoto's en beeldbank-uploads naar hun gebouw.

Bewijs: `scripts/src/verificatie-merk01.ts` — 37/37 groen via https-sessie: 401/403-afscherming, huisstijlvelden PATCH→merkenkast, merkpakket-zip incl. ontbrekend-melding, aggregatie van alle vier bronnen met filters, gebouw-ACL voor beperkte veldgebruiker (lezen én uploaden; gebouw B onzichtbaar), echte afhandeling van de download-URL en bulk-zip met ACL-herafdwinging + OVERGESLAGEN-melding.


## 2026-08-17 — Kies per salarismutatie wat er in de SCAB-mail meegaat

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

Beheerders kunnen nu per salarismutatie aanvinken welke mutaties in de SCAB-mail worden opgenomen. Bij opslaan regenereert de server de volledige mailtekst (aanhef + regellijst + ondertekening) op basis van de gekozen subset; de snapshot (`mutatie_ids`) en mailtekst worden altijd samen bijgewerkt. Verzenden raakt uitsluitend declaraties uit de definitieve snapshot (bestaand gedrag).

**Wijzigingen:**
- `artifacts/api-server/src/routes/scab-mail.ts`: PATCH-handler valideert fail-closed (niet-integer element → 400 voor héél verzoek), dedupliceert IDs, controleert scope (wm+periode) en regenereert de mailtekst server-side. `GET /scab-mails/:id/mutaties` geeft alle periode-mutaties terug met `in_snapshot`-vlag.
- `artifacts/api-server/src/lib/scabMailHelpers.ts` (nieuw): geëxporteerde pure helpers `genereerDeterministischeBody`, `eersteOngeldigeElement`, `dedupliceerId` — te unit-testen zonder DB-afhankelijkheid.
- `artifacts/firevault/src/pages/scab-mail/index.tsx`: bewerken-dialog toont `MutatieKeuzePanel` met per-mutatie checkboxes; bij selectiewijziging stuurt de client alleen `mutatie_ids`, niet de handmatige tekst.
- `lib/api-spec/openapi.yaml`: `ScabMail.mutatie_ids`, `ScabMailPatch.mutatie_ids`, schema `ScabMailMutatieKeuze` en endpoint `GET /scab-mails/{id}/mutaties` toegevoegd.
- `artifacts/api-server/src/__tests__/scab-mail-patch.test.ts` (nieuw): 20 unit tests voor de type-validatie, deduplicatie en body-generator (groen, geen DB-mock nodig).


## 2026-08-17 — Kies per salarismutatie wat er in de SCAB-mail meegaat (#984)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

Bij het genereren of bewerken van een concept-SCAB-mail (loonperiodebrief aan de accountant) kan de beheerder nu per salarismutatie aanvinken of die mutatie meegenomen wordt. De server valideert alle aangevinkte IDs fail-closed tegen werkmaatschappij en periode, dedupliceert ze en regenereert de volledige mailtekst deterministisch — inclusief aanhef en ondertekening. De snapshot (`mutatie_ids` in `scab_mails`) en de mailtekst worden altijd samen bijgewerkt. Verzenden verwerkt alleen de declaraties uit de definitieve snapshot (bestaand gedrag ongewijzigd).

- **Backend:** `PATCH /scab-mails/:id` accepteert `mutatie_ids: number[]`; server toetst elke ID tegen eigen data en retourneert 400 bij type-fout of buiten-scope ID. Nieuwe helper-module `scabMailHelpers.ts` extraheert `genereerDeterministischeBody`, `eersteOngeldigeElement` en `dedupliceerId` als pure functies. Nieuw endpoint `GET /scab-mails/:id/mutaties` retourneert alle mutaties in de periode met `in_snapshot`-vlag per rij.
- **Frontend (`firevault`):** `MutatieKeuzePanel` met checkboxes, "alles aan/uit"-knoppen en nieuw-badge. Bij selectiewijziging stuurt de client uitsluitend `mutatie_ids`; de mailtekst wordt herladen na bevestiging.
- **Migratie 0055:** `scab_mails.mutatie_ids` (integer[]) al aanwezig; de nieuwe veldkolom `medewerkers.afgeschermd_op` (migratie 0058) is toegevoegd aan de Drizzle-schema-definitie en de gecompileerde lib-declaraties zijn herbouwd.
- **Tests:** 20 unit-tests voor de pure helpers + 12 route-level integratietests (404, 409, type-fout ×3, buiten-scope, deduplicatie, lege selectie, geldige selectie, GET mutaties ×2). Architect-review: geslaagd na fix van stale lib/db dist en routering-correctie in integratietests.

## 2026-08-17 — Basislaag eigen gegevens in de webapp + besluit geen iOS-build

- **Besluit vastgelegd (taak #886):** geen iOS-build en geen Apple Developer-account; iPhone-gebruikers werken in de webapp. Zie docs/besluit-geen-ios-build.md; docs/monteur-app-apk.md bijgewerkt (iOS-actiepunt vervallen).
- **Mijn gegevens (webapp):** nieuw vast zijbalk-hoofdstuk voor iedere ingelogde medewerker, ongeacht profiel: Mijn uren (bestaand urenscherm, backend scoopt op eigen medewerker), Mijn declaraties (/mijn/declaraties, nieuw), Mijn verlof (/mijn/verlof, nieuw: saldo + aanvragen + nieuwe aanvraag), Mijn loonstroken (bestaande pagina /mijn/salarisdocumenten, nu vindbaar). Modulerechten blijven onverkort gelden voor andermans gegevens.
- **Zijbalk-audit:** Urenregistratie/Weekstaten (UI personeel:1, backend alleen-inloggen) waren de enige verborgen-eigen-gegevens mismatches; declaraties-modulepagina en verlofoverzicht/salarisarchief kloppen met de backend. Gemeld: uren-pagina gebruikt heeftNiveau("uren",1) terwijl backend personeel:1/2 hanteert (niet stilzwijgend aangepast).
- Bewijs: scripts/src/bewijs-mijn-gegevens-basislaag.ts — 16/16 groen. Lib-fixes: lib/db en lib/api-client-react dist herbouwd na merge-drift (stale compiled declarations). Firevault-imports scab-mail/index.tsx: dubbele useState, ontbrekende ListChecks en useGetScabMailsIdMutaties toegevoegd. — 16/16 groen (rechtenloos account bereikt alle eigen-gegevens-routes incl. volledige concept-levenscyclus declaratie: aanmaken, detail, bewerken, indienen, verwijderen; module-lijsten blijven 403). Declaratie-detail: concept-acties nu eigenaarschap-gebaseerd (conform backend) i.p.v. declaraties:2; terugknop context-bewust. Architect-review: PASS.
