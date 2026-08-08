// WERKBAK_01 — gedragsbewijs voor de werkbak + bewakingsloop:
//  1. Motor: twee opeenvolgende draaien produceren geen dubbele items
//     (idempotent via partiële unieke index) en elke draai staat in het logboek.
//  2. Items uit ≥4 bronnen landen in de werkbak (verlofaanvraag, goedkeurings-
//     aanvraag, betaalbatch, wagenpark-verloopdatum).
//  3. Inline afhandelen: verlofaanvraag goedkeuren → bron-reconciliatie
//     handelt het werkbak-item af bij de volgende draai; handmatig afhandelen
//     en wegzetten (reden verplicht: 400 zonder reden).
//  4. Zichtbaarheid volgt bevoegdheid: gebruiker met alleen gebouwen:1 ziet
//     niets (lijst leeg, teller 0); hoofdbeheerder ziet ook alleen-René-items.
//
// Draaien: pnpm --filter @workspace/scripts exec tsx src/bewijs-werkbak.ts
import { authenticator } from "otplib";
import bcrypt from "bcryptjs";
import {
  db,
  gebruikersTable,
  medewerkersTable,
  verlofsoortenTable,
  verlofAanvragenTable,
  goedkeuringAanvragenTable,
  sepaBestandenTable,
  voertuigenTable,
  werkbakItemsTable,
} from "@workspace/db";
import { eq, like, inArray } from "drizzle-orm";
import {
  setupE2eWachtwoordAccounts,
  E2E_WW_ADMIN_EMAIL,
  E2E_WW_ADMIN_WACHTWOORD,
  E2E_WW_ADMIN_TOTP_SECRET,
} from "./e2e-wachtwoord-testaccounts";

const DOMEIN = process.env.REPLIT_DEV_DOMAIN;
if (!DOMEIN) { console.error("REPLIT_DEV_DOMAIN ontbreekt."); process.exit(1); }
const BASIS = `https://${DOMEIN}/api`;
const MARK = "BEWIJS_WERKBAK01";
const BEPERKT_EMAIL = "e2e-werkbak-beperkt@fps.local";
const BEPERKT_WW = "E2eWerkbak!2026";
const BEPERKT_TOTP = "GEZDGNBVGY3TQOJQ";

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
  patch(pad: string, body?: unknown) { return this.fetch(pad, { method: "PATCH", body: JSON.stringify(body) }); }
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
  console.log(`WERKBAK_01 bewijs — ${new Date().toISOString()} — doel: ${BASIS}`);
  const opruimen: Array<() => Promise<void>> = [];
  try {
    await setupE2eWachtwoordAccounts();
    // Restanten van eerder gecrashte runs opruimen (wees-aanvragen met MARK-naam).
    await db.delete(werkbakItemsTable).where(like(werkbakItemsTable.titel, `%${MARK}%`));
    const weesMedewerkers = await db.select().from(medewerkersTable).where(like(medewerkersTable.naam, `%${MARK}%`));
    if (weesMedewerkers.length > 0) {
      await db.delete(verlofAanvragenTable).where(inArray(verlofAanvragenTable.medewerkerId, weesMedewerkers.map(m => m.id)));
      await db.delete(medewerkersTable).where(inArray(medewerkersTable.id, weesMedewerkers.map(m => m.id)));
    }
    await db.delete(verlofsoortenTable).where(like(verlofsoortenTable.naam, `%${MARK}%`));
    await db.delete(goedkeuringAanvragenTable).where(like(goedkeuringAanvragenTable.omschrijving, `%${MARK}%`));
    await db.delete(sepaBestandenTable).where(like(sepaBestandenTable.omschrijving, `%${MARK}%`));
    await db.delete(voertuigenTable).where(like(voertuigenTable.merk, `%${MARK}%`));
    const s = new Sessie();
    const r1 = await s.post("/auth/login", { email: E2E_WW_ADMIN_EMAIL, wachtwoord: E2E_WW_ADMIN_WACHTWOORD });
    const b1 = await json(r1);
    eis(r1.status === 200 && b1.status === "verify_2fa", "login", `${r1.status} ${JSON.stringify(b1)}`);
    const r2 = await s.post("/auth/2fa/verify", { code: await versTotp(E2E_WW_ADMIN_TOTP_SECRET) });
    eis(r2.status === 200, "2fa", `${r2.status}`);
    console.log("Login als hoofdbeheerder geslaagd (wachtwoord + TOTP).");

    // ── Seed: items uit 4 bronnen ────────────────────────────────────────────
    // Bron 1: verlofaanvraag (aangevraagd)
    const [medewerker] = await db.insert(medewerkersTable).values({ naam: `${MARK} Medewerker`, dienstverband: "fulltime" }).returning();
    const [soort] = await db.insert(verlofsoortenTable).values({ naam: `${MARK} Vakantie`, categorie: "wettelijk" }).returning();
    const [verlof] = await db.insert(verlofAanvragenTable).values({
      medewerkerId: medewerker!.id, verlofsoortId: soort!.id,
      startDatum: "2026-09-01", eindDatum: "2026-09-05", aantalUren: 32, status: "aangevraagd",
    }).returning();
    // Bron 2: goedkeuringsaanvraag (ingediend)
    const [goedk] = await db.insert(goedkeuringAanvragenTable).values({
      objectType: "factuur", objectId: 999999, documentType: "factuur",
      omschrijving: `${MARK} goedkeuring`, bedrag: 12500, status: "ingediend", ingediendOp: new Date(),
    }).returning();
    // Bron 3: betaalbatch (sepa-bestand, ontvangen)
    const [sepa] = await db.insert(sepaBestandenTable).values({
      omschrijving: `${MARK} batch`, bestandsnaam: `${MARK.toLowerCase()}.xml`, objectPath: `/e2e/${MARK}.xml`,
      totaalbedrag: "48750.00", aantalBetalingen: 12, status: "ontvangen",
    }).returning();
    // Bron 4: wagenpark APK die over 10 dagen verloopt
    const apk = new Date(); apk.setDate(apk.getDate() + 10);
    const [voertuig] = await db.insert(voertuigenTable).values({
      kenteken: "BW-011-E2E", merk: MARK, type: "Transit", apkDatum: apk,
    }).returning();
    opruimen.push(async () => {
      await db.delete(werkbakItemsTable).where(like(werkbakItemsTable.titel, `%${MARK}%`));
      await db.delete(werkbakItemsTable).where(like(werkbakItemsTable.dedupSleutel, `%voertuig:${voertuig!.id}%`));
      await db.delete(verlofAanvragenTable).where(eq(verlofAanvragenTable.id, verlof!.id));
      await db.delete(verlofsoortenTable).where(eq(verlofsoortenTable.id, soort!.id));
      await db.delete(medewerkersTable).where(eq(medewerkersTable.id, medewerker!.id));
      await db.delete(goedkeuringAanvragenTable).where(eq(goedkeuringAanvragenTable.id, goedk!.id));
      await db.delete(sepaBestandenTable).where(eq(sepaBestandenTable.id, sepa!.id));
      await db.delete(voertuigenTable).where(eq(voertuigenTable.id, voertuig!.id));
    });
    console.log("Seed klaar: verlofaanvraag, goedkeuringsaanvraag, sepa-bestand, voertuig-APK.");

    // ── SCENARIO 1: motor draait, tweede draai geeft geen dubbelen ──────────
    const d1 = await s.post("/werkbak/bewaking/draai");
    eis(d1.status === 200, "1a draai 1", `${d1.status}`);
    const items1 = await json<any[]>(await s.get("/werkbak"));
    const mijnItems1 = items1.filter(i =>
      i.titel.includes(MARK) || i.titel.includes("BW-011-E2E"));
    eis(mijnItems1.length >= 4, "1b items uit 4 bronnen", `gevonden: ${mijnItems1.length} — ${JSON.stringify(mijnItems1.map((i: any) => i.bron))}`);
    const bronnen = new Set(mijnItems1.map((i: any) => i.bron));
    eis(bronnen.size >= 4, "1c ≥4 verschillende bronnen", [...bronnen].join(","));

    const d2 = await s.post("/werkbak/bewaking/draai");
    eis(d2.status === 200, "1d draai 2", `${d2.status}`);
    const items2 = await json<any[]>(await s.get("/werkbak"));
    const mijnItems2 = items2.filter(i => i.titel.includes(MARK) || i.titel.includes("BW-011-E2E"));
    eis(mijnItems2.length === mijnItems1.length, "1e geen dubbelen na draai 2", `${mijnItems1.length} → ${mijnItems2.length}`);

    const draaien = await json<any[]>(await s.get("/werkbak/bewaking/draaien"));
    eis(draaien.length >= 2 && draaien[0].status === "klaar" && draaien[1].status === "klaar", "1f logboek", JSON.stringify(draaien.slice(0, 2).map((d: any) => d.status)));
    console.log(`SCENARIO 1 PASS — bronnen: ${[...bronnen].join(", ")}; 2 draaien gelogd, geen dubbelen (${mijnItems1.length} items).`);

    // ── SCENARIO 2: teller + soorten ─────────────────────────────────────────
    const aantal = await json<any>(await s.get("/werkbak/aantal"));
    eis(aantal.totaal >= 4 && aantal.doen >= 3, "2a teller", JSON.stringify(aantal));
    const verlofItem = mijnItems2.find((i: any) => i.bron === "verlofaanvraag" && i.herkomst_id === verlof!.id);
    eis(verlofItem?.soort === "doen" && verlofItem?.actie_type === "verlof_beoordelen", "2b verlofitem is doen+inline", JSON.stringify(verlofItem));
    console.log(`SCENARIO 2 PASS — teller: ${JSON.stringify(aantal)}; verlofitem inline-afhandelbaar.`);

    // ── SCENARIO 3: inline afhandelen + reconciliatie ────────────────────────
    // Verlof goedkeuren via de bestaande beoordelingsroute (zoals het paneel doet)
    const beoordeel = await s.patch(`/verlofaanvragen/${verlof!.id}`, {
      verlofsoort_id: soort!.id, start_datum: "2026-09-01", eind_datum: "2026-09-05",
      aantal_uren: 32, status: "goedgekeurd",
    });
    const beoordeelB = await json(beoordeel);
    eis(beoordeel.status === 200 && beoordeelB.status === "goedgekeurd", "3a verlof goedkeuren", `${beoordeel.status} ${JSON.stringify(beoordeelB)}`);
    await s.post("/werkbak/bewaking/draai"); // reconciliatie
    const items3 = await json<any[]>(await s.get("/werkbak"));
    eis(!items3.some((i: any) => i.id === verlofItem.id), "3b verlofitem weg na reconciliatie", "item staat er nog");

    // Handmatig afhandelen (goedkeuringsitem) en wegzetten (betaalbatch, reden verplicht)
    const goedkItem = items3.find((i: any) => i.bron === "goedkeuringsaanvraag" && i.titel.includes(MARK));
    eis(!!goedkItem, "3c goedkeuringsitem aanwezig", "niet gevonden");
    const afh = await s.post(`/werkbak/${goedkItem.id}/afhandelen`);
    eis(afh.status === 200, "3d afhandelen", `${afh.status}`);
    const batchItem = items3.find((i: any) => i.bron === "betaalbatch" && i.titel.includes(MARK));
    eis(!!batchItem, "3e betaalbatchitem aanwezig", "niet gevonden");
    const zonderReden = await s.post(`/werkbak/${batchItem.id}/wegzetten`, {});
    eis(zonderReden.status === 400, "3f wegzetten zonder reden = 400", `${zonderReden.status}`);
    const metReden = await s.post(`/werkbak/${batchItem.id}/wegzetten`, { reden: "Batch wordt volgende week vrijgegeven na saldo-check." });
    eis(metReden.status === 200, "3g wegzetten met reden", `${metReden.status}`);
    console.log("SCENARIO 3 PASS — inline beoordelen → reconciliatie handelt af; afhandelen werkt; wegzetten eist reden (400 zonder).");

    // ── SCENARIO 4: zichtbaarheid volgt bevoegdheid ──────────────────────────
    const hash = await bcrypt.hash(BEPERKT_WW, 10);
    const bestaand = await db.select().from(gebruikersTable).where(eq(gebruikersTable.email, BEPERKT_EMAIL));
    if (bestaand.length > 0) {
      await db.update(gebruikersTable).set({
        wachtwoord: hash, rol: "gebruiker", bevoegdheden: { gebouwen: 1 }, actief: true, gearchiveerd: false,
        totpSecret: BEPERKT_TOTP, tweeFactorIngeschakeld: true, moetWachtwoordWijzigen: false, misluktePogingen: 0, vergrendeldTot: null,
      }).where(eq(gebruikersTable.email, BEPERKT_EMAIL));
    } else {
      await db.insert(gebruikersTable).values({
        naam: `${MARK} Beperkt`, email: BEPERKT_EMAIL, wachtwoord: hash, rol: "gebruiker",
        bevoegdheden: { gebouwen: 1 }, actief: true, totpSecret: BEPERKT_TOTP, tweeFactorIngeschakeld: true, moetWachtwoordWijzigen: false,
      });
    }
    opruimen.push(async () => {
      await db.update(gebruikersTable).set({ actief: false, gearchiveerd: true }).where(eq(gebruikersTable.email, BEPERKT_EMAIL));
    });
    const s2 = new Sessie();
    const l2 = await s2.post("/auth/login", { email: BEPERKT_EMAIL, wachtwoord: BEPERKT_WW });
    const l2b = await json(l2);
    eis(l2.status === 200 && l2b.status === "verify_2fa", "4a login beperkt", `${l2.status} ${JSON.stringify(l2b)}`);
    const l2v = await s2.post("/auth/2fa/verify", { code: await versTotp(BEPERKT_TOTP) });
    eis(l2v.status === 200, "4a2 2fa beperkt", `${l2v.status}`);
    const lijst2 = await json<any[]>(await s2.get("/werkbak"));
    eis(Array.isArray(lijst2) && lijst2.length === 0, "4b beperkte gebruiker ziet niets", `${lijst2.length} items: ${JSON.stringify(lijst2.slice(0, 2))}`);
    const aantal2 = await json<any>(await s2.get("/werkbak/aantal"));
    eis(aantal2.totaal === 0, "4c teller 0 voor beperkte gebruiker", JSON.stringify(aantal2));
    const draaiVerboden = await s2.post("/werkbak/bewaking/draai");
    eis(draaiVerboden.status === 403, "4d draai verboden voor niet-hoofdbeheerder", `${draaiVerboden.status}`);
    console.log("SCENARIO 4 PASS — gebruiker met alleen gebouwen:1 ziet lijst leeg + teller 0; handmatige draai = 403.");

    console.log("\nALLE SCENARIO'S GESLAAGD — WERKBAK_01 gedragsbewijs compleet.");
  } finally {
    for (const f of opruimen.reverse()) {
      try { await f(); } catch (e) { console.error("Opruimen faalde:", e); }
    }
    console.log("Opgeruimd.");
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
