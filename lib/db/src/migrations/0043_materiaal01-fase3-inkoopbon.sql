-- MATERIAAL_01 fase 3 (keuze A) — concept-inkoopbon bij goedgekeurde aanvraag.
-- Additieve kolom: terug-koppeling aanvraag → de inkoopbon die eruit voortkwam.
-- Harde eis §5.2: de aanvraag houdt een verwijzing naar wat eruit voortkwam.
ALTER TABLE materiaal_aanvragen
  ADD COLUMN IF NOT EXISTS resultaat_inkoopbon_id integer
    REFERENCES inkoopbonnen(id) ON DELETE SET NULL;
