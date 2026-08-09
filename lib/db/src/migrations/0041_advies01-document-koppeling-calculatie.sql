-- ADVIES_01 fase B — koppel een adviesrapport aan de calculatie waaruit het is
-- ingelezen (§4.5/§8.10). document_koppelingen is polymorf; het bestaande
-- CHECK-constraint op doel_type moet 'calculatie' toestaan. Additief en
-- genummerd (drift-gecheckt, GEEN drizzle push).
--
-- Het constraint kan onder verschillende namen bestaan afhankelijk van hoe het
-- oorspronkelijk is aangemaakt (dms-uitbreiding.sql gaf de expliciete naam
-- 'document_koppelingen_doel_type_check'). We droppen de bekende naam als die
-- bestaat en zetten het opnieuw met de uitgebreide lijst.
ALTER TABLE document_koppelingen
  DROP CONSTRAINT IF EXISTS document_koppelingen_doel_type_check;

ALTER TABLE document_koppelingen
  ADD CONSTRAINT document_koppelingen_doel_type_check
  CHECK (doel_type IN (
    'gebouw','klant','offerte','dossier','voorziening',
    'opdracht','voertuig','prijsafspraak','calculatie'
  ));
