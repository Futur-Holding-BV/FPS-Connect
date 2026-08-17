// Verificatie — Task: facturen alleen via de mailstroom (FACTUUR_02 §2)
//
// Bewijst tegen de draaiende dev-omgeving:
//   1. POST /facturen met type inkoop → 422 (één ingang: factuurmailbox)
//   2. POST /facturen met type verkoop → 201 (verkoopfacturen blijven werken)
//   3. POST /facturen/mailbox-sync → 422 legacy uitgeschakeld
//   4. Stroom-factuur (wacht_op_inkoper/wacht_op_goedkeuring): accorderen,
//      ter-goedkeuring-indienen en afkeuren → 409 (niet te passeren)
//   5. Niet-stroom inkoopfactuur (klaar_voor_boeking): accorderen werkt nog (200)
//
// Draaien: pnpm --filter @workspace/scripts exec tsx src/verificatie-factuur-ingang.ts
import "./lib/prodGuard";
import { inArray, eq } from "drizzle-orm";
import { authenticator } from "otplib";

import { db, facturenTable, factuurTijdlijnTable, factuurSignalenTable, factuurCorrespondentieTable, accountviewExportLogsTable, goedkeuringAanvragenTable } from "@workspace/db";

import {
  E2E_WW_ADMIN_EMAIL,
  E2E_WW_ADMIN_TOTP_SECRET,
  E2E_WW_ADMIN_WACHTWOORD,
  archiveerE2eWachtwoordAccounts,
  setupE2eWachtwoordAccounts,
} from "./e2e-wachtwoord-testaccounts";

const DOMEIN = process.env.REPLIT_DEV_DOMAIN;
if (!DOMEIN) { console.error("REPLIT_DEV_DOMAIN ontbreekt."); process.exit(1); }
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

const MARK = "E2E-FACTUUR-INGANG";
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
    await db.delete(accountviewExportLogsTable).where(inArray(accountviewExportLogsTable.factuurId, factuurIds));
    await db.delete(facturenTable).where(inArray(facturenTable.id, factuurIds));
  }
  await archiveerE2eWachtwoordAccounts();
}

async function main(): Promise<void> {
  try {
    console.log(`Verificatie factuur-ingang — doel: ${BASIS}`);
    await setupE2eWachtwoordAccounts();
    const admin = new Sessie();
    {
      const r1 = await admin.post("/auth/login", { email: E2E_WW_ADMIN_EMAIL, wachtwoord: E2E_WW_ADMIN_WACHTWOORD });
      const b1 = await json(r1);
      eis(r1.status === 200 && b1.status === "verify_2fa", "login", `${r1.status} ${JSON.stringify(b1)}`);
      const r2 = await admin.post("/auth/2fa/verify", { code: await versTotp(E2E_WW_ADMIN_TOTP_SECRET) });
      eis(r2.status === 200, "2fa", `${r2.status}`);
      console.log("Stap 0: admin ingelogd");
    }

    // 1. Handmatige inkoopfactuur geweigerd
    {
      const r = await admin.post("/facturen", { type: "inkoop", factuurnummer: `${MARK}-handmatig` });
      const b = await json(r);
      eis(r.status === 422, "1 inkoop geweigerd", `${r.status} ${JSON.stringify(b)}`);
      const rDefault = await admin.post("/facturen", { factuurnummer: `${MARK}-default` });
      eis(rDefault.status === 422, "1b default(=inkoop) geweigerd", `${rDefault.status}`);
      console.log("Stap 1: handmatige inkoopfactuur → 422 met uitleg");
    }

    // 2. Verkoopfactuur blijft werken
    {
      const r = await admin.post("/facturen", { type: "verkoop", factuurnummer: `${MARK}-verkoop-${Date.now()}`, relatienaam: `${MARK} Klant BV` });
      const b = await json(r);
      eis(r.status === 201 && b.type === "verkoop", "2 verkoop aanmaken", `${r.status} ${JSON.stringify(b)}`);
      factuurIds.push(b.id);
      console.log("Stap 2: verkoopfactuur handmatig aanmaken werkt (201)");
    }

    // 3. Legacy mailbox-sync uitgeschakeld
    {
      const r = await admin.post("/facturen/mailbox-sync");
      const b = await json(r);
      eis(r.status === 422 && b.ok === false && /factuurstroom/i.test(b.melding ?? ""), "3 mailbox-sync", `${r.status} ${JSON.stringify(b)}`);
      console.log("Stap 3: legacy mailbox-sync → 422 met verwijzing naar de factuurstroom");
    }

    // 4. Stroom-facturen niet te passeren via legacy paden
    {
      for (const status of ["wacht_op_inkoper", "wacht_op_goedkeuring"]) {
        const id = await seedFactuur(status);
        const acc = await admin.post(`/facturen/${id}/accorderen`);
        eis(acc.status === 409, `4 accorderen (${status})`, `gaf ${acc.status}`);
        const tgi = await admin.post(`/facturen/${id}/ter-goedkeuring-indienen`);
        eis(tgi.status === 409, `4 ter-goedkeuring (${status})`, `gaf ${tgi.status}`);
        const afk = await admin.post(`/facturen/${id}/afkeuren`, { reden: "test" });
        eis(afk.status === 409, `4 afkeuren (${status})`, `gaf ${afk.status}`);
        // PATCH mag de stroomstatus niet wijzigen (inkoperstap niet te omzeilen)
        const doel = status === "wacht_op_inkoper" ? "wacht_op_goedkeuring" : "klaar_voor_betaling";
        const patch = await admin.fetch(`/facturen/${id}`, { method: "PATCH", body: JSON.stringify({ status: doel }) });
        eis(patch.status === 409, `4 PATCH status (${status})`, `gaf ${patch.status}`);
        const patchWeg = await admin.fetch(`/facturen/${id}`, { method: "PATCH", body: JSON.stringify({ status: "klaar_voor_boeking" }) });
        eis(patchWeg.status === 409, `4 PATCH uit stroom (${status})`, `gaf ${patchWeg.status}`);
        // Generieke goedkeuringsmotor mag een stroom-factuur niet aannemen
        const generiek = await admin.post(`/goedkeuring/aanvragen`, { object_type: "inkoop_factuur", object_id: id, document_type: "inkoop_factuur", bedrag: 121 });
        eis(generiek.status === 409, `4 generieke goedkeuring (${status})`, `gaf ${generiek.status}`);
        const [rij] = await db.select().from(facturenTable).where(eq(facturenTable.id, id));
        eis(rij.status === status && rij.geaccordeerd !== true, `4 status onveranderd (${status})`, JSON.stringify({ status: rij.status }));
      }
      console.log("Stap 4: stroom-facturen → 409 op accorderen/ter-goedkeuring/afkeuren/PATCH-status; status onaangetast");
      // Niet-stroom factuur mag via PATCH nooit een stroomstatus krijgen
      const idNiet = await seedFactuur("klaar_voor_boeking", { bron: "upload" } as never);
      const naarStroom = await admin.fetch(`/facturen/${idNiet}`, { method: "PATCH", body: JSON.stringify({ status: "klaar_voor_betaling" }) });
      eis(naarStroom.status === 409, "4b PATCH naar stroomstatus", `gaf ${naarStroom.status}`);
      console.log("Stap 4b: PATCH kan geen stroomstatus zetten op een niet-stroom-factuur");

      // 4c. Een vooraf bestaande generieke goedkeuringsaanvraag kan een
      // stroom-factuur niet uit zijn status halen — ook niet via afwijzen.
      const idVooraf = await seedFactuur("wacht_op_inkoper");
      const [aanvraag] = await db.insert(goedkeuringAanvragenTable).values({
        objectType: "inkoop_factuur",
        objectId: idVooraf,
        documentType: "inkoop_factuur",
        omschrijving: `${MARK} vooraf bestaande aanvraag`,
        bedrag: 121,
        status: "ingediend",
        vereisteGoedkeuringen: 1,
        ontvangenGoedkeuringen: 0,
        ingediendOp: new Date(),
        bijgewerktOp: new Date(),
      }).returning({ id: goedkeuringAanvragenTable.id });
      try {
        const afw = await admin.post(`/goedkeuring/aanvragen/${aanvraag.id}/afwijzen`, { reden: "test vooraf bestaande aanvraag" });
        eis([200, 409].includes(afw.status), "4c afwijzen aanvraag", `gaf ${afw.status}`);
        const [naAfwijzing] = await db.select().from(facturenTable).where(eq(facturenTable.id, idVooraf));
        eis(naAfwijzing.status === "wacht_op_inkoper", "4c stroomstatus onaangetast na afwijzing", JSON.stringify({ status: naAfwijzing.status }));
        console.log("Stap 4c: afwijzen van vooraf bestaande generieke aanvraag laat stroomstatus intact");
      } finally {
        await db.delete(goedkeuringAanvragenTable).where(eq(goedkeuringAanvragenTable.id, aanvraag.id));
      }
    }

    // 5. Niet-stroom-factuur: oud accorderen blijft werken
    {
      const id = await seedFactuur("klaar_voor_boeking", { bron: "upload" } as never);
      const r = await admin.post(`/facturen/${id}/accorderen`);
      const b = await json(r);
      if (r.status === 422 && b.viaGoedkeuring) {
        console.log("Stap 5: goedkeuringsbeleid actief → 422 viaGoedkeuring (bestaande vier-ogen-gate, geen regressie)");
      } else {
        eis(r.status === 200 && b.status === "klaar_voor_accountview", "5 accorderen niet-stroom", `${r.status} ${JSON.stringify(b)}`);
        console.log("Stap 5: niet-stroom accorderen werkt nog (klaar_voor_accountview)");
      }
    }

    console.log("\nALLE STAPPEN GESLAAGD — één ingang afgedwongen, bestaande flows intact.");
  } finally {
    await cleanup();
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exitCode = 1; });
