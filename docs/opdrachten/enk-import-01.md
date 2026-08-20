# ENK_IMPORT_01 — De ENK-historie als leerbron

**Opdrachtgever:** René Vink · **Datum:** 7 augustus 2026 · **Uitvoerder:** Replit
**Systeem:** FPS Connect (`vinkrene-jpg/fps-one`, branch `main`)
**Volgorde: vóór `CALCULATIE_AI_01` en `INKOOP_AI_01`.** Zonder deze data adviseren die twee over niets.

**Verplicht vooraf lezen:** `replit.md` · `docs/ontwikkelfilosofie.md` · `docs/kwaliteitskader.md` · `docs/PRODUCTION_RUNBOOK.md` · `.agents/memory/MEMORY.md`

---

## 1. Waarom dit eerst moet

ENK wordt door Connect vervangen, maar de kennis die erin zit — jaren aan calculaties, eenheidsprijzen en inkoop — is de waardevolste bezitting van dit hele traject. René: *"Het mag niet nog een jaar duren om te leren. De data is wel beschikbaar."*

Dat is geen bijzaak. In `CALCULATIE_AI_01` en `INKOOP_AI_01` staan bewust remmen:

- geen historisch prijsadvies bij **minder dan vijf** waarnemingen per regelsoort;
- geen verwachte inkoopprijs bij **minder dan drie** waarnemingen per artikel.

Zonder historie zwijgt de AI dus — en blijft dat een jaar doen. Met de ENK-historie erin heeft hij vanaf dag één iets om tegen te vergelijken.

---

## 2. Wat er al is

**Gemeten op 7 augustus 2026:** `routes/import.ts` kent al elf importtypes, waaronder `eenheidsprijzen`, `historische_facturen` en `historische_projecten`, met kolomkoppeling, sjablonen per type en een importlog.

De sjabloon voor eenheidsprijzen dekt al alle relevante velden: code, omschrijving, categorie, eenheid, materiaalcomponent, arbeidscomponent, **normtijd**, kostprijs, verkoopprijs, marge, btw-code, inclusies, exclusies.

**Wat ontbreekt: er is geen importtype voor historische calculaties met hun regels, en geen voor historische inkoop.** Precies de twee bronnen die de AI nodig heeft. `historische_facturen` gaat over factuurkoppen, niet over wat er per regel is ingekocht.

**Bouw dus geen nieuwe importmodule.** Breid de bestaande uit met twee types, volgens hetzelfde patroon.

---

## 3. Wat er geïmporteerd wordt

### 3.1 Historische calculatieregels

Per regel minimaal: datum of jaar · omschrijving · categorie · eenheid · hoeveelheid · stukprijs · en waar beschikbaar de eenheidsprijscode en het soort werk.

**Dit is de bron voor blok B uit `CALCULATIE_AI_01`** (de eigen historische mediaan per regelsoort).

### 3.2 Historische inkoop

Per regel minimaal: datum · leverancier · artikel of omschrijving · eenheid · hoeveelheid · betaalde prijs.

**Dit is de bron voor blok A en C uit `INKOOP_AI_01`** (wat FPS werkelijk betaalde, en de prijsontwikkeling per leverancier).

### 3.3 Eenheidsprijzen aanvullen

Het importtype bestaat al. Gebruik de ENK-normtijden om de bibliotheek te vullen of te toetsen. **Overschrijf een bestaande eenheidsprijs nooit stilzwijgend** — wijkt de ENK-waarde af van wat er in Connect staat, dan is dat een bevinding voor René, geen automatische aanpassing.

---

## 4. Vier regels die deze import bruikbaar maken

**R1 — Geïmporteerde historie wordt gemarkeerd.** Elke geïmporteerde regel krijgt een herkomstkenmerk (`bron: enk-import`, met importdatum en een verwijzing naar de importrun). Zonder die markering is later niet te scheiden wat gemeten is en wat overgenomen.

**Geïmporteerde calculaties mogen nooit als levende calculatie verschijnen.** Ze zijn referentiemateriaal, geen werkvoorraad — anders staan er straks honderden oude calculaties in het overzicht.

**R2 — Elke prijs krijgt een datum.** Een stukprijs uit 2021 weegt niet even zwaar als een uit 2025. Zonder datum is de mediaan uit `CALCULATIE_AI_01` misleidend: dan trekt oude, te lage historie het beeld omlaag terwijl de inkoop intussen is gestegen.

Leg vast hoe oude waarnemingen meewegen — voorstel: waarnemingen ouder dan drie jaar worden wel getoond maar apart vermeld, zodat de AI kan zeggen *"mediaan € 39 over de laatste twee jaar; € 33 als je 2021 meerekent"*.

**R3 — Niets normaliseren zonder bewijs.** Verleidelijk is om omschrijvingen automatisch te groeperen zodat er meer waarnemingen per soort ontstaan. **Doe dat niet.** Twee regels die op elkaar lijken zijn niet per se hetzelfde werk, en een verkeerd samengevoegde groep levert een advies op dat overtuigend klinkt en fout is.

Koppel op eenheidsprijscode waar die er is. Waar die ontbreekt: koppel niet, maar meld hoeveel regels niet te koppelen waren.

**R4 — Meet wat het oplevert.** Dit is de belangrijkste oplevering van deze opdracht.

Lever na de import een telling op: **hoeveel waarnemingen per regelsoort en per artikel**, en dus voor hoeveel soorten werk de drempels van vijf en drie gehaald worden.

Blijkt dat bijvoorbeeld maar dertig procent van de regelsoorten die drempel haalt, dan weet je vóórdat `CALCULATIE_AI_01` gebouwd wordt dat hij in zeventig procent van de gevallen zal zwijgen — en kun je besluiten of de drempels kloppen of dat er meer data nodig is.

---

## 5. Wat er van René nodig is

De ENK-uitvoer zelf: calculaties met hun regels, en inkoophistorie. **Onderzoek eerst welke exportmogelijkheden ENK biedt** en meld dat, vóórdat er kolomkoppelingen worden gebouwd op een aangenomen bestandsvorm.

Kan ENK alleen per calculatie exporteren en niet in bulk, dan is dat een bevinding — en bepaalt die hoeveel er redelijkerwijs binnengehaald kan worden.

---

## 6. Acceptatie

1. Er zijn twee nieuwe importtypes: historische calculatieregels en historische inkoop, met sjabloon en kolomkoppeling zoals de bestaande.
2. Elke geïmporteerde regel is herkenbaar als import, met datum en importrun.
3. Geïmporteerde calculaties verschijnen nergens als levende calculatie.
4. Elke geïmporteerde prijs heeft een datum.
5. Er is een telling opgeleverd: per regelsoort en per artikel het aantal waarnemingen, en hoeveel daarvan de drempel van vijf respectievelijk drie halen.
6. Regels die niet aan een eenheidsprijs te koppelen waren, staan geteld en benoemd — niet stilzwijgend gegroepeerd.
7. Waar een ENK-eenheidsprijs afwijkt van een bestaande in Connect, staat dat als bevinding, niet als wijziging.

**Bewijs bij oplevering:** de telling uit punt 5 als tabel, plus het importlog. Die telling bepaalt of `CALCULATIE_AI_01` en `INKOOP_AI_01` zinvol te bouwen zijn — lever hem op vóórdat daaraan begonnen wordt.

## 7. Wat niet mag

- Geen nieuwe importmodule naast `routes/import.ts`.
- Geen automatische groepering van omschrijvingen.
- Geen bestaande eenheidsprijs overschrijven.
- Geen import zonder herkomstmarkering en zonder datum per prijs.
- Geïmporteerde calculaties niet als werkvoorraad tonen.
- Niet melden dat het klaar is op grond van een geslaagde build of typecheck.
