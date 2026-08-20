-- BANK_01 — bankmutaties mogen nooit stil in het verkoop- of inkoopdagboek
-- terechtkomen. De code is bewust leeg na migratie: export faalt gesloten
-- totdat administratie het juiste AccountView-bankdagboek configureert.

ALTER TABLE accountview_instellingen
  ADD COLUMN IF NOT EXISTS dagboek_bank text;