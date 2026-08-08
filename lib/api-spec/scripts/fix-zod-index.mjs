// Orval (mode: split + schemas in types/) genereert in lib/api-zod/src/index.ts
// een dubbele export: de zod-consts in generated/api.ts en de TS-types in
// generated/types/ delen namen (bijv. ListAiVoorstellenParams) → TS2308.
// Afspraak (zie memory api-zod-types-conflict): index.ts exporteert alléén
// generated/api. Dit script herstelt dat na elke orval-run.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const hier = path.dirname(fileURLToPath(import.meta.url));
const indexPad = path.resolve(hier, "..", "..", "api-zod", "src", "index.ts");
writeFileSync(indexPad, 'export * from "./generated/api";\n');
console.log("api-zod index.ts hersteld (alleen export uit generated/api)");
