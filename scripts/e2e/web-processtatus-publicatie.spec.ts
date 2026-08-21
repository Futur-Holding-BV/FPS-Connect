import { expect, test, type Page } from "@playwright/test";
import { inArray, sql } from "drizzle-orm";

import {
  db,
  documentenTable,
  gebouwPartijenTable,
  gebouwPublicatiesTable,
  gebouwenTable,
  modCalcHeadersTable,
  offerteHandtekeningenTable,
  offertesTable,
  opdrachtenTable,
  opleverrapportenTable,
} from "@workspace/db";
import { programmatischInloggen } from "./web-api-proxy";
import {
  E2E_WEB_ADMIN_EMAIL,
  E2E_WEB_ADMIN_WACHTWOORD,
  E2E_WEB_ADMIN_TOTP_SECRET,
  setupE2eWebAdminAccount,
} from "../src/e2e-monteur-testaccount";

const TIMEOUT = 20_000;
const TAG = `T1198-${Date.now()}`;
const labels = ["Concept", "Intern akkoord", "Offerte", "Opdracht", "Uitvoering", "Oplevering"] as const;

type Fixture = {
  gebouwId: number;
  calcId: number;
  reportIds: number[];
  offerId: number | null;
  orderId: number | null;
  docIds: number[];
};

const blocked: Fixture = { gebouwId: 0, calcId: 0, reportIds: [], offerId: null, orderId: null, docIds: [] };
const eligible: Fixture = { gebouwId: 0, calcId: 0, reportIds: [], offerId: null, orderId: null, docIds: [] };
const ambiguous: Fixture = { gebouwId: 0, calcId: 0, reportIds: [], offerId: null, orderId: null, docIds: [] };

async function logIn(page: Page): Promise<void> {
  await programmatischInloggen(page, E2E_WEB_ADMIN_EMAIL, E2E_WEB_ADMIN_WACHTWOORD, E2E_WEB_ADMIN_TOTP_SECRET);
}

function attachDebug(page: Page) {
  const consoleMessages: string[] = [];
  const failedRequests: string[] = [];
  const httpErrors: Array<{ status: number; url: string }> = [];
  const pageErrors: string[] = [];
  page.on("console", (msg) => consoleMessages.push(`[${msg.type()}] ${msg.text()}`));
  page.on("requestfailed", (req) => {
    failedRequests.push(`${req.method()} ${req.url()} :: ${req.failure()?.errorText ?? "failed"}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      httpErrors.push({ status: response.status(), url: response.url() });
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  return { consoleMessages, failedRequests, httpErrors, pageErrors };
}

async function seedBlocked(): Promise<void> {
  const [g] = await db.insert(gebouwenTable).values({
    naam: `Geblokkeerd ${TAG}`,
    adres: "Blokkerstraat 1",
    stad: "Teststad",
    bron: "handmatig",
  }).returning({ id: gebouwenTable.id });
  blocked.gebouwId = g.id;
  const [c] = await db.insert(modCalcHeadersTable).values({
    naam: `Geblokkeerd calc ${TAG}`,
    gebouwId: g.id,
    status: "verloren",
  }).returning({ id: modCalcHeadersTable.id });
  blocked.calcId = c.id;
}

async function seedReady(
  target: Fixture,
  metDubbelActueelRapport = false,
): Promise<void> {
  const [g] = await db.insert(gebouwenTable).values({
    naam: `${metDubbelActueelRapport ? "Tegenstrijdig" : "Publiseerbaar"} ${TAG}`,
    adres: "Goedgekeurdelaan 2",
    stad: "Teststad",
    bron: "handmatig",
  }).returning({ id: gebouwenTable.id });
  target.gebouwId = g.id;
  const [c] = await db.insert(modCalcHeadersTable).values({
    naam: `Publiseerbaar calc ${TAG}`,
    gebouwId: g.id,
    status: "intern_akkoord",
  }).returning({ id: modCalcHeadersTable.id });
  target.calcId = c.id;

  const [docA] = await db.insert(documentenTable).values({
    naam: `Bijlage ${TAG}`,
    documenttype: "testrapport",
    status: "actueel",
    goedkeuringStatus: "goedgekeurd",
  }).returning({ id: documentenTable.id });
  const [docB] = await db.insert(documentenTable).values({
    naam: `Tekening ${TAG}`,
    documenttype: "testrapport",
    status: "actueel",
    goedkeuringStatus: "goedgekeurd",
  }).returning({ id: documentenTable.id });
  target.docIds.push(docA.id, docB.id);

  await db.insert(gebouwPartijenTable).values({
    gebouwId: g.id,
    type: "opdrachtgever",
    naam: `Opdrachtgever ${TAG}`,
    organisatie: `Acme Vastgoed ${TAG}`,
  });
  await db.insert(gebouwPartijenTable).values({
    gebouwId: g.id,
    type: "contactpersoon",
    naam: `Ontvanger ${TAG}`,
    organisatie: `Acme Inspectie ${TAG}`,
    email: `m.ontvanger.${TAG}@acme.test`,
  });

  const [r] = await db.insert(opleverrapportenTable).values({
    gebouwId: g.id,
    rapportType: "opleverrapport",
    status: "definitief",
    titel: `Definitief rapport ${TAG}`,
    bevrorenOp: new Date(),
    bijlagenIds: [docA.id],
    tekeningIds: [docB.id],
    bevrorenDocumentRevisies: {
      [docA.id]: { revisie_nummer: 1, naam: `Bijlage ${TAG}` },
      [docB.id]: { revisie_nummer: 1, naam: `Tekening ${TAG}` },
    },
  }).returning({ id: opleverrapportenTable.id });
  target.reportIds.push(r.id);
  if (metDubbelActueelRapport) {
    const [tweedeRapport] = await db.insert(opleverrapportenTable).values({
      gebouwId: g.id,
      rapportType: "opleverrapport",
      status: "definitief",
      titel: `Tweede definitief rapport ${TAG}`,
      bevrorenOp: new Date(),
      bijlagenIds: [docA.id],
      tekeningIds: [docB.id],
      bevrorenDocumentRevisies: {
        [docA.id]: { revisie_nummer: 1, naam: `Bijlage ${TAG}` },
        [docB.id]: { revisie_nummer: 1, naam: `Tekening ${TAG}` },
      },
    }).returning({ id: opleverrapportenTable.id });
    target.reportIds.push(tweedeRapport.id);
  }

  const [o] = await db.insert(offertesTable).values({
    gebouwId: g.id,
    calculatieId: c.id,
    titel: `Offerte ${TAG}`,
    opdrachtgever: `Acme Vastgoed ${TAG}`,
    status: "ondertekend",
    portaalStatus: "ondertekend",
    bedragExclBtw: 1000,
    bedragInclBtw: 1210,
    verzendType: "ondertekening",
  }).returning({ id: offertesTable.id });
  target.offerId = o.id;
  await db.insert(offerteHandtekeningenTable).values({
    offerteId: o.id,
    naam: "Test Ondertekenaar",
    bedrijf: `Acme Vastgoed ${TAG}`,
    datum: "2026-08-21",
    handtekeningDataUrl: "data:image/png;base64,AAAA",
    versienummer: 1,
  });

  const [opd] = await db.insert(opdrachtenTable).values({
    gebouwId: g.id,
    calculatieId: c.id,
    offerteId: o.id,
    titel: `Opdracht ${TAG}`,
    opdrachtgever: `Acme Vastgoed ${TAG}`,
    status: "afgerond",
    akkoordGrond: "ondertekening",
    akkoordOp: new Date(),
  }).returning({ id: opdrachtenTable.id });
  target.orderId = opd.id;
}

async function cleanupFixture(f: Fixture): Promise<void> {
  if (f.offerId) await db.delete(offerteHandtekeningenTable).where(sql`${offerteHandtekeningenTable.offerteId} = ${f.offerId}`);
  if (f.orderId) await db.delete(opdrachtenTable).where(sql`${opdrachtenTable.id} = ${f.orderId}`);
  if (f.offerId) await db.delete(offertesTable).where(sql`${offertesTable.id} = ${f.offerId}`);
  if (f.gebouwId) await db.delete(gebouwPartijenTable).where(sql`${gebouwPartijenTable.gebouwId} = ${f.gebouwId}`);
  if (f.reportIds.length > 0) {
    await db.delete(opleverrapportenTable).where(inArray(opleverrapportenTable.id, f.reportIds));
  }
  if (f.docIds.length > 0) await db.delete(documentenTable).where(inArray(documentenTable.id, f.docIds));
  if (f.calcId) await db.delete(modCalcHeadersTable).where(sql`${modCalcHeadersTable.id} = ${f.calcId}`);
  if (f.gebouwId) {
    await db.delete(gebouwPublicatiesTable).where(sql`${gebouwPublicatiesTable.gebouwId} = ${f.gebouwId}`);
    await db.delete(gebouwenTable).where(sql`${gebouwenTable.id} = ${f.gebouwId}`);
  }
}

async function noOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    return Math.max(root.scrollWidth, body?.scrollWidth ?? 0) <= root.clientWidth;
  });
}

async function verifyProcessOverview(
  page: Page,
  expectedCurrentLabel?: string,
): Promise<void> {
  await expect(page.getByTestId("server-process-overview")).toBeVisible({ timeout: TIMEOUT });
  await expect(page.getByTestId("process-current-step")).toBeVisible();
  if (expectedCurrentLabel) {
    await expect(page.getByTestId("process-current-step")).toContainText(
      `Huidige stap: ${expectedCurrentLabel}`,
    );
  }
  await expect(page.getByTestId("process-open-action")).toBeVisible();
  await expect(page.getByTestId("process-financial")).toBeVisible();
  await expect(page.getByTestId("process-future-phases")).toBeVisible();
  const shown = await page.locator('[data-testid^="proces-stap-"]').allTextContents();
  expect(shown.map((t) => t.trim())).toEqual(labels);
}

async function openRouteOrDump(
  page: Page,
  debug: { consoleMessages: string[]; failedRequests: string[] },
  href: string,
): Promise<void> {
  await page.goto(href);
  const current = new URL(page.url());
  if (!current.pathname.startsWith(new URL(href, "https://example.invalid").pathname)) {
    console.log("NAV-DIAG", {
      href,
      url: page.url(),
      title: await page.title().catch(() => ""),
      console: debug.consoleMessages,
      failed: debug.failedRequests,
    });
    throw new Error(`Navigation snapped away from ${href}`);
  }
}

test.beforeAll(async () => {
  await setupE2eWebAdminAccount();
  await seedBlocked();
  await seedReady(eligible);
  await seedReady(ambiguous, true);
});

test.afterAll(async () => {
  await cleanupFixture(ambiguous);
  await cleanupFixture(eligible);
  await cleanupFixture(blocked);
});

test("Web: processtatus, publicatie en intrekking blijven consistent op desktop én mobiel", async ({ page }) => {
  test.setTimeout(240_000);
  page.setDefaultTimeout(10_000);
  const debug = attachDebug(page);
  await logIn(page);

  await test.step("blocked gebouw: processtatus en publicatieblokker op desktop", async () => {
    await openRouteOrDump(page, debug, `/gebouwen/${blocked.gebouwId}`);
    await verifyProcessOverview(page, "Concept");

    const processResponse = await page.request.get(
      `/api/gebouwen/${blocked.gebouwId}/processtatus`,
    );
    expect(processResponse.status()).toBe(200);
    const processJson = await processResponse.json();
    expect(processJson.huidige_stap).toBe("concept");
    expect(processJson.all_afgerond).toBe(false);
    expect(processJson.fasen.map((fase: { label: string }) => fase.label)).toEqual(labels);

    const previewResponse = await page.request.get(
      `/api/gebouwen/${blocked.gebouwId}/publicatie/preview`,
    );
    expect(previewResponse.status()).toBe(200);
    const previewJson = await previewResponse.json();
    expect(previewJson).toMatchObject({
      mag_publiceren: false,
      blocker: {
        code: "geen_calculatie",
        message: "Er is nog geen calculatie aangemaakt voor dit gebouw.",
        action_path: `/gebouwen/${blocked.gebouwId}?tab=calculaties`,
        action_label: "Calculatie aanmaken",
      },
    });

    const publishResponse = await page.request.post(
      `/api/gebouwen/${blocked.gebouwId}/publiceer`,
      { data: {} },
    );
    expect(publishResponse.status()).toBe(422);
    expect(await publishResponse.json()).toMatchObject({
      error: previewJson.blocker.message,
      code: previewJson.blocker.code,
      action_path: previewJson.blocker.action_path,
      action_label: previewJson.blocker.action_label,
    });

    await expect(page.getByTestId("publicatie-open-preview")).toBeDisabled();
    const blocker = page.getByTestId("publicatie-blocker");
    await expect(blocker).toContainText(previewJson.blocker.message);
    await expect(blocker.getByRole("link", { name: "Calculatie aanmaken" })).toHaveAttribute(
      "href",
      previewJson.blocker.action_path,
    );
    await expect(page.getByTestId("process-open-action")).toContainText("Calculatie aanmaken");
    await expect(page.getByTestId("header-process-status")).toContainText("Proces: Concept");
    const futureText = await page.getByTestId("process-future-phases").textContent();
    expect(futureText).toContain("Intern akkoord");
    expect(futureText).toContain("Offerte");
    expect(futureText).toContain("Opdracht");
    expect(futureText).toContain("Uitvoering");
    expect(futureText).toContain("Oplevering");
  });

  await test.step("tegenstrijdige actuele rapporten blokkeren preview en directe publicatie identiek", async () => {
    const previewResponse = await page.request.get(
      `/api/gebouwen/${ambiguous.gebouwId}/publicatie/preview`,
    );
    expect(previewResponse.status()).toBe(200);
    const previewJson = await previewResponse.json();
    expect(previewJson).toMatchObject({
      mag_publiceren: false,
      blocker: {
        code: "meerdere_definitieve_rapporten",
        message:
          "Er zijn meerdere huidige definitieve bevroren opleverrapporten. Stel één rapport in als het gezaghebbende/actuele rapport voordat u kunt publiceren.",
        action_path: `/gebouwen/${ambiguous.gebouwId}?tab=rapporten`,
        action_label: "Opleverrapporten controleren",
      },
    });
    expect(previewJson.content_items).toEqual([
      expect.objectContaining({ type: "gebouw_data", bron_id: null }),
    ]);

    const publishResponse = await page.request.post(
      `/api/gebouwen/${ambiguous.gebouwId}/publiceer`,
      { data: {} },
    );
    expect(publishResponse.status()).toBe(422);
    expect(await publishResponse.json()).toMatchObject({
      error: previewJson.blocker.message,
      code: previewJson.blocker.code,
      action_path: previewJson.blocker.action_path,
      action_label: previewJson.blocker.action_label,
    });
  });

  await test.step("blocked gebouw: dashboard, Gebouw-tab en calculatie-detail herhalen dezelfde server-process-overview op mobiel 390px zonder overflow", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openRouteOrDump(page, debug, `/gebouwen/${blocked.gebouwId}`);
    await verifyProcessOverview(page, "Concept");
    expect(await noOverflow(page)).toBe(true);

    await page.getByRole("tab", { name: "Gebouw" }).click();
    await expect(page.getByTestId("project-segment-project")).toBeVisible({ timeout: TIMEOUT });
    await verifyProcessOverview(page, "Concept");
    expect(await noOverflow(page)).toBe(true);

    await page.getByRole("tab", { name: /^Dash/i }).click();
    await expect(page.getByTestId("project-segment-dashboard")).toBeVisible({ timeout: TIMEOUT });
    await verifyProcessOverview(page, "Concept");
    expect(await noOverflow(page)).toBe(true);

    await page.getByRole("button", { name: /^Calculaties/i }).first().click();
    await expect(page.getByTestId("project-segment-calculaties")).toBeVisible({ timeout: TIMEOUT });
    expect(await noOverflow(page)).toBe(true);

    const calcLink = page.locator(`a[href="/modules/calculatie/${blocked.calcId}"]`);
    await expect(calcLink).toBeVisible({ timeout: TIMEOUT });
    await calcLink.click();
    await expect(page).toHaveURL(new RegExp(`/modules/calculatie/${blocked.calcId}$`));
    await expect(page.getByTestId("server-process-overview")).toBeVisible({ timeout: TIMEOUT });
    await verifyProcessOverview(page, "Concept");
    expect(await noOverflow(page)).toBe(true);
  });

  await test.step("eligible gebouw: preview, publiceren, intrekken en statuscontrole", async () => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openRouteOrDump(page, debug, `/gebouwen/${eligible.gebouwId}`);
    await verifyProcessOverview(page);

    const preview = await page.request.get(`/api/gebouwen/${eligible.gebouwId}/publicatie/preview`);
    const previewJson = await preview.json();
    expect(previewJson).toMatchObject({
      mag_publiceren: true,
      blocker: null,
      bestemming: "FPS One",
      opdrachtgever: `Acme Vastgoed ${TAG}`,
      gevolg_tekst: expect.stringContaining("Na publicatie is het gebouwdossier zichtbaar"),
    });
    expect(previewJson.ontvangers).toHaveLength(1);
    expect(previewJson.ontvangers[0]).toMatchObject({
      naam: `Ontvanger ${TAG}`,
      email: `m.ontvanger.${TAG}@acme.test`,
    });
    expect(previewJson.content_items).toHaveLength(4);

    await expect(page.getByTestId("publicatie-open-preview")).toBeEnabled();
    await page.getByTestId("publicatie-open-preview").click();
    const modal = page.getByTestId("publicatie-preview");
    await expect(modal).toBeVisible({ timeout: TIMEOUT });
    await expect(modal).toContainText("Bevestig publicatie");
    await expect(modal).toContainText(`Bestemming: FPS One`);
    await expect(modal).toContainText(`Opdrachtgever: Acme Vastgoed ${TAG}`);
    await expect(modal).toContainText(`Ontvangers:`);
    await expect(modal).toContainText(`Gebouwgegevens`);
    await expect(modal).toContainText(`Definitief rapport ${TAG} (definitief)`);
    await expect(modal).toContainText(`Tekening: Tekening ${TAG}`);
    await expect(modal).toContainText(`Na publicatie is het gebouwdossier zichtbaar voor FPS One-gebruikers`);
    await modal.getByTestId("publicatie-confirm").click();
    await expect(page.getByTestId("publicatie-open-preview")).toContainText("Publicatie intrekken");

    await page.getByTestId("publicatie-open-preview").click();
    await expect(page.getByTestId("publicatie-preview")).toContainText("Bevestig intrekking");
    await expect(page.getByTestId("publicatie-preview")).toContainText("Bronbestanden en documenten blijven bewaard in FPS Connect");
    await page.getByTestId("publicatie-withdraw-confirm").click();
    const st = await page.request.get(`/api/gebouwen/${eligible.gebouwId}/publicatiestatus`);
    expect(await st.json()).toMatchObject({
      gepubliceerd: false,
      gepubliceerd_op: null,
      ingetrokken_op: expect.any(String),
    });

    const reportCount = await db.execute(sql`SELECT count(*)::int AS n FROM opleverrapporten WHERE id = ${eligible.reportIds[0]}`);
    const docCount = await db.execute(sql`SELECT count(*)::int AS n FROM documenten WHERE id IN (${eligible.docIds[0]}, ${eligible.docIds[1]})`);
    expect(Number((reportCount.rows[0] as any).n)).toBe(1);
    expect(Number((docCount.rows[0] as any).n)).toBe(2);
  });

  await test.step("eligible gebouw: mobiele overflow blijft weg op dashboard, Gebouw-tab en calculatie-detail", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openRouteOrDump(page, debug, `/gebouwen/${eligible.gebouwId}`);
    await expect(page.getByTestId("server-process-overview")).toBeVisible({ timeout: TIMEOUT });
    expect(await noOverflow(page)).toBe(true);

    await page.getByRole("tab", { name: "Gebouw" }).click();
    await expect(page.getByTestId("project-segment-project")).toBeVisible({ timeout: TIMEOUT });
    expect(await noOverflow(page)).toBe(true);

    await page.getByRole("tab", { name: /^Dash/i }).click();
    await expect(page.getByTestId("project-segment-dashboard")).toBeVisible({ timeout: TIMEOUT });
    await verifyProcessOverview(page);
    expect(await noOverflow(page)).toBe(true);

    await page.getByRole("button", { name: /^Calculaties/i }).first().click();
    await expect(page.getByTestId("project-segment-calculaties")).toBeVisible({ timeout: TIMEOUT });
    expect(await noOverflow(page)).toBe(true);

    await page.locator(`a[href="/modules/calculatie/${eligible.calcId}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/modules/calculatie/${eligible.calcId}$`));
    await expect(page.getByTestId("server-process-overview")).toBeVisible({ timeout: TIMEOUT });
    expect(await noOverflow(page)).toBe(true);
  });

  await test.step("browser blijft vrij van console- en netwerkfouten", async () => {
    const onverwachteHttpFouten = debug.httpErrors.filter(({ status, url }) => {
      const pad = new URL(url).pathname;
      return !(
        (status === 404 && /\/api\/gebouwen\/\d+\/emails\/samenvatting$/.test(pad)) ||
        (status === 403 && pad === "/api/documenten/gekoppeld")
      );
    });
    const onverwachteConsoleFouten = debug.consoleMessages.filter(
      (melding) =>
        melding.startsWith("[error]") &&
        !melding.includes("Failed to load resource: the server responded with a status of 404") &&
        !melding.includes("Failed to load resource: the server responded with a status of 403"),
    );
    const onverwachtMislukteRequests = debug.failedRequests.filter(
      (request) => !request.endsWith(":: net::ERR_ABORTED"),
    );
    expect(onverwachteHttpFouten).toEqual([]);
    expect(onverwachteConsoleFouten).toEqual([]);
    expect(onverwachtMislukteRequests).toEqual([]);
    expect(debug.pageErrors).toEqual([]);
  });
});