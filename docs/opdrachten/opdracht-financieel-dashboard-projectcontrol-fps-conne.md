# Opdracht – Financieel Dashboard & Projectcontrol FPS Connect

## Doel

FPS Connect wordt geen boekhoudpakket.

De financiële administratie blijft plaatsvinden in **AccountView**.

FPS Connect wordt het operationele projectcontrol- en managementsysteem dat realtime inzicht geeft in projecten, kosten, opbrengsten, liquiditeit en bedrijfsvoering.

Er komt een dagelijkse synchronisatie met AccountView.

---

# Uitgangspunt

Alle kosten moeten zoveel mogelijk direct gekoppeld worden aan:

* project;
* gebouw;
* opdracht;
* kostensoort;
* grootboeknummer.

Hierdoor ontstaat realtime projectcontrol.

---

# Inkomende facturen

Iedere inkomende factuur wordt eerst geregistreerd in Connect.

Tijdens het boeken kiest de gebruiker:

## Project

Bijvoorbeeld:

Project Vink

Of:

Algemene kosten

---

## Kostensoort

Bijvoorbeeld:

* Materialen
* Onderaanneming
* Materieel
* Gereedschap
* Brandstof
* Personeel
* Huur
* Verzekeringen
* ICT
* Huisvesting
* Auto's
* Marketing
* Kantoor
* Overig

---

## Grootboek

Factuur wordt gekoppeld aan het juiste grootboeknummer.

Deze koppeling wordt gebruikt voor AccountView.

---

# Voorbeelden

## Factuur deurleverancier

Project:

Vink

Omschrijving:

Brandwerende deur

Bedrag:

€ 2.350

↓

Projectkosten.

---

## Factuur autoverzekering

Geen project.

↓

Algemene kosten.

↓

Grootboek:

Autoverzekeringen.

---

## Factuur Microsoft 365

↓

Algemene kosten.

↓

ICT.

---

## Factuur Hilti

Gebruiker kiest:

Projectgebonden

of

Algemene voorraad.

---

# Projectdashboard

Per project tonen:

Contractwaarde

*

Meerwerk

*

Materiaalkosten

*

Onderaanneming

*

Materieel

*

Arbeid

*

Overige projectkosten

=

Projectresultaat

Daarnaast tonen:

Nog te factureren

Nog te bestellen

Open inkoop

Open meerwerk

Open werkbonnen

Voortgang

Marge

---

# Algemene kosten (AK)

Maak een apart dashboard.

Toon realtime:

Personeelskosten

Huisvesting

Auto's

ICT

Verzekeringen

Marketing

Kantoor

Rente

Overige kosten

Totaal AK per maand.

---

# AK-dekking

Dit wordt een belangrijk dashboard.

Toon:

Maandelijkse AK

Bijvoorbeeld:

€ 128.000

Gedekte AK uit projecten

€ 112.000

Tekort

€ 16.000

Of:

Overschot

€ 21.000

Hiermee ziet de directie direct of de lopende projecten voldoende bijdragen aan de vaste kosten.

---

# Liquiditeitsdashboard

Toon dagelijks:

Banksaldo (via AccountView)

Open debiteuren

Open crediteuren

Verwachte ontvangsten

Verwachte uitgaven

BTW

Lonen

Belastingen

Beschikbare liquiditeit

Verwachte liquiditeit over:

7 dagen

30 dagen

90 dagen

---

# Projectcontrol

Per project tonen:

Begroot

Werkelijk

Nog te verwachten

Afwijking

Per kostensoort.

Bijvoorbeeld:

Arbeid

Begroot:

€ 18.000

Werkelijk:

€ 16.500

Nog verwacht:

€ 3.200

Eindverwachting:

€ 19.700

Afwijking:

* € 1.700

Hetzelfde voor:

Materialen

Onderaanneming

Materieel

Overige kosten

---

# Managementdashboard

Toon:

Omzet deze maand

Omzet dit jaar

Resultaat

Brutomarge

AK

Liquiditeit

Open offertes

Open opdrachten

Open facturen

Nog te factureren

Onderhanden werk

Meerwerk

Verwachte winst

---

# Factuurworkflow

Facturen krijgen een workflow.

Ontvangen

↓

Project gekozen

↓

Controle

↓

Goedgekeurd

↓

Synchroniseren met AccountView

↓

Verwerkt

Iedere stap wordt gelogd.

---

# Synchronisatie AccountView

Dagelijks automatisch:

Van Connect naar AccountView:

* Inkoopfacturen
* Projectkoppeling
* Grootboek
* Kostenplaats
* Kostendrager

Van AccountView naar Connect:

* Banksaldo
* Debiteuren
* Crediteuren
* Betalingen
* Grootboekstanden
* BTW
* Factuurstatus

AccountView blijft leidend voor de financiële administratie.

---

# AI Financieel Coach

AI ondersteunt de directie.

Voorbeelden:

"Project Vink dreigt 8% over budget te gaan."

"Er staat € 18.000 aan goedgekeurd meerwerk nog niet gefactureerd."

"De algemene kosten zijn deze maand hoger dan gemiddeld."

"Op basis van de huidige planning ontstaat over drie weken een liquiditeitstekort."

"Project Domijn heeft voldoende marge om de toegewezen algemene kosten te dekken."

"De dekking van de vaste kosten is momenteel 94%."

AI doet alleen analyses en voorstellen.

Geen automatische financiële boekingen.

---

# Drill-down

Vanuit ieder bedrag moet kunnen worden doorgeklikt.

Bijvoorbeeld:

AK ICT

↓

Microsoft

Adobe

OpenAI

Telefonie

↓

Facturen

↓

Boeking

↓

PDF

↓

Project (indien gekoppeld)

---

# Eindresultaat

FPS Connect wordt het centrale stuurinstrument voor de directie.

Niet alleen inzicht in omzet en winst, maar vooral antwoord op vragen als:

* Welke projecten verdienen geld?
* Welke projecten lopen financieel uit de pas?
* Welke kosten zijn projectgebonden?
* Welke kosten zijn algemene bedrijfskosten?
* Dekken de lopende projecten onze vaste algemene kosten?
* Hebben we voldoende liquiditeit?
* Waar zitten de financiële risico's?

AccountView blijft de officiële boekhouding, terwijl Connect de realtime projectcontrol, managementinformatie en financiële sturing verzorgt.
