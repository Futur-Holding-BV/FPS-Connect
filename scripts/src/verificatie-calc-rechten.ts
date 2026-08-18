// CALC-RECHTEN (18-08-2026) — bewijsscript: calculaties niveau 3 vereist voor
// aanmaken; een 403 draagt de werkelijke reden (module + vereist niveau).
// Draaien: cd scripts && npx tsx src/verificatie-calc-rechten.ts
import "./lib/prodGuard";
import { authenticator } from "otplib";
import { eq } from "drizzle-orm";
import { db, gebruikersTable } from "@workspace/db";
import {
  setupE2eWebAccount, setupE2eWebAdminAccount,
  E2E_WEB_EMAIL, E2E_WEB_WACHTWOORD, E2E_WEB_TOTP_SECRET,
  E2E_WEB_ADMIN_EMAIL, E2E_WEB_ADMIN_WACHTWOORD, E2E_WEB_ADMIN_TOTP_SECRET,
} from "./e2e-monteur-testaccount";
import { PRESETS } from "@workspace/permissies";

const BASIS = process.env.API_BASIS
  ?? (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}/api` : "http://localhost:8080/api");

let geslaagd = 0; let gefaald = 0;
function check(naam: string, conditie: boolean, detail?: string) {
  if (conditie) { geslaagd++; console.log(`  ✓ ${naam}`); }
  else { gefaald++; console.error(`  ✗ ${naam}${detail ? ` — ${detail}` : ""}`); }
}

type Sessie = { cookie: string };
async function login(email: string, wachtwoord: string, totpSecret: string): Promise<Sessie> {
  const r1 = await fetch(`${BASIS}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, wachtwoord }),
  });
  const cookie = (r1.headers.get("set-cookie") ?? "").split(";")[0]!;
  const j1 = (await r1.json()) as { status?: string };
  if (j1.status === "verify_2fa" || j1.status === "setup_2fa") {
    const code = authenticator.generate(totpSecret);
    const r2 = await fetch(`${BASIS}/auth/2fa/verify`, {
      method: "POST", headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ code }),
    });
    if (!r2.ok) throw new Error(`2fa verify faalde: ${r2.status} ${await r2.text()}`);
    const c2 = r2.headers.get("set-cookie");
    return { cookie: c2 ? c2.split(";")[0]! : cookie };
  }
  if (!r1.ok) throw new Error(`login faalde: ${r1.status} ${JSON.stringify(j1)}`);
  return { cookie };
}
async function api(s: Sessie, methode: string, pad: string, body?: unknown) {
  const r = await fetch(`${BASIS}${pad}`, {
    method: methode, headers: { "Content-Type": "application/json", cookie: s.cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: unknown = null;
  try { json = await r.json(); } catch { /* leeg */ }
  return { status: r.status, json };
}

async function zetBevoegdheden(userId: number, bev: Record<string, number>) {
  await db.update(gebruikersTable).set({ bevoegdheden: bev }).where(eq(gebruikersTable.id, userId));
}

async function main() {
  console.log("— CALC-RECHTEN bewijsscript —");
  await setupE2eWebAccount();
  await setupE2eWebAdminAccount();

  const [webAccount] = await db.select({ id: gebruikersTable.id, bevoegdheden: gebruikersTable.bevoegdheden })
    .from(gebruikersTable).where(eq(gebruikersTable.email, E2E_WEB_EMAIL));
  if (!webAccount) throw new Error("e2e-web account ontbreekt");
  const origineel = webAccount.bevoegdheden as Record<string, number>;

  // 1. PRESETS-code: PL/WVB nu 3; Commercieel/Directie blijven 1
  const niveau = (naam: string) => (PRESETS.find((p) => p.naam === naam)?.bevoegdheden as Record<string, number>)?.calculaties ?? 0;
  check("preset Projectleider calculaties=3", niveau("Projectleider") === 3, String(niveau("Projectleider")));
  check("preset Werkvoorbereider calculaties=3", niveau("Werkvoorbereider") === 3, String(niveau("Werkvoorbereider")));
  // Commercieel had feitelijk niveau 0 (geen calculatie-sleutel) — blijft ongewijzigd.
  check("preset Commercieel blijft ongewijzigd (0)", niveau("Commercieel") === 0, String(niveau("Commercieel")));
  check("preset Directie blijft 1", niveau("Directie") === 1, String(niveau("Directie")));

  try {
    // 2. Met calculaties:1 → 403 mét werkelijke reden
    await zetBevoegdheden(webAccount.id, { calculaties: 1, projecten: 1 });
    const s = await login(E2E_WEB_EMAIL, E2E_WEB_WACHTWOORD, E2E_WEB_TOTP_SECRET);
    const r403 = await api(s, "POST", "/modules/calculaties", { naam: "CALC-RECHTEN bewijs" });
    const b = r403.json as { error?: string; code?: string; module?: string; vereist_niveau?: number };
    check("aanmaken met niveau 1 → 403", r403.status === 403, `status ${r403.status}`);
    check("403 draagt code BEVOEGDHEID_ONTBREEKT", b?.code === "BEVOEGDHEID_ONTBREEKT", JSON.stringify(b));
    check("403 noemt module+niveau in leesbare reden",
      !!b?.error && b.error.includes("calculaties") && b.error.includes("3") && b?.vereist_niveau === 3, JSON.stringify(b));

    // 3. Met calculaties:3 → aanmaken lukt
    await zetBevoegdheden(webAccount.id, { calculaties: 3, projecten: 1 });
    const r201 = await api(s, "POST", "/modules/calculaties", { naam: "CALC-RECHTEN bewijs" });
    check("aanmaken met niveau 3 → 201", r201.status === 201, `status ${r201.status} ${JSON.stringify(r201.json)}`);
    const nieuwId = (r201.json as { id?: number })?.id;
    if (nieuwId) {
      const admin = await login(E2E_WEB_ADMIN_EMAIL, E2E_WEB_ADMIN_WACHTWOORD, E2E_WEB_ADMIN_TOTP_SECRET);
      await api(admin, "DELETE", `/modules/calculaties/${nieuwId}`);
    }
  } finally {
    await zetBevoegdheden(webAccount.id, origineel);
  }

  console.log(`\nResultaat: ${geslaagd} geslaagd, ${gefaald} gefaald`);
  process.exit(gefaald > 0 ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
