-- CI_SIGNAAL_01: terugmeldingen van de CI-workflow (Typecheck & build) op main.
-- De workflow POST't na elke main-run zijn conclusie; de bewakingsloop opent
-- bij rood een actiepunt bij de hoofdbeheerder en sluit het bij groen.
CREATE TABLE IF NOT EXISTS ci_rapporten (
  id serial PRIMARY KEY,
  commit_sha text NOT NULL,
  conclusie text NOT NULL,
  run_id bigint,
  run_attempt bigint,
  gefaalde_taak text,
  run_url text,
  gemeld_op timestamp NOT NULL DEFAULT now()
);
