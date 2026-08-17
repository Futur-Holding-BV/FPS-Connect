---
name: Governance blokkeert kritieke acties door ontbrekende sessie-rol
description: Waarom DELETE /gebouwen/:id (en andere "kritiek"-geclassificeerde acties) altijd 403 geeft, ook voor hoofdbeheerders, en hoe e2e-tests daarmee omgaan.
---

# Governance-middleware + sessie-rol

**De regel:** de governance-middleware (api-server middlewares/governance.ts) leest de rol van de aanvrager uit `req.session.rol`. De login-flow (routes/auth.ts) zet echter alleen `req.session.userId` — nooit `rol`. Daardoor is de rol in de governance-context altijd null en worden acties met risicoscore "kritiek" (zoals `DELETE /gebouwen/:id`, score 90) voor iedereen geblokkeerd met 403, óók voor hoofdbeheerders.

**Why:** ontdekt bij het bouwen van de e2e-test "nieuw gebouw aanmaken" (juli 2026): de cleanup via `DELETE /api/gebouwen/:id` faalde met 403 ondanks een hoofdbeheerder-sessie. Dit is geen testfout maar een app-beperking.

**Status (17 aug 2026): GEFIXT** — login (2FA-afronding én 2FA-vrijgestelde accounts) zet nu `req.session.rol`; DELETE /gebouwen/:id werkt voor hoofdbeheerder-cookiesessies (smoketest-bewijs 204). Let op reviewer-restpunt: de rol staat 12u gecached in de sessie; degradatie/deactivering trekt lopende sessies niet in.

**How to apply:**
- E2e-cleanup van aangemaakte entiteiten die onder governance-"kritiek" vallen: verwijder direct via de database (`@workspace/db` import in de spec), niet via de API. Zie `scripts/e2e/web-gebouw-aanmaken.spec.ts`.
- Wie dit ooit echt fixt: zet de rol bij login in de sessie, of laat governance de rol via de permissieservice/gebruikerslookup bepalen in plaats van `sessie.rol`. Niet "even" de middleware omzeilen.

**Gerelateerd e2e-patroon:** de knop "Nieuw gebouw" is beheerder-only; daarvoor bestaat een vast e2e-beheerdersaccount `e2e-web-admin@fps.local` (helpers in `scripts/src/e2e-monteur-testaccount.ts`, archivering in het finally-blok van `e2e-web-run.ts`). Het gewone web-e2e-account houdt bewust rol "gebruiker" zodat de andere specs het niet-beheerder-perspectief blijven dekken.
