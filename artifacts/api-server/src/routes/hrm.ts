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
import multer from "multer";
import { extraheerPdfTekst } from "../lib/pdfTekst";
import { analyseerEnSlaVoorstellenOp, extracteerHrmVeldenUitBuffer } from "../lib/hrm-ai-analyse";
import { invalideerContext } from "../lib/aiContext/cache";
import { haalVervalsignalen } from "../lib/verlofVervalService";
import { zaaiVerlofPresets } from "../lib/verlofPresets";
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
  verlofAanvraagLogTable,
  verlofCorrectiesTable,
  verlofInstellingenTable,
  feestdagenTable,
  jaarAfsluitingRegelsTable,
  ziekmeldingenTable,
  gebruikersTable,
  medewerkerDocumentenTable,
  zzpOvereenkomstenTable,
  medewerkerAanstellingenTable,
  crmKlantenTable,
  poortwachterDossiersTable,
  poortwachterMijlpalenTable,
  medewerkerCaoKeuzesTable,
  salarisMutatiesTable,
} from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage";
import { eq, desc, and, ne, inArray, or, isNull, gte, lte, sql, getTableColumns } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { requireBevoegdheid } from "../middlewares/auth";
import { stelOpleidingenVoor } from "../services/opleiding-ai";
import { workflowService, maakTransitieContext } from "../services/workflow-engine";
import { medewerkerIdVoorGebruiker } from "../services/medewerker-lookup";
import { maakVerlofprofielAan } from "../services/verlofprofiel";
import { aiGateway, heeftGateway } from "../lib/aiGateway";
import { analyseerCvBestand, analyseerOnboardingTekst } from "../lib/cvAnalyse";
import { ZZP_JURIDISCH_PROMPT, HRM_CAPACITEIT_SIGNALEN_PROMPT } from "../lib/aiPrompts";
import { logger } from "../lib/logger";
import { logAudit } from "../lib/audit";

const uploadGeheugem = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const hrmStorage = new ObjectStorageService();

const router = Router();

// Unique-violation (Postgres 23505) op de gebruiker_id-koppeling herkennen,
// zodat een race tussen twee gelijktijdige onboardings netjes 409 oplevert.
function isUniekeGebruikerKoppeling(err: unknown): boolean {
  const code =
    (err as { code?: string } | null)?.code ??
    ((err as { cause?: { code?: string } } | null)?.cause?.code ?? null);
  return code === "23505";
}

const lezen = requireBevoegdheid("personeel", 1);
const schrijven = requireBevoegdheid("personeel", 2);
const alleenBeheerder = requireBevoegdheid("systeem", 2);

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
function numeriekOfNull(v: string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

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
  handtekening_url: w.handtekeningUrl,
  logo_url: w.logoUrl,
  primaire_kleur: w.primaireKleur ?? "#F23B0D",
  iban: w.iban,
  koptekst_positie: w.koptekstPositie,
  voettekst_positie: w.voettekstPositie,
  marge_boven: numeriekOfNull(w.margeBoven),
  marge_onder: numeriekOfNull(w.margeOnder),
  marge_links: numeriekOfNull(w.margeLinks),
  marge_rechts: numeriekOfNull(w.margeRechts),
  actief: w.actief,
  boekhouder_naam: w.boekhouderNaam ?? null,
  boekhouder_email: w.boekhouderEmail ?? null,
  intern_contact_naam: w.internContactNaam ?? null,
  intern_contact_email: w.internContactEmail ?? null,
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

router.get("/werkgevers", lezen, async (req, res): Promise<void> => {
  try {
    const rijen = await db.select().from(werkgeversTable).orderBy(werkgeversTable.naam);
    res.json(rijen.map(mapWerkgever));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/werkgevers", schrijven, async (req, res): Promise<void> => {
  try {
    const { naam, cao, logo_document_id, briefpapier_document_id, personeelsbeleid, adres, postcode, plaats, kvk, btw, telefoon, email, website, voettekst, handtekening_url, logo_url, primaire_kleur, iban, koptekst_positie, voettekst_positie, marge_boven, marge_onder, marge_links, marge_rechts, actief } = req.body;
    if (!naam || typeof naam !== "string" || !naam.trim()) {
      return void res.status(400).json({ error: "naam is verplicht" });
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
        handtekeningUrl: handtekening_url ?? null,
        logoUrl: logo_url ?? null,
        primaireKleur: primaire_kleur ?? "#F23B0D",
        iban: iban ?? null,
        koptekstPositie: koptekst_positie ?? null,
        voettekstPositie: voettekst_positie ?? null,
        margeBoven: marge_boven != null ? String(marge_boven) : null,
        margeOnder: marge_onder != null ? String(marge_onder) : null,
        margeLinks: marge_links != null ? String(marge_links) : null,
        margeRechts: marge_rechts != null ? String(marge_rechts) : null,
        actief: actief ?? true,
      })
      .returning();
    res.status(201).json(mapWerkgever(w));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.get("/werkgevers/:id", lezen, async (req, res): Promise<void> => {
  try {
    const [w] = await db.select().from(werkgeversTable).where(eq(werkgeversTable.id, parseId(req.params.id)));
    if (!w) return void res.status(404).json({ error: "Werkgever niet gevonden" });
    res.json(mapWerkgever(w));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.patch("/werkgevers/:id", schrijven, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params.id);
    const { naam, cao, logo_document_id, briefpapier_document_id, personeelsbeleid, adres, postcode, plaats, kvk, btw, telefoon, email, website, voettekst, handtekening_url, logo_url, primaire_kleur, iban, koptekst_positie, voettekst_positie, marge_boven, marge_onder, marge_links, marge_rechts, actief } = req.body;
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
          handtekeningUrl: handtekening_url !== undefined ? handtekening_url : undefined,
          logoUrl: logo_url !== undefined ? logo_url : undefined,
          primaireKleur: primaire_kleur !== undefined ? primaire_kleur : undefined,
          iban: iban !== undefined ? iban : undefined,
          koptekstPositie: koptekst_positie !== undefined ? koptekst_positie : undefined,
          voettekstPositie: voettekst_positie !== undefined ? voettekst_positie : undefined,
          margeBoven: marge_boven !== undefined ? (marge_boven != null ? String(marge_boven) : null) : undefined,
          margeOnder: marge_onder !== undefined ? (marge_onder != null ? String(marge_onder) : null) : undefined,
          margeLinks: marge_links !== undefined ? (marge_links != null ? String(marge_links) : null) : undefined,
          margeRechts: marge_rechts !== undefined ? (marge_rechts != null ? String(marge_rechts) : null) : undefined,
          actief,
          bijgewerktOp: new Date(),
        })
        .where(eq(werkgeversTable.id, id))
        .returning();

      // Bij hernoemen de legacy werkmaatschappij-cache op gekoppelde kinderen
      // meeschrijven, zodat naam-afgeleide logica (werkgeverIdVoor) en weergave
      // niet uit elkaar lopen.
      let herbenoemdeMedewerkerIds: number[] = [];
      if (nieuweNaam && nieuweNaam !== huidig.naam) {
        await tx.update(functiesTable).set({ werkmaatschappij: nieuweNaam, bijgewerktOp: new Date() }).where(eq(functiesTable.werkgeverId, id));
        const geraakteMedewerkers = await tx
          .update(medewerkersTable)
          .set({ werkmaatschappij: nieuweNaam, bijgewerktOp: new Date() })
          .where(eq(medewerkersTable.werkgeverId, id))
          .returning({ id: medewerkersTable.id });
        herbenoemdeMedewerkerIds = geraakteMedewerkers.map((m) => m.id);
        await tx.update(verlofsoortenTable).set({ werkmaatschappij: nieuweNaam, bijgewerktOp: new Date() }).where(eq(verlofsoortenTable.werkgeverId, id));
      }
      return { bijgewerkt, herbenoemdeMedewerkerIds };
    });

    if (!w?.bijgewerkt) return void res.status(404).json({ error: "Werkgever niet gevonden" });
    for (const medId of w.herbenoemdeMedewerkerIds) invalideerContext("medewerker", medId);
    res.json(mapWerkgever(w.bijgewerkt));
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
  profiel_id: f.profielId,
  uitvoerend: f.uitvoerend,
  actief: f.actief,
  minimale_bezetting: f.minimaleBezetting,
  aangemaakt_op: iso(f.aangemaaktOp),
  bijgewerkt_op: iso(f.bijgewerktOp),
});

router.get("/functies", lezen, async (req, res): Promise<void> => {
  try {
    const rijen = await db.select().from(functiesTable).orderBy(functiesTable.naam);
    res.json(rijen.map(mapFunctie));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/functies", schrijven, async (req, res): Promise<void> => {
  try {
    const { naam, werkmaatschappij, omschrijving, taken, verantwoordelijkheden, competenties, opleidingsvereisten, doorgroeipad, uitvoerend, actief, minimale_bezetting, profiel_id } = req.body;
    if (!naam) return void res.status(400).json({ error: "naam is verplicht" });
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
        profielId: profiel_id ?? null,
        uitvoerend: uitvoerend ?? false,
        actief: actief ?? true,
        minimaleBezetting: minimale_bezetting ?? null,
      })
      .returning();
    res.status(201).json(mapFunctie(f));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.get("/functies/:id", lezen, async (req, res): Promise<void> => {
  try {
    const [f] = await db.select().from(functiesTable).where(eq(functiesTable.id, parseId(req.params.id)));
    if (!f) return void res.status(404).json({ error: "Functie niet gevonden" });
    res.json(mapFunctie(f));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.patch("/functies/:id", schrijven, async (req, res): Promise<void> => {
  try {
    const { naam, werkmaatschappij, omschrijving, taken, verantwoordelijkheden, competenties, opleidingsvereisten, doorgroeipad, uitvoerend, actief, minimale_bezetting, profiel_id } = req.body;
    const functieId = parseId(req.params.id);

    // Hardening (defense-in-depth): het koppelen of wijzigen van een
    // toegangsprofiel aan een functie is een rechten-gevoelige actie. Het
    // bepaalt welke bevoegdheden de functie richtinggevend voorstelt (de
    // onboarding-preview) en is de logische haak voor toekomstige automatische
    // toepassing. Een personeel:2-beheerder mag de overige functievelden
    // bewerken, maar alleen een hoofdbeheerder of iemand met volledig
    // gebruikersbeheer (gebruikers:4) mag profiel_id wijzigen. Een gelijk
    // gebleven profiel_id (bv. bij het opslaan van een ongewijzigd formulier)
    // vereist geen verhoogde rechten.
    let profielWijziging: { oud: number | null; nieuw: number | null } | null = null;
    if (profiel_id !== undefined) {
      const [huidig] = await db
        .select({ profielId: functiesTable.profielId })
        .from(functiesTable)
        .where(eq(functiesTable.id, functieId));
      const oud = huidig?.profielId ?? null;
      const nieuw = (profiel_id ?? null) as number | null;
      if (oud !== nieuw) {
        const magRechtenKoppelen =
          !!req.permissies &&
          (req.permissies.isHoofdbeheerder ||
            req.permissies.heeftModuleRecht("gebruikers", 4));
        if (!magRechtenKoppelen) {
          return void res.status(403).json({
            error:
              "Alleen een hoofdbeheerder of gebruikersbeheerder mag een toegangsprofiel aan een functie koppelen.",
          });
        }
        profielWijziging = { oud, nieuw };
      }
    }

    const werkgeverId = werkmaatschappij !== undefined ? await werkgeverIdVoor(werkmaatschappij) : undefined;
    const [f] = await db
      .update(functiesTable)
      .set({
        naam,
        werkmaatschappij,
        werkgeverId,
        omschrijving,
        taken,
        verantwoordelijkheden,
        competenties,
        opleidingsvereisten,
        doorgroeipad,
        uitvoerend,
        actief,
        ...(profiel_id !== undefined ? { profielId: profiel_id } : {}),
        ...(minimale_bezetting !== undefined ? { minimaleBezetting: minimale_bezetting } : {}),
        bijgewerktOp: new Date(),
      })
      .where(eq(functiesTable.id, functieId))
      .returning();
    if (!f) return void res.status(404).json({ error: "Functie niet gevonden" });

    if (profielWijziging) {
      const sessie = req.session as unknown as Record<string, unknown> | undefined;

      // Cascade (Optie D): tel alle medewerkers wiens effectieve bevoegdheden nu
      // direct zijn vernieuwd door de profielwijziging. Omdat bevoegdheden altijd
      // on-the-fly worden berekend (geen stored cache), is de cascade onmiddellijk
      // actief zonder DB-schrijfacties op gebruikersniveau.
      let aantalBetrokken = 0;
      try {
        const primair = await db
          .select({ medewerkerId: medewerkersTable.id })
          .from(medewerkersTable)
          .where(eq(medewerkersTable.functieId, functieId));
        const nevenstellingen = await db
          .select({ medewerkerId: medewerkerAanstellingenTable.medewerkerId })
          .from(medewerkerAanstellingenTable)
          .where(eq(medewerkerAanstellingenTable.functieId, functieId));
        const unieke = new Set([
          ...primair.map((r) => r.medewerkerId),
          ...nevenstellingen.map((r) => r.medewerkerId),
        ]);
        aantalBetrokken = unieke.size;
      } catch {
        // Cascade-telling is niet-kritisch; cascade zelf is per definitie actief.
      }

      logAudit({
        gebruikerId: (sessie?.userId as number | null | undefined) ?? null,
        gebruikerNaam:
          (sessie?.gebruikerNaam as string | null | undefined) ??
          (sessie?.naam as string | null | undefined) ??
          null,
        ipAdres: req.ip ?? null,
        sessieId: null,
        module: "functies",
        actie: "profiel-koppelen",
        entiteit: "functies",
        entiteitId: functieId,
        entiteitNaam: f.naam ?? null,
        oudeWaarde: null,
        nieuweWaarde: null,
        workflowStatus: null,
        gebouwId: null,
        medewerkerId: null,
        documentId: null,
        meta: {
          oudProfielId: profielWijziging.oud,
          nieuwProfielId: profielWijziging.nieuw,
          aantalBetrokkenMedewerkers: aantalBetrokken,
        } as Record<string, unknown>,
      });
    }

    res.json(mapFunctie(f));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.delete("/functies/:id", schrijven, async (req, res): Promise<void> => {
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

// Opleiding aan functie koppelen (toevoegen aan bestaande koppelingen).
async function koppelOpleidingAanFunctie(opleidingId: number, functieId: number): Promise<void> {
  const [bestaand] = await db
    .select()
    .from(functieOpleidingenTable)
    .where(and(eq(functieOpleidingenTable.opleidingId, opleidingId), eq(functieOpleidingenTable.functieId, functieId)));
  if (bestaand) return;

  const [functie] = await db.select({ id: functiesTable.id }).from(functiesTable).where(eq(functiesTable.id, functieId));
  if (!functie) return;

  await db.insert(functieOpleidingenTable).values({ opleidingId, functieId }).onConflictDoNothing();
}

const soortOf = (v: unknown): "opleiding" | "cursus" | undefined =>
  v === "opleiding" ? "opleiding" : v === "cursus" ? "cursus" : undefined;

// Kostenverdeling werkgever/werknemer moet, indien beide bekend zijn, optellen tot 100%.
// Geeft een foutmelding terug (of null als geldig) zodat routes vroeg met 400 kunnen stoppen.
function kostenverdelingFout(werkgeverPct: unknown, werknemerPct: unknown): string | null {
  const w1 = werkgeverPct != null ? Number(werkgeverPct) : null;
  const w2 = werknemerPct != null ? Number(werknemerPct) : null;

  if (w1 != null && (isNaN(w1) || w1 < 0 || w1 > 100)) return "Werkgever percentage moet tussen 0 en 100 liggen";
  if (w2 != null && (isNaN(w2) || w2 < 0 || w2 > 100)) return "Werknemer percentage moet tussen 0 en 100 liggen";

  if (w1 != null && w2 != null && w1 + w2 !== 100) {
    return "Kostenverdeling werkgever + werknemer moet optellen tot 100%";
  }

  // Als één van beide 100 is, moet de ander 0 zijn (indien gezet)
  if (w1 === 100 && w2 != null && w2 !== 0) return "Bij 100% werkgever moet werknemer 0% zijn";
  if (w2 === 100 && w1 != null && w1 !== 0) return "Bij 100% werknemer moet werkgever 0% zijn";

  return null;
}

router.get("/opleidingen", lezen, async (req, res): Promise<void> => {
  try {
    const rijen = await db.select().from(opleidingenTable).orderBy(opleidingenTable.naam);
    const kopMap = await haalOpleidingKoppelingen(rijen.map((r) => r.id));
    res.json(rijen.map((r) => mapOpleiding(r, kopMap.get(r.id))));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// Als slechts één van de twee percentages is ingevuld, vult dit de andere aan
// zodat de kostenverdeling altijd optelt tot 100% (afdwingen, niet alleen
// valideren wanneer beide toevallig zijn meegestuurd).
function vulKostenverdelingAan(
  werkgeverPct: unknown,
  werknemerPct: unknown,
): { werkgever: number | null; werknemer: number | null } {
  const w1 = werkgeverPct != null ? Number(werkgeverPct) : null;
  const w2 = werknemerPct != null ? Number(werknemerPct) : null;
  if (w1 != null && w2 == null) return { werkgever: w1, werknemer: Math.max(0, 100 - w1) };
  if (w2 != null && w1 == null) return { werkgever: Math.max(0, 100 - w2), werknemer: w2 };
  return { werkgever: w1, werknemer: w2 };
}

router.post("/opleidingen", schrijven, async (req, res): Promise<void> => {
  try {
    const {
      naam, categorie, soort, omschrijving, niveau, opleider, studieduur, studiebelasting,
      lesvorm, kosten_indicatie, geldigheid_maanden, verplicht, functie_ids,
    } = req.body;
    if (!naam) return void res.status(400).json({ error: "naam is verplicht" });
    const { werkgever: kosten_werkgever_pct, werknemer: kosten_werknemer_pct } =
      vulKostenverdelingAan(req.body.kosten_werkgever_pct, req.body.kosten_werknemer_pct);
    const kvFout = kostenverdelingFout(kosten_werkgever_pct, kosten_werknemer_pct);
    if (kvFout) return void res.status(400).json({ error: kvFout });
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

router.patch("/opleidingen/:id", schrijven, async (req, res): Promise<void> => {
  try {
    const {
      naam, categorie, soort, omschrijving, niveau, opleider, studieduur, studiebelasting,
      lesvorm, kosten_indicatie, geldigheid_maanden, verplicht, functie_ids,
    } = req.body;
    let { kosten_werkgever_pct, kosten_werknemer_pct } = req.body;
    const id = parseId(req.params.id);
    if (kosten_werkgever_pct !== undefined || kosten_werknemer_pct !== undefined) {
      // Slechts één kant meegestuurd bij PATCH: leidt de andere kant af zodat
      // de verdeling altijd optelt tot 100% (afdwingen), i.p.v. de bestaande
      // (mogelijk niet-complementaire) DB-waarde van de andere kant te laten staan.
      if (kosten_werkgever_pct === undefined || kosten_werknemer_pct === undefined) {
        const aangevuld = vulKostenverdelingAan(
          kosten_werkgever_pct !== undefined ? kosten_werkgever_pct : null,
          kosten_werknemer_pct !== undefined ? kosten_werknemer_pct : null,
        );
        if (kosten_werkgever_pct !== undefined) kosten_werknemer_pct = aangevuld.werknemer;
        if (kosten_werknemer_pct !== undefined) kosten_werkgever_pct = aangevuld.werkgever;
      }
      const kvFout = kostenverdelingFout(kosten_werkgever_pct, kosten_werknemer_pct);
      if (kvFout) return void res.status(400).json({ error: kvFout });
    }
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
    if (!o) return void res.status(404).json({ error: "Opleiding niet gevonden" });
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
router.post("/functies/:id/opleidingen-voorstel", schrijven, async (req, res): Promise<void> => {
  try {
    const [f] = await db.select().from(functiesTable).where(eq(functiesTable.id, parseId(req.params.id)));
    if (!f) return void res.status(404).json({ error: "Functie niet gevonden" });
    const resultaat = await stelOpleidingenVoor({
      naam: f.naam,
      werkmaatschappij: f.werkmaatschappij,
      omschrijving: f.omschrijving,
      taken: f.taken,
      verantwoordelijkheden: f.verantwoordelijkheden,
      competenties: f.competenties,
      opleidingsvereisten: f.opleidingsvereisten,
    }, {
      gebruikerId: req.session.userId ?? null,
      // medewerker_id is optioneel: wordt meegegeven als het voorstel voor een
      // specifieke medewerker wordt aangevraagd; bij een functie-niveau-aanroep null.
      medewerker_id: typeof req.body?.medewerker_id === "number" ? req.body.medewerker_id : null,
    });

    // Check of er al bestaande opleidingen zijn met dezelfde naam
    const verrijkt = await Promise.all(resultaat.voorstellen.map(async (v) => {
      const [bestaand] = await db
        .select({ id: opleidingenTable.id })
        .from(opleidingenTable)
        .where(eq(sql`LOWER(${opleidingenTable.naam})`, v.naam.toLowerCase()));
      return { ...v, bestaand_id: bestaand?.id ?? null };
    }));

    res.json({ ...resultaat, voorstellen: verrijkt });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/functies/:id/opleidingen/:opleidingId/koppel", schrijven, async (req, res): Promise<void> => {
  try {
    const functieId = parseId(req.params.id);
    const opleidingId = parseId(req.params.opleidingId);
    await koppelOpleidingAanFunctie(opleidingId, functieId);
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.delete("/opleidingen/:id", schrijven, async (req, res): Promise<void> => {
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
  let leidinggevendeNaam: string | null = null;
  if (m.leidinggevendeId != null) {
    const [lg] = await db.select({ naam: medewerkersTable.naam }).from(medewerkersTable).where(eq(medewerkersTable.id, m.leidinggevendeId));
    leidinggevendeNaam = lg?.naam ?? null;
  }
  let uitzendbureauNaam: string | null = null;
  if (m.uitzendbureauId != null) {
    const [org] = await db.select({ naam: crmKlantenTable.naam }).from(crmKlantenTable).where(eq(crmKlantenTable.id, m.uitzendbureauId));
    uitzendbureauNaam = org?.naam ?? null;
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
    leidinggevende_id: m.leidinggevendeId ?? null,
    leidinggevende_naam: leidinggevendeNaam,
    cao: m.cao,
    dienstverband: m.dienstverband,
    bedrijf_uitzendbureau: m.bedrijfUitzendbureau ?? null,
    uitzendbureau_id: m.uitzendbureauId ?? null,
    uitzendbureau_naam: uitzendbureauNaam,
    contracturen_per_week: m.contracturenPerWeek,
    deeltijd_percentage: m.deeltijdPercentage ?? null,
    in_dienst_sinds: m.inDienstSinds,
    uit_dienst_per: m.uitDienstPer,
    noodcontact_naam: m.noodcontactNaam,
    noodcontact_telefoon: m.noodcontactTelefoon,
    geboortedatum: m.geboortedatum ?? null,
    geboorteplaats: m.geboorteplaats ?? null,
    adres: m.adres ?? null,
    postcode: m.postcode ?? null,
    woonplaats: m.woonplaats ?? null,
    rijbewijs: m.rijbewijs ?? null,
    rijbewijs_vervaldatum: m.rijbewijsVervaldatum ?? null,
    vca_vervaldatum: m.vcaVervaldatum ?? null,
    ehbo_vervaldatum: m.ehboVervaldatum ?? null,
    bhv_vervaldatum: m.bhvVervaldatum ?? null,
    cv_tekst: m.cvTekst ?? null,
    actief: m.actief,
    opmerkingen: m.opmerkingen,
    aangemaakt_op: iso(m.aangemaaktOp),
    bijgewerkt_op: iso(m.bijgewerktOp),
  };
}

router.get("/medewerkers", lezen, async (req, res): Promise<void> => {
  try {
    const leidinggevenden = alias(medewerkersTable, "leidinggevenden");
    const rijen = await db
      .select({ m: medewerkersTable, functieNaam: functiesTable.naam, gebruikerRol: gebruikersTable.rol, leidinggevendeNaam: leidinggevenden.naam })
      .from(medewerkersTable)
      .leftJoin(functiesTable, eq(medewerkersTable.functieId, functiesTable.id))
      .leftJoin(gebruikersTable, eq(medewerkersTable.gebruikerId, gebruikersTable.id))
      .leftJoin(leidinggevenden, eq(medewerkersTable.leidinggevendeId, leidinggevenden.id))
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
        leidinggevende_id: r.m.leidinggevendeId ?? null,
        leidinggevende_naam: r.leidinggevendeNaam ?? null,
        cao: r.m.cao,
        dienstverband: r.m.dienstverband,
        contracturen_per_week: r.m.contracturenPerWeek,
        in_dienst_sinds: r.m.inDienstSinds,
        uit_dienst_per: r.m.uitDienstPer,
        noodcontact_naam: r.m.noodcontactNaam,
        noodcontact_telefoon: r.m.noodcontactTelefoon,
        geboortedatum: r.m.geboortedatum ?? null,
        geboorteplaats: r.m.geboorteplaats ?? null,
        adres: r.m.adres ?? null,
        postcode: r.m.postcode ?? null,
        woonplaats: r.m.woonplaats ?? null,
        rijbewijs: r.m.rijbewijs ?? null,
        rijbewijs_vervaldatum: r.m.rijbewijsVervaldatum ?? null,
        vca_vervaldatum: r.m.vcaVervaldatum ?? null,
        ehbo_vervaldatum: r.m.ehboVervaldatum ?? null,
        bhv_vervaldatum: r.m.bhvVervaldatum ?? null,
        cv_tekst: r.m.cvTekst ?? null,
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

router.post("/medewerkers", schrijven, async (req, res): Promise<void> => {
  try {
    const {
      naam, gebruiker_id, email, telefoon, mobiel, werkmaatschappij, functie_id,
      leidinggevende_id, cao, dienstverband, bedrijf_uitzendbureau, uitzendbureau_id, contracturen_per_week,
      in_dienst_sinds, uit_dienst_per, noodcontact_naam, noodcontact_telefoon, geboortedatum,
      geboorteplaats, adres, postcode, woonplaats, rijbewijs, rijbewijs_vervaldatum,
      vca_vervaldatum, ehbo_vervaldatum, bhv_vervaldatum, cv_tekst, actief, opmerkingen,
      verlofsoort_ids, jaar,
    } = req.body;
    if (!naam) return void res.status(400).json({ error: "naam is verplicht" });

    // Geconsolideerde onboarding: een medewerkerprofiel bestaat alleen als
    // koppeling aan een bestaand gebruikersaccount. Zonder gebruiker_id faalt
    // het aanmaken; onboarding maakt zelf nooit accounts aan.
    const gebruikerId = parseId(gebruiker_id);
    if (gebruiker_id == null || !Number.isFinite(gebruikerId)) {
      return void res.status(400).json({
        error: "gebruiker_id is verplicht: een medewerkerprofiel wordt altijd aan een bestaand gebruikersaccount gekoppeld.",
        velden: ["gebruiker_id"],
      });
    }
    const [bestaandeGebruiker] = await db
      .select({ id: gebruikersTable.id })
      .from(gebruikersTable)
      .where(eq(gebruikersTable.id, gebruikerId));
    if (!bestaandeGebruiker) {
      return void res.status(404).json({ error: "Gebruiker niet gevonden", code: "USER_NOT_FOUND" });
    }
    const [alGekoppeld] = await db
      .select({ id: medewerkersTable.id })
      .from(medewerkersTable)
      .where(eq(medewerkersTable.gebruikerId, gebruikerId));
    if (alGekoppeld) {
      return void res.status(409).json({
        error: "Deze gebruiker heeft al een medewerkerprofiel.",
        code: "EMPLOYEE_PROFILE_ALREADY_EXISTS",
        medewerker_id: alGekoppeld.id,
      });
    }

    const wm = werkmaatschappij || "FPS Brandpreventie";
    const [m] = await db
      .insert(medewerkersTable)
      .values({
        naam,
        gebruikerId,
        email,
        telefoon,
        mobiel,
        werkmaatschappij: wm,
        werkgeverId: await werkgeverIdVoor(wm),
        functieId: functie_id ?? null,
        leidinggevendeId: leidinggevende_id ?? null,
        cao,
        dienstverband: dienstverband || "vast",
        bedrijfUitzendbureau: bedrijf_uitzendbureau || null,
        uitzendbureauId: typeof uitzendbureau_id === "number" ? uitzendbureau_id : null,
        contracturenPerWeek: contracturen_per_week ?? null,
        inDienstSinds: in_dienst_sinds,
        uitDienstPer: uit_dienst_per,
        noodcontactNaam: noodcontact_naam,
        noodcontactTelefoon: noodcontact_telefoon,
        geboortedatum: geboortedatum || null,
        geboorteplaats: geboorteplaats || null,
        adres: adres || null,
        postcode: postcode || null,
        woonplaats: woonplaats || null,
        rijbewijs: rijbewijs || null,
        rijbewijsVervaldatum: rijbewijs_vervaldatum || null,
        vcaVervaldatum: vca_vervaldatum || null,
        ehboVervaldatum: ehbo_vervaldatum || null,
        bhvVervaldatum: bhv_vervaldatum || null,
        cvTekst: cv_tekst || null,
        actief: actief ?? true,
        opmerkingen,
      })
      .returning();

    // Verlofsaldo opbouwen indien verlofsoort_ids meegegeven én een bekende CAO gebruikt wordt.
    const ids: number[] = Array.isArray(verlofsoort_ids)
      ? verlofsoort_ids.map((v: unknown) => parseId(v)).filter((n) => Number.isFinite(n))
      : [];
    const caoOptie = CAO_OPTIES.find((c) => c.naam === cao);
    const uren = typeof contracturen_per_week === "number" ? contracturen_per_week : Number(contracturen_per_week);
    if (ids.length > 0 && caoOptie && Number.isFinite(uren) && uren > 0) {
      const saldoJaar = Number.isFinite(Number(jaar)) ? Number(jaar) : new Date().getFullYear();
      await maakVerlofprofielAan({ medewerkerId: m.id, caoOptie, contracturenPerWeek: uren, verlofsoortIds: ids, jaar: saldoJaar }, db);
    }

    invalideerContext("medewerker", m.id);
    res.status(201).json(await medewerkerNaarJson(m));
  } catch (err) {
    // Race met gelijktijdige onboarding: de unieke index op gebruiker_id is de
    // laatste wacht; vertaal een unique-violation naar hetzelfde 409-contract.
    if (isUniekeGebruikerKoppeling(err)) {
      return void res.status(409).json({
        error: "Deze gebruiker heeft al een medewerkerprofiel.",
        code: "EMPLOYEE_PROFILE_ALREADY_EXISTS",
      });
    }
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// Onboarding-context: identiteit van een te onboarden gebruikersaccount plus
// controle of er al een medewerkerprofiel bestaat. Bewust een eigen endpoint:
// GET /gebruikers/:id vereist gebruikers-leesbevoegdheid die personeelsbeheer
// niet altijd heeft, en de toewijsbare-gebruikerslijst bevat bewust geen
// e-mail/telefoon.
router.get("/medewerkers/onboarding-context/:gebruikerId", schrijven, async (req, res): Promise<void> => {
  try {
    const gebruikerId = parseId(req.params.gebruikerId);
    if (!Number.isFinite(gebruikerId)) {
      return void res.status(404).json({ error: "Gebruiker niet gevonden", code: "USER_NOT_FOUND" });
    }
    const [g] = await db
      .select({
        id: gebruikersTable.id,
        naam: gebruikersTable.naam,
        email: gebruikersTable.email,
        telefoon: gebruikersTable.telefoon,
        rol: gebruikersTable.rol,
        actief: gebruikersTable.actief,
      })
      .from(gebruikersTable)
      .where(eq(gebruikersTable.id, gebruikerId));
    if (!g || !g.actief || g.rol === "klant") {
      return void res.status(404).json({ error: "Gebruiker niet gevonden", code: "USER_NOT_FOUND" });
    }
    const [gekoppeld] = await db
      .select({ id: medewerkersTable.id, medewerkerStatus: medewerkersTable.medewerkerStatus })
      .from(medewerkersTable)
      .where(eq(medewerkersTable.gebruikerId, gebruikerId));
    if (gekoppeld && gekoppeld.medewerkerStatus !== "concept") {
      return void res.status(409).json({
        error: "Deze gebruiker heeft al een medewerkerprofiel.",
        code: "EMPLOYEE_PROFILE_ALREADY_EXISTS",
        medewerker_id: gekoppeld.id,
      });
    }
    res.json({
      gebruiker_id: g.id,
      naam: g.naam,
      email: g.email ?? null,
      telefoon: g.telefoon ?? null,
      concept_medewerker_id: gekoppeld?.id ?? null,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// Onboarding: koppel een gebruiker aan HRM met server-side controle op CAO,
// contracturen en aanvang dienstverband, en bouw direct verlofsaldo op.
router.post("/medewerkers/onboarding", schrijven, async (req, res): Promise<void> => {
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
      bedrijf_uitzendbureau,
      uitzendbureau_id,
      noodcontact_naam,
      noodcontact_telefoon,
      verlofsoort_ids,
      jaar,
    } = req.body;

    const velden: string[] = [];

    // gebruiker: moet bestaan (404) en mag nog geen medewerkerprofiel hebben (409)
    let gebruiker: { id: number; naam: string; email: string | null } | undefined;
    if (gebruiker_id == null) {
      velden.push("gebruiker_id");
    } else {
      const [g] = await db
        .select({ id: gebruikersTable.id, naam: gebruikersTable.naam, email: gebruikersTable.email })
        .from(gebruikersTable)
        .where(eq(gebruikersTable.id, parseId(gebruiker_id)));
      if (!g) {
        return void res.status(404).json({ error: "Gebruiker niet gevonden", code: "USER_NOT_FOUND", velden: ["gebruiker_id"] });
      }
      gebruiker = g;
    }

    // dubbele medewerker voor dezelfde gebruiker voorkomen
    if (gebruiker) {
      const [bestaand] = await db
        .select({ id: medewerkersTable.id })
        .from(medewerkersTable)
        .where(eq(medewerkersTable.gebruikerId, gebruiker.id));
      if (bestaand) {
        return void res.status(409).json({
          error: "Deze gebruiker heeft al een medewerkerprofiel.",
          code: "EMPLOYEE_PROFILE_ALREADY_EXISTS",
          medewerker_id: bestaand.id,
          velden: ["gebruiker_id"],
        });
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
      return void res.status(400).json({ error: "De ingevoerde gegevens zijn onvolledig of onjuist.", velden });
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
        bedrijfUitzendbureau: typeof bedrijf_uitzendbureau === "string" && bedrijf_uitzendbureau.trim() ? bedrijf_uitzendbureau.trim() : null,
        uitzendbureauId: typeof uitzendbureau_id === "number" ? uitzendbureau_id : null,
        contracturenPerWeek: uren,
        inDienstSinds: inDienstDatum ? inDienstDatum.toISOString().slice(0, 10) : in_dienst_sinds,
        noodcontactNaam: noodcontact_naam,
        noodcontactTelefoon: noodcontact_telefoon,
        actief: true,
      })
      .returning();

    // Verlofsaldo opbouwen (pro-rata op basis van contracturen t.o.v. CAO-norm) —
    // gecentraliseerd zodat onboarding en latere medewerker-aanmaak dezelfde regels volgen.
    const saldoJaar = Number.isFinite(Number(jaar)) ? Number(jaar) : new Date().getFullYear();
    const ids: number[] = Array.isArray(verlofsoort_ids) ? verlofsoort_ids.map((v: unknown) => parseId(v)).filter((n) => Number.isFinite(n)) : [];
    await maakVerlofprofielAan(
      {
        medewerkerId: m.id,
        caoOptie: caoOptie!,
        contracturenPerWeek: uren,
        verlofsoortIds: ids,
        jaar: saldoJaar,
      },
      db,
    );

    // Loondienst: concept-salarismutatie "Verloning nieuwe medewerker" klaarzetten voor SCAB.
    // Niet-blokkerend: als aanmaken mislukt gaat de onboarding gewoon door.
    const onboardingSess = req.session as { userId?: number; gebruikerNaam?: string };
    const inDienstDate = inDienstDatum ?? new Date(in_dienst_sinds as string);
    try {
      await db.insert(salarisMutatiesTable).values({
        medewerkerId: m.id,
        medewerkerNaam: m.naam,
        werkmaatschappij: m.werkmaatschappij,
        werkgeverId: m.werkgeverId ?? null,
        periodeJaar: inDienstDate.getFullYear(),
        periodeMaand: inDienstDate.getMonth() + 1,
        type: "Verloning nieuwe medewerker",
        omschrijving: `Aangemaakt via onboarding. Ingangsdatum: ${m.inDienstSinds ?? in_dienst_sinds}.`,
        ingangsdatum: m.inDienstSinds ?? (in_dienst_sinds as string) ?? null,
        bron: "onboarding",
        status: "concept",
        aangemaaktDoorId: onboardingSess.userId ?? null,
        aangemaaktDoorNaam: onboardingSess.gebruikerNaam ?? null,
      });
    } catch (mutatieErr) {
      req.log.warn({ err: mutatieErr, medewerkerId: m.id }, "onboarding: auto-salarismutatie aanmaken mislukt");
    }

    invalideerContext("medewerker", m.id);
    res.status(201).json(await medewerkerNaarJson(m));
  } catch (err) {
    // Race met gelijktijdige aanmaak: de unieke index op gebruiker_id is de
    // laatste wacht; vertaal een unique-violation naar hetzelfde 409-contract.
    if (isUniekeGebruikerKoppeling(err)) {
      return void res.status(409).json({
        error: "Deze gebruiker heeft al een medewerkerprofiel.",
        code: "EMPLOYEE_PROFILE_ALREADY_EXISTS",
      });
    }
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.get("/medewerkers/:id", lezen, async (req, res): Promise<void> => {
  try {
    const [m] = await db.select().from(medewerkersTable).where(eq(medewerkersTable.id, parseId(req.params.id)));
    if (!m) return void res.status(404).json({ error: "Medewerker niet gevonden" });
    res.json(await medewerkerNaarJson(m));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.patch("/medewerkers/:id", schrijven, async (req, res): Promise<void> => {
  try {
    const { naam, gebruiker_id, email, telefoon, mobiel, werkmaatschappij, functie_id, leidinggevende_id, cao, dienstverband, bedrijf_uitzendbureau, uitzendbureau_id, contracturen_per_week, deeltijd_percentage, in_dienst_sinds, uit_dienst_per, noodcontact_naam, noodcontact_telefoon, geboortedatum, geboorteplaats, adres, postcode, woonplaats, rijbewijs, rijbewijs_vervaldatum, vca_vervaldatum, ehbo_vervaldatum, bhv_vervaldatum, cv_tekst, actief, opmerkingen } = req.body;
    // Voorkom dat één account aan twee medewerkers gekoppeld raakt (onboarding blokkeert
    // dit al; hier ook bij profielwijziging, met de unieke index als laatste wacht).
    if (gebruiker_id != null) {
      const [bestaand] = await db
        .select({ id: medewerkersTable.id })
        .from(medewerkersTable)
        .where(and(eq(medewerkersTable.gebruikerId, parseId(gebruiker_id)), ne(medewerkersTable.id, parseId(req.params.id))));
      if (bestaand) {
        return void res.status(409).json({
          error: "Deze gebruiker heeft al een medewerkerprofiel.",
          code: "EMPLOYEE_PROFILE_ALREADY_EXISTS",
          medewerker_id: bestaand.id,
          velden: ["gebruiker_id"],
        });
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
        leidinggevendeId: leidinggevende_id !== undefined ? leidinggevende_id : undefined,
        cao,
        dienstverband,
        bedrijfUitzendbureau: bedrijf_uitzendbureau !== undefined ? (bedrijf_uitzendbureau || null) : undefined,
        uitzendbureauId: uitzendbureau_id !== undefined
          ? (typeof uitzendbureau_id === "number" ? uitzendbureau_id : null)
          : undefined,
        contracturenPerWeek: contracturen_per_week !== undefined ? contracturen_per_week : undefined,
        deeltijdPercentage: deeltijd_percentage !== undefined ? (deeltijd_percentage === null ? null : Number(deeltijd_percentage)) : undefined,
        inDienstSinds: in_dienst_sinds,
        uitDienstPer: uit_dienst_per,
        noodcontactNaam: noodcontact_naam,
        noodcontactTelefoon: noodcontact_telefoon,
        geboortedatum: geboortedatum !== undefined ? (geboortedatum || null) : undefined,
        geboorteplaats: geboorteplaats !== undefined ? (geboorteplaats || null) : undefined,
        adres: adres !== undefined ? (adres || null) : undefined,
        postcode: postcode !== undefined ? (postcode || null) : undefined,
        woonplaats: woonplaats !== undefined ? (woonplaats || null) : undefined,
        rijbewijs: rijbewijs !== undefined ? (rijbewijs || null) : undefined,
        rijbewijsVervaldatum: rijbewijs_vervaldatum !== undefined ? (rijbewijs_vervaldatum || null) : undefined,
        vcaVervaldatum: vca_vervaldatum !== undefined ? (vca_vervaldatum || null) : undefined,
        ehboVervaldatum: ehbo_vervaldatum !== undefined ? (ehbo_vervaldatum || null) : undefined,
        bhvVervaldatum: bhv_vervaldatum !== undefined ? (bhv_vervaldatum || null) : undefined,
        cvTekst: cv_tekst !== undefined ? (cv_tekst || null) : undefined,
        actief,
        opmerkingen,
        bijgewerktOp: new Date(),
      })
      .where(eq(medewerkersTable.id, parseId(req.params.id)))
      .returning();
    if (!m) return void res.status(404).json({ error: "Medewerker niet gevonden" });
    invalideerContext("medewerker", m.id);
    res.json(await medewerkerNaarJson(m));
  } catch (err) {
    // Race met gelijktijdige koppeling: unieke index vangt het; zelfde 409-contract.
    if (isUniekeGebruikerKoppeling(err)) {
      return void res.status(409).json({
        error: "Deze gebruiker heeft al een medewerkerprofiel.",
        code: "EMPLOYEE_PROFILE_ALREADY_EXISTS",
      });
    }
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.delete("/medewerkers/:id", schrijven, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params.id);
    await db.delete(medewerkersTable).where(eq(medewerkersTable.id, id));
    invalideerContext("medewerker", id);
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Medewerker-opleidingen (behaald) ────────────────────────────────────────
router.get("/medewerkers/:id/opleidingen", lezen, async (req, res): Promise<void> => {
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

router.post("/medewerkers/:id/opleidingen", schrijven, async (req, res): Promise<void> => {
  try {
    const { opleiding_id, status, behaald_op, verloopt_op, certificaat_document_id, opmerking } = req.body;
    if (opleiding_id == null) return void res.status(400).json({ error: "opleiding_id is verplicht" });
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

router.patch("/medewerker-opleidingen/:id", schrijven, async (req, res): Promise<void> => {
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
    if (!mo) return void res.status(404).json({ error: "Opleiding niet gevonden" });
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

router.delete("/medewerker-opleidingen/:id", schrijven, async (req, res): Promise<void> => {
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

router.get("/medewerkers/:id/bekwaamheden", lezen, async (req, res): Promise<void> => {
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

router.post("/medewerkers/:id/bekwaamheden", schrijven, async (req, res): Promise<void> => {
  try {
    const { onderwerp, categorie, niveau, vastgesteld_door, vastgesteld_op, opmerking } = req.body;
    if (!onderwerp) return void res.status(400).json({ error: "onderwerp is verplicht" });
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

// ── CAO-keuzes ───────────────────────────────────────────────────────────────
const mapCaoKeuze = (k: typeof medewerkerCaoKeuzesTable.$inferSelect) => ({
  id:           k.id,
  medewerker_id: k.medewerkerId,
  type:          k.type,
  jaar:          k.jaar,
  keuze:         k.keuze,
  fonds_naam:    k.fondsNaam,
  bedrag_cents:  k.bedragCents,
  toelichting:   k.toelichting,
  aangemaakt_op: iso(k.aangemaaktOp),
  bijgewerkt_op: iso(k.bijgewerktOp),
});

router.get("/medewerkers/:id/cao-keuzes", lezen, async (req, res): Promise<void> => {
  try {
    const rijen = await db
      .select()
      .from(medewerkerCaoKeuzesTable)
      .where(eq(medewerkerCaoKeuzesTable.medewerkerId, parseId(req.params.id)))
      .orderBy(medewerkerCaoKeuzesTable.type, desc(medewerkerCaoKeuzesTable.jaar));
    res.json(rijen.map(mapCaoKeuze));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/medewerkers/:id/cao-keuzes", schrijven, async (req, res): Promise<void> => {
  try {
    const { type, jaar, keuze, fonds_naam, bedrag_cents, toelichting } = req.body as Record<string, unknown>;
    if (!type || !keuze) return void res.status(400).json({ error: "type en keuze zijn verplicht" });
    const TOEGESTANE_TYPES = ["vakantiegeld", "gereedschapsgeld", "spaarfonds"];
    if (!TOEGESTANE_TYPES.includes(String(type))) return void res.status(400).json({ error: "Ongeldig type" });
    const [k] = await db
      .insert(medewerkerCaoKeuzesTable)
      .values({
        medewerkerId: parseId(req.params.id),
        type:       String(type),
        jaar:       typeof jaar === "number" ? jaar : null,
        keuze:      String(keuze),
        fondsNaam:  typeof fonds_naam === "string" ? fonds_naam : null,
        bedragCents: typeof bedrag_cents === "number" ? bedrag_cents : null,
        toelichting: typeof toelichting === "string" ? toelichting : null,
      })
      .returning();
    res.status(201).json(mapCaoKeuze(k));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.patch("/medewerkers/:id/cao-keuzes/:keuzeId", schrijven, async (req, res): Promise<void> => {
  try {
    const keuzeId = parseId(req.params.keuzeId);
    const mid     = parseId(req.params.id);
    const bestaand = await db
      .select()
      .from(medewerkerCaoKeuzesTable)
      .where(and(eq(medewerkerCaoKeuzesTable.id, keuzeId), eq(medewerkerCaoKeuzesTable.medewerkerId, mid)))
      .then((r) => r[0]);
    if (!bestaand) return void res.status(404).json({ error: "CAO-keuze niet gevonden" });
    const body = req.body as Record<string, unknown>;
    const update: Partial<typeof medewerkerCaoKeuzesTable.$inferInsert> = { bijgewerktOp: new Date() };
    if ("type"        in body) update.type       = String(body.type);
    if ("jaar"        in body) update.jaar        = typeof body.jaar === "number" ? body.jaar : null;
    if ("keuze"       in body) update.keuze       = String(body.keuze);
    if ("fonds_naam"  in body) update.fondsNaam   = typeof body.fonds_naam === "string" ? body.fonds_naam : null;
    if ("bedrag_cents" in body) update.bedragCents = typeof body.bedrag_cents === "number" ? body.bedrag_cents : null;
    if ("toelichting" in body) update.toelichting = typeof body.toelichting === "string" ? body.toelichting : null;
    const [bijgewerkt] = await db
      .update(medewerkerCaoKeuzesTable)
      .set(update)
      .where(eq(medewerkerCaoKeuzesTable.id, keuzeId))
      .returning();
    res.json(mapCaoKeuze(bijgewerkt));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.delete("/medewerkers/:id/cao-keuzes/:keuzeId", schrijven, async (req, res): Promise<void> => {
  try {
    const keuzeId = parseId(req.params.keuzeId);
    const mid     = parseId(req.params.id);
    const bestaand = await db
      .select()
      .from(medewerkerCaoKeuzesTable)
      .where(and(eq(medewerkerCaoKeuzesTable.id, keuzeId), eq(medewerkerCaoKeuzesTable.medewerkerId, mid)))
      .then((r) => r[0]);
    if (!bestaand) return void res.status(404).json({ error: "CAO-keuze niet gevonden" });
    await db.delete(medewerkerCaoKeuzesTable).where(eq(medewerkerCaoKeuzesTable.id, keuzeId));
    res.status(204).end();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// Centrale bekwaamheidsmatrix: alle bekwaamheden over alle medewerkers.
router.get("/bekwaamheden", lezen, async (req, res): Promise<void> => {
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

router.patch("/bekwaamheden/:id", schrijven, async (req, res): Promise<void> => {
  try {
    const { onderwerp, categorie, niveau, vastgesteld_door, vastgesteld_op, opmerking } = req.body;
    const [b] = await db
      .update(bekwaamhedenTable)
      .set({ onderwerp, categorie, niveau, vastgesteldDoor: vastgesteld_door, vastgesteldOp: vastgesteld_op, opmerking, bijgewerktOp: new Date() })
      .where(eq(bekwaamhedenTable.id, parseId(req.params.id)))
      .returning();
    if (!b) return void res.status(404).json({ error: "Bekwaamheid niet gevonden" });
    res.json(mapBekwaamheid(b));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.delete("/bekwaamheden/:id", schrijven, async (req, res): Promise<void> => {
  try {
    await db.delete(bekwaamhedenTable).where(eq(bekwaamhedenTable.id, parseId(req.params.id)));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Verlofsoorten (catalogus) ───────────────────────────────────────────────
// Vaste, herkenbare hoofdcategorieën — geen vrije tekst. Dit dekt de volledige
// verlofsoort-categoriedekking die vereist is (vakantie, ADV/ATV, tijd-voor-tijd,
// ziekte-koppeling, bijzonder verlof, onbetaald verlof) bovenop de bestaande
// vrije "categorie"-tekst (wettelijk/bovenwettelijk/cao/bijzonder).
export const VERLOF_HOOFDCATEGORIEEN = [
  "vakantie",
  "adv_atv",
  "tijd_voor_tijd",
  "ziekte",
  "bijzonder",
  "onbetaald",
  "overig",
] as const;
export type VerlofHoofdcategorie = (typeof VERLOF_HOOFDCATEGORIEEN)[number];

const mapVerlofsoort = (v: typeof verlofsoortenTable.$inferSelect) => ({
  id: v.id,
  naam: v.naam,
  categorie: v.categorie,
  hoofdcategorie: v.hoofdcategorie,
  is_tijd_voor_tijd: v.isTijdVoorTijd,
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

router.get("/verlofsoorten", lezen, async (req, res): Promise<void> => {
  try {
    const rijen = await db.select().from(verlofsoortenTable).orderBy(verlofsoortenTable.categorie, verlofsoortenTable.naam);
    res.json(rijen.map(mapVerlofsoort));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/verlofsoorten", schrijven, async (req, res): Promise<void> => {
  try {
    const { naam, categorie, hoofdcategorie, is_tijd_voor_tijd, cao, werkmaatschappij, betaald, collectief, opbouw_uren_per_jaar, opbouw_regel, verval_regel, juridisch_kader, toelichting, actief } = req.body;
    if (!naam) return void res.status(400).json({ error: "naam is verplicht" });
    if (hoofdcategorie !== undefined && !VERLOF_HOOFDCATEGORIEEN.includes(hoofdcategorie)) {
      return void res.status(400).json({ error: `hoofdcategorie moet één van: ${VERLOF_HOOFDCATEGORIEEN.join(", ")} zijn` });
    }
    const [v] = await db
      .insert(verlofsoortenTable)
      .values({
        naam,
        categorie: categorie || "wettelijk",
        hoofdcategorie: hoofdcategorie ?? "overig",
        isTijdVoorTijd: is_tijd_voor_tijd ?? false,
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

router.patch("/verlofsoorten/:id", schrijven, async (req, res): Promise<void> => {
  try {
    const { naam, categorie, hoofdcategorie, is_tijd_voor_tijd, cao, werkmaatschappij, betaald, collectief, opbouw_uren_per_jaar, opbouw_regel, verval_regel, juridisch_kader, toelichting, actief } = req.body;
    if (hoofdcategorie !== undefined && !VERLOF_HOOFDCATEGORIEEN.includes(hoofdcategorie)) {
      return void res.status(400).json({ error: `hoofdcategorie moet één van: ${VERLOF_HOOFDCATEGORIEEN.join(", ")} zijn` });
    }
    const [v] = await db
      .update(verlofsoortenTable)
      .set({
        naam,
        categorie,
        hoofdcategorie,
        isTijdVoorTijd: is_tijd_voor_tijd,
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
    if (!v) return void res.status(404).json({ error: "Verlofsoort niet gevonden" });
    res.json(mapVerlofsoort(v));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.delete("/verlofsoorten/:id", schrijven, async (req, res): Promise<void> => {
  try {
    await db.delete(verlofsoortenTable).where(eq(verlofsoortenTable.id, parseId(req.params.id)));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Verlofsaldo per medewerker ──────────────────────────────────────────────
router.get("/medewerkers/:id/verlofsaldi", lezen, async (req, res): Promise<void> => {
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

router.post("/medewerkers/:id/verlofsaldi", schrijven, async (req, res): Promise<void> => {
  try {
    const { verlofsoort_id, jaar, beginsaldo_uren, opgebouwd_uren, opgenomen_uren, saldo_uren, vervalt_op } = req.body;
    if (verlofsoort_id == null || jaar == null) return void res.status(400).json({ error: "verlofsoort_id en jaar zijn verplicht" });
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

router.patch("/verlofsaldi/:id", schrijven, async (req, res): Promise<void> => {
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
    if (!s) return void res.status(404).json({ error: "Verlofsaldo niet gevonden" });
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

router.delete("/verlofsaldi/:id", schrijven, async (req, res): Promise<void> => {
  try {
    await db.delete(verlofSaldiTable).where(eq(verlofSaldiTable.id, parseId(req.params.id)));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Verlofaanvragen ─────────────────────────────────────────────────────────
router.get("/medewerkers/:id/verlofaanvragen", lezen, async (req, res): Promise<void> => {
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

router.post("/medewerkers/:id/verlofaanvragen", schrijven, async (req, res): Promise<void> => {
  try {
    const { medewerker_id, verlofsoort_id, start_datum, eind_datum, aantal_uren, status, reden, opmerking } = req.body;
    if (verlofsoort_id == null || !start_datum || !eind_datum) return void res.status(400).json({ error: "verlofsoort_id, start_datum en eind_datum zijn verplicht" });
    
    // Server-side datumvolgorde validatie (#101)
    if (new Date(start_datum) > new Date(eind_datum)) {
      return void res.status(400).json({ error: "Startdatum mag niet na de einddatum liggen" });
    }

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
  const oudOpgenomen = s.opgenomenUren;
  const oudSaldo = s.saldoUren;
  const opgenomen = Math.round((s.opgenomenUren + deltaUren) * 10) / 10;
  const saldo = Math.round((s.beginsaldoUren + s.opgebouwdUren - opgenomen) * 10) / 10;
  await uitvoerder
    .update(verlofSaldiTable)
    .set({ opgenomenUren: opgenomen, saldoUren: saldo, bijgewerktOp: new Date() })
    .where(eq(verlofSaldiTable.id, s.id));
  logger.info(
    { saldo_id: s.id, medewerker_id: medewerkerId, verlofsoort_id: verlofsoortId, jaar, delta_uren: deltaUren, oud_opgenomen: oudOpgenomen, nieuw_opgenomen: opgenomen, oud_saldo: oudSaldo, nieuw_saldo: saldo },
    "verlof-saldo mutatie",
  );
}

const jaarVanDatum = (d: string) => {
  const y = new Date(d).getFullYear();
  return Number.isFinite(y) ? y : new Date().getFullYear();
};

// Schrijft een auditlogregel voor een verlofaanvraag. Fouten worden geslikt
// zodat de hoofdactie nooit blokkeert door een logfout.
async function logVerlofMutatie(
  uitvoerder: Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db,
  verlofaanvraagId: number,
  medewerkerId: number,
  actie: string,
  params: {
    oudStatus?: string | null;
    nieuwStatus?: string | null;
    opmerking?: string | null;
    uitgevoerdDoorId?: number | null;
  } = {},
) {
  try {
    await (uitvoerder as typeof db)
      .insert(verlofAanvraagLogTable)
      .values({
        verlofaanvraagId,
        medewerkerId,
        uitgevoerdDoorId: params.uitgevoerdDoorId ?? null,
        actie,
        oudStatus: params.oudStatus ?? null,
        nieuwStatus: params.nieuwStatus ?? null,
        opmerking: params.opmerking ?? null,
      });
  } catch (err) {
    // Auditlog-fout blokkeert de hoofdactie niet, maar wordt geregistreerd.
    logger.error({ err, verlofaanvraagId, actie }, "logVerlofMutatie: audit insert mislukt");
  }
}

// Koppelt een ziekmelding aan ADV/ATV-verlofaanvragen: aangevraagde of goedgekeurde
// ADV-aanvragen die overlappen met de ziekteperiode worden automatisch ingetrokken
// en het verlofsaldo wordt gecorrigeerd. Idempotent: al-ingetrokken aanvragen worden
// overgeslagen. Fouten blokkeren de hoofdactie niet (catch + log).
async function koppelZiekteAanAdv(
  medewerkerId: number,
  startDatum: string,
  eindDatum: string | null | undefined,
  actorId: number | null,
  logger: { info: (...a: unknown[]) => void; error: (...a: unknown[]) => void },
): Promise<number> {
  try {
    const eindStr = eindDatum ?? "9999-12-31";
    const overlappendAdv = await db
      .select({
        a: verlofAanvragenTable,
        hoofdcategorie: verlofsoortenTable.hoofdcategorie,
      })
      .from(verlofAanvragenTable)
      .leftJoin(verlofsoortenTable, eq(verlofAanvragenTable.verlofsoortId, verlofsoortenTable.id))
      .where(
        and(
          eq(verlofAanvragenTable.medewerkerId, medewerkerId),
          inArray(verlofAanvragenTable.status, ["aangevraagd", "goedgekeurd"]),
          lte(verlofAanvragenTable.startDatum, eindStr),
          gte(verlofAanvragenTable.eindDatum, startDatum),
        ),
      );

    const advAanvragen = overlappendAdv.filter((r) => r.hoofdcategorie === "adv_atv");
    if (advAanvragen.length === 0) return 0;

    let aantalIngetrokken = 0;
    await db.transaction(async (tx) => {
      for (const { a } of advAanvragen) {
        await tx
          .update(verlofAanvragenTable)
          .set({
            status: "ingetrokken",
            reden: "Automatisch ingetrokken wegens ziekmelding",
            beoordeeldOp: new Date(),
            bijgewerktOp: new Date(),
          })
          .where(eq(verlofAanvragenTable.id, a.id));

        if (a.status === "goedgekeurd" && a.aantalUren > 0) {
          await pasVerlofSaldoAan(tx, a.medewerkerId, a.verlofsoortId, jaarVanDatum(a.startDatum), -a.aantalUren);
        }

        await logVerlofMutatie(tx, a.id, a.medewerkerId, "ingetrokken_wegens_ziekte", {
          oudStatus: a.status,
          nieuwStatus: "ingetrokken",
          opmerking: "Automatisch ingetrokken wegens registratie ziekmelding",
          uitgevoerdDoorId: actorId,
        });

        aantalIngetrokken++;
      }
    });

    logger.info(
      { medewerker_id: medewerkerId, start_datum: startDatum, eind_datum: eindDatum, ingetrokken: aantalIngetrokken },
      "ziekte-adv koppeling: ADV-aanvragen ingetrokken",
    );
    return aantalIngetrokken;
  } catch (err) {
    logger.error({ err, medewerker_id: medewerkerId }, "ziekte-adv koppeling: fout bij intrekken ADV-aanvragen");
    return 0;
  }
}

// Centrale beoordelingslijst: alle verlofaanvragen, optioneel gefilterd op status en/of team.
router.get("/verlofaanvragen", lezen, async (req, res): Promise<void> => {
  try {
    const statusFilter = typeof req.query.status === "string" ? req.query.status : null;
    const mijnTeam = req.query.mijn_team === "true";

    // Bij mijn_team=true: alleen aanvragen van medewerkers waarvoor de ingelogde
    // gebruiker leidinggevende is. Beheerder met personeel:2 ziet altijd alles tenzij
    // expliciet mijn_team=true is gevraagd.
    let medewerkerFilter: Set<number> | null = null;
    if (mijnTeam) {
      const mijnMedewerkerId = await medewerkerIdVoorGebruiker(req.session.userId ?? null);
      if (mijnMedewerkerId != null) {
        const teamleden = await db
          .select({ id: medewerkersTable.id })
          .from(medewerkersTable)
          .where(eq(medewerkersTable.leidinggevendeId, mijnMedewerkerId));
        medewerkerFilter = new Set(teamleden.map((t) => t.id));
      } else {
        medewerkerFilter = new Set(); // geen medewerkerrecord: geen team zichtbaar
      }
    }

    const rijen = await db
      .select({ a: verlofAanvragenTable, verlofsoortNaam: verlofsoortenTable.naam, medewerkerNaam: medewerkersTable.naam })
      .from(verlofAanvragenTable)
      .leftJoin(verlofsoortenTable, eq(verlofAanvragenTable.verlofsoortId, verlofsoortenTable.id))
      .leftJoin(medewerkersTable, eq(verlofAanvragenTable.medewerkerId, medewerkersTable.id))
      .orderBy(desc(verlofAanvragenTable.startDatum));
    res.json(
      rijen
        .filter((r) => !statusFilter || r.a.status === statusFilter)
        .filter((r) => !medewerkerFilter || medewerkerFilter.has(r.a.medewerkerId))
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
          bezetting_overschreden: r.a.bezettingOverschreden ?? null,
          aangemaakt_op: iso(r.a.aangemaaktOp),
          bijgewerkt_op: iso(r.a.bijgewerktOp),
        })),
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.patch("/verlofaanvragen/:id", async (req, res): Promise<void> => {
  try {
    const { verlofsoort_id, start_datum, eind_datum, aantal_uren, status, reden, opmerking, negeer_bezetting } = req.body;
    const aanvraagId = parseId(req.params.id);

    // Server-side datumvolgorde validatie (#101)
    if (start_datum && eind_datum && new Date(start_datum) > new Date(eind_datum)) {
      return void res.status(400).json({ error: "Startdatum mag niet na de einddatum liggen" });
    }

    // Veldwijzigingen ANDERS dan status/reden/opmerking (verlofsoort, datums, uren)
    // blijven personeel-schrijfrecht vereisen — dit is administratieve correctie,
    // geen beoordeling. De statuswijziging zelf loopt via de WorkflowEngine, die de
    // leidinggevende-autorisatie (magUitvoeren) toepast; zo kan een leidinggevende
    // zonder personeel:2 wél goedkeuren/afwijzen, maar geen andere velden wijzigen.
    const wijzigtOverigeVelden = verlofsoort_id != null || start_datum !== undefined || eind_datum !== undefined || aantal_uren !== undefined;
    if (wijzigtOverigeVelden) {
      const magSchrijven = !!req.permissies && (req.permissies.isHoofdbeheerder || req.permissies.heeftModuleRecht("personeel", 2));
      if (!magSchrijven) {
        return void res.status(403).json({ error: "Onvoldoende bevoegdheid om deze velden te wijzigen" });
      }
    }

    // Status via de WorkflowEngine — valideert de transitie, past saldo aan en schrijft
    // de auditlog. reden en opmerking worden doorgegeven als params zodat de engine
    // ze kan gebruiken voor de precheck (verplichte reden bij afwijzen) en de log.
    if (status !== undefined) {
      const ctx = await maakTransitieContext(req, db, { reden, opmerking, negeer_bezetting: negeer_bezetting === true });
      const result = await workflowService.transiteer("verlofaanvraag", aanvraagId, status, ctx);
      if (!result.ok) {
        return void res.status(result.error!.httpStatus).json({
          error: result.error!.bericht,
          ...(result.error!.velden ? { velden: result.error!.velden } : {}),
        });
      }
    } else if (!wijzigtOverigeVelden && reden === undefined && opmerking === undefined) {
      return void res.status(400).json({ error: "Geen wijzigingen opgegeven" });
    }

    // Overige veldwijzigingen (verlofsoort, datums, uren, notities) los bijwerken
    const [a] = await db
      .update(verlofAanvragenTable)
      .set({
        ...(verlofsoort_id != null ? { verlofsoortId: parseId(verlofsoort_id) } : {}),
        ...(start_datum !== undefined ? { startDatum: start_datum } : {}),
        ...(eind_datum !== undefined ? { eindDatum: eind_datum } : {}),
        ...(aantal_uren !== undefined ? { aantalUren: aantal_uren } : {}),
        ...(reden !== undefined ? { reden } : {}),
        ...(opmerking !== undefined ? { opmerking } : {}),
        bijgewerktOp: new Date(),
      })
      .where(eq(verlofAanvragenTable.id, aanvraagId))
      .returning();
    if (!a) return void res.status(404).json({ error: "Verlofaanvraag niet gevonden" });

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
      bezetting_overschreden: a.bezettingOverschreden ?? null,
      aangemaakt_op: iso(a.aangemaaktOp),
      bijgewerkt_op: iso(a.bijgewerktOp),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.delete("/verlofaanvragen/:id", schrijven, async (req, res): Promise<void> => {
  try {
    await db.delete(verlofAanvragenTable).where(eq(verlofAanvragenTable.id, parseId(req.params.id)));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Auditlog voor verlofaanvragen ────────────────────────────────────────────
router.get("/verlofaanvragen/:id/log", lezen, async (req, res): Promise<void> => {
  try {
    const aanvraagId = parseId(req.params.id);
    const rijen = await db
      .select({
        l: verlofAanvraagLogTable,
        uitgevoerdDoorNaam: gebruikersTable.naam,
      })
      .from(verlofAanvraagLogTable)
      .leftJoin(gebruikersTable, eq(verlofAanvraagLogTable.uitgevoerdDoorId, gebruikersTable.id))
      .where(eq(verlofAanvraagLogTable.verlofaanvraagId, aanvraagId))
      .orderBy(desc(verlofAanvraagLogTable.aangemaaktOp));
    res.json(
      rijen.map((r) => ({
        id: r.l.id,
        verlofaanvraag_id: r.l.verlofaanvraagId,
        medewerker_id: r.l.medewerkerId,
        uitgevoerd_door_id: r.l.uitgevoerdDoorId,
        uitgevoerd_door_naam: r.uitgevoerdDoorNaam ?? null,
        actie: r.l.actie,
        oud_status: r.l.oudStatus,
        nieuw_status: r.l.nieuwStatus,
        opmerking: r.l.opmerking,
        aangemaakt_op: iso(r.l.aangemaaktOp),
      })),
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Feestdagen ───────────────────────────────────────────────────────────────
const mapFeestdag = (f: typeof feestdagenTable.$inferSelect) => ({
  id: f.id,
  werkgever_id: f.werkgeverId,
  jaar: f.jaar,
  datum: f.datum,
  naam: f.naam,
  aangemaakt_op: iso(f.aangemaaktOp),
  bijgewerkt_op: iso(f.bijgewerktOp),
});

router.get("/feestdagen", lezen, async (req, res): Promise<void> => {
  try {
    const jaar = req.query.jaar ? Number(req.query.jaar) : new Date().getFullYear();
    const werkgeverId = req.query.werkgever_id ? parseId(req.query.werkgever_id) : undefined;
    const rijen = await db
      .select()
      .from(feestdagenTable)
      .where(
        and(
          eq(feestdagenTable.jaar, jaar),
          werkgeverId ? or(isNull(feestdagenTable.werkgeverId), eq(feestdagenTable.werkgeverId, werkgeverId)) : undefined,
        ),
      )
      .orderBy(feestdagenTable.datum);
    res.json(rijen.map(mapFeestdag));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/feestdagen", alleenBeheerder, async (req, res): Promise<void> => {
  try {
    const { werkgever_id, jaar, datum, naam } = req.body;
    if (!datum || !naam || !jaar) return void res.status(400).json({ error: "datum, naam en jaar zijn verplicht" });
    const [f] = await db
      .insert(feestdagenTable)
      .values({
        werkgeverId: werkgever_id ?? null,
        jaar: Number(jaar),
        datum,
        naam,
      })
      .returning();
    res.status(201).json(mapFeestdag(f));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.patch("/feestdagen/:id", alleenBeheerder, async (req, res): Promise<void> => {
  try {
    const { datum, naam, jaar, werkgever_id } = req.body;
    const [f] = await db
      .update(feestdagenTable)
      .set({
        ...(datum != null ? { datum } : {}),
        ...(naam != null ? { naam } : {}),
        ...(jaar != null ? { jaar: Number(jaar) } : {}),
        ...(werkgever_id !== undefined ? { werkgeverId: werkgever_id ?? null } : {}),
        bijgewerktOp: new Date(),
      })
      .where(eq(feestdagenTable.id, parseId(req.params.id)))
      .returning();
    if (!f) return void res.status(404).json({ error: "Feestdag niet gevonden" });
    res.json(mapFeestdag(f));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.delete("/feestdagen/:id", alleenBeheerder, async (req, res): Promise<void> => {
  try {
    await db.delete(feestdagenTable).where(eq(feestdagenTable.id, parseId(req.params.id)));
    res.status(204).end();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Verlof-instellingen ──────────────────────────────────────────────────────
const mapVerlofInstellingen = (vi: typeof verlofInstellingenTable.$inferSelect) => ({
  id: vi.id,
  werkgever_id: vi.werkgeverId,
  jaar: vi.jaar,
  max_aaneengesloten: vi.maxAaneengesloten,
  aanvraag_termijn_dagen: vi.aanvraagTermijnDagen,
  goedkeuring_automatisch: vi.goedkeuringAutomatisch,
  auto_goedkeuring_drempel_uren: vi.autoGoedkeuringDrempelUren,
  notificatie_email: vi.notificatieEmail,
  opmerking: vi.opmerking,
  aangemaakt_op: iso(vi.aangemaaktOp),
  bijgewerkt_op: iso(vi.bijgewerktOp),
});

router.get("/verlof-instellingen", lezen, async (req, res): Promise<void> => {
  try {
    const jaar = req.query.jaar ? Number(req.query.jaar) : undefined;
    const rijen = await db
      .select()
      .from(verlofInstellingenTable)
      .where(jaar ? eq(verlofInstellingenTable.jaar, jaar) : undefined)
      .orderBy(desc(verlofInstellingenTable.jaar));
    res.json(rijen.map(mapVerlofInstellingen));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/verlof-instellingen", alleenBeheerder, async (req, res): Promise<void> => {
  try {
    const { werkgever_id, jaar, max_aaneengesloten, aanvraag_termijn_dagen, goedkeuring_automatisch, auto_goedkeuring_drempel_uren, notificatie_email, opmerking } = req.body;
    if (!jaar) return void res.status(400).json({ error: "jaar is verplicht" });
    const [vi] = await db
      .insert(verlofInstellingenTable)
      .values({
        werkgeverId: werkgever_id ?? null,
        jaar: Number(jaar),
        maxAaneengesloten: max_aaneengesloten ?? null,
        aanvraagTermijnDagen: aanvraag_termijn_dagen ?? null,
        goedkeuringAutomatisch: goedkeuring_automatisch ?? false,
        autoGoedkeuringDrempelUren: auto_goedkeuring_drempel_uren ?? null,
        notificatieEmail: notificatie_email ?? null,
        opmerking: opmerking ?? null,
      })
      .returning();
    res.status(201).json(mapVerlofInstellingen(vi));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.patch("/verlof-instellingen/:id", alleenBeheerder, async (req, res): Promise<void> => {
  try {
    const { werkgever_id, jaar, max_aaneengesloten, aanvraag_termijn_dagen, goedkeuring_automatisch, auto_goedkeuring_drempel_uren, notificatie_email, opmerking } = req.body;
    const [vi] = await db
      .update(verlofInstellingenTable)
      .set({
        ...(werkgever_id !== undefined ? { werkgeverId: werkgever_id ?? null } : {}),
        ...(jaar != null ? { jaar: Number(jaar) } : {}),
        ...(max_aaneengesloten !== undefined ? { maxAaneengesloten: max_aaneengesloten ?? null } : {}),
        ...(aanvraag_termijn_dagen !== undefined ? { aanvraagTermijnDagen: aanvraag_termijn_dagen ?? null } : {}),
        ...(goedkeuring_automatisch !== undefined ? { goedkeuringAutomatisch: goedkeuring_automatisch } : {}),
        ...(auto_goedkeuring_drempel_uren !== undefined ? { autoGoedkeuringDrempelUren: auto_goedkeuring_drempel_uren ?? null } : {}),
        ...(notificatie_email !== undefined ? { notificatieEmail: notificatie_email ?? null } : {}),
        ...(opmerking !== undefined ? { opmerking: opmerking ?? null } : {}),
        bijgewerktOp: new Date(),
      })
      .where(eq(verlofInstellingenTable.id, parseId(req.params.id)))
      .returning();
    if (!vi) return void res.status(404).json({ error: "Instellingen niet gevonden" });
    res.json(mapVerlofInstellingen(vi));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.delete("/verlof-instellingen/:id", alleenBeheerder, async (req, res): Promise<void> => {
  try {
    await db.delete(verlofInstellingenTable).where(eq(verlofInstellingenTable.id, parseId(req.params.id)));
    res.status(204).end();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Jaarafsluiting-regels ────────────────────────────────────────────────────
const mapJaarAfsluitingRegel = (j: typeof jaarAfsluitingRegelsTable.$inferSelect) => ({
  id: j.id,
  werkgever_id: j.werkgeverId,
  jaar: j.jaar,
  verlofsoort_id: j.verlofsoortId,
  max_overdracht_uren: j.maxOverdrachtUren,
  overdracht_verval_datum: j.overdrachtVervalDatum,
  uitgevoerd_op: j.uitgevoerdOp ? iso(j.uitgevoerdOp) : null,
  uitgevoerd_door_id: j.uitgevoerdDoorId,
  opmerking: j.opmerking,
  aangemaakt_op: iso(j.aangemaaktOp),
  bijgewerkt_op: iso(j.bijgewerktOp),
});

router.get("/jaarafsluiting-regels", lezen, async (req, res): Promise<void> => {
  try {
    const jaar = req.query.jaar ? Number(req.query.jaar) : undefined;
    const rijen = await db
      .select()
      .from(jaarAfsluitingRegelsTable)
      .where(jaar ? eq(jaarAfsluitingRegelsTable.jaar, jaar) : undefined)
      .orderBy(desc(jaarAfsluitingRegelsTable.jaar));
    res.json(rijen.map(mapJaarAfsluitingRegel));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/jaarafsluiting-regels", alleenBeheerder, async (req, res): Promise<void> => {
  try {
    const { werkgever_id, jaar, verlofsoort_id, max_overdracht_uren, overdracht_verval_datum, opmerking } = req.body;
    if (!jaar) return void res.status(400).json({ error: "jaar is verplicht" });
    const [j] = await db
      .insert(jaarAfsluitingRegelsTable)
      .values({
        werkgeverId: werkgever_id ?? null,
        jaar: Number(jaar),
        verlofsoortId: verlofsoort_id ?? null,
        maxOverdrachtUren: max_overdracht_uren ?? null,
        overdrachtVervalDatum: overdracht_verval_datum ?? null,
        opmerking: opmerking ?? null,
      })
      .returning();
    res.status(201).json(mapJaarAfsluitingRegel(j));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.patch("/jaarafsluiting-regels/:id", alleenBeheerder, async (req, res): Promise<void> => {
  try {
    const { werkgever_id, jaar, verlofsoort_id, max_overdracht_uren, overdracht_verval_datum, opmerking } = req.body;
    const [j] = await db
      .update(jaarAfsluitingRegelsTable)
      .set({
        ...(werkgever_id !== undefined ? { werkgeverId: werkgever_id ?? null } : {}),
        ...(jaar != null ? { jaar: Number(jaar) } : {}),
        ...(verlofsoort_id !== undefined ? { verlofsoortId: verlofsoort_id ?? null } : {}),
        ...(max_overdracht_uren !== undefined ? { maxOverdrachtUren: max_overdracht_uren ?? null } : {}),
        ...(overdracht_verval_datum !== undefined ? { overdrachtVervalDatum: overdracht_verval_datum ?? null } : {}),
        ...(opmerking !== undefined ? { opmerking: opmerking ?? null } : {}),
        bijgewerktOp: new Date(),
      })
      .where(eq(jaarAfsluitingRegelsTable.id, parseId(req.params.id)))
      .returning();
    if (!j) return void res.status(404).json({ error: "Regel niet gevonden" });
    res.json(mapJaarAfsluitingRegel(j));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.delete("/jaarafsluiting-regels/:id", alleenBeheerder, async (req, res): Promise<void> => {
  try {
    await db.delete(jaarAfsluitingRegelsTable).where(eq(jaarAfsluitingRegelsTable.id, parseId(req.params.id)));
    res.status(204).end();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Jaarafsluiting-verwerking ────────────────────────────────────────────────
// Drooglooppreview: berekent wat er zou worden overgedragen zonder te schrijven.
// Verwerking: draagt saldo's over en zet uitgevoerd_op op de regels.
// Altijd alleenBeheerder (systeem-niveau actie).
router.post("/hrm/jaarafsluiting", alleenBeheerder, async (req, res): Promise<void> => {
  try {
    const { jaar, droogloop } = req.body;
    if (!jaar) return void res.status(400).json({ error: "jaar is verplicht" });
    const afsluitJaar = Number(jaar);
    const volgendJaar = afsluitJaar + 1;
    const gebruikerId = req.session.userId ?? null;

    // Idempotentie: weiger als er al regels zijn die uitgevoerd zijn voor dit jaar
    const [reedUitgevoerd] = await db
      .select({ id: jaarAfsluitingRegelsTable.id, uitgevoerdOp: jaarAfsluitingRegelsTable.uitgevoerdOp })
      .from(jaarAfsluitingRegelsTable)
      .where(
        and(
          eq(jaarAfsluitingRegelsTable.jaar, afsluitJaar),
          sql`${jaarAfsluitingRegelsTable.uitgevoerdOp} IS NOT NULL`,
        ),
      )
      .limit(1);
    if (reedUitgevoerd && !droogloop) {
      return void res.status(409).json({
        error: `Jaarafsluiting ${afsluitJaar} is al uitgevoerd op ${reedUitgevoerd.uitgevoerdOp?.toISOString().slice(0, 10)}. Kan niet opnieuw worden uitgevoerd.`,
      });
    }

    // Haal alle medewerkers op met actieve saldi voor het af te sluiten jaar
    const saldi = await db
      .select({
        s: verlofSaldiTable,
        verlofsoortNaam: verlofsoortenTable.naam,
        verlofsoortCategorie: verlofsoortenTable.categorie,
        medewerkerNaam: medewerkersTable.naam,
      })
      .from(verlofSaldiTable)
      .leftJoin(verlofsoortenTable, eq(verlofSaldiTable.verlofsoortId, verlofsoortenTable.id))
      .leftJoin(medewerkersTable, eq(verlofSaldiTable.medewerkerId, medewerkersTable.id))
      .where(and(eq(verlofSaldiTable.jaar, afsluitJaar), gte(verlofSaldiTable.saldoUren, 0.1)));

    // Haal de jaarafsluiting-regels op voor dit jaar
    const regels = await db
      .select()
      .from(jaarAfsluitingRegelsTable)
      .where(eq(jaarAfsluitingRegelsTable.jaar, afsluitJaar));

    // Per saldo berekenen wat er overgedragen wordt
    const overdrachten: {
      medewerker_id: number;
      medewerker_naam: string | null;
      verlofsoort_id: number;
      verlofsoort_naam: string | null;
      saldo_uren: number;
      over_te_dragen_uren: number;
      verval_datum: string | null;
    }[] = [];

    for (const rij of saldi) {
      const saldo = rij.s;
      // Zoek de meest specifieke regel: verlofsoort-specifiek heeft voorrang op algemeen
      const regel =
        regels.find((r) => r.verlofsoortId === saldo.verlofsoortId) ??
        regels.find((r) => r.verlofsoortId == null);

      const maxOverdracht = regel?.maxOverdrachtUren ?? saldo.saldoUren;
      const overTeDragen = Math.min(saldo.saldoUren, maxOverdracht);
      if (overTeDragen <= 0) continue;

      overdrachten.push({
        medewerker_id: saldo.medewerkerId,
        medewerker_naam: rij.medewerkerNaam ?? null,
        verlofsoort_id: saldo.verlofsoortId,
        verlofsoort_naam: rij.verlofsoortNaam ?? null,
        saldo_uren: saldo.saldoUren,
        over_te_dragen_uren: Math.round(overTeDragen * 10) / 10,
        verval_datum: regel?.overdrachtVervalDatum ?? null,
      });
    }

    if (droogloop) {
      return void res.json({
        jaar: afsluitJaar,
        volgend_jaar: volgendJaar,
        droogloop: true,
        overdrachten,
        totaal_medewerkers: new Set(overdrachten.map((o) => o.medewerker_id)).size,
        totaal_uren: Math.round(overdrachten.reduce((s, o) => s + o.over_te_dragen_uren, 0) * 10) / 10,
      });
    }

    // Verwerking: saldo's overdragen in transactie (atomair, idempotent via lock)
    const verwerkOp = new Date();
    await db.transaction(async (tx) => {
      // Idempotentie-lock binnen de transactie: voorkomt race tussen gelijktijdige verzoeken
      const [nogmaalsCheck] = await tx
        .select({ id: jaarAfsluitingRegelsTable.id })
        .from(jaarAfsluitingRegelsTable)
        .where(and(eq(jaarAfsluitingRegelsTable.jaar, afsluitJaar), sql`${jaarAfsluitingRegelsTable.uitgevoerdOp} IS NOT NULL`))
        .for("update")
        .limit(1);
      if (nogmaalsCheck) throw Object.assign(new Error("al_uitgevoerd"), { statusCode: 409 });

      for (const ot of overdrachten) {
        // 1. Debiteer het bronsaldo terwijl de boekhoudkundige invariant behouden blijft:
        //    saldo = beginsaldo + opgebouwd - opgenomen
        //    De overdracht verhoogt 'opgenomen' (special jaar-einde opname) en verlaagt 'saldo'.
        //    Dit zorgt dat pasVerlofSaldoAan later niet terugrekent naar het oude saldo.
        const [bronSaldo] = await tx
          .select()
          .from(verlofSaldiTable)
          .where(
            and(
              eq(verlofSaldiTable.medewerkerId, ot.medewerker_id),
              eq(verlofSaldiTable.verlofsoortId, ot.verlofsoort_id),
              eq(verlofSaldiTable.jaar, afsluitJaar),
            ),
          )
          .for("update");
        if (bronSaldo) {
          const nieuweOpgenomen = Math.round((bronSaldo.opgenomenUren + ot.over_te_dragen_uren) * 10) / 10;
          const nieuwBronSaldo = Math.max(0, Math.round((bronSaldo.beginsaldoUren + bronSaldo.opgebouwdUren - nieuweOpgenomen) * 10) / 10);
          await tx
            .update(verlofSaldiTable)
            .set({ opgenomenUren: nieuweOpgenomen, saldoUren: nieuwBronSaldo, bijgewerktOp: verwerkOp })
            .where(eq(verlofSaldiTable.id, bronSaldo.id));
          logger.info(
            { saldo_id: bronSaldo.id, medewerker_id: ot.medewerker_id, jaar: afsluitJaar, actie: "jaarafsluiting_debet", overdracht_uren: ot.over_te_dragen_uren, oud_saldo: bronSaldo.saldoUren, nieuw_saldo: nieuwBronSaldo },
            "jaarafsluiting: bronsaldo gedebiteert",
          );
        }

        // 2. Crediteer volgend jaar (upsert)
        const [bestaand] = await tx
          .select()
          .from(verlofSaldiTable)
          .where(
            and(
              eq(verlofSaldiTable.medewerkerId, ot.medewerker_id),
              eq(verlofSaldiTable.verlofsoortId, ot.verlofsoort_id),
              eq(verlofSaldiTable.jaar, volgendJaar),
            ),
          );
        if (bestaand) {
          await tx
            .update(verlofSaldiTable)
            .set({
              beginsaldoUren: Math.round((bestaand.beginsaldoUren + ot.over_te_dragen_uren) * 10) / 10,
              saldoUren: Math.round((bestaand.saldoUren + ot.over_te_dragen_uren) * 10) / 10,
              ...(ot.verval_datum ? { vervaltOp: ot.verval_datum } : {}),
              bijgewerktOp: verwerkOp,
            })
            .where(eq(verlofSaldiTable.id, bestaand.id));
        } else {
          await tx.insert(verlofSaldiTable).values({
            medewerkerId: ot.medewerker_id,
            verlofsoortId: ot.verlofsoort_id,
            jaar: volgendJaar,
            beginsaldoUren: ot.over_te_dragen_uren,
            opgebouwdUren: 0,
            opgenomenUren: 0,
            saldoUren: ot.over_te_dragen_uren,
            vervaltOp: ot.verval_datum ?? undefined,
          });
        }

      }
      // Audit is vastgelegd via uitgevoerdOp/uitgevoerdDoorId op jaarAfsluitingRegelsTable.

      // 4. Markeer de regels als uitgevoerd (ook als er geen regels zijn, insert een markering)
      if (regels.length > 0) {
        await tx
          .update(jaarAfsluitingRegelsTable)
          .set({ uitgevoerdOp: verwerkOp, uitgevoerdDoorId: gebruikerId, bijgewerktOp: verwerkOp })
          .where(eq(jaarAfsluitingRegelsTable.jaar, afsluitJaar));
      } else {
        // Geen regels gedefinieerd → insert een systeemregel als bewijs dat het is uitgevoerd
        await tx.insert(jaarAfsluitingRegelsTable).values({
          jaar: afsluitJaar,
          werkgeverId: null,
          verlofsoortId: null,
          maxOverdrachtUren: null,
          overdrachtVervalDatum: null,
          opmerking: `Automatisch aangemaakt bij jaarafsluiting ${afsluitJaar}`,
          uitgevoerdOp: verwerkOp,
          uitgevoerdDoorId: gebruikerId,
        });
      }
    });

    res.json({
      jaar: afsluitJaar,
      volgend_jaar: volgendJaar,
      droogloop: false,
      overdrachten,
      totaal_medewerkers: new Set(overdrachten.map((o) => o.medewerker_id)).size,
      totaal_uren: Math.round(overdrachten.reduce((s, o) => s + o.over_te_dragen_uren, 0) * 10) / 10,
      uitgevoerd_op: new Date().toISOString(),
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "al_uitgevoerd") {
      return void res.status(409).json({ error: `Jaarafsluiting ${req.body?.jaar} is al uitgevoerd (race-condition geblokkeerd).` });
    }
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Handmatige saldocorrectie (met verplichte reden) ─────────────────────────
// Beheerdersactie: past het verlof-saldo van een medewerker handmatig aan.
// Audit-log (logger.info) registreert oud/nieuw/reden bij elke correctie.
router.post("/medewerkers/:id/saldocorrectie", alleenBeheerder, async (req, res): Promise<void> => {
  try {
    const medewerkerId = parseId(req.params.id);
    const { verlofsoort_id, jaar, delta_uren, reden } = req.body;
    if (!verlofsoort_id || !jaar || delta_uren === undefined || delta_uren === null) {
      return void res.status(400).json({ error: "verlofsoort_id, jaar en delta_uren zijn verplicht" });
    }
    if (!reden || String(reden).trim().length < 3) {
      return void res.status(400).json({ error: "reden is verplicht (minimaal 3 tekens)" });
    }
    const deltaUren = Number(delta_uren);
    if (!Number.isFinite(deltaUren) || deltaUren === 0) {
      return void res.status(400).json({ error: "delta_uren moet een getal ≠ 0 zijn" });
    }
    const gebruikerId = req.session.userId ?? null;

    const [m] = await db.select({ naam: medewerkersTable.naam }).from(medewerkersTable).where(eq(medewerkersTable.id, medewerkerId)).limit(1);
    if (!m) return void res.status(404).json({ error: "Medewerker niet gevonden" });

    await db.transaction(async (tx) => {
      const [s] = await tx
        .select()
        .from(verlofSaldiTable)
        .where(and(eq(verlofSaldiTable.medewerkerId, medewerkerId), eq(verlofSaldiTable.verlofsoortId, parseId(verlofsoort_id)), eq(verlofSaldiTable.jaar, Number(jaar))))
        .for("update")
        .limit(1);
      if (!s) throw Object.assign(new Error("saldo_niet_gevonden"), { statusCode: 404 });

      const oudOpgenomen = s.opgenomenUren;
      const oudSaldo = s.saldoUren;
      // Correctie = speciale opname (positief = afschrijven, negatief = terugboeken)
      const nieuweOpgenomen = Math.round((s.opgenomenUren + deltaUren) * 10) / 10;
      const nieuwSaldo = Math.round((s.beginsaldoUren + s.opgebouwdUren - nieuweOpgenomen) * 10) / 10;

      await tx.update(verlofSaldiTable)
        .set({ opgenomenUren: nieuweOpgenomen, saldoUren: nieuwSaldo, bijgewerktOp: new Date() })
        .where(eq(verlofSaldiTable.id, s.id));

      // Zichtbaar in verlofoverzicht medewerker (append-only auditlog)
      await tx.insert(verlofCorrectiesTable).values({
        medewerkerId,
        verlofsoortId: parseId(verlofsoort_id),
        jaar: Number(jaar),
        deltaUren,
        reden: String(reden).trim(),
        uitgevoerdDoorId: gebruikerId ?? undefined,
      });

      logger.info(
        { saldo_id: s.id, medewerker_id: medewerkerId, verlofsoort_id: parseId(verlofsoort_id), jaar: Number(jaar), delta_uren: deltaUren, oud_opgenomen: oudOpgenomen, oud_saldo: oudSaldo, nieuw_opgenomen: nieuweOpgenomen, nieuw_saldo: nieuwSaldo, reden: String(reden).trim(), uitgevoerd_door: gebruikerId },
        "verlof-saldo handmatige correctie",
      );
    });

    res.json({ ok: true });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "saldo_niet_gevonden") {
      return void res.status(404).json({ error: "Geen verlof-saldo gevonden voor dit jaar en verlofsoort" });
    }
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Verlof-correcties ophalen (HRM + medewerker) ────────────────────────────

router.get("/medewerkers/:id/verlof-correcties", lezen, async (req, res): Promise<void> => {
  try {
    const medewerkerId = parseId(req.params.id);
    const jaar = req.query.jaar ? Number(req.query.jaar) : undefined;
    const uitvoerderAlias = alias(gebruikersTable, "uitvoerder");
    const q = db
      .select({
        id: verlofCorrectiesTable.id,
        medewerker_id: verlofCorrectiesTable.medewerkerId,
        verlofsoort_id: verlofCorrectiesTable.verlofsoortId,
        verlofsoort_naam: verlofsoortenTable.naam,
        jaar: verlofCorrectiesTable.jaar,
        delta_uren: verlofCorrectiesTable.deltaUren,
        reden: verlofCorrectiesTable.reden,
        uitgevoerd_door_naam: uitvoerderAlias.naam,
        aangemaakt_op: verlofCorrectiesTable.aangemaaktOp,
      })
      .from(verlofCorrectiesTable)
      .leftJoin(verlofsoortenTable, eq(verlofCorrectiesTable.verlofsoortId, verlofsoortenTable.id))
      .leftJoin(uitvoerderAlias, eq(verlofCorrectiesTable.uitgevoerdDoorId, uitvoerderAlias.id))
      .where(
        jaar !== undefined
          ? and(eq(verlofCorrectiesTable.medewerkerId, medewerkerId), eq(verlofCorrectiesTable.jaar, jaar))
          : eq(verlofCorrectiesTable.medewerkerId, medewerkerId),
      )
      .orderBy(desc(verlofCorrectiesTable.aangemaaktOp));
    const rijen = await q;
    res.json(rijen.map((r) => ({ ...r, aangemaakt_op: iso(r.aangemaakt_op) })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.get("/mijn/verlof-correcties", async (req, res): Promise<void> => {
  try {
    const medewerkerId = await medewerkerIdVoorGebruiker(req.session.userId ?? null);
    if (!medewerkerId) return void res.status(404).json({ error: "Geen medewerker gekoppeld aan dit account" });
    const jaar = req.query.jaar ? Number(req.query.jaar) : undefined;
    const uitvoerderAlias = alias(gebruikersTable, "uitvoerder");
    const q = db
      .select({
        id: verlofCorrectiesTable.id,
        medewerker_id: verlofCorrectiesTable.medewerkerId,
        verlofsoort_id: verlofCorrectiesTable.verlofsoortId,
        verlofsoort_naam: verlofsoortenTable.naam,
        jaar: verlofCorrectiesTable.jaar,
        delta_uren: verlofCorrectiesTable.deltaUren,
        reden: verlofCorrectiesTable.reden,
        uitgevoerd_door_naam: uitvoerderAlias.naam,
        aangemaakt_op: verlofCorrectiesTable.aangemaaktOp,
      })
      .from(verlofCorrectiesTable)
      .leftJoin(verlofsoortenTable, eq(verlofCorrectiesTable.verlofsoortId, verlofsoortenTable.id))
      .leftJoin(uitvoerderAlias, eq(verlofCorrectiesTable.uitgevoerdDoorId, uitvoerderAlias.id))
      .where(
        jaar !== undefined
          ? and(eq(verlofCorrectiesTable.medewerkerId, medewerkerId), eq(verlofCorrectiesTable.jaar, jaar))
          : eq(verlofCorrectiesTable.medewerkerId, medewerkerId),
      )
      .orderBy(desc(verlofCorrectiesTable.aangemaaktOp));
    const rijen = await q;
    res.json(rijen.map((r) => ({ ...r, aangemaakt_op: iso(r.aangemaakt_op) })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Capaciteit / bezettingsgraad ─────────────────────────────────────────────
// Geeft per dag in een week het aantal beschikbare uren, verlof, ziekte en
// resulterende inzetbaarheid. Bron voor capaciteitsplanning-widget.
router.get("/capaciteit/bezetting", lezen, async (req, res): Promise<void> => {
  try {
    const vandaag = new Date();
    const jaar = req.query.jaar ? Number(req.query.jaar) : vandaag.getFullYear();
    // week: ISO weeknummer; als niet opgegeven → huidige week
    let weekStart: Date;
    if (req.query.datum) {
      weekStart = new Date(String(req.query.datum));
    } else {
      // Maandag van de huidige week
      weekStart = new Date(vandaag);
      const dag = weekStart.getDay() || 7;
      weekStart.setDate(weekStart.getDate() - dag + 1);
    }
    weekStart.setHours(0, 0, 0, 0);

    // 5 werkdagen bouwen
    const dagen: { datum: string; dag: string }[] = [];
    const DAGNAMEN = ["Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag"];
    for (let i = 0; i < 5; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      dagen.push({ datum: d.toISOString().slice(0, 10), dag: DAGNAMEN[i] });
    }

    const weekEindStr = dagen[4].datum;
    const weekStartStr = dagen[0].datum;

    // Actieve medewerkers met functie en werkmaatschappij voor granulaire breakdown
    const medewerkers = await db
      .select({
        id: medewerkersTable.id,
        naam: medewerkersTable.naam,
        contracturenPerWeek: medewerkersTable.contracturenPerWeek,
        werkmaatschappij: medewerkersTable.werkmaatschappij,
        functieId: medewerkersTable.functieId,
        functieNaam: functiesTable.naam,
      })
      .from(medewerkersTable)
      .leftJoin(functiesTable, eq(medewerkersTable.functieId, functiesTable.id))
      .where(eq(medewerkersTable.actief, true));
    const aantalMedewerkers = medewerkers.length;
    const totaalContractUren = medewerkers.reduce((s, m) => s + (m.contracturenPerWeek ?? 0), 0);
    const gemiddeldeUrenPerDag = aantalMedewerkers > 0 ? totaalContractUren / 5 : 0;

    // Goedgekeurde verlofaanvragen die de week overlappen
    const verlofRijen = await db
      .select({
        medewerkerId: verlofAanvragenTable.medewerkerId,
        startDatum: verlofAanvragenTable.startDatum,
        eindDatum: verlofAanvragenTable.eindDatum,
        aantalUren: verlofAanvragenTable.aantalUren,
        medewerkerNaam: medewerkersTable.naam,
      })
      .from(verlofAanvragenTable)
      .leftJoin(medewerkersTable, eq(verlofAanvragenTable.medewerkerId, medewerkersTable.id))
      .where(
        and(
          eq(verlofAanvragenTable.status, "goedgekeurd"),
          lte(verlofAanvragenTable.startDatum, weekEindStr),
          gte(verlofAanvragenTable.eindDatum, weekStartStr),
        ),
      );

    // Actieve ziekmeldingen die de week overlappen
    const ziekRijen = await db
      .select({
        medewerkerId: ziekmeldingenTable.medewerkerId,
        startDatum: ziekmeldingenTable.startDatum,
        eindDatum: ziekmeldingenTable.eindDatum,
        medewerkerNaam: medewerkersTable.naam,
      })
      .from(ziekmeldingenTable)
      .leftJoin(medewerkersTable, eq(ziekmeldingenTable.medewerkerId, medewerkersTable.id))
      .where(
        and(
          ne(ziekmeldingenTable.status, "hersteld"),
          lte(ziekmeldingenTable.startDatum, weekEindStr),
          or(isNull(ziekmeldingenTable.eindDatum), gte(ziekmeldingenTable.eindDatum, weekStartStr)),
        ),
      );

    // Feestdagen voor deze week
    const feestDagen = await db
      .select({ datum: feestdagenTable.datum, naam: feestdagenTable.naam })
      .from(feestdagenTable)
      .where(
        and(
          eq(feestdagenTable.jaar, jaar),
          gte(feestdagenTable.datum, weekStartStr),
          lte(feestdagenTable.datum, weekEindStr),
        ),
      );
    const feestdagSet = new Set(feestDagen.map((f) => f.datum));

    // Per dag aggregeren
    const dagoverzicht = dagen.map(({ datum, dag }) => {
      const isFeestdag = feestdagSet.has(datum);
      const verlofOpDag = verlofRijen.filter((v) => v.startDatum <= datum && v.eindDatum >= datum);
      const ziekOpDag = ziekRijen.filter((z) => z.startDatum <= datum && (z.eindDatum == null || z.eindDatum >= datum));

      const verlofUren = isFeestdag ? gemiddeldeUrenPerDag : verlofOpDag.reduce((s, v) => {
        const dagen_aanvraag = Math.max(1, Math.round((new Date(v.eindDatum).getTime() - new Date(v.startDatum).getTime()) / (1000 * 60 * 60 * 24)) + 1);
        return s + v.aantalUren / dagen_aanvraag;
      }, 0);
      const ziekUren = isFeestdag ? 0 : ziekOpDag.length * (totaalContractUren / 5 / (aantalMedewerkers || 1));

      const beschikbaarUren = isFeestdag ? 0 : Math.max(0, gemiddeldeUrenPerDag - verlofUren - ziekUren);

      return {
        datum,
        dag,
        is_feestdag: isFeestdag,
        feestdag_naam: feestDagen.find((f) => f.datum === datum)?.naam ?? null,
        beschikbaar_uren: Math.round(beschikbaarUren * 10) / 10,
        verlof_uren: Math.round(Math.min(verlofUren, gemiddeldeUrenPerDag) * 10) / 10,
        ziek_uren: Math.round(Math.min(ziekUren, gemiddeldeUrenPerDag) * 10) / 10,
        totaal_uren: Math.round(gemiddeldeUrenPerDag * 10) / 10,
        verlof_namen: isFeestdag ? [] : verlofOpDag.map((v) => v.medewerkerNaam ?? "?"),
        ziek_namen: isFeestdag ? [] : ziekOpDag.map((z) => z.medewerkerNaam ?? "?"),
      };
    });

    // Breakdown per functie: medewerkers + contracturen die de week op verlof gaan
    const goedgekeurdeVerlofIdSet = new Set(verlofRijen.map((v) => v.medewerkerId));
    const ziekIdSet = new Set(ziekRijen.map((z) => z.medewerkerId));

    const functieBuckets = new Map<string, { functie_naam: string | null; medewerkers: number; contract_uren_per_week: number; op_verlof: number; ziek: number }>();
    const werkmaatschappijBuckets = new Map<string, { werkmaatschappij: string; medewerkers: number; contract_uren_per_week: number; op_verlof: number; ziek: number }>();

    for (const m of medewerkers) {
      const fSleutel = String(m.functieId ?? "geen");
      if (!functieBuckets.has(fSleutel)) functieBuckets.set(fSleutel, { functie_naam: m.functieNaam ?? null, medewerkers: 0, contract_uren_per_week: 0, op_verlof: 0, ziek: 0 });
      const fb = functieBuckets.get(fSleutel)!;
      fb.medewerkers++;
      fb.contract_uren_per_week += m.contracturenPerWeek ?? 0;
      if (goedgekeurdeVerlofIdSet.has(m.id)) fb.op_verlof++;
      if (ziekIdSet.has(m.id)) fb.ziek++;

      const wSleutel = m.werkmaatschappij ?? "onbekend";
      if (!werkmaatschappijBuckets.has(wSleutel)) werkmaatschappijBuckets.set(wSleutel, { werkmaatschappij: wSleutel, medewerkers: 0, contract_uren_per_week: 0, op_verlof: 0, ziek: 0 });
      const wb = werkmaatschappijBuckets.get(wSleutel)!;
      wb.medewerkers++;
      wb.contract_uren_per_week += m.contracturenPerWeek ?? 0;
      if (goedgekeurdeVerlofIdSet.has(m.id)) wb.op_verlof++;
      if (ziekIdSet.has(m.id)) wb.ziek++;
    }

    res.json({
      week_start: weekStartStr,
      week_eind: weekEindStr,
      jaar,
      totaal_medewerkers: aantalMedewerkers,
      totaal_contract_uren_per_week: Math.round(totaalContractUren * 10) / 10,
      dagen: dagoverzicht,
      per_functie: Array.from(functieBuckets.values()).map((b) => ({ ...b, contract_uren_per_week: Math.round(b.contract_uren_per_week * 10) / 10 })),
      per_werkmaatschappij: Array.from(werkmaatschappijBuckets.values()).map((b) => ({ ...b, contract_uren_per_week: Math.round(b.contract_uren_per_week * 10) / 10 })),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── AI capaciteitsanalyse ────────────────────────────────────────────────────
// Analyseert verlof, ziekte en capaciteit voor een opgegeven periode.
// Stelt voor; een mens beoordeelt — geen automatische acties.
router.post("/hrm/capaciteit-analyse", alleenBeheerder, async (req, res): Promise<void> => {
  try {
    const { periode_start, periode_eind } = req.body;
    const startStr = periode_start ?? new Date().toISOString().slice(0, 10);
    const eindStr = periode_eind ?? (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10); })();

    // Data ophalen voor de analyse
    const medewerkers = await db
      .select({ id: medewerkersTable.id, naam: medewerkersTable.naam, contracturenPerWeek: medewerkersTable.contracturenPerWeek })
      .from(medewerkersTable)
      .where(eq(medewerkersTable.actief, true));

    const verlof = await db
      .select({
        medewerkerNaam: medewerkersTable.naam,
        verlofsoortNaam: verlofsoortenTable.naam,
        startDatum: verlofAanvragenTable.startDatum,
        eindDatum: verlofAanvragenTable.eindDatum,
        aantalUren: verlofAanvragenTable.aantalUren,
        status: verlofAanvragenTable.status,
      })
      .from(verlofAanvragenTable)
      .leftJoin(medewerkersTable, eq(verlofAanvragenTable.medewerkerId, medewerkersTable.id))
      .leftJoin(verlofsoortenTable, eq(verlofAanvragenTable.verlofsoortId, verlofsoortenTable.id))
      .where(
        and(
          lte(verlofAanvragenTable.startDatum, eindStr),
          gte(verlofAanvragenTable.eindDatum, startStr),
          inArray(verlofAanvragenTable.status, ["aangevraagd", "goedgekeurd"]),
        ),
      );

    const ziekmeldingen = await db
      .select({
        medewerkerNaam: medewerkersTable.naam,
        startDatum: ziekmeldingenTable.startDatum,
        eindDatum: ziekmeldingenTable.eindDatum,
        status: ziekmeldingenTable.status,
      })
      .from(ziekmeldingenTable)
      .leftJoin(medewerkersTable, eq(ziekmeldingenTable.medewerkerId, medewerkersTable.id))
      .where(
        and(
          ne(ziekmeldingenTable.status, "hersteld"),
          lte(ziekmeldingenTable.startDatum, eindStr),
          or(isNull(ziekmeldingenTable.eindDatum), gte(ziekmeldingenTable.eindDatum, startStr)),
        ),
      );

    // Verlopende saldi (saldo > 0 maar vervalt voor het einde van de periode)
    const verlopendeSaldi = await db
      .select({
        medewerkerNaam: medewerkersTable.naam,
        verlofsoortNaam: verlofsoortenTable.naam,
        saldoUren: verlofSaldiTable.saldoUren,
        vervaltOp: verlofSaldiTable.vervaltOp,
      })
      .from(verlofSaldiTable)
      .leftJoin(medewerkersTable, eq(verlofSaldiTable.medewerkerId, medewerkersTable.id))
      .leftJoin(verlofsoortenTable, eq(verlofSaldiTable.verlofsoortId, verlofsoortenTable.id))
      .where(
        and(
          gte(verlofSaldiTable.saldoUren, 4),
          lte(verlofSaldiTable.vervaltOp, eindStr),
          gte(verlofSaldiTable.vervaltOp, startStr),
        ),
      );

    // AVG-pseudonimisering: persoonsgegevens (namen) worden vervangen door
    // geanonimiseerde sleutels (M-1, M-2 ...) voordat de data OpenAI bereikt.
    // De mapping wordt lokaal bewaard en nooit extern verzonden.
    const pseudoMap = new Map<string, string>();
    let pseudoTeller = 1;
    const pseudoniem = (naam: string | null | undefined): string => {
      if (!naam) return "onbekend";
      if (!pseudoMap.has(naam)) pseudoMap.set(naam, `M-${pseudoTeller++}`);
      return pseudoMap.get(naam)!;
    };

    const systeemPrompt = HRM_CAPACITEIT_SIGNALEN_PROMPT.tekst;
    const gebruikersTekst = JSON.stringify({
      periode: { start: startStr, eind: eindStr },
      medewerkers: medewerkers.length,
      totaal_contracturen_per_week: medewerkers.reduce((s, m) => s + (m.contracturenPerWeek ?? 0), 0),
      verlof_aangevraagd: verlof.filter((v) => v.status === "aangevraagd").length,
      verlof_goedgekeurd: verlof.filter((v) => v.status === "goedgekeurd").length,
      verlof_top5: verlof.slice(0, 5).map((v) => ({ medewerker: pseudoniem(v.medewerkerNaam), soort: v.verlofsoortNaam, start: v.startDatum, eind: v.eindDatum, uren: v.aantalUren })),
      actief_ziek: ziekmeldingen.filter((z) => z.status !== "hersteld").length,
      verlopende_saldi: verlopendeSaldi.slice(0, 8).map((v) => ({ medewerker: pseudoniem(v.medewerkerNaam), soort: v.verlofsoortNaam, uren: v.saldoUren, verloopt: v.vervaltOp })),
    });

    const voltooiing = await aiGateway.chat("fast", {
      response_format: { type: "json_object" },
      max_completion_tokens: 1200,
      messages: [
        { role: "system", content: systeemPrompt },
        { role: "user", content: gebruikersTekst },
      ],
    });

    const parsed = JSON.parse(voltooiing.ok ? voltooiing.inhoud : "{}") as { signalen?: unknown[] };
    const signalen = Array.isArray(parsed.signalen) ? parsed.signalen : [];

    res.json({
      periode_start: startStr,
      periode_eind: eindStr,
      geanalyseerd_op: new Date().toISOString(),
      signalen,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Verlof-overzicht (centraal, management) ──────────────────────────────────
// Gecombineerd overzicht met saldi en aanvragen per medewerker voor een jaar.
// Bron voor de /personeel/verlof pagina.
router.get("/verlof/overzicht", lezen, async (req, res): Promise<void> => {
  try {
    const jaar = req.query.jaar ? Number(req.query.jaar) : new Date().getFullYear();
    const medewerkerFilter = req.query.medewerker_id ? parseId(req.query.medewerker_id) : undefined;

    const saldi = await db
      .select({
        s: verlofSaldiTable,
        verlofsoortNaam: verlofsoortenTable.naam,
        verlofsoortCategorie: verlofsoortenTable.categorie,
        medewerkerNaam: medewerkersTable.naam,
        medewerkerActief: medewerkersTable.actief,
      })
      .from(verlofSaldiTable)
      .leftJoin(verlofsoortenTable, eq(verlofSaldiTable.verlofsoortId, verlofsoortenTable.id))
      .leftJoin(medewerkersTable, eq(verlofSaldiTable.medewerkerId, medewerkersTable.id))
      .where(
        and(
          eq(verlofSaldiTable.jaar, jaar),
          medewerkerFilter ? eq(verlofSaldiTable.medewerkerId, medewerkerFilter) : undefined,
        ),
      )
      .orderBy(medewerkersTable.naam, verlofsoortenTable.naam);

    const aanvragen = await db
      .select({
        a: verlofAanvragenTable,
        verlofsoortNaam: verlofsoortenTable.naam,
        medewerkerNaam: medewerkersTable.naam,
      })
      .from(verlofAanvragenTable)
      .leftJoin(verlofsoortenTable, eq(verlofAanvragenTable.verlofsoortId, verlofsoortenTable.id))
      .leftJoin(medewerkersTable, eq(verlofAanvragenTable.medewerkerId, medewerkersTable.id))
      .where(
        and(
          sql`EXTRACT(YEAR FROM ${verlofAanvragenTable.startDatum}::date)::int = ${jaar}`,
          medewerkerFilter ? eq(verlofAanvragenTable.medewerkerId, medewerkerFilter) : undefined,
        ),
      )
      .orderBy(desc(verlofAanvragenTable.startDatum));

    res.json({
      jaar,
      saldi: saldi.map((r) => ({
        id: r.s.id,
        medewerker_id: r.s.medewerkerId,
        medewerker_naam: r.medewerkerNaam ?? null,
        medewerker_actief: r.medewerkerActief ?? true,
        verlofsoort_id: r.s.verlofsoortId,
        verlofsoort_naam: r.verlofsoortNaam ?? null,
        verlofsoort_categorie: r.verlofsoortCategorie ?? null,
        jaar: r.s.jaar,
        beginsaldo_uren: r.s.beginsaldoUren,
        opgebouwd_uren: r.s.opgebouwdUren,
        opgenomen_uren: r.s.opgenomenUren,
        saldo_uren: r.s.saldoUren,
        vervalt_op: r.s.vervaltOp ?? null,
      })),
      aanvragen: aanvragen.map((r) => ({
        id: r.a.id,
        medewerker_id: r.a.medewerkerId,
        medewerker_naam: r.medewerkerNaam ?? null,
        verlofsoort_id: r.a.verlofsoortId,
        verlofsoort_naam: r.verlofsoortNaam ?? null,
        start_datum: r.a.startDatum,
        eind_datum: r.a.eindDatum,
        aantal_uren: r.a.aantalUren,
        status: r.a.status,
        reden: r.a.reden ?? null,
        opmerking: r.a.opmerking ?? null,
        beoordeeld_door_id: r.a.beoordeeldDoorId ?? null,
        beoordeeld_op: isoOf(r.a.beoordeeldOp),
        aangemaakt_op: iso(r.a.aangemaaktOp),
      })),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── HRM-dashboard ───────────────────────────────────────────────────────────
router.get("/hrm/stats", lezen, async (req, res): Promise<void> => {
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

// ── Mijn medewerker ───────────────────────────────────────────────────────────
router.get("/mijn/medewerker", async (req, res): Promise<void> => {
  try {
    const medewerkerId = await getMijnMedewerkerId(req);
    if (!medewerkerId) return void res.status(404).json({ error: "Geen medewerker-koppeling" });
    const [m] = await db
      .select({
        id: medewerkersTable.id,
        naam: medewerkersTable.naam,
        functieId: medewerkersTable.functieId,
        werkmaatschappij: medewerkersTable.werkmaatschappij,
      })
      .from(medewerkersTable)
      .where(eq(medewerkersTable.id, medewerkerId));
    if (!m) return void res.status(404).json({ error: "Niet gevonden" });
    res.json({
      id: m.id,
      naam: m.naam,
      functie_id: m.functieId ?? null,
      werkmaatschappij: m.werkmaatschappij ?? null,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Mijn certificaten ─────────────────────────────────────────────────────────
router.get("/mijn/certificaten", async (req, res): Promise<void> => {
  try {
    const medewerkerId = await getMijnMedewerkerId(req);
    if (!medewerkerId) return void res.status(404).json({ error: "Geen medewerker-koppeling" });
    const [m] = await db
      .select({
        id: medewerkersTable.id,
        naam: medewerkersTable.naam,
        vcaVervaldatum: medewerkersTable.vcaVervaldatum,
        ehboVervaldatum: medewerkersTable.ehboVervaldatum,
        bhvVervaldatum: medewerkersTable.bhvVervaldatum,
      })
      .from(medewerkersTable)
      .where(eq(medewerkersTable.id, medewerkerId));
    if (!m) return void res.status(404).json({ error: "Niet gevonden" });
    res.json({
      medewerker_id: m.id,
      naam: m.naam,
      vca_vervaldatum: m.vcaVervaldatum ?? null,
      ehbo_vervaldatum: m.ehboVervaldatum ?? null,
      bhv_vervaldatum: m.bhvVervaldatum ?? null,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.get("/mijn/opleidingen", async (req, res): Promise<void> => {
  try {
    const medewerkerId = await getMijnMedewerkerId(req);
    if (!medewerkerId) return void res.status(404).json({ error: "Geen medewerker-koppeling" });
    const rijen = await db
      .select({ mo: medewerkerOpleidingenTable, o: opleidingenTable })
      .from(medewerkerOpleidingenTable)
      .leftJoin(opleidingenTable, eq(medewerkerOpleidingenTable.opleidingId, opleidingenTable.id))
      .where(eq(medewerkerOpleidingenTable.medewerkerId, medewerkerId))
      .orderBy(desc(medewerkerOpleidingenTable.behaaldOp));
    res.json(
      rijen.map((r) => ({
        id: r.mo.id,
        opleiding_id: r.mo.opleidingId,
        opleiding_naam: r.o?.naam ?? "Onbekende opleiding",
        soort: r.o?.soort ?? null,
        categorie: r.o?.categorie ?? null,
        niveau: r.o?.niveau ?? null,
        opleider: r.o?.opleider ?? null,
        studieduur: r.o?.studieduur ?? null,
        studiebelasting: r.o?.studiebelasting ?? null,
        lesvorm: r.o?.lesvorm ?? null,
        kosten_indicatie: r.o?.kostenIndicatie ?? null,
        kosten_werkgever_pct: r.o?.kostenWerkgeverPct ?? null,
        kosten_werknemer_pct: r.o?.kostenWerknemerPct ?? null,
        geldigheid_maanden: r.o?.geldigheidMaanden ?? null,
        verplicht: r.o?.verplicht ?? false,
        status: r.mo.status,
        behaald_op: r.mo.behaaldOp,
        verloopt_op: r.mo.verlooptOp,
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

// ── Mijn verlof — self-service, alle geauthenticeerde gebruikers ─────────────
// Geen personeel-bevoegdheid vereist; een medewerker raadpleegt en dient in
// uitsluitend zijn eigen verlofdata. requireAuth is al globaal toegepast.

async function getMijnMedewerkerId(req: import("express").Request): Promise<number | null> {
  return medewerkerIdVoorGebruiker(req.session.userId ?? null, db);
}

router.get("/mijn/verlofsoorten", async (req, res): Promise<void> => {
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

router.get("/mijn/verlofsaldi", async (req, res): Promise<void> => {
  try {
    const medewerkerId = await getMijnMedewerkerId(req);
    // Geen medewerker-koppeling: lege lijst teruggeven zodat de UI de
    // lege-staat toont ("Geen verlofsaldo beschikbaar") i.p.v. een foutmelding.
    if (!medewerkerId) return void res.json([]);
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

router.get("/mijn/verlofaanvragen", async (req, res): Promise<void> => {
  try {
    const medewerkerId = await getMijnMedewerkerId(req);
    // Geen medewerker-koppeling: lege lijst teruggeven zodat de UI de
    // lege-staat toont ("Geen verlofaanvragen gevonden.") i.p.v. een foutmelding.
    if (!medewerkerId) return void res.json([]);
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

router.post("/mijn/verlofaanvragen", async (req, res): Promise<void> => {
  try {
    const medewerkerId = await getMijnMedewerkerId(req);
    if (!medewerkerId) return void res.status(404).json({ error: "Geen medewerker gekoppeld aan uw account." });
    const { verlofsoort_id, start_datum, eind_datum, aantal_uren, reden, opmerking } = req.body;
    if (verlofsoort_id == null || !start_datum || !eind_datum) {
      return void res.status(400).json({ error: "verlofsoort_id, start_datum en eind_datum zijn verplicht" });
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

// ── Ziekmeldingen ─────────────────────────────────────────────────────────────
// Nationaal gemiddelde verzuimpercentage per maand (CBS Statline / Rivm,
// bouwnijverheid & technische dienstverlening, meerjaarlijks gemiddelde).
// Hard-coded als referentielijn; actuele CBS-data wordt niet real-time opgehaald.
const NATIONAAL_BENCHMARK = [
  { maand: 1, percentage: 5.8 }, { maand: 2, percentage: 5.4 },
  { maand: 3, percentage: 4.9 }, { maand: 4, percentage: 4.2 },
  { maand: 5, percentage: 3.8 }, { maand: 6, percentage: 3.4 },
  { maand: 7, percentage: 3.0 }, { maand: 8, percentage: 2.9 },
  { maand: 9, percentage: 3.7 }, { maand: 10, percentage: 4.4 },
  { maand: 11, percentage: 4.9 }, { maand: 12, percentage: 5.2 },
];

function mapZiekmelding(z: typeof ziekmeldingenTable.$inferSelect & { medewerker_naam?: string | null }) {
  return {
    id: z.id,
    medewerker_id: z.medewerkerId,
    medewerker_naam: z.medewerker_naam ?? null,
    start_datum: z.startDatum,
    eind_datum: z.eindDatum ?? null,
    reden: z.reden ?? null,
    omschrijving: z.omschrijving ?? null,
    status: z.status,
    gemeld_door_id: z.gemeldDoorId ?? null,
    aangemaakt_op: iso(z.aangemaaktOp),
    bijgewerkt_op: iso(z.bijgewerktOp),
  };
}

// Lijst (HRM/beheerder)
router.get("/ziekmeldingen", lezen, async (req, res): Promise<void> => {
  try {
    const { status, medewerker_id, actief } = req.query;
    const rijen = await db
      .select({
        id: ziekmeldingenTable.id,
        medewerkerId: ziekmeldingenTable.medewerkerId,
        medewerker_naam: medewerkersTable.naam,
        startDatum: ziekmeldingenTable.startDatum,
        eindDatum: ziekmeldingenTable.eindDatum,
        reden: ziekmeldingenTable.reden,
        omschrijving: ziekmeldingenTable.omschrijving,
        status: ziekmeldingenTable.status,
        gemeldDoorId: ziekmeldingenTable.gemeldDoorId,
        aangemaaktOp: ziekmeldingenTable.aangemaaktOp,
        bijgewerktOp: ziekmeldingenTable.bijgewerktOp,
      })
      .from(ziekmeldingenTable)
      .leftJoin(medewerkersTable, eq(medewerkersTable.id, ziekmeldingenTable.medewerkerId))
      .where(
        and(
          status ? eq(ziekmeldingenTable.status, String(status)) : undefined,
          medewerker_id ? eq(ziekmeldingenTable.medewerkerId, parseId(medewerker_id)) : undefined,
          actief === "true"
            ? or(isNull(ziekmeldingenTable.eindDatum), gte(ziekmeldingenTable.eindDatum, new Date().toISOString().slice(0, 10)))
            : undefined,
        ),
      )
      .orderBy(desc(ziekmeldingenTable.aangemaaktOp));
    res.json(rijen.map((z) => mapZiekmelding({ ...z, medewerker_naam: z.medewerker_naam } as Parameters<typeof mapZiekmelding>[0])));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// Aanmaken (HRM/beheerder)
router.post("/ziekmeldingen", schrijven, async (req, res): Promise<void> => {
  try {
    const { medewerker_id, start_datum, eind_datum, reden, omschrijving, status } = req.body;
    if (!medewerker_id || !start_datum) {
      return void res.status(400).json({ error: "medewerker_id en start_datum zijn verplicht" });
    }
    const [z] = await db
      .insert(ziekmeldingenTable)
      .values({
        medewerkerId: parseId(medewerker_id),
        startDatum: start_datum,
        eindDatum: eind_datum ?? null,
        reden: reden ?? null,
        omschrijving: omschrijving ?? null,
        status: status ?? "gemeld",
        gemeldDoorId: req.session.userId ?? null,
      })
      .returning();

    // Koppeling: intrek overlappende ADV-aanvragen automatisch.
    await koppelZiekteAanAdv(z.medewerkerId, z.startDatum, z.eindDatum, req.session.userId ?? null, req.log);

    const [m] = await db.select({ naam: medewerkersTable.naam }).from(medewerkersTable).where(eq(medewerkersTable.id, z.medewerkerId));
    res.status(201).json(mapZiekmelding({ ...z, medewerker_naam: m?.naam ?? null } as Parameters<typeof mapZiekmelding>[0]));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// Statistieken (dashboard)
router.get("/ziekmeldingen/statistieken", lezen, async (req, res): Promise<void> => {
  try {
    const jaar = req.query.jaar ? Number(req.query.jaar) : new Date().getFullYear();
    const vandaag = new Date().toISOString().slice(0, 10);
    const totaleMedewerkers = await db
      .select({ id: medewerkersTable.id })
      .from(medewerkersTable)
      .where(eq(medewerkersTable.actief, true));
    const totaal = totaleMedewerkers.length || 1;

    // Huidig ziek: status gemeld/langdurig EN geen einddatum of einddatum >= vandaag
    const huidigZiek = await db
      .select({ id: ziekmeldingenTable.id })
      .from(ziekmeldingenTable)
      .where(
        and(
          ne(ziekmeldingenTable.status, "hersteld"),
          or(isNull(ziekmeldingenTable.eindDatum), gte(ziekmeldingenTable.eindDatum, vandaag)),
        ),
      );

    // Alle ziekmeldingen voor het gevraagde jaar
    const alleZiek = await db
      .select({
        medewerkerId: ziekmeldingenTable.medewerkerId,
        startDatum: ziekmeldingenTable.startDatum,
        eindDatum: ziekmeldingenTable.eindDatum,
        status: ziekmeldingenTable.status,
      })
      .from(ziekmeldingenTable);

    const jaarStr = String(jaar);
    const maanden: { maand: number; jaar: number; percentage: number; medewerkers_ziek: number; totale_medewerkers: number }[] = [];
    for (let m = 1; m <= 12; m++) {
      const eerstedag = `${jaarStr}-${String(m).padStart(2, "0")}-01`;
      const laatstemm = m === 12 ? `${jaar + 1}-01-01` : `${jaarStr}-${String(m + 1).padStart(2, "0")}-01`;
      // Ziek in deze maand: start <= einde van maand EN (geen einddatum OF einddatum >= begin van maand)
      const ziekInMaand = new Set(
        alleZiek
          .filter((z) => {
            const start = z.startDatum;
            const eind = z.eindDatum ?? "9999-12-31";
            return start < laatstemm && eind >= eerstedag;
          })
          .map((z) => z.medewerkerId),
      );
      const percentage = totaal > 0 ? Math.round((ziekInMaand.size / totaal) * 1000) / 10 : 0;
      maanden.push({ maand: m, jaar, percentage, medewerkers_ziek: ziekInMaand.size, totale_medewerkers: totaal });
    }

    const huidigPct = totaal > 0 ? Math.round((huidigZiek.length / totaal) * 1000) / 10 : 0;
    const gemiddeldDitJaar = maanden.length > 0
      ? Math.round((maanden.reduce((s, m) => s + m.percentage, 0) / maanden.length) * 10) / 10
      : 0;

    res.json({
      huidig_ziek: huidigZiek.length,
      totale_medewerkers: totaal,
      verzuimpercentage_huidig: huidigPct,
      gemiddeld_dit_jaar: gemiddeldDitJaar,
      maanden,
      nationaal: NATIONAAL_BENCHMARK,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// Bijwerken
router.patch("/ziekmeldingen/:id", schrijven, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params.id);
    const { start_datum, eind_datum, reden, omschrijving, status } = req.body;
    const [z] = await db
      .update(ziekmeldingenTable)
      .set({
        ...(start_datum != null ? { startDatum: start_datum } : {}),
        eindDatum: eind_datum !== undefined ? (eind_datum ?? null) : undefined,
        ...(reden !== undefined ? { reden: reden ?? null } : {}),
        ...(omschrijving !== undefined ? { omschrijving: omschrijving ?? null } : {}),
        ...(status != null ? { status } : {}),
        bijgewerktOp: new Date(),
      })
      .where(eq(ziekmeldingenTable.id, id))
      .returning();
    if (!z) return void res.status(404).json({ error: "Niet gevonden" });

    // Koppeling: herbereken overlappende ADV-aanvragen als de periode is gewijzigd
    // en de melding (nog) actief is (niet hersteld).
    if (z.status !== "hersteld" && (start_datum != null || eind_datum !== undefined)) {
      await koppelZiekteAanAdv(z.medewerkerId, z.startDatum, z.eindDatum, req.session.userId ?? null, req.log);
    }

    const [m] = await db.select({ naam: medewerkersTable.naam }).from(medewerkersTable).where(eq(medewerkersTable.id, z.medewerkerId));
    res.json(mapZiekmelding({ ...z, medewerker_naam: m?.naam ?? null } as Parameters<typeof mapZiekmelding>[0]));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// Verwijderen
router.delete("/ziekmeldingen/:id", schrijven, async (req, res): Promise<void> => {
  try {
    await db.delete(ziekmeldingenTable).where(eq(ziekmeldingenTable.id, parseId(req.params.id)));
    res.status(204).end();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// Self-service: eigen ziekmeldingen lezen
router.get("/mijn/ziekmeldingen", async (req, res): Promise<void> => {
  try {
    const medewerkerId = await getMijnMedewerkerId(req);
    if (!medewerkerId) return void res.status(403).json({ error: "Geen medewerker gekoppeld aan uw account." });
    const rijen = await db
      .select()
      .from(ziekmeldingenTable)
      .where(eq(ziekmeldingenTable.medewerkerId, medewerkerId))
      .orderBy(desc(ziekmeldingenTable.startDatum));
    res.json(rijen.map((z) => mapZiekmelding({ ...z, medewerker_naam: null } as Parameters<typeof mapZiekmelding>[0])));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// Self-service: ziek melden
router.post("/mijn/ziekmeldingen", async (req, res): Promise<void> => {
  try {
    const medewerkerId = await getMijnMedewerkerId(req);
    if (!medewerkerId) return void res.status(403).json({ error: "Geen medewerker gekoppeld aan uw account." });
    const { start_datum, eind_datum, reden, omschrijving } = req.body;
    if (!start_datum) return void res.status(400).json({ error: "start_datum is verplicht" });
    const [z] = await db
      .insert(ziekmeldingenTable)
      .values({
        medewerkerId,
        startDatum: start_datum,
        eindDatum: eind_datum ?? null,
        reden: reden ?? null,
        omschrijving: omschrijving ?? null,
        status: "gemeld",
        gemeldDoorId: req.session.userId ?? null,
      })
      .returning();
    res.status(201).json(mapZiekmelding({ ...z, medewerker_naam: null } as Parameters<typeof mapZiekmelding>[0]));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.patch("/werkgevers/:id/salaris-config", schrijven, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params.id);
    const {
      salarisverwerker, boekhouder_naam, boekhouder_email,
      loonperiode, intern_contact_naam, intern_contact_email, scab_email_adres,
    } = req.body;

    const update: Record<string, unknown> = { bijgewerktOp: new Date() };
    if (salarisverwerker !== undefined) update.salarisverwerker = salarisverwerker;
    if (boekhouder_naam !== undefined) update.boekhouderNaam = boekhouder_naam;
    if (boekhouder_email !== undefined) update.boekhouderEmail = boekhouder_email;
    if (loonperiode !== undefined) update.loonperiode = loonperiode;
    if (intern_contact_naam !== undefined) update.internContactNaam = intern_contact_naam;
    if (intern_contact_email !== undefined) update.internContactEmail = intern_contact_email;
    if (scab_email_adres !== undefined) update.scabEmailAdres = scab_email_adres;

    const [bijgewerkt] = await db
      .update(werkgeversTable)
      .set(update)
      .where(eq(werkgeversTable.id, id))
      .returning();

    if (!bijgewerkt) return void res.status(404).json({ error: "Niet gevonden" });

    return void res.json({
      salarisverwerker: bijgewerkt.salarisverwerker ?? null,
      boekhouder_naam: bijgewerkt.boekhouderNaam ?? null,
      boekhouder_email: bijgewerkt.boekhouderEmail ?? null,
      loonperiode: bijgewerkt.loonperiode ?? null,
      intern_contact_naam: bijgewerkt.internContactNaam ?? null,
      intern_contact_email: bijgewerkt.internContactEmail ?? null,
      scab_email_adres: bijgewerkt.scabEmailAdres ?? null,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ─── CV ANALYSE (multipart upload, AI-extractie) ─────────────────────────────
router.post(
  "/medewerkers/ai-cv-analyse",
  schrijven,
  uploadGeheugem.single("cv"),
  async (req, res): Promise<void> => {
    try {
      const bestand = req.file;
      if (!bestand) {
        return void res.status(422).json({ error: "Geen bestand ontvangen. Stuur een PDF." });
      }

      const uitkomst = await analyseerCvBestand({
        buffer: bestand.buffer,
        bestandsnaam: bestand.originalname,
        mimetype: bestand.mimetype ?? null,
      });
      if (!uitkomst.ok) {
        return void res.status(uitkomst.status).json({ error: uitkomst.fout });
      }
      return void res.json(uitkomst.resultaat);
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Interne serverfout" });
    }
  }
);

// ─── AI ONBOARDING VOORSTEL (geplakte tekst) ─────────────────────────────────
// Leest geplakte brontekst (e-mail/arbeidsovereenkomst) en stelt onboarding-velden
// voor. Stelt alleen voor; maakt geen medewerker/gebruiker aan en bevat nooit
// rechten of bevoegdheden (die volgen uit de gekozen functie).
router.post("/medewerkers/ai-onboarding-voorstel", schrijven, async (req, res): Promise<void> => {
  try {
    const tekst = typeof req.body?.tekst === "string" ? req.body.tekst : "";
    if (!tekst.trim()) {
      return void res.status(422).json({ error: "Geen tekst ontvangen. Plak een e-mail of arbeidsovereenkomst." });
    }
    const uitkomst = await analyseerOnboardingTekst(tekst);
    if (!uitkomst.ok) {
      return void res.status(uitkomst.status).json({ error: uitkomst.fout });
    }
    return void res.json(uitkomst.resultaat);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ─── OFFBOARD SAMENVATTING ────────────────────────────────────────────────────
router.get("/medewerkers/:id/offboard-samenvatting", lezen, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params.id);

    const [rij] = await db
      .select({ m: medewerkersTable, functie_naam: functiesTable.naam })
      .from(medewerkersTable)
      .leftJoin(functiesTable, eq(medewerkersTable.functieId, functiesTable.id))
      .where(eq(medewerkersTable.id, id));

    if (!rij) return void res.status(404).json({ error: "Niet gevonden" });
    const { m, functie_naam } = rij;

    // Gebruikersaccount actief?
    let gebruiker_actief = false;
    if (m.gebruikerId) {
      const [g] = await db
        .select({ actief: gebruikersTable.actief })
        .from(gebruikersTable)
        .where(eq(gebruikersTable.id, m.gebruikerId));
      gebruiker_actief = g?.actief ?? false;
    }

    // Verlof saldi huidig jaar
    const huidigJaar = new Date().getFullYear();
    const saldi = await db
      .select({ saldo_uren: verlofSaldiTable.saldoUren })
      .from(verlofSaldiTable)
      .where(and(eq(verlofSaldiTable.medewerkerId, id), eq(verlofSaldiTable.jaar, huidigJaar)));
    const verlof_totaal_uren = saldi.reduce((s, r) => s + (r.saldo_uren ?? 0), 0);

    // Openstaande verlofaanvragen
    const openstaand = await db
      .select({ id: verlofAanvragenTable.id })
      .from(verlofAanvragenTable)
      .where(
        and(
          eq(verlofAanvragenTable.medewerkerId, id),
          inArray(verlofAanvragenTable.status, ["ingediend", "wachtend"])
        )
      );

    // Certificaten die komend jaar verlopen
    const nu = new Date();
    const overJaar = new Date(nu);
    overJaar.setFullYear(overJaar.getFullYear() + 1);
    const certificaten = await db
      .select({ naam: opleidingenTable.naam, verloopt_op: medewerkerOpleidingenTable.verlooptOp })
      .from(medewerkerOpleidingenTable)
      .leftJoin(opleidingenTable, eq(medewerkerOpleidingenTable.opleidingId, opleidingenTable.id))
      .where(
        and(
          eq(medewerkerOpleidingenTable.medewerkerId, id),
          gte(medewerkerOpleidingenTable.verlooptOp, nu.toISOString().split("T")[0]),
          lte(medewerkerOpleidingenTable.verlooptOp, overJaar.toISOString().split("T")[0])
        )
      );

    // AVG bewaarperiode: (uit_dienst_per of vandaag) + 7 jaar
    const refDatum = m.uitDienstPer ? new Date(m.uitDienstPer) : new Date();
    const avgTot = new Date(refDatum);
    avgTot.setFullYear(avgTot.getFullYear() + 7);
    const avg_bewaar_tot = avgTot.toISOString().split("T")[0];

    const avg_aandachtspunten: string[] = [
      `Loongegevens bewaren tot ${avg_bewaar_tot} (Wet op de loonbelasting art. 28 lid 9)`,
      "Arbeidscontract en salarisspecificaties: minimaal 7 jaar na uitdiensttreding",
      "Persoonsgegevens zonder wettelijke grondslag verwijderen bij of kort na offboarding",
    ];
    if (m.bsn) avg_aandachtspunten.push("BSN aanwezig — niet langer bewaren dan fiscale verplichting vereist");
    if (m.gebruikerId) avg_aandachtspunten.push("Systeemtoegang (FPS Connect) intrekken — gebruikersaccount deactiveren");

    return void res.json({
      medewerker_id: m.id,
      medewerker_naam: m.naam,
      functie_naam: functie_naam ?? null,
      werkmaatschappij: m.werkmaatschappij,
      in_dienst_sinds: m.inDienstSinds ?? null,
      dienstverband: m.dienstverband ?? "onbekend",
      gebruiker_actief,
      verlof_totaal_uren: Math.round(verlof_totaal_uren * 10) / 10,
      openstaande_aanvragen: openstaand.length,
      certificaten_bijna_verlopen: certificaten
        .filter((c) => c.verloopt_op)
        .map((c) => ({ naam: c.naam ?? "Onbekende opleiding", verloopt_op: c.verloopt_op! })),
      actieve_toewijzingen: 0,
      avg_bewaar_tot,
      avg_aandachtspunten,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ─── ARBEIDSGETUIGENIS — AI GENEREERT BRIEFTEKST ─────────────────────────────
function _briefZonderAi(opts: {
  naam: string;
  functieName: string;
  werkgeverNaam: string;
  inDienstSinds: string;
  uitDienstPer: string;
  vandaagNL: string;
  diensttermijn: string;
  positief: boolean;
}): string {
  return `${opts.vandaagNL}

Betreft: Arbeidsgetuigenis ${opts.naam}

Ondergetekende, ${opts.werkgeverNaam}, verklaart hierbij dat:

${opts.naam} in dienst is geweest van ${opts.inDienstSinds} tot ${opts.uitDienstPer} — een periode van ${opts.diensttermijn} — in de functie van ${opts.functieName}.

Gedurende dit dienstverband heeft ${opts.naam.split(" ")[0]} de werkzaamheden behorend bij de functie van ${opts.functieName} naar behoren uitgevoerd. ${opts.positief ? `Wij beschouwen ${opts.naam.split(" ")[0]} als een betrouwbare en gemotiveerde medewerker en bevelen hem/haar van harte aan voor een vergelijkbare functie.` : ""}

Wij wensen ${opts.naam.split(" ")[0]} veel succes in de verdere loopbaan.

Met vriendelijke groet,

${opts.werkgeverNaam}


_________________________
Handtekening

_________________________
Naam en functie`;
}

router.post("/medewerkers/:id/arbeidsgetuigenis-ai", schrijven, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params.id);
    const {
      reden_uitdienst,
      positief_getuigschrift = true,
      extra_toelichting,
    } = req.body as { reden_uitdienst?: string; positief_getuigschrift?: boolean; extra_toelichting?: string };

    const [rij] = await db
      .select({ m: medewerkersTable, functie_naam: functiesTable.naam })
      .from(medewerkersTable)
      .leftJoin(functiesTable, eq(medewerkersTable.functieId, functiesTable.id))
      .where(eq(medewerkersTable.id, id));

    if (!rij) return void res.status(404).json({ error: "Niet gevonden" });
    const { m, functie_naam } = rij;

    // Werkgever
    let werkgeverNaam = m.werkmaatschappij;
    let werkgeverAdres = "";
    if (m.werkgeverId) {
      const [wg] = await db
        .select({ naam: werkgeversTable.naam, adres: werkgeversTable.adres, postcode: werkgeversTable.postcode })
        .from(werkgeversTable)
        .where(eq(werkgeversTable.id, m.werkgeverId));
      if (wg) {
        werkgeverNaam = wg.naam ?? m.werkmaatschappij;
        werkgeverAdres = [wg.adres, wg.postcode].filter(Boolean).join(", ");
      }
    }

    // Behaalde opleidingen
    const opleidingen = await db
      .select({ naam: opleidingenTable.naam, behaald_op: medewerkerOpleidingenTable.behaaldOp, status: medewerkerOpleidingenTable.status })
      .from(medewerkerOpleidingenTable)
      .leftJoin(opleidingenTable, eq(medewerkerOpleidingenTable.opleidingId, opleidingenTable.id))
      .where(eq(medewerkerOpleidingenTable.medewerkerId, id));

    // Diensttermijn
    const inDat = m.inDienstSinds ? new Date(m.inDienstSinds) : null;
    const uitDat = m.uitDienstPer ? new Date(m.uitDienstPer) : new Date();
    let diensttermijn = "onbekende periode";
    if (inDat) {
      const maanden = Math.round((uitDat.getTime() - inDat.getTime()) / (1000 * 60 * 60 * 24 * 30.5));
      const jaren = Math.floor(maanden / 12);
      const restM = maanden % 12;
      diensttermijn =
        [jaren > 0 ? `${jaren} jaar` : "", restM > 0 ? `${restM} maanden` : ""].filter(Boolean).join(" en ") ||
        "minder dan een maand";
    }

    const vandaagNL = new Date().toLocaleDateString("nl-NL", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const functieName = functie_naam ?? "medewerker";
    const samenvatting = `Arbeidsgetuigenis voor ${m.naam} — ${diensttermijn} in dienst als ${functieName}${positief_getuigschrift !== false ? ", positief getuigschrift" : ""}.`;

    if (!heeftGateway()) {
      return void res.json({
        brief_tekst: _briefZonderAi({
          naam: m.naam,
          functieName,
          werkgeverNaam,
          inDienstSinds: m.inDienstSinds ?? "—",
          uitDienstPer: m.uitDienstPer ?? new Date().toISOString().split("T")[0],
          vandaagNL,
          diensttermijn,
          positief: positief_getuigschrift !== false,
        }),
        samenvatting,
        ai_gebruikt: false,
      });
    }

    const behaaldeCertificaten = opleidingen
      .filter((o) => o.status === "behaald")
      .map((o) => `${o.naam}${o.behaald_op ? " (behaald " + o.behaald_op + ")" : ""}`)
      .join(", ");

    const prompt = `Schrijf een professionele Nederlandse arbeidsgetuigenis. De brief moet op een formele, zakelijke manier geschreven zijn conform de Nederlandse praktijk.

WERKGEVER: ${werkgeverNaam}${werkgeverAdres ? "\nADRES: " + werkgeverAdres : ""}

MEDEWERKER: ${m.naam}
FUNCTIE: ${functieName}
IN DIENST SINCE: ${m.inDienstSinds ?? "onbekend"}
UIT DIENST PER: ${m.uitDienstPer ?? vandaagNL}
DIENSTTERMIJN: ${diensttermijn}
CONTRACTVORM: ${m.dienstverband ?? "arbeidsovereenkomst"}
WERKMAATSCHAPPIJ: ${m.werkmaatschappij}${behaaldeCertificaten ? "\nCERTIFICATEN: " + behaaldeCertificaten : ""}${reden_uitdienst ? "\nREDEN UITDIENST: " + reden_uitdienst : ""}${extra_toelichting ? "\nEXTRA TOELICHTING: " + extra_toelichting : ""}

Schrijf een ${positief_getuigschrift !== false ? "positieve" : "neutrale"} arbeidsgetuigenis met:
1. Datum bovenaan (gebruik: ${vandaagNL})
2. Betreft-regel
3. Verklaring van het dienstverband (periode, functie, werkgever)
4. Inhoudelijke alinea over taken en eigenschappen passend bij de brandpreventie/bouwsector in Nederland
5. ${positief_getuigschrift !== false ? "Positieve aanbevelingsregel" : "Neutrale slotformulering"}
6. Formele afsluiting met ruimte voor handtekening

Schrijf ALLEEN de brieftekst. Begin direct met de datum. Gebruik formeel Nederlands. Laat lege regels voor de handtekening onderaan.`;

    const getuigenisResultaat = await aiGateway.chat("default", {
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1200,
    });
    if (!getuigenisResultaat.ok) {
      return void res.status(503).json({ error: "AI-aanroep mislukt. Probeer opnieuw." });
    }

    return void res.json({
      brief_tekst: getuigenisResultaat.inhoud,
      samenvatting,
      ai_gebruikt: true,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ─── OFFBOARD UITVOEREN ───────────────────────────────────────────────────────
router.post("/medewerkers/:id/offboard", schrijven, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params.id);
    const { uit_dienst_per, deactiveer_account = true, reden, overdrachtsnota } = req.body as {
      uit_dienst_per?: string;
      deactiveer_account?: boolean;
      reden?: string;
      overdrachtsnota?: string;
    };

    if (!uit_dienst_per) {
      return void res.status(422).json({ error: "Veld 'uit_dienst_per' is verplicht." });
    }

    const [m] = await db
      .select()
      .from(medewerkersTable)
      .where(eq(medewerkersTable.id, id));

    if (!m) return void res.status(404).json({ error: "Niet gevonden" });
    if (m.uitDienstPer) {
      return void res.status(409).json({ error: `Medewerker is al uit dienst per ${m.uitDienstPer}.` });
    }

    const [bijgewerkt] = await db
      .update(medewerkersTable)
      .set({ uitDienstPer: uit_dienst_per, actief: false, bijgewerktOp: new Date() })
      .where(eq(medewerkersTable.id, id))
      .returning();

    if (deactiveer_account && m.gebruikerId) {
      await db
        .update(gebruikersTable)
        .set({ actief: false })
        .where(eq(gebruikersTable.id, m.gebruikerId));
    }

    req.log.info({ medewerker_id: id, uit_dienst_per, reden }, "Offboard uitgevoerd");
    invalideerContext("medewerker", id);

    const [functie] = bijgewerkt.functieId
      ? await db.select().from(functiesTable).where(eq(functiesTable.id, bijgewerkt.functieId))
      : [];

    return void res.json({
      id: bijgewerkt.id,
      naam: bijgewerkt.naam,
      werkmaatschappij: bijgewerkt.werkmaatschappij,
      functie_id: bijgewerkt.functieId ?? null,
      functie_naam: functie?.naam ?? null,
      actief: bijgewerkt.actief ?? false,
      in_dienst_sinds: bijgewerkt.inDienstSinds ?? null,
      uit_dienst_per: bijgewerkt.uitDienstPer ?? null,
      email: bijgewerkt.email ?? null,
      telefoon: bijgewerkt.telefoon ?? null,
      dienstverband: bijgewerkt.dienstverband ?? null,
      cao: bijgewerkt.cao ?? null,
      bijgewerkt_op: bijgewerkt.bijgewerktOp?.toISOString() ?? null,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Medewerker persoonsdocumenten ────────────────────────────────────────────

const DOCUMENT_TYPES_LABEL: Record<string, string> = {
  identiteitsbewijs: "Identiteitsbewijs",
  paspoort: "Paspoort",
  verblijfsvergunning: "Verblijfsvergunning",
  rijbewijs: "Rijbewijs",
  vca_certificaat: "VCA-certificaat",
  bhv_certificaat: "BHV-certificaat",
  ehbo_certificaat: "EHBO-certificaat",
  contract: "Arbeidscontract",
  arbeidscontract: "Arbeidscontract",
  loonstrook: "Loonstrook",
  cv: "CV",
  diploma: "Diploma",
  naw_formulier: "NAW-formulier",
  aow_verklaring: "AOW-verklaring",
  geheimhoudingsverklaring: "Geheimhoudingsverklaring",
  // legacy aliassen
  id_bewijs: "ID-bewijs",
  rijbewijs_scan: "Rijbewijsscan",
  overig: "Overig",
};

// Zet object_path om naar een download-URL via de storage-proxy.
// objectPath = "/objects/..." → download via /api/storage/objects/...
function docDownloadUrl(objectPath: string): string {
  const subPath = objectPath.startsWith("/objects/") ? objectPath.slice("/objects/".length) : objectPath;
  return `/api/storage/objects/${subPath}`;
}

// ─── Aanstellingen ────────────────────────────────────────────────────────────

function mapAanstelling(
  a: typeof medewerkerAanstellingenTable.$inferSelect,
  functieNaam?: string | null,
) {
  return {
    id: a.id,
    medewerker_id: a.medewerkerId,
    werkmaatschappij: a.werkmaatschappij,
    functie_id: a.functieId ?? null,
    functie_naam: functieNaam ?? null,
    cao: a.cao ?? null,
    contracturen_per_week: a.contracturenPerWeek ?? null,
    is_hoofd: a.isHoofd,
    aangemaakt_op: a.aangemaaktOp.toISOString(),
    bijgewerkt_op: a.bijgewerktOp.toISOString(),
  };
}

router.get("/medewerkers/:id/aanstellingen", lezen, async (req, res): Promise<void> => {
  try {
    const medId = parseId(req.params.id);
    const rijen = await db
      .select({
        a: medewerkerAanstellingenTable,
        functie_naam: functiesTable.naam,
      })
      .from(medewerkerAanstellingenTable)
      .leftJoin(functiesTable, eq(medewerkerAanstellingenTable.functieId, functiesTable.id))
      .where(eq(medewerkerAanstellingenTable.medewerkerId, medId))
      .orderBy(desc(medewerkerAanstellingenTable.isHoofd), medewerkerAanstellingenTable.werkmaatschappij);
    res.json(rijen.map((r) => mapAanstelling(r.a, r.functie_naam)));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/medewerkers/:id/aanstellingen", schrijven, async (req, res): Promise<void> => {
  try {
    const medId = parseId(req.params.id);
    const { werkmaatschappij, functie_id, cao, contracturen_per_week } = req.body as {
      werkmaatschappij: string;
      functie_id?: number | null;
      cao?: string;
      contracturen_per_week?: number | null;
    };
    if (!werkmaatschappij?.trim()) {
      return void res.status(400).json({ error: "werkmaatschappij is verplicht" });
    }
    const werkgeverId = await werkgeverIdVoor(werkmaatschappij.trim());
    const [nieuw] = await db
      .insert(medewerkerAanstellingenTable)
      .values({
        medewerkerId: medId,
        werkmaatschappij: werkmaatschappij.trim(),
        werkgeverId: werkgeverId ?? null,
        functieId: functie_id ?? null,
        cao: cao?.trim() || null,
        contracturenPerWeek: contracturen_per_week ?? null,
        isHoofd: false,
      })
      .returning();
    let functieNaam: string | null = null;
    if (nieuw.functieId) {
      const [f] = await db.select({ naam: functiesTable.naam }).from(functiesTable).where(eq(functiesTable.id, nieuw.functieId));
      functieNaam = f?.naam ?? null;
    }
    res.status(201).json(mapAanstelling(nieuw, functieNaam));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.patch("/medewerkers/:id/aanstellingen/:aanstellingId", schrijven, async (req, res): Promise<void> => {
  try {
    const medId = parseId(req.params.id);
    const aanstellingId = parseId(req.params.aanstellingId);
    const { werkmaatschappij, functie_id, cao, contracturen_per_week } = req.body as {
      werkmaatschappij?: string;
      functie_id?: number | null;
      cao?: string;
      contracturen_per_week?: number | null;
    };
    const huidig = await db
      .select()
      .from(medewerkerAanstellingenTable)
      .where(and(eq(medewerkerAanstellingenTable.id, aanstellingId), eq(medewerkerAanstellingenTable.medewerkerId, medId)));
    if (!huidig.length) return void res.status(404).json({ error: "Niet gevonden" });

    const nieuweWm = werkmaatschappij?.trim() ?? huidig[0].werkmaatschappij;
    const werkgeverId = await werkgeverIdVoor(nieuweWm);
    const [bijgewerkt] = await db
      .update(medewerkerAanstellingenTable)
      .set({
        werkmaatschappij: nieuweWm,
        werkgeverId: werkgeverId ?? huidig[0].werkgeverId,
        functieId: functie_id !== undefined ? (functie_id ?? null) : huidig[0].functieId,
        cao: cao !== undefined ? (cao?.trim() || null) : huidig[0].cao,
        contracturenPerWeek: contracturen_per_week !== undefined ? (contracturen_per_week ?? null) : huidig[0].contracturenPerWeek,
        bijgewerktOp: new Date(),
      })
      .where(eq(medewerkerAanstellingenTable.id, aanstellingId))
      .returning();

    let functieNaam: string | null = null;
    if (bijgewerkt.functieId) {
      const [f] = await db.select({ naam: functiesTable.naam }).from(functiesTable).where(eq(functiesTable.id, bijgewerkt.functieId));
      functieNaam = f?.naam ?? null;
    }

    if (bijgewerkt.isHoofd) {
      await syncHoofdNaarMedewerker(medId, bijgewerkt);
      invalideerContext("medewerker", medId);
    }

    res.json(mapAanstelling(bijgewerkt, functieNaam));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.delete("/medewerkers/:id/aanstellingen/:aanstellingId", schrijven, async (req, res): Promise<void> => {
  try {
    const medId = parseId(req.params.id);
    const aanstellingId = parseId(req.params.aanstellingId);
    const [bestaand] = await db
      .select()
      .from(medewerkerAanstellingenTable)
      .where(and(eq(medewerkerAanstellingenTable.id, aanstellingId), eq(medewerkerAanstellingenTable.medewerkerId, medId)));
    if (!bestaand) return void res.status(404).json({ error: "Niet gevonden" });
    if (bestaand.isHoofd) return void res.status(409).json({ error: "Kan de hoofdaanstelling niet verwijderen. Stel eerst een andere aanstelling als hoofd in." });
    await db.delete(medewerkerAanstellingenTable).where(eq(medewerkerAanstellingenTable.id, aanstellingId));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/medewerkers/:id/aanstellingen/:aanstellingId/hoofd", schrijven, async (req, res): Promise<void> => {
  try {
    const medId = parseId(req.params.id);
    const aanstellingId = parseId(req.params.aanstellingId);
    const [doelwit] = await db
      .select()
      .from(medewerkerAanstellingenTable)
      .where(and(eq(medewerkerAanstellingenTable.id, aanstellingId), eq(medewerkerAanstellingenTable.medewerkerId, medId)));
    if (!doelwit) return void res.status(404).json({ error: "Niet gevonden" });

    await db.transaction(async (tx) => {
      await tx.update(medewerkerAanstellingenTable).set({ isHoofd: false, bijgewerktOp: new Date() }).where(eq(medewerkerAanstellingenTable.medewerkerId, medId));
      await tx.update(medewerkerAanstellingenTable).set({ isHoofd: true, bijgewerktOp: new Date() }).where(eq(medewerkerAanstellingenTable.id, aanstellingId));
    });

    await syncHoofdNaarMedewerker(medId, { ...doelwit, isHoofd: true });
    invalideerContext("medewerker", medId);

    let functieNaam: string | null = null;
    if (doelwit.functieId) {
      const [f] = await db.select({ naam: functiesTable.naam }).from(functiesTable).where(eq(functiesTable.id, doelwit.functieId));
      functieNaam = f?.naam ?? null;
    }
    res.json(mapAanstelling({ ...doelwit, isHoofd: true }, functieNaam));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ─── AI contractanalyse ───────────────────────────────────────────────────────
router.post("/medewerkers/:id/ai-contract-analyse", schrijven, async (req, res): Promise<void> => {
  try {
    const medId = parseId(req.params.id);

    const docs = await db
      .select()
      .from(medewerkerDocumentenTable)
      .where(
        and(
          eq(medewerkerDocumentenTable.medewerkerId, medId),
          inArray(medewerkerDocumentenTable.type, ["contract", "arbeidscontract"]),
        ),
      )
      .orderBy(desc(medewerkerDocumentenTable.aangemaaktOp))
      .limit(1);

    if (!docs.length) {
      return void res
        .status(404)
        .json({ error: "Geen arbeidscontract gevonden. Upload eerst een document van het type 'Arbeidscontract'." });
    }

    if (!heeftGateway()) {
      return void res.status(503).json({ error: "AI is niet beschikbaar. Vul de velden handmatig in." });
    }

    const doc = docs[0];
    let tekst = "";
    try {
      const storageFile = await hrmStorage.getObjectEntityFile(doc.objectPath);
      const stream = storageFile.createReadStream();
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
      }
      const buf = Buffer.concat(chunks);
      const isPdf =
        (doc.contentType ?? "").includes("pdf") ||
        doc.bestandsnaam.toLowerCase().endsWith(".pdf");
      if (isPdf) {
        const parsed = await extraheerPdfTekst(buf);
        tekst = parsed.tekst ?? "";
      } else {
        tekst = buf.toString("utf-8");
      }
    } catch {
      return void res
        .status(422)
        .json({ error: "Contract kon niet worden gelezen. Gebruik een niet-gescand PDF-bestand." });
    }

    if (!tekst.trim() || tekst.trim().length < 30) {
      return void res
        .status(422)
        .json({ error: "Te weinig tekst gevonden. Gebruik een niet-gescand PDF-bestand." });
    }

    const prompt = `Analyseer het volgende arbeidscontract en extraheer de gevraagde velden. Antwoord UITSLUITEND met een geldig JSON-object (geen markdown, geen tekst buiten het object).

CONTRACTTEKST:
${tekst.slice(0, 6000)}

Extraheer exact deze velden (gebruik null als iets ontbreekt of onduidelijk is):
{
  "functie_naam": "functietitel zoals vermeld in het contract of null",
  "werkmaatschappij": "naam van de werkgever/werkmaatschappij of null",
  "cao": "naam van de van toepassing zijnde CAO of null",
  "contracturen_per_week": "aantal uur per week als getal (bijv. 40) of null",
  "dienstverband": "vast | tijdelijk | oproep | stage | inhuur | zzp | uitzend of null",
  "ai_toelichting": "korte opmerking over de betrouwbaarheid of null (max 1 zin)"
}`;

    const contractResultaat = await aiGateway.chat("default", {
      messages: [{ role: "user", content: prompt }],
      max_tokens: 400,
      response_format: { type: "json_object" },
    });
    if (!contractResultaat.ok) {
      return void res.status(503).json({ error: "AI-analyse mislukt. Probeer opnieuw." });
    }

    let resultaat: Record<string, unknown> = {};
    try {
      resultaat = JSON.parse(contractResultaat.inhoud);
    } catch {
      return void res.status(500).json({ error: "AI gaf een ongeldig antwoord. Probeer opnieuw." });
    }

    const uren = resultaat.contracturen_per_week;
    return void res.json({
      functie_naam: resultaat.functie_naam ?? null,
      werkmaatschappij: resultaat.werkmaatschappij ?? null,
      cao: resultaat.cao ?? null,
      contracturen_per_week:
        typeof uren === "number" ? uren : uren != null ? Number(uren) || null : null,
      dienstverband: resultaat.dienstverband ?? null,
      ai_toelichting: resultaat.ai_toelichting ?? null,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

async function syncHoofdNaarMedewerker(
  medewerkerId: number,
  hoofd: typeof medewerkerAanstellingenTable.$inferSelect,
) {
  await db
    .update(medewerkersTable)
    .set({
      werkmaatschappij: hoofd.werkmaatschappij,
      werkgeverId: hoofd.werkgeverId ?? null,
      functieId: hoofd.functieId ?? null,
      cao: hoofd.cao ?? null,
      contracturenPerWeek: hoofd.contracturenPerWeek ?? null,
      bijgewerktOp: new Date(),
    })
    .where(eq(medewerkersTable.id, medewerkerId));
}

// ─── Medewerker documenten ────────────────────────────────────────────────────

function mapMedewerkerDoc(d: typeof medewerkerDocumentenTable.$inferSelect) {
  return {
    id: d.id,
    medewerker_id: d.medewerkerId,
    type: d.type,
    type_label: DOCUMENT_TYPES_LABEL[d.type] ?? d.type,
    label: d.label ?? null,
    verloopdatum: d.verloopdatum ?? null,
    bestandsnaam: d.bestandsnaam,
    object_path: d.objectPath,
    content_type: d.contentType ?? null,
    download_url: docDownloadUrl(d.objectPath),
    aangemaakt_op: d.aangemaaktOp.toISOString(),
  };
}

router.get("/medewerkers/:id/documenten", lezen, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params.id);
    const docs = await db
      .select()
      .from(medewerkerDocumentenTable)
      .where(eq(medewerkerDocumentenTable.medewerkerId, id))
      .orderBy(desc(medewerkerDocumentenTable.aangemaaktOp));
    res.json(docs.map(mapMedewerkerDoc));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post(
  "/medewerkers/:id/documenten",
  schrijven,
  uploadGeheugem.single("bestand"),
  async (req, res): Promise<void> => {
    try {
      const medewerkerId = parseId(req.params.id);
      const bestand = req.file;
      if (!bestand) return void res.status(400).json({ error: "Geen bestand meegestuurd" });

      const type = (req.body.type as string | undefined)?.trim() || "overig";
      const label = (req.body.label as string | undefined)?.trim() || null;
      const verloopdatum = (req.body.verloopdatum as string | undefined)?.trim() || null;
      const ext = bestand.originalname.split(".").pop() ?? "bin";
      const subPath = `medewerker-documenten/${medewerkerId}/${type}/${Date.now()}.${ext}`;

      // uploadBestand retourneert "/objects/{subPath}"
      const objectPath = await hrmStorage.uploadBestand(subPath, bestand.buffer, bestand.mimetype);

      const [doc] = await db
        .insert(medewerkerDocumentenTable)
        .values({
          medewerkerId,
          type,
          label,
          verloopdatum,
          bestandsnaam: bestand.originalname,
          objectPath,
          contentType: bestand.mimetype,
          aangemaaktDoorId: req.session.userId ?? null,
        })
        .returning();

      req.log.info({ medewerker_id: medewerkerId, type, bestandsnaam: bestand.originalname }, "Medewerker document geupload");
      res.status(201).json(mapMedewerkerDoc(doc));

      // Fire-and-forget: analyseer het document op achtergrond voor AI-voorstellen
      const _log = req.log;
      const _doc = doc;
      const _buf = Buffer.from(bestand.buffer);
      void (async () => {
        try {
          const [mw] = await db
            .select()
            .from(medewerkersTable)
            .where(eq(medewerkersTable.id, medewerkerId));
          if (mw) await analyseerEnSlaVoorstellenOp(mw, _doc, _buf);
        } catch (analyseErr) {
          _log.warn({ err: analyseErr, doc_id: _doc.id }, "Auto-trigger AI-analyse document mislukt");
        }
      })();
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Interne serverfout" });
    }
  },
);

// ─── Tijdelijk analyseren zonder opslag (wizard stap 1) ─────────────────────

router.post(
  "/hrm/analyseer-bestand",
  lezen,
  uploadGeheugem.single("bestand"),
  async (req, res): Promise<void> => {
    try {
      const bestand = req.file;
      if (!bestand) return void res.status(400).json({ ok: false, error: "Geen bestand meegestuurd" });

      const velden = await extracteerHrmVeldenUitBuffer(
        Buffer.from(bestand.buffer),
        bestand.originalname,
        bestand.mimetype,
      );

      // succes=false = classificatie niet beschikbaar (Onbekend/laag+leeg)
      res.json({ ok: velden.succes, velden, foutmelding: velden.foutmelding ?? null });
    } catch (err) {
      req.log.warn({ err }, "Analyseer-bestand mislukt");
      res.json({ ok: false, velden: {}, error: "Analyse mislukt" });
    }
  },
);

router.get("/medewerkers/:id/documenten/:docId/download-url", lezen, async (req, res): Promise<void> => {
  try {
    const medewerkerId = parseId(req.params.id);
    const docId = parseId(req.params.docId);

    const [doc] = await db
      .select()
      .from(medewerkerDocumentenTable)
      .where(and(eq(medewerkerDocumentenTable.id, docId), eq(medewerkerDocumentenTable.medewerkerId, medewerkerId)));

    if (!doc) return void res.status(404).json({ error: "Document niet gevonden" });
    res.json({ download_url: docDownloadUrl(doc.objectPath) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.delete("/medewerkers/:id/documenten/:docId", schrijven, async (req, res): Promise<void> => {
  try {
    const medewerkerId = parseId(req.params.id);
    const docId = parseId(req.params.docId);

    const [doc] = await db
      .select()
      .from(medewerkerDocumentenTable)
      .where(and(eq(medewerkerDocumentenTable.id, docId), eq(medewerkerDocumentenTable.medewerkerId, medewerkerId)));

    if (!doc) return void res.status(404).json({ error: "Document niet gevonden" });

    await db.delete(medewerkerDocumentenTable).where(eq(medewerkerDocumentenTable.id, docId));
    req.log.info({ medewerker_id: medewerkerId, doc_id: docId }, "Medewerker document verwijderd");
    res.status(204).end();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ─── ZZP-overeenkomsten ───────────────────────────────────────────────────────

function mapOvereenkomst(o: typeof zzpOvereenkomstenTable.$inferSelect & { medewerker_naam?: string | null }) {
  return {
    id: o.id,
    medewerker_id: o.medewerkerId,
    medewerker_naam: o.medewerker_naam ?? null,
    aangemaakt_door_id: o.aangemaaktDoorId ?? null,
    opdracht_omschrijving: o.opdrachtOmschrijving,
    specifieke_taken: o.specifiekeTaken ?? null,
    projectnummer: o.projectnummer ?? null,
    start_datum: o.startDatum,
    eind_datum: o.eindDatum,
    uurtarief: o.uurtarief ?? null,
    vaste_prijs: o.vastePrijs ?? null,
    betalingswijze: o.betalingswijze,
    zzp_bedrijfsnaam: o.zzpBedrijfsnaam ?? null,
    zzp_kvk: o.zzpKvk ?? null,
    zzp_btw: o.zzpBtw ?? null,
    status: o.status,
    handtekening_fps_datum: o.handtekeningFpsDatum ?? null,
    handtekening_zzp_datum: o.handtekeningZzpDatum ?? null,
    ondertekend_door_id: o.ondertekendDoorId ?? null,
    ai_ingevuld: o.aiIngevuld,
    aangemaakt_op: o.aangemaaktOp,
    bijgewerkt_op: o.bijgewerktOp,
  };
}

router.get("/zzp-overeenkomsten", lezen, async (req, res): Promise<void> => {
  try {
    const medewerkerId = req.query.medewerker_id ? Number(req.query.medewerker_id) : null;

    const rijen = await db
      .select({
        ...getTableColumns(zzpOvereenkomstenTable),
        medewerker_naam: medewerkersTable.naam,
      })
      .from(zzpOvereenkomstenTable)
      .leftJoin(medewerkersTable, eq(zzpOvereenkomstenTable.medewerkerId, medewerkersTable.id))
      .where(medewerkerId ? eq(zzpOvereenkomstenTable.medewerkerId, medewerkerId) : undefined)
      .orderBy(desc(zzpOvereenkomstenTable.aangemaaktOp));

    res.json(rijen.map(mapOvereenkomst));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.post("/zzp-overeenkomsten", schrijven, async (req, res): Promise<void> => {
  try {
    const {
      medewerker_id, opdracht_omschrijving, specifieke_taken, projectnummer,
      start_datum, eind_datum, uurtarief, vaste_prijs, betalingswijze,
      zzp_bedrijfsnaam, zzp_kvk, zzp_btw, ai_ingevuld,
    } = req.body as Record<string, unknown>;

    if (!medewerker_id || !opdracht_omschrijving || !start_datum || !eind_datum) {
      return void res.status(400).json({ error: "medewerker_id, opdracht_omschrijving, start_datum en eind_datum zijn verplicht" });
    }

    const [nieuw] = await db.insert(zzpOvereenkomstenTable).values({
      medewerkerId: Number(medewerker_id),
      aangemaaktDoorId: req.session.userId ?? null,
      opdrachtOmschrijving: String(opdracht_omschrijving),
      specifiekeTaken: specifieke_taken ? String(specifieke_taken) : null,
      projectnummer: projectnummer ? String(projectnummer) : null,
      startDatum: String(start_datum),
      eindDatum: String(eind_datum),
      uurtarief: uurtarief ? Number(uurtarief) : null,
      vastePrijs: vaste_prijs ? Number(vaste_prijs) : null,
      betalingswijze: betalingswijze ? String(betalingswijze) : "factuur_achteraf",
      zzpBedrijfsnaam: zzp_bedrijfsnaam ? String(zzp_bedrijfsnaam) : null,
      zzpKvk: zzp_kvk ? String(zzp_kvk) : null,
      zzpBtw: zzp_btw ? String(zzp_btw) : null,
      aiIngevuld: Boolean(ai_ingevuld),
      bijgewerktOp: new Date(),
    }).returning();

    const [metNaam] = await db
      .select({ ...getTableColumns(zzpOvereenkomstenTable), medewerker_naam: medewerkersTable.naam })
      .from(zzpOvereenkomstenTable)
      .leftJoin(medewerkersTable, eq(zzpOvereenkomstenTable.medewerkerId, medewerkersTable.id))
      .where(eq(zzpOvereenkomstenTable.id, nieuw.id));

    req.log.info({ id: nieuw.id, medewerker_id }, "ZZP-overeenkomst aangemaakt");
    res.status(201).json(mapOvereenkomst(metNaam));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.get("/zzp-overeenkomsten/ai-vullen", (_req, res) => {
  res.status(405).json({ error: "Gebruik POST voor AI-invullen" });
});

router.post("/zzp-overeenkomsten/ai-vullen", schrijven, async (req, res): Promise<void> => {
  try {
    if (!heeftGateway()) {
      return void res.status(503).json({ error: "AI niet beschikbaar" });
    }
    const { medewerker_id, functie_naam, bedrijfsnaam, projectnummer } = req.body as Record<string, unknown>;

    if (!medewerker_id) {
      return void res.status(400).json({ error: "medewerker_id is verplicht" });
    }

    // Medewerker ophalen voor context
    const [medewerker] = await db
      .select({ naam: medewerkersTable.naam, dienstverband: medewerkersTable.dienstverband })
      .from(medewerkersTable)
      .where(eq(medewerkersTable.id, Number(medewerker_id)));

    const naam = medewerker?.naam ?? "de opdrachtnemer";
    const dvb = medewerker?.dienstverband ?? "zzp";
    const functie = functie_naam ? String(functie_naam) : "brandpreventie uitvoerder";
    const bedrijf = bedrijfsnaam ? String(bedrijfsnaam) : null;
    const project = projectnummer ? String(projectnummer) : null;

    const zzpResultaat = await aiGateway.chat("default", {
      max_tokens: 600,
      messages: [
        {
          role: "system",
          content: ZZP_JURIDISCH_PROMPT.tekst,
        },
        {
          role: "user",
          content: `Maak een opdrachtomschrijving en specifieke werkzaamheden voor:
- Opdrachtnemer: ${naam} (${dvb})
- Functie / vakgebied: ${functie}
${bedrijf ? `- Bedrijfsnaam: ${bedrijf}` : ""}
${project ? `- Project: ${project}` : ""}
- Opdrachtgever: FPS Brandpreventie

JSON-formaat:
{
  "opdracht_omschrijving": "<max 80 tekens, korte titel>",
  "specifieke_taken": "<3-5 alinea's, min. 200 woorden, eigen verantwoordelijkheid + geen gezagsverhouding + vervanging>",
  "zzp_bedrijfsnaam": "<bedrijfsnaam als bekend, anders null>"
}`,
        },
      ],
    });

    if (!zzpResultaat.ok) {
      return void res.status(503).json({ error: "AI-aanroep mislukt. Probeer opnieuw." });
    }
    let parsed: { opdracht_omschrijving?: string; specifieke_taken?: string; zzp_bedrijfsnaam?: string | null };
    try {
      parsed = JSON.parse(zzpResultaat.inhoud.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim());
    } catch {
      return void res.status(500).json({ error: "AI-antwoord kon niet worden verwerkt" });
    }

    res.json({
      opdracht_omschrijving: parsed.opdracht_omschrijving ?? "",
      specifieke_taken: parsed.specifieke_taken ?? "",
      zzp_bedrijfsnaam: parsed.zzp_bedrijfsnaam ?? null,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.get("/zzp-overeenkomsten/:id", lezen, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params.id);
    const [rij] = await db
      .select({ ...getTableColumns(zzpOvereenkomstenTable), medewerker_naam: medewerkersTable.naam })
      .from(zzpOvereenkomstenTable)
      .leftJoin(medewerkersTable, eq(zzpOvereenkomstenTable.medewerkerId, medewerkersTable.id))
      .where(eq(zzpOvereenkomstenTable.id, id));

    if (!rij) return void res.status(404).json({ error: "Overeenkomst niet gevonden" });
    res.json(mapOvereenkomst(rij));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.patch("/zzp-overeenkomsten/:id", schrijven, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params.id);
    const {
      opdracht_omschrijving, specifieke_taken, projectnummer,
      start_datum, eind_datum, uurtarief, vaste_prijs, betalingswijze,
      zzp_bedrijfsnaam, zzp_kvk, zzp_btw, status,
      handtekening_fps_datum, handtekening_zzp_datum,
    } = req.body as Record<string, unknown>;

    const [bestaand] = await db.select().from(zzpOvereenkomstenTable).where(eq(zzpOvereenkomstenTable.id, id));
    if (!bestaand) return void res.status(404).json({ error: "Overeenkomst niet gevonden" });

    // Status workflow: ondertekend_door_id instellen bij "ondertekend"
    const nieuweStatus = status ? String(status) : undefined;
    const ondertekendDoorId =
      nieuweStatus === "ondertekend" && !bestaand.ondertekendDoorId
        ? (req.session.userId ?? null)
        : bestaand.ondertekendDoorId;

    const [bijgewerkt] = await db
      .update(zzpOvereenkomstenTable)
      .set({
        ...(opdracht_omschrijving !== undefined && { opdrachtOmschrijving: String(opdracht_omschrijving) }),
        ...(specifieke_taken !== undefined && { specifiekeTaken: specifieke_taken ? String(specifieke_taken) : null }),
        ...(projectnummer !== undefined && { projectnummer: projectnummer ? String(projectnummer) : null }),
        ...(start_datum !== undefined && { startDatum: String(start_datum) }),
        ...(eind_datum !== undefined && { eindDatum: String(eind_datum) }),
        ...(uurtarief !== undefined && { uurtarief: uurtarief ? Number(uurtarief) : null }),
        ...(vaste_prijs !== undefined && { vastePrijs: vaste_prijs ? Number(vaste_prijs) : null }),
        ...(betalingswijze !== undefined && { betalingswijze: String(betalingswijze) }),
        ...(zzp_bedrijfsnaam !== undefined && { zzpBedrijfsnaam: zzp_bedrijfsnaam ? String(zzp_bedrijfsnaam) : null }),
        ...(zzp_kvk !== undefined && { zzpKvk: zzp_kvk ? String(zzp_kvk) : null }),
        ...(zzp_btw !== undefined && { zzpBtw: zzp_btw ? String(zzp_btw) : null }),
        ...(nieuweStatus !== undefined && { status: nieuweStatus }),
        ...(handtekening_fps_datum !== undefined && { handtekeningFpsDatum: handtekening_fps_datum ? String(handtekening_fps_datum) : null }),
        ...(handtekening_zzp_datum !== undefined && { handtekeningZzpDatum: handtekening_zzp_datum ? String(handtekening_zzp_datum) : null }),
        ondertekendDoorId,
        bijgewerktOp: new Date(),
      })
      .where(eq(zzpOvereenkomstenTable.id, id))
      .returning();

    const [metNaam] = await db
      .select({ ...getTableColumns(zzpOvereenkomstenTable), medewerker_naam: medewerkersTable.naam })
      .from(zzpOvereenkomstenTable)
      .leftJoin(medewerkersTable, eq(zzpOvereenkomstenTable.medewerkerId, medewerkersTable.id))
      .where(eq(zzpOvereenkomstenTable.id, bijgewerkt.id));

    req.log.info({ id, status: nieuweStatus }, "ZZP-overeenkomst bijgewerkt");
    res.json(mapOvereenkomst(metNaam));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.delete("/zzp-overeenkomsten/:id", schrijven, async (req, res): Promise<void> => {
  try {
    const id = parseId(req.params.id);
    const [bestaand] = await db.select().from(zzpOvereenkomstenTable).where(eq(zzpOvereenkomstenTable.id, id));
    if (!bestaand) return void res.status(404).json({ error: "Overeenkomst niet gevonden" });
    if (bestaand.status !== "concept") {
      return void res.status(409).json({ error: "Alleen concept-overeenkomsten kunnen worden verwijderd" });
    }
    await db.delete(zzpOvereenkomstenTable).where(eq(zzpOvereenkomstenTable.id, id));
    req.log.info({ id }, "ZZP-overeenkomst verwijderd");
    res.status(204).end();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Verlof-vervalsignalen ─────────────────────────────────────────────────────

router.get("/verlof/vervalsignalen", lezen, async (req, res): Promise<void> => {
  try {
    const dagvenster = req.query.dagvenster ? Math.min(Number(req.query.dagvenster), 365) : 90;
    const signalen = await haalVervalsignalen(isNaN(dagvenster) ? 90 : dagvenster);
    res.json(signalen);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── CAO-presets synchroniseren ────────────────────────────────────────────────

router.post("/verlof/synchroniseer-cao-presets", alleenBeheerder, async (req, res): Promise<void> => {
  try {
    const resultaat = await zaaiVerlofPresets();
    req.log.info(resultaat, "CAO-presets handmatig gesynchroniseerd");
    res.json({
      verlofsoorten_toegevoegd: resultaat.verlofsoorten,
      feestdagen_toegevoegd: resultaat.feestdagen,
      jaarafsluiting_regels_toegevoegd: resultaat.jaarAfsluitingRegels,
      bericht:
        resultaat.verlofsoorten + resultaat.feestdagen + resultaat.jaarAfsluitingRegels === 0
          ? "Alles is al up-to-date."
          : `${resultaat.verlofsoorten} verlofsoorten, ${resultaat.feestdagen} feestdagen en ${resultaat.jaarAfsluitingRegels} jaarafsluitingregels toegevoegd.`,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Poortwachter (Wet Verbetering Poortwachter) ───────────────────────────────
// 7 verplichte WvP-mijlpalen; gemiste deadlines → UWV-sanctie (max. 52 weken extra loon).

const POORTWACHTER_MIJLPALEN_DEF = [
  { type: "probleemanalyse",            label: "Probleemanalyse (bedrijfsarts)",         dagOffset: 42  },
  { type: "plan_van_aanpak",            label: "Plan van aanpak",                        dagOffset: 56  },
  { type: "uwv_melding",               label: "UWV-melding langdurig ziekte",            dagOffset: 294 },
  { type: "eerstejaarsevaluatie",      label: "Eerstejaarsevaluatie (1e jaar)",          dagOffset: 364 },
  { type: "arbeidsdeskundig_onderzoek", label: "Arbeidsdeskundig onderzoek",             dagOffset: 609 },
  { type: "wia_aanvraag",              label: "WIA-aanvraag indienen",                   dagOffset: 637 },
  { type: "einde_loondoorbetaling",    label: "Einde loondoorbetaling (104 weken)",      dagOffset: 728 },
] as const;

function berekenDeadlinePwt(startDatum: string, dagOffset: number): string {
  const d = new Date(startDatum);
  d.setDate(d.getDate() + dagOffset);
  return d.toISOString().slice(0, 10);
}

function mijlpaalStatus(deadlineDatum: string, afgerondOp: Date | null): "afgerond" | "buiten_termijn" | "nadert" | "open" {
  if (afgerondOp) return "afgerond";
  const deadline = new Date(deadlineDatum);
  const nu = new Date(); nu.setHours(0, 0, 0, 0);
  const dagVerschil = Math.floor((deadline.getTime() - nu.getTime()) / 86400000);
  if (dagVerschil < 0) return "buiten_termijn";
  if (dagVerschil <= 14) return "nadert";
  return "open";
}

function mapMijlpaalRow(
  rij: typeof poortwachterMijlpalenTable.$inferSelect,
  bijgewerktDoorNaam: string | null,
) {
  const def = POORTWACHTER_MIJLPALEN_DEF.find((d) => d.type === rij.type);
  return {
    id: rij.id,
    dossier_id: rij.dossierId,
    type: rij.type,
    label: def?.label ?? rij.type,
    dag_offset: def?.dagOffset ?? 0,
    deadline_datum: rij.deadlineDatum,
    status: mijlpaalStatus(rij.deadlineDatum, rij.afgerondOp),
    afgerond_op: rij.afgerondOp?.toISOString() ?? null,
    notitie: rij.notitie ?? null,
    bijgewerkt_door_naam: bijgewerktDoorNaam,
  };
}

async function haalMijlpalenVoorDossier(dossierId: number) {
  return db
    .select({ mijlpaal: poortwachterMijlpalenTable, naam: gebruikersTable.naam })
    .from(poortwachterMijlpalenTable)
    .leftJoin(gebruikersTable, eq(gebruikersTable.id, poortwachterMijlpalenTable.bijgewerktDoorId))
    .where(eq(poortwachterMijlpalenTable.dossierId, dossierId))
    .orderBy(poortwachterMijlpalenTable.deadlineDatum);
}

// GET /poortwachter — overzicht alle dossiers (voor signalering op dashboard)
router.get("/poortwachter", requireBevoegdheid("personeel", 1), async (req, res): Promise<void> => {
  const dossierRows = await db
    .select({
      dossier: poortwachterDossiersTable,
      medewerker_naam: medewerkersTable.naam,
      start_datum: ziekmeldingenTable.startDatum,
    })
    .from(poortwachterDossiersTable)
    .innerJoin(medewerkersTable, eq(medewerkersTable.id, poortwachterDossiersTable.medewerkerId))
    .innerJoin(ziekmeldingenTable, eq(ziekmeldingenTable.id, poortwachterDossiersTable.ziekmeldingId))
    .orderBy(desc(poortwachterDossiersTable.aangemaaktOp));

  const result = await Promise.all(dossierRows.map(async (d) => {
    const mijlpalen = await haalMijlpalenVoorDossier(d.dossier.id);
    return {
      id: d.dossier.id,
      ziekmelding_id: d.dossier.ziekmeldingId,
      medewerker_id: d.dossier.medewerkerId,
      medewerker_naam: d.medewerker_naam,
      start_datum: d.start_datum,
      mijlpalen: mijlpalen.map((m) => mapMijlpaalRow(m.mijlpaal, m.naam ?? null)),
    };
  }));

  return void res.json(result);
});

// GET /ziekmeldingen/:id/poortwachter — dossier ophalen of aanmaken (idempotent)
router.get("/ziekmeldingen/:id/poortwachter", requireBevoegdheid("personeel", 1), async (req, res): Promise<void> => {
  const ziekmeldingId = parseInt(String(req.params.id), 10);
  if (isNaN(ziekmeldingId)) return void res.status(400).json({ error: "Ongeldig id" });

  const [ziekmelding] = await db
    .select({ id: ziekmeldingenTable.id, medewerkerId: ziekmeldingenTable.medewerkerId, startDatum: ziekmeldingenTable.startDatum })
    .from(ziekmeldingenTable)
    .where(eq(ziekmeldingenTable.id, ziekmeldingId));
  if (!ziekmelding) return void res.status(404).json({ error: "Ziekmelding niet gevonden" });

  const [medewerker] = await db
    .select({ id: medewerkersTable.id, naam: medewerkersTable.naam })
    .from(medewerkersTable)
    .where(eq(medewerkersTable.id, ziekmelding.medewerkerId));
  if (!medewerker) return void res.status(404).json({ error: "Medewerker niet gevonden" });

  let [dossier] = await db
    .select()
    .from(poortwachterDossiersTable)
    .where(eq(poortwachterDossiersTable.ziekmeldingId, ziekmeldingId));

  if (!dossier) {
    [dossier] = await db
      .insert(poortwachterDossiersTable)
      .values({ ziekmeldingId, medewerkerId: ziekmelding.medewerkerId })
      .returning();

    await db.insert(poortwachterMijlpalenTable).values(
      POORTWACHTER_MIJLPALEN_DEF.map((def) => ({
        dossierId: dossier.id,
        type: def.type,
        deadlineDatum: berekenDeadlinePwt(ziekmelding.startDatum, def.dagOffset),
      })),
    );
  }

  const mijlpalen = await haalMijlpalenVoorDossier(dossier.id);

  return void res.json({
    id: dossier.id,
    ziekmelding_id: dossier.ziekmeldingId,
    medewerker_id: dossier.medewerkerId,
    medewerker_naam: medewerker.naam,
    start_datum: ziekmelding.startDatum,
    mijlpalen: mijlpalen.map((m) => mapMijlpaalRow(m.mijlpaal, m.naam ?? null)),
  });
});

// PATCH /poortwachter/:dossierId/mijlpalen/:type — mijlpaal afvinken of notitie bijwerken
router.patch("/poortwachter/:dossierId/mijlpalen/:type", requireBevoegdheid("personeel", 2), async (req, res): Promise<void> => {
  const dossierId = parseInt(String(req.params.dossierId), 10);
  if (isNaN(dossierId)) return void res.status(400).json({ error: "Ongeldig dossier-id" });
  const type = String(req.params.type);

  const { afgerond, notitie } = req.body as { afgerond?: boolean; notitie?: string };

  const [bestaand] = await db
    .select()
    .from(poortwachterMijlpalenTable)
    .where(and(eq(poortwachterMijlpalenTable.dossierId, dossierId), eq(poortwachterMijlpalenTable.type, type)));
  if (!bestaand) return void res.status(404).json({ error: "Mijlpaal niet gevonden" });

  const gebruikerId: number | null = (req.session as { userId?: number }).userId ?? null;
  const update: Partial<typeof poortwachterMijlpalenTable.$inferInsert> = {
    bijgewerktOp: new Date(),
    bijgewerktDoorId: gebruikerId,
  };
  if (afgerond === true && !bestaand.afgerondOp) update.afgerondOp = new Date();
  if (afgerond === false) update.afgerondOp = null;
  if (notitie !== undefined) update.notitie = notitie;

  const [bijgewerkt] = await db
    .update(poortwachterMijlpalenTable)
    .set(update)
    .where(and(eq(poortwachterMijlpalenTable.dossierId, dossierId), eq(poortwachterMijlpalenTable.type, type)))
    .returning();

  let naam: string | null = null;
  if (bijgewerkt.bijgewerktDoorId) {
    const [g] = await db.select({ naam: gebruikersTable.naam }).from(gebruikersTable).where(eq(gebruikersTable.id, bijgewerkt.bijgewerktDoorId));
    naam = g?.naam ?? null;
  }

  return void res.json(mapMijlpaalRow(bijgewerkt, naam));
});

export default router;
