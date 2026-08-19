-- ZZP'er: eigen bedrijfsnaam apart bewaren (niet langer misbruik van
-- bedrijf_uitzendbureau, dat bij zzp voortaan de inhurende partij cachet).
ALTER TABLE medewerkers ADD COLUMN IF NOT EXISTS zzp_bedrijfsnaam text;
