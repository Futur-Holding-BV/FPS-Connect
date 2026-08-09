-- BOUW_01 §5/§6 — materiaalaanvraag-vraag "volgens de opdracht?",
-- toebehoren-aanvragen (verbruik, geen project) en de kostenrubriek
-- magazijn-gereedschap-toebehoren op voorraadmutaties.

-- Materiaalaanvragen: soort + verplichte vraag (historie blijft null),
-- en opdracht_id mag leeg voor toebehoren-aanvragen.
ALTER TABLE materiaal_aanvragen
  ADD COLUMN IF NOT EXISTS soort text NOT NULL DEFAULT 'materiaal',
  ADD COLUMN IF NOT EXISTS volgens_opdracht text;
ALTER TABLE materiaal_aanvragen
  ALTER COLUMN opdracht_id DROP NOT NULL;

-- Voorraadmutaties: eigen kostenrubriek voor verbruik dat niet op een
-- project mag landen (BOUW_01 §6: zaagjes, boortjes, schijven).
ALTER TABLE voorraad_mutaties
  ADD COLUMN IF NOT EXISTS kostenrubriek text;
