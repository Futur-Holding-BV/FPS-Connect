import { Router } from "express";
import { db } from "@workspace/db";
import { kantoorReleasesTable, releaseUpdateNotesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

function alleenHoofdbeheerder(
  req: Parameters<typeof requireAuth>[0],
  res: Parameters<typeof requireAuth>[1],
  next: Parameters<typeof requireAuth>[2],
) {
  const sessie = req.session as unknown as Record<string, unknown> | undefined;
  if (sessie?.["rol"] !== "hoofdbeheerder") {
    res.status(403).json({ fout: "Alleen toegankelijk voor de hoofdbeheerder." });
    return;
  }
  next();
}

function parseId(raw: string | string[] | undefined): number | null {
  const val = Array.isArray(raw) ? raw[0] : raw;
  const n = parseInt(val ?? "", 10);
  return isNaN(n) ? null : n;
}

// ── GET /kantoor-release/actief ───────────────────────────────────────────────

router.get("/kantoor-release/actief", requireAuth, async (_req, res) => {
  const [release] = await db
    .select()
    .from(kantoorReleasesTable)
    .where(eq(kantoorReleasesTable.isActief, true))
    .limit(1);

  if (!release) {
    res.status(404).json({ fout: "Geen actieve kantoorversie gevonden" });
    return;
  }

  const [notes] = await db
    .select()
    .from(releaseUpdateNotesTable)
    .where(eq(releaseUpdateNotesTable.releaseId, release.id))
    .limit(1);

  res.json({ release, notes: notes ?? null });
});

// ── GET /kantoor-release/releases ─────────────────────────────────────────────

router.get("/kantoor-release/releases", requireAuth, alleenHoofdbeheerder, async (_req, res) => {
  const releases = await db
    .select()
    .from(kantoorReleasesTable)
    .orderBy(desc(kantoorReleasesTable.aangemaaktOp));

  res.json(releases);
});

// ── GET /kantoor-release/releases/:id ─────────────────────────────────────────

router.get("/kantoor-release/releases/:id", requireAuth, alleenHoofdbeheerder, async (req, res) => {
  const id = parseId(req.params["id"]);
  if (id === null) { res.status(400).json({ fout: "Ongeldig id" }); return; }

  const [release] = await db
    .select()
    .from(kantoorReleasesTable)
    .where(eq(kantoorReleasesTable.id, id))
    .limit(1);

  if (!release) { res.status(404).json({ fout: "Niet gevonden" }); return; }

  const [notes] = await db
    .select()
    .from(releaseUpdateNotesTable)
    .where(eq(releaseUpdateNotesTable.releaseId, id))
    .limit(1);

  res.json({ release, notes: notes ?? null });
});

// ── POST /kantoor-release/releases ────────────────────────────────────────────

router.post("/kantoor-release/releases", requireAuth, alleenHoofdbeheerder, async (req, res) => {
  const sessie = req.session as unknown as Record<string, unknown> | undefined;
  const body = req.body as Record<string, string>;
  const { versienummer, label, samenvatting, commitInfo, dbVersie, bekendeBeperkingenJson,
          toegevoegd, verbeterd, opgelost, beveiliging, bekendeProblemen, instructies } = body;

  if (!versienummer?.trim() || !label?.trim()) {
    res.status(400).json({ fout: "versienummer en label zijn verplicht" });
    return;
  }

  const [release] = await db
    .insert(kantoorReleasesTable)
    .values({
      versienummer: versienummer.trim(),
      label: label.trim(),
      samenvatting: samenvatting?.trim() ?? null,
      status: "concept",
      commitInfo: commitInfo?.trim() ?? null,
      dbVersie: dbVersie?.trim() ?? null,
      bekendeBeperkingenJson: bekendeBeperkingenJson ?? null,
      vrijgegevenDoor: (sessie?.["gebruikerId"] as number | null) ?? null,
      vrijgegevenDoorNaam: (sessie?.["naam"] as string | null) ?? "Onbekend",
    })
    .returning();

  if (toegevoegd || verbeterd || opgelost || beveiliging || bekendeProblemen || instructies) {
    await db.insert(releaseUpdateNotesTable).values({
      releaseId: release.id,
      toegevoegd: toegevoegd ?? null,
      verbeterd: verbeterd ?? null,
      opgelost: opgelost ?? null,
      beveiliging: beveiliging ?? null,
      bekendeProblemen: bekendeProblemen ?? null,
      instructies: instructies ?? null,
    });
  }

  res.status(201).json(release);
});

// ── PATCH /kantoor-release/releases/:id ───────────────────────────────────────

router.patch("/kantoor-release/releases/:id", requireAuth, alleenHoofdbeheerder, async (req, res) => {
  const id = parseId(req.params["id"]);
  if (id === null) { res.status(400).json({ fout: "Ongeldig id" }); return; }

  const body = req.body as Record<string, unknown>;

  await db
    .update(kantoorReleasesTable)
    .set({
      buildGeslaagd: typeof body["buildGeslaagd"] === "boolean" ? body["buildGeslaagd"] : undefined,
      testsGeslaagd: typeof body["testsGeslaagd"] === "boolean" ? body["testsGeslaagd"] : undefined,
      releaseReadinessAkkoord: typeof body["releaseReadinessAkkoord"] === "boolean" ? body["releaseReadinessAkkoord"] : undefined,
      dbWijzigingenGecontroleerd: typeof body["dbWijzigingenGecontroleerd"] === "boolean" ? body["dbWijzigingenGecontroleerd"] : undefined,
      releaseNotesAangemaakt: typeof body["releaseNotesAangemaakt"] === "boolean" ? body["releaseNotesAangemaakt"] : undefined,
      geenKritiekeFouten: typeof body["geenKritiekeFouten"] === "boolean" ? body["geenKritiekeFouten"] : undefined,
      samenvatting: typeof body["samenvatting"] === "string" ? body["samenvatting"] : undefined,
      bekendeBeperkingenJson: typeof body["bekendeBeperkingenJson"] === "string" ? body["bekendeBeperkingenJson"] : undefined,
      commitInfo: typeof body["commitInfo"] === "string" ? body["commitInfo"] : undefined,
      dbVersie: typeof body["dbVersie"] === "string" ? body["dbVersie"] : undefined,
    })
    .where(eq(kantoorReleasesTable.id, id));

  const existing = await db
    .select({ id: releaseUpdateNotesTable.id })
    .from(releaseUpdateNotesTable)
    .where(eq(releaseUpdateNotesTable.releaseId, id))
    .limit(1);

  const notesPayload = {
    toegevoegd: typeof body["toegevoegd"] === "string" ? body["toegevoegd"] : null,
    verbeterd: typeof body["verbeterd"] === "string" ? body["verbeterd"] : null,
    opgelost: typeof body["opgelost"] === "string" ? body["opgelost"] : null,
    beveiliging: typeof body["beveiliging"] === "string" ? body["beveiliging"] : null,
    bekendeProblemen: typeof body["bekendeProblemen"] === "string" ? body["bekendeProblemen"] : null,
    instructies: typeof body["instructies"] === "string" ? body["instructies"] : null,
  };

  if (existing.length > 0) {
    await db
      .update(releaseUpdateNotesTable)
      .set(notesPayload)
      .where(eq(releaseUpdateNotesTable.releaseId, id));
  } else if (Object.values(notesPayload).some(v => v !== null)) {
    await db.insert(releaseUpdateNotesTable).values({ releaseId: id, ...notesPayload });
  }

  res.json({ ok: true });
});

// ── POST /kantoor-release/releases/:id/vrijgeven ──────────────────────────────

router.post("/kantoor-release/releases/:id/vrijgeven", requireAuth, alleenHoofdbeheerder, async (req, res) => {
  const id = parseId(req.params["id"]);
  if (id === null) { res.status(400).json({ fout: "Ongeldig id" }); return; }

  const sessie = req.session as unknown as Record<string, unknown> | undefined;

  const [release] = await db
    .select()
    .from(kantoorReleasesTable)
    .where(eq(kantoorReleasesTable.id, id))
    .limit(1);

  if (!release) { res.status(404).json({ fout: "Niet gevonden" }); return; }

  const checks = [
    release.buildGeslaagd,
    release.testsGeslaagd,
    release.releaseReadinessAkkoord,
    release.dbWijzigingenGecontroleerd,
    release.releaseNotesAangemaakt,
    release.geenKritiekeFouten,
  ];

  if (checks.some(c => c !== true)) {
    res.status(409).json({
      fout: "Niet alle acceptatiechecks zijn groen. Vul eerst alle checks in.",
      checks: {
        buildGeslaagd: release.buildGeslaagd,
        testsGeslaagd: release.testsGeslaagd,
        releaseReadinessAkkoord: release.releaseReadinessAkkoord,
        dbWijzigingenGecontroleerd: release.dbWijzigingenGecontroleerd,
        releaseNotesAangemaakt: release.releaseNotesAangemaakt,
        geenKritiekeFouten: release.geenKritiekeFouten,
      },
    });
    return;
  }

  const [huidigeActieve] = await db
    .select({ id: kantoorReleasesTable.id })
    .from(kantoorReleasesTable)
    .where(eq(kantoorReleasesTable.isActief, true))
    .limit(1);

  await db
    .update(kantoorReleasesTable)
    .set({ isActief: false, status: "vervangen" })
    .where(eq(kantoorReleasesTable.isActief, true));

  await db
    .update(kantoorReleasesTable)
    .set({
      isActief: true,
      status: "vrijgegeven",
      vrijgegevenOp: new Date(),
      vrijgegevenDoor: (sessie?.["gebruikerId"] as number | null) ?? null,
      vrijgegevenDoorNaam: (sessie?.["naam"] as string | null) ?? "Onbekend",
      vorigeVersieId: huidigeActieve?.id ?? null,
    })
    .where(eq(kantoorReleasesTable.id, id));

  res.json({ ok: true, versienummer: release.versienummer });
});

// ── POST /kantoor-release/releases/:id/rollback ───────────────────────────────

router.post("/kantoor-release/releases/:id/rollback", requireAuth, alleenHoofdbeheerder, async (req, res) => {
  const id = parseId(req.params["id"]);
  if (id === null) { res.status(400).json({ fout: "Ongeldig id" }); return; }

  const sessie = req.session as unknown as Record<string, unknown> | undefined;

  const [doelRelease] = await db
    .select()
    .from(kantoorReleasesTable)
    .where(eq(kantoorReleasesTable.id, id))
    .limit(1);

  if (!doelRelease) { res.status(404).json({ fout: "Niet gevonden" }); return; }

  await db
    .update(kantoorReleasesTable)
    .set({ isActief: false, status: "teruggedraaid" })
    .where(eq(kantoorReleasesTable.isActief, true));

  await db
    .update(kantoorReleasesTable)
    .set({
      isActief: true,
      status: "vrijgegeven",
      vrijgegevenOp: new Date(),
      vrijgegevenDoor: (sessie?.["gebruikerId"] as number | null) ?? null,
      vrijgegevenDoorNaam: (sessie?.["naam"] as string | null) ?? "Onbekend",
    })
    .where(eq(kantoorReleasesTable.id, id));

  res.json({ ok: true, versienummer: doelRelease.versienummer, actie: "rollback" });
});

export default router;
