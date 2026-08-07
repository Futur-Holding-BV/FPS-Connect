// ─── AANVRAAG_01: aanvraagvoorstellen — accorderen, afwijzen, antwoord versturen ─
//
// De AI stelt voor; hier beslist de mens. Pas bij accepteren wordt een
// projectkans vastgelegd (en eventueel — na expliciete bevestiging — een nieuwe
// relatie of een nieuw gebouw). Er ontstaat hier NOOIT een project: dat gebeurt
// uitsluitend bij ondertekening van de offerte (proces 2).

import { Router } from "express";
import {
  db,
  aanvraagVoorstellenTable,
  crmCommercieelTable,
  crmKlantenTable,
  factuurSignalenTable,
  gebouwenTable,
  gebruikersTable,
  projectenTable,
  werkInboxKoppelingenTable,
  werkInboxMailsTable,
  werkInboxTokensTable,
  FPS_BEDRIJVEN,
} from "@workspace/db";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { beantwoordMail } from "../services/werkInboxGraph";

const router = Router();
const lezen = requireBevoegdheid("crm", 1);
const schrijven = requireBevoegdheid("crm", 2);

function voorstelNaarJson(v: typeof aanvraagVoorstellenTable.$inferSelect, beoordeeldDoorNaam?: string | null) {
  return {
    id: v.id,
    mail_message_id: v.mailMessageId,
    mailbox_adres: v.mailboxAdres,
    afzender_naam: v.afzenderNaam,
    afzender_email: v.afzenderEmail,
    onderwerp: v.onderwerp,
    binnengekomen_op: v.binnengekomenOp.toISOString(),
    voorstel_type: v.voorstelType,
    status: v.status,
    ai_voorstel: v.aiVoorstel ?? null,
    concept_antwoord: v.conceptAntwoord,
    concept_vorm: v.conceptVorm,
    bijlagen: v.bijlagen ?? [],
    antwoord_verstuurd_op: v.antwoordVerstuurdOp?.toISOString() ?? null,
    projectkans_id: v.projectkansId,
    beoordeeld_door_naam: beoordeeldDoorNaam ?? null,
    beoordeeld_op: v.beoordeeldOp?.toISOString() ?? null,
    beoordeel_notitie: v.beoordeelNotitie,
  };
}

// ── Lijst ─────────────────────────────────────────────────────────────────────
router.get("/aanvragen/voorstellen", lezen, async (req, res): Promise<void> => {
  const status = typeof req.query["status"] === "string" ? req.query["status"] : undefined;
  const rijen = await db.select({
    v: aanvraagVoorstellenTable,
    beoordeeldDoorNaam: gebruikersTable.naam,
  })
    .from(aanvraagVoorstellenTable)
    .leftJoin(gebruikersTable, eq(gebruikersTable.id, aanvraagVoorstellenTable.beoordeeldDoorId))
    .where(status ? eq(aanvraagVoorstellenTable.status, status) : undefined)
    .orderBy(desc(aanvraagVoorstellenTable.binnengekomenOp))
    .limit(200);
  res.json(rijen.map((r) => voorstelNaarJson(r.v, r.beoordeeldDoorNaam)));
});

// ── Accepteren: pas hier wordt er iets vastgelegd ─────────────────────────────
router.post("/aanvragen/voorstellen/:id/accepteren", schrijven, async (req, res): Promise<void> => {
  const id = Number(req.params["id"]);
  const body = req.body as {
    titel?: string;
    klant_id?: number;
    nieuwe_klant?: { naam: string; email?: string; telefoon?: string };
    gebouw_id?: number;
    nieuw_gebouw?: { naam: string; adres: string; stad?: string };
    bv?: string;
    voorstel_type?: string;
    gerelateerd_project_id?: number;
  };

  const [bestaat] = await db.select({ id: aanvraagVoorstellenTable.id, status: aanvraagVoorstellenTable.status })
    .from(aanvraagVoorstellenTable).where(eq(aanvraagVoorstellenTable.id, id));
  if (!bestaat) { res.status(404).json({ error: "Voorstel niet gevonden." }); return; }
  if (bestaat.status !== "open") {
    res.status(409).json({ error: `Dit voorstel is al beoordeeld (${bestaat.status}).` });
    return;
  }

  const titel = (body.titel ?? "").trim();
  if (!titel) { res.status(400).json({ error: "titel is verplicht." }); return; }
  if (body.bv && !(FPS_BEDRIJVEN as readonly string[]).includes(body.bv)) {
    res.status(400).json({ error: "Onbekende BV." });
    return;
  }
  if (body.voorstel_type && !["nieuwe_aanvraag", "meerwerk"].includes(body.voorstel_type)) {
    res.status(400).json({ error: "Ongeldig voorsteltype." });
    return;
  }

  // Relatie: bestaand id, of expliciet bevestigde nieuwe relatie — nooit stilzwijgend (§ acceptatie 8).
  if (!body.klant_id && !body.nieuwe_klant?.naam?.trim()) {
    res.status(422).json({ error: "De afzender is nog geen relatie. Bevestig eerst de klant: kies een bestaande relatie of bevestig het aanmaken van een nieuwe." });
    return;
  }

  const beoordelaarId = req.session.userId ?? null;

  class StroomFout extends Error {
    constructor(public code: number, message: string) { super(message); }
  }

  let resultaat: { kans: typeof crmCommercieelTable.$inferSelect; voorstel: typeof aanvraagVoorstellenTable.$inferSelect };
  try {
    resultaat = await db.transaction(async (tx) => {
    // Eerst het open voorstel claimen (conditionele update): een tweede gelijktijdig
    // verzoek faalt hier direct, vóórdat er relaties/gebouwen/kansen ontstaan.
    const [voorstel] = await tx.update(aanvraagVoorstellenTable)
      .set({ status: "geaccepteerd", beoordeeldDoorId: beoordelaarId, beoordeeldOp: new Date(), bijgewerktOp: new Date() })
      .where(and(eq(aanvraagVoorstellenTable.id, id), eq(aanvraagVoorstellenTable.status, "open")))
      .returning();
    if (!voorstel) throw new StroomFout(409, "Dit voorstel is al beoordeeld.");

    const voorstelType = body.voorstel_type ?? voorstel.voorstelType;

    // Meerwerk vereist een expliciet gekozen lopende opdracht.
    let gerelateerdProjectId: number | null = null;
    if (voorstelType === "meerwerk") {
      if (!body.gerelateerd_project_id) throw new StroomFout(422, "Meerwerk vereist een expliciet gekozen lopende opdracht.");
      const [project] = await tx.select({ id: projectenTable.id }).from(projectenTable).where(eq(projectenTable.id, body.gerelateerd_project_id));
      if (!project) throw new StroomFout(404, "De gekozen opdracht bestaat niet.");
      gerelateerdProjectId = project.id;
    }

    // Klant: gekozen id valideren, of expliciet bevestigde nieuwe relatie aanmaken.
    let klantId = body.klant_id ?? null;
    if (klantId) {
      const [klant] = await tx.select({ id: crmKlantenTable.id }).from(crmKlantenTable).where(eq(crmKlantenTable.id, klantId));
      if (!klant) throw new StroomFout(404, "De gekozen relatie bestaat niet.");
    } else if (body.nieuwe_klant?.naam?.trim()) {
      const [nieuw] = await tx.insert(crmKlantenTable).values({
        naam: body.nieuwe_klant.naam.trim(),
        email: body.nieuwe_klant.email?.trim() || voorstel.afzenderEmail || null,
        telefoon: body.nieuwe_klant.telefoon?.trim() || null,
        status: "prospect",
      }).returning({ id: crmKlantenTable.id });
      klantId = nieuw.id;
    }
    if (!klantId) throw new StroomFout(422, "De klant ontbreekt.");

    // Gebouw (optioneel): bestaand id valideren, of expliciet bevestigd nieuw — nooit vanzelf.
    let gebouwId = body.gebouw_id ?? null;
    if (gebouwId) {
      const [gebouw] = await tx.select({ id: gebouwenTable.id }).from(gebouwenTable).where(eq(gebouwenTable.id, gebouwId));
      if (!gebouw) throw new StroomFout(404, "Het gekozen gebouw bestaat niet.");
    } else if (body.nieuw_gebouw?.naam?.trim() && body.nieuw_gebouw?.adres?.trim()) {
      const [nieuwGebouw] = await tx.insert(gebouwenTable).values({
        naam: body.nieuw_gebouw.naam.trim(),
        adres: body.nieuw_gebouw.adres.trim(),
        stad: body.nieuw_gebouw.stad?.trim() || null,
      }).returning({ id: gebouwenTable.id });
      gebouwId = nieuwGebouw.id;
    }

    // Projectkans vastleggen (fase signaal; reactieklok start bij binnenkomst van de mail)
    const ai = (voorstel.aiVoorstel ?? {}) as Record<string, unknown>;
    const [kans] = await tx.insert(crmCommercieelTable).values({
      klantId,
      gebouwId,
      titel,
      kansType: "offerte",
      fase: "signaal",
      aiSamenvatting: typeof ai["samenvatting"] === "string" ? (ai["samenvatting"] as string) : null,
      bronMailMessageId: voorstel.mailMessageId,
      binnengekomenOp: voorstel.binnengekomenOp,
      beantwoordOp: voorstel.antwoordVerstuurdOp,
      bedrijfBv: body.bv ?? null,
      gerelateerdProjectId,
      verantwoordelijkeId: beoordelaarId,
    }).returning();

    // Bronmail + entiteiten koppelen in de werk-inbox
    const koppelingen: Array<{ entityType: string; entityId: number; entityLabel: string }> = [
      { entityType: "klant", entityId: klantId, entityLabel: titel },
    ];
    if (gebouwId) koppelingen.push({ entityType: "gebouw", entityId: gebouwId, entityLabel: titel });
    if (gerelateerdProjectId) koppelingen.push({ entityType: "project", entityId: gerelateerdProjectId, entityLabel: `Meerwerk: ${titel}` });
    for (const k of koppelingen) {
      await tx.insert(werkInboxKoppelingenTable).values({
        messageId: voorstel.mailMessageId,
        gebruikerId: voorstel.gebruikerId,
        ...k,
      }).onConflictDoNothing();
    }

    const [bijgewerkt] = await tx.update(aanvraagVoorstellenTable)
      .set({ voorstelType, projectkansId: kans.id, bijgewerktOp: new Date() })
      .where(eq(aanvraagVoorstellenTable.id, id))
      .returning();
    return { kans, voorstel: bijgewerkt };
    });
  } catch (e) {
    if (e instanceof StroomFout) { res.status(e.code).json({ error: e.message }); return; }
    throw e;
  }

  res.json({ ...voorstelNaarJson(resultaat.voorstel), projectkans_id: resultaat.kans.id });
});

// ── Afwijzen ──────────────────────────────────────────────────────────────────
router.post("/aanvragen/voorstellen/:id/afwijzen", schrijven, async (req, res): Promise<void> => {
  const id = Number(req.params["id"]);
  const { notitie } = req.body as { notitie?: string };
  const [rij] = await db.update(aanvraagVoorstellenTable)
    .set({
      status: "afgewezen",
      beoordeeldDoorId: req.session.userId ?? null,
      beoordeeldOp: new Date(),
      beoordeelNotitie: notitie?.trim() || null,
      bijgewerktOp: new Date(),
    })
    .where(and(eq(aanvraagVoorstellenTable.id, id), eq(aanvraagVoorstellenTable.status, "open")))
    .returning();
  if (!rij) { res.status(409).json({ error: "Voorstel niet gevonden of al beoordeeld." }); return; }
  res.json(voorstelNaarJson(rij));
});

// ── Antwoord versturen (mens beslist; §3 stap 4) ─────────────────────────────
router.post("/aanvragen/voorstellen/:id/verstuur-antwoord", schrijven, async (req, res): Promise<void> => {
  const id = Number(req.params["id"]);
  const { tekst } = req.body as { tekst?: string };
  if (!tekst || tekst.trim().length < 10) {
    res.status(400).json({ error: "tekst is verplicht (het antwoord dat u wilt versturen)." });
    return;
  }

  const [voorstel] = await db.select().from(aanvraagVoorstellenTable).where(eq(aanvraagVoorstellenTable.id, id));
  if (!voorstel) { res.status(404).json({ error: "Voorstel niet gevonden." }); return; }
  if (voorstel.antwoordVerstuurdOp) {
    res.status(409).json({ error: "Er is al een antwoord verstuurd op deze aanvraag." });
    return;
  }

  // Versturen via de bestaande werk-inbox beantwoord-functie, vanuit de ontvangende mailbox.
  const [mail] = await db.select({
    mailboxAdres: werkInboxMailsTable.mailboxAdres,
    microsoftEmail: werkInboxTokensTable.microsoftEmail,
  })
    .from(werkInboxMailsTable)
    .leftJoin(werkInboxTokensTable, eq(werkInboxTokensTable.gebruikerId, werkInboxMailsTable.gebruikerId))
    .where(and(
      eq(werkInboxMailsTable.gebruikerId, voorstel.gebruikerId),
      eq(werkInboxMailsTable.messageId, voorstel.mailMessageId),
    ))
    .limit(1);
  if (!mail) { res.status(404).json({ error: "De bronmail is niet meer beschikbaar in de werk-inbox." }); return; }

  const htmlBody = tekst.trim().split("\n").map((r) => r === "" ? "<br>" : `<p style="margin:0 0 2px 0">${r.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`).join("");
  const isPersoonlijk = mail.mailboxAdres === mail.microsoftEmail;
  const resultaat = await beantwoordMail(voorstel.gebruikerId, mail.mailboxAdres, voorstel.mailMessageId, isPersoonlijk, { htmlBody });
  if (!resultaat.ok) {
    res.status(502).json({ error: resultaat.fout ?? "Versturen via Microsoft Graph mislukt." });
    return;
  }

  const nu = new Date();
  const [bijgewerkt] = await db.update(aanvraagVoorstellenTable)
    .set({ antwoordVerstuurdOp: nu, conceptAntwoord: tekst.trim(), bijgewerktOp: nu })
    .where(eq(aanvraagVoorstellenTable.id, id))
    .returning();
  if (bijgewerkt?.projectkansId) {
    await db.update(crmCommercieelTable)
      .set({ beantwoordOp: nu, bijgewerktOp: nu })
      .where(eq(crmCommercieelTable.id, bijgewerkt.projectkansId));
  }
  res.json(voorstelNaarJson(bijgewerkt));
});

// ── Signalen van de aanvraagbewaking (CRM-bevoegdheid, §4) ───────────────────
// De bewaking schrijft in factuur_signalen; deze ingang maakt de aanvraag-
// signalen zichtbaar en afhandelbaar voor wie CRM mag zien (niet alleen financieel).
const AANVRAAG_SIGNAAL_FILTER = or(
  inArray(factuurSignalenTable.type, ["aanvraag_antwoord_te_laat", "aanvraag_niet_opgepakt"]),
  and(eq(factuurSignalenTable.type, "ai_onzeker"), isNull(factuurSignalenTable.factuurId)),
);

router.get("/aanvragen/signalen", lezen, async (req, res): Promise<void> => {
  const status = (req.query["status"] as string | undefined) === "afgehandeld" ? "afgehandeld" : "open";
  const rijen = await db.select({
    id: factuurSignalenTable.id,
    type: factuurSignalenTable.type,
    mail_message_id: factuurSignalenTable.mailMessageId,
    projectkans_id: factuurSignalenTable.projectkansId,
    omschrijving: factuurSignalenTable.omschrijving,
    status: factuurSignalenTable.status,
    afhandel_notitie: factuurSignalenTable.afhandelNotitie,
    aangemaakt_op: factuurSignalenTable.aangemaaktOp,
    afgehandeld_op: factuurSignalenTable.afgehandeldOp,
    afgehandeld_door_naam: gebruikersTable.naam,
    kans_titel: crmCommercieelTable.titel,
  })
    .from(factuurSignalenTable)
    .leftJoin(gebruikersTable, eq(factuurSignalenTable.afgehandeldDoor, gebruikersTable.id))
    .leftJoin(crmCommercieelTable, eq(factuurSignalenTable.projectkansId, crmCommercieelTable.id))
    .where(and(eq(factuurSignalenTable.status, status), AANVRAAG_SIGNAAL_FILTER))
    .orderBy(desc(factuurSignalenTable.aangemaaktOp))
    .limit(200);
  res.json(rijen.map((r) => ({
    ...r,
    aangemaakt_op: r.aangemaakt_op.toISOString(),
    afgehandeld_op: r.afgehandeld_op?.toISOString() ?? null,
  })));
});

router.post("/aanvragen/signalen/:id/afhandelen", schrijven, async (req, res): Promise<void> => {
  const id = Number(req.params["id"]);
  const { notitie } = req.body as { notitie?: string };
  const [signaal] = await db.select().from(factuurSignalenTable)
    .where(and(eq(factuurSignalenTable.id, id), AANVRAAG_SIGNAAL_FILTER)).limit(1);
  if (!signaal) { res.status(404).json({ error: "Signaal niet gevonden (of geen aanvraag-signaal)." }); return; }
  if (signaal.status === "afgehandeld") { res.status(409).json({ error: "Al afgehandeld." }); return; }
  const [updated] = await db.update(factuurSignalenTable).set({
    status: "afgehandeld",
    afgehandeldDoor: req.session.userId ?? null,
    afgehandeldOp: new Date(),
    afhandelNotitie: notitie?.trim() || null,
  }).where(eq(factuurSignalenTable.id, id)).returning();
  res.json({ ok: true, id: updated.id, status: updated.status });
});

// ── Persoonlijke mailbox als aanvraag-ingang (instelling per gebruiker) ──────
router.get("/aanvragen/intake-instellingen", lezen, async (req, res): Promise<void> => {
  const uid = req.session.userId!;
  const [token] = await db.select({
    email: werkInboxTokensTable.microsoftEmail,
    persoonlijk: werkInboxTokensTable.aanvraagIntakePersoonlijk,
  }).from(werkInboxTokensTable).where(eq(werkInboxTokensTable.gebruikerId, uid));
  res.json({
    mail_gekoppeld: !!token,
    persoonlijk_adres: token?.email ?? null,
    persoonlijke_intake: token?.persoonlijk ?? false,
  });
});

router.patch("/aanvragen/intake-instellingen", schrijven, async (req, res): Promise<void> => {
  const uid = req.session.userId!;
  const { persoonlijke_intake } = req.body as { persoonlijke_intake?: boolean };
  if (typeof persoonlijke_intake !== "boolean") {
    res.status(400).json({ error: "persoonlijke_intake (boolean) is verplicht." });
    return;
  }
  const [rij] = await db.update(werkInboxTokensTable)
    .set({ aanvraagIntakePersoonlijk: persoonlijke_intake, bijgewerktOp: new Date() })
    .where(eq(werkInboxTokensTable.gebruikerId, uid))
    .returning({ email: werkInboxTokensTable.microsoftEmail, persoonlijk: werkInboxTokensTable.aanvraagIntakePersoonlijk });
  if (!rij) { res.status(404).json({ error: "Er is nog geen mailkoppeling voor dit account." }); return; }
  res.json({ mail_gekoppeld: true, persoonlijk_adres: rij.email, persoonlijke_intake: rij.persoonlijk });
});

export default router;
