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
import { eq, inArray } from "drizzle-orm";
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
    bevoegdheden?: Record<string, number>;
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
    bevoegdheden: waarden.bevoegdheden ?? {},
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
    // Leesrecht op ten minste één module zodat de "Bekijken als"-impersonatie
    // door een hoofdbeheerder in het Connect-portaal blijft (met leesrechten),
    // en niet op het "Geen toegang"-scherm eindigt. Zonder bevoegdheden zou het
    // gebruikersmenu (incl. de terugschakelknop) verdwijnen.
    bevoegdheden: { gebouwen: 1 },
  });

  return { adminId, targetId };
}

// Archiveert en deactiveert de vaste e2e-accounts ná een testrun, zodat ze
// niet zichtbaar blijven in Gebruikersbeheer en niet kunnen inloggen buiten
// een test om. De eerstvolgende testrun zet ze via setupE2eWachtwoordAccounts
// (idempotent) weer op actief.
export async function archiveerE2eWachtwoordAccounts(): Promise<void> {
  await db
    .update(gebruikersTable)
    .set({ actief: false, gearchiveerd: true })
    .where(
      inArray(gebruikersTable.email, [
        E2E_WW_ADMIN_EMAIL,
        E2E_WW_TARGET_EMAIL,
        E2E_WW_GATE_EMAIL,
      ]),
    );
}

// ── Gate-testaccount (wachtwoord-wijzigen gate) ──────────────────────────────
//
// Een apart account specifiek voor de "Wachtwoord wijzigen vereist"-gate test.
// Dit account heeft `moetWachtwoordWijzigen: true` als startpunt, zodat de
// spec de gate kan testen zonder een admin-handeling te simuleren.
//
// TOTP is ingeschakeld (met vaste secret) zodat de volledige loginflow kan
// worden doorlopen. Na een succesvol wachtwoord wijzigen reset de spec het
// account via DB zodat de volgende testrun opnieuw de gate kan testen.
export const E2E_WW_GATE_EMAIL = "e2e-ww-gate@fps.local";
export const E2E_WW_GATE_WACHTWOORD = "E2eWwGate!2026";
export const E2E_WW_GATE_TOTP_SECRET = "JBSWY3DPEHPK3PXP";

export async function setupE2eWachtwoordGateAccount(): Promise<number> {
  weigerBuitenDev();
  const hash = await bcrypt.hash(E2E_WW_GATE_WACHTWOORD, 10);

  // maakOfUpdate zet moetWachtwoordWijzigen altijd op false; daarna expliciet
  // op true zetten zodat de gate bij elke testrun actief is.
  const id = await maakOfUpdate(E2E_WW_GATE_EMAIL, {
    naam: "E2E Gate Test Gebruiker",
    rol: "gebruiker",
    wachtwoordHash: hash,
    totpSecret: E2E_WW_GATE_TOTP_SECRET,
    tweeFactorIngeschakeld: true,
    // Leesrecht op gebouwen zodat het portaal laadt (en niet het "Geen
    // toegang"-scherm toont) zodra moetWachtwoordWijzigen wordt opgeheven.
    bevoegdheden: { gebouwen: 1 },
  });

  await db
    .update(gebruikersTable)
    .set({ moetWachtwoordWijzigen: true })
    .where(eq(gebruikersTable.email, E2E_WW_GATE_EMAIL));

  return id;
}

// Geeft een verse TOTP-code voor het gate-testaccount.
export async function genereerVersGateTotp(minResterendeSec = 20): Promise<string> {
  const resterend = authenticator.timeRemaining();
  if (resterend < minResterendeSec) {
    await new Promise((r) => setTimeout(r, (resterend + 1) * 1000));
  }
  return authenticator.generate(E2E_WW_GATE_TOTP_SECRET);
}

// Zet het gate-account terug naar de begintoestand: origineel wachtwoord +
// moetWachtwoordWijzigen=true. Wordt door de spec aangeroepen na een
// succesvolle wachtwoord-wissel zodat de volgende run opnieuw de gate test.
export async function resetE2eWachtwoordGateAccount(): Promise<void> {
  weigerBuitenDev();
  const hash = await bcrypt.hash(E2E_WW_GATE_WACHTWOORD, 10);
  await db
    .update(gebruikersTable)
    .set({
      wachtwoord: hash,
      moetWachtwoordWijzigen: true,
      misluktePogingen: 0,
      vergrendeldTot: null,
      actief: true,
      gearchiveerd: false,
    })
    .where(eq(gebruikersTable.email, E2E_WW_GATE_EMAIL));
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
