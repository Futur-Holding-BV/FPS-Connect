# FACTUUR_01 — Fundament: leverancierstypes en uitzendbureaukoppeling

**Opdrachtgever:** René Vink · **Datum:** 7 augustus 2026 · **Uitvoerder:** Replit
**Systeem:** FPS Connect (`vinkrene-jpg/fps-one`, branch `main`)

Dit is deel 1 van drie. Het is klein, maar `FACTUUR_02` (de factuurstroom) en `FACTUUR_03` (betaling/SEPA) kunnen zonder dit deel niet werken. Bouw het daarom eerst en volledig af.

**Verplicht vooraf lezen:** `replit.md` · `docs/ontwikkelfilosofie.md` · `docs/kwaliteitskader.md` · `docs/PRODUCTION_RUNBOOK.md` · `.agents/memory/MEMORY.md`

---

## 1. Waarom dit nodig is

In de factuurstroom komt een regel die volledig automatisch moet werken: **een factuur van een uitzendbureau zonder G-rekeningverdeling wordt geweigerd.** Die regel kan alleen bestaan als het systeem weet welke leveranciers uitzendbureau of inlener zijn.

**Gemeten op 7 augustus 2026:** dat kenmerk ontbreekt.

- `lib/db/src/schema/crm.ts` — `crmKlantenTable` heeft een `type`-veld, maar `ORG_TYPES` bevat alleen: `woningcorporatie` · `vve_beheerder` · `aannemer` · `installateur` · `vastgoedbeheerder` · `adviseur` · `gemeente` · `zorginstelling` · `onderwijsinstelling` · `concurrent` · `leverancier` · `overig`. Een uitzendbureau valt nu onder `leverancier` of `overig` — net als een verfhandel.
- `lib/db/src/schema/gebruikers.ts` r.50 en `lib/db/src/schema/hrm.ts` r.108 bevatten `bedrijf_uitzendbureau` als **vrij tekstveld** op de medewerkerkant. Dat is geen verwijzing naar een organisatie, dus er valt geen factuur aan te koppelen en er is geen controle mogelijk.

---

## 2. Wat er gebouwd wordt

### 2.1 Twee nieuwe organisatietypes

Voeg toe aan `ORG_TYPES` in `lib/db/src/schema/crm.ts`:

- `uitzendbureau` — levert uitzendkrachten, factureert met G-rekeningverdeling
- `inlener` — ingehuurde partij voor werk op de bouw, factureert met G-rekeningverdeling

Beide types zijn zichtbaar en instelbaar op de relatiepagina, net als de bestaande types. Werk de bijbehorende frontend-keuzelijsten mee bij; zoek ze op in plaats van aan te nemen waar ze staan.

### 2.2 `bedrijf_uitzendbureau` wordt een verwijzing

Vervang op beide plaatsen (`gebruikers.ts` r.50, `hrm.ts` r.108) het vrije tekstveld door een verwijzing naar `crm_klanten`.

- Nieuw veld: `uitzendbureau_id` (verwijzing naar `crm_klanten.id`, mag leeg zijn).
- **Het oude tekstveld blijft voorlopig bestaan** en wordt niet verwijderd in deze opdracht — zie §3.

**Wat dit oplevert:** niet alleen dát iemand via een uitzendbureau werkt, maar ook welke facturen daarbij horen. Daarmee wordt later controleerbaar of gefactureerde uren kloppen met de mensen die daadwerkelijk zijn ingezet.

### 2.3 Eenmalige omzetting van bestaande gegevens

Schrijf een migratiescript dat per bestaande `bedrijf_uitzendbureau`-tekstwaarde probeert de bijbehorende organisatie in `crm_klanten` te vinden op naam.

- **Gevonden en eenduidig** → `uitzendbureau_id` invullen, en het type van die organisatie op `uitzendbureau` zetten als het nog `leverancier` of `overig` was.
- **Niet gevonden, of meer dan één mogelijke match** → niets invullen, maar wél opnemen in een lijst "handmatig te koppelen".
- Die lijst wordt getoond in de beheeromgeving, zodat Jacqueline of René de resterende gevallen één keer kan oplossen.
- **Verzin nooit een koppeling bij twijfel.** Een verkeerd gekoppeld uitzendbureau leidt straks tot een betaling naar de verkeerde G-rekening.

---

## 3. Volgorde en veiligheid

**Migratie vóór activatie — dit is niet onderhandelbaar.** In het runbook staat vastgelegd dat de productielogin al meerdere keren is uitgevallen doordat schema-afhankelijke code werd uitgerold vóórdat de bijbehorende migratie had gedraaid (`moet_wachtwoord_wijzigen`, `medewerker_status`, `wizard_voortgang`). Deze opdracht bevat een schemawijziging. Volgorde:

1. Migratie draait en is bevestigd op productie.
2. Pas daarna code die het nieuwe veld gebruikt.
3. Het oude tekstveld `bedrijf_uitzendbureau` blijft in deze opdracht staan. Het wordt pas verwijderd in een aparte, latere opdracht, nadat is aangetoond dat niets het meer leest.

---

## 4. Acceptatie

De opdracht is af wanneer:

1. Ik kan een relatie het type `uitzendbureau` of `inlener` geven, en dat blijft bewaard.
2. Bij een ingeleende medewerker staat een verwijzing naar de organisatie, niet alleen een naam.
3. De lijst "handmatig te koppelen" is zichtbaar en bevat alleen de gevallen die het script niet eenduidig kon oplossen.
4. Er is geen enkele automatisch gelegde koppeling waarbij twijfel bestond.
5. De migratie is aantoonbaar op productie gedraaid vóórdat de bijbehorende code actief werd.

**Bewijs bij oplevering:** commit-SHA, GitHub main-SHA, actieve productie-SHA, het aantal automatisch gekoppelde en het aantal handmatig te koppelen regels, en een schermafdruk van de resterende lijst.

## 5. Wat niet mag

- Geen tweede plek waar een uitzendbureau kan worden vastgelegd. Eén type op de relatie, één verwijzing op de medewerker.
- Geen nieuwe tabel of parallelle route als het bestaande relatiemodel volstaat.
- Het oude tekstveld niet verwijderen in deze opdracht.
- Niet melden dat het klaar is op grond van een geslaagde build of typecheck. Toon het scenario zelf, uitgevoerd na de wijziging.
