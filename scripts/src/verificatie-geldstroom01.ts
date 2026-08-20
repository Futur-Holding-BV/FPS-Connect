/**
 * GELDSTROOM_01 gedragsbewijs — de twee geld-uiteinden als één keten.
 *
 * Verkoopkant (KETEN_01 B2):
 *  V1. Verkoopfactuur samenstellen uit de OFFERTE op de opdracht: concept met
 *      regels; optionele niet-gekozen offerteregels tellen niet mee.
 *  V2. Regels blijven aanpasbaar (PATCH regel).
 *  V3. Versturen naar de klant vóór definitief → 409 (fiscaal nummer eerst).
 *  V4. Definitief maken → fiscaal nummer uit de BV-teller (NUMMER_01 §4.6).
 *  V5. Versturen naar de klant ná definitief → echte Microsoft Graph-overdracht
 *      naar de gedeelde productiepostbus; logboek + tijdlijn, nooit wachtrij.
 *  V5b. Onderdrukte/falende mail → duidelijke fout, geen verzonden-tijdlijn.
 *  V6. Samenstellen uit de WERKBEGROTING werkt ook.
 *  V7. Een definitieve verkoopfactuur kan per regel en geheel worden
 *      gecrediteerd; iedere credit krijgt een eigen fiscaal nummer en dezelfde
 *      bronregel kan ook bij gelijktijdige verzoeken maar één keer mee.
 *
 * Inkoopkant (FACTUUR_03):
 *  I1. goedkeuren-stroom ZONDER passende beleidsregel → 422 fail-closed
 *      (nooit automatische goedkeuring; grens staat in beheer, niet in code).
 *  I2. goedkeuren-stroom MET beleidsregel maar zonder goedgekeurde aanvraag
 *      → 422 viaGoedkeuring (goedkeuringsmotor niet te omzeilen).
 *  I3. Betaalbatch bevestigen door financieel:4-gebruiker (geen directie)
 *      → 403: de vrijgave is één vaste directiepoort zonder delegatie.
 *  I4. Betaalbatch bevestigen door de hoofdbeheerder (directie) → slaagt.
 *  I5. betaalbatch_actief-schakelaar omzetten door niet-hoofdbeheerder → 403.
 *
 * Draaien: pnpm --filter @workspace/scripts exec tsx src/verificatie-geldstroom01.ts
 */
import "./lib/prodGuard";
import bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import {
  db, gebruikersTable, offertesTable, offerteRegelsTable, opdrachtenTable,
  facturenTable, factuurRegelsTable, projectBegrotingenTable,
  werkbegrotingRegelsTable, betaalbatchesTable, appInstellingenTable,
  werkgeversTable, goedkeuringBeleidsregelsTable, crmKlantenTable,
  factuurTijdlijnTable, mailLogboekTable, mailWachtrijTable,
  factuurnummerTellersTable,
} from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";

const BASIS = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
const WACHTWOORD = "Geldstroom01Test!2026";
const ECHTE_MAILBOX = process.env.MAIL_MAILBOX;

function faal(msg: string): never { console.error(`❌ FAAL: ${msg}`); process.exit(1); }
function ok(msg: string) { console.log(`✅ ${msg}`); }

const ACCOUNTS = {
  admin: { email: "geldstroom01-admin@fps.local", totp: "GELDADMIN2345678", rol: "hoofdbeheerder" as const, bevoegdheden: {} as Record<string, number> },
  fin: { email: "geldstroom01-fin@fps.local", totp: "GELDFINAN2345678", rol: "gebruiker" as const, bevoegdheden: { financieel: 4, projecten: 3, offertes: 2 } },
};
type Account = (typeof ACCOUNTS)[keyof typeof ACCOUNTS];

async function maakGebruiker(a: Account): Promise<number> {
  if (process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === "production") throw new Error("GEWEIGERD: testaccounts alleen in dev");
  const hash = await bcrypt.hash(WACHTWOORD, 10);
  const [bestaand] = await db.select({ id: gebruikersTable.id }).from(gebruikersTable).where(eq(gebruikersTable.email, a.email));
  if (bestaand) {
    await db.update(gebruikersTable).set({ wachtwoord: hash, rol: a.rol, bevoegdheden: a.bevoegdheden, actief: true, gearchiveerd: false, totpSecret: a.totp, tweeFactorIngeschakeld: true }).where(eq(gebruikersTable.id, bestaand.id));
    return bestaand.id;
  }
  const [rij] = await db.insert(gebruikersTable).values({
    naam: `GELDSTROOM_01 test (${a.email.split("@")[0]})`,
    email: a.email, wachtwoord: hash, rol: a.rol, bevoegdheden: a.bevoegdheden,
    actief: true, totpSecret: a.totp, tweeFactorIngeschakeld: true,
  }).returning({ id: gebruikersTable.id });
  return rij.id;
}

async function login(a: Account): Promise<string> {
  const resp = await fetch(`${BASIS}/auth/mobile/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: a.email, wachtwoord: WACHTWOORD, code: authenticator.generate(a.totp) }),
  });
  if (!resp.ok) faal(`login ${a.email} → ${resp.status}: ${await resp.text()}`);
  const { token } = (await resp.json()) as { token: string };
  return `Bearer ${token}`;
}

async function api(auth: string, methode: string, pad: string, body?: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const resp = await fetch(`${BASIS}${pad}`, {
    method: methode,
    headers: { Authorization: auth, "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let json: Record<string, unknown> = {};
  try { json = (await resp.json()) as Record<string, unknown>; } catch { /* leeg */ }
  return { status: resp.status, json };
}

async function main() {
  const opgeruimd: { facturen: number[]; opdrachten: number[]; offertes: number[]; klanten: number[]; begrotingen: number[]; batches: number[]; beleidsregels: number[]; gebruikers: number[]; werkgevers: number[] } =
    { facturen: [], opdrachten: [], offertes: [], klanten: [], begrotingen: [], batches: [], beleidsregels: [], gebruikers: [], werkgevers: [] };

  const adminId = await maakGebruiker(ACCOUNTS.admin);
  const finId = await maakGebruiker(ACCOUNTS.fin);
  opgeruimd.gebruikers.push(adminId, finId);
  const admin = await login(ACCOUNTS.admin);
  const fin = await login(ACCOUNTS.fin);
  ok("Testaccounts aangemaakt en ingelogd (hoofdbeheerder + financieel:4)");

  // ── Testdata: klant, offerte met regels (1 optioneel-niet-gekozen), opdracht ─
  const [klant] = await db.insert(crmKlantenTable).values({
    naam: "GELDSTROOM_01 Testklant BV", email: "geldstroom01-klant@voorbeeld.example",
  } as typeof crmKlantenTable.$inferInsert).returning({ id: crmKlantenTable.id });
  opgeruimd.klanten.push(klant.id);
  const [wgVooraf] = await db.select({ id: werkgeversTable.id }).from(werkgeversTable).limit(1);
  if (!wgVooraf) faal("Geen werkgever (BV) aanwezig in dev");
  const [andereWerkgever] = await db
    .insert(werkgeversTable)
    .values({ naam: `GELDSTROOM_01 tijdelijke race-BV ${Date.now()}` })
    .returning({ id: werkgeversTable.id });
  opgeruimd.werkgevers.push(andereWerkgever.id);
  const [offerte] = await db.insert(offertesTable).values({
    titel: "GELDSTROOM_01 testofferte", klantId: klant.id, opdrachtgever: "GELDSTROOM_01 Testklant BV",
    betalingstermijnDagen: 14, werkmaatschappijId: wgVooraf.id,
  } as typeof offertesTable.$inferInsert).returning({ id: offertesTable.id });
  opgeruimd.offertes.push(offerte.id);
  await db.insert(offerteRegelsTable).values([
    { offerteId: offerte.id, maatregel: "Brandwerende doorvoer afdichten", ruimte: "Kelder", eenheid: "st", aantal: 10, prijsPerEenheid: 45, kosten: 450, volgorde: 1 },
    { offerteId: offerte.id, maatregel: "Brandklep vervangen", eenheid: "st", aantal: 2, prijsPerEenheid: 300, kosten: 600, volgorde: 2 },
    { offerteId: offerte.id, maatregel: "OPTIONEEL niet gekozen", eenheid: "st", aantal: 1, prijsPerEenheid: 999, kosten: 999, volgorde: 3, isOptioneel: true, optioneelGeselecteerd: false },
  ] as (typeof offerteRegelsTable.$inferInsert)[]);
  const [opdracht] = await db.insert(opdrachtenTable).values({
    titel: "GELDSTROOM_01 testopdracht", offerteId: offerte.id, werknummer: "GS01-TEST",
  } as typeof opdrachtenTable.$inferInsert).returning({ id: opdrachtenTable.id });
  opgeruimd.opdrachten.push(opdracht.id);

  // ── V1: samenstellen uit offerte ─────────────────────────────────────────
  const v1 = await api(fin, "POST", `/opdrachten/${opdracht.id}/verkoopfactuur`, { bron: "offerte" });
  if (v1.status !== 201) faal(`V1 samenstellen uit offerte → ${v1.status}: ${JSON.stringify(v1.json)}`);
  const factuurId = v1.json["id"] as number;
  opgeruimd.facturen.push(factuurId);
  const regels = await db.select().from(factuurRegelsTable).where(eq(factuurRegelsTable.factuurId, factuurId));
  if (regels.length !== 2) faal(`V1: verwacht 2 regels (optioneel-niet-gekozen uitgesloten), kreeg ${regels.length}`);
  const [f1] = await db.select().from(facturenTable).where(eq(facturenTable.id, factuurId));
  if (f1.bedragExclBtw !== "1050.00") faal(`V1: totaal excl. verwacht 1050.00, kreeg ${f1.bedragExclBtw}`);
  if (f1.factuurnummer !== null) faal("V1: concept mag géén fiscaal nummer hebben");
  if (f1.relatienaam !== "GELDSTROOM_01 Testklant BV") faal(`V1: relatienaam uit CRM verwacht, kreeg ${f1.relatienaam}`);
  ok(`V1 Concept samengesteld uit offerte: 2 regels (optioneel uitgesloten), € 1050,00 excl., F-nummer ${f1.nummer}, geen fiscaal nummer`);

  // ── V2: regel aanpasbaar ─────────────────────────────────────────────────
  const eersteRegel = regels[0]!;
  const v2 = await api(fin, "PATCH", `/facturen/${factuurId}/regels/${eersteRegel.id}`, { omschrijving: "Aangepaste regelomschrijving", bedrag_excl_btw: "500.00" });
  if (v2.status !== 200) faal(`V2 regel aanpassen → ${v2.status}: ${JSON.stringify(v2.json)}`);
  // Architect-review: de koptotalen moeten uit de regels herberekend zijn
  // (450→500 ⇒ excl. 1100.00, btw 231.00, incl. 1331.00) in centen-rekenwerk.
  const [f2] = await db.select().from(facturenTable).where(eq(facturenTable.id, factuurId));
  if (f2.bedragExclBtw !== "1100.00" || f2.btwBedrag !== "231.00" || f2.bedragInclBtw !== "1331.00") {
    faal(`V2: koptotalen niet herberekend — excl=${f2.bedragExclBtw} btw=${f2.btwBedrag} incl=${f2.bedragInclBtw} (verwacht 1100.00/231.00/1331.00)`);
  }
  const v2b = await api(fin, "PATCH", `/facturen/${factuurId}/regels/${eersteRegel.id}`, { bedrag_excl_btw: "geen-bedrag" });
  if (v2b.status !== 400) faal(`V2b: ongeldig bedrag moet 400 geven, kreeg ${v2b.status}`);
  ok("V2 Regel aangepast én koptotalen herberekend (excl 1100,00 / btw 231,00 / incl 1331,00); ongeldig bedrag → 400");

  // ── V3: versturen vóór definitief → 409 ──────────────────────────────────
  const v3 = await api(fin, "POST", `/facturen/${factuurId}/verzenden-klant`, {});
  if (v3.status !== 409) faal(`V3 versturen vóór definitief: verwacht 409, kreeg ${v3.status}: ${JSON.stringify(v3.json)}`);
  ok("V3 Versturen vóór definitief geweigerd (409: eerst fiscaal nummer)");

  // ── V3b/c: creditnota kan niet om de beschermde creditroute heen ─────────
  const v3b = await api(fin, "POST", "/facturen", {
    type: "verkoop",
    subtype: "creditnota",
    relatienaam: "GELDSTROOM_01 ongeldige losse credit",
    bedrag_excl_btw: "-10.00",
    btw_bedrag: "-2.10",
    bedrag_incl_btw: "-12.10",
  });
  if (v3b.status !== 422) {
    faal(`V3b: losse creditnota via algemeen aanmaakpad moet 422 geven, kreeg ${v3b.status}`);
  }
  const [losCreditConcept] = await db
    .insert(facturenTable)
    .values({
      type: "verkoop",
      subtype: "creditnota",
      offerteId: offerte.id,
      relatienaam: "GELDSTROOM_01 rechtstreeks ingevoerd creditconcept",
      bedragExclBtw: "-10.00",
      btwBedrag: "-2.10",
      bedragInclBtw: "-12.10",
    })
    .returning({ id: facturenTable.id });
  opgeruimd.facturen.push(losCreditConcept.id);
  const v3c = await api(fin, "POST", `/facturen/${losCreditConcept.id}/definitief`);
  if (v3c.status !== 422) {
    faal(`V3c: rechtstreeks ingevoerd creditconcept definitief maken moet 422 geven, kreeg ${v3c.status}`);
  }
  const [losCreditNaPoging] = await db
    .select({ factuurnummer: facturenTable.factuurnummer })
    .from(facturenTable)
    .where(eq(facturenTable.id, losCreditConcept.id));
  if (losCreditNaPoging?.factuurnummer != null) {
    faal(`V3c: geweigerde losse credit verbruikte toch fiscaal nummer ${losCreditNaPoging.factuurnummer}`);
  }
  ok("V3b/c Losse creditnota wordt bij algemeen aanmaken én definitief maken geweigerd; alleen de beschermde creditroute blijft open");

  // ── V4: definitief maken → atomaire BV-snapshot + fiscaal nummer ─────────
  // Houd de offerte-BV in een aparte transactie vast en wijzig haar daar naar
  // BV B. /definitief moet aantoonbaar op die bronlock wachten, daarna B
  // herlezen en uitsluitend de teller van B ophogen. De oude pre-transactie-
  // afleiding rondde al af met BV A terwijl deze wijziging nog niet committed was.
  const [tellerVoorafA] = await db
    .select({ laatsteNummer: factuurnummerTellersTable.laatsteNummer })
    .from(factuurnummerTellersTable)
    .where(eq(factuurnummerTellersTable.werkgeverId, wgVooraf.id));
  const tellerstandVoorafA = tellerVoorafA?.laatsteNummer ?? 0;
  let definitiefPromise: ReturnType<typeof api> | undefined;
  await db.transaction(async (tx) => {
    const pidResult = await tx.execute(sql`SELECT pg_backend_pid()::int AS pid`);
    const blockerPid = Number((pidResult.rows[0] as { pid: number } | undefined)?.pid);
    if (!Number.isInteger(blockerPid)) faal("V4: backend-pid voor raceproef ontbreekt");

    await tx
      .update(offertesTable)
      .set({ werkmaatschappijId: andereWerkgever.id })
      .where(eq(offertesTable.id, offerte.id));

    definitiefPromise = api(fin, "POST", `/facturen/${factuurId}/definitief`);
    let bronLockAfgewacht = false;
    for (let poging = 0; poging < 40; poging++) {
      const wachtResultaat = await db.execute(sql`
        SELECT EXISTS (
          SELECT 1
          FROM pg_stat_activity
          WHERE ${blockerPid} = ANY(pg_blocking_pids(pid))
        ) AS geblokkeerd
      `);
      bronLockAfgewacht =
        (wachtResultaat.rows[0] as { geblokkeerd?: boolean } | undefined)?.geblokkeerd === true;
      if (bronLockAfgewacht) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (!bronLockAfgewacht) {
      faal("V4: definitief maken wachtte niet op de gelockte offerte-BV");
    }
  });
  const v4 = await definitiefPromise!;
  if (v4.status !== 200) faal(`V4 definitief → ${v4.status}: ${JSON.stringify(v4.json)}`);
  const [f4] = await db.select().from(facturenTable).where(eq(facturenTable.id, factuurId));
  if (!f4.factuurnummer) faal("V4: fiscaal nummer ontbreekt na definitief");
  if (f4.werkgeverId !== andereWerkgever.id || !f4.werkgeverVastgelegdOp) {
    faal(`V4: fiscale BV-momentopname volgde niet de gelockte keten (${f4.werkgeverId} i.p.v. ${andereWerkgever.id})`);
  }
  const [tellerNaA] = await db
    .select({ laatsteNummer: factuurnummerTellersTable.laatsteNummer })
    .from(factuurnummerTellersTable)
    .where(eq(factuurnummerTellersTable.werkgeverId, wgVooraf.id));
  const [tellerNaB] = await db
    .select({ laatsteNummer: factuurnummerTellersTable.laatsteNummer })
    .from(factuurnummerTellersTable)
    .where(eq(factuurnummerTellersTable.werkgeverId, andereWerkgever.id));
  if ((tellerNaA?.laatsteNummer ?? 0) !== tellerstandVoorafA || tellerNaB?.laatsteNummer !== 1) {
    faal(`V4: verkeerde BV-teller gewijzigd (A ${tellerstandVoorafA}→${tellerNaA?.laatsteNummer ?? 0}, B=${tellerNaB?.laatsteNummer ?? 0})`);
  }
  ok(`V4 Definitief wacht op de gelockte werk-BV en gebruikt atomair snapshot+teller van BV B; fiscaal nummer ${f4.factuurnummer}`);

  // ── V4b: ná definitief zijn regels onwijzigbaar (fiscale onveranderbaarheid) ─
  const v4b = await api(fin, "PATCH", `/facturen/${factuurId}/regels/${eersteRegel.id}`, { bedrag_excl_btw: "1.00" });
  if (v4b.status !== 409) faal(`V4b: regelwijziging ná definitief moet 409 geven, kreeg ${v4b.status}: ${JSON.stringify(v4b.json)}`);
  ok("V4b Regelwijziging ná definitief geweigerd (409) — correcties via creditering");
  const v4c = await api(fin, "PATCH", `/facturen/${factuurId}`, { omschrijving: "Ongeoorloofde kopwijziging" });
  if (v4c.status !== 409) faal(`V4c: kopwijziging ná definitief moet 409 geven, kreeg ${v4c.status}`);
  const v4d = await api(admin, "DELETE", `/facturen/${factuurId}`);
  if (v4d.status !== 409) faal(`V4d: definitieve verkoopfactuur verwijderen moet 409 geven, kreeg ${v4d.status}`);
  ok("V4c/d Definitief fiscaal dossier is ook op kopniveau onwijzigbaar en onverwijderbaar");

  // Wijzig de live werk-keten ná nummeruitgifte terug naar BV A. De factuur, creditering en
  // AccountView-resolver moeten vanaf nu uitsluitend de fiscale BV-snapshot
  // blijven gebruiken.
  await db
    .update(offertesTable)
    .set({ werkmaatschappijId: wgVooraf.id })
    .where(eq(offertesTable.id, offerte.id));
  // Simuleer een legacy-factuur waarvoor de BV bij uitgifte niet expliciet is
  // vastgelegd. De huidige offerte-BV mag dan niet als historische waarheid
  // worden gebruikt.
  await db
    .update(facturenTable)
    .set({ werkgeverId: null, werkgeverVastgelegdOp: null })
    .where(eq(facturenTable.id, factuurId));
  const legacyLezing = await api(fin, "GET", `/facturen/${factuurId}`);
  if (legacyLezing.status !== 200 || legacyLezing.json["werkmaatschappij_id"] !== null) {
    faal(`V4e: legacy zonder snapshot valt terug op actuele offerte-BV: ${JSON.stringify(legacyLezing.json)}`);
  }
  const legacyCredit = await api(fin, "POST", `/facturen/${factuurId}/crediteren`, {
    geheel: true,
    reden: "Legacy zonder fiscale BV moet blokkeren",
  });
  if (legacyCredit.status !== 422) {
    faal(`V4e: legacy zonder fiscale BV moet creditering fail-closed blokkeren, kreeg ${legacyCredit.status}`);
  }
  // De fiscale snapshot-gate geldt bewust niet voor historische inkoopfacturen:
  // hun externe leveranciersnummer is geen door Connect uitgegeven BV-reeks.
  const [legacyInkoop] = await db
    .insert(facturenTable)
    .values({
      type: "inkoop",
      factuurnummer: `LEGACY-IN-${Date.now()}`,
      offerteId: offerte.id,
      relatienaam: "GELDSTROOM_01 legacy leverancier",
      bedragInclBtw: "121.00",
      bedragExclBtw: "100.00",
    })
    .returning({ id: facturenTable.id });
  opgeruimd.facturen.push(legacyInkoop.id);
  const legacyInkoopLezing = await api(fin, "GET", `/facturen/${legacyInkoop.id}`);
  if (legacyInkoopLezing.status !== 200 || legacyInkoopLezing.json["werkmaatschappij_id"] !== wgVooraf.id) {
    faal(`V4e: legacy inkoopfactuur mag bestaande dynamische BV-afleiding niet verliezen: ${JSON.stringify(legacyInkoopLezing.json)}`);
  }
  await db
    .update(facturenTable)
    .set({ werkgeverId: andereWerkgever.id, werkgeverVastgelegdOp: f4.werkgeverVastgelegdOp })
    .where(eq(facturenTable.id, factuurId));
  const v4e = await api(fin, "GET", `/facturen/${factuurId}`);
  if (v4e.status !== 200 || v4e.json["werkmaatschappij_id"] !== andereWerkgever.id) {
    faal(`V4e: gewijzigde offerte-BV overschrijft fiscale snapshot: ${JSON.stringify(v4e.json)}`);
  }
  ok("V4e Latere wijziging van offerte-BV overschrijft de bevroren factuur-BV niet");

  // ── V7: creditfactuur per regel + geheel + concurrency ────────────────────
  const v7deel = await api(fin, "POST", `/facturen/${factuurId}/crediteren`, {
    geheel: false,
    regel_ids: [eersteRegel.id],
    reden: "GELDSTROOM_01 gedeeltelijke correctie",
  });
  if (v7deel.status !== 201) faal(`V7 gedeeltelijk crediteren → ${v7deel.status}: ${JSON.stringify(v7deel.json)}`);
  const deelCreditId = v7deel.json["id"] as number;
  opgeruimd.facturen.push(deelCreditId);
  const [deelCredit] = await db.select().from(facturenTable).where(eq(facturenTable.id, deelCreditId));
  const deelRegels = await db.select().from(factuurRegelsTable).where(eq(factuurRegelsTable.factuurId, deelCreditId));
  if (deelCredit.subtype !== "creditnota" || deelCredit.oorspronkelijkeFactuurId !== factuurId) {
    faal(`V7: creditfactuur mist subtype/bronrelatie: ${JSON.stringify({ subtype: deelCredit.subtype, bron: deelCredit.oorspronkelijkeFactuurId })}`);
  }
  if (deelCredit.werkgeverId !== f4.werkgeverId) faal("V7: creditfactuur gebruikt niet de bevroren BV van de bronfactuur");
  if (!deelCredit.factuurnummer || deelCredit.factuurnummer === f4.factuurnummer) faal("V7: creditfactuur mist een eigen fiscaal nummer");
  if (deelCredit.bedragExclBtw !== "-500.00" || deelCredit.btwBedrag !== "-105.00" || deelCredit.bedragInclBtw !== "-605.00") {
    faal(`V7: negatieve credittotalen onjuist: ${deelCredit.bedragExclBtw}/${deelCredit.btwBedrag}/${deelCredit.bedragInclBtw}`);
  }
  if (deelRegels.length !== 1 || deelRegels[0]!.oorspronkelijkeFactuurRegelId !== eersteRegel.id || deelRegels[0]!.bedragExclBtw !== "-500.00") {
    faal("V7: creditregel mist exacte negatieve waarde of blijvende bronregelrelatie");
  }
  const v7dubbel = await api(fin, "POST", `/facturen/${factuurId}/crediteren`, {
    geheel: false,
    regel_ids: [eersteRegel.id],
    reden: "GELDSTROOM_01 dubbele correctie moet falen",
  });
  if (v7dubbel.status !== 409) faal(`V7: dezelfde bronregel opnieuw crediteren moet 409 geven, kreeg ${v7dubbel.status}`);

  // Twee gelijktijdige geheel-verzoeken richten zich op de enige resterende
  // bronregel. Het row lock serialiseert ze: exact één credit slaagt.
  const [raceA, raceB] = await Promise.all([
    api(fin, "POST", `/facturen/${factuurId}/crediteren`, { geheel: true, reden: "GELDSTROOM_01 resterende regels A" }),
    api(fin, "POST", `/facturen/${factuurId}/crediteren`, { geheel: true, reden: "GELDSTROOM_01 resterende regels B" }),
  ]);
  const raceResultaten = [raceA, raceB];
  const raceSucces = raceResultaten.filter((r) => r.status === 201);
  const raceConflict = raceResultaten.filter((r) => r.status === 409);
  if (raceSucces.length !== 1 || raceConflict.length !== 1) {
    faal(`V7: concurrency verwacht 1×201 + 1×409, kreeg ${raceA.status} + ${raceB.status}`);
  }
  const geheelCreditId = raceSucces[0]!.json["id"] as number;
  opgeruimd.facturen.push(geheelCreditId);
  const [geheelCredit] = await db.select().from(facturenTable).where(eq(facturenTable.id, geheelCreditId));
  const geheelRegels = await db.select().from(factuurRegelsTable).where(eq(factuurRegelsTable.factuurId, geheelCreditId));
  if (geheelCredit.oorspronkelijkeFactuurId !== factuurId || geheelRegels.length !== 1) {
    faal("V7: geheel-credit mist bronfactuur of de resterende bronregel");
  }
  if (new Set([f4.factuurnummer, deelCredit.factuurnummer, geheelCredit.factuurnummer]).size !== 3) {
    faal("V7: bronfactuur en beide creditfacturen moeten elk een uniek fiscaal nummer hebben");
  }
  const creditPatch = await api(fin, "PATCH", `/facturen/${deelCreditId}`, { bedrag_incl_btw: "1.00" });
  if (creditPatch.status !== 409) faal(`V7: definitieve creditfactuur wijzigen moet 409 geven, kreeg ${creditPatch.status}`);
  const creditDelete = await api(admin, "DELETE", `/facturen/${deelCreditId}`);
  if (creditDelete.status !== 409) faal(`V7: definitieve creditfactuur verwijderen moet 409 geven, kreeg ${creditDelete.status}`);
  ok(`V7 Credit per regel en geheel: bron ${f4.factuurnummer}, credits ${deelCredit.factuurnummer} en ${geheelCredit.factuurnummer}; dubbele/race-credit → 409`);

  // ── V5: echte Graph-overdracht naar de gedeelde productiepostbus ─────────
  if (!ECHTE_MAILBOX) faal("V5: MAIL_MAILBOX ontbreekt; echte mailbeproeving kan niet draaien");
  const onderwerpV5 = `GELDSTROOM_01 verkoopfactuur ${f4.factuurnummer} ${new Date().toISOString()}`;
  const v5 = await api(fin, "POST", `/facturen/${factuurId}/verzenden-klant`, {
    email: ECHTE_MAILBOX,
    onderwerp: onderwerpV5,
    bericht: "Automatische end-to-end-beproeving van de verkoopfactuurmail. Deze mail mag worden genegeerd.",
  });
  if (v5.status !== 200 || v5.json["ok"] !== true) {
    faal(`V5 echte verkoopfactuurmail → ${v5.status}: ${JSON.stringify(v5.json)}`);
  }
  const [mailLogV5] = await db
    .select()
    .from(mailLogboekTable)
    .where(and(eq(mailLogboekTable.onderwerp, onderwerpV5), eq(mailLogboekTable.soort, "verkoopfactuur")))
    .limit(1);
  if (!mailLogV5 || mailLogV5.status !== "verzonden" || mailLogV5.foutCategorie !== null) {
    faal(`V5: mail_logboek mist verzonden-bewijs: ${JSON.stringify(mailLogV5)}`);
  }
  const wachtrijV5 = await db
    .select({ id: mailWachtrijTable.id })
    .from(mailWachtrijTable)
    .where(eq(mailWachtrijTable.onderwerp, onderwerpV5));
  if (wachtrijV5.length !== 0) faal(`V5: directe verkoopfactuurmail staat onverwacht in de wachtrij (${wachtrijV5.length} rij(en))`);
  const tijdlijnV5 = await db
    .select()
    .from(factuurTijdlijnTable)
    .where(eq(factuurTijdlijnTable.factuurId, factuurId));
  if (!tijdlijnV5.some((regel) => regel.tekst.includes("per e-mail naar de klant verstuurd"))) {
    faal("V5: verzonden-tijdlijnregel ontbreekt");
  }
  ok("V5 Echte verkoopfactuurmail door Microsoft Graph geaccepteerd voor de gedeelde productiepostbus; status=verzonden, tijdlijn aanwezig, wachtrij leeg");

  // ── V5b: onderdrukte mail is een zichtbare fout, nooit stil succes ────────
  const tijdlijnAantalVoorFout = tijdlijnV5.length;
  const onderwerpV5b = `GELDSTROOM_01 onderdrukt ${f4.factuurnummer} ${new Date().toISOString()}`;
  const v5b = await api(fin, "POST", `/facturen/${factuurId}/verzenden-klant`, {
    email: "geldstroom01-klant@voorbeeld.example",
    onderwerp: onderwerpV5b,
  });
  const fouttekstV5b = String(v5b.json["error"] ?? "");
  if (v5b.status !== 422 || !fouttekstV5b.includes("Factuur niet verstuurd") || !fouttekstV5b.includes("test- of voorbeeldadres")) {
    faal(`V5b: verwacht duidelijke 422-mailfout, kreeg ${v5b.status}: ${JSON.stringify(v5b.json)}`);
  }
  const [mailLogV5b] = await db
    .select()
    .from(mailLogboekTable)
    .where(and(eq(mailLogboekTable.onderwerp, onderwerpV5b), eq(mailLogboekTable.soort, "verkoopfactuur")))
    .limit(1);
  if (!mailLogV5b || mailLogV5b.status !== "mislukt" || mailLogV5b.foutCategorie !== "testadres_onderdrukt") {
    faal(`V5b: mislukte mail niet eerlijk gelogd: ${JSON.stringify(mailLogV5b)}`);
  }
  const wachtrijV5b = await db
    .select({ id: mailWachtrijTable.id })
    .from(mailWachtrijTable)
    .where(eq(mailWachtrijTable.onderwerp, onderwerpV5b));
  if (wachtrijV5b.length !== 0) faal("V5b: mislukte directe mail is stil in de wachtrij beland");
  const tijdlijnNaFout = await db
    .select({ id: factuurTijdlijnTable.id })
    .from(factuurTijdlijnTable)
    .where(eq(factuurTijdlijnTable.factuurId, factuurId));
  if (tijdlijnNaFout.length !== tijdlijnAantalVoorFout) {
    faal("V5b: mislukte mail heeft ten onrechte een verzonden-tijdlijnregel geschreven");
  }
  ok("V5b Onderdrukte mail geeft duidelijke 422-fout; status=mislukt, geen verzonden-tijdlijn en geen wachtrij-item");

  // ── V6: samenstellen uit werkbegroting ───────────────────────────────────
  const [opdracht2] = await db.insert(opdrachtenTable).values({
    titel: "GELDSTROOM_01 testopdracht WB", werknummer: "GS01-WB",
  } as typeof opdrachtenTable.$inferInsert).returning({ id: opdrachtenTable.id });
  opgeruimd.opdrachten.push(opdracht2.id);
  const [begroting] = await db.insert(projectBegrotingenTable).values({
    opdrachtId: opdracht2.id, omschrijving: "GELDSTROOM_01 WB",
  } as typeof projectBegrotingenTable.$inferInsert).returning({ id: projectBegrotingenTable.id });
  opgeruimd.begrotingen.push(begroting.id);
  await db.insert(werkbegrotingRegelsTable).values([
    { begrotingId: begroting.id, categorie: "arbeid", omschrijving: "Montage-uren", eenheid: "uur", hoeveelheid: 8, tarief: 62.5, totaal: 500 },
    { begrotingId: begroting.id, categorie: "materiaal", omschrijving: "Brandwerend schuim", eenheid: "st", hoeveelheid: 5, tarief: 20, totaal: 100 },
  ] as (typeof werkbegrotingRegelsTable.$inferInsert)[]);
  const v6 = await api(fin, "POST", `/opdrachten/${opdracht2.id}/verkoopfactuur`, { bron: "werkbegroting" });
  if (v6.status !== 201) faal(`V6 samenstellen uit werkbegroting → ${v6.status}: ${JSON.stringify(v6.json)}`);
  opgeruimd.facturen.push(v6.json["id"] as number);
  const [f6] = await db.select().from(facturenTable).where(eq(facturenTable.id, v6.json["id"] as number));
  if (f6.bedragExclBtw !== "600.00") faal(`V6: totaal excl. verwacht 600.00, kreeg ${f6.bedragExclBtw}`);
  ok("V6 Concept samengesteld uit werkbegroting: € 600,00 excl. uit 2 begrotingsregels");

  // ── I1: goedkeuren-stroom zonder beleidsregel → 422 fail-closed ──────────
  // Bedrag bewust extreem hoog + uniek zodat géén bestaande beleidsregel matcht.
  const [inkoop] = await db.insert(facturenTable).values({
    type: "inkoop", status: "wacht_op_goedkeuring", omschrijving: "GELDSTROOM_01 inkooptest",
    relatienaam: "GELDSTROOM_01 Leverancier", bedragInclBtw: "987654.32", bedragExclBtw: "816243.24",
  } as typeof facturenTable.$inferInsert).returning({ id: facturenTable.id });
  opgeruimd.facturen.push(inkoop.id);
  // Eventuele matchende actieve regels tijdelijk niet laten matchen kan niet
  // zonder ze te wijzigen; we controleren daarom eerst of er een regel matcht.
  const i1 = await api(fin, "POST", `/facturen/${inkoop.id}/goedkeuren-stroom`);
  if (i1.status !== 422) faal(`I1: verwacht 422, kreeg ${i1.status}: ${JSON.stringify(i1.json)}`);
  if (i1.json["viaGoedkeuring"] === true) {
    ok("I1 Er matcht al een beleidsregel in deze omgeving → 422 viaGoedkeuring (goedkeuringsmotor vereist) — eveneens fail-closed");
  } else {
    if (!String(i1.json["error"] ?? "").toLowerCase().includes("goedkeuringsbeleid")) faal(`I1: 422 maar zonder beleids-uitleg: ${JSON.stringify(i1.json)}`);
    ok("I1 Zonder passende beleidsregel wordt goedkeuren fail-closed geweigerd (422, nooit automatisch)");
  }

  // ── I2: mét beleidsregel maar zonder goedgekeurde aanvraag → viaGoedkeuring ─
  const [regel] = await db.insert(goedkeuringBeleidsregelsTable).values({
    naam: "GELDSTROOM_01 testregel", documentType: "inkoop_factuur",
    ondergrensBedrag: "900000.00", bovengrensBedrag: "999999.99",
    goedkeurderModule: "financieel", goedkeurderMinNiveau: 4,
    actief: true, aangemaaktDoorId: adminId,
  } as typeof goedkeuringBeleidsregelsTable.$inferInsert).returning({ id: goedkeuringBeleidsregelsTable.id });
  opgeruimd.beleidsregels.push(regel.id);
  const i2 = await api(fin, "POST", `/facturen/${inkoop.id}/goedkeuren-stroom`);
  if (i2.status !== 422 || i2.json["viaGoedkeuring"] !== true) faal(`I2: verwacht 422 viaGoedkeuring, kreeg ${i2.status}: ${JSON.stringify(i2.json)}`);
  ok("I2 Mét beleidsregel: goedkeuren kan uitsluitend via een goedgekeurde aanvraag in de goedkeuringsmotor (422 viaGoedkeuring)");

  // ── I3/I4: betaalbatch-vrijgave = vaste directiepoort ────────────────────
  // Schakelaar aan (directie-akkoord) — rechtstreeks in DB voor de test.
  const [inst] = await db.select({ id: appInstellingenTable.id, actief: appInstellingenTable.betaalbatchActief }).from(appInstellingenTable).orderBy(appInstellingenTable.id).limit(1);
  const batchWasActief = inst?.actief === true;
  if (inst && !batchWasActief) await db.update(appInstellingenTable).set({ betaalbatchActief: true }).where(eq(appInstellingenTable.id, inst.id));
  if (!inst) faal("Geen app_instellingen-rij aanwezig in dev");
  const [wg] = await db.select({ id: werkgeversTable.id }).from(werkgeversTable).limit(1);
  if (!wg) faal("Geen werkgever (BV) aanwezig in dev");
  const [batch] = await db.insert(betaalbatchesTable).values({
    werkgeverId: wg.id, status: "bestand_aangemaakt", uitvoerdatum: "2026-08-20",
    debiteurIban: "NL91ABNA0417164300", debiteurNaam: "GELDSTROOM_01 BV", bestandReferentie: "GS01-TESTBATCH",
  } as typeof betaalbatchesTable.$inferInsert).returning({ id: betaalbatchesTable.id });
  opgeruimd.batches.push(batch.id);

  const i3 = await api(fin, "POST", `/betaalbatches/${batch.id}/bevestigen`);
  if (i3.status !== 403) faal(`I3: financieel:4 mag NIET vrijgeven; verwacht 403, kreeg ${i3.status}: ${JSON.stringify(i3.json)}`);
  ok("I3 Betaalbatch-vrijgave door financieel:4 geweigerd (403) — vaste directiepoort, geen delegatie");

  const i4 = await api(admin, "POST", `/betaalbatches/${batch.id}/bevestigen`);
  if (i4.status !== 200) faal(`I4: hoofdbeheerder vrijgeven → ${i4.status}: ${JSON.stringify(i4.json)}`);
  ok("I4 Betaalbatch-vrijgave door de hoofdbeheerder (directie) geslaagd");

  // ── I5: schakelaar alleen door hoofdbeheerder ────────────────────────────
  const i5 = await api(fin, "PUT", `/info/instellingen`, { betaalbatch_actief: false });
  const i5b = i5.status === 403 || i5.status === 404 ? i5 : { status: (await api(fin, "PATCH", `/info/instellingen`, { betaalbatch_actief: false })).status, json: {} };
  if (i5b.status !== 403) faal(`I5: schakelaar door niet-hoofdbeheerder: verwacht 403, kreeg ${i5b.status}`);
  ok("I5 betaalbatch_actief-schakelaar door niet-hoofdbeheerder geweigerd (403)");

  // ── Opruimen ─────────────────────────────────────────────────────────────
  if (!batchWasActief) await db.update(appInstellingenTable).set({ betaalbatchActief: false }).where(eq(appInstellingenTable.id, inst.id));
  await db.delete(goedkeuringBeleidsregelsTable).where(inArray(goedkeuringBeleidsregelsTable.id, opgeruimd.beleidsregels));
  await db.delete(betaalbatchesTable).where(inArray(betaalbatchesTable.id, opgeruimd.batches));
  await db.delete(facturenTable).where(inArray(facturenTable.id, [deelCreditId, geheelCreditId]));
  await db.delete(facturenTable).where(inArray(facturenTable.id, opgeruimd.facturen));
  await db.delete(werkbegrotingRegelsTable).where(inArray(werkbegrotingRegelsTable.begrotingId, opgeruimd.begrotingen));
  await db.delete(projectBegrotingenTable).where(inArray(projectBegrotingenTable.id, opgeruimd.begrotingen));
  await db.delete(opdrachtenTable).where(inArray(opdrachtenTable.id, opgeruimd.opdrachten));
  await db.delete(offerteRegelsTable).where(inArray(offerteRegelsTable.offerteId, opgeruimd.offertes));
  await db.delete(offertesTable).where(inArray(offertesTable.id, opgeruimd.offertes));
  await db.delete(crmKlantenTable).where(inArray(crmKlantenTable.id, opgeruimd.klanten));
  if (opgeruimd.werkgevers.length > 0) {
    await db.delete(werkgeversTable).where(inArray(werkgeversTable.id, opgeruimd.werkgevers));
  }
  await db.update(gebruikersTable).set({ actief: false, gearchiveerd: true }).where(inArray(gebruikersTable.id, opgeruimd.gebruikers));
  ok("Testdata opgeruimd, testaccounts gearchiveerd");
  console.log("\n🎉 GELDSTROOM_01: alle bewijspunten geslaagd");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
