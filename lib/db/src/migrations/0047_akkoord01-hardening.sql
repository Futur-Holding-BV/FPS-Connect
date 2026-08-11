-- AKKOORD_01 hardening (architect-review):
-- 1) DB-CHECK: een vastgelegd akkoord is alleen geldig mét tijdstip, een
--    bekende grond en het grondspecifieke bewijs (B→document, C→herkomst).
--    Fail-closed op de opslaggrens — ook handmatige/legacy rijen kunnen de
--    poort niet openen met ongeldig bewijs.
ALTER TABLE opdrachten
  ADD CONSTRAINT opdrachten_akkoord_geldig CHECK (
    akkoord_grond IS NULL OR (
      akkoord_op IS NOT NULL
      AND akkoord_grond IN ('ondertekening', 'opdrachtbevestiging', 'vrijgave_pl')
      AND (akkoord_grond <> 'opdrachtbevestiging' OR akkoord_document_id IS NOT NULL)
      AND (akkoord_grond <> 'vrijgave_pl' OR (akkoord_herkomst IS NOT NULL AND length(btrim(akkoord_herkomst)) > 0))
    )
  );

-- 2) Beleidsregel AKKOORD_01 §6: opdracht-akkoord vanaf €10.000 (incl. btw)
--    vereist een formele goedkeuringsaanvraag. Goedkeurder: iedereen met
--    goedkeuring-niveau 3 (vier-ogen verplicht). Idempotent gezaaid; de
--    definitieve Bedrijfsleider-preset volgt na besluit van de directie.
INSERT INTO goedkeuring_beleidsregels
  (naam, document_type, ondergrens, goedkeurder_module, goedkeurder_min_niveau,
   aantal_goedkeuringen_vereist, vier_ogen_verplicht, actief)
SELECT
  'Opdracht-akkoord vanaf EUR 10.000 (AKKOORD_01 par. 6)', 'opdracht_akkoord', 10000,
  'goedkeuring', 3, 1, true, true
WHERE NOT EXISTS (
  SELECT 1 FROM goedkeuring_beleidsregels WHERE document_type = 'opdracht_akkoord'
);
