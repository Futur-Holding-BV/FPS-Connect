---
name: Ontwerpsysteem tokens (VORM_01)
description: Eén gedeelde tokenbron @workspace/ontwerp voor web + Expo; regels voor donker palet, webafleiding en bouwstenen
---

- `lib/ontwerp` (@workspace/ontwerp) = de enige tokenbron: kleuren (licht+donker), radius, hoogte 0-4 (één token = iOS-schaduw + Android-elevation), ruimte 4-32, typografie 6 stappen, beweging 120/200/320ms + één versnelling. Nieuwe tokens horen dáár, nooit in constants/colors.ts (doorgeefluik) of index.css.
- **Donker palet is klaar en WCAG-AA-gemeten maar staat UIT** (`DONKER_ACTIEF = false` in monteur-app hooks/useColors.ts) tot F6 alle ±1.200 hardgecodeerde kleuren heeft weggewerkt — anders onleesbare licht/donker-mengvorm. **Why:** review-bevinding; nulmeting in docs/metingen/VORM_01_nulmeting.md is de werklijst.
- Donker: knop-primair = #D93509 en destructief = #D33036 (verdiept, AA ≥4,5:1 met wit); merkkleur #F23B0D haalt met wit maar 3,88:1 en blijft alleen accent (`tint` #FF7A52). Contrastbewijs: scripts/src/vorm01-contrast.ts.
- Webafleiding (firevault injecteerOntwerpTokens) dekt bewust alleen merk- en bewegingstokens (primary/destructive/ring/radius/duren); oppervlaktekleuren blijven web-eigen in index.css — gelijktrekken zou de webstijl stilzwijgend wijzigen.
- Bouwstenen in monteur-app components/ui.tsx (15 stuks, o.a. Kaart/Rij/Statusmerk/Blad/Ladenstaat/Bedragregel + tekstStijl()): géén letterlijke kleur/maat/duur erin; statussen tonen via Statusmerk (bolletje + neutrale chip) omdat statuskleuren als tekst op licht geen AA halen. Beweging altijd achter useReducedMotion.
- Schermen met een `!token`-redirect: guard hoort in een wrapper-component boven alle hooks én achter `bezigLaden` uit useAuth — anders (a) crasht de hook-volgorde zodra het token alsnog laadt en (b) verliezen deep-links de race met async token-herstel (eindigen op /login→/menu).
- Vóór/ná-schermafdrukken: scripts/src/vorm01-schermafdrukken.ts (deep-links, MODUS=na); page.addInitScript als string doorgeven, niet als callback (Node-typecheck kent window niet).
