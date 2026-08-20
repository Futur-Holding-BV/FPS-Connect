---
name: Stale gegenereerde exports
description: Nieuwe API-exports kunnen na codegeneratie tijdelijk onzichtbaar blijven door onafhankelijke build- en dev-servercaches.
---

# Stale gegenereerde exports

Een ontbrekende-exportmelding na codegeneratie bewijst niet dat de export in de
bron ontbreekt. Composite buildmetadata en de modulegraph van een reeds draaiende
dev-server zijn twee onafhankelijke caches en kunnen elk nog de oude API-vorm zien.

**Why:** gegenereerde broncode wordt gedeeld, maar afgeleide buildmetadata en een
geladen dev-servergraph zijn lokaal en incrementeel. Daardoor kan statische
validatie groen zijn terwijl de browser nog een oude exportset uitvoert.

**How to apply:** bevestig eerst de actuele gegenereerde bron. Is de export daar
aanwezig, ververs dan de afgeleide buildlaag en bij een runtimefout ook de
dev-serverlaag; wijzig niet op goed geluk de applicatie-import.
