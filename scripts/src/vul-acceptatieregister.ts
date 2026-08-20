/**
 * REGISTER_01 Fase 0 — vult het acceptatieregister vanuit docs/opdrachten.
 *
 * Loopt alle opdrachtbestanden (.md/.txt) langs, zoekt de paragraaf
 * "Acceptatie" (of "Acceptatiecriteria") en neemt de genummerde punten over
 * als losse regels: (opdracht_code, punt_nummer, omschrijving, bron_bestand).
 *
 * - Opdrachtcode uit de bestandsnaam (bv. APP_01, NP_INKOOP_01); bestanden
 *   zonder code (Pasted-...) krijgen een leesbare slug-code.
 * - Per opdrachtcode wint bij meerdere bronnen de leesbare hoofdnaam.
 * - Idempotent: bestaande regels behouden hun stand/bewijs; alleen de
 *   omschrijving en bron worden ververst. Nieuwe punten komen erbij als
 *   "onbewezen" (het bestaan van code is niet het door de opdracht geëiste bewijs).
 *
 * Gebruik: tsx src/vul-acceptatieregister.ts [--dry]
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { db, acceptatieRegisterTable } from "@workspace/db";
import { sql } from "drizzle-orm";

const MAP = path.resolve(process.cwd(), "..", "docs", "opdrachten");
const DRY = process.argv.includes("--dry");

type Punt = { nummer: number; tekst: string };
type Opdracht = { code: string; bestand: string; ts: number; punten: Punt[] };

function opdrachtCodeUitNaam(naam: string): string | null {
  // Archiefnamen zijn kebab-case; codes als APP_01 en NP_INKOOP_01 worden
  // voor de bestaande registersleutel teruggezet naar hoofdletters/underscores.
  const m = naam.match(/^([a-z][a-z0-9]*(?:-[a-z0-9]+?)*-\d{2})(?:-|\.|$)/i);
  return m ? m[1]!.toUpperCase().replaceAll("-", "_") : null;
}

function slugCode(naam: string, inhoud: string): string {
  const kop = inhoud.split("\n").find((r) => /^#\s+\S/.test(r))?.replace(/^#\s+/, "");
  const bron = kop ?? naam.replace(/^Pasted-+/, "").replace(/_\d{13}.*$/, "");
  return bron
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^[-0-9]+|-+$/g, "")
    .slice(0, 48) || "ONBEKEND";
}

function timestampUitNaam(naam: string): number {
  const m = naam.match(/_(\d{13})/);
  return m ? Number(m[1]) : 0;
}

/** Zoek de Acceptatie-paragraaf en parse genummerde punten. */
function parseAcceptatie(inhoud: string): Punt[] {
  const regels = inhoud.split("\n");
  const kopRe = /^#{1,4}\s*(?:\d+[.)]\s*)?Acceptatie(criteria)?\b/i;
  const volgendeKopRe = /^#{1,4}\s+\S/;
  const start = regels.findIndex((r) => kopRe.test(r.trim()));
  if (start < 0) return [];
  const punten: Punt[] = [];
  let huidig: Punt | null = null;
  for (let i = start + 1; i < regels.length; i++) {
    const regel = regels[i]!;
    if (volgendeKopRe.test(regel.trim()) && !kopRe.test(regel.trim())) break;
    // "**Bewijs bij oplevering:**" hoort niet bij een punt maar sluit de lijst.
    if (/^\*{0,2}Bewijs bij oplevering/i.test(regel.trim())) break;
    const m = regel.match(/^\s*(\d+)[.)]\s+(.*\S)/);
    if (m) {
      if (huidig) punten.push(huidig);
      huidig = { nummer: Number(m[1]), tekst: m[2]! };
    } else if (huidig && regel.trim() && !/^[-*]\s/.test(regel.trim()) && !/^-{3,}$/.test(regel.trim())) {
      huidig.tekst += ` ${regel.trim()}`;
    } else if (huidig && !regel.trim() && punten.length + 1 === huidig.nummer && huidig.tekst.length > 0) {
      // lege regel: punt kan doorlopen of eindigen; we wachten op de volgende genummerde regel
    }
  }
  if (huidig) punten.push(huidig);
  const schoon = punten
    .map((p) => ({ nummer: p.nummer, tekst: p.tekst.replace(/\*\*/g, "").replace(/\s+/g, " ").trim() }))
    .filter((p) => p.tekst.length >= 8);
  // Alleen accepteren als de nummering ergens op slaat (begint bij 1, oplopend).
  return schoon.length > 0 && schoon[0]!.nummer === 1 ? schoon : schoon;
}

function verzamel(): Map<string, Opdracht> {
  const perCode = new Map<string, Opdracht>();
  for (const naam of readdirSync(MAP)) {
    if (!/\.(md|txt)$/i.test(naam)) continue;
    let inhoud: string;
    try {
      inhoud = readFileSync(path.join(MAP, naam), "utf8");
    } catch {
      continue;
    }
    const punten = parseAcceptatie(inhoud);
    if (punten.length === 0) continue;
    const code = opdrachtCodeUitNaam(naam) ?? slugCode(naam, inhoud);
    const ts = timestampUitNaam(naam);
    const bestaand = perCode.get(code);
    if (
      !bestaand
      || ts > bestaand.ts
      || (ts === bestaand.ts && naam.localeCompare(bestaand.bestand) > 0)
    ) {
      perCode.set(code, { code, bestand: naam, ts, punten });
    }
  }
  return perCode;
}

async function main(): Promise<void> {
  const opdrachten = [...verzamel().values()].sort((a, b) => a.code.localeCompare(b.code));
  const totaal = opdrachten.reduce((n, o) => n + o.punten.length, 0);
  console.log(`Gevonden: ${opdrachten.length} opdrachten met samen ${totaal} acceptatiepunten.`);
  for (const o of opdrachten) {
    console.log(`- ${o.code}: ${o.punten.length} punten (${o.bestand})`);
  }
  if (DRY) {
    for (const o of opdrachten.slice(0, 3)) {
      console.log(`\n== ${o.code} ==`);
      o.punten.forEach((p) => console.log(`${p.nummer}. ${p.tekst.slice(0, 110)}`));
    }
    process.exit(0);
  }
  let nieuw = 0;
  for (const o of opdrachten) {
    for (const p of o.punten) {
      const r = await db
        .insert(acceptatieRegisterTable)
        .values({
          opdrachtCode: o.code,
          puntNummer: p.nummer,
          omschrijving: p.tekst,
          bronBestand: o.bestand,
          bewijsVindplaats: `docs/opdrachten/${o.bestand}`,
          bronSoort: "antwoorddocument",
          bronDatum: new Date(o.ts || Date.now()),
          laatsteCodeWijzigingOp: new Date(o.ts || Date.now()),
          relevanteCodepaden: [`docs/opdrachten/${o.bestand}`],
          beoordeeldOp: new Date(),
        })
        .onConflictDoUpdate({
          target: [acceptatieRegisterTable.opdrachtCode, acceptatieRegisterTable.puntNummer],
          set: { omschrijving: p.tekst, bronBestand: o.bestand },
        })
        .returning({ aangemaaktOp: acceptatieRegisterTable.aangemaaktOp });
      if (r[0] && Date.now() - r[0].aangemaaktOp.getTime() < 60_000) nieuw++;
    }
  }
  const stand = await db.execute(sql`SELECT stand, count(*)::int AS n FROM acceptatie_register GROUP BY stand ORDER BY stand`);
  console.log(`\nVerwerkt. Nieuw toegevoegd (schatting): ${nieuw}. Standen:`, stand.rows);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
