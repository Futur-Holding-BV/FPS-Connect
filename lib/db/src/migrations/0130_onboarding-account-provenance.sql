-- ONBOARDING_STOP_01 — onveranderlijke server-side herkomstpoort voor het
-- hard verwijderen van een afgebroken onboardingaccount.

ALTER TABLE gebruikers
  ADD COLUMN IF NOT EXISTS onboarding_concept_op timestamp;

-- Alleen aantoonbare oude wizardconcepten krijgen een eenmalige backfill.
-- Een gewone medewerker met status "concept" zonder wizardspoor wordt bewust
-- niet gemarkeerd en kan dus nooit via de annuleerroute worden verwijderd.
UPDATE gebruikers gebruiker
SET onboarding_concept_op = COALESCE(
  gebruiker.onboarding_concept_op,
  medewerker.aangemaakt_op,
  gebruiker.aangemaakt_op
)
FROM medewerkers medewerker
WHERE medewerker.gebruiker_id = gebruiker.id
  AND medewerker.medewerker_status IN (
    'concept',
    'onboarding_bezig',
    'in_voorbereiding',
    'wacht_op_documenten',
    'wacht_op_beoordeling',
    'klaar_voor_indiensttreding'
  )
  AND medewerker.wizard_voortgang ? '_onboarding_stroom'
  AND NOT EXISTS (
    SELECT 1
    FROM externe_adviseurs adviseur
    WHERE adviseur.gebruiker_id = gebruiker.id
  );

-- Accounts die via stap 0 zijn gemaakt maar nog geen medewerkerconcept hebben,
-- zijn herkenbaar aan het append-only auditspoor van die serveractie.
UPDATE gebruikers gebruiker
SET onboarding_concept_op = COALESCE(
  gebruiker.onboarding_concept_op,
  gebruiker.aangemaakt_op
)
WHERE gebruiker.rol = 'gebruiker'
  AND NOT gebruiker.is_hoofdtester
  AND NOT EXISTS (
    SELECT 1
    FROM medewerkers medewerker
    WHERE medewerker.gebruiker_id = gebruiker.id
      AND medewerker.medewerker_status NOT IN (
        'concept',
        'onboarding_bezig',
        'in_voorbereiding',
        'wacht_op_documenten',
        'wacht_op_beoordeling',
        'klaar_voor_indiensttreding'
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM externe_adviseurs adviseur
    WHERE adviseur.gebruiker_id = gebruiker.id
  )
  AND EXISTS (
    SELECT 1
    FROM audit_log audit
    WHERE audit.actie = 'onboarding_account_aangemaakt'
      AND audit.entiteit = 'gebruiker'
      AND audit.entiteit_id = gebruiker.id
  );