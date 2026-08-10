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

### Fase 3 — de ontbrekende schakel (§5): NIET GEBOUWD, en dat is de correcte uitkomst

**Er ligt geen keuze van René (A/B/C).** Conform §7.5 is fase 3 daarom niet gebouwd — niets tussen
goedgekeurde aanvraag en bestelling in gezet, geen vierde bestelpad, niets "alvast" geconsolideerd.

**Besluit dat nodig is (aan René, ná de productietelling):**
- **A** — goedgekeurd → concept-inkoopbon op de opdracht;
- **B** — goedgekeurd → reservering op het magazijn (bij tekort: bestaand magazijn-inkooporderpad);
- **C** — behandelaar kiest per aanvraag tussen A en B, met systeemvoorstel.

Kandidaat-regel voor C uit §5, **uitsluitend ter beoordeling, niet ingevoerd**: artikel in `artikelen`
mét voorraad → B; anders → A. Of die regel bij de werkwijze van FPS past, kan alleen René beoordelen,
mede op basis van T10 (wie beslist dat vandaag).

### Buiten scope gehouden (§6, bevestigd)

Geen tabellen samengevoegd, `mod_calc_leveranciers` niet aangeraakt, toebehoren-tak ongewijzigd,
AI-verrijking niet uitgebreid.
