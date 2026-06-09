---
name: SnagStream classificatie
description: Driedelige type+label classificatie voor voorzieningen; fabrikant-sectie als UI-hulpmiddel.
---

## Datamodel
- `voorziening_types` tabel: PK = `code` (bijv. "1.20"), categorie afgeleid van hoofdnummer, actief=false voor "(NIET GEBRUIKEN!)"-types
- `labels` tabel: heeft `fabrikant` en `testnorm` **direct op de tabel** (niet alleen via testrapport_id) — dit verschilde van de initiële OpenAPI-spec die alleen `testrapport_id` had
- `voorziening_labels` join-tabel: voorzieningId + labelId, unieke combinatie

**Why:** labels moeten fabrikant/testnorm kunnen bevatten zonder per se een volledig testrapport te koppelen.

## Type-kleuren
- `constants/spots.ts` exporteert `CATEGORIE_KLEUREN` (hoofdcijfer "1"–"9" → kleur) en `typeKleur(code)` (fallback voor legacy strings)
- `typeInfo(t)` gebruikt `typeKleur` als fallback voor numerieke codes

## Web-componenten
- `applicatie-picker.tsx`: Command+Popover, doorzoekbaar, gegroepeerd per categorie
- `toepassing-multi-select.tsx`: checkboxes gefilterd op type_code; "Nieuw label" inline voor beheerder
- `beheer/toepassingen.tsx`: beheerder-only CRUD voor labelcatalogus
- `fabrikant-sectie.tsx`: **UI-only state** (niet gepersisteerd); externe links via `window.open`

## Mobiele componenten
- `ApplicatieKiezer.tsx`: pageSheet Modal met zoekbalk en categorie-headers
- `ToepassingKiezer.tsx`: togglebare checkboxes, toont `l.testrapport?.fabrikant` en `l.testrapport?.norm`
- `FabrikantSectie.tsx`: chip-selector + `Linking.openURL`, disclaimer altijd zichtbaar

## Fabrikantlinks (statisch, UI-only)
- Mulcol: https://www.mulcol.com/selector
- Hilti: https://firestop.hilti.com/
- Promat: geen directe selectorlink
- Rockwool: https://www.rockwool.com/nl/producten/categorieen/fire-protection/
- Nullifire: https://www.nullifire.com/nl-nl/
- Flamro: https://flamro.nl/product-selector
- Fabricantskeuze is optioneel, niet opgeslagen, louter navigatie-hulpmiddel

## Plattegrond-integratie (mobiel)
- `LEEG.type = ""` (niet meer "branddeur" als default)
- `label_ids` als losse `useState<number[]>` naast `form`-state; gereset bij type-wijziging
- `type || "overig"` als fallback bij bewaar()
