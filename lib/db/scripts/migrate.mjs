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
  // RAISE NOTICE uit migraties zichtbaar maken in de (deploy)log — migraties
  // rapporteren er hun tellingen mee (bv. 0081: bijgewerkte accounts).
  client.on("notice", (melding) => {
    console.log(`[migrate] NOTICE: ${melding.message}`);
  });
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

    // Stap 2b: gerichte reconciliatie van bekende hernummeringen.
    // Bij een nummerbotsing na parallelle merges wordt het NIEUWE bestand
    // hernummerd (zie check-migratie-hernoeming). Databases die de migratie al
    // onder de oude naam draaiden (dev/CI) worden hier — uitsluitend voor
    // exact deze paren en alleen bij identieke checksum — omgezet naar de
    // nieuwe naam. Productie zonder oude registratie merkt hier niets van en
    // voert het bestand gewoon onder de nieuwe naam uit.
    const HERNUMMERD = [
      {
        oud: "0083_voorraadtelling-en-magazijn-exact.sql",
        nieuw: "0085_voorraadtelling-en-magazijn-exact.sql",
        reden: "nummerbotsing met 0083_zzp-bedrijfsnaam (18-08-2026)",
      },
      {
        oud: "0087_accountview-boeking-bewijs.sql",
        nieuw: "0095_accountview-boeking-bewijs.sql",
        reden: "nummerbotsing met 0087_externe-adviseurs (19-08-2026, merge taak-omgeving)",
      },
      {
        oud: "0087_voorraadtelling-camera-vakken.sql",
        nieuw: "0096_voorraadtelling-camera-vakken.sql",
        reden: "nummerbotsing met 0087_externe-adviseurs (19-08-2026, merge taak-omgeving)",
      },
      {
        oud: "0088_voorraadtelling-foto-claims.sql",
        nieuw: "0097_voorraadtelling-foto-claims.sql",
        reden: "nummerbotsing met 0088_grootboekrekeningen (19-08-2026, merge taak-omgeving)",
      },
      {
        oud: "0083_zzp-bedrijfsnaam.sql",
        nieuw: "0098_zzp-bedrijfsnaam.sql",
        reden: "hernummerd naar 0098 na opeenvolgende botsingen (18-08-2026)",
      },
      {
        oud: "0086_zzp-bedrijfsnaam.sql",
        nieuw: "0098_zzp-bedrijfsnaam.sql",
        reden: "nummerbotsing met 0086_toolbox-maand-status-uniek (18-08-2026)",
      },
      {
        oud: "0087_zzp-bedrijfsnaam.sql",
        nieuw: "0098_zzp-bedrijfsnaam.sql",
        reden: "hernummerd naar 0098 wegens botsing met 0087_externe-adviseurs (18-08-2026)",
      },
      {
        oud: "0088_zzp-bedrijfsnaam.sql",
        nieuw: "0098_zzp-bedrijfsnaam.sql",
        reden: "hernummerd naar 0098 wegens botsing met 0088_grootboekrekeningen (18-08-2026)",
      },
      {
        oud: "0089_zzp-bedrijfsnaam.sql",
        nieuw: "0098_zzp-bedrijfsnaam.sql",
        reden: "hernummerd naar 0098 wegens botsing met 0089_btw-codes (18-08-2026)",
      },
      {
        oud: "0091_zzp-bedrijfsnaam.sql",
        nieuw: "0098_zzp-bedrijfsnaam.sql",
        reden: "hernummerd naar 0098 wegens botsing met 0091_uitrol-rapporten (18-08-2026)",
      },
      {
        oud: "0092_zzp-bedrijfsnaam.sql",
        nieuw: "0098_zzp-bedrijfsnaam.sql",
        reden: "hernummerd naar 0098 wegens botsing met 0092_ci-rapporten (18-08-2026)",
      },
      {
        oud: "0093_zzp-bedrijfsnaam.sql",
        nieuw: "0098_zzp-bedrijfsnaam.sql",
        reden: "hernummerd naar 0098 wegens botsing met 0093_acceptatieregister (19-08-2026)",
      },
      {
        oud: "0095_zzp-bedrijfsnaam.sql",
        nieuw: "0098_zzp-bedrijfsnaam.sql",
        reden: "hernummerd naar 0098 wegens botsing met 0095_accountview-boeking-bewijs (19-08-2026)",
      },
      {
        oud: "0101_gebruikers01_v2_functiehuis_rechten.sql",
        nieuw: "0105_gebruikers01_v2_functiehuis_rechten.sql",
        reden: "nummerbotsing met 0101_snagstream-vingerafdruk (19-08-2026, parallelle merge)",
        oudeChecksum: "02c4f4ffd311b99d5c23cc2a36e90286ab5398320f53fcdc58ff85290a9b4970",
      },
      {
        oud: "0105_werkbak-concrete-actie-paden.sql",
        nieuw: "0106_werkbak-concrete-actie-paden.sql",
        reden: "nummerbotsing met 0105_gebruikers01_v2_functiehuis_rechten (20-08-2026, parallelle merge)",
        oudeChecksum: "651714b9bfc7b907d6dd5d5f95826bc656a364aa9864b075a2018ef5557d374a",
      },
      {
        oud: "0107_werkbak-concrete-actie-paden.sql",
        nieuw: "0106_werkbak-concrete-actie-paden.sql",
        reden: "tussenversie tijdens taakrebase teruggebracht naar de canonieke hoofdtaknaam (20-08-2026)",
        oudeChecksum: "651714b9bfc7b907d6dd5d5f95826bc656a364aa9864b075a2018ef5557d374a",
      },
      {
        oud: "0105_acceptatieregister_hergradeerbaar.sql",
        nieuw: "0111_acceptatieregister_hergradeerbaar.sql",
        reden: "doorgeschoven na opeenvolgende nummerbotsingen met 0105 en 0108 (20-08-2026, taakrebase)",
      },
      {
        oud: "0108_acceptatieregister_hergradeerbaar.sql",
        nieuw: "0111_acceptatieregister_hergradeerbaar.sql",
        reden: "nummerbotsing met 0108_productrapport-inventaris-status (20-08-2026, taakrebase)",
      },
      {
        oud: "0106_acceptatieregister_relevante_codepaden.sql",
        nieuw: "0112_acceptatieregister_relevante_codepaden.sql",
        reden: "doorgeschoven om de acceptatieregister-migratievolgorde te behouden (20-08-2026, taakrebase)",
      },
      {
        oud: "0109_acceptatieregister_relevante_codepaden.sql",
        nieuw: "0112_acceptatieregister_relevante_codepaden.sql",
        reden: "volgorde behouden na hernummering van de acceptatieregister-basismigratie (20-08-2026, taakrebase)",
      },
      {
        oud: "0110_acceptatieregister-hergradeer-runs.sql",
        nieuw: "0113_acceptatieregister-hergradeer-runs.sql",
        reden: "volgorde behouden na hernummering van de acceptatieregister-hergraderingsketen (20-08-2026, taakrebase)",
      },
      {
        oud: "0101_creditfacturen.sql",
        nieuw: "0111_creditfacturen.sql",
        reden: "nummerbotsing met 0101_snagstream-vingerafdruk (19-08-2026)",
      },
      {
        oud: "0105_creditfacturen.sql",
        nieuw: "0111_creditfacturen.sql",
        reden: "opnieuw hernummerd na parallelle 0105-gebruikersmigratie (20-08-2026)",
      },
      {
        oud: "0107_creditfacturen.sql",
        nieuw: "0111_creditfacturen.sql",
        reden: "nummerbotsing met 0107_document-migratie-inventaris (20-08-2026, parallelle merge)",
      },
      {
        oud: "0102_factuur_bv_momentopname.sql",
        nieuw: "0112_factuur_bv_momentopname.sql",
        reden: "nummerbotsing met 0102_snagstream-pending-uploads (19-08-2026)",
      },
      {
        oud: "0106_factuur_bv_momentopname.sql",
        nieuw: "0112_factuur_bv_momentopname.sql",
        reden: "opnieuw hernummerd na parallelle 0106-werkbakmigratie (20-08-2026)",
      },
      {
        oud: "0108_factuur_bv_momentopname.sql",
        nieuw: "0112_factuur_bv_momentopname.sql",
        reden: "nummerbotsing met 0108_productrapport-inventaris-status (20-08-2026, parallelle merge)",
      },
      {
        oud: "0103_legacy_factuur_bv_fail_closed.sql",
        nieuw: "0113_legacy_factuur_bv_fail_closed.sql",
        reden: "nummerbotsing met 0103_snagstream-upload-opruimretry (19-08-2026)",
      },
      {
        oud: "0107_legacy_factuur_bv_fail_closed.sql",
        nieuw: "0113_legacy_factuur_bv_fail_closed.sql",
        reden: "opnieuw hernummerd zodat de creditmigraties aaneengesloten op 0107-0109 staan (20-08-2026)",
      },
      {
        oud: "0109_legacy_factuur_bv_fail_closed.sql",
        nieuw: "0113_legacy_factuur_bv_fail_closed.sql",
        reden: "creditmigraties opnieuw aaneengesloten na parallelle 0107-0108 migraties (20-08-2026)",
      },
      {
        oud: "0110_creditfactuur_fiscale_integriteit.sql",
        nieuw: "0114_creditfactuur_fiscale_integriteit.sql",
        reden: "creditmigraties opnieuw aaneengesloten na parallelle 0107-0108 migraties (20-08-2026)",
      },
    ];
    for (const h of HERNUMMERD) {
      const rij = await client.query("SELECT checksum FROM schema_migraties WHERE naam = $1", [h.oud]);
      if (rij.rowCount === 0) continue;
      const alNieuw = await client.query("SELECT 1 FROM schema_migraties WHERE naam = $1", [h.nieuw]);
      if (alNieuw.rowCount > 0) {
        console.error(`[migrate] STOP: zowel ${h.oud} als ${h.nieuw} geregistreerd — handmatig uitzoeken.`);
        process.exit(1);
      }
      const nieuwSum = checksum(readFileSync(path.join(MIGRATIES_MAP, h.nieuw), "utf8"));
      const toegestaneChecksums = new Set([nieuwSum, h.oudeChecksum].filter(Boolean));
      if (rij.rows[0].checksum && !toegestaneChecksums.has(rij.rows[0].checksum)) {
        console.error(`[migrate] STOP: ${h.oud} is geregistreerd met een afwijkende checksum t.o.v. ${h.nieuw} — geen automatische hernoeming.`);
        process.exit(1);
      }
      await client.query(
        "UPDATE schema_migraties SET naam = $1, opmerking = concat_ws(' — ', opmerking, $3::text) WHERE naam = $2",
        [h.nieuw, h.oud, `hernummerd van ${h.oud} (${h.reden})`],
      );
      console.log(`[migrate] Reconciliatie: registratie ${h.oud} hernoemd naar ${h.nieuw} (identieke checksum).`);
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
