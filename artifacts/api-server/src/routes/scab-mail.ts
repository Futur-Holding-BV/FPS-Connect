import { Router, Request, Response } from "express";
import multer from "multer";
import {
  db,
  scabMailsTable,
  scabMailBijlagenTable,
  salarisMutatiesTable,
  declaratiesTable,
  werkgeversTable,
  medewerkersTable,
} from "@workspace/db";
import { eq, and, desc, asc, inArray, isNotNull, ne } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { ObjectStorageService } from "../lib/objectStorage";
import { aiGateway, heeftGateway } from "../lib/aiGateway";
import { SCAB_MAIL_GENERATIE_PROMPT } from "../lib/aiPrompts";
import {
  genereerDeterministischeBody,
  eersteOngeldigeElement,
  dedupliceerId,
  MAAND_NAMEN_NL,
  type WerkgeverBodyInfo,
  type MutatieBodyItem,
} from "../lib/scabMailHelpers";

const router = Router();
const storage = new ObjectStorageService();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const lezen = requireBevoegdheid("scab_mail", 1);
const schrijven = requireBevoegdheid("scab_mail", 2);
const verzenden = requireBevoegdheid("scab_mail", 3);

function mapMail(m: typeof scabMailsTable.$inferSelect) {
  const snapshotIds = Array.isArray(m.mutatieIds)
    ? (m.mutatieIds as unknown[]).filter((v): v is number => typeof v === "number")
    : null;
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
    mutatie_ids: snapshotIds,
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

router.get("/scab-mails", lezen, async (req: Request, res: Response): Promise<void> => {
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

  return void res.json(rows.map(mapMail));
});

router.post("/scab-mails/genereer", schrijven, async (req: Request, res: Response): Promise<void> => {
  const { werkmaatschappij, werkgever_id, periode_jaar, periode_maand } = req.body;
  if (!werkmaatschappij || !periode_jaar || !periode_maand) {
    return void res.status(400).json({ message: "werkmaatschappij, periode_jaar en periode_maand zijn verplicht" });
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

  let werkgeverInfo: {
    naam: string;
    scabEmailAdres: string | null;
    boekhouderNaam: string | null;
    boekhouderEmail: string | null;
    internContactNaam: string | null;
    internContactEmail: string | null;
  } | null = null;
  if (werkgever_id) {
    const [wg] = await db.select({
      naam: werkgeversTable.naam,
      scabEmailAdres: werkgeversTable.scabEmailAdres,
      boekhouderNaam: werkgeversTable.boekhouderNaam,
      boekhouderEmail: werkgeversTable.boekhouderEmail,
      internContactNaam: werkgeversTable.internContactNaam,
      internContactEmail: werkgeversTable.internContactEmail,
    }).from(werkgeversTable).where(eq(werkgeversTable.id, Number(werkgever_id)));
    if (wg) werkgeverInfo = wg;
  }

  const periodeLabel = `${MAAND_NAMEN_NL[maand - 1]} ${jaar}`;
  const onderwerp = `Salarismutaties ${werkmaatschappij} – ${periodeLabel}`;

  // Deterministische fallback-body altijd eerst opbouwen; een geslaagde
  // AI-generatie vervangt hem, een mislukte laat hem intact.
  let inhoud = genereerDeterministischeBody(werkmaatschappij, jaar, maand, mutaties, werkgeverInfo);

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
            content: SCAB_MAIL_GENERATIE_PROMPT.tekst,
          },
          {
            role: "user",
            content: `Schrijf de volledige inhoud (ALLEEN de body, geen onderwerp) van een e-mail aan SCAB voor salarismutaties van ${werkmaatschappij} voor de periode ${periodeLabel}.\n\nMutaties:\n${JSON.stringify(mutatiesJson, null, 2)}`,
          },
        ],
      }, undefined, {
        module: "salaris",
        functie: "genereerScabMail",
        gebruikerId: sess.userId ?? null,
        promptNaam: SCAB_MAIL_GENERATIE_PROMPT.naam,
        promptVersie: SCAB_MAIL_GENERATIE_PROMPT.versie,
      });

      // AI levert alleen de body; de deterministische ondertekening met de
      // werkgevergegevens wordt server-side toegevoegd (nooit aan AI overlaten).
      if (scabResultaat.ok) {
        const afzenderBedrijf = werkgeverInfo?.naam ?? werkmaatschappij;
        const afzenderPersoon = werkgeverInfo?.internContactNaam ?? null;
        const ondertekening = `\nMet vriendelijke groet,\n${afzenderPersoon ? `${afzenderPersoon}\n` : ""}${afzenderBedrijf}\nPersoneelszaken${werkgeverInfo?.internContactEmail ? `\n${werkgeverInfo.internContactEmail}` : ""}\n`;
        inhoud = `${scabResultaat.inhoud.replace(/\s+$/, "")}\n${ondertekening}`;
      }
    } catch (err) {
      req.log.error({ err }, "AI SCAB-mail generatie mislukt, deterministische fallback-body blijft staan");
    }
  }

  const [mail] = await db.insert(scabMailsTable).values({
    werkmaatschappij,
    werkgeverId: werkgever_id ? Number(werkgever_id) : null,
    periodeJaar: jaar,
    periodeMaand: maand,
    onderwerp,
    inhoud,
    // Ontvanger: het SCAB-/aanleveradres van de werkgever; wanneer dat leeg is
    // (null of lege/whitespace-string) valt de mail terug op het e-mailadres
    // van de boekhouder (Bedrijfsgegevens).
    scabEmailAdres: werkgeverInfo?.scabEmailAdres?.trim() || werkgeverInfo?.boekhouderEmail?.trim() || null,
    contactpersoon: werkgeverInfo?.boekhouderNaam ?? null,
    status: "concept",
    aantalMutaties: mutaties.length,
    mutatieIds: mutaties.map((m) => m.id),
    aiContextJson: { mutaties: mutaties.length, methode: heeftGateway() ? "gpt-4o" : "fallback" },
    aangemaaktDoorId: sess.userId ?? null,
    aangemaaktDoorNaam: sess.gebruikerNaam ?? null,
  }).returning();

  return void res.status(201).json(mapMail(mail));
});

router.get("/scab-mails/:id", lezen, async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const [mail] = await db.select().from(scabMailsTable).where(eq(scabMailsTable.id, id));
  if (!mail) return void res.status(404).json({ message: "Niet gevonden" });
  return void res.json(mapMail(mail));
});

router.get("/scab-mails/:id/mutaties", lezen, async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const [mail] = await db.select({
    werkmaatschappij: scabMailsTable.werkmaatschappij,
    periodeJaar: scabMailsTable.periodeJaar,
    periodeMaand: scabMailsTable.periodeMaand,
    mutatieIds: scabMailsTable.mutatieIds,
  }).from(scabMailsTable).where(eq(scabMailsTable.id, id));
  if (!mail) return void res.status(404).json({ message: "Niet gevonden" });

  const snapshot = Array.isArray(mail.mutatieIds)
    ? new Set((mail.mutatieIds as unknown[]).filter((v): v is number => typeof v === "number"))
    : new Set<number>();

  // Alle mutaties voor deze werkmaatschappij+periode; snapshot-mutaties die
  // inmiddels zijn verwijderd vallen weg (id's zijn integer, geen string-matching).
  const mutaties = await db
    .select({
      id: salarisMutatiesTable.id,
      medewerkerNaam: salarisMutatiesTable.medewerkerNaam,
      type: salarisMutatiesTable.type,
      omschrijving: salarisMutatiesTable.omschrijving,
      ingangsdatum: salarisMutatiesTable.ingangsdatum,
      status: salarisMutatiesTable.status,
    })
    .from(salarisMutatiesTable)
    .where(and(
      eq(salarisMutatiesTable.werkmaatschappij, mail.werkmaatschappij),
      eq(salarisMutatiesTable.periodeJaar, mail.periodeJaar),
      eq(salarisMutatiesTable.periodeMaand, mail.periodeMaand),
    ))
    .orderBy(asc(salarisMutatiesTable.id));

  return void res.json(mutaties.map((m) => ({
    id: m.id,
    medewerker_naam: m.medewerkerNaam,
    type: m.type,
    omschrijving: m.omschrijving,
    ingangsdatum: m.ingangsdatum,
    status: m.status,
    in_snapshot: snapshot.has(m.id),
  })));
});

router.patch("/scab-mails/:id", schrijven, async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const { onderwerp, inhoud, scab_email_adres, contactpersoon, mutatie_ids } = req.body;

  const [bestaand] = await db.select({
    status: scabMailsTable.status,
    werkmaatschappij: scabMailsTable.werkmaatschappij,
    periodeJaar: scabMailsTable.periodeJaar,
    periodeMaand: scabMailsTable.periodeMaand,
    werkgeverId: scabMailsTable.werkgeverId,
  }).from(scabMailsTable).where(eq(scabMailsTable.id, id));
  if (!bestaand) return void res.status(404).json({ message: "Niet gevonden" });
  if (bestaand.status === "verzonden") return void res.status(409).json({ message: "Verzonden mails kunnen niet meer worden bewerkt" });

  const update: Partial<typeof scabMailsTable.$inferInsert> = { bijgewerktOp: new Date() };
  if (onderwerp !== undefined) update.onderwerp = onderwerp;
  if (scab_email_adres !== undefined) update.scabEmailAdres = scab_email_adres;
  if (contactpersoon !== undefined) update.contactpersoon = contactpersoon;

  // Mutatieselectie bijwerken: server valideert alle opgegeven IDs tegen de
  // werkmaatschappij+periode van déze mail, dedupliceert ze, en regenereert
  // de volledige mailtekst inclusief aanhef en ondertekening. De client-body
  // wordt genegeerd bij selectiewijzigingen om te voorkomen dat een incomplete
  // preview (zonder ondertekening) of buitenscope IDs worden opgeslagen.
  // Fail-closed: aanwezige maar niet-array mutatie_ids (bijv. string of getal)
  // worden geweigerd zodat een typfout in de client nooit stilzwijgend wordt
  // genegeerd en de selectie ongewijzigd laat.
  if (mutatie_ids !== undefined && !Array.isArray(mutatie_ids)) {
    return void res.status(400).json({ message: "mutatie_ids moet een array van gehele getallen zijn" });
  }

  if (Array.isArray(mutatie_ids)) {
    // Fail-closed: als één element geen geheel getal is weigeren we het hele
    // verzoek. Stil filteren zou onbedoeld mutaties uit de snapshot verwijderen
    // en de boekhoudkundige scope stiekem verkleinen.
    const ongeldig = eersteOngeldigeElement(mutatie_ids as unknown[]);
    if (ongeldig !== undefined) {
      return void res.status(400).json({ message: "Elk element van mutatie_ids moet een geheel getal zijn" });
    }

    const rawIds = mutatie_ids as number[];
    const uniekIds = dedupliceerId(rawIds);

    if (uniekIds.length > 0) {
      // Controleer of alle opgegeven IDs daadwerkelijk bij de periode+werkmaatschappij
      // van déze mail horen. IDs die niet bestaan of bij een ander scope horen
      // worden geweigerd (fail-closed) — ze sturen anders de verwerkt-overgang.
      const geldige = await db
        .select({ id: salarisMutatiesTable.id })
        .from(salarisMutatiesTable)
        .where(and(
          inArray(salarisMutatiesTable.id, uniekIds),
          eq(salarisMutatiesTable.werkmaatschappij, bestaand.werkmaatschappij),
          eq(salarisMutatiesTable.periodeJaar, bestaand.periodeJaar),
          eq(salarisMutatiesTable.periodeMaand, bestaand.periodeMaand),
        ));
      const geldigeSet = new Set(geldige.map((r) => r.id));
      const ongeldig = uniekIds.filter((i) => !geldigeSet.has(i));
      if (ongeldig.length > 0) {
        return void res.status(400).json({
          message: `Onbekende of verkeerd-scope mutatie-id's: ${ongeldig.join(", ")}`,
        });
      }
    }

    // Werkgeverinfo ophalen voor de ondertekening in de geregende body.
    let wgInfo: WerkgeverBodyInfo = null;
    if (bestaand.werkgeverId) {
      const [wg] = await db.select({
        naam: werkgeversTable.naam,
        internContactNaam: werkgeversTable.internContactNaam,
        internContactEmail: werkgeversTable.internContactEmail,
      }).from(werkgeversTable).where(eq(werkgeversTable.id, bestaand.werkgeverId));
      if (wg) wgInfo = wg;
    }

    // Mutaties ophalen en vervolgens hersorteren naar de volgorde van uniekIds.
    // SQL garandeert geen rijvolgorde bij WHERE id IN (...), dus we bouwen een
    // Map en construeren de lijst in de opgeslagen/gevraagde ID-volgorde zodat
    // de gegenereerde mailtekst deterministisch identiek is bij gelijke selectie.
    const dbMutaties = uniekIds.length === 0 ? [] : await db
      .select({
        id: salarisMutatiesTable.id,
        medewerkerNaam: salarisMutatiesTable.medewerkerNaam,
        medewerkerId: salarisMutatiesTable.medewerkerId,
        type: salarisMutatiesTable.type,
        omschrijving: salarisMutatiesTable.omschrijving,
        ingangsdatum: salarisMutatiesTable.ingangsdatum,
      })
      .from(salarisMutatiesTable)
      .where(inArray(salarisMutatiesTable.id, uniekIds));
    const mutatieMap = new Map(dbMutaties.map((m) => [m.id, m]));
    const geselecteerdeMutaties = uniekIds
      .map((mid) => mutatieMap.get(mid))
      .filter((m): m is NonNullable<typeof m> => m !== undefined);

    update.mutatieIds = uniekIds;
    update.aantalMutaties = uniekIds.length;
    // Server genereert de volledige deterministische body (aanhef + lijstregels
    // + ondertekening). Een client-provided inhoud wordt bij een selectiewijziging
    // genegeerd zodat de ondertekening altijd de echte werkgeverdata bevat.
    update.inhoud = genereerDeterministischeBody(
      bestaand.werkmaatschappij,
      bestaand.periodeJaar,
      bestaand.periodeMaand,
      geselecteerdeMutaties,
      wgInfo,
    );
  } else if (inhoud !== undefined) {
    // Geen selectiewijziging: sla de handmatig bewerkte tekst op.
    update.inhoud = inhoud;
  }

  const [updated] = await db.update(scabMailsTable).set(update)
    .where(eq(scabMailsTable.id, id)).returning();

  return void res.json(mapMail(updated));
});

router.post("/scab-mails/:id/verzend", verzenden, async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const sess = req.session as { userId?: number; gebruikerNaam?: string };

  const [mail] = await db.select().from(scabMailsTable).where(eq(scabMailsTable.id, id));
  if (!mail) return void res.status(404).json({ message: "Niet gevonden" });
  if (mail.status === "verzonden") return void res.status(409).json({ message: "Al verzonden" });
  if (!mail.scabEmailAdres) return void res.status(422).json({ message: "Geen SCAB-e-mailadres geconfigureerd" });

  // Atomaire statusovergang: alleen de request die de rij daadwerkelijk van
  // niet-verzonden naar verzonden brengt, gaat door (parallelle klik → 409).
  const [updated] = await db.update(scabMailsTable).set({
    status: "verzonden",
    verzondOp: new Date(),
    verzondDoorId: sess.userId ?? null,
    verzondDoorNaam: sess.gebruikerNaam ?? null,
    bijgewerktOp: new Date(),
  }).where(and(
    eq(scabMailsTable.id, id),
    ne(scabMailsTable.status, "verzonden"),
  )).returning();
  if (!updated) return void res.status(409).json({ message: "Al verzonden" });

  req.log.info({ scabMailId: id, naar: mail.scabEmailAdres }, "SCAB-mail als verzonden gemarkeerd");

  // Meegenomen met de loonaanlevering → declaraties automatisch op "verwerkt".
  // Uitsluitend de mutaties uit de snapshot van deze mail (mutatie_ids,
  // vastgelegd bij het genereren) tellen mee: een declaratie die ná het
  // genereren is goedgekeurd stond niet in de verzonden mail en blijft dus
  // "goedgekeurd" tot een volgende aanlevering. Fouten hier blokkeren de
  // verzending niet.
  try {
    const snapshot = Array.isArray(mail.mutatieIds)
      ? (mail.mutatieIds as unknown[]).filter((v): v is number => typeof v === "number")
      : [];
    const gekoppeld = snapshot.length === 0 ? [] : await db
      .select({ declaratieId: salarisMutatiesTable.declaratieId })
      .from(salarisMutatiesTable)
      .where(and(
        inArray(salarisMutatiesTable.id, snapshot),
        isNotNull(salarisMutatiesTable.declaratieId),
        ne(salarisMutatiesTable.status, "afgekeurd"),
      ));
    const ids = gekoppeld.map((r) => r.declaratieId).filter((v): v is number => v != null);
    if (ids.length > 0) {
      const verwerkt = await db
        .update(declaratiesTable)
        .set({
          status:       "verwerkt",
          verwerkingOp: new Date(),
          verwerktDoor: sess.userId ?? null,
          bijgewerktOp: new Date(),
        })
        .where(and(
          inArray(declaratiesTable.id, ids),
          eq(declaratiesTable.status, "goedgekeurd"),
        ))
        .returning({ id: declaratiesTable.id });
      if (verwerkt.length > 0) {
        req.log.info({ scabMailId: id, declaratieIds: verwerkt.map((v) => v.id) }, "Declaraties automatisch op verwerkt gezet na SCAB-verzending");
      }
    }
  } catch (err) {
    req.log.error({ err, scabMailId: id }, "Automatisch verwerken van declaraties na SCAB-verzending mislukt");
  }

  return void res.json(mapMail(updated));
});

router.get("/scab-mails/:id/bijlagen", lezen, async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const bijlagen = await db.select().from(scabMailBijlagenTable)
    .where(eq(scabMailBijlagenTable.scabMailId, id));
  return void res.json(bijlagen.map(mapBijlage));
});

router.post(
  "/scab-mails/:id/bijlagen",
  schrijven,
  upload.single("bestand"),
  async (req: Request, res: Response): Promise<void> => {
    const scabMailId = Number(req.params.id);
    const bestand = req.file;
    if (!bestand) return void res.status(400).json({ message: "Bestand ontbreekt" });

    const sess = req.session as { userId?: number };
    const { type, omschrijving, is_gevoelig, medewerker_id } = req.body;

    const mimeType = bestand.mimetype || "application/octet-stream";
    const subPath = `scab-bijlagen/${scabMailId}/${Date.now()}-${bestand.originalname}`;
    let objectPath: string;
    try {
      objectPath = await storage.uploadBestand(subPath, bestand.buffer, mimeType);
    } catch (err) {
      req.log.error({ err }, "Upload SCAB-bijlage mislukt");
      return void res.status(500).json({ message: "Upload mislukt" });
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

    return void res.status(201).json(mapBijlage(bijlage));
  }
);

router.delete("/scab-mails/:id/bijlagen/:bijlage_id", schrijven, async (req: Request, res: Response): Promise<void> => {
  const bijlageId = Number(req.params.bijlage_id);
  await db.delete(scabMailBijlagenTable).where(eq(scabMailBijlagenTable.id, bijlageId));
  return void res.status(204).send();
});

export default router;
