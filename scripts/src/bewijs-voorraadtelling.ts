// VOORRAADTELLING fase 1 — bewijsscript. Test via HTTP (nooit api-server-source importeren)
// + @workspace/db voor opzet/naslag. Draaien: pnpm --filter @workspace/scripts run tsx src/bewijs-voorraadtelling.ts
import "./lib/prodGuard";
import { authenticator } from "otplib";
import { eq, and, like, sql } from "drizzle-orm";
import {
  db, artikelenTable, voorraadTable, voorraadMutatiesTable,
  voorraadTellingenTable, voorraadTellingRegelsTable, magazijnLocatiesTable,
} from "@workspace/db";
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
  let json: any = null;
  try { json = await r.json(); } catch { /* leeg */ }
  return { status: r.status, json };
}

const TESTNAAM = "BEWIJS-VOORRAADTELLING artikel";

async function opruimen() {
  const oude = await db.select({ id: artikelenTable.id }).from(artikelenTable)
    .where(like(artikelenTable.naam, "BEWIJS-VOORRAADTELLING%"));
  for (const a of oude) {
    await db.delete(voorraadMutatiesTable).where(eq(voorraadMutatiesTable.artikelId, a.id));
    await db.delete(voorraadTellingRegelsTable).where(eq(voorraadTellingRegelsTable.artikelId, a.id));
    await db.delete(voorraadTable).where(eq(voorraadTable.artikelId, a.id));
    await db.delete(artikelenTable).where(eq(artikelenTable.id, a.id));
  }
  await db.delete(voorraadTellingenTable).where(like(voorraadTellingenTable.omschrijving, "BEWIJS-VOORRAADTELLING%"));
  await db.delete(magazijnLocatiesTable).where(like(magazijnLocatiesTable.naam, "BEWIJS-VOORRAADTELLING%"));
}

async function main() {
  console.log("— VOORRAADTELLING bewijsscript —");
  await setupE2eWebAdminAccount();
  await opruimen();

  // Opzet: artikel met inkoopprijs 12.50 en administratieve voorraad 10
  const [artikel] = await db.insert(artikelenTable).values({
    naam: TESTNAAM, code: "BEW-TEL-01", eenheid: "st", inkoopprijs: 12.5, laatsteInkoopprijs: 14,
  }).returning();
  await db.insert(voorraadTable).values({ artikelId: artikel!.id, locatieId: null, hoeveelheid: 10 });
  // Oude beweging voor de "laatste beweging"-kolom
  await db.insert(voorraadMutatiesTable).values({
    artikelId: artikel!.id, type: "inkoop", hoeveelheid: 10, delta: 10,
    omschrijving: "opzet bewijs", aangemaaktOp: new Date("2024-01-15T10:00:00Z"),
  });

  const admin = await login(E2E_WEB_ADMIN_EMAIL, E2E_WEB_ADMIN_WACHTWOORD, E2E_WEB_ADMIN_TOTP_SECRET);

  // 1. Telling aanmaken met peildatum + vaste grondslag
  const aanmaak = await api(admin, "POST", "/magazijn/tellingen", {
    peildatum: "2026-12-31", grondslag: "inkoopprijs", omschrijving: "BEWIJS-VOORRAADTELLING run",
  });
  check("telling aanmaken → 201", aanmaak.status === 201, JSON.stringify(aanmaak.json));
  const tellingId = aanmaak.json?.id as number;
  check("grondslag vastgelegd", aanmaak.json?.grondslag === "inkoopprijs");
  check("status open", aanmaak.json?.status === "open");

  // 2. Regel invullen: geteld 7 terwijl administratie 10 zegt
  const regel = await api(admin, "POST", `/magazijn/tellingen/${tellingId}/regels`, {
    artikel_id: artikel!.id, locatie_id: null, geteld_aantal: 7, bevestigd: false,
  });
  check("regel invullen → 200/201", regel.status === 200 || regel.status === 201, JSON.stringify(regel.json));
  check("administratieve voorraad = 10", regel.json?.administratieve_voorraad === 10, String(regel.json?.administratieve_voorraad));
  check("verschil = -3", regel.json?.verschil_aantal === -3, String(regel.json?.verschil_aantal));
  check("laatste beweging zichtbaar (2024)", String(regel.json?.laatste_beweging_op ?? "").startsWith("2024"), String(regel.json?.laatste_beweging_op));

  // Corrigeren + bevestigen (upsert op zelfde artikel×locatie)
  const regel2 = await api(admin, "POST", `/magazijn/tellingen/${tellingId}/regels`, {
    artikel_id: artikel!.id, locatie_id: null, geteld_aantal: 8, bevestigd: true,
  });
  check("regel corrigeren+bevestigen (upsert, geen dubbele rij)", regel2.json?.geteld_aantal === 8 && regel2.json?.bevestigd === true);

  // 3. Verschillenlijst: aantal én geld tegen de grondslag
  const versch = await api(admin, "GET", `/magazijn/tellingen/${tellingId}/verschillen`);
  const vRegel = versch.json?.regels?.[0];
  check("verschillenlijst 1 regel", versch.json?.regels?.length === 1);
  check("verschil aantal = -2", vRegel?.verschil_aantal === -2, String(vRegel?.verschil_aantal));
  check("prijs = 12.50 (inkoopprijs)", vRegel?.prijs === 12.5, String(vRegel?.prijs));
  check("verschil in geld = -25.00", vRegel?.verschil_waarde === -25, String(vRegel?.verschil_waarde));
  check("totaal geteld waarde = 100.00", versch.json?.totaal_geteld_waarde === 100, String(versch.json?.totaal_geteld_waarde));

  // 4. Vaststellen: atomair bevriezen + correctiemutatie boeken
  const vast = await api(admin, "POST", `/magazijn/tellingen/${tellingId}/vaststellen`);
  check("vaststellen → 200", vast.status === 200, JSON.stringify(vast.json));
  check("1 correctie geboekt", vast.json?.correcties_geboekt === 1, String(vast.json?.correcties_geboekt));
  check("vastgesteld door gevuld", !!vast.json?.vastgesteld_door_naam);

  const [voorraadNa] = await db.select().from(voorraadTable).where(eq(voorraadTable.artikelId, artikel!.id));
  check("voorraad bijgewerkt naar geteld (8)", voorraadNa?.hoeveelheid === 8, String(voorraadNa?.hoeveelheid));
  const correcties = await db.select().from(voorraadMutatiesTable).where(and(
    eq(voorraadMutatiesTable.artikelId, artikel!.id),
    eq(voorraadMutatiesTable.type, "correctie"),
  ));
  check("correctiemutatie met verwijzing naar telling",
    correcties.length === 1 && correcties[0]!.referentieType === "voorraadtelling"
    && correcties[0]!.referentieId === tellingId && correcties[0]!.delta === -2,
    JSON.stringify(correcties.map((c) => ({ t: c.referentieType, id: c.referentieId, d: c.delta }))));

  // 5. Onwijzigbaar na vaststellen (server-side)
  const naRegel = await api(admin, "POST", `/magazijn/tellingen/${tellingId}/regels`, {
    artikel_id: artikel!.id, geteld_aantal: 99,
  });
  check("regel muteren na vaststellen → 409", naRegel.status === 409, String(naRegel.status));
  const naVast = await api(admin, "POST", `/magazijn/tellingen/${tellingId}/vaststellen`);
  check("nogmaals vaststellen → 409", naVast.status === 409, String(naVast.status));
  const naDel = await api(admin, "DELETE", `/magazijn/tellingen/${tellingId}`);
  check("telling verwijderen na vaststellen → 409", naDel.status === 409, String(naDel.status));

  // 6. Prijswijziging NA vaststelling verandert de bevroren telling niet
  await db.update(artikelenTable).set({ inkoopprijs: 99.99 }).where(eq(artikelenTable.id, artikel!.id));
  const detail = await api(admin, "GET", `/magazijn/tellingen/${tellingId}`);
  const dRegel = detail.json?.regels?.[0];
  check("bevroren prijs blijft 12.50 na prijswijziging", dRegel?.prijs === 12.5, String(dRegel?.prijs));
  check("bevroren waarde blijft 100.00", dRegel?.waarde === 100, String(dRegel?.waarde));
  check("bevroren administratieve stand blijft 10", dRegel?.administratieve_voorraad === 10, String(dRegel?.administratieve_voorraad));

  // 7. Uitvoer voor de boekhouder: juiste totalen uit bevroren regels
  const totaal = (detail.json?.regels ?? []).reduce((s: number, r: any) => s + (r.waarde ?? 0), 0);
  check("uitvoer-totaal = 100.00 (8 × 12.50)", totaal === 100, String(totaal));
  check("peildatum in uitvoer", detail.json?.peildatum === "2026-12-31");

  // 8. Gelijktijdigheid: een regel-mutatie serialiseert volledig vóór of ná
  // een lopende vaststelling. We simuleren de vaststellen-transactie door de
  // telling FOR UPDATE te vergrendelen; de HTTP-upsert moet dan blokkeren en
  // ná de statuswissel 409 krijgen — nooit "ertussenin" schrijven.
  const [artikel2] = await db.insert(artikelenTable).values({
    naam: `${TESTNAAM} 2`, code: "BEW-TEL-02", eenheid: "st", inkoopprijs: 5,
  }).returning();
  await db.insert(voorraadTable).values({ artikelId: artikel2!.id, locatieId: null, hoeveelheid: 5 });
  const t2 = await api(admin, "POST", "/magazijn/tellingen", {
    peildatum: "2026-12-31", grondslag: "inkoopprijs", omschrijving: "BEWIJS-VOORRAADTELLING race",
  });
  const t2Id = t2.json?.id as number;
  await api(admin, "POST", `/magazijn/tellingen/${t2Id}/regels`, {
    artikel_id: artikel2!.id, geteld_aantal: 5, bevestigd: true,
  });

  let upsertKlaar = false;
  let upsertResultaat: { status: number; json: any } | null = null;
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM voorraad_tellingen WHERE id = ${t2Id} FOR UPDATE`);
    // Gelijktijdige mutatiepoging terwijl de "vaststeller" de lock houdt
    const p = api(admin, "POST", `/magazijn/tellingen/${t2Id}/regels`, {
      artikel_id: artikel2!.id, geteld_aantal: 999, bevestigd: false,
    }).then((r) => { upsertKlaar = true; upsertResultaat = r; });
    await new Promise((res) => setTimeout(res, 1500));
    check("gelijktijdige upsert blokkeert zolang de vaststel-lock vastzit", !upsertKlaar);
    await tx.execute(sql`UPDATE voorraad_tellingen SET status = 'vastgesteld' WHERE id = ${t2Id}`);
    // lock komt vrij bij commit; daarna moet de upsert 409 zien
    void p;
  });
  for (let i = 0; i < 100 && !upsertKlaar; i++) await new Promise((res) => setTimeout(res, 100));
  check("geblokkeerde upsert krijgt 409 ná vaststelling (niet ertussenin geschreven)",
    (upsertResultaat as any)?.status === 409, String((upsertResultaat as any)?.status));
  const [raceRegel] = await db.select().from(voorraadTellingRegelsTable)
    .where(eq(voorraadTellingRegelsTable.tellingId, t2Id));
  check("regel ongewijzigd gebleven (geteld blijft 5)", raceRegel?.geteldAantal === 5, String(raceRegel?.geteldAantal));

  // 9. Gelijktijdigheid: DELETE van de telling racet met vaststellen.
  // De delete leest "open", maar moet ná de FOR UPDATE-lock de status herchecken
  // en 409 geven — nooit een net-vastgestelde telling (met bewijs) wegvagen.
  const [artikel3] = await db.insert(artikelenTable).values({
    naam: `${TESTNAAM} 3`, code: "BEW-TEL-03", eenheid: "st", inkoopprijs: 2,
  }).returning();
  await db.insert(voorraadTable).values({ artikelId: artikel3!.id, locatieId: null, hoeveelheid: 3 });
  const t3 = await api(admin, "POST", "/magazijn/tellingen", {
    peildatum: "2026-12-31", grondslag: "inkoopprijs", omschrijving: "BEWIJS-VOORRAADTELLING delete-race",
  });
  const t3Id = t3.json?.id as number;
  await api(admin, "POST", `/magazijn/tellingen/${t3Id}/regels`, {
    artikel_id: artikel3!.id, geteld_aantal: 3, bevestigd: true,
  });

  let deleteKlaar = false;
  let deleteResultaat: { status: number; json: any } | null = null;
  await db.transaction(async (tx) => {
    // Simuleer de vaststellen-tx: lock + statuswissel terwijl de delete binnenkomt
    await tx.execute(sql`SELECT id FROM voorraad_tellingen WHERE id = ${t3Id} FOR UPDATE`);
    const p = api(admin, "DELETE", `/magazijn/tellingen/${t3Id}`)
      .then((r) => { deleteKlaar = true; deleteResultaat = r; });
    await new Promise((res) => setTimeout(res, 1500));
    check("gelijktijdige delete blokkeert zolang de vaststel-lock vastzit", !deleteKlaar);
    await tx.execute(sql`UPDATE voorraad_tellingen SET status = 'vastgesteld' WHERE id = ${t3Id}`);
    void p;
  });
  for (let i = 0; i < 100 && !deleteKlaar; i++) await new Promise((res) => setTimeout(res, 100));
  check("geblokkeerde delete krijgt 409 ná vaststelling (bewijs blijft bestaan)",
    (deleteResultaat as any)?.status === 409, String((deleteResultaat as any)?.status));
  const [t3Na] = await db.select().from(voorraadTellingenTable).where(eq(voorraadTellingenTable.id, t3Id));
  const t3Regels = await db.select().from(voorraadTellingRegelsTable).where(eq(voorraadTellingRegelsTable.tellingId, t3Id));
  check("vastgestelde telling + regels niet weggevaagd", !!t3Na && t3Regels.length === 1);

  // 10. Gelijktijdigheid: een gewone voorraadmutatie racet met vaststellen.
  // We houden de voorraadrij FOR UPDATE vast (zoals een lopende uitgifte/correctie),
  // wijzigen de stand 10→6 en committen pas dan. Vaststellen moet blokkeren en
  // daarna bevriezen op de wérkelijke stand (6) — nooit op de stale 10.
  const [artikel4] = await db.insert(artikelenTable).values({
    naam: `${TESTNAAM} 4`, code: "BEW-TEL-04", eenheid: "st", inkoopprijs: 3,
  }).returning();
  await db.insert(voorraadTable).values({ artikelId: artikel4!.id, locatieId: null, hoeveelheid: 10 });
  const t4 = await api(admin, "POST", "/magazijn/tellingen", {
    peildatum: "2026-12-31", grondslag: "inkoopprijs", omschrijving: "BEWIJS-VOORRAADTELLING voorraad-race",
  });
  const t4Id = t4.json?.id as number;
  await api(admin, "POST", `/magazijn/tellingen/${t4Id}/regels`, {
    artikel_id: artikel4!.id, geteld_aantal: 6, bevestigd: true,
  });

  let vastKlaar = false;
  let vastResultaat: { status: number; json: any } | null = null;
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM voorraad WHERE artikel_id = ${artikel4!.id} AND locatie_id IS NULL FOR UPDATE`);
    const p = api(admin, "POST", `/magazijn/tellingen/${t4Id}/vaststellen`)
      .then((r) => { vastKlaar = true; vastResultaat = r; });
    await new Promise((res) => setTimeout(res, 1500));
    check("vaststellen blokkeert zolang een voorraadmutatie de rij vergrendeld houdt", !vastKlaar);
    await tx.execute(sql`UPDATE voorraad SET hoeveelheid = 6 WHERE artikel_id = ${artikel4!.id} AND locatie_id IS NULL`);
    void p;
  });
  for (let i = 0; i < 100 && !vastKlaar; i++) await new Promise((res) => setTimeout(res, 100));
  check("vaststellen slaagt ná de mutatie", (vastResultaat as any)?.status === 200, String((vastResultaat as any)?.status));
  const [t4Regel] = await db.select().from(voorraadTellingRegelsTable)
    .where(eq(voorraadTellingRegelsTable.tellingId, t4Id));
  check("bevroren stand = wérkelijke stand ná de mutatie (6, niet stale 10)",
    t4Regel?.administratieveVoorraad === 6, String(t4Regel?.administratieveVoorraad));
  const t4Correcties = await db.select().from(voorraadMutatiesTable).where(and(
    eq(voorraadMutatiesTable.artikelId, artikel4!.id),
    eq(voorraadMutatiesTable.type, "correctie"),
  ));
  check("geen correctie geboekt (geteld 6 == werkelijke stand 6)", t4Correcties.length === 0, String(t4Correcties.length));

  // 10b. Race "geen voorraadrij → gelijktijdige ontvangst → vaststellen":
  // zonder voorraadrij valt er geen rij te locken; de gedeelde serialisatiegrens
  // is dan het artikelrecord. We houden die lock vast (zoals bijwerkenVoorraad),
  // voegen de voorraadrij toe (stand 4) en committen — vaststellen moet blokkeren
  // en daarna op 4 bevriezen, nooit op de stale 0.
  const [artikel5] = await db.insert(artikelenTable).values({
    naam: `${TESTNAAM} 5`, code: "BEW-TEL-05", eenheid: "st", inkoopprijs: 7,
  }).returning();
  // bewust GEEN voorraadrij aanmaken
  const t5 = await api(admin, "POST", "/magazijn/tellingen", {
    peildatum: "2026-12-31", grondslag: "inkoopprijs", omschrijving: "BEWIJS-VOORRAADTELLING geen-rij-race",
  });
  const t5Id = t5.json?.id as number;
  await api(admin, "POST", `/magazijn/tellingen/${t5Id}/regels`, {
    artikel_id: artikel5!.id, geteld_aantal: 4, bevestigd: true,
  });

  let vast5Klaar = false;
  let vast5Resultaat: { status: number; json: any } | null = null;
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM artikelen WHERE id = ${artikel5!.id} FOR UPDATE`);
    const p = api(admin, "POST", `/magazijn/tellingen/${t5Id}/vaststellen`)
      .then((r) => { vast5Klaar = true; vast5Resultaat = r; });
    await new Promise((res) => setTimeout(res, 1500));
    check("vaststellen blokkeert op artikel-lock óók zonder voorraadrij", !vast5Klaar);
    await tx.execute(sql`INSERT INTO voorraad (artikel_id, locatie_id, hoeveelheid) VALUES (${artikel5!.id}, NULL, 4)`);
    void p;
  });
  for (let i = 0; i < 100 && !vast5Klaar; i++) await new Promise((res) => setTimeout(res, 100));
  check("vaststellen slaagt ná de gelijktijdige ontvangst", (vast5Resultaat as any)?.status === 200, String((vast5Resultaat as any)?.status));
  const [t5Regel] = await db.select().from(voorraadTellingRegelsTable)
    .where(eq(voorraadTellingRegelsTable.tellingId, t5Id));
  check("bevroren stand = 4 (nieuw ingevoegde rij, niet stale 0)",
    t5Regel?.administratieveVoorraad === 4, String(t5Regel?.administratieveVoorraad));
  const [v5] = await db.select().from(voorraadTable).where(and(
    eq(voorraadTable.artikelId, artikel5!.id), sql`${voorraadTable.locatieId} IS NULL`,
  ));
  check("werkelijke voorraad blijft consistent (4, geen dubbele correctie)", v5?.hoeveelheid === 4, String(v5?.hoeveelheid));

  // 12. ECHTE HTTP-race: vaststellen vs. directe voorraadcorrectie, beide via
  // de echte endpoints tegelijk. De uitkomst moet serialiseerbaar zijn: óf de
  // correctie kwam ná de vaststelling (bevroren 10, daarna −4), óf ervoor
  // (bevroren 6). Elke andere combinatie = verloren update.
  const [artikel6] = await db.insert(artikelenTable).values({
    naam: `${TESTNAAM} 6`, code: "BEW-TEL-06", eenheid: "st", inkoopprijs: 1,
  }).returning();
  await db.insert(voorraadTable).values({ artikelId: artikel6!.id, locatieId: null, hoeveelheid: 10 });
  const t6 = await api(admin, "POST", "/magazijn/tellingen", {
    peildatum: "2026-12-31", grondslag: "inkoopprijs", omschrijving: "BEWIJS-VOORRAADTELLING http-race",
  });
  const t6Id = t6.json?.id as number;
  await api(admin, "POST", `/magazijn/tellingen/${t6Id}/regels`, {
    artikel_id: artikel6!.id, geteld_aantal: 7, bevestigd: true,
  });

  const [vastR, corrR] = await Promise.all([
    api(admin, "POST", `/magazijn/tellingen/${t6Id}/vaststellen`),
    api(admin, "POST", "/magazijn/voorraad/correctie", { artikel_id: artikel6!.id, delta: -4, omschrijving: "BEWIJS race-correctie" }),
  ]);
  check("beide gelijktijdige verzoeken slagen (vaststellen 200, correctie 201)",
    vastR.status === 200 && corrR.status === 201, `${vastR.status}/${corrR.status}`);
  const [t6Regel] = await db.select().from(voorraadTellingRegelsTable)
    .where(eq(voorraadTellingRegelsTable.tellingId, t6Id));
  const [v6] = await db.select().from(voorraadTable).where(and(
    eq(voorraadTable.artikelId, artikel6!.id), sql`${voorraadTable.locatieId} IS NULL`,
  ));
  const bevroren6 = t6Regel?.administratieveVoorraad;
  const serialiseerbaar =
    (bevroren6 === 10 && v6?.hoeveelheid === 3)   // vaststellen eerst: 10→7(geteld), dan −4 = 3
    || (bevroren6 === 6 && v6?.hoeveelheid === 7); // correctie eerst: 10−4=6, vaststellen → geteld 7
  check("uitkomst is serialiseerbaar (geen verloren update tussen lezen en schrijven)",
    serialiseerbaar, `bevroren=${bevroren6}, eind=${v6?.hoeveelheid}`);

  // 13. ECHTE HTTP-race: vaststellen vs. verplaatsing (absolute schrijfacties).
  const [lokA] = await db.insert(magazijnLocatiesTable).values({ naam: "BEWIJS-VOORRAADTELLING-LOC-A" }).returning();
  const [lokB] = await db.insert(magazijnLocatiesTable).values({ naam: "BEWIJS-VOORRAADTELLING-LOC-B" }).returning();
  const [artikel7] = await db.insert(artikelenTable).values({
    naam: `${TESTNAAM} 7`, code: "BEW-TEL-07", eenheid: "st", inkoopprijs: 1,
  }).returning();
  await db.insert(voorraadTable).values({ artikelId: artikel7!.id, locatieId: lokA!.id, hoeveelheid: 10 });
  const t7 = await api(admin, "POST", "/magazijn/tellingen", {
    peildatum: "2026-12-31", grondslag: "inkoopprijs", omschrijving: "BEWIJS-VOORRAADTELLING verplaats-race",
  });
  const t7Id = t7.json?.id as number;
  await api(admin, "POST", `/magazijn/tellingen/${t7Id}/regels`, {
    artikel_id: artikel7!.id, locatie_id: lokA!.id, geteld_aantal: 10, bevestigd: true,
  });
  const [vast7R, verplR] = await Promise.all([
    api(admin, "POST", `/magazijn/tellingen/${t7Id}/vaststellen`),
    api(admin, "POST", "/magazijn/verplaatsingen", {
      artikel_id: artikel7!.id, hoeveelheid: 5, van_locatie_id: lokA!.id, naar_locatie_id: lokB!.id,
    }),
  ]);
  check("vaststellen én verplaatsing slagen beide", vast7R.status === 200 && verplR.status === 201, `${vast7R.status}/${verplR.status}`);
  const [t7Regel] = await db.select().from(voorraadTellingRegelsTable)
    .where(eq(voorraadTellingRegelsTable.tellingId, t7Id));
  const [vA] = await db.select().from(voorraadTable).where(and(
    eq(voorraadTable.artikelId, artikel7!.id), eq(voorraadTable.locatieId, lokA!.id)));
  const [vB] = await db.select().from(voorraadTable).where(and(
    eq(voorraadTable.artikelId, artikel7!.id), eq(voorraadTable.locatieId, lokB!.id)));
  const bevroren7 = t7Regel?.administratieveVoorraad;
  const serial7 =
    (bevroren7 === 10 && vA?.hoeveelheid === 5 && vB?.hoeveelheid === 5)   // vaststellen eerst
    || (bevroren7 === 5 && vA?.hoeveelheid === 10 && vB?.hoeveelheid === 5); // verplaatsing eerst, correctie +5 op A
  check("verplaatsing-uitkomst is serialiseerbaar (geen stale absolute schrijfactie)",
    serial7, `bevroren=${bevroren7}, A=${vA?.hoeveelheid}, B=${vB?.hoeveelheid}`);

  // 14. Halve-cent aritmetiek: 0,30 × €3,35 = €1,005 → moet €1,01 worden
  // (half-weg-van-nul), zowel in de open verschillenlijst als bevroren/print.
  const [artikel8] = await db.insert(artikelenTable).values({
    naam: `${TESTNAAM} 8`, code: "BEW-TEL-08", eenheid: "st", inkoopprijs: 3.35,
  }).returning();
  const t8 = await api(admin, "POST", "/magazijn/tellingen", {
    peildatum: "2026-12-31", grondslag: "inkoopprijs", omschrijving: "BEWIJS-VOORRAADTELLING halve-cent",
  });
  const t8Id = t8.json?.id as number;
  await api(admin, "POST", `/magazijn/tellingen/${t8Id}/regels`, {
    artikel_id: artikel8!.id, geteld_aantal: 0.3, bevestigd: true,
  });
  const versch8 = await api(admin, "GET", `/magazijn/tellingen/${t8Id}/verschillen`);
  const v8 = versch8.json?.regels?.[0];
  check("open verschillenlijst: 0,30 × 3,35 → geteld_waarde €1,01 (niet 1,00)",
    v8?.geteld_waarde === 1.01, String(v8?.geteld_waarde));
  check("open verschillenlijst: verschil_waarde €1,01", v8?.verschil_waarde === 1.01, String(v8?.verschil_waarde));
  check("totaal geteld waarde €1,01", versch8.json?.totaal_geteld_waarde === 1.01, String(versch8.json?.totaal_geteld_waarde));
  const vast8 = await api(admin, "POST", `/magazijn/tellingen/${t8Id}/vaststellen`);
  check("halve-cent telling vaststellen slaagt", vast8.status === 200, String(vast8.status));
  const [t8Regel] = await db.select().from(voorraadTellingRegelsTable)
    .where(eq(voorraadTellingRegelsTable.tellingId, t8Id));
  check("bevroren waarde = €1,01 (print/boekhouder-uitvoer)", t8Regel?.waarde === 1.01, String(t8Regel?.waarde));

  // 15. ECHTE HTTP-race: twee gelijktijdige uitgiftes van elk 6 uit stand 10.
  // De beschikbaarheidscontrole zit BINNEN de transactie ná de artikel-lock:
  // precies één slaagt (201), de ander ziet de verlaagde stand en krijgt 422 —
  // nooit twee 201's met een stilzwijgend geclampte stand.
  const [artikel9] = await db.insert(artikelenTable).values({
    naam: `${TESTNAAM} 9`, code: "BEW-TEL-09", eenheid: "st", inkoopprijs: 1,
  }).returning();
  await db.insert(voorraadTable).values({ artikelId: artikel9!.id, locatieId: null, hoeveelheid: 10 });
  const uitgifteBody = { regels: [{ artikel_id: artikel9!.id, hoeveelheid: 6 }], omschrijving: "BEWIJS race-uitgifte" };
  const [u1, u2] = await Promise.all([
    api(admin, "POST", "/magazijn/uitgiftes", uitgifteBody),
    api(admin, "POST", "/magazijn/uitgiftes", uitgifteBody),
  ]);
  const statussen = [u1.status, u2.status].sort();
  check("gelijktijdige uitgiftes: precies één 201 en één 422 (geen dubbele toekenning)",
    statussen[0] === 201 && statussen[1] === 422, statussen.join("/"));
  const [v9] = await db.select().from(voorraadTable).where(and(
    eq(voorraadTable.artikelId, artikel9!.id), sql`${voorraadTable.locatieId} IS NULL`));
  check("eindstand na race-uitgiftes = 4 (10 − 6, één keer)", v9?.hoeveelheid === 4, String(v9?.hoeveelheid));

  // 11. Peildatum moet een échte kalenderdatum zijn
  const nepDatum = await api(admin, "POST", "/magazijn/tellingen", {
    peildatum: "2026-02-30", grondslag: "inkoopprijs",
  });
  check("onmogelijke peildatum (30 februari) → 422", nepDatum.status === 422, String(nepDatum.status));

  await opruimen();

  console.log(`\nResultaat: ${geslaagd} geslaagd, ${gefaald} gefaald`);
  if (gefaald > 0) process.exit(1);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
