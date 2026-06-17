---
name: Spot-intake volgorde (foto-first + AI-voorstel)
description: Verplichte invoervolgorde en stale-state regels voor het aanmaken van een spot (web + mobiel)
---

# Spot aanmaken: foto's eerst, dan AI-voorstel, dan mens bevestigt

Bij het aanmaken van een spot is de invoervolgorde een product-eis (geldt op web én
mobiel, behalve het s.g.-constructie spottype dat in spot-ai bewust is uitgesloten):

1. Foto's **vóór** uploaden/maken
2. Foto's **ná** uploaden/maken
3. **AI-spotherkenning** op de foto ná (vergelijkt met de foto vóór) stelt de overige
   velden voor: applicatie/type, toepassing, wand-of-plafond én een bijbehorend document
4. De **mens bevestigt of past aan**. De AI keurt nooit zelfstandig goed.

Op desktop (web) is er geen camera: alleen foto-**upload**. AI draait dus op de
geüploade foto ná.

**Why:** de gebruiker eist deze volgorde expliciet zodat de AI-voorstellen op het
juiste beeldmateriaal zijn gebaseerd en een mens altijd het laatste woord houdt.
De mobiele monteur-app was al compliant; het web liep achter (foto's stonden onderaan,
geen AI) en is in lijn gebracht.

## Stale-state val bij AI-voorstel

Het AI-voorstel hoort bij specifieke foto's. Twee races moeten worden voorkomen,
anders lekt een oud voorstel naar een andere spot of wordt de leerset tegen de
verkeerde foto opgeslagen:

- Gebruik een **sessie-token** (ref-teller) dat stijgt bij dialoog open/sluiten én bij
  elke fotowijziging. Een laat binnenkomend AI-resultaat wordt genegeerd als het token
  niet meer klopt.
- **Wis het AI-voorstel zodra de foto's wijzigen** (upload/verwijder), zowel het voorstel
  zelf als de amber veld-markering, zodat de leerset nooit met een verouderd voorstel
  wordt bewaard.

**How to apply:** elke nieuwe AI-fill-flow die op foto's leunt moet hetzelfde
sessie-token + foto-invalidatie patroon volgen. Amber = AI-voorstel; neutraal zodra
de mens het veld aanraakt (zie ai-state-kleuren).
