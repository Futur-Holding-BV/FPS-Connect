// Migratierunner (SCHEMA_01) — vervangt `drizzle-kit push` in het deployproces.
//
// Werking:
// 1. Maakt (eenmalig) de tabel schema_migraties aan. Bij die eerste aanmaak
//    worden de vier basislijn-migraties (0001 t/m 0004) als reeds uitgevoerd
//    gemarkeerd: die wijzigingen zitten al in productie (zie lib/db/schema.sql,
//    het nulpunt van 7 augustus 2026) en mogen nooit opnieuw draaien.
// 2. Pre-check: staan er migraties in de tabel die niet (meer) in de repo
//    bestaan? Dan stoppen met exit 1 — de database loopt dan vóór op de code
//    en doorgaan is gokken.
// 3. Leest lib/db/src/migrations/NNNN_*.sql in oplopende volgorde en voert
//    alleen de nog niet geregistreerde uit, elk in een eigen transactie.
//    Na succes wordt de migratie geregistreerd (naam, checksum, tijdstip)
//    in dezelfde transactie — half uitgevoerd bestaat dus niet.
// 4. Idempotent: een tweede run doet niets en meldt dat expliciet.
//
// Veiligheidsprincipes:
// - Een reeds geregistreerde migratie wordt NOOIT opnieuw uitgevoerd, ook niet
//   als het bestand gewijzigd is (dat geeft wél een luide waarschuwing).
// - Geen DROP's in migraties: verwijderen gebeurt per expliciete opdracht.

import pg from "pg";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const { Pool } = pg;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[migrate] DATABASE_URL ontbreekt; stoppen.");
  process.exit(1);
}

const MIGRATIES_MAP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/migrations");

// Basislijn: stond al in productie vóór de invoering van de migratieketen.
const BASISLIJN = [
  "0001_facturen-subtype.sql",
  "0002_magazijn-accountview-export.sql",
  "0003_pim-fase-a.sql",
  "0004_vge-guidance-context.sql",
];

const pool = new Pool({ connectionString: url });

function checksum(inhoud) {
  return createHash("sha256").update(inhoud).digest("hex");
}

async function main() {
  const client = await pool.connect();
  try {
    // Stap 1: migratietabel (eenmalig), plus basislijn-registratie bij aanmaak.
    const bestondAl = await client.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='schema_migraties'",
    );
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migraties (
        id            SERIAL PRIMARY KEY,
        naam          TEXT NOT NULL UNIQUE,
        checksum      TEXT,
        uitgevoerd_op TIMESTAMPTZ NOT NULL DEFAULT now(),
        opmerking     TEXT
      );
    `);
    if (bestondAl.rowCount === 0) {
      // Veiligheidscheck vóór basislijn-stempeling: de basislijn mag alleen
      // "als reeds uitgevoerd" geregistreerd worden op een database die de
      // basislijn-wijzigingen aantoonbaar al bevat. Per basislijn-migratie
      // controleren we een kenmerkend object (sentinel). Ontbreekt er één,
      // dan stoppen we hard — anders zou een onvolledige database met exit 0
      // door de deploy glippen en start de API met ontbrekende tabellen.
      const SENTINELS = [
        { migratie: "0001_facturen-subtype.sql", soort: "kolom", tabel: "facturen", kolom: "subtype" },
        { migratie: "0002_magazijn-accountview-export.sql", soort: "kolom", tabel: "accountview_instellingen", kolom: "grootboek_voorraad" },
        { migratie: "0003_pim-fase-a.sql", soort: "tabel", tabel: "pim_modellen" },
        { migratie: "0004_vge-guidance-context.sql", soort: "tabel", tabel: "fps_visuals" },
      ];
      const ontbrekend = [];
      for (const s of SENTINELS) {
        const q = s.soort === "tabel"
          ? await client.query(
              "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1",
              [s.tabel],
            )
          : await client.query(
              "SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2",
              [s.tabel, s.kolom],
            );
        if (q.rowCount === 0) ontbrekend.push(`${s.migratie} (${s.soort} ${s.tabel}${s.kolom ? "." + s.kolom : ""} ontbreekt)`);
      }
      if (ontbrekend.length > 0) {
        console.error("[migrate] STOP: basislijn kan niet gestempeld worden — de database mist basislijn-objecten:");
        for (const o of ontbrekend) console.error(`[migrate]   - ${o}`);
        console.error("[migrate] Voer de ontbrekende basislijn-migraties eerst handmatig/gecontroleerd uit (ze zijn idempotent), of herstel de database, en draai de runner opnieuw.");
        process.exit(1);
      }
      console.log("[migrate] schema_migraties aangemaakt; basislijn-sentinels aanwezig, basislijn registreren (niet uitvoeren).");
      for (const naam of BASISLIJN) {
        let sum = null;
        try {
          sum = checksum(readFileSync(path.join(MIGRATIES_MAP, naam), "utf8"));
        } catch {
          /* bestand kan ontbreken in oudere checkouts; naam is leidend */
        }
        await client.query(
          `INSERT INTO schema_migraties (naam, checksum, opmerking)
           VALUES ($1, $2, 'basislijn — reeds uitgevoerd vóór invoering migratiehistorie (SCHEMA_01, 7 aug 2026)')
           ON CONFLICT (naam) DO NOTHING`,
          [naam, sum],
        );
      }
    }

    // Repo-bestanden inlezen, op nummer gesorteerd.
    const bestanden = readdirSync(MIGRATIES_MAP)
      .filter((f) => /^\d{4}_.+\.sql$/.test(f))
      .sort();
    const bekend = new Set(bestanden);

    // Stap 2a: gerichte reconciliatie van bekende verweesde registraties.
    // Deze namen zijn tijdens de MATERIAAL_01-fase-3-ontwikkeling tijdelijk
    // gedeployed en daarna uit de repo verwijderd/hernoemd (definitief: 0044).
    // Hun netto schema-effect is nul: 0043 voegde resultaat_inkoopbon_id toe,
    // 0048_cleanup verwijderde die kolom weer. De registratierijen blokkeren
    // echter de pre-check hieronder. Alleen exact deze namen worden opgeruimd;
    // al het overige onbekende blijft een harde STOP.
    const VERWEESD = [
      "0043_materiaal01-fase3-inkoopbon.sql",
      "0048_materiaal01-fase3-cleanup.sql",
    ];
    const opgeruimd = await client.query(
      "DELETE FROM schema_migraties WHERE naam = ANY($1::text[]) RETURNING naam",
      [VERWEESD],
    );
    for (const r of opgeruimd.rows) {
      console.log(`[migrate] Reconciliatie: verweesde registratie ${r.naam} verwijderd (netto schema-effect nul; definitieve keten gebruikt 0044).`);
    }

    // Stap 2: pre-check — geregistreerde migraties die de repo niet kent.
    const geregistreerd = await client.query("SELECT naam, checksum FROM schema_migraties ORDER BY naam");
    const onbekend = geregistreerd.rows.filter((r) => !bekend.has(r.naam));
    if (onbekend.length > 0) {
      console.error("[migrate] STOP: de database bevat migraties die niet in de repo staan:");
      for (const r of onbekend) console.error(`  - ${r.naam}`);
      console.error("[migrate] De database loopt vóór op de code. Niet doorgaan; eerst uitzoeken welke versie dit is.");
      process.exit(1);
    }
    // Waarschuwing (niet fataal) bij gewijzigde bestanden van reeds gedraaide migraties.
    for (const r of geregistreerd.rows) {
      if (!r.checksum) continue;
      const actueel = checksum(readFileSync(path.join(MIGRATIES_MAP, r.naam), "utf8"));
      if (actueel !== r.checksum) {
        console.warn(`[migrate] WAARSCHUWING: ${r.naam} is gewijzigd ná uitvoering (checksum wijkt af). Bestand wordt NIET opnieuw uitgevoerd.`);
      }
    }

    // Stap 3: openstaande migraties uitvoeren.
    const gedaan = new Set(geregistreerd.rows.map((r) => r.naam));
    const openstaand = bestanden.filter((f) => !gedaan.has(f));
    console.log(`[migrate] ${bestanden.length} migraties in repo, ${gedaan.size} geregistreerd, ${openstaand.length} openstaand.`);
    if (openstaand.length === 0) {
      console.log("[migrate] Niets te doen — schema is bij.");
      return;
    }
    for (const naam of openstaand) {
      const sql = readFileSync(path.join(MIGRATIES_MAP, naam), "utf8");
      console.log(`[migrate] Uitvoeren: ${naam} ...`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migraties (naam, checksum) VALUES ($1, $2)", [naam, checksum(sql)]);
        await client.query("COMMIT");
        console.log(`[migrate] Geslaagd en geregistreerd: ${naam}`);
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`[migrate] MISLUKT: ${naam} — teruggerold, niets geregistreerd.`);
        console.error(err);
        process.exit(1);
      }
    }
    console.log("[migrate] Alle openstaande migraties uitgevoerd.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[migrate] Onverwachte fout:", err);
  process.exit(1);
});
