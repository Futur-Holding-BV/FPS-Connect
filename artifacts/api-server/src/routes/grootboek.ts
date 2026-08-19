import { Router } from "express";
import type { Request, Response } from "express";
import {
  db,
  grootboekrekeningenTable,
  btwCodesTable,
  accountviewInstellingenTable,
  facturenTable,
  factuurRegelsTable,
  leveranciersTable,
  leverancierCategorisatieTable,
  werkgeversTable,
} from "@workspace/db";
import { eq, and, sql, inArray } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { maakAccountViewClient } from "../services/accountview-client";
import { voedRekeningschemaOpen } from "../lib/bewakingsloop";
import { bepaalFactuurWerkmaatschappij } from "../services/factuurWerkmaatschappij";

// ── Rekeningschema per werkmaatschappij (ADMINISTRATIE_01) ────────────────────
// Nummer + omschrijving + soort, per BV. Gevuld via AccountView-sync (indien de
// koppeling dat toestaat — meetbaar via de sync-route) of via een ingelezen
// lijst. Overal waar een grootboekrekening wordt gekozen, komt de keuzelijst
// hiervandaan; de exportservice weigert boeken buiten het schema.

const router = Router();

function mapRekening(r: typeof grootboekrekeningenTable.$inferSelect) {
  return {
    id: r.id,
    werkgever_id: r.werkgeverId,
    nummer: r.nummer,
    omschrijving: r.omschrijving,
    soort: r.soort ?? null,
    actief: r.actief,
    bron: r.bron,
    bijgewerkt_op: r.bijgewerktOp.toISOString(),
  };
}

// GET /grootboekrekeningen?werkgever_id=1 — keuzelijst (alle ingelogde
// gebruikers met factuur-leesrecht hebben deze lijst nodig in formulieren).
router.get("/grootboekrekeningen", requireBevoegdheid("financieel", 1), async (req: Request, res: Response): Promise<void> => {
  const wgRaw = req.query["werkgever_id"];
  let wgId = wgRaw == null ? null : Number(wgRaw);
  // Scoping per BV: zonder parameter geldt de BV van de AccountView-koppeling
  // (daar wordt geboekt). Nooit ongescopeerd alle BV-schema's teruggeven.
  if (wgId == null || !Number.isFinite(wgId)) {
    const [inst] = await db.select({ werkgeverId: accountviewInstellingenTable.werkgeverId })
      .from(accountviewInstellingenTable).where(eq(accountviewInstellingenTable.id, 1)).limit(1);
    wgId = inst?.werkgeverId ?? null;
  }
  if (wgId == null) {
    res.json([]);
    return;
  }
  const rijen = await db
    .select()
    .from(grootboekrekeningenTable)
    .where(eq(grootboekrekeningenTable.werkgeverId, wgId))
    .orderBy(grootboekrekeningenTable.nummer);
  res.json(rijen.map(mapRekening));
});

// Gedeelde upsert: schrijft een lijst rekeningen voor één BV weg. Bestaande
// nummers worden bijgewerkt (omschrijving/soort/actief), nieuwe toegevoegd.
// Er wordt NIET verwijderd — een rekening die uit de bron verdwijnt, wordt op
// actief=false gezet zodat historische facturen leesbaar blijven.
async function upsertSchema(
  werkgeverId: number,
  rekeningen: Array<{ nummer: string; omschrijving: string; soort: string | null }>,
  bron: "accountview" | "import",
): Promise<{ toegevoegd: number; bijgewerkt: number; gedeactiveerd: number }> {
  // Dubbele nummers in de bron (laatste wint) — óók voor AccountView-responses.
  const uniek = [...new Map(rekeningen.map((r) => [r.nummer, r])).values()];
  return await db.transaction(async (tx) => {
    const bestaand = await tx
      .select({ id: grootboekrekeningenTable.id, nummer: grootboekrekeningenTable.nummer, actief: grootboekrekeningenTable.actief })
      .from(grootboekrekeningenTable)
      .where(eq(grootboekrekeningenTable.werkgeverId, werkgeverId));
    const bestaandeNummers = new Set(bestaand.map((b) => b.nummer));
    const nieuweNummers = new Set(uniek.map((r) => r.nummer));
    let toegevoegd = 0;
    let bijgewerkt = 0;
    let gedeactiveerd = 0;
    // Conflictbestendige upsert: gelijktijdige import/sync voor dezelfde BV kan
    // niet meer op de unieke sleutel (werkgever_id, nummer) klappen.
    for (const r of uniek) {
      await tx.insert(grootboekrekeningenTable)
        .values({ werkgeverId, nummer: r.nummer, omschrijving: r.omschrijving, soort: r.soort, bron })
        .onConflictDoUpdate({
          target: [grootboekrekeningenTable.werkgeverId, grootboekrekeningenTable.nummer],
          set: { omschrijving: r.omschrijving, soort: r.soort, actief: true, bron, bijgewerktOp: new Date() },
        });
      if (bestaandeNummers.has(r.nummer)) bijgewerkt++; else toegevoegd++;
    }
    for (const b of bestaand) {
      if (!nieuweNummers.has(b.nummer) && b.actief) {
        await tx.update(grootboekrekeningenTable)
          .set({ actief: false, bijgewerktOp: new Date() })
          .where(eq(grootboekrekeningenTable.id, b.id));
        gedeactiveerd++;
      }
    }
    return { toegevoegd, bijgewerkt, gedeactiveerd };
  });
}

// POST /grootboekrekeningen/sync-accountview — probeert het rekeningschema op
// te halen uit AccountView voor de gekoppelde BV. Meet en meldt of de
// koppeling dit toestaat; zo niet, dan blijft het inlezen van een lijst over.
router.post("/grootboekrekeningen/sync-accountview", requireBevoegdheid("systeem", 2), async (req: Request, res: Response): Promise<void> => {
  const [inst] = await db.select().from(accountviewInstellingenTable).where(eq(accountviewInstellingenTable.id, 1)).limit(1);
  if (!inst || inst.werkgeverId == null) {
    res.status(422).json({
      beschikbaar: false,
      reden: "De AccountView-koppeling heeft nog geen werkmaatschappij (BV) — stel die eerst in bij Boekhouding.",
    });
    return;
  }
  const client = maakAccountViewClient(inst);
  const resultaat = await client.haalGrootboekrekeningen();
  if (!resultaat.beschikbaar || !resultaat.rekeningen) {
    // Meetresultaat: de koppeling staat het (nu) niet toe — exacte reden mee.
    res.status(200).json({ beschikbaar: false, http_status: resultaat.httpStatus ?? null, reden: resultaat.reden ?? "Onbekende reden" });
    return;
  }
  const telling = await upsertSchema(inst.werkgeverId, resultaat.rekeningen, "accountview");
  // Schema net gevuld → het "poort staat open"-actiepunt direct laten sluiten.
  voedRekeningschemaOpen().catch(() => {});
  res.json({ beschikbaar: true, http_status: resultaat.httpStatus ?? null, aantal: resultaat.rekeningen.length, ...telling });
});

// POST /grootboekrekeningen/import — lijst inlezen voor één BV.
// Body: { werkgever_id, regels: "4000;Inkoop materialen;kosten\n..." } of
// { werkgever_id, rekeningen: [{nummer, omschrijving, soort}] }.
// Scheidingsteken ; of tab of , — nummer verplicht, omschrijving aanbevolen.
router.post("/grootboekrekeningen/import", requireBevoegdheid("systeem", 2), async (req: Request, res: Response): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const wgId = Number(body["werkgever_id"]);
  if (!Number.isFinite(wgId)) {
    res.status(400).json({ error: "werkgever_id is verplicht" });
    return;
  }
  const [wg] = await db.select({ id: werkgeversTable.id }).from(werkgeversTable).where(eq(werkgeversTable.id, wgId));
  if (!wg) {
    res.status(404).json({ error: "Werkmaatschappij niet gevonden" });
    return;
  }
  let rekeningen: Array<{ nummer: string; omschrijving: string; soort: string | null }> = [];
  if (Array.isArray(body["rekeningen"])) {
    for (const r of body["rekeningen"] as Array<Record<string, unknown>>) {
      const nummer = String(r["nummer"] ?? "").trim();
      if (!nummer) continue;
      rekeningen.push({
        nummer,
        omschrijving: String(r["omschrijving"] ?? "").trim(),
        soort: r["soort"] == null ? null : String(r["soort"]).trim() || null,
      });
    }
  } else if (typeof body["regels"] === "string") {
    for (const regel of (body["regels"] as string).split(/\r?\n/)) {
      const kaal = regel.trim();
      if (!kaal || kaal.startsWith("#")) continue;
      const delen = kaal.split(/[;\t]|,(?=\S)/).map((d) => d.trim());
      const nummer = delen[0] ?? "";
      // Kopregel ("nummer;omschrijving;...") overslaan.
      if (!nummer || /^nummer$/i.test(nummer)) continue;
      rekeningen.push({ nummer, omschrijving: delen[1] ?? "", soort: delen[2] ? delen[2].toLowerCase() : null });
    }
  }
  // Dubbele nummers binnen de aanlevering: laatste wint.
  const uniek = new Map(rekeningen.map((r) => [r.nummer, r]));
  rekeningen = [...uniek.values()];
  if (rekeningen.length === 0) {
    res.status(422).json({ error: "Geen bruikbare rekeningen gevonden in de aanlevering (verwacht: nummer;omschrijving;soort per regel)." });
    return;
  }
  const telling = await upsertSchema(wgId, rekeningen, "import");
  // Schema net gevuld → het "poort staat open"-actiepunt direct laten sluiten.
  voedRekeningschemaOpen().catch(() => {});
  res.status(201).json({ aantal: rekeningen.length, ...telling });
});

// GET /grootboekrekeningen/poortstatus — per werkmaatschappij: staat de
// boekingspoort open (leeg schema = alles gaat ongecontroleerd door) of is hij
// actief? Zichtbaar op de tab Rekeningschema; hetzelfde signaal voedt het
// werkbak-actiepunt bij de hoofdbeheerder.
router.get("/grootboekrekeningen/poortstatus", requireBevoegdheid("systeem", 1), async (_req: Request, res: Response): Promise<void> => {
  const [inst] = await db.select({ werkgeverId: accountviewInstellingenTable.werkgeverId })
    .from(accountviewInstellingenTable).where(eq(accountviewInstellingenTable.id, 1)).limit(1);
  const rijen = await db
    .select({
      id: werkgeversTable.id,
      naam: werkgeversTable.naam,
      aantal: sql<number>`count(${grootboekrekeningenTable.id}) filter (where ${grootboekrekeningenTable.actief})::int`,
    })
    .from(werkgeversTable)
    .leftJoin(grootboekrekeningenTable, eq(grootboekrekeningenTable.werkgeverId, werkgeversTable.id))
    .groupBy(werkgeversTable.id, werkgeversTable.naam)
    .orderBy(werkgeversTable.naam);
  res.json(rijen.map((r) => ({
    werkgever_id: r.id,
    naam: r.naam,
    aantal_actief: r.aantal,
    poort_actief: r.aantal > 0,
    gekoppeld_aan_boekhouding: inst?.werkgeverId === r.id,
  })));
});

// POST /grootboekrekeningen/omzetten — typefouten in één keer omzetten.
// Body: { van, naar }. Zet overal waar het foute nummer `van` in gebruik is
// (factuurkoppen, factuurregels, leveranciers, aangeleerde categorisaties en
// de instellingen-defaults) het schema-nummer `naar` neer, in één transactie.
// `naar` moet een actieve rekening zijn in het schema van de gekoppelde BV —
// een typefout omzetten naar een volgende typefout kan dus niet.
router.post("/grootboekrekeningen/omzetten", requireBevoegdheid("systeem", 2), async (req: Request, res: Response): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const van = String(body["van"] ?? "").trim();
  const naar = String(body["naar"] ?? "").trim();
  if (!van || !naar) {
    res.status(400).json({ error: "van en naar zijn beide verplicht" });
    return;
  }
  if (van === naar) {
    res.status(400).json({ error: "van en naar zijn gelijk — er valt niets om te zetten" });
    return;
  }
  const [inst] = await db.select({ werkgeverId: accountviewInstellingenTable.werkgeverId })
    .from(accountviewInstellingenTable).where(eq(accountviewInstellingenTable.id, 1)).limit(1);
  if (inst?.werkgeverId == null) {
    res.status(422).json({ error: "De AccountView-koppeling heeft nog geen werkmaatschappij (BV) — stel die eerst in bij Boekhouding." });
    return;
  }
  const [doel] = await db.select({ id: grootboekrekeningenTable.id })
    .from(grootboekrekeningenTable)
    .where(and(
      eq(grootboekrekeningenTable.werkgeverId, inst.werkgeverId),
      eq(grootboekrekeningenTable.nummer, naar),
      eq(grootboekrekeningenTable.actief, true),
    ))
    .limit(1);
  if (!doel) {
    res.status(422).json({ error: `Rekening ${naar} staat niet (actief) in het rekeningschema — omzetten kan alleen naar een schema-rekening.` });
    return;
  }
  // BV- en statusbewust (architect-review): alleen facturen van de gekoppelde
  // BV, en nooit facturen die verwerkt of al succesvol naar AccountView
  // geboekt zijn — die zijn dossier; stil omzetten zou Connect en AccountView
  // uit elkaar laten lopen. Overgeslagen facturen worden geteld en teruggemeld.
  const kandidaten = await db
    .selectDistinct({
      id: facturenTable.id,
      status: facturenTable.status,
      avStatus: facturenTable.accountviewStatus,
      offerteId: facturenTable.offerteId,
      opdrachtId: facturenTable.opdrachtId,
      gebouwId: facturenTable.gebouwId,
    })
    .from(facturenTable)
    .leftJoin(factuurRegelsTable, eq(factuurRegelsTable.factuurId, facturenTable.id))
    .where(sql`${facturenTable.grootboekrekening} = ${van} OR ${factuurRegelsTable.grootboekrekening} = ${van}`);
  const kandidaatIds: number[] = [];
  let overgeslagenGeboekt = 0;
  let overgeslagenAndereBv = 0;
  for (const k of kandidaten) {
    if (k.status === "verwerkt" || k.status === "verzonden_naar_accountview" || k.avStatus === "success" || k.avStatus === "verzenden") { overgeslagenGeboekt++; continue; }
    const bv = await bepaalFactuurWerkmaatschappij(k);
    if (bv?.id !== inst.werkgeverId) { overgeslagenAndereBv++; continue; }
    kandidaatIds.push(k.id);
  }
  const omgezet = await db.transaction(async (tx) => {
    // Herbeoordeel de status ín de transactie met rijvergrendeling (TOCTOU,
    // architect-review): een gelijktijdige export kan een kandidaat tussen de
    // voorselectie en deze update alsnog boeken. FOR UPDATE laat ons wachten
    // op zo'n export en de verse status zien; net-geboekte facturen vallen af.
    const vers = kandidaatIds.length === 0 ? [] : await tx
      .select({ id: facturenTable.id })
      .from(facturenTable)
      .where(and(
        inArray(facturenTable.id, kandidaatIds),
        sql`${facturenTable.status} NOT IN ('verwerkt', 'verzonden_naar_accountview')`,
        // 'verzenden' = lopende exportclaim (claimAccountviewVerzending): de
        // externe boeking is dan mogelijk al onderweg met de oude payload.
        sql`(${facturenTable.accountviewStatus} IS NULL OR ${facturenTable.accountviewStatus} NOT IN ('success', 'verzenden'))`,
      ))
      .for("update");
    const toegestaneIds = vers.map((v) => v.id);
    overgeslagenGeboekt += kandidaatIds.length - toegestaneIds.length;
    const fk = toegestaneIds.length === 0 ? [] : await tx.update(facturenTable)
      .set({ grootboekrekening: naar })
      .where(and(eq(facturenTable.grootboekrekening, van), inArray(facturenTable.id, toegestaneIds)))
      .returning({ id: facturenTable.id });
    const fr = toegestaneIds.length === 0 ? [] : await tx.update(factuurRegelsTable)
      .set({ grootboekrekening: naar })
      .where(and(eq(factuurRegelsTable.grootboekrekening, van), inArray(factuurRegelsTable.factuurId, toegestaneIds)))
      .returning({ id: factuurRegelsTable.id });
    const lev = await tx.update(leveranciersTable)
      .set({ grootboekrekening: naar })
      .where(eq(leveranciersTable.grootboekrekening, van))
      .returning({ id: leveranciersTable.id });
    const cat = await tx.update(leverancierCategorisatieTable)
      .set({ grootboekrekening: naar })
      .where(eq(leverancierCategorisatieTable.grootboekrekening, van))
      .returning({ id: leverancierCategorisatieTable.id });
    const instUpd: Record<string, number> = {};
    const [huidig] = await tx.select().from(accountviewInstellingenTable).where(eq(accountviewInstellingenTable.id, 1)).limit(1);
    if (huidig) {
      const set: Partial<typeof accountviewInstellingenTable.$inferInsert> = {};
      if ((huidig.grootboekStandaard ?? "").trim() === van) { set.grootboekStandaard = naar; instUpd["grootboek_standaard"] = 1; }
      if ((huidig.grootboekVoorraad ?? "").trim() === van) { set.grootboekVoorraad = naar; instUpd["grootboek_voorraad"] = 1; }
      if ((huidig.grootboekInkoopKosten ?? "").trim() === van) { set.grootboekInkoopKosten = naar; instUpd["grootboek_inkoop_kosten"] = 1; }
      if (Object.keys(set).length > 0) {
        await tx.update(accountviewInstellingenTable).set(set).where(eq(accountviewInstellingenTable.id, 1));
      }
    }
    return {
      facturen: fk.length,
      factuurregels: fr.length,
      leveranciers: lev.length,
      leverancier_categorisatie: cat.length,
      instellingen: Object.keys(instUpd).length,
    };
  });
  const totaal = Object.values(omgezet).reduce((a, b) => a + b, 0);
  res.json({ van, naar, totaal, ...omgezet, overgeslagen_geboekt: overgeslagenGeboekt, overgeslagen_andere_bv: overgeslagenAndereBv });
});

// GET /grootboekrekeningen/gebruik — meting (ADMINISTRATIE_01 punt 4): welke
// rekeningnummers zijn nu in gebruik, waar, hoe vaak — en welke daarvan NIET
// in het schema van de gekoppelde BV voorkomen (de aangeleerde typefouten).
router.get("/grootboekrekeningen/gebruik", requireBevoegdheid("systeem", 1), async (req: Request, res: Response): Promise<void> => {
  const gebruik = new Map<string, { nummer: string; bronnen: Record<string, number> }>();
  const tel = (nummer: string | null | undefined, bron: string, n = 1) => {
    const kaal = (nummer ?? "").trim();
    if (!kaal) return;
    const rec = gebruik.get(kaal) ?? { nummer: kaal, bronnen: {} };
    rec.bronnen[bron] = (rec.bronnen[bron] ?? 0) + n;
    gebruik.set(kaal, rec);
  };

  const fk = await db.select({ n: facturenTable.grootboekrekening, c: sql<number>`count(*)::int` })
    .from(facturenTable).groupBy(facturenTable.grootboekrekening);
  for (const r of fk) tel(r.n, "facturen", r.c);
  const fr = await db.select({ n: factuurRegelsTable.grootboekrekening, c: sql<number>`count(*)::int` })
    .from(factuurRegelsTable).groupBy(factuurRegelsTable.grootboekrekening);
  for (const r of fr) tel(r.n, "factuurregels", r.c);
  const lev = await db.select({ n: leveranciersTable.grootboekrekening, c: sql<number>`count(*)::int` })
    .from(leveranciersTable).groupBy(leveranciersTable.grootboekrekening);
  for (const r of lev) tel(r.n, "leveranciers", r.c);
  const cat = await db.select({ n: leverancierCategorisatieTable.grootboekrekening, c: sql<number>`count(*)::int` })
    .from(leverancierCategorisatieTable).groupBy(leverancierCategorisatieTable.grootboekrekening);
  for (const r of cat) tel(r.n, "leverancier_categorisatie", r.c);
  const [inst] = await db.select().from(accountviewInstellingenTable).where(eq(accountviewInstellingenTable.id, 1)).limit(1);
  if (inst) {
    tel(inst.grootboekStandaard, "instelling_grootboek_standaard");
    tel(inst.grootboekVoorraad, "instelling_grootboek_voorraad");
    tel(inst.grootboekInkoopKosten, "instelling_grootboek_inkoop_kosten");
  }

  const wgId = inst?.werkgeverId ?? null;
  const schemaNummers = new Set<string>();
  let schemaAantal = 0;
  if (wgId != null) {
    const schema = await db.select({ nummer: grootboekrekeningenTable.nummer })
      .from(grootboekrekeningenTable)
      .where(and(eq(grootboekrekeningenTable.werkgeverId, wgId), eq(grootboekrekeningenTable.actief, true)));
    schemaAantal = schema.length;
    for (const s of schema) schemaNummers.add(s.nummer);
  }

  const items = [...gebruik.values()]
    .map((g) => ({
      nummer: g.nummer,
      totaal: Object.values(g.bronnen).reduce((a, b) => a + b, 0),
      bronnen: g.bronnen,
      // Zonder gevuld schema kunnen we niets als typefout aanmerken.
      in_schema: schemaAantal > 0 ? schemaNummers.has(g.nummer) : null,
    }))
    .sort((a, b) => a.nummer.localeCompare(b.nummer, "nl", { numeric: true }));

  res.json({
    werkgever_id: wgId,
    schema_aantal: schemaAantal,
    totaal_nummers_in_gebruik: items.length,
    niet_in_schema: schemaAantal > 0 ? items.filter((i) => i.in_schema === false).map((i) => i.nummer) : null,
    items,
  });
});

// ═══ Btw-codes per administratie (ADMINISTRATIE_02 §1) ════════════════════════
// Zelfde patroon als het rekeningschema: keuzelijst per BV, gevuld via
// AccountView-sync (meetbaar) of ingelezen lijst; verdwenen codes worden
// gedeactiveerd, nooit gewist.

function mapBtwCode(r: typeof btwCodesTable.$inferSelect) {
  return {
    id: r.id,
    werkgever_id: r.werkgeverId,
    code: r.code,
    omschrijving: r.omschrijving,
    percentage: r.percentage ?? null,
    actief: r.actief,
    bron: r.bron,
    bijgewerkt_op: r.bijgewerktOp.toISOString(),
  };
}

async function upsertBtwSchema(
  werkgeverId: number,
  codes: Array<{ code: string; omschrijving: string; percentage: number | null }>,
  bron: "accountview" | "import",
): Promise<{ toegevoegd: number; bijgewerkt: number; gedeactiveerd: number }> {
  const uniek = [...new Map(codes.map((c) => [c.code, c])).values()];
  return await db.transaction(async (tx) => {
    const bestaand = await tx
      .select({ id: btwCodesTable.id, code: btwCodesTable.code, actief: btwCodesTable.actief })
      .from(btwCodesTable)
      .where(eq(btwCodesTable.werkgeverId, werkgeverId));
    const bestaandeCodes = new Set(bestaand.map((b) => b.code));
    const nieuweCodes = new Set(uniek.map((c) => c.code));
    let toegevoegd = 0;
    let bijgewerkt = 0;
    let gedeactiveerd = 0;
    for (const c of uniek) {
      await tx.insert(btwCodesTable)
        .values({ werkgeverId, code: c.code, omschrijving: c.omschrijving, percentage: c.percentage, bron })
        .onConflictDoUpdate({
          target: [btwCodesTable.werkgeverId, btwCodesTable.code],
          set: { omschrijving: c.omschrijving, percentage: c.percentage, actief: true, bron, bijgewerktOp: new Date() },
        });
      if (bestaandeCodes.has(c.code)) bijgewerkt++; else toegevoegd++;
    }
    for (const b of bestaand) {
      if (!nieuweCodes.has(b.code) && b.actief) {
        await tx.update(btwCodesTable)
          .set({ actief: false, bijgewerktOp: new Date() })
          .where(eq(btwCodesTable.id, b.id));
        gedeactiveerd++;
      }
    }
    return { toegevoegd, bijgewerkt, gedeactiveerd };
  });
}

// GET /btw-codes?werkgever_id=1 — keuzelijst; zonder parameter de gekoppelde BV.
router.get("/btw-codes", requireBevoegdheid("financieel", 1), async (req: Request, res: Response): Promise<void> => {
  const wgRaw = req.query["werkgever_id"];
  let wgId = wgRaw == null ? null : Number(wgRaw);
  if (wgId == null || !Number.isFinite(wgId)) {
    const [inst] = await db.select({ werkgeverId: accountviewInstellingenTable.werkgeverId })
      .from(accountviewInstellingenTable).where(eq(accountviewInstellingenTable.id, 1)).limit(1);
    wgId = inst?.werkgeverId ?? null;
  }
  if (wgId == null) { res.json([]); return; }
  const rijen = await db.select().from(btwCodesTable)
    .where(eq(btwCodesTable.werkgeverId, wgId))
    .orderBy(btwCodesTable.code);
  res.json(rijen.map(mapBtwCode));
});

// POST /btw-codes/sync-accountview — meet en meldt of de koppeling dit toestaat.
router.post("/btw-codes/sync-accountview", requireBevoegdheid("systeem", 2), async (req: Request, res: Response): Promise<void> => {
  const [inst] = await db.select().from(accountviewInstellingenTable).where(eq(accountviewInstellingenTable.id, 1)).limit(1);
  if (!inst || inst.werkgeverId == null) {
    res.status(422).json({
      beschikbaar: false,
      reden: "De AccountView-koppeling heeft nog geen werkmaatschappij (BV) — stel die eerst in bij Boekhouding.",
    });
    return;
  }
  const client = maakAccountViewClient(inst);
  const resultaat = await client.haalBtwCodes();
  if (!resultaat.beschikbaar || !resultaat.codes) {
    res.status(200).json({ beschikbaar: false, http_status: resultaat.httpStatus ?? null, reden: resultaat.reden ?? "Onbekende reden" });
    return;
  }
  const telling = await upsertBtwSchema(inst.werkgeverId, resultaat.codes, "accountview");
  res.json({ beschikbaar: true, http_status: resultaat.httpStatus ?? null, aantal: resultaat.codes.length, ...telling });
});

// POST /btw-codes/import — lijst inlezen voor één BV.
// Body: { werkgever_id, regels: "H;Hoog 21%;21\n..." } of { werkgever_id, codes: [{code, omschrijving, percentage}] }.
router.post("/btw-codes/import", requireBevoegdheid("systeem", 2), async (req: Request, res: Response): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const wgId = Number(body["werkgever_id"]);
  if (!Number.isFinite(wgId)) { res.status(400).json({ error: "werkgever_id is verplicht" }); return; }
  const [wg] = await db.select({ id: werkgeversTable.id }).from(werkgeversTable).where(eq(werkgeversTable.id, wgId));
  if (!wg) { res.status(404).json({ error: "Werkmaatschappij niet gevonden" }); return; }
  let codes: Array<{ code: string; omschrijving: string; percentage: number | null }> = [];
  if (Array.isArray(body["codes"])) {
    for (const r of body["codes"] as Array<Record<string, unknown>>) {
      const code = String(r["code"] ?? "").trim();
      if (!code) continue;
      const pct = r["percentage"] == null ? null : Number(r["percentage"]);
      codes.push({
        code,
        omschrijving: String(r["omschrijving"] ?? "").trim(),
        percentage: pct != null && Number.isFinite(pct) ? pct : null,
      });
    }
  } else if (typeof body["regels"] === "string") {
    for (const regel of (body["regels"] as string).split(/\r?\n/)) {
      const kaal = regel.trim();
      if (!kaal || kaal.startsWith("#")) continue;
      const delen = kaal.split(/[;\t]|,(?=\S)/).map((d) => d.trim());
      const code = delen[0] ?? "";
      if (!code || /^code$/i.test(code)) continue;
      const pct = delen[2] ? Number(delen[2].replace(",", ".").replace("%", "")) : null;
      codes.push({ code, omschrijving: delen[1] ?? "", percentage: pct != null && Number.isFinite(pct) ? pct : null });
    }
  }
  const uniek = new Map(codes.map((c) => [c.code, c]));
  codes = [...uniek.values()];
  if (codes.length === 0) {
    res.status(422).json({ error: "Geen bruikbare btw-codes gevonden in de aanlevering (verwacht: code;omschrijving;percentage per regel)." });
    return;
  }
  const telling = await upsertBtwSchema(wgId, codes, "import");
  res.status(201).json({ aantal: codes.length, ...telling });
});

// GET /btw-codes/gebruik — meting: welke btw-codes zijn in gebruik, waar, hoe
// vaak — en welke daarvan niet in het schema van de gekoppelde BV voorkomen.
router.get("/btw-codes/gebruik", requireBevoegdheid("systeem", 1), async (req: Request, res: Response): Promise<void> => {
  const gebruik = new Map<string, { code: string; bronnen: Record<string, number> }>();
  const tel = (code: string | null | undefined, bron: string, n = 1) => {
    const kaal = (code ?? "").trim();
    if (!kaal) return;
    const rec = gebruik.get(kaal) ?? { code: kaal, bronnen: {} };
    rec.bronnen[bron] = (rec.bronnen[bron] ?? 0) + n;
    gebruik.set(kaal, rec);
  };

  const fk = await db.select({ c: facturenTable.btwCode, n: sql<number>`count(*)::int` })
    .from(facturenTable).groupBy(facturenTable.btwCode);
  for (const r of fk) tel(r.c, "facturen", r.n);
  const fr = await db.select({ c: factuurRegelsTable.btwCode, n: sql<number>`count(*)::int` })
    .from(factuurRegelsTable).groupBy(factuurRegelsTable.btwCode);
  for (const r of fr) tel(r.c, "factuurregels", r.n);
  const lev = await db.select({ c: leveranciersTable.btwCodeDefault, n: sql<number>`count(*)::int` })
    .from(leveranciersTable).groupBy(leveranciersTable.btwCodeDefault);
  for (const r of lev) tel(r.c, "leveranciers", r.n);
  const cat = await db.select({ c: leverancierCategorisatieTable.btwCode, n: sql<number>`count(*)::int` })
    .from(leverancierCategorisatieTable).groupBy(leverancierCategorisatieTable.btwCode);
  for (const r of cat) tel(r.c, "leverancier_categorisatie", r.n);

  const [inst] = await db.select().from(accountviewInstellingenTable).where(eq(accountviewInstellingenTable.id, 1)).limit(1);
  const wgId = inst?.werkgeverId ?? null;
  const schemaCodes = new Set<string>();
  let schemaAantal = 0;
  if (wgId != null) {
    const schema = await db.select({ code: btwCodesTable.code })
      .from(btwCodesTable)
      .where(and(eq(btwCodesTable.werkgeverId, wgId), eq(btwCodesTable.actief, true)));
    schemaAantal = schema.length;
    for (const s of schema) schemaCodes.add(s.code);
  }

  const items = [...gebruik.values()]
    .map((g) => ({
      code: g.code,
      totaal: Object.values(g.bronnen).reduce((a, b) => a + b, 0),
      bronnen: g.bronnen,
      in_schema: schemaAantal > 0 ? schemaCodes.has(g.code) : null,
    }))
    .sort((a, b) => a.code.localeCompare(b.code, "nl", { numeric: true }));

  res.json({
    werkgever_id: wgId,
    schema_aantal: schemaAantal,
    totaal_codes_in_gebruik: items.length,
    niet_in_schema: schemaAantal > 0 ? items.filter((i) => i.in_schema === false).map((i) => i.code) : null,
    items,
  });
});

export default router;
