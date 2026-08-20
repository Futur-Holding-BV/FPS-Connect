Herstel de volledige ontwikkel-, deployment- en productiecontrole van FPS Connect.

Voor FPS Connect bestaat vanaf nu maar één operationele werkelijkheid:

https://connect.fps-one.nl

De Replit workspace, Replit preview, localhost, development, staging, testomgevingen en losse builds zijn uitsluitend technische hulpmiddelen. Zij gelden nooit als eindresultaat en mogen nooit de basis zijn voor de melding dat een opdracht is opgelost.

Het doel van deze opdracht is niet het oplossen van één specifieke fout. Het doel is om structureel te garanderen dat iedere toekomstige wijziging automatisch, controleerbaar en aantoonbaar terechtkomt in de echte productieomgeving connect.fps-one.nl.

Voer deze opdracht volledig uit.

FASE 1 — BRENG DE HUIDIGE WERKELIJKHEID IN KAART

Onderzoek de volledige keten:

Replit workspace
GitHub repository
GitHub main branch
deploymentworkflow
VPS bij TransIP
Docker of andere containers
reverse proxy
productiefrontend
productie-API
productiedatabase
productiesecrets
productie-environmentvariabelen
eventuele build caches
eventuele oude deployments of mappen

Stel technisch vast:

- welke GitHub repository bij connect.fps-one.nl hoort
- welke branch voor productie wordt gebruikt
- welke commit momenteel werkelijk live draait
- vanuit welke map of container de productieapp draait
- hoe frontend en backend worden gebouwd
- hoe de productiecontainers worden gestart
- welke database de productieomgeving gebruikt
- welke environmentbestanden actief worden ingelezen
- welke secrets uitsluitend in Replit bestaan
- welke secrets uitsluitend op de VPS bestaan
- of er nog een tweede database, oude applicatie of oude deployment actief is
- of connect.fps-one.nl onderdelen uit verschillende builds of omgevingen gebruikt

FASE 2 — MAAK GITHUB MAIN DE ENIGE CODEBRON

Stel GitHub main in als enige geldige broncode voor productie.

De Replit workspace moet voor iedere nieuwe opdracht eerst worden gesynchroniseerd met de actuele GitHub main branch.

Voorkom dat Replit verderwerkt op:

- oude lokale commits
- losstaande branches
- niet-gepushte lokale wijzigingen
- een verouderde kopie van de applicatie
- code die niet overeenkomt met productie

Een nieuwe opdracht mag pas starten nadat automatisch is vastgesteld dat:

- lokale HEAD gelijk is aan origin/main
- de working tree schoon is
- er geen onbedoelde lokale afwijkingen zijn

Wijzigingen moeten na succesvolle bouw en controle naar GitHub main worden gepusht.

Productie mag uitsluitend worden gebouwd vanuit de actuele GitHub main commit.

FASE 3 — BOUW ÉÉN AUTOMATISCHE PRODUCTIESTRAAT

Richt een automatische deploymentstraat in waarbij een geaccepteerde wijziging op GitHub main automatisch wordt verwerkt in connect.fps-one.nl.

De deploymentstraat moet minimaal uitvoeren:

1. actuele main branch ophalen
2. exacte commit vastleggen
3. dependencies gecontroleerd installeren
4. frontend en backend bouwen
5. database migrations veilig uitvoeren
6. nieuwe productiecontainers of processen starten
7. oude containers pas stoppen wanneer de nieuwe versie gezond is
8. reverse proxy naar de gezonde nieuwe versie laten verwijzen
9. health checks uitvoeren
10. automatische functionele productiecontroles uitvoeren
11. deployment alleen geslaagd verklaren wanneer connect.fps-one.nl werkt
12. bij mislukking automatisch terugrollen naar de vorige werkende productieversie

Voorkom dat een half voltooide deployment de productieomgeving achterlaat met:

- nieuwe frontend en oude API
- oude frontend en nieuwe API
- ontbrekende database migrations
- ontbrekende environmentvariabelen
- oude containers die nog verkeer ontvangen
- een lege of verkeerde database
- gedeeltelijk vernieuwde bestanden

FASE 4 — MAAK PRODUCTIECONFIGURATIE COMPLEET EN CENTRAAL BEHEERD

Breng alle noodzakelijke productie-environmentvariabelen en secrets in kaart.

Controleer minimaal:

- databaseverbinding
- authenticatie- en sessiesleutels
- OpenAI- of andere AI-sleutels
- Google Maps-sleutel
- opslagconfiguratie
- uploadmappen
- documentanalyse
- OCR
- vision
- e-mail
- WebSocket- of realtimeconfiguratie
- API-basis-URL
- frontend publieke configuratie
- backend private configuratie
- reverse-proxyconfiguratie

Zorg dat:

- productie niet afhankelijk is van alleen in Replit opgeslagen secrets
- secrets nooit in GitHub of broncode staan
- productieprocessen de juiste variabelen werkelijk ontvangen
- ontbrekende verplichte variabelen de deployment blokkeren
- de applicatie niet stil terugvalt op mockfunctionaliteit
- ontbrekende configuratie als duidelijke technische fout wordt geregistreerd

Maak een gecontroleerd productie-environmentbestand of secretsmechanisme op de VPS.

Voeg een automatische pre-deploymentcontrole toe die controleert of alle verplichte productievariabelen aanwezig zijn.

FASE 5 — VERWIJDER MOCKS EN STILLE FALLBACKS UIT PRODUCTIE

Zoek de volledige applicatie naar:

- mockdata
- mockservices
- tijdelijke fallbacks
- filename-based AI-classificatie
- classificeerMockAI
- tijdelijke API-antwoorden
- lege succesreacties
- voorbeeldgebruikers
- testdatabases
- hardcoded localhost-URL’s
- Replit preview-URL’s
- development-only routes
- functies die in productie stil worden overgeslagen

Productie mag nooit doen alsof iets werkt wanneer een echte service ontbreekt.

Wanneer een noodzakelijke service niet beschikbaar is:

- moet de functie stoppen
- moet een duidelijke Nederlandse foutmelding verschijnen
- moet de fout in de productielogs zichtbaar zijn
- mag de taak niet als opgelost worden gemeld

FASE 6 — BOUW AUTOMATISCHE PRODUCTIECONTROLES

Maak een vaste smoke-testset die na iedere deployment rechtstreeks tegen https://connect.fps-one.nl wordt uitgevoerd.

Controleer minimaal:

- inlogpagina opent
- gebruiker kan inloggen
- dashboard opent
- gebouwenlijst wordt geladen
- nieuw gebouw openen
- gebouw opslaan
- chatpagina opent
- chatinvoerveld zichtbaar
- gesprek laden
- bericht verzenden en opslaan
- Slim Upload opent
- PDF-upload werkt
- documentanalyse start
- AI-endpoint reageert
- Google Maps-endpoint reageert
- API en frontend gebruiken dezelfde productieversie
- databaseverbinding werkt
- uploads blijven bewaard
- pagina vernieuwen behoudt opgeslagen gegevens

Gebruik geen Replit preview als bewijs voor deze tests.

Alle tests moeten rechtstreeks tegen connect.fps-one.nl lopen.

FASE 7 — MAAK DE LIVE VERSIE ZICHTBAAR

Voeg aan de productieapp een veilige technische versieaanduiding toe.

Deze moet minimaal tonen:

- actieve Git-commit
- builddatum
- deploymentnummer
- backendversie
- frontendversie

De versie moet op een beheerpagina of technisch statusendpoint zichtbaar zijn.

Hierdoor moet altijd direct vastgesteld kunnen worden of connect.fps-one.nl werkelijk de nieuwste GitHub main commit draait.

Toon geen secrets of gevoelige infrastructuurinformatie.

FASE 8 — GEREEDMELDING VAN TOEKOMSTIGE OPDRACHTEN

Pas de werkwijze voor alle toekomstige opdrachten structureel aan.

Een opdracht mag nooit als opgelost worden gemeld op basis van:

- alleen codewijzigingen
- alleen een lokale build
- alleen Replit preview
- alleen unit tests
- alleen een GitHub push
- alleen een geslaagde containerbuild
- verwachte resultaten
- geschreven commando’s die niet zijn uitgevoerd

Een opdracht is pas opgelost wanneer:

- de wijziging naar GitHub main is verwerkt
- de automatische productiedeployment is geslaagd
- connect.fps-one.nl aantoonbaar de nieuwe commit draait
- de functie rechtstreeks op connect.fps-one.nl is getest
- de productie-smoketests zijn geslaagd
- geen regressies in de kernfuncties zijn gevonden

Dit moet de standaardwerkwijze worden. Het mag niet nodig zijn om dit bij iedere volgende herstelopdracht opnieuw te vermelden.

FASE 9 — CONTROLEER EERDER GEMELDE PROBLEMEN

Controleer na herstel van de ontwikkelstraat welke eerder uitgevoerde opdrachten alleen in Replit, GitHub of een testomgeving zijn terechtgekomen en niet correct in productie.

Controleer daarbij minimaal:

- Google Maps en adresanalyse
- AI- en visionfunctionaliteit
- Document Intelligence Pipeline
- Slim Upload
- Uploadwachtrij
- Document Inbox
- Document Studio
- chat en realtime berichten
- rechten van gebruikers met meerdere rollen
- gebouwen aanmaken
- gebouwen aanpassen
- authenticatie
- productie-API’s
- database migrations

Los binnen deze opdracht alleen fouten op die rechtstreeks het gevolg zijn van een kapotte of onvolledige deployment-, configuratie- of productieomgeving.

Maak geen losse hardcoded reparaties per gebruiker, bestand of scherm.

FASE 10 — ACCEPTATIECRITERIA

Deze opdracht is pas opgelost wanneer:

- GitHub main de enige productiecodebron is
- Replit voor iedere taak eerst met main synchroniseert
- deployments automatisch naar de VPS gaan
- connect.fps-one.nl na iedere deployment automatisch wordt getest
- een mislukte deployment automatisch wordt teruggedraaid
- productie niet afhankelijk is van uitsluitend Replit Secrets
- ontbrekende environmentvariabelen een deployment blokkeren
- de live Git-commit zichtbaar en controleerbaar is
- er geen tweede operationele werkelijkheid meer bestaat
- eerdere wijzigingen niet meer alleen in Replit of GitHub kunnen blijven hangen
- toekomstige taken standaard pas worden gereedgemeld na productiecontrole
- connect.fps-one.nl aantoonbaar de actuele, werkende versie draait

Meld deze opdracht niet gereed met een diagnose, plan, instructies of verwachte resultaten.

Voer de noodzakelijke werkzaamheden daadwerkelijk uit.

De enige gewenste gereedmelding na volledige succesvolle uitvoering is:

Opgelost: GitHub, deployment en connect.fps-one.nl vormen nu één gecontroleerde productieomgeving. Iedere toekomstige wijziging wordt automatisch naar connect.fps-one.nl uitgerold en daar getest.

Wanneer volledige uitvoering technisch wordt geblokkeerd, meld uitsluitend de concrete blokkade en welke toegang of handeling nog noodzakelijk is. Meld de opdracht dan niet als opgelost.