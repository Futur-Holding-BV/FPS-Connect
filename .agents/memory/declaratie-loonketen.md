---
name: Declaratie → loonverwerking keten
description: Automatische koppeling declaraties ↔ salarismutaties ↔ SCAB-mail; snapshot-patroon
---
- Goedkeuren declaratie maakt automatisch salaris_mutatie (bron "declaratie", declaratie_id FK, partiële unieke index = race-veilig via onConflictDoNothing); fout blokkeert goedkeuring niet, alleen luid loggen.
- Alsnog afwijzen vanuit goedgekeurd verwijdert alléén de concept-mutatie; geaccordeerde mutaties bewust laten staan.
- **Snapshot-patroon (reviewles):** scab_mails.mutatie_ids legt bij genereren vast wélke mutaties in de mail zitten; verzenden verwerkt uitsluitend declaraties uit die snapshot. Nooit opnieuw op werkmaatschappij+periode zoeken bij verzenden — later goedgekeurde items zouden dan onterecht "verwerkt" worden.
- Verzend-overgang atomair: `UPDATE ... WHERE status <> 'verzonden' RETURNING`, lege returning → 409.
- Handmatige verwerkt-knop blijft als vangnet (uitbetaling buiten loonrun, pre-0055 concepten, post-send fouten).
- Per-mutatie selectie gebouwd (aug 2026): PATCH /scab-mails/:id accepteert mutatie_ids[]; server regenereert body deterministisch in input-volgorde (Map-resortering na inArray-fetch); GET /scab-mails/:id/mutaties retourneert in_snapshot-vlag.
- **Route-test mock-patroon:** app.use(router) zonder prefix (route registreert /scab-mails/:id zelf). Drizzle-keten die .orderBy() combineert met direct-await: mock .where() als thenable object met .orderBy()-methode via `Object.assign(Promise.resolve(rows), { orderBy: () => p })`.
- Bewijs: scripts/src/bewijs-declaratie-loonketen.ts (HTTP-flow + DB-checks, incl. tegenproeven).
