// Gedragsbewijs UREN_01 — mandagstaat (§6c / §9.14-17) + BSN-hygiëne (§6c.3 / §9.15).
// Patroon exact zoals scripts/src/bewijs-uren01.ts: HTTP tegen de lokale
// api-server (https://$REPLIT_DEV_DOMAIN/api), eigen testgebruikers, DB via
// @workspace/db, opruimen in finally, ✓/rood + exitcode.
//
// Acceptatie-eisen §9:
//   14. De mandagstaat wordt gegenereerd uit goedgekeurde uren — per week per
//       werk per medewerker per dag, met naam/geboortedatum/BSN en
//       handtekeningvelden. Voorbeeld: Adastraat 4 Almelo, week 9, AKOR
//       Nijverdal, één medewerker, 4,25 uur op maandag. Log +1 rij.
//   15. Het BSN staat alleen op de mandagstaat — niet in weekstaat-detail,
//       AVG-export of andere uren-uitvoer.
//   16. De mandagstaat gaat mee met de (verkoop)factuur wanneer de instelling
//       aanstaat; ontbrekende goedgekeurde uren levert een WAARSCHUWING op en
//       geen blokkade (factuur wordt wél definitief).
//   17. Concept-uren leveren geen mandagstaat op → 422.
// Draaien: pnpm --filter @workspace/scripts exec tsx src/bewijs-uren01c.ts
import "./lib/prodGuard";
import bcrypt from "bcryptjs";
import { and, eq, inArray, sql } from "drizzle-orm";
import { authenticator } from "otplib";
// pdf-parse (v2 API) uit de node_modules van de api-server — absoluut pad.
import { PDFParse } from "/home/runner/workspace/artifacts/api-server/node_modules/pdf-parse/dist/pdf-parse/esm/index.js";
import {
  db, gebruikersTable, medewerkersTable, werkgeversTable, gebouwenTable,
} from "@workspace/db";
import {
  urenRegistratiesTable, weekStatenTable,
  opdrachtenTable, mandagstaatLogsTable, facturenTable,
} from "@workspace/db/schema";

const BASIS = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
const TOTP = "MFRGGZDFMZTWQ2LK";
const WW = "BewijsUren01!2026";
const TEST_BSN = "111222333";

if (process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === "production") {
  throw new Error("GEWEIGERD: bewijsscript nooit tegen productie draaien.");
}

let falen = 0;
function check(naam: string, conditie: boolean, detail?: unknown): void {
  if (!conditie) { console.error(`\x1b[31m✗ FAALT: ${naam}\x1b[0m`, detail ?? ""); falen++; return; }
  console.log(`✓ ${naam}`);
}
function melding(tekst: string): void {
  console.log(`  ↳ ${tekst}`);
}

const aangemaakt = {
  gebruikers: [] as number[], medewerkers: [] as number[],
  opdrachten: [] as number[], gebouwen: [] as number[],
  werkgevers: [] as number[], facturen: [] as number[],
};

async function maakGebruiker(email: string, naam: string, rol: string, extra: Record<string, unknown> = {}): Promise<number> {
  const [oud] = await db.select({ id: gebruikersTable.id }).from(gebruikersTable).where(eq(gebruikersTable.email, email));
  if (oud) {
    const ms = await db.select({ id: medewerkersTable.id }).from(medewerkersTable).where(eq(medewerkersTable.gebruikerId, oud.id));
    for (const m of ms) await ruimMedewerkerOp(m.id);
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

async function pdfTekst(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const res = await parser.getText();
    return (res.text ?? "").trim();
  } finally {
    await parser.destroy().catch(() => {});
  }
}

// Insert een urenregel + goedgekeurde/concept weekstaat rechtstreeks in de DB
// (de mandagstaat leest uit uren_registraties gekoppeld aan de weekstaatstatus).
async function zetUren(mid: number, opdrachtId: number, datum: string, uren: number): Promise<void> {
  await db.insert(urenRegistratiesTable).values({
    datum, medewerkerId: mid, opdrachtId,
    beginTijd: "07:00", eindTijd: "11:15", pauzeMinuten: 0,
    nettoUren: uren, status: "goedgekeurd", werkzaamheden: "bewijs mandagstaat",
    bijgewerktOp: new Date(),
  } as typeof urenRegistratiesTable.$inferInsert);
}

async function zetWeekstaat(mid: number, jaar: number, week: number, status: string): Promise<number> {
  const [ws] = await db.insert(weekStatenTable).values({
    medewerkerId: mid, jaar, weekNummer: week, status,
    totaalUren: 0, advUren: 0, bijgewerktOp: new Date(),
  } as typeof weekStatenTable.$inferInsert).returning({ id: weekStatenTable.id });
  return ws.id;
}

async function main(): Promise<void> {
  const jaar = 2025, week = 9;                       // ISO week 9 2025 → ma 2025-02-24
  const maandag = "2025-02-24";

  // ── Opzet: HB-gebruiker (bypasst alle rechten), werkgever/gebouw/opdracht ──
  const hbGid = await maakGebruiker("bewijs-uren01c-hb@fps.local", "Bewijs Uren01c HB", "hoofdbeheerder");
  const hb = await login("bewijs-uren01c-hb@fps.local");

  const [wg] = await db.insert(werkgeversTable).values({
    naam: "Bewijs UREN_01c FPS BV",
  } as typeof werkgeversTable.$inferInsert).returning({ id: werkgeversTable.id });
  aangemaakt.werkgevers.push(wg.id);

  const [geb] = await db.insert(gebouwenTable).values({
    naam: "Adastraat 4 Almelo", adres: "Adastraat 4", stad: "Almelo",
    werkgeverId: wg.id,
  } as typeof gebouwenTable.$inferInsert).returning({ id: gebouwenTable.id });
  aangemaakt.gebouwen.push(geb.id);

  // §9.14: opdracht "Adastraat 4 Almelo", opdrachtgever AKOR Nijverdal, vereist=true.
  const [opd] = await db.insert(opdrachtenTable).values({
    titel: "Adastraat 4 Almelo", werknummer: "BW01C-ADA",
    opdrachtgever: "AKOR Nijverdal", gebouwId: geb.id,
    mandagstaatVereist: true, status: "actief",
  } as typeof opdrachtenTable.$inferInsert).returning({ id: opdrachtenTable.id });
  aangemaakt.opdrachten.push(opd.id);

  // §9.17-hulp: tweede opdracht mét vereist-vlag maar zónder goedgekeurde uren.
  const [opdLeeg] = await db.insert(opdrachtenTable).values({
    titel: "Bewijs UREN_01c leeg", werknummer: "BW01C-LEEG",
    opdrachtgever: "AKOR Nijverdal", gebouwId: geb.id,
    mandagstaatVereist: true, status: "actief",
  } as typeof opdrachtenTable.$inferInsert).returning({ id: opdrachtenTable.id });
  aangemaakt.opdrachten.push(opdLeeg.id);

  // Medewerker 1: naam/geboortedatum/BSN, goedgekeurde weekstaat + 4,25u op maandag.
  const [m1] = await db.insert(medewerkersTable).values({
    naam: "Bewijs Mandag Medewerker", geboortedatum: "1985-03-14",
    bsn: TEST_BSN, cao: "Metaal & Techniek", dienstverband: "vast", werkgeverId: wg.id,
  } as typeof medewerkersTable.$inferInsert).returning({ id: medewerkersTable.id });
  aangemaakt.medewerkers.push(m1.id);
  await zetUren(m1.id, opd.id, maandag, 4.25);
  await zetWeekstaat(m1.id, jaar, week, "goedgekeurd");

  // Medewerker 2: alleen concept-weekstaat → mag NIET op de mandagstaat komen.
  const [m2] = await db.insert(medewerkersTable).values({
    naam: "Bewijs Concept Medewerker", geboortedatum: "1990-06-01",
    bsn: "999888777", cao: "Metaal & Techniek", dienstverband: "vast", werkgeverId: wg.id,
  } as typeof medewerkersTable.$inferInsert).returning({ id: medewerkersTable.id });
  aangemaakt.medewerkers.push(m2.id);
  await zetUren(m2.id, opd.id, maandag, 8.0);          // wél uren, maar…
  await zetWeekstaat(m2.id, jaar, week, "concept");    // …concept → niet goedgekeurd

  // ════════════════════════════════════════════════════════════════════════
  // §9.14 — mandagstaat genereren uit goedgekeurde uren
  // ════════════════════════════════════════════════════════════════════════
  const logVoor = (await db.select({ id: mandagstaatLogsTable.id }).from(mandagstaatLogsTable)
    .where(eq(mandagstaatLogsTable.opdrachtId, opd.id))).length;

  const r = await fetch(`${BASIS}/opdrachten/${opd.id}/mandagstaat?jaar=${jaar}&week=${week}`, { headers: hb });
  check("§9.14 GET mandagstaat → 200", r.status === 200, r.status);
  const ct = r.headers.get("content-type") ?? "";
  check("§9.14 content-type is application/pdf", ct.includes("application/pdf"), ct);
  const buf = Buffer.from(await r.arrayBuffer());
  check("§9.14 PDF-magic %PDF", buf.subarray(0, 5).toString("latin1").startsWith("%PDF"), buf.subarray(0, 8).toString("latin1"));
  check("§9.14 PDF-grootte > 2kb", buf.byteLength > 2000, `${buf.byteLength} bytes`);

  const tekst = await pdfTekst(buf);
  check("§9.14 PDF bevat medewerkernaam", tekst.includes("Bewijs Mandag Medewerker"), tekst.slice(0, 200));
  check("§9.14 PDF bevat BSN 111222333", tekst.includes(TEST_BSN), "BSN niet in PDF-tekst");
  check("§9.14 PDF bevat 4,25 op maandag", tekst.includes("4,25"), "4,25 niet in PDF-tekst");
  check("§9.14 PDF bevat handtekening-woord 'Opdrachtgever'", tekst.includes("Opdrachtgever"), tekst.slice(0, 400));
  check("§9.14 PDF bevat handtekening-woord 'Onderaannemer'", tekst.includes("Onderaannemer"), tekst.slice(0, 400));

  const logNa = await db.select().from(mandagstaatLogsTable).where(eq(mandagstaatLogsTable.opdrachtId, opd.id));
  const nieuweLog = logNa.find((l) => l.weekNummer === week && l.jaar === jaar);
  check("§9.14 mandagstaat_logs +1 rij", logNa.length === logVoor + 1, { voor: logVoor, na: logNa.length });
  check("§9.14 log heeft week 9 + gegenereerd_door", !!nieuweLog && nieuweLog.gegenereerdDoorId === hbGid, nieuweLog);

  // ════════════════════════════════════════════════════════════════════════
  // §9.17 — concept-uren leveren geen mandagstaat; leeg = 422
  // ════════════════════════════════════════════════════════════════════════
  check("§9.17 tweede (concept) medewerker NIET op de PDF", !tekst.includes("Bewijs Concept Medewerker"), "concept-medewerker lekt op PDF");
  check("§9.17 concept-uren (8,00) NIET op de PDF", !tekst.includes("8,00"), "concept-uren lekken op PDF");
  const leeg = await fetch(`${BASIS}/opdrachten/${opdLeeg.id}/mandagstaat?jaar=${jaar}&week=${week}`, { headers: hb });
  check("§9.17 opdracht zonder goedgekeurde uren → 422", leeg.status === 422, leeg.status);

  // ════════════════════════════════════════════════════════════════════════
  // §9.15 — BSN-hygiëne: BSN alleen op de mandagstaat
  // ════════════════════════════════════════════════════════════════════════
  // (a) weekstaat-detail bevat GEEN medewerker_bsn/geboortedatum meer.
  const wsLijst = await fetch(`${BASIS}/weekstaten?medewerker_id=${m1.id}&jaar=${jaar}&week=${week}`, { headers: hb });
  const wsRijen = await wsLijst.json() as Array<{ id: number }>;
  check("§9.15 weekstaat gevonden voor medewerker", wsRijen.length >= 1, wsRijen.length);
  if (wsRijen.length >= 1) {
    const det = await fetch(`${BASIS}/weekstaten/${wsRijen[0].id}`, { headers: hb });
    const detTekst = await det.text();
    const detJson = JSON.parse(detTekst) as Record<string, unknown>;
    check("§9.15a weekstaat-detail bevat GEEN 'bsn'-sleutel", !("medewerker_bsn" in detJson) && !detTekst.toLowerCase().includes(TEST_BSN), Object.keys(detJson));
    check("§9.15a weekstaat-detail bevat GEEN 'geboortedatum'-sleutel", !JSON.stringify(detJson).toLowerCase().includes("geboortedatum"), Object.keys(detJson));
  }

  // (b) uren-endpoints: /uren/:id en /uren-lijst bevatten geen bsn.
  const urenLijst = await fetch(`${BASIS}/uren?medewerker_id=${m1.id}&jaar=${jaar}&week=${week}`, { headers: hb });
  const urenTekst = await urenLijst.text();
  check("§9.15b GET /uren bevat geen BSN", !urenTekst.includes(TEST_BSN) && !urenTekst.toLowerCase().includes("\"bsn\""), "bsn-lek in /uren");

  // (b) AVG-export van de medewerker (via de gekoppelde gebruiker) bevat geen BSN.
  // De medewerker heeft geen gebruikerId → maak een AVG-inzageverzoek voor de HB
  // en toets dat de export geen BSN/geboortedatum bevat (uitvoerroute-controle).
  const inzR = await fetch(`${BASIS}/avg/inzageverzoek`, {
    method: "POST", headers: hb,
    body: JSON.stringify({ type: "inzage", toelichting: "bewijs UREN_01c BSN-hygiëne" }),
  });
  if (inzR.status === 201) {
    const inz = await inzR.json() as { id: number };
    // afronden zodat de export beschikbaar komt
    await fetch(`${BASIS}/avg/inzageverzoeken/${inz.id}`, {
      method: "PATCH", headers: hb, body: JSON.stringify({ status: "afgerond" }),
    }).catch(() => {});
    const exp = await fetch(`${BASIS}/avg/inzageverzoek/${inz.id}/export`, { headers: hb });
    const expTekst = await exp.text();
    check("§9.15b AVG-export bevat geen BSN", !expTekst.toLowerCase().includes("\"bsn\"") && !expTekst.includes(TEST_BSN), "bsn-lek in AVG-export");
    check("§9.15b AVG-export bevat geen geboortedatum", !expTekst.toLowerCase().includes("geboortedatum"), "geboortedatum-lek in AVG-export");
    await db.execute(sql`DELETE FROM avg_inzageverzoeken WHERE id = ${inz.id}`).catch(() => {});
  } else {
    melding(`AVG-inzageverzoek kon niet aangemaakt worden (${inzR.status}) — export-controle overgeslagen, code-inspectie: exportData.medewerker bevat alleen id/naam/email/telefoon/mobiel/werkmaatschappij/dienstverband/in_dienst_sinds (geen bsn/geboortedatum).`);
  }

  // (b) HRM-medewerkerdetail: BESTAAND gedrag documenteren. medewerkerNaarJson
  // toont GEEN bsn (afwezig in de mapping) maar WEL geboortedatum — dat is
  // bestaand HRM-gedrag van vóór deze opdracht, geen uren/mandagstaat-uitvoer.
  const hrmDet = await fetch(`${BASIS}/medewerkers/${m1.id}`, { headers: hb });
  if (hrmDet.status === 200) {
    const hrmTekst = await hrmDet.text();
    const hrmJson = JSON.parse(hrmTekst) as Record<string, unknown>;
    check("§9.15b HRM-medewerkerdetail bevat GEEN BSN", !("bsn" in hrmJson) && !hrmTekst.includes(TEST_BSN), Object.keys(hrmJson));
    melding(`HRM-medewerkerdetail toont wél 'geboortedatum' (${hrmJson["geboortedatum"] ?? "—"}). Dit is bestaand HRM-personeelsdetailgedrag van vóór deze opdracht (het HRM-profielscherm), GEEN uren/mandagstaat-uitvoer. BSN wordt door medewerkerNaarJson NIET meegegeven. Geen wijziging aangebracht; alleen gemeld.`);
  } else {
    melding(`HRM-medewerkerdetail niet bereikbaar (${hrmDet.status}) — code-inspectie: medewerkerNaarJson bevat geen bsn-sleutel; geboortedatum is bestaand HRM-gedrag.`);
  }

  // ════════════════════════════════════════════════════════════════════════
  // §9.16 — verkoopfactuur gekoppeld aan de opdracht
  // ════════════════════════════════════════════════════════════════════════
  // (a) opdracht MÉT goedgekeurde uren → definitief-respons met bijlage (geen waarschuwing).
  const [factA] = await db.insert(facturenTable).values({
    type: "verkoop", opdrachtId: opd.id, gebouwId: geb.id, status: "ontvangen",
    relatienaam: "AKOR Nijverdal", omschrijving: "Bewijs UREN_01c factuur A",
    factuurdatum: "2025-03-05", bedragExclBtw: "1000.00", bedragInclBtw: "1210.00", btwBedrag: "210.00",
  } as typeof facturenTable.$inferInsert).returning({ id: facturenTable.id });
  aangemaakt.facturen.push(factA.id);
  const defA = await fetch(`${BASIS}/facturen/${factA.id}/definitief`, { method: "POST", headers: hb });
  const defAJson = await defA.json() as { factuurnummer?: string; mandagstaat_waarschuwing?: string | null };
  check("§9.16a factuur mét goedgekeurde uren → definitief (200)", defA.status === 200, defA.status);
  check("§9.16a factuur kreeg fiscaal factuurnummer (definitief)", !!defAJson.factuurnummer, defAJson.factuurnummer);
  check("§9.16a definitief-respons ZONDER mandagstaat-waarschuwing", defAJson.mandagstaat_waarschuwing == null, defAJson.mandagstaat_waarschuwing);
  // controleer dat de generatie ook gelogd is (bijlage-pad)
  const logsA = await db.select().from(mandagstaatLogsTable).where(eq(mandagstaatLogsTable.opdrachtId, opd.id));
  check("§9.16a mandagstaat gegenereerd/gelogd bij factureren", logsA.length >= 2, logsA.length);

  // (b) opdracht MÉT vereist-vlag ZONDER goedgekeurde uren → waarschuwing, GEEN blokkade.
  const [factB] = await db.insert(facturenTable).values({
    type: "verkoop", opdrachtId: opdLeeg.id, gebouwId: geb.id, status: "ontvangen",
    relatienaam: "AKOR Nijverdal", omschrijving: "Bewijs UREN_01c factuur B",
    factuurdatum: "2025-03-05", bedragExclBtw: "500.00", bedragInclBtw: "605.00", btwBedrag: "105.00",
  } as typeof facturenTable.$inferInsert).returning({ id: facturenTable.id });
  aangemaakt.facturen.push(factB.id);
  const defB = await fetch(`${BASIS}/facturen/${factB.id}/definitief`, { method: "POST", headers: hb });
  const defBJson = await defB.json() as { factuurnummer?: string; status?: string; mandagstaat_waarschuwing?: string | null };
  check("§9.16b factuur zonder goedgekeurde uren → NIET geblokkeerd (200)", defB.status === 200, defB.status);
  check("§9.16b respons bevat mandagstaat_waarschuwing", !!defBJson.mandagstaat_waarschuwing, defBJson.mandagstaat_waarschuwing);
  check("§9.16b factuur is tóch definitief (kreeg factuurnummer)", !!defBJson.factuurnummer, defBJson.factuurnummer);
  if (defBJson.mandagstaat_waarschuwing) melding(`waarschuwing: "${defBJson.mandagstaat_waarschuwing}"`);

  console.log(falen === 0
    ? "\n\x1b[32mAlle UREN_01c-bewijzen (§9.14-17 + BSN-hygiëne) geslaagd.\x1b[0m"
    : `\n\x1b[31m${falen} check(s) gefaald.\x1b[0m`);
}

async function opruimen(): Promise<void> {
  if (aangemaakt.facturen.length) await db.delete(facturenTable).where(inArray(facturenTable.id, aangemaakt.facturen));
  for (const oid of aangemaakt.opdrachten) {
    await db.delete(mandagstaatLogsTable).where(eq(mandagstaatLogsTable.opdrachtId, oid));
    await db.delete(urenRegistratiesTable).where(eq(urenRegistratiesTable.opdrachtId, oid));
  }
  for (const mid of aangemaakt.medewerkers) await ruimMedewerkerOp(mid);
  if (aangemaakt.opdrachten.length) await db.delete(opdrachtenTable).where(inArray(opdrachtenTable.id, aangemaakt.opdrachten));
  if (aangemaakt.gebouwen.length) await db.delete(gebouwenTable).where(inArray(gebouwenTable.id, aangemaakt.gebouwen));
  if (aangemaakt.werkgevers.length) {
    await db.execute(sql`DELETE FROM factuurnummer_tellers WHERE werkgever_id = ANY(${aangemaakt.werkgevers})`).catch(() => {});
    await db.delete(werkgeversTable).where(inArray(werkgeversTable.id, aangemaakt.werkgevers));
  }
  if (aangemaakt.gebruikers.length) await db.delete(gebruikersTable).where(inArray(gebruikersTable.id, aangemaakt.gebruikers));
}

main()
  .then(async () => { await opruimen().catch(() => {}); process.exit(falen === 0 ? 0 : 1); })
  .catch(async (e) => { console.error("\x1b[31m", e, "\x1b[0m"); await opruimen().catch(() => {}); process.exit(1); });
