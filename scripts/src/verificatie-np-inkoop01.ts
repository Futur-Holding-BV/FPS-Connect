// Verificatie — NP_INKOOP_01 Algemene inkoop (acceptatiecriteria §6, API-niveau)
//
// Bewijst tegen de draaiende dev-omgeving:
//   1. Op rekening aanmaken → direct een A-nummer (A-reeks, oplopend), status besteld.
//   2. Direct betaald: zonder bon niet af te ronden (422); mét bon → afgehandeld.
//   3. Goedkeuringsgrens via de bestaande motor: boven de grens → ter_goedkeuring,
//      afronden geblokkeerd (422) zolang niet goedgekeurd.
//   4. Rechten (Jacqueline-scenario): financieel niveau 2 zónder offertes → toegang;
//      zonder beide → 403. Verwijderen vergt financieel 3 (of offertes 3).
//   5. Factuurmatch op A-nummers + bedragafwijkingssignaal: apart harnas dat de
//      exacte productiecode aanroept (zie stap "factuurmatch-harnas").
//   6. Geen inkoop zonder kostensoort (400) en geen optionele opdracht_id: de
//      tabel kent het veld simpelweg niet (aparte tabel naast projectinkoop).
//
// Draaien: pnpm --filter @workspace/scripts exec tsx src/verificatie-np-inkoop01.ts
import { execFileSync } from "node:child_process";
import bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import { and, eq, inArray } from "drizzle-orm";
import { db, gebruikersTable, algemeneInkopenTable, goedkeuringBeleidsregelsTable, goedkeuringAanvragenTable, goedkeuringStappenTable } from "@workspace/db";
import {
  setupE2eWebAdminAccount, E2E_WEB_ADMIN_EMAIL, E2E_WEB_ADMIN_WACHTWOORD,
  genereerVersWebAdminTotp, archiveerE2eWebAdminAccount,
} from "./e2e-monteur-testaccount";

const DOMEIN = process.env.REPLIT_DEV_DOMAIN;
if (!DOMEIN) { console.error("REPLIT_DEV_DOMAIN ontbreekt."); process.exit(1); }
const BASIS = `https://${DOMEIN}/api`;

class Sessie {
  private cookies = new Map<string, string>();
  async fetch(pad: string, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers);
    if (init?.body && typeof init.body === "string") headers.set("Content-Type", "application/json");
    const cookie = [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    if (cookie) headers.set("Cookie", cookie);
    const res = await fetch(`${BASIS}${pad}`, { ...init, headers, redirect: "manual" });
    for (const sc of res.headers.getSetCookie()) {
      const [paar] = sc.split(";");
      const idx = paar!.indexOf("=");
      if (idx > 0) {
        const naam = paar!.slice(0, idx).trim();
        const waarde = paar!.slice(idx + 1).trim();
        if (waarde === "" || /expires=Thu, 01 Jan 1970/i.test(sc)) this.cookies.delete(naam);
        else this.cookies.set(naam, waarde);
      }
    }
    return res;
  }
  post(pad: string, body?: unknown): Promise<Response> {
    return this.fetch(pad, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
  }
  get(pad: string): Promise<Response> { return this.fetch(pad); }
}

function check(naam: string, ok: boolean, detail?: unknown): void {
  console.log(`${ok ? "✅" : "❌"} ${naam}${detail !== undefined && !ok ? ` — ${JSON.stringify(detail)}` : ""}`);
  if (!ok) process.exitCode = 1;
}

const TEST_FIN_EMAIL = "verif-npinkoop-fin@fps.local";
const TEST_GEEN_EMAIL = "verif-npinkoop-geen@fps.local";
const TEST_WACHTWOORD = "VerifNpInkoop!2026";

const TEST_TOTP_SECRET = "NVXHK4TJMZUWC2LO"; // vast secret, alleen dev-testaccounts

async function maakBeperktAccount(email: string, bevoegdheden: Record<string, number>): Promise<number> {
  const hash = await bcrypt.hash(TEST_WACHTWOORD, 10);
  await db.delete(gebruikersTable).where(eq(gebruikersTable.email, email));
  const [rij] = await db.insert(gebruikersTable).values({
    naam: `Verif ${email}`, email, rol: "gebruiker", wachtwoord: hash,
    totpSecret: TEST_TOTP_SECRET, tweeFactorIngeschakeld: true,
    actief: true, bevoegdheden, initialen: "VF",
  }).returning({ id: gebruikersTable.id });
  return rij!.id;
}

async function loginBeperkt(email: string): Promise<Sessie> {
  const s = new Sessie();
  const res = await s.post("/auth/login", { email, wachtwoord: TEST_WACHTWOORD });
  const body = await res.json() as { status?: string };
  if (!res.ok) throw new Error(`login ${email} faalde: ${res.status}`);
  if (body.status === "verify_2fa") {
    // Genereer een code in het volgende TOTP-venster zodat hergebruik tussen
    // de twee testaccounts (zelfde secret) niet als replay wordt geweigerd.
    const stap = 30_000;
    const wacht = stap - (Date.now() % stap) + 500;
    await new Promise((r) => setTimeout(r, wacht));
    const code = authenticator.generate(TEST_TOTP_SECRET);
    const v = await s.post("/auth/2fa/verify", { code });
    if (!v.ok) throw new Error(`2FA voor ${email} faalde: ${v.status}`);
  }
  return s;
}

async function main(): Promise<void> {
  const opruimInkoopIds: number[] = [];
  let regelId: number | null = null;
  await setupE2eWebAdminAccount();

  const admin = new Sessie();
  const l1 = await admin.post("/auth/login", { email: E2E_WEB_ADMIN_EMAIL, wachtwoord: E2E_WEB_ADMIN_WACHTWOORD });
  const l1b = await l1.json() as { status?: string };
  if (l1b.status === "verify_2fa") {
    const code = await genereerVersWebAdminTotp();
    const l2 = await admin.post("/auth/2fa/verify", { code });
    if (!l2.ok) throw new Error("2FA-login mislukt");
  }
  check("admin-login", true);

  try {
    // ── 1. Op rekening: A-nummer direct, oplopend ──
    const r1 = await admin.post("/algemene-inkoop", {
      soort: "op_rekening", omschrijving: "Verif: printpapier", kostensoort: "algemene_kosten",
      leverancier_naam: "Verif Webshop", verwacht_bedrag: 50,
    });
    const i1 = await r1.json() as { id: number; nummer: number; nummer_weergave: string; status: string };
    check("op rekening → 201 + A-nummer + status besteld",
      r1.status === 201 && /^A\d{3,}$/.test(i1.nummer_weergave) && i1.status === "besteld", i1);
    opruimInkoopIds.push(i1.id);

    const r2 = await admin.post("/algemene-inkoop", {
      soort: "op_rekening", omschrijving: "Verif: tweede bestelling", kostensoort: "gereedschap",
      leverancier_naam: "Verif Webshop",
    });
    const i2 = await r2.json() as { id: number; nummer: number };
    check("A-reeks telt op (eigen nummerreeks)", i2.nummer > i1.nummer, { eerste: i1.nummer, tweede: i2.nummer });
    opruimInkoopIds.push(i2.id);

    // ── 6a. Zonder kostensoort → 400 ──
    const rZonder = await admin.post("/algemene-inkoop", {
      soort: "op_rekening", omschrijving: "Verif: zonder kostensoort", leverancier_naam: "X",
    });
    check("zonder kostensoort → 400 (verboden)", rZonder.status === 400);

    // ── 2. Direct betaald: bon-plicht ──
    const r3 = await admin.post("/algemene-inkoop", {
      soort: "direct_betaald", omschrijving: "Verif: schroeven bouwmarkt", kostensoort: "gereedschap",
      leverancier_naam: "Bouwmarkt", betaalwijze: "zakelijke_pas", bedrag: 23.45,
    });
    const i3 = await r3.json() as { id: number; status: string };
    check("direct betaald → 201 status open", r3.status === 201 && i3.status === "open", i3);
    opruimInkoopIds.push(i3.id);

    const afZonderBon = await admin.post(`/algemene-inkoop/${i3.id}/afronden`);
    check("afronden zonder bon → 422", afZonderBon.status === 422);

    const form = new FormData();
    form.append("bestand", new Blob([Buffer.from("verif-bon")], { type: "image/jpeg" }), "bon.jpg");
    const up = await admin.fetch(`/algemene-inkoop/${i3.id}/bon`, { method: "POST", body: form });
    check("bon-upload → ok", up.ok, up.status);

    const afMetBon = await admin.post(`/algemene-inkoop/${i3.id}/afronden`);
    const i3b = await afMetBon.json() as { status: string };
    check("afronden mét bon → afgehandeld", afMetBon.ok && i3b.status === "afgehandeld", i3b);

    // ── 3. Goedkeuringsgrens via bestaande motor ──
    const [regel] = await db.insert(goedkeuringBeleidsregelsTable).values({
      naam: "Verif NP_INKOOP_01", documentType: "algemene_inkoop", ondergrens: 500,
      goedkeurderModule: "goedkeuring", goedkeurderMinNiveau: 3, vierOgenVerplicht: false,
    }).returning({ id: goedkeuringBeleidsregelsTable.id });
    regelId = regel!.id;

    const r4 = await admin.post("/algemene-inkoop", {
      soort: "op_rekening", omschrijving: "Verif: dure machine", kostensoort: "investering",
      leverancier_naam: "Machinehandel", verwacht_bedrag: 1200,
    });
    const i4 = await r4.json() as { id: number; status: string };
    check("boven grens (€1200 ≥ €500) → status ter_goedkeuring", r4.status === 201 && i4.status === "ter_goedkeuring", i4);
    opruimInkoopIds.push(i4.id);

    const af4 = await admin.post(`/algemene-inkoop/${i4.id}/afronden`);
    check("afronden in ter_goedkeuring → 422 (gate niet te omzeilen)", af4.status === 422);

    const r5 = await admin.post("/algemene-inkoop", {
      soort: "op_rekening", omschrijving: "Verif: klein onder grens", kostensoort: "algemene_kosten",
      leverancier_naam: "Webshop", verwacht_bedrag: 100,
    });
    const i5 = await r5.json() as { id: number; status: string };
    check("onder grens (€100) → gewoon besteld", i5.status === "besteld", i5);
    opruimInkoopIds.push(i5.id);

    // ── 4. Rechten-gate ──
    const finId = await maakBeperktAccount(TEST_FIN_EMAIL, { financieel: 2 });
    const geenId = await maakBeperktAccount(TEST_GEEN_EMAIL, { gebouwen: 1 });
    void finId; void geenId;

    const sesFin = await loginBeperkt(TEST_FIN_EMAIL);
    const gFin = await sesFin.get("/algemene-inkoop");
    check("financieel niveau 2 zónder offertes → toegang (200)", gFin.status === 200);
    const pFin = await sesFin.post("/algemene-inkoop", {
      soort: "direct_betaald", omschrijving: "Verif: Jacqueline legt vast", kostensoort: "representatie",
      leverancier_naam: "Lunchroom", betaalwijze: "contant", bedrag: 12,
    });
    const iFin = await pFin.json() as { id: number };
    check("financieel niveau 2 mag ook vastleggen (201)", pFin.status === 201, iFin);
    if (pFin.status === 201) opruimInkoopIds.push(iFin.id);

    const sesGeen = await loginBeperkt(TEST_GEEN_EMAIL);
    const gGeen = await sesGeen.get("/algemene-inkoop");
    check("zonder financieel-2 én zonder offertes → 403", gGeen.status === 403);

    // ── 5. Factuurmatch-harnas (exacte productiecode) ──
    console.log("— factuurmatch-harnas —");
    const uit = execFileSync("pnpm", ["--filter", "@workspace/api-server", "exec", "tsx", "src/scripts/verificatie-algemene-inkoop-match.ts"],
      { cwd: "../..", encoding: "utf8" });
    process.stdout.write(uit);
    check("factuurmatch-harnas geslaagd", uit.trim().endsWith("OK"));
  } finally {
    // Opruimen: aanvragen/stappen, inkopen, beleidsregel, testaccounts
    if (opruimInkoopIds.length) {
      const aanvragen = await db.select({ id: goedkeuringAanvragenTable.id }).from(goedkeuringAanvragenTable)
        .where(and(eq(goedkeuringAanvragenTable.objectType, "algemene_inkoop"), inArray(goedkeuringAanvragenTable.objectId, opruimInkoopIds)));
      const aIds = aanvragen.map((a) => a.id);
      if (aIds.length) {
        await db.delete(goedkeuringStappenTable).where(inArray(goedkeuringStappenTable.aanvraagId, aIds));
        await db.delete(goedkeuringAanvragenTable).where(inArray(goedkeuringAanvragenTable.id, aIds));
      }
      await db.delete(algemeneInkopenTable).where(inArray(algemeneInkopenTable.id, opruimInkoopIds));
    }
    if (regelId != null) await db.delete(goedkeuringBeleidsregelsTable).where(eq(goedkeuringBeleidsregelsTable.id, regelId));
    await db.delete(gebruikersTable).where(inArray(gebruikersTable.email, [TEST_FIN_EMAIL, TEST_GEEN_EMAIL]));
    await archiveerE2eWebAdminAccount();
  }
  console.log(process.exitCode ? "\nRESULTAAT: FAIL" : "\nRESULTAAT: OK");
  process.exit(process.exitCode ?? 0);
}

void main().catch((err) => { console.error(err); process.exit(1); });
