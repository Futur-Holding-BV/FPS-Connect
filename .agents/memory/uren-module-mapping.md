---
name: Uren isManager module-mapping
description: Hoe de isManager-check in uren.ts mapt op de PermissieEngine; "uren" bestaat niet als module-id.
---

**Regel:** In `uren.ts` bestond een `isManager`-patroon dat `bevoegdheden.uren >= N || rol === "hoofdbeheerder"` controleerde. Het module-id `"uren"` bestaat niet in MODULE_IDS, dus `bevoegdheden.uren` was altijd 0 — de check was effectief gelijk aan `rol === "hoofdbeheerder"`.

**Correcte mapping na migratie:**
- `isManager` (niveau 1 = andermans uren lezen) → `req.permissies!.heeftModuleRecht("personeel", 1)`
- `isManager` (niveau 2 = goedkeuren/vergrendelen/andermans uren aanpassen) → `req.permissies!.heeftModuleRecht("personeel", 2)`

**Why:** `personeel` is het dichtstbijzijnde semantische module-id voor urenbeheer (HRM/tijdregistratie). Niveau 1 = inzage in andermans uren; niveau 2 = muteren/goedkeuren.

**How to apply:** Altijd `heeftModuleRecht("personeel", N)` gebruiken in uren.ts — NOOIT `bevoegdheden.uren` opzoeken of een apart module-id `"uren"` aanmaken.
