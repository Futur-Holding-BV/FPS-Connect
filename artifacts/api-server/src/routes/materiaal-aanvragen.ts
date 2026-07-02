// Materiaal Aanvragen — monteur meldt artikel (op/beschadigd/nodig) via foto
// AI herkent artikel, prijs, leverancier en toetst aan werkbegroting scope
import { Router } from "express";
import {
  db,
  materiaalAanvragenTable,
  opdrachtenTable,
  projectBegrotingenTable,
  werkbegrotingRegelsTable,
  gebruikersTable,
  planningItemsTable,
} from "@workspace/db";
import { eq, and, desc, asc, inArray } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { ObjectStorageService } from "../lib/objectStorage";
import { maakOpenAiClient, heeftOpenAi } from "../lib/openai";

const router = Router();
const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;

const lezen    = requireBevoegdheid("offertes", 1);
const schrijven = requireBevoegdheid("offertes", 2);

// ── helpers ───────────────────────────────────────────────────────────────────

function mapAanvraag(
  row: typeof materiaalAanvragenTable.$inferSelect & {
    ingediend_naam?: string | null;
    behandeld_naam?: string | null;
    opdracht_titel?: string | null;
    opdracht_werknummer?: string | null;
  },
) {
  return {
    id: row.id,
    opdracht_id: row.opdrachtId,
    opdracht_titel: row.opdracht_titel ?? null,
    opdracht_werknummer: row.opdracht_werknummer ?? null,
    ingediend_door_id: row.ingediendDoorId ?? null,
    ingediend_door_naam: row.ingediend_naam ?? null,
    reden: row.reden,
    omschrijving: row.omschrijving ?? null,
    foto_pad: row.fotoPad ?? null,
    status: row.status,
    ai_artikel_naam: row.aiArtikelNaam ?? null,
    ai_leverancier: row.aiLeverancier ?? null,
    ai_prijs_indicatie: row.aiPrijsIndicatie ?? null,
    ai_scope_check: row.aiScopeCheck ?? null,
    ai_scope_toelichting: row.aiScopeToelichting ?? null,
    ai_advies: row.aiAdvies ?? null,
    ai_logboek: (row.aiLogboekJson as unknown[] | null) ?? [],
    behandeld_door_id: row.behandeldDoorId ?? null,
    behandeld_door_naam: row.behandeld_naam ?? null,
    behandel_notitie: row.behandelNotitie ?? null,
    aangemaakt_op: iso(row.aangemaaktOp),
    bijgewerkt_op: iso(row.bijgewerktOp),
  };
}

// ── AI analyse (intern, fire-and-forget) ──────────────────────────────────────

async function voerAiAnalyseUit(aanvraagId: number): Promise<void> {
  try {
    const [row] = await db
      .select()
      .from(materiaalAanvragenTable)
      .where(eq(materiaalAanvragenTable.id, aanvraagId));
    if (!row) return;

    // Haal werkbegroting materiaalregels op
    const [opdracht] = await db
      .select()
      .from(opdrachtenTable)
      .where(eq(opdrachtenTable.id, row.opdrachtId));

    const begroting = opdracht
      ? await db
          .select()
          .from(projectBegrotingenTable)
          .where(eq(projectBegrotingenTable.opdrachtId, opdracht.id))
          .limit(1)
      : [];

    const materiaalRegels = begroting[0]
      ? await db
          .select()
          .from(werkbegrotingRegelsTable)
          .where(
            and(
              eq(werkbegrotingRegelsTable.begrotingId, begroting[0].id),
              eq(werkbegrotingRegelsTable.categorie, "materiaal"),
            ),
          )
          .orderBy(asc(werkbegrotingRegelsTable.id))
      : [];

    const redenLabel =
      row.reden === "op"
        ? "het artikel is op/verbruikt"
        : row.reden === "beschadigd"
          ? "het artikel is beschadigd"
          : "het artikel is nodig voor het werk";

    let fotoBase64: string | null = null;
    if (row.fotoPad) {
      try {
        const storage = new ObjectStorageService();
        const storageFile = await storage.getObjectEntityFile(row.fotoPad);
        const resp = await storage.downloadObject(storageFile);
        const buffer = Buffer.from(await resp.arrayBuffer());
        const sharp = (await import("sharp")).default;
        fotoBase64 = (
          await sharp(buffer)
            .resize({ width: 1024, withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toBuffer()
        ).toString("base64");
      } catch (err) {
        logger.warn({ err, aanvraagId }, "Foto laden voor AI analyse mislukt");
      }
    }

    const begrotingContext =
      materiaalRegels.length > 0
        ? `WERKBEGROTING MATERIAAL (${materiaalRegels.length} posten):\n` +
          materiaalRegels
            .slice(0, 20)
            .map(
              (r) =>
                `- ${r.omschrijving}: ${r.hoeveelheid} ${r.eenheid ?? ""} @ €${r.tarief ?? 0}`,
            )
            .join("\n")
        : "Geen werkbegroting beschikbaar.";

    const openai = maakOpenAiClient();

    type ContentPart =
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string; detail: "high" } };

    const userContent: ContentPart[] = [
      {
        type: "text",
        text: `Reden melding: ${redenLabel}.${row.omschrijving ? `\nMonteur toelichting: "${row.omschrijving}"` : ""}\n\n${begrotingContext}`,
      },
    ];
    if (fotoBase64) {
      userContent.push({
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${fotoBase64}`, detail: "high" },
      });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 800,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Je bent werkvoorbereider bij FPS Brandpreventie, een brandpreventie-installatiebedrijf.
Een monteur meldt via een foto en/of omschrijving dat hij een artikel nodig heeft.

Jouw taak:
1. Identificeer het artikel zo precies mogelijk (juiste vakterm/benaming).
2. Geef een concrete leverancier (Technische Unie, Bouwmaat, Toolstation, Festool, Hilti, enzovoort).
3. Geef een realistische prijsindicatie (bijv. "€ 12 – € 18 bij Technische Unie").
4. Controleer of dit artikel past binnen de werkbegroting (scope check).
5. Geef een kort advies aan de werkvoorbereider.

Scope check regels:
- "binnen_scope": het artikel staat expliciet (of sterk gelijkend) op de werkbegroting
- "buiten_scope": het artikel staat niet op de werkbegroting en past niet bij het projecttype
- "onduidelijk": niet genoeg informatie om een uitspraak te doen

Retourneer uitsluitend geldige JSON:
{
  "artikel_naam": "<juiste vakterm, bijv. 'Brandwerende manchet DN75 EPDM'>",
  "leverancier": "<voorkeursleverancier>",
  "prijs_indicatie": "<prijsrange + leverancier>",
  "scope_check": "<binnen_scope | buiten_scope | onduidelijk>",
  "scope_toelichting": "<1-2 zinnen waarom binnen/buiten scope>",
  "advies": "<concreet advies voor de werkvoorbereider, max 3 zinnen>"
}`,
        },
        {
          role: "user",
          content: userContent,
        },
      ],
    });

    const rawText = completion.choices[0]?.message?.content ?? "{}";
    let voorstel: Record<string, unknown> = {};
    try {
      voorstel = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      logger.error({ aanvraagId }, "AI JSON parsen mislukt");
      return;
    }

    const logEntry = {
      tijdstip: new Date().toISOString(),
      actie: "AI analyse uitgevoerd",
      artikel_naam: voorstel.artikel_naam ?? null,
      scope_check: voorstel.scope_check ?? null,
    };

    const bestaandLogboek = (row.aiLogboekJson as unknown[] | null) ?? [];
    const nieuwLogboek = [logEntry, ...bestaandLogboek].slice(0, 20);

    await db
      .update(materiaalAanvragenTable)
      .set({
        aiArtikelNaam: typeof voorstel.artikel_naam === "string" ? voorstel.artikel_naam : null,
        aiLeverancier: typeof voorstel.leverancier === "string" ? voorstel.leverancier : null,
        aiPrijsIndicatie: typeof voorstel.prijs_indicatie === "string" ? voorstel.prijs_indicatie : null,
        aiScopeCheck: typeof voorstel.scope_check === "string" ? voorstel.scope_check : null,
        aiScopeToelichting: typeof voorstel.scope_toelichting === "string" ? voorstel.scope_toelichting : null,
        aiAdvies: typeof voorstel.advies === "string" ? voorstel.advies : null,
        aiLogboekJson: nieuwLogboek,
        bijgewerktOp: new Date(),
      })
      .where(eq(materiaalAanvragenTable.id, aanvraagId));
  } catch (err) {
    logger.error({ err, aanvraagId }, "AI analyse materiaal aanvraag mislukt");
  }
}

// ── GET /materiaal-aanvragen ────────────────────────────────────────────────
// Alle aanvragen zichtbaar voor werkvoorbereider (status-filter optioneel)

router.get("/materiaal-aanvragen", lezen, async (req, res) => {
  const { status, opdracht_id } = req.query as { status?: string; opdracht_id?: string };

  const aanvragen = await db
    .select()
    .from(materiaalAanvragenTable)
    .where(
      status
        ? eq(materiaalAanvragenTable.status, status)
        : opdracht_id
          ? eq(materiaalAanvragenTable.opdrachtId, parseInt(opdracht_id, 10))
          : undefined,
    )
    .orderBy(desc(materiaalAanvragenTable.aangemaaktOp));

  if (aanvragen.length === 0) return res.json([]);

  // Gebruikersnamen en opdrachttitels los ophalen
  const gebruikerIds = [
    ...new Set(
      aanvragen
        .flatMap((a) => [a.ingediendDoorId, a.behandeldDoorId])
        .filter((id): id is number => id != null),
    ),
  ];
  const opdrachtIds = [...new Set(aanvragen.map((a) => a.opdrachtId).filter((id): id is number => id != null))];

  const [gebruikers, opdrachten] = await Promise.all([
    gebruikerIds.length > 0
      ? db.select({ id: gebruikersTable.id, naam: gebruikersTable.naam }).from(gebruikersTable).where(inArray(gebruikersTable.id, gebruikerIds))
      : Promise.resolve([]),
    opdrachtIds.length > 0
      ? db.select({ id: opdrachtenTable.id, titel: opdrachtenTable.titel, werknummer: opdrachtenTable.werknummer }).from(opdrachtenTable).where(inArray(opdrachtenTable.id, opdrachtIds))
      : Promise.resolve([]),
  ]);

  const gebruikerMap = new Map(gebruikers.map((g) => [g.id, g.naam]));
  const opdrachtMap = new Map(opdrachten.map((o) => [o.id, o]));

  const rijen = aanvragen.map((a) => ({
    ...a,
    ingediend_naam: a.ingediendDoorId != null ? (gebruikerMap.get(a.ingediendDoorId) ?? null) : null,
    behandeld_naam: a.behandeldDoorId != null ? (gebruikerMap.get(a.behandeldDoorId) ?? null) : null,
    opdracht_titel: a.opdrachtId != null ? (opdrachtMap.get(a.opdrachtId)?.titel ?? null) : null,
    opdracht_werknummer: a.opdrachtId != null ? (opdrachtMap.get(a.opdrachtId)?.werknummer ?? null) : null,
  }));

  return res.json(rijen.map(mapAanvraag));
});

// ── POST /materiaal-aanvragen ───────────────────────────────────────────────
// Monteur dient aanvraag in; foto als base64 in body

router.post("/materiaal-aanvragen", async (req, res) => {
  const gebruikerId = (req.session as { gebruikerId?: number }).gebruikerId;
  if (!gebruikerId) return res.status(401).json({ error: "Niet ingelogd" });

  const { opdracht_id, werkdag_id, reden, omschrijving, foto_pad } = req.body as {
    opdracht_id?: number;
    werkdag_id?: number;
    reden?: string;
    omschrijving?: string;
    foto_pad?: string;
  };

  if (!reden) {
    return res.status(400).json({ error: "reden is verplicht" });
  }
  if (!["op", "beschadigd", "nodig"].includes(reden)) {
    return res.status(400).json({ error: "reden moet op, beschadigd of nodig zijn" });
  }

  // Resolve opdracht_id: rechtstreeks of via werkdag (planning item)
  let opdrachtId: number | null = opdracht_id ?? null;
  if (!opdrachtId && werkdag_id) {
    const [planningItem] = await db
      .select({ opdrachtId: planningItemsTable.opdrachtId })
      .from(planningItemsTable)
      .where(eq(planningItemsTable.id, werkdag_id));
    opdrachtId = planningItem?.opdrachtId ?? null;
  }
  if (!opdrachtId) {
    return res.status(400).json({ error: "Geen geldige opdracht of werkdag opgegeven" });
  }

  const [opdracht] = await db
    .select({ id: opdrachtenTable.id })
    .from(opdrachtenTable)
    .where(eq(opdrachtenTable.id, opdrachtId));
  if (!opdracht) return res.status(404).json({ error: "Opdracht niet gevonden" });
  opdrachtId = opdracht.id;

  const [nieuw] = await db
    .insert(materiaalAanvragenTable)
    .values({
      opdrachtId: opdrachtId,
      ingediendDoorId: gebruikerId,
      reden,
      omschrijving: omschrijving ?? null,
      fotoPad: foto_pad ?? null,
      status: "nieuw",
    })
    .returning();

  if (!nieuw) return res.status(500).json({ error: "Aanvraag aanmaken mislukt" });

  // AI analyse asynchroon starten (fire-and-forget)
  if (heeftOpenAi()) {
    void voerAiAnalyseUit(nieuw.id);
  }

  return res.status(201).json({ id: nieuw.id, foto_pad: foto_pad ?? null });
});

// ── PATCH /materiaal-aanvragen/:id ─────────────────────────────────────────
// Werkvoorbereider behandelt aanvraag (status + notitie)

router.patch("/materiaal-aanvragen/:id", lezen, async (req, res) => {
  const id = parseInt(String(req.params["id"] ?? "0"), 10);
  const gebruikerId = (req.session as { gebruikerId?: number }).gebruikerId;

  const [bestaand] = await db
    .select()
    .from(materiaalAanvragenTable)
    .where(eq(materiaalAanvragenTable.id, id));
  if (!bestaand) return res.status(404).json({ error: "Aanvraag niet gevonden" });

  const { status, behandel_notitie } = req.body as {
    status?: string;
    behandel_notitie?: string;
  };

  const geldigeStatussen = ["nieuw", "in_behandeling", "goedgekeurd", "afgewezen"];
  if (status && !geldigeStatussen.includes(status)) {
    return res.status(400).json({ error: "Ongeldige status" });
  }

  await db
    .update(materiaalAanvragenTable)
    .set({
      ...(status ? { status } : {}),
      ...(behandel_notitie !== undefined ? { behandelNotitie: behandel_notitie } : {}),
      ...(status && status !== "nieuw" ? { behandeldDoorId: gebruikerId } : {}),
      bijgewerktOp: new Date(),
    })
    .where(eq(materiaalAanvragenTable.id, id));

  const [updated] = await db
    .select()
    .from(materiaalAanvragenTable)
    .where(eq(materiaalAanvragenTable.id, id));

  return res.json(mapAanvraag(updated as Parameters<typeof mapAanvraag>[0]));
});

// ── POST /materiaal-aanvragen/:id/heranalyseer ─────────────────────────────
// Handmatig AI heranalyse triggeren

router.post("/materiaal-aanvragen/:id/heranalyseer", schrijven, async (req, res) => {
  const id = parseInt(String(req.params["id"] ?? "0"), 10);
  if (!heeftOpenAi()) return res.status(503).json({ error: "AI niet beschikbaar" });

  const [bestaand] = await db
    .select()
    .from(materiaalAanvragenTable)
    .where(eq(materiaalAanvragenTable.id, id));
  if (!bestaand) return res.status(404).json({ error: "Aanvraag niet gevonden" });

  void voerAiAnalyseUit(id);
  return res.json({ gestart: true });
});

export default router;
