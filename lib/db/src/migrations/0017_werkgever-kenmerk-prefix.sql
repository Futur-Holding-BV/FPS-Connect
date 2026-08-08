-- NUMMER_01 §4.7 — de BV is herkenbaar aan het nummer, als prefix (bv. BP-G156/C590).
-- De prefix woont op de werkgever (BV); de BV volgt uit gebouwen.werkgever_id.
ALTER TABLE werkgevers ADD COLUMN IF NOT EXISTS kenmerk_prefix text;
