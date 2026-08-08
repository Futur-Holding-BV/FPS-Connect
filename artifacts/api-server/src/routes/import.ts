import { veiligeFoutmelding } from "../middlewares/foutafhandelaar";
import { Router, type Request, type Response } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { createHash } from "crypto";
import {
  db,
  leveranciersTable,
  artikelenTable,
  importLogsTable,
  crmKlantenTable,
  crmContactpersonenTable,
  medewerkersTable,
  gebouwenTable,
  eenheidsprijzenTable,
  facturenTable,
  gebruikersTable,
} from "@workspace/db";
import { eq, isNotNull, isNull, and } from "drizzle-orm";
import { logger } from "../lib/logger";
import { requireEnigeBevoegdheid } from "../middlewares/auth";
import { heeftNiveau, type ModuleId } from "@workspace/permissies";
import { ObjectStorageService } from "../lib/objectStorage";
import { randomUUID } from "crypto";

const router = Router();

// ── IMPORT_01 §2.1: recht per importtype volgt de module waar de gegevens
// thuishoren, op het hoogste niveau (4 = Beheer). Geen aparte importrechten-
// lijst: alles is afgeleid van de bestaande modulerechten.
export const IMPORT_TYPE_MODULES: Record<string, ModuleId> = {
  leveranciers: "crm" as ModuleId,
  klanten: "crm" as ModuleId,
  contactpersonen: "crm" as ModuleId,
  artikelen: "magazijn" as ModuleId,
  magazijn_artikelen: "magazijn" as ModuleId,
  medewerkers: "personeel" as ModuleId,
  gebouwen: "gebouwen" as ModuleId,
  historische_projecten: "gebouwen" as ModuleId,
  eenheidsprijzen: "calculaties" as ModuleId,
  historische_facturen: "financieel" as ModuleId,
};
const HOOGSTE_NIVEAU = 4;
const IMPORT_MODULES = [...new Set(Object.values(IMPORT_TYPE_MODULES))];

// Leesrecht op minimaal één van de import-modules: wie niets mag importeren
// ziet ook de importgeschiedenis niet (IMPORT_01 §2.1).
const importLogsLezen = requireEnigeBevoegdheid(
  IMPORT_MODULES.map((m) => [m, 1] as [ModuleId, number]),
);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const storage = new ObjectStorageService();

/**
 * Controleert of de ingelogde gebruiker dit importtype mag importeren:
 * hoogste niveau op de module van het type. Hoofdbeheerder mag alles,
 * klant niets. Retourneert een http-status of null (= toegestaan).
 */
async function importRechtFout(req: Request, type: string): Promise<{ status: number; error: string } | null> {
  const module = IMPORT_TYPE_MODULES[type];
  if (!module) return { status: 400, error: "Ongeldig importtype" };
  const id = req.session?.userId;
  if (!id) return { status: 401, error: "Niet ingelogd" };
  if (req.permissies) {
    if (req.permissies.isHoofdbeheerder) return null;
    if (req.permissies.isKlant) return { status: 403, error: "Geen toegang" };
    return req.permissies.heeftModuleRecht(module, HOOGSTE_NIVEAU)
      ? null
      : { status: 403, error: "Geen toegang" };
  }
  const [g] = await db
    .select({ rol: gebruikersTable.rol, bevoegdheden: gebruikersTable.bevoegdheden })
    .from(gebruikersTable)
    .where(eq(gebruikersTable.id, id));
  if (!g) return { status: 403, error: "Geen toegang" };
  if (g.rol === "hoofdbeheerder") return null;
  if (g.rol === "klant") return { status: 403, error: "Geen toegang" };
  const bev = (g.bevoegdheden as Record<string, number> | null) ?? {};
  return heeftNiveau(bev, module, HOOGSTE_NIVEAU) ? null : { status: 403, error: "Geen toegang" };
}

// ── In-memory cache voor geüploade bestanden ──────────────────────────────────
type CacheEntry = {
  rijen: Record<string, string>[];
  bestandsnaam: string;
  type: string;
  buffer: Buffer;
  mimetype: string;
  gebruikerId: number;
  // Grendel tegen dubbel/gelijktijdig uitvoeren van hetzelfde bestand
  inUitvoering?: boolean;
  // Gezet door /import/controleren — verplicht vóór uitvoeren (IMPORT_01 §2.2)
  controle?: {
    koppelingHash: string;
    perRij: Array<{ status: "nieuw" | "dubbel" | "onbruikbaar"; reden?: string; sleutel: string | null }>;
    nieuw: number;
    dubbel: number;
    onbruikbaar: number;
  };
};
const bestandCache = new Map<string, CacheEntry>();

function cacheBestand(id: string, data: CacheEntry) {
  bestandCache.set(id, data);
  setTimeout(() => bestandCache.delete(id), 30 * 60 * 1000);
}

function koppelingHash(kop: Record<string, string>): string {
  return createHash("sha256").update(JSON.stringify(Object.entries(kop).sort())).digest("hex");
}

// ── POST /import/preview ───────────────────────────────────────────────────────
router.post(
  "/import/preview",
  upload.single("bestand"),
  async (req, res): Promise<void> => {
    try {
      if (!req.file) return void res.status(400).json({ error: "Geen bestand ontvangen" });

      const type = String(req.body.type ?? "").trim();
      const fout = await importRechtFout(req, type);
      if (fout) return void res.status(fout.status).json({ error: fout.error });

      const rijen = parseBestand(req.file);
      if (rijen.length === 0) {
        return void res.status(400).json({ error: "Bestand bevat geen data-rijen" });
      }

      const kolommen = Object.keys(rijen[0] ?? {});
      const voorbeeldRijen = rijen.slice(0, 20);
      const bestandId = randomUUID();

      cacheBestand(bestandId, {
        rijen,
        bestandsnaam: req.file.originalname,
        type,
        buffer: req.file.buffer,
        mimetype: req.file.mimetype || "application/octet-stream",
        gebruikerId: req.session!.userId!,
      });

      res.json({
        kolommen,
        rijen: voorbeeldRijen,
        totaal_rijen: rijen.length,
        bestand_id: bestandId,
        sleutel_omschrijving: SLEUTEL_OMSCHRIJVING[type] ?? null,
      });
    } catch (err) {
      req.log.error({ err }, "import preview mislukt");
      res.status(500).json({ error: "Fout bij verwerken bestand" });
    }
  },
);

// ── Herkenningssleutels per type (IMPORT_01 §2.2) ─────────────────────────────
// Gekozen op basis van wat er werkelijk in de gegevens bestaat; gemeld in
// docs/antwoorden/IMPORT_01.md.
export const SLEUTEL_OMSCHRIJVING: Record<string, string> = {
  leveranciers: "KvK-nummer, anders naam + plaats",
  klanten: "KvK-nummer, anders naam + plaats",
  contactpersonen: "e-mailadres, anders naam",
  artikelen: "artikelcode, anders naam",
  magazijn_artikelen: "artikelcode, anders naam",
  medewerkers: "e-mailadres, anders naam + geboortedatum",
  gebouwen: "werknummer of projectnummer, anders naam + adres",
  historische_projecten: "werknummer of projectnummer, anders naam + adres",
  eenheidsprijzen: "code (uniek in de database)",
  historische_facturen: "factuurnummer + soort (in-/verkoop); zonder factuurnummer geen herkenning",
};

const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();
const of = (...vals: Array<string | null | undefined>) => {
  for (const v of vals) if (norm(v)) return norm(v);
  return "";
};

type TypeConfig = {
  map: (rij: Record<string, string>, kop: Record<string, string>) => Record<string, unknown>;
  // null = deze rij heeft geen bruikbare herkenningssleutel (telt als nieuw)
  sleutel: (values: Record<string, unknown>) => string | null;
  // reden waarom een rij onbruikbaar is, of null als bruikbaar
  onbruikbaar: (values: Record<string, unknown>, rij: Record<string, string>, kop: Record<string, string>) => string | null;
  bestaandeSleutels: () => Promise<Set<string>>;
  insert: (values: Record<string, unknown>, importId: number) => Promise<void>;
  verwijderQuery: {
    tabel: typeof leveranciersTable;
  } | null;
};

const s = (v: unknown) => (typeof v === "string" ? v : "");

const TYPE_CONFIG: Record<string, TypeConfig> = {
  leveranciers: {
    map: koppelLeverancier,
    sleutel: (v) => of(s(v.kvkNummer)) ? `kvk:${norm(s(v.kvkNummer))}` : (norm(s(v.naam)) && s(v.naam) !== "Onbekend" ? `ns:${norm(s(v.naam))}|${norm(s(v.stad))}` : null),
    onbruikbaar: (v) => (!norm(s(v.naam)) || s(v.naam) === "Onbekend" ? "naam ontbreekt" : null),
    bestaandeSleutels: async () => {
      const rijen = await db.select({ kvk: leveranciersTable.kvkNummer, naam: leveranciersTable.naam, stad: leveranciersTable.stad }).from(leveranciersTable);
      return new Set(rijen.flatMap((r) => [r.kvk ? `kvk:${norm(r.kvk)}` : "", `ns:${norm(r.naam)}|${norm(r.stad)}`].filter(Boolean)));
    },
    insert: async (v, importId) => { await db.insert(leveranciersTable).values({ ...(v as typeof leveranciersTable.$inferInsert), bron: "import", importId }); },
    verwijderQuery: { tabel: leveranciersTable },
  },
  klanten: {
    map: koppelKlant,
    sleutel: (v) => of(s(v.kvk)) ? `kvk:${norm(s(v.kvk))}` : (norm(s(v.naam)) && s(v.naam) !== "Onbekend" ? `ns:${norm(s(v.naam))}|${norm(s(v.stad))}` : null),
    onbruikbaar: (v) => (!norm(s(v.naam)) || s(v.naam) === "Onbekend" ? "naam ontbreekt" : null),
    bestaandeSleutels: async () => {
      const rijen = await db.select({ kvk: crmKlantenTable.kvk, naam: crmKlantenTable.naam, stad: crmKlantenTable.stad }).from(crmKlantenTable);
      return new Set(rijen.flatMap((r) => [r.kvk ? `kvk:${norm(r.kvk)}` : "", `ns:${norm(r.naam)}|${norm(r.stad)}`].filter(Boolean)));
    },
    insert: async (v, importId) => { await db.insert(crmKlantenTable).values({ ...(v as typeof crmKlantenTable.$inferInsert), bron: "import", importId }); },
    verwijderQuery: { tabel: crmKlantenTable as unknown as typeof leveranciersTable },
  },
  contactpersonen: {
    map: koppelContactpersoon,
    sleutel: (v) => of(s(v.email)) ? `em:${norm(s(v.email))}` : (norm(s(v.naam)) && s(v.naam) !== "Onbekend" ? `n:${norm(s(v.naam))}` : null),
    onbruikbaar: (v) => (!norm(s(v.naam)) || s(v.naam) === "Onbekend" ? "naam ontbreekt" : null),
    bestaandeSleutels: async () => {
      const rijen = await db.select({ email: crmContactpersonenTable.email, naam: crmContactpersonenTable.naam }).from(crmContactpersonenTable);
      return new Set(rijen.flatMap((r) => [r.email ? `em:${norm(r.email)}` : "", `n:${norm(r.naam)}`].filter(Boolean)));
    },
    insert: async (v, importId) => { await db.insert(crmContactpersonenTable).values({ ...(v as typeof crmContactpersonenTable.$inferInsert), bron: "import", importId }); },
    verwijderQuery: { tabel: crmContactpersonenTable as unknown as typeof leveranciersTable },
  },
  artikelen: {
    map: koppelArtikel,
    sleutel: (v) => of(s(v.code)) ? `c:${norm(s(v.code))}` : (norm(s(v.naam)) && s(v.naam) !== "Onbekend" ? `n:${norm(s(v.naam))}` : null),
    onbruikbaar: (v) => (!norm(s(v.naam)) || s(v.naam) === "Onbekend" ? "naam ontbreekt" : null),
    bestaandeSleutels: async () => {
      const rijen = await db.select({ code: artikelenTable.code, naam: artikelenTable.naam }).from(artikelenTable);
      return new Set(rijen.flatMap((r) => [r.code ? `c:${norm(r.code)}` : "", `n:${norm(r.naam)}`].filter(Boolean)));
    },
    insert: async (v, importId) => { await db.insert(artikelenTable).values({ ...(v as typeof artikelenTable.$inferInsert), bron: "import", importId }); },
    verwijderQuery: { tabel: artikelenTable as unknown as typeof leveranciersTable },
  },
  medewerkers: {
    map: koppelMedewerker,
    sleutel: (v) => of(s(v.email)) ? `em:${norm(s(v.email))}` : (norm(s(v.naam)) && s(v.naam) !== "Onbekend" ? `ng:${norm(s(v.naam))}|${norm(s(v.geboortedatum))}` : null),
    onbruikbaar: (v) => (!norm(s(v.naam)) || s(v.naam) === "Onbekend" ? "naam ontbreekt" : null),
    bestaandeSleutels: async () => {
      const rijen = await db.select({ email: medewerkersTable.email, naam: medewerkersTable.naam, geb: medewerkersTable.geboortedatum }).from(medewerkersTable);
      return new Set(rijen.flatMap((r) => [r.email ? `em:${norm(r.email)}` : "", `ng:${norm(r.naam)}|${norm(r.geb)}`].filter(Boolean)));
    },
    insert: async (v, importId) => { await db.insert(medewerkersTable).values({ ...(v as typeof medewerkersTable.$inferInsert), bron: "import", importId }); },
    verwijderQuery: { tabel: medewerkersTable as unknown as typeof leveranciersTable },
  },
  gebouwen: {
    map: koppelGebouw,
    sleutel: gebouwSleutel,
    onbruikbaar: (v) => {
      if (!norm(s(v.naam)) || s(v.naam) === "Onbekend") return "naam ontbreekt";
      if (!norm(s(v.adres))) return "adres ontbreekt";
      return null;
    },
    bestaandeSleutels: gebouwBestaandeSleutels,
    insert: async (v, importId) => { await db.insert(gebouwenTable).values({ ...(v as typeof gebouwenTable.$inferInsert), bron: "import", importId }); },
    verwijderQuery: { tabel: gebouwenTable as unknown as typeof leveranciersTable },
  },
  historische_projecten: {
    map: koppelHistorischProject,
    sleutel: gebouwSleutel,
    onbruikbaar: (v) => (!norm(s(v.naam)) || s(v.naam) === "Onbekend" ? "naam ontbreekt" : null),
    bestaandeSleutels: gebouwBestaandeSleutels,
    insert: async (v, importId) => { await db.insert(gebouwenTable).values({ ...(v as typeof gebouwenTable.$inferInsert), bron: "import", importId }); },
    verwijderQuery: { tabel: gebouwenTable as unknown as typeof leveranciersTable },
  },
  magazijn_artikelen: {
    map: (rij, kop) => { const v = koppelArtikel(rij, kop); return { ...v, categorie: v.categorie || "magazijn" }; },
    sleutel: (v) => of(s(v.code)) ? `c:${norm(s(v.code))}` : (norm(s(v.naam)) && s(v.naam) !== "Onbekend" ? `n:${norm(s(v.naam))}` : null),
    onbruikbaar: (v) => (!norm(s(v.naam)) || s(v.naam) === "Onbekend" ? "naam ontbreekt" : null),
    bestaandeSleutels: async () => {
      const rijen = await db.select({ code: artikelenTable.code, naam: artikelenTable.naam }).from(artikelenTable);
      return new Set(rijen.flatMap((r) => [r.code ? `c:${norm(r.code)}` : "", `n:${norm(r.naam)}`].filter(Boolean)));
    },
    insert: async (v, importId) => { await db.insert(artikelenTable).values({ ...(v as typeof artikelenTable.$inferInsert), bron: "import", importId }); },
    verwijderQuery: { tabel: artikelenTable as unknown as typeof leveranciersTable },
  },
  eenheidsprijzen: {
    map: koppelEenheidsprijs,
    sleutel: (v) => (norm(s(v.code)) ? `c:${norm(s(v.code))}` : null),
    onbruikbaar: (v) => {
      if (!norm(s(v.code))) return "code ontbreekt";
      if (!norm(s(v.omschrijving)) || s(v.omschrijving) === "Onbekend") return "omschrijving ontbreekt";
      return null;
    },
    bestaandeSleutels: async () => {
      const rijen = await db.select({ code: eenheidsprijzenTable.code }).from(eenheidsprijzenTable);
      return new Set(rijen.map((r) => `c:${norm(r.code)}`));
    },
    insert: async (v, importId) => { await db.insert(eenheidsprijzenTable).values({ ...(v as typeof eenheidsprijzenTable.$inferInsert), bron: "import", importId }); },
    verwijderQuery: { tabel: eenheidsprijzenTable as unknown as typeof leveranciersTable },
  },
  historische_facturen: {
    map: koppelHistorischeFactuur,
    sleutel: (v) => (norm(s(v.factuurnummer)) ? `f:${norm(s(v.type))}|${norm(s(v.factuurnummer))}` : null),
    onbruikbaar: (v) => (!norm(s(v.relatienaam)) && !norm(s(v.factuurnummer)) ? "relatienaam en factuurnummer ontbreken beide" : null),
    bestaandeSleutels: async () => {
      const rijen = await db.select({ type: facturenTable.type, nr: facturenTable.factuurnummer }).from(facturenTable);
      return new Set(rijen.filter((r) => norm(r.nr)).map((r) => `f:${norm(r.type)}|${norm(r.nr)}`));
    },
    insert: async (v, importId) => { await db.insert(facturenTable).values({ ...(v as typeof facturenTable.$inferInsert), bron: "import", importId }); },
    verwijderQuery: { tabel: facturenTable as unknown as typeof leveranciersTable },
  },
};

function gebouwSleutel(v: Record<string, unknown>): string | null {
  if (norm(s(v.werknummer))) return `w:${norm(s(v.werknummer))}`;
  if (norm(s(v.projectnummer))) return `p:${norm(s(v.projectnummer))}`;
  if (norm(s(v.naam)) && s(v.naam) !== "Onbekend" && norm(s(v.adres))) return `na:${norm(s(v.naam))}|${norm(s(v.adres))}`;
  return null;
}

async function gebouwBestaandeSleutels(): Promise<Set<string>> {
  const rijen = await db
    .select({ werknummer: gebouwenTable.werknummer, projectnummer: gebouwenTable.projectnummer, naam: gebouwenTable.naam, adres: gebouwenTable.adres })
    .from(gebouwenTable);
  return new Set(
    rijen.flatMap((r) => [
      r.werknummer ? `w:${norm(r.werknummer)}` : "",
      r.projectnummer ? `p:${norm(r.projectnummer)}` : "",
      `na:${norm(r.naam)}|${norm(r.adres)}`,
    ].filter(Boolean)),
  );
}

// ── POST /import/controleren ──────────────────────────────────────────────────
// Stap 1 van twee (IMPORT_01 §2.2): het bestand wordt geanalyseerd en er komt
// een overzicht — nieuw / dubbel / onbruikbaar — vóór er iets wordt opgeslagen.
router.post("/import/controleren", async (req, res): Promise<void> => {
  try {
    const { bestand_id, type, kolomkoppeling } = req.body as {
      bestand_id: string;
      type: string;
      kolomkoppeling: Record<string, string>;
    };
    const fout = await importRechtFout(req, type);
    if (fout) return void res.status(fout.status).json({ error: fout.error });

    const gecached = bestandCache.get(bestand_id);
    if (!gecached || gecached.type !== type) {
      return void res.status(400).json({ error: "Bestand niet meer beschikbaar — upload opnieuw" });
    }
    // Bestand-id is gebonden aan de uploader: niemand anders mag ermee verder
    if (gecached.gebruikerId !== req.session?.userId) {
      return void res.status(403).json({ error: "Dit bestand hoort bij een andere gebruiker — upload zelf opnieuw" });
    }
    const config = TYPE_CONFIG[type];
    if (!config) return void res.status(400).json({ error: "Ongeldig importtype" });

    const bestaand = await config.bestaandeSleutels();
    const gezienInBestand = new Set<string>();
    const perRij: NonNullable<CacheEntry["controle"]>["perRij"] = [];
    const onbruikbaarRedenen: Array<{ rij: number; reden: string }> = [];
    let nieuw = 0, dubbel = 0, onbruikbaar = 0;

    for (let i = 0; i < gecached.rijen.length; i++) {
      const rij = gecached.rijen[i]!;
      const values = config.map(rij, kolomkoppeling ?? {});
      const reden = config.onbruikbaar(values, rij, kolomkoppeling ?? {});
      if (reden) {
        onbruikbaar++;
        perRij.push({ status: "onbruikbaar", reden, sleutel: null });
        if (onbruikbaarRedenen.length < 50) onbruikbaarRedenen.push({ rij: i + 2, reden });
        continue;
      }
      const sleutel = config.sleutel(values);
      if (sleutel && (bestaand.has(sleutel) || gezienInBestand.has(sleutel))) {
        dubbel++;
        perRij.push({ status: "dubbel", sleutel });
      } else {
        nieuw++;
        perRij.push({ status: "nieuw", sleutel });
        if (sleutel) gezienInBestand.add(sleutel);
      }
    }

    gecached.controle = {
      koppelingHash: koppelingHash(kolomkoppeling ?? {}),
      perRij,
      nieuw,
      dubbel,
      onbruikbaar,
    };

    res.json({
      totaal_rijen: gecached.rijen.length,
      nieuw,
      dubbel,
      onbruikbaar,
      onbruikbaar_redenen: onbruikbaarRedenen,
      sleutel_omschrijving: SLEUTEL_OMSCHRIJVING[type] ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "import controleren mislukt");
    res.status(500).json({ error: "Fout bij controleren bestand" });
  }
});

// ── POST /import/uitvoeren ────────────────────────────────────────────────────
router.post("/import/uitvoeren", async (req, res): Promise<void> => {
  try {
    const { bestand_id, type, kolomkoppeling, keuze_dubbelen } = req.body as {
      bestand_id: string;
      type: string;
      kolomkoppeling: Record<string, string>;
      keuze_dubbelen?: "overslaan" | "als_nieuw";
    };
    const fout = await importRechtFout(req, type);
    if (fout) return void res.status(fout.status).json({ error: fout.error });

    const gecached = bestandCache.get(bestand_id);
    if (!gecached || gecached.type !== type) {
      return void res.status(400).json({ error: "Bestand niet meer beschikbaar — upload opnieuw" });
    }
    // Bestand-id is gebonden aan de uploader
    if (gecached.gebruikerId !== req.session?.userId) {
      return void res.status(403).json({ error: "Dit bestand hoort bij een andere gebruiker — upload zelf opnieuw" });
    }
    const config = TYPE_CONFIG[type];
    if (!config) return void res.status(400).json({ error: "Ongeldig importtype" });

    // Geen import zonder voorafgaand overzicht (IMPORT_01 §4)
    const controle = gecached.controle;
    if (!controle || controle.koppelingHash !== koppelingHash(kolomkoppeling ?? {})) {
      return void res.status(400).json({ error: "Voer eerst de controle uit (stap Controleren) met deze kolomkoppeling" });
    }
    if (controle.dubbel > 0 && keuze_dubbelen !== "overslaan" && keuze_dubbelen !== "als_nieuw") {
      return void res.status(422).json({
        error: `Er zijn ${controle.dubbel} rijen die lijken op iets dat al bestaat. Kies: overslaan of als nieuw toevoegen.`,
        dubbel: controle.dubbel,
      });
    }
    // Grendel: hetzelfde bestand mag maar één keer (tegelijk) uitgevoerd worden
    if (gecached.inUitvoering) {
      return void res.status(409).json({ error: "Deze import wordt al uitgevoerd" });
    }
    gecached.inUitvoering = true;

    const { rijen, bestandsnaam } = gecached;
    const fouten: { rij: number; fout: string }[] = [];
    let verwerkt = 0;
    let overgeslagen = 0;
    let dubbelOvergeslagen = 0;
    const userId = req.session?.userId ?? null;

    // Log eerst aanmaken zodat elke rij het importnummer meekrijgt (IMPORT_01 §2.3)
    const [log] = await db
      .insert(importLogsTable)
      .values({
        type,
        bestandsnaam,
        rijenTotaal: rijen.length,
        gebruikerId: userId,
        rijenDubbel: controle.dubbel,
        keuzeDubbelen: controle.dubbel > 0 ? keuze_dubbelen : null,
      })
      .returning();
    if (!log) {
      gecached.inUitvoering = false;
      return void res.status(500).json({ error: "Importlog kon niet worden aangemaakt" });
    }

    // Origineel bestand bewaren bij de log — verplicht vóór er records worden
    // geschreven (IMPORT_01 §2.3: terugdraaibaarheid vereist het bronbestand).
    let bestandPad: string | null = null;
    try {
      const subPath = `imports/${log.id}/${bestandsnaam.replace(/[^\w.\-]/g, "_")}`;
      await storage.uploadBestand(subPath, gecached.buffer, gecached.mimetype);
      bestandPad = subPath;
    } catch (err) {
      req.log.error({ err }, "importbestand opslaan mislukt — import afgebroken");
      await db.delete(importLogsTable).where(eq(importLogsTable.id, log.id)).catch(() => undefined);
      gecached.inUitvoering = false;
      return void res.status(500).json({ error: "Het originele bestand kon niet worden bewaard — de import is niet uitgevoerd. Probeer het opnieuw." });
    }

    // Hercontrole vlak vóór het schrijven: records die ná de controle-stap door
    // iemand anders zijn toegevoegd, mogen niet alsnog dubbel binnenkomen.
    const bestaandNu = await config.bestaandeSleutels();

    for (let i = 0; i < rijen.length; i++) {
      const rijStatus = controle.perRij[i];
      if (!rijStatus || rijStatus.status === "onbruikbaar") {
        overgeslagen++;
        if (rijStatus?.reden) fouten.push({ rij: i + 2, fout: rijStatus.reden });
        continue;
      }
      if (rijStatus.status === "dubbel" && keuze_dubbelen === "overslaan") {
        dubbelOvergeslagen++;
        overgeslagen++;
        continue;
      }
      // Rij was "nieuw" bij de controle maar bestaat inmiddels: nooit stil een
      // dubbele aanmaken. Alleen bij expliciete keuze "als_nieuw" gaat hij door.
      if (
        rijStatus.status === "nieuw" &&
        rijStatus.sleutel &&
        bestaandNu.has(rijStatus.sleutel) &&
        keuze_dubbelen !== "als_nieuw"
      ) {
        dubbelOvergeslagen++;
        overgeslagen++;
        fouten.push({ rij: i + 2, fout: "inmiddels al aanwezig (na de controle toegevoegd) — overgeslagen" });
        continue;
      }
      try {
        const values = config.map(rijen[i]!, kolomkoppeling ?? {});
        await config.insert(values, log.id);
        verwerkt++;
      } catch (err) {
        fouten.push({ rij: i + 2, fout: veiligeFoutmelding(err, "Onbekende fout") });
        overgeslagen++;
      }
    }

    await db
      .update(importLogsTable)
      .set({
        rijenVerwerkt: verwerkt,
        rijenOvergeslagen: overgeslagen,
        fouten: fouten as unknown as typeof importLogsTable.$inferInsert["fouten"],
        bestandPad,
      })
      .where(eq(importLogsTable.id, log.id));

    bestandCache.delete(bestand_id);

    res.json({
      type,
      rijen_totaal: rijen.length,
      rijen_verwerkt: verwerkt,
      rijen_overgeslagen: overgeslagen,
      rijen_dubbel_overgeslagen: dubbelOvergeslagen,
      fouten,
      log_id: log.id,
    });
  } catch (err) {
    // Grendel loslaten zodat een nieuwe poging mogelijk blijft
    const entry = bestandCache.get((req.body as { bestand_id?: string })?.bestand_id ?? "");
    if (entry) entry.inUitvoering = false;
    req.log.error({ err }, "import uitvoeren mislukt");
    res.status(500).json({ error: "Fout bij importeren" });
  }
});

// ── GET /import/logs ──────────────────────────────────────────────────────────
router.get("/import/logs", importLogsLezen, async (req, res): Promise<void> => {
  try {
    const logs = await db
      .select()
      .from(importLogsTable)
      .orderBy(importLogsTable.aangemaaktOp);

    res.json(
      logs.reverse().map((l) => ({
        id: l.id,
        type: l.type,
        bestandsnaam: l.bestandsnaam,
        rijen_totaal: l.rijenTotaal,
        rijen_verwerkt: l.rijenVerwerkt,
        rijen_overgeslagen: l.rijenOvergeslagen,
        rijen_dubbel: l.rijenDubbel,
        keuze_dubbelen: l.keuzeDubbelen,
        fouten: l.fouten ?? [],
        bestand_beschikbaar: !!l.bestandPad,
        teruggedraaid_op: l.teruggedraaidOp ? l.teruggedraaidOp.toISOString() : null,
        terugdraai_detail: l.terugdraaiDetail ?? null,
        aangemaakt_op: l.aangemaaktOp.toISOString(),
      })),
    );
  } catch (err) {
    req.log.error({ err }, "import logs ophalen mislukt");
    res.status(500).json({ error: "Fout bij ophalen import-logs" });
  }
});

// ── GET /import/logs/:id/bestand ─────────────────────────────────────────────
// Het originele bestand — alleen voor wie dit type zelf mag importeren.
router.get("/import/logs/:id/bestand", async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params["id"]), 10);
    if (isNaN(id)) return void res.status(400).json({ error: "Ongeldig id" });
    const [log] = await db.select().from(importLogsTable).where(eq(importLogsTable.id, id));
    if (!log) return void res.status(404).json({ error: "Import niet gevonden" });
    const fout = await importRechtFout(req, log.type);
    if (fout) return void res.status(fout.status).json({ error: fout.error });
    if (!log.bestandPad) return void res.status(404).json({ error: "Geen bestand bewaard bij deze import" });

    const buf = await storage.downloadBestandBuffer(log.bestandPad);
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${log.bestandsnaam.replace(/"/g, "")}"`);
    res.send(buf);
  } catch (err) {
    req.log.error({ err }, "importbestand downloaden mislukt");
    res.status(500).json({ error: "Fout bij downloaden bestand" });
  }
});

// ── POST /import/logs/:id/terugdraaien ───────────────────────────────────────
// Eén import in zijn geheel ongedaan maken (IMPORT_01 §2.3). Records die na de
// import zijn gewijzigd of elders in gebruik zijn, blijven staan — met reden.
router.post("/import/logs/:id/terugdraaien", async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params["id"]), 10);
    if (isNaN(id)) return void res.status(400).json({ error: "Ongeldig id" });
    const [log] = await db.select().from(importLogsTable).where(eq(importLogsTable.id, id));
    if (!log) return void res.status(404).json({ error: "Import niet gevonden" });
    const fout = await importRechtFout(req, log.type);
    if (fout) return void res.status(fout.status).json({ error: fout.error });
    if (log.teruggedraaidOp) {
      return void res.status(409).json({ error: "Deze import is al teruggedraaid" });
    }
    const config = TYPE_CONFIG[log.type];
    if (!config?.verwijderQuery) {
      return void res.status(400).json({ error: "Dit importtype kan niet worden teruggedraaid" });
    }

    // Atomaire claim: twee gelijktijdige terugdraaiacties kunnen niet allebei
    // doorlopen — alleen wie de log als eerste markeert, mag verwijderen.
    const geclaimd = await db
      .update(importLogsTable)
      .set({ teruggedraaidOp: new Date(), teruggedraaidDoor: req.session?.userId ?? null })
      .where(and(eq(importLogsTable.id, id), isNull(importLogsTable.teruggedraaidOp)))
      .returning({ id: importLogsTable.id });
    if (geclaimd.length === 0) {
      return void res.status(409).json({ error: "Deze import is al teruggedraaid" });
    }

    const tabel = config.verwijderQuery.tabel;
    const rijen = await db
      .select({ id: tabel.id, aangemaaktOp: tabel.aangemaaktOp, bijgewerktOp: tabel.bijgewerktOp })
      .from(tabel)
      .where(and(eq(tabel.importId, id), isNotNull(tabel.importId)));

    let verwijderd = 0;
    const nietVerwijderd: Array<{ id: number; reden: string }> = [];

    for (const rij of rijen) {
      // Per rij: gewijzigd = bijgewerkt_op merkbaar later dan de eigen
      // aanmaakdatum (marge 2s voor defaults die beide bij insert zetten).
      if (
        rij.bijgewerktOp &&
        rij.aangemaaktOp &&
        rij.bijgewerktOp.getTime() > rij.aangemaaktOp.getTime() + 2000
      ) {
        nietVerwijderd.push({ id: rij.id, reden: "na de import gewijzigd" });
        continue;
      }
      try {
        await db.delete(tabel).where(eq(tabel.id, rij.id));
        verwijderd++;
      } catch {
        nietVerwijderd.push({ id: rij.id, reden: "in gebruik door andere gegevens" });
      }
    }

    const detail = { verwijderd, niet_verwijderd: nietVerwijderd };
    await db
      .update(importLogsTable)
      .set({
        terugdraaiDetail: detail as unknown as typeof importLogsTable.$inferInsert["terugdraaiDetail"],
      })
      .where(eq(importLogsTable.id, id));

    res.json({
      log_id: id,
      verwijderd,
      niet_verwijderd: nietVerwijderd,
      volledig: nietVerwijderd.length === 0,
    });
  } catch (err) {
    req.log.error({ err }, "import terugdraaien mislukt");
    res.status(500).json({ error: "Fout bij terugdraaien import" });
  }
});

// ── Hulpfuncties ──────────────────────────────────────────────────────────────

function parseBestand(file: Express.Multer.File): Record<string, string>[] {
  const workbook = XLSX.read(file.buffer, { type: "buffer", raw: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]!];
  if (!sheet) throw new Error("Geen werkblad gevonden in bestand");

  // Gebruik XLSX voor zowel .xlsx als .csv
  const rijen = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });

  return rijen.map((rij) =>
    Object.fromEntries(
      Object.entries(rij).map(([k, v]) => [k.trim(), String(v ?? "").trim()]),
    ),
  );
}

function haal(rij: Record<string, string>, koppeling: Record<string, string>, veld: string): string {
  const bronkolom = koppeling[veld];
  if (!bronkolom) return "";
  return (rij[bronkolom] ?? "").trim();
}

function koppelLeverancier(rij: Record<string, string>, kop: Record<string, string>) {
  const naam = haal(rij, kop, "naam") || haal(rij, kop, "bedrijfsnaam") || haal(rij, kop, "company");
  return {
    naam: naam || "Onbekend",
    code: haal(rij, kop, "code") || null,
    adres: haal(rij, kop, "adres") || null,
    huisnummer: haal(rij, kop, "huisnummer") || null,
    postcode: haal(rij, kop, "postcode") || null,
    stad: haal(rij, kop, "stad") || haal(rij, kop, "plaats") || null,
    provincie: haal(rij, kop, "provincie") || null,
    land: haal(rij, kop, "land") || "Nederland",
    contactpersoon: haal(rij, kop, "contactpersoon") || haal(rij, kop, "contact") || null,
    contactFunctie: haal(rij, kop, "contact_functie") || null,
    contactEmail: haal(rij, kop, "contact_email") || null,
    contactTelefoon: haal(rij, kop, "contact_telefoon") || null,
    contactMobiel: haal(rij, kop, "contact_mobiel") || null,
    email: haal(rij, kop, "email") || null,
    telefoon: haal(rij, kop, "telefoon") || null,
    website: haal(rij, kop, "website") || null,
    kvkNummer: haal(rij, kop, "kvk_nummer") || haal(rij, kop, "kvk") || null,
    btwNummer: haal(rij, kop, "btw_nummer") || haal(rij, kop, "btw") || null,
    iban: haal(rij, kop, "iban") || null,
    bic: haal(rij, kop, "bic") || null,
    bankNaam: haal(rij, kop, "bank_naam") || null,
    tNamVan: haal(rij, kop, "t_nam_van") || null,
    betalingstermijnDagen: parseInt(haal(rij, kop, "betalingstermijn_dagen") || "30") || 30,
    kortingspercentage: null as number | null,
    categorie: haal(rij, kop, "categorie") || null,
    productcategorieen: haal(rij, kop, "productcategorieen") || null,
    notities: haal(rij, kop, "notities") || null,
    actief: true,
  };
}

function koppelKlant(rij: Record<string, string>, kop: Record<string, string>) {
  const naam = haal(rij, kop, "naam") || haal(rij, kop, "bedrijfsnaam") || haal(rij, kop, "company");
  const relatie = haal(rij, kop, "relatie_status") || haal(rij, kop, "relatiestatus");
  const geldigeRelatie = ["onbekend", "koud", "warm", "actief", "key_account", "verloren"] as const;
  type RelatieStatus = typeof geldigeRelatie[number];
  return {
    naam: naam || "Onbekend",
    type: haal(rij, kop, "type") || haal(rij, kop, "organisatietype") || "overig",
    kvk: haal(rij, kop, "kvk") || haal(rij, kop, "kvk_nummer") || null,
    adres: haal(rij, kop, "adres") || haal(rij, kop, "straat") || null,
    postcode: haal(rij, kop, "postcode") || null,
    stad: haal(rij, kop, "stad") || haal(rij, kop, "plaats") || null,
    regio: haal(rij, kop, "regio") || null,
    telefoon: haal(rij, kop, "telefoon") || null,
    email: haal(rij, kop, "email") || null,
    website: haal(rij, kop, "website") || null,
    linkedinUrl: haal(rij, kop, "linkedin_url") || haal(rij, kop, "linkedin") || null,
    branche: haal(rij, kop, "branche") || null,
    status: "prospect" as const,
    relatieStatus: (geldigeRelatie.includes(relatie as RelatieStatus) ? relatie : "onbekend") as RelatieStatus,
    opmerkingen: haal(rij, kop, "opmerkingen") || haal(rij, kop, "notities") || null,
  };
}

function koppelArtikel(rij: Record<string, string>, kop: Record<string, string>) {
  const prijs = parseFloat(haal(rij, kop, "inkoopprijs").replace(",", ".")) || null;
  const verkoop = parseFloat(haal(rij, kop, "verkoopprijs").replace(",", ".")) || null;
  return {
    code: haal(rij, kop, "code") || null,
    naam: haal(rij, kop, "naam") || "Onbekend",
    omschrijving: haal(rij, kop, "omschrijving") || null,
    eenheid: haal(rij, kop, "eenheid") || "st",
    categorie: haal(rij, kop, "categorie") || null,
    inkoopprijs: isNaN(prijs!) ? null : prijs,
    verkoopprijs: isNaN(verkoop!) ? null : verkoop,
    btwPercentage: parseInt(haal(rij, kop, "btw_percentage") || "21") || 21,
    leverancierId: null as number | null,
    notities: haal(rij, kop, "notities") || null,
    actief: true,
  };
}

function koppelMedewerker(rij: Record<string, string>, kop: Record<string, string>) {
  const naam = haal(rij, kop, "naam") || haal(rij, kop, "volledige_naam") || "Onbekend";
  const dienstverband = haal(rij, kop, "dienstverband") || "vast";
  const geldigDienstverband = ["vast", "tijdelijk", "oproep", "inhuur", "onderaannemer", "zzp"] as const;
  type Dienstverband = typeof geldigDienstverband[number];
  return {
    naam,
    email: haal(rij, kop, "email") || null,
    telefoon: haal(rij, kop, "telefoon") || null,
    mobiel: haal(rij, kop, "mobiel") || null,
    werkmaatschappij: haal(rij, kop, "werkmaatschappij") || "FPS Brandpreventie",
    dienstverband: (geldigDienstverband.includes(dienstverband as Dienstverband) ? dienstverband : "vast") as Dienstverband,
    inDienstSinds: haal(rij, kop, "in_dienst_sinds") || null,
    geboortedatum: haal(rij, kop, "geboortedatum") || null,
    adres: haal(rij, kop, "adres") || null,
    postcode: haal(rij, kop, "postcode") || null,
    woonplaats: haal(rij, kop, "woonplaats") || haal(rij, kop, "stad") || null,
    actief: (haal(rij, kop, "actief") || "ja").toLowerCase() !== "nee",
  };
}

function koppelGebouw(rij: Record<string, string>, kop: Record<string, string>) {
  return {
    naam: haal(rij, kop, "naam") || "Onbekend",
    adres: haal(rij, kop, "adres") || "",
    postcode: haal(rij, kop, "postcode") || null,
    stad: haal(rij, kop, "stad") || haal(rij, kop, "plaats") || null,
    omschrijving: haal(rij, kop, "omschrijving") || null,
    werknummer: haal(rij, kop, "werknummer") || null,
    projectnummer: haal(rij, kop, "projectnummer") || null,
    gebouwType: haal(rij, kop, "gebouw_type") || haal(rij, kop, "type") || null,
    aantalVerdiepingen: parseInt(haal(rij, kop, "aantal_verdiepingen") || "0") || null,
  };
}

function koppelEenheidsprijs(rij: Record<string, string>, kop: Record<string, string>) {
  const parseNum = (v: string) => parseFloat(v.replace(",", ".")) || 0;
  const GELDIGE_EENHEDEN = ["m2", "m1", "stuk", "uur", "set", "m3", "dag", "lm", "kg", "pst"];
  const GELDIGE_CATEGORIEEN = [
    "schilderwerk", "glas", "deuren_kozijnen", "timmerwerk", "elektrotechniek",
    "werktuigbouwkundig", "brandpreventie", "magazijn_kleinmateriaal", "algemeen_arbeid", "overig",
  ];
  const eenheid = haal(rij, kop, "eenheid") || "stuk";
  const categorie = haal(rij, kop, "categorie") || "overig";
  return {
    code: haal(rij, kop, "code"),
    omschrijving: haal(rij, kop, "omschrijving") || "Onbekend",
    categorie: GELDIGE_CATEGORIEEN.includes(categorie) ? categorie : "overig",
    eenheid: GELDIGE_EENHEDEN.includes(eenheid) ? eenheid : "stuk",
    materiaalcomponent: parseNum(haal(rij, kop, "materiaalcomponent")),
    arbeidscomponent: parseNum(haal(rij, kop, "arbeidscomponent")),
    normtijd: parseNum(haal(rij, kop, "normtijd")),
    kostprijs: parseNum(haal(rij, kop, "kostprijs")),
    verkoopprijs: parseNum(haal(rij, kop, "verkoopprijs")),
    marge: parseNum(haal(rij, kop, "marge")),
    btwCode: haal(rij, kop, "btw_code") || null,
    inclusies: haal(rij, kop, "inclusies") || null,
    exclusies: haal(rij, kop, "exclusies") || null,
    opmerkingen: haal(rij, kop, "opmerkingen") || null,
    actief: true,
  };
}

function koppelContactpersoon(rij: Record<string, string>, kop: Record<string, string>) {
  return {
    naam: haal(rij, kop, "naam") || "Onbekend",
    functie: haal(rij, kop, "functie") || null,
    email: haal(rij, kop, "email") || null,
    telefoon: haal(rij, kop, "telefoon") || null,
    mobiel: haal(rij, kop, "mobiel") || null,
    beslisrol: haal(rij, kop, "beslisrol") || "onbekend",
    opmerkingen: haal(rij, kop, "opmerkingen") || null,
  };
}

function koppelHistorischeFactuur(rij: Record<string, string>, kop: Record<string, string>) {
  const parseNum = (v: string) => {
    const n = parseFloat(v.replace(/\./g, "").replace(",", "."));
    return isNaN(n) ? null : String(n.toFixed(2));
  };
  const type = haal(rij, kop, "type") || "inkoop";
  return {
    type: (type === "verkoop" ? "verkoop" : "inkoop") as "inkoop" | "verkoop",
    factuurnummer: haal(rij, kop, "factuurnummer") || null,
    factuurdatum: haal(rij, kop, "factuurdatum") || null,
    vervaldatum: haal(rij, kop, "vervaldatum") || null,
    omschrijving: haal(rij, kop, "omschrijving") || null,
    relatienaam: haal(rij, kop, "relatienaam") || haal(rij, kop, "leverancier") || haal(rij, kop, "klant") || null,
    relatieCode: haal(rij, kop, "relatie_code") || haal(rij, kop, "debiteur_nr") || haal(rij, kop, "crediteur_nr") || null,
    bedragExclBtw: parseNum(haal(rij, kop, "bedrag_excl_btw") || haal(rij, kop, "nettobedrag")),
    btwBedrag: parseNum(haal(rij, kop, "btw_bedrag") || haal(rij, kop, "btw")),
    bedragInclBtw: parseNum(haal(rij, kop, "bedrag_incl_btw") || haal(rij, kop, "brutobedrag") || haal(rij, kop, "totaal")),
    btwCode: haal(rij, kop, "btw_code") || null,
    grootboekrekening: haal(rij, kop, "grootboekrekening") || haal(rij, kop, "gbl") || null,
    kostenplaats: haal(rij, kop, "kostenplaats") || null,
    dagboek: haal(rij, kop, "dagboek") || null,
    bestandsnaam: haal(rij, kop, "bestandsnaam") || null,
    betaalstatus: haal(rij, kop, "betaalstatus") || "betaald",
    status: "historisch",
  };
}

function koppelHistorischProject(rij: Record<string, string>, kop: Record<string, string>) {
  const aantVerdiepingen = parseInt(haal(rij, kop, "aantal_verdiepingen") || "0") || null;
  return {
    naam: haal(rij, kop, "naam") || haal(rij, kop, "projectnaam") || "Onbekend",
    adres: haal(rij, kop, "adres") || haal(rij, kop, "straat") || "",
    postcode: haal(rij, kop, "postcode") || null,
    stad: haal(rij, kop, "stad") || haal(rij, kop, "plaats") || null,
    werknummer: haal(rij, kop, "werknummer") || null,
    projectnummer: haal(rij, kop, "projectnummer") || null,
    omschrijving: haal(rij, kop, "omschrijving") || haal(rij, kop, "toelichting") || null,
    gebouwType: haal(rij, kop, "gebouw_type") || haal(rij, kop, "type") || null,
    aantalVerdiepingen: aantVerdiepingen,
    projectStatus: "historisch",
    gearchiveerd: false,
  };
}

// ── GET /import/template/:type ─────────────────────────────────────────────────
// Aanvulling IMPORT_01: een sjabloon is er alleen voor een type dat de
// gebruiker daadwerkelijk mag importeren.
router.get("/import/template/:type", async (req, res): Promise<void> => {
  const type = String(req.params["type"] ?? "");
  const fout = await importRechtFout(req, type);
  if (fout) return void res.status(fout.status).json({ error: fout.error });

  const TEMPLATE_KOLOMMEN: Record<string, string[]> = {
    leveranciers: ["naam", "code", "adres", "postcode", "stad", "contactpersoon", "email", "telefoon", "kvk_nummer", "categorie", "notities"],
    klanten: ["naam", "type", "kvk", "adres", "postcode", "stad", "telefoon", "email", "branche", "relatie_status"],
    artikelen: ["naam", "code", "omschrijving", "eenheid", "inkoopprijs", "verkoopprijs", "categorie"],
    medewerkers: ["naam", "email", "telefoon", "mobiel", "dienstverband", "in_dienst_sinds", "werkmaatschappij", "actief"],
    gebouwen: ["naam", "adres", "postcode", "stad", "gebouw_type", "aantal_verdiepingen", "werknummer", "omschrijving"],
    contactpersonen: ["naam", "functie", "email", "telefoon", "mobiel", "beslisrol", "opmerkingen"],
    magazijn_artikelen: ["naam", "code", "omschrijving", "eenheid", "inkoopprijs", "categorie"],
    eenheidsprijzen: ["code", "omschrijving", "categorie", "eenheid", "materiaalcomponent", "arbeidscomponent", "normtijd", "kostprijs", "verkoopprijs", "marge", "btw_code", "inclusies", "exclusies", "opmerkingen"],
    historische_facturen: ["factuurnummer", "type", "factuurdatum", "vervaldatum", "relatienaam", "relatie_code", "bedrag_excl_btw", "btw_bedrag", "bedrag_incl_btw", "btw_code", "grootboekrekening", "kostenplaats", "dagboek", "betaalstatus", "omschrijving", "bestandsnaam"],
    historische_projecten: ["naam", "werknummer", "projectnummer", "adres", "postcode", "stad", "gebouw_type", "aantal_verdiepingen", "omschrijving"],
  };

  const kolommen = TEMPLATE_KOLOMMEN[type];
  if (!kolommen) {
    return void res.status(400).json({ error: "Ongeldig importtype voor template" });
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([kolommen]);
  XLSX.utils.book_append_sheet(wb, ws, "Import");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="template_${type}.xlsx"`);
  return void res.send(buf);
});

logger.info("import router geladen");

export default router;
