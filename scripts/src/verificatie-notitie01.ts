// NOTITIE_01 — bewijsscript. Test via HTTP (nooit api-server-source importeren)
// + @workspace/db voor opzet/backdating. Draaien: pnpm --filter @workspace/scripts run tsx src/verificatie-notitie01.ts
import { authenticator } from "otplib";
import { eq, and, like } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, gebruikersTable, gebouwenTable, gebouwNotitiesTable, gebouwToewijzingenTable, gebouwPublicatiesTable } from "@workspace/db";
import {
  setupE2eWebAccount, setupE2eWebAdminAccount,
  E2E_WEB_EMAIL, E2E_WEB_WACHTWOORD, E2E_WEB_TOTP_SECRET,
  E2E_WEB_ADMIN_EMAIL, E2E_WEB_ADMIN_WACHTWOORD, E2E_WEB_ADMIN_TOTP_SECRET,
} from "./e2e-monteur-testaccount";

// Secure-sessiecookies vereisen https; standaard dus via het dev-domein.
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

async function main() {
  console.log("— NOTITIE_01 bewijsscript —");

  // Opzet: vaste e2e-accounts (idempotent), initialen leegmaken voor bewijs 3
  await setupE2eWebAccount();
  await setupE2eWebAdminAccount();
  await db.update(gebruikersTable).set({ initialen: null })
    .where(eq(gebruikersTable.email, E2E_WEB_EMAIL));

  const [gebouw] = await db.select({ id: gebouwenTable.id, naam: gebouwenTable.naam })
    .from(gebouwenTable).where(eq(gebouwenTable.gearchiveerd, false)).limit(1);
  if (!gebouw) throw new Error("Geen gebouw in dev-DB");
  console.log(`Testgebouw: #${gebouw.id} ${gebouw.naam}`);

  const web = await login(E2E_WEB_EMAIL, E2E_WEB_WACHTWOORD, E2E_WEB_TOTP_SECRET);
  const admin = await login(E2E_WEB_ADMIN_EMAIL, E2E_WEB_ADMIN_WACHTWOORD, E2E_WEB_ADMIN_TOTP_SECRET);

  // Bewijs 1+2: twee gebruikers, twee losse regels, niets overschreven
  const n1 = await api(web, "POST", `/gebouwen/${gebouw.id}/notities`, {
    tekst: "Gebeld met de beheerder over de doorvoering op verdieping 2.",
    type: "telefoon", beller_naam: "Dhr. Jansen",
  });
  check("gebruiker A maakt aantekening (201)", n1.status === 201, JSON.stringify(n1.json));
  const n2 = await api(admin, "POST", `/gebouwen/${gebouw.id}/notities`, {
    tekst: "Locatiebezoek gepland voor volgende week dinsdag.", type: "bezoek",
  });
  check("gebruiker B maakt aantekening (201)", n2.status === 201, JSON.stringify(n2.json));

  const lijst1 = await api(web, "GET", `/gebouwen/${gebouw.id}/notities`);
  const regels = lijst1.json as Array<Record<string, unknown>>;
  const id1 = (n1.json as { id: number }).id;
  const id2 = (n2.json as { id: number }).id;
  const r1 = regels.find((r) => r.id === id1);
  const r2 = regels.find((r) => r.id === id2);
  check("beide aantekeningen staan in de lijst", !!r1 && !!r2);
  check("nieuwste staat bovenaan", regels[0]?.id === id2, `bovenaan: ${regels[0]?.id}`);
  check("telefoonnotitie toont beller", r1?.beller_naam === "Dhr. Jansen");
  console.log(`  regel A: [${r1?.initialen}] ${r1?.gebruiker_naam} — ${r1?.aangemaakt_op}`);
  console.log(`  regel B: [${r2?.initialen}] ${r2?.gebruiker_naam} — ${r2?.aangemaakt_op}`);

  // Bewijs 3: afgeleide initialen → eigen initialen na instellen
  const afgeleid = r1?.initialen as string;
  check("initialen zonder instelling zijn afgeleid (niet leeg)", !!afgeleid && afgeleid.length >= 2, afgeleid);
  const zet = await api(web, "PATCH", `/mijn/initialen`, { initialen: "XYZ" });
  check("initialen instellen lukt", zet.status === 200, JSON.stringify(zet.json));
  const lijst2 = await api(web, "GET", `/gebouwen/${gebouw.id}/notities`);
  const r1b = (lijst2.json as Array<Record<string, unknown>>).find((r) => r.id === id1);
  check("eigen initialen worden daarna getoond", r1b?.initialen === "XYZ", String(r1b?.initialen));

  // Bewijs 4: corrigeren binnen 15 min door schrijver; niet door ander; niet na 15 min
  const w1 = await api(web, "PATCH", `/gebouwen/notities/${id1}`, { tekst: "Gebeld met de beheerder over de doorvoering op verdieping 2 (correctie: verdieping 3)." });
  check("schrijver corrigeert binnen 15 min (200)", w1.status === 200, JSON.stringify(w1.json));
  const w2 = await api(admin, "PATCH", `/gebouwen/notities/${id1}`, { tekst: "hack" });
  check("een ander mag niet corrigeren (403)", w2.status === 403, `status ${w2.status}`);
  await db.update(gebouwNotitiesTable)
    .set({ aangemaaktOp: new Date(Date.now() - 16 * 60 * 1000) })
    .where(eq(gebouwNotitiesTable.id, id1));
  const w3 = await api(web, "PATCH", `/gebouwen/notities/${id1}`, { tekst: "te laat" });
  check("na 15 minuten mag ook de schrijver niet meer (403)", w3.status === 403, `status ${w3.status}`);

  // Doorhalen: alleen niveau 4, regel blijft zichtbaar
  const d1 = await api(admin, "DELETE", `/gebouwen/notities/${id2}`);
  const dj = d1.json as Record<string, unknown>;
  check("niveau 4 haalt door (200)", d1.status === 200);
  check("doorgehaalde regel blijft zichtbaar met wie/wanneer", dj?.verwijderd === true && !!dj?.verwijderd_door_naam && !!dj?.verwijderd_op);

  // Bewijs 5: klantweg bevat géén notities
  const KLANT_EMAIL = "e2e-klant-notitie@fps.local";
  const KLANT_TOTP = "MFRGGZDFMZTWQ2LK";
  const wachtwoordHash = await bcrypt.hash("E2eKlant!2026", 10);
  const bestaandeKlant = await db.select().from(gebruikersTable).where(eq(gebruikersTable.email, KLANT_EMAIL));
  if (bestaandeKlant.length === 0) {
    await db.insert(gebruikersTable).values({
      naam: "E2E Klant Notitie", email: KLANT_EMAIL, rol: "klant",
      wachtwoord: wachtwoordHash, actief: true,
      tweeFactorIngeschakeld: true, totpSecret: KLANT_TOTP,
    });
  } else {
    await db.update(gebruikersTable).set({ wachtwoord: wachtwoordHash, actief: true, gearchiveerd: false, tweeFactorIngeschakeld: true, totpSecret: KLANT_TOTP })
      .where(eq(gebruikersTable.email, KLANT_EMAIL));
  }
  // klant toewijzen + gebouw publiceren zodat de gebouwdetailroute via de
  // klant-allowlist zelf wél opengaat (klant is altijd "beperkt")
  const klantId = (await db.select({ id: gebruikersTable.id }).from(gebruikersTable).where(eq(gebruikersTable.email, KLANT_EMAIL)))[0]!.id;
  await db.delete(gebouwToewijzingenTable).where(eq(gebouwToewijzingenTable.gebruikerId, klantId));
  await db.insert(gebouwToewijzingenTable).values({ gebouwId: gebouw.id, gebruikerId: klantId });
  const bestaandePub = await db.select({ id: gebouwPublicatiesTable.id }).from(gebouwPublicatiesTable)
    .where(eq(gebouwPublicatiesTable.gebouwId, gebouw.id));
  let pubToegevoegd = false;
  if (bestaandePub.length === 0) {
    await db.insert(gebouwPublicatiesTable).values({ gebouwId: gebouw.id, status: "gepubliceerd" });
    pubToegevoegd = true;
  } else {
    await db.update(gebouwPublicatiesTable).set({ status: "gepubliceerd" }).where(eq(gebouwPublicatiesTable.gebouwId, gebouw.id));
  }

  const klant = await login(KLANT_EMAIL, "E2eKlant!2026", KLANT_TOTP);
  const kg = await api(klant, "GET", `/gebouwen/${gebouw.id}`);
  const kgTekst = JSON.stringify(kg.json ?? {});
  check("klant kan gebouwdetail opvragen (allowlist)", kg.status === 200, `status ${kg.status}`);
  check("gebouwantwoord via klantweg bevat geen notities", !kgTekst.includes("notitie") && !kgTekst.includes("Gebeld met"));
  const kn = await api(klant, "GET", `/gebouwen/${gebouw.id}/notities`);
  check("notitieroute is dicht voor klant (403)", kn.status === 403, `status ${kn.status}`);
  console.log(`  klant-gebouwantwoord (eerste 200 tekens): ${kgTekst.slice(0, 200)}`);

  // Opruimen: klant loskoppelen, testnotities verwijderen
  await db.delete(gebouwToewijzingenTable).where(eq(gebouwToewijzingenTable.gebruikerId, klantId));
  if (pubToegevoegd) await db.delete(gebouwPublicatiesTable).where(eq(gebouwPublicatiesTable.gebouwId, gebouw.id));
  await db.delete(gebouwNotitiesTable).where(and(eq(gebouwNotitiesTable.gebouwId, gebouw.id), like(gebouwNotitiesTable.tekst, "%doorvoering op verdieping%")));
  await db.delete(gebouwNotitiesTable).where(and(eq(gebouwNotitiesTable.gebouwId, gebouw.id), like(gebouwNotitiesTable.tekst, "%Locatiebezoek gepland%")));
  await db.update(gebruikersTable).set({ initialen: null }).where(eq(gebruikersTable.email, E2E_WEB_EMAIL));
  await db.update(gebruikersTable).set({ actief: false, gearchiveerd: true }).where(eq(gebruikersTable.email, KLANT_EMAIL));

  console.log(`\nResultaat: ${geslaagd} geslaagd, ${gefaald} gefaald`);
  process.exit(gefaald === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
