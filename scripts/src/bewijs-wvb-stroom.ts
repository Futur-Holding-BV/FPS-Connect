// WVB_01 — gedragsbewijs voor de werkvoorbereidingsstroom:
//  1. Vooraf-regelen-checklist: initialiseer (4 standaarditems), afvinken met
//     audit (wie/wanneer), eigen item toevoegen, verwijderen.
//  2. Regie-dagdeeltarieven: PUT voorwaarden met tariefsoort=dagdeel → GET
//     geeft tariefsoort terug (nooit stilzwijgend 4 uur).
//  3. Divergentiesignaal: inkoopplan-leverdatum ná uitvoeringsplan-einddatum →
//     open compliance-signaal bij vaststellen; datum gecorrigeerd + opnieuw
//     vaststellen → signaal opgelost.
//
// Draaien: pnpm --filter @workspace/scripts exec tsx src/bewijs-wvb-stroom.ts
import "./lib/prodGuard";
import { authenticator } from "otplib";
import {
  db,
  opdrachtenTable,
  inkoopplannenTable,
  inkoopplanRegelsTable,
  uitvoeringsplannenTable,
  opdrachtChecklistItemsTable,
  complianceSignalenTable,
  regieVoorwaardenTable,
  regieTarievenTable,
} from "@workspace/db";
import { eq, inArray, like } from "drizzle-orm";
import {
  setupE2eWachtwoordAccounts,
  E2E_WW_ADMIN_EMAIL,
  E2E_WW_ADMIN_WACHTWOORD,
  E2E_WW_ADMIN_TOTP_SECRET,
} from "./e2e-wachtwoord-testaccounts";

const DOMEIN = process.env.REPLIT_DEV_DOMAIN;
if (!DOMEIN) { console.error("REPLIT_DEV_DOMAIN ontbreekt."); process.exit(1); }
const BASIS = `https://${DOMEIN}/api`;
const MARK = "BEWIJS_WVB01";

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
  post(pad: string, body?: unknown) { return this.fetch(pad, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }); }
  put(pad: string, body?: unknown) { return this.fetch(pad, { method: "PUT", body: JSON.stringify(body) }); }
  patch(pad: string, body?: unknown) { return this.fetch(pad, { method: "PATCH", body: JSON.stringify(body) }); }
  delete(pad: string) { return this.fetch(pad, { method: "DELETE" }); }
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
  console.log(`WVB_01 bewijs — ${new Date().toISOString()} — doel: ${BASIS}`);
  const opdrachtIds: number[] = [];
  try {
    await setupE2eWachtwoordAccounts();
    const s = new Sessie();
    const r1 = await s.post("/auth/login", { email: E2E_WW_ADMIN_EMAIL, wachtwoord: E2E_WW_ADMIN_WACHTWOORD });
    const b1 = await json(r1);
    eis(r1.status === 200 && b1.status === "verify_2fa", "login", `${r1.status} ${JSON.stringify(b1)}`);
    const r2 = await s.post("/auth/2fa/verify", { code: await versTotp(E2E_WW_ADMIN_TOTP_SECRET) });
    eis(r2.status === 200, "2fa", `${r2.status}`);
    console.log("Login als hoofdbeheerder geslaagd (wachtwoord + TOTP).");

    // ── Seed opdrachten ──────────────────────────────────────────────────────
    const [opd1] = await db.insert(opdrachtenTable).values({ titel: `${MARK} checklist-opdracht`, status: "concept" }).returning();
    const [opd2] = await db.insert(opdrachtenTable).values({ titel: `${MARK} regie-opdracht`, status: "concept", type: "regie" }).returning();
    const [opd3] = await db.insert(opdrachtenTable).values({ titel: `${MARK} divergentie-opdracht`, status: "concept" }).returning();
    opdrachtIds.push(opd1!.id, opd2!.id, opd3!.id);

    // ── SCENARIO 1: checklist ────────────────────────────────────────────────
    {
      const init = await s.post(`/opdrachten/${opd1!.id}/checklist/initialiseer`);
      const items = await json<any[]>(init);
      eis(init.status === 200 && items.length === 4, "1a initialiseer", `${init.status}, ${JSON.stringify(items).slice(0, 200)}`);
      eis(items.some(i => i.categorie === "vergunning") && items.some(i => i.categorie === "veiligheid"), "1b categorieën", JSON.stringify(items.map(i => i.categorie)));
      const eerste = items[0];
      const afv = await s.patch(`/opdrachten/${opd1!.id}/checklist/${eerste.id}`, { afgevinkt: true });
      const afvB = await json(afv);
      eis(afv.status === 200 && afvB.afgevinkt === true && !!afvB.afgevinkt_door && !!afvB.afgevinkt_op, "1c afvinken audit", JSON.stringify(afvB));
      const nieuw = await s.post(`/opdrachten/${opd1!.id}/checklist`, { label: "Parkeerontheffing aanvragen", categorie: "vergunning" });
      const nieuwB = await json(nieuw);
      eis(nieuw.status === 201 && nieuwB.label === "Parkeerontheffing aanvragen", "1d toevoegen", `${nieuw.status} ${JSON.stringify(nieuwB)}`);
      const del = await s.delete(`/opdrachten/${opd1!.id}/checklist/${nieuwB.id}`);
      eis(del.status === 204, "1e verwijderen", `${del.status}`);
      const lijst = await json<any[]>(await s.get(`/opdrachten/${opd1!.id}/checklist`));
      eis(lijst.length === 4 && lijst.filter(i => i.afgevinkt).length === 1, "1f eindstand", JSON.stringify(lijst.map(i => i.afgevinkt)));
      console.log(`SCENARIO 1 PASS — checklist: 4 standaarditems, afvinken met audit (${afvB.afgevinkt_door} @ ${afvB.afgevinkt_op}), toevoegen/verwijderen werkt.`);
    }

    // ── SCENARIO 2: regie-dagdeeltarief ──────────────────────────────────────
    {
      const put = await s.put(`/regie/voorwaarden/${opd2!.id}`, {
        tarieven: [
          { functiegroep: "monteur", tariefsoort: "uur", uurtarief: 62.5 },
          { functiegroep: "voorman", tariefsoort: "dagdeel", uurtarief: 295 },
        ],
      });
      const putB = await json(put);
      eis(put.status === 200, "2a PUT voorwaarden", `${put.status} ${JSON.stringify(putB).slice(0, 200)}`);
      const get = await json<any>(await s.get(`/regie/voorwaarden/${opd2!.id}`));
      const dag = get.tarieven.find((t: any) => t.functiegroep === "voorman");
      const uur = get.tarieven.find((t: any) => t.functiegroep === "monteur");
      eis(dag?.tariefsoort === "dagdeel" && dag?.uurtarief === 295, "2b dagdeeltarief persistent", JSON.stringify(get.tarieven));
      eis(uur?.tariefsoort === "uur", "2c uurtarief persistent", JSON.stringify(get.tarieven));
      console.log("SCENARIO 2 PASS — dagdeel is een eigen tariefsoort in regie-tarieven (geen stilzwijgende 4-uur-aanname).");
    }

    // ── SCENARIO 3: divergentiesignaal ───────────────────────────────────────
    {
      const oid = opd3!.id;
      await db.insert(uitvoeringsplannenTable).values({
        opdrachtId: oid, status: "concept", startdatum: "2026-09-01", einddatum: "2026-09-30",
      });
      const [plan] = await db.insert(inkoopplannenTable).values({ opdrachtId: oid, status: "concept" }).returning();
      await db.insert(inkoopplanRegelsTable).values({
        inkoopplanId: plan!.id, omschrijving: `${MARK} maatwerk deuren`, hoeveelheid: 4, eenheid: "st",
        gewensteLeverdatum: "2026-10-15", // ná einddatum uitvoering → divergentie
      });
      const vast = await s.post(`/opdrachten/${oid}/inkoopplanning/vaststellen`);
      eis(vast.status === 200, "3a vaststellen", `${vast.status}`);
      const [signaal] = await db.select().from(complianceSignalenTable)
        .where(eq(complianceSignalenTable.dedupSleutel, `wvb_planning_divergentie:opdracht:${oid}`));
      eis(!!signaal && signaal.status === "open" && signaal.omschrijving.includes("maatwerk deuren"), "3b signaal open", JSON.stringify(signaal ?? null));
      console.log(`SCENARIO 3a PASS — divergentie gesignaleerd: "${signaal!.titel}"`);

      // Corrigeer leverdatum en stel opnieuw vast → signaal lost op
      await db.update(inkoopplanRegelsTable)
        .set({ gewensteLeverdatum: "2026-09-10" })
        .where(eq(inkoopplanRegelsTable.inkoopplanId, plan!.id));
      const vast2 = await s.post(`/opdrachten/${oid}/inkoopplanning/vaststellen`);
      eis(vast2.status === 200, "3c hervaststellen", `${vast2.status}`);
      const [signaal2] = await db.select().from(complianceSignalenTable)
        .where(eq(complianceSignalenTable.id, signaal!.id));
      eis(signaal2!.status === "opgelost", "3d signaal opgelost", JSON.stringify(signaal2));
      console.log("SCENARIO 3b PASS — na datumcorrectie + hervaststellen is het signaal automatisch opgelost.");
    }

    console.log("\nALLE SCENARIO'S GESLAAGD ✅");
  } finally {
    // Opruimen
    if (opdrachtIds.length > 0) {
      await db.delete(complianceSignalenTable).where(like(complianceSignalenTable.dedupSleutel, "wvb_planning_divergentie:opdracht:%"));
      const vw = await db.select().from(regieVoorwaardenTable).where(inArray(regieVoorwaardenTable.opdrachtId, opdrachtIds));
      if (vw.length) await db.delete(regieTarievenTable).where(inArray(regieTarievenTable.voorwaardenId, vw.map(v => v.id)));
      await db.delete(regieVoorwaardenTable).where(inArray(regieVoorwaardenTable.opdrachtId, opdrachtIds));
      await db.delete(opdrachtChecklistItemsTable).where(inArray(opdrachtChecklistItemsTable.opdrachtId, opdrachtIds));
      await db.delete(opdrachtenTable).where(inArray(opdrachtenTable.id, opdrachtIds));
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
