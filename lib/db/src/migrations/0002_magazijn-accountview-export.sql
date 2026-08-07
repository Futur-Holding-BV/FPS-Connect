-- Migratie: AccountView-exportvelden voor voorraadmutaties en AccountView-instellingen
-- Additief — veilig opnieuw uitvoeren (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)

-- 1. Exporttijdstempel per mutatie (null = nog niet geëxporteerd)
ALTER TABLE voorraad_mutaties
  ADD COLUMN IF NOT EXISTS accountview_export_op TIMESTAMPTZ;

-- 2. Grootboekrekening voorraad (debet bij inkoop/retour, credit bij uitgifte/correctie)
ALTER TABLE accountview_instellingen
  ADD COLUMN IF NOT EXISTS grootboek_voorraad TEXT;

-- 3. Grootboekrekening inkoopkosten (credit bij inkoop/retour, debet bij uitgifte/correctie)
ALTER TABLE accountview_instellingen
  ADD COLUMN IF NOT EXISTS grootboek_inkoop_kosten TEXT;

-- 4. Schakelaar: magazijnmutaties exporteren naar AccountView
ALTER TABLE accountview_instellingen
  ADD COLUMN IF NOT EXISTS magazijn_export_actief BOOLEAN NOT NULL DEFAULT FALSE;
