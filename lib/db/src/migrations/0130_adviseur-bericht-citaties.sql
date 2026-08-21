-- ASSISTENT_OVERAL_01 — bronverwijzingen horen bij het antwoordbericht zelf.
-- Zo kan GET /adviseur/gesprek een herladen gesprek met exact dezelfde,
-- eerder geautoriseerde Connect-bronnen teruggeven.

ALTER TABLE "adviseur_berichten"
  ADD COLUMN IF NOT EXISTS "citaties" jsonb;