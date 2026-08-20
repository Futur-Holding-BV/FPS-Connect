# Aanvulling – Nieuw boekjaar en jaarafsluiting

Bouw binnen de crediteurenmodule ondersteuning voor boekjaren.

Iedere factuur krijgt verplicht:

* boekjaar
* boekperiode / maand
* factuurdatum
* betaaldatum
* boekingsdatum
* btw-periode
* status boekjaar: open / afgesloten

Het boekjaar wordt automatisch bepaald op basis van de boekingsdatum, niet alleen op basis van de betaaldatum.

Voorbeeld:

Een factuur uit december 2026 die pas in januari 2027 wordt betaald, hoort administratief nog bij boekjaar 2026 wanneer de kosten betrekking hebben op 2026.

Maak daarom onderscheid tussen:

* factuurdatum
* betaaldatum
* boekingsdatum
* periode waarop de kosten betrekking hebben

Bij de start van een nieuw boekjaar maakt Connect automatisch een nieuw boekjaar aan, bijvoorbeeld 2027.

Het oude boekjaar blijft beschikbaar voor correcties zolang het nog niet definitief is afgesloten.

Statussen boekjaar:

* Lopend
* Voorlopig afgesloten
* Definitief afgesloten

Bij definitief afgesloten boekjaar:

* facturen mogen niet meer worden aangepast
* alleen beheerders mogen correctieboekingen voorstellen
* AI mag signaleren, maar niet automatisch wijzigen

Dashboard per boekjaar:

* openstaande facturen
* betaalde facturen
* kosten per categorie
* kosten per leverancier
* btw-overzicht
* nog te controleren facturen
* facturen zonder juiste koppeling
* mogelijke ontbrekende facturen
* afwijkingen t.o.v. vorig boekjaar

AI moet bij jaarovergang controleren:

* ontbreken er terugkerende facturen?
* zijn er decemberfacturen die pas in januari zijn binnengekomen?
* zijn er dubbele facturen?
* zijn er kosten verkeerd geboekt in het nieuwe boekjaar?
* zijn er abonnementen of leasefacturen gewijzigd?
* zijn er facturen zonder grootboekrekening of kostenplaats?

Belangrijk:

Een nieuw boekjaar mag geen nieuw losstaand archief worden.

Alle jaren blijven onderdeel van één doorzoekbare financiële administratie.

De gebruiker moet eenvoudig kunnen filteren op boekjaar, maand, leverancier, categorie, werkmaatschappij, kostenplaats en betaalstatus.
