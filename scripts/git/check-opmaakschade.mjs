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
//   node scripts/git/check-opmaakschade.mjs <range-of-commit>...
//   bv. node scripts/git/check-opmaakschade.mjs origin/main..HEAD
//   of  node scripts/git/check-opmaakschade.mjs HEAD   (alleen die commit)
//
// Exit 0 = geen schade gevonden; exit 1 = geblokkeerd (vindplaatsen op stderr).
//
// NB: dit is een heuristiek tegen het bekende mangelingspatroon, geen
// volledige integriteitscontrole — de typecheck-poort ernaast blijft de
// definitieve detector voor kapotte bestanden.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const MAX_REGELVERSCHIL = 300;
const MARKER = "[grote-wijziging]";
const GOEDKEURINGEN_PAD = new URL("./opmaakschade-goedgekeurd.json", import.meta.url);
const { goedgekeurdeWijzigingen = [] } = JSON.parse(readFileSync(GOEDKEURINGEN_PAD, "utf8"));

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
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function isExactGoedgekeurd({ sha, pad, toegevoegd, verwijderd }) {
  const volledigSha = git("rev-parse", sha).trim();
  const blob = git("rev-parse", `${sha}:${pad}`).trim();
  return goedgekeurdeWijzigingen.some(
    (goedkeuring) =>
      goedkeuring.commit === volledigSha &&
      goedkeuring.pad === pad &&
      goedkeuring.toegevoegd === Number(toegevoegd) &&
      goedkeuring.verwijderd === Number(verwijderd) &&
      goedkeuring.blob === blob,
  );
}

const argumenten = process.argv.slice(2);
if (argumenten.length === 0) {
  console.error("[opmaakschade] Gebruik: check-opmaakschade.mjs <range-of-commit>...");
  process.exit(2);
}

// Verzamel de te controleren commits.
const commits = [];
for (const arg of argumenten) {
  const lijst = arg.includes("..")
    ? git("rev-list", arg)
    : git("rev-list", "-n", "1", arg);
  for (const sha of lijst.split("\n").filter(Boolean)) {
    if (!commits.includes(sha)) commits.push(sha);
  }
}

// NUL-veilige parser voor `git diff --numstat -z`.
// Stream-indeling per entry:
//   "added\tdeleted\tpad\0"                       (gewoon bestand)
//   "added\tdeleted\t\0oudpad\0nieuwpad\0"        (rename/copy)
// Levert { toegevoegd, verwijderd, pad } met het NIEUWE pad bij renames.
function parseNumstatZ(buf) {
  const delen = buf.split("\0");
  const entries = [];
  for (let i = 0; i < delen.length; i++) {
    const kop = delen[i];
    if (!kop) continue;
    const m = kop.match(/^(-|\d+)\t(-|\d+)\t(.*)$/s);
    if (!m) continue;
    let pad = m[3];
    if (pad === "") {
      // Rename/copy: volgende twee NUL-velden zijn oud pad en nieuw pad.
      i += 2;
      pad = delen[i] ?? "";
    }
    entries.push({ toegevoegd: m[1], verwijderd: m[2], pad });
  }
  return entries;
}

let fouten = 0;
for (const sha of commits) {
  const boodschap = git("log", "-n", "1", "--format=%B", sha);
  if (boodschap.includes(MARKER)) continue; // bewust aangekondigd

  // Per bestand: regels toegevoegd/verwijderd t.o.v. de eerste ouder.
  // --diff-filter=MR: gewijzigde én hernoemde bestanden (een mangeling kan
  // achter een rename schuilgaan); -M detecteert de rename zodat het
  // regelverschil over de bestandsinhoud gaat, niet over delete+add.
  // Root-commit (geen ouder) heeft per definitie alleen nieuwe bestanden.
  let numstat;
  try {
    numstat = git("diff", "--numstat", "-z", "-M", "--diff-filter=MR", `${sha}^`, sha);
  } catch {
    continue;
  }
  for (const { toegevoegd, verwijderd, pad } of parseNumstatZ(numstat)) {
    if (toegevoegd === "-" || verwijderd === "-") continue; // binair
    if (UITGEZONDERD.some((re) => re.test(pad))) continue;
    const verschil = Number(toegevoegd) - Number(verwijderd);
    if (Math.abs(verschil) > MAX_REGELVERSCHIL) {
      if (isExactGoedgekeurd({ sha, pad, toegevoegd, verwijderd })) {
        console.log(
          `[opmaakschade] GOEDGEKEURD: ${pad} ${verschil > 0 ? "groeit" : "krimpt"} met ` +
          `${Math.abs(verschil)} regels in commit ${sha.slice(0, 8)}; commit, numstat en blob komen exact overeen.`,
        );
        continue;
      }
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
