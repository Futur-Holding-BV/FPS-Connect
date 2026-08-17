-- MARKETING_01 — koppel wachtrij-items aan campagne-ontvangers zodat de
-- daadwerkelijke verzending (na goedkeuring) terug te schrijven is naar de
-- campagne en als gebeurtenis bij het contactpersoon komt.
ALTER TABLE mail_wachtrij
  ADD COLUMN IF NOT EXISTS campagne_ontvanger_id integer
    REFERENCES marketing_campagne_ontvangers(id) ON DELETE SET NULL;
