---
name: Gebouw PDF/print-export
description: Standalone printroute voor gebouwen — render-koppeling met hero en auto-print readiness-valkuilen.
---

# Gebouw PDF/print-export (firevault web)

Standalone printroute `/gebouwen/:id/print` staat in App.tsx binnen de authenticated `WouterRouter` als eerste `<Route>` in een `<Switch>`, vóór de `<Route>` die Portalen+OndersteuningWidget+HeatmapTracker rendert. Zo geen sidebar-chrome; inhoud pagineert natuurlijk. Niet per portal toevoegen.

## Plattegrond-render moet exact gelijk zijn aan hero
De printpagina dupliceert bewust de plattegrond-render uit `gebouw-plattegrond-hero.tsx`: pdf.js `getDocument({url:`/api/storage${plattegrond_url}`})` → `getViewport({scale:2})` → canvas → toDataURL → `<image>` in SVG.
**Why:** spotcoördinaten zijn opgeslagen op pdf.js scale:2 (web+mobiel+print moeten allemaal scale:2 gebruiken, anders staan markers verkeerd).
**How to apply:** wijzig je TYPEN/STATUSKLEUREN/SpotIcoon/markerPosities of de scale in de hero, pas dan ook print.tsx aan (of overweeg extractie naar gedeelde module).

## Paginastructuur (4 aparte divs, niet één prt-doc)
Lay-out is opgesplitst in: `prt-voorblad` (pagina 1) + drie `prt-pagina`-divs (pagina's 2/3/4+).
- `prt-voorblad`: `@media print { break-after: page; min-height: 0; }` + screen: shadow + min-height: 860px.
- `prt-pagina`: `@media print { break-before: page; max-width: none; padding: 0; }`.
**Why:** één `.prt-doc`-wrapper forceert geen paginabreuk tussen het voorblad en de volgende pagina.
Elke sectie heeft een eigen mini-kop (logo + projectnaam + sectienaam) voor context op elke afgedrukte pagina.

## Auto-print readiness — twee valkuilen (fail bij review)
1. `allesGereed` moet ALLE secties-queries meenemen (partijen, toewijzingen, onderhoud, inspecties via `isLoading`), niet alleen gebouw + floor-counter. Secties renderen conditioneel op `length > 0`, dus te vroeg `window.print()` laat verplichte secties weg.
2. Per-verdieping readiness mag NIET afhangen van `pdfBeeld !== null` (deadlock bij kapotte plattegrond-URL: load faalt → blijft null → onGereed vuurt nooit → print permanent geblokkeerd). Gebruik een aparte `beeldKlaar`-state die op `true` gaat bij success ÉN bij catch ÉN als er geen URL is.
3. `useGetGebouwEmailSamenvatting` mag NIET in `allesGereed` — geeft 404 als er geen samenvatting is en react-query default-retries vertragen dan de auto-print. Gate alleen tekeningen+emails; samenvatting puur best-effort (projectomschrijving valt terug op `gebouw.omschrijving`).

## break-before:page hoort op de hele verdieping, niet op het binnen-blok
Zet `break-before: page` op `.prt-verdieping` (de hele bouwlaag-wrapper met h3-titel + overzicht + spotdetails), NIET op het inner `.prt-overzicht-blok`.
**Why:** met de breuk op het binnen-blok blijft de `<h3>` bouwlaag-titel verweesd onderaan de vorige pagina achter en ontstaat een bijna-lege sectiepagina.
**How to apply:** elke nieuwe per-pagina-breuk in de verdiepingenloop op het buitenste blok plaatsen dat de titel + content samen omvat.
