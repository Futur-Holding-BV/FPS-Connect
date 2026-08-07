-- 0006 — één opdracht per offerte afdwingen op databaseniveau.
--
-- Aanleiding (code-review SCHULD_01 punt 15): POST /offertes/:id/maak-opdracht
-- controleert vóór de transactie of er al een opdracht bestaat. Twee
-- gelijktijdige verzoeken kunnen die pre-check allebei passeren en elk een
-- opdracht aanmaken. Deze partiële unieke index maakt dat onmogelijk; de route
-- vertaalt de unique-violation (23505) naar de bestaande 409.
CREATE UNIQUE INDEX IF NOT EXISTS opdrachten_offerte_id_uniek
  ON opdrachten (offerte_id)
  WHERE offerte_id IS NOT NULL;
