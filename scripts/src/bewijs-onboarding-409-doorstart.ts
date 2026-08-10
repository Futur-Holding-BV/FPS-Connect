/**
 * Bewijs voor taak: doorstart bij bestaand e-mailadres in de accountstap.
 *
 * Controleert dat POST /medewerkers/onboarding-account bij een bestaand
 * e-mailadres een 409 teruggeeft mét doorstart-informatie:
 *   - code: EMAIL_ALREADY_EXISTS
 *   - bestaande_gebruiker_id: id van het bestaande account
 *   - heeft_medewerkerprofiel: alleen true bij een NIET-concept profiel
 *     (concept is hervatbaar via de wizard en blokkeert de doorstart niet)
 *
 * Gebruikt het vaste e2e-web-admin account (hoofdbeheerder) via de dev-API
 * over https (Secure cookie).
 */
import { authenticator } from "otplib";
import { db } from "@workspace/db";
import { gebruikersTable, medewerkersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import {
  setupE2eWebAdminAccount,
  E2E_WEB_ADMIN_EMAIL,
  E2E_WEB_ADMIN_WACHTWOORD,
  E2E_WEB_ADMIN_TOTP_SECRET,
} from "./e2e-monteur-testaccount";

const BASIS = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;

interface ConflictAntwoord {
  error?: string;
  code?: string;
  bestaande_gebruiker_id?: number | null;
  heeft_medewerkerprofiel?: boolean;
  status?: string;
  id?: number;
}

async function main() {
  await setupE2eWebAdminAccount();

  // Login met sessie-cookie
  const jar: string[] = [];
  const bewaarCookies = (res: Response) => {
    for (const v of res.headers.getSetCookie()) jar.push(v.split(";")[0]);
  };
  const post = async (pad: string, body: unknown) => {
    const res = await fetch(`${BASIS}${pad}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: jar.join("; ") },
      body: JSON.stringify(body),
    });
    bewaarCookies(res);
    return res;
  };
  const alsJson = async (res: Response): Promise<ConflictAntwoord> =>
    (await res.json()) as ConflictAntwoord;

  let res = await post("/auth/login", {
    email: E2E_WEB_ADMIN_EMAIL,
    wachtwoord: E2E_WEB_ADMIN_WACHTWOORD,
  });
  let data = await alsJson(res);
  if (data.status === "verify_2fa") {
    if (authenticator.timeRemaining() < 10) {
      await new Promise((r) => setTimeout(r, (authenticator.timeRemaining() + 1) * 1000));
    }
    const code = authenticator.generate(E2E_WEB_ADMIN_TOTP_SECRET);
    res = await post("/auth/2fa/verify", { code });
    data = await alsJson(res);
  }
  if (!res.ok) throw new Error(`Login mislukt: ${res.status} ${JSON.stringify(data)}`);
  console.log("✓ ingelogd als e2e-web-admin");

  // Case A: bestaand account ZONDER medewerkerprofiel → doorstart mogelijk
  const emailZonder = "e2e-doorstart-zonder@fps.local";
  await db.delete(gebruikersTable).where(eq(gebruikersTable.email, emailZonder));
  res = await post("/medewerkers/onboarding-account", { naam: "Doorstart Zonder", email: emailZonder });
  const aangemaakt = await alsJson(res);
  if (res.status !== 201 || typeof aangemaakt.id !== "number") {
    throw new Error(`Setup case A mislukt: ${res.status} ${JSON.stringify(aangemaakt)}`);
  }

  res = await post("/medewerkers/onboarding-account", { naam: "Doorstart Zonder 2", email: emailZonder });
  data = await alsJson(res);
  console.log("Case A (zonder profiel):", res.status, JSON.stringify(data));
  if (
    res.status !== 409 ||
    data.code !== "EMAIL_ALREADY_EXISTS" ||
    data.bestaande_gebruiker_id !== aangemaakt.id ||
    data.heeft_medewerkerprofiel !== false
  ) {
    throw new Error("FOUT: case A verwachtte 409 met bestaande_gebruiker_id + heeft_medewerkerprofiel=false");
  }
  console.log("✓ case A ok: 409 met doorstart-id en heeft_medewerkerprofiel=false");

  // Case B: bestaand account met CONCEPT-medewerkerprofiel → hervatbaar,
  // heeft_medewerkerprofiel moet false blijven.
  await db.insert(medewerkersTable).values({
    gebruikerId: aangemaakt.id,
    naam: "Doorstart Zonder",
    medewerkerStatus: "concept",
  });
  res = await post("/medewerkers/onboarding-account", { naam: "Doorstart Concept", email: emailZonder });
  data = await alsJson(res);
  console.log("Case B (concept-profiel):", res.status, JSON.stringify(data));
  if (
    res.status !== 409 ||
    data.bestaande_gebruiker_id !== aangemaakt.id ||
    data.heeft_medewerkerprofiel !== false
  ) {
    throw new Error("FOUT: case B verwachtte 409 met heeft_medewerkerprofiel=false (concept is hervatbaar)");
  }
  console.log("✓ case B ok: conceptprofiel blokkeert de doorstart niet");

  // Case C: bestaand account met NIET-concept medewerkerprofiel → blokkeert.
  // Zet het conceptprofiel van case B tijdelijk op "actief".
  await db
    .update(medewerkersTable)
    .set({ medewerkerStatus: "actief" })
    .where(eq(medewerkersTable.gebruikerId, aangemaakt.id));
  res = await post("/medewerkers/onboarding-account", { naam: "Doorstart Met", email: emailZonder });
  data = await alsJson(res);
  console.log("Case C (niet-concept profiel):", res.status, JSON.stringify(data));
  if (
    res.status !== 409 ||
    data.heeft_medewerkerprofiel !== true ||
    data.bestaande_gebruiker_id !== aangemaakt.id
  ) {
    throw new Error("FOUT: case C verwachtte 409 met heeft_medewerkerprofiel=true");
  }
  console.log("✓ case C ok: 409 met heeft_medewerkerprofiel=true");

  // Opruimen testdata (concept-medewerker + account)
  await db.delete(medewerkersTable).where(eq(medewerkersTable.gebruikerId, aangemaakt.id));
  await db.delete(gebruikersTable).where(eq(gebruikersTable.email, emailZonder));
  console.log("✓ opgeruimd — bewijs geslaagd");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
