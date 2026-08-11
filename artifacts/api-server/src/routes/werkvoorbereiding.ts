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
  pimModellenTable,
  artikelenTable,
  opdrachtChecklistItemsTable,
  complianceSignalenTable,
  inkoopVersiesTable,
} from "@workspace/db";
import { eq, and, asc, inArray, ilike, sql } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { formatNummer, herzieningsLetter, kenmerkVoorProjectinkoop } from "../lib/kenmerk";
import { maakConceptInkoopbon } from "../lib/inkoopbonService";
import { GeenAkkoordFout } from "../lib/akkoordPoort";
import { verstuurMail, isGeconfigureerd } from "../services/email";
import { aiGateway, heeftGateway } from "../lib/aiGateway";
import { INKOOP_PROMPT, UITVOERINGSPLAN_PROMPT } from "../lib/aiPrompts";
import {
  artikelSleutel,
  bouwInkoopEigenCijfersContext,
  haalInkoopHistorie,
  leveranciersOpsomming,
  MIN_WAARNEMINGEN_INKOOP,
} from "../lib/inkoopEigenCijfers";
import {
  checkVereistGoedkeuring,
  haalGoedgekeurdeAanvraag,
  haalOpenAanvraag,
  maakGoedkeuringActor,
  dienIn,
} from "../services/goedkeuring-engine";

const router = Router();
const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;

// BOUW_01 §1 (René, 09-08-2026): werkvoorbereiding & inkoop vallen onder de
// eigen sleutel 'projecten' (1 = lezen zonder bedragen, 2 = lezen mét
// bedragen, 3 = schrijven).
const lezen    = requireBevoegdheid("projecten", 1);
const schrijven = requireBevoegdheid("projecten", 3);
const metBedragen = requireBevoegdheid("projecten", 2);

// Server-side beslissing welke weergave iemand krijgt (§3.1/§3.2).
function magBedragenZien(req: import("express").Request): boolean {
  const perm = req.permissies;
  if (!perm) return false;
  return perm.isHoofdbeheerder || perm.heeftModuleRecht("projecten", 2);
}

// ── helpers ───────────────────────────────────────────────────────────────────

function mapRegel(r: typeof werkbegrotingRegelsTable.$inferSelect, toonBedragen = true) {
  return {
    id: r.id,
    begroting_id: r.begrotingId,
    calc_regel_id: r.calcRegelId ?? null,
    categorie: r.categorie,
    omschrijving: r.omschrijving,
    eenheid: r.eenheid,
    hoeveelheid: r.hoeveelheid,
    tarief: toonBedragen ? r.tarief : null,
    totaal: toonBedragen ? r.totaal : null,
    hoofdstuk: r.hoofdstuk,
    ai_inkoop_voorstel: (r as Record<string,unknown>).aiInkoopVoorstel ?? null,
    ai_arbeid_voorstel: (r as Record<string,unknown>).aiArbeidVoorstel ?? null,
  };
}

function mapInkoopRegel(
  r: typeof inkoopplanRegelsTable.$inferSelect,
  werkpakketSleutel?: string | null,
  toonBedragen = true,
) {
  return {
    id: r.id,
    inkoopplan_id: r.inkoopplanId,
    werkbegroting_regel_id: r.werkbegrotingRegelId ?? null,
    werkpakket_sleutel: werkpakketSleutel ?? null,
    omschrijving: r.omschrijving,
    hoeveelheid: r.hoeveelheid,
    eenheid: r.eenheid,
    type: r.type,
    leverancier: r.leverancier ?? null,
    aanbevolen_leverancier: r.aanbevolenLeverancier ?? null,
    calc_prijs: toonBedragen ? (r.calcPrijs ?? null) : null,
    inkoopprijs_verwacht: toonBedragen ? (r.inkoopprijsVerwacht ?? null) : null,
    inkoopprijs: toonBedragen ? (r.inkoopprijs ?? null) : null,
    besparing_per_eenheid: toonBedragen ? (r.besparingPerEenheid ?? null) : null,
    besparing: toonBedragen ? (r.besparing ?? null) : null,
    levertijd_weken: r.levertijdWeken ?? null,
    gewenste_leverdatum: r.gewensteLeverdatum ?? null,
    besteldatum: r.besteldatum ?? null,
    status: r.status,
    ai_motivatie: r.aiMotivatie ?? null,
    opmerkingen: r.opmerkingen ?? null,
    bron: r.bron,
    prijs_bron: (r as Record<string, unknown>).prijsBron ?? "onbekend",
    prijs_geldig_tot: (r as Record<string, unknown>).prijsGeldigTot ?? null,
    volgorde: r.volgorde,
    aangemaakt_op: iso(r.aangemaaktOp)!,
    bijgewerkt_op: iso(r.bijgewerktOp)!,
  };
}

async function buildHoofdstukMap(
  regels: typeof inkoopplanRegelsTable.$inferSelect[],
): Promise<Map<number, string | null>> {
  const regelIds = regels
    .map(r => r.werkbegrotingRegelId)
    .filter((x): x is number => x != null);
  const map = new Map<number, string | null>();
  if (regelIds.length === 0) return map;
  const wbRegels = await db
    .select({ id: werkbegrotingRegelsTable.id, hoofdstuk: werkbegrotingRegelsTable.hoofdstuk })
    .from(werkbegrotingRegelsTable)
    .where(inArray(werkbegrotingRegelsTable.id, regelIds));
  for (const wb of wbRegels) map.set(wb.id, wb.hoofdstuk ?? null);
  return map;
}

// AI-inkoopadviezen saneren: alleen gevalideerde velden doorlaten (server-side clamp)
const ADVIES_CATEGORIEEN = new Set(["prijs", "leverancier", "planning", "risico", "algemeen"]);

interface InkoopAdvies {
  categorie: string;
  tekst: string;
  besparing_indicatie: number | null;
  regel_omschrijving: string | null;
}

function saneerInkoopAdviezen(ruw: unknown): InkoopAdvies[] {
  if (!Array.isArray(ruw)) return [];
  const resultaat: InkoopAdvies[] = [];
  for (const item of ruw) {
    if (resultaat.length >= 6) break;
    if (item == null || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const tekst = typeof obj.tekst === "string" ? obj.tekst.trim().slice(0, 600) : "";
    if (!tekst) continue;
    const categorie = typeof obj.categorie === "string" && ADVIES_CATEGORIEEN.has(obj.categorie)
      ? obj.categorie
      : "algemeen";
    const besparing = typeof obj.besparing_indicatie === "number" && isFinite(obj.besparing_indicatie)
      ? Math.max(0, Math.round(obj.besparing_indicatie * 100) / 100)
      : null;
    const regelOmschrijving = typeof obj.regel_omschrijving === "string" && obj.regel_omschrijving.trim()
      ? obj.regel_omschrijving.trim().slice(0, 200)
      : null;
    resultaat.push({ categorie, tekst, besparing_indicatie: besparing, regel_omschrijving: regelOmschrijving });
  }
  return resultaat;
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
  hoofdstukMap?: Map<number, string | null>,
  toonBedragen = true,
) {
  return {
    id: plan.id,
    opdracht_id: plan.opdrachtId,
    status: plan.status,
    ai_gegenereerd: plan.aiGegenereerd,
    ai_gegenereerd_op: iso(plan.aiGegeneerdOp),
    ai_samenvatting: plan.aiSamenvatting ?? null,
    totale_besparing: toonBedragen ? (plan.totaleBesparing ?? null) : null,
    vastgesteld_op: iso(plan.vastgesteldOp),
    opmerkingen: plan.opmerkingen ?? null,
    aangemaakt_op: iso(plan.aangemaaktOp)!,
    bijgewerkt_op: iso(plan.bijgewerktOp)!,
    regels: regels.map(r =>
      mapInkoopRegel(
        r,
        r.werkbegrotingRegelId && hoofdstukMap
          ? (hoofdstukMap.get(r.werkbegrotingRegelId) ?? null)
          : null,
        toonBedragen,
      )
    ),
  };
}

function mapBonRegel(r: typeof inkoopbonRegelsTable.$inferSelect, toonBedragen = true) {
  return {
    id: r.id,
    inkoopbon_id: r.inkoopbonId,
    inkoopplan_regel_id: r.inkoopplanRegelId ?? null,
    omschrijving: r.omschrijving,
    hoeveelheid: r.hoeveelheid,
    eenheid: r.eenheid,
    prijs: toonBedragen ? (r.prijs ?? null) : null,
    totaal: toonBedragen ? (r.totaal ?? null) : null,
    volgorde: r.volgorde,
  };
}

function mapInkoopbon(
  bon: typeof inkoopbonnenTable.$inferSelect,
  regels: typeof inkoopbonRegelsTable.$inferSelect[],
  kenmerk?: string | null,
  toonBedragen = true,
) {
  return {
    id: bon.id,
    inkoopplan_id: bon.inkoopplanId ?? null,
    opdracht_id: bon.opdrachtId,
    // NUMMER_01: I-nummer uit de gedeelde reeks + kenmerk O405/I088[a]
    nummer: bon.nummer,
    offerte_id: bon.offerteId ?? null,
    herziening: bon.herziening,
    kenmerk: kenmerk ?? null,
    bon_nummer: bon.bonNummer ?? null,
    leverancier: bon.leverancier,
    leverancier_id: bon.leverancierId ?? null,
    gewenste_leverdatum: bon.gewensteLeverdatum ?? null,
    totaal_bedrag: toonBedragen ? (bon.totaalBedrag ?? null) : null,
    status: bon.status,
    goedgekeurd_op: iso(bon.goedgekeurdOp),
    opmerkingen: bon.opmerkingen ?? null,
    verzonden_op: iso(bon.verzondenOp),
    verzonden_naar: bon.verzondenNaar ?? null,
    ai_suggestie: bon.aiSuggestie,
    ai_motivatie: bon.aiMotivatie ?? null,
    aangemaakt_op: iso(bon.aangemaaktOp)!,
    bijgewerkt_op: iso(bon.bijgewerktOp)!,
    regels: regels.map((r) => mapBonRegel(r, toonBedragen)),
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

// ── Vooraf-regelen-checklist (WVB_01) ────────────────────────────────────────
// Expliciete regel-het-vooraf-items per opdracht: toegang, vergunning, V&G,
// hoogwerker. Afvinken met audit (wie, wanneer).

const STANDAARD_CHECKLIST: { label: string; categorie: string }[] = [
  { label: "Toegang tot het werk geregeld (sleutels/afspraken)", categorie: "toegang" },
  { label: "Vergunning(en) aanwezig of niet vereist", categorie: "vergunning" },
  { label: "V&G-plan beschikbaar en gedeeld", categorie: "veiligheid" },
  { label: "Hoogwerker / materieel gereserveerd", categorie: "materieel" },
];

const CHECKLIST_CATEGORIEEN = new Set(["toegang", "vergunning", "veiligheid", "materieel", "overig"]);

function mapChecklistItem(
  item: typeof opdrachtChecklistItemsTable.$inferSelect,
  naam?: string | null,
) {
  return {
    id: item.id,
    opdracht_id: item.opdrachtId,
    label: item.label,
    categorie: item.categorie,
    afgevinkt: item.afgevinkt,
    afgevinkt_door: naam ?? null,
    afgevinkt_op: iso(item.afgevinktOp),
    volgorde: item.volgorde,
  };
}

async function checklistMetNamen(opdrachtId: number) {
  const rijen = await db
    .select({ item: opdrachtChecklistItemsTable, naam: gebruikersTable.naam })
    .from(opdrachtChecklistItemsTable)
    .leftJoin(gebruikersTable, eq(opdrachtChecklistItemsTable.afgevinktDoorId, gebruikersTable.id))
    .where(eq(opdrachtChecklistItemsTable.opdrachtId, opdrachtId))
    .orderBy(asc(opdrachtChecklistItemsTable.volgorde), asc(opdrachtChecklistItemsTable.id));
  return rijen.map(r => mapChecklistItem(r.item, r.naam));
}

router.get("/opdrachten/:id/checklist", lezen, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }
  res.json(await checklistMetNamen(id));
});

router.post("/opdrachten/:id/checklist/initialiseer", schrijven, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }
  const [opdracht] = await db.select().from(opdrachtenTable).where(eq(opdrachtenTable.id, id));
  if (!opdracht) { res.status(404).json({ error: "Opdracht niet gevonden" }); return; }
  const bestaand = await db.select().from(opdrachtChecklistItemsTable)
    .where(eq(opdrachtChecklistItemsTable.opdrachtId, id));
  if (bestaand.length === 0) {
    await db.insert(opdrachtChecklistItemsTable).values(
      STANDAARD_CHECKLIST.map((s, i) => ({ opdrachtId: id, label: s.label, categorie: s.categorie, volgorde: i })),
    );
  }
  res.json(await checklistMetNamen(id));
});

router.post("/opdrachten/:id/checklist", schrijven, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }
  const [opdracht] = await db.select().from(opdrachtenTable).where(eq(opdrachtenTable.id, id));
  if (!opdracht) { res.status(404).json({ error: "Opdracht niet gevonden" }); return; }
  const { label, categorie, volgorde } = req.body as Record<string, unknown>;
  if (typeof label !== "string" || label.trim().length === 0) {
    res.status(400).json({ error: "Label is verplicht" }); return;
  }
  const cat = typeof categorie === "string" && CHECKLIST_CATEGORIEEN.has(categorie) ? categorie : "overig";
  const [item] = await db.insert(opdrachtChecklistItemsTable).values({
    opdrachtId: id,
    label: label.trim(),
    categorie: cat,
    volgorde: typeof volgorde === "number" ? volgorde : 99,
  }).returning();
  res.status(201).json(mapChecklistItem(item));
});

router.patch("/opdrachten/:id/checklist/:itemId", schrijven, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  const itemId = parseInt(String(req.params.itemId), 10);
  if (isNaN(id) || isNaN(itemId)) { res.status(400).json({ error: "Ongeldig id" }); return; }
  const { label, categorie, afgevinkt, volgorde } = req.body as Record<string, unknown>;
  const updates: Partial<typeof opdrachtChecklistItemsTable.$inferInsert> = { bijgewerktOp: new Date() };
  if (typeof label === "string" && label.trim().length > 0) updates.label = label.trim();
  if (typeof categorie === "string" && CHECKLIST_CATEGORIEEN.has(categorie)) updates.categorie = categorie;
  if (typeof volgorde === "number") updates.volgorde = volgorde;
  if (typeof afgevinkt === "boolean") {
    updates.afgevinkt = afgevinkt;
    updates.afgevinktDoorId = afgevinkt ? (req.session.userId ?? null) : null;
    updates.afgevinktOp = afgevinkt ? new Date() : null;
  }
  const [item] = await db.update(opdrachtChecklistItemsTable)
    .set(updates)
    .where(and(eq(opdrachtChecklistItemsTable.id, itemId), eq(opdrachtChecklistItemsTable.opdrachtId, id)))
    .returning();
  if (!item) { res.status(404).json({ error: "Checklist-item niet gevonden" }); return; }
  let naam: string | null = null;
  if (item.afgevinktDoorId) {
    const [g] = await db.select({ naam: gebruikersTable.naam }).from(gebruikersTable)
      .where(eq(gebruikersTable.id, item.afgevinktDoorId));
    naam = g?.naam ?? null;
  }
  res.json(mapChecklistItem(item, naam));
});

router.delete("/opdrachten/:id/checklist/:itemId", schrijven, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  const itemId = parseInt(String(req.params.itemId), 10);
  if (isNaN(id) || isNaN(itemId)) { res.status(400).json({ error: "Ongeldig id" }); return; }
  const verwijderd = await db.delete(opdrachtChecklistItemsTable)
    .where(and(eq(opdrachtChecklistItemsTable.id, itemId), eq(opdrachtChecklistItemsTable.opdrachtId, id)))
    .returning();
  if (verwijderd.length === 0) { res.status(404).json({ error: "Checklist-item niet gevonden" }); return; }
  res.status(204).end();
});

// ── PATCH /opdrachten/:id/werkbegroting/regels/:regelId ────────────────────

router.patch("/opdrachten/:id/werkbegroting/regels/:regelId", schrijven, async (req, res): Promise<void> => {
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

router.get("/opdrachten/:id/inkoopplanning", lezen, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  try {
    const [plan] = await db.select().from(inkoopplannenTable)
      .where(eq(inkoopplannenTable.opdrachtId, id));
    if (!plan) { res.status(404).json({ error: "Nog geen inkoopplanning" }); return; }

    const regels = await db.select().from(inkoopplanRegelsTable)
      .where(eq(inkoopplanRegelsTable.inkoopplanId, plan.id))
      .orderBy(asc(inkoopplanRegelsTable.volgorde), asc(inkoopplanRegelsTable.id));

    const hoofdstukMap = await buildHoofdstukMap(regels);
    res.json(mapInkoopplan(plan, regels, hoofdstukMap, magBedragenZien(req)));
  } catch (err) {
    logger.error({ err }, "getInkoopplanning fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── GET /opdrachten/:id/inkoopcoach ────────────────────────────────────────
// Geaggregeerd overzicht van het inkooptraject per opdracht: werkbegroting-status,
// inkoopplan (prijsbron-verdeling, verlopen prijzen, besparing), bestellingen
// (statusverdeling, verlopen/naderende leverdatums) en AI-aandachtspunten.
// Signaleert alleen; de mens blijft in control.

router.get("/opdrachten/:id/inkoopcoach", metBedragen, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  try {
    const [plan] = await db.select().from(inkoopplannenTable)
      .where(eq(inkoopplannenTable.opdrachtId, id));

    const regels = plan
      ? await db.select().from(inkoopplanRegelsTable)
          .where(eq(inkoopplanRegelsTable.inkoopplanId, plan.id))
      : [];

    const bonnen = await db.select().from(inkoopbonnenTable)
      .where(eq(inkoopbonnenTable.opdrachtId, id));

    const nu = new Date();
    const isVerlopen = (d: string | null): boolean => {
      if (!d) return false;
      const dt = new Date(d);
      if (isNaN(dt.getTime())) return false;
      dt.setHours(23, 59, 59, 999);
      return dt.getTime() < nu.getTime();
    };
    const dagenTot = (d: string): number => {
      const dt = new Date(d);
      const a = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
      const b = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate());
      return Math.round((a.getTime() - b.getTime()) / 86_400_000);
    };

    // Prijsbron-verdeling
    const prijsbronVerdeling: Record<string, number> = { jaarprijslijst: 0, inkoophistorie: 0, leveranciersofferte: 0, vrij: 0, onbekend: 0 };
    let verlopenPrijzen = 0;
    let totaleBesparing = 0;
    for (const r of regels) {
      const pb = r.prijsBron ?? "onbekend";
      prijsbronVerdeling[pb] = (prijsbronVerdeling[pb] ?? 0) + 1;
      if (isVerlopen(r.prijsGeldigTot)) verlopenPrijzen += 1;
      if (r.besparing != null) totaleBesparing += r.besparing;
    }

    // Bestellingen-statusverdeling + leverbewaking
    const bonStatusVerdeling: Record<string, number> = {};
    let bestellingenVerlopen = 0;
    let bestellingenAankomend = 0;
    for (const b of bonnen) {
      bonStatusVerdeling[b.status] = (bonStatusVerdeling[b.status] ?? 0) + 1;
      if (b.status === "besteld" && b.gewensteLeverdatum) {
        const dag = dagenTot(b.gewensteLeverdatum);
        if (dag < 0) bestellingenVerlopen += 1;
        else if (dag <= 3) bestellingenAankomend += 1;
      }
    }

    // AI-aandachtspunten (afgeleid, deterministisch — geen autonome AI-actie)
    const aandachtspunten: Array<{ niveau: string; tekst: string }> = [];
    if (!plan) {
      aandachtspunten.push({ niveau: "info", tekst: "Er is nog geen inkoopplanning gegenereerd voor deze opdracht." });
    } else {
      if (regels.length === 0) {
        aandachtspunten.push({ niveau: "info", tekst: "De inkoopplanning bevat nog geen regels." });
      }
      if (verlopenPrijzen > 0) {
        aandachtspunten.push({ niveau: "waarschuwing", tekst: `${verlopenPrijzen} regel${verlopenPrijzen === 1 ? "" : "s"} met een verlopen prijs; vraag een actuele prijs op.` });
      }
      const vrijeEnOnbekend = (prijsbronVerdeling.vrij ?? 0) + (prijsbronVerdeling.onbekend ?? 0);
      if (regels.length > 0 && vrijeEnOnbekend > 0) {
        aandachtspunten.push({ niveau: "info", tekst: `${vrijeEnOnbekend} regel${vrijeEnOnbekend === 1 ? "" : "s"} zonder vaste jaarprijslijst- of leveranciersofferteprijs.` });
      }
      if (plan.status !== "gereed") {
        aandachtspunten.push({ niveau: "info", tekst: "De inkoopplanning is nog niet vastgesteld." });
      }
    }
    if (bestellingenVerlopen > 0) {
      aandachtspunten.push({ niveau: "waarschuwing", tekst: `${bestellingenVerlopen} bestelling${bestellingenVerlopen === 1 ? "" : "en"} over de gewenste leverdatum; controleer bij de leverancier.` });
    }
    if (bestellingenAankomend > 0) {
      aandachtspunten.push({ niveau: "info", tekst: `${bestellingenAankomend} bestelling${bestellingenAankomend === 1 ? "" : "en"} met een naderende leverdatum (binnen 3 dagen).` });
    }

    res.json({
      opdracht_id: id,
      inkoopplan: plan
        ? {
            status: plan.status,
            ai_gegenereerd: plan.aiGegenereerd,
            ai_samenvatting: plan.aiSamenvatting ?? null,
            totale_besparing: plan.totaleBesparing ?? (totaleBesparing || null),
            aantal_regels: regels.length,
            prijsbron_verdeling: prijsbronVerdeling,
            verlopen_prijzen: verlopenPrijzen,
            ai_adviezen: saneerInkoopAdviezen(plan.aiAdviezen),
            ai_adviezen_op: iso(plan.aiAdviezenOp),
          }
        : null,
      bestellingen: {
        aantal: bonnen.length,
        status_verdeling: bonStatusVerdeling,
        verlopen: bestellingenVerlopen,
        aankomend: bestellingenAankomend,
      },
      aandachtspunten,
    });
  } catch (err) {
    logger.error({ err }, "getInkoopcoach fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── POST /opdrachten/:id/inkoopcoach/advies ─────────────────────────────────
// AI genereert concrete, inhoudelijke inkoopadviezen voor deze opdracht
// (bijv. "artikel X kan goedkoper via jaarprijslijst leverancier Y").
// Human-in-the-loop: AI stelt alleen voor; er wordt niets automatisch gewijzigd.

router.post("/opdrachten/:id/inkoopcoach/advies", schrijven, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  try {
    if (!heeftGateway()) {
      res.status(503).json({ error: "AI-gateway niet beschikbaar" });
      return;
    }

    const [plan] = await db.select().from(inkoopplannenTable)
      .where(eq(inkoopplannenTable.opdrachtId, id));
    if (!plan) {
      res.status(422).json({ error: "Er is nog geen inkoopplanning voor deze opdracht" });
      return;
    }

    const regels = await db.select().from(inkoopplanRegelsTable)
      .where(eq(inkoopplanRegelsTable.inkoopplanId, plan.id))
      .orderBy(asc(inkoopplanRegelsTable.volgorde), asc(inkoopplanRegelsTable.id));
    if (regels.length === 0) {
      res.status(422).json({ error: "De inkoopplanning bevat nog geen regels" });
      return;
    }

    const [opdracht] = await db.select().from(opdrachtenTable).where(eq(opdrachtenTable.id, id));
    if (!opdracht) { res.status(404).json({ error: "Opdracht niet gevonden" }); return; }

    const bonnen = await db.select().from(inkoopbonnenTable)
      .where(eq(inkoopbonnenTable.opdrachtId, id));

    // Jaarprijslijst-context: actieve artikelen die (los) matchen op de regelomschrijvingen
    const artikelContext: string[] = [];
    for (const regel of regels.slice(0, 25)) {
      const kern = regel.omschrijving.trim().split(/\s+/).filter(w => w.length > 3)[0];
      if (!kern) continue;
      const matches = await db.select({
        naam: artikelenTable.naam,
        inkoopprijs: artikelenTable.inkoopprijs,
        eenheid: artikelenTable.eenheid,
        leverancier: leveranciersTable.naam,
      })
        .from(artikelenTable)
        .leftJoin(leveranciersTable, eq(artikelenTable.leverancierId, leveranciersTable.id))
        .where(and(eq(artikelenTable.actief, true), ilike(artikelenTable.naam, `%${kern}%`)))
        .limit(3);
      for (const a of matches) {
        const r = `- ${a.naam}: €${a.inkoopprijs ?? "?"} per ${a.eenheid ?? "st"}${a.leverancier ? ` (leverancier: ${a.leverancier})` : ""}`;
        if (!artikelContext.includes(r)) artikelContext.push(r);
      }
      if (artikelContext.length >= 30) break;
    }

    const leveranciers = await db.select({
      naam: leveranciersTable.naam,
    }).from(leveranciersTable).limit(30);

    const nu = new Date();
    const regelSectie = regels.map((r, i) => {
      const delen = [
        `${i + 1}. ${r.omschrijving}: ${r.hoeveelheid} ${r.eenheid}`,
        `type ${r.type}`,
        `status ${r.status}`,
        `prijsbron ${r.prijsBron}`,
        r.calcPrijs != null ? `calcprijs €${r.calcPrijs}` : null,
        r.inkoopprijs != null ? `inkoopprijs €${r.inkoopprijs}` : r.inkoopprijsVerwacht != null ? `verwachte inkoopprijs €${r.inkoopprijsVerwacht}` : null,
        r.leverancier ? `leverancier ${r.leverancier}` : r.aanbevolenLeverancier ? `aanbevolen leverancier ${r.aanbevolenLeverancier}` : null,
        r.levertijdWeken != null ? `levertijd ${r.levertijdWeken} wk` : null,
        r.gewensteLeverdatum ? `gewenste leverdatum ${r.gewensteLeverdatum}` : null,
        r.prijsGeldigTot ? `prijs geldig tot ${r.prijsGeldigTot}${new Date(r.prijsGeldigTot) < nu ? " (VERLOPEN)" : ""}` : null,
      ].filter(Boolean);
      return delen.join(", ");
    }).join("\n");

    const bonSectie = bonnen.length === 0
      ? "Nog geen bestellingen."
      : bonnen.map(b => `- Bon #${b.id}: status ${b.status}${b.leverancier ? `, leverancier ${b.leverancier}` : ""}${b.gewensteLeverdatum ? `, gewenste leverdatum ${b.gewensteLeverdatum}` : ""}`).join("\n");

    const prompt = `Je bent een ervaren inkoper bij een brandpreventie-installatiebedrijf in Nederland.
Analyseer het inkooptraject van deze opdracht en geef maximaal 6 concrete, inhoudelijke inkoopadviezen.
Denk aan: goedkoper inkopen via de jaarprijslijst, betere leverancierskeuze, prijzen opnieuw opvragen,
bestellingen bundelen per leverancier, tijdig bestellen bij lange levertijden, en prijs- of leverrisico's.

Opdracht: ${opdracht.titel}
Datum vandaag: ${nu.toISOString().slice(0, 10)}
Inkoopplanstatus: ${plan.status}

INKOOPPLAN-REGELS:
${regelSectie}

BESTELLINGEN:
${bonSectie}

JAARPRIJSLIJST (relevante artikelen met vaste inkoopprijs):
${artikelContext.length > 0 ? artikelContext.join("\n") : "Geen matchende jaarprijslijst-artikelen gevonden."}

BEKENDE LEVERANCIERS: ${leveranciers.map(l => l.naam).join(", ") || "geen"}

Regels voor je adviezen:
- Alleen adviezen die concreet en direct uitvoerbaar zijn voor deze opdracht; geen algemene inkooptips.
- Verwijs waar mogelijk naar de exacte regelomschrijving.
- Geef een besparingsindicatie in euro's alleen als die uit de cijfers hierboven af te leiden is, anders null.
- Alle teksten in het Nederlands.

Geef uitsluitend geldige JSON:
{
  "adviezen": [
    {
      "categorie": "prijs|leverancier|planning|risico|algemeen",
      "tekst": "concreet advies",
      "besparing_indicatie": 0.00,
      "regel_omschrijving": "exacte regelomschrijving of null"
    }
  ]
}`;

    const aiResultaat = await aiGateway.chat("default", {
      messages: [
        { role: "system", content: INKOOP_PROMPT.tekst },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      max_tokens: 2000,
    }, undefined, {
      module: "werkvoorbereiding",
      functie: "inkoopcoach-advies",
      gebruikerId: req.session.userId ?? null,
      project_id: id,
      promptNaam: INKOOP_PROMPT.naam,
      promptVersie: INKOOP_PROMPT.versie,
    });

    if (!aiResultaat.ok) {
      res.status(502).json({ error: "AI-advies genereren mislukt; probeer het later opnieuw" });
      return;
    }

    let geparsed: unknown;
    try {
      geparsed = JSON.parse(aiResultaat.inhoud);
    } catch {
      res.status(502).json({ error: "AI gaf een ongeldig antwoord; probeer het opnieuw" });
      return;
    }
    const adviezen = saneerInkoopAdviezen((geparsed as Record<string, unknown>)?.adviezen);
    if (adviezen.length === 0) {
      res.status(502).json({ error: "AI gaf geen bruikbare adviezen; probeer het opnieuw" });
      return;
    }

    const adviezenOp = new Date();
    await db.update(inkoopplannenTable)
      .set({ aiAdviezen: adviezen, aiAdviezenOp: adviezenOp, bijgewerktOp: adviezenOp })
      .where(eq(inkoopplannenTable.id, plan.id));

    res.json({ ai_adviezen: adviezen, ai_adviezen_op: adviezenOp.toISOString() });
  } catch (err) {
    logger.error({ err }, "genereerInkoopcoachAdvies fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── POST /opdrachten/:id/inkoopplanning/genereer ───────────────────────────

router.post("/opdrachten/:id/inkoopplanning/genereer", schrijven, async (req, res): Promise<void> => {
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
      werkpakket?: string | null;
      type: string;
      aanbevolen_leverancier: string | null;
      inkoopprijs_verwacht: number;
      besparing_per_eenheid: number;
      besparing: number;
      levertijd_weken: number;
      reden_keuze?: string | null;
      alternatief?: string | null;
      montage_aandachtspunten?: string | null;
      motivatie: string;
    }

    interface AiInkoopResult {
      samenvatting: string;
      totale_besparing: number;
      regels: AiInkoopRegel[];
    }

    // PIM-context ophalen voor verrijking (optioneel — geen blokkade als afwezig)
    const [pim] = await db.select().from(pimModellenTable)
      .where(eq(pimModellenTable.opdrachtId, id));
    const wvCtx = pim?.werkvoorbereidingContext as Record<string, unknown> | null | undefined;

    let aiResultaat: AiInkoopResult | null = null;
    let aiGegenereerd = false;

    // INKOOP_AI_01 — eigen inkoophistorie per artikel (blokken A-D), ook
    // gebruikt om verwachte prijs en leveranciersopties deterministisch te
    // vullen (de AI vult die velden niet meer uit algemene kennis).
    const historie = await haalInkoopHistorie(materiaalRegels);
    const eigenCijfers = bouwInkoopEigenCijfersContext(
      materiaalRegels.map((r) => ({ omschrijving: r.omschrijving, eenheid: r.eenheid, calcPrijs: r.tarief })),
      historie,
    );

    if (heeftGateway() && materiaalRegels.length > 0) {
      // PIM werkvoorbereiding_context toevoegen als aanwezig
      const pimSectie = wvCtx
        ? [
          "\n=== PIM WERKVOORBEREIDING CONTEXT ===",
          wvCtx.planningadvies ? `Planningadvies: ${String(wvCtx.planningadvies)}` : "",
          Array.isArray(wvCtx.aandachtspunten) && wvCtx.aandachtspunten.length > 0
            ? `Uitvoeringsrisico's:\n${(wvCtx.aandachtspunten as string[]).map(a => `- ${a}`).join("\n")}`
            : "",
          Array.isArray(wvCtx.risicos) && wvCtx.risicos.length > 0
            ? `Risico's:\n${(wvCtx.risicos as string[]).map(r => `- ${r}`).join("\n")}`
            : "",
          Array.isArray(wvCtx.open_vragen) && wvCtx.open_vragen.length > 0
            ? `Open vragen:\n${(wvCtx.open_vragen as string[]).map(v => `- ${v}`).join("\n")}`
            : "",
        ].filter(Boolean).join("\n")
        : "";

      const prompt = `Je bent een inkoper bij een brandpreventie-installatiebedrijf in Nederland.
Analyseer de onderstaande materiaalregels uit een werkbegroting en maak een inkoopplanning.

MATERIAALREGELS (met werkpakket/hoofdstuk):
${materiaalRegels.map((r, i) => `${i + 1}. ${r.omschrijving} [werkpakket: ${r.hoofdstuk ?? "Algemeen"}]: ${r.hoeveelheid} ${r.eenheid} @ €${r.tarief} = €${r.totaal}`).join('\n')}

Opdracht: ${opdracht.titel}
${pimSectie}

${eigenCijfers}

Classificeer elk materiaal als:
- "voorraad": gangbaar materiaal, altijd op voorraad (bijv. schroeven, kabelgoot, kleine onderdelen)
- "standaard": regulier leveranciersmaterial, 1-2 weken levertijd
- "project": projectspecifiek, 2-4 weken levertijd (bijv. specifieke branddeuren, damperplaten)
- "maatwerk": speciaal geproduceerd, >4 weken levertijd (bijv. maatwerkpanelen, niet-standaard manchetten)

Prijzen en leveranciers worden buiten jou om gevuld uit de eigen inkoophistorie en de jaarprijslijst. Jij levert: het type, de levertijdinschatting (benoem in de motivatie of dit een eigen cijfer of een algemene inschatting is) en een motivatie die de eigen cijfers hierboven letterlijk aanhaalt waar ze bestaan. Kies nooit één leverancier; ontbreekt eigen historie, adviseer dan "prijs opvragen".

Let op risico's en aandachtspunten uit de PIM werkvoorbereiding bij het bepalen van levertijden en alternatieven.

Geef je analyse als JSON:
{
  "samenvatting": "korte samenvatting van de inkoopplanning",
  "totale_besparing": 0,
  "regels": [
    {
      "omschrijving": "naam van het materiaal (exact overnemen)",
      "werkpakket": "werkpakket/hoofdstuk naam (exact overnemen uit de MATERIAALREGELS)",
      "type": "voorraad|standaard|project|maatwerk",
      "aanbevolen_leverancier": "naam of null",
      "inkoopprijs_verwacht": 0.00,
      "besparing_per_eenheid": 0.00,
      "besparing": 0.00,
      "levertijd_weken": 0,
      "reden_keuze": "waarom dit type/leverancier passend is voor dit werkpakket",
      "alternatief": "alternatief product of leverancier als eerste keuze niet beschikbaar is, of null",
      "montage_aandachtspunten": "relevante montage- of plaatsingsaandachtspunten vanuit PIM context, of null",
      "motivatie": "Werkpakket: <naam> | Reden: <reden_keuze> | Alternatief: <alternatief of geen> | Montage: <montage_aandachtspunten of geen>"
    }
  ]
}`;

      try {
        const inkoopResultaat = await aiGateway.chat("default", {
          messages: [
            { role: "system", content: INKOOP_PROMPT.tekst },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
          max_tokens: 3000,
        }, undefined, {
          module: "werkvoorbereiding",
          functie: "inkoopplanning-genereer",
          gebruikerId: req.session.userId ?? null,
          project_id: id,
          promptNaam: INKOOP_PROMPT.naam,
          promptVersie: INKOOP_PROMPT.versie,
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
      // Wordt hieronder deterministisch herberekend uit de regels (INKOOP_AI_01);
      // de AI-schatting wordt niet opgeslagen.
      totaleBesparing: null,
    }).returning();

    // Regels aanmaken
    const planRegels: (typeof inkoopplanRegelsTable.$inferInsert)[] = [];

    for (let i = 0; i < materiaalRegels.length; i++) {
      const regel = materiaalRegels[i];
      const aiRegel = aiResultaat?.regels?.find(
        (r: AiInkoopRegel) => r.omschrijving.toLowerCase().includes(regel.omschrijving.toLowerCase().slice(0, 10))
      ) ?? aiResultaat?.regels?.[i] ?? null;

      // Verwachte prijs: uitsluitend gemeten bronnen (INKOOP_AI_01) —
      // jaarprijslijst > eigen inkoophistorie (mediaan, ≥3 waarnemingen) > ONBEKEND.
      // De AI-schatting wordt bewust NIET meer gebruikt: een verzonnen marktprijs
      // is erger dan een leeg veld, want er wordt een besparing tegen afgezet.
      const artikelHistorie = historie.get(artikelSleutel(regel.omschrijving, regel.eenheid));
      let prijsBron = "onbekend";
      let inkoopprijsVerwacht: number | null = null;
      // Exacte (case-insensitieve) naam-match, géén ilike-patroon: %/_ in een
      // omschrijving mogen geen wildcard worden. Ambigu (meerdere actieve
      // artikelen met verschillende inkoopprijs) = fail-closed: geen override.
      const artikelen = await db.select({
        naam: artikelenTable.naam,
        inkoopprijs: artikelenTable.inkoopprijs,
      })
        .from(artikelenTable)
        .where(and(
          eq(artikelenTable.actief, true),
          sql`lower(${artikelenTable.naam}) = lower(${regel.omschrijving.trim()})`,
        ))
        .limit(3);
      const prijzen = [...new Set(artikelen.filter((a) => a.inkoopprijs != null).map((a) => a.inkoopprijs))];
      if (prijzen.length === 1) {
        prijsBron = "jaarprijslijst";
        inkoopprijsVerwacht = prijzen[0]!;
      } else if (artikelHistorie && artikelHistorie.mediaan != null) {
        prijsBron = "inkoophistorie";
        inkoopprijsVerwacht = Math.round(artikelHistorie.mediaan * 100) / 100;
      }

      // Besparing is een rekensom, geen AI-mening; zonder verwachte prijs geen besparing.
      const besparingPerEenheid = inkoopprijsVerwacht != null
        ? Math.round((regel.tarief - inkoopprijsVerwacht) * 100) / 100
        : null;
      const besparing = besparingPerEenheid != null
        ? Math.round(besparingPerEenheid * regel.hoeveelheid * 100) / 100
        : null;

      // Leveranciers: opsomming uit eigen historie (de inkoper kiest), nooit een AI-keuze.
      const leveranciersUitHistorie = artikelHistorie ? leveranciersOpsomming(artikelHistorie) : null;

      const historieToelichting = artikelHistorie && artikelHistorie.mediaan != null
        ? `Eigen inkoophistorie: mediaan € ${artikelHistorie.mediaan.toFixed(2)} over ${artikelHistorie.aantal} waarnemingen (${artikelHistorie.bronnen}, ${artikelHistorie.periode}).`
        : `Geen of te weinig eigen inkoophistorie (${artikelHistorie?.aantal ?? 0} waarneming(en), minimaal ${MIN_WAARNEMINGEN_INKOOP}) — verwachte prijs ${prijsBron === "jaarprijslijst" ? "uit jaarprijslijst" : "onbekend"}.`;

      planRegels.push({
        inkoopplanId: plan.id,
        werkbegrotingRegelId: regel.id,
        omschrijving: regel.omschrijving,
        hoeveelheid: regel.hoeveelheid,
        eenheid: regel.eenheid,
        type: aiRegel?.type ?? "standaard",
        aanbevolenLeverancier: leveranciersUitHistorie,
        calcPrijs: regel.tarief,
        inkoopprijsVerwacht,
        besparingPerEenheid,
        besparing,
        levertijdWeken: aiRegel?.levertijd_weken ?? null,
        aiMotivatie: [historieToelichting, aiRegel?.motivatie ?? null].filter(Boolean).join(" | "),
        prijsBron,
        status: "open",
        volgorde: i,
      });
    }

    if (planRegels.length > 0) {
      await db.insert(inkoopplanRegelsTable).values(planRegels);
    }

    // Totale besparing deterministisch uit de regels — nooit uit de AI.
    const berekendeBesparing = planRegels.reduce((som, r) => som + (r.besparing ?? 0), 0);
    const totaleBesparing = planRegels.some((r) => r.besparing != null)
      ? Math.round(berekendeBesparing * 100) / 100
      : null;
    await db.update(inkoopplannenTable)
      .set({ totaleBesparing })
      .where(eq(inkoopplannenTable.id, plan.id));
    plan.totaleBesparing = totaleBesparing;

    const alleRegels = await db.select().from(inkoopplanRegelsTable)
      .where(eq(inkoopplanRegelsTable.inkoopplanId, plan.id))
      .orderBy(asc(inkoopplanRegelsTable.volgorde));

    const hoofdstukMap = await buildHoofdstukMap(alleRegels);
    res.json(mapInkoopplan(plan, alleRegels, hoofdstukMap));
  } catch (err) {
    logger.error({ err }, "genereerInkoopplanning fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── WVB_01: divergentiesignaal inkoop- vs uitvoeringsplanning ────────────────
// Vergelijkt gewenste leverdatums in het inkoopplan met het start/eind-venster
// van het uitvoeringsplan. Loopt de planning uiteen → open compliance-signaal
// (dedup per opdracht); klopt het weer → open signaal oplossen.
// Bewust een lees-en-vergelijk bij vaststellen, geen achtergrondworker.

async function controleerWvbDivergentie(opdrachtId: number): Promise<void> {
  const dedupSleutel = `wvb_planning_divergentie:opdracht:${opdrachtId}`;
  try {
    const [uitvoeringsplan] = await db.select().from(uitvoeringsplannenTable)
      .where(eq(uitvoeringsplannenTable.opdrachtId, opdrachtId));
    const [inkoopplan] = await db.select().from(inkoopplannenTable)
      .where(eq(inkoopplannenTable.opdrachtId, opdrachtId));

    const problemen: string[] = [];
    if (uitvoeringsplan && inkoopplan) {
      const start = uitvoeringsplan.startdatum ? new Date(uitvoeringsplan.startdatum) : null;
      const eind = uitvoeringsplan.einddatum ? new Date(uitvoeringsplan.einddatum) : null;
      if (start || eind) {
        const regels = await db.select().from(inkoopplanRegelsTable)
          .where(eq(inkoopplanRegelsTable.inkoopplanId, inkoopplan.id));
        for (const regel of regels) {
          if (!regel.gewensteLeverdatum) continue;
          const lever = new Date(regel.gewensteLeverdatum);
          if (isNaN(lever.getTime())) continue;
          if (eind && lever > eind) {
            problemen.push(`"${regel.omschrijving}" wordt pas op ${regel.gewensteLeverdatum} geleverd, ná de verwachte oplevering (${uitvoeringsplan.einddatum}).`);
          } else if (start && regel.besteldatum) {
            const bestel = new Date(regel.besteldatum);
            if (!isNaN(bestel.getTime()) && bestel > start) {
              problemen.push(`"${regel.omschrijving}" moet pas op ${regel.besteldatum} besteld worden terwijl de uitvoering al op ${uitvoeringsplan.startdatum} start.`);
            }
          }
        }
      }
    }

    const [openSignaal] = await db.select().from(complianceSignalenTable)
      .where(and(
        eq(complianceSignalenTable.dedupSleutel, dedupSleutel),
        eq(complianceSignalenTable.status, "open"),
      ))
      .limit(1);

    if (problemen.length > 0) {
      const omschrijving = `Inkoop- en uitvoeringsplanning lopen uiteen:\n- ${problemen.slice(0, 5).join("\n- ")}${problemen.length > 5 ? `\n(+${problemen.length - 5} meer)` : ""}`;
      if (openSignaal) {
        await db.update(complianceSignalenTable)
          .set({ omschrijving, bijgewerktOp: new Date() })
          .where(eq(complianceSignalenTable.id, openSignaal.id));
      } else {
        // Race-safe: de partiële unieke index (dedup_sleutel WHERE status='open',
        // migratie 0014) maakt dubbele open signalen onmogelijk; bij een
        // gelijktijdige insert wint de eerste en doet deze niets.
        await db.insert(complianceSignalenTable).values({
          regel: "wvb_planning_divergentie",
          ernst: "waarschuwing",
          entiteitType: "opdracht",
          entiteitId: opdrachtId,
          titel: "Inkoopplanning en uitvoeringsplanning lopen uiteen",
          omschrijving,
          dedupSleutel,
        }).onConflictDoNothing();
      }
    } else if (openSignaal) {
      await db.update(complianceSignalenTable)
        .set({ status: "opgelost", opgelostOp: new Date(), bijgewerktOp: new Date() })
        .where(eq(complianceSignalenTable.id, openSignaal.id));
    }
  } catch (err) {
    // Niet-blokkerend: signaalcontrole mag vaststellen nooit laten falen
    logger.warn({ err, opdrachtId }, "WVB-divergentiecontrole mislukt — niet-blokkerend");
  }
}

// ── POST /opdrachten/:id/inkoopplanning/vaststellen ───────────────────────

router.post("/opdrachten/:id/inkoopplanning/vaststellen", schrijven, async (req, res): Promise<void> => {
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

    // PIM inkoop_context bijwerken: { werkpakket_sleutel: [inkoopplan_regel_id, ...] }
    // Mapping afgeleid via werkbegroting_regel.hoofdstuk (geen FK op regels nodig)
    try {
      const hoofdstukMap = await buildHoofdstukMap(regels);
      const inkoopContext: Record<string, number[]> = {};
      for (const regel of regels) {
        const sleutel = (regel.werkbegrotingRegelId
          ? (hoofdstukMap.get(regel.werkbegrotingRegelId) ?? null)
          : null) ?? "overig";
        if (!inkoopContext[sleutel]) inkoopContext[sleutel] = [];
        inkoopContext[sleutel].push(regel.id);
      }
      const [pim] = await db
        .select({ id: pimModellenTable.id })
        .from(pimModellenTable)
        .where(eq(pimModellenTable.opdrachtId, id));
      if (pim) {
        await db.update(pimModellenTable)
          .set({ inkoopContext, bijgewerktOp: new Date() })
          .where(eq(pimModellenTable.id, pim.id));
      }
    } catch (pimErr) {
      // Niet-blokkerend: PIM update mislukt mag vaststellen niet blokkeren
      logger.warn({ pimErr }, "PIM inkoop_context bijwerken mislukt — niet-blokkerend");
    }

    await controleerWvbDivergentie(id);

    const hoofdstukMapVoorResponse = await buildHoofdstukMap(regels);
    res.json(mapInkoopplan(updated, regels, hoofdstukMapVoorResponse));
  } catch (err) {
    logger.error({ err }, "vaststellenInkoopplanning fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── PATCH /opdrachten/:id/inkoopplanning/regels/:regelId ──────────────────

router.patch("/opdrachten/:id/inkoopplanning/regels/:regelId", schrijven, async (req, res): Promise<void> => {
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
      prijs_bron: "prijsBron",
      prijs_geldig_tot: "prijsGeldigTot",
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

router.get("/opdrachten/:id/inkoopplanning/inkoopbonnen", lezen, async (req, res): Promise<void> => {
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
      return mapInkoopbon(bon, regels, await kenmerkVoorProjectinkoop(bon.offerteId, bon.nummer, bon.herziening), magBedragenZien(req));
    }));

    res.json(result);
  } catch (err) {
    logger.error({ err }, "listInkoopbonnen fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── POST /opdrachten/:id/inkoopplanning/inkoopbonnen ──────────────────────

router.post("/opdrachten/:id/inkoopplanning/inkoopbonnen", schrijven, async (req, res): Promise<void> => {
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
    // MATERIAAL_01 fase 3: gedeeld aanmaakpad (ook gebruikt door de
    // automatische bon bij een goedgekeurde materiaal-aanvraag).
    const bon = await maakConceptInkoopbon({
      opdrachtId: id,
      leverancier: body.leverancier,
      gewensteLeverdatum: body.gewenste_leverdatum ?? null,
      opmerkingen: body.opmerkingen ?? null,
      regels: body.regels ?? [],
    });

    const regels = await db.select().from(inkoopbonRegelsTable)
      .where(eq(inkoopbonRegelsTable.inkoopbonId, bon.id))
      .orderBy(asc(inkoopbonRegelsTable.volgorde));

    res.status(201).json(mapInkoopbon(bon, regels, await kenmerkVoorProjectinkoop(bon.offerteId, bon.nummer, bon.herziening)));
  } catch (err) {
    if (err instanceof GeenAkkoordFout) {
      // AKKOORD_01 §3.3: heldere weigering, geen kale serverfout.
      res.status(422).json({ code: "AKKOORD_ONTBREEKT", error: err.message });
      return;
    }
    logger.error({ err }, "createInkoopbon fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── POST /opdrachten/:id/inkoopplanning/inkoopbonnen/ai-suggesties ────────

router.post("/opdrachten/:id/inkoopplanning/inkoopbonnen/ai-suggesties", schrijven, async (req, res): Promise<void> => {
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
            { role: "system", content: INKOOP_PROMPT.tekst },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
          max_tokens: 3000,
        }, undefined, {
          module: "werkvoorbereiding",
          functie: "inkoopbon-genereer",
          gebruikerId: req.session.userId ?? null,
          project_id: id,
          promptNaam: INKOOP_PROMPT.naam,
          promptVersie: INKOOP_PROMPT.versie,
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

router.patch("/opdrachten/:id/inkoopplanning/inkoopbonnen/:bonId", schrijven, async (req, res): Promise<void> => {
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
    const inhoudelijkeWijziging = Object.keys(updates).length > 1;

    // NUMMER_01 §4.5: een al verstuurde bon inhoudelijk wijzigen = herziening.
    // De oude versie wordt eerst bevroren in inkoop_versies; daarna krijgt de
    // bon een herzieningsletter (I088 → I088a). De vorige versie blijft bestaan.
    // Transactioneel met row-lock: twee gelijktijdige wijzigingen op een
    // verzonden bon mogen nooit dezelfde herzieningsletter uitgeven of
    // dezelfde versie dubbel snapshotten.
    const updated = await db.transaction(async (tx) => {
      const [huidig] = await tx.select().from(inkoopbonnenTable)
        .where(and(eq(inkoopbonnenTable.id, bonId), eq(inkoopbonnenTable.opdrachtId, id)))
        .for("update");
      if (!huidig) return null;

      if (inhoudelijkeWijziging && huidig.verzondenOp) {
        const huidigeRegels = await tx.select().from(inkoopbonRegelsTable)
          .where(eq(inkoopbonRegelsTable.inkoopbonId, bonId))
          .orderBy(asc(inkoopbonRegelsTable.volgorde));
        await tx.insert(inkoopVersiesTable).values({
          bronTabel: "inkoopbonnen",
          bronId: bonId,
          herziening: huidig.herziening,
          kenmerk: await kenmerkVoorProjectinkoop(huidig.offerteId, huidig.nummer, huidig.herziening),
          snapshot: { bon: huidig, regels: huidigeRegels },
          aangemaaktDoorId: (req.session?.userId as number | undefined) ?? null,
        }).onConflictDoNothing();
        updates.herziening = huidig.herziening + 1;
        updates.bonNummer = formatNummer("I", huidig.nummer) + herzieningsLetter(huidig.herziening + 1);
      }

      const [rij] = await tx.update(inkoopbonnenTable)
        .set(updates as Partial<typeof inkoopbonnenTable.$inferInsert>)
        .where(and(eq(inkoopbonnenTable.id, bonId), eq(inkoopbonnenTable.opdrachtId, id)))
        .returning();
      return rij ?? null;
    });
    if (!updated) { res.status(404).json({ error: "Inkoopbon niet gevonden" }); return; }

    const regels = await db.select().from(inkoopbonRegelsTable)
      .where(eq(inkoopbonRegelsTable.inkoopbonId, bonId))
      .orderBy(asc(inkoopbonRegelsTable.volgorde));

    res.json(mapInkoopbon(updated, regels, await kenmerkVoorProjectinkoop(updated.offerteId, updated.nummer, updated.herziening)));
  } catch (err) {
    logger.error({ err }, "patchInkoopbon fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── DELETE /opdrachten/:id/inkoopplanning/inkoopbonnen/:bonId ─────────────

router.delete("/opdrachten/:id/inkoopplanning/inkoopbonnen/:bonId", schrijven, async (req, res): Promise<void> => {
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

// ── POST /opdrachten/:id/inkoopplanning/inkoopbonnen/:bonId/ter-goedkeuring-indienen ─────
// Dient een inkoopbon ter goedkeuring in via de generieke Governance & Approval Engine.
// De route leidt het bedrag, document_type en omschrijving zelf af zodat de client
// geen van deze velden hoeft te kennen. Na goedkeuring door de motor wordt de
// inkoopbon automatisch naar status "goedgekeurd" gezet (via OBJECT_WORKFLOW_ACTIE).

router.post("/opdrachten/:id/inkoopplanning/inkoopbonnen/:bonId/ter-goedkeuring-indienen", requireBevoegdheid("projecten", 2), async (req, res): Promise<void> => {
  const opdrachtId = parseInt(String(req.params.id), 10);
  const bonId = parseInt(String(req.params.bonId), 10);
  if (isNaN(opdrachtId) || isNaN(bonId)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  try {
    const [bon] = await db.select().from(inkoopbonnenTable)
      .where(and(eq(inkoopbonnenTable.id, bonId), eq(inkoopbonnenTable.opdrachtId, opdrachtId)));
    if (!bon) { res.status(404).json({ error: "Inkoopbon niet gevonden" }); return; }

    const actor = await maakGoedkeuringActor(req as { session: { userId?: number | null } }, db);
    if (!actor) { res.status(401).json({ error: "Niet ingelogd" }); return; }

    const omschrijving = `Inkoopbon${bon.bonNummer ? ` ${bon.bonNummer}` : ""}${bon.leverancier ? ` — ${bon.leverancier}` : ""}`;

    const resultaat = await dienIn(db, {
      objectType: "inkoopbon",
      objectId: bonId,
      documentType: "inkoopbon",
      omschrijving,
      bedrag: bon.totaalBedrag ?? null,
      werkmaatschappijId: null,
      actor,
    });

    if (!resultaat.ok) {
      res.status(resultaat.error!.httpStatus ?? 422).json({ error: resultaat.error!.bericht });
      return;
    }

    res.status(201).json(resultaat.aanvraag);
  } catch (err) {
    logger.error({ err }, "terGoedkeuringIndienen inkoopbon fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── POST /opdrachten/:id/inkoopplanning/inkoopbonnen/:bonId/verzenden ─────

router.post("/opdrachten/:id/inkoopplanning/inkoopbonnen/:bonId/verzenden", schrijven, async (req, res): Promise<void> => {
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

    // Goedkeuringsgate: als er een actieve beleidsregel geldt voor inkoopbonnen
    // boven het totaalbedrag van deze bon, mag de bon pas verzonden worden nadat
    // de goedkeuringsmotor de aanvraag heeft goedgekeurd.
    const { vereist: goedkeuringVereist } = await checkVereistGoedkeuring(db, "inkoopbon", bon.totaalBedrag ?? null, null);
    if (goedkeuringVereist) {
      const goedgekeurd = await haalGoedgekeurdeAanvraag(db, "inkoopbon", bonId);
      if (!goedgekeurd) {
        const open = await haalOpenAanvraag(db, "inkoopbon", bonId);
        res.status(422).json({
          error: "Goedkeuring vereist",
          detail: open
            ? "Er loopt een openstaande goedkeuringsaanvraag voor deze inkoopbon. Wacht op de uitkomst voordat u verzendt."
            : "Deze inkoopbon overschrijdt de ingestelde drempel. Dien de inkoopbon ter goedkeuring in via het goedkeuringswidget op de detailpagina.",
          viaGoedkeuring: true,
        });
        return;
      }
    }

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

    res.json(mapInkoopbon(updated, updatedRegels, await kenmerkVoorProjectinkoop(updated.offerteId, updated.nummer, updated.herziening)));
  } catch (err) {
    logger.error({ err }, "verzendInkoopbon fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── GET /opdrachten/:id/uitvoeringsplanning ───────────────────────────────

router.get("/opdrachten/:id/uitvoeringsplanning", lezen, async (req, res): Promise<void> => {
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

router.post("/opdrachten/:id/uitvoeringsplanning/genereer", schrijven, async (req, res): Promise<void> => {
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

      // PIM inkoop_context ophalen: { werkpakket_sleutel: [inkoopplan_regel_id, ...] }
      let pimInkoopSectie = "";
      try {
        const [pim] = await db
          .select({ id: pimModellenTable.id, inkoopContext: pimModellenTable.inkoopContext })
          .from(pimModellenTable)
          .where(eq(pimModellenTable.opdrachtId, id));

        if (pim?.inkoopContext && typeof pim.inkoopContext === "object") {
          const inkoopCtx = pim.inkoopContext as Record<string, number[]>;
          const alleRegelIds = Object.values(inkoopCtx).flat();
          if (alleRegelIds.length > 0) {
            const inkoopRegels = await db
              .select({
                id: inkoopplanRegelsTable.id,
                omschrijving: inkoopplanRegelsTable.omschrijving,
                hoeveelheid: inkoopplanRegelsTable.hoeveelheid,
                eenheid: inkoopplanRegelsTable.eenheid,
                levertijdWeken: inkoopplanRegelsTable.levertijdWeken,
                werkbegrotingRegelId: inkoopplanRegelsTable.werkbegrotingRegelId,
              })
              .from(inkoopplanRegelsTable)
              .where(inArray(inkoopplanRegelsTable.id, alleRegelIds));

            const regelById = new Map(inkoopRegels.map(r => [r.id, r]));

            const secties: string[] = [];
            for (const [werkpakket, ids] of Object.entries(inkoopCtx)) {
              const artikelen = ids.map(rid => regelById.get(rid)).filter(Boolean);
              if (artikelen.length === 0) continue;
              const regelsText = artikelen.map(a =>
                `  - ${a!.omschrijving}: ${a!.hoeveelheid} ${a!.eenheid}${a!.levertijdWeken != null ? `, levertijd ${a!.levertijdWeken} wkn` : ""}`
              ).join('\n');
              secties.push(`Werkpakket "${werkpakket}":\n${regelsText}`);
            }
            if (secties.length > 0) {
              pimInkoopSectie = `\nVASTGESTELD INKOOPPLAN — artikelen per werkpakket (gebruik voor materiaal_moment per taak):\n${secties.join('\n\n')}\n`;
            }
          }
        }
      } catch (pimErr) {
        logger.warn({ pimErr }, "PIM inkoop_context ophalen voor uitvoeringsplan mislukt — niet-blokkerend");
      }

      const prompt = `Je bent een werkvoorbereider bij een brandpreventie-installatiebedrijf in Nederland.
Maak een concept uitvoeringsplanning voor de volgende opdracht.

OPDRACHT: ${opdracht.titel}
WERKNUMMER: ${opdracht.werknummer ?? "n.v.t."}

ARBEID (${arbeidRegels.length} regels, totaal ${begroting.totaalArbeidUren} uur):
${arbeidRegels.map(r => `- ${r.omschrijving}: ${r.hoeveelheid} ${r.eenheid} @ ${r.tarief}/uur`).join('\n')}

MATERIAAL (${materiaalRegels.length} artikelen, totaal €${begroting.totaalMateriaalBedrag}):
${materiaalRegels.slice(0, 15).map(r => `- ${r.omschrijving}: ${r.hoeveelheid} ${r.eenheid}`).join('\n')}
${pimInkoopSectie}
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
            { role: "system", content: UITVOERINGSPLAN_PROMPT.tekst },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
          max_tokens: 3000,
        }, undefined, {
          module: "werkvoorbereiding",
          functie: "uitvoeringsplan-genereer",
          gebruikerId: req.session.userId ?? null,
          project_id: id,
          promptNaam: UITVOERINGSPLAN_PROMPT.naam,
          promptVersie: UITVOERINGSPLAN_PROMPT.versie,
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

router.post("/opdrachten/:id/uitvoeringsplanning/vaststellen", schrijven, async (req, res): Promise<void> => {
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

    await controleerWvbDivergentie(id);

    res.json(mapUitvoeringsplan(updated, taken));
  } catch (err) {
    logger.error({ err }, "vaststellenUitvoeringsplanning fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── PATCH /opdrachten/:id/uitvoeringsplanning/taken/:taakId ──────────────

router.patch("/opdrachten/:id/uitvoeringsplanning/taken/:taakId", schrijven, async (req, res): Promise<void> => {
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

router.post("/opdrachten/:id/inkoopplanning/regels", schrijven, async (req, res): Promise<void> => {
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
      prijsBron: typeof body.prijs_bron === "string" ? body.prijs_bron : "vrij",
      prijsGeldigTot: typeof body.prijs_geldig_tot === "string" ? body.prijs_geldig_tot : undefined,
      bijgewerktOp: new Date(),
    });

    const regels = await db.select().from(inkoopplanRegelsTable)
      .where(eq(inkoopplanRegelsTable.inkoopplanId, plan.id))
      .orderBy(asc(inkoopplanRegelsTable.volgorde), asc(inkoopplanRegelsTable.id));

    const hoofdstukMap = await buildHoofdstukMap(regels);
    res.status(201).json(mapInkoopplan(plan, regels, hoofdstukMap));
  } catch (err) {
    logger.error({ err }, "createInkoopplanRegel fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── DELETE /opdrachten/:id/inkoopplanning/regels/:regelId ─────────────────

router.delete("/opdrachten/:id/inkoopplanning/regels/:regelId", schrijven, async (req, res): Promise<void> => {
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

router.get("/opdrachten/:id/onderaanneming", metBedragen, async (req, res): Promise<void> => {
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

router.post("/opdrachten/:id/onderaanneming", schrijven, async (req, res): Promise<void> => {
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

router.patch("/opdrachten/:id/onderaanneming/:orderId", schrijven, async (req, res): Promise<void> => {
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

router.delete("/opdrachten/:id/onderaanneming/:orderId", schrijven, async (req, res): Promise<void> => {
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
