# Opdracht Replit – Urenregistratie & Weekstaten FPS Connect

## Doel

Ontwikkel een complete urenregistratiemodule binnen FPS Connect voor:

* eigen monteurs;
* timmermannen;
* uitzendkrachten;
* zzp'ers;
* toekomstige buitendienstmedewerkers.

De module moet zeer eenvoudig zijn in gebruik, zodat medewerkers dagelijks in minder dan één minuut hun uren kunnen registreren.

De urenregistratie vormt de basis voor:

* personeelsadministratie;
* ADV-opbouw;
* nacalculatie;
* projectbewaking;
* werkvoorbereiding;
* controle van facturen van uitzendbureaus;
* formele weekstaten voor opdrachtgevers.

---

# Uitgangspunt

Iedere medewerker krijgt automatisch zijn planning te zien.

Per dag ziet hij bijvoorbeeld:

07:00 - 16:00

Project:
Domijn - Flat Eschmarke

Werkzaamheden:
Brandwerende doorvoeringen

De medewerker hoeft alleen nog te bevestigen dat dit klopt.

Met één druk op de knop:

✓ Planning gevolgd

of

Planning wijzigen

---

# Wanneer planning wordt gewijzigd

De medewerker moet eenvoudig kunnen wijzigen:

* project
* gebouw
* werkzaamheden
* begin- en eindtijd
* pauze
* opmerkingen

Eventueel meerdere projecten op één dag.

Bijvoorbeeld:

07:00 - 10:30
Project A

11:00 - 15:00
Project B

15:00 - 16:00
Magazijn

---

# Registratie

Per regel wordt opgeslagen:

* datum
* medewerker
* dienstverband
* project
* gebouw
* werkzaamheden
* begin
* einde
* pauze
* netto uren
* opmerkingen

---

# Automatische berekeningen

Het systeem berekent automatisch:

* totaal uren per dag
* totaal uren per week
* totaal uren per project
* totaal uren per medewerker

---

# ADV

Alleen medewerkers met een arbeidsovereenkomst onder de Metaal & Techniek CAO bouwen ADV op.

Voor deze medewerkers:

40 gewerkte uren

=

38 betaalde uren

*

2 ADV-uren

Het systeem moet automatisch herkennen welk dienstverband iemand heeft.

Dus:

Eigen personeel

→ ADV toepassen

ZZP

→ geen ADV

Uitzendkracht

→ geen ADV

Inleners

→ geen ADV

---

# Nacalculatie

Alle geregistreerde uren moeten automatisch gekoppeld worden aan:

* project
* gebouw
* werkzaamheden
* fase

Hierdoor kan later worden berekend:

* begrote uren
* werkelijke uren
* meerwerk
* minderwerk
* efficiency per project

Deze koppeling wordt later gebruikt in de nacalculatiemodule.

---

# Werkvoorbereiding

De uren moeten tevens beschikbaar zijn voor toekomstige werkvoorbereiding.

Voorbeelden:

Gemiddeld aantal uren voor:

* vervangen woningtoegangsdeur
* brandschot
* doorvoering
* schacht
* inspectie

Hiermee kan de calculatiemodule steeds slimmer worden.

---

# Controle uitzendbureau

Voor uitzendkrachten vormen de ingevulde uren de officiële controle voor de ontvangen facturen.

Bij ontvangst van een factuur moet eenvoudig gecontroleerd kunnen worden:

Factuur:

40 uur

FPS Connect:

39,5 uur

Afwijking zichtbaar.

---

# Weekstaten

Het systeem moet automatisch formele weekstaten kunnen genereren.

Deze moeten voldoen aan de eisen van opdrachtgevers.

Gegevens:

* voornaam
* achternaam
* geboortedatum
* BSN
* werkgever
* project
* weeknummer

Per dag:

* begin
* einde
* pauze
* gewerkte uren

Onderaan:

* totaal uren
* handtekening medewerker (optioneel)
* handtekening uitvoerder (optioneel)

De weekstaat moet als PDF gegenereerd kunnen worden.

---

# Opslag weekstaten

Weekstaten worden automatisch opgeslagen bij:

Project

↓

Gebouw

↓

Documenten

↓

Weekstaten

Van daaruit zijn ze:

* te bekijken
* opnieuw te genereren
* te downloaden
* af te drukken

De opslaglocatie moet later eenvoudig aangepast kunnen worden als hiervoor een aparte documentmodule wordt ingericht.

---

# Beheer

Projectleiding moet weekstaten kunnen:

* bekijken
* corrigeren
* goedkeuren
* opnieuw genereren

Wijzigingen worden gelogd.

---

# Mobiele app

De urenregistratie moet volledig mobiel bruikbaar zijn.

Doel:

Binnen 30 seconden uren invullen.

Zo min mogelijk typen.

Voorkeur voor:

* planning bevestigen
* schuifknoppen
* dropdowns
* tijdselectie

---

# Desktop

Op kantoor komt een uitgebreid overzicht.

Filters:

* medewerker
* project
* gebouw
* opdrachtgever
* week
* maand
* jaar
* dienstverband

Daarnaast dashboards met:

* open weekstaten
* ontbrekende uren
* ADV-overzicht
* uren per project
* uren per medewerker
* uren per opdrachtgever

---

# Technische eisen

* Automatisch vullen vanuit de planning.
* Planning mag eenvoudig worden aangepast aan de werkelijkheid.
* Alle wijzigingen worden gelogd.
* Ondersteuning voor meerdere projecten per dag.
* Geschikt voor duizenden medewerkers en honderdduizenden urenregistraties.
* Koppelingen voorbereiden voor:

  * planning;
  * nacalculatie;
  * calculatie;
  * werkvoorbereiding;
  * salarisadministratie (toekomst);
  * factuurcontrole uitzendbureaus.

Het systeem moet modulair worden opgebouwd, zodat toekomstige uitbreidingen mogelijk blijven zonder de bestaande urenregistratie aan te passen.
