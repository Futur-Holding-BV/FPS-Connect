# Roadmap — Document Design System (visuele basis gebouwd; verdieping nog te bouwen)

Strategische, modulebrede fundering. **Vastgelegd, NIET vooruit bouwen:** pas bouwen ná formeel akkoord (Ontwikkelstop blijft leidend). Zie [`README.md`](./README.md) voor het overzicht en [`replit.md`](../../replit.md) voor de Ontwikkelstop-regel en de drie sporen.

## Doel

Geen los "briefpapier" per document, maar één centraal **Document Design System** binnen FPS Connect. Alle documenten uit FPS Connect worden vanuit één documentmotor gegenereerd, met verschillende templatefamilies per documenttype. De bestaande FPS-offerteopmaak is de referentie voor klantdocumenten.

Referentiedocumenten (door gebruiker aangeleverd): aanbesteding-sjabloon en de offerte "Burg. Wallerstraat Oldenzaal — WBO Wonen".

## Templatefamilies

### Familie A — Klantdocumenten
Voor: offertes, begrotingen, communicatieplannen, opleverrapporten, meerwerkoffertes, onderhoudscontracten, inspectierapporten, MJOP's.

Basis = huidige FPS-offertestijl: rood FPS-vlak, groot projectbeeld, klantlogo, duidelijke hoofdstukpagina's, veel witruimte, strakke tabellen, herkenbare FPS-uitstraling.

Templates: (1) voorblad, (2) aanbiedingsbrief / introductiepagina, (3) hoofdstukpagina (grote projectfoto + overlay), (4) inhoudspagina (vaste projectinformatie-balk: project, complexnummer, klant, projectleider, datum), (5) bijlagenpagina.

Verbeteringen t.o.v. huidige opmaak: logo's ~20% groter waar passend; minder zware rode vlakken op vervolgpagina's; betere balans rood/wit/grijs; vaste plek voor documentversie en paginanummering; optionele QR-code naar de FPS One projectomgeving; ondersteuning voor eigen projectfoto's.

### Familie B — HRM & juridische documenten
Voor: arbeidsovereenkomsten, geheimhoudings-/sleutel-/tankpas-/auto-/opleidingsovereenkomsten, personeelsregelingen, verzuimprotocol, personeelshandboek.

Stijl: rustig, zakelijk, juridisch bruikbaar. Witte achtergrond, logo linksboven, dunne rode accentlijn, duidelijke documenttitel, rustige kop-/voettekst, veel leesruimte. Geen grote foto's of rode vlakken, geen marketingopmaak. Geschikt voor digitale ondertekening, PDF en print.

### Familie C — Interne operationele documenten
Voor: werkbonnen, toolboxen, LMRA, montage-instructies, KAM-documenten, werkinstructies, veiligheidsinstructies, interne formulieren.

Stijl: functioneel, snel leesbaar, printvriendelijk. Mobiel goed leesbaar, heldere blokken, ruimte voor iconen, weinig decoratie, duidelijke acties/checklists; geschikt voor monteurs en timmermannen.

## Werkmaatschappijen

Ondersteun: FPS Bouw, FPS Brandpreventie, FPS Onderhoud, FPS Bouw en Renovatie. FPS Bouw en Renovatie krijgt een eigen logo in dezelfde merkfamilie; de bestaande logo's van FPS Bouw, FPS Brandpreventie en FPS Onderhoud worden **niet** gewijzigd, nagemaakt of hertekend.

Per werkmaatschappij centraal beheren: logo, bedrijfsnaam, adres, telefoon, e-mail, website, KvK, BTW, IBAN, CAO (indien relevant), ondertekenaar, verwijzing naar algemene voorwaarden.

> **Bouwt voort op de Werkgever-entiteit (HRM Fase 1-basis).** Het per-werkmaatschappij centraal beheer (naam, CAO, logo/briefpapier, ondertekenaar, bedrijfsgegevens) sluit direct aan op de bestaande Werkgever-entiteit uit het parallelle HRM-spoor. Het Document Design System breidt die entiteit uit met de documentopmaak-/branding-velden; geen nieuwe parallelle bron van waarheid.

## Documentmotor

Alle modules gebruiken dezelfde documentmotor: Gebouwen, Projecten, Opleveringen, Onderhoud, HRM, DMS, Relaties. Het documenttype kiest automatisch de juiste templatefamilie, bijvoorbeeld: offerte → A, opleverrapport → A, arbeidsovereenkomst → B, tankpasovereenkomst → B, toolbox → C, LMRA → C.

## Belangrijke regels

- Geen logo's namaken of aanpassen; originele logo's gebruiken.
- Geen losse opmaak per document; alle documentopmaak centraal beheren.
- Versiebeheer ondersteunen.
- PDF-generatie ondersteunen.
- Later digitale ondertekening ondersteunen.
- Nieuwe documenttypes moeten later eenvoudig toegevoegd kunnen worden.

## Eerste oplevering (afgebakend)

Eerst alleen de **visuele basis en voorbeeldtemplates** met dummy-inhoud, om de documentstijl goed te krijgen vóórdat HRM-documenten, contracten en rapportages inhoudelijk gevuld worden:
1. Klantdocument — voorblad (familie A)
2. Klantdocument — inhoudspagina (familie A)
3. Klantdocument — hoofdstukpagina (familie A)
4. HRM/juridisch document — vervolgpagina (familie B)
5. Operationeel document — checklistpagina (familie C)

**Status: gebouwd (web preview, 13 juni 2026).** Herbruikbare documentcomponenten in `artifacts/firevault/src/components/documentopmaak/` (DocumentFrame met A4/print-opmaak, Familie A/B/C, gedeelde `resolveAssetUrl`) plus een previewpagina onder **Beheer › Documentopmaak** (`/beheer/documentopmaak`, gated op de systeem-bevoegdheid) waarin per werkmaatschappij én per template gewisseld kan worden. Nog dummy-content; geen DB/OpenAPI-wijziging. De branding-velden (`logoUrl`, `briefpapierUrl`, `klantLogoUrl`, `heroImageUrl`) zijn URL-veilig opgezet zodat ze later uit de Werkgever-entiteit gevoed kunnen worden zonder herschrijven. `DocumentFrame` clipt alleen full-bleed pagina's (`bleed`) en kan het pagina-einde per pagina uitzetten (`paginaEinde`) om een lege slotpagina te voorkomen.

## Afhankelijkheden & raakvlakken

- **V1.4 Opleverrapportage / V1.5 Rapportenmodule** — opleverrapporten vallen onder familie A; de documentmotor wordt de gedeelde opmaaklaag voor de live `print.tsx`-rapportage en de latere gepersisteerde rapporten. De documentmotor is daarmee een logische fundering vóór of samen met V1.4/V1.5. **Integratie-light gebouwd (17 juni 2026):** `print.tsx` haalt zijn asset-URL's (logo, gevelbeeld, spotfoto's, plattegronden) nu via de gedeelde `resolveAssetUrl` op — functioneel identiek (byte-identieke URL's voor alle reële invoer). Het voorblad gebruikte al de Familie A-merktokens (#F23B0D + slate `#0f172a`), dus visueel is het al uitgelijnd; de zwaardere frame-overname (`DocumentFrame`/voorblad-component) is bewust uitgesteld om de fijn afgestelde print-/`html2canvas`-export en auto-print-gereedheid niet te regressen.
- **DMS / Documentenbibliotheek (gebouwd)** — gegenereerde documenten landen als revisies in het DMS; versiebeheer en bevriezing sluiten aan op de bestaande documentrevisies.
- **HRM / Personeel (parallel spoor)** — familie B levert de juridische/HRM-documenten; bouwt op de Werkgever-entiteit.
- **Digitale ondertekening** — bewust als latere uitbreiding belegd (familie B is daar qua opmaak op voorbereid), niet in de eerste oplevering.

## Bekend openstaand punt — koptekst_positie / marge_boven

De huisstijl-voorstel-flow op Documentopmaak (accepteren/wijzigen/verwerpen van velden uit een geüpload referentiedocument) slaat `koptekst_positie` en `marge_boven` wél op in de Werkgever-entiteit, maar `DocumentFrame`/`WerkmaatschappijInfo` passen ze nog niet visueel toe: er is nog geen gedeelde kopregel-component om de positie op toe te passen, en `marge_boven` raakt de bleed-paginakoppen (voorblad/hoofdstukpagina) die bewust ongemoeid zijn gelaten om de bestaande opmaak niet te regressen. De overige huisstijlvelden (adres, voettekst, IBAN, marge onder/links/rechts, kleur, enz.) worden wél opgeslagen én direct zichtbaar in de A4-preview. De dialoog toont hierbij expliciet "Wordt opgeslagen, nog niet zichtbaar in preview" op deze twee velden. Verdieping (gedeelde kopregel-component + bleed-veilige marge-toepassing) volgt in een later increment.

## Ontwikkelstop — opgeheven (13 juni 2026)

De Ontwikkelstop is opgeheven; per-fase formeel akkoord vooraf is niet meer vereist (zie [`replit.md`](../../replit.md)). De eerste oplevering (visuele basis + vijf voorbeeldtemplates met dummy-content) is als eerste increment **gebouwd** en is beoordeelbaar in de preview. Als tweede increment is de **integratie-light in `print.tsx`** gebouwd (gedeelde `resolveAssetUrl`; zie het raakvlak V1.4/V1.5 hierboven). De verdieping — PDF-generatie, latere digitale ondertekening en per-werkmaatschappij centraal beheer bovenop de Werkgever-entiteit — volgt in latere increments.

## Versiebeheer Document Studio-modellen — gebouwd (8 juli 2026)

Op Beheer › Documentopmaak › Document Studio (`/organisatie/studio`) is versiebeheer voor de per-werkgever/documenttype `connect_template_json`-modellen gebouwd:
- Exact één ACTIEF (`goedgekeurd`) model per (werkgever, documenttype), afgedwongen met een partiële unieke index in de database.
- Een nieuwe upload maakt altijd een nieuw CONCEPT-model; AI (genereren/bijstellen) werkt alleen op concepten — de server wijst dit server-side af (409) zodra het model al `goedgekeurd` of `gearchiveerd` is, dus een goedgekeurd model kan niet per ongeluk overschreven worden via een API-aanroep.
- Expliciet goedkeuren archiveert het huidige actieve model (met tijdstempel) en activeert het nieuwe; niets wordt verwijderd of overschreven.
- Volledige versiegeschiedenis blijft zichtbaar en is terug te zetten: een "Versiegeschiedenis"-knop per documenttype-kaart toont alle versies (concept/goedgekeurd/gearchiveerd) met tijdstempels; "Terugzetten" op een gearchiveerde versie hergebruikt dezelfde goedkeuren-actie (archiveert het huidige actieve model, activeert de gekozen versie onder een nieuw, hoger versienummer).
- Bestaande gegenereerde documenten (offertes) blijven gekoppeld aan de modelversie waarmee ze zijn aangemaakt (`offertes.studio_model_id`), zodat een latere modelwijziging of terugzetting hun inhoud niet met terugwerkende kracht verandert.
