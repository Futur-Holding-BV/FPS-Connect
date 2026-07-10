/**
 * AI Decision Engine — HTTP-routes (Fase 0)
 *
 * Additieve routes bovenop de bestaande AI-laag. Ze wijzigen geen bestaand
 * gedrag: bestaande AI-functies blijven hun eigen gateway-aanroepen doen. Deze
 * routes maken de nieuwe Decision Engine aantoonbaar werkend, inclusief het
 * human-in-the-loop-pad over twee verzoeken.
 *
 * Contract: zie lib/api-spec/openapi.yaml (operationIds voerAiTaakUit,
 * listAiBeslissingen, getAiBeslissing, beoordeelAiBeslissing).
 */

import { Router } from "express";
import { requireAuth, requireBevoegdheid } from "../middlewares/auth";
import { aiDecisionEngine, dbBeslissingStore, type BeslissingRij } from "../lib/aiDecisionEngine";
import { vindTaak } from "../lib/aiTaakregister";

const router = Router();

/** Map een intern beslissings-rijobject naar de snake_case API-vorm. */
function naarApi(r: BeslissingRij) {
  return {
    token: r.token,
    taaknaam: r.taaknaam,
    module: r.module,
    proces_naam: r.procesNaam,
    aanvrager_id: r.aanvragerId,
    status: r.status,
    voorstel: r.voorstel,
    betrouwbaarheid: r.betrouwbaarheid,
    controle_nodig: r.controleNodig,
    model_slot: r.modelSlot,
    prompt_naam: r.promptNaam,
    prompt_versie: r.promptVersie,
    beslist_door_id: r.beslistDoorId,
    beslist_op: r.beslistOp ? r.beslistOp.toISOString() : null,
    opmerking: r.opmerking,
    verloopt_op: r.verlooptOp ? r.verlooptOp.toISOString() : null,
    aangemaakt_op: r.aangemaaktOp ? r.aangemaaktOp.toISOString() : null,
  };
}

// POST /ai/taken/:taaknaam/uitvoeren — start een geregistreerde taak.
router.post("/ai/taken/:taaknaam/uitvoeren", requireAuth, async (req, res) => {
  const taaknaam = String(req.params.taaknaam);
  const taak = vindTaak(taaknaam);
  if (!taak) {
    res.status(404).json({ fout: `Onbekende AI-taak: ${taaknaam}.` });
    return;
  }

  // Bevoegdheidscheck via de matrix (aanvullend op requireAuth): de aanvrager
  // moet bevoegd zijn voor de module van de taak.
  if (!req.permissies || !req.permissies.heeftModuleRecht(taak.module, taak.minNiveau)) {
    res.status(403).json({ fout: "Onvoldoende bevoegdheid voor deze AI-taak." });
    return;
  }

  const body = (req.body ?? {}) as { invoer?: unknown; context_bundel?: unknown };
  if (typeof body.invoer !== "string" || body.invoer.trim().length === 0) {
    res.status(400).json({ fout: "Veld 'invoer' is verplicht." });
    return;
  }

  const resultaat = await aiDecisionEngine.verwerk(
    taaknaam,
    {
      invoer: body.invoer,
      contextBundel: typeof body.context_bundel === "string" ? body.context_bundel : null,
    },
    req.session.userId ?? null,
  );

  res.json({
    status: resultaat.status,
    resultaat: resultaat.resultaat ?? null,
    human_approval_token: resultaat.humanApprovalToken ?? null,
    betrouwbaarheid: resultaat.betrouwbaarheid ?? null,
    controle_nodig: resultaat.controleNodig ?? null,
    foutmelding: resultaat.foutmelding ?? null,
  });
});

// GET /ai/beslissingen — lijst (beheer/systeem).
router.get("/ai/beslissingen", requireBevoegdheid("systeem", 1), async (_req, res) => {
  const rijen = await dbBeslissingStore.lijst();
  res.json(rijen.map(naarApi));
});

/**
 * Autorisatie op tokenniveau: het token is hoogentropisch, maar mag geen
 * capability-URL zijn. De beoordelaar/lezer moet aantoonbaar bevoegd zijn voor
 * de module van de opgeslagen beslissing (dezelfde matrixcheck als bij het
 * uitvoeren van de taak). Faalt fail-closed: geen permissieservice -> 403.
 */
function magBijBeslissing(req: import("express").Request, rij: BeslissingRij): boolean {
  if (!req.permissies) return false;
  if (req.permissies.isHoofdbeheerder) return true;
  const taak = vindTaak(rij.taaknaam);
  const minNiveau = taak?.minNiveau ?? 1;
  return req.permissies.heeftModuleRecht(rij.module, minNiveau);
}

// GET /ai/beslissingen/:token — detail.
router.get("/ai/beslissingen/:token", requireAuth, async (req, res) => {
  const rij = await dbBeslissingStore.haalOpViaToken(String(req.params.token));
  if (!rij) {
    res.status(404).json({ fout: "Onbekend beslissingstoken." });
    return;
  }
  if (!magBijBeslissing(req, rij)) {
    res.status(403).json({ fout: "Onvoldoende bevoegdheid voor deze beslissing." });
    return;
  }
  res.json(naarApi(rij));
});

// POST /ai/beslissingen/:token/beoordeling — akkoord of afwijzing.
router.post("/ai/beslissingen/:token/beoordeling", requireAuth, async (req, res) => {
  const token = String(req.params.token);
  const body = (req.body ?? {}) as { akkoord?: unknown; opmerking?: unknown };
  if (typeof body.akkoord !== "boolean") {
    res.status(400).json({ fout: "Veld 'akkoord' (boolean) is verplicht." });
    return;
  }

  const beoordelaarId = req.session.userId;
  if (typeof beoordelaarId !== "number") {
    res.status(401).json({ fout: "Niet geauthenticeerd." });
    return;
  }

  const bestaand = await dbBeslissingStore.haalOpViaToken(token);
  if (!bestaand) {
    res.status(404).json({ fout: "Onbekend beslissingstoken." });
    return;
  }
  if (!magBijBeslissing(req, bestaand)) {
    res.status(403).json({ fout: "Onvoldoende bevoegdheid voor deze beslissing." });
    return;
  }

  const resultaat = await aiDecisionEngine.beoordeel(
    token,
    beoordelaarId,
    body.akkoord,
    typeof body.opmerking === "string" ? body.opmerking : null,
  );

  if (resultaat.status === "fout" && resultaat.foutmelding === "Onbekend beslissingstoken.") {
    res.status(404).json({ fout: resultaat.foutmelding });
    return;
  }

  res.json({
    status: resultaat.status,
    resultaat: resultaat.resultaat ?? null,
    human_approval_token: resultaat.humanApprovalToken ?? null,
    betrouwbaarheid: resultaat.betrouwbaarheid ?? null,
    controle_nodig: resultaat.controleNodig ?? null,
    foutmelding: resultaat.foutmelding ?? null,
  });
});

export default router;
