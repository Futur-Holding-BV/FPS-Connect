/**
 * Security Intake Engine — centrale beveiligingslaag voor FPS Connect & FPS One.
 *
 * 8-staps pipeline (OWASP File Upload Cheat Sheet + eigen risico-analyse):
 *   1. Extensie-blacklist (altijd/macro/beperkt)
 *   2. Bestandsnaam-anomalieën (dubbele extensies, unicode, verdachte termen)
 *   3. MIME-type verificatie op basis van bestandsinhoud (magic bytes, 50+ typen)
 *   4. Archiefcontrole ZIP/7z/RAR (wachtwoordbeveiliging, zip-bom, gevaarlijke inhoud)
 *   5. PDF/Office structuurcontrole (JS, Launch, AutoOpen, macro's, shell-aanroepen)
 *   6. YARA-patroonherkenning (ransomware, malware, webshells, phishing)
 *   7. ClamAV malware/virusscan (clamscan subprocess, graceful fallback)
 *   8. Link-extractie + URL-reputatieanalyse + AI inhoudsanalyse
 *
 * Alle beslissingen worden gelogd in security_intake_scans (onwijzigbaar audittrail).
 * Geblokkeerde/quarantaine bestanden worden opgeslagen buiten publieke toegang.
 */

import path from "path";
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
import { scanMetClamAv } from "./clamav-service";
import { scanMetYara } from "./yara-service";
import { scanArchief, isArchiefExtensie } from "./archive-scanner";
import { slaQuarantaineOp } from "./quarantine-storage";

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
  yaraStatus: string;
  archiefStatus: string;
}

// ── Extension blacklists ───────────────────────────────────────────────────────

const ALTIJD_GEBLOKKEERD = new Set([
  ".exe", ".bat", ".cmd", ".com", ".scr", ".ps1", ".ps2", ".psc1", ".psc2",
  ".vbs", ".vbe", ".wsf", ".wsh", ".jar", ".msi", ".dll", ".reg", ".hta",
  ".apk", ".pif", ".application", ".gadget", ".lnk", ".sys", ".drv",
  ".sh", ".bash", ".zsh", ".csh", ".fish", ".run", ".bin", ".elf",
]);

const MACRO_EXTENSIES = new Set([
  ".xlsm", ".docm", ".pptm", ".xlam", ".dotm", ".potm", ".ppam",
  ".xltm", ".dotx", ".potx",
]);

const GEBLOKKEERDE_EXTENSIES = new Set([
  ...ALTIJD_GEBLOKKEERD,
  ...MACRO_EXTENSIES,
  ".js", ".jse", ".msu", ".msp", ".prg", ".crx", ".xpi",
  ".xbap", ".iso", ".img", ".inf", ".cer", ".url",
]);

// ── MIME magic bytes (50+ typen) ──────────────────────────────────────────────

const MAGIC_BYTES: Array<{ mime: string; bytes: number[]; beschrijving?: string }> = [
  // Documents
  { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { mime: "application/msword", bytes: [0xD0, 0xCF, 0x11, 0xE0] }, // OLE2 (DOC/XLS/PPT)
  { mime: "application/zip", bytes: [0x50, 0x4B, 0x03, 0x04] }, // ZIP (ook DOCX/XLSX/PPTX)
  { mime: "application/zip", bytes: [0x50, 0x4B, 0x05, 0x06] }, // Empty ZIP
  { mime: "application/rtf", bytes: [0x7B, 0x5C, 0x72, 0x74, 0x66] }, // {\rtf
  // Images
  { mime: "image/jpeg", bytes: [0xFF, 0xD8, 0xFF] },
  { mime: "image/png", bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] },
  { mime: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38] }, // GIF8
  { mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF (check offset 8 for WEBP)
  { mime: "image/tiff", bytes: [0x49, 0x49, 0x2A, 0x00] }, // Little-endian TIFF
  { mime: "image/tiff", bytes: [0x4D, 0x4D, 0x00, 0x2A] }, // Big-endian TIFF
  { mime: "image/bmp", bytes: [0x42, 0x4D] }, // BM
  { mime: "image/vnd.ms-dds", bytes: [0x44, 0x44, 0x53, 0x20] }, // DDS
  { mime: "image/x-xcf", bytes: [0x67, 0x69, 0x6D, 0x70, 0x20, 0x78, 0x63, 0x66] }, // gimp xcf
  // Archives
  { mime: "application/x-7z-compressed", bytes: [0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C] }, // 7z
  { mime: "application/x-rar-compressed", bytes: [0x52, 0x61, 0x72, 0x21, 0x1A, 0x07, 0x01, 0x00] }, // RAR5
  { mime: "application/x-rar-compressed", bytes: [0x52, 0x61, 0x72, 0x21, 0x1A, 0x07, 0x00] }, // RAR4
  { mime: "application/gzip", bytes: [0x1F, 0x8B] },
  { mime: "application/x-bzip2", bytes: [0x42, 0x5A, 0x68] }, // BZh
  { mime: "application/x-xz", bytes: [0xFD, 0x37, 0x7A, 0x58, 0x5A, 0x00] }, // xz
  { mime: "application/x-tar", bytes: [0x75, 0x73, 0x74, 0x61, 0x72] }, // ustar (at offset 257 normally)
  { mime: "application/zstd", bytes: [0x28, 0xB5, 0x2F, 0xFD] }, // zstd
  { mime: "application/x-lzip", bytes: [0x4C, 0x5A, 0x49, 0x50] }, // LZIP
  // Executables (altijd geblokkeerd)
  { mime: "application/x-msdownload", bytes: [0x4D, 0x5A], beschrijving: "Windows executable (MZ)" },
  { mime: "application/x-elf", bytes: [0x7F, 0x45, 0x4C, 0x46], beschrijving: "Linux executable (ELF)" },
  { mime: "application/x-mach-binary", bytes: [0xCA, 0xFE, 0xBA, 0xBE], beschrijving: "Mach-O universeel" },
  { mime: "application/x-mach-binary", bytes: [0xCF, 0xFA, 0xED, 0xFE], beschrijving: "Mach-O 64-bit LE" },
  { mime: "application/x-mach-binary", bytes: [0xCE, 0xFA, 0xED, 0xFE], beschrijving: "Mach-O 32-bit LE" },
  { mime: "application/x-java-applet", bytes: [0xCA, 0xFE, 0xBA, 0xBE], beschrijving: "Java class" },
  // Media
  { mime: "audio/mpeg", bytes: [0xFF, 0xFB] }, // MP3
  { mime: "audio/mpeg", bytes: [0x49, 0x44, 0x33] }, // ID3 (MP3)
  { mime: "audio/ogg", bytes: [0x4F, 0x67, 0x67, 0x53] }, // OggS
  { mime: "audio/flac", bytes: [0x66, 0x4C, 0x61, 0x43] }, // fLaC
  { mime: "audio/wav", bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF...WAVE
  { mime: "video/mp4", bytes: [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70] }, // MP4
  { mime: "video/mpeg", bytes: [0x00, 0x00, 0x01, 0xBA] }, // MPEG
  { mime: "video/x-msvideo", bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF...AVI
  { mime: "video/x-matroska", bytes: [0x1A, 0x45, 0xDF, 0xA3] }, // MKV/WebM
  // Data
  { mime: "application/json", bytes: [0x7B] }, // { (rough)
  { mime: "text/xml", bytes: [0x3C, 0x3F, 0x78, 0x6D, 0x6C] }, // <?xml
  { mime: "text/html", bytes: [0x3C, 0x21, 0x44, 0x4F, 0x43, 0x54] }, // <!DOCT
  { mime: "text/html", bytes: [0x3C, 0x68, 0x74, 0x6D, 0x6C] }, // <html
  { mime: "application/wasm", bytes: [0x00, 0x61, 0x73, 0x6D] }, // WASM
  { mime: "application/vnd.sqlite3", bytes: [0x53, 0x51, 0x4C, 0x69, 0x74, 0x65] }, // SQLite
  // Fonts
  { mime: "font/woff", bytes: [0x77, 0x4F, 0x46, 0x46] }, // wOFF
  { mime: "font/woff2", bytes: [0x77, 0x4F, 0x46, 0x32] }, // wOF2
  { mime: "font/ttf", bytes: [0x00, 0x01, 0x00, 0x00, 0x00] }, // TrueType
  { mime: "font/otf", bytes: [0x4F, 0x54, 0x54, 0x4F] }, // OTTO (OpenType)
];

const EXECUTABLE_MAGIC: number[][] = [
  [0x4D, 0x5A], // MZ (Windows EXE/DLL)
  [0x7F, 0x45, 0x4C, 0x46], // ELF (Linux)
  [0xCA, 0xFE, 0xBA, 0xBE], // Mach-O
  [0xCE, 0xFA, 0xED, 0xFE], // Mach-O 32-bit LE
  [0xCF, 0xFA, 0xED, 0xFE], // Mach-O 64-bit LE
  [0x23, 0x21], // Shebang (#!)
];

function detecteerMagicMime(bytes: Buffer): string | null {
  for (const entry of MAGIC_BYTES) {
    if (bytes.length >= entry.bytes.length && entry.bytes.every((b, i) => bytes[i] === b)) {
      return entry.mime;
    }
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
  if (/crack|keygen|patch|serial|hack|exploit|payload|dropper|ransomware/i.test(naam)) {
    bevindingen.push({
      categorie: "bestandsnaam",
      beschrijving: "Verdachte termen in bestandsnaam",
      ernst: "hoog",
    });
  }
  if (/[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/.test(naam)) {
    bevindingen.push({
      categorie: "bestandsnaam",
      beschrijving: "Verborgen unicode-tekens in bestandsnaam (right-to-left override of zero-width)",
      ernst: "kritiek",
    });
  }
  // Path-traversal in bestandsnaam
  if (naam.includes("../") || naam.includes("..\\") || naam.startsWith("/")) {
    bevindingen.push({
      categorie: "bestandsnaam",
      beschrijving: "Path-traversal patroon in bestandsnaam",
      ernst: "kritiek",
    });
  }
  // Extreem lange naam (buffer overflow indicator)
  if (naam.length > 255) {
    bevindingen.push({
      categorie: "bestandsnaam",
      beschrijving: `Extreem lange bestandsnaam (${naam.length} tekens)`,
      ernst: "hoog",
    });
  }
  return bevindingen;
}

// ── PDF-structuurcheck ────────────────────────────────────────────────────────

function controleerPdfStructuur(bytes: Buffer): ScanBevinding[] {
  const bevindingen: ScanBevinding[] = [];
  const inhoud = bytes.toString("latin1");

  if (/\/JavaScript\s/i.test(inhoud) || /\/JS\s*</i.test(inhoud)) {
    bevindingen.push({ categorie: "structuur", beschrijving: "PDF bevat embedded JavaScript", ernst: "hoog" });
  }
  if (/\/Launch\s/i.test(inhoud)) {
    bevindingen.push({ categorie: "structuur", beschrijving: "PDF bevat Launch-actie (kan externe programma's starten)", ernst: "kritiek" });
  }
  if (/\/OpenAction\s/i.test(inhoud)) {
    bevindingen.push({ categorie: "structuur", beschrijving: "PDF bevat OpenAction (automatisch uitgevoerde actie bij openen)", ernst: "midden" });
  }
  if (/\/EmbeddedFile\s/i.test(inhoud)) {
    bevindingen.push({ categorie: "structuur", beschrijving: "PDF bevat embedded bestanden", ernst: "laag" });
  }
  if (/\/AcroForm\s/i.test(inhoud) && /\/XFA\s/i.test(inhoud)) {
    bevindingen.push({ categorie: "structuur", beschrijving: "PDF bevat XFA-formulier (dynamisch, mogelijk gevaarlijk)", ernst: "midden" });
  }
  if (/\/AA\s/i.test(inhoud)) {
    bevindingen.push({ categorie: "structuur", beschrijving: "PDF bevat Additional Actions", ernst: "laag" });
  }
  // Encrypted PDF (wachtwoordbeveiligd — inhoud niet controleerbaar)
  if (/\/Encrypt\s/i.test(inhoud)) {
    bevindingen.push({ categorie: "structuur", beschrijving: "PDF is versleuteld — inhoud niet volledig controleerbaar", ernst: "midden" });
  }
  return bevindingen;
}

// ── OLE2 / Office macro-check ─────────────────────────────────────────────────

function controleerOle2Structuur(bytes: Buffer): ScanBevinding[] {
  const bevindingen: ScanBevinding[] = [];
  const inhoud = bytes.toString("latin1");

  if (inhoud.includes("VBA") || inhoud.includes("vbaProject")) {
    bevindingen.push({ categorie: "structuur", beschrijving: "Office-document bevat VBA/macroproject", ernst: "hoog" });
  }
  if (/AutoOpen|AutoExec|Document_Open|Workbook_Open|Auto_Open/i.test(inhoud)) {
    bevindingen.push({ categorie: "structuur", beschrijving: "Automatisch uitvoerende macro gedetecteerd (AutoOpen/Document_Open)", ernst: "kritiek" });
  }
  if (/Shell\s*\(|WScript\.Shell|CreateObject.*Shell/i.test(inhoud)) {
    bevindingen.push({ categorie: "structuur", beschrijving: "Shell-aanroep in documentinhoud", ernst: "kritiek" });
  }
  if (/powershell|invoke-expression|iex\s*\(/i.test(inhoud)) {
    bevindingen.push({ categorie: "structuur", beschrijving: "PowerShell-aanroep in documentinhoud", ernst: "kritiek" });
  }
  if (/DownloadFile|DownloadString|Net\.WebClient/i.test(inhoud)) {
    bevindingen.push({ categorie: "structuur", beschrijving: "Netwerk-download aanroep in document", ernst: "hoog" });
  }
  if (/Environ\s*\(|GetTempPath|GetSystemDirectory/i.test(inhoud)) {
    bevindingen.push({ categorie: "structuur", beschrijving: "Systeemomgeving aanroepen in document", ernst: "midden" });
  }
  return bevindingen;
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
      { module: "security", functie: "inhoud-analyse", promptNaam: "security-inhoud-analyse", promptVersie: "1.0.0" },
    );
    if (!resultaat.ok) return null;
    const parsed = JSON.parse(resultaat.inhoud) as { risico_score: number; samenvatting: string };
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
    bevindingen.push({ categorie: "extensie", beschrijving: `Geblokkeerde bestandsextensie: "${ext}"`, ernst: "kritiek" });
    extensieStatus = "geblokkeerd";
    geblokkeerd = true;
    blokkeerReden = `Bestandsextensie "${ext}" is niet toegestaan in FPS Connect.`;
  } else if (MACRO_EXTENSIES.has(ext)) {
    bevindingen.push({ categorie: "extensie", beschrijving: `Macro-extensie: "${ext}" — vereist expliciete goedkeuring`, ernst: "hoog" });
    extensieStatus = "geblokkeerd";
    geblokkeerd = true;
    blokkeerReden = `Office-document met macro's ("${ext}") is geblokkeerd. Vraag de hoofdbeheerder om handmatige beoordeling.`;
  } else if (GEBLOKKEERDE_EXTENSIES.has(ext)) {
    bevindingen.push({ categorie: "extensie", beschrijving: `Geblokkeerde extensie: "${ext}"`, ernst: "kritiek" });
    extensieStatus = "geblokkeerd";
    geblokkeerd = true;
    blokkeerReden = `Bestandsextensie "${ext}" is niet toegestaan.`;
  }

  // 2. Bestandsnaam-anomalieën
  const naamBevindingen = analyserenBestandsnaam(input.bestandsnaam ?? "");
  bevindingen.push(...naamBevindingen);
  if (naamBevindingen.some((b) => b.ernst === "kritiek")) {
    geblokkeerd = true;
    blokkeerReden ??= "Verdachte bestandsnaam gedetecteerd.";
  }

  // 3. MIME-type claim check
  let mimeStatus = "groen";
  const claim = (input.mimeTypeClaim ?? "").toLowerCase();
  if (
    claim.includes("application/x-msdownload") ||
    claim.includes("application/x-dosexec") ||
    claim.includes("application/x-executable") ||
    claim.includes("application/x-sh") ||
    claim.includes("text/x-script")
  ) {
    bevindingen.push({ categorie: "mime", beschrijving: `Verdacht MIME-type opgegeven: "${claim}"`, ernst: "hoog" });
    mimeStatus = "rood";
    geblokkeerd = true;
    blokkeerReden ??= "Verdacht MIME-type.";
  }

  // 4. Bestandsgrootte-checks (OWASP: enforce max file size)
  if (input.bestandsgrootte !== undefined) {
    if (input.bestandsgrootte > 100 * 1024 * 1024) {
      bevindingen.push({ categorie: "grootte", beschrijving: `Bestandsgrootte overschrijdt 100 MB (${Math.round(input.bestandsgrootte / 1024 / 1024)} MB)`, ernst: "hoog" });
    } else if (input.bestandsgrootte > 50 * 1024 * 1024) {
      bevindingen.push({ categorie: "grootte", beschrijving: `Groot bestand: ${Math.round(input.bestandsgrootte / 1024 / 1024)} MB`, ernst: "midden" });
    }
  }

  const risicoNiveau = berekenNiveau(bevindingen, geblokkeerd);

  const uitkomst: Omit<ScanUitkomst, "dbId"> = {
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
    clamavStatus: "niet_gescand",
    yaraStatus: "niet_gescand",
    archiefStatus: "niet_gescand",
  };

  const dbId = await logScanResultaat({ input, uitkomst });
  return { ...uitkomst, dbId };
}

// ── Kern: deep scan (met bytes) ───────────────────────────────────────────────
// OWASP: scan BEFORE making file available; alle checks vóór opslag in publiek pad

export async function scanBestandBytes(input: BytesScanInput): Promise<ScanUitkomst> {
  const { bytes } = input;
  const bevindingen: ScanBevinding[] = [];
  let geblokkeerd = false;
  let inQuarantaine = false;
  let blokkeerReden: string | undefined;
  let quarantaineReden: string | undefined;

  const ext = path.extname(input.bestandsnaam ?? "").toLowerCase();

  // ── 1. Extensie-blacklist ────────────────────────────────────────────────────
  let extensieStatus = "groen";
  if (ALTIJD_GEBLOKKEERD.has(ext)) {
    bevindingen.push({ categorie: "extensie", beschrijving: `Geblokkeerde extensie: "${ext}"`, ernst: "kritiek" });
    extensieStatus = "geblokkeerd";
    geblokkeerd = true;
    blokkeerReden = `Bestandsextensie "${ext}" is niet toegestaan.`;
  } else if (MACRO_EXTENSIES.has(ext)) {
    bevindingen.push({ categorie: "extensie", beschrijving: `Macro-extensie: "${ext}"`, ernst: "hoog" });
    extensieStatus = "geblokkeerd";
    geblokkeerd = true;
    blokkeerReden = `Office-macro bestand geblokkeerd.`;
  }

  // ── 2. Magic bytes — werkelijk MIME-type op basis van bestandsinhoud ─────────
  let mimeStatus = "groen";
  let mimeTypeWerkelijk: string | undefined;
  if (bytes.length >= 4) {
    if (isExecutableMagic(bytes)) {
      bevindingen.push({ categorie: "mime", beschrijving: "Bestand bevat executable magic bytes — vermomd als ander type", ernst: "kritiek" });
      mimeStatus = "geblokkeerd";
      geblokkeerd = true;
      blokkeerReden ??= "Uitvoerbaar bestand gedetecteerd op basis van bestandsinhoud.";
    } else {
      mimeTypeWerkelijk = detecteerMagicMime(bytes) ?? undefined;
      const claim = (input.mimeTypeClaim ?? "").toLowerCase();
      if (mimeTypeWerkelijk && claim && !claim.startsWith(mimeTypeWerkelijk.split("/")[0])) {
        bevindingen.push({ categorie: "mime", beschrijving: `MIME-mismatch: geclaimd "${claim}", gemeten "${mimeTypeWerkelijk}"`, ernst: "midden" });
        mimeStatus = "oranje";
        inQuarantaine = true;
        quarantaineReden ??= "MIME-type komt niet overeen met bestandsinhoud.";
      }
    }
  }

  // ── 3. Bestandsnaam-anomalieën ────────────────────────────────────────────────
  const naamBevindingen = analyserenBestandsnaam(input.bestandsnaam ?? "");
  bevindingen.push(...naamBevindingen);
  if (naamBevindingen.some((b) => b.ernst === "kritiek")) {
    geblokkeerd = true;
    blokkeerReden ??= "Verdachte bestandsnaam.";
  }

  // ── 4. Archiefcontrole: ZIP/7z/RAR — wachtwoord, zip-bom, gevaarlijke inhoud ─
  let archiefStatus = "niet_gescand";
  if (isArchiefExtensie(ext) || mimeTypeWerkelijk?.includes("zip") || mimeTypeWerkelijk?.includes("rar") || mimeTypeWerkelijk?.includes("7z")) {
    try {
      const archiefResultaat = await scanArchief(bytes);
      if (archiefResultaat.isArchief) {
        archiefStatus = archiefResultaat.bevindingen.length === 0 ? "groen" : "rood";
        for (const b of archiefResultaat.bevindingen) {
          bevindingen.push({ categorie: "archief", beschrijving: b.beschrijving, ernst: b.ernst });
          if (b.geblokkeerd) {
            geblokkeerd = true;
            blokkeerReden ??= b.beschrijving;
          }
        }
        if (archiefResultaat.wachtwoordBeveiligd) {
          archiefStatus = "geblokkeerd";
        }
      } else {
        archiefStatus = "groen";
      }
    } catch {
      archiefStatus = "fout";
    }
  }

  // ── 5. Structuurcheck PDF/Office ──────────────────────────────────────────────
  let structuurStatus = "niet_gescand";
  const mime = mimeTypeWerkelijk ?? input.mimeTypeClaim ?? "";

  if (mime.includes("pdf") || ext === ".pdf") {
    const sb = controleerPdfStructuur(bytes);
    bevindingen.push(...sb);
    structuurStatus = sb.some((b) => b.ernst === "kritiek") ? "geblokkeerd"
      : sb.some((b) => b.ernst === "hoog") ? "rood"
        : sb.length > 0 ? "oranje" : "groen";
    if (sb.some((b) => b.ernst === "kritiek")) {
      inQuarantaine = true;
      quarantaineReden ??= "PDF bevat gevaarlijke actieve inhoud.";
    }
  } else if (
    mime.includes("msword") || mime.includes("ms-excel") || mime.includes("ms-powerpoint") ||
    mime.includes("officedocument") || [".doc", ".xls", ".ppt", ".dot", ".xlt"].includes(ext)
  ) {
    const sb = controleerOle2Structuur(bytes);
    bevindingen.push(...sb);
    structuurStatus = sb.some((b) => b.ernst === "kritiek") ? "geblokkeerd"
      : sb.some((b) => b.ernst === "hoog") ? "rood" : "groen";
    if (sb.some((b) => b.ernst === "kritiek")) {
      geblokkeerd = true;
      blokkeerReden ??= "Office-document bevat gevaarlijke macro-inhoud.";
    } else if (sb.some((b) => b.ernst === "hoog")) {
      inQuarantaine = true;
      quarantaineReden ??= "Office-document bevat macroproject.";
    }
  } else {
    structuurStatus = "groen";
  }

  // ── 6. YARA-patroonherkenning ─────────────────────────────────────────────────
  let yaraStatus = "niet_gescand";
  const yaraResultaat = await scanMetYara(bytes);
  if (yaraResultaat.status === "schoon") {
    yaraStatus = "groen";
  } else if (yaraResultaat.status === "matches") {
    const kritiek = yaraResultaat.bevindingen.some((b) => b.ernst === "kritiek");
    const hoog = yaraResultaat.bevindingen.some((b) => b.ernst === "hoog");
    yaraStatus = kritiek ? "geblokkeerd" : hoog ? "rood" : "oranje";
    for (const b of yaraResultaat.bevindingen) {
      bevindingen.push({ categorie: "yara", beschrijving: b.beschrijving, ernst: b.ernst });
    }
    if (kritiek) {
      geblokkeerd = true;
      blokkeerReden ??= `YARA: ${yaraResultaat.bevindingen.find((b) => b.ernst === "kritiek")?.beschrijving}`;
    } else if (hoog) {
      inQuarantaine = true;
      quarantaineReden ??= `YARA: ${yaraResultaat.bevindingen.find((b) => b.ernst === "hoog")?.beschrijving}`;
    }
  } else if (yaraResultaat.status === "niet_beschikbaar") {
    yaraStatus = "niet_beschikbaar";
  } else {
    yaraStatus = "fout";
  }

  // ── 7. ClamAV malware/virusscan ────────────────────────────────────────────────
  let clamavStatus = "niet_beschikbaar";
  const clamavResultaat = await scanMetClamAv(bytes);
  if (clamavResultaat.status === "schoon") {
    clamavStatus = "groen";
  } else if (clamavResultaat.status === "geïnfecteerd") {
    clamavStatus = "geblokkeerd";
    bevindingen.push({ categorie: "antivirus", beschrijving: `ClamAV: ${clamavResultaat.melding}`, ernst: "kritiek" });
    geblokkeerd = true;
    blokkeerReden ??= `Antivirusscan: ${clamavResultaat.melding}`;
  } else if (clamavResultaat.status === "fout") {
    clamavStatus = "fout";
    bevindingen.push({ categorie: "antivirus", beschrijving: `ClamAV fout: ${clamavResultaat.reden}`, ernst: "midden" });
  }

  // ── 8. Link-extractie + URL-reputatie + AI inhoudsanalyse ────────────────────
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
        bevindingen.push({ categorie: "links", beschrijving: `${rodeLinks.length} verdachte link(s) in document: ${rodeLinks[0].url.slice(0, 80)}`, ernst: "hoog" });
        inQuarantaine = true;
        quarantaineReden ??= "Document bevat verdachte links.";
      }
    } else {
      linkStatus = "groen";
    }
  } catch {
    linkStatus = "niet_gescand";
  }

  let aiStatus = "niet_gescand";
  let aiSamenvatting: string | undefined;
  try {
    const leesbareTekst = bytes.toString("utf8");
    if (/[\x20-\x7E]/.test(leesbareTekst) && leesbareTekst.length > 50) {
      const aiResultaat = await analyserenInhoudAI(leesbareTekst);
      if (aiResultaat) {
        aiStatus = aiResultaat.risicoScore >= 70 ? "rood" : aiResultaat.risicoScore >= 40 ? "oranje" : "groen";
        aiSamenvatting = aiResultaat.samenvatting;
        if (aiResultaat.risicoScore >= 70) {
          bevindingen.push({ categorie: "ai", beschrijving: `AI-analyse: ${aiResultaat.samenvatting}`, ernst: "hoog" });
          inQuarantaine = true;
          quarantaineReden ??= `AI-inhoudsanalyse: ${aiResultaat.samenvatting}`;
        } else if (aiResultaat.risicoScore >= 40) {
          bevindingen.push({ categorie: "ai", beschrijving: `AI-analyse (verhoogd risico): ${aiResultaat.samenvatting}`, ernst: "midden" });
        }
      }
    }
  } catch {
    aiStatus = "niet_gescand";
  }

  const actie: ScanUitkomst["actie"] = geblokkeerd ? "geblokkeerd"
    : inQuarantaine ? "quarantaine"
      : "toegestaan";

  const risicoNiveau = berekenNiveau(bevindingen, geblokkeerd, inQuarantaine);

  const uitkomst: Omit<ScanUitkomst, "dbId"> = {
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
    yaraStatus,
    archiefStatus,
  };

  // ── Quarantaine-opslag buiten publieke toegang ─────────────────────────────────
  // OWASP: store quarantined files outside web root, no public access
  let quarantainePad: string | undefined;
  if ((actie === "quarantaine" || actie === "geblokkeerd") && bytes.length < 50 * 1024 * 1024) {
    const dbIdVoorQuarantaine = await logScanResultaat({ input, uitkomst });
    if (dbIdVoorQuarantaine) {
      const pad = await slaQuarantaineOp(bytes, {
        scanId: dbIdVoorQuarantaine,
        bestandsnaam: input.bestandsnaam,
        reden: blokkeerReden ?? quarantaineReden ?? "onbekend",
        gebruikerId: input.gebruikerId ?? undefined,
      }).catch(() => undefined);
      quarantainePad = pad;
      if (pad) {
        await db.update(securityIntakeScansTable)
          .set({ quarantainePad: pad, bijgewerktOp: new Date() })
          .where(eq(securityIntakeScansTable.id, dbIdVoorQuarantaine))
          .catch(() => {});
      }
      return { ...uitkomst, dbId: dbIdVoorQuarantaine, quarantainePad } as ScanUitkomst;
    }
  }

  const dbId = await logScanResultaat({ input, uitkomst });
  return { ...uitkomst, dbId };
}

// ── E-mailbeveiliging ─────────────────────────────────────────────────────────

export async function scanEmailBericht(input: EmailScanInput): Promise<ScanUitkomst> {
  const bevindingen: ScanBevinding[] = [];
  let geblokkeerd = false;
  let inQuarantaine = false;
  let blokkeerReden: string | undefined;
  let quarantaineReden: string | undefined;
  let extensieStatus = "groen";

  // 1. Afzender-analyse
  const VERDACHTE_AFZENDER = [
    /noreply.*@.*\.(tk|ml|ga|cf|gq|pw)/i,
    /info@.*\d{8,}/,
    /no-reply@.*temp.*mail/i,
    /@(0-mail|getairmail|guerrillamail|mailnull|maildrop|yopmail)/i,
  ];
  for (const p of VERDACHTE_AFZENDER) {
    if (p.test(input.afzender)) {
      bevindingen.push({ categorie: "afzender", beschrijving: `Verdacht afzenderpatroon: ${input.afzender}`, ernst: "hoog" });
      inQuarantaine = true;
      quarantaineReden ??= "Verdacht e-mailadres.";
    }
  }

  // 2. Bijlagen-scan
  for (const naam of input.bijlageNamen) {
    const ext = path.extname(naam).toLowerCase();
    if (ALTIJD_GEBLOKKEERD.has(ext)) {
      bevindingen.push({ categorie: "bijlage", beschrijving: `Gevaarlijke bijlage: "${naam}"`, ernst: "kritiek" });
      geblokkeerd = true;
      blokkeerReden ??= `Bijlage "${naam}" heeft een gevaarlijke extensie.`;
      extensieStatus = "geblokkeerd";
    } else if (GEBLOKKEERDE_EXTENSIES.has(ext)) {
      bevindingen.push({ categorie: "bijlage", beschrijving: `Verdachte bijlage: "${naam}"`, ernst: "hoog" });
      inQuarantaine = true;
      quarantaineReden ??= `Bijlage "${naam}" is verdacht.`;
    }
    bevindingen.push(...analyserenBestandsnaam(naam).filter((b) => b.ernst !== "info"));
  }

  // 3. Links in e-mail
  const linkRisicos = analyserenLinks(input.links);
  const rodeLinks = linkRisicos.filter((l) => l.risicoNiveau === "rood");
  const linkStatus = hoogsteNiveauUitLinks(linkRisicos);
  if (rodeLinks.length > 0) {
    bevindingen.push({ categorie: "links", beschrijving: `${rodeLinks.length} verdachte link(s): ${rodeLinks[0].url.slice(0, 80)}`, ernst: "hoog" });
    inQuarantaine = true;
    quarantaineReden ??= "E-mail bevat verdachte links.";
  }

  // 4. AI-inhoudsanalyse
  let aiStatus = "niet_gescand";
  let aiSamenvatting: string | undefined;
  try {
    const aiResultaat = await analyserenInhoudAI(`Onderwerp: ${input.onderwerp}\n\n${input.tekstInhoud}`);
    if (aiResultaat) {
      aiStatus = aiResultaat.risicoScore >= 70 ? "rood" : aiResultaat.risicoScore >= 40 ? "oranje" : "groen";
      aiSamenvatting = aiResultaat.samenvatting;
      if (aiResultaat.risicoScore >= 70) {
        bevindingen.push({ categorie: "ai", beschrijving: `AI-analyse e-mail: ${aiResultaat.samenvatting}`, ernst: "hoog" });
        inQuarantaine = true;
        quarantaineReden ??= `AI-analyse: ${aiResultaat.samenvatting}`;
      }
    }
  } catch {
    aiStatus = "niet_gescand";
  }

  const actie: ScanUitkomst["actie"] = geblokkeerd ? "geblokkeerd" : inQuarantaine ? "quarantaine" : "toegestaan";
  const risicoNiveau = berekenNiveau(bevindingen, geblokkeerd, inQuarantaine);

  const uitkomst: Omit<ScanUitkomst, "dbId"> = {
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
    yaraStatus: "niet_gescand",
    archiefStatus: "niet_gescand",
  };

  const dbId = await logScanResultaat({
    input: {
      ...input,
      bestandsnaam: `e-mail: ${input.onderwerp.slice(0, 100)}`,
      mimeTypeClaim: "message/rfc822",
      uploadBron: "email" as const,
      emailOnderwerp: input.onderwerp,
    } as MetadataScanInput & { emailOnderwerp: string },
    uitkomst,
  });

  return { ...uitkomst, dbId };
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
        yaraStatus: uitkomst.yaraStatus,
        archiefStatus: uitkomst.archiefStatus,
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

// ── Status-query voor scan-first enforcement ──────────────────────────────────

export async function haalScanStatusOpVoorPad(objectPad: string): Promise<{
  gescand: boolean;
  geblokkeerd: boolean;
  risicoNiveau: string;
} | null> {
  try {
    const [rij] = await db
      .select({
        actie: securityIntakeScansTable.actie,
        risicoNiveau: securityIntakeScansTable.risicoNiveau,
      })
      .from(securityIntakeScansTable)
      .where(eq(securityIntakeScansTable.objectPad, objectPad))
      .orderBy(securityIntakeScansTable.aangemaaktOp)
      .limit(1);

    if (!rij) return null;
    return {
      gescand: true,
      geblokkeerd: rij.actie === "geblokkeerd",
      risicoNiveau: rij.risicoNiveau,
    };
  } catch {
    return null;
  }
}

export { ALTIJD_GEBLOKKEERD, MACRO_EXTENSIES, GEBLOKKEERDE_EXTENSIES };
