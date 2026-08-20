import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import crypto from "node:crypto";
import {
  db,
  documentenTable,
  documentToepassingenTable,
  documentKoppelingenTable,
  documentGoedkeuringenTable,
  documentLogboekTable,
  labelsTable,
  labelApplicatiesTable,
  opdrachtenTable,
  documentMigratieInventarisTable,
} from "@workspace/db";
import { eq, and, ne, asc, desc, inArray, max, sql } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import {
  mapDocument,
  mapDocumenten,
  mapKoppelingen,
  mapGoedkeuringen,
  mapLogboekRegel,
  syncDocumentToepassingen,
  isDocumentType,
  isProductrapportType,
  isDocumentStatus,
  isGoedkeuringStatus,
  isKoppelingDoelType,
  isGetestVoor,
  geldigeProductrapportLabelIds,
  isZichtbaarProductrapport,
  valideerProductrapportBestemming,
  zichtbareProductrapportDocumentIds,
} from "../lib/documenten";
import { logDocumentActie } from "../lib/document-logboek";
import { invalideerContext } from "../lib/aiContext/cache";
import { analyseerDocumentTekst, stelToepassingenVoor } from "../services/document-ai";
import { scanBestandMetadata, koppelDocumentAanScan } from "../services/security-intake-engine";
import { ObjectStorageService } from "../lib/objectStorage";
import { extraheerPdfTekst } from "../lib/pdfTekst";
import { logger } from "../lib/logger";
import type { DocumentType } from "../lib/documenten";
import {
  haalZichtbaarProductrapport,
  magContextDoel,
  magDocumentLezen,
} from "../lib/document-toegang";

const router = Router();

const objectStorage = new ObjectStorageService();
const uploadEnkel = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

/** Uploadcategorie → opgeslagen documenttype. Productrapportcategorieën komen
 * alleen met een toepassing in Productrapporten. Contextcategorieën worden
 * uitsluitend met een concrete, gevalideerde doelkoppeling opgeslagen.
 */
const AANLEVER_CATEGORIE_NAAR_TYPE: Record<string, DocumentType> = {
  eta: "eta",
  classificatierapport: "classificatierapport",
  dop: "dop",
  testrapport: "testrapport",
  certificaat: "productcertificaat",
  productcertificaat: "productcertificaat",
  productdocument: "productblad",
  productblad: "productblad",
  verwerkingsvoorschrift: "verwerkingsvoorschrift",
  snagstream: "opleverrapport",
  tekening: "tekening",
  contract: "contract",
  verzekering: "verzekering",
  // AKKOORD_01 §5: opdrachtbevestiging behoudt haar eigen documenttype zodat
  // ze als grond B-akkoordbewijs aan een opdracht gekoppeld kan worden.
  opdrachtbevestiging: "opdrachtbevestiging",
  adviesrapport: "overig",
  bibliotheek: "overig",
  offerte: "overig",
  factuur: "overig",
  aanvraag: "overig",
  personeelsdocument: "overig",
  document_sjabloon: "overig",
  algemeen: "overig",
  onbekend: "overig",
};

async function eisZichtbaarProductrapport(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const document = await haalZichtbaarProductrapport(
    parseInt(String(req.params.id)),
  );
  if (!document) {
    res.status(404).json({ error: "Productrapport niet gevonden" });
    return;
  }
  res.locals.productrapport = document;
  next();
}

// POST /documenten/ai-analyse — AI-voorstel voor documentmetadata o.b.v. tekst (beheerder)
router.post("/documenten/ai-analyse", requireBevoegdheid("bibliotheek", 3), async (req, res): Promise<void> => {
  try {
    const tekst = typeof req.body?.tekst === "string" ? req.body.tekst : "";
    const bestandsnaam =
      typeof req.body?.bestandsnaam === "string" ? req.body.bestandsnaam : null;
    const resultaat = await analyseerDocumentTekst(tekst, bestandsnaam, {
      gebruikerId: req.session.userId ?? null,
      // document_id wordt doorgegeven als de aanroeper een bestaand document heranalyseert;
      // bij een nieuwe upload is het document nog niet opgeslagen en is document_id null.
      document_id: typeof req.body?.document_id === "number" ? req.body.document_id : null,
    });

    // Stel passende toepassingen voor op basis van de herkende terminologie.
    const labels = await db
      .select()
      .from(labelsTable)
      .where(eq(labelsTable.gearchiveerd, false));
    const geldigeLabelIds = new Set(
      await geldigeProductrapportLabelIds(labels.map((label) => label.id)),
    );
    const toepassing_suggesties = stelToepassingenVoor(
      resultaat,
      labels.filter((label) => geldigeLabelIds.has(label.id)),
    );

    return void res.json({ ...resultaat, toepassing_suggesties });
  } catch (err) {
    req.log.error(err);
    return void res.status(500).json({ error: "AI-analyse mislukte" });
  }
});

// POST /documenten/ai-koppelvoorstellen — AI-voorstellen om bestaande bibliotheekdocumenten
// aan toepassingen te koppelen. Ongeanaliseerde PDFs worden automatisch eerst verrijkt
// (fabrikant/product/norm extractie) zodat de matcher iets heeft om mee te werken.
// Maximaal MAX_AUTO_ANALYSE documenten per aanroep om de responstijd beheersbaar te houden.
// Voorstellen; de beheerder neemt over. (beheerder)
const MAX_AUTO_ANALYSE = 15;

router.post(
  "/documenten/ai-koppelvoorstellen",
  requireBevoegdheid("bibliotheek", 3),
  async (req, res): Promise<void> => {
    try {
      const documenten = await db
        .select()
        .from(documentenTable)
        .orderBy(asc(documentenTable.naam));
      const actueel = documenten.filter(
        (d) =>
          isProductrapportType(d.documenttype) &&
          d.status === "actueel" &&
          !d.gearchiveerd,
      );

      const labels = await db
        .select()
        .from(labelsTable)
        .where(eq(labelsTable.gearchiveerd, false));
      const geldigeLabelIds = new Set(
        await geldigeProductrapportLabelIds(labels.map((label) => label.id)),
      );
      const productLabels = labels.filter((label) => geldigeLabelIds.has(label.id));

      const koppelingen = await db
        .select({
          documentId: documentToepassingenTable.documentId,
          labelId: documentToepassingenTable.labelId,
        })
        .from(documentToepassingenTable);
      const reedsGekoppeld = new Map<number, Set<number>>();
      for (const k of koppelingen) {
        if (!reedsGekoppeld.has(k.documentId)) reedsGekoppeld.set(k.documentId, new Set());
        reedsGekoppeld.get(k.documentId)!.add(k.labelId);
      }

      // Automatisch verrijken: documenten zonder enige opgeslagen metadata worden
      // opgehaald uit object storage, geanalyseerd en bijgewerkt zodat de matcher
      // iets heeft om op te scoren. Cap zodat de responstijd beheersbaar blijft.
      const teAnalyseren = actueel
        .filter((d) => !d.fabrikant && !d.product && !d.enNorm && d.pdfUrl)
        .slice(0, MAX_AUTO_ANALYSE);

      for (const d of teAnalyseren) {
        try {
          const file = await objectStorage.getObjectEntityFile(d.pdfUrl!);
          const stream = file.createReadStream();
          const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
            const chunks: Buffer[] = [];
            stream.on("data", (chunk: unknown) =>
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as ArrayBufferLike)),
            );
            stream.on("end", () => resolve(Buffer.concat(chunks)));
            stream.on("error", (err: Error) => reject(err));
          });
          const extractie = await extraheerPdfTekst(pdfBuffer);
          if (!extractie.tekst) continue;
          const analyse = await analyseerDocumentTekst(extractie.tekst, d.naam, {
            module: "bibliotheek",
            functie: "koppelvoorstel-verrijking",
          });
          const verrijking: {
            fabrikant?: string | null;
            product?: string | null;
            enNorm?: string | null;
            rapportnummer?: string | null;
          } = {};
          if (analyse.fabrikant) verrijking.fabrikant = analyse.fabrikant;
          if (analyse.product) verrijking.product = analyse.product;
          if (analyse.en_norm) verrijking.enNorm = analyse.en_norm;
          if (analyse.rapportnummer) verrijking.rapportnummer = analyse.rapportnummer;
          if (Object.keys(verrijking).length > 0) {
            await db
              .update(documentenTable)
              .set(verrijking)
              .where(eq(documentenTable.id, d.id));
            // In-memory bijwerken zodat de matcher hieronder de verse waarden ziet.
            Object.assign(d, verrijking);
          }
        } catch (err) {
          req.log.warn(
            { err, documentId: d.id },
            "Auto-verrijking bij koppelvoorstel mislukt — document overgeslagen",
          );
        }
      }

      const voorstellen = [];
      for (const d of actueel) {
        const huidige = reedsGekoppeld.get(d.id) ?? new Set<number>();
        const suggesties = stelToepassingenVoor(
          { fabrikant: d.fabrikant, product: d.product, en_norm: d.enNorm, naam: d.naam },
          productLabels,
        ).filter((s) => !huidige.has(s.label_id));
        if (suggesties.length > 0) {
          voorstellen.push({
            document_id: d.id,
            document_naam: d.naam,
            documenttype: d.documenttype,
            fabrikant: d.fabrikant,
            huidige_toepassing_ids: [...huidige],
            suggesties,
          });
        }
      }

      return void res.json(voorstellen);
    } catch (err) {
      req.log.error(err);
      return void res.status(500).json({ error: "AI-koppelvoorstellen mislukten" });
    }
  },
);

// ── CENTRALE DOCUMENTBIBLIOTHEEK ────────────────────────────────────────────
// GET /documenten — lijst met filters
router.get("/documenten", requireBevoegdheid("bibliotheek", 1), async (req, res): Promise<void> => {
  try {
    const {
      zoek,
      documenttype,
      goedkeuring_status,
      fabrikant,
      voorziening_type_code,
      label_id,
    } = req.query;

    let rows = await db.select().from(documentenTable).orderBy(asc(documentenTable.naam));
    const zichtbareIds = await zichtbareProductrapportDocumentIds();
    rows = rows.filter((d) => isZichtbaarProductrapport(d, zichtbareIds));

    if (documenttype) rows = rows.filter((d) => d.documenttype === documenttype);
    if (goedkeuring_status) rows = rows.filter((d) => d.goedkeuringStatus === goedkeuring_status);
    if (fabrikant) {
      const q = String(fabrikant).toLowerCase();
      rows = rows.filter((d) => (d.fabrikant ?? "").toLowerCase().includes(q));
    }
    if (zoek) {
      const q = String(zoek).toLowerCase().trim();
      if (q) {
        rows = rows.filter((d) =>
          [d.naam, d.fabrikant, d.rapportnummer, d.enNorm, d.product].some((v) =>
            (v ?? "").toLowerCase().includes(q),
          ),
        );
      }
    }
    if (voorziening_type_code) {
      const koppel = await db
        .select({ documentId: documentToepassingenTable.documentId })
        .from(documentToepassingenTable)
        .innerJoin(labelApplicatiesTable, eq(labelApplicatiesTable.labelId, documentToepassingenTable.labelId))
        .where(eq(labelApplicatiesTable.typeCode, String(voorziening_type_code)));
      const ids = new Set(koppel.map((k) => k.documentId));
      rows = rows.filter((d) => ids.has(d.id));
    }
    if (label_id) {
      const lid = parseInt(String(label_id));
      const koppel = await db
        .select({ documentId: documentToepassingenTable.documentId })
        .from(documentToepassingenTable)
        .where(eq(documentToepassingenTable.labelId, lid));
      const ids = new Set(koppel.map((k) => k.documentId));
      rows = rows.filter((d) => ids.has(d.id));
    }

    res.json(await mapDocumenten(rows));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /documenten/controleer-duplicaat — waarschuwt bij mogelijke duplicaten (beheerder)
router.post(
  "/documenten/controleer-duplicaat",
  requireBevoegdheid("bibliotheek", 3),
  async (req, res): Promise<void> => {
    try {
      const b = req.body ?? {};
      const hash = typeof b.bestands_hash === "string" ? b.bestands_hash.trim() : "";
      const naam = typeof b.naam === "string" ? b.naam.trim().toLowerCase() : "";
      const rapportnummer =
        typeof b.rapportnummer === "string" ? b.rapportnummer.trim().toLowerCase() : "";

      const alle = await db
        .select()
        .from(documentenTable)
        .where(eq(documentenTable.gearchiveerd, false));
      const productrapporten = alle.filter((d) => isProductrapportType(d.documenttype));

      const treffers: { row: (typeof alle)[number]; reden: string }[] = [];
      for (const d of productrapporten) {
        let reden: string | null = null;
        if (hash && d.bestandsHash && d.bestandsHash === hash) reden = "identiek_bestand";
        else if (
          rapportnummer &&
          d.rapportnummer &&
          d.rapportnummer.trim().toLowerCase() === rapportnummer
        )
          reden = "gelijk_rapportnummer";
        else if (naam && d.naam.trim().toLowerCase() === naam) reden = "gelijke_naam";
        if (reden) treffers.push({ row: d, reden });
      }

      const docs = await mapDocumenten(treffers.map((t) => t.row));
      const mogelijke_duplicaten = treffers.map((t, i) => ({
        document: docs[i],
        reden: t.reden,
      }));
      return void res.json({ mogelijke_duplicaten });
    } catch (err) {
      req.log.error(err);
      return void res.status(500).json({ error: "Interne serverfout" });
    }
  },
);

// GET /documenten/signaleringen — documenten die aandacht nodig hebben
router.get("/documenten/signaleringen", requireBevoegdheid("bibliotheek", 1), async (req, res): Promise<void> => {
  try {
    const rows = await db
      .select()
      .from(documentenTable)
      .where(eq(documentenTable.gearchiveerd, false));
    const zichtbareIds = await zichtbareProductrapportDocumentIds();
    const productrapporten = rows.filter((d) =>
      isZichtbaarProductrapport(d, zichtbareIds),
    );

    const vandaag = new Date();
    vandaag.setHours(0, 0, 0, 0);
    const grens = new Date(vandaag);
    grens.setDate(grens.getDate() + 90);

    const verlopen: typeof productrapporten = [];
    const binnenkort: typeof productrapporten = [];
    for (const d of productrapporten) {
      if (!d.geldigTot) continue;
      const dt = new Date(d.geldigTot);
      if (Number.isNaN(dt.getTime())) continue;
      if (dt < vandaag) verlopen.push(d);
      else if (dt <= grens) binnenkort.push(d);
    }
    const controle_nodig: typeof productrapporten = [];
    const ter_goedkeuring = productrapporten.filter(
      (d) => d.goedkeuringStatus === "ter_goedkeuring",
    );

    return void res.json({
      verlopen: await mapDocumenten(verlopen),
      binnenkort: await mapDocumenten(binnenkort),
      controle_nodig: await mapDocumenten(controle_nodig),
      ter_goedkeuring: await mapDocumenten(ter_goedkeuring),
    });
  } catch (err) {
    req.log.error(err);
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /documenten/logboek — globaal audittrail (beheerder)
router.get("/documenten/logboek", requireBevoegdheid("bibliotheek", 4), async (req, res): Promise<void> => {
  try {
    const ruw = parseInt(String(req.query.limiet ?? "100"));
    const limiet = Math.min(Math.max(Number.isFinite(ruw) ? ruw : 100, 1), 500);
    const rows = await db
      .select()
      .from(documentLogboekTable)
      .orderBy(desc(documentLogboekTable.tijdstip))
      .limit(Math.max(limiet * 5, 500));
    const zichtbareIds = await zichtbareProductrapportDocumentIds();
    return void res.json(
      rows
        .filter((row) => row.documentId != null && zichtbareIds.has(row.documentId))
        .slice(0, limiet)
        .map(mapLogboekRegel),
    );
  } catch (err) {
    req.log.error(err);
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /documenten/gekoppeld — documenten gekoppeld aan een entiteit
router.get("/documenten/gekoppeld", async (req, res): Promise<void> => {
  try {
    const doelType = String(req.query.doel_type ?? "");
    const doelId = parseInt(String(req.query.doel_id ?? ""));
    if (!isKoppelingDoelType(doelType) || !Number.isInteger(doelId)) {
      return void res.status(400).json({ error: "doel_type en doel_id zijn verplicht" });
    }
    if (!(await magContextDoel(req, doelType, doelId, 1))) {
      return void res.status(403).json({
        error: "Geen toegang tot documenten van deze bestemming.",
      });
    }
    const koppel = await db
      .select({ documentId: documentKoppelingenTable.documentId })
      .from(documentKoppelingenTable)
      .where(
        and(
          eq(documentKoppelingenTable.doelType, doelType),
          eq(documentKoppelingenTable.doelId, doelId),
        ),
      );
    const ids = koppel.map((k) => k.documentId);
    if (ids.length === 0) return void res.json([]);
    const rows = await db.select().from(documentenTable).where(inArray(documentenTable.id, ids));
    return void res.json(await mapDocumenten(rows));
  } catch (err) {
    req.log.error(err);
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /documenten/herstelwerk — inventaris van algemene/ambigue documenten.
// Deze records blijven buiten Productrapporten en worden alleen ter handmatige
// routering getoond; deze route wijzigt geen document of object.
router.get(
  "/documenten/herstelwerk",
  requireBevoegdheid("bibliotheek", 2),
  async (req, res): Promise<void> => {
    try {
      const rows = await db
        .select({
          documentId: documentMigratieInventarisTable.documentId,
          naam: documentenTable.naam,
          documenttype: documentenTable.documenttype,
          classificatie: documentMigratieInventarisTable.classificatie,
          status: documentMigratieInventarisTable.status,
          voorgesteldeBestemming:
            documentMigratieInventarisTable.voorgesteldeBestemming,
          snapPdfUrl: documentMigratieInventarisTable.snapPdfUrl,
          snapBestandsHash: documentMigratieInventarisTable.snapBestandsHash,
          snapGroepId: documentMigratieInventarisTable.snapGroepId,
          snapRevisieNummer:
            documentMigratieInventarisTable.snapRevisieNummer,
        })
        .from(documentMigratieInventarisTable)
        .innerJoin(
          documentenTable,
          eq(documentenTable.id, documentMigratieInventarisTable.documentId),
        )
        .where(
          eq(documentMigratieInventarisTable.classificatie, "herstelwerk"),
        )
        .orderBy(asc(documentenTable.naam));
      return void res.json(
        rows.map((row) => ({
          document_id: row.documentId,
          naam: row.naam,
          documenttype: row.documenttype,
          classificatie: row.classificatie,
          status: row.status,
          voorgestelde_bestemming: row.voorgesteldeBestemming,
          snap_pdf_url: row.snapPdfUrl,
          snap_bestands_hash: row.snapBestandsHash,
          snap_groep_id: row.snapGroepId,
          snap_revisie_nummer: row.snapRevisieNummer,
        })),
      );
    } catch (err) {
      req.log.error(err);
      return void res.status(500).json({ error: "Interne serverfout" });
    }
  },
);

// GET /documenten/:id — detail
router.get(
  "/documenten/:id",
  requireBevoegdheid("bibliotheek", 1),
  eisZichtbaarProductrapport,
  async (_req, res): Promise<void> => {
  try {
    return void res.json(await mapDocument(res.locals.productrapport));
  } catch (err) {
    res.req.log.error(err);
    return void res.status(500).json({ error: "Interne serverfout" });
  }
  },
);

// GET /documenten/:id/revisies — revisiehistorie van de documentgroep
router.get(
  "/documenten/:id/revisies",
  requireBevoegdheid("bibliotheek", 1),
  eisZichtbaarProductrapport,
  async (req, res): Promise<void> => {
  try {
    const d = res.locals.productrapport;
    const rows = await db
      .select()
      .from(documentenTable)
      .where(eq(documentenTable.groepId, d.groepId))
      .orderBy(asc(documentenTable.revisieNummer));
    return void res.json(await mapDocumenten(rows));
  } catch (err) {
    req.log.error(err);
    return void res.status(500).json({ error: "Interne serverfout" });
  }
  },
);

// POST /documenten/:id/ai-invullen — PDF uit object storage ophalen, AI-analyse uitvoeren en velden opslaan (beheerder)
router.post("/documenten/:id/ai-invullen", requireBevoegdheid("bibliotheek", 3), eisZichtbaarProductrapport, async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id));
    const [d] = await db.select().from(documentenTable).where(eq(documentenTable.id, id));
    if (!d) return void res.status(404).json({ error: "Document niet gevonden" });
    if (!d.pdfUrl) {
      return void res.status(422).json({ error: "Dit document heeft geen PDF-bestand." });
    }

    // PDF ophalen uit object storage
    let pdfBuffer: Buffer;
    try {
      const file = await objectStorage.getObjectEntityFile(d.pdfUrl);
      const stream = file.createReadStream();
      pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        stream.on("data", (chunk: unknown) =>
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as ArrayBufferLike)),
        );
        stream.on("end", () => resolve(Buffer.concat(chunks)));
        stream.on("error", (err: Error) => reject(err));
      });
    } catch (err) {
      req.log.warn({ err, documentId: id }, "PDF niet beschikbaar in object storage");
      return void res.status(422).json({ error: "Het PDF-bestand is niet beschikbaar in de opslag." });
    }

    // Tekst extraheren
    const extractie = await extraheerPdfTekst(pdfBuffer);
    if (!extractie.tekst) {
      return void res.status(422).json({
        error: "De PDF bevat geen leesbare tekst (mogelijk een gescand document zonder tekstlaag).",
      });
    }

    // AI-analyse
    const analyse = await analyseerDocumentTekst(extractie.tekst, d.naam, {
      gebruikerId: req.session.userId ?? null,
      document_id: id,
    });

    // Controleer of de AI überhaupt iets herkende
    const heeftResultaat =
      analyse.fabrikant != null ||
      analyse.product != null ||
      analyse.en_norm != null ||
      analyse.rapportnummer != null ||
      analyse.revisie != null ||
      analyse.datum != null ||
      analyse.getest_voor != null;

    if (!heeftResultaat) {
      return void res.status(422).json({
        error:
          analyse.toelichting ??
          "De AI kon geen metadatavelden herkennen in dit document. Vul de velden handmatig in.",
      });
    }

    // Gevonden velden opslaan (alleen niet-null waarden overschrijven)
    const update: Partial<{
      fabrikant: string | null;
      product: string | null;
      enNorm: string | null;
      rapportnummer: string | null;
      revisie: string | null;
      datum: string | null;
      getestVoor: string | null;
      aiGeanalyseerd: boolean;
      bijgewerktOp: Date;
    }> = { aiGeanalyseerd: true, bijgewerktOp: new Date() };
    if (analyse.fabrikant != null) update.fabrikant = analyse.fabrikant;
    if (analyse.product != null) update.product = analyse.product;
    if (analyse.en_norm != null) update.enNorm = analyse.en_norm;
    if (analyse.rapportnummer != null) update.rapportnummer = analyse.rapportnummer;
    if (analyse.revisie != null) update.revisie = analyse.revisie;
    if (analyse.datum != null) update.datum = analyse.datum;
    if (analyse.getest_voor != null) update.getestVoor = analyse.getest_voor;

    await db.update(documentenTable).set(update).where(eq(documentenTable.id, id));

    await logDocumentActie({
      documentId: id,
      documentNaam: d.naam,
      gebruikerId: req.session.userId ?? null,
      actie: "ai_invullen",
      detail: `Betrouwbaarheid: ${analyse.betrouwbaarheid ?? "onbekend"}`,
    });

    invalideerContext("document", id);

    return void res.json(analyse);
  } catch (err) {
    req.log.error(err);
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /documenten — nieuw document (beheerder)
router.post("/documenten", requireBevoegdheid("bibliotheek", 3), async (req, res): Promise<void> => {
  try {
    const b = req.body ?? {};
    if (!b.naam || !String(b.naam).trim()) {
      return void res.status(400).json({ error: "naam is verplicht" });
    }
    const bestemming = await valideerProductrapportBestemming(
      b.documenttype,
      b.toepassing_ids,
    );
    if (!bestemming.ok) {
      return void res.status(400).json({ error: bestemming.error });
    }
    const d = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(documentenTable)
        .values({
          naam: String(b.naam).trim(),
          documenttype: bestemming.documenttype,
          fabrikant: b.fabrikant ?? null,
          product: b.product ?? null,
          enNorm: b.en_norm ?? null,
          rapportnummer: b.rapportnummer ?? null,
          revisie: b.revisie ?? null,
          datum: b.datum ?? null,
          getestVoor: isGetestVoor(b.getest_voor) ? b.getest_voor : null,
          pdfUrl: b.pdf_url ?? null,
          bestandsHash: typeof b.bestands_hash === "string" ? b.bestands_hash : null,
          bestandsgrootte: Number.isInteger(b.bestandsgrootte) ? b.bestandsgrootte : null,
          geldigTot: typeof b.geldig_tot === "string" && b.geldig_tot ? b.geldig_tot : null,
          goedkeuringStatus: isGoedkeuringStatus(b.goedkeuring_status)
            ? b.goedkeuring_status
            : "goedgekeurd",
          aiGeanalyseerd: b.ai_geanalyseerd === true,
          aiMetadata: b.ai_metadata ?? null,
        })
        .returning();
      await tx.insert(documentToepassingenTable).values(
        bestemming.labelIds.map((labelId) => ({ documentId: row.id, labelId })),
      );
      return row;
    });

    await logDocumentActie({
      documentId: d.id,
      documentNaam: d.naam,
      gebruikerId: req.session.userId ?? null,
      actie: "geupload",
    });

    // Poort 2 — security scan (fire-and-forget, blokkeert de upload niet)
    if (d.pdfUrl || d.naam) {
      scanBestandMetadata({
        bestandsnaam: d.naam,
        bestandsgrootte: d.bestandsgrootte ?? undefined,
        gebruikerId: req.session.userId ?? null,
        gebruikerNaam: null,
        uploadBron: "document",
      })
        .then((scan) => (scan.dbId != null ? koppelDocumentAanScan(scan.dbId, d.id) : undefined))
        .catch(() => {});
    }

    invalideerContext("document", d.id);
    return void res.status(201).json(await mapDocument(d));
  } catch (err) {
    req.log.error(err);
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /documenten/aanleveren — multipart-upload met een verplichte bestemming.
// Productrapporten vereisen een geldige toepassing/applicatiekoppeling.
// Contextdocumenten vereisen hun eigen concrete, bevoegde bestemming.
router.post(
  "/documenten/aanleveren",
  uploadEnkel.single("bestand"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const bestand = req.file;
      if (!bestand || !bestand.buffer?.length) {
        return void res.status(400).json({ error: "bestand is verplicht" });
      }
      const categorie = typeof req.body?.categorie === "string" ? req.body.categorie.trim() : "";
      if (!categorie) {
        return void res.status(400).json({ error: "categorie is verplicht" });
      }
      if (categorie === "jaarrekening") {
        return void res.status(422).json({
          error:
            "Jaarrekeningen horen niet in de documentbibliotheek. Gebruik de financiële module (Financieel › Jaarrekeningen).",
        });
      }
      const documenttype = AANLEVER_CATEGORIE_NAAR_TYPE[categorie] ?? "overig";
      const ruweLabelIds = Array.isArray(req.body?.label_id)
        ? req.body.label_id
        : req.body?.label_id !== undefined
          ? [req.body.label_id]
          : [];
      const labelIds = ruweLabelIds
        .map((waarde: unknown) => Number(waarde))
        .filter((waarde: number) => Number.isInteger(waarde) && waarde > 0);
      const doelType =
        typeof req.body?.doel_type === "string" ? req.body.doel_type.trim() : "";
      const doelId = Number(req.body?.doel_id);

      let productBestemming:
        | Awaited<ReturnType<typeof valideerProductrapportBestemming>>
        | null = null;
      let contextBestemming:
        | { doelType: "opdracht" | "calculatie"; doelId: number }
        | null = null;

      if (isProductrapportType(documenttype)) {
        if (
          !req.permissies?.isHoofdbeheerder &&
          !req.permissies?.heeftModuleRecht("bibliotheek", 2)
        ) {
          return void res.status(403).json({
            error: "Geen bevoegdheid om productrapporten toe te voegen.",
          });
        }
        productBestemming = await valideerProductrapportBestemming(
          documenttype,
          labelIds,
        );
        if (!productBestemming.ok) {
          return void res.status(400).json({ error: productBestemming.error });
        }
      } else {
        const isToegestaanOpdrachtstuk =
          (categorie === "opdrachtbevestiging" || categorie === "bibliotheek") &&
          doelType === "opdracht" &&
          Number.isInteger(doelId) &&
          doelId > 0;
        const isToegestaanAdviesrapport =
          categorie === "adviesrapport" &&
          doelType === "calculatie" &&
          Number.isInteger(doelId) &&
          doelId > 0;
        if (!isToegestaanOpdrachtstuk && !isToegestaanAdviesrapport) {
          return void res.status(422).json({
            error:
              "Dit bestand hoort niet in Productrapporten. Upload het bij de offerte, organisatie, opdracht, het project of dossier waarvoor het bestemd is.",
          });
        }
        const contextType = isToegestaanAdviesrapport
          ? "calculatie"
          : "opdracht";
        const vereistNiveau = contextType === "calculatie" ? 2 : 3;
        if (!(await magContextDoel(req, contextType, doelId, vereistNiveau))) {
          return void res.status(403).json({
            error:
              "De gekozen bestemming bestaat niet of u mag daar geen documenten toevoegen.",
          });
        }
        contextBestemming = { doelType: contextType, doelId };
      }
      const toelichting =
        typeof req.body?.toelichting === "string" && req.body.toelichting.trim()
          ? req.body.toelichting.trim()
          : null;

      const bestandsnaam = bestand.originalname || "document";
      const veilig = bestandsnaam.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
      const subPath = contextBestemming
        ? `context/${contextBestemming.doelType}/${contextBestemming.doelId}/${Date.now()}_${veilig}`
        : `productrapporten/aanlevering/${Date.now()}_${veilig}`;

      // Fail-loud: bij storage-uitval weigeren we het verzoek in plaats van een
      // dood pad te bewaren.
      let pdfUrl: string;
      try {
        pdfUrl = await objectStorage.uploadBestand(
          subPath,
          bestand.buffer,
          bestand.mimetype || "application/octet-stream",
        );
      } catch (err) {
        req.log.error({ err }, "Object storage niet beschikbaar — documentaanlevering geweigerd");
        return void res.status(503).json({
          error:
            "De bestandsopslag is momenteel niet beschikbaar. Het document is niet opgeslagen — probeer het later opnieuw of waarschuw de beheerder.",
        });
      }

      const naam = bestandsnaam.replace(/\.[^.]+$/, "").trim() || bestandsnaam;
      const bestandsHash = crypto.createHash("sha256").update(bestand.buffer).digest("hex");

      const d = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(documentenTable)
          .values({
            naam,
            documenttype,
            pdfUrl,
            bestandsHash,
            bestandsgrootte: bestand.buffer.length,
            goedkeuringStatus: "ter_goedkeuring",
            aiMetadata: {
              bron: contextBestemming ? "context_upload" : "productrapport_upload",
              categorie,
              ...(toelichting ? { toelichting } : {}),
            },
          })
          .returning();

        if (productBestemming?.ok) {
          await tx.insert(documentToepassingenTable).values(
            productBestemming.labelIds.map((labelId) => ({
              documentId: row.id,
              labelId,
            })),
          );
        }
        if (contextBestemming) {
          await tx.insert(documentKoppelingenTable).values({
            documentId: row.id,
            doelType: contextBestemming.doelType,
            doelId: contextBestemming.doelId,
            aangemaaktDoorId: req.session.userId ?? null,
          });
        }
        return row;
      });

      await logDocumentActie({
        documentId: d.id,
        documentNaam: d.naam,
        gebruikerId: req.session.userId ?? null,
        actie: "geupload",
      });

      // Poort 2 — security scan (fire-and-forget, blokkeert de upload niet)
      scanBestandMetadata({
        bestandsnaam,
        bestandsgrootte: bestand.buffer.length,
        gebruikerId: req.session.userId ?? null,
        gebruikerNaam: null,
        uploadBron: "document",
      })
        .then((scan) => (scan.dbId != null ? koppelDocumentAanScan(scan.dbId, d.id) : undefined))
        .catch(() => {});

      // AI-verrijking — extraheert fabrikant/product/norm/rapportnummer uit de PDF
      // zodat ai-koppelvoorstellen later kan matchen. Fire-and-forget: blokkeert de
      // upload-respons niet en faalt stil bij AI-problemen.
      if (bestand.buffer?.length && (bestand.mimetype === "application/pdf" || bestandsnaam.toLowerCase().endsWith(".pdf"))) {
        const documentId = d.id;
        const pdfBuffer = bestand.buffer;
        (async () => {
          try {
            const extractie = await extraheerPdfTekst(pdfBuffer);
            if (!extractie.tekst) return;
            const analyse = await analyseerDocumentTekst(extractie.tekst, bestandsnaam, {
              module: "bibliotheek",
              functie: "aanleveren-verrijking",
            });
            const verrijking: Partial<{
              fabrikant: string | null;
              product: string | null;
              enNorm: string | null;
              rapportnummer: string | null;
            }> = {};
            if (analyse.fabrikant) verrijking.fabrikant = analyse.fabrikant;
            if (analyse.product) verrijking.product = analyse.product;
            if (analyse.en_norm) verrijking.enNorm = analyse.en_norm;
            if (analyse.rapportnummer) verrijking.rapportnummer = analyse.rapportnummer;
            if (Object.keys(verrijking).length > 0) {
              await db.update(documentenTable).set(verrijking).where(eq(documentenTable.id, documentId));
            }
          } catch (err) {
            logger.warn({ err, documentId }, "AI-verrijking bij aanleveren mislukt (niet kritiek)");
          }
        })();
      }

      invalideerContext("document", d.id);
      const gemapt = await mapDocument(d);
      // Het rapport is al atomair gekoppeld aan de gekozen calculatie; de analyse
      // gebruikt uitsluitend dit document-id binnen diezelfde context.
      if (categorie === "adviesrapport") {
        return void res.status(201).json({
          ...gemapt,
          doorschakeling: {
            naar: "calculatie-inrichten",
            document_id: d.id,
            reden: "Adviesrapport opgeslagen bij de gekozen calculatie.",
          },
        });
      }
      return void res.status(201).json(gemapt);
    } catch (err) {
      req.log.error(err);
      return void res.status(500).json({ error: "Interne serverfout" });
    }
  },
);

// PATCH /documenten/:id — alleen status/gearchiveerd (inhoud is onveranderlijk) (beheerder)
router.patch("/documenten/:id", requireBevoegdheid("bibliotheek", 2), eisZichtbaarProductrapport, async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id));
    const { status, gearchiveerd, geldig_tot } = req.body ?? {};
    if (status !== undefined && !isDocumentStatus(status)) {
      return void res.status(400).json({ error: "Ongeldige status" });
    }
    const [bestaand] = await db
      .select()
      .from(documentenTable)
      .where(eq(documentenTable.id, id));
    if (!bestaand) return void res.status(404).json({ error: "Document niet gevonden" });

    // Onveranderlijkheid: slechts één 'actueel' revisie per groep. Een oudere
    // (vervangen) revisie mag niet opnieuw als actueel worden ingesteld.
    if (status === "actueel") {
      const [{ maxNum }] = await db
        .select({ maxNum: max(documentenTable.revisieNummer) })
        .from(documentenTable)
        .where(eq(documentenTable.groepId, bestaand.groepId));
      if ((maxNum ?? bestaand.revisieNummer) !== bestaand.revisieNummer) {
        return void res.status(400).json({
          error: "Alleen de nieuwste revisie kan op 'actueel' worden gezet.",
        });
      }
    }

    const set: Record<string, unknown> = { bijgewerktOp: new Date() };
    if (status !== undefined) set.status = status;
    if (gearchiveerd !== undefined) set.gearchiveerd = gearchiveerd === true;
    if (geldig_tot !== undefined)
      set.geldigTot = geldig_tot === null || geldig_tot === "" ? null : String(geldig_tot);

    const [d] = await db
      .update(documentenTable)
      .set(set)
      .where(eq(documentenTable.id, id))
      .returning();
    if (!d) return void res.status(404).json({ error: "Document niet gevonden" });
    invalideerContext("document", id);
    return void res.json(await mapDocument(d));
  } catch (err) {
    req.log.error(err);
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /documenten/:id/revisies — nieuwe revisie (copy-on-revision) (beheerder)
router.post("/documenten/:id/revisies", requireBevoegdheid("bibliotheek", 3), eisZichtbaarProductrapport, async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id));
    const b = req.body ?? {};
    const [bron] = await db.select().from(documentenTable).where(eq(documentenTable.id, id));
    if (!bron) return void res.status(404).json({ error: "Document niet gevonden" });
    const bronLabelIds = (
      await db
        .select({ labelId: documentToepassingenTable.labelId })
        .from(documentToepassingenTable)
        .where(eq(documentToepassingenTable.documentId, bron.id))
    ).map((row) => row.labelId);
    const bestemming = await valideerProductrapportBestemming(
      b.documenttype ?? bron.documenttype,
      Array.isArray(b.toepassing_ids) ? b.toepassing_ids : bronLabelIds,
    );
    if (!bestemming.ok) {
      return void res.status(400).json({ error: bestemming.error });
    }

    const nieuw = await db.transaction(async (tx) => {
      // Serialiseer revisies per documentgroep: zo kunnen twee gelijktijdige
      // verzoeken niet hetzelfde revisienummer kiezen of twee actuele rijen maken.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${bron.groepId}))`,
      );
      const [{ maxNum }] = await tx
        .select({ maxNum: max(documentenTable.revisieNummer) })
        .from(documentenTable)
        .where(eq(documentenTable.groepId, bron.groepId));
      const volgend = (maxNum ?? bron.revisieNummer) + 1;

      const [row] = await tx
        .insert(documentenTable)
        .values({
          // Een revisie is een nieuwe versie van hetzelfde document: ontbrekende
          // velden worden overgenomen van de bron, zodat o.a. de PDF en metadata
          // niet stil verloren gaan bij een metadata-only revisie.
          naam: b.naam ? String(b.naam).trim() : bron.naam,
          documenttype: bestemming.documenttype,
          fabrikant: b.fabrikant ?? bron.fabrikant,
          product: b.product ?? bron.product,
          enNorm: b.en_norm ?? bron.enNorm,
          rapportnummer: b.rapportnummer ?? bron.rapportnummer,
          revisie: b.revisie ?? bron.revisie,
          datum: b.datum ?? bron.datum,
          getestVoor: isGetestVoor(b.getest_voor) ? b.getest_voor : bron.getestVoor,
          pdfUrl: b.pdf_url ?? bron.pdfUrl,
          bestandsHash:
            typeof b.bestands_hash === "string" ? b.bestands_hash : bron.bestandsHash,
          bestandsgrootte: Number.isInteger(b.bestandsgrootte)
            ? b.bestandsgrootte
            : bron.bestandsgrootte,
          geldigTot: b.geldig_tot !== undefined ? b.geldig_tot || null : bron.geldigTot,
          goedkeuringStatus: isGoedkeuringStatus(b.goedkeuring_status)
            ? b.goedkeuring_status
            : bron.goedkeuringStatus,
          aiGeanalyseerd:
            b.ai_geanalyseerd === undefined
              ? bron.aiGeanalyseerd
              : b.ai_geanalyseerd === true,
          aiMetadata: b.ai_metadata ?? bron.aiMetadata,
          status: "actueel",
          groepId: bron.groepId,
          revisieNummer: volgend,
        })
        .returning();

      // Vorige actuele revisie(s) worden 'vervangen'; oude revisies blijven bewaard.
      await tx
        .update(documentenTable)
        .set({ status: "vervangen", bijgewerktOp: new Date() })
        .where(
          and(
            eq(documentenTable.groepId, bron.groepId),
            eq(documentenTable.status, "actueel"),
            ne(documentenTable.id, row.id),
          ),
        );

      // Koppelingen overnemen: body-override indien meegegeven, anders kopiëren van de bron.
      await tx
        .insert(documentToepassingenTable)
        .values(
          bestemming.labelIds.map((labelId) => ({
            documentId: row.id,
            labelId,
          })),
        )
        .onConflictDoNothing();

      return row;
    });

    await logDocumentActie({
      documentId: nieuw.id,
      documentNaam: nieuw.naam,
      gebruikerId: req.session.userId ?? null,
      actie: "revisie",
      detail: `revisie ${nieuw.revisieNummer}`,
    });

    invalideerContext("document", bron.id);
    invalideerContext("document", nieuw.id);

    // Poort 2 — security scan op nieuwe revisie (fire-and-forget)
    if (nieuw.naam) {
      scanBestandMetadata({
        bestandsnaam: nieuw.naam,
        bestandsgrootte: nieuw.bestandsgrootte ?? undefined,
        gebruikerId: req.session.userId ?? null,
        gebruikerNaam: null,
        uploadBron: "document",
      })
        .then((scan) => (scan.dbId != null ? koppelDocumentAanScan(scan.dbId, nieuw.id) : undefined))
        .catch(() => {});
    }

    return void res.status(201).json(await mapDocument(nieuw));
  } catch (err) {
    req.log.error(err);
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

// PUT /documenten/:id/toepassingen — gekoppelde toepassingen instellen (beheerder)
router.put("/documenten/:id/toepassingen", requireBevoegdheid("bibliotheek", 2), eisZichtbaarProductrapport, async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id));
    const [d] = await db.select().from(documentenTable).where(eq(documentenTable.id, id));
    if (!d) return void res.status(404).json({ error: "Document niet gevonden" });
    const ids = Array.isArray(req.body?.label_ids) ? req.body.label_ids : [];
    const bestemming = await valideerProductrapportBestemming(d.documenttype, ids);
    if (!bestemming.ok) {
      return void res.status(400).json({ error: bestemming.error });
    }
    await syncDocumentToepassingen(id, bestemming.labelIds);
    return void res.json(await mapDocument(d));
  } catch (err) {
    req.log.error(err);
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── KOPPELINGEN (document ↔ entiteit) ───────────────────────────────────────
// GET /documenten/:id/koppelingen
router.get("/documenten/:id/koppelingen", requireBevoegdheid("bibliotheek", 1), eisZichtbaarProductrapport, async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id));
    const rows = await db
      .select()
      .from(documentKoppelingenTable)
      .where(eq(documentKoppelingenTable.documentId, id))
      .orderBy(asc(documentKoppelingenTable.doelType));
    return void res.json(await mapKoppelingen(rows));
  } catch (err) {
    req.log.error(err);
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /documenten/:id/koppelingen — koppel aan entiteit (beheerder)
router.post(
  "/documenten/:id/koppelingen",
  requireBevoegdheid("bibliotheek", 2),
  eisZichtbaarProductrapport,
  async (req, res): Promise<void> => {
    try {
      const id = parseInt(String(req.params.id));
      const [d] = await db.select().from(documentenTable).where(eq(documentenTable.id, id));
      if (!d) return void res.status(404).json({ error: "Document niet gevonden" });
      const doelType = String(req.body?.doel_type ?? "");
      const doelId = parseInt(String(req.body?.doel_id ?? ""));
      if (!isKoppelingDoelType(doelType) || !Number.isInteger(doelId)) {
        return void res.status(400).json({ error: "doel_type en doel_id zijn verplicht" });
      }
      await db
        .insert(documentKoppelingenTable)
        .values({
          documentId: id,
          doelType,
          doelId,
          aangemaaktDoorId: req.session.userId ?? null,
        })
        .onConflictDoNothing();
      const [rij] = await db
        .select()
        .from(documentKoppelingenTable)
        .where(
          and(
            eq(documentKoppelingenTable.documentId, id),
            eq(documentKoppelingenTable.doelType, doelType),
            eq(documentKoppelingenTable.doelId, doelId),
          ),
        );
      await logDocumentActie({
        documentId: id,
        documentNaam: d.naam,
        gebruikerId: req.session.userId ?? null,
        actie: "gekoppeld",
        detail: `${doelType} #${doelId}`,
      });
      invalideerContext("document", id);
      const [mapped] = await mapKoppelingen([rij]);
      return void res.status(201).json(mapped);
    } catch (err) {
      req.log.error(err);
      return void res.status(500).json({ error: "Interne serverfout" });
    }
  },
);

// DELETE /documenten/:id/koppelingen/:koppelingId — ontkoppel (beheerder)
router.delete(
  "/documenten/:id/koppelingen/:koppelingId",
  requireBevoegdheid("bibliotheek", 2),
  eisZichtbaarProductrapport,
  async (req, res): Promise<void> => {
    try {
      const id = parseInt(String(req.params.id));
      const koppelingId = parseInt(String(req.params.koppelingId));
      const [bestaand] = await db
        .select()
        .from(documentKoppelingenTable)
        .where(
          and(
            eq(documentKoppelingenTable.id, koppelingId),
            eq(documentKoppelingenTable.documentId, id),
          ),
        );
      if (!bestaand) return void res.status(404).json({ error: "Koppeling niet gevonden" });
      await db
        .delete(documentKoppelingenTable)
        .where(eq(documentKoppelingenTable.id, koppelingId));
      await logDocumentActie({
        documentId: id,
        gebruikerId: req.session.userId ?? null,
        actie: "ontkoppeld",
        detail: `${bestaand.doelType} #${bestaand.doelId}`,
      });
      invalideerContext("document", id);
      return void res.status(204).send();
    } catch (err) {
      req.log.error(err);
      return void res.status(500).json({ error: "Interne serverfout" });
    }
  },
);

// ── GOEDKEURINGSFLOW ────────────────────────────────────────────────────────
async function zetGoedkeuring(
  req: Request,
  res: Response,
  nieuweStatus: "ter_goedkeuring" | "goedgekeurd" | "afgekeurd",
  actie: string,
) {
  const id = parseInt(String(req.params.id));
  const [d] = await db.select().from(documentenTable).where(eq(documentenTable.id, id));
  if (!d) return void res.status(404).json({ error: "Document niet gevonden" });
  // Statusmachine: goedkeuren/afkeuren kan alleen vanuit "ter_goedkeuring".
  if (
    (nieuweStatus === "goedgekeurd" || nieuweStatus === "afgekeurd") &&
    d.goedkeuringStatus !== "ter_goedkeuring"
  ) {
    return void res
      .status(409)
      .json({ error: "Alleen een ingediend document (ter goedkeuring) kan worden goed- of afgekeurd." });
  }
  const opmerking =
    typeof req.body?.opmerking === "string" ? req.body.opmerking.trim() || null : null;
  const uid = req.session.userId ?? null;
  const [bij] = await db
    .update(documentenTable)
    .set({ goedkeuringStatus: nieuweStatus, bijgewerktOp: new Date() })
    .where(eq(documentenTable.id, id))
    .returning();
  await db
    .insert(documentGoedkeuringenTable)
    .values({ documentId: id, actie, doorId: uid, opmerking });
  await logDocumentActie({
    documentId: id,
    documentNaam: d.naam,
    gebruikerId: uid,
    actie,
    detail: opmerking,
  });
  invalideerContext("document", id);
  return void res.json(await mapDocument(bij));
}

// POST /documenten/:id/indienen — ter goedkeuring aanbieden
router.post("/documenten/:id/indienen", requireBevoegdheid("bibliotheek", 3), eisZichtbaarProductrapport, async (req, res): Promise<void> => {
  try {
    await zetGoedkeuring(req, res, "ter_goedkeuring", "ingediend");
  } catch (err) {
    req.log.error(err);
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /documenten/:id/goedkeuren — goedkeuren (beheerder)
router.post(
  "/documenten/:id/goedkeuren",
  requireBevoegdheid("bibliotheek", 4),
  eisZichtbaarProductrapport,
  async (req, res): Promise<void> => {
    try {
      await zetGoedkeuring(req, res, "goedgekeurd", "goedgekeurd");
    } catch (err) {
      req.log.error(err);
      return void res.status(500).json({ error: "Interne serverfout" });
    }
  },
);

// POST /documenten/:id/afkeuren — afkeuren (beheerder)
router.post(
  "/documenten/:id/afkeuren",
  requireBevoegdheid("bibliotheek", 4),
  eisZichtbaarProductrapport,
  async (req, res): Promise<void> => {
    try {
      await zetGoedkeuring(req, res, "afgekeurd", "afgekeurd");
    } catch (err) {
      req.log.error(err);
      return void res.status(500).json({ error: "Interne serverfout" });
    }
  },
);

// GET /documenten/:id/goedkeuringen — goedkeuringshistorie
router.get("/documenten/:id/goedkeuringen", requireBevoegdheid("bibliotheek", 1), eisZichtbaarProductrapport, async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id));
    const rows = await db
      .select()
      .from(documentGoedkeuringenTable)
      .where(eq(documentGoedkeuringenTable.documentId, id))
      .orderBy(desc(documentGoedkeuringenTable.tijdstip));
    return void res.json(await mapGoedkeuringen(rows));
  } catch (err) {
    req.log.error(err);
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /documenten/:id/logboek — audittrail van één document
router.get("/documenten/:id/logboek", requireBevoegdheid("bibliotheek", 1), eisZichtbaarProductrapport, async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id));
    const rows = await db
      .select()
      .from(documentLogboekTable)
      .where(eq(documentLogboekTable.documentId, id))
      .orderBy(desc(documentLogboekTable.tijdstip));
    return void res.json(rows.map(mapLogboekRegel));
  } catch (err) {
    req.log.error(err);
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /documenten/:id/download — log de download en stuur door naar het bestand
router.get("/documenten/:id/download", async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id));
    const [d] = await db.select().from(documentenTable).where(eq(documentenTable.id, id));
    if (!d) return void res.status(404).json({ error: "Document niet gevonden" });
    if (!(await magDocumentLezen(req, id))) {
      return void res.status(404).json({ error: "Document niet gevonden" });
    }
    if (!d.pdfUrl) return void res.status(404).json({ error: "Geen bestand gekoppeld" });
    await logDocumentActie({
      documentId: id,
      documentNaam: d.naam,
      gebruikerId: req.session.userId ?? null,
      actie: "gedownload",
    });
    // pdfUrl is een objectPath (bv. /objects/<id>) die via /api/storage wordt
    // geserveerd; absolute URL's worden ongewijzigd doorgestuurd.
    const doel = /^https?:\/\//i.test(d.pdfUrl) ? d.pdfUrl : `/api/storage${d.pdfUrl}`;
    return void res.redirect(302, doel);
  } catch (err) {
    req.log.error(err);
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
