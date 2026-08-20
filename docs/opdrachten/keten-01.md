# KETEN_01 — de processen echt doorlopen

**Opdrachtgever:** René · **Uitvoerder:** Replit · **Datum:** 11 augustus 2026

---

## 1. Waarom

Connect legt veel vast. De vraag is of er ook iets gebeurt. Dat is niet te beantwoorden door naar code te kijken en ook niet door één scherm te testen — dat moet je aflopen, van binnenkomende aanvraag tot uitgevoerd werk.

En er is een valkuil die deze opdracht als eerste dichttimmert: **een doorloop zonder foutmelding is geen bewijs dat het proces gelukt is.** Een knop kan netjes reageren, een scherm kan netjes sluiten, en er is niets gebeurd. Precies dat is eerder gebeurd bij de materiaalaanvraag: goedkeuren werkte, en er kwam geen bestelling uit.

Daarom geldt hier één harde regel.

---

## 2. De hoofdregel: einddoel eerst

**Voor elk proces wordt vooraf opgeschreven wat het meetbare einddoel is — en pas daarna wordt er getest.**

Een einddoel is nooit "het scherm gaf geen fout". Het is iets dat je in de gegevens kunt zien:

- er bestaat een nieuw record van een bepaald soort, gekoppeld aan het vorige
- een bepaald veld staat op een bepaalde waarde
- een taak in de werkbak is geopend, of juist gesloten
- een handeling die niet mocht, is geweigerd met een reden

Voorbeeld van goed en fout:

| Fout einddoel | Goed einddoel |
|---|---|
| "De offerte kon verstuurd worden" | "De offerte staat op verzonden, er is een verzendmoment vastgelegd, en de klant heeft een geldige portaallink" |
| "Materiaal goedkeuren werkte" | "Er bestaat een concept-inkoopbon die verwijst naar deze aanvraag, en de taak in de werkbak is gesloten" |
| "Uren schrijven lukte" | "Uren op een opdracht zonder vastgelegd akkoord worden geweigerd met een leesbare reden" |

**Fase 0 van deze opdracht is niets anders dan die lijst opstellen.** Die gaat naar René ter goedkeuring voordat er één test gebouwd wordt. Wordt een einddoel later tijdens het bouwen bijgesteld, dan moet dat apart gemeld worden — anders schuift de lat mee met wat toevallig werkt.

---

## 3. Wat er al is

In het project staat al een klikbare testomgeving die de app echt opent en bedient, met zestien tests: inloggen, gebouw aanmaken, de personeelswizard, de offerte-badge, de ENK-import, de rapportenbibliotheek.

**Ze zijn allemaal per scherm. Geen enkele loopt een keten door.** Gebruik die omgeving; bouw er geen tweede naast.

---

## 4. De processen

Elk proces wordt afzonderlijk doorlopen, met een eigen einddoel per stap én een einddoel voor het geheel.

**1 — Aanvraag binnen.** Een mail met een offerteaanvraag komt binnen, wordt herkend, en landt bij de juiste klant en het juiste gebouw.

**2 — Opname.** Er wordt een opname vastgelegd op dat gebouw, met de werkomschrijving.

**3 — Calculatie.** Er ontstaat een calculatie die aan die opname hangt, met regels en een totaalbedrag.

**4 — Offerte.** Uit de calculatie ontstaat een offerte, die verstuurd wordt, door de klant geopend en getekend.

**5 — Akkoord.** Er ontstaat een opdracht met een vastgelegde akkoordgrond.

**6 — Werkvoorbereiding.** Werkbegroting en planning op die opdracht.

**7 — Materiaal.** Een monteur vraagt materiaal aan, de werkvoorbereider keurt goed, er ontstaat een concept-bestelling en het taakje sluit.

**8 — Uren.** Een monteur schrijft uren op die opdracht.

**9 — Inkoopfactuur.** Een factuur van de leverancier komt binnen, wordt gekoppeld aan de bestelling, en de prijs wordt tegen de afspraak gecontroleerd.

**10 — Facturatie.** Er gaat een factuur naar de klant.

**11 — Afronding.** De opdracht wordt afgesloten.

---

## 5. De varianten

De hoofdlijn is één route. Daarnaast wordt elk keuzepunt apart afgelopen, als korte aftakking vanaf het punt waar hij ontstaat — niet als volledige nieuwe keten.

| Keuzepunt | Varianten |
|---|---|
| Offerte-afloop | getekend · afgewezen · ingetrokken · verlopen zonder reactie |
| Akkoordgrond | ondertekende offerte · opdrachtbevestiging van de klant · vrijgave door de projectleider |
| Bedrag | onder tien mille · boven tien mille, dus langs de bedrijfsleider |
| Akkoord zonder offerte | akkoord op alleen een calculatie, waarna er alsnog een offerte met prijsafspraak moet ontstaan |
| Materiaal | volgens de opdracht · afwijkend van de opdracht |
| Bestelweg | rechtstreeks inkopen · uit voorraad, zodra het magazijn in gebruik is |
| Uren | op een opdracht met akkoord · op een opdracht zonder akkoord · zonder opdracht |
| Terugzetten | status terugzetten als gewone gebruiker · als hoofdbeheerder |
| Prijscontrole | factuurprijs gelijk aan de afspraak · factuurprijs hoger |

**Bij de varianten die niet mogen lukken is het einddoel de weigering.** Een test die slaagt omdat het toch lukte, is een gevonden lek en moet als zodanig gerapporteerd worden.

---

## 6. Hoe er gerapporteerd wordt

Per proces en per variant één regel met drie mogelijke uitkomsten:

- **doorlopen** — het einddoel is bereikt en aantoonbaar in de gegevens terug te vinden
- **vastgelopen** — met de stap waar het stokte en wat er wel en niet ontstond
- **schijnbaar gelukt** — de handeling gaf geen fout, maar het einddoel is niet bereikt. **Dit is de belangrijkste categorie van deze hele opdracht**, want dit is wat je zonder deze test niet ziet

Bij elke stap een schermafdruk vóór en na, en bij het einddoel de gevonden gegevens erbij.

---

## 7. Regels

1. Klikken, niet rechtstreeks naar een adres springen. Alleen het openen van de app aan het begin mag zo.
2. De test maakt zijn eigen gegevens aan en ruimt ze daarna op, of markeert ze duidelijk als testgegevens. Nooit iets dat later voor echt kan doorgaan.
3. Er wordt niets gerepareerd. Deze opdracht meet. Wat rood is, gaat naar René.
4. Een einddoel wordt niet tijdens het bouwen versoepeld. Blijkt een einddoel niet haalbaar, dan is dat de bevinding.
5. Geen tweede testomgeving naast de bestaande.
6. Wijk je af van deze opdracht, meld dat dan vóór je begint.

---

## 8. Volgorde

1. **Fase 0** — de lijst met einddoelen per proces en per variant. Gaat naar René. Er wordt niets gebouwd voordat die lijst akkoord is.
2. **Fase 1** — de hoofdlijn van proces 1 tot en met 11 in één doorloop.
3. **Fase 2** — de varianten, in de volgorde van de tabel hierboven.
4. **Fase 3** — het eindrapport uit hoofdstuk 6.

---

## 9. Twee dingen die eerst opgelost moeten zijn

**De automatische uitvoering op GitHub ligt stil.** Alle meldingen melden dat er geen taken zijn uitgevoerd, wat wijst op een limiet- of betaalprobleem op het account. Zolang dat staat, kunnen deze tests niet automatisch draaien — handmatig starten kan wel.

**Connect is nog niet in gebruik.** Er staan geen offerten en geen opdrachten in. Dat is voor deze opdracht geen bezwaar, want de test maakt zijn eigen gegevens aan. Het betekent wel dat wat hier rood uitkomt, echt aan het systeem ligt en niet aan ontbrekende gegevens.

---

## 10. Waar de uitkomst landt en welk besluit eraan hangt

De lijst met einddoelen en het eindrapport komen als document in de metingen-map. **Het eindrapport is de bouwlijst voor de komende weken**: alles wat vastloopt of schijnbaar lukt, is werk. Alles wat er niet in staat, is voorlopig niet belangrijk.
