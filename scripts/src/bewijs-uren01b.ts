// Gedragsbewijs UREN_01 §6b — uren boeken op een uurcode.
// Acceptatie-eisen §9 (11 t/m 14 + 12b), via HTTP tegen de lokale api-server:
//   11. Uurcode verplicht bij uren op een opdracht; kantooruur zonder opdracht niet.
//   12. Keuzelijst toont ALLEEN de uurcodes uit de werkbegroting van die opdracht,
//       plus de indirecte werkzaamheden als aparte groep.
//   12b. Indirecte lijst is te beheren zonder code: toevoegen, hernoemen,
//        inactief zetten — reeds geschreven uren blijven intact; gebruikt = niet verwijderbaar.
//   13. Begroot tegenover geschreven per uurcode zichtbaar (minstens 2 codes).
//   14. "Staat niet in de begroting" wordt geaccepteerd én levert een signaal
//       bij de werkvoorbereider op.
// Draaien: pnpm --filter @workspace/scripts exec tsx src/bewijs-uren01b.ts
import bcrypt from "bcryptjs";
import { eq, inArray, sql } from "drizzle-orm";
import { authenticator } from "otplib";
import { db, gebruikersTable, medewerkersTable } from "@workspace/db";
import {
  urenRegistratiesTable, weekStatenTable, projectenTable, opdrachtenTable,
  projectBegrotingenTable, werkbegrotingRegelsTable, modCalcNormtijdenTable,
  indirecteWerkzaamhedenTable, verlofAanvragenTable, medewerkerAanstellingenTable,
} from "@workspace/db/schema";

const BASIS = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
const TOTP = "MFRGGZDFMZTWQ2LK";
const WW = "BewijsUren01b!2026";

if (process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === "production") {
  throw new Error("GEWEIGERD: bewijsscript nooit tegen productie draaien.");
}

function check(naam: string, conditie: boolean, detail?: unknown): void {
  if (!conditie) { console.error(`✗ FAALT: ${naam}`, detail ?? ""); throw new Error(naam); }
  console.log(`✓ ${naam}`);
}

const aangemaakt = {
  gebruikers: [] as number[], medewerkers: [] as number[], projecten: [] as number[],
  opdrachten: [] as number[], normtijden: [] as number[], indirect: [] as number[],
};

async function maakGebruiker(email: string, naam: string, rol: string, extra: Record<string, unknown> = {}): Promise<number> {
  const [oud] = await db.select({ id: gebruikersTable.id }).from(gebruikersTable).where(eq(gebruikersTable.email, email));
  if (oud) {
    const [m] = await db.select({ id: medewerkersTable.id }).from(medewerkersTable).where(eq(medewerkersTable.gebruikerId, oud.id));
    if (m) await ruimMedewerkerOp(m.id);
    await db.delete(gebruikersTable).where(eq(gebruikersTable.id, oud.id));
  }
  const [g] = await db.insert(gebruikersTable).values({
    naam, email, rol, wachtwoord: await bcrypt.hash(WW, 10),
    totpSecret: TOTP, tweeFactorIngeschakeld: true, actief: true, ...extra,
  } as typeof gebruikersTable.$inferInsert).returning({ id: gebruikersTable.id });
  aangemaakt.gebruikers.push(g.id);
  return g.id;
}

async function ruimMedewerkerOp(mid: number): Promise<void> {
  await db.delete(urenRegistratiesTable).where(eq(urenRegistratiesTable.medewerkerId, mid));
  await db.delete(weekStatenTable).where(eq(weekStatenTable.medewerkerId, mid));
  await db.delete(verlofAanvragenTable).where(eq(verlofAanvragenTable.medewerkerId, mid));
  await db.delete(medewerkerAanstellingenTable).where(eq(medewerkerAanstellingenTable.medewerkerId, mid));
  await db.delete(medewerkersTable).where(eq(medewerkersTable.id, mid));
}

async function login(email: string): Promise<Record<string, string>> {
  const r = await fetch(`${BASIS}/auth/mobile/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, wachtwoord: WW, code: authenticator.generate(TOTP) }),
  });
  if (r.status !== 200) throw new Error(`login ${email} faalde: ${r.status} ${await r.text()}`);
  const j = await r.json() as { token: string };
  return { Authorization: `Bearer ${j.token}`, "Content-Type": "application/json" };
}

async function postUren(auth: Record<string, string>, body: Record<string, unknown>) {
  const r = await fetch(`${BASIS}/uren`, { method: "POST", headers: auth, body: JSON.stringify({ pauze_minuten: 0, werkzaamheden: "bewijs UREN_01b", ...body }) });
  return { status: r.status, body: await r.json().catch(() => ({})) as Record<string, unknown> };
}

async function main(): Promise<void> {
  // ── Opzet: monteur, WVB, beheerder-met-projecten-3, opdracht + begroting ───
  const monteurGid = await maakGebruiker("bewijs-uren01b-monteur@fps.local", "Bewijs Uren01b Monteur", "gebruiker", { bevoegdheden: { gebouwen: 1, projecten: 1 } });
  const wvbGid = await maakGebruiker("bewijs-uren01b-wvb@fps.local", "Bewijs Uren01b WVB", "gebruiker", { bevoegdheden: { projecten: 3 }, functietitels: ["Werkvoorbereider"] });
  void wvbGid;
  const beheerGid = await maakGebruiker("bewijs-uren01b-beheer@fps.local", "Bewijs Uren01b Beheer", "gebruiker", { bevoegdheden: { projecten: 3 } });
  void beheerGid;
  const [m] = await db.insert(medewerkersTable).values({
    gebruikerId: monteurGid, naam: "Bewijs Uren01b Monteur",
    cao: "Metaal & Techniek", dienstverband: "vast", contracturenPerWeek: 38,
  } as typeof medewerkersTable.$inferInsert).returning({ id: medewerkersTable.id });
  const mid = m.id; aangemaakt.medewerkers.push(mid);

  const [proj] = await db.insert(projectenTable).values({ naam: "Bewijs UREN_01b project", status: "actief" } as typeof projectenTable.$inferInsert).returning({ id: projectenTable.id });
  aangemaakt.projecten.push(proj.id);
  const [opdracht] = await db.insert(opdrachtenTable).values({ titel: "Bewijs UREN_01b opdracht", projectId: proj.id } as typeof opdrachtenTable.$inferInsert).returning({ id: opdrachtenTable.id });
  aangemaakt.opdrachten.push(opdracht.id);

  // Twee uurcodes in de begroting, één daarbuiten.
  const norm = await db.insert(modCalcNormtijdenTable).values([
    { code: "9.01", omschrijving: "Bewijs doorvoering afdichten", eenheid: "st", urenPerEenheid: 0.5 },
    { code: "9.02", omschrijving: "Bewijs brandklep monteren", eenheid: "st", urenPerEenheid: 2 },
    { code: "9.99", omschrijving: "Bewijs NIET in begroting", eenheid: "st", urenPerEenheid: 1 },
  ] as (typeof modCalcNormtijdenTable.$inferInsert)[]).returning({ id: modCalcNormtijdenTable.id, code: modCalcNormtijdenTable.code });
  aangemaakt.normtijden.push(...norm.map((n) => n.id));
  const [begroting] = await db.insert(projectBegrotingenTable).values({ projectId: proj.id, opdrachtId: opdracht.id, omschrijving: "Bewijs begroting" } as typeof projectBegrotingenTable.$inferInsert).returning({ id: projectBegrotingenTable.id });
  await db.insert(werkbegrotingRegelsTable).values([
    { begrotingId: begroting.id, normtijdId: norm[0].id, categorie: "arbeid", omschrijving: "Doorvoeringen", eenheid: "st", hoeveelheid: 20, bijgewerktOp: new Date() },
    { begrotingId: begroting.id, normtijdId: norm[1].id, categorie: "arbeid", omschrijving: "Brandkleppen", eenheid: "st", hoeveelheid: 3, bijgewerktOp: new Date() },
  ] as (typeof werkbegrotingRegelsTable.$inferInsert)[]);

  const monteur = await login("bewijs-uren01b-monteur@fps.local");
  const beheer = await login("bewijs-uren01b-beheer@fps.local");

  // ── 11. Uurcode verplicht op een opdracht; kantooruur niet ────────────────
  const zonderCode = await postUren(monteur, { datum: "2026-07-20", begin_tijd: "07:00", eind_tijd: "15:00", opdracht_id: opdracht.id, project_id: proj.id });
  check("uren op opdracht ZONDER werksoort → 400 UURCODE_VEREIST", zonderCode.status === 400 && zonderCode.body.code === "UURCODE_VEREIST", zonderCode);
  const kantoor = await postUren(monteur, { datum: "2026-07-20", begin_tijd: "07:00", eind_tijd: "11:00" });
  check("kantooruur zonder opdracht wordt gewoon geaccepteerd", kantoor.status === 201, kantoor);

  // ── 12. Keuzelijst = begrotingscodes van DEZE opdracht + indirecte groep ──
  const lijstR = await fetch(`${BASIS}/opdrachten/${opdracht.id}/uurcodes`, { headers: monteur });
  const lijst = await lijstR.json() as { begroting: { normtijd_id: number; code: string }[]; indirect: { id: number; naam: string }[] };
  check("keuzelijst bevat precies de 2 begrote codes (9.01, 9.02)", lijst.begroting.length === 2 && lijst.begroting.map((b) => b.code).join(",") === "9.01,9.02", lijst.begroting);
  check("code 9.99 (niet begroot) staat er NIET in", !lijst.begroting.some((b) => b.code === "9.99"));
  check("indirecte werkzaamheden vormen een aparte groep (o.a. Reistijd)", lijst.indirect.some((i) => i.naam === "Reistijd"), lijst.indirect);

  // Uurcode buiten de begroting wordt geweigerd; uit de begroting geaccepteerd.
  const fouteCode = await postUren(monteur, { datum: "2026-07-21", begin_tijd: "07:00", eind_tijd: "15:00", opdracht_id: opdracht.id, project_id: proj.id, normtijd_id: norm[2].id });
  check("uurcode die niet in de begroting staat → 400", fouteCode.status === 400 && String(fouteCode.body.error).includes("werkbegroting"), fouteCode);
  const goed1 = await postUren(monteur, { datum: "2026-07-21", begin_tijd: "07:00", eind_tijd: "13:00", opdracht_id: opdracht.id, project_id: proj.id, normtijd_id: norm[0].id });
  check("6u op code 9.01 geaccepteerd", goed1.status === 201, goed1);
  const goed2 = await postUren(monteur, { datum: "2026-07-21", begin_tijd: "13:00", eind_tijd: "15:00", opdracht_id: opdracht.id, project_id: proj.id, normtijd_id: norm[1].id });
  check("2u op code 9.02 geaccepteerd", goed2.status === 201, goed2);

  // ── 12b. Indirecte lijst beheren zonder code ──────────────────────────────
  const nieuw = await fetch(`${BASIS}/indirecte-werkzaamheden`, { method: "POST", headers: beheer, body: JSON.stringify({ naam: "Bewijs keet opbouwen", volgorde: 99 }) });
  const nieuwJ = await nieuw.json() as { id: number; naam: string };
  check("toevoegen via API (beheerscherm) werkt (201)", nieuw.status === 201 && nieuwJ.naam === "Bewijs keet opbouwen", nieuwJ);
  aangemaakt.indirect.push(nieuwJ.id);
  // uren op de nieuwe indirecte code
  const indirectUren = await postUren(monteur, { datum: "2026-07-22", begin_tijd: "07:00", eind_tijd: "09:00", opdracht_id: opdracht.id, project_id: proj.id, indirecte_werkzaamheid_id: nieuwJ.id });
  check("2u op de nieuwe indirecte werkzaamheid geaccepteerd", indirectUren.status === 201, indirectUren);
  const hernoem = await fetch(`${BASIS}/indirecte-werkzaamheden/${nieuwJ.id}`, { method: "PATCH", headers: beheer, body: JSON.stringify({ naam: "Bewijs keet op- en afbouwen" }) });
  check("hernoemen werkt", hernoem.status === 200 && ((await hernoem.json()) as { naam: string }).naam === "Bewijs keet op- en afbouwen");
  const inactief = await fetch(`${BASIS}/indirecte-werkzaamheden/${nieuwJ.id}`, { method: "PATCH", headers: beheer, body: JSON.stringify({ actief: false }) });
  check("inactief zetten werkt", inactief.status === 200);
  const [intact] = await db.select().from(urenRegistratiesTable).where(eq(urenRegistratiesTable.indirecteWerkzaamheidId, nieuwJ.id));
  check("reeds geschreven uren op de inactieve code blijven intact", !!intact && Math.abs(intact.nettoUren - 2) < 1e-9, intact);
  const inactiefKiezen = await postUren(monteur, { datum: "2026-07-22", begin_tijd: "09:00", eind_tijd: "10:00", opdracht_id: opdracht.id, project_id: proj.id, indirecte_werkzaamheid_id: nieuwJ.id });
  check("inactieve code is niet meer kiesbaar (400)", inactiefKiezen.status === 400, inactiefKiezen);
  const verwijderGebruikt = await fetch(`${BASIS}/indirecte-werkzaamheden/${nieuwJ.id}`, { method: "DELETE", headers: beheer });
  check("gebruikte code kan NIET verwijderd worden (409)", verwijderGebruikt.status === 409, verwijderGebruikt.status);
  const monteurBeheer = await fetch(`${BASIS}/indirecte-werkzaamheden`, { method: "POST", headers: monteur, body: JSON.stringify({ naam: "mag niet" }) });
  check("monteur mag de lijst niet beheren (403)", monteurBeheer.status === 403, monteurBeheer.status);

  // ── 13. Begroot tegenover geschreven per uurcode ──────────────────────────
  const overzichtR = await fetch(`${BASIS}/opdrachten/${opdracht.id}/uren-per-uurcode`, { headers: beheer });
  const overzicht = await overzichtR.json() as { codes: { code: string; begroot_uren: number; geschreven_uren: number }[]; indirect: { naam: string; geschreven_uren: number }[]; niet_in_begroting_uren: number };
  const c1 = overzicht.codes.find((c) => c.code === "9.01");
  const c2 = overzicht.codes.find((c) => c.code === "9.02");
  check("overzicht: 9.01 begroot 10u (20×0,5), geschreven 6u", !!c1 && Math.abs(c1.begroot_uren - 10) < 1e-9 && Math.abs(c1.geschreven_uren - 6) < 1e-9, c1);
  check("overzicht: 9.02 begroot 6u (3×2), geschreven 2u", !!c2 && Math.abs(c2.begroot_uren - 6) < 1e-9 && Math.abs(c2.geschreven_uren - 2) < 1e-9, c2);
  check("indirecte uren apart zichtbaar (2u keet)", overzicht.indirect.some((i) => Math.abs(i.geschreven_uren - 2) < 1e-9), overzicht.indirect);

  // ── 14. "Staat niet in de begroting" = geaccepteerd + signaal WVB ─────────
  const buiten = await postUren(monteur, { datum: "2026-07-23", begin_tijd: "07:00", eind_tijd: "09:00", opdracht_id: opdracht.id, project_id: proj.id, niet_in_begroting: true, niet_in_begroting_omschrijving: "Extra sparing dichtzetten na leidingwerk derden" });
  check("urenregel 'niet in begroting' wordt geaccepteerd (201)", buiten.status === 201, buiten);
  const zonderUitleg = await postUren(monteur, { datum: "2026-07-23", begin_tijd: "09:00", eind_tijd: "10:00", opdracht_id: opdracht.id, project_id: proj.id, niet_in_begroting: true });
  check("zonder korte omschrijving → 400", zonderUitleg.status === 400, zonderUitleg);
  const signalen = await db.execute(sql`SELECT id, titel FROM werkbak_items WHERE bron = 'uren_niet_in_begroting'`);
  const sr = (signalen as unknown as { rows?: { titel: string }[] }).rows ?? (signalen as unknown as { titel: string }[]);
  check("signaal bij de werkvoorbereider geplaatst", Array.isArray(sr) && sr.length >= 1, sr);
  const naToets = await fetch(`${BASIS}/opdrachten/${opdracht.id}/uren-per-uurcode`, { headers: beheer });
  const naJ = await naToets.json() as { niet_in_begroting_uren: number };
  check("2u 'niet in begroting' apart geteld in het overzicht", Math.abs(naJ.niet_in_begroting_uren - 2) < 1e-9, naJ);

  console.log("\nAlle UREN_01 §6b-bewijzen geslaagd.");
}

async function opruimen(): Promise<void> {
  for (const mid of aangemaakt.medewerkers) await ruimMedewerkerOp(mid);
  await db.execute(sql`DELETE FROM werkbak_items WHERE bron = 'uren_niet_in_begroting'`);
  if (aangemaakt.opdrachten.length) {
    const begr = await db.select({ id: projectBegrotingenTable.id }).from(projectBegrotingenTable).where(inArray(projectBegrotingenTable.opdrachtId, aangemaakt.opdrachten));
    if (begr.length) await db.delete(werkbegrotingRegelsTable).where(inArray(werkbegrotingRegelsTable.begrotingId, begr.map((b) => b.id)));
    await db.delete(projectBegrotingenTable).where(inArray(projectBegrotingenTable.opdrachtId, aangemaakt.opdrachten));
    await db.delete(opdrachtenTable).where(inArray(opdrachtenTable.id, aangemaakt.opdrachten));
  }
  if (aangemaakt.projecten.length) await db.delete(projectenTable).where(inArray(projectenTable.id, aangemaakt.projecten));
  if (aangemaakt.normtijden.length) await db.delete(modCalcNormtijdenTable).where(inArray(modCalcNormtijdenTable.id, aangemaakt.normtijden));
  if (aangemaakt.indirect.length) {
    await db.delete(indirecteWerkzaamhedenTable).where(inArray(indirecteWerkzaamhedenTable.id, aangemaakt.indirect));
  }
  if (aangemaakt.gebruikers.length) await db.delete(gebruikersTable).where(inArray(gebruikersTable.id, aangemaakt.gebruikers));
}

main()
  .then(async () => { await opruimen(); process.exit(0); })
  .catch(async (e) => { console.error(e); await opruimen().catch(() => {}); process.exit(1); });
