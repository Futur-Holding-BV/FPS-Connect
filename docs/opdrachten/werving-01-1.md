# WERVING_01 — Cv tegen functieomschrijving, met vragenlijst

**Opdrachtgever:** René Vink · **Datum:** 8 augustus 2026 · **Uitvoerder:** Replit
**Systeem:** FPS Connect (`vinkrene-jpg/fps-one`, branch `main`)

**Verplicht vooraf lezen:** `replit.md` · `docs/ontwikkelfilosofie.md` · `docs/kwaliteitskader.md` · `docs/PRODUCTION_RUNBOOK.md` · `.agents/memory/MEMORY.md`

---

## 1. Wat René wil

Een cv laten beoordelen door de AI ten opzichte van de functieomschrijving, en daaruit een **vragenlijst** krijgen voor het gesprek. Hij voert regelmatig sollicitatiegesprekken.

**Gemeten op 8 augustus 2026 — de basis staat er al:**

- `functies` bevat per functie: naam · omschrijving · **taken** · **verantwoordelijkheden** · **competenties** · **opleidingsvereisten** · doorgroeipad · minimale bezetting. Dat is genoeg om een cv tegen te leggen.
- `documentIntelligence` kan sinds `DOCUMENT_01` documenten werkelijk lezen (220 DPI, `detail: "high"`, tot vijf pagina's) — een cv als pdf of scan is dus uitleesbaar.
- Connect heeft een **AVG-module** om de bewaartermijn op aan te sluiten.

**Wat ontbreekt: er is geen werving.** Geen kandidaten, geen gesprekken, geen uitkomst.

---

## 2. Wat de AI wél en niet doet — lees dit vóór het ontwerp

**De AI geeft geen oordeel over de kandidaat en geen score.** Geen cijfer, geen rangschikking, geen "geschikt/ongeschikt", geen percentage match.

Twee redenen. **Juridisch:** AI die wordt ingezet bij werving en selectie valt onder de zwaarste categorie van de Europese AI-verordening; een systeem dat kandidaten beoordeelt of rangschikt brengt verplichtingen mee die je hier niet wilt. Een systeem dat uitsluitend voorbereidt en structureert, doet dat niet. **Inhoudelijk:** een score voegt niets toe — René doet het gesprek en het oordeel. Wat hem tijd bespaart is voorbereiding, niet een cijfer.

**Wat de AI wél doet:**

1. **Toetsen wat aantoonbaar is.** Per eis uit de functieomschrijving (taken, verantwoordelijkheden, competenties, opleidingsvereisten): staat er iets over in het cv, en wát dan. Drie standen: **aantoonbaar aanwezig · niet genoemd · onduidelijk**.
2. **Onderbouwen.** Elke uitspraak verwijst naar waar het in het cv staat. Zonder vindplaats geldt het als "niet genoemd" — nooit als aanwezig verondersteld.
3. **Vragen opstellen** voor alles wat "niet genoemd" of "onduidelijk" is, plus vragen over wat wél aanwezig is maar doorvragen verdient.

---

## 3. Wat de AI niet mag meewegen

**Uitsluitend de eisen uit de functieomschrijving tellen.** De AI negeert en noemt niet: naam · leeftijd of geboortejaar · geslacht · nationaliteit of geboorteland · foto · adres of woonplaats · burgerlijke staat · gezondheid.

**Gaten in het arbeidsverleden mogen wel worden opgemerkt als vraag** ("periode 2021-2022 niet toegelicht"), maar nooit met een gissing naar de oorzaak.

Verifieer dit met een test: een cv met een foto en geboortedatum erin mag daar in de uitvoer nergens naar verwijzen.

---

## 4. De vragenlijst

**Per open of onduidelijk punt één vraag**, en daarnaast een vaste set kernvragen voor die functie.

**Regels:**
- **open vragen**, geen ja/nee-vragen;
- gericht op **wat iemand heeft gedaan**, niet op wat hij vindt — "beschrijf een doorvoering die niet ging zoals gepland en wat je toen deed" in plaats van "ben je nauwkeurig";
- **de vaste kernvragen zijn voor elke kandidaat op dezelfde functie identiek.** Alleen dan zijn twee kandidaten te vergelijken; verschillende vragen leveren onvergelijkbare antwoorden op;
- de lijst is **bewerkbaar** — René schrapt en voegt toe voordat hij het gesprek in gaat.

**Na het gesprek:** ruimte om per vraag een korte aantekening te maken, en één eindconclusie in eigen woorden. **De uitkomst wordt door de mens vastgelegd, niet door de AI voorgesteld.**

---

## 5. De wervingsregistratie — licht houden

- **kandidaat**: naam, contactgegevens, cv en eventuele bijlagen;
- **op welke functie** hij reageert;
- **via welk kanaal** hij binnenkwam — dit is het punt waar de meeste waarde zit: na een jaar weet je welk kanaal bruikbare mensen oplevert en welk niet;
- **status**: ontvangen · uitgenodigd · gesproken · afgewezen · aangenomen;
- **gespreksaantekeningen** en de uitkomst.

**Bouw geen sollicitatieportaal, geen vacatureteksten, geen mailcampagnes.** Dit is registratie plus voorbereiding, meer niet.

---

## 6. Bewaartermijn — verplicht, niet optioneel

Sollicitantengegevens mogen **vier weken** na afronding van de procedure bewaard worden, of **een jaar** met uitdrukkelijke toestemming van de kandidaat.

- leg per kandidaat vast of die toestemming er is;
- sluit aan op de bestaande **AVG-module** en de bestaande opruimroutine (`lib/avgOpruiming.ts`) — bouw geen tweede opruimmechanisme;
- **verwijderen betekent ook het cv-bestand**, niet alleen de rij in de database.

---

## 7. Acceptatie

1. Ik voeg een kandidaat toe met een cv en kies de functie.
2. Ik krijg een overzicht: per eis uit de functieomschrijving of het aantoonbaar is, niet genoemd, of onduidelijk — met bij "aantoonbaar" de vindplaats in het cv.
3. Er staat nergens een score, een cijfer of een geschiktheidsoordeel.
4. Ik krijg een vragenlijst die ik kan aanpassen voordat ik het gesprek in ga.
5. De vaste kernvragen zijn voor twee kandidaten op dezelfde functie identiek.
6. Bij een cv met foto en geboortedatum verwijst de uitvoer daar nergens naar.
7. Ik kan na het gesprek aantekeningen en een uitkomst vastleggen.
8. Ik zie over een periode via welk kanaal kandidaten binnenkwamen en wat daarvan geworden is.
9. Na de bewaartermijn zijn de gegevens én het cv-bestand verwijderd.

**Bewijs bij oplevering:** twee echte cv's op dezelfde functie, met de uitvoer naast elkaar — zodat zichtbaar is dat de kernvragen gelijk zijn en de aanvullende vragen verschillen. Plus een test met een cv waarin een foto en geboortedatum staan.

## 8. Wat niet mag

- Geen score, cijfer, rangschikking of geschiktheidsoordeel over een kandidaat.
- Geen uitspraak over ervaring zonder vindplaats in het cv.
- Geen verwijzing naar leeftijd, geslacht, nationaliteit, foto, adres of gezondheid.
- Geen gissing naar de oorzaak van een gat in het arbeidsverleden.
- Geen sollicitatieportaal, vacatureteksten of mailcampagnes.
- Geen tweede opruimmechanisme naast de AVG-module.
- Niet melden dat het klaar is op grond van een geslaagde build of typecheck.

---

## Antwoorden en bevindingen in de repo

Antwoorden op vragen uit deze opdracht komen **niet alleen in de chat** maar worden vastgelegd in de repo:

- **vragen en bevindingen** → `docs/antwoorden/WERVING_01.md`
- **metingen en inventarisaties** → `docs/metingen/WERVING_01_<onderwerp>.md`

Elk antwoord vermeldt: datum · commit-SHA waarop gemeten is · de vraag · het antwoord · en expliciet wat **gemeten** is en wat **aangenomen**. Is er een besluit van René nodig, schrijf dat als zodanig op — niet zelf invullen en doorbouwen.

**Eén punt om expliciet te melden:** hoe gevuld zijn de bestaande functieomschrijvingen werkelijk? De velden `taken`, `verantwoordelijkheden`, `competenties` en `opleidingsvereisten` bestaan, maar als ze leeg of summier zijn, levert de AI vage vragen op. Tel per functie hoeveel van deze velden gevuld zijn en meld dat vóór de oplevering.
