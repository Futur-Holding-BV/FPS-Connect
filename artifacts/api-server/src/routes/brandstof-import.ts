// MKB Brandstof import-adapter — PDF, UBL/XML en EML-parsing.
// Privacy-by-design: analyse is voertuiggericht, niet persoonsgebonden.

import { Router } from "express";
import multer from "multer";
import { XMLParser } from "fast-xml-parser";
import { simpleParser } from "mailparser";
import { db } from "@workspace/db";
import {
  brandstofImportenTable,
  brandstofRegelsTable,
  voertuigenTable,
  wagenparkKostenTable,
} from "@workspace/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth.js";
import { logger } from "../lib/logger.js";
import { extraheerPdfTekst } from "../lib/pdfTekst";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const lezen    = requireBevoegdheid("wagenpark", 1);
const schrijven = requireBevoegdheid("wagenpark", 2);

// ── Kenteken-normalisatie ─────────────────────────────────────────────────────

function normalizeKenteken(raw: string): string {
  return raw.toUpperCase().replace(/[\s\-\.]/g, "");
}

// ── MKB Brandstof PDF-parser ──────────────────────────────────────────────────

interface RuweRegel {
  datum?: string;
  kenteken?: string;
  pasnummer?: string;
  locatie?: string;
  product?: string;
  hoeveelheid?: number;
  eenheid?: "ltr" | "kwh";
  bedragExBtw?: number;
  btw?: number;
  bedragInclBtw?: number;
  kmStand?: number;
}

function isMkbBrandstof(tekst: string): boolean {
  const lower = tekst.toLowerCase();
  return (
    lower.includes("mkb brandstof") ||
    lower.includes("mkb energie") ||
    lower.includes("mkbbrandstof") ||
    lower.includes("mkb-brandstof")
  );
}

function parseDatumNl(s: string): Date | undefined {
  // dd-mm-yyyy of dd/mm/yyyy of yyyy-mm-dd
  const m1 = s.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
  if (m1) return new Date(`${m1[3]}-${m1[2]}-${m1[1]}`);
  const m2 = s.match(/(\d{4})[\/\-](\d{2})[\/\-](\d{2})/);
  if (m2) return new Date(`${m2[1]}-${m2[2]}-${m2[3]}`);
  return undefined;
}

function parseBedrag(s: string): number | undefined {
  const clean = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(clean);
  return isNaN(n) ? undefined : n;
}

// Kentekenpatroon: NL-stijl met of zonder koppelteken
const KENTEKEN_RE = /\b([A-Z]{1,3}[\-\s]?[0-9]{1,3}[\-\s]?[A-Z]{0,3}[0-9]{0,3})\b/g;
const DATUM_RE    = /\b(\d{2}[\/\-]\d{2}[\/\-]\d{4}|\d{4}[\/\-]\d{2}[\/\-]\d{2})\b/g;
const BEDRAG_RE   = /\b(\d{1,6}[.,]\d{2})\b/g;
const LITER_RE    = /(\d+[.,]\d+)\s*(l|ltr|liter|L)\b/i;
const KWH_RE      = /(\d+[.,]\d+)\s*(kwh|kWh)\b/i;
const KM_RE       = /\b(\d{5,7})\s*(km)?\b/i;
const PAS_RE      = /\b(pas|card|kaart)[\s\-#:]*([A-Z0-9]{4,20})\b/i;

function parsePdfRuweRegels(tekst: string): RuweRegel[] {
  // Split op regeleinden en probeer per cluster te matchen
  const regels: RuweRegel[] = [];
  const lines = tekst.split(/\n/).map(l => l.trim()).filter(Boolean);

  let huidigeDatum: string | undefined;

  for (const line of lines) {
    // Datum op eigen regel of inline
    const datumMatch = line.match(/(\d{2}[\/\-]\d{2}[\/\-]\d{4})/);
    if (datumMatch) huidigeDatum = datumMatch[1];

    // Controleer of er een kenteken in de regel staat
    const kentekenMatches = [...line.matchAll(KENTEKEN_RE)];
    if (!kentekenMatches.length) continue;

    for (const km of kentekenMatches) {
      const rawKenteken = km[1];
      // Filter te korte matches (bijv. "BP" of "EU") — minimaal 5 tekens inclusief cijfers
      if (normalizeKenteken(rawKenteken).length < 5) continue;

      const rr: RuweRegel = {
        kenteken: rawKenteken.trim(),
        datum: huidigeDatum,
      };

      // Hoeveelheid
      const literM = line.match(LITER_RE);
      const kwhM   = line.match(KWH_RE);
      if (literM) {
        rr.hoeveelheid = parseFloat(literM[1].replace(",", "."));
        rr.eenheid = "ltr";
        rr.product = rr.product ?? "Brandstof";
      } else if (kwhM) {
        rr.hoeveelheid = parseFloat(kwhM[1].replace(",", "."));
        rr.eenheid = "kwh";
        rr.product = "Elektrisch";
      }

      // Bedragen: pak de eerste 3 numerieke waarden na het kenteken
      const bedragen = [...line.matchAll(BEDRAG_RE)].map(m => parseBedrag(m[1])).filter((n): n is number => n !== undefined);
      if (bedragen.length >= 3) {
        rr.bedragExBtw   = bedragen[0];
        rr.btw           = bedragen[1];
        rr.bedragInclBtw = bedragen[2];
      } else if (bedragen.length === 2) {
        rr.bedragExBtw   = bedragen[0];
        rr.bedragInclBtw = bedragen[1];
      } else if (bedragen.length === 1) {
        rr.bedragInclBtw = bedragen[0];
      }

      // Kilometerstand
      const kmM = line.match(KM_RE);
      if (kmM) {
        const n = parseInt(kmM[1], 10);
        if (n >= 1000 && n <= 9_999_999) rr.kmStand = n;
      }

      // Pasnummer
      const pasM = line.match(PAS_RE);
      if (pasM) rr.pasnummer = pasM[2];

      // Locatie: stukje tekst dat niet al ander veld is (heuristiek)
      const locatieM = line.match(/(?:bij|at|loc[a-z]*|station|tankstation|laadpaal)[:\s]+([A-Za-z\s\-,\.]{3,40})/i);
      if (locatieM) rr.locatie = locatieM[1].trim();

      // Product-naam
      const prodM = line.match(/\b(euro\s*\d+|diesel[\s\w]?|lpg|adblue|elektrisch|cng|hvo)\b/i);
      if (prodM) rr.product = prodM[0].trim();

      regels.push(rr);
    }
  }

  return regels;
}

// ── UBL / Peppol XML-parser ───────────────────────────────────────────────────

function parseUblXml(buffer: Buffer): RuweRegel[] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  let parsed: Record<string, unknown>;
  try {
    parsed = parser.parse(buffer.toString("utf-8")) as Record<string, unknown>;
  } catch {
    return [];
  }

  const invoice = (parsed["Invoice"] ?? parsed["CreditNote"] ?? {}) as Record<string, unknown>;
  const lines   = invoice["InvoiceLine"] ?? invoice["CreditNoteLine"] ?? [];
  const lineArr = Array.isArray(lines) ? lines : [lines];

  return lineArr.map((l: Record<string, unknown>) => {
    const item  = (l["Item"] ?? {}) as Record<string, unknown>;
    const price = (l["Price"] ?? {}) as Record<string, unknown>;
    const qty   = (l["InvoicedQuantity"] ?? l["CreditedQuantity"]) as Record<string, unknown> | undefined;

    const omschrijving = String((item["Description"] ?? item["Name"] ?? "")).toLowerCase();
    const eenheid: "ltr" | "kwh" | undefined = omschrijving.includes("kwh") ? "kwh" : omschrijving.includes("liter") || omschrijving.includes("ltr") ? "ltr" : undefined;

    const additional = Array.isArray(item["AdditionalItemProperty"])
      ? (item["AdditionalItemProperty"] as Record<string, unknown>[])
      : item["AdditionalItemProperty"]
        ? [item["AdditionalItemProperty"] as Record<string, unknown>]
        : [];

    let kenteken: string | undefined;
    let pasnummer: string | undefined;

    for (const prop of additional) {
      const naam  = String(prop["Name"] ?? "").toLowerCase();
      const waarde = String(prop["Value"] ?? "");
      if (naam.includes("kenteken") || naam.includes("license") || naam.includes("plate")) kenteken = waarde;
      if (naam.includes("pas") || naam.includes("card")) pasnummer = waarde;
    }

    const eenheidStr = String(qty?.["@_unitCode"] ?? "").toLowerCase();

    return {
      kenteken,
      pasnummer,
      product: String(item["Name"] ?? "").substring(0, 80) || undefined,
      hoeveelheid: qty ? parseFloat(String(qty["#text"] ?? qty)) : undefined,
      eenheid: eenheid ?? (eenheidStr === "kwh" ? "kwh" : eenheidStr ? "ltr" : undefined),
      bedragInclBtw: l["LineExtensionAmount"] ? parseFloat(String(l["LineExtensionAmount"])) : undefined,
    } as RuweRegel;
  }).filter(r => r.kenteken || r.pasnummer);
}

// ── EML / mailbijlage parser ──────────────────────────────────────────────────

async function parseEml(buffer: Buffer): Promise<{ regels: RuweRegel[]; bestandsnaam: string }> {
  const parsed = await simpleParser(buffer);
  const regels: RuweRegel[] = [];
  let bestandsnaam = parsed.subject ?? "e-mail bijlage";

  for (const att of parsed.attachments ?? []) {
    const mime = att.contentType ?? "";
    const naam = att.filename ?? "";
    if (mime === "application/pdf" || naam.toLowerCase().endsWith(".pdf")) {
      const tekst = await extraheerPdfTekst(att.content).then((r) => r.tekst ?? "").catch(() => "");
      regels.push(...parsePdfRuweRegels(tekst));
      if (naam) bestandsnaam = naam;
    } else if (
      mime.includes("xml") ||
      naam.toLowerCase().endsWith(".xml") ||
      naam.toLowerCase().endsWith(".ubl")
    ) {
      regels.push(...parseUblXml(att.content));
      if (naam) bestandsnaam = naam;
    }
  }

  // Geen bijlage? Probeer de e-mailbody als platte tekst
  if (!regels.length && parsed.text) {
    regels.push(...parsePdfRuweRegels(parsed.text));
  }

  return { regels, bestandsnaam };
}

// ── Voertuig-matcher ──────────────────────────────────────────────────────────

interface VoertuigRecord { id: number; kenteken: string }

function koppelVoertuig(
  rawKenteken: string | undefined,
  voertuigen: VoertuigRecord[],
): { voertuigId: number | null; koppelingStatus: string; score: number } {
  if (!rawKenteken) {
    return { voertuigId: null, koppelingStatus: "niet_gevonden", score: 0 };
  }

  const norm = normalizeKenteken(rawKenteken);

  for (const v of voertuigen) {
    if (normalizeKenteken(v.kenteken) === norm) {
      return { voertuigId: v.id, koppelingStatus: "automatisch", score: 1.0 };
    }
  }

  // Gedeeltelijke match — laatste 6 tekens
  const suffix = norm.slice(-6);
  const kandidaten = voertuigen.filter(v => normalizeKenteken(v.kenteken).endsWith(suffix));
  if (kandidaten.length === 1) {
    return { voertuigId: kandidaten[0].id, koppelingStatus: "onzeker", score: 0.7 };
  }

  return { voertuigId: null, koppelingStatus: "niet_gevonden", score: 0 };
}

// ── AI-signalen (rule-based, voertuiggericht) ─────────────────────────────────

interface AiSignaal { type: string; omschrijving: string; kenteken?: string }

function genereerAiSignalen(
  regels: Array<{
    kenteken?: string | null;
    hoeveelheid?: number | null;
    bedragInclBtw?: number | null;
    kmStand?: number | null;
    voertuigId?: number | null;
  }>,
): AiSignaal[] {
  const signalen: AiSignaal[] = [];

  // Groepeer per kenteken
  const perKenteken = new Map<string, typeof regels>();
  for (const r of regels) {
    const k = r.kenteken ?? "onbekend";
    if (!perKenteken.has(k)) perKenteken.set(k, []);
    perKenteken.get(k)!.push(r);
  }

  for (const [kenteken, groep] of perKenteken) {
    // Ontbrekende kilometerstand
    const zonderKm = groep.filter(r => !r.kmStand);
    if (zonderKm.length > 0) {
      signalen.push({
        type: "ontbrekende_kmstand",
        omschrijving: `${zonderKm.length} van ${groep.length} transacties ${
          kenteken === "onbekend" ? "" : `van ${kenteken} `
        }hebben geen kilometerstand.`,
        kenteken: kenteken === "onbekend" ? undefined : kenteken,
      });
    }

    // Hoog bedrag per tanking (>€150 per transactie)
    const hogeKosten = groep.filter(r => (r.bedragInclBtw ?? 0) > 150);
    if (hogeKosten.length > 0) {
      const max = Math.max(...hogeKosten.map(r => r.bedragInclBtw!));
      signalen.push({
        type: "hoge_kosten",
        omschrijving: `Hoge tanktransactie: max €${max.toFixed(2)}${kenteken === "onbekend" ? "" : ` voor ${kenteken}`}. Controleer op dubbele boeking of verkeerd kenteken.`,
        kenteken: kenteken === "onbekend" ? undefined : kenteken,
      });
    }

    // Afwijkend verbruik: >100 liter in één tanking
    const hogeVolumes = groep.filter(r => (r.hoeveelheid ?? 0) > 100 && !String(r.kenteken ?? "").includes("kwh"));
    if (hogeVolumes.length > 0) {
      signalen.push({
        type: "afwijkend_verbruik",
        omschrijving: `Afwijkend hoog volume (>${groep[0].hoeveelheid} ltr) bij tanking${kenteken === "onbekend" ? "" : ` van ${kenteken}`}. Controleer tankinhoud voertuig.`,
        kenteken: kenteken === "onbekend" ? undefined : kenteken,
      });
    }

    // Niet gekoppeld aan voertuig
    if (groep.every(r => !r.voertuigId) && kenteken !== "onbekend") {
      signalen.push({
        type: "voertuig_niet_gevonden",
        omschrijving: `Kenteken "${kenteken}" is niet gevonden in het wagenpark. Controleer spelling of voeg het voertuig toe.`,
        kenteken,
      });
    }
  }

  return signalen;
}

// ── Mapper naar response ──────────────────────────────────────────────────────

function mapImport(i: typeof brandstofImportenTable.$inferSelect) {
  return {
    id:                i.id,
    bestandsnaam:      i.bestandsnaam,
    brontype:          i.brontype,
    leverancier:       i.leverancier,
    status:            i.status,
    aantal_regels:     i.aantalRegels,
    aantal_gekoppeld:  i.aantalGekoppeld,
    aantal_onzeker:    i.aantalOnzeker,
    aantal_ontkoppeld: i.aantalOntkoppeld,
    periode_van:       i.periodeVan?.toISOString() ?? null,
    periode_tot:       i.periodeTot?.toISOString() ?? null,
    factuur_nummer:    i.factuurNummer ?? null,
    totaal_bedrag:     i.totaalBedrag ?? null,
    totaal_btw:        i.totaalBtw ?? null,
    ai_signalen:       (i.aiSignalen as AiSignaal[] | null) ?? null,
    geladen:           i.geladen,
    geladen_op:        i.geladenOp?.toISOString() ?? null,
    aangemaakt_op:     i.aangemaaktOp.toISOString(),
    bijgewerkt_op:     i.bijgewerktOp.toISOString(),
  };
}

function mapRegel(
  r: typeof brandstofRegelsTable.$inferSelect,
  kentekenMap: Map<number, string>,
) {
  return {
    id:               r.id,
    import_id:        r.importId,
    datum:            r.datum?.toISOString() ?? null,
    kenteken:         r.kenteken ?? null,
    pasnummer:        r.pasnummer ?? null,
    locatie:          r.locatie ?? null,
    product:          r.product ?? null,
    hoeveelheid:      r.hoeveelheid ?? null,
    eenheid:          r.eenheid ?? null,
    bedrag_ex_btw:    r.bedragExBtw ?? null,
    btw:              r.btw ?? null,
    bedrag_incl_btw:  r.bedragInclBtw ?? null,
    km_stand:         r.kmStand ?? null,
    voertuig_id:      r.voertuigId ?? null,
    kenteken_voertuig: r.voertuigId ? (kentekenMap.get(r.voertuigId) ?? null) : null,
    koppeling_status: r.koppelingStatus,
    koppeling_score:  r.koppelingScore ?? null,
    kosten_id:        r.kostenId ?? null,
    opmerkingen:      r.opmerkingen ?? null,
  };
}

// ═══════════════════════════════════════════════════════════
// GET /wagenpark/brandstof-import
// ═══════════════════════════════════════════════════════════

router.get("/", lezen, async (req, res): Promise<void> => {
  const { status } = req.query;

  const rows = await db
    .select()
    .from(brandstofImportenTable)
    .orderBy(brandstofImportenTable.aangemaaktOp);

  const gefilterd = status
    ? rows.filter(r => r.status === status)
    : rows;

  res.json(gefilterd.map(mapImport));
});

// ═══════════════════════════════════════════════════════════
// POST /wagenpark/brandstof-import  (upload + parse)
// ═══════════════════════════════════════════════════════════

router.post("/", schrijven, upload.single("bestand"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "Geen bestand meegegeven." });
    return;
  }

  const { originalname, mimetype, buffer } = req.file;
  const naam = originalname ?? "upload";
  const ext  = naam.toLowerCase().split(".").pop() ?? "";

  let ruweRegels: RuweRegel[] = [];
  let bestandsnaam = naam;
  let brontype: string;

  try {
    if (ext === "eml" || mimetype === "message/rfc822") {
      brontype = "email_bijlage";
      const r = await parseEml(buffer);
      ruweRegels    = r.regels;
      bestandsnaam  = r.bestandsnaam;
    } else if (ext === "xml" || ext === "ubl" || mimetype.includes("xml")) {
      brontype = "ubl_xml";
      ruweRegels = parseUblXml(buffer);
    } else if (ext === "pdf" || mimetype === "application/pdf") {
      brontype = "pdf";
      const data = await extraheerPdfTekst(buffer);
      if (!isMkbBrandstof(data.tekst ?? "")) {
        res.status(400).json({ error: "Dit lijkt geen MKB Brandstof-factuur te zijn." });
        return;
      }
      ruweRegels = parsePdfRuweRegels(data.tekst ?? "");
    } else {
      // Onbekend bestandstype — probeer als tekst
      brontype = "handmatig";
      const tekst = buffer.toString("utf-8");
      if (isMkbBrandstof(tekst)) {
        ruweRegels = parsePdfRuweRegels(tekst);
      } else {
        res.status(400).json({ error: "Bestandstype niet ondersteund. Upload een PDF, XML/UBL of EML-bestand." });
        return;
      }
    }
  } catch (err) {
    logger.error({ err }, "Fout bij parsen brandstofbestand");
    res.status(400).json({ error: "Bestand kon niet worden geparsed." });
    return;
  }

  if (!ruweRegels.length) {
    res.status(400).json({ error: "Geen transactieregels gevonden in het bestand." });
    return;
  }

  // Laad alle voertuigen voor koppeling
  const voertuigen = await db
    .select({ id: voertuigenTable.id, kenteken: voertuigenTable.kenteken })
    .from(voertuigenTable)
    .where(eq(voertuigenTable.gearchiveerd, false));

  // Koppel voertuigen
  const gekoppeldeRegels = ruweRegels.map(rr => {
    const koppeling = koppelVoertuig(rr.kenteken, voertuigen);
    return { rr, ...koppeling };
  });

  // AI-signalen
  const aiSignalen = genereerAiSignalen(
    gekoppeldeRegels.map(gr => ({
      kenteken:      gr.rr.kenteken ?? null,
      hoeveelheid:   gr.rr.hoeveelheid ?? null,
      bedragInclBtw: gr.rr.bedragInclBtw ?? null,
      kmStand:       gr.rr.kmStand ?? null,
      voertuigId:    gr.voertuigId,
    })),
  );

  // Periodes en totalen
  const datums   = gekoppeldeRegels.map(r => r.rr.datum ? parseDatumNl(r.rr.datum) : undefined).filter((d): d is Date => !!d);
  const periodeVan = datums.length ? new Date(Math.min(...datums.map(d => d.getTime()))) : null;
  const periodeTot = datums.length ? new Date(Math.max(...datums.map(d => d.getTime()))) : null;
  const totaalBedrag = gekoppeldeRegels.reduce((s, r) => s + (r.rr.bedragInclBtw ?? 0), 0) || null;
  const totaalBtw    = gekoppeldeRegels.reduce((s, r) => s + (r.rr.btw ?? 0), 0) || null;

  const aantalGekoppeld   = gekoppeldeRegels.filter(r => r.koppelingStatus === "automatisch").length;
  const aantalOnzeker     = gekoppeldeRegels.filter(r => r.koppelingStatus === "onzeker").length;
  const aantalOntkoppeld  = gekoppeldeRegels.filter(r => r.koppelingStatus === "niet_gevonden").length;
  const status = aantalOnzeker > 0 ? "wacht_op_controle" : "verwerkt";

  const [importRecord] = await db.insert(brandstofImportenTable).values({
    bestandsnaam,
    brontype,
    leverancier:       "mkb_brandstof",
    status,
    aantalRegels:      ruweRegels.length,
    aantalGekoppeld,
    aantalOnzeker,
    aantalOntkoppeld,
    periodeVan,
    periodeTot,
    totaalBedrag,
    totaalBtw,
    aiSignalen:        aiSignalen as unknown as Record<string, unknown>[],
    aangemaaktDoorId:  req.session?.["userId"] ?? null,
    werkgeverId:       null,
  }).returning();

  // Sla regels op
  if (gekoppeldeRegels.length) {
    await db.insert(brandstofRegelsTable).values(
      gekoppeldeRegels.map(gr => ({
        importId:        importRecord.id,
        datum:           gr.rr.datum ? parseDatumNl(gr.rr.datum) ?? null : null,
        kenteken:        gr.rr.kenteken ?? null,
        pasnummer:       gr.rr.pasnummer ?? null,
        locatie:         gr.rr.locatie ?? null,
        product:         gr.rr.product ?? null,
        hoeveelheid:     gr.rr.hoeveelheid ?? null,
        eenheid:         gr.rr.eenheid ?? null,
        bedragExBtw:     gr.rr.bedragExBtw ?? null,
        btw:             gr.rr.btw ?? null,
        bedragInclBtw:   gr.rr.bedragInclBtw ?? null,
        kmStand:         gr.rr.kmStand ?? null,
        voertuigId:      gr.voertuigId,
        koppelingStatus: gr.koppelingStatus,
        koppelingScore:  gr.score,
      })),
    );
  }

  res.status(201).json(mapImport(importRecord));
});

// ═══════════════════════════════════════════════════════════
// GET /wagenpark/brandstof-import/:id
// ═══════════════════════════════════════════════════════════

router.get("/:id", lezen, async (req, res): Promise<void> => {
  const id = Number(req.params["id"]);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  const [imp] = await db.select().from(brandstofImportenTable).where(eq(brandstofImportenTable.id, id));
  if (!imp) { res.status(404).json({ error: "Niet gevonden" }); return; }

  const regels = await db.select().from(brandstofRegelsTable).where(eq(brandstofRegelsTable.importId, id));

  const voertuigIds = regels.map(r => r.voertuigId).filter((v): v is number => v !== null);
  const voertuigen  = voertuigIds.length
    ? await db.select({ id: voertuigenTable.id, kenteken: voertuigenTable.kenteken })
        .from(voertuigenTable)
        .where(inArray(voertuigenTable.id, voertuigIds))
    : [];

  const kentekenMap = new Map(voertuigen.map(v => [v.id, v.kenteken]));

  res.json({
    ...mapImport(imp),
    regels: regels.map(r => mapRegel(r, kentekenMap)),
  });
});

// ═══════════════════════════════════════════════════════════
// DELETE /wagenpark/brandstof-import/:id
// ═══════════════════════════════════════════════════════════

router.delete("/:id", schrijven, async (req, res): Promise<void> => {
  const id = Number(req.params["id"]);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  const [imp] = await db.select().from(brandstofImportenTable).where(eq(brandstofImportenTable.id, id));
  if (!imp) { res.status(404).json({ error: "Niet gevonden" }); return; }

  if (imp.geladen) {
    res.status(400).json({ error: "Deze import is al geladen als kosten. Verwijder eerst de kostenboeking." });
    return;
  }

  await db.delete(brandstofImportenTable).where(eq(brandstofImportenTable.id, id));
  res.status(204).send();
});

// ═══════════════════════════════════════════════════════════
// PATCH /wagenpark/brandstof-import/:id/regels/:regelId
// ═══════════════════════════════════════════════════════════

router.patch("/:id/regels/:regelId", schrijven, async (req, res): Promise<void> => {
  const importId = Number(req.params["id"]);
  const regelId  = Number(req.params["regelId"]);
  if (isNaN(importId) || isNaN(regelId)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  const [imp] = await db.select().from(brandstofImportenTable).where(eq(brandstofImportenTable.id, importId));
  if (!imp) { res.status(404).json({ error: "Import niet gevonden" }); return; }

  const { voertuig_id, koppeling_status, opmerkingen } = req.body as {
    voertuig_id?: number | null;
    koppeling_status?: string;
    opmerkingen?: string | null;
  };

  const update: Partial<typeof brandstofRegelsTable.$inferInsert> = {};
  if (voertuig_id !== undefined) update.voertuigId = voertuig_id;
  if (koppeling_status !== undefined) update.koppelingStatus = koppeling_status;
  if (opmerkingen !== undefined) update.opmerkingen = opmerkingen;
  if (voertuig_id !== undefined && koppeling_status === undefined) {
    update.koppelingStatus = voertuig_id ? "handmatig" : "niet_gevonden";
  }

  const [bijgewerkt] = await db
    .update(brandstofRegelsTable)
    .set(update)
    .where(and(eq(brandstofRegelsTable.id, regelId), eq(brandstofRegelsTable.importId, importId)))
    .returning();

  if (!bijgewerkt) { res.status(404).json({ error: "Regel niet gevonden" }); return; }

  // Hertellen voor de importbatch
  const alleRegels = await db.select().from(brandstofRegelsTable).where(eq(brandstofRegelsTable.importId, importId));
  const aantalGekoppeld   = alleRegels.filter(r => r.koppelingStatus === "automatisch").length;
  const aantalOnzeker     = alleRegels.filter(r => r.koppelingStatus === "onzeker").length;
  const aantalOntkoppeld  = alleRegels.filter(r => r.koppelingStatus === "niet_gevonden").length;
  const handmatig         = alleRegels.filter(r => r.koppelingStatus === "handmatig").length;
  const nieuweStatus = aantalOnzeker > 0 ? "wacht_op_controle" : (aantalGekoppeld + handmatig === alleRegels.length ? "geaccordeerd" : "verwerkt");

  await db.update(brandstofImportenTable).set({
    aantalGekoppeld,
    aantalOnzeker,
    aantalOntkoppeld,
    status: nieuweStatus,
    bijgewerktOp: new Date(),
  }).where(eq(brandstofImportenTable.id, importId));

  const voertuigen = bijgewerkt.voertuigId
    ? await db.select({ id: voertuigenTable.id, kenteken: voertuigenTable.kenteken })
        .from(voertuigenTable)
        .where(eq(voertuigenTable.id, bijgewerkt.voertuigId))
    : [];

  const kentekenMap = new Map(voertuigen.map(v => [v.id, v.kenteken]));
  res.json(mapRegel(bijgewerkt, kentekenMap));
});

// ═══════════════════════════════════════════════════════════
// POST /wagenpark/brandstof-import/:id/laden
// ═══════════════════════════════════════════════════════════

router.post("/:id/laden", schrijven, async (req, res): Promise<void> => {
  const id = Number(req.params["id"]);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  const [imp] = await db.select().from(brandstofImportenTable).where(eq(brandstofImportenTable.id, id));
  if (!imp) { res.status(404).json({ error: "Niet gevonden" }); return; }
  if (imp.geladen) {
    res.status(400).json({ error: "Import is al geladen." });
    return;
  }

  const regels = await db.select().from(brandstofRegelsTable).where(eq(brandstofRegelsTable.importId, id));
  const nogOnzeker = regels.filter(r => r.koppelingStatus === "onzeker");
  if (nogOnzeker.length > 0) {
    res.status(400).json({
      error: `Er zijn nog ${nogOnzeker.length} onzeker gekoppelde regels. Controleer ze eerst.`,
    });
    return;
  }

  const teVerwerken = regels.filter(r => r.voertuigId && r.koppelingStatus !== "niet_gevonden");
  let aantalGeladen = 0;
  const aantalOvergeslagen = regels.length - teVerwerken.length;

  for (const r of teVerwerken) {
    if (!r.voertuigId) continue;
    await db.insert(wagenparkKostenTable).values({
      voertuigId:    r.voertuigId,
      categorie:     "brandstof",
      bedrag:        r.bedragInclBtw ?? r.bedragExBtw ?? 0,
      datum:         r.datum ?? new Date(),
      omschrijving:  [r.product, r.locatie].filter(Boolean).join(" — ") || "MKB Brandstof",
      leverancier:   "MKB Brandstof",
      kmStand:       r.kmStand ?? undefined,
      aangemaaktDoorId: req.session?.["userId"] ?? null,
    });
    await db.update(brandstofRegelsTable).set({ kostenId: -1 }).where(eq(brandstofRegelsTable.id, r.id));
    aantalGeladen++;
  }

  await db.update(brandstofImportenTable).set({
    geladen:      true,
    geladenOp:    new Date(),
    geladenDoorId: req.session?.["userId"] ?? null,
    status:       "geaccordeerd",
    bijgewerktOp: new Date(),
  }).where(eq(brandstofImportenTable.id, id));

  res.json({ aantalGeladen, aantalOvergeslagen });
});

export default router;
