import { Router } from "express";
import { db } from "@workspace/db";
import {
  toolboxBerichtenTable,
  leesbevestigingenTable,
  gebruikersTable,
} from "@workspace/db";
import { eq, and, or, desc, isNotNull, lte } from "drizzle-orm";
import { requireAuth, requireBevoegdheid } from "../middlewares/auth.js";
import { aiGateway, heeftGateway } from "../lib/aiGateway";
import { logger } from "../lib/logger.js";

const toolboxRouter = Router();

const schrijvenToolbox = requireBevoegdheid("toolbox", 3);
const verwijderenToolbox = requireBevoegdheid("toolbox", 4);

// ── Auto-trigger: AI-analyse elke 4 uur ──────────────────────────────────────
let lastAutoAnalyseTrigger = 0;
const VIER_UREN_MS = 4 * 60 * 60 * 1000;

function formatBericht(r: Record<string, unknown>, mijnUserId?: number, bevestigingen?: Array<{ id: number; gebruikerId: number; naam: string; bevestigdOp: Date }>) {
  const bijlagen = Array.isArray(r.bijlagen) ? r.bijlagen : [];
  const koppelingen = Array.isArray(r.koppelingen) ? r.koppelingen : [];
  const mijnBevestiging = bevestigingen
    ? bevestigingen.find((b) => b.gebruikerId === mijnUserId) ?? null
    : null;
  const base = {
    id: r.id,
    titel: r.titel,
    inhoud: r.inhoud,
    bijlagen,
    koppelingen,
    doelgroep: r.doelgroep,
    doelgroep_gebruiker_id: r.doelgroepGebruikerId ?? null,
    aangemaakt_door_id: r.aangemaaktDoorId ?? null,
    aangemaakt_door_naam: r.aangemaaktDoorNaam ?? null,
    gepubliceerd: r.gepubliceerd,
    gepubliceerd_op: r.gepubliceerdOp ? (r.gepubliceerdOp as Date).toISOString() : null,
    gearchiveerd: r.gearchiveerd ?? false,
    gearchiveerd_op: r.gearchivierdOp ? (r.gearchivierdOp as Date).toISOString() : null,
    is_belangrijk: r.isBelangrijk ?? null,
    ai_verwerkt_op: r.aiVerwerktOp ? (r.aiVerwerktOp as Date).toISOString() : null,
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
        naam: b.naam ?? "",
        bevestigd_op: (b.bevestigdOp as Date).toISOString(),
      })),
    };
  }
  return base;
}

// Helper: heeft de ingelogde gebruiker HRM-leestoegang of is hoofdbeheerder?
async function heeftBeperktArchiefToegang(userId: number): Promise<boolean> {
  const [g] = await db
    .select({ rol: gebruikersTable.rol, bevoegdheden: gebruikersTable.bevoegdheden })
    .from(gebruikersTable)
    .where(eq(gebruikersTable.id, userId));
  if (!g) return false;
  if (g.rol === "hoofdbeheerder") return true;
  const bev = (g.bevoegdheden as Record<string, number> | null) ?? {};
  return (bev["personeel"] ?? 0) >= 1;
}

// ── GET /toolbox-berichten ────────────────────────────────────────────────────
toolboxRouter.get("/toolbox-berichten", requireAuth, async (req, res) => {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ fout: "Niet ingelogd" });

  const gepubliceerdQ = req.query["gepubliceerd"];
  const gearchivierdQ = req.query["gearchiveerd"];
  const filterGepubliceerd =
    gepubliceerdQ === "true" ? true : gepubliceerdQ === "false" ? false : undefined;
  const filterGearchiveerd =
    gearchivierdQ === "true" ? true : gearchivierdQ === "false" ? false : false; // default: actief

  const isBeheerder = req.permissies!.isHoofdbeheerder;

  // Auto-trigger AI-analyse elke 4 uur (fire-and-forget)
  const nuMs = Date.now();
  if (heeftGateway() && filterGearchiveerd === false && nuMs - lastAutoAnalyseTrigger > VIER_UREN_MS) {
    lastAutoAnalyseTrigger = nuMs;
    voerAiAnalyseUit().catch((e: unknown) => logger.warn({ err: e }, "Auto AI-analyse mislukt"));
  }

  const rows = await db
    .select({
      id: toolboxBerichtenTable.id,
      titel: toolboxBerichtenTable.titel,
      inhoud: toolboxBerichtenTable.inhoud,
      bijlagen: toolboxBerichtenTable.bijlagen,
      koppelingen: toolboxBerichtenTable.koppelingen,
      doelgroep: toolboxBerichtenTable.doelgroep,
      doelgroepGebruikerId: toolboxBerichtenTable.doelgroepGebruikerId,
      aangemaaktDoorId: toolboxBerichtenTable.aangemaaktDoorId,
      aangemaaktDoorNaam: gebruikersTable.naam,
      gepubliceerd: toolboxBerichtenTable.gepubliceerd,
      gepubliceerdOp: toolboxBerichtenTable.gepubliceerdOp,
      gearchiveerd: toolboxBerichtenTable.gearchiveerd,
      gearchivierdOp: toolboxBerichtenTable.gearchivierdOp,
      isBelangrijk: toolboxBerichtenTable.isBelangrijk,
      aiVerwerktOp: toolboxBerichtenTable.aiVerwerktOp,
      aangemaaktOp: toolboxBerichtenTable.aangemaaktOp,
      bijgewerktOp: toolboxBerichtenTable.bijgewerktOp,
    })
    .from(toolboxBerichtenTable)
    .leftJoin(gebruikersTable, eq(toolboxBerichtenTable.aangemaaktDoorId, gebruikersTable.id))
    .where(
      filterGepubliceerd !== undefined
        ? and(
            eq(toolboxBerichtenTable.gepubliceerd, filterGepubliceerd),
            eq(toolboxBerichtenTable.gearchiveerd, filterGearchiveerd),
          )
        : isBeheerder
        ? eq(toolboxBerichtenTable.gearchiveerd, filterGearchiveerd)
        : and(
            eq(toolboxBerichtenTable.gepubliceerd, true),
            eq(toolboxBerichtenTable.gearchiveerd, filterGearchiveerd),
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

  // Archief: filter niet-belangrijke berichten voor gebruikers zonder HRM-toegang
  let gefilterd = rows;
  if (filterGearchiveerd === true) {
    const heeftToegang = await heeftBeperktArchiefToegang(userId);
    if (!heeftToegang) {
      gefilterd = rows.filter((r) => r.isBelangrijk === true);
    }
  }

  const berichtIds = gefilterd.map((r) => r.id);
  const mijnBevestigingen =
    berichtIds.length > 0
      ? await db
          .select()
          .from(leesbevestigingenTable)
          .where(eq(leesbevestigingenTable.gebruikerId, userId))
      : [];

  const result = gefilterd.map((r) => {
    const mijnBev = mijnBevestigingen.find((b) => b.berichtId === r.id);
    return {
      ...formatBericht(r as Record<string, unknown>),
      mijn_bevestiging: mijnBev
        ? {
            id: mijnBev.id,
            bericht_id: mijnBev.berichtId,
            gebruiker_id: mijnBev.gebruikerId,
            bevestigd_op: mijnBev.bevestigdOp.toISOString(),
          }
        : null,
    };
  });

  return res.json(result);
});

toolboxRouter.post("/toolbox-berichten", schrijvenToolbox, async (req, res) => {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ fout: "Niet ingelogd" });

  const { titel, inhoud, bijlagen = [], doelgroep = "iedereen", doelgroep_gebruiker_id, koppelingen = [] } = req.body as {
    titel: string;
    inhoud: string;
    bijlagen?: unknown[];
    doelgroep?: string;
    doelgroep_gebruiker_id?: number | null;
    koppelingen?: unknown[];
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
      koppelingen: koppelingen as never,
    })
    .returning();

  return res.status(201).json(formatBericht(rij as unknown as Record<string, unknown>));
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
      koppelingen: toolboxBerichtenTable.koppelingen,
      doelgroep: toolboxBerichtenTable.doelgroep,
      doelgroepGebruikerId: toolboxBerichtenTable.doelgroepGebruikerId,
      aangemaaktDoorId: toolboxBerichtenTable.aangemaaktDoorId,
      aangemaaktDoorNaam: gebruikersTable.naam,
      gepubliceerd: toolboxBerichtenTable.gepubliceerd,
      gepubliceerdOp: toolboxBerichtenTable.gepubliceerdOp,
      gearchiveerd: toolboxBerichtenTable.gearchiveerd,
      gearchivierdOp: toolboxBerichtenTable.gearchivierdOp,
      isBelangrijk: toolboxBerichtenTable.isBelangrijk,
      aiVerwerktOp: toolboxBerichtenTable.aiVerwerktOp,
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

  return res.json(formatBericht(rij as unknown as Record<string, unknown>, userId, bevestigingen as never));
});

toolboxRouter.patch("/toolbox-berichten/:id", schrijvenToolbox, async (req, res) => {
  const id = parseInt(String(req.params["id"]));
  if (isNaN(id)) return res.status(400).json({ fout: "Ongeldig id" });

  const { titel, inhoud, bijlagen, doelgroep, doelgroep_gebruiker_id, koppelingen } = req.body as {
    titel?: string;
    inhoud?: string;
    bijlagen?: unknown[];
    doelgroep?: string;
    doelgroep_gebruiker_id?: number | null;
    koppelingen?: unknown[];
  };

  const patch: Record<string, unknown> = { bijgewerktOp: new Date() };
  if (titel !== undefined) patch["titel"] = titel;
  if (inhoud !== undefined) patch["inhoud"] = inhoud;
  if (bijlagen !== undefined) patch["bijlagen"] = bijlagen;
  if (doelgroep !== undefined) patch["doelgroep"] = doelgroep;
  if (doelgroep_gebruiker_id !== undefined) patch["doelgroepGebruikerId"] = doelgroep_gebruiker_id;
  if (koppelingen !== undefined) patch["koppelingen"] = koppelingen;

  const [rij] = await db
    .update(toolboxBerichtenTable)
    .set(patch as never)
    .where(eq(toolboxBerichtenTable.id, id))
    .returning();

  if (!rij) return res.status(404).json({ fout: "Niet gevonden" });
  return res.json(formatBericht(rij as unknown as Record<string, unknown>));
});

toolboxRouter.delete("/toolbox-berichten/:id", verwijderenToolbox, async (req, res) => {
  const id = parseInt(String(req.params["id"]));
  if (isNaN(id)) return res.status(400).json({ fout: "Ongeldig id" });

  await db.delete(toolboxBerichtenTable).where(eq(toolboxBerichtenTable.id, id));
  return res.status(204).send();
});

toolboxRouter.post("/toolbox-berichten/:id/publiceren", schrijvenToolbox, async (req, res) => {
  const id = parseInt(String(req.params["id"]));
  if (isNaN(id)) return res.status(400).json({ fout: "Ongeldig id" });

  const [rij] = await db
    .update(toolboxBerichtenTable)
    .set({ gepubliceerd: true, gepubliceerdOp: new Date(), bijgewerktOp: new Date() })
    .where(eq(toolboxBerichtenTable.id, id))
    .returning();

  if (!rij) return res.status(404).json({ fout: "Niet gevonden" });
  return res.json(formatBericht(rij as unknown as Record<string, unknown>));
});

// ── POST /toolbox-berichten/:id/archiveren ────────────────────────────────────
toolboxRouter.post("/toolbox-berichten/:id/archiveren", schrijvenToolbox, async (req, res) => {
  const id = parseInt(String(req.params["id"]));
  if (isNaN(id)) return res.status(400).json({ fout: "Ongeldig id" });

  const [rij] = await db
    .update(toolboxBerichtenTable)
    .set({ gearchiveerd: true, gearchivierdOp: new Date(), bijgewerktOp: new Date() })
    .where(eq(toolboxBerichtenTable.id, id))
    .returning();

  if (!rij) return res.status(404).json({ fout: "Niet gevonden" });
  return res.json(formatBericht(rij as unknown as Record<string, unknown>));
});

// ── POST /toolbox-berichten/ai-analyse ────────────────────────────────────────
toolboxRouter.post("/toolbox-berichten/ai-analyse", schrijvenToolbox, async (req, res) => {
  const verwerkt = await voerAiAnalyseUit();
  return res.json({ verwerkt });
});

// ── AI-analyse implementatie ──────────────────────────────────────────────────
async function voerAiAnalyseUit(): Promise<number> {
  if (!heeftGateway()) return 0;

  const rijen = await db
    .select({
      id: toolboxBerichtenTable.id,
      titel: toolboxBerichtenTable.titel,
      inhoud: toolboxBerichtenTable.inhoud,
    })
    .from(toolboxBerichtenTable)
    .where(
      and(
        eq(toolboxBerichtenTable.gepubliceerd, true),
        eq(toolboxBerichtenTable.gearchiveerd, false),
      )
    );

  if (rijen.length === 0) return 0;

  let verwerkt = 0;

  for (const r of rijen) {
    try {
      const antwoord = await aiGateway.chat("fast", {
        max_tokens: 10,
        messages: [
          {
            role: "system",
            content:
              "Je beoordeelt interne berichten van een brandpreventiebedrijf. " +
              "Geef uitsluitend 'ja' of 'nee' als antwoord. " +
              "'ja' betekent: dit bericht heeft blijvende waarde (veiligheidsregels, werkinstructies, procedures, " +
              "informatie die ook voor nieuwe medewerkers later relevant is). " +
              "'nee' betekent: routinebericht, tijdgebonden of eenmalig (datum-specifiek, al verwerkt, administratief).",
          },
          {
            role: "user",
            content: `Titel: ${r.titel}\n\n${r.inhoud}\n\nIs dit bericht blijvend belangrijk?`,
          },
        ],
      });

      const tekst = (antwoord.ok ? antwoord.inhoud : "").toLowerCase().trim();
      const isBelangrijk = tekst.startsWith("ja");

      await db
        .update(toolboxBerichtenTable)
        .set({ isBelangrijk, aiVerwerktOp: new Date(), bijgewerktOp: new Date() })
        .where(eq(toolboxBerichtenTable.id, r.id));

      verwerkt++;
    } catch (e) {
      logger.warn({ err: e, berichtId: r.id }, "AI-classificatie mislukt voor bericht");
    }
  }

  return verwerkt;
}

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
