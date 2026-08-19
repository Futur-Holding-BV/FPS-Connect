-- Bewaar mislukte objectverwijderingen zodat de periodieke opruimer kan blijven proberen.
ALTER TABLE snagstream_uploads
  ADD COLUMN IF NOT EXISTS opruim_pogingen integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opruim_laatst_geprobeerd_op timestamp,
  ADD COLUMN IF NOT EXISTS opruim_fout text;

CREATE UNIQUE INDEX IF NOT EXISTS snagstream_uploads_object_path_unique_idx
  ON snagstream_uploads (object_path);