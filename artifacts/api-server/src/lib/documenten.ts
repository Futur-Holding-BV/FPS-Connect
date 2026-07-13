import {
  db,
  documentenTable,
  documentToepassingenTable,
  documentKoppelingenTable,
  documentGoedkeuringenTable,
  documentLogboekTable,
  labelsTable,
  gebruikersTable,
  gebouwenTable,
  crmKlantenTable,
  offertesTable,
  dossiersTable,
  voorzieningenTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

export const DOCUMENT_TYPES = [
  "eta",
  "classificatierapport",
  "testrapport",
  "productcertificaat",
  "dop",
  "verwerkingsvoorschrift",
  "productblad",
  "opleverrapport",
  // Algemene bedrijfsdocumenten (Slim Upload levert direct aan de bibliotheek):
  "tekening",
  "contract",
  "verzekering",
  "overig",
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

export const GOEDKEURING_STATUSSEN = [
  "concept",
  "ter_goedkeuring",
  "goedgekeurd",
  "afgekeurd",
] as const;
export type GoedkeuringStatus = (typeof GOEDKEURING_STATUSSEN)[number];
export function isGoedkeuringStatus(v: unknown): v is GoedkeuringStatus {
  return typeof v === "string" && (GOEDKEURING_STATUSSEN as readonly string[]).includes(v);
}

export const KOPPELING_DOEL_TYPES = [
  "gebouw",
  "klant",
  "offerte",
  "dossier",
  "voorziening",
] as const;
export type KoppelingDoelType = (typeof KOPPELING_DOEL_TYPES)[number];
export function isKoppelingDoelType(v: unknown): v is KoppelingDoelType {
  return typeof v === "string" && (KOPPELING_DOEL_TYPES as readonly string[]).includes(v);
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
    bestands_hash: d.bestandsHash ?? null,
    bestandsgrootte: d.bestandsgrootte ?? null,
    geldig_tot: d.geldigTot ?? null,
    goedkeuring_status: d.goedkeuringStatus,
    ai_geanalyseerd: d.aiGeanalyseerd,
    ai_metadata: d.aiMetadata ?? null,
    gearchiveerd: d.gearchiveerd,
    aangemaakt_op: d.aangemaaktOp.toISOString(),
    bijgewerkt_op: d.bijgewerktOp.toISOString(),
  };
}

// Zet meerdere document-rijen in één keer om, inclusief koppelingen, met één
// gebundelde query i.p.v. één per rij (voorkomt N+1 bij lijst en revisiehistorie).
export async function mapDocumenten(rows: DocumentRow[]) {
  if (rows.length === 0) return [];
  const ids = rows.map((d) => d.id);
  const toepRijen = await db
    .select({
      documentId: documentToepassingenTable.documentId,
      labelId: documentToepassingenTable.labelId,
    })
    .from(documentToepassingenTable)
    .where(inArray(documentToepassingenTable.documentId, ids));
  const toepPer = new Map<number, number[]>();
  for (const r of toepRijen) {
    const lijst = toepPer.get(r.documentId) ?? [];
    lijst.push(r.labelId);
    toepPer.set(r.documentId, lijst);
  }
  return rows.map((d) => ({
    ...mapDocumentScalars(d),
    toepassing_ids: toepPer.get(d.id) ?? [],
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

// ── Polymorfe koppelingen (document ↔ entiteit) ─────────────────────────────
type DoelRef = { doelType: string; doelId: number };

// Resolvet leesbare namen voor doel-entiteiten in bulk, per type gegroepeerd.
// Orphan-tolerant: ontbrekende of onbekende doelen leveren simpelweg geen naam op.
export async function resolveDoelNamen(refs: DoelRef[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const perType = new Map<string, number[]>();
  for (const r of refs) {
    const lijst = perType.get(r.doelType) ?? [];
    lijst.push(r.doelId);
    perType.set(r.doelType, lijst);
  }
  for (const [type, idsRaw] of perType) {
    const ids = Array.from(new Set(idsRaw.filter((n) => Number.isInteger(n))));
    if (ids.length === 0) continue;
    try {
      if (type === "gebouw") {
        const rows = await db
          .select({ id: gebouwenTable.id, naam: gebouwenTable.naam })
          .from(gebouwenTable)
          .where(inArray(gebouwenTable.id, ids));
        for (const r of rows) out.set(`gebouw:${r.id}`, r.naam);
      } else if (type === "klant") {
        const rows = await db
          .select({ id: crmKlantenTable.id, naam: crmKlantenTable.naam })
          .from(crmKlantenTable)
          .where(inArray(crmKlantenTable.id, ids));
        for (const r of rows) out.set(`klant:${r.id}`, r.naam);
      } else if (type === "offerte") {
        const rows = await db
          .select({ id: offertesTable.id, naam: offertesTable.titel })
          .from(offertesTable)
          .where(inArray(offertesTable.id, ids));
        for (const r of rows) out.set(`offerte:${r.id}`, r.naam);
      } else if (type === "dossier") {
        const rows = await db
          .select({ id: dossiersTable.id, naam: dossiersTable.naam })
          .from(dossiersTable)
          .where(inArray(dossiersTable.id, ids));
        for (const r of rows) out.set(`dossier:${r.id}`, r.naam);
      } else if (type === "voorziening") {
        const rows = await db
          .select({ id: voorzieningenTable.id, naam: voorzieningenTable.objectnummer })
          .from(voorzieningenTable)
          .where(inArray(voorzieningenTable.id, ids));
        for (const r of rows) out.set(`voorziening:${r.id}`, r.naam);
      }
    } catch {
      // orphan-tolerant: laat namen leeg bij ontbrekende/onbekende doeltabel
    }
  }
  return out;
}

type KoppelingRow = typeof documentKoppelingenTable.$inferSelect;
export async function mapKoppelingen(rows: KoppelingRow[]) {
  if (rows.length === 0) return [];
  const namen = await resolveDoelNamen(rows.map((r) => ({ doelType: r.doelType, doelId: r.doelId })));
  return rows.map((r) => ({
    id: r.id,
    document_id: r.documentId,
    doel_type: r.doelType,
    doel_id: r.doelId,
    doel_naam: namen.get(`${r.doelType}:${r.doelId}`) ?? null,
    aangemaakt_op: r.aangemaaktOp.toISOString(),
  }));
}

// ── Goedkeuringen & logboek mapping ─────────────────────────────────────────
type GoedkeuringRow = typeof documentGoedkeuringenTable.$inferSelect;
export async function mapGoedkeuringen(rows: GoedkeuringRow[]) {
  if (rows.length === 0) return [];
  const ids = Array.from(
    new Set(rows.map((r) => r.doorId).filter((x): x is number => x != null)),
  );
  const namen = new Map<number, string>();
  if (ids.length) {
    const us = await db
      .select({ id: gebruikersTable.id, naam: gebruikersTable.naam })
      .from(gebruikersTable)
      .where(inArray(gebruikersTable.id, ids));
    for (const u of us) namen.set(u.id, u.naam);
  }
  return rows.map((r) => ({
    id: r.id,
    document_id: r.documentId,
    actie: r.actie,
    door_id: r.doorId,
    door_naam: r.doorId != null ? (namen.get(r.doorId) ?? null) : null,
    opmerking: r.opmerking,
    tijdstip: r.tijdstip.toISOString(),
  }));
}

type LogboekRow = typeof documentLogboekTable.$inferSelect;
export function mapLogboekRegel(r: LogboekRow) {
  return {
    id: r.id,
    document_id: r.documentId,
    document_naam: r.documentNaam,
    gebruiker_id: r.gebruikerId,
    gebruiker_naam: r.gebruikerNaam,
    actie: r.actie,
    detail: r.detail,
    tijdstip: r.tijdstip.toISOString(),
  };
}
