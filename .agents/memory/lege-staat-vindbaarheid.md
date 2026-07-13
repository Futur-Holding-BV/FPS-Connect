---
name: Lege-staat vindbaarheid
description: Functionaliteit die pas rendert bij 1+ rijen leidt tot "de functie bestaat niet"-klachten; toon ingangen (knop + lege-staat) altijd.
---

Regel: secties die een beheeringang vormen (bijv. "Functies" op de medewerker-profielkaart) mogen niet volledig verborgen zijn bij nul onderliggende rijen — render de sectie altijd met een duidelijke toevoegknop en een betekenisvolle lege-staat.

**Why:** gebruiker meldde boos dat "meerdere functies toevoegen" niet bestond, terwijl de complete feature (kaart + dialoog + backend, end-to-end werkend) al op main stond; het overzichtsblok was alleen verborgen bij 0 aanstellingen, precies de beginstaat van elke medewerker.

**How to apply:** bij nieuwe overzichts-/beheerblokken in FPS Connect: conditie `items.length > 0` alleen op de lijst zelf, nooit op de sectie + toevoegknop; overweeg bij 0 rijen een afgeleide weergave (bijv. hoofdfunctie uit het profiel) zodat de staat klopt met de werkelijkheid.
