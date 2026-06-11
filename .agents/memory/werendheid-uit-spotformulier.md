---
name: Werendheid niet meer per spot kiezen
description: Spot create/edit forms must not offer a brand-/rookwerendheid selector; value is derived from the linked toepassing in reports/displays.
---

Spot-AANMAAK- en spot-BEWERKformulieren (web `plattegrond.tsx` + `voorziening-bewerken-dialog.tsx`, mobiel `[verdiepingId].tsx`) bieden GEEN keuze meer voor meetwaarde / brand- of rookwerendheid. Niet opnieuw toevoegen.

**Regels:**
- CREATE stuurt altijd `classificatie: "60"` (verplicht in VoorzieningInput; "60" = "niet gespecificeerd", consistent met de server-default).
- EDIT stuurt classificatie/wbdbo/wrd helemaal NIET mee → Drizzle `.set()` skipt undefined → legacy waarden blijven behouden (geen dataverlies).
- Weergave/rapportage leidt de werendheid af uit de gekoppelde toepassing via `label.testnorm` (regex `/^(WRD|EW|EI)\s?(\d+)/i`), met fallback op legacy spot `wbdbo`/`wrd`/`classificatie`. Een echte EN-norm matcht niet → geen afgeleide waarde.
- `classificatie === "60"` zonder wbdbo/wrd wordt overal als "—"/verborgen getoond (print.tsx deed dit al; detail.tsx, qr.tsx en mobiel detail-modal volgen ditzelfde).

**Why:** Monteurs moesten geen juridisch-relevante meetwaarde per spot kiezen; de bron van waarheid is de bibliotheek (toepassing/document), niet een losse spot-keuze. "60" is bewust de neutrale default, niet een echte EI 60.

**How to apply:** Bij werk aan spotformulieren of -weergaves: voeg geen werendheid/meetwaarde-selector toe; leid af uit toepassing.testnorm. Meetwaarden in bibliotheek/toepassingen/documenten blijven ongemoeid.

**Caveat:** Legacy spots waar ooit echt EI 60 gekozen is, zijn niet te onderscheiden van "niet gespecificeerd" en tonen nu "—". Geaccepteerd.
