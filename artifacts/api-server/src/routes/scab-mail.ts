import { Router, Request, Response } from "express";
import multer from "multer";
import {
  db,
  scabMailsTable,
  scabMailBijlagenTable,
  salarisMutatiesTable,
  werkgeversTable,
  medewerkersTable,
} from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { ObjectStorageService } from "../lib/objectStorage";
import { aiGateway, heeftGateway } from "../lib/aiGateway";

const router = Router();
const storage = new ObjectStorageService();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const lezen = requireBevoegdheid("scab_mail", 1);
const schrijven = requireBevoegdheid("scab_mail", 2);
const verzenden = requireBevoegdheid("scab_mail", 3);

function mapMail(m: typeof scabMailsTable.$inferSelect) {
  return {
    id: m.id,
    werkmaatschappij: m.werkmaatschappij,
    werkgever_id: m.werkgeverId,
    periode_jaar: m.periodeJaar,
    periode_maand: m.periodeMaand,
    onderwerp: m.onderwerp,
    inhoud: m.inhoud,
    scab_email_adres: m.scabEmailAdres,
    contactpersoon: m.contactpersoon,
    status: m.status,
    verzond_op: m.verzondOp?.toISOString() ?? null,
    verzond_door_naam: m.verzondDoorNaam,
    aantal_mutaties: m.aantalMutaties,
    aangemaakt_door_naam: m.aangemaaktDoorNaam,
    aangemaakt_op: m.aangemaaktOp.toISOString(),
    bijgewerkt_op: m.bijgewerktOp.toISOString(),
  };
}

function mapBijlage(b: typeof scabMailBijlagenTable.$inferSelect) {
  return {
    id: b.id,
    scab_mail_id: b.scabMailId,
    type: b.type,
    omschrijving: b.omschrijving,
    object_path: b.objectPath,
    bestandsnaam: b.bestandsnaam,
    bestandsgrootte: b.bestandsgrootte,
    is_gevoelig: b.isGevoelig,
    medewerker_id: b.medewerkerId,
    medewerker_naam: b.medewerkerNaam,
    aangemaakt_op: b.aangemaaktOp.toISOString(),
  };
}

router.get("/scab-mails", lezen, async (req: Request, res: Response) => {
  const { jaar, maand, werkmaatschappij, status } = req.query;
  const filters = [];
  if (jaar) filters.push(eq(scabMailsTable.periodeJaar, Number(jaar)));
  if (maand) filters.push(eq(scabMailsTable.periodeMaand, Number(maand)));
  if (werkmaatschappij) filters.push(eq(scabMailsTable.werkmaatschappij, String(werkmaatschappij)));
  if (status) filters.push(eq(scabMailsTable.status, String(status)));

  const rows = await db
    .select()
    .from(scabMailsTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(scabMailsTable.aangemaaktOp));

  return res.json(rows.map(mapMail));
});

router.post("/scab-mails/genereer", schrijven, async (req: Request, res: Response) => {
  const { werkmaatschappij, werkgever_id, periode_jaar, periode_maand } = req.body;
  if (!werkmaatschappij || !periode_jaar || !periode_maand) {
    return res.status(400).json({ message: "werkmaatschappij, periode_jaar en periode_maand zijn verplicht" });
  }

  const sess = req.session as { userId?: number; gebruikerNaam?: string };
  const jaar = Number(periode_jaar);
  const maand = Number(periode_maand);

  const mutaties = await db
    .select()
    .from(salarisMutatiesTable)
    .where(and(
      eq(salarisMutatiesTable.werkmaatschappij, werkmaatschappij),
      eq(salarisMutatiesTable.periodeJaar, jaar),
      eq(salarisMutatiesTable.periodeMaand, maand),
    ));

  let werkgeverInfo: { naam: string; scabEmailAdres: string | null; boekhouderNaam: string | null } | null = null;
  if (werkgever_id) {
    const [wg] = await db.select({
      naam: werkgeversTable.naam,
      scabEmailAdres: werkgeversTable.scabEmailAdres,
      boekhouderNaam: werkgeversTable.boekhouderNaam,
    }).from(werkgeversTable).where(eq(werkgeversTable.id, Number(werkgever_id)));
    if (wg) werkgeverInfo = wg;
  }

  const maandNamen = ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];
  const periodeLabel = `${maandNamen[maand - 1]} ${jaar}`;

  let onderwerp = `Salarismutaties ${werkmaatschappij} – ${periodeLabel}`;
  let inhoud = `Geachte heer/mevrouw,\n\nHierbij de salarismutaties voor ${werkmaatschappij} over de loonperiode ${periodeLabel}.\n\n`;

  if (mutaties.length === 0) {
    inhoud += "Er zijn geen mutaties voor deze periode.\n";
  }

  if (heeftGateway() && mutaties.length > 0) {
    try {
      const mutatiesJson = mutaties.map((m) => ({
        medewerker: m.medewerkerNaam ?? `medewerker-id ${m.medewerkerId}`,
        type: m.type,
        omschrijving: m.omschrijving,
        ingangsdatum: m.ingangsdatum,
        status: m.status,
      }));

      const scabResultaat = await aiGateway.chat("default", {
        max_tokens: 800,
        messages: [
          {
            role: "system",
            content: "Je bent een Nederlandse HRM-medewerker die professionele e-mails schrijft aan salarisverwerker SCAB over salarismutaties. Schrijf altijd formeel Nederlands. De e-mail bevat een duidelijke opsomming van de mutaties per medewerker. Sluit af met een gebruikelijke ondertekening.",
          },
          {
            role: "user",
            content: `Schrijf de volledige inhoud (ALLEEN de body, geen onderwerp) van een e-mail aan SCAB voor salarismutaties van ${werkmaatschappij} voor de periode ${periodeLabel}.\n\nMutaties:\n${JSON.stringify(mutatiesJson, null, 2)}`,
          },
        ],
      });

      if (scabResultaat.ok) inhoud = scabResultaat.inhoud;
    } catch (err) {
      req.log.error({ err }, "AI SCAB-mail generatie mislukt, gebruik fallback");
    }
  } else if (mutaties.length > 0) {
    mutaties.forEach((m) => {
      const naam = m.medewerkerNaam ?? `medewerker ${m.medewerkerId}`;
      inhoud += `- ${naam}: ${m.type}`;
      if (m.omschrijving) inhoud += ` (${m.omschrijving})`;
      if (m.ingangsdatum) inhoud += `, ingangsdatum ${m.ingangsdatum}`;
      inhoud += "\n";
    });
    inhoud += `\nMet vriendelijke groet,\nFPS Bouw en Renovatie\nPersoneelszaken\n`;
  }

  const [mail] = await db.insert(scabMailsTable).values({
    werkmaatschappij,
    werkgeverId: werkgever_id ? Number(werkgever_id) : null,
    periodeJaar: jaar,
    periodeMaand: maand,
    onderwerp,
    inhoud,
    scabEmailAdres: werkgeverInfo?.scabEmailAdres ?? null,
    contactpersoon: werkgeverInfo?.boekhouderNaam ?? null,
    status: "concept",
    aantalMutaties: mutaties.length,
    aiContextJson: { mutaties: mutaties.length, methode: heeftGateway() ? "gpt-4o" : "fallback" },
    aangemaaktDoorId: sess.userId ?? null,
    aangemaaktDoorNaam: sess.gebruikerNaam ?? null,
  }).returning();

  return res.status(201).json(mapMail(mail));
});

router.get("/scab-mails/:id", lezen, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const [mail] = await db.select().from(scabMailsTable).where(eq(scabMailsTable.id, id));
  if (!mail) return res.status(404).json({ message: "Niet gevonden" });
  return res.json(mapMail(mail));
});

router.patch("/scab-mails/:id", schrijven, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { onderwerp, inhoud, scab_email_adres, contactpersoon } = req.body;

  const [bestaand] = await db.select({ status: scabMailsTable.status })
    .from(scabMailsTable).where(eq(scabMailsTable.id, id));
  if (!bestaand) return res.status(404).json({ message: "Niet gevonden" });
  if (bestaand.status === "verzonden") return res.status(409).json({ message: "Verzonden mails kunnen niet meer worden bewerkt" });

  const update: Partial<typeof scabMailsTable.$inferInsert> = { bijgewerktOp: new Date() };
  if (onderwerp !== undefined) update.onderwerp = onderwerp;
  if (inhoud !== undefined) update.inhoud = inhoud;
  if (scab_email_adres !== undefined) update.scabEmailAdres = scab_email_adres;
  if (contactpersoon !== undefined) update.contactpersoon = contactpersoon;

  const [updated] = await db.update(scabMailsTable).set(update)
    .where(eq(scabMailsTable.id, id)).returning();

  return res.json(mapMail(updated));
});

router.post("/scab-mails/:id/verzend", verzenden, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const sess = req.session as { userId?: number; gebruikerNaam?: string };

  const [mail] = await db.select().from(scabMailsTable).where(eq(scabMailsTable.id, id));
  if (!mail) return res.status(404).json({ message: "Niet gevonden" });
  if (mail.status === "verzonden") return res.status(409).json({ message: "Al verzonden" });
  if (!mail.scabEmailAdres) return res.status(422).json({ message: "Geen SCAB-e-mailadres geconfigureerd" });

  const [updated] = await db.update(scabMailsTable).set({
    status: "verzonden",
    verzondOp: new Date(),
    verzondDoorId: sess.userId ?? null,
    verzondDoorNaam: sess.gebruikerNaam ?? null,
    bijgewerktOp: new Date(),
  }).where(eq(scabMailsTable.id, id)).returning();

  req.log.info({ scabMailId: id, naar: mail.scabEmailAdres }, "SCAB-mail als verzonden gemarkeerd");
  return res.json(mapMail(updated));
});

router.get("/scab-mails/:id/bijlagen", lezen, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const bijlagen = await db.select().from(scabMailBijlagenTable)
    .where(eq(scabMailBijlagenTable.scabMailId, id));
  return res.json(bijlagen.map(mapBijlage));
});

router.post(
  "/scab-mails/:id/bijlagen",
  schrijven,
  upload.single("bestand"),
  async (req: Request, res: Response) => {
    const scabMailId = Number(req.params.id);
    const bestand = req.file;
    if (!bestand) return res.status(400).json({ message: "Bestand ontbreekt" });

    const sess = req.session as { userId?: number };
    const { type, omschrijving, is_gevoelig, medewerker_id } = req.body;

    const mimeType = bestand.mimetype || "application/octet-stream";
    const subPath = `scab-bijlagen/${scabMailId}/${Date.now()}-${bestand.originalname}`;
    let objectPath: string;
    try {
      objectPath = await storage.uploadBestand(subPath, bestand.buffer, mimeType);
    } catch (err) {
      req.log.error({ err }, "Upload SCAB-bijlage mislukt");
      return res.status(500).json({ message: "Upload mislukt" });
    }

    let medewerkerNaam: string | null = null;
    if (medewerker_id) {
      const [med] = await db.select({ naam: medewerkersTable.naam })
        .from(medewerkersTable).where(eq(medewerkersTable.id, Number(medewerker_id)));
      medewerkerNaam = med?.naam ?? null;
    }

    const [bijlage] = await db.insert(scabMailBijlagenTable).values({
      scabMailId,
      type: type ?? "overig",
      omschrijving: omschrijving ?? null,
      objectPath,
      bestandsnaam: bestand.originalname,
      bestandsgrootte: bestand.size,
      isGevoelig: is_gevoelig === "true" || is_gevoelig === true,
      medewerkerId: medewerker_id ? Number(medewerker_id) : null,
      medewerkerNaam,
      aangemaaktDoorId: sess.userId ?? null,
    }).returning();

    return res.status(201).json(mapBijlage(bijlage));
  }
);

router.delete("/scab-mails/:id/bijlagen/:bijlage_id", schrijven, async (req: Request, res: Response) => {
  const bijlageId = Number(req.params.bijlage_id);
  await db.delete(scabMailBijlagenTable).where(eq(scabMailBijlagenTable.id, bijlageId));
  return res.status(204).send();
});

export default router;
