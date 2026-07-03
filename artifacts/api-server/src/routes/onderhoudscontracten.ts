import { Router } from "express";
import { db } from "@workspace/db";
import {
  onderhoudscontractenTable,
  werkbonnenTable,
  gebouwenTable,
} from "@workspace/db";
import { eq, and, lte, gte, sql, count } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { logActiviteit } from "../lib/activiteit";

const router = Router();
const lezen = requireBevoegdheid("onderhoud", 1);
const schrijven = requireBevoegdheid("onderhoud", 2);
const aanmaken = requireBevoegdheid("onderhoud", 3);
const verwijderen = requireBevoegdheid("onderhoud", 4);

async function volgendContractnummer(): Promise<string> {
  const jaar = new Date().getFullYear();
  const prefix = `OC-${jaar}-`;
  const [row] = await db
    .select({ max: sql<string>`max(${onderhoudscontractenTable.contractnummer})` })
    .from(onderhoudscontractenTable)
    .where(sql`${onderhoudscontractenTable.contractnummer} like ${prefix + "%"}`);
  const huidig = row?.max ? parseInt(row.max.split("-")[2] ?? "0", 10) : 0;
  return `${prefix}${String(huidig + 1).padStart(3, "0")}`;
}

async function mapContract(c: typeof onderhoudscontractenTable.$inferSelect & { werkbonnen_telling?: number }) {
  const gebouw = c.gebouwId
    ? await db
        .select({ naam: gebouwenTable.naam })
        .from(gebouwenTable)
        .where(eq(gebouwenTable.id, c.gebouwId))
        .then((r) => r[0])
    : null;

  return {
    id: c.id,
    contractnummer: c.contractnummer,
    gebouw_id: c.gebouwId,
    gebouw_naam: gebouw?.naam ?? null,
    opdrachtgever: c.opdrachtgever,
    contactpersoon_naam: c.contactpersoonNaam,
    contactpersoon_email: c.contactpersoonEmail,
    contactpersoon_telefoon: c.contactpersoonTelefoon,
    contracttype: c.contracttype,
    ingangsdatum: c.ingangsdatum,
    einddatum: c.einddatum,
    looptijd_maanden: c.looptijdMaanden,
    automatische_verlenging: c.automatischeVerlenging,
    opzegtermijn_maanden: c.opzegtermijnMaanden,
    indexering: c.indexering,
    indexering_percentage: c.indexeringPercentage !== null ? parseFloat(c.indexeringPercentage as string) : null,
    contractwaarde: c.contractwaarde !== null ? parseFloat(c.contractwaarde as string) : null,
    facturatie_frequentie: c.facturatieFrequentie,
    onderhouds_frequentie: c.onderhoudsFrequentie,
    eerstvolgende_onderhoud: c.eerstvolgendOnderhoud,
    laatste_onderhoud: c.laatste_onderhoud,
    status: c.status,
    notities: c.notities,
    aangemaakt_door_id: c.aangemaaktDoorId,
    aangemaakt_op: c.aangemaaktOp.toISOString(),
    bijgewerkt_op: c.bijgewerktOp.toISOString(),
    werkbonnen_telling: c.werkbonnen_telling ?? null,
  };
}

// GET /onderhoudscontracten/statistieken  (vóór /:id zodat niet als id wordt geparsed)
router.get("/onderhoudscontracten/statistieken", lezen, async (req, res) => {
  try {
    const nu = new Date();
    const over30 = new Date(nu);
    over30.setDate(over30.getDate() + 30);
    const over30Str = over30.toISOString().split("T")[0];
    const nuStr = nu.toISOString().split("T")[0];

    const contracten = await db.select().from(onderhoudscontractenTable);

    const actief = contracten.filter((c) => c.status === "actief").length;
    const concept = contracten.filter((c) => c.status === "concept").length;
    const verlopen = contracten.filter((c) => c.status === "verlopen" || (c.einddatum != null && c.einddatum < nuStr)).length;
    const aflopend = contracten.filter(
      (c) =>
        c.status === "actief" &&
        c.einddatum != null &&
        c.einddatum >= nuStr &&
        c.einddatum <= over30Str,
    ).length;

    const contractwaardeTotaal = contracten.reduce(
      (som, c) => som + (c.contractwaarde ? parseFloat(c.contractwaarde as string) : 0),
      0,
    );

    const maandStr = nuStr.substring(0, 7);
    const onderhoudDezeMaand = contracten.filter(
      (c) => c.eerstvolgendOnderhoud != null && c.eerstvolgendOnderhoud.startsWith(maandStr),
    ).length;

    const achterstallig = contracten.filter(
      (c) =>
        c.status === "actief" &&
        c.eerstvolgendOnderhoud != null &&
        c.eerstvolgendOnderhoud < nuStr,
    ).length;

    const [wbRow] = await db
      .select({ open: count() })
      .from(werkbonnenTable)
      .where(sql`${werkbonnenTable.status} in ('gepland', 'in_uitvoering')`);

    res.json({
      totaal: contracten.length,
      actief,
      concept,
      aflopend_30_dagen: aflopend,
      verlopen,
      contractwaarde_totaal: contractwaardeTotaal,
      onderhoud_deze_maand: onderhoudDezeMaand,
      achterstallig,
      werkbonnen_open: wbRow?.open ?? 0,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /onderhoudscontracten
router.get("/onderhoudscontracten", lezen, async (req, res) => {
  try {
    const { gebouw_id, status } = req.query;

    let contracten = await db.select().from(onderhoudscontractenTable);

    if (gebouw_id) contracten = contracten.filter((c) => c.gebouwId === parseInt(gebouw_id as string));
    if (status) contracten = contracten.filter((c) => c.status === status);

    const tellingen = await db
      .select({
        contractId: werkbonnenTable.contractId,
        telling: count(),
      })
      .from(werkbonnenTable)
      .groupBy(werkbonnenTable.contractId);

    const telMap = new Map(tellingen.map((t) => [t.contractId, t.telling]));

    const result = await Promise.all(
      contracten.map((c) =>
        mapContract({ ...c, werkbonnen_telling: telMap.get(c.id) ?? 0 }),
      ),
    );
    res.json(result);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /onderhoudscontracten
router.post("/onderhoudscontracten", aanmaken, async (req, res) => {
  try {
    const {
      gebouw_id, opdrachtgever, contactpersoon_naam, contactpersoon_email,
      contactpersoon_telefoon, contracttype, ingangsdatum, einddatum,
      looptijd_maanden, automatische_verlenging, opzegtermijn_maanden,
      indexering, indexering_percentage, contractwaarde, facturatie_frequentie,
      onderhouds_frequentie, eerstvolgende_onderhoud, laatste_onderhoud,
      status, notities,
    } = req.body;

    if (!contracttype || !facturatie_frequentie || !onderhouds_frequentie || !indexering) {
      return res.status(400).json({ error: "contracttype, facturatie_frequentie, onderhouds_frequentie en indexering zijn verplicht" });
    }

    const contractnummer = await volgendContractnummer();

    const [c] = await db
      .insert(onderhoudscontractenTable)
      .values({
        contractnummer,
        gebouwId: gebouw_id ?? null,
        opdrachtgever: opdrachtgever ?? null,
        contactpersoonNaam: contactpersoon_naam ?? null,
        contactpersoonEmail: contactpersoon_email ?? null,
        contactpersoonTelefoon: contactpersoon_telefoon ?? null,
        contracttype,
        ingangsdatum: ingangsdatum ?? null,
        einddatum: einddatum ?? null,
        looptijdMaanden: looptijd_maanden ?? null,
        automatischeVerlenging: automatische_verlenging ?? false,
        opzegtermijnMaanden: opzegtermijn_maanden ?? null,
        indexering: indexering ?? "geen",
        indexeringPercentage: indexering_percentage ?? null,
        contractwaarde: contractwaarde ?? null,
        facturatieFrequentie: facturatie_frequentie ?? "jaarlijks_vooraf",
        onderhoudsFrequentie: onderhouds_frequentie ?? "jaarlijks",
        eerstvolgendOnderhoud: eerstvolgende_onderhoud ?? null,
        laatste_onderhoud: laatste_onderhoud ?? null,
        status: status ?? "concept",
        notities: notities ?? null,
        aangemaaktDoorId: req.session.userId,
      })
      .returning();

    await logActiviteit({
      type: "onderhoudscontract_aangemaakt",
      omschrijving: `Onderhoudscontract aangemaakt: ${contractnummer}`,
      gebouwId: gebouw_id ?? null,
      gebruikerId: req.session.userId,
    });

    res.status(201).json(await mapContract(c));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /onderhoudscontracten/:id
router.get("/onderhoudscontracten/:id", lezen, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) return res.status(400).json({ error: "Ongeldig id" });

    const [c] = await db
      .select()
      .from(onderhoudscontractenTable)
      .where(eq(onderhoudscontractenTable.id, id));

    if (!c) return res.status(404).json({ error: "Contract niet gevonden" });

    const [telRow] = await db
      .select({ telling: count() })
      .from(werkbonnenTable)
      .where(eq(werkbonnenTable.contractId, id));

    res.json(await mapContract({ ...c, werkbonnen_telling: telRow?.telling ?? 0 }));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// PATCH /onderhoudscontracten/:id
router.patch("/onderhoudscontracten/:id", schrijven, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) return res.status(400).json({ error: "Ongeldig id" });

    const {
      gebouw_id, opdrachtgever, contactpersoon_naam, contactpersoon_email,
      contactpersoon_telefoon, contracttype, ingangsdatum, einddatum,
      looptijd_maanden, automatische_verlenging, opzegtermijn_maanden,
      indexering, indexering_percentage, contractwaarde, facturatie_frequentie,
      onderhouds_frequentie, eerstvolgende_onderhoud, laatste_onderhoud,
      status, notities,
    } = req.body;

    const [c] = await db
      .update(onderhoudscontractenTable)
      .set({
        ...(gebouw_id !== undefined && { gebouwId: gebouw_id }),
        ...(opdrachtgever !== undefined && { opdrachtgever }),
        ...(contactpersoon_naam !== undefined && { contactpersoonNaam: contactpersoon_naam }),
        ...(contactpersoon_email !== undefined && { contactpersoonEmail: contactpersoon_email }),
        ...(contactpersoon_telefoon !== undefined && { contactpersoonTelefoon: contactpersoon_telefoon }),
        ...(contracttype !== undefined && { contracttype }),
        ...(ingangsdatum !== undefined && { ingangsdatum }),
        ...(einddatum !== undefined && { einddatum }),
        ...(looptijd_maanden !== undefined && { looptijdMaanden: looptijd_maanden }),
        ...(automatische_verlenging !== undefined && { automatischeVerlenging: automatische_verlenging }),
        ...(opzegtermijn_maanden !== undefined && { opzegtermijnMaanden: opzegtermijn_maanden }),
        ...(indexering !== undefined && { indexering }),
        ...(indexering_percentage !== undefined && { indexeringPercentage: indexering_percentage }),
        ...(contractwaarde !== undefined && { contractwaarde }),
        ...(facturatie_frequentie !== undefined && { facturatieFrequentie: facturatie_frequentie }),
        ...(onderhouds_frequentie !== undefined && { onderhoudsFrequentie: onderhouds_frequentie }),
        ...(eerstvolgende_onderhoud !== undefined && { eerstvolgendOnderhoud: eerstvolgende_onderhoud }),
        ...(laatste_onderhoud !== undefined && { laatste_onderhoud }),
        ...(status !== undefined && { status }),
        ...(notities !== undefined && { notities }),
        bijgewerktOp: new Date(),
      })
      .where(eq(onderhoudscontractenTable.id, id))
      .returning();

    if (!c) return res.status(404).json({ error: "Contract niet gevonden" });
    res.json(await mapContract(c));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// DELETE /onderhoudscontracten/:id
router.delete("/onderhoudscontracten/:id", verwijderen, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) return res.status(400).json({ error: "Ongeldig id" });
    await db.delete(onderhoudscontractenTable).where(eq(onderhoudscontractenTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /onderhoudscontracten/:id/werkbonnen-genereren
router.post("/onderhoudscontracten/:id/werkbonnen-genereren", schrijven, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) return res.status(400).json({ error: "Ongeldig contract-id" });

    const [contract] = await db.select().from(onderhoudscontractenTable).where(eq(onderhoudscontractenTable.id, id));
    if (!contract) return res.status(404).json({ error: "Contract niet gevonden" });

    const body = req.body as { jaar?: number; type?: string };
    const planJaar = body.jaar ?? new Date().getFullYear();
    const werkbonType = body.type ?? contract.contracttype ?? "preventief";

    type DatumPunt = { kwartaal: string; datum: string };
    const datums: DatumPunt[] = [];
    const freq = contract.onderhoudsFrequentie;

    if (freq === "maandelijks") {
      const kwartalen = ["Q1","Q1","Q1","Q2","Q2","Q2","Q3","Q3","Q3","Q4","Q4","Q4"];
      for (let m = 0; m < 12; m++) {
        const d = new Date(planJaar, m, 15);
        datums.push({ kwartaal: kwartalen[m]!, datum: d.toISOString().split("T")[0]! });
      }
    } else if (freq === "kwartaal") {
      for (let q = 0; q < 4; q++) {
        const d = new Date(planJaar, q * 3 + 1, 15);
        datums.push({ kwartaal: `Q${q + 1}`, datum: d.toISOString().split("T")[0]! });
      }
    } else if (freq === "halfjaarlijks" || freq === "2x_per_jaar") {
      datums.push({ kwartaal: "Q2", datum: `${planJaar}-06-15` });
      datums.push({ kwartaal: "Q4", datum: `${planJaar}-12-15` });
    } else {
      const eersteMonth = contract.eerstvolgendOnderhoud
        ? new Date(contract.eerstvolgendOnderhoud).getMonth()
        : 8;
      const d = new Date(planJaar, eersteMonth, 15);
      datums.push({ kwartaal: `Q${Math.floor(eersteMonth / 3) + 1}`, datum: d.toISOString().split("T")[0]! });
    }

    const bestaande = await db
      .select({ datum: werkbonnenTable.geplandeDatum })
      .from(werkbonnenTable)
      .where(eq(werkbonnenTable.contractId, id));
    const bestaandeDatums = new Set(bestaande.map((w) => w.datum));

    const prefix = `WB-${planJaar}-`;
    const [maxRow] = await db
      .select({ max: sql<string>`max(${werkbonnenTable.werkbonnummer})` })
      .from(werkbonnenTable)
      .where(sql`${werkbonnenTable.werkbonnummer} like ${prefix + "%"}`);
    let volgnr = maxRow?.max ? parseInt(maxRow.max.split("-")[2] ?? "0", 10) : 0;

    let aangemaakt = 0;
    let overgeslagen = 0;

    for (const d of datums) {
      if (bestaandeDatums.has(d.datum)) { overgeslagen++; continue; }
      volgnr++;
      const werkbonnummer = `${prefix}${String(volgnr).padStart(3, "0")}`;
      await db.insert(werkbonnenTable).values({
        werkbonnummer,
        contractId: id,
        gebouwId: contract.gebouwId ?? null,
        titel: `Onderhoud ${d.kwartaal} ${planJaar}`,
        type: werkbonType,
        geplande_kwartaal: d.kwartaal,
        geplandeDatum: d.datum,
        status: "gepland",
      });
      aangemaakt++;
    }

    res.json({ aangemaakt, overgeslagen, totaal: datums.length });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
