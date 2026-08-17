-- SOCIAL_01 review-fixes:
-- 1. Kanaalrij krijgt lease-status 'bezig' zodat een trage adaptercall nooit
--    door een tweede planner-tick dubbel geclaimd kan worden.
-- 2. Berichtstatus wordt eerlijk: 'geplaatst' alleen als álle kanalen echt
--    geplaatst zijn; anders 'deels_geplaatst' of 'mislukt'.

ALTER TABLE social_bericht_kanalen
  DROP CONSTRAINT IF EXISTS social_bericht_kanalen_plaatsing_status_check;
ALTER TABLE social_bericht_kanalen
  ADD CONSTRAINT social_bericht_kanalen_plaatsing_status_check
  CHECK (plaatsing_status IN ('wachtend','bezig','geplaatst','concept_klaargezet','mislukt'));

ALTER TABLE social_berichten
  DROP CONSTRAINT IF EXISTS social_berichten_status_check;
ALTER TABLE social_berichten
  ADD CONSTRAINT social_berichten_status_check
  CHECK (status IN ('concept','klaar','gepland','geplaatst','deels_geplaatst','mislukt'));
