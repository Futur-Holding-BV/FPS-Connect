import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";
import { haalOnlineGebruikersOp } from "../lib/online-tracker.js";

const onlineGebruikersRouter = Router();

/**
 * GET /mijn/online-gebruikers
 * Geeft actieve collega's (laatste 5 min) terug, exclusief jezelf en klanten.
 * Klanten ontvangen altijd een lege lijst.
 */
onlineGebruikersRouter.get("/mijn/online-gebruikers", requireAuth, (req, res) => {
  const userId = req.session.userId!;
  const rol    = req.session.rol ?? "";

  if (rol === "klant") {
    res.json([]);
    return;
  }

  const online = haalOnlineGebruikersOp(userId);
  res.json(online);
});

export default onlineGebruikersRouter;
