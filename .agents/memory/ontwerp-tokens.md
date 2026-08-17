---
name: Ontwerpsysteem tokens (VORM_01)
description: Eén gedeelde tokenbron @workspace/ontwerp voor web + Expo; regels voor donker palet, webafleiding en bouwstenen
---

- `lib/ontwerp` (@workspace/ontwerp) = de enige tokenbron: kleuren (licht+donker), radius, hoogte 0-4 (één token = iOS-schaduw + Android-elevation), ruimte 4-32, typografie 6 stappen, beweging 120/200/320ms + één versnelling. Nieuwe tokens horen dáár, nooit in constants/colors.ts (doorgeefluik) of index.css.
- **F6 is afgerond (10-08-2026) en donker staat AAN** (`DONKER_ACTIEF = true`): app volgt de systeeminstelling. Bewuste letterlijke-kleur-uitzonderingen: plattegrond/PDF-renderkleuren (web-sync!), opname-typelegenda, toolbox-categoriekleuren, confetti, handtekening-inkt, radiaalmenu-verloop, shadow-#000.
- Op solide `c.success`/`c.warning`-vlakken NOOIT `c.primaryForeground` (wit haalt geen AA op die middentinten, vooral donker): gebruik `c.successForeground`/`c.warningForeground` (donkere inkt, in beide paletten). Logo-vlakken (menu/login/vergrendeld) altijd `kleuren.light.card` — het beeldmerk heeft donkere tekst, ook in donker.
- Donker-schermafdrukken: `DONKER=1` bij scripts/src/vorm01-schermafdrukken.ts (Playwright colorScheme, map docs/metingen/vorm01/donker).
- Donker: knop-primair = #D93509 en destructief = #D33036 (verdiept, AA ≥4,5:1 met wit); merkkleur #F23B0D haalt met wit maar 3,88:1 en blijft alleen accent (`tint` #FF7A52). Contrastbewijs: scripts/src/vorm01-contrast.ts.
- Webafleiding (firevault injecteerOntwerpTokens) dekt bewust alleen merk- en bewegingstokens (primary/destructive/ring/radius/duren); oppervlaktekleuren blijven web-eigen in index.css — gelijktrekken zou de webstijl stilzwijgend wijzigen.
- Bouwstenen in monteur-app components/ui.tsx (15 stuks, o.a. Kaart/Rij/Statusmerk/Blad/Ladenstaat/Bedragregel + tekstStijl()): géén letterlijke kleur/maat/duur erin; statussen tonen via Statusmerk (bolletje + neutrale chip, flexShrink:0 — chip nooit platdrukken) omdat statuskleuren als tekst op licht geen AA halen. Secundaire regels via Onderregel (2 regels, nooit mid-woord afkappen); rauwe enumwaarden via labelmap ?? netteWaarde(). Beweging altijd achter useReducedMotion.
- Schermen met een `!token`-redirect: guard hoort in een wrapper-component boven alle hooks én achter `bezigLaden` uit useAuth — anders (a) crasht de hook-volgorde zodra het token alsnog laadt en (b) verliezen deep-links de race met async token-herstel (eindigen op /login→/menu).
- Lege staten houden het merkaccent (icoon c.primary op c.accent-cirkel) — René keurde grijs-op-grijs expliciet af; alleen Statusmerk is bewust neutraal (AA). Bewijs-schermafdrukken altijd met gevulde testdata (scripts/src/vorm01-testdata.ts, prefix VORM01-, MODUS=weg ruimt op).
- Vóór/ná-schermafdrukken: scripts/src/vorm01-schermafdrukken.ts (deep-links, MODUS=na); page.addInitScript als string doorgeven, niet als callback (Node-typecheck kent window niet).
- Token-guard-regel geldt voor élk token-bewaakt scherm: eerst `bezigLaden` afwachten, dan pas op `!token` redirecten — anders verliest een koude deep-link de herstel-race en eindigt de gebruiker stil op /menu.
