// REGISTER_01: lees uitsluitend en exporteer het productieregister als JSON.
import "./lib/prodGuard";
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const PRODUCTIEMODUS = process.argv.includes("--productie");
if (!PRODUCTIEMODUS || process.env.PROD_LEZEN_TOEGESTAAN !== "1") {
  throw new Error(
    "Deze registerexport vereist --productie én PROD_LEZEN_TOEGESTAAN=1; de query leest uitsluitend.",
  );
}

const uitvoerPad = process.env.ACCEPTATIEREGISTER_EXPORT_PAD
  ?? path.resolve(process.cwd(), "docs", "metingen", "ACCEPTATIEREGISTER_PRODUCTIE.json");

const r = await db.execute(sql`
  WITH momentopname AS (
    SELECT to_char(
      statement_timestamp() AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    ) AS database_exportmoment_utc
  )
  SELECT
    acceptatie_register.id,
    acceptatie_register.opdracht_code,
    acceptatie_register.punt_nummer,
    acceptatie_register.omschrijving,
    acceptatie_register.stand,
    acceptatie_register.bewijs_vindplaats,
    acceptatie_register.bron_bestand,
    acceptatie_register.bron_soort,
    acceptatie_register.bron_datum,
    acceptatie_register.laatste_code_wijziging_op,
    acceptatie_register.relevante_codepaden,
    acceptatie_register.beoordeeld_op,
    acceptatie_register.toelichting,
    acceptatie_register.aangemaakt_op,
    acceptatie_register.bijgewerkt_op,
    (acceptatie_register.bron_datum >= acceptatie_register.laatste_code_wijziging_op) AS bewijs_actueel,
    momentopname.database_exportmoment_utc
  FROM acceptatie_register
  CROSS JOIN momentopname
  ORDER BY acceptatie_register.opdracht_code, acceptatie_register.punt_nummer
`);

const regels = r.rows.map(({ database_exportmoment_utc: _exportmoment, ...regel }) => regel);
const exportmoment = r.rows[0]?.database_exportmoment_utc;
if (!exportmoment) throw new Error("Het acceptatieregister bevat geen regels; productiesnapshot geweigerd.");

const standen = ["gehaald", "niet_gebouwd", "onbewezen", "wacht_op_rene"] as const;
const verdeling = Object.fromEntries(standen.map((stand) => [stand, 0])) as Record<(typeof standen)[number], number>;
const sleutels = new Set<string>();
for (const regel of regels) {
  const stand = regel.stand;
  if (typeof stand !== "string" || !standen.includes(stand as (typeof standen)[number])) {
    throw new Error(`Onbekende registerstand: ${String(stand)}`);
  }
  verdeling[stand as keyof typeof verdeling]++;
  const sleutel = `${regel.opdracht_code}#${regel.punt_nummer}`;
  if (sleutels.has(sleutel)) throw new Error(`Dubbele registersleutel: ${sleutel}`);
  sleutels.add(sleutel);
}

const werkboomCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: process.cwd(),
  encoding: "utf8",
}).trim();
const momentopname = {
  soort: "acceptatieregister-productie",
  exportmoment_utc: exportmoment,
  werkboom_commit: werkboomCommit,
  totaal_regels: regels.length,
  unieke_sleutels: sleutels.size,
  standen: verdeling,
  query: "uitsluitend SELECT; vaste sortering opdracht_code, punt_nummer",
  regels,
};

mkdirSync(path.dirname(uitvoerPad), { recursive: true });
writeFileSync(uitvoerPad, `${JSON.stringify(momentopname, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  uitvoer: uitvoerPad,
  exportmoment_utc: exportmoment,
  werkboom_commit: werkboomCommit,
  totaal_regels: regels.length,
  unieke_sleutels: sleutels.size,
  standen: verdeling,
}, null, 2));
