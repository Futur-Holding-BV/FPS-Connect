Herstel het volledige gekoppelde proces voor gebruiker, personeelslid, functie, rol en onboarding uitsluitend in de enige echte en geldige omgeving:

https://connect.fps-one.nl

Voor FPS Connect bestaat maar één werkelijkheid en dat is connect.fps-one.nl.

Replit preview, localhost, development, staging, testomgevingen, checkpoints en losse builds zijn uitsluitend technische hulpmiddelen en gelden nooit als eindresultaat.

De eerder opgeloste HTTP 403 was slechts één symptoom. Het werkelijke probleem is dat gebruiker, personeelslid, functie, rol, uitnodiging en onboarding nu niet als één samenhangend proces functioneren.

Vastgestelde problemen:

- Een personeelslid kan worden aangemaakt zonder gekoppeld gebruikersaccount.
- Een gebruiker kan worden aangemaakt zonder volledig personeelsdossier.
- De gekozen rol Timmerman is wel selecteerbaar, maar komt niet overal correct terug.
- Fred van Wallinga toont Timmerman op de gebruikerskaart, terwijl de teller Timmerman bovenaan op 0 blijft staan.
- Uitnodigen en activeren van de gebruiker gebeurt niet automatisch.
- Onboarding start niet automatisch.
- Er kunnen losse en ongekoppelde gebruikers- en personeelsrecords ontstaan.
- De rol, functie en rechten zijn niet overal consistent zichtbaar en gekoppeld.

Herstel dit generiek en structureel.

De juiste werkwijze moet zijn:

1. Jacqueline maakt als HRM-medewerker één nieuw personeelslid aan.

2. Tijdens dit ene proces worden minimaal vastgelegd:
- persoonsgegevens
- contactgegevens
- werkmaatschappij
- aanstelling
- functie
- rol of rollen
- startdatum
- CAO
- gebruikersrechten
- behoefte aan toegang tot Connect

3. Wanneer toegang tot Connect nodig is:
- wordt automatisch een gebruikersaccount aangemaakt
- wordt dit account gekoppeld aan het personeelsdossier
- worden de juiste rollen en rechten toegekend
- wordt automatisch een uitnodiging of activatiemail verstuurd
- wordt de onboarding automatisch gestart

4. De gekozen functie en rol, bijvoorbeeld Timmerman, moeten zichtbaar zijn in:
- personeelsdossier
- gebruikersoverzicht
- rollenoverzicht
- functietellers
- rechtenoverzicht
- onboarding
- profiel van de gebruiker

5. De juiste rechten moeten centraal uit de rol worden afgeleid.

6. Er mogen geen losse, dubbele of ongekoppelde records ontstaan.

7. Bestaande losse gebruikers en personeelsleden moeten veilig aan elkaar gekoppeld kunnen worden zonder duplicaten aan te maken.

8. Een personeelslid zonder Connect-toegang mag wel zonder gebruikersaccount bestaan, maar dit moet een bewuste keuze zijn en duidelijk zichtbaar worden vastgelegd.

9. Wanneer later alsnog Connect-toegang wordt toegekend:
- moet vanuit het bestaande personeelsdossier een account kunnen worden aangemaakt
- moeten rol, rechten, uitnodiging en onboarding automatisch worden toegevoegd
- mag geen tweede personeelsrecord ontstaan

10. Wanneer een gebruiker wordt gedeactiveerd:
- blijft het personeelsdossier behouden
- worden toegangsrechten geblokkeerd
- blijft de historie intact

11. Wanneer een personeelslid uit dienst gaat:
- moet het gebruikersaccount gecontroleerd worden gedeactiveerd
- moeten openstaande onboarding- of toegangsacties worden afgesloten
- mogen historische gegevens niet verdwijnen

Controleer en herstel minimaal:

- databasekoppeling tussen gebruiker en personeelslid
- unieke identificatie en duplicaatcontrole
- aanmaken van personeelslid
- aanmaken van gebruiker
- POST- en PATCH-endpoints
- uitnodigingsmail
- accountactivatie
- wachtwoordinstelling
- onboardingstatus
- werkmaatschappijkoppeling
- functie
- rol
- meerdere rollen
- rechtenmatrix
- gebruikerskaart
- functietellers
- zoekfilters
- personeelsdossier
- gebruikersoverzicht
- auditlogging

Controleer specifiek waarom:

- Fred van Wallinga de rol Timmerman toont
- maar de teller Timmerman op 0 blijft staan

Herstel de teller en alle overzichten zodat ze dezelfde centrale bron gebruiken en geen verschillende interpretaties van functie en rol hanteren.

Voeg geen tijdelijke of hardcoded uitzondering toe voor:

- Jacqueline
- Fred van Wallinga
- Timmerman
- één specifieke gebruiker
- één werkmaatschappij
- één formulier
- één endpoint

Test rechtstreeks op:

https://connect.fps-one.nl

Gebruik minimaal deze productiecontrole:

1. Log in als Jacqueline.
2. Maak één nieuw personeelslid aan.
3. Kies een werkmaatschappij.
4. Kies functie Timmerman.
5. Geef aan dat toegang tot Connect nodig is.
6. Laat automatisch een gebruikersaccount aanmaken.
7. Controleer dat het account aan het personeelsdossier is gekoppeld.
8. Controleer dat Timmerman als functie en rol zichtbaar is.
9. Controleer dat de teller Timmerman met 1 stijgt.
10. Controleer dat de juiste rechten zijn toegekend.
11. Controleer dat de uitnodiging wordt verstuurd.
12. Controleer dat onboarding automatisch start.
13. Controleer dat de gebruiker kan activeren en inloggen.
14. Controleer dat na vernieuwen en opnieuw inloggen alle koppelingen behouden blijven.
15. Controleer dat geen dubbel personeels- of gebruikersrecord is ontstaan.
16. Controleer ook een personeelslid zonder Connect-toegang.
17. Controleer dat later vanuit dit dossier alsnog een account kan worden aangemaakt.
18. Controleer bestaande gebruiker Fred van Wallinga en herstel de telling zonder zijn gegevens te beschadigen.

Niet afronden met alleen:

- diagnose
- plan
- codewijzigingen
- typecheck
- build geslaagd
- checkpoint
- Ready for review
- commit
- merge
- deployment gestart
- verwachte werking

Verwerk de oplossing in GitHub main, voer de productie-deployment uit en controleer de volledige werking rechtstreeks op connect.fps-one.nl.

Een resultaat in Replit, preview, localhost, development, staging of test geldt niet als voltooid.

Alleen connect.fps-one.nl geldt als werkelijkheid, testomgeving en eindresultaat.

Meld de opdracht pas gereed wanneer één HRM-handeling aantoonbaar leidt tot:

personeelsdossier + aanstelling + functie + rol + gebruikersaccount + rechten + uitnodiging + onboarding

De gewenste eindmelding is uitsluitend:

Opgelost: personeelsbeheer, gebruikersaccount en onboarding vormen één gekoppeld proces op connect.fps-one.nl.

Geef alleen aanvullende uitleg wanneer het probleem niet volledig opgelost kon worden.