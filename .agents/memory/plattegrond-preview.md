---
name: Plattegrond preview patroon
description: Read-only plattegrond hero op detail-pagina — constanten, PDF cleanup, polling, activiteitfilter.
---

## Beslissing
`gebouw-plattegrond-hero.tsx` is zelfstandig: eigen kopie van TYPEN/STATUSKLEUREN/etc. (stabiele domeinconstanten). Importeren uit `plattegrond.tsx` zou die editor-pagina moeten aanpassen, met risico op regressions.

**Why:** plattegrond.tsx is 1506 regels zware editor; export toevoegen is low-risk maar koppelt twee verschillende verantwoordelijkheden. Domain-constanten dupliceren is al precedent (web+mobiel doen het ook).

## pdfjs cleanup
Gebruik `laadTaak.destroy().catch(() => undefined)` in de useEffect cleanup. De originele editor doet dit NIET — maar voor een preview-component dat vaak mount/unmount (tab-wisseling), is het nodig om memory leaks bij grote PDFs te voorkomen.

## Activiteitsfeed polling
Gebruik `setInterval(() => void refetch(), 30000)` + `useEffect`. **Niet** `{ query: { refetchInterval } }` — dat triggert TS2741 (queryKey ontbreekt) net als `enabled`. Zelfde pre-existing constraint.

## Gebouw-filter activiteit
`GET /api/dashboard/recente-activiteit` heeft alleen `limit` parameter, geen `gebouw_id`. Client-side filteren op `a.gebouw_naam === gebouwNaam`. Fetch limit=100 om genoeg data te hebben. Bij zware productie-use kan dit knelpunt worden — dan gebouw_id-filter toevoegen aan OpenAPI/backend.

## Spot-coordinaten
Spots hebben locatie_x/y in de SVG-coördinaatruimte van de editor (CANVAS_W=1200/H=800 voor grid, of pdfDims.w/h voor PDF bij scale:2). De read-only preview gebruikt viewBox="0 0 W H" met preserveAspectRatio="xMidYMid meet" — spots verschijnen automatisch op de juiste relatieve positie.
