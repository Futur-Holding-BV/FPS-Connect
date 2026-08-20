// ── BANK_01 — Bankafschriften: import, overzicht, afletter en AccountView ──────
//
// Bevoegdheden:
//   - Lezen (imports, mutaties, voorstellen, audit):    bankafschriften niveau 1
//   - Schrijven / importeren / toepassen / afwijzen / exporteren: niveau 3
//
// Multer: memory-opslag, maximaal 10 MiB, één bestand.
// Extensiecheck:  onbekende extensies worden geweigerd met 400 + leesbare melding.
//                 De parser is authoritative: een bestand met een bekende extensie
//                 maar foute inhoud geeft 422 vanuit de service.
//
// HTTP-semantiek:
//   201   eerste import van dit bestand
//   200   duplicaat-import (SHA-256 al bekend)
//   400   ontbrekende velden, onbekende extensie
//   413   multer FileTooLarge
//   422   permanente parse-fout, onbekend IBAN of saldo-mismatch
//   409   state-race (voorstel al beslist, AV-export loopt al)

import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import multer from "multer";
import { requireBevoegdheid } from "../middlewares/auth";
import { db, gebruikersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  importeerBankafschrift,
  haalBankImportLijst,
  haalBankMutatieLijst,
  haalAfletterVoorstellen,
  haalAfletterAudit,
  pasToeAfletterVoorstel,
  wijsAfAfletterVoorstel,
} from "../services/bankafschriftImportService";
import {
  exporteerBankmutatieNaarAccountView,
  herstelOnzekereBankexport,
  type BankexportHerstelActie,
} from "../services/accountviewExportService";

const router = Router();

// ── Multer ────────────────────────────────────────────────────────────────────

// Bekende extensies voor bankafschriftbestanden.
// Onbekende extensies worden geweigerd met 400 (leesbare melding).
// De parser bepaalt bij de verwerking of de inhoud geldig is — extensie is hints.
const TOEGESTANE_EXTENSIES = new Set([
  ".xml",   // CAMT.053
  ".sta",   // MT940
  ".mt940", // MT940
  ".txt",   // MT940 als platte tekst
  ".940",   // MT940
  ".swi",   // MT940 SWIFT-variant
]);

const MAX_BYTES = 10 * 1024 * 1024; // 10 MiB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
});

// Weiger onbekende extensies vóór de service — maar ná multer (buffer is al
// ingelezen voor de fileFilter beslissing). We valideren de extensie in de
// route-handler zodat we een nette 400 kunnen geven met een leesbare melding.
function controleerExtensie(bestandsnaam: string): string | null {
  const naam = (bestandsnaam ?? "").toLowerCase();
  const punt = naam.lastIndexOf(".");
  const ext = punt >= 0 ? naam.slice(punt) : "";
  if (!ext || !TOEGESTANE_EXTENSIES.has(ext)) {
    return `Bestandsextensie '${ext || "(geen)"}' wordt niet ondersteund. Toegestane extensies: ${[...TOEGESTANE_EXTENSIES].join(", ")}.`;
  }
  return null; // OK
}

// 413-handler voor te grote bestanden (multer FileTooLarge)
function multerErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    res.status(413).json({
      error: "Bestand te groot",
      detail: `Maximale bestandsgrootte is ${MAX_BYTES / 1024 / 1024} MiB.`,
    });
    return;
  }
  next(err);
}

// ── Bevoegdheden ──────────────────────────────────────────────────────────────

const lezen = requireBevoegdheid("bankafschriften", 1);
const schrijven = requireBevoegdheid("bankafschriften", 3);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function haalGebruikerNaam(userId: number): Promise<string | null> {
  try {
    const [g] = await db
      .select({ naam: gebruikersTable.naam })
      .from(gebruikersTable)
      .where(eq(gebruikersTable.id, userId))
      .limit(1);
    return g?.naam ?? null;
  } catch {
    return null;
  }
}

function formaatLabel(formaat: string): string {
  return formaat === "mt940" ? "MT940 (legacy)" : "CAMT.053";
}

// ── Mappers: camelCase DB/service → snake_case API ────────────────────────────

function mapImport(r: {
  id: number;
  sha256: string;
  formaat: string;
  bestandsnaam: string;
  bron: string;
  status: string;
  fout?: string | null;
  aangemaaktOp: Date;
  aangemaaktDoor?: number | null;
  aantalAfschriften: number;
  aantalMutaties: number;
  aantalGematcht: number;
  aantalHiaten: number;
}) {
  return {
    id: r.id,
    sha256: r.sha256,
    formaat: r.formaat,
    formaat_label: formaatLabel(r.formaat),
    bestandsnaam: r.bestandsnaam,
    bron: r.bron,
    status: r.status,
    fout: r.fout ?? null,
    aantal_afschriften: r.aantalAfschriften,
    aantal_mutaties: r.aantalMutaties,
    aantal_gematcht: r.aantalGematcht,
    aantal_hiaten: r.aantalHiaten,
    aangemaakt_op: r.aangemaaktOp.toISOString(),
    aangemaakt_door: r.aangemaaktDoor ?? null,
  };
}

function mapMutatie(r: {
  id: number;
  afschriftId: number;
  bankrekeningId: number;
  werkgeverId: number;
  bankreferentie: string;
  txReferentie: string | null;
  endToEndReferentie: string | null;
  bedrag: string;
  valuta: string;
  creditDebit: string;
  boekdatum: string;
  valuedatum: string | null;
  tegenpartijIban: string | null;
  tegenpartijNaam: string | null;
  remittance: string | null;
  gRekening: boolean;
  reconciliatieStatus: string;
  matchedFactuurId: number | null;
  matchedBatchregelId: number | null;
  accountviewStatus: string | null;
  accountviewId: string | null;
  accountviewFout: string | null;
  aangemaaktOp: Date;
  bijgewerktOp: Date;
}) {
  return {
    id: r.id,
    afschrift_id: r.afschriftId,
    bankrekening_id: r.bankrekeningId,
    werkgever_id: r.werkgeverId,
    bankreferentie: r.bankreferentie,
    tx_referentie: r.txReferentie ?? null,
    end_to_end_referentie: r.endToEndReferentie ?? null,
    bedrag: r.bedrag,
    valuta: r.valuta,
    credit_debit: r.creditDebit,
    boekdatum: r.boekdatum,
    valuedatum: r.valuedatum ?? null,
    tegenpartij_iban: r.tegenpartijIban ?? null,
    tegenpartij_naam: r.tegenpartijNaam ?? null,
    remittance: r.remittance ?? null,
    g_rekening: r.gRekening,
    reconciliatie_status: r.reconciliatieStatus,
    matched_factuur_id: r.matchedFactuurId ?? null,
    matched_batchregel_id: r.matchedBatchregelId ?? null,
    accountview_status: r.accountviewStatus ?? null,
    accountview_id: r.accountviewId ?? null,
    accountview_fout: r.accountviewFout ?? null,
    aangemaakt_op: r.aangemaaktOp.toISOString(),
    bijgewerkt_op: r.bijgewerktOp.toISOString(),
  };
}

function mapVoorstel(v: {
  id: number;
  mutatieId: number;
  factuurId: number | null;
  batchregelId: number | null;
  rang: number;
  reden: string | null;
  status: string;
  beslistDoor: number | null;
  beslistOp: Date | null;
  aangemaaktOp: Date;
  bijgewerktOp: Date;
}) {
  return {
    id: v.id,
    mutatie_id: v.mutatieId,
    factuur_id: v.factuurId ?? null,
    // batchregel_id = authoritative naam; batch_id = alias voor backwards compat met frontend
    batchregel_id: v.batchregelId ?? null,
    batch_id: v.batchregelId ?? null,
    status: v.status,
    rang: v.rang,
    reden: v.reden ?? null,
    // afwijzing_reden: alleen gevuld als status === "afgewezen"; opgeslagen in reden-veld.
    // De service slaat de afwijzingsreden op als reden; we geven hem hier mee als alias.
    afwijzing_reden: v.status === "afgewezen" ? (v.reden ?? null) : null,
    beslist_door: v.beslistDoor ?? null,
    beslist_op: v.beslistOp?.toISOString() ?? null,
    aangemaakt_op: v.aangemaaktOp.toISOString(),
    bijgewerkt_op: v.bijgewerktOp.toISOString(),
  };
}

function mapAudit(a: {
  id: number;
  mutatieId: number;
  voorstelId: number | null;
  actie: string;
  reden: string | null;
  gebruikerId: number | null;
  gebruikerNaam: string | null;
  aangemaaktOp: Date;
}) {
  return {
    id: a.id,
    mutatie_id: a.mutatieId,
    voorstel_id: a.voorstelId ?? null,
    actie: a.actie,
    reden: a.reden ?? null,
    // detail: alias voor reden (backwards compat met frontend)
    detail: a.reden ?? null,
    gebruiker_id: a.gebruikerId ?? null,
    gebruiker_naam: a.gebruikerNaam ?? null,
    aangemaakt_op: a.aangemaaktOp.toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /bankafschriften/import
// ═══════════════════════════════════════════════════════════════════════════════

router.post(
  "/bankafschriften/import",
  schrijven,
  upload.single("bestand"),
  multerErrorHandler,
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: "Geen bestand meegegeven (veld: bestand)" });
      return;
    }

    // Extensiecontrole — 400 bij onbekende extensie, parser blijft authoritative
    const extFout = controleerExtensie(req.file.originalname ?? "");
    if (extFout) {
      res.status(400).json({ error: extFout });
      return;
    }

    const formaat = String(req.body?.formaat ?? "").trim();
    if (formaat !== "camt053" && formaat !== "mt940") {
      res.status(400).json({
        error: "Veld 'formaat' is verplicht en moet 'camt053' of 'mt940' zijn.",
      });
      return;
    }

    const userId = req.session?.userId ?? null;

    const resultaat = await importeerBankafschrift({
      buffer: req.file.buffer,
      bestandsnaam: req.file.originalname ?? "upload",
      contenttype: req.file.mimetype ?? null,
      formaat,
      bron: "upload",
      gebruikerId: userId,
    });

    if (!resultaat.ok) {
      res.status(422).json({
        error: resultaat.fout ?? "Import mislukt",
        detail: resultaat.fout ?? null,
        hiat_signalen: resultaat.hiatSignalen ?? null,
        onbekend_ibans: resultaat.onbekendIbans ?? null,
      });
      return;
    }

    const httpStatus = resultaat.duplicate ? 200 : 201;
    res.status(httpStatus).json({
      ok: true,
      duplicate: resultaat.duplicate ?? false,
      import_id: resultaat.importId ?? null,
      aantal_nieuwe_afschriften: resultaat.aantalNieuweAfschriften ?? 0,
      aantal_nieuwe_mutaties: resultaat.aantalNieuweMutaties ?? 0,
      aantal_gematcht: resultaat.aantalGematcht ?? 0,
      hiat_signalen: resultaat.hiatSignalen ?? null,
      onbekend_ibans: resultaat.onbekendIbans ?? null,
      formaat_label: formaatLabel(formaat),
      fout: null,
    });
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// GET /bankafschriften/imports
// ═══════════════════════════════════════════════════════════════════════════════

router.get(
  "/bankafschriften/imports",
  lezen,
  async (req: Request, res: Response): Promise<void> => {
    const werkgeverIdRaw = req.query["werkgever_id"];
    const werkgeverId =
      werkgeverIdRaw != null
        ? Number.parseInt(String(werkgeverIdRaw), 10)
        : undefined;

    const rijen = await haalBankImportLijst(
      werkgeverId != null && Number.isFinite(werkgeverId) ? werkgeverId : undefined,
    );

    res.json({ items: rijen.map(mapImport) });
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// GET /bankafschriften/mutaties
// ═══════════════════════════════════════════════════════════════════════════════

router.get(
  "/bankafschriften/mutaties",
  lezen,
  async (req: Request, res: Response): Promise<void> => {
    const { werkgever_id, iban, reconciliatie_status, g_rekening, limit, offset } =
      req.query;

    const werkgeverId =
      werkgever_id != null ? Number.parseInt(String(werkgever_id), 10) : undefined;
    const limitVal = Math.min(Number.parseInt(String(limit ?? "50"), 10) || 50, 500);
    const offsetVal = Number.parseInt(String(offset ?? "0"), 10) || 0;

    let gRekeningBool: boolean | undefined;
    if (g_rekening != null) {
      const gr = String(g_rekening).toLowerCase();
      if (gr === "true" || gr === "1") gRekeningBool = true;
      else if (gr === "false" || gr === "0") gRekeningBool = false;
    }

    const lijst = await haalBankMutatieLijst({
      werkgeverId:
        werkgeverId != null && Number.isFinite(werkgeverId) ? werkgeverId : undefined,
      iban: iban != null ? String(iban).trim() || undefined : undefined,
      reconciliatieStatus:
        reconciliatie_status != null
          ? String(reconciliatie_status).trim() || undefined
          : undefined,
      gRekening: gRekeningBool,
      limit: limitVal,
      offset: offsetVal,
    });

    res.json({
      items: lijst.items.map(mapMutatie),
      totaal: lijst.totaal,
    });
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// GET /bankafschriften/mutaties/:id/voorstellen
// ═══════════════════════════════════════════════════════════════════════════════

router.get(
  "/bankafschriften/mutaties/:id/voorstellen",
  lezen,
  async (req: Request, res: Response): Promise<void> => {
    const id = Number.parseInt(String(req.params["id"] ?? ""), 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Ongeldig id" });
      return;
    }

    // haalAfletterVoorstellen retourneert lege array als mutatie onbekend is.
    // We controleren het bestaan van de mutatie niet apart — leeg resultaat is
    // correct voor een mutatie zonder voorstellen. Strikter: 404 check kan
    // worden toegevoegd zodra de service dat ondersteunt.
    const voorstellen = await haalAfletterVoorstellen(id);

    res.json({ items: voorstellen.map(mapVoorstel) });
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// GET /bankafschriften/mutaties/:id/audit
// ═══════════════════════════════════════════════════════════════════════════════

router.get(
  "/bankafschriften/mutaties/:id/audit",
  lezen,
  async (req: Request, res: Response): Promise<void> => {
    const id = Number.parseInt(String(req.params["id"] ?? ""), 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Ongeldig id" });
      return;
    }

    const auditRijen = await haalAfletterAudit(id);

    res.json({ items: auditRijen.map(mapAudit) });
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// POST /bankafschriften/voorstellen/:id/toepassen
// ═══════════════════════════════════════════════════════════════════════════════

router.post(
  "/bankafschriften/voorstellen/:id/toepassen",
  schrijven,
  async (req: Request, res: Response): Promise<void> => {
    const id = Number.parseInt(String(req.params["id"] ?? ""), 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Ongeldig id" });
      return;
    }

    const userId = req.session?.userId;
    if (!userId) {
      res.status(401).json({ error: "Niet ingelogd" });
      return;
    }

    const gebruikerNaam = await haalGebruikerNaam(userId);

    const uitkomst = await pasToeAfletterVoorstel(id, userId, gebruikerNaam ?? undefined);

    if (!uitkomst.ok) {
      const fout = uitkomst.fout ?? "Toepassen mislukt";
      // State-races herkennen aan vaste foutberichten vanuit de service
      const isStateRace =
        fout.includes("al gematcht") ||
        fout.includes("al verwerkt") ||
        fout.includes("gelijktijdig");
      const isNietGevonden =
        fout.includes("niet gevonden") || fout.includes("Voorstel niet gevonden");
      if (isNietGevonden) {
        res.status(404).json({ error: fout });
      } else if (isStateRace) {
        res.status(409).json({ error: fout });
      } else {
        res.status(422).json({ error: fout });
      }
      return;
    }

    // De service geeft geen updated-entity terug; minimale bevestiging volstaat.
    res.json({ ok: true, voorstel_id: id });
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// POST /bankafschriften/voorstellen/:id/afwijzen
// ═══════════════════════════════════════════════════════════════════════════════

router.post(
  "/bankafschriften/voorstellen/:id/afwijzen",
  schrijven,
  async (req: Request, res: Response): Promise<void> => {
    const id = Number.parseInt(String(req.params["id"] ?? ""), 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Ongeldig id" });
      return;
    }

    const reden = String(req.body?.reden ?? "").trim();
    if (!reden) {
      res.status(400).json({ error: "Veld 'reden' is verplicht bij afwijzen" });
      return;
    }

    const userId = req.session?.userId;
    if (!userId) {
      res.status(401).json({ error: "Niet ingelogd" });
      return;
    }

    const gebruikerNaam = await haalGebruikerNaam(userId);

    const uitkomst = await wijsAfAfletterVoorstel(
      id,
      userId,
      reden,
      gebruikerNaam ?? undefined,
    );

    if (!uitkomst.ok) {
      const fout = uitkomst.fout ?? "Afwijzen mislukt";
      const isStateRace =
        fout.includes("al verwerkt") || fout.includes("gelijktijdig");
      const isNietGevonden =
        fout.includes("niet gevonden") || fout.includes("Voorstel niet gevonden");
      if (isNietGevonden) {
        res.status(404).json({ error: fout });
      } else if (isStateRace) {
        res.status(409).json({ error: fout });
      } else {
        res.status(422).json({ error: fout });
      }
      return;
    }

    res.json({ ok: true, voorstel_id: id });
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// POST /bankafschriften/mutaties/:id/accountview
// ═══════════════════════════════════════════════════════════════════════════════

router.post(
  "/bankafschriften/mutaties/:id/accountview",
  schrijven,
  async (req: Request, res: Response): Promise<void> => {
    const id = Number.parseInt(String(req.params["id"] ?? ""), 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Ongeldig id" });
      return;
    }

    const userId = req.session?.userId ?? null;

    const uitkomst = await exporteerBankmutatieNaarAccountView(id, userId);

    if (!uitkomst.ok) {
      res.status(uitkomst.httpStatus).json({
        error: uitkomst.fout ?? "AccountView-export mislukt",
        detail: uitkomst.detail ?? null,
      });
      return;
    }

    res.json({
      ok: uitkomst.ok,
      geslaagd: uitkomst.geslaagd ?? false,
      boeking_id: uitkomst.boekingId ?? null,
      foutmelding: uitkomst.foutmelding ?? null,
      testmodus: uitkomst.testmodus ?? null,
    });
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// POST /bankafschriften/mutaties/:id/accountview-herstel
// ═══════════════════════════════════════════════════════════════════════════════

router.post(
  "/bankafschriften/mutaties/:id/accountview-herstel",
  schrijven,
  async (req: Request, res: Response): Promise<void> => {
    const id = Number.parseInt(String(req.params["id"] ?? ""), 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Ongeldig id" });
      return;
    }
    const actie = String(req.body?.actie ?? "") as BankexportHerstelActie;
    if (actie !== "bevestig_geboekt" && actie !== "opnieuw_proberen") {
      res.status(400).json({ error: "Actie moet 'bevestig_geboekt' of 'opnieuw_proberen' zijn" });
      return;
    }
    const reden = String(req.body?.reden ?? "");
    const boekingId = req.body?.accountview_boeking_id == null
      ? null
      : String(req.body.accountview_boeking_id);
    const uitkomst = await herstelOnzekereBankexport(
      id,
      actie,
      reden,
      req.session?.userId ?? null,
      boekingId,
    );
    if (!uitkomst.ok) {
      res.status(uitkomst.httpStatus).json({
        error: uitkomst.fout ?? "AccountView-herstel mislukt",
        detail: uitkomst.detail ?? null,
      });
      return;
    }
    res.json({
      ok: true,
      geslaagd: uitkomst.geslaagd ?? false,
      boeking_id: uitkomst.boekingId ?? null,
      foutmelding: uitkomst.foutmelding ?? null,
      testmodus: uitkomst.testmodus ?? null,
    });
  },
);

export default router;
