---
name: "Blauwe lijn" meldingen = blauw-grijs (hue 220) of browser-chrome, geen echte blue-CSS
description: Hoe "blauwe lijn/element"-meldingen in firevault te interpreteren; theme heeft geen echte blue
---

In firevault is er GEEN echte blauwe merkkleur. De primaire/ring-kleur is oranje-rood
(`--ring`/`--primary` = HSL 12 90% 50%, #F23B0D). Wat gebruikers als "blauw" melden is
bijna altijd één van twee dingen:

1. **Blauw-grijze theme-tokens (hue 220).** `--sidebar`, `--sidebar-accent`,
   `--sidebar-border` gebruiken HSL hue 220 (donker blauw-grijs). De actieve menu-
   highlight (`bg-sidebar-accent`) wordt door gebruikers de "blauwe menubalk" genoemd.
   Een gemelde "blauwe lijn/balk" is dus meestal een blauw-grijs element, niet een
   `blue-500`/`#3b82f6`-achtige kleur.
2. **Browser-chrome (scrollbar/outline).** Een dunne verticale "blauwe lijn" die op
   hover oppopt aan de rechterrand van de sidebar, op elke pagina op dezelfde plek,
   en van een bepaald menu-item tot onderaan loopt, is de **overlay-scrollbar** van
   `SidebarContent` (heeft `overflow-auto`, `data-sidebar="content"`). Die zit precies
   op de grens sidebar/content en lijkt het hoofdscherm in te lopen.

**Waarom:** zoeken naar letterlijke blauwe CSS (border/outline/pseudo-element) levert
niets op en kost veel tijd — de theme bevat geen blue. Begin bij theme-hue-220 en
browser-chrome.

**How to apply:** bij een "blauwe lijn/element"-melding eerst checken of het een
hue-220 token of browser-scrollbar/outline is, vóór je naar een hover/focus-border in
componenten gaat zoeken. De sidebar-scrollbar is verborgen via een regel op
`[data-sidebar="content"]` in `index.css` (scrollbar-width:none + ::-webkit-scrollbar
display:none), wheel/trackpad-scroll blijft werken.
