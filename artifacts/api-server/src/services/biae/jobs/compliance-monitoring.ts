// BIAE-job — regelgebaseerde compliance-monitoring (dagelijks).
//
// Voert per compliance-regel een read-only detectie uit en schrijft openstaande
// signaleringen naar compliance_signalen (dedup per regel+entiteit). Elke regel
// draait in een eigen try/catch: één falende regel mag de rest nooit blokkeren.
// De job muteert alleen de eigen compliance_signalen-tabel; geen andere data.
import {
  db,
  complianceSignalenTable,
  documentenTable,
  voorzieningenTable,
  documentKoppelingenTable,
  verlofSaldiTable,
} from "@workspace/db";
import { and, eq, lt, sql, isNotNull } from "drizzle-orm";
import { logger } from "../../../lib/logger";

interface Bevinding {
  regel: string;
  ernst: "info" | "waarschuwing" | "kritiek";
  entiteitType: string;
  entiteitId: number | null;
  titel: string;
  omschrijving: string;
  dedupSleutel: string;
}

// Zorgt dat er per dedupSleutel maximaal één open signaal bestaat. Nieuwe
// bevindingen worden ingevoegd; bestaande open signalen blijven staan.
async function upsertSignaal(b: Bevinding): Promise<void> {
  const bestaand = await db
    .select({ id: complianceSignalenTable.id })
    .from(complianceSignalenTable)
    .where(
      and(
        eq(complianceSignalenTable.dedupSleutel, b.dedupSleutel),
        eq(complianceSignalenTable.status, "open"),
      ),
    )
    .limit(1);
  if (bestaand.length > 0) return;

  await db.insert(complianceSignalenTable).values({
    regel: b.regel,
    ernst: b.ernst,
    entiteitType: b.entiteitType,
    entiteitId: b.entiteitId,
    titel: b.titel,
    omschrijving: b.omschrijving,
    dedupSleutel: b.dedupSleutel,
  });
}

// Regel: verlopen certificaten/documenten (geldig_tot in het verleden), niet
// gearchiveerd. Bewust breed over documenttypes; toont welke bewijsstukken
// vervangen moeten worden.
async function regelVerlopenCertificaten(): Promise<number> {
  const rijen = await db
    .select({
      id: documentenTable.id,
      naam: documentenTable.naam,
      geldigTot: documentenTable.geldigTot,
      type: documentenTable.documenttype,
    })
    .from(documentenTable)
    .where(
      and(
        isNotNull(documentenTable.geldigTot),
        lt(documentenTable.geldigTot, sql`current_date`),
        eq(documentenTable.gearchiveerd, false),
      ),
    );
  for (const r of rijen) {
    await upsertSignaal({
      regel: "certificaat_verlopen",
      ernst: "waarschuwing",
      entiteitType: "document",
      entiteitId: r.id,
      titel: `Verlopen document: ${r.naam}`,
      omschrijving: `Document '${r.naam}' (${r.type}) is verlopen op ${r.geldigTot}. Vervang of vernieuw het bewijsstuk.`,
      dedupSleutel: `certificaat_verlopen:${r.id}`,
    });
  }
  return rijen.length;
}

// Regel: actieve spots zonder enig gekoppeld document. Een spot moet aantoonbaar
// onderbouwd zijn; ontbrekend bewijs is een compliance-risico.
async function regelSpotsZonderDocument(): Promise<number> {
  const rijen = await db
    .select({
      id: voorzieningenTable.id,
      objectnummer: voorzieningenTable.objectnummer,
      gebouwId: voorzieningenTable.gebouwId,
    })
    .from(voorzieningenTable)
    .where(
      and(
        eq(voorzieningenTable.gearchiveerd, false),
        sql`not exists (
          select 1 from ${documentKoppelingenTable} dk
          where dk.doel_type = 'voorziening' and dk.doel_id = ${voorzieningenTable.id}
        )`,
      ),
    );
  for (const r of rijen) {
    await upsertSignaal({
      regel: "spot_zonder_document",
      ernst: "info",
      entiteitType: "voorziening",
      entiteitId: r.id,
      titel: `Spot zonder document: ${r.objectnummer ?? r.id}`,
      omschrijving: `Spot '${r.objectnummer ?? r.id}' heeft geen gekoppeld document. Koppel het onderbouwende bewijsstuk.`,
      dedupSleutel: `spot_zonder_document:${r.id}`,
    });
  }
  return rijen.length;
}

// Regel: verlofsaldi buiten grenzen (negatief saldo = meer opgenomen dan
// beschikbaar). Signaleert administratieve of CAO-afwijkingen die correctie
// vereisen.
async function regelVerlofsaldoBuitenCao(): Promise<number> {
  const rijen = await db
    .select({
      id: verlofSaldiTable.id,
      medewerkerId: verlofSaldiTable.medewerkerId,
      jaar: verlofSaldiTable.jaar,
      saldoUren: verlofSaldiTable.saldoUren,
    })
    .from(verlofSaldiTable)
    .where(lt(verlofSaldiTable.saldoUren, 0));
  for (const r of rijen) {
    await upsertSignaal({
      regel: "verlofsaldo_buiten_cao",
      ernst: "waarschuwing",
      entiteitType: "medewerker",
      entiteitId: r.medewerkerId,
      titel: `Negatief verlofsaldo (${r.jaar})`,
      omschrijving: `Medewerker ${r.medewerkerId} heeft in ${r.jaar} een negatief verlofsaldo (${r.saldoUren} uur). Controleer de opname/opbouw.`,
      dedupSleutel: `verlofsaldo_buiten_cao:${r.id}`,
    });
  }
  return rijen.length;
}

async function draaiComplianceControle(): Promise<void> {
  const regels: Array<[string, () => Promise<number>]> = [
    ["certificaat_verlopen", regelVerlopenCertificaten],
    ["spot_zonder_document", regelSpotsZonderDocument],
    ["verlofsaldo_buiten_cao", regelVerlofsaldoBuitenCao],
  ];
  for (const [naam, fn] of regels) {
    try {
      const n = await fn();
      logger.info({ regel: naam, gecontroleerd: n }, "BIAE compliance: regel uitgevoerd");
    } catch (err) {
      logger.warn({ err, regel: naam }, "BIAE compliance: regel mislukt (overgeslagen)");
    }
  }
}

let _gepland = false;

export function planDagelijkseComplianceControle(): void {
  if (_gepland) return;
  _gepland = true;

  const EEN_DAG = 24 * 60 * 60 * 1000;
  const loop = (): void => {
    void draaiComplianceControle().finally(() => {
      const t = setTimeout(loop, EEN_DAG);
      t.unref?.();
    });
  };
  // Eerste controle 30s na start zodat de server eerst volledig up is.
  const eerste = setTimeout(loop, 30_000);
  eerste.unref?.();
  logger.info("BIAE: dagelijkse compliance-controle gepland");
}

// Geëxporteerd voor het beheerscherm / handmatige trigger en e2e-bewijsvoering.
export { draaiComplianceControle };
