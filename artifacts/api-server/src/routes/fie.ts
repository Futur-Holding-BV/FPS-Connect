// Financial Intelligence Engine (FIE) — API-laag.
// Alle financiële berekeningen lopen via fie-service.ts; hier alleen routing + validatie.
// Fase 1+2: jaarbegrotingen, AK-posten, capaciteitssnapsots en live calculatieblok.
import { Router, Request, Response } from "express";
import { db, fieJaarbegrotingenTable, fieAkPostenTable, fieCapaciteitSnapshotsTable, fieLeerMomentenTable, werkgeversTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { berekenFieContext, berekenCapaciteit, berekenDoelmarge, berekenJaarprognose, leesPrognoseObservaties, rnd2, herberekeenLeermomenten, berekenEnSlaOpNacalculatie, herberekeenVerouderdeNacalculaties, telVerouderdeNacalculaties } from "../services/fie-service";

const router = Router();

// Bedrijfskompas is strategische financiële informatie — alleen directeur/hoofdbeheerder
// (niveau 2 = schrijven in de financieel-module = hoogste bevoegdheidsdrempel).
const lezen    = requireBevoegdheid("financieel", 2);
const schrijven = requireBevoegdheid("financieel", 2);
// Calculatiecontext is ook beschikbaar voor calculateurs (calculaties:1).
const calcLezen = requireBevoegdheid("calculaties", 1);

function parseId(v: unknown): number | null {
  const n = parseInt(String(v), 10);
  return isNaN(n) ? null : n;
}

// ── Input-validatie helpers ───────────────────────────────────────────────────

const GELDIGE_STATUSSEN = ["concept", "actief", "gesloten"] as const;
const GELDIGE_VERDEELSLEUTELS = ["uren", "omzet", "ftes"] as const;

export type CorrectieFactorValidatie =
  | { ok: true; waarde: number }
  | { ok: false; fout: string };

/**
 * Valideert een correctie_factor-waarde voor FIE-leermomenten.
 * Geaccepteerd bereik: 0,5–3,0 (inclusief grenzen).
 * Geeft { ok: false } wanneer de waarde buiten bereik of niet-eindig is.
 * Wanneer `v` undefined is, hoeft er geen update te plaatsvinden (sla de caller-kant af).
 */
export function valideerCorrectieFactor(v: unknown): CorrectieFactorValidatie {
  const n = Number(v);
  if (!isFinite(n) || n < 0.5 || n > 3.0) {
    return { ok: false, fout: "correctie_factor moet tussen 0,5 en 3,0 liggen" };
  }
  return { ok: true, waarde: Math.round(n * 100) / 100 };
}

/**
 * Verwerkt een opmerkingen-waarde voor FIE-leermomenten (PATCH).
 * - null  → wordt als null opgeslagen
 * - tekst → wordt afgekapt op 1000 tekens (stille truncatie, geen fout)
 * Gebruik deze functie alleen wanneer `opmerkingen` aanwezig is in de body;
 * wanneer het veld ontbreekt (undefined), slaat de caller de update over.
 */
export function verwerkOpmerkingen(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return String(v).slice(0, 1000);
}

/**
 * Verwerkt een opmerkingen-waarde voor FIE-jaarbegrotingen (POST en PATCH).
 * - null  → wordt als null opgeslagen
 * - tekst → wordt afgekapt op 2000 tekens (stille truncatie, geen fout)
 * Gebruik deze functie alleen wanneer `opmerkingen` aanwezig is in de body;
 * wanneer het veld ontbreekt (undefined), slaat de caller de update over.
 */
export function verwerkOpmerkingenBegroting(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return String(v).slice(0, 2000);
}

/**
 * Verwerkt een omschrijving-waarde voor FIE AK-posten (POST en PATCH).
 * - null / undefined → wordt als null opgeslagen
 * - tekst            → wordt afgekapt op 500 tekens (stille truncatie, geen fout)
 * Gebruik deze functie altijd voor het omschrijving-veld in de ak-posten
 * handlers, zodat een refactor dit gedrag niet onopgemerkt kan wijzigen.
 * Bij POST is het veld verplicht (de caller valideert dat eerst); hier
 * zorgt de helper uitsluitend voor de maximale lengte.
 */
export function verwerkOmschrijvingAkPost(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return String(v).slice(0, 500);
}

/**
 * Verwerkt een categorie-waarde voor FIE AK-posten (POST en PATCH).
 * - null / undefined → valt terug op "overig" (de DB-standaard)
 * - tekst            → wordt afgekapt op 100 tekens (stille truncatie, geen fout)
 * Gebruik deze functie altijd voor het categorie-veld in de ak-posten
 * handlers, zodat een te lange waarde nooit stilzwijgend een DB-fout
 * of onverwacht gedrag veroorzaakt.
 */
export function verwerkCategorieAkPost(v: unknown): string {
  if (v === null || v === undefined) return "overig";
  const s = String(v).trim();
  if (s === "") return "overig";
  return s.slice(0, 100);
}

/** Velden die de PATCH /fie/leermomenten/:id handler kan bijwerken. */
export type LeermomentUpdateVelden = {
  correctieFactor?: number;
  opmerkingen?: string | null;
};

export type LeermomentUpdateResultaat =
  | { ok: true; velden: LeermomentUpdateVelden }
  | { ok: false; fout: string };

/**
 * Verwerkt de door de client aangeleverde body voor een leermoment-PATCH.
 * Ontbrekende velden worden weggelaten (geen schrijfactie); aanwezige velden
 * worden gevalideerd/getransformeerd. Geeft { ok: false } terug bij een
 * validatiefout (correctie_factor buiten bereik).
 *
 * Tests: zie fie-correctie-factor.test.ts › bouwLeermomentUpdateVelden
 */
export function bouwLeermomentUpdateVelden(
  body: Record<string, unknown>,
): LeermomentUpdateResultaat {
  const { correctie_factor, opmerkingen } = body;
  const velden: LeermomentUpdateVelden = {};

  if (correctie_factor !== undefined) {
    const validatie = valideerCorrectieFactor(correctie_factor);
    if (!validatie.ok) return { ok: false, fout: validatie.fout };
    velden.correctieFactor = validatie.waarde;
  }
  if (opmerkingen !== undefined) {
    velden.opmerkingen = verwerkOpmerkingen(opmerkingen);
  }
  return { ok: true, velden };
}

function valideerFinancieelGetal(
  v: unknown,
  naam: string,
  max = 1_000_000_000,
): { ok: true; waarde: number | null } | { ok: false; fout: string } {
  if (v === null || v === undefined) return { ok: true, waarde: null };
  const n = Number(v);
  if (!isFinite(n)) return { ok: false, fout: `${naam} moet een geldig getal zijn` };
  if (n < 0) return { ok: false, fout: `${naam} mag niet negatief zijn` };
  if (n > max) return { ok: false, fout: `${naam} overschrijdt het maximum (${max})` };
  return { ok: true, waarde: Math.round(n * 100) / 100 };
}

function valideerProcent(v: unknown, naam: string): { ok: true; waarde: number } | { ok: false; fout: string } {
  const n = Number(v);
  if (!isFinite(n) || n < 0 || n > 100) {
    return { ok: false, fout: `${naam} moet een percentage zijn tussen 0 en 100` };
  }
  return { ok: true, waarde: Math.round(n * 100) / 100 };
}

function validId(res: import("express").Response, v: unknown): number | null {
  const id = parseId(v);
  if (id === null) {
    res.status(400).json({ error: "Ongeldig of ontbrekend id" });
    return null;
  }
  return id;
}

// ─── Jaarbegrotingen ──────────────────────────────────────────────────────────

function mapBegroting(r: typeof fieJaarbegrotingenTable.$inferSelect) {
  return {
    id: r.id,
    boekjaar: r.boekjaar,
    status: r.status,
    omzet_doel: r.omzetDoel ?? null,
    directe_kosten_doel: r.directeKostenDoel ?? null,
    doel_marge_pct: r.doelMargePct,
    ak_per_productief_uur: r.akPerProductiefUur ?? null,
    productieve_uren_doel: r.productieveUrenDoel ?? null,
    verdeelsleutel: r.verdeelsleutel,
    opmerkingen: r.opmerkingen ?? null,
    aangemaakt_op: r.aangemaaktOp.toISOString(),
    bijgewerkt_op: r.bijgewerktOp.toISOString(),
  };
}

function mapAkPost(r: typeof fieAkPostenTable.$inferSelect, werkgeverNaam?: string | null) {
  return {
    id: r.id,
    begroting_id: r.begrotingId,
    werkgever_id: r.werkgeverId ?? null,
    werkgever_naam: werkgeverNaam ?? null,
    categorie: r.categorie,
    omschrijving: r.omschrijving,
    bedrag_jaarbasis: r.bedragJaarbasis,
    actief: r.actief,
    aangemaakt_op: r.aangemaaktOp.toISOString(),
    bijgewerkt_op: r.bijgewerktOp.toISOString(),
  };
}

// GET /fie/begrotingen
router.get("/fie/begrotingen", lezen, async (_req: Request, res: Response) => {
  const rows = await db
    .select()
    .from(fieJaarbegrotingenTable)
    .orderBy(desc(fieJaarbegrotingenTable.boekjaar));
  res.json(rows.map(mapBegroting));
});

// POST /fie/begrotingen
router.post("/fie/begrotingen", schrijven, async (req: Request, res: Response): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const {
    boekjaar, status, omzet_doel, directe_kosten_doel,
    doel_marge_pct, ak_per_productief_uur, productieve_uren_doel,
    verdeelsleutel, opmerkingen,
  } = body;

  // boekjaar: integer tussen 2000 en 2100
  const boekjaarN = Number(boekjaar);
  if (!boekjaar || !Number.isInteger(boekjaarN) || boekjaarN < 2000 || boekjaarN > 2100) {
    res.status(400).json({ error: "boekjaar is verplicht en moet een geldig jaar zijn" }); return;
  }

  // status-enum
  const statusStr = (status as string | undefined) ?? "concept";
  if (!GELDIGE_STATUSSEN.includes(statusStr as typeof GELDIGE_STATUSSEN[number])) {
    res.status(400).json({ error: `status moet een van ${GELDIGE_STATUSSEN.join(", ")} zijn` }); return;
  }

  // verdeelsleutel-enum
  const vslStr = (verdeelsleutel as string | undefined) ?? "uren";
  if (!GELDIGE_VERDEELSLEUTELS.includes(vslStr as typeof GELDIGE_VERDEELSLEUTELS[number])) {
    res.status(400).json({ error: `verdeelsleutel moet een van ${GELDIGE_VERDEELSLEUTELS.join(", ")} zijn` }); return;
  }

  // Financiële getallen
  const omzetR = valideerFinancieelGetal(omzet_doel, "omzet_doel");
  if (!omzetR.ok) { res.status(400).json({ error: omzetR.fout }); return; }
  const dkR = valideerFinancieelGetal(directe_kosten_doel, "directe_kosten_doel");
  if (!dkR.ok) { res.status(400).json({ error: dkR.fout }); return; }
  const margePctR = doel_marge_pct !== undefined
    ? valideerProcent(doel_marge_pct, "doel_marge_pct")
    : { ok: true as const, waarde: 15 };
  if (!margePctR.ok) { res.status(400).json({ error: margePctR.fout }); return; }
  const akUurR = valideerFinancieelGetal(ak_per_productief_uur, "ak_per_productief_uur", 10_000);
  if (!akUurR.ok) { res.status(400).json({ error: akUurR.fout }); return; }
  const urenR = valideerFinancieelGetal(productieve_uren_doel, "productieve_uren_doel", 1_000_000);
  if (!urenR.ok) { res.status(400).json({ error: urenR.fout }); return; }

  // opmerkingen: tekst, max 2000 tekens
  const opmerkingenStr = verwerkOpmerkingenBegroting(opmerkingen);

  const [rij] = await db.insert(fieJaarbegrotingenTable).values({
    boekjaar: boekjaarN,
    status: statusStr,
    omzetDoel: omzetR.waarde,
    directeKostenDoel: dkR.waarde,
    doelMargePct: margePctR.waarde,
    akPerProductiefUur: akUurR.waarde,
    productieveUrenDoel: urenR.waarde,
    verdeelsleutel: vslStr,
    opmerkingen: opmerkingenStr,
  }).returning();
  res.status(201).json(mapBegroting(rij));
});

// GET /fie/begrotingen/:id  (incl. ak-posten)
router.get("/fie/begrotingen/:id", lezen, async (req: Request, res: Response): Promise<void> => {
  const id = validId(res, req.params["id"]);
  if (id === null) return;

  const [begroting] = await db
    .select()
    .from(fieJaarbegrotingenTable)
    .where(eq(fieJaarbegrotingenTable.id, id))
    .limit(1);

  if (!begroting) { res.status(404).json({ error: "Begroting niet gevonden" }); return; }

  const akPostenRows = await db
    .select({ post: fieAkPostenTable, werkgeverNaam: werkgeversTable.naam })
    .from(fieAkPostenTable)
    .leftJoin(werkgeversTable, eq(fieAkPostenTable.werkgeverId, werkgeversTable.id))
    .where(eq(fieAkPostenTable.begrotingId, id));

  const akPosten = akPostenRows.map((r) => mapAkPost(r.post, r.werkgeverNaam));
  const totaalAk = rnd2(akPosten.filter((p) => p.actief).reduce((s, p) => s + p.bedrag_jaarbasis, 0));
  const productieveUren = begroting.productieveUrenDoel ?? null;
  const akPerUurBerekend = (productieveUren && productieveUren > 0 && totaalAk > 0)
    ? rnd2(totaalAk / productieveUren)
    : null;

  res.json({
    ...mapBegroting(begroting),
    ak_posten: akPosten,
    totaal_ak: totaalAk,
    ak_per_uur_berekend: akPerUurBerekend,
  });
});

// PATCH /fie/begrotingen/:id
router.patch("/fie/begrotingen/:id", schrijven, async (req: Request, res: Response): Promise<void> => {
  const id = validId(res, req.params["id"]);
  if (id === null) return;
  const body = req.body as Record<string, unknown>;
  const {
    status, omzet_doel, directe_kosten_doel, doel_marge_pct,
    ak_per_productief_uur, productieve_uren_doel, verdeelsleutel, opmerkingen,
  } = body;

  const [existing] = await db
    .select()
    .from(fieJaarbegrotingenTable)
    .where(eq(fieJaarbegrotingenTable.id, id))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Begroting niet gevonden" }); return; }

  const updateData: Partial<typeof fieJaarbegrotingenTable.$inferInsert> = {
    bijgewerktOp: new Date(),
  };

  if (status !== undefined) {
    const s = String(status);
    if (!GELDIGE_STATUSSEN.includes(s as typeof GELDIGE_STATUSSEN[number])) {
      res.status(400).json({ error: `status moet een van ${GELDIGE_STATUSSEN.join(", ")} zijn` }); return;
    }
    updateData.status = s;
  }
  if (omzet_doel !== undefined) {
    const r = valideerFinancieelGetal(omzet_doel, "omzet_doel");
    if (!r.ok) { res.status(400).json({ error: r.fout }); return; }
    updateData.omzetDoel = r.waarde;
  }
  if (directe_kosten_doel !== undefined) {
    const r = valideerFinancieelGetal(directe_kosten_doel, "directe_kosten_doel");
    if (!r.ok) { res.status(400).json({ error: r.fout }); return; }
    updateData.directeKostenDoel = r.waarde;
  }
  if (doel_marge_pct !== undefined) {
    const r = valideerProcent(doel_marge_pct, "doel_marge_pct");
    if (!r.ok) { res.status(400).json({ error: r.fout }); return; }
    updateData.doelMargePct = r.waarde;
  }
  if (ak_per_productief_uur !== undefined) {
    const r = valideerFinancieelGetal(ak_per_productief_uur, "ak_per_productief_uur", 10_000);
    if (!r.ok) { res.status(400).json({ error: r.fout }); return; }
    updateData.akPerProductiefUur = r.waarde;
  }
  if (productieve_uren_doel !== undefined) {
    const r = valideerFinancieelGetal(productieve_uren_doel, "productieve_uren_doel", 1_000_000);
    if (!r.ok) { res.status(400).json({ error: r.fout }); return; }
    updateData.productieveUrenDoel = r.waarde;
  }
  if (verdeelsleutel !== undefined) {
    const vsl = String(verdeelsleutel);
    if (!GELDIGE_VERDEELSLEUTELS.includes(vsl as typeof GELDIGE_VERDEELSLEUTELS[number])) {
      res.status(400).json({ error: `verdeelsleutel moet een van ${GELDIGE_VERDEELSLEUTELS.join(", ")} zijn` }); return;
    }
    updateData.verdeelsleutel = vsl;
  }
  if (opmerkingen !== undefined) {
    updateData.opmerkingen = verwerkOpmerkingenBegroting(opmerkingen);
  }

  const [updated] = await db
    .update(fieJaarbegrotingenTable)
    .set(updateData)
    .where(eq(fieJaarbegrotingenTable.id, id))
    .returning();
  res.json(mapBegroting(updated));
});

// ─── AK-posten ────────────────────────────────────────────────────────────────

// GET /fie/begrotingen/:id/ak-posten
router.get("/fie/begrotingen/:id/ak-posten", lezen, async (req: Request, res: Response): Promise<void> => {
  const id = validId(res, req.params["id"]);
  if (id === null) return;
  const rows = await db
    .select({ post: fieAkPostenTable, werkgeverNaam: werkgeversTable.naam })
    .from(fieAkPostenTable)
    .leftJoin(werkgeversTable, eq(fieAkPostenTable.werkgeverId, werkgeversTable.id))
    .where(eq(fieAkPostenTable.begrotingId, id));
  res.json(rows.map((r) => mapAkPost(r.post, r.werkgeverNaam)));
});

// POST /fie/begrotingen/:id/ak-posten
router.post("/fie/begrotingen/:id/ak-posten", schrijven, async (req: Request, res: Response): Promise<void> => {
  const begrotingId = validId(res, req.params["id"]);
  if (begrotingId === null) return;

  const [beg] = await db
    .select()
    .from(fieJaarbegrotingenTable)
    .where(eq(fieJaarbegrotingenTable.id, begrotingId))
    .limit(1);
  if (!beg) { res.status(404).json({ error: "Begroting niet gevonden" }); return; }

  const { werkgever_id, categorie, omschrijving, bedrag_jaarbasis, actief } = req.body as Record<string, unknown>;

  if (!omschrijving || typeof bedrag_jaarbasis !== "number") {
    res.status(400).json({ error: "omschrijving en bedrag_jaarbasis zijn verplicht" }); return;
  }

  const [rij] = await db.insert(fieAkPostenTable).values({
    begrotingId,
    werkgeverId: (werkgever_id as number | undefined) ?? null,
    categorie: verwerkCategorieAkPost(categorie),
    omschrijving: verwerkOmschrijvingAkPost(omschrijving) ?? "",
    bedragJaarbasis: bedrag_jaarbasis as number,
    actief: (actief as boolean | undefined) ?? true,
  }).returning();

  const [wg] = rij.werkgeverId
    ? await db.select().from(werkgeversTable).where(eq(werkgeversTable.id, rij.werkgeverId)).limit(1)
    : [];
  res.status(201).json(mapAkPost(rij, wg?.naam ?? null));
});

// PATCH /fie/ak-posten/:id
router.patch("/fie/ak-posten/:id", schrijven, async (req: Request, res: Response): Promise<void> => {
  const id = validId(res, req.params["id"]);
  if (id === null) return;

  const [existing] = await db
    .select()
    .from(fieAkPostenTable)
    .where(eq(fieAkPostenTable.id, id))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "AK-post niet gevonden" }); return; }

  const { werkgever_id, categorie, omschrijving, bedrag_jaarbasis, actief } = req.body as Record<string, unknown>;
  const updateData: Partial<typeof fieAkPostenTable.$inferInsert> = {
    bijgewerktOp: new Date(),
  };
  if (werkgever_id !== undefined)    updateData.werkgeverId = werkgever_id as number | null;
  if (categorie !== undefined)       updateData.categorie = verwerkCategorieAkPost(categorie);
  if (omschrijving !== undefined)    updateData.omschrijving = verwerkOmschrijvingAkPost(omschrijving) ?? "";
  if (bedrag_jaarbasis !== undefined) updateData.bedragJaarbasis = bedrag_jaarbasis as number;
  if (actief !== undefined)          updateData.actief = actief as boolean;

  const [updated] = await db
    .update(fieAkPostenTable)
    .set(updateData)
    .where(eq(fieAkPostenTable.id, id))
    .returning();

  const wgId = updated.werkgeverId;
  const [wg] = wgId
    ? await db.select().from(werkgeversTable).where(eq(werkgeversTable.id, wgId)).limit(1)
    : [];
  res.json(mapAkPost(updated, wg?.naam ?? null));
});

// DELETE /fie/ak-posten/:id
router.delete("/fie/ak-posten/:id", schrijven, async (req: Request, res: Response): Promise<void> => {
  const id = validId(res, req.params["id"]);
  if (id === null) return;
  await db.delete(fieAkPostenTable).where(eq(fieAkPostenTable.id, id));
  res.status(204).send();
});

// ─── Capaciteit ───────────────────────────────────────────────────────────────

// GET /fie/capaciteit/:boekjaar
router.get("/fie/capaciteit/:boekjaar", lezen, async (req: Request, res: Response): Promise<void> => {
  const boekjaar = validId(res, req.params["boekjaar"]);
  if (boekjaar === null) return;
  const rows = await db
    .select({ snap: fieCapaciteitSnapshotsTable, werkgeverNaam: werkgeversTable.naam })
    .from(fieCapaciteitSnapshotsTable)
    .leftJoin(werkgeversTable, eq(fieCapaciteitSnapshotsTable.werkgeverId, werkgeversTable.id))
    .where(eq(fieCapaciteitSnapshotsTable.boekjaar, boekjaar))
    .orderBy(desc(fieCapaciteitSnapshotsTable.aangemaaktOp));

  const snapshots = rows.map((r) => ({
    id: r.snap.id,
    boekjaar: r.snap.boekjaar,
    werkgever_id: r.snap.werkgeverId ?? null,
    werkgever_naam: r.werkgeverNaam ?? null,
    productieve_uren: r.snap.productieveUren,
    fte: r.snap.fte ?? null,
    snapshot_datum: r.snap.snapshotDatum,
    bron: r.snap.bron,
    aangemaakt_op: r.snap.aangemaaktOp.toISOString(),
  }));

  const totaalProductieveUren = rnd2(snapshots.reduce((s, r) => s + r.productieve_uren, 0));
  const totaalFte = rnd2(snapshots.reduce((s, r) => s + (r.fte ?? 0), 0));

  res.json({ boekjaar, snapshots, totaal_productieve_uren: totaalProductieveUren, totaal_fte: totaalFte });
});

// GET /fie/capaciteit/:boekjaar/hrm  — HRM-afgeleid capaciteitsoverzicht via berekenCapaciteit()
router.get("/fie/capaciteit/:boekjaar/hrm", lezen, async (req: Request, res: Response): Promise<void> => {
  const boekjaar = validId(res, req.params["boekjaar"]);
  if (boekjaar === null) return;
  const resultaat = await berekenCapaciteit(boekjaar);
  res.json(resultaat);
});

// GET /fie/begrotingen/:id/doelmarge  — doelmarge + AK-norm via berekenDoelmarge()
router.get("/fie/begrotingen/:id/doelmarge", lezen, async (req: Request, res: Response): Promise<void> => {
  const id = validId(res, req.params["id"]);
  if (id === null) return;
  const resultaat = await berekenDoelmarge(id);
  if (!resultaat) { res.status(404).json({ error: "Begroting niet gevonden" }); return; }
  res.json(resultaat);
});

// POST /fie/capaciteit/:boekjaar
router.post("/fie/capaciteit/:boekjaar", schrijven, async (req: Request, res: Response): Promise<void> => {
  const boekjaar = validId(res, req.params["boekjaar"]);
  if (boekjaar === null) return;
  const { werkgever_id, productieve_uren, fte, snapshot_datum, bron } = req.body as Record<string, unknown>;

  if (typeof productieve_uren !== "number" || !snapshot_datum) {
    res.status(400).json({ error: "productieve_uren en snapshot_datum zijn verplicht" }); return;
  }

  const [rij] = await db.insert(fieCapaciteitSnapshotsTable).values({
    boekjaar,
    werkgeverId: (werkgever_id as number | undefined) ?? null,
    productieveUren: productieve_uren as number,
    fte: (fte as number | undefined) ?? null,
    snapshotDatum: snapshot_datum as string,
    bron: (bron as string | undefined) ?? "handmatig",
  }).returning();

  const [wg] = rij.werkgeverId
    ? await db.select().from(werkgeversTable).where(eq(werkgeversTable.id, rij.werkgeverId)).limit(1)
    : [];

  const snap = {
    id: rij.id,
    boekjaar: rij.boekjaar,
    werkgever_id: rij.werkgeverId ?? null,
    werkgever_naam: wg?.naam ?? null,
    productieve_uren: rij.productieveUren,
    fte: rij.fte ?? null,
    snapshot_datum: rij.snapshotDatum,
    bron: rij.bron,
    aangemaakt_op: rij.aangemaaktOp.toISOString(),
  };

  const alleRows = await db
    .select()
    .from(fieCapaciteitSnapshotsTable)
    .where(eq(fieCapaciteitSnapshotsTable.boekjaar, boekjaar));

  const totaalProductieveUren = rnd2(alleRows.reduce((s, r) => s + r.productieveUren, 0));
  const totaalFte = rnd2(alleRows.reduce((s, r) => s + (r.fte ?? 0), 0));

  res.status(201).json({ boekjaar, snapshots: [snap], totaal_productieve_uren: totaalProductieveUren, totaal_fte: totaalFte });
});

// ─── Live FIE-context voor calculatieblok ────────────────────────────────────
// Delegeert volledige berekening aan fie-service.ts (centrale rekenmotor).

// GET /fie/context/calculatie/:id
router.get("/fie/context/calculatie/:id", calcLezen, async (req: Request, res: Response): Promise<void> => {
  const calcId = validId(res, req.params["id"]);
  if (calcId === null) return;

  const context = await berekenFieContext(calcId);
  if (!context) { res.status(404).json({ error: "Calculatie niet gevonden" }); return; }

  res.json({
    calculatie_id: context.calculatieId,
    heeft_begroting: context.heeftBegroting,
    boekjaar: context.boekjaar,
    doel_marge_pct: context.doelMargePct,
    ak_per_uur: context.akPerUur,
    totaal_arbeid: context.totaalArbeid,
    totaal_materiaal: context.totaalMateriaal,
    totaal_onderaanneming: context.totaalOnderaanneming,
    totaal_mu: context.totaalMu,
    totaal_excl_opslag: context.totaalExclOpslag,
    totaal_incl_opslag: context.totaalInclOpslag,
    ak_bijdrage: context.akBijdrage,
    verwachte_marge_abs: context.verwachteMargeAbs,
    verwachte_marge_pct: context.verwachteMargePct,
    advies_status: context.adviesStatus,
    advies_tekst: context.adviesTekst,
    opslag_ak_pct: context.opslagAkPct,
    correctie_factor: context.correctieFactor,
    gecorrigeerde_arbeid: context.gecorrigeerdeArbeid,
    gecorrigeerde_materiaal: context.gecorrigeerdeMateriaal,
  });
});

// ── GET /fie/prognose/:boekjaar ───────────────────────────────────────────────
// Continue jaarbedrijfsprognose: bevestigde omzet + gewogen pipeline + OHW restwaarde.
// Berekening + persistentie observaties bij elke aanroep.
router.get("/fie/prognose/:boekjaar", lezen, async (req: Request, res: Response): Promise<void> => {
  const boekjaar = parseId(req.params.boekjaar);
  if (!boekjaar || boekjaar < 2000 || boekjaar > 2100) {
    return void res.status(400).json({ error: "Ongeldig boekjaar" });
  }

  const p = await berekenJaarprognose(boekjaar);
  return void res.json({
    boekjaar:                   p.boekjaar,
    heeft_begroting:            p.heeft_begroting,
    omzet_doel:                 p.omzet_doel,
    doel_marge_pct:             p.doel_marge_pct,
    totaal_ak:                  p.totaal_ak,
    bevestigde_omzet:           p.bevestigde_omzet,
    aantal_bevestigde_offertes: p.aantal_bevestigde_offertes,
    gewogen_pipeline:           p.gewogen_pipeline,
    pijplijn_bruto:             p.pijplijn_bruto,
    aantal_pipeline_offertes:   p.aantal_pipeline_offertes,
    ohw_restwaarde:             p.ohw_restwaarde,
    aantal_ohw_opdrachten:      p.aantal_ohw_opdrachten,
    prognose_omzet:             p.prognose_omzet,
    prognose_inclusief_ohw:     p.prognose_inclusief_ohw,
    coverage_pct:               p.coverage_pct,
    gap_tot_doel:               p.gap_tot_doel,
    ak_dekkingsgraad_pct:       p.ak_dekkingsgraad_pct,
    break_even_omzet:           p.break_even_omzet,
    break_even_bereikt:         p.break_even_bereikt,
    prognose_brutowinst:        p.prognose_brutowinst,
    prognose_nettoresultaat:    p.prognose_nettoresultaat,
    kwartaal_verdeling:         p.kwartaal_verdeling,
    begroting_per_kwartaal:     p.begroting_per_kwartaal,
    observaties:                p.observaties.map(o => ({
      type:          o.type,
      ernst:         o.ernst,
      omschrijving:  o.omschrijving,
      waarde:        o.waarde,
      drempelwaarde: o.drempelwaarde,
      afwijking_pct: o.afwijking_pct,
    })),
  });
});

// ── GET /fie/observaties/:boekjaar ────────────────────────────────────────────
// Geeft de meest recent gepersisteerde prognose-observaties terug voor een boekjaar.
// Wordt gevuld bij elke aanroep van GET /fie/prognose/:boekjaar.
router.get("/fie/observaties/:boekjaar", lezen, async (req: Request, res: Response): Promise<void> => {
  const boekjaar = parseId(req.params.boekjaar);
  if (!boekjaar || boekjaar < 2000 || boekjaar > 2100) {
    return void res.status(400).json({ error: "Ongeldig boekjaar" });
  }

  const observaties = await leesPrognoseObservaties(boekjaar);
  return void res.json({ boekjaar, observaties });
});

// ─── Nacalculaties ────────────────────────────────────────────────────────────

// GET /fie/nacalculaties/verouderd-aantal
// Geeft het aantal nacalculaties terug met werktype "algemeen" waarbij het gebouw nu spots heeft.
router.get("/fie/nacalculaties/verouderd-aantal", lezen, async (_req: Request, res: Response): Promise<void> => {
  const aantal = await telVerouderdeNacalculaties();
  res.json({ aantal });
});

// POST /fie/nacalculaties/herbereken-verouderd
// Herbereken alle nacalculaties met werktype "algemeen" waarbij het gebouw inmiddels spots heeft.
// Handig voor situaties waarbij spots pas ná de eerste nacalculatie zijn toegevoegd.
router.post("/fie/nacalculaties/herbereken-verouderd", schrijven, async (_req: Request, res: Response): Promise<void> => {
  const herberekend = await herberekeenVerouderdeNacalculaties();
  res.json({ herberekend });
});

// POST /fie/nacalculaties/:opdrachtId/herbereken
// Herbereken de nacalculatie voor één specifieke opdracht.
router.post("/fie/nacalculaties/:opdrachtId/herbereken", schrijven, async (req: Request, res: Response): Promise<void> => {
  const opdrachtId = parseId(req.params["opdrachtId"]);
  if (opdrachtId === null) {
    res.status(400).json({ error: "Ongeldig opdrachtId" });
    return;
  }
  await berekenEnSlaOpNacalculatie(opdrachtId);
  res.json({ opdrachtId, herberekend: true });
});

// ─── Leereffecten (Fase 5) ────────────────────────────────────────────────────

function mapLeermoment(r: typeof fieLeerMomentenTable.$inferSelect) {
  return {
    id:                       r.id,
    werktype:                 r.werktype,
    afwijking_pct_arbeid:     r.afwijkingPctArbeid,
    afwijking_pct_materiaal:  r.afwijkingPctMateriaal,
    gebaseerd_op_n_projecten: r.gebaseerdOpNProjecten,
    correctie_factor:         r.correctieFactor,
    opmerkingen:              r.opmerkingen ?? null,
    laatste_update:           r.laatsteUpdate.toISOString(),
    aangemaakt_op:            r.aangemaaktOp.toISOString(),
  };
}

// GET /fie/leermomenten
router.get("/fie/leermomenten", lezen, async (_req: Request, res: Response): Promise<void> => {
  const rows = await db.select().from(fieLeerMomentenTable).orderBy(desc(fieLeerMomentenTable.gebaseerdOpNProjecten));
  res.json(rows.map(mapLeermoment));
});

// POST /fie/leermomenten/herbereken
router.post("/fie/leermomenten/herbereken", schrijven, async (_req: Request, res: Response): Promise<void> => {
  const verwerkt = await herberekeenLeermomenten();
  const rows = await db.select().from(fieLeerMomentenTable).orderBy(desc(fieLeerMomentenTable.gebaseerdOpNProjecten));
  res.json({ verwerkt, leermomenten: rows.map(mapLeermoment) });
});

// PATCH /fie/leermomenten/:id
router.patch("/fie/leermomenten/:id", schrijven, async (req: Request, res: Response): Promise<void> => {
  const id = validId(res, req.params["id"]);
  if (id === null) return;

  const [existing] = await db.select().from(fieLeerMomentenTable).where(eq(fieLeerMomentenTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Leermoment niet gevonden" }); return; }

  const bodyResult = bouwLeermomentUpdateVelden(req.body as Record<string, unknown>);
  if (!bodyResult.ok) { res.status(400).json({ error: bodyResult.fout }); return; }

  const update: Partial<typeof fieLeerMomentenTable.$inferInsert> = {
    ...bodyResult.velden,
    laatsteUpdate: new Date(),
  };

  const [updated] = await db.update(fieLeerMomentenTable).set(update).where(eq(fieLeerMomentenTable.id, id)).returning();
  res.json(mapLeermoment(updated));
});

// DELETE /fie/leermomenten/:id
router.delete("/fie/leermomenten/:id", schrijven, async (req: Request, res: Response): Promise<void> => {
  const id = validId(res, req.params["id"]);
  if (id === null) return;
  await db.delete(fieLeerMomentenTable).where(eq(fieLeerMomentenTable.id, id));
  res.status(204).send();
});

export default router;
