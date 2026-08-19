---
name: Buitendienst-auth-vlag
description: De server bepaalt of een gebruiker puur uitvoerend veld is; clients gebruiken die vlag voor omgevingskeuze.
---

De buitendienststatus hoort server-authoritative te zijn: `is_uitvoerend_veld` wordt in de auth-payload berekend uit rol en functietitels en wordt door web en mobiele app gebruikt voor routing en zichtbaarheid. Een lokale fallback blijft alleen nodig voor reeds gecachte mobiele gebruikers die de nieuwe vlag nog niet hebben.

**Why:** Een aparte functietitellijst in web en app kon ongemerkt uiteenlopen en monteurs of kantoorprofielen naar de verkeerde omgeving sturen.

**How to apply:** Voeg bij wijzigingen aan de uitvoerende functietitels eerst de serverregel en de auth-schema’s aan; behandel lokale functietitels niet als bron van waarheid voor normale ingelogde gebruikers.