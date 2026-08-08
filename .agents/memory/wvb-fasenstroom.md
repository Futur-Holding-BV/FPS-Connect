---
name: WVB 5-fasenstroom opdrachtpagina
description: Hoe de opdracht-detailpagina fasen rendert en hoe het WVB-divergentiesignaal race-safe is
---

**Regels:**
- Opdracht-detail (firevault) heeft 5 fasen (voorbereiding/inkoop/planning/uitvoering/oplevering). Oude `?tab=`-namen worden via `FASE_ALIAS` vertaald — nieuwe deep-links moeten fasenamen of een alias gebruiken.
- Radix-invariant: exact één `TabsContent` per fase-value. Extra secties (AI-analyse, PIM-regisseur, urenplanning) renderen als `{activeTab === "fase" && <div id=...>}`-blokken, niet als tweede TabsContent. Bij nieuwe secties dit patroon volgen.
- Divergentiesignaal (`wvb_planning_divergentie:opdracht:<id>`) wordt bij vaststellen van inkoop-/uitvoeringsplanning berekend; dubbele open compliance-signalen zijn DB-onmogelijk via partiële unieke index op `dedup_sleutel WHERE status='open'` (migratie 0014) + `onConflictDoNothing`. Elke nieuwe signaal-producent moet dat patroon gebruiken.
- Regie-tarieven hebben `tariefsoort` uur|dagdeel; dagdeeltarieven NOOIT meenemen in uur-gebaseerde middeling/kostprijs (dashboard filtert ze uit).

**Why:** architect-review vond dubbele tabpanels en een select-then-insert-race; beide zijn structureel dichtgezet.
**How to apply:** bij uitbreiding van de opdrachtpagina, signaal-producenten of regie-kostprijslogica.
