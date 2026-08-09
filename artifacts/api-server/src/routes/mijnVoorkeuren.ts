// PANEEL_01 §4.4 / MENU_01 §4.3 — generiek per-gebruiker UI-voorkeurenmechanisme.
// Eén enkel mechanisme (geen tweede opslag): alle UI-voorkeuren van de
// ingelogde gebruiker lopen via /mijn/voorkeuren. Autorisatie: requireAuth
// (basisrecht, geen module); een gebruiker ziet en schrijft uitsluitend eigen
// rijen via req.session.userId.
import { Router } from "express";
import { db } from "@workspace/db";
import { gebruikerVoorkeurenTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";

const mijnVoorkeurenRouter = Router();

// Sleutel: max 100 tekens, alleen [a-z0-9_.-].
const SLEUTEL_PATROON = /^[a-z0-9_.-]{1,100}$/;
// Waarde na JSON.stringify: max 50000 tekens.
const MAX_WAARDE_LENGTE = 50000;

// GET /mijn/voorkeuren — alle voorkeuren van de ingelogde gebruiker als
// { sleutel: waarde }-object.
mijnVoorkeurenRouter.get("/mijn/voorkeuren", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session?.userId;
  if (!userId) return void res.status(401).json({ fout: "Niet ingelogd" });

  const rijen = await db
    .select({ sleutel: gebruikerVoorkeurenTable.sleutel, waarde: gebruikerVoorkeurenTable.waarde })
    .from(gebruikerVoorkeurenTable)
    .where(eq(gebruikerVoorkeurenTable.gebruikerId, userId));

  const resultaat: Record<string, unknown> = {};
  for (const rij of rijen) resultaat[rij.sleutel] = rij.waarde;

  return void res.json(resultaat);
});

// PUT /mijn/voorkeuren/:sleutel — upsert (onConflictDoUpdate op
// gebruiker_id + sleutel). Body: { waarde: <jsonb> }.
mijnVoorkeurenRouter.put("/mijn/voorkeuren/:sleutel", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session?.userId;
  if (!userId) return void res.status(401).json({ fout: "Niet ingelogd" });

  const sleutel = String(req.params.sleutel ?? "");
  if (!SLEUTEL_PATROON.test(sleutel)) {
    return void res
      .status(422)
      .json({ fout: "Ongeldige sleutel: maximaal 100 tekens uit [a-z0-9_.-]." });
  }

  const body = req.body as { waarde?: unknown };
  if (!body || !("waarde" in body)) {
    return void res.status(422).json({ fout: "Body moet een veld 'waarde' bevatten." });
  }
  const waarde = body.waarde;

  if (JSON.stringify(waarde).length > MAX_WAARDE_LENGTE) {
    return void res
      .status(422)
      .json({ fout: `Waarde is te groot (maximaal ${MAX_WAARDE_LENGTE} tekens na serialisatie).` });
  }

  // PANEEL_01 §4.4/§6: maximaal vijf benoemde paneelindelingen — ook
  // server-side afgedwongen (de UI-limiet is met een directe API-call te
  // omzeilen). Standaardindelingen staan in code en tellen niet mee.
  if (sleutel === "paneel.indelingen") {
    if (!Array.isArray(waarde) || waarde.length > 5) {
      return void res
        .status(422)
        .json({ fout: "paneel.indelingen moet een lijst van maximaal 5 indelingen zijn." });
    }
  }

  await db
    .insert(gebruikerVoorkeurenTable)
    .values({ gebruikerId: userId, sleutel, waarde, bijgewerktOp: new Date() })
    .onConflictDoUpdate({
      target: [gebruikerVoorkeurenTable.gebruikerId, gebruikerVoorkeurenTable.sleutel],
      set: { waarde, bijgewerktOp: new Date() },
    });

  return void res.json({ sleutel, waarde });
});

// DELETE /mijn/voorkeuren/:sleutel — verwijder één voorkeur; altijd 204,
// ook als de sleutel niet bestond.
mijnVoorkeurenRouter.delete("/mijn/voorkeuren/:sleutel", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session?.userId;
  if (!userId) return void res.status(401).json({ fout: "Niet ingelogd" });

  const sleutel = String(req.params.sleutel ?? "");
  await db
    .delete(gebruikerVoorkeurenTable)
    .where(
      and(
        eq(gebruikerVoorkeurenTable.gebruikerId, userId),
        eq(gebruikerVoorkeurenTable.sleutel, sleutel),
      ),
    );

  return void res.status(204).end();
});

export default mijnVoorkeurenRouter;
