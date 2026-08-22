---
name: Acceptatieregister (REGISTER_01)
description: Register per acceptatiepunt met vier standen; oplevering en statusrapport lopen erdoorheen.
---

# Acceptatieregister

- Het register oordeelt per acceptatiepunt in precies vier standen en werkt fail-closed: alleen aantoonbaar, actueel bewijs mag `gehaald` opleveren.
- Bewijskracht is altijd: volledig groene script-run → huidige code → meetrapport → antwoorddocument. Een zwakkere bron mag een sterker actueel oordeel niet overschrijven.
- Actualiteit wordt bepaald tegenover concrete relevante codewijzigingen. Niet-herleidbaar of ouder bewijs valt terug naar `onbewezen` totdat een nieuwe meting bestaat.
- Scriptbewijs promoveert alleen de eigen gekoppelde punten, uitsluitend na een volledig groene run en idempotent bij herhaling.
- Elke regel die op een hoofdbeheerder wacht heeft precies één open actie; een ander oordeel sluit die actie automatisch.
- Een historische bulkhergrading is eenmalig: bewaar de eerste rijbaseline, commit data plus runmarker atomair en coördineer alle schrijvers met hetzelfde gedeelde/exclusieve DB-slot. Een retry slaat nieuwere oordelen over.
- Opdrachtdocumenten zonder timestamp coderen actualiteit in een afsluitend numeriek revisienummer (`basis` < `-2` < `-3`); gebruik nooit lexicografische sortering om de leidende bron te kiezen.

**Why:** de eerste vulling liet ouder bewijs te lang als gehaald staan; zonder baseline en schrijverslot kon een afgebroken of gelijktijdige hergrading bovendien een nieuwer oordeel terug overschrijven. Lexicografische bronkeuze liet ook een ongenummerde basisversie met minder acceptatiepunten winnen van revisie 3.

**How to apply:** registreer bronsoort, bron- en codedatum plus relevante codegrens; meet opnieuw na relevante codewijzigingen, promoveer nooit handmatig op basis van alleen een oud document, vergelijk revisies numeriek en laat elke nieuwe registerschrijver het coördinatieslot delen.
