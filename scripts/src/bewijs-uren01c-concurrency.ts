// Gedragsbewijs UREN_01 §4 (concurrency-hardening, taak "transactioneel"):
// toets + slotboeking + schrijfactie zijn één transactie onder een advisory
// lock per medewerker+ISO-week. Acceptatie-eisen:
//   1. Weekgrens-race: twee gelijktijdige registraties die elk apart onder de
//      grens blijven maar samen erboven uitkomen → precies één 201, één 422
//      (nooit samen ongezien boven de grens zonder slot).
//   2. Plafond-race: twee gelijktijdige overwerk-registraties op één slot met
//      plafond voor maar één van beide → één 201, één 422; slotverbruik exact
//      één boeking, en de geweigerde regel bestaat niet (geen verweesd
//      verbruik na een teruggedraaide insert).
//   3. DELETE geeft het door de regel verbruikte plafond terug; een slot dat
//      automatisch dichtging op het plafond gaat daarbij weer open.
//   4. Een handmatig gesloten slot blijft bij teruggave dicht.
//   5. PATCH naar een ander project/slot boekt op het nieuwe slot en geeft de
//      oude allocatie in dezelfde transactie terug (geen verweesd verbruik);
//      DELETE daarna geeft het nieuwe slot terug.
// Draaien: pnpm --filter @workspace/scripts exec tsx src/bewijs-uren01c-concurrency.ts
import "./lib/prodGuard";
import bcrypt from "bcryptjs";
import { and, eq, gte, lte } from "drizzle-orm";
import { authenticator } from "otplib";
import { db, gebruikersTable, medewerkersTable } from "@workspace/db";
import {
  urenRegistratiesTable, weekStatenTable, projectenTable,
  overwerkSlotenTable, verlofAanvragenTable, medewerkerAanstellingenTable,
} from "@workspace/db/schema";

const BASIS = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
const TOTP = "MFRGGZDFMZTWQ2LK";
const WW = "BewijsUren01c!2026";

if (process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === "production") {
  throw new Error("GEWEIGERD: bewijsscript nooit tegen productie draaien.");
}

function check(naam: string, conditie: boolean, detail?: unknown): void {
  if (!conditie) { console.error(`✗ FAALT: ${naam}`, detail ?? ""); throw new Error(naam); }
  console.log(`✓ ${naam}`);
}

const aangemaakt = { gebruikers: [] as number[], medewerkers: [] as number[], projecten: [] as number[] };

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

function tijden(uren: number): { begin: string; eind: string } {
  const eindUur = 7 + Math.floor(uren);
  const min = Math.round((uren % 1) * 60);
  return { begin: "07:00", eind: `${String(eindUur).padStart(2, "0")}:${String(min).padStart(2, "0")}` };
}

async function postUren(auth: Record<string, string>, datum: string, uren: number, projectId?: number, projectNaam?: string) {
  const { begin, eind } = tijden(uren);
  const r = await fetch(`${BASIS}/uren`, {
    method: "POST", headers: auth,
    body: JSON.stringify({ datum, begin_tijd: begin, eind_tijd: eind, pauze_minuten: 0, project_id: projectId ?? null, project_naam: projectNaam ?? null, werkzaamheden: "bewijs UREN_01c" }),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) as Record<string, unknown> };
}

async function weekTotaal(mid: number): Promise<number> {
  const rijen = await db.select({ n: urenRegistratiesTable.nettoUren })
    .from(urenRegistratiesTable).where(eq(urenRegistratiesTable.medewerkerId, mid));
  return rijen.reduce((a, r) => a + r.n, 0);
}

async function main(): Promise<void> {
  const monteurGid = await maakGebruiker("bewijs-uren01c-monteur@fps.local", "Bewijs Uren01c Monteur", "gebruiker", { bevoegdheden: { gebouwen: 1, projecten: 1 } });
  const plGid = await maakGebruiker("bewijs-uren01c-pl@fps.local", "Bewijs Uren01c PL", "gebruiker", { bevoegdheden: { projecten: 3, personeel: 2 }, functietitels: ["Projectleider"] });
  void plGid;
  const [m] = await db.insert(medewerkersTable).values({
    gebruikerId: monteurGid, naam: "Bewijs Uren01c Monteur",
    cao: "Metaal & Techniek", dienstverband: "vast", contracturenPerWeek: 38,
  } as typeof medewerkersTable.$inferInsert).returning({ id: medewerkersTable.id });
  const mid = m.id; aangemaakt.medewerkers.push(mid);
  const [proj] = await db.insert(projectenTable).values({ naam: "Bewijs UREN_01c project", status: "actief" } as typeof projectenTable.$inferInsert).returning({ id: projectenTable.id });
  aangemaakt.projecten.push(proj.id);

  const monteur = await login("bewijs-uren01c-monteur@fps.local");
  const pl = await login("bewijs-uren01c-pl@fps.local");

  // Vaste testweek in het verleden (ma 2026-06-15 t/m zo 2026-06-21, ISO-week 25).
  const dagen = ["2026-06-15", "2026-06-16", "2026-06-17", "2026-06-18", "2026-06-19"];

  // ── 1. Weekgrens-race zonder slot ──────────────────────────────────────────
  // 30u vooraf; twee gelijktijdige 8u-regels: elk apart 38 ≤ 40, samen 46 > 40.
  for (const d of dagen.slice(0, 3)) {
    const r = await postUren(monteur, d, 10);
    check(`opzet: 10u op ${d} geaccepteerd`, r.status === 201, r);
  }
  const [a, b] = await Promise.all([
    postUren(monteur, dagen[3], 8),
    postUren(monteur, dagen[4], 8),
  ]);
  const statussen = [a.status, b.status].sort();
  check("weekgrens-race: precies één 201 en één 422", statussen[0] === 201 && statussen[1] === 422, { a, b });
  const geweigerd1 = a.status === 422 ? a : b;
  check("de verliezer krijgt OVERWERK_SLOT_DICHT met uitleg", geweigerd1.body.code === "OVERWERK_SLOT_DICHT", geweigerd1.body);
  const totaal1 = await weekTotaal(mid);
  check(`weektotaal blijft ≤ 40 zonder slot (is: ${totaal1})`, totaal1 <= 40 + 1e-9, totaal1);

  // ── 2. Plafond-race op één slot ────────────────────────────────────────────
  // Reset naar 36u; slot met plafond 4; twee gelijktijdige 8u-regels op het
  // project willen elk 4u boven de grens boeken → er past er maar één.
  await db.delete(urenRegistratiesTable).where(eq(urenRegistratiesTable.medewerkerId, mid));
  for (const d of dagen.slice(0, 4)) {
    const r = await postUren(monteur, d, 9);
    check(`opzet: 9u op ${d} geaccepteerd`, r.status === 201, r);
  }
  const open = await fetch(`${BASIS}/projecten/${proj.id}/overwerkslot/openen`, {
    method: "POST", headers: pl,
    body: JSON.stringify({ geldig_van: dagen[0], geldig_tot: "2026-06-21", uren_plafond: 4, reden: "Bewijs UREN_01c plafond-race" }),
  });
  check("slot met plafond 4 geopend (201)", open.status === 201, await open.clone().text());

  const [c, d2] = await Promise.all([
    postUren(monteur, dagen[4], 8, proj.id, "Bewijs UREN_01c project"),
    postUren(monteur, "2026-06-20", 8, proj.id, "Bewijs UREN_01c project"),
  ]);
  const statussen2 = [c.status, d2.status].sort();
  check("plafond-race: precies één 201 en één 422", statussen2[0] === 201 && statussen2[1] === 422, { c, d2 });
  const winnaar = c.status === 201 ? c : d2;
  const [slotNa] = await db.select().from(overwerkSlotenTable)
    .where(and(eq(overwerkSlotenTable.projectId, proj.id)));
  check("slotverbruik = exact 4 (één boeking, geen dubbel of verweesd verbruik)", Math.abs(slotNa.verbruikteUren - 4) < 1e-9, slotNa);
  check("slot is op het plafond automatisch gesloten", slotNa.status === "gesloten" && slotNa.geslotenDoorId == null, slotNa);
  const regels = await db.select().from(urenRegistratiesTable).where(eq(urenRegistratiesTable.medewerkerId, mid));
  check("de geweigerde regel bestaat niet (insert-rollback laat geen rij achter)", regels.length === 5, regels.length);
  const winRegel = regels.find((r) => r.id === Number(winnaar.body.id));
  check("winnende regel administreert slot + 4u verbruik", !!winRegel && winRegel.overwerkSlotId === slotNa.id && Math.abs(winRegel.overwerkSlotUren - 4) < 1e-9, winRegel);

  // ── 3. DELETE geeft slotverbruik terug; auto-gesloten slot gaat weer open ──
  const del = await fetch(`${BASIS}/uren/${winnaar.body.id}`, { method: "DELETE", headers: monteur });
  check("DELETE van de overwerkregel slaagt (204)", del.status === 204, del.status);
  const [slotTerug] = await db.select().from(overwerkSlotenTable).where(eq(overwerkSlotenTable.id, slotNa.id));
  check("slotverbruik is teruggegeven (0)", Math.abs(slotTerug.verbruikteUren) < 1e-9, slotTerug);
  check("automatisch gesloten slot staat weer open", slotTerug.status === "open" && slotTerug.geslotenOp == null, slotTerug);

  // ── 4. Handmatig gesloten slot blijft dicht bij teruggave ─────────────────
  const zes = await postUren(monteur, dagen[4], 6, proj.id, "Bewijs UREN_01c project");
  check("6u-regel (2u boven de grens) geaccepteerd op het heropende slot", zes.status === 201, zes);
  const sluit = await fetch(`${BASIS}/projecten/${proj.id}/overwerkslot/sluiten`, { method: "POST", headers: pl });
  check("projectleider sluit het slot handmatig", sluit.status === 200, sluit.status);
  const del2 = await fetch(`${BASIS}/uren/${zes.body.id}`, { method: "DELETE", headers: monteur });
  check("DELETE van de 2u-overwerkregel slaagt (204)", del2.status === 204, del2.status);
  const [slotDicht] = await db.select().from(overwerkSlotenTable).where(eq(overwerkSlotenTable.id, slotNa.id));
  check("verbruik teruggegeven (0) maar handmatig gesloten slot blijft dicht", Math.abs(slotDicht.verbruikteUren) < 1e-9 && slotDicht.status === "gesloten", slotDicht);

  // ── 5. PATCH naar een ander project/slot: nieuw boeken + oud teruggeven ───
  const [proj2] = await db.insert(projectenTable).values({ naam: "Bewijs UREN_01c project 2", status: "actief" } as typeof projectenTable.$inferInsert).returning({ id: projectenTable.id });
  aangemaakt.projecten.push(proj2.id);
  // Slot op project 1 heropenen (was handmatig gesloten) en slot op project 2 openen.
  const heropen = await fetch(`${BASIS}/projecten/${proj.id}/overwerkslot/openen`, {
    method: "POST", headers: pl,
    body: JSON.stringify({ geldig_van: dagen[0], geldig_tot: "2026-06-21", uren_plafond: 4, reden: "Bewijs UREN_01c slotwissel A" }),
  });
  check("slot A (project 1) opnieuw geopend", heropen.status === 201, heropen.status);
  const openB = await fetch(`${BASIS}/projecten/${proj2.id}/overwerkslot/openen`, {
    method: "POST", headers: pl,
    body: JSON.stringify({ geldig_van: dagen[0], geldig_tot: "2026-06-21", uren_plafond: 4, reden: "Bewijs UREN_01c slotwissel B" }),
  });
  check("slot B (project 2) geopend", openB.status === 201, openB.status);
  const wissel = await postUren(monteur, dagen[4], 7, proj.id, "Bewijs UREN_01c project");
  check("7u-regel (3u boven de grens) geboekt op slot A", wissel.status === 201, wissel);
  const slotA = async () => (await db.select().from(overwerkSlotenTable).where(and(eq(overwerkSlotenTable.projectId, proj.id), eq(overwerkSlotenTable.reden, "Bewijs UREN_01c slotwissel A"))))[0];
  const slotB = async () => (await db.select().from(overwerkSlotenTable).where(eq(overwerkSlotenTable.projectId, proj2.id)))[0];
  check("slot A-verbruik = 3", Math.abs((await slotA()).verbruikteUren - 3) < 1e-9, await slotA());
  // De projectwissel racet met een gelijktijdige, ongerelateerde PATCH
  // (alleen een notitie) op dezelfde regel: de tweede in de rij moet zijn
  // toets doen op de VERSE rij (niet op een stale kopie), anders boekt hij
  // op het oude slot terwijl de regel al gewisseld is.
  const [patchWissel, patchNotitie] = await Promise.all([
    fetch(`${BASIS}/uren/${wissel.body.id}`, {
      method: "PATCH", headers: monteur,
      body: JSON.stringify({ project_id: proj2.id, project_naam: "Bewijs UREN_01c project 2" }),
    }),
    fetch(`${BASIS}/uren/${wissel.body.id}`, {
      method: "PATCH", headers: monteur,
      body: JSON.stringify({ opmerkingen: "gelijktijdige notitie-wijziging" }),
    }),
  ]);
  check("PATCH naar project 2 slaagt (200)", patchWissel.status === 200, patchWissel.status);
  check("gelijktijdige notitie-PATCH slaagt ook (200)", patchNotitie.status === 200, patchNotitie.status);
  check("slot B-verbruik = 3 (nieuw geboekt)", Math.abs((await slotB()).verbruikteUren - 3) < 1e-9, await slotB());
  check("slot A-verbruik = 0 (oude allocatie transactioneel teruggegeven)", Math.abs((await slotA()).verbruikteUren) < 1e-9, await slotA());
  const [regelNaWissel] = await db.select().from(urenRegistratiesTable).where(eq(urenRegistratiesTable.id, Number(wissel.body.id)));
  check("regel administreert nu slot B + 3u", regelNaWissel.overwerkSlotId === (await slotB()).id && Math.abs(regelNaWissel.overwerkSlotUren - 3) < 1e-9, regelNaWissel);
  const delWissel = await fetch(`${BASIS}/uren/${wissel.body.id}`, { method: "DELETE", headers: monteur });
  check("DELETE na de wissel slaagt (204)", delWissel.status === 204, delWissel.status);
  check("slot B-verbruik weer 0 na DELETE", Math.abs((await slotB()).verbruikteUren) < 1e-9, await slotB());

  // ── 6. Legacy-regels (van vóór migratie 0033: NULL/0-administratie) ───────
  // Simulatie: regel normaal boeken en daarna de per-regel-administratie
  // wissen — precies de toestand van bestaande rijen na de migratie, waarbij
  // het slotverbruik destijds wél is geboekt.
  const maakLegacy = async (dag: string) => {
    const r = await postUren(monteur, dag, 7, proj.id, "Bewijs UREN_01c project");
    check(`legacy-opzet: 7u op ${dag} geboekt`, r.status === 201, r);
    await db.update(urenRegistratiesTable)
      .set({ overwerkSlotId: null, overwerkSlotUren: 0 })
      .where(eq(urenRegistratiesTable.id, Number(r.body.id)));
    return Number(r.body.id);
  };
  // 6a. DELETE van een legacy-regel geeft het herleide verbruik terug.
  const legacy1 = await maakLegacy(dagen[4]);
  check("slot A-verbruik = 3 vóór legacy-DELETE", Math.abs((await slotA()).verbruikteUren - 3) < 1e-9, await slotA());
  const delLegacy = await fetch(`${BASIS}/uren/${legacy1}`, { method: "DELETE", headers: monteur });
  check("DELETE van legacy-regel slaagt (204)", delLegacy.status === 204, delLegacy.status);
  check("slot A-verbruik = 0 na legacy-DELETE (herleid en teruggegeven)", Math.abs((await slotA()).verbruikteUren) < 1e-9, await slotA());
  // 6b. PATCH-slotwissel van een legacy-regel boekt op B én geeft A herleid terug.
  const legacy2 = await maakLegacy(dagen[4]);
  const patchLegacy = await fetch(`${BASIS}/uren/${legacy2}`, {
    method: "PATCH", headers: monteur,
    body: JSON.stringify({ project_id: proj2.id, project_naam: "Bewijs UREN_01c project 2" }),
  });
  check("PATCH-slotwissel van legacy-regel slaagt (200)", patchLegacy.status === 200, patchLegacy.status);
  check("slot B-verbruik = 3 (legacy-wissel geboekt)", Math.abs((await slotB()).verbruikteUren - 3) < 1e-9, await slotB());
  check("slot A-verbruik = 0 (legacy-allocatie herleid teruggegeven, niet dubbel)", Math.abs((await slotA()).verbruikteUren) < 1e-9, await slotA());
  const [legacyNaWissel] = await db.select().from(urenRegistratiesTable).where(eq(urenRegistratiesTable.id, legacy2));
  check("legacy-regel draagt nu eigen administratie (slot B + 3u)", legacyNaWissel.overwerkSlotId === (await slotB()).id && Math.abs(legacyNaWissel.overwerkSlotUren - 3) < 1e-9, legacyNaWissel);
  const delLegacy2 = await fetch(`${BASIS}/uren/${legacy2}`, { method: "DELETE", headers: monteur });
  check("DELETE van de gewisselde legacy-regel slaagt (204)", delLegacy2.status === 204, delLegacy2.status);
  check("slot B-verbruik weer 0 (geen gestrand of dubbel verbruik)", Math.abs((await slotB()).verbruikteUren) < 1e-9, await slotB());

  // ── 7. Datum-verplaatsende PATCH racet met DELETE + nieuwe-week-invoer ────
  // De DELETE moet serialiseren tegen de week waar de rij WERKELIJK ligt (ook
  // als een gelijktijdige PATCH hem net verplaatste), en de invoer in de
  // nieuwe week moet tegen de gecommitteerde stand worden getoetst.
  const week2 = ["2026-06-22", "2026-06-23", "2026-06-24", "2026-06-25"];
  for (const dag of week2) {
    const r = await postUren(monteur, dag, 7.5, proj.id, "Bewijs UREN_01c project");
    check(`week2-opzet: 7.5u op ${dag} geaccepteerd`, r.status === 201, r);
  }
  const verplaats = await postUren(monteur, dagen[4], 7, proj.id, "Bewijs UREN_01c project");
  check("verplaats-regel: 7u in week 1 (3u boven, slot A)", verplaats.status === 201, verplaats);
  check("slot A-verbruik = 3 vóór de verplaats-race", Math.abs((await slotA()).verbruikteUren - 3) < 1e-9, await slotA());
  const [raceMove, raceDel] = await Promise.all([
    fetch(`${BASIS}/uren/${verplaats.body.id}`, {
      method: "PATCH", headers: monteur,
      body: JSON.stringify({ datum: "2026-06-26" }), // naar week 2 (30+7=37 ≤ 40, geen overwerk daar)
    }),
    fetch(`${BASIS}/uren/${verplaats.body.id}`, { method: "DELETE", headers: monteur }),
  ]);
  // Volgorde is niet-deterministisch: PATCH kan 200 (vóór DELETE) of 404 (erna) zijn.
  check("verplaats-PATCH eindigt netjes (200 of 404)", raceMove.status === 200 || raceMove.status === 404, raceMove.status);
  check("DELETE in de race slaagt (204)", raceDel.status === 204, raceDel.status);
  const [rijNaRace] = await db.select().from(urenRegistratiesTable).where(eq(urenRegistratiesTable.id, Number(verplaats.body.id)));
  check("rij is na de race definitief weg", rijNaRace === undefined, rijNaRace);
  check("slot A-verbruik = 0 (teruggave ook na/tijdens datum-verplaatsing)", Math.abs((await slotA()).verbruikteUren) < 1e-9, await slotA());
  // Nieuwe invoer in week 2 wordt tegen de gecommitteerde stand getoetst:
  // 30u bestaand (regel is verwijderd) + 6u = 36 ≤ 40 → moet slagen.
  const naRace = await postUren(monteur, "2026-06-26", 6, proj.id, "Bewijs UREN_01c project");
  check("nieuwe week2-invoer (6u) getoetst tegen gecommitteerde stand: 201", naRace.status === 201, naRace);

  // ── 8. Datum-verplaatsende PATCH racet met POST in de DOELWEEK ────────────
  // Week 3 heeft 30u; de verplaatste regel (7u) en een nieuwe 4u-invoer passen
  // er samen NIET onder de 40u-grens (41) en er is geen slot in week 3: bij
  // correcte serialisatie op de doelweek slaagt er precies één van de twee.
  const week3 = ["2026-06-29", "2026-06-30", "2026-07-01", "2026-07-02"];
  for (const dag of week3) {
    const r = await postUren(monteur, dag, 7.5, proj.id, "Bewijs UREN_01c project");
    check(`week3-opzet: 7.5u op ${dag} geaccepteerd`, r.status === 201, r);
  }
  const verplaats2 = await postUren(monteur, dagen[4], 7, proj.id, "Bewijs UREN_01c project");
  check("verplaats-regel 2: 7u in week 1 (3u boven, slot A)", verplaats2.status === 201, verplaats2);
  const [moveNaarW3, postInW3] = await Promise.all([
    fetch(`${BASIS}/uren/${verplaats2.body.id}`, {
      method: "PATCH", headers: monteur,
      body: JSON.stringify({ datum: "2026-07-03" }),
    }),
    postUren(monteur, "2026-07-03", 4, proj.id, "Bewijs UREN_01c project"),
  ]);
  const geslaagd = [moveNaarW3.status === 200, postInW3.status === 201].filter(Boolean).length;
  check("doelweek-race: precies één van PATCH-verplaatsing en POST slaagt", geslaagd === 1, { patch: moveNaarW3.status, post: postInW3.status });
  const w3rijen = await db.select().from(urenRegistratiesTable).where(and(
    gte(urenRegistratiesTable.datum, "2026-06-29"),
    lte(urenRegistratiesTable.datum, "2026-07-05"),
  ));
  const w3totaal = w3rijen.reduce((acc, r) => acc + r.nettoUren, 0);
  check("doelweek-totaal blijft ≤ 40 zonder slot (geen dubbele acceptatie)", w3totaal <= 40 + 1e-9, w3totaal);

  console.log("\nAlle UREN_01c-concurrencybewijzen geslaagd.");
}

async function opruimen(): Promise<void> {
  for (const mid of aangemaakt.medewerkers) await ruimMedewerkerOp(mid).catch(() => {});
  for (const pid of aangemaakt.projecten) {
    await db.delete(overwerkSlotenTable).where(eq(overwerkSlotenTable.projectId, pid)).catch(() => {});
    await db.delete(projectenTable).where(eq(projectenTable.id, pid)).catch(() => {});
  }
  for (const gid of aangemaakt.gebruikers) await db.delete(gebruikersTable).where(eq(gebruikersTable.id, gid)).catch(() => {});
}

main()
  .then(async () => { await opruimen(); process.exit(0); })
  .catch(async (e) => { console.error(e); await opruimen(); process.exit(1); });
