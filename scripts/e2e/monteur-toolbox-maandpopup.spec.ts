// E2E (monteur-app): verplichte-maandtoolbox-popup is geen deadlock meer (taak #1139).
//
// Reproductie van René's screenshot (18-08-2026): de uitstelperiode is
// verstreken, de popup blokkeert het hele scherm en "Toolbox nu doen" deed
// alleen router.push("/toolboxen") — waar de popup gewoon bleef liggen.
// Na de fix opent de knop de toolbox-detailflow zélf; een geslaagde afronding
// voltooit server-side ook de maandopdracht, waarna de popup verdwijnt.
//
// OPZET:
// - Eigen toolbox (gepubliceerd, 1 controlevraag) + maandopdracht voor de
//   huidige maand; de status van het testaccount krijgt eerste_aanbieding
//   4 dagen terug zodat kan_uitstellen=false (het blokkerende geval).
// - De test logt in, ziet de blokkerende popup, klikt "Toolbox nu doen",
//   doorloopt inhoud → quiz → handtekening → afronden, en controleert dat de
//   popup weg is én de maandstatus in de database voltooid is.
//
// Draaien: pnpm --filter @workspace/scripts run e2e-monteur
import { expect, test, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { authenticator } from "otplib";
import { Client } from "pg";

import {
  db,
  toolboxMaandOpdrachtenTable,
  toolboxMaandStatusTable,
  veiligheidToolboxenTable,
  veiligheidToolboxVragenTable,
  veiligheidToolboxAfrondingTable,
} from "@workspace/db";

import {
  setupE2eUurcodesAppAccount,
  archiveerE2eUurcodesAppAccount,
  E2E_UURCODES_APP_EMAIL,
  E2E_UURCODES_APP_WACHTWOORD,
  E2E_UURCODES_APP_TOTP_SECRET,
  wachtOpNieuwTotpVenster,
} from "../src/e2e-monteur-testaccount";

const INHOUD_TIMEOUT = 20_000;
const TOOLBOX_TITEL = "E2E Maandtoolbox 1139";

let gebruikerId = 0;
let toolboxId = 0;
let opdrachtId = 0;
let gebruikteBestaandeOpdracht = false;
let oorspronkelijkToolboxId: number | null = null;
let bestaandeStatussen: Array<typeof toolboxMaandStatusTable.$inferSelect> = [];
let maandSlot: Client | null = null;

async function ruimSeedOp() {
  if (toolboxId > 0) {
    // Cascade ruimt vragen, afrondingen, maandopdracht + statusrijen mee op.
    await db.delete(veiligheidToolboxenTable).where(eq(veiligheidToolboxenTable.id, toolboxId));
  }
  // Restanten van eerdere runs (op titel).
  const oude = await db
    .select({ id: veiligheidToolboxenTable.id })
    .from(veiligheidToolboxenTable)
    .where(eq(veiligheidToolboxenTable.titel, TOOLBOX_TITEL));
  for (const o of oude) {
    await db.delete(veiligheidToolboxenTable).where(eq(veiligheidToolboxenTable.id, o.id));
  }
}

test.beforeAll(async () => {
  maandSlot = new Client({ connectionString: process.env.DATABASE_URL });
  await maandSlot.connect();
  await maandSlot.query("SELECT pg_advisory_lock($1, $2)", [1193, 1139]);

  gebruikerId = await setupE2eUurcodesAppAccount();
  await ruimSeedOp();

  const [tb] = await db
    .insert(veiligheidToolboxenTable)
    .values({
      titel: TOOLBOX_TITEL,
      categorie: "brandveiligheid",
      geschatteLeestijd: 3,
      intro: "E2E-toolbox voor de maandpopup-regressietest.",
      minScore: 70,
      gepubliceerd: true,
      verplicht: true,
    })
    .returning({ id: veiligheidToolboxenTable.id });
  toolboxId = tb.id;

  await db.insert(veiligheidToolboxVragenTable).values({
    toolboxId,
    volgorde: 0,
    vraag: "Wat doe je bij brand?",
    opties: [
      { tekst: "Doorwerken", correct: false },
      { tekst: "Alarmeren en het pand verlaten", correct: true },
    ],
    uitleg: "Altijd eerst alarmeren.",
  });

  const nu = new Date();
  const [bestaand] = await db
    .select()
    .from(toolboxMaandOpdrachtenTable)
    .where(
      and(
        eq(toolboxMaandOpdrachtenTable.jaar, nu.getFullYear()),
        eq(toolboxMaandOpdrachtenTable.maand, nu.getMonth() + 1),
      ),
    )
    .limit(1);
  if (bestaand) {
    gebruikteBestaandeOpdracht = true;
    oorspronkelijkToolboxId = bestaand.toolboxId;
    opdrachtId = bestaand.id;
    bestaandeStatussen = await db
      .select()
      .from(toolboxMaandStatusTable)
      .where(
        and(
          eq(toolboxMaandStatusTable.opdrachtId, opdrachtId),
          eq(toolboxMaandStatusTable.gebruikerId, gebruikerId),
        ),
      );
    await db
      .update(toolboxMaandOpdrachtenTable)
      .set({ toolboxId })
      .where(eq(toolboxMaandOpdrachtenTable.id, bestaand.id));
  } else {
    const [opdr] = await db
      .insert(toolboxMaandOpdrachtenTable)
      .values({ toolboxId, jaar: nu.getFullYear(), maand: nu.getMonth() + 1 })
      .returning({ id: toolboxMaandOpdrachtenTable.id });
    opdrachtId = opdr.id;
  }

  // Alleen de status van het eigen e2e-account vervangen. De maandopdracht en
  // statussen van andere gebruikers blijven ongemoeid.
  await db.delete(toolboxMaandStatusTable).where(
    and(
      eq(toolboxMaandStatusTable.opdrachtId, opdrachtId),
      eq(toolboxMaandStatusTable.gebruikerId, gebruikerId),
    ),
  );

  // Uitstelperiode verstreken: eerste aanbieding 4 dagen terug → verplicht,
  // kan_uitstellen=false. Dit is exact het blokkerende geval van de melding.
  await db.insert(toolboxMaandStatusTable).values({
    opdrachtId,
    gebruikerId,
    eersteAanbieding: new Date(Date.now() - 4 * 86_400_000),
  });
});

test.afterAll(async () => {
  try {
    if (opdrachtId > 0) {
      await db.delete(toolboxMaandStatusTable).where(
        and(
          eq(toolboxMaandStatusTable.opdrachtId, opdrachtId),
          eq(toolboxMaandStatusTable.gebruikerId, gebruikerId),
        ),
      );
      if (gebruikteBestaandeOpdracht && oorspronkelijkToolboxId) {
        await db
          .update(toolboxMaandOpdrachtenTable)
          .set({ toolboxId: oorspronkelijkToolboxId })
          .where(eq(toolboxMaandOpdrachtenTable.id, opdrachtId));
        if (bestaandeStatussen.length > 0) {
          await db.insert(toolboxMaandStatusTable).values(bestaandeStatussen);
        }
      } else if (!gebruikteBestaandeOpdracht) {
        await db
          .delete(toolboxMaandOpdrachtenTable)
          .where(eq(toolboxMaandOpdrachtenTable.id, opdrachtId));
      }
    }
    await ruimSeedOp();
    await archiveerE2eUurcodesAppAccount();
  } finally {
    if (maandSlot) {
      await maandSlot
        .query("SELECT pg_advisory_unlock($1, $2)", [1193, 1139])
        .catch(() => undefined);
      await maandSlot.end().catch(() => undefined);
      maandSlot = null;
    }
  }
});

async function versTotp(minResterendeSec = 20): Promise<string> {
  const resterend = authenticator.timeRemaining();
  if (resterend < minResterendeSec) {
    await new Promise((r) => setTimeout(r, (resterend + 1) * 1000));
  }
  return authenticator.generate(E2E_UURCODES_APP_TOTP_SECRET);
}

function zichtbareTekst(page: Page, tekst: string | RegExp) {
  return page.getByText(tekst).filter({ visible: true });
}

// UI-login met retries op het TOTP-venster (zelfde patroon als startmenu.spec.ts).
// N.B. na inloggen ligt hier de maandpopup over het menu — we wachten dus op
// de popuptekst in plaats van het radiaal menu.
async function logIn(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem("fps_onboarding_voltooid", "1");
  });
  await page.goto("/");

  const email = page.getByTestId("login-email");
  const wachtwoord = page.getByTestId("login-wachtwoord");
  const codeInvoer = page.getByTestId("login-code");
  await expect(email).toBeVisible({ timeout: 60_000 });
  await email.fill(E2E_UURCODES_APP_EMAIL);
  await wachtwoord.fill(E2E_UURCODES_APP_WACHTWOORD);

  for (let poging = 1; poging <= 3; poging++) {
    if (poging > 1) await wachtOpNieuwTotpVenster();
    const code = await versTotp();
    await codeInvoer.fill(code);
    const loginRespons = page.waitForResponse(
      (respons) =>
        respons.url().includes("/api/auth/mobile/login") &&
        respons.request().method() === "POST",
      { timeout: 30_000 },
    ).catch(() => null);
    await page.getByTestId("login-versturen").click();
    const respons = await loginRespons;

    if (respons?.status() === 200) {
      return;
    }
  }
  throw new Error("Inloggen mislukt na 3 TOTP-pogingen.");
}

test("app: verplichte maandtoolbox is vanuit de popup zelf af te ronden (geen deadlock)", async ({ page }) => {
  await test.step("inloggen — blokkerende popup verschijnt (uitstel verstreken)", async () => {
    await logIn(page);
    await expect(page.getByTestId("toolbox-maandpopup")).toBeVisible({ timeout: 90_000 });
    await expect(zichtbareTekst(page, "De uitstelperiode is verstreken").first()).toBeVisible({
      timeout: INHOUD_TIMEOUT,
    });
    await expect(zichtbareTekst(page, TOOLBOX_TITEL).first()).toBeVisible({ timeout: INHOUD_TIMEOUT });
    // Het blokkerende geval: geen uitstelknop meer.
    await expect(zichtbareTekst(page, "Uitstellen tot morgen")).toHaveCount(0);
  });

  await test.step("'Toolbox nu doen' opent de toolbox zelf (voorheen: niets)", async () => {
    await page.getByTestId("toolbox-maandpopup-start").click();
    const detail = page.getByTestId("toolbox-detail");
    await expect(detail).toBeVisible({ timeout: INHOUD_TIMEOUT });
    await expect(detail.getByText("Introductie", { exact: true })).toBeVisible({ timeout: INHOUD_TIMEOUT });
    await expect(detail.getByText("Naar controlevragen", { exact: true })).toBeVisible({ timeout: INHOUD_TIMEOUT });
  });

  await test.step("quiz doorlopen", async () => {
    const detail = page.getByTestId("toolbox-detail");
    await detail.getByText("Naar controlevragen", { exact: true }).click();
    await expect(detail.getByText("Wat doe je bij brand?", { exact: true })).toBeVisible({ timeout: INHOUD_TIMEOUT });
    await detail.getByText("Alarmeren en het pand verlaten", { exact: true }).click();
    await detail.getByText("Controleer", { exact: true }).click();
    await detail.getByText("Afronden", { exact: true }).click();
    await expect(detail.getByText("Quiz geslaagd", { exact: true })).toBeVisible({ timeout: INHOUD_TIMEOUT });
  });

  await test.step("handtekening en afronden", async () => {
    const detail = page.getByTestId("toolbox-detail");
    await page.getByTestId("toolbox-handtekening").fill("E2E Testmonteur 1139");
    const afrondRespons = page.waitForResponse(
      (respons) =>
        respons.url().includes(`/api/veiligheid/toolboxen/${toolboxId}/afronden`) &&
        respons.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByTestId("toolbox-bevestigen").click();
    expect((await afrondRespons).ok()).toBe(true);
    await expect(detail.getByText("Toolbox afgerond", { exact: true })).toBeVisible({ timeout: INHOUD_TIMEOUT });
    await page.getByTestId("toolbox-sluiten").click();
  });

  await test.step("popup is definitief weg — geen deadlock meer", async () => {
    await expect(zichtbareTekst(page, "Verplichte maandtoolbox")).toHaveCount(0, {
      timeout: INHOUD_TIMEOUT,
    });
    // Het menu is weer bereikbaar.
    await expect(page.getByTestId("radiaal-fps")).toBeVisible({ timeout: INHOUD_TIMEOUT });
  });

  await test.step("maandstatus in de database is voltooid (serverkoppeling)", async () => {
    const [status] = await db
      .select()
      .from(toolboxMaandStatusTable)
      .where(
        and(
          eq(toolboxMaandStatusTable.opdrachtId, opdrachtId),
          eq(toolboxMaandStatusTable.gebruikerId, gebruikerId),
        ),
      );
    expect(status?.voltooIdOp).toBeTruthy();

    const [afronding] = await db
      .select()
      .from(veiligheidToolboxAfrondingTable)
      .where(
        and(
          eq(veiligheidToolboxAfrondingTable.toolboxId, toolboxId),
          eq(veiligheidToolboxAfrondingTable.gebruikerId, gebruikerId),
        ),
      );
    expect(afronding).toBeTruthy();
    expect(afronding.score).toBe(1);
  });
});
