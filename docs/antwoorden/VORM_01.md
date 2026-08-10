# VORM_01 — Antwoorden & verantwoording

**Datum: 10 augustus 2026 · status: F0 t/m F5 gereed, wacht op akkoord René vóór F6.**

## 0. Herbewijs-ronde (na eerste beoordeling René, 10-08)

1. **Bewijs opnieuw met gevulde gegevens:** nieuw script `scripts/src/vorm01-testdata.ts` zet 7 representatieve spots (2 gebouwen, 6 verschillende statussen) op het e2e-account (idempotent, prefix `VORM01-`, `MODUS=weg` ruimt op). Vóór/ná van `mijn-werk` is opnieuw gemaakt **mét inhoud**: Kaart, Rij, Statusmerk, SchermKop en de sectiekoppen zijn nu zichtbaar te vergelijken. Voor de vóór-afdruk is de oude schermversie tijdelijk teruggezet met alléén de (stijl-neutrale) `bezigLaden`-guard erin — zonder die guard verliest de oude build elke deep-link.
2. **Accentverlies lege toestand teruggedraaid:** `LegeStatus` toont het pictogram weer in merkkleur op een zacht-oranje cirkel (`c.primary` op `c.accent`), zoals vóór de omzetting. Gecontroleerd op systematiek: dit was de enige plek waar accent door grijs was vervangen; `Statusmerk` gebruikt bewust een gekleurd bolletje + neutrale tekst (AA-afweging §1.6) en de overige bouwstenen gebruiken gedempte kleur alleen voor ondergeschikte tekst/pictogrammen, zoals ook vóór VORM_01.
3. **Mijn werk — voorstel voor de ingang (nog niet gebouwd, keuze aan René):**
   - **Optie A — 18e radiaalmenu-item.** Voordeel: overal bereikbaar. Nadeel: het radiaalmenu is al vol; een extra item verhoogt de menudrukte voor iets dat inhoudelijk bij de werkdag hoort.
   - **Optie B — ingang vanaf Mijn werkdag.** De regel "N locaties vandaag" (die zijn teller nu al uit `/mijn-werk`-data haalt) wordt aanklikbaar en opent Mijn werk. Voordeel: nul extra menudrukte, de ingang staat precies waar de monteur al kijkt, en de bestaande teller krijgt betekenis. Nadeel: één tik dieper dan het menu.
   - **Afweging/advies: optie B** — laagste menudruk, logische plek (werkdag verwijst er al impliciet naar), geen wijziging aan het radiaalmenu.

## 0b. Tweede beoordelingsronde (10-08, akkoord F6 met twee referentiescherm-punten)

1. **Afkappen midden in een woord opgelost als bouwsteenregel:** nieuwe bouwsteen `Onderregel` (secundaire informatieregel, loopt door op een tweede regel) + regel in `Statusmerk` (`flexShrink: 0` — de chip wordt nooit platgedrukt). Zichtbaar in de nieuwe ná-afdruk: "Begane grond" en "1e verdieping" staan er volledig.
2. **Rauwe databasewaarden:** nieuwe helper `netteWaarde()` in de bouwstenen (underscores → spaties, hoofdletter voorop) als vangnet wanneer een labelvertaling ontbreekt; `mijn-werk` gebruikt hem. **Gemelde opruimtaak (buiten VORM_01):** `voorzieningen.type` is een vrije tekstkolom met twee spellingen door elkaar (branddeur vs brandwerende_deur, doorvoering vs doorvoer, coating vs brandwerende_coating) — vergt één vaste typelijst + migratie van de afwijkende waarden.
3. **Ingang Mijn werk = optie A** (besluit René): 18e radiaalmenu-item "Mijn werk" met `vereist: { module: "voorzieningen", niveau: 1 }`. **Toetsing backend:** `GET /mijn-werk` heeft alleen `requireAuth`, geen module-check. Mijn oordeel: dat volstaat hier — het eindpunt filtert hard op `monteur_id = ingelogde gebruiker` en geeft dus per definitie alleen eigen toegewezen werk terug; iemand zonder voorzieningen-recht kan er via deep-link hooguit een lege lijst zien (spots worden alleen aan monteurs toegewezen). Wil men de gordel-én-bretels-lijn van de module-matrix, dan is `requireBevoegdheid("voorzieningen", 1)` een kleine toevoeging — gemeld, niet eigenmachtig gedaan omdat het menu-item de afgesproken plek van de bevoegdheid is.

## Fase-overzicht

| Fase | Resultaat |
|---|---|
| F0 | Nulmeting in `docs/metingen/VORM_01_nulmeting.md` + 6 vóór-schermafdrukken in `docs/metingen/vorm01/voor/` |
| F1 | Tokens: hoogte (5 niveaus), ruimte (4/8/12/16/24/32), typografie (6 stappen), beweging (120/200/320 ms + één versnelling), donker palet — WCAG AA gemeten (zie §2) |
| F2 | Eén gedeelde tokenbron: nieuw workspace-pakket `@workspace/ontwerp` (`lib/ontwerp/src/index.ts`). Monteur-app (`constants/colors.ts`) is een doorgeefluik; firevault leidt zijn **merk- en bewegingsvariabelen** (primair, destructief, ring, radius, duren, versnelling) af via `injecteerOntwerpTokens()` in `main.tsx` — web-eigen oppervlaktekleuren (achtergrond/kaart/popover/sidebar) blijven bewust in `index.css`, anders zou de bestaande webstijl stilzwijgend wijzigen. Sync-commentaar is weg |
| F3 | `components/ui.tsx` van 5 naar 15 bouwstenen: bestaand (Knop, LijstFout, TekstVeld, SectieLabel, ChipRij) + Kaart, Rij, Statusmerk, SchermKop, LegeStaat (= bestaande `LegeStatus`, hergebruikt), Bevestigknop (haptiek), Tabrij, Blad, Ladenstaat, Waarschuwvlak, Bedragregel (nl-NL €) + `tekstStijl()`-helper. Geen letterlijke kleur, maat of duur in de bouwstenen |
| F4 | Reanimated (verschijn-animaties + skeleton-puls), expo-linear-gradient (kopbalk-diepte), expo-haptics (Bevestigknop); álles achter `useReducedMotion` — staat "verminderde beweging" aan, dan staat alles stil |
| F5 | Alleen `app/mijn-werk.tsx` omgezet; vóór/ná in `docs/metingen/vorm01/{voor,na}/mijn-werk.png`. **Gestopt — F6 start pas na akkoord** |

## 1. Afwijkingen van de opdracht (melden verplicht)

1. **`app/mijn-werk.tsx` is vanuit de UI onbereikbaar** — geen enkel menu-item of scherm navigeert ernaar. F5 is er tóch op uitgevoerd (opdracht noemt het scherm expliciet). Vraag bij akkoord: krijgt Mijn werk een ingang, of vervalt het scherm?
2. **`werkdag/[id]`-schermafdruk vervangen door `werkdag/index`** — de dev-database heeft 0 planning_items, er bestaat geen detail om af te beelden.
3. **Kleine gedragsfix buiten scope, wel nodig voor de metingen:** deep-links naar token-bewaakte schermen verloren de race met het asynchrone token-herstel. Guard (`bezigLaden`) toegevoegd op mijn-werk/uren/hrm/werkdag; bij werkdag zat daarachter een verborgen hook-volgordefout (redirect vóór latere hooks) die het scherm bij deep-links liet crashen — guard naar een wrapper verplaatst. Geen stijlwijziging.
4. **iOS-only bevestigd (nulmeting §4):** expo-glass-effect en expo-symbols hebben geen Android-implementatie → niet gebruikt; diepte komt uit schaduw/elevatie, gradiënt en beweging; iconen blijven @expo/vector-icons.
5. **Donker palet: primary/destructive iets verdiept.** Wit op merkkleur #F23B0D haalt maar 3,88:1. In het donkere palet is de knop-achtergrond daarom #D93509 (zelfde tint, AA 4,70:1) en destructief #D33036 (4,95:1); de merkkleur blijft zichtbaar als accent via `tint` #FF7A52 (5,88:1 op de achtergrond). Het lichte palet is niet aangeraakt (basis blijft basis), maar let op: ook daar haalt witte knoptekst op #F23B0D formeel geen 4,5:1 (bestaande situatie, geen VORM_01-wijziging).
6. **Statuskleuren als losse tekst op licht** (bv. groen #22A06B op de achtergrond) halen geen AA — daarom toont de nieuwe `Statusmerk`-bouwsteen statussen als bolletje + neutrale tekst op een chip, i.p.v. gekleurde tekst.

## 2. Donker palet — gemeten WCAG-contrasten (script: `scripts/src/vorm01-contrast.ts`)

Alle paren ≥ 4,5:1 (AA), GEMETEN:

| Paar | Waarden | Contrast |
|---|---|---|
| tekst op achtergrond | #F3F5F8 op #212631 | 13,87:1 |
| tekst op kaart | #F3F5F8 op #2A3140 | 11,93:1 |
| gedempt op achtergrond | #A9B2C0 op #212631 | 7,08:1 |
| gedempt op kaart | #A9B2C0 op #2A3140 | 6,09:1 |
| knoptekst op primair | #FFFFFF op #D93509 | 4,70:1 |
| tekst op secundair | #F3F5F8 op #343C4E | 10,11:1 |
| tekst op destructief | #FFFFFF op #D33036 | 4,95:1 |
| accenttekst | #FFA184 op #212631 | 7,71:1 |
| succes als tekst | #4CC08E op #212631 | 6,66:1 |
| waarschuwing als tekst | #F0A045 op #212631 | 7,08:1 |
| tint/links | #FF7A52 op #212631 | 5,88:1 |
| tekst op donker vlak | #F3F5F8 op #171B23 | 15,79:1 |
| gedempt op donker vlak | #A9B2C0 op #171B23 | 8,06:1 |

Kanttekening (na review aangescherpt): het donkere palet is volledig klaar en gemeten, maar het volgen van de systeeminstelling staat bewust nog **uit** (`DONKER_ACTIEF = false` in `hooks/useColors.ts`). Met 1.219 hardgecodeerde kleuren in nog niet omgezette schermen zou donker nu een onleesbare mengvorm opleveren; bij afronding van F6 gaat de schakelaar om.

## 3. Wat F6 wordt (na akkoord)

Alle 58 schermen omzetten naar de bouwstenen + tokens, werklijst = nulmeting §1/§2 (zwaarste eerst). Geen scherm herbouwen; alleen stijlen vervangen.
