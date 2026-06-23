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
  offerteSectiesTable,
  offerteVersiesTable,
  offerteBijlagenTable,
  offertePortaalTokensTable,
  offerteEmailLogTable,
  offerteTrackingTable,
  offerteVragenTable,
  voorzieningenTable,
  crmKlantenTable,
  gebouwenTable,
  gebruikersTable,
} from "@workspace/db";
import { eq, desc, count, sql } from "drizzle-orm";
import { randomBytes } from "crypto";
import { requireBevoegdheid } from "../middlewares/auth";
import { maakOpenAiClient, heeftOpenAi } from "../lib/openai";
import { verstuurMail } from "../services/email";

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

// ── Analytics ─────────────────────────────────────────────────────────────────
// MOET vóór /offertes/:id staan (Express matcht letterlijk pad eerder dan parameter).
router.get("/offertes/analytics", lezen, async (req, res) => {
  try {
    const rijen = await db
      .select({ portaalStatus: offertesTable.portaalStatus, count: count() })
      .from(offertesTable)
      .groupBy(offertesTable.portaalStatus);

    const tellerMap: Record<string, number> = {};
    for (const r of rijen) tellerMap[r.portaalStatus] = Number(r.count);

    const totaal = Object.values(tellerMap).reduce((a, b) => a + b, 0);
    const ondertekend = tellerMap["ondertekend"] ?? 0;
    const afgewezen = tellerMap["afgewezen"] ?? 0;
    const verzonden = tellerMap["verzonden"] ?? 0;
    const bekeken = tellerMap["bekeken"] ?? 0;
    const concept = tellerMap["concept"] ?? 0;

    const waardeSom = await db
      .select({ gemWaarde: sql<number>`avg(bedrag_incl_btw)` })
      .from(offertesTable);
    const gemWaarde = Number(waardeSom[0]?.gemWaarde ?? 0);

    const conversie = totaal > 0 ? Math.round((ondertekend / totaal) * 100) : 0;

    const recenteHandtekeningen = await db
      .select({
        offerteId: offertesTable.id,
        offertenummer: offertesTable.offertenummer,
        titel: offertesTable.titel,
        bedragInclBtw: offertesTable.bedragInclBtw,
        portaalStatus: offertesTable.portaalStatus,
      })
      .from(offertesTable)
      .orderBy(desc(offertesTable.bijgewerktOp))
      .limit(10);

    res.json({
      totaal,
      concept,
      verzonden,
      bekeken,
      ondertekend,
      afgewezen,
      conversie_procent: conversie,
      gemiddelde_waarde: Math.round(gemWaarde * 100) / 100,
      recente_offertes: recenteHandtekeningen.map((o) => ({
        id: o.offerteId,
        offertenummer: o.offertenummer,
        titel: o.titel,
        bedrag_incl_btw: o.bedragInclBtw,
        portaal_status: o.portaalStatus,
      })),
    });
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

// ── Proposal Studio: secties ─────────────────────────────────────────────────

const SECTIE_LABELS: Record<string, string> = {
  aanbiedingsbrief: "Aanbiedingsbrief",
  projectomschrijving: "Projectomschrijving",
  aanpak: "Aanpak en methodiek",
  team: "Team en organisatie",
  planning: "Planning",
  voorwaarden: "Algemene voorwaarden",
  slotwoord: "Slotwoord",
  vrij: "Vrije sectie",
};

const STANDAARD_SECTIES = [
  { sectieType: "aanbiedingsbrief", titel: "Aanbiedingsbrief", volgorde: 0 },
  { sectieType: "projectomschrijving", titel: "Projectomschrijving", volgorde: 1 },
  { sectieType: "aanpak", titel: "Aanpak en methodiek", volgorde: 2 },
  { sectieType: "voorwaarden", titel: "Algemene voorwaarden", volgorde: 3 },
  { sectieType: "slotwoord", titel: "Slotwoord", volgorde: 4 },
];

function mapSectie(s: typeof offerteSectiesTable.$inferSelect) {
  return {
    id: s.id,
    offerte_id: s.offerteId,
    sectie_type: s.sectieType,
    volgorde: s.volgorde,
    actief: s.actief,
    titel: s.titel,
    inhoud: s.inhoud,
    ai_gegenereerd: s.aiGegenereerd,
    aangemaakt_op: iso(s.aangemaaktOp),
    bijgewerkt_op: iso(s.bijgewerktOp),
  };
}

function mapVersie(
  v: typeof offerteVersiesTable.$inferSelect,
  naam?: string | null,
) {
  return {
    id: v.id,
    offerte_id: v.offerteId,
    versienummer: v.versienummer,
    samenvatting: v.samenvatting,
    aangemaakt_door_id: v.aangemaaktDoorId,
    aangemaakt_door_naam: naam ?? null,
    aangemaakt_op: iso(v.aangemaaktOp),
  };
}

function mapBijlage(b: typeof offerteBijlagenTable.$inferSelect) {
  return {
    id: b.id,
    offerte_id: b.offerteId,
    bijlage_type: b.bijlageType,
    naam: b.naam,
    beschrijving: b.beschrijving,
    url: b.url,
    volgorde: b.volgorde,
    aangemaakt_op: iso(b.aangemaaktOp),
    bijgewerkt_op: iso(b.bijgewerktOp),
  };
}

// GET /offertes/:id/secties
router.get("/offertes/:id/secties", lezen, async (req, res) => {
  try {
    const offerteId = parseId(req.params.id);
    const rijen = await db
      .select()
      .from(offerteSectiesTable)
      .where(eq(offerteSectiesTable.offerteId, offerteId))
      .orderBy(offerteSectiesTable.volgorde);
    res.json(rijen.map(mapSectie));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /offertes/:id/secties
router.post("/offertes/:id/secties", schrijven, async (req, res) => {
  try {
    const offerteId = parseId(req.params.id);
    const { sectie_type, volgorde, actief, titel, inhoud } = req.body;
    if (!titel && !sectie_type) return res.status(400).json({ error: "titel is verplicht" });
    const titelEff = titel || (SECTIE_LABELS[sectie_type ?? "vrij"] ?? "Sectie");
    const [s] = await db
      .insert(offerteSectiesTable)
      .values({
        offerteId,
        sectieType: sectie_type ?? "vrij",
        volgorde: volgorde ?? 0,
        actief: actief !== false,
        titel: titelEff,
        inhoud: inhoud ?? null,
      })
      .returning();
    res.status(201).json(mapSectie(s));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /offertes/:id/secties/initialiseren — standaardsecties aanmaken als er nog geen zijn
router.post("/offertes/:id/secties/initialiseren", schrijven, async (req, res) => {
  try {
    const offerteId = parseId(req.params.id);
    const bestaande = await db
      .select({ id: offerteSectiesTable.id })
      .from(offerteSectiesTable)
      .where(eq(offerteSectiesTable.offerteId, offerteId));
    if (bestaande.length > 0) {
      const rijen = await db
        .select()
        .from(offerteSectiesTable)
        .where(eq(offerteSectiesTable.offerteId, offerteId))
        .orderBy(offerteSectiesTable.volgorde);
      return res.json(rijen.map(mapSectie));
    }
    const aangemaakt = await db
      .insert(offerteSectiesTable)
      .values(STANDAARD_SECTIES.map((s) => ({ offerteId, ...s })))
      .returning();
    res.status(201).json(aangemaakt.map(mapSectie));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// PATCH /offerte-secties/:id
router.patch("/offerte-secties/:id", schrijven, async (req, res) => {
  try {
    const { sectie_type, volgorde, actief, titel, inhoud, ai_gegenereerd } = req.body;
    const [s] = await db
      .update(offerteSectiesTable)
      .set({
        ...(sectie_type !== undefined && { sectieType: sectie_type }),
        ...(volgorde !== undefined && { volgorde }),
        ...(actief !== undefined && { actief }),
        ...(titel !== undefined && { titel }),
        ...(inhoud !== undefined && { inhoud }),
        ...(ai_gegenereerd !== undefined && { aiGegenereerd: ai_gegenereerd }),
        bijgewerktOp: new Date(),
      })
      .where(eq(offerteSectiesTable.id, parseId(req.params.id)))
      .returning();
    if (!s) return res.status(404).json({ error: "Sectie niet gevonden" });
    res.json(mapSectie(s));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// DELETE /offerte-secties/:id
router.delete("/offerte-secties/:id", schrijven, async (req, res) => {
  try {
    await db.delete(offerteSectiesTable).where(eq(offerteSectiesTable.id, parseId(req.params.id)));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /offerte-secties/:id/ai-schrijven
router.post("/offerte-secties/:id/ai-schrijven", schrijven, async (req, res) => {
  if (!heeftOpenAi()) return res.status(503).json({ error: "AI niet beschikbaar" });
  try {
    const sectieId = parseId(req.params.id);
    const [sectie] = await db.select().from(offerteSectiesTable).where(eq(offerteSectiesTable.id, sectieId));
    if (!sectie) return res.status(404).json({ error: "Sectie niet gevonden" });

    const [offerte] = await db
      .select({
        id: offertesTable.id,
        titel: offertesTable.titel,
        opdrachtgever: offertesTable.opdrachtgever,
        gebouwNaam: gebouwenTable.naam,
        klantNaam: crmKlantenTable.naam,
        datum: offertesTable.datum,
        voorwaarden: offertesTable.voorwaarden,
      })
      .from(offertesTable)
      .leftJoin(gebouwenTable, eq(offertesTable.gebouwId, gebouwenTable.id))
      .leftJoin(crmKlantenTable, eq(offertesTable.klantId, crmKlantenTable.id))
      .where(eq(offertesTable.id, sectie.offerteId));

    const andereSectiesRows = await db
      .select({ titel: offerteSectiesTable.titel, inhoud: offerteSectiesTable.inhoud, sectieType: offerteSectiesTable.sectieType })
      .from(offerteSectiesTable)
      .where(eq(offerteSectiesTable.offerteId, sectie.offerteId));

    const andereSectieSamenvatting = andereSectiesRows
      .filter((s) => s.sectieType !== sectie.sectieType && s.inhoud)
      .map((s) => `${s.titel}: ${(s.inhoud ?? "").slice(0, 200)}`)
      .join("\n");

    // Haal begrotingsregels op voor context
    const regelsRows = await db
      .select({ maatregel: offerteRegelsTable.maatregel, ruimte: offerteRegelsTable.ruimte, aantal: offerteRegelsTable.aantal, eenheid: offerteRegelsTable.eenheid, kosten: offerteRegelsTable.kosten })
      .from(offerteRegelsTable)
      .where(eq(offerteRegelsTable.offerteId, sectie.offerteId))
      .orderBy(desc(offerteRegelsTable.kosten))
      .limit(8);

    const totaalBedrag = regelsRows.reduce((som, r) => som + (r.kosten ?? 0), 0);
    const regelsSamenvatting = regelsRows.length > 0
      ? regelsRows.map((r) => `- ${r.maatregel}${r.ruimte ? ` (${r.ruimte})` : ""}: ${r.aantal} ${r.eenheid}`).join("\n")
      : "";

    // Haal uitgangspunten op voor context
    const uitgangspuntenRows = await db
      .select({ tekst: offerteUitgangspuntenTable.tekst, type: offerteUitgangspuntenTable.type })
      .from(offerteUitgangspuntenTable)
      .where(eq(offerteUitgangspuntenTable.offerteId, sectie.offerteId))
      .limit(10);

    const uitgangspuntenSamenvatting = uitgangspuntenRows.length > 0
      ? uitgangspuntenRows.map((u) => `- [${u.type}] ${u.tekst}`).join("\n")
      : "";

    const contextExtra = (req.body as { context_extra?: string }).context_extra ?? "";

    const systeemPrompt = `Je bent een professionele offerte-schrijver voor FPS Brandpreventie, een Nederlands bedrijf gespecialiseerd in brandwerende voorzieningen en brandpreventie-inspectie. Je schrijft helder, zakelijk en professioneel Nederlands. Gebruik geen emojis. Schrijf in de eerste persoon meervoud (wij/onze). Houd de tekst bondig maar volledig. Verwijs concreet naar de maatregelen en objecten in de offerte.`;

    const gebruikersPrompt = `Schrijf de sectie "${sectie.titel}" (type: ${sectie.sectieType}) voor de offerte.

Offertegegevens:
- Offertetitel: ${offerte?.titel ?? ""}
- Opdrachtgever: ${offerte?.opdrachtgever ?? ""}
- Gebouw: ${offerte?.gebouwNaam ?? ""}
- Klant: ${offerte?.klantNaam ?? ""}
- Datum: ${offerte?.datum ?? ""}
${regelsSamenvatting ? `\nBegrotingsregels (top-8 op kosten, totaal ca. €${Math.round(totaalBedrag).toLocaleString("nl-NL")}):\n${regelsSamenvatting}` : ""}
${uitgangspuntenSamenvatting ? `\nUitgangspunten en voorbehouden:\n${uitgangspuntenSamenvatting}` : ""}
${andereSectieSamenvatting ? `\nAndere secties (ter context):\n${andereSectieSamenvatting}` : ""}
${contextExtra ? `\nAanvullende context: ${contextExtra}` : ""}

Schrijf een professionele, overtuigende tekst voor deze sectie. Gebruik alinea's. Verwijs naar specifieke maatregelen en omstandigheden uit de context. Maximaal 350 woorden.`;

    const client = maakOpenAiClient();
    const completion = await client.chat.completions.create({
      model: "gpt-5",
      max_completion_tokens: 1024,
      messages: [
        { role: "system", content: systeemPrompt },
        { role: "user", content: gebruikersPrompt },
      ],
    });

    const tekst = completion.choices[0]?.message?.content ?? "";
    res.json({ tekst });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Proposal Studio: versies ──────────────────────────────────────────────────

// GET /offertes/:id/versies
router.get("/offertes/:id/versies", lezen, async (req, res) => {
  try {
    const offerteId = parseId(req.params.id);
    const rijen = await db
      .select({
        versie: offerteVersiesTable,
        naam: gebruikersTable.naam,
      })
      .from(offerteVersiesTable)
      .leftJoin(gebruikersTable, eq(offerteVersiesTable.aangemaaktDoorId, gebruikersTable.id))
      .where(eq(offerteVersiesTable.offerteId, offerteId))
      .orderBy(desc(offerteVersiesTable.versienummer));
    res.json(rijen.map((r) => mapVersie(r.versie, r.naam)));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /offertes/:id/versies
router.post("/offertes/:id/versies", schrijven, async (req, res) => {
  try {
    const offerteId = parseId(req.params.id);
    const gebruikerId = (req.session as { gebruikerId?: number }).gebruikerId ?? null;
    const { samenvatting } = req.body;

    const [offerte] = await db.select().from(offertesTable).where(eq(offertesTable.id, offerteId));
    if (!offerte) return res.status(404).json({ error: "Offerte niet gevonden" });

    const secties = await db.select().from(offerteSectiesTable).where(eq(offerteSectiesTable.offerteId, offerteId)).orderBy(offerteSectiesTable.volgorde);
    const regels = await db.select().from(offerteRegelsTable).where(eq(offerteRegelsTable.offerteId, offerteId)).orderBy(offerteRegelsTable.volgorde);

    const bestaande = await db
      .select({ versienummer: offerteVersiesTable.versienummer })
      .from(offerteVersiesTable)
      .where(eq(offerteVersiesTable.offerteId, offerteId))
      .orderBy(desc(offerteVersiesTable.versienummer))
      .limit(1);
    const volgendVersienummer = (bestaande[0]?.versienummer ?? 0) + 1;

    const snapshot = { offerte, secties, regels };

    const [v] = await db
      .insert(offerteVersiesTable)
      .values({
        offerteId,
        versienummer: volgendVersienummer,
        snapshot,
        samenvatting: samenvatting ?? null,
        aangemaaktDoorId: gebruikerId,
      })
      .returning();

    const gebruiker = gebruikerId
      ? await db.select({ naam: gebruikersTable.naam }).from(gebruikersTable).where(eq(gebruikersTable.id, gebruikerId)).then((r) => r[0])
      : null;

    res.status(201).json(mapVersie(v, gebruiker?.naam));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Proposal Studio: bijlagen ─────────────────────────────────────────────────

// GET /offertes/:id/bijlagen
router.get("/offertes/:id/bijlagen", lezen, async (req, res) => {
  try {
    const offerteId = parseId(req.params.id);
    const rijen = await db
      .select()
      .from(offerteBijlagenTable)
      .where(eq(offerteBijlagenTable.offerteId, offerteId))
      .orderBy(offerteBijlagenTable.volgorde);
    res.json(rijen.map(mapBijlage));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /offertes/:id/bijlagen
router.post("/offertes/:id/bijlagen", schrijven, async (req, res) => {
  try {
    const offerteId = parseId(req.params.id);
    const { bijlage_type, naam, beschrijving, url, volgorde } = req.body;
    if (!naam) return res.status(400).json({ error: "naam is verplicht" });
    const [b] = await db
      .insert(offerteBijlagenTable)
      .values({
        offerteId,
        bijlageType: bijlage_type ?? "overig",
        naam,
        beschrijving: beschrijving ?? null,
        url: url ?? null,
        volgorde: volgorde ?? 0,
      })
      .returning();
    res.status(201).json(mapBijlage(b));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// PATCH /offerte-bijlagen/:id
router.patch("/offerte-bijlagen/:id", schrijven, async (req, res) => {
  try {
    const { bijlage_type, naam, beschrijving, url, volgorde } = req.body;
    const [b] = await db
      .update(offerteBijlagenTable)
      .set({
        ...(bijlage_type !== undefined && { bijlageType: bijlage_type }),
        ...(naam !== undefined && { naam }),
        ...(beschrijving !== undefined && { beschrijving }),
        ...(url !== undefined && { url }),
        ...(volgorde !== undefined && { volgorde }),
        bijgewerktOp: new Date(),
      })
      .where(eq(offerteBijlagenTable.id, parseId(req.params.id)))
      .returning();
    if (!b) return res.status(404).json({ error: "Bijlage niet gevonden" });
    res.json(mapBijlage(b));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// DELETE /offerte-bijlagen/:id
router.delete("/offerte-bijlagen/:id", schrijven, async (req, res) => {
  try {
    await db.delete(offerteBijlagenTable).where(eq(offerteBijlagenTable.id, parseId(req.params.id)));
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

// ── Portaal-token aanmaken ───────────────────────────────────────────────────
router.post("/offertes/:id/portaal-token", schrijven, async (req, res) => {
  try {
    const offerteId = parseId(req.params.id);
    const [offerte] = await db.select().from(offertesTable).where(eq(offertesTable.id, offerteId));
    if (!offerte) return res.status(404).json({ error: "Offerte niet gevonden" });

    const token = randomBytes(32).toString("hex");
    const geldigDagen = Number(req.body?.geldig_dagen ?? 30);
    const verlooptOp = new Date(Date.now() + geldigDagen * 24 * 60 * 60 * 1000);

    const [row] = await db
      .insert(offertePortaalTokensTable)
      .values({ offerteId, token, verlooptOp })
      .returning();

    res.status(201).json({
      id: row.id,
      token: row.token,
      verloopt_op: row.verlooptOp.toISOString(),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Bestaande portaal-tokens ophalen ─────────────────────────────────────────
router.get("/offertes/:id/portaal-tokens", lezen, async (req, res) => {
  try {
    const offerteId = parseId(req.params.id);
    const tokens = await db
      .select()
      .from(offertePortaalTokensTable)
      .where(eq(offertePortaalTokensTable.offerteId, offerteId))
      .orderBy(desc(offertePortaalTokensTable.aangemaaktOp));

    res.json(
      tokens.map((t) => ({
        id: t.id,
        token: t.token,
        verloopt_op: t.verlooptOp.toISOString(),
        aangemaakt_op: t.aangemaaktOp.toISOString(),
      })),
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Vragen ophalen (admin) ────────────────────────────────────────────────────
router.get("/offertes/:id/vragen", lezen, async (req, res) => {
  try {
    const offerteId = parseId(req.params.id);
    const vragen = await db
      .select()
      .from(offerteVragenTable)
      .where(eq(offerteVragenTable.offerteId, offerteId))
      .orderBy(desc(offerteVragenTable.aangemaaktOp));

    res.json(
      vragen.map((v) => ({
        id: v.id,
        bezoeker_naam: v.bezoekerNaam,
        vraag: v.vraag,
        antwoord: v.antwoord,
        aangemaakt_op: v.aangemaaktOp.toISOString(),
      })),
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Tracking ophalen (admin) ──────────────────────────────────────────────────
router.get("/offertes/:id/tracking", lezen, async (req, res) => {
  try {
    const offerteId = parseId(req.params.id);
    const events = await db
      .select()
      .from(offerteTrackingTable)
      .where(eq(offerteTrackingTable.offerteId, offerteId))
      .orderBy(desc(offerteTrackingTable.aangemaaktOp));

    res.json(
      events.map((e) => ({
        id: e.id,
        event: e.event,
        portaal_token: e.portaalToken,
        aangemaakt_op: e.aangemaaktOp.toISOString(),
      })),
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── AI e-mailvoorstel ─────────────────────────────────────────────────────────
router.post("/offertes/:id/ai-email", schrijven, async (req, res) => {
  try {
    const offerteId = parseId(req.params.id);
    const [offerte] = await db.select().from(offertesTable).where(eq(offertesTable.id, offerteId));
    if (!offerte) return res.status(404).json({ error: "Offerte niet gevonden" });

    if (!heeftOpenAi()) {
      return res.json({
        onderwerp: `Offerte ${offerte.offertenummer ?? offerte.id} — ${offerte.titel}`,
        begroeting: `Geachte heer/mevrouw,`,
        samenvatting: `Bijgevoegd vindt u onze offerte voor ${offerte.titel}.`,
        call_to_action: `U kunt de offerte online bekijken en ondertekenen via de bijgevoegde link.`,
        afsluiting: `Met vriendelijke groet,`,
      });
    }

    const ai = maakOpenAiClient();
    const completion = await ai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 600,
      messages: [
        {
          role: "system",
          content:
            "Je bent een professionele tekstschrijver voor FPS Brandpreventie. Schrijf zakelijke maar vriendelijke e-mailteksten in het Nederlands.",
        },
        {
          role: "user",
          content: `Schrijf een begeleidende e-mail voor de volgende offerte:
Titel: ${offerte.titel}
Offertenummer: ${offerte.offertenummer ?? "—"}
Opdrachtgever: ${offerte.opdrachtgever ?? "—"}
Bedrag incl. btw: €${offerte.bedragInclBtw.toLocaleString("nl-NL", { minimumFractionDigits: 2 })}
Geldigheid: ${offerte.geldigheidDagen} dagen

Geef als JSON terug: { onderwerp, begroeting, samenvatting, call_to_action, afsluiting }`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) : {};

    res.json({
      onderwerp: parsed.onderwerp ?? `Offerte ${offerte.offertenummer ?? offerte.id}`,
      begroeting: parsed.begroeting ?? "Geachte heer/mevrouw,",
      samenvatting: parsed.samenvatting ?? "",
      call_to_action: parsed.call_to_action ?? "",
      afsluiting: parsed.afsluiting ?? "Met vriendelijke groet,",
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Offerte verzenden via e-mail ──────────────────────────────────────────────
router.post("/offertes/:id/verzenden", schrijven, async (req, res) => {
  try {
    const offerteId = parseId(req.params.id);
    const [offerte] = await db.select().from(offertesTable).where(eq(offertesTable.id, offerteId));
    if (!offerte) return res.status(404).json({ error: "Offerte niet gevonden" });

    const naarEmail = String(req.body?.naar_email ?? "").trim();
    const naarNaam = String(req.body?.naar_naam ?? "").trim() || null;
    const onderwerp = String(req.body?.onderwerp ?? "").trim() || `Offerte ${offerte.offertenummer ?? offerteId}`;
    const tekst = String(req.body?.tekst ?? "").trim();
    const portaalLink = String(req.body?.portaal_link ?? "").trim();

    if (!naarEmail) return res.status(400).json({ error: "Ontvangersmailadres is verplicht." });

    const html = `<!DOCTYPE html>
<html lang="nl">
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;color:#212631;max-width:600px;margin:0 auto;padding:20px">
  <div style="text-align:center;margin-bottom:24px">
    <div style="background:#F23B0D;color:#fff;font-size:22px;font-weight:bold;padding:16px 24px;border-radius:8px">FPS Brandpreventie</div>
  </div>
  <p>${tekst.replace(/\n/g, "<br>")}</p>
  ${portaalLink ? `<div style="text-align:center;margin:32px 0">
    <a href="${portaalLink}" style="background:#F23B0D;color:#fff;padding:14px 28px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block">
      Offerte bekijken en ondertekenen
    </a>
  </div>` : ""}
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0">
  <p style="font-size:12px;color:#6b7280">FPS Brandpreventie — Uw partner in brandveiligheid</p>
</body>
</html>`;

    await verstuurMail({
      naarEmail,
      naarNaam,
      onderwerp,
      html,
      soort: "offerte",
      verstuurdDoorId: req.session.userId ?? null,
    });

    await db.insert(offerteEmailLogTable).values({
      offerteId,
      ontvanger: naarEmail,
      onderwerp,
      status: "verzonden",
      portaalToken: portaalLink.split("/portaal/")[1]?.split("?")[0] ?? null,
    });

    await db
      .update(offertesTable)
      .set({ portaalStatus: "verzonden", bijgewerktOp: new Date() })
      .where(eq(offertesTable.id, offerteId));

    await db.insert(offerteTrackingTable).values({
      offerteId,
      event: "verzonden",
      portaalToken: null,
      ip: null,
    });

    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
