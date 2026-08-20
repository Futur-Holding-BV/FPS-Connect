# AUDIT_01 — Hertoetsing van de laatste 20 opdrachten

**Voor René · 9 augustus 2026 · gemeten op `3e3a6c1` (`main`)**

---

## 1. Wat ik wel en niet gedaan heb

De repo telt **2.458 bronbestanden, 289 databasetabellen en 1.239 routes**. Die heb ik niet regel voor regel gelezen — dat zou ik ook niet waarheidsgetrouw kunnen beweren.

Wat ik wél gedaan heb:

1. **Drie repo-brede scans** die niet afhangen van mijn geheugen (§2).
2. **Per opdracht de dragende premisse getoetst** — de bewering die, als hij fout is, de hele instructie ondermijnt.
3. **Replits eigen antwoorden gelezen** in `docs/antwoorden/` — daar staan de afwijkingen die hij tegenkwam.

Wat ik **niet** kan vaststellen: of iets werkt, en of de gegevens in productie kloppen. Code lezen meet aanwezigheid, niet werking.

---

## 2. Drie repo-brede scans

### 2.1 Dode schema's — meevaller

Van de **289 tabellen worden er 287 daadwerkelijk gebruikt** in routes, services of lib. Alleen `salaris_audit_ext` en `security_instellingen` komen nergens voor.

Dat is belangrijk, want het is precies de fout die ik vanochtend bij `spot_dossiers` dacht te zien. Die tabel wordt wél gebruikt; hij is alleen dun gevuld. **Er is in dit systeem nauwelijks dood schema.** Mijn zorg daarover was ongegrond.

### 2.2 Dubbele routes — schoon

Nul dubbel gedeclareerde routes in alle routebestanden. `MERGE_01` heeft gewerkt.

### 2.3 Twee calculatiemodellen naast elkaar — dit raakt een lopende opdracht

Er bestaan **twee** calculatiemodellen:

- `calculaties` + `calculatie_regels` — 32 verwijzingen in routes
- `mod_calc_headers` + dertien `mod_calc_*`-tabellen — 46 verwijzingen

`docs/antwoorden/NUMMER_01.md` meldt dat `calculatie_id` in offertes en opdrachten in werkelijkheid naar **`mod_calc_headers`** wees, niet naar `calculaties`. Migratie 0018 heeft de sleutel omgehangen.

**Gevolg voor `BOUW_01`:** daarin staat "calculatie, alleen lezen, voor werkvoorbereider en projectleider" zonder te zeggen wélke. Dat moet erbij, anders bouwt Replit tegen het verkeerde model. → zie §5.

---

## 3. Per opdracht

Legenda: ✅ premisse klopt · ⚠️ instructie was onnauwkeurig of te beperkend · ❌ premisse was fout

| # | Opdracht | Oordeel | Toelichting |
|---|---|---|---|
| 1 | **NP_INKOOP_01** | ✅ | gebouwd (migratie 0024). `algemene_inkopen.leverancier_id` verwijst naar **`leveranciers`** — precies de eis. Eigen A-nummerreeks, bestaande inkooptabellen ongemoeid |
| 2 | **WAGENPARK_01** | ⚠️ | zie §4.1 — twee uitsluitingen bleken onterecht |
| 3 | **NOTITIE_01** | ✅ | `gebouw_notities`, `initialen` op de gebruiker, race-conditie die ik miste door Replit zelf gevonden en opgelost |
| 4 | **MERGE_01** | ✅ | sync-controle blokkeert, deploy-poort draait vóór de VPS-stap, bewezen met een bewust rode testcommit |
| 5 | **HERSTEL_01** | ✅ | alle dubbele routes weg, migratie 0019 voor bestaande werkvoorbereiders |
| 6 | **SENTRY_01** | ✅ | `instrument.ts` bestaat, `sendDefaultPii: false`, `sentry-cli` in het deployscript. Sleutels staan nog niet op de VPS — dat is jouw kant |
| 7 | **NUMMER_01** | ⚠️ | mijn opdracht ging uit van één calculatietabel; er zijn er twee (§2.3). Replit heeft dat gemeld en gecorrigeerd |
| 8 | **KLANT_01** | ✅ | `middlewares/klantPoort.ts` bestaat, plus een CI-controle (`KLANT_02`) |
| 9 | **ASSISTENT_01** | ✅ | `routes/adviseur.ts`. Replit meldde één afwijking: werkbak-tab alleen in het beheerdersportaal |
| 10 | **IMPORT_01** | ✅ | rechten per type, controle-stap en terugdraaien aanwezig |
| 11 | **BACKUP_01** | ⚠️ | gebouwd, maar Replit meldde expliciet: **de NAS-kant is beschreven, niet gebouwd**, en de derde cloudkopie is alleen voorgesteld. Dat staat open |
| 12 | **DOORLOOP_01** | ✅ | drie autorisatiegaten gedicht |
| 13 | **APP_01** | ❌→✅ | zie §4.2 — zes van mijn aannames over module en niveau klopten niet; de opdracht ving het zelf op |
| 14 | **WERKBAK_01** | ✅ | `werkbak_items` + `bewaking_draaien`, dertien voeders, draait bij opstart |
| 15 | **WVB_01** | ⚠️ | Replit meldde: materiaalbehoefte per regel mét nodig-op-datum **bestond al** (`inkoopplan_regels.werkbegroting_regel_id` + `gewenste_leverdatum`). Ik vroeg te bouwen wat er stond |
| 16 | **LOON_01** | ✅ | SEPA-intake volgens hetzelfde patroon als FACTUUR_02, boekhouderportaal afgebakend |
| 17 | **MAIL_01** | ✅ | tien mailtabellen, werk-inbox met mailboxen, toegang en tokens |
| 18 | **SCENARIO_01** | ✅ | bewust **geen** nieuwe tabel: een scenario is een kopie van de begroting met status `scenario`, en hergebruikt de bestaande FIE-motor |
| 19 | **FINANCIEEL_AI_01** | ✅ | prompts in `lib/aiPrompts.ts` |
| 20 | **DOCUMENT_01** | ✅ | documentherkenning; de 220-DPI-instelling kon ik niet op die plek terugvinden — zie §6 |
| 21 | **AANVRAAG_01** | ✅ | `services/aanvraagstroomService.ts` bestaat |
| 22 | **FACTUUR_01 / 02** | ⚠️ | premisse klopt, maar de leveranciersfout uit `LEVERANCIER_01` zit hier onder. Zie §4.3 |
| 23 | **HRM_01** | ❌ | mijn §2.2 keek naar de verkeerde tabel; jij hebt dat vóór de start al gecorrigeerd |

---

## 4. De vier echte fouten

### 4.1 WAGENPARK_01 — twee uitsluitingen waren onterecht

Ik zette **rijden buiten werktijd** buiten scope ("privacytoets eerst") en **AI-afstootadvies** ("kan pas als onderhoudsfacturen aan een voertuig gekoppeld worden").

Replit heeft ze op 9 augustus allebei gebouwd:

- **Buiten werktijd** — werktijdvensters per organisatie plus voertuiguitzonderingen, rapport per voertuig met aantallen, kilometers en tijdstippen, **géén adressen en géén persoonsgegevens**, alleen op wagenpark-niveau 4, elke raadpleging in het AVG-logboek. Migratie 0023.
- **Afstootadvies** — op basis van de **eigen** `wagenpark_kosten` en vlootmedianen, niet op facturen. Server-side afgedwongen: zonder minimaal drie eigen kostenregels wordt een vervangadvies automatisch afgezwakt.

**Mijn oordeel achteraf:** de privacy-uitwerking is beter dan wat ik als voorwaarde stelde. En mijn afstoot-uitsluiting was te absoluut — ik keek naar de factuurkoppeling en zag de kostentabel over het hoofd.

**Maar dit moet je wel weten:** ik had die twee expliciet buiten scope gezet, en ze zijn er toch gekomen. Als jij ze niet los hebt opgedragen, betekent dat dat mijn scopegrenzen niet bindend zijn.

### 4.2 APP_01 — zes aannames over rechten klopten niet

| Menu-item | Ik nam aan | Werkelijk |
|---|---|---|
| Routeplanner | basislaag | backend eist niets |
| Opname | een module | alleen inloggen |
| Voertuig melden | een module | alleen inloggen |
| Documenten | `dossiers` | `bibliotheek: 1` |
| Inkooporders | "magazijn hoger" | `magazijn: 1` |
| Inkoop aanvragen | "magazijn hoger" | `magazijn: 3` |

**Dit is de belangrijkste les van deze audit.** In `APP_01` stond de eis: *"elke aanname over welk menu-item bij welke module hoort toetsen tegen de backendroute en afwijkingen melden."* Precies die zin heeft alle zes gevangen, zonder dat er iets stils is aangepast.

### 4.3 De leveranciersfout zit dieper dan FACTUUR_02

`LEVERANCIER_01` van vanochtend beschrijft dat de factuurstroom leveranciers zoekt in `crm_klanten`. Dat is niet alleen een fout in de factuurstroom — het is een fundament waar `FACTUUR_01` en `FACTUUR_02` op gebouwd zijn. Die twee zijn dus niet fout, maar staan op een scheve ondergrond.

### 4.4 HRM_01 — verkeerde tabel gemeten

Al door jou gecorrigeerd vóór de start.

---

### 4.5 De inkoopmodellen zijn van vier naar vijf gegaan

`DOORLOOP_01` stelde vast dat er **vier inkoopmodellen naast elkaar** bestaan: `inkoopplannen`, `inkoopbonnen`, `magazijn_inkooporders` en `mod_calc_inkoop_items`. Het advies daar was: dit uitzoeken **vóór** `INKOOP_01` gebouwd wordt.

`NP_INKOOP_01` heeft daar vanochtend `algemene_inkopen` bij gezet. Dat is verdedigbaar — niet-projectgebonden inkoop hoort echt apart, en ik heb expliciet verboden om `opdracht_id` optioneel te maken. Maar het getal is nu vijf, en `INKOOP_01` staat nog steeds voor de opdracht om er één keten van te maken.

**Dat had ik in `NP_INKOOP_01` moeten benoemen en heb ik niet gedaan.**

## 5. Wat er in de openstaande opdrachten aangepast moet

| Opdracht | Aanpassing |
|---|---|
| **BOUW_01** | benoemen dat "de calculatie" **`mod_calc_*`** is, niet `calculaties`. Zonder dat bouwt Replit tegen het verkeerde model |
| **BOUW_01** | de eis toevoegen die in APP_01 wél stond: *toets elke aanname over module en niveau tegen de backendroute en meld afwijkingen* |
| **BOUW_01** | jouw besluit erin: de sleutel `offertes` wordt gesplitst; monteurs krijgen nooit offertes en nooit bedragen |
| **CONTRACT_01** | ongewijzigd bruikbaar |
| **LEVERANCIER_01** | ongewijzigd, en urgenter dan gedacht — hij zit onder FACTUUR_01 en 02 |
| **INKOOP_01** | de teller staat op vijf inkoopmodellen, niet vier — `algemene_inkopen` erbij |
| **alle nieuwe** | een vaste slotregel: *wijk je af van de scope van deze opdracht, meld dat dan vóór je bouwt* |

---

## 6. Wat ik niet heb kunnen bevestigen

- **DOCUMENT_01**: de 220-DPI-instelling kon ik niet terugvinden op de plek waar ik hem verwachtte. Dat betekent niet dat hij er niet is — hij kan elders staan. Vraagt een gerichte controle.
- **Of iets werkt.** Deze audit meet aanwezigheid en samenhang, niet gedrag.
- **Of de gegevens in productie kloppen.** Daar kom ik niet bij.
