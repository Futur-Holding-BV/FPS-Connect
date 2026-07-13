// Financiele contracten & polissen — routes (Task #524).
//
// CRUD voor zakelijke contracten (verzekering/lease/onderhoud/software/telecom/
// abonnement), jaarlijkse kostensnapshots, AI-polisanalyse, AI-contractcoach,
// deterministische besparingskansen en automatische bewaking/signaleringen.
//
// De AI-laag hergebruikt de bestaande pijplijn (aiGateway + pdfTekst) via
// contractIntelligence.ts. AI adviseert en signaleert; een mens beslist altijd.
// Geen enkele route zegt zelf een contract op of wijzigt het namens de gebruiker.
import { Router } from "express";
import {
  db,
  financieleContractenTable,
  financieleContractKostenTable,
  financieleContractSignaleringenTable,
  documentenTable,
  werkgeversTable,
  gebruikersTable,
} from "@workspace/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { logActiviteit } from "../lib/activiteit";
import { ObjectStorageService } from "../lib/objectStorage";
import { extraheerPdfTekst } from "../lib/pdfTekst";
import {
  analyseerPolisDocument,
  contractCoach,
  berekenBesparingskansen,
  bewaakContracten,
  type ContractInvoer,
  type KostenSnapshot,
  type PolisAnalyse,
} from "../lib/contractIntelligence";

const router = Router();
const objectStorage = new ObjectStorageService();

const lezen = requireBevoegdheid("financieel", 1);
const schrijven = requireBevoegdheid("financieel", 2);

const iso = (d: Date) => d.toISOString();
const isoOf = (d: Date | null) => (d ? d.toISOString() : null);

function parseId(v: unknown): number {
  return parseInt(String(v), 10);
}

function numOfNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

type ContractRow = typeof financieleContractenTable.$inferSelect;

function contractNaarJson(
  c: ContractRow,
  extra: { leverancierWerkgever?: string | null; documentNaam?: string | null; aangemaaktDoorNaam?: string | null } = {},
) {
  return {
    id: c.id,
    categorie: c.categorie,
    naam: c.naam,
    leverancier: c.leverancier,
    werkgever_id: c.werkgeverId,
    werkgever_naam: extra.leverancierWerkgever ?? null,
    contractnummer: c.contractnummer,
    ingangsdatum: c.ingangsdatum,
    einddatum: c.einddatum,
    opzegtermijn_maanden: c.opzegtermijnMaanden,
    kosten_bedrag: c.kostenBedrag,
    kosten_periode: c.kostenPeriode,
    indexering_percentage: c.indexeringPercentage,
    indexering_maand: c.indexeringMaand,
    contractwaarde: c.contractwaarde,
    automatische_verlenging: c.automatischeVerlenging,
    verlengingsduur_maanden: c.verlengingsduurMaanden,
    aantal_licenties: c.aantalLicenties,
    aantal_in_gebruik: c.aantalInGebruik,
    laatst_gebruikt_op: c.laatstGebruiktOp,
    status: c.status,
    document_id: c.documentId,
    document_naam: extra.documentNaam ?? null,
    notities: c.notities,
    ai_samenvatting: c.aiSamenvatting,
    ai_analyse: c.aiAnalyse ?? null,
    ai_geanalyseerd_op: isoOf(c.aiGeanalyseerdOp),
    aangemaakt_door_id: c.aangemaaktDoorId,
    aangemaakt_door_naam: extra.aangemaaktDoorNaam ?? null,
    aangemaakt_op: iso(c.aangemaaktOp),
    bijgewerkt_op: iso(c.bijgewerktOp),
  };
}

// Map een contractrij naar de smalle vorm die de intelligentie-lib gebruikt.
function naarInvoer(c: ContractRow): ContractInvoer & { opzegtermijnMaanden: number | null; automatischeVerlenging: boolean; indexeringMaand: number | null } {
  return {
    id: c.id,
    naam: c.naam,
    categorie: c.categorie,
    leverancier: c.leverancier,
    status: c.status,
    kostenBedrag: c.kostenBedrag,
    kostenPeriode: c.kostenPeriode,
    indexeringPercentage: c.indexeringPercentage,
    aantalLicenties: c.aantalLicenties,
    aantalInGebruik: c.aantalInGebruik,
    laatstGebruiktOp: c.laatstGebruiktOp,
    einddatum: c.einddatum,
    documentId: c.documentId,
    opzegtermijnMaanden: c.opzegtermijnMaanden,
    automatischeVerlenging: c.automatischeVerlenging,
    indexeringMaand: c.indexeringMaand,
  };
}

async function haalKostenHistorie(contractIds: number[]): Promise<KostenSnapshot[]> {
  if (contractIds.length === 0) return [];
  const rijen = await db
    .select({ contractId: financieleContractKostenTable.contractId, jaar: financieleContractKostenTable.jaar, bedrag: financieleContractKostenTable.bedrag })
    .from(financieleContractKostenTable)
    .where(inArray(financieleContractKostenTable.contractId, contractIds));
  return rijen.map((r) => ({ contractId: r.contractId, jaar: r.jaar, bedrag: r.bedrag }));
}

// ── Contracten CRUD ───────────────────────────────────────────────────────────

router.get("/financiele-contracten", lezen, async (req, res): Promise<void> => {
  try {
    const rijen = await db
      .select({ c: financieleContractenTable, werkgeverNaam: werkgeversTable.naam, documentNaam: documentenTable.naam, aangemaaktDoorNaam: gebruikersTable.naam })
      .from(financieleContractenTable)
      .leftJoin(werkgeversTable, eq(financieleContractenTable.werkgeverId, werkgeversTable.id))
      .leftJoin(documentenTable, eq(financieleContractenTable.documentId, documentenTable.id))
      .leftJoin(gebruikersTable, eq(financieleContractenTable.aangemaaktDoorId, gebruikersTable.id))
      .orderBy(desc(financieleContractenTable.aangemaaktOp));
    res.json(
      rijen.map((r) =>
        contractNaarJson(r.c, { leverancierWerkgever: r.werkgeverNaam, documentNaam: r.documentNaam, aangemaaktDoorNaam: r.aangemaaktDoorNaam }),
      ),
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

async function verrijkContract(c: ContractRow) {
  let werkgeverNaam: string | null = null;
  if (c.werkgeverId != null) {
    const [w] = await db.select({ naam: werkgeversTable.naam }).from(werkgeversTable).where(eq(werkgeversTable.id, c.werkgeverId));
    werkgeverNaam = w?.naam ?? null;
  }
  let documentNaam: string | null = null;
  if (c.documentId != null) {
    const [d] = await db.select({ naam: documentenTable.naam }).from(documentenTable).where(eq(documentenTable.id, c.documentId));
    documentNaam = d?.naam ?? null;
  }
  let aangemaaktDoorNaam: string | null = null;
  if (c.aangemaaktDoorId != null) {
    const [u] = await db.select({ naam: gebruikersTable.naam }).from(gebruikersTable).where(eq(gebruikersTable.id, c.aangemaaktDoorId));
    aangemaaktDoorNaam = u?.naam ?? null;
  }
  return contractNaarJson(c, { leverancierWerkgever: werkgeverNaam, documentNaam, aangemaaktDoorNaam });
}

function leesContractVelden(body: Record<string, unknown>) {
  return {
    categorie: typeof body.categorie === "string" ? body.categorie : undefined,
    naam: typeof body.naam === "string" ? body.naam : undefined,
    leverancier: body.leverancier === undefined ? undefined : (body.leverancier as string | null),
    werkgeverId: body.werkgever_id === undefined ? undefined : numOfNull(body.werkgever_id),
    contractnummer: body.contractnummer === undefined ? undefined : (body.contractnummer as string | null),
    ingangsdatum: body.ingangsdatum === undefined ? undefined : ((body.ingangsdatum as string | null) || null),
    einddatum: body.einddatum === undefined ? undefined : ((body.einddatum as string | null) || null),
    opzegtermijnMaanden: body.opzegtermijn_maanden === undefined ? undefined : numOfNull(body.opzegtermijn_maanden),
    kostenBedrag: body.kosten_bedrag === undefined ? undefined : numOfNull(body.kosten_bedrag),
    kostenPeriode: typeof body.kosten_periode === "string" ? body.kosten_periode : undefined,
    indexeringPercentage: body.indexering_percentage === undefined ? undefined : numOfNull(body.indexering_percentage),
    indexeringMaand: body.indexering_maand === undefined ? undefined : numOfNull(body.indexering_maand),
    contractwaarde: body.contractwaarde === undefined ? undefined : numOfNull(body.contractwaarde),
    automatischeVerlenging: typeof body.automatische_verlenging === "boolean" ? body.automatische_verlenging : undefined,
    verlengingsduurMaanden: body.verlengingsduur_maanden === undefined ? undefined : numOfNull(body.verlengingsduur_maanden),
    aantalLicenties: body.aantal_licenties === undefined ? undefined : numOfNull(body.aantal_licenties),
    aantalInGebruik: body.aantal_in_gebruik === undefined ? undefined : numOfNull(body.aantal_in_gebruik),
    laatstGebruiktOp: body.laatst_gebruikt_op === undefined ? undefined : ((body.laatst_gebruikt_op as string | null) || null),
    status: typeof body.status === "string" ? body.status : undefined,
    documentId: body.document_id === undefined ? undefined : numOfNull(body.document_id),
    notities: body.notities === undefined ? undefined : (body.notities as string | null),
  };
}

router.post("/financiele-contracten", schrijven, async (req, res): Promise<void> => {
  try {
    const v = leesContractVelden(req.body ?? {});
    if (!v.naam) return void res.status(400).json({ error: "naam is verplicht" });
    const [c] = await db
      .insert(financieleContractenTable)
      .values({
        categorie: v.categorie ?? "overig",
        naam: v.naam,
        leverancier: v.leverancier ?? null,
        werkgeverId: v.werkgeverId ?? null,
        contractnummer: v.contractnummer ?? null,
        ingangsdatum: v.ingangsdatum ?? null,
        einddatum: v.einddatum ?? null,
        opzegtermijnMaanden: v.opzegtermijnMaanden ?? null,
        kostenBedrag: v.kostenBedrag ?? null,
        kostenPeriode: v.kostenPeriode ?? "jaar",
        indexeringPercentage: v.indexeringPercentage ?? null,
        indexeringMaand: v.indexeringMaand ?? null,
        contractwaarde: v.contractwaarde ?? null,
        automatischeVerlenging: v.automatischeVerlenging ?? true,
        verlengingsduurMaanden: v.verlengingsduurMaanden ?? null,
        aantalLicenties: v.aantalLicenties ?? null,
        aantalInGebruik: v.aantalInGebruik ?? null,
        laatstGebruiktOp: v.laatstGebruiktOp ?? null,
        status: v.status ?? "actief",
        documentId: v.documentId ?? null,
        notities: v.notities ?? null,
        aangemaaktDoorId: req.session.userId ?? null,
      })
      .returning();
    await logActiviteit({
      type: "financieel_contract_aangemaakt",
      omschrijving: `Contract "${c.naam}" (${c.categorie}) aangemaakt`,
      gebruikerId: req.session.userId ?? null,
    });
    res.status(201).json(await verrijkContract(c));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.get("/financiele-contracten/:id", lezen, async (req, res): Promise<void> => {
  try {
    const [c] = await db.select().from(financieleContractenTable).where(eq(financieleContractenTable.id, parseId(req.params.id)));
    if (!c) return void res.status(404).json({ error: "Contract niet gevonden" });
    res.json(await verrijkContract(c));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.patch("/financiele-contracten/:id", schrijven, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params.id);
    const [bestaand] = await db.select().from(financieleContractenTable).where(eq(financieleContractenTable.id, id));
    if (!bestaand) return void res.status(404).json({ error: "Contract niet gevonden" });
    const v = leesContractVelden(req.body ?? {});
    const set: Partial<typeof financieleContractenTable.$inferInsert> = { bijgewerktOp: new Date() };
    if (v.categorie !== undefined) set.categorie = v.categorie;
    if (v.naam !== undefined) set.naam = v.naam;
    if (v.leverancier !== undefined) set.leverancier = v.leverancier;
    if (v.werkgeverId !== undefined) set.werkgeverId = v.werkgeverId;
    if (v.contractnummer !== undefined) set.contractnummer = v.contractnummer;
    if (v.ingangsdatum !== undefined) set.ingangsdatum = v.ingangsdatum;
    if (v.einddatum !== undefined) set.einddatum = v.einddatum;
    if (v.opzegtermijnMaanden !== undefined) set.opzegtermijnMaanden = v.opzegtermijnMaanden;
    if (v.kostenBedrag !== undefined) set.kostenBedrag = v.kostenBedrag;
    if (v.kostenPeriode !== undefined) set.kostenPeriode = v.kostenPeriode;
    if (v.indexeringPercentage !== undefined) set.indexeringPercentage = v.indexeringPercentage;
    if (v.indexeringMaand !== undefined) set.indexeringMaand = v.indexeringMaand;
    if (v.contractwaarde !== undefined) set.contractwaarde = v.contractwaarde;
    if (v.automatischeVerlenging !== undefined) set.automatischeVerlenging = v.automatischeVerlenging;
    if (v.verlengingsduurMaanden !== undefined) set.verlengingsduurMaanden = v.verlengingsduurMaanden;
    if (v.aantalLicenties !== undefined) set.aantalLicenties = v.aantalLicenties;
    if (v.aantalInGebruik !== undefined) set.aantalInGebruik = v.aantalInGebruik;
    if (v.laatstGebruiktOp !== undefined) set.laatstGebruiktOp = v.laatstGebruiktOp;
    if (v.status !== undefined) set.status = v.status;
    if (v.documentId !== undefined) set.documentId = v.documentId;
    if (v.notities !== undefined) set.notities = v.notities;
    const [c] = await db.update(financieleContractenTable).set(set).where(eq(financieleContractenTable.id, id)).returning();
    res.json(await verrijkContract(c));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.delete("/financiele-contracten/:id", schrijven, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params.id);
    const [bestaand] = await db.select().from(financieleContractenTable).where(eq(financieleContractenTable.id, id));
    if (!bestaand) return void res.status(404).json({ error: "Contract niet gevonden" });
    await db.delete(financieleContractenTable).where(eq(financieleContractenTable.id, id));
    await logActiviteit({
      type: "financieel_contract_verwijderd",
      omschrijving: `Contract "${bestaand.naam}" verwijderd`,
      gebruikerId: req.session.userId ?? null,
    });
    res.status(204).end();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Kostensnapshots (sub-resource) ────────────────────────────────────────────

router.get("/financiele-contracten/:id/kosten", lezen, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params.id);
    const rijen = await db
      .select()
      .from(financieleContractKostenTable)
      .where(eq(financieleContractKostenTable.contractId, id))
      .orderBy(desc(financieleContractKostenTable.jaar));
    res.json(
      rijen.map((k) => ({
        id: k.id,
        contract_id: k.contractId,
        jaar: k.jaar,
        bedrag: k.bedrag,
        bron: k.bron,
        document_id: k.documentId,
        notitie: k.notitie,
        aangemaakt_op: iso(k.aangemaaktOp),
      })),
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/financiele-contracten/:id/kosten", schrijven, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params.id);
    const [c] = await db.select().from(financieleContractenTable).where(eq(financieleContractenTable.id, id));
    if (!c) return void res.status(404).json({ error: "Contract niet gevonden" });
    const jaar = numOfNull(req.body?.jaar);
    const bedrag = numOfNull(req.body?.bedrag);
    if (jaar === null || bedrag === null) return void res.status(400).json({ error: "jaar en bedrag zijn verplicht" });
    // Upsert op (contractId, jaar).
    const [bestaand] = await db
      .select()
      .from(financieleContractKostenTable)
      .where(and(eq(financieleContractKostenTable.contractId, id), eq(financieleContractKostenTable.jaar, jaar)));
    let rij;
    if (bestaand) {
      [rij] = await db
        .update(financieleContractKostenTable)
        .set({ bedrag, bron: typeof req.body?.bron === "string" ? req.body.bron : "handmatig", notitie: req.body?.notitie ?? null })
        .where(eq(financieleContractKostenTable.id, bestaand.id))
        .returning();
    } else {
      [rij] = await db
        .insert(financieleContractKostenTable)
        .values({
          contractId: id,
          jaar,
          bedrag,
          bron: typeof req.body?.bron === "string" ? req.body.bron : "handmatig",
          documentId: numOfNull(req.body?.document_id),
          notitie: req.body?.notitie ?? null,
          aangemaaktDoorId: req.session.userId ?? null,
        })
        .returning();
    }
    res.status(201).json({
      id: rij.id,
      contract_id: rij.contractId,
      jaar: rij.jaar,
      bedrag: rij.bedrag,
      bron: rij.bron,
      document_id: rij.documentId,
      notitie: rij.notitie,
      aangemaakt_op: iso(rij.aangemaaktOp),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── AI-polisanalyse ───────────────────────────────────────────────────────────
// Analyseert het gekoppelde brondocument (of aangeleverde tekst) en slaat de
// gestructureerde polisanalyse op het contract op. De mens beslist over gebruik.

async function haalDocumentTekst(documentId: number): Promise<string | null> {
  const [doc] = await db.select().from(documentenTable).where(eq(documentenTable.id, documentId));
  if (!doc || !doc.pdfUrl) return null;
  try {
    const file = await objectStorage.getObjectEntityFile(doc.pdfUrl);
    const respons = await objectStorage.downloadObject(file);
    const buffer = Buffer.from(await respons.arrayBuffer());
    const { tekst } = await extraheerPdfTekst(buffer);
    return tekst;
  } catch {
    return null;
  }
}

router.post("/financiele-contracten/:id/ai-analyse", schrijven, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params.id);
    const [c] = await db.select().from(financieleContractenTable).where(eq(financieleContractenTable.id, id));
    if (!c) return void res.status(404).json({ error: "Contract niet gevonden" });

    let tekst = typeof req.body?.tekst === "string" ? req.body.tekst : "";
    if (!tekst && c.documentId != null) {
      tekst = (await haalDocumentTekst(c.documentId)) ?? "";
    }
    if (!tekst) {
      return void res.status(422).json({ error: "Geen brondocument-tekst beschikbaar. Koppel een document of lever tekst aan." });
    }

    const analyse = await analyseerPolisDocument(tekst, { categorie: c.categorie, gebruikerId: req.session.userId ?? null, contractId: c.id });

    if (analyse.methode === "ai") {
      await db
        .update(financieleContractenTable)
        .set({ aiSamenvatting: analyse.samenvatting, aiAnalyse: analyse as unknown as object, aiGeanalyseerdOp: new Date(), bijgewerktOp: new Date() })
        .where(eq(financieleContractenTable.id, id));
      await logActiviteit({
        type: "financieel_contract_ai_analyse",
        omschrijving: `AI-polisanalyse uitgevoerd voor "${c.naam}"`,
        gebruikerId: req.session.userId ?? null,
      });
    }
    res.json(analyse);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── AI-contractcoach ──────────────────────────────────────────────────────────
router.get("/financiele-contracten/:id/coach", lezen, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params.id);
    const [c] = await db.select().from(financieleContractenTable).where(eq(financieleContractenTable.id, id));
    if (!c) return void res.status(404).json({ error: "Contract niet gevonden" });
    const historie = await haalKostenHistorie([id]);
    const polisAnalyse = (c.aiAnalyse as PolisAnalyse | null) ?? null;
    const advies = await contractCoach({ ...naarInvoer(c), polisAnalyse }, historie, { gebruikerId: req.session.userId ?? null });
    res.json(advies);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Besparingskansen (deterministisch, voor overzicht + dashboard) ─────────────
router.get("/financiele-contracten-besparingskansen", lezen, async (_req, res): Promise<void> => {
  try {
    const contracten = await db.select().from(financieleContractenTable);
    const invoer = contracten.map(naarInvoer);
    const historie = await haalKostenHistorie(contracten.map((c) => c.id));
    const kansen = berekenBesparingskansen(invoer, historie);
    const totaal = kansen.reduce((s, k) => s + (k.bedrag ?? 0), 0);
    res.json({ totaal_geschatte_besparing: Math.round(totaal), aantal: kansen.length, kansen });
  } catch (err) {
    _req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Signaleringen + bewaking ──────────────────────────────────────────────────

router.get("/financiele-contract-signaleringen", lezen, async (req, res): Promise<void> => {
  try {
    const rijen = await db
      .select({ s: financieleContractSignaleringenTable, contractNaam: financieleContractenTable.naam })
      .from(financieleContractSignaleringenTable)
      .leftJoin(financieleContractenTable, eq(financieleContractSignaleringenTable.contractId, financieleContractenTable.id))
      .orderBy(desc(financieleContractSignaleringenTable.aangemaaktOp));
    res.json(
      rijen.map((r) => ({
        id: r.s.id,
        contract_id: r.s.contractId,
        contract_naam: r.contractNaam ?? null,
        type: r.s.type,
        ernst: r.s.ernst,
        boodschap: r.s.boodschap,
        ai_advies: r.s.aiAdvies,
        bedrag: r.s.bedrag,
        zekerheid: r.s.zekerheid,
        status: r.s.status,
        gezien_op: isoOf(r.s.gezienOp),
        aangemaakt_op: iso(r.s.aangemaaktOp),
      })),
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// Voer de deterministische bewaking uit en persisteer nieuwe signaleringen
// (ontdubbeld via dedupeSleutel). Idempotent: reeds bestaande signalen blijven.
router.post("/financiele-contract-signaleringen/bewaak", schrijven, async (req, res): Promise<void> => {
  try {
    const contracten = await db.select().from(financieleContractenTable);
    const signalen = bewaakContracten(contracten.map(naarInvoer));
    let nieuw = 0;
    for (const s of signalen) {
      const ingevoegd = await db
        .insert(financieleContractSignaleringenTable)
        .values({
          contractId: s.contractId,
          type: s.type,
          ernst: s.ernst,
          boodschap: s.boodschap,
          bedrag: s.bedrag,
          zekerheid: s.zekerheid,
          dedupeSleutel: s.dedupeSleutel,
        })
        .onConflictDoNothing({ target: financieleContractSignaleringenTable.dedupeSleutel })
        .returning();
      if (ingevoegd.length > 0) nieuw += 1;
    }
    res.json({ gecontroleerd: contracten.length, nieuwe_signaleringen: nieuw });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.patch("/financiele-contract-signaleringen/:id", schrijven, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params.id);
    const status = typeof req.body?.status === "string" ? req.body.status : null;
    if (!status) return void res.status(400).json({ error: "status is verplicht" });
    const [s] = await db
      .update(financieleContractSignaleringenTable)
      .set({ status, gezienDoorId: req.session.userId ?? null, gezienOp: new Date() })
      .where(eq(financieleContractSignaleringenTable.id, id))
      .returning();
    if (!s) return void res.status(404).json({ error: "Signalering niet gevonden" });
    res.json({ id: s.id, status: s.status });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
