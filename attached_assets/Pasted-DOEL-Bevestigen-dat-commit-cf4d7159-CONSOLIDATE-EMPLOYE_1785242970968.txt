DOEL
Bevestigen dat commit cf4d7159 (CONSOLIDATE_EMPLOYEE_ONBOARDING) en 
3fb377d3 daadwerkelijk draaien op connect.fps-one.nl — niet alleen 
op GitHub main of in Replit.

BRONNEN VAN WAARHEID
- Productie: https://connect.fps-one.nl
- Repository: vinkrene-jpg/fps-one, branch main
- Verplicht: replit.md, docs/kwaliteitskader.md, docs/PRODUCTION_RUNBOOK.md

DO
1. Vergelijk GitHub-main SHA (huidige HEAD: cf4d7159) met de actieve 
   productie-SHA (via /api/healthz of het daadwerkelijke draaiende 
   image-label op de VPS).
2. Test op connect.fps-one.nl zelf, niet in Replit-preview:
   a. Instellingen > Gebruikers > Gebruiker toevoegen — bevestig dat 
      dit uitsluitend een technisch account aanmaakt, geen 
      medewerkerprofiel.
   b. Bevestig dat dit account verschijnt in HRM onder "Gebruikers 
      zonder medewerkerprofiel" (artifacts/firevault/src/pages/
      personeel/index.tsx).
   c. Klik "Onboarden" bij dat account — bevestig dat de wizard opent 
      met verplichte, vooringevulde userId.
   d. Rond de wizard af — bevestig exact één medewerkerprofiel wordt 
      aangemaakt, gekoppeld aan het bestaande account (niet een nieuw 
      account).
   e. Herhaal onboarding op hetzelfde account — bevestig HTTP 409.
   f. Roep de onboarding-route aan zonder userId of met een niet-
      bestaande userId — bevestig afwijzing (400/404), geen crash.
3. Bevestig scrollgedrag (data-bottom-bar, useBottomBarHeight, 
   --bottom-bar-hoogte) werkt op minstens twee pagina's met een vaste 
   onderbalk, rechtstreeks op connect.fps-one.nl.
4. Controleer /api/healthz reageert correct ná deze test.

DO NOT
- Geen wijziging aan onboarding-, gebruikers- of scrollcode in deze taak.
- Geen nieuwe route, dialoog, knop of workflow toevoegen.
- Geen hertest in Replit-preview als vervanging van de productietest.
- Geen oude Ready-for-review-taken over dit onderwerp toepassen zonder 
  aparte, expliciete instructie.

ACCEPTATIE (Definition of Done = productie-businessscenario)
- GitHub-main SHA en productie-SHA zijn gelijk, of het verschil is 
  expliciet verklaard;
- 2a t/m 2f zijn allemaal aantoonbaar bevestigd op connect.fps-one.nl 
  zelf, niet op typecheck/build alleen;
- scrollgedrag bevestigd op productie, niet opnieuw gebouwd.

LEVER
- commit-SHA van eventuele wijziging (verwacht: geen, dit is een 
  controletaak);
- GitHub-main SHA;
- actieve productie-SHA;
- resultaat van elke stap 2a–2f en 3, met screenshot of directe 
  output per stap;
- expliciete melding als iets NIET overeenkomt met de beschreven 
  flow — dan hier terugkoppelen vóórdat er iets gebouwd wordt.