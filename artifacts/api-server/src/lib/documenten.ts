import {
  db,
  documentenTable,
  documentToepassingenTable,
  documentApplicatiesTable,
  labelsTable,
  voorzieningTypesTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

export const DOCUMENT_TYPES = [
  "eta",
  "classificatierapport",
  "testrapport",
  "productcertificaat",
  "dop",
  "verwerkingsvoorschrift",
] as const;

export const DOCUMENT_STATUSSEN = [
  "actueel",
  "controle_nodig",
  "vervangen",
  "mogelijk_verouderd",
  "ingetrokken",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];
export type DocumentStatus = (typeof DOCUMENT_STATUSSEN)[number];

export function isDocumentType(v: unknown): v is DocumentType {
  return typeof v === "string" && (DOCUMENT_TYPES as readonly string[]).includes(v);
}
export function isDocumentStatus(v: unknown): v is DocumentStatus {
  return typeof v === "string" && (DOCUMENT_STATUSSEN as readonly string[]).includes(v);
}

export const GETEST_VOOR_WAARDEN = ["wand", "plafond", "beide"] as const;
export type GetestVoor = (typeof GETEST_VOOR_WAARDEN)[number];

export function isGetestVoor(v: unknown): v is GetestVoor {
  return typeof v === "string" && (GETEST_VOOR_WAARDEN as readonly string[]).includes(v);
}

type DocumentRow = typeof documentenTable.$inferSelect;

// Scalaire velden van een document-rij naar het snake_case API-antwoord.
function mapDocumentScalars(d: DocumentRow) {
  return {
    id: d.id,
    naam: d.naam,
    documenttype: d.documenttype,
    fabrikant: d.fabrikant,
    product: d.product,
    en_norm: d.enNorm,
    rapportnummer: d.rapportnummer,
    revisie: d.revisie,
    datum: d.datum,
    getest_voor: d.getestVoor,
    pdf_url: d.pdfUrl,
    status: d.status,
    groep_id: d.groepId,
    revisie_nummer: d.revisieNummer,
    ai_geanalyseerd: d.aiGeanalyseerd,
    ai_metadata: d.aiMetadata ?? null,
    gearchiveerd: d.gearchiveerd,
    aangemaakt_op: d.aangemaaktOp.toISOString(),
    bijgewerkt_op: d.bijgewerktOp.toISOString(),
  };
}

// Zet meerdere document-rijen in één keer om, inclusief koppelingen, met twee
// gebundelde queries i.p.v. twee per rij (voorkomt N+1 bij lijst en revisiehistorie).
export async function mapDocumenten(rows: DocumentRow[]) {
  if (rows.length === 0) return [];
  const ids = rows.map((d) => d.id);
  const [toepRijen, applRijen] = await Promise.all([
    db
      .select({
        documentId: documentToepassingenTable.documentId,
        labelId: documentToepassingenTable.labelId,
      })
      .from(documentToepassingenTable)
      .where(inArray(documentToepassingenTable.documentId, ids)),
    db
      .select({
        documentId: documentApplicatiesTable.documentId,
        code: documentApplicatiesTable.voorzieningTypeCode,
      })
      .from(documentApplicatiesTable)
      .where(inArray(documentApplicatiesTable.documentId, ids)),
  ]);
  const toepPer = new Map<number, number[]>();
  for (const r of toepRijen) {
    const lijst = toepPer.get(r.documentId) ?? [];
    lijst.push(r.labelId);
    toepPer.set(r.documentId, lijst);
  }
  const applPer = new Map<number, string[]>();
  for (const r of applRijen) {
    const lijst = applPer.get(r.documentId) ?? [];
    lijst.push(r.code);
    applPer.set(r.documentId, lijst);
  }
  return rows.map((d) => ({
    ...mapDocumentScalars(d),
    toepassing_ids: toepPer.get(d.id) ?? [],
    applicatie_codes: applPer.get(d.id) ?? [],
  }));
}

// Zet één document-rij om naar het snake_case API-antwoord, inclusief koppelingen.
export async function mapDocument(d: DocumentRow) {
  return (await mapDocumenten([d]))[0];
}

// Vervangt de toepassing-koppelingen (labels) van een document door de opgegeven set.
export async function syncDocumentToepassingen(documentId: number, labelIds: number[]) {
  const schoon = Array.from(new Set(labelIds.filter((n) => Number.isInteger(n) && n > 0)));
  await db
    .delete(documentToepassingenTable)
    .where(eq(documentToepassingenTable.documentId, documentId));
  if (schoon.length === 0) return;
  const bestaande = await db
    .select({ id: labelsTable.id })
    .from(labelsTable)
    .where(inArray(labelsTable.id, schoon));
  const geldig = bestaande.map((b) => b.id);
  if (geldig.length === 0) return;
  await db
    .insert(documentToepassingenTable)
    .values(geldig.map((labelId) => ({ documentId, labelId })))
    .onConflictDoNothing();
}

// Vervangt de applicatie-koppelingen (voorziening-types) van een document door de opgegeven set.
export async function syncDocumentApplicaties(documentId: number, codes: string[]) {
  const schoon = Array.from(
    new Set(codes.filter((c) => typeof c === "string" && c.trim().length > 0)),
  );
  await db
    .delete(documentApplicatiesTable)
    .where(eq(documentApplicatiesTable.documentId, documentId));
  if (schoon.length === 0) return;
  const bestaande = await db
    .select({ code: voorzieningTypesTable.code })
    .from(voorzieningTypesTable)
    .where(inArray(voorzieningTypesTable.code, schoon));
  const geldig = bestaande.map((b) => b.code);
  if (geldig.length === 0) return;
  await db
    .insert(documentApplicatiesTable)
    .values(geldig.map((voorzieningTypeCode) => ({ documentId, voorzieningTypeCode })))
    .onConflictDoNothing();
}
