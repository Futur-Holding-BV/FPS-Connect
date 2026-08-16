-- Documenten per bedrijfsverzekering (polis, voorblad, premie-opbouw, uitsluitingen, overig)
CREATE TABLE IF NOT EXISTS org_verzekering_documenten (
  id serial PRIMARY KEY,
  verzekering_id integer NOT NULL REFERENCES org_verzekeringen(id) ON DELETE CASCADE,
  soort text NOT NULL DEFAULT 'overig',
  naam text NOT NULL,
  bestand_pad text NOT NULL,
  gearchiveerd boolean NOT NULL DEFAULT false,
  aangemaakt_op timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS org_verzekering_documenten_verzekering_idx
  ON org_verzekering_documenten (verzekering_id);
