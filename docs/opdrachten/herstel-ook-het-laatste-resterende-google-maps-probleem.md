Herstel ook het laatste resterende Google Maps-probleem uitsluitend in de enige echte omgeving:

https://connect.fps-one.nl

Voor FPS Connect bestaat maar één werkelijkheid en dat is connect.fps-one.nl.

De Google Maps API-sleutel staat inmiddels correct in de productieomgeving en de volgende functies werken:
- geocoding
- Maps Embed
- Street View

De volgende functie werkt nog niet:
- Static Maps / satellietbeeld geeft HTTP 403

Los dit resterende probleem volledig op.

Onderzoek welke concrete oorzaak de HTTP 403 veroorzaakt:
- Maps Static API is niet ingeschakeld
- facturering is niet actief
- API-restricties blokkeren Maps Static API
- applicatierestricties blokkeren server-side gebruik
- HTTP-referrerrestricties zijn ongeschikt voor backendaanroepen
- IP-restricties ontbreken of zijn verkeerd ingesteld
- de verkeerde API-sleutel wordt gebruikt
- de request bevat ongeldige parameters
- quota of projectrestricties blokkeren de aanvraag

Controleer de exacte foutmelding van Google en los de daadwerkelijke oorzaak op.

Gebruik geen tijdelijke workaround waarbij satellietanalyse wordt uitgeschakeld of stil wordt overgeslagen.

Zorg dat:
- Maps Static API daadwerkelijk een satellietafbeelding retourneert
- de backend de afbeelding kan ophalen
- de AI-analyse de satellietafbeelding werkelijk ontvangt
- de gebouwanalyse niet stil terugvalt naar null
- bij een toekomstige API-fout een duidelijke Nederlandse foutmelding verschijnt

Wanneer toegang tot Google Cloud Console noodzakelijk is en deze toegang beschikbaar is, voer dan de benodigde configuratie zelf uit.

Wanneer een menselijke handeling absoluut noodzakelijk is, meld uitsluitend exact:
- welke Google Cloud-instelling moet worden gewijzigd
- in welk project
- bij welke API
- welke restrictie moet worden toegevoegd of aangepast

Test daarna rechtstreeks op:

https://connect.fps-one.nl

Gebruik als test:

parkeergarage achterdoelen in ede

De opdracht is pas opgelost wanneer:
- Static Maps geen HTTP 403 meer geeft
- een echte satellietafbeelding wordt opgehaald
- de AI-analyse deze afbeelding gebruikt
- het resultaat rechtstreeks op connect.fps-one.nl is gecontroleerd

Niet testen of afronden in Replit preview, localhost, development, staging of een andere omgeving.

Niet gereedmelden met een diagnose, uitleg of gedeeltelijk resultaat.

De gewenste eindmelding is uitsluitend:

Opgelost: Google Maps, Static Maps en satellietanalyse werken volledig op connect.fps-one.nl.

Geef alleen aanvullende uitleg wanneer het probleem niet volledig opgelost kon worden.