import { db, testrapportenTable, labelsTable, voorzieningLabelsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

export function mapTestrapport(t: typeof testrapportenTable.$inferSelect) {
  return {
    id: t.id,
    naam: t.naam,
    fabrikant: t.fabrikant,
    norm: t.norm,
    rapportnummer: t.rapportnummer,
    pdf_url: t.pdfUrl,
    gearchiveerd: t.gearchiveerd,
    aangemaakt_op: t.aangemaaktOp.toISOString(),
    bijgewerkt_op: t.bijgewerktOp.toISOString(),
  };
}

export async function mapLabel(l: typeof labelsTable.$inferSelect) {
  let testrapport = null;
  if (l.testrapportId != null) {
    const [t] = await db
      .select()
      .from(testrapportenTable)
      .where(eq(testrapportenTable.id, l.testrapportId));
    testrapport = t ? mapTestrapport(t) : null;
  }
  return {
    id: l.id,
    type_code: l.typeCode,
    naam: l.naam,
    testrapport_id: l.testrapportId,
    testrapport,
    gearchiveerd: l.gearchiveerd,
    aangemaakt_op: l.aangemaaktOp.toISOString(),
    bijgewerkt_op: l.bijgewerktOp.toISOString(),
  };
}

// Alle (gekoppelde) toepassingen van een voorziening, inclusief testrapport.
export async function getLabelsVoorVoorziening(voorzieningId: number) {
  const koppelingen = await db
    .select({ labelId: voorzieningLabelsTable.labelId })
    .from(voorzieningLabelsTable)
    .where(eq(voorzieningLabelsTable.voorzieningId, voorzieningId));
  const ids = koppelingen.map((k) => k.labelId);
  if (ids.length === 0) return [];
  const rows = await db.select().from(labelsTable).where(inArray(labelsTable.id, ids));
  return Promise.all(rows.map(mapLabel));
}

// Vervangt de label-koppelingen van een voorziening door de opgegeven set.
// Onbekende of niet-bestaande label-ids worden genegeerd.
export async function syncVoorzieningLabels(voorzieningId: number, labelIds: number[]) {
  const schoon = Array.from(
    new Set(labelIds.filter((n) => Number.isInteger(n) && n > 0)),
  );
  await db
    .delete(voorzieningLabelsTable)
    .where(eq(voorzieningLabelsTable.voorzieningId, voorzieningId));
  if (schoon.length === 0) return;
  // Alleen bestaande labels koppelen.
  const bestaande = await db
    .select({ id: labelsTable.id })
    .from(labelsTable)
    .where(inArray(labelsTable.id, schoon));
  const geldig = bestaande.map((b) => b.id);
  if (geldig.length === 0) return;
  await db
    .insert(voorzieningLabelsTable)
    .values(geldig.map((labelId) => ({ voorzieningId, labelId })))
    .onConflictDoNothing();
}
