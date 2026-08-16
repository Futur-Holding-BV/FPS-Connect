// Bewijs: mail-wachtrij hardening (taak #967).
// Test via HTTP + @workspace/db (nooit api-server-source importeren):
//
//  1. Maak een testgebruiker aan en log in.
//  2. Zet een item in status "verzenden" met een verwerktOp 11 minuten geleden
//     (gesimuleerd vastgelopen item — de server beschouwt dit als vastgelopen).
//  3. Roep GET /api/mail-wachtrij/telling op — vastgelopen item telt niet mee.
//  4. Roep POST /api/mail-wachtrij/herstel-vastgelopen aan — de ECHTE
//     herstelroutine (herstelVastgelopenMailWachtrijItems) wordt uitgevoerd.
//  5. Controleer dat het item nu status "mislukt" heeft + juiste foutdetail.
//  6. Controleer dat GET /api/mail-wachtrij/telling het item NIET meetelt
//     (telling = wachtend items only).
//  7. Opruimen.
//
// Draaien: pnpm --filter @workspace/scripts exec tsx src/bewijs-mail-wachtrij-herstel.ts

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import {
  db,
  gebruikersTable,
  mailWachtrijTable,
} from "@workspace/db";

const BASE = process.env.API_URL ?? "http://localhost:3000";

let cookie = "";

async function api(
  method: string,
  pad: string,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${BASE}${pad}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      // CSRF: geen Origin-header vanuit scripts → eisSameOrigin laat dit door
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0]!;
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

function assert(condition: boolean, bericht: string): void {
  if (!condition) {
    console.error(`✗ ${bericht}`);
    process.exit(1);
  }
  console.log(`✓ ${bericht}`);
}

const TESTMAIL = `bewijs-wachtrij-${Date.now()}@test.fpsbrandpreventie.nl`;
let testUserId: number | null = null;
let testItemId: number | null = null;

async function main(): Promise<void> {
  // ── 1. Testgebruiker aanmaken ─────────────────────────────────────────────
  const hash = await bcrypt.hash("BewijsWachtrij!1", 12);
  const [user] = await db
    .insert(gebruikersTable)
    .values({
      naam: "Bewijs Wachtrij",
      email: TESTMAIL,
      wachtwoordHash: hash,
      rol: "hoofdbeheerder",
      isActief: true,
    } as typeof gebruikersTable.$inferInsert)
    .returning({ id: gebruikersTable.id });
  testUserId = user!.id;
  console.log(`Testgebruiker aangemaakt (id=${testUserId})`);

  // ── 2. Inloggen ───────────────────────────────────────────────────────────
  const login = await api("POST", "/api/auth/login", {
    email: TESTMAIL,
    wachtwoord: "BewijsWachtrij!1",
  });
  assert(login.status === 200, `Inloggen gelukt (status ${login.status})`);

  // ── 3. Telling vóór het aanmaken van het testittem ────────────────────────
  const telVoor = await api("GET", "/api/mail-wachtrij/telling");
  assert(telVoor.status === 200, `Telling-endpoint bereikbaar (status ${telVoor.status})`);
  const aantalVoor = (telVoor.data as { aantal: number }).aantal;
  console.log(`Aantal wachtende mails vóór: ${aantalVoor}`);

  // ── 4. Vastgelopen item in de DB zetten ───────────────────────────────────
  // Rechtstreeks invoegen met status "verzenden" en verwerktOp 11 min geleden,
  // zodat de herstelroutine het als vastgelopen beschouwt (drempel = 10 min).
  const oudeVerwerktOp = new Date(Date.now() - 11 * 60 * 1000);
  const [item] = await db
    .insert(mailWachtrijTable)
    .values({
      naarEmail: "bewijs-vastgelopen@test.fpsbrandpreventie.nl",
      onderwerp: `Bewijs vastgelopen item ${Date.now()}`,
      html: "<p>Testmail bewijs</p>",
      soort: "test",
      status: "verzenden",
      verwerktDoorId: testUserId,
      verwerktOp: oudeVerwerktOp,
    } as typeof mailWachtrijTable.$inferInsert)
    .returning({ id: mailWachtrijTable.id });
  testItemId = item!.id;
  console.log(`Vastgelopen testitem aangemaakt (id=${testItemId}, verwerktOp=${oudeVerwerktOp.toISOString()})`);

  // ── 5. Telling: "verzenden"-item telt NIET als wachtend ───────────────────
  const telTijdens = await api("GET", "/api/mail-wachtrij/telling");
  const aantalTijdens = (telTijdens.data as { aantal: number }).aantal;
  assert(
    aantalTijdens === aantalVoor,
    `Telling ongewijzigd (${aantalTijdens} = ${aantalVoor}; "verzenden" telt niet mee)`,
  );

  // ── 6. Herstelroutine aanroepen via het echte endpoint ────────────────────
  // Dit roept de geëxporteerde functie herstelVastgelopenMailWachtrijItems()
  // aan op de draaiende server — geen SQL-duplicatie in dit script.
  const herstel = await api("POST", "/api/mail-wachtrij/herstel-vastgelopen");
  assert(herstel.status === 200, `Herstel-endpoint bereikbaar (status ${herstel.status})`);
  const aantalHersteld = (herstel.data as { aantalHersteld: number }).aantalHersteld;
  assert(aantalHersteld >= 1, `Herstelroutine heeft ≥1 item hersteld (aantalHersteld=${aantalHersteld})`);

  // ── 7. Item heeft nu status "mislukt" met juiste foutdetail ───────────────
  const [gecontroleerd] = await db
    .select({ status: mailWachtrijTable.status, foutdetail: mailWachtrijTable.foutdetail })
    .from(mailWachtrijTable)
    .where(eq(mailWachtrijTable.id, testItemId));
  assert(gecontroleerd?.status === "mislukt", `Status is "mislukt" (was: ${gecontroleerd?.status})`);
  assert(
    gecontroleerd?.foutdetail === "verzendpoging afgebroken (serverherstart)",
    `Foutdetail correct: "${gecontroleerd?.foutdetail}"`,
  );

  // ── 8. Telling na herstel: ongewijzigd ("mislukt" ≠ "wachtend") ──────────
  const telNa = await api("GET", "/api/mail-wachtrij/telling");
  const aantalNa = (telNa.data as { aantal: number }).aantal;
  assert(
    aantalNa === aantalVoor,
    `Telling na herstel ongewijzigd (${aantalNa} = ${aantalVoor}; "mislukt" telt niet mee)`,
  );

  console.log("\n✅ Alle bewijsstappen geslaagd.");
}

main()
  .catch((err) => {
    console.error("Fout tijdens bewijs:", err);
    process.exit(1);
  })
  .finally(async () => {
    if (testItemId != null) {
      await db.delete(mailWachtrijTable).where(eq(mailWachtrijTable.id, testItemId)).catch(() => null);
    }
    if (testUserId != null) {
      await db.delete(gebruikersTable).where(eq(gebruikersTable.id, testUserId)).catch(() => null);
    }
    console.log("Testdata opgeruimd.");
    process.exit(0);
  });
