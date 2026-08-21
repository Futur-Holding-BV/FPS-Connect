// KETEN_01 hermeting — alleen proces 1 t/m 5 (aanvraag → opname → calculatie → offerte → akkoord).
// Afgeleid van web-keten-hoofdlijn.spec.ts; METING, geen reparatie. Geen vangnet-opdracht:
// de keten stopt waar hij stopt, dat is de uitkomst.
//
// Dit is een METING, geen reparatie (KETEN_01 regel 3). Elke stap heeft een
// vooraf vastgelegd einddoel in de gegevens (docs/metingen/KETEN_01_einddoelen.md).
// Uitkomsten per stap: doorlopen / vastgelopen / schijnbaar gelukt / gesimuleerd.
// Vastlopen breekt de doorloop NIET af: waar mogelijk wordt de ontbrekende
// schakel gesimuleerd (expliciet gemarkeerd) zodat latere processen ook gemeten
// worden. Het rapport landt in scripts/e2e-resultaten/keten01-run2/ (JSON + MD) en
// er wordt per stap een schermafdruk vóór en na gemaakt.
//
// Gemelde simulaties (fase 0, vooraf akkoord):
// - Proces 1: de mail-bínnenkomst wordt geseed in aanvraag_voorstellen (er is
//   geen echte mailbox in de testomgeving); de acceptatie zelf is klikkend.
// - Proces 7: de monteur-aanvraag ontstaat in de mobiele app; hier geseed in
//   materiaal_aanvragen. De goedkeuring (werkvoorbereider) is klikkend.
// - Proces 9: de leveranciersfactuur komt uitsluitend via de factuurmailbox
//   binnen; de binnenkomst wordt geseed, beoordeling/koppeling is klikkend.
//
// Draaien: pnpm --filter @workspace/scripts exec playwright test --config=playwright.web.config.ts e2e/web-keten-hoofdlijn.spec.ts
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";
import { and, eq, inArray, like, sql } from "drizzle-orm";

import {
  db,
  gebouwenTable,
  offertesTable,
  offerteTrackingTable,
  opnamesTable,
  opdrachtenTable,
  modCalcHeadersTable,
} from "@workspace/db";
import { aanvraagVoorstellenTable, crmKlantenTable } from "@workspace/db/schema";

import { programmatischInloggen } from "./web-api-proxy";
import {
  E2E_WEB_ADMIN_EMAIL,
  E2E_WEB_ADMIN_WACHTWOORD,
  E2E_WEB_ADMIN_TOTP_SECRET,
  setupE2eWebAdminAccount,
} from "../src/e2e-monteur-testaccount";

const MERK = `KETEN01R2 ${Date.now()}`;
const UIT_DIR = path.resolve(import.meta.dirname, "../e2e-resultaten/keten01-run2");
mkdirSync(UIT_DIR, { recursive: true });

type Uitkomst = "doorlopen" | "vastgelopen" | "schijnbaar gelukt" | "gesimuleerd";
const rapport: { stap: string; uitkomst: Uitkomst; detail: string }[] = [];
function noteer(stap: string, uitkomst: Uitkomst, detail: string): void {
  rapport.push({ stap, uitkomst, detail });
  console.log(`[KETEN01] ${uitkomst.toUpperCase()} — ${stap}: ${detail}`);
}

let stapNr = 0;
async function kiek(page: Page, naam: string): Promise<void> {
  stapNr += 1;
  await page.screenshot({ path: path.join(UIT_DIR, `${String(stapNr).padStart(2, "0")}-${naam}.png`), fullPage: false }).catch(() => {});
}

// Ketenstate — id's die de schakels aan elkaar rijgen.
const keten = {
  adminId: 0,
  voorstelId: 0,
  klantId: 0,
  gebouwId: 0,
  opnameId: 0,
  calculatieId: 0,
  offerteId: 0,
  portaalToken: "" as string | null,
  opdrachtId: 0,
  medewerkerId: 0, // alleen gevuld als de test zelf een profiel moest seeden
};

test.beforeAll(async () => {
  keten.adminId = await setupE2eWebAdminAccount();
  // Uren boeken vereist een medewerkersprofiel (echte gebruikers hebben dat
  // altijd via HRM-onboarding); het kale e2e-account krijgt er hier één —
  // test-setup, geen processimulatie.
  const bestaand = await db.execute(sql`SELECT id FROM medewerkers WHERE gebruiker_id = ${keten.adminId}`);
  if (!(bestaand as { rows?: { id: number }[] }).rows?.length) {
    const ins = await db.execute(sql`
      INSERT INTO medewerkers (gebruiker_id, naam, email, actief)
      VALUES (${keten.adminId}, 'E2E Test Web Beheerder', 'e2e-keten@test.local', true)
      RETURNING id`);
    keten.medewerkerId = Number((ins as { rows?: { id: number }[] }).rows?.[0]?.id ?? 0);
  }
});

test.afterAll(async () => {
  // Rapport altijd wegschrijven, ook bij falen.
  writeFileSync(path.join(UIT_DIR, "rapport.json"), JSON.stringify({ merk: MERK, keten, rapport }, null, 2));
  const md = [
    `# KETEN_01 hermeting proces 1–5 — doorlooprapport (${new Date().toISOString()})`,
    "", "| Stap | Uitkomst | Detail |", "|---|---|---|",
    ...rapport.map((r) => `| ${r.stap} | **${r.uitkomst}** | ${r.detail.replaceAll("|", "\\|")} |`),
  ].join("\n");
  writeFileSync(path.join(UIT_DIR, "rapport.md"), md);

  // Opruiming via DB (governance blokkeert kritieke DELETEs via de API).
  // Elke stap apart afgeschermd zodat één mislukte delete de rest niet blokkeert.
  const ruim = async (naam: string, fn: () => Promise<unknown>): Promise<void> => {
    try { await fn(); } catch (err) { console.error(`[KETEN01] opruimfout ${naam}:`, (err as Error).message); }
  };
  if (keten.opdrachtId) {
    // Alleen bereikbaar als portaal-tekenen + Maak opdracht wél doorlopen (proces 5).
    await ruim("werkbegroting", () => db.execute(sql`DELETE FROM werkbegroting_regels WHERE begroting_id IN (SELECT id FROM project_begrotingen WHERE opdracht_id = ${keten.opdrachtId})`));
    await ruim("begroting", () => db.execute(sql`DELETE FROM project_begrotingen WHERE opdracht_id = ${keten.opdrachtId}`));
    await ruim("opdracht", () => db.delete(opdrachtenTable).where(eq(opdrachtenTable.id, keten.opdrachtId)));
  }
  if (keten.medewerkerId) await ruim("medewerker", () => db.execute(sql`DELETE FROM medewerkers WHERE id = ${keten.medewerkerId}`));
  if (keten.offerteId) {
    // offerte_handtekeningen heeft ON DELETE RESTRICT → vóór de offerte opruimen.
    await ruim("handtekeningen", () => db.execute(sql`DELETE FROM offerte_handtekeningen WHERE offerte_id = ${keten.offerteId}`));
    await ruim("offerteregels", () => db.execute(sql`DELETE FROM offerte_regels WHERE offerte_id = ${keten.offerteId}`));
    await ruim("tracking", () => db.delete(offerteTrackingTable).where(eq(offerteTrackingTable.offerteId, keten.offerteId)));
    await ruim("portaaltokens", () => db.execute(sql`DELETE FROM offerte_portaal_tokens WHERE offerte_id = ${keten.offerteId}`));
    await ruim("offerte", () => db.delete(offertesTable).where(eq(offertesTable.id, keten.offerteId)));
  }
  if (keten.calculatieId) await ruim("calculatie", () => db.delete(modCalcHeadersTable).where(eq(modCalcHeadersTable.id, keten.calculatieId)));
  if (keten.opnameId) await ruim("opname", () => db.delete(opnamesTable).where(eq(opnamesTable.id, keten.opnameId)));
  if (keten.voorstelId) await ruim("voorstel", () => db.delete(aanvraagVoorstellenTable).where(eq(aanvraagVoorstellenTable.id, keten.voorstelId)));
  await ruim("werkbak", () => db.execute(sql`DELETE FROM werkbak_items WHERE titel LIKE ${"%" + MERK + "%"}`));
  if (keten.gebouwId) {
    await ruim("projectkansen", () => db.execute(sql`DELETE FROM crm_commercieel WHERE gebouw_id = ${keten.gebouwId}`));
    await ruim("gebouw", () => db.delete(gebouwenTable).where(eq(gebouwenTable.id, keten.gebouwId)));
  }
  if (keten.klantId) await ruim("klant", () => db.delete(crmKlantenTable).where(eq(crmKlantenTable.id, keten.klantId)));
});

test("KETEN_01 hermeting: proces 1 t/m 5", async ({ page }) => {
  test.setTimeout(480_000);
  // Korte actie-timeout: een selector die niet bestaat is hier een MEETUITKOMST
  // (vastgelopen), geen reden om 30s te wachten. 8s is ruim voor een lokale dev-app.
  page.setDefaultTimeout(8_000);
  // Navigaties (Vite cold-load) mogen wél langer duren dan losse acties.
  page.setDefaultNavigationTimeout(45_000);
  await programmatischInloggen(page, E2E_WEB_ADMIN_EMAIL, E2E_WEB_ADMIN_WACHTWOORD, E2E_WEB_ADMIN_TOTP_SECRET);
  await page.goto("/");
  await kiek(page, "start");

  // ── Proces 1 — Aanvraag binnen ─────────────────────────────────────────────
  // Binnenkomst geseed (gemelde simulatie); acceptatie klikkend.
  const [voorstel] = await db.insert(aanvraagVoorstellenTable).values({
    gebruikerId: keten.adminId,
    mailMessageId: `keten01-${Date.now()}`,
    mailboxAdres: "info@fps-one.nl",
    afzenderNaam: "Keten Testklant",
    afzenderEmail: "keten01-klant@voorbeeld.nl",
    onderwerp: `Offerteaanvraag brandwerende doorvoeringen — ${MERK}`,
    binnengekomenOp: new Date(),
    status: "open",
    aiVoorstel: { titel: `Brandwerend afdichten — ${MERK}`, samenvatting: "Aanvraag voor het brandwerend afdichten van doorvoeringen." },
  }).returning({ id: aanvraagVoorstellenTable.id });
  keten.voorstelId = voorstel.id;
  noteer("1a mail-binnenkomst", "gesimuleerd", "aanvraag_voorstellen geseed (geen mailbox in testomgeving; vooraf gemeld)");

  try {
    await page.getByRole("link", { name: /CRM/i }).first().click().catch(async () => { await page.goto("/crm"); });
    await page.goto("/crm/aanvragen"); // subnavigatie is kaart/kruimel; directe subpagina toegestaan als kaartklik-equivalent
    await kiek(page, "p1-aanvragen-voor");
    await expect(page.getByText(MERK).first()).toBeVisible({ timeout: 20_000 });
    // Kaart met dit voorstel → knop "Accorderen".
    const kaart = page.locator("div")
      .filter({ hasText: MERK })
      .filter({ has: page.getByRole("button", { name: "Accorderen", exact: true }) })
      .last();
    await kaart.getByRole("button", { name: "Accorderen", exact: true }).click();
    // Acceptatiedialoog: uitsluitend de vier startgegevens.
    const dialoog = page.getByRole("dialog").filter({ has: page.getByTestId("button-opslaan-intake") });
    await expect(dialoog).toBeVisible({ timeout: 10_000 });
    await dialoog.getByTestId("input-titel").fill(`Brandwerend afdichten — ${MERK}`);
    await dialoog.getByTestId("input-werkzaamheden").fill("Brandwerende doorvoeringen afdichten");
    await dialoog.getByTestId("select-klant").click();
    await page.getByRole("option", { name: /Nieuwe relatie aanmaken/i }).click();
    await dialoog.getByPlaceholder("Naam nieuwe relatie").fill(`Keten Testklant ${MERK}`);
    await dialoog.getByTestId("input-nieuwe-klant-adres").fill("Relatiestraat 2");
    await dialoog.getByTestId("input-nieuwe-klant-postcode").fill("1234 AB");
    await dialoog.getByTestId("input-nieuwe-klant-stad").fill("Utrecht");
    await dialoog.getByTestId("select-gebouw").click();
    await page.getByRole("option", { name: /Nieuw gebouw aanmaken/i }).click();
    await dialoog.getByTestId("input-nieuw-gebouw-adres").fill("Ketenstraat 1");
    await dialoog.getByTestId("input-nieuw-gebouw-postcode").fill("5678 CD");
    await dialoog.getByTestId("input-nieuw-gebouw-stad").fill("Utrecht");
    await dialoog.getByTestId("button-opslaan-intake").click();
    await page.waitForTimeout(2500);
    await kiek(page, "p1-aanvragen-na");

    // Einddoel: voorstel geaccepteerd + klant + gebouw bestaan en hangen aan elkaar.
    const [na] = await db.select().from(aanvraagVoorstellenTable).where(eq(aanvraagVoorstellenTable.id, keten.voorstelId));
    const [klant] = await db.select({ id: crmKlantenTable.id }).from(crmKlantenTable).where(like(crmKlantenTable.naam, `%${MERK}%`));
    const [gebouw] = await db.select({ id: gebouwenTable.id }).from(gebouwenTable).where(like(gebouwenTable.naam, `%${MERK}%`));
    keten.klantId = klant?.id ?? 0;
    keten.gebouwId = gebouw?.id ?? 0;
    if (na?.status === "geaccepteerd" && klant && gebouw) {
      noteer("1b aanvraag accepteren → klant+gebouw", "doorlopen", `voorstel ${keten.voorstelId} geaccepteerd; klant ${klant.id}, gebouw ${gebouw.id}, projectkans ${na.projectkansId ?? "—"}`);
    } else if (na?.status !== "geaccepteerd") {
      noteer("1b aanvraag accepteren → klant+gebouw", "schijnbaar gelukt", `UI gaf geen fout maar voorstel-status = ${na?.status}; klant=${!!klant}, gebouw=${!!gebouw}`);
    }
  } catch (err) {
    await kiek(page, "p1-vastgelopen");
    noteer("1b aanvraag accepteren → klant+gebouw", "vastgelopen", `klikpad stokte: ${(err as Error).message.slice(0, 200)}`);
  }
  // Doorloopgarantie: zonder gebouw kan de rest niet gemeten worden → seed (gemeld).
  if (!keten.gebouwId) {
    const [g] = await db.insert(gebouwenTable).values({ naam: `Ketengebouw ${MERK}`, adres: "Ketenstraat 1", stad: "Utrecht" } as typeof gebouwenTable.$inferInsert).returning({ id: gebouwenTable.id });
    keten.gebouwId = g.id;
    noteer("1c gebouw (vangnet)", "gesimuleerd", "gebouw geseed zodat proces 2+ meetbaar blijft");
  }

  // ── Proces 2 — Opname ──────────────────────────────────────────────────────
  try {
    await page.goto("/opname");
    await kiek(page, "p2-opname-voor");
    await page.getByRole("button", { name: /Nieuwe opname/i }).first().click();
    const dlg = page.getByRole("dialog").filter({ hasText: "Nieuwe opname aanmaken" });
    await dlg.getByLabel("Naam", { exact: true }).fill(`Opname ${MERK}`);
    await dlg.getByRole("combobox").first().click();
    await page.getByRole("option", { name: /Ketengebouw/ }).first().click();
    // Borg dat de selectie echt gezet is voordat we aanmaken.
    await expect(dlg.getByRole("combobox").first()).toContainText("Ketengebouw");
    await dlg.getByRole("button", { name: /Opname aanmaken/i }).click();
    await expect(dlg).toBeHidden({ timeout: 10_000 });
    // OBSERVATIE (geen fix): de lijst ververst niet automatisch na aanmaken
    // (stale query-invalidatie); herladen zoals een gebruiker zou doen.
    await page.reload();
    await page.waitForTimeout(1500);
    // Definitief maken op de kaart (scope: kaart die tekst én knop bevat;
    // prefix-match omdat de kaarttitel visueel afkapt).
    const opnameKaart = page.locator("div")
      .filter({ hasText: "Opname KETEN01" })
      .filter({ has: page.getByRole("button", { name: "Definitief", exact: true }) })
      .last();
    await opnameKaart.getByRole("button", { name: "Definitief", exact: true }).click();
    // Eventuele bevestigingsdialoog.
    await page.getByRole("button", { name: /Bevestigen|Definitief/i }).last().click().catch(() => {});
    await page.waitForTimeout(1500);
    await kiek(page, "p2-opname-na");
    const [opname] = await db.select().from(opnamesTable).where(like(opnamesTable.naam, `%${MERK}%`));
    keten.opnameId = opname?.id ?? 0;
    if (opname?.status === "definitief" && opname.gebouwId === keten.gebouwId) {
      noteer("2 opname definitief op gebouw", "doorlopen", `opname ${opname.id} (nummer ${opname.nummer}) definitief op gebouw ${opname.gebouwId}`);
    } else {
      noteer("2 opname definitief op gebouw", "schijnbaar gelukt", `opname bestaat=${!!opname}, status=${opname?.status}, gebouw=${opname?.gebouwId}`);
    }
  } catch (err) {
    await kiek(page, "p2-vastgelopen");
    noteer("2 opname definitief op gebouw", "vastgelopen", (err as Error).message.slice(0, 200));
  }

  // ── Proces 3 — Calculatie ──────────────────────────────────────────────────
  try {
    await page.goto("/modules/calculatie/nieuw");
    await kiek(page, "p3-calc-voor");
    await page.getByLabel(/Naam calculatie/i).fill(`Calculatie ${MERK}`);
    // Gebouw kiezen zodat de opname-koppeling verschijnt (trigger toont "Geen gebouw").
    await page.getByRole("combobox").filter({ hasText: "Geen gebouw" }).first().click();
    await page.getByRole("option", { name: /Ketengebouw/ }).first().click();
    await expect(page.getByRole("combobox").filter({ hasText: /Ketengebouw/ }).first()).toBeVisible();
    const opnameTrigger = page.getByRole("combobox").filter({ hasText: /opname/i }).first();
    if (await opnameTrigger.isVisible().catch(() => false)) {
      await opnameTrigger.click();
      await page.getByRole("option", { name: /Opname KETEN01/ }).first().click();
      await expect(page.getByRole("combobox").filter({ hasText: /Opname KETEN01/ }).first()).toBeVisible();
    }
    await page.getByRole("button", { name: /Calculatie aanmaken/i }).click();
    await page.waitForURL(/\/modules\/calculatie\/\d+/, { timeout: 20_000 });
    // Regel toevoegen (inline rij met placeholders).
    await page.getByRole("button", { name: /Regel toevoegen/i }).first().click();
    await page.waitForTimeout(1000);
    const regelOms = page.getByPlaceholder("Omschrijving werkzaamheid...").last();
    await regelOms.fill(`Brandwerend afdichten sparing — ${MERK}`);
    const aantalVeld = page.getByPlaceholder("1", { exact: true }).last();
    if (await aantalVeld.isVisible().catch(() => false)) await aantalVeld.fill("10");
    const prijsVeld = page.getByPlaceholder("0,00").first();
    if (await prijsVeld.isVisible().catch(() => false)) await prijsVeld.fill("125");
    // Inline opslaan: bevestigknop of blur.
    const bewaarKnop = page.getByRole("button", { name: /^(Toevoegen|Opslaan|Bewaar)$/i }).first();
    if (await bewaarKnop.isVisible().catch(() => false)) { await bewaarKnop.click(); } else { await page.keyboard.press("Tab"); }
    await page.waitForTimeout(2000);
    await kiek(page, "p3-calc-na");
    const [calc] = await db.select().from(modCalcHeadersTable).where(like(modCalcHeadersTable.naam, `%${MERK}%`));
    keten.calculatieId = calc?.id ?? 0;
    const regels = calc ? await db.execute(sql`SELECT count(*)::int AS n FROM mod_calc_regels WHERE calculatie_id = ${calc.id}`) : null;
    const nRegels = Number((regels as { rows?: { n: number }[] } | null)?.rows?.[0]?.n ?? 0);
    if (calc && calc.opnameId === keten.opnameId && nRegels > 0) {
      noteer("3 calculatie aan opname + regels", "doorlopen", `calculatie ${calc.id} (C${calc.nummer}) aan opname ${calc.opnameId}, ${nRegels} regel(s)`);
    } else {
      noteer("3 calculatie aan opname + regels", calc ? "schijnbaar gelukt" : "vastgelopen", `calc=${!!calc}, gebouw_id=${calc?.gebouwId ?? "—"}, opname_id=${calc?.opnameId ?? "—"} (verwacht ${keten.opnameId}), regels=${nRegels}`);
    }
  } catch (err) {
    await kiek(page, "p3-vastgelopen");
    noteer("3 calculatie aan opname + regels", "vastgelopen", (err as Error).message.slice(0, 200));
  }

  // ── Proces 4 — Offerte maken, versturen, klant opent ───────────────────────
  try {
    expect(keten.calculatieId, "calculatie nodig voor offerte").toBeGreaterThan(0);
    await page.goto(`/modules/calculatie/${keten.calculatieId}`);
    await kiek(page, "p4-offerte-voor");
    // Procesbalk: een verse calculatie staat op 'concept'; de knop "Maak offerte"
    // verschijnt pas ná de stap "Intern akkoord" (bewuste processtap, geen gat).
    // De klik landt soms niet (re-render race) — opnieuw proberen zolang de
    // knop er nog staat; pas als hij verdwijnt is de status echt gewijzigd.
    // Wacht tot de procesknop er überhaupt is (trage load → isVisible() false
    // zou de stap anders stilletjes overslaan en verderop laten stranden).
    await page.getByTestId("knop-volgende-stap").first().waitFor({ state: "visible", timeout: 20_000 });
    for (let poging = 0; poging < 3; poging++) {
      const internAkkoord = page.getByRole("button", { name: /^Intern akkoord$/ }).first();
      if (!(await internAkkoord.isVisible().catch(() => false))) break;
      await internAkkoord.click().catch((e) => console.log("[KETEN01] intern-akkoord-klik faalde:", (e as Error).message.slice(0, 300)));
      await page.waitForTimeout(2000);
    }
    await page.getByRole("button", { name: /Maak offerte/i }).first().click();
    await page.waitForURL(/\/offertes\/\d+/, { timeout: 20_000 });
    keten.offerteId = Number(page.url().match(/offertes\/(\d+)/)?.[1] ?? 0);
    // Verzendtab → ondertekeningspagina → e-mail invullen → versturen.
    // Wizard-stap is een knop met nummer + label "Verzenden". LET OP: er is óók
    // een status-doorzetknop "Verzenden" (wijzigStatus) — /Verzenden/.first()
    // klikte dié, waardoor de status flipte zonder dat er iets verstuurd werd.
    await page.getByRole("button").filter({ hasText: /^7\s*Verzenden$/ }).first().click();
    await page.waitForTimeout(1500);
    const modus = page.getByText("Ondertekeningspagina", { exact: true }).first();
    if (await modus.isVisible().catch(() => false)) await modus.click();
    await page.getByPlaceholder("klant@bedrijf.nl").fill("keten01-klant@voorbeeld.nl");
    const onderwerpVeld = page.locator("input[placeholder^='Offerte']").first();
    if (await onderwerpVeld.isVisible().catch(() => false)) await onderwerpVeld.fill(`Offerte ${MERK}`);
    await page.getByPlaceholder("Geachte heer/mevrouw…").fill("Hierbij onze offerte. Met vriendelijke groet, FPS.");
    await page.getByRole("button", { name: /^Versturen$/ }).first().click();
    await page.waitForTimeout(4000);
    await kiek(page, "p4-offerte-na");
    const [off] = await db.select().from(offertesTable).where(eq(offertesTable.id, keten.offerteId));
    const tokenRes = await db.execute(sql`SELECT token FROM offerte_portaal_tokens WHERE offerte_id = ${keten.offerteId} ORDER BY id DESC LIMIT 1`);
    keten.portaalToken = (tokenRes as { rows?: { token: string }[] }).rows?.[0]?.token ?? null;
    const tracking = await db.select().from(offerteTrackingTable)
      .where(and(eq(offerteTrackingTable.offerteId, keten.offerteId), eq(offerteTrackingTable.event, "bezorgd")));
    if (off?.portaalStatus === "verzonden" && tracking.length > 0 && keten.portaalToken) {
      noteer("4a offerte uit calculatie + verzonden", "doorlopen", `offerte ${off.id}, portaal_status=verzonden, bezorgd-event vastgelegd, geldige portaallink`);
    } else {
      noteer("4a offerte uit calculatie + verzonden", off ? "schijnbaar gelukt" : "vastgelopen", `status=${off?.portaalStatus}, bezorgd-events=${tracking.length}, token=${keten.portaalToken ? "ja" : "NEE"}`);
    }
  } catch (err) {
    await kiek(page, "p4-vastgelopen");
    noteer("4a offerte uit calculatie + verzonden", "vastgelopen", (err as Error).message.slice(0, 200));
  }

  // ── Proces 4b/5 — Klant opent portaal en tekent → opdracht met akkoord ─────
  try {
    expect(keten.portaalToken, "portaallink nodig").toBeTruthy();
    const klantPagina = await page.context().newPage(); // de klant klikt de link uit de mail
    // Diagnose: een React-crash in het portaal uit zich als errorboundary zonder
    // context — log de échte JS-fout zodat de meting de oorzaak kan benoemen.
    klantPagina.on("pageerror", (e) => console.log("[KETEN01] portaal pageerror:", e.message));
    klantPagina.on("console", (m) => {
      if (m.type() !== "error") return;
      void Promise.all(m.args().map((a) => a.jsonValue().catch(() => String(a))))
        .then((parts) => console.log("[KETEN01] portaal console.error:", JSON.stringify(parts).slice(0, 900)));
    });
    await klantPagina.goto(`/portaal/${keten.portaalToken}`);
    await kiek(klantPagina, "p5-portaal-voor");
    klantPagina.setDefaultTimeout(10_000);
    // Keuzevlak "Accepteren — Digitaal ondertekenen".
    await klantPagina.getByRole("button", { name: /Accepteren/ }).first().click();
    // Handtekening op het canvas.
    const canvas = klantPagina.locator("canvas").first();
    const box = await canvas.boundingBox();
    if (box) {
      await klantPagina.mouse.move(box.x + 30, box.y + 40);
      await klantPagina.mouse.down();
      await klantPagina.mouse.move(box.x + 150, box.y + 80, { steps: 12 });
      await klantPagina.mouse.move(box.x + 80, box.y + 30, { steps: 12 });
      await klantPagina.mouse.up();
    }
    await klantPagina.getByRole("button", { name: /Volgende/i }).click();
    await klantPagina.getByPlaceholder("Voor- en achternaam").fill("K. Testklant");
    await klantPagina.getByRole("button", { name: /Definitief akkoord geven/i }).click();
    await klantPagina.waitForTimeout(3000);
    await kiek(klantPagina, "p5-portaal-na");
    await klantPagina.close();
    const [off] = await db.select().from(offertesTable).where(eq(offertesTable.id, keten.offerteId));
    if (off?.portaalStatus === "ondertekend") {
      noteer("4b klant opent en tekent in portaal", "doorlopen", `portaal_status=ondertekend, portaal_bekeken-event aanwezig=${(await db.select().from(offerteTrackingTable).where(and(eq(offerteTrackingTable.offerteId, keten.offerteId), eq(offerteTrackingTable.event, "portaal_bekeken")))).length > 0}`);
    } else {
      noteer("4b klant opent en tekent in portaal", "schijnbaar gelukt", `portaal_status=${off?.portaalStatus}`);
    }
    // Proces 5 — opdracht maken vanaf de ondertekende offerte.
    await page.goto(`/offertes/${keten.offerteId}`);
    await page.getByRole("button", { name: /Maak opdracht/i }).first().click();
    const opdrachtDlg = page.getByRole("dialog").filter({ hasText: /Opdracht aanmaken/i });
    await opdrachtDlg.getByRole("button", { name: /Aanmaken|Opdracht aanmaken|Bevestigen/i }).first().click();
    await page.waitForURL(/\/opdrachten\/\d+/, { timeout: 20_000 });
    keten.opdrachtId = Number(page.url().match(/opdrachten\/(\d+)/)?.[1] ?? 0);
    await kiek(page, "p5-opdracht");
    const [opd] = await db.select().from(opdrachtenTable).where(eq(opdrachtenTable.id, keten.opdrachtId));
    if (opd && (opd as { akkoordGrond?: string | null }).akkoordGrond === "ondertekening") {
      noteer("5 opdracht met akkoordgrond A", "doorlopen", `opdracht ${opd.id}, akkoord_grond=ondertekening, akkoord_op gevuld=${!!(opd as { akkoordOp?: Date | null }).akkoordOp}`);
    } else {
      noteer("5 opdracht met akkoordgrond A", opd ? "schijnbaar gelukt" : "vastgelopen", `opdracht=${!!opd}, akkoord_grond=${(opd as { akkoordGrond?: string | null } | undefined)?.akkoordGrond ?? "—"}`);
    }
  } catch (err) {
    await kiek(page, "p5-vastgelopen");
    noteer("4b/5 portaal-tekenen → opdracht", "vastgelopen", (err as Error).message.slice(0, 200));
  }

  // De test zelf faalt niet op rode ketenstappen: dit is een meting.
  expect(rapport.length).toBeGreaterThan(0);
});
