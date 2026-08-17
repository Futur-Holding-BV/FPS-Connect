// Gedragsbewijs UREN_01 — ADV, overwerkslot, tijd-voor-tijd-voorstel, weekcontrole.
// Acceptatie-eisen §9 (via HTTP tegen de lokale api-server + @workspace/db):
//   1. ADV Metaal/vast: 36u→0, 38u→0, 40u→2 ADV.
//   2. 44u zonder open slot → 422 OVERWERK_SLOT_DICHT (duidelijke melding, niets stil).
//   3. Slot openen kan alleen met einddatum + reden, door projectleider.
//   4. Met open slot slaagt 44u; respons bevat een tijd-voor-tijd-VOORSTEL
//      (niets wordt stilzwijgend vastgelegd) en ADV blijft 2.
//   5. Urenplafond: slot sluit vanzelf zodra het vol zit.
//   6. Toestemming vragen plaatst werkbak-items bij projectleider en René.
//   7. Weekcontrole: vakantieweek (verlof telt mee) geeft GEEN onvolledig-alarm.
// Draaien: pnpm --filter @workspace/scripts exec tsx src/bewijs-uren01.ts
import "./lib/prodGuard";
import bcrypt from "bcryptjs";
import { and, eq, inArray, sql } from "drizzle-orm";
import { authenticator } from "otplib";
import {
  db, gebruikersTable, medewerkersTable,
} from "@workspace/db";
import {
  urenRegistratiesTable, weekStatenTable, projectenTable,
  overwerkSlotenTable, verlofsoortenTable, verlofAanvragenTable,
  medewerkerAanstellingenTable,
} from "@workspace/db/schema";

const BASIS = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
const TOTP = "MFRGGZDFMZTWQ2LK";
const WW = "BewijsUren01!2026";

if (process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === "production") {
  throw new Error("GEWEIGERD: bewijsscript nooit tegen productie draaien.");
}

function check(naam: string, conditie: boolean, detail?: unknown): void {
  if (!conditie) { console.error(`✗ FAALT: ${naam}`, detail ?? ""); throw new Error(naam); }
  console.log(`✓ ${naam}`);
}

const aangemaakt = { gebruikers: [] as number[], medewerkers: [] as number[], projecten: [] as number[], verlofsoorten: [] as number[] };

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

// Uren voor een dag zetten: 07:00 + n uur, pauze 0.
function tijden(uren: number): { begin: string; eind: string } {
  const eindUur = 7 + Math.floor(uren);
  const min = Math.round((uren % 1) * 60);
  return { begin: "07:00", eind: `${String(eindUur).padStart(2, "0")}:${String(min).padStart(2, "0")}` };
}

async function postUren(auth: Record<string, string>, datum: string, uren: number, projectId?: number, projectNaam?: string) {
  const { begin, eind } = tijden(uren);
  const r = await fetch(`${BASIS}/uren`, {
    method: "POST", headers: auth,
    body: JSON.stringify({ datum, begin_tijd: begin, eind_tijd: eind, pauze_minuten: 0, project_id: projectId ?? null, project_naam: projectNaam ?? null, werkzaamheden: "bewijs UREN_01" }),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) as Record<string, unknown> };
}

async function wisUren(mid: number): Promise<void> {
  await db.delete(urenRegistratiesTable).where(eq(urenRegistratiesTable.medewerkerId, mid));
}

async function main(): Promise<void> {
  // ── Opzet ──────────────────────────────────────────────────────────────────
  const monteurGid = await maakGebruiker("bewijs-uren01-monteur@fps.local", "Bewijs Uren01 Monteur", "gebruiker", { bevoegdheden: { gebouwen: 1, projecten: 1 } });
  const plGid = await maakGebruiker("bewijs-uren01-pl@fps.local", "Bewijs Uren01 PL", "gebruiker", { bevoegdheden: { projecten: 3, personeel: 2 }, functietitels: ["Projectleider"] });
  const [m] = await db.insert(medewerkersTable).values({
    gebruikerId: monteurGid, naam: "Bewijs Uren01 Monteur",
    cao: "Metaal & Techniek", dienstverband: "vast", contracturenPerWeek: 38,
  } as typeof medewerkersTable.$inferInsert).returning({ id: medewerkersTable.id });
  const mid = m.id; aangemaakt.medewerkers.push(mid);
  const [proj] = await db.insert(projectenTable).values({ naam: "Bewijs UREN_01 project", status: "actief" } as typeof projectenTable.$inferInsert).returning({ id: projectenTable.id });
  aangemaakt.projecten.push(proj.id);
  const [proj2] = await db.insert(projectenTable).values({ naam: "Bewijs UREN_01 project 2", status: "actief" } as typeof projectenTable.$inferInsert).returning({ id: projectenTable.id });
  aangemaakt.projecten.push(proj2.id);

  const monteur = await login("bewijs-uren01-monteur@fps.local");
  const pl = await login("bewijs-uren01-pl@fps.local");

  // Vaste testweek in het verleden (ma 2026-07-13 t/m zo 2026-07-19, ISO-week 29).
  const dagen = ["2026-07-13", "2026-07-14", "2026-07-15", "2026-07-16", "2026-07-17"];
  const week = { jaar: 2026, week: 29 };

  // ── 1. ADV-staffel 36 / 38 / 40 ────────────────────────────────────────────
  for (const [totaal, verwacht] of [[36, 0], [38, 0], [40, 2]] as const) {
    await wisUren(mid);
    const perDag = totaal / 5;
    for (const d of dagen) {
      const r = await postUren(monteur, d, perDag);
      check(`uren ${perDag}u op ${d} geaccepteerd (weektotaal ${totaal})`, r.status === 201, r);
    }
    const mw = await fetch(`${BASIS}/uren/mijn-week?jaar=${week.jaar}&week=${week.week}`, { headers: monteur });
    const j = await mw.json() as { adv_uren: number; totaal_uren: number; adv_reden?: string | null };
    check(`ADV bij ${totaal}u = ${verwacht} (was: ${j.adv_uren})`, Math.abs(j.adv_uren - verwacht) < 1e-9, j);
  }

  // ── 2. 44u zonder slot → 422, duidelijke melding ───────────────────────────
  await wisUren(mid);
  for (const d of dagen.slice(0, 4)) await postUren(monteur, d, 10, proj.id, "Bewijs UREN_01 project");
  const geweigerd = await postUren(monteur, dagen[4], 4, proj.id, "Bewijs UREN_01 project");
  check("44e uur zonder open slot → 422", geweigerd.status === 422, geweigerd);
  check("weigering heeft code OVERWERK_SLOT_DICHT + boven_uren", geweigerd.body.code === "OVERWERK_SLOT_DICHT" && Number(geweigerd.body.boven_uren) === 4, geweigerd.body);
  check("weigering legt uit (niet stil)", String(geweigerd.body.error ?? "").includes("boven de 40"), geweigerd.body.error);

  // ── 3. Slot openen: einddatum + reden verplicht; monteur mag niet ──────────
  const zonderEind = await fetch(`${BASIS}/projecten/${proj.id}/overwerkslot/openen`, { method: "POST", headers: pl, body: JSON.stringify({ reden: "spoedklus" }) });
  check("slot zonder einddatum wordt geweigerd (400)", zonderEind.status === 400);
  const doorMonteur = await fetch(`${BASIS}/projecten/${proj.id}/overwerkslot/openen`, { method: "POST", headers: monteur, body: JSON.stringify({ geldig_van: "2026-07-13", geldig_tot: "2026-07-19", reden: "x" }) });
  check("monteur mag het slot niet openzetten (403)", doorMonteur.status === 403);
  const open = await fetch(`${BASIS}/projecten/${proj.id}/overwerkslot/openen`, {
    method: "POST", headers: pl,
    body: JSON.stringify({ geldig_van: "2026-07-13", geldig_tot: "2026-07-19", uren_plafond: 5, reden: "Spoedklus oplevering — bewijs UREN_01" }),
  });
  check("projectleider opent slot met einde+reden+plafond (201)", open.status === 201, await open.clone().text());

  // ── 4. Met open slot slaagt 44u; TvT-voorstel in respons; ADV blijft 2 ─────
  const gelukt = await postUren(monteur, dagen[4], 4, proj.id, "Bewijs UREN_01 project");
  check("44e uur mét open slot geaccepteerd (201)", gelukt.status === 201, gelukt);
  const ow = gelukt.body.overwerk as { boven_uren: number; tvt_voorstel?: { aantal_uren: number } } | null;
  check("respons bevat overwerk-blok met TvT-VOORSTEL van 4u", !!ow && Math.abs(ow.boven_uren - 4) < 1e-9 && ow.tvt_voorstel?.aantal_uren === 4, gelukt.body);
  const tvtRijen = await db.select().from(verlofAanvragenTable).where(eq(verlofAanvragenTable.medewerkerId, mid));
  check("er is NIETS stilzwijgend vastgelegd (0 verlofaanvragen)", tvtRijen.length === 0, tvtRijen.length);
  const mw44 = await fetch(`${BASIS}/uren/mijn-week?jaar=${week.jaar}&week=${week.week}`, { headers: monteur });
  const j44 = await mw44.json() as { adv_uren: number };
  check(`ADV bij 44u = 2 (was: ${j44.adv_uren})`, Math.abs(j44.adv_uren - 2) < 1e-9, j44);

  // ── 5. Plafond: verbruik geboekt (4 van 5); volgende 4u past niet meer ─────
  const slotRij = await db.select().from(overwerkSlotenTable).where(and(eq(overwerkSlotenTable.projectId, proj.id), eq(overwerkSlotenTable.status, "open")));
  check("slotverbruik = 4 van plafond 5", slotRij.length === 1 && Math.abs(slotRij[0].verbruikteUren - 4) < 1e-9, slotRij);
  const tePakken = await postUren(monteur, "2026-07-18", 4, proj.id, "Bewijs UREN_01 project");
  check("nog eens 4u past niet binnen het plafond → 422", tePakken.status === 422, tePakken);
  const eenUur = await postUren(monteur, "2026-07-18", 1, proj.id, "Bewijs UREN_01 project");
  check("1u (laatste plafondruimte) wél geaccepteerd", eenUur.status === 201, eenUur);
  const [slotNa] = await db.select().from(overwerkSlotenTable).where(eq(overwerkSlotenTable.projectId, proj.id));
  check("plafond vol → slot vanzelf gesloten", slotNa.status === "gesloten" && Math.abs(slotNa.verbruikteUren - 5) < 1e-9, slotNa);

  // ── 6. Overwerk op ander project (slot dicht) blijft geweigerd ─────────────
  const anderProject = await postUren(monteur, "2026-07-19", 2, proj2.id, "Bewijs UREN_01 project 2");
  check("overwerk op project zonder open slot → 422 (verdeling telt per project)", anderProject.status === 422, anderProject);

  // ── 7. Toestemming vragen → werkbak-items bij PL ───────────────────────────
  const vraag = await fetch(`${BASIS}/projecten/${proj2.id}/overwerk-toestemming`, {
    method: "POST", headers: monteur,
    body: JSON.stringify({ datum: "2026-07-19", uren: 2, toelichting: "storing verholpen, klant wachtte" }),
  });
  check("toestemming vragen slaagt (201)", vraag.status === 201, await vraag.clone().text());
  const vraagJson = await vraag.json() as { id: number; status: string; meldingen_geplaatst: number };
  check("aanvraag staat op 'aangevraagd' en er zijn meldingen geplaatst", vraagJson.status === "aangevraagd" && vraagJson.meldingen_geplaatst >= 2, vraagJson);

  // ── 8. Weekcontrole: vakantieweek geeft geen alarm ─────────────────────────
  // Verlofweek voor de VORIGE week t.o.v. vandaag; verlof (38u) dekt de norm.
  const nu = new Date();
  const maandagVorige = new Date(nu); maandagVorige.setUTCDate(nu.getUTCDate() - ((nu.getUTCDay() || 7) - 1) - 7);
  const zondagVorige = new Date(maandagVorige); zondagVorige.setUTCDate(maandagVorige.getUTCDate() + 6);
  const vwVan = maandagVorige.toISOString().slice(0, 10);
  const vwTot = zondagVorige.toISOString().slice(0, 10);
  let [soort] = await db.select().from(verlofsoortenTable).where(eq(verlofsoortenTable.isTijdVoorTijd, false)).limit(1);
  if (!soort) {
    [soort] = await db.insert(verlofsoortenTable).values({ naam: "Bewijs vakantie", } as typeof verlofsoortenTable.$inferInsert).returning();
    aangemaakt.verlofsoorten.push(soort.id);
  }
  await db.insert(verlofAanvragenTable).values({
    medewerkerId: mid, verlofsoortId: soort.id, startDatum: vwVan, eindDatum: vwTot,
    aantalUren: 38, status: "goedgekeurd",
  } as typeof verlofAanvragenTable.$inferInsert);
  // weekstaat voor die week indienen zodat 'ingediend' klopt
  const iso = (d: Date) => { const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); const dag = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - dag); const js = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return { jaar: t.getUTCFullYear(), week: Math.ceil(((t.getTime() - js.getTime()) / 86400000 + 1) / 7) }; };
  const vw = iso(maandagVorige);
  await db.insert(weekStatenTable).values({ medewerkerId: mid, jaar: vw.jaar, weekNummer: vw.week, status: "ingediend", totaalUren: 0, advUren: 0 } as typeof weekStatenTable.$inferInsert);

  const hbGid = await maakGebruiker("bewijs-uren01-hb@fps.local", "Bewijs Uren01 HB", "hoofdbeheerder");
  const hb = await login("bewijs-uren01-hb@fps.local");
  const draai = await fetch(`${BASIS}/werkbak/bewaking/draai`, { method: "POST", headers: hb });
  check("bewakingsloop handmatig gedraaid (200)", draai.status === 200, draai.status);
  const alarmen = await db.execute(sql`SELECT id, titel FROM werkbak_items WHERE bron = 'weekstaat_onvolledig' AND gebruiker_id = ${monteurGid}`);
  check("vakantieweek geeft GEEN onvolledig-alarm voor de monteur", (alarmen as unknown as { rows?: unknown[] }).rows?.length === 0 || (Array.isArray(alarmen) && alarmen.length === 0), alarmen);

  console.log("\nAlle UREN_01-bewijzen geslaagd.");
}

async function opruimen(): Promise<void> {
  for (const mid of aangemaakt.medewerkers) await ruimMedewerkerOp(mid);
  if (aangemaakt.projecten.length) {
    await db.delete(overwerkSlotenTable).where(inArray(overwerkSlotenTable.projectId, aangemaakt.projecten));
    await db.delete(projectenTable).where(inArray(projectenTable.id, aangemaakt.projecten));
  }
  for (const sid of aangemaakt.verlofsoorten) await db.delete(verlofsoortenTable).where(eq(verlofsoortenTable.id, sid));
  if (aangemaakt.gebruikers.length) {
    await db.execute(sql`DELETE FROM werkbak_items WHERE bron IN ('overwerk_toestemming','weekstaat_onvolledig','weekstaat_overwerk_overtreding','tvt_opname_herinnering')`);
    await db.delete(gebruikersTable).where(inArray(gebruikersTable.id, aangemaakt.gebruikers));
  }
}

main()
  .then(async () => { await opruimen(); process.exit(0); })
  .catch(async (e) => { console.error(e); await opruimen().catch(() => {}); process.exit(1); });
