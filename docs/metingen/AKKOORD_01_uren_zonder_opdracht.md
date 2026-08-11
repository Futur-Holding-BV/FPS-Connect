# AKKOORD_01 — Meting: uren zonder opdracht (§3.2)

## 2026-08-10 · gemeten op `77bbf11` (main)

**Vraag:** hoeveel urenregels van de laatste 12 maanden hebben `opdracht_id IS NULL`, uitgesplitst naar wel/geen indirecte werkzaamheid en naar medewerkerprofiel?

**Gemeten (ontwikkelomgeving):** de tabel `uren_registraties` in de ontwikkeldatabase bevat **0 rijen** (query: `SELECT COUNT(*) … FROM uren_registraties` → totaal 0). De uitsplitsing is hier dus leeg en zegt niets over het echte gebruik.

**Productie:** de agent heeft sinds 08-08-2026 geen directe toegang tot de productie-database (geen SSH). De meting op productie wordt opgeleverd via een hoofdbeheerder-meetendpoint/beheerpagina (zelfde patroon als `MATERIAAL_01`): `GET /api/metingen/akkoord01` (gebouwd op 11-08-2026, zelfde router-conventie als `/metingen/materiaal01`) — telling over de laatste 12 maanden, uitgesplitst naar (a) `opdracht_id` aanwezig/afwezig, (b) indirecte werkzaamheid aanwezig/afwezig, (c) medewerker-functietitels, met daarbij het aantal regels met alleen een vrije `project_naam`. Zodra dit endpoint mee-gedeployed is, leest René (of de agent via een hoofdbeheerder-sessie) de productiecijfers af en worden ze hier met datum bijgeschreven.

**Gemeten codegedrag (bevestigt de aanname uit de opdracht):**
- `bepaalOpdrachtId()` (`routes/uren.ts` r.663-673) geeft `null` zonder `opdracht_id`/`planning_item_id`.
- `toetsUurcode()` (r.675-706) retourneert direct `{ ok: true }` bij `opdrachtId == null` (r.686). Uren zonder opdracht passeren dus elke uurcode-eis; `project_naam` is een vrij tekstveld.

**Aangenomen:** niets; conform §3.2 wordt hier níets geblokkeerd, alleen gemeten.
