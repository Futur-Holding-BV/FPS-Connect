// ENK-import routes — /api/modules/calculaties/import/*
// Flow: upload → analyse-record (mod_calc_bronbestanden) → controlescherm → bevestigen.
// Bedragen worden autoritair in centen-integers vergeleken (parse_resultaat, jsonb);
// de real-kolommen van de calculatie zelf blijven de weergavelaag.
import { Router } from "express";
import multer from "multer";
import { createHash } from "crypto";
import {
  db,
  modCalcBronbestandenTable,
  modCalcHeadersTable,
  modCalcRegelsTable,
  importLogsTable,
  gebruikersTable,
} from "@workspace/db";
import { eq, desc, and, ne, or, ilike } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { ObjectStorageService } from "../lib/objectStorage";
import { extraheerPdfTekst } from "../lib/pdfTekst";
import {
  parseEnkTekst,
  parseEnkRijen,
  parseEnkMetAi,
  LEGE_OPSLAGEN,
  type EnkParseResultaat,
  type EnkOpslagen,
} from "../lib/enkImport";
import { centenNaarEuroTekst, centenNaarEuroGetal, euroGetalNaarCenten } from "../lib/geldCenten";
import { berekenTotalen } from "./mod-calculatie";

const router = Router();
const objectStorage = new ObjectStorageService();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const lezenCalc = requireBevoegdheid("calculaties", 1);
const aanmakenCalc = requireBevoegdheid("calculaties", 3);

const iso = (d: Date) => d.toISOString();

// Wordt gegooid binnen de bevestig-transactie wanneer een gelijktijdig verzoek
// het bronbestand al heeft verwerkt (conditionele status-update sloeg niet aan).
class AlVerwerktError extends Error {
  constructor() {
    super("Bronbestand is al verwerkt");
    this.name = "AlVerwerktError";
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function bepaalBronType(mime: string, bestandsnaam: string): "enk_pdf" | "excel" | "csv" | null {
  const naam = bestandsnaam.toLowerCase();
  if (mime === "application/pdf" || naam.endsWith(".pdf")) return "enk_pdf";
  if (
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/vnd.ms-excel" ||
    naam.endsWith(".xlsx") || naam.endsWith(".xls")
  ) return "excel";
  if (mime === "text/csv" || naam.endsWith(".csv")) return "csv";
  return null;
}

type ParseRegelPlat = {
  omschrijving: string;
  hoeveelheid: number;
  eenheid: string;
  totaalCenten: number;
  isBouwplaatskosten: boolean;
  hoofdstuk: string;
};

function platteRegels(parse: EnkParseResultaat): ParseRegelPlat[] {
  const uit: ParseRegelPlat[] = [];
  for (const h of parse.hoofdstukken) {
    for (const r of h.regels) {
      uit.push({
        omschrijving: r.omschrijving,
        hoeveelheid: r.hoeveelheid,
        eenheid: r.eenheid,
        totaalCenten: r.totaalCenten,
        isBouwplaatskosten: r.isBouwplaatskosten,
        hoofdstuk: h.naam,
      });
    }
  }
  return uit;
}

/**
 * Berekent het Connect-totaal in centen met exact hetzelfde algoritme als de
 * calculatie-detailweergave (berekenTotalen), zodat het controlescherm en de
 * uiteindelijke calculatie dezelfde uitkomst tonen.
 */
function berekenConnectCenten(parse: EnkParseResultaat, verwerking: "inclusief" | "bovenop", opslagen: EnkOpslagen): number {
  const regels = platteRegels(parse)
    .filter((r) => r.totaalCenten !== 0)
    .map((r) => {
      const totaalEuro = centenNaarEuroGetal(r.totaalCenten);
      const effHv = r.hoeveelheid > 0 ? r.hoeveelheid : 1;
      return {
        hoeveelheid: effHv,
        tarief: totaalEuro / effHv,
        muPerEenheid: 0,
        arbeidsTarief: 0,
        onderaannemingBedrag: 0,
        isStaartkosten: false,
        isBouwplaatskosten: r.isBouwplaatskosten,
        totaal: totaalEuro,
      };
    });
  const ops = verwerking === "inclusief" ? LEGE_OPSLAGEN : opslagen;
  const { totaal_na_opslagen } = berekenTotalen(regels, {
    opslagMateriaal: ops.materiaal,
    opslagArbeid: ops.arbeid,
    opslagAk: ops.ak,
    opslagAbk: ops.abk,
    opslagRisico: ops.risico,
    opslagWinst: ops.winst,
    korting: ops.korting,
  });
  return euroGetalNaarCenten(totaal_na_opslagen);
}

interface DuplicaatInfo {
  bronbestand_id: number;
  bestandsnaam: string;
  reden: string;
  calculatie_id: number | null;
  aangemaakt_op: string | null;
}

async function zoekDuplicaten(kenmerken: {
  sha256: string;
  bestandsnaam: string;
  bestandsgrootte: number;
  calculatienummer: string | null;
  negeerId?: number;
}): Promise<DuplicaatInfo[]> {
  const condities = [
    eq(modCalcBronbestandenTable.sha256, kenmerken.sha256),
    and(
      eq(modCalcBronbestandenTable.bestandsnaam, kenmerken.bestandsnaam),
      eq(modCalcBronbestandenTable.bestandsgrootte, kenmerken.bestandsgrootte),
    ),
  ];
  if (kenmerken.calculatienummer) {
    condities.push(eq(modCalcBronbestandenTable.calculatienummer, kenmerken.calculatienummer));
  }
  let where = or(...condities);
  if (kenmerken.negeerId !== undefined) {
    where = and(where, ne(modCalcBronbestandenTable.id, kenmerken.negeerId));
  }
  const rijen = await db.select().from(modCalcBronbestandenTable).where(where).orderBy(desc(modCalcBronbestandenTable.aangemaaktOp)).limit(10);
  return rijen.map((r) => {
    const redenen: string[] = [];
    if (r.sha256 === kenmerken.sha256) redenen.push("identiek bestand");
    else if (r.bestandsnaam === kenmerken.bestandsnaam && r.bestandsgrootte === kenmerken.bestandsgrootte) redenen.push("zelfde naam en grootte");
    if (kenmerken.calculatienummer && r.calculatienummer === kenmerken.calculatienummer) redenen.push(`zelfde calculatienummer (${kenmerken.calculatienummer})`);
    return {
      bronbestand_id: r.id,
      bestandsnaam: r.bestandsnaam,
      reden: redenen.join(", ") || "vergelijkbaar bestand",
      calculatie_id: r.calculatieId,
      aangemaakt_op: iso(r.aangemaaktOp),
    };
  });
}

function bouwAnalyseRespons(
  bron: typeof modCalcBronbestandenTable.$inferSelect,
  parse: EnkParseResultaat,
  duplicaten: DuplicaatInfo[],
) {
  // Advies: de verwerking waarvan het Connect-totaal het dichtst bij het ENK-totaal ligt.
  const connectInclusief = berekenConnectCenten(parse, "inclusief", parse.opslagen);
  const connectBovenop = parse.opslagenBron === "gedetecteerd"
    ? berekenConnectCenten(parse, "bovenop", parse.opslagen)
    : null;
  let advies: "inclusief" | "bovenop" = "inclusief";
  if (connectBovenop !== null && parse.totaalEnkCenten !== null) {
    if (Math.abs(parse.totaalEnkCenten - connectBovenop) < Math.abs(parse.totaalEnkCenten - connectInclusief)) {
      advies = "bovenop";
    }
  }
  const connect = advies === "inclusief" ? connectInclusief : (connectBovenop ?? connectInclusief);
  const verschil = parse.totaalEnkCenten !== null ? parse.totaalEnkCenten - connect : 0;

  return {
    bronbestand_id: bron.id,
    bestandsnaam: bron.bestandsnaam,
    bron_type: bron.bronType,
    calculatienummer: parse.calculatienummer,
    projectnummer: parse.projectnummer,
    voorstel_naam: parse.naam ?? bron.bestandsnaam.replace(/\.[^.]+$/, ""),
    opdrachtgever: parse.opdrachtgever,
    datum: parse.datum,
    hoofdstukken: parse.hoofdstukken.map((h) => ({
      naam: h.naam,
      totaal_enk_centen: h.totaalEnkCenten,
      som_regels_centen: h.somRegelsCenten,
      regels: h.regels.map((r) => ({
        omschrijving: r.omschrijving,
        hoeveelheid: r.hoeveelheid,
        eenheid: r.eenheid,
        totaal_centen: r.totaalCenten,
        opmerkingen: r.opmerkingen,
        is_bouwplaatskosten: r.isBouwplaatskosten,
      })),
    })),
    opslagen: parse.opslagen,
    opslagen_bron: parse.opslagenBron,
    verwerking_advies: advies,
    totaal_enk_centen: parse.totaalEnkCenten,
    totaal_connect_centen: connect,
    verschil_centen: verschil,
    duplicaten,
    waarschuwingen: parse.waarschuwingen,
    bewijs: parse.bewijs,
    ai_gebruikt: parse.aiGebruikt,
  };
}

function parseUitRij(bron: typeof modCalcBronbestandenTable.$inferSelect): EnkParseResultaat | null {
  const p = bron.parseResultaat as unknown as EnkParseResultaat | null;
  if (!p || !Array.isArray(p.hoofdstukken)) return null;
  return p;
}

function parseCsvRijen(tekst: string): unknown[][] {
  const schoon = tekst.replace(/^\uFEFF/, "");
  const regels = schoon.split(/\r?\n/).filter((r) => r.trim().length > 0);
  if (regels.length === 0) return [];
  const scheidingsteken = (regels[0].match(/;/g)?.length ?? 0) >= (regels[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  return regels.map((regel) => {
    const velden: string[] = [];
    let huidig = "";
    let inQuote = false;
    for (let i = 0; i < regel.length; i++) {
      const c = regel[i];
      if (c === '"') {
        if (inQuote && regel[i + 1] === '"') { huidig += '"'; i++; }
        else inQuote = !inQuote;
      } else if (c === scheidingsteken && !inQuote) {
        velden.push(huidig);
        huidig = "";
      } else {
        huidig += c;
      }
    }
    velden.push(huidig);
    return velden.map((v) => v.trim());
  });
}

function normaliseerOpslagen(ruw: unknown): EnkOpslagen {
  const o = (ruw ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => {
    const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
    return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
  };
  return {
    materiaal: num(o["materiaal"]),
    arbeid: num(o["arbeid"]),
    ak: num(o["ak"]),
    abk: num(o["abk"]),
    risico: num(o["risico"]),
    winst: num(o["winst"]),
    korting: num(o["korting"]),
  };
}

// ── Analyse (upload) ──────────────────────────────────────────────────────────

router.post("/modules/calculaties/import/analyse", aanmakenCalc, upload.single("bestand"), async (req, res): Promise<void> => {
  try {
    const bestand = req.file;
    if (!bestand || !bestand.buffer) {
      return void res.status(400).json({ error: "Geen bestand ontvangen (veld 'bestand')" });
    }
    const bronType = bepaalBronType(bestand.mimetype ?? "", bestand.originalname ?? "");
    if (!bronType) {
      return void res.status(400).json({ error: "Alleen PDF-, Excel- (xlsx/xls) of CSV-bestanden worden ondersteund" });
    }

    let parse: EnkParseResultaat | null = null;
    if (bronType === "enk_pdf") {
      const { tekst } = await extraheerPdfTekst(bestand.buffer);
      if (!tekst || tekst.trim().length < 20) {
        return void res.status(422).json({ error: "Er is geen leesbare tekst in deze PDF gevonden (mogelijk een scan). Exporteer de calculatie opnieuw vanuit ENK als PDF." });
      }
      parse = parseEnkTekst(tekst);
      if (!parse.succes) {
        const aiParse = await parseEnkMetAi(tekst);
        if (aiParse && aiParse.succes) parse = aiParse;
      }
    } else if (bronType === "excel") {
      const XLSX = await import("xlsx");
      const werkboek = XLSX.read(bestand.buffer, { type: "buffer" });
      const eersteBlad = werkboek.SheetNames[0];
      const rijen = eersteBlad
        ? (XLSX.utils.sheet_to_json(werkboek.Sheets[eersteBlad], { header: 1, raw: true }) as unknown[][])
        : [];
      parse = parseEnkRijen(rijen, "Excel");
    } else {
      parse = parseEnkRijen(parseCsvRijen(bestand.buffer.toString("utf8")), "CSV");
    }

    if (!parse || !parse.succes) {
      return void res.status(422).json({
        error: "Het bestand kon niet als ENK-calculatie worden uitgelezen",
        waarschuwingen: parse?.waarschuwingen ?? [],
        bewijs: parse?.bewijs ?? [],
      });
    }

    const sha256 = createHash("sha256").update(bestand.buffer).digest("hex");
    const duplicaten = await zoekDuplicaten({
      sha256,
      bestandsnaam: bestand.originalname ?? "onbekend",
      bestandsgrootte: bestand.size ?? bestand.buffer.length,
      calculatienummer: parse.calculatienummer,
    });

    let objectPath: string;
    try {
      const veiligeNaam = (bestand.originalname ?? "bestand").replace(/[^a-zA-Z0-9._-]/g, "_");
      objectPath = await objectStorage.uploadBestand(
        `enk-import/${Date.now()}-${veiligeNaam}`,
        bestand.buffer,
        bestand.mimetype ?? "application/octet-stream",
      );
    } catch (e) {
      req.log.error(e, "ENK-import: upload naar object storage mislukt");
      return void res.status(503).json({ error: "Bestandsopslag is niet beschikbaar; probeer het later opnieuw" });
    }

    const [bron] = await db.insert(modCalcBronbestandenTable).values({
      bestandsnaam: bestand.originalname ?? "onbekend",
      bestandsgrootte: bestand.size ?? bestand.buffer.length,
      sha256,
      mime: bestand.mimetype ?? "application/octet-stream",
      objectPath,
      bronType,
      calculatienummer: parse.calculatienummer,
      projectnummer: parse.projectnummer,
      opdrachtgever: parse.opdrachtgever,
      status: "geanalyseerd",
      parseResultaat: parse as unknown as Record<string, unknown>,
      uploaderId: req.session.userId ?? null,
    }).returning();

    res.json(bouwAnalyseRespons(bron, parse, duplicaten));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── Bibliotheek (bronbestanden) ───────────────────────────────────────────────

router.get("/modules/calculaties/import/bronbestanden", lezenCalc, async (req, res): Promise<void> => {
  try {
    const zoek = typeof req.query["zoek"] === "string" ? req.query["zoek"].trim() : "";
    const calculatieId = req.query["calculatie_id"] !== undefined ? parseInt(String(req.query["calculatie_id"]), 10) : null;

    const condities = [];
    if (calculatieId !== null && Number.isFinite(calculatieId)) {
      condities.push(eq(modCalcBronbestandenTable.calculatieId, calculatieId));
    }
    if (zoek) {
      condities.push(or(
        ilike(modCalcBronbestandenTable.bestandsnaam, `%${zoek}%`),
        ilike(modCalcBronbestandenTable.calculatienummer, `%${zoek}%`),
        ilike(modCalcBronbestandenTable.projectnummer, `%${zoek}%`),
        ilike(modCalcBronbestandenTable.opdrachtgever, `%${zoek}%`),
      ));
    }

    const rijen = await db
      .select({
        bron: modCalcBronbestandenTable,
        calculatieNaam: modCalcHeadersTable.naam,
        uploaderNaam: gebruikersTable.naam,
      })
      .from(modCalcBronbestandenTable)
      .leftJoin(modCalcHeadersTable, eq(modCalcBronbestandenTable.calculatieId, modCalcHeadersTable.id))
      .leftJoin(gebruikersTable, eq(modCalcBronbestandenTable.uploaderId, gebruikersTable.id))
      .where(condities.length > 0 ? and(...condities) : undefined)
      .orderBy(desc(modCalcBronbestandenTable.aangemaaktOp))
      .limit(200);

    res.json(rijen.map(({ bron, calculatieNaam, uploaderNaam }) => {
      const parse = parseUitRij(bron);
      return {
        id: bron.id,
        bestandsnaam: bron.bestandsnaam,
        bestandsgrootte: bron.bestandsgrootte,
        sha256: bron.sha256,
        mime: bron.mime,
        bron_type: bron.bronType,
        calculatienummer: bron.calculatienummer,
        projectnummer: bron.projectnummer,
        opdrachtgever: bron.opdrachtgever,
        status: bron.status,
        gekozen_verwerking: bron.gekozenVerwerking,
        totaal_keuze: bron.totaalKeuze,
        totaal_enk_centen: parse?.totaalEnkCenten ?? null,
        calculatie_id: bron.calculatieId,
        calculatie_naam: calculatieNaam ?? null,
        uploader_naam: uploaderNaam ?? null,
        object_path: bron.objectPath,
        aangemaakt_op: iso(bron.aangemaaktOp),
      };
    }));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── Opgeslagen analyse opnieuw ophalen ───────────────────────────────────────

router.get("/modules/calculaties/import/:id/analyse", lezenCalc, async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params["id"]), 10);
    const [bron] = await db.select().from(modCalcBronbestandenTable).where(eq(modCalcBronbestandenTable.id, id));
    if (!bron) return void res.status(404).json({ error: "Bronbestand niet gevonden" });
    const parse = parseUitRij(bron);
    if (!parse) return void res.status(404).json({ error: "Geen analyse beschikbaar voor dit bronbestand" });
    const duplicaten = await zoekDuplicaten({
      sha256: bron.sha256,
      bestandsnaam: bron.bestandsnaam,
      bestandsgrootte: bron.bestandsgrootte,
      calculatienummer: bron.calculatienummer,
      negeerId: bron.id,
    });
    res.json(bouwAnalyseRespons(bron, parse, duplicaten));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── Hergebruik (nieuwe import vanuit bibliotheek) ────────────────────────────

router.post("/modules/calculaties/import/:id/hergebruik", aanmakenCalc, async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params["id"]), 10);
    const [origineel] = await db.select().from(modCalcBronbestandenTable).where(eq(modCalcBronbestandenTable.id, id));
    if (!origineel) return void res.status(404).json({ error: "Bronbestand niet gevonden" });
    const parse = parseUitRij(origineel);
    if (!parse) return void res.status(404).json({ error: "Geen analyse beschikbaar voor dit bronbestand" });

    const [kopie] = await db.insert(modCalcBronbestandenTable).values({
      bestandsnaam: origineel.bestandsnaam,
      bestandsgrootte: origineel.bestandsgrootte,
      sha256: origineel.sha256,
      mime: origineel.mime,
      objectPath: origineel.objectPath,
      bronType: origineel.bronType,
      calculatienummer: origineel.calculatienummer,
      projectnummer: origineel.projectnummer,
      opdrachtgever: origineel.opdrachtgever,
      status: "geanalyseerd",
      parseResultaat: origineel.parseResultaat,
      uploaderId: req.session.userId ?? null,
    }).returning();

    const duplicaten = await zoekDuplicaten({
      sha256: kopie.sha256,
      bestandsnaam: kopie.bestandsnaam,
      bestandsgrootte: kopie.bestandsgrootte,
      calculatienummer: kopie.calculatienummer,
      negeerId: kopie.id,
    });
    res.json(bouwAnalyseRespons(kopie, parse, duplicaten));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── Bevestigen: calculatie aanmaken ──────────────────────────────────────────

router.post("/modules/calculaties/import/:id/bevestig", aanmakenCalc, async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params["id"]), 10);
    const body = req.body as Record<string, unknown>;
    const verwerking = body["verwerking"] === "bovenop" ? "bovenop" : body["verwerking"] === "inclusief" ? "inclusief" : null;
    const totaalKeuze = body["totaal_keuze"] === "enk" ? "enk" : body["totaal_keuze"] === "connect" ? "connect" : null;
    if (!verwerking || !totaalKeuze) {
      return void res.status(400).json({ error: "verwerking (inclusief|bovenop) en totaal_keuze (connect|enk) zijn verplicht" });
    }
    const opslagen = normaliseerOpslagen(body["opslagen"]);

    const [bron] = await db.select().from(modCalcBronbestandenTable).where(eq(modCalcBronbestandenTable.id, id));
    if (!bron) return void res.status(404).json({ error: "Bronbestand niet gevonden" });
    if (bron.status !== "geanalyseerd") {
      return void res.status(409).json({ error: "Dit bronbestand is al verwerkt; gebruik 'hergebruiken' om er opnieuw een calculatie van te maken" });
    }
    const parse = parseUitRij(bron);
    if (!parse) return void res.status(409).json({ error: "Geen analyse beschikbaar voor dit bronbestand" });

    const effectieveOpslagen: EnkOpslagen = verwerking === "inclusief" ? { ...LEGE_OPSLAGEN } : opslagen;
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    const naam = str(body["naam"]) ?? parse.naam ?? bron.bestandsnaam.replace(/\.[^.]+$/, "");

    const regels = platteRegels(parse);
    const connectCenten = berekenConnectCenten(parse, verwerking, opslagen);
    const enkCenten = parse.totaalEnkCenten;
    const verschilCenten = enkCenten !== null ? enkCenten - connectCenten : 0;
    const correctieNodig = totaalKeuze === "enk" && enkCenten !== null && verschilCenten !== 0;

    // Informatieve ENK-percentages bewaren wanneer regels al verkoopprijzen zijn
    const opslagenInfo = parse.opslagenBron === "gedetecteerd" && verwerking === "inclusief"
      ? `ENK-opslagen (informatief, al in de regelprijzen verwerkt): materiaal ${parse.opslagen.materiaal}%, arbeid ${parse.opslagen.arbeid}%, AK ${parse.opslagen.ak}%, ABK ${parse.opslagen.abk}%, risico ${parse.opslagen.risico}%, winst ${parse.opslagen.winst}%, korting ${parse.opslagen.korting}%.`
      : null;

    const resultaat = await db.transaction(async (tx) => {
      const [header] = await tx.insert(modCalcHeadersTable).values({
        naam,
        referentie: str(body["referentie"]) ?? parse.calculatienummer,
        klantNaam: str(body["klant_naam"]) ?? parse.opdrachtgever,
        gebouwId: body["gebouw_id"] ? Number(body["gebouw_id"]) : null,
        projectNaam: str(body["project_naam"]) ?? parse.naam,
        werknummer: str(body["werknummer"]) ?? parse.projectnummer ?? undefined,
        status: "concept",
        omschrijving: `Geïmporteerd uit ENK-bestand ${bron.bestandsnaam}`,
        opmerkingen: opslagenInfo,
        opslagMateriaal: effectieveOpslagen.materiaal,
        opslagArbeid: effectieveOpslagen.arbeid,
        opslagAk: effectieveOpslagen.ak,
        opslagAbk: effectieveOpslagen.abk,
        opslagRisico: effectieveOpslagen.risico,
        opslagWinst: effectieveOpslagen.winst,
        korting: effectieveOpslagen.korting,
        aangemaaktDoorId: req.session.userId ?? null,
      } as typeof modCalcHeadersTable.$inferInsert).returning();

      let volgorde = 0;
      for (const r of regels) {
        const totaalEuro = centenNaarEuroGetal(r.totaalCenten);
        const isTekstregel = r.totaalCenten === 0 && r.hoeveelheid === 0;
        const effHv = isTekstregel ? 0 : (r.hoeveelheid > 0 ? r.hoeveelheid : 1);
        await tx.insert(modCalcRegelsTable).values({
          calculatieId: header.id,
          categorie: "overig",
          omschrijving: r.omschrijving,
          eenheid: r.eenheid || "st",
          hoeveelheid: effHv,
          tarief: effHv > 0 ? totaalEuro / effHv : 0,
          totaal: totaalEuro,
          volgorde: volgorde++,
          isStaartkosten: false,
          isBouwplaatskosten: r.isBouwplaatskosten,
          hoofdstuk: r.hoofdstuk,
        } as typeof modCalcRegelsTable.$inferInsert);
      }

      let correctieToegevoegd = false;
      if (correctieNodig && enkCenten !== null) {
        // Iteratief de correctie bepalen zodat het eindtotaal (na eventuele
        // procentuele opslagen) exact op het ENK-totaal uitkomt.
        const basisRegels = platteRegels(parse)
          .filter((x) => x.totaalCenten !== 0)
          .map((x) => {
            const tEuro = centenNaarEuroGetal(x.totaalCenten);
            const hv = x.hoeveelheid > 0 ? x.hoeveelheid : 1;
            return {
              hoeveelheid: hv, tarief: tEuro / hv, muPerEenheid: 0, arbeidsTarief: 0,
              onderaannemingBedrag: 0, isStaartkosten: false, isBouwplaatskosten: x.isBouwplaatskosten, totaal: tEuro,
            };
          });
        const headerOps = {
          opslagMateriaal: effectieveOpslagen.materiaal,
          opslagArbeid: effectieveOpslagen.arbeid,
          opslagAk: effectieveOpslagen.ak,
          opslagAbk: effectieveOpslagen.abk,
          opslagRisico: effectieveOpslagen.risico,
          opslagWinst: effectieveOpslagen.winst,
          korting: effectieveOpslagen.korting,
        };
        let correctieCenten = verschilCenten;
        for (let i = 0; i < 8; i++) {
          const proef = berekenTotalen([
            ...basisRegels,
            {
              hoeveelheid: 1, tarief: 0, muPerEenheid: 0, arbeidsTarief: 0,
              onderaannemingBedrag: 0, isStaartkosten: true, isBouwplaatskosten: false,
              totaal: centenNaarEuroGetal(correctieCenten),
            },
          ], headerOps);
          const rest = enkCenten - euroGetalNaarCenten(proef.totaal_na_opslagen);
          if (rest === 0) break;
          correctieCenten += rest;
        }
        await tx.insert(modCalcRegelsTable).values({
          calculatieId: header.id,
          categorie: "overig",
          omschrijving: `Correctie ENK-import: ENK-totaal aangehouden (€ ${centenNaarEuroTekst(enkCenten)})`,
          eenheid: "post",
          hoeveelheid: 1,
          tarief: 0,
          totaal: centenNaarEuroGetal(correctieCenten),
          volgorde: volgorde++,
          isStaartkosten: true,
          isBouwplaatskosten: false,
          hoofdstuk: "Correctie ENK-import",
          opmerkingen: `Automatisch toegevoegd bij import: verschil tussen de Connect-berekening (€ ${centenNaarEuroTekst(connectCenten)}) en het ENK-totaal (€ ${centenNaarEuroTekst(enkCenten)}).`,
        } as typeof modCalcRegelsTable.$inferInsert);
        correctieToegevoegd = true;
      }

      // Conditionele update: alleen als de status nog "geanalyseerd" is.
      // Twee gelijktijdige bevestig-verzoeken (dubbelklik) kunnen anders elk
      // een calculatie aanmaken; de verliezer rolt hier de hele transactie terug.
      const geclaimd = await tx.update(modCalcBronbestandenTable).set({
        status: "verwerkt",
        calculatieId: header.id,
        gekozenVerwerking: verwerking,
        totaalKeuze,
        bijgewerktOp: new Date(),
      }).where(and(
        eq(modCalcBronbestandenTable.id, bron.id),
        eq(modCalcBronbestandenTable.status, "geanalyseerd"),
      )).returning({ id: modCalcBronbestandenTable.id });
      if (geclaimd.length === 0) {
        throw new AlVerwerktError();
      }

      await tx.insert(importLogsTable).values({
        type: "enk_calculatie",
        bestandsnaam: bron.bestandsnaam,
        rijenTotaal: regels.length,
        rijenVerwerkt: regels.length + (correctieToegevoegd ? 1 : 0),
        rijenOvergeslagen: 0,
        fouten: parse.waarschuwingen.length > 0 ? parse.waarschuwingen.map((w) => ({ rij: 0, fout: w })) : null,
        gebruikerId: req.session.userId ?? null,
      } as typeof importLogsTable.$inferInsert);

      return { headerId: header.id, correctieToegevoegd };
    });

    req.log.info(
      { bronbestandId: bron.id, calculatieId: resultaat.headerId, verwerking, totaalKeuze, verschilCenten },
      "ENK-import bevestigd",
    );

    res.status(201).json({
      calculatie_id: resultaat.headerId,
      totaal_enk_centen: enkCenten,
      totaal_connect_centen: connectCenten,
      verschil_centen: verschilCenten,
      correctieregel_toegevoegd: resultaat.correctieToegevoegd,
    });
  } catch (e) {
    if (e instanceof AlVerwerktError) {
      return void res.status(409).json({ error: "Dit bronbestand is al verwerkt; gebruik 'hergebruiken' om er opnieuw een calculatie van te maken" });
    }
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

export default router;
