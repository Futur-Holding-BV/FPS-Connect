/**
 * check-codegen-stale.ts
 *
 * Controleert of lib/api-client-react/dist/ verouderd is ten opzichte van de
 * gegenereerde api.ts. Als dat zo is, wordt automatisch pnpm run typecheck:libs
 * uitgevoerd zodat de dist/-declaraties bijgewerkt zijn vóór een commit.
 *
 * Gebruik als git pre-commit hook:
 *   git config core.hooksPath .githooks
 *
 * Of direct uitvoeren:
 *   pnpm --filter @workspace/scripts run check-codegen-stale
 *
 * Achtergrond: de codegen-stap in lib/api-spec/package.json voert automatisch
 * typecheck:libs uit. Maar als orval handmatig wordt aangeroepen (bijv. via
 * `npx orval` of een editor-integratie), wordt typecheck:libs overgeslagen en
 * raken de dist/-declaraties verouderd zonder waarschuwing in de editor.
 *
 * Exit codes:
 *   0 — dist/ is up-to-date of werd succesvol herbouwd
 *   1 — herbouwen mislukt
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const hier = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(hier, "../..");

const srcPad = path.join(repoRoot, "lib/api-client-react/src/generated/api.ts");
const distPad = path.join(repoRoot, "lib/api-client-react/dist/generated/api.d.ts");

function log(tekst: string) {
  console.log(`[check-codegen-stale] ${tekst}`);
}

if (!fs.existsSync(srcPad)) {
  log("src/generated/api.ts niet gevonden — codegen nog niet uitgevoerd, niets te controleren.");
  process.exit(0);
}

const isStale =
  !fs.existsSync(distPad) ||
  fs.statSync(distPad).mtimeMs < fs.statSync(srcPad).mtimeMs;

if (!isStale) {
  log("lib/api-client-react/dist/ is up-to-date.");
  process.exit(0);
}

log(
  "dist/generated/api.d.ts is ouder dan src/generated/api.ts — " +
  "typecheck:libs wordt automatisch uitgevoerd..."
);

try {
  execSync("pnpm run typecheck:libs", {
    cwd: repoRoot,
    stdio: "inherit",
  });
  log("lib/api-client-react/dist/ succesvol herbouwd.");
  process.exit(0);
} catch {
  log(
    "typecheck:libs mislukt. Los de TypeScript-fouten op voordat je doorgaat.\n" +
    "Tip: voer codegen altijd uit via:\n" +
    "  pnpm --filter @workspace/api-spec run codegen"
  );
  process.exit(1);
}
