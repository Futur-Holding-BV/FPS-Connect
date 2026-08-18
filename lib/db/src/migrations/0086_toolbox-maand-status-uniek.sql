-- Taak #1139: maandstatus-koppeling atomair maken.
-- Eén statusrij per (opdracht, gebruiker): eerst duplicaten opruimen
-- (voltooide rij wint, anders de oudste), daarna unieke index.
DELETE FROM toolbox_maand_status t
USING toolbox_maand_status d
WHERE t.opdracht_id = d.opdracht_id
  AND t.gebruiker_id = d.gebruiker_id
  AND t.id <> d.id
  AND (
    -- d is de winnaar: voltooid terwijl t niet voltooid is…
    (d.voltooid_op IS NOT NULL AND t.voltooid_op IS NULL)
    -- …of beide gelijkwaardig en d is ouder (lager id).
    OR (((d.voltooid_op IS NULL) = (t.voltooid_op IS NULL)) AND d.id < t.id)
  );

CREATE UNIQUE INDEX IF NOT EXISTS toolbox_maand_status_opdracht_gebruiker_uniek
  ON toolbox_maand_status (opdracht_id, gebruiker_id);
