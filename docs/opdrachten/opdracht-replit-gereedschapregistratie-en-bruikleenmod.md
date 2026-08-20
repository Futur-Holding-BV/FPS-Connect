# Opdracht Replit – Gereedschapregistratie en bruikleenmodule FPS Connect

## Doel

Bouw in FPS Connect een module voor de registratie, uitgifte, bruikleen, keuring, schade en inname van gereedschappen en machines.

Deze module vervangt het huidige Word-formulier dat handmatig wordt ingevuld en ondertekend door de medewerker en FPS.

De module moet bruikbaar zijn voor:

* monteurs
* timmermannen
* ingehuurde medewerkers
* projectleiders
* hoofdbeheerder
* HR / administratie

---

# 1. Gereedschapregister

Maak een centraal gereedschapregister binnen FPS Connect.

Per machine/gereedschap moet minimaal worden vastgelegd:

* intern volgnummer
* gegraveerd nummer
* omschrijving
* merk
* type
* serienummer
* categorie
* elektrisch / accu / handgereedschap
* met snoer: ja/nee
* accu’s inbegrepen
* laders inbegrepen
* koffer inbegrepen
* aankoopdatum
* aankoopprijs
* leverancier
* garantietermijn
* huidige status
* huidige gebruiker
* locatie
* keuringsplichtig: ja/nee
* laatste keuring
* volgende keuring
* opmerkingen
* foto’s

Het gegraveerde nummer is leidend en moet snel vindbaar zijn.

---

# 2. Statussen

Gebruik minimaal deze statussen:

* Beschikbaar
* In bruikleen
* Defect gemeld
* Beschadigd
* Ter keuring
* Afgekeurd
* In reparatie
* Vermist
* Afgeschreven

---

# 3. Bruikleen aan medewerker

Een gereedschap of machine moet digitaal aan een medewerker kunnen worden uitgegeven.

Bij uitgifte wordt vastgelegd:

* medewerker
* datum uitgifte
* uitgegeven door
* gereedschap/machine
* volgnummer
* staat bij uitgifte
* foto’s bij uitgifte
* meegeleverde accessoires
* opmerkingen
* bruikleenvoorwaarden
* digitale handtekening medewerker
* digitale handtekening uitgever

Na ondertekening wordt automatisch een PDF-brÃºikleenformulier gegenereerd.

Deze PDF wordt opgeslagen bij:

* medewerker
* gereedschap
* documenten
* eventueel HRM-dossier

---

# 4. Ondertekenen op telefoon

De monteur moet het bruikleenformulier op zijn telefoon kunnen openen en ondertekenen.

Werking:

* medewerker krijgt melding of link
* medewerker ziet overzicht van de uit te geven machines
* medewerker controleert gegevens
* medewerker zet digitale handtekening op het scherm
* FPS-medewerker/uitgever tekent ook
* formulier wordt definitief opgeslagen als PDF

Na ondertekening mag het formulier niet meer stilzwijgend worden gewijzigd.

Bij correctie moet een nieuwe versie worden gemaakt.

---

# 5. Overzicht voor medewerker

De monteur/timmerman moet op zijn telefoon kunnen zien welke machines en gereedschappen op zijn naam staan.

Toon per item:

* volgnummer
* omschrijving
* merk/type
* foto
* status
* keuringsdatum indien van toepassing
* volgende keuring
* accessoires
* knop: schade melden
* knop: defect melden
* knop: vermissing melden

---

# 6. Schade of defect melden

De medewerker moet via zijn telefoon schade of defecten kunnen melden.

Bij melding vult hij in:

* gereedschap/machine
* soort melding: schade / defect / vermissing
* omschrijving
* datum
* foto’s
* urgentie
* kan nog veilig gebruikt worden
