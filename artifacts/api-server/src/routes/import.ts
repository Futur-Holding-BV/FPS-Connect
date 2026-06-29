import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { db, leveranciersTable, artikelenTable, importLogsTable, crmKlantenTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { randomUUID } from "crypto";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ── In-memory cache voor geüploade bestanden ───────────────────────────────────
// bestand_id → { rijen: Record<string,string>[], bestandsnaam: string, type: string }
const bestandCache = new Map<string, {
  rijen: Record<string, string>[];
  bestandsnaam: string;
  type: string;
}>();

// Cache 30 min bewaren, daarna automatisch verwijderen
function cacheBestand(id: string, data: typeof bestandCache extends Map<string, infer V> ? V : never) {
  bestandCache.set(id, data);
  setTimeout(() => bestandCache.delete(id), 30 * 60 * 1000);
}

// ── POST /import/preview ───────────────────────────────────────────────────────
router.post(
  "/import/preview",
  upload.single("bestand"),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "Geen bestand ontvangen" });

      const type = String(req.body.type ?? "").trim();
      const geldige = ["leveranciers", "klanten", "artikelen", "projecten"];
      if (!geldige.includes(type)) {
        return res.status(400).json({ error: "Ongeldig importtype" });
      }

      const rijen = parseBestand(req.file);
      if (rijen.length === 0) {
        return res.status(400).json({ error: "Bestand bevat geen data-rijen" });
      }

      const kolommen = Object.keys(rijen[0] ?? {});
      const voorbeeldRijen = rijen.slice(0, 20);
      const bestandId = randomUUID();

      cacheBestand(bestandId, {
        rijen,
        bestandsnaam: req.file.originalname,
        type,
      });

      res.json({
        kolommen,
        rijen: voorbeeldRijen,
        totaal_rijen: rijen.length,
        bestand_id: bestandId,
      });
    } catch (err) {
      req.log.error({ err }, "import preview mislukt");
      res.status(500).json({ error: "Fout bij verwerken bestand" });
    }
  },
);

// ── POST /import/uitvoeren ────────────────────────────────────────────────────
router.post("/import/uitvoeren", async (req, res) => {
  try {
    const { bestand_id, type, kolomkoppeling, overslaan_lege_naam } = req.body as {
      bestand_id: string;
      type: string;
      kolomkoppeling: Record<string, string>; // ons veld → bestand kolom
      overslaan_lege_naam?: boolean;
    };

    const gecached = bestandCache.get(bestand_id);
    if (!gecached) {
      return res.status(400).json({ error: "Bestand niet meer beschikbaar — upload opnieuw" });
    }

    const { rijen, bestandsnaam } = gecached;
    const fouten: { rij: number; fout: string }[] = [];
    let verwerkt = 0;
    let overgeslagen = 0;
    const userId = req.session?.userId ?? null;

    if (type === "leveranciers") {
      for (let i = 0; i < rijen.length; i++) {
        const rij = rijen[i]!;
        try {
          const values = koppelLeverancier(rij, kolomkoppeling);
          if (!values.naam && overslaan_lege_naam !== false) {
            overgeslagen++;
            continue;
          }
          await db.insert(leveranciersTable).values({ ...values, bron: "import" });
          verwerkt++;
        } catch (err) {
          fouten.push({ rij: i + 2, fout: err instanceof Error ? err.message : "Onbekende fout" });
          overgeslagen++;
        }
      }
    } else if (type === "artikelen") {
      for (let i = 0; i < rijen.length; i++) {
        const rij = rijen[i]!;
        try {
          const values = koppelArtikel(rij, kolomkoppeling);
          if (!values.naam && overslaan_lege_naam !== false) {
            overgeslagen++;
            continue;
          }
          await db.insert(artikelenTable).values({ ...values, bron: "import" });
          verwerkt++;
        } catch (err) {
          fouten.push({ rij: i + 2, fout: err instanceof Error ? err.message : "Onbekende fout" });
          overgeslagen++;
        }
      }
    } else if (type === "klanten") {
      for (let i = 0; i < rijen.length; i++) {
        const rij = rijen[i]!;
        try {
          const values = koppelKlant(rij, kolomkoppeling);
          if (!values.naam && overslaan_lege_naam !== false) {
            overgeslagen++;
            continue;
          }
          await db.insert(crmKlantenTable).values(values);
          verwerkt++;
        } catch (err) {
          fouten.push({ rij: i + 2, fout: err instanceof Error ? err.message : "Onbekende fout" });
          overgeslagen++;
        }
      }
    } else {
      // projecten: toekomstige implementatie
      overgeslagen = rijen.length;
      fouten.push({ rij: 0, fout: `Import van '${type}' is nog niet beschikbaar in deze versie` });
    }

    // Log opslaan
    const [log] = await db
      .insert(importLogsTable)
      .values({
        type,
        bestandsnaam,
        rijenTotaal: rijen.length,
        rijenVerwerkt: verwerkt,
        rijenOvergeslagen: overgeslagen,
        fouten: fouten as unknown as typeof importLogsTable.$inferInsert["fouten"],
        gebruikerId: userId,
      })
      .returning();

    bestandCache.delete(bestand_id);

    res.json({
      type,
      rijen_totaal: rijen.length,
      rijen_verwerkt: verwerkt,
      rijen_overgeslagen: overgeslagen,
      fouten,
      log_id: log?.id ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "import uitvoeren mislukt");
    res.status(500).json({ error: "Fout bij importeren" });
  }
});

// ── GET /import/logs ──────────────────────────────────────────────────────────
router.get("/import/logs", async (req, res) => {
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
        fouten: l.fouten ?? [],
        aangemaakt_op: l.aangemaaktOp.toISOString(),
      })),
    );
  } catch (err) {
    req.log.error({ err }, "import logs ophalen mislukt");
    res.status(500).json({ error: "Fout bij ophalen import-logs" });
  }
});

// ── Hulpfuncties ──────────────────────────────────────────────────────────────

function parseBestand(file: Express.Multer.File): Record<string, string>[] {
  const naam = file.originalname.toLowerCase();
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

logger.info("import router geladen");

export default router;
