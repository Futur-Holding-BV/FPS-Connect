// Opdrachten & Werkbegrotingen — /api/offertes/:id/maak-opdracht, /api/opdrachten/*
// Brug tussen geaccepteerde offerte → werkbegroting → planning → uurstaten → nacalculatie
import { Router } from "express";
import { workflowService, maakTransitieContext } from "../services/workflow-engine";
import {
  db,
  opdrachtenTable,
  projectBegrotingenTable,
  werkbegrotingRegelsTable,
  modCalcHeadersTable,
  modCalcRegelsTable,
  offertesTable,
  planningItemsTable,
  urenRegistratiesTable,
  medewerkersTable,
  gebruikersTable,
  gebouwenTable,
  reserveringenTable,
  voorraadMutatiesTable,
  artikelenTable,
  werkbegrotingAdviezenTable,
} from "@workspace/db";
import { eq, and, sql, sum, asc, isNull, desc, or } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { aiGateway, heeftGateway } from "../lib/aiGateway";
import { BEGROTING_ANALYSE_PROMPT, WERKVOORBEREIDING_ADVIES_PROMPT, WERKBEGROTING_CHAT_BASE_PROMPT } from "../lib/aiPrompts";
import { logger } from "../lib/logger";

const router = Router();
const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;

const lezen    = requireBevoegdheid("offertes", 1);
const schrijven = requireBevoegdheid("offertes", 2);

function mapOpdracht(
  o: typeof opdrachtenTable.$inferSelect,
  begrotingId: number | null,
  begrotingStatus: string | null,
  begrotingUren: number | null,
  g?: { naam: string | null; adres: string | null; postcode: string | null; stad: string | null } | null,
) {
  return {
    id: o.id,
    offerte_id: o.offerteId ?? null,
    calculatie_id: o.calculatieId ?? null,
    gebouw_id: o.gebouwId ?? null,
    project_id: o.projectId ?? null,
    titel: o.titel,
    werknummer: o.werknummer ?? null,
    opdrachtgever: o.opdrachtgever ?? null,
    omschrijving: o.omschrijving ?? null,
    type: o.type ?? null,
    status: o.status,
    gebouw_naam: g?.naam ?? null,
    gebouw_adres: g?.adres ?? null,
    gebouw_postcode: g?.postcode ?? null,
    gebouw_stad: g?.stad ?? null,
    aangemaakt_op: iso(o.aangemaaktOp)!,
    bijgewerkt_op: iso(o.bijgewerktOp)!,
    begroting_id: begrotingId,
    begroting_status: begrotingStatus,
    begroting_totaal_arbeid_uren: begrotingUren,
  };
}

function mapRegel(r: typeof werkbegrotingRegelsTable.$inferSelect) {
  return {
    id: r.id,
    begroting_id: r.begrotingId,
    calc_regel_id: r.calcRegelId ?? null,
    categorie: r.categorie,
    omschrijving: r.omschrijving,
    eenheid: r.eenheid,
    hoeveelheid: r.hoeveelheid,
    tarief: r.tarief,
    totaal: r.totaal,
    hoofdstuk: r.hoofdstuk,
    ai_inkoop_voorstel: r.aiInkoopVoorstel ?? null,
    ai_arbeid_voorstel: r.aiArbeidVoorstel ?? null,
  };
}

function mapBegroting(
  b: typeof projectBegrotingenTable.$inferSelect,
  regels: typeof werkbegrotingRegelsTable.$inferSelect[],
) {
  return {
    id: b.id,
    opdracht_id: b.opdrachtId ?? null,
    calculatie_id: b.calculatieId ?? null,
    gebouw_id: b.gebouwId ?? null,
    werknummer: b.werknummer ?? null,
    hoofd_uren_begroot: b.hoofdUrenBegroot,
    totaal_arbeid_uren: b.totaalArbeidUren,
    totaal_materiaal_bedrag: b.totaalMateriaalBedrag,
    omschrijving: b.omschrijving ?? null,
    status: b.status,
    vastgesteld_op: iso(b.vastgesteldOp),
    ai_analyse: (b.aiAnalyse as Record<string, unknown>) ?? null,
    ai_analyse_op: iso(b.aiAnalyseOp),
    aangemaakt_op: iso(b.aangemaaktOp)!,
    bijgewerkt_op: iso(b.bijgewerktOp)!,
    regels: regels.map(mapRegel),
  };
}

// ── POST /offertes/:id/maak-opdracht ──────────────────────────────────────

router.post("/offertes/:id/maak-opdracht", schrijven, async (req, res): Promise<void> => {
  const offerteId = parseInt(String(req.params.id), 10);
  if (isNaN(offerteId)) { res.status(400).json({ error: "Ongeldig offerte-id" }); return; }

  try {
    const [offerte] = await db.select().from(offertesTable).where(eq(offertesTable.id, offerteId));
    if (!offerte) { res.status(404).json({ error: "Offerte niet gevonden" }); return; }

    const { calculatie_id, titel, werknummer, omschrijving } = req.body as {
      calculatie_id?: number;
      titel?: string;
      werknummer?: string;
      omschrijving?: string;
    };

    const calcId = calculatie_id ?? null;
    const opdrachtTitel = titel ?? offerte.titel ?? `Opdracht ${offerteId}`;

    // Bestaande opdracht voor deze offerte ophalen
    const [bestaande] = await db.select().from(opdrachtenTable)
      .where(eq(opdrachtenTable.offerteId, offerteId));
    if (bestaande) {
      res.status(409).json({ error: "Er bestaat al een opdracht voor deze offerte", opdracht_id: bestaande.id });
      return;
    }

    // Opdracht aanmaken
    const [opdracht] = await db.insert(opdrachtenTable).values({
      offerteId,
      calculatieId: calcId,
      gebouwId: offerte.gebouwId ?? null,
      projectId: offerte.autoProjectId ?? null,
      titel: opdrachtTitel,
      werknummer: werknummer ?? offerte.onsKenmerk ?? null,
      opdrachtgever: offerte.opdrachtgever ?? null,
      omschrijving: omschrijving ?? null,
      status: "actief",
      aangemaaktDoorId: req.session.userId!,
      bijgewerktOp: new Date(),
    }).returning();

    // Werkbegroting aanmaken (project_begrotingen)
    const begrotingValues: {
      opdrachtId: number;
      calculatieId: number | null;
      gebouwId: number | null;
      projectId: number | null;
      werknummer: string | null;
      hoofdUrenBegroot: number;
      totaalArbeidUren: number;
      totaalMateriaalBedrag: number;
      status: string;
      aangemaaktDoorId: number | null;
      bijgewerktOp: Date;
    } = {
      opdrachtId: opdracht.id,
      calculatieId: calcId,
      gebouwId: offerte.gebouwId ?? null,
      projectId: offerte.autoProjectId ?? null,
      werknummer: werknummer ?? offerte.onsKenmerk ?? null,
      hoofdUrenBegroot: 0,
      totaalArbeidUren: 0,
      totaalMateriaalBedrag: 0,
      status: "concept",
      aangemaaktDoorId: req.session.userId!,
      bijgewerktOp: new Date(),
    };

    const [begroting] = await db.insert(projectBegrotingenTable).values(begrotingValues).returning();

    // Calculatieregels overzetten naar werkbegroting (zonder opslagen/winst)
    let totaalArbeidUren = 0;
    let totaalMateriaalBedrag = 0;

    if (calcId) {
      const calcRegels = await db.select().from(modCalcRegelsTable)
        .where(eq(modCalcRegelsTable.calculatieId, calcId))
        .orderBy(asc(modCalcRegelsTable.volgorde));

      const regelValues = calcRegels
        .filter(r => !r.isStaartkosten && !r.isBouwplaatskosten)
        .map(r => {
          const hoeveelheid = r.hoeveelheid ?? 0;
          const tarief = r.tarief ?? 0;
          const totaal = r.totaal ?? hoeveelheid * tarief;

          if (r.categorie === "arbeid") {
            const uren = r.muPerEenheid > 0 ? hoeveelheid * r.muPerEenheid : hoeveelheid;
            totaalArbeidUren += uren;
          } else if (r.categorie === "materiaal") {
            totaalMateriaalBedrag += totaal;
          }

          return {
            begrotingId: begroting.id,
            calcRegelId: r.id,
            categorie: r.categorie,
            omschrijving: r.omschrijving,
            eenheid: r.eenheid,
            hoeveelheid,
            tarief,
            totaal,
            hoofdstuk: r.hoofdstuk ?? "Overige werkzaamheden",
            bijgewerktOp: new Date(),
          };
        });

      if (regelValues.length > 0) {
        await db.insert(werkbegrotingRegelsTable).values(regelValues);
      }

      // Totalen terugschrijven
      await db.update(projectBegrotingenTable)
        .set({
          hoofdUrenBegroot: totaalArbeidUren,
          totaalArbeidUren,
          totaalMateriaalBedrag,
          bijgewerktOp: new Date(),
        })
        .where(eq(projectBegrotingenTable.id, begroting.id));
    }

    res.status(201).json(mapOpdracht(opdracht, begroting.id, begroting.status, totaalArbeidUren));
  } catch (err) {
    logger.error({ err }, "maak-opdracht fout");
    res.status(500).json({ error: "Serverfout bij aanmaken opdracht" });
  }
});

// ── GET /opdrachten ───────────────────────────────────────────────────────

router.get("/opdrachten", lezen, async (req, res): Promise<void> => {
  try {
    const gebouwFilter = req.query.gebouw_id ? parseInt(String(req.query.gebouw_id), 10) : null;
    const offerteFilter = req.query.offerte_id ? parseInt(String(req.query.offerte_id), 10) : null;
    const statusFilter = typeof req.query.status === "string" ? req.query.status : null;

    const rows = await db.select({
      o: opdrachtenTable,
      b: {
        id: projectBegrotingenTable.id,
        status: projectBegrotingenTable.status,
        totaalArbeidUren: projectBegrotingenTable.totaalArbeidUren,
      },
      g: {
        naam: gebouwenTable.naam,
        adres: gebouwenTable.adres,
        postcode: gebouwenTable.postcode,
        stad: gebouwenTable.stad,
      },
    })
      .from(opdrachtenTable)
      .leftJoin(projectBegrotingenTable, eq(projectBegrotingenTable.opdrachtId, opdrachtenTable.id))
      .leftJoin(gebouwenTable, eq(gebouwenTable.id, opdrachtenTable.gebouwId))
      .where(
        and(
          gebouwFilter ? eq(opdrachtenTable.gebouwId, gebouwFilter) : undefined,
          offerteFilter ? eq(opdrachtenTable.offerteId, offerteFilter) : undefined,
          statusFilter ? eq(opdrachtenTable.status, statusFilter) : undefined,
        )
      )
      .orderBy(asc(opdrachtenTable.aangemaaktOp));

    res.json(rows.map(r => mapOpdracht(r.o, r.b?.id ?? null, r.b?.status ?? null, r.b?.totaalArbeidUren ?? null, r.g)));
  } catch (err) {
    logger.error({ err }, "listOpdrachten fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── GET /opdrachten/:id ───────────────────────────────────────────────────

router.get("/opdrachten/:id", lezen, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  try {
    const [row] = await db.select({
      o: opdrachtenTable,
      b: {
        id: projectBegrotingenTable.id,
        status: projectBegrotingenTable.status,
        totaalArbeidUren: projectBegrotingenTable.totaalArbeidUren,
      },
      g: {
        naam: gebouwenTable.naam,
        adres: gebouwenTable.adres,
        postcode: gebouwenTable.postcode,
        stad: gebouwenTable.stad,
      },
    })
      .from(opdrachtenTable)
      .leftJoin(projectBegrotingenTable, eq(projectBegrotingenTable.opdrachtId, opdrachtenTable.id))
      .leftJoin(gebouwenTable, eq(gebouwenTable.id, opdrachtenTable.gebouwId))
      .where(eq(opdrachtenTable.id, id));

    if (!row) { res.status(404).json({ error: "Opdracht niet gevonden" }); return; }
    res.json(mapOpdracht(row.o, row.b?.id ?? null, row.b?.status ?? null, row.b?.totaalArbeidUren ?? null, row.g));
  } catch (err) {
    logger.error({ err }, "getOpdracht fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── PATCH /opdrachten/:id ─────────────────────────────────────────────────

router.patch("/opdrachten/:id", schrijven, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  try {
    const { status, omschrijving, werknummer } = req.body as Record<string, string | undefined>;

    // Status via de WorkflowEngine
    if (status !== undefined) {
      const ctx = await maakTransitieContext(req, db);
      const result = await workflowService.transiteer("opdracht", id, status, ctx);
      if (!result.ok) { res.status(result.error!.httpStatus).json({ error: result.error!.bericht }); return; }
    }

    // Overige veldwijzigingen
    const update: Partial<typeof opdrachtenTable.$inferInsert> = { bijgewerktOp: new Date() };
    if (omschrijving !== undefined) update.omschrijving = omschrijving;
    if (werknummer !== undefined) update.werknummer = werknummer;

    const [updated] = await db.update(opdrachtenTable).set(update).where(eq(opdrachtenTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Opdracht niet gevonden" }); return; }

    const [begroting] = await db.select({
      id: projectBegrotingenTable.id,
      status: projectBegrotingenTable.status,
      totaalArbeidUren: projectBegrotingenTable.totaalArbeidUren,
    }).from(projectBegrotingenTable).where(eq(projectBegrotingenTable.opdrachtId, id));

    const [gebouw] = updated.gebouwId
      ? await db.select({ naam: gebouwenTable.naam, adres: gebouwenTable.adres, postcode: gebouwenTable.postcode, stad: gebouwenTable.stad })
          .from(gebouwenTable).where(eq(gebouwenTable.id, updated.gebouwId))
      : [null];

    res.json(mapOpdracht(updated, begroting?.id ?? null, begroting?.status ?? null, begroting?.totaalArbeidUren ?? null, gebouw ?? null));
  } catch (err) {
    logger.error({ err }, "updateOpdracht fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── GET /opdrachten/:id/werkbegroting ─────────────────────────────────────

router.get("/opdrachten/:id/werkbegroting", lezen, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  try {
    const [begroting] = await db.select().from(projectBegrotingenTable)
      .where(eq(projectBegrotingenTable.opdrachtId, id));
    if (!begroting) { res.status(404).json({ error: "Werkbegroting niet gevonden" }); return; }

    const regels = await db.select().from(werkbegrotingRegelsTable)
      .where(eq(werkbegrotingRegelsTable.begrotingId, begroting.id))
      .orderBy(asc(werkbegrotingRegelsTable.id));

    res.json(mapBegroting(begroting, regels));
  } catch (err) {
    logger.error({ err }, "getWerkbegroting fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── POST /opdrachten/:id/werkbegroting/vaststellen ────────────────────────

router.post("/opdrachten/:id/werkbegroting/vaststellen", schrijven, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  try {
    const [begroting] = await db.select().from(projectBegrotingenTable)
      .where(eq(projectBegrotingenTable.opdrachtId, id));
    if (!begroting) { res.status(404).json({ error: "Werkbegroting niet gevonden" }); return; }
    if (begroting.status === "vastgesteld") {
      res.status(409).json({ error: "Werkbegroting is al vastgesteld" }); return;
    }

    const [updated] = await db.update(projectBegrotingenTable)
      .set({
        status: "vastgesteld",
        vastgesteldDoorId: req.session.userId!,
        vastgesteldOp: new Date(),
        bijgewerktOp: new Date(),
      })
      .where(eq(projectBegrotingenTable.id, begroting.id))
      .returning();

    const regels = await db.select().from(werkbegrotingRegelsTable)
      .where(eq(werkbegrotingRegelsTable.begrotingId, begroting.id))
      .orderBy(asc(werkbegrotingRegelsTable.id));

    res.json(mapBegroting(updated, regels));
  } catch (err) {
    logger.error({ err }, "vaststellenWerkbegroting fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── POST /opdrachten/:id/werkbegroting/ai-analyse ─────────────────────────

router.post("/opdrachten/:id/werkbegroting/ai-analyse", schrijven, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  try {
    const [begroting] = await db.select().from(projectBegrotingenTable)
      .where(eq(projectBegrotingenTable.opdrachtId, id));
    if (!begroting) { res.status(404).json({ error: "Werkbegroting niet gevonden" }); return; }

    const regels = await db.select().from(werkbegrotingRegelsTable)
      .where(eq(werkbegrotingRegelsTable.begrotingId, begroting.id))
      .orderBy(asc(werkbegrotingRegelsTable.id));

    const arbeidRegels = regels.filter(r => r.categorie === "arbeid");
    const materiaalRegels = regels.filter(r => r.categorie === "materiaal");

    let analyse: Record<string, unknown> = { handmatig: true, gegenereerd_op: new Date().toISOString() };

    if (heeftGateway()) {
      const prompt = `Je bent een kritische werkvoorbereider in de brandpreventiesector. Analyseer de onderstaande werkbegroting en geef concrete voorstellen om winst te maximaliseren via inkoop en arbeid.

ARBEID (${arbeidRegels.length} regels):
${arbeidRegels.map(r => `- ${r.omschrijving}: ${r.hoeveelheid} ${r.eenheid} @ €${r.tarief}/uur = €${r.totaal}`).join('\n')}

MATERIAAL (${materiaalRegels.length} regels):
${materiaalRegels.map(r => `- ${r.omschrijving}: ${r.hoeveelheid} ${r.eenheid} @ €${r.tarief} = €${r.totaal}`).join('\n')}

Totaal arbeid: ${begroting.totaalArbeidUren} uur
Totaal materiaal: €${begroting.totaalMateriaalBedrag}

Geef je analyse als JSON met deze structuur:
{
  "samenvatting": "kort overzicht",
  "inkoop_voorstellen": [{"post": "naam", "huidig": 0, "voorstel": "tekst", "besparing": 0}],
  "arbeid_voorstellen": [{"post": "naam", "huidig_uur": 0, "voorstel": "tekst", "besparing_uur": 0}],
  "totaal_besparing_indicatie": 0,
  "risicos": ["risico 1"]
}`;

      const begrotingAnalyseResultaat = await aiGateway.chat("default", {
        response_format: { type: "json_object" },
        max_tokens: 1500,
        messages: [
          { role: "system", content: BEGROTING_ANALYSE_PROMPT.tekst },
          { role: "user", content: prompt },
        ],
      });

      if (begrotingAnalyseResultaat.ok) {
        try {
          analyse = JSON.parse(begrotingAnalyseResultaat.inhoud) as Record<string, unknown>;
          analyse.gegenereerd_op = new Date().toISOString();
        } catch {
          logger.warn("AI analyse JSON parsen mislukt — fallback zonder AI");
        }
      } else {
        logger.warn({ fout: begrotingAnalyseResultaat.fout }, "AI analyse mislukt — fallback zonder AI");
      }
    }

    const [updated] = await db.update(projectBegrotingenTable)
      .set({ aiAnalyse: analyse, aiAnalyseOp: new Date(), bijgewerktOp: new Date() })
      .where(eq(projectBegrotingenTable.id, begroting.id))
      .returning();

    res.json(mapBegroting(updated, regels));
  } catch (err) {
    logger.error({ err }, "aiAnalyseWerkbegroting fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── GET /opdrachten/:id/nacalculatie ─────────────────────────────────────

router.get("/opdrachten/:id/nacalculatie", lezen, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  try {
    const [opdracht] = await db.select().from(opdrachtenTable).where(eq(opdrachtenTable.id, id));
    if (!opdracht) { res.status(404).json({ error: "Opdracht niet gevonden" }); return; }

    const [begroting] = await db.select().from(projectBegrotingenTable)
      .where(eq(projectBegrotingenTable.opdrachtId, id));

    const regels = begroting
      ? await db.select().from(werkbegrotingRegelsTable)
          .where(eq(werkbegrotingRegelsTable.begrotingId, begroting.id))
      : [];

    // Calculatie arbeid uren
    let calcArbeidUren = 0;
    if (opdracht.calculatieId) {
      const calcRegels = await db.select().from(modCalcRegelsTable)
        .where(and(
          eq(modCalcRegelsTable.calculatieId, opdracht.calculatieId),
          eq(modCalcRegelsTable.categorie, "arbeid"),
        ));
      calcArbeidUren = calcRegels.reduce((acc, r) => {
        return acc + (r.muPerEenheid > 0 ? r.hoeveelheid * r.muPerEenheid : r.hoeveelheid);
      }, 0);
    }

    // Geplande uren uit planning_items
    const planningItems = await db.select({ uren: planningItemsTable.uren })
      .from(planningItemsTable)
      .where(eq(planningItemsTable.opdrachtId, id));
    const planningUren = planningItems.reduce((acc, p) => acc + p.uren, 0);

    // Verbruikte uren uit uren_registraties
    const urenRegels = await db.select({ nettoUren: urenRegistratiesTable.nettoUren })
      .from(urenRegistratiesTable)
      .where(eq(urenRegistratiesTable.opdrachtId, id));
    const verbruikteUren = urenRegels.reduce((acc, u) => acc + u.nettoUren, 0);

    const begrotingUren = begroting?.totaalArbeidUren ?? 0;

    // Per-categorie regels
    const categorieRegels = regels.reduce<Record<string, { begroting_uren: number; totaal: number }>>((acc, r) => {
      if (!acc[r.categorie]) acc[r.categorie] = { begroting_uren: 0, totaal: 0 };
      acc[r.categorie].begroting_uren += r.categorie === "arbeid" ? r.hoeveelheid : 0;
      acc[r.categorie].totaal += r.totaal;
      return acc;
    }, {});

    const nacalculatieRegels = Object.entries(categorieRegels).map(([categorie, data]) => ({
      categorie,
      omschrijving: categorie,
      calculatie_uren: categorie === "arbeid" ? calcArbeidUren : 0,
      begroting_uren: data.begroting_uren,
      verbruikte_uren: categorie === "arbeid" ? verbruikteUren : 0,
      verschil_begroting_vs_verbruikt: data.begroting_uren - (categorie === "arbeid" ? verbruikteUren : 0),
    }));

    res.json({
      opdracht_id: id,
      calculatie_arbeid_uren: calcArbeidUren,
      begroting_arbeid_uren: begrotingUren,
      planning_uren: planningUren,
      verbruikte_uren: verbruikteUren,
      verschil: begrotingUren - verbruikteUren,
      regels: nacalculatieRegels,
    });
  } catch (err) {
    logger.error({ err }, "getNacalculatie fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── GET /opdrachten/:id/planning-uren ─────────────────────────────────────

router.get("/opdrachten/:id/planning-uren", lezen, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  try {
    const items = await db.select({
      planning_item_id: planningItemsTable.id,
      medewerker_id: medewerkersTable.id,
      medewerker_naam: medewerkersTable.naam,
      datum: planningItemsTable.datumStart,
      uren: planningItemsTable.uren,
      status: planningItemsTable.status,
    })
      .from(planningItemsTable)
      .leftJoin(medewerkersTable, eq(planningItemsTable.medewerkerId, medewerkersTable.id))
      .where(eq(planningItemsTable.opdrachtId, id))
      .orderBy(asc(planningItemsTable.datumStart));

    res.json(items.map(i => ({
      planning_item_id: i.planning_item_id,
      medewerker_id: i.medewerker_id ?? null,
      medewerker_naam: i.medewerker_naam ?? "Onbekend",
      datum: i.datum,
      uren: i.uren,
      status: i.status,
    })));
  } catch (err) {
    logger.error({ err }, "listOpdrachtPlanningUren fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── Materiaallijst per opdracht ─────────────────────────────────────────────
router.get("/opdrachten/:id/materiaal", lezen, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  try {
    const [opdracht] = await db.select({ id: opdrachtenTable.id })
      .from(opdrachtenTable).where(eq(opdrachtenTable.id, id)).limit(1);
    if (!opdracht) { res.status(404).json({ error: "Opdracht niet gevonden" }); return; }

    const iso = (d: Date | null | undefined) => d?.toISOString() ?? new Date().toISOString();

    // Reserveringen gekoppeld aan deze opdracht (alleen open/gedeeltelijk)
    const reserveringRijen = await db.select({
      reservering: reserveringenTable,
      artikel_naam: artikelenTable.naam,
      artikel_code: artikelenTable.code,
      eenheid: artikelenTable.eenheid,
      inkoopprijs: artikelenTable.inkoopprijs,
    })
      .from(reserveringenTable)
      .leftJoin(artikelenTable, eq(reserveringenTable.artikelId, artikelenTable.id))
      .where(eq(reserveringenTable.opdrachtId, id))
      .orderBy(desc(reserveringenTable.gereserveerdOp));

    // Uitgiftes-mutaties voor deze opdracht (referentieType = "opdracht")
    const uitgifte_mutaties = await db.select({
      mutatie: voorraadMutatiesTable,
      artikel_naam: artikelenTable.naam,
      artikel_code: artikelenTable.code,
      eenheid: artikelenTable.eenheid,
      inkoopprijs: artikelenTable.inkoopprijs,
    })
      .from(voorraadMutatiesTable)
      .leftJoin(artikelenTable, eq(voorraadMutatiesTable.artikelId, artikelenTable.id))
      .where(
        and(
          eq(voorraadMutatiesTable.referentieType, "opdracht"),
          eq(voorraadMutatiesTable.referentieId, id),
          or(
            eq(voorraadMutatiesTable.type, "uitgifte"),
            eq(voorraadMutatiesTable.type, "retour"),
          ),
        ),
      )
      .orderBy(desc(voorraadMutatiesTable.aangemaaktOp));

    const reserveringen = reserveringRijen.map(r => {
      const prijs = r.inkoopprijs ?? null;
      const totaal = prijs != null ? Math.round(prijs * r.reservering.hoeveelheid * 100) / 100 : null;
      return {
        id: r.reservering.id,
        artikel_id: r.reservering.artikelId,
        artikel_naam: r.artikel_naam ?? null,
        artikel_code: r.artikel_code ?? null,
        eenheid: r.eenheid ?? "st",
        hoeveelheid: r.reservering.hoeveelheid,
        inkoopprijs: prijs,
        totaal_kosten: totaal,
        type: "reservering",
        status: r.reservering.status,
        omschrijving: r.reservering.omschrijving ?? null,
        datum: iso(r.reservering.gereserveerdOp),
        reservering_id: r.reservering.id,
      };
    });

    const uitgiftes = uitgifte_mutaties.map(m => {
      const prijs = m.inkoopprijs ?? null;
      const hoeveelheid = Math.abs(m.mutatie.hoeveelheid ?? 0);
      const totaal = prijs != null ? Math.round(prijs * hoeveelheid * 100) / 100 : null;
      return {
        id: m.mutatie.id,
        artikel_id: m.mutatie.artikelId,
        artikel_naam: m.artikel_naam ?? null,
        artikel_code: m.artikel_code ?? null,
        eenheid: m.eenheid ?? "st",
        hoeveelheid,
        inkoopprijs: prijs,
        totaal_kosten: totaal,
        type: m.mutatie.type,
        status: null,
        omschrijving: m.mutatie.omschrijving ?? null,
        datum: iso(m.mutatie.aangemaaktOp),
        reservering_id: null,
      };
    });

    // Totaalkosten alleen op openstaande reserveringen (open + gedeeltelijk), niet op gesloten/geannuleerd
    const totaal_kosten_reserveringen = reserveringen
      .filter(r => r.status === "open" || r.status === "gedeeltelijk")
      .reduce((s, r) => s + (r.totaal_kosten ?? 0), 0);
    const totaal_kosten_uitgiftes = uitgiftes.filter(u => u.type === "uitgifte").reduce((s, u) => s + (u.totaal_kosten ?? 0), 0);

    res.json({ reserveringen, uitgiftes, totaal_kosten_reserveringen, totaal_kosten_uitgiftes });
  } catch (err) {
    logger.error({ err }, "getOpdrachtMateriaal fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── POST /opdrachten/:id/werkbegroting/ai-chat ─────────────────────────────
router.post("/opdrachten/:id/werkbegroting/ai-chat", schrijven, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  try {
    const { berichten, afbeelding_base64 } = req.body as {
      berichten: Array<{ rol: "gebruiker" | "assistent"; inhoud: string }>;
      afbeelding_base64?: string | null;
    };

    if (!Array.isArray(berichten) || berichten.length === 0) {
      res.status(400).json({ error: "Berichten ontbreken" }); return;
    }

    const [[opdracht], [begroting]] = await Promise.all([
      db.select().from(opdrachtenTable).where(eq(opdrachtenTable.id, id)).limit(1),
      db.select().from(projectBegrotingenTable).where(eq(projectBegrotingenTable.opdrachtId, id)).limit(1),
    ]);

    if (!begroting) { res.status(404).json({ error: "Werkbegroting niet gevonden" }); return; }

    const regels = await db.select().from(werkbegrotingRegelsTable)
      .where(eq(werkbegrotingRegelsTable.begrotingId, begroting.id))
      .orderBy(asc(werkbegrotingRegelsTable.id));

    let gebouwInfo = "";
    if (opdracht?.gebouwId) {
      const [g] = await db.select().from(gebouwenTable).where(eq(gebouwenTable.id, opdracht.gebouwId)).limit(1);
      if (g) {
        gebouwInfo = `Gebouw: ${g.naam}, ${(g as any).adres ?? ""} ${(g as any).stad ?? ""}.`;
      }
    }

    const arbeidRegels = regels.filter(r => r.categorie === "arbeid");
    const materiaalRegels = regels.filter(r => r.categorie === "materiaal");
    const andereRegels = regels.filter(r => r.categorie !== "arbeid" && r.categorie !== "materiaal");

    const regelenSamenvatting = [
      arbeidRegels.length > 0
        ? `ARBEID (${arbeidRegels.length} regels):\n` +
          arbeidRegels.map(r => `  - ${r.omschrijving}: ${r.hoeveelheid} ${r.eenheid} @ €${r.tarief}/uur = €${r.totaal}`).join("\n")
        : null,
      materiaalRegels.length > 0
        ? `MATERIAAL (${materiaalRegels.length} regels):\n` +
          materiaalRegels.map(r => `  - ${r.omschrijving}: ${r.hoeveelheid} ${r.eenheid} @ €${r.tarief} = €${r.totaal}`).join("\n")
        : null,
      andereRegels.length > 0
        ? `OVERIGE (${andereRegels.length} regels):\n` +
          andereRegels.map(r => `  - [${r.categorie}] ${r.omschrijving}: ${r.hoeveelheid} ${r.eenheid} @ €${r.tarief} = €${r.totaal}`).join("\n")
        : null,
    ].filter(Boolean).join("\n\n") || "(geen regels)";

    const werkbegrotingContext = [
      `OPDRACHT: ${opdracht?.titel ?? "onbekend"}${opdracht?.werknummer ? ` (werknummer: ${opdracht.werknummer})` : ""}`,
      `Status begroting: ${begroting.status ?? "concept"}`,
      `Totaal arbeid: ${begroting.totaalArbeidUren ?? 0} uur`,
      `Totaal materiaal: EUR ${begroting.totaalMateriaalBedrag ?? 0}`,
      gebouwInfo || null,
      `WERKBEGROTINGSREGELS:\n${regelenSamenvatting}`,
    ].filter(Boolean).join("\n");
    const systeemPrompt = werkbegrotingContext + "\n\n" + WERKBEGROTING_CHAT_BASE_PROMPT.tekst;

    if (!heeftGateway()) {
      res.json({ antwoord: "AI-chat is niet beschikbaar. Controleer de OpenAI-configuratie.", signalen: [] });
      return;
    }

    type Msg = { role: "system" | "user" | "assistant"; content: string | Array<Record<string, unknown>> };
    const messages: Msg[] = [{ role: "system", content: systeemPrompt }];

    for (let i = 0; i < berichten.length; i++) {
      const b = berichten[i]!;
      if (b.rol === "gebruiker") {
        if (i === berichten.length - 1 && afbeelding_base64) {
          messages.push({
            role: "user",
            content: [
              { type: "text", text: b.inhoud },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${afbeelding_base64}` } },
            ],
          });
        } else {
          messages.push({ role: "user", content: b.inhoud });
        }
      } else {
        messages.push({ role: "assistant", content: b.inhoud });
      }
    }

    const opdrachtChatResultaat = await aiGateway.chat("reasoning", {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: messages as any,
      max_completion_tokens: 2000,
    });

    const antwoord = opdrachtChatResultaat.ok ? opdrachtChatResultaat.inhoud : "Geen antwoord ontvangen.";

    const signalen: string[] = [];
    const lw = antwoord.toLowerCase();
    if (lw.includes("ontbreekt") || lw.includes("ontbrekend") || lw.includes("vergeten")) {
      signalen.push("Mogelijke ontbrekende werkzaamheden gesignaleerd");
    }
    if (lw.includes("meerwerk") || lw.includes("risico")) {
      signalen.push("Meerwerkrisico aangewezen");
    }
    if (lw.includes("urennorm") && (lw.includes("laag") || lw.includes("hoog") || lw.includes("afwijkend"))) {
      signalen.push("Urennorm controlepunt aangewezen");
    }

    res.json({ antwoord, signalen });
  } catch (err) {
    logger.error({ err }, "aiChatWerkbegroting fout");
    res.status(500).json({ error: "Serverfout bij AI-chat" });
  }
});

// ── AI Senior Werkvoorbereider ─────────────────────────────────────────────

function mapWbAdvies(r: typeof werkbegrotingAdviezenTable.$inferSelect) {
  return {
    id: r.id,
    begroting_id: r.begrotingId,
    run_id: r.runId,
    type: r.type,
    prioriteit: r.prioriteit,
    titel: r.titel,
    uitleg: r.uitleg,
    status: r.status,
    notitie: r.notitie ?? null,
    aangemaakt_op: r.aangemaaktOp instanceof Date ? r.aangemaaktOp.toISOString() : String(r.aangemaaktOp),
    bijgewerkt_op: r.bijgewerktOp instanceof Date ? r.bijgewerktOp.toISOString() : String(r.bijgewerktOp),
  };
}

router.post("/opdrachten/:id/werkbegroting/senior-adviezen", schrijven, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  try {
    const [begroting] = await db.select().from(projectBegrotingenTable)
      .where(eq(projectBegrotingenTable.opdrachtId, id));
    if (!begroting) { res.status(404).json({ error: "Werkbegroting niet gevonden" }); return; }

    const [opdracht] = await db.select().from(opdrachtenTable).where(eq(opdrachtenTable.id, id));
    const regels = await db.select().from(werkbegrotingRegelsTable)
      .where(eq(werkbegrotingRegelsTable.begrotingId, begroting.id))
      .orderBy(asc(werkbegrotingRegelsTable.id));

    const arbeid   = regels.filter(r => r.categorie === "arbeid");
    const materiaal = regels.filter(r => r.categorie === "materiaal");

    interface WbAdviesVoorstel {
      type: string;
      prioriteit: string;
      titel: string;
      uitleg: string;
    }

    let adviezen: WbAdviesVoorstel[] = [];

    if (heeftGateway()) {
      const prompt = `Je bent een ervaren senior werkvoorbereider in de brandpreventiesector (branddeuren, doorvoeringen, brandkleppen, manchetten, coating). 
Analyseer deze werkbegroting kritisch op uitvoerbaarheid, inkoop, planning en voorbereiding.

OPDRACHT: ${opdracht?.titel ?? "onbekend"}
STATUS WERKBEGROTING: ${begroting.status}

ARBEID (${arbeid.length} regels, totaal ${begroting.totaalArbeidUren ?? 0} uur):
${arbeid.map(r => `- [${r.hoofdstuk}] ${r.omschrijving}: ${r.hoeveelheid} ${r.eenheid} @ €${r.tarief}/uur = €${r.totaal}`).join("\n")}

MATERIAAL (${materiaal.length} regels, totaal €${begroting.totaalMateriaalBedrag ?? 0}):
${materiaal.map(r => `- [${r.hoofdstuk}] ${r.omschrijving}: ${r.hoeveelheid} ${r.eenheid} @ €${r.tarief} = €${r.totaal}`).join("\n")}

Controleer minimaal:
- ontbrekende uitvoeringsposten voor dit type werk
- arbeid die te laag lijkt (bijv. demonteren + afvoeren ontbreekt)
- materiaal zonder leverancier of levertijd
- posten die vóór start uitvoering besteld moeten zijn (lange levertijd)
- glaswerk, branddeuren, speciale producten zonder onderaannemer
- risico's voor planning of magazijn/voorraad
- materiaalregels zonder inkoopkoppeling

Geef je analyse als JSON array:
[
  {
    "type": "waarschuwing|uitvoeringsrisico|inkoopactie_nodig|planningrisico|kostenrisico|ontbrekende_voorbereiding|besparingskans",
    "prioriteit": "hoog|middel|laag",
    "titel": "korte titel (max 60 tekens)",
    "uitleg": "concrete uitleg met verwijzing naar de post (max 200 tekens)"
  }
]
Geef 3–10 adviezen. Geen JSON buiten de array.`;

      const resultaat = await aiGateway.chat("reasoning", {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        messages: [
          { role: "system", content: WERKVOORBEREIDING_ADVIES_PROMPT.tekst },
          { role: "user", content: prompt },
        ] as any,
        max_completion_tokens: 3000,
      });

      if (resultaat.ok) {
        try {
          const tekst = resultaat.inhoud.trim();
          const start = tekst.indexOf("[");
          const eind  = tekst.lastIndexOf("]");
          if (start !== -1 && eind !== -1) {
            adviezen = JSON.parse(tekst.slice(start, eind + 1)) as WbAdviesVoorstel[];
          }
        } catch {
          logger.warn("WbAdvies JSON parsen mislukt — fallback zonder AI");
        }
      } else {
        logger.warn({ fout: resultaat.fout }, "AI senior werkvoorbereider mislukt");
      }
    }

    if (adviezen.length === 0) {
      adviezen = [
        { type: "ontbrekende_voorbereiding", prioriteit: "middel", titel: "AI niet beschikbaar", uitleg: "Analyse kon niet worden uitgevoerd. Controleer handmatig de werkbegroting op volledigheid." },
      ];
    }

    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const GELDIGE_TYPEN = ["waarschuwing", "uitvoeringsrisico", "inkoopactie_nodig", "planningrisico", "kostenrisico", "ontbrekende_voorbereiding", "besparingskans"];
    const GELDIGE_PRIO  = ["hoog", "middel", "laag"];

    const rijen = adviezen
      .filter(a => a.titel && a.uitleg)
      .map(a => ({
        begrotingId: begroting.id,
        runId,
        type:       GELDIGE_TYPEN.includes(a.type)      ? a.type      : "ontbrekende_voorbereiding",
        prioriteit: GELDIGE_PRIO.includes(a.prioriteit) ? a.prioriteit : "middel",
        titel:  String(a.titel).slice(0, 120),
        uitleg: String(a.uitleg).slice(0, 500),
        status: "actief",
      }));

    const inserted = rijen.length > 0
      ? await db.insert(werkbegrotingAdviezenTable).values(rijen).returning()
      : [];

    res.json(inserted.map(mapWbAdvies));
  } catch (err) {
    logger.error({ err }, "aiSeniorWerkvoorbereider fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

router.get("/opdrachten/:id/werkbegroting/senior-adviezen", lezen, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  try {
    const [begroting] = await db.select().from(projectBegrotingenTable)
      .where(eq(projectBegrotingenTable.opdrachtId, id));
    if (!begroting) { res.json([]); return; }

    const rows = await db.select().from(werkbegrotingAdviezenTable)
      .where(eq(werkbegrotingAdviezenTable.begrotingId, begroting.id))
      .orderBy(
        sql`CASE ${werkbegrotingAdviezenTable.prioriteit} WHEN 'hoog' THEN 1 WHEN 'middel' THEN 2 ELSE 3 END`,
        asc(werkbegrotingAdviezenTable.aangemaaktOp),
      );

    res.json(rows.map(mapWbAdvies));
  } catch (err) {
    logger.error({ err }, "listWbAdviezen fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

router.patch("/opdrachten/:id/werkbegroting/senior-adviezen/:adviesId", schrijven, async (req, res): Promise<void> => {
  const id       = parseInt(String(req.params.id), 10);
  const adviesId = parseInt(String(req.params.adviesId), 10);
  if (isNaN(id) || isNaN(adviesId)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  try {
    const [begroting] = await db.select().from(projectBegrotingenTable)
      .where(eq(projectBegrotingenTable.opdrachtId, id));
    if (!begroting) { res.status(404).json({ error: "Werkbegroting niet gevonden" }); return; }

    const { status, notitie } = req.body as { status?: string; notitie?: string | null };
    const updates: Partial<typeof werkbegrotingAdviezenTable.$inferInsert> = { bijgewerktOp: new Date() };
    if (status !== undefined) updates.status = status;
    if (notitie !== undefined) updates.notitie = notitie;

    const [updated] = await db.update(werkbegrotingAdviezenTable)
      .set(updates)
      .where(and(eq(werkbegrotingAdviezenTable.id, adviesId), eq(werkbegrotingAdviezenTable.begrotingId, begroting.id)))
      .returning();

    if (!updated) { res.status(404).json({ error: "Advies niet gevonden" }); return; }
    res.json(mapWbAdvies(updated));
  } catch (err) {
    logger.error({ err }, "updateWbAdvies fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

export default router;
