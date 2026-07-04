import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
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
} from "@workspace/db";
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
  async (req, res): Promise<void> => {
    try {
      if (!req.file) return void res.status(400).json({ error: "Geen bestand ontvangen" });

      const type = String(req.body.type ?? "").trim();
      const geldige = ["leveranciers", "klanten", "artikelen", "projecten", "medewerkers", "gebouwen", "contactpersonen", "magazijn_artikelen", "eenheidsprijzen"];
      if (!geldige.includes(type)) {
        return void res.status(400).json({ error: "Ongeldig importtype" });
      }

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
router.post("/import/uitvoeren", async (req, res): Promise<void> => {
  try {
    const { bestand_id, type, kolomkoppeling, overslaan_lege_naam } = req.body as {
      bestand_id: string;
      type: string;
      kolomkoppeling: Record<string, string>; // ons veld → bestand kolom
      overslaan_lege_naam?: boolean;
    };

    const gecached = bestandCache.get(bestand_id);
    if (!gecached) {
      return void res.status(400).json({ error: "Bestand niet meer beschikbaar — upload opnieuw" });
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
    } else if (type === "medewerkers") {
      for (let i = 0; i < rijen.length; i++) {
        const rij = rijen[i]!;
        try {
          const naam = haal(rij, kolomkoppeling, "naam") || haal(rij, kolomkoppeling, "volledige_naam");
          if (!naam && overslaan_lege_naam !== false) { overgeslagen++; continue; }
          const values = koppelMedewerker(rij, kolomkoppeling);
          await db.insert(medewerkersTable).values(values);
          verwerkt++;
        } catch (err) {
          fouten.push({ rij: i + 2, fout: err instanceof Error ? err.message : "Onbekende fout" });
          overgeslagen++;
        }
      }
    } else if (type === "gebouwen") {
      for (let i = 0; i < rijen.length; i++) {
        const rij = rijen[i]!;
        try {
          const naam = haal(rij, kolomkoppeling, "naam");
          const adres = haal(rij, kolomkoppeling, "adres");
          if (!naam && overslaan_lege_naam !== false) { overgeslagen++; continue; }
          if (!adres) {
            fouten.push({ rij: i + 2, fout: "Adres is verplicht" });
            overgeslagen++;
            continue;
          }
          const values = koppelGebouw(rij, kolomkoppeling);
          await db.insert(gebouwenTable).values(values);
          verwerkt++;
        } catch (err) {
          fouten.push({ rij: i + 2, fout: err instanceof Error ? err.message : "Onbekende fout" });
          overgeslagen++;
        }
      }
    } else if (type === "contactpersonen") {
      for (let i = 0; i < rijen.length; i++) {
        const rij = rijen[i]!;
        try {
          const naam = haal(rij, kolomkoppeling, "naam");
          if (!naam && overslaan_lege_naam !== false) { overgeslagen++; continue; }
          const values = koppelContactpersoon(rij, kolomkoppeling);
          await db.insert(crmContactpersonenTable).values(values);
          verwerkt++;
        } catch (err) {
          fouten.push({ rij: i + 2, fout: err instanceof Error ? err.message : "Onbekende fout" });
          overgeslagen++;
        }
      }
    } else if (type === "magazijn_artikelen") {
      for (let i = 0; i < rijen.length; i++) {
        const rij = rijen[i]!;
        try {
          const values = koppelArtikel(rij, kolomkoppeling);
          if (!values.naam && overslaan_lege_naam !== false) { overgeslagen++; continue; }
          await db.insert(artikelenTable).values({ ...values, bron: "import", categorie: values.categorie || "magazijn" });
          verwerkt++;
        } catch (err) {
          fouten.push({ rij: i + 2, fout: err instanceof Error ? err.message : "Onbekende fout" });
          overgeslagen++;
        }
      }
    } else if (type === "eenheidsprijzen") {
      for (let i = 0; i < rijen.length; i++) {
        const rij = rijen[i]!;
        try {
          const values = koppelEenheidsprijs(rij, kolomkoppeling);
          if (!values.code || !values.omschrijving) { overgeslagen++; continue; }
          await db.insert(eenheidsprijzenTable).values(values).onConflictDoNothing();
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
router.get("/import/logs", async (req, res): Promise<void> => {
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

// ── GET /import/template/:type ─────────────────────────────────────────────────
router.get("/import/template/:type", (req, res) => {
  const type = req.params.type;

  const TEMPLATE_KOLOMMEN: Record<string, string[]> = {
    leveranciers: ["naam", "code", "adres", "postcode", "stad", "contactpersoon", "email", "telefoon", "kvk_nummer", "categorie", "notities"],
    klanten: ["naam", "type", "kvk", "adres", "postcode", "stad", "telefoon", "email", "branche", "relatie_status"],
    artikelen: ["naam", "code", "omschrijving", "eenheid", "inkoopprijs", "verkoopprijs", "categorie"],
    medewerkers: ["naam", "email", "telefoon", "mobiel", "dienstverband", "in_dienst_sinds", "werkmaatschappij", "actief"],
    gebouwen: ["naam", "adres", "postcode", "stad", "gebouw_type", "aantal_verdiepingen", "werknummer", "omschrijving"],
    contactpersonen: ["naam", "functie", "email", "telefoon", "mobiel", "beslisrol", "opmerkingen"],
    magazijn_artikelen: ["naam", "code", "omschrijving", "eenheid", "inkoopprijs", "categorie"],
    eenheidsprijzen: ["code", "omschrijving", "categorie", "eenheid", "materiaalcomponent", "arbeidscomponent", "normtijd", "kostprijs", "verkoopprijs", "marge", "btw_code", "inclusies", "exclusies", "opmerkingen"],
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
