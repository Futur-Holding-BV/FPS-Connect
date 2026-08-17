// Gerichte arbeidscontract-extractie (wervingVoorbereiding-patroon).
//
// Leest een arbeidsovereenkomst (PDF met tekstlaag of gescand via vision) en
// extraheert een vaste set contractvelden, elk met een vindplaats (pagina +
// letterlijk citaat) in het document. Fail-closed: een waarde ZONDER
// vindplaats wordt niet doorgegeven — het veld blijft leeg in plaats van een
// gok. De uitkomst is altijd een voorstel; opslaan gebeurt uitsluitend nadat
// een mens het expliciet overneemt (nooit stil).
import { db, medewerkersTable } from "@workspace/db";
import { extraheerPdfTekst } from "../lib/pdfTekst";
import { renderPdfPaginasMetStatus } from "../lib/pdfVisie";
import { kortTekstInKopStaart, MAX_VISION_PAGINAS } from "../lib/documentIntelligence";
import { aiGateway, heeftGateway } from "../lib/aiGateway";

export type Vindplaats = { pagina: number | null; citaat: string };
export type ContractVeld = { waarde: string | number | null; vindplaats: Vindplaats | null };

export const CONTRACT_VELD_NAMEN = [
  "werkmaatschappij",
  "werknemer_naam",
  "functie",
  "datum_in_dienst",
  "contract_type",
  "einddatum",
  "proeftijd",
  "uren_per_week",
  "uren_min_per_week",
  "uren_max_per_week",
  "salaris",
  "salaris_eenheid",
  "cao",
  "opzegtermijn",
  "aanzegtermijn",
  "reiskostenvergoeding",
  "concurrentiebeding",
  "relatiebeding",
] as const;
export type ContractVeldNaam = (typeof CONTRACT_VELD_NAMEN)[number];
export type ContractVelden = Record<ContractVeldNaam, ContractVeld>;

export type ContractExtractieResultaat =
  | {
      ok: true;
      velden: ContractVelden;
      ai_toelichting: string | null;
      vision_gebruikt: boolean;
      paginas_geanalyseerd: number[] | null;
    }
  | { ok: false; status: 422 | 500 | 503; fout: string };

const PROMPT_NAAM = "hrm-contract-extractie";
const PROMPT_VERSIE = "1.0.0";

// ── Extractie ────────────────────────────────────────────────────────────────

export async function extraheerArbeidsovereenkomst(opties: {
  buffer: Buffer;
  bestandsnaam: string;
  contentType?: string | null;
  gebruikerId?: number | null;
}): Promise<ContractExtractieResultaat> {
  const { buffer, bestandsnaam, contentType, gebruikerId } = opties;

  if (!heeftGateway()) {
    return { ok: false, status: 503, fout: "AI is niet beschikbaar. Vul de velden handmatig in." };
  }

  const isPdf =
    (contentType ?? "").includes("pdf") || bestandsnaam.toLowerCase().endsWith(".pdf");

  // Tekstlaag ophalen (per pagina waar mogelijk, voor vindplaats-verwijzingen).
  let tekst = "";
  let paginaTeksten: string[] = [];
  let paginaAantal: number | null = null;
  if (isPdf) {
    try {
      const parsed = await extraheerPdfTekst(buffer);
      tekst = parsed.tekst ?? "";
      paginaTeksten = parsed.paginaTeksten ?? [];
      paginaAantal = parsed.paginaAantal ?? null;
    } catch {
      /* geen tekstlaag — vision hieronder */
    }
  } else {
    tekst = buffer.toString("utf-8");
  }

  // Gescand contract zonder tekstlaag: pagina's als afbeelding aanbieden
  // (vision), inclusief de laatste pagina — daar staan de slotbepalingen
  // (bedingen, opzegtermijn) en de ondertekening.
  let afbeeldingen: Array<{ paginaNummer: number; base64: string }> = [];
  if (isPdf && tekst.trim().length < 200) {
    const nummers = Array.from(
      { length: Math.min(paginaAantal ?? MAX_VISION_PAGINAS, MAX_VISION_PAGINAS) },
      (_, i) => i + 1,
    );
    if (paginaAantal && paginaAantal > MAX_VISION_PAGINAS) nummers[nummers.length - 1] = paginaAantal;
    const render = await renderPdfPaginasMetStatus(buffer, nummers);
    afbeeldingen = render.paginas;
    if (afbeeldingen.length === 0 && !tekst.trim()) {
      return {
        ok: false,
        status: 422,
        fout: `Contract kon niet gelezen worden: ${render.fout ?? "geen tekstlaag en paginaweergave mislukt"}. Vul de gegevens handmatig in.`,
      };
    }
  }

  if (afbeeldingen.length === 0 && tekst.trim().length < 200) {
    return {
      ok: false,
      status: 422,
      fout: "Contract bevat geen (voldoende) leesbare inhoud. Controleer het bestand of vul de gegevens handmatig in.",
    };
  }

  const contractTekst =
    paginaTeksten.length > 0
      ? paginaTeksten.map((t, i) => `--- Pagina ${i + 1} ---\n${(t ?? "").trim()}`).join("\n\n")
      : tekst;

  const VELD_SPEC = `{
  "waarde": <de gevonden waarde, of null als het contract dit niet vermeldt>,
  "vindplaats": { "pagina": <paginanummer of null>, "citaat": "<letterlijk kort citaat uit het contract, max 200 tekens>" } of null
}`;

  const prompt = `Je analyseert een Nederlands arbeidscontract. Extraheer UITSLUITEND wat er letterlijk in het contract staat — verzin niets, en gebruik null wanneer iets ontbreekt of onduidelijk is. Elke waarde MOET een vindplaats hebben (pagina + letterlijk citaat); een waarde zonder vindplaats wordt genegeerd. Antwoord UITSLUITEND met een geldig JSON-object.

Elk veld heeft deze vorm:
${VELD_SPEC}

Extraheer exact deze velden:
{
  "werkmaatschappij": <veld: naam van de werkgever/werkmaatschappij (string)>,
  "werknemer_naam": <veld: volledige naam van de werknemer (string)>,
  "functie": <veld: functietitel (string)>,
  "datum_in_dienst": <veld: datum indiensttreding als YYYY-MM-DD (string)>,
  "contract_type": <veld: "bepaalde_tijd", "onbepaalde_tijd" of "oproep" (nul-uren/oproepcontract) (string)>,
  "einddatum": <veld: einddatum bij bepaalde tijd als YYYY-MM-DD (string)>,
  "proeftijd": <veld: proeftijd zoals vermeld, bv. "1 maand" (string)>,
  "uren_per_week": <veld: vast aantal uur per week (getal); null bij een min-max-bandbreedte>,
  "uren_min_per_week": <veld: minimum uren per week bij nul-uren/min-max-contract (getal)>,
  "uren_max_per_week": <veld: maximum uren per week bij nul-uren/min-max-contract (getal)>,
  "salaris": <veld: brutosalaris als getal, zonder valutateken>,
  "salaris_eenheid": <veld: "maand" | "4-weken" | "week" | "uur" | "jaar" (string) — de eenheid waarin het salaris in het contract staat>,
  "cao": <veld: naam van de van toepassing zijnde CAO (string)>,
  "opzegtermijn": <veld: opzegtermijn zoals vermeld, bv. "1 maand voor werknemer, 2 maanden voor werkgever" (string)>,
  "aanzegtermijn": <veld: aanzegtermijn zoals vermeld (string)>,
  "reiskostenvergoeding": <veld: reiskostenregeling zoals vermeld, bv. "€ 0,23 per km" (string)>,
  "concurrentiebeding": <veld: "ja" of "nee" met als citaat de kernbepaling>,
  "relatiebeding": <veld: "ja" of "nee" met als citaat de kernbepaling>,
  "ai_toelichting": "korte opmerking over betrouwbaarheid/leesbaarheid of null (max 1 zin)"
}

CONTRACTTEKST${afbeeldingen.length > 0 ? " (aangevuld met paginascans hieronder — gebruik het paginanummer van de scan als vindplaats)" : ""}:
${kortTekstInKopStaart(contractTekst, 20000, 10000) || "GEEN tekstlaag — lees de bijgevoegde paginascans."}`;

  type ContentBlock =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail: "high" } };
  const content: ContentBlock[] = [{ type: "text", text: prompt }];
  for (const afb of afbeeldingen) {
    content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${afb.base64}`, detail: "high" } });
  }

  const resultaat = await aiGateway.chat(
    afbeeldingen.length > 0 ? "vision" : "default",
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: [{ role: "user", content: content as any }],
      max_tokens: 2000,
      response_format: { type: "json_object" },
    },
    undefined,
    {
      module: "personeel",
      functie: "contractExtractie",
      gebruikerId: gebruikerId ?? null,
      promptNaam: PROMPT_NAAM,
      promptVersie: PROMPT_VERSIE,
    },
  );
  if (!resultaat.ok) {
    return { ok: false, status: 503, fout: "AI-analyse mislukt. Probeer opnieuw." };
  }

  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(resultaat.inhoud);
  } catch {
    return { ok: false, status: 500, fout: "AI gaf een ongeldig antwoord. Probeer opnieuw." };
  }

  return {
    ok: true,
    velden: hardenContractVelden(parsed),
    ai_toelichting: typeof parsed.ai_toelichting === "string" ? parsed.ai_toelichting : null,
    vision_gebruikt: afbeeldingen.length > 0,
    paginas_geanalyseerd: afbeeldingen.length > 0 ? afbeeldingen.map((a) => a.paginaNummer) : null,
  };
}

// ── Harden (fail-closed) ─────────────────────────────────────────────────────
// Alleen goedgevormde velden doorlaten; een waarde ZONDER vindplaats wordt
// leeggemaakt — het formulier gokt nooit.

export function hardenContractVelden(raw: Record<string, unknown>): ContractVelden {
  const leesVeld = (naam: string): ContractVeld => {
    const r = raw[naam];
    if (typeof r !== "object" || r === null) return { waarde: null, vindplaats: null };
    const rec = r as Record<string, unknown>;
    let waarde: string | number | null =
      typeof rec.waarde === "string"
        ? rec.waarde.trim() || null
        : typeof rec.waarde === "number" && Number.isFinite(rec.waarde)
          ? rec.waarde
          : null;
    let vindplaats: Vindplaats | null = null;
    if (typeof rec.vindplaats === "object" && rec.vindplaats !== null) {
      const v = rec.vindplaats as Record<string, unknown>;
      const citaat = typeof v.citaat === "string" ? v.citaat.trim().slice(0, 300) : "";
      if (citaat) {
        vindplaats = {
          pagina:
            typeof v.pagina === "number" && Number.isInteger(v.pagina) && v.pagina > 0 ? v.pagina : null,
          citaat,
        };
      }
    }
    // Fail-closed: zonder vindplaats geen waarde (geen gok in het formulier).
    if (!vindplaats) waarde = null;
    return { waarde, vindplaats };
  };

  const velden = {} as ContractVelden;
  for (const naam of CONTRACT_VELD_NAMEN) velden[naam] = leesVeld(naam);

  // Normalisaties per veld (whitelist; onbekende waarde → leeg).
  const normEnum = (veld: ContractVeldNaam, toegestaan: string[]) => {
    const v = velden[veld];
    if (typeof v.waarde !== "string") return;
    const genorm = v.waarde.toLowerCase().trim().replace(/\s+/g, "_");
    velden[veld] = toegestaan.includes(genorm) ? { ...v, waarde: genorm } : { waarde: null, vindplaats: v.vindplaats };
  };
  normEnum("contract_type", ["bepaalde_tijd", "onbepaalde_tijd", "oproep"]);
  normEnum("concurrentiebeding", ["ja", "nee"]);
  normEnum("relatiebeding", ["ja", "nee"]);
  const normSalarisEenheid = () => {
    const v = velden.salaris_eenheid;
    if (typeof v.waarde !== "string") return;
    const genorm = v.waarde.toLowerCase().replace(/\s+/g, "").replace("per", "");
    const map: Record<string, string> = {
      maand: "maand", "4-weken": "4-weken", "4weken": "4-weken", vierweken: "4-weken",
      week: "week", uur: "uur", jaar: "jaar",
    };
    velden.salaris_eenheid = map[genorm]
      ? { ...v, waarde: map[genorm] }
      : { waarde: null, vindplaats: v.vindplaats };
  };
  normSalarisEenheid();
  // Datums: alleen geldige YYYY-MM-DD doorlaten.
  for (const naam of ["datum_in_dienst", "einddatum"] as const) {
    const v = velden[naam];
    if (typeof v.waarde === "string" && !/^\d{4}-\d{2}-\d{2}$/.test(v.waarde)) {
      velden[naam] = { waarde: null, vindplaats: v.vindplaats };
    }
  }
  // Numerieke velden: strings met getal omzetten, anders leeg.
  for (const naam of ["uren_per_week", "uren_min_per_week", "uren_max_per_week", "salaris"] as const) {
    const v = velden[naam];
    if (typeof v.waarde === "string") {
      const num = Number(v.waarde.replace(/\./g, "").replace(",", "."));
      velden[naam] = Number.isFinite(num) ? { ...v, waarde: num } : { waarde: null, vindplaats: v.vindplaats };
    }
  }
  return velden;
}

// ── Proeftijd-tekst → dagen (deterministisch, fail-closed) ──────────────────

export function proeftijdNaarDagen(tekst: string | null | undefined): number | null {
  if (!tekst) return null;
  const t = tekst.toLowerCase();
  if (/\bgeen\b|\bniet van toepassing\b|\bn\.?v\.?t\.?\b/.test(t)) return 0;
  const woorden: Record<string, number> = { een: 1, één: 1, twee: 2, drie: 3, vier: 4 };
  const m = t.match(/(\d+|een|één|twee|drie|vier)\s*(maand|maanden|week|weken|dag|dagen)/);
  if (!m) return null;
  const n = woorden[m[1]] ?? Number(m[1]);
  if (!Number.isFinite(n)) return null;
  if (m[2].startsWith("maand")) return n * 30;
  if (m[2].startsWith("week")) return n * 7;
  return n;
}

// ── Medewerker-matching op gelezen naam (deterministisch) ────────────────────
// Exacte genormaliseerde match wint; anders unieke deelmatch. Bij twijfel
// (0 of >1 kandidaten) géén voorstel — de gebruiker kiest zelf.

function normNaam(naam: string): string {
  return naam
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function zoekMedewerkerOpNaam(
  naam: string | null | undefined,
): Promise<{ id: number; naam: string } | null> {
  if (!naam || !naam.trim()) return null;
  const doel = normNaam(naam);
  if (doel.length < 3) return null;
  const medewerkers = await db
    .select({ id: medewerkersTable.id, naam: medewerkersTable.naam })
    .from(medewerkersTable);
  const exact = medewerkers.filter((m) => normNaam(m.naam) === doel);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  const deel = medewerkers.filter((m) => {
    const n = normNaam(m.naam);
    return n.includes(doel) || doel.includes(n);
  });
  return deel.length === 1 ? deel[0] : null;
}
