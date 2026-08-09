-- Task: signaleer ritten buiten werktijd (WAGENPARK_01 buiten-scope).
-- Configureerbare werktijdvensters: één organisatiestandaard (voertuig_id NULL)
-- en optionele voertuigspecifieke uitzonderingen. Voertuiggericht — geen
-- persoonsgerichte controle (privacy-by-design, zie AVG-logboek).

CREATE TABLE IF NOT EXISTS wagenpark_werktijdvensters (
  id            serial PRIMARY KEY,
  voertuig_id   integer REFERENCES voertuigen(id) ON DELETE CASCADE,
  werkdagen     integer[] NOT NULL DEFAULT '{1,2,3,4,5}',
  start_tijd    text NOT NULL DEFAULT '07:00',
  eind_tijd     text NOT NULL DEFAULT '18:00',
  actief        boolean NOT NULL DEFAULT true,
  aangemaakt_op timestamp NOT NULL DEFAULT now(),
  bijgewerkt_op timestamp NOT NULL DEFAULT now()
);

-- Eén venster per voertuig, en één organisatiestandaard.
CREATE UNIQUE INDEX IF NOT EXISTS wagenpark_werktijdvensters_voertuig_uniek
  ON wagenpark_werktijdvensters (voertuig_id)
  WHERE voertuig_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS wagenpark_werktijdvensters_org_uniek
  ON wagenpark_werktijdvensters ((1))
  WHERE voertuig_id IS NULL;
