// WERVING_01 — AI-voorbereiding sollicitatiegesprek.
//
// De AI geeft NOOIT een oordeel, score, cijfer, rangschikking of
// geschiktheidsuitspraak (EU AI-verordening: een systeem dat uitsluitend
// voorbereidt en structureert valt niet onder de hoogrisico-verplichtingen
// van beoordelen/rangschikken van kandidaten).
//
// Wat de AI wél doet:
// 1. Per eis uit de functieomschrijving toetsen wat aantoonbaar in het cv
//    staat — drie standen: aantoonbaar_aanwezig · niet_genoemd · onduidelijk.
// 2. Onderbouwen met vindplaats. Zonder vindplaats = fail-closed
//    "niet_genoemd" (server-side afgedwongen, niet alleen prompt).
// 3. Vragen opstellen voor alles wat niet genoemd/onduidelijk is + doorvragen.
//
// Verboden invoer om mee te wegen of te noemen: naam, leeftijd/geboortejaar,
// geslacht, nationaliteit/geboorteland, foto, adres/woonplaats, burgerlijke
// staat, gezondheid. Gaten in arbeidsverleden mogen als vraag ("periode X
// niet toegelicht"), nooit met gissing naar de oorzaak.

import { aiGateway, heeftGateway } from "../lib/aiGateway";
import { extraheerTekst } from "../lib/documentIntelligence";
import { renderPdfPaginas, resizeAfbeelding } from "../lib/pdfVisie";
import { logger } from "../lib/logger";
import type OpenAI from "openai";
import type { Functie } from "@workspace/db";

export const TOETSING_STANDEN = ["aantoonbaar_aanwezig", "niet_genoemd", "onduidelijk"] as const;
export type ToetsingStand = (typeof TOETSING_STANDEN)[number];

export const EIS_CATEGORIEEN = ["taken", "verantwoordelijkheden", "competenties", "opleidingsvereisten"] as const;
export type EisCategorie = (typeof EIS_CATEGORIEEN)[number];

export interface ToetsingItem {
  categorie: EisCategorie;
  eis: string;
  stand: ToetsingStand;
  /** Waar in het cv dit staat (citaat of sectie). Verplicht bij aantoonbaar_aanwezig. */
  vindplaats: string | null;
  toelichting: string | null;
}

export interface CvVraag {
  vraag: string;
  /** Waarom deze vraag: welk punt niet genoemd/onduidelijk is of doorvragen verdient. */
  aanleiding: string | null;
}

export type VoorbereidingUitkomst =
  | { ok: true; toetsing: ToetsingItem[]; cvVragen: CvVraag[]; bron: string }
  | { ok: false; status: 422 | 500 | 503; fout: string };

export type KernvragenUitkomst =
  | { ok: true; vragen: string[] }
  | { ok: false; status: 500 | 503; fout: string };

const alsTekst = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

const PRIVACY_REGELS = `HARDE REGELS (verplicht, geen uitzonderingen):
- Je geeft NOOIT een oordeel, score, cijfer, percentage, rangschikking of uitspraak over geschiktheid van de kandidaat. Je bereidt uitsluitend voor en structureert.
- Je negeert en noemt NERGENS: naam van de kandidaat, leeftijd, geboortedatum of geboortejaar, geslacht, nationaliteit of geboorteland, foto of uiterlijk, adres of woonplaats, burgerlijke staat, gezondheid. Ook niet indirect ("de kandidaat is jong", "woont dichtbij"). Verwijs naar de kandidaat uitsluitend als "de kandidaat".
- Gaten in het arbeidsverleden mag je opmerken als vraag ("periode X niet toegelicht"), maar NOOIT met een gissing naar de oorzaak.
- Elke uitspraak over aanwezige ervaring/kennis moet een vindplaats in het cv hebben (kort citaat of sectie). Zonder vindplaats geldt de eis als "niet_genoemd" — nooit als aanwezig verondersteld.`;

function functieEisenTekst(functie: Functie): string {
  const delen: string[] = [`Functie: ${functie.naam}`];
  if (functie.omschrijving) delen.push(`Omschrijving: ${functie.omschrijving}`);
  if (functie.taken) delen.push(`Taken:\n${functie.taken}`);
  if (functie.verantwoordelijkheden) delen.push(`Verantwoordelijkheden:\n${functie.verantwoordelijkheden}`);
  if (functie.competenties) delen.push(`Competenties:\n${functie.competenties}`);
  if (functie.opleidingsvereisten) delen.push(`Opleidingsvereisten:\n${functie.opleidingsvereisten}`);
  return delen.join("\n\n");
}

function heeftFunctieEisen(functie: Functie): boolean {
  return Boolean(functie.taken || functie.verantwoordelijkheden || functie.competenties || functie.opleidingsvereisten || functie.omschrijving);
}

// ── Server-side hardening van AI-uitvoer ──────────────────────────────────────
//
// De prompt verbiedt beschermde kenmerken, maar een prompt is geen waarborg
// tegen modelfouten of prompt-injectie via de cv-inhoud. Daarom wordt ELKE
// AI-teksveld vóór opslag deterministisch gecontroleerd: uitvoer die naar een
// beschermd kenmerk of een oordeel/score verwijst wordt nooit gepersisteerd
// (item vervalt of valt fail-closed terug naar "niet_genoemd").

const VERBODEN_KENMERKEN: Array<[RegExp, string]> = [
  [/geboortedatum|geboortejaar|\bgeboren\b|geboorteplaats/i, "geboortedatum"],
  [/\b\d{1,2}[-/]\d{1,2}[-/](19|20)\d{2}\b/, "datum in geboortenotatie"],
  [/\bleeftijd\b|\bjaar oud\b|\b\d{1,3}\s*[- ]?jarige?\b|\b\d{1,3}\s+jaar\b(?!\s+(ervaring|werkervaring|gewerkt|dienst|als|bij|in)\b)|\bjonge\b kandidaat|\boudere\b kandidaat/i, "leeftijd"],
  [/\bgeslacht\b|\bman\b|\bvrouw\b|\bmannelijk\b|\bvrouwelijk\b/i, "geslacht"],
  [/nationaliteit|geboorteland|\bafkomst\b/i, "nationaliteit"],
  // "foto's" van uitgevoerd werk is legitiem functiejargon; het gaat om de
  // pasfoto / foto van de kandidaat zelf.
  [/pasfoto|\bfoto\b(?!['’]s)|uiterlijk/i, "foto/uiterlijk"],
  [/\badres\b|woonplaats|woonachtig|\bwoont\b/i, "adres/woonplaats"],
  [/burgerlijke staat|\bgehuwd\b|\bgetrouwd\b|\bongehuwd\b|alleenstaand/i, "burgerlijke staat"],
  [/gezondheid|\bziekte\b|\bziek\b|handicap|\bmedisch/i, "gezondheid"],
];

const VERBODEN_OORDELEN: Array<[RegExp, string]> = [
  [/\bscore\b|\bcijfer\b|\d+\s*%|\bpercentage\b/i, "score/cijfer"],
  [/geschiktheid|\bgeschikt\b|\bongeschikt\b/i, "geschiktheidsoordeel"],
  [/rangschikking|\branking\b|\bmatch\b/i, "rangschikking/match"],
];

/**
 * Normaliseert de kandidaatnaam naar losse naam-tokens (>= 3 tekens, zonder
 * tussenvoegsels) zodat élk voorkomen van voor- of achternaam in AI-uitvoer
 * deterministisch gedetecteerd wordt.
 */
const normaliseerVoorNaamMatch = (tekst: string): string =>
  tekst
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // Letters zonder NFD-decompositie die in namen voorkomen:
    .replace(/ı/g, "i")
    .replace(/ø/g, "o")
    .replace(/ß/g, "ss")
    .replace(/æ/g, "ae");

export function naamTokens(naam: string | null | undefined): string[] {
  if (!naam) return [];
  const TUSSENVOEGSELS = new Set(["van", "de", "der", "den", "het", "ter", "ten", "te", "op", "in", "aan", "bij", "la", "le", "el", "al"]);
  return normaliseerVoorNaamMatch(naam)
    .split(/[^a-z]+/)
    .filter((t) => t.length >= 3 && !TUSSENVOEGSELS.has(t));
}

/** Geeft het label van het eerste verboden kenmerk/oordeel in de tekst, anders null. */
export function vindVerbodenInhoud(tekst: string | null | undefined, verbodenNaamTokens: string[] = []): string | null {
  if (!tekst) return null;
  for (const [patroon, label] of [...VERBODEN_KENMERKEN, ...VERBODEN_OORDELEN]) {
    if (patroon.test(tekst)) return label;
  }
  if (verbodenNaamTokens.length > 0) {
    const genormaliseerd = normaliseerVoorNaamMatch(tekst);
    for (const token of verbodenNaamTokens) {
      if (new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(genormaliseerd)) {
        return "kandidaatnaam";
      }
    }
  }
  return null;
}

export function hardenToetsing(ruw: unknown, verbodenNaamTokens: string[] = []): ToetsingItem[] {
  if (!Array.isArray(ruw)) return [];
  const items: ToetsingItem[] = [];
  for (const r of ruw.slice(0, 60)) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const eis = alsTekst(o.eis);
    if (!eis) continue;
    const categorie = EIS_CATEGORIEEN.includes(o.categorie as EisCategorie)
      ? (o.categorie as EisCategorie)
      : "competenties";
    let stand: ToetsingStand = TOETSING_STANDEN.includes(o.stand as ToetsingStand)
      ? (o.stand as ToetsingStand)
      : "niet_genoemd";
    // Eis met verboden inhoud wordt nooit gepersisteerd (de eis hoort uit de
    // functieomschrijving te komen, niet uit persoonskenmerken).
    if (vindVerbodenInhoud(eis, verbodenNaamTokens)) continue;
    let vindplaats = alsTekst(o.vindplaats);
    let toelichting = alsTekst(o.toelichting);
    // Verboden inhoud in vindplaats → fail-closed terug naar "niet genoemd".
    if (vindVerbodenInhoud(vindplaats, verbodenNaamTokens)) {
      vindplaats = null;
      if (stand === "aantoonbaar_aanwezig") stand = "niet_genoemd";
    }
    // Verboden inhoud in de toelichting → toelichting vervalt.
    if (vindVerbodenInhoud(toelichting, verbodenNaamTokens)) toelichting = null;
    // Fail-closed: aanwezig zonder vindplaats bestaat niet.
    if (stand === "aantoonbaar_aanwezig" && !vindplaats) stand = "niet_genoemd";
    items.push({
      categorie,
      eis,
      stand,
      vindplaats: stand === "aantoonbaar_aanwezig" || stand === "onduidelijk" ? vindplaats : null,
      toelichting,
    });
  }
  return items;
}

export function hardenVragen(ruw: unknown, verbodenNaamTokens: string[] = []): CvVraag[] {
  if (!Array.isArray(ruw)) return [];
  const vragen: CvVraag[] = [];
  for (const r of ruw.slice(0, 30)) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const vraag = alsTekst(o.vraag);
    if (!vraag) continue;
    // Vraag met verboden inhoud wordt nooit gepersisteerd of getoond.
    if (vindVerbodenInhoud(vraag, verbodenNaamTokens)) continue;
    let aanleiding = alsTekst(o.aanleiding);
    if (vindVerbodenInhoud(aanleiding, verbodenNaamTokens)) aanleiding = null;
    vragen.push({ vraag, aanleiding });
  }
  return vragen;
}

// ── AVG-atomaire kandidaatverwijdering ────────────────────────────────────────
// Het cv-bestand moet aantoonbaar weg zijn vóórdat de rij verdwijnt; anders
// blijft een wees-cv achter in de opslag zonder rij waarmee de periodieke
// AVG-opruiming hem ooit nog kan vinden. Faalt het bestand verwijderen, dan
// blijft de rij staan (fout naar de aanroeper, opnieuw proberen kan altijd).
export async function verwijderKandidaatMetCv(opties: {
  cvObjectPath: string | null;
  verwijderBestand: (objectPath: string) => Promise<void>;
  verwijderRij: () => Promise<void>;
}): Promise<void> {
  if (opties.cvObjectPath) {
    await opties.verwijderBestand(opties.cvObjectPath);
  }
  await opties.verwijderRij();
}

// ── Cv-toetsing + cv-specifieke vragen ────────────────────────────────────────

export async function bereidCvVoor(input: {
  functie: Functie;
  cvBuffer: Buffer;
  cvMime: string;
  cvBestandsnaam: string;
  gebruikerId: number | null;
  kandidaatId: number;
  /** Naam van de kandidaat — uitsluitend gebruikt om naamlekken in AI-uitvoer deterministisch te filteren; gaat NIET mee in de prompt. */
  kandidaatNaam?: string | null;
}): Promise<VoorbereidingUitkomst> {
  if (!heeftGateway()) {
    return { ok: false, status: 503, fout: "AI is niet beschikbaar." };
  }
  if (!heeftFunctieEisen(input.functie)) {
    return {
      ok: false,
      status: 422,
      fout: "De functieomschrijving is leeg (geen taken, verantwoordelijkheden, competenties of opleidingsvereisten). Vul de functie eerst aan in het functiehuis.",
    };
  }

  // Cv-inhoud ophalen: tekstlaag als die er is, anders vision (max 5 pagina's,
  // conform DOCUMENT_01: 220 DPI, detail high).
  const extractie = await extraheerTekst(input.cvBuffer, input.cvMime, input.cvBestandsnaam);
  let cvTekst = extractie.tekst;
  let afbeeldingen: Array<{ paginaNummer: number; base64: string }> = [];
  let bron = extractie.bron as string;

  if (!cvTekst || cvTekst.trim().length < 80) {
    if (input.cvMime === "application/pdf") {
      const aantal = Math.min(extractie.paginaAantal ?? 5, 5);
      try {
        afbeeldingen = await renderPdfPaginas(input.cvBuffer, Array.from({ length: aantal }, (_, i) => i + 1));
        bron = "vision_pdf";
      } catch (err) {
        logger.warn({ err }, "werving: PDF-rendering voor vision mislukt");
      }
    } else if (input.cvMime.startsWith("image/")) {
      const base64 = await resizeAfbeelding(input.cvBuffer);
      if (base64) {
        afbeeldingen = [{ paginaNummer: 1, base64 }];
        bron = "vision_afbeelding";
      }
    }
    if (afbeeldingen.length === 0 && !cvTekst) {
      return { ok: false, status: 422, fout: "Het cv-bestand is niet leesbaar (geen tekstlaag en geen renderbaar beeld)." };
    }
  }

  const systemPrompt = `Je bereidt een sollicitatiegesprek voor. Je toetst een cv uitsluitend aan de eisen uit de functieomschrijving hieronder.

${PRIVACY_REGELS}

FUNCTIEOMSCHRIJVING:
${functieEisenTekst(input.functie)}

OPDRACHT — antwoord uitsluitend als JSON-object met exact deze structuur:
{
  "toetsing": [
    { "categorie": "taken|verantwoordelijkheden|competenties|opleidingsvereisten",
      "eis": "één concrete eis uit de functieomschrijving",
      "stand": "aantoonbaar_aanwezig|niet_genoemd|onduidelijk",
      "vindplaats": "kort citaat of sectieverwijzing uit het cv (verplicht bij aantoonbaar_aanwezig, anders null)",
      "toelichting": "korte feitelijke toelichting zonder oordeel, of null" }
  ],
  "cv_vragen": [
    { "vraag": "open, gedragsgerichte vraag (nooit ja/nee; gericht op wat iemand heeft GEDAAN, niet op wat hij vindt)",
      "aanleiding": "welk punt uit de toetsing deze vraag adresseert" }
  ]
}

Werkwijze:
- Splits elke categorie van de functieomschrijving op in losse, toetsbare eisen; neem élke eis op in "toetsing".
- Stel voor elke eis met stand "niet_genoemd" of "onduidelijk" één open vraag op, plus vragen over aanwezige punten die doorvragen verdienen.
- Neem gaten in het arbeidsverleden op als vraag ("periode X niet toegelicht — kunt u vertellen wat u toen deed?") zonder gissing naar de oorzaak.`;

  const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
  if (cvTekst && cvTekst.trim().length >= 80) {
    userContent.push({ type: "text", text: `CV-TEKST:\n${cvTekst.slice(0, 24000)}` });
  } else {
    userContent.push({ type: "text", text: "Het cv is aangeleverd als beeld (scan). Lees de pagina's hieronder." });
    for (const a of afbeeldingen) {
      userContent.push({
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${a.base64}`, detail: "high" },
      });
    }
  }

  const slot = afbeeldingen.length > 0 ? "vision" : "default";
  const res = await aiGateway.chat(
    slot,
    {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      max_tokens: 3500,
      response_format: { type: "json_object" },
    },
    120_000,
    {
      module: "werving",
      functie: "bereidCvVoor",
      gebruikerId: input.gebruikerId,
      entiteitstype: "werving_kandidaat",
      entiteitId: input.kandidaatId,
      promptNaam: "werving_cv_toetsing",
      promptVersie: "1",
    },
  );
  if (!res.ok) return { ok: false, status: 503, fout: res.fout };

  let ruw: Record<string, unknown>;
  try {
    ruw = JSON.parse(res.inhoud) as Record<string, unknown>;
  } catch {
    return { ok: false, status: 500, fout: "AI gaf een ongeldig antwoord. Probeer opnieuw." };
  }

  const verbodenNamen = naamTokens(input.kandidaatNaam);
  const toetsing = hardenToetsing(ruw.toetsing, verbodenNamen);
  const cvVragen = hardenVragen(ruw.cv_vragen, verbodenNamen);
  if (toetsing.length === 0) {
    return { ok: false, status: 500, fout: "AI leverde geen toetsing per functie-eis op. Probeer opnieuw." };
  }
  return { ok: true, toetsing, cvVragen, bron };
}

// ── Kernvragen-voorstel per functie (zonder cv — identiek voor elke kandidaat) ─

export async function stelKernvragenVoor(input: {
  functie: Functie;
  gebruikerId: number | null;
}): Promise<KernvragenUitkomst> {
  if (!heeftGateway()) {
    return { ok: false, status: 503, fout: "AI is niet beschikbaar." };
  }
  const prompt = `Je stelt vaste kernvragen op voor sollicitatiegesprekken voor onderstaande functie. Deze vragen worden aan ELKE kandidaat op deze functie gesteld (vergelijkbaarheid), dus baseer ze uitsluitend op de functieomschrijving — nooit op een specifiek cv.

${PRIVACY_REGELS}

FUNCTIEOMSCHRIJVING:
${functieEisenTekst(input.functie)}

Regels voor de vragen:
- open vragen, nooit ja/nee;
- gedragsgericht: wat iemand heeft GEDAAN, niet wat hij vindt ("beschrijf een situatie waarin ... en wat u toen deed" in plaats van "bent u nauwkeurig");
- 5 tot 8 vragen, elk gekoppeld aan een kerneis van de functie.

Antwoord uitsluitend als JSON-object: { "vragen": ["...", "..."] }`;

  const res = await aiGateway.chat(
    "default",
    {
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1200,
      response_format: { type: "json_object" },
    },
    60_000,
    {
      module: "werving",
      functie: "stelKernvragenVoor",
      gebruikerId: input.gebruikerId,
      entiteitstype: "functie",
      entiteitId: input.functie.id,
      promptNaam: "werving_kernvragen_voorstel",
      promptVersie: "1",
    },
  );
  if (!res.ok) return { ok: false, status: 503, fout: res.fout };
  try {
    const ruw = JSON.parse(res.inhoud) as Record<string, unknown>;
    const vragen = Array.isArray(ruw.vragen)
      ? ruw.vragen
          .map(alsTekst)
          .filter((v): v is string => Boolean(v))
          // Deterministische waarborg: vragen met beschermde kenmerken of
          // oordeel/score worden nooit doorgegeven.
          .filter((v) => !vindVerbodenInhoud(v))
          .slice(0, 12)
      : [];
    if (vragen.length === 0) return { ok: false, status: 500, fout: "AI leverde geen vragen op. Probeer opnieuw." };
    return { ok: true, vragen };
  } catch {
    return { ok: false, status: 500, fout: "AI gaf een ongeldig antwoord. Probeer opnieuw." };
  }
}
