/**
 * Task 825 gedragsbewijs — legacy storage-paden krijgen een gebouw-koppeling.
 *
 * Legacy/ongescoopte paden (/objects/uploads/... of /objects/algemeen/...)
 * hebben geen gebouw-id in het pad. De storage-ACL leidt de gebouw-koppeling
 * nu af uit de database-registraties (fotos→voorzieningen, tekeningen,
 * verdiepingen, opnamefoto's, AI-spotvoorstellen) en dwingt dezelfde
 * gebouw-ACL af als voor gestructureerde paden.
 *
 * Bewijst:
 *  L1. Beperkte medewerker (toegewezen aan gebouw A) krijgt 403 op een legacy
 *      pad dat via tekeningen aan gebouw B is gekoppeld (kruistoegang dicht).
 *  L2. Zelfde voor een legacy pad gekoppeld via spotfoto's (fotos→voorziening).
 *  L3. Eigen gebouw blijft werken: legacy pad gekoppeld aan gebouw A geeft
 *      GEEN 403 voor de beperkte medewerker (404 want bestand bestaat niet).
 *  L4. Ongekoppeld legacy pad blijft leesbaar voor medewerkers (geen 403).
 *  L5. Hoofdbeheerder blijft alles zien (geen 403 op het gebouw-B-pad).
 *  L6. Klant blijft dicht op elk legacy pad (403), ook op eigen gebouw.
 *  L7. Thumbnails-route hanteert dezelfde regels als objects-route.
 *
 * Draaien: pnpm --filter @workspace/scripts exec tsx src/verificatie-legacy-bestand-acl.ts
 */
import bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import { randomUUID } from "crypto";
import {
  db, gebruikersTable, gebouwenTable, gebouwToewijzingenTable,
  tekeningenTable, voorzieningenTable, fotosTable,
} from "@workspace/db";
import { eq, inArray, like } from "drizzle-orm";

const BASIS = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
const WACHTWOORD = "LegacyAcl!2026";

const ACCOUNTS = {
  veld: { email: "legacy-acl-veld@fps.local", totp: "LEGACYVELD234567", rol: "gebruiker" as const, bevoegdheden: { gebouwen: 1, voorzieningen: 2 } },
  admin: { email: "legacy-acl-admin@fps.local", totp: "LEGACYADMIN23456", rol: "hoofdbeheerder" as const, bevoegdheden: {} },
  klant: { email: "legacy-acl-klant@fps.local", totp: "LEGACYKLANT23456", rol: "klant" as const, bevoegdheden: {} }, // klantloos-ok: verificatiescript bewijst dat klant-rol 403 geeft
};

function faal(msg: string): never { console.error(`❌ FAAL: ${msg}`); process.exit(1); }
function ok(msg: string) { console.log(`✅ ${msg}`); }

async function maakGebruiker(a: { email: string; totp: string; rol: string; bevoegdheden: Record<string, number> }): Promise<number> {
  if (process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === "production") throw new Error("GEWEIGERD: testaccounts alleen in dev");
  const hash = await bcrypt.hash(WACHTWOORD, 10);
  const [bestaand] = await db.select({ id: gebruikersTable.id }).from(gebruikersTable).where(eq(gebruikersTable.email, a.email));
  if (bestaand) {
    await db.update(gebruikersTable).set({ wachtwoord: hash, rol: a.rol, bevoegdheden: a.bevoegdheden, actief: true, gearchiveerd: false, totpSecret: a.totp, tweeFactorIngeschakeld: true }).where(eq(gebruikersTable.id, bestaand.id));
    return bestaand.id;
  }
  const [rij] = await db.insert(gebruikersTable).values({
    naam: `Legacy-ACL test (${a.email.split("@")[0]})`,
    email: a.email, wachtwoord: hash, rol: a.rol, bevoegdheden: a.bevoegdheden,
    actief: true, totpSecret: a.totp, tweeFactorIngeschakeld: true,
  }).returning({ id: gebruikersTable.id });
  return rij.id;
}

async function login(a: { email: string; totp: string }): Promise<Record<string, string>> {
  const resp = await fetch(`${BASIS}/auth/mobile/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: a.email, wachtwoord: WACHTWOORD, code: authenticator.generate(a.totp) }),
  });
  if (!resp.ok) faal(`login ${a.email} → ${resp.status}: ${await resp.text()}`);
  const { token } = (await resp.json()) as { token: string };
  return { Authorization: `Bearer ${token}` };
}

async function status(h: Record<string, string>, pad: string): Promise<number> {
  const resp = await fetch(`${BASIS}${pad}`, { headers: h });
  // Body afvoeren zodat de verbinding netjes sluit.
  await resp.arrayBuffer().catch(() => undefined);
  return resp.status;
}

async function main() {
  const [idVeld, idAdmin, idKlant] = await Promise.all([
    maakGebruiker(ACCOUNTS.veld), maakGebruiker(ACCOUNTS.admin), maakGebruiker(ACCOUNTS.klant),
  ]);

  async function maakGebouw(naam: string): Promise<number> {
    const [bestaand] = await db.select({ id: gebouwenTable.id }).from(gebouwenTable).where(eq(gebouwenTable.naam, naam));
    if (bestaand) return bestaand.id;
    const [rij] = await db.insert(gebouwenTable).values({ naam, adres: "Teststraat 2", stad: "Testdam" }).returning({ id: gebouwenTable.id });
    return rij.id;
  }
  const gebouwA = await maakGebouw("Legacy-ACL Gebouw A");
  const gebouwB = await maakGebouw("Legacy-ACL Gebouw B");

  // Toewijzingen: veldgebruiker en klant alleen op gebouw A.
  await db.delete(gebouwToewijzingenTable).where(inArray(gebouwToewijzingenTable.gebruikerId, [idVeld, idKlant]));
  await db.insert(gebouwToewijzingenTable).values([
    { gebouwId: gebouwA, gebruikerId: idVeld },
    { gebouwId: gebouwA, gebruikerId: idKlant },
  ]);

  // Legacy paden (bestanden hoeven niet echt te bestaan: de ACL draait vóór
  // de storage-fetch, dus 403 vs 404 onderscheidt afscherming van afwezigheid).
  const padB_tekening = `/objects/uploads/legacy-acl-${randomUUID()}`;
  const padB_spotfoto = `/objects/uploads/legacy-acl-${randomUUID()}`;
  const padA_eigen = `/objects/uploads/legacy-acl-${randomUUID()}`;
  const padOngekoppeld = `/objects/uploads/legacy-acl-${randomUUID()}`;

  // Oude testrestanten opruimen, dan registraties aanmaken.
  await db.delete(fotosTable).where(like(fotosTable.url, "/objects/uploads/legacy-acl-%"));
  await db.delete(tekeningenTable).where(like(tekeningenTable.url, "/objects/uploads/legacy-acl-%"));
  await db.delete(voorzieningenTable).where(like(voorzieningenTable.locatieOmschrijving, "Legacy-ACL testspot%"));

  await db.insert(tekeningenTable).values([
    { gebouwId: gebouwB, naam: "Legacy-ACL tekening B", type: "tekening", url: padB_tekening, zichtbaarMonteur: true },
    { gebouwId: gebouwA, naam: "Legacy-ACL tekening A", type: "tekening", url: padA_eigen, zichtbaarMonteur: true },
  ]);
  const [spotB] = await db.insert(voorzieningenTable).values({
    gebouwId: gebouwB, objectnummer: `LEGACY-ACL-${Date.now()}`, locatieOmschrijving: "Legacy-ACL testspot B", type: "doorvoer",
  }).returning({ id: voorzieningenTable.id });
  await db.insert(fotosTable).values({ voorzieningId: spotB.id, fase: "voor", url: padB_spotfoto });

  const [hVeld, hAdmin, hKlant] = await Promise.all([
    login(ACCOUNTS.veld), login(ACCOUNTS.admin), login(ACCOUNTS.klant),
  ]);

  try {
    // L1: kruistoegang via tekeningen-koppeling dicht.
    const l1 = await status(hVeld, `/storage/objects${padB_tekening.slice("/objects".length)}`);
    if (l1 !== 403) faal(`L1: legacy pad gekoppeld aan gebouw B gaf ${l1} voor beperkte medewerker, verwacht 403`);
    ok("L1 kruistoegang via tekeningen-koppeling: 403 voor beperkte medewerker");

    // L2: kruistoegang via spotfoto-koppeling dicht.
    const l2 = await status(hVeld, `/storage/objects${padB_spotfoto.slice("/objects".length)}`);
    if (l2 !== 403) faal(`L2: legacy spotfoto-pad gebouw B gaf ${l2}, verwacht 403`);
    ok("L2 kruistoegang via spotfoto-koppeling (fotos→voorziening): 403");

    // L3: eigen gebouw blijft werken (geen 403; 404 want bestand bestaat niet).
    const l3 = await status(hVeld, `/storage/objects${padA_eigen.slice("/objects".length)}`);
    if (l3 === 403) faal("L3: legacy pad van EIGEN gebouw is dicht voor de toegewezen medewerker (regressie)");
    ok(`L3 eigen gebouw: geen 403 voor toegewezen medewerker (${l3})`);

    // L4: ongekoppeld legacy pad blijft leesbaar voor medewerkers.
    const l4 = await status(hVeld, `/storage/objects${padOngekoppeld.slice("/objects".length)}`);
    if (l4 === 403) faal("L4: ongekoppeld legacy pad is dicht voor medewerker (regressie)");
    ok(`L4 ongekoppeld pad: geen 403 voor medewerker (${l4})`);

    // L5: hoofdbeheerder onbeperkt.
    const l5 = await status(hAdmin, `/storage/objects${padB_tekening.slice("/objects".length)}`);
    if (l5 === 403) faal("L5: hoofdbeheerder krijgt 403 op gekoppeld legacy pad (regressie)");
    ok(`L5 hoofdbeheerder: geen 403 (${l5})`);

    // L6: klant blijft dicht op elk legacy pad, ook van eigen gebouw.
    for (const pad of [padB_tekening, padA_eigen, padOngekoppeld]) {
      const s = await status(hKlant, `/storage/objects${pad.slice("/objects".length)}`);
      if (s !== 403) faal(`L6: klant kreeg ${s} op legacy pad ${pad}, verwacht 403`);
    }
    ok("L6 klant: alle legacy paden 403 (KLANT_01 ongewijzigd)");

    // L7: thumbnails-route zelfde regels.
    const l7dicht = await status(hVeld, `/storage/thumbnails${padB_tekening.slice("/objects".length)}`);
    if (l7dicht !== 403) faal(`L7: thumbnail van gebouw-B-pad gaf ${l7dicht}, verwacht 403`);
    const l7open = await status(hVeld, `/storage/thumbnails${padA_eigen.slice("/objects".length)}`);
    if (l7open === 403) faal("L7: thumbnail van eigen-gebouw-pad is dicht (regressie)");
    ok("L7 thumbnails: zelfde ACL als objects-route");

    console.log("\n🎉 Legacy-bestand-ACL bewijs volledig geslaagd");
  } finally {
    // Opruimen: testregistraties weg, accounts deactiveren.
    await db.delete(fotosTable).where(like(fotosTable.url, "/objects/uploads/legacy-acl-%"));
    await db.delete(voorzieningenTable).where(eq(voorzieningenTable.id, spotB.id));
    await db.delete(tekeningenTable).where(like(tekeningenTable.url, "/objects/uploads/legacy-acl-%"));
    await db.update(gebruikersTable).set({ actief: false, gearchiveerd: true }).where(inArray(gebruikersTable.id, [idVeld, idAdmin, idKlant]));
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
