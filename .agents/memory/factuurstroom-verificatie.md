---
name: Factuurstroom pijplijn-verificatie
description: Durable lessen uit het end-to-end bewijs van de mail-naar-factuur-pijplijn
---

**Regel:** externe randen (zoals Graph-HTTP) bewijs je door alléén dat randje injecteerbaar te maken en al het overige als ongewijzigde productiecode te draaien; verificatiescripts moeten invocatie-specifiek opruimen (eigen seeds + geüploade objecten, met absentie-check), nooit brede predicaten zoals een gedeeld mailboxadres.

**Why:** brede cleanup-predicaten kunnen echte data wissen en achtergebleven objecten vervuilen opslag; een gedeeltelijk gemockte pijplijn heeft geen bewijskracht.

**How to apply:** bij elk nieuw pijplijnbewijs: unieke identifiers per run, cleanup in finally op die identifiers, objectopslag-pad terugvertalen naar het genormaliseerde `/objects/`-formaat vóór verwijderen. Let op: de inkoperroute van de factuurstroom matcht in de praktijk niet — inkoopbonnen verwijzen naar de oude leveranciers-tabel terwijl de routering met CRM-id's zoekt (aparte taak aangemaakt); verwacht de directieroute.
