---
name: Pre-push opmaakschade-poort
description: Push blokkeert bij >300 regels netto verschil; vooraf marker, achteraf alleen een exact beoordeelde vingerafdruk.
---
De pre-push hook (.githooks/pre-push) draait 3 poorten: testmarker-check, opmaakschade-check (blokkeert bij >300 regels groei/krimp per bestand per commit) en volledige typecheck.

**Why:** merge-/formatterschade (rapporten.ts 15 aug 2026) en sabotage-markers belandden eerder op main.

**How to apply:** kondig een bewust grote wijziging vooraf aan met `[grote-wijziging]`. Kan een reeds door het taakplatform gemaakte oudere commit niet veilig worden herschreven, dan mag die pas ná inhoudelijke review in het goedkeuringsregister: volledige commit-SHA + exact pad + numstat + resulterende Git-blob. Geen generieke overslaan-vlag en nooit een range/patroon; elke afwijking moet opnieuw blokkeren. Een rode typecheck mag nooit door.
