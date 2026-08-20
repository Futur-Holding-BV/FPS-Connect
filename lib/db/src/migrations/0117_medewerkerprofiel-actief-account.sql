-- Externe-adviseurherstart: een medewerkerprofiel is onverenigbaar met een
-- inactief, gearchiveerd of geanonimiseerd account.
CREATE TRIGGER medewerkerprofiel_actief_account
BEFORE INSERT OR UPDATE ON medewerkers
FOR EACH ROW
EXECUTE FUNCTION assert_toewijsbare_gebruiker('gebruiker_id');