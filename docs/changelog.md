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

