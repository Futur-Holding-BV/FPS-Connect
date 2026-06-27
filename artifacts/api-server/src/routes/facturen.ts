import { Router } from "express";
import type { Request, Response } from "express";
import {
  db,
  facturenTable,
  accountviewInstellingenTable,
  accountviewExportLogsTable,
  gebouwenTable,
  gebruikersTable,
} from "@workspace/db";
import { eq, and, desc, sql, or } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { ObjectStorageService } from "../lib/objectStorage";
import { maakAccountViewClient } from "../services/accountview-client";
import type { AccountviewBoeking } from "../services/accountview-client";
import OpenAI from "openai";

const router = Router();
const objectStorage = new ObjectStorageService();

function sessionUserId(req: Request): number | null {
  const sess = req.session as unknown as Record<string, unknown>;
  const uid = sess["gebruikerId"];
  return typeof uid === "number" ? uid : null;
}
function paramInt(val: unknown): number {
  return parseInt(String(val), 10);
}

function maakOpenAI() {
  const apiKey = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"] ?? process.env["OPENAI_API_KEY"];
  if (!apiKey) throw new Error("OpenAI API key ontbreekt");
  const baseURL = process.env["AI_INTEGRATIONS_OPENAI_API_BASE_URL"];
  return new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
}

async function mapFactuur(r: typeof facturenTable.$inferSelect) {
  const [gebouw] = r.gebouwId
    ? await db.select({ naam: gebouwenTable.naam }).from(gebouwenTable).where(eq(gebouwenTable.id, r.gebouwId)).limit(1)
    : [null];
  const [accordeerder] = r.geaccordeerdDoor
    ? await db.select({ naam: gebruikersTable.naam }).from(gebruikersTable).where(eq(gebruikersTable.id, r.geaccordeerdDoor)).limit(1)
    : [null];

  return {
    id: r.id,
    type: r.type,
    factuurnummer: r.factuurnummer,
    factuurdatum: r.factuurdatum,
    vervaldatum: r.vervaldatum,
    omschrijving: r.omschrijving,
    relatienaam: r.relatienaam,
    relatie_code: r.relatieCode,
    relatie_adres: r.relatieAdres,
    bedrag_excl_btw: r.bedragExclBtw,
    btw_bedrag: r.btwBedrag,
    bedrag_incl_btw: r.bedragInclBtw,
    btw_code: r.btwCode,
    grootboekrekening: r.grootboekrekening,
    kostenplaats: r.kostenplaats,
    dagboek: r.dagboek,
    project_code: r.projectCode,
    pdf_url: r.pdfUrl,
    bestandsnaam: r.bestandsnaam,
    gebouw_id: r.gebouwId,
    gebouw_naam: gebouw?.naam ?? null,
    ai_metadata: r.aiMetadata,
    status: r.status,
    geblokkeerd: r.geblokkeerd,
    blokkering_reden: r.blokkeringReden,
    geaccordeerd: r.geaccordeerd,
    geaccordeerd_op: r.geaccordeerdOp?.toISOString() ?? null,
    geaccordeerd_door_naam: accordeerder?.naam ?? null,
    accountview_boeking_id: r.accountviewBoekingId,
    accountview_export_op: r.accountviewExportOp?.toISOString() ?? null,
    accountview_status: r.accountviewStatus,
    accountview_fout: r.accountviewFout,
    aangemaakt_op: r.aangemaaktOp.toISOString(),
    bijgewerkt_op: r.bijgewerktOp.toISOString(),
  };
}

// ── GET /facturen/upload-url ───────────────────────────────────────────────────
router.post("/facturen/upload-url", requireBevoegdheid("financieel", 1), async (req: Request, res: Response) => {
  const { bestandsnaam } = req.body as { bestandsnaam?: string };
  if (!bestandsnaam) { res.status(400).json({ error: "bestandsnaam is verplicht" }); return; }
  try {
    const { uploadURL, objectPath } = await objectStorage.getObjectEntityUploadURL(null, "factuur");
    res.json({ upload_url: uploadURL, object_path: objectPath });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Upload URL aanvragen mislukt" });
  }
});

// ── GET /facturen/klaar-voor-export ───────────────────────────────────────────
router.get("/facturen/klaar-voor-export", requireBevoegdheid("financieel", 2), async (req: Request, res: Response) => {
  const rijen = await db.select().from(facturenTable)
    .where(and(
      eq(facturenTable.status, "klaar_voor_accountview"),
      eq(facturenTable.geblokkeerd, false),
    ))
    .orderBy(desc(facturenTable.bijgewerktOp));
  const mapped = await Promise.all(rijen.map(mapFactuur));
  res.json(mapped);
});

// ── GET /facturen ─────────────────────────────────────────────────────────────
router.get("/facturen", requireBevoegdheid("financieel", 1), async (req: Request, res: Response) => {
  const statusFilter = req.query["status"] ? String(req.query["status"]) : null;
  const typeFilter = req.query["type"] ? String(req.query["type"]) : null;
  const klaarFilter = req.query["klaar_voor_export"] === "true";

  const conditions = [];
  if (statusFilter) conditions.push(eq(facturenTable.status, statusFilter));
  if (typeFilter) conditions.push(eq(facturenTable.type, typeFilter));
  if (klaarFilter) conditions.push(eq(facturenTable.status, "klaar_voor_accountview"));

  const rijen = await db.select().from(facturenTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(facturenTable.aangemaaktOp));
  const mapped = await Promise.all(rijen.map(mapFactuur));
  res.json(mapped);
});

// ── POST /facturen ─────────────────────────────────────────────────────────────
router.post("/facturen", requireBevoegdheid("financieel", 1), async (req: Request, res: Response) => {
  const body = req.body as {
    type?: string; factuurnummer?: string; factuurdatum?: string; vervaldatum?: string;
    omschrijving?: string; relatienaam?: string; relatie_code?: string; relatie_adres?: string;
    bedrag_excl_btw?: string; btw_bedrag?: string; bedrag_incl_btw?: string;
    btw_code?: string; grootboekrekening?: string; kostenplaats?: string; project_code?: string;
    pdf_url?: string; bestandsnaam?: string; gebouw_id?: number;
  };
  const [rij] = await db.insert(facturenTable).values({
    type: body.type ?? "inkoop",
    factuurnummer: body.factuurnummer ?? null,
    factuurdatum: body.factuurdatum ?? null,
    vervaldatum: body.vervaldatum ?? null,
    omschrijving: body.omschrijving ?? null,
    relatienaam: body.relatienaam ?? null,
    relatieCode: body.relatie_code ?? null,
    relatieAdres: body.relatie_adres ?? null,
    bedragExclBtw: body.bedrag_excl_btw ?? null,
    btwBedrag: body.btw_bedrag ?? null,
    bedragInclBtw: body.bedrag_incl_btw ?? null,
    btwCode: body.btw_code ?? null,
    grootboekrekening: body.grootboekrekening ?? null,
    kostenplaats: body.kostenplaats ?? null,
    projectCode: body.project_code ?? null,
    pdfUrl: body.pdf_url ?? null,
    bestandsnaam: body.bestandsnaam ?? null,
    gebouwId: body.gebouw_id ?? null,
    uploaderId: sessionUserId(req),
    status: "ontvangen",
  }).returning();
  res.status(201).json(await mapFactuur(rij));
});

// ── GET /facturen/:id ──────────────────────────────────────────────────────────
router.get("/facturen/:id", requireBevoegdheid("financieel", 1), async (req: Request, res: Response) => {
  const id = paramInt(req.params["id"]);
  const [rij] = await db.select().from(facturenTable).where(eq(facturenTable.id, id)).limit(1);
  if (!rij) { res.status(404).json({ error: "Niet gevonden" }); return; }
  res.json(await mapFactuur(rij));
});

// ── PATCH /facturen/:id ────────────────────────────────────────────────────────
router.patch("/facturen/:id", requireBevoegdheid("financieel", 1), async (req: Request, res: Response) => {
  const id = paramInt(req.params["id"]);
  const body = req.body as Record<string, unknown>;

  const update: Partial<typeof facturenTable.$inferInsert> = { bijgewerktOp: new Date() };
  if ("factuurnummer" in body) update.factuurnummer = body["factuurnummer"] as string | null;
  if ("factuurdatum" in body) update.factuurdatum = body["factuurdatum"] as string | null;
  if ("vervaldatum" in body) update.vervaldatum = body["vervaldatum"] as string | null;
  if ("omschrijving" in body) update.omschrijving = body["omschrijving"] as string | null;
  if ("relatienaam" in body) update.relatienaam = body["relatienaam"] as string | null;
  if ("relatie_code" in body) update.relatieCode = body["relatie_code"] as string | null;
  if ("relatie_adres" in body) update.relatieAdres = body["relatie_adres"] as string | null;
  if ("bedrag_excl_btw" in body) update.bedragExclBtw = body["bedrag_excl_btw"] as string | null;
  if ("btw_bedrag" in body) update.btwBedrag = body["btw_bedrag"] as string | null;
  if ("bedrag_incl_btw" in body) update.bedragInclBtw = body["bedrag_incl_btw"] as string | null;
  if ("btw_code" in body) update.btwCode = body["btw_code"] as string | null;
  if ("grootboekrekening" in body) update.grootboekrekening = body["grootboekrekening"] as string | null;
  if ("kostenplaats" in body) update.kostenplaats = body["kostenplaats"] as string | null;
  if ("dagboek" in body) update.dagboek = body["dagboek"] as string | null;
  if ("project_code" in body) update.projectCode = body["project_code"] as string | null;
  if ("gebouw_id" in body) update.gebouwId = body["gebouw_id"] as number | null;
  if ("status" in body) update.status = body["status"] as string;

  const [updated] = await db.update(facturenTable).set(update).where(eq(facturenTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Niet gevonden" }); return; }
  res.json(await mapFactuur(updated));
});

// ── DELETE /facturen/:id ───────────────────────────────────────────────────────
router.delete("/facturen/:id", requireBevoegdheid("financieel", 2), async (req: Request, res: Response) => {
  const id = paramInt(req.params["id"]);
  await db.delete(facturenTable).where(eq(facturenTable.id, id));
  res.status(204).send();
});

// ── POST /facturen/:id/ai-uitlezen ─────────────────────────────────────────────
router.post("/facturen/:id/ai-uitlezen", requireBevoegdheid("financieel", 1), async (req: Request, res: Response) => {
  const id = paramInt(req.params["id"]);
  const [factuur] = await db.select().from(facturenTable).where(eq(facturenTable.id, id)).limit(1);
  if (!factuur) { res.status(404).json({ error: "Niet gevonden" }); return; }
  if (!factuur.pdfUrl) { res.status(422).json({ error: "Geen PDF gekoppeld aan deze factuur" }); return; }

  const devDomain = process.env["REPLIT_DEV_DOMAIN"];
  const downloadUrl = devDomain
    ? `https://${devDomain}/api/storage/files?path=${encodeURIComponent(factuur.pdfUrl)}`
    : factuur.pdfUrl;

  try {
    await db.update(facturenTable).set({ status: "ai_gelezen", bijgewerktOp: new Date() }).where(eq(facturenTable.id, id));

    const openai = maakOpenAI();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 3000,
      messages: [
        {
          role: "system",
          content: `Je bent een expert in het uitlezen van facturen voor Nederlandse bedrijven.
Analyseer de factuur en extraheer alle financiële gegevens nauwkeurig.
Geef je antwoord als geldig JSON:
{
  "factuurnummer": string|null,
  "factuurdatum": string|null,
  "vervaldatum": string|null,
  "relatienaam": string|null,
  "relatie_adres": string|null,
  "omschrijving": string|null,
  "bedrag_excl_btw": string|null,
  "btw_bedrag": string|null,
  "bedrag_incl_btw": string|null,
  "btw_code": string|null,
  "type": "inkoop"|"verkoop",
  "controle_nodig": boolean,
  "controle_reden": string|null,
  "confidence": number
}
Bedragen altijd als decimale string (bv. "1234.56"), datums als "YYYY-MM-DD".
Zet controle_nodig=true als bedragen onduidelijk zijn of gegevens ontbreken.`,
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Lees deze factuur uit en extraheer alle financiële gegevens." },
            { type: "image_url", image_url: { url: downloadUrl, detail: "high" } },
          ],
        },
      ],
    });

    const rawText = completion.choices[0]?.message?.content ?? "{}";
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    type ParsedFactuur = {
      factuurnummer?: string | null; factuurdatum?: string | null; vervaldatum?: string | null;
      relatienaam?: string | null; relatie_adres?: string | null; omschrijving?: string | null;
      bedrag_excl_btw?: string | null; btw_bedrag?: string | null; bedrag_incl_btw?: string | null;
      btw_code?: string | null; type?: string; controle_nodig?: boolean; controle_reden?: string | null;
      confidence?: number;
    };
    let parsed: ParsedFactuur = {};
    if (jsonMatch) {
      try { parsed = JSON.parse(jsonMatch[0]) as ParsedFactuur; } catch { /* laat leeg */ }
    }

    const controleNodig = parsed.controle_nodig ?? false;
    const nieuweStatus = controleNodig ? "controle_nodig" : "klaar_voor_boeking";

    const [updated] = await db.update(facturenTable).set({
      aiMetadata: parsed as Record<string, unknown>,
      factuurnummer: parsed.factuurnummer ?? factuur.factuurnummer ?? null,
      factuurdatum: parsed.factuurdatum ?? factuur.factuurdatum ?? null,
      vervaldatum: parsed.vervaldatum ?? factuur.vervaldatum ?? null,
      relatienaam: parsed.relatienaam ?? factuur.relatienaam ?? null,
      relatieAdres: parsed.relatie_adres ?? factuur.relatieAdres ?? null,
      omschrijving: parsed.omschrijving ?? factuur.omschrijving ?? null,
      bedragExclBtw: parsed.bedrag_excl_btw ?? factuur.bedragExclBtw ?? null,
      btwBedrag: parsed.btw_bedrag ?? factuur.btwBedrag ?? null,
      bedragInclBtw: parsed.bedrag_incl_btw ?? factuur.bedragInclBtw ?? null,
      btwCode: parsed.btw_code ?? factuur.btwCode ?? null,
      status: nieuweStatus,
      bijgewerktOp: new Date(),
    }).where(eq(facturenTable.id, id)).returning();

    res.json(await mapFactuur(updated));
  } catch (err) {
    req.log.error(err);
    await db.update(facturenTable).set({ status: "controle_nodig", bijgewerktOp: new Date() }).where(eq(facturenTable.id, id));
    res.status(500).json({ error: "AI-uitlezing mislukt" });
  }
});

// ── POST /facturen/:id/accorderen ──────────────────────────────────────────────
router.post("/facturen/:id/accorderen", requireBevoegdheid("financieel", 2), async (req: Request, res: Response) => {
  const id = paramInt(req.params["id"]);
  const [factuur] = await db.select().from(facturenTable).where(eq(facturenTable.id, id)).limit(1);
  if (!factuur) { res.status(404).json({ error: "Niet gevonden" }); return; }
  if (factuur.geblokkeerd) { res.status(409).json({ error: "Factuur is geblokkeerd" }); return; }

  const userId = sessionUserId(req);
  const [updated] = await db.update(facturenTable).set({
    geaccordeerd: true,
    geaccordeerdOp: new Date(),
    geaccordeerdDoor: userId,
    status: "klaar_voor_accountview",
    bijgewerktOp: new Date(),
  }).where(eq(facturenTable.id, id)).returning();

  res.json(await mapFactuur(updated));
});

// ── POST /facturen/:id/blokkeren ───────────────────────────────────────────────
router.post("/facturen/:id/blokkeren", requireBevoegdheid("financieel", 2), async (req: Request, res: Response) => {
  const id = paramInt(req.params["id"]);
  const { geblokkeerd, reden } = req.body as { geblokkeerd?: boolean; reden?: string | null };

  const blokkeerStatus = geblokkeerd !== false;
  const [updated] = await db.update(facturenTable).set({
    geblokkeerd: blokkeerStatus,
    blokkeringReden: blokkeerStatus ? (reden ?? null) : null,
    bijgewerktOp: new Date(),
  }).where(eq(facturenTable.id, id)).returning();

  if (!updated) { res.status(404).json({ error: "Niet gevonden" }); return; }
  res.json(await mapFactuur(updated));
});

// ── POST /facturen/:id/export-accountview ──────────────────────────────────────
router.post("/facturen/:id/export-accountview", requireBevoegdheid("financieel", 2), async (req: Request, res: Response) => {
  const id = paramInt(req.params["id"]);
  const [factuur] = await db.select().from(facturenTable).where(eq(facturenTable.id, id)).limit(1);
  if (!factuur) { res.status(404).json({ error: "Niet gevonden" }); return; }

  // Blokkeer dubbele export
  if (factuur.accountviewBoekingId && factuur.accountviewStatus === "success") {
    res.status(409).json({
      error: "Dubbele export geblokkeerd",
      detail: `Deze factuur is al geëxporteerd naar AccountView (boekingId: ${factuur.accountviewBoekingId}).`,
    });
    return;
  }
  if (factuur.geblokkeerd) {
    res.status(409).json({ error: "Factuur is geblokkeerd" });
    return;
  }

  // Valideer verplichte velden
  const fouten: string[] = [];
  if (!factuur.factuurnummer) fouten.push("Factuurnummer ontbreekt");
  if (!factuur.factuurdatum) fouten.push("Factuurdatum ontbreekt");
  if (!factuur.relatienaam) fouten.push("Relatienaam ontbreekt");
  if (!factuur.bedragInclBtw) fouten.push("Bedrag incl. BTW ontbreekt");
  if (!factuur.btwCode) fouten.push("BTW-code ontbreekt");
  if (!factuur.geaccordeerd) fouten.push("Factuur is nog niet geaccordeerd");

  if (fouten.length > 0) {
    res.status(422).json({ error: "Factuur is niet exportklaar", fouten });
    return;
  }

  // Haal AccountView instellingen op
  const [inst] = await db.select().from(accountviewInstellingenTable).where(eq(accountviewInstellingenTable.id, 1)).limit(1);
  if (!inst) {
    res.status(503).json({ error: "AccountView is niet geconfigureerd" });
    return;
  }

  const client = maakAccountViewClient(inst);
  const dagboek = factuur.dagboek ?? (factuur.type === "verkoop" ? inst.dagboekVerkoop : inst.dagboekInkoop) ?? "INK";

  const boeking: AccountviewBoeking = {
    dagboek: dagboek ?? "INK",
    administratiecode: inst.administratiecode ?? "",
    factuurnummer: factuur.factuurnummer!,
    factuurdatum: factuur.factuurdatum!,
    vervaldatum: factuur.vervaldatum ?? factuur.factuurdatum!,
    relatienaam: factuur.relatienaam!,
    relatieCode: factuur.relatieCode ?? undefined,
    omschrijving: factuur.omschrijving ?? `Factuur ${factuur.factuurnummer}`,
    bedragExclBtw: parseFloat(factuur.bedragExclBtw ?? "0"),
    btwBedrag: parseFloat(factuur.btwBedrag ?? "0"),
    bedragInclBtw: parseFloat(factuur.bedragInclBtw ?? "0"),
    btwCode: factuur.btwCode ?? undefined,
    grootboekrekening: factuur.grootboekrekening ?? inst.grootboekStandaard ?? undefined,
    kostenplaats: factuur.kostenplaats ?? undefined,
    projectCode: factuur.projectCode ?? undefined,
    type: factuur.type === "verkoop" ? "verkoop" : "inkoop",
  };

  const userId = sessionUserId(req);

  // Maak log-entry aan
  const [logEntry] = await db.insert(accountviewExportLogsTable).values({
    factuurId: id,
    gebruikerId: userId,
    testmodus: inst.testmodus,
    verzondenPayload: boeking as unknown as Record<string, unknown>,
    status: "bezig",
  }).returning();

  const resultaat = await client.verzendBoeking(boeking);

  // Bijwerken log-entry
  await db.update(accountviewExportLogsTable).set({
    accountviewResponse: resultaat.rawResponse as Record<string, unknown> | null,
    httpStatus: resultaat.httpStatus ?? null,
    status: resultaat.geslaagd ? "geslaagd" : "mislukt",
    accountviewBoekingId: resultaat.boekingId ?? null,
    foutmelding: resultaat.foutmelding ?? null,
  }).where(eq(accountviewExportLogsTable.id, logEntry.id));

  if (resultaat.geslaagd) {
    await db.update(facturenTable).set({
      accountviewBoekingId: resultaat.boekingId ?? null,
      accountviewExportOp: new Date(),
      accountviewStatus: "success",
      accountviewFout: null,
      status: "verwerkt",
      bijgewerktOp: new Date(),
    }).where(eq(facturenTable.id, id));
  } else {
    await db.update(facturenTable).set({
      accountviewStatus: "error",
      accountviewFout: resultaat.foutmelding ?? "Onbekende fout",
      status: "fout_bij_verzending",
      bijgewerktOp: new Date(),
    }).where(eq(facturenTable.id, id));
  }

  res.json({
    status: resultaat.geslaagd ? "geslaagd" : "mislukt",
    factuur_id: id,
    boeking_id: resultaat.boekingId ?? null,
    foutmelding: resultaat.foutmelding ?? null,
    testmodus: inst.testmodus,
    fouten: resultaat.foutDetails ?? [],
  });
});

// ── GET /facturen/:id/export-logs ──────────────────────────────────────────────
router.get("/facturen/:id/export-logs", requireBevoegdheid("financieel", 1), async (req: Request, res: Response) => {
  const id = paramInt(req.params["id"]);
  const logs = await db.select().from(accountviewExportLogsTable)
    .where(eq(accountviewExportLogsTable.factuurId, id))
    .orderBy(desc(accountviewExportLogsTable.exportOp));
  res.json(logs.map((l) => ({
    id: l.id,
    factuur_id: l.factuurId,
    gebruiker_id: l.gebruikerId,
    export_op: l.exportOp.toISOString(),
    testmodus: l.testmodus,
    verzonden_payload: l.verzondenPayload,
    accountview_response: l.accountviewResponse,
    http_status: l.httpStatus,
    status: l.status,
    accountview_boeking_id: l.accountviewBoekingId,
    foutmelding: l.foutmelding,
  })));
});

export default router;
