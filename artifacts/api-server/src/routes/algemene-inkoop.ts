// NP_INKOOP_01 — Algemene inkoop (niet-projectgebonden).
// Eigen register met A-nummerreeks; bewust GEEN bestelstroom en GEEN koppeling
// aan opdrachten. Boven de goedkeuringsgrens loopt de regel via de generieke
// goedkeuringsmotor (documenttype "algemene_inkoop").
// Toegang: financieel niveau 2 óf offertes niveau 1 (inkooprol).

import { Router } from "express";
import { db } from "@workspace/db";
import {
  algemeneInkopenTable,
  ALGEMENE_INKOOP_SOORTEN,
  ALGEMENE_INKOOP_KOSTENSOORTEN,
  ALGEMENE_INKOOP_BETAALWIJZEN,
  leveranciersTable,
  gebruikersTable,
  facturenTable,
} from "@workspace/db/schema";
import { eq, desc, and, isNull, inArray } from "drizzle-orm";
import multer from "multer";
import { Readable } from "node:stream";
import { requireEnigeBevoegdheid } from "../middlewares/auth.js";
import { veiligeFoutmelding } from "../middlewares/foutafhandelaar";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { scanBestandBytes, haalScanStatusOpVoorPad } from "../services/security-intake-engine";
import { checkVereistGoedkeuring, haalOpenAanvraag } from "../services/goedkeuring-engine";
import { verwerkDirectBetaaldeBonFactuur } from "../services/factuurstroomService";
import { formatNummer } from "../lib/kenmerk";

const router = Router();
const storage = new ObjectStorageService();
const uploadBon = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// Jacqueline-scenario: financieel niveau 2 (administratie) OF offertes (inkooprol),
// zonder dat daar werkvoorbereidingsrechten voor nodig zijn.
const toegang = requireEnigeBevoegdheid([["financieel", 2], ["offertes", 1]]);

function nummerWeergave(nummer: number): string {
  return formatNummer("A", nummer);
}

function beginStatus(soort: string): string {
  return soort === "op_rekening" ? "besteld" : "open";
}

async function metWeergave(rij: typeof algemeneInkopenTable.$inferSelect) {
  return { ...rij, nummer_weergave: nummerWeergave(rij.nummer) };
}

// ── Lijst ─────────────────────────────────────────────────────────────────────
router.get("/algemene-inkoop", toegang, async (req, res): Promise<void> => {
  try {
    const status = typeof req.query["status"] === "string" ? req.query["status"] : null;
    const rijen = await db.select().from(algemeneInkopenTable)
      .where(status ? eq(algemeneInkopenTable.status, status) : undefined)
      .orderBy(desc(algemeneInkopenTable.id));
    const besteldDoorIds = [...new Set(rijen.map((r) => r.besteldDoorId))];
    const namen = besteldDoorIds.length
      ? await db.select({ id: gebruikersTable.id, naam: gebruikersTable.naam })
          .from(gebruikersTable).where(inArray(gebruikersTable.id, besteldDoorIds))
      : [];
    const naamVan = new Map(namen.map((n) => [n.id, n.naam]));
    const facturen = rijen.filter((r) => r.factuurId != null).map((r) => r.factuurId!) as number[];
    const factuurInfo = facturen.length
      ? await db.select({ id: facturenTable.id, factuurnummer: facturenTable.factuurnummer, bedragInclBtw: facturenTable.bedragInclBtw })
          .from(facturenTable).where(inArray(facturenTable.id, facturen))
      : [];
    const factuurVan = new Map(factuurInfo.map((f) => [f.id, f]));
    res.json(rijen.map((r) => ({
      ...r,
      nummer_weergave: nummerWeergave(r.nummer),
      besteld_door_naam: naamVan.get(r.besteldDoorId) ?? null,
      factuur_nummer: r.factuurId ? factuurVan.get(r.factuurId)?.factuurnummer ?? null : null,
      factuur_bedrag: r.factuurId ? factuurVan.get(r.factuurId)?.bedragInclBtw ?? null : null,
    })));
  } catch (err) {
    req.log.error({ err }, "algemene inkoop: lijst mislukt");
    res.status(500).json({ error: veiligeFoutmelding(err) });
  }
});

// ── Aanmaken ──────────────────────────────────────────────────────────────────
router.post("/algemene-inkoop", toegang, async (req, res): Promise<void> => {
  try {
    const b = req.body ?? {};
    const soort = String(b.soort ?? "");
    if (!ALGEMENE_INKOOP_SOORTEN.includes(soort as never)) {
      return void res.status(400).json({ error: "soort moet op_rekening of direct_betaald zijn" });
    }
    const omschrijving = String(b.omschrijving ?? "").trim();
    if (!omschrijving) return void res.status(400).json({ error: "omschrijving is verplicht" });
    const kostensoort = String(b.kostensoort ?? "");
    if (!ALGEMENE_INKOOP_KOSTENSOORTEN.includes(kostensoort as never)) {
      return void res.status(400).json({ error: "kostensoort is verplicht (geen inkoop zonder kostensoort)" });
    }
    let leverancierId: number | null = null;
    let leverancierNaam = String(b.leverancier_naam ?? "").trim();
    if (b.leverancier_id != null) {
      const [lev] = await db.select({ id: leveranciersTable.id, naam: leveranciersTable.naam })
        .from(leveranciersTable).where(eq(leveranciersTable.id, Number(b.leverancier_id)));
      if (!lev) return void res.status(400).json({ error: "Onbekende leverancier" });
      leverancierId = lev.id;
      leverancierNaam = lev.naam;
    }
    if (!leverancierNaam) return void res.status(400).json({ error: "leverancier (of webshop) is verplicht" });

    const verwachtBedrag = b.verwacht_bedrag != null ? Number(b.verwacht_bedrag) : null;
    if (verwachtBedrag != null && (!isFinite(verwachtBedrag) || verwachtBedrag < 0)) {
      return void res.status(400).json({ error: "verwacht_bedrag is ongeldig" });
    }

    let betaalwijze: string | null = null;
    let betaaldOp: string | null = null;
    let bedrag: number | null = null;
    if (soort === "direct_betaald") {
      betaalwijze = String(b.betaalwijze ?? "");
      if (!ALGEMENE_INKOOP_BETAALWIJZEN.includes(betaalwijze as never)) {
        return void res.status(400).json({ error: "betaalwijze is verplicht bij direct betaalde inkoop" });
      }
      bedrag = b.bedrag != null ? Number(b.bedrag) : null;
      if (bedrag == null || !isFinite(bedrag) || bedrag <= 0) {
        return void res.status(400).json({ error: "bedrag is verplicht bij direct betaalde inkoop" });
      }
      betaaldOp = typeof b.betaald_op === "string" && b.betaald_op ? b.betaald_op.slice(0, 10) : new Date().toISOString().slice(0, 10);
    }

    // Goedkeuringsbeleid (bestaande motor, geen nieuw mechanisme): boven de
    // grens start de regel in ter_goedkeuring.
    const toetsBedrag = soort === "direct_betaald" ? bedrag : verwachtBedrag;
    const { vereist } = await checkVereistGoedkeuring(db, "algemene_inkoop", toetsBedrag, null);
    const status = vereist ? "ter_goedkeuring" : beginStatus(soort);

    const [rij] = await db.insert(algemeneInkopenTable).values({
      soort, status, leverancierId, leverancierNaam, omschrijving, kostensoort,
      verwachtBedrag, betaalwijze, betaaldOp, bedrag,
      opmerkingen: typeof b.opmerkingen === "string" ? b.opmerkingen : null,
      besteldDoorId: req.session.userId!,
    }).returning();
    res.status(201).json(await metWeergave(rij!));
  } catch (err) {
    req.log.error({ err }, "algemene inkoop: aanmaken mislukt");
    res.status(500).json({ error: veiligeFoutmelding(err) });
  }
});

// ── Detail ────────────────────────────────────────────────────────────────────
router.get("/algemene-inkoop/:id", toegang, async (req, res): Promise<void> => {
  const id = Number(req.params["id"]);
  if (isNaN(id)) return void res.status(400).json({ error: "Ongeldig ID" });
  const [rij] = await db.select().from(algemeneInkopenTable).where(eq(algemeneInkopenTable.id, id));
  if (!rij) return void res.status(404).json({ error: "Niet gevonden" });
  const open = rij.status === "ter_goedkeuring" ? await haalOpenAanvraag(db, "algemene_inkoop", rij.id) : null;
  res.json({ ...(await metWeergave(rij)), open_goedkeuringsaanvraag_id: open?.id ?? null });
});

// ── Bewerken (niet meer na afhandeling) ──────────────────────────────────────
router.patch("/algemene-inkoop/:id", toegang, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params["id"]);
    if (isNaN(id)) return void res.status(400).json({ error: "Ongeldig ID" });
    const [rij] = await db.select().from(algemeneInkopenTable).where(eq(algemeneInkopenTable.id, id));
    if (!rij) return void res.status(404).json({ error: "Niet gevonden" });
    if (rij.status === "afgehandeld") return void res.status(409).json({ error: "Een afgehandelde inkoop kan niet meer worden gewijzigd" });

    const b = req.body ?? {};
    const set: Record<string, unknown> = { bijgewerktOp: new Date() };
    if (typeof b.omschrijving === "string" && b.omschrijving.trim()) set["omschrijving"] = b.omschrijving.trim();
    if (b.kostensoort != null) {
      if (!ALGEMENE_INKOOP_KOSTENSOORTEN.includes(String(b.kostensoort) as never)) return void res.status(400).json({ error: "Ongeldige kostensoort" });
      set["kostensoort"] = String(b.kostensoort);
    }
    if (b.verwacht_bedrag !== undefined) {
      const n = b.verwacht_bedrag == null ? null : Number(b.verwacht_bedrag);
      if (n != null && (!isFinite(n) || n < 0)) return void res.status(400).json({ error: "verwacht_bedrag is ongeldig" });
      set["verwachtBedrag"] = n;
    }
    if (b.leverancier_id !== undefined) {
      if (b.leverancier_id == null) { set["leverancierId"] = null; }
      else {
        const [lev] = await db.select({ id: leveranciersTable.id, naam: leveranciersTable.naam })
          .from(leveranciersTable).where(eq(leveranciersTable.id, Number(b.leverancier_id)));
        if (!lev) return void res.status(400).json({ error: "Onbekende leverancier" });
        set["leverancierId"] = lev.id;
        set["leverancierNaam"] = lev.naam;
      }
    }
    if (typeof b.leverancier_naam === "string" && b.leverancier_naam.trim() && b.leverancier_id === undefined) {
      set["leverancierNaam"] = b.leverancier_naam.trim();
    }
    if (rij.soort === "direct_betaald") {
      if (b.betaalwijze != null) {
        if (!ALGEMENE_INKOOP_BETAALWIJZEN.includes(String(b.betaalwijze) as never)) return void res.status(400).json({ error: "Ongeldige betaalwijze" });
        set["betaalwijze"] = String(b.betaalwijze);
      }
      if (typeof b.betaald_op === "string" && b.betaald_op) set["betaaldOp"] = b.betaald_op.slice(0, 10);
      if (b.bedrag != null) {
        const n = Number(b.bedrag);
        if (!isFinite(n) || n <= 0) return void res.status(400).json({ error: "bedrag is ongeldig" });
        set["bedrag"] = n;
      }
    }
    if (b.opmerkingen !== undefined) set["opmerkingen"] = b.opmerkingen == null ? null : String(b.opmerkingen);

    const [nieuw] = await db.update(algemeneInkopenTable).set(set).where(eq(algemeneInkopenTable.id, id)).returning();
    res.json(await metWeergave(nieuw!));
  } catch (err) {
    req.log.error({ err }, "algemene inkoop: bijwerken mislukt");
    res.status(500).json({ error: veiligeFoutmelding(err) });
  }
});

// ── Bon uploaden (verplicht bewijsstuk bij direct betaald) ───────────────────
router.post("/algemene-inkoop/:id/bon", toegang, uploadBon.single("bestand"), async (req, res): Promise<void> => {
  try {
    const id = Number(req.params["id"]);
    if (isNaN(id)) return void res.status(400).json({ error: "Ongeldig ID" });
    const [rij] = await db.select().from(algemeneInkopenTable).where(eq(algemeneInkopenTable.id, id));
    if (!rij) return void res.status(404).json({ error: "Niet gevonden" });
    if (rij.status === "afgehandeld") return void res.status(409).json({ error: "Deze inkoop is al afgehandeld" });

    const bestand = req.file;
    if (!bestand || !bestand.buffer?.length) return void res.status(400).json({ error: "bestand is verplicht" });
    const toegestaneTypes = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];
    if (!toegestaneTypes.includes(bestand.mimetype)) {
      return void res.status(400).json({ error: "Alleen een foto (jpg/png/webp/heic) of pdf is toegestaan als bon" });
    }
    const veilig = (bestand.originalname || "bon").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
    const subPath = `algemene-inkoop/${id}/${Date.now()}_${veilig}`;
    const objectPad = `/objects/${subPath}`;

    // Scan-first: bytes scannen vóór opslag; geblokkeerd = niet opslaan.
    try {
      const scan = await scanBestandBytes({
        bytes: bestand.buffer,
        bestandsnaam: bestand.originalname || "bon",
        bestandsgrootte: bestand.buffer.length,
        mimeTypeClaim: bestand.mimetype || undefined,
        objectPad,
        gebruikerId: req.session.userId ?? null,
        gebruikerNaam: null,
        uploadBron: "document",
      });
      if (!scan.toegestaan) return void res.status(422).json({ error: "Dit bestand is geweigerd door de beveiligingsscan." });
    } catch (err) {
      req.log.error({ err }, "Beveiligingsscan mislukt — bon geweigerd (fail-closed)");
      return void res.status(503).json({ error: "De beveiligingsscan is momenteel niet beschikbaar. De bon is niet opgeslagen." });
    }

    let bonPad: string;
    try {
      bonPad = await storage.uploadBestand(subPath, bestand.buffer, bestand.mimetype || "application/octet-stream");
    } catch (err) {
      req.log.error({ err }, "Object storage niet beschikbaar — bon geweigerd");
      return void res.status(503).json({ error: "De bestandsopslag is momenteel niet beschikbaar. De bon is niet opgeslagen." });
    }

    const [nieuw] = await db.update(algemeneInkopenTable)
      .set({ bonPad, bijgewerktOp: new Date() })
      .where(eq(algemeneInkopenTable.id, id)).returning();

    // INKOOP_BOEKING_01: een PDF bij een direct betaalde inkoop is een factuur —
    // dezelfde AI-lezing als een mailfactuur, gekoppeld als inkoopfactuur.
    // Een foto blijft gewoon een bon. Fout in de verwerking = bon blijft staan.
    let factuurVerwerking: unknown = null;
    if (rij.soort === "direct_betaald" && bestand.mimetype === "application/pdf") {
      try {
        const [gebruiker] = req.session.userId
          ? await db.select({ naam: gebruikersTable.naam }).from(gebruikersTable)
              .where(eq(gebruikersTable.id, req.session.userId)).limit(1)
          : [];
        factuurVerwerking = await verwerkDirectBetaaldeBonFactuur({
          inkoopId: id,
          buffer: bestand.buffer,
          bestandsnaam: bestand.originalname || "factuur.pdf",
          subPath,
          gebruikerNaam: gebruiker?.naam ?? null,
        });
      } catch (err) {
        req.log.error({ err, inkoopId: id }, "algemene inkoop: factuurverwerking van pdf-bon mislukt");
        factuurVerwerking = {
          factuurAangemaakt: false, uitkomst: "niet_leesbaar",
          melding: "De PDF is als bon bewaard, maar kon niet automatisch als factuur verwerkt worden. Handel de inkoop handmatig af.",
        };
      }
    }

    const [vers] = await db.select().from(algemeneInkopenTable).where(eq(algemeneInkopenTable.id, id));
    res.json({ ...(await metWeergave(vers ?? nieuw!)), factuur_verwerking: factuurVerwerking });
  } catch (err) {
    req.log.error({ err }, "algemene inkoop: bon uploaden mislukt");
    res.status(500).json({ error: veiligeFoutmelding(err) });
  }
});

// ── Bon downloaden (eigen ACL-route; scan-gate) ───────────────────────────────
router.get("/algemene-inkoop/:id/bon", toegang, async (req, res): Promise<void> => {
  const id = Number(req.params["id"]);
  if (isNaN(id)) return void res.status(400).json({ error: "Ongeldig ID" });
  const [rij] = await db.select({ bonPad: algemeneInkopenTable.bonPad }).from(algemeneInkopenTable).where(eq(algemeneInkopenTable.id, id));
  if (!rij?.bonPad) return void res.status(404).json({ error: "Geen bon aanwezig" });
  const scanStatus = await haalScanStatusOpVoorPad(rij.bonPad).catch(() => null);
  if (scanStatus?.geblokkeerd) return void res.status(403).json({ error: "Dit bestand is geblokkeerd door de beveiligingsscan." });
  try {
    const objectFile = await storage.getObjectEntityFile(rij.bonPad);
    const response = await storage.downloadObject(objectFile);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      Readable.fromWeb(response.body as import("node:stream/web").ReadableStream<Uint8Array>).pipe(res);
    } else res.end();
  } catch (err) {
    if (err instanceof ObjectNotFoundError) return void res.status(404).json({ error: "Bestand niet gevonden in opslag" });
    req.log.error({ err }, "algemene inkoop: bon serveren mislukt");
    res.status(500).json({ error: "Bestand kon niet worden opgehaald" });
  }
});

// ── Afronden ──────────────────────────────────────────────────────────────────
router.post("/algemene-inkoop/:id/afronden", toegang, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params["id"]);
    if (isNaN(id)) return void res.status(400).json({ error: "Ongeldig ID" });
    const [rij] = await db.select().from(algemeneInkopenTable).where(eq(algemeneInkopenTable.id, id));
    if (!rij) return void res.status(404).json({ error: "Niet gevonden" });
    if (rij.status === "afgehandeld") return void res.status(409).json({ error: "Deze inkoop is al afgehandeld" });
    if (rij.status === "ter_goedkeuring") {
      return void res.status(422).json({ error: "Deze inkoop wacht nog op goedkeuring en kan niet worden afgerond.", viaGoedkeuring: true });
    }
    // Harde bon-plicht: direct betaald kan zonder bewijsstuk nooit worden afgerond.
    if (rij.soort === "direct_betaald" && !rij.bonPad) {
      return void res.status(422).json({ error: "Zonder bon (foto of pdf) kan een direct betaalde inkoop niet worden afgerond. Voeg eerst de bon toe." });
    }
    const [nieuw] = await db.update(algemeneInkopenTable)
      .set({ status: "afgehandeld", bijgewerktOp: new Date() })
      .where(eq(algemeneInkopenTable.id, id)).returning();
    res.json(await metWeergave(nieuw!));
  } catch (err) {
    req.log.error({ err }, "algemene inkoop: afronden mislukt");
    res.status(500).json({ error: veiligeFoutmelding(err) });
  }
});

// ── Verwijderen (alleen zolang er geen factuur of afronding aan hangt) ───────
router.delete("/algemene-inkoop/:id", requireEnigeBevoegdheid([["financieel", 3], ["offertes", 3]]), async (req, res): Promise<void> => {
  try {
    const id = Number(req.params["id"]);
    if (isNaN(id)) return void res.status(400).json({ error: "Ongeldig ID" });
    const [rij] = await db.select().from(algemeneInkopenTable).where(eq(algemeneInkopenTable.id, id));
    if (!rij) return void res.status(404).json({ error: "Niet gevonden" });
    if (rij.status === "afgehandeld" || rij.factuurId != null) {
      return void res.status(409).json({ error: "Een afgehandelde of aan een factuur gekoppelde inkoop kan niet worden verwijderd" });
    }
    await db.delete(algemeneInkopenTable).where(eq(algemeneInkopenTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "algemene inkoop: verwijderen mislukt");
    res.status(500).json({ error: veiligeFoutmelding(err) });
  }
});

export default router;
