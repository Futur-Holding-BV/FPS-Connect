/**
 * Broncodevangnet voor de Radix Select-regel:
 * SelectItem mag nooit value="" krijgen. Radix gebruikt een lege waarde
 * intern als reset-symbool en gooit daardoor tijdens het renderen een fout.
 *
 * Dit is bewust een kleine broncode-lint, zodat de controle ook draait zonder
 * browser, testdata of ingelogde gebruiker. Sentinel-waarden zoals
 * "__geen_gebouw__" blijven wel toegestaan.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..", "..");
const firevaultSource = path.join(repositoryRoot, "artifacts", "firevault", "src");

const positievePaden = [
  "pages/inspecties/detail.tsx",
  "pages/beheer/meldingen.tsx",
  "pages/veiligheid/lmra.tsx",
  "pages/opdrachten/inkoopplanning-tab.tsx",
  "pages/snagstream/index.tsx",
];

type Bevinding = {
  bestand: string;
  regel: number;
  waarde: string;
};

function verzamelTsxBestanden(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return verzamelTsxBestanden(entryPath);
    return entry.isFile() && entry.name.endsWith(".tsx") ? [entryPath] : [];
  });
}

function legeSelectItemWaarden(inhoud: string, bestand: string): Bevinding[] {
  const bevindingen: Bevinding[] = [];
  const openingTag = /<SelectItem\b[\s\S]*?>/g;
  const legeWaarde = /\bvalue\s*=\s*(?:""|''|\{\s*(?:""|'')\s*\})/;

  for (const match of inhoud.matchAll(openingTag)) {
    const tag = match[0];
    const fout = tag.match(legeWaarde);
    if (!fout || match.index === undefined) continue;
    bevindingen.push({
      bestand,
      regel: inhoud.slice(0, match.index).split("\n").length,
      waarde: fout[0],
    });
  }
  return bevindingen;
}

function main(): void {
  const bestanden = verzamelTsxBestanden(firevaultSource);
  const bevindingen = bestanden.flatMap((bestand) =>
    legeSelectItemWaarden(readFileSync(bestand, "utf8"), path.relative(repositoryRoot, bestand)),
  );

  const ontbrekendePositievePaden = positievePaden.filter((relatiefPad) => {
    const absoluutPad = path.join(firevaultSource, relatiefPad);
    return !statSync(absoluutPad, { throwIfNoEntry: false });
  });

  if (ontbrekendePositievePaden.length > 0) {
    throw new Error(
      `SelectItem-lint kan de positieve paden niet controleren:\n${ontbrekendePositievePaden
        .map((pad) => `- ${pad}`)
        .join("\n")}`,
    );
  }

  if (bevindingen.length > 0) {
    console.error("Lege SelectItem-waarden gevonden. Gebruik een niet-lege sentinel en vertaal die terug naar de domeinwaarde:");
    for (const bevinding of bevindingen) {
      console.error(`- ${bevinding.bestand}:${bevinding.regel} (${bevinding.waarde})`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `SelectItem-lint geslaagd: ${bestanden.length} TSX-bestanden gecontroleerd; ` +
      `${positievePaden.length} gerepareerde dialogen als positieve paden meegenomen.`,
  );
}

main();