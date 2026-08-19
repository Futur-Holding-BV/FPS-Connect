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
  veiligheidIncidentenTable,
  gebruikersTable,
  medewerkersTable,
  gebouwenTable,
  opdrachtenTable,
  planningItemsTable,
  projectBegrotingenTable,
} from "@workspace/db";
import { verstuurMail, isGeconfigureerd as isMailGeconfigureerd } from "../services/email.js";
import { eq, and, desc, sql, count, gte, lt, isNotNull, min } from "drizzle-orm";
import { requireAuth, requireBevoegdheid } from "../middlewares/auth.js";
import { aiGateway, heeftGateway } from "../lib/aiGateway";
import { TOOLBOX_ANALYSE_PROMPT, TOOLBOX_KOPPELING_PROMPT, TOOLBOX_GENEREER_PROMPT, LMRA_VOORSTEL_PROMPT, INCIDENT_REGISTRATIE_PROMPT } from "../lib/aiPrompts";
import { logActiviteit } from "../lib/activiteit.js";
import { heeftFunctieNaam } from "../lib/functieNamen.js";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { logger } from "../lib/logger.js";
import { berekenEffectieveBevoegdhedenBatch } from "../lib/effectieve-bevoegdheden";

const objectStorage = new ObjectStorageService();

import { extraheerPdfTekst } from "../lib/pdfTekst";

const veiligheidRouter = Router();

const lezenVeiligheid = requireBevoegdheid("toolbox", 1);
const schrijvenVeiligheid = requireBevoegdheid("toolbox", 3);
const verwijderenVeiligheid = requireBevoegdheid("toolbox", 4);

// De maandelijkse verplichte toolbox geldt voor íédereen (de maandopdracht-
// routes staan op requireAuth). Wie geen toolbox-modulerecht heeft moet de
// verplichte toolbox tóch kunnen openen en afronden, anders zit die gebruiker
// vast achter de blokkerende popup (taak #1139). Deze middleware laat de
// specifieke toolbox van de huidige maandopdracht door zonder modulerecht.
const lezenVeiligheidOfMaandtoolbox: typeof lezenVeiligheid = async (req, res, next) => {
  const toolboxId = Number(req.params.id);
  if (req.session.userId && Number.isInteger(toolboxId) && (await isBouwGebruiker(req.session.userId))) {
    try {
      const nu = new Date();
      const [opdracht] = await db
        .select({ id: toolboxMaandOpdrachtenTable.id })
        .from(toolboxMaandOpdrachtenTable)
        .where(
          and(
            eq(toolboxMaandOpdrachtenTable.toolboxId, toolboxId),
            eq(toolboxMaandOpdrachtenTable.jaar, nu.getFullYear()),
            eq(toolboxMaandOpdrachtenTable.maand, nu.getMonth() + 1),
          ),
        )
        .limit(1);
      if (opdracht) {
        next();
        return;
      }
    } catch {
      // Val terug op de normale bevoegdheidscheck.
    }
  }
  return lezenVeiligheid(req, res, next);
};

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

veiligheidRouter.get("/veiligheid/toolboxen", lezenVeiligheid, async (req, res): Promise<void> => {
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

veiligheidRouter.post("/veiligheid/toolboxen", schrijvenVeiligheid, async (req, res): Promise<void> => {
  try {
    const userId = req.session.userId!;
    const { vragen: vragenInput, ...rest } = req.body;

    if (!rest.titel?.trim()) {
      return void res.status(400).json({ error: "Titel verplicht" });
    }

    // Toolbox + vragen in één transactie (schuldpunt 13): anders blijft er bij
    // een fout in de vragen-insert een toolbox zonder vragen achter.
    const toolbox = await db.transaction(async (tx) => {
    const [toolbox] = await tx
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
      await tx.insert(veiligheidToolboxVragenTable).values(
        vragenInput.map((v: any, i: number) => ({
          toolboxId: toolbox.id,
          volgorde: i,
          vraag: v.vraag,
          opties: v.opties ?? [],
          uitleg: v.uitleg ?? null,
        }))
      );
    }
    return toolbox;
    });

    res.status(201).json(mapToolbox(toolbox as unknown as Record<string, unknown>));
  } catch (err) {
    req.log.error(err, "POST /veiligheid/toolboxen");
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── DETAIL ────────────────────────────────────────────────────────────────────

veiligheidRouter.get("/veiligheid/toolboxen/:id", lezenVeiligheidOfMaandtoolbox, async (req, res): Promise<void> => {
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

    if (!row) return void res.status(404).json({ error: "Niet gevonden" });

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

veiligheidRouter.patch("/veiligheid/toolboxen/:id", schrijvenVeiligheid, async (req, res): Promise<void> => {
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

    // Metadata-update + vragen vervangen in één transactie (schuldpunt 13):
    // anders kunnen de oude vragen al verwijderd zijn terwijl de nieuwe
    // insert faalt (toolbox zonder vragen).
    const updated = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(veiligheidToolboxenTable)
      .set(update)
      .where(eq(veiligheidToolboxenTable.id, id))
      .returning();

    if (!updated) return null;

    if (Array.isArray(vragenInput)) {
      await tx.delete(veiligheidToolboxVragenTable).where(eq(veiligheidToolboxVragenTable.toolboxId, id));
      if (vragenInput.length > 0) {
        await tx.insert(veiligheidToolboxVragenTable).values(
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
    return updated;
    });

    if (!updated) return void res.status(404).json({ error: "Niet gevonden" });

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

veiligheidRouter.delete("/veiligheid/toolboxen/:id", verwijderenVeiligheid, async (req, res): Promise<void> => {
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

veiligheidRouter.post("/veiligheid/toolboxen/:id/publiceren", schrijvenVeiligheid, async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id));
    const [updated] = await db
      .update(veiligheidToolboxenTable)
      .set({ gepubliceerd: true, bijgewerktOp: new Date() })
      .where(eq(veiligheidToolboxenTable.id, id))
      .returning();

    if (!updated) return void res.status(404).json({ error: "Niet gevonden" });
    res.json(mapToolbox(updated as unknown as Record<string, unknown>));
  } catch (err) {
    req.log.error(err, "POST /veiligheid/toolboxen/:id/publiceren");
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── AI ANALYSE ────────────────────────────────────────────────────────────────

veiligheidRouter.post("/veiligheid/toolboxen/:id/ai-analyse", schrijvenVeiligheid, async (req, res): Promise<void> => {
  try {
    if (!heeftGateway()) {
      return void res.status(503).json({ error: "AI niet beschikbaar" });
    }
    const id = parseInt(String(req.params.id));
    const [toolbox] = await db
      .select()
      .from(veiligheidToolboxenTable)
      .where(eq(veiligheidToolboxenTable.id, id));

    if (!toolbox) return void res.status(404).json({ error: "Niet gevonden" });

    let pdfTekst = "";
    if (toolbox.pdfPad) {
      try {
        const file = await objectStorage.getObjectEntityFile(toolbox.pdfPad);
        const chunks: Buffer[] = [];
        const stream = file.createReadStream();
        for await (const chunk of stream) chunks.push(Buffer.from(chunk));
        const buffer = Buffer.concat(chunks);
        const parsed = await extraheerPdfTekst(buffer);
        pdfTekst = parsed.tekst?.slice(0, 12000) ?? "";
      } catch (e) {
        logger.warn({ err: e, toolboxId: id }, "PDF tekst extractie mislukt");
      }
    }

    const bronTekst = pdfTekst || toolbox.titel;

    const toolboxAnalyseResultaat = await aiGateway.chat("default", {
      max_tokens: 2000,
      messages: [
        {
          role: "system",
          content: TOOLBOX_ANALYSE_PROMPT.tekst,
        },
        {
          role: "user",
          content: `Analyseer deze veiligheidstoolbox en geef JSON terug:\n\n${bronTekst}\n\nFormaat:\n{\n  "samenvatting": "max 300 tekens",\n  "risicos": ["risico 1","risico 2","risico 3"],\n  "maatregelen": ["maatregel 1","maatregel 2","maatregel 3"],\n  "fouten": ["fout 1","fout 2"],\n  "stoppen": "Wanneer direct stoppen met werk",\n  "geschatte_leestijd": 3,\n  "zoekwoorden": ["woord1","woord2"],\n  "tags": ["tag1","tag2"],\n  "vragen": [\n    {\n      "vraag": "Vraag tekst?",\n      "opties": [\n        {"tekst": "Optie A", "correct": true},\n        {"tekst": "Optie B", "correct": false},\n        {"tekst": "Optie C", "correct": false}\n      ],\n      "uitleg": "Toelichting op het juiste antwoord"\n    }\n  ]\n}\n\nGenereer 4-6 meerkeuzevragen over de belangrijkste veiligheidspunten.`,
        },
      ],
    }, undefined, {
      module: "veiligheid",
      functie: "analyseerToolbox",
      gebruikerId: req.session.userId ?? null,
      entiteitstype: "veiligheidToolbox",
      entiteitId: id,
      promptNaam: TOOLBOX_ANALYSE_PROMPT.naam,
      promptVersie: TOOLBOX_ANALYSE_PROMPT.versie,
    });

    const raw = toolboxAnalyseResultaat.ok ? toolboxAnalyseResultaat.inhoud : "{}";
    let analyse: any = {};
    try {
      analyse = JSON.parse(raw.replace(/^```json\s*/, "").replace(/\s*```$/, ""));
    } catch {
      logger.warn({ raw }, "AI JSON parse mislukt voor toolbox analyse");
    }

    // AI-resultaat + vragen vervangen in één transactie (schuldpunt 13):
    // anders kunnen de oude vragen verwijderd zijn terwijl de nieuwe insert
    // faalt (toolbox met AI-metadata maar zonder vragen).
    const updated = await db.transaction(async (tx) => {
    const [updated] = await tx
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
      await tx.delete(veiligheidToolboxVragenTable).where(eq(veiligheidToolboxVragenTable.toolboxId, id));
      await tx.insert(veiligheidToolboxVragenTable).values(
        analyse.vragen.map((v: any, i: number) => ({
          toolboxId: id,
          volgorde: i,
          vraag: v.vraag,
          opties: v.opties ?? [],
          uitleg: v.uitleg ?? null,
        }))
      );
    }
    return updated;
    });

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

veiligheidRouter.post("/veiligheid/toolboxen/:id/afronden", lezenVeiligheidOfMaandtoolbox, async (req, res): Promise<void> => {
  try {
    const toolboxId = parseInt(String(req.params.id));
    const userId = req.session.userId!;
    const { antwoorden, handtekening } = req.body;

    if (!handtekening?.trim()) {
      return void res.status(400).json({ error: "Handtekening verplicht" });
    }

    const [toolbox] = await db
      .select()
      .from(veiligheidToolboxenTable)
      .where(eq(veiligheidToolboxenTable.id, toolboxId));

    if (!toolbox) return void res.status(404).json({ error: "Niet gevonden" });

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

    const geslaagd = score >= Math.ceil(Math.max(maxScore, 1) * (toolbox.minScore / 100));

    // Maandopdracht-koppeling: is deze toolbox de verplichte maandtoolbox van
    // de huidige maand, dan telt een geslaagde afronding ook als voltooiing van
    // de maandopdracht. Anders blijft de verplichte popup staan terwijl de
    // gebruiker de toolbox aantoonbaar heeft gedaan (deadlock, gemeld 18-08-2026).
    if (geslaagd) {
      try {
        const [maandOpdracht] = await db.select().from(toolboxMaandOpdrachtenTable)
          .where(and(
            eq(toolboxMaandOpdrachtenTable.toolboxId, toolboxId),
            eq(toolboxMaandOpdrachtenTable.jaar, now.getFullYear()),
            eq(toolboxMaandOpdrachtenTable.maand, now.getMonth() + 1),
          ))
          .limit(1);
        if (maandOpdracht) {
          // Atomaire upsert (unieke index op opdracht_id+gebruiker_id,
          // migratie 0086): voltooid_op alleen zetten als die nog leeg is.
          await db.insert(toolboxMaandStatusTable)
            .values({ opdrachtId: maandOpdracht.id, gebruikerId: userId, voltooIdOp: now, bijgewerktOp: now })
            .onConflictDoUpdate({
              target: [toolboxMaandStatusTable.opdrachtId, toolboxMaandStatusTable.gebruikerId],
              set: { voltooIdOp: now, bijgewerktOp: now },
              setWhere: sql`${toolboxMaandStatusTable.voltooIdOp} IS NULL`,
            });
        }
      } catch (koppelErr) {
        // Afronding zelf is geregistreerd; koppeling mag de respons niet breken.
        req.log.error(koppelErr, "POST /veiligheid/toolboxen/:id/afronden — maandopdracht-koppeling");
      }
    }

    res.status(201).json({
      ...mapAfronding({ ...afronding, minScorePct: toolbox.minScore / 100 } as unknown as Record<string, unknown>),
      geslaagd,
    });
  } catch (err) {
    req.log.error(err, "POST /veiligheid/toolboxen/:id/afronden");
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── AFRONDINGEN (beheerder) ───────────────────────────────────────────────────

veiligheidRouter.get("/veiligheid/toolboxen/:id/afrondingen", schrijvenVeiligheid, async (req, res): Promise<void> => {
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

veiligheidRouter.get("/veiligheid/toolboxen/:id/mijn-afronding", lezenVeiligheid, async (req, res): Promise<void> => {
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

    if (!afronding) return void res.json(null);

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

veiligheidRouter.post("/veiligheid/toolboxen/koppeling-suggestie", lezenVeiligheid, async (req, res): Promise<void> => {
  try {
    if (!heeftGateway()) {
      return void res.status(503).json({ error: "AI niet beschikbaar" });
    }
    const { werkzaamheid } = req.body ?? {};
    if (!werkzaamheid || typeof werkzaamheid !== "string") {
      return void res.status(400).json({ error: "werkzaamheid verplicht" });
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
      return void res.json({ suggesties: [] });
    }

    const catalogusTekst = alleToolboxen
      .map((t) => `ID ${t.id}: ${t.titel} (${t.categorie})`)
      .join("\n");

    const koppelingResultaat = await aiGateway.chat("default", {
      max_tokens: 1000,
      messages: [
        {
          role: "system",
          content: TOOLBOX_KOPPELING_PROMPT.tekst,
        },
        {
          role: "user",
          content: `Werkzaamheid: "${werkzaamheid}"\n\nCatalogus:\n${catalogusTekst}\n\nSelecteer 3-6 relevante toolboxen. Formaat:\n{"suggesties":[{"id":1,"titel":"...","categorie":"...","reden":"kort waarom relevant"}]}`,
        },
      ],
    }, undefined, {
      module: "veiligheid",
      functie: "toolboxKoppelingSuggestie",
      gebruikerId: req.session.userId ?? null,
      promptNaam: TOOLBOX_KOPPELING_PROMPT.naam,
      promptVersie: TOOLBOX_KOPPELING_PROMPT.versie,
    });

    const raw = koppelingResultaat.ok ? koppelingResultaat.inhoud : "{}";
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

veiligheidRouter.get("/veiligheid/toolboxen/upload-url", schrijvenVeiligheid, async (req, res): Promise<void> => {
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

veiligheidRouter.get("/veiligheid/lmras", lezenVeiligheid, async (req, res): Promise<void> => {
  try {
    const rijen = await db
      .select({
        id: veiligheidLmrasTable.id,
        gebouwId: veiligheidLmrasTable.gebouwId,
        gebouwNaam: gebouwenTable.naam,
        opdrachtId: veiligheidLmrasTable.opdrachtId,
        opdrachtNaam: opdrachtenTable.titel,
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
      .leftJoin(opdrachtenTable, eq(veiligheidLmrasTable.opdrachtId, opdrachtenTable.id))
      .orderBy(desc(veiligheidLmrasTable.aangemaaktOp));
    res.json(
      rijen.map((r) => ({
        id: r.id,
        gebouw_id: r.gebouwId ?? null,
        gebouw_naam: r.gebouwNaam ?? null,
        opdracht_id: r.opdrachtId ?? null,
        opdracht_naam: r.opdrachtNaam ?? null,
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

veiligheidRouter.post("/veiligheid/lmras", lezenVeiligheid, async (req, res): Promise<void> => {
  try {
    const gebruiker = (req as any).session?.gebruiker;
    const {
      gebouw_id, opdracht_id, medewerker_id: body_medewerker_id, project_naam,
      locatie_omschrijving, werkzaamheden,
      risicos, maatregelen, veilig_voor_aanvang, handtekening,
      foto_paden, gps_lat, gps_lng, ai_voorstel,
    } = req.body;

    if (!locatie_omschrijving || !werkzaamheden) {
      return void res.status(400).json({ error: "locatie_omschrijving en werkzaamheden zijn verplicht" });
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
        opdrachtId: opdracht_id ?? null,
        aangemaaktDoorId: gebruiker?.id ?? null,
        bijgewerktOp: new Date(),
      })
      .returning();
    let gebouwNaam: string | null = null;
    if (rij.gebouwId) {
      const [geb] = await db.select({ naam: gebouwenTable.naam }).from(gebouwenTable).where(eq(gebouwenTable.id, rij.gebouwId)).limit(1);
      gebouwNaam = geb?.naam ?? null;
    }
    await logActiviteit({
      type: "lmra_aangemaakt",
      omschrijving: `LMRA geregistreerd: ${locatie_omschrijving}`,
      gebouwId: gebouw_id ?? null,
      gebruikerId: gebruiker?.id ?? null,
    });
    res.status(201).json({
      id: rij.id,
      gebouw_id: rij.gebouwId ?? null,
      gebouw_naam: gebouwNaam,
      opdracht_id: rij.opdrachtId ?? null,
      opdracht_naam: null,
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

veiligheidRouter.get("/veiligheid/lmras/upload-url", schrijvenVeiligheid, async (req, res): Promise<void> => {
  try {
    const { uploadURL, objectPath } = await objectStorage.getObjectEntityUploadURL();
    res.json({ upload_url: uploadURL, object_path: objectPath });
  } catch (err) {
    req.log.error(err, "GET /veiligheid/lmras/upload-url");
    res.status(500).json({ error: "Interne fout" });
  }
});

veiligheidRouter.post("/veiligheid/lmras/ai-voorstel", lezenVeiligheid, async (req, res): Promise<void> => {
  try {
    if (!heeftGateway()) return void res.status(503).json({ error: "AI niet beschikbaar" });

    const { gebouw_id, werkzaamheden_omschrijving } = req.body;
    if (!gebouw_id) return void res.status(400).json({ error: "gebouw_id is verplicht" });

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

    if (!gebouw) return void res.status(404).json({ error: "Gebouw niet gevonden" });

    const context = [
      `Gebouwnaam: ${gebouw.naam}`,
      `Adres: ${gebouw.adres}${gebouw.stad ? `, ${gebouw.stad}` : ""}`,
      gebouw.gebouwType ? `Type: ${gebouw.gebouwType}` : null,
      gebouw.omschrijving ? `Omschrijving: ${gebouw.omschrijving}` : null,
      werkzaamheden_omschrijving ? `Geplande werkzaamheden: ${werkzaamheden_omschrijving}` : null,
    ].filter(Boolean).join("\n");

    const lmraResultaat = await aiGateway.chat("default", {
      max_tokens: 800,
      messages: [
        {
          role: "system",
          content: LMRA_VOORSTEL_PROMPT.tekst,
        },
        { role: "user", content: `Gebouwinformatie:\n${context}` },
      ],
    }, undefined, {
      module: "veiligheid",
      functie: "lmraVoorstel",
      gebruikerId: req.session.userId ?? null,
      entiteitstype: "gebouw",
      entiteitId: Number(gebouw_id),
      gebouw_id: Number(gebouw_id),
      promptNaam: LMRA_VOORSTEL_PROMPT.naam,
      promptVersie: LMRA_VOORSTEL_PROMPT.versie,
    });

    const raw = lmraResultaat.ok ? lmraResultaat.inhoud : "{}";
    const cleanJson = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    let voorstel: { locatie_omschrijving: string; werkzaamheden: string; risicos: string[]; maatregelen: string[] };
    try {
      voorstel = JSON.parse(cleanJson);
    } catch {
      return void res.status(500).json({ error: "AI-antwoord kon niet worden verwerkt" });
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

veiligheidRouter.get("/mijn/lmra-status", requireAuth, async (req, res): Promise<void> => {
  try {
    const gebruiker = (req as any).session?.gebruiker;
    if (!gebruiker?.id) return void res.status(401).json({ error: "Niet ingelogd" });

    const gebouwIdParam = req.query.gebouw_id ? Number(req.query.gebouw_id) : null;
    const opdrachtIdParam = req.query.opdracht_id ? Number(req.query.opdracht_id) : null;

    if (!gebouwIdParam && !opdrachtIdParam) {
      return void res.status(400).json({ error: "gebouw_id of opdracht_id is verplicht" });
    }

    // Medewerker opzoeken op basis van gebruiker
    const [med] = await db
      .select({ id: medewerkersTable.id })
      .from(medewerkersTable)
      .where(eq(medewerkersTable.gebruikerId, gebruiker.id))
      .limit(1);
    const medewerkerId = med?.id ?? null;

    // Opdracht & gebouw ophalen
    let opdrachtId: number | null = opdrachtIdParam;
    let opdrachtNaam: string | null = null;
    let gebouwId: number | null = gebouwIdParam;
    let gebouwNaam: string | null = null;

    if (opdrachtIdParam) {
      const [opr] = await db
        .select({ id: opdrachtenTable.id, titel: opdrachtenTable.titel, gebouwId: opdrachtenTable.gebouwId })
        .from(opdrachtenTable)
        .where(eq(opdrachtenTable.id, opdrachtIdParam))
        .limit(1);
      if (opr) {
        opdrachtNaam = opr.titel ?? null;
        if (!gebouwId) gebouwId = opr.gebouwId ?? null;
      }
    }

    if (gebouwId) {
      const [geb] = await db.select({ naam: gebouwenTable.naam }).from(gebouwenTable).where(eq(gebouwenTable.id, gebouwId)).limit(1);
      gebouwNaam = geb?.naam ?? null;
    }

    // 16-uur drempel — eerst werkbegroting, dan budgetUren op opdracht
    let totaalUren: number | null = null;
    if (opdrachtId) {
      const [wb] = await db
        .select({ totaalArbeidUren: projectBegrotingenTable.totaalArbeidUren })
        .from(projectBegrotingenTable)
        .where(eq(projectBegrotingenTable.opdrachtId, opdrachtId))
        .orderBy(desc(projectBegrotingenTable.aangemaaktOp))
        .limit(1);
      if (wb) totaalUren = wb.totaalArbeidUren;
    }
    if (totaalUren === null && gebouwId) {
      const oListje = await db
        .select({ budgetUren: opdrachtenTable.budgetUren })
        .from(opdrachtenTable)
        .where(and(eq(opdrachtenTable.gebouwId, gebouwId), eq(opdrachtenTable.status, "actief")))
        .limit(5);
      const kleinste = oListje.reduce<number | null>((acc, o) => {
        if (o.budgetUren == null) return acc;
        return acc == null ? o.budgetUren : Math.min(acc, o.budgetUren);
      }, null);
      totaalUren = kleinste;
    }

    if (totaalUren !== null && totaalUren < 16) {
      return void res.json({
        vereist: false,
        voltooid: false,
        dwingend: false,
        dagen_openstaand: 0,
        eerste_werkdag_datum: null,
        opdracht_id: opdrachtId,
        opdracht_naam: opdrachtNaam,
        lmra_id: null,
        reden_vrijstelling: "Project heeft een geplande omvang van minder dan 16 uur",
      });
    }

    // Eerste werkdag voor deze medewerker op dit project
    let eersteWerkdagDatum: string | null = null;
    if (medewerkerId) {
      if (opdrachtId) {
        const [eerste] = await db
          .select({ datumStart: min(planningItemsTable.datumStart) })
          .from(planningItemsTable)
          .where(and(eq(planningItemsTable.medewerkerId, medewerkerId), eq(planningItemsTable.opdrachtId, opdrachtId)));
        eersteWerkdagDatum = (eerste?.datumStart as string | null | undefined) ?? null;
      } else if (gebouwId) {
        const [eerste] = await db
          .select({ datumStart: min(planningItemsTable.datumStart) })
          .from(planningItemsTable)
          .where(and(eq(planningItemsTable.medewerkerId, medewerkerId), eq(planningItemsTable.gebouwId, gebouwId)));
        eersteWerkdagDatum = (eerste?.datumStart as string | null | undefined) ?? null;
      }
    }

    const dagenOpenstaand = eersteWerkdagDatum
      ? Math.max(0, Math.floor((Date.now() - new Date(eersteWerkdagDatum).getTime()) / 86400000))
      : 0;
    const dwingend = dagenOpenstaand >= 3;

    // LMRA voltooid controleren
    let bestaandeLmra: { id: number } | null = null;
    if (medewerkerId) {
      const where = opdrachtId
        ? and(eq(veiligheidLmrasTable.medewerkerId, medewerkerId), eq(veiligheidLmrasTable.opdrachtId, opdrachtId))
        : gebouwId
          ? and(eq(veiligheidLmrasTable.medewerkerId, medewerkerId), eq(veiligheidLmrasTable.gebouwId, gebouwId))
          : null;
      if (where) {
        const [lmra] = await db
          .select({ id: veiligheidLmrasTable.id })
          .from(veiligheidLmrasTable)
          .where(where)
          .orderBy(desc(veiligheidLmrasTable.aangemaaktOp))
          .limit(1);
        bestaandeLmra = lmra ?? null;
      }
    }

    res.json({
      vereist: true,
      voltooid: !!bestaandeLmra,
      dwingend: bestaandeLmra ? false : dwingend,
      dagen_openstaand: dagenOpenstaand,
      eerste_werkdag_datum: eersteWerkdagDatum,
      opdracht_id: opdrachtId,
      opdracht_naam: opdrachtNaam,
      lmra_id: bestaandeLmra?.id ?? null,
      reden_vrijstelling: null,
    });
  } catch (err) {
    req.log.error(err, "GET /mijn/lmra-status");
    res.status(500).json({ error: "Interne fout" });
  }
});

veiligheidRouter.get("/mijn/lmra-openstaand", requireAuth, async (req, res): Promise<void> => {
  try {
    const gebruiker = (req as any).session?.gebruiker;
    if (!gebruiker?.id) return void res.status(401).json({ error: "Niet ingelogd" });

    const [med] = await db
      .select({ id: medewerkersTable.id })
      .from(medewerkersTable)
      .where(eq(medewerkersTable.gebruikerId, gebruiker.id))
      .limit(1);

    if (!med) return void res.json([]);
    const medewerkerId = med.id;

    // Planning items van de afgelopen 90 dagen met een opdracht
    const negentigDagenGeleden = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);

    const planningItems = await db
      .select({
        opdrachtId: planningItemsTable.opdrachtId,
        gebouwId: planningItemsTable.gebouwId,
        datumStart: planningItemsTable.datumStart,
      })
      .from(planningItemsTable)
      .where(
        and(
          eq(planningItemsTable.medewerkerId, medewerkerId),
          isNotNull(planningItemsTable.opdrachtId),
          gte(planningItemsTable.datumStart, negentigDagenGeleden),
        ),
      );

    // Groepeer op unieke opdracht — vroegste werkdag per opdracht
    const opdrachtMap = new Map<number, { gebouwId: number | null; eersteWerkdag: string }>();
    for (const item of planningItems) {
      if (!item.opdrachtId) continue;
      const bestaand = opdrachtMap.get(item.opdrachtId);
      const datum = item.datumStart as string;
      if (!bestaand || datum < bestaand.eersteWerkdag) {
        opdrachtMap.set(item.opdrachtId, { gebouwId: item.gebouwId ?? null, eersteWerkdag: datum });
      }
    }

    if (opdrachtMap.size === 0) return void res.json([]);

    const opdrachtIds = Array.from(opdrachtMap.keys());

    const [opdrachtenRijen, begrotingen, bestaandeLmras] = await Promise.all([
      db
        .select({ id: opdrachtenTable.id, titel: opdrachtenTable.titel, gebouwId: opdrachtenTable.gebouwId, budgetUren: opdrachtenTable.budgetUren, status: opdrachtenTable.status })
        .from(opdrachtenTable)
        .where(sql`${opdrachtenTable.id} = ANY(${opdrachtIds})`),
      db
        .select({ opdrachtId: projectBegrotingenTable.opdrachtId, totaalArbeidUren: projectBegrotingenTable.totaalArbeidUren })
        .from(projectBegrotingenTable)
        .where(sql`${projectBegrotingenTable.opdrachtId} = ANY(${opdrachtIds})`),
      db
        .select({ opdrachtId: veiligheidLmrasTable.opdrachtId, id: veiligheidLmrasTable.id })
        .from(veiligheidLmrasTable)
        .where(and(eq(veiligheidLmrasTable.medewerkerId, medewerkerId), sql`${veiligheidLmrasTable.opdrachtId} = ANY(${opdrachtIds})`))
        .orderBy(desc(veiligheidLmrasTable.aangemaaktOp)),
    ]);

    const begrotingMap = new Map<number, number>();
    for (const b of begrotingen) {
      if (b.opdrachtId != null && !begrotingMap.has(b.opdrachtId)) begrotingMap.set(b.opdrachtId, b.totaalArbeidUren);
    }
    const lmraMap = new Map<number, number>();
    for (const l of bestaandeLmras) {
      if (l.opdrachtId != null && !lmraMap.has(l.opdrachtId)) lmraMap.set(l.opdrachtId, l.id);
    }

    // Gebouwnamen ophalen
    const gebouwIds = [...new Set([
      ...opdrachtenRijen.map(o => o.gebouwId).filter((id): id is number => id != null),
      ...Array.from(opdrachtMap.values()).map(v => v.gebouwId).filter((id): id is number => id != null),
    ])];
    const gebouwNaamMap = new Map<number, string>();
    if (gebouwIds.length > 0) {
      const rijen = await db.select({ id: gebouwenTable.id, naam: gebouwenTable.naam }).from(gebouwenTable).where(sql`${gebouwenTable.id} = ANY(${gebouwIds})`);
      for (const g of rijen) gebouwNaamMap.set(g.id, g.naam);
    }

    const resultaat = [];
    for (const opdracht of opdrachtenRijen) {
      if (opdracht.status === "geannuleerd" || opdracht.status === "afgerond") continue;
      const planningInfo = opdrachtMap.get(opdracht.id);
      if (!planningInfo) continue;
      const totaalUren = begrotingMap.get(opdracht.id) ?? opdracht.budgetUren;
      if (totaalUren != null && totaalUren < 16) continue;

      const eersteWerkdagDatum = planningInfo.eersteWerkdag;
      const dagenOpenstaand = Math.max(0, Math.floor((Date.now() - new Date(eersteWerkdagDatum).getTime()) / 86400000));
      const dwingend = dagenOpenstaand >= 3;
      const lmraId = lmraMap.get(opdracht.id) ?? null;
      const voltooid = lmraId != null;
      const gebId = opdracht.gebouwId ?? planningInfo.gebouwId ?? null;

      resultaat.push({
        opdracht_id: opdracht.id,
        opdracht_naam: opdracht.titel ?? `Opdracht #${opdracht.id}`,
        gebouw_id: gebId,
        gebouw_naam: gebId != null ? (gebouwNaamMap.get(gebId) ?? null) : null,
        vereist: true,
        voltooid,
        dwingend: voltooid ? false : dwingend,
        dagen_openstaand: dagenOpenstaand,
        eerste_werkdag_datum: eersteWerkdagDatum,
        lmra_id: lmraId,
        reden_vrijstelling: null,
      });
    }

    res.json(resultaat);
  } catch (err) {
    req.log.error(err, "GET /mijn/lmra-openstaand");
    res.status(500).json({ error: "Interne fout" });
  }
});

veiligheidRouter.get("/veiligheid/lmras/:id", lezenVeiligheid, async (req, res): Promise<void> => {
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
    if (!rij) return void res.status(404).json({ error: "Niet gevonden" });
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

veiligheidRouter.patch("/veiligheid/lmras/:id", schrijvenVeiligheid, async (req, res): Promise<void> => {
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
    if (!rij) return void res.status(404).json({ error: "Niet gevonden" });
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

veiligheidRouter.delete("/veiligheid/lmras/:id", verwijderenVeiligheid, async (req, res): Promise<void> => {
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

veiligheidRouter.get("/veiligheid/meldingen", lezenVeiligheid, async (req, res): Promise<void> => {
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
        toegewezen_aan_naam: sql<string | null>`coalesce(nullif(trim(${gebruikersTable.naam}), ''), ${gebruikersTable.email})`,
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

veiligheidRouter.post("/veiligheid/meldingen", lezenVeiligheid, async (req, res): Promise<void> => {
  try {
    const gebruiker = (req as any).session?.gebruiker;
    const {
      type, omschrijving, locatie, gebouw_id, project_naam,
      foto_paden, prioriteit, toegewezen_aan_id,
    } = req.body;
    if (!type || !omschrijving) {
      return void res.status(400).json({ error: "type en omschrijving zijn verplicht" });
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

veiligheidRouter.get("/veiligheid/meldingen/upload-url", schrijvenVeiligheid, async (req, res): Promise<void> => {
  try {
    const { uploadURL, objectPath } = await objectStorage.getObjectEntityUploadURL();
    res.json({ upload_url: uploadURL, object_path: objectPath });
  } catch (err) {
    req.log.error(err, "GET /veiligheid/meldingen/upload-url");
    res.status(500).json({ error: "Interne fout" });
  }
});

veiligheidRouter.get("/veiligheid/meldingen/:id", lezenVeiligheid, async (req, res): Promise<void> => {
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
        toegewezen_aan_naam: sql<string | null>`coalesce(nullif(trim(${gebruikersTable.naam}), ''), ${gebruikersTable.email})`,
        aangemaaktOp: veiligheidMeldingenTable.aangemaaktOp,
        bijgewerktOp: veiligheidMeldingenTable.bijgewerktOp,
      })
      .from(veiligheidMeldingenTable)
      .leftJoin(gebruikersTable, eq(gebruikersTable.id, veiligheidMeldingenTable.toegewezenAanId))
      .where(eq(veiligheidMeldingenTable.id, id));
    if (!rij) return void res.status(404).json({ error: "Niet gevonden" });
    res.json(mapMelding(rij as any));
  } catch (err) {
    req.log.error(err, "GET /veiligheid/meldingen/:id");
    res.status(500).json({ error: "Interne fout" });
  }
});

veiligheidRouter.patch("/veiligheid/meldingen/:id", schrijvenVeiligheid, async (req, res): Promise<void> => {
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
    if (!rij) return void res.status(404).json({ error: "Niet gevonden" });
    res.json(mapMelding(rij as any));
  } catch (err) {
    req.log.error(err, "PATCH /veiligheid/meldingen/:id");
    res.status(500).json({ error: "Interne fout" });
  }
});

veiligheidRouter.delete("/veiligheid/meldingen/:id", verwijderenVeiligheid, async (req, res): Promise<void> => {
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

veiligheidRouter.get("/veiligheid/meldingen/:id/acties", lezenVeiligheid, async (req, res): Promise<void> => {
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

veiligheidRouter.post("/veiligheid/meldingen/:id/acties", schrijvenVeiligheid, async (req, res): Promise<void> => {
  try {
    const meldingId = parseInt(String(req.params.id));
    const { omschrijving, eigenaar_id, eigenaar_naam, deadline } = req.body;
    if (!omschrijving) return void res.status(400).json({ error: "omschrijving is verplicht" });
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

veiligheidRouter.patch("/veiligheid/meldingen/:id/acties/:actieId", schrijvenVeiligheid, async (req, res): Promise<void> => {
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
    if (!rij) return void res.status(404).json({ error: "Niet gevonden" });
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

veiligheidRouter.delete("/veiligheid/meldingen/:id/acties/:actieId", verwijderenVeiligheid, async (req, res): Promise<void> => {
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

veiligheidRouter.get("/veiligheid/dashboard", lezenVeiligheid, async (req, res): Promise<void> => {
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

veiligheidRouter.get("/veiligheid/toolbox-maandopdrachten", schrijvenVeiligheid, async (req, res): Promise<void> => {
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

veiligheidRouter.post("/veiligheid/toolbox-maandopdrachten", schrijvenVeiligheid, async (req, res): Promise<void> => {
  try {
    const { toolbox_id, jaar, maand } = req.body as { toolbox_id: number; jaar: number; maand: number };
    if (!toolbox_id || !jaar || !maand) return void res.status(400).json({ error: "toolbox_id, jaar en maand zijn verplicht" });

    const [bestaand] = await db.select({ id: toolboxMaandOpdrachtenTable.id })
      .from(toolboxMaandOpdrachtenTable)
      .where(and(eq(toolboxMaandOpdrachtenTable.jaar, jaar), eq(toolboxMaandOpdrachtenTable.maand, maand)))
      .limit(1);
    if (bestaand) return void res.status(409).json({ error: "Er is al een toolbox-opdracht voor deze maand" });

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

veiligheidRouter.delete("/veiligheid/toolbox-maandopdrachten/:id", schrijvenVeiligheid, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const [v] = await db.delete(toolboxMaandOpdrachtenTable)
      .where(eq(toolboxMaandOpdrachtenTable.id, id)).returning({ id: toolboxMaandOpdrachtenTable.id });
    if (!v) return void res.status(404).json({ error: "Niet gevonden" });
    res.status(204).end();
  } catch (err) {
    req.log.error(err, "DELETE /veiligheid/toolbox-maandopdrachten/:id");
    res.status(500).json({ error: "Interne fout" });
  }
});

veiligheidRouter.get("/veiligheid/toolbox-maandopdrachten/:id/voortgang", schrijvenVeiligheid, async (req, res): Promise<void> => {
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

// De maandtoolbox is alleen verplicht voor mensen die op de bouw komen
// (besluit René, 18-08-2026): monteurs, timmermannen, uitvoerders,
// werkvoorbereiders en projectleiders. Kantoorfuncties krijgen géén
// maandopdracht-popup.
const BOUW_FUNCTIES = [
  "Monteur",
  "Onderhoudsmonteur",
  "Timmerman",
  "Uitvoerder",
  "Werkvoorbereider",
  "Projectleider",
];

async function isBouwGebruiker(userId: number): Promise<boolean> {
  // GEBRUIKERS_01 v2: bouw-functie volgt uit de functie-inrichting van de
  // gekoppelde medewerker (hoofdfunctie + aanstellingen, alleen actieve
  // functies, actief op vandaag), niet uit gebruikers.functietitels.
  return heeftFunctieNaam(userId, BOUW_FUNCTIES);
}

veiligheidRouter.get("/mijn/toolbox-maandopdracht", requireAuth, async (req, res): Promise<void> => {
  try {
    const userId = req.session.userId;
    if (!userId) return void res.status(401).json({ error: "Niet ingelogd" });
    // Alleen bouw-functies krijgen de verplichte maandtoolbox.
    if (!(await isBouwGebruiker(userId))) return void res.json(null);
    const nu = new Date();
    const [opdracht] = await db.select().from(toolboxMaandOpdrachtenTable)
      .where(and(eq(toolboxMaandOpdrachtenTable.jaar, nu.getFullYear()), eq(toolboxMaandOpdrachtenTable.maand, nu.getMonth() + 1)))
      .limit(1);
    if (!opdracht) return void res.json(null);

    let [status] = await db.select().from(toolboxMaandStatusTable)
      .where(and(eq(toolboxMaandStatusTable.opdrachtId, opdracht.id), eq(toolboxMaandStatusTable.gebruikerId, userId)))
      .limit(1);
    if (!status) {
      [status] = await db.insert(toolboxMaandStatusTable)
        .values({ opdrachtId: opdracht.id, gebruikerId: userId }).returning();
    }

    const tb = await haalToolboxOp(opdracht.toolboxId);
    if (!tb) return void res.json(null);
    res.json(mapMaandStatus(status, opdracht, tb));
  } catch (err) {
    req.log.error(err, "GET /mijn/toolbox-maandopdracht");
    res.status(500).json({ error: "Interne fout" });
  }
});

veiligheidRouter.post("/mijn/toolbox-maandopdracht/:id/uitstellen", requireAuth, async (req, res): Promise<void> => {
  try {
    const userId = req.session.userId;
    if (!userId) return void res.status(401).json({ error: "Niet ingelogd" });
    const statusId = Number(req.params.id);
    const [status] = await db.select().from(toolboxMaandStatusTable)
      .where(and(eq(toolboxMaandStatusTable.id, statusId), eq(toolboxMaandStatusTable.gebruikerId, userId))).limit(1);
    if (!status) return void res.status(404).json({ error: "Niet gevonden" });
    if (status.voltooIdOp) return void res.status(400).json({ error: "Al voltooid" });

    const nu = new Date();
    const dagenVerstreken = Math.floor((nu.getTime() - (status.eersteAanbieding as Date).getTime()) / 86_400_000);
    if (dagenVerstreken >= 3 || status.aantalUitgesteld >= 3) {
      return void res.status(403).json({ error: "Kan niet meer uitstellen: deadline verstreken" });
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

veiligheidRouter.post("/mijn/toolbox-maandopdracht/:id/voltooien", requireAuth, async (req, res): Promise<void> => {
  try {
    const userId = req.session.userId;
    if (!userId) return void res.status(401).json({ error: "Niet ingelogd" });
    const statusId = Number(req.params.id);
    const { vraag } = (req.body ?? {}) as { vraag?: string };

    const [status] = await db.select().from(toolboxMaandStatusTable)
      .where(and(eq(toolboxMaandStatusTable.id, statusId), eq(toolboxMaandStatusTable.gebruikerId, userId))).limit(1);
    if (!status) return void res.status(404).json({ error: "Niet gevonden" });

    if (status.voltooIdOp) {
      const [existOpdracht] = await db.select().from(toolboxMaandOpdrachtenTable)
        .where(eq(toolboxMaandOpdrachtenTable.id, status.opdrachtId)).limit(1);
      const existTb = await haalToolboxOp(existOpdracht.toolboxId);
      return void res.json(mapMaandStatus(status, existOpdracht, existTb!));
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

// ── Incidenten (bijna-ongevallen & ongevallen) ────────────────────────────────

veiligheidRouter.get("/veiligheid/incidenten", lezenVeiligheid, async (req, res): Promise<void> => {
  try {
    const rijen = await db
      .select({
        i: veiligheidIncidentenTable,
        gebouwNaam: gebouwenTable.naam,
        opdrachtNaam: opdrachtenTable.titel,
      })
      .from(veiligheidIncidentenTable)
      .leftJoin(gebouwenTable, eq(veiligheidIncidentenTable.gebouwId, gebouwenTable.id))
      .leftJoin(opdrachtenTable, eq(veiligheidIncidentenTable.opdrachtId, opdrachtenTable.id))
      .orderBy(desc(veiligheidIncidentenTable.aangemaaktOp));

    res.json(rijen.map(r => ({
      id: r.i.id,
      type: r.i.type,
      datum: r.i.datum ?? null,
      tijdstip: r.i.tijdstip ?? null,
      locatie_omschrijving: r.i.locatieOmschrijving,
      gebouw_id: r.i.gebouwId ?? null,
      gebouw_naam: r.gebouwNaam ?? null,
      opdracht_id: r.i.opdrachtId ?? null,
      opdracht_naam: r.opdrachtNaam ?? null,
      omschrijving: r.i.omschrijving,
      oorzaak: r.i.oorzaak ?? null,
      letsel_beschrijving: r.i.letselBeschrijving ?? null,
      eerste_hulp_verleend: r.i.eersteHulpVerleend,
      eerste_hulp_beschrijving: r.i.eersteHulpBeschrijving ?? null,
      getuigen: (r.i.getuigen as string[]) ?? [],
      genomen_maatregelen: (r.i.genoemenMaatregelen as string[]) ?? [],
      meldplichtig: r.i.meldplichtig,
      gemeld_bij_arbeidsinspectie: r.i.gemeldBijArbeidsinspectie,
      status: r.i.status,
      foto_paden: (r.i.fotoPaden as string[]) ?? [],
      ai_voorstel: r.i.aiVoorstel,
      medewerker_naam: r.i.medewerkerNaam ?? null,
      medewerker_id: r.i.medewerkerId ?? null,
      aangemaakt_door_id: r.i.aangemaaktDoorId ?? null,
      aangemaakt_op: r.i.aangemaaktOp.toISOString(),
      bijgewerkt_op: r.i.bijgewerktOp?.toISOString() ?? null,
    })));
  } catch (err) {
    req.log.error(err, "GET /veiligheid/incidenten");
    res.status(500).json({ error: "Interne fout" });
  }
});

veiligheidRouter.post("/veiligheid/incidenten", lezenVeiligheid, async (req, res): Promise<void> => {
  try {
    const gebruiker = (req as any).session?.gebruiker;
    const {
      type, datum, tijdstip, locatie_omschrijving, gebouw_id, opdracht_id,
      omschrijving, oorzaak, letsel_beschrijving,
      eerste_hulp_verleend, eerste_hulp_beschrijving,
      getuigen, genomen_maatregelen, meldplichtig,
      gemeld_bij_arbeidsinspectie, status, foto_paden, ai_voorstel,
    } = req.body;

    if (!locatie_omschrijving || !omschrijving) {
      return void res.status(400).json({ error: "locatie_omschrijving en omschrijving zijn verplicht" });
    }

    const medewerkerNaam = gebruiker
      ? `${gebruiker.naam ?? ""} ${gebruiker.achternaam ?? ""}`.trim() || gebruiker.email
      : null;

    let resolvedMedewerkerId: number | null = null;
    if (gebruiker?.id) {
      const [med] = await db.select({ id: medewerkersTable.id })
        .from(medewerkersTable)
        .where(eq(medewerkersTable.gebruikerId, gebruiker.id))
        .limit(1);
      resolvedMedewerkerId = med?.id ?? null;
    }

    const [rij] = await db
      .insert(veiligheidIncidentenTable)
      .values({
        type: type ?? "bijna_ongeval",
        datum: datum ?? null,
        tijdstip: tijdstip ?? null,
        locatieOmschrijving: locatie_omschrijving,
        gebouwId: gebouw_id ?? null,
        opdrachtId: opdracht_id ?? null,
        omschrijving,
        oorzaak: oorzaak ?? null,
        letselBeschrijving: letsel_beschrijving ?? null,
        eersteHulpVerleend: eerste_hulp_verleend ?? false,
        eersteHulpBeschrijving: eerste_hulp_beschrijving ?? null,
        getuigen: getuigen ?? [],
        genoemenMaatregelen: genomen_maatregelen ?? [],
        meldplichtig: meldplichtig ?? false,
        gemeldBijArbeidsinspectie: gemeld_bij_arbeidsinspectie ?? false,
        status: status ?? "open",
        fotoPaden: foto_paden ?? [],
        aiVoorstel: ai_voorstel === true,
        medewerkerNaam,
        medewerkerId: resolvedMedewerkerId,
        aangemaaktDoorId: gebruiker?.id ?? null,
        bijgewerktOp: new Date(),
      })
      .returning();

    let gebouwNaam: string | null = null;
    let opdrachtNaam: string | null = null;
    if (rij.gebouwId) {
      const [geb] = await db.select({ naam: gebouwenTable.naam }).from(gebouwenTable).where(eq(gebouwenTable.id, rij.gebouwId)).limit(1);
      gebouwNaam = geb?.naam ?? null;
    }
    if (rij.opdrachtId) {
      const [opd] = await db.select({ naam: opdrachtenTable.titel }).from(opdrachtenTable).where(eq(opdrachtenTable.id, rij.opdrachtId)).limit(1);
      opdrachtNaam = opd?.naam ?? null;
    }

    await logActiviteit({
      type: "incident_aangemaakt",
      omschrijving: `${type === "bijna_ongeval" ? "Bijna-Ongeval" : "Ongeval"} geregistreerd: ${locatie_omschrijving}`,
      gebouwId: gebouw_id ?? null,
      gebruikerId: gebruiker?.id ?? null,
    });

    // Notificeer projectleiders (offertes:2+) — fire-and-forget
    if (isMailGeconfigureerd()) {
      const allGebruikers = await db.select({
        id: gebruikersTable.id,
        email: gebruikersTable.email,
        naam: gebruikersTable.naam,
        rol: gebruikersTable.rol,
        storedBevoegdheden: gebruikersTable.bevoegdheden,
      }).from(gebruikersTable).where(isNotNull(gebruikersTable.email));
      const effectieveBevoegdheden = await berekenEffectieveBevoegdhedenBatch(
        allGebruikers.map((g) => ({
          id: g.id,
          rol: g.rol,
          storedBevoegdheden: g.storedBevoegdheden,
        })),
      );

      const plOntvangers = allGebruikers.filter(g => {
        const bev = effectieveBevoegdheden.get(g.id) ?? {};
        return (g.rol === "hoofdbeheerder" || (bev["offertes"] ?? 0) >= 2) && g.email;
      });

      const typeLabel = type === "bijna_ongeval" ? "Bijna-Ongeval" : "Ongeval";
      const meldplichtigWaarschuwing = meldplichtig
        ? `<p style="color:#b91c1c;font-weight:600;">Let op: dit incident is mogelijk meldplichtig bij de Nederlandse Arbeidsinspectie. Neem zo snel mogelijk contact op.</p>`
        : "";

      for (const pl of plOntvangers) {
        const naarNaam = pl.naam ?? null;
        verstuurMail({
          naarEmail: pl.email!,
          naarNaam,
          onderwerp: `[FPS Connect] Nieuw incident geregistreerd: ${typeLabel}`,
          soort: "incident_melding",
          html: `
            <p>Beste ${naarNaam ?? "projectleider"},</p>
            <p>Er is zojuist een <strong>${typeLabel}</strong> geregistreerd in FPS Connect.</p>
            ${meldplichtigWaarschuwing}
            <table style="border-collapse:collapse;width:100%;margin-bottom:16px;">
              <tr><td style="padding:6px 12px;font-weight:600;background:#f4f4f5;">Type</td><td style="padding:6px 12px;">${typeLabel}</td></tr>
              <tr><td style="padding:6px 12px;font-weight:600;background:#f4f4f5;">Locatie</td><td style="padding:6px 12px;">${locatie_omschrijving}</td></tr>
              ${datum ? `<tr><td style="padding:6px 12px;font-weight:600;background:#f4f4f5;">Datum</td><td style="padding:6px 12px;">${datum}${tijdstip ? ` om ${tijdstip}` : ""}</td></tr>` : ""}
              ${opdrachtNaam ? `<tr><td style="padding:6px 12px;font-weight:600;background:#f4f4f5;">Opdracht</td><td style="padding:6px 12px;">${opdrachtNaam}</td></tr>` : ""}
              <tr><td style="padding:6px 12px;font-weight:600;background:#f4f4f5;">Geregistreerd door</td><td style="padding:6px 12px;">${medewerkerNaam ?? "onbekend"}</td></tr>
              <tr><td style="padding:6px 12px;font-weight:600;background:#f4f4f5;">Omschrijving</td><td style="padding:6px 12px;">${omschrijving}</td></tr>
            </table>
            <p style="color:#71717a;font-size:13px;">Log in op FPS Connect om het incident te bekijken en de status te beheren.</p>
          `,
        }).catch((mailErr: unknown) => {
          req.log.warn({ err: mailErr, naar: pl.email }, "Incident-notificatiemail niet verzonden");
        });
      }
    }

    res.status(201).json({
      id: rij.id,
      type: rij.type,
      datum: rij.datum ?? null,
      tijdstip: rij.tijdstip ?? null,
      locatie_omschrijving: rij.locatieOmschrijving,
      gebouw_id: rij.gebouwId ?? null,
      gebouw_naam: gebouwNaam,
      opdracht_id: rij.opdrachtId ?? null,
      opdracht_naam: opdrachtNaam,
      omschrijving: rij.omschrijving,
      oorzaak: rij.oorzaak ?? null,
      letsel_beschrijving: rij.letselBeschrijving ?? null,
      eerste_hulp_verleend: rij.eersteHulpVerleend,
      eerste_hulp_beschrijving: rij.eersteHulpBeschrijving ?? null,
      getuigen: (rij.getuigen as string[]) ?? [],
      genomen_maatregelen: (rij.genoemenMaatregelen as string[]) ?? [],
      meldplichtig: rij.meldplichtig,
      gemeld_bij_arbeidsinspectie: rij.gemeldBijArbeidsinspectie,
      status: rij.status,
      foto_paden: (rij.fotoPaden as string[]) ?? [],
      ai_voorstel: rij.aiVoorstel,
      medewerker_naam: rij.medewerkerNaam ?? null,
      medewerker_id: rij.medewerkerId ?? null,
      aangemaakt_door_id: rij.aangemaaktDoorId ?? null,
      aangemaakt_op: rij.aangemaaktOp.toISOString(),
      bijgewerkt_op: rij.bijgewerktOp?.toISOString() ?? null,
    });
  } catch (err) {
    req.log.error(err, "POST /veiligheid/incidenten");
    res.status(500).json({ error: "Interne fout" });
  }
});

veiligheidRouter.post("/veiligheid/incidenten/ai-voorstel", lezenVeiligheid, async (req, res): Promise<void> => {
  try {
    if (!heeftGateway()) return void res.status(503).json({ error: "AI niet beschikbaar" });

    const { type, locatie_omschrijving, werkzaamheden_omschrijving, opdracht_naam } = req.body;
    if (!locatie_omschrijving) return void res.status(400).json({ error: "locatie_omschrijving is verplicht" });

    const typeLabel = type === "bijna_ongeval" ? "bijna-ongeval" : "arbeidsongeval";
    const context = [
      `Type incident: ${typeLabel}`,
      `Locatie: ${locatie_omschrijving}`,
      werkzaamheden_omschrijving ? `Werkzaamheden: ${werkzaamheden_omschrijving}` : null,
      opdracht_naam ? `Project/opdracht: ${opdracht_naam}` : null,
    ].filter(Boolean).join("\n");

    const incidentResultaat = await aiGateway.chat("default", {
      max_tokens: 600,
      messages: [
        {
          role: "system",
          content: INCIDENT_REGISTRATIE_PROMPT.tekst,
        },
        { role: "user", content: `Incidentinformatie:\n${context}` },
      ],
    }, undefined, {
      module: "veiligheid",
      functie: "incidentRegistratieVoorstel",
      gebruikerId: req.session.userId ?? null,
      promptNaam: INCIDENT_REGISTRATIE_PROMPT.naam,
      promptVersie: INCIDENT_REGISTRATIE_PROMPT.versie,
    });

    const raw = incidentResultaat.ok ? incidentResultaat.inhoud : "{}";
    const cleanJson = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    let voorstel: { omschrijving: string; oorzaak: string; genomen_maatregelen: string[]; meldplichtig_indicatie: boolean };
    try {
      voorstel = JSON.parse(cleanJson);
    } catch {
      return void res.status(500).json({ error: "AI-antwoord kon niet worden verwerkt" });
    }

    res.json({
      omschrijving: voorstel.omschrijving ?? "",
      oorzaak: voorstel.oorzaak ?? "",
      genomen_maatregelen: Array.isArray(voorstel.genomen_maatregelen) ? voorstel.genomen_maatregelen : [],
      meldplichtig_indicatie: voorstel.meldplichtig_indicatie === true,
    });
  } catch (err) {
    req.log.error(err, "POST /veiligheid/incidenten/ai-voorstel");
    res.status(500).json({ error: "Interne fout" });
  }
});

veiligheidRouter.get("/veiligheid/incidenten/upload-url", lezenVeiligheid, async (req, res): Promise<void> => {
  try {
    const { uploadURL, objectPath } = await objectStorage.getObjectEntityUploadURL();
    res.json({ upload_url: uploadURL, object_path: objectPath });
  } catch (err) {
    req.log.error(err, "GET /veiligheid/incidenten/upload-url");
    res.status(500).json({ error: "Interne fout" });
  }
});

veiligheidRouter.get("/veiligheid/incidenten/:id", lezenVeiligheid, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const [rij] = await db
      .select({
        i: veiligheidIncidentenTable,
        gebouwNaam: gebouwenTable.naam,
        opdrachtNaam: opdrachtenTable.titel,
      })
      .from(veiligheidIncidentenTable)
      .leftJoin(gebouwenTable, eq(veiligheidIncidentenTable.gebouwId, gebouwenTable.id))
      .leftJoin(opdrachtenTable, eq(veiligheidIncidentenTable.opdrachtId, opdrachtenTable.id))
      .where(eq(veiligheidIncidentenTable.id, id))
      .limit(1);

    if (!rij) return void res.status(404).json({ error: "Niet gevonden" });
    const r = rij.i;
    res.json({
      id: r.id, type: r.type, datum: r.datum ?? null, tijdstip: r.tijdstip ?? null,
      locatie_omschrijving: r.locatieOmschrijving,
      gebouw_id: r.gebouwId ?? null, gebouw_naam: rij.gebouwNaam ?? null,
      opdracht_id: r.opdrachtId ?? null, opdracht_naam: rij.opdrachtNaam ?? null,
      omschrijving: r.omschrijving, oorzaak: r.oorzaak ?? null,
      letsel_beschrijving: r.letselBeschrijving ?? null,
      eerste_hulp_verleend: r.eersteHulpVerleend,
      eerste_hulp_beschrijving: r.eersteHulpBeschrijving ?? null,
      getuigen: (r.getuigen as string[]) ?? [],
      genomen_maatregelen: (r.genoemenMaatregelen as string[]) ?? [],
      meldplichtig: r.meldplichtig,
      gemeld_bij_arbeidsinspectie: r.gemeldBijArbeidsinspectie,
      status: r.status, foto_paden: (r.fotoPaden as string[]) ?? [],
      ai_voorstel: r.aiVoorstel, medewerker_naam: r.medewerkerNaam ?? null,
      medewerker_id: r.medewerkerId ?? null,
      aangemaakt_door_id: r.aangemaaktDoorId ?? null,
      aangemaakt_op: r.aangemaaktOp.toISOString(),
      bijgewerkt_op: r.bijgewerktOp?.toISOString() ?? null,
    });
  } catch (err) {
    req.log.error(err, "GET /veiligheid/incidenten/:id");
    res.status(500).json({ error: "Interne fout" });
  }
});

veiligheidRouter.patch("/veiligheid/incidenten/:id", schrijvenVeiligheid, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const {
      status, meldplichtig, gemeld_bij_arbeidsinspectie, oorzaak,
      genomen_maatregelen, eerste_hulp_verleend, eerste_hulp_beschrijving,
    } = req.body;

    const [rij] = await db
      .update(veiligheidIncidentenTable)
      .set({
        ...(status !== undefined && { status }),
        ...(meldplichtig !== undefined && { meldplichtig }),
        ...(gemeld_bij_arbeidsinspectie !== undefined && { gemeldBijArbeidsinspectie: gemeld_bij_arbeidsinspectie }),
        ...(oorzaak !== undefined && { oorzaak }),
        ...(genomen_maatregelen !== undefined && { genoemenMaatregelen: genomen_maatregelen }),
        ...(eerste_hulp_verleend !== undefined && { eersteHulpVerleend: eerste_hulp_verleend }),
        ...(eerste_hulp_beschrijving !== undefined && { eersteHulpBeschrijving: eerste_hulp_beschrijving }),
        bijgewerktOp: new Date(),
      })
      .where(eq(veiligheidIncidentenTable.id, id))
      .returning();

    if (!rij) return void res.status(404).json({ error: "Niet gevonden" });
    res.json({ id: rij.id, status: rij.status, bijgewerkt_op: rij.bijgewerktOp?.toISOString() ?? null });
  } catch (err) {
    req.log.error(err, "PATCH /veiligheid/incidenten/:id");
    res.status(500).json({ error: "Interne fout" });
  }
});

veiligheidRouter.delete("/veiligheid/incidenten/:id", verwijderenVeiligheid, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    await db.delete(veiligheidIncidentenTable).where(eq(veiligheidIncidentenTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error(err, "DELETE /veiligheid/incidenten/:id");
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── AI BATCH GENERATIE ────────────────────────────────────────────────────────

veiligheidRouter.post("/veiligheid/toolboxen/ai-batch-genereer", schrijvenVeiligheid, async (req, res): Promise<void> => {
  try {
    const { categorieen, aantal, toelichting } = req.body as {
      categorieen: string[];
      aantal: number;
      toelichting?: string;
    };
    const CATEGORIE_BESCHRIJVING: Record<string, string> = {
      brandveiligheid: "brandpreventie, blusmiddelen, vluchtroutes, brandmelding",
      werken_op_hoogte: "ladders, steigers, valbescherming, dakwerkzaamheden",
      pbm: "persoonlijke beschermingsmiddelen, helmen, veiligheidsschoenen, handschoenen",
      elektrisch: "elektrische veiligheid, stroomgevaar, aarding, laagspanning",
      bouwplaats: "bouwplaatsveiligheid, ordelijkheid, signalering, vergunningen",
      gezondheid: "ARBO, ergonomie, gevaarlijke stoffen, werkdruk, hitte/kou",
      milieu: "milieurisico's, afvalscheiding, chemische stoffen, bodemverontreiniging",
      machines: "machine-veiligheid, noodstop, onderhoud, vergrendeling",
      overig: "algemene veiligheid op de werkplek",
    };
    if (!categorieen || !Array.isArray(categorieen) || categorieen.length === 0) {
      return void res.status(400).json({ error: "categorieen verplicht" });
    }
    // Alleen canonieke categorieën toestaan: onbekende waarden zouden in de
    // review-UI als rauwe labels verschijnen en buiten elk categoriefilter vallen.
    const onbekend = categorieen.filter((c) => !(c in CATEGORIE_BESCHRIJVING));
    if (onbekend.length > 0) {
      return void res.status(400).json({
        error: `Onbekende categorie(ën): ${onbekend.join(", ")}. Toegestaan: ${Object.keys(CATEGORIE_BESCHRIJVING).join(", ")}`,
      });
    }
    if (!heeftGateway()) {
      return void res.status(503).json({ error: "AI niet beschikbaar — configureer de AI-integratie om concepten te kunnen genereren" });
    }
    const aantalGeldig = Math.min(Math.max(1, Number(aantal) || 10), 50);
    const batchId = `batch-${Date.now()}`;

    type ToolboxItem = {
      titel: string; categorie: string; moeilijkheid: string; intro: string;
      ai_samenvatting: string; ai_risicos: string[]; ai_maatregelen: string[];
      ai_stoppen: string; geschatte_leestijd: number; zoekwoorden: string[];
      tags: string[]; foto_suggesties: string[];
    };

    // Bestaande titels ophalen zodat AI geen duplicaten aanmaakt
    const bestaandeRijen = await db
      .select({ titel: veiligheidToolboxenTable.titel })
      .from(veiligheidToolboxenTable);
    const bekendeTitels = new Set(bestaandeRijen.map((r) => r.titel.trim().toLowerCase()));
    const vermijdLijst: string[] = bestaandeRijen.map((r) => r.titel.trim());

    const catsOmschrijving = categorieen
      .map((c) => `${c}: ${CATEGORIE_BESCHRIJVING[c] ?? c}`)
      .join("\n");

    // Genereer in delen van maximaal 10 per AI-aanroep: grotere aantallen worden
    // door het tokenbudget afgekapt en leveren dan onbruikbare JSON op.
    const DEEL_GROOTTE = 10;
    const items: ToolboxItem[] = [];
    let misluktePogingen = 0;
    const MAX_MISLUKT = 2;

    while (items.length < aantalGeldig && misluktePogingen < MAX_MISLUKT) {
      const nodig = Math.min(DEEL_GROOTTE, aantalGeldig - items.length);
      const vermijdTekst = vermijdLijst.length
        ? `\nVermijd deze reeds bestaande onderwerpen (geen duplicaten of sterk gelijkende titels):\n${vermijdLijst.slice(-150).map((t) => `- ${t}`).join("\n")}`
        : "";
      const deelResultaat = await aiGateway.chat("default", {
        max_tokens: 8000,
        messages: [
          { role: "system", content: TOOLBOX_GENEREER_PROMPT.tekst },
          {
            role: "user",
            content: `Genereer ${nodig} unieke toolbox-onderwerpen voor brandpreventie- en bouwplaatsmonteurs.

Categorieën:
${catsOmschrijving}
${toelichting ? `\nExtra context: ${toelichting}` : ""}${vermijdTekst}

Verspreid de onderwerpen evenredig over de categorieën. Geef output als JSON-array:
[{
  "titel": "Korte pakkende titel (max 60 tekens)",
  "categorie": "een van: ${categorieen.join("|")}",
  "moeilijkheid": "eenvoudig|gemiddeld|gevorderd",
  "intro": "Inleiding 2-3 zinnen",
  "ai_samenvatting": "Informatieve samenvatting 100-150 woorden over veiligheidsaspecten",
  "ai_risicos": ["risico 1","risico 2","risico 3"],
  "ai_maatregelen": ["maatregel 1","maatregel 2","maatregel 3"],
  "ai_stoppen": "Wanneer direct stoppen: concrete situatiebeschrijving",
  "geschatte_leestijd": 5,
  "zoekwoorden": ["woord1","woord2"],
  "tags": ["tag1","tag2"],
  "foto_suggesties": ["omschrijving van een relevante foto voor dit onderwerp"]
}]`,
          },
        ],
      }, undefined, {
        module: "veiligheid",
        functie: "genereerToolboxenBatch",
        gebruikerId: req.session.userId ?? null,
        promptNaam: TOOLBOX_GENEREER_PROMPT.naam,
        promptVersie: TOOLBOX_GENEREER_PROMPT.versie,
      });
      const raw = deelResultaat.ok ? deelResultaat.inhoud : "";
      let deelItems: ToolboxItem[] = [];
      try {
        const cleaned = raw.replace(/^```json\s*/m, "").replace(/\s*```\s*$/m, "").trim();
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed)) deelItems = parsed.slice(0, nodig) as ToolboxItem[];
      } catch {
        logger.warn({ raw: raw.slice(0, 500) }, "AI batch parse mislukt (deel)");
      }
      const nieuw = deelItems.filter((item) => {
        const sleutel = String(item.titel ?? "").trim().toLowerCase();
        if (!sleutel || bekendeTitels.has(sleutel)) return false;
        bekendeTitels.add(sleutel);
        vermijdLijst.push(String(item.titel).trim());
        return true;
      });
      if (nieuw.length === 0) {
        misluktePogingen += 1;
        continue;
      }
      misluktePogingen = 0;
      items.push(...nieuw);
    }

    if (items.length === 0) {
      return void res.status(502).json({ error: "AI-generatie mislukt — geen bruikbare concepten ontvangen. Probeer het opnieuw." });
    }

    const rijen = await Promise.all(
      items.map((item) =>
        db.insert(veiligheidToolboxenTable).values({
          titel: item.titel,
          // AI-uitvoer normaliseren: onbekende categorie valt terug op "overig"
          categorie: item.categorie in CATEGORIE_BESCHRIJVING ? item.categorie : "overig",
          moeilijkheid: item.moeilijkheid,
          intro: item.intro,
          aiSamenvatting: item.ai_samenvatting || null,
          aiRisicos: item.ai_risicos,
          aiMaatregelen: item.ai_maatregelen,
          aiStoppen: item.ai_stoppen || null,
          gepubliceerd: false,
          verplicht: false,
          doelgroep: "iedereen",
          aiGegenereerd: true,
          fotoSuggesties: item.foto_suggesties,
          geschatteLeestijd: item.geschatte_leestijd,
          zoekwoorden: item.zoekwoorden,
          tags: item.tags,
          minScore: 70,
          geldigheidMaanden: 12,
          aangemaaktDoorId: req.session.userId ?? null,
          aiVerwerktOp: new Date(),
        }).returning({ id: veiligheidToolboxenTable.id })
      )
    );

    res.json({ aangemaakt: rijen.length, batch_id: batchId, onderwerpen: rijen.map((r) => ({ id: r[0]?.id })) });
  } catch (err) {
    req.log.error(err, "POST /veiligheid/toolboxen/ai-batch-genereer");
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── TOOLBOX REVIEW ────────────────────────────────────────────────────────────

veiligheidRouter.patch("/veiligheid/toolboxen/:id/review", schrijvenVeiligheid, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return void res.status(400).json({ error: "Ongeldig id" });
    const { besluit } = req.body as { besluit: string };
    if (!besluit || !["goedkeuren", "afwijzen"].includes(besluit)) {
      return void res.status(400).json({ error: "besluit moet 'goedkeuren' of 'afwijzen' zijn" });
    }
    const [toolbox] = await db
      .select({ id: veiligheidToolboxenTable.id, aiGegenereerd: veiligheidToolboxenTable.aiGegenereerd })
      .from(veiligheidToolboxenTable).where(eq(veiligheidToolboxenTable.id, id)).limit(1);
    if (!toolbox) return void res.status(404).json({ error: "Toolbox niet gevonden" });
    if (!toolbox.aiGegenereerd) return void res.status(400).json({ error: "Alleen AI-gegenereerde toolboxen kunnen worden gereviewd" });

    if (besluit === "goedkeuren") {
      await db.update(veiligheidToolboxenTable)
        .set({ gepubliceerd: true, bijgewerktOp: new Date() })
        .where(eq(veiligheidToolboxenTable.id, id));
    } else {
      await db.delete(veiligheidToolboxenTable).where(eq(veiligheidToolboxenTable.id, id));
    }
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err, "PATCH /veiligheid/toolboxen/:id/review");
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── TOOLBOX COMPLIANCE DASHBOARD ──────────────────────────────────────────────

veiligheidRouter.get("/veiligheid/toolbox-compliance", lezenVeiligheid, async (req, res): Promise<void> => {
  try {
    const nu = new Date();
    const jaar = req.query.jaar ? Number(req.query.jaar) : nu.getFullYear();
    const maand = req.query.maand ? Number(req.query.maand) : nu.getMonth() + 1;

    const opdrachten = await db
      .select({
        id: toolboxMaandOpdrachtenTable.id,
        jaar: toolboxMaandOpdrachtenTable.jaar,
        maand: toolboxMaandOpdrachtenTable.maand,
        toolboxTitel: veiligheidToolboxenTable.titel,
        toolboxCategorie: veiligheidToolboxenTable.categorie,
      })
      .from(toolboxMaandOpdrachtenTable)
      .leftJoin(veiligheidToolboxenTable, eq(toolboxMaandOpdrachtenTable.toolboxId, veiligheidToolboxenTable.id))
      .where(and(eq(toolboxMaandOpdrachtenTable.jaar, jaar), eq(toolboxMaandOpdrachtenTable.maand, maand)))
      .orderBy(desc(toolboxMaandOpdrachtenTable.aangemaaktOp));

    const resultaten = await Promise.all(opdrachten.map(async (o) => {
      const statusRijen = await db
        .select({
          gebruikerId: toolboxMaandStatusTable.gebruikerId,
          naam: gebruikersTable.naam,
          eersteAanbieding: toolboxMaandStatusTable.eersteAanbieding,
          voltooIdOp: toolboxMaandStatusTable.voltooIdOp,
        })
        .from(toolboxMaandStatusTable)
        .leftJoin(gebruikersTable, eq(toolboxMaandStatusTable.gebruikerId, gebruikersTable.id))
        .where(eq(toolboxMaandStatusTable.opdrachtId, o.id));

      const totaal = statusRijen.length;
      const voltooid = statusRijen.filter((s) => s.voltooIdOp != null).length;
      return {
        id: o.id,
        toolbox_titel: o.toolboxTitel ?? "Onbekend",
        toolbox_categorie: o.toolboxCategorie ?? "overig",
        jaar: o.jaar,
        maand: o.maand,
        totaal_voltooid: voltooid,
        totaal_gebruikers: totaal,
        voltooiingspercentage: totaal > 0 ? Math.round((voltooid / totaal) * 100) : 0,
        niet_voltooid: statusRijen
          .filter((s) => s.voltooIdOp == null)
          .map((s) => ({ gebruiker_id: s.gebruikerId, naam: s.naam ?? "Onbekend", eerste_aanbieding: s.eersteAanbieding?.toISOString() ?? null })),
      };
    }));

    const totaalG = resultaten.reduce((s, r) => s + r.totaal_gebruikers, 0);
    const totaalV = resultaten.reduce((s, r) => s + r.totaal_voltooid, 0);
    res.json({
      jaar, maand,
      statistieken: {
        totaal_opdrachten: resultaten.length,
        totaal_gebruikers: totaalG,
        voltooide_gebruikers: totaalV,
        voltooiingspercentage: totaalG > 0 ? Math.round((totaalV / totaalG) * 100) : 0,
      },
      opdrachten: resultaten,
    });
  } catch (err) {
    req.log.error(err, "GET /veiligheid/toolbox-compliance");
    res.status(500).json({ error: "Interne fout" });
  }
});

export default veiligheidRouter;
