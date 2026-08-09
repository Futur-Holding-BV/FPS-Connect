// ─── PRIJS_01 §3: prijsafspraken-CRUD (nooit overschrijven, overlap weigeren) ───
//
// Module/niveau-keuze (§10 — expliciet gemeld):
//   - Prijsafspraken horen bij de calculatie (§5): de calculatie gebruikt de
//     afspraak als inkoopprijs. De import van prijsafspraken valt onder module
//     'calculaties' (zie IMPORT_TYPE_MODULES). Daarom hangen deze routes ook
//     aan de module 'calculaties'.
//   - GET = niveau 1 (lezen), POST/beeindigen = niveau 2 (bewerken), PATCH van
//     niet-prijsvelden = niveau 2. Dit is bewust LAGER dan het importrecht
//     (calculaties niveau 4): een prijsafspraak handmatig aanleggen/bekijken is
//     dagelijks calculatiewerk, een hele lijst inladen is beheerwerk.
//
// Harde regels (§9): een prijsafspraak wordt nooit overschreven; overlappende
// perioden worden geweigerd (409 met de botsende regel), niet stil opgelost.

import { Router } from "express";
import { db, prijsafsprakenTable, leveranciersTable } from "@workspace/db";
import { and, eq, ilike, isNull, lte, gte, or, sql } from "drizzle-orm";
import { requireEnigeBevoegdheid } from "../middlewares/auth";
import { vindGeldigeAfspraak } from "../services/prijsAfspraken";

const router = Router();

// Prijsafspraken zijn dagelijks calculatiewerk én financieel werk: lezen mag
// met calculaties- óf financieel-leesrecht (financieel niveau 2 = het
// financieel-leesniveau). Bewerken vraagt niveau 2 op één van beide modules.
const lezen = requireEnigeBevoegdheid([["calculaties", 1], ["financieel", 1]]);
const bewerken = requireEnigeBevoegdheid([["calculaties", 2], ["financieel", 2]]);

type Prijsafspraak = typeof prijsafsprakenTable.$inferSelect;

function mapAfspraak(r: Prijsafspraak) {
  return {
    id: r.id,
    leverancier_id: r.leverancierId,
    artikel_id: r.artikelId,
    leverancier_artikelcode: r.leverancierArtikelcode,
    leverancier_omschrijving: r.leverancierOmschrijving,
    prijs: parseFloat(r.prijs),
    eenheid: r.eenheid,
    excl_btw: r.exclBtw,
    valuta: r.valuta,
    geldig_van: r.geldigVan,
    geldig_tot: r.geldigTot,
    staffel_vanaf: r.staffelVanaf,
    toeslagen: r.toeslagen,
    bron_prijslijst: r.bronPrijslijst,
    bron_datum: r.bronDatum,
    bron: r.bron,
    import_id: r.importId,
    teruggedraaid_op: r.teruggedraaidOp ? r.teruggedraaidOp.toISOString() : null,
    aangemaakt_op: r.aangemaaktOp.toISOString(),
    bijgewerkt_op: r.bijgewerktOp.toISOString(),
  };
}

// Zoekt een overlappende, niet-teruggedraaide regel voor dezelfde sleutel.
// App-laag-vangnet vóór de DB-constraint, zodat we een nette 409 met de
// botsende regel kunnen teruggeven.
async function vindOverlap(params: {
  leverancierId: number;
  artikelId: number | null;
  leverancierArtikelcode: string | null;
  staffelVanaf: number;
  geldigVan: string;
  geldigTot: string;
  behalveId?: number;
}): Promise<Prijsafspraak | null> {
  const conds = [
    isNull(prijsafsprakenTable.teruggedraaidOp),
    eq(prijsafsprakenTable.leverancierId, params.leverancierId),
    eq(prijsafsprakenTable.staffelVanaf, params.staffelVanaf),
    // Overlap van [van,tot] inclusief: nieuw.van <= bestaand.tot EN nieuw.tot >= bestaand.van
    lte(prijsafsprakenTable.geldigVan, params.geldigTot),
    gte(prijsafsprakenTable.geldigTot, params.geldigVan),
  ];
  if (params.artikelId != null) {
    conds.push(eq(prijsafsprakenTable.artikelId, params.artikelId));
  } else {
    conds.push(isNull(prijsafsprakenTable.artikelId));
    conds.push(eq(prijsafsprakenTable.leverancierArtikelcode, params.leverancierArtikelcode ?? ""));
  }
  if (params.behalveId != null) {
    conds.push(sql`${prijsafsprakenTable.id} <> ${params.behalveId}`);
  }
  const [rij] = await db.select().from(prijsafsprakenTable).where(and(...conds)).limit(1);
  return rij ?? null;
}

// ── GET /prijsafspraken ─────────────────────────────────────────────────────
router.get("/prijsafspraken", lezen, async (req, res): Promise<void> => {
  try {
    const { leverancier_id, artikel_id, actueel, zoek } = req.query as Record<string, string | undefined>;
    const conds = [isNull(prijsafsprakenTable.teruggedraaidOp)];
    if (leverancier_id) conds.push(eq(prijsafsprakenTable.leverancierId, parseInt(leverancier_id, 10)));
    if (artikel_id) conds.push(eq(prijsafsprakenTable.artikelId, parseInt(artikel_id, 10)));
    if (actueel === "true") {
      const vandaag = new Date().toISOString().slice(0, 10);
      conds.push(lte(prijsafsprakenTable.geldigVan, vandaag));
      conds.push(gte(prijsafsprakenTable.geldigTot, vandaag));
    }
    if (zoek) {
      const term = `%${zoek}%`;
      conds.push(
        or(
          ilike(prijsafsprakenTable.leverancierArtikelcode, term),
          ilike(prijsafsprakenTable.leverancierOmschrijving, term),
        )!,
      );
    }
    const rijen = await db
      .select()
      .from(prijsafsprakenTable)
      .where(and(...conds))
      .orderBy(prijsafsprakenTable.geldigVan);
    res.json(rijen.map(mapAfspraak));
  } catch (err) {
    req.log.error({ err }, "prijsafspraken ophalen mislukt");
    res.status(500).json({ error: "Fout bij ophalen prijsafspraken" });
  }
});

// ── GET /prijsafspraken/geldig ──────────────────────────────────────────────
// Voor calculatie (§5) en factuurcontrole (§6): welke afspraak geldt er?
router.get("/prijsafspraken/geldig", lezen, async (req, res): Promise<void> => {
  try {
    const { artikel_id, leverancier_id, leverancier_artikelcode, datum, hoeveelheid } =
      req.query as Record<string, string | undefined>;
    const dag = datum || new Date().toISOString().slice(0, 10);
    const uitkomst = await vindGeldigeAfspraak({
      artikelId: artikel_id ? parseInt(artikel_id, 10) : null,
      leverancierId: leverancier_id ? parseInt(leverancier_id, 10) : null,
      leverancierArtikelcode: leverancier_artikelcode ?? null,
      datum: dag,
      hoeveelheid: hoeveelheid ? parseFloat(hoeveelheid) : 0,
    });
    res.json({
      afspraak: uitkomst.afspraak ? mapAfspraak(uitkomst.afspraak) : null,
      kandidaten: uitkomst.kandidaten.map(mapAfspraak),
    });
  } catch (err) {
    req.log.error({ err }, "geldige prijsafspraak ophalen mislukt");
    res.status(500).json({ error: "Fout bij ophalen geldige prijsafspraak" });
  }
});

// ── POST /prijsafspraken ────────────────────────────────────────────────────
// Nieuwe afspraak; nooit een bestaande overschrijven. Weigert overlap met 409.
router.post("/prijsafspraken", bewerken, async (req, res): Promise<void> => {
  try {
    const b = req.body as Record<string, unknown>;
    const leverancierId = Number(b.leverancier_id);
    if (!Number.isFinite(leverancierId) || leverancierId <= 0) {
      return void res.status(422).json({ error: "leverancier_id is verplicht" });
    }
    const [lev] = await db.select({ id: leveranciersTable.id }).from(leveranciersTable).where(eq(leveranciersTable.id, leverancierId));
    if (!lev) return void res.status(422).json({ error: "Onbekende leverancier" });

    const prijs = Number(b.prijs);
    if (!Number.isFinite(prijs)) return void res.status(422).json({ error: "prijs is verplicht" });
    const eenheid = String(b.eenheid ?? "").trim();
    if (!eenheid) return void res.status(422).json({ error: "eenheid is verplicht" });
    const geldigVan = String(b.geldig_van ?? "").trim();
    const geldigTot = String(b.geldig_tot ?? "").trim();
    if (!geldigVan || !geldigTot) return void res.status(422).json({ error: "geldig_van en geldig_tot zijn verplicht" });
    if (geldigVan > geldigTot) return void res.status(422).json({ error: "geldig_van moet vóór of gelijk aan geldig_tot liggen" });

    const artikelId = b.artikel_id != null && b.artikel_id !== "" ? Number(b.artikel_id) : null;
    const leverancierArtikelcode = b.leverancier_artikelcode ? String(b.leverancier_artikelcode).trim() : null;
    if (artikelId == null && !leverancierArtikelcode) {
      return void res.status(422).json({ error: "Geef een artikel_id of een leverancier_artikelcode op" });
    }
    const staffelVanaf = b.staffel_vanaf != null ? Number(b.staffel_vanaf) : 0;

    const overlap = await vindOverlap({ leverancierId, artikelId, leverancierArtikelcode, staffelVanaf, geldigVan, geldigTot });
    if (overlap) {
      return void res.status(409).json({
        error: "Overlappende geldigheidsperiode: er bestaat al een prijsafspraak voor deze leverancier, artikel en staffel in deze periode.",
        botsende_regel: mapAfspraak(overlap),
      });
    }

    try {
      const [nieuw] = await db
        .insert(prijsafsprakenTable)
        .values({
          leverancierId,
          artikelId,
          leverancierArtikelcode,
          leverancierOmschrijving: b.leverancier_omschrijving ? String(b.leverancier_omschrijving) : null,
          prijs: String(prijs),
          eenheid,
          exclBtw: b.excl_btw != null ? Boolean(b.excl_btw) : true,
          valuta: b.valuta ? String(b.valuta) : "EUR",
          geldigVan,
          geldigTot,
          staffelVanaf,
          toeslagen: Array.isArray(b.toeslagen) ? (b.toeslagen as never) : [],
          bronPrijslijst: b.bron_prijslijst ? String(b.bron_prijslijst) : null,
          bronDatum: b.bron_datum ? String(b.bron_datum) : null,
          bron: "handmatig",
          aangemaaktDoor: req.session?.userId ?? null,
        })
        .returning();
      res.status(201).json(mapAfspraak(nieuw!));
    } catch (err) {
      // DB-constraint is het vangnet: overlap die de app-check miste.
      if (err instanceof Error && /prijsafspraken_geen_overlap/.test(err.message)) {
        return void res.status(409).json({ error: "Overlappende geldigheidsperiode geweigerd (databasecontrole)." });
      }
      throw err;
    }
  } catch (err) {
    req.log.error({ err }, "prijsafspraak aanmaken mislukt");
    res.status(500).json({ error: "Fout bij aanmaken prijsafspraak" });
  }
});

// ── PATCH /prijsafspraken/:id ───────────────────────────────────────────────
// Alleen niet-prijsvelden (bron/notities). Prijs of periode wijzigen = een
// nieuwe regel (POST). Zo blijft de historie intact (§9).
router.patch("/prijsafspraken/:id", bewerken, async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params["id"]), 10);
    if (isNaN(id)) return void res.status(400).json({ error: "Ongeldig id" });
    const b = req.body as Record<string, unknown>;

    const verboden = ["prijs", "geldig_van", "geldig_tot", "staffel_vanaf", "artikel_id", "leverancier_id", "eenheid"];
    for (const veld of verboden) {
      if (veld in b) {
        return void res.status(422).json({
          error: `'${veld}' kan niet worden gewijzigd. Een gewijzigde prijs of periode is een nieuwe afspraak (POST /prijsafspraken).`,
        });
      }
    }

    const set: Record<string, unknown> = { bijgewerktOp: new Date() };
    if ("bron_prijslijst" in b) set.bronPrijslijst = b.bron_prijslijst ? String(b.bron_prijslijst) : null;
    if ("bron_datum" in b) set.bronDatum = b.bron_datum ? String(b.bron_datum) : null;
    if ("bron" in b) set.bron = b.bron ? String(b.bron) : "handmatig";
    if ("leverancier_omschrijving" in b) set.leverancierOmschrijving = b.leverancier_omschrijving ? String(b.leverancier_omschrijving) : null;
    if ("toeslagen" in b && Array.isArray(b.toeslagen)) set.toeslagen = b.toeslagen;

    const [bijgewerkt] = await db
      .update(prijsafsprakenTable)
      .set(set as never)
      .where(eq(prijsafsprakenTable.id, id))
      .returning();
    if (!bijgewerkt) return void res.status(404).json({ error: "Prijsafspraak niet gevonden" });
    res.json(mapAfspraak(bijgewerkt));
  } catch (err) {
    req.log.error({ err }, "prijsafspraak bijwerken mislukt");
    res.status(500).json({ error: "Fout bij bijwerken prijsafspraak" });
  }
});

// ── POST /prijsafspraken/:id/beeindigen ─────────────────────────────────────
// Zet geldig_tot naar voren (inkorten). Nooit verlengen, en nooit over een
// andere regel heen: dat zou een gat vullen dat tot overlap kan leiden.
router.post("/prijsafspraken/:id/beeindigen", bewerken, async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params["id"]), 10);
    if (isNaN(id)) return void res.status(400).json({ error: "Ongeldig id" });
    const nieuwTot = String((req.body as Record<string, unknown>).geldig_tot ?? "").trim();
    if (!nieuwTot) return void res.status(422).json({ error: "geldig_tot is verplicht" });

    const [huidig] = await db.select().from(prijsafsprakenTable).where(eq(prijsafsprakenTable.id, id));
    if (!huidig) return void res.status(404).json({ error: "Prijsafspraak niet gevonden" });
    if (huidig.teruggedraaidOp) return void res.status(409).json({ error: "Deze afspraak is teruggedraaid" });

    // Alleen inkorten: de nieuwe einddatum mag niet later liggen dan de huidige,
    // en niet vóór de startdatum.
    if (nieuwTot > huidig.geldigTot) {
      return void res.status(422).json({ error: "Een afspraak kan alleen ingekort worden, niet verlengd." });
    }
    if (nieuwTot < huidig.geldigVan) {
      return void res.status(422).json({ error: "geldig_tot mag niet vóór geldig_van liggen." });
    }

    const [bijgewerkt] = await db
      .update(prijsafsprakenTable)
      .set({ geldigTot: nieuwTot, bijgewerktOp: new Date() })
      .where(eq(prijsafsprakenTable.id, id))
      .returning();
    res.json(mapAfspraak(bijgewerkt!));
  } catch (err) {
    req.log.error({ err }, "prijsafspraak beëindigen mislukt");
    res.status(500).json({ error: "Fout bij beëindigen prijsafspraak" });
  }
});

export default router;
