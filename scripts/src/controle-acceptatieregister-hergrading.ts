/**
 * DB-loze CI-poort voor de hergradeerketen. De volledige API/DB-regressie staat
 * in verificatie-register01.ts; deze controle voorkomt dat inventaris,
 * scriptkoppelingen of stale-bewijsinvarianten stil uit de code verdwijnen.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { acceptatieregisterHerbeoordeling, valideerHerbeoordeling } from "./data/acceptatieregister-herbeoordeling";
import { isBronActueel, kiesSterksteActueleBron } from "./lib/acceptatieregisterBewijs";

const root = path.resolve(process.cwd(), "..");
function eis(conditie: unknown, melding: string): asserts conditie {
  if (!conditie) throw new Error(melding);
}

const validatie = valideerHerbeoordeling();
eis(validatie.geldig, validatie.fouten.join("; "));
eis(validatie.aantalRegels === 213, `Inventaris bevat ${validatie.aantalRegels} i.p.v. 213 regels.`);

for (const regel of acceptatieregisterHerbeoordeling) {
  for (const codepad of regel.relevante_codepaden) {
    eis(existsSync(path.join(root, codepad)), `Relevant codepad ontbreekt: ${codepad}`);
  }
}

const promoties = acceptatieregisterHerbeoordeling
  .filter((regel) => regel.aanbevolen_stand === "gehaald")
  .map((regel) => `${regel.opdracht_code}#${regel.punt_nummer}`)
  .sort();
eis(
  JSON.stringify(promoties) === JSON.stringify(["AKKOORD_01#1", "AKKOORD_01#2", "FACTUUR_03#1"]),
  `Onverwachte automatische promoties: ${promoties.join(", ")}`,
);
for (const regel of acceptatieregisterHerbeoordeling.filter((item) => item.aanbevolen_stand === "gehaald")) {
  eis(regel.bron_soort === "bewijsscript", `${regel.opdracht_code}#${regel.punt_nummer} promoveert zonder bewijsscript.`);
  const script = readFileSync(path.join(root, regel.bewijs_vindplaats), "utf8");
  eis(script.includes("registreerGroenBewijs"), `${regel.bewijs_vindplaats} gebruikt de centrale promotiehelper niet.`);
}
const bewijsHelper = readFileSync(path.join(root, "scripts/src/lib/acceptatieregisterBewijs.ts"), "utf8");
eis(bewijsHelper.includes("pg_advisory_xact_lock_shared"), "Groene scriptpromotie deelt het hergradeerslot niet.");
const beoordelingImport = readFileSync(path.join(root, "scripts/src/pas-beoordelingen-toe.ts"), "utf8");
eis(beoordelingImport.includes("pg_advisory_xact_lock_shared"), "Beoordelingenimport deelt het hergradeerslot niet.");

const oud = new Date("2026-08-01T00:00:00Z");
const code = new Date("2026-08-02T00:00:00Z");
const groen = new Date("2026-08-03T00:00:00Z");
eis(!isBronActueel(oud, code), "Stale-bewijscontrole accepteert ouder bewijs.");
eis(isBronActueel(groen, code), "Stale-bewijscontrole weigert nieuw bewijs.");
const sterkste = kiesSterksteActueleBron([
  { bronSoort: "antwoorddocument" as const, bronDatum: groen, laatsteCodeWijzigingOp: code },
  { bronSoort: "meetrapport" as const, bronDatum: groen, laatsteCodeWijzigingOp: code },
  { bronSoort: "code" as const, bronDatum: groen, laatsteCodeWijzigingOp: code },
  { bronSoort: "bewijsscript" as const, bronDatum: groen, laatsteCodeWijzigingOp: code },
]);
eis(sterkste?.bronSoort === "bewijsscript", "Bewijskrachtvolgorde is niet script > code > meetrapport > antwoorddocument.");

const migratieWerkbak = readFileSync(path.join(root, "lib/db/src/migrations/0111_acceptatieregister_hergradeerbaar.sql"), "utf8");
const migratiePaden = readFileSync(path.join(root, "lib/db/src/migrations/0112_acceptatieregister_relevante_codepaden.sql"), "utf8");
eis(migratiePaden.includes("acceptatie_register_gehaald_actueel_check"), "DB stale-bewijsconstraint ontbreekt.");
eis(migratiePaden.includes("cardinality(relevante_codepaden) > 0"), "DB vereist geen concrete relevante codepaden.");
eis(migratieWerkbak.includes("acceptatieregister_werkbak_sync"), "Werkbak-sync-trigger ontbreekt.");
const apiRoute = readFileSync(path.join(root, "artifacts/api-server/src/routes/acceptatieregister.ts"), "utf8");
eis(apiRoute.includes("ACCEPTATIE_BRONKRACHT"), "API dwingt de bewijskrachtvolgorde niet af.");
eis(apiRoute.includes("uitsluitend door een volledig groen gekoppeld bewijsscript"), "API blokkeert handmatig scriptbewijs niet.");
const motor = readFileSync(path.join(root, "scripts/src/herbeoordeel-acceptatieregister.ts"), "utf8");
eis(motor.includes("rij.relevanteCodepaden"), "Herbeoordelingsmotor audit niet via vastgelegde codepaden.");
eis(motor.includes("--audit-op="), "Herbeoordelingsaudit heeft geen herhaalbare auditgrens.");
eis(motor.includes("--eenmalig-productie"), "Herbeoordelingsmotor heeft geen eenmalige productieclaim.");
const deploy = readFileSync(path.join(root, "scripts/deploy-production.sh"), "utf8");
eis(deploy.includes("herbeoordeel-acceptatieregister.ts --eenmalig-productie"), "Productiedeploy voert de eenmalige hergrading niet uit.");
eis(deploy.includes("ACCEPTATIEREGISTER_GIT_ALLEEN=1"), "Productiedeploy gebruikt de read-only git-actualiteitsbron niet.");
const ci = readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
eis(ci.includes('"modus": "overgeslagen"'), "CI bewijst de idempotente tweede hergradeerrun niet.");

console.log("Acceptatieregister-hergrading: 213 regels, scriptkoppelingen, bewijskracht en stale-invarianten geldig.");