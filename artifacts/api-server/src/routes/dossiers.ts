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
  documentenTable,
  gebouwenTable,
  gebruikersTable,
} from "@workspace/db";
import { eq, desc, inArray } from "drizzle-orm";
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
    const id = parseId(req.params.id);
    const [bestaand] = await db.select().from(dossiersTable).where(eq(dossiersTable.id, id));
    if (!bestaand) return res.status(404).json({ error: "Dossier niet gevonden" });
    if (bestaand.status === "gearchiveerd") {
      return res.status(409).json({ error: "Een gearchiveerd dossier kan niet definitief worden gemaakt." });
    }
    // Bevriezing (V1.5): leg in één transactie de actuele revisie + PDF van elk
    // gekoppeld bibliotheekdocument vast, zodat latere revisies het definitieve
    // dossier niet meer wijzigen. Losse uploads (zonder documentId) en reeds
    // bevroren items blijven ongemoeid; ontbrekende documenten zijn orphan-tolerant.
    const d = await db.transaction(async (tx) => {
      const items = await tx
        .select()
        .from(dossierDocumentenTable)
        .where(eq(dossierDocumentenTable.dossierId, id));
      const teBevriezen = items.filter((it) => it.documentId != null && it.bevrorenOp == null);
      if (teBevriezen.length > 0) {
        const docIds = teBevriezen.map((it) => it.documentId as number);
        const docs = await tx
          .select({
            id: documentenTable.id,
            revisieNummer: documentenTable.revisieNummer,
            pdfUrl: documentenTable.pdfUrl,
          })
          .from(documentenTable)
          .where(inArray(documentenTable.id, docIds));
        const docMap = new Map(docs.map((x) => [x.id, x]));
        const nu = new Date();
        for (const it of teBevriezen) {
          const doc = docMap.get(it.documentId as number);
          if (!doc) continue;
          await tx
            .update(dossierDocumentenTable)
            .set({
              bevrorenRevisieNummer: doc.revisieNummer,
              bevrorenPdfUrl: doc.pdfUrl,
              bevrorenOp: nu,
              bijgewerktOp: nu,
            })
            .where(eq(dossierDocumentenTable.id, it.id));
        }
      }
      const [bij] = await tx
        .update(dossiersTable)
        .set({ status: "definitief", definitiefOp: new Date(), bijgewerktOp: new Date() })
        .where(eq(dossiersTable.id, id))
        .returning();
      return bij;
    });
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
const mapDossierDocument = (
  x: typeof dossierDocumentenTable.$inferSelect,
  actueleRevisie: number | null = null,
) => ({
  id: x.id,
  dossier_id: x.dossierId,
  document_id: x.documentId,
  naam: x.naam,
  bestand_url: x.bestandUrl,
  categorie: x.categorie,
  status: x.status,
  versie: x.versie,
  toegevoegd_door_id: x.toegevoegdDoorId,
  bevroren_revisie_nummer: x.bevrorenRevisieNummer ?? null,
  bevroren_pdf_url: x.bevrorenPdfUrl ?? null,
  bevroren_op: isoOf(x.bevrorenOp),
  actuele_revisie_nummer: actueleRevisie,
  aangemaakt_op: iso(x.aangemaaktOp),
  bijgewerkt_op: iso(x.bijgewerktOp),
});

// Resolvet per gekoppeld bibliotheekdocument het hoogste revisienummer in zijn
// groep, zodat de UI "nieuwere revisie beschikbaar" kan tonen bij een bevroren item.
async function actueleRevisiePerDocument(
  documentIds: (number | null)[],
): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  const uniek = Array.from(
    new Set(documentIds.filter((n): n is number => Number.isInteger(n))),
  );
  if (uniek.length === 0) return out;
  const docs = await db
    .select({
      id: documentenTable.id,
      groepId: documentenTable.groepId,
      revisieNummer: documentenTable.revisieNummer,
    })
    .from(documentenTable)
    .where(inArray(documentenTable.id, uniek));
  const groepIds = Array.from(new Set(docs.map((d) => d.groepId)));
  if (groepIds.length === 0) return out;
  const alle = await db
    .select({
      groepId: documentenTable.groepId,
      revisieNummer: documentenTable.revisieNummer,
    })
    .from(documentenTable)
    .where(inArray(documentenTable.groepId, groepIds));
  const maxPerGroep = new Map<string, number>();
  for (const r of alle) {
    const huidig = maxPerGroep.get(r.groepId) ?? 0;
    if (r.revisieNummer > huidig) maxPerGroep.set(r.groepId, r.revisieNummer);
  }
  for (const d of docs) out.set(d.id, maxPerGroep.get(d.groepId) ?? d.revisieNummer);
  return out;
}

router.get("/dossiers/:id/documenten", lezen, async (req, res) => {
  try {
    const rijen = await db
      .select()
      .from(dossierDocumentenTable)
      .where(eq(dossierDocumentenTable.dossierId, parseId(req.params.id)))
      .orderBy(desc(dossierDocumentenTable.aangemaaktOp));
    const actueel = await actueleRevisiePerDocument(rijen.map((r) => r.documentId));
    res.json(
      rijen.map((r) =>
        mapDossierDocument(
          r,
          r.documentId != null ? (actueel.get(r.documentId) ?? null) : null,
        ),
      ),
    );
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
    const actueel = await actueleRevisiePerDocument([x.documentId]);
    res.status(201).json(
      mapDossierDocument(x, x.documentId != null ? (actueel.get(x.documentId) ?? null) : null),
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.patch("/dossier-documenten/:id", schrijven, async (req, res) => {
  try {
    const ddId = parseId(req.params.id);
    const [bestaand] = await db
      .select()
      .from(dossierDocumentenTable)
      .where(eq(dossierDocumentenTable.id, ddId));
    if (!bestaand) return res.status(404).json({ error: "Dossierdocument niet gevonden" });
    // Bevriezing afdwingen: documenten van een definitief/gearchiveerd dossier
    // mogen niet meer wijzigen (niet alleen in de UI, ook server-side).
    const [dossier] = await db
      .select({ status: dossiersTable.status })
      .from(dossiersTable)
      .where(eq(dossiersTable.id, bestaand.dossierId));
    if (dossier && (dossier.status === "definitief" || dossier.status === "gearchiveerd")) {
      return res.status(409).json({
        error: "Documenten van een definitief of gearchiveerd dossier kunnen niet worden gewijzigd.",
      });
    }
    const { naam, document_id, bestand_url, categorie, status, versie } = req.body;
    const [x] = await db
      .update(dossierDocumentenTable)
      .set({ naam, documentId: document_id ?? null, bestandUrl: bestand_url, categorie, status, versie, bijgewerktOp: new Date() })
      .where(eq(dossierDocumentenTable.id, ddId))
      .returning();
    if (!x) return res.status(404).json({ error: "Dossierdocument niet gevonden" });
    const actueel = await actueleRevisiePerDocument([x.documentId]);
    res.json(
      mapDossierDocument(x, x.documentId != null ? (actueel.get(x.documentId) ?? null) : null),
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.delete("/dossier-documenten/:id", schrijven, async (req, res) => {
  try {
    const ddId = parseId(req.params.id);
    const [bestaand] = await db
      .select()
      .from(dossierDocumentenTable)
      .where(eq(dossierDocumentenTable.id, ddId));
    if (!bestaand) return res.status(404).json({ error: "Dossierdocument niet gevonden" });
    const [dossier] = await db
      .select({ status: dossiersTable.status })
      .from(dossiersTable)
      .where(eq(dossiersTable.id, bestaand.dossierId));
    if (dossier && (dossier.status === "definitief" || dossier.status === "gearchiveerd")) {
      return res.status(409).json({
        error: "Documenten van een definitief of gearchiveerd dossier kunnen niet worden verwijderd.",
      });
    }
    await db.delete(dossierDocumentenTable).where(eq(dossierDocumentenTable.id, ddId));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
