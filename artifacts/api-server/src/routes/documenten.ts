import { Router } from "express";
import type { Request, Response } from "express";
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
} from "@workspace/db";
import { eq, and, ne, asc, desc, inArray, max } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import {
  mapDocument,
  mapDocumenten,
  mapKoppelingen,
  mapGoedkeuringen,
  mapLogboekRegel,
  syncDocumentToepassingen,
  isDocumentType,
  isDocumentStatus,
  isGoedkeuringStatus,
  isKoppelingDoelType,
  isGetestVoor,
} from "../lib/documenten";
import { logDocumentActie } from "../lib/document-logboek";
import { invalideerContext } from "../lib/aiContext/cache";
import { analyseerDocumentTekst, stelToepassingenVoor } from "../services/document-ai";
import { scanBestandMetadata, koppelDocumentAanScan } from "../services/security-intake-engine";
import { ObjectStorageService } from "../lib/objectStorage";
import { extraheerPdfTekst } from "../lib/pdfTekst";
import { logger } from "../lib/logger";
import type { DocumentType } from "../lib/documenten";

const router = Router();

const objectStorage = new ObjectStorageService();
const uploadEnkel = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

/** Slim Upload-categorie → documenttype in de bibliotheek. Technische categorieën
 * behouden hun specifieke type; algemene bedrijfsdocumenten krijgen een eigen
 * generiek type (tekening/contract/verzekering) of vallen terug op "overig".
 * Jaarrekeningen horen hier bewust NIET in: die gaan via /financieel/jaarrekeningen.
 */
const AANLEVER_CATEGORIE_NAAR_TYPE: Record<string, DocumentType> = {
  eta: "eta",
  dop: "dop",
  testrapport: "testrapport",
  certificaat: "productcertificaat",
  productdocument: "productblad",
  snagstream: "opleverrapport",
  tekening: "tekening",
  contract: "contract",
  verzekering: "verzekering",
  bibliotheek: "overig",
  offerte: "overig",
  factuur: "overig",
  aanvraag: "overig",
  personeelsdocument: "overig",
  document_sjabloon: "overig",
  algemeen: "overig",
  onbekend: "overig",
};

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
    const toepassing_suggesties = stelToepassingenVoor(resultaat, labels);

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
      const actueel = documenten.filter((d) => d.status === "actueel" && !d.gearchiveerd);

      const labels = await db
        .select()
        .from(labelsTable)
        .where(eq(labelsTable.gearchiveerd, false));

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
          labels,
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
      status,
      goedkeuring_status,
      fabrikant,
      voorziening_type_code,
      label_id,
      alleen_actueel,
      inclusief_gearchiveerd,
    } = req.query;

    let rows = await db.select().from(documentenTable).orderBy(asc(documentenTable.naam));

    if (documenttype) rows = rows.filter((d) => d.documenttype === documenttype);
    if (status) rows = rows.filter((d) => d.status === status);
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
    if (alleen_actueel === "true") rows = rows.filter((d) => d.status === "actueel");
    if (inclusief_gearchiveerd !== "true") rows = rows.filter((d) => !d.gearchiveerd);

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

      const treffers: { row: (typeof alle)[number]; reden: string }[] = [];
      for (const d of alle) {
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

    const vandaag = new Date();
    vandaag.setHours(0, 0, 0, 0);
    const grens = new Date(vandaag);
    grens.setDate(grens.getDate() + 90);

    const verlopen: typeof rows = [];
    const binnenkort: typeof rows = [];
    for (const d of rows) {
      if (d.status !== "actueel" || !d.geldigTot) continue;
      const dt = new Date(d.geldigTot);
      if (Number.isNaN(dt.getTime())) continue;
      if (dt < vandaag) verlopen.push(d);
      else if (dt <= grens) binnenkort.push(d);
    }
    const controle_nodig = rows.filter(
      (d) => d.status === "controle_nodig" || d.status === "mogelijk_verouderd",
    );
    const ter_goedkeuring = rows.filter((d) => d.goedkeuringStatus === "ter_goedkeuring");

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
      .limit(limiet);
    return void res.json(rows.map(mapLogboekRegel));
  } catch (err) {
    req.log.error(err);
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /documenten/gekoppeld — documenten gekoppeld aan een entiteit
router.get("/documenten/gekoppeld", requireBevoegdheid("bibliotheek", 1), async (req, res): Promise<void> => {
  try {
    const doelType = String(req.query.doel_type ?? "");
    const doelId = parseInt(String(req.query.doel_id ?? ""));
    if (!isKoppelingDoelType(doelType) || !Number.isInteger(doelId)) {
      return void res.status(400).json({ error: "doel_type en doel_id zijn verplicht" });
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

// GET /documenten/:id — detail
router.get("/documenten/:id", requireBevoegdheid("bibliotheek", 1), async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id));
    const [d] = await db.select().from(documentenTable).where(eq(documentenTable.id, id));
    if (!d) return void res.status(404).json({ error: "Document niet gevonden" });
    return void res.json(await mapDocument(d));
  } catch (err) {
    req.log.error(err);
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /documenten/:id/revisies — revisiehistorie van de documentgroep
router.get("/documenten/:id/revisies", requireBevoegdheid("bibliotheek", 1), async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id));
    const [d] = await db.select().from(documentenTable).where(eq(documentenTable.id, id));
    if (!d) return void res.status(404).json({ error: "Document niet gevonden" });
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
});

// POST /documenten — nieuw document (beheerder)
router.post("/documenten", requireBevoegdheid("bibliotheek", 3), async (req, res): Promise<void> => {
  try {
    const b = req.body ?? {};
    if (!b.naam || !String(b.naam).trim()) {
      return void res.status(400).json({ error: "naam is verplicht" });
    }
    if (b.documenttype !== undefined && !isDocumentType(b.documenttype)) {
      return void res.status(400).json({ error: "Ongeldig documenttype" });
    }
    const [d] = await db
      .insert(documentenTable)
      .values({
        naam: String(b.naam).trim(),
        documenttype: b.documenttype ?? "testrapport",
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

    if (Array.isArray(b.toepassing_ids)) await syncDocumentToepassingen(d.id, b.toepassing_ids);

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

// POST /documenten/aanleveren — Slim Upload levert een document direct aan bij de
// bibliotheek (multipart). Het bestand gaat fail-loud naar object storage en het
// document komt binnen met goedkeuringsstatus "ter_goedkeuring", zodat een beheerder
// het beoordeelt vóór het als goedgekeurd in de bibliotheek staat.
router.post(
  "/documenten/aanleveren",
  requireBevoegdheid("bibliotheek", 2),
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
      const toelichting =
        typeof req.body?.toelichting === "string" && req.body.toelichting.trim()
          ? req.body.toelichting.trim()
          : null;

      const bestandsnaam = bestand.originalname || "document";
      const veilig = bestandsnaam.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
      const subPath = `bibliotheek/aanlevering/${Date.now()}_${veilig}`;

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

      const [d] = await db
        .insert(documentenTable)
        .values({
          naam,
          documenttype,
          pdfUrl,
          bestandsHash,
          bestandsgrootte: bestand.buffer.length,
          goedkeuringStatus: "ter_goedkeuring",
          aiMetadata: {
            bron: "slim_upload",
            categorie,
            ...(toelichting ? { toelichting } : {}),
          },
        })
        .returning();

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
      return void res.status(201).json(await mapDocument(d));
    } catch (err) {
      req.log.error(err);
      return void res.status(500).json({ error: "Interne serverfout" });
    }
  },
);

// PATCH /documenten/:id — alleen status/gearchiveerd (inhoud is onveranderlijk) (beheerder)
router.patch("/documenten/:id", requireBevoegdheid("bibliotheek", 2), async (req, res): Promise<void> => {
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
router.post("/documenten/:id/revisies", requireBevoegdheid("bibliotheek", 3), async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id));
    const b = req.body ?? {};
    const [bron] = await db.select().from(documentenTable).where(eq(documentenTable.id, id));
    if (!bron) return void res.status(404).json({ error: "Document niet gevonden" });
    if (b.documenttype !== undefined && !isDocumentType(b.documenttype)) {
      return void res.status(400).json({ error: "Ongeldig documenttype" });
    }

    const nieuw = await db.transaction(async (tx) => {
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
          documenttype: b.documenttype ?? bron.documenttype,
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
            : "goedgekeurd",
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
      const labelIds: number[] = Array.isArray(b.toepassing_ids)
        ? b.toepassing_ids.filter((n: unknown) => Number.isInteger(n))
        : (
            await tx
              .select({ labelId: documentToepassingenTable.labelId })
              .from(documentToepassingenTable)
              .where(eq(documentToepassingenTable.documentId, bron.id))
          ).map((r) => r.labelId);

      if (labelIds.length) {
        const geldig = (
          await tx.select({ id: labelsTable.id }).from(labelsTable).where(inArray(labelsTable.id, labelIds))
        ).map((x) => x.id);
        if (geldig.length) {
          await tx
            .insert(documentToepassingenTable)
            .values(geldig.map((labelId) => ({ documentId: row.id, labelId })))
            .onConflictDoNothing();
        }
      }

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
router.put("/documenten/:id/toepassingen", requireBevoegdheid("bibliotheek", 2), async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id));
    const [d] = await db.select().from(documentenTable).where(eq(documentenTable.id, id));
    if (!d) return void res.status(404).json({ error: "Document niet gevonden" });
    const ids = Array.isArray(req.body?.label_ids) ? req.body.label_ids : [];
    await syncDocumentToepassingen(id, ids);
    return void res.json(await mapDocument(d));
  } catch (err) {
    req.log.error(err);
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── KOPPELINGEN (document ↔ entiteit) ───────────────────────────────────────
// GET /documenten/:id/koppelingen
router.get("/documenten/:id/koppelingen", requireBevoegdheid("bibliotheek", 1), async (req, res): Promise<void> => {
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
router.post("/documenten/:id/indienen", requireBevoegdheid("bibliotheek", 3), async (req, res): Promise<void> => {
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
router.get("/documenten/:id/goedkeuringen", requireBevoegdheid("bibliotheek", 1), async (req, res): Promise<void> => {
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
router.get("/documenten/:id/logboek", requireBevoegdheid("bibliotheek", 1), async (req, res): Promise<void> => {
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
router.get("/documenten/:id/download", requireBevoegdheid("bibliotheek", 1), async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id));
    const [d] = await db.select().from(documentenTable).where(eq(documentenTable.id, id));
    if (!d) return void res.status(404).json({ error: "Document niet gevonden" });
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
