import { Router } from "express";
import { db } from "@workspace/db";
import {
  crmKlantenTable,
  crmContactpersonenTable,
  crmOpdrachtenTable,
  crmCommunicatieTable,
  crmCommercieelTable,
  crmFinancieelTable,
  crmConcurrentenTable,
  crmMarktintelligentieTable,
  gebouwenTable,
  gebruikersTable,
} from "@workspace/db";
import { eq, desc, ilike, or, and, count } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";

const router = Router();

const lezen = requireBevoegdheid("crm", 1);
const schrijven = requireBevoegdheid("crm", 2);

const iso = (d: Date) => d.toISOString();

function parseId(v: unknown): number {
  return parseInt(String(v), 10);
}

const mapOrg = (k: typeof crmKlantenTable.$inferSelect) => ({
  id: k.id,
  naam: k.naam,
  type: k.type,
  kvk: k.kvk,
  adres: k.adres,
  postcode: k.postcode,
  stad: k.stad,
  regio: k.regio,
  telefoon: k.telefoon,
  email: k.email,
  website: k.website,
  linkedin_url: k.linkedinUrl,
  branche: k.branche,
  status: k.status,
  relatie_status: k.relatieStatus,
  voorkeur_fps_bedrijf: k.voorkeurFpsBedrijf,
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
  linkedin_url: c.linkedinUrl,
  beslisrol: c.beslisrol,
  relatiesterkte: c.relatiesterkte,
  primair: c.primair,
  opmerkingen: c.opmerkingen,
  laatste_contact_datum: c.laatste_contact_datum,
  volgende_actie: c.volgende_actie,
  aangemaakt_op: iso(c.aangemaaktOp),
  bijgewerkt_op: iso(c.bijgewerktOp),
});

const mapProjectkans = (c: typeof crmCommercieelTable.$inferSelect) => ({
  id: c.id,
  klant_id: c.klantId,
  gebouw_id: c.gebouwId,
  titel: c.titel,
  kans_type: c.kansType,
  fase: c.fase,
  waarde: c.waarde,
  kans: c.kans,
  verwachte_datum: c.verwachteDatum,
  verantwoordelijke_id: c.verantwoordelijkeId,
  concurrenten_betrokken: c.concurrentenBetrokken,
  volgende_actie: c.volgendeActie,
  ai_samenvatting: c.aiSamenvatting,
  opmerkingen: c.opmerkingen,
  aangemaakt_op: iso(c.aangemaaktOp),
  bijgewerkt_op: iso(c.bijgewerktOp),
});

const mapConcurrent = (c: typeof crmConcurrentenTable.$inferSelect) => ({
  id: c.id,
  naam: c.naam,
  website: c.website,
  linkedin_url: c.linkedinUrl,
  regio: c.regio,
  bekende_klanten: c.bekende_klanten,
  bekende_projecttypes: c.bekende_projecttypes,
  sterke_punten: c.sterke_punten,
  zwakke_punten: c.zwakke_punten,
  where_we_encounter: c.where_we_encounter,
  opmerkingen: c.opmerkingen,
  ai_samenvatting: c.aiSamenvatting,
  aangemaakt_op: iso(c.aangemaaktOp),
  bijgewerkt_op: iso(c.bijgewerktOp),
});

const mapMarkt = (m: typeof crmMarktintelligentieTable.$inferSelect) => ({
  id: m.id,
  type: m.type,
  organisatie_id: m.organisatieId,
  concurrent_id: m.concurrentId,
  titel: m.titel,
  inhoud: m.inhoud,
  bron: m.bron,
  regio: m.regio,
  datum: m.datum,
  aangemaakt_op: iso(m.aangemaaktOp),
  bijgewerkt_op: iso(m.bijgewerktOp),
});

// ── DASHBOARD ────────────────────────────────────────────────────────────────
router.get("/crm/dashboard", lezen, async (req, res) => {
  try {
    const [
      organisaties,
      kansen,
      concurrenten,
      contactpersonen,
    ] = await Promise.all([
      db.select().from(crmKlantenTable).orderBy(crmKlantenTable.naam),
      db.select().from(crmCommercieelTable).orderBy(desc(crmCommercieelTable.aangemaaktOp)),
      db.select().from(crmConcurrentenTable).orderBy(crmConcurrentenTable.naam),
      db.select().from(crmContactpersonenTable),
    ]);

    const openKansen = kansen.filter((k) => !["gewonnen", "verloren"].includes(k.fase ?? ""));
    const gewonnen = kansen.filter((k) => k.fase === "gewonnen");
    const verloren = kansen.filter((k) => k.fase === "verloren");
    const keyAccounts = organisaties.filter((o) => o.relatieStatus === "key_account");
    const warme = organisaties.filter((o) => o.relatieStatus === "warm");
    const geenContact = contactpersonen.filter((c) => {
      if (!c.laatste_contact_datum) return true;
      const d = new Date(c.laatste_contact_datum);
      return (Date.now() - d.getTime()) > 60 * 24 * 3600 * 1000;
    });

    const totaalPijplijn = openKansen.reduce((s, k) => s + (k.waarde ?? 0) * ((k.kans ?? 50) / 100), 0);

    res.json({
      totaal_organisaties: organisaties.length,
      open_kansen: openKansen.length,
      totaal_pijplijn_gewogen: Math.round(totaalPijplijn),
      gewonnen_dit_jaar: gewonnen.length,
      verloren_dit_jaar: verloren.length,
      key_accounts: keyAccounts.length,
      warme_prospects: warme.length,
      geen_contact_60_dagen: geenContact.length,
      concurrenten_getraceerd: concurrenten.length,
      volgende_acties: kansen
        .filter((k) => k.volgendeActie)
        .slice(0, 8)
        .map((k) => ({ id: k.id, titel: k.titel, actie: k.volgendeActie, fase: k.fase, verwachte_datum: k.verwachteDatum })),
      open_kansen_top: openKansen.slice(0, 6).map(mapProjectkans),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── ORGANISATIES ─────────────────────────────────────────────────────────────
router.get("/crm/klanten", lezen, async (req, res) => {
  try {
    const zoek = req.query.q ? String(req.query.q) : undefined;
    const type = req.query.type ? String(req.query.type) : undefined;
    const relatieStatus = req.query.relatie_status ? String(req.query.relatie_status) : undefined;

    let rijen = await db.select().from(crmKlantenTable).orderBy(crmKlantenTable.naam);

    if (zoek) {
      const t = zoek.toLowerCase();
      rijen = rijen.filter((r) =>
        r.naam.toLowerCase().includes(t) ||
        (r.stad ?? "").toLowerCase().includes(t) ||
        (r.regio ?? "").toLowerCase().includes(t) ||
        (r.branche ?? "").toLowerCase().includes(t)
      );
    }
    if (type) rijen = rijen.filter((r) => r.type === type);
    if (relatieStatus) rijen = rijen.filter((r) => r.relatieStatus === relatieStatus);

    res.json(rijen.map(mapOrg));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/crm/klanten", schrijven, async (req, res) => {
  try {
    const { naam, type, kvk, adres, postcode, stad, regio, telefoon, email, website, linkedin_url, branche, status, relatie_status, voorkeur_fps_bedrijf, opmerkingen } = req.body;
    if (!naam) return res.status(400).json({ error: "naam is verplicht" });
    const [k] = await db
      .insert(crmKlantenTable)
      .values({ naam, type: type || "overig", kvk, adres, postcode, stad, regio, telefoon, email, website, linkedinUrl: linkedin_url, branche, status: status || "prospect", relatieStatus: relatie_status || "onbekend", voorkeurFpsBedrijf: voorkeur_fps_bedrijf, opmerkingen })
      .returning();
    res.status(201).json(mapOrg(k));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.get("/crm/klanten/:id", lezen, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const [[k], contacten, kansen, markt] = await Promise.all([
      db.select().from(crmKlantenTable).where(eq(crmKlantenTable.id, id)),
      db.select().from(crmContactpersonenTable).where(eq(crmContactpersonenTable.klantId, id)).orderBy(desc(crmContactpersonenTable.primair)),
      db.select().from(crmCommercieelTable).where(eq(crmCommercieelTable.klantId, id)).orderBy(desc(crmCommercieelTable.aangemaaktOp)),
      db.select().from(crmMarktintelligentieTable).where(eq(crmMarktintelligentieTable.organisatieId, id)).orderBy(desc(crmMarktintelligentieTable.aangemaaktOp)),
    ]);
    if (!k) return res.status(404).json({ error: "Organisatie niet gevonden" });
    res.json({ ...mapOrg(k), contactpersonen: contacten.map(mapContactpersoon), projectkansen: kansen.map(mapProjectkans), marktintelligentie: markt.map(mapMarkt) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.patch("/crm/klanten/:id", schrijven, async (req, res) => {
  try {
    const { naam, type, kvk, adres, postcode, stad, regio, telefoon, email, website, linkedin_url, branche, status, relatie_status, voorkeur_fps_bedrijf, opmerkingen } = req.body;
    const [k] = await db
      .update(crmKlantenTable)
      .set({ naam, type, kvk, adres, postcode, stad, regio, telefoon, email, website, linkedinUrl: linkedin_url, branche, status, relatieStatus: relatie_status, voorkeurFpsBedrijf: voorkeur_fps_bedrijf, opmerkingen, bijgewerktOp: new Date() })
      .where(eq(crmKlantenTable.id, parseId(req.params.id)))
      .returning();
    if (!k) return res.status(404).json({ error: "Organisatie niet gevonden" });
    res.json(mapOrg(k));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.delete("/crm/klanten/:id", schrijven, async (req, res) => {
  try {
    await db.delete(crmKlantenTable).where(eq(crmKlantenTable.id, parseId(req.params.id)));
    res.status(204).end();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── CONTACTPERSONEN ──────────────────────────────────────────────────────────
router.get("/crm/klanten/:id/contactpersonen", lezen, async (req, res) => {
  try {
    const rijen = await db
      .select()
      .from(crmContactpersonenTable)
      .where(eq(crmContactpersonenTable.klantId, parseId(req.params.id)))
      .orderBy(desc(crmContactpersonenTable.primair));
    res.json(rijen.map(mapContactpersoon));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.get("/crm/contactpersonen", lezen, async (req, res) => {
  try {
    const zoek = req.query.q ? String(req.query.q) : undefined;
    let rijen = await db.select().from(crmContactpersonenTable).orderBy(crmContactpersonenTable.naam);
    if (zoek) {
      const t = zoek.toLowerCase();
      rijen = rijen.filter((c) =>
        c.naam.toLowerCase().includes(t) ||
        (c.email ?? "").toLowerCase().includes(t) ||
        (c.functie ?? "").toLowerCase().includes(t)
      );
    }
    res.json(rijen.map(mapContactpersoon));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/crm/klanten/:id/contactpersonen", schrijven, async (req, res) => {
  try {
    const { naam, functie, email, telefoon, mobiel, linkedin_url, beslisrol, relatiesterkte, primair, opmerkingen, laatste_contact_datum, volgende_actie } = req.body;
    if (!naam) return res.status(400).json({ error: "naam is verplicht" });
    const [c] = await db
      .insert(crmContactpersonenTable)
      .values({ klantId: parseId(req.params.id), naam, functie, email, telefoon, mobiel, linkedinUrl: linkedin_url, beslisrol: beslisrol || "onbekend", relatiesterkte: relatiesterkte || "onbekend", primair: primair ?? false, opmerkingen, laatste_contact_datum, volgende_actie })
      .returning();
    res.status(201).json(mapContactpersoon(c));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.patch("/crm/contactpersonen/:id", schrijven, async (req, res) => {
  try {
    const { naam, functie, email, telefoon, mobiel, linkedin_url, beslisrol, relatiesterkte, primair, opmerkingen, laatste_contact_datum, volgende_actie } = req.body;
    const [c] = await db
      .update(crmContactpersonenTable)
      .set({ naam, functie, email, telefoon, mobiel, linkedinUrl: linkedin_url, beslisrol, relatiesterkte, primair, opmerkingen, laatste_contact_datum, volgende_actie, bijgewerktOp: new Date() })
      .where(eq(crmContactpersonenTable.id, parseId(req.params.id)))
      .returning();
    if (!c) return res.status(404).json({ error: "Contactpersoon niet gevonden" });
    res.json(mapContactpersoon(c));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.delete("/crm/contactpersonen/:id", schrijven, async (req, res) => {
  try {
    await db.delete(crmContactpersonenTable).where(eq(crmContactpersonenTable.id, parseId(req.params.id)));
    res.status(204).end();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── PROJECTKANSEN ─────────────────────────────────────────────────────────────
router.get("/crm/projectkansen", lezen, async (req, res) => {
  try {
    const fase = req.query.fase ? String(req.query.fase) : undefined;
    const klantId = req.query.klant_id ? parseId(req.query.klant_id) : undefined;

    const [kansen, orgs] = await Promise.all([
      db.select().from(crmCommercieelTable).orderBy(desc(crmCommercieelTable.aangemaaktOp)),
      db.select({ id: crmKlantenTable.id, naam: crmKlantenTable.naam }).from(crmKlantenTable),
    ]);

    const orgMap = new Map(orgs.map((o) => [o.id, o.naam]));
    let resultaat = kansen;
    if (fase) resultaat = resultaat.filter((k) => k.fase === fase);
    if (klantId) resultaat = resultaat.filter((k) => k.klantId === klantId);

    res.json(resultaat.map((k) => ({ ...mapProjectkans(k), organisatie_naam: orgMap.get(k.klantId) ?? null })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/crm/projectkansen", schrijven, async (req, res) => {
  try {
    const { klant_id, gebouw_id, titel, kans_type, fase, waarde, kans, verwachte_datum, verantwoordelijke_id, concurrenten_betrokken, volgende_actie, opmerkingen } = req.body;
    if (!klant_id || !titel) return res.status(400).json({ error: "klant_id en titel zijn verplicht" });
    const [k] = await db
      .insert(crmCommercieelTable)
      .values({ klantId: parseId(klant_id), gebouwId: gebouw_id ? parseId(gebouw_id) : null, titel, kansType: kans_type || "offerte", fase: fase || "signaal", waarde, kans: kans ?? 50, verwachteDatum: verwachte_datum, verantwoordelijkeId: verantwoordelijke_id ? parseId(verantwoordelijke_id) : null, concurrentenBetrokken: concurrenten_betrokken, volgendeActie: volgende_actie, opmerkingen })
      .returning();
    res.status(201).json(mapProjectkans(k));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.get("/crm/projectkansen/:id", lezen, async (req, res) => {
  try {
    const [k] = await db.select().from(crmCommercieelTable).where(eq(crmCommercieelTable.id, parseId(req.params.id)));
    if (!k) return res.status(404).json({ error: "Projectkans niet gevonden" });
    res.json(mapProjectkans(k));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.patch("/crm/projectkansen/:id", schrijven, async (req, res) => {
  try {
    const { titel, kans_type, fase, waarde, kans, verwachte_datum, verantwoordelijke_id, concurrenten_betrokken, volgende_actie, ai_samenvatting, opmerkingen } = req.body;
    const [k] = await db
      .update(crmCommercieelTable)
      .set({ titel, kansType: kans_type, fase, waarde, kans, verwachteDatum: verwachte_datum, verantwoordelijkeId: verantwoordelijke_id ? parseId(verantwoordelijke_id) : undefined, concurrentenBetrokken: concurrenten_betrokken, volgendeActie: volgende_actie, aiSamenvatting: ai_samenvatting, opmerkingen, bijgewerktOp: new Date() })
      .where(eq(crmCommercieelTable.id, parseId(req.params.id)))
      .returning();
    if (!k) return res.status(404).json({ error: "Projectkans niet gevonden" });
    res.json(mapProjectkans(k));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.delete("/crm/projectkansen/:id", schrijven, async (req, res) => {
  try {
    await db.delete(crmCommercieelTable).where(eq(crmCommercieelTable.id, parseId(req.params.id)));
    res.status(204).end();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── CONCURRENTEN ─────────────────────────────────────────────────────────────
router.get("/crm/concurrenten", lezen, async (req, res) => {
  try {
    const rijen = await db.select().from(crmConcurrentenTable).orderBy(crmConcurrentenTable.naam);
    res.json(rijen.map(mapConcurrent));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/crm/concurrenten", schrijven, async (req, res) => {
  try {
    const { naam, website, linkedin_url, regio, bekende_klanten, bekende_projecttypes, sterke_punten, zwakke_punten, where_we_encounter, opmerkingen } = req.body;
    if (!naam) return res.status(400).json({ error: "naam is verplicht" });
    const [c] = await db
      .insert(crmConcurrentenTable)
      .values({ naam, website, linkedinUrl: linkedin_url, regio, bekende_klanten, bekende_projecttypes, sterke_punten, zwakke_punten, where_we_encounter, opmerkingen })
      .returning();
    res.status(201).json(mapConcurrent(c));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.get("/crm/concurrenten/:id", lezen, async (req, res) => {
  try {
    const [c] = await db.select().from(crmConcurrentenTable).where(eq(crmConcurrentenTable.id, parseId(req.params.id)));
    if (!c) return res.status(404).json({ error: "Concurrent niet gevonden" });
    res.json(mapConcurrent(c));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.patch("/crm/concurrenten/:id", schrijven, async (req, res) => {
  try {
    const { naam, website, linkedin_url, regio, bekende_klanten, bekende_projecttypes, sterke_punten, zwakke_punten, where_we_encounter, opmerkingen, ai_samenvatting } = req.body;
    const [c] = await db
      .update(crmConcurrentenTable)
      .set({ naam, website, linkedinUrl: linkedin_url, regio, bekende_klanten, bekende_projecttypes, sterke_punten, zwakke_punten, where_we_encounter, opmerkingen, aiSamenvatting: ai_samenvatting, bijgewerktOp: new Date() })
      .where(eq(crmConcurrentenTable.id, parseId(req.params.id)))
      .returning();
    if (!c) return res.status(404).json({ error: "Concurrent niet gevonden" });
    res.json(mapConcurrent(c));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.delete("/crm/concurrenten/:id", schrijven, async (req, res) => {
  try {
    await db.delete(crmConcurrentenTable).where(eq(crmConcurrentenTable.id, parseId(req.params.id)));
    res.status(204).end();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── MARKTINTELLIGENTIE ────────────────────────────────────────────────────────
router.get("/crm/marktintelligentie", lezen, async (req, res) => {
  try {
    const rijen = await db.select().from(crmMarktintelligentieTable).orderBy(desc(crmMarktintelligentieTable.aangemaaktOp));
    res.json(rijen.map(mapMarkt));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/crm/marktintelligentie", schrijven, async (req, res) => {
  try {
    const { type, organisatie_id, concurrent_id, titel, inhoud, bron, regio, datum } = req.body;
    if (!titel) return res.status(400).json({ error: "titel is verplicht" });
    const gebruikerId = req.session.userId ?? null;
    const [m] = await db
      .insert(crmMarktintelligentieTable)
      .values({ type: type || "nieuws", organisatieId: organisatie_id ? parseId(organisatie_id) : null, concurrentId: concurrent_id ? parseId(concurrent_id) : null, titel, inhoud, bron, regio, datum, aangemaaktDoor: gebruikerId })
      .returning();
    res.status(201).json(mapMarkt(m));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.patch("/crm/marktintelligentie/:id", schrijven, async (req, res) => {
  try {
    const { type, organisatie_id, concurrent_id, titel, inhoud, bron, regio, datum } = req.body;
    const [m] = await db
      .update(crmMarktintelligentieTable)
      .set({ type, organisatieId: organisatie_id !== undefined ? (organisatie_id ? parseId(organisatie_id) : null) : undefined, concurrentId: concurrent_id !== undefined ? (concurrent_id ? parseId(concurrent_id) : null) : undefined, titel, inhoud, bron, regio, datum, bijgewerktOp: new Date() })
      .where(eq(crmMarktintelligentieTable.id, parseId(req.params.id)))
      .returning();
    if (!m) return res.status(404).json({ error: "Marktinformatie niet gevonden" });
    res.json(mapMarkt(m));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.delete("/crm/marktintelligentie/:id", schrijven, async (req, res) => {
  try {
    await db.delete(crmMarktintelligentieTable).where(eq(crmMarktintelligentieTable.id, parseId(req.params.id)));
    res.status(204).end();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── COMMUNICATIE ──────────────────────────────────────────────────────────────
router.get("/crm/klanten/:id/communicatie", lezen, async (req, res) => {
  try {
    const rijen = await db
      .select()
      .from(crmCommunicatieTable)
      .where(eq(crmCommunicatieTable.klantId, parseId(req.params.id)))
      .orderBy(desc(crmCommunicatieTable.aangemaaktOp));
    res.json(rijen.map((c) => ({
      id: c.id, klant_id: c.klantId, contactpersoon_id: c.contactpersoonId, type: c.type,
      onderwerp: c.onderwerp, inhoud: c.inhoud, datum: c.datum, aangemaakt_op: iso(c.aangemaaktOp),
    })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/crm/klanten/:id/communicatie", schrijven, async (req, res) => {
  try {
    const { contactpersoon_id, type, onderwerp, inhoud, datum } = req.body;
    if (!onderwerp) return res.status(400).json({ error: "onderwerp is verplicht" });
    const gebruikerId = req.session.userId ?? null;
    const [c] = await db
      .insert(crmCommunicatieTable)
      .values({ klantId: parseId(req.params.id), contactpersoonId: contactpersoon_id ? parseId(contactpersoon_id) : null, type: type || "notitie", onderwerp, inhoud, datum: datum || new Date().toISOString().slice(0, 10), gebruikerId })
      .returning();
    res.status(201).json({ id: c.id, klant_id: c.klantId, type: c.type, onderwerp: c.onderwerp, inhoud: c.inhoud, datum: c.datum, aangemaakt_op: iso(c.aangemaaktOp) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
