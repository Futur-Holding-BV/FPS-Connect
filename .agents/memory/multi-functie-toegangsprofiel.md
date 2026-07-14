---
name: Multi-functie toegangsprofiel (HRM functie → Connect-rechten)
description: Ontwerp van de 4-increment feature die functies aan toegangsprofielen koppelt zodat een medewerker met meerdere functies additief de gecombineerde rechten krijgt.
---

Doel: een medewerker kan meerdere functies hebben; elke functie draagt een standaard toegangsprofiel; de Connect-rechten worden additief afgeleid uit alle functies + handmatige extra rechten (hoogste niveau per module).

Productkeuzes: Keuze 1 = A (additief; NIET "hoogste rol wint"-vervanging). Keuze 2 = Nee (AI-adviseur blijft intern in Connect voor beheerder+monteur; klant-layout ongemoeid).

Increments:
- 1 (gedaan): Profiel-bewerken toont/bewerkt meerdere functies via bestaande aanstellingen-M2M (alleen frontend, personeel/detail.tsx).
- 3 (gedaan): functies.profiel_id (nullable FK -> profielen, ON DELETE SET NULL). OpenAPI Functie/FunctieInput; backend mapFunctie/POST/PATCH; frontend Toegangsprofiel-dropdown.
- 4 (GEDAAN — 14 juli 2026): PermissieService.laad() combineert opgeslagen matrix met functie-afgeleide profielen via haalFunctieBevoegdhedenVoorGebruiker() (nieuw bestand lib/functie-bevoegdheden.ts). Bron: medewerker.gebruikerId → medewerkersTable → (functieId + medewerkerAanstellingenTable.functieId) → functiesTable.profielId → profielenTable.bevoegdheden → combineerBevoegdheden. PATCH /gebruikers/:id voegt functie-bev NA escalatiecheck toe aan stored cache.

**Beveiliging increment 4:** functie-profielen toegevoegd NA zelf-escalatiecheck (systeemgekoppeld); PATCH /functies/:id had al escalatiecheck voor profiel_id-koppeling. Open punt: profiel_id-bestaanvalidatie (400 i.p.v. FK-500) bij POST/PATCH /functies.

**Open follow-up (stored cache sync):** medewerker PATCH + aanstelling PATCH triggeren geen resync van linked gebruiker. Stored cache wordt alleen bijgewerkt bij expliciet PATCH /gebruikers. Runtime (PermissieService) is altijd correct ongeacht stored cache.

Gotcha (increment 3): profielenlijst (GET /profielen) vereist requireEnigeBevoegdheid([[gebruikers,1],[personeel,1]]); niet terug-versmallen naar alleen gebruikers.

**UI-discrepantie:** GET /gebruikers/:id geeft stored bevoegdheden terug (zonder functie-bev); dialoog toont daardoor "Geen" voor functie-afgeleide modules. Toegang is correct; weergave is een follow-up.
