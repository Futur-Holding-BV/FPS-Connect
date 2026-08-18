# ADMINISTRATIE_02 — btw-schema, drie-weg-controle en crediteuren-betaalbatch

Datum: 18 augustus 2026. Meting: `docs/metingen/ADMINISTRATIE_02-meting.md`.

## Deel 1 — Btw-codes per BV (gebouwd, bewezen 18/18)

- Nieuwe tabel `btw_codes` per werkmaatschappij (migratie 0089), gevuld via
  AccountView-sync (fail-soft meting) of lijst-import (`code;omschrijving;percentage`)
  in Beheer → Boekhouding, onder het rekeningschema.
- Overal keuzelijst in plaats van vrije tekst: factuurdetail (bewerkveld) en
  leveranciersdetail (default). Leeg schema → nette terugval (H/L/V/0) met melding;
  onbekende bestaande waarde → amber-waarschuwing.
- **Boekingspoort**: exporteren naar AccountView weigert een btw-code buiten het
  schema van de BV van de factuur (422, leesbare reden) — zelfde poort als het
  rekeningschema, ook op forceer-herexport en batch-export.
- **Aangeleerde voorkeuren**: het categorisatievoorstel toetst grootboek- én
  btw-voorstel aan het schema; buiten-schema waarden worden niet meer voorgesteld
  (met `buiten_schema`-melding).
- **Gebruiksmeting**: `GET /btw-codes/gebruik` wijst typefouten in bestaande data aan.
- Bewust buiten scope: `eenheidsprijzen.btw_code` (calculatiedomein, waardenset
  "hoog/laag") — dat is een prijsstellingsveld, geen boekingsveld.

## Deel 2 — Drie-weg-controle (gebouwd, bewezen 23/23)

**Eerlijke melding vooraf:** de derde weg (ontvangst) bestaat nog niet in de
projectinkoop. Inkoopbonnen hebben alleen een grove status (besteld/geleverd),
geen ontvangen aantallen per regel. De controle die nu live staat is daarom een
**twee-en-een-halve-weg**: bestelling ↔ factuur, met de bonstatus als indicatie
en een expliciete melding `geleverd_registratie: ontbreekt`.

Wat er nu werkt op de inkoopfactuur:

- Koppeling factuur ↔ inkooporder in één handeling, met suggesties: I-nummer in
  de factuurtekst (zekerheid hoog) of leverancier + bedrag ±5% (gemiddeld).
- Vergelijking besteld (bon) vs. gefactureerd (alle niet-afgekeurde facturen op
  die bon samen, dus deelfacturen tellen op). Afwijking > €0,01 → factuur gaat
  naar controle met een systeemopmerking met het verschil.
- Facturen zonder koppeling zijn herkenbaar als "zonder bestelling".

**Voorstel voor de echte derde weg** (nog niet gebouwd): ontvangstregistratie
per inkoopbonregel (aantal ontvangen + datum + wie), in te vullen door de
monteur/uitvoerder bij levering, ook via de mobiele app. Daarmee wordt de
controle compleet: besteld = ontvangen = gefactureerd. Zeg het als je dit wilt;
het raakt werkvoorbereiding én de app.

## Deel 3 — Crediteuren-betaalbatch met SEPA (gebouwd, bewezen 12/12, **staat UIT**)

> **Gaat pas werken na jouw uitdrukkelijk akkoord.** De hele functie zit achter
> de schakelaar "betaalbatch actief" (Beheer → Instellingen, standaard uit).
> Zolang die uit staat weigeren alle betaal-endpoints met een duidelijke melding.

Werking (pagina Facturen → Betaalbatch):

1. Kies de BV; je ziet welke inkoopfacturen betaalbaar zijn en waarom de rest
   (nog) niet: alleen **geaccordeerd én in AccountView geboekt**, nooit
   geblokkeerd/afgekeurd/al betaald, leverancier moet een geldig IBAN hebben
   (mod-97-controle), factuur-BV moet gelijk zijn aan de batch-BV,
   G-rekeningfacturen vallen erbuiten (verdeelde betaling blijft handwerk).
2. Batch aanmaken → SEPA-bestand (pain.001.001.03) downloaden en bij de bank
   inleveren. Debiteurrekening = de rekening met doel "crediteuren" van de BV.
3. Bevestigen in **één handeling**: batch definitief én facturen op betaald met
   de uitvoerdatum als betaaldatum. Dit is bewust één knop, want er is nog geen
   bankafschrift-import (CAMT/MT940) die de uitvoering automatisch terugkoppelt.
   Zolang je niet bevestigt kun je annuleren; de facturen worden dan weer betaalbaar.
   Eén factuur kan nooit in twee batches zitten (hard afgedwongen).

**Gemelde gaten + voorstellen:**

- *Bankafschrift-import ontbreekt* — voorstel: CAMT.053-import die betalingen
  automatisch afletterd tegen batches en facturen. Dan wordt "bevestigen" een
  automatische terugkoppeling in plaats van een handmatige knop.
- *Betaalkorting ligt nergens vast* — voorstel: veld op de leverancier
  (percentage + termijn in dagen); de batch kan dan bij een vroege uitvoerdatum
  het kortingsbedrag voorstellen. Nu niets gebouwd, omdat elke aanname over
  kortingsvoorwaarden verzonnen data zou zijn.
- *Vervaldatum-bewaking*: betaalbare facturen staan op vervaldatum gesorteerd in
  de batchpagina; een werkbak-voeder "facturen naderen vervaldatum" kan erbij
  zodra de functie met jouw akkoord aan gaat (anders bewaakt hij een proces dat
  nog niet bestaat).

## Bewijs

- `scripts/src/verificatie-grootboekschema.ts` — 23/23 (btw-schema, poort,
  voorkeuren, gebruik-meting, drie-weg: suggestie/koppelen/afwijking/derde weg).
- `scripts/src/verificatie-betaalbatch.ts` — 12/12 (423-akkoordpoort, selectieredenen,
  fail-closed aanmaken, dubbele-batchweigering, pain.001-structuur en controlesom,
  bevestigen→betaald, bevestigde batch niet annuleerbaar).
