import { Router } from "express";
import { db } from "@workspace/db";
import {
  veiligheidToolboxenTable,
  veiligheidToolboxVragenTable,
  veiligheidToolboxAfrondingTable,
  toolboxMaandOpdrachtenTable,
  toolboxMaandStatusTable,
  veiligheidLmrasTable,
  veiligheidMeldingenTable,
  veiligheidMeldingenActiesTable,
  gebruikersTable,
  medewerkersTable,
  gebouwenTable,
  opdrachtenTable,
} from "@workspace/db";
import { eq, and, desc, sql, count, gte, lt, isNotNull } from "drizzle-orm";
import { requireAuth, requireBevoegdheid } from "../middlewares/auth.js";
import { maakOpenAiClient, heeftOpenAi } from "../lib/openai.js";
import { createRequire } from "module";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { logger } from "../lib/logger.js";

const objectStorage = new ObjectStorageService();

// pdf-parse is CJS-only; gebruik createRequire voor ESM-compatibiliteit
const _require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pdfParse: (buf: Buffer) => Promise<{ text: string }> = _require("pdf-parse");

const veiligheidRouter = Router();

const lezenVeiligheid = requireBevoegdheid("toolbox", 1);
const schrijvenVeiligheid = requireBevoegdheid("toolbox", 3);
const verwijderenVeiligheid = requireBevoegdheid("toolbox", 4);

// ── helpers ──────────────────────────────────────────────────────────────────

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function mapToolbox(
  t: Record<string, unknown>,
  extra?: {
    vragen?: Array<Record<string, unknown>>;
    afrondingCount?: number;
    mijnAfronding?: Record<string, unknown> | null;
    aangemaaktDoorNaam?: string | null;
  }
) {
  const base = {
    id: t.id,
    titel: t.titel,
    categorie: t.categorie,
    moeilijkheid: t.moeilijkheid,
    geschatte_leestijd: t.geschatteLeestijd ?? null,
    gepubliceerd: t.gepubliceerd,
    verplicht: t.verplicht,
    doelgroep: t.doelgroep,
    doelgroep_details: t.doelgroepDetails ?? {},
    min_score: t.minScore,
    geldigheid_maanden: t.geldigheidMaanden,
    tags: Array.isArray(t.tags) ? t.tags : [],
    ai_verwerkt_op: t.aiVerwerktOp ? (t.aiVerwerktOp as Date).toISOString() : null,
    aangemaakt_op: (t.aangemaaktOp as Date).toISOString(),
    bijgewerkt_op: (t.bijgewerktOp as Date).toISOString(),
    aangemaakt_door_naam: extra?.aangemaaktDoorNaam ?? null,
    afronding_count: extra?.afrondingCount ?? 0,
    heeft_pdf: !!t.pdfPad,
    heeft_video: !!t.videoUrl,
    mijn_afronding: extra?.mijnAfronding ? mapAfronding(extra.mijnAfronding) : null,
  };

  if (extra?.vragen !== undefined) {
    return {
      ...base,
      intro: t.intro ?? null,
      ai_samenvatting: t.aiSamenvatting ?? null,
      ai_risicos: Array.isArray(t.aiRisicos) ? t.aiRisicos : [],
      ai_maatregelen: Array.isArray(t.aiMaatregelen) ? t.aiMaatregelen : [],
      ai_fouten: Array.isArray(t.aiFouten) ? t.aiFouten : [],
      ai_stoppen: t.aiStoppen ?? null,
      pdf_pad: t.pdfPad ?? null,
      video_url: t.videoUrl ?? null,
      afbeeldingen: Array.isArray(t.afbeeldingen) ? t.afbeeldingen : [],
      zoekwoorden: Array.isArray(t.zoekwoorden) ? t.zoekwoorden : [],
      vragen: extra.vragen.map(mapVraag),
    };
  }

  return base;
}

function mapVraag(v: Record<string, unknown>) {
  return {
    id: v.id,
    toolbox_id: v.toolboxId,
    volgorde: v.volgorde,
    vraag: v.vraag,
    opties: Array.isArray(v.opties) ? v.opties : [],
    uitleg: v.uitleg ?? null,
  };
}

function mapAfronding(a: Record<string, unknown>) {
  return {
    id: a.id,
    toolbox_id: a.toolboxId,
    gebruiker_id: a.gebruikerId,
    gebruiker_naam: (a as any).gebruikerNaam ?? null,
    score: a.score,
    max_score: a.maxScore,
    geslaagd: (a.score as number) >= (a.maxScore as number) * ((a as any).minScorePct ?? 0.7),
    handtekening: a.handtekening ?? null,
    bevestigd_op: (a.bevestigdOp as Date).toISOString(),
    geldig_tot: a.geldigTot ? (a.geldigTot as Date).toISOString() : null,
  };
}

// ── LIST ──────────────────────────────────────────────────────────────────────

veiligheidRouter.get("/veiligheid/toolboxen", lezenVeiligheid, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const { categorie, gepubliceerd } = req.query;

    const rows = await db
      .select({
        t: veiligheidToolboxenTable,
        aangemaakt_door_naam: gebruikersTable.naam,
      })
      .from(veiligheidToolboxenTable)
      .leftJoin(gebruikersTable, eq(veiligheidToolboxenTable.aangemaaktDoorId, gebruikersTable.id))
      .orderBy(desc(veiligheidToolboxenTable.bijgewerktOp));

    const toolboxIds = rows.map((r) => r.t.id);

    // Afrondingen voor huidige user
    const mijnAfrondingen = toolboxIds.length
      ? await db
          .select()
          .from(veiligheidToolboxAfrondingTable)
          .where(eq(veiligheidToolboxAfrondingTable.gebruikerId, userId))
      : [];

    const afrondingCounts = toolboxIds.length
      ? await db
          .select({
            toolbox_id: veiligheidToolboxAfrondingTable.toolboxId,
            cnt: count(),
          })
          .from(veiligheidToolboxAfrondingTable)
          .groupBy(veiligheidToolboxAfrondingTable.toolboxId)
      : [];

    const countMap = Object.fromEntries(afrondingCounts.map((c) => [c.toolbox_id, Number(c.cnt)]));
    const mijnMap: Record<number, Record<string, unknown> | null> = {};
    for (const a of mijnAfrondingen) {
      if (!mijnMap[a.toolboxId] || (a.bevestigdOp as Date) > (mijnMap[a.toolboxId]!.bevestigdOp as Date)) {
        mijnMap[a.toolboxId] = a as unknown as Record<string, unknown>;
      }
    }

    let resultaat = rows.map((r) =>
      mapToolbox(r.t as unknown as Record<string, unknown>, {
        afrondingCount: countMap[r.t.id] ?? 0,
        mijnAfronding: mijnMap[r.t.id] ?? null,
        aangemaaktDoorNaam: r.aangemaakt_door_naam ?? null,
      })
    );

    if (categorie && typeof categorie === "string") {
      resultaat = resultaat.filter((t) => t.categorie === categorie);
    }
    if (gepubliceerd !== undefined) {
      const pub = gepubliceerd === "true";
      resultaat = resultaat.filter((t) => t.gepubliceerd === pub);
    }

    res.json(resultaat);
  } catch (err) {
    req.log.error(err, "GET /veiligheid/toolboxen");
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── CREATE ────────────────────────────────────────────────────────────────────

veiligheidRouter.post("/veiligheid/toolboxen", schrijvenVeiligheid, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const { vragen: vragenInput, ...rest } = req.body;

    if (!rest.titel?.trim()) {
      return res.status(400).json({ error: "Titel verplicht" });
    }

    const [toolbox] = await db
      .insert(veiligheidToolboxenTable)
      .values({
        titel: rest.titel.trim(),
        categorie: rest.categorie ?? "overig",
        moeilijkheid: rest.moeilijkheid ?? "gemiddeld",
        geschatteLeestijd: rest.geschatte_leestijd ?? null,
        intro: rest.intro ?? null,
        gepubliceerd: rest.gepubliceerd ?? false,
        verplicht: rest.verplicht ?? false,
        doelgroep: rest.doelgroep ?? "iedereen",
        minScore: rest.min_score ?? 70,
        geldigheidMaanden: rest.geldigheid_maanden ?? 12,
        pdfPad: rest.pdf_pad ?? null,
        videoUrl: rest.video_url ?? null,
        tags: rest.tags ?? [],
        aangemaaktDoorId: userId,
      })
      .returning();

    if (Array.isArray(vragenInput) && vragenInput.length > 0) {
      await db.insert(veiligheidToolboxVragenTable).values(
        vragenInput.map((v: any, i: number) => ({
          toolboxId: toolbox.id,
          volgorde: i,
          vraag: v.vraag,
          opties: v.opties ?? [],
          uitleg: v.uitleg ?? null,
        }))
      );
    }

    res.status(201).json(mapToolbox(toolbox as unknown as Record<string, unknown>));
  } catch (err) {
    req.log.error(err, "POST /veiligheid/toolboxen");
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── DETAIL ────────────────────────────────────────────────────────────────────

veiligheidRouter.get("/veiligheid/toolboxen/:id", lezenVeiligheid, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const userId = req.session.userId!;

    const [row] = await db
      .select({
        t: veiligheidToolboxenTable,
        aangemaakt_door_naam: gebruikersTable.naam,
      })
      .from(veiligheidToolboxenTable)
      .leftJoin(gebruikersTable, eq(veiligheidToolboxenTable.aangemaaktDoorId, gebruikersTable.id))
      .where(eq(veiligheidToolboxenTable.id, id));

    if (!row) return res.status(404).json({ error: "Niet gevonden" });

    const vragen = await db
      .select()
      .from(veiligheidToolboxVragenTable)
      .where(eq(veiligheidToolboxVragenTable.toolboxId, id))
      .orderBy(veiligheidToolboxVragenTable.volgorde);

    const [mijnAfronding] = await db
      .select()
      .from(veiligheidToolboxAfrondingTable)
      .where(
        and(
          eq(veiligheidToolboxAfrondingTable.toolboxId, id),
          eq(veiligheidToolboxAfrondingTable.gebruikerId, userId)
        )
      )
      .orderBy(desc(veiligheidToolboxAfrondingTable.bevestigdOp))
      .limit(1);

    const [{ cnt }] = await db
      .select({ cnt: count() })
      .from(veiligheidToolboxAfrondingTable)
      .where(eq(veiligheidToolboxAfrondingTable.toolboxId, id));

    res.json(
      mapToolbox(row.t as unknown as Record<string, unknown>, {
        vragen: vragen as unknown as Array<Record<string, unknown>>,
        afrondingCount: Number(cnt),
        mijnAfronding: mijnAfronding as unknown as Record<string, unknown> ?? null,
        aangemaaktDoorNaam: row.aangemaakt_door_naam ?? null,
      })
    );
  } catch (err) {
    req.log.error(err, "GET /veiligheid/toolboxen/:id");
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── UPDATE ────────────────────────────────────────────────────────────────────

veiligheidRouter.patch("/veiligheid/toolboxen/:id", schrijvenVeiligheid, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const { vragen: vragenInput, ...rest } = req.body;

    const update: Record<string, unknown> = { bijgewerktOp: new Date() };
    if (rest.titel !== undefined) update.titel = rest.titel.trim();
    if (rest.categorie !== undefined) update.categorie = rest.categorie;
    if (rest.moeilijkheid !== undefined) update.moeilijkheid = rest.moeilijkheid;
    if (rest.geschatte_leestijd !== undefined) update.geschatteLeestijd = rest.geschatte_leestijd;
    if (rest.intro !== undefined) update.intro = rest.intro;
    if (rest.gepubliceerd !== undefined) update.gepubliceerd = rest.gepubliceerd;
    if (rest.verplicht !== undefined) update.verplicht = rest.verplicht;
    if (rest.doelgroep !== undefined) update.doelgroep = rest.doelgroep;
    if (rest.min_score !== undefined) update.minScore = rest.min_score;
    if (rest.geldigheid_maanden !== undefined) update.geldigheidMaanden = rest.geldigheid_maanden;
    if (rest.pdf_pad !== undefined) update.pdfPad = rest.pdf_pad;
    if (rest.video_url !== undefined) update.videoUrl = rest.video_url;
    if (rest.tags !== undefined) update.tags = rest.tags;

    const [updated] = await db
      .update(veiligheidToolboxenTable)
      .set(update)
      .where(eq(veiligheidToolboxenTable.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: "Niet gevonden" });

    if (Array.isArray(vragenInput)) {
      await db.delete(veiligheidToolboxVragenTable).where(eq(veiligheidToolboxVragenTable.toolboxId, id));
      if (vragenInput.length > 0) {
        await db.insert(veiligheidToolboxVragenTable).values(
          vragenInput.map((v: any, i: number) => ({
            toolboxId: id,
            volgorde: i,
            vraag: v.vraag,
            opties: v.opties ?? [],
            uitleg: v.uitleg ?? null,
          }))
        );
      }
    }

    const vragen = await db
      .select()
      .from(veiligheidToolboxVragenTable)
      .where(eq(veiligheidToolboxVragenTable.toolboxId, id))
      .orderBy(veiligheidToolboxVragenTable.volgorde);

    res.json(
      mapToolbox(updated as unknown as Record<string, unknown>, {
        vragen: vragen as unknown as Array<Record<string, unknown>>,
      })
    );
  } catch (err) {
    req.log.error(err, "PATCH /veiligheid/toolboxen/:id");
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── DELETE ────────────────────────────────────────────────────────────────────

veiligheidRouter.delete("/veiligheid/toolboxen/:id", verwijderenVeiligheid, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    await db.delete(veiligheidToolboxenTable).where(eq(veiligheidToolboxenTable.id, id));
    res.status(204).end();
  } catch (err) {
    req.log.error(err, "DELETE /veiligheid/toolboxen/:id");
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── PUBLICEREN ────────────────────────────────────────────────────────────────

veiligheidRouter.post("/veiligheid/toolboxen/:id/publiceren", schrijvenVeiligheid, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const [updated] = await db
      .update(veiligheidToolboxenTable)
      .set({ gepubliceerd: true, bijgewerktOp: new Date() })
      .where(eq(veiligheidToolboxenTable.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: "Niet gevonden" });
    res.json(mapToolbox(updated as unknown as Record<string, unknown>));
  } catch (err) {
    req.log.error(err, "POST /veiligheid/toolboxen/:id/publiceren");
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── AI ANALYSE ────────────────────────────────────────────────────────────────

veiligheidRouter.post("/veiligheid/toolboxen/:id/ai-analyse", schrijvenVeiligheid, async (req, res) => {
  try {
    if (!heeftOpenAi()) {
      return res.status(503).json({ error: "AI niet beschikbaar" });
    }
    const id = parseInt(String(req.params.id));
    const [toolbox] = await db
      .select()
      .from(veiligheidToolboxenTable)
      .where(eq(veiligheidToolboxenTable.id, id));

    if (!toolbox) return res.status(404).json({ error: "Niet gevonden" });

    let pdfTekst = "";
    if (toolbox.pdfPad) {
      try {
        const file = await objectStorage.getObjectEntityFile(toolbox.pdfPad);
        const chunks: Buffer[] = [];
        const stream = file.createReadStream();
        for await (const chunk of stream) chunks.push(Buffer.from(chunk));
        const buffer = Buffer.concat(chunks);
        const parsed = await pdfParse(buffer);
        pdfTekst = parsed.text?.slice(0, 12000) ?? "";
      } catch (e) {
        logger.warn({ err: e, toolboxId: id }, "PDF tekst extractie mislukt");
      }
    }

    const bronTekst = pdfTekst || toolbox.titel;

    const openai = maakOpenAiClient();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 2000,
      messages: [
        {
          role: "system",
          content:
            "Je bent een VCA-veiligheidsexpert. Analyseer het gegeven toolbox-document en geef een gestructureerde samenvatting in het Nederlands. Geef altijd geldig JSON terug (geen markdown, geen uitleg buiten JSON).",
        },
        {
          role: "user",
          content: `Analyseer deze veiligheidstoolbox en geef JSON terug:\n\n${bronTekst}\n\nFormaat:\n{\n  "samenvatting": "max 300 tekens",\n  "risicos": ["risico 1","risico 2","risico 3"],\n  "maatregelen": ["maatregel 1","maatregel 2","maatregel 3"],\n  "fouten": ["fout 1","fout 2"],\n  "stoppen": "Wanneer direct stoppen met werk",\n  "geschatte_leestijd": 3,\n  "zoekwoorden": ["woord1","woord2"],\n  "tags": ["tag1","tag2"],\n  "vragen": [\n    {\n      "vraag": "Vraag tekst?",\n      "opties": [\n        {"tekst": "Optie A", "correct": true},\n        {"tekst": "Optie B", "correct": false},\n        {"tekst": "Optie C", "correct": false}\n      ],\n      "uitleg": "Toelichting op het juiste antwoord"\n    }\n  ]\n}\n\nGenereer 4-6 meerkeuzevragen over de belangrijkste veiligheidspunten.`,
        },
      ],
    });

    const raw = completion.choices[0].message.content ?? "{}";
    let analyse: any = {};
    try {
      analyse = JSON.parse(raw.replace(/^```json\s*/, "").replace(/\s*```$/, ""));
    } catch {
      logger.warn({ raw }, "AI JSON parse mislukt voor toolbox analyse");
    }

    const [updated] = await db
      .update(veiligheidToolboxenTable)
      .set({
        aiSamenvatting: analyse.samenvatting ?? null,
        aiRisicos: analyse.risicos ?? [],
        aiMaatregelen: analyse.maatregelen ?? [],
        aiFouten: analyse.fouten ?? [],
        aiStoppen: analyse.stoppen ?? null,
        geschatteLeestijd: analyse.geschatte_leestijd ?? null,
        zoekwoorden: analyse.zoekwoorden ?? [],
        tags: analyse.tags ?? [],
        aiVerwerktOp: new Date(),
        bijgewerktOp: new Date(),
      })
      .where(eq(veiligheidToolboxenTable.id, id))
      .returning();

    if (Array.isArray(analyse.vragen) && analyse.vragen.length > 0) {
      await db.delete(veiligheidToolboxVragenTable).where(eq(veiligheidToolboxVragenTable.toolboxId, id));
      await db.insert(veiligheidToolboxVragenTable).values(
        analyse.vragen.map((v: any, i: number) => ({
          toolboxId: id,
          volgorde: i,
          vraag: v.vraag,
          opties: v.opties ?? [],
          uitleg: v.uitleg ?? null,
        }))
      );
    }

    const vragen = await db
      .select()
      .from(veiligheidToolboxVragenTable)
      .where(eq(veiligheidToolboxVragenTable.toolboxId, id))
      .orderBy(veiligheidToolboxVragenTable.volgorde);

    res.json(
      mapToolbox(updated as unknown as Record<string, unknown>, {
        vragen: vragen as unknown as Array<Record<string, unknown>>,
      })
    );
  } catch (err) {
    req.log.error(err, "POST /veiligheid/toolboxen/:id/ai-analyse");
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── AFRONDEN ──────────────────────────────────────────────────────────────────

veiligheidRouter.post("/veiligheid/toolboxen/:id/afronden", lezenVeiligheid, async (req, res) => {
  try {
    const toolboxId = parseInt(String(req.params.id));
    const userId = req.session.userId!;
    const { antwoorden, handtekening } = req.body;

    if (!handtekening?.trim()) {
      return res.status(400).json({ error: "Handtekening verplicht" });
    }

    const [toolbox] = await db
      .select()
      .from(veiligheidToolboxenTable)
      .where(eq(veiligheidToolboxenTable.id, toolboxId));

    if (!toolbox) return res.status(404).json({ error: "Niet gevonden" });

    const vragen = await db
      .select()
      .from(veiligheidToolboxVragenTable)
      .where(eq(veiligheidToolboxVragenTable.toolboxId, toolboxId))
      .orderBy(veiligheidToolboxVragenTable.volgorde);

    let score = 0;
    const maxScore = vragen.length;

    if (Array.isArray(antwoorden) && vragen.length > 0) {
      for (let i = 0; i < vragen.length; i++) {
        const gekozenIndex = antwoorden[i];
        const opties = (vragen[i].opties as any[]) ?? [];
        if (typeof gekozenIndex === "number" && opties[gekozenIndex]?.correct === true) {
          score++;
        }
      }
    } else if (vragen.length === 0) {
      score = 1;
    }

    const now = new Date();
    const geldigTot = addMonths(now, toolbox.geldigheidMaanden);

    const [afronding] = await db
      .insert(veiligheidToolboxAfrondingTable)
      .values({
        toolboxId,
        gebruikerId: userId,
        score,
        maxScore: Math.max(maxScore, 1),
        handtekening: handtekening.trim(),
        bevestigdOp: now,
        geldigTot,
      })
      .returning();

    res.status(201).json({
      ...mapAfronding({ ...afronding, minScorePct: toolbox.minScore / 100 } as unknown as Record<string, unknown>),
      geslaagd: score >= Math.ceil(Math.max(maxScore, 1) * (toolbox.minScore / 100)),
    });
  } catch (err) {
    req.log.error(err, "POST /veiligheid/toolboxen/:id/afronden");
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── AFRONDINGEN (beheerder) ───────────────────────────────────────────────────

veiligheidRouter.get("/veiligheid/toolboxen/:id/afrondingen", schrijvenVeiligheid, async (req, res) => {
  try {
    const toolboxId = parseInt(String(req.params.id));

    const rows = await db
      .select({
        a: veiligheidToolboxAfrondingTable,
        naam: gebruikersTable.naam,
      })
      .from(veiligheidToolboxAfrondingTable)
      .leftJoin(gebruikersTable, eq(veiligheidToolboxAfrondingTable.gebruikerId, gebruikersTable.id))
      .where(eq(veiligheidToolboxAfrondingTable.toolboxId, toolboxId))
      .orderBy(desc(veiligheidToolboxAfrondingTable.bevestigdOp));

    const [toolbox] = await db
      .select({ minScore: veiligheidToolboxenTable.minScore })
      .from(veiligheidToolboxenTable)
      .where(eq(veiligheidToolboxenTable.id, toolboxId));

    const minScorePct = (toolbox?.minScore ?? 70) / 100;

    res.json(
      rows.map((r) =>
        mapAfronding({
          ...r.a,
          gebruikerNaam: r.naam,
          minScorePct,
        } as unknown as Record<string, unknown>)
      )
    );
  } catch (err) {
    req.log.error(err, "GET /veiligheid/toolboxen/:id/afrondingen");
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── MIJN AFRONDING ────────────────────────────────────────────────────────────

veiligheidRouter.get("/veiligheid/toolboxen/:id/mijn-afronding", lezenVeiligheid, async (req, res) => {
  try {
    const toolboxId = parseInt(String(req.params.id));
    const userId = req.session.userId!;

    const [afronding] = await db
      .select()
      .from(veiligheidToolboxAfrondingTable)
      .where(
        and(
          eq(veiligheidToolboxAfrondingTable.toolboxId, toolboxId),
          eq(veiligheidToolboxAfrondingTable.gebruikerId, userId)
        )
      )
      .orderBy(desc(veiligheidToolboxAfrondingTable.bevestigdOp))
      .limit(1);

    if (!afronding) return res.json(null);

    const [toolbox] = await db
      .select({ minScore: veiligheidToolboxenTable.minScore })
      .from(veiligheidToolboxenTable)
      .where(eq(veiligheidToolboxenTable.id, toolboxId));

    res.json(
      mapAfronding({
        ...afronding,
        minScorePct: (toolbox?.minScore ?? 70) / 100,
      } as unknown as Record<string, unknown>)
    );
  } catch (err) {
    req.log.error(err, "GET /veiligheid/toolboxen/:id/mijn-afronding");
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── AI KOPPELING SUGGESTIE ────────────────────────────────────────────────────

veiligheidRouter.post("/veiligheid/toolboxen/koppeling-suggestie", lezenVeiligheid, async (req, res) => {
  try {
    if (!heeftOpenAi()) {
      return res.status(503).json({ error: "AI niet beschikbaar" });
    }
    const { werkzaamheid } = req.body ?? {};
    if (!werkzaamheid || typeof werkzaamheid !== "string") {
      return res.status(400).json({ error: "werkzaamheid verplicht" });
    }

    const alleToolboxen = await db
      .select({
        id: veiligheidToolboxenTable.id,
        titel: veiligheidToolboxenTable.titel,
        categorie: veiligheidToolboxenTable.categorie,
        zoekwoorden: veiligheidToolboxenTable.zoekwoorden,
        tags: veiligheidToolboxenTable.tags,
      })
      .from(veiligheidToolboxenTable)
      .orderBy(veiligheidToolboxenTable.categorie, veiligheidToolboxenTable.titel);

    if (alleToolboxen.length === 0) {
      return res.json({ suggesties: [] });
    }

    const catalogusTekst = alleToolboxen
      .map((t) => `ID ${t.id}: ${t.titel} (${t.categorie})`)
      .join("\n");

    const openai = maakOpenAiClient();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 1000,
      messages: [
        {
          role: "system",
          content:
            "Je bent een VCA-veiligheidsadviseur voor een brandpreventiebedrijf. Selecteer uit de toolboxcatalogus de meest relevante toolboxen voor de beschreven werkzaamheid. Geef altijd geldig JSON terug zonder markdown.",
        },
        {
          role: "user",
          content: `Werkzaamheid: "${werkzaamheid}"\n\nCatalogus:\n${catalogusTekst}\n\nSelecteer 3-6 relevante toolboxen. Formaat:\n{"suggesties":[{"id":1,"titel":"...","categorie":"...","reden":"kort waarom relevant"}]}`,
        },
      ],
    });

    const raw = completion.choices[0].message.content ?? "{}";
    let parsed: { suggesties?: Array<{ id: number; titel: string; categorie: string; reden: string }> } = {};
    try {
      parsed = JSON.parse(raw.replace(/^```json\s*/, "").replace(/\s*```$/, ""));
    } catch {
      logger.warn({ raw }, "AI JSON parse mislukt voor koppeling-suggestie");
    }

    // Valideer IDs tegen de echte catalogus
    const geldigeIds = new Set(alleToolboxen.map((t) => t.id));
    const suggesties = (parsed.suggesties ?? [])
      .filter((s) => geldigeIds.has(s.id))
      .slice(0, 8);

    res.json({ suggesties });
  } catch (err) {
    req.log.error(err, "POST /veiligheid/toolboxen/koppeling-suggestie");
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── UPLOAD URL ────────────────────────────────────────────────────────────────

veiligheidRouter.get("/veiligheid/toolboxen/upload-url", schrijvenVeiligheid, async (req, res) => {
  try {
    const { uploadURL, objectPath } = await objectStorage.getObjectEntityUploadURL();
    res.json({ upload_url: uploadURL, object_path: objectPath });
  } catch (err) {
    req.log.error(err, "GET /veiligheid/toolboxen/upload-url");
    res.status(500).json({ error: "Interne fout" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// LMRA
// ═══════════════════════════════════════════════════════════════════════════════

veiligheidRouter.get("/veiligheid/lmras", lezenVeiligheid, async (req, res) => {
  try {
    const rijen = await db
      .select({
        id: veiligheidLmrasTable.id,
        gebouwId: veiligheidLmrasTable.gebouwId,
        gebouwNaam: gebouwenTable.naam,
        projectNaam: veiligheidLmrasTable.projectNaam,
        locatieOmschrijving: veiligheidLmrasTable.locatieOmschrijving,
        werkzaamheden: veiligheidLmrasTable.werkzaamheden,
        risicos: veiligheidLmrasTable.risicos,
        maatregelen: veiligheidLmrasTable.maatregelen,
        veiligVoorAanvang: veiligheidLmrasTable.veiligVoorAanvang,
        handtekening: veiligheidLmrasTable.handtekening,
        fotoPaden: veiligheidLmrasTable.fotoPaden,
        gpsLat: veiligheidLmrasTable.gpsLat,
        gpsLng: veiligheidLmrasTable.gpsLng,
        medewerkerNaam: veiligheidLmrasTable.medewerkerNaam,
        medewerkerId: veiligheidLmrasTable.medewerkerId,
        aiVoorstel: veiligheidLmrasTable.aiVoorstel,
        aangemaaktDoorId: veiligheidLmrasTable.aangemaaktDoorId,
        aangemaaktOp: veiligheidLmrasTable.aangemaaktOp,
        bijgewerktOp: veiligheidLmrasTable.bijgewerktOp,
      })
      .from(veiligheidLmrasTable)
      .leftJoin(gebouwenTable, eq(veiligheidLmrasTable.gebouwId, gebouwenTable.id))
      .orderBy(desc(veiligheidLmrasTable.aangemaaktOp));
    res.json(
      rijen.map((r) => ({
        id: r.id,
        gebouw_id: r.gebouwId ?? null,
        gebouw_naam: r.gebouwNaam ?? null,
        project_naam: r.projectNaam ?? null,
        locatie_omschrijving: r.locatieOmschrijving,
        werkzaamheden: r.werkzaamheden,
        risicos: (r.risicos as string[]) ?? [],
        maatregelen: (r.maatregelen as string[]) ?? [],
        veilig_voor_aanvang: r.veiligVoorAanvang,
        handtekening: r.handtekening ?? null,
        foto_paden: (r.fotoPaden as string[]) ?? [],
        gps_lat: r.gpsLat ?? null,
        gps_lng: r.gpsLng ?? null,
        medewerker_naam: r.medewerkerNaam ?? null,
        medewerker_id: r.medewerkerId ?? null,
        ai_voorstel: r.aiVoorstel,
        aangemaakt_door_id: r.aangemaaktDoorId ?? null,
        aangemaakt_op: r.aangemaaktOp.toISOString(),
        bijgewerkt_op: r.bijgewerktOp?.toISOString() ?? null,
      })),
    );
  } catch (err) {
    req.log.error(err, "GET /veiligheid/lmras");
    res.status(500).json({ error: "Interne fout" });
  }
});

veiligheidRouter.post("/veiligheid/lmras", lezenVeiligheid, async (req, res) => {
  try {
    const gebruiker = (req as any).session?.gebruiker;
    const {
      gebouw_id, medewerker_id: body_medewerker_id, project_naam,
      locatie_omschrijving, werkzaamheden,
      risicos, maatregelen, veilig_voor_aanvang, handtekening,
      foto_paden, gps_lat, gps_lng, ai_voorstel,
    } = req.body;

    if (!locatie_omschrijving || !werkzaamheden) {
      return res.status(400).json({ error: "locatie_omschrijving en werkzaamheden zijn verplicht" });
    }

    const medewerkerNaam = gebruiker
      ? `${gebruiker.naam ?? ""} ${gebruiker.achternaam ?? ""}`.trim() || gebruiker.email
      : null;

    // Zoek medewerker_id uit sessie als niet meegegeven in body
    let resolvedMedewerkerId: number | null = body_medewerker_id ?? null;
    if (!resolvedMedewerkerId && gebruiker?.id) {
      const [med] = await db.select({ id: medewerkersTable.id })
        .from(medewerkersTable)
        .where(eq(medewerkersTable.gebruikerId, gebruiker.id))
        .limit(1);
      resolvedMedewerkerId = med?.id ?? null;
    }

    const [rij] = await db
      .insert(veiligheidLmrasTable)
      .values({
        gebouwId: gebouw_id ?? null,
        projectNaam: project_naam ?? null,
        locatieOmschrijving: locatie_omschrijving,
        werkzaamheden,
        risicos: risicos ?? [],
        maatregelen: maatregelen ?? [],
        veiligVoorAanvang: veilig_voor_aanvang ?? true,
        handtekening: handtekening ?? null,
        fotoPaden: foto_paden ?? [],
        gpsLat: gps_lat ?? null,
        gpsLng: gps_lng ?? null,
        medewerkerNaam,
        medewerkerId: resolvedMedewerkerId,
        aiVoorstel: ai_voorstel === true,
        aangemaaktDoorId: gebruiker?.id ?? null,
        bijgewerktOp: new Date(),
      })
      .returning();
    let gebouwNaam: string | null = null;
    if (rij.gebouwId) {
      const [geb] = await db.select({ naam: gebouwenTable.naam }).from(gebouwenTable).where(eq(gebouwenTable.id, rij.gebouwId)).limit(1);
      gebouwNaam = geb?.naam ?? null;
    }
    res.status(201).json({
      id: rij.id,
      gebouw_id: rij.gebouwId ?? null,
      gebouw_naam: gebouwNaam,
      project_naam: rij.projectNaam ?? null,
      locatie_omschrijving: rij.locatieOmschrijving,
      werkzaamheden: rij.werkzaamheden,
      risicos: (rij.risicos as string[]) ?? [],
      maatregelen: (rij.maatregelen as string[]) ?? [],
      veilig_voor_aanvang: rij.veiligVoorAanvang,
      handtekening: rij.handtekening ?? null,
      foto_paden: (rij.fotoPaden as string[]) ?? [],
      gps_lat: rij.gpsLat ?? null,
      gps_lng: rij.gpsLng ?? null,
      medewerker_naam: rij.medewerkerNaam ?? null,
      medewerker_id: rij.medewerkerId ?? null,
      ai_voorstel: rij.aiVoorstel,
      aangemaakt_door_id: rij.aangemaaktDoorId ?? null,
      aangemaakt_op: rij.aangemaaktOp.toISOString(),
      bijgewerkt_op: rij.bijgewerktOp?.toISOString() ?? null,
    });
  } catch (err) {
    req.log.error(err, "POST /veiligheid/lmras");
    res.status(500).json({ error: "Interne fout" });
  }
});

veiligheidRouter.get("/veiligheid/lmras/upload-url", schrijvenVeiligheid, async (req, res) => {
  try {
    const { uploadURL, objectPath } = await objectStorage.getObjectEntityUploadURL();
    res.json({ upload_url: uploadURL, object_path: objectPath });
  } catch (err) {
    req.log.error(err, "GET /veiligheid/lmras/upload-url");
    res.status(500).json({ error: "Interne fout" });
  }
});

veiligheidRouter.post("/veiligheid/lmras/ai-voorstel", lezenVeiligheid, async (req, res) => {
  try {
    if (!heeftOpenAi()) return res.status(503).json({ error: "AI niet beschikbaar" });

    const { gebouw_id, werkzaamheden_omschrijving } = req.body;
    if (!gebouw_id) return res.status(400).json({ error: "gebouw_id is verplicht" });

    const [gebouw] = await db
      .select({
        naam: gebouwenTable.naam,
        adres: gebouwenTable.adres,
        stad: gebouwenTable.stad,
        gebouwType: gebouwenTable.gebouwType,
        omschrijving: gebouwenTable.omschrijving,
      })
      .from(gebouwenTable)
      .where(eq(gebouwenTable.id, Number(gebouw_id)))
      .limit(1);

    if (!gebouw) return res.status(404).json({ error: "Gebouw niet gevonden" });

    const context = [
      `Gebouwnaam: ${gebouw.naam}`,
      `Adres: ${gebouw.adres}${gebouw.stad ? `, ${gebouw.stad}` : ""}`,
      gebouw.gebouwType ? `Type: ${gebouw.gebouwType}` : null,
      gebouw.omschrijving ? `Omschrijving: ${gebouw.omschrijving}` : null,
      werkzaamheden_omschrijving ? `Geplande werkzaamheden: ${werkzaamheden_omschrijving}` : null,
    ].filter(Boolean).join("\n");

    const openai = maakOpenAiClient();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 800,
      messages: [
        {
          role: "system",
          content: `Je bent een veiligheidsadviseur voor brandpreventiewerk. 
Genereer een pre-ingevulde LMRA (Laatste Minuut Risico Analyse) op basis van de gebouwinformatie.
Retourneer uitsluitend JSON (geen extra tekst) in het formaat:
{
  "locatie_omschrijving": "string",
  "werkzaamheden": "string",
  "risicos": ["string", ...],
  "maatregelen": ["string", ...]
}
Zorg voor 3-5 relevante risico's en bijbehorende maatregelen voor brandpreventiewerk.`,
        },
        { role: "user", content: `Gebouwinformatie:\n${context}` },
      ],
    });

    const raw = completion.choices[0].message.content ?? "{}";
    const cleanJson = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    let voorstel: { locatie_omschrijving: string; werkzaamheden: string; risicos: string[]; maatregelen: string[] };
    try {
      voorstel = JSON.parse(cleanJson);
    } catch {
      return res.status(500).json({ error: "AI-antwoord kon niet worden verwerkt" });
    }

    res.json({
      locatie_omschrijving: voorstel.locatie_omschrijving ?? "",
      werkzaamheden: voorstel.werkzaamheden ?? "",
      risicos: Array.isArray(voorstel.risicos) ? voorstel.risicos : [],
      maatregelen: Array.isArray(voorstel.maatregelen) ? voorstel.maatregelen : [],
    });
  } catch (err) {
    req.log.error(err, "POST /veiligheid/lmras/ai-voorstel");
    res.status(500).json({ error: "Interne fout" });
  }
});

veiligheidRouter.get("/mijn/lmra-status", requireAuth, async (req, res) => {
  try {
    const gebruiker = (req as any).session?.gebruiker;
    if (!gebruiker?.id) return res.status(401).json({ error: "Niet ingelogd" });

    const gebouwId = req.query.gebouw_id ? Number(req.query.gebouw_id) : null;
    if (!gebouwId) return res.status(400).json({ error: "gebouw_id is verplicht" });

    // Medewerker opzoeken op basis van gebruiker
    const [med] = await db
      .select({ id: medewerkersTable.id })
      .from(medewerkersTable)
      .where(eq(medewerkersTable.gebruikerId, gebruiker.id))
      .limit(1);

    const medewerkerId = med?.id ?? null;

    // Controleer of LMRA verplicht is:
    // Zoek actieve opdracht voor dit gebouw met budget_uren >= 8 of null
    const opdrachten = await db
      .select({ budgetUren: opdrachtenTable.budgetUren })
      .from(opdrachtenTable)
      .where(
        and(
          eq(opdrachtenTable.gebouwId, gebouwId),
          eq(opdrachtenTable.status, "actief"),
        ),
      )
      .limit(5);

    // Vrijgesteld als ER een opdracht is met budget_uren < 8
    const heeftKleineOpdracht = opdrachten.some(
      (o) => o.budgetUren !== null && o.budgetUren < 8,
    );

    if (heeftKleineOpdracht) {
      return res.json({
        vereist: false,
        voltooid: false,
        lmra_id: null,
        reden_vrijstelling: "Project heeft een geplande omvang van minder dan 8 uur",
      });
    }

    // LMRA voltooid als medewerker al een LMRA heeft voor dit gebouw
    let bestaandeLmra: { id: number } | null = null;
    if (medewerkerId) {
      const [lmra] = await db
        .select({ id: veiligheidLmrasTable.id })
        .from(veiligheidLmrasTable)
        .where(
          and(
            eq(veiligheidLmrasTable.gebouwId, gebouwId),
            eq(veiligheidLmrasTable.medewerkerId, medewerkerId),
          ),
        )
        .orderBy(desc(veiligheidLmrasTable.aangemaaktOp))
        .limit(1);
      bestaandeLmra = lmra ?? null;
    }

    res.json({
      vereist: true,
      voltooid: !!bestaandeLmra,
      lmra_id: bestaandeLmra?.id ?? null,
      reden_vrijstelling: null,
    });
  } catch (err) {
    req.log.error(err, "GET /mijn/lmra-status");
    res.status(500).json({ error: "Interne fout" });
  }
});

veiligheidRouter.get("/veiligheid/lmras/:id", lezenVeiligheid, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const [rij] = await db
      .select({
        lmra: veiligheidLmrasTable,
        gebouwNaam: gebouwenTable.naam,
      })
      .from(veiligheidLmrasTable)
      .leftJoin(gebouwenTable, eq(veiligheidLmrasTable.gebouwId, gebouwenTable.id))
      .where(eq(veiligheidLmrasTable.id, id));
    if (!rij) return res.status(404).json({ error: "Niet gevonden" });
    const r = rij.lmra;
    res.json({
      id: r.id,
      gebouw_id: r.gebouwId ?? null,
      gebouw_naam: rij.gebouwNaam ?? null,
      project_naam: r.projectNaam ?? null,
      locatie_omschrijving: r.locatieOmschrijving,
      werkzaamheden: r.werkzaamheden,
      risicos: (r.risicos as string[]) ?? [],
      maatregelen: (r.maatregelen as string[]) ?? [],
      veilig_voor_aanvang: r.veiligVoorAanvang,
      handtekening: r.handtekening ?? null,
      foto_paden: (r.fotoPaden as string[]) ?? [],
      gps_lat: r.gpsLat ?? null,
      gps_lng: r.gpsLng ?? null,
      medewerker_naam: r.medewerkerNaam ?? null,
      aangemaakt_door_id: r.aangemaaktDoorId ?? null,
      aangemaakt_op: r.aangemaaktOp.toISOString(),
      bijgewerkt_op: r.bijgewerktOp?.toISOString() ?? null,
    });
  } catch (err) {
    req.log.error(err, "GET /veiligheid/lmras/:id");
    res.status(500).json({ error: "Interne fout" });
  }
});

veiligheidRouter.patch("/veiligheid/lmras/:id", schrijvenVeiligheid, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const {
      locatie_omschrijving, werkzaamheden, risicos, maatregelen,
      veilig_voor_aanvang, handtekening, foto_paden, gps_lat, gps_lng,
      project_naam, gebouw_id,
    } = req.body;
    const [rij] = await db
      .update(veiligheidLmrasTable)
      .set({
        ...(locatie_omschrijving !== undefined && { locatieOmschrijving: locatie_omschrijving }),
        ...(werkzaamheden !== undefined && { werkzaamheden }),
        ...(risicos !== undefined && { risicos }),
        ...(maatregelen !== undefined && { maatregelen }),
        ...(veilig_voor_aanvang !== undefined && { veiligVoorAanvang: veilig_voor_aanvang }),
        ...(handtekening !== undefined && { handtekening }),
        ...(foto_paden !== undefined && { fotoPaden: foto_paden }),
        ...(gps_lat !== undefined && { gpsLat: gps_lat }),
        ...(gps_lng !== undefined && { gpsLng: gps_lng }),
        ...(project_naam !== undefined && { projectNaam: project_naam }),
        ...(gebouw_id !== undefined && { gebouwId: gebouw_id }),
        bijgewerktOp: new Date(),
      })
      .where(eq(veiligheidLmrasTable.id, id))
      .returning();
    if (!rij) return res.status(404).json({ error: "Niet gevonden" });
    res.json({
      id: rij.id,
      gebouw_id: rij.gebouwId ?? null,
      project_naam: rij.projectNaam ?? null,
      locatie_omschrijving: rij.locatieOmschrijving,
      werkzaamheden: rij.werkzaamheden,
      risicos: (rij.risicos as string[]) ?? [],
      maatregelen: (rij.maatregelen as string[]) ?? [],
      veilig_voor_aanvang: rij.veiligVoorAanvang,
      handtekening: rij.handtekening ?? null,
      foto_paden: (rij.fotoPaden as string[]) ?? [],
      gps_lat: rij.gpsLat ?? null,
      gps_lng: rij.gpsLng ?? null,
      medewerker_naam: rij.medewerkerNaam ?? null,
      aangemaakt_door_id: rij.aangemaaktDoorId ?? null,
      aangemaakt_op: rij.aangemaaktOp.toISOString(),
      bijgewerkt_op: rij.bijgewerktOp?.toISOString() ?? null,
    });
  } catch (err) {
    req.log.error(err, "PATCH /veiligheid/lmras/:id");
    res.status(500).json({ error: "Interne fout" });
  }
});

veiligheidRouter.delete("/veiligheid/lmras/:id", verwijderenVeiligheid, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    await db.delete(veiligheidLmrasTable).where(eq(veiligheidLmrasTable.id, id));
    res.status(204).end();
  } catch (err) {
    req.log.error(err, "DELETE /veiligheid/lmras/:id");
    res.status(500).json({ error: "Interne fout" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// VEILIGHEIDSMELDINGEN
// ═══════════════════════════════════════════════════════════════════════════════

function mapMelding(r: typeof veiligheidMeldingenTable.$inferSelect & { toegewezen_aan_naam?: string | null }) {
  return {
    id: r.id,
    type: r.type,
    omschrijving: r.omschrijving,
    locatie: r.locatie ?? null,
    gebouw_id: r.gebouwId ?? null,
    project_naam: r.projectNaam ?? null,
    foto_paden: (r.fotoPaden as string[]) ?? [],
    prioriteit: r.prioriteit,
    status: r.status,
    melder_naam: r.melderNaam ?? null,
    gemeld_door_id: r.gemeldDoorId ?? null,
    toegewezen_aan_id: r.toegewezenAanId ?? null,
    toegewezen_aan_naam: r.toegewezen_aan_naam ?? null,
    aangemaakt_op: r.aangemaaktOp.toISOString(),
    bijgewerkt_op: r.bijgewerktOp?.toISOString() ?? null,
  };
}

veiligheidRouter.get("/veiligheid/meldingen", lezenVeiligheid, async (req, res) => {
  try {
    const toegewezenAlias = db
      .$with("toegewezen")
      .as(db.select({ id: gebruikersTable.id, naam: sql<string>`coalesce(nullif(${gebruikersTable.naam}, ''), ${gebruikersTable.email})` }).from(gebruikersTable));
    const rijen = await db
      .select({
        id: veiligheidMeldingenTable.id,
        type: veiligheidMeldingenTable.type,
        omschrijving: veiligheidMeldingenTable.omschrijving,
        locatie: veiligheidMeldingenTable.locatie,
        gebouwId: veiligheidMeldingenTable.gebouwId,
        projectNaam: veiligheidMeldingenTable.projectNaam,
        fotoPaden: veiligheidMeldingenTable.fotoPaden,
        prioriteit: veiligheidMeldingenTable.prioriteit,
        status: veiligheidMeldingenTable.status,
        melderNaam: veiligheidMeldingenTable.melderNaam,
        gemeldDoorId: veiligheidMeldingenTable.gemeldDoorId,
        toegewezenAanId: veiligheidMeldingenTable.toegewezenAanId,
        toegewezen_aan_naam: sql<string | null>`coalesce(u.naam || ' ' || u.achternaam, u.email)`,
        aangemaaktOp: veiligheidMeldingenTable.aangemaaktOp,
        bijgewerktOp: veiligheidMeldingenTable.bijgewerktOp,
      })
      .from(veiligheidMeldingenTable)
      .leftJoin(gebruikersTable, eq(gebruikersTable.id, veiligheidMeldingenTable.toegewezenAanId))
      .orderBy(desc(veiligheidMeldingenTable.aangemaaktOp));
    res.json(rijen.map((r) => mapMelding(r as any)));
  } catch (err) {
    req.log.error(err, "GET /veiligheid/meldingen");
    res.status(500).json({ error: "Interne fout" });
  }
});

veiligheidRouter.post("/veiligheid/meldingen", lezenVeiligheid, async (req, res) => {
  try {
    const gebruiker = (req as any).session?.gebruiker;
    const {
      type, omschrijving, locatie, gebouw_id, project_naam,
      foto_paden, prioriteit, toegewezen_aan_id,
    } = req.body;
    if (!type || !omschrijving) {
      return res.status(400).json({ error: "type en omschrijving zijn verplicht" });
    }
    const melderNaam = gebruiker
      ? `${gebruiker.naam ?? ""} ${gebruiker.achternaam ?? ""}`.trim() || gebruiker.email
      : null;
    const [rij] = await db
      .insert(veiligheidMeldingenTable)
      .values({
        type,
        omschrijving,
        locatie: locatie ?? null,
        gebouwId: gebouw_id ?? null,
        projectNaam: project_naam ?? null,
        fotoPaden: foto_paden ?? [],
        prioriteit: prioriteit ?? "middel",
        status: "open",
        melderNaam,
        gemeldDoorId: gebruiker?.id ?? null,
        toegewezenAanId: toegewezen_aan_id ?? null,
        bijgewerktOp: new Date(),
      })
      .returning();
    res.status(201).json(mapMelding(rij as any));
  } catch (err) {
    req.log.error(err, "POST /veiligheid/meldingen");
    res.status(500).json({ error: "Interne fout" });
  }
});

veiligheidRouter.get("/veiligheid/meldingen/upload-url", schrijvenVeiligheid, async (req, res) => {
  try {
    const { uploadURL, objectPath } = await objectStorage.getObjectEntityUploadURL();
    res.json({ upload_url: uploadURL, object_path: objectPath });
  } catch (err) {
    req.log.error(err, "GET /veiligheid/meldingen/upload-url");
    res.status(500).json({ error: "Interne fout" });
  }
});

veiligheidRouter.get("/veiligheid/meldingen/:id", lezenVeiligheid, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const [rij] = await db
      .select({
        id: veiligheidMeldingenTable.id,
        type: veiligheidMeldingenTable.type,
        omschrijving: veiligheidMeldingenTable.omschrijving,
        locatie: veiligheidMeldingenTable.locatie,
        gebouwId: veiligheidMeldingenTable.gebouwId,
        projectNaam: veiligheidMeldingenTable.projectNaam,
        fotoPaden: veiligheidMeldingenTable.fotoPaden,
        prioriteit: veiligheidMeldingenTable.prioriteit,
        status: veiligheidMeldingenTable.status,
        melderNaam: veiligheidMeldingenTable.melderNaam,
        gemeldDoorId: veiligheidMeldingenTable.gemeldDoorId,
        toegewezenAanId: veiligheidMeldingenTable.toegewezenAanId,
        toegewezen_aan_naam: sql<string | null>`coalesce(u.naam || ' ' || u.achternaam, u.email)`,
        aangemaaktOp: veiligheidMeldingenTable.aangemaaktOp,
        bijgewerktOp: veiligheidMeldingenTable.bijgewerktOp,
      })
      .from(veiligheidMeldingenTable)
      .leftJoin(gebruikersTable, eq(gebruikersTable.id, veiligheidMeldingenTable.toegewezenAanId))
      .where(eq(veiligheidMeldingenTable.id, id));
    if (!rij) return res.status(404).json({ error: "Niet gevonden" });
    res.json(mapMelding(rij as any));
  } catch (err) {
    req.log.error(err, "GET /veiligheid/meldingen/:id");
    res.status(500).json({ error: "Interne fout" });
  }
});

veiligheidRouter.patch("/veiligheid/meldingen/:id", schrijvenVeiligheid, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const {
      type, omschrijving, locatie, gebouw_id, project_naam,
      foto_paden, prioriteit, status, toegewezen_aan_id,
    } = req.body;
    const [rij] = await db
      .update(veiligheidMeldingenTable)
      .set({
        ...(type !== undefined && { type }),
        ...(omschrijving !== undefined && { omschrijving }),
        ...(locatie !== undefined && { locatie }),
        ...(gebouw_id !== undefined && { gebouwId: gebouw_id }),
        ...(project_naam !== undefined && { projectNaam: project_naam }),
        ...(foto_paden !== undefined && { fotoPaden: foto_paden }),
        ...(prioriteit !== undefined && { prioriteit }),
        ...(status !== undefined && { status }),
        ...(toegewezen_aan_id !== undefined && { toegewezenAanId: toegewezen_aan_id }),
        bijgewerktOp: new Date(),
      })
      .where(eq(veiligheidMeldingenTable.id, id))
      .returning();
    if (!rij) return res.status(404).json({ error: "Niet gevonden" });
    res.json(mapMelding(rij as any));
  } catch (err) {
    req.log.error(err, "PATCH /veiligheid/meldingen/:id");
    res.status(500).json({ error: "Interne fout" });
  }
});

veiligheidRouter.delete("/veiligheid/meldingen/:id", verwijderenVeiligheid, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    await db.delete(veiligheidMeldingenTable).where(eq(veiligheidMeldingenTable.id, id));
    res.status(204).end();
  } catch (err) {
    req.log.error(err, "DELETE /veiligheid/meldingen/:id");
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── Acties ────────────────────────────────────────────────────────────────────

veiligheidRouter.get("/veiligheid/meldingen/:id/acties", lezenVeiligheid, async (req, res) => {
  try {
    const meldingId = parseInt(String(req.params.id));
    const rijen = await db
      .select()
      .from(veiligheidMeldingenActiesTable)
      .where(eq(veiligheidMeldingenActiesTable.meldingId, meldingId))
      .orderBy(desc(veiligheidMeldingenActiesTable.aangemaaktOp));
    res.json(
      rijen.map((r) => ({
        id: r.id,
        melding_id: r.meldingId,
        omschrijving: r.omschrijving,
        eigenaar_id: r.eigenaarId ?? null,
        eigenaar_naam: r.eigenaarNaam ?? null,
        deadline: r.deadline ?? null,
        status: r.status,
        aangemaakt_op: r.aangemaaktOp.toISOString(),
        bijgewerkt_op: r.bijgewerktOp?.toISOString() ?? null,
      })),
    );
  } catch (err) {
    req.log.error(err, "GET /veiligheid/meldingen/:id/acties");
    res.status(500).json({ error: "Interne fout" });
  }
});

veiligheidRouter.post("/veiligheid/meldingen/:id/acties", schrijvenVeiligheid, async (req, res) => {
  try {
    const meldingId = parseInt(String(req.params.id));
    const { omschrijving, eigenaar_id, eigenaar_naam, deadline } = req.body;
    if (!omschrijving) return res.status(400).json({ error: "omschrijving is verplicht" });
    const [rij] = await db
      .insert(veiligheidMeldingenActiesTable)
      .values({
        meldingId,
        omschrijving,
        eigenaarId: eigenaar_id ?? null,
        eigenaarNaam: eigenaar_naam ?? null,
        deadline: deadline ?? null,
        status: "open",
        bijgewerktOp: new Date(),
      })
      .returning();
    res.status(201).json({
      id: rij.id,
      melding_id: rij.meldingId,
      omschrijving: rij.omschrijving,
      eigenaar_id: rij.eigenaarId ?? null,
      eigenaar_naam: rij.eigenaarNaam ?? null,
      deadline: rij.deadline ?? null,
      status: rij.status,
      aangemaakt_op: rij.aangemaaktOp.toISOString(),
      bijgewerkt_op: rij.bijgewerktOp?.toISOString() ?? null,
    });
  } catch (err) {
    req.log.error(err, "POST /veiligheid/meldingen/:id/acties");
    res.status(500).json({ error: "Interne fout" });
  }
});

veiligheidRouter.patch("/veiligheid/meldingen/:id/acties/:actieId", schrijvenVeiligheid, async (req, res) => {
  try {
    const actieId = parseInt(String(req.params.actieId));
    const { omschrijving, eigenaar_id, eigenaar_naam, deadline, status } = req.body;
    const [rij] = await db
      .update(veiligheidMeldingenActiesTable)
      .set({
        ...(omschrijving !== undefined && { omschrijving }),
        ...(eigenaar_id !== undefined && { eigenaarId: eigenaar_id }),
        ...(eigenaar_naam !== undefined && { eigenaarNaam: eigenaar_naam }),
        ...(deadline !== undefined && { deadline }),
        ...(status !== undefined && { status }),
        bijgewerktOp: new Date(),
      })
      .where(eq(veiligheidMeldingenActiesTable.id, actieId))
      .returning();
    if (!rij) return res.status(404).json({ error: "Niet gevonden" });
    res.json({
      id: rij.id,
      melding_id: rij.meldingId,
      omschrijving: rij.omschrijving,
      eigenaar_id: rij.eigenaarId ?? null,
      eigenaar_naam: rij.eigenaarNaam ?? null,
      deadline: rij.deadline ?? null,
      status: rij.status,
      aangemaakt_op: rij.aangemaaktOp.toISOString(),
      bijgewerkt_op: rij.bijgewerktOp?.toISOString() ?? null,
    });
  } catch (err) {
    req.log.error(err, "PATCH /veiligheid/meldingen/:id/acties/:actieId");
    res.status(500).json({ error: "Interne fout" });
  }
});

veiligheidRouter.delete("/veiligheid/meldingen/:id/acties/:actieId", verwijderenVeiligheid, async (req, res) => {
  try {
    const actieId = parseInt(String(req.params.actieId));
    await db.delete(veiligheidMeldingenActiesTable).where(eq(veiligheidMeldingenActiesTable.id, actieId));
    res.status(204).end();
  } catch (err) {
    req.log.error(err, "DELETE /veiligheid/meldingen/:id/acties/:actieId");
    res.status(500).json({ error: "Interne fout" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// VEILIGHEID DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════

veiligheidRouter.get("/veiligheid/dashboard", lezenVeiligheid, async (req, res) => {
  try {
    const nu = new Date();
    const vandaagStart = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate());
    const weekStart = new Date(nu.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [[lmrasTotaal], [lmrasVandaag], [lmrasWeek],
      [meldingenOpen], [meldingenInBehandeling], [meldingenAfgehandeld], [meldingenKritiek],
      [toolboxenTotaal], [toolboxenAfrondingen],
      [actiesOpen],
    ] = await Promise.all([
      db.select({ c: count() }).from(veiligheidLmrasTable),
      db.select({ c: count() }).from(veiligheidLmrasTable).where(gte(veiligheidLmrasTable.aangemaaktOp, vandaagStart)),
      db.select({ c: count() }).from(veiligheidLmrasTable).where(gte(veiligheidLmrasTable.aangemaaktOp, weekStart)),
      db.select({ c: count() }).from(veiligheidMeldingenTable).where(eq(veiligheidMeldingenTable.status, "open")),
      db.select({ c: count() }).from(veiligheidMeldingenTable).where(eq(veiligheidMeldingenTable.status, "in_behandeling")),
      db.select({ c: count() }).from(veiligheidMeldingenTable).where(eq(veiligheidMeldingenTable.status, "afgehandeld")),
      db.select({ c: count() }).from(veiligheidMeldingenTable).where(and(eq(veiligheidMeldingenTable.prioriteit, "kritiek"), eq(veiligheidMeldingenTable.status, "open"))),
      db.select({ c: count() }).from(veiligheidToolboxenTable).where(eq(veiligheidToolboxenTable.gepubliceerd, true)),
      db.select({ c: count() }).from(veiligheidToolboxAfrondingTable),
      db.select({ c: count() }).from(veiligheidMeldingenActiesTable).where(eq(veiligheidMeldingenActiesTable.status, "open")),
    ]);

    res.json({
      lmras_totaal: Number(lmrasTotaal.c),
      lmras_vandaag: Number(lmrasVandaag.c),
      lmras_week: Number(lmrasWeek.c),
      meldingen_open: Number(meldingenOpen.c),
      meldingen_in_behandeling: Number(meldingenInBehandeling.c),
      meldingen_afgehandeld: Number(meldingenAfgehandeld.c),
      meldingen_kritiek: Number(meldingenKritiek.c),
      toolboxen_totaal: Number(toolboxenTotaal.c),
      toolboxen_afrondingen: Number(toolboxenAfrondingen.c),
      acties_open: Number(actiesOpen.c),
      acties_verlopen: 0,
    });
  } catch (err) {
    req.log.error(err, "GET /veiligheid/dashboard");
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── Maandelijkse toolbox-opdrachten ──────────────────────────────────────────

function mapMaandStatus(
  s: typeof toolboxMaandStatusTable.$inferSelect,
  o: typeof toolboxMaandOpdrachtenTable.$inferSelect,
  tb: { titel: string; categorie: string; intro: string | null; pdfPad: string | null; videoUrl: string | null }
) {
  const nu = new Date();
  const MS_DAG = 86_400_000;
  const eersteAanbieding = s.eersteAanbieding as Date;
  const voltooIdOp = s.voltooIdOp as Date | null;
  const dagenVerstreken = Math.floor((nu.getTime() - eersteAanbieding.getTime()) / MS_DAG);
  const dagenResterend = Math.max(0, 3 - dagenVerstreken);
  const isVerplicht = dagenVerstreken >= 3;
  const kanUitstellen = !isVerplicht && s.aantalUitgesteld < 3 && !voltooIdOp;
  return {
    id: s.id,
    toolbox_id: o.toolboxId,
    toolbox_titel: tb.titel,
    toolbox_categorie: tb.categorie,
    toolbox_intro: tb.intro ?? null,
    toolbox_heeft_pdf: !!tb.pdfPad,
    toolbox_heeft_video: !!tb.videoUrl,
    jaar: o.jaar,
    maand: o.maand,
    eerste_aanbieding: eersteAanbieding.toISOString(),
    aantal_uitgesteld: s.aantalUitgesteld,
    kan_uitstellen: kanUitstellen,
    is_verplicht: isVerplicht,
    dagen_resterend: dagenResterend,
    voltooid: !!voltooIdOp,
    voltooid_op: voltooIdOp ? voltooIdOp.toISOString() : null,
  };
}

veiligheidRouter.get("/veiligheid/toolbox-maandopdrachten", schrijvenVeiligheid, async (req, res) => {
  try {
    const opdrachten = await db
      .select({
        id: toolboxMaandOpdrachtenTable.id,
        toolboxId: toolboxMaandOpdrachtenTable.toolboxId,
        jaar: toolboxMaandOpdrachtenTable.jaar,
        maand: toolboxMaandOpdrachtenTable.maand,
        aangemaktOp: toolboxMaandOpdrachtenTable.aangemaaktOp,
        titel: veiligheidToolboxenTable.titel,
        categorie: veiligheidToolboxenTable.categorie,
      })
      .from(toolboxMaandOpdrachtenTable)
      .leftJoin(veiligheidToolboxenTable, eq(toolboxMaandOpdrachtenTable.toolboxId, veiligheidToolboxenTable.id))
      .orderBy(desc(toolboxMaandOpdrachtenTable.jaar), desc(toolboxMaandOpdrachtenTable.maand));

    const result = await Promise.all(opdrachten.map(async (o) => {
      const [voltooid] = await db.select({ c: count() }).from(toolboxMaandStatusTable)
        .where(and(eq(toolboxMaandStatusTable.opdrachtId, o.id), isNotNull(toolboxMaandStatusTable.voltooIdOp)));
      const [totaal] = await db.select({ c: count() }).from(toolboxMaandStatusTable)
        .where(eq(toolboxMaandStatusTable.opdrachtId, o.id));
      return {
        id: o.id,
        toolbox_id: o.toolboxId,
        toolbox_titel: o.titel ?? "",
        toolbox_categorie: o.categorie ?? "",
        jaar: o.jaar,
        maand: o.maand,
        aangemaakt_op: (o.aangemaktOp as Date).toISOString(),
        totaal_voltooid: Number(voltooid?.c ?? 0),
        totaal_gebruikers: Number(totaal?.c ?? 0),
      };
    }));
    res.json(result);
  } catch (err) {
    req.log.error(err, "GET /veiligheid/toolbox-maandopdrachten");
    res.status(500).json({ error: "Interne fout" });
  }
});

veiligheidRouter.post("/veiligheid/toolbox-maandopdrachten", schrijvenVeiligheid, async (req, res) => {
  try {
    const { toolbox_id, jaar, maand } = req.body as { toolbox_id: number; jaar: number; maand: number };
    if (!toolbox_id || !jaar || !maand) return res.status(400).json({ error: "toolbox_id, jaar en maand zijn verplicht" });

    const [bestaand] = await db.select({ id: toolboxMaandOpdrachtenTable.id })
      .from(toolboxMaandOpdrachtenTable)
      .where(and(eq(toolboxMaandOpdrachtenTable.jaar, jaar), eq(toolboxMaandOpdrachtenTable.maand, maand)))
      .limit(1);
    if (bestaand) return res.status(409).json({ error: "Er is al een toolbox-opdracht voor deze maand" });

    const [nieuw] = await db.insert(toolboxMaandOpdrachtenTable)
      .values({ toolboxId: toolbox_id, jaar, maand, aangemaaktDoorId: req.session.userId ?? null })
      .returning();
    const [tb] = await db.select({ titel: veiligheidToolboxenTable.titel, categorie: veiligheidToolboxenTable.categorie })
      .from(veiligheidToolboxenTable).where(eq(veiligheidToolboxenTable.id, toolbox_id)).limit(1);

    res.status(201).json({
      id: nieuw.id, toolbox_id: nieuw.toolboxId,
      toolbox_titel: tb?.titel ?? "", toolbox_categorie: tb?.categorie ?? "",
      jaar: nieuw.jaar, maand: nieuw.maand,
      aangemaakt_op: (nieuw.aangemaaktOp as Date).toISOString(),
      totaal_voltooid: 0, totaal_gebruikers: 0,
    });
  } catch (err) {
    req.log.error(err, "POST /veiligheid/toolbox-maandopdrachten");
    res.status(500).json({ error: "Interne fout" });
  }
});

veiligheidRouter.delete("/veiligheid/toolbox-maandopdrachten/:id", schrijvenVeiligheid, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [v] = await db.delete(toolboxMaandOpdrachtenTable)
      .where(eq(toolboxMaandOpdrachtenTable.id, id)).returning({ id: toolboxMaandOpdrachtenTable.id });
    if (!v) return res.status(404).json({ error: "Niet gevonden" });
    res.status(204).end();
  } catch (err) {
    req.log.error(err, "DELETE /veiligheid/toolbox-maandopdrachten/:id");
    res.status(500).json({ error: "Interne fout" });
  }
});

veiligheidRouter.get("/veiligheid/toolbox-maandopdrachten/:id/voortgang", schrijvenVeiligheid, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const rijen = await db
      .select({
        gebruiker_id: toolboxMaandStatusTable.gebruikerId,
        naam: gebruikersTable.naam,
        eerste_aanbieding: toolboxMaandStatusTable.eersteAanbieding,
        aantal_uitgesteld: toolboxMaandStatusTable.aantalUitgesteld,
        voltooid_op: toolboxMaandStatusTable.voltooIdOp,
        vraag: toolboxMaandStatusTable.vraag,
      })
      .from(toolboxMaandStatusTable)
      .leftJoin(gebruikersTable, eq(toolboxMaandStatusTable.gebruikerId, gebruikersTable.id))
      .where(eq(toolboxMaandStatusTable.opdrachtId, id))
      .orderBy(desc(toolboxMaandStatusTable.eersteAanbieding));

    res.json(rijen.map(r => ({
      gebruiker_id: r.gebruiker_id,
      naam: r.naam ?? "Onbekend",
      eerste_aanbieding: (r.eerste_aanbieding as Date).toISOString(),
      aantal_uitgesteld: r.aantal_uitgesteld,
      voltooid: !!r.voltooid_op,
      voltooid_op: r.voltooid_op ? (r.voltooid_op as Date).toISOString() : null,
      vraag: r.vraag ?? null,
    })));
  } catch (err) {
    req.log.error(err, "GET /veiligheid/toolbox-maandopdrachten/:id/voortgang");
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── Mijn toolbox-maandopdracht ────────────────────────────────────────────────

async function haalToolboxOp(toolboxId: number) {
  const [tb] = await db.select({
    titel: veiligheidToolboxenTable.titel,
    categorie: veiligheidToolboxenTable.categorie,
    intro: veiligheidToolboxenTable.intro,
    pdfPad: veiligheidToolboxenTable.pdfPad,
    videoUrl: veiligheidToolboxenTable.videoUrl,
  }).from(veiligheidToolboxenTable).where(eq(veiligheidToolboxenTable.id, toolboxId)).limit(1);
  return tb ?? null;
}

veiligheidRouter.get("/mijn/toolbox-maandopdracht", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) return res.status(401).json({ error: "Niet ingelogd" });
    const nu = new Date();
    const [opdracht] = await db.select().from(toolboxMaandOpdrachtenTable)
      .where(and(eq(toolboxMaandOpdrachtenTable.jaar, nu.getFullYear()), eq(toolboxMaandOpdrachtenTable.maand, nu.getMonth() + 1)))
      .limit(1);
    if (!opdracht) return res.json(null);

    let [status] = await db.select().from(toolboxMaandStatusTable)
      .where(and(eq(toolboxMaandStatusTable.opdrachtId, opdracht.id), eq(toolboxMaandStatusTable.gebruikerId, userId)))
      .limit(1);
    if (!status) {
      [status] = await db.insert(toolboxMaandStatusTable)
        .values({ opdrachtId: opdracht.id, gebruikerId: userId }).returning();
    }

    const tb = await haalToolboxOp(opdracht.toolboxId);
    if (!tb) return res.json(null);
    res.json(mapMaandStatus(status, opdracht, tb));
  } catch (err) {
    req.log.error(err, "GET /mijn/toolbox-maandopdracht");
    res.status(500).json({ error: "Interne fout" });
  }
});

veiligheidRouter.post("/mijn/toolbox-maandopdracht/:id/uitstellen", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) return res.status(401).json({ error: "Niet ingelogd" });
    const statusId = Number(req.params.id);
    const [status] = await db.select().from(toolboxMaandStatusTable)
      .where(and(eq(toolboxMaandStatusTable.id, statusId), eq(toolboxMaandStatusTable.gebruikerId, userId))).limit(1);
    if (!status) return res.status(404).json({ error: "Niet gevonden" });
    if (status.voltooIdOp) return res.status(400).json({ error: "Al voltooid" });

    const nu = new Date();
    const dagenVerstreken = Math.floor((nu.getTime() - (status.eersteAanbieding as Date).getTime()) / 86_400_000);
    if (dagenVerstreken >= 3 || status.aantalUitgesteld >= 3) {
      return res.status(403).json({ error: "Kan niet meer uitstellen: deadline verstreken" });
    }

    const [bijgewerkt] = await db.update(toolboxMaandStatusTable)
      .set({ aantalUitgesteld: status.aantalUitgesteld + 1, laatsteUitgesteld: nu, bijgewerktOp: nu })
      .where(eq(toolboxMaandStatusTable.id, statusId)).returning();
    const [opdracht] = await db.select().from(toolboxMaandOpdrachtenTable)
      .where(eq(toolboxMaandOpdrachtenTable.id, status.opdrachtId)).limit(1);
    const tb = await haalToolboxOp(opdracht.toolboxId);
    res.json(mapMaandStatus(bijgewerkt, opdracht, tb!));
  } catch (err) {
    req.log.error(err, "POST /mijn/toolbox-maandopdracht/:id/uitstellen");
    res.status(500).json({ error: "Interne fout" });
  }
});

veiligheidRouter.post("/mijn/toolbox-maandopdracht/:id/voltooien", requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) return res.status(401).json({ error: "Niet ingelogd" });
    const statusId = Number(req.params.id);
    const { vraag } = (req.body ?? {}) as { vraag?: string };

    const [status] = await db.select().from(toolboxMaandStatusTable)
      .where(and(eq(toolboxMaandStatusTable.id, statusId), eq(toolboxMaandStatusTable.gebruikerId, userId))).limit(1);
    if (!status) return res.status(404).json({ error: "Niet gevonden" });

    if (status.voltooIdOp) {
      const [existOpdracht] = await db.select().from(toolboxMaandOpdrachtenTable)
        .where(eq(toolboxMaandOpdrachtenTable.id, status.opdrachtId)).limit(1);
      const existTb = await haalToolboxOp(existOpdracht.toolboxId);
      return res.json(mapMaandStatus(status, existOpdracht, existTb!));
    }

    const nu = new Date();
    const [bijgewerkt] = await db.update(toolboxMaandStatusTable)
      .set({ voltooIdOp: nu, vraag: vraag ?? status.vraag, bijgewerktOp: nu })
      .where(eq(toolboxMaandStatusTable.id, statusId)).returning();
    const [opdracht] = await db.select().from(toolboxMaandOpdrachtenTable)
      .where(eq(toolboxMaandOpdrachtenTable.id, status.opdrachtId)).limit(1);
    const tb = await haalToolboxOp(opdracht.toolboxId);
    res.json(mapMaandStatus(bijgewerkt, opdracht, tb!));
  } catch (err) {
    req.log.error(err, "POST /mijn/toolbox-maandopdracht/:id/voltooien");
    res.status(500).json({ error: "Interne fout" });
  }
});

export default veiligheidRouter;
