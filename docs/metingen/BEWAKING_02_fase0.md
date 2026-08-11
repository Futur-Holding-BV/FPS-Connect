# BEWAKING_02 — fase 0: telling commerciële keten

**Meetinstrument:** `GET /api/metingen/bewaking02` (hoofdbeheerder-only, alleen-lezen; zelfde patroon als `materiaal01`). Bron: `artifacts/api-server/src/routes/metingen-bewaking.ts`.

**Productie:** de agent heeft geen directe toegang tot de productie-database. René (of de agent via een hoofdbeheerder-sessie) opent na deploy ingelogd `https://connect.fps-one.nl/api/metingen/bewaking02`; de uitkomst wordt hieronder bijgeschreven. Nul is een antwoord.

## Aanname-toetsen (opdracht §7.8)

1. **T7 / transitielog:** op dev bevat `workflow_transitie_log` **géén** offerte-overgangen (alleen Verlofaanvraag, factuur_prijsafwijking, Inkoopbon). Offerte-statuswissels lopen buiten de WorkflowService om (directe updates in `routes/offertes.ts`). Conform §5 is T7 bepalend: **is dit op productie ook zo, dan moet eerst het moment van verzenden vastgelegd worden en verschuift de rest.** Daarom levert T2 naast de log-afleiding een fallback op `offertes.bijgewerkt_op` (indicatief — dit veld wijzigt óók bij andere bewerkingen).
2. **Twee calculatietabellen:** er bestaan `calculaties` (legacy) én `mod_calc_headers` (ENK-module; `offertes.calculatie_id` wijst hiernaar, NUMMER_01 §4.3). T5 telt beide.
3. **`offertes.datum` kan leeg zijn** (concept zonder datum): T3 telt "zonder datum" apart — die zijn op geldigheid niet te beoordelen.
4. **T6 en V6:** `akkoord_grond` bestaat sinds AKKOORD_01 (migratie 0046) — V6 kán dus gebouwd worden. T6 telt ook `zonder_akkoordgrond` als startstand.

## Dev-meting (11-08-2026, illustratie van het instrument — géén productiecijfers)

- T1: 3 concept, 3 verzonden. T2 uit log: 0 met logregel (zie aanname 1); fallback: mediaan 2,0 d / langste 2 d.
- T3: 0 verlopen, 6 zonder datum. T4: 4 concept-opnames zonder calculatie (mediaan 2,0 d).
- T5: mod_calc_headers 19 concept waarvan 16 zonder offerte; `calculaties` leeg.
- T6: 4 actieve opdrachten; 2 zonder offerte, 2 met niet-ondertekende offerte, 4 zonder akkoordgrond.
- T7: geen offerte-overgangen in de log.

## Productiemeting

**11-08-2026 09:17 UTC** (JSON via René, ingelogd op `connect.fps-one.nl`):

- T1: **0 offertes** (lege lijst).
- T2: log leeg én fallback leeg (geen verzonden/bekeken offertes).
- T3: 0 verlopen, 0 zonder datum, 0 niet-eindstatus.
- T4: **0 opnames zonder calculatie**.
- T5: `mod_calc_headers`: **1 concept, 1 zonder offerte**; `calculaties` leeg.
- T6: **0 actieve opdrachten** (dus ook 0 zonder offerte/akkoordgrond).
- T7: **géén enkele entry** in `workflow_transitie_log` op productie — de aanname uit de dev-meting is bevestigd: offerte-statuswissels lopen niet via de WorkflowService.

Ruwe uitkomst: `{"gemeten_op":"2026-08-11T09:17:00.817Z","t1_offertes_per_status":[],"t2_wachttijd_verzonden_bekeken_uit_transitielog":[],"t2_fallback_op_bijgewerkt_op":[],"t3_geldigheid_verstreken":{"verlopen":0,"zonder_datum":0,"totaal_niet_eindstatus":0},"t4_opnames_zonder_calculatie":[],"t5_calculaties_zonder_offerte":[{"tabel":"mod_calc_headers","status":"concept","totaal":1,"zonder_offerte":1}],"t6_actieve_opdrachten":{"actief_totaal":0,"zonder_offerte":0,"offerte_niet_ondertekend":0,"zonder_akkoordgrond":0},"t7_transitielog_entity_types":[]}`

**Conclusie fase 0:** de commerciële keten is op productie nog nagenoeg onbenut (nul is een antwoord). Er zijn geen gemeten wachttijden om drempels uit af te leiden → alle drempels starten op een conservatieve, configureerbare standaard (zie hieronder) en worden bijgesteld zodra er echte doorlooptijden zijn. T7 is op prod bevestigd leeg → conform §5 wordt éérst het verzendmoment vastgelegd, daarna V1/V2.

## Afwijkingen van de opdracht-aannames (§7.8) — gemeld

1. **Het verzendmoment bestond al.** §4 van de opdracht veronderstelde dat alleen `workflow_transitie_log` het moment van verzenden kent. In werkelijkheid schrijft de verzendflow bij élke verzending een `offerte_tracking`-event `bezorgd` en het portaal bij openen `portaal_bekeken`. Er hoefde dus geen verzendmoment bijgebouwd te worden; V1/V2 lezen deze events (fallback: `bijgewerkt_op`).
2. **`offertes.status` vs. `portaal_status`.** De statusreeks uit §4 (verzonden/bekeken/ondertekend/afgewezen) leeft op `portaal_status`; `offertes.status` blijft bij verzenden ongewijzigd en wordt pas bij ondertekening `geaccepteerd`. De voeders keyen daarom op `portaal_status`. Het meetinstrument is hierop bijgewerkt (11-08-2026): T1 telt per `status` én per `portaal_status`; T2 meet op `portaal_status` in ('verzonden','bekeken') met momenten uit `offerte_tracking` (`bezorgd`=max — herbezorging reset de klok; `portaal_bekeken`=min — herhaalbezoek stelt niet uit) i.p.v. `workflow_transitie_log`, met fallback op `bijgewerkt_op`; T3 sluit eindstatussen uit op `status` (ondertekend/afgewezen/ingetrokken) én `portaal_status` (ondertekend/afgewezen/vervallen).

## Uitkomst fase 0 → gekozen startdrempels

Geen gemeten doorlooptijden (keten onbenut) → conservatieve, configureerbare startstanden in `app_instellingen` (migratie `0048_bewaking02-drempels.sql`): `offerte_reactie_bewaking_dagen` = **7**, `offerte_bekeken_bewaking_dagen` = **5**, `opname_calculatie_bewaking_dagen` = **14**. V3/V5/V6 hebben geen tijdsdrempel (toestand zelf is het signaal).

## Waar landt de uitkomst en welk besluit hangt eraan

- **T7 leeg voor offertes op prod** → dit bleek geen blokkade: het verzendmoment bestond al in `offerte_tracking` (event `bezorgd`, zie Afwijkingen §1). V1/V2 én het meetinstrument lezen die events; er is geen apart `verzonden_op`-veld of transitielog-aansluiting nodig.
- **T2/T4-waarden** → startstand van de configureerbare drempels voor V1/V2/V4.
- **Nul-uitkomsten** → voeder wordt wél gebouwd (sluiting hoort erbij), drempel start op een conservatieve standaard en wordt gemeld.
