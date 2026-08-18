import { Router } from "express";
import type { Request, Response } from "express";
import {
  db,
  grootboekrekeningenTable,
  accountviewInstellingenTable,
  facturenTable,
  factuurRegelsTable,
  leveranciersTable,
  leverancierCategorisatieTable,
  werkgeversTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { maakAccountViewClient } from "../services/accountview-client";

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
  res.status(201).json({ aantal: rekeningen.length, ...telling });
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

export default router;
