---
name: Bearer = stateless, geen session-store
description: Waarom mobiele bearer-verzoeken de express-session store moeten overslaan
---
Bearer-token verzoeken (uitsluitend de mobiele monteur-app) moeten de gedeelde
`sessionMiddleware` overslaan. De mobiele app bewaart de sessie-cookie niet, dus
elk verzoek krijgt een nieuwe sessie-id; zodra `requireAuth` `req.session.userId`
zet, schrijft connect-pg-simple een NIEUWE rij in de `session`-tabel. Onder
intensief mobiel gebruik groeit die tabel onbeperkt.

**Oplossing:** in `app.ts` branchen bearer-verzoeken weg van `sessionMiddleware`
naar een niet-persisterende stub (`maakStatelozeSessie()` in `lib/session.ts`).
`req.session` blijft bruikbaar (handlers lezen `req.session.userId`), maar er
draait geen store mee: geen DB-rij, geen Set-Cookie. Web (cookie-auth, geen
Authorization-header) gaat ongewijzigd door `sessionMiddleware`.

**Why:** bearer-auth is stateless en heeft de store conceptueel niet nodig; de
store-koppeling was puur een neveneffect van `req.session` muteren.

**How to apply:** voeg nooit sessie-afhankelijke persistentie toe aan het
bearer-pad; de stub heeft no-op save/destroy/regenerate/reload/touch zodat
gedeelde handlers (bv. logout `destroy()`) niet crashen.
