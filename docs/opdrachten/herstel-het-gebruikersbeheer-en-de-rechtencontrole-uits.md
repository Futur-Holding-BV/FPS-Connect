Herstel het gebruikersbeheer en de rechtencontrole uitsluitend in de enige echte en geldige omgeving:

https://connect.fps-one.nl

Voor FPS Connect bestaat maar één werkelijkheid en dat is connect.fps-one.nl.

Replit preview, localhost, development, staging, testomgevingen, checkpoints en losse builds zijn uitsluitend technische hulpmiddelen en gelden nooit als eindresultaat.

Vastgesteld probleem:

Jacqueline is HRM-medewerker.

Zij moet in alle gevallen nieuwe gebruikers kunnen toevoegen, bestaande gebruikers kunnen wijzigen, rollen kunnen toekennen en gebruikersgegevens kunnen beheren binnen FPS Connect.

Op dit moment verschijnt bij het toevoegen van een gebruiker met de rol Timmerman:

HTTP 403: Geen toegang: bevoegdheid kan niet hoger zijn dan uw eigen niveau

Deze blokkade is onjuist.

De functionele hoofdregel is:

Een gebruiker met de rol HRM-medewerker moet alle gebruikers kunnen aanmaken en wijzigen, ongeacht de gekozen functie of rol van die gebruiker.

Dit geldt voor alle gebruikerstypen, waaronder:
- Timmerman
- Applicateur
- Voorman
- Werkvoorbereider
- Projectleider
- Calculator
- Administratief medewerker
- HRM-medewerker
- Financieel medewerker
- Bedrijfsleider
- Systeembeheerder
- gebruikers met meerdere rollen

De HRM-medewerker moet minimaal kunnen:
- nieuwe gebruikers aanmaken
- bestaande gebruikers wijzigen
- gebruikers activeren en deactiveren
- rollen toevoegen en verwijderen
- meerdere rollen combineren
- werkmaatschappijen koppelen
- contactgegevens wijzigen
- wachtwoorden instellen of resetten
- profielgegevens beheren
- gebruikersrechten bekijken
- gebruikers opslaan zonder onterechte 403-melding

Onderzoek en herstel de volledige rechtencontrole bij:
- gebruiker toevoegen
- gebruiker wijzigen
- rollen kiezen
- meerdere rollen combineren
- effectieve rechten berekenen
- bevoegdheidsniveau vergelijken
- POST-endpoints voor gebruikers
- PATCH-endpoints voor gebruikers
- frontendvalidatie
- backendautorisatie
- standaardwaarden
- verborgen rechten
- werkmaatschappijkoppelingen
- gebruikersactivatie
- wachtwoordinstelling en wachtwoordreset

Controleer specifiek waarom Jacqueline als HRM-medewerker toch wordt beperkt door een regel die bevoegdheidsniveaus vergelijkt.

Onderzoek minimaal:
- of HRM-medewerker onjuist aan een te laag bevoegdheidsniveau is gekoppeld
- of de backend Jacqueline niet als HRM-medewerker herkent
- of meerdere rollen van Jacqueline een conflict veroorzaken
- of een algemene hiërarchieregel ten onrechte vóór de HRM-bevoegdheid wordt toegepast
- of POST en PATCH verschillende autorisatieregels gebruiken
- of frontend en backend verschillende rechtenmodellen hanteren
- of niet-gekozen modules onbedoeld worden meegerekend
- of lege rechtenvelden als hoogste bevoegdheid worden geïnterpreteerd
- of werkmaatschappijrechten worden verward met systeemrechten
- of oude of gedeactiveerde rollen nog worden meegerekend

Herstel dit generiek in het centrale rechtenmodel.

Voeg geen tijdelijke of hardcoded uitzondering toe die alleen geldt voor:
- Jacqueline
- Timmerman
- één specifieke gebruiker
- één formulier
- één endpoint
- één werkmaatschappij

De rol HRM-medewerker moet structureel en centraal de bevoegdheid krijgen om alle gebruikers en rollen te beheren.

Deze bevoegdheid moet in zowel frontend als backend identiek worden toegepast.

Een gebruiker zonder HRM- of systeembeheerrechten mag deze brede bevoegdheid niet krijgen.

Zorg daarnaast dat:
- bestaande gebruikers en rollen ongewijzigd blijven
- bestaande rechten niet worden overschreven
- gebruikers met meerdere rollen correct blijven functioneren
- een duidelijke Nederlandse foutmelding verschijnt wanneer een niet-HRM-gebruiker terecht wordt geblokkeerd
- geen generieke HTTP 403 wordt getoond zonder uitleg
- auditlogging registreert wie een gebruiker heeft aangemaakt of gewijzigd

Test rechtstreeks op:

https://connect.fps-one.nl

Voer minimaal deze productietests uit:

1. Jacqueline maakt een nieuwe gebruiker aan met alleen de rol Timmerman.
2. De gebruiker wordt succesvol opgeslagen.
3. Jacqueline maakt een gebruiker aan met meerdere rollen.
4. De gebruiker wordt succesvol opgeslagen.
5. Jacqueline wijzigt een bestaande gebruiker.
6. Jacqueline voegt een hogere beheerrol toe.
7. Jacqueline verwijdert een rol.
8. Jacqueline koppelt een werkmaatschappij.
9. Jacqueline activeert en deactiveert een gebruiker.
10. Jacqueline stelt een wachtwoord in of voert een wachtwoordreset uit.
11. Alle wijzigingen blijven na vernieuwen en opnieuw inloggen behouden.
12. Een gebruiker zonder HRM- of systeembeheerrechten kan niet onbeperkt gebruikers beheren.
13. Bestaande productiegebruikers en hun rechten blijven intact.

Gebruik voor tests geen bestaande gebruiker op een manier die gegevens beschadigt.

Verwijder na afloop eventuele overbodige testgebruikers.

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

Verwerk de oplossing in GitHub main, voer de productie-deployment uit en controleer de werking rechtstreeks op connect.fps-one.nl.

Meld de opdracht pas gereed wanneer Jacqueline als HRM-medewerker aantoonbaar alle gebruikers en rollen kan beheren in connect.fps-one.nl.

De gewenste eindmelding is uitsluitend:

Opgelost: HRM-medewerkers kunnen alle gebruikers en rollen beheren op connect.fps-one.nl.

Geef alleen aanvullende uitleg wanneer het probleem niet volledig opgelost kon worden.