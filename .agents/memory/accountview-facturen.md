---
name: AccountView factuurmodule
description: Lessen uit de bouw van de AccountView/factuurverwerking module — permissies, BestandType, api_key patroon.
---

# AccountView factuurmodule

## Nieuwe module-id "financieel"
`lib/permissies/src/index.ts` MODULES-array bevat nu `{ id: "financieel", label: "Financieel & Facturatie" }`.
Gebruik `heeftNiveau("financieel", 1/2)` in frontend/backend guards.
**Why:** bestaande module-IDs zijn runtime-validated via `GELDIGE_MODULES`; een nieuwe string zonder entry in MODULES geeft 403.
**How to apply:** bij elke nieuwe functiemodule: eerst entry in MODULES toevoegen + typecheck:libs draaien vóór routes schrijven.

## BestandType uitbreiding
`artifacts/api-server/src/lib/objectStorage.ts` union is uitgebreid met `"factuur"`.
**Why:** uploadroute voor factuur-PDFs geeft TS2345 als "factuur" niet in de union staat.
**How to apply:** elke nieuwe bestandscategorie (foto/rapport/tekening/bijlage/algemeen/factuur) hier toevoegen.

## api_key nooit teruggegeven
`AccountviewInstellingen` (OpenAPI schema) exposeert de API-sleutel NIET — alleen `api_gebruiker`, `api_endpoint`, etc.
Als proxy voor "key is geconfigureerd" gebruik je `inst?.api_gebruiker` (als iemand een gebruikersnaam heeft ingesteld, heeft hij ook een sleutel ingevoerd).
**Why:** beveiligingseis; api_key staat in de DB maar nooit in GET-response.
**How to apply:** geen `api_key_geconfigureerd` veld — check `api_gebruiker` of toon altijd een leeg wachtwoordveld.

## PRESETS hebben nog geen financieel-niveau
De presets in `lib/permissies/src/index.ts` zijn nog NIET bijgewerkt voor `financieel`.
Hoofdbeheerders/Directie zien de Financieel-sectie pas nadat hun profiel handmatig of via `POST /profielen/synchroniseer-standaard` bijgewerkt is.
**How to apply:** voeg `financieel: 2` toe aan relevante presets in PRESETS en roep synchroniseer-standaard aan.
