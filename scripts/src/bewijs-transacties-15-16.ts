// Gedragsbewijs voor schuldpunten 15 en 16 (SCHULD_01).
//
// Punt 15 — POST /offertes/:id/maak-opdracht draait nu in één db.transaction.
//   Bewijs: met een tijdelijke trigger die INSERT op project_begrotingen laat
//   falen geeft het endpoint 500 en bestaat er GEEN halve opdracht-rij (rollback).
//   Zonder trigger slaagt hetzelfde verzoek met opdracht + werkbegroting.
//
// Punt 16 — verlofgoedkeuring: statuswijziging + saldo-mutatie + auditlog lopen
//   samen in de WorkflowEngine-transactie.
//   Bewijs: met een tijdelijke trigger die UPDATE op verlof_saldi laat falen
//   mislukt het goedkeuren én blijft de aanvraag op 'aangevraagd' staan (geen
//   halve statuswijziging). Zonder trigger slaagt goedkeuren en is het saldo
//   exact met het aangevraagde aantal uren verlaagd.
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
  // Rate-limiter wissen + admin-login
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
    // ── PUNT 15 ─────────────────────────────────────────────────────────────
    // Testofferte direct in de DB (kleinste geldige rij)
    const offerteId = await scalar<number>(
      `INSERT INTO offertes (titel, status) VALUES ('BEWIJS15 tijdelijke offerte', 'geaccepteerd') RETURNING id`,
    );
    eis(offerteId, "15-setup", "offerte-insert gaf geen id");
    opruim.push(`DELETE FROM offertes WHERE id = ${offerteId}`);

    // Faal-trigger op project_begrotingen
    await db.execute(sql.raw(`
      CREATE OR REPLACE FUNCTION bewijs15_faal() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'bewijs15: geforceerde fout'; END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER bewijs15_trigger BEFORE INSERT ON project_begrotingen
        FOR EACH ROW EXECUTE FUNCTION bewijs15_faal();
    `));
    const rFaal = await admin.post(`/offertes/${offerteId}/maak-opdracht`, {});
    eis(rFaal.status === 500, "15-faalpad", `verwacht 500, kreeg ${rFaal.status}`);
    const halveOpdracht = await scalar<number>(`SELECT count(*)::int FROM opdrachten WHERE offerte_id = ${offerteId}`);
    eis(halveOpdracht === 0, "15-faalpad", `verwacht 0 opdracht-rijen na rollback, kreeg ${halveOpdracht}`);
    log(`PUNT 15 FAALPAD PASS — begroting-insert geforceerd stuk → 500 én géén achtergebleven opdracht-rij (atomaire rollback).`);

    await db.execute(sql.raw(`DROP TRIGGER bewijs15_trigger ON project_begrotingen; DROP FUNCTION bewijs15_faal();`));

    const rOk = await admin.post(`/offertes/${offerteId}/maak-opdracht`, {});
    const bOk = await json(rOk);
    eis(rOk.status === 201, "15-happypad", `verwacht 201, kreeg ${rOk.status} ${JSON.stringify(bOk).slice(0, 200)}`);
    const begrotingCount = await scalar<number>(
      `SELECT count(*)::int FROM project_begrotingen WHERE opdracht_id = ${bOk.id}`,
    );
    eis(begrotingCount === 1, "15-happypad", `verwacht 1 werkbegroting, kreeg ${begrotingCount}`);
    opruim.unshift(
      `DELETE FROM project_begrotingen WHERE opdracht_id = ${bOk.id}`,
      `DELETE FROM opdrachten WHERE id = ${bOk.id}`,
    );
    log(`PUNT 15 HAPPYPAD PASS — zelfde verzoek zonder storing → 201 met opdracht #${bOk.id} + werkbegroting.`);

    // ── PUNT 16 ─────────────────────────────────────────────────────────────
    // Medewerker + verlofsoort + saldo (alles tijdelijk)
    const soortId = await scalar<number>(
      `INSERT INTO verlofsoorten (naam, actief) VALUES ('BEWIJS16 soort', true) RETURNING id`,
    );
    const medId = await scalar<number>(
      `INSERT INTO medewerkers (naam) VALUES ('BEWIJS16 medewerker') RETURNING id`,
    );
    const saldoId = await scalar<number>(
      `INSERT INTO verlof_saldi (medewerker_id, verlofsoort_id, jaar, beginsaldo_uren, opgebouwd_uren, opgenomen_uren, saldo_uren)
       VALUES (${medId}, ${soortId}, 2026, 40, 0, 0, 40) RETURNING id`,
    );
    const aanvraagId = await scalar<number>(
      `INSERT INTO verlofaanvragen (medewerker_id, verlofsoort_id, start_datum, eind_datum, aantal_uren, status)
       VALUES (${medId}, ${soortId}, '2026-09-01', '2026-09-01', 8, 'aangevraagd') RETURNING id`,
    );
    eis(soortId && medId && saldoId && aanvraagId, "16-setup", "setup-insert mislukt");
    opruim.unshift(
      `DELETE FROM verlof_aanvraag_log WHERE verlofaanvraag_id = ${aanvraagId}`,
      `DELETE FROM verlofaanvragen WHERE id = ${aanvraagId}`,
      `DELETE FROM verlof_saldi WHERE id = ${saldoId}`,
      `DELETE FROM medewerkers WHERE id = ${medId}`,
      `DELETE FROM verlofsoorten WHERE id = ${soortId}`,
    );

    // Faal-trigger op verlof_saldi
    await db.execute(sql.raw(`
      CREATE OR REPLACE FUNCTION bewijs16_faal() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'bewijs16: geforceerde fout'; END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER bewijs16_trigger BEFORE UPDATE ON verlof_saldi
        FOR EACH ROW EXECUTE FUNCTION bewijs16_faal();
    `));
    const gFaal = await admin.patch(`/verlofaanvragen/${aanvraagId}`, { status: "goedgekeurd", negeer_bezetting: true });
    eis(gFaal.status >= 500, "16-faalpad", `verwacht 5xx, kreeg ${gFaal.status}`);
    const statusNaFaal = await scalar<string>(`SELECT status FROM verlofaanvragen WHERE id = ${aanvraagId}`);
    eis(statusNaFaal === "aangevraagd", "16-faalpad", `status is '${statusNaFaal}', verwacht nog 'aangevraagd' (rollback)`);
    log(`PUNT 16 FAALPAD PASS — saldo-update geforceerd stuk → goedkeuren faalt én status blijft 'aangevraagd' (statuswijziging + saldo atomair).`);

    await db.execute(sql.raw(`DROP TRIGGER bewijs16_trigger ON verlof_saldi; DROP FUNCTION bewijs16_faal();`));

    const gOk = await admin.patch(`/verlofaanvragen/${aanvraagId}`, { status: "goedgekeurd", negeer_bezetting: true });
    eis(gOk.status === 200, "16-happypad", `verwacht 200, kreeg ${gOk.status} ${JSON.stringify(await json(gOk)).slice(0, 200)}`);
    const saldoNa = await scalar<number>(`SELECT saldo_uren FROM verlof_saldi WHERE id = ${saldoId}`);
    const opgenomenNa = await scalar<number>(`SELECT opgenomen_uren FROM verlof_saldi WHERE id = ${saldoId}`);
    const logCount = await scalar<number>(
      `SELECT count(*)::int FROM verlof_aanvraag_log WHERE verlofaanvraag_id = ${aanvraagId} AND nieuw_status = 'goedgekeurd'`,
    );
    eis(Number(saldoNa) === 32 && Number(opgenomenNa) === 8, "16-happypad", `saldo=${saldoNa}, opgenomen=${opgenomenNa}; verwacht 32/8`);
    eis(Number(logCount) >= 1, "16-happypad", `geen auditlogregel gevonden`);
    log(`PUNT 16 HAPPYPAD PASS — goedkeuren → status 'goedgekeurd', saldo 40→32, opgenomen 0→8, auditlogregel aanwezig.`);

    log("ALLE BEWIJZEN GESLAAGD (15 + 16).");
  } finally {
    // Triggers zeker weten weg + testdata opruimen
    await db.execute(sql.raw(`
      DROP TRIGGER IF EXISTS bewijs15_trigger ON project_begrotingen;
      DROP FUNCTION IF EXISTS bewijs15_faal();
      DROP TRIGGER IF EXISTS bewijs16_trigger ON verlof_saldi;
      DROP FUNCTION IF EXISTS bewijs16_faal();
    `)).catch(() => {});
    for (const q of opruim) await db.execute(sql.raw(q)).catch((e) => console.error("opruimen faalde:", q, e.message));
    log("Opgeruimd: triggers en testdata verwijderd.");
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
