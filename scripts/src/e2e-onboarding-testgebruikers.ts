// Wegwerp-gebruikersaccounts voor onboarding-tests.
//
// Sinds de consolidatie van de medewerker-onboarding vereist POST /medewerkers
// een bestaand gebruikersaccount (gebruiker_id verplicht; onboarding maakt
// nooit accounts aan). Testscripts die direct een medewerker aanmaken moeten
// daarom eerst een wegwerp-gebruiker aanmaken en dat id meesturen.
//
// Deze accounts kunnen nooit inloggen (ongeldige wachtwoordhash, geen TOTP) en
// worden na de testrun op e-maildomein opgeruimd.
import bcrypt from "bcryptjs";
import { like } from "drizzle-orm";

import { db, gebruikersTable } from "@workspace/db";

// Vast e-maildomein zodat cleanup alle wegwerp-accounts kan vinden.
export const E2E_ONBOARDING_GEBRUIKER_DOMEIN = "e2e-onboarding-gebruiker.fps.local";

function weigerBuitenDev(): void {
  if (process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === "production") {
    throw new Error("GEWEIGERD: e2e-testgebruikers mogen alleen op een dev-database worden aangemaakt.");
  }
}

// Maakt een wegwerp-gebruikersaccount aan en geeft het id terug.
// Elke aanroep maakt een uniek account (de unieke koppeling medewerker ↔
// gebruiker staat maximaal één medewerkerprofiel per account toe).
export async function maakWegwerpOnboardingGebruiker(labelPrefix: string): Promise<{ id: number; naam: string; email: string }> {
  weigerBuitenDev();
  const uniek = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const naam = `${labelPrefix} ${uniek}`;
  const email = `${labelPrefix.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${uniek}@${E2E_ONBOARDING_GEBRUIKER_DOMEIN}`;
  const [rij] = await db
    .insert(gebruikersTable)
    .values({
      naam,
      email,
      // Bewust een hash van een onbekend willekeurig wachtwoord: inloggen kan nooit.
      wachtwoord: await bcrypt.hash(`wegwerp-${uniek}-${Math.random()}`, 4),
      rol: "gebruiker",
      bevoegdheden: {},
      actief: true,
      gearchiveerd: false,
    })
    .returning({ id: gebruikersTable.id });
  return { id: rij.id, naam, email };
}

// Verwijdert alle wegwerp-accounts van dit domein. Eventueel gekoppelde
// medewerkers moeten door de aanroepende test zelf al zijn opgeruimd
// (de FK staat op SET NULL, dus verwijderen kan altijd).
export async function verwijderWegwerpOnboardingGebruikers(): Promise<void> {
  weigerBuitenDev();
  await db
    .delete(gebruikersTable)
    .where(like(gebruikersTable.email, `%@${E2E_ONBOARDING_GEBRUIKER_DOMEIN}`));
}
