// GEBRUIKERS_01 negende onboarding-soort — bewijsscript externe adviseur.
// Test via HTTP (nooit api-server-source importeren) + @workspace/db voor
// opzet/schoonmaak. Draaien: pnpm --filter @workspace/scripts run tsx src/verificatie-externe-adviseur.ts
import "./lib/prodGuard";
import { authenticator } from "otplib";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, gebruikersTable, externeAdviseursTable, medewerkersTable } from "@workspace/db";
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
  let json: unknown = null;
  try { json = await r.json(); } catch { /* leeg */ }
  return { status: r.status, json };
}

const ADVISEUR_EMAIL = "bewijs-externe-adviseur@example.com";
const ADVISEUR_WACHTWOORD = "Bewijs-Adviseur-2026!";

async function schoonOp() {
  const [g] = await db.select({ id: gebruikersTable.id }).from(gebruikersTable)
    .where(eq(gebruikersTable.email, ADVISEUR_EMAIL));
  if (g) {
    await db.delete(externeAdviseursTable).where(eq(externeAdviseursTable.gebruikerId, g.id));
    await db.delete(medewerkersTable).where(eq(medewerkersTable.gebruikerId, g.id));
    await db.delete(gebruikersTable).where(eq(gebruikersTable.id, g.id));
  }
}

async function main() {
  console.log("— GEBRUIKERS_01 externe adviseur bewijsscript —");
  await setupE2eWebAdminAccount();
  await schoonOp();

  const admin = await login(E2E_WEB_ADMIN_EMAIL, E2E_WEB_ADMIN_WACHTWOORD, E2E_WEB_ADMIN_TOTP_SECRET);

  // Stap 0 (accountstap van de wizard): least-privilege account aanmaken.
  const acc = await api(admin, "POST", "/medewerkers/onboarding-account", {
    naam: "Bewijs Externe Adviseur", email: ADVISEUR_EMAIL, uitnodigen: false,
  });
  check("accountstap maakt gebruikersaccount (201)", acc.status === 201, JSON.stringify(acc.json));
  const gebruikerId = (acc.json as { id: number }).id;

  // Bewijs 1: registreren als externe adviseur met verlopen toegang.
  const gisteren = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
  const maak = await api(admin, "POST", "/externe-adviseurs", {
    gebruiker_id: gebruikerId,
    bedrijf: "Administratiekantoor Bewijs BV",
    contactpersoon: "H. Bewijs",
    ingeschakeld_voor: "Boekhouding en loonadministratie",
    functietitel: "Externe boekhouder",
    toegang_tot: gisteren,
  });
  check("registreren externe adviseur (201)", maak.status === 201, JSON.stringify(maak.json));
  const adviseurId = (maak.json as { id: number }).id;

  // Bewijs 2: duplicaat wordt geweigerd.
  const dup = await api(admin, "POST", "/externe-adviseurs", {
    gebruiker_id: gebruikerId, bedrijf: "X", ingeschakeld_voor: "Y", toegang_tot: gisteren,
  });
  check("tweede registratie geeft 409", dup.status === 409, JSON.stringify(dup.json));

  // Bewijs 3: staat in het overzicht, zonder medewerkerprofiel.
  const lijst = await api(admin, "GET", "/externe-adviseurs");
  const rij = (lijst.json as Array<Record<string, unknown>>).find((r) => r.gebruiker_id === gebruikerId);
  check("adviseur staat in overzicht met bedrijf/contactpersoon", !!rij && rij.bedrijf === "Administratiekantoor Bewijs BV" && rij.contactpersoon === "H. Bewijs");
  const [mw] = await db.select({ id: medewerkersTable.id }).from(medewerkersTable)
    .where(eq(medewerkersTable.gebruikerId, gebruikerId));
  check("géén medewerkerprofiel aangemaakt (buiten personeelsbestand)", !mw);

  // Bewijs 4: verlopen toegang blokkeert inloggen (web) fail-closed.
  await db.update(gebruikersTable)
    .set({ wachtwoord: await bcrypt.hash(ADVISEUR_WACHTWOORD, 10) })
    .where(eq(gebruikersTable.id, gebruikerId));
  const lr1 = await fetch(`${BASIS}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADVISEUR_EMAIL, wachtwoord: ADVISEUR_WACHTWOORD }),
  });
  const lj1 = (await lr1.json()) as { code?: string };
  check("login met verlopen toegang → 403 ADVISEUR_TOEGANG_VERLOPEN", lr1.status === 403 && lj1.code === "ADVISEUR_TOEGANG_VERLOPEN", `${lr1.status} ${JSON.stringify(lj1)}`);

  // Bewijs 5: mobiel loginpad blokkeert eveneens.
  const lm = await fetch(`${BASIS}/auth/mobile/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADVISEUR_EMAIL, wachtwoord: ADVISEUR_WACHTWOORD, code: "000000" }),
  });
  const lmj = (await lm.json()) as { code?: string };
  check("mobiele login met verlopen toegang → 403", lm.status === 403 && lmj.code === "ADVISEUR_TOEGANG_VERLOPEN", `${lm.status} ${JSON.stringify(lmj)}`);

  // Bewijs 6: toegang verlengen via PATCH → inloggen kan weer verder (2FA-stap).
  const morgen = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  const patch = await api(admin, "PATCH", `/externe-adviseurs/${adviseurId}`, { toegang_tot: morgen });
  check("toegang verlengen via PATCH (200)", patch.status === 200, JSON.stringify(patch.json));
  const lr2 = await fetch(`${BASIS}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADVISEUR_EMAIL, wachtwoord: ADVISEUR_WACHTWOORD }),
  });
  const lj2 = (await lr2.json()) as { status?: string };
  check("na verlenging komt login voorbij de poort (2FA-stap)", lr2.status === 200 && (lj2.status === "verify_2fa" || lj2.status === "setup_2fa"), `${lr2.status} ${JSON.stringify(lj2)}`);

  // Bewijs 7: wederzijdse exclusiviteit — een adviseur kan niet alsnog in het
  // personeelsbestand belanden.
  const mwPoging = await api(admin, "POST", "/medewerkers", {
    naam: "Bewijs Externe Adviseur", gebruiker_id: gebruikerId, werkmaatschappij: "FPS Brandpreventie",
  });
  check("POST /medewerkers voor adviseur → 409 IS_EXTERNE_ADVISEUR",
    mwPoging.status === 409 && (mwPoging.json as { code?: string }).code === "IS_EXTERNE_ADVISEUR",
    `${mwPoging.status} ${JSON.stringify(mwPoging.json)}`);
  const onbPoging = await api(admin, "POST", "/medewerkers/onboarding", {
    gebruiker_id: gebruikerId, werkmaatschappij: "FPS Brandpreventie",
  });
  check("POST /medewerkers/onboarding voor adviseur → 409",
    onbPoging.status === 409 && (onbPoging.json as { code?: string }).code === "IS_EXTERNE_ADVISEUR",
    `${onbPoging.status} ${JSON.stringify(onbPoging.json)}`);

  // Bewijs 8: een BESTAANDE sessie wordt per request geblokkeerd zodra de
  // toegang verloopt (niet alleen bij login). Adviseur krijgt 2FA + sessie,
  // daarna zetten we toegang_tot terug naar gisteren.
  const adviseurTotp = authenticator.generateSecret();
  await db.update(gebruikersTable)
    .set({ totpSecret: adviseurTotp, tweeFactorIngeschakeld: true })
    .where(eq(gebruikersTable.id, gebruikerId));
  const adviseurSessie = await login(ADVISEUR_EMAIL, ADVISEUR_WACHTWOORD, adviseurTotp);
  const voor = await api(adviseurSessie, "GET", "/auth/me");
  check("adviseur met geldige toegang kan API bereiken", voor.status === 200, `${voor.status}`);
  await db.update(externeAdviseursTable)
    .set({ toegangTot: gisteren })
    .where(eq(externeAdviseursTable.id, adviseurId));
  const na = await api(adviseurSessie, "GET", "/dashboard/stats");
  check("bestaande sessie na verlopen toegang → 403 ADVISEUR_TOEGANG_VERLOPEN",
    na.status === 403 && (na.json as { code?: string }).code === "ADVISEUR_TOEGANG_VERLOPEN",
    `${na.status} ${JSON.stringify(na.json)}`);

  await schoonOp();
  console.log(`\nResultaat: ${geslaagd} geslaagd, ${gefaald} gefaald`);
  if (gefaald > 0) process.exit(1);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
