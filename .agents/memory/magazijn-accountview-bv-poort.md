---
name: Magazijn AccountView-BV-poort
description: De fail-closed en racevrije werkmaatschappijcontrole voor magazijnboekingen naar AccountView.
---

**Regel:** een magazijnboeking naar AccountView bepaalt de werkmaatschappij uit
alle beschikbare bronnen (magazijngebouw en mutatierelatie). Ontbrekende,
onvolledige, onbekende of onderling strijdige bronnen blokkeren de boeking. De
AccountView-instellingen, mutatie en alle gebruikte bronrijen moeten
vergrendeld blijven tot de externe call én exportmarkering zijn afgerond.

**Why:** een losse herlezing direct vóór een externe boeking laat nog steeds
een venster waarin instellingen of bronrelaties kunnen wijzigen. Dat kan een
correct gevalideerde boeking alsnog naar een administratie van een andere BV
sturen.

**How to apply:** voeg bij nieuwe financiële exportpaden geen alleenstaande
BV-check toe. Gebruik een transactionele verzendpoort met rij- en zo nodig
tabelvergrendelingen voor elke BV-bepalende bron, valideer ná de locks en bouw
client/payload uitsluitend uit de vergrendelde snapshot op. Geef de actieve
transactie ook door aan alle resolverqueries: een globale DB-query binnen een
transactionele verzendpoort kan de connection pool deadlocken. Bewijs steeds
ontbrekende koppeling, mismatch, onbepaalbare/ongeldige bron,
brontegenstrijdigheid en meerdere gelijktijdige exports.