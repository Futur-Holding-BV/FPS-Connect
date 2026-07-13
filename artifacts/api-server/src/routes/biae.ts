import { Router, type Request, type Response } from "express";
import { db, complianceSignalenTable, type ComplianceSignaal } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { biae } from "../services/biae";
import { aggregeerKpiFeed } from "../services/biae/capabilities/kpi-aggregatie";

const router = Router();

// Het BIAE-beheerscherm is voorbehouden aan systeembeheerders.
const alleenSysteem = requireBevoegdheid("systeem", 1);

function serialiseerSignaal(r: ComplianceSignaal) {
  return {
    id: r.id,
    regel: r.regel,
    ernst: r.ernst,
    entiteit_type: r.entiteitType,
    entiteit_id: r.entiteitId,
    titel: r.titel,
    omschrijving: r.omschrijving,
    status: r.status,
    aangemaakt_op: r.aangemaaktOp.toISOString(),
  };
}

router.get("/biae/events", alleenSysteem, (req: Request, res: Response): void => {
  const ruw = req.query["limiet"];
  const limiet = typeof ruw === "string" ? Number(ruw) : 100;
  const events = biae.recentEvents(Number.isFinite(limiet) ? limiet : 100);
  return void res.json(
    events.map((e) => ({
      id: e.id,
      categorie: e.categorie,
      type: e.type,
      gebruiker_id: e.gebruikerId,
      gebruiker_naam: e.gebruikerNaam,
      payload: e.payload,
      tijdstip: e.tijdstip,
    })),
  );
});

router.get("/biae/capabilities", alleenSysteem, (_req: Request, res: Response): void => {
  return void res.json(
    biae.capabilityStatus().map((c) => ({
      naam: c.naam,
      omschrijving: c.omschrijving,
      categorieen: c.categorieen,
      types: c.types,
      verwerkte_events: c.verwerkteEvents,
      laatste_fout: c.laatsteFout,
      laatst_actief_op: c.laatstActiefOp,
    })),
  );
});

router.get(
  "/biae/compliance-signalen",
  alleenSysteem,
  async (req: Request, res: Response): Promise<void> => {
    const status = typeof req.query["status"] === "string" ? req.query["status"] : "open";
    const rijen = await db
      .select()
      .from(complianceSignalenTable)
      .where(eq(complianceSignalenTable.status, status))
      .orderBy(desc(complianceSignalenTable.aangemaaktOp));
    return void res.json(rijen.map(serialiseerSignaal));
  },
);

router.get(
  "/biae/kpi/:boekjaar",
  alleenSysteem,
  async (req: Request, res: Response): Promise<void> => {
    const boekjaar = Number(req.params["boekjaar"]);
    if (!Number.isFinite(boekjaar)) {
      return void res.status(400).json({ error: "Ongeldig boekjaar" });
    }
    const feed = await aggregeerKpiFeed(boekjaar);
    return void res.json({
      boekjaar: feed.boekjaar,
      fie_observaties: {
        totaal: feed.fieObservaties.totaal,
        kritiek: feed.fieObservaties.kritiek,
        waarschuwing: feed.fieObservaties.waarschuwing,
      },
      open_goedkeuringen: feed.openGoedkeuringen,
      compliance_signalen: {
        open: feed.complianceSignalen.open,
        kritiek: feed.complianceSignalen.kritiek,
      },
      nacalculatie_afwijkingen: { hoog: feed.nacalculatieAfwijkingen.hoog },
      gegenereerd_op: feed.gegenereerdOp,
    });
  },
);

export default router;
