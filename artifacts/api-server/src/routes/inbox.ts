import { Router, type NextFunction, type Request, type Response } from "express";
import { publiekeAppUrl } from "../lib/publiekeUrl";
import multer from "multer";
import crypto from "crypto";
import {
  db,
  inboxItemsTable,
  inboxAuditLogTable,
  aanvraagPlanningenTable,
  aanvraagVoorstellenTable,
  gebouwenTable,
  offertesTable,
  opnamesTable,
  werkgeversTable,
  gebruikersTable,
  medewerkersTable,
  documentClassificatieCorrectiesTable,
} from "@workspace/db";
import { eq, desc, and, isNull, or, sql } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { parseEmailBestand } from "../services/email-ai";
import { aiGateway, heeftGateway } from "../lib/aiGateway";
import { ObjectStorageService } from "../lib/objectStorage";
import { stuurAanvraagBevestiging } from "../services/email";
import { classificeerDocument, type DocCategorie, type BewijsStap, analyseerAanvraagVoorStroom, extraheerTekst } from "../lib/documentIntelligence";
import { analyseerCvBestand } from "../lib/cvAnalyse";
import { zoekKlant } from "../services/aanvraagstroomService";
import { statusVoorAanvraagUploadConflict } from "../services/aanvraagUploadIdempotentie";

const objectStorage = new ObjectStorageService();

/** Canonieke Document Intelligence-categorie → bestaand Inbox document_categorie-veld
 * (vrij tekstveld, geen DB-enum; namen worden zoveel mogelijk hergebruikt zodat
 * bestaande frontend-weergaven — o.a. de speciale "snagstream_rapport"-sectie —
 * blijven werken).
 */
const DOC_CATEGORIE_NAAR_INBOX: Record<DocCategorie, string> = {
  aanvraag: "project_document",
  tekening: "gebouw_document",
  offerte: "offerte_document",
  factuur: "factuur",
  productdocument: "product_certificaat",
  testrapport: "eta_dop_brandclassificatie",
  certificaat: "product_certificaat",
  eta: "eta_dop_brandclassificatie",
  dop: "eta_dop_brandclassificatie",
  personeelsdocument: "hr_document",
  verzekering: "financieel_document",
  snagstream: "snagstream_rapport",
  jaarrekening: "jaarrekening",
  contract: "contract",
  // AKKOORD_01 §5: opdrachtbevestiging behoudt een eigen inbox-categorie zodat
  // ze herkenbaar blijft als koppelbaar grond B-akkoordbewijs (niet te
  // verwarren met een aanvraag, die ook "project_document" zou zijn).
  opdrachtbevestiging: "opdrachtbevestiging",
  prijslijst: "prijslijst",
  adviesrapport: "adviesrapport",
  bibliotheek: "product_certificaat",
  document_sjabloon: "document_sjabloon",
  algemeen: "onbekend",
  onbekend: "onbekend",
};

/** Pad in object storage op basis van AI-categorie.
 * snagstream → algemeen/snagstream/
 * overig     → algemeen/inbox/{categorie}/
 */
function opslagSubPath(categorie: string, bestandsnaam: string): string {
  const ts = Date.now();
  const veilig = bestandsnaam.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  const map: Record<string, string> = {
    snagstream_rapport: "algemeen/snagstream",
    offerte_document:   "algemeen/inbox/offertes",
    factuur:            "algemeen/inbox/facturen",
    oplevering_rapport: "algemeen/inbox/opleveringen",
    contract:           "algemeen/inbox/contracten",
    jaarrekening:       "algemeen/inbox/jaarrekeningen",
    opdrachtbevestiging: "algemeen/inbox/opdrachtbevestigingen",
    email:              "algemeen/inbox/emails",
  };
  const dir = map[categorie] ?? "algemeen/inbox/overig";
  return `${dir}/${ts}_${veilig}`;
}

const router = Router();

const lezen = requireBevoegdheid("crm", 1);
const schrijven = requireBevoegdheid("crm", 2);
// CV-analyse voor onboarding raakt personeelsgegevens; daarom personeel-schrijfrecht
// vereist in plaats van inbox/crm-recht.
const personeelSchrijven = requireBevoegdheid("personeel", 2);

const iso = (d: Date | null) => (d ? d.toISOString() : null);

function parseId(v: unknown): number {
  return parseInt(String(v), 10);
}

function parseBewijs(raw: string | null): BewijsStap[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as BewijsStap[]) : [];
  } catch {
    return [];
  }
}

const mapItem = (item: typeof inboxItemsTable.$inferSelect) => ({
  id: item.id,
  bestandsnaam: item.bestandsnaam,
  bestandspad: item.bestandspad,
  bestandsgrootte: item.bestandsgrootte,
  mimetype: item.mimetype,
  geupload_door: item.geuploadDoor,
  geupload_op: iso(item.geuploadOp),
  status: item.status,
  document_categorie: item.documentCategorie,
  document_subtype: item.documentSubtype,
  bestemming: item.bestemming,
  gekoppelde_entiteit_type: item.gekoppeldeEntiteitType,
  gekoppelde_entiteit_id: item.gekoppeldeEntiteitId,
  gekoppelde_entiteit_naam: item.gekoppeldeEntiteitNaam,
  ai_betrouwbaarheid: item.aiBetrouwbaarheid,
  ai_samenvatting: item.aiSamenvatting,
  ai_redenering: item.aiRedenering,
  ai_metadata: item.aiMetadata,
  ai_volgende_actie: item.aiVolgendeActie,
  ai_organisatie: item.aiOrganisatie,
  ai_jaar: item.aiJaar,
  ai_geconsolideerd: item.aiGeconsolideerd,
  geconsolideerd_override: item.geconsolideerdeOverride ?? null,
  ai_opslaglocatie: item.aiOpslaglocatie,
  ai_bewijs: parseBewijs(item.aiBewijs),
  lees_probleem: item.leesProbleem ?? null,
  duplicaat_van: item.duplicaatVan,
  mogelijk_duplicaat: item.mogelijkDuplicaat,
  goedgekeurd_door: item.goedgekeurdDoor,
  goedgekeurd_op: iso(item.goedgekeurdOp ?? null),
  afgewezen_reden: item.afgewezenReden,
  verplaatst_op: iso(item.verplaatstOp ?? null),
  opmerkingen: item.opmerkingen,
  bijgewerkt_op: iso(item.bijgewerktOp),
  snagstream_opdrachtgever: item.snagstreamOpdrachtgever,
  snagstream_gebouw: item.snagstreamGebouw,
  snagstream_project: item.snagstreamProject,
  snagstream_rapportdatum: item.snagstreamRapportdatum,
  snagstream_rapporttype: item.snagstreamRapporttype,
  snagstream_status: item.snagstreamStatus,
});

// ── STATS ─────────────────────────────────────────────────────────────────────
router.get("/inbox/stats", lezen, async (req, res): Promise<void> => {
  try {
    const userId = req.session.userId ?? null;
    let items = await db.select().from(inboxItemsTable);

    if (userId) {
      const [g] = await db.select({ rol: gebruikersTable.rol }).from(gebruikersTable).where(eq(gebruikersTable.id, userId));
      if (g?.rol !== "hoofdbeheerder") {
        items = items.filter((i) => i.geuploadDoor === userId);
      }
    }

    const totaal = items.length;
    const nieuw = items.filter((i) => i.status === "nieuw").length;
    const terBeoordeling = items.filter((i) => i.status === "ter_beoordeling").length;
    const goedgekeurd = items.filter((i) => i.status === "goedgekeurd").length;
    const verplaatst = items.filter((i) => i.status === "verplaatst").length;
    const verwerkt = items.filter((i) => i.status === "verwerkt").length;
    const afgewezen = items.filter((i) => i.status === "afgewezen").length;
    const snagstream = items.filter((i) => i.documentCategorie === "snagstream_rapport").length;
    const laagBetrouwbaarheid = items.filter((i) => i.aiBetrouwbaarheid === "laag" && i.status !== "afgewezen").length;

    res.json({ totaal, nieuw, ter_beoordeling: terBeoordeling, goedgekeurd, verplaatst, verwerkt, afgewezen, snagstream_rapporten: snagstream, laag_betrouwbaarheid: laagBetrouwbaarheid });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── ITEMS LIST ────────────────────────────────────────────────────────────────
router.get("/inbox/items", lezen, async (req, res): Promise<void> => {
  try {
    const status = req.query.status ? String(req.query.status) : undefined;
    const bestemming = req.query.bestemming ? String(req.query.bestemming) : undefined;
    const gebouwId = req.query.gebouw_id ? parseInt(String(req.query.gebouw_id), 10) : undefined;
    const userId = req.session.userId ?? null;

    let rijen = await db.select().from(inboxItemsTable).orderBy(desc(inboxItemsTable.geuploadOp));

    // Privacy: niet-beheerders zien alleen hun eigen uploads, ook bij gebouw_id-filter
    if (userId) {
      const [g] = await db.select({ rol: gebruikersTable.rol }).from(gebruikersTable).where(eq(gebruikersTable.id, userId));
      if (g?.rol !== "hoofdbeheerder") {
        rijen = rijen.filter((i) => i.geuploadDoor === userId);
      }
    }

    if (status) rijen = rijen.filter((i) => i.status === status);
    if (bestemming) rijen = rijen.filter((i) => i.bestemming === bestemming);

    // Gebouw-filter: inbox-items waarbij de gekoppelde offerte bij dit gebouw hoort
    if (gebouwId && !isNaN(gebouwId)) {
      const gebouwOffertes = await db
        .select({ id: offertesTable.id })
        .from(offertesTable)
        .where(eq(offertesTable.gebouwId, gebouwId));
      const offerteIds = new Set(gebouwOffertes.map((o) => o.id));
      rijen = rijen.filter(
        (i) =>
          (i.gekoppeldeEntiteitType === "offerte" && i.gekoppeldeEntiteitId !== null && offerteIds.has(i.gekoppeldeEntiteitId)) ||
          (i.gekoppeldeEntiteitType === "gebouw" && i.gekoppeldeEntiteitId === gebouwId),
      );
    }

    res.json(rijen.map(mapItem));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── REGISTREER DOCUMENT (multipart: bestand verplicht of metadata-only fallback) ──
const uploadEnkel = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.post("/inbox/items", schrijven, uploadEnkel.single("bestand"), async (req, res): Promise<void> => {
  try {
    const bestand = req.file ?? null;
    const bestandsnaam: string = bestand?.originalname ?? (req.body.bestandsnaam as string | undefined) ?? "";
    if (!bestandsnaam) return void res.status(400).json({ error: "bestandsnaam is verplicht" });

    const mimetype: string = bestand?.mimetype ?? (req.body.mimetype as string | undefined) ?? "application/octet-stream";
    const bestandsgrootte: number | null = bestand?.size ?? (req.body.bestandsgrootte ? parseInt(req.body.bestandsgrootte as string, 10) : null);
    const opmerkingen: string | null = (req.body.opmerkingen as string | undefined) ?? null;
    const gebruikerId = req.session.userId ?? null;

    const geconsolideerd_override: string | undefined = req.body.geconsolideerd_override as string | undefined;

    let werkmaatschappijNaam: string | null = null;
    if (gebruikerId) {
      try {
        const [wm] = await db
          .select({ naam: werkgeversTable.naam })
          .from(medewerkersTable)
          .innerJoin(werkgeversTable, eq(medewerkersTable.werkgeverId, werkgeversTable.id))
          .where(eq(medewerkersTable.gebruikerId, gebruikerId));
        werkmaatschappijNaam = wm?.naam ?? null;
      } catch { /* niet blokkeren als gebruiker geen medewerker is */ }
    }

    const analyse = await classificeerDocument({
      buffer: bestand?.buffer ?? null,
      bestandsnaam,
      mime: mimetype,
      toelichting: opmerkingen,
      werkmaatschappijNaam,
    });
    const documentCategorie = DOC_CATEGORIE_NAAR_INBOX[analyse.categorie];
    const bestemming = analyse.module_bestemming;
    const isSnagstream = analyse.categorie === "snagstream";

    const heeftGeconsolideerdOverride =
      analyse.categorie === "jaarrekening" && geconsolideerd_override !== undefined;
    const geconsolideerdWaarde = heeftGeconsolideerdOverride
      ? geconsolideerd_override === "true" || geconsolideerd_override === "1"
      : analyse.subtype === "geconsolideerd";
    const opslaglocatieWaarde = heeftGeconsolideerdOverride
      ? (() => {
          const type = geconsolideerdWaarde ? "Geconsolideerde jaarrekeningen" : "Jaarrekeningen";
          return analyse.jaar ? `Archief → ${type} → ${analyse.jaar}` : `Archief → ${type} → jaar onbekend`;
        })()
      : analyse.opslaglocatie;

    // Upload het bestand naar object storage als bytes aanwezig zijn — fail-loud:
    // bij storage-uitval weigeren we het verzoek in plaats van een dood pad te bewaren.
    let bestandspad: string;
    if (bestand) {
      const subPath = opslagSubPath(documentCategorie, bestandsnaam);
      try {
        bestandspad = await objectStorage.uploadBestand(subPath, bestand.buffer, mimetype);
      } catch (err) {
        req.log.error({ err }, "Object storage niet beschikbaar — inbox-upload geweigerd");
        return void res.status(503).json({
          error: "De bestandsopslag is momenteel niet beschikbaar. Het document is niet opgeslagen — probeer het later opnieuw of waarschuw de beheerder.",
        });
      }
    } else {
      // Metadata-only fallback (backward compatibility)
      bestandspad = (req.body.bestandspad as string | undefined) ?? `inbox/${Date.now()}_${bestandsnaam}`;
    }

    const [item] = await db
      .insert(inboxItemsTable)
      .values({
        bestandsnaam,
        bestandspad,
        bestandsgrootte,
        mimetype,
        geuploadDoor: gebruikerId,
        status: "geanalyseerd",
        documentCategorie,
        documentSubtype: analyse.subtype ?? null,
        bestemming,
        aiBetrouwbaarheid: analyse.vertrouwen,
        aiSamenvatting: analyse.redenering,
        aiRedenering: analyse.redenering,
        aiVolgendeActie: analyse.directe_actie_beschrijving || null,
        aiOrganisatie: analyse.organisatie,
        aiJaar: analyse.jaar,
        aiGeconsolideerd: geconsolideerdWaarde,
        aiOpslaglocatie: opslaglocatieWaarde,
        aiBewijs: JSON.stringify(analyse.bewijs),
        leesProbleem: analyse.lees_probleem,
        snagstreamOpdrachtgever: isSnagstream ? (analyse.organisatie ?? analyse.gevonden_gegevens.opdrachtgever ?? null) : null,
        snagstreamGebouw: isSnagstream ? (analyse.gevonden_gegevens.locatie ?? analyse.gevonden_gegevens.gebouw ?? null) : null,
        snagstreamProject: isSnagstream ? (analyse.gevonden_gegevens.project ?? null) : null,
        snagstreamRapportdatum: isSnagstream ? (analyse.gevonden_gegevens.datum ?? null) : null,
        snagstreamRapporttype: isSnagstream ? "inspectie" : null,
        snagstreamStatus: isSnagstream ? "nieuw" : null,
        opmerkingen,
      })
      .returning();

    await db.insert(inboxAuditLogTable).values({
      inboxItemId: item.id,
      actie: "geregistreerd",
      gebruikerId,
      details: bestand
        ? `Bestand "${bestandsnaam}" geüpload naar ${bestandspad}. AI-categorie: ${documentCategorie} (${analyse.vertrouwen}). Bewijs: ${analyse.bewijs.map((b) => b.stap).join(" → ")}`
        : `Bestand "${bestandsnaam}" geregistreerd (metadata). AI-categorie: ${documentCategorie} (${analyse.vertrouwen})`,
    });

    res.status(201).json(mapItem(item));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── ITEM DETAIL ───────────────────────────────────────────────────────────────
router.get("/inbox/items/:id", lezen, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params.id);
    const [[item], auditlog] = await Promise.all([
      db.select().from(inboxItemsTable).where(eq(inboxItemsTable.id, id)),
      db.select().from(inboxAuditLogTable).where(eq(inboxAuditLogTable.inboxItemId, id)).orderBy(desc(inboxAuditLogTable.aangemaaktOp)),
    ]);
    if (!item) return void res.status(404).json({ error: "Item niet gevonden" });
    res.json({
      ...mapItem(item),
      auditlog: auditlog.map((a) => ({ id: a.id, actie: a.actie, gebruiker_id: a.gebruikerId, details: a.details, aangemaakt_op: iso(a.aangemaaktOp) })),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── CV-ANALYSE VOOR ONBOARDING ────────────────────────────────────────────────
// AI stelt onboarding-velden voor op basis van een als CV herkend inbox-bestand.
// Er wordt hier NOOIT een medewerker of gebruiker aangemaakt; de mens bevestigt
// in het onboardingformulier. Vereist personeel-schrijfrecht.
router.post("/inbox/items/:id/cv-analyse", personeelSchrijven, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params.id);
    const [item] = await db.select().from(inboxItemsTable).where(eq(inboxItemsTable.id, id));
    if (!item) return void res.status(404).json({ error: "Item niet gevonden" });

    if (item.documentCategorie !== "hr_document" || item.documentSubtype !== "cv") {
      return void res.status(422).json({ error: "Dit inbox-item is niet als CV herkend. Onboarding-voorstel is alleen beschikbaar voor CV's." });
    }

    if (!item.bestandspad || !item.bestandspad.startsWith("/objects/")) {
      return void res.status(404).json({ error: "Het bestand van dit inbox-item is niet beschikbaar in de opslag." });
    }

    let buffer: Buffer;
    try {
      const storageFile = await objectStorage.getObjectEntityFile(item.bestandspad);
      const downloadResponse = await objectStorage.downloadObject(storageFile);
      buffer = Buffer.from(await downloadResponse.arrayBuffer());
    } catch {
      return void res.status(404).json({ error: "Het bestand van dit inbox-item is niet beschikbaar in de opslag." });
    }

    const uitkomst = await analyseerCvBestand({
      buffer,
      bestandsnaam: item.bestandsnaam,
      mimetype: item.mimetype,
    });
    if (!uitkomst.ok) {
      return void res.status(uitkomst.status).json({ error: uitkomst.fout });
    }

    const gebruikerId = req.session.userId ?? null;
    await db.insert(inboxAuditLogTable).values({
      inboxItemId: id,
      actie: "cv_analyse",
      gebruikerId,
      details: "Onboarding gestart vanuit CV: AI-voorstel voor onboarding-velden opgehaald (geen medewerker aangemaakt).",
    });

    return void res.json(uitkomst.resultaat);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── ITEM BIJWERKEN ────────────────────────────────────────────────────────────
router.patch("/inbox/items/:id", schrijven, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params.id);
    const {
      document_categorie, bestemming, opmerkingen,
      gekoppelde_entiteit_type, gekoppelde_entiteit_id, gekoppelde_entiteit_naam,
      snagstream_opdrachtgever, snagstream_gebouw, snagstream_project,
      snagstream_rapportdatum, snagstream_rapporttype, snagstream_status,
      ai_geconsolideerd,
    } = req.body as {
      document_categorie?: string;
      bestemming?: string;
      opmerkingen?: string;
      gekoppelde_entiteit_type?: string;
      gekoppelde_entiteit_id?: string | number;
      gekoppelde_entiteit_naam?: string;
      snagstream_opdrachtgever?: string;
      snagstream_gebouw?: string;
      snagstream_project?: string;
      snagstream_rapportdatum?: string;
      snagstream_rapporttype?: string;
      snagstream_status?: string;
      ai_geconsolideerd?: boolean;
    };

    type InboxSetValues = Partial<typeof inboxItemsTable.$inferInsert> & { bijgewerktOp: Date };
    const setValues: InboxSetValues = {
      documentCategorie: document_categorie,
      bestemming,
      opmerkingen,
      gekoppeldeEntiteitType: gekoppelde_entiteit_type,
      gekoppeldeEntiteitId: gekoppelde_entiteit_id ? parseId(gekoppelde_entiteit_id) : undefined,
      gekoppeldeEntiteitNaam: gekoppelde_entiteit_naam,
      snagstreamOpdrachtgever: snagstream_opdrachtgever,
      snagstreamGebouw: snagstream_gebouw,
      snagstreamProject: snagstream_project,
      snagstreamRapportdatum: snagstream_rapportdatum,
      snagstreamRapporttype: snagstream_rapporttype,
      snagstreamStatus: snagstream_status,
      bijgewerktOp: new Date(),
    };

    if (ai_geconsolideerd !== undefined) {
      const geconsolideerd = Boolean(ai_geconsolideerd);
      setValues.aiGeconsolideerd = geconsolideerd;
      setValues.geconsolideerdeOverride = geconsolideerd;

      const [huidig] = await db
        .select({ documentCategorie: inboxItemsTable.documentCategorie, aiJaar: inboxItemsTable.aiJaar })
        .from(inboxItemsTable)
        .where(eq(inboxItemsTable.id, id));

      if (huidig?.documentCategorie === "jaarrekening") {
        const type = geconsolideerd ? "Geconsolideerde jaarrekeningen" : "Jaarrekeningen";
        const jaar = huidig.aiJaar;
        setValues.aiOpslaglocatie = jaar
          ? `Archief → ${type} → ${jaar}`
          : `Archief → ${type} → jaar onbekend`;
      }
    }

    // Haal het huidige item op voor correctie-opname (vóór update)
    const [huidigItem] = await db
      .select({
        documentCategorie: inboxItemsTable.documentCategorie,
        aiOpslaglocatie: inboxItemsTable.aiOpslaglocatie,
        aiBewijs: inboxItemsTable.aiBewijs,
      })
      .from(inboxItemsTable)
      .where(eq(inboxItemsTable.id, id));

    const [item] = await db
      .update(inboxItemsTable)
      .set(setValues)
      .where(eq(inboxItemsTable.id, id))
      .returning();

    if (!item) return void res.status(404).json({ error: "Item niet gevonden" });

    // Correctie-leerloop: sla handmatige categorie-aanpassing op als referentie
    if (
      document_categorie &&
      huidigItem?.documentCategorie &&
      document_categorie !== huidigItem.documentCategorie
    ) {
      let werkmaatschappijNaam: string | null = null;
      const correctieGebruikerId = req.session.userId ?? null;
      if (correctieGebruikerId) {
        try {
          const [wm] = await db
            .select({ naam: werkgeversTable.naam })
            .from(medewerkersTable)
            .innerJoin(werkgeversTable, eq(medewerkersTable.werkgeverId, werkgeversTable.id))
            .where(eq(medewerkersTable.gebruikerId, correctieGebruikerId));
          werkmaatschappijNaam = wm?.naam ?? null;
        } catch { /* niet blokkeren */ }
      }
      const bestandshash = item.bestandsnaam
        ? crypto.createHash("sha256").update(item.bestandsnaam + (item.mimetype ?? "")).digest("hex")
        : null;
      let bewijsSignalen: unknown[] | null = null;
      if (huidigItem.aiBewijs) {
        try { bewijsSignalen = JSON.parse(huidigItem.aiBewijs); } catch { /* niet parseerbaar */ }
      }
      try {
        await db.insert(documentClassificatieCorrectiesTable).values({
          bestandshash,
          origineleCategorie: huidigItem.documentCategorie,
          gecorrigeerdeCategorie: document_categorie,
          werkmaatschappij: werkmaatschappijNaam,
          bewijsSignalen: Array.isArray(bewijsSignalen) ? bewijsSignalen : null,
        });
      } catch (err) {
        req.log.warn({ err }, "inbox PATCH: correctie opslaan mislukt (niet-kritiek)");
      }
    }

    const gebruikerId = req.session.userId ?? null;
    const auditDetails = ai_geconsolideerd !== undefined
      ? `Geconsolideerd-instelling gewijzigd naar: ${Boolean(ai_geconsolideerd) ? "ja" : "nee"}`
      : "Metagegevens bijgewerkt";
    await db.insert(inboxAuditLogTable).values({ inboxItemId: id, actie: "bijgewerkt", gebruikerId, details: auditDetails });

    res.json(mapItem(item));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── GOEDKEUREN ────────────────────────────────────────────────────────────────
router.post("/inbox/items/:id/goedkeuren", schrijven, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params.id);
    const gebruikerId = req.session.userId ?? null;
    const [item] = await db
      .update(inboxItemsTable)
      .set({ status: "goedgekeurd", goedgekeurdDoor: gebruikerId, goedgekeurdOp: new Date(), bijgewerktOp: new Date() })
      .where(eq(inboxItemsTable.id, id))
      .returning();
    if (!item) return void res.status(404).json({ error: "Item niet gevonden" });
    await db.insert(inboxAuditLogTable).values({ inboxItemId: id, actie: "goedgekeurd", gebruikerId, details: req.body.opmerkingen ?? null });
    res.json(mapItem(item));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── AFWIJZEN ──────────────────────────────────────────────────────────────────
router.post("/inbox/items/:id/afwijzen", schrijven, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params.id);
    const { reden } = req.body;
    if (!reden) return void res.status(400).json({ error: "reden is verplicht" });
    const gebruikerId = req.session.userId ?? null;
    const [item] = await db
      .update(inboxItemsTable)
      .set({ status: "afgewezen", afgewezenReden: reden, bijgewerktOp: new Date() })
      .where(eq(inboxItemsTable.id, id))
      .returning();
    if (!item) return void res.status(404).json({ error: "Item niet gevonden" });
    await db.insert(inboxAuditLogTable).values({ inboxItemId: id, actie: "afgewezen", gebruikerId, details: reden });
    res.json(mapItem(item));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── VERPLAATSEN ───────────────────────────────────────────────────────────────
router.post("/inbox/items/:id/verplaatsen", schrijven, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params.id);
    const { bestemming, gekoppelde_entiteit_type, gekoppelde_entiteit_id, gekoppelde_entiteit_naam } = req.body;
    if (!bestemming) return void res.status(400).json({ error: "bestemming is verplicht" });
    const gebruikerId = req.session.userId ?? null;
    const [item] = await db
      .update(inboxItemsTable)
      .set({
        status: "verplaatst",
        bestemming,
        gekoppeldeEntiteitType: gekoppelde_entiteit_type ?? null,
        gekoppeldeEntiteitId: gekoppelde_entiteit_id ? parseId(gekoppelde_entiteit_id) : null,
        gekoppeldeEntiteitNaam: gekoppelde_entiteit_naam ?? null,
        verplaatstOp: new Date(),
        bijgewerktOp: new Date(),
      })
      .where(eq(inboxItemsTable.id, id))
      .returning();
    if (!item) return void res.status(404).json({ error: "Item niet gevonden" });
    await db.insert(inboxAuditLogTable).values({ inboxItemId: id, actie: "verplaatst", gebruikerId, details: `Verplaatst naar: ${bestemming}` });
    res.json(mapItem(item));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── TER BEOORDELING STELLEN ───────────────────────────────────────────────────
router.post("/inbox/items/:id/ter-beoordeling", schrijven, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params.id);
    const gebruikerId = req.session.userId ?? null;
    const [item] = await db
      .update(inboxItemsTable)
      .set({ status: "ter_beoordeling", bijgewerktOp: new Date() })
      .where(eq(inboxItemsTable.id, id))
      .returning();
    if (!item) return void res.status(404).json({ error: "Item niet gevonden" });
    await db.insert(inboxAuditLogTable).values({ inboxItemId: id, actie: "ter_beoordeling_gesteld", gebruikerId, details: null });
    res.json(mapItem(item));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── OFFERTE-AANVRAAG UPLOADEN & AI VERWERKEN ─────────────────────────────────
// AANVRAAG_01 §4 — intake-only route: GEEN offerte/gebouw/opname/project vóór akkoord.
// Schrijft uitsluitend: inbox_item (nieuw), auditlog, aanvraag_voorstel (open).
const MAX_AANVRAAG_BESTAND_BYTES = 25 * 1024 * 1024;
const MAX_AANVRAAG_TOTAAL_BYTES = 50 * 1024 * 1024;
const aanvraagUploadBytes = new WeakMap<object, number>();

class AanvraagUploadTotaalTeGroot extends Error {
  constructor() {
    super("Aanvraagupload is in totaal te groot.");
    this.name = "AanvraagUploadTotaalTeGroot";
  }
}

const begrensdeAanvraagOpslag: multer.StorageEngine = {
  _handleFile(req, file, callback) {
    const delen: Buffer[] = [];
    let grootte = 0;
    let afgerond = false;

    const rondAf = (fout?: Error) => {
      if (afgerond) return;
      afgerond = true;
      if (fout) {
        file.stream.resume();
        callback(fout);
        return;
      }
      callback(null, { buffer: Buffer.concat(delen), size: grootte });
    };

    file.stream.on("data", (deel: Buffer) => {
      if (afgerond) return;
      grootte += deel.length;
      const totaal = (aanvraagUploadBytes.get(req) ?? 0) + deel.length;
      aanvraagUploadBytes.set(req, totaal);
      if (totaal > MAX_AANVRAAG_TOTAAL_BYTES) {
        rondAf(new AanvraagUploadTotaalTeGroot());
        return;
      }
      delen.push(deel);
    });
    file.stream.on("error", (fout) => rondAf(fout));
    file.stream.on("end", () => rondAf());
  },
  _removeFile(_req, file, callback) {
    delete (file as Partial<Express.Multer.File>).buffer;
    callback(null);
  },
};

const upload = multer({
  storage: begrensdeAanvraagOpslag,
  limits: {
    fileSize: MAX_AANVRAAG_BESTAND_BYTES,
    files: 11,
    fields: 10,
    parts: 21,
  },
});
const verwerkAanvraagUpload = upload.fields([
  { name: "email", maxCount: 1 },
  { name: "bijlagen", maxCount: 10 },
]);

function begrensAanvraagUpload(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  verwerkAanvraagUpload(req, res, (fout) => {
    if (!fout) {
      next();
      return;
    }
    if (fout instanceof multer.MulterError || fout instanceof AanvraagUploadTotaalTeGroot) {
      res.status(413).json({
        error: "Upload te groot: maximaal 25 MB per bestand en 50 MB in totaal.",
      });
      return;
    }
    next(fout);
  });
}

function onderwerpUitBestandsnaam(bestandsnaam: string): string {
  return bestandsnaam.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Offerte-aanvraag";
}

router.post(
  "/inbox/offerte-aanvraag",
  schrijven,
  begrensAanvraagUpload,
  async (req, res): Promise<void> => {
    const uploadObjectPaden: string[] = [];
    let uploadObjectenOvergedragen = false;
    const ruimMislukteUploadOp = async (): Promise<void> => {
      if (uploadObjectenOvergedragen || uploadObjectPaden.length === 0) return;
      const paden = [...new Set(uploadObjectPaden)];
      uploadObjectPaden.length = 0;
      await Promise.all(paden.map(async (objectPad) => {
        try {
          await objectStorage.deleteBestand(objectPad);
        } catch (opruimFout) {
          req.log.warn({ opruimFout, objectPad }, "mislukte aanvraagupload kon niet volledig worden opgeruimd");
        }
      }));
    };

    try {
      // ── Input validatie ───────────────────────────────────────────────────────
      const werkmaatschappijId = req.body?.werkmaatschappij_id
        ? parseInt(String(req.body.werkmaatschappij_id), 10)
        : null;
      if (!werkmaatschappijId || isNaN(werkmaatschappijId)) {
        return void res.status(400).json({ error: "werkmaatschappij_id is verplicht" });
      }

      const files = req.files as Record<string, Express.Multer.File[]> | undefined;
      const emailBestand = files?.["email"]?.[0] ?? null;
      if (!emailBestand) {
        return void res.status(400).json({ error: "bronbestand (email) is verplicht" });
      }

      // A. 401 vóór writes als sessie geen userId heeft
      const gebruikerId = req.session.userId ?? null;
      if (!gebruikerId) {
        return void res.status(401).json({ error: "Niet ingelogd." });
      }

      // ── Werkmaatschappij valideren ────────────────────────────────────────────
      const [werkgever] = await db
        .select({ id: werkgeversTable.id, naam: werkgeversTable.naam })
        .from(werkgeversTable)
        .where(eq(werkgeversTable.id, werkmaatschappijId));
      if (!werkgever) {
        return void res.status(400).json({ error: "Werkmaatschappij niet gevonden" });
      }

      // ── A. Stabiele SHA-256 identiteit VÓÓR upload (idempotentie op exacte bronbytes) ─
      const emailBestandsnaam = emailBestand.originalname;
      const sha256 = crypto
        .createHash("sha256")
        .update(emailBestand.buffer)
        .digest("hex");
      const mailMessageIdUpload = `upload:${sha256}`;

      // ── Idempotentie: controleer vóór upload of we dit bestand al kennen ──────
      const bestaandVoorstelVroeg = await db
        .select({ id: aanvraagVoorstellenTable.id })
        .from(aanvraagVoorstellenTable)
        .where(eq(aanvraagVoorstellenTable.mailMessageId, mailMessageIdUpload))
        .limit(1);
      if (bestaandVoorstelVroeg.length > 0) {
        return void res.status(409).json({ error: "Dit bronbestand is al verwerkt.", voorstel_id: bestaandVoorstelVroeg[0].id });
      }

      // ── Upload bronbestand naar object storage ────────────────────────────────
      // Elke request krijgt eigen paden. Daardoor kan een verliezende race veilig
      // alleen zijn eigen blobs compenseren, terwijl de SHA de DB-idempotentie bewaakt.
      const uploadRequestId = crypto.randomUUID();
      const veiligNaam = emailBestandsnaam.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
      const bronSubPath = `algemeen/inbox/emails/${sha256.slice(0, 16)}_${uploadRequestId}_${veiligNaam}`;
      let bronBestandspad: string;
      const verwachtBronPad = `/objects/${bronSubPath}`;
      const bronPadIndex = uploadObjectPaden.push(verwachtBronPad) - 1;
      try {
        bronBestandspad = await objectStorage.uploadBestand(bronSubPath, emailBestand.buffer, emailBestand.mimetype ?? "application/octet-stream");
        uploadObjectPaden[bronPadIndex] = bronBestandspad;
      } catch (err) {
        await ruimMislukteUploadOp();
        req.log.error({ err }, "Object storage niet beschikbaar — aanvraagbron niet opgeslagen");
        return void res.status(503).json({
          error: "De bestandsopslag is momenteel niet beschikbaar. De aanvraag is niet opgeslagen.",
        });
      }

      // ── Upload bijlagen ───────────────────────────────────────────────────────
      const bijlagenBestanden = files?.["bijlagen"] ?? [];
      const opgeslagenBijlagen: Array<{ naam: string; url: string }> = [];
      const bijlageTeksten: Array<{ naam: string; tekst: string }> = [];
      for (const [bijlageIndex, b] of bijlagenBestanden.slice(0, 10).entries()) {
        const bijlageSha = crypto.createHash("sha256").update(b.buffer).digest("hex");
        const veiligBijlage = b.originalname.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
        const subPath = `algemeen/inbox/emails/${bijlageSha.slice(0, 16)}_${uploadRequestId}_${bijlageIndex}_${veiligBijlage}`;
        const verwachtBijlagePad = `/objects/${subPath}`;
        const bijlagePadIndex = uploadObjectPaden.push(verwachtBijlagePad) - 1;
        try {
          const url = await objectStorage.uploadBestand(subPath, b.buffer, b.mimetype ?? "application/octet-stream");
          uploadObjectPaden[bijlagePadIndex] = url;
          opgeslagenBijlagen.push({ naam: b.originalname, url });
        } catch (err) {
          await ruimMislukteUploadOp();
          req.log.error({ err, naam: b.originalname }, "bijlage opslaan mislukt — aanvraag niet vastgelegd");
          return void res.status(503).json({
            error: `Bijlage "${b.originalname}" kon niet worden opgeslagen. De aanvraag is niet opgeslagen.`,
          });
        }

        const extractie = await extraheerTekst(
          b.buffer,
          b.mimetype ?? "application/octet-stream",
          b.originalname,
        );
        const tekst = extractie.tekst?.trim() ?? "";
        if (tekst.length >= 40) {
          bijlageTeksten.push({ naam: b.originalname, tekst });
        }
      }

      // ── E-mail parsen & AI-analyse ────────────────────────────────────────────
      let emailTekst = "";
      let emailOnderwerp: string | null = null;
      let emailAfzender: string | null = null;
      let emailAfzenderNaam: string | null = null;
      let emailAfzenderAdres = "";
      try {
        const geparseerd = await parseEmailBestand(emailBestandsnaam, emailBestand.buffer);
        emailTekst = geparseerd.inhoudTekst ?? "";
        emailOnderwerp = geparseerd.onderwerp;
        emailAfzender = geparseerd.afzender;
        // Probeer naam en adres te splitsen uit "Naam <adres>"
        const m = geparseerd.afzender?.match(/^(.+?)\s*<([^>]+)>$/) ?? null;
        if (m) { emailAfzenderNaam = m[1].trim() || null; emailAfzenderAdres = m[2].trim(); }
        else { emailAfzenderAdres = geparseerd.afzender?.trim() ?? ""; }
      } catch (parseErr) {
        req.log.warn({ parseErr }, "E-mail parsen mislukt — velden leeg");
      }

      const analyse = await analyseerAanvraagVoorStroom({
        mailOnderwerp: emailOnderwerp ?? onderwerpUitBestandsnaam(emailBestandsnaam),
        mailAfzender: emailAfzender ?? "(onbekend)",
        mailTekst: emailTekst,
        bijlageTeksten,
      });

      const velden = analyse.ok && analyse.velden ? analyse.velden : null;
      const aiSamenvatting = velden?.samenvatting ?? null;

      // ── CRM-matching (kandidaten) — GEEN automatische aanmaak ────────────────
      const klantMatch = velden
        ? await zoekKlant(emailAfzenderAdres, velden.contact_email, velden.klant_naam)
        : { klantId: null, klantNaam: null, kandidaten: [] };

      // ── Één transactie: alleen inbox_item + auditlog + aanvraag_voorstel ──────
      // Race-condition: als twee gelijktijdige requests door de vroege check glippen,
      // vangt de UNIQUE constraint op mail_message_id de tweede op als error code 23505.
      let resultaat: { inboxItem: typeof inboxItemsTable.$inferSelect; voorstel: typeof aanvraagVoorstellenTable.$inferSelect };
      try {
      resultaat = await db.transaction(async (tx) => {
        const [inboxItem] = await tx
          .insert(inboxItemsTable)
          .values({
            bestandsnaam: emailBestandsnaam,
            bestandspad: bronBestandspad,
            bestandsgrootte: emailBestand.size ?? null,
            mimetype: emailBestand.mimetype ?? null,
            geuploadDoor: gebruikerId,
            status: "nieuw",
            documentCategorie: "offerte_aanvraag",
            bestemming: "CRM",
            aiBetrouwbaarheid: heeftGateway() && analyse.ok ? "hoog" : "midden",
            aiSamenvatting: aiSamenvatting ?? `Offerte-aanvraag van ${velden?.klant_naam ?? "onbekend"}`,
            aiVolgendeActie: "Aanvraagvoorstel beoordelen en accepteren",
          })
          .returning();

        await tx.insert(inboxAuditLogTable).values({
          inboxItemId: inboxItem.id,
          actie: "geregistreerd",
          gebruikerId,
          details: `Offerte-aanvraag ontvangen. AI-voorstel aangemaakt, wacht op beoordeling.`,
        });

        const [voorstel] = await tx
          .insert(aanvraagVoorstellenTable)
          .values({
            gebruikerId,
            mailMessageId: mailMessageIdUpload,
            mailboxAdres: werkgever.naam,
            isPersoonlijk: false,
            afzenderNaam: emailAfzenderNaam,
            afzenderEmail: emailAfzenderAdres,
            onderwerp: emailOnderwerp ?? onderwerpUitBestandsnaam(emailBestandsnaam),
            binnengekomenOp: new Date(),
            voorstelType: "nieuwe_aanvraag",
            status: "open",
            inboxItemId: inboxItem.id,
            werkmaatschappijId: werkmaatschappijId,
            aiVoorstel: {
              titel: velden?.titel ?? null,
              klant_id: klantMatch.klantId,
              klant_naam: klantMatch.klantNaam ?? velden?.klant_naam ?? null,
              klant_adres: velden?.klant_adres ?? null,
              klant_postcode: velden?.klant_postcode ?? null,
              klant_stad: velden?.klant_stad ?? null,
              klant_onbekend: klantMatch.klantId == null,
              klant_kandidaten: klantMatch.kandidaten,
              contact_naam: velden?.contact_naam ?? null,
              contact_email: velden?.contact_email ?? null,
              contact_telefoon: velden?.contact_telefoon ?? null,
              gebouw_naam: velden?.gebouw_naam ?? null,
              gebouw_adres: velden?.gebouw_adres ?? null,
              gebouw_stad: velden?.gebouw_stad ?? null,
              gebouw_postcode: velden?.gebouw_postcode ?? null,
              werkzaamheden: velden?.werkzaamheden ?? null,
              // De gekozen werkmaatschappij is menselijke invoer; nooit een AI-gok.
              bv: werkgever.naam,
              ontbrekende_stukken: velden?.ontbrekende_stukken ?? [],
              samenvatting: aiSamenvatting,
              onzekere_velden: velden?.onzekere_velden ?? [],
              bron_bewijs: velden?.bron_bewijs ?? null,
            },
            bijlagen: opgeslagenBijlagen,
          })
          .returning();

        return { inboxItem, voorstel };
      });
      } catch (txErr: unknown) {
        if (statusVoorAanvraagUploadConflict(txErr) === 409) {
          const bestaand = await db
            .select({ id: aanvraagVoorstellenTable.id })
            .from(aanvraagVoorstellenTable)
            .where(eq(aanvraagVoorstellenTable.mailMessageId, mailMessageIdUpload))
            .limit(1);
          await ruimMislukteUploadOp();
          return void res.status(409).json({ error: "Dit bronbestand is al verwerkt.", voorstel_id: bestaand[0]?.id ?? null });
        }
        throw txErr;
      }

      uploadObjectenOvergedragen = true;
      res.status(201).json({
        inbox_item: mapItem(resultaat.inboxItem),
        voorstel_id: resultaat.voorstel.id,
        ai_samenvatting: aiSamenvatting,
        aangemaakt: {
          voorstel: true,
        },
      });
    } catch (err) {
      await ruimMislukteUploadOp();
      req.log.error(err);
      res.status(500).json({ error: "Interne serverfout" });
    }
  },
);

// ── VERWIJDEREN ───────────────────────────────────────────────────────────────
router.delete("/inbox/items/:id", schrijven, async (req, res): Promise<void> => {
  try {
    await db.delete(inboxItemsTable).where(eq(inboxItemsTable.id, parseId(req.params.id)));
    res.status(204).end();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── AANVRAAG-PLANNING (PL) ───────────────────────────────────────────────────

router.get("/inbox/items/:id/planning", lezen, async (req, res): Promise<void> => {
  try {
    const itemId = parseId(req.params.id);
    const [planning] = await db
      .select()
      .from(aanvraagPlanningenTable)
      .where(eq(aanvraagPlanningenTable.inboxItemId, itemId));
    if (!planning) return void res.status(404).json({ error: "Geen planning gevonden" });
    res.json(planning);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.patch("/inbox/items/:id/planning", schrijven, async (req, res): Promise<void> => {
  try {
    const itemId = parseId(req.params.id);
    const { pl_planning_datum, pl_notitie } = req.body as { pl_planning_datum?: string | null; pl_notitie?: string | null };
    const [bijgewerkt] = await db
      .update(aanvraagPlanningenTable)
      .set({
        plPlanningDatum: pl_planning_datum ?? null,
        plNotitie: pl_notitie ?? null,
        plBijgewerktOp: new Date(),
        bijgewerktOp: new Date(),
      })
      .where(eq(aanvraagPlanningenTable.inboxItemId, itemId))
      .returning();
    if (!bijgewerkt) return void res.status(404).json({ error: "Geen planning gevonden" });
    res.json(bijgewerkt);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── PUBLIEK AANVRAAG-ANTWOORD FORMULIER ──────────────────────────────────────

const ANTWOORD_CSS = `
  body{font-family:system-ui,-apple-system,sans-serif;margin:0;padding:0;background:#f4f4f5;}
  .wrap{max-width:520px;margin:48px auto;background:#fff;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.12);overflow:hidden;}
  .hdr{background:#212631;padding:24px 32px;display:flex;align-items:center;gap:12px;}
  .hdr-dot{width:24px;height:24px;background:#F23B0D;border-radius:5px;flex-shrink:0;}
  .hdr-title{color:#fff;font-size:15px;font-weight:700;letter-spacing:.4px;}
  .body{padding:28px 32px;}
  h1{margin:0 0 8px;font-size:18px;color:#212631;}
  p{margin:0 0 20px;font-size:14px;color:#52525b;line-height:1.6;}
  label{display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px;}
  select,input[type=text]{width:100%;box-sizing:border-box;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;color:#111827;margin-bottom:16px;}
  .radio-group{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;}
  .radio-group label{font-weight:400;cursor:pointer;padding:6px 14px;border:1px solid #d1d5db;border-radius:20px;font-size:13px;color:#374151;white-space:nowrap;display:inline-flex;align-items:center;gap:6px;}
  .radio-group input{margin:0;}
  textarea{width:100%;box-sizing:border-box;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;color:#111827;margin-bottom:16px;resize:vertical;}
  button{background:#F23B0D;color:#fff;border:none;border-radius:6px;padding:10px 24px;font-size:14px;font-weight:600;cursor:pointer;letter-spacing:.3px;}
  button:hover{background:#d63309;}
  .ftr{background:#f4f4f5;padding:16px 32px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;text-align:center;}
  .success{text-align:center;padding:40px 32px;}
  .success h2{font-size:20px;color:#212631;margin:0 0 12px;}
  .check{font-size:40px;margin:0 0 16px;}
`;

function htmlPagina(inhoud: string): string {
  return `<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>Aanvraag aanvullen</title><style>${ANTWOORD_CSS}</style></head><body><div class="wrap">${inhoud}<div class="ftr">FPS Brandpreventie &bull; Dit formulier is gekoppeld aan uw offerte-aanvraag.</div></div></body></html>`;
}

router.get("/inbox/aanvraag-antwoord/:token", async (req, res): Promise<void> => {
  try {
    const { token } = req.params;
    const [planning] = await db
      .select()
      .from(aanvraagPlanningenTable)
      .where(eq(aanvraagPlanningenTable.antwoordToken, token));

    if (!planning) {
      res.status(404).send(htmlPagina('<div class="body"><h1>Link niet gevonden</h1><p>Deze link is ongeldig of verlopen. Neem contact op met uw contactpersoon bij FPS Brandpreventie.</p></div>'));
      return;
    }
    if (planning.antwoordenOntvangenOp) {
      res.send(htmlPagina('<div class="body success"><div class="check">&#10003;</div><h2>Antwoorden al ontvangen</h2><p>Wij hebben uw antwoorden al geregistreerd. Bedankt!</p></div>'));
      return;
    }

    const vragen: string[] = [];
    if (!planning.aiResponstermijn) {
      vragen.push(`<div>
        <label for="responstermijn">Binnen welke termijn verwacht u een inhoudelijke reactie?</label>
        <div class="radio-group">
          ${["1 week","2 weken","1 maand","2 maanden","Geen voorkeur"].map(v =>
            `<label><input type="radio" name="responstermijn" value="${v}" required/> ${v}</label>`
          ).join("")}
        </div>
      </div>`);
    }
    if (!planning.aiOpname) {
      vragen.push(`<div>
        <label>Is een opname van het gebouw gewenst of noodzakelijk?</label>
        <div class="radio-group">
          <label><input type="radio" name="opname_nodig" value="ja" required/> Ja, gewenst</label>
          <label><input type="radio" name="opname_nodig" value="nee" required/> Nee, niet nodig</label>
          <label><input type="radio" name="opname_nodig" value="onbekend" required/> Weet ik niet</label>
        </div>
      </div>`);
    }
    if (!planning.aiPlattegronden) {
      vragen.push(`<div>
        <label>Zijn alle plattegrondtekeningen bijgevoegd of nog na te sturen?</label>
        <div class="radio-group">
          <label><input type="radio" name="plattegronden_status" value="meegezonden" required/> Bijgevoegd</label>
          <label><input type="radio" name="plattegronden_status" value="nog te zenden" required/> Volgen nog</label>
          <label><input type="radio" name="plattegronden_status" value="niet van toepassing" required/> Niet van toepassing</label>
        </div>
      </div>`);
    }

    const formulierInhoud =
      vragen.length === 0
        ? '<div class="body success"><div class="check">&#9745;</div><h2>Geen vragen meer open</h2><p>Alle benodigde informatie is al uit uw aanvraag opgehaald. Bedankt!</p></div>'
        : `<div class="body">
            <h1>Aanvraag aanvullen</h1>
            <p>Helpt u ons door onderstaande vragen in te vullen? Dit stelt ons in staat uw aanvraag sneller te beoordelen.</p>
            <form method="POST" action="/api/inbox/aanvraag-antwoord/${token}">
              ${vragen.join("\n")}
              <div>
                <label for="extra_opmerking">Overige opmerkingen (optioneel)</label>
                <textarea id="extra_opmerking" name="extra_opmerking" rows="3" placeholder="Bijv. bijzondere omstandigheden, specifieke wensen..."></textarea>
              </div>
              <button type="submit">Antwoorden verzenden</button>
            </form>
          </div>`;

    res.send(htmlPagina(formulierInhoud));
  } catch (err) {
    req.log.error(err);
    res.status(500).send(htmlPagina('<div class="body"><h1>Er is een fout opgetreden</h1><p>Probeer het later opnieuw of neem contact op.</p></div>'));
  }
});

router.post("/inbox/aanvraag-antwoord/:token", async (req, res): Promise<void> => {
  try {
    const { token } = req.params;
    const [planning] = await db
      .select()
      .from(aanvraagPlanningenTable)
      .where(eq(aanvraagPlanningenTable.antwoordToken, token));

    if (!planning) {
      res.status(404).send(htmlPagina('<div class="body"><h1>Link niet gevonden</h1><p>Deze link is ongeldig of verlopen.</p></div>'));
      return;
    }
    if (planning.antwoordenOntvangenOp) {
      res.send(htmlPagina('<div class="body success"><div class="check">&#10003;</div><h2>Al ontvangen</h2><p>Uw antwoorden zijn al geregistreerd.</p></div>'));
      return;
    }

    const body = req.body as Record<string, string>;
    await db.update(aanvraagPlanningenTable).set({
      gewensteResponstermijn: body["responstermijn"] ?? null,
      opnameNodig: body["opname_nodig"] ?? null,
      plattegrondenStatus: body["plattegronden_status"] ?? null,
      extraOpmerking: body["extra_opmerking"] || null,
      antwoordenOntvangenOp: new Date(),
      bijgewerktOp: new Date(),
    }).where(eq(aanvraagPlanningenTable.antwoordToken, token));

    // Planning-datum afleiden uit responstermijn als PL nog geen datum heeft ingesteld
    if (!planning.plPlanningDatum && body["responstermijn"]) {
      const termijn = body["responstermijn"];
      const nu = new Date();
      let datum: Date | null = null;
      if (termijn.includes("week")) {
        const weken = parseInt(termijn) || 1;
        datum = new Date(nu.getTime() + weken * 7 * 86_400_000);
      } else if (termijn.includes("maand")) {
        const maanden = parseInt(termijn) || 1;
        datum = new Date(nu.setMonth(nu.getMonth() + maanden));
      }
      if (datum) {
        await db.update(aanvraagPlanningenTable).set({
          plPlanningDatum: datum.toISOString().slice(0, 10),
          bijgewerktOp: new Date(),
        }).where(eq(aanvraagPlanningenTable.antwoordToken, token));
      }
    }

    // Audit log
    if (planning.inboxItemId) {
      await db.insert(inboxAuditLogTable).values({
        inboxItemId: planning.inboxItemId,
        actie: "aanvraag_antwoorden_ontvangen",
        gebruikerId: null,
        details: `Antwoorden ontvangen via bevestigingsmail-link.`,
      }).catch(() => void 0);
    }

    res.send(htmlPagina(`<div class="body success"><div class="check" style="color:#16a34a;">&#10003;</div><h2>Bedankt!</h2><p>Uw antwoorden zijn ontvangen. Onze projectleider neemt contact met u op.</p></div>`));
  } catch (err) {
    req.log.error(err);
    res.status(500).send(htmlPagina('<div class="body"><h1>Er is een fout opgetreden</h1><p>Probeer het later opnieuw.</p></div>'));
  }
});

// ── HERCLASSIFICEER BESTAANDE ITEMS (beheer-actie) ────────────────────────────
// Haalt alle inbox_items met een lege bewijsketen (ai_bewijs IS NULL) opnieuw
// door classificeerDocument() en vult de ontbrekende AI-velden in.
// Status, bestemming en document_categorie van al afgehandelde items blijven ongewijzigd.
router.post("/inbox/herclassificeer", schrijven, async (req, res): Promise<void> => {
  const gebruikerId = req.session.userId ?? null;

  try {
    const items = await db
      .select()
      .from(inboxItemsTable)
      .where(
        or(
          isNull(inboxItemsTable.aiBewijs),
          sql`${inboxItemsTable.aiBewijs} = '[]'`,
          sql`${inboxItemsTable.aiBewijs} = ''`
        )
      );

    if (items.length === 0) {
      res.json({ verwerkt: 0, geslaagd: 0, mislukt: 0, items: [] });
      return;
    }

    type ItemResultaat = {
      id: number;
      bestandsnaam: string;
      status: "geslaagd" | "mislukt";
      fout?: string;
    };

    const resultaten: ItemResultaat[] = [];
    let geslaagd = 0;
    let mislukt = 0;

    for (const item of items) {
      try {
        // Probeer bestandsbuffer te laden uit object storage
        let buffer: Buffer | null = null;
        if (item.bestandspad && item.bestandspad.startsWith("/objects/")) {
          try {
            const storageFile = await objectStorage.getObjectEntityFile(item.bestandspad);
            const downloadResponse = await objectStorage.downloadObject(storageFile);
            const arrayBuf = await downloadResponse.arrayBuffer();
            buffer = Buffer.from(arrayBuf);
          } catch {
            req.log.warn({ id: item.id, pad: item.bestandspad }, "herclassificeer: bestand niet beschikbaar in storage — metadata-only classificatie");
          }
        }

        const analyse = await classificeerDocument({
          buffer,
          bestandsnaam: item.bestandsnaam,
          mime: item.mimetype ?? "application/octet-stream",
          toelichting: item.opmerkingen ?? undefined,
        });

        const aiGeconsolideerd = analyse.subtype === "geconsolideerd";
        const effectiefGeconsolideerd = item.geconsolideerdeOverride !== null
          ? item.geconsolideerdeOverride
          : aiGeconsolideerd;

        let opslaglocatie = analyse.opslaglocatie;
        if (item.documentCategorie === "jaarrekening" && item.geconsolideerdeOverride !== null) {
          const type = effectiefGeconsolideerd ? "Geconsolideerde jaarrekeningen" : "Jaarrekeningen";
          opslaglocatie = item.aiJaar
            ? `Archief → ${type} → ${item.aiJaar}`
            : `Archief → ${type} → jaar onbekend`;
        }

        await db
          .update(inboxItemsTable)
          .set({
            documentSubtype: analyse.subtype ?? null,
            aiBetrouwbaarheid: analyse.vertrouwen,
            aiSamenvatting: analyse.redenering,
            aiRedenering: analyse.redenering,
            aiVolgendeActie: analyse.directe_actie_beschrijving || null,
            aiOrganisatie: analyse.organisatie,
            aiJaar: analyse.jaar,
            aiGeconsolideerd: aiGeconsolideerd,
            aiOpslaglocatie: opslaglocatie,
            aiBewijs: JSON.stringify(analyse.bewijs),
            leesProbleem: analyse.lees_probleem,
            bijgewerktOp: new Date(),
          })
          .where(eq(inboxItemsTable.id, item.id));

        await db.insert(inboxAuditLogTable).values({
          inboxItemId: item.id,
          actie: "herclassificeerd",
          gebruikerId,
          details: `Herclassificatie uitgevoerd. AI-bewijs aangevuld (${analyse.bewijs.length} stappen, betrouwbaarheid: ${analyse.vertrouwen}). Buffer: ${buffer ? `${buffer.length} bytes` : "niet beschikbaar"}.`,
        });

        geslaagd++;
        resultaten.push({ id: item.id, bestandsnaam: item.bestandsnaam, status: "geslaagd" });
      } catch (itemErr) {
        const foutTekst = itemErr instanceof Error ? itemErr.message : String(itemErr);
        req.log.error({ id: item.id, err: itemErr }, "herclassificeer: item mislukt");
        mislukt++;
        resultaten.push({ id: item.id, bestandsnaam: item.bestandsnaam, status: "mislukt", fout: foutTekst });
      }
    }

    res.json({
      verwerkt: items.length,
      geslaagd,
      mislukt,
      items: resultaten,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
