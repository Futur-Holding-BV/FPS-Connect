import { Router } from "express";
import { db } from "@workspace/db";
import { gebouwEmailsTable, gebouwEmailBijlagenTable, gebouwenTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireRol } from "../middlewares/auth";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { parseEmailBestand, extraheerEmailInzicht, type GeparseerdeBijlage } from "../services/email-ai";

const router = Router();
const objectStorage = new ObjectStorageService();
const beheerderPlus = requireRol("beheerder");

const iso = (d: Date) => d.toISOString();

function parseId(v: unknown): number {
  return parseInt(String(v), 10);
}

const mapBijlage = (b: typeof gebouwEmailBijlagenTable.$inferSelect) => ({
  id: b.id,
  email_id: b.emailId,
  bestandsnaam: b.bestandsnaam,
  object_pad: b.objectPad,
  content_type: b.contentType,
  grootte: b.grootte,
});

const mapEmail = (
  e: typeof gebouwEmailsTable.$inferSelect,
  bijlagen: (typeof gebouwEmailBijlagenTable.$inferSelect)[],
) => ({
  id: e.id,
  gebouw_id: e.gebouwId,
  bestandsnaam: e.bestandsnaam,
  object_pad: e.objectPad,
  afzender: e.afzender,
  ontvanger: e.ontvanger,
  onderwerp: e.onderwerp,
  datum: e.datum,
  inhoud_tekst: e.inhoudTekst,
  ai_omschrijving: e.aiOmschrijving,
  ai_naw: e.aiNaw,
  ai_contactinfo: e.aiContactinfo,
  ai_tekeningen: e.aiTekeningen,
  status: e.status,
  aangemaakt_op: iso(e.aangemaaktOp),
  bijlagen: bijlagen.map(mapBijlage),
});

async function leesObjectBuffer(objectPad: string): Promise<Buffer> {
  const file = await objectStorage.getObjectEntityFile(objectPad);
  const response = await objectStorage.downloadObject(file);
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function uploadBijlage(bijlage: GeparseerdeBijlage): Promise<string | null> {
  try {
    const uploadURL = await objectStorage.getObjectEntityUploadURL();
    const putRes = await fetch(uploadURL, {
      method: "PUT",
      headers: { "Content-Type": bijlage.contentType || "application/octet-stream" },
      body: new Uint8Array(bijlage.inhoud),
    });
    if (!putRes.ok) return null;
    return objectStorage.normalizeObjectEntityPath(uploadURL);
  } catch {
    return null;
  }
}

// GET /gebouwen/:id/emails
router.get("/gebouwen/:id/emails", beheerderPlus, async (req, res) => {
  try {
    const gebouwId = parseId(req.params.id);
    const emails = await db
      .select()
      .from(gebouwEmailsTable)
      .where(eq(gebouwEmailsTable.gebouwId, gebouwId))
      .orderBy(desc(gebouwEmailsTable.aangemaaktOp));
    const ids = emails.map((e) => e.id);
    const bijlagen = ids.length
      ? await db.select().from(gebouwEmailBijlagenTable)
      : [];
    const perEmail = new Map<number, (typeof gebouwEmailBijlagenTable.$inferSelect)[]>();
    for (const b of bijlagen) {
      if (!perEmail.has(b.emailId)) perEmail.set(b.emailId, []);
      perEmail.get(b.emailId)!.push(b);
    }
    res.json(emails.map((e) => mapEmail(e, perEmail.get(e.id) ?? [])));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /gebouwen/:id/emails/:emailId
router.get("/gebouwen/:id/emails/:emailId", beheerderPlus, async (req, res) => {
  try {
    const gebouwId = parseId(req.params.id);
    const emailId = parseId(req.params.emailId);
    const [e] = await db
      .select()
      .from(gebouwEmailsTable)
      .where(and(eq(gebouwEmailsTable.id, emailId), eq(gebouwEmailsTable.gebouwId, gebouwId)));
    if (!e) return res.status(404).json({ error: "E-mail niet gevonden" });
    const bijlagen = await db
      .select()
      .from(gebouwEmailBijlagenTable)
      .where(eq(gebouwEmailBijlagenTable.emailId, emailId));
    res.json(mapEmail(e, bijlagen));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /gebouwen/:id/emails — verwerk een geüpload .eml/.msg bestand
router.post("/gebouwen/:id/emails", beheerderPlus, async (req, res) => {
  try {
    const gebouwId = parseId(req.params.id);
    const { object_pad, bestandsnaam } = req.body;
    if (!object_pad || !bestandsnaam) {
      return res.status(400).json({ error: "object_pad en bestandsnaam zijn verplicht" });
    }
    const [gebouw] = await db.select({ id: gebouwenTable.id }).from(gebouwenTable).where(eq(gebouwenTable.id, gebouwId));
    if (!gebouw) return res.status(404).json({ error: "Gebouw niet gevonden" });

    const normPad = objectStorage.normalizeObjectEntityPath(String(object_pad));

    let geparseerd;
    try {
      const buffer = await leesObjectBuffer(normPad);
      geparseerd = await parseEmailBestand(String(bestandsnaam), buffer);
    } catch (parseErr) {
      req.log.error({ err: parseErr }, "E-mail parsen mislukt");
      return res.status(422).json({ error: "Het e-mailbestand kon niet worden gelezen. Upload een geldig .eml- of .msg-bestand." });
    }

    const ai = await extraheerEmailInzicht(geparseerd);

    const [e] = await db
      .insert(gebouwEmailsTable)
      .values({
        gebouwId,
        bestandsnaam: String(bestandsnaam),
        objectPad: normPad,
        afzender: geparseerd.afzender,
        ontvanger: geparseerd.ontvanger,
        onderwerp: geparseerd.onderwerp,
        datum: geparseerd.datum,
        inhoudTekst: geparseerd.inhoudTekst,
        aiOmschrijving: ai.omschrijving,
        aiNaw: ai.naw,
        aiContactinfo: ai.contactinfo,
        aiTekeningen: ai.tekeningen,
        status: "verwerkt",
      })
      .returning();

    const opgeslagenBijlagen: (typeof gebouwEmailBijlagenTable.$inferSelect)[] = [];
    for (const bijlage of geparseerd.bijlagen) {
      const pad = await uploadBijlage(bijlage);
      const [b] = await db
        .insert(gebouwEmailBijlagenTable)
        .values({
          emailId: e.id,
          bestandsnaam: bijlage.bestandsnaam,
          objectPad: pad,
          contentType: bijlage.contentType,
          grootte: bijlage.inhoud.length,
        })
        .returning();
      opgeslagenBijlagen.push(b);
    }

    res.status(201).json(mapEmail(e, opgeslagenBijlagen));
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      return res.status(404).json({ error: "Het geüploade bestand is niet gevonden." });
    }
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// DELETE /gebouwen/:id/emails/:emailId
router.delete("/gebouwen/:id/emails/:emailId", beheerderPlus, async (req, res) => {
  try {
    const gebouwId = parseId(req.params.id);
    const emailId = parseId(req.params.emailId);
    await db
      .delete(gebouwEmailsTable)
      .where(and(eq(gebouwEmailsTable.id, emailId), eq(gebouwEmailsTable.gebouwId, gebouwId)));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
