-- UITROL_BEWAKING_01: terugmeldingen van de deploy-workflow.
-- De workflow POST't na elke uitrol het verwachte commit + resultaat; de
-- bewakingsloop vergelijkt met de draaiende versie en stuurt de werkbak aan.
CREATE TABLE IF NOT EXISTS uitrol_rapporten (
  id serial PRIMARY KEY,
  commit_sha text NOT NULL,
  conclusie text NOT NULL,
  run_id bigint,
  falende_stap text,
  run_url text,
  gemeld_op timestamp NOT NULL DEFAULT now()
);
