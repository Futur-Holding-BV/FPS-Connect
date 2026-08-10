# VORM_01 — Nulmeting (F0)

**Datum: 10 augustus 2026 · gemeten op `76ea391d` (main) · alles hieronder is GEMETEN tenzij anders vermeld.**

## 1. Inline `style={{`-objecten

Totaal in `app/`: **2.483** · in `components/`: **147** · bestanden met `StyleSheet.create` in app+components: **10**.

De vijftien zwaarste schermen:

| # | Scherm | inline stijlblokken |
|---|---|---|
| 1 | `app/uitvoering/[opdrachtId].tsx` | 204 |
| 2 | `app/uren.tsx` | 140 |
| 3 | `app/incidenten.tsx` | 121 |
| 4 | `app/plattegrond/[verdiepingId].tsx` | 120 |
| 5 | `app/toolboxen.tsx` | 101 |
| 6 | `app/hrm/verlof.tsx` | 91 |
| 7 | `app/werkdag/[id].tsx` | 90 |
| 8 | `app/magazijn/scan.tsx` | 89 |
| 9 | `app/info.tsx` | 86 |
| 10 | `app/lmra.tsx` | 85 |
| 11 | `app/opname/item/[itemId].tsx` | 83 |
| 12 | `app/opname/[id].tsx` | 67 |
| 13 | `app/berichten.tsx` | 67 |
| 14 | `app/mijn-auto.tsx` | 51 |
| 15 | `app/uitvoerder/[sessie_id].tsx` | 46 |

## 2. Hardgecodeerde kleurwaarden buiten `useColors()`

Totaal in `app/` + `components/` (hex + rgba, `constants/` uitgezonderd): **1.219**. Dit is de werklijst.

Zwaarste bestanden: `uitvoering/[opdrachtId].tsx` (129) · `werkdag/[id].tsx` (59) · `toolboxen.tsx` (58) · `opname/item/[itemId].tsx` (57) · `pbm.tsx` (52) · `hrm/declaraties.tsx` (48) · `menu.tsx` (47) · `magazijn/inkoop.tsx` (40) · `magazijn/scan.tsx` (35) · `components/PdfPlattegrond.tsx` (34) · `uren.tsx` (34).

Meest voorkomende waarden: `#fff` (237×) · `#16a34a` (55×) · `#dc2626` (52×) · `#6b7280` (50×) · `#d97706` (40×) · `#F23B0D` (32× — de merkkleur zelf hardgecodeerd i.p.v. via tokens) · `#92400e` (25×). De drift is dus vooral **Tailwind-standaardkleuren** (green-600, red-600, gray-500, amber-600) die naast het eigen palet zijn geslopen — precies status- en signaalkleuren, wat de noodzaak van een `Statusmerk`-bouwsteen (F3) bevestigt.

## 3. Schermafdrukken vóór

Vaste maat 402×874 @2x, in `docs/metingen/vorm01/voor/`: `mijn-werk.png` · `menu.png` · `werkdag-index.png` · `uren.png` · `gebouw-id.png` (gebouw 13) · `hrm-index.png`. Zelfde script draait de ná-ronde (`MODUS=na`, `scripts/src/vorm01-schermafdrukken.ts`).

**Afwijkingen t.o.v. de opdracht (gemeten):**
- `werkdag/[id]`: de dev-database heeft **0 `planning_items`**, dus er bestaat geen werkdag-detail om af te beelden. In plaats daarvan is `werkdag/index` vastgelegd; vóór/ná blijft daarmee vergelijkbaar.
- `app/mijn-werk.tsx` is **vanuit de UI onbereikbaar**: geen enkel scherm of menu-item navigeert ernaar (0 verwijzingen buiten het bestand zelf en een cache-prefetch in `context/offline.tsx`). Het scherm werkt wél via directe URL. Besluit voor René bij F5-akkoord: krijgt Mijn werk een ingang, of vervalt het scherm?
- Deep-links naar token-bewaakte schermen verloren de race met het asynchrone token-herstel (redirect naar /login → /menu vóór het token uit de opslag terug was). Minimale guard (`bezigLaden`) toegevoegd op `mijn-werk`, `uren`, `hrm/index`, `werkdag/index`; bij `werkdag/index` stond de oude redirect vóór latere hooks (verborgen hook-volgordefout die bij deep-links een crash gaf) — guard naar een wrapper verplaatst. Geen stijl- of functiewijziging.

## 4. iOS-only pakketten (§3 van de opdracht) — GEMETEN in node_modules

| Pakket | Bevinding | Gevolg |
|---|---|---|
| `expo-glass-effect` 0.1.10 | beschrijving: "…native glass effect view **on iOS**"; **geen `android/`-map**; implementatie alleen `.ios.tsx`-varianten | **doet niets op Android** → niet gebruiken; diepte komt uit schaduw/elevatie, gradiënt en beweging |
| `expo-symbols` 1.0.8 | beschrijving: "…SF Symbols library **on iOS**"; **geen `android/`-map** | **doet niets op Android** → `@expo/vector-icons` blijven gebruiken |

## 5. Donkere modus (bevestiging bevinding §1 opdracht)

`useColors()` schakelt op `useColorScheme()`, maar `constants/colors.ts` heeft **geen `dark`-sleutel** — systeeminstelling donker doet nu niets. Gemeten: `"dark" in colors` is false.
