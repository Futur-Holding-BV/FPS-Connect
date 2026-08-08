// Gedragsbewijs Task #835 — offerte-verzendmail end-to-end na de kenmerk-bevriezing.
//
// Bewijst via het ECHTE verzendpad (POST /offertes/:id/verzenden, Microsoft Graph,
// gedeelde postbus) dat:
//  1. Een testoferte via het echte mail-kanaal wordt verstuurd (dev, intern testadres
//     = de gedeelde postbus zelf); Graph accepteert het bericht (202 achter de schermen).
//  2. mail_logboek een succes-rij bevat (soort=offerte, status=verzonden/succes).
//  3. De offerte daarna op portaal_status 'verzonden' staat.
//  4. Het kenmerk bevroren is: gebouwwissel op de calculatie verandert het niet meer,
//     en PATCH op de offerte geeft 409.
//  5. De portaallink uit de respons werkt (publieke GET /portaal/:token → 200 met data).
//
// Kanaalcontrole (bewijs-vs-inferentie): het app-token heeft alleen Mail.Send,
// géén Mail.Read — de inbox van de postbus kan dus niet programmatisch gelezen
// worden. "Aankomst" wordt bewezen op het sterkst beschikbare niveau: Graph
// sendMail-acceptatie (geen MailFout) + succes-rij in mail_logboek.
//
// Uitsluitend voor de dev-omgeving; ruimt alles zelf op.
import { authenticator } from "otplib";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import {
  setupE2eWachtwoordAccounts,
  E2E_WW_ADMIN_EMAIL,
  E2E_WW_ADMIN_WACHTWOORD,
  E2E_WW_ADMIN_TOTP_SECRET,
} from "./e2e-wachtwoord-testaccounts";

const DOMEIN = process.env.REPLIT_DEV_DOMAIN;
if (!DOMEIN) {
  console.error("REPLIT_DEV_DOMAIN ontbreekt.");
  process.exit(1);
}
const BASIS = `https://${DOMEIN}/api`;
const TESTADRES = process.env.MAIL_MAILBOX ?? "app@fpsbrandpreventie.nl";

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
  post(pad: string, body?: unknown) {
    return this.fetch(pad, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
  }
  patch(pad: string, body?: unknown) {
    return this.fetch(pad, { method: "PATCH", body: JSON.stringify(body) });
  }
  get(pad: string) {
    return this.fetch(pad);
  }
}

async function json<T = any>(res: Response): Promise<T> {
  const t = await res.text();
  try {
    return JSON.parse(t) as T;
  } catch {
    return t as unknown as T;
  }
}

function eis(cond: unknown, stap: string, detail: string) {
  if (!cond) throw new Error(`FAIL [${stap}] ${detail}`);
}

function log(msg: string) {
  console.log(msg);
}

async function versTotp(secret: string): Promise<string> {
  // Codegrens: als het venster bijna om is, wacht even zodat de code geldig blijft.
  const rest = 30 - (Math.floor(Date.now() / 1000) % 30);
  if (rest < 5) await new Promise((r) => setTimeout(r, (rest + 1) * 1000));
  return authenticator.generate(secret);
}

async function scalar<T = unknown>(q: string): Promise<T | null> {
  const r = await db.execute(sql.raw(q));
  const rows = (r as any).rows ?? r;
  return rows.length ? (Object.values(rows[0])[0] as T) : null;
}

async function main() {
  await fetch(`${BASIS}/auth/e2e-rate-reset`, { method: "POST" }).catch(() => {});
  await setupE2eWachtwoordAccounts();
  const admin = new Sessie();
  const r1 = await admin.post("/auth/login", { email: E2E_WW_ADMIN_EMAIL, wachtwoord: E2E_WW_ADMIN_WACHTWOORD });
  const b1 = await json(r1);
  eis(r1.status === 200 && b1.status === "verify_2fa", "login", `${r1.status} ${JSON.stringify(b1)}`);
  const r2 = await admin.post("/auth/2fa/verify", { code: await versTotp(E2E_WW_ADMIN_TOTP_SECRET) });
  eis(r2.status === 200, "2fa", `${r2.status}`);
  log("Admin ingelogd (wachtwoord + TOTP).");

  const opruim: string[] = [];
  try {
    // ── Setup: BV + gebouw + calculatie + offerte via echte HTTP-routes ─────
    await db.execute(sql.raw(`DELETE FROM gebouwen WHERE naam LIKE 'BEWIJS835%'`)).catch(() => {});
    await db.execute(sql.raw(`DELETE FROM werkgevers WHERE naam = 'BEWIJS835 BV'`)).catch(() => {});
    const werkgeverId = await scalar<number>(
      `INSERT INTO werkgevers (naam, kenmerk_prefix) VALUES ('BEWIJS835 BV', 'BM') RETURNING id`,
    );
    opruim.push(`DELETE FROM werkgevers WHERE id = ${werkgeverId}`);

    const geb = await json(await admin.post("/gebouwen", { naam: "BEWIJS835 pand", adres: "Mailstraat 1", stad: "Testdam", werkgever_id: werkgeverId }));
    eis(geb?.id, "setup", `gebouw aanmaken faalde: ${JSON.stringify(geb).slice(0, 200)}`);
    opruim.push(`DELETE FROM gebouwen WHERE id = ${geb.id}`);

    const geb2 = await json(await admin.post("/gebouwen", { naam: "BEWIJS835 pand B", adres: "Mailstraat 2", stad: "Testdam", werkgever_id: werkgeverId }));
    eis(geb2?.id, "setup", "tweede gebouw aanmaken faalde");
    opruim.push(`DELETE FROM gebouwen WHERE id = ${geb2.id}`);

    const calc = await json(await admin.post("/modules/calculaties", { naam: "BEWIJS835 calc", gebouw_id: geb.id }));
    eis(calc?.id, "setup", `calculatie faalde: ${JSON.stringify(calc).slice(0, 200)}`);
    opruim.push(`DELETE FROM mod_calc_headers WHERE id = ${calc.id}`);

    const rOff = await admin.post("/offertes", { titel: "BEWIJS835 verzendmail-test", gebouw_id: geb.id, calculatie_id: calc.id, opdrachtgever: "E2E Testklant" });
    const off = await json(rOff);
    eis(rOff.status === 201, "setup", `offerte: ${rOff.status} ${JSON.stringify(off).slice(0, 200)}`);
    opruim.push(`DELETE FROM offertes WHERE id = ${off.id}`);
    const verwachtKenmerk = `BM-${geb.werknummer}/C${String(calc.nummer).padStart(3, "0")}/O${String(off.nummer).padStart(3, "0")}`;
    eis(off.kenmerk === verwachtKenmerk, "setup", `kenmerk klopt niet: ${off.kenmerk} ≠ ${verwachtKenmerk}`);
    log(`Setup gereed — offerte ${off.id} met kenmerk ${verwachtKenmerk}.`);

    const logboekVoor = (await scalar<number>(`SELECT COALESCE(MAX(id),0) FROM mail_logboek`)) ?? 0;

    // ── 1: echt verzenden via Microsoft Graph naar intern testadres ─────────
    const onderwerp = `BEWIJS835 offerteverzending ${new Date().toISOString()}`;
    const rVerz = await admin.post(`/offertes/${off.id}/verzenden`, {
      naar_email: TESTADRES,
      naar_naam: "FPS Connect testpostbus",
      onderwerp,
      tekst: "Automatische end-to-end-test van het offerteverzendpad (task #835). Deze mail mag genegeerd worden.",
    });
    const verz = await json(rVerz);
    eis(rVerz.status === 200 && verz.ok === true, "1", `verzenden gaf ${rVerz.status}: ${JSON.stringify(verz).slice(0, 300)}`);
    eis(typeof verz.portaal_link === "string" && verz.portaal_link.includes("/portaal/"), "1", `geen portaallink: ${JSON.stringify(verz)}`);
    log(`1 PASS — POST /offertes/${off.id}/verzenden → 200, Graph accepteerde de mail naar ${TESTADRES}.`);

    // ── 2: mail_logboek bevat een succes-rij voor deze verzending ───────────
    const logRij = await db.execute(sql.raw(
      `SELECT soort, status, fout_categorie, naar_email FROM mail_logboek WHERE id > ${logboekVoor} AND onderwerp = '${onderwerp.replace(/'/g, "''")}' ORDER BY id DESC LIMIT 1`,
    ));
    const rijen = (logRij as any).rows ?? logRij;
    eis(rijen.length === 1, "2", `geen mail_logboek-rij gevonden voor onderwerp "${onderwerp}"`);
    const rij = rijen[0] as any;
    eis(rij.soort === "offerte" && rij.naar_email === TESTADRES && !rij.fout_categorie && /verzonden|succes|success/i.test(String(rij.status)),
      "2", `logboekrij fout: ${JSON.stringify(rij)}`);
    log(`2 PASS — mail_logboek: soort=offerte, status=${rij.status}, geen foutcategorie.`);

    // ── 3: offerte staat op verzonden ────────────────────────────────────────
    const offNa = await json(await admin.get(`/offertes/${off.id}`));
    eis(offNa.portaal_status === "verzonden", "3", `portaal_status=${offNa.portaal_status}`);
    log("3 PASS — offerte staat op portaal_status 'verzonden'.");

    // ── 4: kenmerk bevroren + read-only ──────────────────────────────────────
    eis(offNa.kenmerk === verwachtKenmerk, "4", `kenmerk na verzenden: ${offNa.kenmerk}`);
    await admin.patch(`/modules/calculaties/${calc.id}`, { gebouw_id: geb2.id });
    const offNaWissel = await json(await admin.get(`/offertes/${off.id}`));
    eis(offNaWissel.kenmerk === verwachtKenmerk, "4", `bevroren kenmerk veranderde: ${offNaWissel.kenmerk}`);
    const rPatch = await admin.patch(`/offertes/${off.id}`, { titel: "mag niet" });
    eis(rPatch.status === 409, "4", `PATCH op verzonden offerte gaf ${rPatch.status}, verwacht 409`);
    log(`4 PASS — kenmerk blijft ${verwachtKenmerk} na gebouwwissel; PATCH → 409.`);

    // ── 5: portaallink werkt (publiek, zonder sessie) ────────────────────────
    const token = String(verz.portaal_link).split("/portaal/")[1]?.split("?")[0];
    eis(token, "5", `geen token uit link: ${verz.portaal_link}`);
    const rPortaal = await fetch(`${BASIS}/portaal/${token}`);
    const portaal = await json(rPortaal);
    eis(rPortaal.status === 200, "5", `portaal gaf ${rPortaal.status}: ${JSON.stringify(portaal).slice(0, 200)}`);
    const portaalTitel = portaal?.offerte?.titel ?? portaal?.titel;
    eis(portaalTitel === "BEWIJS835 verzendmail-test", "5", `portaal toont verkeerde offerte: ${JSON.stringify(portaal).slice(0, 300)}`);
    log(`5 PASS — publieke portaallink werkt (${verz.portaal_link}).`);

    console.log("\nALLE PUNTEN GESLAAGD — offerteverzendmail werkt end-to-end na de kenmerk-bevriezing.");
  } finally {
    for (const q of opruim.reverse()) await db.execute(sql.raw(q)).catch((e) => console.error(`opruimen faalde: ${q}: ${e.message}`));
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e.message ?? e);
    process.exit(1);
  });
