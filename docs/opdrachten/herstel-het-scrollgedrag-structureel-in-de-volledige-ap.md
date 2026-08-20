Herstel het scrollgedrag structureel in de volledige applicatie, uitsluitend in de enige echte en geldige omgeving:

https://connect.fps-one.nl

Voor FPS Connect bestaat maar één werkelijkheid en dat is connect.fps-one.nl.

Replit preview, localhost, development, staging, testomgevingen, checkpoints en losse builds zijn uitsluitend technische hulpmiddelen en gelden nooit als eindresultaat.

Vastgesteld probleem:

Op meerdere plekken in FPS Connect kan niet volledig omlaag worden gescrold. In personeelsdossiers is dit duidelijk zichtbaar, maar het probleem moet applicatiebreed worden onderzocht en opgelost.

Het doel is dat in de volledige applicatie alle pagina’s, dossiers, tabbladen, lijsten, formulieren, modals en detailvensters altijd volledig bereikbaar zijn, ongeacht de hoeveelheid inhoud, schermgrootte of browserzoom.

Onderzoek en herstel het scrollgedrag generiek in de volledige frontend.

Controleer minimaal:

- de hoofdapplicatielayout
- beheerder-layouts
- algemene contentcontainers
- pagina-wrappers
- modals en drawers
- vaste headers
- vaste footers
- zijmenu’s
- tabs
- detailpagina’s
- formulieren
- lange lijsten
- tabellen
- dossiers
- documentoverzichten
- chat
- uploadwachtrijen
- gebouwen
- projecten
- CRM
- HRM
- offertes
- calculaties
- planning
- onderhoud
- DMS
- instellingen
- gebruikersbeheer
- alle overige modules

Controleer structureel op:

- overflow-hidden
- overflow-auto
- overflow-y-auto
- vaste hoogtes
- max-height
- min-height
- calc(100vh - ...)
- h-screen
- min-h-0
- flex-1
- nested scrollcontainers
- body-scroll locking
- html- en body-overflow
- sticky headers en footers
- absolute en fixed positioning
- modals die scroll blokkeren
- tabwissels die scrollposities verkeerd vasthouden
- content die buiten de berekende hoogte valt
- browserzoom
- kleinere schermhoogtes
- mobiel formaat
- landscapeweergave
- dynamisch groeiende inhoud
- lazy-loaded content
- lijsten die na laden langer worden
- browser-specifieke afwijkingen

Onderzoek specifiek of:

- een bovenliggende applicatiecontainer overflow-hidden gebruikt
- html of body blijvend op overflow-hidden blijft staan
- een modal of drawer na sluiten de body-scroll niet herstelt
- meerdere geneste scrollcontainers elkaar blokkeren
- contentcontainers geen min-h-0 of flex-1 hebben
- een vaste header of footer de onderste inhoud bedekt
- viewporthoogte onjuist wordt berekend
- mobiele browserbalken de hoogteberekening verstoren
- de layout op sommige routes anders wordt opgebouwd
- eerdere fixes alleen lokaal of in Replit zijn verwerkt
- productie nog oude layoutcode draait

Herstel dit centraal in het algemene layout- en scrollsysteem.

Voeg geen tijdelijke of lokale hacks toe zoals:

- extra lege ruimte onderaan
- vaste pixels toevoegen
- een oplossing alleen voor personeelsdossiers
- een oplossing alleen voor één tabblad
- een uitzondering voor één gebruiker
- losse CSS-fixes per pagina terwijl de algemene oorzaak blijft bestaan
- browser-specifieke noodoplossingen zonder de structurele oorzaak te herstellen

Zorg dat:

- iedere pagina volledig tot onderaan bereikbaar is
- lange pagina’s correct scrollen
- korte pagina’s geen onnodige lege ruimte krijgen
- vaste headers en footers geen inhoud bedekken
- modals intern correct scrollen
- de onderliggende pagina niet ongewenst meescrolt wanneer een modal open is
- de pagina na sluiten van een modal weer normaal scrollt
- tabwissels het scrollgedrag niet blokkeren
- dynamisch geladen inhoud bereikbaar blijft
- tabellen en lijsten volledig zichtbaar zijn
- download-, verwijder-, opslaan- en actieknoppen onderaan bereikbaar blijven
- desktop en mobiel correct functioneren
- browserzoom geen inhoud afsnijdt
- bestaande functionaliteit niet wordt beschadigd

Test rechtstreeks op:

https://connect.fps-one.nl

Voer minimaal deze productiecontroles uit:

1. Open een lang personeelsdossier en scroll tot het allerlaatste onderdeel.
2. Open een dossier met veel documenten en bereik het laatste document.
3. Open gebruikersbeheer en bereik de onderste knoppen.
4. Open een lang formulier en bereik de opslaan-knop.
5. Open chat en controleer dat invoerveld en onderste inhoud bereikbaar blijven.
6. Open Slim Upload en controleer de volledige uploadwachtrij.
7. Open gebouwen en projecten met veel inhoud.
8. Open CRM-detailpagina’s.
9. Open offerte- en calculatiepagina’s.
10. Open planning en onderhoudspagina’s.
11. Open en sluit meerdere modals en controleer dat scrollen daarna blijft werken.
12. Wissel tussen tabbladen en controleer het scrollgedrag opnieuw.
13. Test met een kleiner desktopvenster.
14. Test op mobiel formaat.
15. Test met verhoogde browserzoom.
16. Controleer dat geen onderste knoppen of content meer worden afgesneden.
17. Controleer dat geen onbedoelde horizontale scroll ontstaat.
18. Controleer meerdere routes en modules, niet alleen HRM.

Niet afronden met alleen:

- diagnose
- codewijzigingen
- typecheck
- build geslaagd
- checkpoint
- Ready for review
- commit
- merge
- deployment gestart
- verwachte werking

Verwerk de oplossing in GitHub main, voer de productie-deployment uit en controleer het scrollgedrag rechtstreeks op connect.fps-one.nl.

Meld de opdracht pas gereed wanneer aantoonbaar is vastgesteld dat scrollen applicatiebreed correct werkt op connect.fps-one.nl.

De gewenste eindmelding is uitsluitend:

Opgelost: scrollen werkt nu correct in de volledige applicatie op connect.fps-one.nl.

Geef alleen aanvullende uitleg wanneer het probleem niet volledig opgelost kon worden.