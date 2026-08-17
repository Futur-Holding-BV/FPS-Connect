// Magazijn- en Voorraadbeheer (Fase 1 — Kern)
// Routes: locaties, artikelen-magazijn, voorraad, mutaties, reserveringen, uitgiftes, retouren, dashboard
// Fase 2 — Inkooporders + Picklijsten (statusmachine, voorraad-koppeling)
import { veiligeFoutmelding } from "../middlewares/foutafhandelaar";
import { Router } from "express";
import {
  db,
  magazijnLocatiesTable,
  voorraadTable,
  voorraadMutatiesTable,
  reserveringenTable,
  artikelenTable,
  leveranciersTable,
  gebruikersTable,
  opdrachtenTable,
  magazijnStellingscansTable,
  magazijnInstellingenTable,
  inkoopVersiesTable,
  magazijnSnoozesTable,
  magazijnInkoopordersTable,
  magazijnInkooporderRegelsTable,
  magazijnPicklijstenTable,
  magazijnPicklijstRegelsTable,
  medewerkersTable,
  planningItemsTable,
  werkgeversTable,
  gebouwenTable,
  documentStudioModellenTable,
} from "@workspace/db";
import { eq, and, asc, desc, ilike, lt, lte, gte, sql, gt, inArray, isNotNull } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { verstuurMail, MailFout } from "../services/email";
import { ObjectStorageService } from "../lib/objectStorage";
import { aiGateway, heeftGateway } from "../lib/aiGateway";
import { MAGAZIJN_RETOUR_SCAN_BASE_PROMPT, MAGAZIJN_STELLING_SCAN_BASE_PROMPT, MAGAZIJN_BESTELSUGGESTIE_PROMPT } from "../lib/aiPrompts";
import { herplanMagazijnSignalering } from "../lib/magazijnSignalering";
import { formatNummer, herzieningsLetter, kenmerkVoorVoorraadinkoop } from "../lib/kenmerk";

const router = Router();

const lezen    = requireBevoegdheid("magazijn", 1);
const schrijven = requireBevoegdheid("magazijn", 2);
const aanmaken = requireBevoegdheid("magazijn", 3);
const beheer   = requireBevoegdheid("magazijn", 4);

const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;
const escapeHtml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Transaction-aware executor type (drizzle tx or plain db)
type DbExec = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

// ── Helpers ────────────────────────────────────────────────────────────────────

function str(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return null;
  return String(v);
}

function num(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function mapLocatie(r: typeof magazijnLocatiesTable.$inferSelect) {
  return {
    id: r.id,
    naam: r.naam,
    type: r.type,
    parent_id: r.parentId ?? null,
    omschrijving: r.omschrijving ?? null,
    actief: r.actief,
    aangemaakt_op: iso(r.aangemaaktOp)!,
    bijgewerkt_op: iso(r.bijgewerktOp)!,
  };
}

function mapVoorraad(r: typeof voorraadTable.$inferSelect, artikelNaam?: string | null) {
  return {
    id: r.id,
    artikel_id: r.artikelId,
    artikel_naam: artikelNaam ?? null,
    locatie_id: r.locatieId ?? null,
    hoeveelheid: r.hoeveelheid,
    gereserveerd: r.gereserveerd,
    besteld: r.besteld,
    vrij: Math.max(0, r.hoeveelheid - r.gereserveerd),
    bijgewerkt_op: iso(r.bijgewerktOp)!,
  };
}

function mapMutatie(r: typeof voorraadMutatiesTable.$inferSelect, extra?: { artikel_naam?: string | null; gebruiker_naam?: string | null; opdracht_titel?: string | null }) {
  return {
    id: r.id,
    artikel_id: r.artikelId,
    artikel_naam: extra?.artikel_naam ?? null,
    locatie_id: r.locatieId ?? null,
    type: r.type,
    hoeveelheid: r.hoeveelheid,
    delta: r.delta,
    referentie_type: r.referentieType ?? null,
    referentie_id: r.referentieId ?? null,
    opdracht_id: r.opdrachtId ?? null,
    opdracht_titel: extra?.opdracht_titel ?? null,
    gebruiker_id: r.gebruikerId ?? null,
    gebruiker_naam: extra?.gebruiker_naam ?? null,
    omschrijving: r.omschrijving ?? null,
    aangemaakt_op: iso(r.aangemaaktOp)!,
    accountview_export_op: iso(r.accountviewExportOp ?? null),
  };
}

function mapReservering(r: typeof reserveringenTable.$inferSelect, extra?: { artikel_naam?: string | null; opdracht_titel?: string | null }) {
  return {
    id: r.id,
    artikel_id: r.artikelId,
    artikel_naam: extra?.artikel_naam ?? null,
    opdracht_id: r.opdrachtId ?? null,
    opdracht_titel: extra?.opdracht_titel ?? null,
    hoeveelheid: r.hoeveelheid,
    gereserveerd_op: iso(r.gereserveerdOp)!,
    status: r.status,
    omschrijving: r.omschrijving ?? null,
    aangemaakt_door_id: r.aangemaaktDoorId ?? null,
    bijgewerkt_op: iso(r.bijgewerktOp)!,
  };
}

function mapArtikelMagazijn(r: typeof artikelenTable.$inferSelect, leverancierNaam?: string | null) {
  return {
    id: r.id,
    code: r.code ?? null,
    naam: r.naam,
    omschrijving: r.omschrijving ?? null,
    eenheid: r.eenheid,
    categorie: r.categorie ?? null,
    merk: (r as Record<string, unknown>).merk as string | null ?? null,
    leverancier_id: r.leverancierId ?? null,
    leverancier_naam: leverancierNaam ?? null,
    leveranciers_artikel_nr: (r as Record<string, unknown>).leveranciersArtikelNr as string | null ?? null,
    inkoopprijs: r.inkoopprijs ?? null,
    verkoopprijs: r.verkoopprijs ?? null,
    gemiddeld_inkoopprijs: (r as Record<string, unknown>).gemiddeldInkoopprijs as number | null ?? null,
    laatste_inkoopprijs: (r as Record<string, unknown>).laatsteInkoopprijs as number | null ?? null,
    btw_percentage: r.btwPercentage,
    minimum_voorraad: (r as Record<string, unknown>).minimumVoorraad as number | null ?? null,
    gewenste_voorraad: (r as Record<string, unknown>).gewensteVoorraad as number | null ?? null,
    barcode: (r as Record<string, unknown>).barcode as string | null ?? null,
    locatie_id: (r as Record<string, unknown>).locatieId as number | null ?? null,
    notities: r.notities ?? null,
    actief: r.actief,
    bron: r.bron,
    import_id: r.importId ?? null,
    aangemaakt_op: iso(r.aangemaaktOp)!,
    bijgewerkt_op: iso(r.bijgewerktOp)!,
  };
}

// ── Voorraad bijwerken (intern hulpfunctie) ────────────────────────────────────
// Accepts a Drizzle transaction executor (tx) or plain db for non-transactional use.
// For negative deltas (uitgifte/correctie), call AFTER validating available stock at the
// call site. hoeveelheid never drops below 0 (GREATEST guard).

async function bijwerkenVoorraad(
  exec: DbExec,
  artikelId: number,
  locatieId: number | null,
  delta: number,
  type: string,
  gebruikerId: number | undefined,
  referentieType: string | null,
  referentieId: number | null,
  omschrijving: string | null,
  opdrachtId?: number | null,
  // BOUW_01 §6: verbruik dat niet op een project mag landen
  kostenrubriek?: string | null,
) {
  const whereExpr = locatieId != null
    ? and(eq(voorraadTable.artikelId, artikelId), eq(voorraadTable.locatieId, locatieId))
    : and(eq(voorraadTable.artikelId, artikelId), sql`${voorraadTable.locatieId} IS NULL`);

  const bestaand = await exec.select().from(voorraadTable).where(whereExpr).limit(1);

  // Bereken de werkelijk toe te passen delta (hoeveelheid nooit < 0)
  let actualDelta: number;
  if (bestaand.length > 0) {
    actualDelta = delta < 0
      ? Math.max(delta, -bestaand[0].hoeveelheid) // kan niet verder dan 0 zakken
      : delta;
    await exec.update(voorraadTable)
      .set({
        hoeveelheid: sql`GREATEST(0, ${voorraadTable.hoeveelheid} + ${delta})`,
        bijgewerktOp: new Date(),
      })
      .where(eq(voorraadTable.id, bestaand[0].id));
  } else {
    actualDelta = Math.max(0, delta); // nieuwe rij start altijd op max(0, delta)
    await exec.insert(voorraadTable).values({
      artikelId,
      locatieId,
      hoeveelheid: actualDelta,
      gereserveerd: 0,
      besteld: 0,
    });
  }

  // Mutatie logt de werkelijk toegepaste delta (niet de aangevraagde)
  await exec.insert(voorraadMutatiesTable).values({
    artikelId,
    locatieId,
    type,
    hoeveelheid: Math.abs(actualDelta),
    delta: actualDelta,
    referentieType,
    referentieId,
    opdrachtId: opdrachtId ?? null,
    gebruikerId: gebruikerId ?? null,
    omschrijving,
    kostenrubriek: kostenrubriek ?? null,
  });
}

// BOUW_01 §6: toebehoren gereedschap = verbruik op de rubriek
// magazijn-gereedschap-toebehoren, nooit op een project. Afgeleid uit de
// artikelcategorie zodra er zonder opdracht wordt uitgegeven.
async function bepaalKostenrubriek(
  exec: DbExec,
  artikelId: number,
  opdrachtId: number | null,
): Promise<string | null> {
  if (opdrachtId) return null;
  const [art] = await exec
    .select({ categorie: artikelenTable.categorie })
    .from(artikelenTable)
    .where(eq(artikelenTable.id, artikelId));
  const cat = (art?.categorie ?? "").toLowerCase();
  return cat.includes("toebehoren") ? "gereedschap_toebehoren" : null;
}

// ── Toebehoren-verbruik: BOUW_01 §6 — eigen kostenpost, los van projecten ────
// Aggregeert alle uitgifte-mutaties met kostenrubriek 'gereedschap_toebehoren'
// per maand (aantal + kostprijs op basis van gemiddelde/laatst bekende inkoopprijs).
router.get("/magazijn/toebehoren-verbruik", lezen, async (req, res): Promise<void> => {
  try {
    const van = typeof req.query.van === "string" && req.query.van ? new Date(`${req.query.van}T00:00:00`) : null;
    const tot = typeof req.query.tot === "string" && req.query.tot ? new Date(`${req.query.tot}T23:59:59.999`) : null;
    if ((van && isNaN(van.getTime())) || (tot && isNaN(tot.getTime()))) {
      res.status(400).json({ error: "Ongeldige datum (verwacht YYYY-MM-DD)" });
      return;
    }

    const condities = [
      eq(voorraadMutatiesTable.kostenrubriek, "gereedschap_toebehoren"),
      inArray(voorraadMutatiesTable.type, ["uitgifte", "retour"]),
    ];
    if (van) condities.push(gte(voorraadMutatiesTable.aangemaaktOp, van));
    if (tot) condities.push(lte(voorraadMutatiesTable.aangemaaktOp, tot));

    const mutaties = await db
      .select({
        artikelId: voorraadMutatiesTable.artikelId,
        type: voorraadMutatiesTable.type,
        hoeveelheid: voorraadMutatiesTable.hoeveelheid,
        delta: voorraadMutatiesTable.delta,
        aangemaaktOp: voorraadMutatiesTable.aangemaaktOp,
        naam: artikelenTable.naam,
        eenheid: artikelenTable.eenheid,
        inkoopprijs: artikelenTable.inkoopprijs,
        gemiddeldInkoopprijs: artikelenTable.gemiddeldInkoopprijs,
        laatsteInkoopprijs: artikelenTable.laatsteInkoopprijs,
      })
      .from(voorraadMutatiesTable)
      .leftJoin(artikelenTable, eq(voorraadMutatiesTable.artikelId, artikelenTable.id))
      .where(and(...condities));

    const rond = (n: number) => Math.round(n * 100) / 100;
    const periodeMap = new Map<string, { aantal: number; kosten: number; aantalZonderPrijs: number }>();
    const artikelMap = new Map<number, { naam: string; eenheid: string; aantal: number; kosten: number; aantalZonderPrijs: number }>();
    let totaalAantal = 0;
    let totaalKosten = 0;
    let onbekendePrijsAantal = 0;

    for (const m of mutaties) {
      // Saldering: uitgifte telt op, retour telt af. Voor retouren gebruiken we
      // de werkelijk teruggeplaatste delta (defect/afval heeft delta 0 en
      // verlaagt de kosten dus terecht niet).
      const aantal = m.type === "retour" ? -Math.max(0, m.delta) : m.hoeveelheid;
      if (aantal === 0) continue;

      // Prijsbasis: gewogen gemiddelde > laatst bekende inkoop > vaste inkoopprijs > onbekend
      const prijs = m.gemiddeldInkoopprijs ?? m.laatsteInkoopprijs ?? m.inkoopprijs ?? null;
      const kosten = prijs != null && prijs > 0 ? aantal * prijs : 0;
      const zonderPrijs = prijs == null || prijs <= 0 ? Math.abs(aantal) : 0;
      onbekendePrijsAantal += zonderPrijs;

      totaalAantal += aantal;
      totaalKosten += kosten;

      const d = m.aangemaaktOp;
      const periode = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const p = periodeMap.get(periode) ?? { aantal: 0, kosten: 0, aantalZonderPrijs: 0 };
      periodeMap.set(periode, { aantal: p.aantal + aantal, kosten: p.kosten + kosten, aantalZonderPrijs: p.aantalZonderPrijs + zonderPrijs });

      const a = artikelMap.get(m.artikelId) ?? { naam: m.naam ?? "Onbekend artikel", eenheid: m.eenheid ?? "stuks", aantal: 0, kosten: 0, aantalZonderPrijs: 0 };
      artikelMap.set(m.artikelId, { ...a, aantal: a.aantal + aantal, kosten: a.kosten + kosten, aantalZonderPrijs: a.aantalZonderPrijs + zonderPrijs });
    }

    res.json({
      totaal_aantal: rond(totaalAantal),
      totaal_kosten: rond(totaalKosten),
      per_periode: [...periodeMap.entries()]
        .map(([periode, v]) => ({ periode, aantal: rond(v.aantal), kosten: rond(v.kosten), aantal_zonder_prijs: rond(v.aantalZonderPrijs) }))
        .sort((a, b) => b.periode.localeCompare(a.periode)),
      per_artikel: [...artikelMap.entries()]
        .map(([artikel_id, v]) => ({ artikel_id, naam: v.naam, eenheid: v.eenheid, aantal: rond(v.aantal), kosten: rond(v.kosten), aantal_zonder_prijs: rond(v.aantalZonderPrijs) }))
        .sort((a, b) => b.kosten - a.kosten),
      onbekende_prijs_aantal: rond(onbekendePrijsAantal),
    });
  } catch (err) {
    logger.error({ err }, "magazijn toebehoren-verbruik fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ═══════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════

// ── Signalering: kritieke artikelen teller (voor sidebar-badge) ──────────────

router.get("/magazijn/signalering", lezen, async (req, res): Promise<void> => {
  try {
    const voorraad = await db.select({
      artikel_id: voorraadTable.artikelId,
      hoeveelheid: voorraadTable.hoeveelheid,
    }).from(voorraadTable);

    const artikelen = await db.select({
      id: artikelenTable.id,
      minimum_voorraad: sql<number | null>`${artikelenTable}.minimum_voorraad`,
    }).from(artikelenTable).where(eq(artikelenTable.actief, true));

    const voorraadMap = new Map<number, number>();
    for (const v of voorraad) {
      voorraadMap.set(v.artikel_id, (voorraadMap.get(v.artikel_id) ?? 0) + (v.hoeveelheid ?? 0));
    }

    let kritiekAantal = 0;
    for (const artikel of artikelen) {
      const minVoorraad = (artikel as Record<string, unknown>).minimum_voorraad as number | null;
      if (minVoorraad == null) continue;
      const hoeveelheid = voorraadMap.get(artikel.id) ?? 0;
      if (hoeveelheid < minVoorraad) kritiekAantal++;
    }

    res.json({ kritiek_aantal: kritiekAantal });
  } catch (err) {
    logger.error({ err }, "magazijn signalering fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── Signalering-instellingen: tijdstip + marge van de dagelijkse controle ────

router.get("/magazijn/instellingen", lezen, async (req, res): Promise<void> => {
  try {
    const [rij] = await db.select().from(magazijnInstellingenTable).where(eq(magazijnInstellingenTable.id, 1));
    if (!rij) {
      res.json({ signalering_uur: 7, signalering_minuut: 0, signalering_marge: 0, bijgewerkt_op: new Date().toISOString() });
      return;
    }
    res.json({
      signalering_uur: rij.signaleringUur,
      signalering_minuut: rij.signaleringMinuut,
      signalering_marge: rij.signaleringMarge,
      bijgewerkt_op: iso(rij.bijgewerktOp),
    });
  } catch (err) {
    logger.error({ err }, "magazijn instellingen ophalen fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

router.patch("/magazijn/instellingen", beheer, async (req, res): Promise<void> => {
  try {
    const { signalering_uur, signalering_minuut, signalering_marge } = req.body as {
      signalering_uur?: number;
      signalering_minuut?: number;
      signalering_marge?: number;
    };

    if (signalering_uur != null && (signalering_uur < 0 || signalering_uur > 23)) {
      res.status(400).json({ error: "signalering_uur moet tussen 0 en 23 liggen" });
      return;
    }
    if (signalering_minuut != null && (signalering_minuut < 0 || signalering_minuut > 59)) {
      res.status(400).json({ error: "signalering_minuut moet tussen 0 en 59 liggen" });
      return;
    }
    if (signalering_marge != null && signalering_marge < 0) {
      res.status(400).json({ error: "signalering_marge mag niet negatief zijn" });
      return;
    }

    const [bestaand] = await db.select().from(magazijnInstellingenTable).where(eq(magazijnInstellingenTable.id, 1));

    const waarden = {
      signaleringUur: signalering_uur ?? bestaand?.signaleringUur ?? 7,
      signaleringMinuut: signalering_minuut ?? bestaand?.signaleringMinuut ?? 0,
      signaleringMarge: signalering_marge ?? bestaand?.signaleringMarge ?? 0,
      bijgewerktOp: new Date(),
      bijgewerktDoorId: req.session.userId ?? null,
    };

    const [rij] = bestaand
      ? await db.update(magazijnInstellingenTable).set(waarden).where(eq(magazijnInstellingenTable.id, 1)).returning()
      : await db.insert(magazijnInstellingenTable).values({ id: 1, ...waarden }).returning();

    herplanMagazijnSignalering();

    res.json({
      signalering_uur: rij.signaleringUur,
      signalering_minuut: rij.signaleringMinuut,
      signalering_marge: rij.signaleringMarge,
      bijgewerkt_op: iso(rij.bijgewerktOp),
    });
  } catch (err) {
    logger.error({ err }, "magazijn instellingen bijwerken fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── Snoozes: dagelijkse mail per artikel tijdelijk onderdrukken ─────────────

router.get("/magazijn/snoozes", lezen, async (req, res): Promise<void> => {
  try {
    const rijen = await db
      .select({
        id: magazijnSnoozesTable.id,
        artikel_id: magazijnSnoozesTable.artikelId,
        artikel_naam: artikelenTable.naam,
        gesnoozed_tot: magazijnSnoozesTable.gesnoozedTot,
        reden: magazijnSnoozesTable.reden,
        aangemaakt_op: magazijnSnoozesTable.aangemaaktOp,
      })
      .from(magazijnSnoozesTable)
      .innerJoin(artikelenTable, eq(artikelenTable.id, magazijnSnoozesTable.artikelId))
      .where(gt(magazijnSnoozesTable.gesnoozedTot, new Date()))
      .orderBy(asc(magazijnSnoozesTable.gesnoozedTot));

    res.json(rijen.map((r) => ({ ...r, gesnoozed_tot: iso(r.gesnoozed_tot), aangemaakt_op: iso(r.aangemaakt_op) })));
  } catch (err) {
    logger.error({ err }, "magazijn snoozes ophalen fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

router.post("/magazijn/artikelen/:id/snooze", schrijven, async (req, res): Promise<void> => {
  try {
    const artikelId = Number(req.params.id);
    const { dagen, reden } = req.body as { dagen: number; reden?: string };

    if (!dagen || dagen < 1 || dagen > 90) {
      res.status(400).json({ error: "dagen moet tussen 1 en 90 liggen" });
      return;
    }

    const [artikel] = await db.select({ id: artikelenTable.id, naam: artikelenTable.naam }).from(artikelenTable).where(eq(artikelenTable.id, artikelId));
    if (!artikel) {
      res.status(404).json({ error: "Artikel niet gevonden" });
      return;
    }

    const gesnoozedTot = new Date();
    gesnoozedTot.setDate(gesnoozedTot.getDate() + dagen);

    const [rij] = await db
      .insert(magazijnSnoozesTable)
      .values({ artikelId, gesnoozedTot, reden: reden ?? null, aangemaaktDoorId: req.session.userId ?? null })
      .onConflictDoUpdate({
        target: magazijnSnoozesTable.artikelId,
        set: { gesnoozedTot, reden: reden ?? null, aangemaaktDoorId: req.session.userId ?? null, aangemaaktOp: new Date() },
      })
      .returning();

    res.json({
      id: rij.id,
      artikel_id: rij.artikelId,
      artikel_naam: artikel.naam,
      gesnoozed_tot: iso(rij.gesnoozedTot),
      reden: rij.reden,
      aangemaakt_op: iso(rij.aangemaaktOp),
    });
  } catch (err) {
    logger.error({ err }, "magazijn snooze aanmaken fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

router.delete("/magazijn/artikelen/:id/snooze", schrijven, async (req, res): Promise<void> => {
  try {
    const artikelId = Number(req.params.id);
    await db.delete(magazijnSnoozesTable).where(eq(magazijnSnoozesTable.artikelId, artikelId));
    res.status(204).send();
  } catch (err) {
    logger.error({ err }, "magazijn snooze verwijderen fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

router.get("/magazijn/dashboard", lezen, async (req, res): Promise<void> => {
  try {
    const voorraad = await db.select({
      artikel_id: voorraadTable.artikelId,
      hoeveelheid: voorraadTable.hoeveelheid,
      gereserveerd: voorraadTable.gereserveerd,
      besteld: voorraadTable.besteld,
    }).from(voorraadTable);

    const artikelen = await db.select({
      id: artikelenTable.id,
      naam: artikelenTable.naam,
      eenheid: artikelenTable.eenheid,
      minimum_voorraad: sql<number | null>`${artikelenTable}.minimum_voorraad`,
      inkoopprijs: artikelenTable.inkoopprijs,
    }).from(artikelenTable).where(eq(artikelenTable.actief, true));

    const voorraadMap = new Map<number, { hoeveelheid: number; gereserveerd: number; besteld: number }>();
    for (const v of voorraad) {
      const existing = voorraadMap.get(v.artikel_id) ?? { hoeveelheid: 0, gereserveerd: 0, besteld: 0 };
      voorraadMap.set(v.artikel_id, {
        hoeveelheid: existing.hoeveelheid + (v.hoeveelheid ?? 0),
        gereserveerd: existing.gereserveerd + (v.gereserveerd ?? 0),
        besteld: existing.besteld + (v.besteld ?? 0),
      });
    }

    let totaalWaarde = 0;
    let onderMinimum = 0;
    let totaalGereserveerd = 0;
    let totaalBesteld = 0;
    const kritiek: Array<{ id: number; naam: string; eenheid: string; hoeveelheid: number; minimum_voorraad: number }> = [];

    for (const artikel of artikelen) {
      const v = voorraadMap.get(artikel.id) ?? { hoeveelheid: 0, gereserveerd: 0, besteld: 0 };
      if (artikel.inkoopprijs) {
        totaalWaarde += v.hoeveelheid * artikel.inkoopprijs;
      }
      totaalGereserveerd += v.gereserveerd;
      totaalBesteld += v.besteld;
      const minVoorraad = (artikel as Record<string, unknown>).minimum_voorraad as number | null;
      if (minVoorraad != null && v.hoeveelheid < minVoorraad) {
        onderMinimum++;
        kritiek.push({
          id: artikel.id,
          naam: artikel.naam,
          eenheid: artikel.eenheid,
          hoeveelheid: v.hoeveelheid,
          minimum_voorraad: minVoorraad,
        });
      }
    }

    // Meest verbruikte (laatste 30 dagen)
    const dertigDagenGeleden = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const verbruik = await db.select({
      artikel_id: voorraadMutatiesTable.artikelId,
      totaal: sql<number>`SUM(ABS(${voorraadMutatiesTable.delta}))`,
    })
      .from(voorraadMutatiesTable)
      .where(
        and(
          eq(voorraadMutatiesTable.type, "uitgifte"),
          sql`${voorraadMutatiesTable.aangemaaktOp} >= ${dertigDagenGeleden}`,
        ),
      )
      .groupBy(voorraadMutatiesTable.artikelId)
      .orderBy(desc(sql<number>`SUM(ABS(${voorraadMutatiesTable.delta}))`))
      .limit(5);

    const verbruikMet = await Promise.all(verbruik.map(async (v) => {
      const [a] = await db.select({ naam: artikelenTable.naam, eenheid: artikelenTable.eenheid })
        .from(artikelenTable).where(eq(artikelenTable.id, v.artikel_id)).limit(1);
      return { artikel_id: v.artikel_id, naam: a?.naam ?? "—", eenheid: a?.eenheid ?? "st", totaal: v.totaal };
    }));

    res.json({
      totaal_waarde: Math.round(totaalWaarde * 100) / 100,
      artikelen_onder_minimum: onderMinimum,
      totaal_gereserveerd: totaalGereserveerd,
      totaal_besteld: totaalBesteld,
      kritieke_artikelen: kritiek.slice(0, 10),
      meest_verbruikt: verbruikMet,
    });
  } catch (err) {
    logger.error({ err }, "magazijn dashboard fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ═══════════════════════════════════════════════════════════
// VOORRAADWAARDE
// ═══════════════════════════════════════════════════════════

router.get("/magazijn/voorraadwaarde", lezen, async (req, res): Promise<void> => {
  try {
    // Haal alle actieve artikelen op met prijsinformatie, categorie en leverancier
    const artikelen = await db
      .select({
        id: artikelenTable.id,
        naam: artikelenTable.naam,
        eenheid: artikelenTable.eenheid,
        categorie: artikelenTable.categorie,
        leverancierId: artikelenTable.leverancierId,
        inkoopprijs: artikelenTable.inkoopprijs,
      })
      .from(artikelenTable)
      .where(eq(artikelenTable.actief, true));

    // Haal leveranciersnamen op
    const leveranciers = await db.select({ id: leveranciersTable.id, naam: leveranciersTable.naam }).from(leveranciersTable);
    const leverancierMap = new Map<number, string>(leveranciers.map((l) => [l.id, l.naam]));

    // Haal alle voorraadregels op (per artikel × locatie)
    const voorraadRegels = await db
      .select({
        artikelId: voorraadTable.artikelId,
        locatieId: voorraadTable.locatieId,
        hoeveelheid: voorraadTable.hoeveelheid,
      })
      .from(voorraadTable);

    // Haal locatienamen op
    const locaties = await db.select({ id: magazijnLocatiesTable.id, naam: magazijnLocatiesTable.naam }).from(magazijnLocatiesTable);
    const locatieMap = new Map<number, string>(locaties.map((l) => [l.id, l.naam]));

    // Bouw een map: artikelId → totale hoeveelheid per locatieId
    type LocatieHoeveelheid = { locatieId: number | null; hoeveelheid: number };
    const voorraadPerArtikel = new Map<number, LocatieHoeveelheid[]>();
    for (const r of voorraadRegels) {
      const bestaand = voorraadPerArtikel.get(r.artikelId) ?? [];
      bestaand.push({ locatieId: r.locatieId ?? null, hoeveelheid: r.hoeveelheid ?? 0 });
      voorraadPerArtikel.set(r.artikelId, bestaand);
    }

    // Hulpfuncties
    const effectievePrijs = (a: { inkoopprijs: number | null }) => {
      const gemiddeld = (a as Record<string, unknown>).gemiddeldInkoopprijs as number | null ?? null;
      return gemiddeld ?? a.inkoopprijs ?? null;
    };

    // Accumulatoren
    const categorieMap = new Map<string, { artikel_aantal: number; waarde: number }>();
    const leverancierWaardeMap = new Map<string, { artikel_aantal: number; waarde: number }>();
    const locatieWaardeMap = new Map<string, { artikel_aantal: number; waarde: number }>();
    const onbekendePrijs: Array<{ artikel_id: number; naam: string; eenheid: string; hoeveelheid: number; categorie: string | null; leverancier_naam: string | null }> = [];
    let totaalWaarde = 0;

    for (const artikel of artikelen) {
      const prijs = effectievePrijs(artikel);
      const regels = voorraadPerArtikel.get(artikel.id) ?? [];
      const totaalHoeveelheid = regels.reduce((s, r) => s + r.hoeveelheid, 0);

      if (prijs == null || prijs === 0) {
        // Artikel zonder bekende inkoopprijs — apart tonen
        if (totaalHoeveelheid > 0) {
          onbekendePrijs.push({
            artikel_id: artikel.id,
            naam: artikel.naam,
            eenheid: artikel.eenheid,
            hoeveelheid: totaalHoeveelheid,
            categorie: artikel.categorie ?? null,
            leverancier_naam: artikel.leverancierId ? (leverancierMap.get(artikel.leverancierId) ?? null) : null,
          });
        }
        continue;
      }

      const artikelWaarde = totaalHoeveelheid * prijs;
      totaalWaarde += artikelWaarde;

      // Per categorie
      const catKey = artikel.categorie ?? "Overig";
      const catExisting = categorieMap.get(catKey) ?? { artikel_aantal: 0, waarde: 0 };
      categorieMap.set(catKey, { artikel_aantal: catExisting.artikel_aantal + 1, waarde: catExisting.waarde + artikelWaarde });

      // Per leverancier
      const levNaam = artikel.leverancierId ? (leverancierMap.get(artikel.leverancierId) ?? "Onbekend") : "Geen leverancier";
      const levExisting = leverancierWaardeMap.get(levNaam) ?? { artikel_aantal: 0, waarde: 0 };
      leverancierWaardeMap.set(levNaam, { artikel_aantal: levExisting.artikel_aantal + 1, waarde: levExisting.waarde + artikelWaarde });

      // Per locatie — splits de waarde proportioneel over locaties
      if (regels.length === 0) continue;
      for (const regel of regels) {
        if (regel.hoeveelheid <= 0) continue;
        const regelWaarde = regel.hoeveelheid * prijs;
        const locNaam = regel.locatieId != null ? (locatieMap.get(regel.locatieId) ?? "Onbekende locatie") : "Geen locatie";
        const locExisting = locatieWaardeMap.get(locNaam) ?? { artikel_aantal: 0, waarde: 0 };
        locatieWaardeMap.set(locNaam, { artikel_aantal: locExisting.artikel_aantal + 1, waarde: locExisting.waarde + regelWaarde });
      }
    }

    const totaalRound = Math.round(totaalWaarde * 100) / 100;

    const groepNaarArray = (map: Map<string, { artikel_aantal: number; waarde: number }>) =>
      [...map.entries()]
        .map(([naam, v]) => ({
          naam,
          artikel_aantal: v.artikel_aantal,
          waarde: Math.round(v.waarde * 100) / 100,
          percentage: totaalWaarde > 0 ? Math.round((v.waarde / totaalWaarde) * 10000) / 100 : 0,
        }))
        .sort((a, b) => b.waarde - a.waarde);

    res.json({
      totaal_waarde: totaalRound,
      per_categorie: groepNaarArray(categorieMap),
      per_leverancier: groepNaarArray(leverancierWaardeMap),
      per_locatie: groepNaarArray(locatieWaardeMap),
      onbekende_prijs: onbekendePrijs.sort((a, b) => b.hoeveelheid - a.hoeveelheid),
    });
  } catch (err) {
    logger.error({ err }, "magazijn voorraadwaarde fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ═══════════════════════════════════════════════════════════
// LOCATIES
// ═══════════════════════════════════════════════════════════

router.get("/magazijn/locaties", lezen, async (req, res): Promise<void> => {
  try {
    const rijen = await db.select().from(magazijnLocatiesTable).orderBy(asc(magazijnLocatiesTable.naam));
    res.json(rijen.map(mapLocatie));
  } catch (err) {
    logger.error({ err }, "magazijn locaties fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

router.post("/magazijn/locaties", aanmaken, async (req, res): Promise<void> => {
  try {
    const body = req.body as Record<string, unknown>;
    const naam = String(body.naam ?? "").trim();
    if (!naam) { res.status(422).json({ error: "Naam is verplicht" }); return; }

    const [nieuw] = await db.insert(magazijnLocatiesTable).values({
      naam,
      type: str(body.type) ?? "rek",
      parentId: body.parent_id ? Number(body.parent_id) : null,
      omschrijving: str(body.omschrijving),
      actief: body.actief !== false,
    }).returning();

    res.status(201).json(mapLocatie(nieuw));
  } catch (err) {
    logger.error({ err }, "magazijn locatie aanmaken fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

router.get("/magazijn/locaties/:id", lezen, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const [rij] = await db.select().from(magazijnLocatiesTable).where(eq(magazijnLocatiesTable.id, id)).limit(1);
    if (!rij) { res.status(404).json({ error: "Locatie niet gevonden" }); return; }
    res.json(mapLocatie(rij));
  } catch (err) {
    logger.error({ err }, "magazijn locatie ophalen fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

router.patch("/magazijn/locaties/:id", schrijven, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const body = req.body as Record<string, unknown>;

    const updates: Record<string, unknown> = { bijgewerktOp: new Date() };
    if (typeof body.naam === "string") updates.naam = body.naam.trim();
    if (body.type !== undefined) updates.type = str(body.type) ?? "rek";
    if (body.parent_id !== undefined) updates.parentId = body.parent_id ? Number(body.parent_id) : null;
    if (body.omschrijving !== undefined) updates.omschrijving = str(body.omschrijving);
    if (body.actief !== undefined) updates.actief = Boolean(body.actief);

    const [bijgewerkt] = await db.update(magazijnLocatiesTable)
      .set(updates as Partial<typeof magazijnLocatiesTable.$inferInsert>)
      .where(eq(magazijnLocatiesTable.id, id))
      .returning();

    if (!bijgewerkt) { res.status(404).json({ error: "Locatie niet gevonden" }); return; }
    res.json(mapLocatie(bijgewerkt));
  } catch (err) {
    logger.error({ err }, "magazijn locatie bijwerken fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

router.delete("/magazijn/locaties/:id", beheer, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    await db.transaction(async (tx) => {
      // Ontkoppel artikelen die deze locatie als standaard locatie hadden
      await tx.update(artikelenTable)
        .set({ bijgewerktOp: new Date() })
        .where(sql`${artikelenTable}.locatie_id = ${id}`);
      await tx.delete(magazijnLocatiesTable).where(eq(magazijnLocatiesTable.id, id));
    });
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "magazijn locatie verwijderen fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ═══════════════════════════════════════════════════════════
// ARTIKELEN — magazijn-aanvullende velden (GET detail + PATCH)
// ═══════════════════════════════════════════════════════════

router.get("/magazijn/artikelen/:id", lezen, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const [rij] = await db.select({
      artikel: artikelenTable,
      leverancier_naam: leveranciersTable.naam,
    })
      .from(artikelenTable)
      .leftJoin(leveranciersTable, eq(artikelenTable.leverancierId, leveranciersTable.id))
      .where(eq(artikelenTable.id, id))
      .limit(1);
    if (!rij) { res.status(404).json({ error: "Artikel niet gevonden" }); return; }
    res.json(mapArtikelMagazijn(rij.artikel, rij.leverancier_naam));
  } catch (err) {
    logger.error({ err }, "magazijn artikel detail fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

router.patch("/magazijn/artikelen/:id", schrijven, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const body = req.body as Record<string, unknown>;

    const updates: Record<string, unknown> = { bijgewerktOp: new Date() };
    if (body.minimum_voorraad !== undefined) updates.minimumVoorraad = num(body.minimum_voorraad);
    if (body.gewenste_voorraad !== undefined) updates.gewensteVoorraad = num(body.gewenste_voorraad);
    if (body.barcode !== undefined) updates.barcode = str(body.barcode);
    if (body.locatie_id !== undefined) updates.locatieId = body.locatie_id ? Number(body.locatie_id) : null;
    if (body.merk !== undefined) updates.merk = str(body.merk);
    if (body.leveranciers_artikel_nr !== undefined) updates.leveranciersArtikelNr = str(body.leveranciers_artikel_nr);
    if (body.gemiddeld_inkoopprijs !== undefined) updates.gemiddeldInkoopprijs = num(body.gemiddeld_inkoopprijs);

    const [bijgewerkt] = await db.update(artikelenTable)
      .set(updates as Partial<typeof artikelenTable.$inferInsert>)
      .where(eq(artikelenTable.id, id))
      .returning();

    if (!bijgewerkt) { res.status(404).json({ error: "Artikel niet gevonden" }); return; }

    const [levNaam] = await db.select({ naam: leveranciersTable.naam }).from(leveranciersTable)
      .where(bijgewerkt.leverancierId != null ? eq(leveranciersTable.id, bijgewerkt.leverancierId) : sql`false`).limit(1);

    res.json(mapArtikelMagazijn(bijgewerkt, levNaam?.naam ?? null));
  } catch (err) {
    logger.error({ err }, "magazijn artikel bijwerken fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ═══════════════════════════════════════════════════════════
// VOORRAAD
// ═══════════════════════════════════════════════════════════

router.get("/magazijn/voorraad", lezen, async (req, res): Promise<void> => {
  try {
    const { artikel_id, locatie_id } = req.query as Record<string, string | undefined>;

    const conds = [];
    if (artikel_id) conds.push(eq(voorraadTable.artikelId, Number(artikel_id)));
    if (locatie_id) conds.push(eq(voorraadTable.locatieId, Number(locatie_id)));

    const rijen = await db.select({
      voorraad: voorraadTable,
      artikel_naam: artikelenTable.naam,
    })
      .from(voorraadTable)
      .leftJoin(artikelenTable, eq(voorraadTable.artikelId, artikelenTable.id))
      .where(conds.length > 0 ? and(...(conds as [typeof conds[0], ...typeof conds])) : undefined)
      .orderBy(asc(artikelenTable.naam));

    res.json(rijen.map(r => mapVoorraad(r.voorraad, r.artikel_naam)));
  } catch (err) {
    logger.error({ err }, "magazijn voorraad ophalen fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// Samengevoegd voorraad per artikel (over alle locaties)
router.get("/magazijn/voorraad/totaal", lezen, async (req, res): Promise<void> => {
  try {
    const rijen = await db.select({
      artikel_id: voorraadTable.artikelId,
      artikel_naam: artikelenTable.naam,
      eenheid: artikelenTable.eenheid,
      minimum_voorraad: sql<number | null>`${artikelenTable}.minimum_voorraad`,
      gewenste_voorraad: sql<number | null>`${artikelenTable}.gewenste_voorraad`,
      hoeveelheid: sql<number>`SUM(${voorraadTable.hoeveelheid})`,
      gereserveerd: sql<number>`SUM(${voorraadTable.gereserveerd})`,
      besteld: sql<number>`SUM(${voorraadTable.besteld})`,
    })
      .from(voorraadTable)
      .leftJoin(artikelenTable, eq(voorraadTable.artikelId, artikelenTable.id))
      .groupBy(
        voorraadTable.artikelId,
        artikelenTable.naam,
        artikelenTable.eenheid,
        sql`${artikelenTable}.minimum_voorraad`,
        sql`${artikelenTable}.gewenste_voorraad`,
      )
      .orderBy(asc(artikelenTable.naam));

    res.json(rijen.map(r => ({
      artikel_id: r.artikel_id,
      artikel_naam: r.artikel_naam ?? null,
      eenheid: r.eenheid ?? "st",
      minimum_voorraad: r.minimum_voorraad ?? null,
      gewenste_voorraad: r.gewenste_voorraad ?? null,
      hoeveelheid: r.hoeveelheid ?? 0,
      gereserveerd: r.gereserveerd ?? 0,
      besteld: r.besteld ?? 0,
      vrij: Math.max(0, (r.hoeveelheid ?? 0) - (r.gereserveerd ?? 0)),
      onder_minimum: r.minimum_voorraad != null && (r.hoeveelheid ?? 0) < r.minimum_voorraad,
    })));
  } catch (err) {
    logger.error({ err }, "magazijn voorraad totaal fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// POST: handmatige correctie/inkoop
router.post("/magazijn/voorraad/correctie", aanmaken, async (req, res): Promise<void> => {
  try {
    const body = req.body as Record<string, unknown>;
    const artikelId = Number(body.artikel_id);
    const delta = num(body.delta);
    if (!artikelId || delta == null) { res.status(422).json({ error: "artikel_id en delta zijn verplicht" }); return; }

    const locatieId = body.locatie_id ? Number(body.locatie_id) : null;
    const type = str(body.type) ?? "correctie";
    const userId = req.session?.userId as number | undefined;

    await bijwerkenVoorraad(db, artikelId, locatieId, delta, type, userId, null, null, str(body.omschrijving));

    res.status(201).json({ ok: true });
  } catch (err) {
    logger.error({ err }, "magazijn voorraad correctie fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ═══════════════════════════════════════════════════════════
// MUTATIES
// ═══════════════════════════════════════════════════════════

// ── AccountView export: enkelvoudig ──────────────────────────────────────────
// BELANGRIJK: dit pad moet VOOR /magazijn/mutaties staan zodat Express het eerst matcht.

router.post("/magazijn/mutaties/batch-export", beheer, async (req, res): Promise<void> => {
  try {
    const { van_datum, tot_datum } = req.body as { van_datum?: string; tot_datum?: string };
    if (!van_datum || !tot_datum) {
      res.status(400).json({ error: "van_datum en tot_datum zijn verplicht (YYYY-MM-DD)" });
      return;
    }
    const van  = new Date(`${van_datum}T00:00:00Z`);
    const tot  = new Date(`${tot_datum}T23:59:59Z`);
    if (isNaN(van.getTime()) || isNaN(tot.getTime()) || van > tot) {
      res.status(400).json({ error: "Ongeldig datumbereik" });
      return;
    }
    const { batchExportMutaties } = await import("../services/magazijn-accountview-export");
    const resultaat = await batchExportMutaties(van, tot);
    res.json(resultaat);
  } catch (err) {
    logger.error({ err }, "magazijn batch-export accountview fout");
    const msg = veiligeFoutmelding(err, "Serverfout");
    res.status(400).json({ error: msg });
  }
});

router.post("/magazijn/mutaties/:id/exporteer-accountview", beheer, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Ongeldig mutatie-id" });
      return;
    }
    const { exporteerMutatie } = await import("../services/magazijn-accountview-export");
    const resultaat = await exporteerMutatie(id);
    res.json(resultaat);
  } catch (err) {
    logger.error({ err }, "magazijn exporteer-accountview fout");
    const msg = veiligeFoutmelding(err, "Serverfout");
    const code = (err as { code?: string }).code;
    const status = code === "AL_GEEXPORTEERD" ? 409 : code === "AV_GEWEIGERD" ? 422 : msg.includes("niet gevonden") ? 404 : 400;
    res.status(status).json({ error: msg.replace(/^AL_GEEXPORTEERD: /, "") });
  }
});

router.get("/magazijn/mutaties", lezen, async (req, res): Promise<void> => {
  try {
    const { artikel_id, type, opdracht_id, limit: limitQ } = req.query as Record<string, string | undefined>;
    const maxItems = Math.min(Number(limitQ ?? 100), 500);

    const conds = [];
    if (artikel_id) conds.push(eq(voorraadMutatiesTable.artikelId, Number(artikel_id)));
    if (type) conds.push(eq(voorraadMutatiesTable.type, type));
    if (opdracht_id) conds.push(eq(voorraadMutatiesTable.opdrachtId, Number(opdracht_id)));

    const rijen = await db.select({
      mutatie: voorraadMutatiesTable,
      artikel_naam: artikelenTable.naam,
      opdracht_titel: opdrachtenTable.titel,
    })
      .from(voorraadMutatiesTable)
      .leftJoin(artikelenTable, eq(voorraadMutatiesTable.artikelId, artikelenTable.id))
      .leftJoin(opdrachtenTable, eq(voorraadMutatiesTable.opdrachtId, opdrachtenTable.id))
      .where(conds.length > 0 ? and(...(conds as [typeof conds[0], ...typeof conds])) : undefined)
      .orderBy(desc(voorraadMutatiesTable.aangemaaktOp))
      .limit(maxItems);

    res.json(rijen.map(r => mapMutatie(r.mutatie, { artikel_naam: r.artikel_naam, opdracht_titel: r.opdracht_titel })));
  } catch (err) {
    logger.error({ err }, "magazijn mutaties fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ═══════════════════════════════════════════════════════════
// RESERVERINGEN
// ═══════════════════════════════════════════════════════════

router.get("/magazijn/reserveringen", lezen, async (req, res): Promise<void> => {
  try {
    const { artikel_id, opdracht_id, status } = req.query as Record<string, string | undefined>;

    const conds = [];
    if (artikel_id) conds.push(eq(reserveringenTable.artikelId, Number(artikel_id)));
    if (opdracht_id) conds.push(eq(reserveringenTable.opdrachtId, Number(opdracht_id)));
    if (status) conds.push(eq(reserveringenTable.status, status));

    const rijen = await db.select({
      reservering: reserveringenTable,
      artikel_naam: artikelenTable.naam,
      opdracht_titel: opdrachtenTable.titel,
    })
      .from(reserveringenTable)
      .leftJoin(artikelenTable, eq(reserveringenTable.artikelId, artikelenTable.id))
      .leftJoin(opdrachtenTable, eq(reserveringenTable.opdrachtId, opdrachtenTable.id))
      .where(conds.length > 0 ? and(...(conds as [typeof conds[0], ...typeof conds])) : undefined)
      .orderBy(desc(reserveringenTable.gereserveerdOp));

    res.json(rijen.map(r => mapReservering(r.reservering, { artikel_naam: r.artikel_naam, opdracht_titel: r.opdracht_titel })));
  } catch (err) {
    logger.error({ err }, "magazijn reserveringen fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

router.post("/magazijn/reserveringen", aanmaken, async (req, res): Promise<void> => {
  try {
    const body = req.body as Record<string, unknown>;
    const artikelId = Number(body.artikel_id);
    const hoeveelheid = num(body.hoeveelheid);
    if (!artikelId || !hoeveelheid || hoeveelheid <= 0) {
      res.status(422).json({ error: "artikel_id en hoeveelheid zijn verplicht" }); return;
    }

    const userId = req.session?.userId as number | undefined;

    // Controleer vrije voorraad vóór de transactie (snelle pre-check)
    const voorraadRijen = await db.select().from(voorraadTable)
      .where(eq(voorraadTable.artikelId, artikelId));
    const totaalVrij = voorraadRijen.reduce((s, v) => s + Math.max(0, v.hoeveelheid - v.gereserveerd), 0);

    if (totaalVrij < hoeveelheid) {
      res.status(409).json({ error: `Onvoldoende vrije voorraad (${totaalVrij} beschikbaar, ${hoeveelheid} gevraagd)` }); return;
    }

    // Alle mutaties binnen één transactie voor atomiciteit
    const res_ = await db.transaction(async (tx) => {
      const [reservering] = await tx.insert(reserveringenTable).values({
        artikelId,
        opdrachtId: body.opdracht_id ? Number(body.opdracht_id) : null,
        hoeveelheid,
        status: "open",
        omschrijving: str(body.omschrijving),
        aangemaaktDoorId: userId ?? null,
      }).returning();

      // Reserveer per voorraad-rij (FIFO over locaties)
      let resterend = hoeveelheid;
      for (const v of voorraadRijen) {
        const vrij = Math.max(0, v.hoeveelheid - v.gereserveerd);
        if (vrij <= 0 || resterend <= 0) continue;
        const te = Math.min(vrij, resterend);
        await tx.update(voorraadTable)
          .set({ gereserveerd: sql`${voorraadTable.gereserveerd} + ${te}`, bijgewerktOp: new Date() })
          .where(eq(voorraadTable.id, v.id));
        await tx.insert(voorraadMutatiesTable).values({
          artikelId,
          locatieId: v.locatieId,
          type: "reservering",
          hoeveelheid: te,
          delta: 0,
          referentieType: "reservering",
          referentieId: reservering.id,
          gebruikerId: userId ?? null,
          omschrijving: str(body.omschrijving),
        });
        resterend -= te;
      }

      return reservering;
    });

    const [artikel] = await db.select({ naam: artikelenTable.naam }).from(artikelenTable).where(eq(artikelenTable.id, artikelId)).limit(1);
    res.status(201).json(mapReservering(res_, { artikel_naam: artikel?.naam ?? null }));
  } catch (err) {
    logger.error({ err }, "magazijn reservering aanmaken fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

router.patch("/magazijn/reserveringen/:id/annuleer", schrijven, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const [reservering] = await db.select().from(reserveringenTable).where(eq(reserveringenTable.id, id)).limit(1);
    if (!reservering) { res.status(404).json({ error: "Reservering niet gevonden" }); return; }
    if (reservering.status === "geannuleerd") { res.status(409).json({ error: "Al geannuleerd" }); return; }

    const userId = req.session?.userId as number | undefined;

    // Haal de oorspronkelijke reserverings-mutaties op (één per betrokken voorraad-rij)
    // zodat we exact per rij vrijgeven en niet een blind per-artikel update doen.
    const resMutaties = await db.select().from(voorraadMutatiesTable)
      .where(and(
        eq(voorraadMutatiesTable.referentieType, "reservering"),
        eq(voorraadMutatiesTable.referentieId, id),
        eq(voorraadMutatiesTable.type, "reservering"),
      ));

    const bijgewerkt = await db.transaction(async (tx) => {
      // Vrijgave per betrokken voorraad-rij
      for (const m of resMutaties) {
        const whereExpr = m.locatieId != null
          ? and(eq(voorraadTable.artikelId, reservering.artikelId), eq(voorraadTable.locatieId, m.locatieId))
          : and(eq(voorraadTable.artikelId, reservering.artikelId), sql`${voorraadTable.locatieId} IS NULL`);
        await tx.update(voorraadTable)
          .set({ gereserveerd: sql`GREATEST(0, ${voorraadTable.gereserveerd} - ${m.hoeveelheid})`, bijgewerktOp: new Date() })
          .where(whereExpr);
        await tx.insert(voorraadMutatiesTable).values({
          artikelId: reservering.artikelId,
          locatieId: m.locatieId,
          type: "vrijgave",
          hoeveelheid: m.hoeveelheid,
          delta: 0,
          referentieType: "reservering",
          referentieId: id,
          gebruikerId: userId ?? null,
          omschrijving: "Reservering geannuleerd",
        });
      }

      // Fallback: als er geen mutatie-rijen zijn (legacy/manueel), gebruik totaal
      if (resMutaties.length === 0) {
        await tx.update(voorraadTable)
          .set({ gereserveerd: sql`GREATEST(0, ${voorraadTable.gereserveerd} - ${reservering.hoeveelheid})`, bijgewerktOp: new Date() })
          .where(eq(voorraadTable.artikelId, reservering.artikelId));
      }

      const [r] = await tx.update(reserveringenTable)
        .set({ status: "geannuleerd", bijgewerktOp: new Date() })
        .where(eq(reserveringenTable.id, id))
        .returning();
      return r;
    });

    res.json(mapReservering(bijgewerkt));
  } catch (err) {
    logger.error({ err }, "magazijn reservering annuleer fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ═══════════════════════════════════════════════════════════
// UITGIFTES
// ═══════════════════════════════════════════════════════════

router.post("/magazijn/uitgiftes", aanmaken, async (req, res): Promise<void> => {
  try {
    const body = req.body as Record<string, unknown>;
    const opdrachtId = body.opdracht_id ? Number(body.opdracht_id) : null;
    const regels = (body.regels ?? []) as Array<{ artikel_id: number; hoeveelheid: number; locatie_id?: number | null; reservering_id?: number | null }>;

    if (!regels.length) { res.status(422).json({ error: "Minimaal één artikel is verplicht" }); return; }

    // Beheerders (hoofdbeheerder of magazijn niveau 4) mogen zonder opdracht uitgeven.
    // Overige gebruikers (monteurs) moeten altijd een opdracht koppelen.
    const isBeheer = req.permissies?.isHoofdbeheerder || (req.permissies?.heeftModuleRecht && req.permissies.heeftModuleRecht("magazijn", 4));
    if (!isBeheer && !opdrachtId) {
      res.status(422).json({ error: "Een opdracht is verplicht bij uitgifte", code: "OPDRACHT_VERPLICHT" }); return;
    }

    // Valideer dat de opgegeven opdracht bestaat
    if (opdrachtId) {
      const [bestaandeOpdracht] = await db.select({ id: opdrachtenTable.id })
        .from(opdrachtenTable).where(eq(opdrachtenTable.id, opdrachtId)).limit(1);
      if (!bestaandeOpdracht) {
        res.status(422).json({ error: `Opdracht ${opdrachtId} bestaat niet` }); return;
      }
    }

    const userId = req.session?.userId as number | undefined;

    // Pre-validatie: controleer per regel of er voldoende (vrije) voorraad is.
    // Bij een gekoppelde reservering telt de gereserveerde hoeveelheid mee als beschikbaar.
    for (const regel of regels) {
      const artikelId = Number(regel.artikel_id);
      const hoeveelheid = Number(regel.hoeveelheid);
      const locatieId = regel.locatie_id ? Number(regel.locatie_id) : null;

      const voorraadRijen = await db.select().from(voorraadTable)
        .where(eq(voorraadTable.artikelId, artikelId));

      if (regel.reservering_id) {
        // Uitgifte via reservering: totale hoeveelheid (incl. gereserveerd) moet volstaan
        const totaal = voorraadRijen.reduce((s, v) => s + (v.hoeveelheid ?? 0), 0);
        if (totaal < hoeveelheid) {
          res.status(422).json({
            code: "ONVOLDOENDE_VOORRAAD",
            beschikbaar: totaal,
            error: `Onvoldoende voorraad voor artikel ${artikelId}: ${totaal} aanwezig, ${hoeveelheid} gevraagd`,
          }); return;
        }
      } else {
        // Directe uitgifte: alleen vrije voorraad op de gevraagde locatie
        const beschikbaar = locatieId != null
          ? voorraadRijen.filter(v => v.locatieId === locatieId).reduce((s, v) => s + Math.max(0, v.hoeveelheid - v.gereserveerd), 0)
          : voorraadRijen.reduce((s, v) => s + Math.max(0, v.hoeveelheid - v.gereserveerd), 0);
        if (beschikbaar < hoeveelheid) {
          res.status(422).json({
            code: "ONVOLDOENDE_VOORRAAD",
            beschikbaar,
            error: `Onvoldoende vrije voorraad voor artikel ${artikelId}: ${beschikbaar} vrij, ${hoeveelheid} gevraagd`,
          }); return;
        }
      }
    }

    // Voer alle mutaties atomisch uit
    await db.transaction(async (tx) => {
      for (const regel of regels) {
        const artikelId = Number(regel.artikel_id);
        const hoeveelheid = Number(regel.hoeveelheid);
        const locatieId = regel.locatie_id ? Number(regel.locatie_id) : null;
        const kostenrubriek = await bepaalKostenrubriek(tx, artikelId, opdrachtId ?? null);

        if (regel.reservering_id) {
          const resId = Number(regel.reservering_id);

          // Haal de originele reserverings-mutaties op voor per-rij vrijgave
          const resMutaties = await tx.select().from(voorraadMutatiesTable)
            .where(and(
              eq(voorraadMutatiesTable.referentieType, "reservering"),
              eq(voorraadMutatiesTable.referentieId, resId),
              eq(voorraadMutatiesTable.type, "reservering"),
            ));

          let resterendUitgifte = hoeveelheid;

          if (resMutaties.length > 0) {
            for (const m of resMutaties) {
              if (resterendUitgifte <= 0) break;
              const teNemen = Math.min(m.hoeveelheid, resterendUitgifte);
              const whereExpr = m.locatieId != null
                ? and(eq(voorraadTable.artikelId, artikelId), eq(voorraadTable.locatieId, m.locatieId))
                : and(eq(voorraadTable.artikelId, artikelId), sql`${voorraadTable.locatieId} IS NULL`);

              // Verlaag hoeveelheid én gereserveerd samen op de juiste rij
              await tx.update(voorraadTable)
                .set({
                  hoeveelheid: sql`GREATEST(0, ${voorraadTable.hoeveelheid} - ${teNemen})`,
                  gereserveerd: sql`GREATEST(0, ${voorraadTable.gereserveerd} - ${teNemen})`,
                  bijgewerktOp: new Date(),
                })
                .where(whereExpr);

              await tx.insert(voorraadMutatiesTable).values({
                artikelId,
                locatieId: m.locatieId,
                type: "uitgifte",
                hoeveelheid: teNemen,
                delta: -teNemen,
                referentieType: opdrachtId ? "opdracht" : "reservering",
                referentieId: opdrachtId ?? resId,
                opdrachtId: opdrachtId ?? null,
                gebruikerId: userId ?? null,
                omschrijving: str(body.omschrijving),
                kostenrubriek,
              });
              resterendUitgifte -= teNemen;
            }

            // Valideer dat alles geleverd kon worden; anders transactie terugdraaien
            if (resterendUitgifte > 0) {
              throw new Error(
                `Uitgifte onvolledig: ${hoeveelheid - resterendUitgifte} van ${hoeveelheid} leverbaar voor artikel ${artikelId}`,
              );
            }
          } else {
            // Fallback: geen mutatie-rijen beschikbaar (legacy) → neem via bijwerkenVoorraad
            await bijwerkenVoorraad(tx, artikelId, locatieId, -hoeveelheid, "uitgifte", userId,
              opdrachtId ? "opdracht" : "reservering", opdrachtId ?? resId, str(body.omschrijving), opdrachtId, kostenrubriek);
            await tx.update(voorraadTable)
              .set({ gereserveerd: sql`GREATEST(0, ${voorraadTable.gereserveerd} - ${hoeveelheid})`, bijgewerktOp: new Date() })
              .where(eq(voorraadTable.artikelId, artikelId));
          }

          // Markeer reservering als volledig NADAT alle mutaties geslaagd zijn
          const uitgegevenHoeveelheid = hoeveelheid - resterendUitgifte;
          const nieuweStatus = uitgegevenHoeveelheid >= hoeveelheid ? "volledig" : "gedeeltelijk";
          await tx.update(reserveringenTable)
            .set({ status: nieuweStatus, bijgewerktOp: new Date() })
            .where(eq(reserveringenTable.id, resId));
        } else {
          // Directe uitgifte zonder reservering
          await bijwerkenVoorraad(tx, artikelId, locatieId, -hoeveelheid, "uitgifte", userId,
            opdrachtId ? "opdracht" : null, opdrachtId, str(body.omschrijving), opdrachtId, kostenrubriek);
        }
      }
    });

    res.status(201).json({ ok: true, opdracht_id: opdrachtId, regels: regels.map(r => ({ artikel_id: r.artikel_id, hoeveelheid: r.hoeveelheid })) });
  } catch (err) {
    logger.error({ err }, "magazijn uitgifte fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ═══════════════════════════════════════════════════════════
// RETOUREN
// ═══════════════════════════════════════════════════════════

router.post("/magazijn/retouren", aanmaken, async (req, res): Promise<void> => {
  try {
    const body = req.body as Record<string, unknown>;
    const opdrachtId = body.opdracht_id ? Number(body.opdracht_id) : null;
    const regels = (body.regels ?? []) as Array<{ artikel_id: number; hoeveelheid: number; locatie_id?: number | null; conditie: "goed" | "defect" | "afval" }>;

    if (!regels.length) { res.status(422).json({ error: "Minimaal één artikel is verplicht" }); return; }

    const userId = req.session?.userId as number | undefined;

    await db.transaction(async (tx) => {
      for (const regel of regels) {
        const artikelId = Number(regel.artikel_id);
        const hoeveelheid = Number(regel.hoeveelheid);
        const locatieId = regel.locatie_id ? Number(regel.locatie_id) : null;
        const conditie = regel.conditie ?? "goed";

        // BOUW_01 §6: retour zonder opdracht van toebehoren krijgt dezelfde
        // kostenrubriek als de uitgifte, zodat het verbruiksoverzicht saldeert.
        const kostenrubriek = await bepaalKostenrubriek(tx, artikelId, opdrachtId);

        if (conditie === "goed") {
          // Goede retour: voorraad omhoog
          await bijwerkenVoorraad(tx, artikelId, locatieId, hoeveelheid, "retour", userId,
            opdrachtId ? "opdracht" : null, opdrachtId,
            `Retour (${conditie}) van ${opdrachtId ? `opdracht ${opdrachtId}` : "onbekend"}`,
            opdrachtId, kostenrubriek);
        } else {
          // Defect/afval: enkel loggen (geen voorraadwijziging)
          await tx.insert(voorraadMutatiesTable).values({
            artikelId,
            locatieId,
            type: "retour",
            hoeveelheid,
            delta: 0,
            referentieType: opdrachtId ? "opdracht" : null,
            referentieId: opdrachtId,
            gebruikerId: userId ?? null,
            omschrijving: `Retour (${conditie}) — niet teruggeplaatst`,
            kostenrubriek,
          });
        }
      }
    });

    res.status(201).json({ ok: true, opdracht_id: opdrachtId });
  } catch (err) {
    logger.error({ err }, "magazijn retour fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── VERPLAATSINGEN ──────────────────────────────────────────────────────────
router.post("/magazijn/verplaatsingen", aanmaken, async (req, res): Promise<void> => {
  try {
    const body = req.body as {
      artikel_id: number;
      hoeveelheid: number;
      van_locatie_id?: number | null;
      naar_locatie_id: number;
      omschrijving?: string;
    };
    const artikelId = Number(body.artikel_id);
    const hoeveelheid = Number(body.hoeveelheid);
    const vanLocatieId = body.van_locatie_id ? Number(body.van_locatie_id) : null;
    const naarLocatieId = Number(body.naar_locatie_id);
    const userId = req.session.userId ?? null;

    if (!artikelId || !hoeveelheid || hoeveelheid <= 0 || !naarLocatieId) {
      return void res.status(400).json({ error: "Ongeldige invoer: artikel_id, hoeveelheid (>0) en naar_locatie_id zijn verplicht" });
    }

    if (vanLocatieId === naarLocatieId) {
      return void res.status(400).json({ error: "Van- en naar-locatie zijn gelijk" });
    }

    const omschrijving = String(body.omschrijving ?? "Verplaatsing");

    await db.transaction(async (tx) => {
      // Afname van-locatie
      const voorraadVan = vanLocatieId != null
        ? await tx.select().from(voorraadTable)
            .where(and(eq(voorraadTable.artikelId, artikelId), eq(voorraadTable.locatieId, vanLocatieId)))
        : await tx.select().from(voorraadTable)
            .where(and(eq(voorraadTable.artikelId, artikelId), sql`${voorraadTable.locatieId} IS NULL`));

      const beschikbaar = voorraadVan.reduce((s, v) => s + Math.max(0, v.hoeveelheid - v.gereserveerd), 0);
      if (beschikbaar < hoeveelheid) {
        throw new Error(`Onvoldoende vrije voorraad op de bronlocatie (beschikbaar: ${beschikbaar})`);
      }

      // Afname van bronlocatie
      if (vanLocatieId != null) {
        const rij = voorraadVan[0];
        if (rij) {
          const nieuweHoeveelheid = rij.hoeveelheid - hoeveelheid;
          await tx.update(voorraadTable).set({ hoeveelheid: nieuweHoeveelheid, bijgewerktOp: new Date() })
            .where(eq(voorraadTable.id, rij.id));
        }
      } else {
        const rij = voorraadVan[0];
        if (rij) {
          const nieuweHoeveelheid = rij.hoeveelheid - hoeveelheid;
          await tx.update(voorraadTable).set({ hoeveelheid: nieuweHoeveelheid, bijgewerktOp: new Date() })
            .where(eq(voorraadTable.id, rij.id));
        }
      }

      // Mutatie van-locatie
      await tx.insert(voorraadMutatiesTable).values({
        artikelId,
        locatieId: vanLocatieId,
        type: "verplaatsing",
        hoeveelheid: 0,
        delta: -hoeveelheid,
        referentieType: null,
        referentieId: null,
        gebruikerId: userId,
        omschrijving,
        aangemaaktOp: new Date(),
      });

      // Toevoeging naar-locatie
      const voorraadNaar = await tx.select().from(voorraadTable)
        .where(and(eq(voorraadTable.artikelId, artikelId), eq(voorraadTable.locatieId, naarLocatieId)));

      if (voorraadNaar.length > 0) {
        await tx.update(voorraadTable).set({
          hoeveelheid: voorraadNaar[0].hoeveelheid + hoeveelheid,
          bijgewerktOp: new Date(),
        }).where(eq(voorraadTable.id, voorraadNaar[0].id));
      } else {
        await tx.insert(voorraadTable).values({
          artikelId,
          locatieId: naarLocatieId,
          hoeveelheid,
          gereserveerd: 0,
          besteld: 0,
          bijgewerktOp: new Date(),
        });
      }

      // Mutatie naar-locatie
      await tx.insert(voorraadMutatiesTable).values({
        artikelId,
        locatieId: naarLocatieId,
        type: "verplaatsing",
        hoeveelheid: 0,
        delta: hoeveelheid,
        referentieType: null,
        referentieId: null,
        gebruikerId: userId,
        omschrijving,
        aangemaaktOp: new Date(),
      });
    });

    return void res.status(201).json({ ok: true });
  } catch (err: unknown) {
    logger.error({ err }, "magazijn verplaatsing fout");
    const msg = veiligeFoutmelding(err, "Serverfout");
    return void res.status(400).json({ error: msg });
  }
});

// ── BESTELBONNEN ──────────────────────────────────────────────────────────────
router.post("/magazijn/bestelbonnen", aanmaken, async (req, res): Promise<void> => {
  try {
    const body = req.body as {
      leverancier_id?: number | null;
      notities?: string;
      verstuur_email?: boolean;
      regels: Array<{ artikel_id: number; hoeveelheid: number }>;
    };
    const regels = body.regels ?? [];
    const userId = req.session.userId ?? null;

    const artikelIds = [...new Set(regels.map(r => Number(r.artikel_id)))];
    const artikelen = artikelIds.length > 0
      ? await db.select().from(artikelenTable).where(sql`${artikelenTable.id} = ANY(ARRAY[${sql.join(artikelIds.map(id => sql`${id}`), sql`, `)}]::int[])`)
      : [];

    let leverancier: { id: number; naam: string; email: string | null } | null = null;
    if (body.leverancier_id) {
      const [lev] = await db.select({
        id: leveranciersTable.id,
        naam: leveranciersTable.naam,
        email: leveranciersTable.email,
      }).from(leveranciersTable).where(eq(leveranciersTable.id, body.leverancier_id));
      leverancier = lev ?? null;
    }

    // ── Document Studio: actieve huisstijlkleur voor 'bestelbon' ─────────────
    // Werkgever wordt server-side afgeleid via de sessiegebruiker (medewerker →
    // werkgever), zodat een aanroeper nooit een andere werkgever kan injecteren.
    // Zonder goedgekeurd model valt de mail terug op DDS_KLEUR.
    const DDS_KLEUR = "#F23B0D";
    let accentKleur = DDS_KLEUR;
    let werkgeverNaam: string | null = null;
    if (userId) {
      const [medewerkerRij] = await db
        .select({ werkgeverId: medewerkersTable.werkgeverId })
        .from(medewerkersTable)
        .where(eq(medewerkersTable.gebruikerId, userId))
        .limit(1);
      const werkgeverId = medewerkerRij?.werkgeverId ?? null;
      if (werkgeverId) {
        const [studioRij] = await db
          .select({ connectTemplateJson: documentStudioModellenTable.connectTemplateJson })
          .from(documentStudioModellenTable)
          .where(and(
            eq(documentStudioModellenTable.werkgeverId, werkgeverId),
            eq(documentStudioModellenTable.documentType, "bestelbon"),
            eq(documentStudioModellenTable.status, "goedgekeurd"),
          ))
          .limit(1);
        if (studioRij?.connectTemplateJson) {
          try {
            const tmpl = JSON.parse(studioRij.connectTemplateJson) as { kleurschema?: { primair?: string } };
            accentKleur = tmpl.kleurschema?.primair ?? DDS_KLEUR;
          } catch { /* gebruik DDS_KLEUR */ }
        }
        const [wgRij] = await db
          .select({ naam: werkgeversTable.naam })
          .from(werkgeversTable)
          .where(eq(werkgeversTable.id, werkgeverId))
          .limit(1);
        werkgeverNaam = wgRij?.naam ?? null;
      }
    }
    const afzenderNaam = werkgeverNaam ?? "FPS Brandpreventie";
    // ─────────────────────────────────────────────────────────────────────────

    const datumStr = new Date().toLocaleDateString("nl-NL", { day: "2-digit", month: "long", year: "numeric" });

    // Werkgever bepalen voor huisstijl: via sessiegebruiker → medewerker → werkgever; fallback = eerste actieve werkgever
    const werkgeverVelden = {
      naam: werkgeversTable.naam,
      logoUrl: werkgeversTable.logoUrl,
      primaireKleur: werkgeversTable.primaireKleur,
      kvk: werkgeversTable.kvk,
      btw: werkgeversTable.btw,
      iban: werkgeversTable.iban,
      adres: werkgeversTable.adres,
      postcode: werkgeversTable.postcode,
      plaats: werkgeversTable.plaats,
      telefoon: werkgeversTable.telefoon,
      email: werkgeversTable.email,
    } as const;
    type WerkgeverBranding = { naam: string; logoUrl: string | null; primaireKleur: string | null; kvk: string | null; btw: string | null; iban: string | null; adres: string | null; postcode: string | null; plaats: string | null; telefoon: string | null; email: string | null };
    let werkgever: WerkgeverBranding | null = null;
    if (userId) {
      const [med] = await db.select({ werkgeverId: medewerkersTable.werkgeverId })
        .from(medewerkersTable).where(eq(medewerkersTable.gebruikerId, userId)).limit(1);
      if (med?.werkgeverId) {
        const [wg] = await db.select(werkgeverVelden).from(werkgeversTable)
          .where(eq(werkgeversTable.id, med.werkgeverId)).limit(1);
        werkgever = wg ?? null;
      }
    }
    if (!werkgever) {
      const [wg] = await db.select(werkgeverVelden).from(werkgeversTable)
        .where(eq(werkgeversTable.actief, true)).orderBy(asc(werkgeversTable.id)).limit(1);
      werkgever = wg ?? null;
    }
    const wgNaam = werkgever?.naam ?? "FPS Brandpreventie";
    const wgKleur = werkgever?.primaireKleur ?? "#F23B0D";

    if (body.verstuur_email) {
      const naarEmail = leverancier?.email ?? process.env.MAIL_FROM ?? null;
      if (!naarEmail) {
        return void res.status(400).json({ error: "Geen e-mailadres beschikbaar voor de leverancier" });
      }

      const regelsHtml = regels.map(r => {
        const art = artikelen.find(a => a.id === Number(r.artikel_id));
        return `<tr>
          <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb">${escapeHtml(art?.naam ?? `Artikel ${r.artikel_id}`)}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;color:#6b7280">${escapeHtml(art?.code ?? "—")}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600">${r.hoeveelheid}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb">${escapeHtml(art?.eenheid ?? "")}</td>
        </tr>`;
      }).join("");

      // Voettekst met bedrijfsgegevens uit werkgever
      const voettekstDelen: string[] = [];
      if (werkgever?.kvk) voettekstDelen.push(`KVK: ${escapeHtml(werkgever.kvk)}`);
      if (werkgever?.btw) voettekstDelen.push(`BTW: ${escapeHtml(werkgever.btw)}`);
      if (werkgever?.iban) voettekstDelen.push(`IBAN: ${escapeHtml(werkgever.iban)}`);
      const adresRegel = [werkgever?.adres, werkgever?.postcode, werkgever?.plaats].filter(Boolean).map(s => escapeHtml(s!)).join(", ");
      const contactRegel = [werkgever?.telefoon, werkgever?.email].filter(Boolean).map(s => escapeHtml(s!)).join(" · ");

      const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:${escapeHtml(wgKleur)};padding:20px 24px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:16px">
            ${werkgever?.logoUrl ? `<img src="${escapeHtml(werkgever.logoUrl)}" alt="${escapeHtml(wgNaam)}" style="height:36px;width:auto;object-fit:contain;vertical-align:middle" />` : ""}
            <h1 style="color:#fff;margin:0;font-size:20px">Bestelbon ${escapeHtml(wgNaam)}</h1>
          </div>
          <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
            <p style="color:#374151;margin:0 0 16px"><strong>Datum:</strong> ${datumStr}</p>
            ${leverancier ? `<p style="color:#374151;margin:0 0 16px"><strong>Leverancier:</strong> ${escapeHtml(leverancier.naam)}</p>` : ""}
            <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
              <thead>
                <tr style="background:#f9fafb">
                  <th style="padding:8px 10px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase">Artikel</th>
                  <th style="padding:8px 10px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase">Code</th>
                  <th style="padding:8px 10px;text-align:right;font-size:12px;color:#6b7280;text-transform:uppercase">Aantal</th>
                  <th style="padding:8px 10px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase">Eenheid</th>
                </tr>
              </thead>
              <tbody>${regelsHtml}</tbody>
            </table>
            ${body.notities ? `<p style="color:#374151;background:#f9fafb;padding:12px;border-radius:6px"><strong>Opmerkingen:</strong> ${escapeHtml(body.notities)}</p>` : ""}
          </div>
          ${(voettekstDelen.length > 0 || adresRegel || contactRegel) ? `
          <div style="padding:16px 24px;border-top:1px solid #e5e7eb;margin-top:0;font-size:11px;color:#9ca3af;text-align:center">
            <strong>${escapeHtml(wgNaam)}</strong>
            ${adresRegel ? `<br/>${adresRegel}` : ""}
            ${contactRegel ? `<br/>${contactRegel}` : ""}
            ${voettekstDelen.length > 0 ? `<br/>${voettekstDelen.join(" · ")}` : ""}
          </div>` : ""}
        </div>`;

      await verstuurMail({
        naarEmail,
        naarNaam: leverancier?.naam ?? undefined,
        onderwerp: `Bestelbon ${wgNaam} — ${datumStr}`,
        html,
        soort: "magazijn_bestelbon",
        verstuurdDoorId: userId,
        direct: true, // medewerker verstuurt de bestelbon zelf expliciet
      });

      return void res.json({ email_verstuurd: true, bericht: `Bestelbon verstuurd naar ${naarEmail}` });
    }

    return void res.json({ email_verstuurd: false, bericht: "Bestelbon aangemaakt (geen e-mail verstuurd)" });
  } catch (err: unknown) {
    logger.error({ err }, "magazijn bestelbon fout");
    if (err instanceof MailFout) {
      return void res.status(503).json({ error: "E-mail kon niet worden verstuurd. Controleer de mailconfiguratie." });
    }
    return void res.status(500).json({ error: "Fout bij verwerken bestelbon" });
  }
});

// ═══════════════════════════════════════════════════════════
// Stellingscans — AI-gestuurde voorraadcontrole via foto
// ═══════════════════════════════════════════════════════════

type StellingsscanSuggestie = {
  artikel_id: number;
  code: string | null;
  naam: string;
  eenheid: string | null;
  huidige_voorraad: number | null;
  minimum_voorraad: number | null;
  advies_hoeveelheid: number;
  reden: string;
  prioriteit: string;
};

function mapStellingsscan(row: typeof magazijnStellingscansTable.$inferSelect) {
  return {
    id: row.id,
    scan_type: row.scanType,
    foto_pad: row.fotoPad,
    locatie_id: row.locatieId,
    status: row.status,
    aangemaakt_op: row.aangemaaktOp?.toISOString() ?? new Date().toISOString(),
    goedgekeurd_op: row.goedgekeurdOp?.toISOString() ?? null,
    retour_project_id: row.retourProjectId ?? null,
    retour_omschrijving: row.retourOmschrijving ?? null,
    ai_suggesties: (row.aiSuggesties as StellingsscanSuggestie[]) ?? [],
  };
}

// Upload-URL ophalen voor stellingfoto
router.post("/magazijn/stellingscans/upload-url", schrijven, async (_req, res) => {
  try {
    const storage = new ObjectStorageService();
    const { uploadURL, objectPath } = await storage.getObjectEntityUploadURL(null, "algemeen");
    return void res.json({ upload_url: uploadURL, object_path: objectPath });
  } catch (err) {
    logger.error({ err }, "magazijn stellingsscan upload-url fout");
    return void res.status(500).json({ error: "Kon upload-URL niet genereren" });
  }
});

// Stellingfoto registreren + synchrone AI-analyse
router.post("/magazijn/stellingscans", schrijven, async (req, res): Promise<void> => {
  try {
    const {
      foto_pad,
      locatie_id,
      scan_type,
      retour_project_id,
      retour_omschrijving,
    } = req.body as {
      foto_pad?: string;
      locatie_id?: number;
      scan_type?: string;
      retour_project_id?: number;
      retour_omschrijving?: string;
    };
    if (!foto_pad) return void res.status(400).json({ error: "foto_pad is verplicht" });

    const isRetour = scan_type === "retour";
    const userId = (req.session as { userId?: number }).userId ?? null;

    // Scan aanmaken met status "analyseren"
    const [scan] = await db
      .insert(magazijnStellingscansTable)
      .values({
        scanType: isRetour ? "retour" : "voorraadcontrole",
        fotoPad: foto_pad,
        locatieId: locatie_id ?? null,
        aangemaaaktDoorId: userId,
        status: "analyseren",
        retourProjectId: retour_project_id ?? null,
        retourOmschrijving: retour_omschrijving ?? null,
      })
      .returning();

    // Artikelcatalogus met huidige voorraad ophalen
    const artikelen = await db
      .select({
        id: artikelenTable.id,
        code: artikelenTable.code,
        naam: artikelenTable.naam,
        eenheid: artikelenTable.eenheid,
        minimumVoorraad: artikelenTable.minimumVoorraad,
      })
      .from(artikelenTable)
      .orderBy(asc(artikelenTable.naam));

    const voorraadRijen = await db
      .select({
        artikelId: voorraadTable.artikelId,
        totaal: sql<number>`SUM(${voorraadTable.hoeveelheid})`.mapWith(Number),
      })
      .from(voorraadTable)
      .groupBy(voorraadTable.artikelId);

    const voorraadMap = new Map(voorraadRijen.map((v) => [v.artikelId, v.totaal]));

    // AI Vision analyse (optioneel — vereist OpenAI)
    let aiSuggesties: StellingsscanSuggestie[] = [];

    if (heeftGateway()) {
      try {
        const storage = new ObjectStorageService();
        const storageFile = await storage.getObjectEntityFile(foto_pad);
        const resp = await storage.downloadObject(storageFile);
        const buffer = Buffer.from(await resp.arrayBuffer());

        const sharp = (await import("sharp")).default;
        const fotoBase64 = (
          await sharp(buffer)
            .resize({ width: 1024, withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toBuffer()
        ).toString("base64");

        const artikelContext = artikelen
          .slice(0, 200)
          .map((a) => {
            const huidig = voorraadMap.get(a.id) ?? 0;
            return `${a.code ?? a.id} | ${a.naam} | ${a.eenheid ?? "st"} | huidig: ${huidig}`;
          })
          .join("\n");

        let systemPrompt: string;
        let userText: string;

        if (isRetour) {
          // Locaties ophalen voor retour-plaatsadvies
          const locaties = await db
            .select({ id: magazijnLocatiesTable.id, naam: magazijnLocatiesTable.naam, type: magazijnLocatiesTable.type })
            .from(magazijnLocatiesTable)
            .where(eq(magazijnLocatiesTable.actief, true))
            .orderBy(asc(magazijnLocatiesTable.naam));

          const locatieContext = locaties
            .map((l) => `${l.id} | ${l.naam} | ${l.type}`)
            .join("\n");

          systemPrompt = MAGAZIJN_RETOUR_SCAN_BASE_PROMPT.tekst
            .replace("{ARTIKEL_CONTEXT}", artikelContext)
            .replace("{LOCATIE_CONTEXT}", locatieContext);
          userText = "Analyseer deze foto van geretourneerde artikelen en stel per artikel een opberglocatie voor in het magazijn.";
        } else {
          systemPrompt = MAGAZIJN_STELLING_SCAN_BASE_PROMPT.tekst
            .replace("{ARTIKEL_CONTEXT}", artikelContext);
          userText = "Analyseer deze stellingfoto en geef besteladviezen voor artikelen die bijbesteld moeten worden.";
        }

        const magazijnScanPrompt = isRetour
          ? MAGAZIJN_RETOUR_SCAN_BASE_PROMPT
          : MAGAZIJN_STELLING_SCAN_BASE_PROMPT;
        const magazijnChatResultaat = await aiGateway.chat("default", {
          max_tokens: 3000,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                { type: "text", text: userText },
                { type: "image_url", image_url: { url: `data:image/jpeg;base64,${fotoBase64}`, detail: "high" } },
              ],
            },
          ],
        }, undefined, {
          module: "magazijn",
          functie: isRetour ? "retourScanAnalyse" : "stellingScanAnalyse",
          gebruikerId: req.session.userId ?? null,
          promptNaam: magazijnScanPrompt.naam,
          promptVersie: magazijnScanPrompt.versie,
        });

        const rawText = magazijnChatResultaat.ok ? magazijnChatResultaat.inhoud : "{}";
        try {
          const parsed = JSON.parse(rawText) as { suggesties?: unknown };
          if (Array.isArray(parsed.suggesties)) {
            aiSuggesties = parsed.suggesties as StellingsscanSuggestie[];
          }
        } catch {
          // parse fout — lege suggesties bewaren
        }
      } catch (err) {
        logger.warn({ err }, "magazijn stellingsscan AI-analyse fout");
      }
    }

    // Scan bijwerken met resultaten
    const [updated] = await db
      .update(magazijnStellingscansTable)
      .set({ status: "gereed", aiSuggesties })
      .where(eq(magazijnStellingscansTable.id, scan.id))
      .returning();

    return void res.status(201).json(mapStellingsscan(updated));
  } catch (err) {
    logger.error({ err }, "magazijn stellingsscan aanmaken fout");
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

// Lijst van stellingscans (meest recent eerst)
router.get("/magazijn/stellingscans", lezen, async (_req, res) => {
  try {
    const rijen = await db
      .select()
      .from(magazijnStellingscansTable)
      .orderBy(desc(magazijnStellingscansTable.aangemaaktOp));
    return void res.json(rijen.map(mapStellingsscan));
  } catch (err) {
    logger.error({ err }, "magazijn stellingscans ophalen fout");
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

// Enkele stellingsscan ophalen
router.get("/magazijn/stellingscans/:id", lezen, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const [row] = await db
      .select()
      .from(magazijnStellingscansTable)
      .where(eq(magazijnStellingscansTable.id, id));
    if (!row) return void res.status(404).json({ error: "Scan niet gevonden" });
    return void res.json(mapStellingsscan(row));
  } catch (err) {
    logger.error({ err }, "magazijn stellingsscan ophalen fout");
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

// Goedkeuren: voorraad bijwerken + log mutaties + markeer goedgekeurd
// - voorraadcontrole: update voorraad.besteld (bestelvoorstel)
// - retour: update voorraad.hoeveelheid op de aanbevolen locatie (retour)
router.post("/magazijn/stellingscans/:id/goedkeuren", schrijven, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const userId = (req.session as { userId?: number }).userId ?? null;

    const [scan] = await db
      .select()
      .from(magazijnStellingscansTable)
      .where(eq(magazijnStellingscansTable.id, id));
    if (!scan) return void res.status(404).json({ error: "Scan niet gevonden" });
    if (scan.status === "goedgekeurd") {
      return void res.status(409).json({ error: "Scan is al goedgekeurd" });
    }

    const { artikelen } = req.body as {
      artikelen: Array<{ artikel_id: number; hoeveelheid: number; locatie_id?: number }>;
    };
    if (!Array.isArray(artikelen) || artikelen.length === 0) {
      return void res.status(400).json({ error: "Geen artikelen opgegeven" });
    }

    const isRetour = scan.scanType === "retour";

    for (const item of artikelen) {
      if (!item.artikel_id || item.hoeveelheid <= 0) continue;

      if (isRetour) {
        // Retour: hoeveelheid toevoegen aan voorraad op de aanbevolen locatie
        const doelLocatieId = item.locatie_id ?? null;

        const [bestaand] = doelLocatieId
          ? await db.select().from(voorraadTable)
              .where(and(eq(voorraadTable.artikelId, item.artikel_id), eq(voorraadTable.locatieId, doelLocatieId)))
              .limit(1)
          : await db.select().from(voorraadTable)
              .where(eq(voorraadTable.artikelId, item.artikel_id))
              .limit(1);

        if (bestaand) {
          await db
            .update(voorraadTable)
            .set({
              hoeveelheid: sql`${voorraadTable.hoeveelheid} + ${item.hoeveelheid}`,
              bijgewerktOp: new Date(),
            })
            .where(eq(voorraadTable.id, bestaand.id));
          await db.insert(voorraadMutatiesTable).values({
            artikelId: item.artikel_id,
            locatieId: bestaand.locatieId ?? null,
            type: "retour",
            hoeveelheid: item.hoeveelheid,
            delta: item.hoeveelheid,
            omschrijving: `Retourscan #${id} goedgekeurd${scan.retourProjectId ? ` — project #${scan.retourProjectId}` : ""}`,
            gebruikerId: userId,
          });
        } else {
          // Geen bestaand voorraadrecord op die locatie — aanmaken
          await db.insert(voorraadTable).values({
            artikelId: item.artikel_id,
            locatieId: doelLocatieId,
            hoeveelheid: item.hoeveelheid,
            gereserveerd: 0,
            besteld: 0,
          });
          await db.insert(voorraadMutatiesTable).values({
            artikelId: item.artikel_id,
            locatieId: doelLocatieId,
            type: "retour",
            hoeveelheid: item.hoeveelheid,
            delta: item.hoeveelheid,
            omschrijving: `Retourscan #${id} goedgekeurd${scan.retourProjectId ? ` — project #${scan.retourProjectId}` : ""}`,
            gebruikerId: userId,
          });
        }
      } else {
        // Voorraadcontrole: besteld ophogen (bestelvoorstel)
        const [bestaand] = await db
          .select()
          .from(voorraadTable)
          .where(eq(voorraadTable.artikelId, item.artikel_id))
          .limit(1);

        if (bestaand) {
          await db
            .update(voorraadTable)
            .set({ besteld: sql`${voorraadTable.besteld} + ${item.hoeveelheid}` })
            .where(eq(voorraadTable.id, bestaand.id));
          await db.insert(voorraadMutatiesTable).values({
            artikelId: item.artikel_id,
            locatieId: bestaand.locatieId ?? null,
            type: "bestelvoorstel",
            hoeveelheid: item.hoeveelheid,
            delta: item.hoeveelheid,
            omschrijving: `Stellingsscan #${id} goedgekeurd`,
            gebruikerId: userId,
          });
        } else {
          await db.insert(voorraadTable).values({
            artikelId: item.artikel_id,
            hoeveelheid: 0,
            gereserveerd: 0,
            besteld: item.hoeveelheid,
          });
          await db.insert(voorraadMutatiesTable).values({
            artikelId: item.artikel_id,
            locatieId: null,
            type: "bestelvoorstel",
            hoeveelheid: item.hoeveelheid,
            delta: item.hoeveelheid,
            omschrijving: `Stellingsscan #${id} goedgekeurd`,
            gebruikerId: userId,
          });
        }
      }
    }

    const [updated] = await db
      .update(magazijnStellingscansTable)
      .set({ status: "goedgekeurd", goedgekeurdOp: new Date(), goedgekeurdDoorId: userId })
      .where(eq(magazijnStellingscansTable.id, id))
      .returning();

    return void res.json(mapStellingsscan(updated));
  } catch (err) {
    logger.error({ err }, "magazijn stellingsscan goedkeuren fout");
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Inkooporders ───────────────────────────────────────────────────────────────

function mapInkooporderRegel(r: typeof magazijnInkooporderRegelsTable.$inferSelect & {
  artikel_naam?: string | null;
  artikel_eenheid?: string | null;
  artikel_code?: string | null;
}) {
  return {
    id: r.id,
    artikel_id: r.artikelId,
    artikel_naam: r.artikel_naam ?? null,
    artikel_eenheid: r.artikel_eenheid ?? null,
    artikel_code: r.artikel_code ?? null,
    gevraagd_hoeveelheid: r.gevraagdHoeveelheid,
    ontvangen_hoeveelheid: r.ontvangenHoeveelheid,
    eenheidsprijs: r.eenheidsprijs ?? null,
    btw_percentage: r.btwPercentage,
    omschrijving: r.omschrijving ?? null,
    aangemaakt_op: iso(r.aangemaaktOp)!,
  };
}

function mapInkooporder(r: typeof magazijnInkoopordersTable.$inferSelect & {
  aangemaakt_door_naam?: string | null;
  totaal_regels?: number;
  kenmerk_berekend?: string | null;
}) {
  return {
    id: r.id,
    nummer: r.nummer ?? null,
    // NUMMER_01: I-nummer uit de gedeelde reeks + kenmerk G002/I089[a]
    inkoopnummer: r.inkoopnummer,
    gebouw_id: r.gebouwId ?? null,
    herziening: r.herziening,
    kenmerk: r.kenmerk_berekend ?? null,
    status: r.status,
    leverancier_id: r.leverancierId ?? null,
    leverancier_naam: r.leverancierNaam ?? null,
    leverancier_email: r.leverancierEmail ?? null,
    verwachte_leverdatum: iso(r.verwachteLeverdatum),
    werkelijke_leverdatum: iso(r.werkelijkeLeverdatum),
    notities: r.notities ?? null,
    referentie: r.referentie ?? null,
    aangemaakt_door_id: r.aangemaaktDoorId ?? null,
    aangemaakt_door_naam: r.aangemaakt_door_naam ?? null,
    aangemaakt_op: iso(r.aangemaaktOp)!,
    bijgewerkt_op: iso(r.bijgewerktOp)!,
    verstuurd_op: iso(r.verstuurdOp),
    bevestigd_op: iso(r.bevestigdOp),
    ontvangen_op: iso(r.ontvangenOp),
    totaal_regels: r.totaal_regels ?? 0,
  };
}

async function genereerInkooporderNummer(): Promise<string> {
  const jaar = new Date().getFullYear();
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(magazijnInkoopordersTable);
  const volgnr = String((row?.count ?? 0) + 1).padStart(4, "0");
  return `INK-${jaar}-${volgnr}`;
}

// Inkooporders lezen = magazijn niveau 2 (APP_01, besluit n.a.v. review):
// orders horen bij "magazijn op een hoger niveau", niet bij elke scan-gebruiker.
const inkooporderLezen = requireBevoegdheid("magazijn", 2);

// GET /magazijn/inkooporders
router.get("/magazijn/inkooporders", inkooporderLezen, async (req, res) => {
  try {
    const { status, leverancier_id } = req.query;
    const conditions = [];
    if (status) conditions.push(eq(magazijnInkoopordersTable.status, String(status)));
    if (leverancier_id) conditions.push(eq(magazijnInkoopordersTable.leverancierId, Number(leverancier_id)));

    const rows = await db
      .select({
        order: magazijnInkoopordersTable,
        aangemaakt_door_naam: gebruikersTable.naam,
        totaal_regels: sql<number>`count(${magazijnInkooporderRegelsTable.id})`,
      })
      .from(magazijnInkoopordersTable)
      .leftJoin(gebruikersTable, eq(magazijnInkoopordersTable.aangemaaktDoorId, gebruikersTable.id))
      .leftJoin(magazijnInkooporderRegelsTable, eq(magazijnInkooporderRegelsTable.inkooporderId, magazijnInkoopordersTable.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(magazijnInkoopordersTable.id, gebruikersTable.naam)
      .orderBy(desc(magazijnInkoopordersTable.aangemaaktOp));

    // Geen N+1: alle voorraadorders delen het magazijn-gebouw; kenmerk per uniek
    // gebouw één keer opvragen en daarna in geheugen samenstellen.
    const gebouwIds = [...new Set(rows.map((r) => r.order.gebouwId).filter((g): g is number => g != null))];
    const gDelen = new Map<number, string>();
    for (const gid of gebouwIds) {
      // kenmerkVoorVoorraadinkoop = "<Gdeel>/<Ideel>"; haal het G-deel via een dummy-I op
      const basis = await kenmerkVoorVoorraadinkoop(gid, 0, 0);
      const gdeel = basis.includes("/") ? basis.split("/")[0] : "";
      if (gdeel) gDelen.set(gid, gdeel);
    }
    return void res.json(rows.map((r) => {
      const ideel = formatNummer("I", r.order.inkoopnummer) + herzieningsLetter(r.order.herziening);
      const gdeel = r.order.gebouwId != null ? gDelen.get(r.order.gebouwId) : undefined;
      return mapInkooporder({
        ...r.order,
        aangemaakt_door_naam: r.aangemaakt_door_naam,
        totaal_regels: Number(r.totaal_regels),
        kenmerk_berekend: gdeel ? `${gdeel}/${ideel}` : ideel,
      });
    }));
  } catch (err) {
    logger.error({ err }, "lijst inkooporders ophalen fout");
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /magazijn/inkooporders
router.post("/magazijn/inkooporders", aanmaken, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const { leverancier_id, verwachte_leverdatum, notities, referentie, regels } = req.body as {
      leverancier_id?: number | null;
      verwachte_leverdatum?: string | null;
      notities?: string | null;
      referentie?: string | null;
      regels?: Array<{ artikel_id: number; gevraagd_hoeveelheid: number; eenheidsprijs?: number | null; btw_percentage?: number; omschrijving?: string | null }>;
    };

    let leverancierNaam: string | null = null;
    let leverancierEmail: string | null = null;
    if (leverancier_id) {
      const [lev] = await db.select().from(leveranciersTable).where(eq(leveranciersTable.id, leverancier_id)).limit(1);
      if (lev) { leverancierNaam = lev.naam; leverancierEmail = str(lev.email); }
    }

    const nummer = await genereerInkooporderNummer();

    // NUMMER_01 besluit 10: voorraadinkoop hangt aan het magazijn-gebouw
    // (magazijn_instellingen.magazijn_gebouw_id) → kenmerk G002/I089.
    const [instellingen] = await db.select().from(magazijnInstellingenTable).limit(1);

    const [order] = await db.insert(magazijnInkoopordersTable).values({
      nummer,
      gebouwId: instellingen?.magazijnGebouwId ?? null,
      status: "concept",
      leverancierId: leverancier_id ?? null,
      leverancierNaam,
      leverancierEmail,
      verwachteLeverdatum: verwachte_leverdatum ? new Date(verwachte_leverdatum) : null,
      notities: str(notities),
      referentie: str(referentie),
      aangemaaktDoorId: userId,
    }).returning();

    if (regels && regels.length > 0) {
      await db.insert(magazijnInkooporderRegelsTable).values(
        regels.map((r) => ({
          inkooporderId: order.id,
          artikelId: r.artikel_id,
          gevraagdHoeveelheid: r.gevraagd_hoeveelheid,
          eenheidsprijs: r.eenheidsprijs ?? null,
          btwPercentage: r.btw_percentage ?? 21,
          omschrijving: str(r.omschrijving),
        }))
      );
    }

    return void res.status(201).json(mapInkooporder({
      ...order,
      totaal_regels: regels?.length ?? 0,
      kenmerk_berekend: await kenmerkVoorVoorraadinkoop(order.gebouwId, order.inkoopnummer, order.herziening),
    }));
  } catch (err) {
    logger.error({ err }, "inkooporder aanmaken fout");
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /magazijn/inkooporders/:id
router.get("/magazijn/inkooporders/:id", inkooporderLezen, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [order] = await db
      .select({
        order: magazijnInkoopordersTable,
        aangemaakt_door_naam: gebruikersTable.naam,
      })
      .from(magazijnInkoopordersTable)
      .leftJoin(gebruikersTable, eq(magazijnInkoopordersTable.aangemaaktDoorId, gebruikersTable.id))
      .where(eq(magazijnInkoopordersTable.id, id))
      .limit(1);

    if (!order) return void res.status(404).json({ error: "Niet gevonden" });

    const regels = await db
      .select({
        regel: magazijnInkooporderRegelsTable,
        artikel_naam: artikelenTable.naam,
        artikel_eenheid: artikelenTable.eenheid,
        artikel_code: artikelenTable.code,
      })
      .from(magazijnInkooporderRegelsTable)
      .leftJoin(artikelenTable, eq(magazijnInkooporderRegelsTable.artikelId, artikelenTable.id))
      .where(eq(magazijnInkooporderRegelsTable.inkooporderId, id))
      .orderBy(asc(magazijnInkooporderRegelsTable.id));

    return void res.json({
      ...mapInkooporder({
        ...order.order,
        aangemaakt_door_naam: order.aangemaakt_door_naam,
        totaal_regels: regels.length,
        kenmerk_berekend: await kenmerkVoorVoorraadinkoop(order.order.gebouwId, order.order.inkoopnummer, order.order.herziening),
      }),
      regels: regels.map((r) => mapInkooporderRegel({
        ...r.regel,
        artikel_naam: r.artikel_naam,
        artikel_eenheid: r.artikel_eenheid,
        artikel_code: r.artikel_code,
      })),
    });
  } catch (err) {
    logger.error({ err }, "inkooporder detail ophalen fout");
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

// PATCH /magazijn/inkooporders/:id
router.patch("/magazijn/inkooporders/:id", schrijven, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { leverancier_id, verwachte_leverdatum, notities, referentie, regels } = req.body as {
      leverancier_id?: number | null;
      verwachte_leverdatum?: string | null;
      notities?: string | null;
      referentie?: string | null;
      regels?: Array<{ artikel_id: number; gevraagd_hoeveelheid: number; eenheidsprijs?: number | null; btw_percentage?: number; omschrijving?: string | null }>;
    };

    // Transactioneel met row-lock: parallel wijzigen van een verstuurde order
    // mag nooit dezelfde herzieningsletter dubbel uitgeven of dezelfde versie
    // twee keer snapshotten.
    const uitkomst = await db.transaction(async (tx) => {
      const [bestaand] = await tx.select().from(magazijnInkoopordersTable).where(eq(magazijnInkoopordersTable.id, id)).for("update");
      if (!bestaand) return { fout: 404 as const };
      // NUMMER_01 §4.5: een al verstuurde order wijzigen mag, maar wordt een
      // herziening met letter (I089 → I089a); de oude versie wordt eerst bevroren.
      const isHerziening = bestaand.status !== "concept";
      if (isHerziening && !bestaand.verstuurdOp) return { fout: 409 as const };
      if (isHerziening) {
        const oudeRegels = await tx.select().from(magazijnInkooporderRegelsTable).where(eq(magazijnInkooporderRegelsTable.inkooporderId, id));
        await tx.insert(inkoopVersiesTable).values({
          bronTabel: "magazijn_inkooporders",
          bronId: id,
          herziening: bestaand.herziening,
          kenmerk: await kenmerkVoorVoorraadinkoop(bestaand.gebouwId, bestaand.inkoopnummer, bestaand.herziening),
          snapshot: { order: bestaand, regels: oudeRegels },
          aangemaaktDoorId: req.session.userId ?? null,
        }).onConflictDoNothing();
      }

      let leverancierNaam = bestaand.leverancierNaam;
      let leverancierEmail = bestaand.leverancierEmail;
      if (leverancier_id !== undefined) {
        if (leverancier_id) {
          const [lev] = await tx.select().from(leveranciersTable).where(eq(leveranciersTable.id, leverancier_id)).limit(1);
          if (lev) { leverancierNaam = lev.naam; leverancierEmail = str(lev.email); }
        } else {
          leverancierNaam = null; leverancierEmail = null;
        }
      }

      const [updated] = await tx
        .update(magazijnInkoopordersTable)
        .set({
          leverancierId: leverancier_id !== undefined ? (leverancier_id ?? null) : bestaand.leverancierId,
          leverancierNaam,
          leverancierEmail,
          verwachteLeverdatum: verwachte_leverdatum !== undefined ? (verwachte_leverdatum ? new Date(verwachte_leverdatum) : null) : bestaand.verwachteLeverdatum,
          notities: notities !== undefined ? str(notities) : bestaand.notities,
          referentie: referentie !== undefined ? str(referentie) : bestaand.referentie,
          ...(isHerziening ? { herziening: bestaand.herziening + 1 } : {}),
          bijgewerktOp: new Date(),
        })
        .where(eq(magazijnInkoopordersTable.id, id))
        .returning();

      if (regels !== undefined) {
        await tx.delete(magazijnInkooporderRegelsTable).where(eq(magazijnInkooporderRegelsTable.inkooporderId, id));
        if (regels.length > 0) {
          await tx.insert(magazijnInkooporderRegelsTable).values(
            regels.map((r) => ({
              inkooporderId: id,
              artikelId: r.artikel_id,
              gevraagdHoeveelheid: r.gevraagd_hoeveelheid,
              eenheidsprijs: r.eenheidsprijs ?? null,
              btwPercentage: r.btw_percentage ?? 21,
              omschrijving: str(r.omschrijving),
            }))
          );
        }
      }
      return { updated };
    });
    if ("fout" in uitkomst) {
      if (uitkomst.fout === 404) return void res.status(404).json({ error: "Niet gevonden" });
      return void res.status(409).json({ error: "Alleen concept- of verstuurde orders kunnen worden bijgewerkt" });
    }
    const { updated } = uitkomst;

    const totaalRegels = await db.select({ count: sql<number>`count(*)` }).from(magazijnInkooporderRegelsTable).where(eq(magazijnInkooporderRegelsTable.inkooporderId, id));
    return void res.json(mapInkooporder({
      ...updated,
      totaal_regels: Number(totaalRegels[0]?.count ?? 0),
      kenmerk_berekend: await kenmerkVoorVoorraadinkoop(updated.gebouwId, updated.inkoopnummer, updated.herziening),
    }));
  } catch (err) {
    logger.error({ err }, "inkooporder bijwerken fout");
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

// DELETE /magazijn/inkooporders/:id
router.delete("/magazijn/inkooporders/:id", beheer, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [order] = await db.select().from(magazijnInkoopordersTable).where(eq(magazijnInkoopordersTable.id, id)).limit(1);
    if (!order) return void res.status(404).json({ error: "Niet gevonden" });
    if (order.status !== "concept") return void res.status(409).json({ error: "Alleen concept-orders kunnen worden verwijderd" });
    await db.delete(magazijnInkoopordersTable).where(eq(magazijnInkoopordersTable.id, id));
    return void res.status(204).send();
  } catch (err) {
    logger.error({ err }, "inkooporder verwijderen fout");
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /magazijn/inkooporders/:id/verstuur
router.post("/magazijn/inkooporders/:id/verstuur", schrijven, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [order] = await db.select().from(magazijnInkoopordersTable).where(eq(magazijnInkoopordersTable.id, id)).limit(1);
    if (!order) return void res.status(404).json({ error: "Niet gevonden" });
    if (order.status !== "concept") return void res.status(409).json({ error: "Inkooporder is niet meer in concept-status" });
    if (!order.leverancierEmail) return void res.status(422).json({ error: "Geen e-mailadres bekend voor deze leverancier" });

    const regels = await db
      .select({ regel: magazijnInkooporderRegelsTable, artikel_naam: artikelenTable.naam, artikel_eenheid: artikelenTable.eenheid })
      .from(magazijnInkooporderRegelsTable)
      .leftJoin(artikelenTable, eq(magazijnInkooporderRegelsTable.artikelId, artikelenTable.id))
      .where(eq(magazijnInkooporderRegelsTable.inkooporderId, id));

    if (regels.length === 0) return void res.status(422).json({ error: "Inkooporder bevat geen regels" });

    // Werkgever bepalen voor huisstijl: gebouw → werkgever; fallback = sessiegebruiker → medewerker → werkgever; fallback = eerste actieve werkgever
    const io_werkgeverVelden = {
      naam: werkgeversTable.naam,
      logoUrl: werkgeversTable.logoUrl,
      primaireKleur: werkgeversTable.primaireKleur,
      kvk: werkgeversTable.kvk,
      btw: werkgeversTable.btw,
      iban: werkgeversTable.iban,
      adres: werkgeversTable.adres,
      postcode: werkgeversTable.postcode,
      plaats: werkgeversTable.plaats,
      telefoon: werkgeversTable.telefoon,
      email: werkgeversTable.email,
    } as const;
    type IoWerkgeverBranding = { naam: string; logoUrl: string | null; primaireKleur: string | null; kvk: string | null; btw: string | null; iban: string | null; adres: string | null; postcode: string | null; plaats: string | null; telefoon: string | null; email: string | null };
    let ioWerkgever: IoWerkgeverBranding | null = null;
    if (order.gebouwId) {
      const [wg] = await db.select(io_werkgeverVelden).from(werkgeversTable)
        .innerJoin(gebouwenTable, eq(gebouwenTable.werkgeverId, werkgeversTable.id))
        .where(eq(gebouwenTable.id, order.gebouwId)).limit(1);
      ioWerkgever = wg ?? null;
    }
    if (!ioWerkgever) {
      const verstuurdDoor = req.session.userId ?? null;
      if (verstuurdDoor) {
        const [med] = await db.select({ werkgeverId: medewerkersTable.werkgeverId })
          .from(medewerkersTable).where(eq(medewerkersTable.gebruikerId, verstuurdDoor)).limit(1);
        if (med?.werkgeverId) {
          const [wg] = await db.select(io_werkgeverVelden).from(werkgeversTable)
            .where(eq(werkgeversTable.id, med.werkgeverId)).limit(1);
          ioWerkgever = wg ?? null;
        }
      }
    }
    if (!ioWerkgever) {
      const [wg] = await db.select(io_werkgeverVelden).from(werkgeversTable)
        .where(eq(werkgeversTable.actief, true)).orderBy(asc(werkgeversTable.id)).limit(1);
      ioWerkgever = wg ?? null;
    }
    const ioWgNaam = ioWerkgever?.naam ?? "FPS Brandpreventie";
    const ioWgKleur = ioWerkgever?.primaireKleur ?? "#F23B0D";

    const regelsHtml = regels.map((r) =>
      `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb">${escapeHtml(r.artikel_naam ?? `Artikel #${r.regel.artikelId}`)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:right">${r.regel.gevraagdHoeveelheid} ${escapeHtml(r.artikel_eenheid ?? "")}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:right">${r.regel.eenheidsprijs != null ? `€ ${Number(r.regel.eenheidsprijs).toFixed(2)}` : "—"}</td>
      </tr>`
    ).join("");

    // Voettekst met bedrijfsgegevens
    const ioVoettekstDelen: string[] = [];
    if (ioWerkgever?.kvk) ioVoettekstDelen.push(`KVK: ${escapeHtml(ioWerkgever.kvk)}`);
    if (ioWerkgever?.btw) ioVoettekstDelen.push(`BTW: ${escapeHtml(ioWerkgever.btw)}`);
    if (ioWerkgever?.iban) ioVoettekstDelen.push(`IBAN: ${escapeHtml(ioWerkgever.iban)}`);
    const ioAdresRegel = [ioWerkgever?.adres, ioWerkgever?.postcode, ioWerkgever?.plaats].filter(Boolean).map(s => escapeHtml(s!)).join(", ");
    const ioContactRegel = [ioWerkgever?.telefoon, ioWerkgever?.email].filter(Boolean).map(s => escapeHtml(s!)).join(" · ");

    await verstuurMail({
      naarEmail: order.leverancierEmail!,
      naarNaam: order.leverancierNaam ?? undefined,
      onderwerp: `Inkooporder ${order.nummer} — ${ioWgNaam}`,
      soort: "magazijn_bestelbon",
      direct: true, // medewerker verstuurt de inkooporder zelf expliciet
      html: `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto">
  <div style="background:${escapeHtml(ioWgKleur)};padding:20px 24px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:16px">
    ${ioWerkgever?.logoUrl ? `<img src="${escapeHtml(ioWerkgever.logoUrl)}" alt="${escapeHtml(ioWgNaam)}" style="height:36px;width:auto;object-fit:contain;vertical-align:middle" />` : ""}
    <h1 style="color:#fff;margin:0;font-size:20px">Inkooporder ${escapeHtml(order.nummer ?? "")}</h1>
  </div>
  <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
    <p style="color:#374151;margin:0 0 12px">Geachte ${order.leverancierNaam ? escapeHtml(order.leverancierNaam) : "leverancier"},</p>
    <p style="color:#374151;margin:0 0 16px">Hierbij ontvangt u onze inkooporder. Wij verzoeken u vriendelijk de onderstaande materialen te leveren.</p>
    ${order.verwachteLeverdatum ? `<p style="color:#374151;margin:0 0 12px"><strong>Gewenste leverdatum:</strong> ${new Date(order.verwachteLeverdatum).toLocaleDateString("nl-NL")}</p>` : ""}
    ${order.notities ? `<p style="color:#374151;background:#f9fafb;padding:12px;border-radius:6px;margin:0 0 16px"><strong>Notities:</strong> ${escapeHtml(order.notities)}</p>` : ""}
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <thead>
        <tr style="background:#f9fafb">
          <th style="padding:8px 10px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase">Artikel</th>
          <th style="padding:8px 10px;text-align:right;font-size:12px;color:#6b7280;text-transform:uppercase">Hoeveelheid</th>
          <th style="padding:8px 10px;text-align:right;font-size:12px;color:#6b7280;text-transform:uppercase">Prijs/eenheid</th>
        </tr>
      </thead>
      <tbody>${regelsHtml}</tbody>
    </table>
    <p style="color:#374151;margin:0">Met vriendelijke groet,<br/><strong>${escapeHtml(ioWgNaam)}</strong></p>
  </div>
  ${(ioVoettekstDelen.length > 0 || ioAdresRegel || ioContactRegel) ? `
  <div style="padding:16px 24px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center">
    <strong>${escapeHtml(ioWgNaam)}</strong>
    ${ioAdresRegel ? `<br/>${ioAdresRegel}` : ""}
    ${ioContactRegel ? `<br/>${ioContactRegel}` : ""}
    ${ioVoettekstDelen.length > 0 ? `<br/>${ioVoettekstDelen.join(" · ")}` : ""}
  </div>` : ""}
</div>`,
    });

    const [updated] = await db
      .update(magazijnInkoopordersTable)
      .set({ status: "verstuurd", verstuurdOp: new Date(), bijgewerktOp: new Date() })
      .where(eq(magazijnInkoopordersTable.id, id))
      .returning();

    return void res.json(mapInkooporder({ ...updated, totaal_regels: regels.length }));
  } catch (err) {
    if (err instanceof MailFout) return void res.status(502).json({ error: "E-mail kon niet worden verstuurd" });
    logger.error({ err }, "inkooporder versturen fout");
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /magazijn/inkooporders/:id/ontvang
router.post("/magazijn/inkooporders/:id/ontvang", schrijven, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const userId = req.session.userId!;
    const [order] = await db.select().from(magazijnInkoopordersTable).where(eq(magazijnInkoopordersTable.id, id)).limit(1);
    if (!order) return void res.status(404).json({ error: "Niet gevonden" });
    if (["volledig_ontvangen", "geannuleerd"].includes(order.status)) {
      return void res.status(409).json({ error: "Deze inkooporder kan niet meer worden ontvangen" });
    }

    const { werkelijke_leverdatum, regels } = req.body as {
      werkelijke_leverdatum?: string | null;
      regels: Array<{ regel_id: number; ontvangen_hoeveelheid: number; locatie_id?: number | null }>;
    };

    if (!regels || regels.length === 0) return void res.status(422).json({ error: "Geen ontvangstregels opgegeven" });

    await db.transaction(async (tx) => {
      for (const inkomend of regels) {
        const [bestaandeRegel] = await tx
          .select()
          .from(magazijnInkooporderRegelsTable)
          .where(and(eq(magazijnInkooporderRegelsTable.id, inkomend.regel_id), eq(magazijnInkooporderRegelsTable.inkooporderId, id)))
          .limit(1);

        if (!bestaandeRegel) continue;
        const nieuwOntvangen = bestaandeRegel.ontvangenHoeveelheid + inkomend.ontvangen_hoeveelheid;

        await tx.update(magazijnInkooporderRegelsTable)
          .set({ ontvangenHoeveelheid: nieuwOntvangen })
          .where(eq(magazijnInkooporderRegelsTable.id, inkomend.regel_id));

        if (inkomend.ontvangen_hoeveelheid > 0) {
          const locatieId = inkomend.locatie_id ?? null;
          const [bestaandVoorraad] = await tx
            .select()
            .from(voorraadTable)
            .where(and(eq(voorraadTable.artikelId, bestaandeRegel.artikelId), locatieId ? eq(voorraadTable.locatieId, locatieId) : sql`locatie_id IS NULL`))
            .limit(1);

          if (bestaandVoorraad) {
            await tx.update(voorraadTable)
              .set({
                hoeveelheid: sql`${voorraadTable.hoeveelheid} + ${inkomend.ontvangen_hoeveelheid}`,
                besteld: sql`GREATEST(0, ${voorraadTable.besteld} - ${inkomend.ontvangen_hoeveelheid})`,
                bijgewerktOp: new Date(),
              })
              .where(eq(voorraadTable.id, bestaandVoorraad.id));
          } else {
            await tx.insert(voorraadTable).values({
              artikelId: bestaandeRegel.artikelId,
              locatieId,
              hoeveelheid: inkomend.ontvangen_hoeveelheid,
              gereserveerd: 0,
              besteld: 0,
            });
          }

          await tx.insert(voorraadMutatiesTable).values({
            artikelId: bestaandeRegel.artikelId,
            locatieId,
            type: "inkoop",
            hoeveelheid: inkomend.ontvangen_hoeveelheid,
            delta: inkomend.ontvangen_hoeveelheid,
            referentieType: "inkooporder",
            referentieId: id,
            gebruikerId: userId,
            omschrijving: `Inkooporder ${order.nummer} ontvangen`,
          });
        }
      }

      const alleRegels = await tx
        .select()
        .from(magazijnInkooporderRegelsTable)
        .where(eq(magazijnInkooporderRegelsTable.inkooporderId, id));

      const volledigOntvangen = alleRegels.every((r) => r.ontvangenHoeveelheid >= r.gevraagdHoeveelheid);
      const deelsOntvangen = alleRegels.some((r) => r.ontvangenHoeveelheid > 0);
      const nieuweStatus = volledigOntvangen ? "volledig_ontvangen" : deelsOntvangen ? "gedeeltelijk_ontvangen" : "verstuurd";

      await tx.update(magazijnInkoopordersTable)
        .set({
          status: nieuweStatus,
          werkelijkeLeverdatum: werkelijke_leverdatum ? new Date(werkelijke_leverdatum) : null,
          ontvangenOp: volledigOntvangen ? new Date() : order.ontvangenOp,
          bijgewerktOp: new Date(),
        })
        .where(eq(magazijnInkoopordersTable.id, id));
    });

    const [final] = await db
      .select({ order: magazijnInkoopordersTable, totaal_regels: sql<number>`count(${magazijnInkooporderRegelsTable.id})` })
      .from(magazijnInkoopordersTable)
      .leftJoin(magazijnInkooporderRegelsTable, eq(magazijnInkooporderRegelsTable.inkooporderId, magazijnInkoopordersTable.id))
      .where(eq(magazijnInkoopordersTable.id, id))
      .groupBy(magazijnInkoopordersTable.id);

    return void res.json(mapInkooporder({ ...final.order, totaal_regels: Number(final.totaal_regels) }));
  } catch (err) {
    logger.error({ err }, "inkooporder ontvangen fout");
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Picklijsten ─────────────────────────────────────────────────────────────────

function mapPicklijstRegel(r: typeof magazijnPicklijstRegelsTable.$inferSelect & {
  artikel_naam?: string | null;
  artikel_eenheid?: string | null;
  artikel_code?: string | null;
  locatie_naam?: string | null;
  vrije_voorraad?: number | null;
}) {
  return {
    id: r.id,
    artikel_id: r.artikelId,
    artikel_naam: r.artikel_naam ?? null,
    artikel_eenheid: r.artikel_eenheid ?? null,
    artikel_code: r.artikel_code ?? null,
    locatie_id: r.locatieId ?? null,
    locatie_naam: r.locatie_naam ?? null,
    gevraagd_hoeveelheid: r.gevraagdHoeveelheid,
    gepickt_hoeveelheid: r.gepicktHoeveelheid,
    vrije_voorraad: r.vrije_voorraad ?? null,
    status: r.status,
    aangemaakt_op: iso(r.aangemaaktOp)!,
  };
}

function mapPicklijst(r: typeof magazijnPicklijstenTable.$inferSelect & {
  aangemaakt_door_naam?: string | null;
  totaal_regels?: number;
  gepickt_regels?: number;
}) {
  return {
    id: r.id,
    opdracht_id: r.opdrachtId ?? null,
    opdracht_titel: r.opdrachtTitel ?? null,
    status: r.status,
    geplande_uitgifte_op: iso(r.geplandeUitgifteOp),
    notities: r.notities ?? null,
    aangemaakt_door_id: r.aangemaaktDoorId ?? null,
    aangemaakt_door_naam: r.aangemaakt_door_naam ?? null,
    aangemaakt_op: iso(r.aangemaaktOp)!,
    bijgewerkt_op: iso(r.bijgewerktOp)!,
    verwerkt_op: iso(r.verwerktOp),
    totaal_regels: r.totaal_regels ?? 0,
    gepickt_regels: r.gepickt_regels ?? 0,
  };
}

// GET /magazijn/picklijsten
router.get("/picklijsten", lezen, async (req, res) => {
  try {
    const { status, opdracht_id, mijn_opdrachten } = req.query;
    const conditions = [];
    if (status) conditions.push(eq(magazijnPicklijstenTable.status, String(status)));
    if (opdracht_id) conditions.push(eq(magazijnPicklijstenTable.opdrachtId, Number(opdracht_id)));

    if (mijn_opdrachten === "true" || mijn_opdrachten === "1") {
      const userId = req.session.userId!;
      const [medewerker] = await db
        .select({ id: medewerkersTable.id })
        .from(medewerkersTable)
        .where(eq(medewerkersTable.gebruikerId, userId))
        .limit(1);

      // Opdrachten waaraan de ingelogde gebruiker via planning is toegewezen.
      const opdrachtRijen = medewerker
        ? await db
            .selectDistinct({ opdrachtId: planningItemsTable.opdrachtId })
            .from(planningItemsTable)
            .where(
              and(
                eq(planningItemsTable.medewerkerId, medewerker.id),
                isNotNull(planningItemsTable.opdrachtId),
              ),
            )
        : [];

      const opdrachtIds = opdrachtRijen
        .map((r) => r.opdrachtId)
        .filter((id): id is number => id != null);

      if (opdrachtIds.length === 0) {
        // Geen toegewezen opdrachten → geen picklijsten binnen de monteur-scope.
        return void res.json([]);
      }
      conditions.push(inArray(magazijnPicklijstenTable.opdrachtId, opdrachtIds));
    }

    const rows = await db
      .select({
        pick: magazijnPicklijstenTable,
        aangemaakt_door_naam: gebruikersTable.naam,
        totaal_regels: sql<number>`count(${magazijnPicklijstRegelsTable.id})`,
        gepickt_regels: sql<number>`count(case when ${magazijnPicklijstRegelsTable.status} = 'gepickt' then 1 end)`,
      })
      .from(magazijnPicklijstenTable)
      .leftJoin(gebruikersTable, eq(magazijnPicklijstenTable.aangemaaktDoorId, gebruikersTable.id))
      .leftJoin(magazijnPicklijstRegelsTable, eq(magazijnPicklijstRegelsTable.picklijstId, magazijnPicklijstenTable.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(magazijnPicklijstenTable.id, gebruikersTable.naam)
      .orderBy(desc(magazijnPicklijstenTable.aangemaaktOp));

    return void res.json(rows.map((r) => mapPicklijst({
      ...r.pick,
      aangemaakt_door_naam: r.aangemaakt_door_naam,
      totaal_regels: Number(r.totaal_regels),
      gepickt_regels: Number(r.gepickt_regels),
    })));
  } catch (err) {
    logger.error({ err }, "lijst picklijsten ophalen fout");
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /magazijn/picklijsten
router.post("/picklijsten", aanmaken, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const { opdracht_id, geplande_uitgifte_op, notities, regels } = req.body as {
      opdracht_id?: number | null;
      geplande_uitgifte_op?: string | null;
      notities?: string | null;
      regels?: Array<{ artikel_id: number; gevraagd_hoeveelheid: number; locatie_id?: number | null }>;
    };

    let opdrachtTitel: string | null = null;
    if (opdracht_id) {
      const [odr] = await db.select({ titel: opdrachtenTable.titel }).from(opdrachtenTable).where(eq(opdrachtenTable.id, opdracht_id)).limit(1);
      if (odr) opdrachtTitel = str(odr.titel);
    }

    const [pick] = await db.insert(magazijnPicklijstenTable).values({
      opdrachtId: opdracht_id ?? null,
      opdrachtTitel,
      status: "concept",
      geplandeUitgifteOp: geplande_uitgifte_op ? new Date(geplande_uitgifte_op) : null,
      notities: str(notities),
      aangemaaktDoorId: userId,
    }).returning();

    if (regels && regels.length > 0) {
      const regelValues = await Promise.all(regels.map(async (r) => {
        const [v] = await db.select({ hoeveelheid: voorraadTable.hoeveelheid, gereserveerd: voorraadTable.gereserveerd })
          .from(voorraadTable)
          .where(eq(voorraadTable.artikelId, r.artikel_id))
          .limit(1);
        return {
          picklijstId: pick.id,
          artikelId: r.artikel_id,
          locatieId: r.locatie_id ?? null,
          gevraagdHoeveelheid: r.gevraagd_hoeveelheid,
          gepicktHoeveelheid: 0,
          status: "open" as const,
        };
      }));
      await db.insert(magazijnPicklijstRegelsTable).values(regelValues);
    }

    const detail = await db
      .select({
        pick: magazijnPicklijstenTable,
        aangemaakt_door_naam: gebruikersTable.naam,
        totaal_regels: sql<number>`count(${magazijnPicklijstRegelsTable.id})`,
        gepickt_regels: sql<number>`count(case when ${magazijnPicklijstRegelsTable.status} = 'gepickt' then 1 end)`,
      })
      .from(magazijnPicklijstenTable)
      .leftJoin(gebruikersTable, eq(magazijnPicklijstenTable.aangemaaktDoorId, gebruikersTable.id))
      .leftJoin(magazijnPicklijstRegelsTable, eq(magazijnPicklijstRegelsTable.picklijstId, magazijnPicklijstenTable.id))
      .where(eq(magazijnPicklijstenTable.id, pick.id))
      .groupBy(magazijnPicklijstenTable.id, gebruikersTable.naam);

    if (detail.length === 0) return void res.status(500).json({ error: "Interne serverfout" });
    const d = detail[0];
    return void res.status(201).json({
      ...mapPicklijst({ ...d.pick, aangemaakt_door_naam: d.aangemaakt_door_naam, totaal_regels: Number(d.totaal_regels), gepickt_regels: Number(d.gepickt_regels) }),
      regels: [],
    });
  } catch (err) {
    logger.error({ err }, "picklijst aanmaken fout");
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /magazijn/picklijsten/:id
router.get("/picklijsten/:id", lezen, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [detail] = await db
      .select({
        pick: magazijnPicklijstenTable,
        aangemaakt_door_naam: gebruikersTable.naam,
        totaal_regels: sql<number>`count(${magazijnPicklijstRegelsTable.id})`,
        gepickt_regels: sql<number>`count(case when ${magazijnPicklijstRegelsTable.status} = 'gepickt' then 1 end)`,
      })
      .from(magazijnPicklijstenTable)
      .leftJoin(gebruikersTable, eq(magazijnPicklijstenTable.aangemaaktDoorId, gebruikersTable.id))
      .leftJoin(magazijnPicklijstRegelsTable, eq(magazijnPicklijstRegelsTable.picklijstId, magazijnPicklijstenTable.id))
      .where(eq(magazijnPicklijstenTable.id, id))
      .groupBy(magazijnPicklijstenTable.id, gebruikersTable.naam);

    if (!detail) return void res.status(404).json({ error: "Niet gevonden" });

    const regels = await db
      .select({
        regel: magazijnPicklijstRegelsTable,
        artikel_naam: artikelenTable.naam,
        artikel_eenheid: artikelenTable.eenheid,
        artikel_code: artikelenTable.code,
        locatie_naam: magazijnLocatiesTable.naam,
        vrije_voorraad: sql<number>`coalesce(sum(${voorraadTable.hoeveelheid} - ${voorraadTable.gereserveerd}), null)`,
      })
      .from(magazijnPicklijstRegelsTable)
      .leftJoin(artikelenTable, eq(magazijnPicklijstRegelsTable.artikelId, artikelenTable.id))
      .leftJoin(magazijnLocatiesTable, eq(magazijnPicklijstRegelsTable.locatieId, magazijnLocatiesTable.id))
      .leftJoin(voorraadTable, eq(voorraadTable.artikelId, magazijnPicklijstRegelsTable.artikelId))
      .where(eq(magazijnPicklijstRegelsTable.picklijstId, id))
      .groupBy(magazijnPicklijstRegelsTable.id, artikelenTable.naam, artikelenTable.eenheid, artikelenTable.code, magazijnLocatiesTable.naam)
      .orderBy(asc(magazijnPicklijstRegelsTable.id));

    return void res.json({
      ...mapPicklijst({ ...detail.pick, aangemaakt_door_naam: detail.aangemaakt_door_naam, totaal_regels: Number(detail.totaal_regels), gepickt_regels: Number(detail.gepickt_regels) }),
      regels: regels.map((r) => mapPicklijstRegel({
        ...r.regel,
        artikel_naam: r.artikel_naam,
        artikel_eenheid: r.artikel_eenheid,
        artikel_code: r.artikel_code,
        locatie_naam: r.locatie_naam,
        vrije_voorraad: r.vrije_voorraad != null ? Number(r.vrije_voorraad) : null,
      })),
    });
  } catch (err) {
    logger.error({ err }, "picklijst detail ophalen fout");
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

// PATCH /magazijn/picklijsten/:id
router.patch("/picklijsten/:id", schrijven, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [bestaand] = await db.select().from(magazijnPicklijstenTable).where(eq(magazijnPicklijstenTable.id, id)).limit(1);
    if (!bestaand) return void res.status(404).json({ error: "Niet gevonden" });
    if (["voltooid", "geannuleerd"].includes(bestaand.status)) return void res.status(409).json({ error: "Gesloten picklijst kan niet worden bijgewerkt" });

    const { geplande_uitgifte_op, notities, regels } = req.body as {
      geplande_uitgifte_op?: string | null;
      notities?: string | null;
      regels?: Array<{ artikel_id: number; gevraagd_hoeveelheid: number; locatie_id?: number | null }>;
    };

    const [updated] = await db
      .update(magazijnPicklijstenTable)
      .set({
        geplandeUitgifteOp: geplande_uitgifte_op !== undefined ? (geplande_uitgifte_op ? new Date(geplande_uitgifte_op) : null) : bestaand.geplandeUitgifteOp,
        notities: notities !== undefined ? str(notities) : bestaand.notities,
        bijgewerktOp: new Date(),
      })
      .where(eq(magazijnPicklijstenTable.id, id))
      .returning();

    if (regels !== undefined && bestaand.status === "concept") {
      await db.delete(magazijnPicklijstRegelsTable).where(eq(magazijnPicklijstRegelsTable.picklijstId, id));
      if (regels.length > 0) {
        await db.insert(magazijnPicklijstRegelsTable).values(
          regels.map((r) => ({
            picklijstId: id,
            artikelId: r.artikel_id,
            locatieId: r.locatie_id ?? null,
            gevraagdHoeveelheid: r.gevraagd_hoeveelheid,
            gepicktHoeveelheid: 0,
            status: "open" as const,
          }))
        );
      }
    }

    const [summary] = await db
      .select({ totaal_regels: sql<number>`count(${magazijnPicklijstRegelsTable.id})`, gepickt_regels: sql<number>`count(case when ${magazijnPicklijstRegelsTable.status} = 'gepickt' then 1 end)` })
      .from(magazijnPicklijstRegelsTable)
      .where(eq(magazijnPicklijstRegelsTable.picklijstId, id));

    return void res.json(mapPicklijst({ ...updated, totaal_regels: Number(summary?.totaal_regels ?? 0), gepickt_regels: Number(summary?.gepickt_regels ?? 0) }));
  } catch (err) {
    logger.error({ err }, "picklijst bijwerken fout");
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /magazijn/picklijsten/:id/verwerk
router.post("/picklijsten/:id/verwerk", schrijven, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const userId = req.session.userId!;
    const [pick] = await db.select().from(magazijnPicklijstenTable).where(eq(magazijnPicklijstenTable.id, id)).limit(1);
    if (!pick) return void res.status(404).json({ error: "Niet gevonden" });
    if (["voltooid", "deels_voltooid", "geannuleerd"].includes(pick.status)) {
      return void res.status(409).json({ error: "Picklijst is al verwerkt of geannuleerd" });
    }

    const { regels } = req.body as {
      regels: Array<{ regel_id: number; gepickt_hoeveelheid?: number; status?: string }>;
    };

    await db.transaction(async (tx) => {
      for (const inkomend of regels) {
        const [bestaandeRegel] = await tx
          .select()
          .from(magazijnPicklijstRegelsTable)
          .where(and(eq(magazijnPicklijstRegelsTable.id, inkomend.regel_id), eq(magazijnPicklijstRegelsTable.picklijstId, id)))
          .limit(1);

        if (!bestaandeRegel) continue;

        // Bepaal de vrije voorraad (hoeveelheid - gereserveerd) voor dit artikel/locatie
        const [bestaandVoorraad] = await tx
          .select()
          .from(voorraadTable)
          .where(bestaandeRegel.locatieId
            ? and(eq(voorraadTable.artikelId, bestaandeRegel.artikelId), eq(voorraadTable.locatieId, bestaandeRegel.locatieId))
            : eq(voorraadTable.artikelId, bestaandeRegel.artikelId))
          .limit(1);

        const vrijeVoorraad = bestaandVoorraad
          ? Math.max(0, bestaandVoorraad.hoeveelheid - bestaandVoorraad.gereserveerd)
          : 0;

        // Gevraagde hoeveelheid begrenzen op de vrije voorraad
        const gevraagd = inkomend.gepickt_hoeveelheid ?? bestaandeRegel.gevraagdHoeveelheid;
        const gepickt = Math.min(gevraagd, vrijeVoorraad);

        // Status bepalen: als er niets beschikbaar was → niet_beschikbaar,
        // anders de status uit de aanvraag of afgeleid uit de gepickte hoeveelheid.
        let status: string;
        if (vrijeVoorraad <= 0) {
          status = "niet_beschikbaar";
        } else if (inkomend.status === "niet_beschikbaar") {
          status = "niet_beschikbaar";
        } else {
          status = inkomend.status ?? (gepickt > 0 ? "gepickt" : "niet_beschikbaar");
        }

        await tx.update(magazijnPicklijstRegelsTable)
          .set({ gepicktHoeveelheid: gepickt, status })
          .where(eq(magazijnPicklijstRegelsTable.id, inkomend.regel_id));

        if (gepickt > 0 && bestaandVoorraad) {
          await tx.update(voorraadTable)
            .set({
              hoeveelheid: sql`GREATEST(0, ${voorraadTable.hoeveelheid} - ${gepickt})`,
              bijgewerktOp: new Date(),
            })
            .where(eq(voorraadTable.id, bestaandVoorraad.id));

          await tx.insert(voorraadMutatiesTable).values({
            artikelId: bestaandeRegel.artikelId,
            locatieId: bestaandeRegel.locatieId ?? null,
            type: "uitgifte",
            hoeveelheid: gepickt,
            delta: -gepickt,
            referentieType: "picklijst",
            referentieId: id,
            opdrachtId: pick.opdrachtId ?? null,
            gebruikerId: userId,
            omschrijving: `Picklijst #${id}${pick.opdrachtTitel ? ` — ${pick.opdrachtTitel}` : ""} verwerkt`,
          });
        }
      }

      const alleRegels = await tx.select().from(magazijnPicklijstRegelsTable).where(eq(magazijnPicklijstRegelsTable.picklijstId, id));
      const allesGepickt = alleRegels.every((r) => r.status === "gepickt");
      const deelsGepickt = alleRegels.some((r) => r.status === "gepickt");
      const nieuweStatus = allesGepickt ? "voltooid" : deelsGepickt ? "deels_voltooid" : "concept";

      await tx.update(magazijnPicklijstenTable)
        .set({ status: nieuweStatus, verwerktOp: new Date(), verwerktDoorId: userId, bijgewerktOp: new Date() })
        .where(eq(magazijnPicklijstenTable.id, id));
    });

    const [final] = await db
      .select({
        pick: magazijnPicklijstenTable,
        totaal_regels: sql<number>`count(${magazijnPicklijstRegelsTable.id})`,
        gepickt_regels: sql<number>`count(case when ${magazijnPicklijstRegelsTable.status} = 'gepickt' then 1 end)`,
      })
      .from(magazijnPicklijstenTable)
      .leftJoin(magazijnPicklijstRegelsTable, eq(magazijnPicklijstRegelsTable.picklijstId, magazijnPicklijstenTable.id))
      .where(eq(magazijnPicklijstenTable.id, id))
      .groupBy(magazijnPicklijstenTable.id);

    return void res.json(mapPicklijst({ ...final.pick, totaal_regels: Number(final.totaal_regels), gepickt_regels: Number(final.gepickt_regels) }));
  } catch (err) {
    logger.error({ err }, "picklijst verwerken fout");
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── AI BESTELSUGGESTIES ────────────────────────────────────────────────────────

router.post("/ai-bestelsuggesties", requireBevoegdheid("magazijn", 1), async (req, res) => {
  try {
    if (!heeftGateway()) return void res.status(503).json({ error: "AI niet beschikbaar" });

    // Haal alle artikelen op met voorraad, minimum en verbruik (30 dagen)
    const artikelen = await db
      .select({
        id: artikelenTable.id,
        naam: artikelenTable.naam,
        code: artikelenTable.code,
        eenheid: artikelenTable.eenheid,
        minimumVoorraad: artikelenTable.minimumVoorraad,
        leverancierId: artikelenTable.leverancierId,
        leverancierNaam: leveranciersTable.naam,
        huidigVoorraad: sql<number>`coalesce(sum(${voorraadTable.hoeveelheid}), 0)`,
        verbruik30d: sql<number>`coalesce((
          select sum(abs(${voorraadMutatiesTable.hoeveelheid}))
          from ${voorraadMutatiesTable}
          where ${voorraadMutatiesTable.artikelId} = ${artikelenTable.id}
            and ${voorraadMutatiesTable.type} in ('uitgifte', 'retour')
            and ${voorraadMutatiesTable.aangemaaktOp} >= now() - interval '30 days'
        ), 0)`,
      })
      .from(artikelenTable)
      .leftJoin(voorraadTable, eq(voorraadTable.artikelId, artikelenTable.id))
      .leftJoin(leveranciersTable, eq(leveranciersTable.id, artikelenTable.leverancierId))
      .where(eq(artikelenTable.actief, true))
      .groupBy(artikelenTable.id, leveranciersTable.naam);

    // Filter op artikelen die relevant zijn (onder minimum of op weg naar minimum)
    const relevantArtikel = (a: typeof artikelen[0]) => {
      const huidig = Number(a.huidigVoorraad);
      const minimum = Number(a.minimumVoorraad ?? 0);
      const verbruik = Number(a.verbruik30d);
      if (minimum <= 0 && verbruik <= 0) return false;
      // Onder of op het minimum
      if (huidig <= minimum) return true;
      // Verbruik suggereert dat minimum binnen 14 dagen bereikt wordt
      const dagenTotMinimum = verbruik > 0 ? ((huidig - minimum) / (verbruik / 30)) : Infinity;
      return dagenTotMinimum <= 14;
    };

    const teAnalyseren = artikelen.filter(relevantArtikel).slice(0, 50);

    if (teAnalyseren.length === 0) {
      return void res.json({
        suggesties: [],
        samenvatting: "Alle artikelen zijn ruim voldoende op voorraad. Geen besteladviezen nodig.",
        gegenereerd_op: new Date().toISOString(),
      });
    }

    const artikelContext = teAnalyseren.map((a) =>
      `${a.id} | ${a.code ?? "—"} | ${a.naam} | ${a.eenheid ?? "st"} | ${Number(a.huidigVoorraad)} | ${Number(a.minimumVoorraad ?? 0)} | ${Number(a.verbruik30d)} | ${a.leverancierNaam ?? "—"}`
    ).join("\n");

    const prompt = MAGAZIJN_BESTELSUGGESTIE_PROMPT.tekst.replace("{ARTIKEL_CONTEXT}", artikelContext);

    const aiResultaat = await aiGateway.chat("default", {
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1500,
    }, undefined, {
      module: "magazijn",
      functie: "bestelsuggesties",
      gebruikerId: req.session.userId ?? null,
      promptNaam: MAGAZIJN_BESTELSUGGESTIE_PROMPT.naam,
      promptVersie: MAGAZIJN_BESTELSUGGESTIE_PROMPT.versie,
    });

    let parsed: { suggesties: Array<{ artikel_id: number; gesuggereerde_hoeveelheid: number; urgentie: string; reden: string }>; samenvatting: string };
    if (!aiResultaat.ok) {
      return void res.status(503).json({ error: "AI niet beschikbaar" });
    }
    try {
      const raw = aiResultaat.inhoud ?? "{}";
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch?.[0] ?? "{}");
      if (!Array.isArray(parsed.suggesties)) parsed = { suggesties: [], samenvatting: "Geen suggesties beschikbaar." };
    } catch {
      parsed = { suggesties: [], samenvatting: "Kon AI-antwoord niet verwerken." };
    }

    // Verrijken met artikel-gegevens
    const artikelMap = Object.fromEntries(teAnalyseren.map((a) => [a.id, a]));
    const suggesties = parsed.suggesties
      .filter((s) => artikelMap[s.artikel_id])
      .map((s) => {
        const a = artikelMap[s.artikel_id];
        return {
          artikel_id: s.artikel_id,
          artikel_naam: a.naam,
          artikel_code: a.code ?? null,
          eenheid: a.eenheid ?? null,
          leverancier_id: a.leverancierId ?? null,
          leverancier_naam: a.leverancierNaam ?? null,
          huidig_voorraad: Number(a.huidigVoorraad),
          minimum_voorraad: Number(a.minimumVoorraad ?? 0),
          gesuggereerde_hoeveelheid: Number(s.gesuggereerde_hoeveelheid),
          reden: s.reden ?? "",
          urgentie: (["hoog", "middel", "laag"].includes(s.urgentie) ? s.urgentie : "middel") as "hoog" | "middel" | "laag",
        };
      });

    return void res.json({
      suggesties,
      samenvatting: parsed.samenvatting ?? "",
      gegenereerd_op: new Date().toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "AI bestelsuggesties fout");
    return void res.status(500).json({ error: "Interne serverfout" });
  }
});

logger.info("magazijn router geladen");

export default router;
