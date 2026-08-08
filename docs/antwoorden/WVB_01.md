# Antwoorden en bevindingen — WVB_01

## 8 augustus 2026 · gemeten op commit `875c2141`

**Vraag (opdracht §2):** inventariseer de twaalf opdracht-tabbladen — wat doet elk, wie gebruikt het, waar overlapt het, wat is dood — vóórdat er gebouwd wordt.

**Antwoord:** volledige tabel in [`docs/metingen/WVB_01_tabbladen.md`](../metingen/WVB_01_tabbladen.md). Kernbevindingen:

- **GEMETEN:** de "AI"-tab is een duplicaat van de AI-analyse in Werkbegroting (zelfde hook/data, conditioneel zichtbaar) → dood. Inkoopcoach is een advieslaag naast Inkoopplanning → dubbel. Planning (geboekte uren) naast Uitvoeringsplanning (fasenplan) → dubbel. Externe links met `?tab=` (Kompas, Inkoop) werken niet: de detailpagina leest de query niet en landt altijd op Werkbegroting. Geen enkele tab kent bevoegdheid-gating (alleen magazijn-acties bínnen Materiaal).
- **AANGENOMEN:** de gebruikerskolom (wie welke tab gebruikt) volgt uit de functionele opzet, niet uit gebruiksstatistieken — er is geen gebruiksmeting per tab.

**BESLUIT VAN RENÉ — GENOMEN (8 augustus 2026):** akkoord op de consolidatie 12 tabbladen → 5 fasen (Voorbereiding · Inkoop · Planning · Uitvoering · Oplevering & nacalculatie): *"Ja, bouw de stroom zo."* Inkoopcoach en de losse AI-tab verdwijnen (inhoud gaat op in Inkoop resp. Werkbegroting); Planning + Uitvoeringsplanning worden één scherm. Bouw gestart na dit besluit.

## 8 augustus 2026 · gebouwd (bewijs op deze commit)

**Status:** de 5-fasen-stroom is gebouwd conform het besluit van René.

- **GEMETEN (HTTP-gedragsbewijs, `scripts/src/bewijs-wvb-stroom.ts`, alle scenario's geslaagd):**
  1. Vooraf-regelen-checklist: initialiseren (4 standaarditems), afvinken met audit (wie/wanneer), eigen item toevoegen/verwijderen.
  2. Regie-dagdeeltarieven: tariefsoort `dagdeel` wordt opgeslagen en teruggegeven — geen stilzwijgende 4-uur-aanname.
  3. Divergentiesignaal: leverdatum ná oplevering → open compliance-signaal bij vaststellen; na datumcorrectie + hervaststellen automatisch opgelost.
- **GEMETEN:** materiaalbehoefte-per-regel met nodig-op-datum bestond al (`inkoopplan_regels.werkbegroting_regel_id` + `gewenste_leverdatum`) — niet dubbel gebouwd; dit is het scharnierpunt naar INKOOP_01.
- **AANGENOMEN:** de UI-herindeling (tabbladen → fasen, alias-redirects van oude `?tab=`-links) is geverifieerd via typecheck en de bestaande compilatie; geen aparte browser-e2e in deze ronde.
- **GEMETEN (review-hardening):** dubbele open signalen met dezelfde dedup-sleutel zijn database-onmogelijk gemaakt (partiële unieke index, migratie 0014) en bewezen met 5 parallelle inserts → exact 1 rij. Dagdeeltarieven tellen niet mee in de uurtarief-middeling van het regie-dashboard. De fase-tab volgt de URL nu ook reactief (browser-terug/vooruit).
