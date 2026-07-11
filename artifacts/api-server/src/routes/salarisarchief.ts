import { Router, type Request, type Response } from "express";
import multer from "multer";
import { eq, and, desc, asc, inArray } from "drizzle-orm";
import {
  db,
  salarisbatchesTable, salarisbestandenTable, sepaBestandenTable,
  salarisdocumentAuditTable, medewerkersTable,
} from "@workspace/db";
import { requireBevoegdheid } from "../middlewares/auth";
import { ObjectStorageService } from "../lib/objectStorage";
import { logger } from "../lib/logger";
import { extraheerPdfTekst } from "../lib/pdfTekst";

const router = Router();
const storage = new ObjectStorageService();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

// ── Helpers ───────────────────────────────────────────────────────────────────

function sessieGebruikerId(req: Request): number | null {
  return req.session.userId ?? null;
}

function sessieGebruikerNaam(req: Request): string {
  return ((req.session as unknown as Record<string, unknown>)["gebruikerNaam"] as string | undefined) ?? "Onbekend";
}

async function logAudit(params: {
  documentId?: number;
  sepaId?: number;
  actie: string;
  gebruikerId: number | null;
  gebruikerNaam: string;
  medewerkerId?: number | null;
  documentType?: string | null;
  batchId?: number | null;
  extra?: Record<string, unknown>;
}) {
  try {
    await db.insert(salarisdocumentAuditTable).values({
      documentId: params.documentId ?? null,
      sepaId: params.sepaId ?? null,
      actie: params.actie,
      gebruikerId: params.gebruikerId,
      gebruikerNaam: params.gebruikerNaam,
      medewerkerId: params.medewerkerId ?? null,
      documentType: params.documentType ?? null,
      batchId: params.batchId ?? null,
      extra: params.extra ?? null,
    });
  } catch (err) {
    logger.error({ err }, "Audit log mislukt");
  }
}

function mapBatch(b: typeof salarisbatchesTable.$inferSelect) {
  return {
    id: b.id,
    omschrijving: b.omschrijving,
    periode_jaar: b.periodeJaar,
    periode_maand: b.periodeMaand,
    status: b.status,
    uploader_naam: b.uploaderNaam,
    totaal_bestanden: b.totaalBestanden,
    gekoppeld: b.gekoppeld,
    ongekoppeld: b.ongekoppeld,
    controle_nodig: b.controleNodig,
    aangemaakt_op: b.aangemaaktOp.toISOString(),
    bijgewerkt_op: b.bijgewerktOp.toISOString(),
  };
}

function mapDoc(
  d: typeof salarisbestandenTable.$inferSelect,
  medewerkerNaam?: string | null,
) {
  return {
    id: d.id,
    batch_id: d.batchId,
    type: d.type,
    periode_jaar: d.periodeJaar,
    periode_maand: d.periodeMaand,
    medewerker_id: d.medewerkerId,
    medewerker_naam: medewerkerNaam ?? null,
    medewerker_naam_ai: d.medewerkerNaamAi,
    status: d.status,
    zichtbaar_medewerker: d.zichtbaarMedewerker,
    bestandsnaam: d.bestandsnaam,
    bestandsgrootte: d.bestandsgrootte,
    mime_type: d.mimeType,
    uploader_naam: d.uploaderNaam,
    ai_zekerheid: d.aiZekerheid,
    ai_toelichting: d.aiToelichting,
    bronbestand_naam: d.bronbestandNaam,
    aangemaakt_op: d.aangemaaktOp.toISOString(),
    bijgewerkt_op: d.bijgewerktOp.toISOString(),
  };
}

function mapSepa(s: typeof sepaBestandenTable.$inferSelect) {
  return {
    id: s.id,
    omschrijving: s.omschrijving,
    periode_jaar: s.periodeJaar,
    periode_maand: s.periodeMaand,
    betaaldatum: s.betaaldatum,
    totaalbedrag: s.totaalbedrag,
    aantal_betalingen: s.aantalBetalingen,
    iban_opdrachtgever: s.ibanOpdrachtgever,
    bestandsformaat: s.bestandsformaat,
    status: s.status,
    bestandsnaam: s.bestandsnaam,
    bestandsgrootte: s.bestandsgrootte,
    uploader_naam: s.uploaderNaam,
    gedownload_op: s.gedownloadOp ? s.gedownloadOp.toISOString() : null,
    fouten: s.fouten,
    batch_referentie: s.batchReferentie,
    aangemaakt_op: s.aangemaaktOp.toISOString(),
    bijgewerkt_op: s.bijgewerktOp.toISOString(),
  };
}

// ── SEPA XML parsing (PAIN.001) ───────────────────────────────────────────────

function parsePainXml(xml: string): {
  msgId: string | null;
  aantalBetalingen: number | null;
  controleSom: string | null;
  betaaldatum: string | null;
  ibanOpdrachtgever: string | null;
  fouten: string[];
} {
  const tag = (naam: string) => {
    const m = xml.match(new RegExp(`<(?:[^:>]+:)?${naam}[^>]*>([^<]*)</(?:[^:>]+:)?${naam}>`));
    return m ? m[1].trim() : null;
  };

  const msgId = tag("MsgId");
  const nbOfTxs = tag("NbOfTxs");
  const ctrlSum = tag("CtrlSum");
  const datum = tag("ReqdExctnDt") ?? tag("ReqdColltnDt");

  const ibanMatch = xml.match(/<(?:[^:>]+:)?DbtrAcct[^>]*>[\s\S]*?<(?:[^:>]+:)?IBAN>([A-Z0-9]+)<\/(?:[^:>]+:)?IBAN>/);
  const iban = ibanMatch ? ibanMatch[1] : null;

  const fouten: string[] = [];
  if (!msgId) fouten.push("Geen bericht-ID gevonden");
  if (!ctrlSum) fouten.push("Geen controlessom gevonden");

  return {
    msgId,
    aantalBetalingen: nbOfTxs ? parseInt(nbOfTxs, 10) : null,
    controleSom: ctrlSum,
    betaaldatum: datum,
    ibanOpdrachtgever: iban,
    fouten,
  };
}

// ── Medewerker koppeling op basis van bestandsnaam ────────────────────────────

async function matchMedewerker(bestandsnaam: string): Promise<{
  medewerkerId: number | null;
  medewerkerNaamAi: string | null;
  aiZekerheid: number;
  aiToelichting: string;
  status: string;
}> {
  const medewerkers = await db
    .select({ id: medewerkersTable.id, naam: medewerkersTable.naam, email: medewerkersTable.email })
    .from(medewerkersTable);

  if (medewerkers.length === 0) {
    return { medewerkerId: null, medewerkerNaamAi: null, aiZekerheid: 0, aiToelichting: "Geen medewerkers in systeem", status: "geupload" };
  }

  const naamZoek = bestandsnaam
    .replace(/\.[^.]+$/, "")
    .replace(/[_\-\.]+/g, " ")
    .toLowerCase()
    .trim();

  let bestMatch: { id: number; naam: string; score: number } | null = null;

  for (const mw of medewerkers) {
    const mwNaam = mw.naam.toLowerCase().trim();
    const mwDelen = mwNaam.split(/\s+/);

    if (naamZoek.includes(mwNaam)) {
      const score = 0.95;
      if (!bestMatch || score > bestMatch.score) bestMatch = { id: mw.id, naam: mw.naam, score };
    } else {
      const getroffenDelen = mwDelen.filter((d) => d.length > 2 && naamZoek.includes(d));
      if (getroffenDelen.length >= 2) {
        const score = 0.7;
        if (!bestMatch || score > bestMatch.score) bestMatch = { id: mw.id, naam: mw.naam, score };
      } else if (getroffenDelen.length === 1 && mwDelen.length >= 1) {
        const score = 0.4;
        if (!bestMatch || score > bestMatch.score) bestMatch = { id: mw.id, naam: mw.naam, score };
      }
    }

    if (mw.email) {
      const emailGebruikersnaam = mw.email.split("@")[0].toLowerCase();
      if (naamZoek.includes(emailGebruikersnaam) || emailGebruikersnaam.split(/[._\-]/).every((d) => naamZoek.includes(d))) {
        const score = 0.85;
        if (!bestMatch || score > bestMatch.score) bestMatch = { id: mw.id, naam: mw.naam, score };
      }
    }
  }

  if (!bestMatch) {
    return { medewerkerId: null, medewerkerNaamAi: null, aiZekerheid: 0, aiToelichting: "Geen overeenkomst gevonden", status: "geupload" };
  }

  if (bestMatch.score >= 0.85) {
    return { medewerkerId: bestMatch.id, medewerkerNaamAi: bestMatch.naam, aiZekerheid: bestMatch.score, aiToelichting: "Gekoppeld op basis van bestandsnaam", status: "gekoppeld" };
  }

  return { medewerkerId: bestMatch.id, medewerkerNaamAi: bestMatch.naam, aiZekerheid: bestMatch.score, aiToelichting: "Mogelijke overeenkomst — handmatige controle vereist", status: "controle_nodig" };
}

// ── UPLOAD ────────────────────────────────────────────────────────────────────

router.post(
  "/salarisarchief/upload",
  requireBevoegdheid("salarisarchief", 3),
  upload.array("bestanden", 50),
  async (req: Request, res: Response): Promise<void> => {
    const bestanden = req.files as Express.Multer.File[] | undefined;
    if (!bestanden || bestanden.length === 0) {
      res.status(400).json({ error: "Geen bestanden meegestuurd" });
      return;
    }

    const userId = sessieGebruikerId(req);
    const gebruikerNaam = sessieGebruikerNaam(req);
    const { omschrijving, periode_jaar, periode_maand, type: opgegeven_type } = req.body as {
      omschrijving?: string; periode_jaar?: string; periode_maand?: string; type?: string;
    };

    const jaar = periode_jaar ? parseInt(periode_jaar, 10) : null;
    const maand = periode_maand ? parseInt(periode_maand, 10) : null;

    // Maak batch aan
    const [batch] = await db.insert(salarisbatchesTable).values({
      omschrijving: omschrijving ?? null,
      periodeJaar: jaar,
      periodeMaand: maand,
      status: "verwerken",
      uploaderId: userId,
      uploaderNaam: gebruikerNaam,
      totaalBestanden: bestanden.length,
    }).returning();

    let gekoppeld = 0;
    let ongekoppeld = 0;
    let controleNodig = 0;
    const documenten = [];

    for (const bestand of bestanden) {
      const isZip = bestand.originalname.endsWith(".zip");
      const isXml = bestand.originalname.endsWith(".xml") || bestand.originalname.endsWith(".pain001");
      const mimeType = bestand.mimetype || "application/octet-stream";

      const type = opgegeven_type ?? (isZip ? "overig" : isXml ? "overig" : "loonstrook");

      const subPath = `salarisbestanden/${batch.id}/${Date.now()}_${bestand.originalname.replace(/[^a-zA-Z0-9._\-]/g, "_")}`;
      let objectPath: string;
      try {
        objectPath = await storage.uploadBestand(subPath, bestand.buffer, mimeType);
      } catch (err) {
        logger.error({ err, bestandsnaam: bestand.originalname }, "Upload naar object storage mislukt");
        continue;
      }

      const match = await matchMedewerker(bestand.originalname);

      if (match.status === "gekoppeld") gekoppeld++;
      else if (match.status === "controle_nodig") controleNodig++;
      else ongekoppeld++;

      const [doc] = await db.insert(salarisbestandenTable).values({
        batchId: batch.id,
        type,
        periodeJaar: jaar,
        periodeMaand: maand,
        medewerkerId: match.medewerkerId,
        medewerkerNaamAi: match.medewerkerNaamAi,
        status: match.status,
        zichtbaarMedewerker: false,
        bestandsnaam: bestand.originalname,
        objectPath,
        bestandsgrootte: bestand.size,
        mimeType,
        uploaderId: userId,
        uploaderNaam: gebruikerNaam,
        aiZekerheid: match.aiZekerheid,
        aiToelichting: match.aiToelichting,
        bronbestandNaam: bestand.originalname,
      }).returning();

      await logAudit({
        documentId: doc.id,
        actie: "upload",
        gebruikerId: userId,
        gebruikerNaam,
        medewerkerId: match.medewerkerId,
        documentType: type,
        batchId: batch.id,
      });

      documenten.push(doc);
    }

    await db.update(salarisbatchesTable).set({
      status: "gereed",
      gekoppeld,
      ongekoppeld,
      controleNodig,
      bijgewerktOp: new Date(),
    }).where(eq(salarisbatchesTable.id, batch.id));

    const [bijgewerktBatch] = await db.select().from(salarisbatchesTable).where(eq(salarisbatchesTable.id, batch.id));
    res.status(201).json({ ...mapBatch(bijgewerktBatch), documenten: documenten.map((d) => mapDoc(d)) });
  },
);

// ── SEPA UPLOAD ───────────────────────────────────────────────────────────────

router.post(
  "/sepa-bestanden/upload",
  requireBevoegdheid("salarisarchief", 3),
  upload.single("bestand"),
  async (req: Request, res: Response): Promise<void> => {
    const bestand = req.file;
    if (!bestand) { res.status(400).json({ error: "Geen bestand meegestuurd" }); return; }

    const userId = sessieGebruikerId(req);
    const gebruikerNaam = sessieGebruikerNaam(req);
    const { omschrijving, periode_jaar, periode_maand } = req.body as {
      omschrijving?: string; periode_jaar?: string; periode_maand?: string;
    };

    const isXml = bestand.originalname.endsWith(".xml") || bestand.originalname.toLowerCase().includes("pain");
    let bestandsformaat = "overig";
    let msgId: string | null = null;
    let aantalBetalingen: number | null = null;
    let controleSom: string | null = null;
    let betaaldatum: string | null = null;
    let ibanOpdrachtgever: string | null = null;
    let fouten: string[] = [];

    if (isXml) {
      bestandsformaat = "pain.001";
      const xml = bestand.buffer.toString("utf-8");
      const parsed = parsePainXml(xml);
      msgId = parsed.msgId;
      aantalBetalingen = parsed.aantalBetalingen;
      controleSom = parsed.controleSom;
      betaaldatum = parsed.betaaldatum;
      ibanOpdrachtgever = parsed.ibanOpdrachtgever;
      fouten = parsed.fouten;
    } else if (bestand.originalname.endsWith(".csv")) {
      bestandsformaat = "csv";
    }

    const subPath = `sepa/${Date.now()}_${bestand.originalname.replace(/[^a-zA-Z0-9._\-]/g, "_")}`;
    let objectPath: string;
    try {
      objectPath = await storage.uploadBestand(subPath, bestand.buffer, bestand.mimetype || "application/octet-stream");
    } catch (err) {
      logger.error({ err }, "SEPA upload mislukt");
      res.status(500).json({ error: "Opslaan mislukt" });
      return;
    }

    const jaar = periode_jaar ? parseInt(periode_jaar, 10) : null;
    const maand = periode_maand ? parseInt(periode_maand, 10) : null;

    const [sepa] = await db.insert(sepaBestandenTable).values({
      omschrijving: omschrijving ?? null,
      periodeJaar: jaar,
      periodeMaand: maand,
      betaaldatum: betaaldatum ?? null,
      totaalbedrag: controleSom ?? null,
      aantalBetalingen: aantalBetalingen ?? null,
      ibanOpdrachtgever: ibanOpdrachtgever ?? null,
      bestandsformaat,
      status: "ontvangen",
      bestandsnaam: bestand.originalname,
      objectPath,
      bestandsgrootte: bestand.size,
      uploaderId: userId,
      uploaderNaam: gebruikerNaam,
      fouten: fouten.length > 0 ? fouten : null,
      batchReferentie: msgId ?? null,
    }).returning();

    await logAudit({
      sepaId: sepa.id,
      actie: "upload",
      gebruikerId: userId,
      gebruikerNaam,
      documentType: "sepa",
      extra: { bestandsformaat, msgId },
    });

    res.status(201).json(mapSepa(sepa));
  },
);

// ── SALARISARCHIEF BATCHES ────────────────────────────────────────────────────

router.get("/salarisarchief/batches", requireBevoegdheid("salarisarchief", 1), async (req: Request, res: Response): Promise<void> => {
  const batches = await db.select().from(salarisbatchesTable).orderBy(desc(salarisbatchesTable.aangemaaktOp)).limit(200);
  res.json(batches.map(mapBatch));
});

router.get("/salarisarchief/batches/:id", requireBevoegdheid("salarisarchief", 1), async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(String(req.params["id"] ?? "0"), 10);
  const [batch] = await db.select().from(salarisbatchesTable).where(eq(salarisbatchesTable.id, id));
  if (!batch) { res.status(404).json({ error: "Niet gevonden" }); return; }

  const docs = await db
    .select({
      d: salarisbestandenTable,
      medewerkerNaam: medewerkersTable.naam,
    })
    .from(salarisbestandenTable)
    .leftJoin(medewerkersTable, eq(salarisbestandenTable.medewerkerId, medewerkersTable.id))
    .where(eq(salarisbestandenTable.batchId, id))
    .orderBy(asc(salarisbestandenTable.id));

  import("drizzle-orm").then(({ asc: _a }) => void _a).catch(() => void 0);

  res.json({ ...mapBatch(batch), documenten: docs.map(({ d, medewerkerNaam }) => mapDoc(d, medewerkerNaam)) });
});

// ── SALARISARCHIEF DOCUMENTEN ─────────────────────────────────────────────────

router.get("/salarisarchief/documenten", requireBevoegdheid("salarisarchief", 1), async (req: Request, res: Response): Promise<void> => {
  const { batch_id, medewerker_id, type, status } = req.query as Record<string, string | undefined>;

  const where = [];
  if (batch_id) where.push(eq(salarisbestandenTable.batchId, parseInt(batch_id, 10)));
  if (medewerker_id) where.push(eq(salarisbestandenTable.medewerkerId, parseInt(medewerker_id, 10)));
  if (type) where.push(eq(salarisbestandenTable.type, type));
  if (status) where.push(eq(salarisbestandenTable.status, status));

  const rows = await db
    .select({ d: salarisbestandenTable, medewerkerNaam: medewerkersTable.naam })
    .from(salarisbestandenTable)
    .leftJoin(medewerkersTable, eq(salarisbestandenTable.medewerkerId, medewerkersTable.id))
    .where(where.length > 0 ? and(...where) : undefined)
    .orderBy(desc(salarisbestandenTable.aangemaaktOp))
    .limit(500);

  res.json(rows.map(({ d, medewerkerNaam }) => mapDoc(d, medewerkerNaam)));
});

router.get("/salarisarchief/documenten/:id", requireBevoegdheid("salarisarchief", 1), async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(String(req.params["id"] ?? "0"), 10);
  const rows = await db
    .select({ d: salarisbestandenTable, medewerkerNaam: medewerkersTable.naam })
    .from(salarisbestandenTable)
    .leftJoin(medewerkersTable, eq(salarisbestandenTable.medewerkerId, medewerkersTable.id))
    .where(eq(salarisbestandenTable.id, id))
    .limit(1);
  if (rows.length === 0) { res.status(404).json({ error: "Niet gevonden" }); return; }
  res.json(mapDoc(rows[0].d, rows[0].medewerkerNaam));
});

router.patch("/salarisarchief/documenten/:id", requireBevoegdheid("salarisarchief", 2), async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(String(req.params["id"] ?? "0"), 10);
  const { medewerker_id, status, zichtbaar_medewerker, periode_jaar, periode_maand, type } = req.body as {
    medewerker_id?: number | null;
    status?: string;
    zichtbaar_medewerker?: boolean;
    periode_jaar?: number | null;
    periode_maand?: number | null;
    type?: string;
  };

  const patch: Partial<typeof salarisbestandenTable.$inferInsert> = { bijgewerktOp: new Date() };
  if (medewerker_id !== undefined) {
    patch.medewerkerId = medewerker_id;
    if (medewerker_id !== null && status === undefined) patch.status = "gekoppeld";
  }
  if (status !== undefined) patch.status = status;
  if (zichtbaar_medewerker !== undefined) patch.zichtbaarMedewerker = zichtbaar_medewerker;
  if (periode_jaar !== undefined) patch.periodeJaar = periode_jaar;
  if (periode_maand !== undefined) patch.periodeMaand = periode_maand;
  if (type !== undefined) patch.type = type;

  const [updated] = await db.update(salarisbestandenTable).set(patch).where(eq(salarisbestandenTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Niet gevonden" }); return; }

  const userId = sessieGebruikerId(req);
  const gebruikerNaam = sessieGebruikerNaam(req);
  await logAudit({
    documentId: id,
    actie: medewerker_id !== undefined ? "koppelen" : "bewerken",
    gebruikerId: userId,
    gebruikerNaam,
    medewerkerId: updated.medewerkerId,
    documentType: updated.type,
    batchId: updated.batchId,
    extra: { status: updated.status },
  });

  const rows = await db
    .select({ d: salarisbestandenTable, medewerkerNaam: medewerkersTable.naam })
    .from(salarisbestandenTable)
    .leftJoin(medewerkersTable, eq(salarisbestandenTable.medewerkerId, medewerkersTable.id))
    .where(eq(salarisbestandenTable.id, id))
    .limit(1);
  res.json(mapDoc(rows[0].d, rows[0].medewerkerNaam));
});

// ── PUBLICEREN ────────────────────────────────────────────────────────────────

router.post("/salarisarchief/documenten/:id/publiceer", requireBevoegdheid("salarisarchief", 2), async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(String(req.params["id"] ?? "0"), 10);
  const [doc] = await db.select().from(salarisbestandenTable).where(eq(salarisbestandenTable.id, id)).limit(1);
  if (!doc) { res.status(404).json({ error: "Niet gevonden" }); return; }
  if (!doc.medewerkerId) { res.status(409).json({ error: "Document is niet aan een medewerker gekoppeld" }); return; }

  const [updated] = await db.update(salarisbestandenTable).set({
    status: "gepubliceerd",
    zichtbaarMedewerker: true,
    bijgewerktOp: new Date(),
  }).where(eq(salarisbestandenTable.id, id)).returning();

  const userId = sessieGebruikerId(req);
  const gebruikerNaam = sessieGebruikerNaam(req);
  await logAudit({ documentId: id, actie: "publiceren", gebruikerId: userId, gebruikerNaam, medewerkerId: doc.medewerkerId, documentType: doc.type, batchId: doc.batchId });

  const rows = await db
    .select({ d: salarisbestandenTable, medewerkerNaam: medewerkersTable.naam })
    .from(salarisbestandenTable)
    .leftJoin(medewerkersTable, eq(salarisbestandenTable.medewerkerId, medewerkersTable.id))
    .where(eq(salarisbestandenTable.id, id))
    .limit(1);
  res.json(mapDoc(rows[0].d, rows[0].medewerkerNaam));
  void updated;
});

router.post("/salarisarchief/batch-publiceer", requireBevoegdheid("salarisarchief", 2), async (req: Request, res: Response): Promise<void> => {
  const { document_ids } = req.body as { document_ids: number[] };
  if (!Array.isArray(document_ids) || document_ids.length === 0) {
    res.status(400).json({ error: "Geen document-IDs opgegeven" });
    return;
  }

  const docs = await db.select().from(salarisbestandenTable).where(inArray(salarisbestandenTable.id, document_ids));
  const tePubliceren = docs.filter((d) => d.medewerkerId !== null);
  const overgeslagen = docs.filter((d) => d.medewerkerId === null);

  const foutmeldingen: string[] = overgeslagen.map((d) => `Document ${d.id} (${d.bestandsnaam}): geen medewerker gekoppeld`);

  if (tePubliceren.length > 0) {
    await db.update(salarisbestandenTable).set({
      status: "gepubliceerd",
      zichtbaarMedewerker: true,
      bijgewerktOp: new Date(),
    }).where(inArray(salarisbestandenTable.id, tePubliceren.map((d) => d.id)));
  }

  const userId = sessieGebruikerId(req);
  const gebruikerNaam = sessieGebruikerNaam(req);
  for (const doc of tePubliceren) {
    await logAudit({ documentId: doc.id, actie: "publiceren", gebruikerId: userId, gebruikerNaam, medewerkerId: doc.medewerkerId, documentType: doc.type, batchId: doc.batchId });
  }

  res.json({ gepubliceerd: tePubliceren.length, overgeslagen: overgeslagen.length, totaal: docs.length, foutmeldingen });
});

// ── DOWNLOAD ──────────────────────────────────────────────────────────────────

router.get("/salarisarchief/documenten/:id/download-url", requireBevoegdheid("salarisarchief", 1), async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(String(req.params["id"] ?? "0"), 10);
  const [doc] = await db.select().from(salarisbestandenTable).where(eq(salarisbestandenTable.id, id)).limit(1);
  if (!doc) { res.status(404).json({ error: "Niet gevonden" }); return; }

  const userId = sessieGebruikerId(req);
  const gebruikerNaam = sessieGebruikerNaam(req);
  await logAudit({ documentId: id, actie: "downloaden", gebruikerId: userId, gebruikerNaam, medewerkerId: doc.medewerkerId, documentType: doc.type, batchId: doc.batchId });

  res.json({ url: `/api/salarisarchief/documenten/${id}/download` });
});

router.get("/salarisarchief/documenten/:id/download", requireBevoegdheid("salarisarchief", 1), async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(String(req.params["id"] ?? "0"), 10);
  const [doc] = await db.select().from(salarisbestandenTable).where(eq(salarisbestandenTable.id, id)).limit(1);
  if (!doc) { res.status(404).json({ error: "Niet gevonden" }); return; }

  try {
    const file = await storage.getObjectEntityFile(doc.objectPath);
    const [meta] = await file.getMetadata();
    res.setHeader("Content-Type", meta.contentType ?? doc.mimeType ?? "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(doc.bestandsnaam)}`);
    file.createReadStream().pipe(res);
  } catch (err) {
    logger.error({ err }, "Download mislukt");
    res.status(500).json({ error: "Download mislukt" });
  }
});

// ── AUDIT LOG ─────────────────────────────────────────────────────────────────

router.get("/salarisarchief/auditlog", requireBevoegdheid("salarisarchief", 1), async (req: Request, res: Response): Promise<void> => {
  const { document_id, medewerker_id, limit: limitStr } = req.query as Record<string, string | undefined>;
  const limit = limitStr ? Math.min(parseInt(limitStr, 10), 500) : 100;

  const where = [];
  if (document_id) where.push(eq(salarisdocumentAuditTable.documentId, parseInt(document_id, 10)));
  if (medewerker_id) where.push(eq(salarisdocumentAuditTable.medewerkerId, parseInt(medewerker_id, 10)));

  const rows = await db
    .select()
    .from(salarisdocumentAuditTable)
    .where(where.length > 0 ? and(...where) : undefined)
    .orderBy(desc(salarisdocumentAuditTable.tijdstip))
    .limit(limit);

  res.json(rows.map((r) => ({
    id: r.id,
    document_id: r.documentId,
    sepa_id: r.sepaId,
    actie: r.actie,
    gebruiker_naam: r.gebruikerNaam,
    medewerker_id: r.medewerkerId,
    document_type: r.documentType,
    batch_id: r.batchId,
    tijdstip: r.tijdstip.toISOString(),
    extra: r.extra,
  })));
});

// ── MIJN SALARISDOCUMENTEN (medewerker self-service) ─────────────────────────

router.get("/mijn/salarisdocumenten", async (req: Request, res: Response): Promise<void> => {
  const userId = sessieGebruikerId(req);
  if (!userId) { res.status(401).json({ error: "Niet ingelogd" }); return; }

  const [mw] = await db
    .select({ id: medewerkersTable.id, naam: medewerkersTable.naam })
    .from(medewerkersTable)
    .where(eq(medewerkersTable.gebruikerId, userId))
    .limit(1);

  if (!mw) { res.json([]); return; }

  const docs = await db
    .select()
    .from(salarisbestandenTable)
    .where(and(
      eq(salarisbestandenTable.medewerkerId, mw.id),
      eq(salarisbestandenTable.zichtbaarMedewerker, true),
    ))
    .orderBy(desc(salarisbestandenTable.aangemaaktOp))
    .limit(200);

  await logAudit({ actie: "bekijken", gebruikerId: userId, gebruikerNaam: mw.naam, medewerkerId: mw.id, extra: { bron: "mijn-documenten" } });

  res.json(docs.map((d) => mapDoc(d, mw.naam)));
});

router.get("/mijn/salarisdocumenten/:id/download-url", async (req: Request, res: Response): Promise<void> => {
  const userId = sessieGebruikerId(req);
  if (!userId) { res.status(401).json({ error: "Niet ingelogd" }); return; }
  const docId = parseInt(String(req.params["id"] ?? "0"), 10);

  const [mw] = await db.select({ id: medewerkersTable.id, naam: medewerkersTable.naam })
    .from(medewerkersTable).where(eq(medewerkersTable.gebruikerId, userId)).limit(1);
  if (!mw) { res.status(403).json({ error: "Geen medewerker-account" }); return; }

  const [doc] = await db.select().from(salarisbestandenTable).where(
    and(eq(salarisbestandenTable.id, docId), eq(salarisbestandenTable.medewerkerId, mw.id), eq(salarisbestandenTable.zichtbaarMedewerker, true))
  ).limit(1);
  if (!doc) { res.status(404).json({ error: "Niet gevonden of geen toegang" }); return; }

  await logAudit({ documentId: docId, actie: "downloaden", gebruikerId: userId, gebruikerNaam: mw.naam, medewerkerId: mw.id, documentType: doc.type });
  res.json({ url: `/api/salarisarchief/documenten/${docId}/download` });
});

// ── SEPA BESTANDEN ────────────────────────────────────────────────────────────

router.get("/sepa-bestanden", requireBevoegdheid("salarisarchief", 1), async (req: Request, res: Response): Promise<void> => {
  const sepa = await db.select().from(sepaBestandenTable).orderBy(desc(sepaBestandenTable.aangemaaktOp)).limit(200);
  res.json(sepa.map(mapSepa));
});

router.get("/sepa-bestanden/:id", requireBevoegdheid("salarisarchief", 1), async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(String(req.params["id"] ?? "0"), 10);
  const [sepa] = await db.select().from(sepaBestandenTable).where(eq(sepaBestandenTable.id, id)).limit(1);
  if (!sepa) { res.status(404).json({ error: "Niet gevonden" }); return; }
  res.json(mapSepa(sepa));
});

router.patch("/sepa-bestanden/:id", requireBevoegdheid("salarisarchief", 2), async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(String(req.params["id"] ?? "0"), 10);
  const { status, omschrijving } = req.body as { status?: string; omschrijving?: string };

  const patch: Partial<typeof sepaBestandenTable.$inferInsert> = { bijgewerktOp: new Date() };
  if (status !== undefined) patch.status = status;
  if (omschrijving !== undefined) patch.omschrijving = omschrijving;

  const userId = sessieGebruikerId(req);
  const gebruikerNaam = sessieGebruikerNaam(req);

  if (status === "gedownload") {
    patch.gedownloadDoorId = userId;
    patch.gedownloadOp = new Date();
  }

  const [updated] = await db.update(sepaBestandenTable).set(patch).where(eq(sepaBestandenTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Niet gevonden" }); return; }

  await logAudit({
    sepaId: id,
    actie: status === "klaar_voor_bank" ? "sepa_klaar_voor_bank" : status === "verwerkt" ? "sepa_verwerkt" : status === "gedownload" ? "sepa_download" : "bewerken",
    gebruikerId: userId,
    gebruikerNaam,
    documentType: "sepa",
    extra: { status },
  });

  res.json(mapSepa(updated));
});

router.get("/sepa-bestanden/:id/download-url", requireBevoegdheid("salarisarchief", 1), async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(String(req.params["id"] ?? "0"), 10);
  const [sepa] = await db.select().from(sepaBestandenTable).where(eq(sepaBestandenTable.id, id)).limit(1);
  if (!sepa) { res.status(404).json({ error: "Niet gevonden" }); return; }

  const userId = sessieGebruikerId(req);
  const gebruikerNaam = sessieGebruikerNaam(req);
  await logAudit({ sepaId: id, actie: "sepa_download", gebruikerId: userId, gebruikerNaam, documentType: "sepa" });

  res.json({ url: `/api/sepa-bestanden/${id}/download` });
});

router.get("/sepa-bestanden/:id/download", requireBevoegdheid("salarisarchief", 1), async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(String(req.params["id"] ?? "0"), 10);
  const [sepa] = await db.select().from(sepaBestandenTable).where(eq(sepaBestandenTable.id, id)).limit(1);
  if (!sepa) { res.status(404).json({ error: "Niet gevonden" }); return; }

  try {
    const file = await storage.getObjectEntityFile(sepa.objectPath);
    const [meta] = await file.getMetadata();
    res.setHeader("Content-Type", meta.contentType ?? "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(sepa.bestandsnaam)}`);
    await db.update(sepaBestandenTable).set({ gedownloadDoorId: sessieGebruikerId(req), gedownloadOp: new Date(), bijgewerktOp: new Date() }).where(eq(sepaBestandenTable.id, id));
    file.createReadStream().pipe(res);
  } catch (err) {
    logger.error({ err }, "SEPA download mislukt");
    res.status(500).json({ error: "Download mislukt" });
  }
});

// ── MEDEWERKER-NAAM MATCHING OP PAGINATEKST ──────────────────────────────────

async function matchMedewerkerOpTekst(tekst: string): Promise<{
  medewerkerId: number | null;
  medewerkerNaamAi: string | null;
  aiZekerheid: number;
  aiToelichting: string;
  status: string;
}> {
  const medewerkers = await db
    .select({ id: medewerkersTable.id, naam: medewerkersTable.naam })
    .from(medewerkersTable);

  if (medewerkers.length === 0) {
    return { medewerkerId: null, medewerkerNaamAi: null, aiZekerheid: 0, aiToelichting: "Geen medewerkers in systeem", status: "geupload" };
  }

  const tekstLower = tekst.toLowerCase();
  let bestMatch: { id: number; naam: string; score: number } | null = null;

  for (const mw of medewerkers) {
    const naamLower = mw.naam.toLowerCase().trim();
    const naamDelen = naamLower.split(/\s+/);

    if (tekstLower.includes(naamLower)) {
      const score = 0.95;
      if (!bestMatch || score > bestMatch.score) bestMatch = { id: mw.id, naam: mw.naam, score };
    } else {
      const hits = naamDelen.filter((d) => d.length > 2 && tekstLower.includes(d));
      if (hits.length >= 2) {
        const score = 0.75;
        if (!bestMatch || score > bestMatch.score) bestMatch = { id: mw.id, naam: mw.naam, score };
      } else if (hits.length === 1) {
        const score = 0.4;
        if (!bestMatch || score > bestMatch.score) bestMatch = { id: mw.id, naam: mw.naam, score };
      }
    }
  }

  if (!bestMatch) {
    return { medewerkerId: null, medewerkerNaamAi: null, aiZekerheid: 0, aiToelichting: "Naam niet herkend op pagina", status: "geupload" };
  }

  if (bestMatch.score >= 0.85) {
    return { medewerkerId: bestMatch.id, medewerkerNaamAi: bestMatch.naam, aiZekerheid: bestMatch.score, aiToelichting: "Naam automatisch herkend op pagina", status: "gekoppeld" };
  }

  return { medewerkerId: bestMatch.id, medewerkerNaamAi: bestMatch.naam, aiZekerheid: bestMatch.score, aiToelichting: "Mogelijk match — handmatige controle vereist", status: "controle_nodig" };
}

// ── SPLIT-PDF: één multi-pagina PDF → losse strookjes per medewerker ─────────

router.post(
  "/salarisarchief/split-pdf",
  requireBevoegdheid("salarisarchief", 3),
  upload.single("bestand"),
  async (req: Request, res: Response): Promise<void> => {
    const bestand = req.file;
    if (!bestand) { res.status(400).json({ error: "Geen bestand meegestuurd" }); return; }
    if (bestand.mimetype !== "application/pdf" && !bestand.originalname.endsWith(".pdf")) {
      res.status(400).json({ error: "Alleen PDF-bestanden worden ondersteund" });
      return;
    }

    const userId = sessieGebruikerId(req);
    const gebruikerNaam = sessieGebruikerNaam(req);
    const { omschrijving, periode_jaar, periode_maand, type: opgegeven_type } = req.body as {
      omschrijving?: string; periode_jaar?: string; periode_maand?: string; type?: string;
    };
    const jaar = periode_jaar ? parseInt(periode_jaar, 10) : null;
    const maand = periode_maand ? parseInt(periode_maand, 10) : null;
    const type = opgegeven_type ?? "loonstrook";

    // 1. Tekst per pagina extraheren
    const { paginaTeksten, paginaAantal } = await extraheerPdfTekst(bestand.buffer);

    if (!paginaAantal || paginaAantal === 0) {
      res.status(422).json({ error: "PDF bevat geen leesbare pagina's" });
      return;
    }

    // 2. PDF opsplitsen per pagina via pdf-lib
    const { PDFDocument } = await import("pdf-lib");
    const srcDoc = await PDFDocument.load(bestand.buffer, { ignoreEncryption: true });
    const pageCount = srcDoc.getPageCount();

    // 3. Batch aanmaken
    const [batch] = await db.insert(salarisbatchesTable).values({
      omschrijving: omschrijving ?? `Split PDF: ${bestand.originalname}`,
      periodeJaar: jaar,
      periodeMaand: maand,
      status: "verwerken",
      uploaderId: userId,
      uploaderNaam: gebruikerNaam,
      totaalBestanden: pageCount,
    }).returning();

    let gekoppeld = 0;
    let ongekoppeld = 0;
    let controleNodig = 0;
    const documenten = [];

    // 4. Per pagina: tekst matchen + losse PDF opslaan
    for (let i = 0; i < pageCount; i++) {
      const paginaDoc = await PDFDocument.create();
      const [gekopieerd] = await paginaDoc.copyPagesFrom(srcDoc, [i]);
      paginaDoc.addPage(gekopieerd);
      const pageBuffer = Buffer.from(await paginaDoc.save());

      const paginaTekst = paginaTeksten[i] ?? "";
      const match = await matchMedewerkerOpTekst(paginaTekst);

      const paginaNaam = match.medewerkerNaamAi
        ? `${match.medewerkerNaamAi.replace(/\s+/g, "_")}_pagina${i + 1}.pdf`
        : `pagina${i + 1}.pdf`;

      const subPath = `salarisbestanden/${batch.id}/${Date.now()}_${paginaNaam}`;
      let objectPath: string;
      try {
        objectPath = await storage.uploadBestand(subPath, pageBuffer, "application/pdf");
      } catch (err) {
        logger.error({ err, pagina: i + 1 }, "PDF-pagina upload naar object storage mislukt");
        continue;
      }

      if (match.status === "gekoppeld") gekoppeld++;
      else if (match.status === "controle_nodig") controleNodig++;
      else ongekoppeld++;

      const [doc] = await db.insert(salarisbestandenTable).values({
        batchId: batch.id,
        type,
        periodeJaar: jaar,
        periodeMaand: maand,
        medewerkerId: match.medewerkerId,
        medewerkerNaamAi: match.medewerkerNaamAi,
        status: match.status,
        zichtbaarMedewerker: false,
        bestandsnaam: paginaNaam,
        objectPath,
        bestandsgrootte: pageBuffer.length,
        mimeType: "application/pdf",
        uploaderId: userId,
        uploaderNaam: gebruikerNaam,
        aiZekerheid: match.aiZekerheid,
        aiToelichting: match.aiToelichting,
        bronbestandNaam: bestand.originalname,
      }).returning();

      await logAudit({
        documentId: doc.id,
        actie: "split-upload",
        gebruikerId: userId,
        gebruikerNaam,
        medewerkerId: match.medewerkerId,
        documentType: type,
        batchId: batch.id,
        extra: { pagina: i + 1, aiZekerheid: match.aiZekerheid },
      });

      documenten.push(doc);
    }

    // 5. Batch bijwerken
    await db.update(salarisbatchesTable).set({
      status: "gereed",
      gekoppeld,
      ongekoppeld,
      controleNodig,
      bijgewerktOp: new Date(),
    }).where(eq(salarisbatchesTable.id, batch.id));

    const [bijgewerktBatch] = await db.select().from(salarisbatchesTable).where(eq(salarisbatchesTable.id, batch.id));
    res.status(201).json({ ...mapBatch(bijgewerktBatch), documenten: documenten.map((d) => mapDoc(d)) });
  },
);

// ── MIJN SALARISDOCUMENT DIRECT DOWNLOAD (bearer-compatibel) ─────────────────

router.get("/mijn/salarisdocumenten/:id/download", async (req: Request, res: Response): Promise<void> => {
  const userId = sessieGebruikerId(req);
  if (!userId) { res.status(401).json({ error: "Niet ingelogd" }); return; }

  const docId = parseInt(String(req.params["id"] ?? "0"), 10);

  const [mw] = await db
    .select({ id: medewerkersTable.id, naam: medewerkersTable.naam })
    .from(medewerkersTable)
    .where(eq(medewerkersTable.gebruikerId, userId))
    .limit(1);
  if (!mw) { res.status(403).json({ error: "Geen medewerker-account gekoppeld" }); return; }

  const [doc] = await db
    .select()
    .from(salarisbestandenTable)
    .where(and(
      eq(salarisbestandenTable.id, docId),
      eq(salarisbestandenTable.medewerkerId, mw.id),
      eq(salarisbestandenTable.zichtbaarMedewerker, true),
    ))
    .limit(1);
  if (!doc) { res.status(404).json({ error: "Niet gevonden of geen toegang" }); return; }

  try {
    const file = await storage.getObjectEntityFile(doc.objectPath);
    const [meta] = await file.getMetadata();
    res.setHeader("Content-Type", meta.contentType ?? doc.mimeType ?? "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(doc.bestandsnaam)}`);
    await logAudit({ documentId: docId, actie: "downloaden", gebruikerId: userId, gebruikerNaam: mw.naam, medewerkerId: mw.id, documentType: doc.type });
    file.createReadStream().pipe(res);
  } catch (err) {
    logger.error({ err }, "Mijn salarisdocument download mislukt");
    res.status(500).json({ error: "Download mislukt" });
  }
});

export default router;
