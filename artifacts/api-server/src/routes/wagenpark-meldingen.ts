// Wagenpark meldingen — monteur meldt storing, schade, kwartaalcontrole, onderhoud
// of overige zaken via de telefoon. AI ondersteunt per type (diagnose, fotokwaliteit,
// kilometerstand/waarschuwingen uitlezen, ernst- en duplicaatdetectie bij schade).
// Kantoorafhandeling: toewijzen aan beheerder, koppelen aan onderhoudsactie of
// vrije opvolgnotitie (schadeherstel/verzekering/lease).

import { Router } from "express";
import {
  db,
  wagenparkMeldingenTable,
  wagenparkKwartaalcontroleTable,
  voertuigenTable,
  gebruikersTable,
} from "@workspace/db";
import { eq, and, desc, ne, gte } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { requireBevoegdheid, requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { ObjectStorageService } from "../lib/objectStorage";
import { aiGateway, heeftGateway } from "../lib/aiGateway";
import { registreerPushToken, meldNieuweMeldingAanBeheerders } from "../lib/pushService";

const router = Router();
const storageService = new ObjectStorageService();

type MeldingType = "storing" | "schade" | "kwartaalcontrole" | "onderhoud" | "overige";
const MELDING_TYPES: MeldingType[] = ["storing", "schade", "kwartaalcontrole", "onderhoud", "overige"];

type MeldingRow = typeof wagenparkMeldingenTable.$inferSelect;

// ── Mapping naar API-vorm (snake_case) ───────────────────────────────────────

function mapMeldingNaarApi(melding: MeldingRow, extra?: Record<string, unknown>) {
  return {
    id: melding.id,
    voertuig_id: melding.voertuigId,
    gemeld_door_id: melding.gemeldDoorId,
    type: melding.type,
    omschrijving: melding.omschrijving,
    foto_paden: melding.fotoPaden,
    schade_locatie: melding.schadeLocatie,
    storing_type: melding.storingType,
    ai_diagnose: melding.aiDiagnose,
    ai_oplossing: melding.aiOplossing,
    ai_kosten_indicatie: melding.aiKostenIndicatie,
    ai_kosten_tekst: melding.aiKostenTekst,
    ai_fotokwaliteit_ok: melding.aiFotokwaliteitOk,
    ai_gelezen_km_stand: melding.aiGelezenKmStand,
    ai_gelezen_waarschuwingen: melding.aiGelezenWaarschuwingen,
    ai_ernst_indicatie: melding.aiErnstIndicatie,
    ai_mogelijk_duplicaat_van_id: melding.aiMogelijkDuplicaatVanId,
    status: melding.status,
    toegewezen_beheerder_id: melding.toegewezenBeheerderId,
    onderhoud_id: melding.onderhoudId,
    opvolg_notitie: melding.opvolgNotitie,
    admin_notitie: melding.adminNotitie,
    aangemaakt_op: melding.aangemaaktOp,
    bijgewerkt_op: melding.bijgewerktOp,
    ...extra,
  };
}

// ── Foto ophalen als data-URL t.b.v. AI-vision ───────────────────────────────

async function fotoAlsDataUrl(fotoPad: string): Promise<string | null> {
  try {
    const genormaliseerd = storageService.normalizeObjectEntityPath(fotoPad);
    const file = await storageService.getObjectEntityFile(genormaliseerd);
    const stream = file.createReadStream();
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", resolve);
      stream.on("error", reject);
    });
    const buffer = Buffer.concat(chunks);
    let contentType = "image/jpeg";
    try {
      const [md] = await file.getMetadata();
      if (md.contentType && String(md.contentType).startsWith("image/")) {
        contentType = String(md.contentType);
      }
    } catch { /* valt terug op image/jpeg */ }
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch (fotoErr) {
    logger.warn({ fotoErr }, "Foto ophalen voor AI mislukt, doorgaan zonder");
    return null;
  }
}

type VisionContent =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail: "low" } };

// ── Duplicaatdetectie schade ──────────────────────────────────────────────────

async function zoekMogelijkeSchadeDuplicaat(
  voertuigId: number,
  schadeLocatie: string | null,
): Promise<number | null> {
  const dertigDagenGeleden = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const openstaand = await db
    .select()
    .from(wagenparkMeldingenTable)
    .where(
      and(
        eq(wagenparkMeldingenTable.voertuigId, voertuigId),
        eq(wagenparkMeldingenTable.type, "schade"),
        ne(wagenparkMeldingenTable.status, "opgelost"),
        ne(wagenparkMeldingenTable.status, "afgewezen_duplicaat"),
        gte(wagenparkMeldingenTable.aangemaaktOp, dertigDagenGeleden),
      ),
    )
    .orderBy(desc(wagenparkMeldingenTable.aangemaaktOp));

  if (openstaand.length === 0) return null;

  // Zelfde schadelocatie is de sterkste indicator van een duplicaat.
  const zelfdeLocatie = schadeLocatie
    ? openstaand.find((m) => m.schadeLocatie === schadeLocatie)
    : undefined;

  return zelfdeLocatie ? zelfdeLocatie.id : null;
}

// ── AI-analyse storing/schade ─────────────────────────────────────────────────

interface AiAnalyseResultaat {
  diagnose: string | null;
  oplossing: string | null;
  kostenIndicatie: boolean;
  kostenTekst: string | null;
  ernstIndicatie: "licht" | "matig" | "ernstig" | null;
  waarschuwingen: string[];
}

async function voerAiAnalyseUit(
  meldingType: "storing" | "schade",
  omschrijving: string,
  voertuigInfo: string,
  fotoPaden: string[],
  extraContext: string,
): Promise<AiAnalyseResultaat> {
  const leeg: AiAnalyseResultaat = {
    diagnose: null, oplossing: null, kostenIndicatie: false, kostenTekst: null,
    ernstIndicatie: null, waarschuwingen: [],
  };
  if (!heeftGateway()) return leeg;

  try {
    const prompt =
      `Je bent een ervaren wagenparkbeheerder bij een brandpreventie-bedrijf. ` +
      `Een monteur meldt het volgende voor voertuig ${voertuigInfo}:\n\n` +
      `Type melding: ${meldingType}\n` +
      `Beschrijving: ${omschrijving}\n` +
      `${extraContext}\n\n` +
      `Geef een korte diagnose van het probleem, een praktische oplossing en beoordeel of er kosten aan ` +
      `verbonden zijn. Geef ook een ernstindicatie ("licht", "matig" of "ernstig") en, als er op de foto ` +
      `waarschuwingslampjes, dashboardmeldingen of zichtbare schade te zien zijn, noem die kort in een lijst. ` +
      `Antwoord altijd in het Nederlands. Geef je antwoord als JSON:\n` +
      `{\n` +
      `  "diagnose": "...",\n` +
      `  "oplossing": "...",\n` +
      `  "kosten_indicatie": true/false,\n` +
      `  "kosten_tekst": "..." (alleen invullen als kosten_indicatie true is),\n` +
      `  "ernst_indicatie": "licht" | "matig" | "ernstig",\n` +
      `  "waarschuwingen": ["..."] (leeg array als niets zichtbaar is)\n` +
      `}`;

    const content: VisionContent[] = [];
    for (const pad of fotoPaden.slice(0, 3)) {
      const dataUrl = await fotoAlsDataUrl(pad);
      if (dataUrl) content.push({ type: "image_url", image_url: { url: dataUrl, detail: "low" } });
    }
    content.push({ type: "text", text: prompt });

    const resultaat = await aiGateway.chat("default", {
      max_tokens: 600,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: [{ role: "user", content } as any],
    });

    const raw = resultaat.ok ? resultaat.inhoud : "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return leeg;

    const parsed = JSON.parse(match[0]) as {
      diagnose?: string;
      oplossing?: string;
      kosten_indicatie?: boolean;
      kosten_tekst?: string;
      ernst_indicatie?: string;
      waarschuwingen?: string[];
    };

    const kostenIndicatie = parsed.kosten_indicatie === true;
    const ernst = parsed.ernst_indicatie;
    return {
      diagnose: parsed.diagnose?.trim() ?? null,
      oplossing: parsed.oplossing?.trim() ?? null,
      kostenIndicatie,
      kostenTekst: kostenIndicatie ? (parsed.kosten_tekst?.trim() ?? null) : null,
      ernstIndicatie: ernst === "licht" || ernst === "matig" || ernst === "ernstig" ? ernst : null,
      waarschuwingen: Array.isArray(parsed.waarschuwingen)
        ? parsed.waarschuwingen.filter((w): w is string => typeof w === "string")
        : [],
    };
  } catch (err) {
    logger.warn({ err }, "AI analyse voertuigmelding mislukt");
    return leeg;
  }
}

// ── POST /wagenpark/meldingen — monteur maakt melding ───────────────────────
router.post("/meldingen", requireAuth, async (req, res): Promise<void> => {
  const gebruikerId = req.session?.["userId"] as number | undefined;
  if (!gebruikerId) return void res.status(401).json({ error: "Niet ingelogd" });

  const body = req.body as {
    type?: string;
    omschrijving?: string;
    foto_paden?: string[];
    schade_locatie?: string;
    storing_type?: string;
    ai_fotokwaliteit_ok?: boolean;
    ai_gelezen_km_stand?: number;
    ai_gelezen_waarschuwingen?: string[];
  };

  const meldingType: MeldingType = MELDING_TYPES.includes(body.type as MeldingType)
    ? (body.type as MeldingType)
    : "overige";

  const omschrijving =
    body.omschrijving?.trim() ||
    (meldingType === "kwartaalcontrole" ? "Kwartaalcontrole uitgevoerd" : "");

  if (!omschrijving) {
    return void res.status(422).json({ error: "Omschrijving is verplicht" });
  }

  // Voertuig opzoeken via chauffeur_id van de ingelogde monteur
  const [voertuig] = await db
    .select()
    .from(voertuigenTable)
    .where(
      and(
        eq(voertuigenTable.chauffeurId, gebruikerId),
        eq(voertuigenTable.gearchiveerd, false),
      ),
    )
    .limit(1);

  if (!voertuig) {
    return void res.status(404).json({ error: "Geen voertuig gekoppeld aan uw account" });
  }

  const fotoPaden: string[] = Array.isArray(body.foto_paden) ? body.foto_paden : [];
  const voertuigInfo =
    [voertuig.merk, voertuig.type, voertuig.kenteken ? `(${voertuig.kenteken})` : null]
      .filter(Boolean)
      .join(" ");

  const waarden: typeof wagenparkMeldingenTable.$inferInsert = {
    voertuigId: voertuig.id,
    gemeldDoorId: gebruikerId,
    type: meldingType,
    omschrijving,
    fotoPaden,
    status: "nieuw",
  };

  let notificeerBeheerders = true;

  if (meldingType === "schade" || meldingType === "storing") {
    const schadeLocatie = meldingType === "schade" ? body.schade_locatie ?? null : null;
    const storingType = meldingType === "storing" ? body.storing_type ?? null : null;
    waarden.schadeLocatie = schadeLocatie;
    waarden.storingType = storingType;

    const extraContext =
      meldingType === "schade" && schadeLocatie ? `Locatie op voertuig: ${schadeLocatie}` :
      meldingType === "storing" && storingType ? `Type storing: ${storingType}` : "";

    const analyse = await voerAiAnalyseUit(meldingType, omschrijving, voertuigInfo, fotoPaden, extraContext);
    waarden.aiDiagnose = analyse.diagnose;
    waarden.aiOplossing = analyse.oplossing;
    waarden.aiKostenIndicatie = analyse.kostenIndicatie;
    waarden.aiKostenTekst = analyse.kostenTekst;
    waarden.aiErnstIndicatie = analyse.ernstIndicatie;
    waarden.aiGelezenWaarschuwingen = analyse.waarschuwingen;

    if (meldingType === "schade") {
      const duplicaatVanId = await zoekMogelijkeSchadeDuplicaat(voertuig.id, schadeLocatie);
      waarden.aiMogelijkDuplicaatVanId = duplicaatVanId;
    }
  } else if (meldingType === "kwartaalcontrole") {
    // AI-fotokwaliteit/km-stand/waarschuwingen zijn al vóór verzenden bevestigd door de
    // monteur via POST /wagenpark/kwartaalcontrole/foto-check — hier alleen persisteren.
    waarden.aiFotokwaliteitOk = body.ai_fotokwaliteit_ok ?? null;
    waarden.aiGelezenKmStand = typeof body.ai_gelezen_km_stand === "number" ? body.ai_gelezen_km_stand : null;
    const waarschuwingen = Array.isArray(body.ai_gelezen_waarschuwingen)
      ? body.ai_gelezen_waarschuwingen.filter((w): w is string => typeof w === "string")
      : [];
    waarden.aiGelezenWaarschuwingen = waarschuwingen;

    // Zonder waarschuwingen is er niets voor de beheerder te doen: meteen opgelost.
    waarden.status = waarschuwingen.length > 0 ? "actie_nodig" : "opgelost";
    notificeerBeheerders = waarschuwingen.length > 0;

    if (typeof body.ai_gelezen_km_stand === "number" && body.ai_gelezen_km_stand > voertuig.kmStand) {
      await db
        .update(voertuigenTable)
        .set({ kmStand: body.ai_gelezen_km_stand, kmStandDatum: new Date(), bijgewerktOp: new Date() })
        .where(eq(voertuigenTable.id, voertuig.id));
    }
  }

  const inserted = await db.insert(wagenparkMeldingenTable).values(waarden).returning();
  const melding = inserted[0];
  if (!melding) return void res.status(500).json({ error: "Opslaan mislukt" });

  // Bij kwartaalcontrole: de openstaande cyclus afronden en koppelen.
  if (meldingType === "kwartaalcontrole") {
    const [openCyclus] = await db
      .select()
      .from(wagenparkKwartaalcontroleTable)
      .where(
        and(
          eq(wagenparkKwartaalcontroleTable.voertuigId, voertuig.id),
          eq(wagenparkKwartaalcontroleTable.status, "open"),
        ),
      )
      .orderBy(desc(wagenparkKwartaalcontroleTable.periodeStart))
      .limit(1);

    if (openCyclus) {
      await db
        .update(wagenparkKwartaalcontroleTable)
        .set({ status: "voltooid", meldingId: melding.id, bijgewerktOp: new Date() })
        .where(eq(wagenparkKwartaalcontroleTable.id, openCyclus.id));
    }
  }

  if (notificeerBeheerders) {
    const titel = meldingType === "schade" ? "Nieuwe schademelding"
      : meldingType === "storing" ? "Nieuwe storingsmelding"
      : meldingType === "kwartaalcontrole" ? "Kwartaalcontrole: aandacht nodig"
      : "Nieuwe voertuigmelding";
    void meldNieuweMeldingAanBeheerders(
      titel,
      `${voertuigInfo || "Voertuig"}: ${omschrijving}`,
      { type: "melding", meldingId: melding.id, voertuigId: voertuig.id },
    );
  }

  return void res.status(201).json(mapMeldingNaarApi(melding, {
    voertuig_kenteken: voertuig.kenteken,
    voertuig_merk: voertuig.merk,
    voertuig_type_naam: voertuig.type,
  }));
});

// ── POST /wagenpark/kwartaalcontrole/foto-check — AI keurt dashboardfoto ────
router.post("/kwartaalcontrole/foto-check", requireAuth, async (req, res): Promise<void> => {
  const gebruikerId = req.session?.["userId"] as number | undefined;
  if (!gebruikerId) return void res.status(401).json({ error: "Niet ingelogd" });

  const { foto_pad } = req.body as { foto_pad?: string };
  if (!foto_pad) return void res.status(422).json({ error: "foto_pad is verplicht" });

  const [voertuig] = await db
    .select()
    .from(voertuigenTable)
    .where(and(eq(voertuigenTable.chauffeurId, gebruikerId), eq(voertuigenTable.gearchiveerd, false)))
    .limit(1);
  if (!voertuig) return void res.status(404).json({ error: "Geen voertuig gekoppeld aan uw account" });

  if (!heeftGateway()) {
    // Geen AI beschikbaar: foto altijd accepteren, monteur vult km-stand/waarschuwingen handmatig in.
    return void res.json({ fotokwaliteit_ok: true, reden: null, km_stand: null, waarschuwingen: [] });
  }

  const dataUrl = await fotoAlsDataUrl(foto_pad);
  if (!dataUrl) {
    return void res.json({
      fotokwaliteit_ok: false,
      reden: "Foto kon niet worden geladen. Probeer opnieuw te fotograferen.",
      km_stand: null,
      waarschuwingen: [],
    });
  }

  try {
    const voertuigInfo = [voertuig.merk, voertuig.type, voertuig.kenteken].filter(Boolean).join(" ");
    const prompt =
      `Dit is een dashboardfoto voor de kwartaalcontrole van voertuig ${voertuigInfo}. ` +
      `Beoordeel: is de foto scherp genoeg, is het dashboard (kilometerteller/instrumentenpaneel) goed leesbaar, ` +
      `en toont de foto aannemelijk een voertuigdashboard (niet iets anders)? ` +
      `Lees zo mogelijk de kilometerstand af en noem eventuele zichtbare waarschuwingslampjes of meldingen. ` +
      `Antwoord alleen als JSON in het Nederlands:\n` +
      `{\n` +
      `  "fotokwaliteit_ok": true/false,\n` +
      `  "reden": "..." (alleen invullen als fotokwaliteit_ok false is, korte reden voor opnieuw fotograferen),\n` +
      `  "km_stand": 12345 (getal, of null als niet leesbaar),\n` +
      `  "waarschuwingen": ["..."] (leeg array als geen waarschuwingen zichtbaar zijn)\n` +
      `}`;

    const content: VisionContent[] = [
      { type: "image_url", image_url: { url: dataUrl, detail: "low" } },
      { type: "text", text: prompt },
    ];

    const resultaat = await aiGateway.chat("default", {
      max_tokens: 400,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: [{ role: "user", content } as any],
    });

    const raw = resultaat.ok ? resultaat.inhoud : "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      return void res.json({ fotokwaliteit_ok: true, reden: null, km_stand: null, waarschuwingen: [] });
    }

    const parsed = JSON.parse(match[0]) as {
      fotokwaliteit_ok?: boolean;
      reden?: string;
      km_stand?: number | null;
      waarschuwingen?: string[];
    };

    return void res.json({
      fotokwaliteit_ok: parsed.fotokwaliteit_ok !== false,
      reden: parsed.fotokwaliteit_ok === false ? (parsed.reden?.trim() ?? "Foto voldoet niet, probeer opnieuw.") : null,
      km_stand: typeof parsed.km_stand === "number" ? parsed.km_stand : null,
      waarschuwingen: Array.isArray(parsed.waarschuwingen)
        ? parsed.waarschuwingen.filter((w): w is string => typeof w === "string")
        : [],
    });
  } catch (err) {
    logger.warn({ err }, "AI fotocheck kwartaalcontrole mislukt");
    return void res.json({ fotokwaliteit_ok: true, reden: null, km_stand: null, waarschuwingen: [] });
  }
});

// ── GET /wagenpark/kwartaalcontrole/mijn — monteur ziet eigen cyclus ────────
router.get("/kwartaalcontrole/mijn", requireAuth, async (req, res): Promise<void> => {
  const gebruikerId = req.session?.["userId"] as number | undefined;
  if (!gebruikerId) return void res.status(401).json({ error: "Niet ingelogd" });

  const [voertuig] = await db
    .select()
    .from(voertuigenTable)
    .where(and(eq(voertuigenTable.chauffeurId, gebruikerId), eq(voertuigenTable.gearchiveerd, false)))
    .limit(1);
  if (!voertuig) return void res.json(null);

  const [cyclus] = await db
    .select()
    .from(wagenparkKwartaalcontroleTable)
    .where(
      and(
        eq(wagenparkKwartaalcontroleTable.voertuigId, voertuig.id),
        eq(wagenparkKwartaalcontroleTable.status, "open"),
      ),
    )
    .orderBy(desc(wagenparkKwartaalcontroleTable.periodeStart))
    .limit(1);

  if (!cyclus) return void res.json(null);

  return void res.json({
    id: cyclus.id,
    voertuig_id: cyclus.voertuigId,
    periode_start: cyclus.periodeStart,
    deadline: cyclus.deadline,
    status: cyclus.status,
    voertuig_kenteken: voertuig.kenteken,
    voertuig_merk: voertuig.merk,
    voertuig_type_naam: voertuig.type,
  });
});

// ── POST /wagenpark/push-tokens — Expo-pushtoken registreren ────────────────
router.post("/push-tokens", requireAuth, async (req, res): Promise<void> => {
  const gebruikerId = req.session?.["userId"] as number | undefined;
  if (!gebruikerId) return void res.status(401).json({ error: "Niet ingelogd" });

  const { expo_push_token, platform } = req.body as {
    expo_push_token?: string;
    platform?: "ios" | "android" | "onbekend";
  };
  if (!expo_push_token?.trim()) {
    return void res.status(422).json({ error: "expo_push_token is verplicht" });
  }

  await registreerPushToken(gebruikerId, expo_push_token.trim(), platform ?? "onbekend");
  return void res.status(204).send();
});

// ── GET /wagenpark/meldingen — beheerder bekijkt alle meldingen ──────────────
router.get("/meldingen", requireBevoegdheid("wagenpark", 1), async (req, res): Promise<void> => {
  const { voertuig_id, status, type } = req.query as {
    voertuig_id?: string;
    status?: string;
    type?: string;
  };

  const toegewezenBeheerder = alias(gebruikersTable, "toegewezen_beheerder");

  const rows = await db
    .select({
      melding: wagenparkMeldingenTable,
      voertuig_kenteken: voertuigenTable.kenteken,
      voertuig_merk: voertuigenTable.merk,
      voertuig_type_naam: voertuigenTable.type,
      monteur_naam: gebruikersTable.naam,
      toegewezen_beheerder_naam: toegewezenBeheerder.naam,
    })
    .from(wagenparkMeldingenTable)
    .leftJoin(voertuigenTable, eq(wagenparkMeldingenTable.voertuigId, voertuigenTable.id))
    .leftJoin(gebruikersTable, eq(wagenparkMeldingenTable.gemeldDoorId, gebruikersTable.id))
    .leftJoin(toegewezenBeheerder, eq(wagenparkMeldingenTable.toegewezenBeheerderId, toegewezenBeheerder.id))
    .where(
      voertuig_id
        ? eq(wagenparkMeldingenTable.voertuigId, parseInt(voertuig_id, 10))
        : undefined,
    )
    .orderBy(desc(wagenparkMeldingenTable.aangemaaktOp));

  const gefilterd = rows
    .filter((r) => !status || r.melding.status === status)
    .filter((r) => !type || r.melding.type === type);

  return void res.json(
    gefilterd.map((r) => mapMeldingNaarApi(r.melding, {
      voertuig_kenteken: r.voertuig_kenteken,
      voertuig_merk: r.voertuig_merk,
      voertuig_type_naam: r.voertuig_type_naam,
      monteur_naam: r.monteur_naam,
      toegewezen_beheerder_naam: r.toegewezen_beheerder_naam,
    })),
  );
});

// ── PATCH /wagenpark/meldingen/:id — status/toewijzing/koppeling bijwerken ──
router.patch("/meldingen/:id", requireBevoegdheid("wagenpark", 2), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) return void res.status(400).json({ error: "Ongeldig id" });

  const {
    status, admin_notitie, toegewezen_beheerder_id, onderhoud_id, opvolg_notitie,
  } = req.body as {
    status?: MeldingRow["status"];
    admin_notitie?: string;
    toegewezen_beheerder_id?: number | null;
    onderhoud_id?: number | null;
    opvolg_notitie?: string;
  };

  const geldigeStatussen = ["nieuw", "in_beoordeling", "actie_nodig", "ingepland", "opgelost", "afgewezen_duplicaat"];
  if (status !== undefined && !geldigeStatussen.includes(status)) {
    return void res.status(422).json({ error: "Ongeldige status" });
  }

  const update: Partial<typeof wagenparkMeldingenTable.$inferInsert> = {
    bijgewerktOp: new Date(),
  };
  if (status !== undefined) update.status = status;
  if (admin_notitie !== undefined) update.adminNotitie = admin_notitie;
  if (toegewezen_beheerder_id !== undefined) update.toegewezenBeheerderId = toegewezen_beheerder_id;
  if (onderhoud_id !== undefined) update.onderhoudId = onderhoud_id;
  if (opvolg_notitie !== undefined) update.opvolgNotitie = opvolg_notitie;

  const updated = await db
    .update(wagenparkMeldingenTable)
    .set(update)
    .where(eq(wagenparkMeldingenTable.id, id))
    .returning();

  if (!updated[0]) return void res.status(404).json({ error: "Niet gevonden" });
  return void res.json(mapMeldingNaarApi(updated[0]));
});

export default router;
