// ENK-import: deterministische parser voor ENK-calculatierapporten (PDF-tekst),
// plus CSV/Excel-varianten en een AI-vangnet. Alle bedragen worden in
// centen-integers verwerkt (zie geldCenten.ts); de DB-geldkolommen zijn real
// (float4) en dus niet autoritair voor de totaalvergelijking.
import { aiGateway, heeftGateway } from "./aiGateway";
import { parseEuroNaarCenten, centenNaarEuroTekst, euroGetalNaarCenten, somCenten } from "./geldCenten";

export interface EnkRegel {
  omschrijving: string;
  hoeveelheid: number;
  eenheid: string;
  totaalCenten: number;
  opmerkingen: string | null;
  isBouwplaatskosten: boolean;
}

export interface EnkHoofdstuk {
  naam: string;
  totaalEnkCenten: number | null;
  somRegelsCenten: number;
  regels: EnkRegel[];
}

export interface EnkOpslagen {
  materiaal: number;
  arbeid: number;
  ak: number;
  abk: number;
  risico: number;
  winst: number;
  korting: number;
}

export interface EnkParseResultaat {
  succes: boolean;
  calculatienummer: string | null;
  projectnummer: string | null;
  naam: string | null;
  opdrachtgever: string | null;
  datum: string | null;
  hoofdstukken: EnkHoofdstuk[];
  opslagen: EnkOpslagen;
  opslagenBron: "gedetecteerd" | "standaard";
  totaalEnkCenten: number | null;
  waarschuwingen: string[];
  bewijs: string[];
  aiGebruikt: boolean;
}

export const LEGE_OPSLAGEN: EnkOpslagen = {
  materiaal: 0, arbeid: 0, ak: 0, abk: 0, risico: 0, winst: 0, korting: 0,
};

// Standaard ENK-opslagen die worden aangenomen wanneer het bestand geen expliciete
// percentages bevat. Dit zijn de door de gebruiker vastgestelde ENK-standaardwaarden.
// Let op: deze waarden zijn informatief bij verwerking "inclusief" (de regelprijzen
// bevatten de opslagen dan al); ze worden alleen daadwerkelijk verrekend bij
// verwerking "bovenop". Voor de daadwerkelijke rekenpaden geldt LEGE_OPSLAGEN.
export const STANDAARD_OPSLAGEN: EnkOpslagen = {
  materiaal: 25, arbeid: 4, ak: 8, abk: 0, risico: 0, winst: 4, korting: 0,
};

const BOUWPLAATS_HOOFDSTUK = /^(abk|bouwplaats|algemene bouwplaatskosten)/i;

function isBouwplaatsHoofdstuk(naam: string): boolean {
  return BOUWPLAATS_HOOFDSTUK.test(naam.trim());
}

// Calculatieregels worden opgeslagen in float4-kolommen (~7 significante
// cijfers). Boven € 167.772,16 per regel (2^24 centen) is cent-precisie niet
// meer gegarandeerd; waarschuw de gebruiker zodat het totaal extra wordt
// gecontroleerd.
const FLOAT4_CENT_GRENS = 2 ** 24;

function voegPrecisieWaarschuwingToe(
  hoofdstukken: Pick<EnkHoofdstuk, "naam" | "regels">[],
  waarschuwingen: string[],
): void {
  for (const h of hoofdstukken) {
    for (const r of h.regels) {
      if (Math.abs(r.totaalCenten) > FLOAT4_CENT_GRENS) {
        waarschuwingen.push(
          `Regel "${r.omschrijving}" (hoofdstuk ${h.naam}) heeft een bedrag boven € ${centenNaarEuroTekst(FLOAT4_CENT_GRENS)}; controleer het detailtotaal na de import op centen na — bij zulke grote regelbedragen is cent-precisie niet gegarandeerd.`,
        );
        return;
      }
    }
  }
}

// ── Opslagen-detectie ─────────────────────────────────────────────────────────

export function detecteerOpslagen(tekst: string): { opslagen: EnkOpslagen; bron: "gedetecteerd" | "standaard"; bewijs: string[] } {
  const opslagen: EnkOpslagen = { ...LEGE_OPSLAGEN };
  const bewijs: string[] = [];
  const patroon = /\b(materiaal|materialen|arbeid|ak|abk|risico|winst|korting)\s*:?\s*(\d+(?:[.,]\d+)?)\s*%/gi;
  let m: RegExpExecArray | null;
  let aantal = 0;
  while ((m = patroon.exec(tekst)) !== null) {
    const sleutelRuw = m[1].toLowerCase();
    const waarde = parseFloat(m[2].replace(",", "."));
    if (!Number.isFinite(waarde)) continue;
    const sleutel: keyof EnkOpslagen | null =
      sleutelRuw.startsWith("materia") ? "materiaal"
      : sleutelRuw === "arbeid" ? "arbeid"
      : sleutelRuw === "ak" ? "ak"
      : sleutelRuw === "abk" ? "abk"
      : sleutelRuw === "risico" ? "risico"
      : sleutelRuw === "winst" ? "winst"
      : sleutelRuw === "korting" ? "korting"
      : null;
    if (!sleutel) continue;
    opslagen[sleutel] = waarde;
    aantal += 1;
    bewijs.push(`Opslag gedetecteerd in bestand: ${m[1]} ${m[2]}%`);
  }
  if (aantal >= 2) return { opslagen, bron: "gedetecteerd", bewijs };
  return {
    opslagen: { ...STANDAARD_OPSLAGEN },
    bron: "standaard",
    bewijs: [
      `Geen expliciete opslagpercentages in het bestand; standaard ENK-opslagen aangenomen: materiaal ${STANDAARD_OPSLAGEN.materiaal}%, arbeid ${STANDAARD_OPSLAGEN.arbeid}%, AK ${STANDAARD_OPSLAGEN.ak}%, risico ${STANDAARD_OPSLAGEN.risico}%, winst ${STANDAARD_OPSLAGEN.winst}%, korting ${STANDAARD_OPSLAGEN.korting}%.`,
    ],
  };

}

// ── Deterministische PDF-tekstparser ──────────────────────────────────────────

export function parseEnkTekst(tekst: string): EnkParseResultaat {
  const waarschuwingen: string[] = [];
  const bewijs: string[] = [];

  // Kopgegevens uit de volledige tekst
  const nummers = Array.from(new Set(
    Array.from(tekst.matchAll(/\b([A-Z]{2,8}(?:-[A-Z]{2,8})?-\d{3,6})\b/g)).map((x) => x[1]),
  ));
  const calculatienummer = nummers[0] ?? null;
  const projectnummer = nummers.find((n) => n !== calculatienummer) ?? null;

  let naam: string | null = null;
  if (calculatienummer) {
    const naamMatch = tekst.match(new RegExp(`${calculatienummer}\\s+([\\s\\S]*?)\\(`));
    if (naamMatch) {
      const kandidaat = naamMatch[1].replace(/\s+/g, " ").trim().replace(/,\s*$/, "");
      if (kandidaat.length >= 3 && kandidaat.length <= 200) naam = kandidaat;
    }
  }

  const opdrachtgeverMatch = tekst.match(/\(Offerte\)\s*([^\n]*?)\s+\d{1,2}-\d{1,2}-\d{4}/);
  const opdrachtgever = opdrachtgeverMatch && opdrachtgeverMatch[1].trim().length > 1
    ? opdrachtgeverMatch[1].trim()
    : null;

  const datumMatch = tekst.match(/(\d{1,2}-\d{1,2}-\d{4})/);
  const datum = datumMatch ? datumMatch[1] : null;

  if (calculatienummer) bewijs.push(`Calculatienummer herkend: ${calculatienummer}`);
  if (projectnummer) bewijs.push(`Projectnummer herkend: ${projectnummer}`);
  if (opdrachtgever) bewijs.push(`Opdrachtgever herkend: ${opdrachtgever}`);

  const { opslagen, bron: opslagenBron, bewijs: opslagBewijs } = detecteerOpslagen(tekst);
  bewijs.push(...opslagBewijs);

  // Regelparsing met een kleine toestandsmachine per regel
  const hoofdstukken: EnkHoofdstuk[] = [];
  let huidig: EnkHoofdstuk | null = null;
  let totaalEnkCenten: number | null = null;
  let inKop = false;

  const regelPatroon = /^(.+?)\s+(\d+(?:[.,]\d+)?)\s*€\s*([\d.]+,\d{2})\s*([a-zA-Z][a-zA-Z0-9²]{0,4})?$/;
  const hoofdstukTotaalPatroon = /^(.+?)\s+(?:1\s+)?€\s*([\d.]+,\d{2})\s*$/;
  const eindtotaalPatroon = /^totaal\s+calculatie\s*€?\s*([\d.]+,\d{2})\s*$/i;

  for (const ruweRegel of tekst.split("\n")) {
    const regel = ruweRegel.trim();
    if (!regel) continue;

    // Paginakop overslaan: tussen "Calculatierapport" en de tabelkop
    if (/^Calculatierapport$/i.test(regel)) { inKop = true; continue; }
    if (/omschrijving\s+aantal/i.test(regel)) { inKop = false; continue; }
    if (inKop) continue;
    if (/^pagina \d+ van \d+$/i.test(regel)) continue;
    if (/^-- \d+ of \d+ --$/.test(regel)) continue;

    const eindMatch = regel.match(eindtotaalPatroon);
    if (eindMatch) {
      totaalEnkCenten = parseEuroNaarCenten(eindMatch[1]);
      bewijs.push(`Eindtotaal in bestand: € ${eindMatch[1]}`);
      continue;
    }

    // Hoofdstuktotaal ("Applicatiewerk € 152.535,82" en de duplicaat "Applicatiewerk 1 € ...")
    const totaalMatch = regel.match(hoofdstukTotaalPatroon);
    if (totaalMatch && huidig && totaalMatch[1].trim() === huidig.naam) {
      const centen = parseEuroNaarCenten(totaalMatch[2]);
      if (centen !== null) {
        if (huidig.totaalEnkCenten === null) {
          huidig.totaalEnkCenten = centen;
          bewijs.push(`Hoofdstuktotaal ${huidig.naam}: € ${totaalMatch[2]}`);
        } else if (huidig.totaalEnkCenten !== centen) {
          waarschuwingen.push(`Hoofdstuk ${huidig.naam}: afwijkende totaalregels in het bestand (€ ${centenNaarEuroTekst(huidig.totaalEnkCenten)} en € ${totaalMatch[2]}).`);
        }
      }
      continue;
    }

    // Geprijsde regel
    const regelMatch = regel.match(regelPatroon);
    if (regelMatch) {
      const centen = parseEuroNaarCenten(regelMatch[3]);
      const hoeveelheid = parseFloat(regelMatch[2].replace(",", "."));
      if (centen !== null && Number.isFinite(hoeveelheid)) {
        if (!huidig) {
          huidig = { naam: "Werkzaamheden", totaalEnkCenten: null, somRegelsCenten: 0, regels: [] };
          hoofdstukken.push(huidig);
        }
        huidig.regels.push({
          omschrijving: regelMatch[1].trim(),
          hoeveelheid,
          eenheid: (regelMatch[4] ?? "st").trim() || "st",
          totaalCenten: centen,
          opmerkingen: null,
          isBouwplaatskosten: isBouwplaatsHoofdstuk(huidig.naam),
        });
        continue;
      }
    }

    // Kale tekstregel: nieuw hoofdstuk (als vorige is afgesloten) of tekstregel binnen hoofdstuk
    if (!huidig || huidig.totaalEnkCenten !== null) {
      huidig = { naam: regel, totaalEnkCenten: null, somRegelsCenten: 0, regels: [] };
      hoofdstukken.push(huidig);
    } else {
      huidig.regels.push({
        omschrijving: regel,
        hoeveelheid: 0,
        eenheid: "",
        totaalCenten: 0,
        opmerkingen: null,
        isBouwplaatskosten: false,
      });
    }
  }

  voegPrecisieWaarschuwingToe(hoofdstukken, waarschuwingen);

  // Reconciliatie per hoofdstuk en op eindtotaal
  for (const h of hoofdstukken) {
    h.somRegelsCenten = somCenten(h.regels.map((r) => r.totaalCenten));
    if (h.totaalEnkCenten !== null && h.somRegelsCenten !== h.totaalEnkCenten) {
      const verschil = h.totaalEnkCenten - h.somRegelsCenten;
      waarschuwingen.push(
        `Hoofdstuk ${h.naam}: som van de regels (€ ${centenNaarEuroTekst(h.somRegelsCenten)}) wijkt € ${centenNaarEuroTekst(Math.abs(verschil))} af van het hoofdstuktotaal in het bestand (€ ${centenNaarEuroTekst(h.totaalEnkCenten)}). Dit is doorgaans een afronding in ENK.`,
      );
    }
  }

  // Lege hoofdstukken zonder regels en zonder totaal weglaten (losse tekstkoppen aan het eind)
  const gevuld = hoofdstukken.filter((h) => h.regels.length > 0 || h.totaalEnkCenten !== null);

  const geprijsd = gevuld.reduce((s, h) => s + h.regels.filter((r) => r.totaalCenten !== 0).length, 0);
  bewijs.push(`${geprijsd} geprijsde regels herkend in ${gevuld.length} hoofdstuk(ken).`);

  if (totaalEnkCenten !== null) {
    const somHoofdstukTotalen = somCenten(gevuld.map((h) => h.totaalEnkCenten ?? h.somRegelsCenten));
    if (somHoofdstukTotalen !== totaalEnkCenten) {
      waarschuwingen.push(
        `Som van de hoofdstuktotalen (€ ${centenNaarEuroTekst(somHoofdstukTotalen)}) wijkt af van het eindtotaal in het bestand (€ ${centenNaarEuroTekst(totaalEnkCenten)}).`,
      );
    }
  } else {
    waarschuwingen.push("Geen eindtotaal ('Totaal calculatie') gevonden in het bestand.");
  }

  return {
    succes: geprijsd > 0,
    calculatienummer,
    projectnummer,
    naam,
    opdrachtgever,
    datum,
    hoofdstukken: gevuld,
    opslagen,
    opslagenBron,
    totaalEnkCenten,
    waarschuwingen,
    bewijs,
    aiGebruikt: false,
  };
}

// ── CSV / Excel ───────────────────────────────────────────────────────────────

/**
 * Parseert tabulaire data (CSV of Excel-rijen) naar hetzelfde resultaat.
 * Verwachte kolommen (vrije volgorde, herkend op kopnaam): omschrijving,
 * aantal/hoeveelheid, eenheid, totaal/bedrag/prijs, hoofdstuk (optioneel).
 */
export function parseEnkRijen(rijen: unknown[][], bewijsBron: string): EnkParseResultaat {
  const waarschuwingen: string[] = [];
  const bewijs: string[] = [`Tabulaire import (${bewijsBron}): ${rijen.length} rijen gelezen.`];

  if (rijen.length < 2) {
    return {
      succes: false, calculatienummer: null, projectnummer: null, naam: null,
      opdrachtgever: null, datum: null, hoofdstukken: [], opslagen: { ...LEGE_OPSLAGEN },
      opslagenBron: "standaard", totaalEnkCenten: null,
      waarschuwingen: ["Te weinig rijen om een calculatie uit af te leiden."], bewijs, aiGebruikt: false,
    };
  }

  const kop = rijen[0].map((c) => String(c ?? "").toLowerCase().trim());
  const vind = (...namen: string[]) => kop.findIndex((k) => namen.some((n) => k.includes(n)));
  const iOmschrijving = vind("omschrijving", "beschrijving");
  const iAantal = vind("aantal", "hoeveelheid");
  const iEenheid = vind("eenheid", "eenh");
  const iTotaal = vind("totaal", "bedrag", "prijs");
  const iHoofdstuk = vind("hoofdstuk", "rubriek", "groep");

  if (iOmschrijving < 0 || iTotaal < 0) {
    return {
      succes: false, calculatienummer: null, projectnummer: null, naam: null,
      opdrachtgever: null, datum: null, hoofdstukken: [], opslagen: { ...LEGE_OPSLAGEN },
      opslagenBron: "standaard", totaalEnkCenten: null,
      waarschuwingen: ["Kolommen 'omschrijving' en 'totaal/bedrag' zijn niet gevonden in de kopregel."],
      bewijs, aiGebruikt: false,
    };
  }

  const perHoofdstuk = new Map<string, EnkHoofdstuk>();
  const volgorde: EnkHoofdstuk[] = [];
  for (const rij of rijen.slice(1)) {
    const omschrijving = String(rij[iOmschrijving] ?? "").trim();
    if (!omschrijving) continue;
    const ruwTotaal = rij[iTotaal];
    const centen = typeof ruwTotaal === "number"
      ? euroGetalNaarCenten(ruwTotaal)
      : parseEuroNaarCenten(String(ruwTotaal ?? ""));
    const ruwAantal = iAantal >= 0 ? rij[iAantal] : null;
    const hoeveelheid = typeof ruwAantal === "number"
      ? ruwAantal
      : parseFloat(String(ruwAantal ?? "").replace(",", "."));
    const eenheid = iEenheid >= 0 ? String(rij[iEenheid] ?? "st").trim() || "st" : "st";
    const hoofdstukNaam = iHoofdstuk >= 0 ? String(rij[iHoofdstuk] ?? "").trim() || "Werkzaamheden" : "Werkzaamheden";

    let h = perHoofdstuk.get(hoofdstukNaam);
    if (!h) {
      h = { naam: hoofdstukNaam, totaalEnkCenten: null, somRegelsCenten: 0, regels: [] };
      perHoofdstuk.set(hoofdstukNaam, h);
      volgorde.push(h);
    }
    h.regels.push({
      omschrijving,
      hoeveelheid: Number.isFinite(hoeveelheid) ? hoeveelheid : 0,
      eenheid,
      totaalCenten: centen ?? 0,
      opmerkingen: null,
      isBouwplaatskosten: isBouwplaatsHoofdstuk(hoofdstukNaam),
    });
  }

  for (const h of volgorde) h.somRegelsCenten = somCenten(h.regels.map((r) => r.totaalCenten));
  const geprijsd = volgorde.reduce((s, h) => s + h.regels.filter((r) => r.totaalCenten !== 0).length, 0);
  const totaal = somCenten(volgorde.map((h) => h.somRegelsCenten));
  bewijs.push(`${geprijsd} geprijsde regels herkend; regelsom € ${centenNaarEuroTekst(totaal)}.`);
  bewijs.push(`Geen expliciete opslagpercentages in het bestand; standaard ENK-opslagen aangenomen: materiaal ${STANDAARD_OPSLAGEN.materiaal}%, arbeid ${STANDAARD_OPSLAGEN.arbeid}%, AK ${STANDAARD_OPSLAGEN.ak}%, risico ${STANDAARD_OPSLAGEN.risico}%, winst ${STANDAARD_OPSLAGEN.winst}%, korting ${STANDAARD_OPSLAGEN.korting}%.`);
  waarschuwingen.push("Tabulaire import bevat geen eindtotaal van ENK zelf; de regelsom is als ENK-totaal aangehouden.");
  voegPrecisieWaarschuwingToe(volgorde, waarschuwingen);


  return {
    succes: geprijsd > 0,
    calculatienummer: null, projectnummer: null, naam: null, opdrachtgever: null, datum: null,
    hoofdstukken: volgorde,
    opslagen: { ...STANDAARD_OPSLAGEN },

    opslagenBron: "standaard",
    totaalEnkCenten: geprijsd > 0 ? totaal : null,
    waarschuwingen,
    bewijs,
    aiGebruikt: false,
  };
}

// ── AI-vangnet ────────────────────────────────────────────────────────────────

const AI_PROMPT = `Je bent een parser voor Nederlandse ENK-calculatierapporten van bouw-/brandpreventiebedrijven.
Je krijgt de ruwe tekst van zo'n rapport. Geef UITSLUITEND geldige JSON terug, zonder toelichting, in dit formaat:
{
  "calculatienummer": string|null,
  "projectnummer": string|null,
  "naam": string|null,
  "opdrachtgever": string|null,
  "datum": string|null,
  "totaal_eur": number|null,
  "opslagen": {"materiaal":number,"arbeid":number,"ak":number,"abk":number,"risico":number,"winst":number,"korting":number},
  "hoofdstukken": [{"naam": string, "totaal_eur": number|null, "regels": [{"omschrijving": string, "hoeveelheid": number, "eenheid": string, "totaal_eur": number}]}]
}
Bedragen als getal in euro's (bv. 5408.85). Regels zonder bedrag mag je weglaten. Opslagen alleen invullen als ze letterlijk in de tekst staan, anders 0.`;

export async function parseEnkMetAi(tekst: string): Promise<EnkParseResultaat | null> {
  if (!heeftGateway()) return null;
  const resultaat = await aiGateway.chat("default", {
    messages: [
      { role: "system", content: AI_PROMPT },
      { role: "user", content: tekst.slice(0, 24000) },
    ],
    max_completion_tokens: 4000,
  });
  if (!resultaat.ok) return null;
  const raw = resultaat.inhoud.trim();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw.startsWith("```") ? raw.replace(/```json?\n?/g, "").replace(/```/g, "") : raw) as Record<string, unknown>;
  } catch {
    return null;
  }

  const hoofdstukkenRuw = Array.isArray(parsed["hoofdstukken"]) ? (parsed["hoofdstukken"] as Array<Record<string, unknown>>) : [];
  const hoofdstukken: EnkHoofdstuk[] = hoofdstukkenRuw.map((h) => {
    const naam = typeof h["naam"] === "string" && h["naam"].trim() ? h["naam"].trim() : "Werkzaamheden";
    const regelsRuw = Array.isArray(h["regels"]) ? (h["regels"] as Array<Record<string, unknown>>) : [];
    const regels: EnkRegel[] = regelsRuw
      .filter((r) => typeof r["omschrijving"] === "string")
      .map((r) => ({
        omschrijving: String(r["omschrijving"]).trim(),
        hoeveelheid: typeof r["hoeveelheid"] === "number" && Number.isFinite(r["hoeveelheid"]) ? r["hoeveelheid"] : 0,
        eenheid: typeof r["eenheid"] === "string" && r["eenheid"].trim() ? r["eenheid"].trim() : "st",
        totaalCenten: typeof r["totaal_eur"] === "number" && Number.isFinite(r["totaal_eur"]) ? euroGetalNaarCenten(r["totaal_eur"]) : 0,
        opmerkingen: null,
        isBouwplaatskosten: isBouwplaatsHoofdstuk(naam),
      }));
    return {
      naam,
      totaalEnkCenten: typeof h["totaal_eur"] === "number" && Number.isFinite(h["totaal_eur"]) ? euroGetalNaarCenten(h["totaal_eur"]) : null,
      somRegelsCenten: somCenten(regels.map((r) => r.totaalCenten)),
      regels,
    };
  }).filter((h) => h.regels.length > 0 || h.totaalEnkCenten !== null);

  const opslagenRuw = (parsed["opslagen"] ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100 ? v : 0);
  const opslagen: EnkOpslagen = {
    materiaal: num(opslagenRuw["materiaal"]),
    arbeid: num(opslagenRuw["arbeid"]),
    ak: num(opslagenRuw["ak"]),
    abk: num(opslagenRuw["abk"]),
    risico: num(opslagenRuw["risico"]),
    winst: num(opslagenRuw["winst"]),
    korting: num(opslagenRuw["korting"]),
  };
  const opslagenGedetecteerd = Object.values(opslagen).some((v) => v > 0);
  const effectieveOpslagen = opslagenGedetecteerd ? opslagen : { ...STANDAARD_OPSLAGEN };


  const geprijsd = hoofdstukken.reduce((s, h) => s + h.regels.filter((r) => r.totaalCenten !== 0).length, 0);
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

  return {
    succes: geprijsd > 0,
    calculatienummer: str(parsed["calculatienummer"]),
    projectnummer: str(parsed["projectnummer"]),
    naam: str(parsed["naam"]),
    opdrachtgever: str(parsed["opdrachtgever"]),
    datum: str(parsed["datum"]),
    hoofdstukken,
    opslagen: effectieveOpslagen,

    opslagenBron: opslagenGedetecteerd ? "gedetecteerd" : "standaard",
    totaalEnkCenten: typeof parsed["totaal_eur"] === "number" && Number.isFinite(parsed["totaal_eur"]) ? euroGetalNaarCenten(parsed["totaal_eur"] as number) : null,
    waarschuwingen: ["De structuur is met AI-hulp uitgelezen; controleer de regels en totalen extra zorgvuldig."],
    bewijs: [`AI-vangnet gebruikt: ${geprijsd} geprijsde regels herkend in ${hoofdstukken.length} hoofdstuk(ken).`],
    aiGebruikt: true,
  };
}
