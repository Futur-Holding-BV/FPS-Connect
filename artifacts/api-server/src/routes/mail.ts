import { Router } from "express";
import { db, mailLogboekTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import {
  mailConfiguratie,
  testVerbinding,
  stuurTestmail,
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
router.post("/mail/verbindingstest", requireBevoegdheid("systeem", 2), async (req, res) => {
  try {
    await testVerbinding();
    res.json({ ok: true, melding: "Verbinding met Microsoft 365 is in orde." });
  } catch (err) {
    if (err instanceof MailFout) {
      return res.json({
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
router.post("/mail/testmail", requireBevoegdheid("systeem", 2), async (req, res) => {
  try {
    const naar = String(req.body?.naar_email ?? "").trim();
    if (!naar || !naar.includes("@")) {
      return res.status(400).json({ error: "Een geldig e-mailadres is verplicht" });
    }
    await stuurTestmail({ naarEmail: naar, verstuurdDoorId: req.session.userId ?? null });
    res.json({ ok: true, melding: `Testbericht verstuurd naar ${naar}.` });
  } catch (err) {
    if (err instanceof MailFout) {
      return res.json({
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

// GET /mail/logboek — laatste 100 verzendpogingen
router.get("/mail/logboek", requireBevoegdheid("systeem", 1), async (req, res) => {
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
