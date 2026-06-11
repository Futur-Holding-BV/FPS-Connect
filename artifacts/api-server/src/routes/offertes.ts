// Offerte-routes (Fase 1 — PREP) — Parallel spoor, formeel akkoord gebruiker.
//
// Offertestructuur, begroting en uitgangspunten op basis van het echte
// FPS-offerteformat. Fase 1 bevat BEWUST GEEN AI-logica en GEEN automatische
// offerteverzending. /offertes/:id/uit-spots leest de spots van het gekoppelde
// gebouw en zet die om naar concept-begrotingsregels (mens beslist, AI niet).
import { Router } from "express";
import {
  db,
  offerteSjablonenTable,
  offerteHoofdstukkenTable,
  offertesTable,
  offerteRegelsTable,
  offerteUitgangspuntenTable,
  voorzieningenTable,
  crmKlantenTable,
  gebouwenTable,
  gebruikersTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";

const router = Router();

const lezen = requireBevoegdheid("offertes", 1);
const schrijven = requireBevoegdheid("offertes", 2);

const iso = (d: Date) => d.toISOString();

function parseId(v: unknown): number {
  return parseInt(String(v), 10);
}

// ── Sjablonen ───────────────────────────────────────────────────────────────
const mapSjabloon = (s: typeof offerteSjablonenTable.$inferSelect) => ({
  id: s.id,
  naam: s.naam,
  omschrijving: s.omschrijving,
  werkmaatschappij: s.werkmaatschappij,
  actief: s.actief,
  aangemaakt_op: iso(s.aangemaaktOp),
  bijgewerkt_op: iso(s.bijgewerktOp),
});

router.get("/offerte-sjablonen", lezen, async (req, res) => {
  try {
    const rijen = await db.select().from(offerteSjablonenTable).orderBy(offerteSjablonenTable.naam);
    res.json(rijen.map(mapSjabloon));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/offerte-sjablonen", schrijven, async (req, res) => {
  try {
    const { naam, omschrijving, werkmaatschappij, actief } = req.body;
    if (!naam) return res.status(400).json({ error: "naam is verplicht" });
    const [s] = await db
      .insert(offerteSjablonenTable)
      .values({ naam, omschrijving, werkmaatschappij: werkmaatschappij || "FPS Bouw", actief: actief ?? true })
      .returning();
    res.status(201).json(mapSjabloon(s));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.patch("/offerte-sjablonen/:id", schrijven, async (req, res) => {
  try {
    const { naam, omschrijving, werkmaatschappij, actief } = req.body;
    const [s] = await db
      .update(offerteSjablonenTable)
      .set({ naam, omschrijving, werkmaatschappij, actief, bijgewerktOp: new Date() })
      .where(eq(offerteSjablonenTable.id, parseId(req.params.id)))
      .returning();
    if (!s) return res.status(404).json({ error: "Sjabloon niet gevonden" });
    res.json(mapSjabloon(s));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.delete("/offerte-sjablonen/:id", schrijven, async (req, res) => {
  try {
    await db.delete(offerteSjablonenTable).where(eq(offerteSjablonenTable.id, parseId(req.params.id)));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Sjabloon-hoofdstukken ───────────────────────────────────────────────────
const mapHoofdstuk = (h: typeof offerteHoofdstukkenTable.$inferSelect) => ({
  id: h.id,
  sjabloon_id: h.sjabloonId,
  titel: h.titel,
  volgorde: h.volgorde,
  type: h.type,
  standaardtekst: h.standaardtekst,
  ai_veld: h.aiVeld,
  ai_hint: h.aiHint,
  aangemaakt_op: iso(h.aangemaaktOp),
  bijgewerkt_op: iso(h.bijgewerktOp),
});

router.get("/offerte-sjablonen/:id/hoofdstukken", lezen, async (req, res) => {
  try {
    const rijen = await db
      .select()
      .from(offerteHoofdstukkenTable)
      .where(eq(offerteHoofdstukkenTable.sjabloonId, parseId(req.params.id)))
      .orderBy(offerteHoofdstukkenTable.volgorde);
    res.json(rijen.map(mapHoofdstuk));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/offerte-sjablonen/:id/hoofdstukken", schrijven, async (req, res) => {
  try {
    const { titel, volgorde, type, standaardtekst, ai_veld, ai_hint } = req.body;
    if (!titel) return res.status(400).json({ error: "titel is verplicht" });
    const [h] = await db
      .insert(offerteHoofdstukkenTable)
      .values({
        sjabloonId: parseId(req.params.id),
        titel,
        volgorde: volgorde ?? 0,
        type: type || "variabel",
        standaardtekst,
        aiVeld: ai_veld ?? false,
        aiHint: ai_hint,
      })
      .returning();
    res.status(201).json(mapHoofdstuk(h));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.patch("/offerte-hoofdstukken/:id", schrijven, async (req, res) => {
  try {
    const { titel, volgorde, type, standaardtekst, ai_veld, ai_hint } = req.body;
    const [h] = await db
      .update(offerteHoofdstukkenTable)
      .set({ titel, volgorde, type, standaardtekst, aiVeld: ai_veld, aiHint: ai_hint, bijgewerktOp: new Date() })
      .where(eq(offerteHoofdstukkenTable.id, parseId(req.params.id)))
      .returning();
    if (!h) return res.status(404).json({ error: "Hoofdstuk niet gevonden" });
    res.json(mapHoofdstuk(h));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.delete("/offerte-hoofdstukken/:id", schrijven, async (req, res) => {
  try {
    await db.delete(offerteHoofdstukkenTable).where(eq(offerteHoofdstukkenTable.id, parseId(req.params.id)));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Offertes ────────────────────────────────────────────────────────────────
async function offerteNaarJson(o: typeof offertesTable.$inferSelect) {
  let gebouwNaam: string | null = null;
  if (o.gebouwId != null) {
    const [g] = await db.select({ naam: gebouwenTable.naam }).from(gebouwenTable).where(eq(gebouwenTable.id, o.gebouwId));
    gebouwNaam = g?.naam ?? null;
  }
  let klantNaam: string | null = null;
  if (o.klantId != null) {
    const [k] = await db.select({ naam: crmKlantenTable.naam }).from(crmKlantenTable).where(eq(crmKlantenTable.id, o.klantId));
    klantNaam = k?.naam ?? null;
  }
  let behandeldDoorNaam: string | null = null;
  if (o.behandeldDoorId != null) {
    const [u] = await db.select({ naam: gebruikersTable.naam }).from(gebruikersTable).where(eq(gebruikersTable.id, o.behandeldDoorId));
    behandeldDoorNaam = u?.naam ?? null;
  }
  return {
    id: o.id,
    offertenummer: o.offertenummer,
    titel: o.titel,
    gebouw_id: o.gebouwId,
    gebouw_naam: gebouwNaam,
    klant_id: o.klantId,
    klant_naam: klantNaam,
    sjabloon_id: o.sjabloonId,
    opdrachtgever: o.opdrachtgever,
    ons_kenmerk: o.onsKenmerk,
    uw_kenmerk: o.uwKenmerk,
    uw_brief_van: o.uwBriefVan,
    behandeld_door_id: o.behandeldDoorId,
    behandeld_door_naam: behandeldDoorNaam,
    datum: o.datum,
    geldigheid_dagen: o.geldigheidDagen,
    voorwaarden: o.voorwaarden,
    bedrag_excl_btw: o.bedragExclBtw,
    btw_percentage: o.btwPercentage,
    bedrag_incl_btw: o.bedragInclBtw,
    status: o.status,
    aangemaakt_door_id: o.aangemaaktDoorId,
    aangemaakt_op: iso(o.aangemaaktOp),
    bijgewerkt_op: iso(o.bijgewerktOp),
  };
}

router.get("/offertes", lezen, async (req, res) => {
  try {
    const rijen = await db
      .select({ o: offertesTable, gebouwNaam: gebouwenTable.naam, klantNaam: crmKlantenTable.naam, behandeldDoorNaam: gebruikersTable.naam })
      .from(offertesTable)
      .leftJoin(gebouwenTable, eq(offertesTable.gebouwId, gebouwenTable.id))
      .leftJoin(crmKlantenTable, eq(offertesTable.klantId, crmKlantenTable.id))
      .leftJoin(gebruikersTable, eq(offertesTable.behandeldDoorId, gebruikersTable.id))
      .orderBy(desc(offertesTable.aangemaaktOp));
    res.json(
      rijen.map((r) => ({
        id: r.o.id,
        offertenummer: r.o.offertenummer,
        titel: r.o.titel,
        gebouw_id: r.o.gebouwId,
        gebouw_naam: r.gebouwNaam ?? null,
        klant_id: r.o.klantId,
        klant_naam: r.klantNaam ?? null,
        sjabloon_id: r.o.sjabloonId,
        opdrachtgever: r.o.opdrachtgever,
        ons_kenmerk: r.o.onsKenmerk,
        uw_kenmerk: r.o.uwKenmerk,
        uw_brief_van: r.o.uwBriefVan,
        behandeld_door_id: r.o.behandeldDoorId,
        behandeld_door_naam: r.behandeldDoorNaam ?? null,
        datum: r.o.datum,
        geldigheid_dagen: r.o.geldigheidDagen,
        voorwaarden: r.o.voorwaarden,
        bedrag_excl_btw: r.o.bedragExclBtw,
        btw_percentage: r.o.btwPercentage,
        bedrag_incl_btw: r.o.bedragInclBtw,
        status: r.o.status,
        aangemaakt_door_id: r.o.aangemaaktDoorId,
        aangemaakt_op: iso(r.o.aangemaaktOp),
        bijgewerkt_op: iso(r.o.bijgewerktOp),
      })),
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/offertes", schrijven, async (req, res) => {
  try {
    const { titel, offertenummer, gebouw_id, klant_id, sjabloon_id, opdrachtgever, ons_kenmerk, uw_kenmerk, uw_brief_van, behandeld_door_id, datum, geldigheid_dagen, voorwaarden, bedrag_excl_btw, btw_percentage, bedrag_incl_btw, status } = req.body;
    if (!titel) return res.status(400).json({ error: "titel is verplicht" });
    const [o] = await db
      .insert(offertesTable)
      .values({
        titel,
        offertenummer,
        gebouwId: gebouw_id ?? null,
        klantId: klant_id ?? null,
        sjabloonId: sjabloon_id ?? null,
        opdrachtgever,
        onsKenmerk: ons_kenmerk,
        uwKenmerk: uw_kenmerk,
        uwBriefVan: uw_brief_van,
        behandeldDoorId: behandeld_door_id ?? null,
        datum,
        geldigheidDagen: geldigheid_dagen ?? 30,
        voorwaarden,
        bedragExclBtw: bedrag_excl_btw ?? 0,
        btwPercentage: btw_percentage ?? 21,
        bedragInclBtw: bedrag_incl_btw ?? 0,
        status: status || "concept",
        aangemaaktDoorId: req.session.userId ?? null,
      })
      .returning();
    res.status(201).json(await offerteNaarJson(o));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.get("/offertes/:id", lezen, async (req, res) => {
  try {
    const [o] = await db.select().from(offertesTable).where(eq(offertesTable.id, parseId(req.params.id)));
    if (!o) return res.status(404).json({ error: "Offerte niet gevonden" });
    res.json(await offerteNaarJson(o));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.patch("/offertes/:id", schrijven, async (req, res) => {
  try {
    const { titel, offertenummer, gebouw_id, klant_id, sjabloon_id, opdrachtgever, ons_kenmerk, uw_kenmerk, uw_brief_van, behandeld_door_id, datum, geldigheid_dagen, voorwaarden, bedrag_excl_btw, btw_percentage, bedrag_incl_btw, status } = req.body;
    const [o] = await db
      .update(offertesTable)
      .set({
        titel,
        offertenummer,
        gebouwId: gebouw_id ?? null,
        klantId: klant_id ?? null,
        sjabloonId: sjabloon_id ?? null,
        opdrachtgever,
        onsKenmerk: ons_kenmerk,
        uwKenmerk: uw_kenmerk,
        uwBriefVan: uw_brief_van,
        behandeldDoorId: behandeld_door_id ?? null,
        datum,
        geldigheidDagen: geldigheid_dagen,
        voorwaarden,
        bedragExclBtw: bedrag_excl_btw,
        btwPercentage: btw_percentage,
        bedragInclBtw: bedrag_incl_btw,
        status,
        bijgewerktOp: new Date(),
      })
      .where(eq(offertesTable.id, parseId(req.params.id)))
      .returning();
    if (!o) return res.status(404).json({ error: "Offerte niet gevonden" });
    res.json(await offerteNaarJson(o));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.delete("/offertes/:id", schrijven, async (req, res) => {
  try {
    await db.delete(offertesTable).where(eq(offertesTable.id, parseId(req.params.id)));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Begrotingsregels ────────────────────────────────────────────────────────
const mapRegel = (r: typeof offerteRegelsTable.$inferSelect) => ({
  id: r.id,
  offerte_id: r.offerteId,
  categorie: r.categorie,
  snag_referentie: r.snagReferentie,
  voorziening_id: r.voorzieningId,
  maatregel: r.maatregel,
  ruimte: r.ruimte,
  uitgangspunten: r.uitgangspunten,
  eenheid: r.eenheid,
  aantal: r.aantal,
  prijs_per_eenheid: r.prijsPerEenheid,
  kosten: r.kosten,
  volgorde: r.volgorde,
  ai_voorstel: r.aiVoorstel,
  aangemaakt_op: iso(r.aangemaaktOp),
  bijgewerkt_op: iso(r.bijgewerktOp),
});

router.get("/offertes/:id/regels", lezen, async (req, res) => {
  try {
    const rijen = await db
      .select()
      .from(offerteRegelsTable)
      .where(eq(offerteRegelsTable.offerteId, parseId(req.params.id)))
      .orderBy(offerteRegelsTable.volgorde);
    res.json(rijen.map(mapRegel));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/offertes/:id/regels", schrijven, async (req, res) => {
  try {
    const { maatregel, categorie, snag_referentie, voorziening_id, ruimte, uitgangspunten, eenheid, aantal, prijs_per_eenheid, kosten, volgorde, ai_voorstel } = req.body;
    if (!maatregel) return res.status(400).json({ error: "maatregel is verplicht" });
    const berekendeKosten = kosten != null ? kosten : (aantal ?? 0) * (prijs_per_eenheid ?? 0);
    const [r] = await db
      .insert(offerteRegelsTable)
      .values({
        offerteId: parseId(req.params.id),
        maatregel,
        categorie: categorie || "maatregel",
        snagReferentie: snag_referentie,
        voorzieningId: voorziening_id ?? null,
        ruimte,
        uitgangspunten,
        eenheid: eenheid || "st",
        aantal: aantal ?? 0,
        prijsPerEenheid: prijs_per_eenheid ?? 0,
        kosten: berekendeKosten,
        volgorde: volgorde ?? 0,
        aiVoorstel: ai_voorstel ?? false,
      })
      .returning();
    res.status(201).json(mapRegel(r));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.patch("/offerte-regels/:id", schrijven, async (req, res) => {
  try {
    const { maatregel, categorie, snag_referentie, voorziening_id, ruimte, uitgangspunten, eenheid, aantal, prijs_per_eenheid, kosten, volgorde, ai_voorstel } = req.body;
    const berekendeKosten = kosten != null ? kosten : (aantal ?? 0) * (prijs_per_eenheid ?? 0);
    const [r] = await db
      .update(offerteRegelsTable)
      .set({
        maatregel,
        categorie,
        snagReferentie: snag_referentie,
        voorzieningId: voorziening_id ?? null,
        ruimte,
        uitgangspunten,
        eenheid,
        aantal,
        prijsPerEenheid: prijs_per_eenheid,
        kosten: berekendeKosten,
        volgorde,
        aiVoorstel: ai_voorstel,
        bijgewerktOp: new Date(),
      })
      .where(eq(offerteRegelsTable.id, parseId(req.params.id)))
      .returning();
    if (!r) return res.status(404).json({ error: "Begrotingsregel niet gevonden" });
    res.json(mapRegel(r));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.delete("/offerte-regels/:id", schrijven, async (req, res) => {
  try {
    await db.delete(offerteRegelsTable).where(eq(offerteRegelsTable.id, parseId(req.params.id)));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Uitgangspunten / voorbehouden ───────────────────────────────────────────
const mapUitgangspunt = (u: typeof offerteUitgangspuntenTable.$inferSelect) => ({
  id: u.id,
  offerte_id: u.offerteId,
  snag_referentie: u.snagReferentie,
  voorziening_id: u.voorzieningId,
  type: u.type,
  tekst: u.tekst,
  volgorde: u.volgorde,
  ai_voorstel: u.aiVoorstel,
  aangemaakt_op: iso(u.aangemaaktOp),
  bijgewerkt_op: iso(u.bijgewerktOp),
});

router.get("/offertes/:id/uitgangspunten", lezen, async (req, res) => {
  try {
    const rijen = await db
      .select()
      .from(offerteUitgangspuntenTable)
      .where(eq(offerteUitgangspuntenTable.offerteId, parseId(req.params.id)))
      .orderBy(offerteUitgangspuntenTable.volgorde);
    res.json(rijen.map(mapUitgangspunt));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/offertes/:id/uitgangspunten", schrijven, async (req, res) => {
  try {
    const { tekst, type, snag_referentie, voorziening_id, volgorde, ai_voorstel } = req.body;
    if (!tekst) return res.status(400).json({ error: "tekst is verplicht" });
    const [u] = await db
      .insert(offerteUitgangspuntenTable)
      .values({
        offerteId: parseId(req.params.id),
        tekst,
        type: type || "uitgangspunt",
        snagReferentie: snag_referentie,
        voorzieningId: voorziening_id ?? null,
        volgorde: volgorde ?? 0,
        aiVoorstel: ai_voorstel ?? false,
      })
      .returning();
    res.status(201).json(mapUitgangspunt(u));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.patch("/offerte-uitgangspunten/:id", schrijven, async (req, res) => {
  try {
    const { tekst, type, snag_referentie, voorziening_id, volgorde, ai_voorstel } = req.body;
    const [u] = await db
      .update(offerteUitgangspuntenTable)
      .set({ tekst, type, snagReferentie: snag_referentie, voorzieningId: voorziening_id ?? null, volgorde, aiVoorstel: ai_voorstel, bijgewerktOp: new Date() })
      .where(eq(offerteUitgangspuntenTable.id, parseId(req.params.id)))
      .returning();
    if (!u) return res.status(404).json({ error: "Uitgangspunt niet gevonden" });
    res.json(mapUitgangspunt(u));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.delete("/offerte-uitgangspunten/:id", schrijven, async (req, res) => {
  try {
    await db.delete(offerteUitgangspuntenTable).where(eq(offerteUitgangspuntenTable.id, parseId(req.params.id)));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Spot -> Calculatie (PREP): concept-begrotingsregels uit spots ───────────
// Leest de spots van het gebouw dat aan de offerte hangt en maakt voor elke
// spot een concept-begrotingsregel (prijs 0, mens vult aan). Bewust GEEN
// AI-logica: dit is een mechanische voorbereiding, geen voorstel of goedkeuring.
router.post("/offertes/:id/uit-spots", schrijven, async (req, res) => {
  try {
    const offerteId = parseId(req.params.id);
    const [offerte] = await db.select().from(offertesTable).where(eq(offertesTable.id, offerteId));
    if (!offerte) return res.status(404).json({ error: "Offerte niet gevonden" });
    if (offerte.gebouwId == null) return res.status(400).json({ error: "Koppel eerst een gebouw aan de offerte." });

    const spots = await db
      .select()
      .from(voorzieningenTable)
      .where(eq(voorzieningenTable.gebouwId, offerte.gebouwId))
      .orderBy(voorzieningenTable.objectnummer);

    const bestaande = await db
      .select({ voorzieningId: offerteRegelsTable.voorzieningId })
      .from(offerteRegelsTable)
      .where(eq(offerteRegelsTable.offerteId, offerteId));
    const reedsGekoppeld = new Set(bestaande.map((b) => b.voorzieningId).filter((x): x is number => x != null));

    const teMaken = spots.filter((s) => !s.gearchiveerd && !reedsGekoppeld.has(s.id));
    const startVolgorde = bestaande.length;
    const nieuw: Array<typeof offerteRegelsTable.$inferSelect> = [];
    let i = 0;
    for (const s of teMaken) {
      const [r] = await db
        .insert(offerteRegelsTable)
        .values({
          offerteId,
          categorie: "maatregel",
          snagReferentie: s.objectnummer,
          voorzieningId: s.id,
          maatregel: `Brandwerende voorziening: ${s.type}`,
          ruimte: s.ruimte,
          eenheid: "st",
          aantal: 1,
          prijsPerEenheid: 0,
          kosten: 0,
          volgorde: startVolgorde + i,
          aiVoorstel: false,
        })
        .returning();
      nieuw.push(r);
      i += 1;
    }

    res.status(201).json({ aangemaakt: nieuw.length, overgeslagen: spots.length - teMaken.length, regels: nieuw.map(mapRegel) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
