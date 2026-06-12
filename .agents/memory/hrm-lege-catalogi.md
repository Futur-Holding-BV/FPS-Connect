---
name: HRM lege catalogi dropdowns
description: Waarom functie/opleiding-dropdowns in de HRM-module leeg en "kapot" lijken, en hoe het op te lossen.
---

De HRM-catalogi `functies` en `opleidingen` worden door de gebruiker zelf beheerd en zijn bewust NIET geseed met verzonnen data. Een lege catalogus betekent dat data-gedreven shadcn `Select`-componenten (die puur over `functies`/`opleidingen` mappen, zonder vaste fallback-`SelectItem`) opengaan met nul opties — de gebruiker ervaart dit als "de dropdown werkt niet".

**Regel:** geef elke data-gedreven functie/opleiding-Select een duidelijke empty-state in plaats van een lege dropdown:
- waar het create-dialoog op dezelfde pagina bestaat (Personeel-index): toon een melding + inline "Nieuwe functie/opleiding"-knop;
- waar dat niet bestaat (medewerker-detail): toon een melding met een `Link` naar `/personeel` (functiehuis / opleidingen-catalogus).
Selects met een altijd-geldige fallback-optie (bv. "Geen functie") werken wel; voeg daar hooguit een hint toe.

**Why:** dit is geen interactiebug in Radix/shadcn maar ontbrekende data; het kwam terug op meerdere plekken nadat alleen het onboard-formulier was gefixt (commit ac871f2). Niet "oplossen" door nepfuncties/-opleidingen te seeden — de catalogi zijn bewust gebruikersbeheerd.

**How to apply:** bij elke nieuwe functie/opleiding-Select (web of mobiel) eerst `(data ?? []).length === 0` afvangen met een empty-state voordat je de Select rendert.
