# Antwoorden en bevindingen — APP_01

## 8 augustus 2026 · gemeten op commit `272d217`

### Aanvulling René: basislaag voor iedere medewerker (vóór het bouwen van het filteren)

**Vraag/correctie:** menu-item Personeel koppelen aan module `personeel` zou eigen declaraties/verlof/loonstrookjes blokkeren voor wie dat modulerecht niet heeft. Er komt een basislaag (eigen uren, declaraties, verlof, loonstrookjes, gegevens/certificaten) voor iedere ingelogde medewerker, opgehangen aan de bestaande `/mijn/`-routefamilie; de modules `declaraties`/`personeel`/`salarisarchief` gaan uitsluitend over ANDEREN. Menu wordt gesplitst: "Mijn gegevens" (iedereen) en "Personeel" (module `personeel`).

**Antwoord:** wordt zo meegenomen in APP_01, vóór de bouw van het menufilteren.

**GEMETEN (routes en hun huidige eis):**
- `/mijn/`-routefamilie bestaat in de api-server: declaraties, verlofaanvragen (GET+POST), verlofsaldi, verlofsoorten, verlof-correcties, salarisdocumenten (incl. download), medewerker, certificaten, opleidingen, ziekmeldingen (GET+POST).
- **Bevestigd probleem:** `routes/declaraties.ts` r.19-21: `GET /mijn/declaraties` eist `declaraties` niveau 1; indienen (`POST /declaraties`, `POST /declaraties/:id/indienen`) eist niveau 2 — dezelfde module waarmee andermans declaraties worden beoordeeld (niveau 3). René's constatering klopt exact.
- De overige gemeten `/mijn/`-routes (`hrm.ts` verlof, `salarisarchief.ts` salarisdocumenten) hebben **geen** modulerecht-eis — alleen inlog. De basislaag bestaat daar dus al; alleen declaraties wijkt af.

**AANGENOMEN (nog te meten bij de bouw):** dat er geen andere `/mijn/`-routes zijn met een verstopte modulerecht-eis; bij de bouw wordt de hele familie route-voor-route nagelopen en de dekking gerapporteerd.

**Consequentie voor de bouw:** eigen-declaratieroutes (`/mijn/declaraties` + indienen/wijzigen van EIGEN niet-ingediende declaraties) worden basisrecht van elke ingelogde medewerker; module `declaraties` blijft uitsluitend voor het zien en beoordelen van anderen (niveau ≥3). Indienen van een eigen declaratie krijgt daarvoor een `/mijn/`-pad of een eigenaarschapscheck i.p.v. modulerecht — exacte vorm wordt bij de bouw bepaald en bewezen.

### Open vraag marketingprofiel — DOOR RENÉ BEANTWOORD

**Vraag (opdracht-aanvulling):** volstaat de preset 'Commercieel' voor de marketingmedewerker, of moet er een profiel bij?

**Antwoord René (8 augustus 2026, chat):** *"marketing en commercieel zijn gelijk"* — **Commercieel volstaat**, er komt geen apart marketingprofiel. Geen besluit meer open op dit punt.

### Nog open (uit APP_01 §5)

**BESLUIT/INFO VAN RENÉ NODIG:** hebben Jacqueline, Ruben of anderen een iPhone? De MONTEURAPP_01-APK is Android-only; voor iPhone-gebruikers is een aparte beslissing nodig.
