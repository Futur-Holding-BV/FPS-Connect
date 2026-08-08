import { Router } from "express";
import { publiekeAppUrl } from "../lib/publiekeUrl";
import { db, mailLogboekTable, offertesTable, crmKlantenTable, gebruikersTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import {
  mailConfiguratie,
  testVerbinding,
  stuurTestmail,
  stuurOpdrachtbevestiging,
  MailFout,
} from "../services/email";

const router = Router();

function mapLogregel(r: typeof mailLogboekTable.$inferSelect) {
  return {
    id: r.id,
    naar_email: r.naarEmail,
    naar_naam: r.naarNaam,
    onderwerp: r.onderwerp,
    soort: r.soort,
    status: r.status,
    fout_categorie: r.foutCategorie,
    foutdetail: r.foutdetail,
    verstuurd_door_id: r.verstuurdDoorId,
    aangemaakt_op: r.aangemaaktOp.toISOString(),
  };
}

// GET /mail/status — configuratiestatus (zonder geheimen)
router.get("/mail/status", requireBevoegdheid("systeem", 1), (_req, res) => {
  const c = mailConfiguratie();
  res.json({
    geconfigureerd: c.geconfigureerd,
    afzender: c.afzender,
    postbus: c.postbus,
    ontbrekende_secrets: c.ontbrekend,
  });
});

// POST /mail/verbindingstest — token ophalen + postbus bereikbaarheid
router.post("/mail/verbindingstest", requireBevoegdheid("systeem", 2), async (req, res): Promise<void> => {
  try {
    await testVerbinding();
    res.json({ ok: true, melding: "Verbinding met Microsoft 365 is in orde." });
  } catch (err) {
    if (err instanceof MailFout) {
      return void res.json({
        ok: false,
        fout_categorie: err.categorie,
        melding: err.message,
        detail: err.detail,
      });
    }
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /mail/testmail — testbericht versturen
router.post("/mail/testmail", requireBevoegdheid("systeem", 2), async (req, res): Promise<void> => {
  try {
    const naar = String(req.body?.naar_email ?? "").trim();
    if (!naar || !naar.includes("@")) {
      return void res.status(400).json({ error: "Een geldig e-mailadres is verplicht" });
    }
    await stuurTestmail({ naarEmail: naar, verstuurdDoorId: req.session.userId ?? null });
    res.json({ ok: true, melding: `Testbericht verstuurd naar ${naar}.` });
  } catch (err) {
    if (err instanceof MailFout) {
      return void res.json({
        ok: false,
        fout_categorie: err.categorie,
        melding: err.message,
        detail: err.detail,
      });
    }
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /mail/opdrachtbevestiging/demo — stuur een demo-opdrachtbevestiging
router.post("/mail/opdrachtbevestiging/demo", requireBevoegdheid("systeem", 2), async (req, res): Promise<void> => {
  try {
    const naar = String(req.body?.naar_email ?? "").trim();
    const offerteId = Number(req.body?.offerte_id ?? 0);
    if (!naar || !naar.includes("@")) {
      return void res.status(400).json({ error: "Een geldig e-mailadres is verplicht" });
    }
    if (!offerteId || offerteId < 1) {
      return void res.status(400).json({ error: "Een geldig offerte-ID is verplicht" });
    }

    // Offerte ophalen + eventuele klantgegevens
    const [offerte] = await db
      .select()
      .from(offertesTable)
      .where(eq(offertesTable.id, offerteId));
    if (!offerte) {
      return void res.status(404).json({ error: "Offerte niet gevonden" });
    }

    let klantNaam: string | null = null;
    if (offerte.klantId != null) {
      const [klant] = await db
        .select({ naam: crmKlantenTable.naam })
        .from(crmKlantenTable)
        .where(eq(crmKlantenTable.id, offerte.klantId));
      if (klant) klantNaam = klant.naam;
    }

    let contactpersoon: string | null = null;
    if (offerte.behandeldDoorId != null) {
      const [beh] = await db
        .select({ naam: gebruikersTable.naam })
        .from(gebruikersTable)
        .where(eq(gebruikersTable.id, offerte.behandeldDoorId));
      if (beh) contactpersoon = beh.naam;
    }

    const basis = publiekeAppUrl();
    const portaalUrl = basis
      ? `${basis}/portaal/demo`
      : "https://fpsbrandpreventie.nl/portaal/demo";

    await stuurOpdrachtbevestiging({
      naarEmail: naar,
      naarNaam: null,
      klantnaam: klantNaam ?? offerte.opdrachtgever ?? "Geachte klant",
      projectnaam: offerte.titel,
      werkmaatschappij: "FPS Brandpreventie",
      contactpersoon,
      portaalUrl,
      offertenummer: offerte.offertenummer,
      offerteId: offerte.id,
    });

    res.json({ ok: true, melding: `Demo-opdrachtbevestiging verstuurd naar ${naar}.` });
  } catch (err) {
    if (err instanceof MailFout) {
      return void res.json({ ok: false, fout_categorie: err.categorie, melding: err.message, detail: err.detail });
    }
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /mail/logboek — laatste 100 verzendpogingen
router.get("/mail/logboek", requireBevoegdheid("systeem", 1), async (req, res): Promise<void> => {
  try {
    const rijen = await db
      .select()
      .from(mailLogboekTable)
      .orderBy(desc(mailLogboekTable.aangemaaktOp))
      .limit(100);
    res.json(rijen.map(mapLogregel));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
