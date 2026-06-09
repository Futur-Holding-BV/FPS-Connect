// Seed van de applicatie-catalogus (genummerde voorziening-types, SnagStream).
// Idempotent: bestaande codes worden bijgewerkt, nummering/benaming blijft leidend.
// Draaien: pnpm --filter @workspace/scripts run seed-applicaties
import { db, voorzieningTypesTable } from "@workspace/db";

const CATEGORIEEN: Record<number, string> = {
  1: "Doorvoeringen",
  2: "Brandkleppen & ventielen",
  3: "Bouwkundig & staal",
  4: "Deuren & kozijnen",
  5: "Brandwerend glas",
  6: "Naden & aansluitingen",
  7: "Detectie & sturing",
  11: "Luiken",
};

// [code, naam, actief?]
const RUWE_TYPES: Array<[string, string, boolean?]> = [
  ["1.1", "aircoleidingen"],
  ["1.09", "koperenbuis met armaflex"],
  ["1.10", "koperen buis"],
  ["1.11", "Leiding/kabel door mantelbuis"],
  ["1.12", "Leiding met rockwoolschaal"],
  ["1.13", "mantelbuis met kabels"],
  ["1.14", "meerlaags leiding"],
  ["1.15", "meerlaags leiding met armaflex isolatie"],
  ["1.17", "PVC/PP/PE doorvoer"],
  ["1.18", "RGA Alu buis"],
  ["1.19", "sparing wand/plafond"],
  ["1.19a", "vloer meterkast"],
  ["1.2", "concentrische rookgasafvoer"],
  ["1.20", "stalen buis"],
  ["1.21", "stalen buis met armaflex"],
  ["1.22", "stalen leiding met PIR isolatie"],
  ["1.23", "RGA/VLT Concentr. Staal/PP"],
  ["1.3", "elektabuis 16-25mm/P25"],
  ["1.4", "inbouwdoos / centraaldoos"],
  ["1.6", "kabel"],
  ["1.7", "kabelgoot"],
  ["1.9", "kabels als bundel"],
  ["2.1", "Spirobuis"],
  ["2.2", "brandklep rond"],
  ["2.3", "brandklep vierkant/rechthoekig"],
  ["2.5", "Geba rookwerend ventiel"],
  ["2.6", "Ronde vlinderklep SCV+, EI 60 beide zijden"],
  ["2.7", "Vlinderklep EI60 SC-S met eind ventiel"],
  ["2.9", "Vlinderklep F-C2 EI60 tot EI120 CS+"],
  ["3.1", "beplating brandwerend (algemeen)"],
  ["3.2", "plafond brandwerend"],
  ["3.3", "stalen ligger/kolom", false],
  ["3.4", "IPE360"],
  ["3.50", "HE120A"],
  ["3.51", "HE140A"],
  ["3.52", "HE160A"],
  ["3.53", "HE180A"],
  ["3.54", "HE200A"],
  ["3.55", "HE220A"],
  ["3.56", "HE240A"],
  ["3.57", "HE260A/B"],
  ["3.70", "koker 80x80mm"],
  ["4.1", "deur 30 min"],
  ["4.2", "deur 60 min"],
  ["4.3", "deurkozijn hardhout"],
  ["4.4", "deur rookwerend"],
  ["4.5", "ventilatierooster brandwerend"],
  ["4.6", "Raamkozijn hardhout"],
  ["4.7", "bovenpaneel kozijn"],
  ["4.8", "Opwaarderen deur"],
  ["4.9", "Vrijloopdeurdranger"],
  ["5", "Glas brandwerend"],
  ["5.2", "glaslatten"],
  ["5.3", "Folie verwijderen"],
  ["6.1", "naad dilatatie wand-wand"],
  ["6.2", "naad wand-plafond"],
  ["6.3", "Naad wand - kozijn"],
  ["7.1", "rookmelder"],
  ["7.2", "kleefmagneet met rookmelder(s) -stand alone"],
  ["7.3", "elleboogschakelaar(s) met deurautomaat"],
  ["11.1", "Brandwerend luik"],
];

function sorteersleutel(code: string): [number, number, string] {
  const [maj, ...rest] = code.split(".");
  const minorRuw = rest.join(".");
  const m = minorRuw.match(/^(\d*)([a-zA-Z]*)$/);
  const major = parseInt(maj.replace(/\D/g, ""), 10) || 0;
  const minor = m && m[1] ? parseInt(m[1], 10) : 0;
  const suffix = (m && m[2]) || "";
  return [major, minor, suffix];
}

function major(code: string): number {
  return parseInt(code.split(".")[0].replace(/\D/g, ""), 10) || 0;
}

async function main() {
  const gesorteerd = [...RUWE_TYPES].sort((a, b) => {
    const ka = sorteersleutel(a[0]);
    const kb = sorteersleutel(b[0]);
    return ka[0] - kb[0] || ka[1] - kb[1] || ka[2].localeCompare(kb[2]);
  });

  let n = 0;
  for (let i = 0; i < gesorteerd.length; i++) {
    const [code, naam, actief = true] = gesorteerd[i];
    const categorie = CATEGORIEEN[major(code)] ?? "Overig";
    await db
      .insert(voorzieningTypesTable)
      .values({ code, naam, categorie, volgorde: i, actief })
      .onConflictDoUpdate({
        target: voorzieningTypesTable.code,
        set: { naam, categorie, volgorde: i, actief },
      });
    n++;
  }
  console.log(`Seed klaar: ${n} applicaties (voorziening-types) bijgewerkt.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
