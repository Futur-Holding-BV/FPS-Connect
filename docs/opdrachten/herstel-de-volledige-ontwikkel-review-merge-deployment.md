Herstel de volledige ontwikkel-, review-, merge-, deployment- en productiecontrole van FPS Connect.

Voor FPS Connect bestaat maar één operationele werkelijkheid:

https://connect.fps-one.nl

Replit workspace, Replit preview, localhost, development, staging, checkpoints, taakbranches en Ready for review zijn uitsluitend technische hulpmiddelen en gelden nooit als eindresultaat.

Het huidige probleem is structureel:

- Replit-taken blijven op Ready for review staan terwijl dezelfde wijziging al in GitHub main en productie aanwezig is.
- Replit kan daardoor opnieuw vragen om Apply changes to main version terwijl opnieuw toepassen onnodig of risicovol is.
- Taakstatus, GitHub-status, deploymentstatus en werkelijke productiestatus lopen niet betrouwbaar gelijk.
- Sommige wijzigingen worden alleen lokaal uitgevoerd.
- Sommige wijzigingen staan in GitHub maar niet in productie.
- Sommige wijzigingen staan al in productie terwijl Replit ze nog als onbeoordeeld toont.
- Een taak wordt soms als afgerond beschouwd zonder dat de werking op connect.fps-one.nl is gecontroleerd.
- Frontend, backend, database, environmentvariabelen en actieve containers kunnen daardoor verschillende versies of configuraties gebruiken.

Los dit structureel en generiek op.

DOEL

Maak één betrouwbare keten:

Replit-taak
→ actuele GitHub main
→ automatische productie-deployment
→ actieve productiecommit
→ functionele controle op connect.fps-one.nl
→ correcte taakstatus

Een wijziging mag maar één keer worden gemerged en gedeployed.

Een taak mag alleen Ready for review tonen wanneer de wijziging aantoonbaar nog niet in GitHub main staat.

Een taak mag alleen als opgelost worden gemeld wanneer de wijziging aantoonbaar op connect.fps-one.nl draait en daar functioneel is gecontroleerd.

FASE 1 — HUIDIGE KETEN CONTROLEREN

Onderzoek:

- hoe Replit-taakbranches worden gemaakt
- hoe checkpoints en commits worden opgeslagen
- hoe Apply changes to main version werkt
- hoe wijzigingen naar GitHub main worden gepusht
- hoe GitHub Actions deployments starten
- hoe de VPS de nieuwe commit ontvangt
- hoe Docker-containers of productieprocessen worden gebouwd en herstart
- hoe de actieve productiecommit wordt vastgesteld
- hoe Replit controleert of een taak al in main aanwezig is
- waarom Ready for review blijft staan nadat dezelfde wijziging al in main en productie staat
- waarom een taak opnieuw kan vragen om een reeds uitgevoerde merge

FASE 2 — ÉÉN BRON VAN WAARHEID

Gebruik GitHub main als enige geldige broncode voor productie.

Voor iedere taak moet automatisch worden gecontroleerd:

- welke commit de taak bevat
- of die commit of dezelfde wijziging al in GitHub main aanwezig is
- of de productiecommit deze wijziging al bevat
- of opnieuw mergen noodzakelijk is
- of opnieuw deployen noodzakelijk is

Gebruik hiervoor commit-SHA’s en inhoudelijke diff-controle.

Vertrouw niet alleen op de visuele Replit-taakstatus.

Wanneer een wijziging al volledig in GitHub main staat:

- mag Apply changes to main version niet meer worden aangeboden
- moet de taak automatisch als verwerkt worden gemarkeerd
- mag geen dubbele commit of tweede merge worden gemaakt

Wanneer dezelfde wijziging al in productie staat:

- mag geen nieuwe deployment worden gestart
- moet de taakstatus automatisch worden bijgewerkt
- moet de taak zonder dubbele wijziging worden afgesloten

FASE 3 — AUTOMATISCHE PRODUCTIEDEPLOYMENT

Zorg dat iedere geaccepteerde wijziging in GitHub main automatisch naar de VPS van connect.fps-one.nl wordt uitgerold.

De deployment moet minimaal:

1. de actuele GitHub main commit ophalen
2. de exacte commit-SHA vastleggen
3. frontend en backend uit dezelfde commit bouwen
4. verplichte environmentvariabelen controleren
5. database-migrations veilig uitvoeren
6. nieuwe containers of processen starten
7. health checks uitvoeren
8. de actieve productiecommit controleren
9. functionele smoke tests uitvoeren op connect.fps-one.nl
10. bij fouten automatisch terugrollen naar de vorige werkende versie

Voorkom gedeeltelijke deployments waarbij bijvoorbeeld:

- frontend en backend verschillende commits draaien
- database-migrations ontbreken
- oude containers nog verkeer ontvangen
- nieuwe code zonder benodigde secrets wordt gestart
- een oude deployment een nieuwere wijziging overschrijft

FASE 4 — PRODUCTIESTATUS ZICHTBAAR MAKEN

Maak een veilig productie-statusendpoint of beheerscherm waarop zichtbaar is:

- actieve GitHub commit
- frontendcommit
- backendcommit
- builddatum
- deploymenttijd
- deploymentnummer
- API-status
- databaseverbinding
- migratiestatus

Toon geen secrets of gevoelige infrastructuurinformatie.

De actieve commit op connect.fps-one.nl moet automatisch worden vergeleken met GitHub main.

FASE 5 — READY FOR REVIEW HERSTELLEN

Herstel de koppeling tussen Replit-taken en GitHub main.

De correcte regels zijn:

- Ready for review betekent dat de wijziging nog niet in main staat.
- Wanneer Apply changes to main version succesvol is uitgevoerd, verdwijnt Ready for review.
- Wanneer de wijziging buiten de knop om al in main terecht is gekomen, moet Replit dit detecteren en de taakstatus corrigeren.
- Wanneer de wijziging al in productie staat, mag Apply changes to main version niet beschikbaar blijven.
- Een gesloten of verwerkte taak mag niet opnieuw dezelfde wijziging aanbieden.
- Een dubbele merge, dubbele commit of dubbele deployment moet technisch worden geblokkeerd.

FASE 6 — PRODUCTIECONTROLE

Voer na iedere deployment rechtstreeks op https://connect.fps-one.nl automatische smoke tests uit.

Controleer minimaal:

- login
- dashboard
- API health
- databaseverbinding
- gebouwen laden
- gebruiker openen
- chat openen
- formulier opslaan
- document uploaden
- relevante functie van de zojuist gewijzigde taak

Een taak mag niet als opgelost worden gemeld op basis van:

- checkpoint
- typecheck
- lokale build
- Replit preview
- Ready for review
- GitHub push
- gestart deploymentproces
- verwachte werking

FASE 7 — BESTAANDE OPENSTAANDE TAKEN OPSCHONEN

Controleer alle huidige Replit-taken en bepaal per taak:

- nog alleen lokaal
- aanwezig in taakbranch
- aanwezig in GitHub main
- aanwezig in productie
- functioneel getest in productie
- dubbel of verouderd

Sluit stale Ready for review-taken automatisch wanneer hun wijziging al volledig in main en productie staat.

Pas geen wijziging opnieuw toe wanneer deze al aanwezig is.

Verwijder geen functionele productiecode en maak geen nieuwe dubbele commits.

ACCEPTATIECRITERIA

De opdracht is pas opgelost wanneer:

- GitHub main de enige productiecodebron is
- Replit automatisch detecteert of een wijziging al in main staat
- Ready for review niet blijft staan na een succesvolle merge
- dubbele merges technisch worden voorkomen
- dubbele deployments technisch worden voorkomen
- de actieve productiecommit automatisch zichtbaar is
- frontend en backend altijd dezelfde release gebruiken
- iedere main-wijziging automatisch naar connect.fps-one.nl wordt uitgerold
- iedere deployment rechtstreeks op connect.fps-one.nl wordt gecontroleerd
- mislukte deployments automatisch worden teruggedraaid
- taken pas als opgelost worden gemeld na een geslaagde productiecontrole
- stale openstaande taken correct zijn opgeschoond
- het niet meer nodig is om in iedere losse opdracht opnieuw te vermelden dat connect.fps-one.nl de enige geldige werkelijkheid is

Niet gereedmelden met een diagnose, plan, checkpoint, Ready for review, commit of alleen een geslaagde build.

Voer de volledige oplossing daadwerkelijk uit.

De gewenste eindmelding is uitsluitend:

Opgelost: Replit, GitHub main en connect.fps-one.nl vormen nu één betrouwbare ontwikkel- en productieomgeving.

Wanneer een concrete externe toegang of menselijke handeling absoluut noodzakelijk is, meld uitsluitend die blokkade en meld de opdracht niet als opgelost.