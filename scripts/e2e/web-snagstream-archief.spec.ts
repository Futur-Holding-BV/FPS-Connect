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
  const bevestiging = await maakRapport(page, uploadB, BESTANDSNAAM, true);
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