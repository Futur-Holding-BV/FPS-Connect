# Opdracht Replit – Magazijn- en Voorraadbeheer

## Doel

Bouw binnen FPS Connect een complete magazijn- en voorraadmodule.

De voorraadadministratie moet volledig geïntegreerd zijn met:

- Calculatie
- Werkbegroting
- Inkoop
- Projecten
- Monteurs
- Wagenpark
- Financiële administratie

Het magazijn is de centrale voorraad van het bedrijf.

AI moet continu weten:

- wat op voorraad ligt;
- wat is gereserveerd;
- wat onderweg is;
- wat op een project is verbruikt;
- wat opnieuw besteld moet worden.

---

# Nieuwe hoofdmodule

Magazijn

Onder deze module komen:

- Dashboard
- Voorraad
- Artikelen
- Locaties
- Inkoop
- Bestellingen
- Leveringen
- Reserveringen
- Uitgiftes
- Retouren
- Inventarisaties
- Minimumvoorraad
- Leveranciers

---

# Artikelkaart

Iedere artikelkaart bevat minimaal:

- artikelnummer
- interne artikelcode
- omschrijving
- leverancier
- leveranciersartikelnummer
- merk
- categorie
- eenheid (stuks, meter, doos, koker, etc.)
- inkoopprijs
- laatste inkoopprijs
- gemiddelde inkoopprijs
- verkoopprijs (optioneel)
- btw
- minimumvoorraad
- gewenste voorraad
- actuele voorraad
- gereserveerde voorraad
- vrije voorraad
- bestelde voorraad
- magazijnlocatie
- barcode of QR-code
- foto
- technische documenten
- ETA/DoP/certificaten

---

# Magazijnlocaties

Ondersteun meerdere locaties.

Bijvoorbeeld:

Hoofdmagazijn

Stelling A

Vak A01

Vak A02

Vak B03

Bus 12

Bus 15

Projectcontainer

Externe opslag

AI weet altijd waar materialen zich bevinden.

---

# Voorraadmutaties

Iedere mutatie wordt opgeslagen.

Bijvoorbeeld:

- ingekocht
- ontvangen
- gereserveerd
- uitgegeven
- retour ontvangen
- afgekeurd
- beschadigd
- inventarisatiecorrectie
- overboeking naar andere locatie

Volledige historie blijft beschikbaar.

---

# Koppeling met werkbegroting

Na goedkeuring van de werkbegroting controleert AI automatisch:

Welke materialen zijn op voorraad?

Welke moeten worden besteld?

Welke zijn al gereserveerd?

Welke hebben een lange levertijd?

Maak vervolgens automatisch:

- reserveringen
- inkoopvoorstellen
- leverplanning

---

# Materialen uit magazijn meenemen

Monteurs gebruiken de mobiele app.

Bij vertrek openen zij:

Magazijn

↓

Project kiezen

↓

Materialen selecteren

↓

Bevestigen

Daarna wordt automatisch:

- voorraad verminderd;
- materiaal gekoppeld aan het project;
- nacalculatie bijgewerkt;
- kostprijs bijgewerkt.

Geen losse administratie meer.

---

# QR-code / Barcode

Alle artikelen krijgen een QR-code of barcode.

Via de telefoon kan de monteur:

- scannen
- aantal invoeren
- project kiezen
- bevestigen

Dit duurt slechts enkele seconden.

---

# Retourmateriaal

Na afronding van een project kan de monteur aangeven:

- terug naar magazijn
- defect
- restmateriaal
- afval
- opnieuw inzetbaar

AI verwerkt de voorraad automatisch.

---

# Automatische besteladviezen

AI bewaakt continu de voorraad.

Wanneer de minimumvoorraad wordt bereikt:

Maak automatisch een bestelvoorstel.

Toon bijvoorbeeld:

"Nog 8 kokers brandwerende kit beschikbaar."

"Gemiddeld verbruik is 24 kokers per maand."

"Advies: bestel 36 kokers."

De gebruiker hoeft alleen akkoord te geven.

---

# Projectreserveringen

Materialen kunnen worden gereserveerd.

Status:

Vrij

↓

Gereserveerd

↓

Uitgegeven

↓

Verbruikt

↓

Retour

Hierdoor kan hetzelfde artikel niet per ongeluk aan meerdere projecten worden toegewezen.

---

# Dashboard

Toon onder andere:

- voorraadwaarde
- aantal artikelen
- kritieke voorraad
- artikelen onder minimum
- onderweg
- gereserveerd
- hoogste voorraadwaarde
- langzaam lopende artikelen
- snel lopende artikelen
- verlopen producten
- materialen zonder beweging
- voorraadverschillen

---

# AI-analyses

AI geeft automatisch adviezen.

Bijvoorbeeld:

"Van deze kit ligt voor ruim twee jaar voorraad."

"Dit artikel wordt structureel te laat besteld."

"Deze leverancier levert gemiddeld 5 dagen later."

"Deze materialen worden vaak samen gebruikt."

"Deze producten kunnen goedkoper bij leverancier X worden gekocht."

"Deze artikelen liggen al 18 maanden zonder beweging."

---

# Financiële koppeling

Iedere voorraadmutatie wordt financieel gevolgd.

AI kent:

- actuele voorraadwaarde;
- gemiddelde inkoopprijs;
- laatste inkoopprijs;
- verbruik per project;
- verbruik per werkmaatschappij;
- voorraadverschillen;
- afboekingen.

Hierdoor sluit de voorraadadministratie automatisch aan op de financiële administratie.

---

# Inventarisatie

Maak een inventarisatiemodus.

Medewerkers lopen met hun telefoon door het magazijn.

QR-code scannen.

Aantal invoeren.

Connect verwerkt automatisch:

- verschillen;
- correcties;
- financiële gevolgen.

---

# Belangrijk

Er mag nooit dubbele administratie ontstaan.

Alle voorraadmutaties ontstaan automatisch vanuit:

- inkoop;
- ontvangst;
- projectreserveringen;
- uitgifte aan monteurs;
- retouren;
- inventarisaties.

De gebruiker voert gegevens slechts één keer in.

AI verzorgt alle vervolgacties, controles en analyses.