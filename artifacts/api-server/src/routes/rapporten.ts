// Opleverrapporten (V1.5) — concept/definitief rapport per gebouw.
// Een rapport slaat selectie (secties, spots, bijlagen, tekeningen) op.
// Definitief maken bevriest de documentrevisies en start de reactietermijn.
import { Router, type Request } from "express";
import { publiekeAppUrl } from "../lib/publiekeUrl";
import {
  db,
  opleverrapportenTable,
  gebouwenTable,
  gebouwPartijenTable,
  gebruikersTable,
  documentenTable,
  werkbonnenTable,
  crmOpdrachtenTable,
  crmKlantenTable,
  crmContactpersonenTable,
} from "@workspace/db";
import { eq, desc, and, inArray, ne, isNotNull } from "drizzle-orm";
import { stuurRapportBeschikbaarMelding } from "../services/email";
import { requireBevoegdheid } from "../middlewares/auth";
import { ObjectStorageService } from "../lib/objectStorage";
import { aiGateway, heeftGateway } from "../lib/aiGateway";
import { RAPPORT_SAMENVATTING_PROMPT } from "../lib/aiPrompts";
import { bouwNieuweVersieWaarden } from "../lib/rapport-helpers";
import { extraheerPdfTekst } from "../lib/pdfTekst";

const router = Router();

const lezenRapporten = requireBevoegdheid("rapportages", 1);
const schrijvenRapporten = requireBevoegdheid("rapportages", 2);
const aanmakenRapporten = requireBevoegdheid("rapportages", 3);
const verwijderenRapporten = requireBevoegdheid("rapportages", 4);

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

function parseId(v: unknown): number {
  return parseInt(String(v), 10);
}

function berekenOpleverstatus(
  r: typeof opleverrapportenTable.$inferSelect,
): string {
  if (r.vervangenDoorId != null) return "vervangen";
  if (r.status === "concept") return "concept";
  if (r.status === "gearchiveerd") return "gearchiveerd";
  // status === "definitief"
  if (!r.reactietermijnDatum) return "verzonden";
  const nu = Date.now();
  if (new Date(r.reactietermijnDatum).getTime() > nu) return "reactietermijn_loopt";
  return "verstreken";
}

function mapRapport(
  r: typeof opleverrapportenTable.$inferSelect,
  extra?: { aangemaaktDoorNaam?: string | null; gebouwNaam?: string | null; werkbonNummer?: string | null },
) {
  return {
    id: r.id,
    gebouw_id: r.gebouwId,
    werkbon_id: r.werkbonId ?? null,
    werkbon_nummer: extra?.werkbonNummer ?? null,
    rapport_type: r.rapportType,
    versie: r.versie,
    status: r.status,
    opleverstatus: berekenOpleverstatus(r),
    vervangen_door_id: r.vervangenDoorId ?? null,
    titel: r.titel,
    secties: r.secties ?? {},
    spot_selectie: r.spotSelectie ?? {},
    bijlagen_ids: Array.isArray(r.bijlagenIds) ? r.bijlagenIds : [],
    tekening_ids: Array.isArray(r.tekeningIds) ? r.tekeningIds : [],
    bevroren_op: iso(r.bevrorenOp),
    bevroren_document_revisies: r.bevrorenDocumentRevisies ?? null,
    reactietermijn_datum: iso(r.reactietermijnDatum),
    reactietermijn_gestart_op: iso(r.reactietermijnGestarteOp),
    vervangen_door_rapport_id: r.vervangenDoorRapportId ?? null,
    vervangen_op: iso(r.vervangenOp),
    certificaat_geaccordeerd: r.certificaatGeaccordeerd,
    certificaat_geaccordeerd_op: iso(r.certificaatGeaccordeerdOp),
    certificaat_garantie_maanden: r.certificaatGarantieMaanden,
    klant_reactie_op: iso(r.klantReactieOp),
    klant_reactie_type: r.klantReactieType ?? null,
    aangemaakt_door: r.aangemaaktDoor,
    aangemaakt_door_naam: extra?.aangemaaktDoorNaam ?? null,
    gebouw_naam: extra?.gebouwNaam ?? null,
    aangemaakt_op: iso(r.aangemaaktOp)!,
    bijgewerkt_op: iso(r.bijgewerktOp)!,
  };
}

function userId(req: Request): number | null {
  return (req.session as { userId?: number }).userId ?? null;
}

// ── GET /rapporten (cross-gebouw) ─────────────────────────────────────────────
router.get("/rapporten", lezenRapporten, async (req, res): Promise<void> => {
  try {
    const statusFilter = req.query.status as string | undefined;
    const werkbonIdFilter = req.query.werkbon_id ? parseInt(String(req.query.werkbon_id), 10) : undefined;

    const q = db
      .select({
        r: opleverrapportenTable,
        naam: gebruikersTable.naam,
        gebouwNaam: gebouwenTable.naam,
        werkbonNummer: werkbonnenTable.werkbonnummer,
      })
      .from(opleverrapportenTable)
      .leftJoin(gebruikersTable, eq(opleverrapportenTable.aangemaaktDoor, gebruikersTable.id))
      .leftJoin(gebouwenTable, eq(opleverrapportenTable.gebouwId, gebouwenTable.id))
      .leftJoin(werkbonnenTable, eq(opleverrapportenTable.werkbonId, werkbonnenTable.id))
      .orderBy(desc(opleverrapportenTable.bijgewerktOp));

    const filters = [];
    if (statusFilter) filters.push(eq(opleverrapportenTable.status, statusFilter));
    if (werkbonIdFilter) filters.push(eq(opleverrapportenTable.werkbonId, werkbonIdFilter));

    const rijen = filters.length > 0 ? await q.where(and(...filters as [ReturnType<typeof eq>])) : await q;
    res.json(rijen.map(r => mapRapport(r.r, { aangemaaktDoorNaam: r.naam, gebouwNaam: r.gebouwNaam, werkbonNummer: r.werkbonNummer })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── GET /gebouwen/:id/rapporten ───────────────────────────────────────────────
router.get("/gebouwen/:id/rapporten", lezenRapporten, async (req, res): Promise<void> => {
  try {
    const gebouwId = parseId(req.params.id);
    const waarFilter = eq(opleverrapportenTable.gebouwId, gebouwId);
    const rijen = await db
      .select({ r: opleverrapportenTable, naam: gebruikersTable.naam })
      .from(opleverrapportenTable)
      .leftJoin(gebruikersTable, eq(opleverrapportenTable.aangemaaktDoor, gebruikersTable.id))
      .where(waarFilter)
      .orderBy(desc(opleverrapportenTable.bijgewerktOp));
    res.json(rijen.map(r => mapRapport(r.r, { aangemaaktDoorNaam: r.naam })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── POST /gebouwen/:id/rapporten ──────────────────────────────────────────────
router.post("/gebouwen/:id/rapporten", aanmakenRapporten, async (req, res): Promise<void> => {
  try {
    const gebouwId = parseId(req.params.id);

    const [gebouw] = await db
      .select({ id: gebouwenTable.id })
      .from(gebouwenTable)
      .where(eq(gebouwenTable.id, gebouwId));
    if (!gebouw) { res.status(404).json({ error: "Gebouw niet gevonden" }); return; }

    const { rapport_type, titel, werkbon_id, secties, spot_selectie, bijlagen_ids, tekening_ids, reactietermijn_datum } =
      req.body as {
        rapport_type?: string;
        titel?: string | null;
        werkbon_id?: number | null;
        secties?: Record<string, boolean>;
        spot_selectie?: Record<string, number[]>;
        bijlagen_ids?: number[];
        tekening_ids?: number[];
        reactietermijn_datum?: string | null;
      };

    const [nieuw] = await db
      .insert(opleverrapportenTable)
      .values({
        gebouwId,
        rapportType: rapport_type ?? "opleverrapport",
        status: "concept",
        titel: titel ?? null,
        werkbonId: werkbon_id ?? null,
        secties: secties ?? {},
        spotSelectie: spot_selectie ?? {},
        bijlagenIds: bijlagen_ids ?? [],
        tekeningIds: tekening_ids ?? [],
        reactietermijnDatum: reactietermijn_datum ? new Date(reactietermijn_datum) : null,
        aangemaaktDoor: userId(req),
        bijgewerktOp: new Date(),
      })
      .returning();

    res.status(201).json(mapRapport(nieuw));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── GET /gebouwen/:id/rapporten/:rapportId ────────────────────────────────────
router.get("/gebouwen/:id/rapporten/:rapportId", lezenRapporten, async (req, res): Promise<void> => {
  try {
    const gebouwId = parseId(req.params.id);
    const rapportId = parseId(req.params.rapportId);

    const [rij] = await db
      .select({ r: opleverrapportenTable, naam: gebruikersTable.naam })
      .from(opleverrapportenTable)
      .leftJoin(gebruikersTable, eq(opleverrapportenTable.aangemaaktDoor, gebruikersTable.id))
      .where(
        and(
          eq(opleverrapportenTable.id, rapportId),
          eq(opleverrapportenTable.gebouwId, gebouwId),
        ),
      );
    if (!rij) { res.status(404).json({ error: "Rapport niet gevonden" }); return; }
    res.json(mapRapport(rij.r, { aangemaaktDoorNaam: rij.naam }));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── PATCH /gebouwen/:id/rapporten/:rapportId ──────────────────────────────────
router.patch("/gebouwen/:id/rapporten/:rapportId", schrijvenRapporten, async (req, res): Promise<void> => {
  try {
    const gebouwId = parseId(req.params.id);
    const rapportId = parseId(req.params.rapportId);

    const [huidig] = await db
      .select()
      .from(opleverrapportenTable)
      .where(
        and(
          eq(opleverrapportenTable.id, rapportId),
          eq(opleverrapportenTable.gebouwId, gebouwId),
        ),
      );
    if (!huidig) { res.status(404).json({ error: "Rapport niet gevonden" }); return; }
    if (huidig.status !== "concept") {
      res.status(409).json({ error: "Alleen concept-rapporten kunnen worden bewerkt" });
      return;
    }

    const { titel, werkbon_id, secties, spot_selectie, bijlagen_ids, tekening_ids, reactietermijn_datum } =
      req.body as {
        titel?: string | null;
        werkbon_id?: number | null;
        secties?: Record<string, boolean>;
        spot_selectie?: Record<string, number[]>;
        bijlagen_ids?: number[];
        tekening_ids?: number[];
        reactietermijn_datum?: string | null;
      };

    const [bijgewerkt] = await db
      .update(opleverrapportenTable)
      .set({
        ...(titel !== undefined ? { titel } : {}),
        ...(werkbon_id !== undefined ? { werkbonId: werkbon_id } : {}),
        ...(secties !== undefined ? { secties } : {}),
        ...(spot_selectie !== undefined ? { spotSelectie: spot_selectie } : {}),
        ...(bijlagen_ids !== undefined ? { bijlagenIds: bijlagen_ids } : {}),
        ...(tekening_ids !== undefined ? { tekeningIds: tekening_ids } : {}),
        ...(reactietermijn_datum !== undefined
          ? { reactietermijnDatum: reactietermijn_datum ? new Date(reactietermijn_datum) : null }
          : {}),
        bijgewerktOp: new Date(),
      })
      .where(eq(opleverrapportenTable.id, rapportId))
      .returning();

    res.json(mapRapport(bijgewerkt));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── DELETE /gebouwen/:id/rapporten/:rapportId ─────────────────────────────────
router.delete("/gebouwen/:id/rapporten/:rapportId", verwijderenRapporten, async (req, res): Promise<void> => {
  try {
    const gebouwId = parseId(req.params.id);
    const rapportId = parseId(req.params.rapportId);

    const [huidig] = await db
      .select()
      .from(opleverrapportenTable)
      .where(
        and(
          eq(opleverrapportenTable.id, rapportId),
          eq(opleverrapportenTable.gebouwId, gebouwId),
        ),
      );
    if (!huidig) { res.status(404).json({ error: "Rapport niet gevonden" }); return; }
    if (huidig.status !== "concept") {
      res.status(409).json({ error: "Definitieve rapporten kunnen niet worden verwijderd" });
      return;
    }

    await db.delete(opleverrapportenTable).where(eq(opleverrapportenTable.id, rapportId));
    res.status(204).end();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── POST /gebouwen/:id/rapporten/:rapportId/definitief ────────────────────────
// Bevriest de documentrevisies en start de reactietermijn.
router.post("/gebouwen/:id/rapporten/:rapportId/definitief", aanmakenRapporten, async (req, res): Promise<void> => {
  try {
    const gebouwId = parseId(req.params.id);
    const rapportId = parseId(req.params.rapportId);

    const [huidig] = await db
      .select()
      .from(opleverrapportenTable)
      .where(
        and(
          eq(opleverrapportenTable.id, rapportId),
          eq(opleverrapportenTable.gebouwId, gebouwId),
        ),
      );
    if (!huidig) { res.status(404).json({ error: "Rapport niet gevonden" }); return; }
    if (huidig.status !== "concept") {
      res.status(409).json({ error: "Rapport is al definitief of gearchiveerd" });
      return;
    }

    const { reactietermijn_dagen } = req.body as { reactietermijn_dagen?: number };
    const dagen = Number(reactietermijn_dagen ?? 30);
    if (isNaN(dagen) || dagen < 1 || dagen > 365) {
      res.status(400).json({ error: "reactietermijn_dagen moet tussen 1 en 365 liggen" });
      return;
    }

    // Bevriezing: snapshot van bijlage-revisies ophalen (best-effort)
    const bijlagenIds = Array.isArray(huidig.bijlagenIds) ? (huidig.bijlagenIds as number[]) : [];
    let bevrorenRevisies: Record<string, { revisie_nummer: number | null; naam: string }> = {};
    if (bijlagenIds.length > 0) {
      try {
        const docs = await db
          .select({ id: documentenTable.id, revisieNummer: documentenTable.revisieNummer, naam: documentenTable.naam })
          .from(documentenTable)
          .where(inArray(documentenTable.id, bijlagenIds));
        for (const d of docs) {
          bevrorenRevisies[String(d.id)] = { revisie_nummer: d.revisieNummer ?? null, naam: d.naam };
        }
      } catch {
        // Bevriezing-details zijn best-effort; definitief maken gaat door
      }
    }

    const nu = new Date();
    const reactietermijnDatum = new Date(nu.getTime() + dagen * 24 * 60 * 60 * 1000);

    const [definitief] = await db
      .update(opleverrapportenTable)
      .set({
        status: "definitief",
        bevrorenOp: nu,
        bevrorenDocumentRevisies: bevrorenRevisies,
        reactietermijnDatum,
        reactietermijnGestarteOp: nu,
        // Expliciete reset: een herstart-scenario mag nooit een eerder ingevulde
        // melding-markering doorlaten naar een nieuwe definitieve versie.
        reactietermijnMeldingVerzondOp: null,
        bijgewerktOp: nu,
      })
      .where(eq(opleverrapportenTable.id, rapportId))
      .returning();

    // Eerdere definitieve rapporten van hetzelfde type in dit gebouw sluiten
    // automatisch af als "vervangen" zodra een nieuwe versie definitief wordt.
    await db
      .update(opleverrapportenTable)
      .set({
        status: "vervangen",
        vervangenDoorRapportId: definitief.id,
        vervangenOp: nu,
        bijgewerktOp: nu,
      })
      .where(
        and(
          eq(opleverrapportenTable.gebouwId, gebouwId),
          eq(opleverrapportenTable.rapportType, definitief.rapportType),
          eq(opleverrapportenTable.status, "definitief"),
          ne(opleverrapportenTable.id, definitief.id),
        ),
      );

    // Stuur een e-mail naar alle gekoppelde contacten van dit gebouw (best-effort
    // via het Platform). Falen blokkeert het definitief maken nooit.
    void (async () => {
      try {
        const basis = publiekeAppUrl();
        const portaalUrl = basis ?? "https://fps-brandpreventie.nl";
        const [gebouw] = await db
          .select({ naam: gebouwenTable.naam })
          .from(gebouwenTable)
          .where(eq(gebouwenTable.id, gebouwId));
        const partijen = await db
          .select({ naam: gebouwPartijenTable.naam, email: gebouwPartijenTable.email })
          .from(gebouwPartijenTable)
          .where(
            and(
              eq(gebouwPartijenTable.gebouwId, gebouwId),
              isNotNull(gebouwPartijenTable.email),
            ),
          );

        // Primaire CRM-contactpersonen gekoppeld via crm_opdrachten aan dit gebouw
        const crmContacten = await db
          .select({
            naam: crmContactpersonenTable.naam,
            email: crmContactpersonenTable.email,
          })
          .from(crmContactpersonenTable)
          .innerJoin(
            crmKlantenTable,
            eq(crmContactpersonenTable.klantId, crmKlantenTable.id),
          )
          .innerJoin(
            crmOpdrachtenTable,
            eq(crmOpdrachtenTable.klantId, crmKlantenTable.id),
          )
          .where(
            and(
              eq(crmOpdrachtenTable.gebouwId, gebouwId),
              eq(crmContactpersonenTable.primair, true),
              isNotNull(crmContactpersonenTable.email),
            ),
          );

        // Dedupliceer op e-mailadres (partijen en CRM-contacten gecombineerd)
        const gezieneEmails = new Set<string>();
        const ontvangers: { naam: string | null; email: string }[] = [];
        for (const r of [...partijen, ...crmContacten]) {
          if (!r.email) continue;
          const normalized = r.email.trim().toLowerCase();
          if (gezieneEmails.has(normalized)) continue;
          gezieneEmails.add(normalized);
          ontvangers.push({ naam: r.naam, email: r.email });
        }

        for (const ontvanger of ontvangers) {
          await stuurRapportBeschikbaarMelding({
            naarEmail: ontvanger.email,
            naarNaam: ontvanger.naam,
            rapportTitel: definitief.titel,
            gebouwNaam: gebouw?.naam ?? "",
            reactietermijnDatum: definitief.reactietermijnDatum!,
            portaalUrl,
            rapportId: definitief.id,
          });
        }
      } catch (err) {
        req.log.warn({ err }, "Klant-notificaties rapport-beschikbaar gefaald (niet-kritiek)");
      }
    })();

    res.json(mapRapport(definitief));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── POST /gebouwen/:id/rapporten/:rapportId/nieuwe-versie ─────────────────────
// Maakt een nieuwe conceptversie van een definitief rapport.
// Markeert het vorige rapport als vervangen (vervangen_door_id) en kopieert
// inhoud zodat de gebruiker verder kan bouwen op de bestaande selectie.
router.post("/gebouwen/:id/rapporten/:rapportId/nieuwe-versie", aanmakenRapporten, async (req, res): Promise<void> => {
  try {
    const gebouwId = parseId(req.params.id);
    const rapportId = parseId(req.params.rapportId);

    const [huidig] = await db
      .select()
      .from(opleverrapportenTable)
      .where(
        and(
          eq(opleverrapportenTable.id, rapportId),
          eq(opleverrapportenTable.gebouwId, gebouwId),
        ),
      );
    if (!huidig) { res.status(404).json({ error: "Rapport niet gevonden" }); return; }
    if (huidig.status !== "definitief") {
      res.status(409).json({ error: "Alleen definitieve rapporten kunnen worden vervangen door een nieuwe versie" });
      return;
    }
    if (huidig.vervangenDoorId != null) {
      res.status(409).json({ error: "Rapport is al vervangen door een nieuwe versie" });
      return;
    }

    const nu = new Date();

    // Nieuwe conceptversie aanmaken als kopie van het huidige rapport.
    // bouwNieuweVersieWaarden sluit reactietermijn_melding_verzond_op bewust uit.
    const [nieuw] = await db
      .insert(opleverrapportenTable)
      .values(bouwNieuweVersieWaarden(huidig, userId(req), nu))
      .returning();

    // Oud rapport markeren als vervangen
    await db
      .update(opleverrapportenTable)
      .set({ vervangenDoorId: nieuw.id, bijgewerktOp: nu })
      .where(eq(opleverrapportenTable.id, rapportId));

    res.status(201).json(mapRapport(nieuw));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── POST /gebouwen/:id/rapporten/:rapportId/certificaat-akkoord ──────────────
// Hoofdbeheerder accodeert het certificaat en plaatst zijn handtekening.
router.post("/gebouwen/:id/rapporten/:rapportId/certificaat-akkoord", aanmakenRapporten, async (req, res): Promise<void> => {
  try {
    const gebouwId = parseId(req.params.id);
    const rapportId = parseId(req.params.rapportId);

    const [huidig] = await db
      .select()
      .from(opleverrapportenTable)
      .where(and(
        eq(opleverrapportenTable.id, rapportId),
        eq(opleverrapportenTable.gebouwId, gebouwId),
      ));
    if (!huidig) { res.status(404).json({ error: "Rapport niet gevonden" }); return; }
    if (huidig.certificaatGeaccordeerd) {
      res.status(409).json({ error: "Certificaat is al geaccordeerd" });
      return;
    }

    const body = (req.body ?? {}) as { garantie_maanden?: number };
    const maanden = body.garantie_maanden ? Number(body.garantie_maanden) : undefined;

    const nu = new Date();
    const [bijgewerkt] = await db
      .update(opleverrapportenTable)
      .set({
        certificaatGeaccordeerd: true,
        certificaatGeaccordeerdOp: nu,
        ...(maanden && !isNaN(maanden) && maanden > 0 ? { certificaatGarantieMaanden: maanden } : {}),
        bijgewerktOp: nu,
      })
      .where(eq(opleverrapportenTable.id, rapportId))
      .returning();

    res.json(mapRapport(bijgewerkt));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── POST /gebouwen/:id/rapporten/:rapportId/klant-reactie ─────────────────────
// KLANTLOOS_01: de klant logt niet meer in op Connect; deze route registreert
// een ontvangstbevestiging die voortaan alleen nog door medewerkers met
// rapportagerecht kan worden vastgelegd (bv. na telefonische bevestiging).
router.post("/gebouwen/:id/rapporten/:rapportId/klant-reactie", lezenRapporten, async (req, res): Promise<void> => {
  try {
    const gebouwId = parseId(req.params.id);
    const rapportId = parseId(req.params.rapportId);

    const [huidig] = await db
      .select()
      .from(opleverrapportenTable)
      .where(and(
        eq(opleverrapportenTable.id, rapportId),
        eq(opleverrapportenTable.gebouwId, gebouwId),
      ));
    if (!huidig) { res.status(404).json({ error: "Rapport niet gevonden" }); return; }
    if (huidig.status !== "definitief") {
      res.status(409).json({ error: "Alleen definitieve rapporten kunnen worden bevestigd" });
      return;
    }
    if (huidig.klantReactieOp != null) {
      res.status(409).json({ error: "Er is al een reactie geregistreerd voor dit rapport" });
      return;
    }

    const { reactie_type } = (req.body ?? {}) as { reactie_type?: string };
    if (!reactie_type || reactie_type !== "ontvangst_bevestigd") {
      res.status(400).json({ error: "reactie_type moet 'ontvangst_bevestigd' zijn" });
      return;
    }

    const nu = new Date();
    const [bijgewerkt] = await db
      .update(opleverrapportenTable)
      .set({
        klantReactieOp: nu,
        klantReactieType: reactie_type,
        bijgewerktOp: nu,
      })
      .where(eq(opleverrapportenTable.id, rapportId))
      .returning();

    res.json(mapRapport(bijgewerkt));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Serverfout" });
  }
});

// ── Hulpfunctie: tekst afbreken voor PDF rendering ───────────────────────────

function wrapTextPdf(
  text: string,
  font: { widthOfTextAtSize(t: string, size: number): number },
  size: number,
  maxWidth: number,
): string[] {
  const regels: string[] = [];
  for (const alinea of text.split("\n")) {
    const woorden = alinea.split(" ");
    let huidig = "";
    for (const woord of woorden) {
      const kandidaat = huidig ? `${huidig} ${woord}` : woord;
      let breedte = 0;
      try { breedte = font.widthOfTextAtSize(kandidaat, size); } catch { breedte = kandidaat.length * size * 0.5; }
      if (breedte > maxWidth && huidig) { regels.push(huidig); huidig = woord; }
      else { huidig = kandidaat; }
    }
    if (huidig) regels.push(huidig);
    regels.push("");
  }
  return regels.filter((r, i, arr) => !(r === "" && (i === 0 || arr[i - 1] === "")));
}

// ── GET /gebouwen/:id/rapporten/:rapportId/bijlagenbundel ─────────────────────

router.get("/gebouwen/:id/rapporten/:rapportId/bijlagenbundel", lezenRapporten, async (req, res): Promise<void> => {
  try {
    const gebouwId  = parseId(req.params.id);
    const rapportId = parseId(req.params.rapportId);

    const [rapport] = await db
      .select()
      .from(opleverrapportenTable)
      .where(and(eq(opleverrapportenTable.id, rapportId), eq(opleverrapportenTable.gebouwId, gebouwId)));

    if (!rapport) return void res.status(404).json({ error: "Rapport niet gevonden" });

    const secties = (rapport.secties ?? {}) as Record<string, unknown>;
    const bijlagenIds = Array.isArray(secties["bijlagen_ids"])
      ? (secties["bijlagen_ids"] as unknown[]).filter((x): x is number => Number.isInteger(x))
      : [];

    if (bijlagenIds.length === 0) {
      return void res.status(400).json({ error: "Geen bijlagen geselecteerd in dit rapport" });
    }

    const docs = await db
      .select()
      .from(documentenTable)
      .where(inArray(documentenTable.id, bijlagenIds));

    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
    const outputDoc = await PDFDocument.create();
    const oss = new ObjectStorageService();

    for (const doc of docs) {
      if (!doc.pdfUrl) continue;
      try {
        const bestand  = await oss.getObjectEntityFile(doc.pdfUrl);
        const response = await oss.downloadObject(bestand);
        const buffer   = Buffer.from(await response.arrayBuffer());

        const bronDoc   = await PDFDocument.load(buffer, { ignoreEncryption: true });
        const aantalPag = bronDoc.getPageCount();

        if (aantalPag <= 5) {
          // Directe kopie voor korte documenten
          const kopieën = await outputDoc.copyPages(bronDoc, Array.from({ length: aantalPag }, (_, i) => i));
          for (const p of kopieën) outputDoc.addPage(p);
        } else {
          // Samenvattingspagina voor langere documenten
          let samenvatting = "";
          if (heeftGateway()) {
            try {
              const parsed = await extraheerPdfTekst(buffer);
              const tekst  = (parsed.tekst ?? "").slice(0, 8000);
              const samenvattingResultaat = await aiGateway.chat("default", {
                messages: [
                  {
                    role: "system",
                    content: RAPPORT_SAMENVATTING_PROMPT.tekst,
                  },
                  {
                    role: "user",
                    content: `Samenvatten het volgende document (${aantalPag} pagina's):\n\n${tekst}`,
                  },
                ],
                max_tokens: 600,
              }, undefined, {
                module: "rapporten",
                functie: "bijlageSamenvatting",
                gebruikerId: req.session.userId ?? null,
                document_id: doc.id,
                promptNaam: RAPPORT_SAMENVATTING_PROMPT.naam,
                promptVersie: RAPPORT_SAMENVATTING_PROMPT.versie,
              });
              samenvatting = samenvattingResultaat.ok ? samenvattingResultaat.inhoud : "";
            } catch (aiErr) {
              req.log.warn({ err: aiErr }, "AI-samenvatting bijlage mislukt");
              samenvatting = "(Automatische samenvatting niet beschikbaar.)";
            }
          } else {
            samenvatting = `Dit document bevat ${aantalPag} pagina's en is niet automatisch samengevat.`;
          }

          const [A4B, A4H] = [595.28, 841.89];
          const pagina   = outputDoc.addPage([A4B, A4H]);
          const fontBold = await outputDoc.embedFont(StandardFonts.HelveticaBold);
          const fontReg  = await outputDoc.embedFont(StandardFonts.Helvetica);

          // Banner
          pagina.drawRectangle({ x: 0, y: A4H - 80, width: A4B, height: 80, color: rgb(0.945, 0.231, 0.051) });
          pagina.drawText("SAMENVATTING", {
            x: 50, y: A4H - 28, font: fontBold, size: 11, color: rgb(1, 1, 1),
          });
          pagina.drawText(`${doc.naam ?? "Document"} — ${aantalPag} pagina's`, {
            x: 50, y: A4H - 50, font: fontReg, size: 9, color: rgb(1, 1, 1),
          });
          if (doc.bijgewerktOp) {
            pagina.drawText(`Datum: ${new Date(doc.bijgewerktOp).toLocaleDateString("nl-NL")}`, {
              x: 50, y: A4H - 65, font: fontReg, size: 8, color: rgb(1, 1, 1),
            });
          }

          let y = A4H - 108;
          for (const regel of wrapTextPdf(samenvatting, fontReg, 10, A4B - 100)) {
            if (y < 80) break;
            pagina.drawText(regel, { x: 50, y, font: fontReg, size: 10, color: rgb(0.1, 0.1, 0.1) });
            y -= 15;
          }

          pagina.drawText(
            "Dit is een automatisch gegenereerde samenvatting. Raadpleeg het originele document voor technische details.",
            { x: 50, y: 40, font: fontReg, size: 7.5, color: rgb(0.5, 0.5, 0.5) },
          );
        }
      } catch (docErr) {
        req.log.warn({ docId: doc.id, err: docErr }, "Bijlage overgeslagen bij bundle-generering");
      }
    }

    if (outputDoc.getPageCount() === 0) {
      return void res.status(422).json({ error: "Geen van de bijlagen kon worden verwerkt" });
    }

    const [gebouw] = await db
      .select({ naam: gebouwenTable.naam })
      .from(gebouwenTable)
      .where(eq(gebouwenTable.id, gebouwId));

    const veiligNaam  = (gebouw?.naam ?? String(gebouwId)).replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    const pdfBytes    = await outputDoc.save();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="bijlagenbundel-${veiligNaam}.pdf"`);
    res.setHeader("Content-Length", pdfBytes.length);
    res.end(Buffer.from(pdfBytes));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Serverfout bij genereren bijlagenbundel" });
  }
});

export default router;
