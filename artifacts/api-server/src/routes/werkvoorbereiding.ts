// Werkvoorbereiding — AI Inkoopplanning + Uitvoeringsplanning
// Routes: PATCH werkbegroting-regels, inkoopplanning, inkoopbonnen, uitvoeringsplanning
import { Router } from "express";
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
} from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { logger } from "../lib/logger";

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
    volgorde: r.volgorde,
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
    gewenste_leverdatum: bon.gewensteLeverdatum ?? null,
    totaal_bedrag: bon.totaalBedrag ?? null,
    status: bon.status,
    goedgekeurd_op: iso(bon.goedgekeurdOp),
    opmerkingen: bon.opmerkingen ?? null,
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

    const { apiKey, baseUrl } = await getAiClient();

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

    if (apiKey && materiaalRegels.length > 0) {
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
        const aiRes = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: "gpt-4o",
            messages: [
              { role: "system", content: "Je bent een ervaren inkoper brandpreventie. Geef altijd valide JSON terug." },
              { role: "user", content: prompt },
            ],
            response_format: { type: "json_object" },
            max_tokens: 3000,
          }),
          signal: AbortSignal.timeout(35000),
        });

        if (aiRes.ok) {
          const aiJson = await aiRes.json() as { choices: Array<{ message: { content: string } }> };
          aiResultaat = JSON.parse(aiJson.choices[0]?.message?.content ?? "{}") as AiInkoopResult;
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

// ── PATCH /opdrachten/:id/inkoopplanning/inkoopbonnen/:bonId ─────────────

router.patch("/opdrachten/:id/inkoopplanning/inkoopbonnen/:bonId", schrijven, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  const bonId = parseInt(String(req.params.bonId), 10);
  if (isNaN(id) || isNaN(bonId)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  const body = req.body as Record<string, unknown>;

  try {
    const updates: Record<string, unknown> = { bijgewerktOp: new Date() };
    const bodyMap: Record<string, string> = {
      leverancier: "leverancier",
      gewenste_leverdatum: "gewensteLeverdatum",
      status: "status",
      opmerkingen: "opmerkingen",
    };

    const userId = req.session?.userId as number | undefined;

    for (const [bodyKey, dbKey] of Object.entries(bodyMap)) {
      if (body[bodyKey] !== undefined) updates[dbKey] = body[bodyKey];
    }

    // Bij goedkeuring: stel goedgekeurdOp en goedgekeurdDoorId in
    if (body.status === "goedgekeurd") {
      updates.goedgekeurdOp = new Date();
      updates.goedgekeurdDoorId = userId ?? null;
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

    const { apiKey, baseUrl } = await getAiClient();

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

    if (apiKey) {
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
        const aiRes = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: "gpt-4o",
            messages: [
              { role: "system", content: "Je bent een werkvoorbereider brandpreventie. Geef altijd valide JSON terug." },
              { role: "user", content: prompt },
            ],
            response_format: { type: "json_object" },
            max_tokens: 3000,
          }),
          signal: AbortSignal.timeout(35000),
        });

        if (aiRes.ok) {
          const aiJson = await aiRes.json() as { choices: Array<{ message: { content: string } }> };
          aiResultaat = JSON.parse(aiJson.choices[0]?.message?.content ?? "{}") as AiUitvoeringsResult;
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

// Exporteer de gebruikers ref zodat de build niet klaagt over import
void gebruikersTable;

export default router;
