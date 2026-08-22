---
name: Drizzle PostgreSQL-fouten onder cause
description: Gerichte constraintfouten betrouwbaar herkennen wanneer Drizzle de driverfout inpakt.
---

Lees PostgreSQL-code en constraintnaam niet alleen van de bovenste fout, maar unwrap ook `error.cause` voordat een route een gerichte status of foutcode kiest.

**Why:** Drizzle kan de oorspronkelijke driverfout inpakken; alleen de bovenste fout inspecteren verandert een bedoelde conflictrespons dan stil in een generieke serverfout.

**How to apply:** Gebruik een kleine, defensieve unwrap voor bekende PostgreSQL-velden zoals `code` en `constraint`, en laat onbekende fouten via de normale foutafhandeling lopen.