// Gedragsbewijs NUMMER_01 — de ENK-kenmerkketen (§6-acceptatiepunten).
//
// Bewezen via echte HTTP-verzoeken tegen de draaiende dev-api:
//  A. Nieuw gebouw krijgt automatisch een G-werknummer uit seq_nummer_g (geen jaartal).
//  B. Opname exposeert het M-nummer.
//  C. Calculatie (mod_calc) krijgt een C-nummer; het kenmerk wordt BEREKEND en
//     beweegt mee wanneer het gebouw wijzigt (§4.3).
//  D. Parallel 5 calculaties aanmaken → 5 unieke C-nummers (sequence, nooit max+1).
//  E. Offerte met calculatie → kenmerk G/C/O; kopiëren geeft een nieuw O-nummer,
//     kopie is concept, origineel blijft ongewijzigd (§4.10).
//  F. Verzonden offerte is server-side alleen-lezen (PATCH → 409) en het bevroren
//     kenmerk blijft staan, ook als het onderliggende gebouw wijzigt.
//  G. Projectinkoopbon → I-nummer + kenmerk O…/I…; wijziging op een verzonden bon
//     maakt een letter-herziening (I088 → I088a) met snapshot in inkoop_versies (§4.5).
//  H. Voorraadinkoop (magazijn) trekt uit dezelfde I-reeks; kenmerk hangt aan het
//     magazijn-gebouw (besluit 10).
//  I. Verkoopfacturen onder één offerte: parallel 2 aanmaken → F001+F002 (nooit
//     dubbel); definitief maken geeft het fiscale nummer per BV; een concept
//     verbruikt géén fiscaal nummer; tweede keer definitief → 409 (§4.6).
//
// Uitsluitend voor de dev-omgeving; ruimt alles zelf op.
import "./lib/prodGuard";
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
  if (!cond) {
    console.error(`FAIL [${stap}] ${detail}`);
    process.exit(1);
  }
}
const log = (m: string) => console.log(m);

async function versTotp(secret: string, minResterendeSec = 10): Promise<string> {
  const resterend = authenticator.timeRemaining();
  if (resterend < minResterendeSec) await new Promise((r) => setTimeout(r, (resterend + 1) * 1000));
  return authenticator.generate(secret);
}

async function scalar<T = any>(q: string): Promise<T | null> {
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
    // ── Setup: BV met prefix (restanten van eerdere runs eerst weg) ─────────
    await db.execute(sql.raw(`DELETE FROM gebouwen WHERE naam LIKE 'BEWIJSN01%'`)).catch(() => {});
    await db.execute(sql.raw(`DELETE FROM werkgevers WHERE naam = 'BEWIJSN01 BV'`)).catch(() => {});
    const werkgeverId = await scalar<number>(
      `INSERT INTO werkgevers (naam, kenmerk_prefix) VALUES ('BEWIJSN01 BV', 'BP') RETURNING id`,
    );
    opruim.push(`DELETE FROM werkgevers WHERE id = ${werkgeverId}`);

    // ── A: gebouw krijgt automatisch een G-nummer ────────────────────────────
    const rGeb = await admin.post("/gebouwen", { naam: "BEWIJSN01 pand A", adres: "Teststraat 1", stad: "Testdam", werkgever_id: werkgeverId });
    const geb = await json(rGeb);
    eis(rGeb.status === 201, "A", `gebouw aanmaken: ${rGeb.status} ${JSON.stringify(geb).slice(0, 200)}`);
    opruim.push(`DELETE FROM gebouwen WHERE id = ${geb.id}`);
    eis(/^G\d{3,}$/.test(geb.werknummer ?? ""), "A", `werknummer geen G-vorm: ${geb.werknummer}`);
    eis(!/20\d\d/.test(geb.werknummer), "A", `werknummer bevat jaartal: ${geb.werknummer}`);
    log(`A PASS — nieuw gebouw kreeg automatisch werknummer ${geb.werknummer} (sequence, geen jaartal).`);

    const rGeb2 = await admin.post("/gebouwen", { naam: "BEWIJSN01 pand B", adres: "Teststraat 2", stad: "Testdam", werkgever_id: werkgeverId });
    const geb2 = await json(rGeb2);
    eis(rGeb2.status === 201, "A2", `tweede gebouw: ${rGeb2.status}`);
    opruim.push(`DELETE FROM gebouwen WHERE id = ${geb2.id}`);
    eis(geb2.werknummer !== geb.werknummer, "A2", `dubbele G-nummers: ${geb.werknummer}`);

    // ── B: opname exposeert het M-nummer ─────────────────────────────────────
    const rOpn = await admin.post("/opname", { gebouw_id: geb.id, naam: "BEWIJSN01 opname", datum: "2026-08-08" });
    const opn = await json(rOpn);
    eis(rOpn.status === 201, "B", `opname: ${rOpn.status}`);
    opruim.push(`DELETE FROM opnames WHERE id = ${opn.id}`);
    eis(Number.isInteger(opn.nummer) && opn.nummer > 0, "B", `M-nummer ontbreekt: ${JSON.stringify(opn.nummer)}`);
    log(`B PASS — opname exposeert M-nummer ${opn.nummer}.`);

    // ── C: calculatie-kenmerk wordt berekend en beweegt mee ─────────────────
    const rCalc = await admin.post("/modules/calculaties", { naam: "BEWIJSN01 calc", gebouw_id: geb.id });
    const calc = await json(rCalc);
    eis(rCalc.status === 201, "C", `modcalc: ${rCalc.status} ${JSON.stringify(calc).slice(0, 200)}`);
    opruim.push(`DELETE FROM mod_calc_headers WHERE id = ${calc.id}`);
    eis(Number.isInteger(calc.nummer) && calc.nummer > 0, "C", `C-nummer ontbreekt: ${JSON.stringify(calc)}`);
    eis(calc.kenmerk === `BP-${geb.werknummer}/C${String(calc.nummer).padStart(3, "0")}`,
      "C", `kenmerk klopt niet: ${calc.kenmerk}`);
    const rVerh = await admin.patch(`/modules/calculaties/${calc.id}`, { gebouw_id: geb2.id });
    const verh = await json(rVerh);
    eis(rVerh.status === 200 && verh.kenmerk === `BP-${geb2.werknummer}/C${String(calc.nummer).padStart(3, "0")}`,
      "C", `kenmerk bewoog niet mee: ${verh.kenmerk}`);
    log(`C PASS — kenmerk berekend (${calc.kenmerk}) en beweegt mee naar ${verh.kenmerk} bij gebouwwissel.`);

    // ── D: parallel 5 calculaties → 5 unieke C-nummers ───────────────────────
    const par = await Promise.all(
      [1, 2, 3, 4, 5].map((i) => admin.post("/modules/calculaties", { naam: `BEWIJSN01 par ${i}`, gebouw_id: geb.id }).then(json)),
    );
    for (const p of par) opruim.push(`DELETE FROM mod_calc_headers WHERE id = ${p.id}`);
    const nummers = new Set(par.map((p) => p.nummer));
    eis(nummers.size === 5, "D", `dubbele C-nummers bij parallel aanmaken: ${par.map((p) => p.nummer).join(",")}`);
    log(`D PASS — 5 parallelle calculaties kregen 5 unieke C-nummers (${[...nummers].join(", ")}).`);

    // ── E: offerte-kenmerk G/C/O + kopie met nieuw nummer ───────────────────
    const rOff = await admin.post("/offertes", { titel: "BEWIJSN01 offerte", gebouw_id: geb2.id, calculatie_id: calc.id });
    const off = await json(rOff);
    eis(rOff.status === 201, "E", `offerte: ${rOff.status} ${JSON.stringify(off).slice(0, 200)}`);
    opruim.push(`DELETE FROM offertes WHERE id = ${off.id}`);
    eis(Number.isInteger(off.nummer) && off.nummer > 0, "E", `O-nummer ontbreekt`);
    const verwachtKenmerk = `BP-${geb2.werknummer}/C${String(calc.nummer).padStart(3, "0")}/O${String(off.nummer).padStart(3, "0")}`;
    eis(off.kenmerk === verwachtKenmerk, "E", `offerte-kenmerk klopt niet: ${off.kenmerk} ≠ ${verwachtKenmerk}`);

    const rKop = await admin.post(`/offertes/${off.id}/kopieer`);
    const kop = await json(rKop);
    eis(rKop.status === 201, "E", `kopieer: ${rKop.status} ${JSON.stringify(kop).slice(0, 200)}`);
    opruim.push(`DELETE FROM offertes WHERE id = ${kop.id}`);
    eis(kop.nummer > off.nummer && kop.status === "concept" && kop.gekopieerd_van_id === off.id,
      "E", `kopie fout: nummer=${kop.nummer} status=${kop.status} van=${kop.gekopieerd_van_id}`);
    const origNa = await json(await admin.get(`/offertes/${off.id}`));
    eis(origNa.nummer === off.nummer && origNa.titel === off.titel, "E", "origineel gewijzigd na kopie");
    log(`E PASS — offerte-kenmerk ${off.kenmerk}; kopie kreeg O${String(kop.nummer).padStart(3, "0")} als concept, origineel ongewijzigd.`);

    // ── F: verzonden offerte read-only + bevroren kenmerk ────────────────────
    await db.execute(sql.raw(
      `UPDATE offertes SET status = 'verzonden', portaal_status = 'verzonden', kenmerk = '${verwachtKenmerk}' WHERE id = ${off.id}`,
    ));
    const rPatchVerz = await admin.patch(`/offertes/${off.id}`, { titel: "mag niet" });
    eis(rPatchVerz.status === 409, "F", `PATCH op verzonden offerte gaf ${rPatchVerz.status}, verwacht 409`);
    // gebouw van de calculatie wisselen → berekend kenmerk zou wijzigen, maar het bevroren kenmerk blijft
    await admin.patch(`/modules/calculaties/${calc.id}`, { gebouw_id: geb.id });
    const offNaWissel = await json(await admin.get(`/offertes/${off.id}`));
    eis(offNaWissel.kenmerk === verwachtKenmerk, "F", `bevroren kenmerk veranderde: ${offNaWissel.kenmerk}`);
    log(`F PASS — verzonden offerte is alleen-lezen (409) en het bevroren kenmerk blijft ${verwachtKenmerk}.`);

    // ── G: projectinkoopbon I-nummer + letter-herziening op verzonden bon ────
    // opdracht op de kopie-offerte (die is nog concept en bewerkbaar)
    const rOpd = await admin.post(`/offertes/${kop.id}/maak-opdracht`, {});
    const opd = await json(rOpd);
    eis(rOpd.status === 201, "G", `maak-opdracht: ${rOpd.status} ${JSON.stringify(opd).slice(0, 200)}`);
    opruim.unshift(
      `DELETE FROM project_begrotingen WHERE opdracht_id = ${opd.id}`,
      `DELETE FROM opdrachten WHERE id = ${opd.id}`,
    );
    const rBon = await admin.post(`/opdrachten/${opd.id}/inkoopplanning/inkoopbonnen`, {
      leverancier: "BEWIJSN01 leverancier",
      regels: [{ omschrijving: "Brandklep", hoeveelheid: 2, eenheid: "st", prijs: 10 }],
    });
    const bon = await json(rBon);
    eis(rBon.status === 201, "G", `bon: ${rBon.status} ${JSON.stringify(bon).slice(0, 200)}`);
    opruim.unshift(
      `DELETE FROM inkoop_versies WHERE bron_tabel = 'inkoopbonnen' AND bron_id = ${bon.id}`,
      `DELETE FROM inkoopbon_regels WHERE inkoopbon_id = ${bon.id}`,
      `DELETE FROM inkoopbonnen WHERE id = ${bon.id}`,
    );
    eis(Number.isInteger(bon.nummer) && bon.nummer > 0, "G", `I-nummer ontbreekt: ${JSON.stringify(bon).slice(0, 300)}`);
    const iDeel = `I${String(bon.nummer).padStart(3, "0")}`;
    eis(bon.kenmerk === `O${String(kop.nummer).padStart(3, "0")}/${iDeel}`, "G", `bonkenmerk fout: ${bon.kenmerk}`);
    // verzonden markeren en dan wijzigen → herziening a + snapshot
    await db.execute(sql.raw(`UPDATE inkoopbonnen SET verzonden_op = now() WHERE id = ${bon.id}`));
    const rHerz = await admin.patch(`/opdrachten/${opd.id}/inkoopplanning/inkoopbonnen/${bon.id}`, { opmerkingen: "herziene levering" });
    const herz = await json(rHerz);
    eis(rHerz.status === 200 && herz.herziening === 1 && String(herz.kenmerk).endsWith(`${iDeel}a`),
      "G", `herziening fout: ${rHerz.status} ${JSON.stringify(herz).slice(0, 200)}`);
    const snapshots = await scalar<number>(`SELECT count(*)::int FROM inkoop_versies WHERE bron_tabel = 'inkoopbonnen' AND bron_id = ${bon.id}`);
    eis(snapshots === 1, "G", `verwacht 1 snapshot in inkoop_versies, kreeg ${snapshots}`);
    log(`G PASS — bon ${bon.kenmerk}; wijziging op verzonden bon werd herziening ${herz.kenmerk} met snapshot.`);

    // ── H: voorraadinkoop uit dezelfde I-reeks, kenmerk aan magazijn-gebouw ──
    const magGebouwVoor = await scalar<number | null>(`SELECT magazijn_gebouw_id FROM magazijn_instellingen LIMIT 1`);
    const heeftInstellingen = await scalar<number>(`SELECT count(*)::int FROM magazijn_instellingen`);
    if (heeftInstellingen === 0) {
      await db.execute(sql.raw(`INSERT INTO magazijn_instellingen (magazijn_gebouw_id) VALUES (${geb.id})`));
      opruim.unshift(`DELETE FROM magazijn_instellingen WHERE magazijn_gebouw_id = ${geb.id}`);
    } else {
      await db.execute(sql.raw(`UPDATE magazijn_instellingen SET magazijn_gebouw_id = ${geb.id}`));
      opruim.unshift(`UPDATE magazijn_instellingen SET magazijn_gebouw_id = ${magGebouwVoor === null ? "NULL" : magGebouwVoor}`);
    }
    const rOrder = await admin.post("/magazijn/inkooporders", { notities: "BEWIJSN01 voorraad" });
    const order = await json(rOrder);
    eis(rOrder.status === 201, "H", `order: ${rOrder.status} ${JSON.stringify(order).slice(0, 200)}`);
    opruim.unshift(`DELETE FROM magazijn_inkooporders WHERE id = ${order.id}`);
    eis(Number.isInteger(order.inkoopnummer) && order.inkoopnummer > bon.nummer,
      "H", `voorraadinkoop trekt niet uit dezelfde I-reeks: ${order.inkoopnummer} vs bon ${bon.nummer}`);
    eis(order.kenmerk === `${geb.werknummer}/I${String(order.inkoopnummer).padStart(3, "0")}`,
      "H", `orderkenmerk fout: ${order.kenmerk}`);
    log(`H PASS — voorraadinkoop ${order.kenmerk} uit dezelfde I-reeks (na ${iDeel}).`);

    // ── I: F-nummers per offerte + fiscaal nummer per BV bij definitief ─────
    const [f1, f2] = await Promise.all([
      admin.post("/facturen", { type: "verkoop", offerte_id: kop.id, omschrijving: "BEWIJSN01 termijn 1" }).then(json),
      admin.post("/facturen", { type: "verkoop", offerte_id: kop.id, omschrijving: "BEWIJSN01 termijn 2" }).then(json),
    ]);
    opruim.unshift(`DELETE FROM facturen WHERE id IN (${f1.id}, ${f2.id})`);
    const fset = new Set([f1.nummer, f2.nummer]);
    eis(fset.has(1) && fset.has(2), "I", `parallel F-nummers fout: ${f1.nummer}, ${f2.nummer}`);
    eis(f1.factuurnummer == null && f2.factuurnummer == null, "I", "concept kreeg al een fiscaal nummer");
    const tellerVoor = await scalar<number>(`SELECT COALESCE(MAX(laatste_nummer),0)::int FROM factuurnummer_tellers WHERE werkgever_id = ${werkgeverId}`);
    eis(tellerVoor === 0, "I", `fiscale teller al opgehoogd door concepten: ${tellerVoor}`);
    const eerste = f1.nummer === 1 ? f1 : f2;
    const rDef = await admin.post(`/facturen/${eerste.id}/definitief`);
    const def = await json(rDef);
    eis(rDef.status === 200 && /^\d{5}$/.test(def.factuurnummer), "I", `definitief: ${rDef.status} ${JSON.stringify(def).slice(0, 200)}`);
    eis(def.kenmerk === `O${String(kop.nummer).padStart(3, "0")}/F001`, "I", `factuurkenmerk fout: ${def.kenmerk}`);
    const rDef2 = await admin.post(`/facturen/${eerste.id}/definitief`);
    eis(rDef2.status === 409, "I", `tweede definitief gaf ${rDef2.status}, verwacht 409`);
    opruim.unshift(`DELETE FROM factuurnummer_tellers WHERE werkgever_id = ${werkgeverId}`);
    log(`I PASS — F001/F002 parallel uniek; definitief gaf fiscaal nummer ${def.factuurnummer} per BV (concept verbruikt niets; dubbel definitief → 409).`);

    log("\nALLE ACCEPTATIEPUNTEN PASS ✅");
  } finally {
    for (const q of opruim) {
      await db.execute(sql.raw(q)).catch((e) => console.error(`opruimen faalde: ${q} — ${e}`));
    }
    log("Opgeruimd.");
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
