/**
 * LOON_02A — volledige oplevermeting en koppeling aan REGISTER_01.
 *
 * De registerpromotie gebeurt uitsluitend nadat databasebewijs, regressies,
 * typechecks en schemadriftcontrole allemaal groen zijn. Een gedeeltelijke of
 * falende run schrijft geen groen bewijs.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { db, acceptatieRegisterTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { registreerGroenBewijs } from "./lib/acceptatieregisterBewijs";

const ROOT = path.resolve(process.cwd(), "..");
const OPDRACHT = "LOON_02";
const SCRIPT_PAD = "scripts/src/verificatie-loon02a-acceptatie.ts";

const PUNTEN = [
  "Er is een CAO-catalogus; iedere werkgever en aanstelling verwijst ernaar en de drie werkmaatschappijen hebben exact de voorgeschreven CAO.",
  "Werkgevers bevatten de gevalideerde fiscale inhoudingsplichtigegegevens voor loonheffingen, sector, risicogroep, tijdvak, eigenrisicodragerschap en LKV.",
  "Een medewerker kan per werkgever meerdere inkomstenverhoudingen hebben met uniek volgnummer en verplichte, wederzijds bewaakte aanstellingskoppeling.",
  "Loonafspraken zijn per inkomstenverhouding en ingangsdatum in centen vastgelegd en databasebreed append-only.",
  "Jaarbronnen en jaarparameters bewaren officiële bronmetadata, SHA-256, laadmoment en precieze vindplaats zonder fiscale constants in programmacode.",
  "De officiële inleesweg valideert het gepinde zeven-bronnenmanifest en vervangt een jaar uitsluitend deterministisch en atomair.",
  "Het parameterscherm toont volledigheid, laadmoment, bronbestand, hash, vindplaatsen en niet-herleidbare regels.",
  "Ontbrekende, onvolledige, gewijzigde of niet-herleidbare jaarparameters blokkeren gereedheid zonder terugval naar een vorig jaar.",
  "Per inkomstenverhouding en kalenderjaar bestaat één loonstaat met databasegevalideerde maand- of vierwekentijdvakken.",
  "Ontbrekende bronvindplaats leidt tot niet_berekend met reden; LOON_02A accepteert geen clientgeschreven rekenuitkomsten.",
  "De module heeft schermen voor Inhoudingsplichtigen, Inkomstenverhoudingen, Loonafspraken, Jaarparameters en Loonstaten.",
  "Alleen hoofdbeheerder en het systeemprofiel Externe boekhouder krijgen menu-, web- en API-toegang; een los handmatig recht wordt geweigerd.",
  "De opleverdocumentatie noemt schermen, routes en de uit zeven officiële bestanden geladen jaarset 2026.",
  "Schema-, migratie-, API-, toegang-, import-, provenance- en regressiecontroles zijn groen; de bestaande loonstroom blijft werken.",
] as const;

const RELEVANTE_PADEN = [
  ".github/workflows/ci.yml",
  "lib/db/src/migrations/0115_loonfundament.sql",
  "lib/db/src/schema/loonfundament.ts",
  "lib/db/src/schema/hrm.ts",
  "lib/permissies/src/index.ts",
  "artifacts/api-server/src/middlewares/auth.ts",
  "artifacts/api-server/src/routes/auth.ts",
  "artifacts/api-server/src/routes/loonfundament.ts",
  "artifacts/api-server/src/services/loonfundament-import.ts",
  "artifacts/api-server/src/scripts/verificatie-loonfundament.ts",
  "artifacts/firevault/src/pages/loonfundament/index.tsx",
  "artifacts/firevault/src/context/rol-context.tsx",
  "artifacts/firevault/src/layouts/beheerder-layout.tsx",
  "artifacts/firevault/src/routes/connect-routes.tsx",
  "lib/api-spec/openapi.yaml",
  "docs/loonfundament.md",
  "docs/changelog.md",
] as const;

function draai(naam: string, argumenten: string[]): void {
  console.log(`\n══ ${naam} ══`);
  const resultaat = spawnSync("pnpm", argumenten, {
    cwd: ROOT,
    env: process.env,
    stdio: "inherit",
  });
  if (resultaat.status !== 0) {
    throw new Error(`${naam} faalde met exitcode ${resultaat.status ?? "onbekend"}`);
  }
}

draai("Echt PostgreSQL-bewijs LOON_02A", [
  "--filter", "@workspace/api-server", "exec", "tsx",
  "src/scripts/verificatie-loonfundament.ts",
]);
draai("Bestaande SCAB/SEPA-loonintake", [
  "--filter", "@workspace/api-server", "exec", "tsx",
  "src/verificatie-loon-sepa-intake.ts",
]);
draai("Volledige regressietests", ["test"]);
draai("Workspace-typecheck", ["run", "typecheck"]);
draai("Schemadriftcontrole", ["--filter", "@workspace/db", "run", "drift-check"]);

const beoordeeldOp = new Date();
for (const [index, omschrijving] of PUNTEN.entries()) {
  await db
    .insert(acceptatieRegisterTable)
    .values({
      opdrachtCode: OPDRACHT,
      puntNummer: index + 1,
      omschrijving,
      stand: "onbewezen",
      bewijsVindplaats: SCRIPT_PAD,
      bronBestand: "docs/loonfundament.md",
      bronSoort: "bewijsscript",
      bronDatum: beoordeeldOp,
      laatsteCodeWijzigingOp: beoordeeldOp,
      relevanteCodepaden: [...RELEVANTE_PADEN, SCRIPT_PAD],
      beoordeeldOp,
    })
    .onConflictDoUpdate({
      target: [acceptatieRegisterTable.opdrachtCode, acceptatieRegisterTable.puntNummer],
      set: {
        omschrijving,
        bijgewerktOp: sql`now()`,
      },
    });
}

const bijgewerkt = await registreerGroenBewijs({
  opdrachtCode: OPDRACHT,
  puntNummers: PUNTEN.map((_, index) => index + 1),
  scriptPad: SCRIPT_PAD,
  relevanteCodepaden: [...RELEVANTE_PADEN],
  volledigGeslaagd: true,
  toelichting:
    "Volledige LOON_02A-run: echt PostgreSQL-bewijs, profielpoort, gepind bronmanifest, loonstaatinvarianten, loonstroomregressies, typecheck en schemadrift groen.",
  bronBestand: "docs/loonfundament.md",
  runOp: beoordeeldOp,
});

if (bijgewerkt !== PUNTEN.length) {
  throw new Error(`Acceptatieregister werkte ${bijgewerkt}/${PUNTEN.length} punten bij`);
}
console.log(`\nLOON_02A: ${bijgewerkt} acceptatiepunten groen vastgelegd.`);