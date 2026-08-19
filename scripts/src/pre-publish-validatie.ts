// Pre-Publish Validatie — 10 kritieke identiteitsflows end-to-end tegen de
// draaiende dev-omgeving (https://$REPLIT_DEV_DOMAIN), met per stap harde
// bewijsvoering (statuscodes, DB-verificatie van hashes/tokens/statussen).
//
// Stappen:
//   1. Gebruiker aanmaken
//   2. Gebruiker bewerken (zonder wachtwoord — hash mag NIET wijzigen)
//   3. Wachtwoord wijzigen via Bewerken (hash MOET wijzigen)
//   4. Wachtwoord-resetflow (admin tijdelijk wachtwoord + publieke resetlink)
//   5. Uitnodigingsflow (mail → token → activeren → 2FA-setup → sessie)
//   6. Weblogin (wachtwoord + TOTP-inrichting)
//   7. GET /auth/me
//   8. Rollen laden (rol + bevoegdheden + autorisatie-effect)
//   9. Uitloggen
//  10. Opnieuw inloggen met het gewijzigde wachtwoord (incl. negatieve proef
//      met het oude wachtwoord)
//
// Faalt een stap, dan stopt het script direct met exitcode 1.
// Vooraf de api-server workflow herstarten reset de in-memory rate limiter.
//
// Draaien: pnpm --filter @workspace/scripts run pre-publish-validatie
import bcrypt from "bcryptjs";
import { and, desc, eq, isNull } from "drizzle-orm";
import { authenticator } from "otplib";

import {
  db,
  gebruikersTable,
  mailLogboekTable,
  wachtwoordResetTokensTable,
} from "@workspace/db";

import {
  E2E_WW_ADMIN_EMAIL,
  E2E_WW_ADMIN_TOTP_SECRET,
  E2E_WW_ADMIN_WACHTWOORD,
  E2E_WW_TARGET_EMAIL,
  archiveerE2eWachtwoordAccounts,
  setupE2eWachtwoordAccounts,
} from "./e2e-wachtwoord-testaccounts";

const DOMEIN = process.env.REPLIT_DEV_DOMAIN;
if (!DOMEIN) {
  console.error("REPLIT_DEV_DOMAIN ontbreekt — kan niet tegen de dev-omgeving testen.");
  process.exit(1);
}
const BASIS = `https://${DOMEIN}/api`;

// ── Sessie met cookie-jar ────────────────────────────────────────────────────
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
  patch(pad: string, body: unknown): Promise<Response> {
    return this.fetch(pad, { method: "PATCH", body: JSON.stringify(body) });
  }
  get(pad: string): Promise<Response> {
    return this.fetch(pad);
  }
}

// ── Hulpfuncties ─────────────────────────────────────────────────────────────
// Aangemaakte testgebruikers; worden ook bij een falende run opgeruimd (finally).
const aangemaakteTestIds: number[] = [];

function faal(stap: string, detail: string): never {
  throw new Error(`FAIL — ${stap}: ${detail}`);
}

async function json<T = any>(res: Response): Promise<T> {
  const tekst = await res.text();
  try {
    return JSON.parse(tekst) as T;
  } catch {
    return tekst as unknown as T;
  }
}

function eis(voorwaarde: boolean, stap: string, detail: string): void {
  if (!voorwaarde) faal(stap, detail);
}

async function versTotp(secret: string, minResterendeSec = 8): Promise<string> {
  const resterend = authenticator.timeRemaining();
  if (resterend < minResterendeSec) {
    await new Promise((r) => setTimeout(r, (resterend + 1) * 1000));
  }
  return authenticator.generate(secret);
}

async function dbGebruiker(id: number) {
  const [g] = await db.select().from(gebruikersTable).where(eq(gebruikersTable.id, id));
  return g;
}

const bewijs: string[] = [];
function log(regel: string): void {
  bewijs.push(regel);
  console.log(regel);
}

// ── Hoofdprogramma ───────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const ts = Date.now();
  const W1 = "PrePub!Start2026";
  const W2 = "PrePub!Nieuw2026";
  const W3 = "PrePub!Reset2026";
  const W4 = "PrePub!Invite2026";

  log(`Pre-Publish Validatie — ${new Date().toISOString()} — doel: ${BASIS}`);

  // Voorbereiding: vaste e2e-accounts en admin-sessie
  const { adminId, targetId } = await setupE2eWachtwoordAccounts();
  const admin = new Sessie();
  {
    const r1 = await admin.post("/auth/login", {
      email: E2E_WW_ADMIN_EMAIL,
      wachtwoord: E2E_WW_ADMIN_WACHTWOORD,
    });
    const b1 = await json(r1);
    eis(r1.status === 200 && b1.status === "verify_2fa", "voorbereiding", `admin-login gaf ${r1.status} ${JSON.stringify(b1)}`);
    const code = await versTotp(E2E_WW_ADMIN_TOTP_SECRET, 10);
    const r2 = await admin.post("/auth/2fa/verify", { code });
    const b2 = await json(r2);
    eis(r2.status === 200 && b2.rol === "hoofdbeheerder", "voorbereiding", `admin 2FA-verify gaf ${r2.status} ${JSON.stringify(b2)}`);
    log(`Voorbereiding: admin (id ${adminId}) ingelogd via wachtwoord + TOTP → 200, rol=${b2.rol}`);
  }

  // ── STAP 1: Gebruiker aanmaken ─────────────────────────────────────────────
  const u1Email = `e2e-prepub-${ts}@fps.local`;
  let u1Id: number;
  {
    const r = await admin.post("/gebruikers", {
      naam: "PrePub Validatie Gebruiker",
      email: u1Email,
      rol: "gebruiker",
      wachtwoord: W1,
    });
    const b = await json(r);
    eis(r.status === 201 && typeof b.id === "number", "stap 1", `POST /gebruikers gaf ${r.status} ${JSON.stringify(b)}`);
    u1Id = b.id;
    aangemaakteTestIds.push(u1Id);
    const rij = await dbGebruiker(u1Id);
    eis(!!rij?.wachtwoord && rij.wachtwoord.startsWith("$2"), "stap 1", "geen bcrypt-hash in DB");
    eis(await bcrypt.compare(W1, rij!.wachtwoord!), "stap 1", "hash matcht opgegeven wachtwoord niet");
    log(`STAP 1 PASS — gebruiker aangemaakt: 201, id=${u1Id}, e-mail=${u1Email}, bcrypt-hash aanwezig en verifieert tegen opgegeven wachtwoord`);
  }

  // ── STAP 2: Gebruiker bewerken (zonder wachtwoord) ─────────────────────────
  {
    const hashVoor = (await dbGebruiker(u1Id))!.wachtwoord;
    const r = await admin.patch(`/gebruikers/${u1Id}`, {
      naam: "PrePub Validatie Gebruiker (bewerkt)",
      telefoon: "0612345678",
    });
    const b = await json(r);
    eis(r.status === 200 && b.naam === "PrePub Validatie Gebruiker (bewerkt)", "stap 2", `PATCH gaf ${r.status} ${JSON.stringify(b)}`);
    const rij = await dbGebruiker(u1Id);
    eis(rij!.telefoon === "0612345678", "stap 2", "telefoon niet bijgewerkt in DB");
    eis(rij!.wachtwoord === hashVoor, "stap 2", "wachtwoordhash is gewijzigd terwijl er geen wachtwoord is meegestuurd");
    log(`STAP 2 PASS — bewerken zonder wachtwoord: 200, naam+telefoon bijgewerkt, wachtwoordhash byte-voor-byte ongewijzigd`);
  }

  // ── STAP 3: Wachtwoord wijzigen via Bewerken ───────────────────────────────
  {
    const hashVoor = (await dbGebruiker(u1Id))!.wachtwoord;
    const r = await admin.patch(`/gebruikers/${u1Id}`, { wachtwoord: W2 });
    eis(r.status === 200, "stap 3", `PATCH met wachtwoord gaf ${r.status}`);
    const rij = await dbGebruiker(u1Id);
    eis(rij!.wachtwoord !== hashVoor, "stap 3", "hash niet gewijzigd na wachtwoord-PATCH");
    eis(await bcrypt.compare(W2, rij!.wachtwoord!), "stap 3", "nieuwe hash verifieert niet tegen nieuw wachtwoord");
    eis(!(await bcrypt.compare(W1, rij!.wachtwoord!)), "stap 3", "oude wachtwoord verifieert nog steeds");
    log(`STAP 3 PASS — wachtwoord via Bewerken: 200, hash gewijzigd, verifieert tegen nieuw wachtwoord, oud wachtwoord ongeldig`);
  }

  // ── STAP 4: Wachtwoord-resetflow ───────────────────────────────────────────
  {
    // 4a — admin-reset met tijdelijk wachtwoord
    const r = await admin.post(`/gebruikers/${targetId}/wachtwoord-resetten`, { methode: "tijdelijk" });
    const b = await json(r);
    eis(r.status === 200 && typeof b.tijdelijk_wachtwoord === "string" && b.tijdelijk_wachtwoord.length >= 8, "stap 4a", `reset gaf ${r.status} ${JSON.stringify(b)}`);
    const rijA = await dbGebruiker(targetId);
    eis(rijA!.moetWachtwoordWijzigen === true, "stap 4a", "moet_wachtwoord_wijzigen niet gezet");
    const sesA = new Sessie();
    const rlA = await sesA.post("/auth/login", { email: E2E_WW_TARGET_EMAIL, wachtwoord: b.tijdelijk_wachtwoord });
    const blA = await json(rlA);
    eis(rlA.status === 200 && (blA.status === "setup_2fa" || blA.status === "verify_2fa"), "stap 4a", `login met tijdelijk wachtwoord gaf ${rlA.status} ${JSON.stringify(blA)}`);
    log(`STAP 4a PASS — admin-reset (tijdelijk): 200, tijdelijk wachtwoord uitgegeven, moet_wachtwoord_wijzigen=true, login met tijdelijk wachtwoord → ${blA.status}`);

    // 4b — publieke resetlink-flow (token uit DB; mailfout wordt bewust geslikt door de route)
    const rv = await new Sessie().post("/auth/wachtwoord-vergeten", { email: E2E_WW_TARGET_EMAIL });
    eis(rv.status === 204, "stap 4b", `wachtwoord-vergeten gaf ${rv.status}`);
    const [tokenRij] = await db
      .select()
      .from(wachtwoordResetTokensTable)
      .where(and(eq(wachtwoordResetTokensTable.gebruikerId, targetId), isNull(wachtwoordResetTokensTable.gebruiktOp)))
      .orderBy(desc(wachtwoordResetTokensTable.id))
      .limit(1);
    eis(!!tokenRij, "stap 4b", "geen resettoken aangemaakt in wachtwoord_reset_tokens");
    const rr = await new Sessie().post("/auth/wachtwoord-reset", { token: tokenRij!.token, nieuw_wachtwoord: W3 });
    eis(rr.status === 204, "stap 4b", `wachtwoord-reset gaf ${rr.status}`);
    const [tokenNa] = await db
      .select()
      .from(wachtwoordResetTokensTable)
      .where(eq(wachtwoordResetTokensTable.id, tokenRij!.id));
    eis(tokenNa!.gebruiktOp !== null, "stap 4b", "token niet als gebruikt gemarkeerd");
    const rijB = await dbGebruiker(targetId);
    eis(await bcrypt.compare(W3, rijB!.wachtwoord!), "stap 4b", "hash verifieert niet tegen resetwachtwoord");
    eis(rijB!.moetWachtwoordWijzigen === false, "stap 4b", "moet_wachtwoord_wijzigen niet teruggezet");
    const sesB = new Sessie();
    const rlB = await sesB.post("/auth/login", { email: E2E_WW_TARGET_EMAIL, wachtwoord: W3 });
    const blB = await json(rlB);
    eis(rlB.status === 200, "stap 4b", `login na resetlink gaf ${rlB.status} ${JSON.stringify(blB)}`);
    log(`STAP 4b PASS — publieke resetlink: 204, token aangemaakt + eenmalig gemarkeerd, nieuw wachtwoord actief, login → ${blB.status}`);
  }

  // ── STAP 5: Uitnodigingsflow ───────────────────────────────────────────────
  let u2Id: number;
  {
    // Plus-adressering naar de eigen gedeelde postbus: echte Graph-verzending
    // zonder bounce naar een niet-bestaand domein.
    const postbus = process.env.MAIL_MAILBOX ?? "app@fpsbrandpreventie.nl";
    const [lokaal, dom] = postbus.split("@");
    const u2Email = dom ? `${lokaal}+e2e-prepub-${ts}@${dom}` : `e2e-prepub-invite-${ts}@fps.local`;

    const rc = await admin.post("/gebruikers", {
      naam: "PrePub Uitnodiging Gebruiker",
      email: u2Email,
      rol: "gebruiker",
    });
    const bc = await json(rc);
    eis(rc.status === 201 && typeof bc.id === "number", "stap 5", `aanmaken uitnodigingsgebruiker gaf ${rc.status} ${JSON.stringify(bc)}`);
    u2Id = bc.id;
    aangemaakteTestIds.push(u2Id);
    eis(bc.uitnodiging_status === "niet_uitgenodigd", "stap 5", `verwachtte niet_uitgenodigd, kreeg ${bc.uitnodiging_status}`);

    const ru = await admin.post(`/gebruikers/${u2Id}/uitnodigen`);
    const bu = await json(ru);
    eis(ru.status === 200 && bu.uitnodiging_status === "uitgenodigd", "stap 5", `uitnodigen gaf ${ru.status} ${JSON.stringify(bu)}`);

    const [mailRij] = await db
      .select()
      .from(mailLogboekTable)
      .where(eq(mailLogboekTable.naarEmail, u2Email))
      .orderBy(desc(mailLogboekTable.id))
      .limit(1);
    eis(!!mailRij && mailRij.soort === "uitnodiging" && mailRij.status === "verzonden", "stap 5", `mail_logboek: ${JSON.stringify(mailRij ?? null)}`);

    const rijU2 = await dbGebruiker(u2Id);
    eis(!!rijU2?.uitnodigingToken, "stap 5", "geen uitnodigingstoken in DB");
    const token = rijU2!.uitnodigingToken!;

    const sesU2 = new Sessie();
    const rg = await sesU2.get(`/uitnodiging/${token}`);
    const bg = await json(rg);
    eis(rg.status === 200 && bg.email === u2Email, "stap 5", `token-verificatie gaf ${rg.status} ${JSON.stringify(bg)}`);

    const ra = await sesU2.post(`/uitnodiging/${token}/activeren`, { wachtwoord: W4, taal: "nl" });
    const ba = await json(ra);
    eis(ra.status === 200 && ba.status === "setup_2fa", "stap 5", `activeren gaf ${ra.status} ${JSON.stringify(ba)}`);

    const rs = await sesU2.post("/auth/2fa/setup");
    const bs = await json(rs);
    eis(rs.status === 200 && typeof bs.secret === "string", "stap 5", `2fa/setup gaf ${rs.status}`);
    const code = await versTotp(bs.secret);
    const rv2 = await sesU2.post("/auth/2fa/activeren", { code });
    const bv2 = await json(rv2);
    eis(rv2.status === 200 && bv2.id === u2Id, "stap 5", `2fa/activeren gaf ${rv2.status} ${JSON.stringify(bv2)}`);

    const rijNa = await dbGebruiker(u2Id);
    eis(rijNa!.uitnodigingStatus === "geaccepteerd" && rijNa!.tweeFactorIngeschakeld === true, "stap 5", `DB-status na activeren: ${rijNa!.uitnodigingStatus}, 2fa=${rijNa!.tweeFactorIngeschakeld}`);
    const rm = await sesU2.get("/auth/me");
    eis(rm.status === 200, "stap 5", `/auth/me na activeren gaf ${rm.status}`);
    log(`STAP 5 PASS — uitnodiging: mail echt verzonden via Graph (mail_logboek: verzonden) naar ${u2Email}, token geverifieerd, geactiveerd met wachtwoord+taal, 2FA ingericht, status=geaccepteerd, sessie actief`);
  }

  // ── STAP 6: Weblogin (nieuwe gebruiker, gewijzigd wachtwoord) ──────────────
  const u1 = new Sessie();
  let u1TotpSecret: string;
  {
    const r1 = await u1.post("/auth/login", { email: u1Email, wachtwoord: W2 });
    const b1 = await json(r1);
    eis(r1.status === 200 && b1.status === "setup_2fa", "stap 6", `login gaf ${r1.status} ${JSON.stringify(b1)}`);
    const r2 = await u1.post("/auth/2fa/setup");
    const b2 = await json(r2);
    eis(r2.status === 200 && typeof b2.secret === "string", "stap 6", `2fa/setup gaf ${r2.status}`);
    u1TotpSecret = b2.secret;
    const code = await versTotp(u1TotpSecret);
    const r3 = await u1.post("/auth/2fa/activeren", { code });
    const b3 = await json(r3);
    eis(r3.status === 200 && b3.id === u1Id, "stap 6", `2fa/activeren gaf ${r3.status} ${JSON.stringify(b3)}`);
    log(`STAP 6 PASS — weblogin: wachtwoordstap 200 (setup_2fa), TOTP ingericht en bevestigd, volledige sessie voor id=${u1Id}`);
  }

  // ── STAP 7: /auth/me ───────────────────────────────────────────────────────
  {
    const r = await u1.get("/auth/me");
    const b = await json(r);
    eis(r.status === 200 && b.id === u1Id && b.email === u1Email, "stap 7", `/auth/me gaf ${r.status} ${JSON.stringify(b)}`);
    eis(typeof b.rol === "string" && typeof b.bevoegdheden === "object", "stap 7", "rol/bevoegdheden ontbreken in /auth/me");
    log(`STAP 7 PASS — /auth/me: 200, id=${b.id}, e-mail klopt, rol=${b.rol}, bevoegdheden-object aanwezig`);
  }

  // ── STAP 8: Rollen laden + autorisatie-effect ──────────────────────────────
  {
    const ra = await admin.get("/auth/me");
    const ba = await json(ra);
    eis(ra.status === 200 && ba.rol === "hoofdbeheerder", "stap 8", `admin /auth/me gaf ${ra.status} rol=${ba.rol}`);
    const ru = await u1.get("/auth/me");
    const bu = await json(ru);
    eis(ru.status === 200 && bu.rol === "gebruiker", "stap 8", `gebruiker /auth/me gaf ${ru.status} rol=${bu.rol}`);
    const rlijstAdmin = await admin.get("/gebruikers");
    eis(rlijstAdmin.status === 200, "stap 8", `admin GET /gebruikers gaf ${rlijstAdmin.status}`);
    const rlijstU1 = await u1.get("/gebruikers");
    eis(rlijstU1.status === 401 || rlijstU1.status === 403, "stap 8", `gebruiker zonder bevoegdheid kreeg ${rlijstU1.status} op GET /gebruikers (verwacht 401/403)`);
    log(`STAP 8 PASS — rollen: admin=hoofdbeheerder (GET /gebruikers → 200), nieuwe gebruiker=gebruiker met lege matrix (GET /gebruikers → ${rlijstU1.status}); rol én bevoegdheden sturen de autorisatie`);
  }

  // ── STAP 9: Uitloggen ──────────────────────────────────────────────────────
  {
    const r = await u1.post("/auth/logout");
    eis(r.status === 204, "stap 9", `logout gaf ${r.status}`);
    const rm = await u1.get("/auth/me");
    eis(rm.status === 401, "stap 9", `/auth/me na logout gaf ${rm.status} (verwacht 401)`);
    log(`STAP 9 PASS — uitloggen: 204, sessie vernietigd, /auth/me daarna 401`);
  }

  // ── STAP 10: Opnieuw inloggen met gewijzigd wachtwoord ─────────────────────
  {
    const rOud = await u1.post("/auth/login", { email: u1Email, wachtwoord: W1 });
    eis(rOud.status === 401, "stap 10", `login met OUD wachtwoord gaf ${rOud.status} (verwacht 401)`);
    const r1 = await u1.post("/auth/login", { email: u1Email, wachtwoord: W2 });
    const b1 = await json(r1);
    eis(r1.status === 200 && b1.status === "verify_2fa", "stap 10", `login gaf ${r1.status} ${JSON.stringify(b1)}`);
    const code = await versTotp(u1TotpSecret);
    const r2 = await u1.post("/auth/2fa/verify", { code });
    const b2 = await json(r2);
    eis(r2.status === 200 && b2.id === u1Id, "stap 10", `2fa/verify gaf ${r2.status} ${JSON.stringify(b2)}`);
    const rm = await u1.get("/auth/me");
    eis(rm.status === 200, "stap 10", `/auth/me na herlogin gaf ${rm.status}`);
    log(`STAP 10 PASS — herlogin: oud wachtwoord → 401, gewijzigd wachtwoord → 200 (verify_2fa), TOTP geverifieerd, /auth/me 200`);
  }

  console.log("\n════════════════════════════════════════════");
  console.log("ALLE 10 STAPPEN GESLAAGD — bewijsoverzicht:");
  for (const regel of bewijs) console.log(`  ${regel}`);
  console.log("════════════════════════════════════════════");
}

// Best-effort opruimen — draait ook wanneer een stap faalt, zodat er geen
// actieve testgebruikers met bekende wachtwoorden achterblijven.
async function ruimOp(): Promise<void> {
  try {
    for (const id of aangemaakteTestIds) {
      await db
        .update(gebruikersTable)
        .set({ actief: false, gearchiveerd: true })
        .where(eq(gebruikersTable.id, id));
    }
    await setupE2eWachtwoordAccounts(); // herstelt doelaccount-wachtwoord en vlaggen
    await archiveerE2eWachtwoordAccounts(); // en daarna weer archiveren: geen actieve testaccounts achterlaten
    console.log(
      `Opruimen: ${aangemaakteTestIds.length} testgebruiker(s) [${aangemaakteTestIds.join(", ")}] gedeactiveerd+gearchiveerd, e2e-accounts hersteld en gearchiveerd`,
    );
  } catch (err) {
    console.error("Waarschuwing: opruimen niet volledig gelukt:", err);
  }
}

main()
  .then(async () => {
    await ruimOp();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(`\n${err instanceof Error ? err.message : String(err)}`);
    await ruimOp();
    process.exit(1);
  });
