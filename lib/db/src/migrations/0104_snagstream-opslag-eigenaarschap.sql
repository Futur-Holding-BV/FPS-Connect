-- SNAGSTREAM_ARCHIEF_01
-- Legacy rapporten bevatten historisch een client-supplied pdf_url. Markeer die
-- daarom fail-closed als onbeheerd; alleen de nieuwe uploadtokenketen zet true.
ALTER TABLE snagstream_rapporten
  ADD COLUMN IF NOT EXISTS opslag_beheerd boolean NOT NULL DEFAULT false;