// BOUW_01 §6 — bewijsscript retour-saldering toebehoren-verbruik.
// Test via HTTP (nooit api-server-source importeren) + @workspace/db voor opzet/cleanup.
// Draaien: pnpm --filter @workspace/scripts run tsx src/verificatie-toebehoren-retour.ts
import "./lib/prodGuard";
import { authenticator } from "otplib";
import { eq, inArray } from "drizzle-orm";
import { db, artikelenTable, voorraadTable, voorraadMutatiesTable } from "@workspace/db";
import {
  setupE2eWebAdminAccount,
  E2E_WEB_ADMIN_EMAIL, E2E_WEB_ADMIN_WACHTWOORD, E2E_WEB_ADMIN_TOTP_SECRET,
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

async function api(s: Sessie, methode: string, pad: string, body?: unknown) {
  const r = await fetch(`${BASIS}${pad}`, {
    method: methode,
    headers: { "Content-Type": "application/json", cookie: s.cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: unknown = null;
  try { json = await r.json(); } catch { /* leeg */ }
  return { status: r.status, json };
}

type Verbruik = {
  totaal_aantal: number;
  totaal_kosten: number;
  per_artikel: Array<{ artikel_id: number; aantal: number; kosten: number }>;
};

async function main() {
  console.log("— Toebehoren-retour saldering bewijsscript —");
  await setupE2eWebAdminAccount();
  const admin = await login(E2E_WEB_ADMIN_EMAIL, E2E_WEB_ADMIN_WACHTWOORD, E2E_WEB_ADMIN_TOTP_SECRET);

  // Opzet: testartikel in categorie toebehoren, prijs €10
  const [artikel] = await db.insert(artikelenTable).values({
    naam: "E2E Testartikel toebehoren-retour",
    eenheid: "st",
    categorie: "Gereedschap toebehoren",
    inkoopprijs: 10,
  }).returning({ id: artikelenTable.id });
  const artikelId = artikel!.id;
  console.log(`Testartikel: #${artikelId}`);

  try {
    // Voorraad opbouwen (correctie, telt niet mee in verbruik)
    const c = await api(admin, "POST", "/magazijn/voorraad/correctie", {
      artikel_id: artikelId, delta: 10, omschrijving: "e2e opzet",
    });
    check("voorraadcorrectie 201", c.status === 201, `status ${c.status}`);

    // Uitgifte zonder opdracht: 5 stuks
    const u = await api(admin, "POST", "/magazijn/uitgiftes", {
      regels: [{ artikel_id: artikelId, hoeveelheid: 5 }],
    });
    check("uitgifte 201", u.status === 201, `status ${u.status} ${JSON.stringify(u.json)}`);

    const v1 = await api(admin, "GET", "/magazijn/toebehoren-verbruik");
    const d1 = v1.json as Verbruik;
    const a1 = d1.per_artikel.find(a => a.artikel_id === artikelId);
    check("na uitgifte: aantal 5", a1?.aantal === 5, JSON.stringify(a1));
    check("na uitgifte: kosten 50", a1?.kosten === 50, JSON.stringify(a1));

    // Retour zonder opdracht: 2 goed + 1 defect
    const r = await api(admin, "POST", "/magazijn/retouren", {
      regels: [
        { artikel_id: artikelId, hoeveelheid: 2, conditie: "goed" },
        { artikel_id: artikelId, hoeveelheid: 1, conditie: "defect" },
      ],
    });
    check("retour 201", r.status === 201, `status ${r.status} ${JSON.stringify(r.json)}`);

    // Retour-mutaties hebben kostenrubriek gekregen
    const retourMutaties = await db.select({ type: voorraadMutatiesTable.type, kostenrubriek: voorraadMutatiesTable.kostenrubriek, delta: voorraadMutatiesTable.delta })
      .from(voorraadMutatiesTable)
      .where(eq(voorraadMutatiesTable.artikelId, artikelId));
    const retouren = retourMutaties.filter(m => m.type === "retour");
    check("2 retour-mutaties gelogd", retouren.length === 2, JSON.stringify(retouren));
    check("alle retour-mutaties hebben kostenrubriek", retouren.every(m => m.kostenrubriek === "gereedschap_toebehoren"), JSON.stringify(retouren));

    // Saldering: 5 uit - 2 goed retour = 3 netto (defect telt niet af)
    const v2 = await api(admin, "GET", "/magazijn/toebehoren-verbruik");
    const d2 = v2.json as Verbruik;
    const a2 = d2.per_artikel.find(a => a.artikel_id === artikelId);
    check("na retour: netto aantal 3", a2?.aantal === 3, JSON.stringify(a2));
    check("na retour: netto kosten 30", a2?.kosten === 30, JSON.stringify(a2));
  } finally {
    // Cleanup: testdata weg
    await db.delete(voorraadMutatiesTable).where(eq(voorraadMutatiesTable.artikelId, artikelId));
    await db.delete(voorraadTable).where(eq(voorraadTable.artikelId, artikelId));
    await db.delete(artikelenTable).where(eq(artikelenTable.id, artikelId));
  }

  console.log(`\nResultaat: ${geslaagd} geslaagd, ${gefaald} gefaald`);
  if (gefaald > 0) process.exit(1);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
