// KALENDER_01 — jaarkalender: collectieve vrije dagen (het enige nieuwe
// invoerbare item), eigen terugkerende afspraken, en een weergave over
// bestaande bronnen (feestdagen, verlof, APK, keuringen, verjaardagen).
// Afgeleide items worden gelezen uit hun bron en nooit gekopieerd (§3/§7).
import { Router, type Request } from "express";
import {
  db,
  collectieveVrijeDagenTable,
  kalenderAfsprakenTable,
  feestdagenTable,
  verlofAanvragenTable,
  verlofsoortenTable,
  verlofSaldiTable,
  medewerkersTable,
  voertuigenTable,
  wagenparkOnderhoudTable,
  gereedschappenTable,
  bruikleenOvereenkomstenTable,
  inspectiesTable,
  gebouwenTable,
  pbmItemsTable,
  veiligheidsmiddelenTable,
  veiligheidsmiddelInspectiesTable,
  appInstellingenTable,
  werkgeversTable,
} from "@workspace/db";
import { and, asc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { requireAuth, requireBevoegdheid, laadPermissies } from "../middlewares/auth";
import { effectieveContext } from "../utils/rol";
import { workflowService, maakTransitieContext } from "../services/workflow-engine";

const router = Router();

// ── Hulpfuncties ─────────────────────────────────────────────────────────────

/** Uren voor één collectieve dag: contracturen ÷ 5 (naar rato, §4.3). */
function urenVoorDag(contracturenPerWeek: number | null): number {
  const cw = contracturenPerWeek ?? 40;
  return Math.round((cw / 5) * 10) / 10;
}

/** Medewerkers die op deze datum in dienst zijn (§4.4.2/3). */
async function actieveMedewerkersOp(datum: string, werkgeverId: number | null) {
  return db
    .select({
      id: medewerkersTable.id,
      naam: medewerkersTable.naam,
      contracturenPerWeek: medewerkersTable.contracturenPerWeek,
    })
    .from(medewerkersTable)
    .where(and(
      eq(medewerkersTable.actief, true),
      or(isNull(medewerkersTable.inDienstSinds), lte(medewerkersTable.inDienstSinds, datum)),
      or(isNull(medewerkersTable.uitDienstPer), gte(medewerkersTable.uitDienstPer, datum)),
      ...(werkgeverId != null ? [eq(medewerkersTable.werkgeverId, werkgeverId)] : []),
    ));
}

type AfboekRapport = {
  verwerkt: number;
  uren_per_medewerker: Array<{ medewerker_id: number; naam: string; uren: number }>;
  zonder_saldo_rij: string[];
  negatief: Array<{ naam: string; saldo_uren: number }>;
  mislukt: Array<{ naam: string; reden: string }>;
};

/**
 * Boekt één collectieve dag af voor de gegeven medewerkers via het BESTAANDE
 * verlofmechanisme (§4.2): goedgekeurde verlofaanvraag per medewerker; het
 * saldo wordt door de workflow-engine aangepast (workflow-configs). Geen
 * tweede afboekmechanisme, geen directe mutatie op verlof_saldi.
 */
async function boekCollectieveDagAf(
  req: Request,
  dag: { id: number; datum: string; naam: string; verlofsoortId: number },
  medewerkers: Array<{ id: number; naam: string; contracturenPerWeek: number | null }>,
): Promise<AfboekRapport> {
  const rapport: AfboekRapport = { verwerkt: 0, uren_per_medewerker: [], zonder_saldo_rij: [], negatief: [], mislukt: [] };
  for (const m of medewerkers) {
    // Nooit dubbel: bestaat er al een aanvraag voor deze dag+medewerker, sla over.
    const [al] = await db.select({ id: verlofAanvragenTable.id }).from(verlofAanvragenTable)
      .where(and(eq(verlofAanvragenTable.collectieveDagId, dag.id), eq(verlofAanvragenTable.medewerkerId, m.id))).limit(1);
    if (al) continue;
    const uren = urenVoorDag(m.contracturenPerWeek);
    const [aanvraag] = await db.insert(verlofAanvragenTable).values({
      medewerkerId: m.id,
      verlofsoortId: dag.verlofsoortId,
      startDatum: dag.datum,
      eindDatum: dag.datum,
      aantalUren: uren,
      status: "aangevraagd",
      reden: `Collectieve vrije dag: ${dag.naam}`,
      collectieveDagId: dag.id,
    }).returning();
    const ctx = await maakTransitieContext(req, db, {
      reden: `Collectieve vrije dag: ${dag.naam}`,
      negeer_bezetting: true, // een collectieve dag geldt per definitie voor iedereen
    });
    const result = await workflowService.transiteer("verlofaanvraag", aanvraag.id, "goedgekeurd", ctx);
    if (!result.ok) {
      rapport.mislukt.push({ naam: m.naam, reden: result.error?.bericht ?? "onbekend" });
      continue;
    }
    rapport.verwerkt += 1;
    rapport.uren_per_medewerker.push({ medewerker_id: m.id, naam: m.naam, uren });
    // §4.4.1: saldo mag negatief, maar niet stil — meld wie geen saldo-rij heeft
    // (dan boekt het mechanisme niets af) en wie negatief is komen te staan.
    const jaar = Number(dag.datum.slice(0, 4));
    const [s] = await db.select().from(verlofSaldiTable)
      .where(and(eq(verlofSaldiTable.medewerkerId, m.id), eq(verlofSaldiTable.verlofsoortId, dag.verlofsoortId), eq(verlofSaldiTable.jaar, jaar))).limit(1);
    if (!s) rapport.zonder_saldo_rij.push(m.naam);
    else if (s.saldoUren < 0) rapport.negatief.push({ naam: m.naam, saldo_uren: s.saldoUren });
  }
  return rapport;
}

/**
 * §4.4.2 — bij indiensttreding vóór een al vastgelegde collectieve dag wordt
 * die dag alsnog aangemaakt. Aan te roepen vanuit het medewerker-aanmaakpad.
 */
export async function verwerkCollectieveDagenVoorNieuweMedewerker(req: Request, medewerkerId: number): Promise<void> {
  const [m] = await db.select().from(medewerkersTable).where(eq(medewerkersTable.id, medewerkerId)).limit(1);
  if (!m || !m.actief) return;
  const vandaag = new Date().toISOString().slice(0, 10);
  const dagen = await db.select().from(collectieveVrijeDagenTable)
    .where(and(
      gte(collectieveVrijeDagenTable.datum, m.inDienstSinds ?? vandaag),
      gte(collectieveVrijeDagenTable.datum, vandaag),
      or(isNull(collectieveVrijeDagenTable.werkgeverId), ...(m.werkgeverId != null ? [eq(collectieveVrijeDagenTable.werkgeverId, m.werkgeverId)] : [])),
    ));
  for (const dag of dagen) {
    if (m.uitDienstPer && m.uitDienstPer < dag.datum) continue;
    await boekCollectieveDagAf(req, dag, [{ id: m.id, naam: m.naam, contracturenPerWeek: m.contracturenPerWeek }]);
  }
}

// ── Collectieve vrije dagen ──────────────────────────────────────────────────

router.get("/collectieve-vrije-dagen", requireAuth, laadPermissies, async (req, res): Promise<void> => {
  const jaar = Number(req.query.jaar) || new Date().getFullYear();
  // Het afboekrapport bevat namen en saldi van medewerkers: alleen tonen aan
  // wie personeel mag lezen. UI-gating is geen access control.
  const magRapport = req.permissies?.heeftModuleRecht("personeel", 1) ?? false;
  const rijen = await db
    .select({
      dag: collectieveVrijeDagenTable,
      verlofsoortNaam: verlofsoortenTable.naam,
      werkgeverNaam: werkgeversTable.naam,
    })
    .from(collectieveVrijeDagenTable)
    .leftJoin(verlofsoortenTable, eq(collectieveVrijeDagenTable.verlofsoortId, verlofsoortenTable.id))
    .leftJoin(werkgeversTable, eq(collectieveVrijeDagenTable.werkgeverId, werkgeversTable.id))
    .where(and(gte(collectieveVrijeDagenTable.datum, `${jaar}-01-01`), lte(collectieveVrijeDagenTable.datum, `${jaar}-12-31`)))
    .orderBy(asc(collectieveVrijeDagenTable.datum));
  res.json(rijen.map(({ dag, verlofsoortNaam, werkgeverNaam }) => ({
    id: dag.id,
    datum: dag.datum,
    naam: dag.naam,
    werkgever_id: dag.werkgeverId,
    werkgever_naam: werkgeverNaam,
    verlofsoort_id: dag.verlofsoortId,
    verlofsoort_naam: verlofsoortNaam,
    afboek_rapport: magRapport ? (dag.afboekRapport ?? null) : null,
  })));
});

// Meerdere dagen in één keer vastleggen (§4.1) en direct afboeken (§4.2).
router.post("/collectieve-vrije-dagen", requireBevoegdheid("personeel", 2), async (req, res): Promise<void> => {
  const { dagen, verlofsoort_id, werkgever_id } = req.body as {
    dagen?: Array<{ datum?: string; naam?: string }>;
    verlofsoort_id?: number;
    werkgever_id?: number | null;
  };
  if (!Array.isArray(dagen) || dagen.length === 0) return void res.status(400).json({ error: "dagen is verplicht (minimaal één)" });
  if (!verlofsoort_id) return void res.status(400).json({ error: "verlofsoort_id is verplicht" });
  const [soort] = await db.select().from(verlofsoortenTable).where(eq(verlofsoortenTable.id, Number(verlofsoort_id))).limit(1);
  if (!soort) return void res.status(400).json({ error: "Verlofsoort niet gevonden" });
  if (!soort.collectief) return void res.status(400).json({ error: "Deze verlofsoort is niet gemarkeerd als collectief (verlofsoorten.collectief)" });
  for (const d of dagen) {
    if (!d.datum || !/^\d{4}-\d{2}-\d{2}$/.test(d.datum) || !d.naam?.trim()) {
      return void res.status(400).json({ error: "Elke dag heeft een datum (jjjj-mm-dd) en naam nodig" });
    }
  }
  const werkgeverId = werkgever_id != null ? Number(werkgever_id) : null;
  const userId = (await effectieveContext(req)).userId;
  const resultaten: Array<Record<string, unknown>> = [];
  for (const d of dagen) {
    const [bestaat] = await db.select({ id: collectieveVrijeDagenTable.id }).from(collectieveVrijeDagenTable)
      .where(and(
        eq(collectieveVrijeDagenTable.datum, d.datum!),
        werkgeverId == null ? isNull(collectieveVrijeDagenTable.werkgeverId) : eq(collectieveVrijeDagenTable.werkgeverId, werkgeverId),
      )).limit(1);
    if (bestaat) return void res.status(409).json({ error: `Er is al een collectieve vrije dag op ${d.datum}` });
    const [dag] = await db.insert(collectieveVrijeDagenTable).values({
      datum: d.datum!,
      naam: d.naam!.trim(),
      verlofsoortId: Number(verlofsoort_id),
      werkgeverId,
      aangemaaktDoorId: userId ?? null,
    }).returning();
    const medewerkers = await actieveMedewerkersOp(dag.datum, werkgeverId);
    const rapport = await boekCollectieveDagAf(req, dag, medewerkers);
    await db.update(collectieveVrijeDagenTable)
      .set({ afboekRapport: rapport as unknown as Record<string, unknown>, bijgewerktOp: new Date() })
      .where(eq(collectieveVrijeDagenTable.id, dag.id));
    resultaten.push({ id: dag.id, datum: dag.datum, naam: dag.naam, rapport });
  }
  res.status(201).json({
    dagen: resultaten,
    // §4.3 — de beperking wordt gemeld, niet stil opgelost.
    beperking: "Voor deeltijders wordt naar rato afgeboekt (contracturen ÷ 5). Werkt iemand op deze dag niet, corrigeer dat dan met de hand via een saldocorrectie.",
  });
});

// §4.4.4 — terugdraaien: aanvragen intrekken en saldi terugboeken via
// hetzelfde mechanisme, in één handeling, met een overzicht.
router.delete("/collectieve-vrije-dagen/:id", requireBevoegdheid("personeel", 2), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [dag] = await db.select().from(collectieveVrijeDagenTable).where(eq(collectieveVrijeDagenTable.id, id)).limit(1);
  if (!dag) return void res.status(404).json({ error: "Collectieve vrije dag niet gevonden" });
  const aanvragen = await db
    .select({ a: verlofAanvragenTable, naam: medewerkersTable.naam })
    .from(verlofAanvragenTable)
    .innerJoin(medewerkersTable, eq(verlofAanvragenTable.medewerkerId, medewerkersTable.id))
    .where(eq(verlofAanvragenTable.collectieveDagId, id));
  const teruggedraaid: Array<{ naam: string; uren: number }> = [];
  const mislukt: Array<{ naam: string; reden: string }> = [];
  for (const { a, naam } of aanvragen) {
    if (a.status !== "goedgekeurd") continue;
    const ctx = await maakTransitieContext(req, db, { reden: `Collectieve vrije dag verwijderd: ${dag.naam}` });
    const result = await workflowService.transiteer("verlofaanvraag", a.id, "ingetrokken", ctx);
    if (result.ok) teruggedraaid.push({ naam, uren: a.aantalUren });
    else mislukt.push({ naam, reden: result.error?.bericht ?? "onbekend" });
  }
  if (mislukt.length) {
    return void res.status(409).json({ error: "Niet alle verlofaanvragen konden worden ingetrokken; de dag is niet verwijderd.", mislukt, teruggedraaid });
  }
  await db.delete(collectieveVrijeDagenTable).where(eq(collectieveVrijeDagenTable.id, id));
  res.json({ verwijderd: true, teruggedraaid });
});

// ── Eigen terugkerende afspraken (§5.1) ──────────────────────────────────────

const HERHALINGEN = ["geen", "jaarlijks", "halfjaarlijks", "kwartaal"] as const;
const HERHAAL_MAANDEN: Record<string, number> = { jaarlijks: 12, halfjaarlijks: 6, kwartaal: 3 };

router.get("/kalender-afspraken", requireAuth, async (_req, res): Promise<void> => {
  const rijen = await db.select().from(kalenderAfsprakenTable).orderBy(asc(kalenderAfsprakenTable.startDatum));
  res.json(rijen.map((a) => ({
    id: a.id, titel: a.titel, omschrijving: a.omschrijving, start_datum: a.startDatum,
    herhaling: a.herhaling, eind_datum: a.eindDatum, aantal_herhalingen: a.aantalHerhalingen, werkgever_id: a.werkgeverId,
  })));
});

router.post("/kalender-afspraken", requireBevoegdheid("personeel", 2), async (req, res): Promise<void> => {
  const { titel, omschrijving, start_datum, herhaling, eind_datum, aantal_herhalingen, werkgever_id } = req.body;
  if (!titel?.trim()) return void res.status(400).json({ error: "titel is verplicht" });
  if (!start_datum || !/^\d{4}-\d{2}-\d{2}$/.test(start_datum)) return void res.status(400).json({ error: "start_datum (jjjj-mm-dd) is verplicht" });
  const h = herhaling ?? "jaarlijks";
  if (!HERHALINGEN.includes(h)) return void res.status(400).json({ error: `herhaling moet één van ${HERHALINGEN.join(", ")} zijn` });
  const [rij] = await db.insert(kalenderAfsprakenTable).values({
    titel: String(titel).trim(),
    omschrijving: omschrijving ? String(omschrijving) : null,
    startDatum: start_datum,
    herhaling: h,
    eindDatum: eind_datum ?? null,
    aantalHerhalingen: aantal_herhalingen != null ? Number(aantal_herhalingen) : null,
    werkgeverId: werkgever_id != null ? Number(werkgever_id) : null,
  }).returning();
  res.status(201).json({ id: rij.id });
});

router.delete("/kalender-afspraken/:id", requireBevoegdheid("personeel", 2), async (req, res): Promise<void> => {
  const rijen = await db.delete(kalenderAfsprakenTable).where(eq(kalenderAfsprakenTable.id, Number(req.params.id))).returning({ id: kalenderAfsprakenTable.id });
  if (!rijen.length) return void res.status(404).json({ error: "Afspraak niet gevonden" });
  res.status(204).end();
});

/** Vouw een terugkerende afspraak uit binnen een jaar. */
function herhalingenBinnenJaar(a: typeof kalenderAfsprakenTable.$inferSelect, jaar: number): string[] {
  const uit: string[] = [];
  const stapMaanden = HERHAAL_MAANDEN[a.herhaling];
  let d = new Date(a.startDatum + "T00:00:00Z");
  let n = 0;
  const maxDatum = a.eindDatum ? new Date(a.eindDatum + "T00:00:00Z") : new Date(Date.UTC(jaar + 1, 0, 1));
  const maxN = a.aantalHerhalingen ?? 1000;
  while (d.getTime() < Date.UTC(jaar + 1, 0, 1) && d <= maxDatum && n < maxN) {
    if (d.getUTCFullYear() === jaar) uit.push(d.toISOString().slice(0, 10));
    n += 1;
    if (!stapMaanden) break; // herhaling "geen"
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + stapMaanden, d.getUTCDate()));
  }
  return uit;
}

// ── De kalenderweergave (§5) ─────────────────────────────────────────────────

type KalenderItem = {
  datum: string;          // jjjj-mm-dd
  soort: "feestdag" | "collectief" | "vakantie" | "keuring" | "verjaardag" | "afspraak";
  titel: string;
  omschrijving?: string | null;
  bron: string;           // brontabel, voor de doorklik (§3)
  link?: string | null;   // pad in de webapp naar de bron
  werkgever_id?: number | null;
};

router.get("/kalender", requireAuth, laadPermissies, async (req, res): Promise<void> => {
  const jaar = Number(req.query.jaar) || new Date().getFullYear();
  const werkgeverFilter = req.query.werkgever_id ? Number(req.query.werkgever_id) : null;
  const van = `${jaar}-01-01`, tot = `${jaar}-12-31`;
  const p = req.permissies;
  const ctx = await effectieveContext(req);
  const userId = ctx.userId;
  const items: KalenderItem[] = [];

  // Eigen medewerker-rij (voor "eigen verlof" zonder personeelsrecht)
  const [eigenMedewerker] = userId
    ? await db.select({ id: medewerkersTable.id }).from(medewerkersTable).where(eq(medewerkersTable.gebruikerId, userId)).limit(1)
    : [];

  // 1. Feestdagen — voor iedereen (§5).
  const feest = await db.select().from(feestdagenTable)
    .where(and(eq(feestdagenTable.jaar, jaar), ...(werkgeverFilter != null ? [or(isNull(feestdagenTable.werkgeverId), eq(feestdagenTable.werkgeverId, werkgeverFilter))] : [])));
  for (const f of feest) items.push({ datum: f.datum, soort: "feestdag", titel: f.naam, bron: "feestdagen", werkgever_id: f.werkgeverId });

  // 2. Collectieve vrije dagen — voor iedereen (§5).
  const collectief = await db.select().from(collectieveVrijeDagenTable)
    .where(and(gte(collectieveVrijeDagenTable.datum, van), lte(collectieveVrijeDagenTable.datum, tot),
      ...(werkgeverFilter != null ? [or(isNull(collectieveVrijeDagenTable.werkgeverId), eq(collectieveVrijeDagenTable.werkgeverId, werkgeverFilter))] : [])));
  for (const c of collectief) items.push({ datum: c.datum, soort: "collectief", titel: c.naam, bron: "collectieve_vrije_dagen", werkgever_id: c.werkgeverId });

  // 3. Vakanties — bestaande rechten: met personeel:1 het hele overzicht
  // (zelfde grens als GET /verlofaanvragen), anders alleen het eigen verlof
  // (zelfde grens als GET /mijn/verlofaanvragen).
  const magAlleVerlof = p?.heeftModuleRecht("personeel", 1) ?? false;
  if (magAlleVerlof || eigenMedewerker) {
    const verlof = await db
      .select({ a: verlofAanvragenTable, naam: medewerkersTable.naam, soortNaam: verlofsoortenTable.naam })
      .from(verlofAanvragenTable)
      .innerJoin(medewerkersTable, eq(verlofAanvragenTable.medewerkerId, medewerkersTable.id))
      .leftJoin(verlofsoortenTable, eq(verlofAanvragenTable.verlofsoortId, verlofsoortenTable.id))
      .where(and(
        eq(verlofAanvragenTable.status, "goedgekeurd"),
        lte(verlofAanvragenTable.startDatum, tot),
        gte(verlofAanvragenTable.eindDatum, van),
        isNull(verlofAanvragenTable.collectieveDagId), // collectieve dagen staan al als soort "collectief"
        ...(magAlleVerlof ? [] : [eq(verlofAanvragenTable.medewerkerId, eigenMedewerker!.id)]),
      ));
    for (const { a, naam, soortNaam } of verlof) {
      items.push({
        datum: a.startDatum, soort: "vakantie",
        titel: `${naam} — ${soortNaam ?? "verlof"}`,
        omschrijving: a.startDatum === a.eindDatum ? null : `t/m ${a.eindDatum}`,
        bron: "verlofaanvragen", link: magAlleVerlof ? "/personeel/verlof" : "/mijn-verlof",
      });
    }
  }

  // 4. Keuringen en onderhoud — wagenpark:1 resp. gereedschappen:1 (§5);
  // zonder die rechten alleen de eigen auto en het eigen bruikleen (§5b).
  const magWagenpark = p?.heeftModuleRecht("wagenpark", 1) ?? false;
  const voertuigen = await db.select().from(voertuigenTable)
    .where(and(eq(voertuigenTable.gearchiveerd, false), ...(magWagenpark || userId == null ? [] : [eq(voertuigenTable.chauffeurId, userId)])));
  if (magWagenpark || userId != null) {
    for (const v of voertuigen) {
      const apk = v.apkDatum?.toISOString().slice(0, 10);
      if (apk && apk >= van && apk <= tot) {
        items.push({ datum: apk, soort: "keuring", titel: `APK ${v.kenteken ?? ""}`.trim(), bron: "voertuigen", link: `/wagenpark/${v.id}` });
      }
    }
  }
  if (magWagenpark && voertuigen.length) {
    const onderhoud = await db.select().from(wagenparkOnderhoudTable)
      .where(and(
        inArray(wagenparkOnderhoudTable.voertuigId, voertuigen.map((v) => v.id)),
        sql`${wagenparkOnderhoudTable.geplandDatum} IS NOT NULL`,
        sql`${wagenparkOnderhoudTable.afgerondDatum} IS NULL`,
      ));
    const kentekenVan = new Map(voertuigen.map((v) => [v.id, v.kenteken]));
    for (const o of onderhoud) {
      const d = o.geplandDatum ? o.geplandDatum.toISOString().slice(0, 10) : null;
      if (d && d >= van && d <= tot) {
        items.push({ datum: d, soort: "keuring", titel: `${o.type} ${kentekenVan.get(o.voertuigId) ?? ""}`.trim(), omschrijving: o.omschrijving, bron: "wagenpark_onderhoud", link: `/wagenpark/${o.voertuigId}` });
      }
    }
  }

  const magGereedschap = p?.heeftModuleRecht("gereedschappen", 1) ?? false;
  {
    // Zonder recht: alleen gereedschap dat aan deze medewerker in bruikleen is (§5b).
    let eigenGereedschapIds: number[] | null = null;
    if (!magGereedschap) {
      eigenGereedschapIds = eigenMedewerker
        ? (await db.select({ id: bruikleenOvereenkomstenTable.gereedschapId }).from(bruikleenOvereenkomstenTable)
            .where(and(eq(bruikleenOvereenkomstenTable.medewerkerId, eigenMedewerker.id), isNull(bruikleenOvereenkomstenTable.datumInname)))).map((r) => r.id)
        : [];
    }
    if (magGereedschap || (eigenGereedschapIds && eigenGereedschapIds.length)) {
      const gereedschappen = await db.select().from(gereedschappenTable)
        .where(and(
          eq(gereedschappenTable.keuringsplichtig, true),
          ...(eigenGereedschapIds ? [inArray(gereedschappenTable.id, eigenGereedschapIds)] : []),
        ));
      for (const g of gereedschappen) {
        const d = g.keuringVervalDatum?.toISOString().slice(0, 10) ?? (g.volgendeKeuring ? String(g.volgendeKeuring).slice(0, 10) : null);
        if (d && d >= van && d <= tot) {
          items.push({ datum: d, soort: "keuring", titel: `Keuring ${g.omschrijving ?? g.volgnummer}${g.keuringNorm ? ` (${g.keuringNorm})` : ""}`, bron: "gereedschappen", link: `/gereedschappen/${g.id}` });
        }
      }
    }
  }

  // Gebouw-inspecties (gepland) — aanname: zichtbaar vanaf gebouwen:1 (gemeld in §8-rapport).
  if (p?.heeftModuleRecht("gebouwen", 1)) {
    const inspecties = await db
      .select({ i: inspectiesTable, gebouwNaam: gebouwenTable.naam })
      .from(inspectiesTable)
      .leftJoin(gebouwenTable, eq(inspectiesTable.gebouwId, gebouwenTable.id))
      .where(and(eq(inspectiesTable.status, "gepland"), gte(inspectiesTable.geplandeDatum, van), lte(inspectiesTable.geplandeDatum, tot)));
    for (const { i, gebouwNaam } of inspecties) {
      items.push({ datum: i.geplandeDatum!, soort: "keuring", titel: `Inspectie ${gebouwNaam ?? ""}`.trim(), omschrijving: i.type, bron: "inspecties", link: i.gebouwId ? `/gebouwen/${i.gebouwId}` : null });
    }
  }

  // PBM en veiligheidsmiddelen: volgende keuring afgeleid uit laatste controle +
  // interval — gelezen uit de bron, niet gekopieerd. Gate: gereedschappen:1 (aanname).
  if (magGereedschap) {
    const afgeleiden: Array<{ naam: string; laatste: string | null; interval: number | null; bron: string; link: string }> = [];
    for (const i of await db.select().from(pbmItemsTable).where(eq(pbmItemsTable.status, "actief"))) {
      const naam = [i.type, i.merk, i.medewerkerNaam ? `(${i.medewerkerNaam})` : null].filter(Boolean).join(" ");
      afgeleiden.push({ naam: `PBM-keuring ${naam}`, laatste: i.laatsteControle, interval: i.keuringsIntervalMaanden, bron: "pbm_items", link: "/veiligheid" });
    }
    // Veiligheidsmiddelen hebben geen eigen laatste-controle-veld; de laatste
    // inspectiedatum komt uit de inspectietabel (bron, niet gekopieerd).
    const laatsteInspecties = await db
      .select({ middelId: veiligheidsmiddelInspectiesTable.middelId, laatste: sql<string>`max(${veiligheidsmiddelInspectiesTable.datum})` })
      .from(veiligheidsmiddelInspectiesTable)
      .groupBy(veiligheidsmiddelInspectiesTable.middelId);
    const laatsteVan = new Map(laatsteInspecties.map((r) => [r.middelId, r.laatste]));
    for (const m of await db.select().from(veiligheidsmiddelenTable).where(eq(veiligheidsmiddelenTable.status, "actief"))) {
      afgeleiden.push({ naam: `Keuring ${m.naam}`, laatste: laatsteVan.get(m.id) ?? m.aanschafDatum, interval: m.keuringsIntervalMaanden, bron: "veiligheidsmiddelen", link: "/veiligheid" });
    }
    for (const a of afgeleiden) {
      if (!a.laatste || !a.interval) continue;
      const basis = new Date(a.laatste + "T00:00:00Z");
      const volgende = new Date(Date.UTC(basis.getUTCFullYear(), basis.getUTCMonth() + a.interval, basis.getUTCDate())).toISOString().slice(0, 10);
      if (volgende >= van && volgende <= tot) items.push({ datum: volgende, soort: "keuring", titel: a.naam, bron: a.bron, link: a.link });
    }
  }

  // 5. Verjaardagen (§5.0) — opt-in onverkort; alleen dag en maand, nooit
  // jaar of leeftijd, en zonder opt-in ook geen naamloze markering.
  const [instelling] = await db.select({ aan: appInstellingenTable.momentsVerjaardagIngeschakeld }).from(appInstellingenTable).limit(1);
  if (instelling?.aan ?? true) {
    const jarigen = await db
      .select({ naam: medewerkersTable.naam, geboortedatum: medewerkersTable.geboortedatum })
      .from(medewerkersTable)
      .where(and(eq(medewerkersTable.actief, true), eq(medewerkersTable.verjaardagZichtbaar, true), isNull(medewerkersTable.afgeschermdOp), sql`${medewerkersTable.geboortedatum} IS NOT NULL`));
    for (const j of jarigen) {
      const maandDag = j.geboortedatum!.slice(5, 10); // alleen mm-dd; het jaar komt de response nooit in
      if (!/^\d{2}-\d{2}$/.test(maandDag)) continue;
      items.push({ datum: `${jaar}-${maandDag}`, soort: "verjaardag", titel: `🎂 ${j.naam}`, bron: "medewerkers" });
    }
  }

  // 6. Eigen terugkerende afspraken (§5.1) — voor iedereen zichtbaar.
  const afspraken = await db.select().from(kalenderAfsprakenTable)
    .where(werkgeverFilter != null ? or(isNull(kalenderAfsprakenTable.werkgeverId), eq(kalenderAfsprakenTable.werkgeverId, werkgeverFilter)) : undefined);
  for (const a of afspraken) {
    for (const d of herhalingenBinnenJaar(a, jaar)) {
      items.push({ datum: d, soort: "afspraak", titel: a.titel, omschrijving: a.omschrijving, bron: "kalender_afspraken", werkgever_id: a.werkgeverId });
    }
  }

  items.sort((a, b) => a.datum.localeCompare(b.datum));
  res.json({ jaar, items });
});

export default router;
