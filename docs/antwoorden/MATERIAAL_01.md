# MATERIAAL_01 — antwoorden en bevindingen

Dit bestand wordt **bijgewerkt, niet overschreven**; oudere bevindingen blijven met hun datum staan.

---

## 2026-08-10 · gemeten op commit `d17eebd5` (main, dev) — fase 0/1/2 uitgevoerd, fase 3 bewust NIET

### Fase 1 — werkbaksignaal sluiten (§3)

**Vraag:** sluit het werkbakitem bij `goedgekeurd`/`afgewezen`, blijft het open bij `in_behandeling`,
en hoeveel bestaande items sloot de herstelronde?

**Antwoord (gemeten, gedragsbewijs `scripts/src/bewijs-materiaal01.ts`, alle checks groen op dev):**
- `PATCH /materiaal-aanvragen/:id` → `goedgekeurd` sluit het werkbakitem (gevonden via
  `herkomst_type = "materiaal_aanvraag"` + `herkomst_id`, via het bestaande afhandelmechanisme in
  `werkbakService` — geen tweede sluitroute). `afgewezen` idem. `in_behandeling` laat het item open.
- **Herstelronde ontwikkelomgeving: 0 items** (gemeten — er stonden op dev geen stale open items;
  het bewijsscript toont wel dat de ronde een kunstmatig stale item sluit en idempotent is).
- **Herstelronde productie: NOG TE METEN** (aangenomen dat er items staan; dit is juist de nulmeting).
  De agent heeft sinds 8 aug geen SSH; daarom is een hoofdbeheerder-only voorziening gebouwd:
  `POST /api/metingen/materiaal01/herstel` + knop "Herstelronde werkbak" op
  **Instellingen → Meting inkoopgebruik** (`/beheer/metingen-materiaal`). Het getal dat die knop op
  productie meldt, wordt hier bijgeschreven.

### Fase 2 — rechten rechtgezet (§4)

**Vraag:** heranalyseer omlaag naar `projecten:2`, constanten hernoemd, en welke profielen hebben
vandaag `projecten:2` en `projecten:3` (niemand wint of verliest toegang)?

**Antwoord (gemeten):**
- `POST /:id/heranalyseer` staat nu op `projecten:2` — hetzelfde niveau als behandelen (dat stond
  feitelijk al op niveau 2; alleen de misleidende constantenaam `lezen` suggereerde anders).
- Constanten `lezen`/`schrijven` vervangen door één `niveauInzienEnBehandelen` (projecten:2).
- Gevolg: **niemand verliest toegang** (behandelen ongewijzigd op 2); **wie wint:** profielen met
  `projecten:2` konden al behandelen maar niet heranalyseren — dat kan nu wel. Dat is precies de
  bedoelde correctie: het besluit was al niveau 2, alleen de niets-beslissende AI-herstart stond op 3.
- Profielentabel (dev-DB, systeem-presets, 10-08-2026):

| projecten-niveau | profielen |
|---|---|
| 3 | Calculatie, Directie, Projectleider, Werkvoorbereider |
| 2 | Administratie, Magazijnbeheerder, Uitvoerder |
| 1 | Controleur, Externe inhuur, Monteur, Onderhoudsmonteur, Timmerman |
| 0 | Commercieel, Externe boekhouder, HRM-adviseur, Planner, Project-admin, Wagenparkbeheerder |

  (Hoofdbeheerder passeert de matrix altijd. Productieprofielen kunnen afwijken als ze daar handmatig
  zijn aangepast — **aangenomen** gelijk aan de presets, te verifiëren op de beheerpagina Rollen & Rechten.)

### Fase 0 — telling (§2)

Zie `docs/metingen/MATERIAAL_01_gebruik.md`: dev-cijfers gemeten; **productietelling nog te draaien
door René** via de nieuwe beheerpagina (agent heeft geen SSH/DB-toegang tot de VPS meer).


### Fase 3 — keuze A gebouwd (2026-08-11, commit zie changelog)

**René heeft op 11 aug 2026 keuze A gekozen** (concept-inkoopbon op de opdracht), op basis van de
productiemeting van 10 aug 2026 (commit `f7e2d643`): alle inkooptabellen stonden op nul, waardoor B
(reservering) en C (behandelaar kiest) niet aantoonbaar pasten.

**Wat er gebouwd is:**
- Bij de overgang `PATCH /materiaal-aanvragen/:id` → `goedgekeurd` (én de aanvraag heeft een `opdracht_id`):
  - Wordt een **concept-inkoopbon** aangemaakt in dezelfde transactie als de status-update en de werkbaksluiting.
  - Leverancier: `ai_leverancier` (of "Onbekend" als dat leeg is).
  - Bonregel: `ai_artikel_naam` / `omschrijving` / fallback; hoeveelheid = 1, eenheid = "st"
    (aanvraag heeft geen aantal — René akkoord, §5 toelichting).
  - Prijs: geparsed uit `ai_prijs_indicatie` (bijv. "€ 350,00" → 350).
  - `opmerkingen`: bevat `volgens_opdracht=wijkt_af` of `weet_niet` leesbaar (§5.4 harde eis).
- De aanvraag krijgt `resultaat_inkoopbon_id` terug (§5.2 harde eis: verwijzing naar het resultaat).
- Afwijzen → geen inkoopbon, `resultaat_inkoopbon_id` blijft null.
- Tweede goedkeuring op een al-goedgekeurde aanvraag → geen tweede bon (idempotentiebescherming
  via `bestaand.status !== status`-guard).
- Toebehoren-aanvragen (geen `opdracht_id`) → werkbak sluit, geen bon (BOUW_01 §6 ongewijzigd).

**DB-migratie:** `0043_materiaal01-fase3-inkoopbon.sql` — additieve kolom
`materiaal_aanvragen.resultaat_inkoopbon_id` (FK naar `inkoopbonnen`, ON DELETE SET NULL).

**Bewijs:** `scripts/src/bewijs-materiaal01-fase3.ts` — 18 checks groen (gemeten op dev 11-08-2026):
- concept-bon aangemaakt met juiste velden (status, opdracht, leverancier, opmerkingen, bonregel)
- `wijkt_af` en `weet_niet` zichtbaar in opmerkingen
- fallback naar "Onbekend" en monteuromschrijving bij lege AI-velden
- geen dubbele bon bij tweede goedkeuring
- werkbakitem sluit bij goedkeuren (regressie fase 1)

### Buiten scope gehouden (§6, bevestigd)

Geen tabellen samengevoegd, `mod_calc_leveranciers` niet aangeraakt, toebehoren-tak ongewijzigd,
AI-verrijking niet uitgebreid.


---

## Aanvulling 2026-08-10 — productietelling binnen, fase 3 gebouwd (keuze A)

De productietelling (zie `docs/metingen/MATERIAAL_01_gebruik.md`, datumkop 2026-08-10 productie) gaf
op alle tien tellingen nul: **geen enkel inkoopmodel wordt in productie gebruikt**. René koos daarop
expliciet **A**: goedgekeurd → concept-inkoopbon op de opdracht. B (reservering) en C (behandelaar
kiest) blijven open voor wanneer het magazijn in gebruik komt.

### Wat is gebouwd

- **Gedeeld aanmaakpad** (`api-server/src/lib/inkoopbonService.ts`): de bestaande handmatige
  POST-route én de automatische aanmaak lopen door dezelfde `maakConceptInkoopbon()` — er is
  géén vierde bestelpad bijgekomen (§7.5). I-nummer uit de gedeelde DB-sequence, offerte-koppeling
  van de opdracht (NUMMER_01 §4.5), status altijd `concept`.
- **Automatiek in de goedkeurings-transactie** (PATCH materiaal-aanvraag): alleen bij een échte
  overgang naar `goedgekeurd`, alleen soort `materiaal` mét opdracht, en alleen als er nog geen bon
  hangt (idempotent — her-goedkeuren maakt nooit een tweede bon). Toebehoren-aanvragen (projectloos)
  krijgen bewust geen bon.
- **Aanvraag houdt verwijzing naar het resultaat** (§7.5): nieuwe kolom
  `materiaal_aanvragen.inkoopbon_id` (migratie `0044`, FK SET NULL).
- **`volgens_opdracht = wijkt_af` loopt zichtbaar mee** (§7.5): de bon-opmerkingen beginnen dan met
  "LET OP: aanvraag wijkt af van de opdracht." plus aanvraag-nummer, reden en behandelnotitie.
- **Leverancier en prijs komen bewust NIET uit de AI-velden** (inkoop-eigen-cijfers): leverancier
  staat op "Nog te bepalen", de AI-suggestie staat alleen als controle-tekst in de opmerkingen;
  de inkoper werkt het concept af via Inkoop.
- **Zichtbaarheid**: de werkvoorbereidingspagina meldt na goedkeuring direct het bon-kenmerk
  (anders verdwijnt de kaart en lijkt er niets gebeurd).

### Betekenis voor INKOOP_01 en NUMMER_01 §4.5

De blokkade "eerst weten welk model gebruikt wordt" is **opgeheven**: er is geen bestaand gebruik,
dus geen gegevensmigratie en geen te verstoren gebruikers. INKOOP_01 kan op het inkoopbon-model
doorbouwen; de NUMMER_01 §4.5-keuze (projectinkoop hangt aan de offerte van de opdracht, gedeelde
I-reeks) is hiermee definitief in gebruik genomen door het automatische pad.

### Bewijs

`scripts/src/bewijs-materiaal01-fase3.ts` — 14 checks groen (incl. parallelle dubbelgoedkeuring: 1×200 + 1×409, precies één bon): bon ontstaat als concept met I-kenmerk
en verwijzing; her-goedkeuren maakt geen tweede bon; afwijzen en toebehoren maken geen bon;
het handmatige pad werkt ongewijzigd via hetzelfde gedeelde aanmaakpad.
