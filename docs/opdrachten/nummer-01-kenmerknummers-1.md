# NUMMER_01 — Kenmerknummers volgens de ENK-piramide

Datum: 8 augustus 2026
Gemeten op: `main` @ `009fbe7a` (shallow clone, 8 augustus 2026 06:35 UTC)
Status: bouwopdracht, nog niet gestart

---

## 1. Waarom deze opdracht bestaat

Vandaag hangen `opnames`, `calculaties` en `offertes` alle drie uitsluitend aan
`gebouw_id`. Zodra er op één pand meerdere klussen lopen — bij renovatie is dat de
regel en niet de uitzondering — is niet meer vast te stellen welke calculatie bij
welke klus hoort. Financiële bewaking per opdracht is daarmee onmogelijk.

De gekozen oplossing is **niet** een extra opdracht-tabel, maar een kenmerkketen
volgens de werkwijze van ENK. De keten maakt zichtbaar wat het datamodel nu
impliciet laat:

```
Gebouw / werk / project        G156
  Meeting (opname)             G156/M204
  Calculatie                   G156/C590
    Offerte                    G156/C590/O405
      Inkoopopdracht           O405/I088
      Factuur                  O405/F002
```

Meerwerk is geen nieuw pand en geen nieuwe tabel, maar een nieuwe calculatie onder
hetzelfde gebouw: `G156/C600/O409`.

---

## 2. Bindende besluiten van René

Deze staan vast en zijn geen ontwerpruimte:

1. **De piramide is:** werk/project/gebouw → meeting → calculatie → offerte.
   Werk, project en gebouw zijn hetzelfde begrip; er is geen onderscheid.
2. **Een gebouw kan meerdere meetings, calculaties én offertes hebben.**
3. **Elk onderdeel heeft een eigen doorlopend uniek volgnummer, zonder relatie tot
   het gebouw.** G156 kan calculatie C590 hebben; het volgende gebouw begint niet
   opnieuw bij C001.
4. **Naar buiten toe** wordt een calculatie verstuurd als `G156/C590` en een offerte
   als `G156/C590/O405`.
5. **Inkoopopdracht** hangt aan de offerte: `O405/I088`. Via de offerte is de rest
   in beeld; de keten toont dus alleen de dichtstbijzijnde ouder.
6. **Factuur** volgt hetzelfde: `O405/F001`, `O405/F002` voor opeenvolgende
   termijnen.
7. **Het systeem vult het volgnummer altijd zelf in. Nooit handmatig.**
8. **Twee mensen die tegelijk een calculatie aanmaken mogen nooit hetzelfde nummer
   krijgen.**
9. **Geen jaartal in het nummer.** Bij een doorlopende reeks zit de volgorde al in
   het nummer; een jaartal wordt een tweede waarheid zodra een calculatie van
   30 december een offerte van 3 januari krijgt.
10. **Het magazijn is een eigen gebouw** — daar kan dus op ingekocht worden.
    Voorraadinkoop hangt aan dat gebouw, niet aan een offerte.
11. **De BV is herkenbaar aan het nummer**, als prefix.
12. **ENK stopt zodra Connect draait.** Connect geeft vanaf go-live zelf het
    fiscale verkoopfactuurnummer uit. ENK hanteert heel andere nummers, dus er is
    geen overlap en het laatste ENK-nummer hoeft niet overgenomen te worden.

---

## 3. Wat er is gemeten — vertrekpunt

Alles hieronder is gemeten op `009fbe7a`. Wijkt de code inmiddels af, meld dat dan
vóór je begint in plaats van eromheen te bouwen.

### 3.1 Wat er al staat

| Bevinding | Vindplaats |
| --- | --- |
| `offertes.ons_kenmerk` en `offertes.offertenummer` bestaan als tekstveld | `schema/offertes.ts` r.3, r.9 |
| `gebouwen.werknummer` en `gebouwen.projectnummer` — beide uniek, beide tekst | `schema/gebouwen.ts` r.9, r.10 |
| `facturen.type` kent `inkoop` en `verkoop`; `factuurnummer` bestaat | `schema/facturen.ts` r.5, r.10 |
| `facturen.subtype` kent `creditnota` | `schema/facturen.ts` r.7 |
| `factuur_termijnen.volgnummer` bestaat | `schema/facturen.ts` r.422 |
| `facturen.inkoopbon_id` bestaat (soft ref) | `schema/facturen.ts` r.100 |
| AccountView-koppeling met `accountview_boeking_id` en `boekingsnummer` | `schema/facturen.ts` r.57, r.66 |

### 3.2 Wat ontbreekt

| Ontbrekend | Gevolg |
| --- | --- |
| **`calculaties` heeft geen enkel nummerveld** | het C-nummer bestaat niet |
| **`opnames` heeft geen nummerveld** | het M-nummer bestaat niet |
| **`offertes.calculatie_id` heeft géén foreign key** — als enige verwijzing in die tabel zonder | het middelste deel van het kenmerk is niet gegarandeerd waar |
| **`opnames` heeft geen verwijzing naar een calculatie** | welke meeting tot welke calculatie leidde is niet vastgelegd |
| **`facturen` heeft geen `offerte_id`** (wel `gebouw_id`, `opdracht_id`, `inkoopbon_id`) | `O405/F001` is niet te vormen |
| **`inkoopplannen` en `inkoopbonnen` hangen verplicht aan `opdracht_id`, niet aan een offerte** | `O405/I088` is niet te vormen zonder nieuwe verwijzing |
| **drie losse inkoopnummeringen naast elkaar**: `inkoopbonnen.bon_nummer` (`IB-2025-001`), `magazijn_inkooporders.nummer` (`INK-2026-0001`), `inkoopplannen` heeft er geen | er is geen enkele bestaande reeks om op voort te bouwen |
| **bestaand nummerpatroon is `max(...)+1` met `padStart(3)`** | `routes/snagstream.ts` r.290-299 — dit is precies wat bij gelijktijdig aanmaken misgaat |

---

## 4. Te bouwen

### 4.1 Nummervelden

Voeg toe, elk uniek en niet-null zodra het record definitief bestaat:

- `opnames.nummer` (M)
- `calculaties.nummer` (C)
- `offertes.nummer` (O) — naast het bestaande `offertenummer`, dat de externe
  offertetitel blijft indien in gebruik; meld wat dat veld nu werkelijk bevat
  voordat je het laat staan
- inkoop: één nummerveld op het model dat na §4.5 leidend blijkt (I)
- `facturen.nummer` (F) — het **kenmerk**-deel, uitdrukkelijk niet het
  factuurnummer

Breedte niet vastzetten op drie cijfers. Toon met een minimum van drie posities
(`C001`), maar laat de breedte meegroeien zodra de reeks 999 passeert.

### 4.2 Uitgifte van het volgnummer

**Gebruik een databasesequence per soort.** Niet `max(...)+1`: dat levert bij twee
gelijktijdige aanmaken hetzelfde nummer op — bij een uniek veld faalt er dan één
gebruiker, zonder uniek veld ontstaat stil een duplicaat.

Eerlijk erbij: een sequence laat een gat vallen als een aanmaak mislukt. Dat is de
juiste ruil — een gat is ongemakkelijk, een duplicaat is een fout.

**Uitzondering: het fiscale factuurnummer.** Zie §4.6.

### 4.3 Het kenmerk wordt afgeleid, nooit opgeslagen als vrije tekst

Dit is de kernregel van de hele opdracht.

`G156/C590/O405` wordt **berekend** uit de verwijzingen op het moment van tonen.
Sla het niet op als los tekstveld dat door iemand ingevuld kan worden. Anders
ontstaat een offerte waarvan het kenmerk `C590` zegt terwijl `calculatie_id` naar
C601 wijst — en dan is het etiket erger dan geen etiket, want er wordt op
vertrouwd.

Mag een berekend kenmerk **wel** worden weggeschreven bij het definitief maken van
een uitgaand document (offerte, factuur), zodat het document van vorig jaar
onveranderd blijft? Ja — maar dan als vastgevroren momentopname bij dat document,
niet als bewerkbaar veld, en met de berekening als bron.

Daaruit volgt direct: **`offertes.calculatie_id` moet een echte foreign key
worden.** In een keten die als identificatie dient is een niet-afgedwongen schakel
de zwakste plek.

### 4.4 Ontbrekende schakels leggen

- foreign key op `offertes.calculatie_id`
- `opnames.calculatie_id` (of andersom: `calculaties.opname_id` — kies op grond van
  wat de gegevens laten zien en meld de keuze). Naar buiten hoeft de meeting geen
  kenmerk; intern moet de schakel er zijn
- `facturen.offerte_id`
- inkoop: verwijzing naar de offerte (zie §4.5)

Bestaande gegevens: leg **geen** verwijzing waarvan je niet kunt aantonen dat hij
klopt. Kun je een oude calculatie niet met zekerheid aan één offerte koppelen, laat
hem dan leeg en tel hoeveel dat er zijn. Een gegokte koppeling is schadelijker dan
een lege.

### 4.5 Inkoop — eerst uitzoeken, dan bouwen

Er staan drie inkoopmodellen naast elkaar (plus `mod_calc_inkoop_items`). Kies er
niet zomaar één.

**Lever eerst een korte tabel op:** welk model wordt in productie werkelijk
gebruikt, hoeveel records per model, en waarvoor. Pas daarna het I-nummer bouwen.
Dit sluit aan op de al bekende bevinding dat `INKOOP_01` op dezelfde vraag
vastloopt — los hem hier één keer op.

Twee soorten inkoop, met verschillend kenmerk:

- **projectinkoop** → hangt aan de offerte → `O405/I088`
- **voorraadinkoop** → hangt aan het magazijn-gebouw → `G002/I089`

Beide uit dezelfde I-reeks; de ouder verschilt. Aan het kenmerk zie je dus meteen
of iets aan een klus is toe te rekenen — precies de vraag die bij de factuurcontrole
gesteld wordt.

**Wijziging van een verstuurde inkoopopdracht (besluit René):** het nummer blijft
staan en krijgt een **letter achter zich** — `I088`, daarna `I088a`, `I088b`. Het
volgnummer wordt dus niet verbruikt door een herziening, en de leverancier ziet dat
het dezelfde bestelling is en niet een tweede.

Daaruit volgt: de letter is onderdeel van het kenmerk, niet van de sequence. De
sequence deelt `I088` uit; de letter wordt bepaald door het aantal eerdere
herzieningen van dat ene record. Bewaar de eerdere versie — een herziene
inkoopopdracht overschrijft de vorige niet, want die is al verstuurd.

### 4.6 Facturen — twee nummers, twee doelen

Op een uitgaande factuur staan **twee** nummers:

1. **Het factuurnummer** — een doorlopende reeks **per BV**, fiscaal bedoeld.
2. **Het kenmerk** — `O405/F002`, dat terugwijst naar offerte en termijn.

Het kenmerk begint per offerte opnieuw bij 001 en is dus géén factuurnummer. Toon
het kenmerk **nooit los**: `F001` bestaat onder elke offerte.

**Het fiscale factuurnummer wijkt af van §4.2:** hier is een gat in de reeks niet
gewenst. Ken het nummer daarom **pas toe bij het definitief maken** van de factuur,
niet bij het aanmaken van een concept — een teller per BV die onder een slot wordt
opgehoogd binnen dezelfde transactie. Een weggegooid concept verbruikt zo geen
nummer.

- **creditnota's komen uit dezelfde factuurreeks** (fiscaal zijn het facturen);
  `subtype` kent `creditnota` al
- **inkomende leveranciersfacturen krijgen géén F-nummer.** Die dragen al het
  nummer van de leverancier; je hernummert andermans document niet. Zij horen onder
  de inkoopopdracht via het bestaande `inkoopbon_id`
- leg per BV vast wanneer de laatste ENK-factuur en de eerste Connect-factuur is
  uitgegeven — spoor voor de accountant, geen systeemfunctie

**Vóór de bouw van dit onderdeel:** leg de opzet voor aan de accountant. Een fout
in factuurnummering is achteraf niet te repareren.

### 4.7 De BV-prefix

Prefix vóór de keten, bijvoorbeeld `BP-G156/C590/O405`, met **één doorlopende
reeks over alle BV's**. Splits de tellers niet per BV: dan bestaat C600 driemaal en
is het nummer alleen nog uniek mét prefix.

De BV is af te leiden uit het gebouw (`gebouwen.werkgever_id` bestaat). Herhaal het
veld dus niet op calculatie, offerte en factuur.

Uitzondering: de **fiscale factuurreeks** is wél per BV — dat is nu juist de eis.

### 4.8 G — welk veld

`gebouwen` heeft twee unieke tekstkolommen die hetzelfde lijken te betekenen.

**Tel eerst in productie:** hoeveel gebouwen hebben `werknummer` gevuld, hoeveel
`projectnummer`, en verschillen die twee ooit van elkaar? Meld de uitkomst.

Uitgangspunt zolang de telling niets anders uitwijst: **G landt in `werknummer`**;
`projectnummer` wordt opgeruimd of krijgt een expliciet gedocumenteerde andere
functie. Verschillen de velden werkelijk van elkaar, dan is dat een bevinding die
eerst besproken wordt.

### 4.9 Bestaande gegevens

Nummer bestaande meetings, calculaties, offertes, inkoop en facturen met
terugwerkende kracht op **aanmaakvolgorde**, en laat de sequence daarna doortellen.
Zonder dat zijn oude records niet aanspreekbaar in het nieuwe systeem.

**Tel en meld vooraf** hoeveel records het per soort betreft. Blijkt dat er duizenden
zijn of dat de aanmaakdatum ontbreekt, meld dat dan vóór de migratie in plaats van
er een aanname op te bouwen.

---

## 5. Wat er niet gebeurt

- **Geen aparte opdracht-drager.** De projectvelden verhuizen niet van `gebouwen`
  naar `projecten`; dat voorstel is door René verworpen ten gunste van deze keten.
- **Geen jaartal** in enig kenmerk.
- **Geen handmatige invoer** van een volgnummer, ook niet door een beheerder.
- **Geen vierde inkoopmodel.** §4.5 kiest uit wat er is.
- **Geen `max(...)+1`.**
- **Geen gegokte koppelingen** in bestaande gegevens.
- **Geen wijziging aan de ENK-koppeling of AccountView-export** binnen deze opdracht.

---

## 6. Acceptatie

Geen groene build, maar aantoonbaar gedrag. Lever per punt het bewijs.

1. **Gelijktijdigheid** — twee gelijktijdige aanmaakverzoeken voor een calculatie
   leveren twee verschillende nummers op. Bewijs met een script dat de aanroepen
   werkelijk parallel doet, niet na elkaar.
2. **Afgeleid kenmerk** — wijzig van een testofferte de `calculatie_id` en toon aan
   dat het getoonde kenmerk meebeweegt. Toon aan dat er nergens een bewerkbaar
   kenmerkveld in de UI zit.
3. **Meerwerk** — één gebouw, twee calculaties, twee offertes. Toon de vier
   kenmerken en dat ze uit elkaar te houden zijn.
4. **Voorraadinkoop** — een inkoop op het magazijn-gebouw krijgt een kenmerk met
   het gebouw als ouder, een projectinkoop met de offerte als ouder.
5. **Factuur** — twee termijnen op één offerte geven `O.../F001` en `O.../F002`,
   met **twee verschillende** fiscale factuurnummers uit de BV-reeks. Een
   weggegooid factuurconcept verbruikt geen fiscaal nummer: toon de reeks vóór en
   ná.
6. **Migratie** — tellingen per soort vóór en ná, en de melding hoeveel
   verwijzingen bewust leeg zijn gelaten.
7. **De telling uit §4.8** met de conclusie welk veld G wordt.

---

## 7. Terug te melden vóór of tijdens de bouw

- de uitkomst van de `werknummer` / `projectnummer`-telling (§4.8)
- welk inkoopmodel in productie werkelijk gebruikt wordt, met aantallen (§4.5)
- wat `offertes.offertenummer` nu daadwerkelijk bevat (§4.1)
- aantallen bestaande records per soort voor de migratie (§4.9)
- hoeveel bestaande koppelingen niet met zekerheid te leggen zijn (§4.4)

---

## 8. Afsluiting

Commit-SHA, GitHub `main`-SHA, actieve productie-SHA, en de op
`connect.fps-one.nl` uitgevoerde controle. Werk `docs/changelog.md` bij en leg de
antwoorden vast in `docs/antwoorden/NUMMER_01.md`.
