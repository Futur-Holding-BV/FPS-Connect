-- CALC_INVOER_01 §4 — koppelgraadmeting van de "plak-analyse".
-- Legt per plakhandeling vast: het soort invoer, hoeveel producten herkend zijn
-- en hoe die zich verdeelden over de vier koppeluitkomsten (§3.3). De herkende
-- producten worden als JSON bewaard voor de meting "welke producten het vaakst
-- niet te koppelen waren". Dit is puur meting/log — nooit een calculatieregel.
CREATE TABLE IF NOT EXISTS calc_plak_analyses (
  id serial PRIMARY KEY,
  calculatie_id integer NOT NULL REFERENCES mod_calc_headers(id) ON DELETE CASCADE,
  gebruiker_id integer REFERENCES gebruikers(id) ON DELETE SET NULL,
  -- invoer_soort: tekst | afbeelding | pdf
  invoer_soort text NOT NULL,
  herkend_aantal integer NOT NULL DEFAULT 0,
  -- verdeling over de vier uitkomsten van §3.3
  gekoppeld_beide integer NOT NULL DEFAULT 0,
  alleen_artikel integer NOT NULL DEFAULT 0,
  alleen_normtijd integer NOT NULL DEFAULT 0,
  ongekoppeld integer NOT NULL DEFAULT 0,
  herkende_producten jsonb,
  aangemaakt_op timestamp NOT NULL DEFAULT now()
);

-- Voor de meting per calculatie / over de tijd.
CREATE INDEX IF NOT EXISTS calc_plak_analyses_calculatie_id_idx
  ON calc_plak_analyses (calculatie_id);
