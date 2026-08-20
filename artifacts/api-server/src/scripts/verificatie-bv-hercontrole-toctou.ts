// ADMINISTRATIE_01 fase 3 — deterministisch bewijs van de TOCTOU-hercontrole.
//
// Draait BINNEN het api-server-pakket zodat exact de productiecode
// (claimAccountviewVerzending + hercontroleerBvNaClaim) wordt aangeroepen.
// Het simuleert de race die over HTTP niet deterministisch te raken is:
//   1. eerste BV-controle slaagt (factuur-BV == koppeling-BV)
//   2. verzend-claim wordt genomen
//   3. NÁ de claim wijzigt de BV op de offerte (of de koppeling-BV)
//   4. hercontroleerBvNaClaim moet weigeren én de claim teruggeven
//      (factuur op accountview_status=error met leesbare reden)
//
// Aanroepen: pnpm --filter @workspace/api-server exec tsx src/scripts/verificatie-bv-hercontrole-toctou.ts
import { createRequire } from "node:module";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  facturenTable,
  offertesTable,
  gebouwenTable,
  werkgeversTable,
  accountviewInstellingenTable,
  caoCatalogusTable,
} from "@workspace/db";

if (process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === "production") {
  throw new Error("GEWEIGERD: bewijsscript draait alleen in dev.");
}

// objectStorage.ts (transitief geïmporteerd) verwacht een CJS-achtige
// globalThis.require zoals in de esbuild-bundle; onder tsx/ESM shimmen we die.
(globalThis as { require?: NodeJS.Require }).require = createRequire(import.meta.url);
const { claimAccountviewVerzending, hercontroleerBvNaClaim } = await import("../services/accountviewExportService");
const { controleerFactuurAdministratieBv } = await import("../services/factuurWerkmaatschappij");

let checks = 0;
let fouten = 0;
function check(naam: string, ok: boolean, detail?: unknown): void {
  checks += 1;
  if (ok) console.log(`  ✓ ${naam}`);
  else { fouten += 1; console.error(`  ✗ ${naam}`, detail ?? ""); }
}

async function main(): Promise<void> {
  const [cao] = await db.select({ id: caoCatalogusTable.id }).from(caoCatalogusTable).where(eq(caoCatalogusTable.code, "ONBEKEND"));
  if (!cao) throw new Error("CAO-catalogus ontbreekt");
  const [bvA] = await db.insert(werkgeversTable).values({ naam: "TOCTOU BV Alpha", caoId: cao.id }).returning();
  const [bvB] = await db.insert(werkgeversTable).values({ naam: "TOCTOU BV Beta", caoId: cao.id }).returning();
  if (!bvA || !bvB) throw new Error("BV's niet aangemaakt");
  const [gebouw] = await db.insert(gebouwenTable)
    .values({ naam: "TOCTOU Gebouw", adres: "Racestraat 1", stad: "Testdam", werkgeverId: bvA.id }).returning();
  if (!gebouw) throw new Error("Gebouw niet aangemaakt");
  const [offerte] = await db.insert(offertesTable)
    .values({ titel: "TOCTOU offerte", gebouwId: gebouw.id, werkmaatschappijId: bvA.id, status: "concept" }).returning();
  if (!offerte) throw new Error("Offerte niet aangemaakt");
  const [factuur] = await db.insert(facturenTable)
    .values({ type: "verkoop", status: "concept", offerteId: offerte.id, gebouwId: gebouw.id }).returning();
  if (!factuur) throw new Error("Factuur niet aangemaakt");

  const [instOrigineel] = await db.select().from(accountviewInstellingenTable).where(eq(accountviewInstellingenTable.id, 1));
  try {
    await db.insert(accountviewInstellingenTable)
      .values({ id: 1, apiGebruiker: "toctou-bewijs", werkgeverId: bvA.id })
      .onConflictDoUpdate({ target: accountviewInstellingenTable.id, set: { apiGebruiker: "toctou-bewijs", werkgeverId: bvA.id } });

    // Scenario 1: BV op de offerte wijzigt NÁ de eerste controle + claim.
    const vooraf = await controleerFactuurAdministratieBv(factuur, bvA.id);
    check("1. eerste BV-controle slaagt (factuur-BV == koppeling-BV)", vooraf === null, vooraf);
    check("1b. verzend-claim genomen", await claimAccountviewVerzending(factuur.id));
    // — de race: iemand wijzigt de BV op het werk terwijl de verzending loopt —
    await db.update(offertesTable).set({ werkmaatschappijId: bvB.id }).where(eq(offertesTable.id, offerte.id));
    const her1 = await hercontroleerBvNaClaim(factuur);
    check("1c. hercontrole ná claim weigert bij BV-mutatie op de offerte",
      her1.bvFout !== null && her1.bvFout.includes("andere werkmaatschappij"), her1.bvFout);
    const [na1] = await db.select().from(facturenTable).where(eq(facturenTable.id, factuur.id));
    check("1d. claim teruggegeven: accountview_status=error + reden vastgelegd",
      na1?.accountviewStatus === "error" && (na1?.accountviewFout ?? "").includes("andere werkmaatschappij"),
      { status: na1?.accountviewStatus, fout: na1?.accountviewFout });

    // Scenario 2: koppeling-BV verdwijnt NÁ de eerste controle + claim.
    await db.update(offertesTable).set({ werkmaatschappijId: bvA.id }).where(eq(offertesTable.id, offerte.id));
    check("2. herstelde situatie: controle slaagt weer", (await controleerFactuurAdministratieBv(factuur, bvA.id)) === null);
    check("2b. verzend-claim opnieuw genomen (vanuit error)", await claimAccountviewVerzending(factuur.id));
    // — de race: beheerder haalt de BV van de AccountView-koppeling af —
    await db.update(accountviewInstellingenTable).set({ werkgeverId: null }).where(eq(accountviewInstellingenTable.id, 1));
    const her2 = await hercontroleerBvNaClaim(factuur);
    check("2c. hercontrole leest instellingen VERS en weigert zonder koppeling-BV",
      her2.bvFout !== null && her2.bvFout.toLowerCase().includes("werkmaatschappij"), her2.bvFout);
    const [na2] = await db.select().from(facturenTable).where(eq(facturenTable.id, factuur.id));
    check("2d. claim teruggegeven: accountview_status=error", na2?.accountviewStatus === "error", na2?.accountviewStatus);

    // Scenario 3: geen BV-mutatie → hercontrole laat boeken toe (geen vals
    // alarm) én levert de VERSE snapshot: een administratiecode die ná de
    // claim wijzigt moet in de teruggegeven snapshot staan, zodat de payload
    // nooit met de oude administratiecode wordt opgebouwd.
    await db.update(accountviewInstellingenTable)
      .set({ werkgeverId: bvA.id, administratiecode: "OUD-ADM" }).where(eq(accountviewInstellingenTable.id, 1));
    check("3. claim genomen", await claimAccountviewVerzending(factuur.id));
    // — de race: administratiecode wijzigt ná de claim —
    await db.update(accountviewInstellingenTable).set({ administratiecode: "NIEUW-ADM" }).where(eq(accountviewInstellingenTable.id, 1));
    const her3 = await hercontroleerBvNaClaim(factuur);
    check("3b. zonder mutatie staat de hercontrole boeken toe (bvFout=null)", her3.bvFout === null, her3.bvFout);
    check("3c. hercontrole levert de VERSE instellingen-snapshot terug (koppeling-BV + nieuwe administratiecode)",
      her3.inst !== null && her3.inst.werkgeverId === bvA.id && her3.inst.administratiecode === "NIEUW-ADM",
      { wm: her3.inst?.werkgeverId, adm: her3.inst?.administratiecode });
  } finally {
    await db.delete(facturenTable).where(eq(facturenTable.id, factuur.id));
    await db.delete(offertesTable).where(eq(offertesTable.id, offerte.id));
    await db.delete(gebouwenTable).where(eq(gebouwenTable.id, gebouw.id));
    await db.delete(werkgeversTable).where(inArray(werkgeversTable.id, [bvA.id, bvB.id]));
    if (instOrigineel) {
      await db.update(accountviewInstellingenTable)
        .set({ apiGebruiker: instOrigineel.apiGebruiker, werkgeverId: instOrigineel.werkgeverId, administratiecode: instOrigineel.administratiecode })
        .where(eq(accountviewInstellingenTable.id, 1));
    } else {
      await db.delete(accountviewInstellingenTable).where(eq(accountviewInstellingenTable.id, 1));
    }
  }

  console.log(`\n${checks} checks, ${fouten} fouten`);
  if (fouten > 0) process.exit(1);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
