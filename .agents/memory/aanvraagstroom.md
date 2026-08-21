---
name: Aanvraagstroom
description: Prijsaanvraag per mail → AI-voorstel → mens bevestigt → lege opname en modulaire calculatie; ontwerpregels en valkuilen.
---

# Aanvraagstroom

## Kernregels (hard, uit de opdracht)
- Een gebouw-/projectstart heeft exact vier gegevensgroepen nodig: volledige opdrachtgever-NAW, project-/gebouwnaam, opdrachtomschrijving en volledige gebouw-/project-NAW. Contactpersoon en werkmaatschappij zijn geen extra startpoorten. **Why:** extra verplichte velden veroorzaken dubbele of te vroege uitvraag. **How to apply:** vraag vervolggegevens pas in de processtap die ze gebruikt en behandel de werkmaatschappij op een bestaand voorstel als onveranderlijke broncontext.
- Er ontstaat in dit proces NOOIT een project. Project ontstaat uitsluitend bij offerte-ondertekening (`routes/portaal.ts`). `POST /projecten` is daarom verwijderd (→ 404).
- Nooit stille aanmaak: accorderen zonder klant-bevestiging → 422; nieuwe relatie/gebouw alleen via expliciete velden (`nieuwe_klant`/`nieuw_gebouw`); nieuwe relatie = status `prospect`.
- Meerwerk vereist een expliciet gekozen lopende opdracht (`gerelateerd_project_id`), anders 422.
- Geen automatische mail: conceptantwoord staat klaar; mens verstuurt via `verstuur-antwoord` (reply op bronmail via werk-inbox Graph, 409 bij dubbel).

## Architectuurkeuzes
- **Why:** hergebruik FACTUUR_02-patronen zodat er één bewakings-/signaleringsmodel is. Signalen gaan in `factuur_signalen` (types `aanvraag_antwoord_te_laat`, `aanvraag_niet_opgepakt`, + `ai_onzeker` zonder factuur_id) met `projectkans_id`-kolom; bewaking draait mee in de bestaande 15-minutenlus.
- CRM-gebruikers zien/afhandelen aanvraag-signalen via `GET/POST /aanvragen/signalen` (crm-bevoegdheid); `/facturen/signalen` blijft financieel. Signaal-endpoints filteren op aanvraag-types — nooit alle signalen exposen onder crm.
- Reactieklok start bij binnenkomst van de mail (`binnengekomen_op` op de kans), grenzen instelbaar in `app_instellingen` (reactie 24u, oppak 72u; 1–720, via Info-pagina).
- BV-namen: `FPS_BEDRIJVEN` in `lib/db/src/schema/crm.ts` = "FPS Bouw/Brandpreventie/Onderhoud" ZONDER "BV" (factuurstroom `BV_NAMEN` heeft ze mét "BV" — bewust verschillend, niet gelijktrekken zonder migratie).

## Valkuilen / lessen
- **Upload-idempotentie hoort in PostgreSQL, niet alleen in een vroege lookup**: identificeer op exacte bronbytes en schrijf alle intakegegevens in één transactie; databasebibliotheken kunnen de onderliggende conflictcode verpakken. **Why:** twee gelijktijdige uploads passeren dezelfde lookup en kunnen anders dubbele intakegegevens achterlaten. **How to apply:** laat de database de race beslissen en vertaal uitsluitend het bedoelde conflict naar een herkenbare dubbelmelding.
- **Een gekozen bijlage is pas een AI-bron als de hele keten klopt.** **Why:** een bestandskiezer kan bijlagen tonen terwijl het gegenereerde multipartcontract ze niet verstuurt, of de server ze wel opslaat maar hun tekst niet aan de bewijsbundel toevoegt. **How to apply:** test apart dat alle bestanden in FormData staan én dat een letterlijk citaat uit geëxtraheerde bijlagetext de bronvalidatie doorstaat.
- **Bestandsopslag buiten een databasetransactie vereist request-eigen paden en compensatie.** **Why:** bij een latere fout blijven anders wezenloze bestanden achter; gedeelde contentpaden opruimen kan juist de winnende race of een eerdere intake beschadigen. **How to apply:** registreer elk verwacht pad vóór upload, verwijder alleen de eigen set bij iedere fout en draag de set pas na een geslaagde commit over.
- **Accepteren moet het voorstel als éérste transactiestap claimen** (conditionele update `status='open'→'geaccepteerd'` RETURNING). Eerst valideren en dan pas claimen geeft onder gelijktijdige verzoeken dubbele klanten/kansen. Race bewezen in stap I van `scripts/src/verificatie-aanvraagstroom.ts`.
- **Signaal-dedupe is database-atomair**: partiële unieke indexes op open signalen (type+factuur / type+kans / type+mail, in `apply-additive.mjs` mét voorafgaande duplicaat-opruiming) + `onConflictDoNothing` in `maakSignaal`. Select-then-insert alleen is niet genoeg bij parallelle bewakingsruns.
- Orval-codegen overschrijft `lib/api-zod/src/index.ts` met een extra `export * from './generated/types'` → TS2308; na elke codegen terugzetten naar alléén `export * from "./generated/api";`.
- Bewaking testen zonder api-server-endpoint: `pnpm --filter @workspace/api-server exec tsx -e "import('./src/services/aanvraagstroomService.ts').then(m=>m.draaiAanvraagBewaking())"` vanuit een script (werkt, tsx zit in de workspace).
