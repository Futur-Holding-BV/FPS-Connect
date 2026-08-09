# PLANNER_01 — FPS Planner integreren in Connect

**Opdracht voor Replit · 9 augustus 2026**
**Gemeten op `fps-one` @ `d3bf870` en `fps-connect` @ `7030a81`**

---

## 1. Waar het over gaat

[stated] René: de planner moet worden afgebouwd naar de gebruikseisen en **daarna geïntegreerd in Connect, als een eigen hoofdstuk**.

De planner (`vinkrene-jpg/fps-connect`, 324 bestanden, 78 routes, 14 tabellen) plant **woningen en bewoners**: Excel met NAW inladen, werkzaamheden per woning toekennen, bewoners per mail uitnodigen, bewoner kiest zelf een tijdvak in het portaal.

[stated] René over het werk zelf: bouw en brandpreventie voeren opdrachten uit die feitelijk niet verschillen — meterkast-, cv- en keukendoorvoeren, voordeuren, kozijnen, glas, vrijloopdeurdrangers met rookmelder. Woningen op de bovenste verdieping hebben geen dakdoorvoer en wijken dus af.

---

## 2. Het dragende principe

**Connect bezit mensen, tijd en capaciteit. De planner bezit woningen, bewoners en afspraken.**

Alles in de planner dat aan de Connect-kant van die lijn ligt, vervalt bij integratie. Dat is niet onderhandelbaar: twee systemen die allebei weten wie er morgen beschikbaar is, gaan uit elkaar lopen en dan is de fout al per mail bij een bewoner beland.

---

## 3. Drie planningslagen, geen twee

Gemeten in Connect:

| Laag | Waar | Wat het beantwoordt |
|---|---|---|
| **Grofplanning** | `uitvoeringsplannen` + `uitvoeringsplan_taken` (fase, duurDagen, benodigdeMedewerkers, urenbegroting, afhankelijkheden) | welke fasen, hoe lang, hoeveel mensen |
| **Bewonersplanning** | de planner | welke wóning op welke dag, in welk tijdvak |
| **Inzetplanning** | `planning_items` (medewerkerId, datum, tijdStart/Eind, uren, tijdsloten, werknummer, `op_gesloten_dag`) | welke mónteur waar en wanneer |

De bewonersplanning is de **vraagkant**: hij bepaalt hoeveel werk er op een dag ligt. De inzetplanning is de **aanbodkant**. Ze mogen niet allebei de dag bezitten.

---

## 4. Wat er uit de planner verdwijnt

Gemeten: **vijf van de veertien plannertabellen hebben een tegenhanger in Connect.**

| Plannertabel | Wordt | Waarom |
|---|---|---|
| `medewerkers` (naam, e-mail, telefoon, functie) | Connect `medewerkers` + `gebruikers` | de plannerversie kent geen rechten, geen verlof, geen contracturen |
| `organizations` | Connect `werkgevers` | FPS heeft meerdere BV's; die staan al in Connect |
| `planning_blocks` (medewerker × datum × tijdvak × uren) | Connect `planning_items` | dit is inzetplanning, en die is van Connect |
| `time_entries` (workOrder, medewerker, datum, uren) | Connect `uren_registraties` | uren horen bij de weekstaat, ADV, uurcodes en nacalculatie (zie `UREN_01`) |
| `projects` — het planningsdeel | zie §5 | de opdracht en het gebouw bestaan al in Connect |

**Wat blijft, want daar heeft Connect niets voor:**

- `bewoners` — persoonsgegevens van derden; een bewoner is geen `crm_klant`
- `bewoners_werkzaamheden` — welke werkzaamheden op welk adres
- `afspraken`, `contactmomenten`, `handtekeningen`, `mailings`, `mailteksten`
- `work_orders` — een taak per woning per werkzaamheid, met meerwerknummer; op woningniveau heeft Connect dat niet

---

## 5. `projects` valt uiteen in twee delen

De plannertabel `projects` bevat twee soorten gegevens die na integratie uit elkaar moeten:

**Deel A — bestaat al in Connect en vervalt:** naam, opdrachtgever, adres, plaats, contactpersoon, status, fase. Dat is de **opdracht** en het **gebouw**.

**Deel B — bestaat nog niet in Connect en blijft, in een nieuwe tabel `bewonersplannen` per opdracht:** startdatum, einddatum, aantal beschikbare dagen, `capaciteit_per_dag`, `aantal_monteurs`, `dag_min_minuten` (420), `dag_max_minuten` (510), `werkdagen`-array, `uitsluitingsdagen`, e-mailafzender, logo, projectinformatie voor de bewoner.

**En hier zit het punt dat de integratie moet regelen — maar anders dan het lijkt.**

[stated] René: *"In de planner bepalen wij vooraf welke capaciteit. Dus 1 of meer monteurs. Die capaciteit bepaalt dus het werktempo: 1 monteur = 1 woning per dag, 2 monteurs = 2 woningen per dag."*

De capaciteit is dus **geen afspiegeling van wie er toevallig beschikbaar is, maar een bewuste keuze vooraf**. Hij bepaalt het tempo, het aantal woningen per dag en daarmee de doorlooptijd van het project. Die keuze hoort thuis in de planner en blijft daar. **`capaciteit_per_dag` en `aantal_monteurs` blijven dus op het bewonersplan staan.**

Wat wél geregeld moet worden is de andere kant: **Connect moet die toegezegde capaciteit ook leveren.**

Zodra een bewoner een tijdvak kiest, is er een belofte de deur uit. Wordt een van de twee toegezegde monteurs daarna op verlof gezet of naar ander werk gehaald, dan staat er op die dinsdag maar één man voor twee woningen — en dat merk je nu pas op de ochtend zelf.

Daarom:

1. **De capaciteit uit het bewonersplan wordt een claim op de inzetplanning van Connect.** Voor elke werkdag in de projectperiode legt het plan vast: op deze dag zijn N monteurs toegezegd aan dit project.
2. **Connect bewaakt of die claim gedekt is.** Zijn er op een dag met toegezegde capaciteit minder monteurs ingepland dan toegezegd — door verlof, afwezigheid, een collectieve vrije dag of ander werk — dan is dat een **werkbaksignaal naar de werkvoorbereider en de projectleider**, met de datum en het verschil erbij.
3. **Het signaal gaat af zodra het gat ontstaat**, niet op de dag zelf. Er zijn dan nog dagen om te schuiven of de bewoner te bellen.
4. **De planner rekent zijn tijdvakken uit met de toegezegde capaciteit**, niet met de werkelijke bezetting. Anders verschuift het aanbod aan bewoners elke keer dat er iemand ziek wordt, en dat is precies wat je niet wilt bij een agenda die al verstuurd is.

Kort: **de planner beslist, Connect moet volgen, en het verschil tussen die twee wordt bewaakt.**

## 6. Werkzaamheden — één plek voor arbeidstijd

De planner heeft `werkzaamheden` met `arbeidstijd_minuten`, `aantal_monteurs`, een interne én een bewonersomschrijving, voorbereidingstekst, veiligheidsinstructie, afsluitende tekst en locatie in de woning.

Connect heeft `mod_calc_normtijden` met `code`, `omschrijving`, `eenheid`, `uren_per_eenheid` — de uurcodes uit `UREN_01` §6b.

**Die twee mogen niet allebei de arbeidstijd bezitten.** Een werkzaamheid in de planner krijgt daarom een **verwijzing naar de normtijdcode**, en de arbeidstijd komt daaruit. De teksten voor de bewoner blijven van de planner — die horen niet in een calculatiebestand.

Winst die daarmee vanzelf ontstaat: uren die op zo'n woning geschreven worden, dragen dezelfde uurcode als de calculatie. Begroot tegenover geschreven per werksoort werkt dan ook voor dit soort werk.

**Kan een werkzaamheid niet aan een normtijdcode gekoppeld worden, meld dat dan** in plaats van er een los getal naast te zetten.

---

## 7. Het portaal — één mechanisme

Connect heeft `routes/portaal.ts` met tokens, en de planner heeft een eigen `routes/portaal.ts` met `/kies`, `/weiger` en `/bel-mij-terug`.

**Er komt één tokeninfrastructuur.** Onderzoek en meld welke van de twee de basis wordt, met de reden. De bewonershandelingen (kiezen, weigeren, terugbelverzoek) blijven inhoudelijk zoals ze zijn — die zijn goed.

**Harde eis:** een bewoner ziet uitsluitend zijn eigen afspraak. Geen adressenlijst, geen planning van het complex, geen namen van monteurs. De `AuthService` in `lib/platform/identity.ts` van de planner doet dit al goed; die scheiding moet overeind blijven.

---

## 8. Bewaking — naar de bestaande werkbak

**Geen eigen meldingenstroom.** Zes signalen als voeder in `lib/bewakingsloop.ts`:

| Signaal | Naar wie | Waarom |
|---|---|---|
| **Toegezegde capaciteit niet gedekt** | werkvoorbereider + projectleider | er is een afspraak met een bewoner die niet bemand is |
| **Terugbelverzoek** | administratie, **dezelfde dag** | dit is geen signaal maar een belofte aan een mens |
| Geen reactie na herinnering | administratie | nabellen |
| Geweigerde afspraak | administratie | er moet iets geregeld worden |
| **Restwoningen** — geen afspraak terwijl de periode vordert | werkvoorbereider | dit loopt stil op als niemand kijkt |
| **Gat in de dagvulling** — dag onder `dag_min_minuten` | werkvoorbereider | een halflege dag is verloren capaciteit |
| **Woningen passen niet meer binnen de einddatum** | projectleider | dit is een gesprek met de opdrachtgever, en hoe eerder hoe beter |

De eerste drie zijn mensenwerk voor de administratie; de laatste drie zijn planningsproblemen.

**Het laatste signaal is de zwaarste en moet vooruitkijken**, niet pas afgaan als de einddatum verstreken is: zodra het aantal resterende woningen maal de arbeidstijd niet meer past in de resterende beschikbare dagen.

---

## 9. Verzetten en niet thuis — dit ontbreekt volledig

Gemeten in de planner: **nul treffers** op verzetten, herplannen, niet thuis, no-show of afzeggen — niet in de code en niet in het datamodel.

Bij vijftig woningen is dit gegarandeerd het meest voorkomende geval. Toe te voegen:

- **de bewoner verzet zelf**, via dezelfde portaallink, tot een in te stellen aantal dagen vooraf
- **niet thuis aangetroffen** — vast te leggen door de monteur in de app, waarna de woning terugvalt naar "opnieuw in te plannen" en op de werkbak komt
- **intern verzetten** door de administratie, met automatisch bericht aan de bewoner
- elke verzetting wordt vastgelegd in `contactmomenten` — wie, wanneer, waarom

---

## 10. Privacy

Bewonersgegevens zijn persoonsgegevens van **derden**, aangeleverd door de opdrachtgever. Dat is zwaarder dan klantgegevens.

- Aansluiten op de bestaande `lib/avgOpruiming.ts`, met een bewaartermijn per project.
- Na afronding van het project worden NAW, e-mail en telefoon van bewoners verwijderd; wat blijft is wat er gedaan is, zonder persoon.
- Handtekeningen zijn bewijsstukken en volgen een eigen termijn — **die moet René vaststellen, niet Replit.**
- De e-mailgrendel (`EMAIL_ALLOWLIST_DOMAINS`) blijft na integratie bestaan en blijft standaard aan.

---

## 11. Volgorde

1. **Eerst het proefproject** in de losse planner, met fictieve bewoners op `fpsbouw.nl` en `fpsbrandpreventie.nl`. Wat daar stukloopt hoort in deze opdracht vóórdat er geïntegreerd wordt.
2. Dan §4 en §5: de dubbele tabellen eruit, capaciteit ophalen bij Connect.
3. Dan §6 tot en met §10.

**Begin niet aan stap 2 voordat stap 1 is gemeld.**

---

## 12. Verboden

- De capaciteit uit het bewonersplan niet vervangen door de werkelijke bezetting; het aanbod aan bewoners mag niet meebewegen met ziekte of verlof.
- Geen tweede urenregistratie; `uren_registraties` is de enige.
- Geen tweede medewerkers- of organisatietabel.
- Geen arbeidstijd op twee plekken; de normtijdcode is leidend.
- Geen tweede tokeninfrastructuur voor het portaal.
- Geen eigen meldingenstroom; de werkbak bestaat.
- Geen bewonersgegevens buiten de AVG-opruiming om.
- Een tijdvak aanbieden dat niet door beschikbare capaciteit gedekt is, is verboden — ook niet "voorlopig".

---

## 13. Twee vaste eisen

**Toets elke aanname en meld afwijkingen.** Controleer per onderdeel welke module en welk niveau de bijbehorende backendroute werkelijk eist, en meld elk verschil met wat hier staat — **pas niets stilzwijgend aan**.

**Wijk je af van de scope van deze opdracht, meld dat dan vóór je bouwt.**

---

## 14. Acceptatie

Met vermelding van commit-SHA, GitHub `main`-SHA en productie-SHA:

1. **Nulmeting gemeld:** hoeveel rijen er in elk van de veertien plannertabellen in productie staan. Staat er niets, dan is de migratie een formaliteit en moet dat gezegd worden.
2. Bewonersplanning staat in de zijbalk onder Uitvoering, vóór Planning. Toon het menu.
3. **De claim wordt bewaakt.** Zet twee monteurs toe op een project, zet er daarna een op verlof, en toon dat er een werkbaksignaal ontstaat met de datum en het tekort — **zonder dat het aanbod aan bewoners verandert**. *Dit is het belangrijkste acceptatiepunt.*
4. **Een collectieve vrije dag is geen werkdag in het bewonersplan** en levert dus geen tijdvakken op. Toon de dag vóór en na het vastleggen.
5. Een werkzaamheid draagt een normtijdcode en de arbeidstijd komt daaruit. Toon een werkzaamheid waarvan de code niet te bepalen was, met de melding.
6. Uren op een woning verschijnen in `uren_registraties` met de juiste uurcode, en in de weekstaat van die monteur.
7. Een bewoner ziet via zijn link uitsluitend zijn eigen afspraak. Toon het serverantwoord en bewijs dat er geen andere adressen in zitten.
8. **Verzetten werkt** langs alle drie de wegen (bewoner zelf, niet thuis, administratie), en elke verzetting staat in `contactmomenten`.
9. Elk van de zes signalen uit §8 komt aan bij de juiste ontvanger. Toon de regels uit `bewaking_draaien`.
10. Het einddatumsignaal gaat af **vóórdat** de einddatum verstreken is. Toon de berekening.
11. Na het afronden van een proefproject zijn de bewonersgegevens opgeruimd volgens de termijn, en is vastgelegd wat er gedaan is zonder persoonsgegevens.
