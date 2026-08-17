// Verificatie ENK-import (backend, tegen dev-omgeving):
//   1. Login admin (wachtwoord + TOTP)
//   2. POST /modules/calculaties/import/analyse met de echte ENK-PDF
//   3. Controle analyse: kop, hoofdstukken, centen-totalen, verschil van 1 cent
//   4. POST bevestig (totaal_keuze=enk) → calculatie + correctieregel
//   5. GET calculatie-detail: totaal == ENK-totaal
//   6. 409 bij tweede bevestig; hergebruik → nieuw bronbestand; duplicaatdetectie
//   7. Bibliotheek-lijst en importlog in DB
// Ruimt eigen testdata op (ook bij falen).
import "./lib/prodGuard";
import { readFileSync } from "fs";
import { resolve } from "path";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  modCalcHeadersTable,
  modCalcRegelsTable,
  modCalcBronbestandenTable,
  importLogsTable,
} from "@workspace/db";
import { authenticator } from "otplib";
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
const PDF_PAD = resolve(process.cwd(), "../attached_assets/begroting_120_woningen_omgeving_Bartokstraat_Almelo_-_Akor_1781209311666.pdf");

class Sessie {
  private cookies = new Map<string, string>();
  async fetch(pad: string, init?: RequestInit & { json?: unknown }): Promise<Response> {
    const headers = new Headers(init?.headers);
    let body = init?.body;
    if (init?.json !== undefined) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(init.json);
    }
    const cookie = [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    if (cookie) headers.set("Cookie", cookie);
    const res = await fetch(`${BASIS}${pad}`, { ...init, body, headers, redirect: "manual" });
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
}

function eis(voorwaarde: boolean, stap: string, detail: string): void {
  if (!voorwaarde) throw new Error(`FAIL — ${stap}: ${detail}`);
}
function log(regel: string): void {
  console.log(regel);
}
async function versTotp(minResterendeSec = 10): Promise<string> {
  const resterend = authenticator.timeRemaining();
  if (resterend < minResterendeSec) await new Promise((r) => setTimeout(r, (resterend + 1) * 1000));
  return authenticator.generate(E2E_WW_ADMIN_TOTP_SECRET);
}

const gemaakteCalcIds: number[] = [];
const gemaakteBronIds: number[] = [];

async function main(): Promise<void> {
  log(`Verificatie ENK-import — ${new Date().toISOString()} — doel: ${BASIS}`);

  const { adminId } = await setupE2eWachtwoordAccounts();
  const admin = new Sessie();
  {
    const r1 = await admin.fetch("/auth/login", { method: "POST", json: { email: E2E_WW_ADMIN_EMAIL, wachtwoord: E2E_WW_ADMIN_WACHTWOORD } });
    const b1 = await r1.json() as Record<string, unknown>;
    eis(r1.status === 200 && b1["status"] === "verify_2fa", "login", `${r1.status} ${JSON.stringify(b1)}`);
    const r2 = await admin.fetch("/auth/2fa/verify", { method: "POST", json: { code: await versTotp() } });
    eis(r2.status === 200, "2fa", `${r2.status}`);
    log(`STAP 0 PASS — admin (id ${adminId}) ingelogd met wachtwoord + TOTP`);
  }

  // ── STAP 1: analyse van de echte ENK-PDF ─────────────────────────────────
  const pdfBuffer = readFileSync(PDF_PAD);
  const upload = async () => {
    const form = new FormData();
    form.append("bestand", new Blob([new Uint8Array(pdfBuffer)], { type: "application/pdf" }), "begroting_120_woningen_Bartokstraat_Almelo.pdf");
    return admin.fetch("/modules/calculaties/import/analyse", { method: "POST", body: form });
  };
  const rA = await upload();
  const analyse = await rA.json() as Record<string, any>;
  eis(rA.status === 200, "stap 1", `analyse gaf ${rA.status}: ${JSON.stringify(analyse).slice(0, 400)}`);
  gemaakteBronIds.push(analyse["bronbestand_id"]);
  eis(analyse["calculatienummer"] === "FPS-BP-00098", "stap 1", `calculatienummer=${analyse["calculatienummer"]}`);
  eis(analyse["projectnummer"] === "BPC-00091", "stap 1", `projectnummer=${analyse["projectnummer"]}`);
  eis(analyse["opdrachtgever"] === "AKOR Nijverdal", "stap 1", `opdrachtgever=${analyse["opdrachtgever"]}`);
  eis(analyse["totaal_enk_centen"] === 16546374, "stap 1", `totaal_enk_centen=${analyse["totaal_enk_centen"]}`);
  eis(analyse["totaal_connect_centen"] === 16546373, "stap 1", `totaal_connect_centen=${analyse["totaal_connect_centen"]}`);
  eis(analyse["verschil_centen"] === 1, "stap 1", `verschil_centen=${analyse["verschil_centen"]}`);
  eis(analyse["hoofdstukken"].length === 2, "stap 1", `hoofdstukken=${analyse["hoofdstukken"].length}`);
  const abk = analyse["hoofdstukken"].find((h: any) => h.naam === "ABK");
  eis(abk && abk.totaal_enk_centen === 1292792 && abk.som_regels_centen === 1292791, "stap 1", `ABK-reconciliatie: ${JSON.stringify(abk?.totaal_enk_centen)}/${JSON.stringify(abk?.som_regels_centen)}`);
  eis(analyse["ai_gebruikt"] === false, "stap 1", "AI gebruikt terwijl deterministische parse moest slagen");
  eis(analyse["verwerking_advies"] === "inclusief", "stap 1", `advies=${analyse["verwerking_advies"]}`);
  log(`STAP 1 PASS — analyse: ENK € 165.463,74 vs Connect € 165.463,73 (verschil € 0,01), 2 hoofdstukken, advies=inclusief, bron id=${analyse["bronbestand_id"]}`);

  // ── STAP 2: bevestigen met totaal_keuze=enk ──────────────────────────────
  const rB = await admin.fetch(`/modules/calculaties/import/${analyse["bronbestand_id"]}/bevestig`, {
    method: "POST",
    json: { verwerking: "inclusief", totaal_keuze: "enk", opslagen: analyse["opslagen"] },
  });
  const bevestig = await rB.json() as Record<string, any>;
  eis(rB.status === 201, "stap 2", `bevestig gaf ${rB.status}: ${JSON.stringify(bevestig)}`);
  const calcId = bevestig["calculatie_id"] as number;
  gemaakteCalcIds.push(calcId);
  eis(bevestig["correctieregel_toegevoegd"] === true, "stap 2", "geen correctieregel toegevoegd");
  eis(bevestig["verschil_centen"] === 1, "stap 2", `verschil=${bevestig["verschil_centen"]}`);
  log(`STAP 2 PASS — calculatie ${calcId} aangemaakt met correctieregel (verschil € 0,01, keuze=enk)`);

  // ── STAP 3: DB-bewijs regels + detailtotaal via API ──────────────────────
  const regels = await db.select().from(modCalcRegelsTable).where(eq(modCalcRegelsTable.calculatieId, calcId));
  const correctie = regels.filter((r) => r.isStaartkosten);
  eis(correctie.length === 1, "stap 3", `${correctie.length} correctieregels`);
  eis(Math.abs(correctie[0].totaal - 0.01) < 0.001, "stap 3", `correctie totaal=${correctie[0].totaal}`);
  const geprijsd = regels.filter((r) => !r.isStaartkosten && r.totaal !== 0);
  eis(geprijsd.length === 26, "stap 3", `${geprijsd.length} geprijsde regels (verwacht 26)`);
  const abkRegels = regels.filter((r) => r.isBouwplaatskosten);
  eis(abkRegels.length === 4, "stap 3", `${abkRegels.length} ABK-regels (verwacht 4)`);

  const rD = await admin.fetch(`/modules/calculaties/${calcId}`);
  const detail = await rD.json() as Record<string, any>;
  eis(rD.status === 200, "stap 3", `detail gaf ${rD.status}`);
  const totaalNa = detail["totalen"]?.["totaal_na_opslagen"] ?? detail["totaal_na_opslagen"];
  eis(Math.abs(Number(totaalNa) - 165463.74) < 0.005, "stap 3", `detailtotaal=${totaalNa} (verwacht 165463.74)`);
  log(`STAP 3 PASS — DB: 26 geprijsde regels, 4 ABK-regels, 1 correctieregel van € 0,01; detail-API totaal € ${Number(totaalNa).toFixed(2)} == ENK-totaal`);

  // ── STAP 4: tweede bevestig → 409 ────────────────────────────────────────
  const r409 = await admin.fetch(`/modules/calculaties/import/${analyse["bronbestand_id"]}/bevestig`, {
    method: "POST",
    json: { verwerking: "inclusief", totaal_keuze: "connect", opslagen: {} },
  });
  eis(r409.status === 409, "stap 4", `tweede bevestig gaf ${r409.status} (verwacht 409)`);
  log("STAP 4 PASS — tweede bevestig geweigerd met 409");

  // ── STAP 5: duplicaatdetectie bij nieuwe upload van hetzelfde bestand ────
  const rDup = await upload();
  const dupAnalyse = await rDup.json() as Record<string, any>;
  eis(rDup.status === 200, "stap 5", `tweede analyse gaf ${rDup.status}`);
  gemaakteBronIds.push(dupAnalyse["bronbestand_id"]);
  const duplicaten = dupAnalyse["duplicaten"] as Array<Record<string, any>>;
  eis(duplicaten.length >= 1, "stap 5", "geen duplicaten gemeld");
  eis(duplicaten.some((d) => String(d["reden"]).includes("identiek bestand")), "stap 5", `redenen: ${JSON.stringify(duplicaten.map((d) => d["reden"]))}`);
  eis(duplicaten.some((d) => String(d["reden"]).includes("FPS-BP-00098")), "stap 5", "calculatienummer-duplicaat niet gemeld");
  log(`STAP 5 PASS — duplicaatdetectie: ${duplicaten.length} melding(en), incl. identiek bestand + zelfde calculatienummer`);

  // ── STAP 6: bevestig met totaal_keuze=connect → geen correctieregel ──────
  const rC = await admin.fetch(`/modules/calculaties/import/${dupAnalyse["bronbestand_id"]}/bevestig`, {
    method: "POST",
    json: { verwerking: "inclusief", totaal_keuze: "connect", opslagen: {} },
  });
  const bevestigC = await rC.json() as Record<string, any>;
  eis(rC.status === 201, "stap 6", `bevestig gaf ${rC.status}`);
  gemaakteCalcIds.push(bevestigC["calculatie_id"]);
  eis(bevestigC["correctieregel_toegevoegd"] === false, "stap 6", "onterecht correctieregel toegevoegd");
  const rD2 = await admin.fetch(`/modules/calculaties/${bevestigC["calculatie_id"]}`);
  const detail2 = await rD2.json() as Record<string, any>;
  const totaalNa2 = detail2["totalen"]?.["totaal_na_opslagen"] ?? detail2["totaal_na_opslagen"];
  eis(Math.abs(Number(totaalNa2) - 165463.73) < 0.005, "stap 6", `detailtotaal=${totaalNa2} (verwacht 165463.73)`);
  log(`STAP 6 PASS — keuze=connect: geen correctieregel, totaal € ${Number(totaalNa2).toFixed(2)} (regelsom)`);

  // ── STAP 7: hergebruik vanuit bibliotheek ────────────────────────────────
  const rH = await admin.fetch(`/modules/calculaties/import/${analyse["bronbestand_id"]}/hergebruik`, { method: "POST" });
  const herAnalyse = await rH.json() as Record<string, any>;
  eis(rH.status === 200, "stap 7", `hergebruik gaf ${rH.status}`);
  gemaakteBronIds.push(herAnalyse["bronbestand_id"]);
  eis(herAnalyse["bronbestand_id"] !== analyse["bronbestand_id"], "stap 7", "hergebruik gaf zelfde bron-id terug");
  eis(herAnalyse["totaal_enk_centen"] === 16546374, "stap 7", `totaal=${herAnalyse["totaal_enk_centen"]}`);
  log(`STAP 7 PASS — hergebruik maakt nieuw bronbestand (id ${herAnalyse["bronbestand_id"]}) met identieke analyse`);

  // ── STAP 8: bibliotheek-lijst + zoekfilter + importlog ───────────────────
  const rL = await admin.fetch(`/modules/calculaties/import/bronbestanden?zoek=FPS-BP-00098`);
  const lijst = await rL.json() as Array<Record<string, any>>;
  eis(rL.status === 200 && Array.isArray(lijst), "stap 8", `lijst gaf ${rL.status}`);
  eis(lijst.length >= 3, "stap 8", `${lijst.length} bronbestanden gevonden (verwacht >= 3)`);
  const verwerkt = lijst.find((b) => b["id"] === analyse["bronbestand_id"]);
  eis(verwerkt?.["status"] === "verwerkt" && verwerkt?.["calculatie_id"] === calcId, "stap 8", `status=${verwerkt?.["status"]}, calc=${verwerkt?.["calculatie_id"]}`);
  eis(typeof verwerkt?.["calculatie_naam"] === "string", "stap 8", "calculatie_naam ontbreekt");
  const logs = await db.select().from(importLogsTable).where(eq(importLogsTable.type, "enk_calculatie"));
  eis(logs.length >= 2, "stap 8", `${logs.length} importlogs (verwacht >= 2)`);
  log(`STAP 8 PASS — bibliotheek filtert op calculatienummer (${lijst.length} treffers), status/koppeling correct, ${logs.length} importlog-regels in DB`);

  log("");
  log("ALLE STAPPEN GESLAAGD — ENK-import backend aantoonbaar correct (analyse, centen-vergelijking, correctieregel, 409, duplicaten, hergebruik, bibliotheek, importlog).");
}

async function ruimOp(): Promise<void> {
  try {
    if (gemaakteBronIds.length > 0) {
      await db.delete(modCalcBronbestandenTable).where(inArray(modCalcBronbestandenTable.id, gemaakteBronIds));
    }
    if (gemaakteCalcIds.length > 0) {
      await db.delete(modCalcRegelsTable).where(inArray(modCalcRegelsTable.calculatieId, gemaakteCalcIds));
      await db.delete(modCalcHeadersTable).where(inArray(modCalcHeadersTable.id, gemaakteCalcIds));
    }
    await archiveerE2eWachtwoordAccounts();
    console.log(`Opgeruimd: ${gemaakteBronIds.length} bronbestanden, ${gemaakteCalcIds.length} calculaties, e2e-accounts gearchiveerd.`);
  } catch (e) {
    console.error("Opruimen faalde:", e);
  }
}

main()
  .then(async () => { await ruimOp(); process.exit(0); })
  .catch(async (e) => { console.error(String(e)); await ruimOp(); process.exit(1); });
