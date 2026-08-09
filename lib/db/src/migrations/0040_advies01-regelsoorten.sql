-- ADVIES_01 fase A — regelsoorten op de calculatieregel.
-- Drie additieve kolommen op mod_calc_regels zodat een adviesrapport regel voor
-- regel naar een calculatie gebracht kan worden (§3):
--   - soort: regel | materiaal | tekst | stelpost | kop. Bestaande regels krijgen
--     de default 'regel' — er wordt geen enkel bedrag herrekend (§6). tekst/kop
--     tellen NOOIT mee; stelpost is wél zichtbaar met bedrag maar telt niet mee;
--     materiaal telt mee als gewone regel maar hangt via ouder_regel_id aan een ouder.
--   - optioneel: regels die niet in het aangeboden bedrag meetellen maar apart
--     onder de offerte vermeld worden (Cityflat-optieblok).
--   - ouder_regel_id: ouder-kindrelatie tussen regels (materiaal onder een werkregel).
--
-- Additieve migratie (genummerd, drift-gecheckt zoals 0037/0038/0039; GEEN drizzle push).
ALTER TABLE mod_calc_regels
  ADD COLUMN IF NOT EXISTS soort text NOT NULL DEFAULT 'regel';

ALTER TABLE mod_calc_regels
  ADD COLUMN IF NOT EXISTS optioneel boolean NOT NULL DEFAULT false;

ALTER TABLE mod_calc_regels
  ADD COLUMN IF NOT EXISTS ouder_regel_id integer
    REFERENCES mod_calc_regels(id) ON DELETE SET NULL;
