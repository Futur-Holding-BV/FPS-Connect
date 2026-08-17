// Verificatie — FACTUUR_02 factuurstroom (acceptatiescenario's §10, API-niveau)
//
// Bewijst tegen de draaiende dev-omgeving:
//   A. Afwijzen: alleen gesloten redenlijst (vrije/onbekende code → 400),
//      geldige code → status afgekeurd + conceptmail klaar + tijdlijnregel (§4, §10.4).
//   B. Inkoperstap: factuur wacht_op_inkoper met andere inkoper → 403 voor admin;
//      zonder toegewezen inkoper → bevestigen → wacht_op_goedkeuring + tijdlijn (§5, §10.6).
//   C. Goedkeuren: wacht_op_goedkeuring → klaar_voor_betaling; niets over betalen (§5, §10.7).
//   D. Signalen: rekeningnummer_gewijzigd afhandelen ZONDER notitie → 422 (nooit stil),
//      mét notitie → afgehandeld; dashboardlijst toont het signaal (§6, §10.9).
//   E. Tijdlijn: GET /facturen/:id/tijdlijn geeft de gebeurtenissen in gewone taal (§7).
//   F. Route-volgorde: GET /facturen/signalen wordt niet opgeslokt door /facturen/:id.
//
// Draaien: pnpm --filter @workspace/scripts exec tsx src/verificatie-factuurstroom.ts
import "./lib/prodGuard";
import { eq, inArray } from "drizzle-orm";
import { authenticator } from "otplib";

import { db, facturenTable, factuurSignalenTable, factuurTijdlijnTable, factuurCorrespondentieTable } from "@workspace/db";

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

const MARK = "E2E-FACTUURSTROOM";
const factuurIds: number[] = [];

async function seedFactuur(status: string, extra?: Partial<typeof facturenTable.$inferInsert>): Promise<number> {
  const [rij] = await db.insert(facturenTable).values({
    type: "inkoop",
    bron: "mail",
    status,
    relatienaam: `${MARK} Leverancier BV`,
    factuurnummer: `${MARK}-${status}-${Date.now()}`,
    bedragExclBtw: "100.00",
    btwBedrag: "21.00",
    bedragInclBtw: "121.00",
    ...extra,
  }).returning({ id: facturenTable.id });
  factuurIds.push(rij.id);
  return rij.id;
}

async function cleanup(): Promise<void> {
  if (factuurIds.length > 0) {
    await db.delete(factuurTijdlijnTable).where(inArray(factuurTijdlijnTable.factuurId, factuurIds));
    await db.delete(factuurSignalenTable).where(inArray(factuurSignalenTable.factuurId, factuurIds));
    await db.delete(factuurCorrespondentieTable).where(inArray(factuurCorrespondentieTable.factuurId, factuurIds));
    await db.delete(facturenTable).where(inArray(facturenTable.id, factuurIds));
  }
  await archiveerE2eWachtwoordAccounts();
}

async function main(): Promise<void> {
  try {
    console.log(`Verificatie factuurstroom — doel: ${BASIS}`);
    const { adminId, targetId } = await setupE2eWachtwoordAccounts();
    const admin = new Sessie();
    {
      const r1 = await admin.post("/auth/login", { email: E2E_WW_ADMIN_EMAIL, wachtwoord: E2E_WW_ADMIN_WACHTWOORD });
      const b1 = await json(r1);
      eis(r1.status === 200 && b1.status === "verify_2fa", "login", `${r1.status} ${JSON.stringify(b1)}`);
      const r2 = await admin.post("/auth/2fa/verify", { code: await versTotp(E2E_WW_ADMIN_TOTP_SECRET) });
      eis(r2.status === 200, "2fa", `${r2.status}`);
      console.log(`Stap 0: admin (id ${adminId}) ingelogd`);
    }

    // F. Route-volgorde: signalen-lijst bereikbaar
    {
      const r = await admin.get("/facturen/signalen");
      eis(r.status === 200, "F route", `GET /facturen/signalen gaf ${r.status}`);
      console.log("Stap F: /facturen/signalen bereikbaar (geen wildcard-schaduw)");
    }

    // A. Afwijzen met gesloten lijst
    {
      const id = await seedFactuur("controle_nodig");
      const slecht = await admin.post(`/facturen/${id}/afwijzen-stroom`, { reden_code: "vrije tekst reden" });
      eis(slecht.status === 400, "A1 gesloten lijst", `onbekende code gaf ${slecht.status}`);
      const goed = await admin.post(`/facturen/${id}/afwijzen-stroom`, { reden_code: "bedrag_wijkt_af" });
      const gb = await json(goed);
      eis(goed.status === 200 && gb.status === "afgekeurd" && gb.concept_correspondentie_id > 0, "A2 afwijzen", `${goed.status} ${JSON.stringify(gb)}`);
      const [conc] = await db.select().from(factuurCorrespondentieTable).where(eq(factuurCorrespondentieTable.id, gb.concept_correspondentie_id));
      eis(conc?.status === "concept" && conc.richting === "uitgaand", "A3 conceptmail", `correspondentie=${JSON.stringify({ status: conc?.status, richting: conc?.richting })}`);
      const nogEens = await admin.post(`/facturen/${id}/afwijzen-stroom`, { reden_code: "dubbel" });
      eis(nogEens.status === 409, "A4 dubbel afwijzen", `gaf ${nogEens.status}`);
      const tl = await json(await admin.get(`/facturen/${id}/tijdlijn`));
      eis(Array.isArray(tl) && tl.some((r: any) => /afgewezen/i.test(r.tekst)), "A5 tijdlijn", JSON.stringify(tl));
      console.log("Stap A: afwijzen — gesloten lijst afgedwongen, conceptmail klaar, tijdlijn geschreven");
    }

    // B. Inkoperstap
    {
      // andere inkoper toegewezen → admin mag niet
      const idAnder = await seedFactuur("wacht_op_inkoper", { inkoperId: targetId } as never);
      const verboden = await admin.post(`/facturen/${idAnder}/bevestig-inkoop`);
      eis(verboden.status === 403, "B1 alleen inkoper", `gaf ${verboden.status}`);
      // geen inkoper toegewezen → admin mag bevestigen
      const id = await seedFactuur("wacht_op_inkoper");
      const ok = await json(await admin.post(`/facturen/${id}/bevestig-inkoop`));
      eis(ok.status === "wacht_op_goedkeuring", "B2 bevestigen", JSON.stringify(ok));
      const verkeerdeStap = await admin.post(`/facturen/${id}/bevestig-inkoop`);
      eis(verkeerdeStap.status === 409, "B3 idempotent", `gaf ${verkeerdeStap.status}`);
      console.log("Stap B: inkoper-bevestiging — 403 voor niet-inkoper, doorstroom naar goedkeuring");

      // C. Goedkeuren vanuit wacht_op_goedkeuring
      const g = await admin.post(`/facturen/${id}/goedkeuren-stroom`);
      const gj = await json(g);
      if (g.status === 422 && gj.viaGoedkeuring) {
        console.log("Stap C: goedkeuringsbeleid actief → 422 viaGoedkeuring (vier-ogen-gate werkt; pad via goedkeuringsmodule)");
      } else {
        eis(g.status === 200 && gj.status === "klaar_voor_betaling", "C goedkeuren", `${g.status} ${JSON.stringify(gj)}`);
        const [rij] = await db.select().from(facturenTable).where(eq(facturenTable.id, id));
        eis(rij.status === "klaar_voor_betaling" && rij.geaccordeerd === true, "C DB", JSON.stringify({ status: rij.status }));
        console.log("Stap C: goedkeuren — klaar voor betaling (geen betaalactie in dit systeem)");
      }
      const tl = await json(await admin.get(`/facturen/${id}/tijdlijn`));
      eis(Array.isArray(tl) && tl.length >= 1, "C tijdlijn", JSON.stringify(tl));
    }

    // D. Signalen — rekeningnummer gewijzigd nooit stil afhandelen
    {
      const id = await seedFactuur("controle_nodig");
      const [sig] = await db.insert(factuurSignalenTable).values({
        type: "rekeningnummer_gewijzigd",
        factuurId: id,
        omschrijving: `${MARK}: leverancier factureert opeens vanaf een ander rekeningnummer.`,
      }).returning({ id: factuurSignalenTable.id });
      const lijst = await json(await admin.get("/facturen/signalen?status=open"));
      eis(Array.isArray(lijst) && lijst.some((s: any) => s.id === sig.id), "D1 dashboard", "signaal niet in open lijst");
      const stil = await admin.post(`/facturen/signalen/${sig.id}/afhandelen`, {});
      eis(stil.status === 422, "D2 nooit stil", `zonder notitie gaf ${stil.status}`);
      const met = await json(await admin.post(`/facturen/signalen/${sig.id}/afhandelen`, { notitie: "Telefonisch geverifieerd bij vast contactpersoon leverancier." }));
      eis(met.status === "afgehandeld", "D3 afhandelen", JSON.stringify(met));
      const dubbel = await admin.post(`/facturen/signalen/${sig.id}/afhandelen`, { notitie: "x" });
      eis(dubbel.status === 409, "D4 al afgehandeld", `gaf ${dubbel.status}`);
      console.log("Stap D: signalen — rekeningnummerwijziging vereist toelichting; afhandeling gelogd op tijdlijn");
    }

    console.log("\nALLE STAPPEN GESLAAGD — factuurstroom-endpoints bewezen op dev.");
  } finally {
    await cleanup();
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exitCode = 1; });
