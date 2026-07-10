import { Router } from "express";
import { db } from "@workspace/db";
import {
  gebouwenTable,
  voorzieningenTable,
  inspectiesTable,
  onderhoudTable,
  activiteitenTable,
  gebouwToewijzingenTable,
  opdrachtenTable,
} from "@workspace/db";
import { eq, count, desc, inArray, and } from "drizzle-orm";
import { effectieveContext } from "../utils/rol";
import { requireBevoegdheidOfKlant } from "../middlewares/auth";

const router = Router();
const dashboardLezen = requireBevoegdheidOfKlant("gebouwen", 1);

async function toegewezenGebouwIds(userId: number): Promise<number[]> {
  const rows = await db
    .select({ gebouwId: gebouwToewijzingenTable.gebouwId })
    .from(gebouwToewijzingenTable)
    .where(eq(gebouwToewijzingenTable.gebruikerId, userId));
  return rows.map((r) => r.gebouwId);
}

// Bepaalt of de huidige gebruiker beperkt is tot toegewezen gebouwen (via de
// bevoegdheden-matrix) en zo ja welke gebouw-id's zichtbaar zijn.
async function gebouwScope(
  req: import("express").Request,
): Promise<{ beperkt: boolean; ids: number[] }> {
  const { userId, beperkt } = await effectieveContext(req);
  if (!beperkt) return { beperkt: false, ids: [] };
  return { beperkt: true, ids: await toegewezenGebouwIds(userId) };
}

// GET /dashboard/stats
router.get("/dashboard/stats", dashboardLezen, async (req, res): Promise<void> => {
  try {
    const { beperkt, ids } = await gebouwScope(req);

    // Beperkte rol zonder toewijzingen ziet niets
    if (beperkt && ids.length === 0) {
      res.json({
        totaal_gebouwen: 0,
        totaal_voorzieningen: 0,
        goedgekeurde_voorzieningen: 0,
        afgekeurde_voorzieningen: 0,
        openstaande_inspecties: 0,
        openstaande_onderhoud: 0,
        vervallen_inspecties: 0,
        voorzieningen_per_type: [],
      });
      return;
    }

    const set = new Set(ids);

    const totaalGebouwen = beperkt
      ? ids.length
      : Number(
          (await db.select({ count: count() }).from(gebouwenTable))[0]?.count ?? 0,
        );

    const opdrachtenInUitvoering = Number(
      (await db
        .select({ count: count() })
        .from(opdrachtenTable)
        .where(eq(opdrachtenTable.aiFase, "uitvoering")))[0]?.count ?? 0,
    );

    let voorzieningen = await db
      .select({
        status: voorzieningenTable.status,
        type: voorzieningenTable.type,
        gebouwId: voorzieningenTable.gebouwId,
      })
      .from(voorzieningenTable)
      .where(eq(voorzieningenTable.gearchiveerd, false));
    let inspecties = await db
      .select({ status: inspectiesTable.status, gebouwId: inspectiesTable.gebouwId })
      .from(inspectiesTable);
    let onderhoud = await db
      .select({ status: onderhoudTable.status, gebouwId: onderhoudTable.gebouwId })
      .from(onderhoudTable);

    if (beperkt) {
      voorzieningen = voorzieningen.filter(
        (v) => v.gebouwId != null && set.has(v.gebouwId),
      );
      inspecties = inspecties.filter((i) => i.gebouwId != null && set.has(i.gebouwId));
      onderhoud = onderhoud.filter((o) => o.gebouwId != null && set.has(o.gebouwId));
    }

    const typeCount: Record<string, number> = {};
    for (const v of voorzieningen) {
      typeCount[v.type] = (typeCount[v.type] ?? 0) + 1;
    }

    res.json({
      totaal_gebouwen: totaalGebouwen,
      totaal_voorzieningen: voorzieningen.length,
      goedgekeurde_voorzieningen: voorzieningen.filter((v) => v.status === "goedgekeurd").length,
      afgekeurde_voorzieningen: voorzieningen.filter((v) => v.status === "afgekeurd").length,
      openstaande_inspecties: inspecties.filter((i) => i.status === "gepland").length,
      openstaande_onderhoud: onderhoud.filter((o) => o.status === "open").length,
      vervallen_inspecties: inspecties.filter((i) => i.status === "afgekeurd").length,
      opdrachten_in_uitvoering: opdrachtenInUitvoering,
      voorzieningen_per_type: Object.entries(typeCount).map(([type, aantal]) => ({ type, aantal })),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /dashboard/recente-activiteit
router.get("/dashboard/recente-activiteit", dashboardLezen, async (req, res): Promise<void> => {
  try {
    const { beperkt, ids } = await gebouwScope(req);

    const limit = parseInt((req.query.limit as string) ?? "20");

    // Beperkte rollen: filter op de namen van toegewezen gebouwen. Algemene
    // activiteiten zonder gebouw blijven zichtbaar.
    let toegestaneNamen: Set<string> | null = null;
    if (beperkt) {
      if (ids.length === 0) {
        res.json([]);
        return;
      }
      const gebouwen = await db
        .select({ naam: gebouwenTable.naam })
        .from(gebouwenTable)
        .where(inArray(gebouwenTable.id, ids));
      toegestaneNamen = new Set(gebouwen.map((g) => g.naam));
    }

    const activiteiten = await db
      .select()
      .from(activiteitenTable)
      .orderBy(desc(activiteitenTable.tijdstip))
      .limit(toegestaneNamen ? limit * 5 : limit);

    const zichtbaar = toegestaneNamen
      ? activiteiten.filter((a) => !a.gebouwNaam || toegestaneNamen!.has(a.gebouwNaam)).slice(0, limit)
      : activiteiten;

    res.json(
      zichtbaar.map((a) => ({
        id: a.id,
        type: a.type,
        omschrijving: a.omschrijving,
        tijdstip: a.tijdstip.toISOString(),
        gebouw_naam: a.gebouwNaam,
        voorziening_nummer: a.voorzieningNummer,
        gebruiker_naam: a.gebruikerNaam,
        offerte_id: a.offerteId ?? null,
      })),
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /dashboard/status-verdeling
router.get("/dashboard/status-verdeling", dashboardLezen, async (req, res): Promise<void> => {
  try {
    const { beperkt, ids } = await gebouwScope(req);

    if (beperkt && ids.length === 0) {
      res.json([]);
      return;
    }

    const gebouwen = beperkt
      ? await db.select().from(gebouwenTable).where(inArray(gebouwenTable.id, ids))
      : await db.select().from(gebouwenTable);

    const result = await Promise.all(
      gebouwen.map(async (g) => {
        const vv = await db
          .select({ status: voorzieningenTable.status })
          .from(voorzieningenTable)
          .where(
            and(
              eq(voorzieningenTable.gebouwId, g.id),
              eq(voorzieningenTable.gearchiveerd, false)
            )
          );
        return {
          gebouw_id: g.id,
          gebouw_naam: g.naam,
          totaal: vv.length,
          voorbereid: vv.filter((v) => v.status === "voorbereid").length,
          goedgekeurd: vv.filter((v) => v.status === "goedgekeurd").length,
          afgekeurd: vv.filter((v) => v.status === "afgekeurd").length,
          in_bewerking: vv.filter((v) => v.status === "concept" || v.status === "in_uitvoering").length,
          in_onderhoud: vv.filter((v) => v.status === "in_onderhoud").length,
        };
      })
    );
    res.json(result);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /dashboard/vervaldagen
router.get("/dashboard/vervaldagen", dashboardLezen, async (req, res): Promise<void> => {
  try {
    const { beperkt, ids } = await gebouwScope(req);

    if (beperkt && ids.length === 0) {
      res.json([]);
      return;
    }
    const set = new Set(ids);

    const dagen = parseInt((req.query.dagen as string) ?? "30");
    const grens = new Date();
    grens.setDate(grens.getDate() + dagen);

    const voorzieningen = await db
      .select()
      .from(voorzieningenTable)
      .where(
        and(
          eq(voorzieningenTable.status, "goedgekeurd"),
          eq(voorzieningenTable.gearchiveerd, false)
        )
      );

    const result = [];
    for (const v of voorzieningen) {
      if (!v.volgendeInspectie) continue;
      if (beperkt && !(v.gebouwId != null && set.has(v.gebouwId))) continue;
      const d = new Date(v.volgendeInspectie);
      if (d <= grens) {
        const gebouw = v.gebouwId
          ? await db.select({ naam: gebouwenTable.naam }).from(gebouwenTable).where(eq(gebouwenTable.id, v.gebouwId)).then((r) => r[0])
          : null;
        const dagenOver = Math.floor((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        result.push({
          id: v.id,
          voorziening_id: v.id,
          voorziening_nummer: v.objectnummer,
          gebouw_naam: gebouw?.naam ?? "Onbekend",
          vervaldatum: v.volgendeInspectie,
          type: v.type,
          dagen_over: dagenOver,
        });
      }
    }

    res.json(result);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
