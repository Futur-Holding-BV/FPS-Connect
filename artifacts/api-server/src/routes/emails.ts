import { Router } from "express";
import { db } from "@workspace/db";
import {
  gebouwEmailsTable,
  gebouwEmailBijlagenTable,
  gebouwEmailSamenvattingenTable,
  gebouwenTable,
  gebruikersTable,
} from "@workspace/db";
import type { EmailContactpersoon } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import {
  parseEmailBestand,
  extraheerEmailInzicht,
  genereerProjectSamenvatting,
  type GeparseerdeBijlage,
  type GeparseerdeEmail,
} from "../services/email-ai";

const router = Router();
const objectStorage = new ObjectStorageService();
const beheerderPlus = requireBevoegdheid("gebouwen", 2);

const iso = (d: Date) => d.toISOString();

function mapContact(c: EmailContactpersoon) {
  return {
    rol: c.rol,
    naam: c.naam,
    organisatie: c.organisatie ?? null,
    email: c.email ?? null,
    telefoon: c.telefoon ?? null,
    functie: c.functie ?? null,
    status: c.status ?? "voorstel",
    relevantie: c.relevantie ?? "relevant",
    bron_email_id: c.bron_email_id ?? null,
    bron_onderwerp: c.bron_onderwerp ?? null,
  };
}

const mapSamenvatting = (s: typeof gebouwEmailSamenvattingenTable.$inferSelect) => ({
  id: s.id,
  gebouw_id: s.gebouwId,
  opdrachtomschrijving: s.opdrachtomschrijving,
  opdrachtgever: s.opdrachtgever,
  contactgegevens: s.contactgegevens,
  afspraken: s.afspraken,
  actiepunten: s.actiepunten,
  besluiten: s.besluiten,
  tekeningen: s.tekeningen,
  risicos: s.risicos,
  contactpersonen: (s.contactpersonen ?? []).map(mapContact),
  aantal_emails: s.aantalEmails,
  geverifieerd: s.geverifieerd,
  gecontroleerd_door: s.gecontroleerdDoor,
  gecontroleerd_op: s.gecontroleerdOp ? iso(s.gecontroleerdOp) : null,
  bijgewerkt_op: iso(s.bijgewerktOp),
});

/**
 * Merge bestaande contacten (met hun accept/reject-beslissingen) met nieuwe AI-voorstellen.
 * Bevestigde en afgewezen contacten blijven altijd behouden.
 * Nieuwe AI-voorstellen worden alleen toegevoegd als ze nog niet in de bestaande lijst staan.
 * Match op e-mailadres (case-insensitive) of naam+organisatie.
 */
function mergeContactpersonen(
  bestaand: EmailContactpersoon[],
  nieuwVanAi: EmailContactpersoon[],
): EmailContactpersoon[] {
  const vast = bestaand.filter(
    (c) => c.status === "bevestigd" || c.status === "afgewezen",
  );

  const isAlInVast = (n: EmailContactpersoon) =>
    vast.some(
      (v) =>
        (v.email && n.email && v.email.toLowerCase() === n.email.toLowerCase()) ||
        (v.naam.toLowerCase() === n.naam.toLowerCase() &&
          (v.organisatie ?? "") === (n.organisatie ?? "")),
    );

  // Bestaande voorstel-contacten die niet in de nieuwe AI-lijst zitten, bewaren
  const oudVoorstelBehouden = bestaand
    .filter((c) => (c.status ?? "voorstel") === "voorstel")
    .filter((b) => {
      const inNieuw = nieuwVanAi.some(
        (n) =>
          (n.email && b.email && n.email.toLowerCase() === b.email.toLowerCase()) ||
          (n.naam.toLowerCase() === b.naam.toLowerCase() &&
            (n.organisatie ?? "") === (b.organisatie ?? "")),
      );
      return !inNieuw;
    });

  // Nieuwe AI-contacten die nog niet bevestigd/afgewezen zijn
  const nieuwToevoegen = nieuwVanAi
    .filter((n) => !isAlInVast(n))
    .map((n) => ({ ...n, status: "voorstel" as const }));

  return [...vast, ...oudVoorstelBehouden, ...nieuwToevoegen];
}

// herbereken de AI-samenvatting. Wanneer een beheerder de samenvatting heeft
// geverifieerd (handmatig gecontroleerd/aangepast) overschrijft de automatische
// herberekening de tekstvelden NIET (tenzij forceer=true), maar worden
// nieuwe contacten wel gemerged zodat het formulier meegroeit bij nieuwe e-mails.
async function herberekeningUitvoeren(
  gebouwId: number,
  forceer = false,
): Promise<void> {
  try {
    const emails = await db
      .select()
      .from(gebouwEmailsTable)
      .where(eq(gebouwEmailsTable.gebouwId, gebouwId))
      .orderBy(desc(gebouwEmailsTable.aangemaaktOp));

    if (emails.length === 0) {
      await db
        .delete(gebouwEmailSamenvattingenTable)
        .where(eq(gebouwEmailSamenvattingenTable.gebouwId, gebouwId));
      return;
    }

    // Haal bestaand record op voor merge-logica en geverifieerd-check
    const [bestaand] = await db
      .select()
      .from(gebouwEmailSamenvattingenTable)
      .where(eq(gebouwEmailSamenvattingenTable.gebouwId, gebouwId));

    if (!forceer && bestaand?.geverifieerd) {
      // Tekstvelden zijn door beheerder bevestigd: alleen e-mailaantal bijwerken
      // en nieuwe contacten als voorstel toevoegen.
      if (emails.length !== bestaand.aantalEmails) {
        const bestaandeContacten: EmailContactpersoon[] = bestaand.contactpersonen ?? [];
        const emailsMetId = emails.map((e) => ({
          id: e.id,
          afzender: e.afzender,
          ontvanger: e.ontvanger,
          onderwerp: e.onderwerp,
          datum: e.datum,
          inhoudTekst: e.inhoudTekst,
          bijlagen: [] as GeparseerdeBijlage[],
        }));
        const nieuweSamenvatting = await genereerProjectSamenvatting(emailsMetId);
        const gemergd = mergeContactpersonen(
          bestaandeContacten,
          nieuweSamenvatting.contactpersonen,
        );
        await db
          .update(gebouwEmailSamenvattingenTable)
          .set({ aantalEmails: emails.length, contactpersonen: gemergd, bijgewerktOp: new Date() })
          .where(eq(gebouwEmailSamenvattingenTable.gebouwId, gebouwId));
      }
      return;
    }

    const bestaandeContacten: EmailContactpersoon[] = bestaand?.contactpersonen ?? [];

    const emailsMetId = emails.map((e) => ({
      id: e.id,
      afzender: e.afzender,
      ontvanger: e.ontvanger,
      onderwerp: e.onderwerp,
      datum: e.datum,
      inhoudTekst: e.inhoudTekst,
      bijlagen: [] as GeparseerdeBijlage[],
    }));

    const samenvatting = await genereerProjectSamenvatting(emailsMetId);

    // Merge: bewaar bevestigde/afgewezen contacten, voeg nieuwe AI-voorstellen toe
    const gemergdContacten = mergeContactpersonen(
      bestaandeContacten,
      samenvatting.contactpersonen,
    );

    const nieuweWaarden = {
      aantalEmails: emails.length,
      geverifieerd: false,
      gecontroleerdDoor: null as string | null,
      gecontroleerdOp: null as Date | null,
      bijgewerktOp: new Date(),
      opdrachtomschrijving: samenvatting.opdrachtomschrijving,
      opdrachtgever: samenvatting.opdrachtgever,
      contactgegevens: samenvatting.contactgegevens,
      afspraken: samenvatting.afspraken,
      actiepunten: samenvatting.actiepunten,
      besluiten: samenvatting.besluiten,
      tekeningen: samenvatting.tekeningen,
      risicos: samenvatting.risicos,
      contactpersonen: gemergdContacten,
    };

    // Atomaire guard: als !forceer mag een tijdens de (trage) AI-call door een
    // beheerder bevestigde samenvatting NIET overschreven worden.
    await db
      .insert(gebouwEmailSamenvattingenTable)
      .values({ gebouwId, ...nieuweWaarden })
      .onConflictDoUpdate({
        target: gebouwEmailSamenvattingenTable.gebouwId,
        set: nieuweWaarden,
        setWhere: forceer
          ? undefined
          : eq(gebouwEmailSamenvattingenTable.geverifieerd, false),
      });
  } catch (err) {
    console.error("herberekeningUitvoeren mislukt:", err);
  }
}

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
  ai_actiepunten: e.aiActiepunten,
  ai_relevant: e.aiRelevant,
  ai_relevant_reden: e.aiRelevantReden,
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

// GET /gebouwen/:id/emails/samenvatting — VOOR :emailId zodat Express niet "samenvatting" als id matcht
router.get("/gebouwen/:id/emails/samenvatting", beheerderPlus, async (req, res) => {
  try {
    const gebouwId = parseId(req.params.id);
    const [s] = await db
      .select()
      .from(gebouwEmailSamenvattingenTable)
      .where(eq(gebouwEmailSamenvattingenTable.gebouwId, gebouwId));
    if (!s) return res.status(404).json({ error: "Nog geen samenvatting beschikbaar" });
    res.json(mapSamenvatting(s));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /gebouwen/:id/emails/samenvatting — genereer of herbereken projectsamenvatting
router.post("/gebouwen/:id/emails/samenvatting", beheerderPlus, async (req, res) => {
  try {
    const gebouwId = parseId(req.params.id);
    await herberekeningUitvoeren(gebouwId, true);
    const [s] = await db
      .select()
      .from(gebouwEmailSamenvattingenTable)
      .where(eq(gebouwEmailSamenvattingenTable.gebouwId, gebouwId));
    if (!s) return res.status(404).json({ error: "Geen e-mails gevonden om een samenvatting van te maken" });
    res.json(mapSamenvatting(s));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// PATCH /gebouwen/:id/emails/samenvatting — beheerder controleert/bewerkt, bevestigt en beheert contacten
router.patch("/gebouwen/:id/emails/samenvatting", beheerderPlus, async (req, res) => {
  try {
    const gebouwId = parseId(req.params.id);
    const body = (req.body ?? {}) as Record<string, unknown>;

    const tekstVeld = (v: unknown): string | null => {
      if (v === null || v === undefined) return null;
      const s = String(v).trim();
      return s === "" ? null : s;
    };

    const geverifieerd = body.geverifieerd === true;

    let gecontroleerdDoor: string | null = null;
    if (geverifieerd) {
      const userId = req.session.userId;
      if (userId) {
        const [g] = await db
          .select({ naam: gebruikersTable.naam })
          .from(gebruikersTable)
          .where(eq(gebruikersTable.id, userId));
        gecontroleerdDoor = g?.naam ?? null;
      }
    }

    // Verwerk contactpersonen-update (accept/reject/edit per contact)
    let bijgewerktePersoon: EmailContactpersoon[] | undefined;
    if (Array.isArray(body.contactpersonen)) {
      bijgewerktePersoon = (body.contactpersonen as unknown[])
        .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
        .filter((c) => typeof c.naam === "string" && typeof c.rol === "string")
        .map((c) => ({
          rol: String(c.rol),
          naam: String(c.naam),
          organisatie: typeof c.organisatie === "string" ? c.organisatie : null,
          email: typeof c.email === "string" ? c.email : null,
          telefoon: typeof c.telefoon === "string" ? c.telefoon : null,
          functie: typeof c.functie === "string" ? c.functie : null,
          status: (["voorstel", "bevestigd", "afgewezen"] as const).includes(c.status as any)
            ? (c.status as "voorstel" | "bevestigd" | "afgewezen")
            : "voorstel",
          relevantie: (["relevant", "ter_controle"] as const).includes(c.relevantie as any)
            ? (c.relevantie as "relevant" | "ter_controle")
            : "relevant",
          bron_email_id: typeof c.bron_email_id === "number" ? c.bron_email_id : null,
          bron_onderwerp: typeof c.bron_onderwerp === "string" ? c.bron_onderwerp : null,
        }));
    }

    const velden: Record<string, unknown> = {
      opdrachtomschrijving: tekstVeld(body.opdrachtomschrijving),
      opdrachtgever: tekstVeld(body.opdrachtgever),
      contactgegevens: tekstVeld(body.contactgegevens),
      afspraken: tekstVeld(body.afspraken),
      actiepunten: tekstVeld(body.actiepunten),
      besluiten: tekstVeld(body.besluiten),
      tekeningen: tekstVeld(body.tekeningen),
      risicos: tekstVeld(body.risicos),
      geverifieerd,
      gecontroleerdDoor,
      gecontroleerdOp: geverifieerd ? new Date() : null,
      bijgewerktOp: new Date(),
      ...(bijgewerktePersoon !== undefined && { contactpersonen: bijgewerktePersoon }),
    };

    await db
      .insert(gebouwEmailSamenvattingenTable)
      .values({ gebouwId, aantalEmails: 0, ...velden })
      .onConflictDoUpdate({
        target: gebouwEmailSamenvattingenTable.gebouwId,
        set: velden,
      });

    const [s] = await db
      .select()
      .from(gebouwEmailSamenvattingenTable)
      .where(eq(gebouwEmailSamenvattingenTable.gebouwId, gebouwId));
    res.json(mapSamenvatting(s));
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

    let geparseerd: GeparseerdeEmail;
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
        aiActiepunten: ai.actiepunten,
        aiRelevant: ai.relevant,
        aiRelevantReden: ai.relevantReden,
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
    // Herbereken projectsamenvatting op de achtergrond
    void herberekeningUitvoeren(gebouwId);
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
    void herberekeningUitvoeren(gebouwId);
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
