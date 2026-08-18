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
  werkgeversTable,
  opnamesTable,
} from "@workspace/db";
import { formatNummer } from "../lib/kenmerk";
import { eq, desc, asc, inArray } from "drizzle-orm";
import { requireAuth, requireBevoegdheid } from "../middlewares/auth";
import { aiGateway, heeftGateway } from "../lib/aiGateway";
import { workflowService, maakTransitieContext } from "../services/workflow-engine";

const router = Router();

// DOORLOOP_01 §1.2: calculaties bevatten de prijzen — lezen vereist
// calculaties:1, schrijven calculaties:2 (was: alleen ingelogd).
const calcLezen     = requireBevoegdheid("calculaties", 1);
const calcSchrijven = requireBevoegdheid("calculaties", 2);

const iso = (d: Date) => d.toISOString();

function parseId(v: unknown): number {
  return parseInt(String(v), 10);
}

// NUMMER_01 §4.3: kenmerk wordt berekend uit de verwijzingen, nooit opgeslagen als
// bewerkbaar veld. [PFX-]G156/C590 — G uit gebouwen.werknummer, prefix uit de BV.
function berekenCalculatieKenmerk(
  nummer: number,
  werknummer?: string | null,
  bvPrefix?: string | null,
): string {
  const cdeel = formatNummer("C", nummer);
  const g = werknummer?.trim();
  if (!g) return cdeel;
  const prefix = bvPrefix?.trim() ? `${bvPrefix.trim()}-` : "";
  return `${prefix}${g}/${cdeel}`;
}

function mapCalculatie(
  c: typeof calculatiesTable.$inferSelect,
  extra?: {
    gebouwNaam?: string | null;
    aangemaaktDoorNaam?: string | null;
    totaal?: number;
    werknummer?: string | null;
    bvPrefix?: string | null;
  },
) {
  return {
    id: c.id,
    nummer: c.nummer,
    kenmerk: berekenCalculatieKenmerk(c.nummer, extra?.werknummer, extra?.bvPrefix),
    opname_id: c.opnameId,
    gekopieerd_van_id: c.gekopieerdVanId,
    verzonden_op: c.verzondenOp ? iso(c.verzondenOp) : null,
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

router.get("/calculaties", calcLezen, async (req, res): Promise<void> => {
  try {
    const rijen = await db
      .select({
        c: calculatiesTable,
        gebouwNaam: gebouwenTable.naam,
        werknummer: gebouwenTable.werknummer,
        bvPrefix: werkgeversTable.kenmerkPrefix,
        aangemaaktDoorNaam: gebruikersTable.naam,
      })
      .from(calculatiesTable)
      .leftJoin(gebouwenTable, eq(calculatiesTable.gebouwId, gebouwenTable.id))
      .leftJoin(werkgeversTable, eq(gebouwenTable.werkgeverId, werkgeversTable.id))
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
          werknummer: r.werknummer,
          bvPrefix: r.bvPrefix,
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

router.post("/calculaties", calcSchrijven, async (req, res): Promise<void> => {
  try {
    const { naam, gebouw_id, status, omschrijving, opname_id } = req.body as {
      naam: string;
      gebouw_id?: number | null;
      status?: string;
      omschrijving?: string | null;
      opname_id?: number | null;
    };
    if (!naam?.trim()) {
      res.status(400).json({ error: "naam is verplicht" });
      return;
    }
    // NUMMER_01 §4.4: de schakel meeting → calculatie; opname moet bestaan en
    // (indien beide opgegeven) bij hetzelfde gebouw horen.
    let opnameId: number | null = null;
    if (opname_id != null) {
      const [opname] = await db
        .select({ id: opnamesTable.id, gebouwId: opnamesTable.gebouwId })
        .from(opnamesTable)
        .where(eq(opnamesTable.id, opname_id));
      if (!opname) {
        res.status(400).json({ error: "opname_id verwijst niet naar een bestaande opname" });
        return;
      }
      if (gebouw_id != null && opname.gebouwId != null && opname.gebouwId !== gebouw_id) {
        res.status(400).json({ error: "De opname hoort bij een ander gebouw" });
        return;
      }
      opnameId = opname.id;
    }
    const [nieuw] = await db
      .insert(calculatiesTable)
      .values({
        naam: naam.trim(),
        gebouwId: gebouw_id ?? null,
        opnameId,
        status: status ?? "concept",
        omschrijving: omschrijving ?? null,
        aangemaaktDoorId: req.session.userId ?? null,
        bijgewerktOp: new Date(),
      })
      .returning();
    res.status(201).json(mapCalculatie(nieuw, { totaal: 0 }));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Serverfout" });
  }
});

router.get("/calculaties/:id", calcLezen, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params.id);
    const [rij] = await db
      .select({
        c: calculatiesTable,
        gebouwNaam: gebouwenTable.naam,
        werknummer: gebouwenTable.werknummer,
        bvPrefix: werkgeversTable.kenmerkPrefix,
        aangemaaktDoorNaam: gebruikersTable.naam,
      })
      .from(calculatiesTable)
      .leftJoin(gebouwenTable, eq(calculatiesTable.gebouwId, gebouwenTable.id))
      .leftJoin(werkgeversTable, eq(gebouwenTable.werkgeverId, werkgeversTable.id))
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
        werknummer: rij.werknummer,
        bvPrefix: rij.bvPrefix,
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

// NUMMER_01 §4.10 — herzien = kopiëren: de kopie krijgt een nieuw C-nummer uit
// dezelfde reeks; het origineel blijft ongewijzigd bestaan.
router.post("/calculaties/:id/kopieer", calcSchrijven, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params.id);
    const [bron] = await db.select().from(calculatiesTable).where(eq(calculatiesTable.id, id));
    if (!bron) { res.status(404).json({ error: "Niet gevonden" }); return; }

    const kopie = await db.transaction(async (tx) => {
      const [nieuw] = await tx
        .insert(calculatiesTable)
        .values({
          naam: bron.naam,
          gebouwId: bron.gebouwId,
          opnameId: bron.opnameId,
          gekopieerdVanId: bron.id,
          status: "concept",
          omschrijving: bron.omschrijving,
          aangemaaktDoorId: req.session.userId ?? null,
          bijgewerktOp: new Date(),
        })
        .returning();
      const regels = await tx
        .select()
        .from(calculatieRegelsTable)
        .where(eq(calculatieRegelsTable.calculatieId, bron.id));
      if (regels.length > 0) {
        await tx.insert(calculatieRegelsTable).values(
          regels.map((r) => ({
            calculatieId: nieuw.id,
            categorie: r.categorie,
            omschrijving: r.omschrijving,
            eenheid: r.eenheid,
            hoeveelheid: r.hoeveelheid,
            stukprijs: r.stukprijs,
            totaal: r.totaal,
            volgorde: r.volgorde,
            opmerkingen: r.opmerkingen,
          })),
        );
      }
      return nieuw;
    });
    res.status(201).json(mapCalculatie(kopie, { totaal: 0 }));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Serverfout" });
  }
});

router.patch("/calculaties/:id", calcSchrijven, async (req, res): Promise<void> => {
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

router.delete("/calculaties/:id", calcSchrijven, async (req, res): Promise<void> => {
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

router.get("/calculaties/:id/regels", calcLezen, async (req, res): Promise<void> => {
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

router.post("/calculaties/:id/regels", calcSchrijven, async (req, res): Promise<void> => {
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

router.patch("/calculaties/:id/regels/:regelId", calcSchrijven, async (req, res): Promise<void> => {
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

router.delete("/calculaties/:id/regels/:regelId", calcSchrijven, async (req, res): Promise<void> => {
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
router.post("/calculaties/:id/ai-regels", calcSchrijven, async (req, res): Promise<void> => {
  try {
    if (!heeftGateway()) {
      return void res.status(503).json({ error: "OpenAI niet beschikbaar" });
    }
    const calcId = parseId(req.params["id"]);
    const [calculatie] = await db
      .select()
      .from(calculatiesTable)
      .where(eq(calculatiesTable.id, calcId));
    if (!calculatie) return void res.status(404).json({ error: "Calculatie niet gevonden" });

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

    const calcAiResultaat = await aiGateway.chat("default", {
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1500,
    }, undefined, {
      module: "calculaties",
      functie: "aiRegels",
      entiteitstype: "calculatie",
      entiteitId: calcId,
      calculatie_id: calcId,
      gebruikerId: req.session.userId ?? null,
      promptNaam: "calculatie-begroting-suggesties",
      promptVersie: "1.0.0",
    });

    let regels: object[] = [];
    const raw = calcAiResultaat.ok ? calcAiResultaat.inhoud : "{}";
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
