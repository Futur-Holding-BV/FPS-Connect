---
name: Terminologie Gebouw/Spot vs Project-dossier
description: Welke term waar — entiteit "Gebouwen", objecten "Spots", maar bewust dubbel model met "Project" als dossier/lifecycle. Voorkomt blanket rename.
---

# Terminologie-conventie (firevault)

**Regel:**
- Entiteit (het pand) = **"Gebouwen"** in alle navigatie-, lijst-, dashboard- en "niet gevonden"-labels. (Was inconsistent "Projecten".)
- Objecten op de plattegrond = **"Spots"** in alle gebruikersgerichte labels (lijst-leegstanden, plattegrond-hints, activiteitenfeed, klant-tickets). (Was "Voorzieningen".)
- Dashboard-tegel **"Afgekeurde inspecties"** (was "Vervallen inspecties"); tellingbron blijft `vervallen_inspecties` ongewijzigd.
- **"Project" bewust BEHOUDEN** waar het het administratieve dossier / de lifecycle aanduidt — NIET hernoemen naar gebouw:
  - lifecycle-bevestigingen: gereed melden / terugzetten / archiveren / terugplaatsen ("dit project");
  - goedgekeurd segment/tab **"Project & Gebouwgegevens"**;
  - **"FPS Projectteam"** en `Projectformulier`-component, projectsamenvatting;
  - opleverrapport-secties (Project / Projectinformatie / Projectomschrijving / Projectkaders / FPS Projectteam);
  - veld **projectnummer** (getoond als "projectnummer - naam") en **Projectfunctie** (kantoor-functietitels);
  - code-identifiers, variabelen, comments.
- `/voorzieningen/nieuw` is GEEN spot-aanmaakpagina maar de **bibliotheek "Nieuwe toepassing"**-pagina (linkt naar `/beheer/bibliotheek`). "Toepassing" is daar correct (bibliotheek-concept), niet een derde naam voor een spot.

**Why:** functionele audit (V1.0) markeerde inconsistente entiteit-terminologie. De gebruiker koos Gebouwen + Spots + Afgekeurde, maar hanteert bewust een dubbel model: het fysieke gebouw ("Gebouw") versus het administratieve dossier/uitvoeringstraject ("Project"). Een blanket rename project→gebouw zou het dossierconcept, de opleverrapportage en de goedgekeurde segmentnaam breken.

**How to apply:** raak je een entiteit-gericht label aan, gebruik dan Gebouwen/Spots. Laat dossier-/lifecycle-/opleverrapport-/Projectteam-/projectnummer-/projectfunctie-strings met "Project" staan. Half-renames (titel "Gebouwen" met knop "Nieuw project" op hetzelfde scherm) re-triggeren de audit — vermijd die.
