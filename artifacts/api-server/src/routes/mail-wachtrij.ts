import { Router } from "express";
import { db, mailWachtrijTable, gebruikersTable } from "@workspace/db";
import { count, desc, eq, inArray } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import {
  verstuurMailWachtrijItem,
  wijsMailWachtrijItemAf,
  herstelVastgelopenMailWachtrijItems,
  MailFout,
} from "../services/email";
import { logger } from "../lib/logger";

// Mail-wachtrij: alle systeem-/notificatiemails wachten hier op een expliciete
// menselijke handeling (versturen of afwijzen). Beheer via gebruikers-niveau 4.
const router = Router();
const alleenBeheerder = requireBevoegdheid("gebruikers", 4);

function sessieUserId(req: { session?: { userId?: number } }): number {
  return req.session?.userId ?? 0;
}

// CSRF-bescherming voor cookie-geauthenticeerde mutaties: browsers sturen bij
// cross-site POSTs altijd een Origin-header mee; die moet overeenkomen met de
// host van dit verzoek. Verzoeken zonder Origin én Referer (curl, scripts met
// bearer) worden toegestaan — die dragen geen sessiecookie-CSRF-risico.
import type { Request, Response, NextFunction } from "express";
function eisSameOrigin(req: Request, res: Response, next: NextFunction): void {
  const bron = req.get("origin") ?? req.get("referer");
  if (!bron) return void next();
  try {
    const bronHost = new URL(bron).host;
    const eigenHost = req.get("host") ?? "";
    if (bronHost === eigenHost) return void next();
  } catch {
    // Ongeldige Origin/Referer → weigeren (fail-closed)
  }
  res.status(403).json({ error: "Verzoek geweigerd: ongeldige herkomst (CSRF)" });
}

router.get("/mail-wachtrij", alleenBeheerder, async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const geldig = ["wachtend", "verzenden", "verzonden", "afgewezen", "mislukt"];
  const rijen = await db
    .select({
      id: mailWachtrijTable.id,
      naarEmail: mailWachtrijTable.naarEmail,
      naarNaam: mailWachtrijTable.naarNaam,
      onderwerp: mailWachtrijTable.onderwerp,
      html: mailWachtrijTable.html,
      soort: mailWachtrijTable.soort,
      status: mailWachtrijTable.status,
      foutdetail: mailWachtrijTable.foutdetail,
      aangemaaktOp: mailWachtrijTable.aangemaaktOp,
      verwerktOp: mailWachtrijTable.verwerktOp,
      verwerktDoorId: mailWachtrijTable.verwerktDoorId,
    })
    .from(mailWachtrijTable)
    .where(
      status && geldig.includes(status)
        ? eq(mailWachtrijTable.status, status)
        : inArray(mailWachtrijTable.status, geldig),
    )
    .orderBy(desc(mailWachtrijTable.aangemaaktOp))
    .limit(200);

  const verwerkerIds = [...new Set(rijen.map((r) => r.verwerktDoorId).filter((v): v is number => v != null))];
  const verwerkers = verwerkerIds.length
    ? await db
        .select({ id: gebruikersTable.id, naam: gebruikersTable.naam })
        .from(gebruikersTable)
        .where(inArray(gebruikersTable.id, verwerkerIds))
    : [];
  const naamVan = new Map(verwerkers.map((v) => [v.id, v.naam]));

  res.json(
    rijen.map((r) => ({
      id: r.id,
      naar_email: r.naarEmail,
      naar_naam: r.naarNaam,
      onderwerp: r.onderwerp,
      html: r.html,
      soort: r.soort,
      status: r.status,
      foutdetail: r.foutdetail,
      aangemaakt_op: r.aangemaaktOp?.toISOString() ?? null,
      verwerkt_op: r.verwerktOp?.toISOString() ?? null,
      verwerkt_door_naam: r.verwerktDoorId != null ? (naamVan.get(r.verwerktDoorId) ?? null) : null,
    })),
  );
});

// Herstel-endpoint: triggert de herstelroutine voor vastgelopen items.
// Staat vóór de /:id-routes zodat "herstel-vastgelopen" niet als id geparsed wordt.
// Bruikbaar als handmatige trigger (beheerder) én in bewijsscripts.
router.post("/mail-wachtrij/herstel-vastgelopen", eisSameOrigin, alleenBeheerder, async (_req, res) => {
  const aantalHersteld = await herstelVastgelopenMailWachtrijItems();
  res.json({ aantalHersteld });
});

// Telling-endpoint: aantal wachtende mails — voor de sidebar-badge.
// Staat vóór de /:id-routes zodat "telling" niet als id wordt geparsed.
router.get("/mail-wachtrij/telling", alleenBeheerder, async (_req, res) => {
  const [rij] = await db
    .select({ aantal: count() })
    .from(mailWachtrijTable)
    .where(eq(mailWachtrijTable.status, "wachtend"));
  res.json({ aantal: rij?.aantal ?? 0 });
});

router.post("/mail-wachtrij/:id/verstuur", eisSameOrigin, alleenBeheerder, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return void res.status(400).json({ error: "Ongeldig id" });
  try {
    await verstuurMailWachtrijItem(id, sessieUserId(req));
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof MailFout) {
      return void res.status(502).json({ error: err.message });
    }
    const melding = err instanceof Error ? err.message : "Onbekende fout";
    const isConflict = melding.includes("al verwerkt") || melding.includes("al verzonden");
    logger.warn({ id, fout: melding }, "Mail-wachtrij versturen mislukt");
    res.status(isConflict ? 409 : melding.includes("niet gevonden") ? 404 : 500).json({ error: melding });
  }
});

router.post("/mail-wachtrij/:id/afwijzen", eisSameOrigin, alleenBeheerder, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return void res.status(400).json({ error: "Ongeldig id" });
  try {
    await wijsMailWachtrijItemAf(id, sessieUserId(req));
    res.json({ ok: true });
  } catch (err) {
    const melding = err instanceof Error ? err.message : "Onbekende fout";
    res.status(melding.includes("niet gevonden") ? 404 : melding.includes("al verzonden") ? 409 : 500).json({ error: melding });
  }
});

export default router;
