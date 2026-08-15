#!/usr/bin/env node
// FPS Connect — opmaakschade-controle (taak #938)
//
// Slaat alarm wanneer één commit een bestaand bestand meer dan
// MAX_REGELVERSCHIL regels laat groeien of krimpen zonder dat de
// commit-boodschap dat aankondigt. Dit patroon (769 → 2071 regels in
// rapporten.ts, 15 aug 2026) is het kenmerk van merge-/formatterschade.
//
// Aankondigen kan door de marker [grote-wijziging] in de commit-boodschap
// op te nemen — dan is de groei bewust en wordt de commit doorgelaten.
//
// Gebruik:
//   node scripts/git/check-opmaakschade.mjs <range>...
//   bv. node scripts/git/check-opmaakschade.mjs origin/main..HEAD
//   of  node scripts/git/check-opmaakschade.mjs HEAD   (alleen die commit)
//
// Exit 0 = geen schade gevonden; exit 1 = geblokkeerd (vindplaatsen op stderr).

import { execFileSync } from "node:child_process";

const MAX_REGELVERSCHIL = 300;
const MARKER = "[grote-wijziging]";

// Paden waar grote regelverschillen normaal zijn (gegenereerd/geïmporteerd).
const UITGEZONDERD = [
  /^pnpm-lock\.yaml$/,
  /(^|\/)\.generated\//,
  /^attached_assets\//,
  /^docs\/changelog\.md$/,
  /^lib\/api-client-react\/(dist|src\/generated)\//,
  /\.(png|jpg|jpeg|webp|gif|pdf|sql|snap|min\.js|map)$/,
];

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trimEnd();
}

const ranges = process.argv.slice(2);
if (ranges.length === 0) {
  console.error("[opmaakschade] Gebruik: check-opmaakschade.mjs <range>...");
  process.exit(2);
}

// Verzamel de te controleren commits (nieuwste eerst is prima; volgorde boeit niet).
const commits = [];
for (const range of ranges) {
  const lijst = range.includes("..")
    ? git("rev-list", range)
    : git("rev-list", "-n", "1", range);
  for (const sha of lijst.split("\n").filter(Boolean)) {
    if (!commits.includes(sha)) commits.push(sha);
  }
}

let fouten = 0;
for (const sha of commits) {
  const boodschap = git("log", "-n", "1", "--format=%B", sha);
  if (boodschap.includes(MARKER)) continue; // bewust aangekondigd

  // Per bestand: regels toegevoegd/verwijderd t.o.v. de eerste ouder.
  // --diff-filter=M: alleen GEWIJZIGDE bestanden; nieuwe of verwijderde
  // bestanden hebben vanzelfsprekend een groot regelverschil.
  // Root-commit (geen ouder) heeft per definitie alleen nieuwe bestanden.
  let numstat;
  try {
    numstat = git("diff", "--numstat", "--diff-filter=M", `${sha}^`, sha);
  } catch {
    continue;
  }
  for (const regel of numstat.split("\n").filter(Boolean)) {
    const [toegevoegd, verwijderd, pad] = regel.split("\t");
    if (toegevoegd === "-" || verwijderd === "-") continue; // binair
    if (UITGEZONDERD.some((re) => re.test(pad))) continue;
    const verschil = Number(toegevoegd) - Number(verwijderd);
    if (Math.abs(verschil) > MAX_REGELVERSCHIL) {
      fouten++;
      console.error(
        `[opmaakschade] FOUT: ${pad} ${verschil > 0 ? "groeit" : "krimpt"} met ` +
        `${Math.abs(verschil)} regels (+${toegevoegd}/-${verwijderd}) in commit ` +
        `${sha.slice(0, 8)} — "${boodschap.split("\n")[0]}"`,
      );
    }
  }
}

if (fouten > 0) {
  console.error(
    `\n[opmaakschade] ${fouten} verdacht(e) regelverschil(len) > ${MAX_REGELVERSCHIL} regels.\n` +
    `Dit patroon wijst op merge-/formatterschade (zoals rapporten.ts, 15 aug 2026).\n` +
    `Is de grote wijziging BEWUST? Zet dan "${MARKER}" in de commit-boodschap\n` +
    `(git commit --amend) en probeer opnieuw. Zo niet: herstel het bestand uit de\n` +
    `laatst goede commit en pas de bedoelde wijziging opnieuw toe.`,
  );
  process.exit(1);
}
console.log(`[opmaakschade] OK: geen onaangekondigde regelverschillen > ${MAX_REGELVERSCHIL} (${commits.length} commit(s) gecontroleerd).`);
