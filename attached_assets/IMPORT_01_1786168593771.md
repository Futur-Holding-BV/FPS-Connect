# IMPORT_01 — Importeren beperken en beheersbaar maken

**Opdrachtgever:** René Vink · **Datum:** 8 augustus 2026 · **Uitvoerder:** Replit
**Systeem:** FPS Connect (`vinkrene-jpg/fps-one`, branch `main`)

**Verplicht vooraf lezen:** `replit.md` · `docs/ontwikkelfilosofie.md` · `docs/kwaliteitskader.md` · `docs/PRODUCTION_RUNBOOK.md` · `.agents/memory/MEMORY.md`

---

## 1. Wat er nu is — gemeten 8 augustus 2026

`routes/import.ts` (565 r.) kent tien importtypes: `leveranciers` · `artikelen` · `klanten` · `medewerkers` · `gebouwen` · `contactpersonen` · `magazijn_artikelen` · `eenheidsprijzen` · `historische_facturen` · `historische_projecten`.

**Drie bevindingen:**

**1.1 — Geen enkele route heeft een bevoegdheidscontrole.** `POST /import/uitvoeren` (r. 80), `GET /import/logs` (r. 284) en `GET /import/template/:type` (r. 532) vereisen alleen dat je bent ingelogd. **Elke medewerker kan elk type importeren** — een monteur kan de eenheidsprijzenbibliotheek vullen of klanten toevoegen.

**1.2 — Elke import voegt onvoorwaardelijk toe.** Alle tien types doen een kale `db.insert(...)`. Alleen `eenheidsprijzen` heeft een `onConflictDoNothing()` (r. 215). Er is nergens een controle of een record al bestaat.

Dat betekent: importeer iemand twee keer dezelfde klantenlijst, en je hebt elke klant twee keer. Niet overschreven — **gedupliceerd.** Voor René's zorg is dat een andere fout dan hij vermoedde, maar minstens zo vervelend: er ontstaan dubbele klanten, dubbele leveranciers en dubbele contactpersonen die daarna handmatig uit elkaar gehaald moeten worden.

**1.3 — Een import is niet terug te draaien.** Er is een `import_logs`-tabel, maar geen batchnummer op de geïmporteerde records en geen manier om één import ongedaan te maken. Wel zetten `leveranciers` en `artikelen` een veld `bron: "import"` — dat is een aanzet, maar niet genoeg om te weten wélke import.

---

## 2. Wat er komt

### 2.1 — Recht per importtype

**Importeren wordt geen apart recht maar volgt de module waar de gegevens thuishoren**, op het hoogste niveau. Wie klanten niet mag beheren, mag ze ook niet importeren.

| Importtype | Vereist |
|---|---|
| `leveranciers` · `klanten` · `contactpersonen` | `crm`, hoogste niveau |
| `artikelen` · `magazijn_artikelen` | `magazijn`, hoogste niveau |
| `medewerkers` | `personeel`, hoogste niveau |
| `gebouwen` · `historische_projecten` | `gebouwen`, hoogste niveau |
| `eenheidsprijzen` | `calculaties`, hoogste niveau |
| `historische_facturen` | `financieel`, hoogste niveau |

`GET /import/logs` vereist minimaal leesrecht op één van deze modules; **wie niets mag importeren ziet ook de importgeschiedenis niet.**

**Waarom het hoogste niveau:** importeren is geen gewone bewerking. Eén bestand kan honderden records raken. Wie één klant mag wijzigen, hoeft daarmee niet duizend klanten te mogen inladen.

### 2.2 — Geen import zonder voorbeeld

Een import gebeurt voortaan in twee stappen:

1. **Controleren** — het bestand wordt gelezen en er verschijnt een overzicht: hoeveel regels, hoeveel nieuw, **hoeveel lijken op iets dat al bestaat**, hoeveel onbruikbaar en waarom.
2. **Uitvoeren** — pas na bevestiging.

**Dubbelen worden herkend en gemeld, niet blind toegevoegd.** Per type een herkenningssleutel: KvK-nummer of naam plus plaats voor relaties, artikelnummer voor artikelen, code voor eenheidsprijzen, en zo verder. Bepaal die sleutel per type en **meld hem in het antwoordenbestand** — niet zelf iets verzinnen wat er niet is.

Bij een gevonden dubbele krijgt de gebruiker één keuze voor de hele import: **overslaan** of **als nieuw toevoegen**. **Overschrijven is in deze opdracht geen optie** — dat is precies waar René bang voor is, en dat verdient een eigen, latere afweging.

### 2.3 — Elke import krijgt een nummer, en is terug te draaien

- elke geïmporteerde rij krijgt een verwijzing naar de import waaruit hij komt;
- in het importoverzicht staat per import: wie, wanneer, welk type, hoeveel regels, en het bestand zelf;
- **één import is in zijn geheel ongedaan te maken**, zolang de records daarna niet zijn gewijzigd of gebruikt;
- is dat wel gebeurd, dan wordt precies gemeld wat niet teruggedraaid kan worden en waarom.

Dit is het antwoord op de zorg: iemand importeert een aangepaste lijst, en het is achteraf niet meer te zien wat er van hem kwam. Met een importnummer is dat wél te zien, en terug te draaien.

### 2.4 — Zichtbaar dat iets geïmporteerd is

`leveranciers` en `artikelen` zetten al `bron: "import"`. **Doe dat bij alle types**, plus het importnummer.

In de schermen waar die gegevens getoond worden, moet zichtbaar zijn dat een record uit een import komt en uit welke. Zonder dat blijft het onmogelijk om vast te stellen welke gegevens door mensen zijn ingevoerd en welke ergens vandaan zijn ingeladen.

---

## 3. Acceptatie

1. Een monteur kan niets importeren en ziet de importpagina niet.
2. Iemand met magazijnrecht kan artikelen importeren maar geen klanten of eenheidsprijzen.
3. Vóór het uitvoeren zie ik hoeveel regels nieuw zijn, hoeveel lijken op iets bestaands, en hoeveel onbruikbaar.
4. Importeer ik twee keer dezelfde lijst, dan krijg ik een waarschuwing en geen dubbele records — tenzij ik daar bewust voor kies.
5. Bij elk geïmporteerd record kan ik zien uit welke import het komt.
6. Ik kan één import in zijn geheel ongedaan maken.
7. Is dat deels niet mogelijk, dan staat er precies bij wat en waarom.
8. Overschrijven van bestaande gegevens gebeurt nergens.

**Bewijs bij oplevering:** dezelfde klantenlijst twee keer geïmporteerd, met de waarschuwing en zonder dubbelen. Plus één import die volledig is teruggedraaid, met het aantal verwijderde records. Plus een poging van een gebruiker zonder recht, die correct wordt geweigerd.

## 4. Wat niet mag

- Geen import zonder modulerecht op het hoogste niveau.
- Geen import die bestaande gegevens overschrijft.
- Geen import zonder voorafgaand overzicht.
- Geen geïmporteerd record zonder importnummer.
- Geen zelfbedachte herkenningssleutel — die wordt per type bepaald en gemeld.
- Niet melden dat het klaar is op grond van een geslaagde build of typecheck.

---

## Antwoorden en bevindingen in de repo

Antwoorden op vragen uit deze opdracht komen **niet alleen in de chat** maar worden vastgelegd in de repo:

- **vragen en bevindingen** → `docs/antwoorden/IMPORT_01.md`
- **metingen** → `docs/metingen/IMPORT_01_<onderwerp>.md`

Elk antwoord vermeldt: datum · commit-SHA waarop gemeten is · de vraag · het antwoord · en expliciet wat **gemeten** is en wat **aangenomen**. Is er een besluit van René nodig, schrijf dat als zodanig op — niet zelf invullen en doorbouwen.

**Twee punten om te melden:** (1) de herkenningssleutel per importtype — welke bestaat er werkelijk in de gegevens, en waar is er geen betrouwbare sleutel? (2) is er al eerder geïmporteerd in productie, en zo ja: hoeveel records dragen `bron: "import"` en zijn daar dubbelen bij?
