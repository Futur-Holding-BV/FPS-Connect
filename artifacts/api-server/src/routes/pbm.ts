import { Router } from "express";
import { db } from "@workspace/db";
import {
  pbmItemsTable,
  pbmInspectiesTable,
  veiligheidsmiddelenTable,
  veiligheidsmiddelInspectiesTable,
  medewerkersTable,
  gebruikersTable,
} from "@workspace/db";
import { eq, desc, and, or, lte, sql, isNotNull } from "drizzle-orm";
import { requireAuth, requireBevoegdheid } from "../middlewares/auth.js";
import { aiGateway, heeftGateway } from "../lib/aiGateway";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { logger } from "../lib/logger.js";
import { randomUUID } from "crypto";

const router = Router();
router.use(requireAuth);

const svc = new ObjectStorageService();

const lezenPbm   = requireBevoegdheid("toolbox", 1);
const schrijvenPbm = requireBevoegdheid("toolbox", 2);

// ── helpers ────────────────────────────────────────────────────────────────

function mapItem(row: Record<string, unknown>) {
  return {
    id: row.id,
    medewerkerId: row.medewerker_id,
    medewerkerNaam: row.medewerker_naam,
    type: row.type,
    merk: row.merk,
    model: row.model,
    maat: row.maat,
    serienummer: row.serienummer,
    uitgifteDatum: row.uitgifte_datum,
    vervangingsDatum: row.vervangings_datum,
    garantietermijn: row.garantietermijn,
    fabrikant: row.fabrikant,
    handleidingPad: row.handleiding_pad,
    keuringsIntervalMaanden: row.keurings_interval_maanden,
    laatsteControle: row.laatste_controle,
    status: row.status,
    fotoPaden: row.foto_paden as string[],
    opmerkingen: row.opmerkingen,
    qrCode: row.qr_code,
    aangemaaktOp: row.aangemaakt_op,
    bijgewerktOp: row.bijgewerkt_op,
  };
}

function mapInspectie(row: Record<string, unknown>) {
  return {
    id: row.id,
    pbmItemId: row.pbm_item_id,
    medewerkerId: row.medewerker_id,
    datum: row.datum,
    fotoPaden: row.foto_paden as string[],
    aiBeoordeling: row.ai_beoordeling,
    aiAanbeveling: row.ai_aanbeveling,
    aiSlijtage: row.ai_slijtage,
    aiKeurNodig: row.ai_keur_nodig,
    formeleStatus: row.formele_status,
    beoordeeldDoorNaam: row.beoordeeld_door_naam,
    opmerkingen: row.opmerkingen,
    aangemaaktOp: row.aangemaakt_op,
    bijgewerktOp: row.bijgewerkt_op,
  };
}

function mapMiddel(row: Record<string, unknown>) {
  return {
    id: row.id,
    type: row.type,
    naam: row.naam,
    merk: row.merk,
    model: row.model,
    serienummer: row.serienummer,
    locatie: row.locatie,
    eigenaarId: row.eigenaar_id,
    eigenaarNaam: row.eigenaar_naam,
    keuringsIntervalMaanden: row.keurings_interval_maanden,
    aanschafDatum: row.aanschaf_datum,
    vervangingsDatum: row.vervangings_datum,
    status: row.status,
    fotoPaden: row.foto_paden as string[],
    handleidingPad: row.handleiding_pad,
    opmerkingen: row.opmerkingen,
    qrCode: row.qr_code,
    aangemaaktOp: row.aangemaakt_op,
    bijgewerktOp: row.bijgewerkt_op,
  };
}

// Foto ophalen als data-URL voor vision
async function fotoNaarDataUrl(objectPath: string): Promise<string | null> {
  try {
    const genorm = svc.normalizeObjectEntityPath(objectPath);
    const file = await svc.getObjectEntityFile(genorm);
    const stream = file.createReadStream();
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      stream.on("data", (c: Buffer) => chunks.push(c));
      stream.on("end", resolve);
      stream.on("error", reject);
    });
    const buf = Buffer.concat(chunks);
    let ct = "image/jpeg";
    try {
      const [md] = await file.getMetadata();
      if (md.contentType && String(md.contentType).startsWith("image/")) ct = String(md.contentType);
    } catch { /* valt terug op jpeg */ }
    return `data:${ct};base64,${buf.toString("base64")}`;
  } catch (err) {
    logger.warn({ err, objectPath }, "PBM: foto ophalen voor AI mislukt");
    return null;
  }
}

// AI: slijtage-labels per PBM-type
const SLIJTAGE_AANDACHTSPUNTEN: Record<string, string> = {
  veiligheidsschoenen:
    "afgesleten profielzool, loslatende zool, beschadigde veiligheidsneus, scheuren in het bovenleer, ernstige slijtage",
  helm: "scheuren, beschadigingen, vervorming, verkleuring, UV-veroudering, ontbrekende onderdelen",
  harnas:
    "beschadigde stiknaden, rafels, beschadigde banden, vervormde of gecorrodeerde karabiners, gebarsten stiksels",
  vallijn:
    "beschadigde mantel, knikken in de kern, corrosie aan verbindingen, beschadigde karabiners",
  positioneringslijn:
    "beschadigde mantel, corrosie, knikken, beschadigde aanhaakpunten",
  veiligheidsbril:
    "krassen op de lenzen, beschadigde montuur, verkleurde of beperkte coating",
  gehoorbescherming:
    "beschadigde kussens, verhard schuim, gebarsten oorkappen, beschadigde band",
  adembescherming:
    "beschadigde afdichtring, beschadigde filters, barsten of deformatie van het masker",
  handschoenen:
    "scheuren, gaten, doorgedragen plekken, afgebroken of beschadigde seams",
  werkkleding:
    "scheuren, ernstige slijtage, beschadigde reflectiestrepen, ontbrekende sluiting",
};

// ── GET /pbm/items ─────────────────────────────────────────────────────────
router.get("/pbm/items", lezenPbm, async (req, res): Promise<void> => {
  const sess = { gebruikerId: req.session.userId, rol: req.session.rol };
  const { medewerker_id, status } = req.query;

  const rows = await db
    .select()
    .from(pbmItemsTable)
    .where(
      and(
        medewerker_id ? eq(pbmItemsTable.medewerkerId, Number(medewerker_id)) : undefined,
        status ? eq(pbmItemsTable.status, String(status)) : undefined
      )
    )
    .orderBy(desc(pbmItemsTable.aangemaaktOp));

  res.json(rows.map(r => mapItem(r as unknown as Record<string, unknown>)));
});

// ── GET /pbm/items/eigen ────────────────────────────────────────────────────
router.get("/pbm/items/eigen", async (req, res): Promise<void> => {
  const sessieUserId = req.session.userId;
  if (!sessieUserId) return void res.status(401).json({ error: "Niet ingelogd" });

  const medewerker = await db
    .select({ id: medewerkersTable.id })
    .from(medewerkersTable)
    .where(eq(medewerkersTable.gebruikerId, sessieUserId))
    .limit(1);

  if (!medewerker[0]) return void res.json([]);

  const rows = await db
    .select()
    .from(pbmItemsTable)
    .where(eq(pbmItemsTable.medewerkerId, medewerker[0].id))
    .orderBy(pbmItemsTable.type);

  res.json(rows.map(r => mapItem(r as unknown as Record<string, unknown>)));
});

// ── POST /pbm/items ─────────────────────────────────────────────────────────
router.post("/pbm/items", schrijvenPbm, async (req, res): Promise<void> => {
  const sessieUserId = req.session.userId;
  const body = req.body as {
    medewerkerId?: number;
    medewerkerNaam?: string;
    type: string;
    merk?: string;
    model?: string;
    maat?: string;
    serienummer?: string;
    uitgifteDatum?: string;
    vervangingsDatum?: string;
    garantietermijn?: string;
    fabrikant?: string;
    keuringsIntervalMaanden?: number;
    status?: string;
    opmerkingen?: string;
  };

  if (!body.type) return void res.status(400).json({ error: "type is verplicht" });

  const qrCode = randomUUID();
  const [row] = await db
    .insert(pbmItemsTable)
    .values({
      medewerkerId: body.medewerkerId,
      medewerkerNaam: body.medewerkerNaam,
      type: body.type,
      merk: body.merk,
      model: body.model,
      maat: body.maat,
      serienummer: body.serienummer,
      uitgifteDatum: body.uitgifteDatum,
      vervangingsDatum: body.vervangingsDatum,
      garantietermijn: body.garantietermijn,
      fabrikant: body.fabrikant,
      keuringsIntervalMaanden: body.keuringsIntervalMaanden,
      status: body.status ?? "actief",
      opmerkingen: body.opmerkingen,
      qrCode,
      uitgeleendDoorId: sessieUserId,
      bijgewerktOp: new Date(),
    })
    .returning();

  res.status(201).json(mapItem(row as unknown as Record<string, unknown>));
});

// ── GET /pbm/items/:id ──────────────────────────────────────────────────────
router.get("/pbm/items/:id", lezenPbm, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) return void res.status(400).json({ error: "Ongeldig id" });

  const rows = await db.select().from(pbmItemsTable).where(eq(pbmItemsTable.id, id)).limit(1);
  if (!rows[0]) return void res.status(404).json({ error: "Niet gevonden" });

  const inspecties = await db
    .select()
    .from(pbmInspectiesTable)
    .where(eq(pbmInspectiesTable.pbmItemId, id))
    .orderBy(desc(pbmInspectiesTable.datum));

  res.json({
    ...mapItem(rows[0] as unknown as Record<string, unknown>),
    inspecties: inspecties.map(r => mapInspectie(r as unknown as Record<string, unknown>)),
  });
});

// ── PATCH /pbm/items/:id ────────────────────────────────────────────────────
router.patch("/pbm/items/:id", schrijvenPbm, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) return void res.status(400).json({ error: "Ongeldig id" });

  const body = req.body as Partial<{
    merk: string; model: string; maat: string; serienummer: string;
    uitgifteDatum: string; vervangingsDatum: string; garantietermijn: string;
    fabrikant: string; keuringsIntervalMaanden: number; laatsteControle: string;
    status: string; opmerkingen: string; fotoPaden: string[];
  }>;

  const [row] = await db
    .update(pbmItemsTable)
    .set({ ...body, bijgewerktOp: new Date() })
    .where(eq(pbmItemsTable.id, id))
    .returning();

  if (!row) return void res.status(404).json({ error: "Niet gevonden" });
  res.json(mapItem(row as unknown as Record<string, unknown>));
});

// ── DELETE /pbm/items/:id ───────────────────────────────────────────────────
router.delete("/pbm/items/:id", schrijvenPbm, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) return void res.status(400).json({ error: "Ongeldig id" });
  await db.delete(pbmItemsTable).where(eq(pbmItemsTable.id, id));
  res.status(204).end();
});

// ── POST /pbm/items/:id/inspecties ──────────────────────────────────────────
router.post("/pbm/items/:id/inspecties", schrijvenPbm, async (req, res): Promise<void> => {
  const pbmItemId = parseInt(String(req.params.id), 10);
  if (isNaN(pbmItemId)) return void res.status(400).json({ error: "Ongeldig id" });

  const sessieUserId = req.session.userId;
  const body = req.body as {
    datum?: string;
    fotoPaden?: string[];
    formeleStatus?: string;
    opmerkingen?: string;
    beoordeeldDoorNaam?: string;
  };

  const datum = body.datum ?? new Date().toISOString().slice(0, 10);

  const [row] = await db
    .insert(pbmInspectiesTable)
    .values({
      pbmItemId,
      datum,
      fotoPaden: body.fotoPaden ?? [],
      formeleStatus: body.formeleStatus ?? "in_behandeling",
      opmerkingen: body.opmerkingen,
      beoordeeldDoorId: sessieUserId,
      beoordeeldDoorNaam: body.beoordeeldDoorNaam,
      bijgewerktOp: new Date(),
    })
    .returning();

  await db
    .update(pbmItemsTable)
    .set({ laatsteControle: datum, bijgewerktOp: new Date() })
    .where(eq(pbmItemsTable.id, pbmItemId));

  res.status(201).json(mapInspectie(row as unknown as Record<string, unknown>));
});

// ── POST /pbm/items/:id/foto-inspectie ──────────────────────────────────────
// AI beoordeelt foto's op slijtage — geeft NOOIT een formele goed-/afkeuring
router.post("/pbm/items/:id/foto-inspectie", schrijvenPbm, async (req, res): Promise<void> => {
  const pbmItemId = parseInt(String(req.params.id), 10);
  if (isNaN(pbmItemId)) return void res.status(400).json({ error: "Ongeldig id" });

  if (!heeftGateway()) return void res.status(503).json({ error: "AI niet beschikbaar" });

  const body = req.body as { fotoPaden?: string[]; pbmType?: string };
  if (!body.fotoPaden?.length) return void res.status(400).json({ error: "Minimaal één foto vereist" });

  const items = await db
    .select()
    .from(pbmItemsTable)
    .where(eq(pbmItemsTable.id, pbmItemId))
    .limit(1);
  const pbmType = body.pbmType ?? (items[0]?.type as string) ?? "pbm";
  const aandachtspunten = SLIJTAGE_AANDACHTSPUNTEN[pbmType.toLowerCase()] ??
    "zichtbare beschadigingen, slijtage, scheuren of deformatie";

  type VisionContent =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail: "low" | "high" } };

  const content: VisionContent[] = [];

  // Max 3 foto's meesturen
  for (const pad of body.fotoPaden.slice(0, 3)) {
    const dataUrl = await fotoNaarDataUrl(pad);
    if (dataUrl) content.push({ type: "image_url", image_url: { url: dataUrl, detail: "low" } });
  }

  if (!content.length) {
    return void res.status(422).json({ error: "Foto's konden niet worden opgehaald" });
  }

  content.push({
    type: "text",
    text: `Je bent een PBM-inspectie-assistent. Beoordeel de foto('s) van dit PBM: "${pbmType}".

Let specifiek op: ${aandachtspunten}.

BELANGRIJK: je geeft uitsluitend een advies. Je geeft nooit een formele goed- of afkeuring.
De formele beoordeling blijft altijd de verantwoordelijkheid van een bevoegde medewerker.

Geef je antwoord als JSON met exact deze velden:
{
  "beoordeling": "beknopte objectieve beschrijving van wat je ziet (max 2 zinnen)",
  "aanbeveling": "concreet advies: wat te doen (max 2 zinnen)",
  "slijtage": "geen" | "licht" | "matig" | "ernstig",
  "keur_nodig": true | false
}

Antwoord ALLEEN met het JSON-object, geen extra tekst.`,
  });

  try {
    const pbmChatResultaat = await aiGateway.chat("default", {
      max_tokens: 400,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: [{ role: "user", content } as any],
    }, undefined, {
      module: "pbm",
      functie: "fotoInspectie",
      gebruikerId: req.session.userId ?? null,
      promptNaam: "pbm-foto-inspectie",
      promptVersie: "1.0.0",
    });

    const raw = pbmChatResultaat.ok ? pbmChatResultaat.inhoud : "";
    let parsed: { beoordeling: string; aanbeveling: string; slijtage: string; keur_nodig: boolean };
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch?.[0] ?? raw);
    } catch {
      return void res.status(422).json({ error: "AI gaf geen geldig antwoord", raw });
    }

    const datum = new Date().toISOString().slice(0, 10);
    const sessieUserId = req.session.userId;

    const [inspectie] = await db
      .insert(pbmInspectiesTable)
      .values({
        pbmItemId,
        datum,
        fotoPaden: body.fotoPaden ?? [],
        aiBeoordeling: parsed.beoordeling,
        aiAanbeveling: parsed.aanbeveling,
        aiSlijtage: parsed.slijtage ?? "onbekend",
        aiKeurNodig: Boolean(parsed.keur_nodig),
        formeleStatus: "in_behandeling",
        beoordeeldDoorId: sessieUserId,
        bijgewerktOp: new Date(),
      })
      .returning();

    await db
      .update(pbmItemsTable)
      .set({ laatsteControle: datum, bijgewerktOp: new Date() })
      .where(eq(pbmItemsTable.id, pbmItemId));

    res.json({
      inspectie: mapInspectie(inspectie as unknown as Record<string, unknown>),
      beoordeling: parsed.beoordeling,
      aanbeveling: parsed.aanbeveling,
      slijtage: parsed.slijtage,
      keurNodig: parsed.keur_nodig,
    });
  } catch (err) {
    logger.error({ err }, "PBM foto-inspectie AI fout");
    res.status(500).json({ error: "AI-analyse mislukt" });
  }
});

// ── GET /pbm/middelen ───────────────────────────────────────────────────────
router.get("/pbm/middelen", lezenPbm, async (req, res): Promise<void> => {
  const { type, status } = req.query;
  const rows = await db
    .select()
    .from(veiligheidsmiddelenTable)
    .where(
      and(
        type ? eq(veiligheidsmiddelenTable.type, String(type)) : undefined,
        status ? eq(veiligheidsmiddelenTable.status, String(status)) : undefined
      )
    )
    .orderBy(veiligheidsmiddelenTable.naam);

  res.json(rows.map(r => mapMiddel(r as unknown as Record<string, unknown>)));
});

// ── POST /pbm/middelen ──────────────────────────────────────────────────────
router.post("/pbm/middelen", schrijvenPbm, async (req, res): Promise<void> => {
  const sessieUserId = req.session.userId;
  const body = req.body as {
    type: string; naam: string; merk?: string; model?: string;
    serienummer?: string; locatie?: string; eigenaarNaam?: string;
    keuringsIntervalMaanden?: number; aanschafDatum?: string;
    vervangingsDatum?: string; opmerkingen?: string;
  };

  if (!body.type || !body.naam) return void res.status(400).json({ error: "type en naam zijn verplicht" });

  const qrCode = randomUUID();
  const [row] = await db
    .insert(veiligheidsmiddelenTable)
    .values({
      ...body,
      qrCode,
      eigenaarId: sessieUserId,
      eigenaarNaam: body.eigenaarNaam,
      bijgewerktOp: new Date(),
    })
    .returning();

  res.status(201).json(mapMiddel(row as unknown as Record<string, unknown>));
});

// ── GET /pbm/middelen/:id ───────────────────────────────────────────────────
router.get("/pbm/middelen/:id", lezenPbm, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) return void res.status(400).json({ error: "Ongeldig id" });

  const rows = await db.select().from(veiligheidsmiddelenTable).where(eq(veiligheidsmiddelenTable.id, id)).limit(1);
  if (!rows[0]) return void res.status(404).json({ error: "Niet gevonden" });

  const inspecties = await db
    .select()
    .from(veiligheidsmiddelInspectiesTable)
    .where(eq(veiligheidsmiddelInspectiesTable.middelId, id))
    .orderBy(desc(veiligheidsmiddelInspectiesTable.datum));

  res.json({
    ...mapMiddel(rows[0] as unknown as Record<string, unknown>),
    inspecties: inspecties.map(r => ({
      id: r.id,
      datum: r.datum,
      bevindingen: r.bevindingen,
      aiBeoordeling: r.aiBeoordeling,
      aiAanbeveling: r.aiAanbeveling,
      aiKeurNodig: r.aiKeurNodig,
      formeleStatus: r.formeleStatus,
      beoordeeldDoorNaam: r.beoordeeldDoorNaam,
      aangemaaktOp: r.aangemaaktOp,
    })),
  });
});

// ── PATCH /pbm/middelen/:id ─────────────────────────────────────────────────
router.patch("/pbm/middelen/:id", schrijvenPbm, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) return void res.status(400).json({ error: "Ongeldig id" });

  const body = req.body as Partial<{
    naam: string; merk: string; model: string; serienummer: string;
    locatie: string; keuringsIntervalMaanden: number; aanschafDatum: string;
    vervangingsDatum: string; status: string; opmerkingen: string;
    eigenaarNaam: string;
  }>;

  const [row] = await db
    .update(veiligheidsmiddelenTable)
    .set({ ...body, bijgewerktOp: new Date() })
    .where(eq(veiligheidsmiddelenTable.id, id))
    .returning();

  if (!row) return void res.status(404).json({ error: "Niet gevonden" });
  res.json(mapMiddel(row as unknown as Record<string, unknown>));
});

// ── POST /pbm/middelen/:id/inspecties ───────────────────────────────────────
router.post("/pbm/middelen/:id/inspecties", schrijvenPbm, async (req, res): Promise<void> => {
  const middelId = parseInt(String(req.params.id), 10);
  if (isNaN(middelId)) return void res.status(400).json({ error: "Ongeldig id" });

  const sessieUserId = req.session.userId;
  const body = req.body as {
    datum?: string; fotoPaden?: string[]; bevindingen?: string;
    formeleStatus?: string; beoordeeldDoorNaam?: string;
  };

  const [row] = await db
    .insert(veiligheidsmiddelInspectiesTable)
    .values({
      middelId,
      datum: body.datum ?? new Date().toISOString().slice(0, 10),
      fotoPaden: body.fotoPaden ?? [],
      bevindingen: body.bevindingen,
      formeleStatus: body.formeleStatus ?? "in_behandeling",
      beoordeeldDoorId: sessieUserId,
      beoordeeldDoorNaam: body.beoordeeldDoorNaam,
      bijgewerktOp: new Date(),
    })
    .returning();

  res.status(201).json(row);
});

// ── GET /pbm/dashboard ──────────────────────────────────────────────────────
router.get("/pbm/dashboard", lezenPbm, async (req, res): Promise<void> => {
  const vandaag = new Date().toISOString().slice(0, 10);
  const over30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const [
    totalePbm,
    afgekeurde,
    vervangingNodig,
    openInspecties,
    totalMiddelen,
    afgekeurdeMiddelen,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(pbmItemsTable),
    db.select({ count: sql<number>`count(*)` }).from(pbmItemsTable)
      .where(eq(pbmItemsTable.status, "afgekeurd")),
    db.select({ count: sql<number>`count(*)` }).from(pbmItemsTable)
      .where(and(isNotNull(pbmItemsTable.vervangingsDatum), lte(pbmItemsTable.vervangingsDatum, over30))),
    db.select({ count: sql<number>`count(*)` }).from(pbmInspectiesTable)
      .where(eq(pbmInspectiesTable.formeleStatus, "in_behandeling")),
    db.select({ count: sql<number>`count(*)` }).from(veiligheidsmiddelenTable),
    db.select({ count: sql<number>`count(*)` }).from(veiligheidsmiddelenTable)
      .where(eq(veiligheidsmiddelenTable.status, "afgekeurd")),
  ]);

  const binnenkortVervangen = await db
    .select()
    .from(pbmItemsTable)
    .where(and(isNotNull(pbmItemsTable.vervangingsDatum), lte(pbmItemsTable.vervangingsDatum, over30)))
    .orderBy(pbmItemsTable.vervangingsDatum)
    .limit(10);

  const openInspectiesLijst = await db
    .select()
    .from(pbmInspectiesTable)
    .where(eq(pbmInspectiesTable.formeleStatus, "in_behandeling"))
    .orderBy(desc(pbmInspectiesTable.aangemaaktOp))
    .limit(10);

  res.json({
    statistieken: {
      totalePbm: Number(totalePbm[0]?.count ?? 0),
      afgekeurde: Number(afgekeurde[0]?.count ?? 0),
      vervangingNodig: Number(vervangingNodig[0]?.count ?? 0),
      openInspecties: Number(openInspecties[0]?.count ?? 0),
      totalMiddelen: Number(totalMiddelen[0]?.count ?? 0),
      afgekeurdeMiddelen: Number(afgekeurdeMiddelen[0]?.count ?? 0),
    },
    binnenkortVervangen: binnenkortVervangen.map(r => mapItem(r as unknown as Record<string, unknown>)),
    openInspectiesLijst: openInspectiesLijst.map(r => mapInspectie(r as unknown as Record<string, unknown>)),
  });
});

export { router as pbmRouter };
