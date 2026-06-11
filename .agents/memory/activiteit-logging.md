---
name: Activiteit-logging (Live meekijken)
description: Waarom elke activiteiten-insert via logActiviteit moet; gedenormaliseerde gebouwNaam/gebruikerNaam zijn verplicht.
---

# Activiteit-logging moet altijd via logActiviteit

De `activiteiten`-tabel denormaliseert `gebouw_naam` en `gebruiker_naam` als tekst
(naast `gebouw_id`/`gebruiker_id`). De desktop "Live meekijken"-kaart
(`gebouw-activiteit.tsx`) filtert client-side op `a.gebouw_naam === gebouwNaam`,
en de "Recent actief"-lijst toont `gebruiker_naam`. De dashboard-feed
(`dashboard.ts`) behandelt een NULL `gebouw_naam` als "algemene activiteit die
iedereen mag zien".

**Regel:** schrijf nooit rechtstreeks `db.insert(activiteitenTable)`. Gebruik
altijd `logActiviteit({ type, omschrijving, gebouwId, voorzieningId?,
voorzieningNummer?, gebruikerId: req.session.userId })` uit
`artifacts/api-server/src/lib/activiteit.ts`. Die helper zoekt `gebouwNaam` en
`gebruikerNaam` op en vult ze in.

**Why:** de oorspronkelijke inserts zetten alleen `gebouwId` → `gebouw_naam` bleef
altijd NULL → de "Live meekijken"-feed was voor iedereen altijd leeg (web én
mobiel-aangemaakte activiteit), en NULL gebouw_naam lekte gebouw-events naar
gebruikers die niet aan dat gebouw zijn toegewezen. `req.session.userId` is in elke
handlerscope beschikbaar, ook voor mobiel (bearer-token).

**How to apply:** bij elk nieuw activiteittype of nieuwe route die activiteit logt
→ via `logActiviteit`. Bestaande NULL-rijen kun je idempotent backfillen:
`UPDATE activiteiten a SET gebouw_naam = g.naam FROM gebouwen g WHERE a.gebouw_id = g.id AND a.gebouw_naam IS NULL;`
(gebruiker_naam is niet te backfillen op oude rijen want gebruiker_id is daar ook NULL).

**Bekende fragiliteit (niet opgelost):** activiteit denormaliseert de gebouwnaam en
de API-contract levert alleen `gebouw_naam` (geen `gebouw_id`) terug. Een gebouw
hernoemen ontkoppelt historische activiteit weer van de feed. Duurzame fix zou
end-to-end op `gebouw_id` filteren zijn, maar dat vereist een OpenAPI/codegen-wijziging.
