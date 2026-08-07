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
  gebruikersTable,
} from "@workspace/db/schema";
import {
  eq, and, desc, isNull, isNotNull, gte, lte, sql,
} from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth.js";
import { getFleetProvider } from "../lib/fleet-provider/index.js";
import brandstofImportRouter from "./brandstof-import.js";

const router = Router();

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
  const provider = getFleetProvider();
  const userId   = req.session?.["userId"] ?? null;

  // Sync-log aanmaken
  const [logRij] = await db.insert(wagenparkSyncLogTable).values({
    provider:   provider.naam,
    status:     "gestart",
    gestartDoorId: userId,
  }).returning();

  // Non-blocking sync: direct 200 teruggeven, sync op de achtergrond
  setImmediate(async () => {
    let aantalBijgewerkt = 0;
    let aantalFouten     = 0;
    const fouten: string[] = [];

    try {
      // Haal alle voertuigen met een provider-ID op
      const voertuigen = await db
        .select()
        .from(voertuigenTable)
        .where(
          and(
            isNotNull(voertuigenTable.providerVoertuigId),
            eq(voertuigenTable.gearchiveerd, false),
          ),
        );

      for (const v of voertuigen) {
        if (!v.providerVoertuigId) continue;
        try {
          const data = await provider.haalVoertuigDataOp(v.providerVoertuigId);
          if (data?.kmStand !== undefined) {
            await db.update(voertuigenTable).set({
              kmStand:      data.kmStand,
              kmStandDatum: data.kmStandDatum ?? new Date(),
              bijgewerktOp: new Date(),
            }).where(eq(voertuigenTable.id, v.id));
            aantalBijgewerkt++;
          }

          // Ritten importeren (afgelopen 24 uur)
          const gisteren = new Date(Date.now() - 86_400_000);
          const nu       = new Date();
          const ritten   = await provider.haalRittenOp(v.providerVoertuigId, gisteren, nu);
          for (const rit of ritten) {
            // Geen dubbele imports
            const bestaand = await db
              .select({ id: wagenparkRittenTable.id })
              .from(wagenparkRittenTable)
              .where(eq(wagenparkRittenTable.providerRitId, rit.externalRitId));
            if (bestaand.length > 0) continue;

            await db.insert(wagenparkRittenTable).values({
              voertuigId:      v.id,
              startDatum:      rit.startDatum,
              eindDatum:       rit.eindDatum,
              kmStart:         rit.kmStart ?? null,
              kmEind:          rit.kmEind ?? null,
              afstandKm:       rit.afstandKm ?? null,
              vertrekAdres:    rit.vertrekAdres ?? null,
              bestemmingAdres: rit.bestemmingAdres ?? null,
              providerRitId:   rit.externalRitId,
              bron:            provider.naam,
            });
          }
        } catch (err) {
          aantalFouten++;
          fouten.push(`Voertuig ${v.kenteken}: ${veiligeFoutmelding(err).slice(0, 100)}`);
        }
      }

      await db.update(wagenparkSyncLogTable).set({
        status:         "voltooid",
        aantalBijgewerkt,
        aantalFouten,
        foutmelding:    fouten.length ? fouten.join("; ").slice(0, 500) : null,
        voltooIdOp:     new Date(),
      }).where(eq(wagenparkSyncLogTable.id, logRij.id));

      // AVG-log
      await logAvg("sync", null, userId, "Traxgo synchronisatie uitgevoerd", "kilometerstand, ritten");
    } catch (err) {
      await db.update(wagenparkSyncLogTable).set({
        status:     "fout",
        foutmelding: String(err).slice(0, 500),
        voltooIdOp: new Date(),
      }).where(eq(wagenparkSyncLogTable.id, logRij.id));
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

// ── Privacytekst (publiek binnen de module) ──────────────────────────────────
router.get("/privacy-info", lezen, (_req, res) => {
  res.json({ tekst: PRIVACY_TEKST });
});

// ── MKB Brandstof import-adapter ─────────────────────────────────────────────
router.use("/brandstof-import", brandstofImportRouter);

export default router;
