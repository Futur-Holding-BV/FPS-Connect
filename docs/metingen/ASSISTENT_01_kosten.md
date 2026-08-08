# Meting — kosten van een assistent-gesprek (ASSISTENT_01, meldpunt 2)

Datum: 8 augustus 2026 · basis-commit: cc98e45 · omgeving: dev · bron: tabel `ai_aanroepen` (module `adviseur`), gevuld door de gedragsbewijs-run `scripts/src/verificatie-assistent01.ts`.

## Gemeten (niet aangenomen)

| Grootheid | Waarde | Herkomst |
|---|---|---|
| Aanroepen gemeten | 11 | `ai_aanroepen WHERE module='adviseur'` |
| Gemiddelde kosten per aanroep | **€0,0063** | kolom `geschatte_kosten_eur` (gpt-4o-tarieven, centraal in de gateway) |
| Gemiddelde prompt-tokens | 2.258 | kolom `prompt_tokens` (systeemprompt incl. Connect-kennis + evt. paginacontext) |
| Gemiddelde antwoord-tokens | 62 | kolom `completion_tokens` |

Een **vraag met gegevens-tool** kost twee aanroepen (vraag → tool → vervolg), dus ~€0,013. Een vraag zonder tool kost één aanroep, ~€0,006.

## Extrapolatie (aangenomen: gebruikspatroon)

Aannames expliciet: een gemiddeld gesprek = 5 vragen, waarvan 2 met tool-vervolgronde → 7 aanroepen.

- **Per gesprek: ± €0,04–0,05.**
- 10 collega's, elk dagelijks één gesprek → **± €0,50 per dag ≈ €11 per maand**.
- Zwaar gebruik (10 collega's × 5 gesprekken/dag) → ± €2,50 per dag ≈ €55 per maand.

Het bestaande dagplafond (`AI_DAGPLAFOND_EUR`, standaard €25/dag, alle AI-functies samen) blijft de harde grens; bij bereiken meldt de assistent dat in gewone taal in de chat. Let op: paginacontext en langere gesprekshistorie verhogen de prompt-tokens; de historie is begrensd op 10 berichten en de contextbundel op het tokenbudget van de contextmotor.
