-- REGISTER_01: een eenmalige, hervatbare productierun voor de historische
-- hergrading. De inhoudelijke registerdata blijft door dezelfde TypeScript-
-- motor worden beoordeeld; deze tabel voorkomt dat een latere deploy die
-- eenmalige momentopname opnieuw over nieuwere oordelen heen schrijft.

CREATE TABLE IF NOT EXISTS acceptatie_register_hergradeer_runs (
  sleutel text PRIMARY KEY,
  status text NOT NULL,
  gestart_op timestamp NOT NULL DEFAULT now(),
  voltooid_op timestamp,
  samenvatting jsonb,
  CONSTRAINT acceptatie_register_hergradeer_runs_status_check
    CHECK (status IN ('bezig', 'mislukt', 'voltooid'))
);