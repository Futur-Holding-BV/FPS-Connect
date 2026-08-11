// Bewijs voor taak 895: onboarding-context geeft account_profiel_id/naam terug
// wanneer het gebruikersaccount al een gekoppeld rechtenprofiel heeft.
//
// Aanpak: log in als e2e-web-admin (TOTP) via de dev-API, maak een tijdelijke
// wegwerpgebruiker mét herkomst_profiel_id, haal de onboarding-context op en
// controleer de nieuwe velden. Ruimt de wegwerpgebruiker en het admin-account
// in finally weer op.
import { authenticator } from "otplib";
import { eq } from "drizzle-orm";

import { db, gebruikersTable, profielenTable } from "@workspace/db";

import {
  setupE2eWebAdminAccount,
  E2E_WEB_ADMIN_EMAIL,
  E2E_WEB_ADMIN_WACHTWOORD,
  E2E_WEB_ADMIN_TOTP_SECRET,
  archiveerE2eWebAdminAccount,
} from "./e2e-monteur-testaccount";

const BASIS = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
const TEST_EMAIL = "bewijs-895-doel@fps.local";

async function main(): Promise<void> {
  await setupE2eWebAdminAccount();

  // Doelgebruiker met gekoppeld profiel (herkomst_profiel_id).
  const [profiel] = await db.select({ id: profielenTable.id, naam: profielenTable.naam }).from(profielenTable).limit(1);
  if (!profiel) throw new Error("Geen profielen in DB");
  await db.delete(gebruikersTable).where(eq(gebruikersTable.email, TEST_EMAIL));
  const [doel] = await db
    .insert(gebruikersTable)
    .values({
      naam: "Bewijs 895 Doel",
      email: TEST_EMAIL,
      wachtwoord: "x",
      rol: "gebruiker",
      actief: true,
      herkomstProfielId: profiel.id,
    })
    .returning({ id: gebruikersTable.id });

  try {
    // Login met TOTP.
    let cookie = "";
    const pak = (r: Response) => {
      const c = r.headers.getSetCookie?.() ?? [];
      if (c.length) cookie = c.map((s) => s.split(";")[0]).join("; ");
    };
    const login = await fetch(`${BASIS}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: E2E_WEB_ADMIN_EMAIL, wachtwoord: E2E_WEB_ADMIN_WACHTWOORD }),
    });
    pak(login);
    const loginBody = (await login.json()) as Record<string, unknown>;
    console.log("login:", login.status, JSON.stringify(loginBody).slice(0, 120));
    if (loginBody.twee_factor_vereist || loginBody.tfa_vereist || login.status === 200) {
      const code = authenticator.generate(E2E_WEB_ADMIN_TOTP_SECRET);
      const tfa = await fetch(`${BASIS}/auth/2fa/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie },
        body: JSON.stringify({ code }),
      });
      pak(tfa);
      console.log("2fa:", tfa.status);
    }

    const ctx = await fetch(`${BASIS}/medewerkers/onboarding-context/${doel.id}`, {
      headers: { cookie },
    });
    const body = (await ctx.json()) as Record<string, unknown>;
    console.log("context:", ctx.status, JSON.stringify(body));
    if (ctx.status !== 200) throw new Error("context-status niet 200");
    if (body.account_profiel_id !== profiel.id || body.account_profiel_naam !== profiel.naam) {
      throw new Error(`FOUT: verwacht profiel ${profiel.id}/${profiel.naam}`);
    }
    console.log("BEWIJS OK: account_profiel_id en account_profiel_naam correct teruggegeven.");
  } finally {
    await db.delete(gebruikersTable).where(eq(gebruikersTable.email, TEST_EMAIL));
    await archiveerE2eWebAdminAccount();
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
