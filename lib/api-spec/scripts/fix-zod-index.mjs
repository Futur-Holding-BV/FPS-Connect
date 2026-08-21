// Orval (mode: split + schemas in types/) genereert in lib/api-zod/src/index.ts
// een dubbele export: de zod-consts in generated/api.ts en de TS-types in
// generated/types/ delen namen (bijv. ListAiVoorstellenParams) → TS2308.
// Afspraak (zie memory api-zod-types-conflict): index.ts exporteert alléén
// generated/api. Dit script herstelt dat na elke orval-run.
//
// ORVAL v8.24+ genereert Zod v4-only API's; het project gebruikt Zod v3.
// Dit script past de gegenereerde api.ts aan zodat de server niet crasht:
//   zod.int()           → zod.number().int()
//   zod.url()           → zod.string().url()
//   zod.email()         → zod.string().email()
//   zod.looseObject(    → zod.object(   (v4 looseObject ≈ v3 object passthrough)
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const hier = path.dirname(fileURLToPath(import.meta.url));
const indexPad = path.resolve(hier, "..", "..", "api-zod", "src", "index.ts");
writeFileSync(indexPad, 'export * from "./generated/api";\n');
console.log("api-zod index.ts hersteld (alleen export uit generated/api)");

// Zod v3-compatibel: vervang Zod v4-only API's
const apiPad = path.resolve(hier, "..", "..", "api-zod", "src", "generated", "api.ts");
let inhoud = readFileSync(apiPad, "utf8");
const voor = inhoud;

inhoud = inhoud.replaceAll("zod.int()", "zod.number().int()");
inhoud = inhoud.replaceAll("zod.url()", "zod.string().url()");
inhoud = inhoud.replaceAll("zod.email()", "zod.string().email()");
inhoud = inhoud.replaceAll("zod.looseObject(", "zod.object(");

if (inhoud !== voor) {
  writeFileSync(apiPad, inhoud);
  console.log("api-zod api.ts: Zod v4→v3 compat fix toegepast");
}

// Orval kan top-level gegenereerde bestanden met meerdere lege regels
// afsluiten. Normaliseer die uitvoer hier, zodat codegen reproduceerbaar blijft
// en `git diff --check` niet op generated files faalt.
const gegenereerdePaden = [
  apiPad,
  path.resolve(hier, "..", "..", "api-client-react", "src", "generated", "api.ts"),
  path.resolve(
    hier,
    "..",
    "..",
    "api-client-react",
    "src",
    "generated",
    "api.schemas.ts",
  ),
];
for (const gegenereerdPad of gegenereerdePaden) {
  const gegenereerd = readFileSync(gegenereerdPad, "utf8");
  const genormaliseerd = `${gegenereerd.trimEnd()}\n`;
  if (genormaliseerd !== gegenereerd) {
    writeFileSync(gegenereerdPad, genormaliseerd);
  }
}
