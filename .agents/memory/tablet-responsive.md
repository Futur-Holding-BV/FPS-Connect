---
name: Tablet-responsive monteur-app
description: Hoe de Expo monteur-app responsive is gemaakt voor tablet + de RN FlatList grid-valkuilen.
---

# Tablet-ondersteuning monteur-app

De Expo monteur-app (`artifacts/monteur-app`) is tablet-geschikt via één hook: `hooks/useResponsive.ts` (op `useWindowDimensions`). Hij levert `isTablet` (>=768), `kolommen` (1 telefoon / 2 tablet / 3 vanaf 1280) en max-breedtes (`inhoudMaxBreedte` cap 1200 vanaf 1280, `formMaxBreedte` 600, `leesMaxBreedte` 760; allemaal `undefined` op telefoon → no-op).

Patroon overal: inhoud krijgt `width:"100%" + maxWidth + alignSelf:"center"`. Donkere full-bleed headers houden hun volle breedte; alleen hun *inner* inhoud wordt in een gecentreerde maxWidth-View gewikkeld.

## RN FlatList grid-valkuilen (durable lesson)
**Why:** bij omzetten van 1-koloms lijst naar responsive grid lopen mensen tegen RN-invarianten en lelijke last-row-stretch aan.
**How to apply:** bij elke FlatList die van `numColumns` wisselt:
- Geef `key={`kol-${kolommen}`}` — RN remount de lijst niet automatisch als `numColumns` verandert (bv. bij rotatie), zonder nieuwe key crasht/verspringt het.
- `columnWrapperStyle` moet `undefined` zijn (niet `{}`) wanneer `kolommen === 1`, anders schendt het de RN-invariant.
- Zet een **expliciete** `width` op het item (niet `flex:1`), anders rekt een eenzaam item op de laatste rij over de volle breedte uit.
- Itembreedte = `(min(breedte, inhoudMaxBreedte ?? breedte) - 2*padding - gap*(kolommen-1)) / kolommen`; padding moet exact `contentContainerStyle.padding` matchen en gap exact `columnWrapperStyle.gap`, anders overflow.

Breekpunt is breedte-gebaseerd, dus grote telefoons in landscape (~930pt) krijgen ook de 2-koloms tabletlayout (gewenst, geen bug).
