# WVB_01 §2 — Inventarisatie van de twaalf opdracht-tabbladen

*Datum: 8 augustus 2026 · Gemeten op commit `875c2141` · Alles hieronder is GEMETEN in de broncode (paden en regelnummers vermeld), tenzij expliciet anders aangegeven. AANGENOMEN is alleen de gebruikerskolom ("wie gebruikt het") — die volgt uit de functionele opzet, niet uit gebruiksstatistieken.*

*Gemeten op 8 augustus 2026, `artifacts/firevault/src/pages/opdrachten/detail.tsx` (tab-navigatie regel 678-717). Eén route (`/opdrachten/:id`), tabs zijn lokale schermstatus — deep-links (`?tab=…` vanuit Kompas/Inkoop) werken nu dus NIET: je landt altijd op Werkbegroting.*

| # | Tabblad | Wat het doet | Belangrijkste data | Wie gebruikt het | Overlap / oordeel |
|---|---|---|---|---|---|
| 1 | **Werkbegroting** | Begrotingsregels, totalen, vaststellen; AI-analyse-knop + PIM-samenvatting inline | werkbegroting, planning-uren, PIM | Ruben (WVB) | Kern van de stroom. Bevat nu óók de AI-analyse die tab 9 nog eens toont. |
| 2 | **Inkoopplanning** | Operationele inkoop: behoefteregels, leverancier, gewenste leverdatum, inkoopbonnen, vaststellen, AI-suggesties | inkoopplanning, artikelen, leveranciers, voorraad | Ruben | Kern. Materiaal (6) leest dezelfde behoefte. |
| 3 | **Inkoopcoach** | AI-advieslaag óver de inkoopplanning (prijsbron, categorie, bonstatus) | inkoopcoach-advies | Ruben | **Dubbel spoor** naast 2: advies hoort ín de inkoopplanning, niet als apart tabblad. |
| 4 | **Onderaanneming** | Orders naar onderaannemers (concept→betaald) | onderaannemer-orders | Ruben | Zelfstandig. Knop "naar materialen" springt misleidend naar inkoopplanning. |
| 5 | **Uitvoeringsplanning** | AI-gegenereerd fasen/takenplan met uren en materiaalmoment; vaststellen | uitvoeringsplanning | Ruben | **Dubbel met 8**: dit is het *plan*, tab 8 toont de *geboekte uren* — twee namen, gebruikers lopen er op vast. |
| 6 | **Materiaal** | Magazijn: reserveringen, uitgifte, retour (bevoegdheid magazijn≥3 voor acties) | opdracht-materiaal, voorraad | Magazijn | Zelfstandig, maar hoort ná de behoefte-stap in de stroom. |
| 7 | **Nacalculatie** | Begroot vs. werkelijk (arbeid + materiaal), PDF | nacalculatie | René/PL | Zelfstandig; alleen zinvol ná uitvoering. Kompas linkt ernaar met `?tab=` die niet werkt. |
| 8 | **Planning** | Read-only lijst ingeplande uren + link naar planningsmodule | planning-uren | PL | **Dubbel met 5** (zie boven). Feitelijk een kijkvenster op de Planning-module. |
| 9 | **AI** | Toont de AI-analyse van de werkbegroting (alleen zichtbaar als er een analyse is) | werkbegroting.ai_analyse | Ruben | **Dood spoor**: zelfde data en knoppen als tab 1; verschijnt/verdwijnt conditioneel — verwarrend. |
| 10 | **AI-regisseur** | PIM-fase: werkvoorbereidingsadvies, aandachtspunten, planningadvies, vaststellen | PIM | Ruben | **Dubbel met 9 in naam** ("ai" naast "ai-regisseur"); inhoudelijk is dít de echte AI-werkvoorbereider. |
| 11 | **Uitvoering** | PIM-stappen uitvoeren, afwijkingen, foto's, verslag | PIM-uitvoering | Monteur/PL | Kern van de uitvoeringsfase. |
| 12 | **Oplevering** | Volledigheidscheck, dossier genereren, definitief opleveren | PIM-oplevering | PL/René | Kern van de afsluitfase. |

**Expliciet dood of dubbel:**
- **AI (9)** — dood: duplicaat van wat al in Werkbegroting zit, conditioneel zichtbaar. Verwijderen.
- **Inkoopcoach (3)** — dubbel: advieslaag die in Inkoopplanning geïntegreerd hoort. Als tabblad verwijderen.
- **Planning (8) naast Uitvoeringsplanning (5)** — dubbel: samenvoegen tot één planningsbeeld (plan + geboekte uren).
- **`?tab=`-links van buitenaf** — kapot: detailpagina leest de query niet. Herstellen hoort bij elke herinrichting.
- Geen enkele tab heeft bevoegdheid-gating (alleen magazijnacties binnen Materiaal) — iedereen ziet alles.

## Voorgestelde stroom (12 tabs → fase-gedreven route)

Eén stroom die de fase van de opdracht volgt, met de soort (vaste prijs / regie) als eerste keuze:

1. **Voorbereiding** — werkbegroting (vaste prijs) óf regievoorwaarden/tarieven (regie); materiaalbehoefte per calculatieregel met nodig-op-datum; vooraf-regelen-checklist (toegang, vergunning, V&G, hoogwerker).
2. **Inkoop** — inkoopplanning mét geïntegreerd AI-advies + onderaanneming.
3. **Planning** — uitvoeringsplan én geboekte uren in één scherm (= samenvoeging 5+8), plannen op woning/doorvoer-niveau.
4. **Uitvoering** — bestaande PIM-uitvoering + materiaal/magazijn-beeld.
5. **Oplevering & nacalculatie** — bestaande oplevering + nacalculatie.

AI-regisseur wordt de adviseur bínnen de fasen (signaleert o.a. wanneer inkoop-, facturatie- en uitvoeringsplanning uit elkaar lopen), geen eigen tabblad. Bij regie slaat de stroom calculatie/offerte over maar nooit de opdracht (werknummer blijft verplicht).
