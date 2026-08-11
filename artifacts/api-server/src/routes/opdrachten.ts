// Opdrachten & Werkbegrotingen — /api/offertes/:id/maak-opdracht, /api/opdrachten/*
// Brug tussen geaccepteerde offerte → werkbegroting → planning → uurstaten → nacalculatie
import { Router } from "express";
import { workflowService, maakTransitieContext } from "../services/workflow-engine";
import {
  db,
  opdrachtenTable,
  projectBegrotingenTable,
  werkbegrotingRegelsTable,
  modCalcHeadersTable,
  modCalcRegelsTable,
  offertesTable,
  planningItemsTable,
  urenRegistratiesTable,
  medewerkersTable,
  gebruikersTable,
  gebouwenTable,
  reserveringenTable,
  voorraadMutatiesTable,
  voorraadTable,
  artikelenTable,
  werkbegrotingAdviezenTable,
  inkoopplannenTable,
  inkoopplanRegelsTable,
  fieNacalculatiesTable,
  pimUitvoeringStappenTable,
  pimModellenTable,
} from "@workspace/db";
import { eq, and, sql, sum, asc, isNull, desc, or, inArray, isNotNull } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { aiGateway, heeftGateway } from "../lib/aiGateway";
import { BEGROTING_ANALYSE_PROMPT, WERKVOORBEREIDING_ADVIES_PROMPT, WERKBEGROTING_CHAT_BASE_PROMPT } from "../lib/aiPrompts";
import { bouwWerkbegrotingEigenCijfersContext } from "../lib/inkoopEigenCijfers";
import { logger } from "../lib/logger";
import { berekenEnSlaOpNacalculatie } from "../services/fie-service";
import { meldAanWerkvoorbereiderMetCcProjectleider } from "../lib/bouwMeldingen";
import { AKKOORD_GRONDEN, type AkkoordGrond } from "../lib/akkoordPoort";
import { checkVereistGoedkeuring, haalGoedgekeurdeAanvraag } from "../services/goedkeuring-engine";
import { logActiviteit } from "../lib/activiteit";
import { documentenTable } from "@workspace/db";
import { analyseerOpdrachtbevestiging } from "../lib/documentIntelligence";
import { ObjectStorageService } from "../lib/objectStorage";

const objectStorage = new ObjectStorageService();

const router = Router();
const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;

// BOUW_01 §1 (René, 09-08-2026): opdrachten & werkbegroting vallen onder de
// eigen sleutel 'projecten' (1 = lezen zonder bedragen, 2 = lezen mét
// bedragen, 3 = schrijven). Alleen het aanmaken van een opdracht vanuit een
// offerte blijft een offerte-handeling.
const lezen    = requireBevoegdheid("projecten", 1);
const schrijven = requireBevoegdheid("projecten", 3);
const metBedragen = requireBevoegdheid("projecten", 2);
const maakOpdrachtRecht = requireBevoegdheid("offertes", 2);

// Server-side beslissing welke weergave iemand krijgt (§3.1): wie geen recht
// heeft op bedragen, krijgt ze niet in het antwoord — nooit alleen in de app
// verbergen.
function magBedragenZien(req: import("express").Request): boolean {
  const perm = req.permissies;
  if (!perm) return false;
  return perm.isHoofdbeheerder || perm.heeftModuleRecht("projecten", 2);
}

function mapOpdracht(
  o: typeof opdrachtenTable.$inferSelect,
  begrotingId: number | null,
  begrotingStatus: string | null,
  begrotingUren: number | null,
  g?: { naam: string | null; adres: string | null; postcode: string | null; stad: string | null } | null,
  uitvoeringStapActief?: number | null,
) {
  return {
    id: o.id,
    offerte_id: o.offerteId ?? null,
    calculatie_id: o.calculatieId ?? null,
    gebouw_id: o.gebouwId ?? null,
    project_id: o.projectId ?? null,
    titel: o.titel,
    werknummer: o.werknummer ?? null,
    opdrachtgever: o.opdrachtgever ?? null,
    omschrijving: o.omschrijving ?? null,
    type: o.type ?? null,
    status: o.status,
    gebouw_naam: g?.naam ?? null,
    gebouw_adres: g?.adres ?? null,
    gebouw_postcode: g?.postcode ?? null,
    gebouw_stad: g?.stad ?? null,
    aangemaakt_op: iso(o.aangemaaktOp)!,
    bijgewerkt_op: iso(o.bijgewerktOp)!,
    begroting_id: begrotingId,
    begroting_status: begrotingStatus,
    begroting_totaal_arbeid_uren: begrotingUren,
    ai_fase: o.aiFase ?? null,
    // UREN_01 §6c.2: instelbaar of een mandagstaat met de factuur meegaat.
    mandagstaat_vereist: o.mandagstaatVereist,
    uitvoering_stap_actief: uitvoeringStapActief ?? null,
  };
}

function mapRegel(r: typeof werkbegrotingRegelsTable.$inferSelect, toonBedragen = true) {
  return {
    id: r.id,
    begroting_id: r.begrotingId,
    calc_regel_id: r.calcRegelId ?? null,
    categorie: r.categorie,
    omschrijving: r.omschrijving,
    eenheid: r.eenheid,
    hoeveelheid: r.hoeveelheid,
    tarief: toonBedragen ? r.tarief : null,
    totaal: toonBedragen ? r.totaal : null,
    hoofdstuk: r.hoofdstuk,
    ai_inkoop_voorstel: r.aiInkoopVoorstel ?? null,
    ai_arbeid_voorstel: r.aiArbeidVoorstel ?? null,
  };
}

function mapBegroting(
  b: typeof projectBegrotingenTable.$inferSelect,
  regels: typeof werkbegrotingRegelsTable.$inferSelect[],
  toonBedragen = true,
) {
  return {
    id: b.id,
    opdracht_id: b.opdrachtId ?? null,
    calculatie_id: b.calculatieId ?? null,
    gebouw_id: b.gebouwId ?? null,
    werknummer: b.werknummer ?? null,
    hoofd_uren_begroot: b.hoofdUrenBegroot,
    totaal_arbeid_uren: b.totaalArbeidUren,
    totaal_materiaal_bedrag: toonBedragen ? b.totaalMateriaalBedrag : null,
    omschrijving: b.omschrijving ?? null,
    status: b.status,
    vastgesteld_op: iso(b.vastgesteldOp),
    ai_analyse: (b.aiAnalyse as Record<string, unknown>) ?? null,
    ai_analyse_op: iso(b.aiAnalyseOp),
    aangemaakt_op: iso(b.aangemaaktOp)!,
    bijgewerkt_op: iso(b.bijgewerktOp)!,
    regels: regels.map((r) => mapRegel(r, toonBedragen)),
  };
}

// ── POST /offertes/:id/maak-opdracht ──────────────────────────────────────

router.post("/offertes/:id/maak-opdracht", maakOpdrachtRecht, async (req, res): Promise<void> => {
  const offerteId = parseInt(String(req.params.id), 10);
  if (isNaN(offerteId)) { res.status(400).json({ error: "Ongeldig offerte-id" }); return; }

  try {
    const [offerte] = await db.select().from(offertesTable).where(eq(offertesTable.id, offerteId));
    if (!offerte) { res.status(404).json({ error: "Offerte niet gevonden" }); return; }

    const { calculatie_id, titel, werknummer, omschrijving } = req.body as {
      calculatie_id?: number;
      titel?: string;
      werknummer?: string;
      omschrijving?: string;
    };

    const calcId = calculatie_id ?? null;
    const opdrachtTitel = titel ?? offerte.titel ?? `Opdracht ${offerteId}`;

    // AKKOORD_01 §7: de werkomschrijving reist mee — geen body-omschrijving,
    // dan de kop-omschrijving van de gekoppelde calculatie overnemen.
    let erfOmschrijving: string | null = omschrijving ?? null;
    if (!erfOmschrijving && calcId) {
      const [calc] = await db.select({ omschrijving: modCalcHeadersTable.omschrijving })
        .from(modCalcHeadersTable).where(eq(modCalcHeadersTable.id, calcId));
      erfOmschrijving = calc?.omschrijving ?? null;
    }

    // AKKOORD_01 §2 grond A: is de offerte al ondertekend, dan wordt het
    // akkoord automatisch vastgelegd bij het aanmaken van de opdracht —
    // er bestaat geen ander aanmaakmoment "bij ondertekening" (gemeten).
    const autoAkkoord = offerte.status === "ondertekend";

    // Bestaande opdracht voor deze offerte ophalen
    const [bestaande] = await db.select().from(opdrachtenTable)
      .where(eq(opdrachtenTable.offerteId, offerteId));
    if (bestaande) {
      res.status(409).json({ error: "Er bestaat al een opdracht voor deze offerte", opdracht_id: bestaande.id });
      return;
    }

    // Opdracht + werkbegroting + regels in ÉÉN transactie (schuldpunt 15):
    // een fout halverwege (bv. bij het overzetten van calculatieregels) laat
    // anders een opdracht zonder werkbegroting achter — gedeeltelijke write.
    const resultaat = await db.transaction(async (tx) => {
    // Opdracht aanmaken
    const [opdracht] = await tx.insert(opdrachtenTable).values({
      offerteId,
      calculatieId: calcId,
      gebouwId: offerte.gebouwId ?? null,
      projectId: offerte.autoProjectId ?? null,
      titel: opdrachtTitel,
      werknummer: werknummer ?? offerte.onsKenmerk ?? null,
      opdrachtgever: offerte.opdrachtgever ?? null,
      omschrijving: erfOmschrijving,
      // AKKOORD_01: grond A automatisch bij ondertekende offerte, condities
      // uit de offerte zelf (geen tweede voorwaardenopslag — verwijzing + snapshotvelden).
      ...(autoAkkoord ? {
        akkoordGrond: "ondertekening" as const,
        akkoordDoorId: req.session.userId!,
        akkoordOp: new Date(),
        conditieBetaaltermijnDagen: offerte.betalingstermijnDagen ?? null,
        conditieVoorwaardenSetId: offerte.voorwaardenSetId ?? null,
      } : {}),
      status: "actief",
      aangemaaktDoorId: req.session.userId!,
      bijgewerktOp: new Date(),
    }).returning();
    if (!opdracht) throw new Error("Opdracht-insert gaf geen rij terug");

    // Werkbegroting aanmaken (project_begrotingen)
    const begrotingValues: {
      opdrachtId: number;
      calculatieId: number | null;
      gebouwId: number | null;
      projectId: number | null;
      werknummer: string | null;
      hoofdUrenBegroot: number;
      totaalArbeidUren: number;
      totaalMateriaalBedrag: number;
      status: string;
      aangemaaktDoorId: number | null;
      bijgewerktOp: Date;
    } = {
      opdrachtId: opdracht.id,
      calculatieId: calcId,
      gebouwId: offerte.gebouwId ?? null,
      projectId: offerte.autoProjectId ?? null,
      werknummer: werknummer ?? offerte.onsKenmerk ?? null,
      hoofdUrenBegroot: 0,
      totaalArbeidUren: 0,
      totaalMateriaalBedrag: 0,
      status: "concept",
      aangemaaktDoorId: req.session.userId!,
      bijgewerktOp: new Date(),
    };

    const [begroting] = await tx.insert(projectBegrotingenTable).values(begrotingValues).returning();
    if (!begroting) throw new Error("Werkbegroting-insert gaf geen rij terug");

    // Calculatieregels overzetten naar werkbegroting (zonder opslagen/winst)
    let totaalArbeidUren = 0;
    let totaalMateriaalBedrag = 0;

    if (calcId) {
      const calcRegels = await tx.select().from(modCalcRegelsTable)
        .where(eq(modCalcRegelsTable.calculatieId, calcId))
        .orderBy(asc(modCalcRegelsTable.volgorde));

      const regelValues = calcRegels
        .filter(r => !r.isStaartkosten && !r.isBouwplaatskosten)
        .map(r => {
          const hoeveelheid = r.hoeveelheid ?? 0;
          const tarief = r.tarief ?? 0;
          const totaal = r.totaal ?? hoeveelheid * tarief;

          if (r.categorie === "arbeid") {
            const uren = r.muPerEenheid > 0 ? hoeveelheid * r.muPerEenheid : hoeveelheid;
            totaalArbeidUren += uren;
          } else if (r.categorie === "materiaal") {
            totaalMateriaalBedrag += totaal;
          }

          return {
            begrotingId: begroting.id,
            calcRegelId: r.id,
            // UREN_01 §6b: uurcode direct meekopiëren — afleiden via twee
            // stappen breekt zodra iemand handmatig een regel toevoegt.
            normtijdId: r.normtijdId ?? null,
            categorie: r.categorie,
            omschrijving: r.omschrijving,
            eenheid: r.eenheid,
            hoeveelheid,
            tarief,
            totaal,
            hoofdstuk: r.hoofdstuk ?? "Overige werkzaamheden",
            bijgewerktOp: new Date(),
          };
        });

      if (regelValues.length > 0) {
        await tx.insert(werkbegrotingRegelsTable).values(regelValues);
      }

      // Totalen terugschrijven
      await tx.update(projectBegrotingenTable)
        .set({
          hoofdUrenBegroot: totaalArbeidUren,
          totaalArbeidUren,
          totaalMateriaalBedrag,
          bijgewerktOp: new Date(),
        })
        .where(eq(projectBegrotingenTable.id, begroting.id));
    }

    return { opdracht, begroting, totaalArbeidUren, totaalMateriaalBedrag };
    });
    const { opdracht, begroting, totaalArbeidUren, totaalMateriaalBedrag } = resultaat;

    // AI stelt automatisch een werkbegrotinganalyse voor op de achtergrond,
    // zodat de werkvoorbereider bij het openen van de opdracht direct een
    // voorstel ziet. Niet-blokkerend; de mens bevestigt/wijzigt altijd zelf.
    if (totaalArbeidUren > 0 || totaalMateriaalBedrag > 0) {
      void genereerWerkbegrotingAiAnalyse(opdracht.id).catch((err) => {
        logger.warn({ err, opdrachtId: opdracht.id }, "Automatische AI-werkbegrotinganalyse mislukt");
      });
    }

    res.status(201).json(mapOpdracht(opdracht, begroting.id, begroting.status, totaalArbeidUren));
  } catch (err) {
    // Race: twee gelijktijdige verzoeken kunnen allebei de pre-check passeren;
    // de unieke index opdrachten_offerte_id_uniek (migratie 0006) vangt dat op
    // databaseniveau af → dezelfde 409 als bij de pre-check.
    const code = (err as { code?: string; cause?: { code?: string } })?.code
      ?? (err as { cause?: { code?: string } })?.cause?.code;
    if (code === "23505") {
      const [bestaande] = await db.select().from(opdrachtenTable)
        .where(eq(opdrachtenTable.offerteId, offerteId));
      res.status(409).json({ error: "Er bestaat al een opdracht voor deze offerte", opdracht_id: bestaande?.id });
      return;
    }
    logger.error({ err }, "maak-opdracht fout");
    res.status(500).json({ error: "Serverfout bij aanmaken opdracht" });
  }
});

// ── AKKOORD_01: akkoord vastleggen / intrekken / condities ────────────────

function mapAkkoord(o: typeof opdrachtenTable.$inferSelect) {
  return {
    akkoord_grond: o.akkoordGrond ?? null,
    akkoord_door_id: o.akkoordDoorId ?? null,
    akkoord_op: iso(o.akkoordOp),
    akkoord_document_id: o.akkoordDocumentId ?? null,
    akkoord_herkomst: o.akkoordHerkomst ?? null,
    conditie_betaaltermijn_dagen: o.conditieBetaaltermijnDagen ?? null,
    conditie_garantietermijn: o.conditieGarantietermijn ?? null,
    conditie_meerwerk: o.conditieMeerwerk ?? null,
    conditie_oplevering: o.conditieOplevering ?? null,
    conditie_boete_korting: o.conditieBoeteKorting ?? null,
    conditie_voorwaarden_set_id: o.conditieVoorwaardenSetId ?? null,
    conditie_voorwaarden_tekst: o.conditieVoorwaardenTekst ?? null,
  };
}

// GET /opdrachten/:id/akkoord — akkoordstatus + condities (leesrecht volstaat).
router.get("/opdrachten/:id/akkoord", lezen, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }
  const [o] = await db.select().from(opdrachtenTable).where(eq(opdrachtenTable.id, id));
  if (!o) { res.status(404).json({ error: "Opdracht niet gevonden" }); return; }
  res.json(mapAkkoord(o));
});

// POST /opdrachten/:id/akkoord — akkoord vastleggen op één van de drie gronden.
router.post("/opdrachten/:id/akkoord", schrijven, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  const body = req.body as {
    grond?: string;
    document_id?: number | null;
    herkomst?: string | null;
    condities?: {
      betaaltermijn_dagen?: number | null;
      garantietermijn?: string | null;
      meerwerk?: string | null;
      oplevering?: string | null;
      boete_korting?: string | null;
      voorwaarden_set_id?: number | null;
      voorwaarden_tekst?: string | null;
    };
  };

  const grond = body.grond as AkkoordGrond | undefined;
  if (!grond || !AKKOORD_GRONDEN.includes(grond)) {
    res.status(400).json({ error: `Ongeldige grond; kies één van: ${AKKOORD_GRONDEN.join(", ")}` });
    return;
  }

  try {
    const [o] = await db.select().from(opdrachtenTable).where(eq(opdrachtenTable.id, id));
    if (!o) { res.status(404).json({ error: "Opdracht niet gevonden" }); return; }
    if (o.akkoordGrond) {
      res.status(409).json({ error: "Er is al een akkoord vastgelegd op deze opdracht. Intrekken kan alleen door de hoofdbeheerder." });
      return;
    }

    // Grondspecifieke eisen (§2): elk akkoord moet herleidbaar zijn.
    let offerte: typeof offertesTable.$inferSelect | null = null;
    if (o.offerteId) {
      const [rij] = await db.select().from(offertesTable).where(eq(offertesTable.id, o.offerteId));
      offerte = rij ?? null;
    }
    if (grond === "ondertekening") {
      if (!offerte || offerte.status !== "ondertekend") {
        res.status(422).json({ error: "Grond 'ondertekening' vereist een gekoppelde offerte met status 'ondertekend'." });
        return;
      }
    }
    if (grond === "opdrachtbevestiging") {
      const docId = body.document_id ? Number(body.document_id) : null;
      if (!docId) {
        res.status(422).json({ error: "Grond 'opdrachtbevestiging' vereist het document van de opdrachtgever (document_id)." });
        return;
      }
      // Reviewpunt: het bewijs voor grond B moet écht een opdrachtbevestiging
      // zijn — niet een willekeurig bestaand document. Eisen: geregistreerd als
      // documenttype 'opdrachtbevestiging', mét bestand, niet gearchiveerd.
      const [doc] = await db
        .select({
          id: documentenTable.id,
          documenttype: documentenTable.documenttype,
          pdfUrl: documentenTable.pdfUrl,
          gearchiveerd: documentenTable.gearchiveerd,
        })
        .from(documentenTable)
        .where(eq(documentenTable.id, docId));
      if (!doc) { res.status(422).json({ error: "Het opgegeven document bestaat niet." }); return; }
      if (doc.gearchiveerd) { res.status(422).json({ error: "Het opgegeven document is gearchiveerd en kan niet als akkoordbewijs dienen." }); return; }
      if (!doc.pdfUrl) { res.status(422).json({ error: "Het opgegeven document heeft geen bestand; een opdrachtbevestiging zonder document is geen bewijs." }); return; }
      if (doc.documenttype !== "opdrachtbevestiging") {
        res.status(422).json({ error: "Het opgegeven document is niet geregistreerd als opdrachtbevestiging. Registreer of hercategoriseer het document eerst als 'opdrachtbevestiging'." });
        return;
      }
    }
    if (grond === "vrijgave_pl" && !(body.herkomst ?? "").trim()) {
      res.status(422).json({ error: "Grond 'vrijgave projectleider' vereist een herkomsttekst: waar komt het akkoord vandaan (mail, telefonisch, mondeling), van wie en wanneer." });
      return;
    }

    // §6: boven de beleidsband (≥ €10.000, incl. btw — zelfde maatstaf als de
    // offerte-haak) is een goedgekeurde formele aanvraag vereist.
    const bedrag = offerte?.bedragInclBtw ?? null;
    const { vereist } = await checkVereistGoedkeuring(db, "opdracht_akkoord", bedrag, null);
    if (vereist) {
      const goedgekeurd = await haalGoedgekeurdeAanvraag(db, "opdracht_akkoord", id);
      if (!goedgekeurd) {
        res.status(422).json({
          code: "GOEDKEURING_VEREIST",
          error: "Voor het vastleggen van dit akkoord is op basis van het goedkeuringsbeleid eerst een formele goedkeuringsaanvraag vereist. Dien de aanvraag in via het goedkeuringsproces.",
        });
        return;
      }
    }

    const c = body.condities ?? {};
    const [bijgewerkt] = await db.update(opdrachtenTable)
      .set({
        akkoordGrond: grond,
        akkoordDoorId: req.session.userId!,
        akkoordOp: new Date(),
        akkoordDocumentId: grond === "opdrachtbevestiging" ? Number(body.document_id) : null,
        akkoordHerkomst: grond === "vrijgave_pl" ? String(body.herkomst).trim() : null,
        // Condities: grond A standaard uit de offerte, altijd overschrijfbaar via body.
        conditieBetaaltermijnDagen: c.betaaltermijn_dagen ?? offerte?.betalingstermijnDagen ?? null,
        conditieGarantietermijn: c.garantietermijn ?? null,
        conditieMeerwerk: c.meerwerk ?? null,
        conditieOplevering: c.oplevering ?? null,
        conditieBoeteKorting: c.boete_korting ?? null,
        conditieVoorwaardenSetId: c.voorwaarden_set_id ?? offerte?.voorwaardenSetId ?? null,
        conditieVoorwaardenTekst: c.voorwaarden_tekst ?? null,
        bijgewerktOp: new Date(),
      })
      // Race-guard: alleen vastleggen zolang er nog géén akkoord staat.
      .where(and(eq(opdrachtenTable.id, id), isNull(opdrachtenTable.akkoordGrond)))
      .returning();
    if (!bijgewerkt) {
      res.status(409).json({ error: "Er is intussen al een akkoord vastgelegd op deze opdracht." });
      return;
    }

    await logActiviteit({
      type: "opdracht_akkoord",
      omschrijving: `Akkoord vastgelegd op opdracht '${o.titel}' (grond: ${grond}).`,
      gebouwId: o.gebouwId ?? null,
      gebruikerId: req.session.userId!,
      offerteId: o.offerteId ?? null,
    });
    res.status(201).json(mapAkkoord(bijgewerkt));
  } catch (err) {
    logger.error({ err }, "akkoord vastleggen fout");
    res.status(500).json({ error: "Serverfout bij vastleggen akkoord" });
  }
});

// POST /opdrachten/:id/akkoord/ai-voorstel — AI leest een opdrachtbevestiging
// en stelt de akkoord-/conditievelden voor mét vindplaats; de mens bevestigt
// (AKKOORD_01 §5, zelfde model als de factuurstroom). Slaat NIETS op.
router.post("/opdrachten/:id/akkoord/ai-voorstel", schrijven, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }
  const docId = Number((req.body as { document_id?: number })?.document_id);
  if (!docId || isNaN(docId)) { res.status(400).json({ error: "document_id is verplicht" }); return; }

  try {
    const [o] = await db.select({ id: opdrachtenTable.id }).from(opdrachtenTable).where(eq(opdrachtenTable.id, id));
    if (!o) { res.status(404).json({ error: "Opdracht niet gevonden" }); return; }
    const [doc] = await db.select().from(documentenTable).where(eq(documentenTable.id, docId));
    if (!doc || !doc.pdfUrl) { res.status(404).json({ error: "Document niet gevonden of zonder bestand" }); return; }
    if (doc.gearchiveerd) { res.status(422).json({ error: "Het opgegeven document is gearchiveerd." }); return; }

    const file = await objectStorage.getObjectEntityFile(doc.pdfUrl);
    const stream = file.createReadStream();
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: unknown) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as ArrayBufferLike)));
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", (err: Error) => reject(err));
    });

    const analyse = await analyseerOpdrachtbevestiging({
      buffer,
      bestandsnaam: doc.naam,
      mime: "application/pdf",
    });
    if (!analyse.ok) {
      res.status(502).json({ error: `Analyse mislukt: ${analyse.fout}` });
      return;
    }
    res.json({
      is_opdrachtbevestiging: analyse.is_opdrachtbevestiging,
      voorstel: analyse.velden,
    });
  } catch (err) {
    logger.error({ err }, "akkoord ai-voorstel fout");
    res.status(500).json({ error: "Serverfout bij analyseren opdrachtbevestiging" });
  }
});

// DELETE /opdrachten/:id/akkoord — intrekken; alleen hoofdbeheerder, met reden (auditspoor).
router.delete("/opdrachten/:id/akkoord", requireBevoegdheid("projecten", 1), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }
  if (!req.permissies?.isHoofdbeheerder) {
    res.status(403).json({ error: "Alleen de hoofdbeheerder kan een vastgelegd akkoord intrekken." });
    return;
  }
  const reden = String((req.body as { reden?: string })?.reden ?? "").trim();
  if (!reden) { res.status(400).json({ error: "Een reden is verplicht bij het intrekken van een akkoord." }); return; }

  try {
    const [o] = await db.select().from(opdrachtenTable).where(eq(opdrachtenTable.id, id));
    if (!o) { res.status(404).json({ error: "Opdracht niet gevonden" }); return; }
    if (!o.akkoordGrond) { res.status(409).json({ error: "Deze opdracht heeft geen vastgelegd akkoord." }); return; }

    const [bijgewerkt] = await db.update(opdrachtenTable)
      .set({
        akkoordGrond: null, akkoordDoorId: null, akkoordOp: null,
        akkoordDocumentId: null, akkoordHerkomst: null,
        bijgewerktOp: new Date(),
      })
      .where(eq(opdrachtenTable.id, id))
      .returning();

    await logActiviteit({
      type: "opdracht_akkoord_ingetrokken",
      omschrijving: `Akkoord (grond: ${o.akkoordGrond}) op opdracht '${o.titel}' ingetrokken door hoofdbeheerder. Reden: ${reden}`,
      gebouwId: o.gebouwId ?? null,
      gebruikerId: req.session.userId!,
      offerteId: o.offerteId ?? null,
    });
    res.json(mapAkkoord(bijgewerkt!));
  } catch (err) {
    logger.error({ err }, "akkoord intrekken fout");
    res.status(500).json({ error: "Serverfout bij intrekken akkoord" });
  }
});

// PATCH /opdrachten/:id/condities — condities bijwerken (schrijfrecht projecten:3).
router.patch("/opdrachten/:id/condities", schrijven, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }
  const b = req.body as Record<string, unknown>;
  try {
    const [bijgewerkt] = await db.update(opdrachtenTable)
      .set({
        ...(b["betaaltermijn_dagen"] !== undefined ? { conditieBetaaltermijnDagen: b["betaaltermijn_dagen"] == null ? null : Number(b["betaaltermijn_dagen"]) } : {}),
        ...(b["garantietermijn"] !== undefined ? { conditieGarantietermijn: (b["garantietermijn"] as string | null) } : {}),
        ...(b["meerwerk"] !== undefined ? { conditieMeerwerk: (b["meerwerk"] as string | null) } : {}),
        ...(b["oplevering"] !== undefined ? { conditieOplevering: (b["oplevering"] as string | null) } : {}),
        ...(b["boete_korting"] !== undefined ? { conditieBoeteKorting: (b["boete_korting"] as string | null) } : {}),
        ...(b["voorwaarden_set_id"] !== undefined ? { conditieVoorwaardenSetId: b["voorwaarden_set_id"] == null ? null : Number(b["voorwaarden_set_id"]) } : {}),
        ...(b["voorwaarden_tekst"] !== undefined ? { conditieVoorwaardenTekst: (b["voorwaarden_tekst"] as string | null) } : {}),
        bijgewerktOp: new Date(),
      })
      .where(eq(opdrachtenTable.id, id))
      .returning();
    if (!bijgewerkt) { res.status(404).json({ error: "Opdracht niet gevonden" }); return; }
    res.json(mapAkkoord(bijgewerkt));
  } catch (err) {
    logger.error({ err }, "condities bijwerken fout");
    res.status(500).json({ error: "Serverfout bij bijwerken condities" });
  }
});

// ── GET /opdrachten ───────────────────────────────────────────────────────

router.get("/opdrachten", lezen, async (req, res): Promise<void> => {
  try {
    const gebouwFilter = req.query.gebouw_id ? parseInt(String(req.query.gebouw_id), 10) : null;
    const offerteFilter = req.query.offerte_id ? parseInt(String(req.query.offerte_id), 10) : null;
    const statusFilter = typeof req.query.status === "string" ? req.query.status : null;
    const mijnFilter = req.query.mijn === "true";

    // mijn=true: filter op opdrachten waarvoor de huidige gebruiker planning-items heeft.
    // Beheerders (isHoofdbeheerder of offertes>=2) zien altijd alle opdrachten.
    let mijnOpdrachtIds: number[] | null = null;
    const isBeheer = req.permissies!.isHoofdbeheerder || req.permissies!.heeftModuleRecht("magazijn", 4) || req.permissies!.heeftModuleRecht("offertes", 2);
    if (mijnFilter && !isBeheer) {
      const userId = req.session.userId!;
      const planningRijen = await db
        .selectDistinct({ opdrachtId: planningItemsTable.opdrachtId })
        .from(planningItemsTable)
        .innerJoin(medewerkersTable, eq(planningItemsTable.medewerkerId, medewerkersTable.id))
        .where(and(
          eq(medewerkersTable.gebruikerId, userId),
          isNotNull(planningItemsTable.opdrachtId),
        ));
      mijnOpdrachtIds = planningRijen
        .map(r => r.opdrachtId)
        .filter((id): id is number => id !== null);
    }

    const rows = await db.select({
      o: opdrachtenTable,
      b: {
        id: projectBegrotingenTable.id,
        status: projectBegrotingenTable.status,
        totaalArbeidUren: projectBegrotingenTable.totaalArbeidUren,
      },
      g: {
        naam: gebouwenTable.naam,
        adres: gebouwenTable.adres,
        postcode: gebouwenTable.postcode,
        stad: gebouwenTable.stad,
      },
      p: {
        id: pimModellenTable.id,
      },
    })
      .from(opdrachtenTable)
      .leftJoin(projectBegrotingenTable, eq(projectBegrotingenTable.opdrachtId, opdrachtenTable.id))
      .leftJoin(gebouwenTable, eq(gebouwenTable.id, opdrachtenTable.gebouwId))
      .leftJoin(pimModellenTable, eq(pimModellenTable.opdrachtId, opdrachtenTable.id))
      .where(
        and(
          gebouwFilter ? eq(opdrachtenTable.gebouwId, gebouwFilter) : undefined,
          offerteFilter ? eq(opdrachtenTable.offerteId, offerteFilter) : undefined,
          statusFilter ? eq(opdrachtenTable.status, statusFilter) : undefined,
          mijnOpdrachtIds !== null
            ? (mijnOpdrachtIds.length > 0 ? inArray(opdrachtenTable.id, mijnOpdrachtIds) : sql`false`)
            : undefined,
        )
      )
      .orderBy(asc(opdrachtenTable.aangemaaktOp));

    const result = await Promise.all(rows.map(async (r) => {
      let stapActief: number | null = null;
      if (r.o.aiFase === "uitvoering" && r.p?.id) {
        const stappen = await db
          .select({ volgorde: pimUitvoeringStappenTable.volgorde, status: pimUitvoeringStappenTable.status })
          .from(pimUitvoeringStappenTable)
          .where(eq(pimUitvoeringStappenTable.pimId, r.p.id));
        
        const voltooid = stappen.filter(s => s.status === "voltooid").length;
        const heeftActief = stappen.some(s => s.status === "actief" || s.status === "afgeweken");
        stapActief = voltooid + (heeftActief ? 1 : 0);
      }
      return mapOpdracht(r.o, r.b?.id ?? null, r.b?.status ?? null, r.b?.totaalArbeidUren ?? null, r.g, stapActief);
    }));

    res.json(result);
  } catch (err) {
    logger.error({ err }, "listOpdrachten fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── GET /opdrachten/:id ───────────────────────────────────────────────────

router.get("/opdrachten/:id", lezen, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  try {
    const [row] = await db.select({
      o: opdrachtenTable,
      b: {
        id: projectBegrotingenTable.id,
        status: projectBegrotingenTable.status,
        totaalArbeidUren: projectBegrotingenTable.totaalArbeidUren,
      },
      g: {
        naam: gebouwenTable.naam,
        adres: gebouwenTable.adres,
        postcode: gebouwenTable.postcode,
        stad: gebouwenTable.stad,
      },
    })
      .from(opdrachtenTable)
      .leftJoin(projectBegrotingenTable, eq(projectBegrotingenTable.opdrachtId, opdrachtenTable.id))
      .leftJoin(gebouwenTable, eq(gebouwenTable.id, opdrachtenTable.gebouwId))
      .where(eq(opdrachtenTable.id, id));

    if (!row) { res.status(404).json({ error: "Opdracht niet gevonden" }); return; }
    res.json(mapOpdracht(row.o, row.b?.id ?? null, row.b?.status ?? null, row.b?.totaalArbeidUren ?? null, row.g));
  } catch (err) {
    logger.error({ err }, "getOpdracht fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── PATCH /opdrachten/:id ─────────────────────────────────────────────────

router.patch("/opdrachten/:id", schrijven, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  try {
    const { status, omschrijving, werknummer, mandagstaat_vereist } = req.body as {
      status?: string; omschrijving?: string; werknummer?: string; mandagstaat_vereist?: boolean;
    };

    // Status via de WorkflowEngine
    if (status !== undefined) {
      const ctx = await maakTransitieContext(req, db);
      const result = await workflowService.transiteer("opdracht", id, status, ctx);
      if (!result.ok) { res.status(result.error!.httpStatus).json({ error: result.error!.bericht }); return; }

      // Na sluiting/oplevering: nacalculatie automatisch berekenen (niet-blokkerend)
      if (status === "afgerond" || status === "opgeleverd" || status === "gesloten") {
        void berekenEnSlaOpNacalculatie(id).catch((err: unknown) => {
          logger.warn({ err, opdrachtId: id }, "fie: automatische nacalculatie na statuswijziging mislukt");
        });
      }
    }

    // Overige veldwijzigingen
    const update: Partial<typeof opdrachtenTable.$inferInsert> = { bijgewerktOp: new Date() };
    if (omschrijving !== undefined) update.omschrijving = omschrijving;
    if (werknummer !== undefined) update.werknummer = werknummer;
    // §6c.2: alleen beheer-schrijfrecht (deze route eist al 'projecten':3).
    if (mandagstaat_vereist !== undefined) update.mandagstaatVereist = mandagstaat_vereist === true;

    const [updated] = await db.update(opdrachtenTable).set(update).where(eq(opdrachtenTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Opdracht niet gevonden" }); return; }

    const [begroting] = await db.select({
      id: projectBegrotingenTable.id,
      status: projectBegrotingenTable.status,
      totaalArbeidUren: projectBegrotingenTable.totaalArbeidUren,
    }).from(projectBegrotingenTable).where(eq(projectBegrotingenTable.opdrachtId, id));

    const [gebouw] = updated.gebouwId
      ? await db.select({ naam: gebouwenTable.naam, adres: gebouwenTable.adres, postcode: gebouwenTable.postcode, stad: gebouwenTable.stad })
          .from(gebouwenTable).where(eq(gebouwenTable.id, updated.gebouwId))
      : [null];

    res.json(mapOpdracht(updated, begroting?.id ?? null, begroting?.status ?? null, begroting?.totaalArbeidUren ?? null, gebouw ?? null));
  } catch (err) {
    logger.error({ err }, "updateOpdracht fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── GET /opdrachten/:id/werkbegroting ─────────────────────────────────────

router.get("/opdrachten/:id/werkbegroting", lezen, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  try {
    const [begroting] = await db.select().from(projectBegrotingenTable)
      .where(eq(projectBegrotingenTable.opdrachtId, id));
    if (!begroting) { res.status(404).json({ error: "Werkbegroting niet gevonden" }); return; }

    const regels = await db.select().from(werkbegrotingRegelsTable)
      .where(eq(werkbegrotingRegelsTable.begrotingId, begroting.id))
      .orderBy(asc(werkbegrotingRegelsTable.id));

    res.json(mapBegroting(begroting, regels, magBedragenZien(req)));
  } catch (err) {
    logger.error({ err }, "getWerkbegroting fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── POST /opdrachten/:id/werkbegroting/vaststellen ────────────────────────

router.post("/opdrachten/:id/werkbegroting/vaststellen", schrijven, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  try {
    const [begroting] = await db.select().from(projectBegrotingenTable)
      .where(eq(projectBegrotingenTable.opdrachtId, id));
    if (!begroting) { res.status(404).json({ error: "Werkbegroting niet gevonden" }); return; }
    if (begroting.status === "vastgesteld") {
      res.status(409).json({ error: "Werkbegroting is al vastgesteld" }); return;
    }

    const [updated] = await db.update(projectBegrotingenTable)
      .set({
        status: "vastgesteld",
        vastgesteldDoorId: req.session.userId!,
        vastgesteldOp: new Date(),
        bijgewerktOp: new Date(),
      })
      .where(eq(projectBegrotingenTable.id, begroting.id))
      .returning();

    const regels = await db.select().from(werkbegrotingRegelsTable)
      .where(eq(werkbegrotingRegelsTable.begrotingId, begroting.id))
      .orderBy(asc(werkbegrotingRegelsTable.id));

    res.json(mapBegroting(updated, regels));
  } catch (err) {
    logger.error({ err }, "vaststellenWerkbegroting fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── Helper: AI-werkbegrotinganalyse uitvoeren ──────────────────────────────
// Voert de AI-analyse van de werkbegroting uit en schrijft het resultaat weg.
// Herbruikt door het ai-analyse-endpoint (handmatig) én door maak-opdracht
// (automatisch op de achtergrond). Gooit niet: bij ontbrekende gateway of
// mislukte AI wordt een fallback-analyse opgeslagen. De mens blijft in control.
async function genereerWerkbegrotingAiAnalyse(opdrachtId: number): Promise<Record<string, unknown> | null> {
  const [begroting] = await db.select().from(projectBegrotingenTable)
    .where(eq(projectBegrotingenTable.opdrachtId, opdrachtId));
  if (!begroting) return null;

  const regels = await db.select().from(werkbegrotingRegelsTable)
    .where(eq(werkbegrotingRegelsTable.begrotingId, begroting.id))
    .orderBy(asc(werkbegrotingRegelsTable.id));

  const arbeidRegels = regels.filter(r => r.categorie === "arbeid");
  const materiaalRegels = regels.filter(r => r.categorie === "materiaal");

  let analyse: Record<string, unknown> = { handmatig: true, gegenereerd_op: new Date().toISOString() };

  if (heeftGateway()) {
    const prompt = `Je bent een kritische werkvoorbereider in de brandpreventiesector. Analyseer de onderstaande werkbegroting en geef concrete voorstellen om winst te maximaliseren via inkoop en arbeid.

ARBEID (${arbeidRegels.length} regels):
${arbeidRegels.map(r => `- ${r.omschrijving}: ${r.hoeveelheid} ${r.eenheid} @ €${r.tarief}/uur = €${r.totaal}`).join('\n')}

MATERIAAL (${materiaalRegels.length} regels):
${materiaalRegels.map(r => `- ${r.omschrijving}: ${r.hoeveelheid} ${r.eenheid} @ €${r.tarief} = €${r.totaal}`).join('\n')}

Totaal arbeid: ${begroting.totaalArbeidUren} uur
Totaal materiaal: €${begroting.totaalMateriaalBedrag}

Geef je analyse als JSON met deze structuur:
{
  "samenvatting": "kort overzicht",
  "inkoop_voorstellen": [{"post": "naam", "huidig": 0, "voorstel": "tekst", "besparing": 0}],
  "arbeid_voorstellen": [{"post": "naam", "huidig_uur": 0, "voorstel": "tekst", "besparing_uur": 0}],
  "totaal_besparing_indicatie": 0,
  "risicos": ["risico 1"]
}`;

    const begrotingAnalyseResultaat = await aiGateway.chat("default", {
      response_format: { type: "json_object" },
      max_tokens: 1500,
      messages: [
        { role: "system", content: BEGROTING_ANALYSE_PROMPT.tekst },
        { role: "user", content: prompt },
      ],
    }, undefined, {
      module: "opdrachten",
      functie: "werkbegroting-ai-analyse",
      entiteitstype: "opdracht",
      entiteitId: opdrachtId,
      promptNaam: BEGROTING_ANALYSE_PROMPT.naam,
      promptVersie: BEGROTING_ANALYSE_PROMPT.versie,
    });

    if (begrotingAnalyseResultaat.ok) {
      try {
        analyse = JSON.parse(begrotingAnalyseResultaat.inhoud) as Record<string, unknown>;
        analyse.gegenereerd_op = new Date().toISOString();
        analyse.automatisch = true;
        analyse.voorstel_status = "voorstel";
      } catch {
        logger.warn("AI analyse JSON parsen mislukt — fallback zonder AI");
      }
    } else {
      logger.warn({ fout: begrotingAnalyseResultaat.fout }, "AI analyse mislukt — fallback zonder AI");
    }
  }

  await db.update(projectBegrotingenTable)
    .set({ aiAnalyse: analyse, aiAnalyseOp: new Date(), bijgewerktOp: new Date() })
    .where(eq(projectBegrotingenTable.id, begroting.id));

  return analyse;
}

// ── POST /opdrachten/:id/werkbegroting/ai-analyse ─────────────────────────

router.post("/opdrachten/:id/werkbegroting/ai-analyse", schrijven, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  try {
    const analyse = await genereerWerkbegrotingAiAnalyse(id);
    if (analyse === null) { res.status(404).json({ error: "Werkbegroting niet gevonden" }); return; }

    const [begroting] = await db.select().from(projectBegrotingenTable)
      .where(eq(projectBegrotingenTable.opdrachtId, id));
    const regels = await db.select().from(werkbegrotingRegelsTable)
      .where(eq(werkbegrotingRegelsTable.begrotingId, begroting.id))
      .orderBy(asc(werkbegrotingRegelsTable.id));

    res.json(mapBegroting(begroting, regels));
  } catch (err) {
    logger.error({ err }, "aiAnalyseWerkbegroting fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── POST /opdrachten/:id/werkbegroting/ai-analyse/beoordeling ─────────────

router.post("/opdrachten/:id/werkbegroting/ai-analyse/beoordeling", schrijven, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  const { beslissing } = req.body as { beslissing?: string };
  if (beslissing !== "geaccepteerd" && beslissing !== "genegeerd") {
    res.status(400).json({ error: "Ongeldige beslissing (geaccepteerd of genegeerd)" });
    return;
  }

  try {
    const [begroting] = await db.select().from(projectBegrotingenTable)
      .where(eq(projectBegrotingenTable.opdrachtId, id));
    if (!begroting) { res.status(404).json({ error: "Werkbegroting niet gevonden" }); return; }

    const analyse = begroting.aiAnalyse as Record<string, unknown> | null;
    if (!analyse) { res.status(404).json({ error: "Geen AI-voorstel aanwezig" }); return; }

    const bijgewerkt: Record<string, unknown> = {
      ...analyse,
      voorstel_status: beslissing,
      beoordeeld_op: new Date().toISOString(),
    };

    await db.update(projectBegrotingenTable)
      .set({ aiAnalyse: bijgewerkt, bijgewerktOp: new Date() })
      .where(eq(projectBegrotingenTable.id, begroting.id));

    const [vers] = await db.select().from(projectBegrotingenTable)
      .where(eq(projectBegrotingenTable.id, begroting.id));
    const regels = await db.select().from(werkbegrotingRegelsTable)
      .where(eq(werkbegrotingRegelsTable.begrotingId, begroting.id))
      .orderBy(asc(werkbegrotingRegelsTable.id));

    res.json(mapBegroting(vers, regels));
  } catch (err) {
    logger.error({ err }, "beoordeelWerkbegrotingAiVoorstel fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── GET /opdrachten/:id/nacalculatie ─────────────────────────────────────

router.get("/opdrachten/:id/nacalculatie", metBedragen, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  try {
    const [opdracht] = await db.select().from(opdrachtenTable).where(eq(opdrachtenTable.id, id));
    if (!opdracht) { res.status(404).json({ error: "Opdracht niet gevonden" }); return; }

    const [begroting] = await db.select().from(projectBegrotingenTable)
      .where(eq(projectBegrotingenTable.opdrachtId, id));

    const regels = begroting
      ? await db.select().from(werkbegrotingRegelsTable)
          .where(eq(werkbegrotingRegelsTable.begrotingId, begroting.id))
      : [];

    // Calculatie arbeid uren
    let calcArbeidUren = 0;
    if (opdracht.calculatieId) {
      const calcRegels = await db.select().from(modCalcRegelsTable)
        .where(and(
          eq(modCalcRegelsTable.calculatieId, opdracht.calculatieId),
          eq(modCalcRegelsTable.categorie, "arbeid"),
        ));
      calcArbeidUren = calcRegels.reduce((acc, r) => {
        return acc + (r.muPerEenheid > 0 ? r.hoeveelheid * r.muPerEenheid : r.hoeveelheid);
      }, 0);
    }

    // Geplande uren uit planning_items
    const planningItems = await db.select({ uren: planningItemsTable.uren })
      .from(planningItemsTable)
      .where(eq(planningItemsTable.opdrachtId, id));
    const planningUren = planningItems.reduce((acc, p) => acc + p.uren, 0);

    // Verbruikte uren uit uren_registraties
    const urenRegels = await db.select({ nettoUren: urenRegistratiesTable.nettoUren })
      .from(urenRegistratiesTable)
      .where(eq(urenRegistratiesTable.opdrachtId, id));
    const verbruikteUren = urenRegels.reduce((acc, u) => acc + u.nettoUren, 0);

    const begrotingUren = begroting?.totaalArbeidUren ?? 0;

    // ── Werkelijke materiaalkosten: magazijn-uitgiftes ────────────────────
    const uitgifteMutaties = await db.select({
      hoeveelheid: voorraadMutatiesTable.hoeveelheid,
      delta: voorraadMutatiesTable.delta,
      type: voorraadMutatiesTable.type,
      inkoopprijs: artikelenTable.inkoopprijs,
    })
      .from(voorraadMutatiesTable)
      .leftJoin(artikelenTable, eq(voorraadMutatiesTable.artikelId, artikelenTable.id))
      .where(
        and(
          eq(voorraadMutatiesTable.referentieType, "opdracht"),
          eq(voorraadMutatiesTable.referentieId, id),
          or(
            eq(voorraadMutatiesTable.type, "uitgifte"),
            eq(voorraadMutatiesTable.type, "retour"),
          ),
        ),
      );

    // Netto uitgifte-kosten: uitgifte telt positief, retour telt negatief
    let uitgifte_kosten = 0;
    for (const m of uitgifteMutaties) {
      const prijs = m.inkoopprijs ?? 0;
      const hoeveelheid = Math.abs(m.hoeveelheid ?? 0);
      if (m.type === "uitgifte") {
        uitgifte_kosten += prijs * hoeveelheid;
      } else if (m.type === "retour") {
        uitgifte_kosten -= prijs * hoeveelheid;
      }
    }
    uitgifte_kosten = Math.max(0, Math.round(uitgifte_kosten * 100) / 100);

    // ── Werkelijke materiaalkosten: goedgekeurde inkoopregels ─────────────
    // Alle inkoopplannen voor deze opdracht; regels met status "besteld" of "geleverd"
    let inkoop_kosten = 0;
    const inkoopplannen = await db.select({ id: inkoopplannenTable.id })
      .from(inkoopplannenTable)
      .where(eq(inkoopplannenTable.opdrachtId, id));

    if (inkoopplannen.length > 0) {
      const planIds = inkoopplannen.map(p => p.id);
      const goedgekeurdeRegels = await db.select({
        hoeveelheid: inkoopplanRegelsTable.hoeveelheid,
        inkoopprijs: inkoopplanRegelsTable.inkoopprijs,
        inkoopprijsVerwacht: inkoopplanRegelsTable.inkoopprijsVerwacht,
        calcPrijs: inkoopplanRegelsTable.calcPrijs,
        status: inkoopplanRegelsTable.status,
      })
        .from(inkoopplanRegelsTable)
        .where(
          and(
            inArray(inkoopplanRegelsTable.inkoopplanId, planIds),
            or(
              eq(inkoopplanRegelsTable.status, "besteld"),
              eq(inkoopplanRegelsTable.status, "geleverd"),
            ),
          ),
        );

      for (const r of goedgekeurdeRegels) {
        // Gebruik definitieve inkoopprijs; valt terug op verwachte prijs of calcPrijs
        const prijs = r.inkoopprijs ?? r.inkoopprijsVerwacht ?? r.calcPrijs ?? 0;
        inkoop_kosten += (r.hoeveelheid ?? 0) * prijs;
      }
      inkoop_kosten = Math.round(inkoop_kosten * 100) / 100;
    }

    const werkelijke_materiaal_bedrag = Math.round((uitgifte_kosten + inkoop_kosten) * 100) / 100;
    const begroting_materiaal_bedrag = begroting?.totaalMateriaalBedrag ?? 0;
    const verschil_materiaal = Math.round((begroting_materiaal_bedrag - werkelijke_materiaal_bedrag) * 100) / 100;

    // ── Per-categorie regels (arbeidsoverzicht) ───────────────────────────
    const categorieRegels = regels.reduce<Record<string, { begroting_uren: number; totaal: number }>>((acc, r) => {
      if (!acc[r.categorie]) acc[r.categorie] = { begroting_uren: 0, totaal: 0 };
      acc[r.categorie].begroting_uren += r.categorie === "arbeid" ? r.hoeveelheid : 0;
      acc[r.categorie].totaal += r.totaal;
      return acc;
    }, {});

    const nacalculatieRegels = Object.entries(categorieRegels).map(([categorie, data]) => ({
      categorie,
      omschrijving: categorie,
      calculatie_uren: categorie === "arbeid" ? calcArbeidUren : 0,
      begroting_uren: data.begroting_uren,
      verbruikte_uren: categorie === "arbeid" ? verbruikteUren : 0,
      verschil_begroting_vs_verbruikt: data.begroting_uren - (categorie === "arbeid" ? verbruikteUren : 0),
    }));

    // Werktype afgeleid via berekenEnSlaOpNacalculatie (dominant spottype gebouw)
    const [fieRij] = await db.select({
      werktype: fieNacalculatiesTable.werktype,
      werktypeBron: fieNacalculatiesTable.werktypeBron,
    })
      .from(fieNacalculatiesTable)
      .where(eq(fieNacalculatiesTable.opdrachtId, id))
      .limit(1);

    res.json({
      opdracht_id: id,
      werktype: fieRij?.werktype ?? null,
      werktype_bron: fieRij?.werktypeBron ?? null,
      calculatie_arbeid_uren: calcArbeidUren,
      begroting_arbeid_uren: begrotingUren,
      planning_uren: planningUren,
      verbruikte_uren: verbruikteUren,
      verschil: begrotingUren - verbruikteUren,
      regels: nacalculatieRegels,
      begroting_materiaal_bedrag,
      werkelijke_materiaal_bedrag,
      verschil_materiaal,
      materiaal_uitgifte_kosten: uitgifte_kosten,
      materiaal_inkoop_kosten: inkoop_kosten,
    });
  } catch (err) {
    logger.error({ err }, "getNacalculatie fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── GET /opdrachten/:id/planning-uren ─────────────────────────────────────

router.get("/opdrachten/:id/planning-uren", lezen, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  try {
    const items = await db.select({
      planning_item_id: planningItemsTable.id,
      medewerker_id: medewerkersTable.id,
      medewerker_naam: medewerkersTable.naam,
      datum: planningItemsTable.datumStart,
      uren: planningItemsTable.uren,
      status: planningItemsTable.status,
    })
      .from(planningItemsTable)
      .leftJoin(medewerkersTable, eq(planningItemsTable.medewerkerId, medewerkersTable.id))
      .where(eq(planningItemsTable.opdrachtId, id))
      .orderBy(asc(planningItemsTable.datumStart));

    res.json(items.map(i => ({
      planning_item_id: i.planning_item_id,
      medewerker_id: i.medewerker_id ?? null,
      medewerker_naam: i.medewerker_naam ?? "Onbekend",
      datum: i.datum,
      uren: i.uren,
      status: i.status,
    })));
  } catch (err) {
    logger.error({ err }, "listOpdrachtPlanningUren fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── Materiaallijst per opdracht ─────────────────────────────────────────────
router.get("/opdrachten/:id/materiaal", metBedragen, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  try {
    const [opdracht] = await db.select({ id: opdrachtenTable.id })
      .from(opdrachtenTable).where(eq(opdrachtenTable.id, id)).limit(1);
    if (!opdracht) { res.status(404).json({ error: "Opdracht niet gevonden" }); return; }

    const iso = (d: Date | null | undefined) => d?.toISOString() ?? new Date().toISOString();

    // Reserveringen gekoppeld aan deze opdracht (alleen open/gedeeltelijk)
    const reserveringRijen = await db.select({
      reservering: reserveringenTable,
      artikel_naam: artikelenTable.naam,
      artikel_code: artikelenTable.code,
      eenheid: artikelenTable.eenheid,
      inkoopprijs: artikelenTable.inkoopprijs,
    })
      .from(reserveringenTable)
      .leftJoin(artikelenTable, eq(reserveringenTable.artikelId, artikelenTable.id))
      .where(eq(reserveringenTable.opdrachtId, id))
      .orderBy(desc(reserveringenTable.gereserveerdOp));

    // Uitgiftes-mutaties voor deze opdracht (referentieType = "opdracht")
    const uitgifte_mutaties = await db.select({
      mutatie: voorraadMutatiesTable,
      artikel_naam: artikelenTable.naam,
      artikel_code: artikelenTable.code,
      eenheid: artikelenTable.eenheid,
      inkoopprijs: artikelenTable.inkoopprijs,
    })
      .from(voorraadMutatiesTable)
      .leftJoin(artikelenTable, eq(voorraadMutatiesTable.artikelId, artikelenTable.id))
      .where(
        and(
          eq(voorraadMutatiesTable.referentieType, "opdracht"),
          eq(voorraadMutatiesTable.referentieId, id),
          or(
            eq(voorraadMutatiesTable.type, "uitgifte"),
            eq(voorraadMutatiesTable.type, "retour"),
          ),
        ),
      )
      .orderBy(desc(voorraadMutatiesTable.aangemaaktOp));

    // Vrije voorraad ophalen
    const voorraadTotaal = await db.select({
      artikelId: voorraadTable.artikelId,
      vrij: sql<number>`SUM(GREATEST(0, ${voorraadTable.hoeveelheid} - ${voorraadTable.gereserveerd}))`,
    })
      .from(voorraadTable)
      .groupBy(voorraadTable.artikelId);

    const voorraadMap = new Map(voorraadTotaal.map(v => [v.artikelId, v.vrij]));

    const reserveringen = reserveringRijen.map(r => {
      const prijs = r.inkoopprijs ?? null;
      const totaal = prijs != null ? Math.round(prijs * r.reservering.hoeveelheid * 100) / 100 : null;
      return {
        id: r.reservering.id,
        artikel_id: r.reservering.artikelId,
        artikel_naam: r.artikel_naam ?? null,
        artikel_code: r.artikel_code ?? null,
        eenheid: r.eenheid ?? "st",
        hoeveelheid: r.reservering.hoeveelheid,
        inkoopprijs: prijs,
        totaal_kosten: totaal,
        type: "reservering",
        status: r.reservering.status,
        omschrijving: r.reservering.omschrijving ?? null,
        datum: iso(r.reservering.gereserveerdOp),
        reservering_id: r.reservering.id,
        vrij_voorraad: voorraadMap.get(r.reservering.artikelId) ?? 0,
      };
    });

    const uitgiftes = uitgifte_mutaties.map(m => {
      const prijs = m.inkoopprijs ?? null;
      const hoeveelheid = Math.abs(m.mutatie.hoeveelheid ?? 0);
      const totaal = prijs != null ? Math.round(prijs * hoeveelheid * 100) / 100 : null;
      return {
        id: m.mutatie.id,
        artikel_id: m.mutatie.artikelId,
        artikel_naam: m.artikel_naam ?? null,
        artikel_code: m.artikel_code ?? null,
        eenheid: m.eenheid ?? "st",
        hoeveelheid,
        inkoopprijs: prijs,
        totaal_kosten: totaal,
        type: m.mutatie.type,
        status: null,
        omschrijving: m.mutatie.omschrijving ?? null,
        datum: iso(m.mutatie.aangemaaktOp),
        reservering_id: null,
        vrij_voorraad: voorraadMap.get(m.mutatie.artikelId) ?? 0,
      };
    });

    // Totaalkosten alleen op openstaande reserveringen (open + gedeeltelijk), niet op gesloten/geannuleerd
    const totaal_kosten_reserveringen = reserveringen
      .filter(r => r.status === "open" || r.status === "gedeeltelijk")
      .reduce((s, r) => s + (r.totaal_kosten ?? 0), 0);
    const totaal_kosten_uitgiftes = uitgiftes.filter(u => u.type === "uitgifte").reduce((s, u) => s + (u.totaal_kosten ?? 0), 0);

    res.json({ reserveringen, uitgiftes, totaal_kosten_reserveringen, totaal_kosten_uitgiftes });
  } catch (err) {
    logger.error({ err }, "getOpdrachtMateriaal fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── POST /opdrachten/:id/werkbegroting/ai-chat ─────────────────────────────
router.post("/opdrachten/:id/werkbegroting/ai-chat", schrijven, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  try {
    const { berichten, afbeelding_base64 } = req.body as {
      berichten: Array<{ rol: "gebruiker" | "assistent"; inhoud: string }>;
      afbeelding_base64?: string | null;
    };

    if (!Array.isArray(berichten) || berichten.length === 0) {
      res.status(400).json({ error: "Berichten ontbreken" }); return;
    }

    const [[opdracht], [begroting]] = await Promise.all([
      db.select().from(opdrachtenTable).where(eq(opdrachtenTable.id, id)).limit(1),
      db.select().from(projectBegrotingenTable).where(eq(projectBegrotingenTable.opdrachtId, id)).limit(1),
    ]);

    if (!begroting) { res.status(404).json({ error: "Werkbegroting niet gevonden" }); return; }

    const regels = await db.select().from(werkbegrotingRegelsTable)
      .where(eq(werkbegrotingRegelsTable.begrotingId, begroting.id))
      .orderBy(asc(werkbegrotingRegelsTable.id));

    let gebouwInfo = "";
    if (opdracht?.gebouwId) {
      const [g] = await db.select().from(gebouwenTable).where(eq(gebouwenTable.id, opdracht.gebouwId)).limit(1);
      if (g) {
        gebouwInfo = `Gebouw: ${g.naam}, ${(g as any).adres ?? ""} ${(g as any).stad ?? ""}.`;
      }
    }

    const arbeidRegels = regels.filter(r => r.categorie === "arbeid");
    const materiaalRegels = regels.filter(r => r.categorie === "materiaal");
    const andereRegels = regels.filter(r => r.categorie !== "arbeid" && r.categorie !== "materiaal");

    const regelenSamenvatting = [
      arbeidRegels.length > 0
        ? `ARBEID (${arbeidRegels.length} regels):\n` +
          arbeidRegels.map(r => `  - ${r.omschrijving}: ${r.hoeveelheid} ${r.eenheid} @ €${r.tarief}/uur = €${r.totaal}`).join("\n")
        : null,
      materiaalRegels.length > 0
        ? `MATERIAAL (${materiaalRegels.length} regels):\n` +
          materiaalRegels.map(r => `  - ${r.omschrijving}: ${r.hoeveelheid} ${r.eenheid} @ €${r.tarief} = €${r.totaal}`).join("\n")
        : null,
      andereRegels.length > 0
        ? `OVERIGE (${andereRegels.length} regels):\n` +
          andereRegels.map(r => `  - [${r.categorie}] ${r.omschrijving}: ${r.hoeveelheid} ${r.eenheid} @ €${r.tarief} = €${r.totaal}`).join("\n")
        : null,
    ].filter(Boolean).join("\n\n") || "(geen regels)";

    const werkbegrotingContext = [
      `OPDRACHT: ${opdracht?.titel ?? "onbekend"}${opdracht?.werknummer ? ` (werknummer: ${opdracht.werknummer})` : ""}`,
      `Status begroting: ${begroting.status ?? "concept"}`,
      `Totaal arbeid: ${begroting.totaalArbeidUren ?? 0} uur`,
      `Totaal materiaal: EUR ${begroting.totaalMateriaalBedrag ?? 0}`,
      gebouwInfo || null,
      `WERKBEGROTINGSREGELS:\n${regelenSamenvatting}`,
    ].filter(Boolean).join("\n");
    const systeemPrompt = werkbegrotingContext + "\n\n" + WERKBEGROTING_CHAT_BASE_PROMPT.tekst;

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

    const opdrachtChatResultaat = await aiGateway.chat("reasoning", {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: messages as any,
      max_completion_tokens: 2000,
    }, undefined, {
      module: "opdrachten",
      functie: "werkbegroting-chat",
      gebruikerId: req.session.userId ?? null,
      entiteitstype: "opdracht",
      entiteitId: id,
      promptNaam: WERKBEGROTING_CHAT_BASE_PROMPT.naam,
      promptVersie: WERKBEGROTING_CHAT_BASE_PROMPT.versie,
    });

    const antwoord = opdrachtChatResultaat.ok ? opdrachtChatResultaat.inhoud : "Geen antwoord ontvangen.";

    const signalen: string[] = [];
    const lw = antwoord.toLowerCase();
    if (lw.includes("ontbreekt") || lw.includes("ontbrekend") || lw.includes("vergeten")) {
      signalen.push("Mogelijke ontbrekende werkzaamheden gesignaleerd");
    }
    if (lw.includes("meerwerk") || lw.includes("risico")) {
      signalen.push("Meerwerkrisico aangewezen");
    }
    if (lw.includes("urennorm") && (lw.includes("laag") || lw.includes("hoog") || lw.includes("afwijkend"))) {
      signalen.push("Urennorm controlepunt aangewezen");
    }

    res.json({ antwoord, signalen });
  } catch (err) {
    logger.error({ err }, "aiChatWerkbegroting fout");
    res.status(500).json({ error: "Serverfout bij AI-chat" });
  }
});

// ── AI Senior Werkvoorbereider ─────────────────────────────────────────────

function mapWbAdvies(r: typeof werkbegrotingAdviezenTable.$inferSelect) {
  return {
    id: r.id,
    begroting_id: r.begrotingId,
    run_id: r.runId,
    type: r.type,
    prioriteit: r.prioriteit,
    titel: r.titel,
    uitleg: r.uitleg,
    status: r.status,
    notitie: r.notitie ?? null,
    aangemaakt_op: r.aangemaaktOp instanceof Date ? r.aangemaaktOp.toISOString() : String(r.aangemaaktOp),
    bijgewerkt_op: r.bijgewerktOp instanceof Date ? r.bijgewerktOp.toISOString() : String(r.bijgewerktOp),
  };
}

router.post("/opdrachten/:id/werkbegroting/senior-adviezen", schrijven, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  try {
    const [begroting] = await db.select().from(projectBegrotingenTable)
      .where(eq(projectBegrotingenTable.opdrachtId, id));
    if (!begroting) { res.status(404).json({ error: "Werkbegroting niet gevonden" }); return; }

    const [opdracht] = await db.select().from(opdrachtenTable).where(eq(opdrachtenTable.id, id));
    const regels = await db.select().from(werkbegrotingRegelsTable)
      .where(eq(werkbegrotingRegelsTable.begrotingId, begroting.id))
      .orderBy(asc(werkbegrotingRegelsTable.id));

    const arbeid   = regels.filter(r => r.categorie === "arbeid");
    const materiaal = regels.filter(r => r.categorie === "materiaal");

    // INKOOP_AI_01 — blokken E/F: vergelijkbaar werk werkelijk besteed
    // (nacalculaties) en normtijden tegenover werkelijk gemeten tijd.
    const eigenCijfersWb = await bouwWerkbegrotingEigenCijfersContext(
      regels.map(r => ({ omschrijving: r.omschrijving, eenheid: r.eenheid })),
    );

    interface WbAdviesVoorstel {
      type: string;
      prioriteit: string;
      titel: string;
      uitleg: string;
    }

    let adviezen: WbAdviesVoorstel[] = [];

    if (heeftGateway()) {
      const prompt = `Je bent een ervaren senior werkvoorbereider in de brandpreventiesector (branddeuren, doorvoeringen, brandkleppen, manchetten, coating). 
Analyseer deze werkbegroting kritisch op uitvoerbaarheid, inkoop, planning en voorbereiding.

OPDRACHT: ${opdracht?.titel ?? "onbekend"}
STATUS WERKBEGROTING: ${begroting.status}

ARBEID (${arbeid.length} regels, totaal ${begroting.totaalArbeidUren ?? 0} uur):
${arbeid.map(r => `- [${r.hoofdstuk}] ${r.omschrijving}: ${r.hoeveelheid} ${r.eenheid} @ €${r.tarief}/uur = €${r.totaal}`).join("\n")}

MATERIAAL (${materiaal.length} regels, totaal €${begroting.totaalMateriaalBedrag ?? 0}):
${materiaal.map(r => `- [${r.hoofdstuk}] ${r.omschrijving}: ${r.hoeveelheid} ${r.eenheid} @ €${r.tarief} = €${r.totaal}`).join("\n")}

${eigenCijfersWb}

Controleer minimaal:
- de begrote uren en materiaalkosten tegenover wat vergelijkbaar werk werkelijk kostte (blokken hierboven — noem de cijfers letterlijk; ontbreekt eigen historie, benoem dat)
- normtijden die structureel afwijken van werkelijk gemeten tijd (die fout werkt door in elke calculatie)
- ontbrekende uitvoeringsposten voor dit type werk
- arbeid die te laag lijkt (bijv. demonteren + afvoeren ontbreekt)
- materiaal zonder leverancier of levertijd
- posten die vóór start uitvoering besteld moeten zijn (lange levertijd)
- glaswerk, branddeuren, speciale producten zonder onderaannemer
- risico's voor planning of magazijn/voorraad
- materiaalregels zonder inkoopkoppeling

Geef je analyse als JSON array:
[
  {
    "type": "waarschuwing|uitvoeringsrisico|inkoopactie_nodig|planningrisico|kostenrisico|ontbrekende_voorbereiding|besparingskans",
    "prioriteit": "hoog|middel|laag",
    "titel": "korte titel (max 60 tekens)",
    "uitleg": "concrete uitleg met verwijzing naar de post (max 200 tekens)"
  }
]
Geef 3–10 adviezen. Geen JSON buiten de array.`;

      const resultaat = await aiGateway.chat("reasoning", {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        messages: [
          { role: "system", content: WERKVOORBEREIDING_ADVIES_PROMPT.tekst },
          { role: "user", content: prompt },
        ] as any,
        max_completion_tokens: 3000,
      }, undefined, {
        module: "opdrachten",
        functie: "werkvoorbereiding-adviezen",
        entiteitstype: "opdracht",
        entiteitId: id,
        promptNaam: WERKVOORBEREIDING_ADVIES_PROMPT.naam,
        promptVersie: WERKVOORBEREIDING_ADVIES_PROMPT.versie,
      });

      if (resultaat.ok) {
        try {
          const tekst = resultaat.inhoud.trim();
          const start = tekst.indexOf("[");
          const eind  = tekst.lastIndexOf("]");
          if (start !== -1 && eind !== -1) {
            adviezen = JSON.parse(tekst.slice(start, eind + 1)) as WbAdviesVoorstel[];
          }
        } catch {
          logger.warn("WbAdvies JSON parsen mislukt — fallback zonder AI");
        }
      } else {
        logger.warn({ fout: resultaat.fout }, "AI senior werkvoorbereider mislukt");
      }
    }

    if (adviezen.length === 0) {
      adviezen = [
        { type: "ontbrekende_voorbereiding", prioriteit: "middel", titel: "AI niet beschikbaar", uitleg: "Analyse kon niet worden uitgevoerd. Controleer handmatig de werkbegroting op volledigheid." },
      ];
    }

    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const GELDIGE_TYPEN = ["waarschuwing", "uitvoeringsrisico", "inkoopactie_nodig", "planningrisico", "kostenrisico", "ontbrekende_voorbereiding", "besparingskans"];
    const GELDIGE_PRIO  = ["hoog", "middel", "laag"];

    const rijen = adviezen
      .filter(a => a.titel && a.uitleg)
      .map(a => ({
        begrotingId: begroting.id,
        runId,
        type:       GELDIGE_TYPEN.includes(a.type)      ? a.type      : "ontbrekende_voorbereiding",
        prioriteit: GELDIGE_PRIO.includes(a.prioriteit) ? a.prioriteit : "middel",
        titel:  String(a.titel).slice(0, 120),
        uitleg: String(a.uitleg).slice(0, 500),
        status: "actief",
      }));

    const inserted = rijen.length > 0
      ? await db.insert(werkbegrotingAdviezenTable).values(rijen).returning()
      : [];

    res.json(inserted.map(mapWbAdvies));
  } catch (err) {
    logger.error({ err }, "aiSeniorWerkvoorbereider fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

router.get("/opdrachten/:id/werkbegroting/senior-adviezen", lezen, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  try {
    const [begroting] = await db.select().from(projectBegrotingenTable)
      .where(eq(projectBegrotingenTable.opdrachtId, id));
    if (!begroting) { res.json([]); return; }

    const rows = await db.select().from(werkbegrotingAdviezenTable)
      .where(eq(werkbegrotingAdviezenTable.begrotingId, begroting.id))
      .orderBy(
        sql`CASE ${werkbegrotingAdviezenTable.prioriteit} WHEN 'hoog' THEN 1 WHEN 'middel' THEN 2 ELSE 3 END`,
        asc(werkbegrotingAdviezenTable.aangemaaktOp),
      );

    res.json(rows.map(mapWbAdvies));
  } catch (err) {
    logger.error({ err }, "listWbAdviezen fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

router.patch("/opdrachten/:id/werkbegroting/senior-adviezen/:adviesId", schrijven, async (req, res): Promise<void> => {
  const id       = parseInt(String(req.params.id), 10);
  const adviesId = parseInt(String(req.params.adviesId), 10);
  if (isNaN(id) || isNaN(adviesId)) { res.status(400).json({ error: "Ongeldig id" }); return; }

  try {
    const [begroting] = await db.select().from(projectBegrotingenTable)
      .where(eq(projectBegrotingenTable.opdrachtId, id));
    if (!begroting) { res.status(404).json({ error: "Werkbegroting niet gevonden" }); return; }

    const { status, notitie } = req.body as { status?: string; notitie?: string | null };
    const updates: Partial<typeof werkbegrotingAdviezenTable.$inferInsert> = { bijgewerktOp: new Date() };
    if (status !== undefined) updates.status = status;
    if (notitie !== undefined) updates.notitie = notitie;

    const [updated] = await db.update(werkbegrotingAdviezenTable)
      .set(updates)
      .where(and(eq(werkbegrotingAdviezenTable.id, adviesId), eq(werkbegrotingAdviezenTable.begrotingId, begroting.id)))
      .returning();

    if (!updated) { res.status(404).json({ error: "Advies niet gevonden" }); return; }
    res.json(mapWbAdvies(updated));
  } catch (err) {
    logger.error({ err }, "updateWbAdvies fout");
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── POST /opdrachten/:id/meerwerk-meldingen ─────────────────────────────────
// BOUW_01 §4 — meer-/minderwerk melden vanaf de bouwplaats. Alle velden
// verplicht, voor iedereen die meldt — ook de projectleider. Een melding wordt
// GEEN werkbegrotingsregel en raakt geen enkel bedrag; hij landt als doen-item
// bij de werkvoorbereider met vaste cc (weten) aan de projectleider.
router.post("/opdrachten/:id/meerwerk-meldingen", lezen, async (req, res): Promise<void> => {
  try {
    const opdrachtId = Number(req.params.id);
    const [opdracht] = await db
      .select({ id: opdrachtenTable.id, titel: opdrachtenTable.titel, werknummer: opdrachtenTable.werknummer })
      .from(opdrachtenTable)
      .where(eq(opdrachtenTable.id, opdrachtId));
    if (!opdracht) return void res.status(404).json({ error: "Opdracht niet gevonden" });

    const b = (req.body ?? {}) as Record<string, unknown>;
    const type = typeof b.type === "string" ? b.type : "";
    const fotos = Array.isArray(b.fotos) ? b.fotos.filter((f): f is string => typeof f === "string" && f.trim() !== "") : [];
    const omschrijving = typeof b.omschrijving === "string" ? b.omschrijving.trim() : "";
    const impactMateriaal = typeof b.impact_materiaal === "string" ? b.impact_materiaal.trim() : "";
    const impactUren = typeof b.impact_uren === "string" ? b.impact_uren.trim() : "";
    const impactPlanning = typeof b.impact_planning === "string" ? b.impact_planning.trim() : "";

    // Wie meldt, denkt na: elk veld is verplicht — een ruwe schatting is
    // genoeg, leeg laten niet (BOUW_01 §4).
    const ontbreekt: string[] = [];
    if (type !== "meerwerk" && type !== "minderwerk") ontbreekt.push("type (meerwerk of minderwerk)");
    if (fotos.length < 1) ontbreekt.push("minimaal één foto");
    if (!omschrijving) ontbreekt.push("omschrijving");
    if (!impactMateriaal) ontbreekt.push("ingeschatte impact materiaal");
    if (!impactUren) ontbreekt.push("ingeschatte impact uren");
    if (!impactPlanning) ontbreekt.push("ingeschatte impact planning");
    if (ontbreekt.length > 0) {
      return void res.status(400).json({
        error: `Melding onvolledig — verplicht: ${ontbreekt.join(", ")}. Een ruwe schatting is genoeg, leeg laten niet.`,
        ontbrekende_velden: ontbreekt,
      });
    }

    const melderId = req.session.userId!;
    const [melder] = await db
      .select({ naam: gebruikersTable.naam })
      .from(gebruikersTable)
      .where(eq(gebruikersTable.id, melderId));

    const kenmerk = opdracht.werknummer ?? `#${opdracht.id}`;
    const detail = [
      `${type === "meerwerk" ? "Meerwerk" : "Minderwerk"} gemeld door ${melder?.naam ?? "onbekend"} op opdracht ${kenmerk} (${opdracht.titel}).`,
      `Omschrijving: ${omschrijving}`,
      `Impact materiaal: ${impactMateriaal}`,
      `Impact uren: ${impactUren}`,
      `Impact planning: ${impactPlanning}`,
      `Foto's: ${fotos.join(" | ")}`,
      `Let op: dit is een melding — geen begroting en geen doorbelasting. Doorbelasten blijft een besluit van de projectleider.`,
    ].join("\n");

    const uniek = `meerwerk:${opdracht.id}:${Date.now()}:${melderId}`;
    const geplaatst = await meldAanWerkvoorbereiderMetCcProjectleider({
      bron: "meerwerk_melding",
      titel: `${type === "meerwerk" ? "Meerwerk" : "Minderwerk"} gemeld op ${kenmerk}`,
      omschrijving: detail,
      gewicht: 30,
      actiePad: `/opdrachten/${opdracht.id}`,
      herkomstType: "opdracht",
      herkomstId: opdracht.id,
      dedupBasis: uniek,
    });

    res.status(201).json({
      status: "gemeld",
      opdracht_id: opdracht.id,
      type,
      werkvoorbereider_items: geplaatst.werkvoorbereiders,
      projectleider_cc_items: geplaatst.projectleiders,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
