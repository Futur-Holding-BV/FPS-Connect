# LOON_02A — Fiscaal loonfundament

## Doel en afbakening

Het loonfundament staat naast de bestaande loonstroom. Het bewaart de fiscale
identiteit en herleidbare jaarparameters waarop een latere LOON_02B-rekenkern
kan steunen. Het berekent nog geen loon, premies of loonheffing en verandert
SCAB-mail, salarisarchief, SEPA, loonstrookpublicatie en betaalprocessen niet.

## Toegang

- Hoofdbeheerder: bestaande beheerdersuitzondering.
- Externe boekhouder: identiteit via het meegeleverde systeemprofiel
  **Externe boekhouder**, gecombineerd met modulebevoegdheid
  `loonfundament:4`. Alleen een handmatig toegekend recht is niet voldoende.
- Alle andere profielen: geen menu-ingang; de webroute mount geen datahooks en
  iedere API-route antwoordt fail-closed zonder loondata.

## Scherm

De module staat op `/loonfundament` en bevat:

1. **Inhoudingsplichtigen** — CAO en fiscale werkgeversgegevens.
2. **Inkomstenverhoudingen** — meerdere fiscale verhoudingen per medewerker en
   werkgever, altijd gekoppeld aan een bestaande aanstelling.
3. **Loonafspraken** — ook in PostgreSQL afgedwongen append-only historie per
   ingangsdatum, in centen; update en directe delete worden geweigerd.
4. **Jaarparameters** — importhistorie, bronnen, hashes, vindplaatsen,
   niet-herleidbare regels en gereedheidsstatus.
5. **Loonstaten** — één staat per inkomstenverhouding en kalenderjaar, met
   maand- of vierwekentijdvakken. LOON_02A bewaart tijdvakregels uitsluitend
   als `niet_berekend` met lege waarden en cumulatieven; alleen LOON_02B mag
   hier later server-side berekende waarden aan toevoegen. PostgreSQL bewaakt
   tevens de kalendermaand, het kalenderjaar en het maximum van 12/13 perioden.

## API-routes

Alle onderstaande paden staan onder `/api`:

- `GET /loonfundament/cao-catalogus`
- `GET /loonfundament/aanstellingen`
- `GET|PATCH /loonfundament/inhoudingsplichtigen[/:id]`
- `GET|POST|PATCH /loonfundament/inkomstenverhoudingen[/:id]`
- `GET|POST /loonfundament/loonafspraken`
- `GET /loonfundament/jaarparameters`
- `GET /loonfundament/jaarparameters/:jaar`
- `GET /loonfundament/jaarparameters/:jaar/gereedheid`
- `POST /loonfundament/jaarparameters/import`
- `GET|POST /loonfundament/loonstaten`
- `POST /loonfundament/loonstaten/:id/tijdvakregels`

## CAO-indeling

De bindende indeling is:

- FPS Bouw — Metaal & Techniek
- FPS Brandpreventie — Metaal & Techniek
- FPS Bouw en Renovatie — Bouw & Infra

Werkgevers en aanstellingen verwijzen naar de CAO-catalogus. Onbekende of
tegenstrijdige historische vrije tekst wordt niet geraden maar blijft zichtbaar
in `loon_migratiebevindingen`.

## Jaarimport en gereedheid

Een importmanifest bevat exact zeven officiële bronnen. De server staat alleen
HTTPS-bronnen op `belastingdienst.nl` en subdomeinen toe, controleert ook de
uiteindelijke redirect-URL, valideert bestandstype en SHA-256 en parseert de
primaire XLSX deterministisch. Download en validatie gebeuren vóór opslag.
Voor 2026 is bovendien het gecontroleerde officiële manifest (URL, naam,
versie, SHA-256 en vindplaats) gepind in de importservice. Een beheerder kan
daarom geen ander Belastingdienst-bestand met een zelfgekozen hash tot een
volledige set verklaren. Een jaar zonder gecontroleerd manifest faalt gesloten.
Bronnen en parameters worden vervolgens in één transactie opgeslagen, met een
jaarlock tegen gelijktijdige promoties.

De nieuwste set van het gevraagde jaar is beslissend. De gereedheidsroute geeft
alleen `gereed: true` wanneer die set volledig is, exact alle vereiste
bronsoorten en geldige hashes bevat, het opgeslagen parameteraantal klopt en
iedere parameter een bron en vindplaats heeft. Er is nooit terugval naar een
vorig kalenderjaar of een oudere onzichtbare set.

## Geladen officiële set 2026

Op 20 augustus 2026 is jaarset 2026 geladen met 7.220 herleidbare
parameterrecords uit de primaire XLSX en deze zeven gepinde bronnen:

| Bron | Officieel bestand / vindplaats | SHA-256 |
|---|---|---|
| Primaire machinebron | `bijlage_rekenvoorschr_voor_geauto_loonadm_xls_lh991t61fd.xlsx` | `2d463a44286f7af24ed60c9889253ea4068e75b4ff6726c06ca1b12a9a0d9638` |
| Rekenvoorschriften | `rekenvoorschriften_voor_geautomatiseerde_loonadministratie_lh991z62fd.pdf`, januari 2026 versie 2 | `283c1857d923e8cc9ed7d0a33ae6f6c0c8f35db6c886d67ee2289324cfe58a03` |
| Parameterbijlage | `bijlage_rekenvoorschr_voor_geauto_loonadm_pdf_lh991b61fd.pdf` | `fb64f97320f4e7241a2d8c8cf13540579282e5f34156be986f540eb8dbd5ab48` |
| Gegevensspecificaties | `gegevens_aangifte_loonheffingen_2026_lh9861t62fd.pdf` | `8dcb40e3fce7175ed00e4c4d87e0135e4c3807fa52a2b941a6654a61a867089e` |
| Loonbelastingtabellen | Belastingdienst-hulpmiddel loonbelastingtabellen 2026 | `ce668b71ec2c8fa70e235461f7a5e18d984e31342420ffa51bfdb57e48466893` |
| Cijferbijlage | `Cijferbijlage-2026-bij-Nieuwsbrief-LH-LH-209-1B61FD_TG.pdf` | `1d348b84937ac2c62c1c4882f32433b012b55180434a872affd785ec48ba4233` |
| Handboek | `handboek-loonheffingen-lh0221t61fd.pdf`, versie maart 2026 | `7576eeaab3c4365e768892b343d89bc1ab8018e8f50659c067e4e5fe33c78120` |

De fiscale waarden zelf staan uitsluitend in de geïmporteerde database-rijen;
TypeScript, JavaScript en configuratie bevatten geen fiscale bedragen,
percentages of grenzen.