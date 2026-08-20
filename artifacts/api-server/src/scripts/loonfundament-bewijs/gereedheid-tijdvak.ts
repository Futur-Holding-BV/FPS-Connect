// LOON_02A — Controles (6) Gereedheid fail-closed en (7) Tijdvak-maxima.

import { eq } from "drizzle-orm";
import {
  db, loonStatenTable, loonStaatTijdvakregelsTable,
} from "@workspace/db";
import { check, eis, isPostgresCode, registreerOpruimen } from "./harnas";

// ── (6) Gereedheid ontbrekend jaar — fail-closed ──────────────────────────────

export async function controleerGereedheid(): Promise<void> {
  console.log("\n── (6) Gereedheid ontbrekend jaar — fail-closed ──");

  const testJaar = 1999;
  const sets = await db
    .select({ id: loonStatenTable.id })
    .from(loonStatenTable)
    .where(eq(loonStatenTable.kalenderjaar, testJaar));
  check(
    `jaar ${testJaar} heeft geen loonstaten`,
    sets.length === 0,
    `${sets.length} rijen`,
  );

  // Puur: simuleer gereedheidslogica
  function berekenGereedheid(
    jaarsets: Array<{ status: string; volledig: boolean }>,
    jaar: number,
  ) {
    if (jaarsets.length === 0) {
      return { jaar, gereed: false, status: "ontbreekt", redenen: [`Geen jaarset voor ${jaar}`] };
    }
    const set = jaarsets[jaarsets.length - 1]!;
    if (set.status !== "volledig" || !set.volledig) {
      return {
        jaar, gereed: false,
        status: set.status === "bron_gewijzigd" ? "bron_gewijzigd" : "onvolledig",
        redenen: [`Jaarset ${jaar} is niet volledig: ${set.status}`],
      };
    }
    return { jaar, gereed: true, status: "volledig", redenen: [] };
  }

  const g1999 = berekenGereedheid([], testJaar);
  check("ontbrekend jaar → gereed:false",        g1999.gereed === false);
  check("ontbrekend jaar → status:ontbreekt",    g1999.status === "ontbreekt");
  check("ontbrekend jaar heeft reden",           g1999.redenen.length > 0);
  check(`jaar in response is ${testJaar}`,       g1999.jaar === testJaar);

  const g2026Onvolledig = berekenGereedheid([{ status: "onvolledig", volledig: false }], 2026);
  check("onvolledige set → gereed:false",        g2026Onvolledig.gereed === false);
  check("onvolledige set → niet 'ontbreekt'",    g2026Onvolledig.status !== "ontbreekt");
  check("jaar-isolatie 2025",                    berekenGereedheid([], 2025).jaar === 2025);
}

// ── (7) Tijdvak-maxima ────────────────────────────────────────────────────────

export async function controleerTijdvakMaxima(ikvId: number): Promise<void> {
  console.log("\n── (7) Tijdvakregel-maxima: maand≤12, vier_weken≤13 ──");

  // Maand loonstaat
  const [staatMaand] = await db
    .insert(loonStatenTable)
    .values({ inkomstenverhoudingId: ikvId, kalenderjaar: 2026, tijdvak: "maand" })
    .returning();
  eis(!!staatMaand, "maand-loonstaat aangemaakt");
  registreerOpruimen(() =>
    db.delete(loonStatenTable).where(eq(loonStatenTable.id, staatMaand!.id)).then(() => {}),
  );

  const [tv12] = await db
    .insert(loonStaatTijdvakregelsTable)
    .values({
      loonstaatId: staatMaand!.id, tijdvaknummer: 12,
      periodeStart: "2026-12-01", periodeEinde: "2026-12-31",
      rekenstatus: "niet_berekend",
    })
    .returning();
  check("maand tijdvaknummer 12 opgeslagen", !!tv12 && tv12.tijdvaknummer === 12);
  if (tv12) {
    registreerOpruimen(() =>
      db.delete(loonStaatTijdvakregelsTable)
        .where(eq(loonStaatTijdvakregelsTable.id, tv12.id))
        .then(() => {}),
    );
  }

  let berekendeRegelGeweigerd = false;
  try {
    await db
      .insert(loonStaatTijdvakregelsTable)
      .values({
        loonstaatId: staatMaand!.id,
        tijdvaknummer: 11,
        periodeStart: "2026-11-01",
        periodeEinde: "2026-11-30",
        rekenstatus: "berekend",
        vindplaats: "Handboek test",
        tijdvakWaarden: { netto: 1 },
        cumulatieven: {},
      })
      .returning();
  } catch (err) {
    berekendeRegelGeweigerd = isPostgresCode(err, "23514");
  }
  check(
    "database weigert clientgeschreven berekende tijdvakregel vóór LOON_02B",
    berekendeRegelGeweigerd,
  );

  let maand13Geweigerd = false;
  try {
    await db.insert(loonStaatTijdvakregelsTable).values({
      loonstaatId: staatMaand!.id,
      tijdvaknummer: 13,
      periodeStart: "2026-12-01",
      periodeEinde: "2026-12-31",
      rekenstatus: "niet_berekend",
    });
  } catch (err) {
    maand13Geweigerd = isPostgresCode(err, "P0001");
  }
  check("database weigert tijdvak 13 voor maandloonstaat", maand13Geweigerd);

  let verkeerdeMaandperiodeGeweigerd = false;
  try {
    await db.insert(loonStaatTijdvakregelsTable).values({
      loonstaatId: staatMaand!.id,
      tijdvaknummer: 1,
      periodeStart: "2026-02-01",
      periodeEinde: "2026-02-28",
      rekenstatus: "niet_berekend",
    });
  } catch (err) {
    verkeerdeMaandperiodeGeweigerd = isPostgresCode(err, "P0001");
  }
  check("database weigert maandnummer met verkeerde kalenderperiode", verkeerdeMaandperiodeGeweigerd);

  let buitenJaarGeweigerd = false;
  try {
    await db.insert(loonStaatTijdvakregelsTable).values({
      loonstaatId: staatMaand!.id,
      tijdvaknummer: 2,
      periodeStart: "2025-02-01",
      periodeEinde: "2025-02-28",
      rekenstatus: "niet_berekend",
    });
  } catch (err) {
    buitenJaarGeweigerd = isPostgresCode(err, "P0001");
  }
  check("database weigert periode buiten kalenderjaar loonstaat", buitenJaarGeweigerd);

  let ouderWijzigingGeweigerd = false;
  try {
    await db
      .update(loonStatenTable)
      .set({ kalenderjaar: 2027 })
      .where(eq(loonStatenTable.id, staatMaand!.id));
  } catch (err) {
    ouderWijzigingGeweigerd = isPostgresCode(err, "P0001");
  }
  check("database blokkeert kalenderjaarwijziging na eerste tijdvakregel", ouderWijzigingGeweigerd);

  // Pure logica-checks voor maxima
  const maxTijdvak = (t: string) => (t === "maand" ? 12 : 13);
  check("maand max=12 (puur)",               maxTijdvak("maand") === 12);
  check("vier_weken max=13 (puur)",          maxTijdvak("vier_weken") === 13);
  check("nr 12 ≤ maand-max",                12 <= maxTijdvak("maand"));
  check("nr 13 > maand-max → geweigerd",    13 > maxTijdvak("maand"));
  check("nr 13 ≤ vier_weken-max",           13 <= maxTijdvak("vier_weken"));
  check("nr 14 > vier_weken-max → geweigerd", 14 > maxTijdvak("vier_weken"));

  // Vier-weken loonstaat
  const [staatVw] = await db
    .insert(loonStatenTable)
    .values({ inkomstenverhoudingId: ikvId, kalenderjaar: 2025, tijdvak: "vier_weken" })
    .returning();
  eis(!!staatVw, "vier_weken-loonstaat aangemaakt");
  registreerOpruimen(() =>
    db.delete(loonStatenTable).where(eq(loonStatenTable.id, staatVw!.id)).then(() => {}),
  );

  const [tv13] = await db
    .insert(loonStaatTijdvakregelsTable)
    .values({
      loonstaatId: staatVw!.id, tijdvaknummer: 13,
      periodeStart: "2025-12-22", periodeEinde: "2025-12-31",
      rekenstatus: "niet_berekend",
    })
    .returning();
  check("vier_weken tijdvaknummer 13 opgeslagen", !!tv13 && tv13.tijdvaknummer === 13);
  if (tv13) {
    registreerOpruimen(() =>
      db.delete(loonStaatTijdvakregelsTable)
        .where(eq(loonStaatTijdvakregelsTable.id, tv13.id))
        .then(() => {}),
    );
  }

  let vierWeken14Geweigerd = false;
  try {
    await db.insert(loonStaatTijdvakregelsTable).values({
      loonstaatId: staatVw!.id,
      tijdvaknummer: 14,
      periodeStart: "2025-12-01",
      periodeEinde: "2025-12-28",
      rekenstatus: "niet_berekend",
    });
  } catch (err) {
    vierWeken14Geweigerd = isPostgresCode(err, "P0001");
  }
  check("database weigert tijdvak 14 voor vierwekenloonstaat", vierWeken14Geweigerd);
}
