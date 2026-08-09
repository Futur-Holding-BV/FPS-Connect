// Actiepunten — persoonlijke to-dolijst van de hoofdbeheerder in de zijrand.
// Houdt bij waar het platform op een mens wacht (Azure, mailing, VPS,
// app-store-accounts). Alleen de hoofdbeheerder ziet en beheert deze lijst.
import { Router } from "express";
import { db, actiepuntenTable } from "@workspace/db";
import { asc, eq } from "drizzle-orm";
import { requireRol } from "../middlewares/auth";

const router = Router();

const mapPunt = (a: typeof actiepuntenTable.$inferSelect) => ({
  id: a.id,
  titel: a.titel,
  omschrijving: a.omschrijving,
  categorie: a.categorie,
  status: a.status,
  volgorde: a.volgorde,
  afgerond_op: a.afgerondOp?.toISOString() ?? null,
  aangemaakt_op: a.aangemaaktOp.toISOString(),
});

router.get("/actiepunten", requireRol("hoofdbeheerder"), async (_req, res): Promise<void> => {
  const rijen = await db.select().from(actiepuntenTable)
    .orderBy(asc(actiepuntenTable.volgorde), asc(actiepuntenTable.id));
  res.json(rijen.map(mapPunt));
});

router.post("/actiepunten", requireRol("hoofdbeheerder"), async (req, res): Promise<void> => {
  const { titel, omschrijving, categorie } = req.body;
  if (!titel || !String(titel).trim()) return void res.status(400).json({ error: "titel is verplicht" });
  const [rij] = await db.insert(actiepuntenTable).values({
    titel: String(titel).trim(),
    omschrijving: omschrijving ? String(omschrijving) : null,
    categorie: categorie ? String(categorie) : "overig",
    // Nieuw punt onderaan: hoogste volgorde + 10.
    volgorde: ((await db.select({ v: actiepuntenTable.volgorde }).from(actiepuntenTable).orderBy(asc(actiepuntenTable.volgorde))).at(-1)?.v ?? 0) + 10,
    bijgewerktOp: new Date(),
  }).returning();
  res.status(201).json(mapPunt(rij));
});

router.patch("/actiepunten/:id", requireRol("hoofdbeheerder"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [bestaand] = await db.select().from(actiepuntenTable).where(eq(actiepuntenTable.id, id)).limit(1);
  if (!bestaand) return void res.status(404).json({ error: "Actiepunt niet gevonden" });
  const { titel, omschrijving, categorie, status } = req.body;
  if (status !== undefined && status !== "open" && status !== "afgerond") {
    return void res.status(400).json({ error: "status moet 'open' of 'afgerond' zijn" });
  }
  const [rij] = await db.update(actiepuntenTable).set({
    titel: titel !== undefined ? String(titel).trim() : bestaand.titel,
    omschrijving: omschrijving !== undefined ? (omschrijving ? String(omschrijving) : null) : bestaand.omschrijving,
    categorie: categorie !== undefined ? String(categorie) : bestaand.categorie,
    status: status !== undefined ? status : bestaand.status,
    afgerondOp: status === "afgerond" ? (bestaand.afgerondOp ?? new Date()) : status === "open" ? null : bestaand.afgerondOp,
    bijgewerktOp: new Date(),
  }).where(eq(actiepuntenTable.id, id)).returning();
  res.json(mapPunt(rij));
});

router.delete("/actiepunten/:id", requireRol("hoofdbeheerder"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const rijen = await db.delete(actiepuntenTable).where(eq(actiepuntenTable.id, id)).returning({ id: actiepuntenTable.id });
  if (!rijen.length) return void res.status(404).json({ error: "Actiepunt niet gevonden" });
  res.status(204).end();
});

export default router;
