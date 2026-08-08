# Antwoorden en bevindingen — WVB_01

## 8 augustus 2026 · gemeten op commit `875c2141`

**Vraag (opdracht §2):** inventariseer de twaalf opdracht-tabbladen — wat doet elk, wie gebruikt het, waar overlapt het, wat is dood — vóórdat er gebouwd wordt.

**Antwoord:** volledige tabel in [`docs/metingen/WVB_01_tabbladen.md`](../metingen/WVB_01_tabbladen.md). Kernbevindingen:

- **GEMETEN:** de "AI"-tab is een duplicaat van de AI-analyse in Werkbegroting (zelfde hook/data, conditioneel zichtbaar) → dood. Inkoopcoach is een advieslaag naast Inkoopplanning → dubbel. Planning (geboekte uren) naast Uitvoeringsplanning (fasenplan) → dubbel. Externe links met `?tab=` (Kompas, Inkoop) werken niet: de detailpagina leest de query niet en landt altijd op Werkbegroting. Geen enkele tab kent bevoegdheid-gating (alleen magazijn-acties bínnen Materiaal).
- **AANGENOMEN:** de gebruikerskolom (wie welke tab gebruikt) volgt uit de functionele opzet, niet uit gebruiksstatistieken — er is geen gebruiksmeting per tab.

**BESLUIT VAN RENÉ NODIG (open):** akkoord op de voorgestelde consolidatie 12 tabbladen → 5 fasen (Voorbereiding · Inkoop · Planning · Uitvoering · Oplevering & nacalculatie), waarbij Inkoopcoach en de losse AI-tab verdwijnen (inhoud gaat op in Inkoop resp. Werkbegroting) en Planning + Uitvoeringsplanning één scherm worden. Vraag gesteld op 8 augustus 2026; er wordt niet gebouwd vóór dit besluit.
