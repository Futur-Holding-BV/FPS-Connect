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

## Auto-print readiness — twee valkuilen (fail bij review)
1. `allesGereed` moet ALLE secties-queries meenemen (partijen, toewijzingen, onderhoud, inspecties via `isLoading`), niet alleen gebouw + floor-counter. Secties renderen conditioneel op `length > 0`, dus te vroeg `window.print()` laat verplichte secties weg.
2. Per-verdieping readiness mag NIET afhangen van `pdfBeeld !== null` (deadlock bij kapotte plattegrond-URL: load faalt → blijft null → onGereed vuurt nooit → print permanent geblokkeerd). Gebruik een aparte `beeldKlaar`-state die op `true` gaat bij success ÉN bij catch ÉN als er geen URL is.
