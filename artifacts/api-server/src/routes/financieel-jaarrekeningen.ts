import { Router } from "express";
import multer from "multer";
import crypto from "crypto";
import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import {
  db,
  financieleDocumentenTable,
  financieleKerncijfersTable,
  financieleDocumentLogTable,
  gebruikersTable,
} from "@workspace/db";
import { requireAuth, requireBevoegdheid } from "../middlewares/auth";
import { ObjectStorageService } from "../lib/objectStorage";
import { classificeerDocument } from "../lib/documentIntelligence";
import { extraheerKerncijfers, type GeextraheerdKerncijfer } from "../lib/financieleExtractie";
import { extraheerPdfTekst } from "../lib/pdfTekst";

const router = Router();
const objectStorage = new ObjectStorageService();

// Alle routes vereisen minimaal het vertrouwelijke leesrecht; schrijfacties vereisen niveau 2.
const lezen = requireBevoegdheid("financieel_vertrouwelijk", 1);
const schrijven = requireBevoegdheid("financieel_vertrouwelijk", 2);

const uploadEnkel = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseId(v: string | string[] | undefined): number {
  return parseInt(Array.isArray(v) ? v[0] : String(v ?? ""), 10);
}

function opslagSubPath(bestandsnaam: string): string {
  const veilig = bestandsnaam.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `financieel/jaarrekeningen/${Date.now()}_${veilig}`;
}

function bepaalOpslaglocatie(subtype: string, boekjaar: number | null): string {
  const type = subtype === "geconsolideerd" ? "Geconsolideerde jaarrekeningen" : "Jaarrekeningen";
  return boekjaar ? `Financieel → ${type} → ${boekjaar}` : `Financieel → ${type} → jaar onbekend`;
}

function numOfNull(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function isoOfNull(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

type DocRow = typeof financieleDocumentenTable.$inferSelect;
type CijferRow = typeof financieleKerncijfersTable.$inferSelect;
type LogRow = typeof financieleDocumentLogTable.$inferSelect;

function mapDocument(
  row: DocRow,
  extra: { aantalKerncijfers?: number; aantalGoedgekeurd?: number; geuploadDoorNaam?: string | null } = {},
) {
  return {
    id: row.id,
    bestandsnaam: row.bestandsnaam,
    titel: row.titel,
    bestandspad: row.bestandspad,
    bestandsgrootte: row.bestandsgrootte,
    mimetype: row.mimetype,
    bestands_hash: row.bestandsHash,
    documenttype: row.documenttype,
    entiteit: row.entiteit,
    boekjaar: row.boekjaar,
    subtype: row.subtype,
    documentstatus: row.documentstatus,
    beveiligingsprofiel: row.beveiligingsprofiel,
    opslaglocatie: row.opslaglocatie,
    classificatie_methode: row.classificatieMethode,
    betrouwbaarheid: row.betrouwbaarheid,
    betrouwbaarheid_score: row.betrouwbaarheidScore,
    gevonden_gegevens: (row.gevondenGegevens as Record<string, unknown> | null) ?? null,
    extractie_status: row.extractieStatus,
    dataset_status: row.datasetStatus,
    vervangt_document_id: row.vervangtDocumentId,
    is_actueel: row.isActueel,
    aantal_kerncijfers: extra.aantalKerncijfers ?? 0,
    aantal_goedgekeurd: extra.aantalGoedgekeurd ?? 0,
    geupload_door: row.geuploadDoor,
    geupload_door_naam: extra.geuploadDoorNaam ?? null,
    geupload_op: row.geuploadOp.toISOString(),
    goedgekeurd_door: row.goedgekeurdDoor,
    goedgekeurd_op: isoOfNull(row.goedgekeurdOp),
    aangemaakt_op: row.aangemaaktOp.toISOString(),
    bijgewerkt_op: row.bijgewerktOp.toISOString(),
  };
}

function mapKerncijfer(row: CijferRow) {
  return {
    id: row.id,
    document_id: row.documentId,
    entiteit: row.entiteit,
    boekjaar: row.boekjaar,
    geconsolideerd: row.geconsolideerd,
    sleutel: row.sleutel,
    label: row.label,
    waarde: numOfNull(row.waarde),
    eenheid: row.eenheid,
    status: row.status,
    is_berekend: row.isBerekend,
    uitgesloten: row.uitgesloten,
    handmatig_aangepast: row.handmatigAangepast,
    oorspronkelijke_waarde: numOfNull(row.oorspronkelijkeWaarde),
    bron_pagina: row.bronPagina,
    bron_tabel: row.bronTabel,
    bron_tekst: row.bronTekst,
    extractie_methode: row.extractieMethode,
    confidence: numOfNull(row.confidence),
    beoordeeld_door: row.beoordeeldDoor,
    beoordeeld_op: isoOfNull(row.beoordeeldOp),
    aangemaakt_op: row.aangemaaktOp.toISOString(),
    bijgewerkt_op: row.bijgewerktOp.toISOString(),
  };
}

function mapLog(row: LogRow & { gebruikerNaam?: string | null }) {
  return {
    id: row.id,
    actie: row.actie,
    gebruiker_id: row.gebruikerId,
    gebruiker_naam: row.gebruikerNaam ?? null,
    details: row.details,
    aangemaakt_op: row.aangemaaktOp.toISOString(),
  };
}

async function tekstUitBuffer(buffer: Buffer, mime: string): Promise<string | null> {
  if (mime === "application/pdf") {
    try {
      const { tekst } = await extraheerPdfTekst(buffer);
      return tekst;
    } catch {
      return null;
    }
  }
  if (mime.startsWith("text/") || mime === "application/json" || mime === "text/csv") {
    return buffer.toString("utf8");
  }
  return null;
}

// Slaat de geextraheerde kerncijfers op voor een document. Verwijdert eerst
// bestaande voorstellen zodat opnieuw extraheren de dataset volledig vervangt.
async function vervangKerncijfers(
  documentId: number,
  entiteit: string | null,
  boekjaar: number | null,
  geconsolideerd: boolean,
  cijfers: GeextraheerdKerncijfer[],
): Promise<number> {
  await db.delete(financieleKerncijfersTable).where(eq(financieleKerncijfersTable.documentId, documentId));
  if (cijfers.length === 0) return 0;
  await db.insert(financieleKerncijfersTable).values(
    cijfers.map((c) => ({
      documentId,
      entiteit,
      boekjaar,
      geconsolideerd,
      sleutel: c.sleutel,
      label: c.label,
      waarde: c.waarde === null ? null : String(c.waarde),
      eenheid: c.eenheid,
      status: "proposed",
      isBerekend: c.isBerekend,
      bronPagina: c.bronPagina,
      bronTabel: c.bronTabel,
      bronTekst: c.bronTekst,
      extractieMethode: c.extractieMethode,
      confidence: String(c.confidence),
    })),
  );
  return cijfers.length;
}

type DbOfTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

async function logActie(
  documentId: number | null,
  actie: string,
  gebruikerId: number | null,
  details?: string,
  uitvoerder: DbOfTx = db,
): Promise<void> {
  await uitvoerder.insert(financieleDocumentLogTable).values({ documentId, actie, gebruikerId, details: details ?? null });
}

// Haalt aantallen kerncijfers + goedgekeurd per document op.
async function telKerncijfers(docIds: number[]): Promise<Map<number, { totaal: number; goedgekeurd: number }>> {
  const kaart = new Map<number, { totaal: number; goedgekeurd: number }>();
  if (docIds.length === 0) return kaart;
  const rijen = await db
    .select({
      documentId: financieleKerncijfersTable.documentId,
      totaal: sql<number>`count(*)::int`,
      goedgekeurd: sql<number>`count(*) filter (where ${financieleKerncijfersTable.status} = 'approved' and ${financieleKerncijfersTable.uitgesloten} = false)::int`,
    })
    .from(financieleKerncijfersTable)
    .where(inArray(financieleKerncijfersTable.documentId, docIds))
    .groupBy(financieleKerncijfersTable.documentId);
  for (const r of rijen) kaart.set(r.documentId, { totaal: r.totaal, goedgekeurd: r.goedgekeurd });
  return kaart;
}

// ── LIST ─────────────────────────────────────────────────────────────────────
router.get("/financieel/jaarrekeningen", requireAuth, lezen, async (req, res): Promise<void> => {
  try {
    const filters: SQL[] = [];
    if (req.query.entiteit) filters.push(eq(financieleDocumentenTable.entiteit, String(req.query.entiteit)));
    if (req.query.boekjaar) filters.push(eq(financieleDocumentenTable.boekjaar, parseInt(String(req.query.boekjaar), 10)));
    if (req.query.subtype) filters.push(eq(financieleDocumentenTable.subtype, String(req.query.subtype)));
    if (req.query.dataset_status) filters.push(eq(financieleDocumentenTable.datasetStatus, String(req.query.dataset_status)));
    const inclusiefNietActueel = req.query.inclusief_niet_actueel === "true" || req.query.inclusief_niet_actueel === "1";
    if (!inclusiefNietActueel) filters.push(eq(financieleDocumentenTable.isActueel, true));

    const zoek = req.query.zoek ? String(req.query.zoek).trim().toLowerCase() : "";
    if (zoek) {
      filters.push(
        sql`(lower(${financieleDocumentenTable.titel}) like ${"%" + zoek + "%"}
          or lower(coalesce(${financieleDocumentenTable.entiteit}, '')) like ${"%" + zoek + "%"}
          or lower(${financieleDocumentenTable.bestandsnaam}) like ${"%" + zoek + "%"})`,
      );
    }

    const rijen = await db
      .select()
      .from(financieleDocumentenTable)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(financieleDocumentenTable.boekjaar), desc(financieleDocumentenTable.geuploadOp));

    const counts = await telKerncijfers(rijen.map((r) => r.id));
    const uploaderIds = [...new Set(rijen.map((r) => r.geuploadDoor).filter((v): v is number => v !== null))];
    const namen = new Map<number, string>();
    if (uploaderIds.length) {
      const g = await db
        .select({ id: gebruikersTable.id, naam: gebruikersTable.naam })
        .from(gebruikersTable)
        .where(inArray(gebruikersTable.id, uploaderIds));
      for (const u of g) namen.set(u.id, u.naam);
    }

    res.json(
      rijen.map((r) =>
        mapDocument(r, {
          aantalKerncijfers: counts.get(r.id)?.totaal ?? 0,
          aantalGoedgekeurd: counts.get(r.id)?.goedgekeurd ?? 0,
          geuploadDoorNaam: r.geuploadDoor ? namen.get(r.geuploadDoor) ?? null : null,
        }),
      ),
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── DUPLICAATCONTROLE ──────────────────────────────────────────────────────────
router.post("/financieel/jaarrekeningen/controleer-duplicaat", requireAuth, lezen, async (req, res): Promise<void> => {
  try {
    const hash: string | null = req.body.bestands_hash ?? null;
    const entiteit: string | null = req.body.entiteit ?? null;
    const boekjaar: number | null = req.body.boekjaar ?? null;
    const subtype: string | null = req.body.subtype ?? null;

    const treffers: DocRow[] = [];
    let reden: string | null = null;

    if (hash) {
      const opHash = await db
        .select()
        .from(financieleDocumentenTable)
        .where(and(eq(financieleDocumentenTable.bestandsHash, hash), eq(financieleDocumentenTable.isActueel, true)));
      if (opHash.length) {
        treffers.push(...opHash);
        reden = "Identiek bestand (zelfde inhoud) is al opgeslagen";
      }
    }
    if (treffers.length === 0 && entiteit && boekjaar) {
      const meta = await db
        .select()
        .from(financieleDocumentenTable)
        .where(
          and(
            eq(financieleDocumentenTable.entiteit, entiteit),
            eq(financieleDocumentenTable.boekjaar, boekjaar),
            subtype ? eq(financieleDocumentenTable.subtype, subtype) : undefined,
            eq(financieleDocumentenTable.isActueel, true),
          ),
        );
      if (meta.length) {
        treffers.push(...meta);
        reden = `Er bestaat al een ${subtype === "geconsolideerd" ? "geconsolideerde " : ""}jaarrekening voor ${entiteit} (${boekjaar})`;
      }
    }

    res.json({
      is_duplicaat: treffers.length > 0,
      reden,
      treffers: treffers.map((r) => mapDocument(r)),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── OPSLAAN (multipart) ────────────────────────────────────────────────────────
router.post(
  "/financieel/jaarrekeningen",
  requireAuth,
  schrijven,
  uploadEnkel.single("bestand"),
  async (req, res): Promise<void> => {
    try {
      const bestand = req.file ?? null;
      const bestandsnaam: string = bestand?.originalname ?? (req.body.bestandsnaam as string | undefined) ?? "";
      if (!bestandsnaam) return void res.status(400).json({ error: "bestandsnaam is verplicht" });

      const mimetype: string = bestand?.mimetype ?? (req.body.mimetype as string | undefined) ?? "application/octet-stream";
      const bestandsgrootte: number | null = bestand?.size ?? (req.body.bestandsgrootte ? parseInt(String(req.body.bestandsgrootte), 10) : null);
      const gebruikerId = req.session.userId ?? null;

      // Server-autoritatieve classificatie (bevestigt financieel + levert bewijs/status/gegevens).
      const analyse = await classificeerDocument({
        buffer: bestand?.buffer ?? null,
        bestandsnaam,
        mime: mimetype,
        toelichting: (req.body.opmerkingen as string | undefined) ?? null,
      });

      // Metadata: expliciete body-waarden hebben voorrang op de classificatie.
      const subtypeOverride = req.body.subtype as string | undefined;
      const subtype =
        subtypeOverride === "geconsolideerd" || subtypeOverride === "enkelvoudig"
          ? subtypeOverride
          : analyse.subtype === "geconsolideerd"
            ? "geconsolideerd"
            : "enkelvoudig";
      const boekjaar: number | null = req.body.boekjaar
        ? parseInt(String(req.body.boekjaar), 10)
        : analyse.jaar ?? null;
      const entiteit: string | null = (req.body.entiteit as string | undefined) ?? analyse.organisatie ?? null;
      const titel: string = (req.body.titel as string | undefined) ?? bestandsnaam;
      const documentstatus = analyse.documentstatus ?? "onbekend";
      const opslaglocatie = bepaalOpslaglocatie(subtype, boekjaar);
      const bestandsHash = bestand ? crypto.createHash("sha256").update(bestand.buffer).digest("hex") : null;
      const vervangtDocumentId: number | null = req.body.vervangt_document_id
        ? parseInt(String(req.body.vervangt_document_id), 10)
        : null;

      // Upload naar object storage — fail-loud: als het bestand niet opgeslagen kan
      // worden, weigeren we het hele verzoek. Nooit stilzwijgend een dood pad bewaren.
      let bestandspad: string;
      if (bestand) {
        const subPath = opslagSubPath(bestandsnaam);
        try {
          bestandspad = await objectStorage.uploadBestand(subPath, bestand.buffer, mimetype);
        } catch (err) {
          req.log.error({ err }, "Object storage niet beschikbaar — jaarrekening-upload geweigerd");
          return void res.status(503).json({
            error: "De bestandsopslag is momenteel niet beschikbaar. Het document is niet opgeslagen — probeer het later opnieuw of waarschuw de beheerder.",
          });
        }
      } else {
        bestandspad = (req.body.bestandspad as string | undefined) ?? `financieel/${Date.now()}_${bestandsnaam}`;
      }

      // Bij vervanging: oude versie op non-actueel + superseded zetten.
      if (vervangtDocumentId) {
        await db
          .update(financieleDocumentenTable)
          .set({ isActueel: false, datasetStatus: "superseded", bijgewerktOp: new Date() })
          .where(eq(financieleDocumentenTable.id, vervangtDocumentId));
        await logActie(vervangtDocumentId, "vervangen", gebruikerId, "Vervangen door een nieuwe versie");
      }

      const [doc] = await db
        .insert(financieleDocumentenTable)
        .values({
          bestandsnaam,
          titel,
          bestandspad,
          bestandsgrootte,
          mimetype,
          bestandsHash,
          documenttype: "jaarrekening",
          entiteit,
          boekjaar,
          subtype,
          documentstatus,
          beveiligingsprofiel: analyse.beveiligingsprofiel ?? "FINANCIAL_CONFIDENTIAL",
          opslaglocatie,
          classificatieMethode: analyse.ai_beschikbaar ? "ai" : "heuristiek",
          betrouwbaarheid: analyse.vertrouwen,
          betrouwbaarheidScore: analyse.vertrouwen_score ?? 0,
          aiBewijs: analyse.bewijs ? JSON.stringify(analyse.bewijs) : null,
          gevondenGegevens: analyse.gevonden_gegevens ?? null,
          extractieStatus: "niet_gestart",
          datasetStatus: "proposed",
          vervangtDocumentId,
          isActueel: true,
          geuploadDoor: gebruikerId,
        })
        .returning();

      await logActie(
        doc.id,
        "opgeslagen",
        gebruikerId,
        `Vertrouwelijk opgeslagen onder "${opslaglocatie}" (${analyse.vertrouwen}). Bewijs: ${analyse.bewijs.map((b) => b.stap).join(" → ")}`,
      );

      // Direct extraheren (standaard aan) zolang er tekst uit het bestand komt.
      const directExtraheren = req.body.direct_extraheren === undefined
        ? true
        : req.body.direct_extraheren === "true" || req.body.direct_extraheren === "1" || req.body.direct_extraheren === true;

      if (directExtraheren && bestand) {
        try {
          const tekst = await tekstUitBuffer(bestand.buffer, mimetype);
          const resultaat = await extraheerKerncijfers({ tekst, gebruikerId });
          const aantal = await vervangKerncijfers(doc.id, entiteit, boekjaar, subtype === "geconsolideerd", resultaat.cijfers);
          await db
            .update(financieleDocumentenTable)
            .set({ extractieStatus: "voltooid", bijgewerktOp: new Date() })
            .where(eq(financieleDocumentenTable.id, doc.id));
          await logActie(doc.id, "geextraheerd", gebruikerId, `${aantal} kerncijfers voorgesteld via ${resultaat.methode}`);
        } catch (err) {
          req.log.warn({ err }, "Kerncijferextractie mislukt bij opslaan");
          await db
            .update(financieleDocumentenTable)
            .set({ extractieStatus: "mislukt", bijgewerktOp: new Date() })
            .where(eq(financieleDocumentenTable.id, doc.id));
          await logActie(doc.id, "geextraheerd", gebruikerId, "Extractie mislukt");
        }
      }

      const detail = await bouwDetail(doc.id);
      res.status(201).json(detail);
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Interne serverfout" });
    }
  },
);

// Detail-opbouw hergebruikt door meerdere endpoints.
async function bouwDetail(id: number) {
  const [doc] = await db.select().from(financieleDocumentenTable).where(eq(financieleDocumentenTable.id, id));
  if (!doc) return null;
  const kerncijfers = await db
    .select()
    .from(financieleKerncijfersTable)
    .where(eq(financieleKerncijfersTable.documentId, id))
    .orderBy(financieleKerncijfersTable.id);
  const logboek = await db
    .select({
      id: financieleDocumentLogTable.id,
      documentId: financieleDocumentLogTable.documentId,
      actie: financieleDocumentLogTable.actie,
      gebruikerId: financieleDocumentLogTable.gebruikerId,
      details: financieleDocumentLogTable.details,
      aangemaaktOp: financieleDocumentLogTable.aangemaaktOp,
      gebruikerNaam: gebruikersTable.naam,
    })
    .from(financieleDocumentLogTable)
    .leftJoin(gebruikersTable, eq(financieleDocumentLogTable.gebruikerId, gebruikersTable.id))
    .where(eq(financieleDocumentLogTable.documentId, id))
    .orderBy(desc(financieleDocumentLogTable.aangemaaktOp));

  let geuploadDoorNaam: string | null = null;
  if (doc.geuploadDoor) {
    const [u] = await db.select({ naam: gebruikersTable.naam }).from(gebruikersTable).where(eq(gebruikersTable.id, doc.geuploadDoor));
    geuploadDoorNaam = u?.naam ?? null;
  }
  const goedgekeurd = kerncijfers.filter((k) => k.status === "approved" && !k.uitgesloten).length;

  return {
    ...mapDocument(doc, {
      aantalKerncijfers: kerncijfers.length,
      aantalGoedgekeurd: goedgekeurd,
      geuploadDoorNaam,
    }),
    ai_bewijs: doc.aiBewijs ? (JSON.parse(String(doc.aiBewijs)) as unknown[]) : [],
    kerncijfers: kerncijfers.map(mapKerncijfer),
    logboek: logboek.map(mapLog),
  };
}

// ── DETAIL ─────────────────────────────────────────────────────────────────────
router.get("/financieel/jaarrekeningen/:id", requireAuth, lezen, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params.id);
    const detail = await bouwDetail(id);
    if (!detail) return void res.status(404).json({ error: "Niet gevonden" });
    res.json(detail);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── METADATA / DATASET-STATUS BIJWERKEN ────────────────────────────────────────
router.patch("/financieel/jaarrekeningen/:id", requireAuth, schrijven, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params.id);
    const [bestaand] = await db.select().from(financieleDocumentenTable).where(eq(financieleDocumentenTable.id, id));
    if (!bestaand) return void res.status(404).json({ error: "Niet gevonden" });
    const gebruikerId = req.session.userId ?? null;

    const set: Partial<typeof financieleDocumentenTable.$inferInsert> = { bijgewerktOp: new Date() };
    if (req.body.titel !== undefined) set.titel = req.body.titel;
    if (req.body.entiteit !== undefined) set.entiteit = req.body.entiteit;
    if (req.body.boekjaar !== undefined) set.boekjaar = req.body.boekjaar;
    if (req.body.subtype !== undefined) set.subtype = req.body.subtype;
    if (req.body.documentstatus !== undefined) set.documentstatus = req.body.documentstatus;

    // Opslaglocatie meebewegen als subtype/boekjaar wijzigt (ook bij leegmaken naar null).
    if (req.body.subtype !== undefined || req.body.boekjaar !== undefined) {
      const nieuwSubtype = (req.body.subtype !== undefined ? req.body.subtype : bestaand.subtype) as string;
      const nieuwBoekjaar = (req.body.boekjaar !== undefined ? req.body.boekjaar : bestaand.boekjaar) as number | null;
      set.opslaglocatie = bepaalOpslaglocatie(nieuwSubtype, nieuwBoekjaar);
    }

    const nieuweDatasetStatus = req.body.dataset_status as string | undefined;

    // Alle schrijfacties in één transactie: documentupdate, dataset-statuscascade en
    // metadatacascade horen atomair te zijn — anders kunnen de gedenormaliseerde
    // kerncijferkolommen (entiteit/boekjaar/geconsolideerd) van het document afwijken.
    await db.transaction(async (tx) => {
      if (nieuweDatasetStatus !== undefined) {
        set.datasetStatus = nieuweDatasetStatus;
        if (nieuweDatasetStatus === "approved") {
          set.goedgekeurdDoor = gebruikerId;
          set.goedgekeurdOp = new Date();
          // Alle niet-uitgesloten, niet-afgewezen cijfers meenemen naar approved.
          await tx
            .update(financieleKerncijfersTable)
            .set({ status: "approved", beoordeeldDoor: gebruikerId, beoordeeldOp: new Date(), bijgewerktOp: new Date() })
            .where(
              and(
                eq(financieleKerncijfersTable.documentId, id),
                eq(financieleKerncijfersTable.uitgesloten, false),
                sql`${financieleKerncijfersTable.status} not in ('rejected')`,
              ),
            );
          await logActie(id, "dataset_goedgekeurd", gebruikerId, "Dataset goedgekeurd; kerncijfers voeden het meerjarenoverzicht", tx);
        } else if (nieuweDatasetStatus === "rejected") {
          await tx
            .update(financieleKerncijfersTable)
            .set({ status: "rejected", beoordeeldDoor: gebruikerId, beoordeeldOp: new Date(), bijgewerktOp: new Date() })
            .where(eq(financieleKerncijfersTable.documentId, id));
          await logActie(id, "dataset_afgewezen", gebruikerId, "Dataset afgewezen", tx);
        } else if (nieuweDatasetStatus === "reviewed") {
          await logActie(id, "dataset_beoordeeld", gebruikerId, "Dataset gemarkeerd als beoordeeld", tx);
        }
      } else {
        await logActie(id, "metadata_gewijzigd", gebruikerId, "Metadata bijgewerkt", tx);
      }

      await tx.update(financieleDocumentenTable).set(set).where(eq(financieleDocumentenTable.id, id));

      // Cascade: de kerncijfers zijn gedenormaliseerd (entiteit/boekjaar/geconsolideerd)
      // voor het meerjarenoverzicht. Als die metadata op het document wijzigt, moeten
      // ALLE bijbehorende kerncijfers meebewegen — anders blijven goedgekeurde cijfers
      // onder het oude boekjaar/de oude entiteit staan en klopt het meerjarenoverzicht niet.
      const metadataGewijzigd =
        req.body.entiteit !== undefined || req.body.boekjaar !== undefined || req.body.subtype !== undefined;
      if (metadataGewijzigd) {
        const nieuweEntiteit = req.body.entiteit !== undefined ? (req.body.entiteit as string | null) : bestaand.entiteit;
        const nieuwBoekjaarCascade = req.body.boekjaar !== undefined ? (req.body.boekjaar as number | null) : bestaand.boekjaar;
        const nieuwSubtypeCascade = req.body.subtype !== undefined ? (req.body.subtype as string) : bestaand.subtype;
        await tx
          .update(financieleKerncijfersTable)
          .set({
            entiteit: nieuweEntiteit,
            boekjaar: nieuwBoekjaarCascade,
            geconsolideerd: nieuwSubtypeCascade === "geconsolideerd",
            bijgewerktOp: new Date(),
          })
          .where(eq(financieleKerncijfersTable.documentId, id));
        await logActie(
          id,
          "metadata_gewijzigd",
          gebruikerId,
          `Kerncijfers meegetrokken naar ${nieuweEntiteit ?? "onbekende entiteit"} / boekjaar ${nieuwBoekjaarCascade ?? "onbekend"} / ${nieuwSubtypeCascade}`,
          tx,
        );
      }
    });

    const detail = await bouwDetail(id);
    res.json(detail);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── (HER)EXTRACTIE ─────────────────────────────────────────────────────────────
router.post("/financieel/jaarrekeningen/:id/extraheer", requireAuth, schrijven, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params.id);
    const [doc] = await db.select().from(financieleDocumentenTable).where(eq(financieleDocumentenTable.id, id));
    if (!doc) return void res.status(404).json({ error: "Niet gevonden" });
    const gebruikerId = req.session.userId ?? null;

    await db
      .update(financieleDocumentenTable)
      .set({ extractieStatus: "bezig", bijgewerktOp: new Date() })
      .where(eq(financieleDocumentenTable.id, id));

    let tekst: string | null = null;
    try {
      const file = await objectStorage.getObjectEntityFile(doc.bestandspad);
      const resp = await objectStorage.downloadObject(file);
      const buffer = Buffer.from(await resp.arrayBuffer());
      tekst = await tekstUitBuffer(buffer, doc.mimetype);
    } catch (err) {
      req.log.warn({ err }, "Bestand niet opnieuw leesbaar voor extractie");
    }

    const resultaat = await extraheerKerncijfers({ tekst, gebruikerId });
    const aantal = await vervangKerncijfers(id, doc.entiteit, doc.boekjaar, doc.subtype === "geconsolideerd", resultaat.cijfers);
    await db
      .update(financieleDocumentenTable)
      .set({ extractieStatus: "voltooid", datasetStatus: "proposed", goedgekeurdDoor: null, goedgekeurdOp: null, bijgewerktOp: new Date() })
      .where(eq(financieleDocumentenTable.id, id));
    await logActie(id, "geextraheerd", gebruikerId, `${aantal} kerncijfers opnieuw voorgesteld via ${resultaat.methode}`);

    const detail = await bouwDetail(id);
    res.json(detail);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── DOWNLOAD (gated + gelogd) ──────────────────────────────────────────────────
router.get("/financieel/jaarrekeningen/:id/download", requireAuth, lezen, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params.id);
    const [doc] = await db.select().from(financieleDocumentenTable).where(eq(financieleDocumentenTable.id, id));
    if (!doc) return void res.status(404).json({ error: "Niet gevonden" });
    const gebruikerId = req.session.userId ?? null;

    const file = await objectStorage.getObjectEntityFile(doc.bestandspad);
    const resp = await objectStorage.downloadObject(file);
    const buffer = Buffer.from(await resp.arrayBuffer());
    await logActie(id, "gedownload", gebruikerId, `Bestand "${doc.bestandsnaam}" gedownload`);

    res.setHeader("Content-Type", doc.mimetype);
    res.setHeader("Content-Disposition", `attachment; filename="${doc.bestandsnaam.replace(/[^a-zA-Z0-9._-]/g, "_")}"`);
    res.send(buffer);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Bestand niet beschikbaar" });
  }
});

// ── KERNCIJFER BEOORDELEN / CORRIGEREN ─────────────────────────────────────────
router.patch("/financieel/kerncijfers/:id", requireAuth, schrijven, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params.id);
    const [bestaand] = await db.select().from(financieleKerncijfersTable).where(eq(financieleKerncijfersTable.id, id));
    if (!bestaand) return void res.status(404).json({ error: "Niet gevonden" });
    const gebruikerId = req.session.userId ?? null;

    const set: Partial<typeof financieleKerncijfersTable.$inferInsert> = { bijgewerktOp: new Date() };
    if (req.body.status !== undefined) {
      set.status = req.body.status;
      set.beoordeeldDoor = gebruikerId;
      set.beoordeeldOp = new Date();
    }
    if (req.body.uitgesloten !== undefined) set.uitgesloten = req.body.uitgesloten;
    if (req.body.label !== undefined) set.label = req.body.label;
    if (req.body.eenheid !== undefined) set.eenheid = req.body.eenheid;
    if (req.body.waarde !== undefined) {
      // Handmatige correctie: bewaar de oorspronkelijke waarde eenmalig.
      if (!bestaand.handmatigAangepast) set.oorspronkelijkeWaarde = bestaand.waarde;
      set.waarde = req.body.waarde === null ? null : String(req.body.waarde);
      set.handmatigAangepast = true;
    }

    await db.update(financieleKerncijfersTable).set(set).where(eq(financieleKerncijfersTable.id, id));

    const actie =
      req.body.status === "approved"
        ? "cijfer_goedgekeurd"
        : req.body.status === "rejected"
          ? "cijfer_afgewezen"
          : "cijfer_aangepast";
    await logActie(bestaand.documentId, actie, gebruikerId, `Kerncijfer "${bestaand.label}" (${bestaand.sleutel})`);

    const [ververst] = await db.select().from(financieleKerncijfersTable).where(eq(financieleKerncijfersTable.id, id));
    res.json(mapKerncijfer(ververst));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── MEERJARENOVERZICHT (alleen goedgekeurde cijfers) ───────────────────────────
router.get("/financieel/meerjarenoverzicht", requireAuth, lezen, async (req, res): Promise<void> => {
  try {
    const gevraagdeEntiteit = req.query.entiteit ? String(req.query.entiteit) : null;
    const geconsolideerdFilter =
      req.query.geconsolideerd === "true" || req.query.geconsolideerd === "1"
        ? true
        : req.query.geconsolideerd === "false" || req.query.geconsolideerd === "0"
          ? false
          : null;

    // Alleen goedgekeurde, niet-uitgesloten cijfers van actuele documenten voeden het overzicht.
    const filters = [
      eq(financieleKerncijfersTable.status, "approved"),
      eq(financieleKerncijfersTable.uitgesloten, false),
      eq(financieleDocumentenTable.isActueel, true),
    ];
    if (gevraagdeEntiteit) filters.push(eq(financieleKerncijfersTable.entiteit, gevraagdeEntiteit));
    if (geconsolideerdFilter !== null) filters.push(eq(financieleKerncijfersTable.geconsolideerd, geconsolideerdFilter));

    const rijen = await db
      .select({
        entiteit: financieleKerncijfersTable.entiteit,
        boekjaar: financieleKerncijfersTable.boekjaar,
        sleutel: financieleKerncijfersTable.sleutel,
        label: financieleKerncijfersTable.label,
        eenheid: financieleKerncijfersTable.eenheid,
        waarde: financieleKerncijfersTable.waarde,
      })
      .from(financieleKerncijfersTable)
      .innerJoin(financieleDocumentenTable, eq(financieleKerncijfersTable.documentId, financieleDocumentenTable.id))
      .where(and(...filters));

    // Beschikbare entiteiten (voor de keuzelijst).
    const entiteitenSet = new Set<string>();
    const alleEntiteiten = await db
      .selectDistinct({ entiteit: financieleKerncijfersTable.entiteit })
      .from(financieleKerncijfersTable)
      .innerJoin(financieleDocumentenTable, eq(financieleKerncijfersTable.documentId, financieleDocumentenTable.id))
      .where(
        and(
          eq(financieleKerncijfersTable.status, "approved"),
          eq(financieleKerncijfersTable.uitgesloten, false),
          eq(financieleDocumentenTable.isActueel, true),
        ),
      );
    for (const e of alleEntiteiten) if (e.entiteit) entiteitenSet.add(e.entiteit);

    // Rijen groeperen per sleutel; waarden per boekjaar.
    const jaarSet = new Set<number>();
    const perSleutel = new Map<string, { label: string; eenheid: string; waarden: Map<number, number> }>();
    for (const r of rijen) {
      if (r.boekjaar === null) continue;
      jaarSet.add(r.boekjaar);
      let bucket = perSleutel.get(r.sleutel);
      if (!bucket) {
        bucket = { label: r.label, eenheid: r.eenheid, waarden: new Map() };
        perSleutel.set(r.sleutel, bucket);
      }
      const w = numOfNull(r.waarde);
      if (w !== null) bucket.waarden.set(r.boekjaar, w);
    }

    const boekjaren = [...jaarSet].sort((a, b) => a - b);

    const rijenUit = [...perSleutel.entries()].map(([sleutel, b]) => {
      const waardenObj: Record<string, number | null> = {};
      for (const j of boekjaren) waardenObj[String(j)] = b.waarden.has(j) ? b.waarden.get(j)! : null;
      // Trend: laatste twee opeenvolgende jaren met een waarde.
      let trendPct: number | null = null;
      const metWaarde = boekjaren.filter((j) => b.waarden.has(j));
      if (metWaarde.length >= 2) {
        const laatste = metWaarde[metWaarde.length - 1];
        const vorige = metWaarde[metWaarde.length - 2];
        const nieuw = b.waarden.get(laatste)!;
        const oud = b.waarden.get(vorige)!;
        if (oud !== 0) trendPct = Math.round(((nieuw - oud) / Math.abs(oud)) * 1000) / 10;
      }
      return { sleutel, label: b.label, eenheid: b.eenheid, waarden: waardenObj, trend_pct: trendPct };
    });

    // Signalen: opvallende dalingen/stijgingen en zwakke solvabiliteit/liquiditeit.
    const signalen: { niveau: string; sleutel: string; boekjaar: number; bericht: string }[] = [];
    for (const rij of rijenUit) {
      const metWaarde = boekjaren.filter((j) => rij.waarden[String(j)] !== null);
      if (rij.trend_pct !== null && metWaarde.length >= 2) {
        const laatsteJaar = metWaarde[metWaarde.length - 1];
        if ((rij.sleutel === "omzet" || rij.sleutel === "resultaat_na_belasting") && rij.trend_pct <= -10) {
          signalen.push({ niveau: "waarschuwing", sleutel: rij.sleutel, boekjaar: laatsteJaar, bericht: `${rij.label} daalde ${Math.abs(rij.trend_pct)}% ten opzichte van het vorige jaar` });
        } else if (Math.abs(rij.trend_pct) >= 25) {
          signalen.push({ niveau: "let_op", sleutel: rij.sleutel, boekjaar: laatsteJaar, bericht: `${rij.label} veranderde ${rij.trend_pct}% ten opzichte van het vorige jaar` });
        }
      }
      // Solvabiliteit/current ratio drempels op het laatste beschikbare jaar.
      const laatste = metWaarde[metWaarde.length - 1];
      if (laatste !== undefined) {
        const w = rij.waarden[String(laatste)];
        if (rij.sleutel === "solvabiliteit" && w !== null && w < 25) {
          signalen.push({ niveau: "waarschuwing", sleutel: rij.sleutel, boekjaar: laatste, bericht: `Solvabiliteit is ${w}% (onder de richtwaarde van 25%)` });
        }
        if (rij.sleutel === "current_ratio" && w !== null && w < 1) {
          signalen.push({ niveau: "waarschuwing", sleutel: rij.sleutel, boekjaar: laatste, bericht: `Current ratio is ${w} (onder 1: mogelijke liquiditeitsdruk)` });
        }
      }
    }

    res.json({
      entiteiten: [...entiteitenSet].sort(),
      geselecteerde_entiteit: gevraagdeEntiteit,
      boekjaren,
      rijen: rijenUit,
      signalen,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
