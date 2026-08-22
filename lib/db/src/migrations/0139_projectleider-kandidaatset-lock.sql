-- PROJ_1200 — serialiseer elke mutatie die de Projectleider-kandidaatset kan
-- veranderen met projectaanmaak en projectleider-toewijzing.
--
-- De centrale projectservice neemt dezelfde transactionele advisory lock
-- (namespace 1200, sleutel 1) vóór kandidaatresolutie. Statement-triggers
-- nemen hem vóór elke INSERT/UPDATE/DELETE, zodat ook activaties, nieuwe
-- medewerkers, nieuwe aanstellingen en functiewijzigingen geen phantom tussen
-- controle en projectcommit kunnen veroorzaken.

CREATE OR REPLACE FUNCTION vergrendel_projectleider_kandidaatset()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(1200, 1);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_projectleider_kandidaatset_medewerkers ON medewerkers;
CREATE TRIGGER trg_projectleider_kandidaatset_medewerkers
BEFORE INSERT OR UPDATE OR DELETE ON medewerkers
FOR EACH STATEMENT
EXECUTE FUNCTION vergrendel_projectleider_kandidaatset();

DROP TRIGGER IF EXISTS trg_projectleider_kandidaatset_functies ON functies;
CREATE TRIGGER trg_projectleider_kandidaatset_functies
BEFORE INSERT OR UPDATE OR DELETE ON functies
FOR EACH STATEMENT
EXECUTE FUNCTION vergrendel_projectleider_kandidaatset();

DROP TRIGGER IF EXISTS trg_projectleider_kandidaatset_aanstellingen ON medewerker_aanstellingen;
CREATE TRIGGER trg_projectleider_kandidaatset_aanstellingen
BEFORE INSERT OR UPDATE OR DELETE ON medewerker_aanstellingen
FOR EACH STATEMENT
EXECUTE FUNCTION vergrendel_projectleider_kandidaatset();