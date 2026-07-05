// Richt een vast e2e-testaccount in voor de FPS Monteur-app en genereert een
// geldige TOTP-code. Bedoeld om de geautomatiseerde controle van het radiaal
// startmenu (login + waaier + doorlinken) reproduceerbaar te draaien.
//
// Idempotent: bestaand account wordt bijgewerkt (zelfde e-mail/secret).
// CLI draaien: pnpm --filter @workspace/scripts run e2e-monteur-testaccount
// Importeren: setupE2eAccount() + genereerVersTotp() worden hergebruikt door de
// Playwright-spec (scripts/e2e/startmenu.spec.ts).
//
// Het account krijgt verplichte tweestapsverificatie (zoals echte accounts) met
// een vaste TOTP-secret zodat de e2e-test een geldige code kan genereren. De
// bevoegdheden staan op het hoogste niveau voor alle modules zodat elke
// menukeuze (Gebouwen, Personeel, Fabrikanten) ook echt doorlinkt.
import { pathToFileURL } from "node:url";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { authenticator } from "otplib";

import { db, gebruikersTable } from "@workspace/db";
import { MODULE_IDS } from "@workspace/permissies";

export const E2E_EMAIL = "e2e-menu@fps.local";
export const E2E_WACHTWOORD = "E2eMenuTest!2026";
// Vaste secret: de e2e-test gebruikt dezelfde secret om een live code te maken.
export const E2E_TOTP_SECRET = "PAOSGYZWOEMU2HDD";

// Maakt of werkt het vaste e2e-account bij. Idempotent en herbruikbaar vanuit
// een testrun (Playwright beforeAll) zonder dat het proces wordt afgesloten.
export async function setupE2eAccount(): Promise<number> {
  const hash = await bcrypt.hash(E2E_WACHTWOORD, 10);
  const bevoegdheden = Object.fromEntries(MODULE_IDS.map((m) => [m, 4]));

  const [bestaand] = await db
    .select({ id: gebruikersTable.id })
    .from(gebruikersTable)
    .where(eq(gebruikersTable.email, E2E_EMAIL));

  if (bestaand) {
    await db
      .update(gebruikersTable)
      .set({
        naam: "E2E Test Monteur",
        rol: "gebruiker",
        wachtwoord: hash,
        totpSecret: E2E_TOTP_SECRET,
        tweeFactorIngeschakeld: true,
        actief: true,
        bevoegdheden,
      })
      .where(eq(gebruikersTable.id, bestaand.id));
    return bestaand.id;
  }

  const [nieuw] = await db
    .insert(gebruikersTable)
    .values({
      naam: "E2E Test Monteur",
      email: E2E_EMAIL,
      rol: "gebruiker",
      wachtwoord: hash,
      totpSecret: E2E_TOTP_SECRET,
      tweeFactorIngeschakeld: true,
      actief: true,
      bevoegdheden,
    })
    .returning({ id: gebruikersTable.id });
  return nieuw.id;
}

// Wacht tot het huidige TOTP-venster voldoende resttijd heeft en geeft dan een
// verse code terug. Voorkomt dat een code verloopt tijdens een trage koude load.
// minResterendeSec=20: bij een cold-start Expo-load is 8 sec te krap; met 20 sec
// buffer is de code zeker nog geldig als het inlogverzoek de server bereikt.
export async function genereerVersTotp(minResterendeSec = 20): Promise<string> {
  const resterend = authenticator.timeRemaining();
  if (resterend < minResterendeSec) {
    await new Promise((r) => setTimeout(r, (resterend + 1) * 1000));
  }
  return authenticator.generate(E2E_TOTP_SECRET);
}

// Wacht tot het volgende 30s-venster begint. Gebruikt tussen mislukte
// loginpogingen zodat een nieuwe (andere) code wordt gegenereerd.
export async function wachtOpNieuwTotpVenster(): Promise<void> {
  await new Promise((r) => setTimeout(r, (authenticator.timeRemaining() + 1) * 1000));
}

async function main() {
  const id = await setupE2eAccount();
  console.log(`Account gereed: ${E2E_EMAIL} (id ${id})`);
  console.log("");
  console.log("Inloggegevens voor de e2e-test:");
  console.log(`  E-mail:     ${E2E_EMAIL}`);
  console.log(`  Wachtwoord: ${E2E_WACHTWOORD}`);
  console.log(`  TOTP nu:    ${authenticator.generate(E2E_TOTP_SECRET)}`);
}

// Alleen als CLI-script uitvoeren wanneer dit bestand direct wordt aangeroepen,
// zodat importeren (door de Playwright-spec) geen account aanmaakt of het proces
// afsluit.
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
