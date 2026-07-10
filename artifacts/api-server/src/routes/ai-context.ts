import { Router } from "express";
import { requireRol } from "../middlewares/auth";
import { bouwContextBundel, type ContextEntiteitType } from "../lib/aiContext";

// ── Live-validatie-endpoint voor de AI Context Service ───────────────────────
//
// Handgeschreven beheerdersroute (buiten de OpenAPI-spec, net als ai-log.ts):
// puur diagnostisch, geen client-hook. Let op: dit bestand mount relatief
// t.o.v. de "/api"-prefix in app.ts — NIET nogmaals "/api/..." in het pad
// zetten (dat gaf voorheen een onbereikbare "/api/api/..."-route).
// Alleen de hoofdbeheerder mag hem aanroepen. Autorisatie van de opgebouwde
// bundel loopt via `req.permissies` —
// de effectieve (impersonatie-bewuste) PermissieService die `laadPermissies`
// globaal zet. Zo kan een hoofdbeheerder via "bekijken als" live controleren
// dat de bundel voor een beperkte gebruiker correct wordt ingeperkt.

const router = Router();

const GELDIGE_TYPES: ContextEntiteitType[] = [
  "gebouw",
  "voorziening",
  "offerte",
  "medewerker",
  "document",
  "dossier",
  "onderhoud",
  "klant",
];

router.get(
  "/beheer/ai-context",
  requireRol("hoofdbeheerder"),
  async (req, res): Promise<void> => {
    const type = String(req.query.type ?? "") as ContextEntiteitType;
    const id = parseInt(String(req.query.id ?? ""), 10);
    const slot = typeof req.query.slot === "string" ? req.query.slot : undefined;
    const maxDiepte = req.query.max_diepte ? parseInt(String(req.query.max_diepte), 10) : undefined;

    if (!GELDIGE_TYPES.includes(type)) {
      res.status(400).json({ fout: `Onbekend entiteitstype. Kies uit: ${GELDIGE_TYPES.join(", ")}` });
      return;
    }
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ fout: "Ongeldige id." });
      return;
    }

    const scope = req.permissies;
    if (!scope) {
      res.status(500).json({ fout: "Permissies niet geladen." });
      return;
    }

    const bundel = await bouwContextBundel({
      entiteitstype: type,
      entiteitId: id,
      scope,
      modelSlot: (slot as never) ?? undefined,
      maxDiepte: Number.isInteger(maxDiepte) ? maxDiepte : undefined,
    });

    res.json(bundel);
  },
);

export default router;
