// REGISTER_01: dump het register als JSON naar /tmp/acceptatieregister.json
import { writeFileSync } from "node:fs";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const r = await db.execute(sql`
  SELECT
    opdracht_code,
    punt_nummer,
    omschrijving,
    stand,
    bewijs_vindplaats,
    bron_bestand,
    bron_soort,
    bron_datum,
    laatste_code_wijziging_op,
    relevante_codepaden,
    beoordeeld_op,
    toelichting,
    bijgewerkt_op,
    (bron_datum >= laatste_code_wijziging_op) AS bewijs_actueel
  FROM acceptatie_register
  ORDER BY opdracht_code, punt_nummer
`);
writeFileSync("/tmp/acceptatieregister.json", JSON.stringify(r.rows, null, 1));
console.log(`geschreven: ${r.rows.length} regels`);
process.exit(0);
