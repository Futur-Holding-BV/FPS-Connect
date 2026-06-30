import { Router } from "express";
import { db } from "@workspace/db";
import {
  werkbonnenTable,
  onderhoudscontractenTable,
  gebouwenTable,
  gebruikersTable,
} from "@workspace/db";
import { eq, sql, count } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { logActiviteit } from "../lib/activiteit";

const router = Router();
const lezen = requireBevoegdheid("onderhoud", 1);
const schrijven = requireBevoegdheid("onderhoud", 2);
const aanmaken = requireBevoegdheid("onderhoud", 3);
const verwijderen = requireBevoegdheid("onderhoud", 4);

async function volgendWerkbonnummer(): Promise<string> {
  const jaar = new Date().getFullYear();
  const prefix = `WB-${jaar}-`;
  const [row] = await db
    .select({ max: sql<string>`max(${werkbonnenTable.werkbonnummer})` })
    .from(werkbonnenTable)
    .where(sql`${werkbonnenTable.werkbonnummer} like ${prefix + "%"}`);
  const huidig = row?.max ? parseInt(row.max.split("-")[2] ?? "0", 10) : 0;
  return `${prefix}${String(huidig + 1).padStart(3, "0")}`;
}

async function mapWerkbon(w: typeof werkbonnenTable.$inferSelect) {
  const gebouw = w.gebouwId
    ? await db
        .select({ naam: gebouwenTable.naam })
        .from(gebouwenTable)
        .where(eq(gebouwenTable.id, w.gebouwId))
        .then((r) => r[0])
    : null;

  const contract = w.contractId
    ? await db
        .select({ contractnummer: onderhoudscontractenTable.contractnummer })
        .from(onderhoudscontractenTable)
        .where(eq(onderhoudscontractenTable.id, w.contractId))
        .then((r) => r[0])
    : null;

  const monteur = w.monteurId
    ? await db
        .select({ naam: gebruikersTable.naam })
        .from(gebruikersTable)
        .where(eq(gebruikersTable.id, w.monteurId))
        .then((r) => r[0])
    : null;

  return {
    id: w.id,
    werkbonnummer: w.werkbonnummer,
    contract_id: w.contractId,
    contractnummer: contract?.contractnummer ?? null,
    gebouw_id: w.gebouwId,
    gebouw_naam: gebouw?.naam ?? null,
    titel: w.titel,
    omschrijving: w.omschrijving,
    type: w.type,
    geplande_kwartaal: w.geplande_kwartaal,
    geplande_periode_van: w.geplande_periode_van,
    geplande_periode_tot: w.geplande_periode_tot,
    geplande_datum: w.geplandeDatum,
    uitvoer_datum: w.uitvoerDatum,
    monteur_id: w.monteurId,
    monteur_naam: monteur?.naam ?? null,
    duur_uren: w.duurUren !== null ? parseFloat(w.duurUren as string) : null,
    status: w.status,
    opmerkingen: w.opmerkingen,
    resultaat: w.resultaat,
    aangemaakt_op: w.aangemaaktOp.toISOString(),
    bijgewerkt_op: w.bijgewerktOp.toISOString(),
  };
}

// GET /werkbonnen
router.get("/werkbonnen", lezen, async (req, res) => {
  try {
    const { contract_id, gebouw_id, status, monteur_id } = req.query;

    let werkbonnen = await db.select().from(werkbonnenTable);

    if (contract_id) werkbonnen = werkbonnen.filter((w) => w.contractId === parseInt(contract_id as string));
    if (gebouw_id) werkbonnen = werkbonnen.filter((w) => w.gebouwId === parseInt(gebouw_id as string));
    if (status) werkbonnen = werkbonnen.filter((w) => w.status === status);
    if (monteur_id) werkbonnen = werkbonnen.filter((w) => w.monteurId === parseInt(monteur_id as string));

    const result = await Promise.all(werkbonnen.map(mapWerkbon));
    res.json(result);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /werkbonnen
router.post("/werkbonnen", aanmaken, async (req, res) => {
  try {
    const {
      contract_id, gebouw_id, titel, omschrijving, type,
      geplande_kwartaal, geplande_periode_van, geplande_periode_tot,
      geplande_datum, monteur_id, duur_uren, status, opmerkingen,
    } = req.body;

    if (!titel || !type) {
      return res.status(400).json({ error: "titel en type zijn verplicht" });
    }

    const werkbonnummer = await volgendWerkbonnummer();

    const [w] = await db
      .insert(werkbonnenTable)
      .values({
        werkbonnummer,
        contractId: contract_id ?? null,
        gebouwId: gebouw_id ?? null,
        titel,
        omschrijving: omschrijving ?? null,
        type: type ?? "preventief",
        geplande_kwartaal: geplande_kwartaal ?? null,
        geplande_periode_van: geplande_periode_van ?? null,
        geplande_periode_tot: geplande_periode_tot ?? null,
        geplandeDatum: geplande_datum ?? null,
        monteurId: monteur_id ?? null,
        duurUren: duur_uren ?? null,
        status: status ?? "gepland",
        opmerkingen: opmerkingen ?? null,
      })
      .returning();

    await logActiviteit({
      type: "werkbon_aangemaakt",
      omschrijving: `Werkbon aangemaakt: ${werkbonnummer} — ${titel}`,
      gebouwId: gebouw_id ?? null,
      gebruikerId: req.session.userId,
    });

    res.status(201).json(await mapWerkbon(w));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /werkbonnen/:id
router.get("/werkbonnen/:id", lezen, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) return res.status(400).json({ error: "Ongeldig id" });

    const [w] = await db
      .select()
      .from(werkbonnenTable)
      .where(eq(werkbonnenTable.id, id));

    if (!w) return res.status(404).json({ error: "Werkbon niet gevonden" });
    res.json(await mapWerkbon(w));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// PATCH /werkbonnen/:id
router.patch("/werkbonnen/:id", schrijven, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) return res.status(400).json({ error: "Ongeldig id" });

    const {
      contract_id, gebouw_id, titel, omschrijving, type,
      geplande_kwartaal, geplande_periode_van, geplande_periode_tot,
      geplande_datum, uitvoer_datum, monteur_id, duur_uren,
      status, opmerkingen, resultaat,
    } = req.body;

    const [w] = await db
      .update(werkbonnenTable)
      .set({
        ...(contract_id !== undefined && { contractId: contract_id }),
        ...(gebouw_id !== undefined && { gebouwId: gebouw_id }),
        ...(titel !== undefined && { titel }),
        ...(omschrijving !== undefined && { omschrijving }),
        ...(type !== undefined && { type }),
        ...(geplande_kwartaal !== undefined && { geplande_kwartaal }),
        ...(geplande_periode_van !== undefined && { geplande_periode_van }),
        ...(geplande_periode_tot !== undefined && { geplande_periode_tot }),
        ...(geplande_datum !== undefined && { geplandeDatum: geplande_datum }),
        ...(uitvoer_datum !== undefined && { uitvoerDatum: uitvoer_datum }),
        ...(monteur_id !== undefined && { monteurId: monteur_id }),
        ...(duur_uren !== undefined && { duurUren: duur_uren }),
        ...(status !== undefined && { status }),
        ...(opmerkingen !== undefined && { opmerkingen }),
        ...(resultaat !== undefined && { resultaat }),
        bijgewerktOp: new Date(),
      })
      .where(eq(werkbonnenTable.id, id))
      .returning();

    if (!w) return res.status(404).json({ error: "Werkbon niet gevonden" });

    if (status === "voltooid") {
      await logActiviteit({
        type: "werkbon_voltooid",
        omschrijving: `Werkbon voltooid: ${w.werkbonnummer}`,
        gebouwId: w.gebouwId ?? null,
        gebruikerId: req.session.userId,
      });
    }

    res.json(await mapWerkbon(w));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// DELETE /werkbonnen/:id
router.delete("/werkbonnen/:id", verwijderen, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) return res.status(400).json({ error: "Ongeldig id" });
    await db.delete(werkbonnenTable).where(eq(werkbonnenTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
