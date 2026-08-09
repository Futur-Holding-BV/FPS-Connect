// Task 844 — gedragsbewijs AI-afstootadvies wagenpark:
//  1. Seed twee voertuigen met eigen kostendata (één duur/oud, één goedkoop/jong).
//  2. Login hoofdbeheerder (wachtwoord + TOTP), POST /wagenpark/afstoot-advies.
//  3. Eisen: elk actief voertuig krijgt een advies uit de whitelist, met
//     onderbouwing; vlootmedianen komen uit eigen data; niets wordt gewijzigd
//     (statussen blijven ongewijzigd = advies is voorstel, geen actie).
//
// Draaien: pnpm --filter @workspace/scripts exec tsx src/bewijs-wagenpark-afstootadvies.ts
import { authenticator } from "otplib";
import { db, voertuigenTable } from "@workspace/db";
import { wagenparkKostenTable, wagenparkOnderhoudTable } from "@workspace/db/schema";
import { eq, like } from "drizzle-orm";
import {
  setupE2eWachtwoordAccounts,
  E2E_WW_ADMIN_EMAIL,
  E2E_WW_ADMIN_WACHTWOORD,
  E2E_WW_ADMIN_TOTP_SECRET,
} from "./e2e-wachtwoord-testaccounts";

const DOMEIN = process.env.REPLIT_DEV_DOMAIN;
if (!DOMEIN) { console.error("REPLIT_DEV_DOMAIN ontbreekt."); process.exit(1); }
const BASIS = `https://${DOMEIN}/api`;
const MARK = "BEWIJS_AFSTOOT844";

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
  post(pad: string, body?: unknown) { return this.fetch(pad, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }); }
  get(pad: string) { return this.fetch(pad); }
}

async function json<T = any>(res: Response): Promise<T> {
  const t = await res.text();
  try { return JSON.parse(t) as T; } catch { return t as unknown as T; }
}
function eis(v: boolean, stap: string, detail: string): void {
  if (!v) throw new Error(`FAIL — ${stap}: ${detail}`);
}
async function versTotp(secret: string): Promise<string> {
  if (authenticator.timeRemaining() < 10) await new Promise(r => setTimeout(r, (authenticator.timeRemaining() + 1) * 1000));
  return authenticator.generate(secret);
}

async function main(): Promise<void> {
  console.log(`Task 844 bewijs — ${new Date().toISOString()} — doel: ${BASIS}`);
  const opruimen: Array<() => Promise<void>> = [];
  try {
    await setupE2eWachtwoordAccounts();
    await db.delete(voertuigenTable).where(like(voertuigenTable.merk, `%${MARK}%`));

    // ── Seed: duur/oud voertuig + goedkoop/jong voertuig met eigen kosten ──
    const [duur] = await db.insert(voertuigenTable).values({
      kenteken: "AF-844-D", merk: MARK, type: "Transit oud", bouwjaar: 2014, kmStand: 285000,
    }).returning();
    const [goedkoop] = await db.insert(voertuigenTable).values({
      kenteken: "AF-844-G", merk: MARK, type: "Transit nieuw", bouwjaar: 2024, kmStand: 22000,
    }).returning();
    // Data-arm voertuig: 0 kostenregels — mag NOOIT vervangen/afstoten krijgen.
    const [dataArm] = await db.insert(voertuigenTable).values({
      kenteken: "AF-844-X", merk: MARK, type: "Transit zonder data", bouwjaar: 2016, kmStand: 190000,
    }).returning();
    // Voertuig met kosten UITSLUITEND op onderhoudsmeldingen (wagenpark_onderhoud.kosten):
    // bewijst dat die bron niet stilzwijgend genegeerd wordt.
    const [onderhoudDuur] = await db.insert(voertuigenTable).values({
      kenteken: "AF-844-O", merk: MARK, type: "Transit onderhoudsduur", bouwjaar: 2013, kmStand: 310000,
    }).returning();
    opruimen.push(async () => {
      await db.delete(wagenparkKostenTable).where(eq(wagenparkKostenTable.voertuigId, duur!.id));
      await db.delete(wagenparkKostenTable).where(eq(wagenparkKostenTable.voertuigId, goedkoop!.id));
      await db.delete(wagenparkOnderhoudTable).where(eq(wagenparkOnderhoudTable.voertuigId, onderhoudDuur!.id));
      await db.delete(voertuigenTable).where(eq(voertuigenTable.id, duur!.id));
      await db.delete(voertuigenTable).where(eq(voertuigenTable.id, goedkoop!.id));
      await db.delete(voertuigenTable).where(eq(voertuigenTable.id, dataArm!.id));
      await db.delete(voertuigenTable).where(eq(voertuigenTable.id, onderhoudDuur!.id));
    });
    const nu = new Date();
    const mnd = (n: number) => new Date(nu.getTime() - n * 30 * 86_400_000);
    await db.insert(wagenparkKostenTable).values([
      { voertuigId: duur!.id, categorie: "onderhoud", bedrag: 2850, datum: mnd(2), omschrijving: "grote beurt + koppeling" },
      { voertuigId: duur!.id, categorie: "onderhoud", bedrag: 1740, datum: mnd(5), omschrijving: "remmen + distributie" },
      { voertuigId: duur!.id, categorie: "schade", bedrag: 980, datum: mnd(8) },
      { voertuigId: duur!.id, categorie: "brandstof", bedrag: 3200, datum: mnd(1) },
      { voertuigId: goedkoop!.id, categorie: "onderhoud", bedrag: 240, datum: mnd(4), omschrijving: "kleine beurt" },
      { voertuigId: goedkoop!.id, categorie: "brandstof", bedrag: 1100, datum: mnd(1) },
    ]);
    // Alleen onderhoudsmeldingen met bedrag (geen kostentabel-regels): totaal €7300 afgelopen 12 mnd.
    await db.insert(wagenparkOnderhoudTable).values([
      { voertuigId: onderhoudDuur!.id, type: "reparatie", omschrijving: "motorrevisie", status: "afgerond", kosten: 4200, afgerondDatum: mnd(3) },
      { voertuigId: onderhoudDuur!.id, type: "reparatie", omschrijving: "versnellingsbak", status: "afgerond", kosten: 2300, afgerondDatum: mnd(6) },
      { voertuigId: onderhoudDuur!.id, type: "onderhoud", omschrijving: "grote beurt", status: "afgerond", kosten: 800, afgerondDatum: mnd(9) },
    ]);
    console.log(`Seed klaar: voertuigen ${duur!.id} (duur/oud) en ${goedkoop!.id} (goedkoop/jong) met kostendata.`);

    // ── Login + advies genereren ──
    const s = new Sessie();
    const r1 = await s.post("/auth/login", { email: E2E_WW_ADMIN_EMAIL, wachtwoord: E2E_WW_ADMIN_WACHTWOORD });
    const b1 = await json(r1);
    eis(r1.status === 200 && b1.status === "verify_2fa", "login", `${r1.status} ${JSON.stringify(b1)}`);
    const r2 = await s.post("/auth/2fa/verify", { code: await versTotp(E2E_WW_ADMIN_TOTP_SECRET) });
    eis(r2.status === 200, "2fa", `${r2.status}`);
    console.log("Login als hoofdbeheerder geslaagd.");

    const statusVoor = (await db.select({ s: voertuigenTable.status }).from(voertuigenTable).where(eq(voertuigenTable.id, duur!.id)))[0]!.s;

    const rA = await s.post("/wagenpark/afstoot-advies");
    const advies = await json(rA);
    eis(rA.status === 200, "afstoot-advies status", `${rA.status} ${JSON.stringify(advies).slice(0, 300)}`);
    eis(typeof advies.gegenereerd_op === "string", "gegenereerd_op", JSON.stringify(advies).slice(0, 200));
    eis(advies.vlootmedianen && typeof advies.vlootmedianen.voertuigen_totaal === "number", "vlootmedianen", JSON.stringify(advies.vlootmedianen));
    eis(Array.isArray(advies.adviezen) && advies.adviezen.length >= 2, "adviezen-lijst", `lengte ${advies.adviezen?.length}`);

    const whitelist = ["behouden", "monitoren", "vervangen", "afstoten"];
    for (const a of advies.adviezen) {
      eis(whitelist.includes(a.advies), "advies-whitelist", JSON.stringify(a));
      eis(typeof a.onderbouwing === "string" && a.onderbouwing.length > 10, "onderbouwing aanwezig", JSON.stringify(a));
    }
    const advDuur = advies.adviezen.find((a: any) => a.voertuig_id === duur!.id);
    const advGoedkoop = advies.adviezen.find((a: any) => a.voertuig_id === goedkoop!.id);
    const advDataArm = advies.adviezen.find((a: any) => a.voertuig_id === dataArm!.id);
    eis(!!advDuur && !!advGoedkoop && !!advDataArm, "alle testvoertuigen beoordeeld", JSON.stringify(advies.adviezen.map((a: any) => a.voertuig_id)));
    // Kernregel (server-side afgedwongen): zonder eigen kostendata nooit vervangen/afstoten.
    eis(["behouden", "monitoren"].includes(advDataArm.advies), "data-arm voertuig nooit vervangen/afstoten", JSON.stringify(advDataArm));
    // Onderhoudsmeldingskosten tellen mee als bewijs (bron niet stilzwijgend genegeerd):
    const advOnderhoud = advies.adviezen.find((a: any) => a.voertuig_id === onderhoudDuur!.id);
    eis(!!advOnderhoud, "onderhoudsduur voertuig beoordeeld", JSON.stringify(advies.adviezen.map((a: any) => a.voertuig_id)));
    eis(Math.abs(advOnderhoud.kosten_laatste_12m - 7300) < 0.01, "onderhoud.kosten meegeteld in 12m-bewijs", JSON.stringify(advOnderhoud));
    eis(advOnderhoud.aantal_kostenregels === 3, "onderhoudsregels tellen als kostenregels", JSON.stringify(advOnderhoud));
    console.log(`Onderhoudsduur voertuig → advies: ${advOnderhoud.advies} | 12m-kosten €${advOnderhoud.kosten_laatste_12m} | ${advOnderhoud.onderbouwing}`);
    console.log(`Duur/oud voertuig → advies: ${advDuur.advies} | ${advDuur.onderbouwing}`);
    console.log(`Goedkoop/jong voertuig → advies: ${advGoedkoop.advies} | ${advGoedkoop.onderbouwing}`);
    console.log(`Data-arm voertuig → advies: ${advDataArm.advies} | ${advDataArm.onderbouwing}`);
    console.log(`Vlootmedianen: ${JSON.stringify(advies.vlootmedianen)}`);
    if (advies.samenvatting) console.log(`Samenvatting: ${advies.samenvatting}`);

    // ── Niets automatisch gewijzigd ──
    const statusNa = (await db.select({ s: voertuigenTable.status }).from(voertuigenTable).where(eq(voertuigenTable.id, duur!.id)))[0]!.s;
    eis(statusVoor === statusNa, "geen automatische wijziging", `${statusVoor} → ${statusNa}`);
    console.log("Voertuigstatus onveranderd — advies is een voorstel, mens beslist.");

    console.log("\nALLE STAPPEN GESLAAGD ✅");
  } finally {
    for (const f of opruimen.reverse()) { try { await f(); } catch (e) { console.error("opruimen faalde:", e); } }
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
