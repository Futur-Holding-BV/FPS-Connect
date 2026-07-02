import { Router } from "express";
import { voerScoutUit, getScoutStatus } from "../lib/scoutService";
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
import { heeftOpenAi, maakOpenAiClient } from "../lib/openai";

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
  voorkeurs_presentatie_niveau: k.voorkeursPresentatieNiveau ?? null,
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
  bron_type: m.bronType ?? "handmatig",
  organisatie_id: m.organisatieId,
  concurrent_id: m.concurrentId,
  titel: m.titel,
  inhoud: m.inhoud,
  bron: m.bron,
  bron_url: m.bronUrl ?? null,
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
    const { naam, type, kvk, adres, postcode, stad, regio, telefoon, email, website, linkedin_url, branche, status, relatie_status, voorkeur_fps_bedrijf, opmerkingen, voorkeurs_presentatie_niveau } = req.body;
    const [k] = await db
      .update(crmKlantenTable)
      .set({ naam, type, kvk, adres, postcode, stad, regio, telefoon, email, website, linkedinUrl: linkedin_url, branche, status, relatieStatus: relatie_status, voorkeurFpsBedrijf: voorkeur_fps_bedrijf, opmerkingen, ...(voorkeurs_presentatie_niveau !== undefined && { voorkeursPresentatieNiveau: voorkeurs_presentatie_niveau }), bijgewerktOp: new Date() })
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

// ── AI — Concurrent profiel ───────────────────────────────────────────────────
router.post("/crm/concurrenten/ai-profiel", lezen, async (req, res) => {
  if (!heeftOpenAi()) return res.status(503).json({ error: "AI niet geconfigureerd" });
  const { naam } = req.body;
  if (!naam?.trim()) return res.status(400).json({ error: "naam is verplicht" });
  const client = maakOpenAiClient();

  const systeemPrompt =
    "Je bent een marktintelligentie-assistent voor een Nederlands brandpreventiebedrijf. " +
    "Zoek op internet naar actuele informatie over de opgegeven concurrent. " +
    "Geef een JSON-object terug met de volgende velden (null als echt niet te vinden): " +
    "website (URL), regio (Nederlandse regio of stad), " +
    "bekende_klanten (kommalijst van bekende klanten), " +
    "bekende_projecttypes (soorten projecten bijv. branddeuren doorvoeringen), " +
    "sterke_punten (korte tekst), zwakke_punten (korte tekst), " +
    "where_we_encounter (aanbestedingen/beurzen/projecten waar je ze tegenkomt). " +
    "Gebruik de meest recente informatie die je kunt vinden.";
  const gebruikerPrompt = `Maak een concurrentprofiel voor: ${String(naam).trim()} (brandpreventie en bouw sector Nederland)`;

  // Probeer Responses API met web zoeken voor actuele concurrentinfo
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const webResp = await (client as any).responses.create({
      model: "gpt-4o",
      tools: [{ type: "web_search_preview" }],
      input: `${systeemPrompt}\n\n${gebruikerPrompt}`,
      text: { format: { type: "json_object" } },
    });
    const tekst: string = webResp.output_text ?? "{}";
    let data: Record<string, string | null> = {};
    try { data = JSON.parse(tekst) as Record<string, string | null>; } catch { data = {}; }
    return res.json({ velden: data });
  } catch (webErr) {
    req.log.warn({ err: webErr }, "Web search niet beschikbaar voor ai-profiel, fallback naar kennismodel");
  }

  // Fallback: chat completions op basis van trainingsdata
  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 800,
      messages: [
        { role: "system", content: systeemPrompt },
        { role: "user", content: gebruikerPrompt },
      ],
      response_format: { type: "json_object" },
    });
    const tekst = completion.choices[0]?.message?.content ?? "{}";
    let data: Record<string, string | null> = {};
    try { data = JSON.parse(tekst) as Record<string, string | null>; } catch { data = {}; }
    res.json({ velden: data });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "AI-verzoek mislukt" });
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

router.post("/crm/marktintelligentie/ai-scan", lezen, async (req, res) => {
  if (!heeftOpenAi()) return res.status(503).json({ error: "AI niet beschikbaar" });
  const client = maakOpenAiClient();
  const vandaag = new Date().toISOString().slice(0, 10);

  const systeemPrompt = `Je bent een marktintelligentie-assistent voor FPS Brandpreventie, een Nederlands bedrijf gespecialiseerd in brandveiligheid en brandpreventieve voorzieningen (branddeuren, doorvoeringen, brandkleppen, coating, manchetten). Vandaag is het ${vandaag}. Genereer realistische marktinformatie op basis van actuele trends in brandpreventie, bouw en utiliteit in Nederland.`;

  const gebruikerPrompt = `Zoek en genereer 6 tot 8 actuele marktintelligentie-signalen voor een brandpreventiebedrijf werkzaam in Nederland. Gebruik realistische Nederlandse organisaties (woningcorporaties zoals Ymere, Woonstad Rotterdam, Vestia, gemeenten, aannemers), bronnen (Cobouw, TenderNed, BNR Nieuwsradio, Bouwend Nederland, LinkedIn, AD, Vastgoedjournaal, NOS) en regio's (Nederlandse provincies of steden).

Signaaltypen:
- nieuws: algemeen marktnieuws, bouwprojecten, regelgeving, normwijzigingen (NEN, WBDBO, brandveiligheid)
- aanbesteding: openbare aanbestedingen voor brandpreventie- of onderhoudsopdrachten
- concurrentie: bewegingen van concurrenten (nieuwe vestigingen, overnames, certificeringen)
- kans: kansen voor FPS (renovatieprogramma's, nieuwbouwprojecten, samenwerkingen)
- risico: risico's (prijsdruk, arbeidstekort, regelgevingswijzigingen, marktaandeel)
- overig: overig relevant marktnieuws

Retourneer ALLEEN valide JSON zonder extra toelichting:
{"signalen": [{"type": "nieuws|aanbesteding|concurrentie|kans|risico|overig", "titel": "max 80 tekens", "inhoud": "korte samenvatting max 200 tekens", "bron": "naam van de bron", "bron_url": "https://...", "regio": "Nederlandse provincie of stad", "datum": "YYYY-MM-DD"}, ...]}`;

  // Probeer Responses API met web zoeken voor actueel nieuws
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const webResp = await (client as any).responses.create({
      model: "gpt-4o",
      tools: [{ type: "web_search_preview" }],
      input: `${systeemPrompt}\n\n${gebruikerPrompt}`,
      text: { format: { type: "json_object" } },
    });
    const tekst: string = webResp.output_text ?? "";
    const parsed = JSON.parse(tekst);
    return res.json(parsed.signalen ?? []);
  } catch (webErr) {
    req.log.warn({ err: webErr }, "Web search niet beschikbaar, fallback naar kennismodel");
  }

  // Fallback: chat completions op basis van marktkennis
  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systeemPrompt },
        { role: "user", content: gebruikerPrompt },
      ],
      max_tokens: 2000,
    });
    const tekst = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(tekst);
    res.json(parsed.signalen ?? []);
  } catch (err) {
    req.log.error(err);
    res.status(503).json({ error: "AI niet beschikbaar" });
  }
});

router.get("/crm/scout/status", lezen, async (req, res) => {
  try {
    const status = await getScoutStatus();
    res.json(status);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/crm/scout/start", schrijven, async (req, res) => {
  if (!heeftOpenAi()) return res.status(503).json({ error: "AI niet beschikbaar" });
  try {
    voerScoutUit().catch((err) => req.log.error({ err }, "Scout fout (achtergrond)"));
    const status = await getScoutStatus();
    res.json(status);
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
      .values({ type: type || "nieuws", bronType: "handmatig", organisatieId: organisatie_id ? parseId(organisatie_id) : null, concurrentId: concurrent_id ? parseId(concurrent_id) : null, titel, inhoud, bron, regio, datum, aangemaaktDoor: gebruikerId })
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

// ── AI COACH ──────────────────────────────────────────────────────────────────
router.post("/crm/ai-coach", lezen, async (req, res) => {
  const { scherm, klant_id, context: extraContext } = req.body as {
    scherm?: string;
    klant_id?: number | null;
    context?: Record<string, unknown>;
  };

  if (!scherm) return res.status(400).json({ error: "scherm is verplicht" });

  let orgContext = "";

  if (klant_id) {
    try {
      const [klant] = await db.select().from(crmKlantenTable).where(eq(crmKlantenTable.id, parseId(klant_id))).limit(1);
      if (klant) {
        const contacten = await db.select().from(crmContactpersonenTable).where(eq(crmContactpersonenTable.klantId, parseId(klant_id)));
        const kansen = await db.select().from(crmCommercieelTable).where(eq(crmCommercieelTable.klantId, parseId(klant_id)));
        const communicatie = await db.select().from(crmCommunicatieTable)
          .where(eq(crmCommunicatieTable.klantId, parseId(klant_id)))
          .orderBy(desc(crmCommunicatieTable.aangemaaktOp))
          .limit(3);

        const beslissers = contacten.filter(c => c.beslisrol === "beslisser").map(c => c.naam);
        const inkopers = contacten.filter(c => c.beslisrol === "inkoper").map(c => c.naam);
        const technici = contacten.filter(c => c.beslisrol === "technisch_adviseur").map(c => c.naam);
        const openKansen = kansen.filter(k => !["gewonnen", "verloren"].includes(k.fase ?? ""));
        const recentContact = communicatie[0];

        orgContext = `
Organisatie: ${klant.naam}
Type: ${klant.type ?? "onbekend"}
Status: ${klant.status} | Relatie: ${klant.relatieStatus ?? "onbekend"}
Stad: ${klant.stad ?? "onbekend"} | Regio: ${klant.regio ?? "onbekend"}
Contactpersonen (${contacten.length}):
  - Beslissers: ${beslissers.join(", ") || "geen geregistreerd"}
  - Inkopers: ${inkopers.join(", ") || "geen geregistreerd"}
  - Technisch adviseurs: ${technici.join(", ") || "geen geregistreerd"}
Open kansen: ${openKansen.length} (fases: ${openKansen.map(k => k.fase).join(", ") || "geen"})
Meest recente communicatie: ${recentContact ? `${recentContact.type} op ${recentContact.datum}` : "geen geregistreerd"}
Opmerkingen: ${klant.opmerkingen ?? "geen"}
`.trim();
      }
    } catch (e) {
      req.log.warn({ err: e }, "Kon organisatiecontext niet laden voor AI Coach");
    }
  }

  const schermUitleg: Record<string, string> = {
    dashboard: "overzicht van alle relaties, kansen en actiepunten",
    organisatie_overzicht: "lijst van alle organisaties (klanten, prospects en partners)",
    organisatie_detail: "detailpagina van een specifieke organisatie",
    projectkansen: "commerciële pipeline met alle lopende trajecten",
    contactpersonen: "overzicht van alle contactpersonen",
    concurrenten: "concurrentieanalyse met sterktes en zwaktes",
    marktintelligentie: "marktinformatie, nieuws en signalen",
    kennisbibliotheek: "commerciële kennisbibliotheek van FPS",
  };

  const fallback = {
    waarom: `Je bekijkt het ${schermUitleg[scherm] ?? scherm} binnen FPS Connect CRM.`,
    ontbreekt: [] as string[],
    advies: "Houd klantgegevens actueel en noteer elke interactie. Elk contactmoment is een kans om de relatie te versterken.",
    effect: null as string | null,
    kennisblok: "Vraag bij woningcorporaties altijd naar het MJOP (meerjaren onderhoudsplan). Daarin staan alle geplande renovaties en onderhoudsprojecten voor de komende jaren.",
  };

  if (!heeftOpenAi()) {
    return res.json(fallback);
  }

  const client = maakOpenAiClient();

  const systeemPrompt = `Je bent een ervaren commercieel coach voor FPS Brandpreventie, een bedrijf dat brandpreventieve voorzieningen (branddeur, doorvoering, manchet, coating, brandklep) installeert en onderhoudt.

Klanten van FPS: woningcorporaties, VvE-beheerders, aannemers, zorginstellingen, gemeenten, vastgoedbeheerders.
FPS-diensten: brandpreventie, opname, RGA, droge blusleiding, bouwkundig herstel, onderhoudscontract.

Cruciale FPS-commerciële kennis:
- Bij woningcorporaties: altijd vragen naar het MJOP (meerjaren onderhoudsplan) — dat onthult toekomstige projecten
- Eerst vertrouwen opbouwen, daarna pas verkopen — zeker bij corporaties en zorginstellingen
- Beslissingshiërarchie: opzichter (technisch) → inkoper (commercieel) → directie/RvB (strategisch)
- Na een offerte altijd bellen na één week — niet e-mailen
- Key accounts minimaal één keer per kwartaal persoonlijk bezoeken
- Een ontbrekende beslisser in de contactenlijst is een risico voor de deal
- Bij gemeenten: aanbestedingen zijn leidend — tijdig signaleren is essentieel

Geef coaching als JSON met precies deze velden:
- waarom: 2-3 zinnen over waarom de gebruiker dit scherm bekijkt en wat het doel is
- ontbreekt: array van max 3 concrete dingen die ontbreken of verbeterd kunnen worden (lege array als er niets ontbreekt)
- advies: 1-3 zinnen concrete actie die nu uitgevoerd moet worden (specifiek voor de situatie)
- effect: 1-2 zinnen over het verwachte resultaat van het advies (of null)
- kennisblok: één praktische FPS-kennistip (of null)

Wees specifiek en concreet. Geen generieke CRM-teksten. Altijd in het Nederlands.`;

  const gebruikerPrompt = `Huidig scherm: ${scherm} (${schermUitleg[scherm] ?? scherm})
${orgContext ? `\nOrganisatiecontext:\n${orgContext}` : ""}
${extraContext ? `\nExtra informatie: ${JSON.stringify(extraContext)}` : ""}

Geef coaching voor deze gebruiker.`;

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systeemPrompt },
        { role: "user", content: gebruikerPrompt },
      ],
      max_tokens: 900,
    });
    const tekst = completion.choices[0]?.message?.content ?? "{}";
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(tekst); } catch { /* gebruik fallback */ }
    res.json({
      waarom: (parsed.waarom as string) || fallback.waarom,
      ontbreekt: (parsed.ontbreekt as string[]) || [],
      advies: (parsed.advies as string) || fallback.advies,
      effect: (parsed.effect as string | null) ?? null,
      kennisblok: (parsed.kennisblok as string | null) ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "CRM AI Coach fout");
    res.status(503).json({ error: "AI niet beschikbaar" });
  }
});

export default router;
