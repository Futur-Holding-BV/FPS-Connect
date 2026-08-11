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

_(nog in te vullen na deploy — datum, JSON-uitkomst T1–T7)_

## Waar landt de uitkomst en welk besluit hangt eraan

- **T7 leeg voor offertes op prod** → eerst verzendmoment vastleggen (bijv. transitielog aansluiten op de offerte-statuswissels of een `verzonden_op`-veld) vóórdat V1/V2 gebouwd worden; V3–V6 kunnen wel door (die leunen op `datum+geldigheidDagen`, koppelingen en `akkoord_grond`).
- **T2/T4-waarden** → startstand van de configureerbare drempels voor V1/V2/V4.
- **Nul-uitkomsten** → voeder wordt wél gebouwd (sluiting hoort erbij), drempel start op een conservatieve standaard en wordt gemeld.
