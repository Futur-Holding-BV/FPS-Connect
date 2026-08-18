import { Router } from "express";
import { DATUMVELDEN_MEDEWERKER, isRedelijkeDatum } from "../lib/datumSaniteit";
import {
  db,
  medewerkersTable,
  medewerkerDocumentenTable,
  gebruikersTable,
  hrmMiddelenTable,
  hrmOnboardingTakenTable,
  hrmAiVoorstellenTable,
} from "@workspace/db";
import { eq, and, or, ilike, isNull, sql } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { ObjectStorageService } from "../lib/objectStorage";
import { logActiviteit } from "../lib/activiteit";
import { analyseerEnSlaVoorstellenOp } from "../lib/hrm-ai-analyse";

const router = Router();

const lezen = requireBevoegdheid("personeel", 1);
const schrijven = requireBevoegdheid("personeel", 2);

// ─── Duplicate-check ──────────────────────────────────────────────────────────

router.post("/medewerkers/duplicate-check", lezen, async (req, res): Promise<void> => {
  const { naam, email, geboortedatum } = req.body as {
    naam?: string;
    email?: string;
    geboortedatum?: string;
  };

  if (!naam && !email && !geboortedatum) {
    return void res.json({ mogelijke_duplicaten: [] });
  }

  const conditions = [];
  if (naam && naam.trim().length >= 2) {
    conditions.push(ilike(medewerkersTable.naam, `%${naam.trim()}%`));
  }
  if (email && email.trim().length >= 3) {
    conditions.push(ilike(medewerkersTable.email, `%${email.trim()}%`));
  }

  // 1. Zoek in medewerkers (inclusief gearchiveerde / inactieve).
  // Afgeschermde oud-medewerkers (AVG-afscherming) worden volledig uitgesloten:
  // hun e-mail/geboortedatum mag via deze route niet terugvindbaar zijn.
  const medewerkerRijen = conditions.length > 0
    ? await db
        .select({
          id: medewerkersTable.id,
          naam: medewerkersTable.naam,
          email: medewerkersTable.email,
          geboortedatum: medewerkersTable.geboortedatum,
          actief: medewerkersTable.actief,
        })
        .from(medewerkersTable)
        .where(and(or(...conditions), isNull(medewerkersTable.afgeschermdOp)))
        .limit(10)
    : [];

  // 2. Zoek ook in gebruikers-accounts (oud-gebruikers zonder medewerker-record).
  // Accounts die gekoppeld zijn aan een afgeschermde oud-medewerker mogen hier
  // GEEN naam/e-mail prijsgeven: alleen bij een exacte e-mailmatch komt een
  // geredigeerd "bestaand account"-resultaat terug (duplicaat-preventie blijft
  // werken, vissen op deelstrings kan niet).
  const gebruikerRijen: Array<{ id: number; naam: string; email: string | null }> = [];
  const afgeschermdeAccounts: Array<{ id: number }> = [];
  if (email && email.trim().length >= 3) {
    const gRows = await db
      .select({ id: gebruikersTable.id, naam: gebruikersTable.naam, email: gebruikersTable.email, afgeschermdOp: medewerkersTable.afgeschermdOp })
      .from(gebruikersTable)
      .leftJoin(medewerkersTable, eq(medewerkersTable.gebruikerId, gebruikersTable.id))
      .where(ilike(gebruikersTable.email, `%${email.trim()}%`))
      .limit(5);
    for (const g of gRows) {
      if (g.afgeschermdOp) {
        if (g.email && g.email.toLowerCase() === email.trim().toLowerCase()) {
          afgeschermdeAccounts.push({ id: g.id });
        }
        continue;
      }
      const al = medewerkerRijen.some(
        (r) => r.email && g.email && r.email.toLowerCase() === g.email.toLowerCase(),
      );
      if (!al) gebruikerRijen.push(g);
    }
  }

  function scoreMedewerker(r: { naam: string | null; email: string | null; geboortedatum: string | null }) {
    let score = 0;
    if (naam && r.naam?.toLowerCase().includes(naam.toLowerCase())) score += 0.5;
    if (naam && r.naam?.toLowerCase() === naam.toLowerCase()) score = 0.95;
    if (email && r.email && r.email.toLowerCase() === email.toLowerCase()) score = 1.0;
    if (geboortedatum && r.geboortedatum === geboortedatum) score += 0.4;
    return Math.min(score, 1);
  }

  const resultatenMedewerkers = medewerkerRijen
    .map((r) => ({
      id: r.id,
      naam: r.naam ?? "",
      email: r.email ?? null,
      geboortedatum: r.geboortedatum ?? null,
      gelijkenis_score: scoreMedewerker({ naam: r.naam ?? null, email: r.email ?? null, geboortedatum: r.geboortedatum ?? null }),
      type: r.actief ? "actief" : "inactief",
    }))
    .filter((r) => r.gelijkenis_score >= 0.4);

  const resultatenGebruikers = gebruikerRijen
    .map((g) => ({
      id: g.id,
      naam: g.naam,
      email: g.email,
      geboortedatum: null as string | null,
      gelijkenis_score: scoreMedewerker({ naam: g.naam, email: g.email, geboortedatum: null }),
      type: "gebruiker_account" as const,
    }))
    .filter((r) => r.gelijkenis_score >= 0.4);

  const resultatenAfgeschermd = afgeschermdeAccounts.map((a) => ({
    id: a.id,
    naam: "Bestaand account (gegevens afgeschermd)",
    email: null as string | null,
    geboortedatum: null as string | null,
    gelijkenis_score: 1,
    type: "gebruiker_account" as const,
  }));

  const merged = [...resultatenMedewerkers, ...resultatenGebruikers, ...resultatenAfgeschermd]
    .sort((a, b) => b.gelijkenis_score - a.gelijkenis_score)
    .slice(0, 10);

  return void res.json({ mogelijke_duplicaten: merged });
});

// ─── Wizard status & voortgang ────────────────────────────────────────────────

router.get("/medewerkers/:id/wizard-status", lezen, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) return void res.status(400).json({ error: "Ongeldig id" });

  const [m] = await db
    .select({
      id: medewerkersTable.id,
      medewerkerStatus: medewerkersTable.medewerkerStatus,
      wizardVoortgang: medewerkersTable.wizardVoortgang,
    })
    .from(medewerkersTable)
    .where(eq(medewerkersTable.id, id));

  if (!m) return void res.status(404).json({ error: "Medewerker niet gevonden" });

  const voortgang = (m.wizardVoortgang as Record<string, unknown> | null) ?? {};
  const huidigStap = typeof voortgang._huidig_stap === "number" ? voortgang._huidig_stap : 1;

  return void res.json({
    id: m.id,
    medewerker_status: m.medewerkerStatus ?? "concept",
    huidig_stap: huidigStap,
    wizard_voortgang: voortgang,
  });
});

router.patch("/medewerkers/:id/wizard-voortgang", schrijven, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) return void res.status(400).json({ error: "Ongeldig id" });

  const { stap, medewerker_status, voortgang_data, bijgewerkt_op } = req.body as {
    stap: number;
    medewerker_status?: string;
    voortgang_data?: Record<string, unknown>;
    bijgewerkt_op?: string;
  };

  const [huidig] = await db
    .select({
      wizardVoortgang: medewerkersTable.wizardVoortgang,
      bijgewerktOp: medewerkersTable.bijgewerktOp,
    })
    .from(medewerkersTable)
    .where(eq(medewerkersTable.id, id));

  if (!huidig) return void res.status(404).json({ error: "Medewerker niet gevonden" });

  // Optimistic locking: geef 409 als de client een verouderde versie meestuurt
  if (bijgewerkt_op && huidig.bijgewerktOp) {
    const clientTs = new Date(bijgewerkt_op);
    if (!isNaN(clientTs.getTime())) {
      const diff = Math.abs(clientTs.getTime() - huidig.bijgewerktOp.getTime());
      if (diff > 2000) {
        return void res.status(409).json({
          error: "Conflict: wizard-voortgang is elders bijgewerkt. Ververs de pagina en herhaal.",
          server_bijgewerkt_op: huidig.bijgewerktOp.toISOString(),
        });
      }
    }
  }

  const bestaand = (huidig.wizardVoortgang as Record<string, unknown> | null) ?? {};
  const nieuw: Record<string, unknown> = {
    ...bestaand,
    _huidig_stap: stap,
    [`stap_${stap}`]: voortgang_data ?? {},
  };

  const nuTs = new Date();
  const update: Partial<typeof medewerkersTable.$inferInsert> = {
    wizardVoortgang: nieuw,
    bijgewerktOp: nuTs,
  };
  if (medewerker_status) update.medewerkerStatus = medewerker_status;

  await db
    .update(medewerkersTable)
    .set(update)
    .where(eq(medewerkersTable.id, id));

  try {
    const sessieGebruikerId = req.session.userId ?? null;
    await logActiviteit({
      type: "wizard_stap",
      gebruikerId: sessieGebruikerId,
      omschrijving: `Wizard stap ${stap} voltooid voor medewerker ${id}`,
    });
  } catch { /* niet fataal */ }

  return void res.json({
    id,
    medewerker_status: medewerker_status ?? null,
    huidig_stap: stap,
    wizard_voortgang: nieuw,
    bijgewerkt_op: nuTs.toISOString(),
  });
});

// ─── AI-voorstellen ───────────────────────────────────────────────────────────

function mapAiVoorstel(r: typeof hrmAiVoorstellenTable.$inferSelect) {
  return {
    id: r.id,
    medewerker_id: r.medewerkerId,
    document_id: r.documentId ?? null,
    medewerker_document_id: r.medewerkerDocumentId ?? null,
    veld: r.veld,
    huidige_waarde: r.huidigeWaarde ?? null,
    voorgestelde_waarde: r.voorgesteldeWaarde ?? null,
    reden: r.reden ?? null,
    brondocument: r.brondocument ?? null,
    paginanummer: r.paginanummer ?? null,
    confidence: r.confidence ?? null,
    vertrouwen_score: r.vertrouwenScore ?? null,
    bewijskenmerken: r.bewijskenmerken ?? null,
    impact: r.impact ?? "laag",
    status: r.status,
    beoordeeld_door_id: r.beoordeeldDoorId ?? null,
    beoordeeld_op: r.beoordeeldOp?.toISOString() ?? null,
    model_gebruikt: r.modelGebruikt ?? null,
    correctie_tekst: r.correctieTekst ?? null,
    aangemaakt_op: r.aangemaaktOp.toISOString(),
    bijgewerkt_op: r.bijgewerktOp.toISOString(),
  };
}

router.get("/medewerkers/:id/ai-voorstellen", lezen, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) return void res.status(400).json({ error: "Ongeldig id" });

  const statusFilter = req.query.status as string | undefined;

  const query = db
    .select()
    .from(hrmAiVoorstellenTable)
    .where(
      statusFilter
        ? and(eq(hrmAiVoorstellenTable.medewerkerId, id), eq(hrmAiVoorstellenTable.status, statusFilter))
        : eq(hrmAiVoorstellenTable.medewerkerId, id),
    );

  const rijen = await query.orderBy(hrmAiVoorstellenTable.aangemaaktOp);
  return void res.json(rijen.map(mapAiVoorstel));
});

router.patch("/medewerkers/ai-voorstellen/:voorstelId", schrijven, async (req, res): Promise<void> => {
  const voorstelId = parseInt(String(req.params.voorstelId), 10);
  if (isNaN(voorstelId)) return void res.status(400).json({ error: "Ongeldig id" });

  const { status, correctie_tekst } = req.body as {
    status: string;
    correctie_tekst?: string | null;
  };

  if (!["goedgekeurd", "afgewezen", "later", "open"].includes(status)) {
    return void res.status(400).json({ error: "Ongeldige status. Kies: goedgekeurd, afgewezen, later, open" });
  }

  const gebruikerId: number | null = req.session.userId ?? null;

  // Fail-closed: goedkeuren zonder over te nemen waarde is betekenisloos.
  if (status === "goedgekeurd") {
    const [huidig] = await db
      .select({ voorgesteldeWaarde: hrmAiVoorstellenTable.voorgesteldeWaarde })
      .from(hrmAiVoorstellenTable)
      .where(eq(hrmAiVoorstellenTable.id, voorstelId));
    if (!huidig) return void res.status(404).json({ error: "Voorstel niet gevonden" });
    if (!huidig.voorgesteldeWaarde?.trim() && !correctie_tekst?.trim()) {
      return void res.status(422).json({
        error: "Dit voorstel heeft geen waarde om over te nemen. Vul een waarde in via 'Waarde invullen en overnemen', of wijs het af.",
      });
    }
  }

  const [bijgewerkt] = await db
    .update(hrmAiVoorstellenTable)
    .set({
      status,
      correctieTekst: correctie_tekst ?? null,
      beoordeeldDoorId: gebruikerId,
      beoordeeldOp: new Date(),
      bijgewerktOp: new Date(),
    })
    .where(eq(hrmAiVoorstellenTable.id, voorstelId))
    .returning();

  if (!bijgewerkt) return void res.status(404).json({ error: "Voorstel niet gevonden" });

  // Bij goedkeuren: voorstel doorvoeren naar medewerker-veld
  if (status === "goedgekeurd" && (bijgewerkt.voorgesteldeWaarde?.trim() || bijgewerkt.correctieTekst?.trim())) {
    try {
      await voerVoorstelDoor(bijgewerkt.medewerkerId, bijgewerkt.veld, bijgewerkt.voorgesteldeWaarde ?? "", bijgewerkt.correctieTekst);
    } catch (err) {
      logger.warn({ err, voorstelId }, "Voorstel goedgekeurd maar doorvoer mislukt");
    }
  }

  // Audit trail
  try {
    await logActiviteit({
      type: "hrm",
      omschrijving: `AI-voorstel veld "${bijgewerkt.veld}" beoordeeld als ${status} (medewerker #${bijgewerkt.medewerkerId})`,
      gebruikerId: gebruikerId ?? undefined,
    });
  } catch (logErr) {
    logger.warn({ err: logErr, voorstelId }, "logActiviteit mislukt voor ai-voorstel beoordeling");
  }

  return void res.json(mapAiVoorstel(bijgewerkt));
});

async function voerVoorstelDoor(medewerkerId: number, veld: string, waarde: string, correctieTekst?: string | null): Promise<void> {
  const werkelijkeWaarde = correctieTekst?.trim() || waarde;

  const kolomMap: Record<string, keyof typeof medewerkersTable.$inferInsert> = {
    naam: "naam",
    email: "email",
    telefoon: "telefoon",
    mobiel: "mobiel",
    adres: "adres",
    postcode: "postcode",
    woonplaats: "woonplaats",
    geboortedatum: "geboortedatum",
    bsn: "bsn",
    rijbewijs: "rijbewijs",
    rijbewijs_vervaldatum: "rijbewijsVervaldatum",
    vca_vervaldatum: "vcaVervaldatum",
    bhv_vervaldatum: "bhvVervaldatum",
    ehbo_vervaldatum: "ehboVervaldatum",
    cv_tekst: "cvTekst",
    in_dienst_sinds: "inDienstSinds",
    noodcontact_naam: "noodcontactNaam",
    noodcontact_telefoon: "noodcontactTelefoon",
  };

  const kolom = kolomMap[veld];
  if (!kolom) return;

  // Datumvelden fail-closed: een AI-voorstel met onzinjaartal (bv. 82026)
  // mag nooit in het profiel landen — zelfde regel als de HRM-routes.
  if ((DATUMVELDEN_MEDEWERKER as readonly string[]).includes(veld) && !isRedelijkeDatum(werkelijkeWaarde)) {
    throw new Error(`Voorstel voor '${veld}' is geen geldige datum (JJJJ-MM-DD, jaartal 1900\u20132100): ${werkelijkeWaarde}`);
  }

  await db
    .update(medewerkersTable)
    .set({ [kolom]: werkelijkeWaarde, bijgewerktOp: new Date() } as Partial<typeof medewerkersTable.$inferInsert>)
    .where(eq(medewerkersTable.id, medewerkerId));
}

// ─── Heranalyseer dossier ─────────────────────────────────────────────────────

router.post("/medewerkers/:id/heranalyseer-dossier", schrijven, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) return void res.status(400).json({ error: "Ongeldig id" });

  const [medewerker] = await db
    .select()
    .from(medewerkersTable)
    .where(eq(medewerkersTable.id, id));

  if (!medewerker) return void res.status(404).json({ error: "Medewerker niet gevonden" });

  const documenten = await db
    .select()
    .from(medewerkerDocumentenTable)
    .where(eq(medewerkerDocumentenTable.medewerkerId, id));

  let aangemaakt = 0;
  let overgeslagen = 0;
  let fout = 0;

  for (const doc of documenten) {
    const isAnalyseerbaar =
      doc.contentType?.includes("pdf") ||
      doc.contentType?.includes("word") ||
      /\.(pdf|docx?|txt)$/i.test(doc.bestandsnaam ?? "");
    if (!isAnalyseerbaar) { overgeslagen++; continue; }

    try {
      const storage = new ObjectStorageService();
      const bestand = await storage.getObjectEntityFile(doc.objectPath);
      const chunks: Buffer[] = [];
      for await (const chunk of bestand.createReadStream()) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as unknown as ArrayBuffer));
      }
      const fileBuffer = Buffer.concat(chunks);

      const { aangemaakt: a, overgeslagen: o } = await analyseerEnSlaVoorstellenOp(medewerker, doc, fileBuffer);
      aangemaakt += a;
      overgeslagen += o;
    } catch (err) {
      logger.warn({ err, docId: doc.id }, "Heranalyse document mislukt");
      fout++;
    }
  }

  // Ontbrekende-velden scan: genereer signaleringen voor lege verplichte velden
  const ONTBREKENDE_VELDEN: Array<{ veld: string; label: string; impact: "hoog" | "gemiddeld" | "laag" }> = [
    { veld: "email", label: "E-mailadres", impact: "hoog" },
    { veld: "geboortedatum", label: "Geboortedatum", impact: "gemiddeld" },
    { veld: "telefoon", label: "Telefoonnummer", impact: "gemiddeld" },
    { veld: "adres", label: "Woonadres", impact: "laag" },
    { veld: "woonplaats", label: "Woonplaats", impact: "laag" },
  ];

  // Zelfheling: oudere ontbrekend-veld-signaleringen kregen ten onrechte 100%
  // zekerheid mee. Heel álle open scan-rijen van deze medewerker in één keer.
  await db
    .update(hrmAiVoorstellenTable)
    .set({ confidence: null, vertrouwenScore: null, bijgewerktOp: new Date() })
    .where(
      and(
        eq(hrmAiVoorstellenTable.medewerkerId, id),
        eq(hrmAiVoorstellenTable.modelGebruikt, "missingFieldScan"),
        eq(hrmAiVoorstellenTable.status, "open"),
        or(
          sql`${hrmAiVoorstellenTable.confidence} IS NOT NULL`,
          sql`${hrmAiVoorstellenTable.vertrouwenScore} IS NOT NULL`,
        ),
      ),
    );

  for (const { veld, label, impact } of ONTBREKENDE_VELDEN) {
    const waarde = (medewerker as Record<string, unknown>)[veld];
    if (!waarde) {
      const [bestaand] = await db
        .select({ id: hrmAiVoorstellenTable.id })
        .from(hrmAiVoorstellenTable)
        .where(
          and(
            eq(hrmAiVoorstellenTable.medewerkerId, id),
            eq(hrmAiVoorstellenTable.veld, veld),
            eq(hrmAiVoorstellenTable.status, "open"),
          ),
        );
      if (!bestaand) {
        await db.insert(hrmAiVoorstellenTable).values({
          medewerkerId: id,
          veld,
          huidigeWaarde: null,
          voorgesteldeWaarde: null,
          reden: `Ontbrekend veld: ${label} is nog niet ingevuld in het profiel — geen waarde in de documenten gevonden`,
          brondocument: null,
          // Signalering zonder voorstelwaarde: een zekerheidspercentage is hier
          // betekenisloos (er is niets om zeker over te zijn) — dus geen score.
          confidence: null,
          vertrouwenScore: null,
          status: "open",
          impact,
          modelGebruikt: "missingFieldScan",
        });
        aangemaakt++;
      }
    }
  }

  // Niet-geanaliseerde documenten detecteren (voor rapportage)
  const voorstellenPerDoc = await db
    .select({ docId: hrmAiVoorstellenTable.medewerkerDocumentId })
    .from(hrmAiVoorstellenTable)
    .where(eq(hrmAiVoorstellenTable.medewerkerId, id));
  const docIdsMetVoorstellen = new Set(
    voorstellenPerDoc.map((v) => v.docId).filter((d): d is number => d !== null),
  );
  const ongekoppeld = documenten
    .filter((d) => !docIdsMetVoorstellen.has(d.id))
    .map((d) => d.bestandsnaam ?? `document-${d.id}`);

  return void res.json({ aangemaakt, overgeslagen, fout, ongekoppelde_documenten: ongekoppeld });
});

// ─── Middelen ─────────────────────────────────────────────────────────────────

function mapMiddel(r: typeof hrmMiddelenTable.$inferSelect) {
  return {
    id: r.id,
    medewerker_id: r.medewerkerId,
    categorie: r.categorie,
    naam: r.naam,
    status: r.status,
    retour_vereist: r.retourVereist,
    gekoppeld_module: r.gekoppeldModule ?? null,
    aangevraagd_op: r.aangevraagdOp?.toISOString() ?? null,
    uitgegeven_op: r.uitgegeven_op?.toISOString() ?? null,
    ontvangst_bevestigd_op: r.ontvangstBevestigdOp?.toISOString() ?? null,
    opmerking: r.opmerking ?? null,
    aangemaakt_op: r.aangemaaktOp.toISOString(),
    bijgewerkt_op: r.bijgewerktOp.toISOString(),
  };
}

router.get("/medewerkers/:id/middelen", lezen, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) return void res.status(400).json({ error: "Ongeldig id" });

  const rijen = await db
    .select()
    .from(hrmMiddelenTable)
    .where(eq(hrmMiddelenTable.medewerkerId, id))
    .orderBy(hrmMiddelenTable.categorie, hrmMiddelenTable.naam);

  return void res.json(rijen.map(mapMiddel));
});

router.post("/medewerkers/:id/middelen", schrijven, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) return void res.status(400).json({ error: "Ongeldig id" });

  const body = req.body as {
    categorie: string;
    naam: string;
    status?: string;
    retour_vereist?: boolean;
    opmerking?: string | null;
    aangevraagd_op?: string | null;
    uitgegeven_op?: string | null;
  };

  if (!body.naam?.trim()) return void res.status(400).json({ error: "naam is verplicht" });

  const gebruikerId: number | null = req.session.userId ?? null;

  const [nieuw] = await db
    .insert(hrmMiddelenTable)
    .values({
      medewerkerId: id,
      categorie: body.categorie?.trim() || "overig",
      naam: body.naam.trim(),
      status: body.status || "aangevraagd",
      retourVereist: body.retour_vereist ?? false,
      opmerking: body.opmerking ?? null,
      aangevraagdOp: body.aangevraagd_op ? new Date(body.aangevraagd_op) : new Date(),
      uitgegeven_op: body.uitgegeven_op ? new Date(body.uitgegeven_op) : null,
      aangevraagdDoorId: gebruikerId,
    })
    .returning();

  return void res.status(201).json(mapMiddel(nieuw));
});

router.patch("/hrm/middelen/:id", schrijven, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) return void res.status(400).json({ error: "Ongeldig id" });

  const body = req.body as {
    categorie?: string;
    naam?: string;
    status?: string;
    retour_vereist?: boolean;
    opmerking?: string | null;
    aangevraagd_op?: string | null;
    uitgegeven_op?: string | null;
  };

  const update: Partial<typeof hrmMiddelenTable.$inferInsert> = { bijgewerktOp: new Date() };
  if (body.categorie !== undefined) update.categorie = body.categorie;
  if (body.naam !== undefined) update.naam = body.naam;
  if (body.status !== undefined) update.status = body.status;
  if (body.retour_vereist !== undefined) update.retourVereist = body.retour_vereist;
  if (body.opmerking !== undefined) update.opmerking = body.opmerking;
  if (body.aangevraagd_op !== undefined) update.aangevraagdOp = body.aangevraagd_op ? new Date(body.aangevraagd_op) : null;
  if (body.uitgegeven_op !== undefined) update.uitgegeven_op = body.uitgegeven_op ? new Date(body.uitgegeven_op) : null;

  const [bijgewerkt] = await db
    .update(hrmMiddelenTable)
    .set(update)
    .where(eq(hrmMiddelenTable.id, id))
    .returning();

  if (!bijgewerkt) return void res.status(404).json({ error: "Middel niet gevonden" });
  return void res.json(mapMiddel(bijgewerkt));
});

router.delete("/hrm/middelen/:id", schrijven, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) return void res.status(400).json({ error: "Ongeldig id" });

  await db.delete(hrmMiddelenTable).where(eq(hrmMiddelenTable.id, id));
  return void res.status(204).send();
});

// ─── Onboarding-taken ─────────────────────────────────────────────────────────

async function mapTaak(r: typeof hrmOnboardingTakenTable.$inferSelect) {
  let verantwoordelijkeNaam: string | null = null;
  if (r.verantwoordelijkeId) {
    const [g] = await db
      .select({ naam: gebruikersTable.naam })
      .from(gebruikersTable)
      .where(eq(gebruikersTable.id, r.verantwoordelijkeId));
    verantwoordelijkeNaam = g?.naam ?? null;
  }
  return {
    id: r.id,
    medewerker_id: r.medewerkerId,
    naam: r.naam,
    verantwoordelijke_id: r.verantwoordelijkeId ?? null,
    verantwoordelijke_naam: verantwoordelijkeNaam,
    deadline: r.deadline ?? null,
    status: r.status,
    categorie: r.categorie ?? null,
    volgorde: r.volgorde ?? 0,
    opmerking: r.opmerking ?? null,
    aangemaakt_op: r.aangemaaktOp.toISOString(),
    bijgewerkt_op: r.bijgewerktOp.toISOString(),
  };
}

router.get("/medewerkers/:id/onboarding-taken", lezen, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) return void res.status(400).json({ error: "Ongeldig id" });

  const rijen = await db
    .select()
    .from(hrmOnboardingTakenTable)
    .where(eq(hrmOnboardingTakenTable.medewerkerId, id))
    .orderBy(hrmOnboardingTakenTable.volgorde, hrmOnboardingTakenTable.aangemaaktOp);

  const gemapped = await Promise.all(rijen.map(mapTaak));
  return void res.json(gemapped);
});

router.post("/medewerkers/:id/onboarding-taken", schrijven, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) return void res.status(400).json({ error: "Ongeldig id" });

  const body = req.body as {
    naam: string;
    verantwoordelijke_id?: number | null;
    deadline?: string | null;
    status?: string;
    categorie?: string | null;
    volgorde?: number;
    opmerking?: string | null;
  };

  if (!body.naam?.trim()) return void res.status(400).json({ error: "naam is verplicht" });

  const [nieuw] = await db
    .insert(hrmOnboardingTakenTable)
    .values({
      medewerkerId: id,
      naam: body.naam.trim(),
      verantwoordelijkeId: body.verantwoordelijke_id ?? null,
      deadline: body.deadline ?? null,
      status: body.status || "openstaand",
      categorie: body.categorie ?? null,
      volgorde: body.volgorde ?? 0,
      opmerking: body.opmerking ?? null,
    })
    .returning();

  return void res.status(201).json(await mapTaak(nieuw));
});

router.patch("/hrm/onboarding-taken/:taakId", schrijven, async (req, res): Promise<void> => {
  const taakId = parseInt(String(req.params.taakId), 10);
  if (isNaN(taakId)) return void res.status(400).json({ error: "Ongeldig id" });

  const body = req.body as {
    naam?: string;
    verantwoordelijke_id?: number | null;
    deadline?: string | null;
    status?: string;
    categorie?: string | null;
    volgorde?: number;
    opmerking?: string | null;
  };

  const update: Partial<typeof hrmOnboardingTakenTable.$inferInsert> = { bijgewerktOp: new Date() };
  if (body.naam !== undefined) update.naam = body.naam;
  if (body.verantwoordelijke_id !== undefined) update.verantwoordelijkeId = body.verantwoordelijke_id;
  if (body.deadline !== undefined) update.deadline = body.deadline;
  if (body.status !== undefined) update.status = body.status;
  if (body.categorie !== undefined) update.categorie = body.categorie;
  if (body.volgorde !== undefined) update.volgorde = body.volgorde;
  if (body.opmerking !== undefined) update.opmerking = body.opmerking;

  const [bijgewerkt] = await db
    .update(hrmOnboardingTakenTable)
    .set(update)
    .where(eq(hrmOnboardingTakenTable.id, taakId))
    .returning();

  if (!bijgewerkt) return void res.status(404).json({ error: "Taak niet gevonden" });
  return void res.json(await mapTaak(bijgewerkt));
});

router.delete("/hrm/onboarding-taken/:taakId", schrijven, async (req, res): Promise<void> => {
  const taakId = parseInt(String(req.params.taakId), 10);
  if (isNaN(taakId)) return void res.status(400).json({ error: "Ongeldig id" });

  await db.delete(hrmOnboardingTakenTable).where(eq(hrmOnboardingTakenTable.id, taakId));
  return void res.status(204).send();
});

export default router;
