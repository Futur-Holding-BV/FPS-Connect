import "./lib/prodGuard";
/**
 * Bewijs HERSTEL_MAIL_01 punt 2 — onbestelbare mailadressen.
 *
 * Scenario:
 *  1. Maak een testorganisatie + contactpersoon aan.
 *  2. Markeer het adres als onbestelbaar (direct in de DB, zoals de
 *     bounce-verwerking dat doet).
 *  3. GET /crm/onbestelbaar toont het contact met datum + reden.
 *  4. Nieuw adres invullen via PATCH wist de onbestelbaar-status.
 *  5. Contact verdwijnt uit de onbestelbaar-lijst.
 *  6. Opruimen.
 */
import { authenticator } from "otplib";
import pg from "pg";
import {
  setupE2eWebAdminAccount,
  E2E_WEB_ADMIN_EMAIL, E2E_WEB_ADMIN_WACHTWOORD, E2E_WEB_ADMIN_TOTP_SECRET,
} from "./e2e-monteur-testaccount";

const BASIS = process.env.API_BASIS
  ?? (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}/api` : "http://localhost:8080/api");

let geslaagd = 0;
let gefaald = 0;
function check(naam: string, conditie: boolean, detail?: string) {
  if (conditie) { geslaagd++; console.log(`  ✓ ${naam}`); }
  else { gefaald++; console.error(`  ✗ ${naam}${detail ? ` — ${detail}` : ""}`); }
}

type Sessie = { cookie: string };

async function login(email: string, wachtwoord: string, totpSecret: string): Promise<Sessie> {
  const r1 = await fetch(`${BASIS}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, wachtwoord }),
  });
  const cookie = (r1.headers.get("set-cookie") ?? "").split(";")[0]!;
  const j1 = (await r1.json()) as { status?: string };
  if (j1.status === "verify_2fa" || j1.status === "setup_2fa") {
    const code = authenticator.generate(totpSecret);
    const r2 = await fetch(`${BASIS}/auth/2fa/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ code }),
    });
    if (!r2.ok) throw new Error(`2fa verify faalde: ${r2.status} ${await r2.text()}`);
    const c2 = r2.headers.get("set-cookie");
    return { cookie: c2 ? c2.split(";")[0]! : cookie };
  }
  if (!r1.ok) throw new Error(`login faalde: ${r1.status} ${JSON.stringify(j1)}`);
  return { cookie };
}

async function api(s: Sessie, methode: string, pad: string, body?: unknown) {
  const r = await fetch(`${BASIS}${pad}`, {
    method: methode,
    headers: { "Content-Type": "application/json", cookie: s.cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: any = null;
  try { json = await r.json(); } catch { /* leeg */ }
  return { status: r.status, json };
}

const STEMPEL = Date.now();

async function main() {
  const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  await setupE2eWebAdminAccount();
  const s = await login(E2E_WEB_ADMIN_EMAIL, E2E_WEB_ADMIN_WACHTWOORD, E2E_WEB_ADMIN_TOTP_SECRET);
  console.log("Ingelogd. Basis:", BASIS);

  // 1. Testdata
  const org = await api(s, "POST", "/crm/klanten", { naam: `Bewijs Onbestelbaar BV ${STEMPEL}`, type: "prospect" });
  check("organisatie aangemaakt", org.status === 201, `HTTP ${org.status}`);
  const orgId = org.json?.id;
  const contact = await api(s, "POST", `/crm/klanten/${orgId}/contactpersonen`, {
    naam: "Bounce Test", email: `bounce-${STEMPEL}@fps.local`,
  });
  check("contactpersoon aangemaakt", contact.status === 201, `HTTP ${contact.status} ${JSON.stringify(contact.json)}`);
  const contactId = contact.json?.id;

  // 2. Markeer onbestelbaar zoals de bounce-verwerking dat doet.
  await db.query(
    `UPDATE crm_contactpersonen SET mail_onbestelbaar_op = now(), mail_onbestelbaar_reden = 'Mailbox bestaat niet (550)' WHERE id = $1`,
    [contactId],
  );

  // 3. Lijst-endpoint
  const lijst = await api(s, "GET", "/crm/onbestelbaar");
  check("GET /crm/onbestelbaar geeft 200", lijst.status === 200, `HTTP ${lijst.status}`);
  const item = (lijst.json?.items ?? []).find((i: any) => i.id === contactId);
  check("contact staat in de onbestelbaar-lijst", !!item);
  check("lijst toont reden", item?.mail_onbestelbaar_reden === "Mailbox bestaat niet (550)");
  check("lijst toont organisatienaam", (item?.organisatie_naam ?? "").startsWith("Bewijs Onbestelbaar"));

  // 3b. Detail-mapping bevat de velden ook (badge in klantdetail).
  const det = await api(s, "GET", `/crm/klanten/${orgId}`);
  const detContact = (det.json?.contactpersonen ?? []).find((c: any) => c.id === contactId);
  check("klantdetail-contact draagt onbestelbaar-velden", !!detContact?.mail_onbestelbaar_op);

  // 4. Nieuw adres invullen → status gewist
  const patch = await api(s, "PATCH", `/crm/contactpersonen/${contactId}`, {
    naam: "Bounce Test", email: `hersteld-${STEMPEL}@fps.local`,
  });
  check("PATCH nieuw adres geeft 200", patch.status === 200, `HTTP ${patch.status}`);
  check("respons: onbestelbaar-status gewist", patch.json?.mail_onbestelbaar_op === null);

  // 5. Uit de lijst verdwenen
  const lijst2 = await api(s, "GET", "/crm/onbestelbaar");
  const nogAanwezig = (lijst2.json?.items ?? []).some((i: any) => i.id === contactId);
  check("contact verdwenen uit onbestelbaar-lijst", !nogAanwezig);

  // 6. Opruimen
  await api(s, "DELETE", `/crm/contactpersonen/${contactId}`);
  await api(s, "DELETE", `/crm/klanten/${orgId}`);
  await db.end();

  console.log(`\nResultaat: ${geslaagd} geslaagd, ${gefaald} gefaald.`);
  if (gefaald > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
