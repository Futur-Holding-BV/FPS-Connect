import { Router } from "express";
import { db } from "@workspace/db";
import {
  opnamesTable,
  opnameItemsTable,
  opnameFotosTable,
  gebouwenTable,
  verdiepingenTable,
  gebruikersTable,
} from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { ObjectStorageService } from "../lib/objectStorage.js";

const router = Router();
const objectStorage = new ObjectStorageService();

// ─── helpers ──────────────────────────────────────────────────────────────────

function fotoUrl(objectPath: string): string {
  return `/api/storage/objects/${encodeURIComponent(objectPath.replace(/^\/objects\//, ""))}`;
}

async function opnameMetItems(id: number) {
  const [opname] = await db
    .select({
      id: opnamesTable.id,
      gebouw_id: opnamesTable.gebouwId,
      gebouw_naam: gebouwenTable.naam,
      naam: opnamesTable.naam,
      datum: opnamesTable.datum,
      status: opnamesTable.status,
      notities: opnamesTable.notities,
      aangemaakt_door_naam: gebruikersTable.naam,
      aangemaakt_op: opnamesTable.aangemaaktOp,
      bijgewerkt_op: opnamesTable.bijgewerktOp,
    })
    .from(opnamesTable)
    .leftJoin(gebouwenTable, eq(opnamesTable.gebouwId, gebouwenTable.id))
    .leftJoin(gebruikersTable, eq(opnamesTable.aangemaaktDoorId, gebruikersTable.id))
    .where(eq(opnamesTable.id, id))
    .limit(1);

  if (!opname) return null;

  const items = await db
    .select({
      id: opnameItemsTable.id,
      opname_id: opnameItemsTable.opnameId,
      spot_type: opnameItemsTable.spotType,
      ruimte: opnameItemsTable.ruimte,
      verdieping_id: opnameItemsTable.verdiepingId,
      verdieping_naam: verdiepingenTable.naam,
      beschrijving: opnameItemsTable.beschrijving,
      actie: opnameItemsTable.actie,
      bereikbaarheid: opnameItemsTable.bereikbaarheid,
      aantal: opnameItemsTable.aantal,
      afmetingen: opnameItemsTable.afmetingen,
      prioriteit: opnameItemsTable.prioriteit,
      notities: opnameItemsTable.notities,
      afgerond: opnameItemsTable.afgerond,
      aangemaakt_op: opnameItemsTable.aangemaaktOp,
      bijgewerkt_op: opnameItemsTable.bijgewerktOp,
    })
    .from(opnameItemsTable)
    .leftJoin(verdiepingenTable, eq(opnameItemsTable.verdiepingId, verdiepingenTable.id))
    .where(eq(opnameItemsTable.opnameId, id))
    .orderBy(opnameItemsTable.id);

  const itemsMetFotos = await Promise.all(
    items.map(async (item) => {
      const fotos = await db
        .select()
        .from(opnameFotosTable)
        .where(eq(opnameFotosTable.itemId, item.id))
        .orderBy(opnameFotosTable.id);

      return {
        ...item,
        fotos: fotos.map((f) => ({
          id: f.id,
          item_id: f.itemId,
          object_path: f.objectPath,
          url: fotoUrl(f.objectPath),
          bijschrift: f.bijschrift,
          aangemaakt_op: f.aangemaaktOp,
        })),
      };
    }),
  );

  return { ...opname, items: itemsMetFotos };
}

// ─── GET /opname ──────────────────────────────────────────────────────────────

router.get("/opname", requireAuth, async (req, res) => {
  const gebouwId = req.query.gebouw_id ? Number(req.query.gebouw_id) : undefined;
  const status = req.query.status as string | undefined;

  const rows = await db
    .select({
      id: opnamesTable.id,
      gebouw_id: opnamesTable.gebouwId,
      gebouw_naam: gebouwenTable.naam,
      naam: opnamesTable.naam,
      datum: opnamesTable.datum,
      status: opnamesTable.status,
      notities: opnamesTable.notities,
      aangemaakt_door_naam: gebruikersTable.naam,
      aangemaakt_op: opnamesTable.aangemaaktOp,
      bijgewerkt_op: opnamesTable.bijgewerktOp,
      aantal_items: sql<number>`(
        SELECT COUNT(*)::int FROM opname_items WHERE opname_id = ${opnamesTable.id}
      )`,
    })
    .from(opnamesTable)
    .leftJoin(gebouwenTable, eq(opnamesTable.gebouwId, gebouwenTable.id))
    .leftJoin(gebruikersTable, eq(opnamesTable.aangemaaktDoorId, gebruikersTable.id))
    .where(
      and(
        gebouwId != null ? eq(opnamesTable.gebouwId, gebouwId) : undefined,
        status ? eq(opnamesTable.status, status) : undefined,
      ),
    )
    .orderBy(desc(opnamesTable.bijgewerktOp));

  res.json(rows);
});

// ─── POST /opname ─────────────────────────────────────────────────────────────

router.post("/opname", requireAuth, async (req, res) => {
  const { gebouw_id, naam, datum, notities } = req.body as {
    gebouw_id: number;
    naam: string;
    datum: string;
    notities?: string;
  };

  if (!gebouw_id || !naam || !datum) {
    res.status(400).json({ fout: "gebouw_id, naam en datum zijn verplicht" });
    return;
  }

  const [nieuw] = await db
    .insert(opnamesTable)
    .values({
      gebouwId: gebouw_id,
      naam,
      datum,
      notities: notities ?? null,
      aangemaaktDoorId: (req.session as { gebruikerId?: number }).gebruikerId ?? null,
    })
    .returning();

  const volledig = await opnameMetItems(nieuw.id);
  res.status(201).json(volledig);
});

// ─── GET /opname/:id ──────────────────────────────────────────────────────────

router.get("/opname/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const opname = await opnameMetItems(id);
  if (!opname) { res.status(404).json({ fout: "Niet gevonden" }); return; }
  res.json(opname);
});

// ─── PATCH /opname/:id ────────────────────────────────────────────────────────

router.patch("/opname/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { naam, datum, notities, status } = req.body as {
    naam?: string;
    datum?: string;
    notities?: string | null;
    status?: string;
  };

  const updates: Record<string, unknown> = { bijgewerktOp: new Date() };
  if (naam !== undefined) updates.naam = naam;
  if (datum !== undefined) updates.datum = datum;
  if (notities !== undefined) updates.notities = notities;
  if (status !== undefined) updates.status = status;

  const [updated] = await db
    .update(opnamesTable)
    .set(updates)
    .where(eq(opnamesTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ fout: "Niet gevonden" }); return; }
  const volledig = await opnameMetItems(id);
  res.json(volledig);
});

// ─── DELETE /opname/:id ───────────────────────────────────────────────────────

router.delete("/opname/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const [deleted] = await db
    .delete(opnamesTable)
    .where(eq(opnamesTable.id, id))
    .returning();
  if (!deleted) { res.status(404).json({ fout: "Niet gevonden" }); return; }
  res.status(204).send();
});

// ─── POST /opname/:id/definitief ──────────────────────────────────────────────

router.post("/opname/:id/definitief", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const [bestaand] = await db
    .select({ status: opnamesTable.status })
    .from(opnamesTable)
    .where(eq(opnamesTable.id, id))
    .limit(1);

  if (!bestaand) { res.status(404).json({ fout: "Niet gevonden" }); return; }
  if (bestaand.status === "definitief") { res.status(409).json({ fout: "Al definitief" }); return; }

  await db
    .update(opnamesTable)
    .set({ status: "definitief", bijgewerktOp: new Date() })
    .where(eq(opnamesTable.id, id));

  const volledig = await opnameMetItems(id);
  res.json(volledig);
});

// ─── GET /opname/:id/items ────────────────────────────────────────────────────

router.get("/opname/:id/items", requireAuth, async (req, res) => {
  const opnameId = Number(req.params.id);
  const opname = await opnameMetItems(opnameId);
  if (!opname) { res.status(404).json({ fout: "Niet gevonden" }); return; }
  res.json(opname.items);
});

// ─── POST /opname/:id/items ───────────────────────────────────────────────────

router.post("/opname/:id/items", requireAuth, async (req, res) => {
  const opnameId = Number(req.params.id);
  const {
    spot_type, ruimte, verdieping_id, beschrijving,
    actie, bereikbaarheid, aantal, afmetingen, prioriteit, notities, afgerond,
  } = req.body as {
    spot_type: string;
    ruimte?: string;
    verdieping_id?: number;
    beschrijving?: string;
    actie?: string;
    bereikbaarheid?: string;
    aantal?: number;
    afmetingen?: string;
    prioriteit?: string;
    notities?: string;
    afgerond?: boolean;
  };

  if (!spot_type) {
    res.status(400).json({ fout: "spot_type is verplicht" });
    return;
  }

  const [bestaand] = await db
    .select({ id: opnamesTable.id })
    .from(opnamesTable)
    .where(eq(opnamesTable.id, opnameId))
    .limit(1);
  if (!bestaand) { res.status(404).json({ fout: "Opname niet gevonden" }); return; }

  const [nieuw] = await db
    .insert(opnameItemsTable)
    .values({
      opnameId,
      spotType: spot_type,
      ruimte: ruimte ?? null,
      verdiepingId: verdieping_id ?? null,
      beschrijving: beschrijving ?? null,
      actie: actie ?? "controleren",
      bereikbaarheid: bereikbaarheid ?? "goed",
      aantal: aantal ?? 1,
      afmetingen: afmetingen ?? null,
      prioriteit: prioriteit ?? "normaal",
      notities: notities ?? null,
      afgerond: afgerond ?? false,
    })
    .returning();

  await db
    .update(opnamesTable)
    .set({ bijgewerktOp: new Date() })
    .where(eq(opnamesTable.id, opnameId));

  const fotos: never[] = [];
  res.status(201).json({ ...nieuw, spot_type: nieuw.spotType, opname_id: nieuw.opnameId,
    ruimte: nieuw.ruimte, verdieping_id: nieuw.verdiepingId, verdieping_naam: null,
    bereikbaarheid: nieuw.bereikbaarheid, afmetingen: nieuw.afmetingen,
    aangemaakt_op: nieuw.aangemaaktOp, bijgewerkt_op: nieuw.bijgewerktOp, fotos });
});

// ─── GET /opname/items/:itemId ────────────────────────────────────────────────

router.get("/opname/items/:itemId", requireAuth, async (req, res) => {
  const itemId = Number(req.params.itemId);
  const [item] = await db
    .select({
      id: opnameItemsTable.id,
      opname_id: opnameItemsTable.opnameId,
      spot_type: opnameItemsTable.spotType,
      ruimte: opnameItemsTable.ruimte,
      verdieping_id: opnameItemsTable.verdiepingId,
      verdieping_naam: verdiepingenTable.naam,
      beschrijving: opnameItemsTable.beschrijving,
      actie: opnameItemsTable.actie,
      bereikbaarheid: opnameItemsTable.bereikbaarheid,
      aantal: opnameItemsTable.aantal,
      afmetingen: opnameItemsTable.afmetingen,
      prioriteit: opnameItemsTable.prioriteit,
      notities: opnameItemsTable.notities,
      afgerond: opnameItemsTable.afgerond,
      aangemaakt_op: opnameItemsTable.aangemaaktOp,
      bijgewerkt_op: opnameItemsTable.bijgewerktOp,
    })
    .from(opnameItemsTable)
    .leftJoin(verdiepingenTable, eq(opnameItemsTable.verdiepingId, verdiepingenTable.id))
    .where(eq(opnameItemsTable.id, itemId))
    .limit(1);

  if (!item) { res.status(404).json({ fout: "Niet gevonden" }); return; }

  const fotos = await db
    .select()
    .from(opnameFotosTable)
    .where(eq(opnameFotosTable.itemId, itemId))
    .orderBy(opnameFotosTable.id);

  res.json({
    ...item,
    fotos: fotos.map((f) => ({
      id: f.id,
      item_id: f.itemId,
      object_path: f.objectPath,
      url: fotoUrl(f.objectPath),
      bijschrift: f.bijschrift,
      aangemaakt_op: f.aangemaaktOp,
    })),
  });
});

// ─── PATCH /opname/items/:itemId ──────────────────────────────────────────────

router.patch("/opname/items/:itemId", requireAuth, async (req, res) => {
  const itemId = Number(req.params.itemId);
  const velden = req.body as Record<string, unknown>;

  const toegestaan = [
    "spot_type", "ruimte", "verdieping_id", "beschrijving",
    "actie", "bereikbaarheid", "aantal", "afmetingen", "prioriteit", "notities", "afgerond",
  ];

  const camelMap: Record<string, string> = {
    spot_type: "spotType",
    verdieping_id: "verdiepingId",
    aangemaakt_op: "aangemaaktOp",
    bijgewerkt_op: "bijgewerktOp",
  };

  const updates: Record<string, unknown> = { bijgewerktOp: new Date() };
  for (const key of toegestaan) {
    if (key in velden) {
      const dbKey = camelMap[key] ?? key;
      updates[dbKey] = velden[key] ?? null;
    }
  }

  const [updated] = await db
    .update(opnameItemsTable)
    .set(updates)
    .where(eq(opnameItemsTable.id, itemId))
    .returning();

  if (!updated) { res.status(404).json({ fout: "Niet gevonden" }); return; }

  await db
    .update(opnamesTable)
    .set({ bijgewerktOp: new Date() })
    .where(eq(opnamesTable.id, updated.opnameId));

  const fotos = await db
    .select()
    .from(opnameFotosTable)
    .where(eq(opnameFotosTable.itemId, itemId))
    .orderBy(opnameFotosTable.id);

  const [verdieping] = updated.verdiepingId
    ? await db
        .select({ naam: verdiepingenTable.naam })
        .from(verdiepingenTable)
        .where(eq(verdiepingenTable.id, updated.verdiepingId))
        .limit(1)
    : [{ naam: null }];

  res.json({
    id: updated.id,
    opname_id: updated.opnameId,
    spot_type: updated.spotType,
    ruimte: updated.ruimte,
    verdieping_id: updated.verdiepingId,
    verdieping_naam: verdieping?.naam ?? null,
    beschrijving: updated.beschrijving,
    actie: updated.actie,
    bereikbaarheid: updated.bereikbaarheid,
    aantal: updated.aantal,
    afmetingen: updated.afmetingen,
    prioriteit: updated.prioriteit,
    notities: updated.notities,
    afgerond: updated.afgerond,
    aangemaakt_op: updated.aangemaaktOp,
    bijgewerkt_op: updated.bijgewerktOp,
    fotos: fotos.map((f) => ({
      id: f.id,
      item_id: f.itemId,
      object_path: f.objectPath,
      url: fotoUrl(f.objectPath),
      bijschrift: f.bijschrift,
      aangemaakt_op: f.aangemaaktOp,
    })),
  });
});

// ─── DELETE /opname/items/:itemId ─────────────────────────────────────────────

router.delete("/opname/items/:itemId", requireAuth, async (req, res) => {
  const itemId = Number(req.params.itemId);
  const [deleted] = await db
    .delete(opnameItemsTable)
    .where(eq(opnameItemsTable.id, itemId))
    .returning();
  if (!deleted) { res.status(404).json({ fout: "Niet gevonden" }); return; }
  res.status(204).send();
});

// ─── POST /opname/items/:itemId/fotos ─────────────────────────────────────────

router.post("/opname/items/:itemId/fotos", requireAuth, async (req, res) => {
  const itemId = Number(req.params.itemId);
  const { bestandsnaam, content_type, bijschrift } = req.body as {
    bestandsnaam: string;
    content_type: string;
    bijschrift?: string;
  };

  const [item] = await db
    .select({ id: opnameItemsTable.id, opnameId: opnameItemsTable.opnameId })
    .from(opnameItemsTable)
    .where(eq(opnameItemsTable.id, itemId))
    .limit(1);
  if (!item) { res.status(404).json({ fout: "Item niet gevonden" }); return; }

  const [opname] = await db
    .select({ gebouwId: opnamesTable.gebouwId })
    .from(opnamesTable)
    .where(eq(opnamesTable.id, item.opnameId))
    .limit(1);

  void bestandsnaam; void content_type;

  const { uploadURL, objectPath } = await objectStorage.getObjectEntityUploadURL(
    opname?.gebouwId ?? null,
    "foto",
  );

  const [foto] = await db
    .insert(opnameFotosTable)
    .values({ itemId, objectPath, bijschrift: bijschrift ?? null })
    .returning();

  res.status(201).json({
    upload_url: uploadURL,
    foto: {
      id: foto.id,
      item_id: foto.itemId,
      object_path: foto.objectPath,
      url: fotoUrl(foto.objectPath),
      bijschrift: foto.bijschrift,
      aangemaakt_op: foto.aangemaaktOp,
    },
  });
});

// ─── DELETE /opname/fotos/:fotoId ─────────────────────────────────────────────

router.delete("/opname/fotos/:fotoId", requireAuth, async (req, res) => {
  const fotoId = Number(req.params.fotoId);
  const [deleted] = await db
    .delete(opnameFotosTable)
    .where(eq(opnameFotosTable.id, fotoId))
    .returning();
  if (!deleted) { res.status(404).json({ fout: "Niet gevonden" }); return; }
  res.status(204).send();
});

export default router;
