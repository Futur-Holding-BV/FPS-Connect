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
  declaratiesTable,
  verlofAanvragenTable,
  verlofAanvraagLogTable,
  verlofsoortenTable,
  medewerkersTable,
  gebruikersTable,
} from "@workspace/db";
import { eq, and, count, desc, isNull, isNotNull } from "drizzle-orm";
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

router.get("/boekhouder/dashboard", portaal, async (req: Request, res: Response): Promise<void> => {
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

  return void res.json({
    werkgever_id: werkgeverId ?? 0,
    werkgever_naam: werkgeverNaam,
    openstaande_mutaties: Number(mutatiesRij?.n ?? 0),
    wachtend_loon_output: Number(loonRij?.n ?? 0),
    eigen_uploads: Number(uploadsRij?.n ?? 0),
    sepa_bestanden: Number(sepaRij?.n ?? 0),
    scab_mails_concept: Number(scabRij?.n ?? 0),
  });
});

router.get("/boekhouder/uploads", portaal, async (req: Request, res: Response): Promise<void> => {
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

  return void res.json(rows.map(mapUpload));
});

router.post(
  "/boekhouder/uploads",
  uploaden,
  upload.single("bestand"),
  async (req: Request, res: Response): Promise<void> => {
    const bestand = req.file;
    if (!bestand) return void res.status(400).json({ message: "Bestand ontbreekt" });

    const sess = req.session as { userId?: number; gebruikerNaam?: string };
    const { map, werkgever_id, periode_jaar, periode_maand, omschrijving } = req.body;

    if (!map) return void res.status(400).json({ message: "map is verplicht" });

    const mimeType = bestand.mimetype || "application/octet-stream";
    const subPath = `boekhouder-uploads/${Date.now()}-${bestand.originalname}`;
    let objectPath: string;
    try {
      objectPath = await storage.uploadBestand(subPath, bestand.buffer, mimeType);
    } catch (err) {
      req.log.error({ err }, "Upload boekhouder-document mislukt");
      return void res.status(500).json({ message: "Upload mislukt" });
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

    return void res.status(201).json(mapUpload(rij));
  }
);

// ─── LOON_01 Schakel 2: goedgekeurde declaraties en verlof voor de loonstrook ─
//
// De boekhouder ziet uitsluitend GOEDGEKEURDE posten en markeert ze als
// verwerkt zodra ze op de loonstrook staan — daarna verdwijnen ze uit de
// openstaande lijst, zodat niets dubbel verwerkt wordt. Alles onder de
// boekhouder_portaal-bevoegdheid: hij heeft géén declaratie- of HRM-rechten
// nodig (en dus ook geen toegang tot facturen/projecten/offertes).

router.get("/boekhouder/declaraties", portaal, async (req: Request, res: Response): Promise<void> => {
  const toonVerwerkt = String(req.query["verwerkt"] ?? "") === "true";
  const beoordelaar = { naam: gebruikersTable.naam };
  const rows = await db
    .select({
      d: declaratiesTable,
      medewerkerNaam: medewerkersTable.naam,
      goedgekeurdDoorNaam: beoordelaar.naam,
    })
    .from(declaratiesTable)
    .leftJoin(medewerkersTable, eq(medewerkersTable.id, declaratiesTable.medewerkerId))
    .leftJoin(gebruikersTable, eq(gebruikersTable.id, declaratiesTable.beoordeeldDoor))
    .where(toonVerwerkt
      ? and(eq(declaratiesTable.status, "verwerkt"), isNotNull(declaratiesTable.verwerkingOp))
      : eq(declaratiesTable.status, "goedgekeurd"))
    .orderBy(desc(declaratiesTable.beoordeeldOp))
    .limit(300);

  return void res.json(rows.map(({ d, medewerkerNaam, goedgekeurdDoorNaam }) => ({
    id: d.id,
    medewerker_naam: medewerkerNaam ?? `Medewerker #${d.medewerkerId}`,
    categorie: d.categorie,
    omschrijving: d.omschrijving,
    bedrag_totaal_cents: d.bedragTotaalCents,
    datum: d.datum,
    status: d.status,
    goedgekeurd_op: d.beoordeeldOp ? d.beoordeeldOp.toISOString() : null,
    goedgekeurd_door_naam: goedgekeurdDoorNaam,
    verwerkt_op: d.verwerkingOp ? d.verwerkingOp.toISOString() : null,
  })));
});

router.post("/boekhouder/declaraties/:id/verwerken", uploaden, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(String(req.params["id"] ?? "0"), 10);
  const sess = req.session as { userId?: number };

  // Alleen een goedgekeurde declaratie kan verwerkt worden — en maar één keer.
  const [rij] = await db.update(declaratiesTable)
    .set({
      status: "verwerkt",
      verwerkingOp: new Date(),
      verwerktDoor: sess.userId ?? null,
      bijgewerktOp: new Date(),
    })
    .where(and(eq(declaratiesTable.id, id), eq(declaratiesTable.status, "goedgekeurd")))
    .returning();

  if (!rij) return void res.status(409).json({ message: "Declaratie is niet goedgekeurd of is al verwerkt" });
  return void res.json({ id: rij.id, status: rij.status, verwerkt_op: rij.verwerkingOp?.toISOString() ?? null });
});

router.get("/boekhouder/verlof", portaal, async (req: Request, res: Response): Promise<void> => {
  const toonVerwerkt = String(req.query["verwerkt"] ?? "") === "true";
  const rows = await db
    .select({
      v: verlofAanvragenTable,
      medewerkerNaam: medewerkersTable.naam,
      verlofsoortNaam: verlofsoortenTable.naam,
      goedgekeurdDoorNaam: gebruikersTable.naam,
    })
    .from(verlofAanvragenTable)
    .leftJoin(medewerkersTable, eq(medewerkersTable.id, verlofAanvragenTable.medewerkerId))
    .leftJoin(verlofsoortenTable, eq(verlofsoortenTable.id, verlofAanvragenTable.verlofsoortId))
    .leftJoin(gebruikersTable, eq(gebruikersTable.id, verlofAanvragenTable.beoordeeldDoorId))
    .where(and(
      eq(verlofAanvragenTable.status, "goedgekeurd"),
      toonVerwerkt
        ? isNotNull(verlofAanvragenTable.boekhouderVerwerktOp)
        : isNull(verlofAanvragenTable.boekhouderVerwerktOp),
    ))
    .orderBy(desc(verlofAanvragenTable.beoordeeldOp))
    .limit(300);

  return void res.json(rows.map(({ v, medewerkerNaam, verlofsoortNaam, goedgekeurdDoorNaam }) => ({
    id: v.id,
    medewerker_naam: medewerkerNaam ?? `Medewerker #${v.medewerkerId}`,
    verlofsoort_naam: verlofsoortNaam ?? "Onbekend",
    start_datum: v.startDatum,
    eind_datum: v.eindDatum,
    aantal_uren: v.aantalUren,
    goedgekeurd_op: v.beoordeeldOp ? v.beoordeeldOp.toISOString() : null,
    goedgekeurd_door_naam: goedgekeurdDoorNaam,
    verwerkt_op: v.boekhouderVerwerktOp ? v.boekhouderVerwerktOp.toISOString() : null,
  })));
});

router.post("/boekhouder/verlof/:id/verwerken", uploaden, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(String(req.params["id"] ?? "0"), 10);
  const sess = req.session as { userId?: number };

  const [rij] = await db.update(verlofAanvragenTable)
    .set({
      boekhouderVerwerktOp: new Date(),
      boekhouderVerwerktDoorId: sess.userId ?? null,
      bijgewerktOp: new Date(),
    })
    .where(and(
      eq(verlofAanvragenTable.id, id),
      eq(verlofAanvragenTable.status, "goedgekeurd"),
      isNull(verlofAanvragenTable.boekhouderVerwerktOp),
    ))
    .returning();

  if (!rij) return void res.status(409).json({ message: "Verlofaanvraag is niet goedgekeurd of is al verwerkt" });

  await db.insert(verlofAanvraagLogTable).values({
    verlofaanvraagId: rij.id,
    medewerkerId: rij.medewerkerId,
    uitgevoerdDoorId: sess.userId ?? null,
    actie: "loon_verwerkt",
    oudStatus: "goedgekeurd",
    nieuwStatus: "goedgekeurd",
    opmerking: "Door de boekhouder gemarkeerd als verwerkt op de loonstrook",
  });

  return void res.json({ id: rij.id, verwerkt_op: rij.boekhouderVerwerktOp?.toISOString() ?? null });
});

export default router;
