import { Router } from "express";
import { db } from "@workspace/db";
import {
  gebouwenTable,
  voorzieningenTable,
  inspectiesTable,
  onderhoudTable,
  activiteitenTable,
} from "@workspace/db";
import { eq, count, desc } from "drizzle-orm";

const router = Router();

// GET /dashboard/stats
router.get("/dashboard/stats", async (req, res) => {
  try {
    const [totaalGebouwen] = await db.select({ count: count() }).from(gebouwenTable);
    const alleVoorzieningen = await db.select({ status: voorzieningenTable.status, type: voorzieningenTable.type }).from(voorzieningenTable);
    const [openInspecties] = await db
      .select({ count: count() })
      .from(inspectiesTable)
      .where(eq(inspectiesTable.status, "gepland"));
    const [openOnderhoud] = await db
      .select({ count: count() })
      .from(onderhoudTable)
      .where(eq(onderhoudTable.status, "open"));
    const [vervallenInspecties] = await db
      .select({ count: count() })
      .from(inspectiesTable)
      .where(eq(inspectiesTable.status, "afgekeurd"));

    const typeCount: Record<string, number> = {};
    for (const v of alleVoorzieningen) {
      typeCount[v.type] = (typeCount[v.type] ?? 0) + 1;
    }

    res.json({
      totaal_gebouwen: Number(totaalGebouwen?.count ?? 0),
      totaal_voorzieningen: alleVoorzieningen.length,
      goedgekeurde_voorzieningen: alleVoorzieningen.filter((v) => v.status === "goedgekeurd").length,
      afgekeurde_voorzieningen: alleVoorzieningen.filter((v) => v.status === "afgekeurd").length,
      openstaande_inspecties: Number(openInspecties?.count ?? 0),
      openstaande_onderhoud: Number(openOnderhoud?.count ?? 0),
      vervallen_inspecties: Number(vervallenInspecties?.count ?? 0),
      voorzieningen_per_type: Object.entries(typeCount).map(([type, aantal]) => ({ type, aantal })),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /dashboard/recente-activiteit
router.get("/dashboard/recente-activiteit", async (req, res) => {
  try {
    const limit = parseInt((req.query.limit as string) ?? "20");
    const activiteiten = await db
      .select()
      .from(activiteitenTable)
      .orderBy(desc(activiteitenTable.tijdstip))
      .limit(limit);

    res.json(
      activiteiten.map((a) => ({
        id: a.id,
        type: a.type,
        omschrijving: a.omschrijving,
        tijdstip: a.tijdstip.toISOString(),
        gebouw_naam: a.gebouwNaam,
        voorziening_nummer: a.voorzieningNummer,
        gebruiker_naam: a.gebruikerNaam,
      }))
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /dashboard/status-verdeling
router.get("/dashboard/status-verdeling", async (req, res) => {
  try {
    const gebouwen = await db.select().from(gebouwenTable);
    const result = await Promise.all(
      gebouwen.map(async (g) => {
        const vv = await db
          .select({ status: voorzieningenTable.status })
          .from(voorzieningenTable)
          .where(eq(voorzieningenTable.gebouwId, g.id));
        return {
          gebouw_id: g.id,
          gebouw_naam: g.naam,
          totaal: vv.length,
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
router.get("/dashboard/vervaldagen", async (req, res) => {
  try {
    const dagen = parseInt((req.query.dagen as string) ?? "30");
    const grens = new Date();
    grens.setDate(grens.getDate() + dagen);

    const voorzieningen = await db
      .select()
      .from(voorzieningenTable)
      .where(
        // Get all with volgende_inspectie set
        eq(voorzieningenTable.status, "goedgekeurd")
      );

    const result = [];
    for (const v of voorzieningen) {
      if (!v.volgendeInspectie) continue;
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
