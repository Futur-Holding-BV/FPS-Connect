// Digitale Uitvoerder — AI-consult per monteur per werkdag
// Monteur stelt vragen + foto, AI geeft uitvoeringsadvies, monteur legt aanpak vast
import { Router } from "express";
import {
  db,
  uitvoerderSessiesTable,
  uitvoerderBerichtenTable,
  opdrachtenTable,
  gebruikersTable,
  planningItemsTable,
} from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { ObjectStorageService } from "../lib/objectStorage";
import { maakOpenAiClient, heeftOpenAi } from "../lib/openai";

const router = Router();

const lezen = requireBevoegdheid("offertes", 1);

// ── Hulpfuncties ────────────────────────────────────────────────────────────

function mapSessie(s: typeof uitvoerderSessiesTable.$inferSelect) {
  return {
    id: s.id,
    werkdag_id: s.werkdagId,
    opdracht_id: s.opdrachtId,
    monteur_id: s.monteurId,
    status: s.status,
    gekozen_aanpak: s.gekozenAanpak,
    gekozen_aanpak_op: s.gekozenAanpakOp,
    aangemaakt_op: s.aangemaaktOp,
    bijgewerkt_op: s.bijgewerktOp,
  };
}

function mapBericht(b: typeof uitvoerderBerichtenTable.$inferSelect) {
  return {
    id: b.id,
    sessie_id: b.sessieId,
    rol: b.rol,
    inhoud: b.inhoud,
    foto_pad: b.fotoPad,
    aangemaakt_op: b.aangemaaktOp,
  };
}

// ── POST /uitvoerder/sessies ────────────────────────────────────────────────
// Monteur start of hervat een sessie voor een werkdag
// Returned sessie + bestaande berichten

router.post("/uitvoerder/sessies", async (req, res) => {
  const gebruikerId = (req.session as { gebruikerId?: number }).gebruikerId;
  if (!gebruikerId) return res.status(401).json({ error: "Niet ingelogd" });

  const { werkdag_id, opdracht_id } = req.body as {
    werkdag_id?: number;
    opdracht_id?: number;
  };

  // Resolve opdracht_id via werkdag als niet direct opgegeven
  let opdrachtId: number | null = opdracht_id ?? null;
  if (!opdrachtId && werkdag_id) {
    const [pi] = await db
      .select({ opdrachtId: planningItemsTable.opdrachtId })
      .from(planningItemsTable)
      .where(eq(planningItemsTable.id, werkdag_id));
    opdrachtId = pi?.opdrachtId ?? null;
  }

  // Zoek bestaande actieve/bevestigde sessie voor deze monteur + werkdag
  let sessie: typeof uitvoerderSessiesTable.$inferSelect | undefined;
  if (werkdag_id) {
    const [bestaand] = await db
      .select()
      .from(uitvoerderSessiesTable)
      .where(
        and(
          eq(uitvoerderSessiesTable.monteurId, gebruikerId),
          eq(uitvoerderSessiesTable.werkdagId, werkdag_id),
        ),
      )
      .limit(1);
    sessie = bestaand;
  }

  if (!sessie) {
    const inserted = await db
      .insert(uitvoerderSessiesTable)
      .values({
        werkdagId: werkdag_id ?? null,
        opdrachtId: opdrachtId,
        monteurId: gebruikerId,
        status: "actief",
      })
      .returning();
    sessie = inserted[0];
  }

  if (!sessie) return res.status(500).json({ error: "Sessie kon niet worden aangemaakt" });

  const berichten = await db
    .select()
    .from(uitvoerderBerichtenTable)
    .where(eq(uitvoerderBerichtenTable.sessieId, sessie.id))
    .orderBy(uitvoerderBerichtenTable.aangemaaktOp);

  return res.json({
    sessie: mapSessie(sessie),
    berichten: berichten.map(mapBericht),
  });
});

// ── GET /uitvoerder/sessies/:id ─────────────────────────────────────────────
// Sessie ophalen inclusief berichten
// Toegankelijk voor eigenaar (monteur) of WV/PL

router.get("/uitvoerder/sessies/:id", async (req, res) => {
  const gebruikerId = (req.session as { gebruikerId?: number }).gebruikerId;
  if (!gebruikerId) return res.status(401).json({ error: "Niet ingelogd" });

  const id = parseInt(String(req.params["id"] ?? "0"), 10);

  const [sessie] = await db
    .select()
    .from(uitvoerderSessiesTable)
    .where(eq(uitvoerderSessiesTable.id, id));
  if (!sessie) return res.status(404).json({ error: "Sessie niet gevonden" });

  // Toegang: eigenaar of bevoegdheid werkvoorbereiding:lezen
  const isEigenaar = sessie.monteurId === gebruikerId;
  if (!isEigenaar) {
    return res.status(403).json({ error: "Geen toegang tot deze sessie" });
  }

  const berichten = await db
    .select()
    .from(uitvoerderBerichtenTable)
    .where(eq(uitvoerderBerichtenTable.sessieId, id))
    .orderBy(uitvoerderBerichtenTable.aangemaaktOp);

  let opdracht: { titel: string; werknummer: string | null; omschrijving: string | null } | null = null;
  if (sessie.opdrachtId) {
    const [o] = await db
      .select({ titel: opdrachtenTable.titel, werknummer: opdrachtenTable.werknummer, omschrijving: opdrachtenTable.omschrijving })
      .from(opdrachtenTable)
      .where(eq(opdrachtenTable.id, sessie.opdrachtId));
    opdracht = o ?? null;
  }

  return res.json({ sessie: mapSessie(sessie), berichten: berichten.map(mapBericht), opdracht });
});

// ── POST /uitvoerder/sessies/:id/berichten ─────────────────────────────────
// Monteur stuurt een bericht (+ optioneel foto), AI antwoordt synchroon

router.post("/uitvoerder/sessies/:id/berichten", async (req, res) => {
  const gebruikerId = (req.session as { gebruikerId?: number }).gebruikerId;
  if (!gebruikerId) return res.status(401).json({ error: "Niet ingelogd" });

  const sessieId = parseInt(String(req.params["id"] ?? "0"), 10);

  const [sessie] = await db
    .select()
    .from(uitvoerderSessiesTable)
    .where(eq(uitvoerderSessiesTable.id, sessieId));
  if (!sessie) return res.status(404).json({ error: "Sessie niet gevonden" });
  if (sessie.monteurId !== gebruikerId) return res.status(403).json({ error: "Geen toegang" });
  if (sessie.status === "bevestigd") return res.status(409).json({ error: "Sessie is bevestigd" });

  const { inhoud, foto_pad } = req.body as { inhoud?: string; foto_pad?: string };
  if (!inhoud?.trim()) return res.status(400).json({ error: "inhoud is verplicht" });

  // Sla monteur-bericht op
  const [monteurBericht] = await db
    .insert(uitvoerderBerichtenTable)
    .values({ sessieId, rol: "monteur", inhoud: inhoud.trim(), fotoPad: foto_pad ?? null })
    .returning();

  // Laad volledige geschiedenis + opdracht-context voor AI
  const geschiedenis = await db
    .select()
    .from(uitvoerderBerichtenTable)
    .where(eq(uitvoerderBerichtenTable.sessieId, sessieId))
    .orderBy(uitvoerderBerichtenTable.aangemaaktOp);

  let opdrachtContext = "";
  if (sessie.opdrachtId) {
    const [o] = await db
      .select({ titel: opdrachtenTable.titel, werknummer: opdrachtenTable.werknummer, omschrijving: opdrachtenTable.omschrijving, type: opdrachtenTable.type })
      .from(opdrachtenTable)
      .where(eq(opdrachtenTable.id, sessie.opdrachtId));
    if (o) {
      opdrachtContext = `Opdracht: ${o.titel}${o.werknummer ? ` (${o.werknummer})` : ""}${o.type ? ` — type: ${o.type}` : ""}${o.omschrijving ? `\nOmschrijving: ${o.omschrijving}` : ""}`;
    }
  }

  if (!heeftOpenAi()) {
    return res.status(503).json({ error: "AI niet beschikbaar" });
  }

  // Foto van huidig bericht laden voor vision
  let fotoBase64: string | null = null;
  if (foto_pad) {
    try {
      const storage = new ObjectStorageService();
      const storageFile = await storage.getObjectEntityFile(foto_pad);
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
      logger.warn({ err, sessieId }, "Foto laden voor AI mislukt");
    }
  }

  // Bouw GPT-4o berichten array op
  type ContentPart =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail: "high" } };

  type GptMessage =
    | { role: "system"; content: string }
    | { role: "user"; content: string | ContentPart[] }
    | { role: "assistant"; content: string };

  const systemPrompt = `Je bent de Digitale Uitvoerder van FPS Brandpreventie — een ervaren brandpreventie-uitvoerder die monteurs op locatie begeleidt.${opdrachtContext ? `\n\n${opdrachtContext}` : ""}

Jouw rol:
- Geef concrete, praktische uitvoeringsadviezen voor brandpreventieve maatregelen
- Stel gerichte vragen als je meer context nodig hebt (bijv. type constructie, materiaal, dikte)
- Controleer of de beschreven aanpak voldoet aan de norm en toepassing
- Waarschuw bij afwijkingen, risico's of ontbrekende informatie
- Houd antwoorden kort en praktisch — de monteur staat op de bouwplaats
- Verwijs bij twijfel over certificering of norm naar de werkvoorbereider

Kennisgebied: brandwerende deuren, doorvoeringen, brandkleppen, manchetten (EPDM/intumescent), coatings, scheidingen (EW/EI), SnagStream-documentatie, Reac-normen.`;

  const gptMessages: GptMessage[] = [{ role: "system", content: systemPrompt }];

  for (const b of geschiedenis) {
    if (b.rol === "monteur") {
      const tekstDeel: ContentPart = { type: "text", text: b.inhoud };
      const isHuidig = b.id === monteurBericht.id;
      if (isHuidig && fotoBase64) {
        gptMessages.push({
          role: "user",
          content: [
            tekstDeel,
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${fotoBase64}`, detail: "high" } },
          ],
        });
      } else {
        gptMessages.push({ role: "user", content: b.inhoud });
      }
    } else {
      gptMessages.push({ role: "assistant", content: b.inhoud });
    }
  }

  try {
    const openai = maakOpenAiClient();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 600,
      messages: gptMessages,
    });

    const aiTekst = completion.choices[0]?.message?.content?.trim() ?? "Geen antwoord ontvangen.";

    const [aiBericht] = await db
      .insert(uitvoerderBerichtenTable)
      .values({ sessieId, rol: "ai", inhoud: aiTekst })
      .returning();

    await db
      .update(uitvoerderSessiesTable)
      .set({ bijgewerktOp: new Date() })
      .where(eq(uitvoerderSessiesTable.id, sessieId));

    return res.json({
      monteur_bericht: mapBericht(monteurBericht),
      ai_bericht: mapBericht(aiBericht),
    });
  } catch (err) {
    logger.error({ err, sessieId }, "AI uitvoerder bericht mislukt");
    return res.status(502).json({ error: "AI kon geen antwoord geven, probeer opnieuw" });
  }
});

// ── POST /uitvoerder/sessies/:id/bevestig ───────────────────────────────────
// Monteur legt de gekozen aanpak vast — sessie wordt bevestigd

router.post("/uitvoerder/sessies/:id/bevestig", async (req, res) => {
  const gebruikerId = (req.session as { gebruikerId?: number }).gebruikerId;
  if (!gebruikerId) return res.status(401).json({ error: "Niet ingelogd" });

  const sessieId = parseInt(String(req.params["id"] ?? "0"), 10);
  const { gekozen_aanpak } = req.body as { gekozen_aanpak?: string };

  if (!gekozen_aanpak?.trim()) return res.status(400).json({ error: "gekozen_aanpak is verplicht" });

  const [sessie] = await db
    .select()
    .from(uitvoerderSessiesTable)
    .where(eq(uitvoerderSessiesTable.id, sessieId));
  if (!sessie) return res.status(404).json({ error: "Sessie niet gevonden" });
  if (sessie.monteurId !== gebruikerId) return res.status(403).json({ error: "Geen toegang" });

  const nu = new Date();
  const [bijgewerkt] = await db
    .update(uitvoerderSessiesTable)
    .set({
      status: "bevestigd",
      gekozenAanpak: gekozen_aanpak.trim(),
      gekozenAanpakOp: nu,
      bijgewerktOp: nu,
    })
    .where(eq(uitvoerderSessiesTable.id, sessieId))
    .returning();

  return res.json({ sessie: mapSessie(bijgewerkt) });
});

// ── GET /uitvoerder/log ─────────────────────────────────────────────────────
// Projectleider / werkvoorbereider leest logs van alle sessies
// Query: ?opdracht_id=N (optioneel)

router.get("/uitvoerder/log", lezen, async (req, res) => {
  const { opdracht_id } = req.query as { opdracht_id?: string };

  const sessies = await db
    .select()
    .from(uitvoerderSessiesTable)
    .where(
      opdracht_id
        ? eq(uitvoerderSessiesTable.opdrachtId, parseInt(opdracht_id, 10))
        : undefined,
    )
    .orderBy(desc(uitvoerderSessiesTable.bijgewerktOp));

  if (sessies.length === 0) return res.json([]);

  const sessieIds = sessies.map((s) => s.id);
  const monteurIds = [...new Set(sessies.map((s) => s.monteurId))];
  const opdrachtIds = [...new Set(sessies.map((s) => s.opdrachtId).filter((id): id is number => id != null))];

  const [berichten, monteurs, opdrachten] = await Promise.all([
    db
      .select()
      .from(uitvoerderBerichtenTable)
      .where(inArray(uitvoerderBerichtenTable.sessieId, sessieIds))
      .orderBy(uitvoerderBerichtenTable.aangemaaktOp),
    db
      .select({ id: gebruikersTable.id, naam: gebruikersTable.naam })
      .from(gebruikersTable)
      .where(inArray(gebruikersTable.id, monteurIds)),
    opdrachtIds.length > 0
      ? db
          .select({ id: opdrachtenTable.id, titel: opdrachtenTable.titel, werknummer: opdrachtenTable.werknummer })
          .from(opdrachtenTable)
          .where(inArray(opdrachtenTable.id, opdrachtIds))
      : Promise.resolve([]),
  ]);

  const berichtenPerSessie = new Map<number, typeof berichten>();
  for (const b of berichten) {
    if (!berichtenPerSessie.has(b.sessieId)) berichtenPerSessie.set(b.sessieId, []);
    berichtenPerSessie.get(b.sessieId)!.push(b);
  }
  const monteurMap = new Map(monteurs.map((m) => [m.id, m.naam]));
  const opdrachtMap = new Map(opdrachten.map((o) => [o.id, o]));

  return res.json(
    sessies.map((s) => ({
      ...mapSessie(s),
      monteur_naam: monteurMap.get(s.monteurId) ?? null,
      opdracht_titel: s.opdrachtId != null ? (opdrachtMap.get(s.opdrachtId)?.titel ?? null) : null,
      opdracht_werknummer: s.opdrachtId != null ? (opdrachtMap.get(s.opdrachtId)?.werknummer ?? null) : null,
      berichten: (berichtenPerSessie.get(s.id) ?? []).map(mapBericht),
    })),
  );
});

export default router;
