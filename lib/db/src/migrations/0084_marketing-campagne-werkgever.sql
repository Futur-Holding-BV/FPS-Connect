-- MARKETING_01 §2 — Werkmaatschappij-branding op campagnes.
-- Koppelt een campagne aan een werkgever zodat campagnemails en de afmeldpagina
-- de eigen huisstijl (logo_url + primaire_kleur) van die werkmaatschappij dragen.
ALTER TABLE marketing_campagnes
  ADD COLUMN IF NOT EXISTS werkgever_id INTEGER REFERENCES werkgevers(id) ON DELETE SET NULL;
