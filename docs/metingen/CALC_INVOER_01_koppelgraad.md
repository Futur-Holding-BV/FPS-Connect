# CALC_INVOER_01 — koppelgraad (nulmeting)

Dit is een **gecontroleerde nulmeting** uit het bewijsscript
`scripts/src/bewijs-calcinvoer01.ts` (§8.9). Het is nadrukkelijk **niet** de
echte proefperiode-meting: de invoer is een vast, gecontroleerd testscenario met
een kleine testbibliotheek. De echte meting over een proefperiode met de eigen
artikelen- en normtijdenbibliotheek volgt uit taak §4 van de opdracht.

| Datum | Plakhandelingen | Herkende producten | Koppelgraad (artikel+normtijd) | Vaakst ongekoppeld |
|---|---|---|---|---|
| 2026-08-09 | 10 | 10 | 70% (7/10) | Framax paneelklem X99 (1×) |

## Verdeling over de vier koppeluitkomsten (§3.3)

| Uitkomst | Aantal |
|---|---|
| Artikel én normtijd | 7 |
| Alleen artikel (arbeid ontbreekt) | 2 |
| Alleen normtijd (materiaal ontbreekt) | 0 |
| Geen van beide (ongekoppeld) | 1 |

## Duiding

Blijkt de koppelgraad in de echte proefperiode laag, dan is de oplossing niet
betere herkenning maar een **vollere artikelen- en normtijdenbibliotheek**
(§4, `ENK_IMPORT_01`). In deze nulmeting is de bibliotheek bewust klein en
bevat zij één product (brandmanchet) met artikel maar zonder normtijd, plus een
bewust onbekend product — daarom is de koppelgraad hier lager dan bij een
gevulde bibliotheek te verwachten valt.
