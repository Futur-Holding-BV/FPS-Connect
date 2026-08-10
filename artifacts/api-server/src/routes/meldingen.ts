import { Router } from "express";
import { db } from "@workspace/db";
import { gebruikersMeldingenTable } from "@workspace/db";
import { MELDINGEN_EERSTE_REACTIE_PROMPT } from "../lib/aiPrompts";
import { eq, desc, and, ilike } from "drizzle-orm";
import { requireBevoegdheid, requireAuth } from "../middlewares/auth";
import { aiGateway, heeftGateway } from "../lib/aiGateway";

const router = Router();
const alleenBeheerder = requireBevoegdheid("systeem", 2);

// ── POST /meldingen ───────────────────────────────────────────────────────────
router.post("/meldingen", requireAuth, async (req, res): Promise<void> => {
  const {
    type,
    omschrijving,
    urgentie = "normaal",
    pagina,
    browser_info,
    screenshot_data,
    tech_context_toestemming = false,
    tech_context,
  } = req.body ?? {};

  if (!type || !omschrijving) {
    res.status(400).json({ error: "type en omschrijving zijn verplicht" });
    return;
  }
  if (!["bug", "vraag", "verbetering"].includes(String(type))) {
    res.status(400).json({ error: "Ongeldig type" });
    return;
  }
  if (!["laag", "normaal", "hoog", "blokkerend"].includes(String(urgentie))) {
    res.status(400).json({ error: "Ongeldige urgentie" });
    return;
  }
  if (screenshot_data && String(screenshot_data).length > 3_000_000) {
    res.status(413).json({ error: "Screenshot te groot (max 2MB)" });
    return;
  }

  const sess = { gebruikerId: req.session.userId, naam: undefined as string | undefined, rol: req.session.rol };

  const [melding] = await db.insert(gebruikersMeldingenTable).values({
    type: String(type),
    omschrijving: String(omschrijving),
    urgentie: String(urgentie),
    status: "nieuw",
    gebruikerId: sess?.gebruikerId ?? null,
    gebruikerNaam: sess?.naam ?? null,
    gebruikerRol: sess?.rol ?? null,
    pagina: pagina ? String(pagina) : null,
    browserInfo: browser_info ? String(browser_info) : null,
    screenshotData: screenshot_data ? String(screenshot_data) : null,
    techContextToestemming: Boolean(tech_context_toestemming),
    techContext: tech_context_toestemming ? (tech_context ? String(tech_context) : null) : null,
  }).returning();

  // AI eerste-reactie — asynchron, geen blokkering
  if (heeftGateway()) {
    setImmediate(async () => {
      try {
        const systeemPrompt = MELDINGEN_EERSTE_REACTIE_PROMPT.tekst;

        const resultaat = await aiGateway.chat("fast", {
          messages: [
            { role: "system", content: systeemPrompt },
            { role: "user", content: `Type: ${type}\nUrgentie: ${urgentie}\nPagina: ${pagina ?? "onbekend"}\nOmschrijving: ${omschrijving}` },
          ],
          max_tokens: 300,
        }, 30_000, { module: "meldingen", functie: "eerste-reactie", gebruikerId: sess?.gebruikerId ?? null, promptNaam: MELDINGEN_EERSTE_REACTIE_PROMPT.naam, promptVersie: MELDINGEN_EERSTE_REACTIE_PROMPT.versie });

        let classificatie = type === "bug" ? "ui-bug" : type === "vraag" ? "vraag" : "feature-request";
        if (resultaat.ok) {
          const txt = resultaat.inhoud.toLowerCase();
          if (txt.includes("dataprobleem")) classificatie = "dataprobleem";
          else if (txt.includes("workflow")) classificatie = "workflow-bug";
        }

        await db.update(gebruikersMeldingenTable)
          .set({ aiReactie: resultaat.ok ? resultaat.inhoud : null, aiClassificatie: classificatie, bijgewerktOp: new Date() })
          .where(eq(gebruikersMeldingenTable.id, melding.id));
      } catch { /* fire-and-forget */ }
    });
  }

  res.status(201).json({
    id: melding.id,
    status: melding.status,
    bericht: "Uw melding is ontvangen. U ontvangt zo snel mogelijk een reactie.",
  });
});

// ── GET /meldingen — beheerdersoverzicht ──────────────────────────────────────
router.get("/meldingen", alleenBeheerder, async (req, res): Promise<void> => {
  const qs = req.query;
  function strParam(v: unknown): string | undefined {
    const s = Array.isArray(v) ? v[0] : v;
    return typeof s === "string" ? s : undefined;
  }
  const typeFilter = strParam(qs["type"]);
  const urgentieFilter = strParam(qs["urgentie"]);
  const statusFilter = strParam(qs["status"]);
  const naamFilter = strParam(qs["gebruiker_naam"]);

  const filters = [];
  if (typeFilter) filters.push(eq(gebruikersMeldingenTable.type, typeFilter));
  if (urgentieFilter) filters.push(eq(gebruikersMeldingenTable.urgentie, urgentieFilter));
  if (statusFilter) filters.push(eq(gebruikersMeldingenTable.status, statusFilter));
  if (naamFilter) filters.push(ilike(gebruikersMeldingenTable.gebruikerNaam, `%${naamFilter}%`));

  const rijen = await db
    .select()
    .from(gebruikersMeldingenTable)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .where(filters.length > 0 ? and(...(filters as any)) : undefined)
    .orderBy(desc(gebruikersMeldingenTable.aangemaaktOp))
    .limit(200);

  res.json(rijen.map((m) => ({
    id: m.id,
    type: m.type,
    omschrijving: m.omschrijving,
    urgentie: m.urgentie,
    status: m.status,
    gebruiker_naam: m.gebruikerNaam,
    gebruiker_rol: m.gebruikerRol,
    pagina: m.pagina,
    browser_info: m.browserInfo,
    heeft_screenshot: m.screenshotData != null,
    tech_context_toestemming: m.techContextToestemming,
    ai_reactie: m.aiReactie,
    ai_classificatie: m.aiClassificatie,
    ai_workaround: m.aiWorkaround,
    interne_notitie: m.interneNotitie,
    aangemaakt_op: m.aangemaaktOp.toISOString(),
    bijgewerkt_op: m.bijgewerktOp?.toISOString() ?? null,
  })));
});

// ── GET /meldingen/:id — detail incl. screenshot ─────────────────────────────
router.get("/meldingen/:id", alleenBeheerder, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params["id"] ?? "0"));
  const [m] = await db.select().from(gebruikersMeldingenTable).where(eq(gebruikersMeldingenTable.id, id));
  if (!m) {
    res.status(404).json({ error: "Melding niet gevonden" });
    return;
  }

  res.json({
    id: m.id,
    type: m.type,
    omschrijving: m.omschrijving,
    urgentie: m.urgentie,
    status: m.status,
    gebruiker_id: m.gebruikerId,
    gebruiker_naam: m.gebruikerNaam,
    gebruiker_rol: m.gebruikerRol,
    pagina: m.pagina,
    browser_info: m.browserInfo,
    screenshot_data: m.screenshotData,
    tech_context_toestemming: m.techContextToestemming,
    tech_context: m.techContext,
    ai_reactie: m.aiReactie,
    ai_classificatie: m.aiClassificatie,
    ai_workaround: m.aiWorkaround,
    interne_notitie: m.interneNotitie,
    aangemaakt_op: m.aangemaaktOp.toISOString(),
    bijgewerkt_op: m.bijgewerktOp?.toISOString() ?? null,
  });
});

// ── PATCH /meldingen/:id ──────────────────────────────────────────────────────
router.patch("/meldingen/:id", alleenBeheerder, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params["id"] ?? "0"));
  const { status, interne_notitie, ai_workaround } = req.body ?? {};

  if (status && !["nieuw", "in_behandeling", "opgelost", "afgewezen"].includes(String(status))) {
    res.status(400).json({ error: "Ongeldige status" });
    return;
  }

  const sess = { gebruikerId: req.session.userId };
  const nu = new Date();

  if (status !== undefined) {
    await db.update(gebruikersMeldingenTable)
      .set({ status: String(status), behandeldDoor: sess?.gebruikerId ?? null, bijgewerktOp: nu })
      .where(eq(gebruikersMeldingenTable.id, id));
  }
  if (interne_notitie !== undefined) {
    await db.update(gebruikersMeldingenTable)
      .set({ interneNotitie: interne_notitie !== null ? String(interne_notitie) : null, bijgewerktOp: nu })
      .where(eq(gebruikersMeldingenTable.id, id));
  }
  if (ai_workaround !== undefined) {
    await db.update(gebruikersMeldingenTable)
      .set({ aiWorkaround: ai_workaround !== null ? String(ai_workaround) : null, bijgewerktOp: nu })
      .where(eq(gebruikersMeldingenTable.id, id));
  }

  const [bijgewerkt] = await db.select().from(gebruikersMeldingenTable).where(eq(gebruikersMeldingenTable.id, id));
  if (!bijgewerkt) {
    res.status(404).json({ error: "Melding niet gevonden" });
    return;
  }

  res.json({ id: bijgewerkt.id, status: bijgewerkt.status, bijgewerkt_op: bijgewerkt.bijgewerktOp?.toISOString() });
});

export default router;
