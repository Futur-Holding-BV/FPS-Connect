import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import { effectieveContext } from "../utils/rol";
import { momentenVandaag } from "../services/moments/registry";

const momentsRouter = Router();

// GET /moments/vandaag — één gedeeld endpoint voor web + mobiel. Geeft de
// Moments (vandaag jarig, later evt. andere types) die voor de ingelogde
// gebruiker zichtbaar zijn. Klant/FPS One-portaal krijgt altijd een lege lijst.
momentsRouter.get("/moments/vandaag", requireAuth, async (req, res): Promise<void> => {
  const ctx = await effectieveContext(req);
  const momenten = await momentenVandaag({ userId: ctx.userId, rol: ctx.rol, vandaag: new Date() });

  res.json(
    momenten.map((m) => ({
      type: m.type,
      medewerker_id: m.medewerkerId,
      naam: m.naam,
      foto_url: m.fotoUrl,
      geldt_voor_jou: m.geldtVoorJou,
    })),
  );
});

export default momentsRouter;
