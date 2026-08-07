---
name: Calculatie-AI eigen cijfers
description: Hoe de senior-calculatoranalyse aan FPS' eigen prijsdata toetst en welke spelregels daarbij gelden.
---
De calculatie-analyse (CALCULATIE_AI_01) toetst aan eigen FPS-cijfers via vier deterministische contextblokken (calculatieEigenCijfers.ts): eenheidsprijs-norm per regel, prijsgeschiedenis per regelsoort, werkelijk betaalde inkoopprijzen, opslagenpraktijk.

**Regels:** mediaan (nooit gemiddelde); <5 waarnemingen → blok weglaten mét melding; geen koppeling → expliciet melden, nooit gissen; prompt (v2.0.0) mag geen vaste bedragen/percentages als FPS-norm bevatten — de 30-45%-marge-norm is verwijderd en mag niet terugkeren.

**Why:** het waardevolle advies zit in de eigen prijshistorie, niet in algemene vakkennis; verzonnen vergelijkingen zijn erger dan geen advies.

**How to apply:** nieuwe prijsbronnen altijd als extra blok in calculatieEigenCijfers.ts (geen tweede prijzenbibliotheek); matching = normtijd-code eerst, dan genormaliseerde omschrijving+eenheid. Let op (7 aug 2026): dev én prod hadden nog 0 eenheidsprijzen/0 regels — acceptatie op echte calculaties stond nog open.

**gpt-5 leeg antwoord:** grote context + max_completion_tokens 3000-6000 kan volledig aan reasoning opgaan → lege content; route/scripts ruim budget geven (≥12k) bij eigen-cijfers-context.
