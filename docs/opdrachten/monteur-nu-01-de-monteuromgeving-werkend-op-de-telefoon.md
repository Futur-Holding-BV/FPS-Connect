MONTEUR_NU_01 — de monteuromgeving werkend op de telefoon

Aanleiding: monteur Patrick opent connect.fps-one.nl/app en krijgt daar de
pagina "De app komt eraan — de FPS Monteur-app staat nog niet in de App Store".
Er valt niets in te loggen. Daardoor is de complete monteursfunctionaliteit in
artifacts/monteur-app (58 schermen, ±25.000 regels) voor niemand bereikbaar en
nog nooit door een monteur op een echte telefoon gebruikt.

Eis: één adres op de telefoon, inloggen met hetzelfde account, daarna meteen de
monteuromgeving. Geen App Store, geen aparte installatie, geen wachtpagina.

1. METING VOORAF (lever dit voordat je bouwt)
   - Kan artifacts/monteur-app een webuitvoer produceren (expo export
     --platform web)? Zo nee: wat blokkeert het, per foutmelding.
   - Welke onderdelen zijn native-only en wat gebeurt er in een browser:
     expo-local-authentication (biometrie), camera/foto, expo-haptics,
     expo-glass-effect, expo-symbols, de offline-wachtrij in lib/offlineCache
     en async-storage. Per onderdeel: werkt / werkt met terugval / werkt niet.
   - Welke schermen vallen daardoor uit, en hoeveel van de 58 blijven over.

2. BOUWEN
   - Vervang de wachtpagina op /app door de werkende monteuromgeving.
   - Inloggen met hetzelfde Connect-account. Eén keer inloggen, sessie blijft
     staan; op web geen biometrie, dat is bekend en aanvaard.
   - Na inloggen komt een buitendienstgebruiker op zijn eigen werk uit, niet op
     een dashboard en niet op de desktopweergave.
   - Wie geen buitendienstprofiel heeft en /app opent, gaat naar het gewone
     Connect.
   - Installeerbaar vanaf het beginscherm vanuit de browser: eigen manifest en
     service worker voor /app, eigen naam en pictogram, opent zonder
     browserbalk. Niet het manifest van de desktop-webapp hergebruiken.
   - Werkt een onderdeel in de browser niet, dan geen doodlopende knop: het
     onderdeel wordt niet getoond of krijgt een werkende terugval (foto's via
     de camera-invoer van de browser, bevestigen zonder trilling).

3. UITROL
   - Opnemen in scripts/deploy-production.sh en docker-compose; de app komt
     daar nu niet in voor. Na een uitrol moet /app de nieuwe versie tonen
     zonder dat iemand handmatig iets leegt — service worker met versiebeheer.
   - Versienummer en bouwdatum zichtbaar in de app.

4. WAT BLIJFT
   - De APK-weg uit MONTEURAPP_01 blijft bestaan voor biometrie en volledig
     offline werken. Die mag dit niet blokkeren en wordt hier niet aangeraakt.

5. ACCEPTATIE (aantoonbaar, geen beschrijving)
   - Schermafdruk: op een echte telefoon connect.fps-one.nl/app openen,
     inloggen met een monteursaccount, het werkscherm zien.
   - Schermafdruk: toegevoegd aan het beginscherm, geopend zonder browserbalk.
   - Een foto maken en wegzetten met de telefoon in vliegtuigstand, daarna weer
     online: de wachtrij loopt leeg. Lever de meting, niet de bewering.
   - Een niet-buitendienstaccount op /app komt in het gewone Connect uit.

6. VASTE EISEN
   - Toets elke aanname over module, route en bevoegdheid tegen de backend en
     meld afwijkingen — pas niets stilzwijgend aan.
   - Wijk je af van de scope, meld dat vóór je bouwt.
   - Antwoord naar docs/antwoorden/MONTEUR_NU_01.md, metingen naar
     docs/metingen/.