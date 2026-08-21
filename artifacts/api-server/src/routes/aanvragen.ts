// ─── AANVRAAG_01: aanvraagvoorstellen — accorderen, afwijzen, antwoord versturen ─
//
// De AI stelt voor; hier beslist de mens. Pas bij accepteren wordt een
// CRM-relatie, gebouw, opname, calculatie vastgelegd.
// Er ontstaat hier NOOIT een offerte/project/offerteregel.

import { Router } from "express";
// H. Generated Zod body validator voor accepteer-route
import { AccepteerAanvraagVoorstelBody } from "@workspace/api-zod";
import {
  db,
  aanvraagVoorstellenTable,
  crmCommercieelTable,
  crmKlantenTable,
  crmContactpersonenTable,
  factuurSignalenTable,
  gebouwenTable,
  gebouwPartijenTable,
  opnamesTable,
  modCalcHeadersTable,
  inboxItemsTable,
  inboxAuditLogTable,
  gebruikersTable,
  werkgeversTable,
  projectenTable,
  werkInboxKoppelingenTable,
  werkInboxMailsTable,
  werkInboxTokensTable,
  FPS_BEDRIJVEN,
} from "@workspace/db";
import { and, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { beantwoordMail } from "../services/werkInboxGraph";
import {
  OpdrachtgeverFout,
  resolveerOpdrachtgever,
} from "../services/opdrachtgever";
import { ObjectStorageService } from "../lib/objectStorage";

const router = Router();
const objectStorage = new ObjectStorageService();
const lezen = requireBevoegdheid("crm", 1);
const schrijven = requireBevoegdheid("crm", 2);

function voorstelNaarJson(
  v: typeof aanvraagVoorstellenTable.$inferSelect,
  beoordeeldDoorNaam?: string | null,
  extra?: { klantNaam?: string | null; contactNaam?: string | null; werkmaatschappijNaam?: string | null },
) {
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
    // AANVRAAG_01 §6 — result-FKs na acceptatie
    inbox_item_id: v.inboxItemId ?? null,
    klant_id: v.klantId ?? null,
    klant_naam: extra?.klantNaam ?? null,
    contactpersoon_id: v.contactpersoonId ?? null,
    contact_naam: extra?.contactNaam ?? null,
    gebouw_id: v.gebouwId ?? null,
    opname_id: v.opnameId ?? null,
    calculatie_id: v.calculatieId ?? null,
    werkmaatschappij_id: v.werkmaatschappijId ?? null,
    werkmaatschappij_naam: extra?.werkmaatschappijNaam ?? null,
  };
}

// ── Lijst ─────────────────────────────────────────────────────────────────────
// E. Join klant, contact, werkmaatschappij zodat geaccepteerde voorstellen namen tonen.
router.get("/aanvragen/voorstellen", lezen, async (req, res): Promise<void> => {
  const status = typeof req.query["status"] === "string" ? req.query["status"] : undefined;
  const rijen = await db.select({
    v: aanvraagVoorstellenTable,
    beoordeeldDoorNaam: gebruikersTable.naam,
    klantNaam: crmKlantenTable.naam,
    contactNaam: crmContactpersonenTable.naam,
    werkmaatschappijNaam: werkgeversTable.naam,
  })
    .from(aanvraagVoorstellenTable)
    .leftJoin(gebruikersTable, eq(gebruikersTable.id, aanvraagVoorstellenTable.beoordeeldDoorId))
    .leftJoin(crmKlantenTable, eq(crmKlantenTable.id, aanvraagVoorstellenTable.klantId))
    .leftJoin(crmContactpersonenTable, eq(crmContactpersonenTable.id, aanvraagVoorstellenTable.contactpersoonId))
    .leftJoin(werkgeversTable, eq(werkgeversTable.id, (aanvraagVoorstellenTable as any).werkmaatschappijId))
    .where(status ? eq(aanvraagVoorstellenTable.status, status) : undefined)
    .orderBy(desc(aanvraagVoorstellenTable.binnengekomenOp))
    .limit(200);
  res.json(rijen.map((r) => voorstelNaarJson(r.v, r.beoordeeldDoorNaam, {
    klantNaam: r.klantNaam,
    contactNaam: r.contactNaam,
    werkmaatschappijNaam: r.werkmaatschappijNaam,
  })));
});

// ── Voorstelgebonden bronbestand ─────────────────────────────────────────────
// Accepteert bewust een voorstel-id, nooit een vrij inbox-item-id. Zo kan een
// CRM-beoordelaar alleen de bron openen van een voorstel dat via deze module
// zichtbaar is, en geen willekeurig HR- of financieel inboxdocument opvragen.
router.get("/aanvragen/voorstellen/:id/bronbestand", lezen, async (req, res): Promise<void> => {
  const id = Number(req.params["id"]);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Ongeldig voorstel-id." });
    return;
  }

  try {
    const [bron] = await db.select({
      bestandsnaam: inboxItemsTable.bestandsnaam,
      bestandspad: inboxItemsTable.bestandspad,
      mimetype: inboxItemsTable.mimetype,
    })
      .from(aanvraagVoorstellenTable)
      .innerJoin(inboxItemsTable, eq(inboxItemsTable.id, aanvraagVoorstellenTable.inboxItemId))
      .where(eq(aanvraagVoorstellenTable.id, id))
      .limit(1);
    if (!bron?.bestandspad?.startsWith("/objects/")) {
      res.status(404).json({ error: "Het bronbestand is niet beschikbaar." });
      return;
    }

    const storageFile = await objectStorage.getObjectEntityFile(bron.bestandspad);
    const download = await objectStorage.downloadObject(storageFile);
    if (!download.ok) {
      res.status(download.status).json({ error: "Het bronbestand is niet beschikbaar." });
      return;
    }
    const buffer = Buffer.from(await download.arrayBuffer());
    res.setHeader("Content-Type", bron.mimetype ?? "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(bron.bestandsnaam)}`);
    res.send(buffer);
  } catch (err) {
    req.log.warn({ err, voorstelId: id }, "Aanvraagbron downloaden mislukt");
    res.status(404).json({ error: "Het bronbestand is niet beschikbaar." });
  }
});

// ── Accepteren: CRM-relatie + contact + gebouw + opname + calculatie ──────────
// AANVRAAG_01 §5 — vereist crm:2, gebouwen:3, calculaties:3
const accepterenBevoegd = [
  requireBevoegdheid("crm", 2),
  requireBevoegdheid("gebouwen", 3),
  requireBevoegdheid("calculaties", 3),
];

router.post("/aanvragen/voorstellen/:id/accepteren", ...accepterenBevoegd, async (req, res): Promise<void> => {
  const id = Number(req.params["id"]);

  // H. Valideer body met gegenereerd Zod schema (safe: geeft leesbare fout terug)
  const bodyParse = AccepteerAanvraagVoorstelBody.safeParse(req.body);
  if (!bodyParse.success) {
    res.status(400).json({ error: "Ongeldige invoer.", details: bodyParse.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
    return;
  }
  const body = bodyParse.data;

  // ── Input validatie (vóór DB) ─────────────────────────────────────────────
  const titel = (body.titel ?? "").trim();
  if (!titel) { res.status(400).json({ error: "titel is verplicht." }); return; }
  const werkzaamheden = (body.werkzaamheden ?? "").trim();
  if (!werkzaamheden) { res.status(400).json({ error: "werkzaamheden is verplicht." }); return; }
  if (body.voorstel_type && !["nieuwe_aanvraag", "meerwerk"].includes(body.voorstel_type)) {
    res.status(400).json({ error: "Ongeldig voorsteltype." }); return;
  }
  // Gebouw is verplicht (§5)
  if (
    !body.gebouw_id &&
    !(
      body.nieuw_gebouw?.naam?.trim() &&
      body.nieuw_gebouw.adres?.trim() &&
      body.nieuw_gebouw.postcode?.trim() &&
      body.nieuw_gebouw.stad?.trim()
    )
  ) {
    res.status(422).json({
      error:
        "Kies een bestaand gebouw of vul naam, adres, postcode en plaats van het nieuwe gebouw in.",
    }); return;
  }
  // Klant is verplicht
  if (!body.klant_id && !body.nieuwe_klant) {
    res.status(422).json({ error: "Kies een bestaande opdrachtgever of maak een nieuwe aan." }); return;
  }

  const beoordelaarId = req.session.userId ?? null;

  class StroomFout extends Error {
    constructor(public code: number, message: string) { super(message); }
  }

  let resultaat: {
    voorstel: typeof aanvraagVoorstellenTable.$inferSelect;
    kans: typeof crmCommercieelTable.$inferSelect | null;
    klantNaam: string;
    contactNaam: string;
    werkmaatschappijNaam: string | null;
    calculatieId: number;
    opnameId: number;
    klantId: number;
    contactpersoonId: number | null;
    gebouwId: number;
  };

  try {
    resultaat = await db.transaction(async (tx) => {
      // ── 1. Claim het voorstel (conditionele update — EERSTE mutatie) ─────────
      const [voorstel] = await tx.update(aanvraagVoorstellenTable)
        .set({ status: "geaccepteerd", beoordeeldDoorId: beoordelaarId, beoordeeldOp: new Date(), bijgewerktOp: new Date() })
        .where(and(eq(aanvraagVoorstellenTable.id, id), eq(aanvraagVoorstellenTable.status, "open")))
        .returning();
      if (!voorstel) throw new StroomFout(409, "Dit voorstel is al beoordeeld.");

      // ── 2. Bekende werkmaatschappij meenemen, maar niet opnieuw uitvragen ─────
      // Een upload/mailvoorstel draagt deze normaal al. Ontbreekt hij, dan mag de
      // projectstart met de vier intakegegevens alsnog door; koppeling kan later.
      const werkmaatschappijId = voorstel.werkmaatschappijId;
      let wm: { id: number; naam: string } | null = null;
      if (werkmaatschappijId) {
        [wm] = await tx.select({ id: werkgeversTable.id, naam: werkgeversTable.naam })
          .from(werkgeversTable).where(eq(werkgeversTable.id, werkmaatschappijId));
        if (!wm) throw new StroomFout(400, "Werkmaatschappij niet gevonden.");
      }

      const voorstelType = body.voorstel_type ?? voorstel.voorstelType;

      // ── 3. Meerwerk: gerelateerd project valideren ───────────────────────────
      let gerelateerdProjectId: number | null = null;
      if (voorstelType === "meerwerk") {
        if (!body.gerelateerd_project_id) throw new StroomFout(422, "Meerwerk vereist een expliciet gekozen lopende opdracht.");
        const [project] = await tx.select({ id: projectenTable.id }).from(projectenTable).where(eq(projectenTable.id, body.gerelateerd_project_id));
        if (!project) throw new StroomFout(404, "De gekozen opdracht bestaat niet.");
        gerelateerdProjectId = project.id;
      }

      // ── 4. Opdrachtgever: gedeelde AANVRAAG_OPDRACHTGEVER_01-resolver ──────
      const klant = await resolveerOpdrachtgever(tx, {
        klantId: body.klant_id,
        nieuweKlant: body.nieuwe_klant
          ? {
              ...body.nieuwe_klant,
              email: body.nieuwe_klant.email?.trim() || voorstel.afzenderEmail || null,
            }
          : null,
      });
      const klantId = klant.id;
      const klantNaam = klant.naam;

      // ── 5. Optioneel broncontact: nooit een projectstartpoort ─────────────────
      // Alleen wanneer naam én e-mail in de bron/body aanwezig zijn, leggen we een
      // contact vast. Ontbrekende contactgegevens horen bij een latere processtap.
      const contactNaam = (body.contact_naam ?? voorstel.afzenderNaam ?? "").trim();
      const contactEmail = (body.contact_email ?? voorstel.afzenderEmail ?? "").trim().toLowerCase();
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${klantId})`);
      let contactpersoonId: number | null = null;
      let resolvedContactNaam = contactNaam || klantNaam;
      if (contactNaam && contactEmail) {
        const [bestaandContact] = await tx.select({ id: crmContactpersonenTable.id, naam: crmContactpersonenTable.naam })
          .from(crmContactpersonenTable)
          .where(and(eq(crmContactpersonenTable.klantId, klantId), ilike(crmContactpersonenTable.email, contactEmail)))
          .limit(1);
        if (bestaandContact) {
          contactpersoonId = bestaandContact.id;
          resolvedContactNaam = bestaandContact.naam;
          const contactUpdates: Record<string, unknown> = { bijgewerktOp: new Date() };
          if (contactNaam !== bestaandContact.naam) contactUpdates.naam = contactNaam;
          if (body.contact_telefoon?.trim()) contactUpdates.telefoon = body.contact_telefoon.trim();
          if (Object.keys(contactUpdates).length > 1) {
            await tx.update(crmContactpersonenTable)
              .set(contactUpdates as any)
              .where(eq(crmContactpersonenTable.id, contactpersoonId));
            if (contactUpdates.naam) resolvedContactNaam = contactNaam;
          }
        } else {
          const [nieuwContact] = await tx.insert(crmContactpersonenTable).values({
            klantId,
            naam: contactNaam,
            email: contactEmail,
            telefoon: body.contact_telefoon?.trim() || null,
          }).returning();
          contactpersoonId = nieuwContact.id;
        }
      }

      // ── 6. Gebouw: valideer (inclusief toegangscheck) of maak aan ─────────────
      let gebouwId = body.gebouw_id ?? null;
      if (gebouwId) {
        // B. Toegangscheck vóór de transactie body (nu ín tx na claim, maar vóór writes)
        if (req.permissies && !req.permissies.magBijGebouw(gebouwId)) {
          throw new StroomFout(403, "Geen toegang tot het gekozen gebouw.");
        }
        const [g] = await tx.select({ id: gebouwenTable.id }).from(gebouwenTable).where(eq(gebouwenTable.id, gebouwId));
        if (!g) throw new StroomFout(404, "Het gekozen gebouw bestaat niet.");
      } else {
        const ng = body.nieuw_gebouw!;
        const [nieuwGebouw] = await tx.insert(gebouwenTable).values({
          naam: ng.naam.trim(),
          adres: ng.adres.trim(),
          stad: ng.stad?.trim() || null,
          postcode: ng.postcode?.trim() || null,
          omschrijving: werkzaamheden,
          // B. Werkmaatschappij relationeel meegeven op nieuw gebouw
          werkgeverId: wm?.id ?? null,
        }).returning();
        gebouwId = nieuwGebouw.id;
      }

      // ── 7. Gebouwpartij type opdrachtgever upsert (contactnaam, klantnaam als org, telefoon) ─
      // naam = contactpersoon, organisatie = klantnaam, telefoon + email + beide FKs
      // Een aparte gebouw+klant-lock maakt de read-then-insert ook expliciet veilig
      // als deze stroom later vóór de algemene klant-lock wordt herschikt.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${"aanvraag-partij:" + gebouwId + ":" + klantId}, 0))`);
      const [bestaandePartij] = await tx.select({ id: gebouwPartijenTable.id })
        .from(gebouwPartijenTable)
        .where(and(
          eq(gebouwPartijenTable.gebouwId, gebouwId),
          eq(gebouwPartijenTable.type, "opdrachtgever"),
          eq(gebouwPartijenTable.klantId as any, klantId),
        ))
        .limit(1);
      const partijVaarden = {
        gebouwId,
        type: "opdrachtgever",
        naam: resolvedContactNaam,          // B. contactnaam als naam
        organisatie: klantNaam,              // B. klantnaam als organisatie
        email: contactEmail || null,
        telefoon: body.contact_telefoon?.trim() || null,  // B. telefoon bewaren
        adres: klant.adres,
        postcode: klant.postcode,
        plaats: klant.stad,
        klantId: klantId as any,
        contactpersoonId: contactpersoonId as any,
        bijgewerktOp: new Date(),
      };
      if (!bestaandePartij) {
        await tx.insert(gebouwPartijenTable).values(partijVaarden as any);
      } else {
        const { gebouwId: _g, type: _t, ...updates } = partijVaarden;
        await tx.update(gebouwPartijenTable)
          .set(updates as any)
          .where(eq(gebouwPartijenTable.id, bestaandePartij.id));
      }

      // ── 8. Conceptopname (leeg — geen items; notities = bevestigde werkzaamheden) ─
      const [opname] = await tx.insert(opnamesTable).values({
        naam: `Opname — ${titel}`,
        datum: new Date().toISOString().slice(0, 10),
        gebouwId,
        aangemaaktDoorId: beoordelaarId,
        // B. Werkzaamheden als startnotitie zodat opname-medewerker context heeft
        notities: werkzaamheden,
      }).returning();

      // ── 9. Concept modulaire calculatie (leeg — geen regels) ─────────────────
      const [calculatie] = await tx.insert(modCalcHeadersTable).values({
        naam: titel,
        klantNaam,
        gebouwId,
        opnameId: opname.id,
        status: "concept",
        omschrijving: werkzaamheden,
        aangemaaktDoorId: beoordelaarId,
        aanvraagVoorstelId: id,
        opdrachtgeverKlantId: klantId,
        opdrachtgeverContactpersoonId: contactpersoonId,
        werkmaatschappijId: wm?.id ?? null,
      } as any).returning();

      // ── 10. Projectkans (legacy compat — behoud voor navigatie) ──────────────
      const ai = (voorstel.aiVoorstel ?? {}) as Record<string, unknown>;
      // B. kansType "calculatie" is de fase voor een aanvraag die een calculatie gekregen heeft
      const [kans] = await tx.insert(crmCommercieelTable).values({
        klantId,
        gebouwId,
        titel,
        kansType: "calculatie",
        fase: "calculatie",
        aiSamenvatting: typeof ai["samenvatting"] === "string" ? ai["samenvatting"] as string : null,
        bronMailMessageId: voorstel.mailMessageId,
        binnengekomenOp: voorstel.binnengekomenOp,
        bedrijfBv: body.bv ?? (wm ? (wm.naam.includes("Brandpreventie") ? "FPS Brandpreventie" : wm.naam.includes("Onderhoud") ? "FPS Onderhoud" : "FPS Bouw") : null),
        gerelateerdProjectId,
        verantwoordelijkeId: beoordelaarId,
      }).returning();

      // ── 11. Werk-inbox koppelingen (mailbox_adres mee voor klant/gebouw/calculatie) ─
      const mailboxAdresVoorstel = voorstel.mailboxAdres ?? null;
      const koppelingen: Array<{ entityType: string; entityId: number; entityLabel: string }> = [
        { entityType: "klant", entityId: klantId, entityLabel: klantNaam },
        { entityType: "gebouw", entityId: gebouwId, entityLabel: titel },
        { entityType: "calculatie", entityId: calculatie.id, entityLabel: titel },
      ];
      if (gerelateerdProjectId) koppelingen.push({ entityType: "project", entityId: gerelateerdProjectId, entityLabel: `Meerwerk: ${titel}` });
      for (const k of koppelingen) {
        await tx.insert(werkInboxKoppelingenTable).values({
          messageId: voorstel.mailMessageId,
          mailboxAdres: mailboxAdresVoorstel,
          gebruikerId: voorstel.gebruikerId,
          ...k,
        }).onConflictDoNothing();
      }

      // ── 12. Inbox item bijwerken (verwerkt + gekoppeld aan calculatie) ────────
      if (voorstel.inboxItemId) {
        await tx.update(inboxItemsTable)
          .set({
            status: "verwerkt",
            gekoppeldeEntiteitType: "calculatie",
            gekoppeldeEntiteitId: calculatie.id,
            gekoppeldeEntiteitNaam: titel,
            bijgewerktOp: new Date(),
          })
          .where(eq(inboxItemsTable.id, voorstel.inboxItemId));
        await tx.insert(inboxAuditLogTable).values({
          inboxItemId: voorstel.inboxItemId,
          actie: "verwerkt",
          gebruikerId: beoordelaarId,
          details: `Aanvraag geaccepteerd. Calculatie #${calculatie.id} aangemaakt.`,
        });
      }

      // ── 13. Voorstel result-FKs opslaan ──────────────────────────────────────
      const [bijgewerkt] = await tx.update(aanvraagVoorstellenTable)
        .set({
          voorstelType,
          projectkansId: kans.id,
          klantId,
          contactpersoonId,
          gebouwId,
          opnameId: opname.id,
          calculatieId: calculatie.id,
          werkmaatschappijId: wm?.id ?? null,
          bijgewerktOp: new Date(),
        } as any)
        .where(eq(aanvraagVoorstellenTable.id, id))
        .returning();

      return {
        voorstel: bijgewerkt,
        kans,
        klantNaam,
        contactNaam: resolvedContactNaam,
        werkmaatschappijNaam: wm?.naam ?? null,
        calculatieId: calculatie.id,
        opnameId: opname.id,
        klantId,
        contactpersoonId,
        gebouwId,
      };
    });
  } catch (e) {
    if (e instanceof StroomFout) { res.status(e.code).json({ error: e.message }); return; }
    if (e instanceof OpdrachtgeverFout) { res.status(e.status).json({ error: e.message }); return; }
    throw e;
  }

  res.json({
    ...voorstelNaarJson(resultaat.voorstel, null, {
      klantNaam: resultaat.klantNaam,
      contactNaam: resultaat.contactNaam,
      werkmaatschappijNaam: resultaat.werkmaatschappijNaam,
    }),
    projectkans_id: resultaat.kans?.id ?? null,
    calculatie_id: resultaat.calculatieId,
    opname_id: resultaat.opnameId,
  });
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
