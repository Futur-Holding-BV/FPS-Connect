# WERVING_01 — Wervingsmodule: cv-voorbereiding + gespreksvragenlijst

Datum: 2026-08-10 · Commit: ffafc64 · Status: opgeleverd (dev-omgeving)

## Wat er is gebouwd

Lichte wervingsregistratie plus AI-gespreksvoorbereiding, onder
Personeel → Werving (`/personeel/werving`). Geen vacatureteksten, geen
portaal, geen mailcampagnes — conform §5.

### Registratie
- Kandidaat: naam, e-mail, telefoon, functie, kanaal (vrij tekstveld),
  status (ontvangen · uitgenodigd · gesproken · afgewezen · aangenomen),
  cv-bestand (PDF, DOCX, tekst of scan/foto), toestemming-bewaring-vlag.
- Kanalenoverzicht: aantallen per kanaal × status, zodat na verloop van tijd
  zichtbaar is welk kanaal bruikbare mensen oplevert.
- Tabellen: `werving_kandidaten`, `functie_kernvragen`, `werving_vragen`
  (migratie `0043_werving01-kandidaten.sql`, additief).

### AI-voorbereiding (§3) — voorbereiden, nooit oordelen
- `POST /werving/kandidaten/:id/voorbereiden` leest het cv via de bestaande
  documentIntelligence-extractie (tekst; vision-fallback voor scans: 220 DPI,
  detail high, max 5 pagina's) en toetst per functie-eis uit
  taken/verantwoordelijkheden/competenties/opleidingsvereisten.
- Drie standen per eis: **aantoonbaar aanwezig** (verplicht mét vindplaats in
  het cv) · **niet genoemd** · **onduidelijk**. Server-side hardening
  (`hardenToetsing`): een "aantoonbaar aanwezig" zonder vindplaats wordt
  fail-closed teruggezet naar "niet genoemd"; onbekende standen/categorieën
  worden genormaliseerd. Er bestaat structureel géén veld voor score, cijfer,
  rangschikking of geschiktheid — noch in het schema, noch in de UI.
- Beschermde kenmerken (naam, leeftijd/geboortedatum, geslacht, nationaliteit,
  foto, adres/woonplaats, burgerlijke staat, gezondheid) zijn in de prompt
  verboden én — omdat een prompt geen waarborg is tegen modelfouten of
  prompt-injectie via cv-inhoud — deterministisch server-side gefilterd vóór
  persistentie (`vindVerbodenInhoud`): een eis of vraag met verboden inhoud
  wordt nooit opgeslagen; een vindplaats met verboden inhoud valt fail-closed
  terug naar "niet genoemd"; een besmette toelichting/aanleiding vervalt.
  Hetzelfde filter vangt oordelen (score, cijfer, percentage, geschiktheid,
  rangschikking/match) en leeftijdsvarianten ("35-jarige", "is 42 jaar" —
  maar "8 jaar ervaring" blijft legitiem). Het filter is bovendien
  kandidaat-bewust: de naam van de kandidaat wordt genormaliseerd naar
  naam-tokens (accenten weg, tussenvoegsels genegeerd) en élk voorkomen van
  voor- of achternaam in AI-uitvoer wordt gefilterd; de naam gaat nooit mee
  in de prompt. Adversariële unit tests dekken elk uitvoerveld:
  `artifacts/api-server/src/services/wervingVoorbereiding.test.ts` (19 tests
  groen).
- Handmatig verwijderen van een kandidaat is AVG-atomair: het cv-bestand wordt
  éérst uit de opslag verwijderd; faalt dat, dan blijft de kandidaat-rij staan
  en geeft de API 502 (opnieuw proberen mogelijk) — er blijft nooit een
  wees-cv achter dat de periodieke opruiming niet meer kan vinden
  (`verwijderKandidaatMetCv`, unit-getest incl. geforceerde opslagfout).
- Gaten in het arbeidsverleden worden alleen als open vraag voorgesteld
  ("periode X niet toegelicht"), nooit met een gissing naar de oorzaak.
- AI via aiGateway met logcontext (module `werving`, promptnamen
  `werving_cv_toetsing` en `werving_kernvragen_voorstel`), slot default
  (gpt-4o) resp. vision voor scans.

### Vragenlijst (§4)
- **Kernvragen per functie** (`functie_kernvragen`): identiek voor elke
  kandidaat op die functie (vergelijkbaarheid); beheer via
  "Kernvragen per functie" op de wervingspagina; AI kan een voorstel doen
  maar de mens bewerkt en bewaart (PUT vervangt de set).
- Bij voorbereiden wordt de vragenlijst per kandidaat opgebouwd: kopie van de
  kernvragen (bron `kern`) + cv-specifieke vragen (bron `cv`); eigen vragen
  toevoegen kan altijd (bron `handmatig`). Opnieuw voorbereiden bewaart
  vragen die al een gespreksaantekening hebben.
- Na het gesprek: aantekening per vraag + eindconclusie in eigen woorden —
  beide uitsluitend door de mens ingevoerd; de AI stelt hiervoor niets voor.

### AVG-bewaartermijn (§6)
- Bij status afgewezen/aangenomen wordt `procedure_afgerond_op` gezet.
- De bestaande dagelijkse AVG-opruiming (`avgOpruiming.ts`, 02:30) verwijdert
  kandidaten 4 weken na afronding, of 1 jaar bij uitdrukkelijke toestemming
  (`toestemming_bewaring`) — **inclusief het cv-bestand** in de objectopslag;
  vragen cascaden mee. Aantal gelogd in `avg_opschoon_log.kandidaten_verwijderd`.
  Geen tweede opruimmechanisme.

### Autorisatie
- Hergebruik van module `personeel`: lezen = niveau 1, schrijven (kandidaten,
  vragen, kernvragen, voorbereiden) = niveau 2. Geen nieuwe module-id, dus
  geen wijziging aan de bevoegdheden-matrix of presets.

## Bewijs (gemeten, niet aangenomen)

Alle onderstaande punten zijn op 2026-08-10 tegen de draaiende dev-API
bewezen met echte login + TOTP (uitvoer in de scriptlogs):

1. `scripts/src/verificatie-werving.ts` — **alle controles groen**:
   - twee kandidaten met verschillende cv's op dezelfde functie →
     **kernvragen identiek** (3/3), **cv-vragen verschillen** (6 vs 2);
   - kandidaat B's cv-vraag over het gat 2017-2019: "Kunt u toelichten wat u
     deed tussen 2017 en 2019?" — vraag zonder gissing, conform §3;
   - cv A bevat geboortedatum (12-03-1985), nationaliteit, adres, burgerlijke
     staat en een pasfoto-vermelding → **geen enkele verwijzing** daarnaar in
     toetsing of vragen (patroongecontroleerd);
   - **geen score/cijfer/percentage/geschiktheidsoordeel** in de uitvoer
     (patroongecontroleerd);
   - elke "aantoonbaar aanwezig" heeft een vindplaats (fail-closed afgedwongen
     en gecontroleerd);
   - vragen toevoegen/verwijderen, aantekening per vraag en eindconclusie
     door de mens vastgelegd; kanalenoverzicht toont beide kanalen.
2. `scripts/src/verificatie-werving-avg.ts` — **alle controles groen**:
   kandidaat met cv, afgerond 40 dagen terug, geen toestemming →
   `ruimVerlopenKandidatenOp()` verwijdert 1 kandidaat; rij weg (API 404) én
   cv-bestand aantoonbaar weg uit de objectopslag (download faalt).
3. Meting functievelden: `docs/metingen/WERVING_01_functievelden.md` —
   **0 van 4 functies heeft gevulde eisvelden**; voorbereiden op zo'n functie
   geeft bewust 422. Advies: eisvelden vullen vóór praktijkgebruik.
4. Volledige monorepo-typecheck groen; api-server herstart en gezond.

### Aannames / beperkingen
- De patroon-controle op beschermde kenmerken is een steekproef op de
  bewijs-cv's, geen wiskundige garantie voor elk toekomstig cv; de prompt
  verbiedt de kenmerken en het schema biedt er geen plek voor.
- Het bewijs draaide op een tijdelijke testfunctie omdat geen enkele echte
  functie gevulde eisvelden heeft (zie meting).
- Bewaartermijnen zijn instelbaar via `AVG_KANDIDAAT_BEWAARDAGEN` (28) en
  `AVG_KANDIDAAT_BEWAARDAGEN_TOESTEMMING` (365).

## Belangrijkste beslissingen
- **Geen nieuwe module-id** — werving valt onder `personeel` (het is
  HRM-werk van dezelfde persoon); scheelt matrix- en presetmigraties.
- **Kernvragen op de functie, kopie per kandidaat** — de lijst per kandidaat
  blijft bewerkbaar terwijl de vaste kern per functie geborgd is; her-runnen
  van de voorbereiding wist nooit vragen met aantekeningen.
- **Fail-closed overal**: geen vindplaats → "niet genoemd"; lege functie →
  422; onleesbaar cv → 422; AI-kernvragenvoorstel wordt pas werkelijkheid als
  de mens het via PUT bewaart.
