---
name: Blink dragstart in scrollbare sidebar
description: Native HTML5 drag-and-drop start nooit voor elementen in de scrollbare SidebarContent; gebruik pointer-gebaseerd slepen.
---

**Regel:** gebruik voor versleepbare elementen binnen de firevault-sidebar (of andere scrollbare containers met vergelijkbare layout) geen native HTML5 drag-and-drop (`draggable` + `dragstart`), maar pointer-gebaseerd slepen (mousedown/mousemove/mouseup met een bewegingsdrempel).

**Why:** empirisch vastgesteld (juli 2026, 8 diagnoseruns): Chromium/Blink vuurt voor in-flow elementen binnen de scrollbare `SidebarContent` nooit `dragstart` af — ook niet met `overflow: visible` inline. Probes met `position: fixed` of buiten de content werkten wél; het strippen van layout-klassen van de hele sidebar-keten liet dragstarts ook vuren. Dit is een browser-quirk die echte gebruikers raakt, geen testartefact.

**How to apply:** patroon staat in `herschikbaar-hoofdstuk.tsx`: mousedown met 4px-drempel, doel bepalen via `elementFromPoint` + `closest('[data-hoofdstuk-sleutel]')`, doel-highlight via CustomEvent op window, Escape annuleert, randscroll bij de sidebar-randen, body-cursor `grabbing`.

**E2e-valkuil:** rauwe `page.mouse`-coördinaten checken niet op overlays. Met alle hoofdstukken uitgeklapt ligt een lager hoofdstuk achter de vaste onderbalk (Uitloggen/NIEUWS-ticker) — de klik landt dan op die balk. Fix: doelhoofdstuk eerst inklappen zodat bron en doel bovenin staan, en `grip.hover()` gebruiken (ingebouwde hit-target-check) vóór `mouse.down()`.
