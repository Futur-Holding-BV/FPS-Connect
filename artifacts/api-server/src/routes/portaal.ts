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
  projectenTable,
  gebruikersTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { stuurKlantvraagNotificatie } from "../services/email";

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
    const toegestaan = ["bekeken", "pdf_gedownload", "bijlage_gedownload"];
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
    if (offerte.portaalStatus === "ondertekend")
      return res.status(409).json({ error: "Offerte is al ondertekend." });

    const naam = String(req.body?.naam ?? "").trim();
    const bedrijf = String(req.body?.bedrijf ?? "").trim() || null;
    const functie = String(req.body?.functie ?? "").trim() || null;
    const handtekeningDataUrl = String(req.body?.handtekening_data_url ?? "").trim();

    if (!naam) return res.status(400).json({ error: "Naam is verplicht." });
    if (!handtekeningDataUrl) return res.status(400).json({ error: "Handtekening is verplicht." });

    const nu = new Date();
    const datum = nu.toISOString().slice(0, 10);

    const versies = await db
      .select({ versienummer: offerteVersiesTable.versienummer })
      .from(offerteVersiesTable)
      .where(eq(offerteVersiesTable.offerteId, offerte.id))
      .orderBy(desc(offerteVersiesTable.versienummer))
      .limit(1);
    const versienummer = versies[0]?.versienummer ?? 1;

    await db.insert(offerteHandtekeningenTable).values({
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

    await db
      .update(offertesTable)
      .set({ portaalStatus: "ondertekend", status: "ondertekend", bijgewerktOp: nu })
      .where(eq(offertesTable.id, offerte.id));

    let projectId: number | null = null;
    try {
      const werknummer = offerte.offertenummer
        ? `PRJ-${offerte.offertenummer}`
        : `PRJ-${offerte.id}-${datum.replace(/-/g, "")}`;
      const [project] = await db
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
      projectId = project.id;
    } catch (projectErr) {
      req.log.warn(projectErr, "Project aanmaken mislukt na ondertekening");
    }

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
