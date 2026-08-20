/**
 * TAAK_1167 — Verificatie productrapport-inventaris (strikt read-only dry-run)
 *
 * Wat doet dit script:
 *  1. Controleert of alle documenten een inventaris-snapshot hebben.
 *  2. Vergelijkt de snapshot-waarden met de huidige documentrij (hash, pdf_url, groep, revisie).
 *  3. Signaleert ambigue/dubbele classificaties per document.
 *  4. Controleert of alle "geldige productrapporten" ook als classificatie='productrapport'
 *     zijn geclassificeerd (niet minder streng dan de SQL-definitie).
 *  5. Schrijft een deterministisch gesorteerde JSON-samenvatting naar stdout.
 *  6. Sluit af met exit 1 zodra één van bovenstaande controles een afwijking vindt.
 *
 * GEEN database-writes. GEEN zijeffecten.
 */
import { db, documentenTable, documentMigratieInventarisTable, documentToepassingenTable, labelsTable, labelApplicatiesTable, voorzieningTypesTable } from "@workspace/db";
import { eq, sql, and, inArray } from "drizzle-orm";

type ProbleemSoort =
  | "ontbrekende_snapshot"
  | "veranderde_hash"
  | "veranderde_pdf_url"
  | "veranderde_groep"
  | "veranderde_revisie"
  | "dubbele_status"
  | "productrapport_niet_geclassificeerd";

interface Probleem {
  soort: ProbleemSoort;
  documentId: number;
  detail: string;
}

interface Samenvatting {
  uitgevoerdOp: string;
  totaalDocumenten: number;
  totaalMetSnapshot: number;
  ontbrekendSnapshots: number;
  aantalProductrapporten: number;
  aantalGerichte: number;
  aantalHerstelwerk: number;
  problemen: Probleem[];
  status: "ok" | "afwijkingen_gevonden";
}

// Allowlist productrapporten (identiek aan migratie-SQL)
const PRODUCTRAPPORT_ALLOWLIST = [
  "eta",
  "classificatierapport",
  "testrapport",
  "productcertificaat",
  "dop",
  "verwerkingsvoorschrift",
  "productblad",
] as const;

async function main(): Promise<void> {
  const problemen: Probleem[] = [];

  // ── 1. Alle documenten ophalen ──────────────────────────────────────────────
  const alleDocumenten = await db
    .select({
      id: documentenTable.id,
      pdfUrl: documentenTable.pdfUrl,
      bestandsHash: documentenTable.bestandsHash,
      groepId: documentenTable.groepId,
      revisieNummer: documentenTable.revisieNummer,
      documenttype: documentenTable.documenttype,
      gearchiveerd: documentenTable.gearchiveerd,
      status: documentenTable.status,
    })
    .from(documentenTable)
    .orderBy(documentenTable.id);

  // ── 2. Alle inventory-snapshots ophalen ────────────────────────────────────
  const alleSnapshots = await db
    .select({
      documentId: documentMigratieInventarisTable.documentId,
      snapPdfUrl: documentMigratieInventarisTable.snapPdfUrl,
      snapBestandsHash: documentMigratieInventarisTable.snapBestandsHash,
      snapGroepId: documentMigratieInventarisTable.snapGroepId,
      snapRevisieNummer: documentMigratieInventarisTable.snapRevisieNummer,
      snapDocumenttype: documentMigratieInventarisTable.snapDocumenttype,
      classificatie: documentMigratieInventarisTable.classificatie,
      status: documentMigratieInventarisTable.status,
    })
    .from(documentMigratieInventarisTable)
    .orderBy(documentMigratieInventarisTable.documentId);

  const snapshotMap = new Map(alleSnapshots.map((s) => [s.documentId, s]));

  // ── 3. Controleer ontbrekende snapshots en snapshot-afwijkingen ────────────
  for (const doc of alleDocumenten) {
    const snap = snapshotMap.get(doc.id);
    if (!snap) {
      problemen.push({
        soort: "ontbrekende_snapshot",
        documentId: doc.id,
        detail: `Document ${doc.id} (type=${doc.documenttype}) heeft geen inventaris-snapshot`,
      });
      continue;
    }

    if (snap.snapBestandsHash !== doc.bestandsHash) {
      problemen.push({
        soort: "veranderde_hash",
        documentId: doc.id,
        detail: `bestands_hash veranderd: snapshot="${snap.snapBestandsHash}" huidig="${doc.bestandsHash}"`,
      });
    }
    if (snap.snapPdfUrl !== doc.pdfUrl) {
      problemen.push({
        soort: "veranderde_pdf_url",
        documentId: doc.id,
        detail: `pdf_url veranderd: snapshot="${snap.snapPdfUrl}" huidig="${doc.pdfUrl}"`,
      });
    }
    if (snap.snapGroepId !== doc.groepId) {
      problemen.push({
        soort: "veranderde_groep",
        documentId: doc.id,
        detail: `groep_id veranderd: snapshot="${snap.snapGroepId}" huidig="${doc.groepId}"`,
      });
    }
    if (snap.snapRevisieNummer !== doc.revisieNummer) {
      problemen.push({
        soort: "veranderde_revisie",
        documentId: doc.id,
        detail: `revisie_nummer veranderd: snapshot=${snap.snapRevisieNummer} huidig=${doc.revisieNummer}`,
      });
    }
  }

  // ── 4. Controleer op dubbele/ambigue classificaties per document_id ────────
  // (zou niet voor mogen komen door UNIQUE constraint, maar verifieer defensief)
  const dubbeleTelling = await db
    .select({
      documentId: documentMigratieInventarisTable.documentId,
      aantal: sql<number>`count(*)::int`,
    })
    .from(documentMigratieInventarisTable)
    .groupBy(documentMigratieInventarisTable.documentId)
    .having(sql`count(*) > 1`);

  for (const dup of dubbeleTelling) {
    problemen.push({
      soort: "dubbele_status",
      documentId: dup.documentId,
      detail: `Document ${dup.documentId} heeft ${dup.aantal} inventaris-rijen (verwacht: 1)`,
    });
  }

  // ── 5. Geldige productrapporten die NIET als productrapport zijn geclassificeerd ──
  // Herbouw de definitie-query uit de migratie-SQL (read-only subquery).
  const geldigeProducrapportIds = await db
    .selectDistinct({ documentId: documentenTable.id })
    .from(documentenTable)
    .innerJoin(
      documentToepassingenTable,
      eq(documentToepassingenTable.documentId, documentenTable.id),
    )
    .innerJoin(
      labelsTable,
      and(
        eq(labelsTable.id, documentToepassingenTable.labelId),
        eq(labelsTable.gearchiveerd, false),
      ),
    )
    .innerJoin(
      labelApplicatiesTable,
      eq(labelApplicatiesTable.labelId, labelsTable.id),
    )
    .innerJoin(
      voorzieningTypesTable,
      and(
        eq(voorzieningTypesTable.code, labelApplicatiesTable.typeCode),
        eq(voorzieningTypesTable.actief, true),
      ),
    )
    .where(
      and(
        inArray(documentenTable.documenttype, [...PRODUCTRAPPORT_ALLOWLIST]),
        eq(documentenTable.gearchiveerd, false),
        eq(documentenTable.status, "actueel"),
      ),
    );

  const geldigeIds = new Set(geldigeProducrapportIds.map((r) => r.documentId));

  for (const docId of geldigeIds) {
    const snap = snapshotMap.get(docId);
    if (!snap) {
      // Wordt al gerapporteerd als ontbrekende_snapshot
      continue;
    }
    if (snap.classificatie !== "productrapport") {
      problemen.push({
        soort: "productrapport_niet_geclassificeerd",
        documentId: docId,
        detail: `Geldig productrapport is geclassificeerd als "${snap.classificatie}" in plaats van "productrapport"`,
      });
    }
  }

  // ── 6. Tellingen per classificatie ─────────────────────────────────────────
  const classificatieTelling = await db
    .select({
      classificatie: documentMigratieInventarisTable.classificatie,
      aantal: sql<number>`count(*)::int`,
    })
    .from(documentMigratieInventarisTable)
    .groupBy(documentMigratieInventarisTable.classificatie)
    .orderBy(documentMigratieInventarisTable.classificatie);

  const telMap = new Map(classificatieTelling.map((r) => [r.classificatie, r.aantal]));

  // ── 7. Samenvatting opbouwen en uitvoeren (deterministisch gesorteerd) ─────
  const samenvatting: Samenvatting = {
    uitgevoerdOp: new Date().toISOString(),
    totaalDocumenten: alleDocumenten.length,
    totaalMetSnapshot: alleSnapshots.length,
    ontbrekendSnapshots: alleDocumenten.length - alleSnapshots.length,
    aantalProductrapporten: telMap.get("productrapport") ?? 0,
    aantalGerichte: telMap.get("gerichte_bestemming") ?? 0,
    aantalHerstelwerk: telMap.get("herstelwerk") ?? 0,
    problemen: problemen.sort((a, b) =>
      a.soort.localeCompare(b.soort) || a.documentId - b.documentId,
    ),
    status: problemen.length === 0 ? "ok" : "afwijkingen_gevonden",
  };

  process.stdout.write(JSON.stringify(samenvatting, null, 2) + "\n");

  if (samenvatting.problemen.length > 0) {
    process.stderr.write(
      `\n✗ verificatie-productrapport-inventaris: ${samenvatting.problemen.length} probleem/problemen gevonden\n`,
    );
    process.exitCode = 1;
  } else {
    process.stderr.write(
      `\n✓ verificatie-productrapport-inventaris: alles in orde` +
        ` (${samenvatting.totaalMetSnapshot} snapshots, ` +
        `${samenvatting.aantalProductrapporten} productrapporten, ` +
        `${samenvatting.aantalGerichte} gerichte, ` +
        `${samenvatting.aantalHerstelwerk} herstelwerk)\n`,
    );
  }
}

await main();
