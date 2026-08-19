import { veiligeFoutmelding } from "../middlewares/foutafhandelaar";
import { kenmerkVoorFactuur, formatNummer, herzieningsLetter } from "../lib/kenmerk";
import { bepaalFactuurWerkmaatschappij, controleerFactuurAdministratieBv } from "../services/factuurWerkmaatschappij";
import { Router } from "express";
import type { Request, Response } from "express";
import * as XLSX from "xlsx";
import { FACTUUR_UITLEZEN_PROMPT } from "../lib/aiPrompts";
import {
  db,
  facturenTable,
  accountviewInstellingenTable,
  grootboekrekeningenTable,
  btwCodesTable,
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
  offertesTable,
  offerteRegelsTable,
  projectBegrotingenTable,
  werkbegrotingRegelsTable,
  crmKlantenTable,
  factuurnummerTellersTable,
  werkgeversTable,
  factuurSignalenTable,
  factuurTijdlijnTable,
  inkoopbonnenTable,
  inkoopbonRegelsTable,
  FACTUUR_AFWIJSREDENEN,
  type FactuurAfwijsredenCode,
} from "@workspace/db";
import { eq, and, desc, sql, or, gte, count, isNull, isNotNull, ne, lt, sum, ilike, inArray } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { logActiviteit } from "../lib/activiteit";
import { ObjectStorageService } from "../lib/objectStorage";
import { maakAccountViewClient } from "../services/accountview-client";
import type { AccountviewBoeking } from "../services/accountview-client";
import { exporteerFactuurNaarAccountView, probeerAutomatischeBoeking, claimAccountviewVerzending, hercontroleerBvNaClaim, controleerBoekingsschema } from "../services/accountviewExportService";
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
import { controleerFactuurRegels, type FactuurPrijscontrole } from "../services/factuurPrijscontrole";
// FACTUUR_02 §2/§5 — facturen in de mailstroom hebben eigen statussen; de oude
// accordeer-/goedkeuringspaden mogen die stroom nooit passeren.
const STROOM_STATUSSEN = new Set(["wacht_op_inkoper", "wacht_op_goedkeuring", "klaar_voor_betaling"]);
const STROOM_MELDING = "Deze factuur zit in de factuurstroom. Gebruik de stroomacties (inkoper bevestigen, goedkeuren of afwijzen) op de factuurdetailpagina.";
import { verstuurMail, isGeconfigureerd as mailIsGeconfigureerd } from "../services/email";
import { schrijfTijdlijn, maakAfwijsMailTekst } from "../services/factuurstroomService";
import { verwerkMandagstaatVoorFactuur } from "../lib/mandagstaat";
import { PermissieService } from "../lib/permissie-service";
import { berekenEffectieveBevoegdheden } from "../lib/effectieve-bevoegdheden";

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
  // Het sessieveld heet userId — rechtstreeks opvragen, geen cast nodig.
  return req.session.userId ?? null;
}
function paramInt(val: unknown): number {
  return parseInt(String(val), 10);
}


async function mapFactuur(r: typeof facturenTable.$inferSelect) {
  const factuurBv = await bepaalFactuurWerkmaatschappij(r);
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
    // NUMMER_01 §4.6: F-nummer per offerte + kenmerk (O405/F002); het fiscale
    // factuurnummer staat los daarvan in `factuurnummer`.
    offerte_id: r.offerteId,
    nummer: r.nummer,
    kenmerk: r.kenmerk ?? (await kenmerkVoorFactuur(r.offerteId, r.nummer)),
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
    // ADMINISTRATIE_01 fase 3: BV van het werk (offerte → opdracht → gebouw-default)
    werkmaatschappij_id: factuurBv?.id ?? null,
    werkmaatschappij_naam: factuurBv?.naam ?? null,
    werkmaatschappij_bron: factuurBv?.bron ?? null,
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
    bron: r.bron,
    import_id: r.importId ?? null,
    aangemaakt_op: r.aangemaaktOp.toISOString(),
    bijgewerkt_op: r.bijgewerktOp.toISOString(),
  };
}

// UREN_01 §6c.2/§9.16 — mandagstaat-koppeling aan de verkoopfactuur.
// Genereert de mandagsta(a)t(en) voor een verkoopfactuur op een mandagstaat-
// vereiste opdracht en slaat die op in object storage NAAST de factuur, zodat
// aantoonbaar is dat hij met de factuur meegaat. De centrale policy
// (magMandagstaatGenereren) bepaalt of de acterende gebruiker dit mag; zonder
// recht komt er GEEN bijlage maar een niet-blokkerende waarschuwing. Factureren
// wordt NOOIT geblokkeerd (§7). BSN blijft binnen het PDF-document (§6c.3).
async function mandagstatenVoorVerkoopfactuur(
  factuur: typeof facturenTable.$inferSelect,
  perm: PermissieService,
  gebruikerId: number | null,
): Promise<{ paden: string[]; waarschuwing: string | null }> {
  if (factuur.type !== "verkoop" || !factuur.opdrachtId) return { paden: [], waarschuwing: null };
  const [opdracht] = await db
    .select({ id: opdrachtenTable.id, mandagstaatVereist: opdrachtenTable.mandagstaatVereist, gebouwId: opdrachtenTable.gebouwId, werknummer: opdrachtenTable.werknummer })
    .from(opdrachtenTable)
    .where(eq(opdrachtenTable.id, factuur.opdrachtId))
    .limit(1);
  if (!opdracht) return { paden: [], waarschuwing: null };

  return verwerkMandagstaatVoorFactuur({
    factuurId: factuur.id,
    opdracht,
    perm,
    gebruikerId,
    // Geen expliciete factuurperiode → generator kiest laatst goedgekeurde week.
    van: null,
    tot: null,
  });
}

// ── GET /facturen/upload-url ───────────────────────────────────────────────────
router.post("/facturen/upload-url", requireBevoegdheid("financieel", 2), async (req: Request, res: Response): Promise<void> => {
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
  const opdrachtFilter = req.query["opdracht_id"] ? Number.parseInt(String(req.query["opdracht_id"]), 10) : null;
  const klaarFilter = req.query["klaar_voor_export"] === "true";
  const conditions = [];
  if (statusFilter) conditions.push(eq(facturenTable.status, statusFilter));
  if (typeFilter) conditions.push(eq(facturenTable.type, typeFilter));
  if (klaarFilter) conditions.push(eq(facturenTable.status, "klaar_voor_accountview"));
  if (opdrachtFilter != null && Number.isFinite(opdrachtFilter)) conditions.push(eq(facturenTable.opdrachtId, opdrachtFilter));

  const rijen = await db.select().from(facturenTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(facturenTable.aangemaaktOp));
  const mapped = await Promise.all(rijen.map(mapFactuur));
  res.json(mapped);
});

// ── POST /facturen ─────────────────────────────────────────────────────────────
router.post("/facturen", requireBevoegdheid("financieel", 2), async (req: Request, res: Response): Promise<void> => {
  const body = req.body as {
    type?: string; subtype?: string | null; factuurnummer?: string; factuurdatum?: string; vervaldatum?: string;
    omschrijving?: string; relatienaam?: string; relatie_code?: string; relatie_adres?: string;
    bedrag_excl_btw?: string; btw_bedrag?: string; bedrag_incl_btw?: string;
    btw_code?: string; grootboekrekening?: string; kostenplaats?: string; project_code?: string;
    pdf_url?: string; bestandsnaam?: string; gebouw_id?: number; offerte_id?: number;
  };
  // FACTUUR_02 §2 — één ingang: inkoopfacturen komen uitsluitend via de
  // factuurmailbox binnen. Handmatig aanmaken is beperkt tot verkoopfacturen.
  if ((body.type ?? "inkoop") !== "verkoop") {
    res.status(422).json({
      error: "Inkoopfacturen kunnen alleen via de factuurmailbox binnenkomen",
      detail: "Handmatig uploaden is beperkt tot verkoopfacturen. Laat de leverancier de factuur naar de factuurmailbox sturen; de factuurstroom pakt hem automatisch op.",
    });
    return;
  }
  const TOEGESTANE_SUBTYPES = new Set(["creditnota", "prijsafwijking"]);
  const subtype = body.subtype && TOEGESTANE_SUBTYPES.has(body.subtype) ? body.subtype : null;
  // NUMMER_01 §4.6: verkoopfactuur onder een offerte krijgt bij aanmaak een
  // F-volgnummer per offerte (F001, F002, …) — het fiscale factuurnummer wordt
  // pas bij definitief maken uitgegeven en een concept verbruikt er dus geen.
  let offerteId: number | null = null;
  let fNummer: number | null = null;
  if (body.offerte_id != null) {
    const [offerte] = await db
      .select({ id: offertesTable.id })
      .from(offertesTable)
      .where(eq(offertesTable.id, body.offerte_id));
    if (!offerte) {
      res.status(400).json({ error: "offerte_id verwijst niet naar een bestaande offerte" });
      return;
    }
    offerteId = offerte.id;
  }

  const [rij] = await db.transaction(async (tx) => {
    if (offerteId != null) {
      // Advisory lock per offerte: twee gelijktijdige facturen onder dezelfde
      // offerte krijgen gegarandeerd F001 en F002 (nooit twee keer F001).
      await tx.execute(sql`SELECT pg_advisory_xact_lock(864201, ${offerteId})`);
      const [m] = await tx
        .select({ max: sql<number>`COALESCE(MAX(${facturenTable.nummer}), 0)` })
        .from(facturenTable)
        .where(eq(facturenTable.offerteId, offerteId));
      fNummer = Number(m?.max ?? 0) + 1;
    }
    return tx.insert(facturenTable).values({
    type: "verkoop",
    subtype,
    offerteId,
    nummer: fNummer,
    // NUMMER_01 §4.6: het fiscale factuurnummer wordt UITSLUITEND door
    // /facturen/:id/definitief uitgegeven — nooit door de client meegegeven.
    factuurnummer: null,
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
  });
  res.status(201).json(await mapFactuur(rij));
});

// ── GET /facturen/factuurnummer-tellers ───────────────────────────────────────
// NUMMER_01 actiepunt: geeft per BV de huidige tellerstatus zodat de accountant
// kan controleren of de startteller correct is gezet vóór de eerste definitieve
// factuur in Connect.
router.get("/facturen/factuurnummer-tellers", requireBevoegdheid("financieel", 4), async (_req: Request, res: Response): Promise<void> => {
  const werkgevers = await db
    .select({ id: werkgeversTable.id, naam: werkgeversTable.naam, kenmerkPrefix: werkgeversTable.kenmerkPrefix })
    .from(werkgeversTable)
    .orderBy(werkgeversTable.naam);
  const tellers = await db.select().from(factuurnummerTellersTable);
  const tellerMap = new Map(tellers.map((t) => [t.werkgeverId, t]));
  res.json(werkgevers.map((w) => {
    const t = tellerMap.get(w.id);
    return {
      werkgever_id: w.id,
      naam: w.naam,
      kenmerk_prefix: w.kenmerkPrefix ?? null,
      laatste_nummer: t?.laatsteNummer ?? 0,
      volgend_nummer: String((t?.laatsteNummer ?? 0) + 1).padStart(5, "0"),
      bijgewerkt_op: t?.bijgewerktOp?.toISOString() ?? null,
      heeft_definitieve_facturen: (t?.laatsteNummer ?? 0) > 0,
    };
  }));
});

// ── PUT /facturen/factuurnummer-tellers/:werkgeverId ───────────────────────────
// NUMMER_01 actiepunt: eenmalig de teller per BV instellen op het laatste nummer
// uit het oude pakket, vóór de eerste definitieve factuur in Connect. Zo worden
// dubbele fiscale nummers richting de belastingdienst voorkomen.
// Vereist: financieel niveau 4 (alleen beheerders) + een verplichte reden.
router.put("/facturen/factuurnummer-tellers/:werkgeverId", requireBevoegdheid("financieel", 4), async (req: Request, res: Response): Promise<void> => {
  const werkgeverId = parseInt(String(req.params.werkgeverId), 10);
  const { nieuwe_waarde, reden } = req.body as { nieuwe_waarde?: unknown; reden?: unknown };
  if (typeof nieuwe_waarde !== "number" || !Number.isInteger(nieuwe_waarde) || nieuwe_waarde < 0) {
    res.status(400).json({ error: "nieuwe_waarde is verplicht en moet een niet-negatief geheel getal zijn" });
    return;
  }
  if (!reden || typeof reden !== "string" || !reden.trim()) {
    res.status(400).json({ error: "reden is verplicht (bijv. 'Laatste nummer uit oud pakket vóór overstap: 142')" });
    return;
  }

  const [werkgever] = await db
    .select({ id: werkgeversTable.id, naam: werkgeversTable.naam })
    .from(werkgeversTable)
    .where(eq(werkgeversTable.id, werkgeverId));
  if (!werkgever) { res.status(404).json({ error: "Werkgever niet gevonden" }); return; }

  // Blokkeer verlagen als er al definitieve facturen zijn (laatste_nummer > 0):
  // dat zou fiscale gaten opleveren in de reeks.
  const [huidig] = await db
    .select()
    .from(factuurnummerTellersTable)
    .where(eq(factuurnummerTellersTable.werkgeverId, werkgeverId));
  if (huidig && huidig.laatsteNummer > 0 && nieuwe_waarde < huidig.laatsteNummer) {
    res.status(409).json({
      error: "De teller kan niet worden verlaagd: er zijn al definitieve facturen uitgegeven voor deze BV.",
      laatste_nummer: huidig.laatsteNummer,
      detail: "Verlagen zou fiscale gaten (ontbrekende nummers) opleveren. Neem contact op met de systeembeheerder als dit een noodcorrectie vereist.",
    });
    return;
  }

  const [bijgewerkt] = await db
    .insert(factuurnummerTellersTable)
    .values({ werkgeverId, laatsteNummer: nieuwe_waarde, bijgewerktOp: new Date() })
    .onConflictDoUpdate({
      target: factuurnummerTellersTable.werkgeverId,
      set: { laatsteNummer: nieuwe_waarde, bijgewerktOp: new Date() },
    })
    .returning();

  res.json({
    werkgever_id: werkgeverId,
    naam: werkgever.naam,
    laatste_nummer: bijgewerkt.laatsteNummer,
    volgend_nummer: String(bijgewerkt.laatsteNummer + 1).padStart(5, "0"),
    bijgewerkt_op: bijgewerkt.bijgewerktOp.toISOString(),
    heeft_definitieve_facturen: bijgewerkt.laatsteNummer > 0,
    reden_opgeslagen: reden.trim(),
  });
});

// ── POST /facturen/:id/definitief ─────────────────────────────────────────────
// NUMMER_01 §4.6: pas bij het definitief maken van een verkoopfactuur wordt het
// fiscale factuurnummer uitgegeven — per BV, doorlopend, teller onder slot in
// één transactie. Een concept verbruikt dus nooit een fiscaal nummer.
router.post("/facturen/:id/definitief", requireBevoegdheid("financieel", 2), async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  const [factuur] = await db.select().from(facturenTable).where(eq(facturenTable.id, id));
  if (!factuur) { res.status(404).json({ error: "Factuur niet gevonden" }); return; }
  if (factuur.type !== "verkoop") {
    res.status(422).json({ error: "Alleen verkoopfacturen krijgen een fiscaal nummer uit de eigen reeks" });
    return;
  }
  if (factuur.factuurnummer) {
    res.status(409).json({ error: "Deze factuur heeft al een fiscaal factuurnummer", factuurnummer: factuur.factuurnummer });
    return;
  }

  // ADMINISTRATIE_01 fase 3: de fiscale reeks volgt de BV van het WERK via
  // dezelfde gedeelde keten als print/export (offerte → opdracht →
  // gebouw-default) — nooit een eigen afwijkende afleiding, anders krijgt
  // een factuur van BV B het nummer uit de reeks van BV A.
  const factuurBv = await bepaalFactuurWerkmaatschappij(factuur);
  const werkgeverId = factuurBv?.id ?? null;
  if (!werkgeverId) {
    res.status(422).json({
      error: "Geen BV bepaalbaar voor de fiscale reeks",
      detail: "Stel de werkmaatschappij in op het werk (offerte/opdracht) of koppel de factuur aan een gebouw met BV; het fiscale factuurnummer is per BV.",
    });
    return;
  }

  const resultaat = await db.transaction(async (tx) => {
    // Row-lock op de factuur + hercheck ín de transactie: twee gelijktijdige
    // definitief-verzoeken kunnen anders elk een tellernummer verbruiken.
    const [vergrendeld] = await tx
      .select({ factuurnummer: facturenTable.factuurnummer })
      .from(facturenTable)
      .where(eq(facturenTable.id, id))
      .for("update");
    if (!vergrendeld || vergrendeld.factuurnummer) return null;
    // Teller per BV onder slot: eerst rij garanderen, dan atomair ophogen.
    await tx
      .insert(factuurnummerTellersTable)
      .values({ werkgeverId: werkgeverId!, laatsteNummer: 0 })
      .onConflictDoNothing();
    const [teller] = await tx
      .update(factuurnummerTellersTable)
      .set({ laatsteNummer: sql`${factuurnummerTellersTable.laatsteNummer} + 1`, bijgewerktOp: new Date() })
      .where(eq(factuurnummerTellersTable.werkgeverId, werkgeverId!))
      .returning();
    const fiscaal = String(teller.laatsteNummer).padStart(5, "0");
    const kenmerk = await kenmerkVoorFactuur(factuur.offerteId, factuur.nummer);
    const [bijgewerkt] = await tx
      .update(facturenTable)
      .set({ factuurnummer: fiscaal, kenmerk, bijgewerktOp: new Date() })
      .where(eq(facturenTable.id, id))
      .returning();
    return bijgewerkt;
  });
  if (!resultaat) {
    res.status(409).json({ error: "Deze factuur heeft al een fiscaal factuurnummer" });
    return;
  }

  // §6c.2/§9.16: mandagstaat bij het definitief maken. De PDF('s) worden naast de
  // factuur in object storage opgeslagen zodat ze aantoonbaar met de factuur
  // meegaan; de paden komen terug in de respons. Nooit blokkerend — ontbreken
  // (geen uren of geen personeelsrecht) levert alleen een waarschuwing.
  const { paden, waarschuwing } = await mandagstatenVoorVerkoopfactuur(resultaat, req.permissies!, sessionUserId(req));
  res.json({
    ...(await mapFactuur(resultaat)),
    mandagstaat_waarschuwing: waarschuwing,
    mandagstaat_paden: paden,
  });
});

// ── GELDSTROOM_01: verkoopfactuur samenstellen uit offerte of werkbegroting ──
// KETEN_01 B2: op de opdracht was een verkoopfactuur alleen te uploaden, niet
// samen te stellen. Dit endpoint maakt een CONCEPT-verkoopfactuur mét regels
// uit de gekozen bron. Regels blijven daarna aanpasbaar via de bestaande
// regel-CRUD; het fiscale nummer komt pas bij /facturen/:id/definitief.
router.post("/opdrachten/:id/verkoopfactuur", requireBevoegdheid("financieel", 2), async (req: Request, res: Response): Promise<void> => {
  const opdrachtId = paramInt(req.params["id"]);
  const bron = String((req.body as { bron?: string }).bron ?? "");
  if (bron !== "offerte" && bron !== "werkbegroting") {
    res.status(400).json({ error: "bron moet 'offerte' of 'werkbegroting' zijn" });
    return;
  }
  const [opdracht] = await db.select().from(opdrachtenTable).where(eq(opdrachtenTable.id, opdrachtId)).limit(1);
  if (!opdracht) { res.status(404).json({ error: "Opdracht niet gevonden" }); return; }

  type ConceptRegel = { omschrijving: string; hoeveelheid: number | null; eenheid: string | null; stukprijs: string | null; bedragExclBtw: string };
  const conceptRegels: ConceptRegel[] = [];

  if (bron === "offerte") {
    if (!opdracht.offerteId) {
      res.status(422).json({ error: "Deze opdracht heeft geen gekoppelde offerte; kies de werkbegroting als bron." });
      return;
    }
    const bronRegels = await db.select().from(offerteRegelsTable)
      .where(eq(offerteRegelsTable.offerteId, opdracht.offerteId))
      .orderBy(offerteRegelsTable.volgorde, offerteRegelsTable.id);
    // ADVIES_01-lijn: optionele regels tellen alleen mee als de klant ze koos.
    for (const r of bronRegels) {
      if (r.isOptioneel && !r.optioneelGeselecteerd) continue;
      conceptRegels.push({
        omschrijving: r.ruimte ? `${r.maatregel} — ${r.ruimte}` : r.maatregel,
        hoeveelheid: r.aantal,
        eenheid: r.eenheid,
        stukprijs: r.prijsPerEenheid.toFixed(2),
        bedragExclBtw: r.kosten.toFixed(2),
      });
    }
  } else {
    const [begroting] = await db.select().from(projectBegrotingenTable)
      .where(eq(projectBegrotingenTable.opdrachtId, opdrachtId)).limit(1);
    if (!begroting) { res.status(422).json({ error: "Deze opdracht heeft geen werkbegroting; kies de offerte als bron." }); return; }
    const bronRegels = await db.select().from(werkbegrotingRegelsTable)
      .where(eq(werkbegrotingRegelsTable.begrotingId, begroting.id))
      .orderBy(werkbegrotingRegelsTable.id);
    for (const r of bronRegels) {
      conceptRegels.push({
        omschrijving: r.omschrijving,
        hoeveelheid: r.hoeveelheid,
        eenheid: r.eenheid,
        stukprijs: r.tarief.toFixed(2),
        bedragExclBtw: r.totaal.toFixed(2),
      });
    }
  }
  if (conceptRegels.length === 0) {
    res.status(422).json({ error: `De ${bron} bevat geen (meetellende) regels om een factuur uit samen te stellen.` });
    return;
  }

  // BTW per regel: standaard hoog tarief; per regel aanpasbaar via de regel-CRUD.
  // Rekenwerk in centen (architect-review): nooit binaire floats voor totalen.
  const BTW_PCT = 21;
  const regelCenten = conceptRegels.map((r) => {
    const e = naarCenten(r.bedragExclBtw) ?? 0;
    const excl = Number.isNaN(e) ? 0 : e;
    return { excl, btw: Math.round((excl * BTW_PCT) / 100) };
  });
  const totaalExclC = regelCenten.reduce((s, r) => s + r.excl, 0);
  const totaalBtwC = regelCenten.reduce((s, r) => s + r.btw, 0);

  // Relatiegegevens uit de offerteklant (CRM) — anders de opdrachtgever-tekst.
  let relatienaam = opdracht.opdrachtgever ?? null;
  let offerte: typeof offertesTable.$inferSelect | null = null;
  if (opdracht.offerteId) {
    const [o] = await db.select().from(offertesTable).where(eq(offertesTable.id, opdracht.offerteId)).limit(1);
    offerte = o ?? null;
    if (offerte?.klantId) {
      const [k] = await db.select({ naam: crmKlantenTable.naam }).from(crmKlantenTable).where(eq(crmKlantenTable.id, offerte.klantId)).limit(1);
      if (k?.naam) relatienaam = k.naam;
    } else if (offerte?.opdrachtgever) {
      relatienaam = offerte.opdrachtgever;
    }
  }

  const vandaag = new Date();
  const termijnDagen = offerte?.betalingstermijnDagen ?? 30;
  const verval = new Date(vandaag.getTime() + termijnDagen * 86400000);
  const isoDatum = (d: Date) => d.toISOString().slice(0, 10);

  const factuur = await db.transaction(async (tx) => {
    // NUMMER_01 §4.6: F-volgnummer per offerte onder advisory lock — identiek
    // aan POST /facturen zodat concurrent samenstellen nooit twee keer F001 geeft.
    let fNummer: number | null = null;
    if (opdracht.offerteId) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(864201, ${opdracht.offerteId})`);
      const [m] = await tx
        .select({ max: sql<number>`COALESCE(MAX(${facturenTable.nummer}), 0)` })
        .from(facturenTable)
        .where(eq(facturenTable.offerteId, opdracht.offerteId));
      fNummer = Number(m?.max ?? 0) + 1;
    }
    const [rij] = await tx.insert(facturenTable).values({
      type: "verkoop",
      offerteId: opdracht.offerteId ?? null,
      opdrachtId,
      gebouwId: opdracht.gebouwId ?? null,
      nummer: fNummer,
      factuurnummer: null, // fiscaal nummer uitsluitend via /definitief
      factuurdatum: isoDatum(vandaag),
      vervaldatum: isoDatum(verval),
      omschrijving: `Verkoopfactuur bij opdracht ${opdracht.werknummer ?? opdrachtId} — samengesteld uit ${bron}`,
      relatienaam,
      bedragExclBtw: centenNaarBedrag(totaalExclC),
      btwBedrag: centenNaarBedrag(totaalBtwC),
      bedragInclBtw: centenNaarBedrag(totaalExclC + totaalBtwC),
      btwCode: "H",
      projectCode: opdracht.werknummer ?? null,
      uploaderId: sessionUserId(req),
      status: "ontvangen",
    }).returning();
    let regelnummer = 1;
    for (const [i, r] of conceptRegels.entries()) {
      await tx.insert(factuurRegelsTable).values({
        factuurId: rij!.id,
        regelnummer: regelnummer++,
        omschrijving: r.omschrijving,
        hoeveelheid: r.hoeveelheid,
        eenheid: r.eenheid,
        stukprijs: r.stukprijs,
        bedragExclBtw: r.bedragExclBtw,
        btwCode: "H",
        btwPercentage: BTW_PCT,
        btwBedrag: centenNaarBedrag(regelCenten[i]!.btw),
        bron,
      });
    }
    return rij!;
  });

  const userId = sessionUserId(req);
  const [wie] = userId ? await db.select({ naam: gebruikersTable.naam }).from(gebruikersTable).where(eq(gebruikersTable.id, userId)).limit(1) : [];
  await schrijfTijdlijn(factuur.id, `${wie?.naam ?? "Een medewerker"} heeft deze concept-verkoopfactuur samengesteld uit de ${bron} van opdracht ${opdracht.werknummer ?? opdrachtId} (${conceptRegels.length} regels).`, wie?.naam ?? null);
  res.status(201).json({ ...(await mapFactuur(factuur)), aantal_regels: conceptRegels.length });
});

// ── GELDSTROOM_01: definitieve verkoopfactuur naar de klant versturen ─────────
// Pas ná definitief (fiscaal nummer) te versturen. De verzending zelf is de
// expliciete menselijke handeling (verstuur-knop) — direct, niet via wachtrij.
router.post("/facturen/:id/verzenden-klant", requireBevoegdheid("financieel", 3), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);
  const body = req.body as { email?: string; onderwerp?: string; bericht?: string };
  const [factuur] = await db.select().from(facturenTable).where(eq(facturenTable.id, id)).limit(1);
  if (!factuur) { res.status(404).json({ error: "Niet gevonden" }); return; }
  if (factuur.type !== "verkoop") { res.status(422).json({ error: "Alleen verkoopfacturen kunnen naar de klant worden verstuurd" }); return; }
  if (!factuur.factuurnummer) {
    res.status(409).json({ error: "Maak de factuur eerst definitief — versturen kan alleen met een fiscaal factuurnummer (NUMMER_01 §4.6)." });
    return;
  }
  if (!mailIsGeconfigureerd()) { res.status(503).json({ error: "E-mail is niet geconfigureerd" }); return; }

  // Klant-e-mail: expliciet meegegeven, anders uit de CRM-klant van de offerte.
  let naarEmail = body.email?.trim() || null;
  let naarNaam = factuur.relatienaam ?? null;
  if (!naarEmail && factuur.offerteId) {
    const [o] = await db.select({ klantId: offertesTable.klantId }).from(offertesTable).where(eq(offertesTable.id, factuur.offerteId)).limit(1);
    if (o?.klantId) {
      const [k] = await db.select({ email: crmKlantenTable.email, naam: crmKlantenTable.naam }).from(crmKlantenTable).where(eq(crmKlantenTable.id, o.klantId)).limit(1);
      if (k?.email) { naarEmail = k.email; naarNaam = naarNaam ?? k.naam; }
    }
  }
  if (!naarEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(naarEmail)) {
    res.status(422).json({ error: "Geen geldig klant-e-mailadres bekend. Geef een e-mailadres op." });
    return;
  }

  const regels = await db.select().from(factuurRegelsTable)
    .where(eq(factuurRegelsTable.factuurId, id)).orderBy(factuurRegelsTable.regelnummer);
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const euroF = (v: string | null) => v == null ? "" : `€ ${Number.parseFloat(v).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const regelsHtml = regels.map((r) => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;">${esc(r.omschrijving)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${r.hoeveelheid ?? ""} ${esc(r.eenheid ?? "")}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${euroF(r.stukprijs)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${euroF(r.bedragExclBtw)}</td>
    </tr>`).join("");
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#212631;">
      <div style="background:#F23B0D;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;">Factuur ${esc(factuur.factuurnummer)}</h2>
        ${factuur.kenmerk ? `<div style="opacity:.9;font-size:13px;">Kenmerk: ${esc(factuur.kenmerk)}</div>` : ""}
      </div>
      <div style="border:1px solid #eee;border-top:0;padding:20px;border-radius:0 0 8px 8px;">
        <p>Geachte ${esc(naarNaam ?? "relatie")},</p>
        <p>${body.bericht ? esc(body.bericht) : "Hierbij ontvangt u onze factuur. Wij verzoeken u vriendelijk het bedrag binnen de betalingstermijn te voldoen."}</p>
        <table style="margin:12px 0;font-size:14px;">
          <tr><td style="padding:2px 12px 2px 0;color:#666;">Factuurdatum</td><td>${esc(factuur.factuurdatum ?? "")}</td></tr>
          <tr><td style="padding:2px 12px 2px 0;color:#666;">Vervaldatum</td><td>${esc(factuur.vervaldatum ?? "")}</td></tr>
        </table>
        ${regels.length > 0 ? `
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <thead><tr>
            <th style="text-align:left;padding:6px 8px;border-bottom:2px solid #212631;">Omschrijving</th>
            <th style="text-align:right;padding:6px 8px;border-bottom:2px solid #212631;">Aantal</th>
            <th style="text-align:right;padding:6px 8px;border-bottom:2px solid #212631;">Stukprijs</th>
            <th style="text-align:right;padding:6px 8px;border-bottom:2px solid #212631;">Bedrag excl.</th>
          </tr></thead>
          <tbody>${regelsHtml}</tbody>
        </table>` : ""}
        <table style="margin:12px 0 0 auto;font-size:14px;">
          <tr><td style="padding:2px 12px 2px 0;color:#666;">Totaal excl. btw</td><td style="text-align:right;">${euroF(factuur.bedragExclBtw)}</td></tr>
          <tr><td style="padding:2px 12px 2px 0;color:#666;">Btw</td><td style="text-align:right;">${euroF(factuur.btwBedrag)}</td></tr>
          <tr><td style="padding:2px 12px 2px 0;font-weight:bold;">Totaal incl. btw</td><td style="text-align:right;font-weight:bold;">${euroF(factuur.bedragInclBtw)}</td></tr>
        </table>
      </div>
    </div>`;

  const userId = sessionUserId(req);
  await verstuurMail({
    naarEmail,
    naarNaam,
    onderwerp: body.onderwerp?.trim() || `Factuur ${factuur.factuurnummer}${factuur.kenmerk ? ` — ${factuur.kenmerk}` : ""}`,
    html,
    soort: "verkoopfactuur",
    verstuurdDoorId: userId,
    direct: true,
  });
  const [wie] = userId ? await db.select({ naam: gebruikersTable.naam }).from(gebruikersTable).where(eq(gebruikersTable.id, userId)).limit(1) : [];
  await schrijfTijdlijn(id, `${wie?.naam ?? "Een medewerker"} heeft de factuur per e-mail naar de klant verstuurd (${naarEmail}).`, wie?.naam ?? null);
  res.json({ ok: true, naar: naarEmail });
});

// ── GET /facturen/historisch-archief/excel ─────────────────────────────────────
router.get("/facturen/historisch-archief/excel", requireBevoegdheid("financieel", 2), async (_req: Request, res: Response): Promise<void> => {
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
// Legacy-import is uitgeschakeld (FACTUUR_02 §2): facturen komen uitsluitend
// binnen via de factuurmailbox-stroom (werk-inbox met is_factuurmailbox).
router.post("/facturen/mailbox-sync", requireBevoegdheid("financieel", 4), async (_req: Request, res: Response): Promise<void> => {
  res.status(422).json({
    ok: false,
    gecontroleerd: 0,
    aangemaakt: 0,
    overgeslagen: 0,
    mislukt: 0,
    melding: "De oude mailbox-import is vervangen door de factuurstroom. Facturen komen automatisch binnen via de factuurmailbox (werk-inbox); handmatig synchroniseren is niet meer nodig.",
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

// ═══ FACTUUR_02: de factuurstroom ═════════════════════════════════════════════
// Let op routevolgorde: deze niet-geparametriseerde paden moeten vóór /facturen/:id.

// ── GET /facturen/signalen — bewakingsdashboard (Jacqueline, §6) ───────────────
router.get("/facturen/signalen", requireBevoegdheid("financieel", 1), async (req: Request, res: Response): Promise<void> => {
  const status = (req.query["status"] as string | undefined) === "afgehandeld" ? "afgehandeld" : "open";
  const rijen = await db.select({
    id: factuurSignalenTable.id,
    type: factuurSignalenTable.type,
    factuur_id: factuurSignalenTable.factuurId,
    mail_message_id: factuurSignalenTable.mailMessageId,
    projectkans_id: factuurSignalenTable.projectkansId,
    omschrijving: factuurSignalenTable.omschrijving,
    status: factuurSignalenTable.status,
    afhandel_notitie: factuurSignalenTable.afhandelNotitie,
    aangemaakt_op: factuurSignalenTable.aangemaaktOp,
    afgehandeld_op: factuurSignalenTable.afgehandeldOp,
    afgehandeld_door_naam: gebruikersTable.naam,
    factuurnummer: facturenTable.factuurnummer,
    relatienaam: facturenTable.relatienaam,
    factuur_status: facturenTable.status,
  })
    .from(factuurSignalenTable)
    .leftJoin(facturenTable, eq(factuurSignalenTable.factuurId, facturenTable.id))
    .leftJoin(gebruikersTable, eq(factuurSignalenTable.afgehandeldDoor, gebruikersTable.id))
    .where(eq(factuurSignalenTable.status, status))
    .orderBy(desc(factuurSignalenTable.aangemaaktOp))
    .limit(200);
  res.json(rijen.map((r) => ({
    ...r,
    aangemaakt_op: r.aangemaakt_op.toISOString(),
    afgehandeld_op: r.afgehandeld_op?.toISOString() ?? null,
  })));
});

// ── POST /facturen/signalen/:id/afhandelen ─────────────────────────────────────
router.post("/facturen/signalen/:id/afhandelen", requireBevoegdheid("financieel", 2), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);
  const { notitie } = req.body as { notitie?: string };
  const [signaal] = await db.select().from(factuurSignalenTable).where(eq(factuurSignalenTable.id, id)).limit(1);
  if (!signaal) { res.status(404).json({ error: "Niet gevonden" }); return; }
  if (signaal.status === "afgehandeld") { res.status(409).json({ error: "Al afgehandeld" }); return; }
  // §6.7 — een gewijzigd rekeningnummer mag nooit stil afgehandeld worden.
  if (signaal.type === "rekeningnummer_gewijzigd" && (!notitie || notitie.trim().length < 5)) {
    res.status(422).json({ error: "Bij een gewijzigd rekeningnummer is een toelichting verplicht: leg vast hoe de wijziging is geverifieerd." });
    return;
  }
  const userId = sessionUserId(req);
  const [updated] = await db.update(factuurSignalenTable).set({
    status: "afgehandeld",
    afgehandeldDoor: userId,
    afgehandeldOp: new Date(),
    afhandelNotitie: notitie?.trim() || null,
  }).where(eq(factuurSignalenTable.id, id)).returning();
  if (signaal.factuurId) {
    const [wie] = userId ? await db.select({ naam: gebruikersTable.naam }).from(gebruikersTable).where(eq(gebruikersTable.id, userId)).limit(1) : [];
    await schrijfTijdlijn(signaal.factuurId, `Het aandachtspunt "${signaal.omschrijving.slice(0, 120)}" is afgehandeld${notitie ? `: ${notitie.trim()}` : "."}`, wie?.naam ?? null);
  }
  res.json({ ok: true, id: updated.id, status: updated.status });
});

// ── GET /facturen/:id/tijdlijn — leesbaar verhaal per factuur (§7) ─────────────
router.get("/facturen/:id/tijdlijn", requireBevoegdheid("financieel", 1), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);
  const rijen = await db.select().from(factuurTijdlijnTable)
    .where(eq(factuurTijdlijnTable.factuurId, id))
    .orderBy(factuurTijdlijnTable.gebeurdOp, factuurTijdlijnTable.id);
  res.json(rijen.map((r) => ({
    id: r.id,
    tekst: r.tekst,
    gebeurd_op: r.gebeurdOp.toISOString(),
    gebruiker_naam: r.gebruikerNaam,
  })));
});

// ── POST /facturen/:id/afwijzen-stroom — gesloten redenlijst (§4) ──────────────
router.post("/facturen/:id/afwijzen-stroom", requireBevoegdheid("financieel", 2), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);
  const { reden_code } = req.body as { reden_code?: string };
  if (!reden_code || !(reden_code in FACTUUR_AFWIJSREDENEN)) {
    res.status(400).json({ error: "Kies een geldige afwijsreden uit de vaste lijst.", redenen: Object.keys(FACTUUR_AFWIJSREDENEN) });
    return;
  }
  const code = reden_code as FactuurAfwijsredenCode;
  const [factuur] = await db.select().from(facturenTable).where(eq(facturenTable.id, id)).limit(1);
  if (!factuur) { res.status(404).json({ error: "Niet gevonden" }); return; }
  if (factuur.status === "afgekeurd") { res.status(409).json({ error: "Deze factuur is al afgewezen." }); return; }

  const userId = sessionUserId(req);
  const [wie] = userId ? await db.select({ naam: gebruikersTable.naam }).from(gebruikersTable).where(eq(gebruikersTable.id, userId)).limit(1) : [];
  const redenTekst = FACTUUR_AFWIJSREDENEN[code];

  await db.update(facturenTable).set({
    status: "afgekeurd",
    afwijsredenCode: code,
    afgekeurdReden: redenTekst,
    afgekeurdOp: new Date(),
    afgekeurdDoor: userId,
    statusVoorAfwijzing: factuur.status,
    bijgewerktOp: new Date(),
  }).where(eq(facturenTable.id, id));

  // Reactiemail als concept — mens controleert en verstuurt
  const [concept] = await db.insert(factuurCorrespondentieTable).values({
    factuurId: id,
    richting: "uitgaand",
    soort: "afkeur",
    status: "concept",
    ontvangerNaam: factuur.relatienaam,
    onderwerp: `Uw factuur ${factuur.factuurnummer ?? ""} kan zo niet verwerkt worden`.replace(/\s+/g, " ").trim(),
    bericht: maakAfwijsMailTekst(code, factuur.relatienaam, factuur.factuurnummer),
    afkeurCategorie: code,
    aiGegenereerd: true,
    opgesteldDoor: userId,
  }).returning();

  await schrijfTijdlijn(id, `${wie?.naam ?? "Een medewerker"} heeft de factuur afgewezen: ${redenTekst.toLowerCase()}. Er staat een conceptmail voor de leverancier klaar.`, wie?.naam ?? null);
  res.json({ ok: true, status: "afgekeurd", afwijsreden_code: code, concept_correspondentie_id: concept.id });
});

// ── POST /facturen/:id/leverancier-koppelen — LEVERANCIER_01 §3.3 ─────────────
// Handmatig koppelen aan een bestaande leverancier wanneer de automatische
// herkenning niets vond. Er wordt hier nooit een leverancier aangemaakt; dat
// loopt via het leveranciersregister zelf (René besluit, Jacqueline legt vast).
router.post("/facturen/:id/leverancier-koppelen", requireBevoegdheid("financieel", 2), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);
  const leverancierId = Number((req.body as { leverancier_id?: unknown })?.leverancier_id);
  if (!Number.isInteger(leverancierId) || leverancierId <= 0) {
    res.status(422).json({ error: "leverancier_id is verplicht" }); return;
  }
  const [factuur] = await db.select().from(facturenTable).where(eq(facturenTable.id, id)).limit(1);
  if (!factuur) { res.status(404).json({ error: "Niet gevonden" }); return; }
  const [lev] = await db.select({ id: leveranciersTable.id, naam: leveranciersTable.naam })
    .from(leveranciersTable).where(eq(leveranciersTable.id, leverancierId)).limit(1);
  if (!lev) { res.status(404).json({ error: "Leverancier niet gevonden" }); return; }
  const userId = sessionUserId(req);
  const [wie] = userId ? await db.select({ naam: gebruikersTable.naam }).from(gebruikersTable).where(eq(gebruikersTable.id, userId)).limit(1) : [];
  await db.update(facturenTable).set({
    leverancierId: lev.id,
    bijgewerktOp: new Date(),
  }).where(eq(facturenTable.id, id));
  await schrijfTijdlijn(id, `${wie?.naam ?? "Een medewerker"} heeft de factuur gekoppeld aan leverancier ${lev.naam}.`, wie?.naam ?? null);
  res.json({ ok: true, leverancier_id: lev.id, leverancier_naam: lev.naam });
});

// ── POST /facturen/:id/bevestig-inkoop — stap van de inkoper (§5) ──────────────
router.post("/facturen/:id/bevestig-inkoop", requireBevoegdheid("financieel", 2), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);
  const [factuur] = await db.select().from(facturenTable).where(eq(facturenTable.id, id)).limit(1);
  if (!factuur) { res.status(404).json({ error: "Niet gevonden" }); return; }
  if (factuur.status !== "wacht_op_inkoper") { res.status(409).json({ error: "Deze factuur wacht niet op bevestiging van de inkoper." }); return; }
  const userId = sessionUserId(req);
  // Fail-closed: zonder toegewezen inkoper of zonder ingelogde gebruiker wordt
  // geweigerd, net als bij beoordelen-medewerker. Zo kan een factuur in
  // wacht_op_inkoper nooit door willekeurig financieel-personeel bevestigd worden.
  if (!factuur.inkoperId || !userId || userId !== factuur.inkoperId) {
    res.status(403).json({ error: "Alleen de toegewezen inkoper kan deze bestelling bevestigen." });
    return;
  }
  const [wie] = userId ? await db.select({ naam: gebruikersTable.naam }).from(gebruikersTable).where(eq(gebruikersTable.id, userId)).limit(1) : [];
  // PRIJS_01 §6 — hertoets de regels tegen de prijsafspraken vóór de statuswissel.
  // Alleen rapporteren/indienen bij de goedkeuringsmotor; nooit ophouden.
  try {
    const actor = await maakGoedkeuringActor(req as { session: { userId?: number | null } }, db);
    await controleerFactuurRegels(id, actor);
  } catch (err) {
    req.log.error(err);
  }
  await db.update(facturenTable).set({
    status: "wacht_op_goedkeuring",
    inkoperBevestigdOp: new Date(),
    bijgewerktOp: new Date(),
  }).where(eq(facturenTable.id, id));
  await schrijfTijdlijn(id, `${wie?.naam ?? "De inkoper"} heeft bevestigd dat de factuur klopt met de bestelling. De factuur ligt nu ter goedkeuring bij de directie.`, wie?.naam ?? null);
  res.json({ ok: true, status: "wacht_op_goedkeuring" });
});

// ── POST /facturen/:id/goedkeuren-stroom — René keurt goed (§5) ────────────────
// Eindstation van FACTUUR_02: "klaar voor betaling". Betalen zelf is FACTUUR_03.
router.post("/facturen/:id/goedkeuren-stroom", requireBevoegdheid("financieel", 4), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);
  const [factuur] = await db.select().from(facturenTable).where(eq(facturenTable.id, id)).limit(1);
  if (!factuur) { res.status(404).json({ error: "Niet gevonden" }); return; }
  if (factuur.geblokkeerd) { res.status(409).json({ error: "Factuur is geblokkeerd" }); return; }
  // Uitsluitend vanuit wacht_op_goedkeuring: de inkoperstap is niet te omzeilen (§5).
  if (factuur.status !== "wacht_op_goedkeuring") {
    res.status(409).json({ error: `Deze factuur kan in de huidige stap niet goedgekeurd worden (${factuur.status}). Eerst moet de inkoper de bestelling bevestigen.` });
    return;
  }
  // Zelfde vier-ogen-gate als accorderen: een geldende beleidsregel is niet te omzeilen.
  const documentType = bepaalFactuurDocumentType(factuur);
  const bedrag = factuur.bedragInclBtw ? parseFloat(factuur.bedragInclBtw) : null;
  // FACTUUR_03: nooit automatische goedkeuring. De rol- en bedragsgrenzen staan
  // uitsluitend in het goedkeuringsbeleid (Beheer → Goedkeuringsbeleid), niet in
  // code. Zonder passende beleidsregel wordt fail-closed geweigerd — ook bij een
  // onbekend factuurbedrag (onbekend bedrag telt niet als "onder de grens").
  const { vereist } = await checkVereistGoedkeuring(db, documentType, bedrag, null);
  if (!vereist) {
    res.status(422).json({
      error: "Geen goedkeuringsbeleid van toepassing op deze factuur",
      detail: "FACTUUR_03: inkoopfacturen worden nooit zonder goedkeuringsregel goedgekeurd. Stel bij Beheer → Goedkeuringsbeleid een regel in (rol + bedragsgrens; boven de grens de directie).",
    });
    return;
  }
  const goedgekeurd = await haalGoedgekeurdeAanvraag(db, documentType, id);
  if (!goedgekeurd) {
    res.status(422).json({ error: "Goedkeuring via de goedkeuringsmodule vereist.", viaGoedkeuring: true });
    return;
  }
  const userId = sessionUserId(req);
  const [wie] = userId ? await db.select({ naam: gebruikersTable.naam }).from(gebruikersTable).where(eq(gebruikersTable.id, userId)).limit(1) : [];
  await db.update(facturenTable).set({
    status: "klaar_voor_betaling",
    geaccordeerd: true,
    geaccordeerdOp: new Date(),
    geaccordeerdDoor: userId,
    bijgewerktOp: new Date(),
  }).where(eq(facturenTable.id, id));
  await schrijfTijdlijn(id, `${wie?.naam ?? "De directie"} heeft de factuur goedgekeurd en de betaling vrijgegeven. De factuur staat klaar voor betaling.`, wie?.naam ?? null);
  res.json({ ok: true, status: "klaar_voor_betaling" });
});

// ── PRIJS_01 §6 — GET /facturen/prijscontrole/maandtotaal ────────────────────
// MOET vóór /facturen/:id staan (wildcard-volgorde). Sommeert het "te veel
// betaald" over facturen met een factuurdatum in de gevraagde maand, op basis
// van de gecachete prijscontrole. Puur rapporterend; nooit blokkerend.
router.get("/facturen/prijscontrole/maandtotaal", requireBevoegdheid("financieel", 1), async (req: Request, res: Response): Promise<void> => {
  const maand = typeof req.query["maand"] === "string" ? req.query["maand"] : "";
  if (!/^\d{4}-\d{2}$/.test(maand)) {
    res.status(400).json({ error: "maand moet YYYY-MM zijn" });
    return;
  }
  const rijen = await db
    .select({ id: facturenTable.id, factuurnummer: facturenTable.factuurnummer, leverancierId: facturenTable.leverancierId, prijscontrole: facturenTable.prijscontrole })
    .from(facturenTable)
    .where(and(isNotNull(facturenTable.prijscontrole), sql`${facturenTable.factuurdatum} LIKE ${maand + "-%"}`));

  let totaalMeerBetaald = 0;
  let aantalAfwijkingen = 0;
  const regels: Array<Record<string, unknown>> = [];
  for (const rij of rijen) {
    const pc = rij.prijscontrole as unknown as FactuurPrijscontrole | null;
    if (!pc || !Array.isArray(pc.regels)) continue;
    for (const r of pc.regels) {
      if (r.uitkomst !== "afwijking") continue;
      aantalAfwijkingen++;
      if (r.verschil_totaal != null && r.verschil_totaal > 0) totaalMeerBetaald += r.verschil_totaal;
      regels.push({
        factuur_id: rij.id,
        factuurnummer: rij.factuurnummer,
        omschrijving: r.omschrijving,
        afgesproken_prijs: r.afgesproken_prijs,
        factuur_stukprijs: r.factuur_stukprijs,
        verschil_per_stuk: r.verschil_per_stuk,
        verschil_totaal: r.verschil_totaal,
        afspraak_leverancier: r.afspraak_leverancier,
      });
    }
  }
  res.json({
    maand,
    totaal_meer_betaald: Math.round(totaalMeerBetaald * 100) / 100,
    aantal_afwijkingen: aantalAfwijkingen,
    regels,
  });
});

// ── PRIJS_01 §6 — GET /facturen/:id/prijscontrole ────────────────────────────
// Geeft de laatste toetsing van de factuurregels tegen de prijsafspraken. Toetst
// desgevraagd opnieuw (verse=1). Nooit blokkerend.
router.get("/facturen/:id/prijscontrole", requireBevoegdheid("financieel", 1), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);
  const [rij] = await db.select({ id: facturenTable.id, prijscontrole: facturenTable.prijscontrole }).from(facturenTable).where(eq(facturenTable.id, id)).limit(1);
  if (!rij) { res.status(404).json({ error: "Niet gevonden" }); return; }
  const verse = req.query["verse"] === "1" || req.query["verse"] === "true";
  if (verse || !rij.prijscontrole) {
    const actor = await maakGoedkeuringActor(req as { session: { userId?: number | null } }, db);
    const resultaat = await controleerFactuurRegels(id, actor);
    res.json(resultaat);
    return;
  }
  res.json(rij.prijscontrole);
});

// ── GET /facturen/:id ──────────────────────────────────────────────────────────
router.get("/facturen/:id", requireBevoegdheid("financieel", 1), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);
  const [rij] = await db.select().from(facturenTable).where(eq(facturenTable.id, id)).limit(1);
  if (!rij) { res.status(404).json({ error: "Niet gevonden" }); return; }
  res.json(await mapFactuur(rij));
});

// ── PATCH /facturen/:id ────────────────────────────────────────────────────────
router.patch("/facturen/:id", requireBevoegdheid("financieel", 2), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);
  const body = req.body as Record<string, unknown>;

  const [bestaand] = await db.select().from(facturenTable).where(eq(facturenTable.id, id)).limit(1);
  if (!bestaand) { res.status(404).json({ error: "Niet gevonden" }); return; }

  // FACTUUR_02 §5 — stroomstatussen zijn uitsluitend via de stroomacties te
  // wijzigen. Via de generieke PATCH mag de status van een stroom-factuur niet
  // veranderen, en mag geen enkele factuur een stroomstatus krijgen.
  if ("status" in body && body["status"] !== bestaand.status) {
    if (STROOM_STATUSSEN.has(bestaand.status)) {
      res.status(409).json({ error: "Factuur zit in de factuurstroom", detail: STROOM_MELDING });
      return;
    }
    if (typeof body["status"] === "string" && STROOM_STATUSSEN.has(body["status"])) {
      res.status(409).json({ error: "Stroomstatussen kunnen niet handmatig worden gezet", detail: STROOM_MELDING });
      return;
    }
  }

  const update: Partial<typeof facturenTable.$inferInsert> = { bijgewerktOp: new Date() };
  if ("subtype" in body) {
    const TOEGESTANE_SUBTYPES = new Set(["creditnota", "prijsafwijking"]);
    const sub = body["subtype"];
    update.subtype = typeof sub === "string" && TOEGESTANE_SUBTYPES.has(sub) ? sub : null;
  }
  if ("factuurnummer" in body && (body["factuurnummer"] ?? null) !== bestaand.factuurnummer) {
    // NUMMER_01 §4.6: fiscale nummers van verkoopfacturen komen uitsluitend
    // uit de reeks per BV (via /definitief) en zijn daarna onwijzigbaar.
    if (bestaand.type === "verkoop") {
      res.status(409).json({
        error: "Het fiscale factuurnummer van een verkoopfactuur kan niet handmatig worden gezet of gewijzigd",
        detail: "Gebruik 'Definitief maken'; het nummer komt uit de doorlopende reeks per BV.",
      });
      return;
    }
    update.factuurnummer = body["factuurnummer"] as string | null;
  }
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
  // FINANCIEEL_KETEN_01: verwijderen is een besluit — leg vast wie, wat en
  // wanneer. Via RETURNING: alleen een daadwerkelijk verwijderde rij wordt
  // gelogd (geen vals log bij gelijktijdige verwijdering).
  const [f] = await db.delete(facturenTable).where(eq(facturenTable.id, id))
    .returning({ factuurnummer: facturenTable.factuurnummer, relatienaam: facturenTable.relatienaam, bedrag: facturenTable.bedragInclBtw });
  if (f) {
    await logActiviteit({
      type: "factuur_verwijderd",
      omschrijving: `Factuur verwijderd: ${f.relatienaam ?? "onbekend"} ${f.factuurnummer ?? `#${id}`}${f.bedrag ? ` (€${f.bedrag})` : ""}`,
      gebruikerId: req.session?.userId ?? null,
    });
  }
  res.status(204).send();
});

// ── POST /facturen/:id/ai-uitlezen ─────────────────────────────────────────────
// Fase 2: Uitgebreide AI-extractie — regels, IBAN-verificatie, leverancierherkenning,
// G-rekening-signalering. AI stelt voor; administratie keurt goed.
router.post("/facturen/:id/ai-uitlezen", requireBevoegdheid("financieel", 2), async (req: Request, res: Response): Promise<void> => {
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
router.post("/facturen/:id/ter-goedkeuring-indienen", requireBevoegdheid("financieel", 2), async (req: Request, res: Response): Promise<void> => {
  const id = paramInt(req.params["id"]);
  const [factuur] = await db.select().from(facturenTable).where(eq(facturenTable.id, id)).limit(1);
  if (!factuur) { res.status(404).json({ error: "Niet gevonden" }); return; }
  if (factuur.geblokkeerd) { res.status(409).json({ error: "Factuur is geblokkeerd" }); return; }
  if (STROOM_STATUSSEN.has(factuur.status)) { res.status(409).json({ error: "Factuur zit in de factuurstroom", detail: STROOM_MELDING }); return; }

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
  // Stroom-facturen zijn niet via het oude accorderen te passeren (FACTUUR_02 §5).
  if (STROOM_STATUSSEN.has(factuur.status)) { res.status(409).json({ error: "Factuur zit in de factuurstroom", detail: STROOM_MELDING }); return; }

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

  // INKOOP_BOEKING_01: factuur staat nu op klaar_voor_accountview + geaccordeerd —
  // probeer automatisch te boeken (fire-and-forget; faalmail bij mislukking).
  void probeerAutomatischeBoeking(id, "handmatig geaccordeerd").catch((err) => {
    req.log.error({ err, factuurId: id }, "auto-boeking na accorderen mislukt (onverwacht)");
  });

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
  // INKOOP_BOEKING_01: de exportkern (controles + boeking + logging) is verhuisd
  // naar de gedeelde service zodat handmatige export en automatische boeking
  // exact dezelfde route volgen.
  const uitkomst = await exporteerFactuurNaarAccountView(id, sessionUserId(req));
  if (!uitkomst.ok) {
    res.status(uitkomst.httpStatus).json({
      error: uitkomst.fout,
      ...(uitkomst.detail ? { detail: uitkomst.detail } : {}),
      ...(uitkomst.fouten ? { fouten: uitkomst.fouten } : {}),
      ...(uitkomst.viaGoedkeuring ? { viaGoedkeuring: true } : {}),
    });
    return;
  }

  res.json({
    status: uitkomst.geslaagd ? "geslaagd" : "mislukt",
    factuur_id: id,
    boeking_id: uitkomst.boekingId ?? null,
    foutmelding: uitkomst.foutmelding ?? null,
    testmodus: uitkomst.testmodus,
    fouten: uitkomst.fouten ?? [],
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
  // Stroom-facturen worden afgewezen via /afwijzen-stroom (gesloten redenlijst), nooit via dit legacy-pad.
  if (STROOM_STATUSSEN.has(factuur.status)) { res.status(409).json({ error: "Factuur zit in de factuurstroom", detail: STROOM_MELDING }); return; }

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
    }, undefined, {
      module: "facturen",
      functie: "afkeurEmail",
      entiteitstype: "factuur",
      entiteitId: id,
      promptNaam: "factuur-afkeur-email",
      promptVersie: "1.0.0",
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

  // NB: dit is uitsluitend de leveranciers-afkeurmail (inkoop). De mandagstaat
  // hoort NIET bij deze mail — die wordt bij het definitief maken van de
  // verkoopfactuur naast de factuur in object storage opgeslagen (§6c.2).
  const html = rij.bericht.split("\n").map((r) => r.length ? `<p>${r.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>` : "<br>").join("");
  try {
    await verstuurMail({
      naarEmail: rij.ontvangerEmail,
      naarNaam: rij.ontvangerNaam,
      onderwerp: rij.onderwerp,
      html,
      soort: "afwijzing",
      verstuurdDoorId: sessionUserId(req),
      direct: true, // medewerker verstuurt deze mail zelf expliciet
    });
  } catch (err) {
    const melding = veiligeFoutmelding(err, "Onbekende fout");
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
  res.json({
    id: updated?.id,
    status: "verzonden",
    verzonden_op: updated?.verzondenOp?.toISOString() ?? null,
  });
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

  // ADMINISTRATIE_02 §1: aangeleerde voorkeuren blijven bestaan, maar het
  // voorstel verwijst voortaan naar het schema. Een aangeleerde waarde die
  // niet (meer) in het schema van de gekoppelde BV staat (typefout van de
  // eerste keer) wordt niet meer voorgesteld — die wordt als buiten_schema
  // gemeld zodat de gebruiker bewust kiest.
  let grootboekVoorstel: string | null = patroon.grootboekrekening;
  let btwVoorstel: string | null = patroon.btwCode;
  const buitenSchema: string[] = [];
  const [avInst] = await db.select({ werkgeverId: accountviewInstellingenTable.werkgeverId })
    .from(accountviewInstellingenTable).where(eq(accountviewInstellingenTable.id, 1)).limit(1);
  if (avInst?.werkgeverId != null) {
    if (grootboekVoorstel) {
      const [inSchema] = await db.select({ id: grootboekrekeningenTable.id }).from(grootboekrekeningenTable)
        .where(and(eq(grootboekrekeningenTable.werkgeverId, avInst.werkgeverId), eq(grootboekrekeningenTable.nummer, grootboekVoorstel), eq(grootboekrekeningenTable.actief, true))).limit(1);
      const [heeftSchema] = await db.select({ id: grootboekrekeningenTable.id }).from(grootboekrekeningenTable)
        .where(and(eq(grootboekrekeningenTable.werkgeverId, avInst.werkgeverId), eq(grootboekrekeningenTable.actief, true))).limit(1);
      if (heeftSchema && !inSchema) { buitenSchema.push(`grootboekrekening ${grootboekVoorstel}`); grootboekVoorstel = null; }
    }
    if (btwVoorstel) {
      const [inSchema] = await db.select({ id: btwCodesTable.id }).from(btwCodesTable)
        .where(and(eq(btwCodesTable.werkgeverId, avInst.werkgeverId), eq(btwCodesTable.code, btwVoorstel), eq(btwCodesTable.actief, true))).limit(1);
      const [heeftSchema] = await db.select({ id: btwCodesTable.id }).from(btwCodesTable)
        .where(and(eq(btwCodesTable.werkgeverId, avInst.werkgeverId), eq(btwCodesTable.actief, true))).limit(1);
      if (heeftSchema && !inSchema) { buitenSchema.push(`btw-code ${btwVoorstel}`); btwVoorstel = null; }
    }
  }

  res.json({
    voorstel: {
      grootboekrekening: grootboekVoorstel,
      kostenplaats: patroon.kostenplaats,
      categorie: patroon.categorie,
      btw_code: btwVoorstel,
      aantal: patroon.aantal,
      laatst_bevestigd_op: patroon.laatstBevestigdOp.toISOString(),
      buiten_schema: buitenSchema.length > 0 ? buitenSchema : null,
    },
  });
});

// ── ADMINISTRATIE_02 §2: drie-weg-controle bestelling/ontvangst/factuur ──────
// De projectinkoop (I-nummers) kent nog GEEN ontvangst-aantallen per regel;
// alleen de grove bonstatus (concept→goedgekeurd→besteld→geleverd) bestaat.
// De vergelijking meldt dat eerlijk (geleverd_registratie: "ontbreekt") in
// plaats van te doen alsof de derde weg bestaat — zie docs/metingen.

function naarBedrag(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number.parseFloat(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

async function berekenDriewegControle(factuurId: number) {
  const [factuur] = await db.select().from(facturenTable).where(eq(facturenTable.id, factuurId)).limit(1);
  if (!factuur) return null;
  if (factuur.inkoopbonId == null) {
    return {
      gekoppeld: false as const,
      zonder_bestelling: factuur.type === "inkoop",
      besteld_bedrag: null, gefactureerd_bedrag: naarBedrag(factuur.bedragExclBtw),
      verschil_bedrag: null, afwijking: false,
      geleverd_registratie: "ontbreekt" as const, leveringsstatus: null,
      bon: null,
    };
  }
  const [bon] = await db.select().from(inkoopbonnenTable).where(eq(inkoopbonnenTable.id, factuur.inkoopbonId)).limit(1);
  if (!bon) {
    return {
      gekoppeld: false as const, zonder_bestelling: true,
      besteld_bedrag: null, gefactureerd_bedrag: naarBedrag(factuur.bedragExclBtw),
      verschil_bedrag: null, afwijking: false,
      geleverd_registratie: "ontbreekt" as const, leveringsstatus: null, bon: null,
    };
  }
  // Besteld: bontotaal, of de som van de regels als het totaal niet is gezet.
  let besteld = naarBedrag(bon.totaalBedrag);
  if (besteld == null) {
    const [som] = await db.select({ t: sql<string>`coalesce(sum(${inkoopbonRegelsTable.totaal}), 0)` })
      .from(inkoopbonRegelsTable).where(eq(inkoopbonRegelsTable.inkoopbonId, bon.id));
    besteld = naarBedrag(som?.t ?? null);
  }
  // Gefactureerd: alle (niet-afgekeurde) inkoopfacturen op dezelfde bon samen,
  // zodat deelfacturen niet elk apart "goedkoper dan besteld" lijken.
  const [gefac] = await db.select({ t: sql<string>`coalesce(sum(${facturenTable.bedragExclBtw}), 0)` })
    .from(facturenTable)
    .where(and(eq(facturenTable.inkoopbonId, bon.id), ne(facturenTable.status, "afgekeurd")));
  const gefactureerd = naarBedrag(gefac?.t ?? null) ?? 0;
  const verschil = besteld == null ? null : Math.round((gefactureerd - besteld) * 100) / 100;
  const afwijking = verschil != null && Math.abs(verschil) > 0.01;
  return {
    gekoppeld: true as const, zonder_bestelling: false,
    besteld_bedrag: besteld, gefactureerd_bedrag: gefactureerd,
    verschil_bedrag: verschil, afwijking,
    // Derde weg: alleen de grove bonstatus bestaat, geen ontvangst-aantallen.
    geleverd_registratie: "ontbreekt" as const,
    leveringsstatus: bon.status,
    bon: {
      id: bon.id,
      kenmerk: formatNummer("I", bon.nummer) + herzieningsLetter(bon.herziening ?? 0),
      leverancier: bon.leverancier,
      status: bon.status,
      opdracht_id: bon.opdrachtId,
    },
  };
}

// Suggesties: I-nummer in de factuurtekst is de sterkste match; daarnaast
// leverancier + bedrag (±5%) op bestelde/geleverde bonnen.
router.get("/facturen/:id/inkooporder-suggestie", requireBevoegdheid("financieel", 1), async (req: Request, res: Response): Promise<void> => {
  const id = Number.parseInt(String(req.params.id ?? ""), 10);
  const [factuur] = await db.select().from(facturenTable).where(eq(facturenTable.id, id)).limit(1);
  if (!factuur) { res.status(404).json({ error: "Factuur niet gevonden" }); return; }
  if (factuur.type !== "inkoop") { res.json({ kandidaten: [] }); return; }

  const kandidaten: Array<{ inkoopbon_id: number; kenmerk: string; leverancier: string; status: string; totaal_bedrag: number | null; reden: string; zekerheid: "hoog" | "gemiddeld" }> = [];
  const gezien = new Set<number>();
  const maakKandidaat = (bon: typeof inkoopbonnenTable.$inferSelect, reden: string, zekerheid: "hoog" | "gemiddeld") => {
    if (gezien.has(bon.id)) return;
    gezien.add(bon.id);
    kandidaten.push({
      inkoopbon_id: bon.id,
      kenmerk: formatNummer("I", bon.nummer) + herzieningsLetter(bon.herziening ?? 0),
      leverancier: bon.leverancier, status: bon.status,
      totaal_bedrag: naarBedrag(bon.totaalBedrag), reden, zekerheid,
    });
  };

  // 1. I-nummer in factuurtekst (omschrijving/opmerkingen/AI-metadata).
  const tekst = [factuur.omschrijving, factuur.opmerkingen, JSON.stringify(factuur.aiMetadata ?? "")].join(" ");
  const nummers = new Set<number>();
  for (const m of tekst.matchAll(/\bI\s?-?0*(\d{1,6})[a-z]?\b/gi)) {
    const n = Number.parseInt(m[1]!, 10);
    if (Number.isFinite(n)) nummers.add(n);
  }
  if (nummers.size > 0) {
    const opNummer = await db.select().from(inkoopbonnenTable)
      .where(inArray(inkoopbonnenTable.nummer, [...nummers]));
    for (const bon of opNummer) maakKandidaat(bon, `Inkoopnummer ${formatNummer("I", bon.nummer)} staat op de factuur`, "hoog");
  }

  // 2. Zelfde leverancier + bedrag binnen 5% (alleen bestelde/geleverde bonnen).
  const bedrag = naarBedrag(factuur.bedragExclBtw);
  if (factuur.leverancierId != null && bedrag != null && bedrag > 0) {
    const opLeverancier = await db.select().from(inkoopbonnenTable)
      .where(and(
        eq(inkoopbonnenTable.leverancierId, factuur.leverancierId),
        inArray(inkoopbonnenTable.status, ["besteld", "geleverd"]),
      ));
    for (const bon of opLeverancier) {
      const bt = naarBedrag(bon.totaalBedrag);
      if (bt != null && bt > 0 && Math.abs(bt - bedrag) / bt <= 0.05) {
        maakKandidaat(bon, `Zelfde leverancier, bedrag wijkt minder dan 5% af van ${bt.toFixed(2)}`, "gemiddeld");
      }
    }
  }

  res.json({ kandidaten: kandidaten.slice(0, 10) });
});

// Koppelen met één handeling; daarna draait de vergelijking direct en gaat de
// factuur bij een afwijking naar controle mét het verschil erbij — niet stil
// doorlaten en niet stil weigeren.
router.post("/facturen/:id/koppel-inkoopbon", requireBevoegdheid("financieel", 2), async (req: Request, res: Response): Promise<void> => {
  const id = Number.parseInt(String(req.params.id ?? ""), 10);
  const inkoopbonId = req.body?.inkoopbon_id == null ? null : Number.parseInt(String(req.body.inkoopbon_id), 10);
  const [factuur] = await db.select().from(facturenTable).where(eq(facturenTable.id, id)).limit(1);
  if (!factuur) { res.status(404).json({ error: "Factuur niet gevonden" }); return; }
  if (factuur.type !== "inkoop") { res.status(422).json({ error: "Alleen inkoopfacturen kunnen aan een inkooporder worden gekoppeld" }); return; }

  if (inkoopbonId != null) {
    const [bon] = await db.select().from(inkoopbonnenTable).where(eq(inkoopbonnenTable.id, inkoopbonId)).limit(1);
    if (!bon) { res.status(404).json({ error: "Inkooporder niet gevonden" }); return; }
    await db.update(facturenTable)
      .set({ inkoopbonId, opdrachtId: factuur.opdrachtId ?? bon.opdrachtId, bijgewerktOp: new Date() })
      .where(eq(facturenTable.id, id));
  } else {
    await db.update(facturenTable).set({ inkoopbonId: null, bijgewerktOp: new Date() }).where(eq(facturenTable.id, id));
  }

  const controle = await berekenDriewegControle(id);
  if (controle?.afwijking && !factuur.geaccordeerd) {
    const melding = `Drie-weg-controle: gefactureerd €${controle.gefactureerd_bedrag?.toFixed(2)} wijkt €${Math.abs(controle.verschil_bedrag ?? 0).toFixed(2)} af van besteld €${controle.besteld_bedrag?.toFixed(2)} (${controle.bon?.kenmerk}).`;
    await db.update(facturenTable)
      .set({ status: "controle_nodig", bijgewerktOp: new Date() })
      .where(and(eq(facturenTable.id, id), inArray(facturenTable.status, ["ontvangen", "ai_gelezen", "klaar_voor_boeking", "controle_nodig"])));
    await db.insert(factuurOpmerkingenTable).values({
      factuurId: id, tekst: `[Drie-weg-controle] ${melding}`,
    });
  }
  res.json({ gekoppeld: inkoopbonId != null, controle });
});

router.get("/facturen/:id/drieweg-controle", requireBevoegdheid("financieel", 1), async (req: Request, res: Response): Promise<void> => {
  const id = Number.parseInt(String(req.params.id ?? ""), 10);
  const controle = await berekenDriewegControle(id);
  if (!controle) { res.status(404).json({ error: "Factuur niet gevonden" }); return; }
  res.json(controle);
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

  // RECHTEN_HRM_02 §1 — beoordelen-medewerker vereist financieel:2; stuur nooit
  // door naar iemand die daar vervolgens niet bij kan (fail-closed, 422).
  const rechten = await berekenEffectieveBevoegdheden(gebruiker_id);
  if ((rechten["financieel"] ?? 0) < 2) {
    res.status(422).json({ error: `${medewerker.naam} heeft geen schrijfrecht op Financieel (niveau 2) en kan deze factuur niet beoordelen. Verhoog eerst diens recht of kies iemand anders.` });
    return;
  }

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
router.post("/facturen/:id/beoordelen-medewerker", requireBevoegdheid("financieel", 2), async (req: Request, res: Response): Promise<void> => {
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
  // RECHTEN_HRM_02 §1 — niveau 1 is puur leesrecht; deze muterende stap staat
  // daarom op niveau 2. Daarbovenop persoonsgebonden en fail-closed: alleen de
  // toegewezen beoordelaar mag hier iets wijzigen; zonder toegewezen
  // beoordelaar of zonder ingelogde gebruiker wordt geweigerd.
  if (!factuur.beoordelaarId || !userId || userId !== factuur.beoordelaarId) {
    res.status(403).json({ error: "Alleen de toegewezen medewerker kan deze factuur beoordelen." });
    return;
  }

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
router.post("/facturen/:id/opmerkingen", requireBevoegdheid("financieel", 2), async (req: Request, res: Response): Promise<void> => {
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
router.patch("/facturen/:id/opmerkingen/:oid", requireBevoegdheid("financieel", 2), async (req: Request, res: Response): Promise<void> => {
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

  // ADMINISTRATIE_01 fase 3: ook de forceer-herexport passeert de harde
  // werkmaatschappij↔administratie-controle — geen achterdeur.
  {
    const bvFout = await controleerFactuurAdministratieBv(factuur, inst.werkgeverId ?? null);
    if (bvFout) { res.status(422).json({ error: bvFout }); return; }
  }

  // INKOOP_BOEKING_01: gedeelde verzend-claim tegen gelijktijdige verzendingen
  // (herexport mag wél vanuit een eerder geslaagde boeking, vandaar de vlag).
  const statusVoorClaim = factuur.accountviewStatus;
  if (!(await claimAccountviewVerzending(id, { herexport: true }))) {
    res.status(409).json({
      error: "Verzending loopt al",
      detail: "Er loopt al een verzending naar AccountView voor deze factuur. Probeer het zo weer of controleer de export-logs.",
    });
    return;
  }

  // ADMINISTRATIE_01 fase 3: hercontrole ná de claim (TOCTOU) — de BV op
  // offerte/opdracht of de koppeling-BV kan intussen gewijzigd zijn. Bij
  // weigering is de claim al teruggegeven (factuur op error gezet). Client en
  // payload worden hieronder uitsluitend uit de gevalideerde verse snapshot
  // opgebouwd, zodat een gelijktijdige samenhangende wijziging van factuur-BV
  // én koppeling nooit met de oude administratiecode/credentials verzendt.
  const her = await hercontroleerBvNaClaim(factuur);
  if (her.bvFout !== null) { res.status(422).json({ error: "Werkmaatschappij-controle geweigerd", detail: her.bvFout }); return; }
  const versInst = her.inst;

  // Rekeningschema-poort (ADMINISTRATIE_01): ook de forceer-herexport mag
  // nooit buiten het schema van de gekoppelde BV boeken.
  if (versInst.werkgeverId != null) {
    const schemaFout = await controleerBoekingsschema(versInst.werkgeverId, id, factuur.grootboekrekening ?? versInst.grootboekStandaard, factuur.btwCode);
    if (schemaFout) {
      await db.update(facturenTable).set({ accountviewStatus: "error", accountviewFout: schemaFout, bijgewerktOp: new Date() })
        .where(eq(facturenTable.id, id));
      res.status(422).json({ error: "Boekingsgegevens niet in schema", detail: schemaFout });
      return;
    }
  }

  const client = maakAccountViewClient(versInst);

  const boekType = factuur.type === "verkoop" ? "verkoop" : "inkoop";
  const boeking: AccountviewBoeking = {
    dagboek: boekType === "verkoop" ? (versInst.dagboekVerkoop ?? "VRK") : (versInst.dagboekInkoop ?? "INK"),
    administratiecode: versInst.administratiecode ?? "",
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
    grootboekrekening: factuur.grootboekrekening ?? versInst.grootboekStandaard ?? undefined,
    kostenplaats: factuur.kostenplaats ?? undefined,
    projectCode: factuur.projectCode ?? undefined,
    type: boekType,
  };

  const payloadStr = JSON.stringify(boeking);
  const payloadHash = crypto.createHash("sha256").update(payloadStr).digest("hex");

  // F0 — Idempotency guard: blokkeer herexport met identieke payload die al geslaagd is.
  // Voorkomt dubbele boeking in AccountView bij meervoudig klikken of race-condition.
  // Bewust ná de claim en op de verse payload; bij blokkade wordt de claim
  // teruggegeven door de status van vóór de claim te herstellen.
  const [bestaandGelukt] = await db.select({ id: accountviewExportLogsTable.id })
    .from(accountviewExportLogsTable)
    .where(and(
      eq(accountviewExportLogsTable.factuurId, id),
      eq(accountviewExportLogsTable.payloadHash, payloadHash),
      eq(accountviewExportLogsTable.status, "geslaagd"),
    ))
    .limit(1);

  if (bestaandGelukt) {
    await db.update(facturenTable).set({ accountviewStatus: statusVoorClaim, bijgewerktOp: new Date() }).where(eq(facturenTable.id, id));
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
    testmodus: versInst.testmodus,
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
    testmodus: versInst.testmodus,
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
    // ADMINISTRATIE_01 fase 3: harde BV↔administratie-controle ook in batch.
    {
      const bvFout = await controleerFactuurAdministratieBv(factuur, inst.werkgeverId ?? null);
      if (bvFout) {
        resultaten.push({ status: "mislukt", factuur_id: fid, boeking_id: null, foutmelding: bvFout, testmodus: inst.testmodus });
        continue;
      }
    }
    // INKOOP_BOEKING_01: gedeelde verzend-claim tegen dubbele boekingen
    // (blokkeert ook her-verzenden van al succesvol geboekte facturen via batch).
    if (!(await claimAccountviewVerzending(fid))) {
      resultaten.push({ status: "mislukt", factuur_id: fid, boeking_id: null, foutmelding: "Er loopt al een verzending of de factuur is al geboekt", testmodus: inst.testmodus });
      continue;
    }

    // ADMINISTRATIE_01 fase 3: hercontrole ná de claim (TOCTOU) — vers
    // getoetst vlak vóór de externe call; weigering geeft de claim terug.
    // Client en payload worden per factuur uit de gevalideerde verse
    // snapshot opgebouwd, nooit uit de vóór de claim gelezen rij.
    const her = await hercontroleerBvNaClaim(factuur);
    if (her.bvFout !== null) {
      resultaten.push({ status: "mislukt", factuur_id: fid, boeking_id: null, foutmelding: her.bvFout, testmodus: inst.testmodus });
      continue;
    }
    const versInst = her.inst;

    // Rekeningschema-poort (ADMINISTRATIE_01): batch-export mag evenmin
    // buiten het schema van de gekoppelde BV boeken.
    if (versInst.werkgeverId != null) {
      const schemaFout = await controleerBoekingsschema(versInst.werkgeverId, fid, factuur.grootboekrekening ?? versInst.grootboekStandaard, factuur.btwCode);
      if (schemaFout) {
        await db.update(facturenTable).set({ accountviewStatus: "error", accountviewFout: schemaFout, bijgewerktOp: new Date() })
          .where(eq(facturenTable.id, fid));
        resultaten.push({ status: "mislukt", factuur_id: fid, boeking_id: null, foutmelding: schemaFout, testmodus: versInst.testmodus });
        continue;
      }
    }
    const client = maakAccountViewClient(versInst);


    const batchBoekType = factuur.type === "verkoop" ? "verkoop" : "inkoop";
    const boeking: AccountviewBoeking = {
      dagboek: batchBoekType === "verkoop" ? (versInst.dagboekVerkoop ?? "VRK") : (versInst.dagboekInkoop ?? "INK"),
      administratiecode: versInst.administratiecode ?? "",
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
      grootboekrekening: factuur.grootboekrekening ?? versInst.grootboekStandaard ?? undefined,
      kostenplaats: factuur.kostenplaats ?? undefined,
      projectCode: factuur.projectCode ?? undefined,
      type: factuur.type === "verkoop" ? "verkoop" : "inkoop",
    };

    const payloadStr = JSON.stringify(boeking);
    const payloadHash = crypto.createHash("sha256").update(payloadStr).digest("hex");

    const [logEntry] = await db.insert(accountviewExportLogsTable).values({
      factuurId: fid,
      gebruikerId: userId,
      testmodus: versInst.testmodus,
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
      testmodus: versInst.testmodus,
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
// Onveranderbaarheidsregel (ADMINISTRATIE_01 vervolg, architect-review): een
// factuur die verwerkt is of succesvol naar AccountView geboekt, is dossier —
// regels wijzigen zou Connect en AccountView stil uit elkaar laten lopen.
// Correcties op geboekte facturen horen via een creditering/herexport, niet
// via een stille regel-edit. Server-side afgedwongen (de UI verbergt alleen).
// Atomair (TOCTOU, architect-review): de check draait ín de mutatietransactie
// met FOR UPDATE op de factuurrij, zodat een gelijktijdige export niet tussen
// controle en mutatie door kan glippen; 'verzonden_naar_accountview' telt ook
// als vergrendeld omdat de externe payload dan al onderweg kan zijn.
type RegelTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function regelMutatieGeblokkeerd(tx: RegelTx, factuurId: number, res: Response): Promise<boolean> {
  const [f] = await tx.select({ status: facturenTable.status, avStatus: facturenTable.accountviewStatus, type: facturenTable.type, factuurnummer: facturenTable.factuurnummer })
    .from(facturenTable).where(eq(facturenTable.id, factuurId)).limit(1).for("update");
  if (!f) { res.status(404).json({ error: "Factuur niet gevonden" }); return true; }
  if (f.status === "verwerkt" || f.status === "verzonden_naar_accountview" || f.avStatus === "success" || f.avStatus === "verzenden") {
    res.status(409).json({ error: "Deze factuur is verwerkt/geboekt in AccountView — regels zijn niet meer te wijzigen. Corrigeer via een creditering of herexport." });
    return true;
  }
  // GELDSTROOM_01 (architect-review): een verkoopfactuur met fiscaal nummer is
  // dossier — na /definitief zijn regels onwijzigbaar; corrigeer via creditering.
  if (f.type === "verkoop" && f.factuurnummer) {
    res.status(409).json({ error: "Deze verkoopfactuur is definitief (fiscaal nummer toegekend) — regels zijn niet meer te wijzigen. Corrigeer via een creditering." });
    return true;
  }
  return false;
}

// GELDSTROOM_01 (architect-review): geldbedragen als decimale strings in
// centen-rekenwerk — nooit binaire floats voor factuurtotalen.
function naarCenten(s: string | null | undefined): number | null {
  if (s == null || s === "") return null;
  const t = String(s).trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(t)) return Number.NaN;
  const neg = t.startsWith("-");
  const [heel = "0", dec = ""] = (neg ? t.slice(1) : t).split(".");
  const c = Number(heel) * 100 + Number(`${dec}00`.slice(0, 2));
  return neg ? -c : c;
}
function centenNaarBedrag(c: number): string {
  const neg = c < 0; const a = Math.abs(c);
  return `${neg ? "-" : ""}${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}`;
}
/** 400 bij een niet-decimale bedrag-string; null/undefined is toegestaan. */
function ongeldigBedrag(res: Response, veld: string, waarde: string | null | undefined): boolean {
  const c = naarCenten(waarde ?? null);
  if (c !== null && Number.isNaN(c)) {
    res.status(400).json({ error: `${veld} moet een decimaal bedrag zijn (bv. "123.45")` });
    return true;
  }
  return false;
}
// Herberekent de koptotalen van een SAMENGESTELDE verkoopfactuur uit de
// bewaarde regels (centen-rekenwerk). Inkoopfacturen blijven ongemoeid: daar
// is het brondocument leidend en zijn regels een uitsplitsing, geen bron.
async function herberekenVerkoopfactuurTotalen(tx: RegelTx, factuurId: number): Promise<void> {
  const [f] = await tx.select({ type: facturenTable.type }).from(facturenTable).where(eq(facturenTable.id, factuurId)).limit(1);
  if (!f || f.type !== "verkoop") return;
  const regels = await tx.select({ excl: factuurRegelsTable.bedragExclBtw, btw: factuurRegelsTable.btwBedrag, pct: factuurRegelsTable.btwPercentage })
    .from(factuurRegelsTable).where(eq(factuurRegelsTable.factuurId, factuurId));
  let exclC = 0; let btwC = 0;
  for (const r of regels) {
    const e = naarCenten(r.excl);
    if (e !== null && !Number.isNaN(e)) exclC += e;
    const b = naarCenten(r.btw);
    if (b !== null && !Number.isNaN(b)) btwC += b;
    else if (r.pct != null && e !== null && !Number.isNaN(e)) btwC += Math.round((e * r.pct) / 100);
  }
  await tx.update(facturenTable).set({
    bedragExclBtw: centenNaarBedrag(exclC),
    btwBedrag: centenNaarBedrag(btwC),
    bedragInclBtw: centenNaarBedrag(exclC + btwC),
    bijgewerktOp: new Date(),
  }).where(eq(facturenTable.id, factuurId));
}

router.post("/facturen/:id/regels", requireBevoegdheid("financieel", 2), async (req: Request, res: Response): Promise<void> => {
  const factuurId = paramInt(req.params["id"]);
  const body = req.body as {
    omschrijving?: string; regelnummer?: number; hoeveelheid?: number; eenheid?: string;
    stukprijs?: string; bedrag_excl_btw?: string; btw_code?: string; btw_percentage?: number;
    btw_bedrag?: string; grootboekrekening?: string; kostenplaats?: string; categorie?: string;
    inkoopbon_regel_id?: number; bron?: string;
  };
  if (!body.omschrijving?.trim()) {
    res.status(400).json({ error: "omschrijving is verplicht" }); return;
  }
  if (ongeldigBedrag(res, "stukprijs", body.stukprijs) || ongeldigBedrag(res, "bedrag_excl_btw", body.bedrag_excl_btw) || ongeldigBedrag(res, "btw_bedrag", body.btw_bedrag)) return;

  const rij = await db.transaction(async (tx) => {
    if (await regelMutatieGeblokkeerd(tx, factuurId, res)) return null;
    // Volgende regelnummer bepalen
    const [maxRegel] = await tx.select({ max: sql<number>`MAX(regelnummer)` })
      .from(factuurRegelsTable).where(eq(factuurRegelsTable.factuurId, factuurId));
    const volgendNummer = (maxRegel?.max ?? 0) + 1;

    const [r] = await tx.insert(factuurRegelsTable).values({
      factuurId,
      regelnummer: body.regelnummer ?? volgendNummer,
      omschrijving: body.omschrijving!.trim(),
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
    await herberekenVerkoopfactuurTotalen(tx, factuurId);
    return r!;
  });
  if (!rij) return;
  res.status(201).json({ id: rij.id, factuur_id: rij.factuurId, regelnummer: rij.regelnummer });
});

// PATCH /facturen/:id/regels/:rid
router.patch("/facturen/:id/regels/:rid", requireBevoegdheid("financieel", 2), async (req: Request, res: Response): Promise<void> => {
  const factuurId = paramInt(req.params["id"]);
  const rid = paramInt(req.params["rid"]);
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
  if (ongeldigBedrag(res, "stukprijs", update.stukprijs as string | null | undefined)
    || ongeldigBedrag(res, "bedrag_excl_btw", update.bedragExclBtw as string | null | undefined)
    || ongeldigBedrag(res, "btw_bedrag", update.btwBedrag as string | null | undefined)) return;

  const updated = await db.transaction(async (tx) => {
    if (await regelMutatieGeblokkeerd(tx, factuurId, res)) return null;
    const [rij] = await tx.select({ id: factuurRegelsTable.id, pct: factuurRegelsTable.btwPercentage }).from(factuurRegelsTable)
      .where(and(eq(factuurRegelsTable.id, rid), eq(factuurRegelsTable.factuurId, factuurId))).limit(1);
    if (!rij) { res.status(404).json({ error: "Regel niet gevonden" }); return null; }
    // Wijzigt het excl.-bedrag zonder expliciet btw-bedrag, dan volgt de
    // regel-btw uit het (nieuwe of bestaande) percentage — anders raakt de
    // regelweergave uit de pas met de herberekende koptotalen.
    if ("bedrag_excl_btw" in body && !("btw_bedrag" in body)) {
      const pct = ("btw_percentage" in body ? (body["btw_percentage"] as number | null) : rij.pct);
      const e = naarCenten(update.bedragExclBtw as string | null | undefined);
      if (pct != null && e !== null && !Number.isNaN(e)) update.btwBedrag = centenNaarBedrag(Math.round((e * pct) / 100));
    }
    const [u] = await tx.update(factuurRegelsTable).set(update)
      .where(eq(factuurRegelsTable.id, rid)).returning();
    await herberekenVerkoopfactuurTotalen(tx, factuurId);
    return u!;
  });
  if (!updated) return;
  res.json({ id: updated.id, bijgewerkt_op: updated.bijgewerktOp.toISOString() });
});

// DELETE /facturen/:id/regels/:rid
router.delete("/facturen/:id/regels/:rid", requireBevoegdheid("financieel", 2), async (req: Request, res: Response): Promise<void> => {
  const factuurId = paramInt(req.params["id"]);
  const rid = paramInt(req.params["rid"]);
  const verwijderd = await db.transaction(async (tx) => {
    if (await regelMutatieGeblokkeerd(tx, factuurId, res)) return false;
    const [rij] = await tx.select({ id: factuurRegelsTable.id }).from(factuurRegelsTable)
      .where(and(eq(factuurRegelsTable.id, rid), eq(factuurRegelsTable.factuurId, factuurId))).limit(1);
    if (!rij) { res.status(404).json({ error: "Regel niet gevonden" }); return false; }
    await tx.delete(factuurRegelsTable).where(eq(factuurRegelsTable.id, rid));
    await herberekenVerkoopfactuurTotalen(tx, factuurId);
    return true;
  });
  if (!verwijderd) return;
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
