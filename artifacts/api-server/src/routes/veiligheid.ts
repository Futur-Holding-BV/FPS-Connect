import { Router } from "express";
import { db } from "@workspace/db";
import {
  veiligheidToolboxenTable,
  veiligheidToolboxVragenTable,
  veiligheidToolboxAfrondingTable,
  gebruikersTable,
} from "@workspace/db";
import { eq, and, desc, sql, count } from "drizzle-orm";
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
    const userId = req.session.gebruikerId!;
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
    const userId = req.session.gebruikerId!;
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
    const id = parseInt(req.params.id);
    const userId = req.session.gebruikerId!;

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
    const id = parseInt(req.params.id);
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
    const id = parseInt(req.params.id);
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
    const id = parseInt(req.params.id);
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
    const id = parseInt(req.params.id);
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
    const toolboxId = parseInt(req.params.id);
    const userId = req.session.gebruikerId!;
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
    const toolboxId = parseInt(req.params.id);

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
    const toolboxId = parseInt(req.params.id);
    const userId = req.session.gebruikerId!;

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

export default veiligheidRouter;
