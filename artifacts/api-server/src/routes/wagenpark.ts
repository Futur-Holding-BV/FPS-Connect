// Wagenparkmodule — Express route handlers.
// Privacy-by-design: voertuiggericht, geen persoonsgerichte GPS-tijdlijn.
// Locatiedata alleen voor planners/beheerders (niveau >= 2 op wagenpark).

import { veiligeFoutmelding } from "../middlewares/foutafhandelaar";
import { Router } from "express";
import { db } from "@workspace/db";
import {
  voertuigenTable,
  wagenparkOnderhoudTable,
  wagenparkKostenTable,
  wagenparkRittenTable,
  wagenparkSyncLogTable,
  wagenparkAvgLogboekTable,
  wagenparkMeldingenTable,
  documentenTable,
  documentKoppelingenTable,
  documentsoortenTable,
  gebruikersTable,
} from "@workspace/db/schema";
import {
  eq, and, desc, isNull, isNotNull, gte, lte, sql,
} from "drizzle-orm";
import multer from "multer";
import { requireBevoegdheid, requireAuth } from "../middlewares/auth.js";
import { effectieveContext } from "../utils/rol";
import { voerWagenparkSyncUit } from "../lib/wagenparkSync";
import { getFleetProvider } from "../lib/fleet-provider/index.js";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { scanBestandBytes, haalScanStatusOpVoorPad } from "../services/security-intake-engine";
import { Readable } from "node:stream";
import brandstofImportRouter from "./brandstof-import.js";

const router = Router();
const wagenparkStorage = new ObjectStorageService();
const uploadVoertuigDoc = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const lezen    = requireBevoegdheid("wagenpark", 1);
const schrijven = requireBevoegdheid("wagenpark", 2);
const aanmaken  = requireBevoegdheid("wagenpark", 3);
const beheer    = requireBevoegdheid("wagenpark", 4);

// ── Helpers ────────────────────────────────────────────────────────────────

const PRIVACY_TEKST =
  "Deze module gebruikt voertuigdata voor wagenparkbeheer, onderhoud, veiligheid, " +
  "planning en administratie. De data is niet bedoeld voor continue personeelscontrole " +
  "of beoordeling van individuele medewerkers.";

function berekenAandachtNodig(v: {
  apkDatum: Date | null;
  onderhoudsIntervalKm: number | null;
  onderhoudsIntervalDag: number | null;
  llaatstOnderhoudKm: number | null;
  llaatsteOnderhoudDatum: Date | null;
  kmStand: number;
  verzekeringVervalDat: Date | null;
  leaseEindDatum: Date | null;
  status: string;
}): boolean {
  const nu    = new Date();
  const over30 = new Date(nu.getTime() + 30 * 86_400_000);
  const over60 = new Date(nu.getTime() + 60 * 86_400_000);

  if (v.status === "in_onderhoud" || v.status === "beschadigd") return true;
  if (v.apkDatum && v.apkDatum < over30) return true;
  if (v.verzekeringVervalDat && v.verzekeringVervalDat < over60) return true;
  if (v.leaseEindDatum && v.leaseEindDatum < over60) return true;

  if (v.onderhoudsIntervalKm && v.llaatstOnderhoudKm) {
    const kmSindsOnderhoud = v.kmStand - v.llaatstOnderhoudKm;
    if (kmSindsOnderhoud >= v.onderhoudsIntervalKm - 1000) return true;
  }
  if (v.onderhoudsIntervalDag && v.llaatsteOnderhoudDatum) {
    const dagSindsOnderhoud = (nu.getTime() - v.llaatsteOnderhoudDatum.getTime()) / 86_400_000;
    if (dagSindsOnderhoud >= v.onderhoudsIntervalDag - 14) return true;
  }

  return false;
}

function mapVoertuigSamenvatting(v: typeof voertuigenTable.$inferSelect) {
  return {
    id:                       v.id,
    kenteken:                 v.kenteken,
    merk:                     v.merk,
    type:                     v.type,
    bouwjaar:                 v.bouwjaar ?? null,
    kleur:                    v.kleur ?? null,
    status:                   v.status,
    km_stand:                 v.kmStand,
    apk_datum:                v.apkDatum?.toISOString() ?? null,
    verzekering_verval_dat:   v.verzekeringVervalDat?.toISOString() ?? null,
    lease_eind_datum:         v.leaseEindDatum?.toISOString() ?? null,
    leasemaatschappij:        v.leasemaatschappij ?? null,
    eigendoms_type:           v.eigendomsType,
    bandenwissels_status:     v.bandenwisselStatus,
    fleet_provider:           v.fleetProvider ?? null,
    provider_voertuig_id:     v.providerVoertuigId ?? null,
    aandrijving:              v.aandrijving,
    garage_naam:              v.garageNaam ?? null,
    garage_email:             v.garageEmail ?? null,
    rdw_opgehaald_op:         v.rdwOpgehaaldOp?.toISOString() ?? null,
    aandacht_nodig:           berekenAandachtNodig(v),
    bijgewerkt_op:            v.bijgewerktOp.toISOString(),
  };
}

function mapVoertuig(
  v: typeof voertuigenTable.$inferSelect,
  chauffeurNaam?: string | null,
) {
  return {
    ...mapVoertuigSamenvatting(v),
    chassisnummer:              v.chassisnummer ?? null,
    km_stand_datum:             v.kmStandDatum?.toISOString() ?? null,
    onderhouds_interval_km:     v.onderhoudsIntervalKm ?? null,
    onderhouds_interval_dag:    v.onderhoudsIntervalDag ?? null,
    llaatst_onderhoud_km:       v.llaatstOnderhoudKm ?? null,
    llaatste_onderhoud_datum:   v.llaatsteOnderhoudDatum?.toISOString() ?? null,
    verzekeraar_naam:           v.verzekeraarNaam ?? null,
    verzekering_polisnr:        v.verzekeringPolisnr ?? null,
    verzekering_verval_dat:     v.verzekeringVervalDat?.toISOString() ?? null,
    leasemaatschappij:          v.leasemaatschappij ?? null,
    lease_eind_datum:           v.leaseEindDatum?.toISOString() ?? null,
    lease_km_jaarlijks:         v.leaseKmJaarlijks ?? null,
    chauffeur_id:               v.chauffeurId ?? null,
    chauffeur_naam:             chauffeurNaam ?? null,
    werkgever_id:               v.werkgeverId ?? null,
    opmerkingen:                v.opmerkingen ?? null,
    gearchiveerd:               v.gearchiveerd,
    aangemaakt_op:              v.aangemaaktOp.toISOString(),
  };
}

function mapOnderhoud(o: typeof wagenparkOnderhoudTable.$inferSelect) {
  return {
    id:                   o.id,
    voertuig_id:          o.voertuigId,
    type:                 o.type,
    omschrijving:         o.omschrijving,
    status:               o.status,
    prioriteit:           o.prioriteit,
    km_stand_bij_melding: o.kmStandBijMelding ?? null,
    gepland_datum:        o.geplandDatum?.toISOString() ?? null,
    afgerond_datum:       o.afgerondDatum?.toISOString() ?? null,
    kosten:               o.kosten ?? null,
    leverancier:          o.leverancier ?? null,
    is_ai_voorstel:       o.isAiVoorstel,
    ai_reden:             o.aiReden ?? null,
    geaccordeerd:         o.geaccordeerd,
    gemeld_door_id:       o.gemeldDoorId ?? null,
    aangemaakt_op:        o.aangemaaktOp.toISOString(),
    bijgewerkt_op:        o.bijgewerktOp.toISOString(),
  };
}

function mapKosten(k: typeof wagenparkKostenTable.$inferSelect) {
  return {
    id:             k.id,
    voertuig_id:    k.voertuigId,
    categorie:      k.categorie,
    bedrag:         k.bedrag,
    datum:          k.datum.toISOString(),
    omschrijving:   k.omschrijving ?? null,
    leverancier:    k.leverancier ?? null,
    factuur_nummer: k.factuurNummer ?? null,
    km_stand:       k.kmStand ?? null,
    project_id:     k.projectId ?? null,
    aangemaakt_op:  k.aangemaaktOp.toISOString(),
  };
}

function mapRit(r: typeof wagenparkRittenTable.$inferSelect) {
  return {
    id:                r.id,
    voertuig_id:       r.voertuigId,
    start_datum:       r.startDatum.toISOString(),
    eind_datum:        r.eindDatum?.toISOString() ?? null,
    km_start:          r.kmStart ?? null,
    km_eind:           r.kmEind ?? null,
    afstand_km:        r.afstandKm ?? null,
    vertrek_adres:     r.vertrekAdres ?? null,
    bestemming_adres:  r.bestemmingAdres ?? null,
    doel:              r.doel ?? null,
    project_id:        r.projectId ?? null,
    provider_rit_id:   r.providerRitId ?? null,
    bron:              r.bron,
    aangemaakt_op:     r.aangemaaktOp.toISOString(),
  };
}

function mapSyncLog(s: typeof wagenparkSyncLogTable.$inferSelect) {
  return {
    id:                s.id,
    provider:          s.provider,
    status:            s.status,
    aantal_bijgewerkt: s.aantalBijgewerkt,
    aantal_fouten:     s.aantalFouten,
    foutmelding:       s.foutmelding ?? null,
    gestart_op:        s.gestartOp.toISOString(),
    voltooid_op:       s.voltooIdOp?.toISOString() ?? null,
  };
}

async function logAvg(
  actie: string,
  voertuigId: number | null,
  gebruikerId: number | null,
  reden: string,
  datatype: string,
) {
  await db.insert(wagenparkAvgLogboekTable).values({
    actie, voertuigId, gebruikerId, reden, datatype,
    bewaartermijn: "5 jaar (standaard wagenparkbeheer)",
  });
}

// ══════════════════════════════════════════════════════════
// Voertuigen
// ══════════════════════════════════════════════════════════

router.get("/voertuigen", lezen, async (req, res): Promise<void> => {
  const gearchiveerd = req.query["gearchiveerd"] === "true";
  const statusFilter = req.query["status"] as string | undefined;

  const rijen = await db
    .select()
    .from(voertuigenTable)
    .where(
      and(
        eq(voertuigenTable.gearchiveerd, gearchiveerd),
        statusFilter ? eq(voertuigenTable.status, statusFilter) : undefined,
      ),
    )
    .orderBy(voertuigenTable.kenteken);

  res.json(rijen.map(mapVoertuigSamenvatting));
});

router.post("/voertuigen", aanmaken, async (req, res): Promise<void> => {
  const body = req.body;

  const [rij] = await db.insert(voertuigenTable).values({
    kenteken:             body.kenteken,
    merk:                 body.merk,
    type:                 body.type,
    bouwjaar:             body.bouwjaar ?? null,
    kleur:                body.kleur ?? null,
    chassisnummer:        body.chassisnummer ?? null,
    kmStand:              body.km_stand ?? 0,
    apkDatum:             body.apk_datum ? new Date(body.apk_datum) : null,
    onderhoudsIntervalKm: body.onderhouds_interval_km ?? null,
    onderhoudsIntervalDag: body.onderhouds_interval_dag ?? null,
    bandenwisselStatus:   body.bandenwissels_status ?? "geen_actie",
    eigendomsType:        body.eigendoms_type ?? "eigendom",
    leasemaatschappij:    body.leasemaatschappij ?? null,
    leaseEindDatum:       body.lease_eind_datum ? new Date(body.lease_eind_datum) : null,
    leaseKmJaarlijks:     body.lease_km_jaarlijks ?? null,
    verzekeraarNaam:      body.verzekeraar_naam ?? null,
    verzekeringPolisnr:   body.verzekering_polisnr ?? null,
    verzekeringVervalDat: body.verzekering_verval_dat ? new Date(body.verzekering_verval_dat) : null,
    chauffeurId:          body.chauffeur_id ?? null,
    providerVoertuigId:   body.provider_voertuig_id ?? null,
    fleetProvider:        body.fleet_provider ?? null,
    werkgeverId:          body.werkgever_id ?? null,
    status:               body.status ?? "actief",
    aandrijving:          body.aandrijving ?? "diesel",
    garageNaam:           body.garage_naam ?? null,
    garageEmail:          body.garage_email ?? null,
    rdwOpgehaaldOp:       body.rdw_opgehaald_op ? new Date(body.rdw_opgehaald_op) : null,
    opmerkingen:          body.opmerkingen ?? null,
    bijgewerktOp:         new Date(),
  }).returning();

  res.status(201).json(mapVoertuig(rij));
});

router.get("/voertuigen/:id", lezen, async (req, res): Promise<void> => {
  const id = Number(req.params["id"]);
  if (isNaN(id)) return void res.status(400).json({ fout: "Ongeldig ID" });

  const [rij] = await db.select().from(voertuigenTable).where(eq(voertuigenTable.id, id));
  if (!rij) return void res.status(404).json({ fout: "Niet gevonden" });

  let chauffeurNaam: string | null = null;
  if (rij.chauffeurId) {
    const [geb] = await db.select({ naam: gebruikersTable.naam }).from(gebruikersTable)
      .where(eq(gebruikersTable.id, rij.chauffeurId));
    chauffeurNaam = geb?.naam ?? null;
  }

  // AVG-log: inzage voertuigdetail
  await logAvg("inzage", id, req.session?.["userId"] ?? null, "voertuigdetail bekeken", "basisdata");

  res.json(mapVoertuig(rij, chauffeurNaam));
});

router.patch("/voertuigen/:id", schrijven, async (req, res): Promise<void> => {
  const id = Number(req.params["id"]);
  if (isNaN(id)) return void res.status(400).json({ fout: "Ongeldig ID" });

  const body = req.body;
  const patch: Partial<typeof voertuigenTable.$inferInsert> = { bijgewerktOp: new Date() };

  if (body.kenteken  !== undefined) patch.kenteken  = body.kenteken;
  if (body.merk      !== undefined) patch.merk      = body.merk;
  if (body.type      !== undefined) patch.type      = body.type;
  if (body.bouwjaar  !== undefined) patch.bouwjaar  = body.bouwjaar;
  if (body.kleur     !== undefined) patch.kleur     = body.kleur;
  if (body.chassisnummer !== undefined) patch.chassisnummer = body.chassisnummer;
  if (body.km_stand  !== undefined) {
    patch.kmStand     = body.km_stand;
    patch.kmStandDatum = new Date();
  }
  if (body.apk_datum              !== undefined) patch.apkDatum             = body.apk_datum ? new Date(body.apk_datum) : null;
  if (body.onderhouds_interval_km !== undefined) patch.onderhoudsIntervalKm = body.onderhouds_interval_km;
  if (body.onderhouds_interval_dag !== undefined) patch.onderhoudsIntervalDag = body.onderhouds_interval_dag;
  if (body.bandenwissels_status   !== undefined) patch.bandenwisselStatus   = body.bandenwissels_status;
  if (body.eigendoms_type         !== undefined) patch.eigendomsType        = body.eigendoms_type;
  if (body.leasemaatschappij      !== undefined) patch.leasemaatschappij    = body.leasemaatschappij;
  if (body.lease_eind_datum       !== undefined) patch.leaseEindDatum       = body.lease_eind_datum ? new Date(body.lease_eind_datum) : null;
  if (body.lease_km_jaarlijks     !== undefined) patch.leaseKmJaarlijks     = body.lease_km_jaarlijks;
  if (body.verzekeraar_naam       !== undefined) patch.verzekeraarNaam      = body.verzekeraar_naam;
  if (body.verzekering_polisnr    !== undefined) patch.verzekeringPolisnr   = body.verzekering_polisnr;
  if (body.verzekering_verval_dat !== undefined) patch.verzekeringVervalDat = body.verzekering_verval_dat ? new Date(body.verzekering_verval_dat) : null;
  if (body.chauffeur_id           !== undefined) patch.chauffeurId          = body.chauffeur_id;
  if (body.provider_voertuig_id   !== undefined) patch.providerVoertuigId   = body.provider_voertuig_id;
  if (body.fleet_provider         !== undefined) patch.fleetProvider        = body.fleet_provider;
  if (body.werkgever_id           !== undefined) patch.werkgeverId          = body.werkgever_id;
  if (body.status                 !== undefined) patch.status               = body.status;
  if (body.aandrijving            !== undefined) patch.aandrijving          = body.aandrijving;
  if (body.garage_naam            !== undefined) patch.garageNaam           = body.garage_naam;
  if (body.garage_email           !== undefined) patch.garageEmail          = body.garage_email;
  if (body.rdw_opgehaald_op       !== undefined) patch.rdwOpgehaaldOp       = body.rdw_opgehaald_op ? new Date(body.rdw_opgehaald_op) : null;
  if (body.opmerkingen            !== undefined) patch.opmerkingen          = body.opmerkingen;

  const [bijgewerkt] = await db.update(voertuigenTable)
    .set(patch)
    .where(eq(voertuigenTable.id, id))
    .returning();

  if (!bijgewerkt) return void res.status(404).json({ fout: "Niet gevonden" });
  res.json(mapVoertuig(bijgewerkt));
});

router.delete("/voertuigen/:id", beheer, async (req, res): Promise<void> => {
  const id = Number(req.params["id"]);
  if (isNaN(id)) return void res.status(400).json({ fout: "Ongeldig ID" });

  const [bijgewerkt] = await db.update(voertuigenTable)
    .set({ gearchiveerd: true, bijgewerktOp: new Date() })
    .where(eq(voertuigenTable.id, id))
    .returning();

  if (!bijgewerkt) return void res.status(404).json({ fout: "Niet gevonden" });
  res.status(204).end();
});

// ══════════════════════════════════════════════════════════
// Onderhoud
// ══════════════════════════════════════════════════════════

router.get("/voertuigen/:id/onderhoud", lezen, async (req, res): Promise<void> => {
  const voertuigId = Number(req.params["id"]);
  if (isNaN(voertuigId)) return void res.status(400).json({ fout: "Ongeldig ID" });

  const rijen = await db
    .select()
    .from(wagenparkOnderhoudTable)
    .where(eq(wagenparkOnderhoudTable.voertuigId, voertuigId))
    .orderBy(desc(wagenparkOnderhoudTable.aangemaaktOp));

  res.json(rijen.map(mapOnderhoud));
});

router.post("/voertuigen/:id/onderhoud", schrijven, async (req, res): Promise<void> => {
  const voertuigId = Number(req.params["id"]);
  if (isNaN(voertuigId)) return void res.status(400).json({ fout: "Ongeldig ID" });

  const body = req.body;
  const [rij] = await db.insert(wagenparkOnderhoudTable).values({
    voertuigId,
    type:                body.type,
    omschrijving:        body.omschrijving,
    status:              body.status ?? "open",
    prioriteit:          body.prioriteit ?? "normaal",
    kmStandBijMelding:   body.km_stand_bij_melding ?? null,
    geplandDatum:        body.gepland_datum ? new Date(body.gepland_datum) : null,
    kosten:              body.kosten ?? null,
    leverancier:         body.leverancier ?? null,
    isAiVoorstel:        body.is_ai_voorstel ?? false,
    aiReden:             body.ai_reden ?? null,
    geaccordeerd:        body.geaccordeerd ?? false,
    gemeldDoorId:        req.session?.["userId"] ?? null,
    bijgewerktOp:        new Date(),
  }).returning();

  res.status(201).json(mapOnderhoud(rij));
});

router.patch("/voertuigen/:id/onderhoud/:onderhoudId", schrijven, async (req, res): Promise<void> => {
  const voertuigId   = Number(req.params["id"]);
  const onderhoudId  = Number(req.params["onderhoudId"]);
  if (isNaN(voertuigId) || isNaN(onderhoudId)) return void res.status(400).json({ fout: "Ongeldig ID" });

  const body = req.body;
  const patch: Partial<typeof wagenparkOnderhoudTable.$inferInsert> = { bijgewerktOp: new Date() };

  if (body.status        !== undefined) patch.status      = body.status;
  if (body.prioriteit    !== undefined) patch.prioriteit  = body.prioriteit;
  if (body.omschrijving  !== undefined) patch.omschrijving = body.omschrijving;
  if (body.gepland_datum !== undefined) patch.geplandDatum = body.gepland_datum ? new Date(body.gepland_datum) : null;
  if (body.afgerond_datum !== undefined) patch.afgerondDatum = body.afgerond_datum ? new Date(body.afgerond_datum) : null;
  if (body.kosten        !== undefined) patch.kosten      = body.kosten;
  if (body.leverancier   !== undefined) patch.leverancier = body.leverancier;
  if (body.geaccordeerd  !== undefined) patch.geaccordeerd = body.geaccordeerd;

  const [bijgewerkt] = await db.update(wagenparkOnderhoudTable)
    .set(patch)
    .where(and(
      eq(wagenparkOnderhoudTable.id, onderhoudId),
      eq(wagenparkOnderhoudTable.voertuigId, voertuigId),
    ))
    .returning();

  if (!bijgewerkt) return void res.status(404).json({ fout: "Niet gevonden" });
  res.json(mapOnderhoud(bijgewerkt));
});

// ══════════════════════════════════════════════════════════
// Kosten
// ══════════════════════════════════════════════════════════

router.get("/voertuigen/:id/kosten", lezen, async (req, res): Promise<void> => {
  const voertuigId = Number(req.params["id"]);
  if (isNaN(voertuigId)) return void res.status(400).json({ fout: "Ongeldig ID" });

  const rijen = await db
    .select()
    .from(wagenparkKostenTable)
    .where(eq(wagenparkKostenTable.voertuigId, voertuigId))
    .orderBy(desc(wagenparkKostenTable.datum));

  res.json(rijen.map(mapKosten));
});

router.post("/voertuigen/:id/kosten", schrijven, async (req, res): Promise<void> => {
  const voertuigId = Number(req.params["id"]);
  if (isNaN(voertuigId)) return void res.status(400).json({ fout: "Ongeldig ID" });

  const body = req.body;
  const [rij] = await db.insert(wagenparkKostenTable).values({
    voertuigId,
    categorie:     body.categorie,
    bedrag:        body.bedrag,
    datum:         new Date(body.datum),
    omschrijving:  body.omschrijving ?? null,
    leverancier:   body.leverancier ?? null,
    factuurNummer: body.factuur_nummer ?? null,
    kmStand:       body.km_stand ?? null,
    projectId:     body.project_id ?? null,
    aangemaaktDoorId: req.session?.["userId"] ?? null,
  }).returning();

  res.status(201).json(mapKosten(rij));
});

// ══════════════════════════════════════════════════════════
// Ritten
// ══════════════════════════════════════════════════════════

router.get("/voertuigen/:id/ritten", lezen, async (req, res): Promise<void> => {
  const voertuigId = Number(req.params["id"]);
  if (isNaN(voertuigId)) return void res.status(400).json({ fout: "Ongeldig ID" });

  const rijen = await db
    .select()
    .from(wagenparkRittenTable)
    .where(eq(wagenparkRittenTable.voertuigId, voertuigId))
    .orderBy(desc(wagenparkRittenTable.startDatum))
    .limit(500);

  // AVG-log: rittenhistorie geraadpleegd
  const userId = req.session?.["userId"] ?? null;
  await logAvg("inzage", voertuigId, userId, "rittenhistorie bekeken", "ritten");

  res.json(rijen.map(mapRit));
});

// ══════════════════════════════════════════════════════════
// Traxgo Synchronisatie
// ══════════════════════════════════════════════════════════

router.post("/sync", beheer, async (req, res): Promise<void> => {
  const userId = req.session?.["userId"] ?? null;

  // Non-blocking sync: direct de log-rij teruggeven, sync op de achtergrond.
  // De daadwerkelijke sync is gedeeld met de dagelijkse automatische draai
  // (lib/wagenparkSync.ts) — één implementatie, twee ingangen.
  const provider = getFleetProvider();
  const [logRij] = await db.insert(wagenparkSyncLogTable).values({
    provider: provider.naam,
    status:   "gestart",
    gestartDoorId: userId,
  }).returning();

  setImmediate(async () => {
    try {
      await voerWagenparkSyncUit(userId, logRij.id);
    } catch (err) {
      req.log.error({ err }, "handmatige wagenpark-sync mislukt");
    }
  });

  res.json(mapSyncLog(logRij));
});

router.get("/sync/logs", lezen, async (req, res): Promise<void> => {
  const limit = Math.min(Number(req.query["limit"]) || 50, 200);

  const rijen = await db
    .select()
    .from(wagenparkSyncLogTable)
    .orderBy(desc(wagenparkSyncLogTable.gestartOp))
    .limit(limit);

  res.json(rijen.map(mapSyncLog));
});

// ══════════════════════════════════════════════════════════
// AI-advies (concept — mens accordeert altijd)
// ══════════════════════════════════════════════════════════

router.get("/ai-advies", lezen, async (req, res): Promise<void> => {
  // Haal alle actieve voertuigen op met hun laatste onderhoud en kosten
  const voertuigen = await db
    .select()
    .from(voertuigenTable)
    .where(eq(voertuigenTable.gearchiveerd, false));

  const adviezen: {
    voertuig_id: number;
    kenteken: string;
    type: string;
    advies: string;
    prioriteit: string;
    reden: string | null;
    onderhoud_id: number | null;
  }[] = [];

  for (const v of voertuigen) {
    const nu     = new Date();
    const over14 = new Date(nu.getTime() + 14 * 86_400_000);
    const over30 = new Date(nu.getTime() + 30 * 86_400_000);

    // APK-signalering
    if (v.apkDatum && v.apkDatum < over30) {
      const dagRestant = Math.round((v.apkDatum.getTime() - nu.getTime()) / 86_400_000);
      adviezen.push({
        voertuig_id: v.id,
        kenteken:    v.kenteken,
        type:        "apk",
        advies:      `APK verloopt over ${dagRestant} dag(en) — plan tijdig een keuring`,
        prioriteit:  dagRestant <= 7 ? "urgent" : dagRestant <= 14 ? "hoog" : "normaal",
        reden:       `APK-datum: ${v.apkDatum.toLocaleDateString("nl-NL")}`,
        onderhoud_id: null,
      });
    }

    // Onderhoud op km-basis
    if (v.onderhoudsIntervalKm && v.llaatstOnderhoudKm) {
      const kmSinds = v.kmStand - v.llaatstOnderhoudKm;
      const kmRest  = v.onderhoudsIntervalKm - kmSinds;
      if (kmRest <= 2000) {
        adviezen.push({
          voertuig_id: v.id,
          kenteken:    v.kenteken,
          type:        "onderhoud",
          advies:      `Onderhoud bijna nodig: nog ${Math.max(0, kmRest).toLocaleString()} km`,
          prioriteit:  kmRest <= 500 ? "urgent" : kmRest <= 1000 ? "hoog" : "normaal",
          reden:       `Laatste onderhoud op ${v.llaatstOnderhoudKm?.toLocaleString()} km, interval ${v.onderhoudsIntervalKm.toLocaleString()} km`,
          onderhoud_id: null,
        });
      }
    }

    // Verzekering verloopt binnenkort
    if (v.verzekeringVervalDat && v.verzekeringVervalDat < over30) {
      adviezen.push({
        voertuig_id: v.id,
        kenteken:    v.kenteken,
        type:        "verzekering",
        advies:      "Verzekering verloopt binnenkort — verleng of vervang",
        prioriteit:  "hoog",
        reden:       `Vervaldatum: ${v.verzekeringVervalDat.toLocaleDateString("nl-NL")}`,
        onderhoud_id: null,
      });
    }

    // Lease eindigt binnenkort
    if (v.leaseEindDatum && v.leaseEindDatum < over30) {
      adviezen.push({
        voertuig_id: v.id,
        kenteken:    v.kenteken,
        type:        "lease",
        advies:      "Leasecontract loopt binnenkort af — neem contact op met leasemaatschappij",
        prioriteit:  "hoog",
        reden:       `Einddatum: ${v.leaseEindDatum.toLocaleDateString("nl-NL")}`,
        onderhoud_id: null,
      });
    }

    // Bandenwissels
    if (v.bandenwisselStatus === "plannen") {
      adviezen.push({
        voertuig_id: v.id,
        kenteken:    v.kenteken,
        type:        "bandenwissel",
        advies:      "Bandenwissel staat gepland — plan werkplaatsafspraak",
        prioriteit:  "normaal",
        reden:       null,
        onderhoud_id: null,
      });
    }
  }

  // Sorteer op prioriteit
  const volgorde = { urgent: 0, hoog: 1, normaal: 2, laag: 3 };
  adviezen.sort((a, b) => (volgorde[a.prioriteit as keyof typeof volgorde] ?? 9)
    - (volgorde[b.prioriteit as keyof typeof volgorde] ?? 9));

  res.json(adviezen);
});

// ══════════════════════════════════════════════════════════
// AVG-logboek
// ══════════════════════════════════════════════════════════

router.get("/avg-logboek", beheer, async (req, res): Promise<void> => {
  const van = req.query["van"] ? new Date(req.query["van"] as string) : null;
  const tot = req.query["tot"] ? new Date(req.query["tot"] as string) : null;

  const rijen = await db
    .select({
      id:              wagenparkAvgLogboekTable.id,
      datum:           wagenparkAvgLogboekTable.datum,
      actie:           wagenparkAvgLogboekTable.actie,
      voertuig_id:     wagenparkAvgLogboekTable.voertuigId,
      kenteken:        voertuigenTable.kenteken,
      gebruiker_id:    wagenparkAvgLogboekTable.gebruikerId,
      gebruiker_naam:  gebruikersTable.naam,
      reden:           wagenparkAvgLogboekTable.reden,
      datatype:        wagenparkAvgLogboekTable.datatype,
      bewaartermijn:   wagenparkAvgLogboekTable.bewaartermijn,
      bijzonderheden:  wagenparkAvgLogboekTable.bijzonderheden,
    })
    .from(wagenparkAvgLogboekTable)
    .leftJoin(voertuigenTable,  eq(wagenparkAvgLogboekTable.voertuigId,  voertuigenTable.id))
    .leftJoin(gebruikersTable,  eq(wagenparkAvgLogboekTable.gebruikerId, gebruikersTable.id))
    .where(
      and(
        van ? gte(wagenparkAvgLogboekTable.datum, van) : undefined,
        tot ? lte(wagenparkAvgLogboekTable.datum, tot) : undefined,
      ),
    )
    .orderBy(desc(wagenparkAvgLogboekTable.datum))
    .limit(500);

  res.json(
    rijen.map((r) => ({
      id:             r.id,
      datum:          r.datum.toISOString(),
      actie:          r.actie,
      voertuig_id:    r.voertuig_id ?? null,
      kenteken:       r.kenteken ?? null,
      gebruiker_id:   r.gebruiker_id ?? null,
      gebruiker_naam: r.gebruiker_naam ?? null,
      reden:          r.reden ?? null,
      datatype:       r.datatype ?? null,
      bewaartermijn:  r.bewaartermijn ?? null,
      bijzonderheden: r.bijzonderheden ?? null,
    })),
  );
});

// ══════════════════════════════════════════════════════════
// Mijn auto (WAGENPARK_01 §3) — server-side afgedwongen op chauffeur_id.
// Bewust géén wagenpark-modulerecht: een monteur ziet uitsluitend zijn eigen
// auto en eigen meldingen, nooit het wagenpark, kosten of ritten.
// ══════════════════════════════════════════════════════════

router.get("/mijn-auto", requireAuth, async (req, res): Promise<void> => {
  const userId = (await effectieveContext(req)).userId;
  if (!userId) return void res.status(401).json({ error: "Niet ingelogd" });

  const [v] = await db
    .select()
    .from(voertuigenTable)
    .where(and(eq(voertuigenTable.chauffeurId, userId), eq(voertuigenTable.gearchiveerd, false)))
    .limit(1);

  if (!v) return void res.json({ voertuig: null, meldingen: [] });

  // Eigen meldingen op dit voertuig (incl. doorgezet naar garage) — nooit die van anderen.
  const meldingen = await db
    .select({
      id: wagenparkMeldingenTable.id,
      type: wagenparkMeldingenTable.type,
      omschrijving: wagenparkMeldingenTable.omschrijving,
      status: wagenparkMeldingenTable.status,
      aangemaaktOp: wagenparkMeldingenTable.aangemaaktOp,
    })
    .from(wagenparkMeldingenTable)
    .where(and(
      eq(wagenparkMeldingenTable.voertuigId, v.id),
      eq(wagenparkMeldingenTable.gemeldDoorId, userId),
    ))
    .orderBy(desc(wagenparkMeldingenTable.aangemaaktOp))
    .limit(50);

  // Eerstvolgend onderhoud: op km of datum, wat het eerst komt (indicatief).
  const volgendOnderhoudKm = (v.onderhoudsIntervalKm && v.llaatstOnderhoudKm != null)
    ? v.llaatstOnderhoudKm + v.onderhoudsIntervalKm
    : null;
  const volgendOnderhoudDatum = (v.onderhoudsIntervalDag && v.llaatsteOnderhoudDatum)
    ? new Date(v.llaatsteOnderhoudDatum.getTime() + v.onderhoudsIntervalDag * 86_400_000)
    : null;

  res.json({
    voertuig: {
      id: v.id,
      kenteken: v.kenteken,
      merk: v.merk,
      type: v.type,
      bouwjaar: v.bouwjaar ?? null,
      kleur: v.kleur ?? null,
      aandrijving: v.aandrijving,
      km_stand: v.kmStand,
      km_stand_datum: v.kmStandDatum?.toISOString() ?? null,
      apk_datum: v.apkDatum?.toISOString() ?? null,
      onderhouds_interval_km: v.onderhoudsIntervalKm ?? null,
      onderhouds_interval_dag: v.onderhoudsIntervalDag ?? null,
      llaatst_onderhoud_km: v.llaatstOnderhoudKm ?? null,
      llaatste_onderhoud_datum: v.llaatsteOnderhoudDatum?.toISOString() ?? null,
      volgend_onderhoud_km: volgendOnderhoudKm,
      volgend_onderhoud_datum: volgendOnderhoudDatum?.toISOString() ?? null,
    },
    meldingen: meldingen.map((m) => ({
      id: m.id,
      type: m.type,
      omschrijving: m.omschrijving,
      status: m.status,
      aangemaakt_op: m.aangemaaktOp.toISOString(),
    })),
  });
});

// ══════════════════════════════════════════════════════════
// RDW open data (WAGENPARK_01 §6.2) — invulhulp, geen waarheid.
// Aanmaken mag hier nooit op stuklopen: bij fouten gevonden=false.
// ══════════════════════════════════════════════════════════

router.get("/rdw/:kenteken", aanmaken, async (req, res): Promise<void> => {
  const ruw = String(req.params["kenteken"] ?? "");
  const kenteken = ruw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!kenteken || kenteken.length < 4 || kenteken.length > 8) {
    return void res.status(400).json({ fout: "Ongeldig kenteken" });
  }

  const leeg = { gevonden: false, kenteken, merk: null, handelsbenaming: null, voertuigsoort: null, kleur: null, datum_eerste_toelating: null, apk_vervaldatum: null };
  try {
    const url = `https://opendata.rdw.nl/resource/m9d7-ebf2.json?kenteken=${encodeURIComponent(kenteken)}`;
    const antwoord = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!antwoord.ok) {
      return void res.json({ ...leeg, foutmelding: "RDW is momenteel niet bereikbaar — vul de gegevens handmatig in" });
    }
    const data = (await antwoord.json()) as Array<Record<string, string>>;
    const rij = data?.[0];
    if (!rij) return void res.json({ ...leeg, foutmelding: null });

    // RDW-datums zijn "YYYYMMDD" of ISO; normaliseer naar YYYY-MM-DD.
    const naarDatum = (d?: string) => {
      if (!d) return null;
      const enkel = d.slice(0, 10).replace(/-/g, "").slice(0, 8);
      return /^\d{8}$/.test(enkel) ? `${enkel.slice(0, 4)}-${enkel.slice(4, 6)}-${enkel.slice(6, 8)}` : null;
    };

    res.json({
      gevonden: true,
      kenteken,
      merk: rij["merk"] ?? null,
      handelsbenaming: rij["handelsbenaming"] ?? null,
      voertuigsoort: rij["voertuigsoort"] ?? null,
      kleur: rij["eerste_kleur"] ?? null,
      datum_eerste_toelating: naarDatum(rij["datum_eerste_toelating"]),
      apk_vervaldatum: naarDatum(rij["vervaldatum_apk"]),
      foutmelding: null,
    });
  } catch (err) {
    req.log.warn({ err, kenteken }, "RDW-lookup mislukt");
    res.json({ ...leeg, foutmelding: "RDW-gegevens ophalen mislukt — vul de gegevens handmatig in" });
  }
});

// ══════════════════════════════════════════════════════════
// Kostenoverzicht per auto per jaar (WAGENPARK_01 §7)
// ══════════════════════════════════════════════════════════

router.get("/voertuigen/:id/kosten-overzicht", lezen, async (req, res): Promise<void> => {
  const voertuigId = Number(req.params["id"]);
  if (isNaN(voertuigId)) return void res.status(400).json({ fout: "Ongeldig ID" });

  const [voertuig] = await db.select({ id: voertuigenTable.id }).from(voertuigenTable)
    .where(eq(voertuigenTable.id, voertuigId));
  if (!voertuig) return void res.status(404).json({ fout: "Niet gevonden" });

  const rijen = await db
    .select({ categorie: wagenparkKostenTable.categorie, bedrag: wagenparkKostenTable.bedrag, datum: wagenparkKostenTable.datum })
    .from(wagenparkKostenTable)
    .where(eq(wagenparkKostenTable.voertuigId, voertuigId));

  const perJaar = new Map<number, { totaal: number; per_categorie: Record<string, number> }>();
  for (const r of rijen) {
    const jaar = r.datum.getFullYear();
    const bucket = perJaar.get(jaar) ?? { totaal: 0, per_categorie: {} };
    bucket.totaal += r.bedrag;
    bucket.per_categorie[r.categorie] = (bucket.per_categorie[r.categorie] ?? 0) + r.bedrag;
    perJaar.set(jaar, bucket);
  }

  res.json(
    [...perJaar.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([jaar, b]) => ({
        jaar,
        totaal: Math.round(b.totaal * 100) / 100,
        per_categorie: Object.fromEntries(Object.entries(b.per_categorie).map(([k, v]) => [k, Math.round(v * 100) / 100])),
      })),
  );
});

// ══════════════════════════════════════════════════════════
// Voertuigdocumenten (WAGENPARK_01 §2) — hergebruikt documenten + document_koppelingen.
// ══════════════════════════════════════════════════════════

async function laadVoertuigDocumenten(voertuigId: number) {
  return db
    .select({
      id: documentenTable.id,
      naam: documentenTable.naam,
      documentsoortId: documentenTable.documentsoortId,
      documentsoortNaam: documentsoortenTable.naam,
      geldigTot: documentenTable.geldigTot,
      pdfUrl: documentenTable.pdfUrl,
      bestandsgrootte: documentenTable.bestandsgrootte,
      aangemaaktOp: documentenTable.aangemaaktOp,
    })
    .from(documentKoppelingenTable)
    .innerJoin(documentenTable, eq(documentenTable.id, documentKoppelingenTable.documentId))
    .leftJoin(documentsoortenTable, eq(documentsoortenTable.id, documentenTable.documentsoortId))
    .where(and(
      eq(documentKoppelingenTable.doelType, "voertuig"),
      eq(documentKoppelingenTable.doelId, voertuigId),
      eq(documentenTable.gearchiveerd, false),
    ))
    .orderBy(desc(documentenTable.aangemaaktOp));
}

function mapVoertuigDocument(d: Awaited<ReturnType<typeof laadVoertuigDocumenten>>[number]) {
  return {
    id: d.id,
    naam: d.naam,
    documentsoort_id: d.documentsoortId ?? null,
    documentsoort_naam: d.documentsoortNaam ?? null,
    geldig_tot: d.geldigTot ?? null,
    pdf_url: d.pdfUrl ?? null,
    bestandsgrootte: d.bestandsgrootte ?? null,
    aangemaakt_op: d.aangemaaktOp.toISOString(),
  };
}

router.get("/voertuigen/:id/documenten", lezen, async (req, res): Promise<void> => {
  const voertuigId = Number(req.params["id"]);
  if (isNaN(voertuigId)) return void res.status(400).json({ fout: "Ongeldig ID" });
  const [voertuig] = await db.select({ id: voertuigenTable.id }).from(voertuigenTable).where(eq(voertuigenTable.id, voertuigId));
  if (!voertuig) return void res.status(404).json({ fout: "Niet gevonden" });
  res.json((await laadVoertuigDocumenten(voertuigId)).map(mapVoertuigDocument));
});

router.post(
  "/voertuigen/:id/documenten",
  schrijven,
  uploadVoertuigDoc.single("bestand"),
  async (req, res): Promise<void> => {
    const voertuigId = Number(req.params["id"]);
    if (isNaN(voertuigId)) return void res.status(400).json({ fout: "Ongeldig ID" });
    const [voertuig] = await db.select({ id: voertuigenTable.id, kenteken: voertuigenTable.kenteken })
      .from(voertuigenTable).where(eq(voertuigenTable.id, voertuigId));
    if (!voertuig) return void res.status(404).json({ fout: "Niet gevonden" });

    const bestand = req.file;
    if (!bestand || !bestand.buffer?.length) return void res.status(400).json({ fout: "bestand is verplicht" });

    const soortId = Number(req.body?.documentsoort_id);
    if (isNaN(soortId)) return void res.status(400).json({ fout: "documentsoort_id is verplicht" });
    const [soort] = await db.select().from(documentsoortenTable)
      .where(and(eq(documentsoortenTable.id, soortId), eq(documentsoortenTable.context, "voertuig")));
    if (!soort) return void res.status(400).json({ fout: "Onbekende documentsoort" });

    let geldigTot: string | null = null;
    if (soort.heeftVervaldatum) {
      const ruw = typeof req.body?.geldig_tot === "string" ? req.body.geldig_tot.trim() : "";
      if (!ruw || isNaN(new Date(ruw).getTime())) {
        return void res.status(400).json({ fout: `Vervaldatum is verplicht voor soort '${soort.naam}'` });
      }
      geldigTot = ruw.slice(0, 10);
    }

    const bestandsnaam = bestand.originalname || "document";
    const veilig = bestandsnaam.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
    const subPath = `wagenpark/voertuig-${voertuigId}/${Date.now()}_${veilig}`;
    const verwachtObjectPad = `/objects/${subPath}`;

    // Scan-first (security intake): bytes scannen VÓÓR opslag; geblokkeerd = niet opslaan.
    // objectPad gaat mee zodat de download-gate (haalScanStatusOpVoorPad) dit record kan matchen.
    try {
      const scan = await scanBestandBytes({
        bytes: bestand.buffer,
        bestandsnaam,
        bestandsgrootte: bestand.buffer.length,
        mimeTypeClaim: bestand.mimetype || undefined,
        objectPad: verwachtObjectPad,
        gebruikerId: req.session?.["userId"] ?? null,
        gebruikerNaam: null,
        uploadBron: "document",
      });
      if (!scan.toegestaan) {
        req.log.warn({ bestandsnaam, risico: scan.risicoNiveau }, "Voertuigdocument geweigerd door beveiligingsscan");
        return void res.status(422).json({ fout: "Dit bestand is geweigerd door de beveiligingsscan." });
      }
    } catch (err) {
      req.log.error({ err }, "Beveiligingsscan mislukt — voertuigdocument geweigerd (fail-closed)");
      return void res.status(503).json({ fout: "De beveiligingsscan is momenteel niet beschikbaar. Het document is niet opgeslagen." });
    }

    // Fail-loud: bij storage-uitval weigeren i.p.v. een dood pad bewaren.
    let pdfUrl: string;
    try {
      pdfUrl = await wagenparkStorage.uploadBestand(subPath, bestand.buffer, bestand.mimetype || "application/octet-stream");
    } catch (err) {
      req.log.error({ err }, "Object storage niet beschikbaar — voertuigdocument geweigerd");
      return void res.status(503).json({ fout: "De bestandsopslag is momenteel niet beschikbaar. Het document is niet opgeslagen." });
    }

    const naam = bestandsnaam.replace(/\.[^.]+$/, "").trim() || bestandsnaam;
    const [doc] = await db.insert(documentenTable).values({
      naam: `${soort.naam} — ${voertuig.kenteken} — ${naam}`.slice(0, 200),
      documenttype: "overig",
      pdfUrl,
      bestandsgrootte: bestand.buffer.length,
      geldigTot,
      documentsoortId: soort.id,
      goedkeuringStatus: "goedgekeurd",
      aiMetadata: { bron: "wagenpark", voertuig_id: voertuigId },
    }).returning();

    await db.insert(documentKoppelingenTable).values({
      documentId: doc.id,
      doelType: "voertuig",
      doelId: voertuigId,
      aangemaaktDoorId: req.session?.["userId"] ?? null,
    }).onConflictDoNothing();

    const [rij] = await laadVoertuigDocumenten(voertuigId).then((r) => r.filter((d) => d.id === doc.id));
    res.status(201).json(rij ? mapVoertuigDocument(rij) : {
      id: doc.id, naam: doc.naam, documentsoort_id: soort.id, documentsoort_naam: soort.naam,
      geldig_tot: geldigTot, pdf_url: pdfUrl, bestandsgrootte: bestand.buffer.length,
      aangemaakt_op: doc.aangemaaktOp.toISOString(),
    });
  },
);

router.delete("/voertuigen/:id/documenten/:documentId", aanmaken, async (req, res): Promise<void> => {
  const voertuigId = Number(req.params["id"]);
  const documentId = Number(req.params["documentId"]);
  if (isNaN(voertuigId) || isNaN(documentId)) return void res.status(400).json({ fout: "Ongeldig ID" });

  const [koppeling] = await db.select({ id: documentKoppelingenTable.id }).from(documentKoppelingenTable)
    .where(and(
      eq(documentKoppelingenTable.documentId, documentId),
      eq(documentKoppelingenTable.doelType, "voertuig"),
      eq(documentKoppelingenTable.doelId, voertuigId),
    ));
  if (!koppeling) return void res.status(404).json({ fout: "Niet gevonden" });

  // Alleen de koppeling met dít voertuig verwijderen; het document zelf pas
  // archiveren als er geen enkele koppeling meer resteert (documenten en
  // document_koppelingen zijn many-to-many — zie review-bevinding data-loss).
  await db.transaction(async (tx) => {
    await tx.delete(documentKoppelingenTable).where(eq(documentKoppelingenTable.id, koppeling.id));
    const rest = await tx.select({ id: documentKoppelingenTable.id }).from(documentKoppelingenTable)
      .where(eq(documentKoppelingenTable.documentId, documentId)).limit(1);
    if (rest.length === 0) {
      await tx.update(documentenTable)
        .set({ gearchiveerd: true, bijgewerktOp: new Date() })
        .where(eq(documentenTable.id, documentId));
    }
  });
  res.status(204).end();
});

// Geautoriseerde download: alléén via deze route (wagenpark niveau 1 + koppeling-check
// + scan-first gate). De generieke /storage-route kent geen voertuig-ACL.
router.get("/voertuigen/:id/documenten/:documentId/download", lezen, async (req, res): Promise<void> => {
  const voertuigId = Number(req.params["id"]);
  const documentId = Number(req.params["documentId"]);
  if (isNaN(voertuigId) || isNaN(documentId)) return void res.status(400).json({ fout: "Ongeldig ID" });

  const [rij] = await db.select({ pdfUrl: documentenTable.pdfUrl, naam: documentenTable.naam })
    .from(documentKoppelingenTable)
    .innerJoin(documentenTable, eq(documentenTable.id, documentKoppelingenTable.documentId))
    .where(and(
      eq(documentKoppelingenTable.documentId, documentId),
      eq(documentKoppelingenTable.doelType, "voertuig"),
      eq(documentKoppelingenTable.doelId, voertuigId),
      eq(documentenTable.gearchiveerd, false),
    ));
  if (!rij?.pdfUrl) return void res.status(404).json({ fout: "Niet gevonden" });

  // Scan-first gate: geblokkeerde bestanden nooit serveren.
  const scanStatus = await haalScanStatusOpVoorPad(rij.pdfUrl).catch(() => null);
  if (scanStatus?.geblokkeerd) {
    return void res.status(403).json({ fout: "Dit bestand is geblokkeerd door de beveiligingsscan." });
  }

  try {
    const objectFile = await wagenparkStorage.getObjectEntityFile(rij.pdfUrl);
    const response = await wagenparkStorage.downloadObject(objectFile);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      Readable.fromWeb(response.body as import("node:stream/web").ReadableStream<Uint8Array>).pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    if (err instanceof ObjectNotFoundError) return void res.status(404).json({ fout: "Bestand niet gevonden in opslag" });
    req.log.error({ err }, "Voertuigdocument serveren mislukt");
    res.status(500).json({ fout: "Bestand kon niet worden opgehaald" });
  }
});

// ── Privacytekst (publiek binnen de module) ──────────────────────────────────
router.get("/privacy-info", lezen, (_req, res) => {
  res.json({ tekst: PRIVACY_TEKST });
});

// ── MKB Brandstof import-adapter ─────────────────────────────────────────────
router.use("/brandstof-import", brandstofImportRouter);

export default router;
