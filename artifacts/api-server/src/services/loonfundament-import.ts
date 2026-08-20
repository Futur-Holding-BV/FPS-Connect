// LOON_02A — Loonfundament import service.
//
// Verwerkt een set van exact 7 bronbestanden (belastingdienst.nl subdomeinen,
// HTTPS) naar een jaarset met jaarbronnen en jaarparameters. Fail-closed:
// bij welke fout ook worden er geen DB-rijen aangemaakt.
//
// Stappen:
//  1. Valideer URL-allowlist (uitsluitend *.belastingdienst.nl, HTTPS)
//  2. Download alle 7 bronnen
//  3. Valideer SHA-256 en MIME/extensie
//  4. Valideer primaire_xlsx: moet XLSX zijn + jaar aantoonbaar in workbook
//  5. Parse primaire_xlsx deterministisch (alle niet-lege inhoudelijke werkbladen)
//  6. Sla alles op in één DB-transactie (staging + promotie vorig volledig → vervangen)
//
// Geen fiscale bedragen of percentages hardcoded in TS.

import { createHash } from "crypto";
import XLSX from "xlsx";
import {
  db,
  loonJaarsetsTable,
  loonJaarbronnenTable,
  loonJaarparametersTable,
} from "@workspace/db";
import { eq, and, desc, inArray, sql } from "drizzle-orm";

// ── Constanten ────────────────────────────────────────────────────────────────

export const VEREISTE_BRONSOORTEN = [
  "primaire_xlsx",
  "rekenvoorschriften",
  "parameterbijlage",
  "gegevensspecificaties",
  "loonbelastingtabellen",
  "cijferbijlage",
  "handboek",
] as const;

export type Bronsoort = (typeof VEREISTE_BRONSOORTEN)[number];

// Toegestane MIME-types per bronsoort-suffix
const XLSX_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);
const PDF_MIMES = new Set([
  "application/pdf",
]);
const HTML_MIMES = new Set([
  "text/html",
]);

export class JaarImportConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JaarImportConflictError";
  }
}

class BronHashMismatchError extends Error {
  constructor(
    readonly bron: BronInput,
    readonly berekendeSha256: string,
  ) {
    super(
      `SHA-256 mismatch voor ${bron.bronsoort} (${bron.officiele_bestandsnaam}): ` +
        `verwacht ${bron.verwachte_sha256}, berekend ${berekendeSha256}`,
    );
    this.name = "BronHashMismatchError";
  }
}

class BronsetValidatieError extends Error {
  constructor(
    message: string,
    readonly hashMismatches: BronHashMismatchError[],
  ) {
    super(message);
    this.name = "BronsetValidatieError";
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BronInput {
  bronsoort: Bronsoort;
  bron_url: string;
  officiele_bestandsnaam: string;
  officiele_versie: string;
  verwachte_sha256: string;
  vindplaats: string;
}

/**
 * Gecontroleerde officiële bronmanifesten. Deze metadata bevat uitsluitend
 * herkomstinformatie (geen fiscale bedragen, percentages of grenzen).
 * Een jaar zonder manifest kan niet worden geïmporteerd.
 */
export const OFFICIELE_BRONMANIFESTEN: Readonly<Record<number, readonly BronInput[]>> = {
  2026: [
    {
      bronsoort: "primaire_xlsx",
      bron_url: "https://download.belastingdienst.nl/belastingdienst/docs/bijlage_rekenvoorschr_voor_geauto_loonadm_xls_lh991t61fd.xlsx",
      officiele_bestandsnaam: "bijlage_rekenvoorschr_voor_geauto_loonadm_xls_lh991t61fd.xlsx",
      officiele_versie: "2026, uitgave januari",
      verwachte_sha256: "2d463a44286f7af24ed60c9889253ea4068e75b4ff6726c06ca1b12a9a0d9638",
      vindplaats: "Bijlage bij de Rekenvoorschriften voor de geautomatiseerde loonadministratie 2026",
    },
    {
      bronsoort: "rekenvoorschriften",
      bron_url: "https://download.belastingdienst.nl/belastingdienst/docs/rekenvoorschriften_voor_geautomatiseerde_loonadministratie_lh991z62fd.pdf",
      officiele_bestandsnaam: "rekenvoorschriften_voor_geautomatiseerde_loonadministratie_lh991z62fd.pdf",
      officiele_versie: "januari 2026, versie 2",
      verwachte_sha256: "283c1857d923e8cc9ed7d0a33ae6f6c0c8f35db6c886d67ee2289324cfe58a03",
      vindplaats: "Rekenvoorschriften voor de geautomatiseerde loonadministratie 2026",
    },
    {
      bronsoort: "parameterbijlage",
      bron_url: "https://download.belastingdienst.nl/belastingdienst/docs/bijlage_rekenvoorschr_voor_geauto_loonadm_pdf_lh991b61fd.pdf",
      officiele_bestandsnaam: "bijlage_rekenvoorschr_voor_geauto_loonadm_pdf_lh991b61fd.pdf",
      officiele_versie: "januari 2026",
      verwachte_sha256: "fb64f97320f4e7241a2d8c8cf13540579282e5f34156be986f540eb8dbd5ab48",
      vindplaats: "PDF-bijlage bij de Rekenvoorschriften voor de geautomatiseerde loonadministratie 2026",
    },
    {
      bronsoort: "gegevensspecificaties",
      bron_url: "https://download.belastingdienst.nl/belastingdienst/docs/gegevens_aangifte_loonheffingen_2026_lh9861t62fd.pdf",
      officiele_bestandsnaam: "gegevens_aangifte_loonheffingen_2026_lh9861t62fd.pdf",
      officiele_versie: "2026",
      verwachte_sha256: "8dcb40e3fce7175ed00e4c4d87e0135e4c3807fa52a2b941a6654a61a867089e",
      vindplaats: "Gegevensspecificaties aangifte loonheffingen 2026",
    },
    {
      bronsoort: "loonbelastingtabellen",
      bron_url: "https://www.belastingdienst.nl/wps/wcm/connect/nl/personeel-en-loon/content/hulpmiddel-loonbelastingtabellen",
      officiele_bestandsnaam: "hulpmiddel-loonbelastingtabellen-2026.html",
      officiele_versie: "2026",
      verwachte_sha256: "ce668b71ec2c8fa70e235461f7a5e18d984e31342420ffa51bfdb57e48466893",
      vindplaats: "Belastingdienst, hulpmiddel loonbelastingtabellen 2026",
    },
    {
      bronsoort: "cijferbijlage",
      bron_url: "https://odb.belastingdienst.nl/wp-content/uploads/2025/12/Cijferbijlage-2026-bij-Nieuwsbrief-LH-LH-209-1B61FD_TG.pdf",
      officiele_bestandsnaam: "Cijferbijlage-2026-bij-Nieuwsbrief-LH-LH-209-1B61FD_TG.pdf",
      officiele_versie: "2026",
      verwachte_sha256: "1d348b84937ac2c62c1c4882f32433b012b55180434a872affd785ec48ba4233",
      vindplaats: "Cijferbijlage 2026 bij Nieuwsbrief Loonheffingen",
    },
    {
      bronsoort: "handboek",
      bron_url: "https://download.belastingdienst.nl/belastingdienst/docs/handboek-loonheffingen-lh0221t61fd.pdf",
      officiele_bestandsnaam: "handboek-loonheffingen-lh0221t61fd.pdf",
      officiele_versie: "maart 2026",
      verwachte_sha256: "7576eeaab3c4365e768892b343d89bc1ab8018e8f50659c067e4e5fe33c78120",
      vindplaats: "Handboek Loonheffingen 2026, versie maart",
    },
  ],
};

export function valideerBronmanifest(jaar: number, bronnen: BronInput[]): void {
  const verwacht = OFFICIELE_BRONMANIFESTEN[jaar];
  if (!verwacht) {
    throw new Error(
      `Voor parameterjaar ${jaar} is geen gecontroleerd officieel bronmanifest beschikbaar`,
    );
  }
  if (bronnen.length !== verwacht.length) {
    throw new Error(`Bronmanifest ${jaar} vereist exact ${verwacht.length} bronnen`);
  }

  const velden: Array<keyof BronInput> = [
    "bron_url",
    "officiele_bestandsnaam",
    "officiele_versie",
    "verwachte_sha256",
    "vindplaats",
  ];
  for (const verwachteBron of verwacht) {
    const bron = bronnen.find((item) => item.bronsoort === verwachteBron.bronsoort);
    if (!bron) {
      throw new Error(
        `Bronmanifest ${jaar} mist officiële bronsoort ${verwachteBron.bronsoort}`,
      );
    }
    for (const veld of velden) {
      if (bron[veld] !== verwachteBron[veld]) {
        throw new Error(
          `Bronmanifest ${jaar} wijkt af voor ${verwachteBron.bronsoort}.${veld}`,
        );
      }
    }
  }
}

export interface DownloadedBron {
  input: BronInput;
  buffer: Buffer;
  sha256: string;
  mimeType: string;
  bestandsgrootte: number;
}

export interface ParsedParameter {
  sleutel: string;       // sheet+cel, bv. "Tarieven!B5"
  waarde: unknown;       // exacte waarde uit cel
  datatype: string;      // integer | decimal | boolean | tekst | jsonb
  rekenstatus: "berekend" | "niet_berekend";
  reden: string | null;
  vindplaats: string;    // werkblad!cel
}

// ── URL Allowlist ─────────────────────────────────────────────────────────────

/**
 * Controleert of een URL uitsluitend op een belastingdienst.nl subdomein staat
 * en HTTPS gebruikt. Fail-closed: elke afwijking gooit een Error.
 */
export function valideerBronUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Ongeldige URL: ${url}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`URL moet HTTPS zijn: ${url}`);
  }
  // Hostname moet eindigen op .belastingdienst.nl of belastingdienst.nl zijn
  const hostname = parsed.hostname.toLowerCase();
  if (hostname !== "belastingdienst.nl" && !hostname.endsWith(".belastingdienst.nl")) {
    throw new Error(
      `URL valt buiten de allowlist (uitsluitend *.belastingdienst.nl toegestaan): ${url}`,
    );
  }
}

// ── Download ──────────────────────────────────────────────────────────────────

/**
 * Download één bronbestand en retourneert de buffer. Maximaal 50 MB.
 */
async function downloadBron(url: string): Promise<Buffer> {
  const MAX_BYTES = 50 * 1024 * 1024;
  const resp = await fetch(url, {
    signal: AbortSignal.timeout(60_000),
    redirect: "follow",
  });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} bij downloaden van ${url}`);
  }
  valideerBronUrl(resp.url);
  const contentLength = resp.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_BYTES) {
    throw new Error(`Bronbestand groter dan 50 MB: ${url}`);
  }
  const arrayBuffer = await resp.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_BYTES) {
    throw new Error(`Bronbestand groter dan 50 MB: ${url}`);
  }
  return Buffer.from(arrayBuffer);
}

/**
 * Detecteer MIME-type op basis van magic bytes + URL/extension.
 */
function detecteerMime(buffer: Buffer, url: string): string {
  // XLSX magic: PK\x03\x04 (ZIP)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  ) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  // PDF magic: %PDF
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return "application/pdf";
  }
  const begin = buffer.subarray(0, 1024).toString("utf8").trimStart().toLowerCase();
  if (begin.startsWith("<!doctype html") || begin.startsWith("<html")) {
    return "text/html";
  }
  // Fallback op URL-extensie
  const lower = url.toLowerCase().split("?")[0] ?? "";
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (lower.endsWith(".pdf")) {
    return "application/pdf";
  }
  return "application/octet-stream";
}

/**
 * Valideer MIME en extensie-combinatie.
 * primaire_xlsx MOET een XLSX zijn; overige bronnen mogen PDF zijn.
 */
function valideerMimeEnExtensie(bron: BronInput, mimeType: string): void {
  if (bron.bronsoort === "primaire_xlsx") {
    if (!XLSX_MIMES.has(mimeType)) {
      throw new Error(
        `primaire_xlsx moet een XLSX-bestand zijn, maar MIME is: ${mimeType}`,
      );
    }
    const naam = bron.officiele_bestandsnaam.toLowerCase();
    if (!naam.endsWith(".xlsx") && !naam.endsWith(".xls")) {
      throw new Error(
        `primaire_xlsx bestandsnaam moet eindigen op .xlsx of .xls: ${bron.officiele_bestandsnaam}`,
      );
    }
  } else if (bron.bronsoort === "loonbelastingtabellen") {
    if (!PDF_MIMES.has(mimeType) && !HTML_MIMES.has(mimeType)) {
      throw new Error(
        `Bronbestand loonbelastingtabellen moet HTML of PDF zijn, maar MIME is: ${mimeType}`,
      );
    }
  } else {
    // Overige controlebronnen zijn officiële PDF-publicaties.
    if (!PDF_MIMES.has(mimeType) && !XLSX_MIMES.has(mimeType)) {
      throw new Error(
        `Bronbestand ${bron.bronsoort} heeft onverwacht MIME-type: ${mimeType}`,
      );
    }
  }
}

/**
 * Download en valideer alle 7 bronbestanden parallel.
 * Retourneert de gedownloade bronnen of gooit bij elke fout.
 */
export async function downloadEnValideerBronnen(
  bronnen: BronInput[],
): Promise<DownloadedBron[]> {
  if (bronnen.length !== 7) {
    throw new Error(`Exact 7 bronnen vereist, maar ${bronnen.length} opgegeven`);
  }

  // Controleer dat alle 7 bronsoorten aanwezig zijn
  const opgegeven = new Set(bronnen.map((b) => b.bronsoort));
  for (const soort of VEREISTE_BRONSOORTEN) {
    if (!opgegeven.has(soort)) {
      throw new Error(`Verplichte bronsoort ontbreekt: ${soort}`);
    }
  }

  // Valideer URLs vóór downloaden (fail-closed)
  for (const bron of bronnen) {
    valideerBronUrl(bron.bron_url);
  }

  // Download parallel
  const resultaten = await Promise.allSettled(
    bronnen.map(async (bron): Promise<DownloadedBron> => {
      const buffer = await downloadBron(bron.bron_url);
      const sha256 = createHash("sha256").update(buffer).digest("hex");
      if (sha256 !== bron.verwachte_sha256) {
        throw new BronHashMismatchError(bron, sha256);
      }
      const mimeType = detecteerMime(buffer, bron.bron_url);
      valideerMimeEnExtensie(bron, mimeType);
      return {
        input: bron,
        buffer,
        sha256,
        mimeType,
        bestandsgrootte: buffer.byteLength,
      };
    }),
  );

  const fouten: string[] = [];
  const hashMismatches: BronHashMismatchError[] = [];
  const successen: DownloadedBron[] = [];
  for (const res of resultaten) {
    if (res.status === "rejected") {
      fouten.push(String(res.reason));
      if (res.reason instanceof BronHashMismatchError) {
        hashMismatches.push(res.reason);
      }
    } else {
      successen.push(res.value);
    }
  }
  if (fouten.length > 0) {
    throw new BronsetValidatieError(
      `Download/validatiefout(en) bij bronnen:\n${fouten.join("\n")}`,
      hashMismatches,
    );
  }
  return successen;
}

// ── XLSX parse ────────────────────────────────────────────────────────────────

/**
 * Valideer dat het XLSX-workbook het opgegeven jaar bevat (in sheet-naam of
 * cel-waarden). Fail-closed als jaar niet aantoonbaar is.
 */
function valideerJaarInWorkbook(
  workbook: XLSX.WorkBook,
  jaar: number,
  officieleVersie: string,
): void {
  const jaarStr = String(jaar);
  // Zoek in sheet-namen
  for (const sheetNaam of workbook.SheetNames) {
    if (sheetNaam.includes(jaarStr)) return;
  }
  // Zoek in eerste 200 cellen van elk werkblad
  for (const sheetNaam of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetNaam];
    if (!ws) continue;
    const ref = ws["!ref"];
    if (!ref) continue;
    const range = XLSX.utils.decode_range(ref);
    let gevonden = 0;
    outer: for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + 50); r++) {
      for (let c = range.s.c; c <= Math.min(range.e.c, range.s.c + 20); c++) {
        const adres = XLSX.utils.encode_cell({ r, c });
        const cel = ws[adres];
        if (!cel) continue;
        const waarde = String(cel.v ?? "");
        if (waarde.includes(jaarStr)) return;
        gevonden++;
        if (gevonden > 200) break outer;
      }
    }
  }
  // De officiële bijlage 2026 noemt het jaar niet in de werkbladen/cellen.
  // In dat geval is de gepinde officiële versie-identiteit de jaarvindplaats.
  if (officieleVersie.includes(jaarStr) && workbook.SheetNames.length > 0) return;
  throw new Error(
    `Jaar ${jaar} niet aantoonbaar in het primaire XLSX of de officiële versie. ` +
      `Controleer of het juiste bestand en de juiste versie zijn opgegeven.`,
  );
}

/**
 * Leidt het datatype af van een cel-waarde zonder fiscale constanten.
 */
function leidDatatypeAf(celWaarde: unknown): string {
  if (typeof celWaarde === "boolean") return "boolean";
  if (typeof celWaarde === "number") {
    if (Number.isInteger(celWaarde)) return "integer";
    return "decimal";
  }
  if (typeof celWaarde === "string") return "tekst";
  if (celWaarde !== null && typeof celWaarde === "object") return "jsonb";
  return "tekst";
}

/**
 * Parse alle niet-lege inhoudelijke werkbladen van het primaire XLSX deterministisch.
 * Retourneert een array van ParsedParameter-objecten met unieke sleutels (sheet!cel).
 * Lege/onherleidbare cellen krijgen rekenstatus niet_berekend + reden.
 */
export function parseXlsxNaarParameters(
  buffer: Buffer,
  bronsoort: string,
): ParsedParameter[] {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  } catch (err) {
    throw new Error(`XLSX parse-fout: ${String(err)}`);
  }

  const parameters: ParsedParameter[] = [];

  for (const sheetNaam of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetNaam];
    if (!ws) continue;
    const ref = ws["!ref"];
    if (!ref) continue;

    const range = XLSX.utils.decode_range(ref);

    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const adres = XLSX.utils.encode_cell({ r, c });
        const cel = ws[adres];

        // Sla lege cellen over
        if (!cel) continue;
        const rawWaarde = cel.v;
        if (rawWaarde === null || rawWaarde === undefined || rawWaarde === "") {
          continue;
        }

        // Foutcellen blijven zichtbaar als niet-herleidbare bronregel.
        if (cel.t === "e") {
          parameters.push({
            sleutel: `${sheetNaam}!${adres}`,
            waarde: null,
            datatype: "tekst",
            rekenstatus: "niet_berekend",
            reden: "Foutwaarde in officiële XLSX-bron",
            vindplaats: `${sheetNaam}!${adres}`,
          });
          continue;
        }

        const sleutel = `${sheetNaam}!${adres}`;
        const vindplaats = `${sheetNaam}!${adres}`;

        let waarde: unknown;
        let rekenstatus: "berekend" | "niet_berekend";
        let reden: string | null = null;
        let datatype: string;

        try {
          waarde = rawWaarde;
          datatype = leidDatatypeAf(waarde);
          rekenstatus = "berekend";
        } catch {
          waarde = null;
          datatype = "tekst";
          rekenstatus = "niet_berekend";
          reden = "Waarde niet herleidbaar";
        }

        parameters.push({
          sleutel,
          waarde,
          datatype,
          rekenstatus,
          reden,
          vindplaats,
        });
      }
    }
  }

  return parameters;
}

// ── DB-transactie ─────────────────────────────────────────────────────────────

export interface ImportResult {
  jaarsetId: number;
  jaar: number;
  versie: number;
  parameterAantal: number;
  status: string;
}

/**
 * Sla de gedownloade bronnen en parameters op in één atomische DB-transactie.
 *
 * Stappen binnen de transactie:
 *  1. Promoveer vorig volledig jaarset (zelfde jaar) naar status 'vervangen'
 *  2. Maak nieuwe jaarset aan (staging)
 *  3. Maak jaarbronnen aan
 *  4. Maak jaarparameters aan (van primaire_xlsx)
 *  5. Update jaarset naar status 'volledig' / 'onvolledig'
 */
export async function slaJaarsetOp(
  jaar: number,
  geladenDoorId: number | null,
  bronnen: DownloadedBron[],
  parameters: ParsedParameter[],
  primaireXlsxBron: DownloadedBron,
): Promise<ImportResult> {
  return await db.transaction(async (tx) => {
    // Eén import per kalenderjaar tegelijk; voorkomt dubbele promoties/races.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('loonfundament-jaarimport'), ${jaar})`,
    );

    // Bepaal versienummer en weiger een identieke bronset.
    const bestaandeVersies = await tx
      .select({ id: loonJaarsetsTable.id, versie: loonJaarsetsTable.versie })
      .from(loonJaarsetsTable)
      .where(eq(loonJaarsetsTable.jaar, jaar));

    if (bestaandeVersies.length > 0) {
      const bestaandeBronnen = await tx
        .select({
          jaarsetId: loonJaarbronnenTable.jaarsetId,
          bronsoort: loonJaarbronnenTable.bronsoort,
          sha256: loonJaarbronnenTable.sha256,
        })
        .from(loonJaarbronnenTable)
        .where(inArray(
          loonJaarbronnenTable.jaarsetId,
          bestaandeVersies.map((set) => set.id),
        ));
      const nieuweSignatuur = bronnen
        .map((bron) => `${bron.input.bronsoort}:${bron.sha256}`)
        .sort()
        .join("|");
      const perSet = new Map<number, string[]>();
      for (const bron of bestaandeBronnen) {
        const regels = perSet.get(bron.jaarsetId) ?? [];
        regels.push(`${bron.bronsoort}:${bron.sha256}`);
        perSet.set(bron.jaarsetId, regels);
      }
      if ([...perSet.values()].some((regels) => regels.sort().join("|") === nieuweSignatuur)) {
        throw new JaarImportConflictError(
          `Deze officiële bronset is al voor ${jaar} geladen`,
        );
      }
    }

    const maxVersie = bestaandeVersies.reduce((m, r) => Math.max(m, r.versie), 0);
    const nieuweVersie = maxVersie + 1;

    const nietBerekend = parameters.filter((p) => p.rekenstatus === "niet_berekend");
    const status = parameters.length > 0 && nietBerekend.length === 0
      ? "volledig"
      : "onvolledig";

    // Alleen een volledig gecontroleerde set vervangt de actieve set.
    if (status === "volledig") {
      await tx
        .update(loonJaarsetsTable)
        .set({ status: "vervangen", volledig: false, vervangenOp: new Date(), bijgewerktOp: new Date() })
        .where(
          and(
            eq(loonJaarsetsTable.jaar, jaar),
            eq(loonJaarsetsTable.status, "volledig"),
          ),
        );
    }

    // Maak de staging-jaarset aan.
    const [jaarset] = await tx
      .insert(loonJaarsetsTable)
      .values({
        jaar,
        versie: nieuweVersie,
        status: "concept",
        volledig: false,
        parameterAantal: 0,
        fouten: nietBerekend.map((parameter) => ({
          sleutel: parameter.sleutel,
          reden: parameter.reden ?? "Niet herleidbaar",
        })),
        geladenDoorId,
        geladenOp: new Date(),
      })
      .returning();

    if (!jaarset) throw new Error("Aanmaken jaarset mislukt");

    // 4. Maak jaarbronnen aan (exact 7)
    const bronRecords = await tx
      .insert(loonJaarbronnenTable)
      .values(
        bronnen.map((b) => ({
          jaarsetId: jaarset.id,
          bronsoort: b.input.bronsoort,
          bronUrl: b.input.bron_url,
          officieleBestandsnaam: b.input.officiele_bestandsnaam,
          officieleVersie: b.input.officiele_versie,
          sha256: b.sha256,
          mimeType: b.mimeType,
          bestandsgrootte: b.bestandsgrootte,
          vindplaats: b.input.vindplaats,
          geladenOp: new Date(),
        })),
      )
      .returning();

    // Zoek de bron-ID van primaire_xlsx
    const primaireXlsxRecord = bronRecords.find(
      (b) => b.bronsoort === "primaire_xlsx",
    );

    // 5. Maak jaarparameters aan vanuit primaire_xlsx
    let parameterAantal = 0;
    if (parameters.length > 0 && primaireXlsxRecord) {
      await tx.insert(loonJaarparametersTable).values(
        parameters.map((p) => ({
          jaarsetId: jaarset.id,
          sleutel: p.sleutel,
          datatype: p.datatype,
          waarde: p.waarde,
          rekenstatus: p.rekenstatus,
          reden: p.reden,
          bronId: p.rekenstatus === "berekend" ? primaireXlsxRecord.id : null,
          vindplaats: p.vindplaats,
        })),
      );
      parameterAantal = parameters.length;
    }

    // Update jaarset naar definitieve status.
    const [bijgewerktJaarset] = await tx
      .update(loonJaarsetsTable)
      .set({
        status,
        volledig: status === "volledig",
        parameterAantal,
        bijgewerktOp: new Date(),
      })
      .where(eq(loonJaarsetsTable.id, jaarset.id))
      .returning();

    return {
      jaarsetId: jaarset.id,
      jaar,
      versie: nieuweVersie,
      parameterAantal,
      status: bijgewerktJaarset?.status ?? status,
    };
  });
}

// ── Hoofd-import flow ─────────────────────────────────────────────────────────

export interface ImportInput {
  jaar: number;
  bronnen: BronInput[];
  geladenDoorId: number | null;
}

async function markeerWerkelijkGewijzigdeBronnen(
  jaar: number,
  mismatches: BronHashMismatchError[],
): Promise<void> {
  if (mismatches.length === 0) return;
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('loonfundament-jaarimport'), ${jaar})`,
    );
    const teBlokkeren = new Set<number>();
    for (const mismatch of mismatches) {
      const [laatsteZelfdeUrl] = await tx
        .select({
          jaarsetId: loonJaarsetsTable.id,
          status: loonJaarsetsTable.status,
          opgeslagenSha256: loonJaarbronnenTable.sha256,
        })
        .from(loonJaarbronnenTable)
        .innerJoin(
          loonJaarsetsTable,
          eq(loonJaarsetsTable.id, loonJaarbronnenTable.jaarsetId),
        )
        .where(
          and(
            eq(loonJaarsetsTable.jaar, jaar),
            eq(loonJaarbronnenTable.bronsoort, mismatch.bron.bronsoort),
            eq(loonJaarbronnenTable.bronUrl, mismatch.bron.bron_url),
          ),
        )
        .orderBy(desc(loonJaarsetsTable.versie))
        .limit(1);
      if (
        laatsteZelfdeUrl?.status === "volledig" &&
        laatsteZelfdeUrl.opgeslagenSha256 !== mismatch.berekendeSha256
      ) {
        teBlokkeren.add(laatsteZelfdeUrl.jaarsetId);
      }
    }
    if (teBlokkeren.size > 0) {
      await tx
        .update(loonJaarsetsTable)
        .set({
          status: "bron_gewijzigd",
          volledig: false,
          fouten: [{
            sleutel: "bronset",
            reden: "Een eerder geladen officiële bron-URL levert gewijzigde bytes; herimport vereist",
          }],
          bijgewerktOp: new Date(),
        })
        .where(inArray(loonJaarsetsTable.id, [...teBlokkeren]));
    }
  });
}

/**
 * Voert de volledige importflow uit: download → valideer → parse → DB-transactie.
 * Fail-closed: bij welke fout ook worden geen DB-rijen aangemaakt.
 */
export async function voerImportUit(input: ImportInput): Promise<ImportResult> {
  const { jaar, bronnen, geladenDoorId } = input;

  // Alleen vooraf gecontroleerde officiële metadata mag worden gedownload.
  // Zo kan een beheerder niet zelf een willekeurige Belastingdienst-publicatie
  // en bijpassende hash tot een "volledige" jaarset verklaren.
  valideerBronmanifest(jaar, bronnen);

  // Download en valideer alle bronnen (volledig buiten de DB-transactie)
  let gedownload: DownloadedBron[];
  try {
    gedownload = await downloadEnValideerBronnen(bronnen);
  } catch (err) {
    if (err instanceof BronsetValidatieError) {
      await markeerWerkelijkGewijzigdeBronnen(jaar, err.hashMismatches);
    }
    throw err;
  }

  // Zoek de primaire XLSX
  const primaireXlsx = gedownload.find((b) => b.input.bronsoort === "primaire_xlsx");
  if (!primaireXlsx) {
    throw new Error("primaire_xlsx ontbreekt in gedownloade bronnen");
  }

  // Valideer jaar in workbook
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(primaireXlsx.buffer, { type: "buffer", cellDates: false });
  } catch (err) {
    throw new Error(`primaire_xlsx kon niet als XLSX worden gelezen: ${String(err)}`);
  }
  valideerJaarInWorkbook(
    workbook,
    jaar,
    primaireXlsx.input.officiele_versie,
  );

  // Parse parameters deterministisch
  const parameters = parseXlsxNaarParameters(primaireXlsx.buffer, "primaire_xlsx");

  // Sla op in één DB-transactie
  return await slaJaarsetOp(jaar, geladenDoorId, gedownload, parameters, primaireXlsx);
}
