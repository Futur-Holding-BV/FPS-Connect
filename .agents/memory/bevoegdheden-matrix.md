---
name: Bevoegdheden-matrix architectuur
description: Hoe het rechten-systeem gebouwd is — jsonb-matrix, requireBevoegdheid middleware, profielen-tabel, frontend hook.
---

# Bevoegdheden-matrix

## Architectuur

- DB: `gebruikers.bevoegdheden jsonb NOT NULL DEFAULT '{}'` + `profielen(id, naam, bevoegdheden jsonb, systeem bool)`
- Backend: `requireBevoegdheid(module, minNiveau)` in `artifacts/api-server/src/middlewares/auth.ts`
  - hoofdbeheerder: altijd bypass
  - klant: vaste matrix (geen DB-lookup)
  - rol "gebruiker": DB-matrix
  - Legacy rollen (beheerder/monteur/controleur): fallback via `lib/permissies/src/index.ts → legacyBevoegdheden(rol)`
- Modules: gebouwen, voorzieningen, inspecties, onderhoud, rapportages, bibliotheek, gebruikers, crm, abonnementen, systeem
- Niveaus: 0=geen, 1=lezen, 2=wijzigen, 3=aanmaken, 4=volledig

## Frontend

- Hook: `artifacts/firevault/src/hooks/use-bevoegdheid.ts` → `useBevoegdheid(module)` → huidige bevoegdheidsniveau
- Context: `rol-context.tsx` bevat `bevoegdheden: Record<string,number>` naast `rol`
- Portal: `PermissiePortal` (App.tsx) voor rol "gebruiker"; hoofdbeheerder-bypass en klant-block ingebakken in de hook
- Menu: `beheerder-layout.tsx` filtert nav-items via `useBevoegdheid`

## Gebruikers-pagina admin UI

- `BevoegdhedenEditor` component in `gebruikers/index.tsx`: preset-picker via `useListProfielen` + per-module dropdown 0-4
- Toon alleen voor niet-klant, niet-hoofdbeheerder rollen

## Profielen-CRUD (presets)

- `routes/profielen.ts`: GET = requireBevoegdheid("gebruikers",1); POST/PATCH/DELETE = requireRol("hoofdbeheerder")
- DELETE blokkeert systeem=true (403); naam is unique → 409 bij conflict
- Beheer-UI: `pages/beheer/profielen.tsx`, route `/beheer/profielen` (beide beheer-portalen in App.tsx), nav-item alleen voor echteRol==="hoofdbeheerder"
- Preset-picker (gebruikers-pagina) deelt `listProfielen` query → invalideer na mutatie zodat nieuwe preset direct verschijnt

## Gotchas

- Gate UI/permissies NOOIT op rol-strings. `AuthGebruikerRol` kent runtime alleen `hoofdbeheerder | gebruiker | klant`; "beheerder"/"monteur"/"controleur" zijn legacy en matchen nooit (`gebruiker.rol === "beheerder"` is altijd false, vandaar de terugkerende TS2367 Rol-drift). Gebruik `useBevoegdheid().heeftNiveau(module, niveau)` (web) en `requireBevoegdheid(module, niveau)` (server). Niveaus: 3=aanmaken/wijzigen, 4=volledig beheer. Wil je de aanmaker (monteur=3) van een bevestig-/goedkeuractie uitsluiten, eis dan niveau 4.
- `GebruikerInput` (POST) vereist ook `bevoegdheden` in de OpenAPI spec — niet alleen `GebruikerUpdate` (PATCH)
- Na codegen: HMR faalt als Vite de gegenereerde bestanden tijdelijk kwijt is → restart firevault workflow
- Rol "viewer" is uitgebannen: default DB is nu "gebruiker"; viewer-fallbacks vervangen door "gebruiker"
- ROLLEN array heeft nu 6 entries → `grid-cols-3 xl:grid-cols-6` in gebruikers-pagina

**Why:** Matrix is schaalbaarder dan flat roles; jsonb-kolom + profielen-tabel zonder schema-explosie.
**How to apply:** Gebruik `requireBevoegdheid` voor alle nieuwe routes. Voeg nieuwe modules toe in `lib/permissies/src/index.ts` MODULES-array + legacyBevoegdheden fallback.
