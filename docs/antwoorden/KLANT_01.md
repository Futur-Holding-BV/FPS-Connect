# KLANT_01 — Klantafscherming: bevindingen en antwoorden

**Datum:** 2026-08-08 · **Status:** gebouwd en bewezen (fase 0 t/m 3)

## Fase 0 — routetabel

Zie `docs/metingen/KLANT_01_klantbereikbare_routes.md` (samenvatting + gaten) en `..._ruwe_analyse.md` (volledige route-inventaris). Kern: **229 sessieroutes waren klantbereikbaar** terwijl het bedoelde klantoppervlak ~19 routes is. `requireBevoegdheid` blokkeert klanten, maar alles met alleen `requireAuth` liet klanten door.

## Fase 2 — de twee bekende gaten: BEIDE ECHTE LEKKEN (bevestigd en gedicht)

1. **pim.ts (gat 4.1) — bevestigd lek.** `GET /opdrachten/:id/pim` (r.317 vóór fix) deed alleen veldweglating via `mapPim`; een klant kon met elk opdracht-id de PIM van andermans project opvragen. De vier `uitvoering/*`-leesroutes hadden zelfs géén veldweglating. **Fix:** helper `klantMagBijOpdracht` (opdracht → gebouw → `magBijGebouw`), 404 bij niet-toegewezen gebouw, op alle 5 klantbereikbare PIM-routes.
2. **rapporten.ts (gat 4.2) — bevestigd lek.** Lijst/detail filterden alleen op status (definitief/gearchiveerd), niet op eigenaarschap; een klant kon definitieve rapporten van elk gebouw lezen en zelfs de klant-reactie op andermans rapport registreren. **Fix:** `magBijGebouw(gebouwId)`-check (404) op lijst, detail én klant-reactie.

## ⚠️ SPOEDMELDING — drie bredere lekken gevonden (buiten de opdracht-scope)

Tijdens fase 0 bleken drie routegroepen voor **iedere ingelogde gebruiker** (dus ook klanten, vóór de poort) volledig onbeschermd, inclusief muteren:

- **`projecten.ts`** — GET/PATCH/**DELETE** `/projecten(/:id)` zonder enige rechten- of eigenaarcheck: elk project inzien, wijzigen, verwijderen.
- **`opname.ts`** — 15 routes: opnames, items en foto's van élk gebouw lezen, aanmaken, wijzigen, definitief maken en verwijderen.
- **`workflow.ts`** — alle CRUD op workflowdefinities/lanes/cards: kantoorprocessen leesbaar en herconfigureerbaar.

De klant-poort sluit deze nu af voor **klanten**. Voor **medewerkers zonder de betreffende module-rechten** staan ze nog open — dat mocht ik binnen KLANT_01 niet wijzigen ("medewerker-toegang niet aanpassen"). **Advies: aparte opdracht om deze drie bestanden onder `requireBevoegdheid` te brengen.** Kleinere leesbevindingen (chat/gebruikers, info/instellingen, nieuws, kantoor-release, go-live-routes in avg.ts, classificatie-GETs zonder middleware, `/ai/invullen`, `/ai/beslissingen/:token`, storage zonder object-ACL) staan in de meting; zelfde advies.

## Fase 1 — centrale begrenzing: klant-poort

`middlewares/klantPoort.ts`, gemount in `routes/index.ts` direct na `laadPermissies`. Principe **dicht tenzij open**: voor rol klant is alleen de expliciete allowlist (26 regels) bereikbaar; al het andere geeft 403. Bestaande handlerfilters blijven staan als tweede laag. Fail-closed: rol onbepaalbaar → normale bevoegdhedenlaag; klant zonder match → 403. In de allowlist zit naast het gebouwoppervlak ook wat het klantportaal aantoonbaar gebruikt: Connect-assistent (antwoorden lopen door de geautoriseerde contextmotor), eigen chatgesprekken (notificatie-poll), bestandsweergave (foto's/plattegronden/rapporten), eigen AVG-verzoeken en melding indienen. Bewust dicht: `/chat/gebruikers` (personeelslijst).

## Fase 3 — buildcontrole

`pnpm --filter @workspace/scripts run klant-poort-check` faalt wanneer: (1) de poort niet ná `laadPermissies` gemount is; (2) een route `requireBevoegdheidOfKlant` gebruikt zonder allowlist-opname (nieuwe klantroute vergt dus een bewuste keuze mét begrenzing); (3) een allowlist-regel op geen enkele bestaande route meer matcht (drift). De check ving tijdens de bouw meteen 4 vergeten PIM-uitvoeringsroutes.

## Bewijs

`scripts/src/verificatie-klant01.ts` (dev, 8 aug, alles groen):
- **K1** klant A ziet alleen eigen (gepubliceerd) gebouw; gebouw B onbereikbaar via lijst én directe URL (403).
- **K2** rapporten vreemd gebouw: 404 (lijst + detail); eigen definitief zichtbaar, concept verborgen.
- **K3** PIM vreemde opdracht: 404 (hoofd- én uitvoeringsroute); eigen PIM 200.
- **K4** 15 routes buiten het klantoppervlak → 403, inclusief PATCH/DELETE /projecten en POST /opname.
- **K5** bedoeld klantoppervlak blijft 200 (dashboard, inspecties).
- **M1** hoofdbeheerder bereikt dezelfde routes ongewijzigd (200) — medewerker-toegang intact.

- **K4b** padvarianten (trailing slash, dubbele slash, hoofdletters, encoded slash, query) omzeilen de poort niet.
- **K4c** ongescoopte (legacy/algemeen) storage-paden zijn voor klanten dicht (403); medewerkers ongewijzigd.
- **K2b** bijlagenbundel: vreemd gebouw 404; eigen definitief rapport bereikbaar voor de klant.

Testaccounts worden na afloop gearchiveerd.

## Architect-review verwerkt

De review keurde de eerste versie af op twee punten, beide opgelost:
1. **Storage-lek:** legacy/algemeen-paden (zonder gebouw in het pad) waren leesbaar voor iedere ingelogde gebruiker, dus via de allowlist ook voor klanten. `magBestandInGebouw` weigert zulke ongescoopte paden nu voor rol klant; gebouw-gescoopte paden liepen al langs de toewijzingscheck.
2. **Bijlagenbundel:** de downloadknop in het klantportaal liep tegen een medewerkers-only middleware (was ook vóór KLANT_01 al kapot voor klanten). Nu bewust opengesteld via `lezenRapportenOfKlant` + klant-checks (toegewezen gebouw én status definitief/gearchiveerd) + allowlist-regel.

**Bekende beperking buildcontrole:** de check herkent alleen het gangbare `router.method("pad", middleware, ...)`-patroon en dekt OfKlant-routes; hij bewijst geen volledigheid van alle denkbare routevormen. De runtime-poort is de eigenlijke garantie (dicht tenzij open); de check bewaakt de afspraak eromheen.
