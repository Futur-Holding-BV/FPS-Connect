// Gedragsbewijs AI_01 — van reactief naar meedenkend.
// Acceptatie §9, via HTTP tegen de lokale api-server + DB-verificatie:
//   1. Meting (Fase 0) ligt er: docs/metingen/AI_01_gebruik.md.
//   2. Voeder calculatie-afwijking: concept-calculatie met regel ≥30% boven de
//      eigen mediaan (≥5 waarnemingen) → werkbak-item "doen" met onderbouwing.
//   3. Rem: regelsoort met maar 4 waarnemingen → GEEN item (zwijgen boven gokken).
//   4. Voeder inkoop-afwijking: inkoopfactuurregel wijkt ≥30% af van de
//      jaarprijslijst → item met onderbouwing.
//   5. Voeder magazijn-bestelsuggestie: voorraad onder minimum → item aan
//      groep magazijn≥2 met concrete handeling.
//   6. Alle 5 AI-voeders draaien mee in de bewakingsloop-samenvatting.
//   7. Signaal-zonder-handeling bestaat niet: elk ai_*-item is soort "doen",
//      heeft een actiePad en een onderbouwing in de omschrijving.
//   8. Reconciliatie: afwijking opgelost → item automatisch afgehandeld.
//   9. Leerlus: 9 correcties doen NIETS; de 10e activeert de few-shot,
//      zichtbaar via geleerd_van_correcties; uitzetbaar via instelling.
// Draaien: pnpm --filter @workspace/scripts exec tsx src/bewijs-ai01.ts
import "./lib/prodGuard";
import bcrypt from "bcryptjs";
import { existsSync } from "node:fs";
import { and, eq, inArray, like } from "drizzle-orm";
import { authenticator } from "otplib";
import { db, gebruikersTable } from "@workspace/db";
import {
  werkbakItemsTable, modCalcHeadersTable, modCalcRegelsTable,
  facturenTable, factuurRegelsTable, artikelenTable, voorraadTable,
  aiVeldCorrectiesTable, appInstellingenTable,
} from "@workspace/db/schema";

const BASIS = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
const TOTP = "MFRGGZDFMZTWQ2LK";
const WW = "BewijsAi01!2026";

if (process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === "production") {
  throw new Error("GEWEIGERD: bewijsscript nooit tegen productie draaien.");
}

function check(naam: string, conditie: boolean, detail?: unknown): void {
  if (!conditie) { console.error(`✗ FAALT: ${naam}`, JSON.stringify(detail ?? "", null, 1).slice(0, 2000)); throw new Error(naam); }
  console.log(`✓ ${naam}`);
}

const EMAILS = [
  "bewijs-ai1-admin@fps.local", // hoofdbeheerder (bewaking draaien + analyseer)
  "bewijs-ai1-calc@fps.local",  // calculator, eigenaar van de concept-calculatie
];

async function ruimOp(): Promise<void> {
  const gebruikers = await db.select({ id: gebruikersTable.id }).from(gebruikersTable).where(inArray(gebruikersTable.email, EMAILS));
  const gids = gebruikers.map((g) => g.id);
  await db.delete(werkbakItemsTable).where(like(werkbakItemsTable.dedupSleutel, "ai-%"));
  await db.delete(factuurRegelsTable).where(like(factuurRegelsTable.omschrijving, "Bewijs AI1%"));
  await db.delete(facturenTable).where(like(facturenTable.factuurnummer, "BEWIJS-AI1%"));
  const artikelen = await db.select({ id: artikelenTable.id }).from(artikelenTable).where(like(artikelenTable.naam, "Bewijs AI1%"));
  if (artikelen.length) await db.delete(voorraadTable).where(inArray(voorraadTable.artikelId, artikelen.map((a) => a.id)));
  await db.delete(artikelenTable).where(like(artikelenTable.naam, "Bewijs AI1%"));
  const headers = await db.select({ id: modCalcHeadersTable.id }).from(modCalcHeadersTable).where(like(modCalcHeadersTable.naam, "Bewijs AI1%"));
  if (headers.length) await db.delete(modCalcRegelsTable).where(inArray(modCalcRegelsTable.calculatieId, headers.map((h) => h.id)));
  await db.delete(modCalcHeadersTable).where(like(modCalcHeadersTable.naam, "Bewijs AI1%"));
  await db.delete(aiVeldCorrectiesTable).where(like(aiVeldCorrectiesTable.gekozen, "Bewijs AI1%"));
  if (gids.length) await db.delete(gebruikersTable).where(inArray(gebruikersTable.id, gids));
}

async function maakGebruiker(email: string, naam: string, extra: Record<string, unknown> = {}): Promise<number> {
  const [g] = await db.insert(gebruikersTable).values({
    naam, email, rol: "gebruiker", wachtwoord: await bcrypt.hash(WW, 10),
    totpSecret: TOTP, tweeFactorIngeschakeld: true, actief: true, ...extra,
  } as typeof gebruikersTable.$inferInsert).returning({ id: gebruikersTable.id });
  return g!.id;
}

async function login(email: string): Promise<Record<string, string>> {
  const r = await fetch(`${BASIS}/auth/mobile/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, wachtwoord: WW, code: authenticator.generate(TOTP) }),
  });
  if (r.status !== 200) throw new Error(`login ${email} faalde: ${r.status} ${await r.text()}`);
  const j = await r.json() as { token: string };
  return { Authorization: `Bearer ${j.token}` };
}

async function draaiLoop(admin: Record<string, string>): Promise<Record<string, unknown>> {
  const r = await fetch(`${BASIS}/werkbak/bewaking/draai`, { method: "POST", headers: { ...admin, "Content-Type": "application/json" } });
  if (r.status !== 200) throw new Error(`bewakingsloop faalde: ${r.status} ${await r.text()}`);
  return (await r.json() as { samenvatting: Record<string, unknown> }).samenvatting;
}

async function analyseer(admin: Record<string, string>): Promise<Record<string, unknown>> {
  const form = new FormData();
  form.append("bestand", new Blob(["Bewijs AI1 leerlus"], { type: "text/plain" }), "bewijs-ai1-leerlus.txt");
  const r = await fetch(`${BASIS}/organisatie/bedrijfsdocumenten/analyseer`, { method: "POST", headers: admin, body: form });
  if (r.status !== 200) throw new Error(`analyseer faalde: ${r.status} ${await r.text()}`);
  return await r.json() as Record<string, unknown>;
}

async function main(): Promise<void> {
  await ruimOp();

  const adminGid = await maakGebruiker(EMAILS[0]!, "Bewijs AI1 Admin", { rol: "hoofdbeheerder" });
  const calcGid = await maakGebruiker(EMAILS[1]!, "Bewijs AI1 Calc", { bevoegdheden: { calculaties: 3, gebouwen: 1 } });
  const [admin] = [await login(EMAILS[0]!)];
  void adminGid;

  // ── 1. Fase 0-meting ligt er ───────────────────────────────────────────────
  check("1. meting docs/metingen/AI_01_gebruik.md bestaat", existsSync("../docs/metingen/AI_01_gebruik.md"));

  // ── 2+3. Calculatie: afwijking → item; 4 waarnemingen → niets ─────────────
  // Historie: 5 headers (status gewonnen) met regelsoort A à € 100; 4 met soort B à € 50.
  for (let i = 0; i < 5; i++) {
    const [h] = await db.insert(modCalcHeadersTable).values({ naam: `Bewijs AI1 hist A${i}`, status: "gewonnen" } as typeof modCalcHeadersTable.$inferInsert).returning();
    await db.insert(modCalcRegelsTable).values({ calculatieId: h!.id, omschrijving: "Bewijs AI1 soort A", eenheid: "m2", tarief: 100 } as typeof modCalcRegelsTable.$inferInsert);
  }
  for (let i = 0; i < 4; i++) {
    const [h] = await db.insert(modCalcHeadersTable).values({ naam: `Bewijs AI1 hist B${i}`, status: "gewonnen" } as typeof modCalcHeadersTable.$inferInsert).returning();
    await db.insert(modCalcRegelsTable).values({ calculatieId: h!.id, omschrijving: "Bewijs AI1 soort B", eenheid: "m2", tarief: 50 } as typeof modCalcRegelsTable.$inferInsert);
  }
  // Concept-calculatie van Calc: soort A à € 200 (100% boven mediaan) en soort B à € 500 (te weinig historie → moet zwijgen).
  const [concept] = await db.insert(modCalcHeadersTable).values({ naam: "Bewijs AI1 concept", status: "concept", aangemaaktDoorId: calcGid } as typeof modCalcHeadersTable.$inferInsert).returning();
  const [afwRegel] = await db.insert(modCalcRegelsTable).values({ calculatieId: concept!.id, omschrijving: "Bewijs AI1 soort A", eenheid: "m2", tarief: 200 } as typeof modCalcRegelsTable.$inferInsert).returning();
  await db.insert(modCalcRegelsTable).values({ calculatieId: concept!.id, omschrijving: "Bewijs AI1 soort B", eenheid: "m2", tarief: 500 } as typeof modCalcRegelsTable.$inferInsert);

  // ── 4. Inkoop: jaarprijslijst € 10, betaald € 20 ──────────────────────────
  await db.insert(artikelenTable).values({ naam: "Bewijs AI1 inkoopartikel", eenheid: "st", inkoopprijs: 10 } as typeof artikelenTable.$inferInsert);
  const [factuur] = await db.insert(facturenTable).values({ type: "inkoop", status: "verwerkt", factuurnummer: "BEWIJS-AI1-001" } as typeof facturenTable.$inferInsert).returning();
  await db.insert(factuurRegelsTable).values({ factuurId: factuur!.id, omschrijving: "Bewijs AI1 inkoopartikel", eenheid: "st", stukprijs: "20" } as typeof factuurRegelsTable.$inferInsert);

  // ── 5. Magazijn: voorraad 2 < minimum 10 ──────────────────────────────────
  const [voorraadArtikel] = await db.insert(artikelenTable).values({ naam: "Bewijs AI1 voorraadartikel", eenheid: "st", minimumVoorraad: 10, gewensteVoorraad: 20 } as typeof artikelenTable.$inferInsert).returning();
  await db.insert(voorraadTable).values({ artikelId: voorraadArtikel!.id, hoeveelheid: 2 } as typeof voorraadTable.$inferInsert);

  // ── Draai de loop en toets ────────────────────────────────────────────────
  const samenvatting = await draaiLoop(admin);
  for (const bron of ["ai_calculatie_afwijking", "ai_inkoop_afwijking", "ai_magazijn_bestelsuggestie", "ai_hrm_capaciteit", "ai_werkvoorbereiding_signaal"]) {
    check(`6. voeder ${bron} draait mee`, bron in samenvatting, samenvatting);
  }

  const calcItems = await db.select().from(werkbakItemsTable).where(and(eq(werkbakItemsTable.bron, "ai_calculatie_afwijking"), eq(werkbakItemsTable.status, "open")));
  const mijnCalcItem = calcItems.find((i) => i.gebruikerId === calcGid);
  check("2. calculatie-afwijking → item bij de calculator", !!mijnCalcItem, calcItems.map((i) => ({ g: i.gebruikerId, t: i.titel })));
  check("2b. onderbouwing: mediaan + afwijking + waarnemingen in de omschrijving",
    /mediaan/i.test(mijnCalcItem!.omschrijving ?? "") && /%/.test(mijnCalcItem!.omschrijving ?? "") && /waarneming/i.test(mijnCalcItem!.omschrijving ?? ""), mijnCalcItem!.omschrijving);
  check("3. rem: soort B (4 waarnemingen) komt in GEEN enkel item voor",
    calcItems.every((i) => !(i.omschrijving ?? "").includes("soort B") && !i.titel.includes("soort B")), calcItems.map((i) => i.omschrijving));

  const inkoopItems = await db.select().from(werkbakItemsTable).where(and(eq(werkbakItemsTable.bron, "ai_inkoop_afwijking"), eq(werkbakItemsTable.status, "open")));
  check("4. inkoop-afwijking → item", inkoopItems.some((i) => (i.omschrijving ?? "").includes("Bewijs AI1 inkoopartikel") || i.titel.includes("Bewijs AI1")), inkoopItems.map((i) => i.titel));

  const magazijnItems = await db.select().from(werkbakItemsTable).where(and(eq(werkbakItemsTable.bron, "ai_magazijn_bestelsuggestie"), eq(werkbakItemsTable.status, "open")));
  const magItem = magazijnItems.find((i) => i.titel.includes("Bewijs AI1 voorraadartikel"));
  check("5. bestelsuggestie → item aan groep magazijn≥2", !!magItem && magItem.vereisteModule === "magazijn" && (magItem.vereistNiveau ?? 0) >= 2, magazijnItems);

  const aiItems = await db.select().from(werkbakItemsTable).where(and(like(werkbakItemsTable.bron, "ai_%"), eq(werkbakItemsTable.status, "open")));
  check("7. geen signaal zonder handeling: alle ai_*-items zijn 'doen' met actiePad en onderbouwing",
    aiItems.length > 0 && aiItems.every((i) => i.soort === "doen" && !!i.actiePad && (i.omschrijving ?? "").length > 20),
    aiItems.map((i) => ({ bron: i.bron, soort: i.soort, pad: i.actiePad })));

  // ── 8. Reconciliatie: afwijking herstellen → item afgehandeld ─────────────
  await db.update(modCalcRegelsTable).set({ tarief: 100 }).where(eq(modCalcRegelsTable.id, afwRegel!.id));
  await draaiLoop(admin);
  const [naHerstel] = await db.select().from(werkbakItemsTable).where(eq(werkbakItemsTable.id, mijnCalcItem!.id));
  check("8. afwijking opgelost → item automatisch afgehandeld", naHerstel!.status === "afgehandeld", naHerstel!.status);

  // ── 9. Leerlus: 9 doet niets, 10 activeert, uitzetbaar ────────────────────
  const bestaandeInstellingen = await db.select({ id: appInstellingenTable.id }).from(appInstellingenTable).limit(1);
  if (bestaandeInstellingen.length === 0) {
    await db.insert(appInstellingenTable).values({} as typeof appInstellingenTable.$inferInsert);
  }
  await db.update(appInstellingenTable).set({ aiLerenVanCorrectiesIngeschakeld: true });
  const maakCorrectie = (n: number) => ({ veldNaam: "uitgever", aiVoorstel: `AI-gok ${n}`, gekozen: `Bewijs AI1 Uitgever BV` });
  await db.insert(aiVeldCorrectiesTable).values(Array.from({ length: 9 }, (_, n) => maakCorrectie(n)) as Array<typeof aiVeldCorrectiesTable.$inferInsert>);
  const met9 = await analyseer(admin);
  const geleerd9 = (met9.geleerd_van_correcties ?? []) as Array<{ veld: string }>;
  check("9. negen correcties → uitgever NIET in geleerd_van_correcties", !geleerd9.some((g) => g.veld === "uitgever"), met9.geleerd_van_correcties);
  await db.insert(aiVeldCorrectiesTable).values(maakCorrectie(9) as typeof aiVeldCorrectiesTable.$inferInsert);
  const met10 = await analyseer(admin);
  const geleerd10 = (met10.geleerd_van_correcties ?? []) as Array<{ veld: string; aantal_correcties: number; uitleg: string }>;
  const rij = geleerd10.find((g) => g.veld === "uitgever");
  check("9b. tiende correctie → zichtbaar bijgestuurd met uitleg", !!rij && rij.aantal_correcties >= 10 && rij.uitleg.length > 10, met10.geleerd_van_correcties);
  await db.update(appInstellingenTable).set({ aiLerenVanCorrectiesIngeschakeld: false });
  const uit = await analyseer(admin);
  check("9c. instelling uit → leren_uitgeschakeld en geen bijsturing", uit.leren_uitgeschakeld === true && (uit.geleerd_van_correcties as unknown[]).length === 0, uit);
  await db.update(appInstellingenTable).set({ aiLerenVanCorrectiesIngeschakeld: true });

  await ruimOp();
  console.log("\nAlle AI_01-acceptatiepunten groen.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
