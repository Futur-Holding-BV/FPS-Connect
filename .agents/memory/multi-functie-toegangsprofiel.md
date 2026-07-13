---
name: Multi-functie toegangsprofiel (HRM functie → Connect-rechten)
description: Ontwerp van de 4-increment feature die functies aan toegangsprofielen koppelt zodat een medewerker met meerdere functies additief de gecombineerde rechten krijgt.
---

Doel: een medewerker kan meerdere functies hebben; elke functie draagt een standaard toegangsprofiel; de Connect-rechten worden additief afgeleid uit alle functies + handmatige extra rechten (hoogste niveau per module).

Productkeuzes: Keuze 1 = A (additief; NIET "hoogste rol wint"-vervanging). Keuze 2 = Nee (AI-adviseur blijft intern in Connect voor beheerder+monteur; klant-layout ongemoeid).

Increments:
- 1 (gedaan): Profiel-bewerken toont/bewerkt meerdere functies via bestaande aanstellingen-M2M (alleen frontend, personeel/detail.tsx).
- 3 (gedaan): functies.profiel_id (nullable FK -> profielen, ON DELETE SET NULL). OpenAPI Functie/FunctieInput; backend mapFunctie/POST/PATCH (PATCH alleen bij meegestuurd); frontend Toegangsprofiel-dropdown in functiehuis-form (personeel/index.tsx). Additief; verandert nog GEEN runtime-rechten.
- 4 (volgende, RISICOVOL — eigen test + architect): PermissieService (artifacts/api-server/src/lib/permissie-service.ts) leidt rechten af uit gebruiker_profielen + functie-afgeleide profielen; combineerBevoegdheden bestaat al (max-per-module, lib/permissies/src/index.ts); sync in tx bij medewerker<->functie-wijziging (medewerkersTable.functieId); audit via logAudit (lib/audit.ts).

**Why increment 4 apart:** het koppelen wordt daar een privilege-escalatie-oppervlak (een personeel-writer die zichzelf/zijn functie een systeem-profiel toekent). Verplicht: zelf-escalatiecheck.

Gotcha (increment 3): de profielenlijst (GET /profielen) wordt door TWEE modules gelezen — gebruikersbeheer EN personeelsbeheer (functiehuis). Gate = requireEnigeBevoegdheid([["gebruikers",1],["personeel",1]]); niet terug-versmallen naar alleen gebruikers, anders krijgt een personeelsbeheerder een lege dropdown en kan hij ongemerkt een profiel wissen.

Increment 4 open punt (architect-advies): overweeg profiel_id-bestaanvalidatie (400/422 i.p.v. FK-500) bij POST/PATCH /functies.
