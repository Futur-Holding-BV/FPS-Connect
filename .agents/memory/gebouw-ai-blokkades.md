---
name: Gebouw AI-analyse blokkades
description: Waarom de AI-gebouwanalyse (gebouw_type/afmetingen) terugvalt op defaults — meestal externe account-issues, geen codebug.
---

# Gebouw AI-analyse valt terug op defaults

Als de AI-gebouwanalyse `gebouw_type` op "overig" zet en afmetingen op generieke defaults
(stap5-fallback in `gebouw-ai.ts`), is de oorzaak vaak NIET de code maar een externe blokkade.
Geocoding (naam/adres/stad/postcode) komt van Google en blijft wél werken, dus de gebruiker
ziet "alles ingevuld behalve gebouwtype" en denkt dat het een UI/AI-bug is.

Twee externe blokkades om eerst te checken (live testen met node-script via bash dat
`process.env.OPENAI_API_KEY`/`GOOGLE_MAPS_API_KEY` leest — code_execution-sandbox heeft die
env NIET; nooit secret-waarden printen):

1. **OpenAI-tegoed op** → API geeft `insufficient_quota`. Dan draait vision/extractie helemaal
   niet en valt alles terug op defaults. Dit is de dominante blokkade.
2. **Google "Maps Static API" niet geautoriseerd** op de sleutel → 403 "not authorized to use
   this service" bij Static Maps. Satellietbeeld (footprint + preview) faalt dan altijd.
   Street View (metadata + static image) en Geocoding werken wél met dezelfde sleutel.

**Why:** beide zijn account-instellingen buiten de repo; codefixes helpen pas als ze opgelost zijn.

**How to apply:**
- Vision draait nu op satelliet EN/OF Street View (niet meer alleen `if (beeld)`), dus
  gebouw_type/bouwlagen kunnen uit Street View komen zónder satelliet — maar pas zodra OpenAI werkt.
- Quota-workaround zonder eigen sleutel: Replit-beheerde OpenAI-integratie. `openai.ts` kiest
  automatisch de proxy zodra `AI_INTEGRATIONS_OPENAI_BASE_URL` én `_API_KEY` gezet zijn
  (activeren via `setupReplitAIIntegrations({providerSlug:"openai", ...})`). Verbruik gaat op
  Replit-credits → eerst gebruiker om toestemming vragen (facturatie).
