import "./lib/prodGuard";
/**
 * Opruimscript bewijs-testdata (HERSTEL_MAIL_01 punt 3).
 *
 * Zoekt in de doelomgeving naar testdata die door bewijsscripts is
 * achtergelaten en (optioneel) verwijdert die:
 *  - CRM-organisaties met naam beginnend met "Bewijs"
 *  - Contactpersonen met adres op @fps.local of bewijs-onbestelbaar-fps.nl
 *  - Marketing-doelgroepen/sjablonen/campagnes met naam beginnend met "Bewijs"
 *
 * Standaard DROOGDRAAI: alleen rapporteren. Verwijderen vereist VERWIJDER=1.
 * Tegen productie draaien vereist bovendien de bewuste prodGuard-vrijstelling
 * (PROD_LEZEN_TOEGESTAAN=1) — samen met VERWIJDER=1 is dat een expliciete,
 * dubbel bevestigde opschoonactie.
 *
 * Env: API_BASIS (bv. https://connect.fps-one.nl/api),
 *      SMOKETEST_EMAIL, SMOKETEST_PASSWORD.
 */

const BASIS = process.env.API_BASIS
  ?? (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}/api` : "http://localhost:8080/api");
const VERWIJDER = process.env.VERWIJDER === "1";

const EMAIL = process.env.SMOKETEST_EMAIL ?? process.env.E2E_EMAIL;
const WACHTWOORD = process.env.SMOKETEST_PASSWORD ?? process.env.E2E_PASSWORD;

const TEST_MAILDOMEINEN = ["@fps.local", "@bewijs-onbestelbaar-fps.nl"];
const TEST_NAAMPREFIX = /^bewijs/i;

let cookie = "";

async function api(methode: string, pad: string, body?: unknown): Promise<{ status: number; json: any }> {
  const resp = await fetch(`${BASIS}${pad}`, {
    method: methode,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = resp.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  let json: any = null;
  try { json = await resp.json(); } catch { /* leeg */ }
  return { status: resp.status, json };
}

async function main(): Promise<void> {
  console.log(`Doel: ${BASIS} — modus: ${VERWIJDER ? "VERWIJDEREN" : "droogdraai (alleen rapporteren)"}`);
  if (!EMAIL || !WACHTWOORD) {
    console.error("✖ SMOKETEST_EMAIL/SMOKETEST_PASSWORD (of E2E_EMAIL/E2E_PASSWORD) ontbreken.");
    process.exit(1);
  }
  const login = await api("POST", "/auth/login", { email: EMAIL, wachtwoord: WACHTWOORD });
  // Smoketest-account is 2FA-vrijgesteld; voor lokale droogdraai met een
  // e2e-account kan TOTP_SECRET gezet worden.
  if (login.json?.status === "verify_2fa" && process.env.TOTP_SECRET) {
    const { authenticator } = await import("otplib");
    const code = authenticator.generate(process.env.TOTP_SECRET);
    const r2 = await api("POST", "/auth/2fa/verify", { code });
    if (r2.status !== 200) { console.error(`✖ 2FA mislukt (HTTP ${r2.status}).`); process.exit(1); }
  } else if (login.status !== 200) {
    console.error(`✖ Inloggen mislukt (HTTP ${login.status}).`);
    process.exit(1);
  }
  console.log("✔ Ingelogd.");

  const vondsten: { soort: string; id: number; omschrijving: string; verwijderPad: string }[] = [];

  // 1. Marketing-campagnes eerst (verwijzen naar sjablonen/doelgroepen).
  for (const [soort, pad] of [
    ["campagne", "/marketing/campagnes"],
    ["sjabloon", "/marketing/sjablonen"],
    ["doelgroep", "/marketing/doelgroepen"],
  ] as const) {
    const lijst = await api("GET", pad);
    if (lijst.status !== 200) { console.warn(`⚠ ${pad}: HTTP ${lijst.status} — overgeslagen`); continue; }
    const items: any[] = Array.isArray(lijst.json) ? lijst.json : lijst.json?.items ?? [];
    for (const it of items) {
      if (TEST_NAAMPREFIX.test(it.naam ?? "")) {
        vondsten.push({ soort, id: it.id, omschrijving: it.naam, verwijderPad: `${pad}/${it.id}` });
      }
    }
  }

  // 2. Contactpersonen met testadressen.
  const contacten = await api("GET", "/crm/contactpersonen");
  if (contacten.status === 200) {
    const items: any[] = Array.isArray(contacten.json) ? contacten.json : [];
    for (const c of items) {
      const email = (c.email ?? "").toLowerCase();
      if (TEST_MAILDOMEINEN.some((d) => email.endsWith(d))) {
        vondsten.push({ soort: "contactpersoon", id: c.id, omschrijving: `${c.naam} <${c.email}>`, verwijderPad: `/crm/contactpersonen/${c.id}` });
      }
    }
  } else console.warn(`⚠ /crm/contactpersonen: HTTP ${contacten.status}`);

  // 3. Organisaties met Bewijs-naam (als laatste verwijderen).
  const orgs = await api("GET", "/crm/klanten");
  if (orgs.status === 200) {
    const items: any[] = Array.isArray(orgs.json) ? orgs.json : orgs.json?.items ?? [];
    for (const o of items) {
      if (TEST_NAAMPREFIX.test(o.naam ?? "")) {
        vondsten.push({ soort: "organisatie", id: o.id, omschrijving: o.naam, verwijderPad: `/crm/klanten/${o.id}` });
      }
    }
  } else console.warn(`⚠ /crm/klanten: HTTP ${orgs.status}`);

  console.log(`\n── Vondsten: ${vondsten.length} ──`);
  for (const v of vondsten) console.log(`  [${v.soort}] #${v.id} — ${v.omschrijving}`);

  if (!VERWIJDER) {
    console.log("\nDroogdraai: niets verwijderd. Zet VERWIJDER=1 om bovenstaande op te ruimen.");
    return;
  }
  let ok = 0, fout = 0;
  for (const v of vondsten) {
    const del = await api("DELETE", v.verwijderPad);
    if (del.status === 204 || del.status === 200) { ok++; console.log(`  ✔ verwijderd: [${v.soort}] #${v.id}`); }
    else { fout++; console.error(`  ✖ HTTP ${del.status}: [${v.soort}] #${v.id} (${v.verwijderPad})`); }
  }
  console.log(`\nKlaar: ${ok} verwijderd, ${fout} mislukt.`);
  if (fout > 0) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
