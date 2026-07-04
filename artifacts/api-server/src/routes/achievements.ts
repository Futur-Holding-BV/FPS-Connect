import { count, desc, eq, sql } from "drizzle-orm";
import { Router } from "express";
import { db } from "@workspace/db";
import { medewerkersTable, monteurAchievementsTable, gebruikersTable, voorzieningenTable } from "@workspace/db/schema";
import { requireAuth } from "../middlewares/auth";

export const achievementsRouter = Router();

export const MIJLPALEN = [
  { spots: 50, rang: "Soldaat", beloning: "Bronzen medaille" },
  { spots: 250, rang: "Sergeant", beloning: "Zilveren medaille" },
  { spots: 500, rang: "Sergeant-Majoor", beloning: "Gouden medaille" },
  { spots: 999, rang: "Luitenant", beloning: "Speciale medaille" },
  { spots: 1000, rang: "Kapitein", beloning: "Bronzen beker" },
  { spots: 2500, rang: "Majoor", beloning: "Zilveren beker" },
  { spots: 5000, rang: "Kolonel", beloning: "Gouden beker" },
  { spots: 10000, rang: "Brigadegeneraal", beloning: "Kristallen beker" },
  { spots: 20000, rang: "Generaal", beloning: "Diamanten beker" },
  { spots: 50000, rang: "FPS Legend", beloning: "Legende-trofee" },
] as const;

export type Mijlpaal = (typeof MIJLPALEN)[number];

export function bepaalRang(totaalSpots: number): Mijlpaal | null {
  let huidig: Mijlpaal | null = null;
  for (const m of MIJLPALEN) {
    if (totaalSpots >= m.spots) huidig = m;
  }
  return huidig;
}

export function bepaalVolgendeMijlpaal(totaalSpots: number): Mijlpaal | null {
  for (const m of MIJLPALEN) {
    if (totaalSpots < m.spots) return m;
  }
  return null;
}

export async function controleerEnKenToe(gebruikerId: number) {
  const [{ spotsCount }] = await db
    .select({ spotsCount: count() })
    .from(voorzieningenTable)
    .where(eq(voorzieningenTable.makerMonteurId, gebruikerId));

  const totaalSpots = Number(spotsCount);

  const medewerkerRij = await db
    .select({ id: medewerkersTable.id })
    .from(medewerkersTable)
    .where(eq(medewerkersTable.gebruikerId, gebruikerId))
    .limit(1);
  const medewerkerId = medewerkerRij[0]?.id ?? null;

  const bestaand = await db
    .select({ spotsMijlpaal: monteurAchievementsTable.spotsMijlpaal })
    .from(monteurAchievementsTable)
    .where(eq(monteurAchievementsTable.gebruikerId, gebruikerId));
  const bestaandeMijlpalen = new Set(bestaand.map((a) => a.spotsMijlpaal));

  const vandaag = new Date().toISOString().slice(0, 10);
  const nieuw: (typeof monteurAchievementsTable.$inferSelect)[] = [];

  for (const mijlpaal of MIJLPALEN) {
    if (totaalSpots >= mijlpaal.spots && !bestaandeMijlpalen.has(mijlpaal.spots)) {
      const [achievement] = await db
        .insert(monteurAchievementsTable)
        .values({
          gebruikerId,
          medewerkerId,
          spotsMijlpaal: mijlpaal.spots,
          rang: mijlpaal.rang,
          beloning: mijlpaal.beloning,
          behaaldOp: vandaag,
        })
        .onConflictDoNothing()
        .returning();
      if (achievement) nieuw.push(achievement);
    }
  }

  return { nieuw, totaalSpots };
}

function mapAchievement(a: typeof monteurAchievementsTable.$inferSelect) {
  return {
    id: a.id,
    gebruiker_id: a.gebruikerId,
    medewerker_id: a.medewerkerId ?? null,
    spots_mijlpaal: a.spotsMijlpaal,
    rang: a.rang,
    beloning: a.beloning,
    behaald_op: a.behaaldOp,
    aangemaakt_op: a.aangemaaktOp,
  };
}

// POST /achievements/controleer — check en ken toe voor ingelogde gebruiker
achievementsRouter.post("/achievements/controleer", requireAuth, async (req, res): Promise<void> => {
  try {
    const gebruikerId = req.session.userId!;
    const { nieuw, totaalSpots } = await controleerEnKenToe(gebruikerId);
    res.json({ nieuw: nieuw.map(mapAchievement), totaal_spots: totaalSpots });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /medewerkers/:id/achievements — profiel-view van een medewerker
achievementsRouter.get("/medewerkers/:id/achievements", requireAuth, async (req, res): Promise<void> => {
  try {
    const medewerkerId = Number(req.params.id);

    const medewerkerRij = await db
      .select({ gebruikerId: medewerkersTable.gebruikerId })
      .from(medewerkersTable)
      .where(eq(medewerkersTable.id, medewerkerId))
      .limit(1);

    if (!medewerkerRij[0]) return void res.status(404).json({ error: "Medewerker niet gevonden" });
    const gebruikerId = medewerkerRij[0].gebruikerId;

    let totaalSpots = 0;
    if (gebruikerId) {
      const [{ spotsCount }] = await db
        .select({ spotsCount: count() })
        .from(voorzieningenTable)
        .where(eq(voorzieningenTable.makerMonteurId, gebruikerId));
      totaalSpots = Number(spotsCount);
    }

    const achievements = gebruikerId
      ? await db
          .select()
          .from(monteurAchievementsTable)
          .where(eq(monteurAchievementsTable.gebruikerId, gebruikerId))
          .orderBy(monteurAchievementsTable.spotsMijlpaal)
      : [];

    const huidig = bepaalRang(totaalSpots);
    const volgend = bepaalVolgendeMijlpaal(totaalSpots);

    res.json({
      totaal_spots: totaalSpots,
      huidige_rang: huidig?.rang ?? null,
      huidige_beloning: huidig?.beloning ?? null,
      volgende_rang: volgend?.rang ?? null,
      volgende_mijlpaal: volgend?.spots ?? null,
      achievements: achievements.map(mapAchievement),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /hall-of-fame — ranglijst alle monteurs op geplaatste spots
achievementsRouter.get("/hall-of-fame", requireAuth, async (req, res): Promise<void> => {
  try {
    const rijen = await db
      .select({
        gebruikerId: voorzieningenTable.makerMonteurId,
        spotsCount: count(),
      })
      .from(voorzieningenTable)
      .where(sql`${voorzieningenTable.makerMonteurId} IS NOT NULL`)
      .groupBy(voorzieningenTable.makerMonteurId)
      .orderBy(desc(count()))
      .limit(100);

    const resultaat = await Promise.all(
      rijen.map(async (rij, idx) => {
        const gId = rij.gebruikerId!;

        const gebruikerRij = await db
          .select({ naam: gebruikersTable.naam })
          .from(gebruikersTable)
          .where(eq(gebruikersTable.id, gId))
          .limit(1);

        const medewerkerRij = await db
          .select({ id: medewerkersTable.id })
          .from(medewerkersTable)
          .where(eq(medewerkersTable.gebruikerId, gId))
          .limit(1);

        const bestAchievement = await db
          .select({ rang: monteurAchievementsTable.rang, beloning: monteurAchievementsTable.beloning })
          .from(monteurAchievementsTable)
          .where(eq(monteurAchievementsTable.gebruikerId, gId))
          .orderBy(desc(monteurAchievementsTable.spotsMijlpaal))
          .limit(1);

        return {
          positie: idx + 1,
          gebruiker_id: gId,
          medewerker_id: medewerkerRij[0]?.id ?? null,
          naam: gebruikerRij[0]?.naam ?? "Onbekend",
          rang: bestAchievement[0]?.rang ?? null,
          beloning: bestAchievement[0]?.beloning ?? null,
          spots_count: Number(rij.spotsCount),
        };
      })
    );

    res.json(resultaat);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});
