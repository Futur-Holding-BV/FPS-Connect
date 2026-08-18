---
name: Sessieveld heet userId, niet gebruikerId
description: Handlers die req.session.gebruikerId lezen falen altijd met 401 — het veld bestaat niet
---

**Regel:** de express-session bevat alléén `userId`, `rol`, `pendingUserId`, `pendingSecret`, `werkInboxOAuthNonce` — zie lib/session.ts. Velden `naam`, `gebruikerNaam` en `gebruikerId` bestaan NIET; casts die ze lezen compileren maar leveren altijd `undefined`.

**Why:** aug 2026: cqo.ts/snagstream.ts lazen `sess["gebruikerId"]` → altijd 0/null; governance.ts/goedkeuring.ts/salarisarchief.ts/hrm.ts lazen `session["naam"]`/`session["gebruikerNaam"]` → altijd null/"Onbekend". pbm.ts gebruikte een lokaal object `{ gebruikerId: req.session.userId }` wat verwarrend maar correct was.

**How to apply:**
- Gebruik altijd `req.session.userId` of `getSessionUserId(req)` (helper in middlewares/auth.ts).
- Voor de naam van de ingelogde gebruiker: `await getSessionGebruikerNaam(req)` (DB-opzoek, returnt `string | null`).
- Nieuwe sessie-properties alleen via uitbreiding van de `SessionData`-declaratie in lib/session.ts.
- CI-check: `pnpm --filter @workspace/api-server run check-sessie-velden` (scripts/check-sessie-velden.sh) vangt toekomstige sessie-anti-patronen.
