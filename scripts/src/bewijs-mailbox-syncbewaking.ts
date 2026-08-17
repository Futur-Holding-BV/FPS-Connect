// Bewijs: mailbox-syncbewaking (taak: achtergrondsync mag nooit geruisloos
// stilvallen). Test via HTTP + @workspace/db (nooit api-server-source
// importeren) tegen de draaiende dev-api:
//
//  1. Werkend token + verse sync  → werkendeKoppelingen=1, géén alarm
//  2. Token met refresh-weigering → werkendeKoppelingen=0, alarm gezet
//  3. Bewaking nogmaals draaien   → alarm ongewijzigd (24u-dedupe)
//  4. Koppeling hersteld + verse sync → alarm gereset (nieuwe stilstand meldt weer)
//  5. Werkende koppeling maar >6u niet gesynct → alarm (stale-sync)
//
// Draaien: pnpm --filter @workspace/scripts exec tsx src/bewijs-mailbox-syncbewaking.ts
// Testdata wordt in het finally-blok opgeruimd.

import "./lib/prodGuard";
import bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import { eq } from "drizzle-orm";
import {
  db,
  gebruikersTable,
  werkInboxMailboxenTable,
  werkInboxMailboxToegangTable,
  werkInboxTokensTable,
} from "@workspace/db";

const BASE = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const ADMIN_EMAIL = "bewijs-syncbewaking-admin@fps.local";
const LID_EMAIL = "bewijs-syncbewaking-lid@fps.local";
const MAILBOX = "bewijs-syncbewaking@fps.local";
const WACHTWOORD = "BewijsSync!2026";

if (process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === "production") {
  throw new Error("GEWEIGERD: bewijsscript draait alleen in dev.");
}

let checks = 0;
let fouten = 0;
function check(naam: string, conditie: boolean, detail?: unknown): void {
  checks += 1;
  if (conditie) {
    console.log(`  ✓ ${naam}`);
  } else {
    fouten += 1;
    console.error(`  ✗ ${naam}`, detail ?? "");
  }
}

async function main(): Promise<void> {
  const hash = await bcrypt.hash(WACHTWOORD, 10);

  // ── Testdata ──────────────────────────────────────────────────────────────
  const TOTP_SECRET = authenticator.generateSecret();
  const [admin] = await db.insert(gebruikersTable)
    .values({ naam: "Bewijs Sync Admin", email: ADMIN_EMAIL, wachtwoord: hash, rol: "hoofdbeheerder", actief: true, tweeFactorIngeschakeld: true, totpSecret: TOTP_SECRET })
    .onConflictDoUpdate({ target: gebruikersTable.email, set: { wachtwoord: hash, rol: "hoofdbeheerder", actief: true, tweeFactorIngeschakeld: true, totpSecret: TOTP_SECRET } })
    .returning();
  const [lid] = await db.insert(gebruikersTable)
    .values({ naam: "Bewijs Sync Lid", email: LID_EMAIL, wachtwoord: hash, rol: "gebruiker", actief: true })
    .onConflictDoUpdate({ target: gebruikersTable.email, set: { actief: true } })
    .returning();
  if (!admin || !lid) throw new Error("Testgebruikers niet aangemaakt");

  try {
    const [mb] = await db.insert(werkInboxMailboxenTable)
      .values({ emailAdres: MAILBOX, label: "Bewijs Synctest", actief: true, modus: "verwerken", isFactuurmailbox: true, laatstGesynctOp: new Date() })
      .onConflictDoUpdate({ target: werkInboxMailboxenTable.emailAdres, set: { actief: true, modus: "verwerken", syncAlarmOp: null, laatstGesynctOp: new Date() } })
      .returning();
    if (!mb) throw new Error("Testmailbox niet aangemaakt");

    await db.insert(werkInboxMailboxToegangTable)
      .values({ mailboxId: mb.id, gebruikerId: lid.id, recht: "behandelen" })
      .onConflictDoNothing();
    await db.insert(werkInboxTokensTable)
      .values({ gebruikerId: lid.id, microsoftEmail: LID_EMAIL, accessTokenEnc: "test", refreshTokenEnc: "test", verlooptOp: new Date(Date.now() + 3600_000) })
      .onConflictDoUpdate({ target: werkInboxTokensTable.gebruikerId, set: { refreshMisluktOp: null, verlooptOp: new Date(Date.now() + 3600_000) } });

    // ── Inloggen als hoofdbeheerder ───────────────────────────────────────────
    const loginRes = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ADMIN_EMAIL, wachtwoord: WACHTWOORD }),
    });
    let cookie = loginRes.headers.get("set-cookie")?.split(";")[0] ?? "";
    const verifyRes = await fetch(`${BASE}/api/auth/2fa/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ code: authenticator.generate(TOTP_SECRET) }),
    });
    cookie = verifyRes.headers.get("set-cookie")?.split(";")[0] ?? cookie;
    check("login als hoofdbeheerder (incl. 2FA)", loginRes.ok && verifyRes.ok && cookie.length > 0, { login: loginRes.status, verify: verifyRes.status });

    const haalMailbox = async (): Promise<{ werkendeKoppelingen: number; laatstGesynctOp: string | null } | undefined> => {
      const res = await fetch(`${BASE}/api/werk-inbox/mailboxen`, { headers: { Cookie: cookie } });
      const lijst = (await res.json()) as Array<{ id: number; werkendeKoppelingen: number; laatstGesynctOp: string | null }>;
      return lijst.find((m) => m.id === mb.id);
    };
    const draaiBewaking = async (): Promise<void> => {
      const res = await fetch(`${BASE}/api/werk-inbox/sync-bewaking/run`, { method: "POST", headers: { Cookie: cookie } });
      if (!res.ok) throw new Error(`sync-bewaking/run gaf ${res.status}`);
    };
    const alarmOp = async (): Promise<Date | null> => {
      const [rij] = await db.select({ syncAlarmOp: werkInboxMailboxenTable.syncAlarmOp })
        .from(werkInboxMailboxenTable).where(eq(werkInboxMailboxenTable.id, mb.id));
      return rij?.syncAlarmOp ?? null;
    };

    // 1. Gezond: werkend token + verse sync
    let status = await haalMailbox();
    check("gezond: werkendeKoppelingen = 1", status?.werkendeKoppelingen === 1, status);
    check("gezond: laatstGesynctOp gevuld", !!status?.laatstGesynctOp, status);
    await draaiBewaking();
    check("gezond: geen alarm", (await alarmOp()) === null);

    // 2. Refresh geweigerd (invalid_grant-pad): koppeling telt niet meer mee
    await db.update(werkInboxTokensTable).set({ refreshMisluktOp: new Date() })
      .where(eq(werkInboxTokensTable.gebruikerId, lid.id));
    status = await haalMailbox();
    check("refresh geweigerd: werkendeKoppelingen = 0", status?.werkendeKoppelingen === 0, status);
    await draaiBewaking();
    const alarm1 = await alarmOp();
    check("refresh geweigerd: alarm gezet", alarm1 !== null);

    // 3. Dedupe: tweede run binnen 24 uur wijzigt het alarm niet
    await draaiBewaking();
    const alarm2 = await alarmOp();
    check("dedupe: alarm ongewijzigd bij tweede run", alarm1?.getTime() === alarm2?.getTime(), { alarm1, alarm2 });

    // 4. Herstel: koppeling weer gezond + verse sync → alarm gereset
    await db.update(werkInboxTokensTable).set({ refreshMisluktOp: null })
      .where(eq(werkInboxTokensTable.gebruikerId, lid.id));
    await db.update(werkInboxMailboxenTable).set({ laatstGesynctOp: new Date() })
      .where(eq(werkInboxMailboxenTable.id, mb.id));
    await draaiBewaking();
    check("herstel: alarm gereset", (await alarmOp()) === null);
    status = await haalMailbox();
    check("herstel: werkendeKoppelingen weer 1", status?.werkendeKoppelingen === 1, status);

    // 5. Stale sync: wél werkende koppeling maar >6 uur niet gesynct
    await db.update(werkInboxMailboxenTable).set({ laatstGesynctOp: new Date(Date.now() - 7 * 3600_000) })
      .where(eq(werkInboxMailboxenTable.id, mb.id));
    await draaiBewaking();
    check("stale sync (>6u): alarm gezet", (await alarmOp()) !== null);

    // 6. Nooit gesynct: werkende koppeling, laatst_gesynct_op NULL, mailbox
    //    ouder dan de gratieperiode → alarm (bijv. token oké maar geen
    //    Exchange-toegang; mag nooit stilzwijgend blijven).
    await db.update(werkInboxMailboxenTable)
      .set({ laatstGesynctOp: null, syncAlarmOp: null, aangemaaktOp: new Date(Date.now() - 7 * 3600_000) })
      .where(eq(werkInboxMailboxenTable.id, mb.id));
    await draaiBewaking();
    const alarmNooit = await alarmOp();
    check("nooit gesynct (>6u oud, wél koppeling): alarm gezet", alarmNooit !== null);
    await draaiBewaking();
    check("nooit gesynct: dedupe bij tweede run", alarmNooit?.getTime() === (await alarmOp())?.getTime());

    // 7. Nooit gesynct maar bínnen de gratieperiode → geen alarm
    await db.update(werkInboxMailboxenTable)
      .set({ syncAlarmOp: null, aangemaaktOp: new Date() })
      .where(eq(werkInboxMailboxenTable.id, mb.id));
    await draaiBewaking();
    check("nooit gesynct (net aangemaakt): geen alarm", (await alarmOp()) === null);
  } finally {
    // ── Opruimen (ook bij falen) ──────────────────────────────────────────────
    await db.delete(werkInboxMailboxenTable).where(eq(werkInboxMailboxenTable.emailAdres, MAILBOX));
    await db.delete(werkInboxTokensTable).where(eq(werkInboxTokensTable.gebruikerId, lid.id));
    await db.delete(gebruikersTable).where(eq(gebruikersTable.email, ADMIN_EMAIL));
    await db.delete(gebruikersTable).where(eq(gebruikersTable.email, LID_EMAIL));
  }

  console.log(`\n${checks - fouten}/${checks} checks geslaagd`);
  if (fouten > 0) process.exit(1);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
