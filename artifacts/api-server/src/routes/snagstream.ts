import { Router } from "express";
import type { Request, Response } from "express";
import { createHash, randomUUID } from "crypto";
import { SNAGSTREAM_RAPPORT_ANALYSE_PROMPT } from "../lib/aiPrompts";
import { normaliseerStorageUrl } from "../lib/storageObjectsUrl";
import {
  db,
  snagstreamRapportenTable,
  snagstreamSnagsTable,
  snagstreamUploadsTable,
  gebouwenTable,
  gebruikersTable,
  voorzieningenTable,
} from "@workspace/db";
import { eq, and, desc, sql, or, ilike, inArray, isNull, lt, gt, type SQL } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { ObjectStorageService } from "../lib/objectStorage";
import { ObjectNotFoundError } from "../lib/objectStorageTypes";
import { aiGateway } from "../lib/aiGateway";
import { logger } from "../lib/logger";
import { effectieveContext, magBijGebouw, toegewezenGebouwIds } from "../utils/rol";

const router = Router();
const objectStorage = new ObjectStorageService();
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const MAX_PDF_BYTES = 100 * 1024 * 1024;
const UPLOAD_TTL_MS = 30 * 60 * 1000;
const UPLOAD_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;
const SNAGSTREAM_OBJECT_PREFIX = "/objects/snagstream/";

type RapportRij = typeof snagstreamRapportenTable.$inferSelect;
type ZoekTreffer = {
  snag_id: number;
  snagnummer: string | null;
  ruimte: string | null;
  verdieping: string | null;
  omschrijving: string | null;
  pdf_pagina: number | null;
};

// ── Sessie helper ─────────────────────────────────────────────────────────────
function sessionUserId(req: Request): number | null {
  return req.session.userId ?? null;
}

// ── Helper: param → integer ───────────────────────────────────────────────────
function paramInt(val: unknown): number {
  return parseInt(String(val), 10);
}

function storageObjectPad(pdfUrl: string): string {
  const genormaliseerd = normaliseerStorageUrl(pdfUrl);
  const prefix = "/api/storage/objects/";
  if (genormaliseerd.startsWith(prefix)) {
    return `/objects/${genormaliseerd.slice(prefix.length)}`;
  }
  return genormaliseerd;
}

async function berekenVingerafdruk(pdfUrl: string): Promise<string> {
  const bestand = await objectStorage.getObjectEntityFile(storageObjectPad(pdfUrl));
  const hash = createHash("sha256");
  for await (const deel of bestand.createReadStream() as AsyncIterable<Buffer | string>) {
    hash.update(deel);
  }
  return hash.digest("hex");
}

async function inspecteerPdf(pdfUrl: string): Promise<{ vingerafdruk: string; grootte: number }> {
  const bestand = await objectStorage.getObjectEntityFile(storageObjectPad(pdfUrl));
  const [metadata] = await bestand.getMetadata();
  const grootte = Number(metadata.size ?? 0);
  if (!Number.isFinite(grootte) || grootte <= 0 || grootte > MAX_PDF_BYTES) {
    throw new Error("Ongeldige PDF-bestandsgrootte");
  }
  if (metadata.contentType !== "application/pdf") {
    throw new Error("Bestand heeft niet het MIME-type application/pdf");
  }
  const hash = createHash("sha256");
  let kop = Buffer.alloc(0);
  for await (const deel of bestand.createReadStream() as AsyncIterable<Buffer | string>) {
    const buffer = Buffer.isBuffer(deel) ? deel : Buffer.from(deel);
    hash.update(buffer);
    if (kop.length < 5) kop = Buffer.concat([kop, buffer.subarray(0, 5 - kop.length)]);
  }
  if (kop.toString("ascii") !== "%PDF-") {
    throw new Error("Bestand heeft geen geldige PDF-signatuur");
  }
  return { vingerafdruk: hash.digest("hex"), grootte };
}

type OpruimLogger = Pick<typeof logger, "warn" | "info" | "error">;

async function probeerObjectTeVerwijderen(
  log: OpruimLogger,
  pdfUrl: string,
): Promise<{ gelukt: true } | { gelukt: false; fout: string }> {
  const objectPad = storageObjectPad(pdfUrl);
  if (!objectPad.startsWith(SNAGSTREAM_OBJECT_PREFIX)) {
    log.warn(
      { objectPad },
      "Legacy of niet-verifieerbaar Snagstream-object niet uit opslag verwijderd",
    );
    return { gelukt: true };
  }
  try {
    await objectStorage.deleteObjectEntity(objectPad);
    return { gelukt: true };
  } catch (fout) {
    const code = (fout as { code?: number | string } | null)?.code;
    if (
      fout instanceof ObjectNotFoundError ||
      code === 404 ||
      code === "404" ||
      code === "NoSuchKey"
    ) {
      return { gelukt: true };
    }
    const fouttekst = fout instanceof Error ? fout.message : String(fout);
    log.warn({ err: fout, objectPad }, "Snagstream-object opruimen mislukt; retry blijft geregistreerd");
    return { gelukt: false, fout: fouttekst.slice(0, 1000) };
  }
}

async function ruimVerlopenUploadsOp(log: OpruimLogger): Promise<void> {
  const verlopen = await db
    .select()
    .from(snagstreamUploadsTable)
    .where(lt(snagstreamUploadsTable.verlooptOp, new Date()));
  for (const upload of verlopen) {
    const resultaat = await probeerObjectTeVerwijderen(log, upload.objectPath);
    if (resultaat.gelukt) {
      await db.delete(snagstreamUploadsTable).where(eq(snagstreamUploadsTable.id, upload.id));
    } else {
      await db
        .update(snagstreamUploadsTable)
        .set({
          opruimPogingen: sql`${snagstreamUploadsTable.opruimPogingen} + 1`,
          opruimLaatstGeprobeerdOp: new Date(),
          opruimFout: resultaat.fout,
        })
        .where(eq(snagstreamUploadsTable.id, upload.id));
    }
  }
}

async function verwijderPendingUpload(req: Request, upload: typeof snagstreamUploadsTable.$inferSelect): Promise<void> {
  await db
    .update(snagstreamUploadsTable)
    .set({ verlooptOp: new Date() })
    .where(eq(snagstreamUploadsTable.id, upload.id));
  await ruimVerlopenUploadsOp(req.log);
}

setTimeout(() => {
  void ruimVerlopenUploadsOp(logger).catch((fout) => {
    logger.error({ err: fout }, "Eerste Snagstream upload-opruiming mislukt");
  });
}, 30_000).unref();

setInterval(() => {
  void ruimVerlopenUploadsOp(logger).catch((fout) => {
    logger.error({ err: fout }, "Periodieke Snagstream upload-opruiming mislukt");
  });
}, UPLOAD_CLEANUP_INTERVAL_MS).unref();

async function rapportScopeVoorwaarde(req: Request): Promise<SQL | undefined> {
  const { userId, beperkt } = await effectieveContext(req);
  if (!beperkt) return undefined;
  const gebouwIds = await toegewezenGebouwIds(userId);
  const eigenOngekoppeld = and(
    isNull(snagstreamRapportenTable.gebouwId),
    eq(snagstreamRapportenTable.uploaderId, userId),
  );
  return gebouwIds.length > 0
    ? or(inArray(snagstreamRapportenTable.gebouwId, gebouwIds), eigenOngekoppeld)
    : eigenOngekoppeld;
}

async function magRapportZien(req: Request, rapport: RapportRij): Promise<boolean> {
  if (rapport.gebouwId != null) return magBijGebouw(req, rapport.gebouwId);
  const { userId, beperkt } = await effectieveContext(req);
  return !beperkt || rapport.uploaderId === userId;
}

async function haalRapportBinnenScope(req: Request, id: number): Promise<RapportRij | null> {
  const [rapport] = await db
    .select()
    .from(snagstreamRapportenTable)
    .where(eq(snagstreamRapportenTable.id, id))
    .limit(1);
  if (!rapport || !(await magRapportZien(req, rapport))) return null;
  return rapport;
}

// ── Helper: rapport met gebouwnaam + snag_count ────────────────────────────
async function mapRapport(r: RapportRij, zoekTreffers: ZoekTreffer[] = [], uploadDubbel = false) {
  const [gebouw] = r.gebouwId
    ? await db.select({ naam: gebouwenTable.naam }).from(gebouwenTable).where(eq(gebouwenTable.id, r.gebouwId)).limit(1)
    : [null];
  const [uploader] = r.uploaderId
    ? await db.select({ naam: gebruikersTable.naam }).from(gebruikersTable).where(eq(gebruikersTable.id, r.uploaderId)).limit(1)
    : [null];
  const [count] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(snagstreamSnagsTable)
    .where(eq(snagstreamSnagsTable.rapportId, r.id));
  return {
    ...r,
    gebouw_naam: gebouw?.naam ?? null,
    uploader_naam: uploader?.naam ?? null,
    snag_count: count?.c ?? 0,
    aangemaakt_op: r.aangemaaktOp.toISOString(),
    bijgewerkt_op: r.bijgewerktOp.toISOString(),
    pdf_url: r.pdfUrl,
    project_naam: r.projectNaam,
    gebouw_id: r.gebouwId,
    uploader_id: r.uploaderId,
    ai_metadata: r.aiMetadata,
    vingerafdruk: r.vingerafdruk,
    zoek_treffers: zoekTreffers,
    upload_dubbel: uploadDubbel,
  };
}

// POST /snagstream/upload-url — presigned upload URL voor PDF
router.post("/snagstream/upload-url", requireBevoegdheid("gebouwen", 2), async (req: Request, res: Response): Promise<void> => {
  const { bestandsnaam, bestandsgrootte, vingerafdruk } = req.body as {
    bestandsnaam?: string;
    bestandsgrootte?: number;
    vingerafdruk?: string;
  };
  if (
    !bestandsnaam?.toLowerCase().endsWith(".pdf") ||
    !Number.isInteger(bestandsgrootte) ||
    (bestandsgrootte ?? 0) <= 0 ||
    (bestandsgrootte ?? 0) > MAX_PDF_BYTES ||
    !vingerafdruk ||
    !SHA256_PATTERN.test(vingerafdruk)
  ) {
    return void res.status(400).json({ error: "Geldige PDF-naam, bestandsgrootte en SHA-256-vingerafdruk zijn verplicht" });
  }
  const gebruikerId = sessionUserId(req);
  if (!gebruikerId) return void res.status(401).json({ error: "Niet ingelogd" });
  try {
    await ruimVerlopenUploadsOp(req.log);
    const { uploadURL, objectPath } = await objectStorage.getObjectEntityUploadURL(
      null,
      "rapport",
      "snagstream",
    );
    const token = randomUUID();
    await db.insert(snagstreamUploadsTable).values({
      token,
      objectPath,
      bestandsnaam: bestandsnaam.trim(),
      vingerafdruk,
      bestandsgrootte: bestandsgrootte!,
      gebruikerId,
      verlooptOp: new Date(Date.now() + UPLOAD_TTL_MS),
    });
    return void res.json({ upload_url: uploadURL, object_path: objectPath, upload_token: token });
  } catch (err) {
    req.log.error(err);
    return void res.status(500).json({ error: "Upload URL aanvragen mislukt" });
  }
});

// POST /snagstream/uploads/:token/annuleren — eigen tijdelijke upload direct opruimen
router.post(
  "/snagstream/uploads/:token/annuleren",
  requireBevoegdheid("gebouwen", 2),
  async (req: Request, res: Response): Promise<void> => {
    const gebruikerId = sessionUserId(req);
    if (!gebruikerId) return void res.status(401).json({ error: "Niet ingelogd" });
    const token = String(req.params.token ?? "").trim();
    if (!token) return void res.status(400).json({ error: "Uploadtoken is verplicht" });

    try {
      const pending = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${token}, 0))`);
        const [actieveUpload] = await tx
          .select()
          .from(snagstreamUploadsTable)
          .where(and(
            eq(snagstreamUploadsTable.token, token),
            eq(snagstreamUploadsTable.gebruikerId, gebruikerId),
          ))
          .limit(1);
        if (!actieveUpload) return null;
        await tx
          .update(snagstreamUploadsTable)
          .set({ verlooptOp: new Date() })
          .where(eq(snagstreamUploadsTable.id, actieveUpload.id));
        return actieveUpload;
      });
      if (!pending) return void res.status(204).send();

      await ruimVerlopenUploadsOp(req.log);
      const [achtergebleven] = await db
        .select({ id: snagstreamUploadsTable.id })
        .from(snagstreamUploadsTable)
        .where(eq(snagstreamUploadsTable.id, pending.id))
        .limit(1);
      if (achtergebleven) {
        return void res.status(502).json({
          error: "Tijdelijke upload kon niet direct worden opgeruimd; probeer het opnieuw",
        });
      }
      return void res.status(204).send();
    } catch (err) {
      req.log.error(err);
      return void res.status(500).json({ error: "Tijdelijke upload annuleren mislukt" });
    }
  },
);

// GET /snagstream/rapporten — archief ophalen
router.get("/snagstream/rapporten", requireBevoegdheid("gebouwen", 1), async (req: Request, res: Response): Promise<void> => {
  const rawGebouwId = req.query["gebouw_id"];
  const gebouwId = rawGebouwId ? parseInt(String(rawGebouwId), 10) : null;
  const zoek = String(req.query["zoek"] ?? "").trim();
  const status = String(req.query["status"] ?? "").trim();
  const jaar = Number(req.query["jaar"] ?? 0);
  const voorwaarden: SQL[] = [];
  const scope = await rapportScopeVoorwaarde(req);
  if (scope) voorwaarden.push(scope);
  if (gebouwId) voorwaarden.push(eq(snagstreamRapportenTable.gebouwId, gebouwId));
  if (status) voorwaarden.push(eq(snagstreamRapportenTable.status, status));
  if (Number.isInteger(jaar) && jaar >= 1900 && jaar <= 2200) {
    voorwaarden.push(sql`coalesce(
      nullif(substring(${snagstreamRapportenTable.rapportdatum} from 1 for 4), ''),
      to_char(${snagstreamRapportenTable.aangemaaktOp}, 'YYYY')
    ) = ${String(jaar)}`);
  }
  if (zoek) {
    const patroon = `%${zoek}%`;
    voorwaarden.push(sql`(
      ${snagstreamRapportenTable.bestandsnaam} ilike ${patroon}
      or coalesce(${snagstreamRapportenTable.opdrachtgever}, '') ilike ${patroon}
      or coalesce(${snagstreamRapportenTable.projectNaam}, '') ilike ${patroon}
      or exists (
        select 1 from ${gebouwenTable}
        where ${gebouwenTable.id} = ${snagstreamRapportenTable.gebouwId}
          and ${gebouwenTable.naam} ilike ${patroon}
      )
      or exists (
        select 1 from ${snagstreamSnagsTable}
        where ${snagstreamSnagsTable.rapportId} = ${snagstreamRapportenTable.id}
          and (
            coalesce(${snagstreamSnagsTable.snagnummer}, '') ilike ${patroon}
            or coalesce(${snagstreamSnagsTable.ruimte}, '') ilike ${patroon}
            or coalesce(${snagstreamSnagsTable.verdieping}, '') ilike ${patroon}
            or coalesce(${snagstreamSnagsTable.omschrijving}, '') ilike ${patroon}
          )
      )
    )`);
  }
  const rijen = await db
    .select()
    .from(snagstreamRapportenTable)
    .where(voorwaarden.length > 0 ? and(...voorwaarden) : undefined)
    .orderBy(desc(snagstreamRapportenTable.aangemaaktOp));
  const patroon = zoek ? `%${zoek}%` : null;
  const mapped = await Promise.all(rijen.map(async (rapport) => {
    if (!patroon) return mapRapport(rapport);
    const treffers = await db
      .select({
        snag_id: snagstreamSnagsTable.id,
        snagnummer: snagstreamSnagsTable.snagnummer,
        ruimte: snagstreamSnagsTable.ruimte,
        verdieping: snagstreamSnagsTable.verdieping,
        omschrijving: snagstreamSnagsTable.omschrijving,
        pdf_pagina: snagstreamSnagsTable.pdfPagina,
      })
      .from(snagstreamSnagsTable)
      .where(and(
        eq(snagstreamSnagsTable.rapportId, rapport.id),
        or(
          ilike(snagstreamSnagsTable.snagnummer, patroon),
          ilike(snagstreamSnagsTable.ruimte, patroon),
          ilike(snagstreamSnagsTable.verdieping, patroon),
          ilike(snagstreamSnagsTable.omschrijving, patroon),
        ),
      ))
      .orderBy(snagstreamSnagsTable.id);
    return mapRapport(rapport, treffers);
  }));
  return void res.json(mapped);
});

// POST /snagstream/controleer-upload — voorkom opslag van een inhoudsdubbel
router.post("/snagstream/controleer-upload", requireBevoegdheid("gebouwen", 2), async (req: Request, res: Response): Promise<void> => {
  const { bestandsnaam, vingerafdruk } = req.body as { bestandsnaam?: string; vingerafdruk?: string };
  if (!bestandsnaam?.trim() || !vingerafdruk || !SHA256_PATTERN.test(vingerafdruk)) {
    return void res.status(400).json({ error: "Geldige bestandsnaam en SHA-256-vingerafdruk zijn verplicht" });
  }
  const scope = await rapportScopeVoorwaarde(req);
  const [exact] = await db
    .select()
    .from(snagstreamRapportenTable)
    .where(and(
      eq(snagstreamRapportenTable.vingerafdruk, vingerafdruk),
      scope,
    ))
    .orderBy(snagstreamRapportenTable.id)
    .limit(1);
  const naamconflicten = await db
    .select()
    .from(snagstreamRapportenTable)
    .where(and(
      sql`lower(${snagstreamRapportenTable.bestandsnaam}) = lower(${bestandsnaam.trim()})`,
      scope,
    ))
    .orderBy(desc(snagstreamRapportenTable.aangemaaktOp));
  if (exact) {
    return void res.json({
      uitkomst: "exact_dubbel",
      bestaand_rapport: await mapRapport(exact),
      naamconflicten: await Promise.all(naamconflicten.map((r) => mapRapport(r))),
    });
  }
  return void res.json({
    uitkomst: naamconflicten.length > 0 ? "naamconflict" : "nieuw",
    bestaand_rapport: null,
    naamconflicten: await Promise.all(naamconflicten.map((r) => mapRapport(r))),
  });
});

// GET /snagstream/dubbele-rapporten — zichtbare opruimlijst na backfill
router.get("/snagstream/dubbele-rapporten", requireBevoegdheid("gebouwen", 1), async (req: Request, res: Response): Promise<void> => {
  const scope = await rapportScopeVoorwaarde(req);
  const rijen = await db
    .select()
    .from(snagstreamRapportenTable)
    .where(and(sql`${snagstreamRapportenTable.vingerafdruk} is not null`, scope))
    .orderBy(desc(snagstreamRapportenTable.aangemaaktOp));
  const groepen = new Map<string, RapportRij[]>();
  for (const rapport of rijen) {
    if (!rapport.vingerafdruk) continue;
    groepen.set(rapport.vingerafdruk, [...(groepen.get(rapport.vingerafdruk) ?? []), rapport]);
  }
  const dubbelen = await Promise.all([...groepen.entries()]
    .filter(([, rapporten]) => rapporten.length > 1)
    .map(async ([vingerafdruk, rapporten]) => ({
      vingerafdruk,
      rapporten: await Promise.all(rapporten.map((r) => mapRapport(r))),
    })));
  return void res.json(dubbelen);
});

// POST /snagstream/vingerafdrukken-aanvullen — bestaande PDF's eenmalig hashen
router.post("/snagstream/vingerafdrukken-aanvullen", requireBevoegdheid("gebouwen", 2), async (req: Request, res: Response): Promise<void> => {
  const scope = await rapportScopeVoorwaarde(req);
  const rijen = await db
    .select()
    .from(snagstreamRapportenTable)
    .where(and(isNull(snagstreamRapportenTable.vingerafdruk), scope))
    .orderBy(snagstreamRapportenTable.id);
  let aangevuld = 0;
  let mislukt = 0;
  for (const rapport of rijen) {
    try {
      const vingerafdruk = await berekenVingerafdruk(rapport.pdfUrl);
      await db
        .update(snagstreamRapportenTable)
        .set({ vingerafdruk, bijgewerktOp: new Date() })
        .where(and(
          eq(snagstreamRapportenTable.id, rapport.id),
          isNull(snagstreamRapportenTable.vingerafdruk),
        ));
      aangevuld += 1;
    } catch (fout) {
      mislukt += 1;
      req.log.warn({ err: fout, rapportId: rapport.id }, "Snagstream-vingerafdruk aanvullen mislukt");
    }
  }
  return void res.json({ aangevuld, mislukt });
});

// GET /snagstream/gebouwen-overzicht — ongekoppeld staat bewust als eerste groep
router.get("/snagstream/gebouwen-overzicht", requireBevoegdheid("gebouwen", 1), async (req: Request, res: Response): Promise<void> => {
  const scope = await rapportScopeVoorwaarde(req);
  const rijen = await db
    .select({
      rapport: snagstreamRapportenTable,
      gebouwNaam: gebouwenTable.naam,
      snagCount: sql<number>`count(${snagstreamSnagsTable.id})::int`,
    })
    .from(snagstreamRapportenTable)
    .leftJoin(gebouwenTable, eq(gebouwenTable.id, snagstreamRapportenTable.gebouwId))
    .leftJoin(snagstreamSnagsTable, eq(snagstreamSnagsTable.rapportId, snagstreamRapportenTable.id))
    .where(scope)
    .groupBy(snagstreamRapportenTable.id, gebouwenTable.naam)
    .orderBy(desc(snagstreamRapportenTable.aangemaaktOp));
  const groepen = new Map<string, {
    gebouw_id: number | null;
    gebouw_naam: string;
    rapport_count: number;
    snag_count: number;
    recentste_rapportdatum: string | null;
  }>();
  for (const rij of rijen) {
    const sleutel = rij.rapport.gebouwId == null ? "ongekoppeld" : String(rij.rapport.gebouwId);
    const bestaand = groepen.get(sleutel);
    const datum = rij.rapport.rapportdatum ?? rij.rapport.aangemaaktOp.toISOString();
    if (!bestaand) {
      groepen.set(sleutel, {
        gebouw_id: rij.rapport.gebouwId,
        gebouw_naam: rij.gebouwNaam ?? "Nog niet gekoppeld",
        rapport_count: 1,
        snag_count: rij.snagCount,
        recentste_rapportdatum: datum,
      });
    } else {
      bestaand.rapport_count += 1;
      bestaand.snag_count += rij.snagCount;
      if (!bestaand.recentste_rapportdatum || datum > bestaand.recentste_rapportdatum) {
        bestaand.recentste_rapportdatum = datum;
      }
    }
  }
  const resultaat = [...groepen.values()].sort((a, b) => {
    if (a.gebouw_id == null) return -1;
    if (b.gebouw_id == null) return 1;
    return a.gebouw_naam.localeCompare(b.gebouw_naam, "nl");
  });
  return void res.json(resultaat);
});

// POST /snagstream/rapporten — rapport toevoegen
router.post("/snagstream/rapporten", requireBevoegdheid("gebouwen", 2), async (req: Request, res: Response): Promise<void> => {
  const { bestandsnaam, upload_token, vingerafdruk, naamconflict_bevestigd, rapportdatum, opdrachtgever, project_naam, gebouw_id } = req.body as {
    bestandsnaam?: string; upload_token?: string; rapportdatum?: string; opdrachtgever?: string;
    project_naam?: string; gebouw_id?: number; vingerafdruk?: string; naamconflict_bevestigd?: boolean;
  };
  if (!bestandsnaam || !upload_token || !vingerafdruk || !SHA256_PATTERN.test(vingerafdruk)) {
    return void res.status(400).json({ error: "bestandsnaam, upload_token en geldige SHA-256-vingerafdruk zijn verplicht" });
  }
  if (!(await magBijGebouw(req, gebouw_id ?? null))) {
    return void res.status(403).json({ error: "Geen toegang tot dit gebouw of ongekoppelde archiefstukken" });
  }
  const gebruikerId = sessionUserId(req);
  if (!gebruikerId) return void res.status(401).json({ error: "Niet ingelogd" });
  const [pending] = await db
    .select()
    .from(snagstreamUploadsTable)
    .where(and(
      eq(snagstreamUploadsTable.token, upload_token),
      eq(snagstreamUploadsTable.gebruikerId, gebruikerId),
      gt(snagstreamUploadsTable.verlooptOp, new Date()),
    ))
    .limit(1);
  if (
    !pending ||
    pending.bestandsnaam !== bestandsnaam.trim() ||
    pending.vingerafdruk !== vingerafdruk
  ) {
    return void res.status(409).json({ error: "Uploadtoken is ongeldig, verlopen of hoort niet bij dit bestand" });
  }
  let inspectie: Awaited<ReturnType<typeof inspecteerPdf>>;
  try {
    inspectie = await inspecteerPdf(pending.objectPath);
  } catch (fout) {
    await verwijderPendingUpload(req, pending);
    req.log.warn({ err: fout, uploadId: pending.id }, "Ongeldige Snagstream-PDF geweigerd");
    return void res.status(422).json({ error: "Het geüploade bestand is geen geldige PDF" });
  }
  if (inspectie.vingerafdruk !== vingerafdruk || inspectie.grootte !== pending.bestandsgrootte) {
    await verwijderPendingUpload(req, pending);
    return void res.status(422).json({ error: "Inhoud of bestandsgrootte komt niet overeen met de uploadcontrole" });
  }
  const scope = await rapportScopeVoorwaarde(req);
  const resultaat = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${upload_token}, 0))`);
    const [actieveUpload] = await tx
      .select()
      .from(snagstreamUploadsTable)
      .where(and(
        eq(snagstreamUploadsTable.id, pending.id),
        eq(snagstreamUploadsTable.gebruikerId, gebruikerId),
        gt(snagstreamUploadsTable.verlooptOp, new Date()),
      ))
      .limit(1);
    if (!actieveUpload) return { uploadOngeldig: true as const };
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${vingerafdruk}, 0))`);
    const [bestaand] = await tx
      .select()
      .from(snagstreamRapportenTable)
      .where(eq(snagstreamRapportenTable.vingerafdruk, vingerafdruk))
      .orderBy(snagstreamRapportenTable.id)
      .limit(1);
    if (bestaand) {
      if (!(await magRapportZien(req, bestaand))) {
        return {
          dubbelBuitenScope: true as const,
          objectPath: actieveUpload.objectPath,
        };
      }
      return { rapport: bestaand, dubbel: true as const, objectPath: actieveUpload.objectPath };
    }
    const [naamgenoot] = await tx
      .select({ id: snagstreamRapportenTable.id })
      .from(snagstreamRapportenTable)
      .where(and(
        sql`lower(${snagstreamRapportenTable.bestandsnaam}) = lower(${bestandsnaam.trim()})`,
        scope,
      ))
      .limit(1);
    if (naamgenoot && !naamconflict_bevestigd) return { naamconflict: true as const };
    const [rapport] = await tx.insert(snagstreamRapportenTable).values({
      bestandsnaam: bestandsnaam.trim(),
      pdfUrl: actieveUpload.objectPath,
      vingerafdruk,
      opslagBeheerd: true,
      rapportdatum: rapportdatum ?? null,
      opdrachtgever: opdrachtgever ?? null,
      projectNaam: project_naam ?? null,
      gebouwId: gebouw_id ?? null,
      uploaderId: sessionUserId(req),
      status: "nieuw",
    }).returning();
    await tx.delete(snagstreamUploadsTable).where(eq(snagstreamUploadsTable.id, actieveUpload.id));
    return { rapport, dubbel: false as const };
  });
  if ("uploadOngeldig" in resultaat) {
    return void res.status(409).json({ error: "Uploadtoken is al gebruikt of verlopen" });
  }
  if ("dubbelBuitenScope" in resultaat) {
    const dubbelObjectPath = resultaat.objectPath;
    if (!dubbelObjectPath) {
      return void res.status(409).json({
        error: "Het rapport kon niet worden opgeslagen",
      });
    }
    const [dubbelUpload] = await db
      .select()
      .from(snagstreamUploadsTable)
      .where(eq(snagstreamUploadsTable.objectPath, dubbelObjectPath))
      .limit(1);
    if (dubbelUpload) await verwijderPendingUpload(req, dubbelUpload);
    return void res.status(409).json({
      error: "Het rapport kon niet worden opgeslagen",
    });
  }
  if ("naamconflict" in resultaat) {
    return void res.status(409).json({ error: "Deze bestandsnaam bestaat al; bevestig dat dit een ander rapport is", code: "naamconflict" });
  }
  if (resultaat.dubbel) {
    const [dubbelUpload] = await db
      .select()
      .from(snagstreamUploadsTable)
      .where(eq(snagstreamUploadsTable.objectPath, resultaat.objectPath))
      .limit(1);
    if (dubbelUpload) await verwijderPendingUpload(req, dubbelUpload);
  }
  return void res.status(resultaat.dubbel ? 200 : 201).json(
    await mapRapport(resultaat.rapport, [], resultaat.dubbel),
  );
});

// GET /snagstream/rapporten/:id — detail
router.get("/snagstream/rapporten/:id", requireBevoegdheid("gebouwen", 1), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);
  const rij = await haalRapportBinnenScope(req, id);
  if (!rij) return void res.status(404).json({ error: "Niet gevonden" });
  return void res.json(await mapRapport(rij));
});

// PATCH /snagstream/rapporten/:id — koppelen / status bijwerken
router.patch("/snagstream/rapporten/:id", requireBevoegdheid("gebouwen", 2), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);
  const bestaand = await haalRapportBinnenScope(req, id);
  if (!bestaand) return void res.status(404).json({ error: "Niet gevonden" });
  const { gebouw_id, status, rapportdatum, opdrachtgever, project_naam } = req.body as {
    gebouw_id?: number | null; status?: string; rapportdatum?: string; opdrachtgever?: string; project_naam?: string;
  };
  if (gebouw_id !== undefined && !(await magBijGebouw(req, gebouw_id))) {
    return void res.status(403).json({ error: "Geen toegang tot dit gebouw" });
  }
  const [updated] = await db.update(snagstreamRapportenTable)
    .set({
      ...(gebouw_id !== undefined ? { gebouwId: gebouw_id } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(rapportdatum !== undefined ? { rapportdatum } : {}),
      ...(opdrachtgever !== undefined ? { opdrachtgever } : {}),
      ...(project_naam !== undefined ? { projectNaam: project_naam } : {}),
      bijgewerktOp: new Date(),
    })
    .where(eq(snagstreamRapportenTable.id, id))
    .returning();
  if (!updated) return void res.status(404).json({ error: "Niet gevonden" });
  return void res.json(await mapRapport(updated));
});

// DELETE /snagstream/rapporten/:id
router.delete("/snagstream/rapporten/:id", requireBevoegdheid("gebouwen", 2), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);
  const rapport = await haalRapportBinnenScope(req, id);
  if (!rapport) return void res.status(404).json({ error: "Niet gevonden" });
  const opslagResultaat = rapport.opslagBeheerd
    ? await probeerObjectTeVerwijderen(req.log, rapport.pdfUrl)
    : { gelukt: true as const };
  if (!rapport.opslagBeheerd) {
    req.log.warn(
      { rapportId: rapport.id },
      "Legacy Snagstream-rapport verwijderd zonder onbeheerd objectpad aan te raken",
    );
  }
  if (!opslagResultaat.gelukt) {
    const gebruikerId = sessionUserId(req);
    if (gebruikerId) {
      await db.insert(snagstreamUploadsTable).values({
        token: randomUUID(),
        objectPath: storageObjectPad(rapport.pdfUrl),
        bestandsnaam: rapport.bestandsnaam,
        vingerafdruk: rapport.vingerafdruk ?? "0".repeat(64),
        bestandsgrootte: 0,
        gebruikerId,
        verlooptOp: new Date(),
        opruimPogingen: 1,
        opruimLaatstGeprobeerdOp: new Date(),
        opruimFout: opslagResultaat.fout,
      }).onConflictDoNothing();
    }
  }
  await db.delete(snagstreamRapportenTable).where(eq(snagstreamRapportenTable.id, id));
  return void res.status(204).send();
});

// POST /snagstream/rapporten/:id/ai-uitlezen — AI analyseert de PDF
router.post("/snagstream/rapporten/:id/ai-uitlezen", requireBevoegdheid("gebouwen", 2), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);
  const rapport = await haalRapportBinnenScope(req, id);
  if (!rapport) return void res.status(404).json({ error: "Niet gevonden" });

  // Bouw een toegankelijke download-URL
  const devDomain = process.env["REPLIT_DEV_DOMAIN"];
  const genormaliseerdePdfUrl = normaliseerStorageUrl(rapport.pdfUrl);
  // Alleen relatieve (interne) paden krijgen het dev-domein ervoor; een externe
  // http(s)-URL blijft ongewijzigd.
  const downloadUrl = devDomain && genormaliseerdePdfUrl.startsWith("/")
    ? `https://${devDomain}${genormaliseerdePdfUrl}`
    : genormaliseerdePdfUrl;

  try {
    await db.update(snagstreamRapportenTable)
      .set({ status: "ai_uitgelezen", bijgewerktOp: new Date() })
      .where(eq(snagstreamRapportenTable.id, id));

    const snagstreamChatResultaat = await aiGateway.chat("default", {
      max_tokens: 4096,
      messages: [
        {
          role: "system",
          content: SNAGSTREAM_RAPPORT_ANALYSE_PROMPT.tekst,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Analyseer dit Snagstream inspectierapport en extraheer alle snags/spots met hun eigenschappen.",
            },
            {
              type: "image_url",
              image_url: { url: downloadUrl, detail: "high" },
            },
          ],
        },
      ],
    }, undefined, {
      module: "gebouwen",
      functie: "analyseerSnagstreamRapport",
      gebruikerId: sessionUserId(req),
      entiteitstype: "gebouw",
      entiteitId: rapport.gebouwId ?? null,
      gebouw_id: rapport.gebouwId ?? null,
      promptNaam: SNAGSTREAM_RAPPORT_ANALYSE_PROMPT.naam,
      promptVersie: SNAGSTREAM_RAPPORT_ANALYSE_PROMPT.versie,
    });

    const rawText = snagstreamChatResultaat.ok ? snagstreamChatResultaat.inhoud : "{}";
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    type ParsedResult = {
      rapport_info?: Record<string, unknown>;
      snags?: Array<{
        snagnummer?: string | null;
        verdieping?: string | null;
        ruimte?: string | null;
        omschrijving?: string | null;
        type_naam?: string | null;
        applicatie_naam?: string | null;
        label_naam?: string | null;
        classificatie?: string | null;
        status_origineel?: string | null;
        opmerkingen?: string | null;
        confidence_scores?: Record<string, number>;
      }>;
    };
    let parsed: ParsedResult = {};
    if (jsonMatch) {
      try { parsed = JSON.parse(jsonMatch[0]) as ParsedResult; } catch { /* laat leeg */ }
    }

    const aiMetadata = parsed.rapport_info ?? {};
    await db.update(snagstreamRapportenTable).set({
      aiMetadata: aiMetadata as Record<string, unknown>,
      rapportdatum: (aiMetadata["rapportdatum"] as string | undefined) ?? rapport.rapportdatum ?? undefined,
      opdrachtgever: (aiMetadata["opdrachtgever"] as string | undefined) ?? rapport.opdrachtgever ?? undefined,
      projectNaam: (aiMetadata["projectnaam"] as string | undefined) ?? rapport.projectNaam ?? undefined,
      status: "concept_herkend",
      bijgewerktOp: new Date(),
    }).where(eq(snagstreamRapportenTable.id, id));

    const bestaandeSnags = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(snagstreamSnagsTable)
      .where(eq(snagstreamSnagsTable.rapportId, id));

    if ((bestaandeSnags[0]?.c ?? 0) === 0 && parsed.snags?.length) {
      await db.insert(snagstreamSnagsTable).values(
        parsed.snags.map((s) => ({
          rapportId: id,
          snagnummer: s.snagnummer ?? null,
          verdieping: s.verdieping ?? null,
          ruimte: s.ruimte ?? null,
          omschrijving: s.omschrijving ?? null,
          typeNaam: s.type_naam ?? null,
          applicatieNaam: s.applicatie_naam ?? null,
          labelNaam: s.label_naam ?? null,
          classificatie: s.classificatie ?? null,
          statusOrigineel: s.status_origineel ?? null,
          opmerkingen: s.opmerkingen ?? null,
          confidenceScores: s.confidence_scores ?? null,
        })),
      );
    }

    const [updated] = await db.select().from(snagstreamRapportenTable).where(eq(snagstreamRapportenTable.id, id)).limit(1);
    res.json(await mapRapport(updated));
  } catch (err) {
    req.log.error(err);
    await db.update(snagstreamRapportenTable).set({ status: "fout", bijgewerktOp: new Date() }).where(eq(snagstreamRapportenTable.id, id));
    res.status(500).json({ error: "AI-uitlezing mislukt" });
  }
});

// GET /snagstream/rapporten/:id/snags — snags ophalen
router.get("/snagstream/rapporten/:id/snags", requireBevoegdheid("gebouwen", 1), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);
  const rapport = await haalRapportBinnenScope(req, id);
  if (!rapport) return void res.status(404).json({ error: "Niet gevonden" });
  const snags = await db
    .select()
    .from(snagstreamSnagsTable)
    .where(eq(snagstreamSnagsTable.rapportId, id))
    .orderBy(snagstreamSnagsTable.id);
  return void res.json(snags.map((s) => ({
    ...s,
    aangemaakt_op: s.aangemaaktOp.toISOString(),
    type_naam: s.typeNaam,
    applicatie_naam: s.applicatieNaam,
    label_naam: s.labelNaam,
    toepassing_naam: s.toepassingNaam,
    status_origineel: s.statusOrigineel,
    foto_url: s.fotoUrl,
    pdf_pagina: s.pdfPagina,
    pdf_x: s.pdfX,
    pdf_y: s.pdfY,
    confidence_scores: s.confidenceScores,
    overgenomen: s.overgenomen,
    overgenomen_als_voorziening_id: s.overgenomenAlsVoorzieningId,
    rapport_id: s.rapportId,
  })));
});

// POST /snagstream/snags/:id/overnemen — snag omzetten naar Connect-spot
router.post("/snagstream/snags/:id/overnemen", requireBevoegdheid("gebouwen", 2), async (req: Request, res: Response): Promise<void> => {
  const snagId = paramInt(req.params["id"]);
  const [snag] = await db.select().from(snagstreamSnagsTable).where(eq(snagstreamSnagsTable.id, snagId)).limit(1);
  if (!snag) { res.status(404).json({ error: "Snag niet gevonden" }); return; }
  const bronRapport = await haalRapportBinnenScope(req, snag.rapportId);
  if (!bronRapport) return void res.status(404).json({ error: "Snag niet gevonden" });
  if (snag.overgenomen) { res.status(409).json({ error: "Snag is al overgenomen" }); return; }

  const { gebouw_id, verdieping_id, type_naam, ruimte, omschrijving } = req.body as {
    gebouw_id?: number; verdieping_id?: number; type_naam?: string; ruimte?: string; omschrijving?: string;
  };
  if (!gebouw_id || !verdieping_id) { res.status(400).json({ error: "gebouw_id en verdieping_id zijn verplicht" }); return; }
  if (!(await magBijGebouw(req, gebouw_id))) {
    return void res.status(403).json({ error: "Geen toegang tot het doelgebouw" });
  }

  const gebouwIdNum = Number(gebouw_id);
  const verdiepingIdNum = Number(verdieping_id);

  // Haal volgend spotnummer op
  const [volgnummerRij] = await db
    .select({ volgnummer: sql<number>`coalesce(max(cast(regexp_replace(objectnummer, '^[^0-9]*', '') as integer)), 0) + 1` })
    .from(voorzieningenTable)
    .where(eq(voorzieningenTable.gebouwId, gebouwIdNum));

  const volgnummer = volgnummerRij?.volgnummer ?? 1;

  const [gebouw] = await db.select({ naam: gebouwenTable.naam }).from(gebouwenTable).where(eq(gebouwenTable.id, gebouwIdNum)).limit(1);
  const prefix = (gebouw?.naam ?? "SS").substring(0, 3).toUpperCase();
  const objectnummer = `${prefix}-${String(volgnummer).padStart(3, "0")}`;

  const typeValue = type_naam ?? snag.typeNaam ?? "doorvoering";
  const ruimteValue = ruimte ?? snag.ruimte ?? null;
  const omschrijvingWaarden = [
    "Aangemaakt vanuit Snagstream PDF-import",
    snag.snagnummer ? `Origineel snagnummer: ${snag.snagnummer}` : null,
    omschrijving ?? snag.omschrijving ?? null,
  ].filter((x): x is string => x !== null && x !== undefined);
  const opmerkingenValue = omschrijvingWaarden.join("\n") || null;

  const [voorziening] = await db.insert(voorzieningenTable).values({
    gebouwId: gebouwIdNum,
    verdiepingId: verdiepingIdNum,
    objectnummer,
    type: typeValue,
    ruimte: ruimteValue,
    opmerkingen: opmerkingenValue,
    status: "concept",
  }).returning();

  await db.update(snagstreamSnagsTable).set({
    overgenomen: true,
    overgenomenAlsVoorzieningId: voorziening.id,
  }).where(eq(snagstreamSnagsTable.id, snagId));

  const restSnags = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(snagstreamSnagsTable)
    .where(and(eq(snagstreamSnagsTable.rapportId, snag.rapportId), eq(snagstreamSnagsTable.overgenomen, false)));
  const statusNieuw = (restSnags[0]?.c ?? 0) === 0 ? "volledig_geimporteerd" : "deels_geimporteerd";
  await db.update(snagstreamRapportenTable)
    .set({ status: statusNieuw, bijgewerktOp: new Date() })
    .where(eq(snagstreamRapportenTable.id, snag.rapportId));

  res.status(201).json({ voorziening_id: voorziening.id });
});

export default router;
