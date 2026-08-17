// Bewijs: basislaag eigen gegevens in de webapp (Mijn gegevens).
//
// Iedere ingelogde medewerker — óók zonder personeel-/declaratierechten —
// kan bij zijn eigen uren, declaraties, verlof en loonstroken; de
// modulerechten blijven onverkort gelden voor andermans gegevens.
//
// Draaien: pnpm --filter @workspace/scripts exec tsx src/bewijs-mijn-gegevens-basislaag.ts
import "./lib/prodGuard";
import { authenticator } from "otplib";
import { eq } from "drizzle-orm";
import { db, medewerkersTable, gebruikersTable } from "@workspace/db";
import {
  setupE2eWachtwoordAccounts,
  E2E_WW_TARGET_EMAIL,
  E2E_WW_TARGET_WACHTWOORD,
} from "./e2e-wachtwoord-testaccounts";

const BASE = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
let geslaagd = 0;
let mislukt = 0;

function check(naam: string, ok: boolean, detail?: string) {
  if (ok) { geslaagd++; console.log(`  ✓ ${naam}`); }
  else { mislukt++; console.log(`  ✗ ${naam}${detail ? ` — ${detail}` : ""}`); }
}

function maakSessie() {
  let cookie = "";
  return async (pad: string, init: RequestInit = {}): Promise<Response> => {
    const resp = await fetch(`${BASE}${pad}`, {
      ...init,
      headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), cookie, ...(init.headers ?? {}) },
    });
    const setCookie = resp.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    return resp;
  };
}

async function main() {
  const { targetId } = await setupE2eWachtwoordAccounts();
  // Rechtenloos maken: basislaag mag niet op modulerechten leunen.
  await db.update(gebruikersTable)
    .set({ bevoegdheden: {}, totpSecret: "JBSWY3DPEHPK3PXP", tweeFactorIngeschakeld: true })
    .where(eq(gebruikersTable.id, targetId));

  const [med] = await db.insert(medewerkersTable).values({
    naam: "E2E MijnGegevens Testmedewerker",
    gebruikerId: targetId,
    werkmaatschappij: "FPS Brandpreventie",
  }).returning({ id: medewerkersTable.id });

  try {
    const s = maakSessie();
    const rLogin = await s("/auth/login", { method: "POST", body: JSON.stringify({ email: E2E_WW_TARGET_EMAIL, wachtwoord: E2E_WW_TARGET_WACHTWOORD }) });
    if (!rLogin.ok) throw new Error(`login faalde: ${rLogin.status}`);
    const r2fa = await s("/auth/2fa/verify", { method: "POST", body: JSON.stringify({ code: authenticator.generate("JBSWY3DPEHPK3PXP") }) });
    if (!r2fa.ok) throw new Error(`2fa faalde: ${r2fa.status}`);

    console.log("0. Uitgangssituatie: ingelogd zonder modulerechten");
    const me = (await (await s("/auth/me")).json()) as any;
    const bev = me?.bevoegdheden ?? me?.gebruiker?.bevoegdheden ?? {};
    check("account heeft geen personeel-/declaratierecht", !(bev.personeel >= 1) && !(bev.declaraties >= 1));

    console.log("\n1. Eigen gegevens bereikbaar (basislaag)");
    check("GET /mijn/declaraties = 200", (await s("/mijn/declaraties")).status === 200);
    const rDecl = await s("/declaraties", { method: "POST", body: JSON.stringify({ categorie: "reiskosten", omschrijving: "e2e-bewijs basislaag", bedrag_totaal_cents: 1234, datum: "2026-08-17" }) });
    check("POST /declaraties (eigen declaratie aanmaken) slaagt", rDecl.status === 200 || rDecl.status === 201, String(rDecl.status));
    check("GET /mijn/verlofsaldi = 200", (await s("/mijn/verlofsaldi")).status === 200);
    check("GET /mijn/verlofaanvragen = 200", (await s("/mijn/verlofaanvragen")).status === 200);
    check("GET /mijn/verlofsoorten = 200", (await s("/mijn/verlofsoorten")).status === 200);
    check("GET /mijn/salarisdocumenten = 200", (await s("/mijn/salarisdocumenten")).status === 200);
    const declId = rDecl.ok ? Number(((await rDecl.json()) as any).id) : 0;
    check("GET /declaraties/:id (eigen detail) = 200", (await s(`/declaraties/${declId}`)).status === 200);
    const rPatch = await s(`/declaraties/${declId}`, { method: "PATCH", body: JSON.stringify({ omschrijving: "e2e-bewijs bewerkt" }) });
    check("PATCH /declaraties/:id (eigen concept bewerken) = 200", rPatch.status === 200, String(rPatch.status));
    const rIndien = await s(`/declaraties/${declId}/indienen`, { method: "POST" });
    check("POST /declaraties/:id/indienen (eigen concept indienen) = 200", rIndien.status === 200, String(rIndien.status));
    const rDecl2 = await s("/declaraties", { method: "POST", body: JSON.stringify({ categorie: "overig", omschrijving: "e2e-bewijs verwijdertest", bedrag_totaal_cents: 500, datum: "2026-08-17" }) });
    const declId2 = rDecl2.ok ? Number(((await rDecl2.json()) as any).id) : 0;
    const rDel = await s(`/declaraties/${declId2}`, { method: "DELETE" });
    check("DELETE /declaraties/:id (eigen concept verwijderen) = 204", rDel.status === 204, String(rDel.status));
    const rUren = await s("/uren?datum_van=2026-08-10&datum_tot=2026-08-16");
    check("GET /uren = 200 (eigen scope)", rUren.status === 200, String(rUren.status));
    check("GET /uren/mijn-week = 200", (await s("/uren/mijn-week?jaar=2026&week=33")).status === 200);

    console.log("\n2. Modulerechten blijven gelden voor andermans gegevens");
    check("GET /declaraties (module-lijst) geweigerd", (await s("/declaraties")).status === 403);
    check("GET /verlof/overzicht geweigerd", (await s("/verlof/overzicht")).status === 403);
    check("GET /medewerkers geweigerd", (await s("/medewerkers")).status === 403);
  } finally {
    // Opruimen: declaraties van deze medewerker + medewerker-rij
    await db.execute(`DELETE FROM declaraties WHERE medewerker_id = ${med.id}` as any).catch(() => {});
    await db.delete(medewerkersTable).where(eq(medewerkersTable.id, med.id));
  }

  console.log(`\nResultaat: ${geslaagd} geslaagd, ${mislukt} mislukt`);
  if (mislukt > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
