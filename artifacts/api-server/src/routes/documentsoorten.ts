// WAGENPARK_01 §2.2 — beheerbare documentsoorten (naam, vervaldatum ja/nee,
// waarschuwingstermijn). Startset wordt in de migratie gezaaid; volledig
// bewerkbaar en verwijderbaar. context 'financieel_contract' volgt in CONTRACT_01
// en hergebruikt ditzelfde beheer (niet dubbel bouwen).

import { Router } from "express";
import { db } from "@workspace/db";
import { documentsoortenTable, documentenTable } from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth.js";

const router = Router();

const lezen  = requireBevoegdheid("wagenpark", 1);
const beheer = requireBevoegdheid("wagenpark", 3);

const GELDIGE_CONTEXTEN = ["voertuig", "financieel_contract"] as const;
type Context = (typeof GELDIGE_CONTEXTEN)[number];

// Unieke-naam-conflict herkennen: postgres 23505 kan genest zitten (err.cause).
function isUniekConflict(err: unknown): boolean {
  let e: any = err;
  for (let i = 0; i < 4 && e; i++) {
    if (e.code === "23505" || String(e.message ?? "").includes("documentsoorten_context_naam_uniek")) return true;
    e = e.cause;
  }
  return String(err).includes("documentsoorten_context_naam_uniek");
}

function mapSoort(s: typeof documentsoortenTable.$inferSelect, inGebruik: number) {
  return {
    id: s.id,
    context: s.context,
    naam: s.naam,
    heeft_vervaldatum: s.heeftVervaldatum,
    waarschuwing_dagen: s.waarschuwingDagen,
    in_gebruik: inGebruik,
  };
}

router.get("/documentsoorten", lezen, async (req, res): Promise<void> => {
  const context = (req.query["context"] as string | undefined) ?? "voertuig";
  if (!GELDIGE_CONTEXTEN.includes(context as Context)) {
    return void res.status(400).json({ fout: "Ongeldige context" });
  }

  const rijen = await db
    .select({
      soort: documentsoortenTable,
      inGebruik: sql<number>`count(${documentenTable.id}) filter (where ${documentenTable.gearchiveerd} = false)`,
    })
    .from(documentsoortenTable)
    .leftJoin(documentenTable, eq(documentenTable.documentsoortId, documentsoortenTable.id))
    .where(eq(documentsoortenTable.context, context))
    .groupBy(documentsoortenTable.id)
    .orderBy(documentsoortenTable.naam);

  res.json(rijen.map((r) => mapSoort(r.soort, Number(r.inGebruik))));
});

router.post("/documentsoorten", beheer, async (req, res): Promise<void> => {
  const body = req.body as { context?: string; naam?: string; heeft_vervaldatum?: boolean; waarschuwing_dagen?: number };
  const context = body.context ?? "voertuig";
  const naam = typeof body.naam === "string" ? body.naam.trim() : "";

  if (!GELDIGE_CONTEXTEN.includes(context as Context)) return void res.status(400).json({ fout: "Ongeldige context" });
  if (!naam || naam.length > 80) return void res.status(400).json({ fout: "Naam is verplicht (max 80 tekens)" });
  const heeftVervaldatum = body.heeft_vervaldatum ?? true;
  const waarschuwingDagen = heeftVervaldatum ? Math.min(Math.max(Math.round(body.waarschuwing_dagen ?? 30), 0), 365) : 0;

  try {
    const [rij] = await db.insert(documentsoortenTable)
      .values({ context, naam, heeftVervaldatum, waarschuwingDagen, bijgewerktOp: new Date() })
      .returning();
    res.status(201).json(mapSoort(rij, 0));
  } catch (err: unknown) {
    if (isUniekConflict(err)) {
      return void res.status(409).json({ fout: "Deze naam bestaat al binnen deze context" });
    }
    throw err;
  }
});

router.patch("/documentsoorten/:id", beheer, async (req, res): Promise<void> => {
  const id = Number(req.params["id"]);
  if (isNaN(id)) return void res.status(400).json({ fout: "Ongeldig ID" });
  const body = req.body as { naam?: string; heeft_vervaldatum?: boolean; waarschuwing_dagen?: number };

  const patch: Partial<typeof documentsoortenTable.$inferInsert> = { bijgewerktOp: new Date() };
  if (body.naam !== undefined) {
    const naam = String(body.naam).trim();
    if (!naam || naam.length > 80) return void res.status(400).json({ fout: "Naam is verplicht (max 80 tekens)" });
    patch.naam = naam;
  }
  if (body.heeft_vervaldatum !== undefined) patch.heeftVervaldatum = Boolean(body.heeft_vervaldatum);
  if (body.waarschuwing_dagen !== undefined) {
    patch.waarschuwingDagen = Math.min(Math.max(Math.round(Number(body.waarschuwing_dagen) || 0), 0), 365);
  }

  try {
    const [rij] = await db.update(documentsoortenTable).set(patch)
      .where(eq(documentsoortenTable.id, id)).returning();
    if (!rij) return void res.status(404).json({ fout: "Niet gevonden" });

    const [{ inGebruik }] = await db
      .select({ inGebruik: sql<number>`count(*)` })
      .from(documentenTable)
      .where(and(eq(documentenTable.documentsoortId, id), eq(documentenTable.gearchiveerd, false)));
    res.json(mapSoort(rij, Number(inGebruik)));
  } catch (err: unknown) {
    if (isUniekConflict(err)) {
      return void res.status(409).json({ fout: "Deze naam bestaat al binnen deze context" });
    }
    throw err;
  }
});

router.delete("/documentsoorten/:id", beheer, async (req, res): Promise<void> => {
  const id = Number(req.params["id"]);
  if (isNaN(id)) return void res.status(400).json({ fout: "Ongeldig ID" });

  const [{ inGebruik }] = await db
    .select({ inGebruik: sql<number>`count(*)` })
    .from(documentenTable)
    .where(and(eq(documentenTable.documentsoortId, id), eq(documentenTable.gearchiveerd, false)));
  if (Number(inGebruik) > 0) {
    return void res.status(409).json({ fout: `Deze soort is nog in gebruik door ${inGebruik} document(en)` });
  }

  const rijen = await db.delete(documentsoortenTable).where(eq(documentsoortenTable.id, id)).returning({ id: documentsoortenTable.id });
  if (rijen.length === 0) return void res.status(404).json({ fout: "Niet gevonden" });
  res.status(204).end();
});

export default router;
