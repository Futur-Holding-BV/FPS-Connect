/**
 * clean-stale-dist.ts
 *
 * Verwijdert .d.ts- (en bijbehorende .d.ts.map-)bestanden uit lib/*‌/dist/
 * waarvoor geen overeenkomend bronbestand meer bestaat in lib/*‌/src/.
 *
 * Achtergrond: `tsc --build` met incremental compilation verwijdert zelden
 * overbodige dist/-bestanden als een bronbestand verdwijnt. Hierdoor kunnen
 * stale declaraties de kwaliteitscheck (sectie 11 Stap B) en consumerende
 * packages stilzwijgend laten breken. Dit script ruimt die bestanden op
 * *vóór* tsc --build zodat de build-cache intact blijft voor bestanden die
 * wél een bronbestand hebben.
 *
 * Gebruik: wordt automatisch aangeroepen via `pretypecheck:libs` in de root
 * package.json. Direct uitvoeren kan ook: `tsx ./src/clean-stale-dist.ts`
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");

const compositeLibs = [
  "lib/api-client-react",
  "lib/api-zod",
  "lib/db",
  "lib/object-storage-web",
  "lib/permissies",
];

const bronExtensies = [".ts", ".tsx", ".mts", ".cts"];

/**
 * Verzamel recursief alle .d.ts-bestanden in een map.
 * Geeft paden terug relatief aan `basisDir`.
 */
function verzamelDtsbestanden(dir: string, basisDir: string): string[] {
  const resultaat: string[] = [];
  if (!fs.existsSync(dir)) return resultaat;
  for (const item of fs.readdirSync(dir)) {
    const volledigPad = path.join(dir, item);
    if (fs.statSync(volledigPad).isDirectory()) {
      resultaat.push(...verzamelDtsbestanden(volledigPad, basisDir));
    } else if (item.endsWith(".d.ts")) {
      resultaat.push(path.relative(basisDir, volledigPad));
    }
  }
  return resultaat;
}

let aantalVerwijderd = 0;
let aantalGecontroleerd = 0;

for (const lib of compositeLibs) {
  const distPad = path.join(repoRoot, lib, "dist");
  const srcPad = path.join(repoRoot, lib, "src");

  if (!fs.existsSync(distPad)) continue;

  const dtsbestanden = verzamelDtsbestanden(distPad, distPad);

  for (const relatief of dtsbestanden) {
    aantalGecontroleerd++;
    const basisZonderExt = relatief.replace(/\.d\.ts$/, "");
    const bestaatBron = bronExtensies.some((ext) =>
      fs.existsSync(path.join(srcPad, basisZonderExt + ext))
    );

    if (!bestaatBron) {
      const dtsVolledig = path.join(distPad, relatief);
      const mapVolledig = dtsVolledig + ".map";

      fs.rmSync(dtsVolledig, { force: true });
      if (fs.existsSync(mapVolledig)) {
        fs.rmSync(mapVolledig, { force: true });
      }

      console.log(`[clean-stale-dist] verwijderd: ${lib}/dist/${relatief}`);
      aantalVerwijderd++;
    }
  }
}

if (aantalVerwijderd === 0) {
  console.log(
    `[clean-stale-dist] geen stale declaraties gevonden (${aantalGecontroleerd} gecontroleerd)`
  );
} else {
  console.log(
    `[clean-stale-dist] ${aantalVerwijderd} stale declaratie(s) verwijderd (${aantalGecontroleerd} gecontroleerd)`
  );
}
