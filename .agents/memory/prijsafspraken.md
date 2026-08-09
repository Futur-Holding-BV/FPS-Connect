---
name: PRIJS_01 prijsafspraken & marktspiegel
description: Jaarprijzen/prijsafspraken, factuur-prijscontrole, bewakingsvoeder en marktspiegel — patronen en valkuilen
---

**Overlap-afdwinging in de database.** `prijsafspraken` heeft een EXCLUDE USING gist-constraint (btree_gist, WHERE teruggedraaid_op IS NULL) op leverancier+artikel+periode. POST geeft 409 mét de botsende regel. Nooit "stil oplossen" — alleen inkorten via /:id/beeindigen; prijsvelden zijn na aanmaak onwijzigbaar.
**Why:** §9 verbiedt overschrijven/overlap stil oplossen; DB-constraint maakt het onmogelijk óók voor toekomstige code.

**Rollback = markeren.** Import-terugdraaien zet `teruggedraaid_op`, verwijdert niets; alle geldigheids-queries filteren op `teruggedraaid_op IS NULL`. Cleanup in bewijsscripts moet teruggedraaide rijen dus hard deleten.

**Inkoop vs verkoop — de klassieke verwisseling.** Een prijsafspraak is een ÍNKOOPprijs. Het conceptregel-tarief in de calculatie is de VERKOOPprijs. Een subagent verving het tarief door de afspraakprijs → stil lagere offerte. Herkomst-velden heten daarom bewust `inkoop_bron`/`afgesproken_inkoopprijs`; het tarief blijft verkoopprijs.
**How to apply:** elke plek die "de afgesproken prijs gebruikt" moet expliciet de inkoopkant raken (catalogus-inkoopkolom, kostprijs), nooit klantprijzen.

**web_search_preview + JSON-mode = 400.** OpenAI weigert `text.format json_object` samen met web search ("Web Search cannot be used with JSON mode"). Patroon: geen format meegeven en het eerste `{...}`-blok uit het tekstantwoord knippen (services/marktspiegel.ts).

**Marktspiegel-garanties server-side.** Vergelijkingsregels zonder http-vindplaats_url worden weggegooid (nooit schatten); wisseladvies-taal wordt gefilterd + vaste weten-niet-wisselen-zin toegevoegd. Alleen op aanvraag (POST), nooit doorlopend; §7-werkbakitems verwijzen er alleen tekstueel naartoe.

**Factuurcontrole is een oordeel náást de stroom.** `dienIn` gebruikt objectType `factuur_prijsafwijking` (documentType blijft `prijsafwijking`): het echte factuur-objectType zou tijdens bevestig-inkoop weigeren én bij goedkeuring de factuurstatus ongewild doorzetten. Zonder beleidsregel: stil overslaan, nooit blokkeren. Cache in `facturen.prijscontrole` jsonb; factuurregels blijven altijd ongewijzigd. Route-volgorde: /facturen/prijscontrole/maandtotaal vóór /facturen/:id.

**Slim Upload → import-doorschakel.** Categorie prijslijst archiveert wél en geeft `doorschakeling` terug; frontend geeft de File door via in-memory stash (lib/prijslijst-import-stash.ts) naar /beheer/import?type=prijsafspraken. PDF-prijslijsten: advies "zet om naar Excel/CSV" (reguliere import-preview kan geen pdf).

**Maandkaart verbergt zich bij nul afwijkingen** (return null) — bewust rustig; testers zien hem alleen mét afwijkingen in de lopende maand.
