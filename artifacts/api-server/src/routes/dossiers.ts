// Dossier-routes (Fase 1) — Parallel spoor, formeel akkoord gebruiker.
//
// Project-/gebouwdossier als laag bovenop de bibliotheek. Dossiers groeperen
// verwijzingen naar bestaande documenten of losse uploads met een eigen
// statusworkflow (concept -> in_behandeling -> ter_review -> definitief ->
// gearchiveerd). Bij definitief/archiveren wordt het tijdstip vastgelegd
// (bevriezing). De audittrail loopt via de bestaande activiteiten-log.
import { Router } from "express";
import {
  db,
  dossiersTable,
  dossierDocumentenTable,
  gebouwenTable,
  gebruikersTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { logActiviteit } from "../lib/activiteit";

const router = Router();

const lezen = requireBevoegdheid("dossiers", 1);
const schrijven = requireBevoegdheid("dossiers", 2);

const iso = (d: Date) => d.toISOString();
const isoOf = (d: Date | null) => (d ? d.toISOString() : null);

function parseId(v: unknown): number {
  return parseInt(String(v), 10);
}

// ── Dossiers ────────────────────────────────────────────────────────────────
router.get("/dossiers", lezen, async (req, res) => {
  try {
    const rijen = await db
      .select({ d: dossiersTable, gebouwNaam: gebouwenTable.naam, aangemaaktDoorNaam: gebruikersTable.naam })
      .from(dossiersTable)
      .leftJoin(gebouwenTable, eq(dossiersTable.gebouwId, gebouwenTable.id))
      .leftJoin(gebruikersTable, eq(dossiersTable.aangemaaktDoorId, gebruikersTable.id))
      .orderBy(desc(dossiersTable.aangemaaktOp));
    res.json(
      rijen.map((r) => ({
        id: r.d.id,
        type: r.d.type,
        gebouw_id: r.d.gebouwId,
        gebouw_naam: r.gebouwNaam ?? null,
        naam: r.d.naam,
        omschrijving: r.d.omschrijving,
        status: r.d.status,
        definitief_op: isoOf(r.d.definitiefOp),
        gearchiveerd_op: isoOf(r.d.gearchiveerdOp),
        aangemaakt_door_id: r.d.aangemaaktDoorId,
        aangemaakt_door_naam: r.aangemaaktDoorNaam ?? null,
        aangemaakt_op: iso(r.d.aangemaaktOp),
        bijgewerkt_op: iso(r.d.bijgewerktOp),
      })),
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

async function dossierNaarJson(d: typeof dossiersTable.$inferSelect) {
  let gebouwNaam: string | null = null;
  if (d.gebouwId != null) {
    const [g] = await db.select({ naam: gebouwenTable.naam }).from(gebouwenTable).where(eq(gebouwenTable.id, d.gebouwId));
    gebouwNaam = g?.naam ?? null;
  }
  let aangemaaktDoorNaam: string | null = null;
  if (d.aangemaaktDoorId != null) {
    const [u] = await db.select({ naam: gebruikersTable.naam }).from(gebruikersTable).where(eq(gebruikersTable.id, d.aangemaaktDoorId));
    aangemaaktDoorNaam = u?.naam ?? null;
  }
  return {
    id: d.id,
    type: d.type,
    gebouw_id: d.gebouwId,
    gebouw_naam: gebouwNaam,
    naam: d.naam,
    omschrijving: d.omschrijving,
    status: d.status,
    definitief_op: isoOf(d.definitiefOp),
    gearchiveerd_op: isoOf(d.gearchiveerdOp),
    aangemaakt_door_id: d.aangemaaktDoorId,
    aangemaakt_door_naam: aangemaaktDoorNaam,
    aangemaakt_op: iso(d.aangemaaktOp),
    bijgewerkt_op: iso(d.bijgewerktOp),
  };
}

router.post("/dossiers", schrijven, async (req, res) => {
  try {
    const { naam, type, gebouw_id, omschrijving, status } = req.body;
    if (!naam) return res.status(400).json({ error: "naam is verplicht" });
    const [d] = await db
      .insert(dossiersTable)
      .values({
        naam,
        type: type || "project",
        gebouwId: gebouw_id ?? null,
        omschrijving,
        status: status || "concept",
        aangemaaktDoorId: req.session.userId ?? null,
      })
      .returning();
    await logActiviteit({
      type: "dossier_aangemaakt",
      omschrijving: `Dossier "${d.naam}" aangemaakt`,
      gebouwId: d.gebouwId,
      gebruikerId: req.session.userId ?? null,
    });
    res.status(201).json(await dossierNaarJson(d));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.get("/dossiers/:id", lezen, async (req, res) => {
  try {
    const [d] = await db.select().from(dossiersTable).where(eq(dossiersTable.id, parseId(req.params.id)));
    if (!d) return res.status(404).json({ error: "Dossier niet gevonden" });
    res.json(await dossierNaarJson(d));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.patch("/dossiers/:id", schrijven, async (req, res) => {
  try {
    const [bestaand] = await db.select().from(dossiersTable).where(eq(dossiersTable.id, parseId(req.params.id)));
    if (!bestaand) return res.status(404).json({ error: "Dossier niet gevonden" });
    if (bestaand.status === "definitief" || bestaand.status === "gearchiveerd") {
      return res.status(409).json({ error: "Een definitief of gearchiveerd dossier kan niet meer worden gewijzigd." });
    }
    const { naam, type, gebouw_id, omschrijving, status } = req.body;
    const [d] = await db
      .update(dossiersTable)
      .set({ naam, type, gebouwId: gebouw_id ?? null, omschrijving, status, bijgewerktOp: new Date() })
      .where(eq(dossiersTable.id, parseId(req.params.id)))
      .returning();
    res.json(await dossierNaarJson(d));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/dossiers/:id/definitief", schrijven, async (req, res) => {
  try {
    const [bestaand] = await db.select().from(dossiersTable).where(eq(dossiersTable.id, parseId(req.params.id)));
    if (!bestaand) return res.status(404).json({ error: "Dossier niet gevonden" });
    if (bestaand.status === "gearchiveerd") {
      return res.status(409).json({ error: "Een gearchiveerd dossier kan niet definitief worden gemaakt." });
    }
    const [d] = await db
      .update(dossiersTable)
      .set({ status: "definitief", definitiefOp: new Date(), bijgewerktOp: new Date() })
      .where(eq(dossiersTable.id, parseId(req.params.id)))
      .returning();
    await logActiviteit({
      type: "dossier_definitief",
      omschrijving: `Dossier "${d.naam}" definitief gemaakt`,
      gebouwId: d.gebouwId,
      gebruikerId: req.session.userId ?? null,
    });
    res.json(await dossierNaarJson(d));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/dossiers/:id/archiveren", schrijven, async (req, res) => {
  try {
    const [bestaand] = await db.select().from(dossiersTable).where(eq(dossiersTable.id, parseId(req.params.id)));
    if (!bestaand) return res.status(404).json({ error: "Dossier niet gevonden" });
    const [d] = await db
      .update(dossiersTable)
      .set({ status: "gearchiveerd", gearchiveerdOp: new Date(), bijgewerktOp: new Date() })
      .where(eq(dossiersTable.id, parseId(req.params.id)))
      .returning();
    await logActiviteit({
      type: "dossier_gearchiveerd",
      omschrijving: `Dossier "${d.naam}" gearchiveerd`,
      gebouwId: d.gebouwId,
      gebruikerId: req.session.userId ?? null,
    });
    res.json(await dossierNaarJson(d));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.delete("/dossiers/:id", schrijven, async (req, res) => {
  try {
    const [bestaand] = await db.select().from(dossiersTable).where(eq(dossiersTable.id, parseId(req.params.id)));
    if (!bestaand) return res.status(404).json({ error: "Dossier niet gevonden" });
    if (bestaand.status === "definitief" || bestaand.status === "gearchiveerd") {
      return res.status(409).json({ error: "Een definitief of gearchiveerd dossier kan niet worden verwijderd." });
    }
    await db.delete(dossiersTable).where(eq(dossiersTable.id, parseId(req.params.id)));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Dossierdocumenten ───────────────────────────────────────────────────────
const mapDossierDocument = (x: typeof dossierDocumentenTable.$inferSelect) => ({
  id: x.id,
  dossier_id: x.dossierId,
  document_id: x.documentId,
  naam: x.naam,
  bestand_url: x.bestandUrl,
  categorie: x.categorie,
  status: x.status,
  versie: x.versie,
  toegevoegd_door_id: x.toegevoegdDoorId,
  aangemaakt_op: iso(x.aangemaaktOp),
  bijgewerkt_op: iso(x.bijgewerktOp),
});

router.get("/dossiers/:id/documenten", lezen, async (req, res) => {
  try {
    const rijen = await db
      .select()
      .from(dossierDocumentenTable)
      .where(eq(dossierDocumentenTable.dossierId, parseId(req.params.id)))
      .orderBy(desc(dossierDocumentenTable.aangemaaktOp));
    res.json(rijen.map(mapDossierDocument));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/dossiers/:id/documenten", schrijven, async (req, res) => {
  try {
    const [dossier] = await db.select().from(dossiersTable).where(eq(dossiersTable.id, parseId(req.params.id)));
    if (!dossier) return res.status(404).json({ error: "Dossier niet gevonden" });
    if (dossier.status === "definitief" || dossier.status === "gearchiveerd") {
      return res.status(409).json({ error: "Aan een definitief of gearchiveerd dossier kunnen geen documenten worden toegevoegd." });
    }
    const { naam, document_id, bestand_url, categorie, status, versie } = req.body;
    if (!naam) return res.status(400).json({ error: "naam is verplicht" });
    const [x] = await db
      .insert(dossierDocumentenTable)
      .values({
        dossierId: parseId(req.params.id),
        naam,
        documentId: document_id ?? null,
        bestandUrl: bestand_url,
        categorie,
        status: status || "concept",
        versie: versie ?? 1,
        toegevoegdDoorId: req.session.userId ?? null,
      })
      .returning();
    res.status(201).json(mapDossierDocument(x));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.patch("/dossier-documenten/:id", schrijven, async (req, res) => {
  try {
    const { naam, document_id, bestand_url, categorie, status, versie } = req.body;
    const [x] = await db
      .update(dossierDocumentenTable)
      .set({ naam, documentId: document_id ?? null, bestandUrl: bestand_url, categorie, status, versie, bijgewerktOp: new Date() })
      .where(eq(dossierDocumentenTable.id, parseId(req.params.id)))
      .returning();
    if (!x) return res.status(404).json({ error: "Dossierdocument niet gevonden" });
    res.json(mapDossierDocument(x));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.delete("/dossier-documenten/:id", schrijven, async (req, res) => {
  try {
    await db.delete(dossierDocumentenTable).where(eq(dossierDocumentenTable.id, parseId(req.params.id)));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
