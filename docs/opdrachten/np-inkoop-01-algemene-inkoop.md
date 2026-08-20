# NP_INKOOP_01 — Algemene inkoop en het opruimen van het inkoophoofdstuk

**Opdracht voor Replit · 9 augustus 2026 · gemeten op `6011b21` (`main`)**

---

## 1. Wat er is, en wat er niet is

**Gemeten:** de hele inkoopstroom in `lib/db/src/schema/werkvoorbereiding.ts` — `inkoopplannen`, `inkoopplan_regels`, `inkoopbonnen`, `inkoop_versies`, `inkoopbon_regels`, `onderaannemer_orders` — heeft **`opdracht_id NOT NULL`**. `magazijn_inkooporders` hangt aan een `gebouw_id`.

**Gevolg: er is geen enkele plek voor inkoop die niet aan een project hangt.** Kantoorartikelen, gereedschap, PBM, een bestelling bij een webshop: dat kan nergens vastgelegd worden.

Het menu-hoofdstuk dat "Inkoop" heet (`beheerder-layout.tsx` r.531) bevat **Leveranciers · Artikelen · Inkoopoverzicht**. Dat zijn stamgegevens en één rapport, geen processtap. Het hoofdstuk **Magazijn** (r.579) is iets anders en blijft ongemoeid.

---

## 2. Hoe het in de praktijk gaat — dit is het uitgangspunt

[stated] René, 09-08-2026:

> "We kopen ook rechtstreeks van websites spullen. Daar wordt dan ook vaak al direct betaald of soms op rekening. Dan komt er geen inkoopopdracht aan te pas, niet functioneel tenminste. Wat we nu soms doen, is wel een inkooporder aanmaken en dat nummer intypen op de website bij de bestelling. Dan komt er later een factuur met dat nummer en is het weer rond."

**Daaruit volgt het hele ontwerp: het nummer is geen inkoopproces, het is een herkenningspunt om de factuur later mee terug te vinden.** Bouw dus geen bestelstroom met goedkeuringen, leveringen en orderbevestigingen. Bouw een nummer met een paar velden eromheen.

De factuurstroom is hier al op voorbereid: de afwijstekst in `factuurstroomService.ts` r.181 vraagt de leverancier om "het opdracht- of **bonnummer**" te vermelden. Dat bonnummer bestaat alleen nog niet voor algemene inkoop.

---

## 3. Wat gebouwd wordt

### 3.1 Eén nieuw item in de zijbalk

**Algemene inkoop**, als eigen post — niet verstopt onder een ander hoofdstuk. Bereikbaar voor wie recht `financieel` niveau 2 heeft (de administratie) en voor wie recht `inkoop`/`offertes` heeft, zodat Jacqueline er komt zonder ooit de werkvoorbereiding in te hoeven.

### 3.2 Twee soorten, één register

Een algemene inkoop is óf **op rekening** óf **direct betaald**. Dat verschil bepaalt alles wat erna gebeurt, dus het is de eerste keuze bij het aanmaken.

**Op rekening** — er komt later een factuur.
- Bij aanmaken ontstaat direct een **nummer** dat groot en kopieerbaar in beeld staat, zodat het in het opmerkingenveld van een webshop geplakt kan worden.
- Vastleggen: leverancier of webshop, korte omschrijving, verwacht bedrag, kostensoort, wie besteld heeft.
- Status loopt van `besteld` naar `factuur ontvangen` naar `afgehandeld`.

**Direct betaald** — er komt geen factuur, wel een bon.
- Geen nummer nodig vooraf; dit wordt achteraf vastgelegd.
- Vastleggen: leverancier, bedrag, **betaalwijze** (zakelijke pas, creditcard, contant, iDEAL), datum, kostensoort, wie betaald heeft, en **een foto of pdf van de bon**.
- Zonder bon is de regel niet af te ronden. Dat is geen pesterij: zonder bewijsstuk is het bedrag niet aftrekbaar en niet controleerbaar.

### 3.3 Het nummer

Sluit aan op de bestaande kenmerkketen (zie `NUMMER_01`): een eigen, herkenbare reeks die niet botst met opdracht-, offerte- of calculatienummers. Doorlopend, nooit hergebruikt, ook niet na verwijderen.

### 3.4 De factuur vindt zijn eigen inkoop terug

Dit is de kern van de opdracht — zonder dit is het een lijstje zonder waarde.

- Bij binnenkomst zoekt de factuurstroom **ook op algemene-inkoopnummers**, niet alleen op opdracht- en werknummers.
- Gevonden: de factuur wordt aan die inkoop gekoppeld, de kostensoort wordt overgenomen als voorstel, en het bedrag wordt vergeleken met het verwachte bedrag. **Wijkt het af, dan is dat een signaal, geen stille aanpassing.**
- Niet gevonden: het bestaande gedrag blijft gelden (`controle_nodig` of de afwijsreden `geen_opdracht`) — er wordt niets gegokt.

### 3.5 Wie mag hoeveel

Bedragsgrenzen via de bestaande goedkeuringsmotor (`/goedkeuring/beleidsregels`). **Geen nieuw goedkeuringsmechanisme.** Boven de grens gaat de inkoop eerst ter goedkeuring; eronder niet.

---

## 4. Het stamgegevens-hoofdstuk opruimen

[stated] René: het huidige inkoophoofdstuk vult de toch al drukke zijbalk terwijl er weinig mee gedaan wordt.

1. **Leveranciers** en **Artikelen** verhuizen naar instellingen/beheer. De schermen blijven wat ze zijn; alleen de vindplaats verandert. Bestaande adressen blijven werken via een doorverwijzing.
2. **Een nieuwe leverancier aanmaken wordt een knop** op de plek waar je hem nodig hebt — in een inkoopregel, in een factuur, in een algemene inkoop. Niet meer eerst wegnavigeren en terugkomen.
3. **Artikellijsten toevoegen** blijft eveneens bereikbaar als handeling vanuit de plek waar je artikelen kiest.
4. **Inkoopoverzicht** (`GET /inkoop/overzicht`) verhuist naar de werkvoorbereiding, want dat is waar de projectinkoop hoort. Het krijgt er de algemene inkoop **niet** bij — dat is een eigen lijst.
5. Het hoofdstuk **Magazijn** blijft ongewijzigd staan.

**Let op bij de leveranciersknop — gemeten valstrik.** Er bestaan **twee leveranciersregisters**: `crm_klanten` en de oudere `leveranciers`-tabel. `factuurstroomService.ts` r.468-480 overbrugt die twee door bedrijfsnamen te normaliseren en te vergelijken. Een knop "nieuwe leverancier" mag daar **geen derde ingang** bij maken. Meld bij oplevering in welk van beide registers de knop schrijft en wat dat betekent voor die brug.

---

## 5. Verboden

- Geen bestelstroom met orderbevestigingen, leveringsmomenten of pakbonnen voor algemene inkoop. Dat hoort bij projectinkoop.
- `opdracht_id` blijft verplicht op de bestaande inkooptabellen. Algemene inkoop krijgt een **eigen tabel**; maak de bestaande koppeling niet optioneel — dat zou de factuurcontrole verzwakken die juist op die verplichting rust.
- Geen derde leveranciersregister.
- Geen automatische goedkeuring van een bedrag dat afwijkt van wat er verwacht werd.
- Geen algemene inkoop zonder kostensoort.

---

## 6. Acceptatie

Met vermelding van commit-SHA, GitHub `main`-SHA en productie-SHA:

1. Een algemene inkoop **op rekening** aanmaken levert direct een nummer op dat in beeld staat en te kopiëren is. Toon het scherm.
2. Een leveranciersfactuur waarin dat nummer voorkomt, wordt automatisch aan die inkoop gekoppeld. Toon de factuur, het nummer en de koppeling.
3. Dezelfde factuur met een bedrag dat afwijkt van het verwachte bedrag levert een **signaal** op en wordt niet stil goedgekeurd.
4. Een factuur zonder herkenbaar nummer gedraagt zich precies zoals nu — aantonen dat het bestaande gedrag niet veranderd is.
5. Een algemene inkoop **direct betaald** is niet af te ronden zonder bon. Toon de weigering.
6. Jacqueline komt bij Algemene inkoop **zonder** de werkvoorbereiding te openen. Toon met welk recht dat gaat.
7. Leveranciers en Artikelen staan niet meer in de zijbalk; de oude adressen verwijzen door. Een nieuwe leverancier is aan te maken vanuit een inkoopregel zonder de pagina te verlaten.
8. Gemeld: in welk leveranciersregister die knop schrijft, en wat dat betekent voor de naambrug in de factuurstroom.
