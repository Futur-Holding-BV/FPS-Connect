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
    }, undefined, {
      module: "wagenpark",
      functie: "analyseerMelding",
      promptNaam: "wagenpark-melding-analyse",
      promptVersie: "1.0.0",
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
    }, undefined, {
      module: "wagenpark",
      functie: "kwartaalcontroleFotoCheck",
      gebruikerId,
      entiteitstype: "voertuig",
      entiteitId: voertuig.id,
      promptNaam: "wagenpark-kwartaalcontrole-foto-check",
      promptVersie: "1.0.0",
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

// ── POST /wagenpark/meldingen/:id/doorzetten-garage ──────────────────────────
router.post("/meldingen/:id/doorzetten-garage", requireBevoegdheid("wagenpark", 2), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) return void res.status(400).json({ error: "Ongeldig id" });

  const body = req.body as {
    garage_email?: string;
    garage_naam?: string;
    notitie?: string;
  };
  const notitie = body.notitie;

  // Melding ophalen inclusief voertuig (met vaste garage) + monteur info
  const [rij] = await db
    .select({
      melding: wagenparkMeldingenTable,
      voertuig_kenteken: voertuigenTable.kenteken,
      voertuig_merk: voertuigenTable.merk,
      voertuig_garage_naam: voertuigenTable.garageNaam,
      voertuig_garage_email: voertuigenTable.garageEmail,
      monteur_naam: gebruikersTable.naam,
    })
    .from(wagenparkMeldingenTable)
    .leftJoin(voertuigenTable, eq(voertuigenTable.id, wagenparkMeldingenTable.voertuigId))
    .leftJoin(gebruikersTable, eq(gebruikersTable.id, wagenparkMeldingenTable.gemeldDoorId))
    .where(eq(wagenparkMeldingenTable.id, id));

  if (!rij) return void res.status(404).json({ error: "Melding niet gevonden" });

  // Vaste garage van het voertuig is de standaard; per melding overschrijfbaar.
  const garage_email = body.garage_email?.trim() || rij.voertuig_garage_email || "";
  const garage_naam = body.garage_naam?.trim() || rij.voertuig_garage_naam || undefined;

  if (!garage_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(garage_email)) {
    return void res.status(422).json({ error: "Geldig e-mailadres van garage is verplicht (stel eventueel een vaste garage in bij het voertuig)" });
  }

  const datumTijd = new Date().toLocaleDateString("nl-NL", {
    day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  // §6.1: eerst de mail, pas daarna de status. Mislukt de mail, dan blijft de
  // melding open, krijgt de beheerder een duidelijke fout én een werkbak-signaal.
  const { isGeconfigureerd, verstuurMail } = await import("../services/email.js");
  const meldGaragemailMislukt = async (reden: string) => {
    const { meldWerkbakItem } = await import("../lib/werkbakService.js");
    await meldWerkbakItem({
      soort: "doen",
      bron: "wagenpark_garagemail",
      titel: `Garagemail niet verstuurd — melding #${id} (${rij.voertuig_kenteken ?? "onbekend voertuig"})`,
      omschrijving: `Doorzetten naar ${garage_email} is mislukt: ${reden}. De melding staat nog open.`,
      vereisteModule: "wagenpark",
      vereistNiveau: 2,
      gewicht: 70,
      actiePad: "/wagenpark/meldingen",
      herkomstType: "wagenpark_melding",
      herkomstId: id,
      dedupSleutel: `garagemail:${id}`,
    }).catch((e) => req.log.error({ e }, "werkbak-signaal garagemail mislukt"));
  };

  if (!isGeconfigureerd()) {
    await meldGaragemailMislukt("e-mail is niet geconfigureerd");
    return void res.status(503).json({ error: "E-mail is niet geconfigureerd — de melding is NIET doorgezet" });
  }

  {
    const m = rij.melding;
    const voertuigLabel = [rij.voertuig_merk, rij.voertuig_kenteken ? `(${rij.voertuig_kenteken})` : null]
      .filter(Boolean).join(" ") || "Onbekend voertuig";
    const typeLabel = m.type === "storing" ? "Storing" : m.type === "schade" ? "Schade" : m.type;
    const ernstLabel = m.aiErnstIndicatie
      ? m.aiErnstIndicatie === "licht" ? "Licht" : m.aiErnstIndicatie === "matig" ? "Matig" : "Ernstig"
      : null;

    const extraDetails: string[] = [];
    if (m.type === "schade" && m.schadeLocatie) extraDetails.push(`Locatie: ${m.schadeLocatie}`);
    if (m.type === "storing" && m.storingType) extraDetails.push(`Type storing: ${m.storingType}`);
    if (ernstLabel) extraDetails.push(`Ernst: ${ernstLabel}`);
    if (m.aiKostenIndicatie) extraDetails.push("Kosten verwacht");

    const aiSectie = (m.aiDiagnose || m.aiOplossing) ? `
      <div style="background:#f8f9fa;border-radius:6px;padding:14px 16px;margin:16px 0;border-left:3px solid #e5710a;">
        <p style="font-size:12px;font-weight:600;color:#6b7280;margin:0 0 8px 0;text-transform:uppercase;letter-spacing:0.5px;">AI Diagnose</p>
        ${m.aiDiagnose ? `<p style="margin:0 0 6px 0;font-size:14px;color:#111827;"><strong>Diagnose:</strong> ${m.aiDiagnose}</p>` : ""}
        ${m.aiOplossing ? `<p style="margin:0;font-size:14px;color:#111827;"><strong>Aanbevolen aanpak:</strong> ${m.aiOplossing}</p>` : ""}
        ${m.aiKostenTekst ? `<p style="margin:8px 0 0 0;font-size:13px;color:#92400e;font-style:italic;">${m.aiKostenTekst}</p>` : ""}
      </div>` : "";

    const fotoTekst = (m.fotoPaden?.length ?? 0) > 0
      ? `<p style="font-size:13px;color:#374151;margin:8px 0 0 0;">Foto's bijgevoegd in de melding (${m.fotoPaden.length} stuks) — beschikbaar via FPS Connect.</p>`
      : "";

    const html = `<!DOCTYPE html><html lang="nl"><body style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827;">
      <div style="background:#e5710a;border-radius:8px 8px 0 0;padding:18px 20px;">
        <h2 style="color:#fff;margin:0;font-size:18px;">Voertuigmelding — ${typeLabel}</h2>
        <p style="color:rgba(255,255,255,0.85);margin:4px 0 0 0;font-size:13px;">Doorgezet via FPS Connect op ${datumTijd}</p>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px;padding:20px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:6px 0;color:#6b7280;width:140px;">Voertuig</td><td style="padding:6px 0;font-weight:600;">${voertuigLabel}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;">Type melding</td><td style="padding:6px 0;">${typeLabel}</td></tr>
          ${extraDetails.map((d) => `<tr><td style="padding:6px 0;color:#6b7280;">&nbsp;</td><td style="padding:6px 0;font-size:13px;color:#374151;">${d}</td></tr>`).join("")}
          <tr><td style="padding:6px 0;color:#6b7280;">Gemeld door</td><td style="padding:6px 0;">${rij.monteur_naam ?? "Onbekend"}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;">Datum melding</td><td style="padding:6px 0;">${m.aangemaaktOp ? new Date(m.aangemaaktOp).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" }) : "—"}</td></tr>
        </table>
        <div style="background:#fff7ed;border-radius:6px;padding:14px 16px;margin:16px 0;border-left:3px solid #f59e0b;">
          <p style="font-size:12px;font-weight:600;color:#6b7280;margin:0 0 6px 0;text-transform:uppercase;letter-spacing:0.5px;">Omschrijving</p>
          <p style="margin:0;font-size:14px;color:#111827;line-height:1.5;">${m.omschrijving}</p>
        </div>
        ${aiSectie}
        ${fotoTekst}
        ${notitie ? `<div style="margin-top:16px;padding:12px;background:#f3f4f6;border-radius:6px;font-size:13px;color:#374151;"><strong>Notitie van FPS:</strong> ${notitie}</div>` : ""}
        <hr style="border:0;border-top:1px solid #e5e7eb;margin:20px 0;">
        <p style="font-size:12px;color:#9ca3af;margin:0;">Dit bericht is automatisch gegenereerd vanuit FPS Connect. Neem voor vragen contact op met de afzender.</p>
      </div>
    </body></html>`;

    try {
      await verstuurMail({
        naarEmail: garage_email,
        naarNaam: garage_naam ?? null,
        onderwerp: `Voertuigmelding ${typeLabel} — ${voertuigLabel}`,
        html,
        soort: "voertuig_melding_garage",
      });
    } catch (mailErr) {
      // Mail mislukt → status blijft zoals hij was (open), duidelijke fout + werkbak-signaal.
      req.log.warn({ mailErr, garage_email }, "doorzetten-garage: e-mail versturen mislukt, melding NIET doorgezet");
      await meldGaragemailMislukt("de mail kon niet worden verstuurd");
      return void res.status(502).json({
        error: `De garagemail naar ${garage_email} kon niet worden verstuurd. De melding staat nog open; probeer het opnieuw of controleer het adres.`,
      });
    }
  }

  // Mail is aantoonbaar verstuurd → nu pas de status doorzetten.
  const opvolgNotitie = [
    rij.melding.opvolgNotitie,
    `Doorgezet naar garage (${garage_email}) op ${datumTijd}.`,
    notitie ? `Notitie: ${notitie}` : null,
  ].filter(Boolean).join("\n");

  const [bijgewerkt] = await db
    .update(wagenparkMeldingenTable)
    .set({ status: "doorgezet_garage", opvolgNotitie, bijgewerktOp: new Date() })
    .where(eq(wagenparkMeldingenTable.id, id))
    .returning();

  if (!bijgewerkt) return void res.status(500).json({ error: "Bijwerken mislukt" });

  // Eerder faal-signaal voor deze melding is hiermee opgelost.
  const { handelBronAf } = await import("../lib/werkbakService.js");
  await handelBronAf(`garagemail:${id}`).catch(() => undefined);

  return void res.json(mapMeldingNaarApi(bijgewerkt, {
    voertuig_kenteken: rij.voertuig_kenteken,
    voertuig_merk: rij.voertuig_merk,
    monteur_naam: rij.monteur_naam,
  }));
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

  const geldigeStatussen = ["nieuw", "in_beoordeling", "actie_nodig", "ingepland", "doorgezet_garage", "opgelost", "afgewezen_duplicaat"];
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
