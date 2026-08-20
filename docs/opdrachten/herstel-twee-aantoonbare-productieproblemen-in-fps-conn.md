Herstel twee aantoonbare productieproblemen in FPS Connect.

Voor FPS Connect bestaat maar één werkelijkheid:
https://connect.fps-one.nl

Probleem 1 – scrollen
Op lange pagina’s blijft de vaste onderbalk content, knoppen en onderste regels bedekken. De eerdere correctie heeft in productie niets veranderd.

Probleem 2 – nieuwe medewerker
Een nieuwe medewerker kan nog steeds vanaf drie verschillende plekken worden toegevoegd. Er moet nog maar één centrale ingang bestaan.

Werkwijze:
1. Onderzoek eerst read-only welke routes, layouts en componenten op connect.fps-one.nl werkelijk actief zijn.
2. Leg vast waarom de eerdere scrollcorrectie geen zichtbaar effect heeft.
3. Herstel het scrollprobleem centraal in de gedeelde applicatielayout, niet met losse paginacorrecties.
4. Houd rekening met de werkelijke hoogte van de vaste onderbalk, inclusief mobiel en desktop.
5. Controleer minimaal Dashboard, Projecten/Gebouwen, HRM en een lange detailpagina.
6. Kies één centrale route voor “Nieuwe medewerker”.
7. Verwijder of vervang de andere twee ingangen door een verwijzing naar diezelfde centrale route.
8. Zorg dat gebruikers niet meer in verschillende formulieren of workflows terechtkomen.
9. Wijzig geen login-, autorisatie-, sessie- of databasegedrag.
10. Maak eerst een reproduceerbare test voor beide fouten.
11. Voer typecheck, build, tests en routecontrole uit.
12. Lever wijzigingen alleen via de normale GitHub-main- en productie-deploymentstraat.

Acceptatiecriteria op https://connect.fps-one.nl:
- alle content en knoppen zijn volledig bereikbaar door te scrollen;
- niets verdwijnt achter de vaste onderbalk;
- er bestaat nog maar één functionele ingang voor “Nieuwe medewerker”;
- alle zichtbare knoppen of links openen exact dezelfde centrale onboardingroute;
- bestaande medewerkers en gegevens blijven ongewijzigd;
- inloggen blijft werken.

Meld pas gereed na controle in productie.

Eindmelding:
Opgelost: scrollen werkt volledig en nieuwe medewerkers worden via één centrale ingang toegevoegd.