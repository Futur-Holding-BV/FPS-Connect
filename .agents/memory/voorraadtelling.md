---
name: Voorraadtelling (bevroren telling)
description: Duurzame invarianten van de magazijn-voorraadtelling
---

# Voorraadtelling — invarianten

- Een vastgestelde telling is een bevroren feit: lezen mag daarna UITSLUITEND uit de bevroren kolommen, nooit terugvallen op live voorraad of actuele prijzen. Latere prijs-/voorraadwijzigingen mogen de telling niet raken.
- ÉLKE mutatie op telling of regels draait in een tx die eerst de telling FOR UPDATE vergrendelt en de status pas ná de lock hercheckt; vaststellen vergrendelt ook de kindrijen. Zonder dit passeert een gelijktijdige mutatie de open-check en schrijft/wist ná het bevriezen (tweemaal review-afwijzing).
- Vaststellen moet ook serialiseren met géwone voorraadmutaties: één gedeeld serialisatieprimitief (artikelrecord FOR UPDATE vóór lezen/beslissen/schrijven) in ÁLLE voorraadwijzigende paden — niet alleen de centrale helper; routes met eigen read-compute-write (verplaatsing, scan, picklijst, reservering) moeten het ook nemen (derde en vierde review-afwijzing).
- Grondslagprijs onbekend = fail-closed: regel telt niet mee in geldbedragen, met expliciete teller richting de gebruiker.
- Geld en aantallen exact (numeric), nooit float; datumvelden als échte kalenderdatum valideren (regex alleen is onvoldoende, 30 februari moet 422 geven).
- Camera-telling (fase 2) bouwt op het bestaande regel-upsert-endpoint.

**Why:** de boekhouder eist een navertelbare, onveranderlijke onderbouwing; elk gat in de serialisatie maakt bevroren stand, correctieboeking en werkelijke voorraad onderling inconsistent.
- Telling-geldrekenwerk nooit met IEEE-754 floats + Math.round: alle prijs×aantal/verschil/totaal via de calculatie-rekenkern in centen (half-weg-van-nul), anders halve-centfouten bevroren in de audituitvoer (vijfde review-les).

**Camera-telling:** bewijs (foto+vak) hoort als bevroren snapshot op de regel, nooit via FK naar het (verwijderbare) vak; AI-voorstellen zijn precies één keer beslisbaar en blokkeren vaststellen zolang er één open staat. Server-side objectpaden alleen accepteren via een eigen, éénmalige upload-claim gebonden aan entiteit+aanvrager — nooit een client-aangeleverd pad downloaden (review-afwijzing).
