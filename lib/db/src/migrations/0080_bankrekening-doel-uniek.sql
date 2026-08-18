-- ADMINISTRATIE_01 fase 2 (review-hardening): per werkmaatschappij mag elk
-- doel maar aan één rekening hangen, anders is het afgeleide werkgever-IBAN
-- (ontvangstrekening) niet eenduidig en kan een document een willekeurige
-- rekening tonen. Afgedwongen in de database met partiële unieke indexes.
CREATE UNIQUE INDEX IF NOT EXISTS werkgever_bankrekening_doel_ontvangst_uniek
  ON werkgever_bankrekeningen (werkgever_id) WHERE 'ontvangst' = ANY (doelen);
CREATE UNIQUE INDEX IF NOT EXISTS werkgever_bankrekening_doel_crediteuren_uniek
  ON werkgever_bankrekeningen (werkgever_id) WHERE 'crediteuren' = ANY (doelen);
CREATE UNIQUE INDEX IF NOT EXISTS werkgever_bankrekening_doel_loon_uniek
  ON werkgever_bankrekeningen (werkgever_id) WHERE 'loon' = ANY (doelen);
CREATE UNIQUE INDEX IF NOT EXISTS werkgever_bankrekening_doel_g_rekening_uniek
  ON werkgever_bankrekeningen (werkgever_id) WHERE 'g_rekening' = ANY (doelen);
