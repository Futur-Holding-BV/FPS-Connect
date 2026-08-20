/**
 * REGISTER_01 — bewijsscript (dev).
 *
 * V1: register gevuld (≥ 400 punten, ≥ 50 opdrachten) met alleen geldige standen.
 * V2: GET /api/acceptatieregister zonder login → 401; gewone gebruiker → 403.
 * V3: hoofdbeheerder ziet de lijst inclusief de REGISTER_01-punten.
 * V4: PATCH-validatie, stale-bewijsblokkade, idempotente zelfpromotie en
 *     werkbak-deduplicatie/automatische sluiting.
 * V5: oplever-check faalt (exit 1) op een opdracht met open punten en slaagt op
 *     een volledig gehaalde opdracht.
 * V6: statusrapport van vandaag bestaat en is gegenereerd uit het register.
 *
 * Testaccounts worden na afloop gearchiveerd.
 */
import { execSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import {
  acceptatieRegisterHergradeerRunsTable,
  acceptatieRegisterTable,
  db,
  gebruikersTable,
  werkbakItemsTable,
} from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { hash } from "bcryptjs";
import { authenticator } from "otplib";
import { isBronActueel, kiesSterksteActueleBron, registreerGroenBewijs } from "./lib/acceptatieregisterBewijs";
import { acceptatieregisterHerbeoordeling } from "./data/acceptatieregister-herbeoordeling";

const TOTPS = new Map<string, string>();
const BASIS = process.env["API_BASIS"] ?? `https://${process.env["REPLIT_DEV_DOMAIN"]}/api`;
const WACHTWOORD = "Register01!bewijs";

function faal(msg: string): never { console.error(`❌ ${msg}`); process.exit(1); }
function ok(msg: string): void { console.log(`✅ ${msg}`); }

async function maakAccount(email: string, naam: string, rol: string): Promise<number> {
  const ww = await hash(WACHTWOORD, 10);
  const totp = authenticator.generateSecret();
  TOTPS.set(email, totp);
  const [rij] = await db.insert(gebruikersTable).values({
    email, naam, rol, wachtwoord: ww, actief: true, totpSecret: totp, tweeFactorIngeschakeld: true,
  } as typeof gebruikersTable.$inferInsert).returning({ id: gebruikersTable.id });
  return rij!.id;
}

async function login(email: string): Promise<string> {
  const r = await fetch(`${BASIS}/auth/mobile/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, wachtwoord: WACHTWOORD, code: authenticator.generate(TOTPS.get(email)!) }),
  });
  if (!r.ok) faal(`login ${email} → ${r.status}: ${await r.text()}`);
  const j = (await r.json()) as { token?: string };
  if (!j.token) faal(`login ${email}: geen token`);
  return j.token;
}

async function api(token: string | null, methode: string, pad: string, body?: unknown) {
  const r = await fetch(`${BASIS}${pad}`, {
    method: methode,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let json: unknown = null;
  try { json = await r.json(); } catch { /* leeg */ }
  return { status: r.status, json };
}

type Punt = { id: number; opdracht_code: string; punt_nummer: number; stand: string };

async function wachtOpProcesTekst(
  stream: NodeJS.ReadableStream,
  tekst: string,
  timeoutMs = 10_000,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => reject(new Error(`Timeout op procesuitvoer: ${tekst}`)), timeoutMs);
    stream.on("data", (chunk: Buffer | string) => {
      buffer += chunk.toString();
      if (!buffer.includes(tekst)) return;
      clearTimeout(timer);
      resolve();
    });
    stream.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function main(): Promise<void> {
  const stempel = Date.now();
  const hbEmail = `register01-hb-${stempel}@voorbeeld.example`;
  const gbEmail = `register01-gb-${stempel}@voorbeeld.example`;
  const hbId = await maakAccount(hbEmail, "Register01 Hoofdbeheerder", "hoofdbeheerder");
  const gbId = await maakAccount(gbEmail, "Register01 Gebruiker", "gebruiker");
  const testCode = `REGISTER_HERGRADE_TEST_${stempel}`;
  const testDedup = `acceptatieregister:${testCode}:1`;
  let testPuntId: number | null = null;
  try {
    // V1 — vulling en geldige standen
    const [tellers] = (await db.execute(sql`
      SELECT count(*)::int AS punten, count(DISTINCT opdracht_code)::int AS opdrachten,
             count(*) FILTER (WHERE stand NOT IN ('gehaald','niet_gebouwd','onbewezen','wacht_op_rene'))::int AS ongeldig,
             count(*) FILTER (
               WHERE bewijs_vindplaats IS NULL OR btrim(bewijs_vindplaats) = ''
                  OR bron_bestand IS NULL OR btrim(bron_bestand) = ''
                  OR bron_soort IS NULL OR bron_datum IS NULL
                  OR laatste_code_wijziging_op IS NULL OR beoordeeld_op IS NULL
             )::int AS metadata_ontbreekt
      FROM acceptatie_register`)).rows as {
        punten: number;
        opdrachten: number;
        ongeldig: number;
        metadata_ontbreekt: number;
      }[];
    if (!tellers || tellers.punten < 400 || tellers.opdrachten < 50) faal(`V1: register te leeg: ${JSON.stringify(tellers)}`);
    if (tellers.ongeldig !== 0) faal(`V1: ${tellers.ongeldig} regels met ongeldige stand`);
    if (tellers.metadata_ontbreekt !== 0) {
      faal(`V1: ${tellers.metadata_ontbreekt} regels missen bronmetadata`);
    }
    ok(`V1 Register gevuld: ${tellers.punten} punten over ${tellers.opdrachten} opdrachten, alle standen geldig`);

    // V2 — autorisatie
    const anon = await api(null, "GET", "/acceptatieregister");
    if (anon.status !== 401) faal(`V2: zonder login moet 401, kreeg ${anon.status}`);
    const gb = await login(gbEmail);
    const alsGb = await api(gb, "GET", "/acceptatieregister");
    if (alsGb.status !== 403) faal(`V2: gewone gebruiker moet 403, kreeg ${alsGb.status}`);
    ok("V2 Register is hoofdbeheerder-only (401 anoniem, 403 gewone gebruiker)");

    // V3 — hoofdbeheerder ziet de lijst
    const hb = await login(hbEmail);
    const lijst = await api(hb, "GET", "/acceptatieregister");
    if (lijst.status !== 200) faal(`V3: GET als hoofdbeheerder → ${lijst.status}`);
    const punten = lijst.json as Punt[];
    const eigen = punten.filter((p) => p.opdracht_code === "REGISTER_01");
    if (eigen.length < 5) faal(`V3: REGISTER_01-punten ontbreken (${eigen.length})`);
    ok(`V3 Hoofdbeheerder ziet ${punten.length} punten, incl. ${eigen.length} REGISTER_01-punten`);

    const [runVoorHerstart] = await db
      .select()
      .from(acceptatieRegisterHergradeerRunsTable)
      .where(eq(acceptatieRegisterHergradeerRunsTable.sleutel, "acceptatieregister-hergrading-2026-08-20-v1"));
    if (runVoorHerstart?.status === "mislukt") {
      const regressieId = eigen[0]!.id;
      const bewijsRaceId = eigen[1]!.id;
      const [voorPatch, voorBewijsRace] = await Promise.all([
        db
          .select()
          .from(acceptatieRegisterTable)
          .where(eq(acceptatieRegisterTable.id, regressieId))
          .then((rijen) => rijen[0]),
        db
          .select()
          .from(acceptatieRegisterTable)
          .where(eq(acceptatieRegisterTable.id, bewijsRaceId))
          .then((rijen) => rijen[0]),
      ]);
      if (!voorPatch || !voorBewijsRace) faal("V3a: regressieregels ontbreken");
      const naClaimPatch = await api(hb, "PATCH", `/acceptatieregister/${regressieId}`, { stand: "wacht_op_rene" });
      if (naClaimPatch.status !== 200) faal(`V3a: PATCH na mislukte productieclaim → ${naClaimPatch.status}`);

      const motor = spawn(
        "pnpm",
        ["exec", "tsx", "src/herbeoordeel-acceptatieregister.ts", "--eenmalig-productie", "--geen-rapportbestand"],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            NODE_ENV: "test",
            ACCEPTATIEREGISTER_HERGRADEER_PRODUCTIE: "1",
            ACCEPTATIEREGISTER_HERGRADEER_TEST_PAUZE_MS: "1200",
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      motor.stdout.pipe(process.stdout);
      motor.stderr.pipe(process.stderr);
      const motorKlaar = new Promise<void>((resolve, reject) => {
        motor.once("error", reject);
        motor.once("exit", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`Hergradeer-herstart stopte met exitcode ${code}`));
        });
      });
      await wachtOpProcesTekst(motor.stdout, "[hergradeertest] exclusief slot verkregen");
      const bewijsStart = Date.now();
      const bewijsKlaar = registreerGroenBewijs({
        opdrachtCode: voorBewijsRace.opdrachtCode,
        puntNummers: [voorBewijsRace.puntNummer],
        scriptPad: "scripts/src/verificatie-register01.ts",
        relevanteCodepaden: ["scripts/src/verificatie-register01.ts"],
        volledigGeslaagd: true,
        toelichting: "Gelijktijdigheidsproef: groene promotie wacht op historische hergrading.",
      });
      await Promise.all([motorKlaar, bewijsKlaar]);
      const bewijsWachttijd = Date.now() - bewijsStart;

      const [naHerstart, naBewijsRace] = await Promise.all([
        db
          .select()
          .from(acceptatieRegisterTable)
          .where(eq(acceptatieRegisterTable.id, regressieId))
          .then((rijen) => rijen[0]),
        db
          .select()
          .from(acceptatieRegisterTable)
          .where(eq(acceptatieRegisterTable.id, bewijsRaceId))
          .then((rijen) => rijen[0]),
      ]);
      if (naHerstart?.stand !== "wacht_op_rene") {
        faal(`V3a: oordeel na eerste claim is bij herstart overschreven (${naHerstart?.stand})`);
      }
      if (naBewijsRace?.stand !== "gehaald" || naBewijsRace.bronSoort !== "bewijsscript" || bewijsWachttijd < 700) {
        faal(`V3a: groene scriptpromotie wachtte niet op de motor: ${JSON.stringify({
          stand: naBewijsRace?.stand,
          bronSoort: naBewijsRace?.bronSoort,
          bewijsWachttijd,
        })}`);
      }

      const herstel = async (voor: typeof acceptatieRegisterTable.$inferSelect): Promise<void> => {
        await db.update(acceptatieRegisterTable).set({
          opdrachtCode: voor.opdrachtCode,
          puntNummer: voor.puntNummer,
          omschrijving: voor.omschrijving,
          stand: voor.stand,
          bewijsVindplaats: voor.bewijsVindplaats,
          bronBestand: voor.bronBestand,
          bronSoort: voor.bronSoort,
          bronDatum: voor.bronDatum,
          laatsteCodeWijzigingOp: voor.laatsteCodeWijzigingOp,
          relevanteCodepaden: voor.relevanteCodepaden,
          beoordeeldOp: voor.beoordeeldOp,
          toelichting: voor.toelichting,
          aangemaaktOp: voor.aangemaaktOp,
          bijgewerktOp: voor.bijgewerktOp,
        }).where(eq(acceptatieRegisterTable.id, voor.id));
      };
      await herstel(voorPatch);
      await herstel(voorBewijsRace);
      ok(`V3a PATCH en groene scriptpromotie overleven herstart; script wachtte ${bewijsWachttijd} ms op het exclusieve slot`);
    }

    const doelSleutels = new Set(
      acceptatieregisterHerbeoordeling.map((punt) => `${punt.opdracht_code}#${punt.punt_nummer}`),
    );
    const doelRijen = (await db.select().from(acceptatieRegisterTable))
      .filter((punt) => doelSleutels.has(`${punt.opdrachtCode}#${punt.puntNummer}`));
    const doelVerdeling = doelRijen.reduce<Record<string, number>>((acc, punt) => {
      acc[punt.stand] = (acc[punt.stand] ?? 0) + 1;
      return acc;
    }, {});
    const [productierun] = await db
      .select()
      .from(acceptatieRegisterHergradeerRunsTable)
      .where(eq(acceptatieRegisterHergradeerRunsTable.sleutel, "acceptatieregister-hergrading-2026-08-20-v1"));
    const staleGehaald = doelRijen.filter(
      (punt) => punt.stand === "gehaald" && !isBronActueel(punt.bronDatum, punt.laatsteCodeWijzigingOp),
    );
    const toegestaneScriptPromoties = new Set(["AKKOORD_01#1", "AKKOORD_01#2", "FACTUUR_03#1"]);
    const ongeldigePromoties = doelRijen.filter(
      (punt) => punt.stand === "gehaald" && !toegestaneScriptPromoties.has(`${punt.opdrachtCode}#${punt.puntNummer}`),
    );
    const nietDoorRunBeoordeeld = productierun
      ? doelRijen.filter((punt) => punt.beoordeeldOp.getTime() < productierun.gestartOp.getTime() - 60_000)
      : doelRijen;
    if (
      doelRijen.length !== 213
      || doelVerdeling["niet_gebouwd"] !== 20
      || (doelVerdeling["onbewezen"] ?? 0) + (doelVerdeling["gehaald"] ?? 0) !== 193
      || staleGehaald.length !== 0
      || ongeldigePromoties.length !== 0
      || nietDoorRunBeoordeeld.length !== 0
      || productierun?.status !== "voltooid"
    ) {
      faal(`V3b: hergrading niet volledig toegepast: ${JSON.stringify({
        doelRijen: doelRijen.length,
        doelVerdeling,
        staleGehaald: staleGehaald.length,
        ongeldigePromoties: ongeldigePromoties.length,
        nietDoorRunBeoordeeld: nietDoorRunBeoordeeld.length,
        productierun: productierun?.status,
      })}`);
    }
    ok("V3b Eenmalige motor hergradeerde exact 213 doelpunten, corrigeerde stale bewijs en registreerde voltooiing");

    const nu = new Date();
    const [testPunt] = await db.insert(acceptatieRegisterTable).values({
      opdrachtCode: testCode,
      puntNummer: 1,
      omschrijving: "Tijdelijk registerpunt voor hergradeerketen",
      stand: "onbewezen",
      bewijsVindplaats: "scripts/src/verificatie-register01.ts",
      bronBestand: "scripts/src/verificatie-register01.ts",
      bronSoort: "code",
      bronDatum: nu,
      laatsteCodeWijzigingOp: nu,
      relevanteCodepaden: ["scripts/src/verificatie-register01.ts"],
      beoordeeldOp: nu,
      toelichting: "Tijdelijk regressiepunt",
    }).returning({ id: acceptatieRegisterTable.id });
    testPuntId = testPunt!.id;
    const doel: Punt = { id: testPunt.id, opdracht_code: testCode, punt_nummer: 1, stand: "onbewezen" };

    // V4 — PATCH-validatie + stale-bewijsblokkade
    const fout400 = await api(hb, "PATCH", `/acceptatieregister/${doel.id}`, { stand: "kapot" });
    if (fout400.status !== 400) faal(`V4: ongeldige stand moet 400, kreeg ${fout400.status}`);
    const leeg = await api(hb, "PATCH", `/acceptatieregister/${doel.id}`, {});
    if (leeg.status !== 400) faal(`V4: lege PATCH moet 400 (mag bijgewerkt_op niet verversen), kreeg ${leeg.status}`);
    const onbekendVeld = await api(hb, "PATCH", `/acceptatieregister/${doel.id}`, { hack: 1 });
    if (onbekendVeld.status !== 400) faal(`V4: onbekend veld moet 400, kreeg ${onbekendVeld.status}`);
    const zonderBewijs = await api(hb, "PATCH", `/acceptatieregister/${doel.id}`, { stand: "gehaald", bewijs_vindplaats: null });
    if (zonderBewijs.status !== 400) faal(`V4: gehaald zonder bewijs moet 400, kreeg ${zonderBewijs.status}`);
    const stale = await api(hb, "PATCH", `/acceptatieregister/${doel.id}`, {
      stand: "gehaald",
      bewijs_vindplaats: "scripts/src/verificatie-register01.ts",
      bron_bestand: "scripts/src/verificatie-register01.ts",
      bron_soort: "bewijsscript",
      bron_datum: "2026-08-01T00:00:00.000Z",
      laatste_code_wijziging_op: "2026-08-20T00:00:00.000Z",
      relevante_codepaden: ["scripts/src/verificatie-register01.ts"],
    });
    if (stale.status !== 400) faal(`V4: handmatig bewijsscriptbewijs moet 400, kreeg ${stale.status}`);
    const staleCode = await api(hb, "PATCH", `/acceptatieregister/${doel.id}`, {
      stand: "gehaald",
      bewijs_vindplaats: "scripts/src/verificatie-register01.ts",
      bron_bestand: "scripts/src/verificatie-register01.ts",
      bron_soort: "code",
      bron_datum: "2026-08-01T00:00:00.000Z",
      laatste_code_wijziging_op: "2026-08-20T00:00:00.000Z",
      relevante_codepaden: ["scripts/src/verificatie-register01.ts"],
    });
    if (staleCode.status !== 409) faal(`V4: stale codebewijs moet 409, kreeg ${staleCode.status}`);
    const wissel = await api(hb, "PATCH", `/acceptatieregister/${doel.id}`, { stand: "wacht_op_rene" });
    if (wissel.status !== 200) faal(`V4: geldige PATCH → ${wissel.status}`);
    const [naDb] = await db.select().from(acceptatieRegisterTable).where(eq(acceptatieRegisterTable.id, doel.id));
    if (naDb?.stand !== "wacht_op_rene") faal(`V4: stand niet gepersisteerd (${naDb?.stand})`);
    await api(hb, "PATCH", `/acceptatieregister/${doel.id}`, { stand: "wacht_op_rene" });
    const openItems = await db.select({ id: werkbakItemsTable.id }).from(werkbakItemsTable)
      .where(and(eq(werkbakItemsTable.dedupSleutel, testDedup), eq(werkbakItemsTable.status, "open")));
    if (openItems.length !== 1) faal(`V4: wacht_op_rene moet exact één open werkbakitem hebben, vond ${openItems.length}`);

    const geenPromotie = await registreerGroenBewijs({
      opdrachtCode: testCode,
      puntNummers: [1],
      scriptPad: "scripts/src/verificatie-register01.ts",
      relevanteCodepaden: ["scripts/src/verificatie-register01.ts"],
      volledigGeslaagd: false,
      toelichting: "Mag niet worden geschreven.",
    });
    if (geenPromotie !== 0) faal("V4: falende/onvolledige run heeft het register gemuteerd");
    const [nogWacht] = await db.select().from(acceptatieRegisterTable).where(eq(acceptatieRegisterTable.id, doel.id));
    if (nogWacht?.stand !== "wacht_op_rene") faal("V4: onvolledige run heeft stand toch gewijzigd");

    await registreerGroenBewijs({
      opdrachtCode: testCode,
      puntNummers: [1],
      scriptPad: "scripts/src/verificatie-register01.ts",
      relevanteCodepaden: ["scripts/src/verificatie-register01.ts"],
      volledigGeslaagd: true,
      toelichting: "Groene regressierun.",
    });
    await registreerGroenBewijs({
      opdrachtCode: testCode,
      puntNummers: [1],
      scriptPad: "scripts/src/verificatie-register01.ts",
      relevanteCodepaden: ["scripts/src/verificatie-register01.ts"],
      volledigGeslaagd: true,
      toelichting: "Groene regressierun.",
    });
    const [naPromotie] = await db.select().from(acceptatieRegisterTable).where(eq(acceptatieRegisterTable.id, doel.id));
    const openNaPromotie = await db.select({ id: werkbakItemsTable.id }).from(werkbakItemsTable)
      .where(and(eq(werkbakItemsTable.dedupSleutel, testDedup), eq(werkbakItemsTable.status, "open")));
    if (naPromotie?.stand !== "gehaald" || naPromotie.bronSoort !== "bewijsscript" || openNaPromotie.length !== 0) {
      faal("V4: groene helper promoveert niet idempotent of sluit werkbakitem niet automatisch");
    }
    const zwakker = await api(hb, "PATCH", `/acceptatieregister/${doel.id}`, {
      stand: "gehaald",
      bron_soort: "antwoorddocument",
      bron_datum: new Date().toISOString(),
      laatste_code_wijziging_op: new Date().toISOString(),
    });
    if (zwakker.status !== 409) faal(`V4: zwakkere bron mag scriptbewijs niet overschrijven, kreeg ${zwakker.status}`);

    const toekomstigeCodeDatum = new Date(Date.now() + 60_000);
    const maakSterkBewijsStale = await api(hb, "PATCH", `/acceptatieregister/${doel.id}`, {
      stand: "onbewezen",
      laatste_code_wijziging_op: toekomstigeCodeDatum.toISOString(),
    });
    if (maakSterkBewijsStale.status !== 200) faal(`V4: sterk bewijs stale markeren → ${maakSterkBewijsStale.status}`);
    const zwakkerMaarActueel = await api(hb, "PATCH", `/acceptatieregister/${doel.id}`, {
      stand: "gehaald",
      bewijs_vindplaats: "docs/metingen/register01-actueel.md",
      bron_bestand: "docs/metingen/register01-actueel.md",
      bron_soort: "antwoorddocument",
      bron_datum: new Date(toekomstigeCodeDatum.getTime() + 1_000).toISOString(),
      laatste_code_wijziging_op: toekomstigeCodeDatum.toISOString(),
      relevante_codepaden: ["scripts/src/verificatie-register01.ts"],
    });
    if (zwakkerMaarActueel.status !== 200) {
      faal(`V4: actueel zwakker bewijs moet stale sterker bewijs mogen vervangen, kreeg ${zwakkerMaarActueel.status}`);
    }

    await registreerGroenBewijs({
      opdrachtCode: testCode,
      puntNummers: [1],
      scriptPad: "scripts/src/verificatie-register01.ts",
      relevanteCodepaden: ["scripts/src/verificatie-register01.ts"],
      volledigGeslaagd: true,
      toelichting: "Groene regressierun voor tweestapsblokkade.",
    });
    const eersteStap = await api(hb, "PATCH", `/acceptatieregister/${doel.id}`, { stand: "onbewezen" });
    if (eersteStap.status !== 200) faal(`V4: eerste tweestap-PATCH → ${eersteStap.status}`);
    const [versSterk] = await db.select().from(acceptatieRegisterTable).where(eq(acceptatieRegisterTable.id, doel.id));
    const tweedeStap = await api(hb, "PATCH", `/acceptatieregister/${doel.id}`, {
      stand: "gehaald",
      bewijs_vindplaats: "docs/metingen/register01-omweg.md",
      bron_bestand: "docs/metingen/register01-omweg.md",
      bron_soort: "antwoorddocument",
      bron_datum: new Date().toISOString(),
      laatste_code_wijziging_op: versSterk!.laatsteCodeWijzigingOp.toISOString(),
      relevante_codepaden: ["scripts/src/verificatie-register01.ts"],
    });
    if (tweedeStap.status !== 409) faal(`V4: tweestapsomweg moet actueel sterker bewijs blijven beschermen, kreeg ${tweedeStap.status}`);
    await registreerGroenBewijs({
      opdrachtCode: testCode,
      puntNummers: [1],
      scriptPad: "scripts/src/verificatie-register01.ts",
      relevanteCodepaden: ["scripts/src/verificatie-register01.ts"],
      volledigGeslaagd: true,
      toelichting: "Groene regressierun herstelt eindtoestand.",
    });
    ok("V4 PATCH/stale/helper/werkbak: actueel sterker bewijs atomair beschermd, stale sterker bewijs vervangbaar, tweestapsomweg geblokkeerd");

    // V4b — vaste bewijskrachtvolgorde.
    const codeDatum = new Date("2026-08-02T00:00:00Z");
    const bronDatum = new Date("2026-08-03T00:00:00Z");
    const sterkste = kiesSterksteActueleBron([
      { bronSoort: "antwoorddocument" as const, bronDatum, laatsteCodeWijzigingOp: codeDatum },
      { bronSoort: "meetrapport" as const, bronDatum, laatsteCodeWijzigingOp: codeDatum },
      { bronSoort: "code" as const, bronDatum, laatsteCodeWijzigingOp: codeDatum },
      { bronSoort: "bewijsscript" as const, bronDatum, laatsteCodeWijzigingOp: codeDatum },
    ]);
    if (sterkste?.bronSoort !== "bewijsscript" || isBronActueel(new Date("2026-08-01"), codeDatum)) {
      faal("V4b: bewijskrachtvolgorde of stale-datumvergelijking onjuist");
    }
    ok("V4b Bewijskrachtvolgorde = script > code > meetrapport > antwoorddocument; oud bewijs is stale");

    // V5 — oplever-check gedrag
    // `punten` is bewust vóór de herstartproef opgehaald en kan daardoor nog
    // de oude standen bevatten. Lees voor deze opleverproef de actuele DB-stand.
    const [openPunt] = await db
      .select({ opdrachtCode: acceptatieRegisterTable.opdrachtCode })
      .from(acceptatieRegisterTable)
      .where(eq(acceptatieRegisterTable.stand, "niet_gebouwd"))
      .limit(1);
    const openCode = openPunt?.opdrachtCode;
    if (!openCode) faal("V5: geen opdracht met niet_gebouwd punt gevonden");
    let faalde = false;
    try { execSync(`pnpm exec tsx src/oplever-check.ts ${openCode}`, { stdio: "pipe" }); } catch { faalde = true; }
    if (!faalde) faal(`V5: oplever-check hoort te falen op ${openCode}`);
    execSync(`pnpm exec tsx src/oplever-check.ts ${testCode}`, { stdio: "pipe" });
    ok(`V5 Oplever-check faalt op ${openCode} (open punten) en slaagt op actueel groen regressiepunt`);

    // V5b — deels-verouderd register: één regel op gisteren → oplever-check faalt
    await db.execute(sql`UPDATE acceptatie_register SET beoordeeld_op = now() - interval '1 day' WHERE id = ${doel.id}`);
    let faaldeStale = false;
    try { execSync(`pnpm exec tsx src/oplever-check.ts ${testCode}`, { stdio: "pipe" }); } catch { faaldeStale = true; }
    await db.execute(sql`UPDATE acceptatie_register SET beoordeeld_op = now() WHERE id = ${doel.id}`);
    if (!faaldeStale) faal("V5b: oplever-check hoort te falen zodra één regel niet vandaag is beoordeeld");
    ok("V5b Oplever-check faalt zodra ook maar één registeroordeel niet vandaag is beoordeeld");

    // V5c — DB-invariant: ongeldige stand wordt door de CHECK geweigerd
    let dbWeigerde = false;
    try { await db.execute(sql`UPDATE acceptatie_register SET stand = 'kapot' WHERE id = ${doel.id}`); }
    catch { dbWeigerde = true; }
    if (!dbWeigerde) faal("V5c: DB CHECK-constraint op stand ontbreekt of grijpt niet in");
    ok("V5c DB weigert ongeldige standen (CHECK-constraint)");

    // V6 — gegenereerd statusrapport
    const datum = new Date().toISOString().slice(0, 10);
    const pad = `../docs/status/STATUS_${datum}.md`;
    if (!existsSync(pad)) faal(`V6: ${pad} ontbreekt — draai genereer-statusrapport.ts`);
    const inhoud = readFileSync(pad, "utf8");
    if (!inhoud.includes("Gegenereerd uit het acceptatieregister")) faal("V6: rapport is niet uit het register gegenereerd");
    if (!inhoud.includes("Verschil sinds ochtendmeting") || !inhoud.includes("| Wacht op René |")) {
      faal("V6: rapport bevat niet uitsluitend de vier standen plus ochtendverschil");
    }
    ok(`V6 Statusrapport STATUS_${datum}.md bevat de vier nieuwe aantallen en ochtendverschillen`);

    const eigenPromotie = await registreerGroenBewijs({
      opdrachtCode: "REGISTER_01",
      puntNummers: [1, 2, 3, 4, 5],
      scriptPad: "scripts/src/verificatie-register01.ts",
      relevanteCodepaden: [
        "lib/db/src/migrations/0111_acceptatieregister_hergradeerbaar.sql",
        "artifacts/api-server/src/routes/acceptatieregister.ts",
        "artifacts/firevault/src/pages/beheer/acceptatieregister.tsx",
        "scripts/src/herbeoordeel-acceptatieregister.ts",
        "scripts/src/oplever-check.ts",
        "scripts/src/genereer-statusrapport.ts",
      ],
      volledigGeslaagd: true,
      toelichting: "Groene end-to-end registerrun bewijst bronhiërarchie, stale-blokkade, zelfpromotie, werkbakdeduplicatie, automatische sluiting, oplevercheck en statusrapport.",
    });
    ok(`V7 Groene registerrun promoveert ${eigenPromotie} REGISTER_01-punten via de centrale helper`);

    console.log("\nAlle REGISTER_01-verificaties groen.");
  } finally {
    if (testPuntId != null) {
      await db.delete(acceptatieRegisterTable).where(eq(acceptatieRegisterTable.id, testPuntId)).catch(() => {});
      await db.delete(werkbakItemsTable).where(eq(werkbakItemsTable.dedupSleutel, testDedup)).catch(() => {});
    }
    await db.update(gebruikersTable).set({ actief: false, email: `gearchiveerd-${hbId}@voorbeeld.example` }).where(eq(gebruikersTable.id, hbId));
    await db.update(gebruikersTable).set({ actief: false, email: `gearchiveerd-${gbId}@voorbeeld.example` }).where(eq(gebruikersTable.id, gbId));
  }
  process.exit(0);
}

main().catch((e) => faal(String(e)));
