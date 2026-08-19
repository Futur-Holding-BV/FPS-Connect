import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

import {
  archiveerE2eTelefoonProfielen,
  E2E_TELEFOON_ADMIN_EMAIL,
  E2E_TELEFOON_ADMIN_TOTP_SECRET,
  E2E_TELEFOON_ADMIN_WACHTWOORD,
  E2E_TELEFOON_KANTOOR_EMAIL,
  E2E_TELEFOON_KANTOOR_TOTP_SECRET,
  E2E_TELEFOON_KANTOOR_WACHTWOORD,
  E2E_TELEFOON_VELD_EMAIL,
  E2E_TELEFOON_VELD_TOTP_SECRET,
  E2E_TELEFOON_VELD_WACHTWOORD,
  genereerVersTotpVoor,
  setupE2eTelefoonProfielen,
  wachtOpNieuwTotpVenster,
} from "../src/e2e-monteur-testaccount";

const API_BASIS = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const EIGEN_ZAKEN = [
  "verlof",
  "uren",
  "declaraties",
  "loonstrookjes",
  "certificaten",
  "opleidingen",
] as const;

type Profiel = {
  email: string;
  wachtwoord: string;
  secret: string;
};

type LoginResultaat = {
  token: string;
  gebruiker: {
    rol: string;
    is_uitvoerend_veld: boolean;
  };
};

async function logIn(page: Page, profiel: Profiel): Promise<LoginResultaat> {
  await page.addInitScript(() => {
    window.localStorage.setItem("fps_onboarding_voltooid", "1");
  });
  await page.goto("/");

  const inputs = page.locator("input");
  await expect(inputs.nth(0)).toBeVisible({ timeout: 60_000 });
  await inputs.nth(0).fill(profiel.email);
  await inputs.nth(1).fill(profiel.wachtwoord);

  for (let poging = 1; poging <= 3; poging++) {
    await inputs.nth(2).fill(await genereerVersTotpVoor(profiel.secret));
    const loginRespons = page
      .waitForResponse(
        (respons) =>
          respons.url().includes("/api/auth/mobile/login") &&
          respons.request().method() === "POST",
        { timeout: 30_000 },
      )
      .catch(() => null);
    await page.getByText("Inloggen", { exact: true }).click();
    const respons = await loginRespons;

    if (respons?.status() === 200) {
      const resultaat = (await respons.json()) as LoginResultaat;
      expect(resultaat.token).toBeTruthy();
      await expect(page.getByTestId("radiaal-fps")).toBeVisible({ timeout: 90_000 });
      return resultaat;
    }

    if (poging < 3) {
      if (respons) await wachtOpNieuwTotpVenster();
      else await page.waitForTimeout(3_000);
    }
  }

  throw new Error("Mobiel inloggen gaf na drie pogingen geen geslaagde response.");
}

async function openMeer(page: Page): Promise<void> {
  await page.getByTestId("radiaal-sluiten").click();
  await page.getByText("Meer", { exact: true }).click();
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await setupE2eTelefoonProfielen();
});

test.afterAll(async () => {
  await archiveerE2eTelefoonProfielen();
});

test("veldprofiel behoudt werkmenu en krijgt alle eigen zaken", async ({ page }) => {
  const login = await logIn(page, {
    email: E2E_TELEFOON_VELD_EMAIL,
    wachtwoord: E2E_TELEFOON_VELD_WACHTWOORD,
    secret: E2E_TELEFOON_VELD_TOTP_SECRET,
  });
  expect(login.gebruiker.is_uitvoerend_veld).toBe(true);

  await expect(page.getByTestId("radiaal-werkdag")).toBeVisible();
  await expect(page.getByTestId("radiaal-mijn_werk")).toBeVisible();
  await openMeer(page);

  for (const sleutel of EIGEN_ZAKEN) {
    const inHoofdmenu = await page.getByTestId(`radiaal-${sleutel}`).count();
    const ingang = inHoofdmenu
      ? page.getByTestId(`radiaal-${sleutel}`)
      : page.getByTestId(`meer-${sleutel}`);
    await expect(ingang).toBeAttached();
  }
});

test("kantoor zonder extra rechten blijft in de telefoonapp en ziet alleen eigen zaken als hoofdmenu", async ({ page }) => {
  const login = await logIn(page, {
    email: E2E_TELEFOON_KANTOOR_EMAIL,
    wachtwoord: E2E_TELEFOON_KANTOOR_WACHTWOORD,
    secret: E2E_TELEFOON_KANTOOR_TOTP_SECRET,
  });
  expect(login.gebruiker.is_uitvoerend_veld).toBe(false);

  for (const sleutel of EIGEN_ZAKEN) {
    await expect(page.getByTestId(`radiaal-${sleutel}`)).toBeVisible();
  }
  await expect(page.getByTestId("radiaal-werkdag")).toHaveCount(0);
  await expect(page.getByTestId("radiaal-mijn_werk")).toHaveCount(0);
  await openMeer(page);
  await expect(page.getByTestId("meer-opname")).toHaveCount(0);

  const headers = { Authorization: `Bearer ${login.token}` };
  const eigenRoutes = [
    "/api/mijn/medewerker",
    "/api/mijn/certificaten",
    "/api/mijn/opleidingen",
    "/api/mijn/verlofsoorten",
    "/api/mijn/verlofsaldi",
    "/api/mijn/verlofaanvragen",
    "/api/mijn/declaraties",
    "/api/mijn/salarisdocumenten",
    "/api/uren/mijn-week",
  ];
  for (const route of eigenRoutes) {
    const respons = await page.request.get(`${API_BASIS}${route}`, { headers });
    expect(respons.status(), route).toBe(200);
  }

  // De beheer-catalogus blijft achter personeelrecht; alleen /mijn/opleidingen
  // is voor deze gewone medewerker beschikbaar.
  const catalogus = await page.request.get(`${API_BASIS}/api/opleidingen`, { headers });
  expect(catalogus.status()).toBe(403);

  await page.evaluate(() => {
    (
      window as typeof window & { __FPS_NAVIGEER__?: (pad: string) => void }
    ).__FPS_NAVIGEER__?.("/hrm/certificaten");
  });
  await expect(page.getByText("Mijn certificaten", { exact: true }).filter({ visible: true }))
    .toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("VCA", { exact: true }).filter({ visible: true })).toBeVisible();
});

test("hoofdbeheerder heeft telefoon-eigen-zaken plus module-ingangen", async ({ page }) => {
  const login = await logIn(page, {
    email: E2E_TELEFOON_ADMIN_EMAIL,
    wachtwoord: E2E_TELEFOON_ADMIN_WACHTWOORD,
    secret: E2E_TELEFOON_ADMIN_TOTP_SECRET,
  });
  expect(login.gebruiker.rol).toBe("hoofdbeheerder");
  expect(login.gebruiker.is_uitvoerend_veld).toBe(false);

  for (const sleutel of EIGEN_ZAKEN) {
    await expect(page.getByTestId(`radiaal-${sleutel}`)).toBeVisible();
  }
  await openMeer(page);
  await expect(page.getByTestId("meer-personeel")).toBeAttached();
  await expect(page.getByTestId("meer-magazijn")).toBeAttached();
});

test("desktopafsluiting voor veldfuncties blijft ongewijzigd", async () => {
  const bron = await readFile(
    new URL("../../artifacts/firevault/src/routes/connect-routes.tsx", import.meta.url),
    "utf8",
  );
  expect(bron).toContain("VELD_GEBLOKKEERDE_PREFIXEN");
  expect(bron).toContain("is_uitvoerend_veld: isUitvoerendVeld");
  expect(bron).toContain("return <VeldwerkOmleiding />");

  const appLayout = await readFile(
    new URL("../../artifacts/monteur-app/app/_layout.tsx", import.meta.url),
    "utf8",
  );
  expect(appLayout).not.toContain("window.location.replace");
});