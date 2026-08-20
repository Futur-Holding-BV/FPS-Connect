-- Operationele verantwoordelijkheden mogen nooit aan een inactief,
-- gearchiveerd of geanonimiseerd bewijsanker worden gekoppeld.
CREATE OR REPLACE FUNCTION assert_toewijsbare_gebruiker()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  kolom text;
  doel_id integer;
BEGIN
  FOREACH kolom IN ARRAY TG_ARGV LOOP
    doel_id := NULLIF(to_jsonb(NEW)->>kolom, '')::integer;
    IF doel_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
        FROM gebruikers
       WHERE id = doel_id
         AND actief = true
         AND gearchiveerd = false
         AND geanonimiseerd IS NULL
    ) THEN
      RAISE EXCEPTION 'Operationele verantwoordelijkheid kan alleen aan een actief account worden toegewezen'
        USING ERRCODE = '23514';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER gebouw_toewijzing_actief_account
BEFORE INSERT OR UPDATE ON gebouw_toewijzingen
FOR EACH ROW EXECUTE FUNCTION assert_toewijsbare_gebruiker('gebruiker_id');

CREATE TRIGGER voorziening_toewijzing_actief_account
BEFORE INSERT OR UPDATE ON voorzieningen
FOR EACH ROW EXECUTE FUNCTION assert_toewijsbare_gebruiker('monteur_id', 'controleur_id');

CREATE TRIGGER werkbon_toewijzing_actief_account
BEFORE INSERT OR UPDATE ON werkbonnen
FOR EACH ROW WHEN (NEW.status NOT IN ('afgerond', 'voltooid', 'geannuleerd'))
EXECUTE FUNCTION assert_toewijsbare_gebruiker('monteur_id');

CREATE TRIGGER crm_toewijzing_actief_account
BEFORE INSERT OR UPDATE ON crm_commercieel
FOR EACH ROW WHEN (NEW.fase NOT IN ('gewonnen', 'verloren', 'gesloten'))
EXECUTE FUNCTION assert_toewijsbare_gebruiker('verantwoordelijke_id');

CREATE TRIGGER goedkeuringsbeleid_toewijzing_actief_account
BEFORE INSERT OR UPDATE ON goedkeuring_beleidsregels
FOR EACH ROW WHEN (NEW.actief = true)
EXECUTE FUNCTION assert_toewijsbare_gebruiker(
  'goedkeurder_gebruiker_id',
  'vervanger_gebruiker_id',
  'escalatie_stap_1_gebruiker_id',
  'escalatie_stap_2_gebruiker_id'
);

CREATE TRIGGER hrm_onboarding_toewijzing_actief_account
BEFORE INSERT OR UPDATE ON hrm_onboarding_taken
FOR EACH ROW WHEN (NEW.status NOT IN ('afgerond', 'vervallen'))
EXECUTE FUNCTION assert_toewijsbare_gebruiker('verantwoordelijke_id');

CREATE TRIGGER uitvoerdersessie_toewijzing_actief_account
BEFORE INSERT OR UPDATE ON uitvoerder_sessies
FOR EACH ROW WHEN (NEW.status = 'actief')
EXECUTE FUNCTION assert_toewijsbare_gebruiker('monteur_id');

CREATE TRIGGER werk_inbox_toewijzing_actief_account
BEFORE INSERT OR UPDATE ON werk_inbox_mails
FOR EACH ROW WHEN (NEW.samenwerk_status <> 'afgehandeld')
EXECUTE FUNCTION assert_toewijsbare_gebruiker('toegewezen_aan');

CREATE TRIGGER werkbak_toewijzing_actief_account
BEFORE INSERT OR UPDATE ON werkbak_items
FOR EACH ROW WHEN (NEW.status = 'open')
EXECUTE FUNCTION assert_toewijsbare_gebruiker('gebruiker_id');

CREATE TRIGGER snagstream_upload_actief_account
BEFORE INSERT OR UPDATE ON snagstream_uploads
FOR EACH ROW EXECUTE FUNCTION assert_toewijsbare_gebruiker('gebruiker_id');