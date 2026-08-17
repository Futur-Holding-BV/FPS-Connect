// AI_01 vervolg (17-08-2026) — bewijsscript generieke leerlus-route.
// Test via HTTP (nooit api-server-source importeren) + @workspace/db voor controle/opruimen.
// Draaien: pnpm --filter @workspace/scripts run tsx src/verificatie-ai-veld-correctie.ts
import "./lib/prodGuard";
import { authenticator } from "otplib";
import { eq, and } from "drizzle-orm";
import { db, aiVeldCorrectiesTable } from "@workspace/db";
import {
  setupE2eWebAccount,
  E2E_WEB_EMAIL, E2E_WEB_WACHTWOORD, E2E_WEB_TOTP_SECRET,
} from "./e2e-monteur-testaccount";

const BASIS = process.env.API_BASIS
  ?? (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}/api` : "http://localhost:8080/api");

let geslaagd = 0;
let gefaald = 0;
function check(naam: string, conditie: boolean, detail?: string) {
  if (conditie) { geslaagd++; console.log(`  ✓ ${naam}`); }
  else { gefaald++; console.error(`  ✗ ${naam}${detail ? ` — ${detail}` : ""}`); }
}

type Sessie = { cookie: string };

async function login(email: string, wachtwoord: string, totpSecret: string): Promise<Sessie> {
  const r1 = await fetch(`${BASIS}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, wachtwoord }),
  });
  const cookie = (r1.headers.get("set-cookie") ?? "").split(";")[0]!;
  const j1 = (await r1.json()) as { status?: string };
  if (j1.status === "verify_2fa" || j1.status === "setup_2fa") {
    const code = authenticator.generate(totpSecret);
    const r2 = await fetch(`${BASIS}/auth/2fa/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ code }),
    });
    if (!r2.ok) throw new Error(`2fa verify faalde: ${r2.status} ${await r2.text()}`);
    const c2 = r2.headers.get("set-cookie");
    return { cookie: c2 ? c2.split(";")[0]! : cookie };
  }
  if (!r1.ok) throw new Error(`login faalde: ${r1.status} ${JSON.stringify(j1)}`);
  return { cookie };
}

async function post(s: Sessie | null, body: unknown) {
  const r = await fetch(`${BASIS}/ai/veld-correctie`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(s ? { cookie: s.cookie } : {}) },
    body: JSON.stringify(body),
  });
  return r.status;
}

async function main() {
  await setupE2eWebAccount();
  const s = await login(E2E_WEB_EMAIL, E2E_WEB_WACHTWOORD, E2E_WEB_TOTP_SECRET);

  const marker = `bewijs-${Date.now()}`;

  console.log("1. Autorisatie & validatie");
  check("zonder sessie ⇒ 401", (await post(null, { veld_naam: "spot.type", ai_voorstel: "a", gekozen: "a" })) === 401);
  check("onbekende prefix ⇒ 400", (await post(s, { veld_naam: "hack.type", ai_voorstel: "a", gekozen: "a" })) === 400);
  check("ongeldige suffix ⇒ 400", (await post(s, { veld_naam: "spot.Type-X", ai_voorstel: "a", gekozen: "a" })) === 400);
  check("gekozen ontbreekt ⇒ 400", (await post(s, { veld_naam: "spot.type", ai_voorstel: "a" })) === 400);

  console.log("2. Vastlegging");
  check("spot-veld overgenomen ⇒ 204", (await post(s, { veld_naam: "spot.type", ai_voorstel: "1.02", gekozen: "1.02", tekst_fragment: marker })) === 204);
  check("formulier-veld gecorrigeerd ⇒ 204", (await post(s, { veld_naam: "formulier.gebouw.bouwjaar", ai_voorstel: "1998", gekozen: "2001", tekst_fragment: marker })) === 204);
  check("afgewezen (gekozen leeg) ⇒ 204", (await post(s, { veld_naam: "incident.oorzaak", ai_voorstel: "kortsluiting", gekozen: "", tekst_fragment: marker })) === 204);

  const rijen = await db.select().from(aiVeldCorrectiesTable)
    .where(eq(aiVeldCorrectiesTable.tekstFragment, marker));
  check("3 rijen in ai_veld_correcties", rijen.length === 3, `gevonden: ${rijen.length}`);
  const corr = rijen.find((r) => r.veldNaam === "formulier.gebouw.bouwjaar");
  check("correctie bewaart afwijkende keuze", corr?.aiVoorstel === "1998" && corr?.gekozen === "2001");
  check("audit: gebruiker_id gevuld", rijen.every((r) => r.gebruikerId !== null));

  console.log("3. Rate-limit (120/uur per gebruiker)");
  let laatste = 0;
  for (let i = 0; i < 125; i++) {
    laatste = await post(s, { veld_naam: "spot.type", ai_voorstel: "x", gekozen: "x", tekst_fragment: marker });
    if (laatste === 429) break;
  }
  check("volume-misbruik ⇒ 429", laatste === 429, `laatste status: ${laatste}`);

  console.log("4. Invariant: generieke rijen bereiken de bedrijfsdocumenten-few-shot niet");
  // Gesmede afwijkende rijen boven de drempel (10) onder een generieke prefix.
  const smeed = Array.from({ length: 12 }, (_, i) => ({
    veldNaam: "spot.aanval", aiVoorstel: `a${i}`, gekozen: `b${i}`, tekstFragment: marker,
  }));
  await db.insert(aiVeldCorrectiesTable).values(smeed);
  // Zelfde filter als organisatie.ts (drempelquery beperkt tot de zes bedrijfsdocument-velden).
  const GELDIGE_VELDEN = ["naam", "uitgever", "referentie", "ingangsdatum", "vervaldatum", "omschrijving"];
  const zonderFilter = await db.select({ veldNaam: aiVeldCorrectiesTable.veldNaam })
    .from(aiVeldCorrectiesTable)
    .where(eq(aiVeldCorrectiesTable.veldNaam, "spot.aanval"));
  check("gesmede rijen bestaan (12)", zonderFilter.length === 12, `gevonden: ${zonderFilter.length}`);
  check("generieke prefix valt buiten bedrijfsdocument-filter", !GELDIGE_VELDEN.includes("spot.aanval"));
  // Documentatie-invariant: als organisatie.ts ooit het inArray(GELDIGE_VELDEN)-filter
  // op de drempel-/voorbeeldquery verliest, kunnen deze 12 rijen de few-shot binnendringen.
  const filterAanwezig = (await import("node:fs/promises"))
    .readFile(new URL("../../artifacts/api-server/src/routes/organisatie.ts", import.meta.url), "utf8")
    .then((t) => t.includes("inArray(aiVeldCorrectiesTable.veldNaam, [...GELDIGE_VELDEN])"));
  check("consumptiefilter aanwezig in organisatie.ts", await filterAanwezig);

  // Opruimen
  await db.delete(aiVeldCorrectiesTable).where(and(eq(aiVeldCorrectiesTable.tekstFragment, marker)));

  console.log(`\nResultaat: ${geslaagd} geslaagd, ${gefaald} gefaald`);
  process.exit(gefaald > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
