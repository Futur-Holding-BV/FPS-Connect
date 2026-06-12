---
name: Dossier-bevriezing server-side
description: Een definitief/gearchiveerd dossier bevriezen moet op ALLE mutatie-endpoints van de kindresource worden afgedwongen, niet alleen op create.
---

Wanneer een dossier definitief (of gearchiveerd) is, moet die bevriezing op
elk mutatie-endpoint van de kindresource (`dossier-documenten`) een 409 teruggeven:
POST (toevoegen), PATCH (wijzigen) én DELETE (verwijderen). De parent-status
ophalen via `dossierId` en daarop guarden.

**Why:** Alleen de POST-handler guarden (of alleen de UI-knoppen verbergen) laat
de freeze-invariant lekken: een client kan nog steeds rechtstreeks een PATCH/DELETE
op een bestaand dossierdocument doen en zo een juridisch bevroren opleverdossier
muteren. UI-gating is geen access control.

**How to apply:** Elke nieuwe of bestaande mutatie-route op een resource die onder
een bevriesbaar/lockbaar parent-object hangt, moet de parent-status server-side
checken vóór de mutatie. Hetzelfde patroon als bij voorziening-archief
(terugplaatsen = server-side afdwingen, niet alleen UI).

Gerelateerd: `/documenten/:id/download` redirect naar `/api/storage${pdfUrl}`
(objectPath wordt alleen via /api/storage geserveerd); absolute http(s)-URL's
ongewijzigd doorsturen. Goedkeuringsflow is een statusmachine: goedkeuren/afkeuren
kan alleen vanuit `ter_goedkeuring` (anders 409).
