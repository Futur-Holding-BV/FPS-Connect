# MATERIAAL_01 — telling van het werkelijke inkoopgebruik (fase 0)

Opdracht: eerst tellen welk inkoopmodel werkelijk gebruikt wordt, dán kiezen (NUMMER_01 §4.5).
Dit bestand wordt **bijgewerkt, niet overschreven** — oudere metingen blijven met hun datum staan.

---

## Meting 2026-08-10 — ONTWIKKELOMGEVING (gemeten) · productie NOG TE METEN

- **Datum:** 10 augustus 2026
- **Commit:** `d17eebd5` (main, lokaal; telling-code zelf zit in de commit van deze opdracht)
- **Omgeving:** ontwikkelomgeving (Replit dev-DB). **Dit is uitdrukkelijk NIET de productiemeting die §2 vraagt.**
- **Waarom nog geen productie:** sinds 8 aug 2026 heeft de agent geen SSH/DB-toegang tot de VPS. Daarom is er een
  hoofdbeheerder-only meetvoorziening gebouwd die René ná deploy zelf op productie draait:
  - `GET /api/metingen/materiaal01` — read-only telling T1–T10 + nulmeting herstelronde
  - beheerpagina **Instellingen → Meting inkoopgebruik** (`/beheer/metingen-materiaal`) met knop
    "Kopieer als markdown"; die uitvoer wordt hieronder als productiemeting toegevoegd.
- **Gemeten vs. aangenomen:** alle cijfers hieronder zijn **gemeten** op de dev-DB. Er is **niets aangenomen**
  over productie; de productietabel ontbreekt bewust tot de meting gedraaid is.

### T1 — inkoopbonnen per status per maand (laatste 12 mnd)

| status | maand | aantal |
|---|---|---|
| concept | 2026-08 | 2 |

### T2 — magazijn_inkooporders per status per maand (laatste 12 mnd)

| status | maand | aantal |
|---|---|---|
| concept | 2026-08 | 1 |

### T3 — inkoopplannen

| totaal | waarvan tot inkoopbon geleid (via inkoopbon_regels.inkoopplan_regel_id) |
|---|---|
| 0 | 0 |

### T4 — reserveringen per status

0 rijen — tabel leeg.

### T5 — materiaal_aanvragen per status × soort × volgens_opdracht

0 rijen — tabel leeg (de bewijsaanvragen van het gedragsbewijs zijn na afloop opgeruimd).

### T6 — goedgekeurde materiaal_aanvragen: ouderdom

| oudste | langer dan 30 dagen op goedgekeurd |
|---|---|
| — (geen) | 0 |

### T7 — mod_calc_inkoop_items

| totaal | met offerte_ontvangen = true |
|---|---|
| 0 | 0 |

### T8 — onderaannemer_orders per status

0 rijen — tabel leeg.

### T9 — algemene_inkopen per soort

0 rijen — tabel leeg.

### T10 — wie maakt ze aan (per functie)

Op dev geen zinvolle uitkomst (vrijwel alle rijen zijn testdata zonder herleidbare maker).
Kanttekening bij het meetinstrument, ook voor productie relevant: **`inkoopbonnen` heeft géén
`aangemaakt_door_id`-kolom** (alleen `goedgekeurd_door_id`). T10 rapporteert voor inkoopbonnen daarom
de **goedkeurder** als dichtstbijzijnde spoor van "wie beslist dat" — dat staat zo gelabeld in de uitvoer.
`magazijn_inkooporders` en `reserveringen` hebben wél `aangemaakt_door_id` en worden op de maker herleid.

### Nulwaarden zijn een antwoord

Vrijwel alle inkooptabellen zijn op dev leeg of vrijwel leeg. Geen duiding hier — de duiding is aan René,
op basis van de **productie**meting.

---

## 2026-08-10 · productie (connect.fps-one.nl) · commit `f7e2d643` — telling door René aangeleverd

Gemeten op 2026-08-10T11:59:25Z via Instellingen → Meting inkoopgebruik.

| Telling | Uitkomst |
|---|---|
| T1 — inkoopbonnen per status/maand (12 mnd) | 0 rijen |
| T2 — magazijn-inkooporders per status/maand (12 mnd) | 0 rijen |
| T3 — inkoopplannen (totaal / met inkoopbon) | 0 / 0 |
| T4 — reserveringen per status | 0 rijen |
| T5 — materiaal-aanvragen per status × soort × volgens_opdracht | 0 rijen |
| T6 — goedgekeurde aanvragen: ouderdom | geen (0 goedgekeurd, 0 ouder dan 30 dagen) |
| T7 — calculatie-inkoopitems (totaal / offerte ontvangen) | 0 / 0 |
| T8 — onderaannemer-orders per status | 0 rijen |
| T9 — algemene inkopen per soort | 0 rijen |
| T10 — wie maakt ze aan (per functie) | 0 rijen |
| Werkbak — open items bij afgehandelde aanvragen | 0 |

**Duiding (besluit René, 2026-08-10): alle inkoopstromen zijn in productie volledig ongebruikt.**
Gevolgen:
- **MATERIAAL_01 fase 3 = keuze A** — goedgekeurde materiaal-aanvraag → automatisch concept-inkoopbon
  op de opdracht. Grond: B veronderstelt een voorraadadministratie die er niet is (reserveringen 0,
  magazijn-inkooporders 0). B en C blijven open voor als het magazijn in gebruik komt.
- **INKOOP_01 en NUMMER_01 §4.5 zijn gedeblokkeerd**: de blokkade "eerst weten welk model gebruikt
  wordt" is opgeheven — geen enkel model wordt gebruikt, dus geen gegevensmigratie en geen
  gebruikers te verstoren.
