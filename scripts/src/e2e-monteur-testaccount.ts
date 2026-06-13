// Richt een vast e2e-testaccount in voor de FPS Monteur-app en print een
// geldige TOTP-code. Bedoeld om de geautomatiseerde controle van het radiaal
// startmenu (login + waaier + doorlinken) reproduceerbaar te draaien.
//
// Idempotent: bestaand account wordt bijgewerkt (zelfde e-mail/secret).
// Draaien: pnpm --filter @workspace/scripts run e2e-monteur-testaccount
//
// Het account krijgt verplichte tweestapsverificatie (zoals echte accounts) met
// een vaste TOTP-secret zodat de e2e-test een geldige code kan genereren. De
// bevoegdheden staan op het hoogste niveau voor alle modules zodat elke
// menukeuze (Gebouwen, Personeel, Fabrikanten) ook echt doorlinkt.
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { authenticator } from "otplib";

import { db, gebruikersTable } from "@workspace/db";
import { MODULE_IDS } from "@workspace/permissies";

export const E2E_EMAIL = "e2e-menu@fps.local";
export const E2E_WACHTWOORD = "E2eMenuTest!2026";
// Vaste secret: de e2e-test gebruikt dezelfde secret om een live code te maken.
export const E2E_TOTP_SECRET = "PAOSGYZWOEMU2HDD";

async function main() {
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
    console.log(`Bijgewerkt: ${E2E_EMAIL} (id ${bestaand.id})`);
  } else {
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
    console.log(`Aangemaakt: ${E2E_EMAIL} (id ${nieuw.id})`);
  }

  console.log("");
  console.log("Inloggegevens voor de e2e-test:");
  console.log(`  E-mail:     ${E2E_EMAIL}`);
  console.log(`  Wachtwoord: ${E2E_WACHTWOORD}`);
  console.log(`  TOTP nu:    ${authenticator.generate(E2E_TOTP_SECRET)}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
