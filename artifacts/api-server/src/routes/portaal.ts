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
} from "@workspace/db";
import { eq, and, gt, desc, ne, or, isNull } from "drizzle-orm";
import { stuurKlantvraagNotificatie } from "../services/email";
import { logActiviteit } from "../lib/activiteit";

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

    const secties = await db
      .select()
      .from(offerteSectiesTable)
      .where(eq(offerteSectiesTable.offerteId, offerte.id))
      .orderBy(offerteSectiesTable.volgorde);

    const bijlagen = await db
      .select()
      .from(offerteBijlagenTable)
      .where(eq(offerteBijlagenTable.offerteId, offerte.id))
      .orderBy(offerteBijlagenTable.volgorde);

    const optioneleRegels = await db
      .select()
      .from(offerteRegelsTable)
      .where(and(eq(offerteRegelsTable.offerteId, offerte.id), eq(offerteRegelsTable.isOptioneel, true)))
      .orderBy(offerteRegelsTable.volgorde);

    const [handtekening] = await db
      .select()
      .from(offerteHandtekeningenTable)
      .where(eq(offerteHandtekeningenTable.offerteId, offerte.id));

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
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
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

    const [nieuw] = await db
      .insert(offerteVragenTable)
      .values({ offerteId: tokenRecord.offerteId, bezoekerNaam, bezoekerEmail, vraag })
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

        await stuurKlantvraagNotificatie({
          naarEmail,
          naarNaam,
          bezoekerNaam,
          vraagTekst: vraag,
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
            or(ne(offertesTable.portaalStatus, "ondertekend"), isNull(offertesTable.portaalStatus)),
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

    await db.insert(offerteTrackingTable).values({
      offerteId: offerte.id,
      event: "ondertekend",
      portaalToken: req.params.token,
      ip: String(req.ip ?? "").slice(0, 45),
    });

    res.status(201).json({ ok: true, project_id: projectId });
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
