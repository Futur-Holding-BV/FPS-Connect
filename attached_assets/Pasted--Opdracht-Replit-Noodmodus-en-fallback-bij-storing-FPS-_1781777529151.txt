# Opdracht Replit – Noodmodus en fallback bij storing FPS Connect

## Doel

Voorkom dat FPS volledig stilvalt wanneer FPS Connect tijdelijk niet bereikbaar is door internetproblemen, serverstoring, softwarecrash of externe API-problemen.

Er moet een praktische noodvoorziening komen waarmee kantoor en monteurs minimaal kunnen blijven werken.

## Uitgangspunt

FPS Connect blijft de hoofdapplicatie.

Er mag geen tweede losse werkomgeving ontstaan waarin structureel parallel wordt gewerkt. Dat veroorzaakt dubbele data en fouten.

De fallback moet bedoeld zijn voor noodsituaties.

---

# 1. Dagelijkse noodexport

Maak automatisch iedere werkdag vroeg in de ochtend een noodexport.

Deze export bevat minimaal:

* datum
* weeknummer
* monteurs
* ingehuurde medewerkers
* dagplanning vandaag
* dagplanning morgen
* projectnaam
* projectnummer
* gebouw
* adres
* contactpersoon
* telefoonnummer
* werkzaamheden
* woningen / ruimten / werkpakketten
* bijzonderheden
* routeadres
* spoedmeldingen

Maak deze export als:

* PDF
* Excel

Sla deze automatisch op in:

* FPS Connect documenten
* OneDrive / SharePoint-map “FPS Connect noodexport”
* optioneel: mail naar hoofdbeheerder, planner en projectleiders

Bestandsnaam:

`FPS-Connect-noodplanning-YYYY-MM-DD.pdf`

en

`FPS-Connect-noodplanning-YYYY-MM-DD.xlsx`

---

# 2. Offline monteurmodus

De mobiele omgeving van de monteur moet de planning en projectinformatie lokaal kunnen cachen.

Wanneer de monteur zijn dagplanning opent, moet FPS Connect lokaal opslaan:

* planning van vandaag
* planning van morgen
* projectgegevens
* gebouwadres
* routeplannerlink
* werkzaamheden
* documenten die voor uitvoering nodig zijn
* foto-instructies
* eerder vastgelegde opmerkingen
* contactgegevens

Bij internetstoring moet de monteur deze informatie nog kunnen openen.

Toon dan duidelijk:

“Offline modus – gegevens worden gesynchroniseerd zodra er weer verbinding is.”

---

# 3. Lokale opslag van nieuwe registraties

Als een monteur offline werkt, moet hij nog kunnen vastleggen:

* foto’s
* opmerkingen
* status voorziening
* uitgevoerd / niet uitgevoerd
* afwijkingen
* handtekening indien van toepassing

Deze gegevens worden tijdelijk lokaal opgeslagen.

Zodra internet terug is:

* automatisch synchroniseren
* conflicten detecteren
* gebruiker melding geven als synchronisatie is gelukt
* fouten loggen

---

# 4. Alleen-lezen fallback voor kantoor

Maak een eenvoudige fallback-pagina voor kantoor.

Deze pagina toont alleen-lezen:

* actuele planning
* projecten
* adressen
* contactpersonen
* projectstatussen
* open werkzaamheden

Deze fallback mag niet bedoeld zijn om normaal in te werken.

Doel:

bij storing kunnen zien wie waarheen moet en welke werkzaamheden openstaan.

---

# 5. Back-ups

Maak automatische databaseback-ups.

Minimaal:

* ieder uur incrementeel indien technisch haalbaar
* dagelijks volledige back-up
* bewaartermijn minimaal 30 dagen
* mogelijkheid om terug te zetten naar herstelpunt

Log elke back-up:

* datum/tijd
* status
* bestandsgrootte
* foutmelding indien mislukt

---

# 6. Noodherstel

Maak een beheerscherm “Noodherstel”.

Alleen zichtbaar voor hoofdbeheerder.

Hierin zichtbaar:

* laatste succesvolle back-up
* laatste noodexport
* status e-mailmodule
* status database
* status opslag/bijlagen
* status externe koppelingen

---

# 7. Belangrijk: geen dubbele productieomgeving zonder beleid

Maak geen onbeheerde tweede versie waarin gebruikers vrij kunnen werken.

Als er een “FPS Connect Noodomgeving” komt, moet deze:

* duidelijk gemarkeerd zijn als noodomgeving
* alleen door hoofdbeheerder geactiveerd kunnen worden
* gegevens uit laatste back-up gebruiken
* geen automatische conflicten veroorzaken met productie
* na herstel gecontroleerd kunnen worden samengevoegd of genegeerd

---

# Acceptatiecriteria

De functie is gereed wanneer:

1. Iedere werkdag automatisch een PDF- en Excel-noodplanning wordt aangemaakt.
2. De noodplanning automatisch beschikbaar is buiten FPS Connect, bijvoorbeeld in OneDrive/SharePoint of e-mail.
3. Monteurs hun dagplanning offline kunnen openen nadat deze eerder geladen is.
4. Monteurs offline foto’s, opmerkingen en statussen kunnen vastleggen.
5. Offline gegevens synchroniseren automatisch zodra internet terug is.
6. Kantoor heeft een alleen-lezen fallback-overzicht.
7. Back-ups worden automatisch gemaakt en gelogd.
8. Hoofdbeheerder kan in één scherm zien of noodexport, back-up en koppelingen functioneren.
9. De fallback veroorzaakt geen dubbele of conflicterende projectdata.
