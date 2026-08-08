// WERKBAK_01 — één werkbak per persoon. Zichtbaarheid volgt bevoegdheid:
// (item.gebruikerId == ik) OF (alleenHoofdbeheerder en ik ben hoofdbeheerder)
// OF (vereisteModule-match via de bevoegdhedenmatrix). Klanten zien nooit iets.
// Items verdwijnen nooit vanzelf: afhandelen of wegzetten-met-reden.
import { Router, type Request } from "express";
import { db, werkbakItemsTable, bewakingDraaienTable, gebruikersTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { draaiBewakingsloop, controleerLoopGezondheid } from "../lib/bewakingsloop";
import type { WerkbakItem } from "@workspace/db";

const router = Router();

function zichtbaarVoor(req: Request, item: WerkbakItem): boolean {
  const p = req.permissies;
  if (!p || p.isKlant) return false;
  if (p.isHoofdbeheerder) return true;
  if (item.gebruikerId != null) return item.gebruikerId === req.session.userId;
  if (item.alleenHoofdbeheerder) return false;
  if (item.vereisteModule) return p.heeftModuleRecht(item.vereisteModule, item.vereistNiveau ?? 1);
  return false;
}

function mapItem(i: WerkbakItem) {
  return {
    id: i.id,
    soort: i.soort,
    bron: i.bron,
    titel: i.titel,
    omschrijving: i.omschrijving,
    gewicht: i.gewicht,
    actie_pad: i.actiePad,
    actie_type: i.actieType,
    herkomst_type: i.herkomstType,
    herkomst_id: i.herkomstId,
    status: i.status,
    weggezet_reden: i.weggezetReden,
    aangemaakt_op: i.aangemaaktOp.toISOString(),
  };
}

async function haalZichtbareOpenItems(req: Request): Promise<WerkbakItem[]> {
  const rijen = await db
    .select()
    .from(werkbakItemsTable)
    .where(eq(werkbakItemsTable.status, "open"))
    .orderBy(desc(werkbakItemsTable.gewicht), desc(werkbakItemsTable.aangemaaktOp));
  return rijen.filter((i) => zichtbaarVoor(req, i));
}

router.get("/werkbak", requireAuth, async (req, res): Promise<void> => {
  try {
    const items = await haalZichtbareOpenItems(req);
    res.json(items.map(mapItem));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.get("/werkbak/aantal", requireAuth, async (req, res): Promise<void> => {
  try {
    const items = await haalZichtbareOpenItems(req);
    res.json({
      totaal: items.length,
      doen: items.filter((i) => i.soort === "doen").length,
      weten: items.filter((i) => i.soort === "weten").length,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

async function laadItem(req: Request): Promise<WerkbakItem | null> {
  const raw = req.params["id"];
  const id = parseInt(typeof raw === "string" ? raw : "", 10);
  if (isNaN(id)) return null;
  const [item] = await db.select().from(werkbakItemsTable).where(eq(werkbakItemsTable.id, id));
  return item ?? null;
}

router.post("/werkbak/:id/afhandelen", requireAuth, async (req, res): Promise<void> => {
  try {
    const item = await laadItem(req);
    if (!item || !zichtbaarVoor(req, item)) { res.status(404).json({ error: "Item niet gevonden" }); return; }
    if (item.status !== "open") { res.status(409).json({ error: "Item is al afgehandeld of weggezet" }); return; }
    const [bijgewerkt] = await db
      .update(werkbakItemsTable)
      .set({ status: "afgehandeld", afgehandeldDoorId: req.session.userId, afgehandeldOp: new Date(), bijgewerktOp: new Date() })
      .where(and(eq(werkbakItemsTable.id, item.id), eq(werkbakItemsTable.status, "open")))
      .returning();
    if (!bijgewerkt) { res.status(409).json({ error: "Item is al afgehandeld of weggezet" }); return; }
    res.json(mapItem(bijgewerkt));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/werkbak/:id/wegzetten", requireAuth, async (req, res): Promise<void> => {
  try {
    const reden = typeof req.body?.reden === "string" ? req.body.reden.trim() : "";
    if (!reden) { res.status(400).json({ error: "Reden is verplicht bij wegzetten" }); return; }
    const item = await laadItem(req);
    if (!item || !zichtbaarVoor(req, item)) { res.status(404).json({ error: "Item niet gevonden" }); return; }
    if (item.status !== "open") { res.status(409).json({ error: "Item is al afgehandeld of weggezet" }); return; }
    const [bijgewerkt] = await db
      .update(werkbakItemsTable)
      .set({ status: "weggezet", weggezetReden: reden, afgehandeldDoorId: req.session.userId, afgehandeldOp: new Date(), bijgewerktOp: new Date() })
      .where(and(eq(werkbakItemsTable.id, item.id), eq(werkbakItemsTable.status, "open")))
      .returning();
    if (!bijgewerkt) { res.status(409).json({ error: "Item is al afgehandeld of weggezet" }); return; }
    res.json(mapItem(bijgewerkt));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// Handmatige draai — alleen hoofdbeheerder (voor bewijs/diagnose; de motor
// draait dagelijks vanzelf).
router.post("/werkbak/bewaking/draai", requireAuth, async (req, res): Promise<void> => {
  try {
    if (!req.permissies?.isHoofdbeheerder) { res.status(403).json({ error: "Geen toegang" }); return; }
    const samenvatting = await draaiBewakingsloop();
    await controleerLoopGezondheid();
    res.json({ samenvatting });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.get("/werkbak/bewaking/draaien", requireAuth, async (req, res): Promise<void> => {
  try {
    if (!req.permissies?.isHoofdbeheerder) { res.status(403).json({ error: "Geen toegang" }); return; }
    const draaien = await db
      .select()
      .from(bewakingDraaienTable)
      .orderBy(desc(bewakingDraaienTable.gestartOp))
      .limit(30);
    res.json(draaien.map((d) => ({
      id: d.id,
      gestart_op: d.gestartOp.toISOString(),
      klaar_op: d.klaarOp?.toISOString() ?? null,
      status: d.status,
      samenvatting: d.samenvatting,
      fout: d.fout,
    })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
