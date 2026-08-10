# VORM_01 — Antwoorden & verantwoording

**Datum: 10 augustus 2026 · status: F0 t/m F5 gereed, wacht op akkoord René vóór F6.**

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
