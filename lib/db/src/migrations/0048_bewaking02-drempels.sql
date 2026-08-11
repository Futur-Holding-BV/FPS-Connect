-- BEWAKING_02 §7.4 — configureerbare drempels voor de commerciële voeders.
-- Fase 0 (prod-meting 11-08-2026) leverde geen doorlooptijden op (keten nog
-- onbenut); startstanden zijn daarom conservatieve standaarden, bij te stellen
-- via app_instellingen zodra er echte doorlooptijden zijn.
ALTER TABLE app_instellingen
  ADD COLUMN IF NOT EXISTS offerte_reactie_bewaking_dagen integer NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS offerte_bekeken_bewaking_dagen integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS opname_calculatie_bewaking_dagen integer NOT NULL DEFAULT 14;
