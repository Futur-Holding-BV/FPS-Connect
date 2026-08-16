---
name: Declaratie → loonverwerking keten
description: Automatische koppeling declaraties ↔ salarismutaties ↔ SCAB-mail; snapshot-patroon
---
- Goedkeuren declaratie maakt automatisch salaris_mutatie (bron "declaratie", declaratie_id FK, partiële unieke index = race-veilig via onConflictDoNothing); fout blokkeert goedkeuring niet, alleen luid loggen.
- Alsnog afwijzen vanuit goedgekeurd verwijdert alléén de concept-mutatie; geaccordeerde mutaties bewust laten staan.
- **Snapshot-patroon (reviewles):** scab_mails.mutatie_ids legt bij genereren vast wélke mutaties in de mail zitten; verzenden verwerkt uitsluitend declaraties uit die snapshot. Nooit opnieuw op werkmaatschappij+periode zoeken bij verzenden — later goedgekeurde items zouden dan onterecht "verwerkt" worden.
- Verzend-overgang atomair: `UPDATE ... WHERE status <> 'verzonden' RETURNING`, lege returning → 409.
- Handmatige verwerkt-knop blijft als vangnet (uitbetaling buiten loonrun, pre-0055 concepten, post-send fouten).
- Body-tekst van de SCAB-mail bewerken wijzigt de snapshot NIET — alleen bewoording. Wil men mutaties uitsluiten, dan is gestructureerde per-mutatie selectie nodig.
- Bewijs: scripts/src/bewijs-declaratie-loonketen.ts (HTTP-flow + DB-checks, incl. tegenproeven).
