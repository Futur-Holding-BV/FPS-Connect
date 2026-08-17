-- DEFECT: datumkolommen op medewerkers zijn text; de dossier-AI/invoer kon een
-- onzinjaartal wegschrijven (waargenomen: uit_dienst_per '82026-07-14', getoond
-- als "14 jul 82026"). De API valideert vanaf nu (JJJJ-MM-DD, jaartal
-- 1900–2100); deze migratie heelt bestaande rijen door onzinwaarden te wissen
-- (NULL = onbekend, fail-closed — een fout jaartal is geen bruikbare datum).
-- Idempotent: geldige waarden blijven byte-identiek staan.

UPDATE medewerkers SET in_dienst_sinds = NULL
 WHERE in_dienst_sinds IS NOT NULL
   AND (in_dienst_sinds !~ '^\d{4}-\d{2}-\d{2}$'
        OR substring(in_dienst_sinds from 1 for 4)::int NOT BETWEEN 1900 AND 2100);

UPDATE medewerkers SET uit_dienst_per = NULL
 WHERE uit_dienst_per IS NOT NULL
   AND (uit_dienst_per !~ '^\d{4}-\d{2}-\d{2}$'
        OR substring(uit_dienst_per from 1 for 4)::int NOT BETWEEN 1900 AND 2100);

UPDATE medewerkers SET geboortedatum = NULL
 WHERE geboortedatum IS NOT NULL
   AND (geboortedatum !~ '^\d{4}-\d{2}-\d{2}$'
        OR substring(geboortedatum from 1 for 4)::int NOT BETWEEN 1900 AND 2100);

UPDATE medewerkers SET rijbewijs_vervaldatum = NULL
 WHERE rijbewijs_vervaldatum IS NOT NULL
   AND (rijbewijs_vervaldatum !~ '^\d{4}-\d{2}-\d{2}$'
        OR substring(rijbewijs_vervaldatum from 1 for 4)::int NOT BETWEEN 1900 AND 2100);

UPDATE medewerkers SET vca_vervaldatum = NULL
 WHERE vca_vervaldatum IS NOT NULL
   AND (vca_vervaldatum !~ '^\d{4}-\d{2}-\d{2}$'
        OR substring(vca_vervaldatum from 1 for 4)::int NOT BETWEEN 1900 AND 2100);

UPDATE medewerkers SET ehbo_vervaldatum = NULL
 WHERE ehbo_vervaldatum IS NOT NULL
   AND (ehbo_vervaldatum !~ '^\d{4}-\d{2}-\d{2}$'
        OR substring(ehbo_vervaldatum from 1 for 4)::int NOT BETWEEN 1900 AND 2100);

UPDATE medewerkers SET bhv_vervaldatum = NULL
 WHERE bhv_vervaldatum IS NOT NULL
   AND (bhv_vervaldatum !~ '^\d{4}-\d{2}-\d{2}$'
        OR substring(bhv_vervaldatum from 1 for 4)::int NOT BETWEEN 1900 AND 2100);
