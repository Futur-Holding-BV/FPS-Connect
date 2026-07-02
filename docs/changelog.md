# Changelog — FPS Connect

Overzicht van opdrachten, fixes en bouwwerk per datum.
Voor elke taak drie scores:
- **Uitvoering** — volledig / gedeeltelijk / niet
- **Diepere lagen** — volledig / gedeeltelijk / niet (= of de onderliggende detailscenario's ook gebouwd zijn)
- **Getest** — e2e geautomatiseerd / typecheck / handmatig door agent / niet expliciet getest

Grote roadmap-fases staan ook in `docs/roadmap/gebouwd.md` en `docs/roadmap/actief.md`.

---

## 2026-07-02 — Nieuwe medewerker: lege-state functies met snelkoppeling

**Uitvoering:** volledig | **Getest:** typecheck

De functie-Select in de "Nieuwe medewerker"-dialoog toonde een lege dropdown als er nog geen functies aangemaakt waren, zonder uitleg. Nu:
- Lege staat: melding "Nog geen functies in het functiehuis" + "Nieuwe functie"-knop inline bij het label
- Als er wel functies zijn: dropdown zoals voorheen (buitendienst / kantoor-staf groepen)
- De knop opent direct het bestaande functie-aanmaak-dialoog, waarna de functie meteen selecteerbaar is

---

## 2026-07-01 — Slim uploaden: toelichting verplicht, personeelsdocumenten direct naar dossier, afgewezen doorsturen

**Uitvoering:** volledig | **Getest:** typecheck

Drie verbeteringen op de upload-workflow:

- **Toelichting verplicht** — het toelichting-veld in de wachtrij-kaart is niet meer optioneel. De "Analyseer"-knop blijft grijs totdat er een beschrijving is ingevuld. De toelichting wordt als `opmerkingen` meegestuurd naar de inbox (zodat de reden van opslaan zichtbaar blijft). `analyseerAlle` slaat bestanden zonder toelichting over.
- **Personeelsdocumenten direct naar het dossier** — wanneer de AI een bestand classificeert als "Personeel / HRM", verschijnt er een medewerker-picker en een documenttype-selector (15 typen). Het bestand wordt direct naar `/api/medewerkers/:id/documenten` geüpload en slaat de inbox over. Als de gebruiker toch via inbox wil: koppeling "Liever via inbox opslaan". Succes-bericht onderscheidt "personeelsdossier" van "inbox".
- **Afgewezen items doorsturen** — in de inbox-detailpagina toont een afgewezen item nu een rode kaart met de afwijzingsreden en een "Doorsturen naar andere module"-knop die het bestaande verplaatsen-dialoog opent.

---

## 2026-07-01 — Personeelsdossier: verloopdatum, volledigheidsoverzicht en NAW-kaart

**Uitvoering:** volledig | **Getest:** typecheck + DB-migratie

Uitbreidingen op de bestaande Documenten-tab in `/personeel/:id`:

- **Verloopdatum** — nieuw veld op `medewerker_documenten` (DB ALTER + OpenAPI + codegen + API + frontend). Upload-dialoog toont DatePicker zodra het gekozen type een verloop kent (identiteitsbewijs, rijbewijs, VCA/BHV/EHBO, diploma, paspoort, verblijfsvergunning). DocumentRegel toont badge: rood = verlopen, amber = verloopt binnen 60 dagen, grijs = geldig t/m datum.
- **Dossier volledigheidsoverzicht** — kaart bovenaan de tab met vereiste docs (ID-bewijs/Paspoort + Arbeidscontract) en reeds aanwezige aanbevolen docs (CV, VCA, BHV, EHBO, Rijbewijs). Kaart kleurt amber bij ontbrekende verplichte stukken, groen als alles aanwezig.
- **NAW-kaart** — toont adres, telefoon en e-mail uit het medewerker-profiel direct in de dossier-tab als referentie.
- **Uitgebreide documenttypes** — `naw_formulier` en `geheimhoudingsverklaring` toegevoegd; typesets op backend uitgebreid met legacy-aliassen (`id_bewijs`, `rijbewijs_scan`, `arbeidscontract`).

---

## 2026-07-01 — Slim-upload: Sheet opent altijd — ook bij actieve automatiseringsregels

**Uitvoering:** volledig | **Getest:** typecheck

Bug: als een bestand een actieve automatiseringsregel had, werd het stil doorgestuurd en keerde `verwerkBestanden` terug vóór `setToonDialoog(true)` — de Sheet opende nooit.

Fix: auto-gerouteerde bestanden worden nu ook in de wachtrij gezet (status "klaar", actieGenomen true, gekozenCategorie ingevuld), inbox-upload blijft fire-and-forget maar er is geen aparte navigatie meer. `setToonDialoog(true)` wordt altijd aangeroepen. De Sheet toont auto-gerouteerde items als al-verwerkt met het label "Opgeslagen in inbox → [categorie]".

---

## 2026-07-01 — Slim-upload: wachtrij-paneel (Sheet) vervangt blokkerend center-dialoog

**Uitvoering:** volledig | **Getest:** typecheck

De analyse-dialog is omgebouwd van een blokkerend center-dialoog naar een persistent zijpaneel (Sheet, 440px vanuit rechts):

- **UploadItem** krijgt eigen `toelichting: string` veld; losse `toelichting`-state verwijderd.
- **startAnalyse** (bulk) vervangen door `startAnalyseVoorItem(id)` (per item, parallel mogelijk) + `analyseerAlle()` + `opToelichtingWijzigen(id, tekst)`.
- **opBevestigen** neemt nu `(itemId, cat)` — wachtrij blijft open na bevestiging, geen navigatie.
- **WachtrijKaart** component toegevoegd: toont per bestand toelichting-textarea, Analyseer-knop, spinner of inline BeslisScherm.
- **Sheet JSX** vervangt Dialog: header met "Analyseer alle wachtende bestanden (N)" knop, scrollbare body met alle WachtrijKaart-items, vaste footer met Sluiten + teller. Automatiseer-dialog ongewijzigd.

---

## 2026-07-01 — Slim-upload: bestand wordt nu écht opgeslagen na classificatie

**Uitvoering:** volledig | **Getest:** typecheck

Kernbug opgelost: de slim-upload-balk classificeerde bestanden (via AI) maar sloeg ze **nooit op**. Na bevestiging werd er alleen genavigeerd; het bestand bleef in browsergeheugen en verdween. Drie symptomen:
- "De popup met analyse is er niet" → automatiseringsregel (na 3× zelfde extensie bevestigd) routeert bestanden stil, dialog wordt bewust overgeslagen. Diagnose: localStorage-regels actief.
- "Het bestand nergens verschijnen" → **root cause**: geen upload naar server. Nu opgelost.
- "Popup aan de zijkant na 3 seconden" → toast-notificatie van auto-routing.

Wijzigingen in `slim-upload-balk.tsx`:
- Nieuwe helper `uploadNaarInbox(bestand)` → POST multipart naar `/api/inbox/items` (fire-and-forget).
- `opBevestigen`: upload het bestand naar inbox na categoriebevestiging; toast meldt "Opgeslagen in inbox".
- Auto-routing: upload het bestand ook bij stille doorstuur via automatiseringsregel; toast meldt "Doorgestuurd en opgeslagen" of waarschuwt bij mislukking.

Bestanden staan nu in Slim uploaden › Inbox na elke upload, ongeacht pad (handmatig of automatisch).

---

## 2026-07-01 — Audit: volledige module-inventarisatie (routes × nav × implementaties)

**Uitvoering:** analyse | **Getest:** n.v.t.

Statische audit van alle ~90 routes in App.tsx gekruist met nav-items en pagina-bestanden. Resultaat in `docs/audit-modules-2026-07.md`. Bevindingen: 6 bevestigde stubs (bedrijfsresultaten, werk-inbox, autopark-legacy, FPS One documenten/rapporten/abonnementen), overige ~85 pagina's zijn echte implementaties met API-koppeling. Prioriteitsmatrix voor opvolging opgenomen.

---

## 2026-07-01 — Fix: drag-overlay verdwijnt nu als bestand teruggesleept wordt

**Uitvoering:** hotfix | **Getest:** typecheck groen

De drag-overlay bleef hangen als de gebruiker een bestand boven het venster hield en terugsleepte zonder te droppen. Oorzaak: de `dragleave`-teller liep niet terug naar 0 bij verlaten van het venster. Fix: `relatedTarget === null` detecteert dat de cursor het venster verlaat en reset de overlay direct; `dragend` (drag geannuleerd) doet hetzelfde als fallback.

---

## 2026-07-01 — Slim uploaden: toelichting voor AI vóór analyse

**Uitvoering:** volledig | **Getest:** typecheck groen (firevault + api-server)

Het analyse-dialoog opent nu eerst een toelichtingsscherm: een tekstgebied waar de gebruiker vrije context kan typen ("Bijv.: testrapport van fabrikant X voor project 2024-038"). Pas na klikken op "Analyseren" start de AI. De toelichting wordt als `Gebruikerscontext`-hint meegegeven aan het AI-model (max 500 tekens); zonder toelichting werkt de analyse precies zoals voorheen. Backend leest `toelichting` uit de FormData en geeft het door aan `aiClassificeer` en de heuristische fallback.

---

## 2026-07-01 — Opnieuw uitnodigen ook voor actieve gebruikers (geaccepteerd)

**Uitvoering:** hotfix | **Getest:** typecheck groen

De "Uitnodigen"-knop was verborgen voor gebruikers met status `geaccepteerd`. Voor Jacqueline (en anderen die al een account hebben maar een nieuwe activatielink nodig hebben) verschijnt nu ook een "Opnieuw uitnodigen"-knop — zowel op de kaartweergave als in het detaildialoog. De knop heeft een neutrale grijs/slate stijl (onderscheid van amber/paars voor nog-niet-uitgenodigde gebruikers). De backend-endpoint (`POST /gebruikers/:id/uitnodigen`) verwerkt dit correct: nieuw token, nieuwe vervaldatum, status terug naar "uitgenodigd".

---

## 2026-07-01 — Fix: uploaden werkte niet meer (Uppy/React 19 conflict)

**Uitvoering:** hotfix | **Getest:** typecheck groen, workflow herstart

`lib/object-storage-web/src/index.ts` exporteerde `ObjectUploader` die bovenin Uppy importeert (`@uppy/core`, `@uppy/react`, `@uppy/aws-s3`). Uppy is niet compatibel met React 19. Zodra Vite de module laadde, brak de hele `@workspace/object-storage-web` module — waardoor elke pagina die `useUpload` importeerde volledig vastliep en uploads nergens meer werkten (documenten, tekeningen, foto's, bijlagen, berichten, snagstream, etc.).

`ObjectUploader` werd nergens in de app gebruikt. Fix: export verwijderd uit `index.ts`. Uppy-code staat nog in `ObjectUploader.tsx` maar wordt niet meer geladen.

---

## 2026-07-01 — Magazijn volledig mobiel: locaties, verplaatsen, opdracht-koppeling, inkoop

**Uitvoering:** volledig | **Getest:** typecheck groen (monteur-app + api-server)

**Scan-scherm uitgebreid (magazijn/scan.tsx):**
- Drie acties: Uitgifte / Retour / **Verplaatsen** (nieuw)
- Opdracht-keuze bij uitgifte en retour (optioneel, modal picker)
- Locatie-keuze bij uitgifte (van-locatie), retour (naar-locatie) en verplaatsen (van + naar — verplicht)
- Navigeerbaar met `?artikel_id=X` parameter vanuit artikelenlijst (scanner overgeslagen)

**Nieuw scherm: Artikelen (magazijn/artikelen.tsx):**
- Volledig artikelbladerscherm op de telefoon met zoekfunctie
- Vrije voorraad per artikel, rood bij onder minimum
- Tik om direct naar uitgifte/retour/verplaatsen te gaan

**Nieuw scherm: Inkoop aanvragen (magazijn/inkoop.tsx):**
- Toont alle artikelen onder minimumvoorraad, gegroepeerd per leverancier
- Aantallen vooringevuld op tekort (gewenst - vrij), handmatig aanpasbaar
- "Bestelbon versturen" per leverancier: stuurt HTML-e-mail naar leverancier (indien e-mailadres bekend) of slaat intern op

**API uitgebreid (OpenAPI + server):**
- `POST /magazijn/verplaatsingen` — atomaire locatie-naar-locatie verplaatsing (transactie: -delta van A, +delta naar B)
- `POST /magazijn/bestelbonnen` — bestelbon aanmaken + optioneel e-mail naar leverancier (MailSoort `magazijn_bestelbon`)

**Menu:**
- Twee nieuwe items toegevoegd: "Artikelen" (cube-outline) en "Inkoop aanvragen" (cart-outline)

---

## 2026-07-01 — Gebruikers: uitnodigingsknop ook in detaildialoog

**Uitvoering:** volledig | **Getest:** typecheck groen

- De uitnodigingsknop ("Uitnodiging versturen" / "Uitnodiging opnieuw sturen") stond alleen op de kaartweergave, niet in het detaildialoog (de geopende kaart). Nu ook toegevoegd aan het detaildialoog, direct boven de Bewerken/Sluiten-knoppen.
- Zelfde kleur en logica als de kaartknop: amber (niet uitgenodigd) / paars (opnieuw sturen), alleen zichtbaar voor hoofdbeheerder en wanneer status niet "geaccepteerd" is.

---

## 2026-07-01 — Slim uploaden: document_sjabloon navigeert nu naar Document Studio

**Uitvoering:** volledig | **Getest:** typecheck groen

- `document_sjabloon` categorie had verkeerde route `/organisatie/documentopmaak` (Document Design System); gecorrigeerd naar `/organisatie/studio` (Document Studio)
- Automiseringsregel toast heeft nu 8 seconden zichtbaarheid (was ~5s) en legt uit dat het bestand nog handmatig geüpload moet worden op de bestemmingspagina, plus verwijzing naar het tandwiel-icoon voor regelbeheer
- BeslisScherm voor `document_sjabloon` toont nu duidelijke instructie: na navigeren naar Studio het bestand handmatig uploaden via "Referentie uploaden" bij het gewenste documenttype
- **Automiseringsregel actief?** Als de analysedialog niet verschijnt en er alleen een korte melding opkomt, staat er een actieve automiseringsregel voor dat bestandstype. Verwijder die via het tandwiel-icoon in de taakbalk rechtsonder.

---

## 2026-07-01 — Magazijn: crash door lege SelectItem-waarden opgelost

**Uitvoering:** volledig | **Getest:** typecheck groen

- Radix UI `<Select.Item value="">` gooit een runtime-fout ("must have a value prop that is not an empty string") in alle magazijn-subpagina's
- Gefixed in 7 bestanden: `reserveringen.tsx`, `mutaties.tsx`, `locaties.tsx`, `artikel-detail.tsx`, `uitgiftes.tsx`, `voorraad.tsx`, `retouren.tsx`
- Filterselects (Alle statussen / Alle artikelen / Alle types): sentinel `"__alle__"` met conversie terug naar `""`
- Nullable selects (Geen locatie / Geen reservering / Geen): sentinel `"__geen__"` met conversie terug naar `""` of `null`
- Functionaliteit ongewijzigd — API-calls blijven `filterX || undefined` gebruiken

---

## 2026-07-01 — Boekhouder: functiegroep en preset toegevoegd

**Uitvoering:** volledig | **Getest:** typecheck groen (libs + firevault)

- Preset "Externe boekhouder" had `financieel: 2` (wijzigen); aangepast naar `financieel: 4` (volledig beheer) in `lib/permissies/src/index.ts`
- Preset aangemaakt in DB (id=9): financieel=4, boekhouder_portaal=4, salarisarchief=2, salaris_mutaties=1, rapportages=1
- "Externe boekhouder" toegevoegd aan `FUNCTIE_GROEPEN` in de gebruikerspagina (was onzichtbaar bij gebruiker aanmaken)
- Synchroniseer-route (`POST /profielen/synchroniseer-standaard`) werkt nu ook bestaande systeem-presets bij als ze afwijken van de codedefinitie (was: alleen nieuwe presets invoegen)

---

## 2026-07-01 — Gebruikers: foutfeedback bij uitnodigen hersteld

**Uitvoering:** volledig | **Getest:** typecheck groen

- `stuurUitnodiging` had een stille `catch {}` — als de mail-API een 502 teruggaf (bijv. Azure niet geconfigureerd in dev), zag de gebruiker niets
- Nu: succesbericht via toast ("Uitnodiging verstuurd" / "Uitnodiging opnieuw verstuurd" met e-mailadres) en foutmelding via destructive toast met de servermelding
- `useToast` geïmporteerd en geïnitialiseerd in de gebruikerspagina

---

## 2026-07-01 — SlimUploadBalk: popup verschijnt nu altijd bij droppen

**Uitvoering:** volledig | **Getest:** typecheck groen

- **Root cause 1 (stale closure)**: de drop-listener was geregistreerd met `[]`-deps en belde een verouderde versie van `verwerkBestanden` aan. Opgelost met een `verwerkBestandenRef` die elke render gesynchroniseerd wordt; de listener belt nu altijd de meest recente versie aan.
- **Root cause 2 (silent TypeError)**: `CATEGORIE_INFO[actief.categorie].pad` kon een `TypeError` gooien als een opgeslagen automatiseringsregel een ongeldige categorie bevatte (bv. uit een oudere versie). Die unhandled rejection zorgde ervoor dat `setToonDialoog(true)` nooit bereikt werd en de popup stilzwijgend uitbleef. Opgelost met defensive guard: `const catInfo = CATEGORIE_INFO[actief.categorie]; if (actief && catInfo)`.
- **Root cause 3 (geen feedback bij automatisering)**: als een automatiseringsregel actief was, werd de gebruiker stilzwijgend doorgestuurd zonder enige indicatie. De gebruiker dacht "er gebeurt niets". Nu verschijnt een toast: "Automatisch doorgestuurd — [bestand] → [categorie]".
- **Codegen-drift hersteld**: na merge van tasks #173/#174 was codegen niet opnieuw gedraaid; `DocumentStudioModelInputDocumentType` (enum toegevoegd in OpenAPI) ontbrak in de gegenereerde client. Nu hersteld; typecheck groen.

---

## 2026-07-01 — Gebouwen: werkmaatschappij zichtbaar en bewerkbaar

**Uitvoering:** volledig | **Getest:** typecheck groen

- DB: ontbrekende werkgevers ingevoegd — FPS Bouw (id=6), FPS Bouw en Renovatie (id=7), FPS Onderhoud (id=8); aanmaakdialoog toont nu alle vier keuzes
- Gebouwenlijst (`index.tsx`): werkmaatschappij-naam onder adres/stad op elke kaart
- Gebouwenlijst: filter-dropdown "Filter op werkmaatschappij" naast status-filter (client-side, ook optie "Zonder werkmaatschappij")
- Filter wissen-knop reset nu ook werkmaatschappij-filter
- Detail-header (`detail.tsx`): werkmaatschappij-naam met Building2-icoon in meta-informatierij
- Projectformulier (`gebouw-projectformulier.tsx`): `GebouwProp` uitgebreid met `werkgever_id` + `werkmaatschappij_naam`
- Projectformulier: werkmaatschappij-dropdown in bewerkmode (Gebouwafmetingen-sectie) — sla op via PATCH `/gebouwen/:id`
- Projectformulier: werkmaatschappij als leesregel in Projectidentiteit-sectie
- Geen OpenAPI/schema-wijzigingen nodig — velden bestonden al

---

## 2026-07-01 — Magazijn: QR-labelgenerator voor artikelen (Dymo LabelWriter 450)

**Uitvoering:** volledig | **Getest:** typecheck groen

- Nieuw scherm `/magazijn/artikelen/:id/label` (`artikel-label.tsx`) — standalone printpagina buiten de portallayout
- Label toont: QR-code (linkt naar artikel in FPS Connect), artikelnaam, code, merk, leveranciersnaam + leveranciers artikelnummer, barcodewaarde en eenheid
- Vier Dymo-labelformaten selecteerbaar in de toolbar: 89×36 mm, 89×28 mm, 57×32 mm en 54×25 mm
- CSS `@page { size: Xmm Ymm; margin: 0; }` past zich automatisch aan het gekozen formaat aan — gebruiker selecteert Dymo LabelWriter 450 in de printdialoog
- Aantal-selector (1-20 labels) — elk label wordt op een apart etiket afgedrukt
- Instructiebalk toont het exacte formaat en Dymo-instelling-advies
- Knop "QR-label afdrukken" toegevoegd aan de navigatiebalk van `artikel-detail.tsx`
- Route `/magazijn/artikelen/:id/label` geregistreerd vóór `:id` in `App.tsx` (wouter matcht specifiekst eerst)
- Geen backend/OpenAPI-wijzigingen nodig — volledig client-side

---

## 2026-07-01 — Document Studio: templates actief in Connect-modules

**Uitvoering:** volledig | **Getest:** typecheck groen

- `calculatie/print.tsx`: Document Studio-integratie toegevoegd — laadt het goedgekeurde "calculatie" Studio Model 0 via `useActiefStudioModel` en past de merkkleur toe op header-border, sectie-koppen, totaaloverzicht-header en de totaalrij (voorheen hardcoded slate-900)
- Werkgever-resolutie via localStorage (`fps.actieve_werkgever`) + `useListStudioWerkgevers`, gelijk aan het patroon in `offertes/print.tsx` en `gebouwen/print.tsx`
- Badge "Opmaak: Model 0 — [werkgever]" verschijnt in de kop als er een goedgekeurd template actief is; bij geen actief model valt de accentkleur terug op `#1e2535`
- `studio.tsx`: `calculatie: ["Calculatie intern"]` toegevoegd aan `DOCUMENT_TYPE_MODULES` zodat de Studio-pagina "Actief in: Calculatie intern" toont op goedgekeurde calculatietemplates
- Bestaande integraties onaangeroerd: `offertes/print.tsx` (Familie A, volledig) en `gebouwen/print.tsx` (opleverrapport, accent + badge) waren al compleet
- Factuurmodule heeft geen print.tsx (boekhoudimport-tool); `factuur: ["Facturen"]` blijft in de mapping voor toekomstige integratie

---

## 2026-07-01 — Crashfix magazijn: stray `</>` in slim-upload-balk

**Uitvoering:** volledig | **Getest:** typecheck groen, app serveert correct

- Oorzaak: dropzone-overlay-edit introduceerde een stray `)}` in de JSX-structuur van `slim-upload-balk.tsx`, waarna esbuild de transformatie van de hele app faalde → alle pagina's (inclusief magazijn) crashten met een witte scherm
- Achtergebleven `<>…</>` fragment-wrapper en stray `</>` sluitingstag uit de vorige ternaire structuur zijn opgeruimd
- `SlimUploadKnop`, `Popover` en separator-elementen zijn nu directe kinderen van de taakbalk-div zonder onnodige fragment-omhulling
- Magazijn-module: alle hooks, DB-tabellen en routes zijn geverifieerd aanwezig en correct; de crash was puur de JSX-transformatiefout in de layoutcomponent

---

## 2026-07-01 — AI-invullen bij nieuw leverancier

**Uitvoering:** volledig | **Getest:** typecheck groen

- `AiInvullenKnop` toegevoegd aan het "Leverancier toevoegen"-dialog in Calculatie › Leveranciers
- Na het invullen van de naam zoekt AI online naar telefoonnummer, e-mail en website van de leverancier
- Knop verschijnt alleen bij nieuw aanmaken (niet bij bewerken van een bestaande leverancier)
- Backend `POST /ai/invullen` ondersteunde `formulier_type: "leverancier"` al; alleen frontend-integratie toegevoegd

---

## 2026-07-01 — Document Studio: opleverrapport als volwaardig type + template-velden volledig

**Uitvoering:** volledig | **Getest:** typecheck groen (firevault + api-server)

- `GELDIGE_TYPES` in `studio.ts` uitgebreid met `"opleverrapport"` — aanmaken/goedkeuren van opleverrapport-modellen in Studio is nu mogelijk
- `DOCUMENT_TYPEN` in `studio.tsx` aangevuld met Opleverrapport-entry (icoon FileText, omschrijving)
- `DOCUMENT_TYPE_MODULES` gecorrigeerd: `offerte → ["Offertes"]`, `opleverrapport → ["Opleverrapporten"]`, `factuur → ["Facturen"]` — badges tonen nu de werkelijke koppeling
- Beide print-bestanden parsen nu `koptekst.logo_positie` uit `connect_template_json`
- Offerte print: `sektieHeaderKlasse` stuurt `flex-row-reverse` (links) of `justify-center gap-8` (midden) op basis van logo_positie; alle 5 sectie-headers passen dit toe
- Offerte print: voettekst uit template-JSON getoond als tagline-tekst onder het logo in elk sectie-kopbalk
- Gebouwen print (opleverrapport): `prt-cover-top` past `justifyContent` aan op basis van `studioLogoPositie` (flex-start / center / flex-end)

---

## 2026-07-01 — Dropzone overlay bij bestand slepen

**Uitvoering:** volledig | **Getest:** typecheck groen

- Smalle rode/oranje balk die de taakbalk uitzette bij drag-over vervangen door een mooi gecentreerd overlay-scherm
- Overlay: donker semi-transparant backdrop (`bg-black/50 backdrop-blur-sm`), wit afgerond kaartje met oranje gestippelde rand, grote Upload-icoon met glow-ring, kopregel + ondertitel, badge "Slimme categorisering actief", fade-in + zoom animatie via Tailwind `animate-in`
- Taakbalk blijft altijd in zijn normale donkere staat — geen kleurwijziging meer tijdens drag

---

## 2026-07-01 — Centrale AI-invullaag (Option B) — `POST /ai/invullen` + `<AiInvullenKnop />`

**Uitvoering:** volledig | **Getest:** typecheck groen, endpoint bereikbaar (401 auth-guard actief)

- **Backend**: nieuw `POST /ai/invullen` endpoint (`artifacts/api-server/src/routes/ai.ts`) — één centraal punt voor alle formulieren. Accepteert `formulier_type` (enum: 9 types), optionele `context_id` (DB-context laden per type: klant/gebouw/leverancier), en `huidige_velden`. Bouwt form-type-specifieke prompt, zoekt live via `web_search_preview` Responses API, valt terug op chat completions. Geeft `{ velden: Record<string, string|null> }` terug.
- **OpenAPI**: path `/ai/invullen` + schemas `AiInvullenInput` / `AiInvullenResultaat` + tag `ai` toegevoegd aan `openapi.yaml`.
- **Codegen**: `useAiCentraalInvullen` mutation hook gegenereerd in `@workspace/api-client-react`.
- **Frontend component**: `artifacts/firevault/src/components/ai-invullen-knop.tsx` — herbruikbare `<AiInvullenKnop />` met amber UX (Sparkles-knop → amber voorstelspaneel → Overnemen / Negeren). Props: `formulierType`, `contextId?`, `huidigVelden`, `onVoorstellen`, `veldenLabels?`.
- **Formulierdeployments**:
  - CRM Organisaties (`crm/organisaties.tsx`): knop na naam-veld, vult adres/postcode/stad/regio/telefoon/email/website/branche/type aan.
  - CRM Contactpersonen (`crm/detail.tsx`): knop in nieuwe-contactpersoon-dialog na naam-veld, vult email/telefoon/mobiel/functie aan (met organisatie als `contextId`).
- Gebouwen-formulieren overgeslagen — die bevatten al `useAiAnalyseGebouw` (uitgebreider AI-systeem); dubbele AI-knoppen vermeden.

---

## 2026-07-01 — AI-invullen: echte webzoekopdracht via web_search_preview

**Uitvoering:** volledig | **Getest:** typecheck groen

- `POST /organisatie/ai-invullen`: gebruikt nu de Responses API met `web_search_preview` tool zodat de AI actief op internet zoekt naar bedrijfsgegevens (adres, telefoon, e-mail, website, KVK, BTW). Val terug op trainingsdata als web search niet beschikbaar is.
- `POST /crm/concurrenten/ai-profiel`: zelfde upgrade — zoekt nu live naar concurrentinformatie.
- Prompt aangepast: minder conservatief ("null alleen als echt niet te vinden") en expliciet gericht op Nederland.

---

## 2026-07-01 — Document Studio: werkgever-resolutie en API-contract gerepareerd

**Uitvoering:** volledig | **Getest:** typecheck groen

- `GET /studio/modellen/actief` geeft nu `200` met `null` terug als er geen goedgekeurd model bestaat (was: `404`); sluit aan op het fallback-contract
- `offertes/print.tsx`: werkgever-resolutie voor studio-model leest nu de actieve werkgever uit localStorage (`fps.actieve_werkgever`) in plaats van altijd `werkgevers[0]` te nemen; val terug op `werkgevers[0]` als localStorage leeg is (print-pagina valt buiten WerkmaatschappijProvider)
- `gebouwen/print.tsx`: zelfde fix — `studioWerkgeverId` wordt nu afgeleid uit `gebouw.werkmaatschappij_naam` (met fallback naar `werkgevers[0]`); ook de `werkgever`-variabele voor de print-header wordt nu via dezelfde naam opgelost
- `gebouwen/print.tsx`: badge "Opmaak: Model 0 — …" toegevoegd in de topbar (naast de bestaande status-badges), consistent met `offertes/print.tsx`

---

## 2026-07-01 — AI-invullen op leveranciers- en concurrentformulieren

**Uitvoering:** volledig | **Getest:** typecheck groen

**Leveranciers (detail — BewerkModal):**
- Knop "AI invullen" naast naam in het Leverancier bewerken-dialoog
- Vult automatisch: KvK, BTW, adres, postcode, stad, telefoon, e-mail, website en IBAN
- Amber suggestiepaneel met leesbare veldlabels (KvK, BTW, Adres, enz.); "Overnemen" past alle velden tegelijk toe, "Negeren" sluit het paneel
- Hergebruikt bestaande `POST /organisatie/ai-invullen` endpoint; veldmapping kvk→kvk_nummer, btw→btw_nummer, plaats→stad

**Leveranciers (index — NieuweLeverancierModal):**
- Zelfde AI-knop in het aanmaakformulier; vult e-mail, telefoon en stad in (velden beschikbaar in de snelle create-dialog)

**CRM Concurrenten:**
- Nieuw backend endpoint `POST /crm/concurrenten/ai-profiel`: genereert een concurrentprofiel via GPT-4o op basis van naam (website, regio, bekende klanten, projecttypes, sterke/zwakke punten, waar tegengekomen)
- Nieuw OpenAPI-pad + schema `CrmConcurrentAiProfielInput`; codegen uitgevoerd; gegenereerde hook `useAiProfielCrmConcurrent`
- Knop "AI" in het Concurrent-formulier (nieuw + bewerken); amber paneel met "AI-concurrentprofiel"; "Overnemen" vult alle velden tegelijk in

---

## 2026-07-01 — Werkmaatschappijen: AI-invullen op formulier

**Uitvoering:** volledig | **Getest:** typecheck groen

- Knop "AI invullen" naast het naamveld in het werkmaatschappij-dialoog (nieuw + bewerken)
- Na invullen van de bedrijfsnaam zoekt de AI automatisch: adres, postcode, plaats, KVK, BTW, telefoon, e-mail en website op via de bestaande `/organisatie/ai-invullen` endpoint
- Resultaten verschijnen in een amber suggestiepaneel met leesbare veldlabels en "Overnemen"/"Negeren" knoppen — mens bevestigt altijd voor opslaan
- Knop is uitgeschakeld zolang naam leeg is; toelichting onder het naamveld legt het gebruik uit

---

## 2026-07-01 — Werkmaatschappij context: switcher in sidebar, doorwerking dashboard + documentopmaak

**Uitvoering:** volledig | **Getest:** typecheck groen

- Nieuw `WerkmaatschappijProvider` (React context) — slaat actieve werkgever op in localStorage (`fps.actieve_werkgever`), auto-selecteert de eerste actieve werkmaatschappij bij eerste bezoek
- Switcher in sidebar-header: compact dropdown direct onder het logo, zichtbaar voor hoofdbeheerder of wanneer er meerdere werkmaatschappijen zijn; verdwijnt bij ingeklapte sidebar
- Dashboard `beheerder.tsx`: toont een context-balk met de actieve werkmaatschappij (naam + vestigingsplaats) direct boven de KPI-kaarten
- Documentopmaak (`/organisatie/documentopmaak`): pre-selecteert automatisch de actieve werkmaatschappij uit de context in plaats van altijd de eerste

**Diepere lagen:** gedeeltelijk — de contextkeuze stuurt branding (documentopmaak, logo in DDS) en is platform-breed beschikbaar via `useWerkmaatschappij()`. Volledige data-scoping (gebouwen/spots/documenten filteren per werkmaatschappij) vereist backend API-parameters op tientallen endpoints — apart increment.

---

## 2026-07-01 — Slim uploaden: 15-minuten notificatiepaneel met ongedaan maken

**Uitvoering:** volledig | **Getest:** typecheck groen

- Na elke bevestigde upload verschijnt rechtsonder een floating paneel ("Recente uploads").
- Elk item toont: bestandsnaam, categorielabel met kleur, tijdstip + resterende tijd (15 minuten).
- **Ongedaan maken**: verwijdert het item uit de lijst en navigeert terug naar de pagina van vóór de redirect (zodat de gebruiker opnieuw kan indelen).
- **Alles wissen**: leegt het paneel in één klik.
- TTL wordt bijgehouden via localStorage — paneel blijft zichtbaar na paginanavigatie, verdwijnt automatisch na 15 minuten per item.
- Paneel ververst elke 30 seconden de tijdweergave.

---

## 2026-07-01 — Slim uploaden: vision-analyse voor alle documenttypen

**Uitvoering:** volledig | **Getest:** typecheck groen (firevault + api-server), workflows herstart

- **Vision-analyse**: eerste pagina van elke PDF wordt via `pdftoppm` omgezet naar JPEG, geschaald met `sharp` en als afbeelding meegestuurd naar OpenAI gpt-4o-mini. AI ziet nu de visuele lay-out, niet alleen de tekst.
- **Afbeeldingen (JPEG/PNG/WEBP)**: ook rechtstreeks naar vision gestuurd (resize via sharp).
- **AI-prompt uitgebreid** met visuele signalen per type: logo+lege pagina = document_sjabloon, maatlijnen/schaal = tekening, tabelposten+IBAN = factuur, etc.
- **Vision-badge** in het beslisscherm: "AI heeft de visuele lay-out geanalyseerd" zichtbaar wanneer vision werd ingezet.
- **`vision_gebruikt`** vlag in API-response en frontend.
- Pre-existing lege-PDF heuristiek blijft als fallback wanneer AI niet beschikbaar is.

---

## 2026-07-01 — Slim uploaden: meerdere bestanden + document-intelligentie workflow

**Uitvoering:** volledig | **Getest:** typecheck groen (firevault + api-server), workflows herstart

### Backend (`artifacts/api-server/src/routes/slim-upload.ts`)
- **Meerdere bestanden tegelijk**: endpoint accepteert nu `bestanden[]` (array via `upload.any()`), verwerkt elk bestand parallel en retourneert een array van suggesties
- **14 categorieën** (was 7): aanvraag, tekening, offerte, factuur, productdocument, testrapport, certificaat, ETA, DoP, personeelsdocument, snagstream, bibliotheek, algemeen, onbekend
- **Rijkere AI-extractie**: prompt instrueert GPT om per documenttype specifieke velden te extraheren (leverancier/bedrag bij facturen, klant/locatie bij aanvragen, fabrikant/normen bij testrapporten, etc.)
- **Alternatieven**: AI geeft altijd top-2/3 alternatieve categorieën terug (voor beslisscherm)
- **Betere heuristiek**: uitgebreide fallback classificeert ook ETA, DoP, testrapport, certificaat, productdocument op bestandsnaam

### Frontend (`artifacts/firevault/src/components/slim-upload-balk.tsx`)
- **Multi-file**: `<input multiple>` + drag-drop accepteert meerdere bestanden tegelijk; queue-gebaseerde verwerking
- **Beslisscherm per bestand**: rijke dialog met gevonden gegevens (klant, bedrag, fabrikant, etc.), redenering en alternatieven
- **Twee-paneel layout** bij meerdere bestanden: bestandenlijst links, beslisscherm rechts
- **Drietrapsfout-afhandeling**: AI succesvol → voorstel tonen; AI onzeker/onbekend → top-3 alternatieven als klikbare kaarten; technische fout → handmatige classificatiegrid (nooit alleen een foutmelding)
- **AVG-waarschuwing** bij personeelsdocumenten
- **Aanvraag-flow**: aparte vervolgknoppen "Nieuw werk aanmaken" / "Alleen opslaan in bibliotheek"
- **Automatiseringsregels** bewaard: blijven werken met de nieuwe categorieën

---

## 2026-06-30 — Login: autofocus op TOTP-invoerveld

**Uitvoering:** volledig | **Getest:** typecheck groen

- `autoFocus` toegevoegd aan `InputOTP` in stap "verify" en stap "setup" (`artifacts/firevault/src/pages/auth/login.tsx`): cursor staat nu direct in het eerste vakje zodra de 2FA-stap verschijnt, zonder muisklik.

---

## 2026-06-30 — Document Studio: templates actief in Connect-modules

**Uitvoering:** volledig | **Diepere lagen:** volledig | **Getest:** typecheck groen (firevault + api-server), codegen geslaagd, workflows herstart

- **API `GET /studio/modellen/actief`**: enkelvoudige lookup op werkgever_id + document_type; 404 als geen goedgekeurd model; Express-volgorde vóór `/:id`
- **API `GET /studio/werkgevers/:id/modellen/actief`** (bulk): geeft `Record<documentType, DocumentStudioModel>` terug met alle goedgekeurde templates voor een werkgever in één call; gebruikt `parseId` voor type-veilige param-parsing
- **Codegen**: `useListActieveDocumentStudioModellen` + `getListActieveDocumentStudioModellenQueryKey` gegenereerd
- **Shared hook** `use-actief-studio-model.ts` (`artifacts/firevault/src/hooks/`): `useActiefStudioModel(werkgeverId, documentType)` — wraps bulk-hook, normaliseert 404/ontbrekend naar `null`, `throwOnError: false`
- **Werkgever-matching op naam**: studioWerkgever wordt gezocht op `naam === werkgevers[0].naam` (of werkgeverNaam in gebouwen) met fallback op `studioWerkgevers[0]`; nooit meer blind `[0]` in multi-werkmaatschappij context
- **Offertes print** (`offertes/print.tsx`): gebruikt shared hook; `--color-primary` CSS-var op root-div (cascade VoorbladA); `logo_url` uit Studio werkgever; "Opmaak: Model 0" badge (print:hidden)
- **Opleverrapporten print** (`gebouwen/print.tsx`): gebruikt shared hook; `.prt-cover-accentlijn` background via inline style; voettekst-tagline uit template (fallback "Brandveiligheid door vakmanschap")
- **Document Studio kaart** (`studio.tsx`): `DOCUMENT_TYPE_MODULES` mapping; "Actief in:" badges op goedgekeurde kaarten

---

## 2026-06-30 — Document Studio: AI template generatie & Model 0

**Uitvoering:** volledig | **Diepere lagen:** volledig | **Getest:** typecheck groen, codegen geslaagd, workflows draaien

- **AI genereer-endpoint** (`POST /studio/modellen/:id/genereer`): leest referentie-PDF via object storage (pdf-parse), haalt werkgever-branding op (primaireKleur, logo_url, voettekst), stuurt prompt naar GPT-4o, valideert JSON-response, slaat op als `connect_template_json` met status `concept`; families A/B/C automatisch geadviseerd per documenttype; optionele `instructie`-parameter voor eerste generatie
- **Bijstuur-endpoint** (`POST /studio/modellen/:id/bijstuur`): bestaand concept + bijstuur-instructie → GPT-4o → verfijnd concept; overschrijft huidige concept-json (geen versieboom in deze fase)
- **Goedkeur-endpoint** (`POST /studio/modellen/:id/goedkeuren`): status → `goedgekeurd`, `goedgekeurd_op` + `goedgekeurd_door` (uit sessie), versie incrementeren, activiteitslog-entry
- **StudioTemplateJson schema** in OpenAPI: familie, koptekst (logo_positie/titel/subinfo), kleurschema (primair/secundair/tekst), secties (tekst/tabel/ondertekening/checklist), voettekst
- **StudioTemplatePreview** component (`src/components/documentopmaak/StudioTemplatePreview.tsx`): rendert template_json via DocumentFrame; secties naar correct bloktype (tekst/tabel/ondertekening/checklist); familie-badge; merkkleur-accent; logo-positie links/rechts/midden
- **AI-generatie UI** in `studio.tsx`:
  - Kaartgrid uitgebreid: "Genereer met AI" knop per type bij aanwezig referentiebestand; automatisch genereren bij eerste keer openen zonder concept
  - AI-dialoog (max-w-5xl): preview links (live re-rendered na elke actie), bijstuur-paneel rechts
  - Bijstuur-instructie + Verfijnen-knop; Opnieuw genereren; iteratiegeschiedenis met alle gegeven instructies in de sessie
  - Goedkeuren-knop + bevestigingsdialoog (goedgekeurd-state sluit bijstuurveld af, toont datum)
- **Codegen**: `useGenereerStudioTemplate`, `useBijstuurStudioTemplate`, `useGoedkeurenStudioTemplate` gegenereerd + lib rebuild
- **Technisch**: pdf-parse via createRequire (CJS-compatibiliteit); buffer-download via createReadStream + Promise; JSON-extractie uit mogelijke markdown-omhulsels; 503 bij invalide AI-JSON

## 2026-06-30 — Onderhoudsmodule volledig + deployment fix uniqueIndex

**Uitvoering:** volledig | **Diepere lagen:** volledig | **Getest:** typecheck groen, DB-tabellen bevestigd, workflows draaien

- **Onderhoudsmodule** (`/onderhoud`): volledig gebouwde zelfstandige contractmodule los van de projectworkflow
  - **DB-schema** (`lib/db/src/schema/onderhoud.ts`): `onderhoudTable`, `onderhoudscontractenTable` (contractnummer OC-YYYY-NNN, gebouw/opdrachtgever/contactpersoon, contracttype, looptijd, indexering, contractwaarde, facturatie/onderhoudsfrequentie, eerstvolgende/laatste onderhoud, automatische verlenging, status), `werkbonnenTable` (werkbonnummer WB-YYYY-NNN, koppeling contract + gebouw, type, kwartaal, datum, monteur, duur, status, resultaat)
  - **Backend routes**: `onderhoudscontracten.ts` (CRUD + `/statistieken` endpoint: actief/concept/aflopend/verlopen/contractwaarde/achterstallig/werkbonnen_open), `werkbonnen.ts` (CRUD + status-doorschakeling met activiteit-logging); beide geregistreerd in `index.ts`
  - **Bevoegdheden**: `requireBevoegdheid("onderhoud", 1–4)` voor alle routes; `onderhoud` is volwaardige `ModuleId` in alle presets
  - **Frontend** (6 bestanden): `index.tsx` (module-hub met tab-navigatie dashboard/contracten/werkbonnen), `dashboard.tsx` (KPI-kaarten actief/contractwaarde/open werkbonnen/onderhoud-deze-maand + signalering aflopend/achterstallig + live lijsten), `contracten.tsx` (filteerbaar overzicht + nieuw-contract dialoog), `contract-detail.tsx` (bewerken inline + werkbonnen per contract + verwijder-bevestiging), `werkbonnen-lijst.tsx` (filter status+type + nieuwe werkbon dialoog), `werkbon-detail.tsx` (statusmachine gepland→in_uitvoering→voltooid, bewerken inline)
  - **Routing**: `/onderhoud`, `/onderhoud/contracten/:id`, `/onderhoud/werkbonnen/:id` in `App.tsx`
  - **Nav-gating**: gecorrigeerd van `heeftNiveau("gebouwen", 1)` naar `heeftNiveau("onderhoud", 1)` in `beheerder-layout.tsx`
  - **OpenAPI + codegen**: alle hooks aanwezig (`useListOnderhoudscontracten`, `useGetOnderhoudscontractenStatistieken`, `useGetOnderhoudscontract`, `useCreateOnderhoudscontract`, `useUpdateOnderhoudscontract`, `useDeleteOnderhoudscontract`, `useListWerkbonnen`, `useGetWerkbon`, `useCreateWerkbon`, `useUpdateWerkbon`, `useDeleteWerkbon`)
- **Deployment fix**: `uniqueIndex` verwijderd uit `documentStudioModellenTable` Drizzle-schema — additieve UNIQUE-indexen in schema-definitie laten Replit's deployment-validatie falen; constraint blijft in DB via directe ALTER TABLE; patroon gedocumenteerd in memory

## 2026-06-30 — Document Studio + studioRouter geregistreerd

**Uitvoering:** volledig | **Diepere lagen:** volledig | **Getest:** typecheck groen, api-server bouwt

- **Document Studio** (`/organisatie/studio`): nieuwe pagina per werkmaatschappij met kaartgrid voor 8 documenttypen (offerte, brief, e-mail, LMRA, toolbox, inkoopbon, factuur, calculatie); statussysteem geen → referentie → concept → goedgekeurd; drag-and-drop upload-dialoog (PDF/JPG/PNG/WEBP, max 10 MB); werkmaatschappij-selector bovenaan
- **DB-schema**: `documentStudioModellenTable` in `lib/db/src/schema/organisatie.ts`; db push geslaagd
- **OpenAPI + codegen**: studio-paden en -schemas in openapi.yaml; hooks `useListDocumentStudioModellen`, `useUpsertDocumentStudioModel`, `useUpdateDocumentStudioModel`, `useUploadDocumentStudioReferentie` gegenereerd
- **API-route** `artifacts/api-server/src/routes/studio.ts` geregistreerd in `index.ts`
- **Nav-item** "Document Studio" (LayoutTemplate-icoon) toegevoegd onder Organisatie in `beheerder-layout.tsx`
- **Route** `/organisatie/studio` toegevoegd in `App.tsx`
- **Onderhoudsmodule geconstateerd al volledig gebouwd** (schema, routes, frontend index/dashboard/contracten/contract-detail/werkbonnen-lijst/werkbon-detail, App.tsx-routes, OpenAPI-spec) — sessietaken T001–T005 waren reeds gereed

## 2026-06-30 — Slim uploaden: verbeterde AI-intelligentie + post-merge bugfix

**Uitvoering:** volledig | **Diepere lagen:** volledig | **Getest:** typecheck groen

- **Betere AI-prompt** (`slim-upload.ts`): elke categorie heeft nu expliciete signaalwoorden en voorbeelden; briefpapier/sjablonen worden expliciet als "algemeen" aangemerkt; bij lage zekerheid geeft de AI een nuttige redenering in plaats van "niet specifiek genoeg"
- **Betere context naar AI**: de AI krijgt nu te horen hoeveel tekst er kon worden geëxtraheerd; bij een lege PDF ("geen leesbare tekst — mogelijk een afbeelding, sjabloon of ontwerpdocument") is het duidelijk waarom de zekerheid laag is
- **Bugfix**: dubbele `handleVeldBlur`-declaratie in `bedrijfsdocumenten.tsx` verwijderd (ingevoerd door taakagent-merge #140)
- **Post-merge codegen**: na merges van taakagenten (#134–#141) opnieuw codegen gedraaid; hooks voor magazijn, opdracht-materiaal en AI-correcties beschikbaar

---

## 2026-06-30 — AI veld-correcties: leren van naam, uitgever, referentie etc.

**Uitvoering:** volledig | **Diepere lagen:** volledig | **Getest:** typecheck groen (TS7030 pre-existing in api-server)

Uitbreiding van het AI-leermechanisme in de bedrijfsdocumenten-module: niet alleen categorie-correcties worden onthouden, maar ook correcties op andere AI-ingevulde velden.

- **DB** (`lib/db/src/schema/organisatie.ts`): nieuw tabel `ai_veld_correcties` (veld_naam, ai_voorstel, gekozen, hash, tekst_fragment); schema gepusht via `drizzle-kit push`.
- **Backend** (`artifacts/api-server/src/routes/organisatie.ts`):
  - Nieuw endpoint `POST /organisatie/bedrijfsdocumenten/veld-correctie` — slaat correctie op voor naam/uitgever/referentie/ingangsdatum/vervaldatum/omschrijving; valideert veldnaam tegen whitelist.
  - `analyseer`-route haalt nu parallel catCorrecties (max 10) + veldCorrecties (max 15) op en voegt beide als few-shot voorbeelden toe aan de systeemprompt met veld-specifiek formaat (`Veld <naam> — AI stelde voor: "..." — gebruiker corrigeerde naar: "..."`).
- **Frontend** (`artifacts/firevault/src/pages/organisatie/bedrijfsdocumenten.tsx`):
  - Nieuwe helper `stuurVeldCorrectie()` stuurt POST naar `/veld-correctie`.
  - Nieuw ref `aiVoorgesteldeVelden` houdt bij wat de AI per veld voorstelde.
  - `verwerkBestand` vult `aiVoorgesteldeVelden.current` bij elk AI-ingevuld veld.
  - `setFormVeld` detecteert wanneer een AI-veld wordt aangepast: als de nieuwe waarde verschilt van het AI-voorstel, wordt automatisch een correctie verstuurd (stil, achtergrond).
  - `resetDialoog` wist ook `aiVoorgesteldeVelden.current`.

## 2026-06-30 — Materiaallijst per opdracht in het opdrachtdossier

**Uitvoering:** volledig | **Diepere lagen:** volledig | **Getest:** typecheck groen + API health check

Koppeling magazijn ↔ opdrachten zichtbaar gemaakt via een nieuw Materiaal-tabblad op de opdracht-detailpagina:

- **OpenAPI** (`lib/api-spec/openapi.yaml`): nieuw endpoint `GET /opdrachten/{id}/materiaal` + twee nieuwe schemas (`OpdrachtMateriaal`, `OpdrachtMateriaalRegel`)
- **Codegen** uitgevoerd: nieuwe hook `useGetOpdrachtMateriaal` gegenereerd in `lib/api-client-react/`
- **Backend route** (`artifacts/api-server/src/routes/opdrachten.ts`): queries reserveringen op `opdracht_id` + voorraadmutaties op `referentieType="opdracht"` (uitgifte + retour); verrijkt met artikelnaam, artikelcode, eenheid en inkoopprijs; berekent `totaal_kosten_reserveringen` en `totaal_kosten_uitgiftes` als indicatief totaal (hoeveelheid × inkoopprijs)
- **Frontend tab** (`artifacts/firevault/src/pages/opdrachten/materiaal-tab.tsx`): nieuw component met:
  - Kostenoverzicht-kaarten (gereserveerd + uitgegeven indicatietotalen)
  - Reserveringen-tabel met status-badge (open/gedeeltelijk/volledig/geannuleerd), datum, prijs/eenheid en totaalkosten; beheerder kan open reserveringen annuleren
  - Uitgiftes-tabel met type-badge (uitgifte/retour) en indicatieve kosten
  - "Uitgifte registreren"-dialoog: kies bestaande open reservering (inclusief max-hoeveelheid) of voer artikel-ID direct in
  - "Retour registreren"-dialoog: artikel-ID, hoeveelheid en conditie (goed/defect/afval)
  - Gating via `useBevoegdheid("magazijn", 3)` — alleen beheerders zien de actieknoppen
- **Detail pagina** (`artifacts/firevault/src/pages/opdrachten/detail.tsx`): Materiaal-tabblad toegevoegd na "Uitvoeringsplanning", met Package-icoon

## 2026-06-30 — AI-leergeschiedenis: overzicht categorie-correcties

**Uitvoering:** volledig | **Diepere lagen:** volledig | **Getest:** typecheck + handmatig door agent

Beheerpagina toegevoegd voor de AI-categorie-correcties die worden opgeslagen in `ai_categorie_correcties`:

- **OpenAPI** (`lib/api-spec/openapi.yaml`): twee nieuwe endpoints toegevoegd:
  - `GET /organisatie/bedrijfsdocumenten/correcties` — haalt alle opgeslagen correcties op (nieuwste eerst)
  - `DELETE /organisatie/bedrijfsdocumenten/correcties/{id}` — verwijdert een foutieve correctie
  - Nieuw schema `OrgAiCategorieCorrectie` met id, ai_voorstel, gekozen, tekst_fragment, aangemaakt_op
- **API server** (`artifacts/api-server/src/routes/organisatie.ts`): GET- en DELETE-handlers toegevoegd achter `lezen`/`schrijven` middleware
- **Frontend** (`artifacts/firevault/src/pages/organisatie/bedrijfsdocumenten.tsx`): inklapbaar paneel "AI-leergeschiedenis" toegevoegd onderaan de Bedrijfsdocumenten-pagina:
  - Badge toont het totaal aantal opgeslagen correcties
  - Tabel met kolommen: datum, AI-voorstel (amber badge), gekozen categorie (secondary badge), tekstfragment (ingekort)
  - Verwijderknop per rij (alleen zichtbaar bij schrijfbevoegdheid niveau 2), met bevestigingsdialoog

---

## 2026-06-30 — Barcode scannen in de monteur-app (magazijn)

**Uitvoering:** volledig | **Diepere lagen:** volledig | **Getest:** typecheck groen (monteur-app)

Nieuw scanscherm toegevoegd aan de FPS Monteur-app waarmee monteurs een artikelbarcode scannen en direct een uitgifte of retour registreren:

- **OpenAPI uitgebreid**: `GET /artikelen` heeft nu een `barcode` query-parameter; `Artikel`-schema heeft nu het `barcode`-veld (was aanwezig in DB maar niet in API-respons).
- **Backend** (`artifacts/api-server/src/routes/artikelen.ts`): barcode-filter toegevoegd aan de lijst-query; `mapArtikel` geeft `barcode` terug.
- **Codegen uitgevoerd**: `ListArtikelenParams.barcode` en `Artikel.barcode` beschikbaar in alle gegenereerde hooks.
- **expo-camera geïnstalleerd** in `@workspace/monteur-app`.
- **Nieuw scherm** `artifacts/monteur-app/app/magazijn/scan.tsx`:
  - Vraagt cameramachtiging aan; toont instructie bij geweigerde toegang.
  - `CameraView` met `onBarcodeScanned` — ondersteunt EAN-13, EAN-8, Code128, Code39, QR, UPC-A, UPC-E.
  - Na scan: `listArtikelen({ barcode })` call; toont artikel-info (naam, code, categorie, omschrijving).
  - Haalt vrije voorraad op via `useListVoorraadTotaal` (client-side gefilterd op artikel_id); kleurcodering rood bij/onder minimum.
  - Haalt minimum_voorraad/gewenste_voorraad op via `useGetMagazijnArtikel`.
  - Actiekiezer uitgifte/retour met hoeveelheid-input; verwerkt via `useCreateUitgifte` / `useCreateRetour`.
  - Foutmeldingen en succesbericht via Alert; "Opnieuw" knop keert terug naar de scanner.
- **Menu** (`app/menu.tsx`): "Magazijn scan" toegevoegd aan de `meerActies`-lijst (icoon: `barcode-outline`), route `/magazijn/scan`.

## 2026-06-30 — Onderhoudsmodule (contracten + werkbonnen)

**Uitvoering:** volledig | **Diepere lagen:** volledig | **Getest:** typecheck + e2e groen

Zelfstandige onderhoudsmodule gebouwd, los van de projectworkflow:

- **DB schema** (`lib/db/src/schema/onderhoud.ts`): twee nieuwe tabellen toegevoegd:
  - `onderhoudscontracten` — contracttype, looptijd, frequentie, indexering, contractwaarde, contactpersoon, status, automatische verlenging
  - `werkbonnen` — gekoppeld aan contract + gebouw, kwartaalplanning, monteur, status (gepland/in_uitvoering/voltooid/geannuleerd), resultaat/bevindingen
- **OpenAPI** (`lib/api-spec/openapi.yaml`): volledige CRUD voor beide entiteiten + statistieken-endpoint (`/onderhoudscontracten/statistieken`)
- **API routes** (`artifacts/api-server/src/routes/`): twee nieuwe routers (`onderhoudscontracten.ts` + `werkbonnen.ts`) met auto-nummering `OC-JJJJ-NNN` / `WB-JJJJ-NNN`, bevoegdheid-gating op `onderhoud` module, activiteit-logging bij aanmaken/voltooien
- **Frontend** (`artifacts/firevault/src/pages/onderhoud/`): zes pagina's:
  - `index.tsx` — module-hub met tabnavigatie (Dashboard / Contracten / Werkbonnen)
  - `dashboard.tsx` — KPI-kaarten (actieve contracten, contractwaarde, open werkbonnen, onderhoud deze maand), alerts voor aflopende contracten en achterstallig onderhoud
  - `contracten.tsx` — lijst met zoek/filter + aanmaakdialoog
  - `contract-detail.tsx` — detailweergave, inline bewerken, werkbonnen sub-lijst per contract
  - `werkbonnen-lijst.tsx` — overzicht alle werkbonnen met status/type-filter + aanmaakdialoog
  - `werkbon-detail.tsx` — detailweergave, statusmachine (Start uitvoering / Voltooien), inline bewerken
- **Routing** (`App.tsx`): routes `/onderhoud/contracten/:id`, `/onderhoud/werkbonnen/:id`, `/onderhoud/:rest*` toegevoegd

## 30 juni 2026

### Feature — AI-upload bedrijfsdocumenten: categorie-palet + zelflerende correcties
Na een AI-analyse verschijnt een visueel palet met alle vijf categorieën (Contract,
Vergunning, Certificaat, Kwaliteitshandboek, Overig) zodat de gebruiker met één klik
kan corrigeren als de AI de verkeerde categorie kiest. De AI-suggestie is amber
gemarkeerd. Bij een handmatige correctie wordt de afwijking opgeslagen in
`ai_categorie_correcties` en als few-shot-voorbeelden meegegeven aan volgende
analyseprompts — zodat de AI ervan leert.

- **Uitvoering:** volledig — categorie-palet, correctie-endpoint, few-shot injection analyseer-route
- **Diepere lagen:** volledig — correctie wordt stil verstuurd op klikmoment (niet bij opslaan); palet verdwijnt bij sluiten dialoog
- **Getest:** typecheck (geen nieuwe fouten); handmatig door agent

### Feature — AI-upload en dubbelingsdetectie bedrijfsdocumenten (taak 135)
Uploadzone (sleep/klik) bovenaan het registreerdialoog. AI (GPT-4o-mini) analyseert
het bestand via pdf-parse en vult alle formuliervelden in (geel gemarkeerd conform
AI-state kleurconventie). Exact-hash dubbelingsdetectie toont inline waarschuwing
met drie opties: doorgaan, bestaande bijwerken of annuleren. Bestand_hash wordt
opgeslagen bij create/update zodat toekomstige uploads getoetst worden.

- **Uitvoering:** volledig — uploadzone, AI-extractie, sha256-duplicaatdetectie, amber-markering, hash-opslag
- **Diepere lagen:** volledig — handmatig invullen zonder upload werkt gewoon door
- **Getest:** typecheck (geen nieuwe fouten); handmatig door agent

### Fix — Magazijn data-integriteitsfouten (code review)
Vier kritieke problemen opgelost na code review:

1. **Artikel-detailpagina toegevoegd** — `GET /magazijn/artikelen/:id` endpoint toegevoegd aan OpenAPI + backend; nieuw `MagazijnArtikelItem` schema; codegen uitgevoerd; `artikel-detail.tsx` pagina aangemaakt + route geregistreerd in App.tsx. Dashboard-links naar `/magazijn/artikelen/:id` waren gebroken — nu opgelost.

2. **Voorraad kan niet meer negatief worden** — `bijwerkenVoorraad` gebruikt nu `GREATEST(0, hoeveelheid + delta)` zodat een voorraad-rij nooit onder 0 zakt. Pre-validatie in uitgifte controleert vrije voorraad vóór de mutatie.

3. **Reservering vrijgave per locatie-rij** — `annuleer` gebruikt de oorspronkelijke reservering-mutaties (referentieType="reservering") om exact per betrokken voorraad-rij vrij te geven i.p.v. een blind `LIMIT(1)` op de eerste rij. Zelfde per-rij logica voor uitgifte met reservering_id.

4. **Atomiciteit via DB-transacties** — `reservering aanmaken`, `annuleer`, `uitgifte` en `retour` zijn omgezet naar `db.transaction()`. Halverwege gefaalde mutaties laten geen inconsistente voorraadstatus achter.

---

### Bouw — Magazijn- en voorraadbeheer (Fase 1 kern)
Volledige nieuwe module voor intern magazijn- en materiaalbeheer: locaties, voorraad per locatie, mutaties, reserveringen, uitgiftes en retouren.

**DB (4 nieuwe tabellen + uitbreiding artikelen):**
- `magazijn_locaties` — hiërarchisch (rek/vak/bus/ruimte/extern), inclusief parent_id
- `voorraad` — hoeveelheid + gereserveerd + besteld per artikel+locatie (unieke combinatie)
- `voorraad_mutaties` — audittrail van alle voorraadwijzigingen (inkoop, uitgifte, retour, correctie, reservering)
- `reserveringen` — open/gedeeltelijk/volledig/geannuleerd per artikel+opdracht
- `artikelen` uitgebreid met: merk, leveranciers_artikel_nr, gemiddeld_/laatste_inkoopprijs, minimum_/gewenste_voorraad, barcode, locatie_id

**Backend (OpenAPI + Express):**
- Permissies: `magazijn` module + `Magazijnbeheerder` preset toegevoegd aan `lib/permissies`
- OpenAPI: alle paden + schemas voor magazijn (12 endpoints + GET detail) in `lib/api-spec/openapi.yaml`
- Codegen uitvoerd (hooks + Zod schemas gegenereerd)
- Express router `artifacts/api-server/src/routes/magazijn.ts` (transactioneel, per-rij vrijgave)

**Frontend (9 pagina's incl. artikel-detail):**
- Collapsible "Magazijn"-sectie in `beheerder-layout.tsx`, gated op `useBevoegdheid("magazijn", 1)`
- 9 routes in `App.tsx` onder `/magazijn/*`

- **Uitvoering:** volledig
- **Getest:** typecheck clean; build succesvol; e2e-web-ci groen

---

## 29 juni 2026

### Fix — nieuw onboarde monteur niet zichtbaar in planning
Na onboarding via de Personeel-pagina werd de planning-medewerkerscache niet
geïnvalideerd. De planning toonde de verouderde lijst totdat de gebruiker
handmatig de pagina herlaadde.

- **Uitvoering:** volledig — `getListPlanningMedewerkersQueryKey()` toegevoegd aan
  cache-invalidatie in zowel `opslaanMedewerker()` als `opslaanOnboarding()`
- **Diepere lagen:** volledig — beide aanmaakpaden gedekt (handmatig aanmaken én onboarding vanuit gebruikersaccount)
- **Getest:** typecheck (geen nieuwe fouten); e2e-web-ci groen; monteur-app e2e groen na SLEUTELS-fix

### Fix — e2e startmenu-test (SLEUTELS verouderd na waaier-vereenvoudiging)
Waaier was eerder vereenvoudigd van 10 naar 6 hoofd-items (werkdag/gebouwen/
verlof/uren/planning/veiligheid); personeel en berichten naar "Meer". De e2e-test
controleerde nog op de oude vijf items, waardoor `radiaal-personeel` niet gevonden
werd.

- **Uitvoering:** volledig — SLEUTELS bijgewerkt, staptitel "vijf" → "zes"
- **Diepere lagen:** volledig — navigatie via `__FPS_NAVIGEER__` naar personeel/berichten werkt nog steeds via routeMap
- **Getest:** e2e-monteur-ci groen na de fix

---

## 17 juni 2026

### Gebouwd — V1.4 Opleverrapportage Increment 3
Derde increment van de opleverrapportage, voortbouwend op de bestaande live
`print.tsx`. Exacte inhoud van I3: rapporttypes als sectie-presets, handmatige
e-mailselectie, bijlagenpakket samenstellen. Bouwt voort op het bestaande
werkende voorblad/spots/plattegrond-export.

- **Uitvoering:** gedeeltelijk (I3 van een reeks; spotselectie per verdieping/cluster en definitief-maken-overgang naar V1.5 nog niet gebouwd)
- **Diepere lagen:** gedeeltelijk — kernflow werkt; bijlagenpakket met alle documenttypen is geïmplementeerd maar het "definitief-maken" als formele persistentie-stap wacht op V1.5
- **Getest:** typecheck groen; e2e-web-ci groen; print-functie handmatig verifieerbaar via `/gebouwen/:id/print`

---

## 13 juni 2026

### Gebouwd — Document Design System (visuele basis)
Herbruikbare documentcomponenten (`DocumentFrame`, Familie A/B/C) + previewpagina
onder Beheer › Documentopmaak (`/beheer/documentopmaak`, gated op systeem).
Per werkmaatschappij en per template te wisselen in de preview. Dummy-content;
geen DB/OpenAPI-wijziging. URL-veilige branding-velden zodat de Werkgever-entiteit
ze later kan voeden.

- **Uitvoering:** volledig voor de afgebakende eerste oplevering (visuele basis + 5 voorbeeldtemplates)
- **Diepere lagen:** gedeeltelijk — versiebeheer, PDF-generatie, digitale ondertekening en per-werkmaatschappij centraal DB-beheer staan nog open (latere increments)
- **Getest:** typecheck groen; visueel beoordeelbaar in de preview via `/beheer/documentopmaak`

### Gebouwd — integratie-light print.tsx met Document Design System
`print.tsx` haalt zijn asset-URL's (logo, gevelbeeld, spotfoto's, plattegronden) via
de gedeelde `resolveAssetUrl` op. Functioneel identiek aan vóór de integratie;
de zwaardere frame-overname is bewust uitgesteld om print/html2canvas-export niet
te regressen.

- **Uitvoering:** volledig voor de afgebakende "integratie-light" stap
- **Diepere lagen:** gedeeltelijk — volledige `DocumentFrame`/voorblad-overname voor print.tsx is nog niet gedaan (bewust uitgesteld)
- **Getest:** typecheck groen; e2e-web-ci groen

---

## Juni 2026 (eerder, exacte datum niet geregistreerd)

### Gebouwd — Calculatie spreadsheet/Excel-stijl detail
Calculatiedetailpagina volledig herschreven als spreadsheet-interface:
click-to-edit cellen, Tab/Shift-Tab navigatie, blur-to-save, AI-hints per
sleutelwoord, weergave-tabs (Intern/Directie/Klant/Monteur), Kostopbouw
zijpaneel, AI-voorstel paneel, header bewerken/versie/verwijder dialogen.

- **Uitvoering:** volledig
- **Diepere lagen:** volledig — alle geplande onderdelen gebouwd (inline editing, navigatie, read-only views, panels, dialogen)
- **Getest:** typecheck groen (geen fouten in detail.tsx); functioneel verifieerbaar via de calculatie-module; geen geautomatiseerde e2e specifiek voor calculatie

### Gebouwd — Radiaal startmenu monteur-app (vereenvoudigd + waaier)
Waaier teruggebracht van 10 naar 6 hoofd-items (werkdag/gebouwen/verlof/uren/
planning/veiligheid), overige items naar "Meer"-sectie. Garmin-stijl draaiknop
met Reanimated, minDistance(8) voor tap vs. drag, `__FPS_NAVIGEER__` voor
e2e-navigatie.

- **Uitvoering:** volledig
- **Diepere lagen:** volledig — animatie, navigatie, e2e-navigatiehook, "Meer"-sectie allemaal gebouwd
- **Getest:** e2e-monteur-ci (na herstelde SLEUTELS-fix groen)

### Gebouwd — Veiligheidsmodule monteur-app
Veiligheidscherm in de monteur-app met veiligheidscertificaten en relevante
content voor veldmedewerkers.

- **Uitvoering:** volledig voor het basischerm
- **Diepere lagen:** gedeeltelijk — basischerm gebouwd; koppeling aan bredere toolbox/berichten-module (geparkeerd V2.0/V3.0) nog niet
- **Getest:** typecheck groen; e2e-monteur-ci bevestigt scherm bereikbaar via navigatie

### Gebouwd — Werkdagmodule monteur-app
"Mijn werkdag"-scherm in de monteur-app: persoonlijke planning-items voor de
huidige dag, useFocusEffect-refresh bij terugkeer.

- **Uitvoering:** volledig
- **Diepere lagen:** volledig — dag-view, planning-items, refresh-patroon
- **Getest:** typecheck groen; handmatig verifieerbaar via de monteur-app

---

## Mei–juni 2026 (parallel spoor — eerder gebouwd)

### Gebouwd — HRM / Personeel (Fase 1-basis, breed uitgewerkt)
Medewerkers, functiehuis, opleidingen/certificaten (onderscheid opleiding vs.
cursus, rijke velden), bekwaamheidsmatrix, verlofsoorten (incl. bijzondere/CAO),
verlofsaldo's, verlofaanvragen, onboarding-dialoog. AI-opleidingsvoorstel per
functie (stelt voor, mens bevestigt). Medewerker-detailpagina met alle
onderdelen op één plek. Mobiel: read-only dashboard, opleidingen, kennisbank.

- **Uitvoering:** volledig voor Fase 1-basis
- **Diepere lagen:** gedeeltelijk — salarisadministratie, beoordeling, werving en volledige mobiele self-service zijn bewust NIET gebouwd (geparkeerd, V3.0)
- **Getest:** typecheck groen; e2e-web-ci groen; e2e-monteur-ci groen (verlofscherm via navigatie)

### Gebouwd — DMS / Documentenbibliotheek (incl. V1.5-bevriezingsdeel op dossiers)
Documentlogboek, polymorfe koppelingen, duplicaatdetectie (sha256 + fuzzy),
goedkeuringsflow, signaleringen, DMS-dashboard, audittrail, downloadlogging,
read-only mobiel. Dossier-bevriezing: `POST /dossiers/:id/definitief` bevriest
revisie + PDF per gekoppeld document.

- **Uitvoering:** volledig voor de vijf beschreven fases
- **Diepere lagen:** volledig — alle fases 1–5 gebouwd; definitieve dossier-bevriezing is het V1.5-bevriezingsdeel
- **Getest:** typecheck groen; e2e-web-ci groen

### Gebouwd — Dossiermodule (Fase 1-basis)
Dossiers per gebouw, status concept → definitief → gearchiveerd.

- **Uitvoering:** volledig voor Fase 1-basis
- **Diepere lagen:** gedeeltelijk — het juridisch sluitende bevroren opleverdossier met volledig versiebeheer blijft V1.5
- **Getest:** typecheck groen

### Gebouwd — Offerte Intelligence (Fase 1-basis, alleen voorbereiding)
Offertes en offerte-sjablonen, regels uit spots. Bewust geen AI en geen verzending.

- **Uitvoering:** volledig voor Fase 1-basis
- **Diepere lagen:** gedeeltelijk — AI-calculatie en automatische verzending bewust niet gebouwd (geparkeerd)
- **Getest:** typecheck groen

---

## Eerder (roadmap-fases, afgerond voor mei 2026)

### V1.3 — Spots & uitvoering
Spotflow web + mobiel, SVG-editor, scheidingen, clusters, serie plaatsen, AI-spotvoorstel.
**Uitvoering:** volledig voor de kernfunctionaliteit. **Diepere lagen:** gedeeltelijk (restpunten zijn verfijning, geen kernfunctionaliteit). **Getest:** typecheck + e2e groen.

### V1.2 — Bibliotheek & documentstructuur
Centrale documentbibliotheek, applicaties, toepassingen, ETA's, versiebeheer, AI-analyse.
**Uitvoering:** volledig. **Diepere lagen:** gedeeltelijk (documentcontrole/periodieke check geparkeerd). **Getest:** typecheck + e2e groen.

### V1.1 — Rollen & bevoegdheden
Bevoegdhedenmatrix (jsonb), 14 profielen/presets, beheerinterface, legacy-fallback.
**Uitvoering:** volledig. **Diepere lagen:** volledig. **Getest:** typecheck + e2e groen.

### V1.0 — Administratief gereed voor uitvoering
Dashboard, gebouwenbeheer, voorzieningenoverzicht, inspecties, onderhoud,
gebruikersbeheer, abonnementen, eigen sessie-auth met verplichte TOTP.
**Uitvoering:** volledig. **Diepere lagen:** volledig. **Getest:** typecheck + e2e groen.
