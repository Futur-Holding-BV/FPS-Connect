-- MARKETING_01 Deel A (vervolg) — gedoseerde campagne-verzender.
-- Instelbaar verzendtempo (mails per minuut) voor de automatische verzender
-- die goedgekeurde campagnemails gespreid uit de mailwachtrij verstuurt,
-- zodat de mailserver nooit een spam-piek produceert. Singleton-instelling
-- op app_instellingen, alleen te wijzigen met crm niveau 4 (verzenden).
ALTER TABLE app_instellingen
  ADD COLUMN IF NOT EXISTS campagne_verzendtempo_per_minuut integer NOT NULL DEFAULT 6;
