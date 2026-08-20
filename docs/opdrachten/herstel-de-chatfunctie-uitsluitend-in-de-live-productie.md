Herstel de chatfunctie uitsluitend in de live productieomgeving https://connect.fps-one.nl.

Er is voor deze opdracht maar één geldige omgeving:

https://connect.fps-one.nl

De Replit workspace, Replit preview, localhost en eventuele testomgeving zijn alleen ontwikkelgereedschap en gelden niet als eindresultaat.

Vastgestelde fout

In de live productieomgeving opent de chatpagina wel, maar de chatfunctie werkt niet:

er worden geen gesprekken geladen;
links staat Geen gesprekken gevonden;
in het midden staat Nog geen berichten. Stuur als eerste een bericht;
er is geen zichtbaar of bruikbaar invoerveld om een bericht te typen;
bestaande deelnemers worden wel getoond;
de pagina lijkt daardoor slechts gedeeltelijk te laden.
Uit te voeren herstel
Controleer eerst welke commit en build daadwerkelijk live draaien op connect.fps-one.nl.
Onderzoek en herstel de volledige chatketen:
frontend chatpagina;
gesprekslijst;
berichtengeschiedenis;
invoerveld;
verzendknop;
API-endpoints;
databasequeries;
authenticatie en rechten;
realtimeverbinding via WebSocket, Socket.IO, SSE of polling;
reverse proxy;
productie-environmentvariabelen.
Controleer waarom het invoerveld ontbreekt of buiten beeld blijft. Onderzoek minimaal:
CSS-layout;
hoogteberekening van de chatcontainer;
overflow;
vaste footer;
verborgen componenten;
conditionele rendering;
foutieve rechtencontrole;
JavaScript-runtimefouten.
Controleer in de browserconsole en serverlogs op fouten bij:
laden van gesprekken;
ophalen van berichten;
aanmaken van een gesprek;
versturen van een bericht;
realtime-updates;
authenticatie;
CORS;
WebSocket-upgrade;
ontbrekende environmentvariabelen.
Controleer of de productie-API’s van de chat werkelijk bereikbaar zijn vanaf:

https://connect.fps-one.nl

Test de relevante endpoints met een geldige ingelogde gebruiker.

Controleer of de live database de chatgesprekken, deelnemers en berichten bevat en of de applicatie naar de juiste productiedatabase wijst.
Controleer of recente wijzigingen in GitHub of deploymentconfiguratie de chat hebben gebroken, met speciale aandacht voor:
gewijzigde API-basis-URL;
gewijzigde authenticatie;
gewijzigde gebruikers-ID’s;
gewijzigde databaseverbinding;
gewijzigde WebSocket-URL;
reverse-proxyregels;
verdwenen frontendcomponenten;
rechtenconflicten bij gebruikers met meerdere functies.
Herstel de chat generiek. Voeg geen tijdelijke mockdata of hardcoded gesprekken toe.
Zorg dat minimaal het volgende weer werkt:
bestaande gesprekken worden geladen;
nieuw gesprek aanmaken;
deelnemers selecteren;
berichten typen;
berichten versturen;
berichten opslaan;
berichten opnieuw laden;
verzonden berichten direct tonen;
ontvangen berichten zichtbaar maken;
foutmeldingen tonen wanneer verzenden mislukt.
Controleer de werking met echte productiegebruikers:
René Vink;
Jacqueline van Jijl;
Ruben Bekkenkamp.
Test rechtstreeks op connect.fps-one.nl:
René maakt een gesprek aan;
René verstuurt een bericht;
Jacqueline ziet het bericht;
Jacqueline antwoordt;
René ziet het antwoord;
pagina vernieuwen;
berichten blijven behouden;
uitloggen en opnieuw inloggen;
gesprek en berichten blijven zichtbaar.
Test ook op desktop en mobiel formaat.
Controleer na herstel dat geen ander onderdeel van Connect is beschadigd.
Herstart alleen de benodigde productieprocessen op de VPS.
Productieregels
Niet als voltooid melden wanneer het alleen in Replit preview werkt.
Niet alleen code schrijven zonder productie-deployment.
Geen testdata in de live database achterlaten.
Geen secrets in GitHub, code of logs plaatsen.
Geen bestaande gesprekken of berichten verwijderen.
Geen productiegebruikers opnieuw aanmaken.
Geen wijzigingen uitvoeren buiten de chatmodule tenzij technisch noodzakelijk.
Voltooiingscriterium

De opdracht is pas opgelost wanneer twee echte gebruikers op:

https://connect.fps-one.nl

aantoonbaar berichten naar elkaar kunnen verzenden en ontvangen, en de berichten na vernieuwen en opnieuw inloggen behouden blijven.

Meld de opdracht pas daarna als opgelost.

De gewenste eindmelding is:

“Opgelost: chatten werkt weer op connect.fps-one.nl.”

Geef alleen extra uitleg wanneer het probleem niet volledig opgelost kon worden.