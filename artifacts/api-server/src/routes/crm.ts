import { Router } from "express";
import { db } from "@workspace/db";
import {
  crmKlantenTable,
  crmContactpersonenTable,
  crmOpdrachtenTable,
  crmCommunicatieTable,
  crmCommercieelTable,
  crmFinancieelTable,
  gebouwenTable,
  gebruikersTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireRol, requireBevoegdheid } from "../middlewares/auth";

const router = Router();

const beheerderPlus = requireBevoegdheid("crm", 2);
const alleenHoofdbeheerder = requireRol("hoofdbeheerder");

const iso = (d: Date) => d.toISOString();

function parseId(v: unknown): number {
  return parseInt(String(v), 10);
}

const mapKlant = (k: typeof crmKlantenTable.$inferSelect) => ({
  id: k.id,
  naam: k.naam,
  kvk: k.kvk,
  adres: k.adres,
  postcode: k.postcode,
  stad: k.stad,
  telefoon: k.telefoon,
  email: k.email,
  website: k.website,
  branche: k.branche,
  status: k.status,
  opmerkingen: k.opmerkingen,
  aangemaakt_op: iso(k.aangemaaktOp),
  bijgewerkt_op: iso(k.bijgewerktOp),
});

const mapContactpersoon = (c: typeof crmContactpersonenTable.$inferSelect) => ({
  id: c.id,
  klant_id: c.klantId,
  naam: c.naam,
  functie: c.functie,
  email: c.email,
  telefoon: c.telefoon,
  mobiel: c.mobiel,
  primair: c.primair,
  opmerkingen: c.opmerkingen,
  aangemaakt_op: iso(c.aangemaaktOp),
  bijgewerkt_op: iso(c.bijgewerktOp),
});

const mapCommercieel = (c: typeof crmCommercieelTable.$inferSelect) => ({
  id: c.id,
  klant_id: c.klantId,
  titel: c.titel,
  fase: c.fase,
  waarde: c.waarde,
  kans: c.kans,
  verwachte_sluitdatum: c.verwachteSluitdatum,
  opmerkingen: c.opmerkingen,
  aangemaakt_op: iso(c.aangemaaktOp),
  bijgewerkt_op: iso(c.bijgewerktOp),
});

const mapFinancieel = (f: typeof crmFinancieelTable.$inferSelect) => ({
  id: f.id,
  klant_id: f.klantId,
  type: f.type,
  omschrijving: f.omschrijving,
  bedrag: f.bedrag,
  status: f.status,
  factuurnummer: f.factuurnummer,
  datum: f.datum,
  vervaldatum: f.vervaldatum,
  opmerkingen: f.opmerkingen,
  aangemaakt_op: iso(f.aangemaaktOp),
  bijgewerkt_op: iso(f.bijgewerktOp),
});

// ── KLANTEN ───────────────────────────────────────────────────────────────
router.get("/crm/klanten", beheerderPlus, async (req, res) => {
  try {
    const rijen = await db.select().from(crmKlantenTable).orderBy(crmKlantenTable.naam);
    res.json(rijen.map(mapKlant));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/crm/klanten", beheerderPlus, async (req, res) => {
  try {
    const { naam, kvk, adres, postcode, stad, telefoon, email, website, branche, status, opmerkingen } = req.body;
    if (!naam) return res.status(400).json({ error: "naam is verplicht" });
    const [k] = await db
      .insert(crmKlantenTable)
      .values({ naam, kvk, adres, postcode, stad, telefoon, email, website, branche, status: status || "prospect", opmerkingen })
      .returning();
    res.status(201).json(mapKlant(k));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.get("/crm/klanten/:id", beheerderPlus, async (req, res) => {
  try {
    const [k] = await db.select().from(crmKlantenTable).where(eq(crmKlantenTable.id, parseId(req.params.id)));
    if (!k) return res.status(404).json({ error: "Klant niet gevonden" });
    res.json(mapKlant(k));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.patch("/crm/klanten/:id", beheerderPlus, async (req, res) => {
  try {
    const { naam, kvk, adres, postcode, stad, telefoon, email, website, branche, status, opmerkingen } = req.body;
    const [k] = await db
      .update(crmKlantenTable)
      .set({ naam, kvk, adres, postcode, stad, telefoon, email, website, branche, status, opmerkingen, bijgewerktOp: new Date() })
      .where(eq(crmKlantenTable.id, parseId(req.params.id)))
      .returning();
    if (!k) return res.status(404).json({ error: "Klant niet gevonden" });
    res.json(mapKlant(k));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.delete("/crm/klanten/:id", beheerderPlus, async (req, res) => {
  try {
    await db.delete(crmKlantenTable).where(eq(crmKlantenTable.id, parseId(req.params.id)));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── CONTACTPERSONEN ─────────────────────────────────────────────────────────
router.get("/crm/klanten/:id/contactpersonen", beheerderPlus, async (req, res) => {
  try {
    const rijen = await db
      .select()
      .from(crmContactpersonenTable)
      .where(eq(crmContactpersonenTable.klantId, parseId(req.params.id)))
      .orderBy(desc(crmContactpersonenTable.primair), crmContactpersonenTable.naam);
    res.json(rijen.map(mapContactpersoon));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/crm/klanten/:id/contactpersonen", beheerderPlus, async (req, res) => {
  try {
    const { naam, functie, email, telefoon, mobiel, primair, opmerkingen } = req.body;
    if (!naam) return res.status(400).json({ error: "naam is verplicht" });
    const [c] = await db
      .insert(crmContactpersonenTable)
      .values({ klantId: parseId(req.params.id), naam, functie, email, telefoon, mobiel, primair: !!primair, opmerkingen })
      .returning();
    res.status(201).json(mapContactpersoon(c));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.patch("/crm/contactpersonen/:id", beheerderPlus, async (req, res) => {
  try {
    const { naam, functie, email, telefoon, mobiel, primair, opmerkingen } = req.body;
    const [c] = await db
      .update(crmContactpersonenTable)
      .set({ naam, functie, email, telefoon, mobiel, primair, opmerkingen, bijgewerktOp: new Date() })
      .where(eq(crmContactpersonenTable.id, parseId(req.params.id)))
      .returning();
    if (!c) return res.status(404).json({ error: "Contactpersoon niet gevonden" });
    res.json(mapContactpersoon(c));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.delete("/crm/contactpersonen/:id", beheerderPlus, async (req, res) => {
  try {
    await db.delete(crmContactpersonenTable).where(eq(crmContactpersonenTable.id, parseId(req.params.id)));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── OPDRACHTEN ──────────────────────────────────────────────────────────────
router.get("/crm/klanten/:id/opdrachten", beheerderPlus, async (req, res) => {
  try {
    const rijen = await db
      .select({ o: crmOpdrachtenTable, gebouwNaam: gebouwenTable.naam })
      .from(crmOpdrachtenTable)
      .leftJoin(gebouwenTable, eq(crmOpdrachtenTable.gebouwId, gebouwenTable.id))
      .where(eq(crmOpdrachtenTable.klantId, parseId(req.params.id)))
      .orderBy(desc(crmOpdrachtenTable.aangemaaktOp));
    res.json(
      rijen.map((r) => ({
        id: r.o.id,
        klant_id: r.o.klantId,
        gebouw_id: r.o.gebouwId,
        gebouw_naam: r.gebouwNaam ?? null,
        titel: r.o.titel,
        omschrijving: r.o.omschrijving,
        status: r.o.status,
        waarde: r.o.waarde,
        start_datum: r.o.startDatum,
        eind_datum: r.o.eindDatum,
        aangemaakt_op: iso(r.o.aangemaaktOp),
        bijgewerkt_op: iso(r.o.bijgewerktOp),
      })),
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/crm/klanten/:id/opdrachten", beheerderPlus, async (req, res) => {
  try {
    const { titel, gebouw_id, omschrijving, status, waarde, start_datum, eind_datum } = req.body;
    if (!titel) return res.status(400).json({ error: "titel is verplicht" });
    const [o] = await db
      .insert(crmOpdrachtenTable)
      .values({
        klantId: parseId(req.params.id),
        titel,
        gebouwId: gebouw_id ?? null,
        omschrijving,
        status: status || "nieuw",
        waarde: waarde ?? null,
        startDatum: start_datum,
        eindDatum: eind_datum,
      })
      .returning();
    res.status(201).json({
      id: o.id,
      klant_id: o.klantId,
      gebouw_id: o.gebouwId,
      gebouw_naam: null,
      titel: o.titel,
      omschrijving: o.omschrijving,
      status: o.status,
      waarde: o.waarde,
      start_datum: o.startDatum,
      eind_datum: o.eindDatum,
      aangemaakt_op: iso(o.aangemaaktOp),
      bijgewerkt_op: iso(o.bijgewerktOp),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.patch("/crm/opdrachten/:id", beheerderPlus, async (req, res) => {
  try {
    const { titel, gebouw_id, omschrijving, status, waarde, start_datum, eind_datum } = req.body;
    const [o] = await db
      .update(crmOpdrachtenTable)
      .set({
        titel,
        gebouwId: gebouw_id ?? null,
        omschrijving,
        status,
        waarde: waarde ?? null,
        startDatum: start_datum,
        eindDatum: eind_datum,
        bijgewerktOp: new Date(),
      })
      .where(eq(crmOpdrachtenTable.id, parseId(req.params.id)))
      .returning();
    if (!o) return res.status(404).json({ error: "Opdracht niet gevonden" });
    res.json({
      id: o.id,
      klant_id: o.klantId,
      gebouw_id: o.gebouwId,
      gebouw_naam: null,
      titel: o.titel,
      omschrijving: o.omschrijving,
      status: o.status,
      waarde: o.waarde,
      start_datum: o.startDatum,
      eind_datum: o.eindDatum,
      aangemaakt_op: iso(o.aangemaaktOp),
      bijgewerkt_op: iso(o.bijgewerktOp),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.delete("/crm/opdrachten/:id", beheerderPlus, async (req, res) => {
  try {
    await db.delete(crmOpdrachtenTable).where(eq(crmOpdrachtenTable.id, parseId(req.params.id)));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── COMMUNICATIE ────────────────────────────────────────────────────────────
router.get("/crm/klanten/:id/communicatie", beheerderPlus, async (req, res) => {
  try {
    const rijen = await db
      .select({ c: crmCommunicatieTable, gebruikerNaam: gebruikersTable.naam, contactNaam: crmContactpersonenTable.naam })
      .from(crmCommunicatieTable)
      .leftJoin(gebruikersTable, eq(crmCommunicatieTable.gebruikerId, gebruikersTable.id))
      .leftJoin(crmContactpersonenTable, eq(crmCommunicatieTable.contactpersoonId, crmContactpersonenTable.id))
      .where(eq(crmCommunicatieTable.klantId, parseId(req.params.id)))
      .orderBy(desc(crmCommunicatieTable.aangemaaktOp));
    res.json(
      rijen.map((r) => ({
        id: r.c.id,
        klant_id: r.c.klantId,
        contactpersoon_id: r.c.contactpersoonId,
        contactpersoon_naam: r.contactNaam ?? null,
        type: r.c.type,
        onderwerp: r.c.onderwerp,
        inhoud: r.c.inhoud,
        datum: r.c.datum,
        gebruiker_id: r.c.gebruikerId,
        gebruiker_naam: r.gebruikerNaam ?? null,
        aangemaakt_op: iso(r.c.aangemaaktOp),
      })),
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/crm/klanten/:id/communicatie", beheerderPlus, async (req, res) => {
  try {
    const { onderwerp, contactpersoon_id, type, inhoud, datum } = req.body;
    if (!onderwerp) return res.status(400).json({ error: "onderwerp is verplicht" });
    const [c] = await db
      .insert(crmCommunicatieTable)
      .values({
        klantId: parseId(req.params.id),
        onderwerp,
        contactpersoonId: contactpersoon_id ?? null,
        type: type || "notitie",
        inhoud,
        datum,
        gebruikerId: req.session.userId ?? null,
      })
      .returning();
    res.status(201).json({
      id: c.id,
      klant_id: c.klantId,
      contactpersoon_id: c.contactpersoonId,
      contactpersoon_naam: null,
      type: c.type,
      onderwerp: c.onderwerp,
      inhoud: c.inhoud,
      datum: c.datum,
      gebruiker_id: c.gebruikerId,
      gebruiker_naam: null,
      aangemaakt_op: iso(c.aangemaaktOp),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.delete("/crm/communicatie/:id", beheerderPlus, async (req, res) => {
  try {
    await db.delete(crmCommunicatieTable).where(eq(crmCommunicatieTable.id, parseId(req.params.id)));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── COMMERCIEEL ─────────────────────────────────────────────────────────────
router.get("/crm/klanten/:id/commercieel", beheerderPlus, async (req, res) => {
  try {
    const rijen = await db
      .select()
      .from(crmCommercieelTable)
      .where(eq(crmCommercieelTable.klantId, parseId(req.params.id)))
      .orderBy(desc(crmCommercieelTable.aangemaaktOp));
    res.json(rijen.map(mapCommercieel));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/crm/klanten/:id/commercieel", beheerderPlus, async (req, res) => {
  try {
    const { titel, fase, waarde, kans, verwachte_sluitdatum, opmerkingen } = req.body;
    if (!titel) return res.status(400).json({ error: "titel is verplicht" });
    const [c] = await db
      .insert(crmCommercieelTable)
      .values({ klantId: parseId(req.params.id), titel, fase: fase || "lead", waarde: waarde ?? null, kans: kans ?? null, verwachteSluitdatum: verwachte_sluitdatum, opmerkingen })
      .returning();
    res.status(201).json(mapCommercieel(c));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.patch("/crm/commercieel/:id", beheerderPlus, async (req, res) => {
  try {
    const { titel, fase, waarde, kans, verwachte_sluitdatum, opmerkingen } = req.body;
    const [c] = await db
      .update(crmCommercieelTable)
      .set({ titel, fase, waarde: waarde ?? null, kans: kans ?? null, verwachteSluitdatum: verwachte_sluitdatum, opmerkingen, bijgewerktOp: new Date() })
      .where(eq(crmCommercieelTable.id, parseId(req.params.id)))
      .returning();
    if (!c) return res.status(404).json({ error: "Commerciële kans niet gevonden" });
    res.json(mapCommercieel(c));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.delete("/crm/commercieel/:id", beheerderPlus, async (req, res) => {
  try {
    await db.delete(crmCommercieelTable).where(eq(crmCommercieelTable.id, parseId(req.params.id)));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── FINANCIEEL (alleen hoofdbeheerder) ──────────────────────────────────────
router.get("/crm/klanten/:id/financieel", alleenHoofdbeheerder, async (req, res) => {
  try {
    const rijen = await db
      .select()
      .from(crmFinancieelTable)
      .where(eq(crmFinancieelTable.klantId, parseId(req.params.id)))
      .orderBy(desc(crmFinancieelTable.aangemaaktOp));
    res.json(rijen.map(mapFinancieel));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/crm/klanten/:id/financieel", alleenHoofdbeheerder, async (req, res) => {
  try {
    const { type, omschrijving, bedrag, status, factuurnummer, datum, vervaldatum, opmerkingen } = req.body;
    if (!type) return res.status(400).json({ error: "type is verplicht" });
    const [f] = await db
      .insert(crmFinancieelTable)
      .values({ klantId: parseId(req.params.id), type, omschrijving, bedrag: bedrag ?? null, status: status || "concept", factuurnummer, datum, vervaldatum, opmerkingen })
      .returning();
    res.status(201).json(mapFinancieel(f));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.patch("/crm/financieel/:id", alleenHoofdbeheerder, async (req, res) => {
  try {
    const { type, omschrijving, bedrag, status, factuurnummer, datum, vervaldatum, opmerkingen } = req.body;
    const [f] = await db
      .update(crmFinancieelTable)
      .set({ type, omschrijving, bedrag: bedrag ?? null, status, factuurnummer, datum, vervaldatum, opmerkingen, bijgewerktOp: new Date() })
      .where(eq(crmFinancieelTable.id, parseId(req.params.id)))
      .returning();
    if (!f) return res.status(404).json({ error: "Financiële post niet gevonden" });
    res.json(mapFinancieel(f));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.delete("/crm/financieel/:id", alleenHoofdbeheerder, async (req, res) => {
  try {
    await db.delete(crmFinancieelTable).where(eq(crmFinancieelTable.id, parseId(req.params.id)));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
