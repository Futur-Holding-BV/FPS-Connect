IMPLEMENTEER UITSLUITEND DE DRIELEDIGE KEUZE BIJ GEBRUIKERSAANMAAK 
VOOR INTERNE PROFIELEN. GEEN ANDERE WIJZIGINGEN.

Zie docs/OMGEVINGSBEWUSTZIJN.md.

ACHTERGROND
Bestaande specificatie (attached_assets, spec #10, nog nooit 
geïmplementeerd — geverifieerd in POST /gebruikers, artifacts/
api-server/src/routes/gebruikers.ts): het aanmaken van een gebruiker 
met een intern profiel (Monteur, Uitvoerder, Werkvoorbereider, 
Projectleider, HR, Financieel, Controleur) leidt nu niet automatisch 
tot het starten van medewerker-onboarding. Losstaand ontstaat alleen 
een inlogaccount, zonder medewerkerdossier.

FASE 1 — FRONTEND: keuze tonen
Bij het aanmaken van een gebruiker met een intern profiel (rol/profiel 
uit de genoemde lijst), toon na het invullen van de basisgegevens de 
vraag: "Wil je voor deze gebruiker ook een medewerkerdossier en 
onboarding starten?" met drie opties:
1. Alleen gebruikersaccount aanmaken (extern/klant/leverancier/
   tijdelijke toegang)
2. Gebruiker + medewerkerdossier aanmaken (interne medewerker, 
   geen volledige onboardingflow)
3. Gebruiker + medewerkerdossier + onboarding starten (nieuwe 
   medewerker, volledige flow)

Bij externe profielen (klant, leverancier) deze vraag niet tonen — 
optie 1 is dan impliciet.

FASE 2 — KOPPELING AAN BESTAANDE ONBOARDING
Bij keuze 2 of 3: gebruik de bestaande POST /medewerkers/onboarding-
route met de zojuist aangemaakte gebruiker_id — bouw geen tweede, 
parallelle route voor medewerker-aanmaak. Bij keuze 3: navigeer direct 
door naar het bestaande onboardingscherm (personeel/onboarden.tsx) 
met gebruiker_id vooringevuld. Bij keuze 2: maak het medewerkerdossier 
aan met de minimaal vereiste velden (naam, email, functie_id, 
werkmaatschappij, cao, dienstverband — overgenomen uit het reeds 
bestaande gebruikersformulier waar mogelijk) zonder de volledige 
onboardingflow te forceren.

FASE 3 — NIET RAKEN
- Geen wijziging aan de bestaande POST /medewerkers/onboarding-logica 
  zelf;
- Geen wijziging aan externe/klant-gebruikersaanmaak;
- De bestaande dienstverband/bedrijf_uitzendbureau-velden op zowel 
  gebruikers als medewerkers blijven ongewijzigd in deze taak — dat 
  is een apart, later punt (twee losse bronnen voor hetzelfde gegeven, 
  niet in deze scope oplossen).

TESTEN
Test alle drie keuzes end-to-end: (1) alleen account, geen 
medewerkerdossier ontstaat; (2) account + dossier, geen onboardingflow 
geopend; (3) account + dossier + onboardingscherm geopend met 
gebruiker_id correct vooringevuld.

ACCEPTATIE
- de keuze verschijnt alleen bij interne profielen, niet bij externe;
- alle drie paden werken aantoonbaar zoals hierboven beschreven;
- geen dubbele/parallelle medewerker-aanmaakroute toegevoegd — 
  bestaande POST /medewerkers/onboarding wordt hergebruikt.

LEVER
- gewijzigde bestanden (diff);
- screenshot van de drieledige keuze;
- bevestiging (met voorbeeld) van alle drie paden end-to-end;
- commit-hash zodra gedeployed naar productie.