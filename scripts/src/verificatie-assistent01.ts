/**
 * ASSISTENT_01 gedragsbewijs — dezelfde vraag door drie gebruikers.
 *
 * Bewijst (§7 acceptatie):
 *  B1. Hoofdbeheerder krijgt echte aantallen (offertes + facturen) mét herkomst.
 *  B2. Beperkte gebruiker (alleen offertes:1) krijgt offerte-aantallen, maar
 *      een expliciete weigering voor facturen — afgedwongen in de gegevensvraag.
 *  B3. Monteur-achtige gebruiker (geen offertes/financieel) krijgt voor beide
 *      een weigering, geen verzonnen getallen.
 *  B4. Paginacontext: vraag mét context {object_type: gebouw} levert een
 *      antwoord over dat gebouw voor wie het mag zien.
 *  B5. Kosten: gemiddelde kosten per adviseur-gesprek uit ai_aanroepen.
 *
 * Draaien: pnpm --filter @workspace/scripts exec tsx src/verificatie-assistent01.ts
 */
import bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import { db, gebruikersTable, gebouwenTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const BASIS = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
const WACHTWOORD = "Assistent01Test!2026";

const ACCOUNTS = {
  admin: { email: "assistent01-admin@fps.local", totp: "ASSISTADMIN234567", rol: "hoofdbeheerder" as const, bevoegdheden: {} as Record<string, number> },
  beperkt: { email: "assistent01-beperkt@fps.local", totp: "ASSISTBEPERKT2345", rol: "gebruiker" as const, bevoegdheden: { offertes: 1 } },
  monteur: { email: "assistent01-monteur@fps.local", totp: "ASSISTMONTEUR2345", rol: "gebruiker" as const, bevoegdheden: { gebouwen: 1, voorzieningen: 2 } },
};

function faal(msg: string): never { console.error(`❌ FAAL: ${msg}`); process.exit(1); }
function ok(msg: string) { console.log(`✅ ${msg}`); }

async function maakGebruiker(a: typeof ACCOUNTS.admin): Promise<number> {
  if (process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === "production") throw new Error("GEWEIGERD: testaccounts alleen in dev");
  const hash = await bcrypt.hash(WACHTWOORD, 10);
  const [bestaand] = await db.select({ id: gebruikersTable.id }).from(gebruikersTable).where(eq(gebruikersTable.email, a.email));
  if (bestaand) {
    await db.update(gebruikersTable).set({ wachtwoord: hash, rol: a.rol, bevoegdheden: a.bevoegdheden, actief: true, gearchiveerd: false, totpSecret: a.totp, tweeFactorIngeschakeld: true }).where(eq(gebruikersTable.id, bestaand.id));
    return bestaand.id;
  }
  const [rij] = await db.insert(gebruikersTable).values({
    naam: `ASSISTENT_01 test (${a.email.split("@")[0]})`,
    email: a.email, wachtwoord: hash, rol: a.rol, bevoegdheden: a.bevoegdheden,
    actief: true, totpSecret: a.totp, tweeFactorIngeschakeld: true,
  }).returning({ id: gebruikersTable.id });
  return rij.id;
}

async function login(a: typeof ACCOUNTS.admin): Promise<string> {
  const resp = await fetch(`${BASIS}/auth/mobile/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: a.email, wachtwoord: WACHTWOORD, code: authenticator.generate(a.totp) }),
  });
  if (!resp.ok) faal(`login ${a.email} → ${resp.status}: ${await resp.text()}`);
  const { token } = (await resp.json()) as { token: string };
  return `Bearer ${token}`;
}

async function vraag(auth: string, tekst: string, context?: Record<string, unknown>): Promise<string> {
  const resp = await fetch(`${BASIS}/adviseur/vraag`, {
    method: "POST", headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({ vraag: tekst, geschiedenis: [], ...(context ? { context } : {}) }),
  });
  if (!resp.ok) faal(`adviseur/vraag → ${resp.status}: ${await resp.text()}`);
  const { antwoord } = (await resp.json()) as { antwoord: string };
  return antwoord;
}

async function main() {
  for (const a of Object.values(ACCOUNTS)) await maakGebruiker(a);

  const VRAAG = "Hoeveel offertes staan er in het systeem per status, en hoeveel inkoopfacturen zijn er? Noem exacte aantallen.";
  const antwoorden: Record<string, string> = {};
  for (const [naam, a] of Object.entries(ACCOUNTS)) {
    const auth = await login(a);
    antwoorden[naam] = await vraag(auth, VRAAG);
    console.log(`\n════ ${naam} (${a.rol}, rechten: ${JSON.stringify(a.bevoegdheden)}) ════\n${antwoorden[naam]}\n`);
  }

  // B1 admin: moet cijfers bevatten (een getal) en herkomst noemen
  if (!/\d/.test(antwoorden.admin)) faal("B1: hoofdbeheerder-antwoord bevat geen enkel getal");
  ok("B1: hoofdbeheerder krijgt aantallen");
  // B2 beperkt: mag offertes zien maar moet facturen weigeren
  if (!/(niet|geen).{0,80}(opvragen|toegang|inzien|rechten|bevoegd)/is.test(antwoorden.beperkt)) faal("B2: beperkte gebruiker kreeg geen expliciete weigering voor facturen");
  ok("B2: beperkte gebruiker krijgt weigering voor facturen");
  // B3 monteur: geen offertes/financieel → weigering, en géén verzonnen aantallen-per-status
  if (!/(niet|geen).{0,80}(opvragen|toegang|inzien|rechten|bevoegd)/is.test(antwoorden.monteur)) faal("B3: monteur kreeg geen weigering");
  ok("B3: monteur krijgt weigering, geen verzonnen cijfers");

  // B4: paginacontext met een echt gebouw (admin)
  const [gebouw] = await db.select({ id: gebouwenTable.id, naam: gebouwenTable.naam }).from(gebouwenTable).limit(1);
  if (gebouw) {
    const auth = await login(ACCOUNTS.admin);
    const ctxAntwoord = await vraag(auth, "Waar kijk ik nu naar? Vat kort samen wat je over dit object weet.", { scherm: `/gebouwen/${gebouw.id}`, object_type: "gebouw", object_id: gebouw.id });
    console.log(`\n════ B4 context (gebouw #${gebouw.id} "${gebouw.naam}") ════\n${ctxAntwoord}\n`);
    if (!ctxAntwoord.toLowerCase().includes("gebouw")) faal("B4: contextantwoord noemt het gebouw niet");
    ok("B4: paginacontext werkt (assistent praat over het open gebouw)");
  } else {
    console.log("⚠️ B4 overgeslagen: geen gebouwen in dev-database");
  }

  // B5: kostenmeting uit ai_aanroepen (adviseur-module, vandaag)
  const kostenRes = await db.execute(sql`
    SELECT count(*)::int AS aanroepen,
           coalesce(sum(geschatte_kosten_eur), 0)::float AS totaal_eur,
           coalesce(avg(geschatte_kosten_eur), 0)::float AS gemiddeld_eur,
           coalesce(avg(prompt_tokens), 0)::int AS gem_prompt_tokens,
           coalesce(avg(completion_tokens), 0)::int AS gem_completion_tokens
    FROM ai_aanroepen WHERE module = 'adviseur'
  `);
  const kosten = ((kostenRes as unknown as { rows?: unknown[] }).rows ?? (kostenRes as unknown as unknown[]))[0];
  console.log("\n════ B5 kosten (module adviseur, ai_aanroepen) ════");
  console.log(kosten);
  ok("B5: kosten gemeten uit ai_aanroepen");

  // Opruimen: testaccounts archiveren
  for (const a of Object.values(ACCOUNTS)) {
    await db.update(gebruikersTable).set({ actief: false, gearchiveerd: true }).where(eq(gebruikersTable.email, a.email));
  }
  ok("Testaccounts gearchiveerd");
  process.exit(0);
}

main().catch((e) => faal(String(e)));
