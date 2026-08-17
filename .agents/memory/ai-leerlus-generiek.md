---
name: Generieke AI-leerlus (veld-correcties)
description: Regels rond POST /ai/veld-correctie, de prefix-whitelist en het consumptiefilter tegen leerdata-vergiftiging.
---
- POST /api/ai/veld-correctie is de generieke vastlegging "AI-voorstel vs. gebruikerskeuze" (tabel ai_veld_correcties). Semantiek overal gelijk: voorstel==gekozen ⇒ overgenomen, afwijkend ⇒ gecorrigeerd, gekozen="" ⇒ afgewezen. Frontend logt altijd fire-and-forget (.mutate zonder await) en pas NÁ de geslaagde echte mutatie/opslag — nooit ervoor (review-afwijzing: mislukte actie mag geen correctierecord achterlaten).

**Waarom kritisch:** de route is bewust breed (requireAuth + prefix-whitelist + 120/uur-limiet + gebruiker_id-audit), dus rijen zijn ONBETROUWBAAR als leersignaal. Generieke rijen zijn uitsluitend meetdata.

**Invariant (niet breken):** de enige AI-consumptie van ai_veld_correcties is de bedrijfsdocumenten-few-shot in organisatie.ts; de drempel- én voorbeeldquery MOETEN op de zes bedrijfsdocument-velden gefilterd blijven (inArray GELDIGE_VELDEN). Generieke correcties mogen pas leersignaal worden als ze server-side aan een uitgegeven AI-voorstel gekoppeld zijn (voorstel-token). Bewaakt door scripts/src/verificatie-ai-veld-correctie.ts (sectie 4).

**Poortwachter gateway:** aiGateway.chat/responses weigeren elke aanroep zonder volledige logcontext (module/functie/promptNaam/promptVersie, promptVersie type-verplicht) — status "geweigerd", geen modelaanroep. Historisch ongelabelde tokens (o.a. 715k prod) = van vóór 10 aug 2026; grootverbruiker was de dagelijkse Scout-marktsignalenrun. Restpunt: responses()-pad logt tokens/kosten nog NULL/€0.
