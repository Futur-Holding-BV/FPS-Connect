// Werkdag-module — /api/modules/werkdag/*
// Centrale uitvoeringswerkplek voor monteurs/timmermannen/zzp/uitzendkrachten.
// Toont alleen de werkorders (planning_items) van vandaag voor de ingelogde medewerker.

import { Router } from "express";
import {
  db,
  planningItemsTable,
  medewerkersTable,
  gebouwenTable,
  planningMeerwerkTable,
} from "@workspace/db";
import { eq, and, lte, gte, asc } from "drizzle-orm";
import { sql } from "drizzle-orm";

const router = Router();

function vandaagIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function getMedewerkerId(gebruikerId: number): Promise<number | null> {
  const [m] = await db
    .select({ id: medewerkersTable.id })
    .from(medewerkersTable)
    .where(eq(medewerkersTable.gebruikerId, gebruikerId))
    .limit(1);
  return m?.id ?? null;
}

function mapWerkdagItem(
  item: typeof planningItemsTable.$inferSelect,
  medewerkNaam: string | null,
  gebouwNaam: string | null,
  meerwerk?: Array<{ id: number; meerwerkNummer: string | null; omschrijving: string | null; status: string }>,
) {
  return {
    id: item.id,
    titel: item.titel,
    omschrijving: item.omschrijving ?? null,
    medewerker_id: item.medewerkerId ?? null,
    medewerker_naam: medewerkNaam ?? null,
    gebouw_id: item.gebouwId ?? null,
    gebouw_naam: gebouwNaam ?? null,
    project_naam: item.projectNaam ?? null,
    datum_start: item.datumStart,
    datum_eind: item.datumEind,
    tijd_start: item.tijdStart ?? null,
    tijd_eind: item.tijdEind ?? null,
    uren: item.uren,
    status: item.status,
    uitvoering_status: item.uitvoeringStatus,
    type: item.type,
    opdracht_type: item.opdrachtType ?? null,
    locaties: item.locaties ?? null,
    werknummer: item.werknummer ?? null,
    notities: item.notities ?? null,
    dag_notities: item.dagNotities ?? null,
    aangemaakt_op: item.aangemaaktOp.toISOString(),
    meerwerk: meerwerk ?? [],
  };
}

// ── GET /modules/werkdag/vandaag ──────────────────────────────────────────────
// Alle werkorders van vandaag voor de ingelogde medewerker, gesorteerd op starttijd.
router.get("/modules/werkdag/vandaag", async (req, res) => {
  const userId = req.session.userId!;
  const medewerkerId = await getMedewerkerId(userId);
  if (!medewerkerId) {
    res.json([]);
    return;
  }

  const vandaag = vandaagIso();
  const rows = await db
    .select({
      item: planningItemsTable,
      medewerkNaam: medewerkersTable.naam,
      gebouwNaam: gebouwenTable.naam,
    })
    .from(planningItemsTable)
    .leftJoin(medewerkersTable, eq(planningItemsTable.medewerkerId, medewerkersTable.id))
    .leftJoin(gebouwenTable, eq(planningItemsTable.gebouwId, gebouwenTable.id))
    .where(
      and(
        eq(planningItemsTable.medewerkerId, medewerkerId),
        lte(planningItemsTable.datumStart, vandaag),
        gte(planningItemsTable.datumEind, vandaag),
      ),
    )
    .orderBy(asc(planningItemsTable.tijdStart));

  res.json(rows.map((r) => mapWerkdagItem(r.item, r.medewerkNaam ?? null, r.gebouwNaam ?? null)));
});

// ── GET /modules/werkdag/items/:id ────────────────────────────────────────────
// Volledig detail van één werkorder inclusief gekoppeld meerwerk.
router.get("/modules/werkdag/items/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const userId = req.session.userId!;
  const medewerkerId = await getMedewerkerId(userId);
  const hoofdbeheerder = req.session.rol === "hoofdbeheerder";

  const [row] = await db
    .select({
      item: planningItemsTable,
      medewerkNaam: medewerkersTable.naam,
      gebouwNaam: gebouwenTable.naam,
    })
    .from(planningItemsTable)
    .leftJoin(medewerkersTable, eq(planningItemsTable.medewerkerId, medewerkersTable.id))
    .leftJoin(gebouwenTable, eq(planningItemsTable.gebouwId, gebouwenTable.id))
    .where(eq(planningItemsTable.id, id))
    .limit(1);

  if (!row) {
    res.status(404).json({ error: "Werkorder niet gevonden" });
    return;
  }

  if (!hoofdbeheerder && row.item.medewerkerId !== medewerkerId) {
    res.status(403).json({ error: "Geen toegang tot deze werkorder" });
    return;
  }

  const meerwerk = await db
    .select()
    .from(planningMeerwerkTable)
    .where(eq(planningMeerwerkTable.planningItemId, id));

  res.json(mapWerkdagItem(
    row.item,
    row.medewerkNaam ?? null,
    row.gebouwNaam ?? null,
    meerwerk.map((m) => ({
      id: m.id,
      meerwerkNummer: m.meerwerkNummer ?? null,
      omschrijving: m.omschrijving ?? null,
      status: m.status,
    })),
  ));
});

// ── PATCH /modules/werkdag/items/:id/status ───────────────────────────────────
// Wijzig de uitvoeringsstatus van een werkorder.
// Toegestane waarden: gepland | bezig | pauze | gereed
router.patch("/modules/werkdag/items/:id/status", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { uitvoering_status } = req.body as { uitvoering_status?: string };
  const GELDIG: string[] = ["gepland", "bezig", "pauze", "gereed"];

  if (!uitvoering_status || !GELDIG.includes(uitvoering_status)) {
    res.status(422).json({ error: `Ongeldige status. Kies uit: ${GELDIG.join(", ")}` });
    return;
  }

  const userId = req.session.userId!;
  const medewerkerId = await getMedewerkerId(userId);
  const hoofdbeheerder = req.session.rol === "hoofdbeheerder";

  const [existing] = await db
    .select({ medewerkerId: planningItemsTable.medewerkerId })
    .from(planningItemsTable)
    .where(eq(planningItemsTable.id, id))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Werkorder niet gevonden" });
    return;
  }

  if (!hoofdbeheerder && existing.medewerkerId !== medewerkerId) {
    res.status(403).json({ error: "Geen toegang tot deze werkorder" });
    return;
  }

  await db
    .update(planningItemsTable)
    .set({ uitvoeringStatus: uitvoering_status, bijgewerktOp: new Date() })
    .where(eq(planningItemsTable.id, id));

  const [row] = await db
    .select({
      item: planningItemsTable,
      medewerkNaam: medewerkersTable.naam,
      gebouwNaam: gebouwenTable.naam,
    })
    .from(planningItemsTable)
    .leftJoin(medewerkersTable, eq(planningItemsTable.medewerkerId, medewerkersTable.id))
    .leftJoin(gebouwenTable, eq(planningItemsTable.gebouwId, gebouwenTable.id))
    .where(eq(planningItemsTable.id, id))
    .limit(1);

  res.json(mapWerkdagItem(row.item, row.medewerkNaam ?? null, row.gebouwNaam ?? null));
});

export default router;
