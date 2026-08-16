-- MAIL-WACHTRIJ — alle systeem-/notificatiemails vereisen voortaan een
-- menselijke handeling vóór verzending. Deze tabel is de wachtrij; een
-- beheerder verstuurt of wijst af via /beheer/mail-wachtrij. De partiële
-- unieke index voorkomt dubbele wachtende mails (zelfde adres + onderwerp).
CREATE TABLE IF NOT EXISTS mail_wachtrij (
  id SERIAL PRIMARY KEY,
  naar_email TEXT NOT NULL,
  naar_naam TEXT,
  onderwerp TEXT NOT NULL,
  html TEXT NOT NULL,
  soort TEXT NOT NULL,
  bijlagen JSONB,
  status TEXT NOT NULL DEFAULT 'wachtend',
  foutdetail TEXT,
  aangevraagd_door_id INTEGER,
  verwerkt_door_id INTEGER,
  aangemaakt_op TIMESTAMP NOT NULL DEFAULT NOW(),
  verwerkt_op TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS mail_wachtrij_dedupe_idx
  ON mail_wachtrij (naar_email, onderwerp)
  WHERE status = 'wachtend';
