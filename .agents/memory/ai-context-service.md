---
name: AI Context Service
description: Centrale contextbundel-motor (architectuur §4.1) — durzame ontwerpbesluiten rond scoping, autorisatiegrens en cache/trim-interactie
---

# AI Context Service (`lib/aiContext/`)

Stelt automatisch de volledige, geautoriseerde contextbundel samen rond een entiteit zodat een AI-functie nooit alleen het huidige formulier ziet. Los valideerbaar; **nog niet aangesloten op AI-functies**.

## Durzame ontwerpbesluiten (why > wat)
- **Scoping nooit op rolnaam.** Autorisatie loopt uitsluitend via de bevoegdheden-matrix (`heeftModuleRecht`/`heeftObjectRecht`) + gebouwtoewijzing (`magBijGebouw`), gevat in een `ContextScope`-interface die de bestaande `PermissieService` structureel vervult. **Why:** rolnaam-gating is elders al de bron van bugs; matrix is de enige waarheid en impersonatie ("bekijken als") werkt gratis mee via `req.permissies`.
- **Autorisatiegrens stopt graaf-expansie.** Een knoop die de gebruiker niet mag zien valt weg ÉN wordt niet verder uitgebreid. **Why:** anders lekt via relaties zichtbaarheid op entiteiten achter een geblokkeerde knoop. Getest.
- **Cache bewaart de RUWE, scope-onafhankelijke knoop; autorisatie wordt nooit gecachet.** **Why:** dezelfde entiteit is veilig deelbaar tussen gebruikers; alleen de per-request autorisatie verschilt.
- **Trimming is copy-on-write.** Token-trimming mag NOOIT de payload van de (mogelijk gecachte, gedeelde) knoop muteren — het produceert een gekloonde bron. **Why:** een request met krap budget kortte anders de gecachte knoop permanent in, waardoor latere requests (ook met ruimer budget of andere gebruikers) structureel onvolledige context kregen. Dit was een code-review-blocker; er is een regressietest die krap-daarna-ruim op dezelfde entity valideert.

## Verificatie
Unit-tests draaien puur (nep-resolvers, geen DB). Draai vanaf repo-root, niet via `--filter` (vitest include-config staat in root `vitest.config.ts`):
`pnpm exec vitest run artifacts/api-server/src/lib/aiContext/aiContext.test.ts`
Diagnostisch endpoint `GET /api/beheer/ai-context` (hoofdbeheerder-only) staat bewust buiten OpenAPI, net als `ai-log.ts` (handgeschreven, volledig `/api/`-pad in de router).
