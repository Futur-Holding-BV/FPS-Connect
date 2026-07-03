// Offerte-routes (Fase 1 — PREP) — Parallel spoor, formeel akkoord gebruiker.
//
// Offertestructuur, begroting en uitgangspunten op basis van het echte
// FPS-offerteformat. Fase 1 bevat BEWUST GEEN AI-logica en GEEN automatische
// offerteverzending. /offertes/:id/uit-spots leest de spots van het gekoppelde
// gebouw en zet die om naar concept-begrotingsregels (mens beslist, AI niet).
import { Router } from "express";
import { workflowService, maakTransitieContext } from "../services/workflow-engine";
import PDFDocument from "pdfkit";
import {
  db,
  offerteVoorwaardenSetsTable,
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
  offerteKlantContractenTable,
  offerteContractAdviezenTable,
} from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage";
import { eq, desc, count, sql, and, not, inArray } from "drizzle-orm";
import { randomBytes } from "crypto";
import { requireBevoegdheid } from "../middlewares/auth";
import { aiGateway, heeftGateway } from "../lib/aiGateway";
import { verstuurMail } from "../services/email";

const router = Router();

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}

async function isOfferteBlokkeerd(offerteId: number): Promise<boolean> {
  const [o] = await db
    .select({ portaalStatus: offertesTable.portaalStatus })
    .from(offertesTable)
    .where(eq(offertesTable.id, offerteId));
  return o?.portaalStatus === "ondertekend" || o?.portaalStatus === "afgewezen";
}

const lezen = requireBevoegdheid("offertes", 1);
const schrijven = requireBevoegdheid("offertes", 2);

const iso = (d: Date) => d.toISOString();

function parseId(v: unknown): number {
  return parseInt(String(v), 10);
}

// ── Voorwaardenbibliotheek ───────────────────────────────────────────────────
const mapVoorwaardenSet = (s: typeof offerteVoorwaardenSetsTable.$inferSelect) => ({
  id: s.id,
  naam: s.naam,
  versie: s.versie,
  tekst: s.tekst,
  actief: s.actief,
  aangemaakt_op: iso(s.aangemaaktOp),
  bijgewerkt_op: iso(s.bijgewerktOp),
});

router.get("/offerte-voorwaarden-sets", lezen, async (req, res) => {
  try {
    const rijen = await db.select().from(offerteVoorwaardenSetsTable).orderBy(offerteVoorwaardenSetsTable.naam);
    res.json(rijen.map(mapVoorwaardenSet));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/offerte-voorwaarden-sets", schrijven, async (req, res) => {
  try {
    const { naam, versie, tekst, actief } = req.body;
    if (!naam) return res.status(400).json({ error: "naam is verplicht" });
    const [s] = await db
      .insert(offerteVoorwaardenSetsTable)
      .values({ naam, versie: versie || "1.0", tekst: tekst || "", actief: actief ?? true })
      .returning();
    res.status(201).json(mapVoorwaardenSet(s));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.patch("/offerte-voorwaarden-sets/:id", schrijven, async (req, res) => {
  try {
    const { naam, versie, tekst, actief } = req.body;
    const [s] = await db
      .update(offerteVoorwaardenSetsTable)
      .set({
        ...(naam !== undefined && { naam }),
        ...(versie !== undefined && { versie }),
        ...(tekst !== undefined && { tekst }),
        ...(actief !== undefined && { actief }),
        bijgewerktOp: new Date(),
      })
      .where(eq(offerteVoorwaardenSetsTable.id, parseId(req.params.id)))
      .returning();
    if (!s) return res.status(404).json({ error: "Voorwaardenset niet gevonden" });
    res.json(mapVoorwaardenSet(s));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.delete("/offerte-voorwaarden-sets/:id", schrijven, async (req, res) => {
  try {
    await db.delete(offerteVoorwaardenSetsTable).where(eq(offerteVoorwaardenSetsTable.id, parseId(req.params.id)));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Sjablonen ───────────────────────────────────────────────────────────────
const mapSjabloon = (s: typeof offerteSjablonenTable.$inferSelect) => ({
  id: s.id,
  naam: s.naam,
  omschrijving: s.omschrijving,
  werkmaatschappij: s.werkmaatschappij,
  doelgroep: s.doelgroep,
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
    const { naam, omschrijving, werkmaatschappij, doelgroep, actief } = req.body;
    if (!naam) return res.status(400).json({ error: "naam is verplicht" });
    const [s] = await db
      .insert(offerteSjablonenTable)
      .values({ naam, omschrijving, werkmaatschappij: werkmaatschappij || "FPS Bouw", doelgroep: doelgroep || "algemeen", actief: actief ?? true })
      .returning();
    res.status(201).json(mapSjabloon(s));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.patch("/offerte-sjablonen/:id", schrijven, async (req, res) => {
  try {
    const { naam, omschrijving, werkmaatschappij, doelgroep, actief } = req.body;
    const [s] = await db
      .update(offerteSjablonenTable)
      .set({ naam, omschrijving, werkmaatschappij, doelgroep, actief, bijgewerktOp: new Date() })
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
    betalingstermijn_dagen: o.betalingstermijnDagen,
    betaalwijze: o.betaalwijze,
    factuur_schema: o.factuurSchema,
    voorwaarden_set_id: o.voorwaardenSetId,
    voorwaarden_snapshot: o.voorwaardenSnapshot,
    bedrag_excl_btw: o.bedragExclBtw,
    btw_percentage: o.btwPercentage,
    bedrag_incl_btw: o.bedragInclBtw,
    status: o.status,
    portaal_status: o.portaalStatus,
    auto_project_id: o.autoProjectId ?? null,
    begroting_weergave: o.begrotingWeergave ?? null,
    presentatie_niveau: o.presentatieNiveau ?? 3,
    klant_type: o.klantType ?? null,
    vervolg_opties: o.vervolgOpties ?? null,
    vervolg_tekst: o.vervolgTekst ?? null,
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

    // Per-offerte AI acceptatiescore (aandeel door AI voorgestelde regels).
    const aiScoreRijen = await db
      .select({
        offerteId: offerteRegelsTable.offerteId,
        totaal: sql<number>`count(*)::int`,
        aiAantal: sql<number>`count(*) filter (where ${offerteRegelsTable.aiVoorstel} = true)::int`,
      })
      .from(offerteRegelsTable)
      .groupBy(offerteRegelsTable.offerteId);
    const aiScoreMap = new Map<number, "laag" | "midden" | "hoog">();
    for (const s of aiScoreRijen) {
      if (!s.offerteId || s.totaal === 0) continue;
      const ratio = s.aiAantal / s.totaal;
      aiScoreMap.set(s.offerteId, ratio >= 0.67 ? "hoog" : ratio >= 0.34 ? "midden" : "laag");
    }

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
        portaal_status: r.o.portaalStatus,
        auto_project_id: r.o.autoProjectId ?? null,
        aangemaakt_door_id: r.o.aangemaaktDoorId,
        aangemaakt_op: iso(r.o.aangemaaktOp),
        bijgewerkt_op: iso(r.o.bijgewerktOp),
        ai_acceptatiescore: aiScoreMap.get(r.o.id) ?? null,
      })),
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/offertes", schrijven, async (req, res) => {
  try {
    const { titel, offertenummer, gebouw_id, klant_id, sjabloon_id, opdrachtgever, ons_kenmerk, uw_kenmerk, uw_brief_van, behandeld_door_id, datum, geldigheid_dagen, voorwaarden, betalingstermijn_dagen, betaalwijze, factuur_schema, voorwaarden_set_id, bedrag_excl_btw, btw_percentage, bedrag_incl_btw, status } = req.body;
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
        betalingstermijnDagen: betalingstermijn_dagen ?? 30,
        betaalwijze: betaalwijze ?? null,
        factuurSchema: factuur_schema ?? null,
        voorwaardenSetId: voorwaarden_set_id ?? null,
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

    // Gemiddelde doorlooptijd (aangemaakt → ondertekend) in dagen
    const doorlooptijdRij = await db.execute(
      sql`SELECT AVG(EXTRACT(EPOCH FROM (h.aangemaakt_op - o.aangemaakt_op)) / 86400)::numeric AS gem_dagen
          FROM offertes o
          JOIN offerte_handtekeningen h ON h.offerte_id = o.id`
    );
    const gemDagen = Number((doorlooptijdRij.rows[0] as any)?.gem_dagen ?? 0);

    // Vervallen: verzonden offertes waarvan het portaaltoken verlopen is
    const vervallenRij = await db.execute(
      sql`SELECT COUNT(DISTINCT o.id)::int AS n
          FROM offertes o
          JOIN offerte_portaal_tokens t ON t.offerte_id = o.id
          WHERE o.portaal_status = 'verzonden'
            AND t.verloopt_op < NOW()`
    );
    const vervallen = Number((vervallenRij.rows[0] as any)?.n ?? 0);

    // AI-acceptatiescore: percentage regels dat als AI-voorstel is aangemaakt
    const aiRij = await db.execute(
      sql`SELECT
            COUNT(*) FILTER (WHERE ai_voorstel = true)::int AS ai_regels,
            COUNT(*)::int AS totaal_regels
          FROM offerte_regels`
    );
    const aiRegels = Number((aiRij.rows[0] as any)?.ai_regels ?? 0);
    const totaalRegels = Number((aiRij.rows[0] as any)?.totaal_regels ?? 0);
    const aiAcceptatieScore = totaalRegels > 0 ? Math.round((aiRegels / totaalRegels) * 100) : 0;

    // Top 5 offertes met meeste bijlage-downloads (event = 'bijlage_gedownload')
    const bijlageDownloadsRij = await db.execute(
      sql`SELECT t.offerte_id, o.offertenummer, o.titel, COUNT(*)::int AS downloads
          FROM offerte_tracking t
          JOIN offertes o ON o.id = t.offerte_id
          WHERE t.event = 'bijlage_gedownload'
          GROUP BY t.offerte_id, o.offertenummer, o.titel
          ORDER BY downloads DESC
          LIMIT 5`
    );
    const topBijlagen = (bijlageDownloadsRij.rows as any[]).map((r) => ({
      offerte_id: Number(r.offerte_id),
      offertenummer: r.offertenummer ?? null,
      titel: r.titel ?? null,
      downloads: Number(r.downloads),
    }));

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
      vervallen,
      conversie_procent: conversie,
      gemiddelde_waarde: Math.round(gemWaarde * 100) / 100,
      gemiddelde_doorlooptijd_dagen: Math.round(gemDagen * 10) / 10,
      ai_acceptatie_score: aiAcceptatieScore,
      top_bijlagen: topBijlagen,
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
    const offerteId = parseId(req.params.id);
    if (await isOfferteBlokkeerd(offerteId))
      return res.status(409).json({ error: "Ondertekende offerte kan niet meer worden gewijzigd." });
    const { titel, offertenummer, gebouw_id, klant_id, sjabloon_id, opdrachtgever, ons_kenmerk, uw_kenmerk, uw_brief_van, behandeld_door_id, datum, geldigheid_dagen, voorwaarden, betalingstermijn_dagen, betaalwijze, factuur_schema, voorwaarden_set_id, bedrag_excl_btw, btw_percentage, bedrag_incl_btw, status, begroting_weergave, presentatie_niveau, klant_type, vervolg_opties, vervolg_tekst, verzend_type } = req.body;

    // Status via de WorkflowEngine
    if (status !== undefined) {
      const ctx = await maakTransitieContext(req, db);
      const result = await workflowService.transiteer("offerte", offerteId, status, ctx);
      if (!result.ok) {
        return res.status(result.error!.httpStatus).json({ error: result.error!.bericht });
      }
    }

    const [o] = await db
      .update(offertesTable)
      .set({
        ...(titel !== undefined && { titel }),
        ...(offertenummer !== undefined && { offertenummer }),
        ...(gebouw_id !== undefined && { gebouwId: gebouw_id }),
        ...(klant_id !== undefined && { klantId: klant_id }),
        ...(sjabloon_id !== undefined && { sjabloonId: sjabloon_id }),
        ...(opdrachtgever !== undefined && { opdrachtgever }),
        ...(ons_kenmerk !== undefined && { onsKenmerk: ons_kenmerk }),
        ...(uw_kenmerk !== undefined && { uwKenmerk: uw_kenmerk }),
        ...(uw_brief_van !== undefined && { uwBriefVan: uw_brief_van }),
        ...(behandeld_door_id !== undefined && { behandeldDoorId: behandeld_door_id }),
        ...(datum !== undefined && { datum }),
        ...(geldigheid_dagen !== undefined && { geldigheidDagen: geldigheid_dagen }),
        ...(voorwaarden !== undefined && { voorwaarden }),
        ...(betalingstermijn_dagen !== undefined && { betalingstermijnDagen: betalingstermijn_dagen }),
        ...(betaalwijze !== undefined && { betaalwijze }),
        ...(factuur_schema !== undefined && { factuurSchema: factuur_schema }),
        ...(voorwaarden_set_id !== undefined && { voorwaardenSetId: voorwaarden_set_id }),
        ...(bedrag_excl_btw !== undefined && { bedragExclBtw: bedrag_excl_btw }),
        ...(btw_percentage !== undefined && { btwPercentage: btw_percentage }),
        ...(bedrag_incl_btw !== undefined && { bedragInclBtw: bedrag_incl_btw }),
        ...(begroting_weergave !== undefined && { begrotingWeergave: begroting_weergave }),
        ...(presentatie_niveau !== undefined && { presentatieNiveau: presentatie_niveau }),
        ...(klant_type !== undefined && { klantType: klant_type }),
        ...(vervolg_opties !== undefined && { vervolgOpties: vervolg_opties }),
        ...(vervolg_tekst !== undefined && { vervolgTekst: vervolg_tekst }),
        ...(verzend_type !== undefined && { verzendType: verzend_type }),
        bijgewerktOp: new Date(),
      })
      .where(eq(offertesTable.id, offerteId))
      .returning();
    if (!o) return res.status(404).json({ error: "Offerte niet gevonden" });
    res.json(await offerteNaarJson(o));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/offertes/:id/ai-presentatieniveau", schrijven, async (req, res) => {
  try {
    const offerteId = parseId(req.params.id);
    const [o] = await db.select().from(offertesTable).where(eq(offertesTable.id, offerteId));
    if (!o) return res.status(404).json({ error: "Offerte niet gevonden" });

    let klantType = o.klantType ?? "bedrijf";
    if (!klantType && o.klantId) {
      const [k] = await db.select({ type: crmKlantenTable.type }).from(crmKlantenTable).where(eq(crmKlantenTable.id, o.klantId));
      if (k?.type) klantType = k.type;
    }

    const niveauMap: Record<string, number> = {
      woningcorporatie: 2, gemeente: 2, school: 2, zorginstelling: 2, particulier: 2, gebouweigenaar: 2,
      VvE: 3, vve: 3, aannemer: 3, installateur: 3, bedrijf: 3,
      architect: 4,
    };
    const niveau = niveauMap[klantType] ?? 3;

    const motivatieMap: Record<number, string> = {
      1: "Alleen categorietotalen en eindtotaal — geschikt voor klanten die geen detailbegroting nodig hebben.",
      2: "Omschrijvingen zonder eenheidsprijzen — professioneel en transparant zonder kostprijsgevoelige informatie.",
      3: "Volledig — standaard voor zakelijke klanten met interesse in de volledige begroting.",
      4: "Uitgebreid — geschikt voor technisch onderlegde partijen zoals architecten en adviseurs.",
      5: "Maximaal detail — inclusief aanvullende projectinformatie voor interne verwerking.",
    };
    const motivatie = motivatieMap[niveau] ?? motivatieMap[3];

    if (o.klantId) {
      await db.update(crmKlantenTable)
        .set({ voorkeursPresentatieNiveau: niveau, bijgewerktOp: new Date() })
        .where(eq(crmKlantenTable.id, o.klantId));
    }

    res.json({ niveau, motivatie });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.delete("/offertes/:id", schrijven, async (req, res) => {
  try {
    const offerteId = parseId(req.params.id);
    if (await isOfferteBlokkeerd(offerteId))
      return res.status(409).json({ error: "Ondertekende of afgewezen offerte kan niet worden verwijderd." });
    await db.delete(offertesTable).where(eq(offertesTable.id, offerteId));
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
  is_optioneel: r.isOptioneel,
  optioneel_geselecteerd: r.optioneelGeselecteerd,
  weergave_override: r.weergaveOverride ?? null,
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
    const offerteId = parseId(req.params.id);
    if (await isOfferteBlokkeerd(offerteId))
      return res.status(409).json({ error: "Ondertekende offerte kan niet meer worden gewijzigd." });
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
    const [bestaandeRegel] = await db.select({ offerteId: offerteRegelsTable.offerteId }).from(offerteRegelsTable).where(eq(offerteRegelsTable.id, parseId(req.params.id)));
    if (!bestaandeRegel) return res.status(404).json({ error: "Begrotingsregel niet gevonden" });
    if (await isOfferteBlokkeerd(bestaandeRegel.offerteId))
      return res.status(409).json({ error: "Ondertekende offerte kan niet meer worden gewijzigd." });
    const { maatregel, categorie, snag_referentie, voorziening_id, ruimte, uitgangspunten, eenheid, aantal, prijs_per_eenheid, kosten, volgorde, ai_voorstel, is_optioneel, weergave_override } = req.body;
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
        ...(is_optioneel !== undefined ? { isOptioneel: is_optioneel } : {}),
        ...(weergave_override !== undefined ? { weergaveOverride: weergave_override } : {}),
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
    const [bestaandeRegel] = await db.select({ offerteId: offerteRegelsTable.offerteId }).from(offerteRegelsTable).where(eq(offerteRegelsTable.id, parseId(req.params.id)));
    if (!bestaandeRegel) return res.status(404).json({ error: "Begrotingsregel niet gevonden" });
    if (await isOfferteBlokkeerd(bestaandeRegel.offerteId))
      return res.status(409).json({ error: "Ondertekende offerte kan niet meer worden gewijzigd." });
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
    const offerteId = parseId(req.params.id);
    if (await isOfferteBlokkeerd(offerteId))
      return res.status(409).json({ error: "Ondertekende offerte kan niet meer worden gewijzigd." });
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
    const [bestaandUitgangspunt] = await db.select({ offerteId: offerteUitgangspuntenTable.offerteId }).from(offerteUitgangspuntenTable).where(eq(offerteUitgangspuntenTable.id, parseId(req.params.id)));
    if (!bestaandUitgangspunt) return res.status(404).json({ error: "Uitgangspunt niet gevonden" });
    if (await isOfferteBlokkeerd(bestaandUitgangspunt.offerteId))
      return res.status(409).json({ error: "Ondertekende offerte kan niet meer worden gewijzigd." });
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
    const [bestaandUitgangspunt] = await db.select({ offerteId: offerteUitgangspuntenTable.offerteId }).from(offerteUitgangspuntenTable).where(eq(offerteUitgangspuntenTable.id, parseId(req.params.id)));
    if (!bestaandUitgangspunt) return res.status(404).json({ error: "Uitgangspunt niet gevonden" });
    if (await isOfferteBlokkeerd(bestaandUitgangspunt.offerteId))
      return res.status(409).json({ error: "Ondertekende offerte kan niet meer worden gewijzigd." });
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
    if (await isOfferteBlokkeerd(offerteId)) return res.status(409).json({ error: "Ondertekende of afgewezen offerte kan niet worden gewijzigd." });
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
    if (await isOfferteBlokkeerd(offerteId)) return res.status(409).json({ error: "Ondertekende of afgewezen offerte kan niet worden gewijzigd." });
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
    const sectieId = parseId(req.params.id);
    const [bestaandeSectie] = await db
      .select({ offerteId: offerteSectiesTable.offerteId })
      .from(offerteSectiesTable)
      .where(eq(offerteSectiesTable.id, sectieId));
    if (!bestaandeSectie) return res.status(404).json({ error: "Sectie niet gevonden" });
    if (await isOfferteBlokkeerd(bestaandeSectie.offerteId)) return res.status(409).json({ error: "Ondertekende of afgewezen offerte kan niet worden gewijzigd." });
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
      .where(eq(offerteSectiesTable.id, sectieId))
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
    const sectieId = parseId(req.params.id);
    const [bestaandeSectie] = await db
      .select({ offerteId: offerteSectiesTable.offerteId })
      .from(offerteSectiesTable)
      .where(eq(offerteSectiesTable.id, sectieId));
    if (!bestaandeSectie) return res.status(404).json({ error: "Sectie niet gevonden" });
    if (await isOfferteBlokkeerd(bestaandeSectie.offerteId)) return res.status(409).json({ error: "Ondertekende of afgewezen offerte kan niet worden gewijzigd." });
    await db.delete(offerteSectiesTable).where(eq(offerteSectiesTable.id, sectieId));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /offerte-secties/:id/ai-schrijven
router.post("/offerte-secties/:id/ai-schrijven", schrijven, async (req, res) => {
  if (!heeftGateway()) return res.status(503).json({ error: "AI niet beschikbaar" });
  try {
    const sectieId = parseId(req.params.id);
    const [sectie] = await db.select().from(offerteSectiesTable).where(eq(offerteSectiesTable.id, sectieId));
    if (!sectie) return res.status(404).json({ error: "Sectie niet gevonden" });
    if (await isOfferteBlokkeerd(sectie.offerteId)) return res.status(409).json({ error: "Ondertekende of afgewezen offerte kan niet worden gewijzigd." });

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

    const sectieResultaat = await aiGateway.chat("reasoning", {
      max_completion_tokens: 1024,
      messages: [
        { role: "system", content: systeemPrompt },
        { role: "user", content: gebruikersPrompt },
      ],
    });

    const tekst = sectieResultaat.ok ? sectieResultaat.inhoud : "";
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
    if (await isOfferteBlokkeerd(offerteId)) return res.status(409).json({ error: "Ondertekende of afgewezen offerte kan niet worden gewijzigd." });

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
    if (await isOfferteBlokkeerd(offerteId)) return res.status(409).json({ error: "Ondertekende of afgewezen offerte kan niet worden gewijzigd." });
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
    const bijlageId = parseId(req.params.id);
    const [bestaandeBijlage] = await db
      .select({ offerteId: offerteBijlagenTable.offerteId })
      .from(offerteBijlagenTable)
      .where(eq(offerteBijlagenTable.id, bijlageId));
    if (!bestaandeBijlage) return res.status(404).json({ error: "Bijlage niet gevonden" });
    if (await isOfferteBlokkeerd(bestaandeBijlage.offerteId)) return res.status(409).json({ error: "Ondertekende of afgewezen offerte kan niet worden gewijzigd." });
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
      .where(eq(offerteBijlagenTable.id, bijlageId))
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
    const bijlageId = parseId(req.params.id);
    const [bestaandeBijlage] = await db
      .select({ offerteId: offerteBijlagenTable.offerteId })
      .from(offerteBijlagenTable)
      .where(eq(offerteBijlagenTable.id, bijlageId));
    if (!bestaandeBijlage) return res.status(404).json({ error: "Bijlage niet gevonden" });
    if (await isOfferteBlokkeerd(bestaandeBijlage.offerteId)) return res.status(409).json({ error: "Ondertekende of afgewezen offerte kan niet worden gewijzigd." });
    await db.delete(offerteBijlagenTable).where(eq(offerteBijlagenTable.id, bijlageId));
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
    if (await isOfferteBlokkeerd(offerteId)) return res.status(409).json({ error: "Ondertekende of afgewezen offerte kan niet worden gewijzigd." });

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
        bezoeker_email: v.bezoekerEmail,
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

// ── Vraag beantwoorden (admin) ────────────────────────────────────────────────
router.patch("/offertes/:id/vragen/:vraagId", schrijven, async (req, res) => {
  try {
    const offerteId = parseId(req.params.id);
    const vraagId = parseId(req.params.vraagId);
    const antwoord = String(req.body?.antwoord ?? "").trim();
    const naarEmail = String(req.body?.naar_email ?? "").trim() || null;
    const naarNaam = String(req.body?.naar_naam ?? "").trim() || null;

    if (!antwoord) return res.status(400).json({ error: "Antwoord is verplicht." });

    const [vraag] = await db
      .select()
      .from(offerteVragenTable)
      .where(eq(offerteVragenTable.id, vraagId));

    if (!vraag || vraag.offerteId !== offerteId) {
      return res.status(404).json({ error: "Vraag niet gevonden." });
    }

    const [bijgewerkt] = await db
      .update(offerteVragenTable)
      .set({ antwoord, bijgewerktOp: new Date() })
      .where(eq(offerteVragenTable.id, vraagId))
      .returning();

    await db.insert(offerteTrackingTable).values({
      offerteId,
      event: "vraag_beantwoord",
      portaalToken: null,
      ip: null,
    });

    if (naarEmail) {
      const [offerte] = await db
        .select()
        .from(offertesTable)
        .where(eq(offertesTable.id, offerteId));

      const html = `<!DOCTYPE html>
<html lang="nl">
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;color:#212631;max-width:600px;margin:0 auto;padding:20px">
  <div style="text-align:center;margin-bottom:24px">
    <div style="background:#F23B0D;color:#fff;font-size:22px;font-weight:bold;padding:16px 24px;border-radius:8px">FPS Brandpreventie</div>
  </div>
  <p>Uw vraag over offerte <strong>${offerte?.offertenummer ?? offerte?.titel ?? `#${offerteId}`}</strong> is beantwoord:</p>
  <div style="background:#f9fafb;border-left:4px solid #F23B0D;padding:12px 16px;margin:16px 0;border-radius:0 6px 6px 0">
    <p style="font-size:13px;color:#6b7280;margin:0 0 4px 0">Uw vraag:</p>
    <p style="margin:0 0 12px 0">${escapeHtml(vraag.vraag)}</p>
    <p style="font-size:13px;color:#6b7280;margin:0 0 4px 0">Ons antwoord:</p>
    <p style="margin:0;font-weight:500">${escapeHtml(antwoord)}</p>
  </div>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0">
  <p style="font-size:12px;color:#6b7280">FPS Brandpreventie — Uw partner in brandveiligheid</p>
</body>
</html>`;

      await verstuurMail({
        naarEmail,
        naarNaam,
        onderwerp: `Antwoord op uw vraag — ${offerte?.offertenummer ?? offerte?.titel ?? `Offerte #${offerteId}`}`,
        html,
        soort: "offerte",
        verstuurdDoorId: req.session.userId ?? null,
      });
    }

    res.json({
      id: bijgewerkt!.id,
      bezoeker_naam: bijgewerkt!.bezoekerNaam,
      vraag: bijgewerkt!.vraag,
      antwoord: bijgewerkt!.antwoord,
      aangemaakt_op: bijgewerkt!.aangemaaktOp.toISOString(),
    });
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

    // Extra context ophalen: secties, maatregelregels, gebouwnaam
    const [secties, regels, gebouwRij] = await Promise.all([
      db.select({ titel: offerteSectiesTable.titel })
        .from(offerteSectiesTable)
        .where(and(eq(offerteSectiesTable.offerteId, offerteId), eq(offerteSectiesTable.actief, true)))
        .orderBy(offerteSectiesTable.volgorde),
      db.select({ maatregel: offerteRegelsTable.maatregel, categorie: offerteRegelsTable.categorie })
        .from(offerteRegelsTable)
        .where(eq(offerteRegelsTable.offerteId, offerteId))
        .orderBy(offerteRegelsTable.volgorde),
      offerte.gebouwId
        ? db.select({ naam: gebouwenTable.naam, stad: gebouwenTable.stad })
            .from(gebouwenTable).where(eq(gebouwenTable.id, offerte.gebouwId))
        : Promise.resolve([null]),
    ]);

    const gebouw = Array.isArray(gebouwRij) ? gebouwRij[0] : null;
    const maatregelen = regels
      .filter(r => r.categorie === "maatregel" && r.maatregel?.trim())
      .map(r => `- ${r.maatregel.trim()}`)
      .slice(0, 12);
    const sectietitels = secties.map(s => s.titel).filter(Boolean);

    const locatieTekst = gebouw?.naam
      ? `${gebouw.naam}${gebouw.stad ? ` (${gebouw.stad})` : ""}`
      : null;

    const bedragFormatted = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(offerte.bedragInclBtw);

    // Fallback zonder OpenAI
    if (!heeftGateway()) {
      const onderwerp = `Offerte ${offerte.offertenummer ?? offerte.id} — ${offerte.titel}`;
      const begroeting = `Geachte ${offerte.opdrachtgever ? `heer/mevrouw ${offerte.opdrachtgever}` : "heer/mevrouw"},`;
      const samenvatting = `Hierbij ontvangt u onze offerte voor ${offerte.titel}${locatieTekst ? ` voor ${locatieTekst}` : ""}.\n\nHet totaalbedrag bedraagt ${bedragFormatted} incl. btw. De offerte is ${offerte.geldigheidDagen} dagen geldig.`;
      const call_to_action = `Via de bijgevoegde portaallink kunt u de offerte volledig bekijken en digitaal ondertekenen. Heeft u vragen? U kunt deze direct via het portaal stellen.`;
      const afsluiting = `Met vriendelijke groet,\nTeam FPS Brandpreventie`;
      return res.json({ onderwerp, begroeting, samenvatting, call_to_action, afsluiting });
    }

    const offerteMailResultaat = await aiGateway.chat("default", {
      max_tokens: 900,
      messages: [
        {
          role: "system",
          content: `Je schrijft zakelijke e-mails namens FPS Brandpreventie, een specialist in brand- en rookcompartimentering.

Communicatiestijl FPS:
- Direct en zelfverzekerd — wij zijn de vakpartij, geen excuses of onnodige omhaal
- Warm maar zakelijk — persoonlijk aanspreken, niet formeel-stijf ("Geachte heer/mevrouw X,")
- Concreet — noem het gebouw, de werkzaamheden, het bedrag en de geldigheidsdatum
- Geen wollige zinnen, geen clichés zoals "in the picture" of "naar aanleiding van"
- Portaallink wordt uitnodigend gepresenteerd als snelle, digitale manier van ondertekenen
- Altijd afsluiten met: Met vriendelijke groet, Team FPS Brandpreventie
- Schrijf in vloeiend Nederlands, taal B2-niveau, leesbaar voor een niet-technische opdrachtgever
- Houd de tekst beknopt: één alinea introductie, één alinea inhoud/werkzaamheden, één alinea call-to-action`,
        },
        {
          role: "user",
          content: `Schrijf een begeleidende e-mail voor onderstaande offerte. Verwerk zoveel mogelijk context natuurlijk in de tekst.

Offertenummer: ${offerte.offertenummer ?? "—"}
Titel: ${offerte.titel}
Opdrachtgever: ${offerte.opdrachtgever ?? "—"}
${locatieTekst ? `Locatie/gebouw: ${locatieTekst}` : ""}
Totaalbedrag incl. btw: ${bedragFormatted}
Geldigheid: ${offerte.geldigheidDagen} dagen
${sectietitels.length ? `\nSeccties in offerte: ${sectietitels.join(", ")}` : ""}
${maatregelen.length ? `\nWerkzaamheden/maatregelen:\n${maatregelen.join("\n")}` : ""}

Geef als JSON terug (geen extra tekst):
{
  "onderwerp": "...",
  "begroeting": "...",
  "samenvatting": "...",
  "call_to_action": "...",
  "afsluiting": "Met vriendelijke groet,\\nTeam FPS Brandpreventie"
}`,
        },
      ],
    });

    const rawMail = offerteMailResultaat.ok ? offerteMailResultaat.inhoud : "{}";
    const match = rawMail.match(/\{[\s\S]*\}/);
    let parsed: Record<string, string> = {};
    try { parsed = match ? JSON.parse(match[0]) : {}; } catch { parsed = {}; }

    res.json({
      onderwerp:      parsed.onderwerp      ?? `Offerte ${offerte.offertenummer ?? offerte.id} — ${offerte.titel}`,
      begroeting:     parsed.begroeting     ?? `Geachte ${offerte.opdrachtgever ? `heer/mevrouw ${offerte.opdrachtgever}` : "heer/mevrouw"},`,
      samenvatting:   parsed.samenvatting   ?? `Hierbij ontvangt u onze offerte voor ${offerte.titel}.`,
      call_to_action: parsed.call_to_action ?? `Via de bijgevoegde portaallink kunt u de offerte bekijken en digitaal ondertekenen.`,
      afsluiting:     parsed.afsluiting     ?? `Met vriendelijke groet,\nTeam FPS Brandpreventie`,
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
    const [offerte] = await db
      .select({
        id: offertesTable.id,
        offertenummer: offertesTable.offertenummer,
        titel: offertesTable.titel,
        opdrachtgever: offertesTable.opdrachtgever,
        datum: offertesTable.datum,
        bedragExclBtw: offertesTable.bedragExclBtw,
        bedragInclBtw: offertesTable.bedragInclBtw,
        btwPercentage: offertesTable.btwPercentage,
        portaalStatus: offertesTable.portaalStatus,
        voorwaardenSetId: offertesTable.voorwaardenSetId,
        voorwaarden: offertesTable.voorwaarden,
      })
      .from(offertesTable)
      .where(eq(offertesTable.id, offerteId));
    if (!offerte) return res.status(404).json({ error: "Offerte niet gevonden" });
    if (offerte.portaalStatus === "ondertekend" || offerte.portaalStatus === "afgewezen")
      return res.status(409).json({ error: "Een ondertekende of afgewezen offerte kan niet opnieuw worden verzonden." });

    const naarEmail = String(req.body?.naar_email ?? "").trim();
    const naarNaam = String(req.body?.naar_naam ?? "").trim() || null;
    const onderwerp = String(req.body?.onderwerp ?? "").trim() || `Offerte ${offerte.offertenummer ?? offerteId}`;
    const tekst = String(req.body?.tekst ?? "").trim();
    let portaalLink = String(req.body?.portaal_link ?? "").trim();

    if (!naarEmail) return res.status(400).json({ error: "Ontvangersmailadres is verplicht." });

    // Genereer server-side een portaal-token als de aanroeper er geen meestuurt.
    if (!portaalLink) {
      const nieuweToken = randomBytes(32).toString("hex");
      const verlooptOp = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await db.insert(offertePortaalTokensTable).values({ offerteId, token: nieuweToken, verlooptOp });
      const host = (process.env.REPLIT_DOMAINS ?? "").split(",")[0]?.trim() ?? req.get("host") ?? "";
      portaalLink = host ? `https://${host}/portaal/${nieuweToken}` : `/portaal/${nieuweToken}`;
    }

    const portaalToken = portaalLink.split("/portaal/")[1]?.split("?")[0] ?? null;

    // Bijlagen: PDF-samenvatting van de offerte als meegestuurde bijlage.
    const regels = await db
      .select({ maatregel: offerteRegelsTable.maatregel, aantal: offerteRegelsTable.aantal, eenheid: offerteRegelsTable.eenheid, kosten: offerteRegelsTable.kosten })
      .from(offerteRegelsTable)
      .where(eq(offerteRegelsTable.offerteId, offerteId))
      .orderBy(offerteRegelsTable.volgorde);

    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: "A4" });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
      doc.fontSize(18).font("Helvetica-Bold").text("FPS Brandpreventie", { align: "center" });
      doc.moveDown(0.3);
      doc.fontSize(13).font("Helvetica-Bold").text(offerte.titel ?? "Offerte");
      doc.fontSize(10).font("Helvetica")
        .text(`Offertenummer: ${offerte.offertenummer ?? String(offerteId)}`)
        .text(`Datum: ${offerte.datum ? new Date(offerte.datum).toLocaleDateString("nl-NL") : "—"}`)
        .text(`Opdrachtgever: ${offerte.opdrachtgever ?? "—"}`);
      doc.moveDown();
      if (regels.length > 0) {
        doc.font("Helvetica-Bold").fontSize(11).text("Begrotingsregels:");
        doc.moveDown(0.3);
        for (const r of regels) {
          doc.font("Helvetica").fontSize(10).text(
            `\u2022 ${r.maatregel ?? ""} \u2014 ${r.aantal ?? ""} ${r.eenheid ?? ""} \u2014 \u20AC${Number(r.kosten ?? 0).toFixed(2)}`,
            { indent: 10 },
          );
        }
        doc.moveDown();
      }
      doc.font("Helvetica-Bold").fontSize(11)
        .text(`Totaal excl. BTW: \u20AC${Number(offerte.bedragExclBtw ?? 0).toFixed(2)}`)
        .text(`Totaal incl. BTW (${offerte.btwPercentage ?? 21}%): \u20AC${Number(offerte.bedragInclBtw ?? 0).toFixed(2)}`);
      doc.moveDown(2);
      doc.fontSize(9).font("Helvetica").fillColor("#6b7280").text("FPS Brandpreventie \u2014 Uw partner in brandveiligheid", { align: "center" });
      doc.end();
    });

    const host = portaalLink.startsWith("https://") ? portaalLink.split("/portaal/")[0] : "";
    const pixelUrl = host && portaalToken ? `${host}/portaal/${portaalToken}/pixel` : "";

    const html = `<!DOCTYPE html>
<html lang="nl">
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;color:#212631;max-width:600px;margin:0 auto;padding:20px">
  <div style="text-align:center;margin-bottom:24px">
    <div style="background:#F23B0D;color:#fff;font-size:22px;font-weight:bold;padding:16px 24px;border-radius:8px">FPS Brandpreventie</div>
  </div>
  <p>${escapeHtml(tekst).replace(/\n/g, "<br>")}</p>
  <div style="text-align:center;margin:32px 0">
    <a href="${portaalLink.startsWith("https://") ? portaalLink.replace(/"/g, "%22") : `#`}" style="background:#F23B0D;color:#fff;padding:14px 28px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block">
      Offerte bekijken en ondertekenen
    </a>
  </div>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0">
  <p style="font-size:12px;color:#6b7280">FPS Brandpreventie — Uw partner in brandveiligheid</p>
  ${pixelUrl ? `<img src="${pixelUrl}" width="1" height="1" style="display:none;border:0" alt="">` : ""}
</body>
</html>`;

    await verstuurMail({
      naarEmail,
      naarNaam,
      onderwerp,
      html,
      soort: "offerte",
      verstuurdDoorId: req.session.userId ?? null,
      bijlagen: [
        {
          naam: `offerte-${offerte.offertenummer ?? offerteId}.pdf`,
          contentType: "application/pdf",
          inhoud: pdfBuffer,
        },
      ],
    });

    await db.insert(offerteEmailLogTable).values({
      offerteId,
      ontvanger: naarEmail,
      onderwerp,
      status: "verzonden",
      portaalToken,
    });

    // Bevries voorwaarden-snapshot bij verzenden
    let voorwaardenSnapshot: string | undefined;
    if (offerte.voorwaardenSetId) {
      const [set] = await db
        .select({ tekst: offerteVoorwaardenSetsTable.tekst })
        .from(offerteVoorwaardenSetsTable)
        .where(eq(offerteVoorwaardenSetsTable.id, offerte.voorwaardenSetId));
      voorwaardenSnapshot = set?.tekst;
    } else if (offerte.voorwaarden) {
      voorwaardenSnapshot = offerte.voorwaarden;
    }

    await db
      .update(offertesTable)
      .set({
        portaalStatus: "verzonden",
        bijgewerktOp: new Date(),
        ...(voorwaardenSnapshot !== undefined && { voorwaardenSnapshot }),
      })
      .where(
        and(
          eq(offertesTable.id, offerteId),
          not(inArray(offertesTable.portaalStatus, ["ondertekend", "afgewezen", "vervallen"])),
        ),
      );

    await db.insert(offerteTrackingTable).values({
      offerteId,
      event: "bezorgd",
      portaalToken: portaalToken ?? null,
      ip: null,
    });

    res.json({ ok: true, portaal_link: portaalLink });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Klantcontracten (Contract-van-klant verzendmodus) ────────────────────────

function contractNaarJson(c: typeof offerteKlantContractenTable.$inferSelect, heeftAdvies = false) {
  return {
    id: c.id,
    offerte_id: c.offerteId,
    bestandsnaam: c.bestandsnaam,
    bestand_pad: c.bestandPad,
    mime_type: c.mimeType,
    geupload_door_id: c.geuploadDoorId ?? null,
    geupload_op: iso(c.geuploadOp),
    heeft_advies: heeftAdvies,
  };
}

function adviesNaarJson(a: typeof offerteContractAdviezenTable.$inferSelect) {
  return {
    id: a.id,
    contract_id: a.contractId,
    risico_niveau: a.risicoNiveau,
    aandachtspunten: Array.isArray(a.aandachtspunten) ? a.aandachtspunten : [],
    advies_samenvatting: a.adviesSamenvatting ?? null,
    volledig_advies: a.volledigAdvies ?? null,
    aangemaakt_op: iso(a.aangemaaktOp),
    bevestigd_door_id: a.bevestigdDoorId ?? null,
    bevestigd_op: a.bevestigdOp ? iso(a.bevestigdOp) : null,
  };
}

// Presigned upload-URL voor klantcontract-PDF
router.post("/offertes/:id/klant-contracten/upload-url", schrijven, async (req, res) => {
  try {
    const offerteId = parseId(req.params.id);
    const [o] = await db.select({ id: offertesTable.id }).from(offertesTable).where(eq(offertesTable.id, offerteId));
    if (!o) return res.status(404).json({ error: "Offerte niet gevonden" });
    const storage = new ObjectStorageService();
    const { uploadURL, objectPath } = await storage.getObjectEntityUploadURL(null, null);
    res.json({ upload_url: uploadURL, object_path: objectPath });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// Klantcontracten ophalen
router.get("/offertes/:id/klant-contracten", lezen, async (req, res) => {
  try {
    const offerteId = parseId(req.params.id);
    const contracten = await db
      .select()
      .from(offerteKlantContractenTable)
      .where(eq(offerteKlantContractenTable.offerteId, offerteId))
      .orderBy(desc(offerteKlantContractenTable.geuploadOp));
    if (contracten.length === 0) return res.json([]);
    const adviezen = await db
      .select({ contractId: offerteContractAdviezenTable.contractId })
      .from(offerteContractAdviezenTable)
      .where(inArray(offerteContractAdviezenTable.contractId, contracten.map((c) => c.id)));
    const metAdvies = new Set(adviezen.map((a) => a.contractId));
    res.json(contracten.map((c) => contractNaarJson(c, metAdvies.has(c.id))));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// Klantcontract registreren (na upload naar storage)
router.post("/offertes/:id/klant-contracten", schrijven, async (req, res) => {
  try {
    const offerteId = parseId(req.params.id);
    const [o] = await db.select({ id: offertesTable.id }).from(offertesTable).where(eq(offertesTable.id, offerteId));
    if (!o) return res.status(404).json({ error: "Offerte niet gevonden" });
    const { bestandsnaam, bestand_pad, mime_type, extracted_text } = req.body;
    if (!bestandsnaam || !bestand_pad) return res.status(400).json({ error: "bestandsnaam en bestand_pad zijn verplicht" });
    const [c] = await db
      .insert(offerteKlantContractenTable)
      .values({
        offerteId,
        bestandsnaam,
        bestandPad: bestand_pad,
        mimeType: mime_type ?? "application/pdf",
        extractedText: extracted_text ?? null,
        geuploadDoorId: req.session.userId ?? null,
      })
      .returning();
    res.status(201).json(contractNaarJson(c, false));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// Klantcontract verwijderen
router.delete("/offertes/:id/klant-contracten/:contractId", schrijven, async (req, res) => {
  try {
    const offerteId = parseId(req.params.id);
    const contractId = parseId(req.params.contractId);
    const [c] = await db
      .select()
      .from(offerteKlantContractenTable)
      .where(and(eq(offerteKlantContractenTable.id, contractId), eq(offerteKlantContractenTable.offerteId, offerteId)));
    if (!c) return res.status(404).json({ error: "Contract niet gevonden" });
    await db.delete(offerteKlantContractenTable).where(eq(offerteKlantContractenTable.id, contractId));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// AI-contractadvies genereren voor directie
router.post("/offertes/:id/klant-contracten/:contractId/ai-advies", schrijven, async (req, res) => {
  try {
    const offerteId = parseId(req.params.id);
    const contractId = parseId(req.params.contractId);
    const [c] = await db
      .select()
      .from(offerteKlantContractenTable)
      .where(and(eq(offerteKlantContractenTable.id, contractId), eq(offerteKlantContractenTable.offerteId, offerteId)));
    if (!c) return res.status(404).json({ error: "Contract niet gevonden" });
    if (!c.extractedText?.trim()) return res.status(422).json({ error: "Contracttekst ontbreekt — geen AI-analyse mogelijk. Zorg dat de PDF volledig geupload is met tekst." });
    if (!heeftGateway()) return res.status(503).json({ error: "AI niet beschikbaar" });

    const systeemprompt = `Je bent een commercieel-juridisch adviseur bij FPS Brandpreventie.
Analyseer het onderstaande klantcontract en stel een intern adviesrapport op voor de directie.

Geef je analyse uitsluitend als geldig JSON-object met deze exacte structuur:
{
  "risico_niveau": "laag" of "middel" of "hoog",
  "aandachtspunten": [
    {
      "titel": "korte titel",
      "beschrijving": "uitleg wat het betekent voor FPS",
      "prioriteit": "laag" of "middel" of "hoog",
      "clausule": "artikel- of clausulereferentie uit het contract (optioneel)"
    }
  ],
  "advies_samenvatting": "2-3 zinnen samenvatting voor de directie",
  "volledig_advies": "volledig intern adviesrapport — formeel memo aan de FPS-directie"
}

Aandachtspunten om op te letten:
- Afwijkende betalingsvoorwaarden (onze standaard: 30 dagen netto)
- Garantieverplichtingen, onderhoudsvereisten en servicelevels
- Aansprakelijkheidsbepalingen, boeteclausules en vrijwaringen
- Eigendomsvoorbehoud en intellectuele eigendomsrechten
- Geschillenbeslechting, forumkeuze en toepasselijk recht
- Opzeg- en ontbindingsgronden
- Prijsindexering en kostenstijgingclausules
Geef per aandachtspunt aan of het voor FPS gunstig, neutraal of ongunstig is.`;

    const contractAdviesResultaat = await aiGateway.chat("default", {
      max_completion_tokens: 4000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systeemprompt },
        { role: "user", content: `Contracttekst:\n\n${c.extractedText.slice(0, 50000)}` },
      ],
    });

    const raw = contractAdviesResultaat.ok ? contractAdviesResultaat.inhoud : "{}";
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(raw); } catch { parsed = {}; }

    const risicoNiveau = ["laag", "middel", "hoog"].includes(String(parsed.risico_niveau))
      ? String(parsed.risico_niveau)
      : "middel";
    const aandachtspunten = Array.isArray(parsed.aandachtspunten) ? parsed.aandachtspunten : [];
    const adviesSamenvatting = typeof parsed.advies_samenvatting === "string" ? parsed.advies_samenvatting : null;
    const volledigAdvies = typeof parsed.volledig_advies === "string" ? parsed.volledig_advies : null;

    const [advies] = await db
      .insert(offerteContractAdviezenTable)
      .values({ contractId, risicoNiveau, aandachtspunten, adviesSamenvatting, volledigAdvies })
      .onConflictDoUpdate({
        target: offerteContractAdviezenTable.contractId,
        set: { risicoNiveau, aandachtspunten, adviesSamenvatting, volledigAdvies, aangemaaktOp: new Date() },
      })
      .returning();

    res.json(adviesNaarJson(advies));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// Bestaand AI-contractadvies ophalen
router.get("/offertes/:id/klant-contracten/:contractId/advies", lezen, async (req, res) => {
  try {
    const offerteId = parseId(req.params.id);
    const contractId = parseId(req.params.contractId);
    const [c] = await db
      .select({ id: offerteKlantContractenTable.id })
      .from(offerteKlantContractenTable)
      .where(and(eq(offerteKlantContractenTable.id, contractId), eq(offerteKlantContractenTable.offerteId, offerteId)));
    if (!c) return res.status(404).json({ error: "Contract niet gevonden" });
    const [advies] = await db
      .select()
      .from(offerteContractAdviezenTable)
      .where(eq(offerteContractAdviezenTable.contractId, contractId));
    if (!advies) return res.status(404).json({ error: "Nog geen advies gegenereerd" });
    res.json(adviesNaarJson(advies));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
