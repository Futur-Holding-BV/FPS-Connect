-- RECHTEN_HRM_02
--
-- 1. Poortwachter-mijlpalen: klaarzetten en vrijgeven worden twee handelingen
--    door twee mensen. Nieuwe kolommen voor klaarzetten, vrijgeven en
--    terugsturen. Bestaande afgeronde mijlpalen (afgerond_op gezet) blijven
--    afgerond — géén vrijgave met terugwerkende kracht.
-- 2. Profiel "HRM-adviseur": gebruikers terug naar niveau 1 (inzien) en
--    nieuwe bevoegdheid hrm_vrijgave op 3 (vrijgeven/terugsturen).
-- 3. Profiel "Directie": hrm_vrijgave op 3.
-- 4. Bestaande accounts die uit deze profielen voortkomen (herkomst_profiel_id)
--    worden mee-bijgewerkt: gebruikers via LEAST (alleen verlagen naar 1),
--    hrm_vrijgave via GREATEST (alleen verhogen). Idempotent.

ALTER TABLE poortwachter_mijlpalen
  ADD COLUMN IF NOT EXISTS klaargezet_op timestamp,
  ADD COLUMN IF NOT EXISTS klaargezet_door_id integer REFERENCES gebruikers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vrijgegeven_door_id integer REFERENCES gebruikers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS teruggestuurd_reden text,
  ADD COLUMN IF NOT EXISTS teruggestuurd_op timestamp,
  ADD COLUMN IF NOT EXISTS teruggestuurd_door_id integer REFERENCES gebruikers(id) ON DELETE SET NULL;

-- HRM-adviseur: gebruikers -> 1 (inzien), hrm_vrijgave -> 3.
UPDATE profielen
SET bevoegdheden = jsonb_set(
      jsonb_set(
        bevoegdheden,
        '{gebruikers}',
        to_jsonb(LEAST(COALESCE((bevoegdheden->>'gebruikers')::int, 0), 1))
      ),
      '{hrm_vrijgave}',
      to_jsonb(GREATEST(COALESCE((bevoegdheden->>'hrm_vrijgave')::int, 0), 3))
    )
WHERE naam = 'HRM-adviseur' AND systeem = true;

UPDATE gebruikers
SET bevoegdheden = jsonb_set(
      jsonb_set(
        bevoegdheden,
        '{gebruikers}',
        to_jsonb(LEAST(COALESCE((bevoegdheden->>'gebruikers')::int, 0), 1))
      ),
      '{hrm_vrijgave}',
      to_jsonb(GREATEST(COALESCE((bevoegdheden->>'hrm_vrijgave')::int, 0), 3))
    )
WHERE herkomst_profiel_id IN (
  SELECT id FROM profielen WHERE naam = 'HRM-adviseur' AND systeem = true
);

-- Directie: hrm_vrijgave -> 3.
UPDATE profielen
SET bevoegdheden = jsonb_set(
      bevoegdheden,
      '{hrm_vrijgave}',
      to_jsonb(GREATEST(COALESCE((bevoegdheden->>'hrm_vrijgave')::int, 0), 3))
    )
WHERE naam = 'Directie' AND systeem = true;

UPDATE gebruikers
SET bevoegdheden = jsonb_set(
      bevoegdheden,
      '{hrm_vrijgave}',
      to_jsonb(GREATEST(COALESCE((bevoegdheden->>'hrm_vrijgave')::int, 0), 3))
    )
WHERE herkomst_profiel_id IN (
  SELECT id FROM profielen WHERE naam = 'Directie' AND systeem = true
);
