/**
 * Security Intake Engine — centrale beveiligingslaag voor FPS Connect & FPS One.
 *
 * Controleert elk inkomend bestand, e-mail en document op:
 *   1. Extensie-blacklist
 *   2. Bestandsnaam-anomalieën (dubbele extensies, verdachte namen)
 *   3. MIME-type verificatie via magic bytes
 *   4. Structuurcontrole (PDF, Office)
 *   5. Link-extractie en URL-risicoanalyse
 *   6. AI-inhoudsanalyse
 *   7. ClamAV (optioneel — indien geconfigureerd)
 *
 * Alle beslissingen worden gelogd in security_intake_scans (onwijzigbaar).
 */

import path from "path";
import net from "net";
import { db, securityIntakeScansTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import {
  analyserenLinks,
  extraherenLinks,
  hoogsteNiveauUitLinks,
  type LinkRisico,
} from "./link-scanner";
import { aiGateway } from "../lib/aiGateway";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ScanStatus = "groen" | "geel" | "oranje" | "rood" | "kritiek" | "geblokkeerd";

export interface ScanBevinding {
  categorie: string;
  beschrijving: string;
  ernst: "info" | "laag" | "midden" | "hoog" | "kritiek";
}

export interface ScanContext {
  gebruikerId: number | null;
  gebruikerNaam: string | null;
  uploadBron: "document" | "email" | "mobiel" | "api" | "inbox" | "snagstream";
}

export interface MetadataScanInput extends ScanContext {
  bestandsnaam: string;
  bestandsgrootte?: number;
  mimeTypeClaim?: string;
  objectPad?: string;
  documentId?: number;
}

export interface BytesScanInput extends MetadataScanInput {
  bytes: Buffer;
}

export interface EmailScanInput extends ScanContext {
  onderwerp: string;
  afzender: string;
  ontvangerDomein?: string;
  tekstInhoud: string;
  links: string[];
  bijlageNamen: string[];
  bijlageSizes: number[];
  headers?: Record<string, string>;
}

export interface ScanUitkomst {
  dbId: number | null;
  toegestaan: boolean;
  risicoNiveau: ScanStatus;
  bevindingen: ScanBevinding[];
  actie: "toegestaan" | "waarschuwing" | "quarantaine" | "geblokkeerd";
  blokkeerReden?: string;
  quarantaineReden?: string;
  linksGeanalyseerd: LinkRisico[];
  aiSamenvatting?: string;
  mimeTypeWerkelijk?: string;
  extensieStatus: string;
  mimeStatus: string;
  structuurStatus: string;
  linkStatus: string;
  aiStatus: string;
  clamavStatus: string;
}

// ── Extension blacklist ───────────────────────────────────────────────────────

const GEBLOKKEERDE_EXTENSIES = new Set([
  ".exe", ".bat", ".cmd", ".com", ".scr", ".ps1", ".ps2", ".psc1", ".psc2",
  ".vbs", ".vbe", ".js", ".jse", ".wsf", ".wsh", ".jar", ".msi", ".dll",
  ".reg", ".hta", ".apk", ".iso", ".img", ".inf", ".msu", ".msp", ".prg",
  ".gadget", ".application", ".lnk", ".url", ".pif", ".cer", ".crx",
  ".xbap", ".xpi", ".xlsm", ".docm", ".pptm", // macro-enabled Office
]);

// Office-macrodocumenten — alleen geblokkeerd als niet goedgekeurd door hoofdbeheerder
const MACRO_EXTENSIES = new Set([".xlsm", ".docm", ".pptm", ".xlam", ".dotm", ".potm", ".ppam"]);

// Altijd geblokkeerd (ook voor hoofdbeheerder)
const ALTIJD_GEBLOKKEERD = new Set([
  ".exe", ".bat", ".cmd", ".com", ".scr", ".ps1", ".ps2", ".psc1", ".psc2",
  ".vbs", ".vbe", ".wsf", ".wsh", ".jar", ".msi", ".dll", ".reg", ".hta",
  ".apk", ".pif", ".application", ".gadget", ".lnk",
]);

// ── MIME magic bytes verificatie ──────────────────────────────────────────────

const MAGIC_BYTES: Array<{ mime: string; bytes: number[]; beschrijving?: string }> = [
  { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { mime: "image/jpeg", bytes: [0xFF, 0xD8, 0xFF] },
  { mime: "image/png", bytes: [0x89, 0x50, 0x4E, 0x47] },
  { mime: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46] },
  { mime: "application/zip", bytes: [0x50, 0x4B, 0x03, 0x04] }, // ZIP (ook DOCX/XLSX/PPTX)
  { mime: "application/msword", bytes: [0xD0, 0xCF, 0x11, 0xE0] }, // OLE2 (DOC/XLS/PPT)
  { mime: "application/x-msdownload", bytes: [0x4D, 0x5A], beschrijving: "Windows executable (MZ)" },
  { mime: "application/x-elf", bytes: [0x7F, 0x45, 0x4C, 0x46], beschrijving: "Linux executable (ELF)" },
  { mime: "text/xml", bytes: [0x3C, 0x3F, 0x78, 0x6D] }, // <?xm
  { mime: "image/tiff", bytes: [0x49, 0x49, 0x2A, 0x00] },
  { mime: "application/x-7z-compressed", bytes: [0x37, 0x7A, 0xBC, 0xAF] }, // 7z
  { mime: "application/x-rar-compressed", bytes: [0x52, 0x61, 0x72, 0x21] }, // Rar!
  { mime: "application/gzip", bytes: [0x1F, 0x8B] },
];

// Executable magic bytes — altijd blokkeren ongeacht extensie
const EXECUTABLE_MAGIC: Array<number[]> = [
  [0x4D, 0x5A], // MZ (Windows EXE/DLL/COM)
  [0x7F, 0x45, 0x4C, 0x46], // ELF (Linux)
  [0xCA, 0xFE, 0xBA, 0xBE], // Mach-O (macOS)
  [0xCE, 0xFA, 0xED, 0xFE], // Mach-O 32-bit LE
  [0xCF, 0xFA, 0xED, 0xFE], // Mach-O 64-bit LE
];

function detecteerMagicMime(bytes: Buffer): string | null {
  for (const entry of MAGIC_BYTES) {
    if (entry.bytes.every((b, i) => bytes[i] === b)) return entry.mime;
  }
  return null;
}

function isExecutableMagic(bytes: Buffer): boolean {
  return EXECUTABLE_MAGIC.some((magic) => magic.every((b, i) => bytes[i] === b));
}

// ── Bestandsnaam-analyse ──────────────────────────────────────────────────────

function analyserenBestandsnaam(naam: string): ScanBevinding[] {
  const bevindingen: ScanBevinding[] = [];
  const ext = path.extname(naam).toLowerCase();
  const naamZonderExt = naam.slice(0, naam.length - ext.length);
  const tweedeExt = path.extname(naamZonderExt).toLowerCase();

  // Dubbele extensie (bv. factuur.pdf.exe)
  if (tweedeExt && GEBLOKKEERDE_EXTENSIES.has(ext)) {
    bevindingen.push({
      categorie: "bestandsnaam",
      beschrijving: `Dubbele extensie gedetecteerd: "${tweedeExt}${ext}" — mogelijke misleiding`,
      ernst: "kritiek",
    });
  }
  if (tweedeExt && GEBLOKKEERDE_EXTENSIES.has(tweedeExt)) {
    bevindingen.push({
      categorie: "bestandsnaam",
      beschrijving: `Gevaarlijke tussenextensie: "${tweedeExt}" — mogelijk uitvoerbaar bestand vermomd`,
      ernst: "hoog",
    });
  }

  // Verdachte bestandsnaam-patronen
  if (/crack|keygen|patch|serial|hack|exploit|payload|dropper|ransomware/i.test(naam)) {
    bevindingen.push({
      categorie: "bestandsnaam",
      beschrijving: "Verdachte termen in bestandsnaam",
      ernst: "hoog",
    });
  }

  // Naam met verborgen unicode (right-to-left override etc.)
  if (/[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/.test(naam)) {
    bevindingen.push({
      categorie: "bestandsnaam",
      beschrijving: "Verborgen unicode-tekens in bestandsnaam (right-to-left override of zero-width)",
      ernst: "kritiek",
    });
  }

  return bevindingen;
}

// ── PDF-structuurcheck ────────────────────────────────────────────────────────

function controleerPdfStructuur(bytes: Buffer): ScanBevinding[] {
  const bevindingen: ScanBevinding[] = [];
  const inhoud = bytes.toString("latin1"); // binary-safe

  if (/\/JavaScript\s/i.test(inhoud) || /\/JS\s/i.test(inhoud)) {
    bevindingen.push({
      categorie: "structuur",
      beschrijving: "PDF bevat embedded JavaScript",
      ernst: "hoog",
    });
  }
  if (/\/Launch\s/i.test(inhoud)) {
    bevindingen.push({
      categorie: "structuur",
      beschrijving: "PDF bevat Launch-actie (kan externe programma's starten)",
      ernst: "kritiek",
    });
  }
  if (/\/OpenAction\s/i.test(inhoud)) {
    bevindingen.push({
      categorie: "structuur",
      beschrijving: "PDF bevat OpenAction (automatisch uitgevoerde actie bij openen)",
      ernst: "midden",
    });
  }
  if (/\/EmbeddedFile\s/i.test(inhoud)) {
    bevindingen.push({
      categorie: "structuur",
      beschrijving: "PDF bevat embedded bestanden",
      ernst: "laag",
    });
  }
  if (/\/URI\s/i.test(inhoud)) {
    // URI is normale hyperlink — niet blokkeren maar wel noteren voor link-extractie
  }
  return bevindingen;
}

// ── OLE2 / Office macro-check ─────────────────────────────────────────────────

function controleerOle2Structuur(bytes: Buffer): ScanBevinding[] {
  const bevindingen: ScanBevinding[] = [];
  const inhoud = bytes.toString("latin1");

  // VBA project aanwezig
  if (inhoud.includes("VBA") || inhoud.includes("vbaProject")) {
    bevindingen.push({
      categorie: "structuur",
      beschrijving: "Office-document bevat VBA/macroproject",
      ernst: "hoog",
    });
  }
  // AutoOpen/AutoExec macro
  if (/AutoOpen|AutoExec|Document_Open|Workbook_Open/i.test(inhoud)) {
    bevindingen.push({
      categorie: "structuur",
      beschrijving: "Automatisch uitvoerende macro gedetecteerd (AutoOpen/Document_Open)",
      ernst: "kritiek",
    });
  }
  // Shell-aanroepen
  if (/Shell\s*\(|WScript\.Shell|CreateObject.*Shell/i.test(inhoud)) {
    bevindingen.push({
      categorie: "structuur",
      beschrijving: "Shell-aanroep in documentinhoud",
      ernst: "kritiek",
    });
  }
  // PowerShell aanroepen
  if (/powershell|invoke-expression|iex\s*\(/i.test(inhoud)) {
    bevindingen.push({
      categorie: "structuur",
      beschrijving: "PowerShell-aanroep in documentinhoud",
      ernst: "kritiek",
    });
  }
  return bevindingen;
}

// ── ClamAV TCP-client (optioneel) ─────────────────────────────────────────────

async function scanClamAv(bytes: Buffer): Promise<{ schoon: boolean; bericht: string } | null> {
  const CLAMAV_HOST = process.env.CLAMAV_HOST ?? "127.0.0.1";
  const CLAMAV_PORT = parseInt(process.env.CLAMAV_PORT ?? "3310", 10);

  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(5000);

    socket.connect(CLAMAV_PORT, CLAMAV_HOST, () => {
      socket.write("zINSTREAM\0");
      const lenBuf = Buffer.alloc(4);
      lenBuf.writeUInt32BE(bytes.length, 0);
      socket.write(lenBuf);
      socket.write(bytes);
      const zeroBuf = Buffer.alloc(4);
      zeroBuf.writeUInt32BE(0, 0);
      socket.write(zeroBuf);
    });

    let antwoord = "";
    socket.on("data", (d) => { antwoord += d.toString(); });
    socket.on("end", () => {
      const trimmed = antwoord.trim();
      const schoon = trimmed.includes("stream: OK") || trimmed.endsWith(": OK");
      resolve({ schoon, bericht: trimmed });
    });
    socket.on("error", () => resolve(null));
    socket.on("timeout", () => { socket.destroy(); resolve(null); });
  });
}

// ── AI-inhoudsanalyse ─────────────────────────────────────────────────────────

async function analyserenInhoudAI(
  tekst: string,
): Promise<{ samenvatting: string; risicoScore: number } | null> {
  if (!tekst || tekst.length < 50) return null;
  const afgekapte = tekst.slice(0, 4000);

  try {
    const resultaat = await aiGateway.chat(
      "fast",
      {
        response_format: { type: "json_object" },
        max_completion_tokens: 300,
        messages: [
          {
            role: "system",
            content:
              "Je bent een beveiligingsanalist voor een brandpreventieplatform. " +
              "Analyseer de tekst op beveiligingsrisico's: social engineering, phishing, " +
              "verdachte betalingsinstructies, verzoeken om software te installeren, " +
              "terminal-/PowerShell-commando's, ongebruikelijke urgentie, afwijkende " +
              "contractvoorwaarden of salariswijzigingen. " +
              'Antwoord ALLEEN als JSON: {"risico_score": 0-100, "samenvatting": "korte Nederlandse uitleg (<150 tekens)"}',
          },
          { role: "user", content: afgekapte },
        ],
      },
      undefined,
      { module: "security", functie: "inhoud-analyse" },
    );
    if (!resultaat.ok) return null;
    const parsed = JSON.parse(resultaat.inhoud) as {
      risico_score: number;
      samenvatting: string;
    };
    return { samenvatting: parsed.samenvatting, risicoScore: parsed.risico_score };
  } catch {
    return null;
  }
}

// ── Kern: metadata-scan (geen bytes nodig) ────────────────────────────────────

export async function scanBestandMetadata(
  input: MetadataScanInput,
): Promise<ScanUitkomst> {
  const bevindingen: ScanBevinding[] = [];
  let extensieStatus = "groen";
  let geblokkeerd = false;
  let blokkeerReden: string | undefined;

  const ext = path.extname(input.bestandsnaam ?? "").toLowerCase();

  // 1. Extensie-blacklist
  if (ALTIJD_GEBLOKKEERD.has(ext)) {
    bevindingen.push({
      categorie: "extensie",
      beschrijving: `Geblokkeerde bestandsextensie: "${ext}"`,
      ernst: "kritiek",
    });
    extensieStatus = "geblokkeerd";
    geblokkeerd = true;
    blokkeerReden = `Bestandsextensie "${ext}" is niet toegestaan in FPS Connect.`;
  } else if (MACRO_EXTENSIES.has(ext)) {
    bevindingen.push({
      categorie: "extensie",
      beschrijving: `Macro-extensie: "${ext}" — vereist expliciete goedkeuring`,
      ernst: "hoog",
    });
    extensieStatus = "geblokkeerd";
    geblokkeerd = true;
    blokkeerReden = `Office-document met macro's ("${ext}") is geblokkeerd. Vraag de hoofdbeheerder om handmatige beoordeling.`;
  } else if (GEBLOKKEERDE_EXTENSIES.has(ext) && !ALTIJD_GEBLOKKEERD.has(ext) && !MACRO_EXTENSIES.has(ext)) {
    bevindingen.push({
      categorie: "extensie",
      beschrijving: `Geblokkeerde extensie: "${ext}"`,
      ernst: "kritiek",
    });
    extensieStatus = "geblokkeerd";
    geblokkeerd = true;
    blokkeerReden = `Bestandsextensie "${ext}" is niet toegestaan.`;
  } else {
    extensieStatus = "groen";
  }

  // 2. Bestandsnaam-anomalieën
  const naamBevindingen = analyserenBestandsnaam(input.bestandsnaam ?? "");
  bevindingen.push(...naamBevindingen);
  if (naamBevindingen.some((b) => b.ernst === "kritiek")) {
    geblokkeerd = true;
    blokkeerReden ??= "Verdachte bestandsnaam gedetecteerd.";
  }

  // 3. MIME-type claim check (alleen de string controleren)
  let mimeStatus = "groen";
  const claim = (input.mimeTypeClaim ?? "").toLowerCase();
  if (
    claim.includes("application/x-msdownload") ||
    claim.includes("application/x-dosexec") ||
    claim.includes("application/x-executable") ||
    claim.includes("application/x-sh") ||
    claim.includes("text/x-script")
  ) {
    bevindingen.push({
      categorie: "mime",
      beschrijving: `Verdacht MIME-type opgegeven door client: "${claim}"`,
      ernst: "hoog",
    });
    mimeStatus = "rood";
    geblokkeerd = true;
    blokkeerReden ??= "Verdacht MIME-type.";
  }

  const risicoNiveau = berekenNiveau(bevindingen, geblokkeerd);

  const metadataScanUitkomst: Omit<ScanUitkomst, "dbId"> = {
    toegestaan: !geblokkeerd,
    risicoNiveau,
    bevindingen,
    actie: geblokkeerd ? "geblokkeerd" : "toegestaan",
    blokkeerReden,
    quarantaineReden: undefined,
    linksGeanalyseerd: [],
    extensieStatus,
    mimeStatus,
    structuurStatus: "niet_gescand",
    linkStatus: "niet_gescand",
    aiStatus: "niet_gescand",
    clamavStatus: "niet_beschikbaar",
  };

  const dbId = await logScanResultaat({ input, uitkomst: metadataScanUitkomst });

  return { ...metadataScanUitkomst, dbId };
}

// ── Kern: deep scan (met bytes) ───────────────────────────────────────────────

export async function scanBestandBytes(input: BytesScanInput): Promise<ScanUitkomst> {
  const { bytes } = input;
  const bevindingen: ScanBevinding[] = [];
  let geblokkeerd = false;
  let inQuarantaine = false;
  let blokkeerReden: string | undefined;
  let quarantaineReden: string | undefined;

  const ext = path.extname(input.bestandsnaam ?? "").toLowerCase();

  // 1. Extensie (zelfde als metadata, maar bij bytes herhalen)
  let extensieStatus = "groen";
  if (ALTIJD_GEBLOKKEERD.has(ext)) {
    bevindingen.push({ categorie: "extensie", beschrijving: `Geblokkeerde extensie: "${ext}"`, ernst: "kritiek" });
    extensieStatus = "geblokkeerd";
    geblokkeerd = true;
    blokkeerReden = `Bestandsextensie "${ext}" is niet toegestaan.`;
  }

  // 2. Magic bytes — werkelijk MIME-type detecteren
  let mimeStatus = "groen";
  let mimeTypeWerkelijk: string | undefined;
  if (bytes.length >= 4) {
    if (isExecutableMagic(bytes)) {
      bevindingen.push({
        categorie: "mime",
        beschrijving: "Bestand bevat executable magic bytes — vermomd als ander bestandstype",
        ernst: "kritiek",
      });
      mimeStatus = "geblokkeerd";
      geblokkeerd = true;
      blokkeerReden ??= "Uitvoerbaar bestand gedetecteerd op basis van bestandsinhoud.";
    } else {
      mimeTypeWerkelijk = detecteerMagicMime(bytes) ?? undefined;
      const claim = input.mimeTypeClaim ?? "";
      if (mimeTypeWerkelijk && claim && !mimeTypeWerkelijk.startsWith(claim.split("/")[0])) {
        // MIME type mismatch — waarschuwing, niet direct blokkeren
        bevindingen.push({
          categorie: "mime",
          beschrijving: `MIME-mismatch: geclaimd "${claim}", gemeten "${mimeTypeWerkelijk}"`,
          ernst: "midden",
        });
        mimeStatus = "oranje";
        inQuarantaine = true;
        quarantaineReden ??= "MIME-type komt niet overeen met bestandsinhoud.";
      } else {
        mimeStatus = "groen";
      }
    }
  }

  // 3. Bestandsnaam anomalieën
  bevindingen.push(...analyserenBestandsnaam(input.bestandsnaam ?? ""));

  // 4. Structuurcheck op basis van type
  let structuurStatus = "niet_gescand";
  const mime = mimeTypeWerkelijk ?? input.mimeTypeClaim ?? "";

  if (mime.includes("pdf") || ext === ".pdf") {
    const structuurBevindingen = controleerPdfStructuur(bytes);
    bevindingen.push(...structuurBevindingen);
    structuurStatus = structuurBevindingen.some((b) => b.ernst === "kritiek" || b.ernst === "hoog")
      ? "rood"
      : structuurBevindingen.length > 0
        ? "oranje"
        : "groen";
    if (structuurBevindingen.some((b) => b.ernst === "kritiek")) {
      inQuarantaine = true;
      quarantaineReden ??= "PDF bevat actieve inhoud (JavaScript of Launch-actie).";
    }
  } else if (mime.includes("msword") || mime.includes("officedocument") || [".doc", ".xls", ".ppt"].includes(ext)) {
    const structuurBevindingen = controleerOle2Structuur(bytes);
    bevindingen.push(...structuurBevindingen);
    structuurStatus = structuurBevindingen.some((b) => b.ernst === "kritiek") ? "geblokkeerd"
      : structuurBevindingen.some((b) => b.ernst === "hoog") ? "rood"
        : "groen";
    if (structuurBevindingen.some((b) => b.ernst === "kritiek")) {
      geblokkeerd = true;
      blokkeerReden ??= "Office-document bevat gevaarlijke macro-inhoud.";
    } else if (structuurBevindingen.some((b) => b.ernst === "hoog")) {
      inQuarantaine = true;
      quarantaineReden ??= "Office-document bevat macroproject.";
    }
  } else {
    structuurStatus = "groen";
  }

  // 5. Linkextractie en URL-analyse
  let linkStatus = "niet_gescand";
  let linksGeanalyseerd: LinkRisico[] = [];
  try {
    const tekst = bytes.toString("utf8");
    const urls = extraherenLinks(tekst);
    if (urls.length > 0) {
      linksGeanalyseerd = analyserenLinks(urls);
      const hoogste = hoogsteNiveauUitLinks(linksGeanalyseerd);
      linkStatus = hoogste;
      const rodeLinks = linksGeanalyseerd.filter((l) => l.risicoNiveau === "rood");
      if (rodeLinks.length > 0) {
        bevindingen.push({
          categorie: "links",
          beschrijving: `${rodeLinks.length} verdachte link(s) gevonden in document`,
          ernst: "hoog",
        });
        inQuarantaine = true;
        quarantaineReden ??= "Document bevat verdachte links.";
      }
    } else {
      linkStatus = "groen";
    }
  } catch {
    linkStatus = "niet_gescand";
  }

  // 6. ClamAV (optioneel)
  let clamavStatus = "niet_beschikbaar";
  const clamavResult = await scanClamAv(bytes);
  if (clamavResult !== null) {
    if (clamavResult.schoon) {
      clamavStatus = "groen";
    } else {
      clamavStatus = "geblokkeerd";
      bevindingen.push({
        categorie: "antivirus",
        beschrijving: `ClamAV: ${clamavResult.bericht}`,
        ernst: "kritiek",
      });
      geblokkeerd = true;
      blokkeerReden ??= `Antivirusscan: ${clamavResult.bericht}`;
    }
  }

  // 7. AI-inhoudsanalyse (alleen bij text/pdf inhoud, async)
  let aiStatus = "niet_gescand";
  let aiSamenvatting: string | undefined;
  try {
    const leesbareTekst = bytes.toString("utf8");
    if (leesbareTekst.length > 50) {
      const aiResultaat = await analyserenInhoudAI(leesbareTekst);
      if (aiResultaat) {
        aiStatus = aiResultaat.risicoScore >= 70 ? "rood"
          : aiResultaat.risicoScore >= 40 ? "oranje"
            : "groen";
        aiSamenvatting = aiResultaat.samenvatting;
        if (aiResultaat.risicoScore >= 70) {
          bevindingen.push({
            categorie: "ai",
            beschrijving: `AI-analyse: ${aiResultaat.samenvatting}`,
            ernst: "hoog",
          });
          inQuarantaine = true;
          quarantaineReden ??= `AI-inhoudsanalyse: ${aiResultaat.samenvatting}`;
        } else if (aiResultaat.risicoScore >= 40) {
          bevindingen.push({
            categorie: "ai",
            beschrijving: `AI-analyse (verhoogd risico): ${aiResultaat.samenvatting}`,
            ernst: "midden",
          });
        }
      }
    }
  } catch {
    aiStatus = "niet_gescand";
  }

  const actie: ScanUitkomst["actie"] = geblokkeerd
    ? "geblokkeerd"
    : inQuarantaine
      ? "quarantaine"
      : "toegestaan";

  const risicoNiveau = berekenNiveau(bevindingen, geblokkeerd, inQuarantaine);

  const bytesScanUitkomst: Omit<ScanUitkomst, "dbId"> = {
    toegestaan: actie === "toegestaan",
    risicoNiveau,
    bevindingen,
    actie,
    blokkeerReden,
    quarantaineReden,
    linksGeanalyseerd,
    aiSamenvatting,
    mimeTypeWerkelijk,
    extensieStatus,
    mimeStatus,
    structuurStatus,
    linkStatus,
    aiStatus,
    clamavStatus,
  };

  const dbId = await logScanResultaat({
    input: { ...input, documentId: input.documentId },
    uitkomst: bytesScanUitkomst,
  });

  return { ...bytesScanUitkomst, dbId };
}

// ── E-mailbeveiliging ─────────────────────────────────────────────────────────

export async function scanEmailBericht(input: EmailScanInput): Promise<ScanUitkomst> {
  const bevindingen: ScanBevinding[] = [];
  let geblokkeerd = false;
  let inQuarantaine = false;
  let blokkeerReden: string | undefined;
  let quarantaineReden: string | undefined;

  // 1. Afzender-analyse
  let extensieStatus = "groen";
  const afzenderDomein = input.afzender.split("@").pop()?.toLowerCase() ?? "";

  const VERDACHTE_AFZENDER_PATRONEN = [
    /noreply.*@.*\.(tk|ml|ga|cf|gq|pw)/i,
    /info@.*\d{8,}/,
    /no-reply@.*temp.*mail/i,
  ];
  for (const p of VERDACHTE_AFZENDER_PATRONEN) {
    if (p.test(input.afzender)) {
      bevindingen.push({
        categorie: "afzender",
        beschrijving: `Verdacht afzenderpatroon: ${input.afzender}`,
        ernst: "hoog",
      });
      inQuarantaine = true;
      quarantaineReden ??= "Verdacht e-mailadres als afzender.";
    }
  }

  // Domain mismatch (display name vs actual domain)
  if (input.ontvangerDomein && afzenderDomein && afzenderDomein !== input.ontvangerDomein) {
    // Niet per se verdacht, maar loggen
  }

  // 2. Links in e-mail
  const linkRisicos = analyserenLinks(input.links);
  const rodeLinks = linkRisicos.filter((l) => l.risicoNiveau === "rood");
  let linkStatus = hoogsteNiveauUitLinks(linkRisicos);

  if (rodeLinks.length > 0) {
    bevindingen.push({
      categorie: "links",
      beschrijving: `${rodeLinks.length} verdachte link(s) in e-mail: ${rodeLinks[0].url.slice(0, 80)}`,
      ernst: "hoog",
    });
    inQuarantaine = true;
    quarantaineReden ??= "E-mail bevat verdachte links.";
  }

  // 3. Bijlagen
  for (const naam of input.bijlageNamen) {
    const ext = path.extname(naam).toLowerCase();
    if (ALTIJD_GEBLOKKEERD.has(ext)) {
      bevindingen.push({
        categorie: "bijlage",
        beschrijving: `Gevaarlijke bijlage: "${naam}" (extensie "${ext}")`,
        ernst: "kritiek",
      });
      geblokkeerd = true;
      blokkeerReden ??= `Bijlage "${naam}" heeft een gevaarlijke extensie.`;
      extensieStatus = "geblokkeerd";
    } else if (GEBLOKKEERDE_EXTENSIES.has(ext)) {
      bevindingen.push({
        categorie: "bijlage",
        beschrijving: `Verdachte bijlage: "${naam}"`,
        ernst: "hoog",
      });
      inQuarantaine = true;
      quarantaineReden ??= `Bijlage "${naam}" is verdacht.`;
    }
    // Dubbele extensies in bijlage
    bevindingen.push(...analyserenBestandsnaam(naam).filter((b) => b.ernst !== "info"));
  }

  // 4. AI-inhoudsanalyse op e-mailtekst
  let aiStatus = "niet_gescand";
  let aiSamenvatting: string | undefined;
  try {
    const aiResultaat = await analyserenInhoudAI(
      `Onderwerp: ${input.onderwerp}\n\n${input.tekstInhoud}`,
    );
    if (aiResultaat) {
      aiStatus = aiResultaat.risicoScore >= 70 ? "rood"
        : aiResultaat.risicoScore >= 40 ? "oranje"
          : "groen";
      aiSamenvatting = aiResultaat.samenvatting;
      if (aiResultaat.risicoScore >= 70) {
        bevindingen.push({
          categorie: "ai",
          beschrijving: `AI-analyse e-mail: ${aiResultaat.samenvatting}`,
          ernst: "hoog",
        });
        inQuarantaine = true;
        quarantaineReden ??= `AI-analyse e-mailinhoud: ${aiResultaat.samenvatting}`;
      }
    }
  } catch {
    aiStatus = "niet_gescand";
  }

  const actie: ScanUitkomst["actie"] = geblokkeerd ? "geblokkeerd"
    : inQuarantaine ? "quarantaine"
      : "toegestaan";

  const risicoNiveau = berekenNiveau(bevindingen, geblokkeerd, inQuarantaine);

  const emailScanUitkomst: Omit<ScanUitkomst, "dbId"> = {
    toegestaan: actie === "toegestaan",
    risicoNiveau,
    bevindingen,
    actie,
    blokkeerReden,
    quarantaineReden,
    linksGeanalyseerd: linkRisicos,
    aiSamenvatting,
    extensieStatus,
    mimeStatus: "groen",
    structuurStatus: "groen",
    linkStatus,
    aiStatus,
    clamavStatus: "niet_beschikbaar",
  };

  const dbId = await logScanResultaat({
    input: {
      ...input,
      bestandsnaam: `e-mail: ${input.onderwerp.slice(0, 100)}`,
      mimeTypeClaim: "message/rfc822",
      uploadBron: "email" as const,
      emailOnderwerp: input.onderwerp,
    } as MetadataScanInput & { emailOnderwerp: string },
    uitkomst: emailScanUitkomst,
  });

  return { ...emailScanUitkomst, dbId };
}

// ── Helper: risico-niveau berekenen ──────────────────────────────────────────

function berekenNiveau(
  bevindingen: ScanBevinding[],
  geblokkeerd: boolean,
  inQuarantaine?: boolean,
): ScanStatus {
  if (geblokkeerd) return "geblokkeerd";
  if (bevindingen.some((b) => b.ernst === "kritiek")) return "kritiek";
  if (inQuarantaine) return "rood";
  if (bevindingen.some((b) => b.ernst === "hoog")) return "rood";
  if (bevindingen.some((b) => b.ernst === "midden")) return "oranje";
  if (bevindingen.some((b) => b.ernst === "laag")) return "geel";
  return "groen";
}

// ── Logging naar DB ───────────────────────────────────────────────────────────

async function logScanResultaat(params: {
  input: MetadataScanInput & { emailOnderwerp?: string };
  uitkomst: Omit<ScanUitkomst, "dbId">;
}): Promise<number | null> {
  const { input, uitkomst } = params;
  try {
    const [rij] = await db
      .insert(securityIntakeScansTable)
      .values({
        gebruikerId: input.gebruikerId,
        gebruikerNaam: input.gebruikerNaam,
        uploadBron: input.uploadBron,
        bestandsnaam: input.bestandsnaam,
        bestandsgrootte: input.bestandsgrootte ?? null,
        mimeTypeClaim: input.mimeTypeClaim ?? null,
        mimeTypeWerkelijk: uitkomst.mimeTypeWerkelijk ?? null,
        objectPad: input.objectPad ?? null,
        documentId: (input as MetadataScanInput & { documentId?: number }).documentId ?? null,
        emailOnderwerp: input.emailOnderwerp ?? null,
        extensieStatus: uitkomst.extensieStatus,
        mimeStatus: uitkomst.mimeStatus,
        structuurStatus: uitkomst.structuurStatus,
        linkStatus: uitkomst.linkStatus,
        aiStatus: uitkomst.aiStatus,
        clamavStatus: uitkomst.clamavStatus,
        risicoNiveau: uitkomst.risicoNiveau,
        risicoBevindingen: uitkomst.bevindingen as unknown as Record<string, unknown>[],
        linksGeanalyseerd: uitkomst.linksGeanalyseerd as unknown as Record<string, unknown>[],
        aiSamenvatting: uitkomst.aiSamenvatting ?? null,
        actie: uitkomst.actie,
        blokkeerReden: uitkomst.blokkeerReden ?? null,
        inQuarantaine: uitkomst.actie === "quarantaine",
        quarantaineReden: uitkomst.quarantaineReden ?? null,
      })
      .returning({ id: securityIntakeScansTable.id });
    return rij?.id ?? null;
  } catch (err) {
    logger.warn({ err }, "Security intake log mislukt");
    return null;
  }
}

// ── Scan-ID update na documentregistratie ────────────────────────────────────

export async function koppelDocumentAanScan(scanId: number, documentId: number): Promise<void> {
  try {
    await db
      .update(securityIntakeScansTable)
      .set({ documentId, bijgewerktOp: new Date() })
      .where(eq(securityIntakeScansTable.id, scanId));
  } catch {
    // fire-and-forget
  }
}

// ── Exports voor gebruik in routes ────────────────────────────────────────────

export { ALTIJD_GEBLOKKEERD, GEBLOKKEERDE_EXTENSIES, MACRO_EXTENSIES };
