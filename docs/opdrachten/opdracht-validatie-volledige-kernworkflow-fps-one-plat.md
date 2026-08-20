# Opdracht – Validatie volledige kernworkflow FPS One Platform

## Doel

Voer geen nieuwe functionaliteit toe. Richt je uitsluitend op het volledig werkend krijgen en valideren van de bestaande kernworkflow van het platform.

De volledige keten moet aantoonbaar functioneren voordat de volgende ontwikkelfase start.

---

# Scope

Gebruik uitsluitend de bestaande testdata en bestaande modules.

Workflow:

CRM → Gebouw → Verdieping → Plattegrond → Spot → Document → AI → Advies → Werkvoorbereiding

Geen uitbreiding van functionaliteit.

Geen nieuwe schermen.

Geen refactoring zonder noodzaak.

Geen Design Studio.

Geen klant-onboarding.

---

# 1. CRM

Controleer dat de testgebruiker uitsluitend de eigen organisatie en gekoppelde gegevens ziet.

Controleer:

* klant openen
* gebouwen zichtbaar
* relaties correct
* geen rechtenlekken
* correcte organisatie-scope

---

# 2. Gebouw

Controleer volledig:

* gebouw openen
* gebouwgegevens laden
* gekoppelde klant zichtbaar
* gekoppelde documenten zichtbaar
* gekoppelde verdiepingen zichtbaar
* geen fouten in console of API

---

# 3. Plattegronden

Koppel een echte testplattegrond aan verdieping 21.

Ondersteun minimaal:

* PDF
* SVG

Controleer:

* upload
* opslag
* laden
* zoom
* pan
* correcte schaal
* rendering zonder kwaliteitsverlies

---

# 4. Spots

Controleer:

* spot zichtbaar op plattegrond
* openen
* wijzigen
* status wijzigen
* foto's openen
* documenten koppelen
* AI kan spot herkennen

Controleer dat de locatie exact behouden blijft.

---

# 5. DMS

Controleer de volledige documentketen.

Voor ieder document:

* upload
* opslag
* versiebeheer
* preview
* download
* rechten
* organisatie-scope

Controleer meerdere documenttypen.

---

# 6. Document Intelligence

Controleer per document:

* OCR
* classificatie
* metadata
* samenvatting
* document-indexering
* document-chunks
* document-relaties

Controleer dat fouten nooit leiden tot verzonnen informatie.

Bij fouten:

* duidelijke Nederlandse melding
* correcte logging
* graceful degradation

---

# 7. AI Adviescentrum

Controleer:

* documenten beschikbaar
* bronnen gekoppeld
* bronverwijzingen aanwezig
* contextvelden werken
* antwoorden verwijzen naar documenten
* geen hallucinerende antwoorden

Wanneer informatie ontbreekt moet AI expliciet aangeven dat deze ontbreekt.

---

# 8. Werkvoorbereiding

Controleer dat vanuit het Adviescentrum een werkvoorbereiding kan worden opgebouwd.

Controleer:

* documenten beschikbaar
* bronverwijzingen
* AI-context behouden
* workflow correct opgeslagen

---

# 9. Facturen

Controleer:

Verkoopfactuur

* openen
* berekeningen
* btw
* PDF

Inkoopfactuur

* openen
* bedragen
* koppelingen

Geen regressies.

---

# 10. Toolbox

Controleer:

* zichtbaar voor medewerker
* openen
* documenten laden
* afbeeldingen laden
* rechten correct

---

# 11. HRM

Controleer:

* medewerker zichtbaar
* organisatie correct
* gekoppeld gebouw zichtbaar
* rechten correct

---

# 12. Rechten

Controleer alle API-endpoints.

Verifieer dat gebruikers nooit gegevens van andere organisaties kunnen zien.

Controleer alle organisatie-filters.

---

# 13. Logging

Controleer:

* serverlogs
* API-fouten
* console-fouten
* database-fouten

Geen stille fouten toestaan.

---

# 14. Performance

Controleer:

* laadtijden
* document-openen
* OCR-start
* AI-opvragen
* grote PDF's
* meerdere documenten

Identificeer duidelijke bottlenecks.

---

# 15. Eindcontrole

Valideer de volledige keten:

CRM

↓

Gebouw

↓

Verdieping

↓

Plattegrond

↓

Spot

↓

Document

↓

Document Intelligence

↓

AI Advies

↓

Werkvoorbereiding

De volledige workflow moet zonder handmatige database-aanpassingen functioneren.

---

# Niet uitvoeren

* nieuwe functionaliteit
* nieuwe modules
* Design Studio
* klant-onboarding
* UX-herontwerp
* refactoring zonder directe noodzaak
* architectuurwijzigingen

---

# Op te leveren

1. Overzicht van uitgevoerde controles.

2. Eventuele fouten per onderdeel.

3. Oorzaak per fout.

4. Oplossing per fout.

5. Bevestiging dat de volledige workflow stabiel functioneert.

6. Lijst met eventuele blokkades voor de volgende ontwikkelfase.

Er mogen pas nieuwe functionaliteiten worden ontwikkeld nadat deze volledige kernworkflow aantoonbaar stabiel en regressievrij functioneert.
