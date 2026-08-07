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
  gebouwenTable,
  gebruikersTable,
  projectenTable,
  werkInboxKoppelingenTable,
  werkInboxMailsTable,
  werkInboxTokensTable,
  FPS_BEDRIJVEN,
} from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
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

  const [voorstel] = await db.select().from(aanvraagVoorstellenTable).where(eq(aanvraagVoorstellenTable.id, id));
  if (!voorstel) { res.status(404).json({ error: "Voorstel niet gevonden." }); return; }
  if (voorstel.status !== "open") {
    res.status(409).json({ error: `Dit voorstel is al beoordeeld (${voorstel.status}).` });
    return;
  }

  const titel = (body.titel ?? "").trim();
  if (!titel) { res.status(400).json({ error: "titel is verplicht." }); return; }
  if (body.bv && !(FPS_BEDRIJVEN as readonly string[]).includes(body.bv)) {
    res.status(400).json({ error: "Onbekende BV." });
    return;
  }
  const voorstelType = body.voorstel_type ?? voorstel.voorstelType;
  if (!["nieuwe_aanvraag", "meerwerk"].includes(voorstelType)) {
    res.status(400).json({ error: "Ongeldig voorsteltype." });
    return;
  }

  // Relatie: bestaand id, of expliciet bevestigde nieuwe relatie — nooit stilzwijgend (§ acceptatie 8).
  if (!body.klant_id && !body.nieuwe_klant?.naam?.trim()) {
    res.status(422).json({ error: "De afzender is nog geen relatie. Bevestig eerst de klant: kies een bestaande relatie of bevestig het aanmaken van een nieuwe." });
    return;
  }

  // Meerwerk vereist een expliciet gekozen lopende opdracht.
  let gerelateerdProjectId: number | null = null;
  if (voorstelType === "meerwerk") {
    if (!body.gerelateerd_project_id) {
      res.status(422).json({ error: "Meerwerk vereist een expliciet gekozen lopende opdracht." });
      return;
    }
    const [project] = await db.select({ id: projectenTable.id }).from(projectenTable).where(eq(projectenTable.id, body.gerelateerd_project_id));
    if (!project) { res.status(404).json({ error: "De gekozen opdracht bestaat niet." }); return; }
    gerelateerdProjectId = project.id;
  }

  const beoordelaarId = req.session.userId ?? null;

  const resultaat = await db.transaction(async (tx) => {
    // Klant
    let klantId = body.klant_id ?? null;
    if (!klantId && body.nieuwe_klant?.naam?.trim()) {
      const [nieuw] = await tx.insert(crmKlantenTable).values({
        naam: body.nieuwe_klant.naam.trim(),
        email: body.nieuwe_klant.email?.trim() || voorstel.afzenderEmail || null,
        telefoon: body.nieuwe_klant.telefoon?.trim() || null,
        status: "prospect",
      }).returning({ id: crmKlantenTable.id });
      klantId = nieuw.id;
    }
    if (!klantId) throw new Error("klant ontbreekt");

    // Gebouw (optioneel): bestaand of expliciet bevestigd nieuw — nooit vanzelf.
    let gebouwId = body.gebouw_id ?? null;
    if (!gebouwId && body.nieuw_gebouw?.naam?.trim() && body.nieuw_gebouw?.adres?.trim()) {
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
      .set({
        status: "geaccepteerd",
        voorstelType,
        projectkansId: kans.id,
        beoordeeldDoorId: beoordelaarId,
        beoordeeldOp: new Date(),
        bijgewerktOp: new Date(),
      })
      .where(and(eq(aanvraagVoorstellenTable.id, id), eq(aanvraagVoorstellenTable.status, "open")))
      .returning();
    if (!bijgewerkt) throw new Error("voorstel was al beoordeeld");
    return { kans, voorstel: bijgewerkt };
  });

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
