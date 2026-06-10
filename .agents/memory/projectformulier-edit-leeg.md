---
name: Projectformulier edit-velden leeg / kan niet opslaan
description: Waarom de project-edit lege velden toont en niet opslaat — meestal infra/stale bundle, geen UI-bug
---

Symptoom (gebruikersmelding): in `gebouw-projectformulier` op "Bewerken" klikken → "alleen de metrics van het gebouw" verschijnen, "kan niks aanpassen", "kan niet opslaan".

Oorzaak (niet-evident): de 8 "Opdracht en inhoud" textareas vullen zich uit `form`, dat ALLEEN via een sync-`useEffect` uit de `samenvatting`-query komt; dat effect `return`t vroeg bij `!samenvatting`. De Gebouwafmetingen-inputs komen daarentegen uit de `gebouw`-prop (vaak nog gecached). Als de api-server down/traag is of de samenvatting-query faalt, blijft `form` leeg terwijl de gebouw-metrics wél tonen → lijkt een UI-bug maar is het niet. Opslaan faalt dan ook want de PATCH komt niet door.

**Why:** een gestopte/instabiele api-server workflow geeft exact dit beeld; de edit/save-code (textareas met value+onChange, `bewaar()`, beide PATCH-handlers) is geverifieerd correct. Renamen van componenten tijdens een redesign (bv. PartijRij→PartijBlok) laat bovendien een kapotte HMR-bundle achter ("PartijRij is not defined") tot een volledige reload.

**How to apply:** bij "kan niet bewerken/opslaan in projectformulier" EERST controleren of de `api-server`- én `firevault`-workflows draaien (restart_workflow) en de browser hard-refreshen, vóór je op codejacht gaat.
