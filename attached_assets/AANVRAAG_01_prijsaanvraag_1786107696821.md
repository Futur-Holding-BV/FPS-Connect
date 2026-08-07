# AANVRAAG_01 — Van prijsaanvraag naar projectkans, met conceptantwoord

**Opdrachtgever:** René Vink · **Datum:** 7 augustus 2026 · **Uitvoerder:** Replit
**Systeem:** FPS Connect (`vinkrene-jpg/fps-one`, branch `main`)
**Volgorde:** ná `FACTUUR_02`. Deze opdracht hergebruikt hetzelfde intake-mechanisme; bouw dat niet twee keer.

**Verplicht vooraf lezen:** `replit.md` · `docs/ontwikkelfilosofie.md` · `docs/kwaliteitskader.md` · `docs/PRODUCTION_RUNBOOK.md` · `.agents/memory/MEMORY.md`

---

## 1. Hoe het nu gaat

Alle aanvragen komen bij René binnen — meestal doordat de klant rechtstreeks mailt, soms via een werkvoorbereider die de mail ontvangt. Die mails gaan nu naar de administratie, die het project aanmaakt in **ENK**. ENK is calculatiesoftware en wordt door Connect vervangen; het registreren van een aanvraag daarin is een omweg die eruit moet.

**Wat het moet worden:** een binnengekomen prijsaanvraag wordt automatisch vastgelegd, er staat direct een conceptantwoord klaar, René accordeert dat, en Connect bewaakt daarna de reactietijd.

---

## 2. Twee processen, en waar het project vandaan komt

Het werk valt uiteen in twee processen, met de klantakkoord op de offerte als grens:

```
PROCES 1 — aanvraag tot en met offerte
  mail binnen
    → AI stelt voor: nieuwe aanvraag, of meerwerk op iets bestaands
        → René accordeert
            → aanvraag vastgelegd, gekoppeld aan klant en gebouw
                → opname (optioneel)
                    → calculatie
                        → offerte

  ── grens: de klant accordeert de offerte ──

PROCES 2 — akkoord tot en met oplevering
    → project ontstaat
        → werkvoorbereiding
            → uitvoering
                → oplevering
```

### Gebouw en project zijn hetzelfde — en dat blijkt uit de schema's

René: *"Gebouw en project zijn hetzelfde."* **Gemeten op 7 augustus 2026, en dat klopt:**

`gebouwenTable` bevat al alles wat een project nodig heeft: `werknummer` (uniek) · `projectnummer` (uniek) · `project_status` · `gereed_op` en `gereed_door` (de oplevering) · `gearchiveerd` · `werkgever_id` (welke BV) · klant, adres en omschrijving.

En de hele keten hangt eraan:

| Onderdeel | Hangt aan |
|---|---|
| Opname | `gebouw_id` |
| Calculatie | `gebouw_id` |
| Offerte | `gebouw_id` en `klant_id` |

**Het gebouw is dus de drager van proces 1 én proces 2.** Van aanvraag tot oplevering hangt alles aan hetzelfde record.

### Eén gebouw, meerdere opdrachten — en waar dat nu misgaat

**Toelichting van René (7 augustus 2026):** bij renovatieprojecten komen ze binnen met één opdracht, maar volgen daarna meerdere meerwerkopdrachten. Om de financiële bewaking per opdracht te kunnen doen, **krijgt elke meerwerkopdracht een eigen werknummer.**

Daarmee is het model helder:

| Begrip | Wat het is | Hoeveel |
|---|---|---|
| **Gebouw** | het fysieke pand — adres, type, verdiepingen | één, blijvend |
| **Opdracht** (nu `projecten`) | één klus met eigen werknummer, eigen doorlooptijd en eigen financiële bewaking | meerdere per gebouw |

`projectenTable` is dus **niet overbodig** — hij is precies de opdracht. Optie A uit een eerdere versie van dit document vervalt.

**Maar er zitten twee gemeten problemen in het huidige model, en die raken direct de financiële bewaking die René noemt:**

**Probleem 1 — projectvelden staan op het gebouw.** `gebouwenTable` bevat `werknummer` (uniek), `projectnummer` (uniek), `project_status`, `gereed_op` en `gereed_door`. Dat zijn eigenschappen van een ópdracht, niet van een pand. Een gebouw met vijf meerwerkopdrachten kan maar één werknummer en één opleverdatum dragen. De duplicatie loopt dus andersom dan eerder in dit document stond: niet `projecten` is de kopie, maar de projectvelden op `gebouwen`.

**Probleem 2 — en dit is het zwaarste: opname, calculatie en offerte hangen uitsluitend aan `gebouw_id`, niet aan een opdracht.** Staan er vijf meerwerkopdrachten op één gebouw, dan is **niet vast te stellen welke calculatie bij welke opdracht hoort.** Precies de financiële bewaking per opdracht die René wil, wordt door het datamodel niet ondersteund.

**Dit vraagt een besluit van René vóórdat deze opdracht wordt afgebouwd**, want het bepaalt waar de aanvraag aan gekoppeld wordt:

- **Opdracht wordt de drager.** `opnames`, `calculaties` en `offertes` krijgen een verwijzing naar de opdracht; het gebouw blijft eraan hangen via die opdracht. De projectvelden verhuizen van `gebouwen` naar `projecten`. Dit is het model dat doet wat René beschrijft — maar het raakt bestaande gegevens en moet zorgvuldig gemigreerd worden.
- **Alles blijft zoals het is.** Dan blijft de financiële bewaking per meerwerkopdracht onmogelijk zolang er meer dan één opdracht op een gebouw loopt. Dat is een beperking, geen oplossing — hier expliciet benoemd zodat de keuze bewust is.

### Wat er in deze opdracht vastligt, ongeacht die keuze

De aanvraag wordt vastgelegd als **projectkans** in CRM (`crm_projectkansen`), gekoppeld aan de klant en aan het **gebouw**. Bestaat het gebouw nog niet, dan wordt het aangemaakt — na goedkeuring van het voorstel, nooit vanzelf.

Gaat het om **meerwerk op een lopende opdracht**, dan wordt dat als zodanig voorgesteld: zelfde gebouw, nieuwe opdracht met een eigen werknummer. Bij twijfel altijd "nieuwe aanvraag" voorstellen, mét vermelding van de lopende opdracht die werd overwogen.

**De ontbrekende schakel die hoe dan ook gebouwd moet worden:** een offerte kan nu nergens naar de projectkans verwijzen waaruit hij is voortgekomen — `offertes` heeft wel `gebouw_id`, `klant_id` en `calculatie_id`, maar geen verwijzing naar een projectkans. Voeg die toe, en zet vanuit de projectkans een directe handeling "offerte maken" die klant, gebouw, de aanvraagmail en de bijlagen meeneemt.

### De ongebruikte route

`POST /projecten` (`routes/projecten.ts` r. 108) wordt door geen enkel scherm aangeroepen, en krijgt met deze opdracht ook geen functie — projecten ontstaan uitsluitend bij ondertekening. **Verwijder hem, of documenteer expliciet waarvoor hij bestaat.** Laat hem niet ongebruikt staan; dan bouwt de volgende ontwikkelaar er alsnog op voort en ontstaat er alsnog een tweede aanmaakweg.

---

## 3. Wat er gebeurt bij een binnengekomen aanvraag

Het intake-mechanisme uit `FACTUUR_02` krijgt een tweede uitgewerkte actiesoort. `lib/documentIntelligence.ts` herkent de categorie `aanvraag` al (offerteaanvraag, RFQ, bestek) — hergebruik die, bouw geen tweede herkenner.

**Stap 1 — de AI doet een voorstel.** Hij bepaalt eerst welke van twee situaties het is:

- **Nieuwe aanvraag** — een losstaande vraag; er ontstaat een nieuwe projectkans.
- **Meerwerk op een lopend project** — de aanvraag hoort bij werk dat al in uitvoering is (proces 2). De AI stelt dan het gevonden project voor, met de reden erbij (zelfde klant én gebouw, verwijzing naar een werknummer in de mail, of een reactie in hetzelfde gespreksdraad).

Bij twijfel stelt de AI **nieuwe aanvraag** voor en benoemt hij welk bestaand project mogelijk bedoeld werd. Nooit stilzwijgend aan een lopend project hangen — dan verdwijnt een nieuwe opdracht ongemerkt in een oude en wordt er niet voor gefactureerd.

**Stap 2 — René accordeert het voorstel.** Pas daarna wordt de aanvraag vastgelegd of gekoppeld. Bij vastleggen worden meegenomen:

- de klant, gekoppeld aan een bestaande relatie in `crm_klanten` — of, als de afzender onbekend is, een voorstel voor een nieuwe relatie dat bevestigd moet worden;
- het gebouw, indien herkend;
- een korte titel afgeleid uit de aanvraag;
- de betreffende **BV** (FPS Bouw · FPS Brandpreventie · FPS Onderhoud) — bepaald uit het ontvangende mailadres of de inhoud;
- de bronmail en alle bijlagen, gekoppeld aan het project;
- datum en tijd van binnenkomst — dit is het startpunt voor de reactietijd.

**Stap 3 — conceptantwoord klaarzetten.** De AI schrijft een concept, in één van twee vormen:

- **Ontvangstbevestiging** — dank voor de aanvraag, we gaan ermee aan de slag;
- **Ontvangstbevestiging plus aanvullende vraag** — dank, en we hebben nog het volgende nodig om te kunnen calculeren.

De AI kiest de tweede vorm alleen als er aantoonbaar iets ontbreekt, en benoemt dan concreet wát. Verzin nooit een ontbrekend stuk om de tweede vorm te kunnen gebruiken.

**Stap 4 — René verstuurt het antwoord.** Het concept gaat niet vanzelf de deur uit. René leest het, past het zo nodig aan, en verstuurt. Verzenden gebeurt via de bestaande `beantwoord`-functie in `werk-inbox`, vanuit het juiste mailadres.

---

## 4. Reactietijd bewaken

Vanaf binnenkomst loopt een klok. Bewaakt worden:

- **de tijd tot het antwoord verstuurd is** — dit is de reactietijd naar de klant;
- **de tijd tot de aanvraag inhoudelijk is opgepakt** — dus tot de projectkans verder komt dan fase `signaal`.

De grenswaarden waarop iets "te laat" heet, worden **instelbaar** gebouwd en niet in de code vastgelegd. Zet ze voorlopig op een werkbare beginwaarde en maak ze aanpasbaar in de beheeromgeving — dit is een bedrijfskeuze die René later invult.

Verstrijkt een grens, dan verschijnt dat als gebeurtenis, in dezelfde vorm als de gebeurtenissen uit `FACTUUR_02`. Bouw geen tweede meldingsmechanisme.

---

## 5. Werkvoorbereiders

Komt de aanvraag binnen bij een werkvoorbereider in plaats van bij René, dan verandert er niets aan de verwerking — dezelfde intake, dezelfde projectkans, hetzelfde conceptantwoord.

Wie het concept accordeert, volgt uit het bestaande bevoegdhedenmodel. Bouw daar geen aparte constructie voor.

---

## 6. Acceptatie — in gewone taal

1. Komt er een prijsaanvraag binnen, dan krijg ik een voorstel: nieuwe aanvraag, of meerwerk op een lopend project.
2. Pas als ik dat voorstel goedkeur, wordt er iets vastgelegd — nooit vanzelf.
3. Bij twijfel stelt de AI een nieuwe aanvraag voor en zegt erbij welk lopend project hij overwoog.
4. De vastgelegde aanvraag heeft de klant, het gebouw, de BV, de aanvraagmail en de bijlagen er meteen aan hangen.
5. Er staat meteen een conceptantwoord klaar dat ik alleen hoef te lezen en te versturen.
6. Ontbreekt er iets in de aanvraag, dan staat dat concreet benoemd in het concept — geen algemene zin.
7. Er gaat nooit iets naar een klant zonder dat ik het heb gezien.
8. Is de afzender nog geen relatie, dan word ik gevraagd dat te bevestigen — er wordt niets stiekem aangemaakt.
9. Ik zie welke aanvragen te lang liggen, zowel qua antwoord als qua oppakken.
10. Vanaf de aanvraag kan ik in één handeling een offerte starten, met klant, gebouw en bijlagen al ingevuld.
11. Vanaf de offerte kan ik terug naar de aanvraag waar hij uit voortkwam.
12. **Er wordt bij binnenkomst geen project aangemaakt** — dat gebeurt pas als de klant de offerte accordeert, en dan precies één keer.

**Bewijs bij oplevering:** een echte aanvraagmail die na goedkeuring correct is vastgelegd met concept, een aanvraag die correct als meerwerk aan een lopend project werd voorgesteld, een volledige keten van aanvraag via offerte tot ondertekening waarbij aantoonbaar precies één project ontstond, een aanvraag van een onbekende afzender die om bevestiging vraagt, en een aanvraag die de reactietijdgrens overschrijdt en als gebeurtenis verschijnt. Plus commit-SHA, GitHub main-SHA, actieve productie-SHA.

## 7. Wat niet mag

- **Geen project aanmaken in proces 1.** Een project ontstaat uitsluitend bij ondertekening van de offerte.
- **Niets vastleggen zonder goedkeuring van het voorstel.**
- **Nooit stilzwijgend aan een lopend project koppelen** bij twijfel.
- Geen opname, calculatie of offerte aan een project hangen — die hangen aan het gebouw, zoals nu.
- Geen tweede documentherkenner naast `documentIntelligence.ts`.
- Geen tweede intake-mechanisme naast dat uit `FACTUUR_02`.
- Geen tweede gebeurtenis-/meldingsmechanisme.
- Geen mail die automatisch de deur uit gaat zonder menselijke goedkeuring.
- Geen relatie stilzwijgend aanmaken bij een onbekende afzender.
- Geen vastgelegde reactietijdgrenzen in de code.
- Niet melden dat het klaar is op grond van een geslaagde build of typecheck.
