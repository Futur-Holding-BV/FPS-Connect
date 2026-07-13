import { Router } from "express";
import type { Request, Response } from "express";
import * as XLSX from "xlsx";
import { FACTUUR_UITLEZEN_PROMPT } from "../lib/aiPrompts";
import {
  db,
  facturenTable,
  accountviewInstellingenTable,
  accountviewExportLogsTable,
  factuurOpmerkingenTable,
  factuurRegelsTable,
  factuurTermijnenTable,
  factuurHerinneringenTable,
  gebouwenTable,
  gebruikersTable,
  leveranciersTable,
  opdrachtenTable,
  factuurCorrespondentieTable,
  leverancierCategorisatieTable,
  factuurImportInstellingenTable,
  factuurImportLogTable,
  onderhoudscontractenTable,
} from "@workspace/db";
import { eq, and, desc, sql, or, gte, count, isNull, isNotNull, ne, lt, sum, ilike } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { ObjectStorageService } from "../lib/objectStorage";
import { maakAccountViewClient } from "../services/accountview-client";
import type { AccountviewBoeking } from "../services/accountview-client";
import crypto from "crypto";
import { aiGateway, heeftGateway } from "../lib/aiGateway";
import {
  checkVereistGoedkeuring,
  haalGoedgekeurdeAanvraag,
  haalOpenAanvraag,
  dienIn,
  maakGoedkeuringActor,
} from "../services/goedkeuring-engine";
import { leesFactuurUitMetAi } from "../services/factuurUitlezen";
import { synchroniseerMailboxFacturen } from "../services/factuurImport";
import { verstuurMail, isGeconfigureerd as mailIsGeconfigureerd } from "../services/email";

const router = Router();
const objectStorage = new ObjectStorageService();

// Leidt het goedkeurings-objectType af uit het factuurtype + eventueel subtype.
// Creditnota's en prijsafwijkingen krijgen een eigen objectType zodat per-type
// beleidsregels in de goedkeuringsmotor correct worden geselecteerd.
function bepaalFactuurDocumentType(f: { type: string; subtype?: string | null }): string {
  if (f.subtype === "creditnota") return "creditnota";
  if (f.subtype === "prijsafwijking") return "prijsafwijking";
  return f.type === "verkoop" ? "verkoop_factuur" : "inkoop_factuur";
}

function sessionUserId(req: Request): number | null {
  const sess = req.session as unknown as Record<string, unknown>;
  const uid = sess["gebruikerId"];
  return typeof uid === "number" ? uid : null;
}
function paramInt(val: unknown): number {
  return parseInt(String(val), 10);
}


async function mapFactuur(r: typeof facturenTable.$inferSelect) {
  const [gebouw] = r.gebouwId
    ? await db.select({ naam: gebouwenTable.naam }).from(gebouwenTable).where(eq(gebouwenTable.id, r.gebouwId)).limit(1)
    : [null];
  const [accordeerder] = r.geaccordeerdDoor
    ? await db.select({ naam: gebruikersTable.naam }).from(gebruikersTable).where(eq(gebruikersTable.id, r.geaccordeerdDoor)).limit(1)
    : [null];
  const [afgekeurder] = r.afgekeurdDoor
    ? await db.select({ naam: gebruikersTable.naam }).from(gebruikersTable).where(eq(gebruikersTable.id, r.afgekeurdDoor)).limit(1)
    : [null];
  const [beoordelaar] = r.beoordelaarId
    ? await db.select({ naam: gebruikersTable.naam }).from(gebruikersTable).where(eq(gebruikersTable.id, r.beoordelaarId)).limit(1)
    : [null];

  return {
    id: r.id,
    type: r.type,
    subtype: r.subtype ?? null,
    factuurnummer: r.factuurnummer,
    factuurdatum: r.factuurdatum,
    vervaldatum: r.vervaldatum,
    omschrijving: r.omschrijving,
    relatienaam: r.relatienaam,
    relatie_code: r.relatieCode,
    relatie_adres: r.relatieAdres,
    bedrag_excl_btw: r.bedragExclBtw,
    btw_bedrag: r.btwBedrag,
    bedrag_incl_btw: r.bedragInclBtw,
    btw_code: r.btwCode,
    grootboekrekening: r.grootboekrekening,
    kostenplaats: r.kostenplaats,
    dagboek: r.dagboek,
    project_code: r.projectCode,
    pdf_url: r.pdfUrl,
    bestandsnaam: r.bestandsnaam,
    gebouw_id: r.gebouwId,
    gebouw_naam: gebouw?.naam ?? null,
    ai_metadata: r.aiMetadata,
    status: r.status,
    geblokkeerd: r.geblokkeerd,
    blokkering_reden: r.blokkeringReden,
    geaccordeerd: r.geaccordeerd,
    geaccordeerd_op: r.geaccordeerdOp?.toISOString() ?? null,
    geaccordeerd_door_naam: accordeerder?.naam ?? null,
    accountview_boeking_id: r.accountviewBoekingId,
    accountview_export_op: r.accountviewExportOp?.toISOString() ?? null,
    accountview_status: r.accountviewStatus,
    accountview_fout: r.accountviewFout,
    payload_hash: r.payloadHash,
    betaalstatus: r.betaalstatus,
    betaaldatum: r.betaaldatum,
    boekingsnummer: r.boekingsnummer,
    terugkoppeling_op: r.terugkoppelingOp?.toISOString() ?? null,
    afgekeurd: !!(r.afgekeurdReden || r.afgekeurdOp),
    afkeuring_reden: r.afgekeurdReden,
    afgekeurd_op: r.afgekeurdOp?.toISOString() ?? null,
    afgekeurd_door_naam: afgekeurder?.naam ?? null,
    herexport_op: r.herexportOp?.toISOString() ?? null,
    herexport_reden: r.herexportReden,
    beoordelaar_id: r.beoordelaarId ?? null,
    beoordelaar_naam: beoordelaar?.naam ?? null,
    // F1/F2: nieuwe velden
    opdracht_id: r.opdrachtId ?? null,
    leverancier_id: r.leverancierId ?? null,
    categorie: r.categorie ?? null,
    voorstel_bron: r.voorstelBron ?? null,
    voorstel_bron_id: r.voorstelBronId ?? null,
    g_rekening_van_toepassing: r.gRekeningVanToepassing,
    g_rekening_bedrag: r.gRekeningBedrag ?? null,
    normaal_bedrag: r.normaalBedrag ?? null,
    iban_uitgelezen: r.ibanUitgelezen ?? null,
    iban_afwijking: r.ibanAfwijking,
    incasso_datum: r.incassoDatum ?? null,
    incasso_referentie: r.incassoReferentie ?? null,
    aangemaakt_op: r.aangemaaktOp.toISOString(),
    bijgewerkt_op: r.bijgewerktOp.toISOString(),
  };
}

// ── GET /facturen/upload-url ───────────────────────────────────────────────────
router.post("/facturen/upload-url", requireBevoegdheid("financieel", 1), async (req: Request, res: Response): Promise<void> => {
  const { bestandsnaam } = req.body as { bestandsnaam?: string };
  if (!bestandsnaam) { res.status(400).json({ error: "bestandsnaam is verplicht" }); return; }
  try {
    const { uploadURL, objectPath } = await objectStorage.getObjectEntityUploadURL(null, "factuur");
    res.json({ upload_url: uploadURL, object_path: objectPath });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Upload URL aanvragen mislukt" });
  }
});

// ── GET /facturen/klaar-voor-export ───────────────────────────────────────────
router.get("/facturen/klaar-voor-export", requireBevoegdheid("financieel", 4), async (req: Request, res: Response): Promise<void> => {
  const rijen = await db.select().from(facturenTable)
    .where(and(
      eq(facturenTable.status, "klaar_voor_accountview"),
      eq(facturenTable.geblokkeerd, false),
    ))
    .orderBy(desc(facturenTable.bijgewerktOp));
  const mapped = await Promise.all(rijen.map(mapFactuur));
  res.json(mapped);
});

// ── GET /facturen ─────────────────────────────────────────────────────────────
router.get("/facturen", requireBevoegdheid("financieel", 1), async (req: Request, res: Response): Promise<void> => {
  const statusFilter = req.query["status"] ? String(req.query["status"]) : null;
  const typeFilter = req.query["type"] ? String(req.query["type"]) : null;
  const klaarFilter = req.query["klaar_voor_export"] === "true";
  const conditions = [];
  if (statusFilter) conditions.push(eq(facturenTable.status, statusFilter));
  if (typeFilter) conditions.push(eq(facturenTable.type, typeFilter));
  if (klaarFilter) conditions.push(eq(facturenTable.status, "klaar_voor_accountview"));

  const rijen = await db.select().from(facturenTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(facturenTable.aangemaaktOp));
  const mapped = await Promise.all(rijen.map(mapFactuur));
  res.json(mapped);
});

// ── POST /facturen ─────────────────────────────────────────────────────────────
router.post("/facturen", requireBevoegdheid("financieel", 1), async (req: Request, res: Response): Promise<void> => {
  const body = req.body as {
    type?: string; subtype?: string | null; factuurnummer?: string; factuurdatum?: string; vervaldatum?: string;
    omschrijving?: string; relatienaam?: string; relatie_code?: string; relatie_adres?: string;
    bedrag_excl_btw?: string; btw_bedrag?: string; bedrag_incl_btw?: string;
    btw_code?: string; grootboekrekening?: string; kostenplaats?: string; project_code?: string;
    pdf_url?: string; bestandsnaam?: string; gebouw_id?: number;
  };
  const TOEGESTANE_SUBTYPES = new Set(["creditnota", "prijsafwijking"]);
  const subtype = body.subtype && TOEGESTANE_SUBTYPES.has(body.subtype) ? body.subtype : null;
  const [rij] = await db.insert(facturenTable).values({
    type: body.type ?? "inkoop",
    subtype,
    factuurnummer: body.factuurnummer ?? null,
    factuurdatum: body.factuurdatum ?? null,
    vervaldatum: body.vervaldatum ?? null,
    omschrijving: body.omschrijving ?? null,
    relatienaam: body.relatienaam ?? null,
    relatieCode: body.relatie_code ?? null,
    relatieAdres: body.relatie_adres ?? null,
    bedragExclBtw: body.bedrag_excl_btw ?? null,
    btwBedrag: body.btw_bedrag ?? null,
    bedragInclBtw: body.bedrag_incl_btw ?? null,
    btwCode: body.btw_code ?? null,
    grootboekrekening: body.grootboekrekening ?? null,
    kostenplaats: body.kostenplaats ?? null,
    projectCode: body.project_code ?? null,
    pdfUrl: body.pdf_url ?? null,
    bestandsnaam: body.bestandsnaam ?? null,
    gebouwId: body.gebouw_id ?? null,
    uploaderId: sessionUserId(req),
    status: "ontvangen",
  }).returning();
  res.status(201).json(await mapFactuur(rij));
});

// ── GET /facturen/historisch-archief/excel ─────────────────────────────────────
router.get("/facturen/historisch-archief/excel", requireBevoegdheid("financieel", 1), async (_req: Request, res: Response): Promise<void> => {
  const rijen = await db.select().from(facturenTable)
    .where(eq(facturenTable.status, "historisch"))
    .orderBy(desc(facturenTable.factuurdatum));

  const data = rijen.map((r) => ({
    Factuurnummer: r.factuurnummer ?? "",
    Type: r.type,
    Factuurdatum: r.factuurdatum ?? "",
    Vervaldatum: r.vervaldatum ?? "",
    Relatienaam: r.relatienaam ?? "",
    RelatieCode: r.relatieCode ?? "",
    "Bedrag excl. btw": r.bedragExclBtw ?? "",
    "Btw-bedrag": r.btwBedrag ?? "",
    "Bedrag incl. btw": r.bedragInclBtw ?? "",
    "Btw-code": r.btwCode ?? "",
    Grootboekrekening: r.grootboekrekening ?? "",
    Kostenplaats: r.kostenplaats ?? "",
    Dagboek: r.dagboek ?? "",
    Betaalstatus: r.betaalstatus ?? "",
    Omschrijving: r.omschrijving ?? "",
    Bestandsnaam: r.bestandsnaam ?? "",
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, "Historische facturen");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", "attachment; filename=\"historische_facturen_archief.xlsx\"");
  res.send(buf);
});

// ══════════════════════════════════════════════════════════════════════════════
// AI Factuurcentrum — mailbox-import (T1) + factuuranalyse (T5)
// Deze statische routes staan bewust vóór GET/PATCH /facturen/:id: de :id-handler
// geeft 404 op niet-numerieke id's zonder next(), dus latere statische routes
// zouden anders nooit bereikt worden.
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /facturen/import-instellingen ─────────────────────────────────────────
router.get("/facturen/import-instellingen", requireBevoegdheid("financieel", 4), async (_req: Request, res: Response): Promise<void> => {
  const [inst] = await db.select().from(factuurImportInstellingenTable).limit(1);
  res.json({
    actief: inst?.actief ?? false,
    mailbox_adres: inst?.mailboxAdres ?? null,
    laatste_sync_op: inst?.laatsteSyncOp?.toISOString() ?? null,
    laatste_sync_resultaat: inst?.laatsteSyncResultaat ?? null,
    mail_geconfigureerd: mailIsGeconfigureerd(),
  });
});

// ── PATCH /facturen/import-instellingen ───────────────────────────────────────
router.patch("/facturen/import-instellingen", requireBevoegdheid("financieel", 4), async (req: Request, res: Response): Promise<void> => {
  const body = req.body as { actief?: boolean; mailbox_adres?: string | null };
  const [bestaand] = await db.select().from(factuurImportInstellingenTable).limit(1);
  if (bestaand) {
    const [updated] = await db.update(factuurImportInstellingenTable).set({
      ...(body.actief !== undefined ? { actief: body.actief } : {}),
      ...(body.mailbox_adres !== undefined ? { mailboxAdres: body.mailbox_adres?.trim() || null } : {}),
      bijgewerktOp: new Date(),
    }).where(eq(factuurImportInstellingenTable.id, bestaand.id)).returning();
    res.json({
      actief: updated?.actief ?? false,
      mailbox_adres: updated?.mailboxAdres ?? null,
      laatste_sync_op: updated?.laatsteSyncOp?.toISOString() ?? null,
      laatste_sync_resultaat: updated?.laatsteSyncResultaat ?? null,
      mail_geconfigureerd: mailIsGeconfigureerd(),
    });
    return;
  }
  const [created] = await db.insert(factuurImportInstellingenTable).values({
    actief: body.actief ?? false,
    mailboxAdres: body.mailbox_adres?.trim() || null,
  }).returning();
  res.json({
    actief: created?.actief ?? false,
    mailbox_adres: created?.mailboxAdres ?? null,
    laatste_sync_op: null,
    laatste_sync_resultaat: null,
    mail_geconfigureerd: mailIsGeconfigureerd(),
  });
});

// ── POST /facturen/mailbox-sync ───────────────────────────────────────────────
// Haalt handmatig de financiële postbus op en maakt facturen aan uit bijlagen.
router.post("/facturen/mailbox-sync", requireBevoegdheid("financieel", 4), async (req: Request, res: Response): Promise<void> => {
  const resultaat = await synchroniseerMailboxFacturen(req.log);
  res.status(resultaat.ok ? 200 : 422).json({
    ok: resultaat.ok,
    gecontroleerd: resultaat.gecontroleerd,
    aangemaakt: resultaat.aangemaakt,
    overgeslagen: resultaat.overgeslagen,
    mislukt: resultaat.mislukt,
    melding: resultaat.melding,
  });
});

// ── GET /facturen/import-log ──────────────────────────────────────────────────
router.get("/facturen/import-log", requireBevoegdheid("financieel", 4), async (_req: Request, res: Response): Promise<void> => {
  const rijen = await db.select().from(factuurImportLogTable)
    .orderBy(desc(factuurImportLogTable.aangemaaktOp)).limit(100);
  res.json(rijen.map((r) => ({
    id: r.id,
    factuur_id: r.factuurId,
    bijlage_naam: r.bijlageNaam,
    formaat: r.formaat,
    afzender: r.afzender,
    onderwerp: r.onderwerp,
    status: r.status,
    foutmelding: r.foutmelding,
    aangemaakt_op: r.aangemaaktOp.toISOString(),
  })));
});

// ── GET /facturen/analyse ─────────────────────────────────────────────────────
// T5: geaggregeerde cijfers voor de Factuuranalyse-tegel op het directiedashboard.
router.get("/facturen/analyse", requireBevoegdheid("financieel", 1), async (_req: Request, res: Response): Promise<void> => {
  const [teBeoordelen] = await db.select({ n: count() }).from(facturenTable)
    .where(and(eq(facturenTable.type, "inkoop"), isNull(facturenTable.geaccordeerdOp), ne(facturenTable.status, "afgekeurd")));
  const [afgekeurd] = await db.select({ n: count() }).from(facturenTable)
    .where(eq(facturenTable.status, "afgekeurd"));
  const [viaMailbox] = await db.select({ n: count() }).from(facturenTable)
    .where(eq(facturenTable.bron, "mailbox"));
  const [ibanAfw] = await db.select({ n: count() }).from(facturenTable)
    .where(eq(facturenTable.ibanAfwijking, true));
  const [openBedrag] = await db.select({
    som: sql<string>`COALESCE(SUM(CAST(bedrag_incl_btw AS numeric)), 0)`,
  }).from(facturenTable)
    .where(and(eq(facturenTable.type, "inkoop"), isNull(facturenTable.geaccordeerdOp), ne(facturenTable.status, "afgekeurd")));

  // Afkeurredenen gegroepeerd op categorie
  const afkeurPerCategorie = await db.select({
    categorie: facturenTable.afkeurCategorie,
    n: count(),
  }).from(facturenTable)
    .where(and(eq(facturenTable.status, "afgekeurd"), isNotNull(facturenTable.afkeurCategorie)))
    .groupBy(facturenTable.afkeurCategorie);

  res.json({
    te_beoordelen: teBeoordelen?.n ?? 0,
    afgekeurd: afgekeurd?.n ?? 0,
    via_mailbox: viaMailbox?.n ?? 0,
    iban_afwijkingen: ibanAfw?.n ?? 0,
    open_bedrag_incl_btw: openBedrag?.som ?? "0",
    afkeur_per_categorie: afkeurPerCategorie.map((r) => ({ categorie: r.categorie, aantal: r.n })),
  });
});

// ── GET /facturen/exportlog ────────────────────────────────────────────────────
// LET OP: specifieke /facturen/*-routes moeten vóór /facturen/:id staan, anders
// vangt de wildcard ze af (id="exportlog" → paramInt faalt).
router.get("/facturen/exportlog", requireBevoegdheid("financieel", 1), async (req: Request, res: Response): Promise<void> => {
  const factuurIdFilter = req.query["factuur_id"] ? paramInt(req.query["factuur_id"]) : null;
  const statusFilter = req.query["status"] ? String(req.query["status"]) : null;
  const actieFilter = req.query["actie"] ? String(req.query["actie"]) : null;
  const vanFilter = req.query["van"] ? String(req.query["van"]) : null;
  const totFilter = req.query["tot"] ? String(req.query["tot"]) : null;
  const limitFilter = req.query["limit"] ? paramInt(req.query["limit"]) : 200;

  const conditions = [];
  if (factuurIdFilter) conditions.push(eq(accountviewExportLogsTable.factuurId, factuurIdFilter));
  if (statusFilter) conditions.push(eq(accountviewExportLogsTable.status, statusFilter));
  if (actieFilter) conditions.push(eq(accountviewExportLogsTable.actie, actieFilter));
  if (vanFilter) conditions.push(gte(accountviewExportLogsTable.exportOp, new Date(vanFilter)));
  if (totFilter) conditions.push(lt(accountviewExportLogsTable.exportOp, new Date(totFilter)));

  const logs = await db.select({
    id: accountviewExportLogsTable.id,
    factuurId: accountviewExportLogsTable.factuurId,
    factuurnummer: facturenTable.factuurnummer,
    relatienaam: facturenTable.relatienaam,
    gebruikerId: accountviewExportLogsTable.gebruikerId,
    gebruikerNaam: gebruikersTable.naam,
    exportOp: accountviewExportLogsTable.exportOp,
    testmodus: accountviewExportLogsTable.testmodus,
    actie: accountviewExportLogsTable.actie,
    httpStatus: accountviewExportLogsTable.httpStatus,
    status: accountviewExportLogsTable.status,
    accountviewBoekingId: accountviewExportLogsTable.accountviewBoekingId,
    foutmelding: accountviewExportLogsTable.foutmelding,
  })
    .from(accountviewExportLogsTable)
    .leftJoin(facturenTable, eq(accountviewExportLogsTable.factuurId, facturenTable.id))
    .leftJoin(gebruikersTable, eq(accountviewExportLogsTable.gebruikerId, gebruikersTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(accountviewExportLogsTable.exportOp))
    .limit(limitFilter);

  res.json(logs.map((l) => ({
    id: l.id,
    factuur_id: l.factuurId,
    factuurnummer: l.factuurnummer ?? null,
    relatienaam: l.relatienaam ?? null,
    gebruiker_naam: l.gebruikerNaam ?? null,
    export_op: l.exportOp.toISOString(),
    testmodus: l.testmodus,
    actie: l.actie,
    status: l.status,
    accountview_boeking_id: l.accountviewBoekingId ?? null,
    foutmelding: l.foutmelding ?? null,
    http_status: l.httpStatus ?? null,
  })));
});

// ── GET /facturen/financieel-dashboard ────────────────────────────────────────
// LET OP: moet vóór /facturen/:id staan (zie hierboven).
router.get("/facturen/financieel-dashboard", requireBevoegdheid("financieel", 1), async (req: Request, res: Response): Promise<void> => {
  const [totalen] = await db.select({
    totaal: count(),
  }).from(facturenTable);

  const [inkoop] = await db.select({ n: count() }).from(facturenTable).where(eq(facturenTable.type, "inkoop"));
  const [verkoop] = await db.select({ n: count() }).from(facturenTable).where(eq(facturenTable.type, "verkoop"));
  const [klaarExport] = await db.select({ n: count() }).from(facturenTable)
    .where(and(eq(facturenTable.status, "klaar_voor_accountview"), eq(facturenTable.geblokkeerd, false)));
  const [afgekeurde] = await db.select({ n: count() }).from(facturenTable).where(eq(facturenTable.status, "afgekeurd"));
  const [betaalde] = await db.select({ n: count() }).from(facturenTable).where(eq(facturenTable.betaalstatus, "betaald"));

  const [openBedragRow] = await db.select({
    totaal: sum(facturenTable.bedragInclBtw),
  }).from(facturenTable).where(
    and(ne(facturenTable.betaalstatus, "betaald"), ne(facturenTable.status, "afgekeurd"))
  );

  const vandaagStart = new Date(); vandaagStart.setHours(0, 0, 0, 0);
  const maandStart = new Date(); maandStart.setDate(1); maandStart.setHours(0, 0, 0, 0);

  const [exportsVandaag] = await db.select({ n: count() }).from(accountviewExportLogsTable)
    .where(gte(accountviewExportLogsTable.exportOp, vandaagStart));
  const [exportsMaand] = await db.select({ n: count() }).from(accountviewExportLogsTable)
    .where(gte(accountviewExportLogsTable.exportOp, maandStart));

  const [laastExport] = await db.select({ op: accountviewExportLogsTable.exportOp })
    .from(accountviewExportLogsTable).orderBy(desc(accountviewExportLogsTable.exportOp)).limit(1);

  const [exportFouten] = await db.select({ n: count() }).from(facturenTable)
    .where(eq(facturenTable.accountviewStatus, "error"));

  res.json({
    facturen_totaal: totalen?.totaal ?? 0,
    inkoop_totaal: inkoop?.n ?? 0,
    verkoop_totaal: verkoop?.n ?? 0,
    klaar_voor_export: klaarExport?.n ?? 0,
    afgekeurd: afgekeurde?.n ?? 0,
    betaald: betaalde?.n ?? 0,
    open_bedrag: openBedragRow?.totaal ?? "0",
    exports_vandaag: exportsVandaag?.n ?? 0,
    exports_deze_maand: exportsMaand?.n ?? 0,
    laatste_export_op: laastExport?.op?.toISOString() ?? null,
    export_fouten_open: exportFouten?.n ?? 0,
  });
});

// ── GET /facturen/:id ──────────────────────────────────────────────────────────
router.get("/facturen/:id", requireBevoegdheid("financieel", 1), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);
  const [rij] = await db.select().from(facturenTable).where(eq(facturenTable.id, id)).limit(1);
  if (!rij) { res.status(404).json({ error: "Niet gevonden" }); return; }
  res.json(await mapFactuur(rij));
});

// ── PATCH /facturen/:id ────────────────────────────────────────────────────────
router.patch("/facturen/:id", requireBevoegdheid("financieel", 1), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);
  const body = req.body as Record<string, unknown>;

  const update: Partial<typeof facturenTable.$inferInsert> = { bijgewerktOp: new Date() };
  if ("subtype" in body) {
    const TOEGESTANE_SUBTYPES = new Set(["creditnota", "prijsafwijking"]);
    const sub = body["subtype"];
    update.subtype = typeof sub === "string" && TOEGESTANE_SUBTYPES.has(sub) ? sub : null;
  }
  if ("factuurnummer" in body) update.factuurnummer = body["factuurnummer"] as string | null;
  if ("factuurdatum" in body) update.factuurdatum = body["factuurdatum"] as string | null;
  if ("vervaldatum" in body) update.vervaldatum = body["vervaldatum"] as string | null;
  if ("omschrijving" in body) update.omschrijving = body["omschrijving"] as string | null;
  if ("relatienaam" in body) update.relatienaam = body["relatienaam"] as string | null;
  if ("relatie_code" in body) update.relatieCode = body["relatie_code"] as string | null;
  if ("relatie_adres" in body) update.relatieAdres = body["relatie_adres"] as string | null;
  if ("bedrag_excl_btw" in body) update.bedragExclBtw = body["bedrag_excl_btw"] as string | null;
  if ("btw_bedrag" in body) update.btwBedrag = body["btw_bedrag"] as string | null;
  if ("bedrag_incl_btw" in body) update.bedragInclBtw = body["bedrag_incl_btw"] as string | null;
  if ("btw_code" in body) update.btwCode = body["btw_code"] as string | null;
  if ("grootboekrekening" in body) update.grootboekrekening = body["grootboekrekening"] as string | null;
  if ("kostenplaats" in body) update.kostenplaats = body["kostenplaats"] as string | null;
  if ("dagboek" in body) update.dagboek = body["dagboek"] as string | null;
  if ("project_code" in body) update.projectCode = body["project_code"] as string | null;
  if ("gebouw_id" in body) update.gebouwId = body["gebouw_id"] as number | null;
  if ("status" in body) update.status = body["status"] as string;

  const [updated] = await db.update(facturenTable).set(update).where(eq(facturenTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Niet gevonden" }); return; }
  res.json(await mapFactuur(updated));
});

// ── DELETE /facturen/:id ───────────────────────────────────────────────────────
router.delete("/facturen/:id", requireBevoegdheid("financieel", 4), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);
  await db.delete(facturenTable).where(eq(facturenTable.id, id));
  res.status(204).send();
});

// ── POST /facturen/:id/ai-uitlezen ─────────────────────────────────────────────
// Fase 2: Uitgebreide AI-extractie — regels, IBAN-verificatie, leverancierherkenning,
// G-rekening-signalering. AI stelt voor; administratie keurt goed.
router.post("/facturen/:id/ai-uitlezen", requireBevoegdheid("financieel", 1), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);
  const resultaat = await leesFactuurUitMetAi(id, req.log);
  if (!resultaat.ok) { res.status(resultaat.status).json({ error: resultaat.error }); return; }
  res.json({
    ...(await mapFactuur(resultaat.factuur)),
    _ai_samenvatting: resultaat.samenvatting,
  });
});

// ── GET /facturen/:id/afwijkingen ─────────────────────────────────────────────
// Fase 2: Geconsolideerde lijst van signaleringen en afwijkingen voor de controlebox.
// Codes: iban_afwijking | g_rekening_van_toepassing | geen_regels |
//        geen_project_koppeling | hoog_bedrag | bedrag_afwijking
// Ernst: kritisch | waarschuwing | info
router.get("/facturen/:id/afwijkingen", requireBevoegdheid("financieel", 1), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);
  const [factuur] = await db.select().from(facturenTable)
    .where(eq(facturenTable.id, id)).limit(1);
  if (!factuur) { res.status(404).json({ error: "Niet gevonden" }); return; }

  const signalen: Array<{ code: string; ernst: string; bericht: string }> = [];

  // 1. IBAN-afwijking — kritisch, mogelijke fraude
  if (factuur.ibanAfwijking) {
    signalen.push({
      code: "iban_afwijking",
      ernst: "kritisch",
      bericht: `Uitgelezen IBAN (${factuur.ibanUitgelezen ?? "onbekend"}) wijkt af van het geregistreerde IBAN van de leverancier. Controleer vóór betaling.`,
    });
  }

  // 2. G-rekening (wettelijke verplichting bouwsector)
  if (factuur.gRekeningVanToepassing) {
    if (!factuur.gRekeningBedrag) {
      signalen.push({
        code: "g_rekening_niet_berekend",
        ernst: "waarschuwing",
        bericht: "Leverancier heeft G-rekening-verplichting maar het op te storten bedrag is nog niet berekend.",
      });
    } else {
      signalen.push({
        code: "g_rekening_van_toepassing",
        ernst: "info",
        bericht: `G-rekening vereist. Naar G-rekening: ${factuur.gRekeningBedrag}, normaal deel: ${factuur.normaalBedrag ?? "?"}`,
      });
    }
  }

  // 3. Geen regellijnen
  const [regelCount] = await db.select({ n: count() }).from(factuurRegelsTable)
    .where(eq(factuurRegelsTable.factuurId, id));
  const aantalRegels = regelCount?.n ?? 0;
  if (aantalRegels === 0) {
    signalen.push({
      code: "geen_regels",
      ernst: "waarschuwing",
      bericht: "Factuur bevat geen gespecificeerde regellijnen. Start AI-uitlezing om regels automatisch te detecteren.",
    });
  }

  // 4. Geen project/gebouw-koppeling
  if (!factuur.gebouwId && !factuur.opdrachtId && !factuur.projectCode) {
    signalen.push({
      code: "geen_project_koppeling",
      ernst: "waarschuwing",
      bericht: "Factuur is niet gekoppeld aan een gebouw, project of opdracht. Koppel de factuur om kostprijsdoorwerking mogelijk te maken.",
    });
  }

  // 5. Bedrag boven drempel (>€5.000) — informerend
  if (factuur.bedragInclBtw && parseFloat(factuur.bedragInclBtw) > 5000 && !factuur.geaccordeerd) {
    signalen.push({
      code: "hoog_bedrag",
      ernst: "info",
      bericht: `Bedrag (${parseFloat(factuur.bedragInclBtw).toLocaleString("nl-NL", { style: "currency", currency: "EUR" })}) boven de drempel van €5.000 — verplicht accorderen.`,
    });
  }

  // 6. Regelsom vs. headertotaal afwijking
  if (aantalRegels > 0 && factuur.bedragExclBtw) {
    const [regelSomRow] = await db.select({
      som: sql<string>`COALESCE(SUM(CAST(bedrag_excl_btw AS numeric)), 0)`,
    }).from(factuurRegelsTable).where(eq(factuurRegelsTable.factuurId, id));
    const regelSom = parseFloat(regelSomRow?.som ?? "0");
    const headerExcl = parseFloat(factuur.bedragExclBtw);
    if (Math.abs(headerExcl - regelSom) > 0.02) {
      signalen.push({
        code: "bedrag_afwijking",
        ernst: "kritisch",
        bericht: `Som van regellijnen (${regelSom.toFixed(2)}) wijkt meer dan €0,02 af van het factuurtotaal excl. BTW (${headerExcl.toFixed(2)}).`,
      });
    }
  }

  res.json({ factuur_id: id, aantal_signalen: signalen.length, signalen });
});

// ── POST /facturen/:id/ter-goedkeuring-indienen ────────────────────────────────
// Dient een factuur ter goedkeuring in via de generieke Governance & Approval Engine.
// Wordt gebruikt wanneer het beleidsscherm een goedkeuringsregel voor dit factuurtype
// en bedrag heeft ingesteld. Na goedkeuring door de motor wordt de factuur automatisch
// op klaar_voor_accountview + geaccordeerd gezet (via pasObjectStatusToe).
router.post("/facturen/:id/ter-goedkeuring-indienen", requireBevoegdheid("financieel", 1), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);
  const [factuur] = await db.select().from(facturenTable).where(eq(facturenTable.id, id)).limit(1);
  if (!factuur) { res.status(404).json({ error: "Niet gevonden" }); return; }
  if (factuur.geblokkeerd) { res.status(409).json({ error: "Factuur is geblokkeerd" }); return; }

  const actor = await maakGoedkeuringActor(req as { session: { userId?: number | null } }, db);
  if (!actor) { res.status(401).json({ error: "Niet ingelogd" }); return; }

  const documentType = bepaalFactuurDocumentType(factuur);
  const bedrag = factuur.bedragInclBtw ? parseFloat(factuur.bedragInclBtw) : null;
  const typeLabel = factuur.subtype === "creditnota" ? "Creditnota"
    : factuur.subtype === "prijsafwijking" ? "Prijsafwijking"
    : factuur.type === "verkoop" ? "Verkoopfactuur" : "Inkoopfactuur";
  const omschrijving = `${typeLabel} ${factuur.factuurnummer ?? `#${id}`}${factuur.relatienaam ? ` — ${factuur.relatienaam}` : ""}`;

  const resultaat = await dienIn(db, {
    objectType: documentType,
    objectId: id,
    documentType,
    omschrijving,
    bedrag,
    werkmaatschappijId: null,
    actor,
  });

  if (!resultaat.ok) {
    res.status(resultaat.error!.httpStatus ?? 422).json({ error: resultaat.error!.bericht });
    return;
  }

  res.status(201).json(resultaat.aanvraag);
});

// ── POST /facturen/:id/accorderen ──────────────────────────────────────────────
router.post("/facturen/:id/accorderen", requireBevoegdheid("financieel", 4), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);
  const [factuur] = await db.select().from(facturenTable).where(eq(facturenTable.id, id)).limit(1);
  if (!factuur) { res.status(404).json({ error: "Niet gevonden" }); return; }
  if (factuur.geblokkeerd) { res.status(409).json({ error: "Factuur is geblokkeerd" }); return; }

  // Goedkeuringsgate: als er een actieve beleidsregel geldt voor dit factuurtype +
  // bedrag, moet er een goedgekeurde aanvraag bestaan voordat manueel accorderen
  // is toegestaan. Dit voorkomt omzeiling van de vier-ogen-controle.
  const documentType = bepaalFactuurDocumentType(factuur);
  const bedrag = factuur.bedragInclBtw ? parseFloat(factuur.bedragInclBtw) : null;
  const { vereist } = await checkVereistGoedkeuring(db, documentType, bedrag, null);
  if (vereist) {
    const goedgekeurd = await haalGoedgekeurdeAanvraag(db, documentType, id);
    if (!goedgekeurd) {
      const open = await haalOpenAanvraag(db, documentType, id);
      res.status(422).json({
        error: "Goedkeuring vereist",
        detail: open
          ? "Er loopt een openstaande goedkeuringsaanvraag. Wacht op de uitkomst voordat u accordeert."
          : "Dien de factuur eerst ter goedkeuring in (knop Ter goedkeuring indienen). Na goedkeuring wordt de factuur automatisch geaccordeerd.",
        viaGoedkeuring: true,
      });
      return;
    }
  }

  const userId = sessionUserId(req);
  const [updated] = await db.update(facturenTable).set({
    geaccordeerd: true,
    geaccordeerdOp: new Date(),
    geaccordeerdDoor: userId,
    status: "klaar_voor_accountview",
    bijgewerktOp: new Date(),
  }).where(eq(facturenTable.id, id)).returning();

  // T3 — Zelflerende categorisatie: leg de bevestigde boekingskeuzes per leverancier
  // vast zodat een volgende factuur van dezelfde leverancier voorgesteld kan worden.
  // Puur leren van menselijke bevestiging; AI/systeem boekt nooit zelfstandig.
  try {
    if (updated?.leverancierId &&
      (updated.grootboekrekening || updated.kostenplaats || updated.categorie || updated.btwCode)) {
      await db.insert(leverancierCategorisatieTable).values({
        leverancierId: updated.leverancierId,
        grootboekrekening: updated.grootboekrekening ?? null,
        kostenplaats: updated.kostenplaats ?? null,
        categorie: updated.categorie ?? null,
        btwCode: updated.btwCode ?? null,
        aantal: 1,
        laatstBevestigdOp: new Date(),
      }).onConflictDoUpdate({
        target: [
          leverancierCategorisatieTable.leverancierId,
          leverancierCategorisatieTable.grootboekrekening,
          leverancierCategorisatieTable.kostenplaats,
          leverancierCategorisatieTable.categorie,
          leverancierCategorisatieTable.btwCode,
        ],
        set: {
          aantal: sql`${leverancierCategorisatieTable.aantal} + 1`,
          laatstBevestigdOp: new Date(),
        },
      });
    }
  } catch (err) {
    req.log.error(err, "leren van leverancier-categorisatie mislukt (niet-blokkerend)");
  }

  res.json(await mapFactuur(updated));
});

// ── POST /facturen/:id/blokkeren ───────────────────────────────────────────────
router.post("/facturen/:id/blokkeren", requireBevoegdheid("financieel", 4), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);
  const { geblokkeerd, reden } = req.body as { geblokkeerd?: boolean; reden?: string | null };

  const blokkeerStatus = geblokkeerd !== false;
  const [updated] = await db.update(facturenTable).set({
    geblokkeerd: blokkeerStatus,
    blokkeringReden: blokkeerStatus ? (reden ?? null) : null,
    bijgewerktOp: new Date(),
  }).where(eq(facturenTable.id, id)).returning();

  if (!updated) { res.status(404).json({ error: "Niet gevonden" }); return; }
  res.json(await mapFactuur(updated));
});

// ── POST /facturen/:id/export-accountview ──────────────────────────────────────
router.post("/facturen/:id/export-accountview", requireBevoegdheid("financieel", 4), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);
  const [factuur] = await db.select().from(facturenTable).where(eq(facturenTable.id, id)).limit(1);
  if (!factuur) { res.status(404).json({ error: "Niet gevonden" }); return; }

  // Blokkeer dubbele export
  if (factuur.accountviewBoekingId && factuur.accountviewStatus === "success") {
    res.status(409).json({
      error: "Dubbele export geblokkeerd",
      detail: `Deze factuur is al geëxporteerd naar AccountView (boekingId: ${factuur.accountviewBoekingId}).`,
    });
    return;
  }
  if (factuur.geblokkeerd) {
    res.status(409).json({ error: "Factuur is geblokkeerd" });
    return;
  }

  // Governance-gate: als er een actieve goedkeuringsaanvraag loopt of vereist is,
  // geef een expliciete melding zodat de exportknop niet cryptisch faalt.
  {
    const documentType = bepaalFactuurDocumentType(factuur);
    const bedrag = factuur.bedragInclBtw ? parseFloat(factuur.bedragInclBtw) : null;
    const { vereist: govVereist } = await checkVereistGoedkeuring(db, documentType, bedrag, null);
    if (govVereist && !factuur.geaccordeerd) {
      const open = await haalOpenAanvraag(db, documentType, id);
      res.status(422).json({
        error: "Goedkeuring vereist voor AccountView-export",
        detail: open
          ? "Er loopt een openstaande goedkeuringsaanvraag voor deze factuur. Wacht op de uitkomst voor u naar AccountView exporteert."
          : "Deze factuur vereist goedkeuring. Dien de factuur ter goedkeuring in via de knop op de detailpagina.",
        viaGoedkeuring: true,
      });
      return;
    }
  }

  // Valideer verplichte velden
  const fouten: string[] = [];
  if (!factuur.factuurnummer) fouten.push("Factuurnummer ontbreekt");
  if (!factuur.factuurdatum) fouten.push("Factuurdatum ontbreekt");
  if (!factuur.relatienaam) fouten.push("Relatienaam ontbreekt");
  if (!factuur.bedragInclBtw) fouten.push("Bedrag incl. BTW ontbreekt");
  if (!factuur.btwCode) fouten.push("BTW-code ontbreekt");
  if (!factuur.geaccordeerd) fouten.push("Factuur is nog niet geaccordeerd");

  if (fouten.length > 0) {
    res.status(422).json({ error: "Factuur is niet exportklaar", fouten });
    return;
  }

  // Haal AccountView instellingen op
  const [inst] = await db.select().from(accountviewInstellingenTable).where(eq(accountviewInstellingenTable.id, 1)).limit(1);
  if (!inst) {
    res.status(503).json({ error: "AccountView is niet geconfigureerd" });
    return;
  }

  const client = maakAccountViewClient(inst);
  const dagboek = factuur.dagboek ?? (factuur.type === "verkoop" ? inst.dagboekVerkoop : inst.dagboekInkoop) ?? "INK";

  const boeking: AccountviewBoeking = {
    dagboek: dagboek ?? "INK",
    administratiecode: inst.administratiecode ?? "",
    factuurnummer: factuur.factuurnummer!,
    factuurdatum: factuur.factuurdatum!,
    vervaldatum: factuur.vervaldatum ?? factuur.factuurdatum!,
    relatienaam: factuur.relatienaam!,
    relatieCode: factuur.relatieCode ?? undefined,
    omschrijving: factuur.omschrijving ?? `Factuur ${factuur.factuurnummer}`,
    bedragExclBtw: parseFloat(factuur.bedragExclBtw ?? "0"),
    btwBedrag: parseFloat(factuur.btwBedrag ?? "0"),
    bedragInclBtw: parseFloat(factuur.bedragInclBtw ?? "0"),
    btwCode: factuur.btwCode ?? undefined,
    grootboekrekening: factuur.grootboekrekening ?? inst.grootboekStandaard ?? undefined,
    kostenplaats: factuur.kostenplaats ?? undefined,
    projectCode: factuur.projectCode ?? undefined,
    type: factuur.type === "verkoop" ? "verkoop" : "inkoop",
  };

  const userId = sessionUserId(req);

  // Maak log-entry aan
  const [logEntry] = await db.insert(accountviewExportLogsTable).values({
    factuurId: id,
    gebruikerId: userId,
    testmodus: inst.testmodus,
    verzondenPayload: boeking as unknown as Record<string, unknown>,
    status: "bezig",
  }).returning();

  const resultaat = await client.verzendBoeking(boeking);

  // Bijwerken log-entry
  await db.update(accountviewExportLogsTable).set({
    accountviewResponse: resultaat.rawResponse as Record<string, unknown> | null,
    httpStatus: resultaat.httpStatus ?? null,
    status: resultaat.geslaagd ? "geslaagd" : "mislukt",
    accountviewBoekingId: resultaat.boekingId ?? null,
    foutmelding: resultaat.foutmelding ?? null,
  }).where(eq(accountviewExportLogsTable.id, logEntry.id));

  if (resultaat.geslaagd) {
    await db.update(facturenTable).set({
      accountviewBoekingId: resultaat.boekingId ?? null,
      accountviewExportOp: new Date(),
      accountviewStatus: "success",
      accountviewFout: null,
      status: "verwerkt",
      bijgewerktOp: new Date(),
    }).where(eq(facturenTable.id, id));
  } else {
    await db.update(facturenTable).set({
      accountviewStatus: "error",
      accountviewFout: resultaat.foutmelding ?? "Onbekende fout",
      status: "fout_bij_verzending",
      bijgewerktOp: new Date(),
    }).where(eq(facturenTable.id, id));
  }

  res.json({
    status: resultaat.geslaagd ? "geslaagd" : "mislukt",
    factuur_id: id,
    boeking_id: resultaat.boekingId ?? null,
    foutmelding: resultaat.foutmelding ?? null,
    testmodus: inst.testmodus,
    fouten: resultaat.foutDetails ?? [],
  });
});

// ── GET /facturen/:id/export-logs ──────────────────────────────────────────────
router.get("/facturen/:id/export-logs", requireBevoegdheid("financieel", 1), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);
  const logs = await db.select().from(accountviewExportLogsTable)
    .where(eq(accountviewExportLogsTable.factuurId, id))
    .orderBy(desc(accountviewExportLogsTable.exportOp));
  res.json(logs.map((l) => ({
    id: l.id,
    factuur_id: l.factuurId,
    gebruiker_id: l.gebruikerId,
    export_op: l.exportOp.toISOString(),
    testmodus: l.testmodus,
    actie: l.actie,
    verzonden_payload: l.verzondenPayload,
    accountview_response: l.accountviewResponse,
    http_status: l.httpStatus,
    payload_hash: l.payloadHash,
    status: l.status,
    accountview_boeking_id: l.accountviewBoekingId,
    foutmelding: l.foutmelding,
  })));
});

// ── POST /facturen/:id/afkeuren ────────────────────────────────────────────────
router.post("/facturen/:id/afkeuren", requireBevoegdheid("financieel", 4), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);
  const { reden, categorie } = req.body as { reden?: string; categorie?: string };
  if (!reden?.trim()) { res.status(400).json({ error: "Afkeuringsreden is verplicht" }); return; }

  const [factuur] = await db.select().from(facturenTable).where(eq(facturenTable.id, id)).limit(1);
  if (!factuur) { res.status(404).json({ error: "Niet gevonden" }); return; }
  if (factuur.status === "verwerkt") { res.status(409).json({ error: "Verwerkte facturen kunnen niet worden afgekeurd" }); return; }

  const userId = sessionUserId(req);
  const [updated] = await db.update(facturenTable).set({
    status: "afgekeurd",
    afgekeurdReden: reden.trim(),
    afkeurCategorie: categorie?.trim() || null,
    afgekeurdOp: new Date(),
    afgekeurdDoor: userId,
    bijgewerktOp: new Date(),
  }).where(eq(facturenTable.id, id)).returning();

  await db.insert(accountviewExportLogsTable).values({
    factuurId: id,
    gebruikerId: userId,
    testmodus: false,
    actie: "afkeuren",
    status: "geslaagd",
    foutmelding: `Afgekeurd: ${reden.trim()}`,
  });

  res.json(await mapFactuur(updated));
});

// ══════════════════════════════════════════════════════════════════════════════
// AI Factuurcentrum — afkeur-correspondentie (T2), categorisatie-voorstel (T3),
// contractcontrole (T4)
// ══════════════════════════════════════════════════════════════════════════════

// Vaste afkeurcategorieën — gedeeld tussen afkeur-flow en AI-conceptmail.
const AFKEUR_CATEGORIEEN: Record<string, string> = {
  prijsafwijking: "Prijs wijkt af van opdracht/contract",
  ontbrekende_gegevens: "Ontbrekende of onjuiste factuurgegevens",
  geen_opdracht: "Geen (geldige) opdracht of order aanwezig",
  dubbele_factuur: "Dubbele of reeds betaalde factuur",
  verkeerde_geadresseerde: "Gericht aan verkeerde entiteit",
  kwaliteit: "Geleverde werk/goederen niet conform",
  overig: "Overige reden",
};

// ── GET /facturen/:id/correspondentie ─────────────────────────────────────────
router.get("/facturen/:id/correspondentie", requireBevoegdheid("financieel", 1), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);
  const rijen = await db.select().from(factuurCorrespondentieTable)
    .where(eq(factuurCorrespondentieTable.factuurId, id))
    .orderBy(desc(factuurCorrespondentieTable.aangemaaktOp));
  res.json(rijen.map((r) => ({
    id: r.id,
    factuur_id: r.factuurId,
    richting: r.richting,
    soort: r.soort,
    status: r.status,
    ontvanger_email: r.ontvangerEmail,
    ontvanger_naam: r.ontvangerNaam,
    onderwerp: r.onderwerp,
    bericht: r.bericht,
    afkeur_categorie: r.afkeurCategorie,
    ai_gegenereerd: r.aiGegenereerd,
    verzonden_op: r.verzondenOp?.toISOString() ?? null,
    foutmelding: r.foutmelding,
    aangemaakt_op: r.aangemaaktOp.toISOString(),
  })));
});

// ── POST /facturen/:id/afkeur-concept ─────────────────────────────────────────
// T2: AI stelt een nette afkeurmail aan de leverancier op en slaat die op als
// CONCEPT. Een mens beoordeelt en verstuurt daarna zelf; AI verstuurt nooit.
router.post("/facturen/:id/afkeur-concept", requireBevoegdheid("financieel", 4), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);
  const body = req.body as { categorie?: string; reden?: string };
  const [factuur] = await db.select().from(facturenTable).where(eq(facturenTable.id, id)).limit(1);
  if (!factuur) { res.status(404).json({ error: "Niet gevonden" }); return; }

  const categorie = body.categorie?.trim() || factuur.afkeurCategorie || "overig";
  const reden = body.reden?.trim() || factuur.afgekeurdReden || AFKEUR_CATEGORIEEN[categorie] || "Onbekende reden";
  const categorieLabel = AFKEUR_CATEGORIEEN[categorie] ?? categorie;

  // Ontvanger: leverancier-contact indien beschikbaar
  let ontvangerEmail: string | null = null;
  let ontvangerNaam: string | null = factuur.relatienaam ?? null;
  if (factuur.leverancierId) {
    const [lev] = await db.select().from(leveranciersTable).where(eq(leveranciersTable.id, factuur.leverancierId)).limit(1);
    if (lev) {
      ontvangerEmail = lev.email ?? lev.contactEmail ?? null;
      ontvangerNaam = lev.naam ?? ontvangerNaam;
    }
  }

  const onderwerp = `Afkeuring factuur ${factuur.factuurnummer ?? `#${id}`}`;
  let bericht = "";
  let aiGegenereerd = false;

  if (heeftGateway()) {
    const prompt = [
      "Je bent een medewerker crediteurenadministratie bij FPS Brandpreventie.",
      "Schrijf een korte, zakelijke en beleefde e-mail in het Nederlands aan een leverancier",
      "om een factuur af te keuren. Gebruik geen emoji's. Gebruik een neutrale, professionele toon.",
      "Verzin geen bedragen of feiten die niet zijn gegeven. Sluit af met een verzoek om een",
      "gecorrigeerde factuur of reactie. Onderteken met 'FPS Brandpreventie, crediteurenadministratie'.",
      "",
      `Leverancier: ${ontvangerNaam ?? "onbekend"}`,
      `Factuurnummer: ${factuur.factuurnummer ?? "onbekend"}`,
      `Factuurdatum: ${factuur.factuurdatum ?? "onbekend"}`,
      `Bedrag incl. BTW: ${factuur.bedragInclBtw ?? "onbekend"}`,
      `Afkeurcategorie: ${categorieLabel}`,
      `Reden: ${reden}`,
      "",
      "Geef ALLEEN de e-mailtekst terug, zonder onderwerpregel.",
    ].join("\n");
    const res2 = await aiGateway.chat("default", {
      max_tokens: 700,
      messages: [{ role: "user", content: prompt }],
    });
    if (res2.ok) {
      bericht = res2.inhoud.trim();
      aiGegenereerd = true;
    }
  }

  if (!bericht) {
    // Terugval-sjabloon wanneer AI niet beschikbaar is
    bericht = [
      `Geachte ${ontvangerNaam ?? "heer/mevrouw"},`,
      "",
      `Wij hebben uw factuur ${factuur.factuurnummer ?? ""} ontvangen, maar kunnen deze helaas niet in behandeling nemen.`,
      `Reden van afkeuring: ${categorieLabel} — ${reden}.`,
      "",
      "Wij verzoeken u vriendelijk een gecorrigeerde factuur toe te sturen of contact met ons op te nemen.",
      "",
      "Met vriendelijke groet,",
      "FPS Brandpreventie, crediteurenadministratie",
    ].join("\n");
  }

  const [concept] = await db.insert(factuurCorrespondentieTable).values({
    factuurId: id,
    richting: "uitgaand",
    soort: "afkeur",
    status: "concept",
    ontvangerEmail,
    ontvangerNaam,
    onderwerp,
    bericht,
    afkeurCategorie: categorie,
    aiGegenereerd,
    opgesteldDoor: sessionUserId(req),
  }).returning();

  res.status(201).json({
    id: concept?.id,
    factuur_id: id,
    onderwerp,
    bericht,
    ontvanger_email: ontvangerEmail,
    ontvanger_naam: ontvangerNaam,
    afkeur_categorie: categorie,
    ai_gegenereerd: aiGegenereerd,
    status: "concept",
  });
});

// ── PATCH /facturen/:id/correspondentie/:cid ──────────────────────────────────
// Concept bijwerken (onderwerp/bericht/ontvanger) vóór verzenden.
router.patch("/facturen/:id/correspondentie/:cid", requireBevoegdheid("financieel", 4), async (req: Request, res: Response): Promise<void> => {
  const cid = paramInt(req.params["cid"]);
  const body = req.body as { onderwerp?: string; bericht?: string; ontvanger_email?: string | null; ontvanger_naam?: string | null };
  const [rij] = await db.select().from(factuurCorrespondentieTable).where(eq(factuurCorrespondentieTable.id, cid)).limit(1);
  if (!rij) { res.status(404).json({ error: "Niet gevonden" }); return; }
  if (rij.status === "verzonden") { res.status(409).json({ error: "Verzonden correspondentie kan niet worden gewijzigd" }); return; }
  const [updated] = await db.update(factuurCorrespondentieTable).set({
    ...(body.onderwerp !== undefined ? { onderwerp: body.onderwerp } : {}),
    ...(body.bericht !== undefined ? { bericht: body.bericht } : {}),
    ...(body.ontvanger_email !== undefined ? { ontvangerEmail: body.ontvanger_email?.trim() || null } : {}),
    ...(body.ontvanger_naam !== undefined ? { ontvangerNaam: body.ontvanger_naam?.trim() || null } : {}),
    bijgewerktOp: new Date(),
  }).where(eq(factuurCorrespondentieTable.id, cid)).returning();
  res.json({ id: updated?.id, status: updated?.status });
});

// ── POST /facturen/:id/correspondentie/:cid/verzenden ─────────────────────────
// T2: verstuurt de (mogelijk bijgewerkte) conceptmail. Alleen een mens triggert dit.
router.post("/facturen/:id/correspondentie/:cid/verzenden", requireBevoegdheid("financieel", 4), async (req: Request, res: Response): Promise<void> => {
  const cid = paramInt(req.params["cid"]);
  const [rij] = await db.select().from(factuurCorrespondentieTable).where(eq(factuurCorrespondentieTable.id, cid)).limit(1);
  if (!rij) { res.status(404).json({ error: "Niet gevonden" }); return; }
  if (rij.status === "verzonden") { res.status(409).json({ error: "Deze correspondentie is al verzonden" }); return; }
  if (!rij.ontvangerEmail?.trim()) { res.status(422).json({ error: "Geen ontvanger-e-mailadres ingevuld" }); return; }
  if (!mailIsGeconfigureerd()) { res.status(503).json({ error: "E-mail is niet geconfigureerd" }); return; }

  const html = rij.bericht.split("\n").map((r) => r.length ? `<p>${r.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>` : "<br>").join("");
  try {
    await verstuurMail({
      naarEmail: rij.ontvangerEmail,
      naarNaam: rij.ontvangerNaam,
      onderwerp: rij.onderwerp,
      html,
      soort: "afwijzing",
      verstuurdDoorId: sessionUserId(req),
    });
  } catch (err) {
    const melding = err instanceof Error ? err.message : "Onbekende fout";
    await db.update(factuurCorrespondentieTable).set({ status: "mislukt", foutmelding: melding, bijgewerktOp: new Date() })
      .where(eq(factuurCorrespondentieTable.id, cid));
    res.status(502).json({ error: "Verzenden mislukt", detail: melding });
    return;
  }

  const [updated] = await db.update(factuurCorrespondentieTable).set({
    status: "verzonden",
    verzondenOp: new Date(),
    verzondenDoor: sessionUserId(req),
    foutmelding: null,
    bijgewerktOp: new Date(),
  }).where(eq(factuurCorrespondentieTable.id, cid)).returning();
  res.json({ id: updated?.id, status: "verzonden", verzonden_op: updated?.verzondenOp?.toISOString() ?? null });
});

// ── GET /facturen/:id/categorisatie-voorstel ──────────────────────────────────
// T3: geeft het geleerde boekingspatroon terug voor de leverancier van deze factuur.
router.get("/facturen/:id/categorisatie-voorstel", requireBevoegdheid("financieel", 1), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);
  const [factuur] = await db.select().from(facturenTable).where(eq(facturenTable.id, id)).limit(1);
  if (!factuur) { res.status(404).json({ error: "Niet gevonden" }); return; }
  if (!factuur.leverancierId) { res.json({ voorstel: null }); return; }

  const [patroon] = await db.select().from(leverancierCategorisatieTable)
    .where(eq(leverancierCategorisatieTable.leverancierId, factuur.leverancierId))
    .orderBy(desc(leverancierCategorisatieTable.aantal), desc(leverancierCategorisatieTable.laatstBevestigdOp))
    .limit(1);

  if (!patroon || patroon.aantal < 2) { res.json({ voorstel: null }); return; }
  res.json({
    voorstel: {
      grootboekrekening: patroon.grootboekrekening,
      kostenplaats: patroon.kostenplaats,
      categorie: patroon.categorie,
      btw_code: patroon.btwCode,
      aantal: patroon.aantal,
      laatst_bevestigd_op: patroon.laatstBevestigdOp.toISOString(),
    },
  });
});

// ── GET /facturen/:id/contractcontrole ────────────────────────────────────────
// T4: vergelijkt de factuur met het gekoppelde onderhoudscontract (bedrag, index,
// looptijd, opzegtermijn). Signaleert afwijkingen; keurt niets automatisch goed.
router.get("/facturen/:id/contractcontrole", requireBevoegdheid("financieel", 1), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);
  const [factuur] = await db.select().from(facturenTable).where(eq(facturenTable.id, id)).limit(1);
  if (!factuur) { res.status(404).json({ error: "Niet gevonden" }); return; }
  if (!factuur.onderhoudscontractId) {
    res.json({ contract_gekoppeld: false, signalen: [] });
    return;
  }
  const [contract] = await db.select().from(onderhoudscontractenTable)
    .where(eq(onderhoudscontractenTable.id, factuur.onderhoudscontractId)).limit(1);
  if (!contract) {
    res.json({ contract_gekoppeld: false, signalen: [{ code: "contract_niet_gevonden", ernst: "waarschuwing", bericht: "Het gekoppelde onderhoudscontract bestaat niet meer." }] });
    return;
  }

  const signalen: Array<{ code: string; ernst: string; bericht: string }> = [];

  // 1. Bedrag t.o.v. contractwaarde (met eventuele indexering)
  if (contract.contractwaarde && factuur.bedragExclBtw) {
    const contractwaarde = parseFloat(contract.contractwaarde);
    const indexPct = contract.indexering !== "geen" && contract.indexeringPercentage ? parseFloat(contract.indexeringPercentage) : 0;
    const verwacht = contractwaarde * (1 + indexPct / 100);
    const gefactureerd = parseFloat(factuur.bedragExclBtw);
    const afwijkingPct = verwacht > 0 ? ((gefactureerd - verwacht) / verwacht) * 100 : 0;
    if (Math.abs(afwijkingPct) > 2) {
      signalen.push({
        code: "contract_bedrag_afwijking",
        ernst: Math.abs(afwijkingPct) > 10 ? "kritisch" : "waarschuwing",
        bericht: `Gefactureerd bedrag (${gefactureerd.toFixed(2)}) wijkt ${afwijkingPct.toFixed(1)}% af van de verwachte contractwaarde${indexPct ? ` incl. ${indexPct}% indexering` : ""} (${verwacht.toFixed(2)}).`,
      });
    } else {
      signalen.push({ code: "contract_bedrag_ok", ernst: "info", bericht: `Bedrag komt overeen met de contractwaarde${indexPct ? ` incl. ${indexPct}% indexering` : ""}.` });
    }
  }

  // 2. Indexering geconfigureerd maar geen percentage
  if (contract.indexering !== "geen" && !contract.indexeringPercentage) {
    signalen.push({ code: "contract_index_ontbreekt", ernst: "waarschuwing", bericht: `Contract kent indexering (${contract.indexering}) maar er is geen percentage vastgelegd. Controleer de prijsberekening handmatig.` });
  }

  // 3. Looptijd/einddatum verstreken
  if (contract.einddatum) {
    const eind = new Date(contract.einddatum);
    const factuurDatum = factuur.factuurdatum ? new Date(factuur.factuurdatum) : new Date();
    if (!isNaN(eind.getTime()) && factuurDatum > eind) {
      signalen.push({ code: "contract_verlopen", ernst: "kritisch", bericht: `Factuurdatum (${factuur.factuurdatum ?? "onbekend"}) ligt na de contract-einddatum (${contract.einddatum}). Controleer of het contract nog geldig is.` });
    }
  }

  // 4. Opzegtermijn ter info
  if (contract.opzegtermijnMaanden) {
    signalen.push({ code: "contract_opzegtermijn", ernst: "info", bericht: `Contract kent een opzegtermijn van ${contract.opzegtermijnMaanden} maand(en)${contract.automatischeVerlenging ? " en verlengt automatisch" : ""}.` });
  }

  res.json({
    contract_gekoppeld: true,
    contract: {
      id: contract.id,
      contractnummer: contract.contractnummer,
      contractwaarde: contract.contractwaarde,
      indexering: contract.indexering,
      indexering_percentage: contract.indexeringPercentage,
      einddatum: contract.einddatum,
      opzegtermijn_maanden: contract.opzegtermijnMaanden,
    },
    signalen,
  });
});

// ── POST /facturen/:id/beoordelen-pl ──────────────────────────────────────────
router.post("/facturen/:id/beoordelen-pl", requireBevoegdheid("financieel", 2), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);
  const { actie, reden } = req.body as { actie?: string; reden?: string };

  if (!["goedkeuren", "afkeuren", "doorzetten"].includes(actie ?? "")) {
    res.status(422).json({ error: "Ongeldige actie. Gebruik: goedkeuren, afkeuren of doorzetten" }); return;
  }

  const [factuur] = await db.select().from(facturenTable).where(eq(facturenTable.id, id)).limit(1);
  if (!factuur) { res.status(404).json({ error: "Niet gevonden" }); return; }
  if (factuur.status !== "te_beoordelen_pl") {
    res.status(422).json({ error: "Factuur staat niet in de PL-beoordelingsbox" }); return;
  }

  const userId = sessionUserId(req);

  if (actie === "afkeuren") {
    if (!reden?.trim()) { res.status(400).json({ error: "Afkeuringsreden is verplicht" }); return; }
    const [updated] = await db.update(facturenTable).set({
      status: "afgekeurd",
      afgekeurdReden: reden.trim(),
      afgekeurdOp: new Date(),
      afgekeurdDoor: userId,
      bijgewerktOp: new Date(),
    }).where(eq(facturenTable.id, id)).returning();
    await db.insert(accountviewExportLogsTable).values({ factuurId: id, gebruikerId: userId, testmodus: false, actie: "pl_afkeuren", status: "geslaagd", foutmelding: `PL afgekeurd: ${reden.trim()}` });
    res.json(await mapFactuur(updated)); return;
  }

  const [updated] = await db.update(facturenTable).set({
    status: "te_beoordelen_wvb",
    bijgewerktOp: new Date(),
  }).where(eq(facturenTable.id, id)).returning();
  await db.insert(accountviewExportLogsTable).values({ factuurId: id, gebruikerId: userId, testmodus: false, actie: `pl_${actie}`, status: "geslaagd", foutmelding: `PL ${actie}` });
  res.json(await mapFactuur(updated));
});

// ── POST /facturen/:id/beoordelen-wvb ─────────────────────────────────────────
router.post("/facturen/:id/beoordelen-wvb", requireBevoegdheid("financieel", 3), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);
  const { actie, reden } = req.body as { actie?: string; reden?: string };

  if (!["goedkeuren", "afkeuren", "doorzetten"].includes(actie ?? "")) {
    res.status(422).json({ error: "Ongeldige actie. Gebruik: goedkeuren, afkeuren of doorzetten" }); return;
  }

  const [factuur] = await db.select().from(facturenTable).where(eq(facturenTable.id, id)).limit(1);
  if (!factuur) { res.status(404).json({ error: "Niet gevonden" }); return; }
  if (factuur.status !== "te_beoordelen_wvb") {
    res.status(422).json({ error: "Factuur staat niet in de WVB-beoordelingsbox" }); return;
  }

  const userId = sessionUserId(req);

  if (actie === "afkeuren") {
    if (!reden?.trim()) { res.status(400).json({ error: "Afkeuringsreden is verplicht" }); return; }
    const [updatedWvb] = await db.update(facturenTable).set({
      status: "afgekeurd",
      afgekeurdReden: reden.trim(),
      afgekeurdOp: new Date(),
      afgekeurdDoor: userId,
      bijgewerktOp: new Date(),
    }).where(eq(facturenTable.id, id)).returning();
    await db.insert(accountviewExportLogsTable).values({ factuurId: id, gebruikerId: userId, testmodus: false, actie: "wvb_afkeuren", status: "geslaagd", foutmelding: `WVB afgekeurd: ${reden.trim()}` });
    res.json(await mapFactuur(updatedWvb)); return;
  }

  const [updatedWvb] = await db.update(facturenTable).set({
    status: "klaar_voor_boeking",
    bijgewerktOp: new Date(),
  }).where(eq(facturenTable.id, id)).returning();
  await db.insert(accountviewExportLogsTable).values({ factuurId: id, gebruikerId: userId, testmodus: false, actie: `wvb_${actie}`, status: "geslaagd", foutmelding: `WVB ${actie}` });
  res.json(await mapFactuur(updatedWvb));
});

// ── POST /facturen/:id/doorsturen-medewerker ──────────────────────────────────
router.post("/facturen/:id/doorsturen-medewerker", requireBevoegdheid("financieel", 2), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);
  const { gebruiker_id, opmerking } = req.body as { gebruiker_id?: number; opmerking?: string };

  if (!gebruiker_id) { res.status(400).json({ error: "gebruiker_id is verplicht" }); return; }

  const [factuur] = await db.select().from(facturenTable).where(eq(facturenTable.id, id)).limit(1);
  if (!factuur) { res.status(404).json({ error: "Niet gevonden" }); return; }

  const [medewerker] = await db.select({ id: gebruikersTable.id, naam: gebruikersTable.naam })
    .from(gebruikersTable).where(eq(gebruikersTable.id, gebruiker_id)).limit(1);
  if (!medewerker) { res.status(404).json({ error: "Medewerker niet gevonden" }); return; }

  const userId = sessionUserId(req);
  const [updated] = await db.update(facturenTable).set({
    beoordelaarId: gebruiker_id,
    status: "ter_beoordeling_medewerker",
    bijgewerktOp: new Date(),
  }).where(eq(facturenTable.id, id)).returning();

  await db.insert(accountviewExportLogsTable).values({
    factuurId: id,
    gebruikerId: userId,
    testmodus: false,
    actie: "doorsturen_medewerker",
    status: "geslaagd",
    foutmelding: `Doorgezet naar medewerker: ${medewerker.naam}`,
  });

  if (opmerking?.trim()) {
    await db.insert(factuurOpmerkingenTable).values({
      factuurId: id,
      gebruikerId: userId,
      tekst: opmerking.trim(),
    });
  }

  res.json(await mapFactuur(updated));
});

// ── POST /facturen/:id/beoordelen-medewerker ──────────────────────────────────
router.post("/facturen/:id/beoordelen-medewerker", requireBevoegdheid("financieel", 1), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);
  const { actie, reden } = req.body as { actie?: string; reden?: string };

  if (!["goedkeuren", "afkeuren"].includes(actie ?? "")) {
    res.status(422).json({ error: "Ongeldige actie. Gebruik: goedkeuren of afkeuren" }); return;
  }

  const [factuur] = await db.select().from(facturenTable).where(eq(facturenTable.id, id)).limit(1);
  if (!factuur) { res.status(404).json({ error: "Niet gevonden" }); return; }
  if (factuur.status !== "ter_beoordeling_medewerker") {
    res.status(422).json({ error: "Factuur staat niet ter beoordeling bij een medewerker" }); return;
  }

  const userId = sessionUserId(req);

  if (actie === "afkeuren") {
    if (!reden?.trim()) { res.status(400).json({ error: "Afkeuringsreden is verplicht" }); return; }
    const [updated] = await db.update(facturenTable).set({
      status: "afgekeurd",
      afgekeurdReden: reden.trim(),
      afgekeurdOp: new Date(),
      afgekeurdDoor: userId,
      bijgewerktOp: new Date(),
    }).where(eq(facturenTable.id, id)).returning();
    await db.insert(accountviewExportLogsTable).values({ factuurId: id, gebruikerId: userId, testmodus: false, actie: "medewerker_afkeuren", status: "geslaagd", foutmelding: `Medewerker afgekeurd: ${reden.trim()}` });
    res.json(await mapFactuur(updated)); return;
  }

  const [updated] = await db.update(facturenTable).set({
    status: "te_beoordelen_pl",
    bijgewerktOp: new Date(),
  }).where(eq(facturenTable.id, id)).returning();
  await db.insert(accountviewExportLogsTable).values({ factuurId: id, gebruikerId: userId, testmodus: false, actie: "medewerker_goedkeuren", status: "geslaagd", foutmelding: "Medewerker goedgekeurd — terug naar projectleider" });
  res.json(await mapFactuur(updated));
});

// ── GET /facturen/:id/opmerkingen ─────────────────────────────────────────────
router.get("/facturen/:id/opmerkingen", requireBevoegdheid("financieel", 1), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);
  const rijen = await db
    .select({
      id: factuurOpmerkingenTable.id,
      factuurId: factuurOpmerkingenTable.factuurId,
      gebruikerId: factuurOpmerkingenTable.gebruikerId,
      gebruikerNaam: gebruikersTable.naam,
      tekst: factuurOpmerkingenTable.tekst,
      replyOpId: factuurOpmerkingenTable.replyOpId,
      afgehandeld: factuurOpmerkingenTable.afgehandeld,
      afgehandeldOp: factuurOpmerkingenTable.afgehandeldOp,
      afgehandeldDoor: factuurOpmerkingenTable.afgehandeldDoor,
      aangemaaktOp: factuurOpmerkingenTable.aangemaaktOp,
    })
    .from(factuurOpmerkingenTable)
    .leftJoin(gebruikersTable, eq(factuurOpmerkingenTable.gebruikerId, gebruikersTable.id))
    .where(eq(factuurOpmerkingenTable.factuurId, id))
    .orderBy(factuurOpmerkingenTable.aangemaaktOp);

  const afhandelaarIds = rijen.filter((r) => r.afgehandeldDoor).map((r) => r.afgehandeldDoor!);
  const afhandelaarMap: Record<number, string> = {};
  if (afhandelaarIds.length > 0) {
    const namen = await db.select({ id: gebruikersTable.id, naam: gebruikersTable.naam })
      .from(gebruikersTable).where(eq(gebruikersTable.id, afhandelaarIds[0]!));
    namen.forEach((n) => { afhandelaarMap[n.id] = n.naam; });
  }

  res.json(rijen.map((r) => ({
    id: r.id,
    factuur_id: r.factuurId,
    gebruiker_id: r.gebruikerId ?? null,
    gebruiker_naam: r.gebruikerNaam ?? null,
    tekst: r.tekst,
    reply_op_id: r.replyOpId ?? null,
    afgehandeld: r.afgehandeld,
    afgehandeld_op: r.afgehandeldOp?.toISOString() ?? null,
    afgehandeld_door_naam: r.afgehandeldDoor ? (afhandelaarMap[r.afgehandeldDoor] ?? null) : null,
    aangemaakt_op: r.aangemaaktOp.toISOString(),
  })));
});

// ── POST /facturen/:id/opmerkingen ────────────────────────────────────────────
router.post("/facturen/:id/opmerkingen", requireBevoegdheid("financieel", 1), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);
  const { tekst, reply_op_id } = req.body as { tekst?: string; reply_op_id?: number };

  if (!tekst?.trim()) { res.status(400).json({ error: "tekst is verplicht" }); return; }

  const userId = sessionUserId(req);
  const [rij] = await db.insert(factuurOpmerkingenTable).values({
    factuurId: id,
    gebruikerId: userId,
    tekst: tekst.trim(),
    replyOpId: reply_op_id ?? null,
  }).returning();

  const [gebruiker] = userId
    ? await db.select({ naam: gebruikersTable.naam }).from(gebruikersTable).where(eq(gebruikersTable.id, userId)).limit(1)
    : [null];

  res.status(201).json({
    id: rij!.id,
    factuur_id: rij!.factuurId,
    gebruiker_id: rij!.gebruikerId ?? null,
    gebruiker_naam: gebruiker?.naam ?? null,
    tekst: rij!.tekst,
    reply_op_id: rij!.replyOpId ?? null,
    afgehandeld: rij!.afgehandeld,
    afgehandeld_op: null,
    afgehandeld_door_naam: null,
    aangemaakt_op: rij!.aangemaaktOp.toISOString(),
  });
});

// ── PATCH /facturen/:id/opmerkingen/:oid ──────────────────────────────────────
router.patch("/facturen/:id/opmerkingen/:oid", requireBevoegdheid("financieel", 1), async (req: Request, res: Response): Promise<void> => {
  const factuurId = paramInt(req.params["id"]);
  const oid = paramInt(req.params["oid"]);
  const { afgehandeld } = req.body as { afgehandeld?: boolean };

  if (typeof afgehandeld !== "boolean") { res.status(400).json({ error: "afgehandeld (boolean) is verplicht" }); return; }

  const userId = sessionUserId(req);
  const [updated] = await db.update(factuurOpmerkingenTable).set({
    afgehandeld,
    afgehandeldOp: afgehandeld ? new Date() : null,
    afgehandeldDoor: afgehandeld ? userId : null,
  }).where(and(eq(factuurOpmerkingenTable.id, oid), eq(factuurOpmerkingenTable.factuurId, factuurId))).returning();

  if (!updated) { res.status(404).json({ error: "Niet gevonden" }); return; }

  const [gebruiker] = updated.gebruikerId
    ? await db.select({ naam: gebruikersTable.naam }).from(gebruikersTable).where(eq(gebruikersTable.id, updated.gebruikerId)).limit(1)
    : [null];
  const [afhandelaar] = updated.afgehandeldDoor
    ? await db.select({ naam: gebruikersTable.naam }).from(gebruikersTable).where(eq(gebruikersTable.id, updated.afgehandeldDoor)).limit(1)
    : [null];

  res.json({
    id: updated.id,
    factuur_id: updated.factuurId,
    gebruiker_id: updated.gebruikerId ?? null,
    gebruiker_naam: gebruiker?.naam ?? null,
    tekst: updated.tekst,
    reply_op_id: updated.replyOpId ?? null,
    afgehandeld: updated.afgehandeld,
    afgehandeld_op: updated.afgehandeldOp?.toISOString() ?? null,
    afgehandeld_door_naam: afhandelaar?.naam ?? null,
    aangemaakt_op: updated.aangemaaktOp.toISOString(),
  });
});

// ── GET /facturen/:id/proceslog ───────────────────────────────────────────────
router.get("/facturen/:id/proceslog", requireBevoegdheid("financieel", 1), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);

  const acties = await db
    .select({
      id: accountviewExportLogsTable.id,
      actie: accountviewExportLogsTable.actie,
      status: accountviewExportLogsTable.status,
      foutmelding: accountviewExportLogsTable.foutmelding,
      exportOp: accountviewExportLogsTable.exportOp,
      gebruikerNaam: gebruikersTable.naam,
      accountviewBoekingId: accountviewExportLogsTable.accountviewBoekingId,
    })
    .from(accountviewExportLogsTable)
    .leftJoin(gebruikersTable, eq(accountviewExportLogsTable.gebruikerId, gebruikersTable.id))
    .where(eq(accountviewExportLogsTable.factuurId, id))
    .orderBy(accountviewExportLogsTable.exportOp);

  const opmerkingen = await db
    .select({
      id: factuurOpmerkingenTable.id,
      tekst: factuurOpmerkingenTable.tekst,
      replyOpId: factuurOpmerkingenTable.replyOpId,
      afgehandeld: factuurOpmerkingenTable.afgehandeld,
      aangemaaktOp: factuurOpmerkingenTable.aangemaaktOp,
      gebruikerNaam: gebruikersTable.naam,
    })
    .from(factuurOpmerkingenTable)
    .leftJoin(gebruikersTable, eq(factuurOpmerkingenTable.gebruikerId, gebruikersTable.id))
    .where(eq(factuurOpmerkingenTable.factuurId, id))
    .orderBy(factuurOpmerkingenTable.aangemaaktOp);

  const actieLabels: Record<string, string> = {
    export: "Factuur verzonden naar AccountView",
    herexport: "Herexport naar AccountView",
    afkeuren: "Factuur afgekeurd",
    accorderen: "Factuur geaccordeerd",
    pl_goedkeuren: "Projectleider goedgekeurd",
    pl_afkeuren: "Projectleider afgekeurd",
    pl_doorzetten: "Projectleider doorgezet",
    wvb_goedkeuren: "WVB goedgekeurd",
    wvb_afkeuren: "WVB afgekeurd",
    wvb_doorzetten: "WVB doorgezet",
    doorsturen_medewerker: "Doorgestuurd naar medewerker voor extra controle",
    medewerker_goedkeuren: "Medewerker heeft goedgekeurd",
    medewerker_afkeuren: "Medewerker heeft afgekeurd",
  };

  type LogRegel = {
    id: string;
    soort: string;
    omschrijving: string;
    gebruiker_naam: string | null;
    aangemaakt_op: string;
    detail: Record<string, unknown> | null;
    _ts: Date;
  };

  const regels: LogRegel[] = [];

  for (const a of acties) {
    regels.push({
      id: `actie-${a.id}`,
      soort: "actie",
      omschrijving: actieLabels[a.actie] ?? a.actie,
      gebruiker_naam: a.gebruikerNaam ?? null,
      aangemaakt_op: a.exportOp.toISOString(),
      _ts: a.exportOp,
      detail: {
        actie: a.actie,
        status: a.status,
        boeking_id: a.accountviewBoekingId ?? null,
        notitie: a.foutmelding ?? null,
      },
    });
  }

  for (const o of opmerkingen) {
    regels.push({
      id: `opmerking-${o.id}`,
      soort: "opmerking",
      omschrijving: o.tekst,
      gebruiker_naam: o.gebruikerNaam ?? null,
      aangemaakt_op: o.aangemaaktOp.toISOString(),
      _ts: o.aangemaaktOp,
      detail: {
        reply_op_id: o.replyOpId ?? null,
        afgehandeld: o.afgehandeld,
      },
    });
  }

  regels.sort((a, b) => a._ts.getTime() - b._ts.getTime());

  res.json(regels.map(({ _ts, ...r }) => r));
});

// ── GET /facturen/:id/herinneringen ───────────────────────────────────────────
router.get("/facturen/:id/herinneringen", requireBevoegdheid("financieel", 1), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);
  const rijen = await db
    .select({
      id: factuurHerinneringenTable.id,
      factuurId: factuurHerinneringenTable.factuurId,
      type: factuurHerinneringenTable.type,
      verstuurOp: factuurHerinneringenTable.verstuurOp,
      ontvangerEmail: factuurHerinneringenTable.ontvangerEmail,
      opmerkingen: factuurHerinneringenTable.opmerkingen,
      aangemaaktOp: factuurHerinneringenTable.aangemaaktOp,
      gebruikerNaam: gebruikersTable.naam,
    })
    .from(factuurHerinneringenTable)
    .leftJoin(gebruikersTable, eq(factuurHerinneringenTable.gebruikerId, gebruikersTable.id))
    .where(eq(factuurHerinneringenTable.factuurId, id))
    .orderBy(factuurHerinneringenTable.aangemaaktOp);

  res.json(rijen.map((r) => ({
    id: r.id,
    factuur_id: r.factuurId,
    type: r.type,
    verstuurd_op: r.verstuurOp?.toISOString() ?? null,
    verstuurd_door_naam: r.gebruikerNaam ?? null,
    ontvanger_email: r.ontvangerEmail ?? null,
    opmerkingen: r.opmerkingen ?? null,
    aangemaakt_op: r.aangemaaktOp.toISOString(),
  })));
});

// ── POST /facturen/:id/herinneringen ──────────────────────────────────────────
router.post("/facturen/:id/herinneringen", requireBevoegdheid("financieel", 2), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);
  const { type, ontvanger_email, opmerkingen } = req.body as {
    type?: string;
    ontvanger_email?: string;
    opmerkingen?: string;
  };

  const GELDIGE_TYPEN = ["eerste_herinnering", "tweede_herinnering", "aanmaning", "ingebrekestelling"];
  if (!type || !GELDIGE_TYPEN.includes(type)) {
    res.status(400).json({ error: `type is verplicht: ${GELDIGE_TYPEN.join(" | ")}` });
    return;
  }

  const [factuur] = await db.select({ id: facturenTable.id })
    .from(facturenTable).where(eq(facturenTable.id, id)).limit(1);
  if (!factuur) { res.status(404).json({ error: "Factuur niet gevonden" }); return; }

  const userId = sessionUserId(req);
  const [rij] = await db.insert(factuurHerinneringenTable).values({
    factuurId: id,
    gebruikerId: userId,
    type,
    verstuurOp: new Date(),
    ontvangerEmail: ontvanger_email?.trim() || null,
    opmerkingen: opmerkingen?.trim() || null,
  }).returning();

  const [gebruiker] = userId
    ? await db.select({ naam: gebruikersTable.naam }).from(gebruikersTable).where(eq(gebruikersTable.id, userId)).limit(1)
    : [null];

  res.status(201).json({
    id: rij!.id,
    factuur_id: rij!.factuurId,
    type: rij!.type,
    verstuurd_op: rij!.verstuurOp?.toISOString() ?? null,
    verstuurd_door_naam: gebruiker?.naam ?? null,
    ontvanger_email: rij!.ontvangerEmail ?? null,
    opmerkingen: rij!.opmerkingen ?? null,
    aangemaakt_op: rij!.aangemaaktOp.toISOString(),
  });
});

// ── POST /facturen/:id/incasso ────────────────────────────────────────────────
router.post("/facturen/:id/incasso", requireBevoegdheid("financieel", 3), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);
  const { incasso_referentie, opmerkingen } = req.body as { incasso_referentie?: string; opmerkingen?: string };

  const [factuur] = await db.select().from(facturenTable).where(eq(facturenTable.id, id)).limit(1);
  if (!factuur) { res.status(404).json({ error: "Factuur niet gevonden" }); return; }

  const userId = sessionUserId(req);

  await db.update(facturenTable).set({
    betaalstatus: "incasso",
    incassoDatum: new Date().toISOString().slice(0, 10),
    incassoReferentie: incasso_referentie?.trim() || null,
    bijgewerktOp: new Date(),
  }).where(eq(facturenTable.id, id));

  // Registreer als herinnering-stap in de tijdlijn
  if (opmerkingen?.trim()) {
    const userId2 = userId;
    await db.insert(factuurHerinneringenTable).values({
      factuurId: id,
      gebruikerId: userId2,
      type: "incasso",
      verstuurOp: new Date(),
      opmerkingen: opmerkingen.trim(),
    });
  }

  const bijgewerkt = await db.select().from(facturenTable).where(eq(facturenTable.id, id)).limit(1);
  res.json(mapFactuur(bijgewerkt[0]!));
});

// ── POST /facturen/:id/forceer-herexport ───────────────────────────────────────
router.post("/facturen/:id/forceer-herexport", requireBevoegdheid("financieel", 4), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);
  const { reden } = req.body as { reden?: string };

  const [factuur] = await db.select().from(facturenTable).where(eq(facturenTable.id, id)).limit(1);
  if (!factuur) { res.status(404).json({ error: "Niet gevonden" }); return; }

  const [inst] = await db.select().from(accountviewInstellingenTable).limit(1);
  if (!inst?.apiGebruiker) { res.status(503).json({ error: "AccountView niet geconfigureerd" }); return; }

  const client = maakAccountViewClient(inst);

  const boekType = factuur.type === "verkoop" ? "verkoop" : "inkoop";
  const boeking: AccountviewBoeking = {
    dagboek: boekType === "verkoop" ? (inst.dagboekVerkoop ?? "VRK") : (inst.dagboekInkoop ?? "INK"),
    administratiecode: inst.administratiecode ?? "",
    factuurnummer: factuur.factuurnummer!,
    factuurdatum: factuur.factuurdatum!,
    vervaldatum: factuur.vervaldatum ?? factuur.factuurdatum!,
    relatienaam: factuur.relatienaam!,
    relatieCode: factuur.relatieCode ?? undefined,
    omschrijving: factuur.omschrijving ?? `Factuur ${factuur.factuurnummer}`,
    bedragExclBtw: parseFloat(factuur.bedragExclBtw ?? "0"),
    btwBedrag: parseFloat(factuur.btwBedrag ?? "0"),
    bedragInclBtw: parseFloat(factuur.bedragInclBtw ?? "0"),
    btwCode: factuur.btwCode ?? undefined,
    grootboekrekening: factuur.grootboekrekening ?? inst.grootboekStandaard ?? undefined,
    kostenplaats: factuur.kostenplaats ?? undefined,
    projectCode: factuur.projectCode ?? undefined,
    type: boekType,
  };

  const payloadStr = JSON.stringify(boeking);
  const payloadHash = crypto.createHash("sha256").update(payloadStr).digest("hex");

  // F0 — Idempotency guard: blokkeer herexport met identieke payload die al geslaagd is.
  // Voorkomt dubbele boeking in AccountView bij meervoudig klikken of race-condition.
  const [bestaandGelukt] = await db.select({ id: accountviewExportLogsTable.id })
    .from(accountviewExportLogsTable)
    .where(and(
      eq(accountviewExportLogsTable.factuurId, id),
      eq(accountviewExportLogsTable.payloadHash, payloadHash),
      eq(accountviewExportLogsTable.status, "geslaagd"),
    ))
    .limit(1);

  if (bestaandGelukt) {
    res.status(409).json({
      error: "Identieke herexport geblokkeerd",
      detail: "Deze factuur is al met exact dezelfde gegevens succesvol geëxporteerd. Controleer de export-logs of pas de factuurgegevens aan.",
    });
    return;
  }

  const userId = sessionUserId(req);
  const [logEntry] = await db.insert(accountviewExportLogsTable).values({
    factuurId: id,
    gebruikerId: userId,
    testmodus: inst.testmodus,
    actie: "herexport",
    verzondenPayload: boeking as unknown as Record<string, unknown>,
    payloadHash,
    status: "bezig",
  }).returning();

  const resultaat = await client.verzendBoeking(boeking);

  await db.update(accountviewExportLogsTable).set({
    accountviewResponse: resultaat.rawResponse as Record<string, unknown> | null,
    httpStatus: resultaat.httpStatus ?? null,
    status: resultaat.geslaagd ? "geslaagd" : "mislukt",
    accountviewBoekingId: resultaat.boekingId ?? null,
    foutmelding: resultaat.foutmelding ?? null,
  }).where(eq(accountviewExportLogsTable.id, logEntry.id));

  if (resultaat.geslaagd) {
    await db.update(facturenTable).set({
      accountviewBoekingId: resultaat.boekingId ?? null,
      accountviewExportOp: new Date(),
      accountviewStatus: "success",
      accountviewFout: null,
      payloadHash,
      herexportOp: new Date(),
      herexportDoor: userId,
      herexportReden: reden ?? null,
      status: "verwerkt",
      bijgewerktOp: new Date(),
    }).where(eq(facturenTable.id, id));
  } else {
    await db.update(facturenTable).set({
      accountviewStatus: "error",
      accountviewFout: resultaat.foutmelding ?? "Onbekende fout",
      status: "fout_bij_verzending",
      bijgewerktOp: new Date(),
    }).where(eq(facturenTable.id, id));
  }

  const [updated] = await db.select().from(facturenTable).where(eq(facturenTable.id, id)).limit(1);
  res.json({
    status: resultaat.geslaagd ? "geslaagd" : "mislukt",
    factuur_id: id,
    boeking_id: resultaat.boekingId ?? null,
    foutmelding: resultaat.foutmelding ?? null,
    testmodus: inst.testmodus,
  });
  void updated;
});

// ── POST /facturen/batch-export ────────────────────────────────────────────────
router.post("/facturen/batch-export", requireBevoegdheid("financieel", 4), async (req: Request, res: Response): Promise<void> => {
  const { factuur_ids } = req.body as { factuur_ids?: number[] };
  if (!Array.isArray(factuur_ids) || factuur_ids.length === 0) {
    res.status(400).json({ error: "factuur_ids is verplicht en mag niet leeg zijn" }); return;
  }

  const [inst] = await db.select().from(accountviewInstellingenTable).limit(1);
  if (!inst?.apiGebruiker) { res.status(503).json({ error: "AccountView niet geconfigureerd" }); return; }

  const client = maakAccountViewClient(inst);
  const userId = sessionUserId(req);
  const resultaten: Array<{ status: string; factuur_id: number; boeking_id: string | null; foutmelding: string | null; testmodus: boolean }> = [];

  for (const fid of factuur_ids) {
    const [factuur] = await db.select().from(facturenTable).where(eq(facturenTable.id, fid)).limit(1);
    if (!factuur) {
      resultaten.push({ status: "mislukt", factuur_id: fid, boeking_id: null, foutmelding: "Niet gevonden", testmodus: inst.testmodus });
      continue;
    }
    if (factuur.geblokkeerd || !factuur.geaccordeerd) {
      resultaten.push({ status: "mislukt", factuur_id: fid, boeking_id: null, foutmelding: "Niet akkoord of geblokkeerd", testmodus: inst.testmodus });
      continue;
    }

    const batchBoekType = factuur.type === "verkoop" ? "verkoop" : "inkoop";
    const boeking: AccountviewBoeking = {
      dagboek: batchBoekType === "verkoop" ? (inst.dagboekVerkoop ?? "VRK") : (inst.dagboekInkoop ?? "INK"),
      administratiecode: inst.administratiecode ?? "",
      factuurnummer: factuur.factuurnummer!,
      factuurdatum: factuur.factuurdatum!,
      vervaldatum: factuur.vervaldatum ?? factuur.factuurdatum!,
      relatienaam: factuur.relatienaam!,
      relatieCode: factuur.relatieCode ?? undefined,
      omschrijving: factuur.omschrijving ?? `Factuur ${factuur.factuurnummer}`,
      bedragExclBtw: parseFloat(factuur.bedragExclBtw ?? "0"),
      btwBedrag: parseFloat(factuur.btwBedrag ?? "0"),
      bedragInclBtw: parseFloat(factuur.bedragInclBtw ?? "0"),
      btwCode: factuur.btwCode ?? undefined,
      grootboekrekening: factuur.grootboekrekening ?? inst.grootboekStandaard ?? undefined,
      kostenplaats: factuur.kostenplaats ?? undefined,
      projectCode: factuur.projectCode ?? undefined,
      type: factuur.type === "verkoop" ? "verkoop" : "inkoop",
    };

    const payloadStr = JSON.stringify(boeking);
    const payloadHash = crypto.createHash("sha256").update(payloadStr).digest("hex");

    const [logEntry] = await db.insert(accountviewExportLogsTable).values({
      factuurId: fid,
      gebruikerId: userId,
      testmodus: inst.testmodus,
      actie: "export",
      verzondenPayload: boeking as unknown as Record<string, unknown>,
      payloadHash,
      status: "bezig",
    }).returning();

    const resultaat = await client.verzendBoeking(boeking);

    await db.update(accountviewExportLogsTable).set({
      accountviewResponse: resultaat.rawResponse as Record<string, unknown> | null,
      httpStatus: resultaat.httpStatus ?? null,
      status: resultaat.geslaagd ? "geslaagd" : "mislukt",
      accountviewBoekingId: resultaat.boekingId ?? null,
      foutmelding: resultaat.foutmelding ?? null,
    }).where(eq(accountviewExportLogsTable.id, logEntry.id));

    if (resultaat.geslaagd) {
      await db.update(facturenTable).set({
        accountviewBoekingId: resultaat.boekingId ?? null,
        accountviewExportOp: new Date(),
        accountviewStatus: "success",
        accountviewFout: null,
        payloadHash,
        status: "verwerkt",
        bijgewerktOp: new Date(),
      }).where(eq(facturenTable.id, fid));
    } else {
      await db.update(facturenTable).set({
        accountviewStatus: "error",
        accountviewFout: resultaat.foutmelding ?? "Onbekende fout",
        status: "fout_bij_verzending",
        bijgewerktOp: new Date(),
      }).where(eq(facturenTable.id, fid));
    }

    resultaten.push({
      status: resultaat.geslaagd ? "geslaagd" : "mislukt",
      factuur_id: fid,
      boeking_id: resultaat.boekingId ?? null,
      foutmelding: resultaat.foutmelding ?? null,
      testmodus: inst.testmodus,
    });
  }

  const geslaagd = resultaten.filter((r) => r.status === "geslaagd").length;
  res.json({
    totaal: resultaten.length,
    geslaagd,
    mislukt: resultaten.length - geslaagd,
    resultaten,
  });
});

// ── F1: Factuurregels CRUD ─────────────────────────────────────────────────────
// GET /facturen/:id/regels
router.get("/facturen/:id/regels", requireBevoegdheid("financieel", 1), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);
  const regels = await db.select().from(factuurRegelsTable)
    .where(eq(factuurRegelsTable.factuurId, id))
    .orderBy(factuurRegelsTable.regelnummer);
  res.json(regels.map((r) => ({
    id: r.id,
    factuur_id: r.factuurId,
    regelnummer: r.regelnummer,
    omschrijving: r.omschrijving,
    hoeveelheid: r.hoeveelheid,
    eenheid: r.eenheid,
    stukprijs: r.stukprijs,
    bedrag_excl_btw: r.bedragExclBtw,
    btw_code: r.btwCode,
    btw_percentage: r.btwPercentage,
    btw_bedrag: r.btwBedrag,
    grootboekrekening: r.grootboekrekening,
    kostenplaats: r.kostenplaats,
    categorie: r.categorie,
    inkoopbon_regel_id: r.inkoopbonRegelId,
    bron: r.bron,
    ai_vertrouwen: r.aiVertrouwen,
    aangemaakt_op: r.aangemaaktOp.toISOString(),
    bijgewerkt_op: r.bijgewerktOp.toISOString(),
  })));
});

// POST /facturen/:id/regels
router.post("/facturen/:id/regels", requireBevoegdheid("financieel", 2), async (req: Request, res: Response): Promise<void> => {
  const factuurId = paramInt(req.params["id"]);
  const [factuur] = await db.select({ id: facturenTable.id }).from(facturenTable)
    .where(eq(facturenTable.id, factuurId)).limit(1);
  if (!factuur) { res.status(404).json({ error: "Factuur niet gevonden" }); return; }

  const body = req.body as {
    omschrijving?: string; regelnummer?: number; hoeveelheid?: number; eenheid?: string;
    stukprijs?: string; bedrag_excl_btw?: string; btw_code?: string; btw_percentage?: number;
    btw_bedrag?: string; grootboekrekening?: string; kostenplaats?: string; categorie?: string;
    inkoopbon_regel_id?: number; bron?: string;
  };
  if (!body.omschrijving?.trim()) {
    res.status(400).json({ error: "omschrijving is verplicht" }); return;
  }

  // Volgende regelnummer bepalen
  const [maxRegel] = await db.select({ max: sql<number>`MAX(regelnummer)` })
    .from(factuurRegelsTable).where(eq(factuurRegelsTable.factuurId, factuurId));
  const volgendNummer = (maxRegel?.max ?? 0) + 1;

  const [rij] = await db.insert(factuurRegelsTable).values({
    factuurId,
    regelnummer: body.regelnummer ?? volgendNummer,
    omschrijving: body.omschrijving.trim(),
    hoeveelheid: body.hoeveelheid ?? null,
    eenheid: body.eenheid ?? null,
    stukprijs: body.stukprijs ?? null,
    bedragExclBtw: body.bedrag_excl_btw ?? null,
    btwCode: body.btw_code ?? null,
    btwPercentage: body.btw_percentage ?? null,
    btwBedrag: body.btw_bedrag ?? null,
    grootboekrekening: body.grootboekrekening ?? null,
    kostenplaats: body.kostenplaats ?? null,
    categorie: body.categorie ?? null,
    inkoopbonRegelId: body.inkoopbon_regel_id ?? null,
    bron: body.bron ?? "handmatig",
  }).returning();
  res.status(201).json({ id: rij.id, factuur_id: rij.factuurId, regelnummer: rij.regelnummer });
});

// PATCH /facturen/:id/regels/:rid
router.patch("/facturen/:id/regels/:rid", requireBevoegdheid("financieel", 2), async (req: Request, res: Response): Promise<void> => {
  const factuurId = paramInt(req.params["id"]);
  const rid = paramInt(req.params["rid"]);
  const [rij] = await db.select().from(factuurRegelsTable)
    .where(and(eq(factuurRegelsTable.id, rid), eq(factuurRegelsTable.factuurId, factuurId))).limit(1);
  if (!rij) { res.status(404).json({ error: "Regel niet gevonden" }); return; }

  const body = req.body as Record<string, unknown>;
  const update: Partial<typeof factuurRegelsTable.$inferInsert> = { bijgewerktOp: new Date() };
  if ("omschrijving" in body) update.omschrijving = body["omschrijving"] as string;
  if ("regelnummer" in body) update.regelnummer = body["regelnummer"] as number;
  if ("hoeveelheid" in body) update.hoeveelheid = body["hoeveelheid"] as number | null;
  if ("eenheid" in body) update.eenheid = body["eenheid"] as string | null;
  if ("stukprijs" in body) update.stukprijs = body["stukprijs"] as string | null;
  if ("bedrag_excl_btw" in body) update.bedragExclBtw = body["bedrag_excl_btw"] as string | null;
  if ("btw_code" in body) update.btwCode = body["btw_code"] as string | null;
  if ("btw_percentage" in body) update.btwPercentage = body["btw_percentage"] as number | null;
  if ("btw_bedrag" in body) update.btwBedrag = body["btw_bedrag"] as string | null;
  if ("grootboekrekening" in body) update.grootboekrekening = body["grootboekrekening"] as string | null;
  if ("kostenplaats" in body) update.kostenplaats = body["kostenplaats"] as string | null;
  if ("categorie" in body) update.categorie = body["categorie"] as string | null;
  if ("inkoopbon_regel_id" in body) update.inkoopbonRegelId = body["inkoopbon_regel_id"] as number | null;

  const [updated] = await db.update(factuurRegelsTable).set(update)
    .where(eq(factuurRegelsTable.id, rid)).returning();
  res.json({ id: updated.id, bijgewerkt_op: updated.bijgewerktOp.toISOString() });
});

// DELETE /facturen/:id/regels/:rid
router.delete("/facturen/:id/regels/:rid", requireBevoegdheid("financieel", 2), async (req: Request, res: Response): Promise<void> => {
  const factuurId = paramInt(req.params["id"]);
  const rid = paramInt(req.params["rid"]);
  const [rij] = await db.select({ id: factuurRegelsTable.id }).from(factuurRegelsTable)
    .where(and(eq(factuurRegelsTable.id, rid), eq(factuurRegelsTable.factuurId, factuurId))).limit(1);
  if (!rij) { res.status(404).json({ error: "Regel niet gevonden" }); return; }
  await db.delete(factuurRegelsTable).where(eq(factuurRegelsTable.id, rid));
  res.status(204).end();
});

// ── F1: Factuur-termijnen CRUD (termijnschema per opdracht) ──────────────────
// GET /opdrachten/:opdrachtId/factuur-termijnen
router.get("/opdrachten/:opdrachtId/factuur-termijnen", requireBevoegdheid("financieel", 1), async (req: Request, res: Response): Promise<void> => {
  const opdrachtId = paramInt(req.params["opdrachtId"]);
  const termijnen = await db.select().from(factuurTermijnenTable)
    .where(eq(factuurTermijnenTable.opdrachtId, opdrachtId))
    .orderBy(factuurTermijnenTable.volgnummer);
  res.json(termijnen.map((t) => ({
    id: t.id,
    opdracht_id: t.opdrachtId,
    volgnummer: t.volgnummer,
    omschrijving: t.omschrijving,
    percentage: t.percentage,
    bedrag: t.bedrag,
    status: t.status,
    factuur_id: t.factuurId,
    vervaldatum: t.vervaldatum,
    aangemaakt_op: t.aangemaaktOp.toISOString(),
    bijgewerkt_op: t.bijgewerktOp.toISOString(),
  })));
});

// POST /opdrachten/:opdrachtId/factuur-termijnen
router.post("/opdrachten/:opdrachtId/factuur-termijnen", requireBevoegdheid("financieel", 2), async (req: Request, res: Response): Promise<void> => {
  const opdrachtId = paramInt(req.params["opdrachtId"]);
  const body = req.body as {
    volgnummer?: number; omschrijving?: string; percentage?: number;
    bedrag?: string; status?: string; vervaldatum?: string;
  };

  const [maxTermijn] = await db.select({ max: sql<number>`MAX(volgnummer)` })
    .from(factuurTermijnenTable).where(eq(factuurTermijnenTable.opdrachtId, opdrachtId));

  const [rij] = await db.insert(factuurTermijnenTable).values({
    opdrachtId,
    volgnummer: body.volgnummer ?? (maxTermijn?.max ?? 0) + 1,
    omschrijving: body.omschrijving ?? null,
    percentage: body.percentage ?? null,
    bedrag: body.bedrag ?? null,
    status: body.status ?? "gepland",
    vervaldatum: body.vervaldatum ?? null,
  }).returning();
  res.status(201).json({ id: rij.id, opdracht_id: rij.opdrachtId, volgnummer: rij.volgnummer });
});

// PATCH /opdrachten/:opdrachtId/factuur-termijnen/:tid
router.patch("/opdrachten/:opdrachtId/factuur-termijnen/:tid", requireBevoegdheid("financieel", 2), async (req: Request, res: Response): Promise<void> => {
  const opdrachtId = paramInt(req.params["opdrachtId"]);
  const tid = paramInt(req.params["tid"]);
  const [rij] = await db.select().from(factuurTermijnenTable)
    .where(and(eq(factuurTermijnenTable.id, tid), eq(factuurTermijnenTable.opdrachtId, opdrachtId))).limit(1);
  if (!rij) { res.status(404).json({ error: "Termijn niet gevonden" }); return; }

  const body = req.body as Record<string, unknown>;
  const update: Partial<typeof factuurTermijnenTable.$inferInsert> = { bijgewerktOp: new Date() };
  if ("omschrijving" in body) update.omschrijving = body["omschrijving"] as string | null;
  if ("percentage" in body) update.percentage = body["percentage"] as number | null;
  if ("bedrag" in body) update.bedrag = body["bedrag"] as string | null;
  if ("status" in body) update.status = body["status"] as string;
  if ("vervaldatum" in body) update.vervaldatum = body["vervaldatum"] as string | null;
  if ("factuur_id" in body) update.factuurId = body["factuur_id"] as number | null;

  const [updated] = await db.update(factuurTermijnenTable).set(update)
    .where(eq(factuurTermijnenTable.id, tid)).returning();
  res.json({ id: updated.id, status: updated.status, bijgewerkt_op: updated.bijgewerktOp.toISOString() });
});

export default router;
