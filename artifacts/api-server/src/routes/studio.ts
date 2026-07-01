// Document Studio — referentiebibliotheek per werkmaatschappij.
// Beheert modellen (geen|referentie|concept|goedgekeurd) per documenttype per werkgever.
import { Router } from "express";
import { randomUUID } from "crypto";
import { createRequire } from "node:module";
import multer from "multer";
import { db, documentStudioModellenTable, werkgeversTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { ObjectStorageService } from "../lib/objectStorage";
import { heeftOpenAi, maakOpenAiClient } from "../lib/openai";
import { logActiviteit } from "../lib/activiteit";

import { z } from "zod";

// pdf-parse is CJS-only; gebruik createRequire voor ESM-compatibiliteit.
const _req = createRequire(import.meta.url);
type PdfParseFn = (buf: Buffer) => Promise<{ text: string; numpages: number }>;
const pdfParse: PdfParseFn = (_req("pdf-parse") as { default?: PdfParseFn }).default ?? (_req("pdf-parse") as PdfParseFn);

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const oss = new ObjectStorageService();

// ── Zod schema voor StudioTemplateJson — validatie van AI-output ─────────────

const studioTemplateSectieSchema = z.object({
  type:   z.enum(["tekst", "tabel", "ondertekening", "checklist"]),
  titel:  z.string().nullable(),
  inhoud: z.string(),
});

const studioTemplateJsonSchema = z.object({
  familie:    z.enum(["A", "B", "C"]),
  koptekst:   z.object({
    logo_positie: z.enum(["links", "rechts", "midden"]),
    titel:        z.string(),
    subinfo:      z.string().nullable(),
  }),
  kleurschema: z.object({
    primair:   z.string(),
    secundair: z.string(),
    tekst:     z.string(),
  }),
  secties:    z.array(studioTemplateSectieSchema),
  voettekst:  z.string().nullable(),
});

function valideerTemplateJson(json: string): z.infer<typeof studioTemplateJsonSchema> {
  const parsed: unknown = JSON.parse(json);
  return studioTemplateJsonSchema.parse(parsed);
}

const lezen   = requireBevoegdheid("organisatie", 1);
const schrijven = requireBevoegdheid("organisatie", 2);

const GELDIGE_TYPES = [
  "offerte", "brief", "email", "lmra", "toolbox", "inkoopbon", "factuur", "calculatie", "opleverrapport",
] as const;

function parseId(v: unknown): number {
  return parseInt(String(v), 10);
}

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

function mapModel(
  r: typeof documentStudioModellenTable.$inferSelect,
  werkgeverNaam?: string | null,
) {
  return {
    id:                     r.id,
    werkgever_id:           r.werkgeverId,
    werkgever_naam:         werkgeverNaam ?? null,
    document_type:          r.documentType,
    naam:                   r.naam,
    status:                 r.status,
    referentie_bestand_pad: r.referentieBestandPad,
    connect_template_json:  r.connectTemplateJson,
    versie:                 r.versie,
    goedgekeurd_op:         iso(r.goedgekeurdOp),
    goedgekeurd_door:       r.goedgekeurdDoor,
    aangemaakt_op:          r.aangemaaktOp.toISOString(),
    bijgewerkt_op:          iso(r.bijgewerktOp),
  };
}

// ── Werkgevers — selector voor Document Studio (gated op organisatie:1) ───────

router.get("/studio/werkgevers", lezen, async (req, res) => {
  try {
    const werkgevers = await db
      .select({
        id:           werkgeversTable.id,
        naam:         werkgeversTable.naam,
        primaireKleur: werkgeversTable.primaireKleur,
        logoUrl:      werkgeversTable.logoUrl,
        voettekst:    werkgeversTable.voettekst,
      })
      .from(werkgeversTable)
      .orderBy(werkgeversTable.naam);

    res.json(
      werkgevers.map((w) => ({
        id:             w.id,
        naam:           w.naam,
        primaire_kleur: w.primaireKleur ?? null,
        logo_url:       w.logoUrl ?? null,
        voettekst:      w.voettekst ?? null,
      })),
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── List — optioneel gefilterd op werkgever_id ────────────────────────────────

router.get("/studio/modellen", lezen, async (req, res) => {
  try {
    const werkgeverId = req.query.werkgever_id
      ? parseInt(String(req.query.werkgever_id), 10)
      : null;

    const modellen = await db
      .select({
        model:   documentStudioModellenTable,
        naam:    werkgeversTable.naam,
      })
      .from(documentStudioModellenTable)
      .leftJoin(werkgeversTable, eq(documentStudioModellenTable.werkgeverId, werkgeversTable.id))
      .where(
        werkgeverId
          ? eq(documentStudioModellenTable.werkgeverId, werkgeverId)
          : undefined,
      )
      .orderBy(documentStudioModellenTable.documentType);

    res.json(modellen.map(({ model, naam }) => mapModel(model, naam)));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Actief model — haal het goedgekeurde model op voor een werkgever + type ──

router.get("/studio/modellen/actief", lezen, async (req, res) => {
  try {
    const werkgeverId = req.query.werkgever_id
      ? parseInt(String(req.query.werkgever_id), 10)
      : null;
    const documentType = req.query.document_type
      ? String(req.query.document_type)
      : null;

    if (!werkgeverId || isNaN(werkgeverId)) {
      return res.status(400).json({ error: "werkgever_id is verplicht" });
    }
    if (!documentType) {
      return res.status(400).json({ error: "document_type is verplicht" });
    }

    const [rij] = await db
      .select({ model: documentStudioModellenTable, naam: werkgeversTable.naam })
      .from(documentStudioModellenTable)
      .leftJoin(werkgeversTable, eq(documentStudioModellenTable.werkgeverId, werkgeversTable.id))
      .where(
        and(
          eq(documentStudioModellenTable.werkgeverId, werkgeverId),
          eq(documentStudioModellenTable.documentType, documentType),
          eq(documentStudioModellenTable.status, "goedgekeurd"),
        ),
      );

    if (!rij) return res.json(null);
    res.json(mapModel(rij.model, rij.naam));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Actieve modellen bulk — alle goedgekeurde templates voor een werkgever ────

router.get("/studio/werkgevers/:werkgever_id/modellen/actief", lezen, async (req, res) => {
  try {
    const werkgeverId = parseId(req.params.werkgever_id);
    if (!werkgeverId) return res.status(400).json({ error: "werkgever_id ongeldig" });

    const rijen = await db
      .select({ model: documentStudioModellenTable, naam: werkgeversTable.naam })
      .from(documentStudioModellenTable)
      .leftJoin(werkgeversTable, eq(documentStudioModellenTable.werkgeverId, werkgeversTable.id))
      .where(
        and(
          eq(documentStudioModellenTable.werkgeverId, werkgeverId),
          eq(documentStudioModellenTable.status, "goedgekeurd"),
        ),
      );

    const result: Record<string, ReturnType<typeof mapModel>> = {};
    for (const rij of rijen) {
      result[rij.model.documentType] = mapModel(rij.model, rij.naam);
    }
    res.json(result);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Get by id ─────────────────────────────────────────────────────────────────

router.get("/studio/modellen/:id", lezen, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const [rij] = await db
      .select({ model: documentStudioModellenTable, naam: werkgeversTable.naam })
      .from(documentStudioModellenTable)
      .leftJoin(werkgeversTable, eq(documentStudioModellenTable.werkgeverId, werkgeversTable.id))
      .where(eq(documentStudioModellenTable.id, id));
    if (!rij) return res.status(404).json({ error: "Model niet gevonden" });
    res.json(mapModel(rij.model, rij.naam));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Upsert — aanmaken of bijwerken op (werkgever_id, document_type) ───────────

router.post("/studio/modellen", schrijven, async (req, res) => {
  try {
    const { werkgever_id, document_type, naam, status } = req.body as {
      werkgever_id: number;
      document_type: string;
      naam?: string | null;
      status?: string;
    };

    if (!werkgever_id || typeof werkgever_id !== "number") {
      return res.status(400).json({ error: "werkgever_id is verplicht" });
    }
    if (!document_type || !GELDIGE_TYPES.includes(document_type as never)) {
      return res.status(400).json({ error: `document_type moet een van de volgende zijn: ${GELDIGE_TYPES.join(", ")}` });
    }

    // Zoek bestaand model voor deze werkgever + type
    const [bestaand] = await db
      .select()
      .from(documentStudioModellenTable)
      .where(
        and(
          eq(documentStudioModellenTable.werkgeverId, werkgever_id),
          eq(documentStudioModellenTable.documentType, document_type),
        ),
      );

    let model: typeof documentStudioModellenTable.$inferSelect;

    if (bestaand) {
      const [bijgewerkt] = await db
        .update(documentStudioModellenTable)
        .set({
          ...(naam !== undefined ? { naam } : {}),
          ...(status ? { status } : {}),
          bijgewerktOp: new Date(),
        })
        .where(eq(documentStudioModellenTable.id, bestaand.id))
        .returning();
      model = bijgewerkt;
    } else {
      const [nieuw] = await db
        .insert(documentStudioModellenTable)
        .values({
          werkgeverId:  werkgever_id,
          documentType: document_type,
          naam:         naam ?? null,
          status:       status ?? "geen",
        })
        .returning();
      model = nieuw;
    }

    // Naam werkgever ophalen voor response
    const [wg] = await db
      .select({ naam: werkgeversTable.naam })
      .from(werkgeversTable)
      .where(eq(werkgeversTable.id, werkgever_id));

    res.json(mapModel(model, wg?.naam ?? null));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Patch ─────────────────────────────────────────────────────────────────────

router.patch("/studio/modellen/:id", schrijven, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const { naam, status, connect_template_json, goedgekeurd_door } = req.body as {
      naam?: string | null;
      status?: string;
      connect_template_json?: string | null;
      goedgekeurd_door?: number | null;
    };

    const setObj: Partial<typeof documentStudioModellenTable.$inferInsert> & { bijgewerktOp: Date } = {
      bijgewerktOp: new Date(),
    };
    if (naam !== undefined)                   setObj.naam = naam;
    if (status !== undefined)                 setObj.status = status;
    if (connect_template_json !== undefined)  setObj.connectTemplateJson = connect_template_json;
    if (goedgekeurd_door !== undefined)       setObj.goedgekeurdDoor = goedgekeurd_door;

    const [rij] = await db
      .update(documentStudioModellenTable)
      .set(setObj)
      .where(eq(documentStudioModellenTable.id, id))
      .returning();
    if (!rij) return res.status(404).json({ error: "Model niet gevonden" });

    const [wg] = await db
      .select({ naam: werkgeversTable.naam })
      .from(werkgeversTable)
      .where(eq(werkgeversTable.id, rij.werkgeverId));

    res.json(mapModel(rij, wg?.naam ?? null));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Referentie upload ─────────────────────────────────────────────────────────

router.post(
  "/studio/modellen/:id/referentie-upload",
  schrijven,
  upload.single("bestand"),
  async (req, res) => {
    try {
      const id = parseId(req.params.id);

      if (!req.file) {
        return res.status(400).json({ error: "Geen bestand ontvangen" });
      }

      const bestand = req.file;
      const toegestaan = [
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/webp",
      ];
      if (!toegestaan.includes(bestand.mimetype)) {
        return res.status(400).json({ error: "Bestandstype niet ondersteund — upload een PDF of afbeelding" });
      }

      const [bestaand] = await db
        .select()
        .from(documentStudioModellenTable)
        .where(eq(documentStudioModellenTable.id, id));
      if (!bestaand) return res.status(404).json({ error: "Model niet gevonden" });

      // Upload naar object storage
      const ext = bestand.originalname.includes(".")
        ? "." + bestand.originalname.split(".").pop()
        : "";
      const subPath = `algemeen/studio/${randomUUID()}${ext}`;
      const bestandPad = await oss.uploadBestand(subPath, bestand.buffer, bestand.mimetype);

      // Status bijwerken naar referentie (als nog geen hoger model)
      const nieuweStatus = bestaand.status === "geen" ? "referentie" : bestaand.status;

      const [bijgewerkt] = await db
        .update(documentStudioModellenTable)
        .set({
          referentieBestandPad: bestandPad,
          status:               nieuweStatus,
          bijgewerktOp:         new Date(),
        })
        .where(eq(documentStudioModellenTable.id, id))
        .returning();

      const [wg] = await db
        .select({ naam: werkgeversTable.naam })
        .from(werkgeversTable)
        .where(eq(werkgeversTable.id, bijgewerkt.werkgeverId));

      res.json(mapModel(bijgewerkt, wg?.naam ?? null));
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Interne serverfout" });
    }
  },
);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Download een bestand van object storage als Buffer via createReadStream. */
async function downloadAlsBuffer(pad: string): Promise<Buffer> {
  const file = await oss.getObjectEntityFile(pad);
  const stream = file.createReadStream();
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    stream.on("data", (chunk: Buffer | Uint8Array) => chunks.push(Buffer.from(chunk)));
    stream.on("end", resolve);
    stream.on("error", reject);
  });
  return Buffer.concat(chunks);
}

/** Extraheer leesbare tekst uit een PDF of geef lege string terug voor afbeeldingen. */
async function extraheerTekst(buffer: Buffer, pad: string): Promise<string> {
  const ext = pad.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") {
    try {
      const resultaat = await pdfParse(buffer);
      return resultaat.text.trim().slice(0, 8000); // limiet voor prompt
    } catch {
      return "";
    }
  }
  // Afbeelding: geen tekst-extractie
  return "";
}

/** Systeem-prompt voor AI template-generatie. */
function bouwPrompt(params: {
  documentType: string;
  documentTekst: string;
  heeftAfbeelding: boolean;
  werkgeverNaam: string;
  primaireKleur: string | null;
  voettekst: string | null;
  instructie?: string | null;
}): string {
  const typeNaam: Record<string, string> = {
    offerte: "Offerte",
    oplevering: "Opleverrapport brandpreventieve voorzieningen",
    brief: "Formele brief",
    email: "E-mail sjabloon",
    lmra: "LMRA (Laatste Minuut Risico Analyse checklist)",
    toolbox: "Toolbox-meeting document",
    inkoopbon: "Inkoopbon",
    factuur: "Factuur",
    calculatie: "Calculatie-werkblad",
  };
  const familieAdvies: Record<string, string> = {
    offerte: "A",
    oplevering: "A",
    brief: "B",
    email: "B",
    lmra: "C",
    toolbox: "C",
    inkoopbon: "C",
    factuur: "B",
    calculatie: "C",
  };
  const naam = typeNaam[params.documentType] ?? params.documentType;
  const familie = familieAdvies[params.documentType] ?? "A";

  return `Je bent een document-opmaakexpert voor het Nederlandse brandpreventie-platform FPS Connect.
Genereer een Connect-template JSON voor een "${naam}" document voor werkmaatschappij "${params.werkgeverNaam}".

Gebruik de volgende branding:
- Primaire kleur: ${params.primaireKleur ?? "#F23B0D"} (gebruik als kleurschema.primair)
- Secundaire kleur: een donkerdere of lichtere variant van de primaire kleur
- Tekstkleur: #1a1a1a (donkergrijs voor leesbaarheid)
- Voettekst: ${params.voettekst ?? `${params.werkgeverNaam} | Platform voor brandpreventie`}

Geadviseerde familie: ${familie}
- Familie A = klantdocumenten (offertes, rapporten) — hero-image, vetgedrukte opmaak, representatief
- Familie B = HRM/juridisch (contracten, brieven, facturen) — professioneel, ondertekeningsvakken, formeel
- Familie C = interne operationele documenten (LMRA, toolbox, checklists) — gestructureerd, formulier-achtig

${params.documentTekst
    ? `Referentietekst uit het huidige document (eerste 8000 tekens):\n---\n${params.documentTekst}\n---\n`
    : params.heeftAfbeelding
      ? "Het referentiebestand is een afbeelding (geen tekst beschikbaar).\n"
      : "Geen referentietekst beschikbaar.\n"
  }
${params.instructie ? `Extra bijstuur-instructie van de gebruiker: ${params.instructie}\n` : ""}
Retourneer UITSLUITEND de volgende JSON zonder extra tekst of markdown-omhulsel:
{
  "familie": "${familie}",
  "koptekst": {
    "logo_positie": "links",
    "titel": "<documenttitel in het Nederlands, bv. 'Offerte' of 'Arbeidsovereenkomst'>",
    "subinfo": "<optionele subtitel of null>"
  },
  "kleurschema": {
    "primair": "${params.primaireKleur ?? "#F23B0D"}",
    "secundair": "<afgeleide kleur>",
    "tekst": "#1a1a1a"
  },
  "secties": [
    { "type": "tekst|tabel|ondertekening|checklist", "titel": "<sectienaam of null>", "inhoud": "<beknopte placeholder-beschrijving>" }
  ],
  "voettekst": "${params.voettekst ?? params.werkgeverNaam}"
}
Gebruik maximaal 6 secties. Sectie-inhoud is placeholder-tekst (gebruiker vult later echt content in).`;
}

// ── AI genereer — genereert concept-template via GPT-4o ───────────────────────

router.post("/studio/modellen/:id/genereer", schrijven, async (req, res) => {
  try {
    if (!heeftOpenAi()) {
      return res.status(503).json({ error: "AI niet beschikbaar — configureer een OpenAI-sleutel" });
    }

    const id = parseId(req.params.id);
    const instructie = (req.body as { instructie?: string | null }).instructie ?? null;

    const [rij] = await db
      .select({ model: documentStudioModellenTable, wgNaam: werkgeversTable.naam, wg: werkgeversTable })
      .from(documentStudioModellenTable)
      .leftJoin(werkgeversTable, eq(documentStudioModellenTable.werkgeverId, werkgeversTable.id))
      .where(eq(documentStudioModellenTable.id, id));

    if (!rij) return res.status(404).json({ error: "Model niet gevonden" });
    if (!rij.model.referentieBestandPad) {
      return res.status(400).json({ error: "Upload eerst een referentiebestand voor dit documenttype" });
    }

    // Referentie ophalen en tekst extraheren
    let documentTekst = "";
    let heeftAfbeelding = false;
    try {
      const buffer = await downloadAlsBuffer(rij.model.referentieBestandPad);
      documentTekst = await extraheerTekst(buffer, rij.model.referentieBestandPad);
      heeftAfbeelding = !rij.model.referentieBestandPad.endsWith(".pdf");
    } catch (err) {
      req.log.warn({ err }, "Referentiebestand kon niet worden gelezen — genereer zonder tekst");
    }

    const prompt = bouwPrompt({
      documentType:   rij.model.documentType,
      documentTekst,
      heeftAfbeelding,
      werkgeverNaam:  rij.wg?.naam ?? "Werkmaatschappij",
      primaireKleur:  rij.wg?.primaireKleur ?? null,
      voettekst:      rij.wg?.voettekst ?? null,
      instructie,
    });

    const openai = maakOpenAiClient();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 1200,
      messages: [
        { role: "system", content: "Je genereert altijd pure JSON zonder markdown. Retourneer alleen de JSON-structuur." },
        { role: "user",   content: prompt },
      ],
    });

    const tekst = completion.choices[0]?.message?.content?.trim() ?? "";
    // JSON extraheren uit mogelijke markdown-blokken
    const json = tekst.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();

    // Strikte schema-validatie: gooit bij ongeldige JSON én bij ontbrekende/verkeerde velden
    valideerTemplateJson(json);

    const [bijgewerkt] = await db
      .update(documentStudioModellenTable)
      .set({
        connectTemplateJson: json,
        status:              "concept",
        bijgewerktOp:        new Date(),
      })
      .where(eq(documentStudioModellenTable.id, id))
      .returning();

    res.json(mapModel(bijgewerkt, rij.wgNaam ?? null));
  } catch (err) {
    req.log.error(err);
    if (err instanceof SyntaxError || (err instanceof z.ZodError)) {
      return res.status(503).json({ error: "AI retourneerde geen geldig template — probeer opnieuw" });
    }
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── AI bijstuur — verfijn bestaand concept via GPT-4o ────────────────────────

router.post("/studio/modellen/:id/bijstuur", schrijven, async (req, res) => {
  try {
    if (!heeftOpenAi()) {
      return res.status(503).json({ error: "AI niet beschikbaar — configureer een OpenAI-sleutel" });
    }

    const id = parseId(req.params.id);
    const { instructie } = req.body as { instructie: string };

    if (!instructie || typeof instructie !== "string" || !instructie.trim()) {
      return res.status(400).json({ error: "instructie is verplicht" });
    }

    const [rij] = await db
      .select({ model: documentStudioModellenTable, wgNaam: werkgeversTable.naam })
      .from(documentStudioModellenTable)
      .leftJoin(werkgeversTable, eq(documentStudioModellenTable.werkgeverId, werkgeversTable.id))
      .where(eq(documentStudioModellenTable.id, id));

    if (!rij) return res.status(404).json({ error: "Model niet gevonden" });
    if (!rij.model.connectTemplateJson) {
      return res.status(400).json({ error: "Genereer eerst een concept-template via de genereer-actie" });
    }

    const completion = await maakOpenAiClient().chat.completions.create({
      model: "gpt-4o",
      max_tokens: 1200,
      messages: [
        { role: "system", content: "Je past een bestaande Connect-template JSON aan op basis van een bijstuur-instructie. Retourneer ALLEEN de aangepaste JSON-structuur, geen markdown, geen uitleg." },
        { role: "user",   content: `Huidig template:\n${rij.model.connectTemplateJson}\n\nBijstuur-instructie: ${instructie.trim()}\n\nRetourneer de volledige verbeterde JSON.` },
      ],
    });

    const tekst = completion.choices[0]?.message?.content?.trim() ?? "";
    const json = tekst.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();

    // Strikte schema-validatie: gooit bij ongeldige JSON én bij ontbrekende/verkeerde velden
    valideerTemplateJson(json);

    const [bijgewerkt] = await db
      .update(documentStudioModellenTable)
      .set({
        connectTemplateJson: json,
        status:              "concept",
        bijgewerktOp:        new Date(),
      })
      .where(eq(documentStudioModellenTable.id, id))
      .returning();

    res.json(mapModel(bijgewerkt, rij.wgNaam ?? null));
  } catch (err) {
    req.log.error(err);
    if (err instanceof SyntaxError || err instanceof z.ZodError) {
      return res.status(503).json({ error: "AI retourneerde geen geldig template — probeer opnieuw" });
    }
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Goedkeuren als Model 0 ────────────────────────────────────────────────────

router.post("/studio/modellen/:id/goedkeuren", schrijven, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const userId = req.session.userId as number | undefined;

    const [rij] = await db
      .select({ model: documentStudioModellenTable, wgNaam: werkgeversTable.naam })
      .from(documentStudioModellenTable)
      .leftJoin(werkgeversTable, eq(documentStudioModellenTable.werkgeverId, werkgeversTable.id))
      .where(eq(documentStudioModellenTable.id, id));

    if (!rij) return res.status(404).json({ error: "Model niet gevonden" });
    if (!rij.model.connectTemplateJson) {
      return res.status(400).json({ error: "Er is geen concept-template om goed te keuren" });
    }

    const nu = new Date();
    const [bijgewerkt] = await db
      .update(documentStudioModellenTable)
      .set({
        status:          "goedgekeurd",
        goedgekeurdOp:   nu,
        goedgekeurdDoor: userId ?? null,
        versie:          rij.model.versie + 1,
        bijgewerktOp:    nu,
      })
      .where(eq(documentStudioModellenTable.id, id))
      .returning();

    await logActiviteit({
      gebruikerId:  userId ?? null,
      type:         "document_gewijzigd",
      omschrijving: `Document Studio model goedgekeurd als Model 0 (${rij.model.documentType})`,
    }).catch(() => {});

    res.json(mapModel(bijgewerkt, rij.wgNaam ?? null));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
