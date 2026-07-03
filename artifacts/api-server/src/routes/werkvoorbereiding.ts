// Werkvoorbereiding — AI Inkoopplanning + Uitvoeringsplanning
// Routes: PATCH werkbegroting-regels, inkoopplanning, inkoopbonnen, uitvoeringsplanning
import { Router } from "express";
import { workflowService, maakTransitieContext } from "../services/workflow-engine";
import {
  db,
  opdrachtenTable,
  projectBegrotingenTable,
  werkbegrotingRegelsTable,
  inkoopplannenTable,
  inkoopplanRegelsTable,
  inkoopbonnenTable,
  inkoopbonRegelsTable,
  uitvoeringsplannenTable,
  uitvoeringsplanTakenTable,
  gebruikersTable,
  leveranciersTable,
  onderaannemeOrdersTable,
} from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { verstuurMail, isGeconfigureerd } from "../services/email";
import { aiGateway, heeftGateway } from "../lib/aiGateway";

const router = Router();
const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;

const lezen    = requireBevoegdheid("offertes", 1);
const schrijven = requireBevoegdheid("offertes", 2);

// ── helpers ───────────────────────────────────────────────────────────────────

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
    ai_inkoop_voorstel: (r as Record<string,unknown>).aiInkoopVoorstel ?? null,
    ai_arbeid_voorstel: (r as Record<string,unknown>).aiArbeidVoorstel ?? null,
  };
}

function mapInkoopRegel(r: typeof inkoopplanRegelsTable.$inferSelect) {
  return {
    id: r.id,
    inkoopplan_id: r.inkoopplanId,
    werkbegroting_regel_id: r.werkbegrotingRegelId ?? null,
    omschrijving: r.omschrijving,
    hoeveelheid: r.hoeveelheid,
    eenheid: r.eenheid,
    type: r.type,
    leverancier: r.leverancier ?? null,
    aanbevolen_leverancier: r.aanbevolenLeverancier ?? null,
    calc_prijs: r.calcPrijs ?? null,
    inkoopprijs_verwacht: r.inkoopprijsVerwacht ?? null,
    inkoopprijs: r.inkoopprijs ?? null,
    besparing_per_eenheid: r.besparingPerEenheid ?? null,
    besparing: r.besparing ?? null,
    levertijd_weken: r.levertijdWeken ?? null,
    gewenste_leverdatum: r.gewensteLeverdatum ?? null,
    besteldatum: r.besteldatum ?? null,
    status: r.status,
    ai_motivatie: r.aiMotivatie ?? null,
    opmerkingen: r.opmerkingen ?? null,
    bron: r.bron,
    volgorde: r.volgorde,
    aangemaakt_op: iso(r.aangemaaktOp)!,
    bijgewerkt_op: iso(r.bijgewerktOp)!,
  };
}

function mapOnderaannemer(r: typeof onderaannemeOrdersTable.$inferSelect) {
  return {
    id: r.id,
    opdracht_id: r.opdrachtId,
    omschrijving: r.omschrijving,
    bedrijf: r.bedrijf ?? null,
    contactpersoon: r.contactpersoon ?? null,
    werkzaamheden: r.werkzaamheden ?? null,
    bedrag_excl_btw: r.bedragExclBtw ?? null,
    btw_percentage: r.btwPercentage,
    status: r.status,
    gewenste_startdatum: r.gewensteStartdatum ?? null,
    gewenste_einddatum: r.gewensteEinddatum ?? null,
    opmerkingen: r.opmerkingen ?? null,
    aangemaakt_op: iso(r.aangemaaktOp)!,
    bijgewerkt_op: iso(r.bijgewerktOp)!,
  };
}

function mapInkoopplan(
  plan: typeof inkoopplannenTable.$inferSelect,
  regels: typeof inkoopplanRegelsTable.$inferSelect[],
) {
  return {
    id: plan.id,
    opdracht_id: plan.opdrachtId,
    status: plan.status,
    ai_gegenereerd: plan.aiGegenereerd,
    ai_gegenereerd_op: iso(plan.aiGegeneerdOp),
    ai_samenvatting: plan.aiSamenvatting ?? null,
    totale_besparing: plan.totaleBesparing ?? null,
    vastgesteld_op: iso(plan.vastgesteldOp),
    opmerkingen: plan.opmerkingen ?? null,
    aangemaakt_op: iso(plan.aangemaaktOp)!,
    bijgewerkt_op: iso(plan.bijgewerktOp)!,
    regels: regels.map(mapInkoopRegel),
  };
}

function mapBonRegel(r: typeof inkoopbonRegelsTable.$inferSelect) {
  return {
    id: r.id,
    inkoopbon_id: r.inkoopbonId,
    inkoopplan_regel_id: r.inkoopplanRegelId ?? null,
    omschrijving: r.omschrijving,
    hoeveelheid: r.hoeveelheid,
    eenheid: r.eenheid,
    prijs: r.prijs ?? null,
    totaal: r.totaal ?? null,
    volgorde: r.volgorde,
  };
}

function mapInkoopbon(
  bon: typeof inkoopbonnenTable.$inferSelect,
  regels: typeof inkoopbonRegelsTable.$inferSelect[],
) {
  return {
    id: bon.id,
    inkoopplan_id: bon.inkoopplanId ?? null,
    opdracht_id: bon.opdrachtId,
    bon_nummer: bon.bonNummer ?? null,
    leverancier: bon.leverancier,
    leverancier_id: bon.leverancierId ?? null,
    gewenste_leverdatum: bon.gewensteLeverdatum ?? null,
    totaal_bedrag: bon.totaalBedrag ?? null,
    status: bon.status,
    goedgekeurd_op: iso(bon.goedgekeurdOp),
    opmerkingen: bon.opmerkingen ?? null,
    verzonden_op: iso(bon.verzondenOp),
    verzonden_naar: bon.verzondenNaar ?? null,
    ai_suggestie: bon.aiSuggestie,
    ai_motivatie: bon.aiMotivatie ?? null,
    aangemaakt_op: iso(bon.aangemaaktOp)!,
    bijgewerkt_op: iso(bon.bijgewerktOp)!,
    regels: regels.map(mapBonRegel),
  };
}

function mapUitvoeringsplanTaak(t: typeof uitvoeringsplanTakenTable.$inferSelect) {
  return {
    id: t.id,
    uitvoeringsplan_id: t.uitvoeringsplanId,
    volgorde: t.volgorde,
    fase: t.fase ?? null,
    omschrijving: t.omschrijving,
    discipline: t.discipline ?? null,
    duur_dagen: t.duurDagen ?? null,
    benodigde_medewerkers: t.benodigdeMedewerkers ?? null,
    urenbegroting: t.urenbegroting ?? null,
    afhankelijk_van_ids: t.afhankelijkVanIds ?? null,
    materiaal_moment: t.materiaalMoment ?? null,
    ai_motivatie: t.aiMotivatie ?? null,
    opmerkingen: t.opmerkingen ?? null,
    ai_gegenereerd: t.aiGegenereerd,
    aangemaakt_op: iso(t.aangemaaktOp)!,
    bijgewerkt_op: iso(t.bijgewerktOp)!,
  };
}

function mapUitvoeringsplan(
  plan: typeof uitvoeringsplannenTable.$inferSelect,
  taken: typeof uitvoeringsplanTakenTable.$inferSelect[],
) {
  return {
    id: plan.id,
    opdracht_id: plan.opdrachtId,
    status: plan.status,
    ai_gegenereerd: plan.aiGegenereerd,
    ai_gegenereerd_op: iso(plan.aiGegeneerdOp),
    ai_samenvatting: plan.aiSamenvatting ?? null,
    startdatum: plan.startdatum ?? null,
    einddatum: plan.einddatum ?? null,
    totaal_weken: plan.totaalWeken ?? null,
    vastgesteld_op: iso(plan.vastgesteldOp),
    opmerkingen: plan.opmerkingen ?? null,
    aangemaakt_op: iso(plan.aangemaaktOp)!,
    bijgewerkt_op: iso(plan.bijgewerktOp)!,
    taken: taken.map(mapUitvoeringsplanTaak),
  };
}

async function getAiClient() {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  return { apiKey, baseUrl };
}

// ── PATCH /opdrachten/:id/werkbegroting/regels/:regelId ────────────────────

router.patch("/opdrachten/:id/werkbegroting/regels/:regelId", schrijven, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  const regelId = parseInt(String(req.params.regelId), 10);
  if (isNaN(id) || isNaN(regelId)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  const { omschrijving, hoeveelheid, tarief, eenheid } = req.body as Record<string, unknown>;

  try {
    const [begroting] = await db.select().from(projectBegrotingenTable)
      .where(eq(projectBegrotingenTable.opdrachtId, id));
    if (!begroting) { res.status(404).json({ error: "Werkbegroting niet gevonden" }); return; }

    if (begroting.status === "vastgesteld") {
      res.status(409).json({ error: "Vastgestelde begroting kan niet worden gewijzigd" }); return;
    }

    const updates: Record<string, unknown> = { bijgewerktOp: new Date() };
    if (typeof omschrijving === "string") updates.omschrijving = omschrijving;
    if (typeof hoeveelheid === "number") updates.hoeveelheid = hoeveelheid;
    if (typeof tarief === "number") {
      updates.tarief = tarief;
      // totaal wordt herberekend op basis van huidige hoeveelheid
    }
    if (typeof eenheid === "string") updates.eenheid = eenheid;

    // Als tarief of hoeveelheid gewijzigd, herbereken totaal
    const [huidig] = await db.select().from(werkbegrotingRegelsTable)
      .where(and(eq(werkbegrotingRegelsTable.id, regelId), eq(werkbegrotingRegelsTable.begrotingId, begroting.id)));
    if (!huidig) { res.status(404).json({ error: "Regel niet gevonden" }); return; }

    const nieuwHoeveelheid = typeof hoeveelheid === "number" ? hoeveelheid : huidig.hoeveelheid;
    const nieuwTarief = typeof tarief === "number" ? tarief : huidig.tarief;
    updates.totaal = nieuwHoeveelheid * nieuwTarief;

    const [updated] = await db.update(werkbegrotingRegelsTable)
      .set(updates as Partial<typeof werkbegrotingRegelsTable.$inferInsert>)
      .where(and(eq(werkbegrotingRegelsTable.id, regelId), eq(werkbegrotingRegelsTable.begrotingId, begroting.id)))
      .returning();
    if (!updated) { res.status(404).json({ error: "Regel niet gevonden" }); return; }

    // Herbereken begroting totalen
    const alleRegels = await db.select().from(werkbegrotingRegelsTable)
      .where(eq(werkbegrotingRegelsTable.begrotingId, begroting.id));
    const totaalArbeidUren = alleRegels.filter(r => r.categorie === "arbeid")
      .reduce((a, r) => a + r.hoeveelheid, 0);
    const totaalMateriaalBedrag = alleRegels.filter(r => r.categorie === "materiaal")
      .reduce((a, r) => a + r.totaal, 0);
    await db.update(projectBegrotingenTable)
      .set({ totaalArbeidUren, totaalMateriaalBedrag, bijgewerktOp: new Date() })
      .where(eq(projectBegrotingenTable.id, begroting.id));

    res.json(mapRegel(updated));
  } catch (err) {
    logger.error({ err }, "patchWerkbegrotingRegel fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── GET /opdrachten/:id/inkoopplanning ────────────────────────────────────

router.get("/opdrachten/:id/inkoopplanning", lezen, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  try {
    const [plan] = await db.select().from(inkoopplannenTable)
      .where(eq(inkoopplannenTable.opdrachtId, id));
    if (!plan) { res.status(404).json({ error: "Nog geen inkoopplanning" }); return; }

    const regels = await db.select().from(inkoopplanRegelsTable)
      .where(eq(inkoopplanRegelsTable.inkoopplanId, plan.id))
      .orderBy(asc(inkoopplanRegelsTable.volgorde), asc(inkoopplanRegelsTable.id));

    res.json(mapInkoopplan(plan, regels));
  } catch (err) {
    logger.error({ err }, "getInkoopplanning fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── POST /opdrachten/:id/inkoopplanning/genereer ───────────────────────────

router.post("/opdrachten/:id/inkoopplanning/genereer", schrijven, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  try {
    const [opdracht] = await db.select().from(opdrachtenTable).where(eq(opdrachtenTable.id, id));
    if (!opdracht) { res.status(404).json({ error: "Opdracht niet gevonden" }); return; }

    const [begroting] = await db.select().from(projectBegrotingenTable)
      .where(eq(projectBegrotingenTable.opdrachtId, id));
    if (!begroting) { res.status(404).json({ error: "Werkbegroting niet gevonden" }); return; }

    const regels = await db.select().from(werkbegrotingRegelsTable)
      .where(eq(werkbegrotingRegelsTable.begrotingId, begroting.id))
      .orderBy(asc(werkbegrotingRegelsTable.id));

    const materiaalRegels = regels.filter(r => r.categorie === "materiaal");

    // Bestaand plan verwijderen en opnieuw aanmaken
    const [bestaand] = await db.select().from(inkoopplannenTable)
      .where(eq(inkoopplannenTable.opdrachtId, id));
    if (bestaand) {
      await db.delete(inkoopplanRegelsTable).where(eq(inkoopplanRegelsTable.inkoopplanId, bestaand.id));
      await db.delete(inkoopplannenTable).where(eq(inkoopplannenTable.id, bestaand.id));
    }

    interface AiInkoopRegel {
      omschrijving: string;
      type: string;
      aanbevolen_leverancier: string | null;
      inkoopprijs_verwacht: number;
      besparing_per_eenheid: number;
      besparing: number;
      levertijd_weken: number;
      motivatie: string;
    }

    interface AiInkoopResult {
      samenvatting: string;
      totale_besparing: number;
      regels: AiInkoopRegel[];
    }

    let aiResultaat: AiInkoopResult | null = null;
    let aiGegenereerd = false;

    if (heeftGateway() && materiaalRegels.length > 0) {
      const prompt = `Je bent een inkoper bij een brandpreventie-installatiebedrijf in Nederland.
Analyseer de onderstaande materiaalregels uit een werkbegroting en maak een inkoopplanning.

MATERIAALREGELS:
${materiaalRegels.map((r, i) => `${i + 1}. ${r.omschrijving}: ${r.hoeveelheid} ${r.eenheid} @ €${r.tarief} = €${r.totaal}`).join('\n')}

Opdracht: ${opdracht.titel}

Classificeer elk materiaal als:
- "voorraad": gangbaar materiaal, altijd op voorraad (bijv. schroeven, kabelgoot, kleine onderdelen)
- "standaard": regulier leveranciersmaterial, 1-2 weken levertijd
- "project": projectspecifiek, 2-4 weken levertijd (bijv. specifieke branddeuren, damperplaten)
- "maatwerk": speciaal geproduceerd, >4 weken levertijd (bijv. maatwerkpanelen, niet-standaard manchetten)

Geef realistische inkoopprijzen (iets lager dan de calculatieprijs) en aanbevolen leveranciers voor de Nederlandse markt (bijv. Soudal, Hilti, Rockwool, Enraf, Beele, Pyroplex, etc.).

Geef je analyse als JSON:
{
  "samenvatting": "korte samenvatting van de inkoopplanning",
  "totale_besparing": 0,
  "regels": [
    {
      "omschrijving": "naam van het materiaal (exact overnemen)",
      "type": "voorraad|standaard|project|maatwerk",
      "aanbevolen_leverancier": "naam of null",
      "inkoopprijs_verwacht": 0.00,
      "besparing_per_eenheid": 0.00,
      "besparing": 0.00,
      "levertijd_weken": 0,
      "motivatie": "korte uitleg type-keuze en leverancier"
    }
  ]
}`;

      try {
        const inkoopResultaat = await aiGateway.chat("default", {
          messages: [
            { role: "system", content: "Je bent een ervaren inkoper brandpreventie. Geef altijd valide JSON terug." },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
          max_tokens: 3000,
        }, undefined, {
          module: "werkvoorbereiding",
          functie: "inkoopplanning-genereer",
          gebruikerId: req.session.userId ?? null,
          project_id: id,
        });
        if (inkoopResultaat.ok) {
          aiResultaat = JSON.parse(inkoopResultaat.inhoud) as AiInkoopResult;
          aiGegenereerd = true;
        }
      } catch (aiErr) {
        logger.warn({ aiErr }, "AI inkoopplanning genereer mislukt — fallback");
      }
    }

    // Plan aanmaken
    const [plan] = await db.insert(inkoopplannenTable).values({
      opdrachtId: id,
      status: "concept",
      aiGegenereerd,
      aiGegeneerdOp: aiGegenereerd ? new Date() : null,
      aiSamenvatting: aiResultaat?.samenvatting ?? null,
      totaleBesparing: aiResultaat?.totale_besparing ?? null,
    }).returning();

    // Regels aanmaken
    const planRegels: (typeof inkoopplanRegelsTable.$inferInsert)[] = [];

    for (let i = 0; i < materiaalRegels.length; i++) {
      const regel = materiaalRegels[i];
      const aiRegel = aiResultaat?.regels?.find(
        (r: AiInkoopRegel) => r.omschrijving.toLowerCase().includes(regel.omschrijving.toLowerCase().slice(0, 10))
      ) ?? aiResultaat?.regels?.[i] ?? null;

      const inkoopprijsVerwacht = aiRegel?.inkoopprijs_verwacht ?? null;
      const besparingPerEenheid = aiRegel?.besparing_per_eenheid ?? null;
      const besparing = aiRegel?.besparing ?? null;

      planRegels.push({
        inkoopplanId: plan.id,
        werkbegrotingRegelId: regel.id,
        omschrijving: regel.omschrijving,
        hoeveelheid: regel.hoeveelheid,
        eenheid: regel.eenheid,
        type: aiRegel?.type ?? "standaard",
        aanbevolenLeverancier: aiRegel?.aanbevolen_leverancier ?? null,
        calcPrijs: regel.tarief,
        inkoopprijsVerwacht,
        besparingPerEenheid,
        besparing,
        levertijdWeken: aiRegel?.levertijd_weken ?? null,
        aiMotivatie: aiRegel?.motivatie ?? null,
        status: "open",
        volgorde: i,
      });
    }

    if (planRegels.length > 0) {
      await db.insert(inkoopplanRegelsTable).values(planRegels);
    }

    const alleRegels = await db.select().from(inkoopplanRegelsTable)
      .where(eq(inkoopplanRegelsTable.inkoopplanId, plan.id))
      .orderBy(asc(inkoopplanRegelsTable.volgorde));

    res.json(mapInkoopplan(plan, alleRegels));
  } catch (err) {
    logger.error({ err }, "genereerInkoopplanning fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── POST /opdrachten/:id/inkoopplanning/vaststellen ───────────────────────

router.post("/opdrachten/:id/inkoopplanning/vaststellen", schrijven, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  try {
    const [plan] = await db.select().from(inkoopplannenTable)
      .where(eq(inkoopplannenTable.opdrachtId, id));
    if (!plan) { res.status(404).json({ error: "Inkoopplanning niet gevonden" }); return; }

    const userId = req.session?.userId as number | undefined;
    const [updated] = await db.update(inkoopplannenTable)
      .set({
        status: "gereed",
        vastgesteldOp: new Date(),
        vastgesteldDoorId: userId ?? null,
        bijgewerktOp: new Date(),
      })
      .where(eq(inkoopplannenTable.id, plan.id))
      .returning();

    const regels = await db.select().from(inkoopplanRegelsTable)
      .where(eq(inkoopplanRegelsTable.inkoopplanId, plan.id))
      .orderBy(asc(inkoopplanRegelsTable.volgorde));

    res.json(mapInkoopplan(updated, regels));
  } catch (err) {
    logger.error({ err }, "vaststellenInkoopplanning fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── PATCH /opdrachten/:id/inkoopplanning/regels/:regelId ──────────────────

router.patch("/opdrachten/:id/inkoopplanning/regels/:regelId", schrijven, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  const regelId = parseInt(String(req.params.regelId), 10);
  if (isNaN(id) || isNaN(regelId)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  const body = req.body as Record<string, unknown>;

  try {
    const [plan] = await db.select().from(inkoopplannenTable)
      .where(eq(inkoopplannenTable.opdrachtId, id));
    if (!plan) { res.status(404).json({ error: "Inkoopplanning niet gevonden" }); return; }

    const updates: Record<string, unknown> = { bijgewerktOp: new Date() };
    const velden: Array<keyof typeof inkoopplanRegelsTable.$inferInsert> = [
      "leverancier", "inkoopprijs", "gewensteLeverdatum", "besteldatum",
      "levertijdWeken", "status", "opmerkingen", "type",
    ];
    const bodyMap: Record<string, string> = {
      omschrijving: "omschrijving",
      hoeveelheid: "hoeveelheid",
      eenheid: "eenheid",
      leverancier: "leverancier",
      inkoopprijs: "inkoopprijs",
      gewenste_leverdatum: "gewensteLeverdatum",
      besteldatum: "besteldatum",
      levertijd_weken: "levertijdWeken",
      status: "status",
      opmerkingen: "opmerkingen",
      type: "type",
    };
    void velden;
    for (const [bodyKey, dbKey] of Object.entries(bodyMap)) {
      if (body[bodyKey] !== undefined) {
        updates[dbKey] = body[bodyKey];
      }
    }

    const [updated] = await db.update(inkoopplanRegelsTable)
      .set(updates as Partial<typeof inkoopplanRegelsTable.$inferInsert>)
      .where(and(eq(inkoopplanRegelsTable.id, regelId), eq(inkoopplanRegelsTable.inkoopplanId, plan.id)))
      .returning();
    if (!updated) { res.status(404).json({ error: "Regel niet gevonden" }); return; }

    res.json(mapInkoopRegel(updated));
  } catch (err) {
    logger.error({ err }, "patchInkoopplanRegel fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── GET /opdrachten/:id/inkoopplanning/inkoopbonnen ───────────────────────

router.get("/opdrachten/:id/inkoopplanning/inkoopbonnen", lezen, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  try {
    const bonnen = await db.select().from(inkoopbonnenTable)
      .where(eq(inkoopbonnenTable.opdrachtId, id))
      .orderBy(asc(inkoopbonnenTable.id));

    const result = await Promise.all(bonnen.map(async (bon) => {
      const regels = await db.select().from(inkoopbonRegelsTable)
        .where(eq(inkoopbonRegelsTable.inkoopbonId, bon.id))
        .orderBy(asc(inkoopbonRegelsTable.volgorde));
      return mapInkoopbon(bon, regels);
    }));

    res.json(result);
  } catch (err) {
    logger.error({ err }, "listInkoopbonnen fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── POST /opdrachten/:id/inkoopplanning/inkoopbonnen ──────────────────────

let bonTeller = 1;

router.post("/opdrachten/:id/inkoopplanning/inkoopbonnen", schrijven, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  const body = req.body as {
    leverancier: string;
    gewenste_leverdatum?: string;
    opmerkingen?: string;
    regels?: Array<{
      inkoopplan_regel_id?: number;
      omschrijving: string;
      hoeveelheid: number;
      eenheid: string;
      prijs?: number;
    }>;
  };

  if (!body.leverancier?.trim()) {
    res.status(400).json({ error: "Leverancier verplicht" }); return;
  }

  try {
    const [plan] = await db.select().from(inkoopplannenTable)
      .where(eq(inkoopplannenTable.opdrachtId, id));

    const jaar = new Date().getFullYear();
    const bonNummer = `IB-${jaar}-${String(bonTeller++).padStart(3, "0")}`;

    const inputRegels = body.regels ?? [];
    const totaalBedrag = inputRegels.reduce((acc, r) => {
      return acc + (r.prijs ?? 0) * r.hoeveelheid;
    }, 0);

    const [bon] = await db.insert(inkoopbonnenTable).values({
      inkoopplanId: plan?.id ?? null,
      opdrachtId: id,
      bonNummer,
      leverancier: body.leverancier,
      gewensteLeverdatum: body.gewenste_leverdatum ?? null,
      totaalBedrag: totaalBedrag > 0 ? totaalBedrag : null,
      status: "concept",
      opmerkingen: body.opmerkingen ?? null,
    }).returning();

    if (inputRegels.length > 0) {
      await db.insert(inkoopbonRegelsTable).values(
        inputRegels.map((r, i) => ({
          inkoopbonId: bon.id,
          inkoopplanRegelId: r.inkoopplan_regel_id ?? null,
          omschrijving: r.omschrijving,
          hoeveelheid: r.hoeveelheid,
          eenheid: r.eenheid,
          prijs: r.prijs ?? null,
          totaal: r.prijs != null ? r.hoeveelheid * r.prijs : null,
          volgorde: i,
        }))
      );
    }

    const regels = await db.select().from(inkoopbonRegelsTable)
      .where(eq(inkoopbonRegelsTable.inkoopbonId, bon.id))
      .orderBy(asc(inkoopbonRegelsTable.volgorde));

    res.status(201).json(mapInkoopbon(bon, regels));
  } catch (err) {
    logger.error({ err }, "createInkoopbon fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── POST /opdrachten/:id/inkoopplanning/inkoopbonnen/ai-suggesties ────────

router.post("/opdrachten/:id/inkoopplanning/inkoopbonnen/ai-suggesties", schrijven, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  try {
    const [opdracht] = await db.select().from(opdrachtenTable).where(eq(opdrachtenTable.id, id));
    if (!opdracht) { res.status(404).json({ error: "Opdracht niet gevonden" }); return; }

    const [plan] = await db.select().from(inkoopplannenTable)
      .where(eq(inkoopplannenTable.opdrachtId, id));

    const planRegels = plan
      ? await db.select().from(inkoopplanRegelsTable)
          .where(eq(inkoopplanRegelsTable.inkoopplanId, plan.id))
          .orderBy(asc(inkoopplanRegelsTable.volgorde))
      : [];

    const openRegels = planRegels.filter(r => r.status === "open" || r.status === "uit_voorraad");
    const leveranciers = await db.select().from(leveranciersTable)
      .where(eq(leveranciersTable.actief, true));

    interface AiBonRegel {
      inkoopplan_regel_id: number | null;
      omschrijving: string;
      hoeveelheid: number;
      eenheid: string;
      prijs: number | null;
    }
    interface AiSuggestieBon {
      leverancier: string;
      leverancier_id: number | null;
      gewenste_leverdatum: string | null;
      ai_motivatie: string;
      regels: AiBonRegel[];
    }

    let bonnen: AiSuggestieBon[] = [];

    if (heeftGateway() && openRegels.length > 0) {
      const leveranciersInfo = leveranciers.length > 0
        ? `\nBeschikbare leveranciers in het systeem:\n${leveranciers.map(l => `- ${l.naam} (id:${l.id})${l.email ? `, email: ${l.email}` : ""}${l.categorie ? `, categorie: ${l.categorie}` : ""}`).join("\n")}`
        : "";

      const prompt = `Je bent een inkoper bij een brandpreventie-installatiebedrijf in Nederland.
Groepeer de onderstaande inkoopplanregels in logische inkoopbonnen per leverancier.
Wijs elke regel toe aan de meest passende leverancier.${leveranciersInfo}

INKOOPPLANREGELS:
${openRegels.map((r, i) => `${i + 1}. [id:${r.id}] ${r.omschrijving}: ${r.hoeveelheid} ${r.eenheid}${r.inkoopprijsVerwacht != null ? ` @ €${r.inkoopprijsVerwacht}` : ""}${r.aanbevolenLeverancier ? ` (aanbevolen: ${r.aanbevolenLeverancier})` : ""}`).join("\n")}

Opdracht: ${opdracht.titel}

Geef je suggestie als JSON:
{
  "bonnen": [
    {
      "leverancier": "naam leverancier",
      "leverancier_id": null_of_id_uit_lijst,
      "gewenste_leverdatum": "YYYY-MM-DD of null",
      "ai_motivatie": "korte uitleg waarom deze groepering",
      "regels": [
        {
          "inkoopplan_regel_id": id,
          "omschrijving": "tekst",
          "hoeveelheid": getal,
          "eenheid": "st",
          "prijs": getal_of_null
        }
      ]
    }
  ]
}`;

      try {
        const bonResultaat = await aiGateway.chat("default", {
          messages: [
            { role: "system", content: "Je bent een ervaren inkoper brandpreventie. Geef altijd valide JSON terug." },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
          max_tokens: 3000,
        }, undefined, {
          module: "werkvoorbereiding",
          functie: "inkoopbon-genereer",
          gebruikerId: req.session.userId ?? null,
          project_id: id,
        });
        if (bonResultaat.ok) {
          const parsed = JSON.parse(bonResultaat.inhoud) as { bonnen?: AiSuggestieBon[] };
          bonnen = parsed.bonnen ?? [];
        }
      } catch (aiErr) {
        logger.warn({ aiErr }, "AI inkoopbon-suggesties mislukt — lege suggestie teruggegeven");
      }
    }

    // Fallback: als geen AI of lege regels, groepeer per aanbevolen leverancier
    if (bonnen.length === 0 && openRegels.length > 0) {
      const groepen = new Map<string, typeof openRegels>();
      for (const r of openRegels) {
        const key = r.aanbevolenLeverancier ?? "Onbekend";
        if (!groepen.has(key)) groepen.set(key, []);
        groepen.get(key)!.push(r);
      }
      for (const [lev, regels] of groepen.entries()) {
        const gevonden = leveranciers.find(l => l.naam.toLowerCase() === lev.toLowerCase());
        bonnen.push({
          leverancier: lev,
          leverancier_id: gevonden?.id ?? null,
          gewenste_leverdatum: null,
          ai_motivatie: `Groepering op basis van aanbevolen leverancier "${lev}".`,
          regels: regels.map(r => ({
            inkoopplan_regel_id: r.id,
            omschrijving: r.omschrijving,
            hoeveelheid: r.hoeveelheid,
            eenheid: r.eenheid,
            prijs: r.inkoopprijsVerwacht ?? null,
          })),
        });
      }
    }

    res.json({ bonnen });
  } catch (err) {
    logger.error({ err }, "genereerInkoopbonAiSuggesties fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── PATCH /opdrachten/:id/inkoopplanning/inkoopbonnen/:bonId ─────────────

router.patch("/opdrachten/:id/inkoopplanning/inkoopbonnen/:bonId", schrijven, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  const bonId = parseInt(String(req.params.bonId), 10);
  if (isNaN(id) || isNaN(bonId)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  const body = req.body as Record<string, unknown>;

  try {
    // Status via de WorkflowEngine — valideert de transitie en zet goedgekeurdOp/Door
    if (body.status !== undefined) {
      const ctx = await maakTransitieContext(req, db);
      const result = await workflowService.transiteer(
        "inkoopbon",
        bonId,
        String(body.status),
        ctx,
      );
      if (!result.ok) {
        res.status(result.error!.httpStatus).json({ error: result.error!.bericht }); return;
      }
    }

    // Overige veldwijzigingen (leverancier, leverdatum, opmerkingen)
    const updates: Record<string, unknown> = { bijgewerktOp: new Date() };
    const bodyMap: Record<string, string> = {
      leverancier: "leverancier",
      leverancier_id: "leverancierId",
      gewenste_leverdatum: "gewensteLeverdatum",
      opmerkingen: "opmerkingen",
    };
    for (const [bodyKey, dbKey] of Object.entries(bodyMap)) {
      if (body[bodyKey] !== undefined) updates[dbKey] = body[bodyKey];
    }

    const [updated] = await db.update(inkoopbonnenTable)
      .set(updates as Partial<typeof inkoopbonnenTable.$inferInsert>)
      .where(and(eq(inkoopbonnenTable.id, bonId), eq(inkoopbonnenTable.opdrachtId, id)))
      .returning();
    if (!updated) { res.status(404).json({ error: "Inkoopbon niet gevonden" }); return; }

    const regels = await db.select().from(inkoopbonRegelsTable)
      .where(eq(inkoopbonRegelsTable.inkoopbonId, bonId))
      .orderBy(asc(inkoopbonRegelsTable.volgorde));

    res.json(mapInkoopbon(updated, regels));
  } catch (err) {
    logger.error({ err }, "patchInkoopbon fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── DELETE /opdrachten/:id/inkoopplanning/inkoopbonnen/:bonId ─────────────

router.delete("/opdrachten/:id/inkoopplanning/inkoopbonnen/:bonId", schrijven, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  const bonId = parseInt(String(req.params.bonId), 10);
  if (isNaN(id) || isNaN(bonId)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  try {
    const [bon] = await db.select().from(inkoopbonnenTable)
      .where(and(eq(inkoopbonnenTable.id, bonId), eq(inkoopbonnenTable.opdrachtId, id)));
    if (!bon) { res.status(404).json({ error: "Inkoopbon niet gevonden" }); return; }
    if (bon.status !== "concept") {
      res.status(409).json({ error: "Alleen conceptbonnen kunnen worden verwijderd" }); return;
    }

    await db.delete(inkoopbonRegelsTable).where(eq(inkoopbonRegelsTable.inkoopbonId, bonId));
    await db.delete(inkoopbonnenTable).where(eq(inkoopbonnenTable.id, bonId));

    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "deleteInkoopbon fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── POST /opdrachten/:id/inkoopplanning/inkoopbonnen/:bonId/verzenden ─────

router.post("/opdrachten/:id/inkoopplanning/inkoopbonnen/:bonId/verzenden", schrijven, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  const bonId = parseInt(String(req.params.bonId), 10);
  if (isNaN(id) || isNaN(bonId)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  const body = req.body as { email?: string; bericht?: string };
  if (!body.email?.trim()) {
    res.status(400).json({ error: "E-mailadres verplicht" }); return;
  }

  try {
    const [bon] = await db.select().from(inkoopbonnenTable)
      .where(and(eq(inkoopbonnenTable.id, bonId), eq(inkoopbonnenTable.opdrachtId, id)));
    if (!bon) { res.status(404).json({ error: "Inkoopbon niet gevonden" }); return; }

    const regels = await db.select().from(inkoopbonRegelsTable)
      .where(eq(inkoopbonRegelsTable.inkoopbonId, bonId))
      .orderBy(asc(inkoopbonRegelsTable.volgorde));

    const [opdracht] = await db.select().from(opdrachtenTable).where(eq(opdrachtenTable.id, id));

    // Leverancier e-mail ophalen als niet meegegeven
    const email = body.email.trim();
    const datum = new Date().toLocaleDateString("nl-NL", { day: "2-digit", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" });
    const leverdatum = bon.gewensteLeverdatum
      ? new Date(bon.gewensteLeverdatum).toLocaleDateString("nl-NL", { day: "2-digit", month: "long", year: "numeric" })
      : null;

    const totaal = regels.reduce((s, r) => s + (r.totaal ?? (r.prijs ?? 0) * r.hoeveelheid), 0);

    const regelrijen = regels.map(r => {
      const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const pr = r.prijs != null ? `€\u202F${r.prijs.toFixed(2)}` : "—";
      const tot = r.totaal != null ? `€\u202F${r.totaal.toFixed(2)}` : r.prijs != null ? `€\u202F${(r.prijs * r.hoeveelheid).toFixed(2)}` : "—";
      return `<tr style="border-bottom:1px solid #e4e4e7;">
              <td style="padding:8px 12px;font-size:14px;color:#3f3f46;">${esc(r.omschrijving)}</td>
              <td style="padding:8px 12px;font-size:14px;color:#3f3f46;text-align:right;white-space:nowrap;">${r.hoeveelheid} ${esc(r.eenheid)}</td>
              <td style="padding:8px 12px;font-size:14px;color:#3f3f46;text-align:right;white-space:nowrap;">${pr}</td>
              <td style="padding:8px 12px;font-size:14px;color:#3f3f46;text-align:right;white-space:nowrap;font-weight:500;">${tot}</td>
            </tr>`;
    }).join("\n");

    const berichtBlok = body.bericht?.trim()
      ? `<div style="margin-top:20px;padding:12px 16px;background:#f4f4f5;border-left:4px solid #F23B0D;border-radius:4px;">
               <p style="margin:0;font-size:14px;color:#3f3f46;font-style:italic;">${body.bericht.trim().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</p>
             </div>`
      : "";

    const html = `<!DOCTYPE html>
<html lang="nl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Inkoopbon ${bon.bonNummer ?? ""}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:system-ui,-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.12);">
        <tr>
          <td style="background:#212631;padding:28px 40px;text-align:center;">
            <p style="margin:0;">
              <span style="display:inline-block;width:24px;height:24px;background:#F23B0D;border-radius:5px;vertical-align:middle;margin-right:8px;"></span>
              <span style="color:#fff;font-size:16px;font-weight:700;vertical-align:middle;">FPS Connect</span>
            </p>
            <p style="margin:8px 0 0;color:rgba(255,255,255,.55);font-size:12px;">Brandpreventieve voorzieningen</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 40px 0;">
            <h1 style="margin:0 0 4px;font-size:20px;font-weight:700;color:#18181b;">Inkoopbon${bon.bonNummer ? ` ${bon.bonNummer}` : ""}</h1>
            <p style="margin:0 0 20px;font-size:13px;color:#71717a;">Datum: ${datum}${leverdatum ? ` &bull; Gewenste leverdatum: ${leverdatum}` : ""}</p>
            ${opdracht ? `<p style="margin:0 0 8px;font-size:14px;color:#3f3f46;"><strong>Project:</strong> ${opdracht.titel}</p>` : ""}
            <p style="margin:0 0 20px;font-size:14px;color:#3f3f46;"><strong>Leverancier:</strong> ${bon.leverancier}</p>
            ${berichtBlok}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 40px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e4e4e7;border-radius:6px;overflow:hidden;">
              <thead>
                <tr style="background:#f4f4f5;">
                  <th style="padding:10px 12px;font-size:12px;font-weight:600;color:#71717a;text-align:left;border-bottom:1px solid #e4e4e7;">Omschrijving</th>
                  <th style="padding:10px 12px;font-size:12px;font-weight:600;color:#71717a;text-align:right;border-bottom:1px solid #e4e4e7;">Hoeveelheid</th>
                  <th style="padding:10px 12px;font-size:12px;font-weight:600;color:#71717a;text-align:right;border-bottom:1px solid #e4e4e7;">Prijs</th>
                  <th style="padding:10px 12px;font-size:12px;font-weight:600;color:#71717a;text-align:right;border-bottom:1px solid #e4e4e7;">Totaal</th>
                </tr>
              </thead>
              <tbody>${regelrijen}</tbody>
              ${totaal > 0 ? `<tfoot>
                <tr style="background:#f4f4f5;">
                  <td colspan="3" style="padding:10px 12px;font-size:14px;font-weight:600;color:#18181b;text-align:right;">Totaal</td>
                  <td style="padding:10px 12px;font-size:14px;font-weight:700;color:#18181b;text-align:right;">€\u202F${totaal.toFixed(2)}</td>
                </tr>
              </tfoot>` : ""}
            </table>
            ${bon.opmerkingen ? `<p style="margin:16px 0 0;font-size:13px;color:#71717a;"><strong>Opmerkingen:</strong> ${bon.opmerkingen}</p>` : ""}
          </td>
        </tr>
        <tr>
          <td style="background:#f4f4f5;padding:20px 40px;border-top:1px solid #e4e4e7;">
            <p style="margin:0;font-size:12px;color:#71717a;text-align:center;">Dit bericht is verstuurd door FPS Connect &bull; Reacties graag per e-mail</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const userId = req.session?.userId as number | undefined;

    if (!isGeconfigureerd()) {
      // Dev-modus: markeer als verzonden zonder echte mail te sturen
      logger.warn({ bonId, email }, "E-mailservice niet geconfigureerd — inkoopbon niet verzonden");
    } else {
      await verstuurMail({
        naarEmail: email,
        naarNaam: bon.leverancier,
        onderwerp: `Inkoopbon${bon.bonNummer ? ` ${bon.bonNummer}` : ""} — ${opdracht?.titel ?? "FPS Connect"}`,
        html,
        soort: "inkoopbon",
        verstuurdDoorId: userId ?? null,
      });
    }

    const nieuweStatus = bon.status === "concept" || bon.status === "goedgekeurd" ? "besteld" : bon.status;

    const [updated] = await db.update(inkoopbonnenTable)
      .set({
        verzondenOp: new Date(),
        verzondenNaar: email,
        status: nieuweStatus,
        bijgewerktOp: new Date(),
      })
      .where(eq(inkoopbonnenTable.id, bonId))
      .returning();

    const updatedRegels = await db.select().from(inkoopbonRegelsTable)
      .where(eq(inkoopbonRegelsTable.inkoopbonId, bonId))
      .orderBy(asc(inkoopbonRegelsTable.volgorde));

    res.json(mapInkoopbon(updated, updatedRegels));
  } catch (err) {
    logger.error({ err }, "verzendInkoopbon fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── GET /opdrachten/:id/uitvoeringsplanning ───────────────────────────────

router.get("/opdrachten/:id/uitvoeringsplanning", lezen, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  try {
    const [plan] = await db.select().from(uitvoeringsplannenTable)
      .where(eq(uitvoeringsplannenTable.opdrachtId, id));
    if (!plan) { res.status(404).json({ error: "Nog geen uitvoeringsplanning" }); return; }

    const taken = await db.select().from(uitvoeringsplanTakenTable)
      .where(eq(uitvoeringsplanTakenTable.uitvoeringsplanId, plan.id))
      .orderBy(asc(uitvoeringsplanTakenTable.volgorde), asc(uitvoeringsplanTakenTable.id));

    res.json(mapUitvoeringsplan(plan, taken));
  } catch (err) {
    logger.error({ err }, "getUitvoeringsplanning fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── POST /opdrachten/:id/uitvoeringsplanning/genereer ─────────────────────

router.post("/opdrachten/:id/uitvoeringsplanning/genereer", schrijven, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  try {
    const [opdracht] = await db.select().from(opdrachtenTable).where(eq(opdrachtenTable.id, id));
    if (!opdracht) { res.status(404).json({ error: "Opdracht niet gevonden" }); return; }

    const [begroting] = await db.select().from(projectBegrotingenTable)
      .where(eq(projectBegrotingenTable.opdrachtId, id));
    if (!begroting) { res.status(404).json({ error: "Werkbegroting niet gevonden" }); return; }

    const regels = await db.select().from(werkbegrotingRegelsTable)
      .where(eq(werkbegrotingRegelsTable.begrotingId, begroting.id))
      .orderBy(asc(werkbegrotingRegelsTable.id));

    // Bestaand plan verwijderen
    const [bestaand] = await db.select().from(uitvoeringsplannenTable)
      .where(eq(uitvoeringsplannenTable.opdrachtId, id));
    if (bestaand) {
      await db.delete(uitvoeringsplanTakenTable).where(eq(uitvoeringsplanTakenTable.uitvoeringsplanId, bestaand.id));
      await db.delete(uitvoeringsplannenTable).where(eq(uitvoeringsplannenTable.id, bestaand.id));
    }

    interface AiTaak {
      fase: string;
      omschrijving: string;
      discipline: string;
      duur_dagen: number;
      benodigde_medewerkers: number;
      urenbegroting: number;
      materiaal_moment: string | null;
      motivatie: string;
    }

    interface AiUitvoeringsResult {
      samenvatting: string;
      totaal_weken: number;
      startdatum_advies: string | null;
      taken: AiTaak[];
    }

    let aiResultaat: AiUitvoeringsResult | null = null;
    let aiGegenereerd = false;

    if (heeftGateway()) {
      const arbeidRegels = regels.filter(r => r.categorie === "arbeid");
      const materiaalRegels = regels.filter(r => r.categorie === "materiaal");

      const prompt = `Je bent een werkvoorbereider bij een brandpreventie-installatiebedrijf in Nederland.
Maak een concept uitvoeringsplanning voor de volgende opdracht.

OPDRACHT: ${opdracht.titel}
WERKNUMMER: ${opdracht.werknummer ?? "n.v.t."}

ARBEID (${arbeidRegels.length} regels, totaal ${begroting.totaalArbeidUren} uur):
${arbeidRegels.map(r => `- ${r.omschrijving}: ${r.hoeveelheid} ${r.eenheid} @ ${r.tarief}/uur`).join('\n')}

MATERIAAL (${materiaalRegels.length} artikelen, totaal €${begroting.totaalMateriaalBedrag}):
${materiaalRegels.slice(0, 15).map(r => `- ${r.omschrijving}: ${r.hoeveelheid} ${r.eenheid}`).join('\n')}

Brandpreventie disciplines: Brandweerring, Doorvoering, Brandklep, Manchet, Coating, Branddeur, Overige.

Maak een logische gefaseerde uitvoeringsplanning. Typische fasen:
- Fase 1: Voorbereiding (materiaal controleren, tekeningen bestuderen, LMRA)
- Fase 2: Uitvoering per discipline/locatie
- Fase N: Oplevering en inspectie

Geef je planning als JSON:
{
  "samenvatting": "korte beschrijving aanpak",
  "totaal_weken": 0,
  "startdatum_advies": null,
  "taken": [
    {
      "fase": "Fase 1 — Voorbereiding",
      "omschrijving": "beschrijving van de taak",
      "discipline": "discipline of 'Algemeen'",
      "duur_dagen": 1,
      "benodigde_medewerkers": 1,
      "urenbegroting": 8.0,
      "materiaal_moment": "welk materiaal wanneer nodig (of null)",
      "motivatie": "korte uitleg"
    }
  ]
}`;

      try {
        const uitvoerResultaat = await aiGateway.chat("default", {
          messages: [
            { role: "system", content: "Je bent een werkvoorbereider brandpreventie. Geef altijd valide JSON terug." },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
          max_tokens: 3000,
        }, undefined, {
          module: "werkvoorbereiding",
          functie: "uitvoeringsplan-genereer",
          gebruikerId: req.session.userId ?? null,
          project_id: id,
        });
        if (uitvoerResultaat.ok) {
          aiResultaat = JSON.parse(uitvoerResultaat.inhoud) as AiUitvoeringsResult;
          aiGegenereerd = true;
        }
      } catch (aiErr) {
        logger.warn({ aiErr }, "AI uitvoeringsplanning genereer mislukt — fallback");
      }
    }

    // Plan aanmaken
    const [plan] = await db.insert(uitvoeringsplannenTable).values({
      opdrachtId: id,
      status: "concept",
      aiGegenereerd,
      aiGegeneerdOp: aiGegenereerd ? new Date() : null,
      aiSamenvatting: aiResultaat?.samenvatting ?? null,
      totaalWeken: aiResultaat?.totaal_weken ?? null,
      startdatum: aiResultaat?.startdatum_advies ?? null,
    }).returning();

    // Taken aanmaken
    if (aiResultaat?.taken && aiResultaat.taken.length > 0) {
      await db.insert(uitvoeringsplanTakenTable).values(
        aiResultaat.taken.map((t: AiTaak, i: number) => ({
          uitvoeringsplanId: plan.id,
          volgorde: i,
          fase: t.fase ?? null,
          omschrijving: t.omschrijving,
          discipline: t.discipline ?? null,
          duurDagen: t.duur_dagen ?? null,
          benodigdeMedewerkers: t.benodigde_medewerkers ?? null,
          urenbegroting: t.urenbegroting ?? null,
          materiaalMoment: t.materiaal_moment ?? null,
          aiMotivatie: t.motivatie ?? null,
          aiGegenereerd: true,
        }))
      );
    }

    const taken = await db.select().from(uitvoeringsplanTakenTable)
      .where(eq(uitvoeringsplanTakenTable.uitvoeringsplanId, plan.id))
      .orderBy(asc(uitvoeringsplanTakenTable.volgorde));

    res.json(mapUitvoeringsplan(plan, taken));
  } catch (err) {
    logger.error({ err }, "genereerUitvoeringsplanning fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── POST /opdrachten/:id/uitvoeringsplanning/vaststellen ──────────────────

router.post("/opdrachten/:id/uitvoeringsplanning/vaststellen", schrijven, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  try {
    const [plan] = await db.select().from(uitvoeringsplannenTable)
      .where(eq(uitvoeringsplannenTable.opdrachtId, id));
    if (!plan) { res.status(404).json({ error: "Uitvoeringsplanning niet gevonden" }); return; }

    const userId = req.session?.userId as number | undefined;
    const [updated] = await db.update(uitvoeringsplannenTable)
      .set({
        status: "gereed_voor_planning",
        vastgesteldOp: new Date(),
        vastgesteldDoorId: userId ?? null,
        bijgewerktOp: new Date(),
      })
      .where(eq(uitvoeringsplannenTable.id, plan.id))
      .returning();

    const taken = await db.select().from(uitvoeringsplanTakenTable)
      .where(eq(uitvoeringsplanTakenTable.uitvoeringsplanId, plan.id))
      .orderBy(asc(uitvoeringsplanTakenTable.volgorde));

    res.json(mapUitvoeringsplan(updated, taken));
  } catch (err) {
    logger.error({ err }, "vaststellenUitvoeringsplanning fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── PATCH /opdrachten/:id/uitvoeringsplanning/taken/:taakId ──────────────

router.patch("/opdrachten/:id/uitvoeringsplanning/taken/:taakId", schrijven, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  const taakId = parseInt(String(req.params.taakId), 10);
  if (isNaN(id) || isNaN(taakId)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  const body = req.body as Record<string, unknown>;

  try {
    const [plan] = await db.select().from(uitvoeringsplannenTable)
      .where(eq(uitvoeringsplannenTable.opdrachtId, id));
    if (!plan) { res.status(404).json({ error: "Uitvoeringsplanning niet gevonden" }); return; }

    const updates: Record<string, unknown> = { bijgewerktOp: new Date() };
    const bodyMap: Record<string, string> = {
      fase: "fase",
      omschrijving: "omschrijving",
      discipline: "discipline",
      duur_dagen: "duurDagen",
      benodigde_medewerkers: "benodigdeMedewerkers",
      urenbegroting: "urenbegroting",
      materiaal_moment: "materiaalMoment",
      opmerkingen: "opmerkingen",
    };

    for (const [bodyKey, dbKey] of Object.entries(bodyMap)) {
      if (body[bodyKey] !== undefined) updates[dbKey] = body[bodyKey];
    }

    const [updated] = await db.update(uitvoeringsplanTakenTable)
      .set(updates as Partial<typeof uitvoeringsplanTakenTable.$inferInsert>)
      .where(and(eq(uitvoeringsplanTakenTable.id, taakId), eq(uitvoeringsplanTakenTable.uitvoeringsplanId, plan.id)))
      .returning();
    if (!updated) { res.status(404).json({ error: "Taak niet gevonden" }); return; }

    res.json(mapUitvoeringsplanTaak(updated));
  } catch (err) {
    logger.error({ err }, "patchUitvoeringsplanTaak fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── POST /opdrachten/:id/inkoopplanning/regels ────────────────────────────
// Handmatig een vrije inkoop-regel toevoegen (bron='vrij').
// Maakt een inkoopplan aan als dat nog niet bestaat.

router.post("/opdrachten/:id/inkoopplanning/regels", schrijven, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  const body = req.body as Record<string, unknown>;
  const omschrijving = String(body.omschrijving ?? "").trim();
  if (!omschrijving) { res.status(400).json({ error: "Omschrijving is verplicht" }); return; }

  try {
    let [plan] = await db.select().from(inkoopplannenTable)
      .where(eq(inkoopplannenTable.opdrachtId, id));

    if (!plan) {
      [plan] = await db.insert(inkoopplannenTable).values({
        opdrachtId: id,
        status: "concept",
        aiGegenereerd: false,
        bijgewerktOp: new Date(),
      }).returning();
    }

    await db.insert(inkoopplanRegelsTable).values({
      inkoopplanId: plan.id,
      omschrijving,
      hoeveelheid: typeof body.hoeveelheid === "number" ? body.hoeveelheid : 1,
      eenheid: typeof body.eenheid === "string" ? body.eenheid : "st",
      leverancier: typeof body.leverancier === "string" ? body.leverancier : undefined,
      inkoopprijs: typeof body.inkoopprijs === "number" ? body.inkoopprijs : undefined,
      gewensteLeverdatum: typeof body.gewenste_leverdatum === "string" ? body.gewenste_leverdatum : undefined,
      type: typeof body.type === "string" ? body.type : "standaard",
      opmerkingen: typeof body.opmerkingen === "string" ? body.opmerkingen : undefined,
      bron: "vrij",
      bijgewerktOp: new Date(),
    });

    const regels = await db.select().from(inkoopplanRegelsTable)
      .where(eq(inkoopplanRegelsTable.inkoopplanId, plan.id))
      .orderBy(asc(inkoopplanRegelsTable.volgorde), asc(inkoopplanRegelsTable.id));

    res.status(201).json(mapInkoopplan(plan, regels));
  } catch (err) {
    logger.error({ err }, "createInkoopplanRegel fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── DELETE /opdrachten/:id/inkoopplanning/regels/:regelId ─────────────────

router.delete("/opdrachten/:id/inkoopplanning/regels/:regelId", schrijven, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  const regelId = parseInt(String(req.params.regelId), 10);
  if (isNaN(id) || isNaN(regelId)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  try {
    const [plan] = await db.select().from(inkoopplannenTable)
      .where(eq(inkoopplannenTable.opdrachtId, id));
    if (!plan) { res.status(404).json({ error: "Inkoopplanning niet gevonden" }); return; }

    const deleted = await db.delete(inkoopplanRegelsTable)
      .where(and(eq(inkoopplanRegelsTable.id, regelId), eq(inkoopplanRegelsTable.inkoopplanId, plan.id)))
      .returning();
    if (!deleted.length) { res.status(404).json({ error: "Regel niet gevonden" }); return; }

    res.status(204).send();
  } catch (err) {
    logger.error({ err }, "deleteInkoopplanRegel fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── GET /opdrachten/:id/onderaanneming ────────────────────────────────────

router.get("/opdrachten/:id/onderaanneming", lezen, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  try {
    const orders = await db.select().from(onderaannemeOrdersTable)
      .where(eq(onderaannemeOrdersTable.opdrachtId, id))
      .orderBy(asc(onderaannemeOrdersTable.id));
    res.json(orders.map(mapOnderaannemer));
  } catch (err) {
    logger.error({ err }, "listOnderaannemeOrders fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── POST /opdrachten/:id/onderaanneming ───────────────────────────────────

router.post("/opdrachten/:id/onderaanneming", schrijven, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  const body = req.body as Record<string, unknown>;
  const omschrijving = String(body.omschrijving ?? "").trim();
  if (!omschrijving) { res.status(400).json({ error: "Omschrijving is verplicht" }); return; }

  try {
    const [order] = await db.insert(onderaannemeOrdersTable).values({
      opdrachtId: id,
      omschrijving,
      bedrijf: typeof body.bedrijf === "string" ? body.bedrijf : undefined,
      contactpersoon: typeof body.contactpersoon === "string" ? body.contactpersoon : undefined,
      werkzaamheden: typeof body.werkzaamheden === "string" ? body.werkzaamheden : undefined,
      bedragExclBtw: typeof body.bedrag_excl_btw === "number" ? body.bedrag_excl_btw : undefined,
      btwPercentage: typeof body.btw_percentage === "number" ? body.btw_percentage : 21,
      gewensteStartdatum: typeof body.gewenste_startdatum === "string" ? body.gewenste_startdatum : undefined,
      gewensteEinddatum: typeof body.gewenste_einddatum === "string" ? body.gewenste_einddatum : undefined,
      opmerkingen: typeof body.opmerkingen === "string" ? body.opmerkingen : undefined,
      bijgewerktOp: new Date(),
    }).returning();
    res.status(201).json(mapOnderaannemer(order));
  } catch (err) {
    logger.error({ err }, "createOnderaannemeOrder fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── PATCH /opdrachten/:id/onderaanneming/:orderId ─────────────────────────

router.patch("/opdrachten/:id/onderaanneming/:orderId", schrijven, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  const orderId = parseInt(String(req.params.orderId), 10);
  if (isNaN(id) || isNaN(orderId)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  const body = req.body as Record<string, unknown>;

  try {
    const updates: Record<string, unknown> = { bijgewerktOp: new Date() };
    const bodyMap: Record<string, string> = {
      omschrijving: "omschrijving",
      bedrijf: "bedrijf",
      contactpersoon: "contactpersoon",
      werkzaamheden: "werkzaamheden",
      bedrag_excl_btw: "bedragExclBtw",
      btw_percentage: "btwPercentage",
      status: "status",
      gewenste_startdatum: "gewensteStartdatum",
      gewenste_einddatum: "gewensteEinddatum",
      opmerkingen: "opmerkingen",
    };
    for (const [bodyKey, dbKey] of Object.entries(bodyMap)) {
      if (body[bodyKey] !== undefined) updates[dbKey] = body[bodyKey];
    }

    const [updated] = await db.update(onderaannemeOrdersTable)
      .set(updates as Partial<typeof onderaannemeOrdersTable.$inferInsert>)
      .where(and(eq(onderaannemeOrdersTable.id, orderId), eq(onderaannemeOrdersTable.opdrachtId, id)))
      .returning();
    if (!updated) { res.status(404).json({ error: "Order niet gevonden" }); return; }

    res.json(mapOnderaannemer(updated));
  } catch (err) {
    logger.error({ err }, "patchOnderaannemeOrder fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── DELETE /opdrachten/:id/onderaanneming/:orderId ────────────────────────

router.delete("/opdrachten/:id/onderaanneming/:orderId", schrijven, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  const orderId = parseInt(String(req.params.orderId), 10);
  if (isNaN(id) || isNaN(orderId)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  try {
    const deleted = await db.delete(onderaannemeOrdersTable)
      .where(and(eq(onderaannemeOrdersTable.id, orderId), eq(onderaannemeOrdersTable.opdrachtId, id)))
      .returning();
    if (!deleted.length) { res.status(404).json({ error: "Order niet gevonden" }); return; }
    res.status(204).send();
  } catch (err) {
    logger.error({ err }, "deleteOnderaannemeOrder fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// Exporteer de gebruikers ref zodat de build niet klaagt over import
void gebruikersTable;

export default router;
