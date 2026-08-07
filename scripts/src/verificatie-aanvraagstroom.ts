// Verificatie — AANVRAAG_01 prijsaanvraag-stroom (acceptatiescenario's §6, API-niveau)
//
// Bewijst tegen de draaiende dev-omgeving:
//   A. Niets vastgelegd zonder goedkeuring: open voorstel → geen projectkans/relatie/gebouw.
//   B. Onbekende afzender: accorderen zonder klant-bevestiging → 422; niets aangemaakt.
//   C. Meerwerk: accepteren als meerwerk ZONDER expliciet gekozen opdracht → 422;
//      mét opdracht → projectkans met gerelateerd_project_id, klant/gebouw/project gekoppeld.
//   D. Accepteren (nieuwe aanvraag, nieuwe relatie na expliciete bevestiging) →
//      projectkans in fase signaal met bronmail + binnengekomen_op; relatie = prospect;
//      tweede keer accepteren → 409.
//   E. Offerte vanuit kans: POST /offertes met projectkans_id → terugverwijzing aanwezig.
//   F. Geen project in dit proces: POST /projecten → 404 (route verwijderd).
//   G. Termijnbewaking: kans ouder dan de reactietermijn en onbeantwoord →
//      draaiAanvraagBewaking maakt signaal aanvraag_antwoord_te_laat (dedupe: 2e run geen dubbel).
//   H. Intake-instellingen: GET/PATCH persoonlijke-mailbox-toggle (zonder mailkoppeling → 404).
//
// Draaien: pnpm --filter @workspace/scripts exec tsx src/verificatie-aanvraagstroom.ts
import { execFileSync } from "node:child_process";
import { eq, inArray, and, like } from "drizzle-orm";
import { authenticator } from "otplib";

import {
  db,
  aanvraagVoorstellenTable,
  crmCommercieelTable,
  crmKlantenTable,
  gebouwenTable,
  factuurSignalenTable,
  offertesTable,
  projectenTable,
  werkInboxKoppelingenTable,
} from "@workspace/db";

import {
  E2E_WW_ADMIN_EMAIL,
  E2E_WW_ADMIN_TOTP_SECRET,
  E2E_WW_ADMIN_WACHTWOORD,
  archiveerE2eWachtwoordAccounts,
  setupE2eWachtwoordAccounts,
} from "./e2e-wachtwoord-testaccounts";

const DOMEIN = process.env.REPLIT_DEV_DOMAIN;
if (!DOMEIN) {
  console.error("REPLIT_DEV_DOMAIN ontbreekt.");
  process.exit(1);
}
const BASIS = `https://${DOMEIN}/api`;

class Sessie {
  private cookies = new Map<string, string>();
  async fetch(pad: string, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers);
    if (init?.body) headers.set("Content-Type", "application/json");
    const cookie = [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    if (cookie) headers.set("Cookie", cookie);
    const res = await fetch(`${BASIS}${pad}`, { ...init, headers, redirect: "manual" });
    for (const sc of res.headers.getSetCookie()) {
      const [paar] = sc.split(";");
      const idx = paar.indexOf("=");
      if (idx > 0) {
        const naam = paar.slice(0, idx).trim();
        const waarde = paar.slice(idx + 1).trim();
        if (waarde === "" || /expires=Thu, 01 Jan 1970/i.test(sc)) this.cookies.delete(naam);
        else this.cookies.set(naam, waarde);
      }
    }
    return res;
  }
  post(pad: string, body?: unknown): Promise<Response> {
    return this.fetch(pad, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
  }
  patch(pad: string, body?: unknown): Promise<Response> {
    return this.fetch(pad, { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) });
  }
  get(pad: string): Promise<Response> { return this.fetch(pad); }
}

function eis(v: boolean, stap: string, detail: string): void {
  if (!v) throw new Error(`FAIL — ${stap}: ${detail}`);
}
async function json<T = any>(res: Response): Promise<T> {
  const t = await res.text();
  try { return JSON.parse(t) as T; } catch { return t as unknown as T; }
}
async function versTotp(secret: string): Promise<string> {
  const rest = authenticator.timeRemaining();
  if (rest < 10) await new Promise((r) => setTimeout(r, (rest + 1) * 1000));
  return authenticator.generate(secret);
}

const MARK = "E2E-AANVRAAG";
const voorstelIds: number[] = [];
const kansIds: number[] = [];
const klantIds: number[] = [];
const gebouwIds: number[] = [];
const projectIds: number[] = [];
const offerteIds: number[] = [];

async function seedVoorstel(gebruikerId: number, extra?: Partial<typeof aanvraagVoorstellenTable.$inferInsert>): Promise<number> {
  const [rij] = await db.insert(aanvraagVoorstellenTable).values({
    gebruikerId,
    mailMessageId: `${MARK}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    mailboxAdres: "aanvragen@fps-test.nl",
    afzenderNaam: `${MARK} Aanvrager`,
    afzenderEmail: "aanvrager@e2e-aanvraag-test.nl",
    onderwerp: `${MARK} Prijsaanvraag brandwerende doorvoeringen`,
    binnengekomenOp: new Date(),
    aiVoorstel: { titel: `${MARK} kans`, samenvatting: "Testaanvraag voor verificatie." },
    conceptAntwoord: "Geachte heer/mevrouw,\n\nDank voor uw aanvraag. Wij nemen deze in behandeling.\n\nMet vriendelijke groet,\nFPS",
    ...extra,
  }).returning({ id: aanvraagVoorstellenTable.id });
  voorstelIds.push(rij.id);
  return rij.id;
}

async function cleanup(): Promise<void> {
  const messageIds = voorstelIds.length > 0
    ? (await db.select({ m: aanvraagVoorstellenTable.mailMessageId }).from(aanvraagVoorstellenTable).where(inArray(aanvraagVoorstellenTable.id, voorstelIds))).map((r) => r.m)
    : [];
  if (offerteIds.length > 0) await db.delete(offertesTable).where(inArray(offertesTable.id, offerteIds));
  if (voorstelIds.length > 0) await db.delete(aanvraagVoorstellenTable).where(inArray(aanvraagVoorstellenTable.id, voorstelIds));
  if (messageIds.length > 0) await db.delete(werkInboxKoppelingenTable).where(inArray(werkInboxKoppelingenTable.messageId, messageIds));
  if (kansIds.length > 0) {
    await db.delete(factuurSignalenTable).where(inArray(factuurSignalenTable.projectkansId, kansIds));
    await db.delete(crmCommercieelTable).where(inArray(crmCommercieelTable.id, kansIds));
  }
  if (projectIds.length > 0) await db.delete(projectenTable).where(inArray(projectenTable.id, projectIds));
  if (gebouwIds.length > 0) await db.delete(gebouwenTable).where(inArray(gebouwenTable.id, gebouwIds));
  if (klantIds.length > 0) await db.delete(crmKlantenTable).where(inArray(crmKlantenTable.id, klantIds));
  // vangnet: alles met de marker
  await db.delete(crmKlantenTable).where(like(crmKlantenTable.naam, `${MARK}%`));
  await archiveerE2eWachtwoordAccounts();
}

async function main(): Promise<void> {
  try {
    console.log(`Verificatie aanvraagstroom — doel: ${BASIS}`);
    const { adminId } = await setupE2eWachtwoordAccounts();
    const admin = new Sessie();
    {
      const r1 = await admin.post("/auth/login", { email: E2E_WW_ADMIN_EMAIL, wachtwoord: E2E_WW_ADMIN_WACHTWOORD });
      const b1 = await json(r1);
      eis(r1.status === 200 && b1.status === "verify_2fa", "login", `${r1.status} ${JSON.stringify(b1)}`);
      const r2 = await admin.post("/auth/2fa/verify", { code: await versTotp(E2E_WW_ADMIN_TOTP_SECRET) });
      eis(r2.status === 200, "2fa", `${r2.status}`);
      console.log(`Stap 0: admin (id ${adminId}) ingelogd`);
    }

    // F. Geen project in dit proces
    {
      const r = await admin.post("/projecten", { naam: `${MARK} mag niet` });
      eis(r.status === 404, "F geen POST /projecten", `gaf ${r.status} (route hoort verwijderd te zijn)`);
      console.log("Stap F: POST /projecten bestaat niet meer — project ontstaat alleen bij offerte-ondertekening");
    }

    // A + B. Niets vastgelegd zonder goedkeuring; onbekende afzender → 422
    {
      const vid = await seedVoorstel(adminId);
      const kansenVoor = await db.select({ id: crmCommercieelTable.id }).from(crmCommercieelTable).where(like(crmCommercieelTable.titel, `${MARK}%`));
      eis(kansenVoor.length === 0, "A niets vastgelegd", "er bestond al een projectkans vóór goedkeuring");

      const r = await admin.post(`/aanvragen/voorstellen/${vid}/accepteren`, { titel: `${MARK} zonder klant` });
      eis(r.status === 422, "B onbekende afzender", `zonder klant-bevestiging gaf ${r.status}`);
      const kansenNa = await db.select({ id: crmCommercieelTable.id }).from(crmCommercieelTable).where(like(crmCommercieelTable.titel, `${MARK}%`));
      const klantenNa = await db.select({ id: crmKlantenTable.id }).from(crmKlantenTable).where(like(crmKlantenTable.naam, `${MARK}%`));
      eis(kansenNa.length === 0 && klantenNa.length === 0, "B niets stilzwijgend", "422 maar er is toch iets aangemaakt");
      console.log("Stap A/B: zonder menselijke goedkeuring en klant-bevestiging wordt níets vastgelegd (422)");

      // D. Accepteren met expliciet bevestigde nieuwe relatie + nieuw gebouw
      const ok = await admin.post(`/aanvragen/voorstellen/${vid}/accepteren`, {
        titel: `${MARK} kans nieuw`,
        nieuwe_klant: { naam: `${MARK} Nieuwe Relatie BV` },
        nieuw_gebouw: { naam: `${MARK} Pand`, adres: "Teststraat 1", stad: "Testdam" },
        bv: "FPS Brandpreventie",
      });
      const okB = await json(ok);
      eis(ok.status === 200 && okB.status === "geaccepteerd" && okB.projectkans_id > 0, "D accepteren", `${ok.status} ${JSON.stringify(okB)}`);
      kansIds.push(okB.projectkans_id);
      const [kans] = await db.select().from(crmCommercieelTable).where(eq(crmCommercieelTable.id, okB.projectkans_id));
      eis(kans.fase === "signaal" && !!kans.bronMailMessageId && !!kans.binnengekomenOp, "D kansvelden", JSON.stringify({ fase: kans.fase, bron: kans.bronMailMessageId }));
      const [klant] = await db.select().from(crmKlantenTable).where(eq(crmKlantenTable.id, kans.klantId));
      klantIds.push(klant.id);
      if (kans.gebouwId) gebouwIds.push(kans.gebouwId);
      eis(klant.status === "prospect", "D prospect", `nieuwe relatie kreeg status ${klant.status}`);
      const koppelingen = await db.select().from(werkInboxKoppelingenTable).where(eq(werkInboxKoppelingenTable.messageId, kans.bronMailMessageId!));
      eis(koppelingen.length >= 2, "D koppelingen", `bronmail heeft ${koppelingen.length} koppelingen (verwacht klant+gebouw)`);

      const dubbel = await admin.post(`/aanvragen/voorstellen/${vid}/accepteren`, { titel: "x", klant_id: klant.id });
      eis(dubbel.status === 409, "D dubbel accepteren", `gaf ${dubbel.status}`);
      console.log("Stap D: accorderen → projectkans (signaal) + prospect-relatie + gebouw + mailkoppelingen; 2e keer → 409");

      // E. Offerte vanuit kans met terugverwijzing
      const off = await admin.post("/offertes", { titel: `${MARK} offerte`, klant_id: klant.id, projectkans_id: okB.projectkans_id });
      const offB = await json(off);
      eis(off.status === 201 && offB.projectkans_id === okB.projectkans_id, "E offerte", `${off.status} projectkans_id=${offB.projectkans_id}`);
      offerteIds.push(offB.id);
      console.log("Stap E: offerte aangemaakt vanuit de kans, met terugverwijzing projectkans_id");
    }

    // C. Meerwerk vereist expliciet gekozen opdracht
    {
      const vid = await seedVoorstel(adminId, { voorstelType: "meerwerk" });
      const [klant] = await db.insert(crmKlantenTable).values({ naam: `${MARK} Meerwerk Klant` }).returning({ id: crmKlantenTable.id });
      klantIds.push(klant.id);
      const zonder = await admin.post(`/aanvragen/voorstellen/${vid}/accepteren`, { titel: `${MARK} meerwerk`, klant_id: klant.id, voorstel_type: "meerwerk" });
      eis(zonder.status === 422, "C1 meerwerk zonder opdracht", `gaf ${zonder.status}`);
      const [project] = await db.insert(projectenTable).values({ naam: `${MARK} Lopend project` }).returning({ id: projectenTable.id });
      projectIds.push(project.id);
      const met = await json(await admin.post(`/aanvragen/voorstellen/${vid}/accepteren`, {
        titel: `${MARK} meerwerk`, klant_id: klant.id, voorstel_type: "meerwerk", gerelateerd_project_id: project.id,
      }));
      eis(met.projectkans_id > 0, "C2 meerwerk accepteren", JSON.stringify(met));
      kansIds.push(met.projectkans_id);
      const [kans] = await db.select().from(crmCommercieelTable).where(eq(crmCommercieelTable.id, met.projectkans_id));
      eis(kans.gerelateerdProjectId === project.id, "C3 gerelateerd project", `gerelateerd_project_id=${kans.gerelateerdProjectId}`);
      console.log("Stap C: meerwerk zonder gekozen opdracht → 422; mét opdracht → kans gekoppeld aan lopend project");
    }

    // G. Termijnbewaking: oud onbeantwoord voorstel → antwoord-signaal;
    //    oude geaccepteerde kans in fase signaal → oppak-signaal; geen dubbels bij 2e run.
    {
      const oudVoorstelId = await seedVoorstel(adminId, {
        binnengekomenOp: new Date(Date.now() - 14 * 24 * 3600_000),
        onderwerp: `${MARK} verlopen aanvraag`,
      });
      const [oudVoorstel] = await db.select().from(aanvraagVoorstellenTable).where(eq(aanvraagVoorstellenTable.id, oudVoorstelId));

      const [klant] = await db.insert(crmKlantenTable).values({ naam: `${MARK} Trage Klant` }).returning({ id: crmKlantenTable.id });
      klantIds.push(klant.id);
      const [kans] = await db.insert(crmCommercieelTable).values({
        klantId: klant.id,
        titel: `${MARK} niet opgepakte aanvraag`,
        kansType: "offerte",
        fase: "signaal",
        bronMailMessageId: `${MARK}-verlopen-${Date.now()}`,
        binnengekomenOp: new Date(Date.now() - 14 * 24 * 3600_000),
      }).returning({ id: crmCommercieelTable.id });
      kansIds.push(kans.id);

      const draai = () => execFileSync("pnpm", ["--filter", "@workspace/api-server", "exec", "tsx", "-e",
        `import("./src/services/aanvraagstroomService.ts").then(m => m.draaiAanvraagBewaking()).then(() => process.exit(0))`,
      ], { cwd: "../..", stdio: "pipe", timeout: 120_000 });
      const telAntwoord = () => db.select().from(factuurSignalenTable)
        .where(and(eq(factuurSignalenTable.mailMessageId, oudVoorstel.mailMessageId), eq(factuurSignalenTable.type, "aanvraag_antwoord_te_laat")));
      const telOppak = () => db.select().from(factuurSignalenTable)
        .where(and(eq(factuurSignalenTable.projectkansId, kans.id), eq(factuurSignalenTable.type, "aanvraag_niet_opgepakt")));

      draai();
      eis((await telAntwoord()).length === 1, "G1 antwoord-signaal", "verlopen reactietermijn gaf geen signaal");
      eis((await telOppak()).length === 1, "G2 oppak-signaal", "niet-opgepakte kans gaf geen signaal");
      draai();
      eis((await telAntwoord()).length === 1 && (await telOppak()).length === 1, "G3 dedupe", "2e bewaking maakte dubbele signalen");
      await db.delete(factuurSignalenTable).where(eq(factuurSignalenTable.mailMessageId, oudVoorstel.mailMessageId));
      console.log("Stap G: verlopen reactie- en oppaktermijn → signalen; herhaalde bewaking maakt geen dubbels");
    }

    // I. Race: twee gelijktijdige accepteer-verzoeken → precies één kans, één 409-achtige fout
    {
      const vid = await seedVoorstel(adminId);
      const [klant] = await db.insert(crmKlantenTable).values({ naam: `${MARK} Race Klant` }).returning({ id: crmKlantenTable.id });
      klantIds.push(klant.id);
      const [r1, r2] = await Promise.all([
        admin.post(`/aanvragen/voorstellen/${vid}/accepteren`, { titel: `${MARK} race`, klant_id: klant.id }),
        admin.post(`/aanvragen/voorstellen/${vid}/accepteren`, { titel: `${MARK} race`, klant_id: klant.id }),
      ]);
      const statussen = [r1.status, r2.status].sort();
      eis(statussen[0] === 200 && statussen[1] === 409, "I1 race-statussen", `kregen ${r1.status} en ${r2.status}`);
      const kansen = await db.select({ id: crmCommercieelTable.id }).from(crmCommercieelTable).where(eq(crmCommercieelTable.titel, `${MARK} race`));
      kansIds.push(...kansen.map((k) => k.id));
      eis(kansen.length === 1, "I2 één kans", `er ontstonden ${kansen.length} projectkansen`);
      console.log("Stap I: gelijktijdig accepteren → één winnaar (200), één 409, precies één projectkans");
    }

    // J. Aanvraag-signalen zichtbaar en afhandelbaar met CRM-bevoegdheid
    {
      const oud = await seedVoorstel(adminId, {
        binnengekomenOp: new Date(Date.now() - 14 * 24 * 3600_000),
        onderwerp: `${MARK} signaal-check`,
      });
      const [rij] = await db.select().from(aanvraagVoorstellenTable).where(eq(aanvraagVoorstellenTable.id, oud));
      execFileSync("pnpm", ["--filter", "@workspace/api-server", "exec", "tsx", "-e",
        `import("./src/services/aanvraagstroomService.ts").then(m => m.draaiAanvraagBewaking()).then(() => process.exit(0))`,
      ], { cwd: "../..", stdio: "pipe", timeout: 120_000 });
      const lijst = await json(await admin.get("/aanvragen/signalen?status=open"));
      const signaal = Array.isArray(lijst) ? lijst.find((s: any) => s.mail_message_id === rij.mailMessageId) : undefined;
      eis(!!signaal, "J1 CRM-lijst", "aanvraag-signaal niet zichtbaar via /aanvragen/signalen");
      const af = await json(await admin.post(`/aanvragen/signalen/${signaal.id}/afhandelen`, { notitie: "Gezien tijdens verificatie." }));
      eis(af.status === "afgehandeld", "J2 afhandelen", JSON.stringify(af));
      await db.delete(factuurSignalenTable).where(eq(factuurSignalenTable.mailMessageId, rij.mailMessageId));
      console.log("Stap J: aanvraag-signalen zichtbaar en afhandelbaar via CRM-ingang /aanvragen/signalen");
    }

    // H. Intake-instellingen
    {
      const g = await admin.get("/aanvragen/intake-instellingen");
      const gb = await json(g);
      eis(g.status === 200 && typeof gb.mail_gekoppeld === "boolean", "H1 GET", `${g.status} ${JSON.stringify(gb)}`);
      const p = await admin.patch("/aanvragen/intake-instellingen", { persoonlijke_intake: true });
      if (gb.mail_gekoppeld) {
        const pb = await json(p);
        eis(p.status === 200 && pb.persoonlijke_intake === true, "H2 PATCH", `${p.status}`);
        await admin.patch("/aanvragen/intake-instellingen", { persoonlijke_intake: false });
      } else {
        eis(p.status === 404, "H2 PATCH zonder koppeling", `gaf ${p.status} (verwacht 404)`);
      }
      console.log("Stap H: intake-instellingen — toggle werkt resp. faalt netjes zonder mailkoppeling");
    }

    console.log("\nALLE STAPPEN GESLAAGD — AANVRAAG_01-stroom bewezen op dev.");
  } finally {
    await cleanup();
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exitCode = 1; });
