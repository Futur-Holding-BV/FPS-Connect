import { Router } from "express";
import { db } from "@workspace/db";
import { voorzieningenTable, verdiepingenTable, gebouwenTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";

const mijnWerkRouter = Router();

mijnWerkRouter.get("/mijn-werk", requireAuth, async (req, res) => {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ fout: "Niet ingelogd" });

  const rijen = await db
    .select({
      id: voorzieningenTable.id,
      objectnummer: voorzieningenTable.objectnummer,
      type: voorzieningenTable.type,
      status: voorzieningenTable.status,
      ruimte: voorzieningenTable.ruimte,
      verdiepingId: verdiepingenTable.id,
      verdiepingNaam: verdiepingenTable.naam,
      gebouwId: gebouwenTable.id,
      gebouwNaam: gebouwenTable.naam,
      adres: gebouwenTable.adres,
      stad: gebouwenTable.stad,
    })
    .from(voorzieningenTable)
    .innerJoin(verdiepingenTable, eq(voorzieningenTable.verdiepingId, verdiepingenTable.id))
    .innerJoin(gebouwenTable, eq(verdiepingenTable.gebouwId, gebouwenTable.id))
    .where(
      and(
        eq(voorzieningenTable.monteurId, userId),
        eq(voorzieningenTable.gearchiveerd, false),
      ),
    )
    .orderBy(gebouwenTable.naam, voorzieningenTable.objectnummer);

  const gebouwen = new Map<
    number,
    {
      gebouw_id: number;
      gebouw_naam: string;
      adres: string;
      stad: string;
      spots: Array<{
        id: number;
        objectnummer: string;
        type: string;
        status: string;
        ruimte: string | null;
        verdieping_naam: string | null;
        verdieping_id: number | null;
      }>;
    }
  >();

  for (const r of rijen) {
    if (!gebouwen.has(r.gebouwId)) {
      gebouwen.set(r.gebouwId, {
        gebouw_id: r.gebouwId,
        gebouw_naam: r.gebouwNaam,
        adres: r.adres ?? "",
        stad: r.stad ?? "",
        spots: [],
      });
    }
    gebouwen.get(r.gebouwId)!.spots.push({
      id: r.id,
      objectnummer: r.objectnummer ?? "",
      type: r.type,
      status: r.status,
      ruimte: r.ruimte ?? null,
      verdieping_naam: r.verdiepingNaam ?? null,
      verdieping_id: r.verdiepingId ?? null,
    });
  }

  return res.json(Array.from(gebouwen.values()));
});

export default mijnWerkRouter;
