# Changelog — FPS Connect

Overzicht van opdrachten, fixes en bouwwerk per datum.
Voor elke taak drie scores:
- **Uitvoering** — volledig / gedeeltelijk / niet

## 2026-07-09 — Kwaliteits-, Validatie- en Uitvoeringskader verankerd als verplicht referentiedocument

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** geen (uitsluitend documentatie)

**Wat is vastgelegd:**

1. Nieuw verplicht referentiedocument `docs/kwaliteitskader.md`: het door de platformeigenaar vastgestelde Kwaliteits-, Validatie- en Uitvoeringskader, inhoudelijk 1-op-1 overgenomen. Kern: een taak is pas gereed wanneer het volledige bedrijfsproces aantoonbaar correct functioneert — build/typecheck is noodzakelijk maar nooit voldoende. Bevat de vier validatieniveaus (codekwaliteit, architectuur, integratie, business-scenario), verplichte bewijsvoering, root-cause-eerst, regressietesten op eindgebruikersniveau, autonome uitvoering binnen scope, productie-uitrolverbod zonder expliciete goedkeuring en de Definition of Done.
2. Kruisverwijzingen met heldere rolverdeling: `replit.md` (beknopte pointer naast de ontwikkelfilosofie), `docs/ontwikkelfilosofie.md` (wat we bouwen en waarom) en `docs/kwaliteitscontrole.md` (het rapporterende controlescript) verwijzen elk naar het kader (wanneer een taak gereed is).
3. Agent-geheugen bijgewerkt zodat toekomstige sessies het kader kennen en toepassen.

**Bestanden gewijzigd:**
- `docs/kwaliteitskader.md` (nieuw)
- `replit.md`
- `docs/ontwikkelfilosofie.md`
- `docs/kwaliteitscontrole.md`
- `.agents/memory/MEMORY.md` + `.agents/memory/kwaliteitskader.md` (nieuw)

## 2026-07-09 — Bugfix: wachtwoord bij "Gebruiker bewerken" werd stilzwijgend genegeerd + methodologie-review

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Wat is hersteld:**

1. De bewerkdialoog in Gebruikersbeheer toonde een wachtwoordveld ("Leeg = ongewijzigd"), maar `verstuurBewerken` stuurde het veld nooit mee in de PATCH-payload. Een door de beheerder ingevuld nieuw wachtwoord werd dus stilzwijgend genegeerd — de oorzaak van het productie-account zonder wachtwoordhash. Fix: één regel in `artifacts/firevault/src/pages/gebruikers/index.tsx` (`wachtwoord: bewerkForm.wachtwoord.trim() || undefined`). Server-side (hashing met bcrypt in de PATCH-handler) en OpenAPI-schema waren al correct.
2. Regressietest op UI-niveau toegevoegd aan `scripts/e2e/web-wachtwoord-beheer.spec.ts`: login als hoofdbeheerder (TOTP), bewerkdialoog openen, wachtwoord invullen, opslaan; daarna bcrypt-hashwijziging in de database geverifieerd én login met het nieuwe wachtwoord (status `setup_2fa`).
3. Nieuw referentiedocument `docs/diagnose-methodologie.md`: bewijs versus inferentie bij storingsonderzoek (positieve kanaalcontrole, dekkingsgaten per kanaal, hypothese-gedreven werken), naar aanleiding van de onterecht stellige conclusie "het request heeft productie nooit bereikt" in het eerdere login-onderzoek.

**Verificatie:** typecheck firevault + scripts groen; API-level end-to-end in dev (PATCH → bcrypt-hash `$2b$10$…` gewijzigd in DB → login nieuw wachtwoord 200/`setup_2fa` → oud wachtwoord 401); Playwright-regressietest groen (1 passed, 40s). Productieverificatie vereist herpublicatie (op verzoek nog niet uitgevoerd).

**Bestanden gewijzigd:**
- `artifacts/firevault/src/pages/gebruikers/index.tsx`
- `scripts/e2e/web-wachtwoord-beheer.spec.ts`
- `docs/diagnose-methodologie.md` (nieuw)

## 2026-07-09 — P2 increment 1: fundament meerdere rollen per gebruiker

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Wat is gebouwd (bewust zonder gedragswijziging):**

1. `combineerBevoegdheden(matrices[])` in `@workspace/permissies`: combineert de matrices van meerdere rollen (profielen) tot één effectieve matrix — per module het hoogste niveau. Lege invoer geeft een lege matrix zodat de bestaande legacy-fallback (`bevoegdhedenVoorLegacyRol`) ongewijzigd blijft. Nog nergens aangeroepen door runtime-code.
2. 18 unit tests (`combineer-bevoegdheden.test.ts`): per-module max over meerdere rollen (incl. echte presets), regressie één rol (identieke rechten voor alle 18 presets), regressie geen rollen/legacy-fallback, onbekende module-sleutels, ongeldige waarden, immutabiliteit.
3. Additieve koppeltabel `gebruiker_profielen` (gebruiker_id FK cascade, profiel_id FK cascade, UNIQUE-paar, indexen) in het Drizzle-schema, `apply-additive.mjs` en `schema-healthcheck.mjs`; aangemaakt op de ontwikkeldatabase. UNIQUE via SQL, niet via drizzle-schema (bekende deployment-validatievalkuil). Bestaande kolommen (`bevoegdheden`, `herkomst_profiel_id`, `herkomst_automatisch`) onaangeroerd.

**Verificatie:** 193/193 vitest-tests groen; typecheck libs + firevault + monteur-app groen (alleen de 3 bekende, reeds bestaande TS7030 in api-server); api-server esbuild-build groen; schema-healthcheck 10/10.

**Bestanden gewijzigd:**
- `lib/permissies/src/index.ts` (+ nieuw `combineer-bevoegdheden.test.ts`)
- `lib/db/src/schema/gebruikers.ts`
- `lib/db/scripts/apply-additive.mjs`
- `lib/db/scripts/schema-healthcheck.mjs`

## 2026-07-09 — P1 Hotfix: klant-reactievelden (typefout + ontbrekende databasekolommen)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Wat is hersteld:**

1. Typecheck-fout in `rapport-melding-reset.test.ts`: het testfixture miste de nieuwe velden `klantReactieOp` en `klantReactieType` uit de ontvangstbevestiging-commit. Beide toegevoegd als `null` — geen gedragswijziging, alle 11 unit tests slagen.
2. Databasedrift: kolommen `klant_reactie_op` (timestamp) en `klant_reactie_type` (text) ontbraken op `opleverrapporten` in de ontwikkeldatabase, terwijl het Drizzle-schema ze wel definieert. Toegevoegd via directe `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, en tevens opgenomen in `apply-additive.mjs` (post-merge herstelt dit voortaan automatisch in elke omgeving) en `schema-healthcheck.mjs` (drift wordt voortaan gesignaleerd).

**Resultaat:** de e2e-webtest "rapportenbibliotheek toont, zoekt en filtert rapporten cross-gebouw" slaagt weer.

**Bestanden gewijzigd:**
- `artifacts/api-server/src/__tests__/rapport-melding-reset.test.ts`
- `lib/db/scripts/apply-additive.mjs`
- `lib/db/scripts/schema-healthcheck.mjs`

## 2026-07-09 — Verlopen reactietermijnen tegel op operationeel dashboard
## 2026-07-09 — Klant kan ontvangst bevestigen van een definitief rapport

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Wat is gebouwd:**

Tegel "Verlopen reactietermijnen" toegevoegd aan het operationele beheerdersdashboard (`beheerder.tsx`):
- Toont het aantal definitieve rapporten met `opleverstatus === "verstreken"`.
- Alleen zichtbaar voor hoofdbeheerder en gebruikers met `rapportages >= 1` bevoegdheid (via `magRapportages`).
- Tegel is altijd aanwezig (ook bij 0 — geen verrassingsverschijning).
- Klikbaar: linkt door naar `/rapporten?status=verstreken`.
- Telt rood als er verlopen termijnen zijn, neutraal bij 0.

URL-param support toegevoegd aan `rapporten/index.tsx`:
- `?status=<waarde>` in de URL overschrijft de sessionStorage-beginwaarde van het statusfilter.
- Maakt een directe deep-link vanuit het dashboard (of elke andere plek) mogelijk.
- Alleen geldige statussen (uit `GELDIGE_OPLEVERSTATUS_WAARDEN`) worden geaccepteerd.

**Bestanden gewijzigd:**
- `artifacts/firevault/src/pages/dashboard/beheerder.tsx`
- `artifacts/firevault/src/pages/rapporten/index.tsx`

## 2026-07-09 — Rapport melding-markering nooit geërfd door nieuwe versie

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Wat is gebouwd / hersteld:**

Een nieuwe conceptversie van een rapport (`POST /nieuwe-versie`) erfde al correct geen `reactietermijn_melding_verzond_op` — het veld werd nooit in de insert-waarden opgenomen. Ter hardening en documentatie zijn twee aanvullende maatregelen genomen:

1. **Expliciete null-reset in de definitief-route** (`POST /definitief`): bij het definitief maken van een concept wordt `reactietermijn_melding_verzond_op` nu expliciet op `null` gezet. Dit borgt dat een herstart scenario (bijv. een concept dat ooit tijdelijk een waarde had) de melding-markering nooit onbedoeld kan doorlaten.
2. **Pure helper-functie + 11 unit-tests**: de insert-logica is geëxtraheerd naar `artifacts/api-server/src/lib/rapport-helpers.ts` (`bouwNieuweVersieWaarden`). Twee tests bevestigen direct dat `reactietermijnMeldingVerzondOp` nooit aanwezig is in de nieuwe versie, ook niet als het bronrapport de kolom gevuld heeft. Aanvullende scenario's dekken versienummer, status en inhoud-continuïteit.

**Technische details:**
- `artifacts/api-server/src/lib/rapport-helpers.ts` — nieuw bestand met geïsoleerde, unit-testbare helper
- `artifacts/api-server/src/routes/rapporten.ts` — definitief-route reset nu expliciet `reactietermijnMeldingVerzondOp: null`; nieuwe-versie-route gebruikt de helper
- `artifacts/api-server/src/__tests__/rapport-melding-reset.test.ts` — 11 tests, alle groen

Klanten kunnen nu in FPS One (klantportaal `/klant/rapportages`) op "Ontvangst bevestigen" klikken bij een definitief rapport. De bevestiging wordt opgeslagen in de database and is direct zichtbaar voor interne gebruikers in de gebouwkaart-rapporten-tab.

- DB: twee nieuwe kolommen op `opleverrapporten`: `klant_reactie_op` (TIMESTAMPTZ) en `klant_reactie_type` (TEXT). Toegevoegd via directe ALTER TABLE (additief, geen drizzle push vereist).
- OpenAPI: `Rapport`-schema uitgebreid met `klant_reactie_op` and `klant_reactie_type`; nieuw endpoint `POST /gebouwen/{id}/rapporten/{rapportId}/klant-reactie` + `KlantReactieInput` schema.
- API server (`rapporten.ts`): nieuw route-handler. Alleen op definitieve rapporten; eenmalig (409 bij tweede poging); klant en interne gebruikers mogen beide bevestigen. `mapRapport` geeft beide velden mee.
- Frontend klant (`klant/rapportages.tsx`): nieuwe `OntvangstBevestigenKnop`-component — toont knop bij definitieve rapporten zonder reactie; toont groene bevestigingsregel daarna.
- Frontend intern (`gebouwen/gebouw-rapporten.tsx`): toont "Klant bevestigd ontvangst op [datum]" in groen bij rapporten met een klantreactie.

## 2026-07-08 — Pre-push typecheck fix: opleverstatus status-strings

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag

**Wat is hersteld:**

Task #424 hernoemde het veld `weergave_status` → `opleverstatus` en de status-strings `definitief_verzonden` → `verzonden` / `termijn_verstreken` → `verstreken`. Twee bestanden waren nog niet meegenomen in die rename: `klant/rapportages.tsx` (5 plaatsen) en `onderhoud/dashboard.tsx` (1 plaats). Gevonden tijdens de pre-push typecheck controle (TS2339 / TS2367). Alle firevault typecheck-fouten zijn nu opgelost.
