---
name: Plattegrond renderers in sync houden
description: Er zijn meerdere onafhankelijke plattegrond-renderers (web editor, web read-only hero, mobiele WebView) die visueel gelijk moeten blijven.
---

De plattegrond (PDF + spots + scheidingen) wordt op meerdere plekken onafhankelijk
gerenderd, telkens in dezelfde pdf.js scale:2 coordinatenruimte:

- Web editor (bewerken) en web read-only hero (`gebouw-plattegrond-hero.tsx`) — React/SVG.
- Mobiele monteur-app: `PdfPlattegrond.tsx` rendert PDF + overlays binnen een WebView
  via met-de-hand-geschreven JS dat HTML/SVG-strings bouwt (geen React).

**Regel:** een visuele wijziging aan spots of scheidingen op het web moet ook in de
mobiele WebView-JS worden nagebouwd, anders loopt mobiel achter (bv. scheidingen
ontbraken lang op mobiel terwijl ze op web stonden).

**Why:** de mobiele renderer is een handmatige port van de web-hero, geen gedeelde
component; ze delen alleen het datamodel en de scale:2-aanname, niet de rendercode.

**How to apply:**
- Scheidingen (brand/rook polylijnen + EW-waarde-bolletjes) worden op mobiel
  gepusht via `injectJavaScript`/`window.__setScheidingen` (NIET in de HTML/CFG-memo,
  anders herlaadt de PDF). Spots gaan op dezelfde manier via `__setSpots`.
- DOM-volgorde in `#wrap`: canvas, dan lijnen-laag, dan markers — markers altijd
  bovenop (renderMarkers re-append houdt ze achteraan in DOM).
- Lijnen schalen mee met zoom (geom in scale:2-ruimte); markers gebruiken juist
  `--inv` inverse-scale voor constante grootte. Niet door elkaar halen.
- WebView bouwt HTML als string: valideer/escape alle waarden die uit DB komen
  voordat ze in attributen/markup belanden (kleur tegen hex-regex, coords via
  Number()+isFinite, tekst via esc()). React doet dit gratis; de string-pad niet.
  De bearer-token zit in WebView-JS-scope, dus stored-markup-injectie is reeel.
