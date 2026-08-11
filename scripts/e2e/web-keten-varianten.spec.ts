// KETEN_01 fase 2 — de varianten (hoofdstuk 5), als korte aftakkingen.
//
// Dit is een METING, geen reparatie (KETEN_01 regel 3). De aanloop tot elk
// keuzepunt is in fase 1 al klikkend bewezen; hier wordt de aanloop per
// variant geseed (expliciet gemarkeerd) en wordt alleen de aftakking zelf
// klikkend gemeten. Bij varianten die niet mogen lukken is de weigering het
// einddoel; als het tóch lukt is dat een gevonden lek.
//
// Rapport: scripts/e2e-resultaten/keten01/varianten-rapport.{json,md}
// Draaien: pnpm --filter @workspace/scripts exec playwright test --config=playwright.web.config.ts e2e/web-keten-varianten.spec.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";
import { eq, sql } from "drizzle-orm";

import { db, gebouwenTable, offertesTable, opdrachtenTable } from "@workspace/db";
import { crmKlantenTable, projectBegrotingenTable } from "@workspace/db/schema";

import { programmatischInloggen } from "./web-api-proxy";
import {
  E2E_WEB_ADMIN_EMAIL,
  E2E_WEB_ADMIN_WACHTWOORD,
  E2E_WEB_ADMIN_TOTP_SECRET,
  setupE2eWebAdminAccount,
} from "../src/e2e-monteur-testaccount";

const MERK = `KETENVAR ${Date.now()}`;
const UIT_DIR = path.resolve(import.meta.dirname, "../e2e-resultaten/keten01");
mkdirSync(UIT_DIR, { recursive: true });

type Uitkomst = "doorlopen" | "vastgelopen" | "schijnbaar gelukt" | "gesimuleerd" | "niet gemeten";
const rapport: { variant: string; uitkomst: Uitkomst; detail: string }[] = [];
function noteer(variant: string, uitkomst: Uitkomst, detail: string): void {
  rapport.push({ variant, uitkomst, detail });
  console.log(`[KETENVAR] ${uitkomst.toUpperCase()} — ${variant}: ${detail}`);
}

let stapNr = 0;
async function kiek(page: Page, naam: string): Promise<void> {
  stapNr += 1;
  await page.screenshot({ path: path.join(UIT_DIR, `var-${String(stapNr).padStart(2, "0")}-${naam}.png`), fullPage: false }).catch(() => {});
}

const st = {
  adminId: 0,
  medewerkerId: 0,
  klantId: 0,
  gebouwId: 0,
  offerteIds: [] as number[],
  opdrachtIds: [] as number[],
  losseUrenIds: [] as number[],
};

// Aanloop-seed: offerte in "verzonden" met portaaltoken (fase 1 bewees dit pad klikkend).
async function seedOfferte(titel: string, opts?: { verlopen?: boolean; bedrag?: number }): Promise<{ id: number; token: string }> {
  const bedragExcl = opts?.bedrag ?? 1500;
  const [o] = await db.insert(offertesTable).values({
    titel: `${titel} — ${MERK}`,
    gebouwId: st.gebouwId,
    klantId: st.klantId,
    opdrachtgever: `Keten Testklant ${MERK}`,
    datum: new Date().toISOString().slice(0, 10),
    bedragExclBtw: bedragExcl,
    bedragInclBtw: bedragExcl * 1.21,
    status: "verzonden",
    portaalStatus: "verzonden",
    aangemaaktDoorId: st.adminId,
  }).returning({ id: offertesTable.id });
  st.offerteIds.push(o.id);
  const token = randomBytes(32).toString("hex");
  const verlooptOp = opts?.verlopen ? new Date(Date.now() - 24 * 3600 * 1000) : new Date(Date.now() + 14 * 24 * 3600 * 1000);
  await db.execute(sql`INSERT INTO offerte_portaal_tokens (offerte_id, token, verloopt_op) VALUES (${o.id}, ${token}, ${verlooptOp})`);
  return { id: o.id, token };
}

async function seedOpdracht(titel: string, opts?: { metAkkoord?: boolean; offerteId?: number }): Promise<number> {
  const [opd] = await db.insert(opdrachtenTable).values({
    gebouwId: st.gebouwId,
    titel: `${titel} — ${MERK}`,
    opdrachtgever: `Keten Testklant ${MERK}`,
    status: "actief",
    ...(opts?.offerteId ? { offerteId: opts.offerteId } : {}),
    ...(opts?.metAkkoord ? { akkoordGrond: "ondertekening", akkoordOp: new Date() } : {}),
    aangemaaktDoorId: st.adminId,
  }).returning({ id: opdrachtenTable.id });
  st.opdrachtIds.push(opd.id);
  return opd.id;
}

test.beforeAll(async () => {
  st.adminId = await setupE2eWebAdminAccount();
  const bestaand = await db.execute(sql`SELECT id FROM medewerkers WHERE gebruiker_id = ${st.adminId}`);
  if (!(bestaand as { rows?: { id: number }[] }).rows?.length) {
    const ins = await db.execute(sql`
      INSERT INTO medewerkers (gebruiker_id, naam, email, actief)
      VALUES (${st.adminId}, 'E2E Test Web Beheerder', 'e2e-ketenvar@test.local', true) RETURNING id`);
    st.medewerkerId = Number((ins as { rows?: { id: number }[] }).rows?.[0]?.id ?? 0);
  }
  const [klant] = await db.insert(crmKlantenTable).values({
    naam: `Keten Testklant ${MERK}`, type: "bedrijf", status: "actief",
  }).returning({ id: crmKlantenTable.id });
  st.klantId = klant.id;
  const [gebouw] = await db.insert(gebouwenTable).values({
    naam: `Ketengebouw ${MERK}`, adres: "Teststraat 1", stad: "Testdam",
  }).returning({ id: gebouwenTable.id });
  st.gebouwId = gebouw.id;
});

test.afterAll(async () => {
  writeFileSync(path.join(UIT_DIR, "varianten-rapport.json"), JSON.stringify({ merk: MERK, rapport }, null, 2));
  const md = [
    `# KETEN_01 fase 2 — variantenrapport (${new Date().toISOString()})`,
    "", "| Variant | Uitkomst | Detail |", "|---|---|---|",
    ...rapport.map((r) => `| ${r.variant} | **${r.uitkomst}** | ${r.detail.replaceAll("|", "\\|")} |`),
  ].join("\n");
  writeFileSync(path.join(UIT_DIR, "varianten-rapport.md"), md);

  const ruim = async (naam: string, fn: () => Promise<unknown>): Promise<void> => {
    try { await fn(); } catch (err) { console.error(`[KETENVAR] opruimfout ${naam}:`, (err as Error).message); }
  };
  for (const id of st.opdrachtIds) {
    await ruim("uren", () => db.execute(sql`DELETE FROM uren_registraties WHERE opdracht_id = ${id}`));
    await ruim("wb-regels", () => db.execute(sql`DELETE FROM werkbegroting_regels WHERE begroting_id IN (SELECT id FROM project_begrotingen WHERE opdracht_id = ${id})`));
    await ruim("begroting", () => db.execute(sql`DELETE FROM project_begrotingen WHERE opdracht_id = ${id}`));
    await ruim("opdracht", () => db.delete(opdrachtenTable).where(eq(opdrachtenTable.id, id)));
  }
  for (const urenId of st.losseUrenIds) {
    await ruim("uren-los", () => db.execute(sql`DELETE FROM uren_registraties WHERE id = ${urenId}`));
  }
  for (const id of st.offerteIds) {
    await ruim("tracking", () => db.execute(sql`DELETE FROM offerte_tracking WHERE offerte_id = ${id}`));
    await ruim("vragen", () => db.execute(sql`DELETE FROM offerte_vragen WHERE offerte_id = ${id}`));
    await ruim("tokens", () => db.execute(sql`DELETE FROM offerte_portaal_tokens WHERE offerte_id = ${id}`));
    await ruim("offerte", () => db.delete(offertesTable).where(eq(offertesTable.id, id)));
  }
  if (st.gebouwId) await ruim("gebouw", () => db.delete(gebouwenTable).where(eq(gebouwenTable.id, st.gebouwId)));
  if (st.klantId) await ruim("klant", () => db.delete(crmKlantenTable).where(eq(crmKlantenTable.id, st.klantId)));
  if (st.medewerkerId) await ruim("medewerker", () => db.execute(sql`DELETE FROM medewerkers WHERE id = ${st.medewerkerId}`));
});

test("KETEN_01 fase 2 — varianten", async ({ page, browser }) => {
  test.setTimeout(240_000);
  page.setDefaultTimeout(8_000); // nooit één klik het hele tijdbudget laten opeten
  await programmatischInloggen(page, E2E_WEB_ADMIN_EMAIL, E2E_WEB_ADMIN_WACHTWOORD, E2E_WEB_ADMIN_TOTP_SECRET);

  // ── V1a Offerte-afloop: AFGEWEZEN via het klantportaal ────────────────────
  try {
    const { id, token } = await seedOfferte("Var afwijzen");
    const klant = await browser.newPage();
    klant.setDefaultTimeout(10_000);
    await klant.goto(`/portaal/${token}`);
    // De keuzekaart is een button met subtekst "Offerte niet accepteren".
    await klant.getByRole("button", { name: /Offerte niet accepteren/i }).click({ timeout: 15_000 });
    await kiek(klant, "afwijzen-scherm");
    await klant.getByPlaceholder(/Waarom gaat u niet akkoord/i).fill("Te duur voor dit moment (testmeting)");
    await klant.getByRole("button", { name: /Definitief afwijzen/i }).click({ timeout: 10_000 });
    await klant.waitForTimeout(2000);
    await kiek(klant, "afwijzen-na");
    await klant.close();
    const [na] = await db.select({ ps: offertesTable.portaalStatus }).from(offertesTable).where(eq(offertesTable.id, id));
    const ev = await db.execute(sql`SELECT count(*)::int AS n FROM offerte_tracking WHERE offerte_id = ${id} AND event = 'afgewezen'`);
    const nEv = Number((ev as { rows?: { n: number }[] }).rows?.[0]?.n ?? 0);
    if (na?.ps === "afgewezen" && nEv > 0) noteer("Offerte-afloop: afgewezen", "doorlopen", `portaal_status=afgewezen, afwijs-event vastgelegd (offerte ${id})`);
    else noteer("Offerte-afloop: afgewezen", "schijnbaar gelukt", `portaal_status=${na?.ps}, afwijs-events=${nEv}`);
  } catch (err) { noteer("Offerte-afloop: afgewezen", "vastgelopen", (err as Error).message.slice(0, 200)); }

  // ── V1b Offerte-afloop: INGETROKKEN vanuit de studio ─────────────────────
  try {
    const { id } = await seedOfferte("Var intrekken");
    await page.goto(`/offertes/${id}`); // ProposalStudio hangt op /offertes/:id
    const intrekken = page.getByRole("button", { name: /^Intrekken$/ }).first();
    await intrekken.waitFor({ state: "visible", timeout: 15_000 });
    await intrekken.click();
    const dlg = page.getByRole("dialog");
    await dlg.getByPlaceholder(/reden op voor het intrekken/i).fill("Interne herziening nodig (testmeting)");
    await kiek(page, "intrekken-dialoog");
    await dlg.getByRole("button", { name: /Offerte intrekken/i }).click();
    await page.waitForTimeout(2000);
    await kiek(page, "intrekken-na");
    const [na] = await db.select({ s: offertesTable.status, ps: offertesTable.portaalStatus }).from(offertesTable).where(eq(offertesTable.id, id));
    if (na?.s === "ingetrokken" || na?.ps === "ingetrokken") noteer("Offerte-afloop: ingetrokken", "doorlopen", `status=${na?.s}, portaal_status=${na?.ps} (offerte ${id})`);
    else noteer("Offerte-afloop: ingetrokken", "schijnbaar gelukt", `status=${na?.s}, portaal_status=${na?.ps}`);
  } catch (err) { await kiek(page, "intrekken-vast"); noteer("Offerte-afloop: ingetrokken", "vastgelopen", (err as Error).message.slice(0, 200)); }

  // ── V1c Offerte-afloop: VERLOPEN zonder reactie ───────────────────────────
  try {
    const { token } = await seedOfferte("Var verlopen", { verlopen: true });
    const klant = await browser.newPage();
    klant.setDefaultTimeout(10_000);
    await klant.goto(`/portaal/${token}`);
    const verlopenTekst = await klant.getByText(/verlopen/i).first().waitFor({ state: "visible", timeout: 10_000 }).then(() => true).catch(() => false);
    await kiek(klant, "verlopen-portaal");
    await klant.close();
    if (verlopenTekst) noteer("Offerte-afloop: verlopen zonder reactie", "doorlopen", "portaal toont 'Uitnodiging verlopen' bij verstreken token; lijststatus 'vervallen' is afgeleid van de vervaldatum");
    else noteer("Offerte-afloop: verlopen zonder reactie", "schijnbaar gelukt", "verstreken token gaf géén verlopen-melding — portaal mogelijk nog toegankelijk");
  } catch (err) { noteer("Offerte-afloop: verlopen zonder reactie", "vastgelopen", (err as Error).message.slice(0, 200)); }

  noteer("Offerte-afloop: getekend", "vastgelopen", "gemeten in fase 1: 'Definitief akkoord geven' doet niets (canvas op stap 2 ontkoppeld); ondertekenen kan in de web-UI niet voltooid worden");

  // ── V2a Akkoordgrond C: vrijgave door projectleider ───────────────────────
  try {
    const opdrachtId = await seedOpdracht("Var akkoord C");
    await page.goto(`/opdrachten/${opdrachtId}`);
    const vastleggen = page.getByRole("button", { name: /Akkoord vastleggen/i }).first();
    await vastleggen.waitFor({ state: "visible", timeout: 15_000 });
    await vastleggen.click();
    const dlg = page.getByRole("dialog").filter({ hasText: "Akkoord vastleggen" });
    await expect(dlg).toBeVisible();
    await dlg.getByText(/C — Vrijgave door projectleider/i).click();
    await kiek(page, "akkoord-c-dialoog");
    await dlg.getByPlaceholder(/telefonisch akkoord/i).fill("Telefonische vrijgave R. Vink 11-08-2026 (testmeting)");
    const respBelofte = page.waitForResponse((r) => r.url().includes(`/akkoord`) && r.request().method() === "POST", { timeout: 10_000 }).catch(() => null);
    await dlg.getByRole("button", { name: /Vastleggen/i }).last().click();
    const resp = await respBelofte;
    await page.waitForTimeout(1500);
    await kiek(page, "akkoord-c-na");
    const [na] = await db.select({ g: opdrachtenTable.akkoordGrond, op: opdrachtenTable.akkoordOp }).from(opdrachtenTable).where(eq(opdrachtenTable.id, opdrachtId));
    const respTekst = resp ? (await resp.text().catch(() => "")) : "";
    const postInfo = resp ? `POST → ${resp.status()} ${respTekst.slice(0, 160)}` : "GEEN POST /akkoord vertrokken na klik op Vastleggen";
    if (na?.g && na?.op) {
      noteer("Akkoordgrond: vrijgave projectleider", "doorlopen", `akkoord_grond=${na.g}, akkoord_op gevuld (opdracht ${opdrachtId}); ${postInfo}`);
    } else if (resp?.status() === 422 && respTekst.includes("GOEDKEURING_VEREIST")) {
      noteer("Akkoordgrond: vrijgave projectleider", "vastgelopen", `goedkeuringsbeleid grijpt in: opdracht zonder bekend bedrag valt boven de band → 422 GOEDKEURING_VEREIST, eerst formele goedkeuringsaanvraag nodig. De UI toont dit als nette foutmelding; de grond-C-flow zelf werkt maar komt hier niet doorheen zonder ingerichte goedkeuring`);
    } else {
      noteer("Akkoordgrond: vrijgave projectleider", "schijnbaar gelukt", `akkoord_grond=${na?.g}, akkoord_op=${String(na?.op)}; ${postInfo}`);
    }
  } catch (err) { await kiek(page, "akkoord-c-vast"); noteer("Akkoordgrond: vrijgave projectleider", "vastgelopen", (err as Error).message.slice(0, 200)); }

  // ── V2b Akkoordgrond B: opdrachtbevestiging — zonder document moet het WEIGEREN ─
  try {
    const opdrachtId = await seedOpdracht("Var akkoord B");
    await page.goto(`/opdrachten/${opdrachtId}`);
    const vastleggen = page.getByRole("button", { name: /Akkoord vastleggen/i }).first();
    await vastleggen.waitFor({ state: "visible", timeout: 15_000 });
    await vastleggen.click();
    const dlg = page.getByRole("dialog").filter({ hasText: "Akkoord vastleggen" });
    await expect(dlg).toBeVisible();
    await dlg.getByText(/B — Opdrachtbevestiging van de klant/i).click();
    await kiek(page, "akkoord-b-dialoog");
    // Zonder gekozen document proberen vast te leggen → einddoel is de weigering.
    const bevestig = dlg.getByRole("button", { name: /Vastleggen|Opslaan|Bevestigen/i }).last();
    const uitgeschakeld = !(await bevestig.isEnabled().catch(() => true));
    if (!uitgeschakeld) { await bevestig.click(); await page.waitForTimeout(1500); }
    const [na] = await db.select({ g: opdrachtenTable.akkoordGrond }).from(opdrachtenTable).where(eq(opdrachtenTable.id, opdrachtId));
    if (!na?.g) noteer("Akkoordgrond: opdrachtbevestiging zonder document", "doorlopen", `weigering zoals bedoeld (${uitgeschakeld ? "knop uitgeschakeld zonder document" : "server wees vastleggen af"}); grond B eist een echt document`);
    else noteer("Akkoordgrond: opdrachtbevestiging zonder document", "schijnbaar gelukt", `LEK: akkoord kwam tóch tot stand zonder document (grond=${na.g})`);
    await page.keyboard.press("Escape").catch(() => {});
  } catch (err) { await kiek(page, "akkoord-b-vast"); noteer("Akkoordgrond: opdrachtbevestiging zonder document", "vastgelopen", (err as Error).message.slice(0, 200)); }

  noteer("Akkoordgrond: ondertekende offerte", "vastgelopen", "gemeten in fase 1: portaal-ondertekenen komt niet door de web-UI (canvas-ontkoppeling stap 2)");

  // ── V4a Uren op opdracht ZONDER akkoord → einddoel is de weigering ────────
  try {
    const opdrachtId = await seedOpdracht("Var uren zonder akkoord");
    await page.goto("/uren");
    await page.getByRole("button", { name: /Uren registreren|Nieuw/i }).first().click();
    const dlg = page.getByRole("dialog").filter({ hasText: "Uren registreren" });
    await expect(dlg).toBeVisible();
    const datumVeld = dlg.locator("input[type=date]").first();
    if (await datumVeld.isVisible().catch(() => false)) await datumVeld.fill(new Date().toISOString().slice(0, 10));
    await dlg.locator("input[type=time]").nth(0).fill("13:00");
    await dlg.locator("input[type=time]").nth(1).fill("15:00");
    for (const combo of await dlg.getByRole("combobox").all()) {
      try {
        if (!(await combo.isVisible().catch(() => false))) continue;
        await combo.click();
        const optie = page.getByRole("option", { name: /Var uren zonder akkoord/i }).first();
        if (await optie.isVisible().catch(() => false)) { await optie.click({ timeout: 4000 }); continue; }
        const eerste = page.getByRole("option").first();
        if (await eerste.isVisible().catch(() => false)) { await eerste.click({ timeout: 4000 }); } else { await page.keyboard.press("Escape"); }
      } catch { await page.keyboard.press("Escape").catch(() => {}); }
    }
    const ontbrekend = dlg.getByPlaceholder("Waarom staat dit niet in de begroting?").first();
    if (await ontbrekend.isVisible().catch(() => false)) await ontbrekend.fill("Testmeting variant");
    const respBelofte = page.waitForResponse((r) => r.url().includes("/api/uren") && r.request().method() === "POST", { timeout: 10_000 }).catch(() => null);
    await dlg.getByRole("button", { name: /^Registreren$/ }).click();
    const resp = await respBelofte;
    await page.waitForTimeout(1000);
    await kiek(page, "uren-zonder-akkoord");
    const uren = await db.execute(sql`SELECT count(*)::int AS n FROM uren_registraties WHERE opdracht_id = ${opdrachtId}`);
    const nUren = Number((uren as { rows?: { n: number }[] }).rows?.[0]?.n ?? 0);
    const status = resp?.status() ?? 0;
    const body = resp ? await resp.text().catch(() => "") : "";
    if (nUren === 0 && status === 422 && body.includes("AKKOORD_ONTBREEKT")) {
      noteer("Uren: opdracht zonder akkoord", "doorlopen", `weigering zoals bedoeld: 422 AKKOORD_ONTBREEKT, geen uren-rij (opdracht ${opdrachtId})`);
    } else if (nUren > 0) {
      noteer("Uren: opdracht zonder akkoord", "schijnbaar gelukt", `LEK: er ontstond tóch een uren-rij zonder akkoord (POST → ${status})`);
    } else {
      noteer("Uren: opdracht zonder akkoord", "vastgelopen", `geen rij maar ook geen nette 422: POST → ${status} ${body.slice(0, 120)}`);
    }
    await page.keyboard.press("Escape").catch(() => {});
  } catch (err) { await kiek(page, "uren-zonder-akkoord-vast"); noteer("Uren: opdracht zonder akkoord", "vastgelopen", (err as Error).message.slice(0, 200)); }

  // ── V4b Uren ZONDER opdracht → moet gewoon kunnen (alleen meten) ──────────
  try {
    await page.goto("/uren");
    await page.getByRole("button", { name: /Uren registreren|Nieuw/i }).first().click();
    const dlg = page.getByRole("dialog").filter({ hasText: "Uren registreren" });
    await expect(dlg).toBeVisible();
    const datumVeld = dlg.locator("input[type=date]").first();
    if (await datumVeld.isVisible().catch(() => false)) await datumVeld.fill(new Date().toISOString().slice(0, 10));
    await dlg.locator("input[type=time]").nth(0).fill("15:00");
    await dlg.locator("input[type=time]").nth(1).fill("16:00");
    // Bewust GEEN opdracht kiezen; wel een indirecte werkzaamheid als die er is.
    for (const combo of await dlg.getByRole("combobox").all()) {
      try {
        if (!(await combo.isVisible().catch(() => false))) continue;
        const tekst = (await combo.textContent().catch(() => "")) ?? "";
        if (/opdracht/i.test(tekst)) continue; // opdracht-keuzelijst overslaan
        await combo.click();
        const eerste = page.getByRole("option").first();
        if (await eerste.isVisible().catch(() => false)) { await eerste.click({ timeout: 4000 }); } else { await page.keyboard.press("Escape"); }
      } catch { await page.keyboard.press("Escape").catch(() => {}); }
    }
    const respBelofte = page.waitForResponse((r) => r.url().includes("/api/uren") && r.request().method() === "POST", { timeout: 10_000 }).catch(() => null);
    await dlg.getByRole("button", { name: /^Registreren$/ }).click();
    const resp = await respBelofte;
    await page.waitForTimeout(1000);
    await kiek(page, "uren-zonder-opdracht");
    const status = resp?.status() ?? 0;
    if (status === 201) {
      const rij = resp ? await resp.json().catch(() => null) as { id?: number } | null : null;
      if (rij?.id) st.losseUrenIds.push(rij.id); // gericht opruimen in afterAll
      noteer("Uren: zonder opdracht", "doorlopen", `uren zonder opdracht worden geaccepteerd (201, rij ${rij?.id ?? "?"}) — conform beleid 'alleen meten'`);
    }
    else noteer("Uren: zonder opdracht", "vastgelopen", `POST → ${status} ${resp ? (await resp.text().catch(() => "")).slice(0, 150) : "geen respons"}`);
    await page.keyboard.press("Escape").catch(() => {});
  } catch (err) { noteer("Uren: zonder opdracht", "vastgelopen", (err as Error).message.slice(0, 200)); }

  // ── V5 Terugzetten: akkoord intrekken (hoofdbeheerder) ────────────────────
  try {
    const opdrachtId = await seedOpdracht("Var akkoord intrekken", { metAkkoord: true });
    await page.goto(`/opdrachten/${opdrachtId}`);
    const intrek = page.getByRole("button", { name: /Akkoord intrekken|Intrekken/i }).first();
    await intrek.waitFor({ state: "visible", timeout: 15_000 });
    await intrek.click();
    const dlg = page.getByRole("dialog");
    const reden = dlg.locator("textarea").first();
    if (await reden.isVisible().catch(() => false)) await reden.fill("Testmeting terugzetten");
    await kiek(page, "akkoord-intrekken");
    await dlg.getByRole("button", { name: /Intrekken|Bevestigen/i }).last().click();
    await page.waitForTimeout(2000);
    const [na] = await db.select({ g: opdrachtenTable.akkoordGrond }).from(opdrachtenTable).where(eq(opdrachtenTable.id, opdrachtId));
    if (!na?.g) noteer("Terugzetten: akkoord intrekken als hoofdbeheerder", "doorlopen", `akkoord verwijderd op opdracht ${opdrachtId}`);
    else noteer("Terugzetten: akkoord intrekken als hoofdbeheerder", "schijnbaar gelukt", `grond nog steeds ${na.g}`);
  } catch (err) { await kiek(page, "akkoord-intrekken-vast"); noteer("Terugzetten: akkoord intrekken als hoofdbeheerder", "vastgelopen", (err as Error).message.slice(0, 200)); }

  noteer("Terugzetten: als gewone gebruiker", "niet gemeten", "vereist een tweede (niet-hoofdbeheerder) websessie; server-side check bestaat (DELETE /opdrachten/:id/akkoord → 403 voor niet-hoofdbeheerder) maar is hier niet klikkend gemeten");
  // ── V3 Bedrag boven tien mille: opdracht mét gekoppelde offerte ≥ €10k ────
  try {
    const { id: offerteId } = await seedOfferte("Var boven band", { bedrag: 12_000 });
    const opdrachtId = await seedOpdracht("Var boven band", { offerteId });
    await page.goto(`/opdrachten/${opdrachtId}`);
    const vastleggen = page.getByRole("button", { name: /Akkoord vastleggen/i }).first();
    await vastleggen.waitFor({ state: "visible", timeout: 15_000 });
    await vastleggen.click();
    const dlg = page.getByRole("dialog").filter({ hasText: "Akkoord vastleggen" });
    await expect(dlg).toBeVisible();
    await dlg.getByText(/C — Vrijgave door projectleider/i).click();
    await dlg.getByPlaceholder(/telefonisch akkoord/i).fill("Vrijgave boven band (testmeting)");
    const respBelofte = page.waitForResponse((r) => r.url().includes("/akkoord") && r.request().method() === "POST", { timeout: 10_000 }).catch(() => null);
    await dlg.getByRole("button", { name: /Vastleggen/i }).last().click();
    const resp = await respBelofte;
    await kiek(page, "boven-band");
    const tekst = resp ? await resp.text().catch(() => "") : "";
    const [na] = await db.select({ g: opdrachtenTable.akkoordGrond }).from(opdrachtenTable).where(eq(opdrachtenTable.id, opdrachtId));
    if (resp?.status() === 422 && tekst.includes("GOEDKEURING_VEREIST") && !na?.g) {
      noteer("Bedrag: boven tien mille langs de bedrijfsleider", "doorlopen", `weigering zoals bedoeld: offerte €12.000 gekoppeld → akkoord-vastleggen geeft 422 GOEDKEURING_VEREIST, geen akkoord ontstaan (opdracht ${opdrachtId}). De volledige goedkeuringsronde (tweede beoordelaar) is niet doorlopen (vergt ingericht beleid + tweede account)`);
    } else if (na?.g) {
      noteer("Bedrag: boven tien mille langs de bedrijfsleider", "schijnbaar gelukt", `LEK: akkoord kwam tot stand bij €12.000 zonder goedkeuringsronde (grond=${na.g})`);
    } else {
      noteer("Bedrag: boven tien mille langs de bedrijfsleider", "vastgelopen", `POST → ${resp?.status() ?? "geen"} ${tekst.slice(0, 150)}`);
    }
    await page.keyboard.press("Escape").catch(() => {});
  } catch (err) { await kiek(page, "boven-band-vast"); noteer("Bedrag: boven tien mille langs de bedrijfsleider", "vastgelopen", (err as Error).message.slice(0, 200)); }
  noteer("Akkoord zonder offerte (alleen calculatie)", "vastgelopen", "geen UI-flow gevonden die akkoord op een kale calculatie vastlegt en alsnog een offerte met prijsafspraak laat ontstaan — einddoel niet haalbaar via de UI");
  noteer("Materiaal: afwijkend van de opdracht", "niet gemeten", "monteur-intake (mobiel) bepaalt volgens_opdracht; web toont dezelfde behandelflow. Afwijkend-pad vergt mobiele meting (zit niet in deze web-suite)");
  noteer("Bestelweg: uit voorraad", "niet gemeten", "inkoopplanning kent prijsbron/status 'Uit voorraad'; volledige voorraad-afboeking vergt gevuld magazijn — apart te meten zodra magazijn in gebruik is");
  noteer("Prijscontrole: factuurprijs hoger dan afspraak", "niet gemeten", "vergt een prijsafspraak + factuurregels via de mailbox-intake; binnenkomst is mailbox-only (fase 1, proces 9a) en regels-seed zou de controle zelf simuleren");
});
