// BIAE-capability — KPI- en risicoaggregatie.
//
// Voegt losse signaalbronnen samen tot één getypeerde KPI-feed: FIE-observaties,
// open goedkeuringen, open compliance-signalen en nacalculatie-afwijkingen. Het
// Directiecockpit ontvangt deze feed via de BIAE i.p.v. losse queries.
//
// Read-only aggregatie over bestaande tabellen; geen mutatie.
import {
  db,
  fieObservatiesTable,
  fieNacalculatiesTable,
  goedkeuringAanvragenTable,
  complianceSignalenTable,
} from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { logger } from "../../../lib/logger";

export interface BiaeKpiFeed {
  boekjaar: number;
  fieObservaties: {
    totaal: number;
    kritiek: number;
    waarschuwing: number;
  };
  openGoedkeuringen: number;
  complianceSignalen: {
    open: number;
    kritiek: number;
  };
  nacalculatieAfwijkingen: {
    // Aantal nacalculaties met een absolute arbeidsafwijking > 15%.
    hoog: number;
  };
  gegenereerdOp: string;
}

async function telVeilig(fn: () => Promise<number>, context: string): Promise<number> {
  try {
    return await fn();
  } catch (err) {
    logger.warn({ err, context }, "BIAE kpi: deel-aggregatie mislukt");
    return 0;
  }
}

export async function aggregeerKpiFeed(boekjaar: number): Promise<BiaeKpiFeed> {
  const fieTotaal = await telVeilig(async () => {
    const [r] = await db
      .select({ n: sql<number>`cast(count(*) as int)` })
      .from(fieObservatiesTable)
      .where(eq(fieObservatiesTable.boekjaar, boekjaar));
    return r?.n ?? 0;
  }, "fie.totaal");

  const fieKritiek = await telVeilig(async () => {
    const [r] = await db
      .select({ n: sql<number>`cast(count(*) as int)` })
      .from(fieObservatiesTable)
      .where(and(eq(fieObservatiesTable.boekjaar, boekjaar), eq(fieObservatiesTable.ernst, "kritiek")));
    return r?.n ?? 0;
  }, "fie.kritiek");

  const fieWaarschuwing = await telVeilig(async () => {
    const [r] = await db
      .select({ n: sql<number>`cast(count(*) as int)` })
      .from(fieObservatiesTable)
      .where(and(eq(fieObservatiesTable.boekjaar, boekjaar), eq(fieObservatiesTable.ernst, "waarschuwing")));
    return r?.n ?? 0;
  }, "fie.waarschuwing");

  const openGoedkeuringen = await telVeilig(async () => {
    const [r] = await db
      .select({ n: sql<number>`cast(count(*) as int)` })
      .from(goedkeuringAanvragenTable)
      .where(eq(goedkeuringAanvragenTable.status, "ingediend"));
    return r?.n ?? 0;
  }, "goedkeuring.open");

  const complianceOpen = await telVeilig(async () => {
    const [r] = await db
      .select({ n: sql<number>`cast(count(*) as int)` })
      .from(complianceSignalenTable)
      .where(eq(complianceSignalenTable.status, "open"));
    return r?.n ?? 0;
  }, "compliance.open");

  const complianceKritiek = await telVeilig(async () => {
    const [r] = await db
      .select({ n: sql<number>`cast(count(*) as int)` })
      .from(complianceSignalenTable)
      .where(and(eq(complianceSignalenTable.status, "open"), eq(complianceSignalenTable.ernst, "kritiek")));
    return r?.n ?? 0;
  }, "compliance.kritiek");

  const nacalcHoog = await telVeilig(async () => {
    const [r] = await db
      .select({ n: sql<number>`cast(count(*) as int)` })
      .from(fieNacalculatiesTable)
      .where(sql`abs(coalesce(${fieNacalculatiesTable.afwijkingPctArbeid}, 0)) > 15`);
    return r?.n ?? 0;
  }, "nacalculatie.hoog");

  return {
    boekjaar,
    fieObservaties: { totaal: fieTotaal, kritiek: fieKritiek, waarschuwing: fieWaarschuwing },
    openGoedkeuringen,
    complianceSignalen: { open: complianceOpen, kritiek: complianceKritiek },
    nacalculatieAfwijkingen: { hoog: nacalcHoog },
    gegenereerdOp: new Date().toISOString(),
  };
}
