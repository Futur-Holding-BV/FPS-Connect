// HRM-routes (Fase 1) — Parallel spoor, formeel akkoord gebruiker.
//
// Medewerkers, functiehuis, opleidingen/certificaten, bekwaamheidsmatrix en
// verlof. Bevat ook de onboarding-flow: bij het koppelen van een gebruiker aan
// HRM worden CAO, contracturen en aanvang dienstverband server-side
// gecontroleerd en wordt direct verlofsaldo opgebouwd. Fase 1 bevat BEWUST GEEN
// salarisadministratie. Uitzondering (op expliciet verzoek vooruit gebouwd): AI
// stelt opleidingen/cursussen voor per functie. Conform het projectprincipe stelt
// de AI alleen voor; een mens bevestigt en bewaart (geen automatische opslag).
import { Router } from "express";
import {
  db,
  werkgeversTable,
  functiesTable,
  medewerkersTable,
  opleidingenTable,
  functieOpleidingenTable,
  medewerkerOpleidingenTable,
  bekwaamhedenTable,
  verlofsoortenTable,
  verlofSaldiTable,
  verlofAanvragenTable,
  gebruikersTable,
} from "@workspace/db";
import { eq, desc, and, ne, inArray } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { stelOpleidingenVoor } from "../services/opleiding-ai";

const router = Router();

const lezen = requireBevoegdheid("personeel", 1);
const schrijven = requireBevoegdheid("personeel", 2);

const iso = (d: Date) => d.toISOString();
const isoOf = (d: Date | null) => (d ? d.toISOString() : null);

function parseId(v: unknown): number {
  return parseInt(String(v), 10);
}

// Bekende CAO's met normuren — bron voor de onboardingcontrole en de
// verlofopbouw (pro-rata bij parttime). Geen salaris, alleen arbeidsduur.
const CAO_OPTIES = [
  {
    naam: "Metaal & Techniek",
    standaard_uren_per_week: 38,
    adv_uren_per_week: 0,
    toelichting:
      "CAO Metaal & Techniek (Technisch Installatiebedrijf). Normweek 38 uur; bij een 40-urige werkweek wordt het verschil als ADV/roostervrije tijd opgebouwd.",
  },
  {
    naam: "Bouw & Infra",
    standaard_uren_per_week: 40,
    adv_uren_per_week: 3.8,
    toelichting:
      "CAO Bouw & Infra. Normweek 40 uur met opbouw van roostervrije (ADV-)dagen volgens het bouwplaatsrooster.",
  },
  {
    naam: "Geen CAO / individueel",
    standaard_uren_per_week: 40,
    adv_uren_per_week: 0,
    toelichting:
      "Geen toepasselijke bedrijfstak-CAO; arbeidsvoorwaarden volgen de individuele arbeidsovereenkomst.",
  },
] as const;

// ── Werkgevers (FPS-werkmaatschappijen als hoofdentiteit) ────────────────────
// De werkgever is leidend voor CAO, briefpapier/logo en personeelsbeleid. Het
// tekstveld `werkmaatschappij` op functies/medewerkers/verlofsoorten blijft als
// legacy cache bestaan; bij elke schrijfactie leiden we hieruit de werkgever_id af.
const mapWerkgever = (w: typeof werkgeversTable.$inferSelect) => ({
  id: w.id,
  naam: w.naam,
  cao: w.cao,
  logo_document_id: w.logoDocumentId,
  briefpapier_document_id: w.briefpapierDocumentId,
  personeelsbeleid: w.personeelsbeleid,
  adres: w.adres,
  postcode: w.postcode,
  plaats: w.plaats,
  kvk: w.kvk,
  btw: w.btw,
  telefoon: w.telefoon,
  email: w.email,
  website: w.website,
  voettekst: w.voettekst,
  actief: w.actief,
  aangemaakt_op: iso(w.aangemaaktOp),
  bijgewerkt_op: iso(w.bijgewerktOp),
});

// Zoekt de werkgever_id bij een werkmaatschappij-naam. Retourneert null als de
// naam leeg is of (nog) geen geregistreerde werkgever is.
async function werkgeverIdVoor(werkmaatschappij: unknown): Promise<number | null> {
  if (typeof werkmaatschappij !== "string" || !werkmaatschappij.trim()) return null;
  const [w] = await db
    .select({ id: werkgeversTable.id })
    .from(werkgeversTable)
    .where(eq(werkgeversTable.naam, werkmaatschappij.trim()));
  return w?.id ?? null;
}

router.get("/werkgevers", lezen, async (req, res) => {
  try {
    const rijen = await db.select().from(werkgeversTable).orderBy(werkgeversTable.naam);
    res.json(rijen.map(mapWerkgever));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/werkgevers", schrijven, async (req, res) => {
  try {
    const { naam, cao, logo_document_id, briefpapier_document_id, personeelsbeleid, adres, postcode, plaats, kvk, btw, telefoon, email, website, voettekst, actief } = req.body;
    if (!naam || typeof naam !== "string" || !naam.trim()) {
      return res.status(400).json({ error: "naam is verplicht" });
    }
    const [w] = await db
      .insert(werkgeversTable)
      .values({
        naam: naam.trim(),
        cao: cao || "Metaal & Techniek",
        logoDocumentId: logo_document_id ?? null,
        briefpapierDocumentId: briefpapier_document_id ?? null,
        personeelsbeleid: personeelsbeleid ?? null,
        adres: adres ?? null,
        postcode: postcode ?? null,
        plaats: plaats ?? null,
        kvk: kvk ?? null,
        btw: btw ?? null,
        telefoon: telefoon ?? null,
        email: email ?? null,
        website: website ?? null,
        voettekst: voettekst ?? null,
        actief: actief ?? true,
      })
      .returning();
    res.status(201).json(mapWerkgever(w));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.get("/werkgevers/:id", lezen, async (req, res) => {
  try {
    const [w] = await db.select().from(werkgeversTable).where(eq(werkgeversTable.id, parseId(req.params.id)));
    if (!w) return res.status(404).json({ error: "Werkgever niet gevonden" });
    res.json(mapWerkgever(w));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.patch("/werkgevers/:id", schrijven, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const { naam, cao, logo_document_id, briefpapier_document_id, personeelsbeleid, adres, postcode, plaats, kvk, btw, telefoon, email, website, voettekst, actief } = req.body;
    const nieuweNaam = typeof naam === "string" && naam.trim() ? naam.trim() : undefined;

    const w = await db.transaction(async (tx) => {
      const [huidig] = await tx.select().from(werkgeversTable).where(eq(werkgeversTable.id, id));
      if (!huidig) return null;

      const [bijgewerkt] = await tx
        .update(werkgeversTable)
        .set({
          naam: nieuweNaam,
          cao,
          logoDocumentId: logo_document_id !== undefined ? logo_document_id : undefined,
          briefpapierDocumentId: briefpapier_document_id !== undefined ? briefpapier_document_id : undefined,
          personeelsbeleid,
          adres: adres !== undefined ? adres : undefined,
          postcode: postcode !== undefined ? postcode : undefined,
          plaats: plaats !== undefined ? plaats : undefined,
          kvk: kvk !== undefined ? kvk : undefined,
          btw: btw !== undefined ? btw : undefined,
          telefoon: telefoon !== undefined ? telefoon : undefined,
          email: email !== undefined ? email : undefined,
          website: website !== undefined ? website : undefined,
          voettekst: voettekst !== undefined ? voettekst : undefined,
          actief,
          bijgewerktOp: new Date(),
        })
        .where(eq(werkgeversTable.id, id))
        .returning();

      // Bij hernoemen de legacy werkmaatschappij-cache op gekoppelde kinderen
      // meeschrijven, zodat naam-afgeleide logica (werkgeverIdVoor) en weergave
      // niet uit elkaar lopen.
      if (nieuweNaam && nieuweNaam !== huidig.naam) {
        await tx.update(functiesTable).set({ werkmaatschappij: nieuweNaam, bijgewerktOp: new Date() }).where(eq(functiesTable.werkgeverId, id));
        await tx.update(medewerkersTable).set({ werkmaatschappij: nieuweNaam, bijgewerktOp: new Date() }).where(eq(medewerkersTable.werkgeverId, id));
        await tx.update(verlofsoortenTable).set({ werkmaatschappij: nieuweNaam, bijgewerktOp: new Date() }).where(eq(verlofsoortenTable.werkgeverId, id));
      }
      return bijgewerkt;
    });

    if (!w) return res.status(404).json({ error: "Werkgever niet gevonden" });
    res.json(mapWerkgever(w));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Functiehuis ─────────────────────────────────────────────────────────────
const mapFunctie = (f: typeof functiesTable.$inferSelect) => ({
  id: f.id,
  werkmaatschappij: f.werkmaatschappij,
  naam: f.naam,
  omschrijving: f.omschrijving,
  taken: f.taken,
  verantwoordelijkheden: f.verantwoordelijkheden,
  competenties: f.competenties,
  opleidingsvereisten: f.opleidingsvereisten,
  doorgroeipad: f.doorgroeipad,
  uitvoerend: f.uitvoerend,
  actief: f.actief,
  aangemaakt_op: iso(f.aangemaaktOp),
  bijgewerkt_op: iso(f.bijgewerktOp),
});

router.get("/functies", lezen, async (req, res) => {
  try {
    const rijen = await db.select().from(functiesTable).orderBy(functiesTable.naam);
    res.json(rijen.map(mapFunctie));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/functies", schrijven, async (req, res) => {
  try {
    const { naam, werkmaatschappij, omschrijving, taken, verantwoordelijkheden, competenties, opleidingsvereisten, doorgroeipad, uitvoerend, actief } = req.body;
    if (!naam) return res.status(400).json({ error: "naam is verplicht" });
    const wm = werkmaatschappij || "FPS Brandpreventie";
    const [f] = await db
      .insert(functiesTable)
      .values({
        naam,
        werkmaatschappij: wm,
        werkgeverId: await werkgeverIdVoor(wm),
        omschrijving,
        taken,
        verantwoordelijkheden,
        competenties,
        opleidingsvereisten,
        doorgroeipad,
        uitvoerend: uitvoerend ?? false,
        actief: actief ?? true,
      })
      .returning();
    res.status(201).json(mapFunctie(f));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.get("/functies/:id", lezen, async (req, res) => {
  try {
    const [f] = await db.select().from(functiesTable).where(eq(functiesTable.id, parseId(req.params.id)));
    if (!f) return res.status(404).json({ error: "Functie niet gevonden" });
    res.json(mapFunctie(f));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.patch("/functies/:id", schrijven, async (req, res) => {
  try {
    const { naam, werkmaatschappij, omschrijving, taken, verantwoordelijkheden, competenties, opleidingsvereisten, doorgroeipad, uitvoerend, actief } = req.body;
    const werkgeverId = werkmaatschappij !== undefined ? await werkgeverIdVoor(werkmaatschappij) : undefined;
    const [f] = await db
      .update(functiesTable)
      .set({ naam, werkmaatschappij, werkgeverId, omschrijving, taken, verantwoordelijkheden, competenties, opleidingsvereisten, doorgroeipad, uitvoerend, actief, bijgewerktOp: new Date() })
      .where(eq(functiesTable.id, parseId(req.params.id)))
      .returning();
    if (!f) return res.status(404).json({ error: "Functie niet gevonden" });
    res.json(mapFunctie(f));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.delete("/functies/:id", schrijven, async (req, res) => {
  try {
    await db.delete(functiesTable).where(eq(functiesTable.id, parseId(req.params.id)));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Opleidingen-catalogus ───────────────────────────────────────────────────
type OpleidingRow = typeof opleidingenTable.$inferSelect;

const mapOpleiding = (o: OpleidingRow, koppeling?: { ids: number[]; namen: string[] }) => ({
  id: o.id,
  naam: o.naam,
  categorie: o.categorie,
  soort: o.soort,
  omschrijving: o.omschrijving,
  niveau: o.niveau,
  opleider: o.opleider,
  studieduur: o.studieduur,
  studiebelasting: o.studiebelasting,
  lesvorm: o.lesvorm,
  kosten_indicatie: o.kostenIndicatie,
  kosten_werkgever_pct: o.kostenWerkgeverPct,
  kosten_werknemer_pct: o.kostenWerknemerPct,
  geldigheid_maanden: o.geldigheidMaanden,
  verplicht: o.verplicht,
  functie_ids: koppeling?.ids ?? [],
  functie_namen: koppeling?.namen ?? [],
  aangemaakt_op: iso(o.aangemaaktOp),
  bijgewerkt_op: iso(o.bijgewerktOp),
});

// Functie-koppelingen voor een set opleidingen ophalen (id's + namen per opleiding).
async function haalOpleidingKoppelingen(opleidingIds: number[]): Promise<Map<number, { ids: number[]; namen: string[] }>> {
  const map = new Map<number, { ids: number[]; namen: string[] }>();
  if (opleidingIds.length === 0) return map;
  const rijen = await db
    .select({
      opleidingId: functieOpleidingenTable.opleidingId,
      functieId: functieOpleidingenTable.functieId,
      functieNaam: functiesTable.naam,
    })
    .from(functieOpleidingenTable)
    .leftJoin(functiesTable, eq(functieOpleidingenTable.functieId, functiesTable.id))
    .where(inArray(functieOpleidingenTable.opleidingId, opleidingIds));
  for (const r of rijen) {
    const entry = map.get(r.opleidingId) ?? { ids: [], namen: [] };
    entry.ids.push(r.functieId);
    if (r.functieNaam) entry.namen.push(r.functieNaam);
    map.set(r.opleidingId, entry);
  }
  return map;
}

// Functie-koppelingen van één opleiding vervangen (alleen bestaande functies).
async function syncOpleidingFuncties(opleidingId: number, functieIds: unknown): Promise<void> {
  if (!Array.isArray(functieIds)) return;
  const uniek = [...new Set(functieIds.map((n) => parseInt(String(n), 10)).filter((n) => Number.isInteger(n)))];
  await db.delete(functieOpleidingenTable).where(eq(functieOpleidingenTable.opleidingId, opleidingId));
  if (uniek.length === 0) return;
  const bestaande = await db.select({ id: functiesTable.id }).from(functiesTable).where(inArray(functiesTable.id, uniek));
  const geldig = bestaande.map((f) => f.id);
  if (geldig.length > 0) {
    await db
      .insert(functieOpleidingenTable)
      .values(geldig.map((functieId) => ({ functieId, opleidingId })))
      .onConflictDoNothing();
  }
}

const soortOf = (v: unknown): "opleiding" | "cursus" | undefined =>
  v === "opleiding" ? "opleiding" : v === "cursus" ? "cursus" : undefined;

router.get("/opleidingen", lezen, async (req, res) => {
  try {
    const rijen = await db.select().from(opleidingenTable).orderBy(opleidingenTable.naam);
    const kopMap = await haalOpleidingKoppelingen(rijen.map((r) => r.id));
    res.json(rijen.map((r) => mapOpleiding(r, kopMap.get(r.id))));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/opleidingen", schrijven, async (req, res) => {
  try {
    const {
      naam, categorie, soort, omschrijving, niveau, opleider, studieduur, studiebelasting,
      lesvorm, kosten_indicatie, kosten_werkgever_pct, kosten_werknemer_pct,
      geldigheid_maanden, verplicht, functie_ids,
    } = req.body;
    if (!naam) return res.status(400).json({ error: "naam is verplicht" });
    const [o] = await db
      .insert(opleidingenTable)
      .values({
        naam,
        categorie: categorie || "overig",
        soort: soortOf(soort) ?? "cursus",
        omschrijving: omschrijving ?? null,
        niveau: niveau ?? null,
        opleider: opleider ?? null,
        studieduur: studieduur ?? null,
        studiebelasting: studiebelasting ?? null,
        lesvorm: lesvorm ?? null,
        kostenIndicatie: kosten_indicatie ?? null,
        kostenWerkgeverPct: kosten_werkgever_pct ?? null,
        kostenWerknemerPct: kosten_werknemer_pct ?? null,
        geldigheidMaanden: geldigheid_maanden ?? null,
        verplicht: verplicht ?? false,
      })
      .returning();
    await syncOpleidingFuncties(o.id, functie_ids);
    const kopMap = await haalOpleidingKoppelingen([o.id]);
    res.status(201).json(mapOpleiding(o, kopMap.get(o.id)));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.patch("/opleidingen/:id", schrijven, async (req, res) => {
  try {
    const {
      naam, categorie, soort, omschrijving, niveau, opleider, studieduur, studiebelasting,
      lesvorm, kosten_indicatie, kosten_werkgever_pct, kosten_werknemer_pct,
      geldigheid_maanden, verplicht, functie_ids,
    } = req.body;
    const id = parseId(req.params.id);
    // Partiele PATCH: alleen meegestuurde velden bijwerken. Drizzle .set() slaat
    // undefined over, dus niet coalescen naar null (anders wist een partiele
    // PATCH bestaande waarden).
    const [o] = await db
      .update(opleidingenTable)
      .set({
        naam,
        categorie,
        soort: soortOf(soort),
        omschrijving,
        niveau,
        opleider,
        studieduur,
        studiebelasting,
        lesvorm,
        kostenIndicatie: kosten_indicatie,
        kostenWerkgeverPct: kosten_werkgever_pct,
        kostenWerknemerPct: kosten_werknemer_pct,
        geldigheidMaanden: geldigheid_maanden,
        verplicht,
        bijgewerktOp: new Date(),
      })
      .where(eq(opleidingenTable.id, id))
      .returning();
    if (!o) return res.status(404).json({ error: "Opleiding niet gevonden" });
    if (Array.isArray(functie_ids)) await syncOpleidingFuncties(id, functie_ids);
    const kopMap = await haalOpleidingKoppelingen([id]);
    res.json(mapOpleiding(o, kopMap.get(id)));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// AI stelt opleidingen/cursussen voor bij een functie. Slaat NIETS op; de gebruiker
// beoordeelt het voorstel in de UI en bewaart de gekozen items zelf.
router.post("/functies/:id/opleidingen-voorstel", schrijven, async (req, res) => {
  try {
    const [f] = await db.select().from(functiesTable).where(eq(functiesTable.id, parseId(req.params.id)));
    if (!f) return res.status(404).json({ error: "Functie niet gevonden" });
    const resultaat = await stelOpleidingenVoor({
      naam: f.naam,
      werkmaatschappij: f.werkmaatschappij,
      omschrijving: f.omschrijving,
      taken: f.taken,
      verantwoordelijkheden: f.verantwoordelijkheden,
      competenties: f.competenties,
      opleidingsvereisten: f.opleidingsvereisten,
    });
    res.json(resultaat);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.delete("/opleidingen/:id", schrijven, async (req, res) => {
  try {
    await db.delete(opleidingenTable).where(eq(opleidingenTable.id, parseId(req.params.id)));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Medewerkers ─────────────────────────────────────────────────────────────
async function medewerkerNaarJson(m: typeof medewerkersTable.$inferSelect) {
  let functieNaam: string | null = null;
  if (m.functieId != null) {
    const [f] = await db.select({ naam: functiesTable.naam }).from(functiesTable).where(eq(functiesTable.id, m.functieId));
    functieNaam = f?.naam ?? null;
  }
  let gebruikerRol: string | null = null;
  if (m.gebruikerId != null) {
    const [g] = await db.select({ rol: gebruikersTable.rol }).from(gebruikersTable).where(eq(gebruikersTable.id, m.gebruikerId));
    gebruikerRol = g?.rol ?? null;
  }
  return {
    id: m.id,
    gebruiker_id: m.gebruikerId,
    gebruiker_rol: gebruikerRol,
    naam: m.naam,
    email: m.email,
    telefoon: m.telefoon,
    mobiel: m.mobiel,
    werkmaatschappij: m.werkmaatschappij,
    functie_id: m.functieId,
    functie_naam: functieNaam,
    cao: m.cao,
    dienstverband: m.dienstverband,
    bedrijf_uitzendbureau: m.bedrijfUitzendbureau ?? null,
    contracturen_per_week: m.contracturenPerWeek,
    in_dienst_sinds: m.inDienstSinds,
    uit_dienst_per: m.uitDienstPer,
    noodcontact_naam: m.noodcontactNaam,
    noodcontact_telefoon: m.noodcontactTelefoon,
    actief: m.actief,
    opmerkingen: m.opmerkingen,
    aangemaakt_op: iso(m.aangemaaktOp),
    bijgewerkt_op: iso(m.bijgewerktOp),
  };
}

router.get("/medewerkers", lezen, async (req, res) => {
  try {
    const rijen = await db
      .select({ m: medewerkersTable, functieNaam: functiesTable.naam, gebruikerRol: gebruikersTable.rol })
      .from(medewerkersTable)
      .leftJoin(functiesTable, eq(medewerkersTable.functieId, functiesTable.id))
      .leftJoin(gebruikersTable, eq(medewerkersTable.gebruikerId, gebruikersTable.id))
      .orderBy(medewerkersTable.naam);
    res.json(
      rijen.map((r) => ({
        id: r.m.id,
        gebruiker_id: r.m.gebruikerId,
        gebruiker_rol: r.gebruikerRol ?? null,
        naam: r.m.naam,
        email: r.m.email,
        telefoon: r.m.telefoon,
        mobiel: r.m.mobiel,
        werkmaatschappij: r.m.werkmaatschappij,
        functie_id: r.m.functieId,
        functie_naam: r.functieNaam ?? null,
        cao: r.m.cao,
        dienstverband: r.m.dienstverband,
        contracturen_per_week: r.m.contracturenPerWeek,
        in_dienst_sinds: r.m.inDienstSinds,
        uit_dienst_per: r.m.uitDienstPer,
        noodcontact_naam: r.m.noodcontactNaam,
        noodcontact_telefoon: r.m.noodcontactTelefoon,
        actief: r.m.actief,
        opmerkingen: r.m.opmerkingen,
        aangemaakt_op: iso(r.m.aangemaaktOp),
        bijgewerkt_op: iso(r.m.bijgewerktOp),
      })),
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/medewerkers", schrijven, async (req, res) => {
  try {
    const { naam, gebruiker_id, email, telefoon, mobiel, werkmaatschappij, functie_id, cao, dienstverband, bedrijf_uitzendbureau, contracturen_per_week, in_dienst_sinds, uit_dienst_per, noodcontact_naam, noodcontact_telefoon, actief, opmerkingen } = req.body;
    if (!naam) return res.status(400).json({ error: "naam is verplicht" });
    const wm = werkmaatschappij || "FPS Brandpreventie";
    const [m] = await db
      .insert(medewerkersTable)
      .values({
        naam,
        gebruikerId: gebruiker_id ?? null,
        email,
        telefoon,
        mobiel,
        werkmaatschappij: wm,
        werkgeverId: await werkgeverIdVoor(wm),
        functieId: functie_id ?? null,
        cao,
        dienstverband: dienstverband || "vast",
        bedrijfUitzendbureau: bedrijf_uitzendbureau || null,
        contracturenPerWeek: contracturen_per_week ?? null,
        inDienstSinds: in_dienst_sinds,
        uitDienstPer: uit_dienst_per,
        noodcontactNaam: noodcontact_naam,
        noodcontactTelefoon: noodcontact_telefoon,
        actief: actief ?? true,
        opmerkingen,
      })
      .returning();
    res.status(201).json(await medewerkerNaarJson(m));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// Onboarding: koppel een gebruiker aan HRM met server-side controle op CAO,
// contracturen en aanvang dienstverband, en bouw direct verlofsaldo op.
router.post("/medewerkers/onboarding", schrijven, async (req, res) => {
  try {
    const {
      gebruiker_id,
      functie_id,
      werkmaatschappij,
      cao,
      contracturen_per_week,
      in_dienst_sinds,
      naam,
      email,
      telefoon,
      mobiel,
      dienstverband,
      noodcontact_naam,
      noodcontact_telefoon,
      verlofsoort_ids,
      jaar,
    } = req.body;

    const velden: string[] = [];

    // gebruiker
    let gebruiker: { id: number; naam: string; email: string | null } | undefined;
    if (gebruiker_id == null) {
      velden.push("gebruiker_id");
    } else {
      const [g] = await db
        .select({ id: gebruikersTable.id, naam: gebruikersTable.naam, email: gebruikersTable.email })
        .from(gebruikersTable)
        .where(eq(gebruikersTable.id, parseId(gebruiker_id)));
      if (!g) velden.push("gebruiker_id");
      else gebruiker = g;
    }

    // dubbele medewerker voor dezelfde gebruiker voorkomen
    if (gebruiker) {
      const [bestaand] = await db
        .select({ id: medewerkersTable.id })
        .from(medewerkersTable)
        .where(eq(medewerkersTable.gebruikerId, gebruiker.id));
      if (bestaand) {
        return res.status(400).json({ error: "Deze gebruiker is al als medewerker geregistreerd.", velden: ["gebruiker_id"] });
      }
    }

    // functie moet bestaan
    if (functie_id == null) {
      velden.push("functie_id");
    } else {
      const [f] = await db.select({ id: functiesTable.id }).from(functiesTable).where(eq(functiesTable.id, parseId(functie_id)));
      if (!f) velden.push("functie_id");
    }

    if (!werkmaatschappij) velden.push("werkmaatschappij");

    // CAO moet bekend zijn
    const caoOptie = CAO_OPTIES.find((c) => c.naam === cao);
    if (!cao || !caoOptie) velden.push("cao");

    // contracturen > 0 en <= 40
    const uren = typeof contracturen_per_week === "number" ? contracturen_per_week : Number(contracturen_per_week);
    if (!Number.isFinite(uren) || uren <= 0 || uren > 40) velden.push("contracturen_per_week");

    // in dienst sinds: geldige datum, niet in de toekomst
    let inDienstDatum: Date | null = null;
    if (!in_dienst_sinds) {
      velden.push("in_dienst_sinds");
    } else {
      const d = new Date(in_dienst_sinds);
      if (Number.isNaN(d.getTime())) {
        velden.push("in_dienst_sinds");
      } else {
        const vandaag = new Date();
        vandaag.setHours(23, 59, 59, 999);
        if (d.getTime() > vandaag.getTime()) velden.push("in_dienst_sinds");
        else inDienstDatum = d;
      }
    }

    if (velden.length > 0) {
      return res.status(400).json({ error: "De ingevoerde gegevens zijn onvolledig of onjuist.", velden });
    }

    // Medewerker aanmaken. naam valt terug op de gebruikersnaam.
    const [m] = await db
      .insert(medewerkersTable)
      .values({
        naam: naam || gebruiker!.naam,
        gebruikerId: gebruiker!.id,
        email: email ?? gebruiker!.email ?? null,
        telefoon,
        mobiel,
        werkmaatschappij,
        werkgeverId: await werkgeverIdVoor(werkmaatschappij),
        functieId: parseId(functie_id),
        cao,
        dienstverband: dienstverband || "vast",
        contracturenPerWeek: uren,
        inDienstSinds: inDienstDatum ? inDienstDatum.toISOString().slice(0, 10) : in_dienst_sinds,
        noodcontactNaam: noodcontact_naam,
        noodcontactTelefoon: noodcontact_telefoon,
        actief: true,
      })
      .returning();

    // Verlofsaldo opbouwen (pro-rata op basis van contracturen t.o.v. CAO-norm).
    const saldoJaar = Number.isFinite(Number(jaar)) ? Number(jaar) : new Date().getFullYear();
    const standaardUren = caoOptie!.standaard_uren_per_week || 40;
    const factor = Math.min(uren / standaardUren, 1);
    const ids: number[] = Array.isArray(verlofsoort_ids) ? verlofsoort_ids.map((v: unknown) => parseId(v)).filter((n) => Number.isFinite(n)) : [];
    for (const vsId of ids) {
      const [vs] = await db.select().from(verlofsoortenTable).where(eq(verlofsoortenTable.id, vsId));
      if (!vs) continue;
      const basis = vs.opbouwUrenPerJaar ?? 0;
      const opgebouwd = Math.round(basis * factor * 10) / 10;
      await db.insert(verlofSaldiTable).values({
        medewerkerId: m.id,
        verlofsoortId: vsId,
        jaar: saldoJaar,
        beginsaldoUren: 0,
        opgebouwdUren: opgebouwd,
        opgenomenUren: 0,
        saldoUren: opgebouwd,
      });
    }

    res.status(201).json(await medewerkerNaarJson(m));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.get("/medewerkers/:id", lezen, async (req, res) => {
  try {
    const [m] = await db.select().from(medewerkersTable).where(eq(medewerkersTable.id, parseId(req.params.id)));
    if (!m) return res.status(404).json({ error: "Medewerker niet gevonden" });
    res.json(await medewerkerNaarJson(m));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.patch("/medewerkers/:id", schrijven, async (req, res) => {
  try {
    const { naam, gebruiker_id, email, telefoon, mobiel, werkmaatschappij, functie_id, cao, dienstverband, bedrijf_uitzendbureau, contracturen_per_week, in_dienst_sinds, uit_dienst_per, noodcontact_naam, noodcontact_telefoon, actief, opmerkingen } = req.body;
    // Voorkom dat één account aan twee medewerkers gekoppeld raakt (onboarding blokkeert
    // dit al; hier ook bij profielwijziging, want er is geen unieke DB-constraint).
    if (gebruiker_id != null) {
      const [bestaand] = await db
        .select({ id: medewerkersTable.id })
        .from(medewerkersTable)
        .where(and(eq(medewerkersTable.gebruikerId, parseId(gebruiker_id)), ne(medewerkersTable.id, parseId(req.params.id))));
      if (bestaand) {
        return res.status(400).json({ error: "Deze gebruiker is al als medewerker geregistreerd.", velden: ["gebruiker_id"] });
      }
    }
    const werkgeverId = werkmaatschappij !== undefined ? await werkgeverIdVoor(werkmaatschappij) : undefined;
    const [m] = await db
      .update(medewerkersTable)
      .set({
        naam,
        gebruikerId: gebruiker_id !== undefined ? gebruiker_id : undefined,
        email,
        telefoon,
        mobiel,
        werkmaatschappij,
        werkgeverId,
        functieId: functie_id !== undefined ? functie_id : undefined,
        cao,
        dienstverband,
        bedrijfUitzendbureau: bedrijf_uitzendbureau !== undefined ? (bedrijf_uitzendbureau || null) : undefined,
        contracturenPerWeek: contracturen_per_week !== undefined ? contracturen_per_week : undefined,
        inDienstSinds: in_dienst_sinds,
        uitDienstPer: uit_dienst_per,
        noodcontactNaam: noodcontact_naam,
        noodcontactTelefoon: noodcontact_telefoon,
        actief,
        opmerkingen,
        bijgewerktOp: new Date(),
      })
      .where(eq(medewerkersTable.id, parseId(req.params.id)))
      .returning();
    if (!m) return res.status(404).json({ error: "Medewerker niet gevonden" });
    res.json(await medewerkerNaarJson(m));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.delete("/medewerkers/:id", schrijven, async (req, res) => {
  try {
    await db.delete(medewerkersTable).where(eq(medewerkersTable.id, parseId(req.params.id)));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Medewerker-opleidingen (behaald) ────────────────────────────────────────
router.get("/medewerkers/:id/opleidingen", lezen, async (req, res) => {
  try {
    const rijen = await db
      .select({ mo: medewerkerOpleidingenTable, opleidingNaam: opleidingenTable.naam })
      .from(medewerkerOpleidingenTable)
      .leftJoin(opleidingenTable, eq(medewerkerOpleidingenTable.opleidingId, opleidingenTable.id))
      .where(eq(medewerkerOpleidingenTable.medewerkerId, parseId(req.params.id)))
      .orderBy(desc(medewerkerOpleidingenTable.behaaldOp));
    res.json(
      rijen.map((r) => ({
        id: r.mo.id,
        medewerker_id: r.mo.medewerkerId,
        opleiding_id: r.mo.opleidingId,
        opleiding_naam: r.opleidingNaam ?? null,
        status: r.mo.status,
        behaald_op: r.mo.behaaldOp,
        verloopt_op: r.mo.verlooptOp,
        certificaat_document_id: r.mo.certificaatDocumentId,
        opmerking: r.mo.opmerking,
        aangemaakt_op: iso(r.mo.aangemaaktOp),
        bijgewerkt_op: iso(r.mo.bijgewerktOp),
      })),
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/medewerkers/:id/opleidingen", schrijven, async (req, res) => {
  try {
    const { opleiding_id, status, behaald_op, verloopt_op, certificaat_document_id, opmerking } = req.body;
    if (opleiding_id == null) return res.status(400).json({ error: "opleiding_id is verplicht" });
    const [mo] = await db
      .insert(medewerkerOpleidingenTable)
      .values({
        medewerkerId: parseId(req.params.id),
        opleidingId: parseId(opleiding_id),
        status: status || "behaald",
        behaaldOp: behaald_op,
        verlooptOp: verloopt_op,
        certificaatDocumentId: certificaat_document_id ?? null,
        opmerking,
      })
      .returning();
    let opleidingNaam: string | null = null;
    const [o] = await db.select({ naam: opleidingenTable.naam }).from(opleidingenTable).where(eq(opleidingenTable.id, mo.opleidingId));
    opleidingNaam = o?.naam ?? null;
    res.status(201).json({
      id: mo.id,
      medewerker_id: mo.medewerkerId,
      opleiding_id: mo.opleidingId,
      opleiding_naam: opleidingNaam,
      status: mo.status,
      behaald_op: mo.behaaldOp,
      verloopt_op: mo.verlooptOp,
      certificaat_document_id: mo.certificaatDocumentId,
      opmerking: mo.opmerking,
      aangemaakt_op: iso(mo.aangemaaktOp),
      bijgewerkt_op: iso(mo.bijgewerktOp),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.patch("/medewerker-opleidingen/:id", schrijven, async (req, res) => {
  try {
    const { opleiding_id, status, behaald_op, verloopt_op, certificaat_document_id, opmerking } = req.body;
    const [mo] = await db
      .update(medewerkerOpleidingenTable)
      .set({
        opleidingId: opleiding_id != null ? parseId(opleiding_id) : undefined,
        status,
        behaaldOp: behaald_op,
        verlooptOp: verloopt_op,
        certificaatDocumentId: certificaat_document_id ?? null,
        opmerking,
        bijgewerktOp: new Date(),
      })
      .where(eq(medewerkerOpleidingenTable.id, parseId(req.params.id)))
      .returning();
    if (!mo) return res.status(404).json({ error: "Opleiding niet gevonden" });
    let opleidingNaam: string | null = null;
    const [o] = await db.select({ naam: opleidingenTable.naam }).from(opleidingenTable).where(eq(opleidingenTable.id, mo.opleidingId));
    opleidingNaam = o?.naam ?? null;
    res.json({
      id: mo.id,
      medewerker_id: mo.medewerkerId,
      opleiding_id: mo.opleidingId,
      opleiding_naam: opleidingNaam,
      status: mo.status,
      behaald_op: mo.behaaldOp,
      verloopt_op: mo.verlooptOp,
      certificaat_document_id: mo.certificaatDocumentId,
      opmerking: mo.opmerking,
      aangemaakt_op: iso(mo.aangemaaktOp),
      bijgewerkt_op: iso(mo.bijgewerktOp),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.delete("/medewerker-opleidingen/:id", schrijven, async (req, res) => {
  try {
    await db.delete(medewerkerOpleidingenTable).where(eq(medewerkerOpleidingenTable.id, parseId(req.params.id)));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Bekwaamheidsmatrix ──────────────────────────────────────────────────────
const mapBekwaamheid = (b: typeof bekwaamhedenTable.$inferSelect) => ({
  id: b.id,
  medewerker_id: b.medewerkerId,
  categorie: b.categorie,
  onderwerp: b.onderwerp,
  niveau: b.niveau,
  vastgesteld_door: b.vastgesteldDoor,
  vastgesteld_op: b.vastgesteldOp,
  opmerking: b.opmerking,
  aangemaakt_op: iso(b.aangemaaktOp),
  bijgewerkt_op: iso(b.bijgewerktOp),
});

router.get("/medewerkers/:id/bekwaamheden", lezen, async (req, res) => {
  try {
    const rijen = await db
      .select()
      .from(bekwaamhedenTable)
      .where(eq(bekwaamhedenTable.medewerkerId, parseId(req.params.id)))
      .orderBy(bekwaamhedenTable.categorie, bekwaamhedenTable.onderwerp);
    res.json(rijen.map(mapBekwaamheid));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/medewerkers/:id/bekwaamheden", schrijven, async (req, res) => {
  try {
    const { onderwerp, categorie, niveau, vastgesteld_door, vastgesteld_op, opmerking } = req.body;
    if (!onderwerp) return res.status(400).json({ error: "onderwerp is verplicht" });
    const [b] = await db
      .insert(bekwaamhedenTable)
      .values({
        medewerkerId: parseId(req.params.id),
        onderwerp,
        categorie: categorie || "werkzaamheid",
        niveau: niveau || "niet_bevoegd",
        vastgesteldDoor: vastgesteld_door,
        vastgesteldOp: vastgesteld_op,
        opmerking,
      })
      .returning();
    res.status(201).json(mapBekwaamheid(b));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// Centrale bekwaamheidsmatrix: alle bekwaamheden over alle medewerkers.
router.get("/bekwaamheden", lezen, async (req, res) => {
  try {
    const rijen = await db
      .select({ b: bekwaamhedenTable, medewerkerNaam: medewerkersTable.naam })
      .from(bekwaamhedenTable)
      .leftJoin(medewerkersTable, eq(bekwaamhedenTable.medewerkerId, medewerkersTable.id))
      .orderBy(bekwaamhedenTable.categorie, bekwaamhedenTable.onderwerp);
    res.json(
      rijen.map((r) => ({
        id: r.b.id,
        medewerker_id: r.b.medewerkerId,
        medewerker_naam: r.medewerkerNaam ?? null,
        categorie: r.b.categorie,
        onderwerp: r.b.onderwerp,
        niveau: r.b.niveau,
        vastgesteld_door: r.b.vastgesteldDoor,
        vastgesteld_op: r.b.vastgesteldOp,
        opmerking: r.b.opmerking,
        aangemaakt_op: iso(r.b.aangemaaktOp),
        bijgewerkt_op: iso(r.b.bijgewerktOp),
      })),
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.patch("/bekwaamheden/:id", schrijven, async (req, res) => {
  try {
    const { onderwerp, categorie, niveau, vastgesteld_door, vastgesteld_op, opmerking } = req.body;
    const [b] = await db
      .update(bekwaamhedenTable)
      .set({ onderwerp, categorie, niveau, vastgesteldDoor: vastgesteld_door, vastgesteldOp: vastgesteld_op, opmerking, bijgewerktOp: new Date() })
      .where(eq(bekwaamhedenTable.id, parseId(req.params.id)))
      .returning();
    if (!b) return res.status(404).json({ error: "Bekwaamheid niet gevonden" });
    res.json(mapBekwaamheid(b));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.delete("/bekwaamheden/:id", schrijven, async (req, res) => {
  try {
    await db.delete(bekwaamhedenTable).where(eq(bekwaamhedenTable.id, parseId(req.params.id)));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Verlofsoorten (catalogus) ───────────────────────────────────────────────
const mapVerlofsoort = (v: typeof verlofsoortenTable.$inferSelect) => ({
  id: v.id,
  naam: v.naam,
  categorie: v.categorie,
  cao: v.cao,
  werkmaatschappij: v.werkmaatschappij,
  betaald: v.betaald,
  collectief: v.collectief,
  opbouw_uren_per_jaar: v.opbouwUrenPerJaar,
  opbouw_regel: v.opbouwRegel,
  verval_regel: v.vervalRegel,
  juridisch_kader: v.juridischKader,
  toelichting: v.toelichting,
  actief: v.actief,
  aangemaakt_op: iso(v.aangemaaktOp),
  bijgewerkt_op: iso(v.bijgewerktOp),
});

router.get("/verlofsoorten", lezen, async (req, res) => {
  try {
    const rijen = await db.select().from(verlofsoortenTable).orderBy(verlofsoortenTable.categorie, verlofsoortenTable.naam);
    res.json(rijen.map(mapVerlofsoort));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/verlofsoorten", schrijven, async (req, res) => {
  try {
    const { naam, categorie, cao, werkmaatschappij, betaald, collectief, opbouw_uren_per_jaar, opbouw_regel, verval_regel, juridisch_kader, toelichting, actief } = req.body;
    if (!naam) return res.status(400).json({ error: "naam is verplicht" });
    const [v] = await db
      .insert(verlofsoortenTable)
      .values({
        naam,
        categorie: categorie || "wettelijk",
        cao: cao ?? null,
        werkmaatschappij: werkmaatschappij ?? null,
        werkgeverId: await werkgeverIdVoor(werkmaatschappij),
        betaald: betaald ?? true,
        collectief: collectief ?? false,
        opbouwUrenPerJaar: opbouw_uren_per_jaar ?? null,
        opbouwRegel: opbouw_regel,
        vervalRegel: verval_regel,
        juridischKader: juridisch_kader,
        toelichting,
        actief: actief ?? true,
      })
      .returning();
    res.status(201).json(mapVerlofsoort(v));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.patch("/verlofsoorten/:id", schrijven, async (req, res) => {
  try {
    const { naam, categorie, cao, werkmaatschappij, betaald, collectief, opbouw_uren_per_jaar, opbouw_regel, verval_regel, juridisch_kader, toelichting, actief } = req.body;
    const [v] = await db
      .update(verlofsoortenTable)
      .set({
        naam,
        categorie,
        cao: cao ?? null,
        werkmaatschappij: werkmaatschappij ?? null,
        werkgeverId: werkmaatschappij !== undefined ? await werkgeverIdVoor(werkmaatschappij) : undefined,
        betaald,
        collectief,
        opbouwUrenPerJaar: opbouw_uren_per_jaar ?? null,
        opbouwRegel: opbouw_regel,
        vervalRegel: verval_regel,
        juridischKader: juridisch_kader,
        toelichting,
        actief,
        bijgewerktOp: new Date(),
      })
      .where(eq(verlofsoortenTable.id, parseId(req.params.id)))
      .returning();
    if (!v) return res.status(404).json({ error: "Verlofsoort niet gevonden" });
    res.json(mapVerlofsoort(v));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.delete("/verlofsoorten/:id", schrijven, async (req, res) => {
  try {
    await db.delete(verlofsoortenTable).where(eq(verlofsoortenTable.id, parseId(req.params.id)));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Verlofsaldo per medewerker ──────────────────────────────────────────────
router.get("/medewerkers/:id/verlofsaldi", lezen, async (req, res) => {
  try {
    const rijen = await db
      .select({ s: verlofSaldiTable, verlofsoortNaam: verlofsoortenTable.naam })
      .from(verlofSaldiTable)
      .leftJoin(verlofsoortenTable, eq(verlofSaldiTable.verlofsoortId, verlofsoortenTable.id))
      .where(eq(verlofSaldiTable.medewerkerId, parseId(req.params.id)))
      .orderBy(desc(verlofSaldiTable.jaar));
    res.json(
      rijen.map((r) => ({
        id: r.s.id,
        medewerker_id: r.s.medewerkerId,
        verlofsoort_id: r.s.verlofsoortId,
        verlofsoort_naam: r.verlofsoortNaam ?? null,
        jaar: r.s.jaar,
        beginsaldo_uren: r.s.beginsaldoUren,
        opgebouwd_uren: r.s.opgebouwdUren,
        opgenomen_uren: r.s.opgenomenUren,
        saldo_uren: r.s.saldoUren,
        vervalt_op: r.s.vervaltOp,
        aangemaakt_op: iso(r.s.aangemaaktOp),
        bijgewerkt_op: iso(r.s.bijgewerktOp),
      })),
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/medewerkers/:id/verlofsaldi", schrijven, async (req, res) => {
  try {
    const { verlofsoort_id, jaar, beginsaldo_uren, opgebouwd_uren, opgenomen_uren, saldo_uren, vervalt_op } = req.body;
    if (verlofsoort_id == null || jaar == null) return res.status(400).json({ error: "verlofsoort_id en jaar zijn verplicht" });
    const [s] = await db
      .insert(verlofSaldiTable)
      .values({
        medewerkerId: parseId(req.params.id),
        verlofsoortId: parseId(verlofsoort_id),
        jaar: parseId(jaar),
        beginsaldoUren: beginsaldo_uren ?? 0,
        opgebouwdUren: opgebouwd_uren ?? 0,
        opgenomenUren: opgenomen_uren ?? 0,
        saldoUren: saldo_uren ?? 0,
        vervaltOp: vervalt_op,
      })
      .returning();
    res.status(201).json({
      id: s.id,
      medewerker_id: s.medewerkerId,
      verlofsoort_id: s.verlofsoortId,
      verlofsoort_naam: null,
      jaar: s.jaar,
      beginsaldo_uren: s.beginsaldoUren,
      opgebouwd_uren: s.opgebouwdUren,
      opgenomen_uren: s.opgenomenUren,
      saldo_uren: s.saldoUren,
      vervalt_op: s.vervaltOp,
      aangemaakt_op: iso(s.aangemaaktOp),
      bijgewerkt_op: iso(s.bijgewerktOp),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.patch("/verlofsaldi/:id", schrijven, async (req, res) => {
  try {
    const { verlofsoort_id, jaar, beginsaldo_uren, opgebouwd_uren, opgenomen_uren, saldo_uren, vervalt_op } = req.body;
    const [s] = await db
      .update(verlofSaldiTable)
      .set({
        verlofsoortId: verlofsoort_id != null ? parseId(verlofsoort_id) : undefined,
        jaar: jaar != null ? parseId(jaar) : undefined,
        beginsaldoUren: beginsaldo_uren,
        opgebouwdUren: opgebouwd_uren,
        opgenomenUren: opgenomen_uren,
        saldoUren: saldo_uren,
        vervaltOp: vervalt_op,
        bijgewerktOp: new Date(),
      })
      .where(eq(verlofSaldiTable.id, parseId(req.params.id)))
      .returning();
    if (!s) return res.status(404).json({ error: "Verlofsaldo niet gevonden" });
    res.json({
      id: s.id,
      medewerker_id: s.medewerkerId,
      verlofsoort_id: s.verlofsoortId,
      verlofsoort_naam: null,
      jaar: s.jaar,
      beginsaldo_uren: s.beginsaldoUren,
      opgebouwd_uren: s.opgebouwdUren,
      opgenomen_uren: s.opgenomenUren,
      saldo_uren: s.saldoUren,
      vervalt_op: s.vervaltOp,
      aangemaakt_op: iso(s.aangemaaktOp),
      bijgewerkt_op: iso(s.bijgewerktOp),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.delete("/verlofsaldi/:id", schrijven, async (req, res) => {
  try {
    await db.delete(verlofSaldiTable).where(eq(verlofSaldiTable.id, parseId(req.params.id)));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Verlofaanvragen ─────────────────────────────────────────────────────────
router.get("/medewerkers/:id/verlofaanvragen", lezen, async (req, res) => {
  try {
    const rijen = await db
      .select({ a: verlofAanvragenTable, verlofsoortNaam: verlofsoortenTable.naam })
      .from(verlofAanvragenTable)
      .leftJoin(verlofsoortenTable, eq(verlofAanvragenTable.verlofsoortId, verlofsoortenTable.id))
      .where(eq(verlofAanvragenTable.medewerkerId, parseId(req.params.id)))
      .orderBy(desc(verlofAanvragenTable.startDatum));
    res.json(
      rijen.map((r) => ({
        id: r.a.id,
        medewerker_id: r.a.medewerkerId,
        verlofsoort_id: r.a.verlofsoortId,
        verlofsoort_naam: r.verlofsoortNaam ?? null,
        start_datum: r.a.startDatum,
        eind_datum: r.a.eindDatum,
        aantal_uren: r.a.aantalUren,
        status: r.a.status,
        reden: r.a.reden,
        opmerking: r.a.opmerking,
        beoordeeld_door_id: r.a.beoordeeldDoorId,
        beoordeeld_op: isoOf(r.a.beoordeeldOp),
        aangemaakt_op: iso(r.a.aangemaaktOp),
        bijgewerkt_op: iso(r.a.bijgewerktOp),
      })),
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/medewerkers/:id/verlofaanvragen", schrijven, async (req, res) => {
  try {
    const { verlofsoort_id, start_datum, eind_datum, aantal_uren, status, reden, opmerking } = req.body;
    if (verlofsoort_id == null || !start_datum || !eind_datum) return res.status(400).json({ error: "verlofsoort_id, start_datum en eind_datum zijn verplicht" });
    const [a] = await db
      .insert(verlofAanvragenTable)
      .values({
        medewerkerId: parseId(req.params.id),
        verlofsoortId: parseId(verlofsoort_id),
        startDatum: start_datum,
        eindDatum: eind_datum,
        aantalUren: aantal_uren ?? 0,
        status: status || "aangevraagd",
        reden,
        opmerking,
      })
      .returning();
    res.status(201).json({
      id: a.id,
      medewerker_id: a.medewerkerId,
      verlofsoort_id: a.verlofsoortId,
      verlofsoort_naam: null,
      start_datum: a.startDatum,
      eind_datum: a.eindDatum,
      aantal_uren: a.aantalUren,
      status: a.status,
      reden: a.reden,
      opmerking: a.opmerking,
      beoordeeld_door_id: a.beoordeeldDoorId,
      beoordeeld_op: isoOf(a.beoordeeldOp),
      aangemaakt_op: iso(a.aangemaaktOp),
      bijgewerkt_op: iso(a.bijgewerktOp),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// Past het opgenomen verlof en het resterend saldo aan voor (medewerker, soort, jaar).
// Gebruikt bij het goedkeuren of terugdraaien van een verlofaanvraag.
type SaldoUitvoerder = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function pasVerlofSaldoAan(uitvoerder: SaldoUitvoerder, medewerkerId: number, verlofsoortId: number, jaar: number, deltaUren: number) {
  if (!deltaUren || !Number.isFinite(deltaUren)) return;
  const [s] = await uitvoerder
    .select()
    .from(verlofSaldiTable)
    .where(
      and(
        eq(verlofSaldiTable.medewerkerId, medewerkerId),
        eq(verlofSaldiTable.verlofsoortId, verlofsoortId),
        eq(verlofSaldiTable.jaar, jaar),
      ),
    )
    .for("update");
  if (!s) return;
  const opgenomen = Math.round((s.opgenomenUren + deltaUren) * 10) / 10;
  const saldo = Math.round((s.beginsaldoUren + s.opgebouwdUren - opgenomen) * 10) / 10;
  await uitvoerder
    .update(verlofSaldiTable)
    .set({ opgenomenUren: opgenomen, saldoUren: saldo, bijgewerktOp: new Date() })
    .where(eq(verlofSaldiTable.id, s.id));
}

const jaarVanDatum = (d: string) => {
  const y = new Date(d).getFullYear();
  return Number.isFinite(y) ? y : new Date().getFullYear();
};

// Centrale beoordelingslijst: alle verlofaanvragen, optioneel gefilterd op status.
router.get("/verlofaanvragen", lezen, async (req, res) => {
  try {
    const statusFilter = typeof req.query.status === "string" ? req.query.status : null;
    const rijen = await db
      .select({ a: verlofAanvragenTable, verlofsoortNaam: verlofsoortenTable.naam, medewerkerNaam: medewerkersTable.naam })
      .from(verlofAanvragenTable)
      .leftJoin(verlofsoortenTable, eq(verlofAanvragenTable.verlofsoortId, verlofsoortenTable.id))
      .leftJoin(medewerkersTable, eq(verlofAanvragenTable.medewerkerId, medewerkersTable.id))
      .orderBy(desc(verlofAanvragenTable.startDatum));
    res.json(
      rijen
        .filter((r) => !statusFilter || r.a.status === statusFilter)
        .map((r) => ({
          id: r.a.id,
          medewerker_id: r.a.medewerkerId,
          medewerker_naam: r.medewerkerNaam ?? null,
          verlofsoort_id: r.a.verlofsoortId,
          verlofsoort_naam: r.verlofsoortNaam ?? null,
          start_datum: r.a.startDatum,
          eind_datum: r.a.eindDatum,
          aantal_uren: r.a.aantalUren,
          status: r.a.status,
          reden: r.a.reden,
          opmerking: r.a.opmerking,
          beoordeeld_door_id: r.a.beoordeeldDoorId,
          beoordeeld_op: isoOf(r.a.beoordeeldOp),
          aangemaakt_op: iso(r.a.aangemaaktOp),
          bijgewerkt_op: iso(r.a.bijgewerktOp),
        })),
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.patch("/verlofaanvragen/:id", schrijven, async (req, res) => {
  try {
    const { verlofsoort_id, start_datum, eind_datum, aantal_uren, status, reden, opmerking } = req.body;
    // Status mag alleen een bekende waarde zijn.
    const GELDIGE_STATUS = ["aangevraagd", "goedgekeurd", "afgewezen"];
    if (status !== undefined && !GELDIGE_STATUS.includes(status)) {
      return res.status(400).json({ error: "Ongeldige status.", velden: ["status"] });
    }
    // Bij beoordeling (goedkeuren/afwijzen) de beoordelaar en het tijdstip vastleggen.
    const beoordeeld = status === "goedgekeurd" || status === "afgewezen";
    const aanvraagId = parseId(req.params.id);
    // In één transactie met row-lock: voorkomt dat gelijktijdige goedkeuringen de
    // verlofuren dubbel toepassen. Reverse-then-apply blijft idempotent.
    const a = await db.transaction(async (tx) => {
      const [vorige] = await tx
        .select()
        .from(verlofAanvragenTable)
        .where(eq(verlofAanvragenTable.id, aanvraagId))
        .for("update");
      if (!vorige) return null;
      const [bijgewerkt] = await tx
        .update(verlofAanvragenTable)
        .set({
          verlofsoortId: verlofsoort_id != null ? parseId(verlofsoort_id) : undefined,
          startDatum: start_datum,
          eindDatum: eind_datum,
          aantalUren: aantal_uren,
          status,
          reden,
          opmerking,
          beoordeeldDoorId: beoordeeld ? (req.session.userId ?? null) : undefined,
          beoordeeldOp: beoordeeld ? new Date() : undefined,
          bijgewerktOp: new Date(),
        })
        .where(eq(verlofAanvragenTable.id, aanvraagId))
        .returning();
      if (!bijgewerkt) return null;
      // Saldo bijwerken: draai een eerdere goedkeuring terug en pas de nieuwe toe.
      // Idempotent en bestand tegen wijziging van soort/uren/jaar in dezelfde PATCH.
      if (vorige.status === "goedgekeurd") {
        await pasVerlofSaldoAan(tx, vorige.medewerkerId, vorige.verlofsoortId, jaarVanDatum(vorige.startDatum), -vorige.aantalUren);
      }
      if (bijgewerkt.status === "goedgekeurd") {
        await pasVerlofSaldoAan(tx, bijgewerkt.medewerkerId, bijgewerkt.verlofsoortId, jaarVanDatum(bijgewerkt.startDatum), bijgewerkt.aantalUren);
      }
      return bijgewerkt;
    });
    if (!a) return res.status(404).json({ error: "Verlofaanvraag niet gevonden" });
    res.json({
      id: a.id,
      medewerker_id: a.medewerkerId,
      verlofsoort_id: a.verlofsoortId,
      verlofsoort_naam: null,
      start_datum: a.startDatum,
      eind_datum: a.eindDatum,
      aantal_uren: a.aantalUren,
      status: a.status,
      reden: a.reden,
      opmerking: a.opmerking,
      beoordeeld_door_id: a.beoordeeldDoorId,
      beoordeeld_op: isoOf(a.beoordeeldOp),
      aangemaakt_op: iso(a.aangemaaktOp),
      bijgewerkt_op: iso(a.bijgewerktOp),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.delete("/verlofaanvragen/:id", schrijven, async (req, res) => {
  try {
    await db.delete(verlofAanvragenTable).where(eq(verlofAanvragenTable.id, parseId(req.params.id)));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── HRM-dashboard ───────────────────────────────────────────────────────────
router.get("/hrm/stats", lezen, async (req, res) => {
  try {
    const medewerkers = await db.select({ id: medewerkersTable.id, actief: medewerkersTable.actief }).from(medewerkersTable);
    const functies = await db.select({ id: functiesTable.id }).from(functiesTable);
    const opleidingen = await db
      .select({ verlooptOp: medewerkerOpleidingenTable.verlooptOp })
      .from(medewerkerOpleidingenTable);
    const aanvragen = await db.select({ status: verlofAanvragenTable.status }).from(verlofAanvragenTable);

    const nu = Date.now();
    const over60d = nu + 60 * 24 * 60 * 60 * 1000;
    const certificatenVerlopen = opleidingen.filter((o) => {
      if (!o.verlooptOp) return false;
      const t = new Date(o.verlooptOp).getTime();
      return Number.isFinite(t) && t >= nu && t <= over60d;
    }).length;

    res.json({
      medewerkers: medewerkers.length,
      actief: medewerkers.filter((m) => m.actief).length,
      functies: functies.length,
      certificaten_verlopen_binnenkort: certificatenVerlopen,
      openstaande_verlofaanvragen: aanvragen.filter((a) => a.status === "aangevraagd").length,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.get("/hrm/cao-opties", lezen, async (_req, res) => {
  res.json(
    CAO_OPTIES.map((c) => ({
      naam: c.naam,
      standaard_uren_per_week: c.standaard_uren_per_week,
      adv_uren_per_week: c.adv_uren_per_week,
      toelichting: c.toelichting,
    })),
  );
});

// ── Mijn verlof — self-service, alle geauthenticeerde gebruikers ─────────────
// Geen personeel-bevoegdheid vereist; een medewerker raadpleegt en dient in
// uitsluitend zijn eigen verlofdata. requireAuth is al globaal toegepast.

async function getMijnMedewerkerId(req: import("express").Request): Promise<number | null> {
  const userId = req.session.userId;
  if (!userId) return null;
  const [m] = await db
    .select({ id: medewerkersTable.id })
    .from(medewerkersTable)
    .where(eq(medewerkersTable.gebruikerId, userId));
  return m?.id ?? null;
}

router.get("/mijn/verlofsoorten", async (req, res) => {
  try {
    const rijen = await db
      .select()
      .from(verlofsoortenTable)
      .where(eq(verlofsoortenTable.actief, true))
      .orderBy(verlofsoortenTable.naam);
    res.json(
      rijen.map((s) => ({
        id: s.id,
        naam: s.naam,
        categorie: s.categorie,
        cao: s.cao ?? null,
        werkmaatschappij: s.werkmaatschappij ?? null,
        betaald: s.betaald,
        collectief: s.collectief,
        opbouw_uren_per_jaar: s.opbouwUrenPerJaar ?? null,
        opbouw_regel: s.opbouwRegel ?? null,
        verval_regel: s.vervalRegel ?? null,
        juridisch_kader: s.juridischKader ?? null,
        toelichting: s.toelichting ?? null,
        actief: s.actief,
        aangemaakt_op: iso(s.aangemaaktOp),
        bijgewerkt_op: iso(s.bijgewerktOp),
      })),
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.get("/mijn/verlofsaldi", async (req, res) => {
  try {
    const medewerkerId = await getMijnMedewerkerId(req);
    if (!medewerkerId) return res.status(404).json({ error: "Geen medewerker gekoppeld aan uw account." });
    const rijen = await db
      .select({ s: verlofSaldiTable, verlofsoortNaam: verlofsoortenTable.naam })
      .from(verlofSaldiTable)
      .leftJoin(verlofsoortenTable, eq(verlofSaldiTable.verlofsoortId, verlofsoortenTable.id))
      .where(eq(verlofSaldiTable.medewerkerId, medewerkerId))
      .orderBy(desc(verlofSaldiTable.jaar));
    res.json(
      rijen.map((r) => ({
        id: r.s.id,
        medewerker_id: r.s.medewerkerId,
        verlofsoort_id: r.s.verlofsoortId,
        verlofsoort_naam: r.verlofsoortNaam ?? null,
        jaar: r.s.jaar,
        beginsaldo_uren: r.s.beginsaldoUren,
        opgebouwd_uren: r.s.opgebouwdUren,
        opgenomen_uren: r.s.opgenomenUren,
        saldo_uren: r.s.saldoUren,
        vervalt_op: r.s.vervaltOp,
        aangemaakt_op: iso(r.s.aangemaaktOp),
        bijgewerkt_op: iso(r.s.bijgewerktOp),
      })),
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.get("/mijn/verlofaanvragen", async (req, res) => {
  try {
    const medewerkerId = await getMijnMedewerkerId(req);
    if (!medewerkerId) return res.status(404).json({ error: "Geen medewerker gekoppeld aan uw account." });
    const rijen = await db
      .select({ a: verlofAanvragenTable, verlofsoortNaam: verlofsoortenTable.naam })
      .from(verlofAanvragenTable)
      .leftJoin(verlofsoortenTable, eq(verlofAanvragenTable.verlofsoortId, verlofsoortenTable.id))
      .where(eq(verlofAanvragenTable.medewerkerId, medewerkerId))
      .orderBy(desc(verlofAanvragenTable.startDatum));
    res.json(
      rijen.map((r) => ({
        id: r.a.id,
        medewerker_id: r.a.medewerkerId,
        verlofsoort_id: r.a.verlofsoortId,
        verlofsoort_naam: r.verlofsoortNaam ?? null,
        start_datum: r.a.startDatum,
        eind_datum: r.a.eindDatum,
        aantal_uren: r.a.aantalUren,
        status: r.a.status,
        reden: r.a.reden,
        opmerking: r.a.opmerking,
        beoordeeld_door_id: r.a.beoordeeldDoorId,
        beoordeeld_op: isoOf(r.a.beoordeeldOp),
        aangemaakt_op: iso(r.a.aangemaaktOp),
        bijgewerkt_op: iso(r.a.bijgewerktOp),
      })),
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/mijn/verlofaanvragen", async (req, res) => {
  try {
    const medewerkerId = await getMijnMedewerkerId(req);
    if (!medewerkerId) return res.status(404).json({ error: "Geen medewerker gekoppeld aan uw account." });
    const { verlofsoort_id, start_datum, eind_datum, aantal_uren, reden, opmerking } = req.body;
    if (verlofsoort_id == null || !start_datum || !eind_datum) {
      return res.status(400).json({ error: "verlofsoort_id, start_datum en eind_datum zijn verplicht" });
    }
    const [a] = await db
      .insert(verlofAanvragenTable)
      .values({
        medewerkerId,
        verlofsoortId: parseId(verlofsoort_id),
        startDatum: start_datum,
        eindDatum: eind_datum,
        aantalUren: aantal_uren ?? 0,
        status: "aangevraagd",
        reden: reden ?? null,
        opmerking: opmerking ?? null,
      })
      .returning();
    res.status(201).json({
      id: a.id,
      medewerker_id: a.medewerkerId,
      verlofsoort_id: a.verlofsoortId,
      verlofsoort_naam: null,
      start_datum: a.startDatum,
      eind_datum: a.eindDatum,
      aantal_uren: a.aantalUren,
      status: a.status,
      reden: a.reden,
      opmerking: a.opmerking,
      beoordeeld_door_id: a.beoordeeldDoorId,
      beoordeeld_op: isoOf(a.beoordeeldOp),
      aangemaakt_op: iso(a.aangemaaktOp),
      bijgewerkt_op: iso(a.bijgewerktOp),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
