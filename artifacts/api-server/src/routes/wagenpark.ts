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
  wagenparkWerktijdvenstersTable,
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
import { aiGateway, heeftGateway } from "../lib/aiGateway";
import { pasAfstootBeleidToe, type AfstootAdvies } from "../lib/wagenparkAfstootBeleid";
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
// AI-afstootadvies (eigen cijfers eerst — mens beslist, niets automatisch)
// ══════════════════════════════════════════════════════════

function mediaan(waarden: number[]): number | null {
  if (waarden.length === 0) return null;
  const s = [...waarden].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

router.post("/afstoot-advies", schrijven, async (req, res): Promise<void> => {
  if (!heeftGateway()) {
    return void res.status(503).json({ error: "AI-services niet geconfigureerd" });
  }

  const nu = new Date();
  const voertuigen = await db
    .select()
    .from(voertuigenTable)
    .where(and(eq(voertuigenTable.gearchiveerd, false), sql`${voertuigenTable.status} != 'afgestoten'`));

  if (voertuigen.length === 0) {
    return void res.status(422).json({ error: "Geen actieve voertuigen om te beoordelen" });
  }

  // ── Eigen cijfers per voertuig uit kosten- en onderhoudsdata ──
  const kostenRijen = await db
    .select({
      voertuigId: wagenparkKostenTable.voertuigId,
      categorie:  wagenparkKostenTable.categorie,
      bedrag:     wagenparkKostenTable.bedrag,
      datum:      wagenparkKostenTable.datum,
    })
    .from(wagenparkKostenTable);

  const onderhoudRijen = await db
    .select({
      voertuigId:   wagenparkOnderhoudTable.voertuigId,
      status:       wagenparkOnderhoudTable.status,
      kosten:       wagenparkOnderhoudTable.kosten,
      afgerondDatum: wagenparkOnderhoudTable.afgerondDatum,
      aangemaaktOp:  wagenparkOnderhoudTable.aangemaaktOp,
    })
    .from(wagenparkOnderhoudTable);

  interface VoertuigCijfers {
    voertuig_id: number;
    kenteken: string;
    merk: string;
    type: string;
    bouwjaar: number | null;
    leeftijd_jaren: number | null;
    km_stand: number;
    status: string;
    eigendoms_type: string;
    apk_datum: string | null;
    lease_eind_datum: string | null;
    kosten_totaal: number;
    kosten_per_jaar: Record<string, number>;
    kosten_laatste_12m: number;
    onderhoud_laatste_12m: number;
    kosten_per_km_totaal: number | null;
    aantal_onderhoudsmeldingen: number;
    aantal_kostenregels: number;
  }

  const cijfers: VoertuigCijfers[] = voertuigen.map((v) => {
    const eigenKosten = kostenRijen.filter((k) => k.voertuigId === v.id);
    const eigenOnderhoud = onderhoudRijen.filter((o) => o.voertuigId === v.id);
    const grens12m = new Date(nu.getTime() - 365 * 86_400_000);

    // Beide kostenbronnen tellen mee: de kostentabel én bedragen op
    // onderhoudsmeldingen (wagenpark_onderhoud.kosten). Onderhoudskosten
    // worden gedateerd op de afgerond-datum, met de aanmaakdatum als
    // gedocumenteerde terugval wanneer die (nog) ontbreekt.
    const kostenBronnen: { categorie: string; bedrag: number; datum: Date }[] = [
      ...eigenKosten.map((k) => ({ categorie: k.categorie, bedrag: k.bedrag, datum: k.datum })),
      ...eigenOnderhoud
        .filter((o) => o.kosten != null && o.kosten > 0)
        .map((o) => ({ categorie: "onderhoud", bedrag: o.kosten!, datum: o.afgerondDatum ?? o.aangemaaktOp })),
    ];

    const perJaar: Record<string, number> = {};
    let totaal = 0;
    let laatste12m = 0;
    let onderhoud12m = 0;
    for (const k of kostenBronnen) {
      const jaar = String(k.datum.getFullYear());
      perJaar[jaar] = Math.round(((perJaar[jaar] ?? 0) + k.bedrag) * 100) / 100;
      totaal += k.bedrag;
      if (k.datum >= grens12m) {
        laatste12m += k.bedrag;
        if (k.categorie === "onderhoud" || k.categorie === "banden" || k.categorie === "schade") {
          onderhoud12m += k.bedrag;
        }
      }
    }

    const leeftijd = v.bouwjaar ? nu.getFullYear() - v.bouwjaar : null;
    return {
      voertuig_id:      v.id,
      kenteken:         v.kenteken,
      merk:             v.merk,
      type:             v.type,
      bouwjaar:         v.bouwjaar ?? null,
      leeftijd_jaren:   leeftijd,
      km_stand:         v.kmStand,
      status:           v.status,
      eigendoms_type:   v.eigendomsType,
      apk_datum:        v.apkDatum?.toISOString().slice(0, 10) ?? null,
      lease_eind_datum: v.leaseEindDatum?.toISOString().slice(0, 10) ?? null,
      kosten_totaal:    Math.round(totaal * 100) / 100,
      kosten_per_jaar:  perJaar,
      kosten_laatste_12m: Math.round(laatste12m * 100) / 100,
      onderhoud_laatste_12m: Math.round(onderhoud12m * 100) / 100,
      kosten_per_km_totaal: v.kmStand > 0 && totaal > 0
        ? Math.round((totaal / v.kmStand) * 10000) / 10000
        : null,
      aantal_onderhoudsmeldingen: eigenOnderhoud.length,
      // Bewijsregels uit beide bronnen: kostentabel + onderhoudsmeldingen met bedrag.
      aantal_kostenregels: kostenBronnen.length,
    };
  });

  // ── Vlootmedianen (eigen data, geen vaste normen) ──
  const metData = cijfers.filter((c) => c.aantal_kostenregels > 0);
  const vlootmedianen = {
    mediaan_kosten_laatste_12m: mediaan(metData.map((c) => c.kosten_laatste_12m)),
    mediaan_kosten_per_km:      mediaan(metData.map((c) => c.kosten_per_km_totaal).filter((x): x is number => x !== null)),
    mediaan_leeftijd_jaren:     mediaan(cijfers.map((c) => c.leeftijd_jaren).filter((x): x is number => x !== null)),
    mediaan_km_stand:           mediaan(cijfers.map((c) => c.km_stand).filter((x) => x > 0)),
    voertuigen_met_kostendata:  metData.length,
    voertuigen_totaal:          cijfers.length,
  };

  const prompt = `Je bent wagenparkadviseur voor een Nederlands brandpreventiebedrijf.
Beoordeel per voertuig of het aan vervanging of afstoten toe is, UITSLUITEND op basis van de eigen bedrijfscijfers hieronder. Gebruik GEEN algemene vuistregels of vaste normen (zoals "na X jaar vervangen") — toets elk voertuig aan de medianen van dit eigen wagenpark.

Regels:
- Vergelijk elk voertuig met de vlootmedianen (kosten, kosten per km, leeftijd, km-stand).
- Alleen "vervangen" of "afstoten" adviseren als de eigen cijfers dat aantoonbaar onderbouwen (bovengemiddelde kosten, oplopende onderhoudslast, hoge kosten per km).
- Bij te weinig eigen data (weinig kostenregels) zeg je dat expliciet en adviseer je "monitoren" of "behouden" — nooit een oordeel zonder cijfers.
- Onderbouwing verwijst naar concrete bedragen/waarden uit de data, vergeleken met de mediaan.
- Dit is een voorstel; een mens beslist. Geen actietaal alsof het al besloten is.

Vlootmedianen (eigen data):
${JSON.stringify(vlootmedianen)}

Voertuigen (eigen data):
${JSON.stringify(cijfers)}

Antwoord ALLEEN met geldige JSON in dit formaat:
{
  "adviezen": [
    {
      "voertuig_id": getal,
      "advies": "behouden" | "monitoren" | "vervangen" | "afstoten",
      "onderbouwing": "2-3 zinnen met concrete eigen cijfers vs. vlootmediaan",
      "prioriteit": "hoog" | "normaal" | "laag"
    }
  ],
  "samenvatting": "1-2 zinnen over het wagenpark als geheel"
}
Neem ELK voertuig uit de lijst op in adviezen.`;

  const userId = (await effectieveContext(req)).userId;
  const resultaat = await aiGateway.chat("default", {
    messages: [{ role: "user", content: prompt }],
    max_tokens: 3000,
  }, undefined, {
    module: "wagenpark",
    functie: "afstoot-advies",
    gebruikerId: userId ?? null,
  });

  if (!resultaat.ok) {
    return void res.status(502).json({ error: "AI-advies kon niet worden opgehaald" });
  }

  let parsed: { adviezen?: unknown; samenvatting?: unknown };
  try {
    const kaal = resultaat.inhoud.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
    parsed = JSON.parse(kaal) as { adviezen?: unknown; samenvatting?: unknown };
  } catch {
    return void res.status(502).json({ error: "AI-antwoord kon niet worden verwerkt" });
  }

  // Server-side beleid: "eigen cijfers eerst" wordt hier afgedwongen — een
  // AI-antwoord kan nooit vervangen/afstoten opleveren zonder voldoende eigen
  // data én mediaan-overschrijdend bewijs (zie lib/wagenparkAfstootBeleid.ts).
  const beleidMedianen = {
    mediaan_kosten_laatste_12m: vlootmedianen.mediaan_kosten_laatste_12m,
    mediaan_kosten_per_km:      vlootmedianen.mediaan_kosten_per_km,
  };
  const ruweAdviezen = Array.isArray(parsed.adviezen) ? parsed.adviezen : [];
  const perVoertuig = new Map<number, { advies: AfstootAdvies; onderbouwing: string; prioriteit: string }>();
  for (const ruw of ruweAdviezen) {
    if (typeof ruw !== "object" || ruw === null || Array.isArray(ruw)) continue; // rommel uit model overslaan
    const a = ruw as Record<string, unknown>;
    const vid = Number(a.voertuig_id);
    const eigenCijfers = cijfers.find((c) => c.voertuig_id === vid);
    if (!eigenCijfers) continue; // whitelist: alleen echte voertuigen
    const beleid = pasAfstootBeleidToe(a.advies, a.onderbouwing, eigenCijfers, beleidMedianen);
    const prioriteit = beleid.afgezwakt
      ? "normaal"
      : ["hoog", "normaal", "laag"].includes(String(a.prioriteit)) ? String(a.prioriteit) : "normaal";
    perVoertuig.set(vid, {
      advies: beleid.advies,
      onderbouwing: beleid.onderbouwing,
      prioriteit,
    });
  }

  const volgorde: Record<AfstootAdvies, number> = { afstoten: 0, vervangen: 1, monitoren: 2, behouden: 3 };
  const adviezen = cijfers
    .map((c) => {
      const ai = perVoertuig.get(c.voertuig_id);
      return {
        voertuig_id:  c.voertuig_id,
        kenteken:     c.kenteken,
        merk:         c.merk,
        type:         c.type,
        advies:       ai?.advies ?? ("monitoren" as AfstootAdvies),
        onderbouwing: ai?.onderbouwing || "Geen AI-onderbouwing ontvangen voor dit voertuig.",
        prioriteit:   ai?.prioriteit ?? "normaal",
        kosten_laatste_12m: c.kosten_laatste_12m,
        kosten_per_km:      c.kosten_per_km_totaal,
        leeftijd_jaren:     c.leeftijd_jaren,
        km_stand:           c.km_stand,
        aantal_kostenregels: c.aantal_kostenregels,
      };
    })
    .sort((a, b) => (volgorde[a.advies] ?? 9) - (volgorde[b.advies] ?? 9));

  res.json({
    gegenereerd_op: nu.toISOString(),
    samenvatting: typeof parsed.samenvatting === "string" ? parsed.samenvatting.slice(0, 1000) : null,
    vlootmedianen: {
      kosten_laatste_12m: vlootmedianen.mediaan_kosten_laatste_12m,
      kosten_per_km:      vlootmedianen.mediaan_kosten_per_km,
      leeftijd_jaren:     vlootmedianen.mediaan_leeftijd_jaren,
      km_stand:           vlootmedianen.mediaan_km_stand,
      voertuigen_met_kostendata: vlootmedianen.voertuigen_met_kostendata,
      voertuigen_totaal:  vlootmedianen.voertuigen_totaal,
    },
    adviezen,
  });
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
// Werktijdvensters & rapport ritten buiten werktijd
// Voertuiggericht (nooit per persoon); raadpleging wordt AVG-gelogd.
// ══════════════════════════════════════════════════════════

const TIJD_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

function mapWerktijdvenster(
  w: typeof wagenparkWerktijdvenstersTable.$inferSelect,
  kenteken?: string | null,
) {
  return {
    id:           w.id,
    voertuig_id:  w.voertuigId ?? null,
    kenteken:     kenteken ?? null,
    werkdagen:    w.werkdagen,
    start_tijd:   w.startTijd,
    eind_tijd:    w.eindTijd,
    actief:       w.actief,
    bijgewerkt_op: w.bijgewerktOp.toISOString(),
  };
}

// Lokale weekdag + "HH:MM" in Europe/Amsterdam voor een tijdstip.
function lokaalMoment(d: Date): { weekdag: number; tijd: string } {
  const delen = new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const wd  = delen.find((p) => p.type === "weekday")?.value ?? "";
  const uur = delen.find((p) => p.type === "hour")?.value ?? "00";
  const min = delen.find((p) => p.type === "minute")?.value ?? "00";
  const WEEKDAGEN: Record<string, number> = { zo: 0, ma: 1, di: 2, wo: 3, do: 4, vr: 5, za: 6 };
  return { weekdag: WEEKDAGEN[wd] ?? 0, tijd: `${uur}:${min}` };
}

// UTC-offset (minuten) van Europe/Amsterdam op een gegeven moment (CET/CEST).
function amsterdamOffsetMin(d: Date): number {
  const naam = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Amsterdam", timeZoneName: "longOffset",
  }).formatToParts(d).find((p) => p.type === "timeZoneName")?.value ?? "GMT+00:00";
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(naam);
  if (!m) return 0;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}

// Begin (of exclusief einde) van een kalenderdag in Europe/Amsterdam, als UTC-instant.
// `eind=true` geeft het begin van de vólgende dag (exclusieve bovengrens),
// zodat de beheerder exact de gekozen lokale kalenderdagen rapporteert —
// onafhankelijk van de servertijdzone en correct rond DST-overgangen.
function amsterdamDagGrens(datum: string, eind: boolean): Date {
  const basis = new Date(`${datum}T00:00:00Z`);
  if (isNaN(basis.getTime())) return basis;
  if (eind) basis.setUTCDate(basis.getUTCDate() + 1);
  // Lokale middernacht = UTC-middernacht minus offset; tweede pass vangt
  // een offsetwissel (DST) precies op de grens af.
  let d = new Date(basis.getTime() - amsterdamOffsetMin(basis) * 60_000);
  d = new Date(basis.getTime() - amsterdamOffsetMin(d) * 60_000);
  return d;
}

function isBuitenVenster(
  start: Date,
  venster: { werkdagen: number[]; startTijd: string; eindTijd: string },
): boolean {
  const { weekdag, tijd } = lokaalMoment(start);
  if (!venster.werkdagen.includes(weekdag)) return true;
  return tijd < venster.startTijd || tijd >= venster.eindTijd;
}

router.get("/werktijdvensters", beheer, async (_req, res): Promise<void> => {
  const rijen = await db
    .select({ venster: wagenparkWerktijdvenstersTable, kenteken: voertuigenTable.kenteken })
    .from(wagenparkWerktijdvenstersTable)
    .leftJoin(voertuigenTable, eq(wagenparkWerktijdvenstersTable.voertuigId, voertuigenTable.id))
    .orderBy(wagenparkWerktijdvenstersTable.voertuigId);

  res.json(rijen.map((r) => mapWerktijdvenster(r.venster, r.kenteken)));
});

router.put("/werktijdvensters", beheer, async (req, res): Promise<void> => {
  const body = req.body;
  const voertuigId: number | null = body.voertuig_id ?? null;

  const werkdagen: number[] = Array.isArray(body.werkdagen) ? body.werkdagen : [];
  if (
    werkdagen.length === 0 ||
    werkdagen.some((d: unknown) => typeof d !== "number" || !Number.isInteger(d) || d < 0 || d > 6)
  ) {
    return void res.status(400).json({ fout: "werkdagen moet 1–7 waarden 0–6 bevatten" });
  }
  if (!TIJD_REGEX.test(body.start_tijd) || !TIJD_REGEX.test(body.eind_tijd)) {
    return void res.status(400).json({ fout: "start_tijd/eind_tijd moeten HH:MM zijn" });
  }
  if (body.start_tijd >= body.eind_tijd) {
    return void res.status(400).json({ fout: "start_tijd moet vóór eind_tijd liggen" });
  }
  if (voertuigId !== null) {
    const [v] = await db.select({ id: voertuigenTable.id }).from(voertuigenTable)
      .where(eq(voertuigenTable.id, voertuigId));
    if (!v) return void res.status(404).json({ fout: "Voertuig niet gevonden" });
  }

  const waarden = {
    voertuigId,
    werkdagen:   Array.from(new Set(werkdagen)).sort(),
    startTijd:   body.start_tijd,
    eindTijd:    body.eind_tijd,
    actief:      body.actief ?? true,
    bijgewerktOp: new Date(),
  };

  // Upsert per scope (partiële unieke indexes; select-then-write volstaat hier
  // omdat beheer-configuratie geen concurrent pad heeft).
  const [bestaand] = await db.select().from(wagenparkWerktijdvenstersTable)
    .where(voertuigId === null
      ? isNull(wagenparkWerktijdvenstersTable.voertuigId)
      : eq(wagenparkWerktijdvenstersTable.voertuigId, voertuigId));

  const [rij] = bestaand
    ? await db.update(wagenparkWerktijdvenstersTable).set(waarden)
        .where(eq(wagenparkWerktijdvenstersTable.id, bestaand.id)).returning()
    : await db.insert(wagenparkWerktijdvenstersTable).values(waarden).returning();

  res.status(bestaand ? 200 : 201).json(mapWerktijdvenster(rij));
});

router.delete("/werktijdvensters/:id", beheer, async (req, res): Promise<void> => {
  const id = Number(req.params["id"]);
  if (isNaN(id)) return void res.status(400).json({ fout: "Ongeldig ID" });

  const [verwijderd] = await db.delete(wagenparkWerktijdvenstersTable)
    .where(eq(wagenparkWerktijdvenstersTable.id, id)).returning();
  if (!verwijderd) return void res.status(404).json({ fout: "Niet gevonden" });
  res.status(204).end();
});

router.get("/rapportage/buiten-werktijd", beheer, async (req, res): Promise<void> => {
  // Periode = hele kalenderdagen in Europe/Amsterdam (van t/m tot, inclusief).
  const nu = new Date();
  const vanStr = (req.query["van"] as string | undefined)
    ?? new Date(nu.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  const totStr = (req.query["tot"] as string | undefined) ?? nu.toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vanStr) || !/^\d{4}-\d{2}-\d{2}$/.test(totStr) || vanStr > totStr) {
    return void res.status(400).json({ fout: "Ongeldige periode (van t/m tot, YYYY-MM-DD)" });
  }
  const van = amsterdamDagGrens(vanStr, false);
  const tot = amsterdamDagGrens(totStr, true);   // exclusieve bovengrens
  if (isNaN(van.getTime()) || isNaN(tot.getTime())) {
    return void res.status(400).json({ fout: "Ongeldige datum" });
  }

  const vensters = await db.select().from(wagenparkWerktijdvenstersTable)
    .where(eq(wagenparkWerktijdvenstersTable.actief, true));
  const orgVenster = vensters.find((v) => v.voertuigId === null) ?? null;
  const perVoertuig = new Map(vensters.filter((v) => v.voertuigId !== null).map((v) => [v.voertuigId, v]));

  if (!orgVenster && perVoertuig.size === 0) {
    return void res.json({
      geconfigureerd: false,
      van: van.toISOString(),
      tot: tot.toISOString(),
      voertuigen: [],
      privacy_tekst: PRIVACY_TEKST,
    });
  }

  const voertuigen = await db.select().from(voertuigenTable)
    .where(eq(voertuigenTable.gearchiveerd, false));
  const ritten = await db.select().from(wagenparkRittenTable)
    .where(and(
      gte(wagenparkRittenTable.startDatum, van),
      sql`${wagenparkRittenTable.startDatum} < ${tot}`,
    ));

  const rittenPerVoertuig = new Map<number, typeof ritten>();
  for (const r of ritten) {
    const lijst = rittenPerVoertuig.get(r.voertuigId) ?? [];
    lijst.push(r);
    rittenPerVoertuig.set(r.voertuigId, lijst);
  }

  const rapport = voertuigen.flatMap((v) => {
    const venster = perVoertuig.get(v.id) ?? orgVenster;
    if (!venster) return [];

    const vRitten = rittenPerVoertuig.get(v.id) ?? [];
    const buiten  = vRitten.filter((r) => isBuitenVenster(r.startDatum, venster));
    const kmBuiten = buiten.reduce((som, r) => som + (r.afstandKm ?? 0), 0);

    return [{
      voertuig_id:          v.id,
      kenteken:             v.kenteken,
      merk:                 v.merk,
      type:                 v.type,
      venster_bron:         perVoertuig.has(v.id) ? "voertuig" : "organisatie",
      aantal_ritten_totaal: vRitten.length,
      aantal_buiten_venster: buiten.length,
      km_buiten_venster:    Math.round(kmBuiten * 10) / 10,
      // Voertuiggericht: alleen tijdstippen en afstand — bewust geen
      // adressen en geen persoonsgegevens in dit rapport.
      ritten_buiten: buiten
        .sort((a, b) => b.startDatum.getTime() - a.startDatum.getTime())
        .slice(0, 25)
        .map((r) => ({
          id:          r.id,
          start_datum: r.startDatum.toISOString(),
          eind_datum:  r.eindDatum?.toISOString() ?? null,
          afstand_km:  r.afstandKm ?? null,
          bron:        r.bron,
        })),
    }];
  }).sort((a, b) => b.aantal_buiten_venster - a.aantal_buiten_venster);

  // AVG-log: raadpleging van het buiten-werktijdrapport (privacygevoelige inzage).
  await logAvg(
    "inzage", null, req.session?.["userId"] ?? null,
    `rapport ritten buiten werktijd geraadpleegd (periode ${vanStr} t/m ${totStr})`,
    "ritten",
  );

  res.json({
    geconfigureerd: true,
    van: van.toISOString(),
    tot: tot.toISOString(),
    voertuigen: rapport,
    privacy_tekst: PRIVACY_TEKST,
  });
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
