import {
  db,
  testrapportenTable,
  labelsTable,
  voorzieningLabelsTable,
  documentenTable,
  documentToepassingenTable,
  labelApplicatiesTable,
  voorzieningTypesTable,
  fabrikantenTable,
} from "@workspace/db";
import { eq, inArray, and, sql } from "drizzle-orm";

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

// Een document (documenttype 'testrapport') in het testrapport-antwoordformaat,
// zodat de monteur-app en het spotformulier het ingebedde testrapport blijven herkennen.
function documentNaarTestrapport(d: typeof documentenTable.$inferSelect) {
  return {
    id: d.id,
    naam: d.naam,
    fabrikant: d.fabrikant,
    norm: d.enNorm,
    rapportnummer: d.rapportnummer,
    pdf_url: d.pdfUrl,
    gearchiveerd: d.gearchiveerd,
    aangemaakt_op: d.aangemaaktOp.toISOString(),
    bijgewerkt_op: d.bijgewerktOp.toISOString(),
  };
}

export async function mapLabel(l: typeof labelsTable.$inferSelect) {
  let testrapport = null;
  // 1) Afleiden uit de centrale documentbibliotheek (gekoppeld document, type 'testrapport').
  const docs = await db
    .select()
    .from(documentenTable)
    .innerJoin(
      documentToepassingenTable,
      eq(documentToepassingenTable.documentId, documentenTable.id),
    )
    .where(
      and(
        eq(documentToepassingenTable.labelId, l.id),
        eq(documentenTable.documenttype, "testrapport"),
      ),
    );
  if (docs.length > 0) {
    const rijen = docs.map((r) => r.documenten);
    const gekozen =
      rijen.find((d) => d.status === "actueel") ??
      [...rijen].sort((a, b) => b.revisieNummer - a.revisieNummer)[0];
    testrapport = documentNaarTestrapport(gekozen);
  } else if (l.testrapportId != null) {
    // 2) Fallback op de legacy koppeling.
    const [t] = await db
      .select()
      .from(testrapportenTable)
      .where(eq(testrapportenTable.id, l.testrapportId));
    testrapport = t ? mapTestrapport(t) : null;
  }
  // Applicatie-koppelingen via junction (M:N).
  const applRijen = await db
    .select({ typeCode: labelApplicatiesTable.typeCode })
    .from(labelApplicatiesTable)
    .where(eq(labelApplicatiesTable.labelId, l.id));
  // Website van de leverancier: voorkeur voor de gekoppelde fabrikant (FK),
  // anders een hoofdletterongevoelige naam-match op de fabrikantentabel.
  let fabrikantUrl: string | null = null;
  if (l.fabrikantId != null) {
    const [f] = await db
      .select({ url: fabrikantenTable.url })
      .from(fabrikantenTable)
      .where(eq(fabrikantenTable.id, l.fabrikantId));
    fabrikantUrl = f?.url ?? null;
  }
  if (fabrikantUrl == null && l.fabrikant != null && l.fabrikant.trim() !== "") {
    const [f] = await db
      .select({ url: fabrikantenTable.url })
      .from(fabrikantenTable)
      .where(sql`lower(${fabrikantenTable.naam}) = lower(${l.fabrikant.trim()})`);
    fabrikantUrl = f?.url ?? null;
  }
  return {
    id: l.id,
    type_code: l.typeCode,
    naam: l.naam,
    fabrikant: l.fabrikant,
    fabrikant_id: l.fabrikantId,
    fabrikant_url: fabrikantUrl,
    testnorm: l.testnorm,
    testrapport_id: l.testrapportId,
    testrapport,
    gearchiveerd: l.gearchiveerd,
    aangemaakt_op: l.aangemaaktOp.toISOString(),
    bijgewerkt_op: l.bijgewerktOp.toISOString(),
    applicatie_codes: applRijen.map((r) => r.typeCode),
  };
}

// Resultaat van het bepalen van de fabrikant-koppeling voor een toepassing:
// fabrikantId = bron van waarheid (FK), fabrikant = gedenormaliseerde naam.
export interface FabrikantResultaat {
  fabrikantId: number | null;
  fabrikant: string | null;
}

// Bepaalt de fabrikant-koppeling op basis van de request-body. Voorkeur voor een
// expliciete fabrikant_id (keuze uit de beheerde lijst). Wanneer alleen vrije tekst
// is meegegeven (bv. Excel-import) wordt geprobeerd die te matchen op naam; lukt dat
// niet, dan blijft het als losse tekst staan zonder koppeling.
export async function bepaalFabrikant(
  fabrikantId: unknown,
  fabrikantTekst: unknown,
): Promise<FabrikantResultaat> {
  if (fabrikantId != null && Number.isInteger(Number(fabrikantId))) {
    const id = Number(fabrikantId);
    const [f] = await db
      .select({ id: fabrikantenTable.id, naam: fabrikantenTable.naam })
      .from(fabrikantenTable)
      .where(eq(fabrikantenTable.id, id));
    if (f) return { fabrikantId: f.id, fabrikant: f.naam };
    return { fabrikantId: null, fabrikant: null };
  }
  const tekst = fabrikantTekst != null && String(fabrikantTekst).trim() ? String(fabrikantTekst).trim() : null;
  if (tekst == null) return { fabrikantId: null, fabrikant: null };
  // Match op naam (case-insensitief) tegen de beheerde lijst.
  const [f] = await db
    .select({ id: fabrikantenTable.id, naam: fabrikantenTable.naam })
    .from(fabrikantenTable)
    .where(sql`lower(${fabrikantenTable.naam}) = lower(${tekst})`);
  if (f) return { fabrikantId: f.id, fabrikant: f.naam };
  return { fabrikantId: null, fabrikant: tekst };
}

// Werkt de gedenormaliseerde fabrikant-naam bij voor alle toepassingen die aan de
// opgegeven fabrikant gekoppeld zijn. Zo werkt hernoemen door naar de toepassingen.
export async function herbenoemFabrikantOpToepassingen(fabrikantId: number, naam: string) {
  await db
    .update(labelsTable)
    .set({ fabrikant: naam, bijgewerktOp: new Date() })
    .where(eq(labelsTable.fabrikantId, fabrikantId));
}

// Geeft de opgegeven applicatie-codes terug die NIET in de catalogus bestaan.
export async function onbekendeApplicatieCodes(codes: unknown[]): Promise<string[]> {
  const schoon = Array.from(
    new Set(
      codes.map((c) => String(c ?? "").trim()).filter((c) => c.length > 0),
    ),
  );
  if (schoon.length === 0) return [];
  const bestaande = await db
    .select({ code: voorzieningTypesTable.code })
    .from(voorzieningTypesTable)
    .where(inArray(voorzieningTypesTable.code, schoon));
  const set = new Set(bestaande.map((b) => b.code));
  return schoon.filter((c) => !set.has(c));
}

// Vervangt de applicatie-koppelingen van een toepassing door de opgegeven set.
export async function syncLabelApplicaties(labelId: number, codes: string[]) {
  const schoon = Array.from(new Set(codes.filter((c) => typeof c === "string" && c.trim().length > 0)));
  await db.delete(labelApplicatiesTable).where(eq(labelApplicatiesTable.labelId, labelId));
  if (schoon.length === 0) return;
  const bestaande = await db
    .select({ code: voorzieningTypesTable.code })
    .from(voorzieningTypesTable)
    .where(inArray(voorzieningTypesTable.code, schoon));
  const geldig = bestaande.map((b) => b.code);
  if (geldig.length === 0) return;
  await db
    .insert(labelApplicatiesTable)
    .values(geldig.map((typeCode) => ({ labelId, typeCode })))
    .onConflictDoNothing();
}

// Vervangt de document-koppelingen van een toepassing (label) door de opgegeven set.
// Verwijdert alleen de rijen van DEZE toepassing, zodat koppelingen van andere
// toepassingen aan hetzelfde document ongemoeid blijven. Onbekende document-ids
// worden genegeerd.
export async function syncLabelDocumenten(labelId: number, documentIds: number[]) {
  const schoon = Array.from(
    new Set(documentIds.filter((n) => Number.isInteger(n) && n > 0)),
  );
  await db
    .delete(documentToepassingenTable)
    .where(eq(documentToepassingenTable.labelId, labelId));
  if (schoon.length === 0) return;
  const bestaande = await db
    .select({ id: documentenTable.id })
    .from(documentenTable)
    .where(inArray(documentenTable.id, schoon));
  const geldig = bestaande.map((b) => b.id);
  if (geldig.length === 0) return;
  await db
    .insert(documentToepassingenTable)
    .values(geldig.map((documentId) => ({ documentId, labelId })))
    .onConflictDoNothing();
}

// Vervangt de toepassing-koppelingen van een applicatie (voorziening-type) door
// de opgegeven set. Verwijdert alleen de rijen van DEZE applicatie-code, zodat
// koppelingen van toepassingen aan andere applicaties ongemoeid blijven.
// Onbekende of niet-bestaande label-ids worden genegeerd.
export async function syncApplicatieLabels(typeCode: string, labelIds: number[]) {
  const schoon = Array.from(
    new Set(labelIds.filter((n) => Number.isInteger(n) && n > 0)),
  );
  await db.delete(labelApplicatiesTable).where(eq(labelApplicatiesTable.typeCode, typeCode));
  if (schoon.length === 0) return;
  const bestaande = await db
    .select({ id: labelsTable.id })
    .from(labelsTable)
    .where(inArray(labelsTable.id, schoon));
  const geldig = bestaande.map((b) => b.id);
  if (geldig.length === 0) return;
  await db
    .insert(labelApplicatiesTable)
    .values(geldig.map((labelId) => ({ labelId, typeCode })))
    .onConflictDoNothing();
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
