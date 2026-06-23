import { Router } from "express";
import multer from "multer";
import { db } from "@workspace/db";
import {
  inboxItemsTable,
  inboxAuditLogTable,
  gebouwenTable,
  offertesTable,
  opnamesTable,
  werkgeversTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { parseEmailBestand } from "../services/email-ai";
import { heeftOpenAi, maakOpenAiClient } from "../lib/openai";
import { ObjectStorageService } from "../lib/objectStorage";

const objectStorage = new ObjectStorageService();

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
    email:              "algemeen/inbox/emails",
  };
  const dir = map[categorie] ?? "algemeen/inbox/overig";
  return `${dir}/${ts}_${veilig}`;
}

const router = Router();

const lezen = requireBevoegdheid("crm", 1);
const schrijven = requireBevoegdheid("crm", 2);

const iso = (d: Date | null) => (d ? d.toISOString() : null);

function parseId(v: unknown): number {
  return parseInt(String(v), 10);
}

// ── MOCK AI CLASSIFIER ────────────────────────────────────────────────────────
type AiResultaat = {
  document_categorie: string;
  bestemming: string;
  ai_betrouwbaarheid: "hoog" | "midden" | "laag";
  ai_samenvatting: string;
  ai_redenering: string;
  ai_volgende_actie: string;
  snagstream_opdrachtgever: string | null;
  snagstream_gebouw: string | null;
  snagstream_project: string | null;
  snagstream_rapportdatum: string | null;
  snagstream_rapporttype: string | null;
  snagstream_status: string | null;
};

function classificeerMockAI(bestandsnaam: string, mimetype?: string): AiResultaat {
  const naam = bestandsnaam.toLowerCase();
  const ext = naam.split(".").pop() ?? "";

  if (naam.includes("snagstream") || naam.includes("snag_stream")) {
    return {
      document_categorie: "snagstream_rapport",
      bestemming: "Snagstream",
      ai_betrouwbaarheid: "hoog",
      ai_samenvatting: "Snagstream inspectierapport gedetecteerd.",
      ai_redenering: "Bestandsnaam bevat 'snagstream'. PDF-rapport van inspectiepartij.",
      ai_volgende_actie: "Controleer opdrachtgever en koppel aan juist gebouw.",
      snagstream_opdrachtgever: "Onbekend (uit PDF te lezen)",
      snagstream_gebouw: "Onbekend",
      snagstream_project: null,
      snagstream_rapportdatum: null,
      snagstream_rapporttype: "inspectie",
      snagstream_status: "nieuw",
    };
  }

  if (naam.includes("offert") || naam.includes("prijsopgave")) {
    return {
      document_categorie: "offerte_document",
      bestemming: "Offertes",
      ai_betrouwbaarheid: "hoog",
      ai_samenvatting: "Offertedocument herkend op basis van bestandsnaam.",
      ai_redenering: "Bestandsnaam bevat 'offert' of 'prijsopgave'.",
      ai_volgende_actie: "Koppelen aan klant en projectkans in CRM.",
      snagstream_opdrachtgever: null, snagstream_gebouw: null, snagstream_project: null,
      snagstream_rapportdatum: null, snagstream_rapporttype: null, snagstream_status: null,
    };
  }

  if (naam.includes("factuur") || naam.includes("invoice") || naam.includes("rekening")) {
    return {
      document_categorie: "factuur",
      bestemming: "Financieel",
      ai_betrouwbaarheid: "hoog",
      ai_samenvatting: "Factuur of inkoopbon gedetecteerd.",
      ai_redenering: "Bestandsnaam bevat 'factuur', 'invoice' of 'rekening'.",
      ai_volgende_actie: "Controleren en verwerken in financieel beheer.",
      snagstream_opdrachtgever: null, snagstream_gebouw: null, snagstream_project: null,
      snagstream_rapportdatum: null, snagstream_rapporttype: null, snagstream_status: null,
    };
  }

  if (naam.includes("oplevering") || naam.includes("opleverapport")) {
    return {
      document_categorie: "oplevering_rapport",
      bestemming: "Oplevering",
      ai_betrouwbaarheid: "hoog",
      ai_samenvatting: "Opleverrapport gedetecteerd.",
      ai_redenering: "Bestandsnaam bevat 'oplevering' of 'opleverapport'.",
      ai_volgende_actie: "Koppelen aan gebouw en dossier.",
      snagstream_opdrachtgever: null, snagstream_gebouw: null, snagstream_project: null,
      snagstream_rapportdatum: null, snagstream_rapporttype: null, snagstream_status: null,
    };
  }

  if (naam.includes("contract") || naam.includes("overeenkomst") || naam.includes("sla")) {
    return {
      document_categorie: "contract",
      bestemming: "CRM",
      ai_betrouwbaarheid: "midden",
      ai_samenvatting: "Contract of overeenkomst herkend.",
      ai_redenering: "Bestandsnaam bevat 'contract', 'overeenkomst' of 'sla'.",
      ai_volgende_actie: "Koppelen aan organisatie in CRM.",
      snagstream_opdrachtgever: null, snagstream_gebouw: null, snagstream_project: null,
      snagstream_rapportdatum: null, snagstream_rapporttype: null, snagstream_status: null,
    };
  }

  if (naam.includes("certificaat") || naam.includes("certif") || naam.includes("keurmerk")) {
    return {
      document_categorie: "product_certificaat",
      bestemming: "Productbibliotheek",
      ai_betrouwbaarheid: "midden",
      ai_samenvatting: "Productcertificaat of keurmerk gedetecteerd.",
      ai_redenering: "Bestandsnaam bevat 'certificaat' of 'certif'.",
      ai_volgende_actie: "Opslaan in productbibliotheek bij het juiste label.",
      snagstream_opdrachtgever: null, snagstream_gebouw: null, snagstream_project: null,
      snagstream_rapportdatum: null, snagstream_rapporttype: null, snagstream_status: null,
    };
  }

  if (naam.includes("inspectie") || naam.includes("keur") || naam.includes("rapport")) {
    return {
      document_categorie: "uitvoering_document",
      bestemming: "Uitvoering",
      ai_betrouwbaarheid: "midden",
      ai_samenvatting: "Inspectie- of keuringsrapport herkend.",
      ai_redenering: "Bestandsnaam bevat 'inspectie', 'keur' of 'rapport'.",
      ai_volgende_actie: "Koppelen aan gebouw en inspectieregel.",
      snagstream_opdrachtgever: null, snagstream_gebouw: null, snagstream_project: null,
      snagstream_rapportdatum: null, snagstream_rapporttype: null, snagstream_status: null,
    };
  }

  if (naam.includes("hrm") || naam.includes("personeel") || naam.includes("medewerker") || naam.includes("loonstrook") || naam.includes("arbeidscontract")) {
    return {
      document_categorie: "hr_document",
      bestemming: "HRM",
      ai_betrouwbaarheid: "midden",
      ai_samenvatting: "HR-document of personeelsdocument herkend.",
      ai_redenering: "Bestandsnaam bevat HRM-gerelateerde termen.",
      ai_volgende_actie: "Verwerken in HRM-module bij betreffende medewerker.",
      snagstream_opdrachtgever: null, snagstream_gebouw: null, snagstream_project: null,
      snagstream_rapportdatum: null, snagstream_rapporttype: null, snagstream_status: null,
    };
  }

  if (ext === "pdf") {
    return {
      document_categorie: "onbekend",
      bestemming: "DMS",
      ai_betrouwbaarheid: "laag",
      ai_samenvatting: "PDF-document. Inhoud niet te bepalen op basis van bestandsnaam.",
      ai_redenering: "Geen herkenbare sleutelwoorden in de bestandsnaam gevonden.",
      ai_volgende_actie: "Handmatig categoriseren en koppelen aan de juiste module.",
      snagstream_opdrachtgever: null, snagstream_gebouw: null, snagstream_project: null,
      snagstream_rapportdatum: null, snagstream_rapporttype: null, snagstream_status: null,
    };
  }

  return {
    document_categorie: "onbekend",
    bestemming: "Onbekend",
    ai_betrouwbaarheid: "laag",
    ai_samenvatting: "Document type niet herkend.",
    ai_redenering: "Geen herkenbare patronen gevonden in bestandsnaam of type.",
    ai_volgende_actie: "Handmatig beoordelen en toewijzen.",
    snagstream_opdrachtgever: null, snagstream_gebouw: null, snagstream_project: null,
    snagstream_rapportdatum: null, snagstream_rapporttype: null, snagstream_status: null,
  };
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
  bestemming: item.bestemming,
  gekoppelde_entiteit_type: item.gekoppeldeEntiteitType,
  gekoppelde_entiteit_id: item.gekoppeldeEntiteitId,
  gekoppelde_entiteit_naam: item.gekoppeldeEntiteitNaam,
  ai_betrouwbaarheid: item.aiBetrouwbaarheid,
  ai_samenvatting: item.aiSamenvatting,
  ai_redenering: item.aiRedenering,
  ai_metadata: item.aiMetadata,
  ai_volgende_actie: item.aiVolgendeActie,
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
router.get("/inbox/stats", lezen, async (req, res) => {
  try {
    const items = await db.select().from(inboxItemsTable);
    const totaal = items.length;
    const nieuw = items.filter((i) => i.status === "nieuw").length;
    const terBeoordeling = items.filter((i) => i.status === "ter_beoordeling").length;
    const goedgekeurd = items.filter((i) => i.status === "goedgekeurd").length;
    const verplaatst = items.filter((i) => i.status === "verplaatst").length;
    const afgewezen = items.filter((i) => i.status === "afgewezen").length;
    const snagstream = items.filter((i) => i.documentCategorie === "snagstream_rapport").length;
    const laagBetrouwbaarheid = items.filter((i) => i.aiBetrouwbaarheid === "laag" && i.status !== "afgewezen").length;

    res.json({ totaal, nieuw, ter_beoordeling: terBeoordeling, goedgekeurd, verplaatst, afgewezen, snagstream_rapporten: snagstream, laag_betrouwbaarheid: laagBetrouwbaarheid });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── ITEMS LIST ────────────────────────────────────────────────────────────────
router.get("/inbox/items", lezen, async (req, res) => {
  try {
    const status = req.query.status ? String(req.query.status) : undefined;
    const bestemming = req.query.bestemming ? String(req.query.bestemming) : undefined;

    let rijen = await db.select().from(inboxItemsTable).orderBy(desc(inboxItemsTable.geuploadOp));

    if (status) rijen = rijen.filter((i) => i.status === status);
    if (bestemming) rijen = rijen.filter((i) => i.bestemming === bestemming);

    res.json(rijen.map(mapItem));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── REGISTREER DOCUMENT (multipart: bestand verplicht of metadata-only fallback) ──
const uploadEnkel = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.post("/inbox/items", schrijven, uploadEnkel.single("bestand"), async (req, res) => {
  try {
    const bestand = req.file ?? null;
    const bestandsnaam: string = bestand?.originalname ?? (req.body.bestandsnaam as string | undefined) ?? "";
    if (!bestandsnaam) return res.status(400).json({ error: "bestandsnaam is verplicht" });

    const mimetype: string = bestand?.mimetype ?? (req.body.mimetype as string | undefined) ?? "application/octet-stream";
    const bestandsgrootte: number | null = bestand?.size ?? (req.body.bestandsgrootte ? parseInt(req.body.bestandsgrootte as string, 10) : null);
    const opmerkingen: string | null = (req.body.opmerkingen as string | undefined) ?? null;
    const gebruikerId = req.session.userId ?? null;

    const ai = classificeerMockAI(bestandsnaam, mimetype);

    // Upload het bestand naar object storage als bytes aanwezig zijn
    let bestandspad: string;
    if (bestand) {
      const subPath = opslagSubPath(ai.document_categorie, bestandsnaam);
      try {
        bestandspad = await objectStorage.uploadBestand(subPath, bestand.buffer, mimetype);
      } catch {
        req.log.warn("Object storage niet beschikbaar — pad zonder upload opslaan");
        bestandspad = `/objects/${subPath}`;
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
        documentCategorie: ai.document_categorie,
        bestemming: ai.bestemming,
        aiBetrouwbaarheid: ai.ai_betrouwbaarheid,
        aiSamenvatting: ai.ai_samenvatting,
        aiRedenering: ai.ai_redenering,
        aiVolgendeActie: ai.ai_volgende_actie,
        snagstreamOpdrachtgever: ai.snagstream_opdrachtgever,
        snagstreamGebouw: ai.snagstream_gebouw,
        snagstreamProject: ai.snagstream_project,
        snagstreamRapportdatum: ai.snagstream_rapportdatum,
        snagstreamRapporttype: ai.snagstream_rapporttype,
        snagstreamStatus: ai.snagstream_status,
        opmerkingen,
      })
      .returning();

    await db.insert(inboxAuditLogTable).values({
      inboxItemId: item.id,
      actie: "geregistreerd",
      gebruikerId,
      details: bestand
        ? `Bestand "${bestandsnaam}" geüpload naar ${bestandspad}. AI-categorie: ${ai.document_categorie} (${ai.ai_betrouwbaarheid})`
        : `Bestand "${bestandsnaam}" geregistreerd (metadata). AI-categorie: ${ai.document_categorie} (${ai.ai_betrouwbaarheid})`,
    });

    res.status(201).json(mapItem(item));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── ITEM DETAIL ───────────────────────────────────────────────────────────────
router.get("/inbox/items/:id", lezen, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const [[item], auditlog] = await Promise.all([
      db.select().from(inboxItemsTable).where(eq(inboxItemsTable.id, id)),
      db.select().from(inboxAuditLogTable).where(eq(inboxAuditLogTable.inboxItemId, id)).orderBy(desc(inboxAuditLogTable.aangemaaktOp)),
    ]);
    if (!item) return res.status(404).json({ error: "Item niet gevonden" });
    res.json({
      ...mapItem(item),
      auditlog: auditlog.map((a) => ({ id: a.id, actie: a.actie, gebruiker_id: a.gebruikerId, details: a.details, aangemaakt_op: iso(a.aangemaaktOp) })),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── ITEM BIJWERKEN ────────────────────────────────────────────────────────────
router.patch("/inbox/items/:id", schrijven, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const {
      document_categorie, bestemming, opmerkingen,
      gekoppelde_entiteit_type, gekoppelde_entiteit_id, gekoppelde_entiteit_naam,
      snagstream_opdrachtgever, snagstream_gebouw, snagstream_project,
      snagstream_rapportdatum, snagstream_rapporttype, snagstream_status,
    } = req.body;

    const [item] = await db
      .update(inboxItemsTable)
      .set({
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
      })
      .where(eq(inboxItemsTable.id, id))
      .returning();

    if (!item) return res.status(404).json({ error: "Item niet gevonden" });

    const gebruikerId = req.session.userId ?? null;
    await db.insert(inboxAuditLogTable).values({ inboxItemId: id, actie: "bijgewerkt", gebruikerId, details: "Metagegevens bijgewerkt" });

    res.json(mapItem(item));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── GOEDKEUREN ────────────────────────────────────────────────────────────────
router.post("/inbox/items/:id/goedkeuren", schrijven, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const gebruikerId = req.session.userId ?? null;
    const [item] = await db
      .update(inboxItemsTable)
      .set({ status: "goedgekeurd", goedgekeurdDoor: gebruikerId, goedgekeurdOp: new Date(), bijgewerktOp: new Date() })
      .where(eq(inboxItemsTable.id, id))
      .returning();
    if (!item) return res.status(404).json({ error: "Item niet gevonden" });
    await db.insert(inboxAuditLogTable).values({ inboxItemId: id, actie: "goedgekeurd", gebruikerId, details: req.body.opmerkingen ?? null });
    res.json(mapItem(item));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── AFWIJZEN ──────────────────────────────────────────────────────────────────
router.post("/inbox/items/:id/afwijzen", schrijven, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const { reden } = req.body;
    if (!reden) return res.status(400).json({ error: "reden is verplicht" });
    const gebruikerId = req.session.userId ?? null;
    const [item] = await db
      .update(inboxItemsTable)
      .set({ status: "afgewezen", afgewezenReden: reden, bijgewerktOp: new Date() })
      .where(eq(inboxItemsTable.id, id))
      .returning();
    if (!item) return res.status(404).json({ error: "Item niet gevonden" });
    await db.insert(inboxAuditLogTable).values({ inboxItemId: id, actie: "afgewezen", gebruikerId, details: reden });
    res.json(mapItem(item));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── VERPLAATSEN ───────────────────────────────────────────────────────────────
router.post("/inbox/items/:id/verplaatsen", schrijven, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const { bestemming, gekoppelde_entiteit_type, gekoppelde_entiteit_id, gekoppelde_entiteit_naam } = req.body;
    if (!bestemming) return res.status(400).json({ error: "bestemming is verplicht" });
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
    if (!item) return res.status(404).json({ error: "Item niet gevonden" });
    await db.insert(inboxAuditLogTable).values({ inboxItemId: id, actie: "verplaatst", gebruikerId, details: `Verplaatst naar: ${bestemming}` });
    res.json(mapItem(item));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── TER BEOORDELING STELLEN ───────────────────────────────────────────────────
router.post("/inbox/items/:id/ter-beoordeling", schrijven, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const gebruikerId = req.session.userId ?? null;
    const [item] = await db
      .update(inboxItemsTable)
      .set({ status: "ter_beoordeling", bijgewerktOp: new Date() })
      .where(eq(inboxItemsTable.id, id))
      .returning();
    if (!item) return res.status(404).json({ error: "Item niet gevonden" });
    await db.insert(inboxAuditLogTable).values({ inboxItemId: id, actie: "ter_beoordeling_gesteld", gebruikerId, details: null });
    res.json(mapItem(item));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── OFFERTE-AANVRAAG UPLOADEN & AI VERWERKEN ─────────────────────────────────
const upload = multer({ storage: multer.memoryStorage() });

interface AiAanvraagExtractie {
  opdrachtgever: string | null;
  contactpersoon: string | null;
  contactpersoon_email: string | null;
  contactpersoon_telefoon: string | null;
  gebouw_naam: string | null;
  adres: string | null;
  stad: string | null;
  postcode: string | null;
  beschrijving_werkzaamheden: string | null;
  offerte_titel: string | null;
  samenvatting: string | null;
}

async function extraheerAanvraagVeldenMetAi(
  emailTekst: string,
  onderwerp: string | null,
  afzender: string | null,
): Promise<AiAanvraagExtractie> {
  if (!heeftOpenAi()) {
    return {
      opdrachtgever: afzender ?? null,
      contactpersoon: null,
      contactpersoon_email: afzender ?? null,
      contactpersoon_telefoon: null,
      gebouw_naam: null,
      adres: null,
      stad: null,
      postcode: null,
      beschrijving_werkzaamheden: emailTekst.slice(0, 400),
      offerte_titel: onderwerp ?? "Offerte-aanvraag",
      samenvatting: emailTekst.slice(0, 200),
    };
  }

  const client = maakOpenAiClient();
  const prompt = `Je bent een assistent voor een brandpreventie-bedrijf. Extraheer de volgende gegevens uit de offerte-aanvraag e-mail en geef ze terug als JSON. Gebruik null als een veld niet gevonden kan worden.

E-mail onderwerp: ${onderwerp ?? "(geen)"}
Afzender: ${afzender ?? "(onbekend)"}
Inhoud:
${emailTekst.slice(0, 3000)}

Geef JSON terug met exact deze velden:
{
  "opdrachtgever": "naam van de organisatie/opdrachtgever",
  "contactpersoon": "naam van de contactpersoon",
  "contactpersoon_email": "e-mailadres contactpersoon",
  "contactpersoon_telefoon": "telefoonnummer",
  "gebouw_naam": "naam van het gebouw of project",
  "adres": "straat + huisnummer",
  "stad": "stad/gemeente",
  "postcode": "postcode",
  "beschrijving_werkzaamheden": "samenvatting van gevraagde werkzaamheden (max 300 tekens)",
  "offerte_titel": "korte duidelijke titel voor de offerte (max 80 tekens)",
  "samenvatting": "beknopte samenvatting van de aanvraag (max 200 tekens)"
}`;

  try {
    const resp = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 800,
    });
    const tekst = resp.choices[0]?.message?.content ?? "{}";
    return JSON.parse(tekst) as AiAanvraagExtractie;
  } catch {
    return {
      opdrachtgever: afzender ?? null,
      contactpersoon: null,
      contactpersoon_email: afzender ?? null,
      contactpersoon_telefoon: null,
      gebouw_naam: null,
      adres: null,
      stad: null,
      postcode: null,
      beschrijving_werkzaamheden: emailTekst.slice(0, 400),
      offerte_titel: onderwerp ?? "Offerte-aanvraag",
      samenvatting: emailTekst.slice(0, 200),
    };
  }
}

router.post(
  "/inbox/offerte-aanvraag",
  schrijven,
  upload.fields([
    { name: "email", maxCount: 1 },
    { name: "bijlagen", maxCount: 10 },
  ]),
  async (req, res) => {
    try {
      const werkmaatschappijId = req.body?.werkmaatschappij_id
        ? parseInt(String(req.body.werkmaatschappij_id), 10)
        : null;

      if (!werkmaatschappijId || isNaN(werkmaatschappijId)) {
        return res.status(400).json({ error: "werkmaatschappij_id is verplicht" });
      }

      const files = req.files as Record<string, Express.Multer.File[]> | undefined;
      const emailBestand = files?.["email"]?.[0] ?? null;

      const gebruikerId = req.session.userId ?? null;

      const [werkgever] = await db
        .select({ id: werkgeversTable.id, naam: werkgeversTable.naam })
        .from(werkgeversTable)
        .where(eq(werkgeversTable.id, werkmaatschappijId));

      if (!werkgever) {
        return res.status(400).json({ error: "Werkmaatschappij niet gevonden" });
      }

      let ai: AiAanvraagExtractie = {
        opdrachtgever: null,
        contactpersoon: null,
        contactpersoon_email: null,
        contactpersoon_telefoon: null,
        gebouw_naam: null,
        adres: null,
        stad: null,
        postcode: null,
        beschrijving_werkzaamheden: null,
        offerte_titel: "Offerte-aanvraag",
        samenvatting: null,
      };

      let emailBestandsnaam = "(geen e-mail)";

      if (emailBestand) {
        emailBestandsnaam = emailBestand.originalname;
        try {
          const geparseerd = await parseEmailBestand(
            emailBestand.originalname,
            emailBestand.buffer,
          );
          ai = await extraheerAanvraagVeldenMetAi(
            geparseerd.inhoudTekst ?? "",
            geparseerd.onderwerp,
            geparseerd.afzender,
          );
        } catch (parseErr) {
          req.log.warn({ parseErr }, "E-mail parsen mislukt — velden leeg");
        }
      }

      const vandaag = new Date().toISOString().slice(0, 10);
      const offerteNummer = `AO-${Date.now()}`;

      let aangemaaktGebouwId: number | null = null;
      let aangemaaktGebouwNaam: string | null = null;
      let aangemaaktOpnameId: number | null = null;

      if (ai.adres) {
        const gebouwNaam =
          ai.gebouw_naam ??
          ([ai.opdrachtgever, ai.adres].filter(Boolean).join(" — ") ||
            "Nieuw gebouw");

        const [gebouw] = await db
          .insert(gebouwenTable)
          .values({
            naam: gebouwNaam,
            adres: ai.adres,
            stad: ai.stad ?? undefined,
            postcode: ai.postcode ?? undefined,
            werkgeverId: werkmaatschappijId,
          })
          .returning();

        aangemaaktGebouwId = gebouw.id;
        aangemaaktGebouwNaam = gebouw.naam;
      }

      const offerteTitel = ai.offerte_titel ?? onderwerp(emailBestandsnaam);

      const [offerte] = await db
        .insert(offertesTable)
        .values({
          offertenummer: offerteNummer,
          titel: offerteTitel,
          opdrachtgever: ai.opdrachtgever ?? undefined,
          gebouwId: aangemaaktGebouwId ?? undefined,
          onsKenmerk: werkgever.naam,
          status: "concept",
          portaalStatus: "concept",
          aangemaaktDoorId: gebruikerId ?? undefined,
        })
        .returning();

      if (aangemaaktGebouwId) {
        const [opname] = await db
          .insert(opnamesTable)
          .values({
            naam: `Opname — ${ai.opdrachtgever ?? offerteTitel}`,
            datum: vandaag,
            gebouwId: aangemaaktGebouwId,
            notities: ai.beschrijving_werkzaamheden ?? undefined,
            aangemaaktDoorId: gebruikerId ?? undefined,
          })
          .returning();
        aangemaaktOpnameId = opname.id;
      }

      const [inboxItem] = await db
        .insert(inboxItemsTable)
        .values({
          bestandsnaam: emailBestandsnaam,
          bestandspad: await (async () => {
            if (emailBestand?.buffer) {
              const subPath = opslagSubPath("email", emailBestandsnaam);
              try { return await objectStorage.uploadBestand(subPath, emailBestand.buffer, emailBestand.mimetype ?? "application/octet-stream"); }
              catch { return `/objects/${subPath}`; }
            }
            return `inbox/offerte-aanvraag/${Date.now()}_${emailBestandsnaam}`;
          })(),
          bestandsgrootte: emailBestand?.size ?? null,
          mimetype: emailBestand?.mimetype ?? null,
          geuploadDoor: gebruikerId,
          status: "geanalyseerd",
          documentCategorie: "offerte_aanvraag",
          bestemming: "Offertes",
          aiBetrouwbaarheid: heeftOpenAi() ? "hoog" : "midden",
          aiSamenvatting: ai.samenvatting ?? `Offerte-aanvraag van ${ai.opdrachtgever ?? "onbekend"}`,
          aiRedenering: `Werkmaatschappij: ${werkgever.naam}. Offerte ${offerteNummer} aangemaakt.`,
          aiVolgendeActie: "Offerte bekijken en uitwerken",
          gekoppeldeEntiteitType: "offerte",
          gekoppeldeEntiteitId: offerte.id,
          gekoppeldeEntiteitNaam: offerteTitel,
          opmerkingen: ai.beschrijving_werkzaamheden ?? null,
        })
        .returning();

      await db.insert(inboxAuditLogTable).values({
        inboxItemId: inboxItem.id,
        actie: "geregistreerd",
        gebruikerId,
        details: `Offerte-aanvraag verwerkt. Offerte ${offerteNummer} aangemaakt${aangemaaktGebouwId ? `, gebouw #${aangemaaktGebouwId}` : ""}${aangemaaktOpnameId ? `, opname #${aangemaaktOpnameId}` : ""}.`,
      });

      res.status(201).json({
        inbox_item: mapItem(inboxItem),
        offerte_id: offerte.id,
        offerte_titel: offerteTitel,
        gebouw_id: aangemaaktGebouwId,
        gebouw_naam: aangemaaktGebouwNaam,
        opname_id: aangemaaktOpnameId,
        ai_samenvatting: ai.samenvatting,
        aangemaakt: {
          offerte: true,
          gebouw: aangemaaktGebouwId !== null,
          opname: aangemaaktOpnameId !== null,
        },
      });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Interne serverfout" });
    }
  },
);

function onderwerp(bestandsnaam: string): string {
  return bestandsnaam.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Offerte-aanvraag";
}

// ── VERWIJDEREN ───────────────────────────────────────────────────────────────
router.delete("/inbox/items/:id", schrijven, async (req, res) => {
  try {
    await db.delete(inboxItemsTable).where(eq(inboxItemsTable.id, parseId(req.params.id)));
    res.status(204).end();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
