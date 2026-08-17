// Module Calculatie routes — /api/modules/calculaties/*
// V2.1: ABK, uitgebreide regelkolommen (MU, arbeid, onderaanneming), staartkosten, 3 weergaven.
import { Router } from "express";
import {
  db,
  modCalcHeadersTable,
  modCalcRegelsTable,
  modCalcTarievenTable,
  modCalcNormtijdenTable,
  modCalcLeveranciersTable,
  modCalcArtekelenTable,
  modCalcVersiesTable,
  modCalcInkoopItemsTable,
  modCalcAdviezenTable,
  modCalcEenhedenTable,
  modCalcPlakAnalysesTable,
  aiVeldCorrectiesTable,
  gebouwenTable,
  gebruikersTable,
  voorzieningenTable,
  voorzieningLabelsTable,
  labelsTable,
  opnamesTable,
  opnameItemsTable,
  offertesTable,
  offerteRegelsTable,
  prijsafsprakenTable,
  leveranciersTable,
  documentenTable,
  documentKoppelingenTable,
  werkgeversTable,
  documentStudioModellenTable,
  medewerkersTable,
} from "@workspace/db";
import { isNull, lte, gte, inArray } from "drizzle-orm";
import { eq, desc, asc, ilike, or, count, sql, and } from "drizzle-orm";
import multer from "multer";
import { requireBevoegdheid, requireRol } from "../middlewares/auth";
// CALC_KERN_01: dé ene rekenkern — server en scherm rekenen allebei via @workspace/calculatie.
import {
  berekenTotalen as kernBerekenTotalen,
  berekenRegelBedragen,
  teltMeeRegel,
  rond2,
  type KernRegel,
} from "@workspace/calculatie";
import { aiGateway, heeftGateway } from "../lib/aiGateway";
import { bouwEigenCijfersContext } from "../lib/calculatieEigenCijfers";
import { CALCULATIE_CHAT_BASE_PROMPT, CALCULATIE_ANALYSE_BASE_PROMPT, CALCULATIE_VULLEN_BASE_PROMPT, CALCULATIE_INKOOP_MAIL_PROMPT, CALCULATIE_PLAK_HERKEN_PROMPT, CALCULATIE_PLAK_KOPPEL_PROMPT, CALCULATIE_ADVIES_PUNTEN_PROMPT, CALCULATIE_ADVIES_KOPPEL_PROMPT } from "../lib/aiPrompts";
import { haalPlakInvoerBeeld } from "../lib/documentIntelligence";
import { extraheerPdfTekst } from "../lib/pdfTekst";
import { renderPdfPaginas, resizeAfbeelding } from "../lib/pdfVisie";
import { ObjectStorageService } from "../lib/objectStorage";
import { resolveWerkgeverLogoSubPath } from "../lib/werkgever-logo-pad";
import { bouwInkoopEigenCijfersContext, haalInkoopHistorie } from "../lib/inkoopEigenCijfers";
import { kenmerkVoorModCalc } from "../lib/kenmerk";
import { vindGeldigeAfspraak } from "../services/prijsAfspraken";

const router = Router();
const iso = (d: Date) => d.toISOString();

// CALC_INVOER_01: geplakt bestand (schermafdruk/productblad) via multipart.
// Allowlist op MIME-type; de echte inhoud wordt daarna nog magic-byte-gecontroleerd.
const PLAK_TOEGESTANE_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const plakUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (PLAK_TOEGESTANE_MIMES.has(file.mimetype)) return cb(null, true);
    cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", file.fieldname));
  },
});

// Magic-byte-controle: valideert dat de buffer echt het opgegeven type is.
// Voorkomt dat een omgedoopt/gespooft bestand alsnog verwerkt wordt.
function detecteerBestandssoort(buf: Buffer): "image/jpeg" | "image/png" | "image/webp" | "application/pdf" | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) return "image/webp";
  if (buf.length >= 5 && buf.toString("ascii", 0, 5) === "%PDF-") return "application/pdf";
  return null;
}

// Wrapt de multer-middleware zodat upload-fouten nette statuscodes geven
// (413 bij te groot, 400 bij onverwacht/verkeerd veld) i.p.v. een generieke 500.
function plakUploadMiddleware(req: import("express").Request, res: import("express").Response, next: import("express").NextFunction): void {
  plakUpload.single("bestand")(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return void res.status(413).json({ error: "Bestand is te groot (max 20 MB)." });
      }
      if (err.code === "LIMIT_UNEXPECTED_FILE") {
        return void res.status(400).json({ error: "Ongeldig of niet-toegestaan bestand. Alleen JPEG, PNG, WEBP of PDF." });
      }
      return void res.status(400).json({ error: "Uploadfout." });
    }
    if (err) return void res.status(400).json({ error: "Uploadfout." });
    next();
  });
}

const lezenCalc = requireBevoegdheid("calculaties", 1);
const schrijvenCalc = requireBevoegdheid("calculaties", 2);
const aanmakenCalc = requireBevoegdheid("calculaties", 3);
const verwijderenCalc = requireBevoegdheid("calculaties", 4);

function parseId(v: unknown): number {
  return parseInt(String(v), 10);
}

type RegelCalcInput = {
  hoeveelheid: number;
  tarief: number;
  muPerEenheid: number;
  arbeidsTarief: number;
  onderaannemingBedrag: number;
  isStaartkosten: boolean;
  isBouwplaatskosten: boolean;
  totaal: number;
  // ADVIES_01 §6: soort/optioneel bepalen of een regel meetelt.
  soort?: string;
  optioneel?: boolean;
};

// ADVIES_01 §3/§6: alleen 'regel' en 'materiaal' tellen mee in het totaal.
// tekst/kop tellen nooit mee; stelpost is zichtbaar met bedrag maar telt niet mee.
// CALC_KERN_01: de regelsoort-semantiek leeft in @workspace/calculatie.
function teltMee(r: { soort?: string | null }): boolean {
  return teltMeeRegel(r);
}

/** CALC_KERN_01: camelCase DB-regel → kern-invoer (snake_case). */
function naarKernRegel(r: RegelCalcInput): KernRegel {
  return {
    soort: r.soort ?? "regel",
    optioneel: r.optioneel ?? false,
    is_staartkosten: r.isStaartkosten,
    is_bouwplaatskosten: r.isBouwplaatskosten,
    hoeveelheid: r.hoeveelheid,
    tarief: r.tarief,
    mu_per_eenheid: r.muPerEenheid,
    arbeids_tarief: r.arbeidsTarief,
    onderaanneming_bedrag: r.onderaannemingBedrag,
  };
}

/**
 * CALC_KERN_01: dunne wrapper om de gedeelde rekenkern, met de camelCase
 * headervelden zoals de routes die aanleveren. Alle rekenwerk (regelsoorten,
 * optioneel, opslagen incl. vaste-bedragvariant, korting, afronding) zit in
 * @workspace/calculatie — hier wordt niets meer zelf gerekend.
 */
export function berekenTotalen(
  regels: RegelCalcInput[],
  header: {
    opslagMateriaal: number;
    opslagArbeid: number;
    opslagAk: number;
    opslagAbk: number;
    opslagRisico: number;
    opslagWinst: number;
    korting: number;
    akIsVast?: boolean;
    abkIsVast?: boolean;
    risicoIsVast?: boolean;
    winstIsVast?: boolean;
  },
) {
  const t = kernBerekenTotalen(regels.map(naarKernRegel), {
    opslag_materiaal: header.opslagMateriaal,
    opslag_arbeid: header.opslagArbeid,
    opslag_ak: header.opslagAk,
    opslag_abk: header.opslagAbk,
    opslag_risico: header.opslagRisico,
    opslag_winst: header.opslagWinst,
    korting: header.korting,
    ak_is_vast: header.akIsVast ?? false,
    abk_is_vast: header.abkIsVast ?? false,
    risico_is_vast: header.risicoIsVast ?? false,
    winst_is_vast: header.winstIsVast ?? false,
  });
  return {
    subtotaal: t.subtotaal,
    totaal_na_opslagen: t.totaal_na_opslagen,
    optioneel_totaal: t.optioneel_totaal,
    // Volledige uitsplitsing voor routes die meer nodig hebben (print-data).
    kern: t,
  };
}

function mapHeader(
  h: typeof modCalcHeadersTable.$inferSelect,
  extra?: {
    gebouwNaam?: string | null;
    opnameNaam?: string | null;
    aangemaaktDoorNaam?: string | null;
    subtotaal?: number;
    totaalNaOpslagen?: number;
    kenmerk?: string | null;
  },
) {
  return {
    id: h.id,
    naam: h.naam,
    // NUMMER_01: C-nummer uit de gedeelde reeks + berekend kenmerk
    nummer: h.nummer,
    kenmerk: extra?.kenmerk ?? null,
    gekopieerd_van_id: h.gekopieerdVanId ?? null,
    verzonden_op: h.verzondenOp ? iso(h.verzondenOp) : null,
    referentie: h.referentie,
    klant_naam: h.klantNaam,
    gebouw_id: h.gebouwId,
    gebouw_naam: extra?.gebouwNaam ?? null,
    opname_id: h.opnameId ?? null,
    opname_naam: extra?.opnameNaam ?? null,
    project_naam: h.projectNaam,
    werknummer: h.werknummer ?? null,
    status: h.status,
    omschrijving: h.omschrijving,
    opmerkingen: h.opmerkingen,
    opslag_materiaal: h.opslagMateriaal ?? 0,
    opslag_arbeid: h.opslagArbeid ?? 0,
    opslag_ak: h.opslagAk,
    opslag_abk: h.opslagAbk ?? 10,
    opslag_risico: h.opslagRisico,
    opslag_winst: h.opslagWinst,
    korting: h.korting,
    ak_is_vast: h.akIsVast ?? false,
    abk_is_vast: h.abkIsVast ?? false,
    risico_is_vast: h.risicoIsVast ?? false,
    winst_is_vast: h.winstIsVast ?? false,
    subtotaal: extra?.subtotaal ?? 0,
    totaal_na_opslagen: extra?.totaalNaOpslagen ?? 0,
    aangemaakt_door_naam: extra?.aangemaaktDoorNaam ?? null,
    aangemaakt_op: iso(h.aangemaaktOp),
    bijgewerkt_op: iso(h.bijgewerktOp),
  };
}

// Groepsgrens van een calculatieregel: sectie (bouwplaats/staart), eenheid en
// hoofdstuk. Een materiaalkind moet in dezelfde groep zitten als zijn ouder,
// anders zou herschikken het kind over een hoofdstuk-/eenheidgrens meeslepen.
function calcRegelGroep(r: { isStaartkosten: boolean | null; isBouwplaatskosten: boolean | null; eenheidId: number | null; hoofdstuk: string | null }): string {
  return r.isStaartkosten ? "staart"
    : r.isBouwplaatskosten ? "bouwplaats"
    : `direct|${r.eenheidId ?? ""}|${r.hoofdstuk ?? "Overige werkzaamheden"}`;
}

function mapRegel(r: typeof modCalcRegelsTable.$inferSelect, normtijdCode?: string | null) {
  const hv = r.hoeveelheid ?? 0;
  const t  = r.tarief ?? 0;
  const mu = (r as any).muPerEenheid ?? 0;
  const at = (r as any).arbeidsTarief ?? 0;
  const ob = (r as any).onderaannemingBedrag ?? 0;
  // CALC_KERN_01: per-regel bedragen via de gedeelde rekenkern.
  const bedragen = berekenRegelBedragen({
    soort: (r as any).soort ?? "regel",
    hoeveelheid: hv, tarief: t, mu_per_eenheid: mu, arbeids_tarief: at,
    onderaanneming_bedrag: ob,
  });
  const materiaalTotaal = bedragen.materiaal_totaal;
  const muTotaal        = bedragen.mu_totaal;
  const arbeidsloon     = bedragen.arbeidsloon;
  return {
    id: r.id,
    calculatie_id: r.calculatieId,
    eenheid_id: (r as any).eenheidId ?? null,
    categorie: r.categorie,
    omschrijving: r.omschrijving,
    normtijd_id: r.normtijdId,
    normtijd_code: normtijdCode ?? null,
    eenheid: r.eenheid,
    hoeveelheid: hv,
    tarief: t,
    // CALC_KERN_01: het getoonde regeltotaal komt uit de kern (natelbaar),
    // niet uit de opgeslagen kolom — die kan door oude schrijfpaden afwijken.
    totaal: bedragen.totaal,
    volgorde: r.volgorde,
    opmerkingen: r.opmerkingen,
    regelnummer: (r as any).regelnummer ?? null,
    mu_per_eenheid: mu,
    arbeids_tarief: at,
    onderaanneming_bedrag: ob,
    is_staartkosten: r.isStaartkosten ?? false,
    is_bouwplaatskosten: r.isBouwplaatskosten ?? false,
    hoofdstuk: r.hoofdstuk ?? "Overige werkzaamheden",
    klanttekst: (r as any).klanttekst ?? null,
    btw_tarief: (r as any).btwTarief ?? "21",
    soort: (r as any).soort ?? "regel",
    optioneel: (r as any).optioneel ?? false,
    ouder_regel_id: (r as any).ouderRegelId ?? null,
    materiaal_totaal: materiaalTotaal,
    mu_totaal: muTotaal,
    arbeidsloon,
    wand_plafond: (r as any).wandPlafond ?? null,
    toepassing_tekst: (r as any).toepassingTekst ?? null,
  };
}

function berekenRegelTotaal(body: Record<string, unknown>, existing?: {
  hoeveelheid: number; tarief: number; muPerEenheid?: number; arbeidsTarief?: number; onderaannemingBedrag?: number; soort?: string | null;
}) {
  // ADVIES_01 §6: soort bepaalt hoe de regel gerekend wordt.
  const soort = body.soort !== undefined ? String(body.soort) : (existing?.soort ?? "regel");

  // tekst/kop: geen bedragen. Totaal 0, materiaal/mu/arbeid leeg.
  if (soort === "tekst" || soort === "kop") {
    return { hv: 0, t: 0, mu: 0, at: 0, ob: 0, totaal: 0 };
  }

  // stelpost: het bedrag wordt WEL opgeslagen in tarief/totaal van de regel zelf,
  // maar telt niet mee in het calculatietotaal (gefilterd in berekenTotalen).
  if (soort === "stelpost") {
    const t = body.tarief !== undefined ? Number(body.tarief) : (existing?.tarief ?? 0);
    return { hv: 1, t, mu: 0, at: 0, ob: 0, totaal: rond2(t) };
  }

  const hv = body.hoeveelheid !== undefined ? Number(body.hoeveelheid) : (existing?.hoeveelheid ?? 0);
  const t  = body.tarief !== undefined ? Number(body.tarief) : (existing?.tarief ?? 0);
  const mu = body.mu_per_eenheid !== undefined ? Number(body.mu_per_eenheid) : ((existing as any)?.muPerEenheid ?? 0);
  const at = body.arbeids_tarief !== undefined ? Number(body.arbeids_tarief) : ((existing as any)?.arbeidsTarief ?? 0);
  const ob = body.onderaanneming_bedrag !== undefined ? Number(body.onderaanneming_bedrag) : ((existing as any)?.onderaannemingBedrag ?? 0);
  // CALC_KERN_01: het regeltotaal komt uit de gedeelde rekenkern.
  const { totaal } = berekenRegelBedragen({
    soort, hoeveelheid: hv, tarief: t, mu_per_eenheid: mu,
    arbeids_tarief: at, onderaanneming_bedrag: ob,
  });
  return { hv, t, mu, at, ob, totaal };
}

// ── Tarieven ───────────────────────────────────────────────────────────────

router.post("/modules/calculaties/synchroniseer-standaard", requireRol("hoofdbeheerder"), async (req, res): Promise<void> => {
  try {
    const STANDAARD_TARIEVEN = [
      { naam: "Monteur junior", tarief: 47.50, eenheid: "uur", categorie: "arbeid" },
      { naam: "Monteur medior", tarief: 57.50, eenheid: "uur", categorie: "arbeid" },
      { naam: "Monteur senior", tarief: 67.50, eenheid: "uur", categorie: "arbeid" },
      { naam: "Uitvoerder", tarief: 77.50, eenheid: "uur", categorie: "arbeid" },
      { naam: "Projectleider", tarief: 87.50, eenheid: "uur", categorie: "arbeid" },
      { naam: "Klein materieel", tarief: 7.50, eenheid: "uur", categorie: "materieel" },
      { naam: "Hoogwerker / Klimmaterieel", tarief: 22.50, eenheid: "uur", categorie: "materieel" },
    ];

    const STANDAARD_NORMTIJDEN = [
      { code: "DOORV", omschrijving: "Brandwerende doorvoering", muPerEenheid: 0.25, eenheid: "st", categorie: "brandwerende afdichting" },
      { code: "DEUR", omschrijving: "Brandwerende deur", muPerEenheid: 1.50, eenheid: "st", categorie: "bouwkundig" },
      { code: "KLEP", omschrijving: "Brandklep", muPerEenheid: 0.50, eenheid: "st", categorie: "installatietechnisch" },
      { code: "MANCH", omschrijving: "Brandmanchet", muPerEenheid: 0.15, eenheid: "st", categorie: "brandwerende afdichting" },
      { code: "PVC", omschrijving: "PVC doorvoering", muPerEenheid: 0.25, eenheid: "st", categorie: "brandwerende afdichting" },
      { code: "COAT", omschrijving: "Brandwerende coating", muPerEenheid: 0.08, eenheid: "m2", categorie: "brandwerende afdichting" },
      { code: "KIT", omschrijving: "Brandwerende kit", muPerEenheid: 0.06, eenheid: "m1", categorie: "brandwerende afdichting" },
      { code: "GLAS", omschrijving: "Brandwerende beglazing", muPerEenheid: 2.00, eenheid: "st", categorie: "bouwkundig" },
      { code: "INSP", omschrijving: "Inspectie", muPerEenheid: 0.50, eenheid: "st", categorie: "inspectie" },
      { code: "AFDICHT", omschrijving: "Brandwerende afdichting", muPerEenheid: 0.20, eenheid: "st", categorie: "brandwerende afdichting" },
      { code: "SCHUIM", omschrijving: "Brandwerend schuim", muPerEenheid: 0.10, eenheid: "st", categorie: "brandwerende afdichting" },
      { code: "PLAAT", omschrijving: "Brandwerende plaat", muPerEenheid: 0.30, eenheid: "m2", categorie: "brandwerende afdichting" },
      { code: "STOPV", omschrijving: "Brandwerende stopverf", muPerEenheid: 0.12, eenheid: "st", categorie: "brandwerende afdichting" },
      { code: "HOUDER", omschrijving: "Kabelhouder brandwerend", muPerEenheid: 0.10, eenheid: "st", categorie: "brandwerende afdichting" },
    ];

    let tarievenToegevoegd = 0;
    let normtijdenToegevoegd = 0;

    // Synchroniseer tarieven
    const bestaandeTarieven = await db.select().from(modCalcTarievenTable);
    const bestaandeTarievenNamen = new Set(bestaandeTarieven.map(t => t.naam));
    for (const t of STANDAARD_TARIEVEN) {
      if (!bestaandeTarievenNamen.has(t.naam)) {
        await db.insert(modCalcTarievenTable).values(t);
        tarievenToegevoegd++;
      }
    }

    // Synchroniseer normtijden
    const bestaandeNormtijden = await db.select().from(modCalcNormtijdenTable);
    const bestaandeNormtijdenCodes = new Set(bestaandeNormtijden.map(n => n.code));
    for (const n of STANDAARD_NORMTIJDEN) {
      if (!bestaandeNormtijdenCodes.has(n.code)) {
        await db.insert(modCalcNormtijdenTable).values(n);
        normtijdenToegevoegd++;
      }
    }

    res.json({
      tarieven_toegevoegd: tarievenToegevoegd,
      normtijden_toegevoegd: normtijdenToegevoegd,
    });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout bij synchroniseren standaard data" });
  }
});

router.get("/modules/calculaties/tarieven", lezenCalc, async (req, res): Promise<void> => {
  try {
    const rows = await db.select().from(modCalcTarievenTable)
      .where(eq(modCalcTarievenTable.actief, true))
      .orderBy(asc(modCalcTarievenTable.categorie), asc(modCalcTarievenTable.naam));
    res.json(rows.map((r) => ({
      id: r.id, naam: r.naam, tarief: r.tarief, eenheid: r.eenheid,
      categorie: r.categorie, actief: r.actief,
    })));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.post("/modules/calculaties/tarieven", schrijvenCalc, async (req, res): Promise<void> => {
  try {
    const { naam, tarief, eenheid = "uur", categorie = "arbeid" } = req.body as Record<string, unknown>;
    if (!naam) return void res.status(400).json({ error: "naam is verplicht" });
    const [row] = await db.insert(modCalcTarievenTable).values({
      naam: String(naam), tarief: Number(tarief ?? 0), eenheid: String(eenheid), categorie: String(categorie),
    }).returning();
    res.status(201).json({ id: row.id, naam: row.naam, tarief: row.tarief, eenheid: row.eenheid, categorie: row.categorie, actief: row.actief });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.patch("/modules/calculaties/tarieven/:id", schrijvenCalc, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params["id"]);
    const body = req.body as Record<string, unknown>;
    const update: Partial<typeof modCalcTarievenTable.$inferInsert> = { bijgewerktOp: new Date() };
    if (body.naam !== undefined) update.naam = String(body.naam);
    if (body.tarief !== undefined) update.tarief = Number(body.tarief);
    if (body.eenheid !== undefined) update.eenheid = String(body.eenheid);
    if (body.categorie !== undefined) update.categorie = String(body.categorie);
    if (body.actief !== undefined) update.actief = Boolean(body.actief);
    const [row] = await db.update(modCalcTarievenTable).set(update).where(eq(modCalcTarievenTable.id, id)).returning();
    if (!row) return void res.status(404).json({ error: "Niet gevonden" });
    res.json({ id: row.id, naam: row.naam, tarief: row.tarief, eenheid: row.eenheid, categorie: row.categorie, actief: row.actief });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.delete("/modules/calculaties/tarieven/:id", verwijderenCalc, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params["id"]);
    await db.delete(modCalcTarievenTable).where(eq(modCalcTarievenTable.id, id));
    res.status(204).end();
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── Normtijden ─────────────────────────────────────────────────────────────

router.get("/modules/calculaties/normtijden", lezenCalc, async (req, res): Promise<void> => {
  try {
    const rows = await db.select().from(modCalcNormtijdenTable)
      .where(eq(modCalcNormtijdenTable.actief, true))
      .orderBy(asc(modCalcNormtijdenTable.categorie), asc(modCalcNormtijdenTable.code));
    res.json(rows.map((r) => ({
      id: r.id, code: r.code, omschrijving: r.omschrijving, categorie: r.categorie,
      eenheid: r.eenheid, uren_per_eenheid: r.urenPerEenheid, actief: r.actief,
    })));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.post("/modules/calculaties/normtijden", schrijvenCalc, async (req, res): Promise<void> => {
  try {
    const { code, omschrijving, categorie = "brandwerende afdichting", eenheid = "st", uren_per_eenheid = 0 } =
      req.body as Record<string, unknown>;
    if (!code || !omschrijving) return void res.status(400).json({ error: "code en omschrijving zijn verplicht" });
    const [row] = await db.insert(modCalcNormtijdenTable).values({
      code: String(code), omschrijving: String(omschrijving), categorie: String(categorie),
      eenheid: String(eenheid), urenPerEenheid: Number(uren_per_eenheid),
    }).returning();
    res.status(201).json({ id: row.id, code: row.code, omschrijving: row.omschrijving,
      categorie: row.categorie, eenheid: row.eenheid, uren_per_eenheid: row.urenPerEenheid, actief: row.actief });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── Calculatie headers ─────────────────────────────────────────────────────

router.get("/modules/calculaties", lezenCalc, async (req, res): Promise<void> => {
  try {
    const { status, zoek } = req.query as Record<string, string>;

    const rows = await db
      .select({
        header: modCalcHeadersTable,
        gebouwNaam: gebouwenTable.naam,
        opnameNaam: opnamesTable.naam,
        makerNaam: gebruikersTable.naam,
      })
      .from(modCalcHeadersTable)
      .leftJoin(gebouwenTable, eq(modCalcHeadersTable.gebouwId, gebouwenTable.id))
      .leftJoin(opnamesTable, eq(modCalcHeadersTable.opnameId, opnamesTable.id))
      .leftJoin(gebruikersTable, eq(modCalcHeadersTable.aangemaaktDoorId, gebruikersTable.id))
      .orderBy(desc(modCalcHeadersTable.aangemaaktOp));

    const allRegels = await db.select({
      cid: modCalcRegelsTable.calculatieId,
      totaal: modCalcRegelsTable.totaal,
      hoeveelheid: modCalcRegelsTable.hoeveelheid,
      tarief: modCalcRegelsTable.tarief,
      muPerEenheid: modCalcRegelsTable.muPerEenheid,
      arbeidsTarief: modCalcRegelsTable.arbeidsTarief,
      onderaannemingBedrag: modCalcRegelsTable.onderaannemingBedrag,
      isStaartkosten: modCalcRegelsTable.isStaartkosten,
      isBouwplaatskosten: modCalcRegelsTable.isBouwplaatskosten,
      soort: modCalcRegelsTable.soort,
      optioneel: modCalcRegelsTable.optioneel,
    }).from(modCalcRegelsTable);

    const regelsByCalc = new Map<number, RegelCalcInput[]>();
    for (const r of allRegels) {
      if (!regelsByCalc.has(r.cid)) regelsByCalc.set(r.cid, []);
      regelsByCalc.get(r.cid)!.push({
        hoeveelheid: r.hoeveelheid,
        tarief: r.tarief,
        muPerEenheid: r.muPerEenheid,
        arbeidsTarief: r.arbeidsTarief,
        onderaannemingBedrag: r.onderaannemingBedrag,
        isStaartkosten: r.isStaartkosten,
        isBouwplaatskosten: r.isBouwplaatskosten,
        totaal: r.totaal,
        soort: r.soort,
        optioneel: r.optioneel,
      });
    }

    let resultaten = rows;
    if (status) resultaten = resultaten.filter((r) => r.header.status === status);
    if (zoek) {
      const q = zoek.toLowerCase();
      resultaten = resultaten.filter((r) =>
        r.header.naam.toLowerCase().includes(q) ||
        (r.header.klantNaam ?? "").toLowerCase().includes(q) ||
        (r.header.projectNaam ?? "").toLowerCase().includes(q)
      );
    }

    res.json(await Promise.all(resultaten.map(async ({ header, gebouwNaam, opnameNaam, makerNaam }) => {
      const calcRegels = regelsByCalc.get(header.id) ?? [];
      const { subtotaal, totaal_na_opslagen } = berekenTotalen(calcRegels, {
        opslagMateriaal: header.opslagMateriaal ?? 0,
        opslagArbeid: header.opslagArbeid ?? 0,
        opslagAk: header.opslagAk,
        opslagAbk: header.opslagAbk ?? 10,
        opslagRisico: header.opslagRisico,
        opslagWinst: header.opslagWinst,
        korting: header.korting,
        akIsVast: header.akIsVast ?? false,
        abkIsVast: header.abkIsVast ?? false,
        risicoIsVast: header.risicoIsVast ?? false,
        winstIsVast: header.winstIsVast ?? false,
      });
      return mapHeader(header, { gebouwNaam: gebouwNaam ?? null, opnameNaam: opnameNaam ?? null, aangemaaktDoorNaam: makerNaam ?? null, subtotaal, totaalNaOpslagen: totaal_na_opslagen, kenmerk: await kenmerkVoorModCalc(header.gebouwId, header.nummer) });
    })));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.post("/modules/calculaties", aanmakenCalc, async (req, res): Promise<void> => {
  try {
    const {
      naam, referentie, klant_naam, gebouw_id, opname_id, project_naam, werknummer,
      status = "concept", omschrijving, opmerkingen,
      opslag_materiaal = 0, opslag_arbeid = 0,
      opslag_ak = 15, opslag_risico = 5, opslag_winst = 10, korting = 0,
    } = req.body as Record<string, unknown>;

    if (!naam) return void res.status(400).json({ error: "naam is verplicht" });

    const [row] = await db.insert(modCalcHeadersTable).values({
      naam: String(naam),
      referentie: referentie ? String(referentie) : null,
      klantNaam: klant_naam ? String(klant_naam) : null,
      gebouwId: gebouw_id ? Number(gebouw_id) : null,
      ...(opname_id ? { opnameId: Number(opname_id) } : {}),
      projectNaam: project_naam ? String(project_naam) : null,
      ...(werknummer ? { werknummer: String(werknummer) } : {}),
      status: String(status),
      omschrijving: omschrijving ? String(omschrijving) : null,
      opmerkingen: opmerkingen ? String(opmerkingen) : null,
      opslagMateriaal: Number(opslag_materiaal),
      opslagArbeid: Number(opslag_arbeid),
      opslagAk: Number(opslag_ak),
      opslagRisico: Number(opslag_risico),
      opslagWinst: Number(opslag_winst),
      korting: Number(korting),
      aangemaaktDoorId: req.session.userId ?? null,
    } as typeof modCalcHeadersTable.$inferInsert).returning();

    // Auto-genereer referentie als nog niet opgegeven
    let finalRow = row;
    if (!row.referentie) {
      const jaar = new Date().getFullYear();
      const refCode = `CALC-${jaar}-${String(row.id).padStart(4, "0")}`;
      const [updated] = await db
        .update(modCalcHeadersTable)
        .set({ referentie: refCode })
        .where(eq(modCalcHeadersTable.id, row.id))
        .returning();
      finalRow = updated;
    }

    res.status(201).json(mapHeader(finalRow, { subtotaal: 0, totaalNaOpslagen: 0, kenmerk: await kenmerkVoorModCalc(finalRow.gebouwId, finalRow.nummer) }));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── Leveranciers ──────────────────────────────────────────────────────────
router.get("/modules/calculaties/leveranciers", lezenCalc, async (req, res): Promise<void> => {
  try {
    const rows = await db.select().from(modCalcLeveranciersTable).orderBy(asc(modCalcLeveranciersTable.naam));
    res.json(rows.map((r) => ({
      id: r.id, naam: r.naam, contactpersoon: r.contactpersoon, email: r.email,
      telefoon: r.telefoon, website: r.website, notities: r.notities, actief: r.actief,
    })));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.post("/modules/calculaties/leveranciers", schrijvenCalc, async (req, res): Promise<void> => {
  try {
    const body = req.body as Record<string, unknown>;
    if (!body.naam) return void res.status(400).json({ error: "naam is verplicht" });
    const [row] = await db.insert(modCalcLeveranciersTable).values({
      naam: String(body.naam),
      contactpersoon: body.contactpersoon ? String(body.contactpersoon) : null,
      email: body.email ? String(body.email) : null,
      telefoon: body.telefoon ? String(body.telefoon) : null,
      website: body.website ? String(body.website) : null,
      notities: body.notities ? String(body.notities) : null,
    }).returning();
    res.status(201).json({ id: row.id, naam: row.naam, contactpersoon: row.contactpersoon, email: row.email, telefoon: row.telefoon, website: row.website, notities: row.notities, actief: row.actief });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.patch("/modules/calculaties/leveranciers/:id", schrijvenCalc, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params["id"]);
    const body = req.body as Record<string, unknown>;
    const update: Partial<typeof modCalcLeveranciersTable.$inferInsert> = { bijgewerktOp: new Date() };
    if (body.naam !== undefined) update.naam = String(body.naam);
    if (body.contactpersoon !== undefined) update.contactpersoon = body.contactpersoon ? String(body.contactpersoon) : null;
    if (body.email !== undefined) update.email = body.email ? String(body.email) : null;
    if (body.telefoon !== undefined) update.telefoon = body.telefoon ? String(body.telefoon) : null;
    if (body.website !== undefined) update.website = body.website ? String(body.website) : null;
    if (body.notities !== undefined) update.notities = body.notities ? String(body.notities) : null;
    if (body.actief !== undefined) update.actief = Boolean(body.actief);
    const [row] = await db.update(modCalcLeveranciersTable).set(update).where(eq(modCalcLeveranciersTable.id, id)).returning();
    if (!row) return void res.status(404).json({ error: "Niet gevonden" });
    res.json({ id: row.id, naam: row.naam, contactpersoon: row.contactpersoon, email: row.email, telefoon: row.telefoon, website: row.website, notities: row.notities, actief: row.actief });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.delete("/modules/calculaties/leveranciers/:id", verwijderenCalc, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params["id"]);
    await db.delete(modCalcLeveranciersTable).where(eq(modCalcLeveranciersTable.id, id));
    res.status(204).end();
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── Artikelen ─────────────────────────────────────────────────────────────
router.get("/modules/calculaties/artikelen", lezenCalc, async (req, res): Promise<void> => {
  try {
    const zoek = typeof req.query["zoek"] === "string" ? req.query["zoek"].trim() : "";
    const leverancierId = typeof req.query["leverancier_id"] === "string" ? parseInt(req.query["leverancier_id"], 10) : null;

    let query = db.select({
      id: modCalcArtekelenTable.id,
      leverancier_id: modCalcArtekelenTable.leverancierId,
      leverancier_naam: modCalcLeveranciersTable.naam,
      artikelcode: modCalcArtekelenTable.artikelcode,
      omschrijving: modCalcArtekelenTable.omschrijving,
      eenheid: modCalcArtekelenTable.eenheid,
      inkoopprijs: modCalcArtekelenTable.inkoopprijs,
      verkoopprijs: modCalcArtekelenTable.verkoopprijs,
      categorie: modCalcArtekelenTable.categorie,
      actief: modCalcArtekelenTable.actief,
    }).from(modCalcArtekelenTable)
      .leftJoin(modCalcLeveranciersTable, eq(modCalcArtekelenTable.leverancierId, modCalcLeveranciersTable.id))
      .$dynamic();

    const filters = [eq(modCalcArtekelenTable.actief, true)];
    if (zoek) filters.push(ilike(modCalcArtekelenTable.omschrijving, `%${zoek}%`));
    if (leverancierId && !isNaN(leverancierId)) filters.push(eq(modCalcArtekelenTable.leverancierId, leverancierId));
    if (filters.length > 0) {
      query = query.where(filters.length === 1 ? filters[0]! : sql`${filters[0]} AND ${filters[1]}`) as typeof query;
    }

    const rows = await query.orderBy(asc(modCalcArtekelenTable.omschrijving)).limit(200);

    // PRIJS_01 §5 — verrijk elk artikel met de geldige prijsafspraak op de
    // peildatum (calculatiedatum indien meegegeven, anders vandaag). We schrijven
    // NOOIT naar mod_calc_artikelen.inkoopprijs; dit is puur verrijking bij het
    // uitserveren. Eén batch-query op de geldende afspraken van de betrokken
    // artikelen, i.p.v. N losse lookups.
    const peildatum = typeof req.query["datum"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query["datum"])
      ? req.query["datum"]
      : new Date().toISOString().slice(0, 10);
    const artikelIds = rows.map((r) => r.id);
    const verrijkt = await verrijkArtikelenMetAfspraak(rows, artikelIds, peildatum);
    res.json(verrijkt);
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

// PRIJS_01 §5 — helper: verrijkt artikelen met de geldige prijsafspraak op een
// peildatum. Voegt afgesproken_prijs, afspraak_id, afspraak_leverancier,
// afspraak_periode {van,tot} en prijs_bron ('afspraak' | 'catalogus') toe.
// Schrijft nooit naar het artikel zelf (§5/§9).
type ArtikelBasis = { id: number; inkoopprijs?: unknown } & Record<string, unknown>;
async function verrijkArtikelenMetAfspraak<T extends ArtikelBasis>(
  artikelen: T[],
  artikelIds: number[],
  peildatum: string,
): Promise<Array<T & {
  afgesproken_prijs: number | null;
  afspraak_id: number | null;
  afspraak_leverancier: string | null;
  afspraak_periode: { van: string; tot: string } | null;
  prijs_bron: "afspraak" | "catalogus";
}>> {
  if (artikelIds.length === 0) {
    return artikelen.map((a) => ({
      ...a,
      afgesproken_prijs: null,
      afspraak_id: null,
      afspraak_leverancier: null,
      afspraak_periode: null,
      prijs_bron: "catalogus" as const,
    }));
  }
  // Geldende afspraken (basisstaffel: staffel_vanaf 0) voor deze artikelen op de peildatum.
  const afsprakenRijen = await db
    .select({
      id: prijsafsprakenTable.id,
      artikelId: prijsafsprakenTable.artikelId,
      leverancierId: prijsafsprakenTable.leverancierId,
      prijs: prijsafsprakenTable.prijs,
      geldigVan: prijsafsprakenTable.geldigVan,
      geldigTot: prijsafsprakenTable.geldigTot,
      staffelVanaf: prijsafsprakenTable.staffelVanaf,
      leverancierNaam: leveranciersTable.naam,
    })
    .from(prijsafsprakenTable)
    .leftJoin(leveranciersTable, eq(prijsafsprakenTable.leverancierId, leveranciersTable.id))
    .where(and(
      isNull(prijsafsprakenTable.teruggedraaidOp),
      lte(prijsafsprakenTable.geldigVan, peildatum),
      gte(prijsafsprakenTable.geldigTot, peildatum),
      eq(prijsafsprakenTable.staffelVanaf, 0),
      inArray(prijsafsprakenTable.artikelId, artikelIds),
    ));

  // Per artikel: laagste prijs wint (kan meerdere leveranciers hebben).
  const perArtikel = new Map<number, typeof afsprakenRijen[number]>();
  for (const rij of afsprakenRijen) {
    if (rij.artikelId == null) continue;
    const huidig = perArtikel.get(rij.artikelId);
    if (!huidig || parseFloat(rij.prijs) < parseFloat(huidig.prijs)) {
      perArtikel.set(rij.artikelId, rij);
    }
  }

  return artikelen.map((a) => {
    const afspraak = perArtikel.get(a.id) ?? null;
    if (!afspraak) {
      return {
        ...a,
        afgesproken_prijs: null,
        afspraak_id: null,
        afspraak_leverancier: null,
        afspraak_periode: null,
        prijs_bron: "catalogus" as const,
      };
    }
    return {
      ...a,
      afgesproken_prijs: parseFloat(afspraak.prijs),
      afspraak_id: afspraak.id,
      afspraak_leverancier: afspraak.leverancierNaam ?? null,
      afspraak_periode: { van: afspraak.geldigVan, tot: afspraak.geldigTot },
      prijs_bron: "afspraak" as const,
    };
  });
}

router.post("/modules/calculaties/artikelen", schrijvenCalc, async (req, res): Promise<void> => {
  try {
    const body = req.body as Record<string, unknown>;
    if (!body.omschrijving) return void res.status(400).json({ error: "omschrijving is verplicht" });
    const [row] = await db.insert(modCalcArtekelenTable).values({
      leverancierId: body.leverancier_id ? Number(body.leverancier_id) : null,
      artikelcode: body.artikelcode ? String(body.artikelcode) : null,
      omschrijving: String(body.omschrijving),
      eenheid: body.eenheid ? String(body.eenheid) : "st",
      inkoopprijs: Number(body.inkoopprijs ?? 0),
      verkoopprijs: Number(body.verkoopprijs ?? 0),
      categorie: body.categorie ? String(body.categorie) : "materiaal",
    }).returning();
    res.status(201).json({ id: row.id, leverancier_id: row.leverancierId, artikelcode: row.artikelcode, omschrijving: row.omschrijving, eenheid: row.eenheid, inkoopprijs: row.inkoopprijs, verkoopprijs: row.verkoopprijs, categorie: row.categorie, actief: row.actief });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.patch("/modules/calculaties/artikelen/:id", schrijvenCalc, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params["id"]);
    const body = req.body as Record<string, unknown>;
    const update: Partial<typeof modCalcArtekelenTable.$inferInsert> = { bijgewerktOp: new Date() };
    if (body.leverancier_id !== undefined) update.leverancierId = body.leverancier_id ? Number(body.leverancier_id) : null;
    if (body.artikelcode !== undefined) update.artikelcode = body.artikelcode ? String(body.artikelcode) : null;
    if (body.omschrijving !== undefined) update.omschrijving = String(body.omschrijving);
    if (body.eenheid !== undefined) update.eenheid = String(body.eenheid);
    if (body.inkoopprijs !== undefined) update.inkoopprijs = Number(body.inkoopprijs);
    if (body.verkoopprijs !== undefined) update.verkoopprijs = Number(body.verkoopprijs);
    if (body.categorie !== undefined) update.categorie = String(body.categorie);
    if (body.actief !== undefined) update.actief = Boolean(body.actief);
    const [row] = await db.update(modCalcArtekelenTable).set(update).where(eq(modCalcArtekelenTable.id, id)).returning();
    if (!row) return void res.status(404).json({ error: "Niet gevonden" });
    res.json({ id: row.id, leverancier_id: row.leverancierId, artikelcode: row.artikelcode, omschrijving: row.omschrijving, eenheid: row.eenheid, inkoopprijs: row.inkoopprijs, verkoopprijs: row.verkoopprijs, categorie: row.categorie, actief: row.actief });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.delete("/modules/calculaties/artikelen/:id", verwijderenCalc, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params["id"]);
    await db.delete(modCalcArtekelenTable).where(eq(modCalcArtekelenTable.id, id));
    res.status(204).end();
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── CSV import artikelen ───────────────────────────────────────────────────
// Verwacht CSV: artikelcode;omschrijving;eenheid;inkoopprijs;verkoopprijs;categorie;leverancier_naam
router.post("/modules/calculaties/artikelen/import-csv", schrijvenCalc, async (req, res): Promise<void> => {
  try {
    const body = req.body as Record<string, unknown>;
    const csv = typeof body.csv === "string" ? body.csv : "";
    if (!csv.trim()) return void res.status(400).json({ error: "Geen CSV-data ontvangen" });

    const regels = csv.split(/\r?\n/).map((r) => r.trim()).filter((r) => r && !r.startsWith("artikelcode"));
    let aangemaakt = 0;
    let fouten: string[] = [];

    for (const regel of regels) {
      const delen = regel.split(";");
      const [artikelcode, omschrijving, eenheid, inkoopRaw, verkoopRaw, categorie, leverancierNaam] = delen;
      if (!omschrijving?.trim()) { fouten.push(`Lege omschrijving op rij: ${regel}`); continue; }

      let leverancierId: number | null = null;
      if (leverancierNaam?.trim()) {
        const [bestaande] = await db.select({ id: modCalcLeveranciersTable.id }).from(modCalcLeveranciersTable)
          .where(ilike(modCalcLeveranciersTable.naam, leverancierNaam.trim())).limit(1);
        if (bestaande) {
          leverancierId = bestaande.id;
        } else {
          const [nieuw] = await db.insert(modCalcLeveranciersTable).values({ naam: leverancierNaam.trim() }).returning();
          leverancierId = nieuw.id;
        }
      }

      await db.insert(modCalcArtekelenTable).values({
        artikelcode: artikelcode?.trim() || null,
        omschrijving: omschrijving.trim(),
        eenheid: eenheid?.trim() || "st",
        inkoopprijs: parseFloat((inkoopRaw ?? "0").replace(",", ".")) || 0,
        verkoopprijs: parseFloat((verkoopRaw ?? "0").replace(",", ".")) || 0,
        categorie: categorie?.trim() || "materiaal",
        leverancierId,
      });
      aangemaakt++;
    }

    res.json({ aangemaakt, fouten });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Import mislukt" });
  }
});

// ── Calculatie detail ──────────────────────────────────────────────────────
router.get("/modules/calculaties/:id", lezenCalc, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params["id"]);

    const [headerRow] = await db
      .select({
        header: modCalcHeadersTable,
        gebouwNaam: gebouwenTable.naam,
        opnameNaam: opnamesTable.naam,
        makerNaam: gebruikersTable.naam,
      })
      .from(modCalcHeadersTable)
      .leftJoin(gebouwenTable, eq(modCalcHeadersTable.gebouwId, gebouwenTable.id))
      .leftJoin(opnamesTable, eq(modCalcHeadersTable.opnameId, opnamesTable.id))
      .leftJoin(gebruikersTable, eq(modCalcHeadersTable.aangemaaktDoorId, gebruikersTable.id))
      .where(eq(modCalcHeadersTable.id, id));

    if (!headerRow) return void res.status(404).json({ error: "Niet gevonden" });

    const regelRows = await db
      .select({ regel: modCalcRegelsTable, normCode: modCalcNormtijdenTable.code })
      .from(modCalcRegelsTable)
      .leftJoin(modCalcNormtijdenTable, eq(modCalcRegelsTable.normtijdId, modCalcNormtijdenTable.id))
      .where(eq(modCalcRegelsTable.calculatieId, id))
      .orderBy(asc(modCalcRegelsTable.volgorde), asc(modCalcRegelsTable.id));

    const regels = regelRows.map(({ regel, normCode }) => mapRegel(regel, normCode));
    const calcRegels: RegelCalcInput[] = regelRows.map(({ regel: r }) => ({
      hoeveelheid: r.hoeveelheid,
      tarief: r.tarief,
      muPerEenheid: r.muPerEenheid,
      arbeidsTarief: r.arbeidsTarief,
      onderaannemingBedrag: r.onderaannemingBedrag,
      isStaartkosten: r.isStaartkosten,
      isBouwplaatskosten: r.isBouwplaatskosten,
      totaal: r.totaal,
      soort: r.soort,
      optioneel: r.optioneel,
    }));
    const { subtotaal, totaal_na_opslagen, optioneel_totaal } = berekenTotalen(calcRegels, {
      opslagMateriaal: headerRow.header.opslagMateriaal ?? 0,
      opslagArbeid: headerRow.header.opslagArbeid ?? 0,
      opslagAk: headerRow.header.opslagAk,
      opslagAbk: headerRow.header.opslagAbk ?? 10,
      opslagRisico: headerRow.header.opslagRisico,
      opslagWinst: headerRow.header.opslagWinst,
      korting: headerRow.header.korting,
      akIsVast: headerRow.header.akIsVast ?? false,
      abkIsVast: headerRow.header.abkIsVast ?? false,
      risicoIsVast: headerRow.header.risicoIsVast ?? false,
      winstIsVast: headerRow.header.winstIsVast ?? false,
    });

    res.json({
      ...mapHeader(headerRow.header, {
        gebouwNaam: headerRow.gebouwNaam ?? null,
        opnameNaam: headerRow.opnameNaam ?? null,
        aangemaaktDoorNaam: headerRow.makerNaam ?? null,
        subtotaal,
        totaalNaOpslagen: totaal_na_opslagen,
        kenmerk: await kenmerkVoorModCalc(headerRow.header.gebouwId, headerRow.header.nummer),
      }),
      optioneel_totaal,
      regels,
    });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.patch("/modules/calculaties/:id", schrijvenCalc, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params["id"]);
    const body = req.body as Record<string, unknown>;
    const update: Partial<typeof modCalcHeadersTable.$inferInsert> = { bijgewerktOp: new Date() };
    if (body.naam !== undefined) update.naam = String(body.naam);
    if (body.referentie !== undefined) update.referentie = body.referentie ? String(body.referentie) : null;
    if (body.klant_naam !== undefined) update.klantNaam = body.klant_naam ? String(body.klant_naam) : null;
    if (body.gebouw_id !== undefined) update.gebouwId = body.gebouw_id ? Number(body.gebouw_id) : null;
    if (body.opname_id !== undefined) (update as any).opnameId = body.opname_id ? Number(body.opname_id) : null;
    if (body.project_naam !== undefined) update.projectNaam = body.project_naam ? String(body.project_naam) : null;
    if (body.werknummer !== undefined) (update as any).werknummer = body.werknummer ? String(body.werknummer) : null;
    if (body.status !== undefined) update.status = String(body.status);
    if (body.omschrijving !== undefined) update.omschrijving = body.omschrijving ? String(body.omschrijving) : null;
    if (body.opmerkingen !== undefined) update.opmerkingen = body.opmerkingen ? String(body.opmerkingen) : null;
    if (body.opslag_materiaal !== undefined) update.opslagMateriaal = Number(body.opslag_materiaal);
    if (body.opslag_arbeid !== undefined) update.opslagArbeid = Number(body.opslag_arbeid);
    if (body.opslag_ak !== undefined) update.opslagAk = Number(body.opslag_ak);
    if (body.opslag_abk !== undefined) update.opslagAbk = Number(body.opslag_abk);
    if (body.opslag_risico !== undefined) update.opslagRisico = Number(body.opslag_risico);
    if (body.opslag_winst !== undefined) update.opslagWinst = Number(body.opslag_winst);
    if (body.korting !== undefined) update.korting = Number(body.korting);
    if (body.ak_is_vast !== undefined) update.akIsVast = Boolean(body.ak_is_vast);
    if (body.abk_is_vast !== undefined) update.abkIsVast = Boolean(body.abk_is_vast);
    if (body.risico_is_vast !== undefined) update.risicoIsVast = Boolean(body.risico_is_vast);
    if (body.winst_is_vast !== undefined) update.winstIsVast = Boolean(body.winst_is_vast);
    const [row] = await db.update(modCalcHeadersTable).set(update).where(eq(modCalcHeadersTable.id, id)).returning();
    if (!row) return void res.status(404).json({ error: "Niet gevonden" });
    res.json(mapHeader(row, { kenmerk: await kenmerkVoorModCalc(row.gebouwId, row.nummer) }));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.delete("/modules/calculaties/:id", verwijderenCalc, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params["id"]);
    await db.delete(modCalcHeadersTable).where(eq(modCalcHeadersTable.id, id));
    res.status(204).end();
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.post("/modules/calculaties/:id/dupliceer", aanmakenCalc, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params["id"]);
    const [original] = await db.select().from(modCalcHeadersTable).where(eq(modCalcHeadersTable.id, id));
    if (!original) return void res.status(404).json({ error: "Niet gevonden" });

    const [kopie] = await db.insert(modCalcHeadersTable).values({
      naam: `${original.naam} (kopie)`,
      referentie: original.referentie,
      klantNaam: original.klantNaam,
      gebouwId: original.gebouwId,
      projectNaam: original.projectNaam,
      status: "concept",
      omschrijving: original.omschrijving,
      opmerkingen: original.opmerkingen,
      opslagMateriaal: original.opslagMateriaal ?? 0,
      opslagArbeid: original.opslagArbeid ?? 0,
      opslagAk: original.opslagAk,
      opslagAbk: original.opslagAbk ?? 10,
      opslagRisico: original.opslagRisico,
      opslagWinst: original.opslagWinst,
      korting: original.korting,
      akIsVast: original.akIsVast ?? false,
      abkIsVast: original.abkIsVast ?? false,
      risicoIsVast: original.risicoIsVast ?? false,
      winstIsVast: original.winstIsVast ?? false,
      aangemaaktDoorId: req.session.userId ?? null,
    } as typeof modCalcHeadersTable.$inferInsert).returning();

    const origRegels = await db.select().from(modCalcRegelsTable)
      .where(eq(modCalcRegelsTable.calculatieId, id))
      .orderBy(asc(modCalcRegelsTable.volgorde));

    if (origRegels.length > 0) {
      await db.insert(modCalcRegelsTable).values(
        origRegels.map((r) => ({
          calculatieId: kopie.id,
          categorie: r.categorie,
          omschrijving: r.omschrijving,
          normtijdId: r.normtijdId,
          eenheid: r.eenheid,
          hoeveelheid: r.hoeveelheid,
          tarief: r.tarief,
          totaal: r.totaal,
          volgorde: r.volgorde,
          opmerkingen: r.opmerkingen,
          regelnummer: (r as any).regelnummer ?? null,
          muPerEenheid: (r as any).muPerEenheid ?? 0,
          arbeidsTarief: (r as any).arbeidsTarief ?? 0,
          onderaannemingBedrag: (r as any).onderaannemingBedrag ?? 0,
          isStaartkosten: r.isStaartkosten ?? false,
          isBouwplaatskosten: r.isBouwplaatskosten ?? false,
        } as typeof modCalcRegelsTable.$inferInsert))
      );
    }

    res.status(201).json(mapHeader(kopie, { kenmerk: await kenmerkVoorModCalc(kopie.gebouwId, kopie.nummer) }));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── Calculatie regels ──────────────────────────────────────────────────────

// ── Calculatie-eenheden CRUD ────────────────────────────────────────────────
router.get("/modules/calculaties/:id/eenheden", lezenCalc, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params["id"]);
    const rows = await db
      .select()
      .from(modCalcEenhedenTable)
      .where(eq(modCalcEenhedenTable.calculatieId, id))
      .orderBy(asc(modCalcEenhedenTable.volgorde), asc(modCalcEenhedenTable.id));
    res.json(rows.map((e) => ({
      id: e.id,
      calculatie_id: e.calculatieId,
      naam: e.naam,
      type: e.type,
      volgorde: e.volgorde,
      aangemaakt_op: e.aangemaaktOp.toISOString(),
      bijgewerkt_op: e.bijgewerktOp.toISOString(),
    })));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.post("/modules/calculaties/:id/eenheden", schrijvenCalc, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params["id"]);
    const body = req.body as Record<string, unknown>;
    const { naam, type = "vrije_projecteenheid", volgorde = 0 } = body;
    if (!naam) return void res.status(400).json({ error: "naam is verplicht" });
    const [row] = await db.insert(modCalcEenhedenTable).values({
      calculatieId: id,
      naam: String(naam),
      type: String(type),
      volgorde: Number(volgorde),
    }).returning();
    res.status(201).json({
      id: row.id,
      calculatie_id: row.calculatieId,
      naam: row.naam,
      type: row.type,
      volgorde: row.volgorde,
      aangemaakt_op: row.aangemaaktOp.toISOString(),
      bijgewerkt_op: row.bijgewerktOp.toISOString(),
    });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.patch("/modules/calculaties/:id/eenheden/:eenheidId", schrijvenCalc, async (req, res): Promise<void> => {
  try {
    const eenheidId = parseId(req.params["eenheidId"]);
    const body = req.body as Record<string, unknown>;
    const update: Partial<typeof modCalcEenhedenTable.$inferInsert> = { bijgewerktOp: new Date() };
    if (body.naam !== undefined) update.naam = String(body.naam);
    if (body.type !== undefined) update.type = String(body.type);
    if (body.volgorde !== undefined) update.volgorde = Number(body.volgorde);
    const [row] = await db.update(modCalcEenhedenTable).set(update).where(eq(modCalcEenhedenTable.id, eenheidId)).returning();
    if (!row) return void res.status(404).json({ error: "Niet gevonden" });
    res.json({
      id: row.id,
      calculatie_id: row.calculatieId,
      naam: row.naam,
      type: row.type,
      volgorde: row.volgorde,
      aangemaakt_op: row.aangemaaktOp.toISOString(),
      bijgewerkt_op: row.bijgewerktOp.toISOString(),
    });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.delete("/modules/calculaties/:id/eenheden/:eenheidId", schrijvenCalc, async (req, res): Promise<void> => {
  try {
    const eenheidId = parseId(req.params["eenheidId"]);
    await db.delete(modCalcEenhedenTable).where(eq(modCalcEenhedenTable.id, eenheidId));
    res.status(204).end();
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.get("/modules/calculaties/:id/regels", lezenCalc, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params["id"]);
    const rows = await db
      .select({ regel: modCalcRegelsTable, normCode: modCalcNormtijdenTable.code })
      .from(modCalcRegelsTable)
      .leftJoin(modCalcNormtijdenTable, eq(modCalcRegelsTable.normtijdId, modCalcNormtijdenTable.id))
      .where(eq(modCalcRegelsTable.calculatieId, id))
      .orderBy(asc(modCalcRegelsTable.volgorde), asc(modCalcRegelsTable.id));
    res.json(rows.map(({ regel, normCode }) => mapRegel(regel, normCode)));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.post("/modules/calculaties/:id/regels", schrijvenCalc, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params["id"]);
    const [header] = await db.select().from(modCalcHeadersTable).where(eq(modCalcHeadersTable.id, id));
    if (!header) return void res.status(404).json({ error: "Calculatie niet gevonden" });

    const body = req.body as Record<string, unknown>;
    const { categorie = "arbeid", omschrijving, normtijd_id, eenheid = "st", volgorde = 0, opmerkingen,
      regelnummer, is_staartkosten = false, is_bouwplaatskosten = false,
      hoofdstuk = "Overige werkzaamheden", klanttekst, btw_tarief = "21",
      wand_plafond, toepassing_tekst, eenheid_id,
      soort = "regel", optioneel = false, ouder_regel_id } = body;
    if (!omschrijving) return void res.status(400).json({ error: "omschrijving is verplicht" });

    // Ouder-kindconsistentie: een kind moet in dezelfde calculatie én dezelfde
    // groep (hoofdstuk/eenheid/sectie) zitten als zijn ouder.
    if (ouder_regel_id) {
      const [ouder] = await db.select().from(modCalcRegelsTable).where(eq(modCalcRegelsTable.id, Number(ouder_regel_id)));
      if (!ouder || ouder.calculatieId !== id) {
        return void res.status(400).json({ error: "ouder_regel_id verwijst niet naar een regel in deze calculatie" });
      }
      const kindGroep = calcRegelGroep({
        isStaartkosten: Boolean(is_staartkosten),
        isBouwplaatskosten: Boolean(is_bouwplaatskosten),
        eenheidId: eenheid_id ? Number(eenheid_id) : null,
        hoofdstuk: hoofdstuk != null ? String(hoofdstuk) : null,
      });
      if (kindGroep !== calcRegelGroep(ouder)) {
        return void res.status(400).json({ error: "ouder_regel_id verwijst naar een regel in een ander hoofdstuk, andere eenheid of andere sectie" });
      }
    }

    const { hv, t, mu, at, ob, totaal } = berekenRegelTotaal(body);

    const [row] = await db.insert(modCalcRegelsTable).values({
      calculatieId: id,
      eenheidId: eenheid_id ? Number(eenheid_id) : null,
      categorie: String(categorie),
      omschrijving: String(omschrijving),
      normtijdId: normtijd_id ? Number(normtijd_id) : null,
      eenheid: String(eenheid),
      hoeveelheid: hv,
      tarief: t,
      totaal,
      volgorde: Number(volgorde),
      opmerkingen: opmerkingen ? String(opmerkingen) : null,
      regelnummer: regelnummer ? String(regelnummer) : null,
      muPerEenheid: mu,
      arbeidsTarief: at,
      onderaannemingBedrag: ob,
      isStaartkosten: Boolean(is_staartkosten),
      isBouwplaatskosten: Boolean(is_bouwplaatskosten),
      hoofdstuk: String(hoofdstuk),
      klanttekst: klanttekst ? String(klanttekst) : null,
      btwTarief: String(btw_tarief),
      wandPlafond: wand_plafond ? String(wand_plafond) : null,
      toepassingTekst: toepassing_tekst ? String(toepassing_tekst) : null,
      soort: String(soort),
      optioneel: Boolean(optioneel),
      ouderRegelId: ouder_regel_id ? Number(ouder_regel_id) : null,
    } as typeof modCalcRegelsTable.$inferInsert).returning();

    res.status(201).json(mapRegel(row));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.patch("/modules/calculaties/:id/regels/:regelId", schrijvenCalc, async (req, res): Promise<void> => {
  try {
    const regelId = parseId(req.params["regelId"]);
    const body = req.body as Record<string, unknown>;

    const [existing] = await db.select().from(modCalcRegelsTable).where(eq(modCalcRegelsTable.id, regelId));
    if (!existing) return void res.status(404).json({ error: "Niet gevonden" });

    // Ouder-kindconsistentie: effectieve waarden ná deze update mogen niet naar
    // een ouder buiten dezelfde calculatie/groep (hoofdstuk/eenheid/sectie) wijzen.
    const effOuderId = body.ouder_regel_id !== undefined
      ? (body.ouder_regel_id ? Number(body.ouder_regel_id) : null)
      : existing.ouderRegelId;
    const raaktGroep = body.ouder_regel_id !== undefined || body.hoofdstuk !== undefined
      || body.eenheid_id !== undefined || body.is_staartkosten !== undefined || body.is_bouwplaatskosten !== undefined;
    if (effOuderId != null && raaktGroep) {
      const [ouder] = await db.select().from(modCalcRegelsTable).where(eq(modCalcRegelsTable.id, effOuderId));
      if (!ouder || ouder.calculatieId !== existing.calculatieId) {
        return void res.status(400).json({ error: "ouder_regel_id verwijst niet naar een regel in deze calculatie" });
      }
      const kindGroep = calcRegelGroep({
        isStaartkosten: body.is_staartkosten !== undefined ? Boolean(body.is_staartkosten) : existing.isStaartkosten,
        isBouwplaatskosten: body.is_bouwplaatskosten !== undefined ? Boolean(body.is_bouwplaatskosten) : existing.isBouwplaatskosten,
        eenheidId: body.eenheid_id !== undefined ? (body.eenheid_id ? Number(body.eenheid_id) : null) : existing.eenheidId,
        hoofdstuk: body.hoofdstuk !== undefined ? String(body.hoofdstuk) : existing.hoofdstuk,
      });
      if (kindGroep !== calcRegelGroep(ouder)) {
        return void res.status(400).json({ error: "ouder_regel_id verwijst naar een regel in een ander hoofdstuk, andere eenheid of andere sectie" });
      }
    }

    const { hv, t, mu, at, ob, totaal } = berekenRegelTotaal(body, existing as any);

    const update: Partial<typeof modCalcRegelsTable.$inferInsert> = { bijgewerktOp: new Date() };
    if (body.eenheid_id !== undefined) (update as any).eenheidId = body.eenheid_id ? Number(body.eenheid_id) : null;
    if (body.categorie !== undefined) update.categorie = String(body.categorie);
    if (body.omschrijving !== undefined) update.omschrijving = String(body.omschrijving);
    if (body.normtijd_id !== undefined) update.normtijdId = body.normtijd_id ? Number(body.normtijd_id) : null;
    if (body.eenheid !== undefined) update.eenheid = String(body.eenheid);
    if (body.volgorde !== undefined) update.volgorde = Number(body.volgorde);
    if (body.opmerkingen !== undefined) update.opmerkingen = body.opmerkingen ? String(body.opmerkingen) : null;
    if (body.regelnummer !== undefined) (update as any).regelnummer = body.regelnummer ? String(body.regelnummer) : null;
    if (body.is_staartkosten !== undefined) update.isStaartkosten = Boolean(body.is_staartkosten);
    if (body.is_bouwplaatskosten !== undefined) update.isBouwplaatskosten = Boolean(body.is_bouwplaatskosten);
    if (body.hoofdstuk !== undefined) (update as any).hoofdstuk = String(body.hoofdstuk);
    if (body.klanttekst !== undefined) (update as any).klanttekst = body.klanttekst ? String(body.klanttekst) : null;
    if (body.btw_tarief !== undefined) (update as any).btwTarief = String(body.btw_tarief);
    if (body.wand_plafond !== undefined) (update as any).wandPlafond = body.wand_plafond ? String(body.wand_plafond) : null;
    if (body.toepassing_tekst !== undefined) (update as any).toepassingTekst = body.toepassing_tekst ? String(body.toepassing_tekst) : null;
    if (body.soort !== undefined) (update as any).soort = String(body.soort);
    if (body.optioneel !== undefined) (update as any).optioneel = Boolean(body.optioneel);
    if (body.ouder_regel_id !== undefined) (update as any).ouderRegelId = body.ouder_regel_id ? Number(body.ouder_regel_id) : null;
    update.hoeveelheid = hv;
    update.tarief = t;
    (update as any).muPerEenheid = mu;
    (update as any).arbeidsTarief = at;
    (update as any).onderaannemingBedrag = ob;
    update.totaal = totaal;

    const [row] = await db.update(modCalcRegelsTable).set(update).where(eq(modCalcRegelsTable.id, regelId)).returning();
    res.json(mapRegel(row));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

// Herschikken: regel omhoog/omlaag binnen zijn hoofdstuk-groep verplaatsen.
// Materiaalkinderen (ouder_regel_id) verhuizen altijd mee met hun ouder; de hele
// calculatie wordt daarna herteld zodat 'volgorde' consistent en uniek is.
router.post("/modules/calculaties/:id/regels/:regelId/herschik", schrijvenCalc, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params["id"]);
    const regelId = parseId(req.params["regelId"]);
    const richting = (req.body as Record<string, unknown> | undefined)?.["richting"];
    if (richting !== "omhoog" && richting !== "omlaag") {
      return void res.status(400).json({ error: 'richting moet "omhoog" of "omlaag" zijn' });
    }

    // Alles (lezen → herschikken → hertellen) in ÉÉN transactie, geserialiseerd
    // per calculatie via een transactie-advisory-lock: gelijktijdige herschik-
    // verzoeken op dezelfde calculatie kunnen elkaars hertelling niet doorkruisen.
    const uitkomst = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(873001, ${id})`);

    const alle = await tx.select().from(modCalcRegelsTable)
      .where(eq(modCalcRegelsTable.calculatieId, id))
      .orderBy(asc(modCalcRegelsTable.volgorde), asc(modCalcRegelsTable.id));
    const doel = alle.find((r) => r.id === regelId);
    if (!doel) return { status: 404 as const };

    const groepVan = calcRegelGroep;

    // Een regel telt alleen als kind wanneer zijn ouder in DEZELFDE groep zit;
    // een (legacy) kind in een ander hoofdstuk/eenheid/sectie blijft in zijn
    // eigen groep staan en verhuist NIET mee over die grens heen.
    const perId = new Map(alle.map((r) => [r.id, r]));
    const isKind = (r: typeof doel) => {
      if (r.ouderRegelId == null) return false;
      const ouder = perId.get(r.ouderRegelId);
      return !!ouder && groepVan(ouder) === groepVan(r);
    };

    // Kinderen per ouder, in huidige volgorde
    const kinderenVan = new Map<number, typeof alle>();
    const topRegels: typeof alle = [];
    for (const r of alle) {
      if (isKind(r)) {
        const lijst = kinderenVan.get(r.ouderRegelId as number) ?? [];
        lijst.push(r);
        kinderenVan.set(r.ouderRegelId as number, lijst);
      } else {
        topRegels.push(r);
      }
    }

    let verplaatst = false;
    if (isKind(doel)) {
      // Kind verplaatsen binnen de kinderen van dezelfde ouder
      const broers = kinderenVan.get(doel.ouderRegelId as number)!;
      const idx = broers.findIndex((r) => r.id === doel.id);
      const nieuw = richting === "omhoog" ? idx - 1 : idx + 1;
      if (nieuw >= 0 && nieuw < broers.length) {
        [broers[idx], broers[nieuw]] = [broers[nieuw]!, broers[idx]!];
        verplaatst = true;
      }
    } else {
      // Topregel (blok incl. kinderen in dezelfde groep) verplaatsen binnen zijn groep.
      const doelGroep = groepVan(doel);
      const groepIdx = topRegels
        .map((r, i) => ({ r, i }))
        .filter(({ r }) => groepVan(r) === doelGroep)
        .map(({ i }) => i);
      const pos = groepIdx.findIndex((i) => topRegels[i]!.id === doel.id);
      const nieuwPos = richting === "omhoog" ? pos - 1 : pos + 1;
      if (nieuwPos >= 0 && nieuwPos < groepIdx.length) {
        const a = groepIdx[pos]!;
        const b = groepIdx[nieuwPos]!;
        [topRegels[a], topRegels[b]] = [topRegels[b]!, topRegels[a]!];
        verplaatst = true;
      }
    }

    if (verplaatst) {
      // Volledige hertelling: kinderen krijgen volgordes direct na hun ouder.
      const nieuweVolgorde: Array<{ id: number; volgorde: number }> = [];
      let teller = 1;
      for (const top of topRegels) {
        nieuweVolgorde.push({ id: top.id, volgorde: teller++ });
        for (const kind of kinderenVan.get(top.id) ?? []) {
          nieuweVolgorde.push({ id: kind.id, volgorde: teller++ });
        }
      }
      const huidige = new Map(alle.map((r) => [r.id, r.volgorde]));
      for (const { id: rid, volgorde } of nieuweVolgorde) {
        if (huidige.get(rid) === volgorde) continue;
        await tx.update(modCalcRegelsTable)
          .set({ volgorde, bijgewerktOp: new Date() })
          .where(eq(modCalcRegelsTable.id, rid));
      }
    }

    return { status: 200 as const, verplaatst };
    });

    if (uitkomst.status === 404) return void res.status(404).json({ error: "Regel niet gevonden" });
    res.json({ verplaatst: uitkomst.verplaatst });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.delete("/modules/calculaties/:id/regels/:regelId", schrijvenCalc, async (req, res): Promise<void> => {
  try {
    const regelId = parseId(req.params["regelId"]);
    await db.delete(modCalcRegelsTable).where(eq(modCalcRegelsTable.id, regelId));
    res.status(204).end();
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── AI-voorstel calculatieregels ───────────────────────────────────────────
router.post("/modules/calculaties/:id/ai-regels", lezenCalc, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params["id"]);
    const [header] = await db.select().from(modCalcHeadersTable).where(eq(modCalcHeadersTable.id, id));
    if (!header) return void res.status(404).json({ error: "Calculatie niet gevonden" });

    const [bestaandeRegels, normtijden, tarieven] = await Promise.all([
      db.select().from(modCalcRegelsTable).where(eq(modCalcRegelsTable.calculatieId, id)).orderBy(asc(modCalcRegelsTable.volgorde)),
      db.select().from(modCalcNormtijdenTable).where(eq(modCalcNormtijdenTable.actief, true)).limit(40),
      db.select().from(modCalcTarievenTable).where(eq(modCalcTarievenTable.actief, true)).orderBy(asc(modCalcTarievenTable.categorie), asc(modCalcTarievenTable.naam)),
    ]);

    let gebouwInfo = "";
    let spotenInfo = "";
    let opnameInfo = "";

    if (header.gebouwId) {
      const gId = header.gebouwId;
      const [[g], spotCounts, spotLabels, opnameItems] = await Promise.all([
        db.select().from(gebouwenTable).where(eq(gebouwenTable.id, gId)).limit(1),

        // Aantal spots per type
        db.select({ type: voorzieningenTable.type, aantal: count() })
          .from(voorzieningenTable)
          .where(and(eq(voorzieningenTable.gebouwId, gId), eq(voorzieningenTable.gearchiveerd, false)))
          .groupBy(voorzieningenTable.type),

        // Producten (labels/toepassingen) per spot type
        db.selectDistinct({
          type: voorzieningenTable.type,
          labelNaam: labelsTable.naam,
          fabrikant: labelsTable.fabrikant,
        })
          .from(voorzieningenTable)
          .innerJoin(voorzieningLabelsTable, eq(voorzieningLabelsTable.voorzieningId, voorzieningenTable.id))
          .innerJoin(labelsTable, eq(labelsTable.id, voorzieningLabelsTable.labelId))
          .where(and(eq(voorzieningenTable.gebouwId, gId), eq(voorzieningenTable.gearchiveerd, false))),

        // Meest recente opname-items (bevindingen uit de veldopname)
        db.select({
          opnameNaam: opnamesTable.naam,
          opnameDatum: opnamesTable.datum,
          spotType: opnameItemsTable.spotType,
          actie: opnameItemsTable.actie,
          bereikbaarheid: opnameItemsTable.bereikbaarheid,
          aantal: opnameItemsTable.aantal,
          afmetingen: opnameItemsTable.afmetingen,
          prioriteit: opnameItemsTable.prioriteit,
          beschrijving: opnameItemsTable.beschrijving,
        })
          .from(opnamesTable)
          .innerJoin(opnameItemsTable, eq(opnameItemsTable.opnameId, opnamesTable.id))
          .where(eq(opnamesTable.gebouwId, gId))
          .orderBy(desc(opnamesTable.datum), asc(opnameItemsTable.id))
          .limit(120),
      ]);

      if (g) {
        gebouwInfo = `Gebouw: ${g.naam}, ${(g as any).adres ?? ""} ${(g as any).stad ?? ""}. Bouwjaar: ${(g as any).bouwjaar ?? "onbekend"}. Type: ${(g as any).gebouwType ?? "onbekend"}.`;
      }

      // Spots samenvatten per type, verrijkt met producten
      if (spotCounts.length > 0) {
        const labelsByType = new Map<string, string[]>();
        for (const l of spotLabels) {
          if (!labelsByType.has(l.type)) labelsByType.set(l.type, []);
          const tekst = l.fabrikant ? `${l.labelNaam} (${l.fabrikant})` : l.labelNaam;
          if (!labelsByType.get(l.type)!.includes(tekst)) labelsByType.get(l.type)!.push(tekst);
        }
        spotenInfo = "Geregistreerde spots in dit gebouw (reeds aangebrachte voorzieningen):\n" +
          spotCounts.map((s) => {
            const producten = labelsByType.get(s.type) ?? [];
            const productStr = producten.length > 0 ? ` — producten: ${producten.join(", ")}` : "";
            return `- ${s.type}: ${s.aantal} stuks${productStr}`;
          }).join("\n");
      }

      // Opname-bevindingen: aangewezen werkzaamheden met aantallen en context
      if (opnameItems.length > 0) {
        const eerste = opnameItems[0]!;
        opnameInfo = `Opname: "${eerste.opnameNaam}" d.d. ${eerste.opnameDatum}\n` +
          "Bevindingen uit de veldopname (dit zijn de concreet te calculeren werkzaamheden):\n" +
          opnameItems.map((item) => {
            const delen: string[] = [`${item.spotType}: ${item.actie} × ${item.aantal}`];
            if (item.afmetingen) delen.push(`afm: ${item.afmetingen}`);
            if (item.bereikbaarheid && item.bereikbaarheid !== "goed") delen.push(`bereikbaarheid: ${item.bereikbaarheid}`);
            if (item.prioriteit === "hoog") delen.push("prioriteit: hoog");
            if (item.beschrijving) delen.push(item.beschrijving);
            return `- ${delen.join(" | ")}`;
          }).join("\n");
      }
    }

    const normtijdLijst = normtijden.map((n) => `${n.code}: ${n.omschrijving} (${n.urenPerEenheid} uur/${n.eenheid})`).join("\n");

    const tarievenLijst = tarieven.length > 0
      ? tarieven.map((t) => `[${t.categorie}] ${t.naam}: €${t.tarief}/${t.eenheid}`).join("\n")
      : "(geen tarieven geconfigureerd — schat op basis van marktprijzen)";

    const standaardArbeidstarief = tarieven.find((t) => t.categorie === "arbeid")?.tarief ?? 65;
    const bestaandeLijst = bestaandeRegels.length > 0
      ? bestaandeRegels.map((r) => `- ${(r as any).hoofdstuk ?? "Overige"} | ${r.categorie} | ${r.omschrijving} | ${r.hoeveelheid} ${r.eenheid}`).join("\n")
      : "(geen)";

    const HOOFDSTUKKEN = ["Brandwerende doorvoeringen", "Deuren en kozijnen", "Wanden en plafonds", "Schachten", "Onderhoud", "Overige werkzaamheden"];
    const CATEGORIEEN = ["arbeid", "materiaal", "onderaanneming", "materieel", "overig"];

    // Instructie afhankelijk van beschikbare data
    const databronInstructie = opnameInfo
      ? "Gebruik de opname-bevindingen als primaire basis voor hoeveelheden en werkzaamheden. De spotaantallen geven aanvullende context over de bestaande situatie."
      : spotenInfo
        ? "Gebruik de geregistreerde spotaantallen als basis voor hoeveelheden."
        : "Er zijn geen spots of opname-bevindingen beschikbaar — schat realistisch op basis van de projectomschrijving.";

    const vullenContext = [
      gebouwInfo || null,
      `Project: ${header.naam}${header.projectNaam ? ` (${header.projectNaam})` : ""}${header.omschrijving ? `\nOmschrijving: ${header.omschrijving}` : ""}`,
      spotenInfo ? spotenInfo : null,
      opnameInfo ? opnameInfo : null,
      `Beschikbare normtijden (gebruik de exacte code als normtijd_code, max 3 selecteren):\n${normtijdLijst || "(geen normtijden beschikbaar)"}`,
      `Beschikbare tarieven uit de database (gebruik deze prijzen in de calculatie):\n${tarievenLijst}`,
      `Al aanwezige regels (voeg geen duplicaten toe):\n${bestaandeLijst}`,
      databronInstructie,
      `JSON formaat (ALLEEN dit object teruggeven, geen uitleg):\n{\n  "regels": [\n    {\n      "hoofdstuk": "${HOOFDSTUKKEN[0]}",\n      "categorie": "arbeid",\n      "omschrijving": "Omschrijving van de werkzaamheid",\n      "eenheid": "st",\n      "hoeveelheid": 10,\n      "tarief": 0,\n      "mu_per_eenheid": 0.5,\n      "arbeids_tarief": ${standaardArbeidstarief},\n      "onderaanneming_bedrag": 0,\n      "is_staartkosten": false,\n      "is_bouwplaatskosten": false,\n      "klanttekst": "Tekst voor in de offerte"\n    }\n  ],\n  "waarschuwingen": ["Controleer hoeveelheid doorvoeringen op tekening"]\n}`,
      `Toegestane hoofdstukken: ${HOOFDSTUKKEN.join(", ")}`,
      `Toegestane categorieën: ${CATEGORIEEN.join(", ")}`,
    ].filter(Boolean).join("\n\n");

    if (!heeftGateway()) {
      return void res.json({ regels: [], waarschuwingen: ["AI is niet beschikbaar in deze omgeving."] });
    }

    const calcRegelResultaat = await aiGateway.chat("default", {
      messages: [
        { role: "system", content: CALCULATIE_VULLEN_BASE_PROMPT.tekst },
        { role: "user", content: vullenContext },
      ],
      max_completion_tokens: 2000,
    }, undefined, {
      module: "calculaties",
      functie: "calculatie_vullen",
      promptNaam: CALCULATIE_VULLEN_BASE_PROMPT.naam,
      promptVersie: CALCULATIE_VULLEN_BASE_PROMPT.versie,
    });

    const raw = (calcRegelResultaat.ok ? calcRegelResultaat.inhoud : "{}").trim();
    let regels: unknown[] = [];
    let waarschuwingen: string[] = [];
    try {
      const parsed = JSON.parse(raw.startsWith("```") ? raw.replace(/```json?\n?/g, "").replace(/```/g, "") : raw) as Record<string, unknown>;
      regels = Array.isArray(parsed["regels"]) ? (parsed["regels"] as unknown[]) : [];
      waarschuwingen = Array.isArray(parsed["waarschuwingen"]) ? (parsed["waarschuwingen"] as string[]) : [];
    } catch {
      regels = [];
    }

    res.json({ regels, waarschuwingen });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "AI-voorstel mislukt" });
  }
});

// ── Maak offerte vanuit calculatie ─────────────────────────────────────────
router.post("/modules/calculaties/:id/maak-offerte", schrijvenCalc, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params["id"]);

    const [header] = await db.select().from(modCalcHeadersTable).where(eq(modCalcHeadersTable.id, id));
    if (!header) return void res.status(404).json({ error: "Calculatie niet gevonden" });

    const alleRegels = await db.select().from(modCalcRegelsTable)
      .where(eq(modCalcRegelsTable.calculatieId, id))
      .orderBy(asc(modCalcRegelsTable.volgorde));

    // ADVIES_01 §6: tekst/stelpost/kop gaan niet als begrotingsregel naar de offerte.
    // optioneel=true gaat wél mee, maar als apart optioneel blok (is_optioneel).
    const meetellendeRegels = alleRegels.filter((r) => teltMee(r));
    const regels = meetellendeRegels.filter((r) => !r.optioneel);
    const optioneleRegels = meetellendeRegels.filter((r) => r.optioneel);

    // CALC_KERN_01: het offertetotaal komt uit dezelfde rekenkern als lijst,
    // detail en print — incl. materiaal-/arbeidsopslag en de vaste-bedrag-
    // varianten van AK/ABK/risico/winst (de oude keten negeerde die).
    const offerteKern = berekenTotalen(
      alleRegels.map((r) => ({
        hoeveelheid: r.hoeveelheid, tarief: r.tarief,
        muPerEenheid: (r as any).muPerEenheid ?? 0,
        arbeidsTarief: (r as any).arbeidsTarief ?? 0,
        onderaannemingBedrag: (r as any).onderaannemingBedrag ?? 0,
        isStaartkosten: r.isStaartkosten, isBouwplaatskosten: (r as any).isBouwplaatskosten,
        totaal: r.totaal, soort: (r as any).soort, optioneel: (r as any).optioneel,
      })),
      {
        opslagMateriaal: (header as any).opslagMateriaal ?? 0,
        opslagArbeid: (header as any).opslagArbeid ?? 0,
        opslagAk: header.opslagAk,
        opslagAbk: (header as any).opslagAbk ?? 10,
        opslagRisico: header.opslagRisico,
        opslagWinst: header.opslagWinst,
        korting: header.korting,
        akIsVast: (header as any).akIsVast ?? false,
        abkIsVast: (header as any).abkIsVast ?? false,
        risicoIsVast: (header as any).risicoIsVast ?? false,
        winstIsVast: (header as any).winstIsVast ?? false,
      },
    ).kern;
    const bedragExcl = offerteKern.totaal_na_opslagen;
    const bedragIncl = offerteKern.incl_btw;

    let gebouwNaam: string | null = null;
    if (header.gebouwId) {
      const [g] = await db.select({ naam: gebouwenTable.naam }).from(gebouwenTable).where(eq(gebouwenTable.id, header.gebouwId));
      gebouwNaam = g?.naam ?? null;
    }

    const vandaag = new Date().toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });
    const titel = gebouwNaam ? `${header.naam} — ${gebouwNaam}` : header.naam;

    const [offerte] = await db.insert(offertesTable).values({
      titel,
      gebouwId: header.gebouwId ?? null,
      opdrachtgever: header.klantNaam ?? null,
      onsKenmerk: header.referentie ?? null,
      uwKenmerk: `CALC-${header.id}`,
      datum: vandaag,
      geldigheidDagen: 30,
      bedragExclBtw: bedragExcl,
      btwPercentage: 21,
      bedragInclBtw: bedragIncl,
      calculatieId: header.id,
      status: "concept",
      aangemaaktDoorId: req.session.userId ?? null,
    } as typeof offertesTable.$inferInsert).returning();

    if (regels.length > 0) {
      await db.insert(offerteRegelsTable).values(
        regels.map((r, i) => ({
          offerteId: offerte.id,
          categorie: r.isStaartkosten ? "staartkosten" : "maatregel",
          maatregel: r.omschrijving,
          eenheid: r.eenheid || "st",
          aantal: r.hoeveelheid,
          prijsPerEenheid: r.hoeveelheid > 0 ? Math.round((r.totaal / r.hoeveelheid) * 100) / 100 : r.totaal,
          kosten: r.totaal,
          volgorde: i + 1,
        }))
      );
    }

    // Optionele regels als apart optioneel blok naar de offerte (zoals de Cityflat-optie).
    if (optioneleRegels.length > 0) {
      await db.insert(offerteRegelsTable).values(
        optioneleRegels.map((r, i) => ({
          offerteId: offerte.id,
          categorie: "maatregel",
          maatregel: r.omschrijving,
          eenheid: r.eenheid || "st",
          aantal: r.hoeveelheid,
          prijsPerEenheid: r.hoeveelheid > 0 ? Math.round((r.totaal / r.hoeveelheid) * 100) / 100 : r.totaal,
          kosten: r.totaal,
          isOptioneel: true,
          volgorde: regels.length + i + 1,
        }))
      );
    }

    // CALC_KERN_01: opslagbedragen uit dezelfde kern-uitkomst als het totaal.
    const opslagen = [
      { label: (header as any).akIsVast ? "Algemene kosten (vast)" : `Algemene kosten (${header.opslagAk}%)`, bedrag: offerteKern.ak_bedrag },
      { label: (header as any).abkIsVast ? "Algemene bedrijfskosten (vast)" : `Algemene bedrijfskosten (${(header as any).opslagAbk ?? 10}%)`, bedrag: offerteKern.abk_bedrag },
      { label: (header as any).risicoIsVast ? "Risico (vast)" : `Risico (${header.opslagRisico}%)`, bedrag: offerteKern.risico_bedrag },
      { label: (header as any).winstIsVast ? "Winst (vast)" : `Winst (${header.opslagWinst}%)`, bedrag: offerteKern.winst_bedrag },
    ];
    if (header.korting > 0) {
      opslagen.push({ label: `Korting (${header.korting}%)`, bedrag: -offerteKern.korting_bedrag });
    }
    await db.insert(offerteRegelsTable).values(
      opslagen.map((o, i) => ({
        offerteId: offerte.id,
        categorie: "algemene_kosten",
        maatregel: o.label,
        eenheid: "st",
        aantal: 1,
        prijsPerEenheid: o.bedrag,
        kosten: o.bedrag,
        volgorde: regels.length + optioneleRegels.length + i + 1,
      }))
    );

    res.status(201).json({ offerte_id: offerte.id });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── Versie opslaan ────────────────────────────────────────────────────────
router.post("/modules/calculaties/:id/versie-opslaan", schrijvenCalc, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params["id"]);
    const [header] = await db.select().from(modCalcHeadersTable).where(eq(modCalcHeadersTable.id, id));
    if (!header) return void res.status(404).json({ error: "Calculatie niet gevonden" });

    const regels = await db.select().from(modCalcRegelsTable)
      .where(eq(modCalcRegelsTable.calculatieId, id))
      .orderBy(asc(modCalcRegelsTable.volgorde));

    const [bestaandeVersies] = await db.select({ max: sql<number>`coalesce(max(versienummer),0)` })
      .from(modCalcVersiesTable)
      .where(eq(modCalcVersiesTable.calculatieId, id));

    const volgendNummer = (bestaandeVersies?.max ?? 0) + 1;
    const label = (req.body as Record<string, unknown>).label as string | undefined;

    const snapshot = {
      header: {
        naam: header.naam, referentie: header.referentie, klantNaam: header.klantNaam,
        projectNaam: header.projectNaam, status: header.status, omschrijving: header.omschrijving,
        opslagAk: header.opslagAk, opslagAbk: header.opslagAbk, opslagRisico: header.opslagRisico,
        opslagWinst: header.opslagWinst, korting: header.korting,
      },
      regels: regels.map((r) => ({
        categorie: r.categorie, omschrijving: r.omschrijving, eenheid: r.eenheid,
        hoeveelheid: r.hoeveelheid, tarief: r.tarief, muPerEenheid: r.muPerEenheid,
        arbeidsTarief: r.arbeidsTarief, onderaannemingBedrag: r.onderaannemingBedrag,
        totaal: r.totaal, isStaartkosten: r.isStaartkosten, hoofdstuk: r.hoofdstuk,
      })),
    };

    const [versie] = await db.insert(modCalcVersiesTable).values({
      calculatieId: id,
      versienummer: volgendNummer,
      label: label ?? `Versie ${volgendNummer}`,
      snapshot: snapshot as Record<string, unknown>,
      aangemaaktDoorId: req.session.userId ?? null,
    }).returning();

    res.status(201).json({
      id: versie.id,
      versienummer: versie.versienummer,
      label: versie.label,
      aangemaakt_op: iso(versie.aangemaaktOp),
    });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.get("/modules/calculaties/:id/versies", lezenCalc, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params["id"]);
    const rows = await db.select({
      id: modCalcVersiesTable.id,
      versienummer: modCalcVersiesTable.versienummer,
      label: modCalcVersiesTable.label,
      aangemaaktOp: modCalcVersiesTable.aangemaaktOp,
      aangemaaktDoorId: modCalcVersiesTable.aangemaaktDoorId,
    }).from(modCalcVersiesTable)
      .where(eq(modCalcVersiesTable.calculatieId, id))
      .orderBy(desc(modCalcVersiesTable.versienummer));

    res.json(rows.map((v) => ({
      id: v.id,
      versienummer: v.versienummer,
      label: v.label,
      aangemaakt_op: iso(v.aangemaaktOp),
    })));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.get("/modules/calculaties/:id/versies/:versieId", lezenCalc, async (req, res): Promise<void> => {
  try {
    const versieId = parseId(req.params["versieId"]);
    const [v] = await db.select().from(modCalcVersiesTable).where(eq(modCalcVersiesTable.id, versieId));
    if (!v) return void res.status(404).json({ error: "Versie niet gevonden" });
    res.json({
      id: v.id,
      versienummer: v.versienummer,
      label: v.label,
      snapshot: v.snapshot,
      aangemaakt_op: iso(v.aangemaaktOp),
    });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── Print-data endpoint ────────────────────────────────────────────────────
router.get("/modules/calculaties/:id/print-data", lezenCalc, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params["id"]);
    const [header] = await db.select().from(modCalcHeadersTable).where(eq(modCalcHeadersTable.id, id));
    if (!header) return void res.status(404).json({ error: "Calculatie niet gevonden" });

    const regels = await db.select().from(modCalcRegelsTable)
      .where(eq(modCalcRegelsTable.calculatieId, id))
      .orderBy(asc(modCalcRegelsTable.volgorde));

    let gebouwNaam: string | null = null;
    let werkgeverId: number | null = null;

    // Stabiele werkgever-bron 1: gebouw.werkgever_id (meest betrouwbaar).
    if (header.gebouwId) {
      const [g] = await db
        .select({ naam: gebouwenTable.naam, werkgeverId: gebouwenTable.werkgeverId })
        .from(gebouwenTable)
        .where(eq(gebouwenTable.id, header.gebouwId));
      gebouwNaam = g?.naam ?? null;
      werkgeverId = g?.werkgeverId ?? null;
    }

    // Stabiele werkgever-bron 2 (fallback als er geen gebouw of het gebouw geen
    // werkgever heeft): de werkgever van de medewerker die de calculatie aanmaakte.
    // Calculaties zijn interne documenten; de aanmaker is altijd een medewerker
    // van één werkmaatschappij. Dit is stabieler dan een globale app-instelling.
    if (werkgeverId == null && header.aangemaaktDoorId) {
      const [m] = await db
        .select({ werkgeverId: medewerkersTable.werkgeverId })
        .from(medewerkersTable)
        .where(eq(medewerkersTable.gebruikerId, header.aangemaaktDoorId))
        .limit(1);
      werkgeverId = m?.werkgeverId ?? null;
    }

    // Branding server-side oplossen zodat calculaties:1 voldoende is (geen personeel:1 nodig).
    type BrandingData = {
      werkgever_naam: string | null; primaire_kleur: string;
      logo_url: string | null; adres: string | null; postcode: string | null;
      plaats: string | null; telefoon: string | null; email: string | null;
      studio_model_naam: string | null; studio_primaire_kleur: string | null;
    };
    let branding: BrandingData | null = null;
    if (werkgeverId) {
      const [wg] = await db
        .select({
          naam: werkgeversTable.naam, primaireKleur: werkgeversTable.primaireKleur,
          logoUrl: werkgeversTable.logoUrl, adres: werkgeversTable.adres,
          postcode: werkgeversTable.postcode, plaats: werkgeversTable.plaats,
          telefoon: werkgeversTable.telefoon, email: werkgeversTable.email,
        })
        .from(werkgeversTable)
        .where(eq(werkgeversTable.id, werkgeverId));
      const [model] = await db
        .select({ naam: documentStudioModellenTable.naam, connectTemplateJson: documentStudioModellenTable.connectTemplateJson })
        .from(documentStudioModellenTable)
        .where(and(
          eq(documentStudioModellenTable.werkgeverId, werkgeverId),
          eq(documentStudioModellenTable.documentType, "calculatie"),
          eq(documentStudioModellenTable.status, "goedgekeurd"),
        ))
        .orderBy(desc(documentStudioModellenTable.goedgekeurdOp))
        .limit(1);
      let studioPrimaireKleur: string | null = null;
      if (model?.connectTemplateJson) {
        try {
          const t = JSON.parse(model.connectTemplateJson) as { kleurschema?: { primair?: string } };
          studioPrimaireKleur = t.kleurschema?.primair ?? null;
        } catch { /* ignore */ }
      }
      // Canonicaliseer logo_url naar /api/storage/objects/<subPath> zodat de
      // browser de afbeelding via de geauthenticeerde objects-route kan laden.
      // Legacy /api/storage/files?path=... en /objects/... worden genormaliseerd;
      // externe http(s)-URLs en paden buiten de werkgever/algemeen-prefix worden
      // verwijderd (null). Zie lib/werkgever-logo-pad.ts voor de ACL-logica.
      const rawLogoUrl = wg?.logoUrl ?? null;
      const canoniekLogoUrl = (() => {
        if (!rawLogoUrl) return null;
        const subPath = resolveWerkgeverLogoSubPath(rawLogoUrl);
        if (subPath === null) return null;
        return `/api/storage/objects/${encodeURIComponent(subPath)}`;
      })();
      branding = {
        werkgever_naam: wg?.naam ?? null,
        primaire_kleur: wg?.primaireKleur ?? "#F23B0D",
        logo_url: canoniekLogoUrl,
        adres: wg?.adres ?? null,
        postcode: wg?.postcode ?? null,
        plaats: wg?.plaats ?? null,
        telefoon: wg?.telefoon ?? null,
        email: wg?.email ?? null,
        studio_model_naam: model?.naam ?? null,
        studio_primaire_kleur: studioPrimaireKleur,
      };
    }

    // CALC_KERN_01: print rekent via exact dezelfde kern als het scherm en de
    // lijst/detail-routes — geen eigen (legacy) formuleketen meer. Daarmee
    // respecteert de print nu ook de vaste-bedragvarianten van AK/ABK/risico/
    // winst en de juiste winstbasis (subtotaal + AK + ABK + risico).
    const opslagAbk = header.opslagAbk ?? 10;
    const kern = berekenTotalen(
      regels.map((r) => ({
        hoeveelheid: r.hoeveelheid, tarief: r.tarief,
        muPerEenheid: r.muPerEenheid, arbeidsTarief: r.arbeidsTarief,
        onderaannemingBedrag: r.onderaannemingBedrag,
        isStaartkosten: r.isStaartkosten, isBouwplaatskosten: r.isBouwplaatskosten,
        totaal: r.totaal, soort: r.soort, optioneel: r.optioneel,
      })),
      {
        opslagMateriaal: header.opslagMateriaal ?? 0,
        opslagArbeid: header.opslagArbeid ?? 0,
        opslagAk: header.opslagAk,
        opslagAbk,
        opslagRisico: header.opslagRisico,
        opslagWinst: header.opslagWinst,
        korting: header.korting,
        akIsVast: header.akIsVast ?? false,
        abkIsVast: header.abkIsVast ?? false,
        risicoIsVast: header.risicoIsVast ?? false,
        winstIsVast: header.winstIsVast ?? false,
      },
    ).kern;
    const optioneelTotaal = kern.optioneel_totaal;
    const subtotaal = rond2(kern.subtotaal - kern.staart_subtotaal);
    const staarttotaal = kern.staart_subtotaal;
    const akBedrag = kern.ak_bedrag;
    const abkBedrag = kern.abk_bedrag;
    const risicoBedrag = kern.risico_bedrag;
    const winstBedrag = kern.winst_bedrag;
    const kortingBedrag = kern.korting_bedrag;
    const eindtotaal = kern.totaal_na_opslagen;

    res.json({
      header: {
        id: header.id, naam: header.naam, referentie: header.referentie,
        klant_naam: header.klantNaam, project_naam: header.projectNaam,
        status: header.status, omschrijving: header.omschrijving,
        opslag_ak: header.opslagAk, opslag_abk: opslagAbk,
        opslag_risico: header.opslagRisico, opslag_winst: header.opslagWinst,
        korting: header.korting, gebouw_naam: gebouwNaam,
        aangemaakt_op: iso(header.aangemaaktOp),
      },
      branding,
      regels: regels.map((r) => ({
        id: r.id, categorie: r.categorie, omschrijving: r.omschrijving,
        eenheid: r.eenheid, hoeveelheid: r.hoeveelheid, tarief: r.tarief,
        mu_per_eenheid: r.muPerEenheid, arbeids_tarief: r.arbeidsTarief,
        onderaanneming_bedrag: r.onderaannemingBedrag, totaal: r.totaal,
        is_staartkosten: r.isStaartkosten, hoofdstuk: r.hoofdstuk,
        regelnummer: r.regelnummer,
        soort: r.soort ?? "regel", optioneel: r.optioneel ?? false,
        ouder_regel_id: r.ouderRegelId ?? null,
      })),
      totalen: {
        subtotaal, staarttotaal, ak_bedrag: akBedrag, abk_bedrag: abkBedrag,
        risico_bedrag: risicoBedrag, winst_bedrag: winstBedrag,
        korting_bedrag: kortingBedrag, eindtotaal,
        excl_btw: eindtotaal, incl_btw: Math.round(eindtotaal * 1.21 * 100) / 100,
        optioneel_totaal: optioneelTotaal,
      },
    });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── Calculatie inkoopitems (offertes materialen / onderaannemers) ────────────

function mapInkoopItem(i: typeof modCalcInkoopItemsTable.$inferSelect) {
  return {
    id: i.id,
    calculatie_id: i.calculatieId,
    regel_id: i.regelId ?? null,
    type: i.type,
    omschrijving: i.omschrijving,
    artikel: i.artikel ?? null,
    leverancier: i.leverancier ?? null,
    leverancier_id: i.leverancierId ?? null,
    leverancier_email: i.leverancierEmail ?? null,
    gekozen_leverancier: i.gekozenLeverancier ?? null,
    aantal: i.aantal ?? null,
    eenheid: i.eenheid ?? null,
    prijs: i.prijs ?? null,
    offerte_ontvangen: i.offerteOntvangen ?? false,
    levertijd: i.levertijd ?? null,
    reactiedatum: i.reactiedatum ?? null,
    beslisdatum: i.beslisdatum ?? null,
    leverdatum: i.leverdatum ?? null,
    toelichting: i.toelichting ?? null,
    concept_mail: i.conceptMail ?? null,
    herinnering_verstuurd: i.herinneringVerstuurd ?? false,
    status: i.status,
    datum_verstuurd: i.datumVerstuurd ?? null,
    datum_ontvangen: i.datumOntvangen ?? null,
    bedrag: i.bedrag ?? null,
    notities: i.notities ?? null,
    aangemaakt_op: iso(i.aangemaaktOp),
    bijgewerkt_op: iso(i.bijgewerktOp),
  };
}

router.get("/modules/calculaties/:id/inkoop-items", lezenCalc, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params["id"]);
    const items = await db
      .select()
      .from(modCalcInkoopItemsTable)
      .where(eq(modCalcInkoopItemsTable.calculatieId, id))
      .orderBy(asc(modCalcInkoopItemsTable.aangemaaktOp));
    res.json(items.map((i) => mapInkoopItem(i)));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.post("/modules/calculaties/:id/inkoop-items", schrijvenCalc, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params["id"]);
    const [calc] = await db.select({ id: modCalcHeadersTable.id }).from(modCalcHeadersTable).where(eq(modCalcHeadersTable.id, id));
    if (!calc) return void res.status(404).json({ error: "Calculatie niet gevonden" });
    const body = req.body as Record<string, unknown>;
    if (!String(body.omschrijving ?? "").trim()) return void res.status(422).json({ error: "Omschrijving is verplicht" });
    const [item] = await db.insert(modCalcInkoopItemsTable).values({
      calculatieId: id,
      regelId: body.regel_id != null ? Number(body.regel_id) : null,
      type: body.type ? String(body.type) : "materiaal",
      omschrijving: String(body.omschrijving).trim(),
      artikel: body.artikel ? String(body.artikel) : null,
      leverancier: body.leverancier ? String(body.leverancier) : null,
      leverancierId: body.leverancier_id != null ? Number(body.leverancier_id) : null,
      leverancierEmail: body.leverancier_email ? String(body.leverancier_email) : null,
      gekozenLeverancier: body.gekozen_leverancier ? String(body.gekozen_leverancier) : null,
      aantal: body.aantal != null ? Number(body.aantal) : null,
      eenheid: body.eenheid ? String(body.eenheid) : "st",
      prijs: body.prijs != null ? Number(body.prijs) : null,
      offerteOntvangen: body.offerte_ontvangen ? Boolean(body.offerte_ontvangen) : false,
      levertijd: body.levertijd ? String(body.levertijd) : null,
      reactiedatum: body.reactiedatum ? String(body.reactiedatum) : null,
      beslisdatum: body.beslisdatum ? String(body.beslisdatum) : null,
      leverdatum: body.leverdatum ? String(body.leverdatum) : null,
      toelichting: body.toelichting ? String(body.toelichting) : null,
      status: body.status ? String(body.status) : "concept",
      datumVerstuurd: body.datum_verstuurd ? String(body.datum_verstuurd) : null,
      datumOntvangen: body.datum_ontvangen ? String(body.datum_ontvangen) : null,
      bedrag: body.bedrag != null ? Number(body.bedrag) : null,
      notities: body.notities ? String(body.notities) : null,
    } as typeof modCalcInkoopItemsTable.$inferInsert).returning();
    res.status(201).json(mapInkoopItem(item));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.patch("/modules/calculaties/:id/inkoop-items/:itemId", schrijvenCalc, async (req, res): Promise<void> => {
  try {
    const itemId = parseId(req.params["itemId"]);
    const body = req.body as Record<string, unknown>;
    const upd: Record<string, unknown> = { bijgewerktOp: new Date() };
    if (body.type !== undefined) upd["type"] = body.type;
    if (body.omschrijving !== undefined) upd["omschrijving"] = body.omschrijving;
    if (body.artikel !== undefined) upd["artikel"] = body.artikel ?? null;
    if (body.leverancier !== undefined) upd["leverancier"] = body.leverancier ?? null;
    if (body.gekozen_leverancier !== undefined) upd["gekozenLeverancier"] = body.gekozen_leverancier ?? null;
    if (body.aantal !== undefined) upd["aantal"] = body.aantal != null ? Number(body.aantal) : null;
    if (body.eenheid !== undefined) upd["eenheid"] = body.eenheid ?? null;
    if (body.prijs !== undefined) upd["prijs"] = body.prijs != null ? Number(body.prijs) : null;
    if (body.offerte_ontvangen !== undefined) upd["offerteOntvangen"] = Boolean(body.offerte_ontvangen);
    if (body.levertijd !== undefined) upd["levertijd"] = body.levertijd ?? null;
    if (body.status !== undefined) upd["status"] = body.status;
    if (body.datum_verstuurd !== undefined) upd["datumVerstuurd"] = body.datum_verstuurd;
    if (body.datum_ontvangen !== undefined) upd["datumOntvangen"] = body.datum_ontvangen;
    if (body.bedrag !== undefined) upd["bedrag"] = body.bedrag ?? null;
    if (body.notities !== undefined) upd["notities"] = body.notities ?? null;
    if (body.regel_id !== undefined) upd["regelId"] = body.regel_id ?? null;
    if (body.leverancier_id !== undefined) upd["leverancierId"] = body.leverancier_id ?? null;
    if (body.leverancier_email !== undefined) upd["leverancierEmail"] = body.leverancier_email ?? null;
    if (body.reactiedatum !== undefined) upd["reactiedatum"] = body.reactiedatum ?? null;
    if (body.beslisdatum !== undefined) upd["beslisdatum"] = body.beslisdatum ?? null;
    if (body.leverdatum !== undefined) upd["leverdatum"] = body.leverdatum ?? null;
    if (body.toelichting !== undefined) upd["toelichting"] = body.toelichting ?? null;
    if (body.concept_mail !== undefined) upd["conceptMail"] = body.concept_mail ?? null;
    if (body.herinnering_verstuurd !== undefined) upd["herinneringVerstuurd"] = Boolean(body.herinnering_verstuurd);
    const [item] = await db.update(modCalcInkoopItemsTable)
      .set(upd)
      .where(eq(modCalcInkoopItemsTable.id, itemId))
      .returning();
    if (!item) return void res.status(404).json({ error: "Item niet gevonden" });
    res.json(mapInkoopItem(item));
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

router.delete("/modules/calculaties/:id/inkoop-items/:itemId", schrijvenCalc, async (req, res): Promise<void> => {
  try {
    const itemId = parseId(req.params["itemId"]);
    await db.delete(modCalcInkoopItemsTable).where(eq(modCalcInkoopItemsTable.id, itemId));
    res.status(204).end();
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

// ── POST /modules/calculaties/:id/inkoop-items/:itemId/concept-mail ─────────

router.post("/modules/calculaties/:id/inkoop-items/:itemId/concept-mail", schrijvenCalc, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params["id"]);
    const itemId = parseId(req.params["itemId"]);

    const [[header], [item]] = await Promise.all([
      db.select().from(modCalcHeadersTable).where(eq(modCalcHeadersTable.id, id)),
      db.select().from(modCalcInkoopItemsTable).where(eq(modCalcInkoopItemsTable.id, itemId)),
    ]);
    if (!header) { res.status(404).json({ error: "Calculatie niet gevonden" }); return; }
    if (!item) { res.status(404).json({ error: "Item niet gevonden" }); return; }

    if (!heeftGateway()) { res.status(503).json({ error: "AI niet beschikbaar" }); return; }

    const inkoopMailContext = [
      "Projectgegevens:",
      `- Project: ${header.projectNaam ?? header.naam}`,
      `- Werknummer: ${header.werknummer ?? "—"}`,
      `- Klant: ${header.klantNaam ?? "—"}`,
      "",
      "Gevraagd materiaal/dienst:",
      `- Omschrijving: ${item.omschrijving}`,
      `- Type: ${item.type === "onderaanneming" ? "Onderaanneming" : "Materiaal"}`,
      `- Hoeveelheid: ${item.aantal ?? "—"} ${item.eenheid ?? ""}`,
      `- Artikel: ${item.artikel ?? "—"}`,
      `- Gewenste leverdatum: ${item.leverdatum ?? "nog te bepalen"}`,
      `- Uiterste reactiedatum: ${item.reactiedatum ?? "zo spoedig mogelijk"}`,
      item.toelichting ? `- Toelichting: ${item.toelichting}` : null,
    ].filter((l) => l !== null).join("\n");

    // INKOOP_AI_01 — eigen prijshistorie meegeven zodat de offerteaanvraag om
    // een gerichte prijs kan vragen in plaats van blanco.
    const mailArtikelen = item.eenheid
      ? [{ omschrijving: item.omschrijving, eenheid: item.eenheid, calcPrijs: null }]
      : [];
    const mailHistorie = mailArtikelen.length > 0 ? await haalInkoopHistorie(mailArtikelen) : new Map();
    const mailEigenCijfers = mailArtikelen.length > 0
      ? "\n\n" + bouwInkoopEigenCijfersContext(mailArtikelen, mailHistorie)
      : "";

    const antwoord = await aiGateway.chat("default", {
      messages: [
        { role: "system", content: CALCULATIE_INKOOP_MAIL_PROMPT.tekst },
        { role: "user", content: inkoopMailContext + mailEigenCijfers },
      ],
      max_completion_tokens: 600,
    }, undefined, {
      module: "calculaties",
      functie: "inkoop_mail",
      promptNaam: CALCULATIE_INKOOP_MAIL_PROMPT.naam,
      promptVersie: CALCULATIE_INKOOP_MAIL_PROMPT.versie,
    });

    const conceptMail = (antwoord.ok ? antwoord.inhoud : "").trim();

    await db.update(modCalcInkoopItemsTable)
      .set({ conceptMail, bijgewerktOp: new Date() })
      .where(eq(modCalcInkoopItemsTable.id, itemId));

    res.json({ concept_mail: conceptMail });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout bij genereren conceptmail" });
  }
});

// ── POST /modules/calculaties/:id/ai-chat ─────────────────────────────────
router.post("/modules/calculaties/:id/ai-chat", lezenCalc, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params["id"]);
    const { berichten, afbeelding_base64 } = req.body as {
      berichten: Array<{ rol: "gebruiker" | "assistent"; inhoud: string }>;
      afbeelding_base64?: string | null;
    };

    if (!Array.isArray(berichten) || berichten.length === 0) {
      res.status(400).json({ error: "Berichten ontbreken" }); return;
    }

    const [header] = await db.select().from(modCalcHeadersTable).where(eq(modCalcHeadersTable.id, id));
    if (!header) { res.status(404).json({ error: "Calculatie niet gevonden" }); return; }

    const [bestaandeRegels, normtijden, tarieven] = await Promise.all([
      db.select().from(modCalcRegelsTable)
        .where(eq(modCalcRegelsTable.calculatieId, id))
        .orderBy(asc(modCalcRegelsTable.volgorde)),
      db.select().from(modCalcNormtijdenTable).where(eq(modCalcNormtijdenTable.actief, true)).limit(40),
      db.select().from(modCalcTarievenTable)
        .where(eq(modCalcTarievenTable.actief, true))
        .orderBy(asc(modCalcTarievenTable.categorie), asc(modCalcTarievenTable.naam)),
    ]);

    let gebouwInfo = "";
    let spotenInfo = "";
    let opnameInfo = "";

    if (header.gebouwId) {
      const gId = header.gebouwId;
      const [[g], spotCounts, opnameItems] = await Promise.all([
        db.select().from(gebouwenTable).where(eq(gebouwenTable.id, gId)).limit(1),
        db.select({ type: voorzieningenTable.type, aantal: count() })
          .from(voorzieningenTable)
          .where(and(eq(voorzieningenTable.gebouwId, gId), eq(voorzieningenTable.gearchiveerd, false)))
          .groupBy(voorzieningenTable.type),
        db.select({
          opnameNaam: opnamesTable.naam,
          opnameDatum: opnamesTable.datum,
          spotType: opnameItemsTable.spotType,
          actie: opnameItemsTable.actie,
          aantal: opnameItemsTable.aantal,
          afmetingen: opnameItemsTable.afmetingen,
          prioriteit: opnameItemsTable.prioriteit,
          beschrijving: opnameItemsTable.beschrijving,
        })
          .from(opnamesTable)
          .innerJoin(opnameItemsTable, eq(opnameItemsTable.opnameId, opnamesTable.id))
          .where(eq(opnamesTable.gebouwId, gId))
          .orderBy(desc(opnamesTable.datum))
          .limit(80),
      ]);
      if (g) {
        gebouwInfo = `Gebouw: ${g.naam}, ${(g as any).adres ?? ""} ${(g as any).stad ?? ""}. Bouwjaar: ${(g as any).bouwjaar ?? "onbekend"}.`;
      }
      if (spotCounts.length > 0) {
        spotenInfo = "Geregistreerde spots in dit gebouw:\n" +
          spotCounts.map((s) => `- ${s.type}: ${s.aantal} stuks`).join("\n");
      }
      if (opnameItems.length > 0) {
        opnameInfo = "Veldopname bevindingen:\n" +
          opnameItems.map((item) => {
            const d: string[] = [`${item.spotType}: ${item.actie} × ${item.aantal}`];
            if (item.afmetingen) d.push(`afm: ${item.afmetingen}`);
            if (item.prioriteit === "hoog") d.push("prioriteit: hoog");
            if (item.beschrijving) d.push(item.beschrijving);
            return `- ${d.join(" | ")}`;
          }).join("\n");
      }
    }

    const regelenLijst = bestaandeRegels.length > 0
      ? bestaandeRegels.map((r) =>
          `- ${(r as any).hoofdstuk ?? "Overige"} | ${r.categorie} | ${r.omschrijving} | ${r.hoeveelheid} ${r.eenheid} | €${r.tarief}${r.muPerEenheid ? ` | MU: ${r.muPerEenheid}` : ""}`
        ).join("\n")
      : "(nog geen regels ingevoerd)";

    const normtijdLijst = normtijden.length > 0
      ? normtijden.map((n) => `${n.code}: ${n.omschrijving} (${n.urenPerEenheid} uur/${n.eenheid})`).join("\n")
      : "(geen normtijden geconfigureerd)";

    const tarievenLijst = tarieven.length > 0
      ? tarieven.map((t) => `[${t.categorie}] ${t.naam}: €${t.tarief}/${t.eenheid}`).join("\n")
      : "(geen tarieven geconfigureerd — gebruik marktprijzen)";

    const calcContext = [
      `CALCULATIE: ${header.naam}${header.projectNaam ? ` — Project: ${header.projectNaam}` : ""}${header.omschrijving ? `\nOmschrijving: ${header.omschrijving}` : ""}`,
      `Status: ${header.status ?? "concept"}`,
      gebouwInfo || null,
      spotenInfo || null,
      opnameInfo || null,
      `HUIDIGE CALCULATIEREGELS (${bestaandeRegels.length} regels):\n${regelenLijst}`,
      `BESCHIKBARE NORMTIJDEN:\n${normtijdLijst}`,
      `TARIEVEN UIT HET SYSTEEM:\n${tarievenLijst}`,
    ].filter(Boolean).join("\n");
    const systeemPrompt = calcContext + "\n\n" + CALCULATIE_CHAT_BASE_PROMPT.tekst;

    if (!heeftGateway()) {
      res.json({ antwoord: "AI-chat is niet beschikbaar. Controleer de OpenAI-configuratie.", signalen: [] });
      return;
    }

    type Msg = { role: "system" | "user" | "assistant"; content: string | Array<Record<string, unknown>> };
    const messages: Msg[] = [{ role: "system", content: systeemPrompt }];

    for (let i = 0; i < berichten.length; i++) {
      const b = berichten[i]!;
      if (b.rol === "gebruiker") {
        if (i === berichten.length - 1 && afbeelding_base64) {
          messages.push({
            role: "user",
            content: [
              { type: "text", text: b.inhoud },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${afbeelding_base64}` } },
            ],
          });
        } else {
          messages.push({ role: "user", content: b.inhoud });
        }
      } else {
        messages.push({ role: "assistant", content: b.inhoud });
      }
    }

    const calcChatResultaat = await aiGateway.chat("reasoning", {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: messages as any,
      max_completion_tokens: 2000,
    }, undefined, {
      module: "calculaties",
      functie: "calculatie_chat",
      promptNaam: CALCULATIE_CHAT_BASE_PROMPT.naam,
      promptVersie: CALCULATIE_CHAT_BASE_PROMPT.versie,
    });

    const antwoord = calcChatResultaat.ok ? calcChatResultaat.inhoud : "Geen antwoord ontvangen.";

    const signalen: string[] = [];
    const lw = antwoord.toLowerCase();
    if (lw.includes("ontbreekt") || lw.includes("ontbrekend") || lw.includes("vergeten")) {
      signalen.push("Mogelijke ontbrekende posten gesignaleerd");
    }
    if (lw.includes("eenheid") && (lw.includes("klopt niet") || lw.includes("onjuist") || lw.includes("let op"))) {
      signalen.push("Eenheden controlepunt aangewezen");
    }
    if (lw.includes("tarief") && (lw.includes("laag") || lw.includes("hoog") || lw.includes("afwijkend"))) {
      signalen.push("Tariefafwijking gedetecteerd");
    }

    res.json({ antwoord, signalen });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Serverfout bij AI-chat" });
  }
});

// ── POST /modules/calculaties/:id/ai-senior-analyse ───────────────────────
router.post("/modules/calculaties/:id/ai-senior-analyse", lezenCalc, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params["id"]);
    const [header] = await db.select().from(modCalcHeadersTable).where(eq(modCalcHeadersTable.id, id));
    if (!header) { res.status(404).json({ error: "Calculatie niet gevonden" }); return; }

    if (!heeftGateway()) {
      res.json([]);
      return;
    }

    const [regels, inkoopItems, tarieven] = await Promise.all([
      db.select().from(modCalcRegelsTable)
        .where(eq(modCalcRegelsTable.calculatieId, id))
        .orderBy(asc(modCalcRegelsTable.volgorde)),
      db.select().from(modCalcInkoopItemsTable)
        .where(eq(modCalcInkoopItemsTable.calculatieId, id)),
      db.select().from(modCalcTarievenTable)
        .where(eq(modCalcTarievenTable.actief, true))
        .orderBy(asc(modCalcTarievenTable.categorie)),
    ]);

    let gebouwInfo = "";
    let spotenInfo = "";
    let opnameInfo = "";

    if (header.gebouwId) {
      const gId = header.gebouwId;
      const [[g], spotCounts, opnameItems] = await Promise.all([
        db.select().from(gebouwenTable).where(eq(gebouwenTable.id, gId)).limit(1),
        db.select({ type: voorzieningenTable.type, aantal: count() })
          .from(voorzieningenTable)
          .where(and(eq(voorzieningenTable.gebouwId, gId), eq(voorzieningenTable.gearchiveerd, false)))
          .groupBy(voorzieningenTable.type),
        db.select({
          spotType: opnameItemsTable.spotType,
          actie: opnameItemsTable.actie,
          aantal: opnameItemsTable.aantal,
          prioriteit: opnameItemsTable.prioriteit,
          beschrijving: opnameItemsTable.beschrijving,
        })
          .from(opnamesTable)
          .innerJoin(opnameItemsTable, eq(opnameItemsTable.opnameId, opnamesTable.id))
          .where(eq(opnamesTable.gebouwId, gId))
          .orderBy(desc(opnamesTable.datum))
          .limit(60),
      ]);
      if (g) gebouwInfo = `Gebouw: ${(g as any).naam}, ${(g as any).adres ?? ""} ${(g as any).stad ?? ""}`;
      if (spotCounts.length > 0) {
        spotenInfo = spotCounts.map((s) => `${s.type}: ${s.aantal} stuks`).join("; ");
      }
      if (opnameItems.length > 0) {
        opnameInfo = opnameItems.map((i) => `${i.spotType}: ${i.actie} ×${i.aantal}${i.prioriteit === "hoog" ? " [HOOG]" : ""}${i.beschrijving ? " — " + i.beschrijving : ""}`).join("\n");
      }
    }

    const regelsTekst = regels.length > 0
      ? regels.map((r) => {
          const hr = (r as any).hoofdstuk ?? "Overige";
          const totaalMateriaal = Number(r.hoeveelheid) * Number(r.tarief);
          const totaalArbeid = Number(r.hoeveelheid) * Number(r.muPerEenheid ?? 0) * Number(r.arbeidsTarief ?? 0);
          return `[${hr}] ${r.categorie} | ${r.omschrijving} | ${r.hoeveelheid} ${r.eenheid} | mat €${r.tarief}/eenheid | arb MU ${r.muPerEenheid ?? 0} | OA €${r.onderaannemingBedrag ?? 0} | totaal €${(totaalMateriaal + totaalArbeid + Number(r.onderaannemingBedrag ?? 0)).toFixed(0)}`;
        }).join("\n")
      : "(geen regels)";

    const inkoopTekst = inkoopItems.length > 0
      ? inkoopItems.map((i) => `${i.type}: ${i.omschrijving}${(i as any).artikel ? " (" + (i as any).artikel + ")" : ""} — offerte ontvangen: ${(i as any).offerteOntvangen ? "ja" : "nee"}`).join("\n")
      : "(geen inkoopregels)";

    const eigenCijfers = await bouwEigenCijfersContext(header, regels);

    const opslagenTekst = [
      `AK: ${header.opslagAk ?? 15}%`,
      `ABK: ${(header as any).opslagAbk ?? 10}%`,
      `Risico: ${header.opslagRisico ?? 5}%`,
      `Winst: ${header.opslagWinst ?? 10}%`,
      `Materiaalopslog: ${header.opslagMateriaal ?? 0}%`,
      `Arbeidsopslag: ${header.opslagArbeid ?? 0}%`,
      `Korting: ${header.korting ?? 0}%`,
    ].join(" | ");

    const analyseContext = [
      `CALCULATIE: ${header.naam}`,
      `Project: ${header.projectNaam ?? "(niet ingevuld)"}`,
      `Klant: ${header.klantNaam ?? "(niet ingevuld)"}`,
      `Status: ${header.status ?? "concept"}`,
      header.omschrijving ? `Omschrijving: ${header.omschrijving}` : null,
      gebouwInfo ? gebouwInfo : null,
      spotenInfo ? `Geregistreerde spots: ${spotenInfo}` : null,
      opnameInfo ? `Veldopname:\n${opnameInfo}` : null,
      `OPSLAGEN: ${opslagenTekst}`,
      `CALCULATIEREGELS (${regels.length}):\n${regelsTekst}`,
      `INKOOPADMINISTRATIE:\n${inkoopTekst}`,
      // CALCULATIE_AI_01: de eigen cijfers van FPS (eenheidsprijzen, prijshistorie,
      // werkelijk betaald, opslagenpraktijk) — deterministisch opgebouwd.
      ``,
      eigenCijfers,
    ].filter((r) => r !== null).join("\n");
    const systeemPrompt = analyseContext + "\n\n" + CALCULATIE_ANALYSE_BASE_PROMPT.tekst;

    const aiResultaat = await aiGateway.chat("reasoning", {
      messages: [
        { role: "system", content: systeemPrompt },
        { role: "user", content: "Analyseer de calculatie en retourneer de JSON-array met adviezen." },
      ],
      max_completion_tokens: 3000,
    } as any, undefined, {
      module: "calculaties",
      functie: "calculatie_analyse",
      promptNaam: CALCULATIE_ANALYSE_BASE_PROMPT.naam,
      promptVersie: CALCULATIE_ANALYSE_BASE_PROMPT.versie,
    });

    let adviezen: Array<{ type: string; prioriteit: string; titel: string; uitleg: string }> = [];
    if (aiResultaat.ok) {
      try {
        const raw = aiResultaat.inhoud.trim();
        const jsonStart = raw.indexOf("[");
        const jsonEnd = raw.lastIndexOf("]");
        if (jsonStart !== -1 && jsonEnd > jsonStart) {
          const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
          if (Array.isArray(parsed)) {
            const geldigeTypes = ["waarschuwing", "aandachtspunt", "kans_op_besparing", "ontbrekende_info", "vraag"];
            const geldigePriorities = ["hoog", "middel", "laag"];
            adviezen = parsed
              .filter((a) => a && typeof a.titel === "string" && typeof a.uitleg === "string")
              .map((a) => ({
                type: geldigeTypes.includes(a.type) ? a.type : "aandachtspunt",
                prioriteit: geldigePriorities.includes(a.prioriteit) ? a.prioriteit : "middel",
                titel: String(a.titel).slice(0, 120),
                uitleg: String(a.uitleg).slice(0, 500),
              }))
              .slice(0, 15);
          }
        }
      } catch {
        req.log.warn("AI senior analyse: JSON parse mislukt");
      }
    }

    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    await db.delete(modCalcAdviezenTable).where(eq(modCalcAdviezenTable.calculatieId, id));

    if (adviezen.length > 0) {
      await db.insert(modCalcAdviezenTable).values(
        adviezen.map((a) => ({
          calculatieId: id,
          runId,
          type: a.type,
          prioriteit: a.prioriteit,
          titel: a.titel,
          uitleg: a.uitleg,
          status: "actief",
        })),
      );
    }

    const result = await db.select().from(modCalcAdviezenTable)
      .where(eq(modCalcAdviezenTable.calculatieId, id))
      .orderBy(
        asc(sql`CASE ${modCalcAdviezenTable.prioriteit} WHEN 'hoog' THEN 1 WHEN 'middel' THEN 2 ELSE 3 END`),
        asc(modCalcAdviezenTable.aangemaaktOp),
      );

    res.json(result.map((a) => ({
      id: a.id,
      calculatie_id: a.calculatieId,
      run_id: a.runId,
      type: a.type,
      prioriteit: a.prioriteit,
      titel: a.titel,
      uitleg: a.uitleg,
      status: a.status,
      notitie: a.notitie ?? null,
      aangemaakt_op: iso(a.aangemaaktOp),
      bijgewerkt_op: iso(a.bijgewerktOp),
    })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Serverfout bij AI-analyse" });
  }
});

// ── GET /modules/calculaties/:id/adviezen ─────────────────────────────────
router.get("/modules/calculaties/:id/adviezen", lezenCalc, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params["id"]);
    const result = await db.select().from(modCalcAdviezenTable)
      .where(eq(modCalcAdviezenTable.calculatieId, id))
      .orderBy(
        asc(sql`CASE ${modCalcAdviezenTable.prioriteit} WHEN 'hoog' THEN 1 WHEN 'middel' THEN 2 ELSE 3 END`),
        asc(modCalcAdviezenTable.aangemaaktOp),
      );
    res.json(result.map((a) => ({
      id: a.id,
      calculatie_id: a.calculatieId,
      run_id: a.runId,
      type: a.type,
      prioriteit: a.prioriteit,
      titel: a.titel,
      uitleg: a.uitleg,
      status: a.status,
      notitie: a.notitie ?? null,
      aangemaakt_op: iso(a.aangemaaktOp),
      bijgewerkt_op: iso(a.bijgewerktOp),
    })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── PATCH /modules/calculaties/:id/adviezen/:adviesId ─────────────────────
router.patch("/modules/calculaties/:id/adviezen/:adviesId", lezenCalc, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params["id"]);
    const adviesId = parseId(req.params["adviesId"]);
    const { status, notitie } = req.body as { status?: string; notitie?: string | null };
    const geldigeStatussen = ["actief", "genegeerd", "gecontroleerd"];
    const updates: Record<string, unknown> = { bijgewerktOp: new Date() };
    if (status && geldigeStatussen.includes(status)) updates["status"] = status;
    if (notitie !== undefined) updates["notitie"] = notitie ?? null;

    const [updated] = await db.update(modCalcAdviezenTable)
      .set(updates)
      .where(and(eq(modCalcAdviezenTable.id, adviesId), eq(modCalcAdviezenTable.calculatieId, id)))
      .returning();

    if (!updated) { res.status(404).json({ error: "Advies niet gevonden" }); return; }

    res.json({
      id: updated.id,
      calculatie_id: updated.calculatieId,
      run_id: updated.runId,
      type: updated.type,
      prioriteit: updated.prioriteit,
      titel: updated.titel,
      uitleg: updated.uitleg,
      status: updated.status,
      notitie: updated.notitie ?? null,
      aangemaakt_op: iso(updated.aangemaaktOp),
      bijgewerkt_op: iso(updated.bijgewerktOp),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── CALC_INVOER_01: geplakt product → conceptregel-voorstel ─────────────────
// Plakt de calculator een productbeschrijving (tekst), schermafdruk (afbeelding)
// of productblad (pdf) + lengte/hoogte + bijzonderheden, dan herkent de AI de
// producten en koppelt de server ze aan EIGEN artikelen en normtijden. De
// uitkomst is een VOORSTEL — er wordt niets automatisch opgeslagen (§3.4).
// Autorisatie: lezenCalc, gelijk aan de ai-regels-route: dit is een voorstel,
// geen schrijfactie op de calculatie.
router.post("/modules/calculaties/:id/plak-analyse", lezenCalc, plakUploadMiddleware, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params["id"]);
    const [header] = await db.select().from(modCalcHeadersTable).where(eq(modCalcHeadersTable.id, id));
    if (!header) return void res.status(404).json({ error: "Calculatie niet gevonden" });

    if (!heeftGateway()) {
      return void res.status(503).json({ error: "AI is niet beschikbaar in deze omgeving." });
    }

    const body = req.body as Record<string, unknown>;
    const tekstInvoer = typeof body.tekst === "string" ? body.tekst.trim() : "";
    const lengte = body.lengte !== undefined && body.lengte !== "" ? Number(body.lengte) : null;
    const hoogte = body.hoogte !== undefined && body.hoogte !== "" ? Number(body.hoogte) : null;
    const bijzonderheden = typeof body.bijzonderheden === "string" ? body.bijzonderheden.trim() : "";

    // ── a. Invoer → tekst + eventueel vision-beeld ──────────────────────────
    let invoerSoort: "tekst" | "afbeelding" | "pdf" = "tekst";
    let extraTekst: string | null = null;
    let afbeeldingen: Array<{ paginaNummer: number; base64: string }> = [];

    if (req.file) {
      // Magic-byte-controle: de echte inhoud moet overeenkomen met een toegestaan
      // type én met het opgegeven MIME-type (allowlist is al door multer afgedwongen).
      const werkelijk = detecteerBestandssoort(req.file.buffer);
      if (!werkelijk || werkelijk !== req.file.mimetype) {
        return void res.status(422).json({ error: "Bestandsinhoud komt niet overeen met het formaat. Alleen echte JPEG-, PNG-, WEBP- of PDF-bestanden." });
      }
      const plak = await haalPlakInvoerBeeld({
        buffer: req.file.buffer,
        mime: req.file.mimetype,
        bestandsnaam: req.file.originalname ?? "geplakt",
      });
      if (plak.bron === "afbeelding") invoerSoort = "afbeelding";
      else if (plak.bron === "pdf") invoerSoort = "pdf";
      extraTekst = plak.tekst;
      afbeeldingen = plak.afbeeldingen;
      if (plak.bron === "geen" && !tekstInvoer) {
        return void res.status(400).json({ error: "Geplakt bestand kon niet gelezen worden. Plak tekst of een leesbare schermafdruk/pdf." });
      }
    } else if (!tekstInvoer) {
      return void res.status(400).json({ error: "Plak een productbeschrijving, schermafdruk of productblad." });
    }

    // ── b. HERKEN-prompt ────────────────────────────────────────────────────
    const maatInfo = [
      lengte != null && !Number.isNaN(lengte) ? `Lengte: ${lengte} m` : null,
      hoogte != null && !Number.isNaN(hoogte) ? `Hoogte: ${hoogte} m` : null,
      bijzonderheden ? `Bijzonderheden: ${bijzonderheden}` : null,
    ].filter(Boolean).join("\n") || "Geen maatvoering opgegeven.";

    const herkenTekstBlok = [
      tekstInvoer ? `Geplakte productbeschrijving:\n${tekstInvoer.slice(0, 6000)}` : null,
      extraTekst ? `Tekst uit geplakt productblad:\n${extraTekst.trim().slice(0, 6000)}` : null,
      maatInfo,
    ].filter(Boolean).join("\n\n");

    type HerkenBlock =
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string; detail: "high" } };
    const herkenContent: HerkenBlock[] = [{ type: "text", text: herkenTekstBlok }];
    for (const afb of afbeeldingen) {
      herkenContent.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${afb.base64}`, detail: "high" } });
    }

    // Slot: vision-aanroep bij beeld (gpt-4o-patroon), anders "default" met ruim budget.
    const herkenSlot = afbeeldingen.length > 0 ? "vision" : "default";
    const herkenResultaat = await aiGateway.chat(
      herkenSlot,
      {
        response_format: { type: "json_object" },
        max_tokens: 1500,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        messages: [{ role: "system", content: CALCULATIE_PLAK_HERKEN_PROMPT.tekst }, { role: "user", content: herkenContent } as any],
      },
      undefined,
      { module: "calculaties", functie: "plak_herken", promptNaam: CALCULATIE_PLAK_HERKEN_PROMPT.naam, promptVersie: CALCULATIE_PLAK_HERKEN_PROMPT.versie },
    );

    if (!herkenResultaat.ok || !herkenResultaat.inhoud) {
      return void res.status(502).json({ error: "AI-herkenning mislukt", detail: herkenResultaat.ok ? "leeg antwoord" : herkenResultaat.fout });
    }

    type HerkendProduct = {
      fabrikant: string | null;
      aanduiding: string | null;
      soort: string | null;
      eenheid: string;
      eigenschappen: string | null;
      hoeveelheid: number | null;
      hoeveelheid_toelichting: string | null;
    };
    let herkendeProducten: HerkendProduct[] = [];
    try {
      const parsed = JSON.parse(herkenResultaat.inhoud) as Record<string, unknown>;
      const arr = Array.isArray(parsed.producten) ? (parsed.producten as unknown[]) : [];
      const geldigeEenheden = new Set(["m2", "st", "m"]);
      herkendeProducten = arr
        .filter((p): p is Record<string, unknown> => typeof p === "object" && p !== null)
        .map((p) => {
          const eenheidRuw = typeof p.eenheid === "string" ? p.eenheid.toLowerCase().trim() : "st";
          const eenheid = geldigeEenheden.has(eenheidRuw) ? eenheidRuw : "st";
          const hv = typeof p.hoeveelheid === "number" && Number.isFinite(p.hoeveelheid) ? p.hoeveelheid : null;
          return {
            fabrikant: typeof p.fabrikant === "string" && p.fabrikant.trim() ? p.fabrikant.trim() : null,
            aanduiding: typeof p.aanduiding === "string" && p.aanduiding.trim() ? p.aanduiding.trim() : null,
            soort: typeof p.soort === "string" && p.soort.trim() ? p.soort.trim() : null,
            eenheid,
            eigenschappen: typeof p.eigenschappen === "string" && p.eigenschappen.trim() ? p.eigenschappen.trim() : null,
            hoeveelheid: hv,
            hoeveelheid_toelichting: typeof p.hoeveelheid_toelichting === "string" && p.hoeveelheid_toelichting.trim() ? p.hoeveelheid_toelichting.trim() : null,
          };
        });
    } catch {
      return void res.status(502).json({ error: "AI-antwoord was geen geldige JSON" });
    }

    if (herkendeProducten.length === 0) {
      // Niets herkend: log en geef leeg voorstel terug.
      await db.insert(modCalcPlakAnalysesTable).values({
        calculatieId: id,
        gebruikerId: req.session.userId ?? null,
        invoerSoort,
        herkendAantal: 0,
        gekoppeldBeide: 0,
        alleenArtikel: 0,
        alleenNormtijd: 0,
        ongekoppeld: 0,
        herkendeProducten: [],
      });
      return void res.json({ invoer_soort: invoerSoort, producten: [], telling: { herkend: 0, gekoppeld_beide: 0, alleen_artikel: 0, alleen_normtijd: 0, ongekoppeld: 0 } });
    }

    // ── c. KOPPELEN — server-side kandidaten zoeken ─────────────────────────
    // Normtijden: kleine tabel — volledig ophalen.
    const alleNormtijden = await db.select().from(modCalcNormtijdenTable).where(eq(modCalcNormtijdenTable.actief, true));

    // Standaard arbeidstarief uit de bestaande tarievenlogica (zoals ai-regels).
    const tarieven = await db.select().from(modCalcTarievenTable).where(eq(modCalcTarievenTable.actief, true));
    const standaardArbeidstarief = tarieven.find((t) => t.categorie === "arbeid")?.tarief ?? null;

    // Per product artikelkandidaten zoeken: exact op artikelcode (case-insensitief),
    // anders ILIKE op omschrijving/leverancier. Max ~30 kandidaten per product.
    type Artikel = typeof modCalcArtekelenTable.$inferSelect & { leverancierNaam: string | null };
    const artikelKandidatenPerProduct: Artikel[][] = [];
    for (const p of herkendeProducten) {
      const zoektermen = [p.aanduiding, p.fabrikant, p.soort].filter((s): s is string => !!s && s.length > 1);
      let kandidaten: Artikel[] = [];

      // 1) exacte artikelcode-match (case-insensitief) op de aanduiding.
      if (p.aanduiding) {
        const exact = await db
          .select({
            id: modCalcArtekelenTable.id, leverancierId: modCalcArtekelenTable.leverancierId,
            artikelcode: modCalcArtekelenTable.artikelcode, omschrijving: modCalcArtekelenTable.omschrijving,
            eenheid: modCalcArtekelenTable.eenheid, inkoopprijs: modCalcArtekelenTable.inkoopprijs,
            verkoopprijs: modCalcArtekelenTable.verkoopprijs, categorie: modCalcArtekelenTable.categorie,
            actief: modCalcArtekelenTable.actief, aangemaaktOp: modCalcArtekelenTable.aangemaaktOp,
            bijgewerktOp: modCalcArtekelenTable.bijgewerktOp,
            leverancierNaam: modCalcLeveranciersTable.naam,
          })
          .from(modCalcArtekelenTable)
          .leftJoin(modCalcLeveranciersTable, eq(modCalcArtekelenTable.leverancierId, modCalcLeveranciersTable.id))
          .where(and(eq(modCalcArtekelenTable.actief, true), ilike(modCalcArtekelenTable.artikelcode, p.aanduiding)))
          .limit(30);
        kandidaten = exact as Artikel[];
      }

      // 2) geen exacte code → ILIKE op omschrijving/leverancier per zoekterm.
      if (kandidaten.length === 0 && zoektermen.length > 0) {
        const orFilters = zoektermen.flatMap((t) => [
          ilike(modCalcArtekelenTable.omschrijving, `%${t}%`),
          ilike(modCalcLeveranciersTable.naam, `%${t}%`),
        ]);
        const ilikeResult = await db
          .select({
            id: modCalcArtekelenTable.id, leverancierId: modCalcArtekelenTable.leverancierId,
            artikelcode: modCalcArtekelenTable.artikelcode, omschrijving: modCalcArtekelenTable.omschrijving,
            eenheid: modCalcArtekelenTable.eenheid, inkoopprijs: modCalcArtekelenTable.inkoopprijs,
            verkoopprijs: modCalcArtekelenTable.verkoopprijs, categorie: modCalcArtekelenTable.categorie,
            actief: modCalcArtekelenTable.actief, aangemaaktOp: modCalcArtekelenTable.aangemaaktOp,
            bijgewerktOp: modCalcArtekelenTable.bijgewerktOp,
            leverancierNaam: modCalcLeveranciersTable.naam,
          })
          .from(modCalcArtekelenTable)
          .leftJoin(modCalcLeveranciersTable, eq(modCalcArtekelenTable.leverancierId, modCalcLeveranciersTable.id))
          .where(and(eq(modCalcArtekelenTable.actief, true), or(...orFilters)))
          .limit(30);
        kandidaten = ilikeResult as Artikel[];
      }

      artikelKandidatenPerProduct.push(kandidaten);
    }

    // ── Tweede AI-aanroep ("default"): kiest per product artikel_id/normtijd_id ─
    // Krijgt ALLEEN de kandidatenlijsten met id's, geen prijzen/uren als keuzegrond.
    const koppelContext = herkendeProducten.map((p, i) => {
      const arts = artikelKandidatenPerProduct[i]!;
      const artLijst = arts.length > 0
        ? arts.map((a) => `  - artikel_id ${a.id}: [${a.artikelcode ?? "geen code"}] ${a.omschrijving} (${a.eenheid})${a.leverancierNaam ? ` — leverancier: ${a.leverancierNaam}` : ""}`).join("\n")
        : "  (geen kandidaat-artikelen)";
      const ntLijst = alleNormtijden.length > 0
        ? alleNormtijden.map((n) => `  - normtijd_id ${n.id}: [${n.code}] ${n.omschrijving} (${n.eenheid}, categorie ${n.categorie})`).join("\n")
        : "  (geen normtijden beschikbaar)";
      const beschrijving = [p.fabrikant, p.aanduiding, p.soort].filter(Boolean).join(" ") || "onbekend product";
      return `Product ${i} (index ${i}): ${beschrijving} — eenheid ${p.eenheid}${p.eigenschappen ? `; eigenschappen: ${p.eigenschappen}` : ""}\nKANDIDAAT-ARTIKELEN:\n${artLijst}\nKANDIDAAT-NORMTIJDEN:\n${ntLijst}`;
    }).join("\n\n");

    const koppelResultaat = await aiGateway.chat(
      "default",
      {
        response_format: { type: "json_object" },
        max_tokens: 1500,
        messages: [
          { role: "system", content: CALCULATIE_PLAK_KOPPEL_PROMPT.tekst },
          { role: "user", content: koppelContext },
        ],
      },
      undefined,
      { module: "calculaties", functie: "plak_koppel", promptNaam: CALCULATIE_PLAK_KOPPEL_PROMPT.naam, promptVersie: CALCULATIE_PLAK_KOPPEL_PROMPT.versie },
    );

    // Parse de koppelkeuzes; ontbreekt/faalt → alles null (fail-closed).
    const gekozenPerIndex = new Map<number, { artikelId: number | null; normtijdId: number | null }>();
    if (koppelResultaat.ok && koppelResultaat.inhoud) {
      try {
        const parsed = JSON.parse(koppelResultaat.inhoud) as Record<string, unknown>;
        const arr = Array.isArray(parsed.koppelingen) ? (parsed.koppelingen as unknown[]) : [];
        for (const k of arr) {
          if (typeof k !== "object" || k === null) continue;
          const rec = k as Record<string, unknown>;
          const idx = typeof rec.product_index === "number" ? rec.product_index : null;
          if (idx === null) continue;
          const artikelId = typeof rec.artikel_id === "number" ? rec.artikel_id : null;
          const normtijdId = typeof rec.normtijd_id === "number" ? rec.normtijd_id : null;
          gekozenPerIndex.set(idx, { artikelId, normtijdId });
        }
      } catch {
        // fail-closed: geen koppelingen
      }
    }

    // ── d. Respons per product opbouwen (§3.3) — fail-closed id-verificatie ──
    const normtijdOpId = new Map(alleNormtijden.map((n) => [n.id, n] as const));
    const rnd = (n: number) => Math.round(n * 100) / 100;

    // PRIJS_01 §5/§11.4: voor elk gekoppeld artikel bepalen we de geldige
    // prijsafspraak (jaarprijs) op vandaag. Dit is een INKOOPprijs van de
    // leverancier — het is PURE HERKOMST-INFO, niet het conceptregel-tarief.
    // Het conceptregel-tarief blijft altijd de verkoopprijs richting de klant;
    // een jaarprijs mag de offerteprijs nooit stil verlagen.
    const vandaag = new Date().toISOString().slice(0, 10);
    const gekozenArtikelIds = new Set<number>();
    for (const [i] of herkendeProducten.entries()) {
      const kandidaten = artikelKandidatenPerProduct[i]!;
      const keuze = gekozenPerIndex.get(i) ?? { artikelId: null, normtijdId: null };
      const art = keuze.artikelId != null ? kandidaten.find((a) => a.id === keuze.artikelId) ?? null : null;
      if (art) gekozenArtikelIds.add(art.id);
    }
    type ArtikelAfspraak = {
      afgesproken_prijs: number;
      afspraak_id: number;
      leverancierId: number;
      afspraak_geldig_tot: string;
    };
    const afspraakPerArtikel = new Map<number, ArtikelAfspraak>();
    for (const artikelId of gekozenArtikelIds) {
      const { afspraak } = await vindGeldigeAfspraak({ artikelId, datum: vandaag });
      if (afspraak) {
        afspraakPerArtikel.set(artikelId, {
          afgesproken_prijs: parseFloat(afspraak.prijs),
          afspraak_id: afspraak.id,
          leverancierId: afspraak.leverancierId,
          afspraak_geldig_tot: afspraak.geldigTot,
        });
      }
    }
    // Leveranciernamen ophalen voor de gevonden afspraken (§5: herkomst tonen).
    const leverancierIdsVoorAfspraak = [...new Set([...afspraakPerArtikel.values()].map((a) => a.leverancierId))];
    const leverancierNaamOpId = new Map<number, string>();
    if (leverancierIdsVoorAfspraak.length > 0) {
      const levRijen = await db
        .select({ id: leveranciersTable.id, naam: leveranciersTable.naam })
        .from(leveranciersTable)
        .where(inArray(leveranciersTable.id, leverancierIdsVoorAfspraak));
      for (const l of levRijen) leverancierNaamOpId.set(l.id, l.naam);
    }
    // Inkoop-herkomst voor de productrespons: ligt de KOSTPRIJS van dit artikel
    // vast in een jaarprijs ('afspraak' + bedrag + leverancier + geldig t/m) of
    // niet ('catalogus')? Bepaalt NIET het conceptregel-tarief.
    function inkoopHerkomstVoorArtikel(artikelId: number): {
      inkoop_bron: "afspraak" | "catalogus";
      afgesproken_inkoopprijs: number | null;
      afspraak_leverancier: string | null;
      afspraak_geldig_tot: string | null;
    } {
      const a = afspraakPerArtikel.get(artikelId);
      if (a) {
        return {
          inkoop_bron: "afspraak",
          afgesproken_inkoopprijs: a.afgesproken_prijs,
          afspraak_leverancier: leverancierNaamOpId.get(a.leverancierId) ?? null,
          afspraak_geldig_tot: a.afspraak_geldig_tot,
        };
      }
      return { inkoop_bron: "catalogus", afgesproken_inkoopprijs: null, afspraak_leverancier: null, afspraak_geldig_tot: null };
    }

    let telGekoppeldBeide = 0, telAlleenArtikel = 0, telAlleenNormtijd = 0, telOngekoppeld = 0;

    const producten = herkendeProducten.map((p, i) => {
      const kandidaten = artikelKandidatenPerProduct[i]!;
      const keuze = gekozenPerIndex.get(i) ?? { artikelId: null, normtijdId: null };

      // Verifieer dat gekozen artikel_id echt in de kandidatenlijst van dit product zit.
      const artikel = keuze.artikelId != null
        ? kandidaten.find((a) => a.id === keuze.artikelId) ?? null
        : null;
      // Verifieer dat gekozen normtijd_id een bestaande actieve normtijd is.
      const normtijd = keuze.normtijdId != null ? normtijdOpId.get(keuze.normtijdId) ?? null : null;

      const heeftArtikel = !!artikel;
      const heeftNormtijd = !!normtijd;

      // Top-normtijd-kandidaten voor de keuzelijst (klein: hele lijst, max 8 gefilterd op eenheid indien mogelijk).
      const topNormtijden = alleNormtijden
        .filter((n) => !p.eenheid || n.eenheid === p.eenheid || alleNormtijden.every((x) => x.eenheid !== p.eenheid))
        .slice(0, 8)
        .map((n) => ({ id: n.id, code: n.code, omschrijving: n.omschrijving, eenheid: n.eenheid, categorie: n.categorie }));

      const herkend = {
        fabrikant: p.fabrikant,
        aanduiding: p.aanduiding,
        soort: p.soort,
        eenheid: p.eenheid,
        eigenschappen: p.eigenschappen,
        hoeveelheid: p.hoeveelheid,
        hoeveelheid_toelichting: p.hoeveelheid_toelichting,
      };

      // Basis-conceptregelvelden (prijs/uren UITSLUITEND uit DB-rijen).
      const hoeveelheid = p.hoeveelheid ?? null;

      if (heeftArtikel && heeftNormtijd) {
        telGekoppeldBeide++;
        // PRIJS_01 §5: inkoop-herkomst tonen; tarief blijft verkoopprijs.
        const inkoop = inkoopHerkomstVoorArtikel(artikel!.id);
        return {
          uitkomst: "volledig" as const,
          herkend,
          artikel: { id: artikel!.id, artikelcode: artikel!.artikelcode, omschrijving: artikel!.omschrijving, eenheid: artikel!.eenheid, leverancier_naam: artikel!.leverancierNaam, categorie: artikel!.categorie },
          normtijd: { id: normtijd!.id, code: normtijd!.code, omschrijving: normtijd!.omschrijving, eenheid: normtijd!.eenheid, uren_per_eenheid: normtijd!.urenPerEenheid },
          conceptregel: {
            hoofdstuk: "Overige werkzaamheden",
            categorie: "materiaal",
            omschrijving: artikel!.omschrijving,
            eenheid: artikel!.eenheid,
            hoeveelheid,
            tarief: artikel!.verkoopprijs,                 // verkoopprijs richting klant — NIET de jaarprijs
            mu_per_eenheid: normtijd!.urenPerEenheid,      // arbeidsnorm uit DB-normtijd
            arbeids_tarief: standaardArbeidstarief,        // uit tarievenlogica; null indien onbekend
            arbeids_tarief_ontbreekt: standaardArbeidstarief == null,
            normtijd_id: normtijd!.id,
          },
          inkoop_bron: inkoop.inkoop_bron,                 // §5: ligt de kostprijs vast in een jaarprijs?
          afgesproken_inkoopprijs: inkoop.afgesproken_inkoopprijs,
          afspraak_leverancier: inkoop.afspraak_leverancier,
          afspraak_geldig_tot: inkoop.afspraak_geldig_tot,
          prijs_ontbreekt: false,
          mu_ontbreekt: false,
        };
      }

      if (heeftArtikel && !heeftNormtijd) {
        telAlleenArtikel++;
        // PRIJS_01 §5: inkoop-herkomst tonen; tarief blijft verkoopprijs.
        const inkoop = inkoopHerkomstVoorArtikel(artikel!.id);
        return {
          uitkomst: "alleen_artikel" as const,
          herkend,
          artikel: { id: artikel!.id, artikelcode: artikel!.artikelcode, omschrijving: artikel!.omschrijving, eenheid: artikel!.eenheid, leverancier_naam: artikel!.leverancierNaam, categorie: artikel!.categorie },
          normtijd: null,
          conceptregel: {
            hoofdstuk: "Overige werkzaamheden",
            categorie: "materiaal",
            omschrijving: artikel!.omschrijving,
            eenheid: artikel!.eenheid,
            hoeveelheid,
            tarief: artikel!.verkoopprijs,                 // verkoopprijs richting klant — NIET de jaarprijs
            mu_per_eenheid: null,                          // arbeid ontbreekt — expliciet, niet 0
            arbeids_tarief: null,
            normtijd_id: null,
          },
          inkoop_bron: inkoop.inkoop_bron,                 // §5: ligt de kostprijs vast in een jaarprijs?
          afgesproken_inkoopprijs: inkoop.afgesproken_inkoopprijs,
          afspraak_leverancier: inkoop.afspraak_leverancier,
          afspraak_geldig_tot: inkoop.afspraak_geldig_tot,
          mu_ontbreekt: true,
          vraag: "Welke normtijd hoort bij dit product?",
          normtijd_kandidaten: topNormtijden,
          prijs_ontbreekt: false,
        };
      }

      if (!heeftArtikel && heeftNormtijd) {
        telAlleenNormtijd++;
        return {
          uitkomst: "alleen_normtijd" as const,
          herkend,
          artikel: null,
          normtijd: { id: normtijd!.id, code: normtijd!.code, omschrijving: normtijd!.omschrijving, eenheid: normtijd!.eenheid, uren_per_eenheid: normtijd!.urenPerEenheid },
          conceptregel: {
            hoofdstuk: "Overige werkzaamheden",
            categorie: "arbeid",
            omschrijving: normtijd!.omschrijving,
            eenheid: normtijd!.eenheid,
            hoeveelheid,
            tarief: null,                                  // materiaal ontbreekt — expliciet, niet 0
            mu_per_eenheid: normtijd!.urenPerEenheid,
            arbeids_tarief: standaardArbeidstarief,
            arbeids_tarief_ontbreekt: standaardArbeidstarief == null,
            normtijd_id: normtijd!.id,
          },
          prijs_ontbreekt: true,                           // materiaalprijs ontbreekt, gemarkeerd
          mu_ontbreekt: false,
        };
      }

      // Geen van beide: geen regel, wel herkende gegevens + aanbod artikel aan te leggen.
      telOngekoppeld++;
      return {
        uitkomst: "ongekoppeld" as const,
        herkend,
        artikel: null,
        normtijd: null,
        conceptregel: null,                                // §3.3: geen regel
        artikel_voorstel: {
          // ZONDER prijs — §3.5: prijs komt nooit van de website.
          leverancier: p.fabrikant,
          artikelcode: p.aanduiding,
          omschrijving: [p.fabrikant, p.aanduiding, p.soort].filter(Boolean).join(" ") || "Onbekend product",
          eenheid: p.eenheid,
          categorie: "materiaal",
          prijs_ontbreekt: true,
        },
        prijs_ontbreekt: true,
        mu_ontbreekt: true,
      };
    });

    // ── e. Telling loggen in calc_plak_analyses (§4) ────────────────────────
    // Bewaar UITSLUITEND minimale meetdata per product (geen vrije eigenschappen-
    // teksten of grote dumps), begrensd tot max 20 producten.
    const meetProducten = producten.slice(0, 20).map((p) => ({
      fabrikant: p.herkend.fabrikant,
      aanduiding: p.herkend.aanduiding,
      eenheid: p.herkend.eenheid,
      uitkomst: p.uitkomst,
    }));
    await db.insert(modCalcPlakAnalysesTable).values({
      calculatieId: id,
      gebruikerId: req.session.userId ?? null,
      invoerSoort,
      herkendAantal: herkendeProducten.length,
      gekoppeldBeide: telGekoppeldBeide,
      alleenArtikel: telAlleenArtikel,
      alleenNormtijd: telAlleenNormtijd,
      ongekoppeld: telOngekoppeld,
      herkendeProducten: meetProducten,
    });

    res.json({
      invoer_soort: invoerSoort,
      producten,
      telling: {
        herkend: herkendeProducten.length,
        gekoppeld_beide: telGekoppeldBeide,
        alleen_artikel: telAlleenArtikel,
        alleen_normtijd: telAlleenNormtijd,
        ongekoppeld: telOngekoppeld,
      },
    });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Plak-analyse mislukt" });
  }
});

// ── ADVIES_01 §4.2/§4.3 — adviesrapport uitlezen en een calculatie inrichten ──
// Leest het aan de calculatie te koppelen adviesrapport (uit de bibliotheek, via
// object storage), haalt ELK genummerd punt eruit (stap 1) en stelt per punt een
// soortvoorstel + koppeling voor (stap 2). Verzint NOOIT bedragen/uren/hoeveelheden
// (§6); prijzen/uren komen uitsluitend uit eigen tabellen. Slaat NIETS op als
// calculatieregel — de calculator bevestigt per punt in de UI. Autorisatie:
// schrijvenCalc (§4.5 review): de route heeft schrijf-side-effects (analyse-log in
// calc_plak_analyses + documentkoppeling), dus niveau ≥2 op calculaties. Daarnaast
// wordt vóór het lezen gecontroleerd dat (b) het document ai-categorie
// 'adviesrapport' heeft, en (c) de gebruiker het document via de bibliotheek-
// leesautorisatie mag inzien — hergebruikt de eis van GET /documenten/:id/download
// (requireBevoegdheid("bibliotheek", 1)).
const adviesObjectStorage = new ObjectStorageService();

router.post("/modules/calculaties/:id/adviesrapport-analyse", schrijvenCalc, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params["id"]);
    const [header] = await db.select().from(modCalcHeadersTable).where(eq(modCalcHeadersTable.id, id));
    if (!header) return void res.status(404).json({ error: "Calculatie niet gevonden" });

    if (!heeftGateway()) {
      return void res.status(503).json({ error: "AI is niet beschikbaar in deze omgeving." });
    }

    const body = req.body as Record<string, unknown>;
    const documentId = body.document_id !== undefined && body.document_id !== "" ? Number(body.document_id) : NaN;
    if (!Number.isInteger(documentId) || documentId <= 0) {
      return void res.status(400).json({ error: "document_id is verplicht" });
    }

    // (c) Documentleesautorisatie afdwingen vóór er ook maar iets van het document
    // wordt gelezen — zelfde eis als GET /documenten/:id/download
    // (requireBevoegdheid("bibliotheek", 1)). laadPermissies vult req.permissies
    // globaal (routes/index.ts); hoofdbeheerder mag altijd.
    const magBibliotheekLezen =
      req.permissies?.isHoofdbeheerder === true ||
      req.permissies?.heeftModuleRecht("bibliotheek", 1) === true;
    if (!magBibliotheekLezen) {
      return void res.status(403).json({ error: "Geen leestoegang tot de documentbibliotheek." });
    }

    const [doc] = await db.select().from(documentenTable).where(eq(documentenTable.id, documentId));
    if (!doc || !doc.pdfUrl) {
      return void res.status(404).json({ error: "Adviesrapport niet gevonden" });
    }

    // (b) Alleen documenten met ai-categorie 'adviesrapport' mogen hier ingelezen
    // worden. Slim Upload zet de categorie in ai_metadata.categorie (documenttype
    // valt terug op 'overig'). Anders 422 met nette uitleg — geen blind inlezen.
    const aiCategorie =
      doc.aiMetadata && typeof doc.aiMetadata === "object"
        ? (doc.aiMetadata as Record<string, unknown>).categorie
        : undefined;
    if (aiCategorie !== "adviesrapport") {
      return void res.status(422).json({
        error:
          "Dit document is geen adviesrapport. Lever het aan via Slim Upload met categorie 'Adviesrapport' voordat je het als bron voor de calculatie gebruikt.",
      });
    }

    // ── a. Bestand uit object storage lezen → tekst + eventueel vision-beeld ──
    let bestandBuffer: Buffer;
    try {
      const file = await adviesObjectStorage.getObjectEntityFile(doc.pdfUrl);
      const stream = file.createReadStream();
      bestandBuffer = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        stream.on("data", (chunk: unknown) =>
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as ArrayBufferLike)),
        );
        stream.on("end", () => resolve(Buffer.concat(chunks)));
        stream.on("error", (err: Error) => reject(err));
      });
    } catch (err) {
      req.log.error({ err, documentId }, "Adviesrapport kon niet uit opslag gelezen worden");
      return void res.status(503).json({ error: "Het adviesrapport kon niet uit de opslag gelezen worden. Probeer het later opnieuw." });
    }

    const magic = detecteerBestandssoort(bestandBuffer);
    const isPdf = magic === "application/pdf";
    const isImage = magic === "image/jpeg" || magic === "image/png" || magic === "image/webp";

    let rapportTekst: string | null = null;
    let afbeeldingen: Array<{ paginaNummer: number; base64: string }> = [];
    if (isPdf) {
      const extractie = await extraheerPdfTekst(bestandBuffer);
      rapportTekst = extractie.tekst && extractie.tekst.trim().length > 80 ? extractie.tekst : null;
      // Ook zonder machineleesbare tekst (gescand rapport) proberen we de eerste
      // pagina's te renderen voor vision (max 5, DOCUMENT_01 §3.5).
      if (!rapportTekst) {
        try {
          const aantal = Math.min(Math.max(extractie.paginaAantal ?? 3, 1), 5);
          afbeeldingen = await renderPdfPaginas(bestandBuffer, Array.from({ length: aantal }, (_, i) => i + 1));
        } catch (err) {
          req.log.warn({ err, documentId }, "Adviesrapport PDF-rendering mislukt");
        }
      }
    } else if (isImage) {
      const base64 = await resizeAfbeelding(bestandBuffer);
      if (base64) afbeeldingen = [{ paginaNummer: 1, base64 }];
    }

    if (!rapportTekst && afbeeldingen.length === 0) {
      return void res.status(422).json({ error: "Het adviesrapport kon niet gelezen worden (geen tekst en geen render mogelijk)." });
    }

    // ── b. STAP 1 — alle genummerde punten uitlezen ─────────────────────────
    // Bron-aftopping expliciet melden (geen stille aftopping): tekst >24.000
    // tekens of >5 gerenderde pagina's betekent dat het gelezen deel korter is
    // dan het volledige rapport. We geven dat mee als waarschuwing in de respons.
    const MAX_TEKST_TEKENS = 24000;
    const MAX_VISION_PAGINAS = 5;
    let bronAfgekaptWaarschuwing: string | null = null;
    if (rapportTekst && rapportTekst.length > MAX_TEKST_TEKENS) {
      bronAfgekaptWaarschuwing =
        "Rapport langer dan gelezen deel: controleer punten na de eerste 24.000 tekens.";
    } else if (!rapportTekst && afbeeldingen.length >= MAX_VISION_PAGINAS) {
      bronAfgekaptWaarschuwing =
        "Rapport langer dan gelezen deel: controleer punten na pagina 5.";
    }

    type PuntBlock =
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string; detail: "high" } };
    const puntTekstBlok = rapportTekst
      ? `Adviesrapport (tekst):\n${rapportTekst.slice(0, MAX_TEKST_TEKENS)}`
      : "Adviesrapport bijgevoegd als gerenderde pagina's (afbeeldingen).";
    const puntContent: PuntBlock[] = [{ type: "text", text: puntTekstBlok }];
    for (const afb of afbeeldingen) {
      puntContent.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${afb.base64}`, detail: "high" } });
    }

    const puntSlot = afbeeldingen.length > 0 ? "vision" : "default";
    const puntResultaat = await aiGateway.chat(
      puntSlot,
      {
        response_format: { type: "json_object" },
        max_tokens: 4000,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        messages: [{ role: "system", content: CALCULATIE_ADVIES_PUNTEN_PROMPT.tekst }, { role: "user", content: puntContent } as any],
      },
      undefined,
      { module: "calculaties", functie: "advies_punten", promptNaam: CALCULATIE_ADVIES_PUNTEN_PROMPT.naam, promptVersie: CALCULATIE_ADVIES_PUNTEN_PROMPT.versie },
    );

    if (!puntResultaat.ok || !puntResultaat.inhoud) {
      return void res.status(502).json({ error: "AI-uitlezing van het adviesrapport mislukt", detail: puntResultaat.ok ? "leeg antwoord" : puntResultaat.fout });
    }

    type AdviesPunt = {
      nummer: string;
      tekortkoming: string;
      geadviseerd_herstel: string | null;
      locatie: string | null;
      hoofdstuk: string | null;
    };
    let punten: AdviesPunt[] = [];
    let puntenAantalGemeld = 0;
    try {
      const parsed = JSON.parse(puntResultaat.inhoud) as Record<string, unknown>;
      puntenAantalGemeld = typeof parsed.punten_aantal === "number" ? parsed.punten_aantal : 0;
      const arr = Array.isArray(parsed.punten) ? (parsed.punten as unknown[]) : [];
      punten = arr
        .filter((p): p is Record<string, unknown> => typeof p === "object" && p !== null)
        .map((p, i) => ({
          nummer: typeof p.nummer === "string" && p.nummer.trim() ? p.nummer.trim() : String(i + 1),
          tekortkoming: typeof p.tekortkoming === "string" ? p.tekortkoming.trim() : "",
          geadviseerd_herstel: typeof p.geadviseerd_herstel === "string" && p.geadviseerd_herstel.trim() ? p.geadviseerd_herstel.trim() : null,
          locatie: typeof p.locatie === "string" && p.locatie.trim() ? p.locatie.trim() : null,
          hoofdstuk: typeof p.hoofdstuk === "string" && p.hoofdstuk.trim() ? p.hoofdstuk.trim() : null,
        }));
    } catch {
      return void res.status(502).json({ error: "AI-antwoord was geen geldige JSON" });
    }

    // §6: elk punt telt. Als het gemelde aantal afwijkt van het aantal objecten,
    // is er stil weggelaten — we geven dat expliciet mee als waarschuwing i.p.v.
    // het te verbergen. Het aantal punten dat we tonen = het aantal objecten.
    const puntenAantal = Math.max(punten.length, puntenAantalGemeld);

    if (punten.length === 0) {
      return void res.json({
        document_id: documentId,
        document_naam: doc.naam,
        punten_aantal: puntenAantalGemeld,
        voorstellen: [],
        koppelgraad: { werkzaamheden: 0, volledig: 0, alleen_artikel: 0, alleen_normtijd: 0, ongekoppeld: 0, geen_werkzaamheden: 0, niet_te_beoordelen: 0 },
        waarschuwing: [bronAfgekaptWaarschuwing, "Er zijn geen genummerde punten herkend in het rapport."]
          .filter(Boolean)
          .join(" "),
      });
    }

    // ── c. STAP 2 — per punt kandidaten zoeken (ILIKE op herstel/tekst) ──────
    const alleNormtijden = await db.select().from(modCalcNormtijdenTable).where(eq(modCalcNormtijdenTable.actief, true));
    const tarieven = await db.select().from(modCalcTarievenTable).where(eq(modCalcTarievenTable.actief, true));
    const standaardArbeidstarief = tarieven.find((t) => t.categorie === "arbeid")?.tarief ?? null;

    type Artikel = typeof modCalcArtekelenTable.$inferSelect & { leverancierNaam: string | null };
    const artikelKandidatenPerPunt: Artikel[][] = [];
    for (const punt of punten) {
      // Zoektermen: uit het geadviseerde herstel en de tekortkoming, opgeknipt in
      // zinvolle woorden (>= 4 tekens) zodat ILIKE iets kan matchen.
      const bron = `${punt.geadviseerd_herstel ?? ""} ${punt.tekortkoming}`.toLowerCase();
      const woorden = Array.from(new Set(bron.split(/[^a-zà-ÿ0-9]+/).filter((w) => w.length >= 4))).slice(0, 6);
      let kandidaten: Artikel[] = [];
      if (woorden.length > 0) {
        const orFilters = woorden.flatMap((w) => [
          ilike(modCalcArtekelenTable.omschrijving, `%${w}%`),
          ilike(modCalcLeveranciersTable.naam, `%${w}%`),
        ]);
        const rows = await db
          .select({
            id: modCalcArtekelenTable.id, leverancierId: modCalcArtekelenTable.leverancierId,
            artikelcode: modCalcArtekelenTable.artikelcode, omschrijving: modCalcArtekelenTable.omschrijving,
            eenheid: modCalcArtekelenTable.eenheid, inkoopprijs: modCalcArtekelenTable.inkoopprijs,
            verkoopprijs: modCalcArtekelenTable.verkoopprijs, categorie: modCalcArtekelenTable.categorie,
            actief: modCalcArtekelenTable.actief, aangemaaktOp: modCalcArtekelenTable.aangemaaktOp,
            bijgewerktOp: modCalcArtekelenTable.bijgewerktOp,
            leverancierNaam: modCalcLeveranciersTable.naam,
          })
          .from(modCalcArtekelenTable)
          .leftJoin(modCalcLeveranciersTable, eq(modCalcArtekelenTable.leverancierId, modCalcLeveranciersTable.id))
          .where(and(eq(modCalcArtekelenTable.actief, true), or(...orFilters)))
          .limit(30);
        kandidaten = rows as Artikel[];
      }
      artikelKandidatenPerPunt.push(kandidaten);
    }

    // ── d. Tweede AI-aanroep: soortvoorstel + artikel/normtijd-id per punt ────
    const koppelContext = punten.map((punt, i) => {
      const arts = artikelKandidatenPerPunt[i]!;
      const artLijst = arts.length > 0
        ? arts.map((a) => `  - artikel_id ${a.id}: [${a.artikelcode ?? "geen code"}] ${a.omschrijving} (${a.eenheid})${a.leverancierNaam ? ` — leverancier: ${a.leverancierNaam}` : ""}`).join("\n")
        : "  (geen kandidaat-artikelen)";
      const ntLijst = alleNormtijden.length > 0
        ? alleNormtijden.map((n) => `  - normtijd_id ${n.id}: [${n.code}] ${n.omschrijving} (${n.eenheid}, categorie ${n.categorie})`).join("\n")
        : "  (geen normtijden beschikbaar)";
      return `Punt ${i} (index ${i}) — nummer ${punt.nummer}${punt.hoofdstuk ? `; hoofdstuk: ${punt.hoofdstuk}` : ""}\nTekortkoming: ${punt.tekortkoming || "(niet vermeld)"}\nGeadviseerd herstel: ${punt.geadviseerd_herstel ?? "(niet vermeld)"}\nKANDIDAAT-ARTIKELEN:\n${artLijst}\nKANDIDAAT-NORMTIJDEN:\n${ntLijst}`;
    }).join("\n\n");

    const koppelResultaat = await aiGateway.chat(
      "default",
      {
        response_format: { type: "json_object" },
        max_tokens: 4000,
        messages: [
          { role: "system", content: CALCULATIE_ADVIES_KOPPEL_PROMPT.tekst },
          { role: "user", content: koppelContext },
        ],
      },
      undefined,
      { module: "calculaties", functie: "advies_koppel", promptNaam: CALCULATIE_ADVIES_KOPPEL_PROMPT.naam, promptVersie: CALCULATIE_ADVIES_KOPPEL_PROMPT.versie },
    );

    type SoortVoorstel = "werkzaamheden" | "geen_werkzaamheden" | "niet_te_beoordelen";
    const keuzePerIndex = new Map<number, { soort: SoortVoorstel; artikelId: number | null; normtijdId: number | null; vraag: string | null }>();
    if (koppelResultaat.ok && koppelResultaat.inhoud) {
      try {
        const parsed = JSON.parse(koppelResultaat.inhoud) as Record<string, unknown>;
        const arr = Array.isArray(parsed.koppelingen) ? (parsed.koppelingen as unknown[]) : [];
        for (const k of arr) {
          if (typeof k !== "object" || k === null) continue;
          const rec = k as Record<string, unknown>;
          const idx = typeof rec.punt_index === "number" ? rec.punt_index : null;
          if (idx === null) continue;
          const soortRuw = typeof rec.soortvoorstel === "string" ? rec.soortvoorstel : "werkzaamheden";
          const soort: SoortVoorstel = soortRuw === "geen_werkzaamheden" || soortRuw === "niet_te_beoordelen" ? soortRuw : "werkzaamheden";
          keuzePerIndex.set(idx, {
            soort,
            artikelId: typeof rec.artikel_id === "number" ? rec.artikel_id : null,
            normtijdId: typeof rec.normtijd_id === "number" ? rec.normtijd_id : null,
            vraag: typeof rec.vraag === "string" && rec.vraag.trim() ? rec.vraag.trim() : null,
          });
        }
      } catch {
        // fail-closed: geen keuzes → alle punten "werkzaamheden" ongekoppeld
      }
    }

    // ── e. Respons per punt opbouwen — fail-closed id-verificatie ────────────
    const normtijdOpId = new Map(alleNormtijden.map((n) => [n.id, n] as const));

    // Inkoop-herkomst (PRIJS_01 §5) voor gekozen artikelen.
    const vandaag = new Date().toISOString().slice(0, 10);
    const gekozenArtikelIds = new Set<number>();
    for (const [i] of punten.entries()) {
      const keuze = keuzePerIndex.get(i);
      if (keuze?.soort === "werkzaamheden" && keuze.artikelId != null) {
        const art = artikelKandidatenPerPunt[i]!.find((a) => a.id === keuze.artikelId);
        if (art) gekozenArtikelIds.add(art.id);
      }
    }
    type ArtikelAfspraak = { afgesproken_prijs: number; leverancierId: number; afspraak_geldig_tot: string };
    const afspraakPerArtikel = new Map<number, ArtikelAfspraak>();
    for (const artikelId of gekozenArtikelIds) {
      const { afspraak } = await vindGeldigeAfspraak({ artikelId, datum: vandaag });
      if (afspraak) {
        afspraakPerArtikel.set(artikelId, {
          afgesproken_prijs: parseFloat(afspraak.prijs),
          leverancierId: afspraak.leverancierId,
          afspraak_geldig_tot: afspraak.geldigTot,
        });
      }
    }
    const leverancierIdsVoorAfspraak = [...new Set([...afspraakPerArtikel.values()].map((a) => a.leverancierId))];
    const leverancierNaamOpId = new Map<number, string>();
    if (leverancierIdsVoorAfspraak.length > 0) {
      const levRijen = await db
        .select({ id: leveranciersTable.id, naam: leveranciersTable.naam })
        .from(leveranciersTable)
        .where(inArray(leveranciersTable.id, leverancierIdsVoorAfspraak));
      for (const l of levRijen) leverancierNaamOpId.set(l.id, l.naam);
    }
    function inkoopHerkomstVoorArtikel(artikelId: number): {
      inkoop_bron: "afspraak" | "catalogus";
      afgesproken_inkoopprijs: number | null;
      afspraak_leverancier: string | null;
      afspraak_geldig_tot: string | null;
    } {
      const a = afspraakPerArtikel.get(artikelId);
      if (a) {
        return {
          inkoop_bron: "afspraak",
          afgesproken_inkoopprijs: a.afgesproken_prijs,
          afspraak_leverancier: leverancierNaamOpId.get(a.leverancierId) ?? null,
          afspraak_geldig_tot: a.afspraak_geldig_tot,
        };
      }
      return { inkoop_bron: "catalogus", afgesproken_inkoopprijs: null, afspraak_leverancier: null, afspraak_geldig_tot: null };
    }

    let telWerkzaamheden = 0, telVolledig = 0, telAlleenArtikel = 0, telAlleenNormtijd = 0, telOngekoppeld = 0, telGeenWerk = 0, telNietTeBeoordelen = 0;

    // §6 (review): elk punt uit stap 1 MOET een voorstel krijgen. Als de tweede
    // AI-aanroep minder koppelingen teruggaf dan er punten zijn, vullen we
    // fail-closed aan: de ontbrekende punten worden 'niet_te_beoordelen' met de
    // standaardvraag i.p.v. stil op 'werkzaamheden' te vallen. Zo wordt geen punt
    // stil overgeslagen.
    const STANDAARD_NIET_TE_BEOORDELEN_VRAAG =
      "Dit punt kon niet automatisch worden beoordeeld — wat moet ermee?";
    const voorstellen = punten.map((punt, i) => {
      const keuze = keuzePerIndex.get(i) ?? {
        soort: "niet_te_beoordelen" as SoortVoorstel,
        artikelId: null,
        normtijdId: null,
        vraag: STANDAARD_NIET_TE_BEOORDELEN_VRAAG,
      };
      // regelnummer volgt het puntnummer uit het rapport (§4.4: altijd zichtbaar/bewerkbaar).
      const regelnummer = punt.nummer;
      const hoofdstuk = punt.hoofdstuk ?? "Overige werkzaamheden";
      const basis = {
        nummer: punt.nummer,
        regelnummer,
        hoofdstuk,
        tekortkoming: punt.tekortkoming,
        geadviseerd_herstel: punt.geadviseerd_herstel,
        locatie: punt.locatie,
      };

      if (keuze.soort === "geen_werkzaamheden") {
        telGeenWerk++;
        // §4.3.2: tekstregel "geen werkzaamheden aannemer".
        return {
          ...basis,
          soortvoorstel: "geen_werkzaamheden" as const,
          regel_soort: "tekst" as const,
          omschrijving: punt.geadviseerd_herstel ?? punt.tekortkoming ?? "Geen werkzaamheden aannemer",
          tekstregel: "Geen werkzaamheden aannemer",
          uitkomst: null,
          artikel: null,
          normtijd: null,
          normtijd_kandidaten: [],
          conceptregel: null,
          vraag: null,
        };
      }

      if (keuze.soort === "niet_te_beoordelen") {
        telNietTeBeoordelen++;
        // §4.3.3: niet te beoordelen — met een vervolgvraag. Wordt niet stil
        // weggelaten; de calculator kan het punt overslaan of zelf invullen.
        return {
          ...basis,
          soortvoorstel: "niet_te_beoordelen" as const,
          regel_soort: "regel" as const,
          omschrijving: punt.geadviseerd_herstel ?? punt.tekortkoming,
          tekstregel: null,
          uitkomst: null,
          artikel: null,
          normtijd: null,
          normtijd_kandidaten: alleNormtijden.slice(0, 8).map((n) => ({ id: n.id, code: n.code, omschrijving: n.omschrijving, eenheid: n.eenheid, categorie: n.categorie })),
          conceptregel: null,
          vraag: keuze.vraag ?? STANDAARD_NIET_TE_BEOORDELEN_VRAAG,
        };
      }

      // soort = werkzaamheden → koppeling verifiëren (fail-closed)
      telWerkzaamheden++;
      const kandidaten = artikelKandidatenPerPunt[i]!;
      const artikel = keuze.artikelId != null ? kandidaten.find((a) => a.id === keuze.artikelId) ?? null : null;
      const normtijd = keuze.normtijdId != null ? normtijdOpId.get(keuze.normtijdId) ?? null : null;
      const heeftArtikel = !!artikel;
      const heeftNormtijd = !!normtijd;
      const topNormtijden = alleNormtijden.slice(0, 8).map((n) => ({ id: n.id, code: n.code, omschrijving: n.omschrijving, eenheid: n.eenheid, categorie: n.categorie }));
      const omschrijving = punt.geadviseerd_herstel ?? punt.tekortkoming ?? (artikel?.omschrijving ?? "Werkzaamheden");

      if (heeftArtikel && heeftNormtijd) {
        telVolledig++;
        const inkoop = inkoopHerkomstVoorArtikel(artikel!.id);
        return {
          ...basis,
          soortvoorstel: "werkzaamheden" as const,
          regel_soort: "regel" as const,
          omschrijving,
          tekstregel: null,
          uitkomst: "volledig" as const,
          artikel: { id: artikel!.id, artikelcode: artikel!.artikelcode, omschrijving: artikel!.omschrijving, eenheid: artikel!.eenheid, leverancier_naam: artikel!.leverancierNaam, categorie: artikel!.categorie },
          normtijd: { id: normtijd!.id, code: normtijd!.code, omschrijving: normtijd!.omschrijving, eenheid: normtijd!.eenheid, uren_per_eenheid: normtijd!.urenPerEenheid },
          normtijd_kandidaten: [],
          conceptregel: {
            hoofdstuk,
            categorie: "materiaal",
            omschrijving,
            eenheid: artikel!.eenheid,
            hoeveelheid: null,                          // §6: nooit geschat
            tarief: artikel!.verkoopprijs,              // verkoopprijs — niet de jaarprijs
            mu_per_eenheid: normtijd!.urenPerEenheid,
            arbeids_tarief: standaardArbeidstarief,
            arbeids_tarief_ontbreekt: standaardArbeidstarief == null,
            normtijd_id: normtijd!.id,
          },
          inkoop_bron: inkoop.inkoop_bron,
          afgesproken_inkoopprijs: inkoop.afgesproken_inkoopprijs,
          afspraak_leverancier: inkoop.afspraak_leverancier,
          afspraak_geldig_tot: inkoop.afspraak_geldig_tot,
          prijs_ontbreekt: false,
          mu_ontbreekt: false,
          vraag: null,
        };
      }

      if (heeftArtikel && !heeftNormtijd) {
        telAlleenArtikel++;
        const inkoop = inkoopHerkomstVoorArtikel(artikel!.id);
        return {
          ...basis,
          soortvoorstel: "werkzaamheden" as const,
          regel_soort: "regel" as const,
          omschrijving,
          tekstregel: null,
          uitkomst: "alleen_artikel" as const,
          artikel: { id: artikel!.id, artikelcode: artikel!.artikelcode, omschrijving: artikel!.omschrijving, eenheid: artikel!.eenheid, leverancier_naam: artikel!.leverancierNaam, categorie: artikel!.categorie },
          normtijd: null,
          normtijd_kandidaten: topNormtijden,
          conceptregel: {
            hoofdstuk,
            categorie: "materiaal",
            omschrijving,
            eenheid: artikel!.eenheid,
            hoeveelheid: null,
            tarief: artikel!.verkoopprijs,
            mu_per_eenheid: null,
            arbeids_tarief: null,
            normtijd_id: null,
          },
          inkoop_bron: inkoop.inkoop_bron,
          afgesproken_inkoopprijs: inkoop.afgesproken_inkoopprijs,
          afspraak_leverancier: inkoop.afspraak_leverancier,
          afspraak_geldig_tot: inkoop.afspraak_geldig_tot,
          prijs_ontbreekt: false,
          mu_ontbreekt: true,
          vraag: "Welke normtijd hoort bij dit herstel?",
        };
      }

      if (!heeftArtikel && heeftNormtijd) {
        telAlleenNormtijd++;
        return {
          ...basis,
          soortvoorstel: "werkzaamheden" as const,
          regel_soort: "regel" as const,
          omschrijving,
          tekstregel: null,
          uitkomst: "alleen_normtijd" as const,
          artikel: null,
          normtijd: { id: normtijd!.id, code: normtijd!.code, omschrijving: normtijd!.omschrijving, eenheid: normtijd!.eenheid, uren_per_eenheid: normtijd!.urenPerEenheid },
          normtijd_kandidaten: [],
          conceptregel: {
            hoofdstuk,
            categorie: "arbeid",
            omschrijving,
            eenheid: normtijd!.eenheid,
            hoeveelheid: null,
            tarief: null,
            mu_per_eenheid: normtijd!.urenPerEenheid,
            arbeids_tarief: standaardArbeidstarief,
            arbeids_tarief_ontbreekt: standaardArbeidstarief == null,
            normtijd_id: normtijd!.id,
          },
          prijs_ontbreekt: true,
          mu_ontbreekt: false,
          vraag: null,
        };
      }

      telOngekoppeld++;
      return {
        ...basis,
        soortvoorstel: "werkzaamheden" as const,
        regel_soort: "regel" as const,
        omschrijving,
        tekstregel: null,
        uitkomst: "ongekoppeld" as const,
        artikel: null,
        normtijd: null,
        normtijd_kandidaten: topNormtijden,
        conceptregel: null,                              // geen regel; prijs/uren ontbreken
        prijs_ontbreekt: true,
        mu_ontbreekt: true,
        vraag: null,
      };
    });

    // ── f. Analyse loggen in calc_plak_analyses (§8.11 koppelgraad) ──────────
    // We hergebruiken de bestaande metingstabel met invoerSoort "adviesrapport"
    // zodat er geen aparte migratie nodig is. herkendAantal = aantal punten;
    // de vier plak-uitkomsten mappen op de werkzaamheden-uitkomsten.
    const meetPunten = voorstellen.slice(0, 40).map((v) => ({
      nummer: v.nummer,
      soortvoorstel: v.soortvoorstel,
      uitkomst: v.uitkomst,
    }));
    await db.insert(modCalcPlakAnalysesTable).values({
      calculatieId: id,
      gebruikerId: req.session.userId ?? null,
      invoerSoort: "adviesrapport",
      herkendAantal: puntenAantal,
      gekoppeldBeide: telVolledig,
      alleenArtikel: telAlleenArtikel,
      alleenNormtijd: telAlleenNormtijd,
      ongekoppeld: telOngekoppeld,
      herkendeProducten: meetPunten,
    });

    // ── g. Adviesrapport aan de calculatie koppelen (§4.5/§8.10) ─────────────
    // Idempotent: uniek op (document_id, doel_type, doel_id). Faalt niet als de
    // koppeling al bestaat (onConflictDoNothing).
    try {
      await db.insert(documentKoppelingenTable).values({
        documentId,
        doelType: "calculatie",
        doelId: id,
        aangemaaktDoorId: req.session.userId ?? null,
      }).onConflictDoNothing();
    } catch (err) {
      req.log.warn({ err, documentId, calculatieId: id }, "Koppeling adviesrapport ↔ calculatie kon niet worden vastgelegd");
    }

    res.json({
      document_id: documentId,
      document_naam: doc.naam,
      punten_aantal: puntenAantal,
      voorstellen,
      koppelgraad: {
        werkzaamheden: telWerkzaamheden,
        volledig: telVolledig,
        alleen_artikel: telAlleenArtikel,
        alleen_normtijd: telAlleenNormtijd,
        ongekoppeld: telOngekoppeld,
        geen_werkzaamheden: telGeenWerk,
        niet_te_beoordelen: telNietTeBeoordelen,
      },
      waarschuwing: [
        bronAfgekaptWaarschuwing,
        puntenAantalGemeld > punten.length
          ? `Het rapport meldt ${puntenAantalGemeld} punten maar er zijn er ${punten.length} uitgelezen. Controleer of alle punten aanwezig zijn.`
          : null,
        // Fail-closed aanvulling: als de koppel-AI minder koppelingen teruggaf dan
        // er punten zijn, kregen de ontbrekende punten 'niet_te_beoordelen'.
        keuzePerIndex.size < punten.length
          ? `${punten.length - keuzePerIndex.size} punt(en) konden niet automatisch worden beoordeeld en zijn gemarkeerd als 'niet te beoordelen' — controleer deze handmatig.`
          : null,
      ]
        .filter(Boolean)
        .join(" ") || null,
    });
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Adviesrapport-analyse mislukt" });
  }
});

// ── CALC_INVOER_01 §3.4: leerbron — voorgestelde regel vs. wat de calculator ──
// ervan maakte, vastgelegd in ai_veld_correcties (AI_01). Autorisatie: schrijvenCalc.
const CALC_PLAK_VELDEN = [
  "calc_plak.omschrijving",
  "calc_plak.hoeveelheid",
  "calc_plak.eenheid",
  "calc_plak.tarief",
  "calc_plak.mu_per_eenheid",
  "calc_plak.normtijd",
  "calc_plak.artikel",
  // ADVIES_01 §4.5 — leerbron voor adviesrapport-velden (AI-voorstel vs. keuze).
  "advies.omschrijving",
  "advies.hoeveelheid",
  "advies.eenheid",
  "advies.tarief",
  "advies.mu_per_eenheid",
  "advies.normtijd",
  "advies.artikel",
  "advies.soortvoorstel",
  "advies.regelnummer",
  "advies.hoofdstuk",
] as const;

router.post("/modules/calculaties/veld-correctie", schrijvenCalc, async (req, res): Promise<void> => {
  try {
    const { veld_naam, ai_voorstel, gekozen, hash, tekst_fragment } = req.body as Record<string, unknown>;
    if (!veld_naam || ai_voorstel === undefined || ai_voorstel === null || gekozen === undefined || gekozen === null) {
      return void res.status(400).json({ error: "veld_naam, ai_voorstel en gekozen zijn verplicht" });
    }
    if (!(CALC_PLAK_VELDEN as readonly string[]).includes(String(veld_naam))) {
      return void res.status(400).json({ error: "Ongeldig veld" });
    }
    await db.insert(aiVeldCorrectiesTable).values({
      hash: hash ? String(hash) : null,
      tekstFragment: tekst_fragment ? String(tekst_fragment) : null,
      veldNaam: String(veld_naam),
      aiVoorstel: String(ai_voorstel),
      gekozen: String(gekozen),
    });
    res.status(204).end();
  } catch (e) {
    req.log.error(e);
    res.status(500).json({ error: "Interne fout" });
  }
});

export default router;
