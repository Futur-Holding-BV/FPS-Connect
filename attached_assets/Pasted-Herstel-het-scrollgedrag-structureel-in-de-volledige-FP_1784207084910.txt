Herstel het scrollgedrag structureel in de volledige FPS Connect-applicatie en zorg dat vaste onderbalken, taakbalken, footers en andere vaste elementen nooit meer content bedekken.

DE ENIGE WERKELIJKE OMGEVING

Voor FPS Connect bestaat maar één echte en geldige werkelijkheid:

https://connect.fps-one.nl

Replit preview, localhost, development, staging, testomgevingen, checkpoints, taakbranches en losse builds zijn uitsluitend technische hulpmiddelen.

Een functie is pas gebouwd, opgelost en gereed wanneer deze daadwerkelijk werkt op connect.fps-one.nl.

VASTGESTELD PROBLEEM

Op meerdere pagina’s kan de gebruiker technisch wel scrollen, maar het onderste deel van de pagina blijft verborgen achter een vaste taakbalk of onderbalk.

Daardoor zijn onder andere:

- laatste documenten
- onderste invoervelden
- opslaan-knoppen
- actieknoppen
- tabellen
- lijsten
- formulieren
- modals
- detailinformatie

niet volledig bereikbaar.

Dit probleem komt applicatiebreed voor en mag niet per pagina met losse CSS-hacks worden opgelost.

De eerdere scrollfix was onvoldoende, omdat vooral is gekeken naar:

- overflow
- h-screen
- min-h-0
- flex-containers
- nested scrollcontainers

maar onvoldoende naar de daadwerkelijke vaste taakbalk of onderbalk die over de content heen ligt.

DOEL

Herstel het algemene layout- en scrollsysteem van FPS Connect zodat:

- iedere pagina volledig tot onderaan bereikbaar is
- geen vaste onderbalk content bedekt
- de hoofdcontent automatisch rekening houdt met de werkelijke hoogte van vaste elementen
- dit werkt op desktop, tablet en mobiel
- dit werkt bij browserzoom en kleinere schermhoogtes
- dit werkt bij dynamisch groeiende content
- dit werkt in alle modules en routes

ONDERZOEK DE WERKELIJKE OORZAAK

Onderzoek applicatiebreed minimaal:

- de hoofdapplicatielayout
- de algemene contentwrapper
- de vaste taakbalk onderaan
- eventuele mediaspeler-, nieuws- of statusbalken
- vaste footers
- vaste navigatie
- modals
- drawers
- sidebars
- sticky elementen
- body- en html-scroll
- route-specifieke layouts
- tabbladen
- formulieren
- detailpagina’s
- documentlijsten
- tabellen
- chat
- HRM
- gebouwen
- projecten
- CRM
- planning
- calculaties
- offertes
- onderhoud
- DMS
- gebruikersbeheer
- Slim Upload
- Document Studio
- alle overige modules

Controleer specifiek:

- of de vaste onderbalk met position: fixed of sticky over de content heen ligt
- of de hoofdcontent geen of te weinig padding-bottom heeft
- of de hoogte van de onderbalk hardcoded of verkeerd berekend is
- of 100vh wordt gebruikt zonder aftrek van vaste elementen
- of calc(100vh - ...) onjuist is
- of mobiele browserbalken de viewporthoogte verkeerd beïnvloeden
- of de scrollbar eindigt terwijl content nog achter de vaste balk staat
- of body of html overflow-hidden gebruikt
- of een modal na sluiten body-scroll geblokkeerd laat
- of meerdere scrollcontainers elkaar blokkeren
- of contentcontainers geen min-h-0 of flex-1 hebben
- of dynamisch geladen inhoud buiten de berekende hoogte valt
- of browserzoom content afsnijdt
- of de fout alleen op bepaalde routes voorkomt
- of dezelfde vaste onderbalk verschillende hoogtes heeft op desktop en mobiel

STRUCTURELE OPLOSSING

Bouw één centrale oplossing in het algemene layout-systeem.

Gebruik geen losse paginafixes.

Zorg dat de applicatie centraal weet:

- welke vaste elementen actief zijn
- wat hun werkelijke hoogte is
- hoeveel veilige onderruimte de content nodig heeft
- hoe de beschikbare viewporthoogte moet worden berekend

Gebruik waar passend:

- CSS custom properties
- dynamische meting van de onderbalkhoogte
- ResizeObserver
- veilige bottom padding
- min-height: 0
- flex: 1
- overflow-y: auto
- correcte viewport units
- dvh of svh waar nodig
- consistente layout-wrappers
- één centrale scrollcontainer

De onderruimte moet dynamisch meegroeien wanneer:

- de onderbalk hoger wordt
- tekst over meerdere regels loopt
- mobiel formaat wordt gebruikt
- browserzoom verandert
- een extra statusbalk verschijnt
- een mediaspeler of nieuwsstrip actief is

Voorkom vaste pixelhacks wanneer de werkelijke hoogte dynamisch kan veranderen.

GEWENSTE GEDRAG

Zorg dat:

- alle pagina’s volledig tot onderaan kunnen scrollen
- de laatste regel content altijd boven de vaste onderbalk uitkomt
- onderste knoppen volledig zichtbaar en klikbaar blijven
- tabellen volledig bereikbaar zijn
- documenten onderaan lijsten bereikbaar blijven
- modals intern correct scrollen
- de onderliggende pagina niet ongewenst meescrolt bij een open modal
- body-scroll na sluiten van een modal correct wordt hersteld
- chatinvoer zichtbaar blijft
- lange formulieren volledig bruikbaar blijven
- sticky headers geen content bedekken
- er geen ongewenste horizontale scroll ontstaat
- korte pagina’s geen overdreven lege ruimte krijgen
- lange pagina’s voldoende dynamische onderruimte krijgen
- mobiel landscape en portrait correct werken
- browserzoom van minimaal 80% tot 200% correct blijft functioneren

GEEN LOKALE HACKS

Voeg geen tijdelijke oplossing toe zoals:

- extra lege divs
- willekeurige vaste pixels onderaan
- een uitzondering alleen voor HRM
- een uitzondering alleen voor gebouwen
- een uitzondering voor één gebruiker
- een oplossing alleen voor één tabblad
- browser-specifieke noodcode zonder structurele oorzaak op te lossen
- meerdere verschillende scrollsystemen per module

De oplossing moet centraal, generiek en herbruikbaar zijn.

PRODUCTIETEST

Test uitsluitend en rechtstreeks op:

https://connect.fps-one.nl

Voer minimaal deze productiecontroles uit:

1. Open een lang personeelsdossier.
2. Scroll tot het allerlaatste onderdeel.
3. Controleer dat het laatste document volledig zichtbaar is.
4. Controleer dat download- en verwijderknoppen bereikbaar zijn.
5. Open een gebouwdetailpagina met veel inhoud.
6. Scroll tot de allerlaatste kaart of sectie.
7. Controleer dat geen inhoud achter de vaste onderbalk verdwijnt.
8. Open gebruikersbeheer.
9. Open een lang gebruikersformulier.
10. Controleer dat de onderste opslaan-knop volledig zichtbaar is.
11. Open chat.
12. Controleer dat het invoerveld volledig zichtbaar en bruikbaar blijft.
13. Open Slim Upload.
14. Controleer dat de volledige uploadwachtrij bereikbaar is.
15. Open Document Studio.
16. Controleer dat lange documentlijsten volledig bereikbaar zijn.
17. Open CRM-detailpagina’s.
18. Open planning.
19. Open calculaties.
20. Open offertes.
21. Open onderhoud.
22. Open DMS.
23. Open meerdere modals.
24. Sluit de modals en controleer dat scrollen blijft werken.
25. Wissel tussen tabbladen.
26. Controleer opnieuw het scrollgedrag.
27. Test op een kleiner desktopvenster.
28. Test op mobiel formaat.
29. Test in landscape.
30. Test met verhoogde browserzoom.
31. Test met verlaagde browserzoom.
32. Controleer dat korte pagina’s geen onnodig grote lege ruimte krijgen.
33. Controleer dat er geen horizontale scroll ontstaat.
34. Controleer dat de vaste onderbalk altijd zichtbaar blijft zonder content te bedekken.
35. Controleer dat de volledige pagina overal bereikbaar blijft.

CONTROLE VAN BESTAANDE FIXES

Controleer welke eerdere scrollwijzigingen al in GitHub main en productie staan.

Hergebruik correcte delen.

Verwijder of herstel foutieve of dubbele layoutlogica.

Voorkom:

- tweede scrollcontainer naast de bestaande
- dubbele bottom padding
- conflicterende overflow-regels
- verschillende oplossingen per route
- regressie van chatlayout
- regressie van modals
- regressie van mobiele navigatie
- regressie van de nieuwe medewerkerwizard
- overschrijving van nieuwere commits

Gebruik altijd de actuele GitHub main als basis.

Neem nooit een oudere lokale Replit-versie als uitgangspunt.

VOLTOOIINGSCRITERIUM

Niet afronden met alleen:

- diagnose
- plan
- CSS-wijziging
- typecheck
- build geslaagd
- checkpoint
- Ready for review
- commit
- merge
- deployment gestart
- test in Replit
- verwachte werking

Verwerk de volledige oplossing in GitHub main.

Voer de productie-deployment uit.

Controleer de volledige werking rechtstreeks op connect.fps-one.nl.

Alleen connect.fps-one.nl geldt als werkelijkheid, testomgeving en eindresultaat.

De opdracht is pas opgelost wanneer op connect.fps-one.nl aantoonbaar geldt:

- alle lange pagina’s kunnen volledig tot onderaan worden gescrold
- geen enkele vaste onderbalk bedekt nog content
- alle onderste knoppen, documenten en velden zijn bereikbaar
- dit werkt applicatiebreed op desktop, tablet en mobiel

De gewenste eindmelding is uitsluitend:

Opgelost: alle pagina’s in FPS Connect zijn volledig scrollbaar en vaste onderbalken bedekken geen content meer op connect.fps-one.nl.

Geef alleen aanvullende uitleg wanneer het probleem niet volledig opgelost kon worden.