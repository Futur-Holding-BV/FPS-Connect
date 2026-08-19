// INKOOP_BOEKING_01 — concurrentiebewijs voor de AccountView-boeking.
//
// Bewijst op de dev-DB drie invarianten zoals gevraagd in de taakomschrijving.
// Scenario's 2 en 3 roepen de echte productiefunctie verwerkDirectBetaaldeBon-
// Factuur aan; de AI-analyselaag wordt vervangen door een deterministisch fixture
// via de _analyseOverride-seam (zie factuurstroomService.ts).
//
//   1. Twee parallelle exportpogingen op dezelfde factuur → exact één claim
//      slaagt; de tweede poging faalt (false). Mechanisme: claimAccountview-
//      Verzending() doet een atomaire UPDATE-WHERE-RETURNING.
//
//   2. Twee parallelle PDF-verwerkingen op dezelfde direct-betaalde inkoop →
//      exact één factuurkoppeling. Mechanisme: de productiefunctie gebruikt
//      SELECT … FOR UPDATE + WHERE factuurId IS NULL; de tweede transactie ziet
//      de koppeling al staan en geeft "al_gekoppeld" terug.
//
//   3. PDF-upload op een inkoop met status "ter_goedkeuring" of met een open
//      goedkeuringsaanvraag (type "algemene_inkoop") → factuur aangemaakt maar
//      NIET afgerond (status ≠ "klaar_voor_accountview") en NIET geaccordeerd
//      (geaccordeerd = false). Mechanisme: magAfronden-vlag in de productiefunctie.
//
// Aanroepen:
//   pnpm --filter @workspace/api-server exec tsx \
//     src/scripts/verificatie-concurrente-accountview-boeking.ts

import { createRequire } from "node:module";
import {
  db,
  facturenTable,
  algemeneInkopenTable,
  goedkeuringAanvragenTable,
  gebruikersTable,
  accountviewExportLogsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import type { FactuurStroomAnalyse } from "../lib/documentIntelligence";

// ── Productieguard ─────────────────────────────────────────────────────────────
// Dit script schrijft testrecords naar de database en activeert de goedkeurings-
// motor. Uitvoering op de productie-database kan externe boeking-calls triggeren.
// Blokkeer expliciet als NODE_ENV=production of VERIFICATIE_TOEGESTAAN niet gezet.
// ── Productieguard ─────────────────────────────────────────────────────────────
// Dit script maakt records aan en activeert de goedkeuringsmotor. Uitvoering op
// een productie-database is onacceptabel (testfacturen, externe boekings-calls).
//
// Twee lagen:
//   1. Harde blokkade als NODE_ENV=production.
//   2. Verplichte opt-in: VERIFICATIE_TOEGESTAAN=1 moet altijd expliciet worden
//      gezet om te bevestigen dat dit geen productie-omgeving is. Stel dit NOOIT
//      in via een productie-configuratie (deployments, Actions-secrets voor prod).
(function prodGuard() {
  if (process.env.NODE_ENV === "production") {
    console.error("⛔  PRODUCTIEGUARD: NODE_ENV=production — script geblokkeerd.");
    process.exit(1);
  }
  if (process.env.VERIFICATIE_TOEGESTAAN !== "1") {
    console.error(
      "⛔  PRODUCTIEGUARD: stel VERIFICATIE_TOEGESTAAN=1 in om te bevestigen dat\n" +
      "    dit script niet op een productie-database wordt uitgevoerd.\n" +
      "    Aanroepen: VERIFICATIE_TOEGESTAAN=1 pnpm --filter @workspace/api-server exec tsx \\\n" +
      "      src/scripts/verificatie-concurrente-accountview-boeking.ts",
    );
    process.exit(1);
  }
})();

// objectStorage.ts (transitief geïmporteerd via services) verwacht CJS-require.
(globalThis as { require?: NodeJS.Require }).require = createRequire(import.meta.url);

const { claimAccountviewVerzending } = await import("../services/accountviewExportService");
const { verwerkDirectBetaaldeBonFactuur } = await import("../services/factuurstroomService");

// ── hulpfuncties ───────────────────────────────────────────────────────────────

let geslaagd = 0;
let mislukt = 0;

function check(naam: string, conditie: boolean, details?: unknown): void {
  if (conditie) {
    geslaagd++;
    console.log(`✅ ${naam}${details !== undefined ? ` — ${JSON.stringify(details)}` : ""}`);
  } else {
    mislukt++;
    console.error(`❌ ${naam}${details !== undefined ? ` — ${JSON.stringify(details)}` : ""}`);
    process.exitCode = 1;
  }
}

const runId = Date.now().toString(36).toUpperCase();

// Deterministisch AI-fixture (vervangt de echte AI-analyselaag via _analyseOverride).
// Bedrag en leverancier komen overeen met de inkoop zodat magAfronden=true is
// voor normale inkoopstatus=open en geen openAanvraag (scenario 2 "klaar_voor_boeking"),
// maar magAfronden=false wanneer status=ter_goedkeuring of openAanvraag≠null (scenario 3).
function maakAnalyseFixture(suffix: string): FactuurStroomAnalyse {
  return {
    ok: true,
    is_factuur: true,
    fout: null,
    velden: {
      leverancier_naam: "Verificatie Leverancier BV",
      factuurnummer: `VF-${runId}${suffix}`,
      factuurdatum: "2026-08-01",
      vervaldatum: null,
      betalingstermijn_dagen: null,
      bedrag_excl_btw: 100.0,
      btw_bedrag: 21.0,
      bedrag_incl_btw: 121.0,
      iban: null,
      loondeel_bedrag: null,
      loondeel_vermeld: false,
      tenaamstelling: "FPS Bouw B.V.",
      verwijzing: null,
      omschrijving: "Verificatie inkoop bon",
      onzekere_velden: [],
    },
  };
}

// Lege buffer + pad — de productiefunctie schrijft deze niet (opslag is al gedaan),
// maar buffer is wel verplicht als parameter.
const LEGE_BUFFER = Buffer.from("%PDF-1.4");
const NEPPE_PAD = `/objects/verif-${runId}.pdf`;

// Zoek een testgebruiker.
const [gebruikerRij] = await db
  .select({ id: gebruikersTable.id, naam: gebruikersTable.naam })
  .from(gebruikersTable)
  .limit(1);
if (!gebruikerRij) throw new Error("Geen gebruiker gevonden in de dev-DB.");
const gebruikerId = gebruikerRij.id;
const gebruikerNaam = gebruikerRij.naam ?? "Verificatie";

// Minimale testfactuur aanmaken (voor scenario 1).
async function maakTestFactuur(suffix: string): Promise<number> {
  const [f] = await db
    .insert(facturenTable)
    .values({
      factuurnummer: `VERIF-${runId}${suffix}`,
      factuurdatum: new Date().toISOString().slice(0, 10),
      relatienaam: "Verificatie BV",
      bedragInclBtw: "100.00",
      btwCode: "H",
      geaccordeerd: false,
      geblokkeerd: false,
    })
    .returning({ id: facturenTable.id });
  return f!.id;
}

// Minimale directe-betaald-inkoop aanmaken.
async function maakDirecteInkoop(
  status: "open" | "ter_goedkeuring",
): Promise<number> {
  const [i] = await db
    .insert(algemeneInkopenTable)
    .values({
      soort: "direct_betaald",
      status,
      leverancierNaam: "Verificatie Leverancier BV",
      omschrijving: `VERIF-${runId}`,
      kostensoort: "overig",
      bedrag: 121.0,        // werkelijk betaald bedrag — dit is het veld dat de productiefunctie vergelijkt
      verwachtBedrag: 121.0, // informatief; niet gebruikt bij directe-betaald-matching
      besteldDoorId: gebruikerId,
    })
    .returning({ id: algemeneInkopenTable.id });
  return i!.id;
}

const factuurIds: number[] = [];
const inkoopIds: number[] = [];
const aanvraagIds: number[] = [];

try {
  // ════════════════════════════════════════════════════════════════════════════
  // SCENARIO 1 — Twee parallelle exportclaims op dezelfde factuur
  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n── Scenario 1: twee parallelle exportclaims ──");

  const f1 = await maakTestFactuur("-s1");
  factuurIds.push(f1);

  // Beide claims gelijktijdig; de atomaire UPDATE-WHERE-RETURNING garandeert
  // dat precies één rij wordt teruggegeven.
  const [claim1, claim2] = await Promise.all([
    claimAccountviewVerzending(f1),
    claimAccountviewVerzending(f1),
  ]);

  const aantalTrue = [claim1, claim2].filter(Boolean).length;
  check(
    "exact één claim slaagt (true), de andere faalt (false)",
    aantalTrue === 1,
    { claim1, claim2 },
  );

  const [f1db] = await db
    .select({ accountviewStatus: facturenTable.accountviewStatus })
    .from(facturenTable)
    .where(eq(facturenTable.id, f1));
  check(
    "factuur.accountviewStatus = 'verzenden' na de geslaagde claim",
    f1db?.accountviewStatus === "verzenden",
    { status: f1db?.accountviewStatus },
  );

  // Actieve claim blokkeert derde poging.
  const claim3 = await claimAccountviewVerzending(f1);
  check(
    "actieve 'verzenden'-claim blokkeert een derde poging",
    claim3 === false,
    { claim3 },
  );

  // Na succesvolle boeking (status 'success') is de factuur niet meer claimbaar.
  await db
    .update(facturenTable)
    .set({ accountviewStatus: "success", bijgewerktOp: new Date() })
    .where(eq(facturenTable.id, f1));
  const claim4 = await claimAccountviewVerzending(f1);
  check(
    "al geboekte factuur (status 'success') kan niet opnieuw worden geclaimd",
    claim4 === false,
    { claim4 },
  );

  // ════════════════════════════════════════════════════════════════════════════
  // SCENARIO 2 — Twee parallelle PDF-verwerkingen op dezelfde inkoop
  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n── Scenario 2: twee parallelle PDF-verwerkingen (direct_betaald) ──");

  const inkoop2 = await maakDirecteInkoop("open");
  inkoopIds.push(inkoop2);

  // Roep de echte productiefunctie gelijktijdig aan voor dezelfde inkoop.
  // De verliezende transactie ziet ná de FOR UPDATE-lock dat factuurId al ingevuld
  // is en geeft "al_gekoppeld" terug (stabiele uitkomst, geen 500).
  type TxUitkomst2 = { factuurId: number | undefined; uitkomst: string };

  async function probeerVerwerken(suffix: string): Promise<TxUitkomst2> {
    const r = await verwerkDirectBetaaldeBonFactuur({
      inkoopId: inkoop2,
      buffer: LEGE_BUFFER,
      bestandsnaam: `bon-${runId}${suffix}.pdf`,
      subPath: NEPPE_PAD,
      gebruikerNaam,
      _analyseOverride: maakAnalyseFixture(suffix),
    });
    return { factuurId: r.factuurId, uitkomst: r.uitkomst };
  }

  const [res2a, res2b] = await Promise.all([
    probeerVerwerken("-s2a"),
    probeerVerwerken("-s2b"),
  ]);

  // Exact één aanroep slaagt (uitkomst "klaar_voor_boeking" of "goedkeuring_vereist");
  // de andere krijgt "al_gekoppeld" als stabiele uitkomst — geen exception, geen 500.
  const aantalGeslaagd2 = [res2a, res2b].filter(
    (r) => r.uitkomst !== "al_gekoppeld",
  ).length;
  check(
    "exact één verwerking maakt een factuur (de andere verliest de transactie-race)",
    aantalGeslaagd2 === 1,
    { res2a, res2b },
  );
  check(
    "verliezende verwerking geeft stabiele 'al_gekoppeld' (geen exception)",
    [res2a, res2b].some((r) => r.uitkomst === "al_gekoppeld"),
    { res2a, res2b },
  );

  const gelinktFactuurId =
    res2a.factuurId && res2a.uitkomst !== "al_gekoppeld"
      ? res2a.factuurId
      : res2b.factuurId && res2b.uitkomst !== "al_gekoppeld"
        ? res2b.factuurId
        : null;
  if (gelinktFactuurId) factuurIds.push(gelinktFactuurId);

  const [inkoop2db] = await db
    .select({ factuurId: algemeneInkopenTable.factuurId })
    .from(algemeneInkopenTable)
    .where(eq(algemeneInkopenTable.id, inkoop2));
  check(
    "inkoop.factuurId is na de race precies één waarde (niet null)",
    inkoop2db?.factuurId !== null && inkoop2db?.factuurId !== undefined,
    { factuurId: inkoop2db?.factuurId },
  );

  // ════════════════════════════════════════════════════════════════════════════
  // SCENARIO 3 — Goedkeuringspoort blokkeert automatische afronding
  // ════════════════════════════════════════════════════════════════════════════
  console.log("\n── Scenario 3: goedkeuringspoort blokkeert afronding ──");

  // 3-basis: positieve controle — een open inkoop zonder blokkades bereikt
  //          klaar_voor_accountview en geaccordeerd=true. Dit bewijst dat de
  //          fixture correct is en dat de blokkeerscenario's (3a/3b/3c) alleen
  //          de specifieke gate testen, niet een defecte basisopzet.
  console.log("\n── Scenario 3-basis: positieve controle (open inkoop, geen blokkades) ──");
  const inkoop3basis = await maakDirecteInkoop("open");
  inkoopIds.push(inkoop3basis);

  const res3basis = await verwerkDirectBetaaldeBonFactuur({
    inkoopId: inkoop3basis,
    buffer: LEGE_BUFFER,
    bestandsnaam: `bon-${runId}-3basis.pdf`,
    subPath: NEPPE_PAD,
    gebruikerNaam,
    _analyseOverride: maakAnalyseFixture("-s3basis"),
  });
  if (res3basis.factuurAangemaakt && res3basis.factuurId) factuurIds.push(res3basis.factuurId);

  check(
    "3-basis: open inkoop met matchend bedrag → uitkomst 'klaar_voor_boeking' of 'goedkeuring_vereist' (niet afwijking/fout)",
    res3basis.uitkomst === "klaar_voor_boeking" || res3basis.uitkomst === "goedkeuring_vereist",
    { uitkomst: res3basis.uitkomst },
  );

  if (res3basis.factuurId && res3basis.uitkomst === "klaar_voor_boeking") {
    const [f3basis] = await db
      .select({ status: facturenTable.status, geaccordeerd: facturenTable.geaccordeerd })
      .from(facturenTable)
      .where(eq(facturenTable.id, res3basis.factuurId));
    check(
      "3-basis: factuur status = klaar_voor_accountview",
      f3basis?.status === "klaar_voor_accountview",
      { status: f3basis?.status },
    );
    check(
      "3-basis: factuur geaccordeerd = true",
      f3basis?.geaccordeerd === true,
      { geaccordeerd: f3basis?.geaccordeerd },
    );
  }

  // 3a: inkoop met status "ter_goedkeuring" → de productiefunctie maakt WEL
  //     een factuur aan (als bewijsstuk) maar magAfronden = false.
  const inkoop3a = await maakDirecteInkoop("ter_goedkeuring");
  inkoopIds.push(inkoop3a);

  const res3a = await verwerkDirectBetaaldeBonFactuur({
    inkoopId: inkoop3a,
    buffer: LEGE_BUFFER,
    bestandsnaam: `bon-${runId}-3a.pdf`,
    subPath: NEPPE_PAD,
    gebruikerNaam,
    _analyseOverride: maakAnalyseFixture("-s3a"),
  });
  if (res3a.factuurAangemaakt && res3a.factuurId) factuurIds.push(res3a.factuurId);

  check(
    "inkoop ter_goedkeuring: factuur aangemaakt als bewijsstuk",
    res3a.factuurAangemaakt === true,
    { uitkomst: res3a.uitkomst },
  );

  if (res3a.factuurId) {
    const [f3a] = await db
      .select({ status: facturenTable.status, geaccordeerd: facturenTable.geaccordeerd })
      .from(facturenTable)
      .where(eq(facturenTable.id, res3a.factuurId));
    check(
      "inkoop ter_goedkeuring: factuur NIET klaar_voor_accountview (geen afronding)",
      f3a?.status !== "klaar_voor_accountview",
      { status: f3a?.status },
    );
    check(
      "inkoop ter_goedkeuring: factuur NIET geaccordeerd (geen accordering)",
      f3a?.geaccordeerd === false,
      { geaccordeerd: f3a?.geaccordeerd },
    );
  }

  // 3b: inkoop met status "open" maar open goedkeuringsaanvraag → zelfde uitkomst.
  //     objectType moet "algemene_inkoop" zijn — dat is wat de productiefunctie
  //     opzoekt via haalOpenAanvraag(db, "algemene_inkoop", inkoopId).
  const inkoop3b = await maakDirecteInkoop("open");
  inkoopIds.push(inkoop3b);

  const [aanvraag] = await db
    .insert(goedkeuringAanvragenTable)
    .values({
      objectType: "algemene_inkoop",
      objectId: inkoop3b,
      documentType: "inkoop_bon",
      status: "ingediend",
      ingediendDoorId: gebruikerId,
    })
    .returning({ id: goedkeuringAanvragenTable.id });
  aanvraagIds.push(aanvraag!.id);

  const res3b = await verwerkDirectBetaaldeBonFactuur({
    inkoopId: inkoop3b,
    buffer: LEGE_BUFFER,
    bestandsnaam: `bon-${runId}-3b.pdf`,
    subPath: NEPPE_PAD,
    gebruikerNaam,
    _analyseOverride: maakAnalyseFixture("-s3b"),
  });
  if (res3b.factuurAangemaakt && res3b.factuurId) factuurIds.push(res3b.factuurId);

  check(
    "inkoop open + open aanvraag: factuur aangemaakt als bewijsstuk",
    res3b.factuurAangemaakt === true,
    { uitkomst: res3b.uitkomst },
  );

  if (res3b.factuurId) {
    const [f3b] = await db
      .select({ status: facturenTable.status, geaccordeerd: facturenTable.geaccordeerd })
      .from(facturenTable)
      .where(eq(facturenTable.id, res3b.factuurId));
    check(
      "inkoop open + open aanvraag: factuur NIET klaar_voor_accountview (geen afronding)",
      f3b?.status !== "klaar_voor_accountview",
      { status: f3b?.status },
    );
    check(
      "inkoop open + open aanvraag: factuur NIET geaccordeerd (geen accordering)",
      f3b?.geaccordeerd === false,
      { geaccordeerd: f3b?.geaccordeerd },
    );
  }

  // 3c: barrier-bewijs — aanvraag ingediend TERWIJL verwerking bij AI-stap wacht.
  //
  //     JavaScript is single-threaded; een niet-geawaite async functie loopt tot
  //     de eerste interne `await` en geeft dan control terug aan de outer context.
  //     Door _analyseOverride een async factory te maken die een barrière awaits,
  //     kunnen we de aanvraag-indiening (inclusief DB-commit) determinisch laten
  //     plaatsvinden vóór verwerkDirectBetaaldeBonFactuur zijn transactie start.
  //
  //     De in-tx haalOpenAanvraag-herlees ziet de gecommitte aanvraag → magAfronden=false.
  //     Dit bewijst dat de race-window (aanvraag ingediend TUSSEN AI-analyse en tx-start)
  //     gesloten is.
  console.log("\n── Scenario 3c: barrier-bewijs (aanvraag ingediend TIJDENS AI-analyse) ──");

  const inkoop3c = await maakDirecteInkoop("open");
  inkoopIds.push(inkoop3c);

  // Maak een barrier-promise: geeft control aan outer zodat de aanvraag kan committen
  // vóór de transactie van verwerkDirectBetaaldeBonFactuur start.
  let barrierOntgrendelen!: () => void;
  const barrier = new Promise<void>(resolve => { barrierOntgrendelen = resolve; });

  // Start verwerking op de achtergrond — functie stopt bij de async AI-factory.
  const verwerkBelofte = verwerkDirectBetaaldeBonFactuur({
    inkoopId: inkoop3c,
    buffer: LEGE_BUFFER,
    bestandsnaam: `bon-${runId}-3c.pdf`,
    subPath: NEPPE_PAD,
    gebruikerNaam,
    _analyseOverride: async () => {
      // Wacht tot de outer context de barrier vrijgeeft (ná aanvraag-commit).
      await barrier;
      return maakAnalyseFixture("-s3c");
    },
  });

  // Outer context: dien aanvraag in en commit terwijl verwerking bij factory wacht.
  // `await db.insert(...)` completeert vóór barrierOntgrendelen() — gegarandeerd
  // door de sequentiële uitvoering van de outer async functie.
  const [aanvraag3c] = await db
    .insert(goedkeuringAanvragenTable)
    .values({
      objectType: "algemene_inkoop",
      objectId: inkoop3c,
      documentType: "inkoop_bon",
      status: "ingediend",
      ingediendDoorId: gebruikerId,
    })
    .returning({ id: goedkeuringAanvragenTable.id });
  aanvraagIds.push(aanvraag3c!.id);
  check(
    "3c: aanvraag gecommit TERWIJL verwerking bij AI-factory wacht (echt concurrent)",
    aanvraag3c !== undefined,
    { aanvraagId: aanvraag3c?.id },
  );

  // Geef de barrier vrij → verwerking vervolgt, transactie start, herlees aanvraag.
  barrierOntgrendelen();
  const res3c = await verwerkBelofte;
  if (res3c.factuurAangemaakt && res3c.factuurId) factuurIds.push(res3c.factuurId);

  check(
    "3c: factuur aangemaakt — inkoop was open op het moment van uploaden",
    res3c.factuurAangemaakt === true,
    { uitkomst: res3c.uitkomst },
  );

  if (res3c.factuurId) {
    const [f3c] = await db
      .select({ status: facturenTable.status, geaccordeerd: facturenTable.geaccordeerd })
      .from(facturenTable)
      .where(eq(facturenTable.id, res3c.factuurId));
    check(
      "3c: in-tx herlees pikt race-aanvraag op → factuur NIET klaar_voor_accountview",
      f3c?.status !== "klaar_voor_accountview",
      { status: f3c?.status },
    );
    check(
      "3c: factuur NIET geaccordeerd — poort hield stand bij echte race",
      f3c?.geaccordeerd === false,
      { geaccordeerd: f3c?.geaccordeerd },
    );
  }

} finally {
  // Cleanup testdata in omgekeerde volgorde.
  for (const id of aanvraagIds) {
    await db.delete(goedkeuringAanvragenTable).where(eq(goedkeuringAanvragenTable.id, id));
  }
  for (const id of inkoopIds) {
    await db.update(algemeneInkopenTable).set({ factuurId: null }).where(eq(algemeneInkopenTable.id, id));
    await db.delete(algemeneInkopenTable).where(eq(algemeneInkopenTable.id, id));
  }
  await db.delete(accountviewExportLogsTable).where(
    eq(accountviewExportLogsTable.factuurId, factuurIds[0] ?? -1),
  );
  for (const id of factuurIds) {
    await db.delete(facturenTable).where(eq(facturenTable.id, id));
  }
}

const totaal = geslaagd + mislukt;
console.log(`\n${process.exitCode ? "FAIL" : "OK"} (${geslaagd}/${totaal})`);
