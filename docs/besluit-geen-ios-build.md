# Besluit: geen iOS-build voor de monteur-app

**Datum:** 17 augustus 2026 · **Besluit door:** René (taak #886, gesloten)

## Besluit
- Er komt **geen iOS-build** van de FPS Monteur-app en **geen Apple Developer-account** (€99/jaar).
- Medewerkers met een iPhone werken in de **webapp** (FPS Connect, incl. PWA-installatie via de QR-code op het dashboard).
- De Android-APK blijft het enige native distributiekanaal (EAS Build, zie docs/monteur-app-apk.md).

## Achtergrond
Een iOS-build vereist een betaald Apple Developer-account en een aparte distributie- en updateketen (TestFlight/App Store), terwijl de webapp alle medewerkersfuncties al via de browser aanbiedt. De eerdere actiepunt-tekst "inventariseer of er iPhone-monteurs zijn" is hiermee vervallen: iPhone-gebruikers zijn niet uitgesloten, zij gebruiken de webapp.

## Consequenties
- De webapp moet voor iedere ingelogde medewerker de eigen basisgegevens (uren, declaraties, verlof, loonstroken) ontsluiten, ongeacht modulerechten — zoals de monteur-app dat al doet ("Mijn gegevens"-basislaag).
- eas.json bevat uitsluitend Android-profielen; dit is bewust en blijft zo.
