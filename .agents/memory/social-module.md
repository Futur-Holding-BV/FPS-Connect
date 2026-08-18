---
name: Social-mediamodule (SOCIAL_01)
description: Duurzame invarianten van de social-mediamodule (kanaaleisen, publicatiemotor, koppelingen)
---
- **Kanaaleisen zijn server-side de enige waarheid.** Plannen valideert álle kanaalrijen fail-closed → 422 met redenenlijst; de frontend toont dezelfde eisen alleen ter voorlichting. Nooit client-side voorvalideren als vervanging.
- **Publicatiemotor-invarianten** (na architect-review): claim = lease-status `bezig` (verlopen leases hersteld), nooit alleen een tellerverhoging; elke tick reconcileert terminale kanaalrijen zonder werkbak-taak (crash-veilig "nooit stilzwijgend niet geplaatst"); berichtuitkomst is eerlijk — `geplaatst` alleen als álle kanalen slaagden, anders `deels_geplaatst`/`mislukt`.
- **Fase 3 ontbreekt nog:** kanaal-adapters zijn fail-closed stubs; echte OAuth + cijfers vergen client-id/secret per kanaal als secrets (nog opvragen bij de beheerder). Koppelingen-API geeft nooit tokens terug.
- **Rechten (eigen module):** social 3 = bekijken/opstellen/klaarzetten, social 4 = plannen/terughalen + koppelingen. Losgekoppeld van crm (aug 2026, migratie 0070). Merk (merkenkast+beeldbank) is eveneens eigen module: merk 1 = lezen/downloaden, merk 3 = uploaden.
- **Why:** spec SOCIAL_01 + review eisen race-veilige, crash-veilige, eerlijke publicatieafhandeling; stille fallbacks worden afgekeurd.
- **How to apply:** nieuw kanaal/eis alleen via de centrale eisen-tabel + adapter-registry; bewijs via `scripts/src/verificatie-social01.ts` (npx tsx, wacht ~60s op planner-tick).
