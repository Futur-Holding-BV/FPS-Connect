VOEG UITSLUITEND DE ONTBREKENDE INDEXEN TOE. GEEN ANDERE SCHEMAWIJZIGINGEN.

Zie docs/OMGEVINGSBEWUSTZIJN.md: deze wijziging merget rechtstreeks 
door naar productie op kantoor zodra de taak is voltooid.

PROBLEEM
technische-schuld.md #1-7 (P1): de volgende tabellen missen een index 
die elders in het schema wél consequent wordt toegepast (zie bijv. 
lib/db/src/schema/audit.ts, gebruikers.ts als referentiepatroon):

1. lib/db/src/schema/voorzieningen.ts — index op gebouw_id
2. lib/db/src/schema/activiteiten.ts — index op gebouw_id + aangemaakt_op
3. lib/db/src/schema/inspecties.ts — index op gebouw_id + type
4. lib/db/src/schema/onderhoud.ts — index op gebouw_id + status + deadline
5. lib/db/src/schema/chat.ts — index op gesprek_id + aangemaakt_op
6. lib/db/src/schema/documenten.ts — index op object_type + object_id 
   (document_koppelingen) en entiteit_type + entiteit_id (documenten)

FASE 1 — SCHEMA
Voeg per tabel de ontbrekende index() toe, in dezelfde stijl als 
audit.ts/gebruikers.ts (benoemde index, bijv. "voorzieningen_gebouw_idx").

FASE 2 — MIGRATIE
Genereer de Drizzle-migratie. Voer uit tegen de Replit-testdatabase 
eerst. Vermeld expliciet dat dit de Replit-DB is, niet de VPS-DB 
(zie docs/OMGEVINGSBEWUSTZIJN.md).

FASE 3 — NIET RAKEN
- Geen wijziging aan kolomtypes, constraints, of bestaande data;
- Geen wijziging aan routes/queries zelf — puur de index toevoegen.

TESTEN
Bevestig via EXPLAIN ANALYZE op de betreffende queries (spotlijst per 
gebouw, activiteitenfeed, inspectiefilter, onderhoud-dashboard, 
chat-polling, DMS-koppeling) dat de index daadwerkelijk gebruikt wordt 
(geen Seq Scan meer op deze kolommen bij een representatieve datamix).

ACCEPTATIE
- alle 7 genoemde indexen bestaan aantoonbaar in het schema;
- migratie is toegepast op de Replit-testdatabase;
- EXPLAIN ANALYZE toont indexgebruik i.p.v. full table scan voor de 
  genoemde queries.

LEVER
- gewijzigde schemabestanden (diff);
- de gegenereerde migratie;
- EXPLAIN ANALYZE vóór/na per query;
- commit-hash zodra gedeployed naar productie.