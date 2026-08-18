/**
 * BEHEERSTATUS_01 — doorgeefluik voor het meldingsblok op het
 * hoofdbeheerder-dashboard.
 *
 * Connect haalt hier live een statussamenvatting op bij het externe
 * FPS-Beheercentrum, met een sleutel die alléén leesrecht geeft.
 * Connect slaat NIETS van deze gegevens op en kent geen eigen
 * storingsafhandeling: dit is uitsluitend doorgeven en tonen.
 *
 * Configuratie (omgeving, nooit in de client):
 *   BEHEER_STATUS_URL      — basis-URL van het beheercentrum
 *   BEHEER_STATUS_SLEUTEL  — leessleutel (in het beheercentrum op te vragen
 *                            via /api/extern/leessleutel)
 *
 * Antwoord is bewust fail-loud: zonder configuratie of zonder antwoord van
 * het beheercentrum komt er { verbinding: false } terug — het blok toont dan
 * "geen verbinding", nooit groen en nooit leeg.
 */
import { Router, type IRouter } from "express";
import { requireRol } from "../middlewares/auth";

const router: IRouter = Router();

const TIMEOUT_MS = 5000;

// Alleen de hoofdbeheerder (het beheerdersprofiel van René) mag dit zien.
router.get("/beheer-status", requireRol(), async (_req, res) => {
  const basis = (process.env.BEHEER_STATUS_URL ?? "").replace(/\/+$/, "");
  const sleutel = process.env.BEHEER_STATUS_SLEUTEL ?? "";
  if (!basis || !sleutel) {
    res.status(200).json({
      verbinding: false,
      reden: "Koppeling niet geconfigureerd (BEHEER_STATUS_URL / BEHEER_STATUS_SLEUTEL).",
    });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const antwoord = await fetch(`${basis}/api/extern/status`, {
      headers: { "X-Lees-Sleutel": sleutel },
      signal: controller.signal,
    });
    if (!antwoord.ok) {
      res.status(200).json({ verbinding: false, reden: `Beheercentrum antwoordde ${antwoord.status}.` });
      return;
    }
    const data = (await antwoord.json()) as {
      zwaarste: "rood" | "aandacht" | "rustig";
      aantalStoringen: number;
      aantalAandacht: number;
      doel: string;
      tijdstip: string;
    };
    if (
      (data.zwaarste !== "rood" && data.zwaarste !== "aandacht" && data.zwaarste !== "rustig") ||
      typeof data.aantalStoringen !== "number"
    ) {
      res.status(200).json({ verbinding: false, reden: "Onbruikbaar antwoord van het beheercentrum." });
      return;
    }
    res.status(200).json({
      verbinding: true,
      zwaarste: data.zwaarste,
      aantalStoringen: data.aantalStoringen,
      aantalAandacht: data.aantalAandacht,
      // Absolute link zodat de client geen basis-URL hoeft te kennen.
      doelUrl: `${basis}${typeof data.doel === "string" && data.doel.startsWith("/") ? data.doel : "/"}`,
      tijdstip: data.tijdstip,
    });
  } catch {
    res.status(200).json({ verbinding: false, reden: "Geen antwoord van het beheercentrum." });
  } finally {
    clearTimeout(timer);
  }
});

export default router;
