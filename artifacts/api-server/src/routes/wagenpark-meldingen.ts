// Wagenpark meldingen — monteur meldt storing of schade via telefoon
// AI identificeert voertuig + probleem en stelt oplossing voor
// Kosten → melding zichtbaar voor administratie als interne opdracht

import { Router } from "express";
import {
  db,
  wagenparkMeldingenTable,
  voertuigenTable,
  gebruikersTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireBevoegdheid, requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { ObjectStorageService } from "../lib/objectStorage";
import { aiGateway, heeftGateway } from "../lib/aiGateway";

const router = Router();
const storageService = new ObjectStorageService();

// ── POST /wagenpark/meldingen — monteur maakt melding ───────────────────────
router.post("/meldingen", requireAuth, async (req, res): Promise<void> => {
  const gebruikerId = req.session?.["userId"] as number | undefined;
  if (!gebruikerId) return void res.status(401).json({ error: "Niet ingelogd" });

  const { type, omschrijving, foto_paden } = req.body as {
    type?: string;
    omschrijving?: string;
    foto_paden?: string[];
  };

  if (!omschrijving?.trim()) {
    return void res.status(422).json({ error: "Omschrijving is verplicht" });
  }

  const meldingType: "storing" | "schade" = type === "schade" ? "schade" : "storing";

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

  const fotoPaden: string[] = Array.isArray(foto_paden) ? foto_paden : [];

  // ── AI analyse ────────────────────────────────────────────────────────────
  let aiDiagnose: string | null = null;
  let aiOplossing: string | null = null;
  let aiKostenIndicatie = false;
  let aiKostenTekst: string | null = null;

  if (heeftGateway()) {
    try {
      const voertuigInfo =
        [voertuig.merk, voertuig.type, voertuig.kenteken ? `(${voertuig.kenteken})` : null]
          .filter(Boolean)
          .join(" ");

      const prompt =
        `Je bent een ervaren wagenparkbeheerder bij een brandpreventie-bedrijf. ` +
        `Een monteur meldt het volgende voor voertuig ${voertuigInfo}:\n\n` +
        `Type melding: ${meldingType}\n` +
        `Beschrijving: ${omschrijving.trim()}\n\n` +
        `Geef een korte diagnose van het probleem, een praktische oplossing en beoordeel of er kosten aan verbonden zijn. ` +
        `Antwoord altijd in het Nederlands. Geef je antwoord als JSON:\n` +
        `{\n` +
        `  "diagnose": "...",\n` +
        `  "oplossing": "...",\n` +
        `  "kosten_indicatie": true/false,\n` +
        `  "kosten_tekst": "..." (alleen invullen als kosten_indicatie true is, bijv. "Geraamde reparatiekosten €150-€300")\n` +
        `}`;

      type VisionContent =
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string; detail: "low" } };

      const content: VisionContent[] = [];

      // Eerste foto als vision-input meesturen
      if (fotoPaden.length > 0) {
        try {
          const genormaliseerd = storageService.normalizeObjectEntityPath(fotoPaden[0]);
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
          const dataUrl = `data:${contentType};base64,${buffer.toString("base64")}`;
          content.push({ type: "image_url", image_url: { url: dataUrl, detail: "low" } });
        } catch (fotoErr) {
          logger.warn({ fotoErr }, "Foto ophalen voor AI mislukt, doorgaan zonder");
        }
      }

      content.push({ type: "text", text: prompt });

      const wagenparkChatResultaat = await aiGateway.chat("default", {
        max_tokens: 500,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        messages: [{ role: "user", content } as any],
      });

      const raw = wagenparkChatResultaat.ok ? wagenparkChatResultaat.inhoud : "";
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]) as {
          diagnose?: string;
          oplossing?: string;
          kosten_indicatie?: boolean;
          kosten_tekst?: string;
        };
        aiDiagnose = parsed.diagnose?.trim() ?? null;
        aiOplossing = parsed.oplossing?.trim() ?? null;
        aiKostenIndicatie = parsed.kosten_indicatie === true;
        aiKostenTekst = aiKostenIndicatie ? (parsed.kosten_tekst?.trim() ?? null) : null;
      }
    } catch (err) {
      logger.warn({ err }, "AI analyse voertuigmelding mislukt");
    }
  }

  // ── Melding opslaan ────────────────────────────────────────────────────────
  const inserted = await db
    .insert(wagenparkMeldingenTable)
    .values({
      voertuigId: voertuig.id,
      gemeldDoorId: gebruikerId,
      type: meldingType,
      omschrijving: omschrijving.trim(),
      fotoPaden,
      aiDiagnose,
      aiOplossing,
      aiKostenIndicatie,
      aiKostenTekst,
      status: "nieuw",
    })
    .returning();

  const melding = inserted[0];
  if (!melding) return void res.status(500).json({ error: "Opslaan mislukt" });

  return void res.status(201).json({
    ...melding,
    voertuig_kenteken: voertuig.kenteken,
    voertuig_merk: voertuig.merk,
    voertuig_type_naam: voertuig.type,
  });
});

// ── GET /wagenpark/meldingen — beheerder bekijkt alle meldingen ──────────────
router.get("/meldingen", requireBevoegdheid("offertes", 1), async (req, res): Promise<void> => {
  const { voertuig_id, status } = req.query as {
    voertuig_id?: string;
    status?: string;
  };

  const rows = await db
    .select({
      melding: wagenparkMeldingenTable,
      voertuig_kenteken: voertuigenTable.kenteken,
      voertuig_merk: voertuigenTable.merk,
      voertuig_type_naam: voertuigenTable.type,
      monteur_naam: gebruikersTable.naam,
    })
    .from(wagenparkMeldingenTable)
    .leftJoin(voertuigenTable, eq(wagenparkMeldingenTable.voertuigId, voertuigenTable.id))
    .leftJoin(gebruikersTable, eq(wagenparkMeldingenTable.gemeldDoorId, gebruikersTable.id))
    .where(
      voertuig_id
        ? eq(wagenparkMeldingenTable.voertuigId, parseInt(voertuig_id, 10))
        : undefined,
    )
    .orderBy(desc(wagenparkMeldingenTable.aangemaaktOp));

  const gefilterd = status ? rows.filter((r) => r.melding.status === status) : rows;

  return void res.json(
    gefilterd.map((r) => ({
      ...r.melding,
      voertuig_kenteken: r.voertuig_kenteken,
      voertuig_merk: r.voertuig_merk,
      voertuig_type_naam: r.voertuig_type_naam,
      monteur_naam: r.monteur_naam,
    })),
  );
});

// ── PATCH /wagenpark/meldingen/:id — status bijwerken / admin notitie ────────
router.patch("/meldingen/:id", requireBevoegdheid("offertes", 2), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) return void res.status(400).json({ error: "Ongeldig id" });

  const { status, admin_notitie } = req.body as {
    status?: "nieuw" | "in_behandeling" | "afgehandeld";
    admin_notitie?: string;
  };

  const update: Partial<typeof wagenparkMeldingenTable.$inferInsert> = {
    bijgewerktOp: new Date(),
  };
  if (status) update.status = status;
  if (admin_notitie !== undefined) update.adminNotitie = admin_notitie;

  const updated = await db
    .update(wagenparkMeldingenTable)
    .set(update)
    .where(eq(wagenparkMeldingenTable.id, id))
    .returning();

  if (!updated[0]) return void res.status(404).json({ error: "Niet gevonden" });
  return void res.json(updated[0]);
});

export default router;
