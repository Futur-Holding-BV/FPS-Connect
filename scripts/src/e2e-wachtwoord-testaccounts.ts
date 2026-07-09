// Richt vaste e2e-testaccounts in voor de "Beheer wachtwoorden"-feature
// (Gebruikers → Acties: wachtwoord resetten, sessies beëindigen, ontgrendelen).
//
// Twee accounts:
//   - E2E_WW_ADMIN: rol hoofdbeheerder, gebruikt om in te loggen en de Acties
//     uit te voeren.
//   - E2E_WW_TARGET: rol gebruiker, wordt NOOIT zelf ingelogd — puur het
//     lijdend voorwerp van de admin-acties (wachtwoord-reset, sessies
//     beëindigen). Zo raakt de test nooit een echt account van de gebruiker.
//
// Idempotent: bestaande accounts worden bijgewerkt (zelfde e-mail/secret).
// Importeren: gebruikt door scripts/e2e/web-wachtwoord-beheer.spec.ts.
import { pathToFileURL } from "node:url";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { authenticator } from "otplib";

import { db, gebruikersTable } from "@workspace/db";

export const E2E_WW_ADMIN_EMAIL = "e2e-ww-admin@fps.local";
export const E2E_WW_ADMIN_WACHTWOORD = "E2eWwAdmin!2026";
// Vaste secret: de e2e-test gebruikt dezelfde secret om een live TOTP-code te maken.
export const E2E_WW_ADMIN_TOTP_SECRET = "KVZWK4TFOZUXKZLB";

export const E2E_WW_TARGET_EMAIL = "e2e-ww-target@fps.local";
export const E2E_WW_TARGET_NAAM = "E2E Test Doelaccount";
export const E2E_WW_TARGET_WACHTWOORD = "E2eWwTarget!2026";

async function maakOfUpdate(
  email: string,
  waarden: {
    naam: string;
    rol: string;
    wachtwoordHash: string;
    totpSecret: string | null;
    tweeFactorIngeschakeld: boolean;
  },
): Promise<number> {
  const [bestaand] = await db
    .select({ id: gebruikersTable.id })
    .from(gebruikersTable)
    .where(eq(gebruikersTable.email, email));

  const set = {
    naam: waarden.naam,
    rol: waarden.rol,
    wachtwoord: waarden.wachtwoordHash,
    totpSecret: waarden.totpSecret,
    tweeFactorIngeschakeld: waarden.tweeFactorIngeschakeld,
    actief: true,
    gearchiveerd: false,
    // Zorg dat een eerdere testrun geen vergrendeling/geforceerde wijziging
    // laat staan waardoor de volgende run onverwacht faalt.
    misluktePogingen: 0,
    vergrendeldTot: null,
    moetWachtwoordWijzigen: false,
  };

  if (bestaand) {
    await db.update(gebruikersTable).set(set).where(eq(gebruikersTable.id, bestaand.id));
    return bestaand.id;
  }

  const [nieuw] = await db
    .insert(gebruikersTable)
    .values({ email, ...set })
    .returning({ id: gebruikersTable.id });
  return nieuw.id;
}

// Harde guard: deze seeder maakt/reset een actieve hoofdbeheerder met in de
// repo bekende inloggegevens en TOTP-secret. Dat mag UITSLUITEND op een
// dev-database gebeuren — nooit in een productie-/deploy-omgeving.
function weigerBuitenDev(): void {
  if (process.env.REPLIT_DEPLOYMENT) {
    throw new Error(
      "GEWEIGERD: e2e-testaccounts mogen niet in een deployment (productie) worden aangemaakt.",
    );
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "GEWEIGERD: e2e-testaccounts mogen niet met NODE_ENV=production worden aangemaakt.",
    );
  }
}

export async function setupE2eWachtwoordAccounts(): Promise<{ adminId: number; targetId: number }> {
  weigerBuitenDev();
  const adminHash = await bcrypt.hash(E2E_WW_ADMIN_WACHTWOORD, 10);
  const targetHash = await bcrypt.hash(E2E_WW_TARGET_WACHTWOORD, 10);

  const adminId = await maakOfUpdate(E2E_WW_ADMIN_EMAIL, {
    naam: "E2E Test Hoofdbeheerder",
    rol: "hoofdbeheerder",
    wachtwoordHash: adminHash,
    totpSecret: E2E_WW_ADMIN_TOTP_SECRET,
    tweeFactorIngeschakeld: true,
  });

  const targetId = await maakOfUpdate(E2E_WW_TARGET_EMAIL, {
    naam: E2E_WW_TARGET_NAAM,
    rol: "gebruiker",
    wachtwoordHash: targetHash,
    totpSecret: null,
    tweeFactorIngeschakeld: false,
  });

  return { adminId, targetId };
}

// Wacht tot het huidige TOTP-venster voldoende resttijd heeft en geeft dan een
// verse code terug (voorkomt dat een code verloopt tijdens een trage load).
export async function genereerVersAdminTotp(minResterendeSec = 20): Promise<string> {
  const resterend = authenticator.timeRemaining();
  if (resterend < minResterendeSec) {
    await new Promise((r) => setTimeout(r, (resterend + 1) * 1000));
  }
  return authenticator.generate(E2E_WW_ADMIN_TOTP_SECRET);
}

// Wacht tot het volgende 30s-venster begint. Gebruikt tussen mislukte
// loginpogingen zodat een nieuwe (andere) code wordt gegenereerd.
export async function wachtOpNieuwTotpVenster(): Promise<void> {
  await new Promise((r) => setTimeout(r, (authenticator.timeRemaining() + 1) * 1000));
}

async function main() {
  const { adminId, targetId } = await setupE2eWachtwoordAccounts();
  console.log(`Admin-account gereed: ${E2E_WW_ADMIN_EMAIL} (id ${adminId})`);
  console.log(`Doel-account gereed:  ${E2E_WW_TARGET_EMAIL} (id ${targetId})`);
  console.log(`TOTP nu: ${authenticator.generate(E2E_WW_ADMIN_TOTP_SECRET)}`);
}

const isDirect =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirect) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
