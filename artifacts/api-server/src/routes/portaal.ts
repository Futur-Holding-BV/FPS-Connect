// Publieke portaalroutes — geen authenticatie vereist.
// Klant opent een token-link, bekijkt de offerte, stelt vragen en ondertekent.
import { Router } from "express";
import {
  db,
  offertesTable,
  offertePortaalTokensTable,
  offerteHandtekeningenTable,
  offerteVragenTable,
  offerteTrackingTable,
  offerteSectiesTable,
  offerteBijlagenTable,
  offerteVersiesTable,
  offerteRegelsTable,
  projectenTable,
  gebruikersTable,
  gebouwenTable,
  crmCommunicatieTable,
  crmKlantenTable,
  appInstellingenTable,
} from "@workspace/db";
import { eq, and, desc, ne, or, isNull } from "drizzle-orm";
import { stuurKlantvraagNotificatie, stuurOndertekeningNotificatie, stuurOpdrachtbevestiging } from "../services/email";
import { logActiviteit } from "../lib/activiteit";
import { heeftOpenAi, maakOpenAiClient } from "../lib/openai";

const router = Router();

type TokenResultaat =
  | { gevonden: true; verlopen: false; record: typeof offertePortaalTokensTable.$inferSelect }
  | { gevonden: true; verlopen: true }
  | { gevonden: false };

async function valideerToken(token: string): Promise<TokenResultaat> {
  const [bestaand] = await db
    .select()
    .from(offertePortaalTokensTable)
    .where(eq(offertePortaalTokensTable.token, token));

  if (!bestaand) return { gevonden: false };

  const nu = new Date();
  if (bestaand.verlooptOp <= nu) return { gevonden: true, verlopen: true };

  return { gevonden: true, verlopen: false, record: bestaand };
}

// GET /portaal/:token — publiek, geen authenticatie
router.get("/portaal/:token", async (req, res) => {
  try {
    const tokenResultaat = await valideerToken(req.params.token);
    if (!tokenResultaat.gevonden)
      return res.status(404).json({ error: "Portaallink niet gevonden." });
    if (tokenResultaat.verlopen)
      return res.status(410).json({ error: "Uw uitnodiging is verlopen." });
    const tokenRecord = tokenResultaat.record;

    const [offerte] = await db
      .select()
      .from(offertesTable)
      .where(eq(offertesTable.id, tokenRecord.offerteId));
    if (!offerte) return res.status(404).json({ error: "Offerte niet gevonden." });

    const [secties, bijlagen, optioneleRegels, verplichtRegels, handtekeningRows] = await Promise.all([
      db.select().from(offerteSectiesTable).where(eq(offerteSectiesTable.offerteId, offerte.id)).orderBy(offerteSectiesTable.volgorde),
      db.select().from(offerteBijlagenTable).where(eq(offerteBijlagenTable.offerteId, offerte.id)).orderBy(offerteBijlagenTable.volgorde),
      db.select().from(offerteRegelsTable).where(and(eq(offerteRegelsTable.offerteId, offerte.id), eq(offerteRegelsTable.isOptioneel, true))).orderBy(offerteRegelsTable.volgorde),
      db.select().from(offerteRegelsTable).where(and(eq(offerteRegelsTable.offerteId, offerte.id), eq(offerteRegelsTable.isOptioneel, false))).orderBy(offerteRegelsTable.volgorde),
      db.select().from(offerteHandtekeningenTable).where(eq(offerteHandtekeningenTable.offerteId, offerte.id)).limit(1),
    ]);

    const handtekening = handtekeningRows[0];

    let contactpersoon: { naam: string; email: string | null; telefoon: string | null } | null = null;
    if (offerte.behandeldDoorId) {
      const [behandelaar] = await db
        .select({ naam: gebruikersTable.naam, email: gebruikersTable.email, telefoon: gebruikersTable.telefoon })
        .from(gebruikersTable)
        .where(eq(gebruikersTable.id, offerte.behandeldDoorId));
      if (behandelaar) {
        contactpersoon = {
          naam: behandelaar.naam,
          email: behandelaar.email ?? null,
          telefoon: behandelaar.telefoon ?? null,
        };
      }
    }

    await db.insert(offerteTrackingTable).values({
      offerteId: offerte.id,
      event: "portaal_bekeken",
      portaalToken: req.params.token,
      ip: String(req.ip ?? "").slice(0, 45),
    });

    if (offerte.portaalStatus === "verzonden") {
      await db
        .update(offertesTable)
        .set({ portaalStatus: "bekeken", bijgewerktOp: new Date() })
        .where(eq(offertesTable.id, offerte.id));
    }

    res.json({
      id: offerte.id,
      offertenummer: offerte.offertenummer,
      titel: offerte.titel,
      opdrachtgever: offerte.opdrachtgever,
      datum: offerte.datum,
      geldigheid_dagen: offerte.geldigheidDagen,
      bedrag_excl_btw: offerte.bedragExclBtw,
      btw_percentage: offerte.btwPercentage,
      bedrag_incl_btw: offerte.bedragInclBtw,
      kleurthema: offerte.kleurthema,
      portaal_status: offerte.portaalStatus,
      ondertekend: !!handtekening,
      contactpersoon,
      secties: secties.map((s) => ({
        id: s.id,
        sectie_type: s.sectieType,
        volgorde: s.volgorde,
        actief: s.actief,
        titel: s.titel,
        inhoud: s.inhoud,
      })),
      bijlagen: bijlagen.map((b) => ({
        id: b.id,
        bijlage_type: b.bijlageType,
        naam: b.naam,
        beschrijving: b.beschrijving,
        url: b.url,
      })),
      optionele_regels: optioneleRegels.map((r) => ({
        id: r.id,
        maatregel: r.maatregel,
        ruimte: r.ruimte,
        eenheid: r.eenheid,
        aantal: r.aantal,
        prijs_per_eenheid: r.prijsPerEenheid,
        kosten: r.kosten,
        optioneel_geselecteerd: r.optioneelGeselecteerd,
      })),
      regels: verplichtRegels.map((r) => ({
        id: r.id,
        maatregel: r.maatregel,
        ruimte: r.ruimte ?? null,
        uitgangspunten: r.uitgangspunten ?? null,
        categorie: r.categorie,
        snag_referentie: r.snagReferentie ?? null,
        eenheid: r.eenheid,
        aantal: r.aantal,
        prijs_per_eenheid: r.prijsPerEenheid,
        kosten: r.kosten,
        volgorde: r.volgorde,
      })),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /portaal/:token/pixel — tracking pixel voor e-mailopening (geopend-event)
router.get("/portaal/:token/pixel", async (req, res) => {
  try {
    const tokenResultaat = await valideerToken(req.params.token);
    if (tokenResultaat.gevonden && !tokenResultaat.verlopen) {
      const tokenRecord = tokenResultaat.record;
      // Registreer alleen als er de afgelopen 24 uur nog geen geopend-event was
      const { count: sql_count } = await import("drizzle-orm");
      const [al] = await db
        .select({ n: sql_count() })
        .from(offerteTrackingTable)
        .where(
          and(
            eq(offerteTrackingTable.offerteId, tokenRecord.offerteId),
            eq(offerteTrackingTable.event, "geopend"),
          ),
        );
      if (Number(al?.n ?? 0) === 0) {
        await db.insert(offerteTrackingTable).values({
          offerteId: tokenRecord.offerteId,
          event: "geopend",
          portaalToken: req.params.token,
          ip: String(req.ip ?? "").slice(0, 45),
        });
      }
    }
  } catch {
    // tracking mag nooit de pixel-respons blokkeren
  }
  // 1×1 transparante GIF
  const pixel = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
  res.set("Content-Type", "image/gif").set("Cache-Control", "no-store").send(pixel);
});

// PATCH /portaal/:token/tracking — publiek
router.patch("/portaal/:token/tracking", async (req, res) => {
  try {
    const tokenResultaat = await valideerToken(req.params.token);
    if (!tokenResultaat.gevonden)
      return res.status(404).json({ error: "Portaallink niet gevonden." });
    if (tokenResultaat.verlopen)
      return res.status(410).json({ error: "Uw uitnodiging is verlopen." });
    const tokenRecord = tokenResultaat.record;

    const event = String(req.body?.event ?? "");
    const toegestaan = ["pdf_gedownload", "bijlage_gedownload"];
    if (!toegestaan.includes(event)) return res.status(400).json({ error: "Ongeldig event." });

    await db.insert(offerteTrackingTable).values({
      offerteId: tokenRecord.offerteId,
      event,
      portaalToken: req.params.token,
      ip: String(req.ip ?? "").slice(0, 45),
    });

    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /portaal/:token/ai-uitleg — AI-uitleg voor een offerteregel (publiek, rate-limited door token-check)
router.post("/portaal/:token/ai-uitleg", async (req, res) => {
  try {
    const tokenResultaat = await valideerToken(req.params.token);
    if (!tokenResultaat.gevonden)
      return res.status(404).json({ error: "Portaallink niet gevonden." });
    if (tokenResultaat.verlopen)
      return res.status(410).json({ error: "Uw uitnodiging is verlopen." });
    const tokenRecord = tokenResultaat.record;

    if (!heeftOpenAi())
      return res.status(503).json({ error: "AI niet beschikbaar." });

    const regelId = parseInt(String(req.body?.regel_id ?? ""), 10);
    if (isNaN(regelId)) return res.status(400).json({ error: "Ongeldig regel_id." });

    const [regel] = await db
      .select()
      .from(offerteRegelsTable)
      .where(and(eq(offerteRegelsTable.id, regelId), eq(offerteRegelsTable.offerteId, tokenRecord.offerteId)));

    if (!regel) return res.status(404).json({ error: "Offerteregel niet gevonden." });

    const openai = maakOpenAiClient();
    const prompt = `Je bent een brandpreventie-expert bij FPS Brandpreventie. Leg aan een klant in begrijpelijke taal uit wat de volgende offertepost inhoudt en waarom deze werkzaamheden nodig zijn. Schrijf maximaal 3 zinnen, in vloeiend Nederlands, zonder vakjargon. Noem géén bedragen of prijzen.

Post: ${regel.maatregel}${regel.ruimte ? `\nLocatie: ${regel.ruimte}` : ""}${regel.uitgangspunten ? `\nUitgangspunten: ${regel.uitgangspunten}` : ""}
Categorie: ${regel.categorie}
Hoeveelheid: ${regel.aantal} ${regel.eenheid}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });

    const uitleg = completion.choices[0]?.message?.content?.trim() ?? "Geen uitleg beschikbaar.";
    res.json({ uitleg });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /portaal/:token/optioneel-werk — klant bevestigt welke optionele posten hij wil
router.post("/portaal/:token/optioneel-werk", async (req, res) => {
  try {
    const tokenResultaat = await valideerToken(req.params.token);
    if (!tokenResultaat.gevonden)
      return res.status(404).json({ error: "Portaallink niet gevonden." });
    if (tokenResultaat.verlopen)
      return res.status(410).json({ error: "Uw uitnodiging is verlopen." });
    const tokenRecord = tokenResultaat.record;

    const [offerte] = await db.select({ portaalStatus: offertesTable.portaalStatus }).from(offertesTable).where(eq(offertesTable.id, tokenRecord.offerteId));
    if (offerte?.portaalStatus === "ondertekend" || offerte?.portaalStatus === "afgewezen")
      return res.status(409).json({ error: "De offerte is al afgesloten en kan niet meer worden gewijzigd." });

    const geselecteerd: Record<string, boolean> = req.body?.geselecteerd ?? {};
    if (typeof geselecteerd !== "object" || Array.isArray(geselecteerd))
      return res.status(400).json({ error: "geselecteerd moet een object zijn met regel-id's als sleutels." });

    for (const [rawId, waarde] of Object.entries(geselecteerd)) {
      const regelId = parseInt(rawId, 10);
      if (isNaN(regelId) || typeof waarde !== "boolean") continue;
      await db
        .update(offerteRegelsTable)
        .set({ optioneelGeselecteerd: waarde, bijgewerktOp: new Date() })
        .where(
          and(
            eq(offerteRegelsTable.id, regelId),
            eq(offerteRegelsTable.offerteId, tokenRecord.offerteId),
            eq(offerteRegelsTable.isOptioneel, true),
          ),
        );
    }

    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /portaal/:token/vraag — publiek
router.post("/portaal/:token/vraag", async (req, res) => {
  try {
    const tokenResultaat = await valideerToken(req.params.token);
    if (!tokenResultaat.gevonden)
      return res.status(404).json({ error: "Portaallink niet gevonden." });
    if (tokenResultaat.verlopen)
      return res.status(410).json({ error: "Uw uitnodiging is verlopen." });
    const tokenRecord = tokenResultaat.record;

    const vraag = String(req.body?.vraag ?? "").trim();
    if (!vraag) return res.status(400).json({ error: "Vraag mag niet leeg zijn." });
    const bezoekerNaam = String(req.body?.naam ?? "").trim() || null;
    const bezoekerEmail = String(req.body?.email ?? "").trim() || null;
    const rawType = String(req.body?.type ?? "").trim();
    const type = rawType === "wijziging" ? "wijziging" : "vraag";

    const [nieuw] = await db
      .insert(offerteVragenTable)
      .values({ offerteId: tokenRecord.offerteId, bezoekerNaam, bezoekerEmail, vraag, type })
      .returning();

    res.status(201).json({ id: nieuw.id });

    // Notificatiemail — fire-and-forget, blokkeert de respons niet.
    (async () => {
      try {
        const [offerte] = await db
          .select({
            id: offertesTable.id,
            offertenummer: offertesTable.offertenummer,
            titel: offertesTable.titel,
            behandeldDoorId: offertesTable.behandeldDoorId,
          })
          .from(offertesTable)
          .where(eq(offertesTable.id, tokenRecord.offerteId));

        if (!offerte) return;

        let naarEmail: string;
        let naarNaam: string | null = null;

        if (offerte.behandeldDoorId) {
          const [beheerder] = await db
            .select({ email: gebruikersTable.email, naam: gebruikersTable.naam })
            .from(gebruikersTable)
            .where(eq(gebruikersTable.id, offerte.behandeldDoorId));
          if (beheerder) {
            naarEmail = beheerder.email;
            naarNaam = beheerder.naam;
          } else {
            naarEmail = process.env.MAIL_MAILBOX ?? "app@fpsbrandpreventie.nl";
          }
        } else {
          naarEmail = process.env.MAIL_MAILBOX ?? "app@fpsbrandpreventie.nl";
        }

        const domein = (process.env.REPLIT_DOMAINS ?? "").split(",")[0]?.trim();
        const connectUrl = domein
          ? `https://${domein}/offertes/${offerte.id}`
          : `https://fpsbrandpreventie.nl/offertes/${offerte.id}`;

        const onderwerpPrefix = type === "wijziging" ? "Wijziging aangevraagd" : "Nieuwe klantvraag";
        const vraagTekstMetType = type === "wijziging" ? `[WIJZIGING] ${vraag}` : vraag;

        await stuurKlantvraagNotificatie({
          naarEmail,
          naarNaam,
          bezoekerNaam,
          vraagTekst: vraagTekstMetType,
          offerteId: offerte.id,
          offertenummer: offerte.offertenummer,
          offerteTitel: offerte.titel,
          connectUrl,
        });
      } catch (mailErr) {
        req.log.warn(mailErr, "Klantvraag-notificatie mislukt (niet-kritiek)");
      }
    })();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /portaal/:token/ondertekenen — publiek
router.post("/portaal/:token/ondertekenen", async (req, res) => {
  try {
    const tokenResultaat = await valideerToken(req.params.token);
    if (!tokenResultaat.gevonden)
      return res.status(404).json({ error: "Portaallink niet gevonden." });
    if (tokenResultaat.verlopen)
      return res.status(410).json({ error: "Uw uitnodiging is verlopen." });
    const tokenRecord = tokenResultaat.record;

    const [offerte] = await db
      .select()
      .from(offertesTable)
      .where(eq(offertesTable.id, tokenRecord.offerteId));
    if (!offerte) return res.status(404).json({ error: "Offerte niet gevonden." });
    if (offerte.portaalStatus === "afgewezen")
      return res.status(409).json({ error: "Afgewezen offerte kan niet meer worden ondertekend." });

    const naam = String(req.body?.naam ?? "").trim();
    const bedrijf = String(req.body?.bedrijf ?? "").trim() || null;
    const functie = String(req.body?.functie ?? "").trim() || null;
    const handtekeningDataUrl = String(req.body?.handtekening_data_url ?? "").trim();

    if (!naam) return res.status(400).json({ error: "Naam is verplicht." });
    if (!handtekeningDataUrl) return res.status(400).json({ error: "Handtekening is verplicht." });

    const nu = new Date();
    const datum = nu.toISOString().slice(0, 10);

    // Alles in één transactie: als een stap mislukt rolt de hele operatie terug
    // en blijft de offerte in de vorige toestand. Zo kan er nooit een
    // portaal_status="ondertekend" zonder bijbehorende handtekening/project zijn.
    let reeds_ondertekend = false;
    let projectId: number | null = null;

    try {
      projectId = await db.transaction(async (tx) => {
        // 1. Atomisch claimverzoek: UPDATE ... WHERE portaal_status != 'ondertekend'
        //    (null-safe: OR portaal_status IS NULL voor legacy rijen).
        //    PostgreSQL vergrendelt de rij zodat een concurrent verzoek wacht en
        //    daarna 0 rijen vindt → automatisch 409.
        const [bijgewerkt] = await tx
          .update(offertesTable)
          .set({ portaalStatus: "ondertekend", status: "geaccepteerd", bijgewerktOp: nu })
          .where(and(
            eq(offertesTable.id, offerte.id),
            or(
              isNull(offertesTable.portaalStatus),
              and(
                ne(offertesTable.portaalStatus, "ondertekend"),
                ne(offertesTable.portaalStatus, "afgewezen"),
              ),
            ),
          ))
          .returning({ id: offertesTable.id });

        if (!bijgewerkt) {
          reeds_ondertekend = true;
          // Gooi een fout om de transactie af te breken zonder 500-log te triggeren.
          throw new Error("REEDS_ONDERTEKEND");
        }

        // 2. Versienummer ophalen.
        const versies = await tx
          .select({ versienummer: offerteVersiesTable.versienummer })
          .from(offerteVersiesTable)
          .where(eq(offerteVersiesTable.offerteId, offerte.id))
          .orderBy(desc(offerteVersiesTable.versienummer))
          .limit(1);
        const versienummer = versies[0]?.versienummer ?? 1;

        // 3. Handtekening opslaan (binnen transactie — rolt terug bij fout).
        await tx.insert(offerteHandtekeningenTable).values({
          offerteId: offerte.id,
          naam,
          bedrijf,
          functie,
          datum,
          ip: String(req.ip ?? "").slice(0, 45),
          handtekeningDataUrl,
          versienummer,
          portaalToken: req.params.token,
        });

        // 4. Gebouwstatus bijwerken.
        if (offerte.gebouwId != null) {
          await tx
            .update(gebouwenTable)
            .set({ projectStatus: "opdracht_in_uitvoering", bijgewerktOp: nu })
            .where(eq(gebouwenTable.id, offerte.gebouwId));
        }

        // 5. Project aanmaken en koppelen — EERST controleren of auto_project_id
        //    al gezet is (legacy data / herhaalde pogingen). Pas als het NULL is
        //    wordt er een project ingevoegd; anders wordt het bestaande project
        //    teruggegeven. Zo kan één offerte nooit een orphan project veroorzaken.
        const [huidigOfferte] = await tx
          .select({ autoProjectId: offertesTable.autoProjectId })
          .from(offertesTable)
          .where(eq(offertesTable.id, offerte.id));

        if (huidigOfferte?.autoProjectId != null) {
          req.log.warn({ offerteId: offerte.id, bestaandProjectId: huidigOfferte.autoProjectId },
            "auto_project_id al gezet bij ondertekening; geen nieuw project aangemaakt");
          return huidigOfferte.autoProjectId;
        }

        const werknummer = offerte.offertenummer
          ? `PRJ-${offerte.offertenummer}`
          : `PRJ-${offerte.id}-${datum.replace(/-/g, "")}`;
        const [project] = await tx
          .insert(projectenTable)
          .values({
            naam: offerte.titel,
            werknummer,
            status: "actief",
            omschrijving: `Automatisch aangemaakt na ondertekening offerte ${offerte.offertenummer ?? offerte.id}.`,
            crmKlantId: offerte.klantId ?? null,
            gebouwId: offerte.gebouwId ?? null,
            aangemaaktDoorId: null,
          })
          .returning();

        await tx
          .update(offertesTable)
          .set({ autoProjectId: project.id, bijgewerktOp: new Date() })
          .where(and(eq(offertesTable.id, offerte.id), isNull(offertesTable.autoProjectId)));

        return project.id;
      });
    } catch (txErr: unknown) {
      if (reeds_ondertekend) {
        return res.status(409).json({ error: "Offerte is al ondertekend." });
      }
      throw txErr;
    }

    if (projectId != null) {
      try {
        await logActiviteit({
          type: "project_aangemaakt",
          omschrijving: `Project aangemaakt na ondertekening offerte ${offerte.offertenummer ?? offerte.id}: ${offerte.titel}`,
          gebouwId: offerte.gebouwId ?? null,
        });
      } catch (logErr) {
        req.log.warn(logErr, "Activiteit loggen mislukt na ondertekening (niet-kritiek)");
      }
    }

    await logActiviteit({
      type: "offerte_geaccepteerd",
      omschrijving: `Offerte ${offerte.offertenummer ?? offerte.id} (${offerte.titel}) ondertekend door ${naam}${bedrijf ? ` (${bedrijf})` : ""}`,
      gebouwId: offerte.gebouwId ?? null,
    });

    if (offerte.klantId != null) {
      try {
        await db.insert(crmCommunicatieTable).values({
          klantId: offerte.klantId,
          type: "offerte",
          onderwerp: `Offerte geaccepteerd: ${offerte.titel}`,
          inhoud: `Offerte ${offerte.offertenummer ?? offerte.id} ondertekend door ${naam}${bedrijf ? ` (${bedrijf})` : ""}${functie ? `, ${functie}` : ""}.`,
          datum,
        });
      } catch (crmErr) {
        req.log.warn(crmErr, "CRM-activiteit loggen mislukt na ondertekening (niet-kritiek)");
      }
    }

    await db.insert(offerteTrackingTable).values({
      offerteId: offerte.id,
      event: "ondertekend",
      portaalToken: req.params.token,
      ip: String(req.ip ?? "").slice(0, 45),
    });

    res.status(201).json({ ok: true, project_id: projectId });

    // Notificatiemail intern (behandelaar) + opdrachtbevestiging klant — fire-and-forget.
    (async () => {
      try {
        let naarEmail: string;
        let naarNaam: string | null = null;
        let contactpersoonNaam: string | null = null;

        if (offerte.behandeldDoorId) {
          const [beheerder] = await db
            .select({ email: gebruikersTable.email, naam: gebruikersTable.naam })
            .from(gebruikersTable)
            .where(eq(gebruikersTable.id, offerte.behandeldDoorId));
          if (beheerder) {
            naarEmail = beheerder.email;
            naarNaam = beheerder.naam;
            contactpersoonNaam = beheerder.naam;
          } else {
            naarEmail = process.env.MAIL_MAILBOX ?? "app@fpsbrandpreventie.nl";
          }
        } else {
          naarEmail = process.env.MAIL_MAILBOX ?? "app@fpsbrandpreventie.nl";
        }

        const domein = (process.env.REPLIT_DOMAINS ?? "").split(",")[0]?.trim();
        const connectUrl = domein
          ? `https://${domein}/offertes/${offerte.id}`
          : `https://fpsbrandpreventie.nl/offertes/${offerte.id}`;

        await stuurOndertekeningNotificatie({
          naarEmail,
          naarNaam,
          ondertekendDoor: naam,
          ondertekendOp: nu,
          offerteId: offerte.id,
          offertenummer: offerte.offertenummer,
          offerteTitel: offerte.titel,
          opdrachtgever: offerte.opdrachtgever ?? bedrijf,
          connectUrl,
        });

        // Opdrachtbevestiging naar klant — alleen als auto-verzenden aan staat
        // en er een CRM-klant met e-mailadres bekend is.
        const [instelling] = await db
          .select({ autoVerzenden: appInstellingenTable.opdrachtbevestigingAutoVerzenden })
          .from(appInstellingenTable)
          .limit(1);

        if (instelling?.autoVerzenden && offerte.klantId != null) {
          const [klant] = await db
            .select({ naam: crmKlantenTable.naam, email: crmKlantenTable.email })
            .from(crmKlantenTable)
            .where(eq(crmKlantenTable.id, offerte.klantId));

          if (klant?.email) {
            const portaalUrl = domein
              ? `https://${domein}/portaal/${req.params.token}`
              : `https://fpsbrandpreventie.nl/portaal/${req.params.token}`;

            await stuurOpdrachtbevestiging({
              naarEmail: klant.email,
              naarNaam: klant.naam,
              klantnaam: klant.naam,
              projectnaam: offerte.titel,
              werkmaatschappij: "FPS Brandpreventie",
              contactpersoon: contactpersoonNaam,
              portaalUrl,
              offertenummer: offerte.offertenummer,
              offerteId: offerte.id,
            });

            try {
              await logActiviteit({
                type: "opdrachtbevestiging_verzonden",
                omschrijving: `Opdrachtbevestiging verstuurd naar ${klant.email} voor offerte ${offerte.offertenummer ?? offerte.id}.`,
                gebouwId: offerte.gebouwId ?? null,
              });
            } catch {
              /* activiteit-log mislukking is niet-kritiek */
            }
          } else {
            req.log.info(
              { offerteId: offerte.id, klantId: offerte.klantId },
              "Opdrachtbevestiging overgeslagen: klant heeft geen e-mailadres",
            );
          }
        } else if (!instelling?.autoVerzenden) {
          req.log.info(
            { offerteId: offerte.id },
            "Opdrachtbevestiging overgeslagen: auto-verzenden uitgeschakeld",
          );
        }
      } catch (mailErr) {
        req.log.warn(mailErr, "Ondertekening-notificatie mislukt (niet-kritiek)");
      }
    })();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /portaal/:token/afwijzen — publiek
router.post("/portaal/:token/afwijzen", async (req, res) => {
  try {
    const tokenResultaat = await valideerToken(req.params.token);
    if (!tokenResultaat.gevonden)
      return res.status(404).json({ error: "Portaallink niet gevonden." });
    if (tokenResultaat.verlopen)
      return res.status(410).json({ error: "Uw uitnodiging is verlopen." });
    const tokenRecord = tokenResultaat.record;

    const [offerte] = await db
      .select()
      .from(offertesTable)
      .where(eq(offertesTable.id, tokenRecord.offerteId));
    if (!offerte) return res.status(404).json({ error: "Offerte niet gevonden." });
    if (offerte.portaalStatus === "ondertekend")
      return res.status(409).json({ error: "Ondertekende offerte kan niet worden afgewezen." });

    const reden = String(req.body?.reden ?? "").trim() || null;

    await db
      .update(offertesTable)
      .set({ portaalStatus: "afgewezen", bijgewerktOp: new Date() })
      .where(eq(offertesTable.id, offerte.id));

    if (reden) {
      await db.insert(offerteVragenTable).values({
        offerteId: offerte.id,
        bezoekerNaam: null,
        vraag: `AFGEWEZEN: ${reden}`,
        type: "afwijzing",
      });
    }

    await db.insert(offerteTrackingTable).values({
      offerteId: offerte.id,
      event: "afgewezen",
      portaalToken: req.params.token,
      ip: String(req.ip ?? "").slice(0, 45),
    });

    res.json({ ok: true });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
