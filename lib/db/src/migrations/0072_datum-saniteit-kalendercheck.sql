-- Aanvulling op 0071: die controleerde alleen formaat en jaarbereik, niet of
-- de datum echt op de kalender bestaat (bv. '2026-02-30'). De API weigert
-- zulke waarden inmiddels; deze migratie heelt bestaande rijen met dezelfde
-- kalenderregel zodat opslag en runtime-validatie consistent zijn.
-- Idempotent: geldige waarden blijven byte-identiek staan.

DO $$
DECLARE
  kolom text;
BEGIN
  FOREACH kolom IN ARRAY ARRAY[
    'in_dienst_sinds', 'uit_dienst_per', 'geboortedatum',
    'rijbewijs_vervaldatum', 'vca_vervaldatum', 'ehbo_vervaldatum', 'bhv_vervaldatum'
  ] LOOP
    EXECUTE format($sql$
      UPDATE medewerkers SET %1$I = NULL
       WHERE %1$I IS NOT NULL
         AND %1$I ~ '^\d{4}-\d{2}-\d{2}$'
         AND (
           -- kalenderongeldige datum: round-trip via to_date wijkt af of faalt
           NOT EXISTS (
             SELECT 1 WHERE to_char(to_date(%1$I, 'YYYY-MM-DD'), 'YYYY-MM-DD') = %1$I
           )
         )
    $sql$, kolom);
  END LOOP;
END $$;
