// Document Studio — referentiebibliotheek per werkmaatschappij.
// Beheert modellen (geen|referentie|concept|goedgekeurd) per documenttype per werkgever.
import { Router } from "express";
import { Readable } from "stream";
import { randomUUID } from "crypto";
import multer from "multer";
import { db, documentStudioModellenTable, werkgeversTable, gebruikersTable, gebouwToewijzingenTable } from "@workspace/db";
import { eq, and, desc, inArray, sql, ne } from "drizzle-orm";
const DocumentStudioModelInputDocumentType = {
  offerte: "offerte",
  opleverrapport: "opleverrapport",
  brief: "brief",
  email: "email",
  lmra: "lmra",
  toolbox: "toolbox",
  inkoopbon: "inkoopbon",
  factuur: "factuur",
  calculatie: "calculatie",
} as const;
import { requireBevoegdheid, requireAuth } from "../middlewares/auth";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { isBeperktTotToegewezen } from "../utils/rol";
import { haalScanStatusOpVoorPad } from "../services/security-intake-engine";

async function magBestandInGebouw(
  userId: number,
  objectPath: string,
): Promise<boolean> {
  const gebouwIdMatch = objectPath.match(/\/objects\/(\d+)\//);
  const gebouwId = gebouwIdMatch ? parseInt(gebouwIdMatch[1], 10) : null;
  
  if (gebouwId == null) return true;
  if (!(await isBeperktTotToegewezen(userId))) return true;
  const rows = await db
    .select({ gebouwId: gebouwToewijzingenTable.gebouwId })
    .from(gebouwToewijzingenTable)
    .where(eq(gebouwToewijzingenTable.gebruikerId, userId));
  return rows.some((r) => r.gebouwId === gebouwId);
}

async function magDocumentBestandZien(
  userId: number,
  objectPath: string,
): Promise<boolean> {
  // Voor studio-bestanden geldt: alleen hoofdbeheerders als het niet expliciet een publiek model is (hier simpeler check: vereist organisatie bevoegdheid)
  // De route zelf checkt al bevoegdheid "organisatie", maar dit is extra server-side document check
  const [gebruiker] = await db
    .select({ rol: gebruikersTable.rol })
    .from(gebruikersTable)
    .where(eq(gebruikersTable.id, userId));
  return gebruiker?.rol === "hoofdbeheerder" || gebruiker?.rol === "gebruiker";
}
import { aiGateway, heeftGateway } from "../lib/aiGateway";
import { STUDIO_GENEREER_JSON_PROMPT, STUDIO_BIJSTUUR_JSON_PROMPT, STUDIO_HUISSTIJL_ANALYSE_PROMPT } from "../lib/aiPrompts";
import { logActiviteit } from "../lib/activiteit";
import { renderPdfPagina, resizeAfbeelding } from "../lib/pdfVisie";

import { z } from "zod";

import { extraheerPdfTekst } from "../lib/pdfTekst";

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

// ── Zod schema voor huisstijl-analyse — AI-voorstel, nooit blind toegepast ────
// Elk veld wordt eerst defensief genormaliseerd (ongeldige/verzonnen waarden
// worden null) en pas dan door Zod bevestigd — een leeg voorstel is altijd
// veiliger dan een fout-gevalideerde waarde die de gebruiker per ongeluk
// accepteert.

const nullableTrimmedString = z.preprocess(
  (v) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 300) : null),
  z.string().max(300).nullable(),
);
const nullableHexKleur = z.preprocess(
  (v) => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : null),
  z.string().nullable(),
);
const nullablePositie = z.preprocess(
  (v) => (v === "links" || v === "midden" || v === "rechts" ? v : null),
  z.enum(["links", "midden", "rechts"]).nullable(),
);
const nullableMarge = z.preprocess(
  (v) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null),
  z.number().min(0).max(100).nullable(),
);

const huisstijlVoorstelSchema = z.object({
  adres:              nullableTrimmedString,
  postcode:           nullableTrimmedString,
  plaats:             nullableTrimmedString,
  kvk:                nullableTrimmedString,
  btw:                nullableTrimmedString,
  iban:               nullableTrimmedString,
  email:              nullableTrimmedString,
  telefoon:           nullableTrimmedString,
  website:            nullableTrimmedString,
  voettekst:          nullableTrimmedString,
  primaire_kleur:     nullableHexKleur,
  koptekst_positie:   nullablePositie,
  voettekst_positie:  nullablePositie,
  marge_boven:        nullableMarge,
  marge_onder:        nullableMarge,
  marge_links:        nullableMarge,
  marge_rechts:       nullableMarge,
  redenering:         nullableTrimmedString,
});

function valideerHuisstijlVoorstel(json: string): z.infer<typeof huisstijlVoorstelSchema> {
  const parsed: unknown = JSON.parse(json);
  return huisstijlVoorstelSchema.parse(parsed);
}

/** Numerieke Drizzle-kolommen komen als string terug — veilig naar number of null. */
function numeriekOfNull(v: string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const lezen   = requireBevoegdheid("organisatie", 1);
const schrijven = requireBevoegdheid("organisatie", 2);

const GELDIGE_TYPES = Object.values(DocumentStudioModelInputDocumentType);

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
    gearchiveerd_op:        iso(r.gearchiveerdOp),
    aangemaakt_door:        r.aangemaaktDoor,
    aangemaakt_op:          r.aangemaaktOp.toISOString(),
    bijgewerkt_op:          iso(r.bijgewerktOp),
  };
}

const NIET_CLIENT_INSTELBAAR = new Set(["goedgekeurd", "gearchiveerd"]);

// ── Werkgevers — selector voor Document Studio (gated op organisatie:1) ───────

router.get("/studio/werkgevers", lezen, async (req, res): Promise<void> => {
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

router.get("/studio/modellen", lezen, async (req, res): Promise<void> => {
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
      .orderBy(documentStudioModellenTable.documentType, desc(documentStudioModellenTable.id));

    res.json(modellen.map(({ model, naam }) => mapModel(model, naam)));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Actief model — haal het goedgekeurde model op voor een werkgever + type ──

router.get("/studio/modellen/actief", lezen, async (req, res): Promise<void> => {
  try {
    const werkgeverId = req.query.werkgever_id
      ? parseInt(String(req.query.werkgever_id), 10)
      : null;
    const documentType = req.query.document_type
      ? String(req.query.document_type)
      : null;

    if (!werkgeverId || isNaN(werkgeverId)) {
      return void res.status(400).json({ error: "werkgever_id is verplicht" });
    }
    if (!documentType) {
      return void res.status(400).json({ error: "document_type is verplicht" });
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

    if (!rij) return void res.json(null);
    res.json(mapModel(rij.model, rij.naam));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Actieve modellen bulk — alle goedgekeurde templates voor een werkgever ────

router.get("/studio/werkgevers/:werkgever_id/modellen/actief", lezen, async (req, res): Promise<void> => {
  try {
    const werkgeverId = parseId(req.params.werkgever_id);
    if (!werkgeverId) return void res.status(400).json({ error: "werkgever_id ongeldig" });

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

router.get("/studio/modellen/:id", lezen, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params.id);
    const [rij] = await db
      .select({ model: documentStudioModellenTable, naam: werkgeversTable.naam })
      .from(documentStudioModellenTable)
      .leftJoin(werkgeversTable, eq(documentStudioModellenTable.werkgeverId, werkgeversTable.id))
      .where(eq(documentStudioModellenTable.id, id));
    if (!rij) return void res.status(404).json({ error: "Model niet gevonden" });
    res.json(mapModel(rij.model, rij.naam));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Upsert — aanmaken of bijwerken op (werkgever_id, document_type) ───────────

router.post("/studio/modellen", schrijven, async (req, res): Promise<void> => {
  try {
    const { werkgever_id, document_type, naam, status } = req.body as {
      werkgever_id: number;
      document_type: string;
      naam?: string | null;
      status?: string;
    };
    const userId = req.session.userId as number | undefined;

    if (!werkgever_id || typeof werkgever_id !== "number") {
      return void res.status(400).json({ error: "werkgever_id is verplicht" });
    }
    if (!document_type || !GELDIGE_TYPES.includes(document_type as never)) {
      return void res.status(400).json({ error: `document_type moet een van de volgende zijn: ${GELDIGE_TYPES.join(", ")}` });
    }
    if (status && NIET_CLIENT_INSTELBAAR.has(status)) {
      return void res.status(400).json({ error: "Status 'goedgekeurd'/'gearchiveerd' kan alleen via de goedkeuren-actie worden gezet" });
    }

    // Versiebeheer: hergebruik alleen een bestaand CONCEPT/referentie/leeg model
    // (nooit een actief 'goedgekeurd' of gearchiveerd model overschrijven). Als
    // er meerdere kladversies zijn, pak de meest recente (deterministisch).
    const [bestaand] = await db
      .select()
      .from(documentStudioModellenTable)
      .where(
        and(
          eq(documentStudioModellenTable.werkgeverId, werkgever_id),
          eq(documentStudioModellenTable.documentType, document_type),
          inArray(documentStudioModellenTable.status, ["geen", "referentie", "concept"]),
        ),
      )
      .orderBy(desc(documentStudioModellenTable.id))
      .limit(1);

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
          aangemaaktDoor: userId ?? null,
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

router.patch("/studio/modellen/:id", schrijven, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params.id);
    const { naam, status, connect_template_json, goedgekeurd_door } = req.body as {
      naam?: string | null;
      status?: string;
      connect_template_json?: string | null;
      goedgekeurd_door?: number | null;
    };
    if (status !== undefined && status !== "goedgekeurd" && NIET_CLIENT_INSTELBAAR.has(status)) {
      return void res.status(400).json({ error: "Status 'gearchiveerd' kan alleen via de goedkeuren-actie worden gezet" });
    }

    if (status === "goedgekeurd") {
      // De status 'goedgekeurd' via PATCH wordt intern afgehandeld door de goedkeuren-logica
      // om versiebeheer en archivering correct te regelen.
      return void res.redirect(307, `/api/studio/modellen/${id}/goedkeuren`);
    }

    const setObj: Partial<typeof documentStudioModellenTable.$inferInsert> & { bijgewerktOp: Date } = {
      bijgewerktOp: new Date(),
    };
    if (naam !== undefined)                   setObj.naam = naam;
    if (status !== undefined)                 setObj.status = status;
    if (connect_template_json !== undefined)  setObj.connectTemplateJson = connect_template_json;
    if (goedgekeurd_door !== undefined)       setObj.goedgekeurdDoor = goedgekeurd_door;

    if (status === "goedgekeurd") {
      setObj.goedgekeurdOp = new Date();
      // Oude actieve model archiveren
      const [huidig] = await db.select().from(documentStudioModellenTable).where(eq(documentStudioModellenTable.id, id));
      if (huidig) {
        await db.update(documentStudioModellenTable)
          .set({ status: "gearchiveerd", gearchiveerdOp: new Date() })
          .where(and(
            eq(documentStudioModellenTable.werkgeverId, huidig.werkgeverId),
            eq(documentStudioModellenTable.documentType, huidig.documentType),
            eq(documentStudioModellenTable.status, "goedgekeurd"),
            ne(documentStudioModellenTable.id, id)
          ));
      }
    }

    const [rij] = await db
      .update(documentStudioModellenTable)
      .set(setObj)
      .where(eq(documentStudioModellenTable.id, id))
      .returning();
    if (!rij) return void res.status(404).json({ error: "Model niet gevonden" });

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

// ── Download referentie ───────────────────────────────────────────────────────

router.get("/studio/modellen/:id/referentie", requireAuth, lezen, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params.id);
    const userId = req.session.userId!;

    const [rij] = await db
      .select()
      .from(documentStudioModellenTable)
      .where(eq(documentStudioModellenTable.id, id));

    if (!rij || !rij.referentieBestandPad) {
      return void res.status(404).json({ error: "Referentiebestand niet gevonden" });
    }

    // ACL checks
    const objectPath = rij.referentieBestandPad;
    if (!(await magBestandInGebouw(userId, objectPath))) {
      return void res.status(403).json({ error: "Geen toegang tot dit gebouw" });
    }
    if (!(await magDocumentBestandZien(userId, objectPath))) {
      return void res.status(403).json({ error: "Geen toegang tot dit bestand" });
    }

    // Scan check
    const scanStatus = await haalScanStatusOpVoorPad(objectPath).catch(() => null);
    if (scanStatus?.geblokkeerd) {
      return void res.status(403).json({ error: "Bestand geblokkeerd door scan" });
    }

    try {
      const file = await oss.getObjectEntityFile(rij.referentieBestandPad!);
      const response = await oss.downloadObject(file, { isPublic: false });

      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));

      if (response.body) {
        const nodeStream = Readable.fromWeb(response.body as any);
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch (err) {
      if (err instanceof ObjectNotFoundError) {
        return void res.status(404).json({ error: "Referentiebestand niet gevonden in opslag" });
      }
      // Als de opslag-config ontbreekt (GCS/S3)
      if (err instanceof Error && (err.message.includes("is niet ingesteld") || err.message.includes("niet geconfigureerd"))) {
        return void res.status(503).json({ error: "Opslagservice niet geconfigureerd" });
      }
      throw err;
    }
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
  async (req, res): Promise<void> => {
    try {
      const id = parseId(req.params.id);

      if (!req.file) {
        return void res.status(400).json({ error: "Geen bestand ontvangen" });
      }

      const bestand = req.file;
      const toegestaan = [
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/webp",
      ];
      if (!toegestaan.includes(bestand.mimetype)) {
        return void res.status(400).json({ error: "Bestandstype niet ondersteund — upload een PDF of afbeelding" });
      }

      const [bestaand] = await db
        .select()
        .from(documentStudioModellenTable)
        .where(eq(documentStudioModellenTable.id, id));
      if (!bestaand) return void res.status(404).json({ error: "Model niet gevonden" });
      if (bestaand.status === "goedgekeurd" || bestaand.status === "gearchiveerd") {
        return void res.status(409).json({ error: "Uploaden kan niet op een actief of gearchiveerd model — maak eerst een nieuw concept aan" });
      }

      // Upload naar object storage
      const ext = bestand.originalname.includes(".")
        ? "." + bestand.originalname.split(".").pop()
        : "";
      const subPath = `algemeen/studio/${randomUUID()}${ext}`;
      const bestandPad = await oss.uploadBestand(subPath, bestand.buffer, bestand.mimetype);

      // Status bijwerken naar referentie (als nog geen hoger model)
      // Indien het model al goedgekeurd was, wordt het teruggezet naar referentie.
      const nieuweStatus = (bestaand.status === "geen" || bestaand.status === "goedgekeurd") ? "referentie" : bestaand.status;

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
      const resultaat = await extraheerPdfTekst(buffer);
      return (resultaat.tekst ?? "").slice(0, 8000); // limiet voor prompt
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
    opleverrapport: "Opleverrapport brandpreventieve voorzieningen",
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
    opleverrapport: "A",
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

router.post("/studio/modellen/:id/genereer", schrijven, async (req, res): Promise<void> => {
  try {
    if (!heeftGateway()) {
      return void res.status(503).json({ error: "AI niet beschikbaar — configureer een OpenAI-sleutel" });
    }

    const id = parseId(req.params.id);
    const instructie = (req.body as { instructie?: string | null }).instructie ?? null;

    const [rij] = await db
      .select({ model: documentStudioModellenTable, wgNaam: werkgeversTable.naam, wg: werkgeversTable })
      .from(documentStudioModellenTable)
      .leftJoin(werkgeversTable, eq(documentStudioModellenTable.werkgeverId, werkgeversTable.id))
      .where(eq(documentStudioModellenTable.id, id));

    if (!rij) return void res.status(404).json({ error: "Model niet gevonden" });
    if (rij.model.status === "goedgekeurd" || rij.model.status === "gearchiveerd") {
      return void res.status(409).json({ error: "Dit model is actief of gearchiveerd en kan niet meer worden gegenereerd — upload een nieuwe referentie voor een nieuw concept" });
    }
    if (!rij.model.referentieBestandPad) {
      return void res.status(400).json({ error: "Upload eerst een referentiebestand voor dit documenttype" });
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

    const genereerResultaat = await aiGateway.chat("default", {
      max_tokens: 1200,
      messages: [
        { role: "system", content: STUDIO_GENEREER_JSON_PROMPT.tekst },
        { role: "user",   content: prompt },
      ],
    }, undefined, {
      module: "studio",
      functie: "genereerTemplate",
      gebruikerId: (req.session.userId as number | undefined) ?? null,
      entiteitstype: "documentStudioModel",
      entiteitId: id,
      promptNaam: STUDIO_GENEREER_JSON_PROMPT.naam,
      promptVersie: STUDIO_GENEREER_JSON_PROMPT.versie,
    });

    const tekst = genereerResultaat.ok ? genereerResultaat.inhoud.trim() : "";
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
      return void res.status(503).json({ error: "AI retourneerde geen geldig template — probeer opnieuw" });
    }
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── AI bijstuur — verfijn bestaand concept via GPT-4o ────────────────────────

router.post("/studio/modellen/:id/bijstuur", schrijven, async (req, res): Promise<void> => {
  try {
    if (!heeftGateway()) {
      return void res.status(503).json({ error: "AI niet beschikbaar — configureer een OpenAI-sleutel" });
    }

    const id = parseId(req.params.id);
    const { instructie } = req.body as { instructie: string };

    if (!instructie || typeof instructie !== "string" || !instructie.trim()) {
      return void res.status(400).json({ error: "instructie is verplicht" });
    }

    const [rij] = await db
      .select({ model: documentStudioModellenTable, wgNaam: werkgeversTable.naam })
      .from(documentStudioModellenTable)
      .leftJoin(werkgeversTable, eq(documentStudioModellenTable.werkgeverId, werkgeversTable.id))
      .where(eq(documentStudioModellenTable.id, id));

    if (!rij) return void res.status(404).json({ error: "Model niet gevonden" });
    if (rij.model.status === "goedgekeurd" || rij.model.status === "gearchiveerd") {
      return void res.status(409).json({ error: "Dit model is actief of gearchiveerd en kan niet meer worden bijgesteld — upload een nieuwe referentie voor een nieuw concept" });
    }
    if (!rij.model.connectTemplateJson) {
      return void res.status(400).json({ error: "Genereer eerst een concept-template via de genereer-actie" });
    }

    const bijstuurResultaat = await aiGateway.chat("default", {
      max_tokens: 1200,
      messages: [
        { role: "system", content: STUDIO_BIJSTUUR_JSON_PROMPT.tekst },
        { role: "user",   content: `Huidig template:\n${rij.model.connectTemplateJson}\n\nBijstuur-instructie: ${instructie.trim()}\n\nRetourneer de volledige verbeterde JSON.` },
      ],
    }, undefined, {
      module: "studio",
      functie: "bijstuurTemplate",
      gebruikerId: (req.session.userId as number | undefined) ?? null,
      entiteitstype: "documentStudioModel",
      entiteitId: id,
      promptNaam: STUDIO_BIJSTUUR_JSON_PROMPT.naam,
      promptVersie: STUDIO_BIJSTUUR_JSON_PROMPT.versie,
    });

    const tekst = bijstuurResultaat.ok ? bijstuurResultaat.inhoud.trim() : "";
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
      return void res.status(503).json({ error: "AI retourneerde geen geldig template — probeer opnieuw" });
    }
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Huisstijl-analyse — AI-voorstel uit referentiedocument (accept/wijzig/verwerp) ──
// Slaat NOOIT rechtstreeks op in werkgevers: dit endpoint retourneert alleen een
// voorstel + de huidige waarden, zodat de gebruiker per veld kan accepteren,
// aanpassen of verwerpen (frontend-verantwoordelijkheid in T005).

router.post("/studio/modellen/:id/huisstijl-analyse", schrijven, async (req, res): Promise<void> => {
  try {
    if (!heeftGateway()) {
      return void res.status(503).json({ error: "AI niet beschikbaar — configureer een OpenAI-sleutel" });
    }

    const id = parseId(req.params.id);

    const [rij] = await db
      .select({ model: documentStudioModellenTable, wg: werkgeversTable })
      .from(documentStudioModellenTable)
      .leftJoin(werkgeversTable, eq(documentStudioModellenTable.werkgeverId, werkgeversTable.id))
      .where(eq(documentStudioModellenTable.id, id));

    if (!rij) return void res.status(404).json({ error: "Model niet gevonden" });
    if (!rij.model.referentieBestandPad) {
      return void res.status(400).json({ error: "Upload eerst een referentiebestand voor dit documenttype" });
    }

    let buffer: Buffer;
    try {
      buffer = await downloadAlsBuffer(rij.model.referentieBestandPad);
    } catch (err) {
      req.log.warn({ err }, "Referentiebestand kon niet worden gedownload voor huisstijl-analyse");
      return void res.status(400).json({ error: "Referentiebestand kon niet worden gelezen" });
    }

    const isPdf = rij.model.referentieBestandPad.toLowerCase().endsWith(".pdf");
    const documentTekst = isPdf ? await extraheerTekst(buffer, rij.model.referentieBestandPad) : "";
    const afbeeldingBase64 = isPdf ? await renderPdfPagina(buffer) : await resizeAfbeelding(buffer);

    const tekstInfo = documentTekst
      ? `Geëxtraheerde tekst (${documentTekst.length} tekens):\n${documentTekst}`
      : "Geëxtraheerde tekst: GEEN — beoordeel uitsluitend op basis van de afbeelding.";

    type ContentBlock =
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string; detail: "low" } };
    const content: ContentBlock[] = [{ type: "text", text: tekstInfo }];
    if (afbeeldingBase64) {
      content.push({
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${afbeeldingBase64}`, detail: "low" },
      });
    }

    const analyseResultaat = await aiGateway.chat("fast", {
      response_format: { type: "json_object" },
      max_tokens: 800,
      messages: [
        { role: "system", content: STUDIO_HUISSTIJL_ANALYSE_PROMPT.tekst },
        { role: "user", content } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      ],
    }, undefined, {
      module: "studio",
      functie: "huisstijlAnalyse",
      gebruikerId: (req.session.userId as number | undefined) ?? null,
      entiteitstype: "documentStudioModel",
      entiteitId: id,
      promptNaam: STUDIO_HUISSTIJL_ANALYSE_PROMPT.naam,
      promptVersie: STUDIO_HUISSTIJL_ANALYSE_PROMPT.versie,
    });

    if (!analyseResultaat.ok || !analyseResultaat.inhoud.trim()) {
      return void res.status(503).json({ error: "AI kon geen huisstijl-voorstel genereren — probeer opnieuw" });
    }

    const tekst = analyseResultaat.inhoud
      .trim()
      .replace(/^```[a-z]*\n?/i, "")
      .replace(/\n?```$/i, "")
      .trim();

    const voorstel = valideerHuisstijlVoorstel(tekst);
    const wg = rij.wg;

    res.json({
      model_id: id,
      vision_gebruikt: afbeeldingBase64 !== null,
      voorstel,
      huidig: {
        adres: wg?.adres ?? null,
        postcode: wg?.postcode ?? null,
        plaats: wg?.plaats ?? null,
        kvk: wg?.kvk ?? null,
        btw: wg?.btw ?? null,
        iban: wg?.iban ?? null,
        email: wg?.email ?? null,
        telefoon: wg?.telefoon ?? null,
        website: wg?.website ?? null,
        voettekst: wg?.voettekst ?? null,
        primaire_kleur: wg?.primaireKleur ?? null,
        koptekst_positie: wg?.koptekstPositie ?? null,
        voettekst_positie: wg?.voettekstPositie ?? null,
        marge_boven: numeriekOfNull(wg?.margeBoven),
        marge_onder: numeriekOfNull(wg?.margeOnder),
        marge_links: numeriekOfNull(wg?.margeLinks),
        marge_rechts: numeriekOfNull(wg?.margeRechts),
      },
    });
  } catch (err) {
    req.log.error(err);
    if (err instanceof SyntaxError || err instanceof z.ZodError) {
      return void res.status(503).json({ error: "AI retourneerde geen geldig huisstijl-voorstel — probeer opnieuw" });
    }
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Goedkeuren als Model 0 ────────────────────────────────────────────────────

router.post("/studio/modellen/:id/goedkeuren", schrijven, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params.id);
    const userId = req.session.userId as number | undefined;

    const [rij] = await db
      .select({ model: documentStudioModellenTable, wgNaam: werkgeversTable.naam })
      .from(documentStudioModellenTable)
      .leftJoin(werkgeversTable, eq(documentStudioModellenTable.werkgeverId, werkgeversTable.id))
      .where(eq(documentStudioModellenTable.id, id));

    if (!rij) return void res.status(404).json({ error: "Model niet gevonden" });
    if (!rij.model.connectTemplateJson) {
      return void res.status(400).json({ error: "Er is geen concept-template om goed te keuren" });
    }

    const nu = new Date();

    // Nooit een periode zonder actief model, en nooit twee actieve modellen
    // tegelijk: in dezelfde transactie het huidige actieve model (indien
    // aanwezig) archiveren vóórdat dit model actief wordt. De partial unique
    // index op (werkgever_id, document_type) WHERE status='goedgekeurd' is de
    // laatste verdedigingslinie tegen een race tussen twee gelijktijdige
    // goedkeuringen (23505 → 409).
    try {
      const bijgewerkt = await db.transaction(async (tx) => {
        await tx
          .update(documentStudioModellenTable)
          .set({ status: "gearchiveerd", gearchiveerdOp: nu, bijgewerktOp: nu })
          .where(
            and(
              eq(documentStudioModellenTable.werkgeverId, rij.model.werkgeverId),
              eq(documentStudioModellenTable.documentType, rij.model.documentType),
              eq(documentStudioModellenTable.status, "goedgekeurd"),
              sql`${documentStudioModellenTable.id} != ${id}`,
            ),
          );

        const [maxRij] = await tx
          .select({ max: sql<number>`coalesce(max(${documentStudioModellenTable.versie}), 0)` })
          .from(documentStudioModellenTable)
          .where(
            and(
              eq(documentStudioModellenTable.werkgeverId, rij.model.werkgeverId),
              eq(documentStudioModellenTable.documentType, rij.model.documentType),
            ),
          );
        const nieuweVersie = Number(maxRij?.max ?? 0) + 1;

        const [resultaat] = await tx
          .update(documentStudioModellenTable)
          .set({
            status:          "goedgekeurd",
            goedgekeurdOp:   nu,
            goedgekeurdDoor: userId ?? null,
            gearchiveerdOp:  null,
            versie:          nieuweVersie,
            bijgewerktOp:    nu,
          })
          .where(eq(documentStudioModellenTable.id, id))
          .returning();
        return resultaat;
      });

      await logActiviteit({
        gebruikerId:  userId ?? null,
        type:         "document_gewijzigd",
        omschrijving: `Document Studio model goedgekeurd als actief model (${rij.model.documentType}, v${bijgewerkt.versie})`,
      }).catch(() => {});

      res.json(mapModel(bijgewerkt, rij.wgNaam ?? null));
    } catch (err) {
      if ((err as { code?: string })?.code === "23505") {
        return void res.status(409).json({ error: "Er is al een ander model zojuist actief geworden voor dit documenttype — probeer opnieuw" });
      }
      throw err;
    }
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
