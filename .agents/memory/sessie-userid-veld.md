---
name: Sessieveld heet userId, niet gebruikerId
description: Handlers die req.session.gebruikerId lezen falen altijd met 401 — het veld bestaat niet
---

**Regel:** de express-session bevat alléén `userId` (en `rol`, `pendingUserId`, `pendingSecret` — zie lib/session.ts). Er bestaat geen `req.session.gebruikerId`; casts als `(req.session as { gebruikerId?: number }).gebruikerId` compileren maar leveren altijd `undefined` → de route geeft stil 401 voor web én mobiel.

**Why:** op 8 aug 2026 bleken ~21 handlers in 8 routebestanden (pbm, meldingen, uitvoerder, opname, hrm, offertes, magazijn, materiaal-aanvragen) dit dode veld te lezen en dus nooit te werken; TypeScript vangt het niet door de cast.

**How to apply:** gebruik altijd `req.session.userId` (of req.permissies). Bij "route doet niets / altijd 401"-klachten: grep eerst op `gebruikerId` in de sessie-cast. Nooit een nieuwe sessie-property via een cast introduceren — breid de SessionData-declaratie uit als er echt iets bij moet.
