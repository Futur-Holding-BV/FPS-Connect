import { Router } from "express";
import { db } from "@workspace/db";
import {
  toolboxBerichtenTable,
  leesbevestigingenTable,
  gebruikersTable,
} from "@workspace/db";
import { eq, and, or, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";

const toolboxRouter = Router();

function formatBericht(r: Record<string, unknown>, mijnUserId?: number, bevestigingen?: Array<{ id: number; gebruikerId: number; naam: string; bevestigdOp: Date }>) {
  const bijlagen = Array.isArray(r.bijlagen) ? r.bijlagen : [];
  const mijnBevestiging = bevestigingen
    ? bevestigingen.find((b) => b.gebruikerId === mijnUserId) ?? null
    : null;
  const base = {
    id: r.id,
    titel: r.titel,
    inhoud: r.inhoud,
    bijlagen,
    doelgroep: r.doelgroep,
    doelgroep_gebruiker_id: r.doelgroepGebruikerId ?? null,
    aangemaakt_door_id: r.aangemaaktDoorId ?? null,
    aangemaakt_door_naam: r.aangemaaktDoorNaam ?? null,
    gepubliceerd: r.gepubliceerd,
    gepubliceerd_op: r.gepubliceerdOp ? (r.gepubliceerdOp as Date).toISOString() : null,
    aangemaakt_op: (r.aangemaaktOp as Date).toISOString(),
    bijgewerkt_op: (r.bijgewerktOp as Date).toISOString(),
    mijn_bevestiging: mijnBevestiging
      ? {
          id: mijnBevestiging.id,
          bericht_id: r.id,
          gebruiker_id: mijnBevestiging.gebruikerId,
          bevestigd_op: (mijnBevestiging.bevestigdOp as Date).toISOString(),
        }
      : null,
    aantal_bevestigd: bevestigingen ? bevestigingen.length : null,
    aantal_ontvangers: null,
  };
  if (bevestigingen !== undefined) {
    return {
      ...base,
      bevestigingen: bevestigingen.map((b) => ({
        id: b.id,
        gebruiker_id: b.gebruikerId,
        naam: b.naam,
        bevestigd_op: (b.bevestigdOp as Date).toISOString(),
      })),
    };
  }
  return base;
}

toolboxRouter.get("/toolbox-berichten", requireAuth, async (req, res) => {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ fout: "Niet ingelogd" });

  const gepubliceerdQ = req.query["gepubliceerd"];
  const filterGepubliceerd =
    gepubliceerdQ === "true" ? true : gepubliceerdQ === "false" ? false : undefined;

  const isBeheerder = (req.session as unknown as Record<string, unknown>)?.["rol"] === "hoofdbeheerder";

  const rows = await db
    .select({
      id: toolboxBerichtenTable.id,
      titel: toolboxBerichtenTable.titel,
      inhoud: toolboxBerichtenTable.inhoud,
      bijlagen: toolboxBerichtenTable.bijlagen,
      doelgroep: toolboxBerichtenTable.doelgroep,
      doelgroepGebruikerId: toolboxBerichtenTable.doelgroepGebruikerId,
      aangemaaktDoorId: toolboxBerichtenTable.aangemaaktDoorId,
      aangemaaktDoorNaam: gebruikersTable.naam,
      gepubliceerd: toolboxBerichtenTable.gepubliceerd,
      gepubliceerdOp: toolboxBerichtenTable.gepubliceerdOp,
      aangemaaktOp: toolboxBerichtenTable.aangemaaktOp,
      bijgewerktOp: toolboxBerichtenTable.bijgewerktOp,
    })
    .from(toolboxBerichtenTable)
    .leftJoin(gebruikersTable, eq(toolboxBerichtenTable.aangemaaktDoorId, gebruikersTable.id))
    .where(
      filterGepubliceerd !== undefined
        ? eq(toolboxBerichtenTable.gepubliceerd, filterGepubliceerd)
        : isBeheerder
        ? undefined
        : and(
            eq(toolboxBerichtenTable.gepubliceerd, true),
            or(
              eq(toolboxBerichtenTable.doelgroep, "iedereen"),
              and(
                eq(toolboxBerichtenTable.doelgroep, "gebruiker"),
                eq(toolboxBerichtenTable.doelgroepGebruikerId, userId)
              )
            )
          )
    )
    .orderBy(desc(toolboxBerichtenTable.aangemaaktOp));

  const berichtIds = rows.map((r) => r.id);
  const mijnBevestigingen =
    berichtIds.length > 0
      ? await db
          .select()
          .from(leesbevestigingenTable)
          .where(
            and(
              eq(leesbevestigingenTable.gebruikerId, userId)
            )
          )
      : [];

  const result = rows.map((r) => {
    const mijnBev = mijnBevestigingen.find((b) => b.berichtId === r.id);
    return {
      id: r.id,
      titel: r.titel,
      inhoud: r.inhoud,
      bijlagen: Array.isArray(r.bijlagen) ? r.bijlagen : [],
      doelgroep: r.doelgroep,
      doelgroep_gebruiker_id: r.doelgroepGebruikerId ?? null,
      aangemaakt_door_id: r.aangemaaktDoorId ?? null,
      aangemaakt_door_naam: r.aangemaaktDoorNaam ?? null,
      gepubliceerd: r.gepubliceerd,
      gepubliceerd_op: r.gepubliceerdOp ? r.gepubliceerdOp.toISOString() : null,
      aangemaakt_op: r.aangemaaktOp.toISOString(),
      bijgewerkt_op: r.bijgewerktOp.toISOString(),
      mijn_bevestiging: mijnBev
        ? {
            id: mijnBev.id,
            bericht_id: mijnBev.berichtId,
            gebruiker_id: mijnBev.gebruikerId,
            bevestigd_op: mijnBev.bevestigdOp.toISOString(),
          }
        : null,
      aantal_bevestigd: null,
      aantal_ontvangers: null,
    };
  });

  return res.json(result);
});

toolboxRouter.post("/toolbox-berichten", requireAuth, async (req, res) => {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ fout: "Niet ingelogd" });

  const { titel, inhoud, bijlagen = [], doelgroep = "iedereen", doelgroep_gebruiker_id } = req.body as {
    titel: string;
    inhoud: string;
    bijlagen?: unknown[];
    doelgroep?: string;
    doelgroep_gebruiker_id?: number | null;
  };

  if (!titel || !inhoud) return res.status(422).json({ fout: "titel en inhoud zijn verplicht" });

  const [rij] = await db
    .insert(toolboxBerichtenTable)
    .values({
      titel,
      inhoud,
      bijlagen: bijlagen as never,
      doelgroep,
      doelgroepGebruikerId: doelgroep_gebruiker_id ?? null,
      aangemaaktDoorId: userId,
    })
    .returning();

  return res.status(201).json({
    id: rij.id,
    titel: rij.titel,
    inhoud: rij.inhoud,
    bijlagen: Array.isArray(rij.bijlagen) ? rij.bijlagen : [],
    doelgroep: rij.doelgroep,
    doelgroep_gebruiker_id: rij.doelgroepGebruikerId ?? null,
    aangemaakt_door_id: rij.aangemaaktDoorId ?? null,
    aangemaakt_door_naam: null,
    gepubliceerd: rij.gepubliceerd,
    gepubliceerd_op: null,
    aangemaakt_op: rij.aangemaaktOp.toISOString(),
    bijgewerkt_op: rij.bijgewerktOp.toISOString(),
    mijn_bevestiging: null,
    aantal_bevestigd: null,
    aantal_ontvangers: null,
  });
});

toolboxRouter.get("/toolbox-berichten/:id", requireAuth, async (req, res) => {
  const id = parseInt(String(req.params["id"]));
  if (isNaN(id)) return res.status(400).json({ fout: "Ongeldig id" });

  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ fout: "Niet ingelogd" });

  const [rij] = await db
    .select({
      id: toolboxBerichtenTable.id,
      titel: toolboxBerichtenTable.titel,
      inhoud: toolboxBerichtenTable.inhoud,
      bijlagen: toolboxBerichtenTable.bijlagen,
      doelgroep: toolboxBerichtenTable.doelgroep,
      doelgroepGebruikerId: toolboxBerichtenTable.doelgroepGebruikerId,
      aangemaaktDoorId: toolboxBerichtenTable.aangemaaktDoorId,
      aangemaaktDoorNaam: gebruikersTable.naam,
      gepubliceerd: toolboxBerichtenTable.gepubliceerd,
      gepubliceerdOp: toolboxBerichtenTable.gepubliceerdOp,
      aangemaaktOp: toolboxBerichtenTable.aangemaaktOp,
      bijgewerktOp: toolboxBerichtenTable.bijgewerktOp,
    })
    .from(toolboxBerichtenTable)
    .leftJoin(gebruikersTable, eq(toolboxBerichtenTable.aangemaaktDoorId, gebruikersTable.id))
    .where(eq(toolboxBerichtenTable.id, id));

  if (!rij) return res.status(404).json({ fout: "Niet gevonden" });

  const bevestigingen = await db
    .select({
      id: leesbevestigingenTable.id,
      gebruikerId: leesbevestigingenTable.gebruikerId,
      naam: gebruikersTable.naam,
      bevestigdOp: leesbevestigingenTable.bevestigdOp,
    })
    .from(leesbevestigingenTable)
    .leftJoin(gebruikersTable, eq(leesbevestigingenTable.gebruikerId, gebruikersTable.id))
    .where(eq(leesbevestigingenTable.berichtId, id));

  const mijnBev = bevestigingen.find((b) => b.gebruikerId === userId);

  return res.json({
    id: rij.id,
    titel: rij.titel,
    inhoud: rij.inhoud,
    bijlagen: Array.isArray(rij.bijlagen) ? rij.bijlagen : [],
    doelgroep: rij.doelgroep,
    doelgroep_gebruiker_id: rij.doelgroepGebruikerId ?? null,
    aangemaakt_door_id: rij.aangemaaktDoorId ?? null,
    aangemaakt_door_naam: rij.aangemaaktDoorNaam ?? null,
    gepubliceerd: rij.gepubliceerd,
    gepubliceerd_op: rij.gepubliceerdOp ? rij.gepubliceerdOp.toISOString() : null,
    aangemaakt_op: rij.aangemaaktOp.toISOString(),
    bijgewerkt_op: rij.bijgewerktOp.toISOString(),
    mijn_bevestiging: mijnBev
      ? {
          id: mijnBev.id,
          bericht_id: id,
          gebruiker_id: mijnBev.gebruikerId,
          bevestigd_op: mijnBev.bevestigdOp.toISOString(),
        }
      : null,
    aantal_bevestigd: bevestigingen.length,
    aantal_ontvangers: null,
    bevestigingen: bevestigingen.map((b) => ({
      id: b.id,
      gebruiker_id: b.gebruikerId,
      naam: b.naam ?? "",
      bevestigd_op: b.bevestigdOp.toISOString(),
    })),
  });
});

toolboxRouter.patch("/toolbox-berichten/:id", requireAuth, async (req, res) => {
  const id = parseInt(String(req.params["id"]));
  if (isNaN(id)) return res.status(400).json({ fout: "Ongeldig id" });

  const { titel, inhoud, bijlagen, doelgroep, doelgroep_gebruiker_id } = req.body as {
    titel?: string;
    inhoud?: string;
    bijlagen?: unknown[];
    doelgroep?: string;
    doelgroep_gebruiker_id?: number | null;
  };

  const patch: Record<string, unknown> = { bijgewerktOp: new Date() };
  if (titel !== undefined) patch["titel"] = titel;
  if (inhoud !== undefined) patch["inhoud"] = inhoud;
  if (bijlagen !== undefined) patch["bijlagen"] = bijlagen;
  if (doelgroep !== undefined) patch["doelgroep"] = doelgroep;
  if (doelgroep_gebruiker_id !== undefined) patch["doelgroepGebruikerId"] = doelgroep_gebruiker_id;

  const [rij] = await db
    .update(toolboxBerichtenTable)
    .set(patch as never)
    .where(eq(toolboxBerichtenTable.id, id))
    .returning();

  if (!rij) return res.status(404).json({ fout: "Niet gevonden" });

  return res.json({
    id: rij.id,
    titel: rij.titel,
    inhoud: rij.inhoud,
    bijlagen: Array.isArray(rij.bijlagen) ? rij.bijlagen : [],
    doelgroep: rij.doelgroep,
    doelgroep_gebruiker_id: rij.doelgroepGebruikerId ?? null,
    aangemaakt_door_id: rij.aangemaaktDoorId ?? null,
    aangemaakt_door_naam: null,
    gepubliceerd: rij.gepubliceerd,
    gepubliceerd_op: rij.gepubliceerdOp ? rij.gepubliceerdOp.toISOString() : null,
    aangemaakt_op: rij.aangemaaktOp.toISOString(),
    bijgewerkt_op: rij.bijgewerktOp.toISOString(),
    mijn_bevestiging: null,
    aantal_bevestigd: null,
    aantal_ontvangers: null,
  });
});

toolboxRouter.delete("/toolbox-berichten/:id", requireAuth, async (req, res) => {
  const id = parseInt(String(req.params["id"]));
  if (isNaN(id)) return res.status(400).json({ fout: "Ongeldig id" });

  await db.delete(toolboxBerichtenTable).where(eq(toolboxBerichtenTable.id, id));
  return res.status(204).send();
});

toolboxRouter.post("/toolbox-berichten/:id/publiceren", requireAuth, async (req, res) => {
  const id = parseInt(String(req.params["id"]));
  if (isNaN(id)) return res.status(400).json({ fout: "Ongeldig id" });

  const [rij] = await db
    .update(toolboxBerichtenTable)
    .set({ gepubliceerd: true, gepubliceerdOp: new Date(), bijgewerktOp: new Date() })
    .where(eq(toolboxBerichtenTable.id, id))
    .returning();

  if (!rij) return res.status(404).json({ fout: "Niet gevonden" });

  return res.json({
    id: rij.id,
    titel: rij.titel,
    inhoud: rij.inhoud,
    bijlagen: Array.isArray(rij.bijlagen) ? rij.bijlagen : [],
    doelgroep: rij.doelgroep,
    doelgroep_gebruiker_id: rij.doelgroepGebruikerId ?? null,
    aangemaakt_door_id: rij.aangemaaktDoorId ?? null,
    aangemaakt_door_naam: null,
    gepubliceerd: rij.gepubliceerd,
    gepubliceerd_op: rij.gepubliceerdOp ? rij.gepubliceerdOp.toISOString() : null,
    aangemaakt_op: rij.aangemaaktOp.toISOString(),
    bijgewerkt_op: rij.bijgewerktOp.toISOString(),
    mijn_bevestiging: null,
    aantal_bevestigd: null,
    aantal_ontvangers: null,
  });
});

toolboxRouter.post("/toolbox-berichten/:id/bevestigen", requireAuth, async (req, res) => {
  const id = parseInt(String(req.params["id"]));
  if (isNaN(id)) return res.status(400).json({ fout: "Ongeldig id" });

  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ fout: "Niet ingelogd" });

  const [bestaand] = await db
    .select()
    .from(leesbevestigingenTable)
    .where(
      and(
        eq(leesbevestigingenTable.berichtId, id),
        eq(leesbevestigingenTable.gebruikerId, userId)
      )
    );

  if (bestaand) {
    return res.status(409).json({ fout: "Al bevestigd" });
  }

  const [rij] = await db
    .insert(leesbevestigingenTable)
    .values({ berichtId: id, gebruikerId: userId })
    .returning();

  return res.json({
    id: rij.id,
    bericht_id: rij.berichtId,
    gebruiker_id: rij.gebruikerId,
    bevestigd_op: rij.bevestigdOp.toISOString(),
  });
});

export default toolboxRouter;
