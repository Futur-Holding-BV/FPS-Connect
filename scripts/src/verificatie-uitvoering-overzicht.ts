/**
 * Uitvoering — gedragsbewijs voor GET /uitvoering/overzicht.
 *
 * Bewijst:
 *  U1. Hoofdbeheerder ziet een opdracht in fase 'uitvoering' terug in het
 *      overzicht, met juiste tellingen: stappen voltooid/totaal, onbesliste
 *      afwijkingen, wachtende materiaalaanvragen en open werkbakitems.
 *  U2. Behandelde materiaalaanvraag en afgehandeld werkbakitem tellen NIET mee
 *      (nul is een antwoord).
 *  U3. Gebruiker zonder projecten-recht krijgt 403 (fail-closed).
 *  U4. Opdracht in fase 'werkvoorbereiding' verschijnt niet in het overzicht.
 *
 * Draaien: pnpm --filter @workspace/scripts exec tsx src/verificatie-uitvoering-overzicht.ts
 */
import "./lib/prodGuard";
import bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import {
  db, gebruikersTable, opdrachtenTable, pimModellenTable,
  pimUitvoeringStappenTable, materiaalAanvragenTable, werkbakItemsTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

const BASIS = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
const WACHTWOORD = "UitvoeringBewijs!2026";

const ACCOUNTS = {
  admin: { email: "uitv-overzicht-admin@fps.local", totp: "UITVADMIN2345678", rol: "hoofdbeheerder" as const, bevoegdheden: {} as Record<string, number> },
  zonder: { email: "uitv-overzicht-zonder@fps.local", totp: "UITVZONDER234567", rol: "gebruiker" as const, bevoegdheden: { gebouwen: 1 } },
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
    naam: `Uitvoering-bewijs (${a.email.split("@")[0]})`,
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

interface OverzichtRij {
  id: number; titel: string; fase: string;
  stappen_totaal: number; stappen_voltooid: number;
  onbesliste_afwijkingen: number; wachtende_materiaal_aanvragen: number; open_werkbak_items: number;
}

async function main() {
  const opdrachtIds: number[] = [];
  try {
    await Promise.all([maakGebruiker(ACCOUNTS.admin), maakGebruiker(ACCOUNTS.zonder)]);

    // Testopdracht in uitvoering + één in werkvoorbereiding.
    const [opdracht] = await db.insert(opdrachtenTable).values({
      titel: "BEWIJS uitvoering-overzicht", werknummer: "BW-UITV-1",
      opdrachtgever: "Bewijs BV", status: "actief", aiFase: "uitvoering",
    }).returning({ id: opdrachtenTable.id });
    const [wv] = await db.insert(opdrachtenTable).values({
      titel: "BEWIJS wv-fase", status: "actief", aiFase: "werkvoorbereiding",
    }).returning({ id: opdrachtenTable.id });
    opdrachtIds.push(opdracht.id, wv.id);

    // PIM met 3 stappen: 1 voltooid, 1 actief, 1 afgeweken zonder beslissing.
    const [pim] = await db.insert(pimModellenTable).values({ opdrachtId: opdracht.id }).returning({ id: pimModellenTable.id });
    await db.insert(pimUitvoeringStappenTable).values([
      { pimId: pim.id, volgorde: 1, status: "voltooid" },
      { pimId: pim.id, volgorde: 2, status: "actief" },
      { pimId: pim.id, volgorde: 3, status: "afgeweken", afwijkingJson: { reden: "bewijs", beslissing: null } },
    ]);

    // Materiaal: één wachtend ('nieuw'), één behandeld.
    await db.insert(materiaalAanvragenTable).values([
      { opdrachtId: opdracht.id, reden: "nodig", status: "nieuw" },
      { opdrachtId: opdracht.id, reden: "nodig", status: "goedgekeurd" },
    ]);

    // Werkbak: één open, één afgehandeld.
    await db.insert(werkbakItemsTable).values([
      { soort: "doen", bron: "bewijs", titel: "BEWIJS open item", gewicht: 1, herkomstType: "opdracht", herkomstId: opdracht.id, status: "open", dedupSleutel: `bewijs-uitv-open-${opdracht.id}` },
      { soort: "doen", bron: "bewijs", titel: "BEWIJS dicht item", gewicht: 1, herkomstType: "opdracht", herkomstId: opdracht.id, status: "afgehandeld", dedupSleutel: `bewijs-uitv-dicht-${opdracht.id}` },
    ]);

    // U1+U2: admin haalt overzicht op.
    const hAdmin = await login(ACCOUNTS.admin);
    const resp = await fetch(`${BASIS}/uitvoering/overzicht`, { headers: hAdmin });
    if (resp.status !== 200) faal(`U1 overzicht → ${resp.status}: ${await resp.text()}`);
    const body = (await resp.json()) as { opdrachten: OverzichtRij[] };
    const rij = body.opdrachten.find((o) => o.id === opdracht.id);
    if (!rij) faal("U1 opdracht in uitvoering ontbreekt in overzicht");
    if (rij.stappen_totaal !== 3 || rij.stappen_voltooid !== 1) faal(`U1 stappen ${rij.stappen_voltooid}/${rij.stappen_totaal}, verwacht 1/3`);
    if (rij.onbesliste_afwijkingen !== 1) faal(`U1 onbesliste_afwijkingen=${rij.onbesliste_afwijkingen}, verwacht 1`);
    ok("U1 opdracht zichtbaar met juiste stappen- en afwijkingstelling (1/3, 1 onbeslist)");
    if (rij.wachtende_materiaal_aanvragen !== 1) faal(`U2 wachtende_materiaal_aanvragen=${rij.wachtende_materiaal_aanvragen}, verwacht 1`);
    if (rij.open_werkbak_items !== 1) faal(`U2 open_werkbak_items=${rij.open_werkbak_items}, verwacht 1`);
    ok("U2 behandelde aanvraag en afgehandeld werkbakitem tellen niet mee (beide 1)");

    // U3: zonder projecten-recht → 403.
    const hZonder = await login(ACCOUNTS.zonder);
    const resp403 = await fetch(`${BASIS}/uitvoering/overzicht`, { headers: hZonder });
    if (resp403.status !== 403) faal(`U3 verwacht 403, kreeg ${resp403.status}`);
    ok("U3 gebruiker zonder projecten-recht krijgt 403 (fail-closed)");

    // U4: wv-fase-opdracht ontbreekt.
    if (body.opdrachten.some((o) => o.id === wv.id)) faal("U4 opdracht in werkvoorbereiding staat onterecht in het overzicht");
    ok("U4 opdracht in werkvoorbereidingsfase verschijnt niet");

    console.log("\n✅ ALLE BEWIJZEN GESLAAGD");
  } finally {
    // Opruimen: testdata + accounts archiveren.
    if (opdrachtIds.length > 0) {
      await db.delete(werkbakItemsTable).where(inArray(werkbakItemsTable.herkomstId, opdrachtIds));
      await db.delete(opdrachtenTable).where(inArray(opdrachtenTable.id, opdrachtIds)); // cascade ruimt pim/materiaal op
    }
    await db.update(gebruikersTable).set({ actief: false, gearchiveerd: true })
      .where(inArray(gebruikersTable.email, [ACCOUNTS.admin.email, ACCOUNTS.zonder.email]));
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
