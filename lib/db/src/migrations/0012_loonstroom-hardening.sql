-- LOON_01 hardening (n.a.v. code-review)
--
-- 1. Database-afgedwongen dedupe: dezelfde mailbijlage kan nooit twee keer in
--    het salarisarchief belanden, ook niet bij een race tussen parallelle runs.
-- 2. Deployment-safe aanscherping van het systeemprofiel "Externe boekhouder":
--    de preset-definitie in code verandert bestaande profielen/accounts niet
--    vanzelf, en een boekhouder mag na deze release geen financieel-/project-/
--    offerte-toegang meer hebben. Fail-closed: we vervangen de bevoegdheden
--    van het systeemprofiel én van gebruikers die uit dit profiel voortkomen.

CREATE UNIQUE INDEX IF NOT EXISTS sepa_bestanden_bronmail_bijlage_uq
  ON sepa_bestanden (bron_mail_message_id, bestandsnaam)
  WHERE bron_mail_message_id IS NOT NULL;

UPDATE profielen
SET bevoegdheden = '{"salarisarchief": 3, "salaris_mutaties": 1, "boekhouder_portaal": 4}'::jsonb
WHERE naam = 'Externe boekhouder' AND systeem = true;

UPDATE gebruikers
SET bevoegdheden = '{"salarisarchief": 3, "salaris_mutaties": 1, "boekhouder_portaal": 4}'::jsonb
WHERE herkomst_profiel_id IN (
  SELECT id FROM profielen WHERE naam = 'Externe boekhouder' AND systeem = true
);
