---
name: Twee-traps sidebar & hoofdstukkleuren (NAV_01)
description: Navigatiepatroon Connect-sidebar, hoofdstukkleur-tokens en het gedeelde GoedkeuringLabel
---

- **Eén menumechanisme.** `TweeTrapsHoofdstuk` is een drop-in óm `InklapbaarHoofdstuk` heen (zelfde props). Desktop = knop + portal-paneel; mobiel (<768px) én icon-collapsed sidebar vallen terug op `InklapbaarHoofdstuk`. Sleep-logica gedeeld via `SleepGreep`/`maakStartSleep` in herschikbaar-hoofdstuk.tsx — nooit een tweede sleepimplementatie maken.
  **Why:** NAV_01 verbiedt een tweede menumechanisme; eerdere review-afwijzingen op dubbele mechanismen.
- **Hoofdstukkleuren = tokens.** `hoofdstukKleuren` in `@workspace/ontwerp` (11 stuks, `opLicht`/`opDonker`, alle 22 combinaties AA ≥4,5:1 — docs/metingen/NAV_01_contrast.md). Web leest CSS-vars `--hoofdstuk-<sleutel>` (schema-afhankelijk) en `--hoofdstuk-<sleutel>-sidebar` (altijd opDonker, want de sidebar is óók in licht schema donker). Kleur = merkteken (stip/kop/accentlijn), nooit achtergrond met tekst erop, nooit losse hex in de layout.
- **Accentlijn:** `hoofdstukVanRoute()` (langste prefix wint) in firevault/src/lib; nieuwe menuroutes daar toevoegen. `/algemene-inkoop` is bewust een losse post → geen accentlijn.
- **GoedkeuringLabel:** object_type voor het opdracht-akkoord in de goedkeuringsmotor is `opdracht_akkoord`, NIET `opdracht` (query op "opdracht" geeft stil null). Endpoint vereist goedkeuring:1 → altijd `retry: false` zetten; 403 = label gewoon afwezig. Generated hooks eisen expliciete queryKey bij extra query-opties.
- **Paneel-a11y:** portal-paneel is een `<nav aria-label>`, geen `role="menu"` (menuitems ontbreken anders). Escape globaal afvangen zolang open (ook na Tab het paneel uit).
