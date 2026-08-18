import { Router, Request, Response } from "express";
import multer from "multer";
import {
  db,
  loonOutputBestandenTable,
  medewerkersTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireBevoegdheid, getSessionGebruikerNaam } from "../middlewares/auth";
import { ObjectStorageService } from "../lib/objectStorage";

const router = Router();
const storage = new ObjectStorageService();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

const lezen = requireBevoegdheid("salarisarchief", 1);
const schrijven = requireBevoegdheid("salarisarchief", 2);

function mapBestand(b: typeof loonOutputBestandenTable.$inferSelect) {
  return {
    id: b.id,
    type: b.type,
    werkmaatschappij: b.werkmaatschappij,
    werkgever_id: b.werkgeverId,
    periode_jaar: b.periodeJaar,
    periode_maand: b.periodeMaand,
    medewerker_id: b.medewerkerId,
    medewerker_naam: b.medewerkerNaam,
    bron: b.bron,
    bestandsnaam: b.bestandsnaam,
    object_path: b.objectPath,
    bestandsgrootte: b.bestandsgrootte,
    mime_type: b.mimeType,
    status: b.status,
    zichtbaar_medewerker: b.zichtbaarMedewerker,
    gepubliceerd_op: b.gepubliceerdOp?.toISOString() ?? null,
    upload_batch_ref: b.uploadBatchRef,
    notities: b.notities,
    uploader_naam: b.uploaderNaam,
    aangemaakt_op: b.aangemaaktOp.toISOString(),
    bijgewerkt_op: b.bijgewerktOp.toISOString(),
  };
}

router.get("/loon-output", lezen, async (req: Request, res: Response): Promise<void> => {
  const { jaar, maand, werkmaatschappij, type, medewerker_id, status } = req.query;
  const filters = [];
  if (jaar) filters.push(eq(loonOutputBestandenTable.periodeJaar, Number(jaar)));
  if (maand) filters.push(eq(loonOutputBestandenTable.periodeMaand, Number(maand)));
  if (werkmaatschappij) filters.push(eq(loonOutputBestandenTable.werkmaatschappij, String(werkmaatschappij)));
  if (type) filters.push(eq(loonOutputBestandenTable.type, String(type)));
  if (medewerker_id) filters.push(eq(loonOutputBestandenTable.medewerkerId, Number(medewerker_id)));
  if (status) filters.push(eq(loonOutputBestandenTable.status, String(status)));

  const rows = await db
    .select()
    .from(loonOutputBestandenTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(loonOutputBestandenTable.aangemaaktOp));

  return void res.json(rows.map(mapBestand));
});

router.post(
  "/loon-output",
  schrijven,
  upload.single("bestand"),
  async (req: Request, res: Response): Promise<void> => {
    const bestand = req.file;
    if (!bestand) return void res.status(400).json({ message: "Bestand ontbreekt" });

    const {
      type, werkmaatschappij, werkgever_id, periode_jaar, periode_maand,
      medewerker_id, bron, notities, upload_batch_ref,
    } = req.body;

    if (!type) return void res.status(400).json({ message: "type is verplicht" });

    const mimeType = bestand.mimetype || "application/octet-stream";
    const subPath = `loon-output/${Date.now()}-${bestand.originalname}`;
    let objectPath: string;
    try {
      objectPath = await storage.uploadBestand(subPath, bestand.buffer, mimeType);
    } catch (err) {
      req.log.error({ err }, "Upload loon-output naar object storage mislukt");
      return void res.status(500).json({ message: "Upload mislukt" });
    }

    let medewerkerNaam: string | null = null;
    if (medewerker_id) {
      const [med] = await db.select({ naam: medewerkersTable.naam })
        .from(medewerkersTable).where(eq(medewerkersTable.id, Number(medewerker_id)));
      medewerkerNaam = med?.naam ?? null;
    }

    const [bestandRij] = await db.insert(loonOutputBestandenTable).values({
      type,
      werkmaatschappij: werkmaatschappij ?? null,
      werkgeverId: werkgever_id ? Number(werkgever_id) : null,
      periodeJaar: periode_jaar ? Number(periode_jaar) : null,
      periodeMaand: periode_maand ? Number(periode_maand) : null,
      medewerkerId: medewerker_id ? Number(medewerker_id) : null,
      medewerkerNaam,
      bron: bron ?? "boekhouder",
      bestandsnaam: bestand.originalname,
      objectPath,
      bestandsgrootte: bestand.size,
      mimeType,
      status: "ontvangen",
      uploadBatchRef: upload_batch_ref ?? null,
      notities: notities ?? null,
      uploaderId: req.session.userId ?? null,
      uploaderNaam: (await getSessionGebruikerNaam(req)) ?? null,
    }).returning();

    return void res.status(201).json(mapBestand(bestandRij));
  }
);

router.patch("/loon-output/:id", schrijven, async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const { status, notities, medewerker_id, werkmaatschappij } = req.body;

  const update: Partial<typeof loonOutputBestandenTable.$inferInsert> = {
    bijgewerktOp: new Date(),
  };
  if (status !== undefined) update.status = status;
  if (notities !== undefined) update.notities = notities;
  if (werkmaatschappij !== undefined) update.werkmaatschappij = werkmaatschappij;
  if (medewerker_id !== undefined) {
    update.medewerkerId = medewerker_id;
    if (medewerker_id) {
      const [med] = await db.select({ naam: medewerkersTable.naam })
        .from(medewerkersTable).where(eq(medewerkersTable.id, Number(medewerker_id)));
      update.medewerkerNaam = med?.naam ?? null;
    }
  }

  const [updated] = await db
    .update(loonOutputBestandenTable)
    .set(update)
    .where(eq(loonOutputBestandenTable.id, id))
    .returning();

  if (!updated) return void res.status(404).json({ message: "Niet gevonden" });
  return void res.json(mapBestand(updated));
});

router.post("/loon-output/:id/publiceer", requireBevoegdheid("salarisarchief", 3), async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);

  const [updated] = await db
    .update(loonOutputBestandenTable)
    .set({
      zichtbaarMedewerker: true,
      gepubliceerdOp: new Date(),
      gepubliceerdDoorId: req.session.userId ?? null,
      status: "gepubliceerd",
      bijgewerktOp: new Date(),
    })
    .where(eq(loonOutputBestandenTable.id, id))
    .returning();

  if (!updated) return void res.status(404).json({ message: "Niet gevonden" });
  return void res.json(mapBestand(updated));
});

export default router;
