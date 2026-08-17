-- Afscherming oud-medewerkers: na offboarden blijven verlof/loon/NAW-gegevens
-- bewaard (bewaarplicht), maar personeelszaken kan de persoonsgegevens
-- "dichtzetten" zodra ze niet meer relevant zijn. Vanaf dat moment worden
-- NAW-/contactvelden niet meer teruggegeven door de API.
ALTER TABLE medewerkers ADD COLUMN IF NOT EXISTS afgeschermd_op TIMESTAMP;
