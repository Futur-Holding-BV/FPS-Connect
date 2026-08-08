// Gedragsbewijs voor task 824: medewerker ZONDER module-recht krijgt 403 op
// projecten/opname/workflow-routes; medewerker MET recht (niveau 4 overal)
// werkt ongewijzigd. Maakt twee tijdelijke accounts, logt in via HTTP en
// ruimt in finally weer op. Alleen in dev.
import bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import { eq } from "drizzle-orm";

import { db, gebruikersTable } from "@workspace/db";
import { MODULE_IDS } from "@workspace/permissies";

if (process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === "production") {
  throw new Error("GEWEIGERD: bewijsscript alleen in dev.");
}

const BASE = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
const WACHTWOORD = "Bewijs824!Tijdelijk";
const TOTP_SECRET = "PAOSGYZWOEMU2HDX";

async function maakAccount(email: string, bevoegdheden: Record<string, number>, rol: "gebruiker" | "hoofdbeheerder" = "gebruiker"): Promise<number> {
  const hash = await bcrypt.hash(WACHTWOORD, 10);
  await db.delete(gebruikersTable).where(eq(gebruikersTable.email, email));
  const [rij] = await db
    .insert(gebruikersTable)
    .values({
      naam: `Bewijs 824 ${email}`,
      email,
      rol,
      wachtwoord: hash,
      tweeFactorIngeschakeld: true,
      totpSecret: TOTP_SECRET,
      actief: true,
      bevoegdheden,
    })
    .returning({ id: gebruikersTable.id });
  return rij.id;
}

async function login(email: string): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, wachtwoord: WACHTWOORD }),
  });
  if (res.status !== 200) throw new Error(`Login ${email} faalde: ${res.status} ${await res.text()}`);
  const cookie = res.headers.get("set-cookie");
  if (!cookie) throw new Error(`Geen sessiecookie voor ${email}`);
  const sessie = cookie.split(";")[0];
  const verify = await fetch(`${BASE}/auth/2fa/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: sessie },
    body: JSON.stringify({ code: authenticator.generate(TOTP_SECRET) }),
  });
  if (verify.status !== 200) throw new Error(`2FA ${email} faalde: ${verify.status} ${await verify.text()}`);
  const cookie2 = verify.headers.get("set-cookie");
  return cookie2 ? cookie2.split(";")[0] : sessie;
}

type Geval = { methode: string; pad: string; zonder: number[]; met: number[] };

// "met" = statussen die géén autorisatiefout zijn (200/404/400/422 mag: de
// middleware laat door, de handler beslist verder over niet-bestaande ids).
const OK_MET = [200, 204, 400, 404, 409, 422];
const GEVALLEN: Geval[] = [
  { methode: "GET",    pad: "/projecten",                     zonder: [403], met: OK_MET },
  { methode: "GET",    pad: "/projecten/999999",              zonder: [403], met: OK_MET },
  { methode: "PATCH",  pad: "/projecten/999999",              zonder: [403], met: OK_MET },
  { methode: "DELETE", pad: "/projecten/999999",              zonder: [403], met: OK_MET },
  { methode: "GET",    pad: "/opname",                        zonder: [403], met: OK_MET },
  { methode: "GET",    pad: "/opname/plattegrond-items?gebouw_id=1", zonder: [403], met: OK_MET },
  { methode: "GET",    pad: "/opname/999999",                 zonder: [403], met: OK_MET },
  { methode: "POST",   pad: "/opname",                        zonder: [403], met: OK_MET },
  { methode: "PATCH",  pad: "/opname/999999",                 zonder: [403], met: OK_MET },
  { methode: "DELETE", pad: "/opname/999999",                 zonder: [403], met: OK_MET },
  { methode: "POST",   pad: "/opname/999999/definitief",      zonder: [403], met: OK_MET },
  { methode: "POST",   pad: "/opname/999999/spots-aanmaken",  zonder: [403], met: OK_MET },
  { methode: "GET",    pad: "/opname/999999/items",           zonder: [403], met: OK_MET },
  { methode: "POST",   pad: "/opname/999999/items",           zonder: [403], met: OK_MET },
  { methode: "GET",    pad: "/opname/items/999999",           zonder: [403], met: OK_MET },
  { methode: "PATCH",  pad: "/opname/items/999999",           zonder: [403], met: OK_MET },
  { methode: "DELETE", pad: "/opname/items/999999",           zonder: [403], met: OK_MET },
  { methode: "POST",   pad: "/opname/items/999999/fotos",     zonder: [403], met: OK_MET },
  { methode: "DELETE", pad: "/opname/fotos/999999",           zonder: [403], met: OK_MET },
  { methode: "GET",    pad: "/workflow-definities",           zonder: [403], met: OK_MET },
  { methode: "POST",   pad: "/workflow-definities",           zonder: [403], met: OK_MET },
  { methode: "GET",    pad: "/workflow-definities/999999",    zonder: [403], met: OK_MET },
  { methode: "PATCH",  pad: "/workflow-definities/999999",    zonder: [403], met: OK_MET },
  { methode: "POST",   pad: "/workflow-lanes",                zonder: [403], met: OK_MET },
  { methode: "PATCH",  pad: "/workflow-lanes/999999",         zonder: [403], met: OK_MET },
  { methode: "DELETE", pad: "/workflow-lanes/999999",         zonder: [403], met: OK_MET },
  { methode: "POST",   pad: "/workflow-cards",                zonder: [403], met: OK_MET },
  { methode: "PATCH",  pad: "/workflow-cards/999999",         zonder: [403], met: OK_MET },
  { methode: "DELETE", pad: "/workflow-cards/999999",         zonder: [403], met: OK_MET },
];

async function roep(cookie: string, g: Geval): Promise<number> {
  const res = await fetch(`${BASE}${g.pad}`, {
    method: g.methode,
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: g.methode === "GET" || g.methode === "DELETE" ? undefined : JSON.stringify({ naam: "bewijs824" }),
  });
  return res.status;
}

async function main(): Promise<void> {
  const emailZonder = "bewijs824-zonder@fps.local";
  const emailMet = "bewijs824-met@fps.local";
  const emailAdmin = "bewijs824-admin@fps.local";
  try {
    const idZonder = await maakAccount(emailZonder, {}); // géén enkel module-recht
    await maakAccount(emailMet, Object.fromEntries(MODULE_IDS.map((m) => [m, 4])));
    await maakAccount(emailAdmin, {}, "hoofdbeheerder");
    const [cookieZonder, cookieMet, cookieAdmin] = [
      await login(emailZonder),
      await login(emailMet),
      await login(emailAdmin),
    ];

    let fouten = 0;
    for (const g of GEVALLEN) {
      const sZonder = await roep(cookieZonder, g);
      const sMet = await roep(cookieMet, g);
      const okZ = g.zonder.includes(sZonder);
      const okM = g.met.includes(sMet);
      if (!okZ || !okM) fouten++;
      console.log(
        `${okZ && okM ? "OK  " : "FOUT"} ${g.methode.padEnd(6)} ${g.pad.padEnd(40)} zonder=${sZonder} met=${sMet}`,
      );
    }
    // Impersonatie ("Bekijken als"): hoofdbeheerder die een medewerker zonder
    // rechten nabootst moet OOK 403 krijgen — effectieve permissies tellen.
    for (const g of GEVALLEN) {
      const res = await fetch(`${BASE}${g.pad}`, {
        method: g.methode,
        headers: {
          Cookie: cookieAdmin,
          "Content-Type": "application/json",
          "X-Gebruiker-Override": String(idZonder),
        },
        body: g.methode === "GET" || g.methode === "DELETE" ? undefined : JSON.stringify({ naam: "bewijs824" }),
      });
      const ok = res.status === 403;
      if (!ok) fouten++;
      console.log(`${ok ? "OK  " : "FOUT"} IMP ${g.methode.padEnd(6)} ${g.pad.padEnd(40)} status=${res.status}`);
    }
    if (fouten > 0) throw new Error(`${fouten} geval(len) gefaald`);
    console.log("\nBEWIJS GESLAAGD: zonder recht overal 403, met recht geen autorisatiefout.");
  } finally {
    await db.delete(gebruikersTable).where(eq(gebruikersTable.email, emailZonder));
    await db.delete(gebruikersTable).where(eq(gebruikersTable.email, emailMet));
    await db.delete(gebruikersTable).where(eq(gebruikersTable.email, emailAdmin));
  }
}

await main();
