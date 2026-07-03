// Calculaties (FPS Connect) — projectcalculaties en begrotingsregels.
// Eigen module, geen invloed op bestaande offerte/onderhoud/spotflows.
import { Router } from "express";
import {
  db,
  calculatiesTable,
  calculatieRegelsTable,
  gebouwenTable,
  gebruikersTable,
  voorzieningenTable,
} from "@workspace/db";
import { eq, desc, asc, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { heeftOpenAi, maakOpenAiClient } from "../lib/openai";
import { workflowService, maakTransitieContext } from "../services/workflow-engine";

const router = Router();

const iso = (d: Date) => d.toISOString();

function parseId(v: unknown): number {
  return parseInt(String(v), 10);
}

function mapCalculatie(
  c: typeof calculatiesTable.$inferSelect,
  extra?: { gebouwNaam?: string | null; aangemaaktDoorNaam?: string | null; totaal?: number },
) {
  return {
    id: c.id,
    naam: c.naam,
    gebouw_id: c.gebouwId,
    gebouw_naam: extra?.gebouwNaam ?? null,
    status: c.status,
    omschrijving: c.omschrijving,
    aangemaakt_door_id: c.aangemaaktDoorId,
    aangemaakt_door_naam: extra?.aangemaaktDoorNaam ?? null,
    totaal_excl_btw: extra?.totaal ?? 0,
    aangemaakt_op: iso(c.aangemaaktOp),
    bijgewerkt_op: iso(c.bijgewerktOp),
  };
}

function mapRegel(r: typeof calculatieRegelsTable.$inferSelect) {
  return {
    id: r.id,
    calculatie_id: r.calculatieId,
    categorie: r.categorie,
    omschrijving: r.omschrijving,
    eenheid: r.eenheid,
    hoeveelheid: r.hoeveelheid,
    stukprijs: r.stukprijs,
    totaal: r.totaal,
    volgorde: r.volgorde,
    opmerkingen: r.opmerkingen,
    aangemaakt_op: iso(r.aangemaaktOp),
    bijgewerkt_op: iso(r.bijgewerktOp),
  };
}

// ── Calculaties ─────────────────────────────────────────────────────────────

router.get("/calculaties", async (req, res) => {
  try {
    const rijen = await db
      .select({
        c: calculatiesTable,
        gebouwNaam: gebouwenTable.naam,
        aangemaaktDoorNaam: gebruikersTable.naam,
      })
      .from(calculatiesTable)
      .leftJoin(gebouwenTable, eq(calculatiesTable.gebouwId, gebouwenTable.id))
      .leftJoin(gebruikersTable, eq(calculatiesTable.aangemaaktDoorId, gebruikersTable.id))
      .orderBy(desc(calculatiesTable.aangemaaktOp));

    const ids = rijen.map((r) => r.c.id);
    let totalen: Record<number, number> = {};
    if (ids.length > 0) {
      const regels = await db
        .select()
        .from(calculatieRegelsTable)
        .where(inArray(calculatieRegelsTable.calculatieId, ids));
      for (const r of regels) {
        totalen[r.calculatieId] = (totalen[r.calculatieId] ?? 0) + r.totaal;
      }
    }

    res.json(
      rijen.map((r) =>
        mapCalculatie(r.c, {
          gebouwNaam: r.gebouwNaam,
          aangemaaktDoorNaam: r.aangemaaktDoorNaam,
          totaal: totalen[r.c.id] ?? 0,
        }),
      ),
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Serverfout" });
  }
});

router.post("/calculaties", async (req, res) => {
  try {
    const { naam, gebouw_id, status, omschrijving } = req.body as {
      naam: string;
      gebouw_id?: number | null;
      status?: string;
      omschrijving?: string | null;
    };
    if (!naam?.trim()) {
      res.status(400).json({ error: "naam is verplicht" });
      return;
    }
    const [nieuw] = await db
      .insert(calculatiesTable)
      .values({
        naam: naam.trim(),
        gebouwId: gebouw_id ?? null,
        status: status ?? "concept",
        omschrijving: omschrijving ?? null,
        aangemaaktDoorId: (req.session as { userId?: number }).userId ?? null,
        bijgewerktOp: new Date(),
      })
      .returning();
    res.status(201).json(mapCalculatie(nieuw, { totaal: 0 }));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Serverfout" });
  }
});

router.get("/calculaties/:id", async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const [rij] = await db
      .select({
        c: calculatiesTable,
        gebouwNaam: gebouwenTable.naam,
        aangemaaktDoorNaam: gebruikersTable.naam,
      })
      .from(calculatiesTable)
      .leftJoin(gebouwenTable, eq(calculatiesTable.gebouwId, gebouwenTable.id))
      .leftJoin(gebruikersTable, eq(calculatiesTable.aangemaaktDoorId, gebruikersTable.id))
      .where(eq(calculatiesTable.id, id));
    if (!rij) { res.status(404).json({ error: "Niet gevonden" }); return; }

    const regels = await db
      .select()
      .from(calculatieRegelsTable)
      .where(eq(calculatieRegelsTable.calculatieId, id))
      .orderBy(asc(calculatieRegelsTable.volgorde), asc(calculatieRegelsTable.aangemaaktOp));

    const totaal = regels.reduce((s, r) => s + r.totaal, 0);

    res.json({
      ...mapCalculatie(rij.c, {
        gebouwNaam: rij.gebouwNaam,
        aangemaaktDoorNaam: rij.aangemaaktDoorNaam,
        totaal,
      }),
      regels: regels.map(mapRegel),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Serverfout" });
  }
});

router.patch("/calculaties/:id", async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const { naam, gebouw_id, status, omschrijving } = req.body as {
      naam?: string;
      gebouw_id?: number | null;
      status?: string;
      omschrijving?: string | null;
    };
    // Status via de WorkflowEngine
    if (status !== undefined) {
      const ctx = await maakTransitieContext(req, db);
      const result = await workflowService.transiteer("calculatie", id, status, ctx);
      if (!result.ok) {
        res.status(result.error!.httpStatus).json({ error: result.error!.bericht }); return;
      }
    }

    // Overige veldwijzigingen
    const [bijgewerkt] = await db
      .update(calculatiesTable)
      .set({
        ...(naam !== undefined ? { naam: naam.trim() } : {}),
        ...(gebouw_id !== undefined ? { gebouwId: gebouw_id } : {}),
        ...(omschrijving !== undefined ? { omschrijving } : {}),
        bijgewerktOp: new Date(),
      })
      .where(eq(calculatiesTable.id, id))
      .returning();
    if (!bijgewerkt) { res.status(404).json({ error: "Niet gevonden" }); return; }
    res.json(mapCalculatie(bijgewerkt, { totaal: 0 }));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Serverfout" });
  }
});

router.delete("/calculaties/:id", async (req, res) => {
  try {
    const id = parseId(req.params.id);
    await db.delete(calculatiesTable).where(eq(calculatiesTable.id, id));
    res.status(204).end();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── Regels ──────────────────────────────────────────────────────────────────

router.get("/calculaties/:id/regels", async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const regels = await db
      .select()
      .from(calculatieRegelsTable)
      .where(eq(calculatieRegelsTable.calculatieId, id))
      .orderBy(asc(calculatieRegelsTable.volgorde), asc(calculatieRegelsTable.aangemaaktOp));
    res.json(regels.map(mapRegel));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Serverfout" });
  }
});

router.post("/calculaties/:id/regels", async (req, res) => {
  try {
    const calculatieId = parseId(req.params.id);
    const { categorie, omschrijving, eenheid, hoeveelheid, stukprijs, volgorde, opmerkingen } =
      req.body as {
        categorie?: string;
        omschrijving: string;
        eenheid?: string;
        hoeveelheid?: number;
        stukprijs?: number;
        volgorde?: number;
        opmerkingen?: string | null;
      };
    if (!omschrijving?.trim()) {
      res.status(400).json({ error: "omschrijving is verplicht" });
      return;
    }
    const h = Number(hoeveelheid ?? 0);
    const p = Number(stukprijs ?? 0);
    const [nieuw] = await db
      .insert(calculatieRegelsTable)
      .values({
        calculatieId,
        categorie: categorie ?? "arbeid",
        omschrijving: omschrijving.trim(),
        eenheid: eenheid ?? "st",
        hoeveelheid: h,
        stukprijs: p,
        totaal: Math.round(h * p * 100) / 100,
        volgorde: volgorde ?? 0,
        opmerkingen: opmerkingen ?? null,
        bijgewerktOp: new Date(),
      })
      .returning();
    res.status(201).json(mapRegel(nieuw));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Serverfout" });
  }
});

router.patch("/calculaties/:id/regels/:regelId", async (req, res) => {
  try {
    const regelId = parseId(req.params.regelId);
    const { categorie, omschrijving, eenheid, hoeveelheid, stukprijs, volgorde, opmerkingen } =
      req.body as {
        categorie?: string;
        omschrijving?: string;
        eenheid?: string;
        hoeveelheid?: number;
        stukprijs?: number;
        volgorde?: number;
        opmerkingen?: string | null;
      };

    const [huidig] = await db
      .select()
      .from(calculatieRegelsTable)
      .where(eq(calculatieRegelsTable.id, regelId));
    if (!huidig) { res.status(404).json({ error: "Niet gevonden" }); return; }

    const h = hoeveelheid !== undefined ? Number(hoeveelheid) : huidig.hoeveelheid;
    const p = stukprijs !== undefined ? Number(stukprijs) : huidig.stukprijs;

    const [bijgewerkt] = await db
      .update(calculatieRegelsTable)
      .set({
        ...(categorie !== undefined ? { categorie } : {}),
        ...(omschrijving !== undefined ? { omschrijving: omschrijving.trim() } : {}),
        ...(eenheid !== undefined ? { eenheid } : {}),
        hoeveelheid: h,
        stukprijs: p,
        totaal: Math.round(h * p * 100) / 100,
        ...(volgorde !== undefined ? { volgorde } : {}),
        ...(opmerkingen !== undefined ? { opmerkingen } : {}),
        bijgewerktOp: new Date(),
      })
      .where(eq(calculatieRegelsTable.id, regelId))
      .returning();
    res.json(mapRegel(bijgewerkt));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Serverfout" });
  }
});

router.delete("/calculaties/:id/regels/:regelId", async (req, res) => {
  try {
    const regelId = parseId(req.params.regelId);
    await db.delete(calculatieRegelsTable).where(eq(calculatieRegelsTable.id, regelId));
    res.status(204).end();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Serverfout" });
  }
});

// POST /calculaties/:id/ai-regels — AI-gestuurde kostenregel-suggesties.
// Mens bevestigt per regel; niets wordt automatisch opgeslagen.
router.post("/calculaties/:id/ai-regels", requireAuth, async (req, res) => {
  try {
    if (!heeftOpenAi()) {
      return res.status(503).json({ error: "OpenAI niet beschikbaar" });
    }
    const calcId = parseId(req.params["id"]);
    const [calculatie] = await db
      .select()
      .from(calculatiesTable)
      .where(eq(calculatiesTable.id, calcId));
    if (!calculatie) return res.status(404).json({ error: "Calculatie niet gevonden" });

    let gebouwNaam: string | null = null;
    let spotSamenvatting = "Nog geen voorzieningen geregistreerd.";

    if (calculatie.gebouwId) {
      const [gebouw] = await db
        .select({ naam: gebouwenTable.naam })
        .from(gebouwenTable)
        .where(eq(gebouwenTable.id, calculatie.gebouwId));
      if (gebouw) gebouwNaam = gebouw.naam;

      const spots = await db
        .select({ type: voorzieningenTable.type, status: voorzieningenTable.status })
        .from(voorzieningenTable)
        .where(eq(voorzieningenTable.gebouwId, calculatie.gebouwId));

      if (spots.length > 0) {
        const perType: Record<string, number> = {};
        for (const s of spots) {
          const key = s.type ?? "onbekend";
          perType[key] = (perType[key] ?? 0) + 1;
        }
        spotSamenvatting = Object.entries(perType)
          .map(([t, n]) => `${n}x ${t}`)
          .join(", ");
      }
    }

    const prompt = `Je bent kostenexpert voor passieve brandwering in Nederland.
${gebouwNaam ? `Project: ${gebouwNaam}.` : "Geen gebouw gekoppeld."}
Geïnstalleerde brandpreventieve voorzieningen: ${spotSamenvatting}
Calculatienaam: "${calculatie.naam}".${calculatie.omschrijving ? `\nOmschrijving: ${calculatie.omschrijving}.` : ""}

Genereer een realistische projectbegroting voor het uitvoeren, controleren en opleveren van deze brandpreventieve voorzieningen in Nederland.
Gebruik categorieën: arbeid, materiaal, overhead, overig.
Geef 6-10 begrotingsregels terug als JSON object met sleutel "regels":
{"regels":[{"categorie":"arbeid|materiaal|overhead|overig","omschrijving":"...","eenheid":"uur|st|m2|m|lump sum","hoeveelheid":1,"stukprijs":1}]}
Alleen het JSON object, geen uitleg.`;

    const openai = maakOpenAiClient();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1500,
    });

    let regels: object[] = [];
    const raw = completion.choices[0]?.message?.content ?? "{}";
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      regels = Array.isArray(parsed) ? parsed : (Array.isArray(parsed["regels"]) ? (parsed["regels"] as object[]) : []);
    } catch {
      regels = [];
    }

    res.json({ regels, gebouw_naam: gebouwNaam });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Serverfout bij AI-suggesties" });
  }
});

export default router;
