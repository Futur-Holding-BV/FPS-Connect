-- UREN_01 §4 — overwerkslot per project (standaard dicht, altijd met einde).
CREATE TABLE IF NOT EXISTS overwerk_sloten (
  id serial PRIMARY KEY,
  project_id integer NOT NULL REFERENCES projecten(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'aangevraagd',
  geldig_van text,
  geldig_tot text,
  uren_plafond real,
  verbruikte_uren real NOT NULL DEFAULT 0,
  reden text,
  aangevraagd_door_id integer REFERENCES gebruikers(id) ON DELETE SET NULL,
  aangevraagd_op timestamp,
  motivatie_aanvraag text,
  geopend_door_id integer REFERENCES gebruikers(id) ON DELETE SET NULL,
  geopend_op timestamp,
  gesloten_door_id integer REFERENCES gebruikers(id) ON DELETE SET NULL,
  gesloten_op timestamp,
  aangemaakt_op timestamp NOT NULL DEFAULT now(),
  bijgewerkt_op timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS overwerk_sloten_project_idx ON overwerk_sloten (project_id, status);
