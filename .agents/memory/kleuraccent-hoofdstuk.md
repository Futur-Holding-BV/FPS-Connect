---
name: KLEURACCENT_01 hoofdstukaccenten
description: App-brede hoofdstukkleur-accenten in firevault via CSS op [data-hoofdstuk]
---

Hoofdstukkleur in het werkscherm zit volledig in index.css, gescoped op `[data-hoofdstuk]` (gezet door beheerder-layout, tokens uit @workspace/ontwerp): actieve tab-onderstreping, kaartrand-tint (`--hoofdstuk-rand` = color-mix 35% met --border), kaartkop-svg's, toggle-actiefstaat (`--hoofdstuk-vlak` 12%).

**Regels/valkuilen:**
- Kaartrand- en svg-regels MOETEN in `@layer base` staan: Tailwind v4-utilities zitten in `@layer utilities`; ongelayerde CSS wint van álle utilities ongeacht specificiteit (`:where()` helpt dus NIET). Semantische kleuren (border-amber-200, text-destructive) winnen alleen dankzij de layer.
- Tab- en toggle-regels staan bewust ongelayerd (moeten de default primary/accent-utility juist verslaan).
- Alles achter `@supports (color: color-mix(...))`; kale color-mix zonder guard geeft op oude browsers geen nette fallback (custom-property fallbackregels werken niet declaratie-voor-declaratie).
- CSS-haken: `data-kaart`/`data-kaart-titel` op ui/card.tsx; `data-sectiekop` is opt-in voor losse sectiekoppen.
- Nooit hoofdstukkleur als tekst op verzadigd vlak (AA); primaire actieknoppen en semantiek onaangetast.
- Bekend los defect: gebouwpagina-kaartkoppen zijn in donker schema te dof (bestond al vóór KLEURACCENT_01).
- Donker-schema-screenshots: colorScheme:"dark" alléén is niet genoeg — app leest localStorage `fps.weergave`; forceer via addInitScript `{thema:"donker"}`.
