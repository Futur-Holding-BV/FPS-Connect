// Bewijs: declaratie doorzetten naar een andere beoordelaar
// A: keuzelijst /declaraties/beoordelaars bevat de collega-beoordelaar, niet uzelf
// B: doorzetten van een ingediende declaratie slaat velden op + blijft goedkeurbaar
// C: fail-closed randen (zelf, concept-status, niet-beoordelaar als doel)
// Draaien: pnpm --filter @workspace/scripts exec tsx src/bewijs-declaratie-doorzetten.ts
import { authenticator } from "otplib";
import { eq } from "drizzle-orm";
import { db, gebruikersTable, medewerkersTable, declaratiesTable, salarisMutatiesTable } from "@workspace/db";
import {
  setupE2eWachtwoordAccounts,
  E2E_WW_ADMIN_EMAIL,
  E2E_WW_ADMIN_WACHTWOORD,
  E2E_WW_ADMIN_TOTP_SECRET,
} from "./e2e-wachtwoord-testaccounts";

const BASE = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
let cookie = "";
let geslaagd = 0;
let mislukt = 0;

function check(naam: string, ok: boolean, detail?: string) {
  if (ok) { geslaagd++; console.log(`  ✓ ${naam}`); }
  else { mislukt++; console.log(`  ✗ ${naam}${detail ? ` — ${detail}` : ""}`); }
}

async function api(pad: string, init: RequestInit = {}): Promise<Response> {
  const resp = await fetch(`${BASE}${pad}`, {
    ...init,
    headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), cookie, ...(init.headers ?? {}) },
  });
  const setCookie = resp.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  return resp;
}

async function main() {
  await setupE2eWachtwoordAccounts();
  const r1 = await api("/auth/login", { method: "POST", body: JSON.stringify({ email: E2E_WW_ADMIN_EMAIL, wachtwoord: E2E_WW_ADMIN_WACHTWOORD }) });
  if (!r1.ok) throw new Error(`login faalde: ${r1.status}`);
  const r2 = await api("/auth/2fa/verify", { method: "POST", body: JSON.stringify({ code: authenticator.generate(E2E_WW_ADMIN_TOTP_SECRET) }) });
  if (!r2.ok) throw new Error(`2fa faalde: ${r2.status}`);
  const me = await (await api("/auth/me")).json() as any;
  const mijnId: number = me.id ?? me.gebruiker?.id;
  console.log(`Ingelogd als e2e-hoofdbeheerder (id ${mijnId})\n`);

  // Wegwerp-gegevens: collega-beoordelaar, niet-beoordelaar, medewerker + declaraties
  const [beoordelaar] = await db.insert(gebruikersTable).values({
    naam: "Bewijs Beoordelaar", email: `bewijs-beoordelaar-${Date.now()}@voorbeeld.fps.local`,
    actief: true, bevoegdheden: { declaraties: 3 },
  }).returning({ id: gebruikersTable.id });
  const [beoordelaar2] = await db.insert(gebruikersTable).values({
    naam: "Bewijs Beoordelaar Twee", email: `bewijs-beoordelaar2-${Date.now()}@voorbeeld.fps.local`,
    actief: true, bevoegdheden: { declaraties: 3 },
  }).returning({ id: gebruikersTable.id });
  const [leek] = await db.insert(gebruikersTable).values({
    naam: "Bewijs Leek", email: `bewijs-leek-${Date.now()}@voorbeeld.fps.local`,
    actief: true, bevoegdheden: { declaraties: 1 },
  }).returning({ id: gebruikersTable.id });
  const [eigenaarGebruiker] = await db.insert(gebruikersTable).values({
    naam: "Bewijs Declarant", email: `bewijs-declarant-${Date.now()}@voorbeeld.fps.local`,
    actief: true, bevoegdheden: {},
  }).returning({ id: gebruikersTable.id });
  const [mw] = await db.insert(medewerkersTable).values({
    gebruikerId: eigenaarGebruiker.id, naam: "Bewijs Declarant",
  }).returning({ id: medewerkersTable.id });
  const [decl] = await db.insert(declaratiesTable).values({
    medewerkerId: mw.id, categorie: "reiskosten", omschrijving: "Bewijs doorzetten",
    bedragTotaalCents: 12345, datum: "2026-08-16", status: "ingediend", ingediendOp: new Date(),
  }).returning({ id: declaratiesTable.id });
  const [declRace] = await db.insert(declaratiesTable).values({
    medewerkerId: mw.id, categorie: "overig", omschrijving: "Bewijs race",
    bedragTotaalCents: 900, datum: "2026-08-16", status: "ingediend", ingediendOp: new Date(),
  }).returning({ id: declaratiesTable.id });
  const [declConcept] = await db.insert(declaratiesTable).values({
    medewerkerId: mw.id, categorie: "overig", omschrijving: "Bewijs concept",
    bedragTotaalCents: 500, datum: "2026-08-16", status: "concept",
  }).returning({ id: declaratiesTable.id });

  try {
    console.log("Bewijs A: keuzelijst beoordelaars");
    const lijst = await (await api("/declaraties/beoordelaars")).json() as any[];
    check("collega-beoordelaar in lijst", Array.isArray(lijst) && lijst.some((b: any) => b.id === beoordelaar.id));
    check("uzelf niet in lijst", !lijst.some((b: any) => b.id === mijnId));
    check("niet-beoordelaar niet in lijst", !lijst.some((b: any) => b.id === leek.id));

    console.log("Bewijs C: fail-closed randen");
    const rZelf = await api(`/declaraties/${decl.id}/doorzetten`, { method: "POST", body: JSON.stringify({ gebruiker_id: mijnId }) });
    check("doorzetten aan uzelf geweigerd (422)", rZelf.status === 422, String(rZelf.status));
    const rLeek = await api(`/declaraties/${decl.id}/doorzetten`, { method: "POST", body: JSON.stringify({ gebruiker_id: leek.id }) });
    check("doorzetten aan niet-beoordelaar geweigerd (422)", rLeek.status === 422, String(rLeek.status));
    const rConcept = await api(`/declaraties/${declConcept.id}/doorzetten`, { method: "POST", body: JSON.stringify({ gebruiker_id: beoordelaar.id }) });
    check("concept-declaratie doorzetten geweigerd (422)", rConcept.status === 422, String(rConcept.status));

    console.log("Bewijs B: doorzetten + daarna goedkeuren");
    const rDoor = await api(`/declaraties/${decl.id}/doorzetten`, { method: "POST", body: JSON.stringify({ gebruiker_id: beoordelaar.id, toelichting: "Graag jouw oordeel" }) });
    check("doorzetten geslaagd (200)", rDoor.ok, String(rDoor.status));
    const d = await rDoor.json() as any;
    check("doorgezet_naar + naam gevuld", d.doorgezet_naar === beoordelaar.id && d.doorgezet_naar_naam === "Bewijs Beoordelaar");
    check("doorgezet_door + op gevuld", d.doorgezet_door === mijnId && !!d.doorgezet_op);
    check("toelichting bewaard", d.doorzet_toelichting === "Graag jouw oordeel");
    check("status blijft ingediend", d.status === "ingediend");
    const dGet = await (await api(`/declaraties/${decl.id}`)).json() as any;
    check("GET toont doorzet-info", dGet.doorgezet_naar_naam === "Bewijs Beoordelaar");
    const rStale = await api(`/declaraties/${decl.id}/doorzetten`, { method: "POST", body: JSON.stringify({ gebruiker_id: beoordelaar2.id, verwacht_doorgezet_naar: null }) });
    check("stale her-doorzetten geweigerd (409)", rStale.status === 409, String(rStale.status));
    const rVers = await api(`/declaraties/${decl.id}/doorzetten`, { method: "POST", body: JSON.stringify({ gebruiker_id: beoordelaar2.id, verwacht_doorgezet_naar: beoordelaar.id }) });
    check("her-doorzetten met verse verwachting geslaagd (200)", rVers.ok, String(rVers.status));
    const rGoed = await api(`/declaraties/${decl.id}/goedkeuren`, { method: "POST" });
    check("goedkeuren blijft mogelijk na doorzetten (200)", rGoed.ok, String(rGoed.status));

    console.log("Bewijs D: gelijktijdig doorzetten (parallel)");
    const [pa, pb] = await Promise.all([
      api(`/declaraties/${declRace.id}/doorzetten`, { method: "POST", body: JSON.stringify({ gebruiker_id: beoordelaar.id, verwacht_doorgezet_naar: null }) }),
      api(`/declaraties/${declRace.id}/doorzetten`, { method: "POST", body: JSON.stringify({ gebruiker_id: beoordelaar2.id, verwacht_doorgezet_naar: null }) }),
    ]);
    const statussen = [pa.status, pb.status].sort();
    check("precies één wint (200 + 409)", statussen[0] === 200 && statussen[1] === 409, statussen.join(","));
    const winnaar = pa.status === 200 ? await pa.json() as any : await pb.json() as any;
    const raceGet = await (await api(`/declaraties/${declRace.id}`)).json() as any;
    check("eindstand = toewijzing van de winnaar", raceGet.doorgezet_naar === winnaar.doorgezet_naar);
  } finally {
    // Opruimen (ook salarismutatie van de goedkeuring)
    await db.delete(salarisMutatiesTable).where(eq(salarisMutatiesTable.declaratieId, decl.id));
    await db.delete(declaratiesTable).where(eq(declaratiesTable.id, decl.id));
    await db.delete(declaratiesTable).where(eq(declaratiesTable.id, declConcept.id));
    await db.delete(declaratiesTable).where(eq(declaratiesTable.id, declRace.id));
    await db.delete(medewerkersTable).where(eq(medewerkersTable.id, mw.id));
    for (const g of [beoordelaar.id, beoordelaar2.id, leek.id, eigenaarGebruiker.id]) {
      await db.delete(gebruikersTable).where(eq(gebruikersTable.id, g));
    }
  }

  console.log(`\nResultaat: ${geslaagd} geslaagd, ${mislukt} mislukt`);
  if (mislukt > 0) process.exit(1);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
