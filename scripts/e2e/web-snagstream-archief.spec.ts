import { createHash, randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  gebouwenTable,
  snagstreamRapportenTable,
  snagstreamSnagsTable,
  snagstreamUploadsTable,
} from "@workspace/db";
import { programmatischInloggen } from "./web-api-proxy";
import {
  E2E_WEB_ADMIN_EMAIL,
  E2E_WEB_ADMIN_WACHTWOORD,
  E2E_WEB_ADMIN_TOTP_SECRET,
  setupE2eWebAccount,
  setupE2eWebAdminAccount,
} from "../src/e2e-monteur-testaccount";

const MARKER = `SNAG-E2E-${Date.now()}-${randomUUID().slice(0, 8)}`;
const BESTANDSNAAM = `${MARKER}.pdf`;
const rapportIds: number[] = [];
const uploadObjectPaden: string[] = [];
let gebouwId = 0;
let andereGebruikerId = 0;
let adminGebruikerId = 0;

function maakPdf(tekst: string): Buffer {
  return Buffer.from(
    `%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n% ${tekst}\n%%EOF\n`,
    "utf8",
  );
}

function sha256(inhoud: Buffer): string {
  return createHash("sha256").update(inhoud).digest("hex");
}

function opslagApiPad(objectPad: string): string {
  return `/api/storage/objects/${objectPad.replace(/^\/objects\//, "")}`;
}

async function vraagUploadAan(page: Page, bestandsnaam: string, inhoud: Buffer) {
  const vingerafdruk = sha256(inhoud);
  const aanvraag = await page.request.post("/api/snagstream/upload-url", {
    data: {
      bestandsnaam,
      bestandsgrootte: inhoud.length,
      vingerafdruk,
    },
  });
  expect(aanvraag.status()).toBe(200);
  const upload = await aanvraag.json() as {
    upload_url: string;
    object_path: string;
    upload_token: string;
  };
  uploadObjectPaden.push(upload.object_path);
  const opslag = await page.request.put(upload.upload_url, {
    headers: { "Content-Type": "application/pdf" },
    data: inhoud,
  });
  expect(opslag.status()).toBeGreaterThanOrEqual(200);
  expect(opslag.status()).toBeLessThan(300);
  return { ...upload, vingerafdruk };
}

async function maakRapport(
  page: Page,
  upload: Awaited<ReturnType<typeof vraagUploadAan>>,
  bestandsnaam: string,
  naamconflictBevestigd = false,
) {
  return page.request.post("/api/snagstream/rapporten", {
    data: {
      bestandsnaam,
      upload_token: upload.upload_token,
      vingerafdruk: upload.vingerafdruk,
      naamconflict_bevestigd: naamconflictBevestigd,
      gebouw_id: gebouwId,
    },
  });
}

test.beforeAll(async () => {
  adminGebruikerId = await setupE2eWebAdminAccount();
  andereGebruikerId = await setupE2eWebAccount();
  const [gebouw] = await db
    .insert(gebouwenTable)
    .values({ naam: MARKER, adres: "Snagstream E2E-straat 1" })
    .returning();
  gebouwId = gebouw!.id;
});

test.afterAll(async () => {
  if (rapportIds.length > 0) {
    await db.delete(snagstreamRapportenTable).where(inArray(snagstreamRapportenTable.id, rapportIds));
  }
  await db.delete(snagstreamUploadsTable).where(eq(snagstreamUploadsTable.bestandsnaam, BESTANDSNAAM));
  if (gebouwId) await db.delete(gebouwenTable).where(eq(gebouwenTable.id, gebouwId));
});

test("Snagstream-archief: tokenbinding, dedup, zoeken, koppelen en opslagcleanup", async ({ page }) => {
  test.setTimeout(180_000);
  await programmatischInloggen(
    page,
    E2E_WEB_ADMIN_EMAIL,
    E2E_WEB_ADMIN_WACHTWOORD,
    E2E_WEB_ADMIN_TOTP_SECRET,
  );

  const pdfA = maakPdf(`${MARKER} origineel`);
  const uploadA = await vraagUploadAan(page, BESTANDSNAAM, pdfA);
  const createA = await maakRapport(page, uploadA, BESTANDSNAAM);
  expect(createA.status()).toBe(201);
  const rapportA = await createA.json() as { id: number; pdf_url: string };
  rapportIds.push(rapportA.id);
  const [opslagEigenaarschap] = await db
    .select({
      opslagBeheerd: snagstreamRapportenTable.opslagBeheerd,
      pdfUrl: snagstreamRapportenTable.pdfUrl,
    })
    .from(snagstreamRapportenTable)
    .where(eq(snagstreamRapportenTable.id, rapportA.id));
  expect(opslagEigenaarschap?.opslagBeheerd).toBe(true);
  expect(opslagEigenaarschap?.pdfUrl).toMatch(/^\/objects\/snagstream\//);

  const exacteControle = await page.request.post("/api/snagstream/controleer-upload", {
    data: { bestandsnaam: BESTANDSNAAM, vingerafdruk: sha256(pdfA) },
  });
  expect(exacteControle.status()).toBe(200);
  expect((await exacteControle.json() as { uitkomst: string }).uitkomst).toBe("exact_dubbel");

  const pdfB = maakPdf(`${MARKER} andere inhoud`);
  const naamControle = await page.request.post("/api/snagstream/controleer-upload", {
    data: { bestandsnaam: BESTANDSNAAM, vingerafdruk: sha256(pdfB) },
  });
  expect(naamControle.status()).toBe(200);
  expect((await naamControle.json() as { uitkomst: string }).uitkomst).toBe("naamconflict");

  const uploadB = await vraagUploadAan(page, BESTANDSNAAM, pdfB);
  const conflict = await maakRapport(page, uploadB, BESTANDSNAAM);
  expect(conflict.status()).toBe(409);
  expect((await conflict.json() as { code: string }).code).toBe("naamconflict");
  const annulering = await page.request.post(
    `/api/snagstream/uploads/${uploadB.upload_token}/annuleren`,
  );
  expect(annulering.status()).toBe(204);
  expect(
    await db
      .select({ id: snagstreamUploadsTable.id })
      .from(snagstreamUploadsTable)
      .where(eq(snagstreamUploadsTable.token, uploadB.upload_token)),
  ).toHaveLength(0);
  expect((await page.request.get(opslagApiPad(uploadB.object_path))).status()).toBe(404);

  const uploadBBevestiging = await vraagUploadAan(page, BESTANDSNAAM, pdfB);
  const bevestiging = await maakRapport(page, uploadBBevestiging, BESTANDSNAAM, true);
  expect(bevestiging.status()).toBe(201);
  const rapportB = await bevestiging.json() as { id: number };
  rapportIds.push(rapportB.id);

  const idorToken = randomUUID();
  await db.insert(snagstreamUploadsTable).values({
    token: idorToken,
    objectPath: `/objects/snagstream/${randomUUID()}`,
    bestandsnaam: BESTANDSNAAM,
    vingerafdruk: "f".repeat(64),
    bestandsgrootte: 1,
    gebruikerId: andereGebruikerId,
    verlooptOp: new Date(Date.now() + 60_000),
  });
  const idorAnnulering = await page.request.post(
    `/api/snagstream/uploads/${idorToken}/annuleren`,
  );
  expect(idorAnnulering.status()).toBe(204);
  expect(
    await db
      .select({ id: snagstreamUploadsTable.id })
      .from(snagstreamUploadsTable)
      .where(eq(snagstreamUploadsTable.token, idorToken)),
  ).toHaveLength(1);
  const idorPoging = await page.request.post("/api/snagstream/rapporten", {
    data: {
      bestandsnaam: BESTANDSNAAM,
      upload_token: idorToken,
      vingerafdruk: "f".repeat(64),
      gebouw_id: gebouwId,
    },
  });
  expect(idorPoging.status()).toBe(409);
  await db.delete(snagstreamUploadsTable).where(eq(snagstreamUploadsTable.token, idorToken));

  const ontbrekendToken = randomUUID();
  const ontbrekendPad = `/objects/snagstream/${randomUUID()}`;
  await db.insert(snagstreamUploadsTable).values({
    token: ontbrekendToken,
    objectPath: ontbrekendPad,
    bestandsnaam: `${MARKER}-ontbrekend.pdf`,
    vingerafdruk: "e".repeat(64),
    bestandsgrootte: 1,
    gebruikerId: adminGebruikerId,
    verlooptOp: new Date(Date.now() - 1_000),
    opruimPogingen: 1,
    opruimLaatstGeprobeerdOp: new Date(),
    opruimFout: "gesimuleerde eerdere storagefout",
  });
  const activeerOpruimer = await page.request.post("/api/snagstream/upload-url", {
    data: {
      bestandsnaam: `${MARKER}-opruimtrigger.pdf`,
      bestandsgrootte: pdfA.length,
      vingerafdruk: sha256(pdfA),
    },
  });
  expect(activeerOpruimer.status()).toBe(200);
  const triggerUpload = await activeerOpruimer.json() as { upload_token: string };
  expect(
    await db
      .select({ id: snagstreamUploadsTable.id })
      .from(snagstreamUploadsTable)
      .where(eq(snagstreamUploadsTable.token, ontbrekendToken)),
  ).toHaveLength(0);
  await db.delete(snagstreamUploadsTable).where(eq(snagstreamUploadsTable.token, triggerUpload.upload_token));

  await db.insert(snagstreamSnagsTable).values({
    rapportId: rapportA.id,
    snagnummer: `${MARKER}-S-1`,
    verdieping: "Eerste verdieping",
    ruimte: "Technische ruimte",
    omschrijving: `Rookmelder ${MARKER}`,
    pdfPagina: 7,
  });
  const zoeken = await page.request.get(`/api/snagstream/rapporten?zoek=${encodeURIComponent(MARKER)}`);
  expect(zoeken.status()).toBe(200);
  const zoekResultaten = await zoeken.json() as Array<{
    id: number;
    zoek_treffers: Array<{ pdf_pagina: number }>;
  }>;
  const zoekRapport = zoekResultaten.find((rapport) => rapport.id === rapportA.id);
  expect(zoekRapport?.zoek_treffers.some((treffer) => treffer.pdf_pagina === 7)).toBe(true);

  const gebouwen = await page.request.get("/api/snagstream/gebouwen-overzicht");
  expect(gebouwen.status()).toBe(200);
  const overzicht = await gebouwen.json() as Array<{
    gebouw_id: number | null;
    rapport_count: number;
    snag_count: number;
  }>;
  expect(overzicht).toContainEqual(expect.objectContaining({
    gebouw_id: gebouwId,
    rapport_count: 2,
    snag_count: 1,
  }));

  const voorVerwijderen = await page.request.get(opslagApiPad(rapportA.pdf_url));
  expect(voorVerwijderen.status()).toBe(200);
  const verwijderen = await page.request.delete(`/api/snagstream/rapporten/${rapportA.id}`);
  expect(verwijderen.status()).toBe(204);
  rapportIds.splice(rapportIds.indexOf(rapportA.id), 1);
  const naVerwijderen = await page.request.get(opslagApiPad(rapportA.pdf_url));
  expect(naVerwijderen.status()).toBe(404);
  expect(
    await db
      .select({ id: snagstreamUploadsTable.id })
      .from(snagstreamUploadsTable)
      .where(and(
        eq(snagstreamUploadsTable.objectPath, rapportA.pdf_url),
        eq(snagstreamUploadsTable.opruimPogingen, 0),
      )),
  ).toHaveLength(0);

  const verwijderenB = await page.request.delete(`/api/snagstream/rapporten/${rapportB.id}`);
  expect(verwijderenB.status()).toBe(204);
  rapportIds.splice(rapportIds.indexOf(rapportB.id), 1);
});

test("Snagstream-archief: meerdere PDF's blijven per bestand onafhankelijk", async ({ page }) => {
  test.setTimeout(180_000);
  await programmatischInloggen(
    page,
    E2E_WEB_ADMIN_EMAIL,
    E2E_WEB_ADMIN_WACHTWOORD,
    E2E_WEB_ADMIN_TOTP_SECRET,
  );

  const nieuweNaamA = `${MARKER}-batch-nieuw-a.pdf`;
  const nieuweNaamB = `${MARKER}-batch-nieuw-b.pdf`;
  const bestaandeNaam = `${MARKER}-batch-bestaand.pdf`;
  const kopieNaam = `${MARKER}-batch-kopie.pdf`;
  const conflictNaam = `${MARKER}-batch-conflict.pdf`;
  const foutNaam = `${MARKER}-geen-pdf.txt`;
  const batchNamen = [nieuweNaamA, nieuweNaamB, bestaandeNaam, kopieNaam, conflictNaam, foutNaam];
  const bestaandePdf = maakPdf(`${MARKER} reeds aanwezig`);
  const conflictPdfOud = maakPdf(`${MARKER} conflict oud`);

  try {
    const bestaandeUpload = await vraagUploadAan(page, bestaandeNaam, bestaandePdf);
    const bestaandeCreate = await maakRapport(page, bestaandeUpload, bestaandeNaam);
    expect(bestaandeCreate.status()).toBe(201);
    const bestaandRapport = await bestaandeCreate.json() as { id: number };
    rapportIds.push(bestaandRapport.id);

    const conflictUpload = await vraagUploadAan(page, conflictNaam, conflictPdfOud);
    const conflictCreate = await maakRapport(page, conflictUpload, conflictNaam);
    expect(conflictCreate.status()).toBe(201);
    const conflictRapport = await conflictCreate.json() as { id: number };
    rapportIds.push(conflictRapport.id);

    await page.goto("/snagstream");
    await expect(page.getByRole("heading", { name: "Snagstream archief" })).toBeVisible();
    await page.getByRole("button", { name: "PDF's uploaden" }).click();

    const dialoog = page.getByRole("dialog");
    await dialoog.getByRole("combobox").click();
    await page.getByRole("option", { name: MARKER }).click();
    await dialoog.getByTestId("snagstream-pdf-bestanden").setInputFiles([
      {
        name: nieuweNaamA,
        mimeType: "application/pdf",
        buffer: maakPdf(`${MARKER} batch nieuw A`),
      },
      {
        name: nieuweNaamB,
        mimeType: "application/pdf",
        buffer: maakPdf(`${MARKER} batch nieuw B`),
      },
      {
        name: kopieNaam,
        mimeType: "application/pdf",
        buffer: bestaandePdf,
      },
      {
        name: conflictNaam,
        mimeType: "application/pdf",
        buffer: maakPdf(`${MARKER} conflict nieuwe inhoud`),
      },
      {
        name: foutNaam,
        mimeType: "text/plain",
        buffer: Buffer.from("geen PDF", "utf8"),
      },
    ]);

    await expect(dialoog.getByTestId("snagstream-upload-item")).toHaveCount(5);
    await dialoog.getByRole("button", { name: "Controleren en 4 uploaden" }).click();

    const itemA = dialoog.getByTestId("snagstream-upload-item").filter({ hasText: nieuweNaamA });
    const itemB = dialoog.getByTestId("snagstream-upload-item").filter({ hasText: nieuweNaamB });
    const kopieItem = dialoog.getByTestId("snagstream-upload-item").filter({ hasText: kopieNaam });
    const conflictItem = dialoog.getByTestId("snagstream-upload-item").filter({ hasText: conflictNaam });
    const foutItem = dialoog.getByTestId("snagstream-upload-item").filter({ hasText: foutNaam });

    await expect(itemA).toContainText("Opgeslagen");
    await expect(itemB).toContainText("Opgeslagen");
    await expect(kopieItem).toContainText("Al aanwezig");
    await expect(conflictItem).toContainText("Keuze nodig");
    await expect(foutItem).toContainText("Mislukt");

    const samenvatting = dialoog.getByTestId("snagstream-upload-samenvatting");
    await expect(samenvatting).toContainText("2 opgeslagen");
    await expect(samenvatting).toContainText("1 al aanwezig");
    await expect(samenvatting).toContainText("1 wacht op keuze");
    await expect(samenvatting).toContainText("1 mislukt");

    await conflictItem.getByRole("button", { name: "Overslaan" }).click();
    await expect(conflictItem).toContainText("Overgeslagen");
    await expect(samenvatting).toContainText("0 wacht op keuze");
    await expect(samenvatting).toContainText("1 overgeslagen");

    const opgeslagen = await db
      .select({
        id: snagstreamRapportenTable.id,
        bestandsnaam: snagstreamRapportenTable.bestandsnaam,
        gebouwId: snagstreamRapportenTable.gebouwId,
        vingerafdruk: snagstreamRapportenTable.vingerafdruk,
      })
      .from(snagstreamRapportenTable)
      .where(inArray(snagstreamRapportenTable.bestandsnaam, batchNamen));
    for (const rapport of opgeslagen) {
      if (!rapportIds.includes(rapport.id)) rapportIds.push(rapport.id);
    }
    expect(opgeslagen.filter((rapport) => [nieuweNaamA, nieuweNaamB].includes(rapport.bestandsnaam)))
      .toHaveLength(2);
    expect(opgeslagen
      .filter((rapport) => [nieuweNaamA, nieuweNaamB].includes(rapport.bestandsnaam))
      .every((rapport) => rapport.gebouwId === gebouwId))
      .toBe(true);
    expect(opgeslagen.filter((rapport) => rapport.vingerafdruk === sha256(bestaandePdf)))
      .toHaveLength(1);
    expect(opgeslagen.filter((rapport) => rapport.bestandsnaam === conflictNaam))
      .toHaveLength(1);
    expect(opgeslagen.some((rapport) => rapport.bestandsnaam === foutNaam))
      .toBe(false);
  } finally {
    const achtergebleven = await db
      .select({ id: snagstreamRapportenTable.id })
      .from(snagstreamRapportenTable)
      .where(inArray(snagstreamRapportenTable.bestandsnaam, batchNamen));
    for (const rapport of achtergebleven) {
      const verwijderen = await page.request.delete(`/api/snagstream/rapporten/${rapport.id}`);
      if (verwijderen.status() === 204) {
        const index = rapportIds.indexOf(rapport.id);
        if (index >= 0) rapportIds.splice(index, 1);
      }
    }
    await db
      .delete(snagstreamUploadsTable)
      .where(inArray(snagstreamUploadsTable.bestandsnaam, batchNamen));
  }
});

test("Snagstream-archief: conflict na objectupload kan per bestand worden opgeruimd of bevestigd", async ({ page }) => {
  test.setTimeout(180_000);
  await programmatischInloggen(
    page,
    E2E_WEB_ADMIN_EMAIL,
    E2E_WEB_ADMIN_WACHTWOORD,
    E2E_WEB_ADMIN_TOTP_SECRET,
  );

  const overslaanNaam = `${MARKER}-race-overslaan.pdf`;
  const bevestigenNaam = `${MARKER}-race-bevestigen.pdf`;
  const raceNamen = [overslaanNaam, bevestigenNaam];
  const geforceerdNieuw = new Set(raceNamen);

  try {
    for (const bestandsnaam of raceNamen) {
      const upload = await vraagUploadAan(
        page,
        bestandsnaam,
        maakPdf(`${bestandsnaam} bestaande inhoud`),
      );
      const create = await maakRapport(page, upload, bestandsnaam);
      expect(create.status()).toBe(201);
      const rapport = await create.json() as { id: number };
      rapportIds.push(rapport.id);
    }

    await page.route("**/api/snagstream/controleer-upload", async (route) => {
      const invoer = route.request().postDataJSON() as { bestandsnaam?: string };
      if (invoer.bestandsnaam && geforceerdNieuw.delete(invoer.bestandsnaam)) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            uitkomst: "nieuw",
            bestaand_rapport: null,
            naamconflicten: [],
          }),
        });
        return;
      }
      await route.fallback();
    });

    await page.goto("/snagstream");
    await expect(page.getByRole("heading", { name: "Snagstream archief" })).toBeVisible();
    await page.getByRole("button", { name: "PDF's uploaden" }).click();

    const dialoog = page.getByRole("dialog");
    await dialoog.getByRole("combobox").click();
    await page.getByRole("option", { name: MARKER }).click();
    await dialoog.getByTestId("snagstream-pdf-bestanden").setInputFiles([
      {
        name: overslaanNaam,
        mimeType: "application/pdf",
        buffer: maakPdf(`${overslaanNaam} nieuwe inhoud`),
      },
      {
        name: bevestigenNaam,
        mimeType: "application/pdf",
        buffer: maakPdf(`${bevestigenNaam} nieuwe inhoud`),
      },
    ]);
    await dialoog.getByRole("button", { name: "Controleren en 2 uploaden" }).click();

    const overslaanItem = dialoog
      .getByTestId("snagstream-upload-item")
      .filter({ hasText: overslaanNaam });
    const bevestigenItem = dialoog
      .getByTestId("snagstream-upload-item")
      .filter({ hasText: bevestigenNaam });
    await expect(overslaanItem).toContainText("Keuze nodig");
    await expect(bevestigenItem).toContainText("Keuze nodig");
    await expect(dialoog.getByTestId("snagstream-pdf-bestanden")).toBeDisabled();

    const pendingVoorKeuze = await db
      .select({
        token: snagstreamUploadsTable.token,
        objectPath: snagstreamUploadsTable.objectPath,
        bestandsnaam: snagstreamUploadsTable.bestandsnaam,
      })
      .from(snagstreamUploadsTable)
      .where(inArray(snagstreamUploadsTable.bestandsnaam, raceNamen));
    expect(pendingVoorKeuze).toHaveLength(2);

    await overslaanItem.getByRole("button", { name: "Overslaan" }).click();
    await expect(overslaanItem).toContainText("Overgeslagen");
    await expect.poll(async () => (
      await db
        .select({ id: snagstreamUploadsTable.id })
        .from(snagstreamUploadsTable)
        .where(eq(snagstreamUploadsTable.bestandsnaam, overslaanNaam))
    ).length).toBe(0);
    const overgeslagenUpload = pendingVoorKeuze.find(
      (upload) => upload.bestandsnaam === overslaanNaam,
    );
    expect(overgeslagenUpload).toBeDefined();
    expect(
      (await page.request.get(opslagApiPad(overgeslagenUpload!.objectPath))).status(),
    ).toBe(404);

    await bevestigenItem.getByRole("button", { name: "Toch uploaden" }).click();
    await expect(bevestigenItem).toContainText("Opgeslagen");
    await expect(
      dialoog.getByTestId("snagstream-upload-samenvatting"),
    ).toContainText("1 opgeslagen");
    await expect(
      dialoog.getByTestId("snagstream-upload-samenvatting"),
    ).toContainText("1 overgeslagen");
    await expect(
      dialoog.getByTestId("snagstream-upload-samenvatting"),
    ).toContainText("0 wacht op keuze");

    const rapportenNaKeuze = await db
      .select({
        id: snagstreamRapportenTable.id,
        bestandsnaam: snagstreamRapportenTable.bestandsnaam,
        gebouwId: snagstreamRapportenTable.gebouwId,
      })
      .from(snagstreamRapportenTable)
      .where(inArray(snagstreamRapportenTable.bestandsnaam, raceNamen));
    for (const rapport of rapportenNaKeuze) {
      if (!rapportIds.includes(rapport.id)) rapportIds.push(rapport.id);
    }
    expect(
      rapportenNaKeuze.filter((rapport) => rapport.bestandsnaam === overslaanNaam),
    ).toHaveLength(1);
    const bevestigdeRapporten = rapportenNaKeuze.filter(
      (rapport) => rapport.bestandsnaam === bevestigenNaam,
    );
    expect(bevestigdeRapporten).toHaveLength(2);
    expect(bevestigdeRapporten.some((rapport) => rapport.gebouwId === gebouwId)).toBe(true);
    expect(
      await db
        .select({ id: snagstreamUploadsTable.id })
        .from(snagstreamUploadsTable)
        .where(inArray(snagstreamUploadsTable.bestandsnaam, raceNamen)),
    ).toHaveLength(0);
  } finally {
    const pending = await db
      .select({ token: snagstreamUploadsTable.token })
      .from(snagstreamUploadsTable)
      .where(inArray(snagstreamUploadsTable.bestandsnaam, raceNamen));
    for (const upload of pending) {
      await page.request.post(`/api/snagstream/uploads/${upload.token}/annuleren`);
    }

    const achtergebleven = await db
      .select({ id: snagstreamRapportenTable.id })
      .from(snagstreamRapportenTable)
      .where(inArray(snagstreamRapportenTable.bestandsnaam, raceNamen));
    for (const rapport of achtergebleven) {
      const verwijderen = await page.request.delete(`/api/snagstream/rapporten/${rapport.id}`);
      if (verwijderen.status() === 204) {
        const index = rapportIds.indexOf(rapport.id);
        if (index >= 0) rapportIds.splice(index, 1);
      }
    }
  }
});

test("Snagstream-archief: annuleren en voltooien delen één tokenvergrendeling", async ({ page }) => {
  test.setTimeout(180_000);
  await programmatischInloggen(
    page,
    E2E_WEB_ADMIN_EMAIL,
    E2E_WEB_ADMIN_WACHTWOORD,
    E2E_WEB_ADMIN_TOTP_SECRET,
  );

  const raceNamen = Array.from(
    { length: 4 },
    (_, index) => `${MARKER}-tokenrace-${index}.pdf`,
  );

  try {
    for (const [index, bestandsnaam] of raceNamen.entries()) {
      const upload = await vraagUploadAan(
        page,
        bestandsnaam,
        maakPdf(`${MARKER} gelijktijdig annuleren of voltooien ${index}`),
      );
      const [voltooien, annuleren] = await Promise.all([
        maakRapport(page, upload, bestandsnaam),
        page.request.post(`/api/snagstream/uploads/${upload.upload_token}/annuleren`),
      ]);

      expect(annuleren.status()).toBe(204);
      expect([201, 409, 422]).toContain(voltooien.status());
      expect(
        await db
          .select({ id: snagstreamUploadsTable.id })
          .from(snagstreamUploadsTable)
          .where(eq(snagstreamUploadsTable.token, upload.upload_token)),
      ).toHaveLength(0);

      const rapporten = await db
        .select({ id: snagstreamRapportenTable.id })
        .from(snagstreamRapportenTable)
        .where(eq(snagstreamRapportenTable.bestandsnaam, bestandsnaam));
      if (voltooien.status() === 201) {
        expect(rapporten).toHaveLength(1);
        rapportIds.push(rapporten[0]!.id);
        expect((await page.request.get(opslagApiPad(upload.object_path))).status()).toBe(200);
      } else {
        expect(rapporten).toHaveLength(0);
        expect((await page.request.get(opslagApiPad(upload.object_path))).status()).toBe(404);
      }
    }
  } finally {
    const pending = await db
      .select({ token: snagstreamUploadsTable.token })
      .from(snagstreamUploadsTable)
      .where(inArray(snagstreamUploadsTable.bestandsnaam, raceNamen));
    for (const upload of pending) {
      await page.request.post(`/api/snagstream/uploads/${upload.token}/annuleren`);
    }

    const achtergebleven = await db
      .select({ id: snagstreamRapportenTable.id })
      .from(snagstreamRapportenTable)
      .where(inArray(snagstreamRapportenTable.bestandsnaam, raceNamen));
    for (const rapport of achtergebleven) {
      const verwijderen = await page.request.delete(`/api/snagstream/rapporten/${rapport.id}`);
      if (verwijderen.status() === 204) {
        const index = rapportIds.indexOf(rapport.id);
        if (index >= 0) rapportIds.splice(index, 1);
      }
    }
  }
});