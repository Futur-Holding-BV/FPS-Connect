// Regressie: de compacte Slim Upload-ingang mag een aanvraag uitsluitend als
// voorstel klaarzetten. Het gebouw en de offerte ontstaan pas na menselijke
// beoordeling op /crm/aanvragen.
import { expect, test, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";

import { aanvraagVoorstellenTable } from "@workspace/db/schema";
import { db, werkgeversTable } from "@workspace/db";
import { programmatischInloggen } from "./web-api-proxy";
import {
  E2E_WEB_ADMIN_EMAIL,
  E2E_WEB_ADMIN_WACHTWOORD,
  E2E_WEB_ADMIN_TOTP_SECRET,
  setupE2eWebAdminAccount,
} from "../src/e2e-monteur-testaccount";

const MERK = `E2E Slim aanvraag ${Date.now()}`;
let voorstelId = 0;
let werkgeverId = 0;
let werkgeverNaam = "";

async function logIn(page: Page): Promise<void> {
  await programmatischInloggen(
    page,
    E2E_WEB_ADMIN_EMAIL,
    E2E_WEB_ADMIN_WACHTWOORD,
    E2E_WEB_ADMIN_TOTP_SECRET,
  );
  await page.goto("/crm/aanvragen");
}

test.beforeAll(async () => {
  const gebruikerId = await setupE2eWebAdminAccount();
  const [werkgever] = await db
    .select({ id: werkgeversTable.id, naam: werkgeversTable.naam })
    .from(werkgeversTable)
    .limit(1);
  if (!werkgever) throw new Error("Geen werkmaatschappij beschikbaar voor Slim Upload-regressie.");
  werkgeverId = werkgever.id;
  werkgeverNaam = werkgever.naam;

  const [voorstel] = await db
    .insert(aanvraagVoorstellenTable)
    .values({
      gebruikerId,
      mailMessageId: `e2e-slim-upload:${MERK}`,
      mailboxAdres: werkgeverNaam,
      afzenderNaam: "E2E Aanvrager",
      afzenderEmail: "e2e-slim-aanvraag@test.local",
      onderwerp: MERK,
      binnengekomenOp: new Date(),
      voorstelType: "nieuwe_aanvraag",
      status: "open",
      werkmaatschappijId: werkgeverId,
      aiVoorstel: {
        titel: MERK,
        werkzaamheden: "Brongebonden testaanvraag",
      },
    })
    .returning({ id: aanvraagVoorstellenTable.id });
  voorstelId = voorstel.id;
});

test.afterAll(async () => {
  if (voorstelId) {
    await db.delete(aanvraagVoorstellenTable).where(eq(aanvraagVoorstellenTable.id, voorstelId));
  }
});

test("Slim Upload zet een aanvraagvoorstel klaar en opent de menselijke beoordeling", async ({ page }) => {
  test.setTimeout(90_000);
  let aanvraagMultipart = "";

  // programmatischInloggen installeert zelf een brede /api/*-proxy. Registreer
  // de twee gerichte stubs daarna, zodat zij als laatste route als eerste matchen.
  await logIn(page);

  await page.route("**/api/slim-upload/analyseer", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        categorie: "aanvraag",
        voorstel_naam: MERK,
        redenering: "Het bronbestand bevat een expliciete aanvraag.",
        vertrouwen: "hoog",
        ai_beschikbaar: true,
        vision_gebruikt: false,
        tekst_gevonden: true,
        ai_model: "e2e-deterministisch",
        gevonden_gegevens: { gebouw_naam: MERK },
        alternatieven: [],
        organisatie: "E2E Aanvrager",
        impact_niveau: "laag",
        impact_omschrijving: "Alleen een voorstel wordt klaargezet.",
        vereist_bevestiging: false,
        directe_actie_beschrijving: "Menselijke beoordeling openen.",
        mag_uploaden: true,
        beperkingen: [],
      }),
    });
  });

  await page.route("**/api/inbox/offerte-aanvraag", async (route) => {
    aanvraagMultipart = route.request().postData() ?? "";
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        inbox_item: {
          id: 0,
          bestandsnaam: "slim-aanvraag.eml",
          bestandspad: "/objects/e2e/slim-aanvraag.eml",
          status: "nieuw",
        },
        voorstel_id: voorstelId,
        ai_samenvatting: null,
        aangemaakt: { voorstel: true },
      }),
    });
  });

  // De vaste nieuwsticker kan de kleine onderbalkknop visueel overlappen.
  // Activeer de knop daarom zoals een toetsenbord-/programmatische klik.
  await page.getByRole("button", { name: "Slim uploaden" }).dispatchEvent("click");
  await page.locator('input[type="file"][multiple]').setInputFiles({
    name: "slim-aanvraag.eml",
    mimeType: "message/rfc822",
    buffer: Buffer.from(
      [
        "From: E2E Aanvrager <e2e-slim-aanvraag@test.local>",
        `Subject: ${MERK}`,
        "",
        "Graag ontvangen wij een offerte voor brandwerende werkzaamheden.",
      ].join("\r\n"),
    ),
  });

  await expect(page.getByText("Aanvraagvoorstel klaarzetten", { exact: true })).toBeVisible();
  await expect(page.getByText(/Koppelen aan bestaand gebouw/i)).toHaveCount(0);

  const werkgeverVeld = page
    .getByText("Werkmaatschappij", { exact: true })
    .locator("..");
  await werkgeverVeld.getByRole("combobox").click();
  await page.getByRole("option", { name: werkgeverNaam, exact: true }).click();
  await page.getByRole("button", { name: "Voorstel klaarzetten" }).click();

  await expect(
    page.getByRole("heading", { name: "Intake & Voorstel Accorderen" }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("input-titel")).toHaveValue(MERK);

  expect(aanvraagMultipart).toContain('name="werkmaatschappij_id"');
  expect(aanvraagMultipart).toContain(String(werkgeverId));
  expect(aanvraagMultipart).toContain('name="email"');
  expect(aanvraagMultipart).not.toContain("bestaand_gebouw_id");

  const [opgeslagenVoorstel] = await db
    .select({
      gebouwId: aanvraagVoorstellenTable.gebouwId,
      opnameId: aanvraagVoorstellenTable.opnameId,
      calculatieId: aanvraagVoorstellenTable.calculatieId,
    })
    .from(aanvraagVoorstellenTable)
    .where(eq(aanvraagVoorstellenTable.id, voorstelId));
  expect(opgeslagenVoorstel).toEqual({
    gebouwId: null,
    opnameId: null,
    calculatieId: null,
  });
});