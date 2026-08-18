/**
 * Gedragsbewijs CALC_KERN_01 — maak-offerte-route gebruikt dezelfde rekenkern
 * als de detail/lijst-route: het offertetotaal (excl. + incl. BTW) moet
 * cent-gelijk zijn aan wat de detailroute teruggeeft voor dezelfde calculatie.
 *
 * Acceptatie (§ gereed als): per geteste calculatie 0 afwijkingen; script
 * eindigt met exit 0.
 *
 * Draaiwijze:
 *   pnpm --filter @workspace/scripts exec tsx src/bewijs-calc-kern-offerte.ts
 */
import "./lib/prodGuard";
import bcrypt from "bcryptjs";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { authenticator } from "otplib";
import {
  db,
  gebruikersTable,
  modCalcHeadersTable,
  modCalcRegelsTable,
  offertesTable,
  offerteRegelsTable,
} from "@workspace/db";

const BASIS = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
const TOTP = "MFRGGZDFMZTWQ2LK";
const WW = "BewijsCalcKern2026!";

let falen = 0;
function check(naam: string, conditie: boolean, detail?: unknown): void {
  if (!conditie) {
    console.error(`\x1b[31m✗ FAALT: ${naam}\x1b[0m`, detail ?? "");
    falen++;
    return;
  }
  console.log(`✓ ${naam}`);
}

/** Cent-gelijkheid: afronden op 2 decimalen en vergelijken als geheel getal centen. */
function centGelijk(a: number | null | undefined, b: number | null | undefined): boolean {
  if (a == null || b == null) return false;
  return Math.round((a ?? 0) * 100) === Math.round((b ?? 0) * 100);
}

const opgeruimd: { gebruikers: number[]; calcs: number[]; offertes: number[] } = {
  gebruikers: [],
  calcs: [],
  offertes: [],
};

async function login(): Promise<Record<string, string>> {
  const r = await fetch(`${BASIS}/auth/mobile/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "bewijs-calckern@fps.local",
      wachtwoord: WW,
      code: authenticator.generate(TOTP),
    }),
  });
  if (r.status !== 200) throw new Error(`login faalde: ${r.status} ${await r.text()}`);
  const { token } = (await r.json()) as { token: string };
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function haalDetail(
  calcId: number,
  headers: Record<string, string>,
): Promise<{ totaal_na_opslagen: number; incl_btw: number } | null> {
  const r = await fetch(`${BASIS}/modules/calculaties/${calcId}`, { headers });
  if (r.status !== 200) {
    console.error(`  detail ${calcId}: HTTP ${r.status}`);
    return null;
  }
  const body = (await r.json()) as Record<string, unknown>;
  // detail geeft totaal_na_opslagen; incl_btw zit in de kern maar niet direct
  // in de response — we berekenen het zelf op dezelfde manier als de kern:
  // naarCenten(x) = Math.round(x * 100); btwC = Math.round(totaalC * 21/100);
  // incl_btw = naarEuro(totaalC + btwC)
  const totaalNaOpslagen = body["totaal_na_opslagen"] as number ?? 0;
  const totaalC = Math.round(totaalNaOpslagen * 100);
  const btwC = Math.round(totaalC * 21 / 100);
  const inclBtw = (totaalC + btwC) / 100;
  return { totaal_na_opslagen: totaalNaOpslagen, incl_btw: inclBtw };
}

async function maakOfferte(
  calcId: number,
  headers: Record<string, string>,
): Promise<number | null> {
  const r = await fetch(`${BASIS}/modules/calculaties/${calcId}/maak-offerte`, {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  });
  if (r.status !== 201) {
    console.error(`  maak-offerte ${calcId}: HTTP ${r.status} ${await r.text()}`);
    return null;
  }
  const { offerte_id } = (await r.json()) as { offerte_id: number };
  return offerte_id;
}

async function verifieerCalc(
  label: string,
  calcId: number,
  headers: Record<string, string>,
): Promise<void> {
  const detail = await haalDetail(calcId, headers);
  if (!detail) {
    check(`${label}: detail opvraagbaar`, false);
    return;
  }

  const offerteId = await maakOfferte(calcId, headers);
  if (!offerteId) {
    check(`${label}: maak-offerte slaagt`, false);
    return;
  }
  opgeruimd.offertes.push(offerteId);

  const [offerte] = await db
    .select({ exclBtw: offertesTable.bedragExclBtw, inclBtw: offertesTable.bedragInclBtw })
    .from(offertesTable)
    .where(eq(offertesTable.id, offerteId));

  check(
    `${label}: bedrag excl. BTW cent-gelijk (detail=${detail.totaal_na_opslagen} offerte=${offerte?.exclBtw})`,
    centGelijk(offerte?.exclBtw, detail.totaal_na_opslagen),
    { detail: detail.totaal_na_opslagen, offerte: offerte?.exclBtw },
  );

  check(
    `${label}: bedrag incl. BTW cent-gelijk (kern=${detail.incl_btw} offerte=${offerte?.inclBtw})`,
    centGelijk(offerte?.inclBtw, detail.incl_btw),
    { kern: detail.incl_btw, offerte: offerte?.inclBtw },
  );
}

async function main(): Promise<void> {
  // ── Test-gebruiker aanmaken ─────────────────────────────────────────────
  const [oud] = await db
    .select({ id: gebruikersTable.id })
    .from(gebruikersTable)
    .where(eq(gebruikersTable.email, "bewijs-calckern@fps.local"));
  if (oud) await db.delete(gebruikersTable).where(eq(gebruikersTable.id, oud.id));

  const [hb] = await db
    .insert(gebruikersTable)
    .values({
      naam: "Bewijs CalcKern",
      email: "bewijs-calckern@fps.local",
      rol: "hoofdbeheerder",
      wachtwoord: await bcrypt.hash(WW, 10),
      totpSecret: TOTP,
      tweeFactorIngeschakeld: true,
      actief: true,
    } as typeof gebruikersTable.$inferInsert)
    .returning({ id: gebruikersTable.id });
  opgeruimd.gebruikers.push(hb.id);

  const h = await login();

  // ── Scenario A: basisregel (soort="regel"), standaard opslagen ──────────
  const [cA] = await db
    .insert(modCalcHeadersTable)
    .values({
      naam: "Bewijs CalcKern A",
      status: "concept",
      opslagAk: 10,
      opslagAbk: 10,
      opslagRisico: 2,
      opslagWinst: 5,
      korting: 0,
      opslagMateriaal: 0,
      opslagArbeid: 0,
      aangemaaktDoorId: hb.id,
    } as typeof modCalcHeadersTable.$inferInsert)
    .returning({ id: modCalcHeadersTable.id });
  opgeruimd.calcs.push(cA.id);
  await db.insert(modCalcRegelsTable).values([
    {
      calculatieId: cA.id,
      omschrijving: "Werk A1",
      soort: "regel",
      hoeveelheid: 3,
      tarief: 100,
      totaal: 300,
      eenheid: "m2",
      volgorde: 1,
      isStaartkosten: false,
      isBouwplaatskosten: false,
      optioneel: false,
    },
    {
      calculatieId: cA.id,
      omschrijving: "Werk A2",
      soort: "regel",
      hoeveelheid: 2,
      tarief: 50,
      totaal: 100,
      eenheid: "st",
      volgorde: 2,
      isStaartkosten: false,
      isBouwplaatskosten: false,
      optioneel: false,
    },
  ] as (typeof modCalcRegelsTable.$inferInsert)[]);

  // ── Scenario B: met materiaal- en arbeidsopslag ─────────────────────────
  const [cB] = await db
    .insert(modCalcHeadersTable)
    .values({
      naam: "Bewijs CalcKern B",
      status: "concept",
      opslagAk: 8,
      opslagAbk: 12,
      opslagRisico: 3,
      opslagWinst: 7,
      korting: 0,
      opslagMateriaal: 15,
      opslagArbeid: 10,
      aangemaaktDoorId: hb.id,
    } as typeof modCalcHeadersTable.$inferInsert)
    .returning({ id: modCalcHeadersTable.id });
  opgeruimd.calcs.push(cB.id);
  await db.insert(modCalcRegelsTable).values([
    {
      calculatieId: cB.id,
      omschrijving: "Materiaal B1",
      soort: "materiaal",
      hoeveelheid: 10,
      tarief: 80,
      totaal: 800,
      eenheid: "m2",
      volgorde: 1,
      isStaartkosten: false,
      isBouwplaatskosten: false,
      optioneel: false,
    },
    {
      calculatieId: cB.id,
      omschrijving: "Uren B2",
      soort: "regel",
      hoeveelheid: 8,
      tarief: 60,
      muPerEenheid: 1,
      arbeidsTarief: 55,
      totaal: 480,
      eenheid: "uur",
      volgorde: 2,
      isStaartkosten: false,
      isBouwplaatskosten: false,
      optioneel: false,
    },
  ] as (typeof modCalcRegelsTable.$inferInsert)[]);

  // ── Scenario C: met staartkosten en optionele regel ─────────────────────
  const [cC] = await db
    .insert(modCalcHeadersTable)
    .values({
      naam: "Bewijs CalcKern C",
      status: "concept",
      opslagAk: 10,
      opslagAbk: 10,
      opslagRisico: 2,
      opslagWinst: 5,
      korting: 5,
      opslagMateriaal: 0,
      opslagArbeid: 0,
      aangemaaktDoorId: hb.id,
    } as typeof modCalcHeadersTable.$inferInsert)
    .returning({ id: modCalcHeadersTable.id });
  opgeruimd.calcs.push(cC.id);
  await db.insert(modCalcRegelsTable).values([
    {
      calculatieId: cC.id,
      omschrijving: "Directe kosten C1",
      soort: "regel",
      hoeveelheid: 5,
      tarief: 200,
      totaal: 1000,
      eenheid: "st",
      volgorde: 1,
      isStaartkosten: false,
      isBouwplaatskosten: false,
      optioneel: false,
    },
    {
      calculatieId: cC.id,
      omschrijving: "Staartkosten C2",
      soort: "regel",
      hoeveelheid: 1,
      tarief: 150,
      totaal: 150,
      eenheid: "ls",
      volgorde: 2,
      isStaartkosten: true,
      isBouwplaatskosten: false,
      optioneel: false,
    },
    {
      calculatieId: cC.id,
      omschrijving: "Optioneel C3",
      soort: "regel",
      hoeveelheid: 2,
      tarief: 75,
      totaal: 150,
      eenheid: "st",
      volgorde: 3,
      isStaartkosten: false,
      isBouwplaatskosten: false,
      optioneel: true,
    },
  ] as (typeof modCalcRegelsTable.$inferInsert)[]);

  // ── Scenario D: vaste-bedrag opslagen ───────────────────────────────────
  const [cD] = await db
    .insert(modCalcHeadersTable)
    .values({
      naam: "Bewijs CalcKern D",
      status: "concept",
      opslagAk: 500,
      opslagAbk: 250,
      opslagRisico: 100,
      opslagWinst: 400,
      korting: 0,
      opslagMateriaal: 0,
      opslagArbeid: 0,
      akIsVast: true,
      abkIsVast: true,
      risicoIsVast: false,
      winstIsVast: true,
      aangemaaktDoorId: hb.id,
    } as typeof modCalcHeadersTable.$inferInsert)
    .returning({ id: modCalcHeadersTable.id });
  opgeruimd.calcs.push(cD.id);
  await db.insert(modCalcRegelsTable).values([
    {
      calculatieId: cD.id,
      omschrijving: "Werk D1",
      soort: "regel",
      hoeveelheid: 1,
      tarief: 2000,
      totaal: 2000,
      eenheid: "ls",
      volgorde: 1,
      isStaartkosten: false,
      isBouwplaatskosten: false,
      optioneel: false,
    },
  ] as (typeof modCalcRegelsTable.$inferInsert)[]);

  // ── Scenario E: nul regels (lege calculatie) ────────────────────────────
  const [cE] = await db
    .insert(modCalcHeadersTable)
    .values({
      naam: "Bewijs CalcKern E",
      status: "concept",
      opslagAk: 10,
      opslagAbk: 10,
      opslagRisico: 2,
      opslagWinst: 5,
      korting: 0,
      opslagMateriaal: 0,
      opslagArbeid: 0,
      aangemaaktDoorId: hb.id,
    } as typeof modCalcHeadersTable.$inferInsert)
    .returning({ id: modCalcHeadersTable.id });
  opgeruimd.calcs.push(cE.id);
  // geen regels — totaal moet €0,00 zijn

  console.log("\n── Geplante scenario's ─────────────────────────────────────────────");
  await verifieerCalc("A: basisregels, standaard opslagen", cA.id, h);
  await verifieerCalc("B: met materiaal-/arbeidsopslag", cB.id, h);
  await verifieerCalc("C: staartkosten + optioneel + korting", cC.id, h);
  await verifieerCalc("D: vaste-bedrag opslagen (AK/ABK/winst vast)", cD.id, h);
  await verifieerCalc("E: lege calculatie (nul regels)", cE.id, h);

  // ── Bestaande calculaties in de database ────────────────────────────────
  console.log("\n── Bestaande calculaties ───────────────────────────────────────────");
  const bestaand = await db
    .select({ id: modCalcHeadersTable.id, naam: modCalcHeadersTable.naam })
    .from(modCalcHeadersTable)
    .orderBy(desc(modCalcHeadersTable.id))
    .limit(10);

  const eigeIds = new Set(opgeruimd.calcs);
  const teControleren = bestaand.filter((c) => !eigeIds.has(c.id));

  if (teControleren.length === 0) {
    console.log("  (geen bestaande calculaties in DB buiten testdata)");
  }

  for (const calc of teControleren) {
    await verifieerCalc(`bestaande calc #${calc.id} (${calc.naam})`, calc.id, h);
  }
}

main()
  .catch((err) => {
    console.error("\x1b[31mONVERWACHTE FOUT\x1b[0m", err);
    falen++;
  })
  .finally(async () => {
    try {
      // Offerte-regels worden via cascade verwijderd als de offerte weg is.
      if (opgeruimd.offertes.length)
        await db
          .delete(offerteRegelsTable)
          .where(inArray(offerteRegelsTable.offerteId, opgeruimd.offertes));
      if (opgeruimd.offertes.length)
        await db
          .delete(offertesTable)
          .where(inArray(offertesTable.id, opgeruimd.offertes));
      if (opgeruimd.calcs.length)
        await db
          .delete(modCalcHeadersTable)
          .where(inArray(modCalcHeadersTable.id, opgeruimd.calcs));
      if (opgeruimd.gebruikers.length)
        await db
          .delete(gebruikersTable)
          .where(inArray(gebruikersTable.id, opgeruimd.gebruikers));
    } catch (err) {
      console.error("cleanup-fout", err);
      falen++;
    }
    console.log(
      falen === 0
        ? "\n\x1b[32mALLE CHECKS GROEN — offerte-totalen cent-gelijk aan detail/kern\x1b[0m"
        : `\n\x1b[31m${falen} CHECK(S) ROOD\x1b[0m`,
    );
    process.exit(falen === 0 ? 0 : 1);
  });
