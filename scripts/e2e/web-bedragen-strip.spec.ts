// E2E-bewijs bedragen-strip (BOUW_01 §1, task 855):
// een account met projecten:1 (lezen ZONDER bedragen — het monteursprofiel)
// mag nooit bedragen te zien krijgen op werkbegroting, inkoopplanning en
// inkoopbonnen, en krijgt 403 op de bedragen-only routes (/materiaal,
// /nacalculatie, /inkoopcoach, /onderaanneming). Hetzelfde datasetje mét
// projecten:2 laat de bedragen wél zien — zodat de test bewijst dat de strip
// het verschil maakt en niet toevallig op lege data slaagt.
//
// API-niveau test (Playwright request-context): de strip zit server-side in
// mapRegel/mapInkoopRegel/mapBonRegel; de UI is hier geen extra bewijs.
import { test, expect, type APIRequestContext } from "@playwright/test";
import { authenticator } from "otplib";
import { eq } from "drizzle-orm";

import {
  db,
  opdrachtenTable,
  projectBegrotingenTable,
  werkbegrotingRegelsTable,
  inkoopplannenTable,
  inkoopplanRegelsTable,
  inkoopbonnenTable,
  inkoopbonRegelsTable,
} from "@workspace/db";

import {
  setupE2eBedragenAccounts,
  archiveerE2eBedragenAccounts,
  E2E_BEDRAGEN1_EMAIL,
  E2E_BEDRAGEN1_WACHTWOORD,
  E2E_BEDRAGEN1_TOTP_SECRET,
  E2E_BEDRAGEN2_EMAIL,
  E2E_BEDRAGEN2_WACHTWOORD,
  E2E_BEDRAGEN2_TOTP_SECRET,
} from "../src/e2e-monteur-testaccount";

// ── Testdata (geseed in beforeAll, opgeruimd in afterAll) ────────────────────

let opdrachtId = 0;

test.beforeAll(async () => {
  await setupE2eBedragenAccounts();

  // Minimale maar representatieve dataset: opdracht + werkbegroting met
  // arbeid- en materiaalregels (tarief/totaal ≠ 0), inkoopplanning met
  // gevulde prijsvelden en één inkoopbon met regelprijzen.
  const [opdracht] = await db
    .insert(opdrachtenTable)
    .values({ titel: "E2E Bedragen-strip testopdracht", status: "actief" })
    .returning({ id: opdrachtenTable.id });
  opdrachtId = opdracht.id;

  const [begroting] = await db
    .insert(projectBegrotingenTable)
    .values({
      opdrachtId,
      totaalArbeidUren: 16,
      totaalMateriaalBedrag: 1250.5,
      omschrijving: "E2E bedragen-strip",
    })
    .returning({ id: projectBegrotingenTable.id });

  await db.insert(werkbegrotingRegelsTable).values([
    {
      begrotingId: begroting.id,
      categorie: "arbeid",
      omschrijving: "E2E montage-uren",
      eenheid: "uur",
      hoeveelheid: 16,
      tarief: 62.5,
      totaal: 1000,
    },
    {
      begrotingId: begroting.id,
      categorie: "materiaal",
      omschrijving: "E2E brandkleppen",
      eenheid: "st",
      hoeveelheid: 5,
      tarief: 250.1,
      totaal: 1250.5,
    },
  ]);

  const [plan] = await db
    .insert(inkoopplannenTable)
    .values({ opdrachtId, totaleBesparing: 75.25 })
    .returning({ id: inkoopplannenTable.id });

  await db.insert(inkoopplanRegelsTable).values({
    inkoopplanId: plan.id,
    omschrijving: "E2E brandkleppen inkoop",
    hoeveelheid: 5,
    eenheid: "st",
    calcPrijs: 250.1,
    inkoopprijsVerwacht: 235.05,
    inkoopprijs: 240,
    besparingPerEenheid: 10.1,
    besparing: 50.5,
  });

  const [bon] = await db
    .insert(inkoopbonnenTable)
    .values({
      opdrachtId,
      inkoopplanId: plan.id,
      leverancier: "E2E Leverancier BV",
      totaalBedrag: 1200,
    })
    .returning({ id: inkoopbonnenTable.id });

  await db.insert(inkoopbonRegelsTable).values({
    inkoopbonId: bon.id,
    omschrijving: "E2E brandkleppen bon",
    hoeveelheid: 5,
    eenheid: "st",
    prijs: 240,
    totaal: 1200,
  });
});

test.afterAll(async () => {
  // Opdracht-cascade ruimt inkoopplannen/regels/bonnen op; project_begrotingen
  // heeft "set null" dus die (en de werkbegroting-regels) expliciet weg.
  const begrotingen = await db
    .select({ id: projectBegrotingenTable.id })
    .from(projectBegrotingenTable)
    .where(eq(projectBegrotingenTable.opdrachtId, opdrachtId));
  for (const b of begrotingen) {
    await db
      .delete(werkbegrotingRegelsTable)
      .where(eq(werkbegrotingRegelsTable.begrotingId, b.id));
    await db
      .delete(projectBegrotingenTable)
      .where(eq(projectBegrotingenTable.id, b.id));
  }
  await db.delete(opdrachtenTable).where(eq(opdrachtenTable.id, opdrachtId));
  await archiveerE2eBedragenAccounts();
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function logIn(
  request: APIRequestContext,
  email: string,
  wachtwoord: string,
  totpSecret: string,
): Promise<void> {
  const res1 = await request.post("/api/auth/login", {
    data: { email, wachtwoord },
  });
  expect(res1.status(), "login stap 1").toBe(200);
  const res2 = await request.post("/api/auth/2fa/verify", {
    data: { code: authenticator.generate(totpSecret) },
  });
  expect(res2.status(), "TOTP-verificatie").toBe(200);
}

async function getJson(
  request: APIRequestContext,
  pad: string,
): Promise<unknown> {
  const res = await request.get(pad);
  expect(res.status(), `GET ${pad}`).toBe(200);
  return res.json();
}

const BEDRAGEN_ONLY_ROUTES = [
  "materiaal",
  "nacalculatie",
  "inkoopcoach",
  "onderaanneming",
] as const;

type Obj = Record<string, unknown>;

// ── Monteur (projecten:1): nooit bedragen ────────────────────────────────────

test("projecten:1 — werkbegroting/inkoopplanning/inkoopbonnen zonder bedragen + 403 op bedragen-routes", async ({
  request,
}) => {
  await logIn(
    request,
    E2E_BEDRAGEN1_EMAIL,
    E2E_BEDRAGEN1_WACHTWOORD,
    E2E_BEDRAGEN1_TOTP_SECRET,
  );

  await test.step("werkbegroting: tarief/totaal/totaal_materiaal_bedrag = null", async () => {
    const b = (await getJson(
      request,
      `/api/opdrachten/${opdrachtId}/werkbegroting`,
    )) as Obj;
    expect(b.totaal_materiaal_bedrag).toBeNull();
    const regels = b.regels as Obj[];
    expect(regels.length).toBeGreaterThanOrEqual(2);
    for (const r of regels) {
      expect(r.tarief, `regel ${r.id} tarief`).toBeNull();
      expect(r.totaal, `regel ${r.id} totaal`).toBeNull();
    }
  });

  await test.step("inkoopplanning: alle prijsvelden = null", async () => {
    const p = (await getJson(
      request,
      `/api/opdrachten/${opdrachtId}/inkoopplanning`,
    )) as Obj;
    expect(p.totale_besparing, "plan totale_besparing").toBeNull();
    const regels = p.regels as Obj[];
    expect(regels.length).toBeGreaterThanOrEqual(1);
    for (const r of regels) {
      for (const veld of [
        "calc_prijs",
        "inkoopprijs_verwacht",
        "inkoopprijs",
        "besparing_per_eenheid",
        "besparing",
      ]) {
        expect(r[veld], `inkoopregel ${r.id} ${veld}`).toBeNull();
      }
    }
  });

  await test.step("inkoopbonnen: totaal_bedrag en regelprijzen = null", async () => {
    const bonnen = (await getJson(
      request,
      `/api/opdrachten/${opdrachtId}/inkoopplanning/inkoopbonnen`,
    )) as Obj[];
    expect(bonnen.length).toBeGreaterThanOrEqual(1);
    for (const bon of bonnen) {
      expect(bon.totaal_bedrag, `bon ${bon.id} totaal_bedrag`).toBeNull();
      for (const r of bon.regels as Obj[]) {
        expect(r.prijs, `bonregel ${r.id} prijs`).toBeNull();
        expect(r.totaal, `bonregel ${r.id} totaal`).toBeNull();
      }
    }
  });

  await test.step("bedragen-only routes geven 403", async () => {
    for (const route of BEDRAGEN_ONLY_ROUTES) {
      const res = await request.get(`/api/opdrachten/${opdrachtId}/${route}`);
      expect(res.status(), `GET /${route}`).toBe(403);
    }
  });
});

// ── Kantoor (projecten:2): bedragen wél zichtbaar ────────────────────────────

test("projecten:2 — dezelfde flow laat bedragen wél zien en bedragen-routes zijn geen 403", async ({
  request,
}) => {
  await logIn(
    request,
    E2E_BEDRAGEN2_EMAIL,
    E2E_BEDRAGEN2_WACHTWOORD,
    E2E_BEDRAGEN2_TOTP_SECRET,
  );

  await test.step("werkbegroting mét bedragen", async () => {
    const b = (await getJson(
      request,
      `/api/opdrachten/${opdrachtId}/werkbegroting`,
    )) as Obj;
    expect(b.totaal_materiaal_bedrag).toBe(1250.5);
    const regels = b.regels as Obj[];
    const materiaal = regels.find((r) => r.categorie === "materiaal");
    expect(materiaal?.tarief).toBeCloseTo(250.1, 2);
    expect(materiaal?.totaal).toBe(1250.5);
  });

  await test.step("inkoopplanning mét prijzen", async () => {
    const p = (await getJson(
      request,
      `/api/opdrachten/${opdrachtId}/inkoopplanning`,
    )) as Obj;
    expect(p.totale_besparing).toBeCloseTo(75.25, 2);
    const [r] = p.regels as Obj[];
    expect(r.calc_prijs).toBeCloseTo(250.1, 2);
    expect(r.inkoopprijs_verwacht).toBeCloseTo(235.05, 2);
    expect(r.inkoopprijs).toBe(240);
    expect(r.besparing).toBe(50.5);
  });

  await test.step("inkoopbonnen mét bedragen", async () => {
    const bonnen = (await getJson(
      request,
      `/api/opdrachten/${opdrachtId}/inkoopplanning/inkoopbonnen`,
    )) as Obj[];
    const bon = bonnen.find((b) => b.opdracht_id === opdrachtId)!;
    expect(bon.totaal_bedrag).toBe(1200);
    const [r] = bon.regels as Obj[];
    expect(r.prijs).toBe(240);
    expect(r.totaal).toBe(1200);
  });

  await test.step("bedragen-only routes geven 200 (werkende toegang)", async () => {
    // De opdracht is geseed mét werkbegroting en inkoopplan, dus alle vier de
    // bedragen-routes moeten voor projecten:2 een succesvolle 200 teruggeven —
    // "niet 403" alleen zou een 404/500 stilzwijgend accepteren.
    for (const route of BEDRAGEN_ONLY_ROUTES) {
      const res = await request.get(`/api/opdrachten/${opdrachtId}/${route}`);
      expect(res.status(), `GET /${route}`).toBe(200);
    }
  });
});
