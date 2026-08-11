// Gedragsbewijs BEWAKING_02 — zes voeders op de commerciële keten.
// Acceptatie (§8): per voeder één aangemaakt werkbakitem én één automatisch
// gesloten item; de draai zichtbaar in bewaking_draaien met alle zes voeders.
// Patroon: HTTP tegen de lokale api-server (handmatige draai is hoofdbeheerder-
// only), seeds/cleanup via @workspace/db, ✓/rood, opruimen in finally.
// Draaien: pnpm --filter @workspace/scripts exec tsx src/bewijs-bewaking02.ts
import bcrypt from "bcryptjs";
import { eq, inArray, like, or, sql } from "drizzle-orm";
import { authenticator } from "otplib";
import { db, gebruikersTable, offertesTable, offerteTrackingTable, opnamesTable, opdrachtenTable, modCalcHeadersTable, calculatiesTable } from "@workspace/db";
import { werkbakItemsTable, bewakingDraaienTable } from "@workspace/db/schema";

const BASIS = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
const TOTP = "MFRGGZDFMZTWQ2LK";
const WW = "BewijsBewaking02!2026";

if (process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === "production") {
  throw new Error("GEWEIGERD: bewijsscript nooit tegen productie draaien.");
}

let falen = 0;
function check(naam: string, conditie: boolean, detail?: unknown): void {
  if (!conditie) { console.error(`\x1b[31m✗ FAALT: ${naam}\x1b[0m`, detail ?? ""); falen++; return; }
  console.log(`✓ ${naam}`);
}

const dagenGeleden = (d: number): Date => new Date(Date.now() - d * 86_400_000);
const opgeruimd = {
  gebruikers: [] as number[], offertes: [] as number[], opnames: [] as number[],
  opdrachten: [] as number[], calcs: [] as number[],
};

async function login(email: string): Promise<Record<string, string>> {
  const r = await fetch(`${BASIS}/auth/mobile/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, wachtwoord: WW, code: authenticator.generate(TOTP) }),
  });
  if (r.status !== 200) throw new Error(`login faalde: ${r.status} ${await r.text()}`);
  const j = await r.json() as { token: string };
  return { Authorization: `Bearer ${j.token}`, "Content-Type": "application/json" };
}

async function draai(headers: Record<string, string>): Promise<Record<string, unknown>> {
  const r = await fetch(`${BASIS}/werkbak/bewaking/draai`, { method: "POST", headers });
  if (r.status !== 200) throw new Error(`draai faalde: ${r.status} ${await r.text()}`);
  return (await r.json() as { samenvatting: Record<string, unknown> }).samenvatting;
}

async function itemVoor(prefix: string, herkomstId: number): Promise<{ id: number; status: string; soort: string } | null> {
  const [r] = await db.select({ id: werkbakItemsTable.id, status: werkbakItemsTable.status, soort: werkbakItemsTable.soort })
    .from(werkbakItemsTable)
    .where(like(werkbakItemsTable.dedupSleutel, `${prefix}:${herkomstId}:%`));
  return r ?? null;
}

async function main(): Promise<void> {
  // Hoofdbeheerder + behandelaar met offertes/calculaties-bevoegdheid.
  for (const email of ["bewijs-bw02-hb@fps.local", "bewijs-bw02-beh@fps.local"]) {
    const [oud] = await db.select({ id: gebruikersTable.id }).from(gebruikersTable).where(eq(gebruikersTable.email, email));
    if (oud) await db.delete(gebruikersTable).where(eq(gebruikersTable.id, oud.id));
  }
  const [hb] = await db.insert(gebruikersTable).values({
    naam: "Bewijs BW02 HB", email: "bewijs-bw02-hb@fps.local", rol: "hoofdbeheerder",
    wachtwoord: await bcrypt.hash(WW, 10), totpSecret: TOTP, tweeFactorIngeschakeld: true, actief: true,
  } as typeof gebruikersTable.$inferInsert).returning({ id: gebruikersTable.id });
  const [beh] = await db.insert(gebruikersTable).values({
    naam: "Bewijs BW02 Behandelaar", email: "bewijs-bw02-beh@fps.local", rol: "gebruiker",
    wachtwoord: await bcrypt.hash(WW, 10), totpSecret: TOTP, tweeFactorIngeschakeld: true, actief: true,
    bevoegdheden: { offertes: 3, calculaties: 2, projecten: 3 },
  } as typeof gebruikersTable.$inferInsert).returning({ id: gebruikersTable.id });
  opgeruimd.gebruikers.push(hb.id, beh.id);
  const headers = await login("bewijs-bw02-hb@fps.local");

  // ── Seeds ──────────────────────────────────────────────────────────────────
  const maakOfferte = async (extra: Partial<typeof offertesTable.$inferInsert>): Promise<number> => {
    const [o] = await db.insert(offertesTable).values({
      titel: "Bewijs BEWAKING_02", behandeldDoorId: beh.id, bedragInclBtw: 12100,
      ...extra,
    } as typeof offertesTable.$inferInsert).returning({ id: offertesTable.id });
    opgeruimd.offertes.push(o.id);
    return o.id;
  };
  // V1: verzonden, bezorgd 10 dagen terug (drempel 7).
  const offV1 = await maakOfferte({ portaalStatus: "verzonden" });
  await db.insert(offerteTrackingTable).values({ offerteId: offV1, event: "bezorgd", aangemaaktOp: dagenGeleden(10) });
  // V2: bekeken, éérste portaal_bekeken 8 dagen terug (drempel 5) + een vers
  // herhaalbezoek van gisteren — dat mag het signaal NIET uitstellen (min-regel).
  const offV2 = await maakOfferte({ portaalStatus: "bekeken" });
  await db.insert(offerteTrackingTable).values({ offerteId: offV2, event: "portaal_bekeken", aangemaaktOp: dagenGeleden(8) });
  await db.insert(offerteTrackingTable).values({ offerteId: offV2, event: "portaal_bekeken", aangemaaktOp: dagenGeleden(1) });
  // V3: verzonden mét verse bezorging (triggert V1 niet) maar geldigheid verstreken.
  const offV3 = await maakOfferte({ portaalStatus: "verzonden", datum: dagenGeleden(60).toISOString().slice(0, 10), geldigheidDagen: 30 });
  await db.insert(offerteTrackingTable).values({ offerteId: offV3, event: "bezorgd", aangemaaktOp: dagenGeleden(1) });
  // V4: definitieve opname van 20 dagen oud zonder calculatie (drempel 14),
  // plus een even oude CONCEPT-opname die géén item mag opleveren.
  const [opn] = await db.insert(opnamesTable).values({
    naam: "Bewijs BW02 opname", datum: dagenGeleden(20).toISOString().slice(0, 10),
    status: "definitief", aangemaaktDoorId: beh.id, aangemaaktOp: dagenGeleden(20),
  } as typeof opnamesTable.$inferInsert).returning({ id: opnamesTable.id });
  opgeruimd.opnames.push(opn.id);
  const [opnConcept] = await db.insert(opnamesTable).values({
    naam: "Bewijs BW02 concept-opname", datum: dagenGeleden(20).toISOString().slice(0, 10),
    status: "concept", aangemaaktDoorId: beh.id, aangemaaktOp: dagenGeleden(20),
  } as typeof opnamesTable.$inferInsert).returning({ id: opnamesTable.id });
  opgeruimd.opnames.push(opnConcept.id);
  // V5: definitieve ENK-calculatie zonder offerte + definitieve legacy-calculatie.
  const [calc] = await db.insert(modCalcHeadersTable).values({
    naam: "Bewijs BW02 calculatie", status: "definitief", aangemaaktDoorId: beh.id,
  } as typeof modCalcHeadersTable.$inferInsert).returning({ id: modCalcHeadersTable.id });
  opgeruimd.calcs.push(calc.id);
  const [calcLegacy] = await db.insert(calculatiesTable).values({
    naam: "Bewijs BW02 legacy-calculatie", status: "definitief", aangemaaktDoorId: beh.id,
  } as typeof calculatiesTable.$inferInsert).returning({ id: calculatiesTable.id });
  // V6: actieve opdracht zonder akkoordgrond.
  const [opd] = await db.insert(opdrachtenTable).values({
    titel: "Bewijs BW02 opdracht", status: "actief",
  } as typeof opdrachtenTable.$inferInsert).returning({ id: opdrachtenTable.id });
  opgeruimd.opdrachten.push(opd.id);

  // ── Draai 1: alle zes voeders openen een item ─────────────────────────────
  const s1 = await draai(headers);
  const voederNamen = ["offerte_geen_reactie", "offerte_bekeken_niet_getekend", "offerte_verlopen", "opname_zonder_calculatie", "calculatie_zonder_offerte", "opdracht_zonder_akkoord"];
  for (const naam of voederNamen) {
    const v = s1[naam] as { nieuw?: number; fout?: string } | undefined;
    check(`voeder ${naam} draait zonder fout mee`, !!v && !("fout" in (v as object) && (v as { fout?: string }).fout), v);
  }
  const i1 = await itemVoor("offerte-geen-reactie", offV1);
  check("V1 opent 'doen'-item voor verzonden offerte zonder reactie", i1?.status === "open" && i1?.soort === "doen", i1);
  const i2 = await itemVoor("offerte-bekeken-niet-getekend", offV2);
  check("V2 opent 'doen'-item voor bekeken-niet-getekend", i2?.status === "open" && i2?.soort === "doen", i2);
  const i3 = await itemVoor("offerte-verlopen", offV3);
  check("V3 opent 'weten'-item voor verlopen offerte", i3?.status === "open" && i3?.soort === "weten", i3);
  const i1b = await itemVoor("offerte-geen-reactie", offV3);
  check("V3-offerte met verse bezorging triggert V1 niet", i1b === null, i1b);
  check("V2 gebruikt het éérste bekeken-moment (vers herhaalbezoek stelt niet uit)", i2?.status === "open");
  const i4 = await itemVoor("opname-zonder-calculatie", opn.id);
  check("V4 opent 'doen'-item voor definitieve opname zonder calculatie", i4?.status === "open" && i4?.soort === "doen", i4);
  const i4c = await itemVoor("opname-zonder-calculatie", opnConcept.id);
  check("V4 slaat concept-opnames over (nog werk in uitvoering)", i4c === null, i4c);
  const i5 = await itemVoor("calculatie-zonder-offerte", calc.id);
  check("V5 opent 'weten'-item voor definitieve ENK-calculatie zonder offerte", i5?.status === "open" && i5?.soort === "weten", i5);
  const i5l = await itemVoor("calculatie-zonder-offerte", `legacy-${calcLegacy.id}` as unknown as number);
  check("V5 signaleert ook een definitieve legacy-calculatie", i5l?.status === "open" && i5l?.soort === "weten", i5l);
  const i6 = await itemVoor("opdracht-zonder-akkoord", opd.id);
  check("V6 opent 'weten'-item voor actieve opdracht zonder akkoord", i6?.status === "open" && i6?.soort === "weten", i6);
  check("V1-item landt bij de behandelaar (bevoegd, geen groepsvangnet)",
    (await db.select({ g: werkbakItemsTable.gebruikerId }).from(werkbakItemsTable).where(eq(werkbakItemsTable.id, i1?.id ?? -1)))[0]?.g === beh.id);

  // Draai zichtbaar in bewaking_draaien met de zes voeders in de samenvatting.
  const [laatste] = await db.select({ samenvatting: bewakingDraaienTable.samenvatting })
    .from(bewakingDraaienTable).orderBy(sql`id DESC`).limit(1);
  const sv = (laatste?.samenvatting ?? {}) as Record<string, unknown>;
  check("draai in bewaking_draaien bevat alle zes voeders", voederNamen.every((n) => n in sv), Object.keys(sv));

  // ── Aanleiding wegnemen → draai 2 sluit alles automatisch ─────────────────
  await db.update(offertesTable).set({ portaalStatus: "ondertekend" }).where(eq(offertesTable.id, offV1));
  await db.update(offertesTable).set({ portaalStatus: "ondertekend" }).where(eq(offertesTable.id, offV2));
  await db.update(offertesTable).set({ portaalStatus: "afgewezen" }).where(eq(offertesTable.id, offV3));
  const [calcV4] = await db.insert(modCalcHeadersTable).values({
    naam: "Bewijs BW02 calculatie bij opname", opnameId: opn.id, aangemaaktDoorId: beh.id,
  } as typeof modCalcHeadersTable.$inferInsert).returning({ id: modCalcHeadersTable.id });
  opgeruimd.calcs.push(calcV4.id);
  await maakOfferte({ calculatieId: calc.id });
  // Legacy-calc: aanleiding weg door terugzetten naar concept.
  await db.update(calculatiesTable).set({ status: "concept" }).where(eq(calculatiesTable.id, calcLegacy.id));
  await db.update(opdrachtenTable).set({ akkoordGrond: "ondertekening", akkoordOp: new Date(), akkoordDoorId: hb.id }).where(eq(opdrachtenTable.id, opd.id));

  await draai(headers);
  for (const [naam, prefix, id] of [
    ["V1", "offerte-geen-reactie", offV1], ["V2", "offerte-bekeken-niet-getekend", offV2],
    ["V3", "offerte-verlopen", offV3], ["V4", "opname-zonder-calculatie", opn.id],
    ["V5", "calculatie-zonder-offerte", calc.id], ["V6", "opdracht-zonder-akkoord", opd.id],
  ] as const) {
    const it = await itemVoor(prefix, id);
    check(`${naam}-item sluit automatisch zodra de aanleiding weg is`, it?.status === "afgehandeld", it);
  }
  const i5lNa = await itemVoor("calculatie-zonder-offerte", `legacy-${calcLegacy.id}` as unknown as number);
  check("V5-legacy-item sluit zodra de calculatie terug naar concept gaat", i5lNa?.status === "afgehandeld", i5lNa);
  // Cleanup legacy-calc + werkbakitems ervan.
  await db.delete(werkbakItemsTable).where(sql`${werkbakItemsTable.herkomstType} = 'calculatie_legacy' AND ${werkbakItemsTable.herkomstId} = ${calcLegacy.id}`);
  await db.delete(calculatiesTable).where(eq(calculatiesTable.id, calcLegacy.id));
}

main().catch((err) => { console.error("\x1b[31mONVERWACHTE FOUT\x1b[0m", err); falen++; })
  .finally(async () => {
    try {
      const herkomsten = [
        ...opgeruimd.offertes.map((id) => ({ t: "offerte", id })),
        ...opgeruimd.opnames.map((id) => ({ t: "opname", id })),
        ...opgeruimd.calcs.map((id) => ({ t: "calculatie", id })),
        ...opgeruimd.opdrachten.map((id) => ({ t: "opdracht", id })),
      ];
      for (const h of herkomsten) {
        await db.delete(werkbakItemsTable).where(sql`${werkbakItemsTable.herkomstType} = ${h.t} AND ${werkbakItemsTable.herkomstId} = ${h.id}`);
      }
      if (opgeruimd.offertes.length) await db.delete(offertesTable).where(inArray(offertesTable.id, opgeruimd.offertes));
      if (opgeruimd.calcs.length) await db.delete(modCalcHeadersTable).where(inArray(modCalcHeadersTable.id, opgeruimd.calcs));
      if (opgeruimd.opnames.length) await db.delete(opnamesTable).where(inArray(opnamesTable.id, opgeruimd.opnames));
      if (opgeruimd.opdrachten.length) await db.delete(opdrachtenTable).where(inArray(opdrachtenTable.id, opgeruimd.opdrachten));
      if (opgeruimd.gebruikers.length) await db.delete(gebruikersTable).where(inArray(gebruikersTable.id, opgeruimd.gebruikers));
    } catch (err) { console.error("cleanup-fout", err); falen++; }
    console.log(falen === 0 ? "\nALLE CHECKS GROEN" : `\n${falen} CHECK(S) ROOD`);
    process.exit(falen === 0 ? 0 : 1);
  });
