---
name: E2e HRM-functiefixtures
description: Richt synthetische veld- en bouwaccounts via het echte functiehuis in zonder onbedoelde rechtenovererving.
---

**Regel:** Een e2e-account dat als veld- of bouwmedewerker moet gelden krijgt een actieve medewerker en actieve echte functie; een tekstwaarde in de verouderde functietitelcache is geen geldige fixture. Gebruik bij naamallowlists de exacte functienaam.

**Why:** Serverclassificatie leest het HRM-functiehuis. Een testaccount met alleen een teksttitel logt wel in, maar krijgt de verkeerde menuvariant of geen bouwmelding. Tegelijk kan opstartlogica een exact benoemde testfunctie automatisch aan een rechtenpreset koppelen, waardoor een negatief rechtenscenario onverwacht toegang krijgt.

**How to apply:** Maak de testfunctie idempotent onder een herkenbare e2e-werkmaatschappij, herstel medewerkerstatus en neutrale dienstdata bij elke setup, verwijder oude aanstellingen en maak de profielkoppeling na serverstart expliciet leeg wanneer de functie alleen voor classificatie dient. Archiveer testgebruikers na afloop.