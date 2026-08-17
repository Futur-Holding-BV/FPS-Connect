// Bewijs: offboarden sluit de oud-medewerker direct uit (web + mobiel) en
// personeelszaken kan de gegevens daarna dichtzetten (AVG-afscherming).
//
// 1. Offboard deactiveert het account, vernietigt bestaande websessies en
//    maakt bestaande mobiele bearer-tokens ongeldig; opnieuw inloggen kan niet.
// 2. POST /medewerkers/:id/afschermen zet de gegevens dicht: NAW/contact komt
//    niet meer terug uit de API, dubbel afschermen geeft 409, actieve
//    medewerkers kunnen niet worden afgeschermd.
//
// Draaien: pnpm --filter @workspace/scripts exec tsx src/bewijs-offboard-uitsluiting.ts
import { authenticator } from "otplib";
import { eq } from "drizzle-orm";
import { db, medewerkersTable, gebruikersTable } from "@workspace/db";
import {
  setupE2eWachtwoordAccounts,
  E2E_WW_ADMIN_EMAIL,
  E2E_WW_ADMIN_WACHTWOORD,
  E2E_WW_ADMIN_TOTP_SECRET,
  E2E_WW_TARGET_EMAIL,
  E2E_WW_TARGET_WACHTWOORD,
} from "./e2e-wachtwoord-testaccounts";

const BASE = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
let geslaagd = 0;
let mislukt = 0;

function check(naam: string, ok: boolean, detail?: string) {
  if (ok) { geslaagd++; console.log(`  ✓ ${naam}`); }
  else { mislukt++; console.log(`  ✗ ${naam}${detail ? ` — ${detail}` : ""}`); }
}

function maakSessie() {
  let cookie = "";
  return async (pad: string, init: RequestInit = {}): Promise<Response> => {
    const resp = await fetch(`${BASE}${pad}`, {
      ...init,
      headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), cookie, ...(init.headers ?? {}) },
    });
    const setCookie = resp.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    return resp;
  };
}

async function main() {
  const { targetId } = await setupE2eWachtwoordAccounts();
  // Doelaccount krijgt voor deze test TOTP (mobiele login en volledige
  // websessie vereisen 2FA); vaste secret alleen op de dev-database.
  const DOEL_TOTP = "JBSWY3DPEHPK3PXP";
  await db.update(gebruikersTable).set({ totpSecret: DOEL_TOTP, tweeFactorIngeschakeld: true }).where(eq(gebruikersTable.id, targetId));

  // Admin-sessie (met 2FA)
  const admin = maakSessie();
  await admin("/auth/login", { method: "POST", body: JSON.stringify({ email: E2E_WW_ADMIN_EMAIL, wachtwoord: E2E_WW_ADMIN_WACHTWOORD }) });
  const r2fa = await admin("/auth/2fa/verify", { method: "POST", body: JSON.stringify({ code: authenticator.generate(E2E_WW_ADMIN_TOTP_SECRET) }) });
  if (!r2fa.ok) throw new Error(`admin-login faalde: ${r2fa.status}`);

  // Doelaccount: websessie + mobiel bearer-token vóór het offboarden
  const doel = maakSessie();
  const rLogin = await doel("/auth/login", { method: "POST", body: JSON.stringify({ email: E2E_WW_TARGET_EMAIL, wachtwoord: E2E_WW_TARGET_WACHTWOORD }) });
  if (!rLogin.ok) throw new Error(`doel-login faalde: ${rLogin.status}`);
  const rDoel2fa = await doel("/auth/2fa/verify", { method: "POST", body: JSON.stringify({ code: authenticator.generate(DOEL_TOTP) }) });
  if (!rDoel2fa.ok) throw new Error(`doel-2fa faalde: ${rDoel2fa.status}`);
  const rMob = await fetch(`${BASE}/auth/mobile/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: E2E_WW_TARGET_EMAIL, wachtwoord: E2E_WW_TARGET_WACHTWOORD, code: authenticator.generate(DOEL_TOTP) }),
  });
  const bearer = rMob.ok ? String(((await rMob.json()) as any).token ?? "") : "";

  console.log("0. Uitgangssituatie (vóór offboard)");
  check("doel heeft werkende websessie", (await doel("/auth/me")).status === 200);
  // IDOR-check: een niet-beheerder kan een gebruikers-ID (zoals de
  // duplicate-check die geredigeerd teruggeeft) niet omzetten naar e-mail.
  const adminMe = (await (await admin("/auth/me")).json()) as any;
  const adminId = Number(adminMe?.id ?? adminMe?.gebruiker?.id ?? 0);
  if (adminId) {
    const rIdor = await doel(`/gebruikers/${adminId}`);
    const idor = rIdor.status === 200 ? ((await rIdor.json()) as any) : null;
    check("IDOR: niet-beheerder ziet geen e-mail/telefoon via /gebruikers/:id", idor != null && (idor.email ?? "") === "" && (idor.telefoon ?? null) === null, `status ${rIdor.status}`);
  } else {
    check("IDOR: admin-id bepaald voor IDOR-check", false, "geen id in /auth/me");
  }
  if (bearer) {
    const rB = await fetch(`${BASE}/auth/me`, { headers: { Authorization: `Bearer ${bearer}` } });
    check("doel heeft werkend mobiel bearer-token", rB.status === 200, String(rB.status));
  } else {
    check("doel heeft werkend mobiel bearer-token", false, `mobile login gaf ${rMob.status}`);
  }

  // Medewerkerprofiel voor het doelaccount aanmaken
  const [med] = await db.insert(medewerkersTable).values({
    naam: "E2E Offboard Testmedewerker",
    gebruikerId: targetId,
    werkmaatschappij: "FPS Brandpreventie",
    adres: "Teststraat 1", postcode: "1234 AB", woonplaats: "Testdorp",
    telefoon: "0612345678", geboortedatum: "1990-01-01",
  }).returning({ id: medewerkersTable.id });

  try {
    console.log("\n1. Offboarden sluit web én mobiel direct uit");
    const rOff = await admin(`/medewerkers/${med.id}/offboard`, { method: "POST", body: JSON.stringify({ uit_dienst_per: "2026-08-01", reden: "e2e-bewijs" }) });
    check("offboard = 200", rOff.status === 200, String(rOff.status));
    check("bestaande websessie doelaccount is vernietigd (401)", (await doel("/auth/me")).status === 401);
    if (bearer) {
      const rB = await fetch(`${BASE}/auth/me`, { headers: { Authorization: `Bearer ${bearer}` } });
      check("bestaand mobiel bearer-token is ongeldig (401)", rB.status === 401, String(rB.status));
    }
    const rWeb = await maakSessie()("/auth/login", { method: "POST", body: JSON.stringify({ email: E2E_WW_TARGET_EMAIL, wachtwoord: E2E_WW_TARGET_WACHTWOORD }) });
    check("opnieuw web-inloggen geweigerd (401)", rWeb.status === 401, String(rWeb.status));
    const rMob2 = await fetch(`${BASE}/auth/mobile/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: E2E_WW_TARGET_EMAIL, wachtwoord: E2E_WW_TARGET_WACHTWOORD }),
    });
    check("opnieuw mobiel inloggen geweigerd (401)", rMob2.status === 401, String(rMob2.status));

    console.log("\n2. Gegevens blijven bewaard tot personeelszaken dichtzet");
    const lijst1 = (await (await admin("/medewerkers")).json()) as any[];
    const voorAf = lijst1.find((m) => m.id === med.id);
    check("NAW nog zichtbaar vóór afscherming", voorAf?.adres === "Teststraat 1" && voorAf?.telefoon === "0612345678");

    const [actieve] = await db.insert(medewerkersTable).values({ naam: "E2E Actief Testmedewerker", werkmaatschappij: "FPS Brandpreventie" }).returning({ id: medewerkersTable.id });
    try {
      const rActief = await admin(`/medewerkers/${actieve.id}/afschermen`, { method: "POST" });
      check("actieve medewerker afschermen geweigerd (409)", rActief.status === 409, String(rActief.status));
    } finally {
      await db.delete(medewerkersTable).where(eq(medewerkersTable.id, actieve.id));
    }

    const rAf = await admin(`/medewerkers/${med.id}/afschermen`, { method: "POST" });
    check("afschermen oud-medewerker = 200", rAf.status === 200, String(rAf.status));
    const af = (await rAf.json()) as any;
    check("respons: NAW/contact leeg, naam blijft", af.adres === null && af.telefoon === null && af.geboortedatum === null && af.naam === "E2E Offboard Testmedewerker" && af.afgeschermd_op != null);
    const lijst2 = (await (await admin("/medewerkers")).json()) as any[];
    const naAf = lijst2.find((m) => m.id === med.id);
    check("lijst: NAW/contact niet meer opvraagbaar", naAf?.adres === null && naAf?.telefoon === null && naAf?.woonplaats === null);
    const [dbRij] = await db.select().from(medewerkersTable).where(eq(medewerkersTable.id, med.id));
    check("data blijft bewaard in de database", dbRij?.adres === "Teststraat 1" && dbRij?.telefoon === "0612345678");
    check("dubbel afschermen geeft 409", (await admin(`/medewerkers/${med.id}/afschermen`, { method: "POST" })).status === 409);

    // Afgeschermde medewerker mag ook via duplicate-check onvindbaar zijn
    const rDup = await admin("/medewerkers/duplicate-check", { method: "POST", body: JSON.stringify({ naam: "E2E Offboard Testmedewerker", email: E2E_WW_TARGET_EMAIL, geboortedatum: "1990-01-01" }) });
    const dup = (await rDup.json()) as { mogelijke_duplicaten: Array<{ id: number; type: string }> };
    check("duplicate-check vindt afgeschermde medewerker niet", rDup.status === 200 && !dup.mogelijke_duplicaten.some((d) => d.id === med.id && d.type !== "gebruiker_account"));

    // Het gekoppelde (gedeactiveerde) gebruikersaccount mag geen naam/e-mail
    // meer prijsgeven; alleen een geredigeerd "bestaand account"-resultaat bij
    // exacte e-mailmatch (duplicaat-preventie blijft werken).
    const rDup2 = await admin("/medewerkers/duplicate-check", { method: "POST", body: JSON.stringify({ email: E2E_WW_TARGET_EMAIL }) });
    const dup2 = (await rDup2.json()) as { mogelijke_duplicaten: Array<{ id: number; naam: string; email: string | null; type: string }> };
    const accHit = dup2.mogelijke_duplicaten.find((d) => d.id === targetId && d.type === "gebruiker_account");
    check("gekoppeld account: e-mail geredigeerd, conflict blijft zichtbaar", rDup2.status === 200 && accHit != null && accHit.email === null && !accHit.naam.includes("Doelaccount"));
    const rDup3 = await admin("/medewerkers/duplicate-check", { method: "POST", body: JSON.stringify({ email: "e2e-ww-target" }) });
    const dup3 = (await rDup3.json()) as { mogelijke_duplicaten: Array<{ id: number; type: string }> };
    check("deelstring-e-mail levert afgeschermd account niet op", rDup3.status === 200 && !dup3.mogelijke_duplicaten.some((d) => d.id === targetId && d.type === "gebruiker_account"));

    console.log("\n3. Bredere lek-audit: selectors/kalender lekken afgeschermde gegevens niet");
    // Randgeval: afschermen kan ook bij actief=true zolang uit_dienst_per is
    // verstreken — juist dan mochten planning-selector (e-mail/telefoon) en
    // kalender-verjaardag (geboortedatum) vroeger nog lekken.
    const nu = new Date();
    const mmdd = `${String(nu.getMonth() + 1).padStart(2, "0")}-${String(nu.getDate()).padStart(2, "0")}`;
    // Gekoppeld aan het (nog actieve, ingelogde) admin-account: bewijst dat ook
    // self-scoped routes (/mijn/privacy-gegevens) afgeschermde velden niet
    // teruggeven — afschermen kan immers zonder account-deactivering.
    // Bestaand medewerkerprofiel van de admin tijdelijk ontkoppelen zodat de
    // self-scoped route deterministisch het testprofiel teruggeeft (herstel in finally).
    let herstelAdminMedId: number | null = null;
    const [bestaandeAdminMed] = await db.select({ id: medewerkersTable.id }).from(medewerkersTable).where(eq(medewerkersTable.gebruikerId, adminId));
    if (bestaandeAdminMed) {
      await db.update(medewerkersTable).set({ gebruikerId: null }).where(eq(medewerkersTable.id, bestaandeAdminMed.id));
      herstelAdminMedId = bestaandeAdminMed.id;
    }
    const [af2] = await db.insert(medewerkersTable).values({
      naam: "E2E Afgeschermd Selector",
      werkmaatschappij: "FPS Brandpreventie",
      actief: true,
      uitDienstPer: "2026-01-01",
      email: "e2e-afgeschermd-selector@example.com",
      telefoon: "0687654321",
      geboortedatum: `1990-${mmdd}`,
      verjaardagZichtbaar: true,
      gebruikerId: adminId,
    }).returning({ id: medewerkersTable.id });
    try {
      check("afschermen (actief=true, uit dienst) = 200", (await admin(`/medewerkers/${af2.id}/afschermen`, { method: "POST" })).status === 200);
      const rSel = await admin("/modules/planning/medewerkers");
      const sel = rSel.status === 200 ? ((await rSel.json()) as any[]) : [];
      check("planning-selector bevat afgeschermde medewerker niet", rSel.status === 200 && !sel.some((m) => m.id === af2.id), `status ${rSel.status}`);
      const rKal = await admin(`/kalender?jaar=${nu.getFullYear()}`);
      const kal = rKal.status === 200 ? ((await rKal.json()) as any) : null;
      const kalItems: any[] = Array.isArray(kal) ? kal : (kal?.items ?? []);
      check("kalender toont geen verjaardag van afgeschermde medewerker", rKal.status === 200 && !kalItems.some((i) => i.soort === "verjaardag" && String(i.titel ?? "").includes("E2E Afgeschermd Selector")), `status ${rKal.status}`);
      const rPriv = await admin("/mijn/privacy-gegevens");
      const priv = rPriv.status === 200 ? ((await rPriv.json()) as any) : null;
      const eigen = priv?.medewerker;
      check(
        "self-scoped /mijn/privacy-gegevens geeft afgeschermde velden niet terug (actief account)",
        rPriv.status === 200 && eigen?.id === af2.id && eigen.email === null && eigen.telefoon === null && eigen.mobiel === null && priv?.email == null,
        `status ${rPriv.status}, med=${eigen?.id}, email=${eigen?.email}, accountEmail=${priv?.email}`,
      );
    } finally {
      await db.delete(medewerkersTable).where(eq(medewerkersTable.id, af2.id));
      if (herstelAdminMedId !== null) {
        await db.update(medewerkersTable).set({ gebruikerId: adminId }).where(eq(medewerkersTable.id, herstelAdminMedId));
      }
    }
  } finally {
    await db.delete(medewerkersTable).where(eq(medewerkersTable.id, med.id));
    await db.update(gebruikersTable).set({ actief: true }).where(eq(gebruikersTable.id, targetId));
  }

  console.log(`\nResultaat: ${geslaagd} geslaagd, ${mislukt} mislukt`);
  if (mislukt > 0) process.exit(1);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
