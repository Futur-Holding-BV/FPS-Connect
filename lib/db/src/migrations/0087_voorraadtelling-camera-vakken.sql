-- VOORRAADTELLING fase 2: camera-telling met vakken tekenen op de foto.
-- Vakken (getekende rechthoeken op een stellingfoto) horen bij een open telling;
-- AI-telvoorstellen per vak staan als jsonb op het vak (voorstel → mens bevestigt).
-- Bevestigde regels krijgen een BEVROREN snapshot van foto + vakcoördinaten in
-- voorraad_telling_regels.bron_vakken (geen FK-afhankelijkheid, leesbaar na vaststellen).

CREATE TABLE voorraad_telling_vakken (
  id                 serial PRIMARY KEY,
  telling_id         integer NOT NULL REFERENCES voorraad_tellingen(id) ON DELETE CASCADE,
  foto_pad           text NOT NULL,
  aanduiding         text NOT NULL,
  locatie_id         integer REFERENCES magazijn_locaties(id) ON DELETE SET NULL,
  -- Vakcoördinaten als fractie van de foto (0..1), onafhankelijk van weergavegrootte
  x                  numeric(7,4) NOT NULL,
  y                  numeric(7,4) NOT NULL,
  breedte            numeric(7,4) NOT NULL,
  hoogte             numeric(7,4) NOT NULL,
  status             text NOT NULL DEFAULT 'analyseren', -- analyseren | gereed | analysefout
  ai_voorstellen     jsonb,
  aangemaakt_door_id integer REFERENCES gebruikers(id) ON DELETE SET NULL,
  aangemaakt_op      timestamp NOT NULL DEFAULT now()
);

CREATE INDEX voorraad_telling_vakken_telling_idx ON voorraad_telling_vakken(telling_id);

-- Bevroren bron-verwijzing op de tellingregel: [{vak_id, foto_pad, aanduiding, x, y, breedte, hoogte}]
ALTER TABLE voorraad_telling_regels ADD COLUMN bron_vakken jsonb;
