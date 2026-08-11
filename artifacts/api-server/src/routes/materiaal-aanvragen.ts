// Materiaal Aanvragen — monteur meldt artikel (op/beschadigd/nodig) via foto
// AI herkent artikel, prijs, leverancier en toetst aan werkbegroting scope
import { Router } from "express";
import { MATERIAAL_AANVRAAG_ANALYSE_PROMPT } from "../lib/aiPrompts";
import {
  db,
  materiaalAanvragenTable,
  opdrachtenTable,
  projectBegrotingenTable,
  werkbegrotingRegelsTable,
  gebruikersTable,
  medewerkersTable,
  planningItemsTable,
} from "@workspace/db";
import { eq, and, desc, asc, inArray, isNull } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { ObjectStorageService } from "../lib/objectStorage";
import { meldAanWerkvoorbereiderMetCcProjectleider } from "../lib/bouwMeldingen";
import { handelHerkomstAf } from "../lib/werkbakService";
import { maakConceptInkoopbon } from "../lib/inkoopbonService";
import { GeenAkkoordFout } from "../lib/akkoordPoort";
import { kenmerkVoorProjectinkoop } from "../lib/kenmerk";
import { aiGateway, heeftGateway } from "../lib/aiGateway";

const router = Router();
const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;

// BOUW_01 + MATERIAAL_01 fase 2: alles in deze module (inzien, behandelen én
// heranalyseren) draait op projecten-niveau 2. Een besluit mag nooit lichter
// beveiligd zijn dan een handeling die niets beslist; heranalyseren is daarom
// omlaag gezet naar hetzelfde niveau als behandelen (niet behandelen omhoog,
// zodat niemand toegang verliest).
const niveauInzienEnBehandelen = requireBevoegdheid("projecten", 2);

// MATERIAAL_01 fase 3: signaal dat de bon-claim verloor van een concurrente
// goedkeuring — rolt de transactie terug en wordt als 409 beantwoord.
class BonClaimConflict extends Error {
  constructor() { super("inkoopbon-claim verloren"); }
}

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
    inkoopbon_id: row.inkoopbonId ?? null,
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

    // Haal werkbegroting materiaalregels op (toebehoren-aanvragen hebben
    // bewust geen opdracht — BOUW_01 §6)
    const [opdracht] = row.opdrachtId
      ? await db
          .select()
          .from(opdrachtenTable)
          .where(eq(opdrachtenTable.id, row.opdrachtId))
      : [];

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

    const materiaalChatResultaat = await aiGateway.chat("default", {
      max_tokens: 800,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: MATERIAAL_AANVRAAG_ANALYSE_PROMPT.tekst,
        },
        {
          role: "user",
          content: userContent,
        },
      ],
    }, undefined, {
      module: "materiaal-aanvragen",
      functie: "materiaalAanvraagAnalyse",
      entiteitstype: "materiaal-aanvraag",
      entiteitId: aanvraagId,
      promptNaam: MATERIAAL_AANVRAAG_ANALYSE_PROMPT.naam,
      promptVersie: MATERIAAL_AANVRAAG_ANALYSE_PROMPT.versie,
    });

    const rawText = materiaalChatResultaat.ok ? materiaalChatResultaat.inhoud : "{}";
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

router.get("/materiaal-aanvragen", niveauInzienEnBehandelen, async (req, res): Promise<void> => {
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

  if (aanvragen.length === 0) return void res.json([]);

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

  return void res.json(rijen.map(mapAanvraag));
});

// ── POST /materiaal-aanvragen ───────────────────────────────────────────────
// Monteur dient aanvraag in; foto als base64 in body

router.post("/materiaal-aanvragen", async (req, res): Promise<void> => {
  const gebruikerId = req.session.userId;
  if (!gebruikerId) return void res.status(401).json({ error: "Niet ingelogd" });

  const { opdracht_id, werkdag_id, reden, omschrijving, foto_pad, volgens_opdracht } = req.body as {
    opdracht_id?: number;
    werkdag_id?: number;
    reden?: string;
    omschrijving?: string;
    foto_pad?: string;
    volgens_opdracht?: string;
  };

  if (!reden) {
    return void res.status(400).json({ error: "reden is verplicht" });
  }
  if (!["op", "beschadigd", "nodig"].includes(reden)) {
    return void res.status(400).json({ error: "reden moet op, beschadigd of nodig zijn" });
  }
  // BOUW_01 §5: verplichte vraag "Is dit volgens de opdracht?".
  // "weet_niet" is een volwaardig antwoord — geen extra vragen of omweg.
  if (!volgens_opdracht || !["ja", "wijkt_af", "weet_niet"].includes(volgens_opdracht)) {
    return void res.status(400).json({ error: "volgens_opdracht is verplicht: ja, wijkt_af of weet_niet" });
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
    return void res.status(400).json({ error: "Geen geldige opdracht of werkdag opgegeven" });
  }

  const [opdracht] = await db
    .select({ id: opdrachtenTable.id })
    .from(opdrachtenTable)
    .where(eq(opdrachtenTable.id, opdrachtId));
  if (!opdracht) return void res.status(404).json({ error: "Opdracht niet gevonden" });
  opdrachtId = opdracht.id;

  // DOORLOOP_01 §2: een monteur mag alleen materiaal aanvragen voor een
  // opdracht waar hij op is ingepland; kantoor (offertes:2) en hoofdbeheerder
  // mogen voor elke opdracht aanvragen.
  // BOUW_01: opdrachten vallen sinds de sleutel-splitsing onder 'projecten'.
  const magAlles = !!req.permissies && (req.permissies.isHoofdbeheerder || req.permissies.heeftModuleRecht("projecten", 3));
  if (!magAlles) {
    const [eigenMedewerker] = await db
      .select({ id: medewerkersTable.id })
      .from(medewerkersTable)
      .where(eq(medewerkersTable.gebruikerId, gebruikerId));
    const [toegewezen] = eigenMedewerker
      ? await db
          .select({ id: planningItemsTable.id })
          .from(planningItemsTable)
          .where(and(eq(planningItemsTable.opdrachtId, opdrachtId), eq(planningItemsTable.medewerkerId, eigenMedewerker.id)))
      : [];
    if (!toegewezen) {
      return void res.status(403).json({ error: "Je bent niet ingepland op deze opdracht" });
    }
  }

  const [nieuw] = await db
    .insert(materiaalAanvragenTable)
    .values({
      opdrachtId: opdrachtId,
      ingediendDoorId: gebruikerId,
      reden,
      omschrijving: omschrijving ?? null,
      fotoPad: foto_pad ?? null,
      status: "nieuw",
      volgensOpdracht: volgens_opdracht,
    })
    .returning();

  if (!nieuw) return void res.status(500).json({ error: "Aanvraag aanmaken mislukt" });

  // BOUW_01 §5: "wijkt af" en "weet ik niet" gaan naar de werkvoorbereider
  // vóórdat er besteld wordt; "ja" volgt de bestaande weg.
  if (volgens_opdracht !== "ja") {
    const label = volgens_opdracht === "wijkt_af" ? "wijkt af van de opdracht" : "melder weet niet of dit volgens de opdracht is";
    try {
      await meldAanWerkvoorbereiderMetCcProjectleider({
        bron: "materiaal_afwijking",
        titel: `Materiaalaanvraag #${nieuw.id}: ${label}`,
        omschrijving: `Reden: ${reden}. ${omschrijving ?? ""}`.trim(),
        gewicht: 20,
        actiePad: `/opdrachten/${opdrachtId}`,
        herkomstType: "materiaal_aanvraag",
        herkomstId: nieuw.id,
        dedupBasis: `materiaal-afwijking:${nieuw.id}`,
      });
    } catch (err) {
      req.log.error(err);
    }
  }

  // AI analyse asynchroon starten (fire-and-forget)
  if (heeftGateway()) {
    void voerAiAnalyseUit(nieuw.id);
  }

  return void res.status(201).json({ id: nieuw.id, foto_pad: foto_pad ?? null });
});

// ── PATCH /materiaal-aanvragen/:id ─────────────────────────────────────────
// Werkvoorbereider behandelt aanvraag (status + notitie)

router.patch("/materiaal-aanvragen/:id", niveauInzienEnBehandelen, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params["id"] ?? "0"), 10);
  const gebruikerId = req.session.userId;

  const [bestaand] = await db
    .select()
    .from(materiaalAanvragenTable)
    .where(eq(materiaalAanvragenTable.id, id));
  if (!bestaand) return void res.status(404).json({ error: "Aanvraag niet gevonden" });

  const { status, behandel_notitie } = req.body as {
    status?: string;
    behandel_notitie?: string;
  };

  const geldigeStatussen = ["nieuw", "in_behandeling", "goedgekeurd", "afgewezen"];
  if (status && !geldigeStatussen.includes(status)) {
    return void res.status(400).json({ error: "Ongeldige status" });
  }

  // MATERIAAL_01 fase 1: statuswijziging en werkbaksluiting in ÉÉN transactie,
  // met een conditionele overgang (WHERE status = gelezen status). Zo kan een
  // concurrerende PATCH nooit een werkbakitem sluiten terwijl de aanvraag
  // uiteindelijk niet terminaal is, en laat een fout na de update geen
  // terminale aanvraag met een open signaal achter.
  type BonInfo = { id: number; nummer: number; offerteId: number | null; herziening: number };
  let nieuweBon: BonInfo | null = null;
  let conflict: boolean;
  try {
    conflict = await db.transaction(async (tx) => {
    const bijgewerkt = await tx
      .update(materiaalAanvragenTable)
      .set({
        ...(status ? { status } : {}),
        ...(behandel_notitie !== undefined ? { behandelNotitie: behandel_notitie } : {}),
        ...(status && status !== "nieuw" ? { behandeldDoorId: gebruikerId } : {}),
        bijgewerktOp: new Date(),
      })
      .where(and(
        eq(materiaalAanvragenTable.id, id),
        eq(materiaalAanvragenTable.status, bestaand.status),
      ))
      .returning({ id: materiaalAanvragenTable.id });
    if (bijgewerkt.length === 0) return true; // status is intussen gewijzigd

    // Alleen bij een échte overgang naar goedgekeurd/afgewezen het levende
    // werkbaksignaal systeem-afhandelen; in_behandeling blijft open.
    const wordtTerminaal = (status === "goedgekeurd" || status === "afgewezen") && bestaand.status !== status;
    if (wordtTerminaal && status) {
      const gesloten = await handelHerkomstAf("materiaal_aanvraag", id, tx);
      if (gesloten > 0) {
        logger.info({ aanvraagId: id, status, gesloten }, "Werkbakitems afgehandeld bij behandelde materiaal-aanvraag");
      }
    }

    // MATERIAAL_01 fase 3 (keuze A, 2026-08-10): een échte overgang naar
    // goedgekeurd maakt automatisch een concept-inkoopbon op de opdracht,
    // via het gedeelde aanmaakpad (geen vierde bestelpad). Alleen voor
    // materiaal-aanvragen mét opdracht en zonder eerdere bon (idempotent —
    // her-goedkeuren na afwijzing maakt nooit een tweede bon).
    const maaktBon = wordtTerminaal && status === "goedgekeurd"
      && bestaand.soort === "materiaal"
      && bestaand.opdrachtId != null
      && bestaand.inkoopbonId == null;
    if (maaktBon && bestaand.opdrachtId != null) {
      const opmerkingen = [
        bestaand.volgensOpdracht === "wijkt_af"
          ? "LET OP: aanvraag wijkt af van de opdracht." : null,
        `Automatisch aangemaakt uit materiaal-aanvraag #${id} (${bestaand.reden}).`,
        bestaand.aiLeverancier
          ? `AI-suggestie leverancier (ter controle): ${bestaand.aiLeverancier}.` : null,
        behandel_notitie ? `Behandelnotitie: ${behandel_notitie}` : null,
      ].filter(Boolean).join(" ");

      const bon = await maakConceptInkoopbon({
        opdrachtId: bestaand.opdrachtId,
        // Leverancier en prijs zijn bewust NIET uit AI-velden overgenomen
        // (inkoop-eigen-cijfers): de inkoper vult het concept aan.
        leverancier: "Nog te bepalen",
        opmerkingen,
        regels: [{
          omschrijving: bestaand.aiArtikelNaam ?? bestaand.omschrijving ?? bestaand.reden,
          hoeveelheid: 1,
          eenheid: "st",
          prijs: null,
        }],
      }, tx);

      // Conditionele claim: alleen koppelen als er nog écht geen bon hangt.
      // Faalt de claim (concurrente goedkeuring), dan gooien we — de hele
      // transactie (inclusief de zojuist aangemaakte bon) rolt dan terug,
      // zodat er nooit een tweede of wees-bon overblijft.
      const geclaimd = await tx.update(materiaalAanvragenTable)
        .set({ inkoopbonId: bon.id })
        .where(and(
          eq(materiaalAanvragenTable.id, id),
          isNull(materiaalAanvragenTable.inkoopbonId),
        ))
        .returning({ id: materiaalAanvragenTable.id });
      if (geclaimd.length === 0) throw new BonClaimConflict();
      nieuweBon = { id: bon.id, nummer: bon.nummer, offerteId: bon.offerteId ?? null, herziening: bon.herziening };
    }
    return false;
  });
  } catch (err) {
    if (err instanceof BonClaimConflict) {
      return void res.status(409).json({ error: "Aanvraag is intussen door iemand anders goedgekeurd; ververs en probeer opnieuw" });
    }
    if (err instanceof GeenAkkoordFout) {
      // AKKOORD_01 §3.3 (keuze: weigeren, vastgelegd in docs/antwoorden/AKKOORD_01.md):
      // een materiaal-aanvraag op een opdracht zonder akkoord kan niet worden
      // goedgekeurd — de hele transactie (statuswijziging incl.) rolt terug.
      return void res.status(422).json({
        code: "AKKOORD_ONTBREEKT",
        error: `Goedkeuren kan nog niet: ${err.message}`,
      });
    }
    throw err;
  }
  if (conflict) {
    return void res.status(409).json({ error: "Aanvraag is intussen door iemand anders gewijzigd; ververs en probeer opnieuw" });
  }

  const [updated] = await db
    .select()
    .from(materiaalAanvragenTable)
    .where(eq(materiaalAanvragenTable.id, id));

  const basis = mapAanvraag(updated as Parameters<typeof mapAanvraag>[0]);
  if (nieuweBon) {
    const b: BonInfo = nieuweBon;
    const kenmerk = await kenmerkVoorProjectinkoop(b.offerteId, b.nummer, b.herziening);
    logger.info({ aanvraagId: id, inkoopbonId: b.id, kenmerk }, "Concept-inkoopbon automatisch aangemaakt uit goedgekeurde materiaal-aanvraag");
    return void res.json({ ...basis, inkoopbon: { id: b.id, kenmerk } });
  }
  return void res.json(basis);
});

// ── POST /materiaal-aanvragen/:id/heranalyseer ─────────────────────────────
// Handmatig AI heranalyse triggeren

router.post("/materiaal-aanvragen/:id/heranalyseer", niveauInzienEnBehandelen, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params["id"] ?? "0"), 10);
  if (!heeftGateway()) return void res.status(503).json({ error: "AI niet beschikbaar" });

  const [bestaand] = await db
    .select()
    .from(materiaalAanvragenTable)
    .where(eq(materiaalAanvragenTable.id, id));
  if (!bestaand) return void res.status(404).json({ error: "Aanvraag niet gevonden" });

  void voerAiAnalyseUit(id);
  return void res.json({ gestart: true });
});

// ── POST /toebehoren-aanvragen ──────────────────────────────────────────────
// BOUW_01 §6 — toebehoren gereedschap (zaagjes, boortjes, schijven): verbruik.
// Aan te vragen door iedereen; gaat naar de werkvoorbereider. De kosten landen
// op de rubriek magazijn-gereedschap-toebehoren, dus NIET op een project —
// daarom bewust geen opdracht_id aan deze aanvraag.
router.post("/toebehoren-aanvragen", async (req, res): Promise<void> => {
  const gebruikerId = req.session.userId;
  if (!gebruikerId) return void res.status(401).json({ error: "Niet ingelogd" });

  const { omschrijving, foto_pad } = req.body as { omschrijving?: string; foto_pad?: string };
  if (!omschrijving || !omschrijving.trim()) {
    return void res.status(400).json({ error: "omschrijving is verplicht (wat is er nodig?)" });
  }

  const [nieuw] = await db
    .insert(materiaalAanvragenTable)
    .values({
      opdrachtId: null,
      soort: "toebehoren",
      ingediendDoorId: gebruikerId,
      reden: "nodig",
      omschrijving: omschrijving.trim(),
      fotoPad: foto_pad ?? null,
      status: "nieuw",
      volgensOpdracht: null,
    })
    .returning();
  if (!nieuw) return void res.status(500).json({ error: "Aanvraag aanmaken mislukt" });

  try {
    await meldAanWerkvoorbereiderMetCcProjectleider({
      bron: "toebehoren_aanvraag",
      titel: `Toebehoren-aanvraag #${nieuw.id}`,
      omschrijving: `${omschrijving.trim()}\nKosten: rubriek magazijn-gereedschap-toebehoren (verbruik, niet op een project).`,
      gewicht: 10,
      actiePad: `/magazijn`,
      herkomstType: "materiaal_aanvraag",
      herkomstId: nieuw.id,
      dedupBasis: `toebehoren:${nieuw.id}`,
    });
  } catch (err) {
    req.log.error(err);
  }

  return void res.status(201).json({ id: nieuw.id, soort: "toebehoren", kostenrubriek: "gereedschap_toebehoren" });
});

export default router;
