import { Router } from "express";
import type { Request, Response } from "express";
import {
  db,
  facturenTable,
  accountviewInstellingenTable,
  accountviewExportLogsTable,
  factuurOpmerkingenTable,
  factuurRegelsTable,
  factuurTermijnenTable,
  gebouwenTable,
  gebruikersTable,
  leveranciersTable,
} from "@workspace/db";
import { eq, and, desc, sql, or, gte, count, isNull, isNotNull, ne, lt, sum, ilike } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { ObjectStorageService } from "../lib/objectStorage";
import { maakAccountViewClient } from "../services/accountview-client";
import type { AccountviewBoeking } from "../services/accountview-client";
import crypto from "crypto";
import { aiGateway, heeftGateway } from "../lib/aiGateway";

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


async function mapFactuur(r: typeof facturenTable.$inferSelect) {
  const [gebouw] = r.gebouwId
    ? await db.select({ naam: gebouwenTable.naam }).from(gebouwenTable).where(eq(gebouwenTable.id, r.gebouwId)).limit(1)
    : [null];
  const [accordeerder] = r.geaccordeerdDoor
    ? await db.select({ naam: gebruikersTable.naam }).from(gebruikersTable).where(eq(gebruikersTable.id, r.geaccordeerdDoor)).limit(1)
    : [null];
  const [afgekeurder] = r.afgekeurdDoor
    ? await db.select({ naam: gebruikersTable.naam }).from(gebruikersTable).where(eq(gebruikersTable.id, r.afgekeurdDoor)).limit(1)
    : [null];
  const [beoordelaar] = r.beoordelaarId
    ? await db.select({ naam: gebruikersTable.naam }).from(gebruikersTable).where(eq(gebruikersTable.id, r.beoordelaarId)).limit(1)
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
    payload_hash: r.payloadHash,
    betaalstatus: r.betaalstatus,
    betaaldatum: r.betaaldatum,
    boekingsnummer: r.boekingsnummer,
    terugkoppeling_op: r.terugkoppelingOp?.toISOString() ?? null,
    afgekeurd: !!(r.afgekeurdReden || r.afgekeurdOp),
    afkeuring_reden: r.afgekeurdReden,
    afgekeurd_op: r.afgekeurdOp?.toISOString() ?? null,
    afgekeurd_door_naam: afgekeurder?.naam ?? null,
    herexport_op: r.herexportOp?.toISOString() ?? null,
    herexport_reden: r.herexportReden,
    beoordelaar_id: r.beoordelaarId ?? null,
    beoordelaar_naam: beoordelaar?.naam ?? null,
    // F1/F2: nieuwe velden
    opdracht_id: r.opdrachtId ?? null,
    leverancier_id: r.leverancierId ?? null,
    categorie: r.categorie ?? null,
    voorstel_bron: r.voorstelBron ?? null,
    voorstel_bron_id: r.voorstelBronId ?? null,
    g_rekening_van_toepassing: r.gRekeningVanToepassing,
    g_rekening_bedrag: r.gRekeningBedrag ?? null,
    normaal_bedrag: r.normaalBedrag ?? null,
    iban_uitgelezen: r.ibanUitgelezen ?? null,
    iban_afwijking: r.ibanAfwijking,
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
router.get("/facturen/klaar-voor-export", requireBevoegdheid("financieel", 4), async (req: Request, res: Response) => {
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
router.delete("/facturen/:id", requireBevoegdheid("financieel", 4), async (req: Request, res: Response) => {
  const id = paramInt(req.params["id"]);
  await db.delete(facturenTable).where(eq(facturenTable.id, id));
  res.status(204).send();
});

// ── POST /facturen/:id/ai-uitlezen ─────────────────────────────────────────────
// Fase 2: Uitgebreide AI-extractie — regels, IBAN-verificatie, leverancierherkenning,
// G-rekening-signalering. AI stelt voor; administratie keurt goed.
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

    const facturenChatResultaat = await aiGateway.chat("default", {
      max_tokens: 4000,
      messages: [
        {
          role: "system",
          content: `Je bent een expert in het uitlezen van Nederlandse inkoopfacturen voor een brandpreventie-bedrijf.
Analyseer de factuur en extraheer ALLE gegevens nauwkeurig — zowel de header als alle regellijnen.
Geef je antwoord als geldig JSON (geen tekst buiten het JSON-object):
{
  "factuurnummer": string|null,
  "factuurdatum": string|null,
  "vervaldatum": string|null,
  "relatienaam": string|null,
  "relatie_adres": string|null,
  "relatie_iban": string|null,
  "relatie_btwnummer": string|null,
  "omschrijving": string|null,
  "bedrag_excl_btw": string|null,
  "btw_bedrag": string|null,
  "bedrag_incl_btw": string|null,
  "btw_code": string|null,
  "type": "inkoop"|"verkoop",
  "regels": [
    {
      "regelnummer": number,
      "omschrijving": string,
      "hoeveelheid": number|null,
      "eenheid": string|null,
      "stukprijs": string|null,
      "bedrag_excl_btw": string|null,
      "btw_code": string|null,
      "btw_percentage": number|null,
      "btw_bedrag": string|null,
      "grootboekrekening": string|null
    }
  ],
  "controle_nodig": boolean,
  "controle_reden": string|null,
  "confidence": number
}
Regels: extraheer elke factuurregel als apart object. Als er geen regelspecificatie is, geef dan een lege array.
Bedragen: altijd als decimale string ("1234.56"), datums als "YYYY-MM-DD".
BTW-codes: H=21%, L=9%, V=verlegd, 0=vrijgesteld.
IBAN: exact overnemen zoals op factuur (met of zonder spaties).
Zet controle_nodig=true als bedragen onduidelijk zijn, IBAN ontbreekt, of regelsom afwijkt van totaal.`,
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Lees deze factuur volledig uit inclusief alle regellijnen en het IBAN van de leverancier." },
            { type: "image_url", image_url: { url: downloadUrl, detail: "high" } },
          ],
        },
      ],
    });

    const rawText = facturenChatResultaat.ok ? facturenChatResultaat.inhoud : "{}";
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);

    type ParsedRegel = {
      regelnummer?: number; omschrijving?: string; hoeveelheid?: number | null;
      eenheid?: string | null; stukprijs?: string | null; bedrag_excl_btw?: string | null;
      btw_code?: string | null; btw_percentage?: number | null; btw_bedrag?: string | null;
      grootboekrekening?: string | null;
    };
    type ParsedFactuur = {
      factuurnummer?: string | null; factuurdatum?: string | null; vervaldatum?: string | null;
      relatienaam?: string | null; relatie_adres?: string | null; relatie_iban?: string | null;
      relatie_btwnummer?: string | null; omschrijving?: string | null;
      bedrag_excl_btw?: string | null; btw_bedrag?: string | null; bedrag_incl_btw?: string | null;
      btw_code?: string | null; type?: string; regels?: ParsedRegel[];
      controle_nodig?: boolean; controle_reden?: string | null; confidence?: number;
    };
    let parsed: ParsedFactuur = {};
    if (jsonMatch) {
      try { parsed = JSON.parse(jsonMatch[0]) as ParsedFactuur; } catch { /* laat leeg */ }
    }

    // ── Leverancierherkenning: IBAN-match → naam-match (fuzzy) ────────────────
    let leverancier: typeof leveranciersTable.$inferSelect | null = null;
    const uitgelezenIban = parsed.relatie_iban?.replace(/\s/g, "") ?? null;

    if (uitgelezenIban) {
      const [gevonden] = await db.select().from(leveranciersTable)
        .where(eq(leveranciersTable.iban, uitgelezenIban)).limit(1);
      leverancier = gevonden ?? null;
    }
    if (!leverancier && parsed.relatienaam) {
      const naam = parsed.relatienaam.trim();
      const [gevonden] = await db.select().from(leveranciersTable)
        .where(ilike(leveranciersTable.naam, `%${naam}%`)).limit(1);
      leverancier = gevonden ?? null;
      // Nauwere match als fuzzy te breed is
      if (!gevonden) {
        const [gevondenNauw] = await db.select().from(leveranciersTable)
          .where(ilike(leveranciersTable.naam, `${naam.split(" ")[0]}%`)).limit(1);
        leverancier = gevondenNauw ?? null;
      }
    }

    // ── IBAN-verificatie ──────────────────────────────────────────────────────
    const leveranciersIban = leverancier?.iban?.replace(/\s/g, "") ?? null;
    const ibanAfwijking = !!(uitgelezenIban && leveranciersIban && uitgelezenIban !== leveranciersIban);

    // ── G-rekening-signalering (voorstel, niet definitief) ────────────────────
    let gRekeningVanToepassing = leverancier?.gRekeningVanToepassing ?? false;
    let gRekeningBedrag: string | null = null;
    let normaalBedrag: string | null = null;
    const totaalInclBtw = parsed.bedrag_incl_btw ? parseFloat(parsed.bedrag_incl_btw) : null;

    if (gRekeningVanToepassing && leverancier?.gRekeningPercentage && totaalInclBtw) {
      const perc = leverancier.gRekeningPercentage / 100;
      gRekeningBedrag = (totaalInclBtw * perc).toFixed(2);
      normaalBedrag = (totaalInclBtw * (1 - perc)).toFixed(2);
    }

    // ── Factuurregels opslaan (verwijder oude AI-regels, voeg nieuwe in) ──────
    const regels = Array.isArray(parsed.regels) ? parsed.regels : [];
    if (regels.length > 0) {
      await db.delete(factuurRegelsTable).where(
        and(eq(factuurRegelsTable.factuurId, id), eq(factuurRegelsTable.bron, "ai")),
      );
      for (let i = 0; i < regels.length; i++) {
        const r = regels[i]!;
        await db.insert(factuurRegelsTable).values({
          factuurId: id,
          regelnummer: r.regelnummer ?? i + 1,
          omschrijving: r.omschrijving?.trim() || `Regel ${i + 1}`,
          hoeveelheid: r.hoeveelheid ?? null,
          eenheid: r.eenheid ?? null,
          stukprijs: r.stukprijs ?? null,
          bedragExclBtw: r.bedrag_excl_btw ?? null,
          btwCode: r.btw_code ?? null,
          btwPercentage: r.btw_percentage ?? null,
          btwBedrag: r.btw_bedrag ?? null,
          grootboekrekening: r.grootboekrekening ?? null,
          bron: "ai",
          aiVertrouwen: parsed.confidence ?? null,
        });
      }
    }

    // ── Factuur updaten ───────────────────────────────────────────────────────
    const nieuweStatus = (parsed.controle_nodig || ibanAfwijking) ? "controle_nodig" : "te_beoordelen_pl";

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
      // Leverancier & IBAN
      leverancierId: leverancier?.id ?? factuur.leverancierId ?? null,
      ibanUitgelezen: uitgelezenIban ?? factuur.ibanUitgelezen ?? null,
      ibanAfwijking,
      // G-rekening
      gRekeningVanToepassing,
      gRekeningBedrag: gRekeningBedrag ?? factuur.gRekeningBedrag ?? null,
      normaalBedrag: normaalBedrag ?? factuur.normaalBedrag ?? null,
      status: nieuweStatus,
      bijgewerktOp: new Date(),
    }).where(eq(facturenTable.id, id)).returning();

    res.json({
      ...(await mapFactuur(updated)),
      _ai_samenvatting: {
        regels_gevonden: regels.length,
        leverancier_herkend: !!leverancier,
        leverancier_naam: leverancier?.naam ?? null,
        iban_afwijking: ibanAfwijking,
        g_rekening_van_toepassing: gRekeningVanToepassing,
        confidence: parsed.confidence ?? null,
      },
    });
  } catch (err) {
    req.log.error(err);
    await db.update(facturenTable).set({ status: "controle_nodig", bijgewerktOp: new Date() }).where(eq(facturenTable.id, id));
    res.status(500).json({ error: "AI-uitlezing mislukt" });
  }
});

// ── GET /facturen/:id/afwijkingen ─────────────────────────────────────────────
// Fase 2: Geconsolideerde lijst van signaleringen en afwijkingen voor de controlebox.
// Codes: iban_afwijking | g_rekening_van_toepassing | geen_regels |
//        geen_project_koppeling | hoog_bedrag | bedrag_afwijking
// Ernst: kritisch | waarschuwing | info
router.get("/facturen/:id/afwijkingen", requireBevoegdheid("financieel", 1), async (req: Request, res: Response) => {
  const id = paramInt(req.params["id"]);
  const [factuur] = await db.select().from(facturenTable)
    .where(eq(facturenTable.id, id)).limit(1);
  if (!factuur) { res.status(404).json({ error: "Niet gevonden" }); return; }

  const signalen: Array<{ code: string; ernst: string; bericht: string }> = [];

  // 1. IBAN-afwijking — kritisch, mogelijke fraude
  if (factuur.ibanAfwijking) {
    signalen.push({
      code: "iban_afwijking",
      ernst: "kritisch",
      bericht: `Uitgelezen IBAN (${factuur.ibanUitgelezen ?? "onbekend"}) wijkt af van het geregistreerde IBAN van de leverancier. Controleer vóór betaling.`,
    });
  }

  // 2. G-rekening (wettelijke verplichting bouwsector)
  if (factuur.gRekeningVanToepassing) {
    if (!factuur.gRekeningBedrag) {
      signalen.push({
        code: "g_rekening_niet_berekend",
        ernst: "waarschuwing",
        bericht: "Leverancier heeft G-rekening-verplichting maar het op te storten bedrag is nog niet berekend.",
      });
    } else {
      signalen.push({
        code: "g_rekening_van_toepassing",
        ernst: "info",
        bericht: `G-rekening vereist. Naar G-rekening: ${factuur.gRekeningBedrag}, normaal deel: ${factuur.normaalBedrag ?? "?"}`,
      });
    }
  }

  // 3. Geen regellijnen
  const [regelCount] = await db.select({ n: count() }).from(factuurRegelsTable)
    .where(eq(factuurRegelsTable.factuurId, id));
  const aantalRegels = regelCount?.n ?? 0;
  if (aantalRegels === 0) {
    signalen.push({
      code: "geen_regels",
      ernst: "waarschuwing",
      bericht: "Factuur bevat geen gespecificeerde regellijnen. Start AI-uitlezing om regels automatisch te detecteren.",
    });
  }

  // 4. Geen project/gebouw-koppeling
  if (!factuur.gebouwId && !factuur.opdrachtId && !factuur.projectCode) {
    signalen.push({
      code: "geen_project_koppeling",
      ernst: "waarschuwing",
      bericht: "Factuur is niet gekoppeld aan een gebouw, project of opdracht. Koppel de factuur om kostprijsdoorwerking mogelijk te maken.",
    });
  }

  // 5. Bedrag boven drempel (>€5.000) — informerend
  if (factuur.bedragInclBtw && parseFloat(factuur.bedragInclBtw) > 5000 && !factuur.geaccordeerd) {
    signalen.push({
      code: "hoog_bedrag",
      ernst: "info",
      bericht: `Bedrag (${parseFloat(factuur.bedragInclBtw).toLocaleString("nl-NL", { style: "currency", currency: "EUR" })}) boven de drempel van €5.000 — verplicht accorderen.`,
    });
  }

  // 6. Regelsom vs. headertotaal afwijking
  if (aantalRegels > 0 && factuur.bedragExclBtw) {
    const [regelSomRow] = await db.select({
      som: sql<string>`COALESCE(SUM(CAST(bedrag_excl_btw AS numeric)), 0)`,
    }).from(factuurRegelsTable).where(eq(factuurRegelsTable.factuurId, id));
    const regelSom = parseFloat(regelSomRow?.som ?? "0");
    const headerExcl = parseFloat(factuur.bedragExclBtw);
    if (Math.abs(headerExcl - regelSom) > 0.02) {
      signalen.push({
        code: "bedrag_afwijking",
        ernst: "kritisch",
        bericht: `Som van regellijnen (${regelSom.toFixed(2)}) wijkt meer dan €0,02 af van het factuurtotaal excl. BTW (${headerExcl.toFixed(2)}).`,
      });
    }
  }

  res.json({ factuur_id: id, aantal_signalen: signalen.length, signalen });
});

// ── POST /facturen/:id/accorderen ──────────────────────────────────────────────
router.post("/facturen/:id/accorderen", requireBevoegdheid("financieel", 4), async (req: Request, res: Response) => {
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
router.post("/facturen/:id/blokkeren", requireBevoegdheid("financieel", 4), async (req: Request, res: Response) => {
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
router.post("/facturen/:id/export-accountview", requireBevoegdheid("financieel", 4), async (req: Request, res: Response) => {
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
    actie: l.actie,
    verzonden_payload: l.verzondenPayload,
    accountview_response: l.accountviewResponse,
    http_status: l.httpStatus,
    payload_hash: l.payloadHash,
    status: l.status,
    accountview_boeking_id: l.accountviewBoekingId,
    foutmelding: l.foutmelding,
  })));
});

// ── POST /facturen/:id/afkeuren ────────────────────────────────────────────────
router.post("/facturen/:id/afkeuren", requireBevoegdheid("financieel", 4), async (req: Request, res: Response) => {
  const id = paramInt(req.params["id"]);
  const { reden } = req.body as { reden?: string };
  if (!reden?.trim()) { res.status(400).json({ error: "Afkeuringsreden is verplicht" }); return; }

  const [factuur] = await db.select().from(facturenTable).where(eq(facturenTable.id, id)).limit(1);
  if (!factuur) { res.status(404).json({ error: "Niet gevonden" }); return; }
  if (factuur.status === "verwerkt") { res.status(409).json({ error: "Verwerkte facturen kunnen niet worden afgekeurd" }); return; }

  const userId = sessionUserId(req);
  const [updated] = await db.update(facturenTable).set({
    status: "afgekeurd",
    afgekeurdReden: reden.trim(),
    afgekeurdOp: new Date(),
    afgekeurdDoor: userId,
    bijgewerktOp: new Date(),
  }).where(eq(facturenTable.id, id)).returning();

  await db.insert(accountviewExportLogsTable).values({
    factuurId: id,
    gebruikerId: userId,
    testmodus: false,
    actie: "afkeuren",
    status: "geslaagd",
    foutmelding: `Afgekeurd: ${reden.trim()}`,
  });

  res.json(await mapFactuur(updated));
});

// ── POST /facturen/:id/beoordelen-pl ──────────────────────────────────────────
router.post("/facturen/:id/beoordelen-pl", requireBevoegdheid("financieel", 2), async (req: Request, res: Response) => {
  const id = paramInt(req.params["id"]);
  const { actie, reden } = req.body as { actie?: string; reden?: string };

  if (!["goedkeuren", "afkeuren", "doorzetten"].includes(actie ?? "")) {
    res.status(422).json({ error: "Ongeldige actie. Gebruik: goedkeuren, afkeuren of doorzetten" }); return;
  }

  const [factuur] = await db.select().from(facturenTable).where(eq(facturenTable.id, id)).limit(1);
  if (!factuur) { res.status(404).json({ error: "Niet gevonden" }); return; }
  if (factuur.status !== "te_beoordelen_pl") {
    res.status(422).json({ error: "Factuur staat niet in de PL-beoordelingsbox" }); return;
  }

  const userId = sessionUserId(req);

  if (actie === "afkeuren") {
    if (!reden?.trim()) { res.status(400).json({ error: "Afkeuringsreden is verplicht" }); return; }
    const [updated] = await db.update(facturenTable).set({
      status: "afgekeurd",
      afgekeurdReden: reden.trim(),
      afgekeurdOp: new Date(),
      afgekeurdDoor: userId,
      bijgewerktOp: new Date(),
    }).where(eq(facturenTable.id, id)).returning();
    await db.insert(accountviewExportLogsTable).values({ factuurId: id, gebruikerId: userId, testmodus: false, actie: "pl_afkeuren", status: "geslaagd", foutmelding: `PL afgekeurd: ${reden.trim()}` });
    res.json(await mapFactuur(updated)); return;
  }

  const [updated] = await db.update(facturenTable).set({
    status: "te_beoordelen_wvb",
    bijgewerktOp: new Date(),
  }).where(eq(facturenTable.id, id)).returning();
  await db.insert(accountviewExportLogsTable).values({ factuurId: id, gebruikerId: userId, testmodus: false, actie: `pl_${actie}`, status: "geslaagd", foutmelding: `PL ${actie}` });
  res.json(await mapFactuur(updated));
});

// ── POST /facturen/:id/beoordelen-wvb ─────────────────────────────────────────
router.post("/facturen/:id/beoordelen-wvb", requireBevoegdheid("financieel", 3), async (req: Request, res: Response) => {
  const id = paramInt(req.params["id"]);
  const { actie, reden } = req.body as { actie?: string; reden?: string };

  if (!["goedkeuren", "afkeuren", "doorzetten"].includes(actie ?? "")) {
    res.status(422).json({ error: "Ongeldige actie. Gebruik: goedkeuren, afkeuren of doorzetten" }); return;
  }

  const [factuur] = await db.select().from(facturenTable).where(eq(facturenTable.id, id)).limit(1);
  if (!factuur) { res.status(404).json({ error: "Niet gevonden" }); return; }
  if (factuur.status !== "te_beoordelen_wvb") {
    res.status(422).json({ error: "Factuur staat niet in de WVB-beoordelingsbox" }); return;
  }

  const userId = sessionUserId(req);

  if (actie === "afkeuren") {
    if (!reden?.trim()) { res.status(400).json({ error: "Afkeuringsreden is verplicht" }); return; }
    const [updatedWvb] = await db.update(facturenTable).set({
      status: "afgekeurd",
      afgekeurdReden: reden.trim(),
      afgekeurdOp: new Date(),
      afgekeurdDoor: userId,
      bijgewerktOp: new Date(),
    }).where(eq(facturenTable.id, id)).returning();
    await db.insert(accountviewExportLogsTable).values({ factuurId: id, gebruikerId: userId, testmodus: false, actie: "wvb_afkeuren", status: "geslaagd", foutmelding: `WVB afgekeurd: ${reden.trim()}` });
    res.json(await mapFactuur(updatedWvb)); return;
  }

  const [updatedWvb] = await db.update(facturenTable).set({
    status: "klaar_voor_boeking",
    bijgewerktOp: new Date(),
  }).where(eq(facturenTable.id, id)).returning();
  await db.insert(accountviewExportLogsTable).values({ factuurId: id, gebruikerId: userId, testmodus: false, actie: `wvb_${actie}`, status: "geslaagd", foutmelding: `WVB ${actie}` });
  res.json(await mapFactuur(updatedWvb));
});

// ── POST /facturen/:id/doorsturen-medewerker ──────────────────────────────────
router.post("/facturen/:id/doorsturen-medewerker", requireBevoegdheid("financieel", 2), async (req: Request, res: Response) => {
  const id = paramInt(req.params["id"]);
  const { gebruiker_id, opmerking } = req.body as { gebruiker_id?: number; opmerking?: string };

  if (!gebruiker_id) { res.status(400).json({ error: "gebruiker_id is verplicht" }); return; }

  const [factuur] = await db.select().from(facturenTable).where(eq(facturenTable.id, id)).limit(1);
  if (!factuur) { res.status(404).json({ error: "Niet gevonden" }); return; }

  const [medewerker] = await db.select({ id: gebruikersTable.id, naam: gebruikersTable.naam })
    .from(gebruikersTable).where(eq(gebruikersTable.id, gebruiker_id)).limit(1);
  if (!medewerker) { res.status(404).json({ error: "Medewerker niet gevonden" }); return; }

  const userId = sessionUserId(req);
  const [updated] = await db.update(facturenTable).set({
    beoordelaarId: gebruiker_id,
    status: "ter_beoordeling_medewerker",
    bijgewerktOp: new Date(),
  }).where(eq(facturenTable.id, id)).returning();

  await db.insert(accountviewExportLogsTable).values({
    factuurId: id,
    gebruikerId: userId,
    testmodus: false,
    actie: "doorsturen_medewerker",
    status: "geslaagd",
    foutmelding: `Doorgezet naar medewerker: ${medewerker.naam}`,
  });

  if (opmerking?.trim()) {
    await db.insert(factuurOpmerkingenTable).values({
      factuurId: id,
      gebruikerId: userId,
      tekst: opmerking.trim(),
    });
  }

  res.json(await mapFactuur(updated));
});

// ── POST /facturen/:id/beoordelen-medewerker ──────────────────────────────────
router.post("/facturen/:id/beoordelen-medewerker", requireBevoegdheid("financieel", 1), async (req: Request, res: Response) => {
  const id = paramInt(req.params["id"]);
  const { actie, reden } = req.body as { actie?: string; reden?: string };

  if (!["goedkeuren", "afkeuren"].includes(actie ?? "")) {
    res.status(422).json({ error: "Ongeldige actie. Gebruik: goedkeuren of afkeuren" }); return;
  }

  const [factuur] = await db.select().from(facturenTable).where(eq(facturenTable.id, id)).limit(1);
  if (!factuur) { res.status(404).json({ error: "Niet gevonden" }); return; }
  if (factuur.status !== "ter_beoordeling_medewerker") {
    res.status(422).json({ error: "Factuur staat niet ter beoordeling bij een medewerker" }); return;
  }

  const userId = sessionUserId(req);

  if (actie === "afkeuren") {
    if (!reden?.trim()) { res.status(400).json({ error: "Afkeuringsreden is verplicht" }); return; }
    const [updated] = await db.update(facturenTable).set({
      status: "afgekeurd",
      afgekeurdReden: reden.trim(),
      afgekeurdOp: new Date(),
      afgekeurdDoor: userId,
      bijgewerktOp: new Date(),
    }).where(eq(facturenTable.id, id)).returning();
    await db.insert(accountviewExportLogsTable).values({ factuurId: id, gebruikerId: userId, testmodus: false, actie: "medewerker_afkeuren", status: "geslaagd", foutmelding: `Medewerker afgekeurd: ${reden.trim()}` });
    res.json(await mapFactuur(updated)); return;
  }

  const [updated] = await db.update(facturenTable).set({
    status: "te_beoordelen_pl",
    bijgewerktOp: new Date(),
  }).where(eq(facturenTable.id, id)).returning();
  await db.insert(accountviewExportLogsTable).values({ factuurId: id, gebruikerId: userId, testmodus: false, actie: "medewerker_goedkeuren", status: "geslaagd", foutmelding: "Medewerker goedgekeurd — terug naar projectleider" });
  res.json(await mapFactuur(updated));
});

// ── GET /facturen/:id/opmerkingen ─────────────────────────────────────────────
router.get("/facturen/:id/opmerkingen", requireBevoegdheid("financieel", 1), async (req: Request, res: Response) => {
  const id = paramInt(req.params["id"]);
  const rijen = await db
    .select({
      id: factuurOpmerkingenTable.id,
      factuurId: factuurOpmerkingenTable.factuurId,
      gebruikerId: factuurOpmerkingenTable.gebruikerId,
      gebruikerNaam: gebruikersTable.naam,
      tekst: factuurOpmerkingenTable.tekst,
      replyOpId: factuurOpmerkingenTable.replyOpId,
      afgehandeld: factuurOpmerkingenTable.afgehandeld,
      afgehandeldOp: factuurOpmerkingenTable.afgehandeldOp,
      afgehandeldDoor: factuurOpmerkingenTable.afgehandeldDoor,
      aangemaaktOp: factuurOpmerkingenTable.aangemaaktOp,
    })
    .from(factuurOpmerkingenTable)
    .leftJoin(gebruikersTable, eq(factuurOpmerkingenTable.gebruikerId, gebruikersTable.id))
    .where(eq(factuurOpmerkingenTable.factuurId, id))
    .orderBy(factuurOpmerkingenTable.aangemaaktOp);

  const afhandelaarIds = rijen.filter((r) => r.afgehandeldDoor).map((r) => r.afgehandeldDoor!);
  const afhandelaarMap: Record<number, string> = {};
  if (afhandelaarIds.length > 0) {
    const namen = await db.select({ id: gebruikersTable.id, naam: gebruikersTable.naam })
      .from(gebruikersTable).where(eq(gebruikersTable.id, afhandelaarIds[0]!));
    namen.forEach((n) => { afhandelaarMap[n.id] = n.naam; });
  }

  res.json(rijen.map((r) => ({
    id: r.id,
    factuur_id: r.factuurId,
    gebruiker_id: r.gebruikerId ?? null,
    gebruiker_naam: r.gebruikerNaam ?? null,
    tekst: r.tekst,
    reply_op_id: r.replyOpId ?? null,
    afgehandeld: r.afgehandeld,
    afgehandeld_op: r.afgehandeldOp?.toISOString() ?? null,
    afgehandeld_door_naam: r.afgehandeldDoor ? (afhandelaarMap[r.afgehandeldDoor] ?? null) : null,
    aangemaakt_op: r.aangemaaktOp.toISOString(),
  })));
});

// ── POST /facturen/:id/opmerkingen ────────────────────────────────────────────
router.post("/facturen/:id/opmerkingen", requireBevoegdheid("financieel", 1), async (req: Request, res: Response) => {
  const id = paramInt(req.params["id"]);
  const { tekst, reply_op_id } = req.body as { tekst?: string; reply_op_id?: number };

  if (!tekst?.trim()) { res.status(400).json({ error: "tekst is verplicht" }); return; }

  const userId = sessionUserId(req);
  const [rij] = await db.insert(factuurOpmerkingenTable).values({
    factuurId: id,
    gebruikerId: userId,
    tekst: tekst.trim(),
    replyOpId: reply_op_id ?? null,
  }).returning();

  const [gebruiker] = userId
    ? await db.select({ naam: gebruikersTable.naam }).from(gebruikersTable).where(eq(gebruikersTable.id, userId)).limit(1)
    : [null];

  res.status(201).json({
    id: rij!.id,
    factuur_id: rij!.factuurId,
    gebruiker_id: rij!.gebruikerId ?? null,
    gebruiker_naam: gebruiker?.naam ?? null,
    tekst: rij!.tekst,
    reply_op_id: rij!.replyOpId ?? null,
    afgehandeld: rij!.afgehandeld,
    afgehandeld_op: null,
    afgehandeld_door_naam: null,
    aangemaakt_op: rij!.aangemaaktOp.toISOString(),
  });
});

// ── PATCH /facturen/:id/opmerkingen/:oid ──────────────────────────────────────
router.patch("/facturen/:id/opmerkingen/:oid", requireBevoegdheid("financieel", 1), async (req: Request, res: Response) => {
  const factuurId = paramInt(req.params["id"]);
  const oid = paramInt(req.params["oid"]);
  const { afgehandeld } = req.body as { afgehandeld?: boolean };

  if (typeof afgehandeld !== "boolean") { res.status(400).json({ error: "afgehandeld (boolean) is verplicht" }); return; }

  const userId = sessionUserId(req);
  const [updated] = await db.update(factuurOpmerkingenTable).set({
    afgehandeld,
    afgehandeldOp: afgehandeld ? new Date() : null,
    afgehandeldDoor: afgehandeld ? userId : null,
  }).where(and(eq(factuurOpmerkingenTable.id, oid), eq(factuurOpmerkingenTable.factuurId, factuurId))).returning();

  if (!updated) { res.status(404).json({ error: "Niet gevonden" }); return; }

  const [gebruiker] = updated.gebruikerId
    ? await db.select({ naam: gebruikersTable.naam }).from(gebruikersTable).where(eq(gebruikersTable.id, updated.gebruikerId)).limit(1)
    : [null];
  const [afhandelaar] = updated.afgehandeldDoor
    ? await db.select({ naam: gebruikersTable.naam }).from(gebruikersTable).where(eq(gebruikersTable.id, updated.afgehandeldDoor)).limit(1)
    : [null];

  res.json({
    id: updated.id,
    factuur_id: updated.factuurId,
    gebruiker_id: updated.gebruikerId ?? null,
    gebruiker_naam: gebruiker?.naam ?? null,
    tekst: updated.tekst,
    reply_op_id: updated.replyOpId ?? null,
    afgehandeld: updated.afgehandeld,
    afgehandeld_op: updated.afgehandeldOp?.toISOString() ?? null,
    afgehandeld_door_naam: afhandelaar?.naam ?? null,
    aangemaakt_op: updated.aangemaaktOp.toISOString(),
  });
});

// ── GET /facturen/:id/proceslog ───────────────────────────────────────────────
router.get("/facturen/:id/proceslog", requireBevoegdheid("financieel", 1), async (req: Request, res: Response) => {
  const id = paramInt(req.params["id"]);

  const acties = await db
    .select({
      id: accountviewExportLogsTable.id,
      actie: accountviewExportLogsTable.actie,
      status: accountviewExportLogsTable.status,
      foutmelding: accountviewExportLogsTable.foutmelding,
      exportOp: accountviewExportLogsTable.exportOp,
      gebruikerNaam: gebruikersTable.naam,
      accountviewBoekingId: accountviewExportLogsTable.accountviewBoekingId,
    })
    .from(accountviewExportLogsTable)
    .leftJoin(gebruikersTable, eq(accountviewExportLogsTable.gebruikerId, gebruikersTable.id))
    .where(eq(accountviewExportLogsTable.factuurId, id))
    .orderBy(accountviewExportLogsTable.exportOp);

  const opmerkingen = await db
    .select({
      id: factuurOpmerkingenTable.id,
      tekst: factuurOpmerkingenTable.tekst,
      replyOpId: factuurOpmerkingenTable.replyOpId,
      afgehandeld: factuurOpmerkingenTable.afgehandeld,
      aangemaaktOp: factuurOpmerkingenTable.aangemaaktOp,
      gebruikerNaam: gebruikersTable.naam,
    })
    .from(factuurOpmerkingenTable)
    .leftJoin(gebruikersTable, eq(factuurOpmerkingenTable.gebruikerId, gebruikersTable.id))
    .where(eq(factuurOpmerkingenTable.factuurId, id))
    .orderBy(factuurOpmerkingenTable.aangemaaktOp);

  const actieLabels: Record<string, string> = {
    export: "Factuur verzonden naar AccountView",
    herexport: "Herexport naar AccountView",
    afkeuren: "Factuur afgekeurd",
    accorderen: "Factuur geaccordeerd",
    pl_goedkeuren: "Projectleider goedgekeurd",
    pl_afkeuren: "Projectleider afgekeurd",
    pl_doorzetten: "Projectleider doorgezet",
    wvb_goedkeuren: "WVB goedgekeurd",
    wvb_afkeuren: "WVB afgekeurd",
    wvb_doorzetten: "WVB doorgezet",
    doorsturen_medewerker: "Doorgestuurd naar medewerker voor extra controle",
    medewerker_goedkeuren: "Medewerker heeft goedgekeurd",
    medewerker_afkeuren: "Medewerker heeft afgekeurd",
  };

  type LogRegel = {
    id: string;
    soort: string;
    omschrijving: string;
    gebruiker_naam: string | null;
    aangemaakt_op: string;
    detail: Record<string, unknown> | null;
    _ts: Date;
  };

  const regels: LogRegel[] = [];

  for (const a of acties) {
    regels.push({
      id: `actie-${a.id}`,
      soort: "actie",
      omschrijving: actieLabels[a.actie] ?? a.actie,
      gebruiker_naam: a.gebruikerNaam ?? null,
      aangemaakt_op: a.exportOp.toISOString(),
      _ts: a.exportOp,
      detail: {
        actie: a.actie,
        status: a.status,
        boeking_id: a.accountviewBoekingId ?? null,
        notitie: a.foutmelding ?? null,
      },
    });
  }

  for (const o of opmerkingen) {
    regels.push({
      id: `opmerking-${o.id}`,
      soort: "opmerking",
      omschrijving: o.tekst,
      gebruiker_naam: o.gebruikerNaam ?? null,
      aangemaakt_op: o.aangemaaktOp.toISOString(),
      _ts: o.aangemaaktOp,
      detail: {
        reply_op_id: o.replyOpId ?? null,
        afgehandeld: o.afgehandeld,
      },
    });
  }

  regels.sort((a, b) => a._ts.getTime() - b._ts.getTime());

  res.json(regels.map(({ _ts, ...r }) => r));
});

// ── POST /facturen/:id/forceer-herexport ───────────────────────────────────────
router.post("/facturen/:id/forceer-herexport", requireBevoegdheid("financieel", 4), async (req: Request, res: Response) => {
  const id = paramInt(req.params["id"]);
  const { reden } = req.body as { reden?: string };

  const [factuur] = await db.select().from(facturenTable).where(eq(facturenTable.id, id)).limit(1);
  if (!factuur) { res.status(404).json({ error: "Niet gevonden" }); return; }

  const [inst] = await db.select().from(accountviewInstellingenTable).limit(1);
  if (!inst?.apiGebruiker) { res.status(503).json({ error: "AccountView niet geconfigureerd" }); return; }

  const client = maakAccountViewClient(inst);

  const boekType = factuur.type === "verkoop" ? "verkoop" : "inkoop";
  const boeking: AccountviewBoeking = {
    dagboek: boekType === "verkoop" ? (inst.dagboekVerkoop ?? "VRK") : (inst.dagboekInkoop ?? "INK"),
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
    type: boekType,
  };

  const payloadStr = JSON.stringify(boeking);
  const payloadHash = crypto.createHash("sha256").update(payloadStr).digest("hex");

  // F0 — Idempotency guard: blokkeer herexport met identieke payload die al geslaagd is.
  // Voorkomt dubbele boeking in AccountView bij meervoudig klikken of race-condition.
  const [bestaandGelukt] = await db.select({ id: accountviewExportLogsTable.id })
    .from(accountviewExportLogsTable)
    .where(and(
      eq(accountviewExportLogsTable.factuurId, id),
      eq(accountviewExportLogsTable.payloadHash, payloadHash),
      eq(accountviewExportLogsTable.status, "geslaagd"),
    ))
    .limit(1);

  if (bestaandGelukt) {
    res.status(409).json({
      error: "Identieke herexport geblokkeerd",
      detail: "Deze factuur is al met exact dezelfde gegevens succesvol geëxporteerd. Controleer de export-logs of pas de factuurgegevens aan.",
    });
    return;
  }

  const userId = sessionUserId(req);
  const [logEntry] = await db.insert(accountviewExportLogsTable).values({
    factuurId: id,
    gebruikerId: userId,
    testmodus: inst.testmodus,
    actie: "herexport",
    verzondenPayload: boeking as unknown as Record<string, unknown>,
    payloadHash,
    status: "bezig",
  }).returning();

  const resultaat = await client.verzendBoeking(boeking);

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
      payloadHash,
      herexportOp: new Date(),
      herexportDoor: userId,
      herexportReden: reden ?? null,
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

  const [updated] = await db.select().from(facturenTable).where(eq(facturenTable.id, id)).limit(1);
  res.json({
    status: resultaat.geslaagd ? "geslaagd" : "mislukt",
    factuur_id: id,
    boeking_id: resultaat.boekingId ?? null,
    foutmelding: resultaat.foutmelding ?? null,
    testmodus: inst.testmodus,
  });
  void updated;
});

// ── POST /facturen/batch-export ────────────────────────────────────────────────
router.post("/facturen/batch-export", requireBevoegdheid("financieel", 4), async (req: Request, res: Response) => {
  const { factuur_ids } = req.body as { factuur_ids?: number[] };
  if (!Array.isArray(factuur_ids) || factuur_ids.length === 0) {
    res.status(400).json({ error: "factuur_ids is verplicht en mag niet leeg zijn" }); return;
  }

  const [inst] = await db.select().from(accountviewInstellingenTable).limit(1);
  if (!inst?.apiGebruiker) { res.status(503).json({ error: "AccountView niet geconfigureerd" }); return; }

  const client = maakAccountViewClient(inst);
  const userId = sessionUserId(req);
  const resultaten: Array<{ status: string; factuur_id: number; boeking_id: string | null; foutmelding: string | null; testmodus: boolean }> = [];

  for (const fid of factuur_ids) {
    const [factuur] = await db.select().from(facturenTable).where(eq(facturenTable.id, fid)).limit(1);
    if (!factuur) {
      resultaten.push({ status: "mislukt", factuur_id: fid, boeking_id: null, foutmelding: "Niet gevonden", testmodus: inst.testmodus });
      continue;
    }
    if (factuur.geblokkeerd || !factuur.geaccordeerd) {
      resultaten.push({ status: "mislukt", factuur_id: fid, boeking_id: null, foutmelding: "Niet akkoord of geblokkeerd", testmodus: inst.testmodus });
      continue;
    }

    const batchBoekType = factuur.type === "verkoop" ? "verkoop" : "inkoop";
    const boeking: AccountviewBoeking = {
      dagboek: batchBoekType === "verkoop" ? (inst.dagboekVerkoop ?? "VRK") : (inst.dagboekInkoop ?? "INK"),
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

    const payloadStr = JSON.stringify(boeking);
    const payloadHash = crypto.createHash("sha256").update(payloadStr).digest("hex");

    const [logEntry] = await db.insert(accountviewExportLogsTable).values({
      factuurId: fid,
      gebruikerId: userId,
      testmodus: inst.testmodus,
      actie: "export",
      verzondenPayload: boeking as unknown as Record<string, unknown>,
      payloadHash,
      status: "bezig",
    }).returning();

    const resultaat = await client.verzendBoeking(boeking);

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
        payloadHash,
        status: "verwerkt",
        bijgewerktOp: new Date(),
      }).where(eq(facturenTable.id, fid));
    } else {
      await db.update(facturenTable).set({
        accountviewStatus: "error",
        accountviewFout: resultaat.foutmelding ?? "Onbekende fout",
        status: "fout_bij_verzending",
        bijgewerktOp: new Date(),
      }).where(eq(facturenTable.id, fid));
    }

    resultaten.push({
      status: resultaat.geslaagd ? "geslaagd" : "mislukt",
      factuur_id: fid,
      boeking_id: resultaat.boekingId ?? null,
      foutmelding: resultaat.foutmelding ?? null,
      testmodus: inst.testmodus,
    });
  }

  const geslaagd = resultaten.filter((r) => r.status === "geslaagd").length;
  res.json({
    totaal: resultaten.length,
    geslaagd,
    mislukt: resultaten.length - geslaagd,
    resultaten,
  });
});

// ── GET /facturen/exportlog ────────────────────────────────────────────────────
router.get("/facturen/exportlog", requireBevoegdheid("financieel", 1), async (req: Request, res: Response) => {
  const factuurIdFilter = req.query["factuur_id"] ? paramInt(req.query["factuur_id"]) : null;
  const statusFilter = req.query["status"] ? String(req.query["status"]) : null;
  const actieFilter = req.query["actie"] ? String(req.query["actie"]) : null;
  const vanFilter = req.query["van"] ? String(req.query["van"]) : null;
  const totFilter = req.query["tot"] ? String(req.query["tot"]) : null;
  const limitFilter = req.query["limit"] ? paramInt(req.query["limit"]) : 200;

  const conditions = [];
  if (factuurIdFilter) conditions.push(eq(accountviewExportLogsTable.factuurId, factuurIdFilter));
  if (statusFilter) conditions.push(eq(accountviewExportLogsTable.status, statusFilter));
  if (actieFilter) conditions.push(eq(accountviewExportLogsTable.actie, actieFilter));
  if (vanFilter) conditions.push(gte(accountviewExportLogsTable.exportOp, new Date(vanFilter)));
  if (totFilter) conditions.push(lt(accountviewExportLogsTable.exportOp, new Date(totFilter)));

  const logs = await db.select({
    id: accountviewExportLogsTable.id,
    factuurId: accountviewExportLogsTable.factuurId,
    factuurnummer: facturenTable.factuurnummer,
    relatienaam: facturenTable.relatienaam,
    gebruikerId: accountviewExportLogsTable.gebruikerId,
    gebruikerNaam: gebruikersTable.naam,
    exportOp: accountviewExportLogsTable.exportOp,
    testmodus: accountviewExportLogsTable.testmodus,
    actie: accountviewExportLogsTable.actie,
    httpStatus: accountviewExportLogsTable.httpStatus,
    status: accountviewExportLogsTable.status,
    accountviewBoekingId: accountviewExportLogsTable.accountviewBoekingId,
    foutmelding: accountviewExportLogsTable.foutmelding,
  })
    .from(accountviewExportLogsTable)
    .leftJoin(facturenTable, eq(accountviewExportLogsTable.factuurId, facturenTable.id))
    .leftJoin(gebruikersTable, eq(accountviewExportLogsTable.gebruikerId, gebruikersTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(accountviewExportLogsTable.exportOp))
    .limit(limitFilter);

  res.json(logs.map((l) => ({
    id: l.id,
    factuur_id: l.factuurId,
    factuurnummer: l.factuurnummer ?? null,
    relatienaam: l.relatienaam ?? null,
    gebruiker_naam: l.gebruikerNaam ?? null,
    export_op: l.exportOp.toISOString(),
    testmodus: l.testmodus,
    actie: l.actie,
    status: l.status,
    accountview_boeking_id: l.accountviewBoekingId ?? null,
    foutmelding: l.foutmelding ?? null,
    http_status: l.httpStatus ?? null,
  })));
});

// ── F1: Factuurregels CRUD ─────────────────────────────────────────────────────
// GET /facturen/:id/regels
router.get("/facturen/:id/regels", requireBevoegdheid("financieel", 1), async (req: Request, res: Response) => {
  const id = paramInt(req.params["id"]);
  const regels = await db.select().from(factuurRegelsTable)
    .where(eq(factuurRegelsTable.factuurId, id))
    .orderBy(factuurRegelsTable.regelnummer);
  res.json(regels.map((r) => ({
    id: r.id,
    factuur_id: r.factuurId,
    regelnummer: r.regelnummer,
    omschrijving: r.omschrijving,
    hoeveelheid: r.hoeveelheid,
    eenheid: r.eenheid,
    stukprijs: r.stukprijs,
    bedrag_excl_btw: r.bedragExclBtw,
    btw_code: r.btwCode,
    btw_percentage: r.btwPercentage,
    btw_bedrag: r.btwBedrag,
    grootboekrekening: r.grootboekrekening,
    kostenplaats: r.kostenplaats,
    categorie: r.categorie,
    inkoopbon_regel_id: r.inkoopbonRegelId,
    bron: r.bron,
    ai_vertrouwen: r.aiVertrouwen,
    aangemaakt_op: r.aangemaaktOp.toISOString(),
    bijgewerkt_op: r.bijgewerktOp.toISOString(),
  })));
});

// POST /facturen/:id/regels
router.post("/facturen/:id/regels", requireBevoegdheid("financieel", 2), async (req: Request, res: Response) => {
  const factuurId = paramInt(req.params["id"]);
  const [factuur] = await db.select({ id: facturenTable.id }).from(facturenTable)
    .where(eq(facturenTable.id, factuurId)).limit(1);
  if (!factuur) { res.status(404).json({ error: "Factuur niet gevonden" }); return; }

  const body = req.body as {
    omschrijving?: string; regelnummer?: number; hoeveelheid?: number; eenheid?: string;
    stukprijs?: string; bedrag_excl_btw?: string; btw_code?: string; btw_percentage?: number;
    btw_bedrag?: string; grootboekrekening?: string; kostenplaats?: string; categorie?: string;
    inkoopbon_regel_id?: number; bron?: string;
  };
  if (!body.omschrijving?.trim()) {
    res.status(400).json({ error: "omschrijving is verplicht" }); return;
  }

  // Volgende regelnummer bepalen
  const [maxRegel] = await db.select({ max: sql<number>`MAX(regelnummer)` })
    .from(factuurRegelsTable).where(eq(factuurRegelsTable.factuurId, factuurId));
  const volgendNummer = (maxRegel?.max ?? 0) + 1;

  const [rij] = await db.insert(factuurRegelsTable).values({
    factuurId,
    regelnummer: body.regelnummer ?? volgendNummer,
    omschrijving: body.omschrijving.trim(),
    hoeveelheid: body.hoeveelheid ?? null,
    eenheid: body.eenheid ?? null,
    stukprijs: body.stukprijs ?? null,
    bedragExclBtw: body.bedrag_excl_btw ?? null,
    btwCode: body.btw_code ?? null,
    btwPercentage: body.btw_percentage ?? null,
    btwBedrag: body.btw_bedrag ?? null,
    grootboekrekening: body.grootboekrekening ?? null,
    kostenplaats: body.kostenplaats ?? null,
    categorie: body.categorie ?? null,
    inkoopbonRegelId: body.inkoopbon_regel_id ?? null,
    bron: body.bron ?? "handmatig",
  }).returning();
  res.status(201).json({ id: rij.id, factuur_id: rij.factuurId, regelnummer: rij.regelnummer });
});

// PATCH /facturen/:id/regels/:rid
router.patch("/facturen/:id/regels/:rid", requireBevoegdheid("financieel", 2), async (req: Request, res: Response) => {
  const factuurId = paramInt(req.params["id"]);
  const rid = paramInt(req.params["rid"]);
  const [rij] = await db.select().from(factuurRegelsTable)
    .where(and(eq(factuurRegelsTable.id, rid), eq(factuurRegelsTable.factuurId, factuurId))).limit(1);
  if (!rij) { res.status(404).json({ error: "Regel niet gevonden" }); return; }

  const body = req.body as Record<string, unknown>;
  const update: Partial<typeof factuurRegelsTable.$inferInsert> = { bijgewerktOp: new Date() };
  if ("omschrijving" in body) update.omschrijving = body["omschrijving"] as string;
  if ("regelnummer" in body) update.regelnummer = body["regelnummer"] as number;
  if ("hoeveelheid" in body) update.hoeveelheid = body["hoeveelheid"] as number | null;
  if ("eenheid" in body) update.eenheid = body["eenheid"] as string | null;
  if ("stukprijs" in body) update.stukprijs = body["stukprijs"] as string | null;
  if ("bedrag_excl_btw" in body) update.bedragExclBtw = body["bedrag_excl_btw"] as string | null;
  if ("btw_code" in body) update.btwCode = body["btw_code"] as string | null;
  if ("btw_percentage" in body) update.btwPercentage = body["btw_percentage"] as number | null;
  if ("btw_bedrag" in body) update.btwBedrag = body["btw_bedrag"] as string | null;
  if ("grootboekrekening" in body) update.grootboekrekening = body["grootboekrekening"] as string | null;
  if ("kostenplaats" in body) update.kostenplaats = body["kostenplaats"] as string | null;
  if ("categorie" in body) update.categorie = body["categorie"] as string | null;
  if ("inkoopbon_regel_id" in body) update.inkoopbonRegelId = body["inkoopbon_regel_id"] as number | null;

  const [updated] = await db.update(factuurRegelsTable).set(update)
    .where(eq(factuurRegelsTable.id, rid)).returning();
  res.json({ id: updated.id, bijgewerkt_op: updated.bijgewerktOp.toISOString() });
});

// DELETE /facturen/:id/regels/:rid
router.delete("/facturen/:id/regels/:rid", requireBevoegdheid("financieel", 2), async (req: Request, res: Response) => {
  const factuurId = paramInt(req.params["id"]);
  const rid = paramInt(req.params["rid"]);
  const [rij] = await db.select({ id: factuurRegelsTable.id }).from(factuurRegelsTable)
    .where(and(eq(factuurRegelsTable.id, rid), eq(factuurRegelsTable.factuurId, factuurId))).limit(1);
  if (!rij) { res.status(404).json({ error: "Regel niet gevonden" }); return; }
  await db.delete(factuurRegelsTable).where(eq(factuurRegelsTable.id, rid));
  res.status(204).end();
});

// ── F1: Factuur-termijnen CRUD (termijnschema per opdracht) ──────────────────
// GET /opdrachten/:opdrachtId/factuur-termijnen
router.get("/opdrachten/:opdrachtId/factuur-termijnen", requireBevoegdheid("financieel", 1), async (req: Request, res: Response) => {
  const opdrachtId = paramInt(req.params["opdrachtId"]);
  const termijnen = await db.select().from(factuurTermijnenTable)
    .where(eq(factuurTermijnenTable.opdrachtId, opdrachtId))
    .orderBy(factuurTermijnenTable.volgnummer);
  res.json(termijnen.map((t) => ({
    id: t.id,
    opdracht_id: t.opdrachtId,
    volgnummer: t.volgnummer,
    omschrijving: t.omschrijving,
    percentage: t.percentage,
    bedrag: t.bedrag,
    status: t.status,
    factuur_id: t.factuurId,
    vervaldatum: t.vervaldatum,
    aangemaakt_op: t.aangemaaktOp.toISOString(),
    bijgewerkt_op: t.bijgewerktOp.toISOString(),
  })));
});

// POST /opdrachten/:opdrachtId/factuur-termijnen
router.post("/opdrachten/:opdrachtId/factuur-termijnen", requireBevoegdheid("financieel", 2), async (req: Request, res: Response) => {
  const opdrachtId = paramInt(req.params["opdrachtId"]);
  const body = req.body as {
    volgnummer?: number; omschrijving?: string; percentage?: number;
    bedrag?: string; status?: string; vervaldatum?: string;
  };

  const [maxTermijn] = await db.select({ max: sql<number>`MAX(volgnummer)` })
    .from(factuurTermijnenTable).where(eq(factuurTermijnenTable.opdrachtId, opdrachtId));

  const [rij] = await db.insert(factuurTermijnenTable).values({
    opdrachtId,
    volgnummer: body.volgnummer ?? (maxTermijn?.max ?? 0) + 1,
    omschrijving: body.omschrijving ?? null,
    percentage: body.percentage ?? null,
    bedrag: body.bedrag ?? null,
    status: body.status ?? "gepland",
    vervaldatum: body.vervaldatum ?? null,
  }).returning();
  res.status(201).json({ id: rij.id, opdracht_id: rij.opdrachtId, volgnummer: rij.volgnummer });
});

// PATCH /opdrachten/:opdrachtId/factuur-termijnen/:tid
router.patch("/opdrachten/:opdrachtId/factuur-termijnen/:tid", requireBevoegdheid("financieel", 2), async (req: Request, res: Response) => {
  const opdrachtId = paramInt(req.params["opdrachtId"]);
  const tid = paramInt(req.params["tid"]);
  const [rij] = await db.select().from(factuurTermijnenTable)
    .where(and(eq(factuurTermijnenTable.id, tid), eq(factuurTermijnenTable.opdrachtId, opdrachtId))).limit(1);
  if (!rij) { res.status(404).json({ error: "Termijn niet gevonden" }); return; }

  const body = req.body as Record<string, unknown>;
  const update: Partial<typeof factuurTermijnenTable.$inferInsert> = { bijgewerktOp: new Date() };
  if ("omschrijving" in body) update.omschrijving = body["omschrijving"] as string | null;
  if ("percentage" in body) update.percentage = body["percentage"] as number | null;
  if ("bedrag" in body) update.bedrag = body["bedrag"] as string | null;
  if ("status" in body) update.status = body["status"] as string;
  if ("vervaldatum" in body) update.vervaldatum = body["vervaldatum"] as string | null;
  if ("factuur_id" in body) update.factuurId = body["factuur_id"] as number | null;

  const [updated] = await db.update(factuurTermijnenTable).set(update)
    .where(eq(factuurTermijnenTable.id, tid)).returning();
  res.json({ id: updated.id, status: updated.status, bijgewerkt_op: updated.bijgewerktOp.toISOString() });
});

// ── GET /facturen/financieel-dashboard ────────────────────────────────────────
router.get("/facturen/financieel-dashboard", requireBevoegdheid("financieel", 1), async (req: Request, res: Response) => {
  const [totalen] = await db.select({
    totaal: count(),
  }).from(facturenTable);

  const [inkoop] = await db.select({ n: count() }).from(facturenTable).where(eq(facturenTable.type, "inkoop"));
  const [verkoop] = await db.select({ n: count() }).from(facturenTable).where(eq(facturenTable.type, "verkoop"));
  const [klaarExport] = await db.select({ n: count() }).from(facturenTable)
    .where(and(eq(facturenTable.status, "klaar_voor_accountview"), eq(facturenTable.geblokkeerd, false)));
  const [afgekeurde] = await db.select({ n: count() }).from(facturenTable).where(eq(facturenTable.status, "afgekeurd"));
  const [betaalde] = await db.select({ n: count() }).from(facturenTable).where(eq(facturenTable.betaalstatus, "betaald"));

  const [openBedragRow] = await db.select({
    totaal: sum(facturenTable.bedragInclBtw),
  }).from(facturenTable).where(
    and(ne(facturenTable.betaalstatus, "betaald"), ne(facturenTable.status, "afgekeurd"))
  );

  const vandaagStart = new Date(); vandaagStart.setHours(0, 0, 0, 0);
  const maandStart = new Date(); maandStart.setDate(1); maandStart.setHours(0, 0, 0, 0);

  const [exportsVandaag] = await db.select({ n: count() }).from(accountviewExportLogsTable)
    .where(gte(accountviewExportLogsTable.exportOp, vandaagStart));
  const [exportsMaand] = await db.select({ n: count() }).from(accountviewExportLogsTable)
    .where(gte(accountviewExportLogsTable.exportOp, maandStart));

  const [laastExport] = await db.select({ op: accountviewExportLogsTable.exportOp })
    .from(accountviewExportLogsTable).orderBy(desc(accountviewExportLogsTable.exportOp)).limit(1);

  const [exportFouten] = await db.select({ n: count() }).from(facturenTable)
    .where(eq(facturenTable.accountviewStatus, "error"));

  res.json({
    facturen_totaal: totalen?.totaal ?? 0,
    inkoop_totaal: inkoop?.n ?? 0,
    verkoop_totaal: verkoop?.n ?? 0,
    klaar_voor_export: klaarExport?.n ?? 0,
    afgekeurd: afgekeurde?.n ?? 0,
    betaald: betaalde?.n ?? 0,
    open_bedrag: openBedragRow?.totaal ?? "0",
    exports_vandaag: exportsVandaag?.n ?? 0,
    exports_deze_maand: exportsMaand?.n ?? 0,
    laatste_export_op: laastExport?.op?.toISOString() ?? null,
    export_fouten_open: exportFouten?.n ?? 0,
  });
});

export default router;
