-- AI_01 §4.2 — leerlus uitzetbaar: systeeminstelling ai_leren_van_correcties_ingeschakeld (default aan).
ALTER TABLE app_instellingen
  ADD COLUMN IF NOT EXISTS ai_leren_van_correcties_ingeschakeld boolean NOT NULL DEFAULT true;
