import { Router } from "express";
import { db } from "@workspace/db";
import {
  arbeidsovereenkomstenTable,
  contractSignaleringenTable,
  contractBesluitenTable,
  medewerkersTable,
  functiesTable,
  werkgeversTable,
  medewerkerOpleidingenTable,
  opleidingenTable,
  bekwaamhedenTable,
  ziekmeldingenTable,
  verlofSaldiTable,
  verlofAanvragenTable,
  zzpOvereenkomstenTable,
} from "@workspace/db/schema";
import { eq, and, desc, inArray, isNotNull, sql } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { aiGateway, heeftGateway } from "../lib/aiGateway";

const router = Router();
const lezen = requireBevoegdheid("personeel", 1);
const schrijven = requireBevoegdheid("personeel", 2);

// ── Helpers ──────────────────────────────────────────────────────────────────

function dagenTot(eindDatum: string): number {
  const nu = new Date();
  nu.setHours(0, 0, 0, 0);
  const eind = new Date(eindDatum);
  eind.setHours(0, 0, 0, 0);
  return Math.round((eind.getTime() - nu.getTime()) / (1000 * 60 * 60 * 24));
}

function ketenregelingCheck(contracten: Array<{ contracttype: string; startDatum: string; eindDatum: string | null }>): string | null {
  // Wet Flexibele Arbeid: max 3 tijdelijke contracten in 3 jaar
  const tijdelijk = contracten.filter((c) => c.contracttype === "bepaalde_tijd" || c.contracttype === "oproep");
  if (tijdelijk.length >= 3) {
    return `Ketenregeling: ${tijdelijk.length} tijdelijke contracten. Volgend contract moet onbepaalde tijd zijn (max. 3 in 3 jaar).`;
  }
  // Totale duur tijdelijke contracten > 3 jaar
  const start = tijdelijk.map((c) => new Date(c.startDatum).getTime()).reduce((a, b) => Math.min(a, b), Infinity);
  const eind = tijdelijk.map((c) => (c.eindDatum ? new Date(c.eindDatum).getTime() : Date.now())).reduce((a, b) => Math.max(a, b), 0);
  const maanden = (eind - start) / (1000 * 60 * 60 * 24 * 30);
  if (maanden > 36) {
    return `Ketenregeling: aaneengesloten tijdelijk dienstverband duurt langer dan 3 jaar (${Math.round(maanden)} maanden). Omzetting naar onbepaalde tijd kan wettelijk verplicht zijn.`;
  }
  return null;
}

function aanzegtermijnCheck(contract: { eindDatum: string | null; startDatum: string }): string | null {
  if (!contract.eindDatum) return null;
  const duur = dagenTot(contract.startDatum) * -1 + dagenTot(contract.eindDatum);
  // Contractduur >= 6 maanden → aanzegtermijn 1 maand (Wet Aanzegging)
  if (duur >= 180) {
    const resterend = dagenTot(contract.eindDatum);
    if (resterend <= 30 && resterend >= 0) {
      return `Aanzegtermijn: verloopt over ${resterend} dag(en). Wettelijk verplicht 1 maand voor einde bij contractduur >= 6 maanden.`;
    }
    if (resterend < 0) {
      return `Aanzegtermijn: contract verlopen zonder tijdige aanzegging.`;
    }
  }
  return null;
}

// ── Bewaking uitvoeren (genereer signaleringen voor actieve tijdelijke contracten) ──

export async function voerContractBewakingUit(): Promise<number> {
  const actief = await db
    .select({
      c: arbeidsovereenkomstenTable,
      medewerkerId: medewerkersTable.id,
      medewerkerNaam: medewerkersTable.naam,
    })
    .from(arbeidsovereenkomstenTable)
    .innerJoin(medewerkersTable, eq(arbeidsovereenkomstenTable.medewerkerId, medewerkersTable.id))
    .where(
      and(
        eq(arbeidsovereenkomstenTable.status, "actief"),
        isNotNull(arbeidsovereenkomstenTable.eindDatum),
      ),
    );

  let aangemaakt = 0;

  for (const row of actief) {
    const contract = row.c;
    if (!contract.eindDatum) continue;
    const dagen = dagenTot(contract.eindDatum);

    // Drempel-types
    const drempels: Array<{ type: string; max: number; min: number; ernst: string }> = [
      { type: "120_dagen", max: 120, min: 91,  ernst: "info" },
      { type: "90_dagen",  max: 90,  min: 76,  ernst: "info" },
      { type: "75_dagen",  max: 75,  min: 61,  ernst: "waarschuwing" },
      { type: "60_dagen",  max: 60,  min: 31,  ernst: "waarschuwing" },
      { type: "30_dagen",  max: 30,  min: 1,   ernst: "kritiek" },
      { type: "verlopen",  max: 0,   min: -999, ernst: "kritiek" },
    ];

    for (const d of drempels) {
      if (dagen <= d.max && dagen >= d.min) {
        // Controleer of al bestaat
        const bestaand = await db
          .select({ id: contractSignaleringenTable.id })
          .from(contractSignaleringenTable)
          .where(
            and(
              eq(contractSignaleringenTable.contractId, contract.id),
              eq(contractSignaleringenTable.type, d.type),
            ),
          )
          .limit(1);
        if (bestaand.length > 0) continue;

        const boodschap =
          d.type === "verlopen"
            ? `Contract van ${row.medewerkerNaam} is verlopen (einddatum ${contract.eindDatum}).`
            : `Contract van ${row.medewerkerNaam} verloopt over ${dagen} dag(en) (${contract.eindDatum}).`;

        // onConflictDoNothing + unieke index (contract_id, type): race-vrij bij
        // gelijktijdige bewakingsruns (bv. twee contract-overnames tegelijk).
        const ingevoegd = await db.insert(contractSignaleringenTable).values({
          contractId: contract.id,
          medewerkerId: contract.medewerkerId,
          type: d.type,
          ernst: d.ernst,
          boodschap,
          status: "nieuw",
        }).onConflictDoNothing().returning({ id: contractSignaleringenTable.id });
        if (ingevoegd.length > 0) aangemaakt++;
      }
    }

    // Ketenregeling + aanzegtermijn
    const alleContracten = await db
      .select({ contracttype: arbeidsovereenkomstenTable.contracttype, startDatum: arbeidsovereenkomstenTable.startDatum, eindDatum: arbeidsovereenkomstenTable.eindDatum })
      .from(arbeidsovereenkomstenTable)
      .where(eq(arbeidsovereenkomstenTable.medewerkerId, contract.medewerkerId));

    const keten = ketenregelingCheck(alleContracten);
    if (keten) {
      const best = await db.select({ id: contractSignaleringenTable.id }).from(contractSignaleringenTable)
        .where(and(eq(contractSignaleringenTable.contractId, contract.id), eq(contractSignaleringenTable.type, "ketenregel"))).limit(1);
      if (best.length === 0) {
        await db.insert(contractSignaleringenTable).values({ contractId: contract.id, medewerkerId: contract.medewerkerId, type: "ketenregel", ernst: "waarschuwing", boodschap: keten, status: "nieuw" });
        aangemaakt++;
      }
    }

    const aanzeg = aanzegtermijnCheck(contract);
    if (aanzeg) {
      const best = await db.select({ id: contractSignaleringenTable.id }).from(contractSignaleringenTable)
        .where(and(eq(contractSignaleringenTable.contractId, contract.id), eq(contractSignaleringenTable.type, "aanzegtermijn"))).limit(1);
      if (best.length === 0) {
        await db.insert(contractSignaleringenTable).values({ contractId: contract.id, medewerkerId: contract.medewerkerId, type: "aanzegtermijn", ernst: "kritiek", boodschap: aanzeg, status: "nieuw" });
        aangemaakt++;
      }
    }
  }
  return aangemaakt;
}

// ── Routes ───────────────────────────────────────────────────────────────────

// GET /contract-bewaking/dashboard
router.get("/contract-bewaking/dashboard", lezen, async (req, res): Promise<void> => {
  // Bewaking bijwerken
  await voerContractBewakingUit();

  const nu = new Date().toISOString().slice(0, 10);

  // Contracten per bucket
  const contracten = await db
    .select({
      c: arbeidsovereenkomstenTable,
      naam: medewerkersTable.naam,
      functieNaam: functiesTable.naam,
    })
    .from(arbeidsovereenkomstenTable)
    .leftJoin(medewerkersTable, eq(arbeidsovereenkomstenTable.medewerkerId, medewerkersTable.id))
    .leftJoin(functiesTable, eq(arbeidsovereenkomstenTable.functieId, functiesTable.id))
    .where(eq(arbeidsovereenkomstenTable.status, "actief"))
    .orderBy(arbeidsovereenkomstenTable.eindDatum);

  const buckets = {
    binnen30: [] as typeof contracten,
    binnen60: [] as typeof contracten,
    binnen90: [] as typeof contracten,
    binnen120: [] as typeof contracten,
    verlopen: [] as typeof contracten,
    onbepaaldeTijd: [] as typeof contracten,
  };

  for (const r of contracten) {
    if (!r.c.eindDatum) {
      buckets.onbepaaldeTijd.push(r);
      continue;
    }
    const d = dagenTot(r.c.eindDatum);
    if (d < 0) buckets.verlopen.push(r);
    else if (d <= 30) buckets.binnen30.push(r);
    else if (d <= 60) buckets.binnen60.push(r);
    else if (d <= 90) buckets.binnen90.push(r);
    else if (d <= 120) buckets.binnen120.push(r);
  }

  // Actieve signaleringen
  const signaleringen = await db
    .select({
      s: contractSignaleringenTable,
      medewerkerNaam: medewerkersTable.naam,
    })
    .from(contractSignaleringenTable)
    .leftJoin(medewerkersTable, eq(contractSignaleringenTable.medewerkerId, medewerkersTable.id))
    .where(eq(contractSignaleringenTable.status, "nieuw"))
    .orderBy(desc(contractSignaleringenTable.aangemaaktOp))
    .limit(50);

  // Besluiten in behandeling
  const besluiten = await db
    .select({
      b: contractBesluitenTable,
      medewerkerNaam: medewerkersTable.naam,
    })
    .from(contractBesluitenTable)
    .leftJoin(medewerkersTable, eq(contractBesluitenTable.medewerkerId, medewerkersTable.id))
    .where(inArray(contractBesluitenTable.status, ["in_behandeling", "documenten_op", "wacht_handtekening"]))
    .orderBy(desc(contractBesluitenTable.bijgewerktOp))
    .limit(20);

  res.json({
    buckets: {
      verlopen: buckets.verlopen.map(mapContract),
      binnen30: buckets.binnen30.map(mapContract),
      binnen60: buckets.binnen60.map(mapContract),
      binnen90: buckets.binnen90.map(mapContract),
      binnen120: buckets.binnen120.map(mapContract),
      onbepaaldeTijd: buckets.onbepaaldeTijd.length,
    },
    signaleringen: signaleringen.map((s) => ({
      id: s.s.id,
      contract_id: s.s.contractId,
      medewerker_id: s.s.medewerkerId,
      medewerker_naam: s.medewerkerNaam,
      type: s.s.type,
      ernst: s.s.ernst,
      boodschap: s.s.boodschap,
      ai_advies: s.s.aiAdvies,
      status: s.s.status,
      aangemaakt_op: s.s.aangemaaktOp,
    })),
    besluiten_in_behandeling: besluiten.map((b) => ({
      id: b.b.id,
      contract_id: b.b.contractId,
      medewerker_id: b.b.medewerkerId,
      medewerker_naam: b.medewerkerNaam,
      besluit: b.b.besluit,
      status: b.b.status,
      bijgewerkt_op: b.b.bijgewerktOp,
    })),
  });
});

// Kalenderveilig één maand terug (tijdzone-onafhankelijk, op datumstrings):
// dag wordt geclamped op de laatste geldige dag van de doelmaand
// (31 mei → 30 april; 31/30/29 maart → 28 (of 29 in schrikkeljaar) februari).
export function maandTerug(isoDatum: string): string {
  const [jaar, maand, dag] = isoDatum.slice(0, 10).split("-").map(Number);
  // Doelmaand: maand-1 (1-gebaseerd); Date.UTC met dag 0 = laatste dag vorige maand
  let doelJaar = jaar;
  let doelMaand = maand - 1;
  if (doelMaand < 1) {
    doelMaand = 12;
    doelJaar -= 1;
  }
  const laatsteDag = new Date(Date.UTC(doelJaar, doelMaand, 0)).getUTCDate();
  const doelDag = Math.min(dag, laatsteDag);
  return `${doelJaar}-${String(doelMaand).padStart(2, "0")}-${String(doelDag).padStart(2, "0")}`;
}

// ── Cruciale datums per medewerker ───────────────────────────────────────────
// Afgeleide view (geen kopieën): per actieve medewerker de meest urgente
// naderende deadline. Bronnen: 1) tijdelijke arbeidsovereenkomsten (uiterste
// aanzegdatum = einddatum − 1 maand bij contractduur >= 6 maanden, anders de
// einddatum zelf); 2) ZZP-overeenkomsten (einddatum, Wet DBA) + waarschuwing
// wanneer het totale ZZP-verband te lang dreigt te lopen (>= 9 maanden).

const CRUCIALE_URGENT_DAGEN = 30;
const CRUCIALE_DBA_MAANDEN_GRENS = 9;

export type CrucialeDatumItem = {
  medewerker_id: number;
  naam: string;
  datum: string;
  dagen_tot: number;
  bron: "contract" | "zzp";
  label: string;
  reden: string;
};

/**
 * Haal alle urgente cruciale deadlines op (aanzegdatums + ZZP/DBA), gegroepeerd
 * per medewerker + bron. Gebruikt door de bewakingsloop voor werkbak-items.
 * Definitie "urgent": dagen_tot <= CRUCIALE_URGENT_DAGEN OF DBA-risico bereikt.
 * Eén item per medewerker per bron-type zodat contract- en ZZP-deadline
 * onafhankelijk kunnen worden afgehandeld.
 */
export async function haalCrucialeDatumItems(): Promise<CrucialeDatumItem[]> {
  const medewerkers = await db
    .select({ id: medewerkersTable.id, naam: medewerkersTable.naam })
    .from(medewerkersTable)
    .where(eq(medewerkersTable.actief, true));
  const naamPerId = new Map(medewerkers.map((m) => [m.id, m.naam]));

  // Per (medewerker_id, bron): bewaar het meest urgente item.
  const perMedewerkerBron = new Map<string, CrucialeDatumItem>();
  const zetAlsUrgenter = (item: CrucialeDatumItem) => {
    const sleutel = `${item.bron}:${item.medewerker_id}`;
    const bestaand = perMedewerkerBron.get(sleutel);
    if (!bestaand || item.dagen_tot < bestaand.dagen_tot) perMedewerkerBron.set(sleutel, item);
  };

  // 1) Tijdelijke arbeidsovereenkomsten
  const contracten = await db
    .select()
    .from(arbeidsovereenkomstenTable)
    .where(and(eq(arbeidsovereenkomstenTable.status, "actief"), isNotNull(arbeidsovereenkomstenTable.eindDatum)));
  for (const c of contracten) {
    if (!c.eindDatum || !naamPerId.has(c.medewerkerId)) continue;
    if (c.contracttype !== "bepaalde_tijd" && c.contracttype !== "oproep") continue;
    const duurDagen = Math.round(
      (new Date(c.eindDatum).getTime() - new Date(c.startDatum).getTime()) / (1000 * 60 * 60 * 24),
    );
    let datum = c.eindDatum;
    let label = "Contract loopt af";
    let reden = `Tijdelijk contract eindigt op ${c.eindDatum}.`;
    if (duurDagen >= 180) {
      datum = maandTerug(c.eindDatum);
      label = "Uiterste aanzegdatum";
      reden = `Uiterlijk ${datum} schriftelijk aanzeggen (contract eindigt ${c.eindDatum}, Wet Aanzegging).`;
    }
    const dagen = dagenTot(datum);
    if (dagen > CRUCIALE_URGENT_DAGEN) continue;
    zetAlsUrgenter({
      medewerker_id: c.medewerkerId,
      naam: naamPerId.get(c.medewerkerId)!,
      datum,
      dagen_tot: dagen,
      bron: "contract",
      label,
      reden,
    });
  }

  // 2) ZZP-overeenkomsten (Wet DBA)
  const zzp = await db
    .select()
    .from(zzpOvereenkomstenTable)
    .where(inArray(zzpOvereenkomstenTable.status, ["ondertekend", "te_ondertekenen"]));
  const zzpPerMedewerker = new Map<number, typeof zzp>();
  for (const o of zzp) {
    if (!naamPerId.has(o.medewerkerId)) continue;
    (zzpPerMedewerker.get(o.medewerkerId) ?? zzpPerMedewerker.set(o.medewerkerId, []).get(o.medewerkerId)!).push(o);
  }
  for (const [medewerkerId, overeenkomsten] of zzpPerMedewerker) {
    const lopend = overeenkomsten
      .filter((o) => dagenTot(o.eindDatum) >= -90)
      .sort((a, b) => a.eindDatum.localeCompare(b.eindDatum))[0];
    if (!lopend) continue;
    const dagen = dagenTot(lopend.eindDatum);

    const eersteStart = overeenkomsten.map((o) => o.startDatum).sort()[0];
    const laatsteEind = overeenkomsten.map((o) => o.eindDatum).sort().slice(-1)[0];
    const verbandMaanden =
      (new Date(laatsteEind).getTime() - new Date(eersteStart).getTime()) / (1000 * 60 * 60 * 24 * 30);
    const dbaRisico = verbandMaanden >= CRUCIALE_DBA_MAANDEN_GRENS;

    if (dagen > CRUCIALE_URGENT_DAGEN && !dbaRisico) continue;
    zetAlsUrgenter({
      medewerker_id: medewerkerId,
      naam: naamPerId.get(medewerkerId)!,
      datum: lopend.eindDatum,
      dagen_tot: dagen,
      bron: "zzp",
      label: dbaRisico ? "ZZP: DBA-risico" : "ZZP-overeenkomst loopt af",
      reden: dbaRisico
        ? `ZZP-verband loopt al ${Math.round(verbandMaanden)} maanden (grens ${CRUCIALE_DBA_MAANDEN_GRENS}); risico op schijnzelfstandigheid (Wet DBA). Overeenkomst eindigt ${lopend.eindDatum}.`
        : `ZZP-overeenkomst eindigt op ${lopend.eindDatum} (Wet DBA: einddatum verplicht).`,
    });
  }

  return [...perMedewerkerBron.values()];
}

router.get("/contract-bewaking/cruciale-datums", lezen, async (_req, res): Promise<void> => {
  const URGENT_DAGEN = 30;
  const DBA_MAANDEN_GRENS = 9;

  const medewerkers = await db
    .select({ id: medewerkersTable.id, naam: medewerkersTable.naam })
    .from(medewerkersTable)
    .where(eq(medewerkersTable.actief, true));
  const naamPerId = new Map(medewerkers.map((m) => [m.id, m.naam]));

  type Item = {
    medewerker_id: number;
    naam: string;
    datum: string;
    dagen_tot: number;
    urgent: boolean;
    bron: "contract" | "zzp";
    label: string;
    reden: string;
  };
  const perMedewerker = new Map<number, Item>();
  const zetAlsUrgenter = (item: Item) => {
    const bestaand = perMedewerker.get(item.medewerker_id);
    if (!bestaand || item.dagen_tot < bestaand.dagen_tot) perMedewerker.set(item.medewerker_id, item);
  };

  // 1) Tijdelijke arbeidsovereenkomsten
  const contracten = await db
    .select()
    .from(arbeidsovereenkomstenTable)
    .where(and(eq(arbeidsovereenkomstenTable.status, "actief"), isNotNull(arbeidsovereenkomstenTable.eindDatum)));
  for (const c of contracten) {
    if (!c.eindDatum || !naamPerId.has(c.medewerkerId)) continue;
    if (c.contracttype !== "bepaalde_tijd" && c.contracttype !== "oproep") continue;
    const duurDagen = Math.round(
      (new Date(c.eindDatum).getTime() - new Date(c.startDatum).getTime()) / (1000 * 60 * 60 * 24),
    );
    let datum = c.eindDatum;
    let label = "Contract loopt af";
    let reden = `Tijdelijk contract eindigt op ${c.eindDatum}.`;
    if (duurDagen >= 180) {
      // Wet Aanzegging: uiterlijk 1 maand vóór einddatum schriftelijk aanzeggen.
      datum = maandTerug(c.eindDatum);
      label = "Uiterste aanzegdatum";
      reden = `Uiterlijk ${datum} schriftelijk aanzeggen (contract eindigt ${c.eindDatum}, Wet Aanzegging).`;
    }
    const dagen = dagenTot(datum);
    zetAlsUrgenter({
      medewerker_id: c.medewerkerId,
      naam: naamPerId.get(c.medewerkerId)!,
      datum,
      dagen_tot: dagen,
      urgent: dagen <= URGENT_DAGEN,
      bron: "contract",
      label,
      reden,
    });
  }

  // 2) ZZP-overeenkomsten (Wet DBA)
  const zzp = await db
    .select()
    .from(zzpOvereenkomstenTable)
    .where(inArray(zzpOvereenkomstenTable.status, ["ondertekend", "te_ondertekenen"]));
  const zzpPerMedewerker = new Map<number, typeof zzp>();
  for (const o of zzp) {
    if (!naamPerId.has(o.medewerkerId)) continue;
    (zzpPerMedewerker.get(o.medewerkerId) ?? zzpPerMedewerker.set(o.medewerkerId, []).get(o.medewerkerId)!).push(o);
  }
  for (const [medewerkerId, overeenkomsten] of zzpPerMedewerker) {
    // Lopende/komende overeenkomst met de dichtstbijzijnde einddatum
    const lopend = overeenkomsten
      .filter((o) => dagenTot(o.eindDatum) >= -90)
      .sort((a, b) => a.eindDatum.localeCompare(b.eindDatum))[0];
    if (!lopend) continue;
    const dagen = dagenTot(lopend.eindDatum);

    // DBA-duurcheck: totale verband vanaf eerste start tot laatste einde
    const eersteStart = overeenkomsten.map((o) => o.startDatum).sort()[0];
    const laatsteEind = overeenkomsten.map((o) => o.eindDatum).sort().slice(-1)[0];
    const verbandMaanden =
      (new Date(laatsteEind).getTime() - new Date(eersteStart).getTime()) / (1000 * 60 * 60 * 24 * 30);
    const dbaRisico = verbandMaanden >= DBA_MAANDEN_GRENS;

    zetAlsUrgenter({
      medewerker_id: medewerkerId,
      naam: naamPerId.get(medewerkerId)!,
      datum: lopend.eindDatum,
      dagen_tot: dagen,
      urgent: dagen <= URGENT_DAGEN || dbaRisico,
      bron: "zzp",
      label: dbaRisico ? "ZZP: DBA-risico" : "ZZP-overeenkomst loopt af",
      reden: dbaRisico
        ? `ZZP-verband loopt al ${Math.round(verbandMaanden)} maanden (grens ${DBA_MAANDEN_GRENS}); risico op schijnzelfstandigheid (Wet DBA). Overeenkomst eindigt ${lopend.eindDatum}.`
        : `ZZP-overeenkomst eindigt op ${lopend.eindDatum} (Wet DBA: einddatum verplicht).`,
    });
  }

  const items = [...perMedewerker.values()].sort((a, b) => a.dagen_tot - b.dagen_tot);
  res.json({ items, urgent_aantal: items.filter((i) => i.urgent).length });
});

function mapContract(r: { c: typeof arbeidsovereenkomstenTable.$inferSelect; naam: string | null; functieNaam: string | null }) {
  return {
    id: r.c.id,
    medewerker_id: r.c.medewerkerId,
    medewerker_naam: r.naam,
    functie_naam: r.c.functieOmschrijving || r.functieNaam,
    contracttype: r.c.contracttype,
    start_datum: r.c.startDatum,
    eind_datum: r.c.eindDatum,
    dagen_tot_einde: r.c.eindDatum ? dagenTot(r.c.eindDatum) : null,
    cao: r.c.cao,
    salaris_bruto: r.c.salarisBruto,
    salaris_eenheid: r.c.salarisEenheid,
    arbeidsduur_per_week: r.c.arbeidsduurPerWeek,
    uren_min_per_week: r.c.urenMinPerWeek,
    uren_max_per_week: r.c.urenMaxPerWeek,
    opzegtermijn: r.c.opzegtermijn,
    aanzegtermijn: r.c.aanzegtermijn,
    reiskostenvergoeding: r.c.reiskostenvergoeding,
    concurrentiebeding: r.c.concurrentiebeding,
    relatiebeding: r.c.relatiebeding,
    status: r.c.status,
    ondertekening_vereist: r.c.ondertekeningVereist,
    ondertekend_door_medewerker_op: r.c.ondertekendDoorMedewerkerOp,
    aangemaakt_op: r.c.aangemaaktOp,
  };
}

// GET /contract-bewaking/medewerkers/:medewerkerId
router.get("/contract-bewaking/medewerkers/:medewerkerId", lezen, async (req, res): Promise<void> => {
  const medewerkerId = parseInt(String(req.params.medewerkerId));
  if (isNaN(medewerkerId)) return void res.status(400).json({ error: "Ongeldig medewerker-id" });

  const contracten = await db
    .select({
      c: arbeidsovereenkomstenTable,
      functieNaam: functiesTable.naam,
      werkgeverNaam: werkgeversTable.naam,
    })
    .from(arbeidsovereenkomstenTable)
    .leftJoin(functiesTable, eq(arbeidsovereenkomstenTable.functieId, functiesTable.id))
    .leftJoin(werkgeversTable, eq(arbeidsovereenkomstenTable.werkgeverId, werkgeversTable.id))
    .where(eq(arbeidsovereenkomstenTable.medewerkerId, medewerkerId))
    .orderBy(desc(arbeidsovereenkomstenTable.startDatum));

  res.json(contracten.map((r) => ({
    id: r.c.id,
    medewerker_id: r.c.medewerkerId,
    werkgever_id: r.c.werkgeverId,
    werkgever_naam: r.werkgeverNaam,
    functie_id: r.c.functieId,
    functie_naam: r.c.functieOmschrijving || r.functieNaam,
    contracttype: r.c.contracttype,
    start_datum: r.c.startDatum,
    eind_datum: r.c.eindDatum,
    proeftijd_dagen: r.c.proeftijdDagen,
    cao: r.c.cao,
    salaris_bruto: r.c.salarisBruto,
    salaris_eenheid: r.c.salarisEenheid,
    arbeidsduur_per_week: r.c.arbeidsduurPerWeek,
    uren_min_per_week: r.c.urenMinPerWeek,
    uren_max_per_week: r.c.urenMaxPerWeek,
    opzegtermijn: r.c.opzegtermijn,
    aanzegtermijn: r.c.aanzegtermijn,
    reiskostenvergoeding: r.c.reiskostenvergoeding,
    concurrentiebeding: r.c.concurrentiebeding,
    relatiebeding: r.c.relatiebeding,
    status: r.c.status,
    voorgaand_contract_id: r.c.voorgaandContractId,
    ondertekening_vereist: r.c.ondertekeningVereist,
    ondertekend_door_medewerker_op: r.c.ondertekendDoorMedewerkerOp,
    ondertekend_door_hr_op: r.c.ondertekendDoorHrOp,
    notities: r.c.notities,
    dagen_tot_einde: r.c.eindDatum ? dagenTot(r.c.eindDatum) : null,
    aangemaakt_op: r.c.aangemaaktOp,
    bijgewerkt_op: r.c.bijgewerktOp,
  })));
});

// POST /contract-bewaking/medewerkers/:medewerkerId
router.post("/contract-bewaking/medewerkers/:medewerkerId", schrijven, async (req, res): Promise<void> => {
  const medewerkerId = parseInt(String(req.params.medewerkerId));
  if (isNaN(medewerkerId)) return void res.status(400).json({ error: "Ongeldig medewerker-id" });

  const { contracttype, start_datum, eind_datum, proeftijd_dagen, functie_id, werkgever_id, functie_omschrijving, cao, salaris_bruto, salaris_eenheid, arbeidsduur_per_week, uren_min_per_week, uren_max_per_week, opzegtermijn, aanzegtermijn, reiskostenvergoeding, concurrentiebeding, relatiebeding, voorgaand_contract_id, ondertekening_vereist, notities } = req.body;

  if (!contracttype || !start_datum) return void res.status(400).json({ error: "contracttype en start_datum zijn verplicht" });

  const [rij] = await db.insert(arbeidsovereenkomstenTable).values({
    medewerkerId,
    werkgeverId: werkgever_id ?? null,
    functieId: functie_id ?? null,
    contracttype,
    startDatum: start_datum,
    eindDatum: eind_datum ?? null,
    proeftijdDagen: proeftijd_dagen ?? null,
    functieOmschrijving: functie_omschrijving ?? null,
    cao: cao ?? null,
    salarisBruto: salaris_bruto ?? null,
    salarisEenheid: salaris_eenheid ?? null,
    arbeidsduurPerWeek: arbeidsduur_per_week ?? null,
    urenMinPerWeek: uren_min_per_week ?? null,
    urenMaxPerWeek: uren_max_per_week ?? null,
    opzegtermijn: opzegtermijn ?? null,
    aanzegtermijn: aanzegtermijn ?? null,
    reiskostenvergoeding: reiskostenvergoeding ?? null,
    concurrentiebeding: concurrentiebeding ?? null,
    relatiebeding: relatiebeding ?? null,
    voorgaandContractId: voorgaand_contract_id ?? null,
    ondertekeningVereist: ondertekening_vereist ?? false,
    notities: notities ?? null,
    aangemaaktDoorId: req.session.userId ?? null,
    status: "actief",
  }).returning();

  // Activeer bewaking voor dit nieuwe contract
  if (eind_datum) await voerContractBewakingUit();

  res.status(201).json({ id: rij.id, bijgewerkt_op: rij.bijgewerktOp });
});

// PATCH /contract-bewaking/:id
router.patch("/contract-bewaking/:id", schrijven, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) return void res.status(400).json({ error: "Ongeldig contract-id" });

  const { contracttype, start_datum, eind_datum, proeftijd_dagen, functie_id, werkgever_id, functie_omschrijving, cao, salaris_bruto, salaris_eenheid, arbeidsduur_per_week, uren_min_per_week, uren_max_per_week, opzegtermijn, aanzegtermijn, reiskostenvergoeding, concurrentiebeding, relatiebeding, status, ondertekening_vereist, ondertekend_door_medewerker_op, ondertekend_door_hr_op, notities } = req.body;

  await db.update(arbeidsovereenkomstenTable).set({
    ...(contracttype !== undefined && { contracttype }),
    ...(start_datum !== undefined && { startDatum: start_datum }),
    ...(eind_datum !== undefined && { eindDatum: eind_datum }),
    ...(proeftijd_dagen !== undefined && { proeftijdDagen: proeftijd_dagen }),
    ...(functie_id !== undefined && { functieId: functie_id }),
    ...(werkgever_id !== undefined && { werkgeverId: werkgever_id }),
    ...(functie_omschrijving !== undefined && { functieOmschrijving: functie_omschrijving }),
    ...(cao !== undefined && { cao }),
    ...(salaris_bruto !== undefined && { salarisBruto: salaris_bruto }),
    ...(salaris_eenheid !== undefined && { salarisEenheid: salaris_eenheid }),
    ...(arbeidsduur_per_week !== undefined && { arbeidsduurPerWeek: arbeidsduur_per_week }),
    ...(uren_min_per_week !== undefined && { urenMinPerWeek: uren_min_per_week }),
    ...(uren_max_per_week !== undefined && { urenMaxPerWeek: uren_max_per_week }),
    ...(opzegtermijn !== undefined && { opzegtermijn }),
    ...(aanzegtermijn !== undefined && { aanzegtermijn }),
    ...(reiskostenvergoeding !== undefined && { reiskostenvergoeding }),
    ...(concurrentiebeding !== undefined && { concurrentiebeding }),
    ...(relatiebeding !== undefined && { relatiebeding }),
    ...(status !== undefined && { status }),
    ...(ondertekening_vereist !== undefined && { ondertekeningVereist: ondertekening_vereist }),
    ...(ondertekend_door_medewerker_op !== undefined && { ondertekendDoorMedewerkerOp: ondertekend_door_medewerker_op }),
    ...(ondertekend_door_hr_op !== undefined && { ondertekendDoorHrOp: ondertekend_door_hr_op }),
    ...(notities !== undefined && { notities }),
    bijgewerktOp: new Date(),
  }).where(eq(arbeidsovereenkomstenTable.id, id));

  res.json({ bijgewerkt_op: new Date() });
});

// DELETE /contract-bewaking/:id
router.delete("/contract-bewaking/:id", schrijven, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) return void res.status(400).json({ error: "Ongeldig contract-id" });
  await db.delete(arbeidsovereenkomstenTable).where(eq(arbeidsovereenkomstenTable.id, id));
  res.status(204).send();
});

// GET /contract-bewaking/:id/signaleringen
router.get("/contract-bewaking/:id/signaleringen", lezen, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) return void res.status(400).json({ error: "Ongeldig contract-id" });

  const rijen = await db
    .select()
    .from(contractSignaleringenTable)
    .where(eq(contractSignaleringenTable.contractId, id))
    .orderBy(desc(contractSignaleringenTable.aangemaaktOp));

  res.json(rijen.map((s) => ({
    id: s.id,
    type: s.type,
    ernst: s.ernst,
    boodschap: s.boodschap,
    ai_advies: s.aiAdvies,
    status: s.status,
    gezien_op: s.gezienOp,
    aangemaakt_op: s.aangemaaktOp,
  })));
});

// PATCH /contract-bewaking/signaleringen/:id/gezien
router.patch("/contract-bewaking/signaleringen/:id/gezien", lezen, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) return void res.status(400).json({ error: "Ongeldig id" });
  const gebruikerId = req.session.userId ?? null;
  await db.update(contractSignaleringenTable).set({
    status: "gezien",
    gezienDoorId: gebruikerId,
    gezienOp: new Date(),
  }).where(eq(contractSignaleringenTable.id, id));
  res.json({ ok: true });
});

// GET /contract-bewaking/:id/besluit
router.get("/contract-bewaking/:id/besluit", lezen, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) return void res.status(400).json({ error: "Ongeldig contract-id" });

  const [besluit] = await db
    .select()
    .from(contractBesluitenTable)
    .where(eq(contractBesluitenTable.contractId, id))
    .orderBy(desc(contractBesluitenTable.aangemaaktOp))
    .limit(1);

  if (!besluit) return void res.json(null);

  res.json({
    id: besluit.id,
    contract_id: besluit.contractId,
    medewerker_id: besluit.medewerkerId,
    besluit: besluit.besluit,
    nieuw_eind_datum: besluit.nieuwEindDatum,
    nieuw_salaris: besluit.nieuwSalaris,
    nieuw_arbeidsduur: besluit.nieuwArbeidsduur,
    toelichting: besluit.toelichting,
    ai_samenvatting: besluit.aiSamenvatting,
    ai_aandachtspunten: besluit.aiAandachtspunten,
    ai_wettelijke_risicos: besluit.aiWettelijkeRisicos,
    status: besluit.status,
    besloten_op: besluit.beslotenOp,
    audittrail: besluit.audittrail,
    aangemaakt_op: besluit.aangemaaktOp,
    bijgewerkt_op: besluit.bijgewerktOp,
  });
});

// POST /contract-bewaking/:id/besluit
router.post("/contract-bewaking/:id/besluit", schrijven, async (req, res): Promise<void> => {
  const contractId = parseInt(String(req.params.id));
  if (isNaN(contractId)) return void res.status(400).json({ error: "Ongeldig contract-id" });

  const contract = await db.select().from(arbeidsovereenkomstenTable).where(eq(arbeidsovereenkomstenTable.id, contractId)).limit(1);
  if (!contract.length) return void res.status(404).json({ error: "Contract niet gevonden" });

  const { besluit, nieuw_eind_datum, nieuw_salaris, nieuw_arbeidsduur, toelichting } = req.body;
  if (!besluit) return void res.status(400).json({ error: "besluit is verplicht" });

  const gebruikerId = req.session.userId ?? null;
  const medewerkerId = contract[0].medewerkerId;

  const auditEntry = { actie: `Besluit vastgelegd: ${besluit}`, doorId: gebruikerId, op: new Date().toISOString(), notitie: toelichting ?? null };

  // Bestaand besluit updaten of nieuw aanmaken
  const bestaand = await db.select({ id: contractBesluitenTable.id, audittrail: contractBesluitenTable.audittrail }).from(contractBesluitenTable)
    .where(eq(contractBesluitenTable.contractId, contractId)).orderBy(desc(contractBesluitenTable.aangemaaktOp)).limit(1);

  if (bestaand.length) {
    const trail = (Array.isArray(bestaand[0].audittrail) ? bestaand[0].audittrail as unknown[] : []) as unknown[];
    await db.update(contractBesluitenTable).set({
      besluit,
      nieuwEindDatum: nieuw_eind_datum ?? null,
      nieuwSalaris: nieuw_salaris ?? null,
      nieuwArbeidsduur: nieuw_arbeidsduur ?? null,
      toelichting: toelichting ?? null,
      beslotenDoorId: gebruikerId,
      beslotenOp: new Date(),
      status: besluit === "geen_besluit" ? "in_behandeling" : "documenten_op",
      audittrail: [...trail, auditEntry],
      bijgewerktOp: new Date(),
    }).where(eq(contractBesluitenTable.id, bestaand[0].id));
    return void res.json({ id: bestaand[0].id, bijgewerkt_op: new Date() });
  }

  const [rij] = await db.insert(contractBesluitenTable).values({
    contractId,
    medewerkerId,
    besluit,
    nieuwEindDatum: nieuw_eind_datum ?? null,
    nieuwSalaris: nieuw_salaris ?? null,
    nieuwArbeidsduur: nieuw_arbeidsduur ?? null,
    toelichting: toelichting ?? null,
    beslotenDoorId: gebruikerId,
    beslotenOp: new Date(),
    status: besluit === "geen_besluit" ? "in_behandeling" : "documenten_op",
    audittrail: [auditEntry],
    aangemaaktDoorId: gebruikerId,
  }).returning();

  res.status(201).json({ id: rij.id, bijgewerkt_op: rij.bijgewerktOp });
});

// POST /contract-bewaking/:id/ai-voorbereiding
// Genereert een HR-dossier samenvatting (AI-advies, nooit juridisch bindend).
router.post("/contract-bewaking/:id/ai-voorbereiding", schrijven, async (req, res): Promise<void> => {
  const contractId = parseInt(String(req.params.id));
  if (isNaN(contractId)) return void res.status(400).json({ error: "Ongeldig contract-id" });

  const [contract] = await db
    .select({ c: arbeidsovereenkomstenTable, naam: medewerkersTable.naam, functieNaam: functiesTable.naam })
    .from(arbeidsovereenkomstenTable)
    .leftJoin(medewerkersTable, eq(arbeidsovereenkomstenTable.medewerkerId, medewerkersTable.id))
    .leftJoin(functiesTable, eq(arbeidsovereenkomstenTable.functieId, functiesTable.id))
    .where(eq(arbeidsovereenkomstenTable.id, contractId))
    .limit(1);

  if (!contract) return void res.status(404).json({ error: "Contract niet gevonden" });

  const medewerkerId = contract.c.medewerkerId;

  // Dossierdata verzamelen
  const [opleidingen, bekwaamheden, ziekte, verlofSaldi, verlofAanvragen, alleContracten] = await Promise.all([
    db.select({ naam: opleidingenTable.naam, status: medewerkerOpleidingenTable.status, verlooptOp: medewerkerOpleidingenTable.verlooptOp })
      .from(medewerkerOpleidingenTable)
      .leftJoin(opleidingenTable, eq(medewerkerOpleidingenTable.opleidingId, opleidingenTable.id))
      .where(eq(medewerkerOpleidingenTable.medewerkerId, medewerkerId)),
    db.select({ onderwerp: bekwaamhedenTable.onderwerp, niveau: bekwaamhedenTable.niveau, categorie: bekwaamhedenTable.categorie })
      .from(bekwaamhedenTable).where(eq(bekwaamhedenTable.medewerkerId, medewerkerId)),
    db.select({ start: ziekmeldingenTable.startDatum, eind: ziekmeldingenTable.eindDatum })
      .from(ziekmeldingenTable).where(eq(ziekmeldingenTable.medewerkerId, medewerkerId)),
    db.select({ soort: verlofSaldiTable.verlofsoortId, opgebouwd: verlofSaldiTable.opgebouwdUren, opgenomen: verlofSaldiTable.opgenomenUren })
      .from(verlofSaldiTable).where(eq(verlofSaldiTable.medewerkerId, medewerkerId)),
    db.select({ status: verlofAanvragenTable.status, aantalUren: verlofAanvragenTable.aantalUren })
      .from(verlofAanvragenTable).where(eq(verlofAanvragenTable.medewerkerId, medewerkerId)),
    db.select({ contracttype: arbeidsovereenkomstenTable.contracttype, startDatum: arbeidsovereenkomstenTable.startDatum, eindDatum: arbeidsovereenkomstenTable.eindDatum, status: arbeidsovereenkomstenTable.status })
      .from(arbeidsovereenkomstenTable).where(eq(arbeidsovereenkomstenTable.medewerkerId, medewerkerId)).orderBy(arbeidsovereenkomstenTable.startDatum),
  ]);

  const dagen = contract.c.eindDatum ? dagenTot(contract.c.eindDatum) : null;
  const ketenRisico = ketenregelingCheck(alleContracten);
  const aanzegRisico = aanzegtermijnCheck(contract.c);
  const ziekteFrequentie = ziekte.length;
  const verlofSaldo = verlofSaldi.reduce((s, v) => s + (v.opgebouwd ?? 0) - (v.opgenomen ?? 0), 0);

  // Wettelijke risico's samenstellen
  const risicos: string[] = [];
  if (ketenRisico) risicos.push(ketenRisico);
  if (aanzegRisico) risicos.push(aanzegRisico);
  if (alleContracten.filter((c) => c.contracttype === "bepaalde_tijd").length >= 2) {
    risicos.push(`Let op: dit is het ${alleContracten.filter((c) => c.contracttype === "bepaalde_tijd").length + 1}e tijdelijke contract. Bij nog één tijdelijk contract treedt de ketenregeling in werking.`);
  }

  if (!heeftGateway()) {
    // Geen AI beschikbaar — statische analyse
    const samenvatting = `Gespreksvoorbereiding voor ${contract.naam ?? "medewerker"} (contract eindigt ${contract.c.eindDatum ?? "onbepaald"}, nog ${dagen ?? "n.v.t."} dag(en)).

Contracthistorie: ${alleContracten.length} contract(en), waarvan ${alleContracten.filter((c) => c.contracttype === "bepaalde_tijd").length} tijdelijk.
Opleidingen: ${opleidingen.length} geregistreerd${opleidingen.filter((o) => o.status === "verlopen").length > 0 ? `, waarvan ${opleidingen.filter((o) => o.status === "verlopen").length} verlopen` : ""}.
Bekwaamheden: ${bekwaamheden.length} geregistreerd.
Ziektemeldingen: ${ziekteFrequentie} in totaal.
Verlofuren saldo: ${verlofSaldo.toFixed(1)} uur.

Aandachtspunten: ${risicos.length > 0 ? risicos.join(" | ") : "geen wettelijke risico's gedetecteerd."}`;

    const aandachtspunten = [
      ...(opleidingen.filter((o) => o.status === "verlopen").map((o) => `Opleiding verlopen: ${o.naam}`)),
      ...(ziekteFrequentie > 3 ? [`Verhoogde ziektefrequentie (${ziekteFrequentie} meldingen)`] : []),
      ...(verlofSaldo > 80 ? [`Hoog verlofstuwmeer (${verlofSaldo.toFixed(0)} uur)`] : []),
    ];

    // Opslaan in besluit
    const gebruikerId = req.session.userId ?? null;
    const bestaand = await db.select({ id: contractBesluitenTable.id }).from(contractBesluitenTable).where(eq(contractBesluitenTable.contractId, contractId)).limit(1);
    if (bestaand.length) {
      await db.update(contractBesluitenTable).set({ aiSamenvatting: samenvatting, aiAandachtspunten: aandachtspunten, aiWettelijkeRisicos: risicos, bijgewerktOp: new Date() }).where(eq(contractBesluitenTable.id, bestaand[0].id));
    } else {
      await db.insert(contractBesluitenTable).values({ contractId, medewerkerId, besluit: "geen_besluit", aiSamenvatting: samenvatting, aiAandachtspunten: aandachtspunten, aiWettelijkeRisicos: risicos, aangemaaktDoorId: gebruikerId });
    }

    return void res.json({ samenvatting, aandachtspunten, wettelijke_risicos: risicos, ai_beschikbaar: false });
  }

  // AI samenvatting
  const prompt = `Je bent een HR-adviseur. Maak een beknopte gespreksvoorbereiding voor een contractverlengingsgesprek. Dit is UITSLUITEND een informatief advies — HR en directie nemen de beslissing.

Medewerker: ${contract.naam}
Functie: ${contract.c.functieOmschrijving ?? contract.functieNaam ?? "onbekend"}
Huidig contract: ${contract.c.contracttype} van ${contract.c.startDatum} tot ${contract.c.eindDatum ?? "onbepaald"} (nog ${dagen ?? "n.v.t."} dagen)
CAO: ${contract.c.cao ?? "onbekend"}
Salaris: €${contract.c.salarisBruto ?? "onbekend"} bruto/maand
Arbeidsduur: ${contract.c.arbeidsduurPerWeek ?? "onbekend"} uur/week

Contracthistorie: ${alleContracten.map((c) => `${c.contracttype} (${c.startDatum}–${c.eindDatum ?? "heden"})`).join(", ")}
Opleidingen: ${opleidingen.map((o) => `${o.naam} (${o.status}${o.verlooptOp ? `, verloopt ${o.verlooptOp}` : ""})`).join(", ") || "geen"}
Bekwaamheden: ${bekwaamheden.slice(0, 5).map((b) => `${b.onderwerp}: ${b.niveau}`).join(", ") || "geen"}
Ziektemeldingen: ${ziekteFrequentie}
Verlofstuwmeer: ${verlofSaldo.toFixed(0)} uur
Wettelijke risico's: ${risicos.length > 0 ? risicos.join("; ") : "geen"}

Schrijf:
1. Een korte samenvatting (max. 200 woorden) voor het gesprek.
2. Een lijst van maximaal 5 concrete aandachtspunten voor HR.
3. Eventuele adviezen (verlengen/omzetten/beëindigen) met onderbouwing.

Herhaal: dit zijn ondersteunende adviezen. De beslissing ligt altijd bij HR en directie.
Schrijf alles in het Nederlands.`;

  try {
    const contractResultaat = await aiGateway.chat("default", {
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1000,
    }, undefined, {
      module: "personeel",
      functie: "contractGespreksvoorbereiding",
      entiteitstype: "contract",
      entiteitId: contractId,
      medewerker_id: medewerkerId,
      gebruikerId: req.session.userId ?? null,
      promptNaam: "contract-gespreksvoorbereiding",
      promptVersie: "1.0.0",
    });
    const samenvatting = contractResultaat.ok ? contractResultaat.inhoud : "Geen samenvatting beschikbaar.";

    const aandachtspunten = [
      ...(opleidingen.filter((o) => o.status === "verlopen").map((o) => `Opleiding verlopen: ${o.naam}`)),
      ...(ziekteFrequentie > 3 ? [`Verhoogde ziektefrequentie (${ziekteFrequentie} meldingen)`] : []),
      ...(verlofSaldo > 80 ? [`Hoog verlofstuwmeer (${verlofSaldo.toFixed(0)} uur)`] : []),
    ];

    const gebruikerId2 = req.session.userId ?? null;
    const bestaand2 = await db.select({ id: contractBesluitenTable.id }).from(contractBesluitenTable).where(eq(contractBesluitenTable.contractId, contractId)).limit(1);
    if (bestaand2.length) {
      await db.update(contractBesluitenTable).set({ aiSamenvatting: samenvatting, aiAandachtspunten: aandachtspunten, aiWettelijkeRisicos: risicos, bijgewerktOp: new Date() }).where(eq(contractBesluitenTable.id, bestaand2[0].id));
    } else {
      await db.insert(contractBesluitenTable).values({ contractId, medewerkerId, besluit: "geen_besluit", aiSamenvatting: samenvatting, aiAandachtspunten: aandachtspunten, aiWettelijkeRisicos: risicos, aangemaaktDoorId: gebruikerId2 });
    }

    res.json({ samenvatting, aandachtspunten, wettelijke_risicos: risicos, ai_beschikbaar: true });
  } catch (err) {
    res.status(500).json({ error: "AI niet beschikbaar. Probeer later opnieuw." });
  }
});

export default router;
