import { Router } from "express";
import type { Request, Response } from "express";
import { db, accountviewInstellingenTable, werkgeversTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { maakAccountViewClient } from "../services/accountview-client";

const router = Router();

// Haal altijd rij id=1 op (singleton). Maak aan als die nog niet bestaat.
async function getOrCreateInstellingen() {
  const [bestaand] = await db.select().from(accountviewInstellingenTable).where(eq(accountviewInstellingenTable.id, 1)).limit(1);
  if (bestaand) return bestaand;
  const [nieuw] = await db.insert(accountviewInstellingenTable).values({ id: 1 } as never).returning();
  return nieuw;
}

function mapInstellingen(r: typeof accountviewInstellingenTable.$inferSelect) {
  return {
    ...r,
    api_endpoint: r.apiEndpoint,
    api_gebruiker: r.apiGebruiker,
    // api_key wordt NOOIT teruggegeven aan de client
    api_key_geconfigureerd: !!r.apiKey,
    administratiecode: r.administratiecode,
    testmodus: r.testmodus,
    dagboek_inkoop: r.dagboekInkoop,
    dagboek_verkoop: r.dagboekVerkoop,
    grootboek_standaard: r.grootboekStandaard,
    btw_codes: r.btwCodes,
    kostenplaatsen: r.kostenplaatsen,
    debiteur_mapping: r.debiteuerMapping,
    crediteur_mapping: r.crediteurMapping,
    export_actief: r.exportActief,
    // ADMINISTRATIE_01 fase 3: voor welke BV deze administratie boekt.
    werkgever_id: r.werkgeverId ?? null,
    grootboek_voorraad: r.grootboekVoorraad ?? null,
    grootboek_inkoop_kosten: r.grootboekInkoopKosten ?? null,
    magazijn_export_actief: r.magazijnExportActief,
    bijgewerkt_op: r.bijgewerktOp.toISOString(),
  };
}

// GET /instellingen/accountview
router.get("/instellingen/accountview", requireBevoegdheid("systeem", 1), async (req: Request, res: Response): Promise<void> => {
  const inst = await getOrCreateInstellingen();
  res.json(mapInstellingen(inst));
});

// PATCH /instellingen/accountview
router.patch("/instellingen/accountview", requireBevoegdheid("systeem", 2), async (req: Request, res: Response): Promise<void> => {
  const body = req.body as Record<string, unknown>;

  const updateData: Partial<typeof accountviewInstellingenTable.$inferInsert> = {
    bijgewerktOp: new Date(),
  };
  if ("api_endpoint" in body) updateData.apiEndpoint = body["api_endpoint"] as string | null;
  if ("administratiecode" in body) updateData.administratiecode = body["administratiecode"] as string | null;
  if ("api_gebruiker" in body) updateData.apiGebruiker = body["api_gebruiker"] as string | null;
  if ("api_key" in body && body["api_key"]) updateData.apiKey = body["api_key"] as string;
  if ("testmodus" in body) updateData.testmodus = Boolean(body["testmodus"]);
  if ("dagboek_inkoop" in body) updateData.dagboekInkoop = body["dagboek_inkoop"] as string | null;
  if ("dagboek_verkoop" in body) updateData.dagboekVerkoop = body["dagboek_verkoop"] as string | null;
  if ("grootboek_standaard" in body) updateData.grootboekStandaard = body["grootboek_standaard"] as string | null;
  if ("btw_codes" in body) updateData.btwCodes = body["btw_codes"] as Record<string, unknown> | null;
  if ("kostenplaatsen" in body) updateData.kostenplaatsen = body["kostenplaatsen"] as Record<string, unknown> | null;
  if ("debiteur_mapping" in body) updateData.debiteuerMapping = body["debiteur_mapping"] as Record<string, unknown> | null;
  if ("crediteur_mapping" in body) updateData.crediteurMapping = body["crediteur_mapping"] as Record<string, unknown> | null;
  if ("export_actief" in body) updateData.exportActief = Boolean(body["export_actief"]);
  if ("grootboek_voorraad" in body) updateData.grootboekVoorraad = body["grootboek_voorraad"] as string | null;
  if ("grootboek_inkoop_kosten" in body) updateData.grootboekInkoopKosten = body["grootboek_inkoop_kosten"] as string | null;
  if ("magazijn_export_actief" in body) updateData.magazijnExportActief = Boolean(body["magazijn_export_actief"]);
  // ADMINISTRATIE_01 fase 3: voor welke BV deze administratie boekt (verplicht
  // vóór er geboekt kan worden — de exportservice weigert fail-closed zonder).
  if ("werkgever_id" in body) {
    const wgId = body["werkgever_id"] == null ? null : Number(body["werkgever_id"]);
    if (wgId != null) {
      const [w] = await db.select({ id: werkgeversTable.id }).from(werkgeversTable).where(eq(werkgeversTable.id, wgId));
      if (!w) { res.status(400).json({ error: "werkgever_id verwijst niet naar een bestaande werkmaatschappij" }); return; }
    }
    updateData.werkgeverId = wgId;
  }

  // Zorg dat rij 1 bestaat
  await getOrCreateInstellingen();

  const [updated] = await db.update(accountviewInstellingenTable)
    .set(updateData)
    .where(eq(accountviewInstellingenTable.id, 1))
    .returning();

  res.json(mapInstellingen(updated));
});

// POST /instellingen/accountview/test-verbinding
router.post("/instellingen/accountview/test-verbinding", requireBevoegdheid("systeem", 1), async (req: Request, res: Response): Promise<void> => {
  const inst = await getOrCreateInstellingen();
  const client = maakAccountViewClient(inst);
  const resultaat = await client.pingVerbinding();
  res.json(resultaat);
});

export default router;
