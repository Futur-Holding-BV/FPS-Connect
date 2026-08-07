// CALCULATIE_AI_01 — "Adviseren op basis van je eigen cijfers".
//
// Bouwt vier deterministische contextblokken voor de senior-calculatoranalyse:
//   A. de eigen norm per regel (eenheidsprijzenbibliotheek + afwijking in € en %),
//   B. de eigen geschiedenis per regelsoort (mediaan/min/max uit eerdere calculaties),
//   C. gecalculeerd versus werkelijk betaald (factuurregels uit FACTUUR_02),
//   D. de eigen opslagenpraktijk (medianen uit eerdere calculaties).
//
// Spelregels (uit de opdracht):
// - mediaan, nooit gemiddelde;
// - onder de vijf waarnemingen: blok weglaten en dát melden;
// - geen koppeling aantoonbaar: expliciet "geen ... gevonden", nooit gissen;
// - geen tweede prijzenbibliotheek: uitsluitend bestaande tabellen lezen.
//
// Alles hier is puur lezen + rekenen; de uitvoer is een deterministische tekst
// (vaste sortering, vaste afronding) zodat twee runs op dezelfde data
// letterlijk dezelfde cijfers aan de AI meegeven.

import { and, eq, inArray, isNotNull, ne } from "drizzle-orm";
import {
  db,
  eenheidsprijzenTable,
  facturenTable,
  factuurRegelsTable,
  modCalcHeadersTable,
  modCalcNormtijdenTable,
  modCalcRegelsTable,
} from "@workspace/db";

const MIN_WAARNEMINGEN = 5;

type ModCalcRegel = typeof modCalcRegelsTable.$inferSelect;
type ModCalcHeader = typeof modCalcHeadersTable.$inferSelect;

// ── helpers ────────────────────────────────────────────────────────────────

function normaliseer(tekst: string): string {
  return tekst.toLowerCase().replace(/\s+/g, " ").trim();
}

function mediaan(waarden: number[]): number {
  const s = [...waarden].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function euro(n: number): string {
  return `€ ${n.toFixed(2)}`;
}

function pct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function periode(datums: Date[]): string {
  const tijden = datums.map((d) => d.getTime());
  const van = new Date(Math.min(...tijden));
  const tot = new Date(Math.max(...tijden));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return `${fmt(van)} t/m ${fmt(tot)}`;
}

// Eén vergelijkbare "stukprijs per eenheid" voor een mod-calc-regel:
// materiaaltarief + arbeid (MU × arbeidstarief) per eenheid. Onderaanneming
// is een bedrag per regel (niet per eenheid) en blijft hier bewust buiten.
function regelEenheidsprijs(r: ModCalcRegel): number {
  return Number(r.tarief) + Number(r.muPerEenheid ?? 0) * Number(r.arbeidsTarief ?? 0);
}

function regelsoortSleutel(omschrijving: string, eenheid: string): string {
  return `${normaliseer(omschrijving)}|${normaliseer(eenheid)}`;
}

// ── hoofdopbouw ────────────────────────────────────────────────────────────

export async function bouwEigenCijfersContext(
  header: ModCalcHeader,
  regels: ModCalcRegel[],
): Promise<string> {
  const normtijdIds = [...new Set(regels.map((r) => r.normtijdId).filter((v): v is number => v != null))];

  const [eenheidsprijzen, normtijden, andereHeaders] = await Promise.all([
    db.select().from(eenheidsprijzenTable).where(eq(eenheidsprijzenTable.actief, true)),
    normtijdIds.length > 0
      ? db.select().from(modCalcNormtijdenTable).where(inArray(modCalcNormtijdenTable.id, normtijdIds))
      : Promise.resolve([]),
    db.select().from(modCalcHeadersTable).where(ne(modCalcHeadersTable.id, header.id)),
  ]);

  const andereHeaderIds = andereHeaders.map((h) => h.id);
  const historischeRegels: ModCalcRegel[] = andereHeaderIds.length > 0
    ? await db.select().from(modCalcRegelsTable)
        .where(inArray(modCalcRegelsTable.calculatieId, andereHeaderIds))
    : [];

  // "Werkelijk betaald" mag alleen uit afgehandelde INKOOPfacturen komen:
  // verkoopfacturen of afgekeurde/onafgeronde facturen zouden een verzonnen
  // vergelijking opleveren (review-bevinding). Daarom join op de ouder-factuur
  // met type 'inkoop' en status verwerkt/betaald.
  const factuurRegels = regels.length > 0
    ? (await db.select({ regel: factuurRegelsTable })
        .from(factuurRegelsTable)
        .innerJoin(facturenTable, eq(factuurRegelsTable.factuurId, facturenTable.id))
        .where(and(
          isNotNull(factuurRegelsTable.stukprijs),
          eq(facturenTable.type, "inkoop"),
          inArray(facturenTable.status, ["verwerkt", "betaald"]),
        ))).map((r) => r.regel)
    : [];

  const epOpCode = new Map(eenheidsprijzen.map((e) => [normaliseer(e.code), e] as const));
  // Omschrijving+eenheid is NIET uniek in de bibliotheek. Bij meerdere kandidaten
  // is de match ambigu: dan geen norm kiezen (fail closed) maar dát melden —
  // anders zou de databasevolgorde stilzwijgend bepalen welke norm "wint".
  const epOpOmschrijving = new Map<string, (typeof eenheidsprijzen)[number] | "ambigu">();
  for (const e of eenheidsprijzen) {
    const sleutel = regelsoortSleutel(e.omschrijving, e.eenheid);
    epOpOmschrijving.set(sleutel, epOpOmschrijving.has(sleutel) ? "ambigu" : e);
  }
  const normtijdOpId = new Map(normtijden.map((n) => [n.id, n] as const));

  // ── Blok A — de eigen norm per regel ─────────────────────────────────────
  const blokA: string[] = [];
  for (const r of [...regels].sort((a, b) => a.volgorde - b.volgorde || a.id - b.id)) {
    const normtijdCode = r.normtijdId != null ? normtijdOpId.get(r.normtijdId)?.code : undefined;
    const kandidaat = (normtijdCode ? epOpCode.get(normaliseer(normtijdCode)) : undefined)
      ?? epOpOmschrijving.get(regelsoortSleutel(r.omschrijving, r.eenheid));
    const prijs = regelEenheidsprijs(r);
    if (kandidaat === "ambigu") {
      blokA.push(`- "${r.omschrijving}" (${r.eenheid}): meerdere eenheidsprijzen met dezelfde omschrijving en eenheid in de bibliotheek — ambigu, geen norm gekozen. Bevinding voor beheer: maak de bibliotheek eenduidig.`);
      continue;
    }
    const ep = kandidaat;
    if (!ep) {
      blokA.push(`- "${r.omschrijving}" (${r.eenheid}): geen eenheidsprijs gevonden in de bibliotheek — geen norm om aan te toetsen.`);
      continue;
    }
    const norm = Number(ep.verkoopprijs);
    const afwijking = norm > 0 ? ((prijs - norm) / norm) * 100 : null;
    blokA.push(
      `- "${r.omschrijving}" (${r.eenheid}): calculatie ${euro(prijs)}/eenheid vs eigen eenheidsprijs ${ep.code} ${euro(norm)}` +
      (afwijking != null ? ` → afwijking ${euro(prijs - norm)} (${pct(afwijking)})` : " → norm heeft geen verkoopprijs (0), afwijking niet te bepalen") +
      ` | norm: normtijd ${Number(ep.normtijd).toFixed(2)} u, materiaal ${euro(Number(ep.materiaalcomponent))}, arbeid ${euro(Number(ep.arbeidscomponent))}, kostprijs ${euro(Number(ep.kostprijs))}.`,
    );
  }

  // ── Blok B — de eigen geschiedenis per regelsoort ────────────────────────
  const historiePerSoort = new Map<string, { prijzen: number[]; datums: Date[] }>();
  for (const h of historischeRegels) {
    const sleutel = regelsoortSleutel(h.omschrijving, h.eenheid);
    const entry = historiePerSoort.get(sleutel) ?? { prijzen: [], datums: [] };
    entry.prijzen.push(regelEenheidsprijs(h));
    entry.datums.push(h.aangemaaktOp);
    historiePerSoort.set(sleutel, entry);
  }
  const blokB: string[] = [];
  const soortenInCalculatie = [...new Set(regels.map((r) => regelsoortSleutel(r.omschrijving, r.eenheid)))].sort();
  for (const sleutel of soortenInCalculatie) {
    const hist = historiePerSoort.get(sleutel);
    const [omschrijving, eenheid] = sleutel.split("|");
    if (!hist || hist.prijzen.length < MIN_WAARNEMINGEN) {
      blokB.push(`- "${omschrijving}" (${eenheid}): ${hist ? hist.prijzen.length : 0} eerdere waarneming(en) — te weinig geschiedenis (minimaal ${MIN_WAARNEMINGEN}), geen historisch advies op baseren.`);
      continue;
    }
    blokB.push(
      `- "${omschrijving}" (${eenheid}): mediaan ${euro(mediaan(hist.prijzen))}, laagste ${euro(Math.min(...hist.prijzen))}, hoogste ${euro(Math.max(...hist.prijzen))} — ${hist.prijzen.length} waarnemingen, periode ${periode(hist.datums)}.`,
    );
  }

  // ── Blok C — gecalculeerd versus werkelijk betaald ───────────────────────
  const betaaldPerSoort = new Map<string, { prijzen: number[]; datums: Date[] }>();
  for (const f of factuurRegels) {
    if (f.stukprijs == null || f.eenheid == null) continue;
    const sleutel = regelsoortSleutel(f.omschrijving, f.eenheid);
    const entry = betaaldPerSoort.get(sleutel) ?? { prijzen: [], datums: [] };
    entry.prijzen.push(Number(f.stukprijs));
    entry.datums.push(f.aangemaaktOp);
    betaaldPerSoort.set(sleutel, entry);
  }
  const blokC: string[] = [];
  for (const sleutel of soortenInCalculatie) {
    const betaald = betaaldPerSoort.get(sleutel);
    if (!betaald) continue; // geen aantoonbare koppeling: weglaten, niet gissen
    const [omschrijving, eenheid] = sleutel.split("|");
    blokC.push(
      `- "${omschrijving}" (${eenheid}): werkelijk betaald (inkoopfacturen) mediaan ${euro(mediaan(betaald.prijzen))} — ${betaald.prijzen.length} factuurregel(s), periode ${periode(betaald.datums)}.`,
    );
  }

  // ── Blok D — de opslagen tegen de eigen praktijk ─────────────────────────
  const blokD: string[] = [];
  if (andereHeaders.length < MIN_WAARNEMINGEN) {
    blokD.push(`Te weinig eerdere calculaties (${andereHeaders.length}) om een eigen opslagennorm te bepalen (minimaal ${MIN_WAARNEMINGEN}). Toets de opslagen daarom NIET aan een verzonnen of landelijke norm; benoem dat de eigen praktijk nog ontbreekt.`);
  } else {
    const opslagVelden: Array<[string, (h: ModCalcHeader) => number]> = [
      ["AK", (h) => Number(h.opslagAk)],
      ["ABK", (h) => Number(h.opslagAbk)],
      ["Risico", (h) => Number(h.opslagRisico)],
      ["Winst", (h) => Number(h.opslagWinst)],
    ];
    for (const [naam, lees] of opslagVelden) {
      const waarden = andereHeaders.map(lees);
      blokD.push(`- ${naam}: FPS-praktijk mediaan ${mediaan(waarden).toFixed(1)}% (laagste ${Math.min(...waarden).toFixed(1)}%, hoogste ${Math.max(...waarden).toFixed(1)}%) over ${waarden.length} eerdere calculaties — deze calculatie: zie OPSLAGEN hierboven.`);
    }
  }

  return [
    `EIGEN NORM PER REGEL (eenheidsprijzenbibliotheek FPS; ${eenheidsprijzen.length} actieve eenheidsprijzen):`,
    blokA.length > 0 ? blokA.join("\n") : "(geen calculatieregels)",
    ``,
    `EIGEN PRIJSGESCHIEDENIS PER REGELSOORT (eerdere FPS-calculaties; mediaan, nooit gemiddelde):`,
    blokB.length > 0 ? blokB.join("\n") : "(geen calculatieregels)",
    ``,
    `WERKELIJK BETAALDE INKOOPPRIJZEN (alleen aantoonbaar gekoppelde factuurregels):`,
    blokC.length > 0 ? blokC.join("\n") : "(geen aantoonbaar koppelbare factuurregels gevonden — dit blok niet gebruiken in het advies)",
    ``,
    `EIGEN OPSLAGENPRAKTIJK FPS:`,
    blokD.join("\n"),
  ].join("\n");
}
