import { Router, Request, Response } from "express";
import multer from "multer";
import {
  db,
  boekhouderUploadsTable,
  salarisMutatiesTable,
  loonOutputBestandenTable,
  sepaBestandenTable,
  scabMailsTable,
  werkgeversTable,
} from "@workspace/db";
import { eq, and, count, desc } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { ObjectStorageService } from "../lib/objectStorage";

const router = Router();
const storage = new ObjectStorageService();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

const portaal = requireBevoegdheid("boekhouder_portaal", 1);
const uploaden = requireBevoegdheid("boekhouder_portaal", 2);

function mapUpload(u: typeof boekhouderUploadsTable.$inferSelect) {
  return {
    id: u.id,
    map: u.map,
    werkmaatschappij: u.werkmaatschappij,
    werkgever_id: u.werkgeverId,
    periode_jaar: u.periodeJaar,
    periode_maand: u.periodeMaand,
    omschrijving: u.omschrijving,
    bestandsnaam: u.bestandsnaam,
    object_path: u.objectPath,
    bestandsgrootte: u.bestandsgrootte,
    mime_type: u.mimeType,
    gelezen: u.gelezen,
    uploader_naam: u.uploaderNaam,
    aangemaakt_op: u.aangemaaktOp.toISOString(),
    bijgewerkt_op: u.bijgewerktOp.toISOString(),
  };
}

router.get("/boekhouder/dashboard", portaal, async (req: Request, res: Response) => {
  const { werkgever_id } = req.query;

  let werkgeverNaam = "Alle werkgevers";
  let werkgeverId: number | null = null;

  if (werkgever_id) {
    werkgeverId = Number(werkgever_id);
    const [wg] = await db.select({ naam: werkgeversTable.naam })
      .from(werkgeversTable).where(eq(werkgeversTable.id, werkgeverId));
    werkgeverNaam = wg?.naam ?? String(werkgever_id);
  }

  const mutatiesFilter = and(
    eq(salarisMutatiesTable.status, "concept"),
    werkgeverId ? eq(salarisMutatiesTable.werkgeverId, werkgeverId) : undefined,
  );
  const [mutatiesRij] = await db.select({ n: count() })
    .from(salarisMutatiesTable).where(mutatiesFilter);

  const loonFilter = and(
    eq(loonOutputBestandenTable.zichtbaarMedewerker, false),
    werkgeverId ? eq(loonOutputBestandenTable.werkgeverId, werkgeverId) : undefined,
  );
  const [loonRij] = await db.select({ n: count() })
    .from(loonOutputBestandenTable).where(loonFilter);

  const uploadsFilter = werkgeverId
    ? eq(boekhouderUploadsTable.werkgeverId, werkgeverId)
    : undefined;
  const [uploadsRij] = await db.select({ n: count() })
    .from(boekhouderUploadsTable).where(uploadsFilter);

  const sepaFilter = werkgeverId
    ? eq(sepaBestandenTable.status, "ontvangen")
    : eq(sepaBestandenTable.status, "ontvangen");
  const [sepaRij] = await db.select({ n: count() })
    .from(sepaBestandenTable).where(sepaFilter);

  const scabFilter = and(
    eq(scabMailsTable.status, "concept"),
    werkgeverId ? eq(scabMailsTable.werkgeverId, werkgeverId) : undefined,
  );
  const [scabRij] = await db.select({ n: count() })
    .from(scabMailsTable).where(scabFilter);

  return res.json({
    werkgever_id: werkgeverId ?? 0,
    werkgever_naam: werkgeverNaam,
    openstaande_mutaties: Number(mutatiesRij?.n ?? 0),
    wachtend_loon_output: Number(loonRij?.n ?? 0),
    eigen_uploads: Number(uploadsRij?.n ?? 0),
    sepa_bestanden: Number(sepaRij?.n ?? 0),
    scab_mails_concept: Number(scabRij?.n ?? 0),
  });
});

router.get("/boekhouder/uploads", portaal, async (req: Request, res: Response) => {
  const { werkgever_id, map, jaar } = req.query;
  const filters = [];
  if (werkgever_id) filters.push(eq(boekhouderUploadsTable.werkgeverId, Number(werkgever_id)));
  if (map) filters.push(eq(boekhouderUploadsTable.map, String(map)));
  if (jaar) filters.push(eq(boekhouderUploadsTable.periodeJaar, Number(jaar)));

  const rows = await db
    .select()
    .from(boekhouderUploadsTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(boekhouderUploadsTable.aangemaaktOp));

  return res.json(rows.map(mapUpload));
});

router.post(
  "/boekhouder/uploads",
  uploaden,
  upload.single("bestand"),
  async (req: Request, res: Response) => {
    const bestand = req.file;
    if (!bestand) return res.status(400).json({ message: "Bestand ontbreekt" });

    const sess = req.session as { userId?: number; gebruikerNaam?: string };
    const { map, werkgever_id, periode_jaar, periode_maand, omschrijving } = req.body;

    if (!map) return res.status(400).json({ message: "map is verplicht" });

    const mimeType = bestand.mimetype || "application/octet-stream";
    const subPath = `boekhouder-uploads/${Date.now()}-${bestand.originalname}`;
    let objectPath: string;
    try {
      objectPath = await storage.uploadBestand(subPath, bestand.buffer, mimeType);
    } catch (err) {
      req.log.error({ err }, "Upload boekhouder-document mislukt");
      return res.status(500).json({ message: "Upload mislukt" });
    }

    const [rij] = await db.insert(boekhouderUploadsTable).values({
      map,
      werkgeverId: werkgever_id ? Number(werkgever_id) : null,
      periodeJaar: periode_jaar ? Number(periode_jaar) : null,
      periodeMaand: periode_maand ? Number(periode_maand) : null,
      omschrijving: omschrijving ?? null,
      bestandsnaam: bestand.originalname,
      objectPath,
      bestandsgrootte: bestand.size,
      mimeType,
      uploaderId: sess.userId ?? null,
      uploaderNaam: sess.gebruikerNaam ?? null,
    }).returning();

    return res.status(201).json(mapUpload(rij));
  }
);

export default router;
