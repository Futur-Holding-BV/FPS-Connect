# NAV_01 — Contrastmeting hoofdstukkleuren (WCAG AA)

Gemeten op de definitieve tokens in `lib/ontwerp/src/index.ts`
(`hoofdstukKleuren`), met dezelfde luminantieformule als
`contrastVerhouding()` in dat bestand. Eis: ≥ 4,5:1 als tekstkleur op de
eigen ondergrond (WCAG AA, normale tekst).

Ondergronden:
- **Licht** = `#FFFFFF` (kaart/wit; strengste lichte ondergrond — achtergrond
  `#F6F7F9` geeft alleen maar hogere waarden)
- **Donker** = `#212631` (donkere sidebar-laag én het donkere palet)

| Hoofdstuk | `opLicht` | op wit | `opDonker` | op donker |
|---|---|---|---|---|
| Projectaanpak | `#BD380F` | 5,62:1 | `#F06B42` | 4,97:1 |
| Magazijn | `#AE6109` | 4,65:1 | `#F59F3D` | 7,15:1 |
| Commercie | `#906D04` | 4,80:1 | `#FAC938` | 9,72:1 |
| Communicatie | `#137BAE` | 4,70:1 | `#47B4EB` | 6,49:1 |
| Veiligheid | `#B3191F` | 6,83:1 | `#E96367` | 4,65:1 |
| Financieel | `#18864F` | 4,60:1 | `#52E099` | 9,00:1 |
| Goedkeuring | `#6629A3` | 8,71:1 | `#AB78DD` | 4,66:1 |
| Declaraties | `#A8247C` | 6,55:1 | `#DE63B5` | 4,73:1 |
| Organisatie | `#2952A3` | 7,42:1 | `#688ED9` | 4,66:1 |
| Personeel | `#128178` | 4,73:1 | `#4CE6D9` | 9,83:1 |
| Loon | `#498321` | 4,61:1 | `#8FD65C` | 8,61:1 |

**Alle 22 combinaties ≥ 4,5:1.** De varianten zijn programmatisch berekend
(lichtheid per tint verlaagd/verhoogd tot de drempel gehaald werd) zodat de
eis per constructie geldt, en daarna hier vastgelegd.

Gebruiksregels (NAV_01 §2):
- Kleur is een **merkteken**, geen achtergrond: gekleurde tekst/stip/accentlijn
  op een neutrale ondergrond. Er staat nooit tekst óp een hoofdstukkleur.
- Kleur is nooit het enige signaal: de hoofdstuknaam staat er altijd bij.
- De sidebar is óók in het lichte schema donker; daarom leest de sidebar
  altijd de `-sidebar`-variabele (= `opDonker`). Paginavlakken lezen
  `--hoofdstuk-<naam>`, die per schema wisselt (licht→`opLicht`,
  donker→`opDonker`) via `cssVariabelen()`.

Schermafdrukken: `docs/metingen/afbeeldingen/NAV_01_*.png`.
