# Sleutels en geheimen — wat er is en wanneer het verloopt

*Voor `deploy/GEHEIMEN.md` in de repo. Bijgewerkt 17 augustus 2026.*

Hierin staan **geen waarden**. Alleen: wat er bestaat, waar het staat en wanneer het afloopt. De waarden zelf staan in `deploy/.env.production` op de server en in de Replit-secrets, en horen nergens anders te staan — ook niet in een chat.

---

## Microsoft-koppeling (mail en werk-inbox)

De app-registratie heet **FPS Brandpreventie App smtp** en staat in de tenant van FPS Bouw. Beheer loopt via Denko; René is eigenaar van de registratie en kan zelf geheimen aanmaken.

| Geheim | Waar in gebruik | Verloopt |
|---|---|---|
| `productie-2026-08` | Productieserver, in `deploy/.env.production` | augustus 2028 |
| `secret` | Replit (ontwikkelomgeving) | juni 2028 |

Verwijderd op 17-08-2026: het geheim `Connect 2026`. Dat draaide op productie en is vervangen omdat de inhoud van het instellingenbestand een keer in een chat is geplakt.

**Waar de instellingen staan.** Op de server in `/opt/fps-one/deploy/.env.production` — let op dat de map daar `fps-one` heet en niet `fps-connect`. Dat bestand komt bewust niet mee bij een uitrol en wordt met de hand onderhouden.

**Twee namen voor hetzelfde.** De clientwaarde staat onder twee namen: de oude en één met achtervoegsel `_NEW`. De werk-inbox leest alleen die met `_NEW` en valt niet terug op de oude; de systeemmail leest allebei. Staat alleen de oude ingevuld, dan werkt de mail wél en de werk-inbox niet. Historische valkuil: in de oude naam heeft ooit de tenantwaarde gestaan in plaats van de clientwaarde.

---

## Vervangen — de volgorde die werkt

1. In Entra een **nieuw** geheim aanmaken naast het bestaande. Twee mogen naast elkaar bestaan, dus er is geen moment waarop niets werkt.
2. De waarde invullen op de plek waar hij hoort (server of Replit, niet allebei — het zijn gescheiden omgevingen).
3. Herstarten en controleren dat er een mail aankomt.
4. **Pas dan** het oude geheim verwijderen in Entra.

Wie stap 4 vooraan zet, legt de mail plat tot het nieuwe geheim overal staat.

---

## Wat er nog niet geregeld is

Er is niets dat waarschuwt als een geheim bijna verloopt. Beide lopen af in 2028, en een verlopen geheim geeft geen signaal vooraf: op een ochtend komt er geen mail meer uit en zoek je een halve dag naar de oorzaak. Zie de opdracht hieronder.

---

# Opdracht: bewaking op verlopende sleutels

*Voor Replit. Klein, maar het voorkomt een storing die niemand ziet aankomen.*

**Wat er nu is.** Nergens in het systeem staat wanneer een sleutel of certificaat verloopt. Dat geldt niet alleen voor de Microsoft-geheimen: ook het SSL-certificaat, de tokens richting GitHub en de sleutels van externe diensten hebben een einddatum die nu alleen in het hoofd van iemand zit.

**Wat er moet komen.** Een dagelijkse controle die kijkt hoe lang elke sleutel nog geldig is, en die zelf iets doet zodra het krap wordt.

Neem in elk geval mee: de clientgeheimen van de Microsoft-registratie (die zijn via Microsoft zelf op te vragen met de bestaande koppeling), het SSL-certificaat van het productieadres, en elke andere sleutel met een einddatum die het systeem kan uitlezen. Wat niet uit te lezen is, krijgt een handmatig ingevoerde einddatum in dezelfde lijst — beter een datum die iemand heeft ingetikt dan geen datum.

**Wat er gebeurt bij naderend verval,** en dit is het punt van de hele opdracht: geen melding in een logboek, maar een handeling. Bij dertig dagen te gaan verschijnt er een taak in de werkbak bij de beheerder, met de naam van de sleutel, waar hij in gebruik is en de vervangingsvolgorde erbij. Die taak blijft staan tot hij is afgehandeld. Bij zeven dagen gaat daar de bestaande faalmail overheen, want dan is het geen planning meer maar een naderende storing.

**En de lijst moet ergens te zien zijn.** Eén scherm onder Beheer met alle sleutels, hun plek, hun einddatum en het aantal dagen dat rest. Dat is meteen het antwoord op de vraag "wat draait er allemaal en wat verloopt er als eerste", die nu niemand kan beantwoorden.

**Wat er níét in mag.** Geen enkele waarde. Het scherm en de bewaking tonen namen, plekken en datums — nooit de sleutel zelf, ook niet afgekort.
