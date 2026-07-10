// ── AI Context Service — DB-resolvers per entiteit ───────────────────────────
//
// Elke resolver haalt de RUWE entiteit + directe context op en levert een
// `OpgehaaldeKnoop`: de contextbron, de vlakke LogContext-velden, het gebouw
// waaronder de knoop valt (voor scoping) en verwijzingen naar gerelateerde
// knopen. Resolvers doen GEEN autorisatie — dat centraliseert de Orchestrator.

import { db } from "@workspace/db";
import {
  gebouwenTable,
  voorzieningenTable,
  fotosTable,
  voorzieningLabelsTable,
  labelsTable,
  inspectiesTable,
  onderhoudTable,
  offertesTable,
  offerteRegelsTable,
  dossiersTable,
  dossierDocumentenTable,
  documentenTable,
  documentKoppelingenTable,
  crmKlantenTable,
  crmContactpersonenTable,
  medewerkersTable,
  functiesTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import type {
  ContextEntiteitType,
  ContextResolver,
  KnoopVerwijzing,
  OpgehaaldeKnoop,
  ResolverKaart,
} from "./types";

function knoop(
  type: ContextEntiteitType,
  id: number,
  payload: Record<string, unknown>,
  opties: {
    gebouwId: number | null;
    flat: OpgehaaldeKnoop["flat"];
    relaties?: KnoopVerwijzing[];
    inkortbaarVeld?: string;
  },
): OpgehaaldeKnoop {
  return {
    type,
    id,
    bron: { type: "kennisbron", bronId: `${type}:${id}`, payload: { entiteit: type, ...payload } },
    flat: opties.flat,
    gebouwId: opties.gebouwId,
    relaties: opties.relaties ?? [],
    inkortbaarVeld: opties.inkortbaarVeld,
  };
}

// ── Gebouw ───────────────────────────────────────────────────────────────────
const gebouwResolver: ContextResolver = async (id) => {
  const [g] = await db.select().from(gebouwenTable).where(eq(gebouwenTable.id, id)).limit(1);
  if (!g) return null;

  const relaties: KnoopVerwijzing[] = [];
  if (g.klantId) relaties.push({ type: "klant", id: g.klantId, relatie: "opdrachtgever", prioriteitOffset: 20 });

  return knoop("gebouw", id, {
    naam: g.naam,
    werknummer: g.werknummer,
    projectnummer: g.projectnummer,
    adres: g.adres,
    stad: g.stad,
    postcode: g.postcode,
    gebouwType: g.gebouwType,
    projectStatus: g.projectStatus,
    omschrijving: g.omschrijving,
  }, {
    gebouwId: id,
    flat: { gebouw_id: id, workflow_type: "gebouw", workflow_status: g.projectStatus ?? null },
    relaties,
    inkortbaarVeld: "omschrijving",
  });
};

// ── Voorziening (spot) ───────────────────────────────────────────────────────
const voorzieningResolver: ContextResolver = async (id) => {
  const [v] = await db.select().from(voorzieningenTable).where(eq(voorzieningenTable.id, id)).limit(1);
  if (!v) return null;

  const [labels, fotos, laatsteInspectie] = await Promise.all([
    db
      .select({ naam: labelsTable.naam, fabrikant: labelsTable.fabrikant, testnorm: labelsTable.testnorm })
      .from(voorzieningLabelsTable)
      .innerJoin(labelsTable, eq(voorzieningLabelsTable.labelId, labelsTable.id))
      .where(eq(voorzieningLabelsTable.voorzieningId, id)),
    db.select({ fase: fotosTable.fase, url: fotosTable.url }).from(fotosTable).where(eq(fotosTable.voorzieningId, id)),
    db
      .select({ type: inspectiesTable.type, status: inspectiesTable.status, datum: inspectiesTable.uitgevoerdDatum })
      .from(inspectiesTable)
      .where(eq(inspectiesTable.voorzieningId, id))
      .orderBy(desc(inspectiesTable.aangemaaktOp))
      .limit(1),
  ]);

  const relaties: KnoopVerwijzing[] = [
    { type: "gebouw", id: v.gebouwId, relatie: "gebouw", prioriteitOffset: 10 },
  ];

  return knoop("voorziening", id, {
    objectnummer: v.objectnummer,
    type: v.type,
    status: v.status,
    classificatie: v.classificatie,
    ruimte: v.ruimte,
    huisnummer: v.huisnummer,
    opmerkingen: v.opmerkingen,
    toepassingen: labels,
    aantalFotos: fotos.length,
    fotoFasen: [...new Set(fotos.map((f) => f.fase))],
    laatsteInspectie: laatsteInspectie[0] ?? null,
  }, {
    gebouwId: v.gebouwId,
    flat: { voorziening_id: id, gebouw_id: v.gebouwId, workflow_type: "voorziening", workflow_status: v.status },
    relaties,
    inkortbaarVeld: "opmerkingen",
  });
};

// ── Onderhoud (werkorder) ────────────────────────────────────────────────────
const onderhoudResolver: ContextResolver = async (id) => {
  const [o] = await db.select().from(onderhoudTable).where(eq(onderhoudTable.id, id)).limit(1);
  if (!o) return null;

  const relaties: KnoopVerwijzing[] = [];
  if (o.voorzieningId) relaties.push({ type: "voorziening", id: o.voorzieningId, relatie: "voorziening", prioriteitOffset: 10 });
  if (o.gebouwId) relaties.push({ type: "gebouw", id: o.gebouwId, relatie: "gebouw", prioriteitOffset: 15 });

  return knoop("onderhoud", id, {
    titel: o.titel,
    omschrijving: o.omschrijving,
    prioriteit: o.prioriteit,
    status: o.status,
    deadline: o.deadline,
  }, {
    gebouwId: o.gebouwId ?? null,
    flat: {
      gebouw_id: o.gebouwId ?? null,
      voorziening_id: o.voorzieningId ?? null,
      workflow_type: "onderhoud",
      workflow_status: o.status,
    },
    relaties,
    inkortbaarVeld: "omschrijving",
  });
};

// ── Offerte ──────────────────────────────────────────────────────────────────
const offerteResolver: ContextResolver = async (id) => {
  const [o] = await db.select().from(offertesTable).where(eq(offertesTable.id, id)).limit(1);
  if (!o) return null;

  const regels = await db
    .select({ maatregel: offerteRegelsTable.maatregel, aantal: offerteRegelsTable.aantal, eenheid: offerteRegelsTable.eenheid })
    .from(offerteRegelsTable)
    .where(eq(offerteRegelsTable.offerteId, id))
    .limit(50);

  const relaties: KnoopVerwijzing[] = [];
  if (o.gebouwId) relaties.push({ type: "gebouw", id: o.gebouwId, relatie: "gebouw", prioriteitOffset: 10 });
  if (o.klantId) relaties.push({ type: "klant", id: o.klantId, relatie: "klant", prioriteitOffset: 15 });

  return knoop("offerte", id, {
    offertenummer: o.offertenummer,
    titel: o.titel,
    status: o.status,
    bedragExclBtw: o.bedragExclBtw,
    aantalRegels: regels.length,
    regels,
  }, {
    gebouwId: o.gebouwId ?? null,
    flat: {
      offerte_id: id,
      gebouw_id: o.gebouwId ?? null,
      klant_id: o.klantId ?? null,
      calculatie_id: o.calculatieId ?? null,
      project_id: o.autoProjectId ?? null,
      workflow_type: "offerte",
      workflow_status: o.status,
    },
    relaties,
    inkortbaarVeld: "titel",
  });
};

// ── Dossier ──────────────────────────────────────────────────────────────────
const dossierResolver: ContextResolver = async (id) => {
  const [d] = await db.select().from(dossiersTable).where(eq(dossiersTable.id, id)).limit(1);
  if (!d) return null;

  const documenten = await db
    .select({ documentId: dossierDocumentenTable.documentId, naam: dossierDocumentenTable.naam })
    .from(dossierDocumentenTable)
    .where(eq(dossierDocumentenTable.dossierId, id))
    .limit(50);

  const relaties: KnoopVerwijzing[] = [];
  if (d.gebouwId) relaties.push({ type: "gebouw", id: d.gebouwId, relatie: "gebouw", prioriteitOffset: 10 });
  for (const doc of documenten) {
    if (doc.documentId) relaties.push({ type: "document", id: doc.documentId, relatie: "dossierdocument", prioriteitOffset: 25 });
  }

  return knoop("dossier", id, {
    naam: d.naam,
    type: d.type,
    status: d.status,
    omschrijving: d.omschrijving,
    aantalDocumenten: documenten.length,
  }, {
    gebouwId: d.gebouwId ?? null,
    flat: { gebouw_id: d.gebouwId ?? null, workflow_type: "dossier", workflow_status: d.status },
    relaties,
    inkortbaarVeld: "omschrijving",
  });
};

// ── Document (bibliotheek/DMS) ───────────────────────────────────────────────
const documentResolver: ContextResolver = async (id) => {
  const [doc] = await db.select().from(documentenTable).where(eq(documentenTable.id, id)).limit(1);
  if (!doc) return null;

  const koppelingen = await db
    .select({ doelType: documentKoppelingenTable.doelType, doelId: documentKoppelingenTable.doelId })
    .from(documentKoppelingenTable)
    .where(eq(documentKoppelingenTable.documentId, id))
    .limit(50);

  // Documenten zijn polymorf gekoppeld; leid het gebouw af als er een
  // gebouw-koppeling is, zodat gebouw-scoping alsnog kan gelden.
  const gebouwKoppeling = koppelingen.find((k) => k.doelType === "gebouw");

  return knoop("document", id, {
    naam: doc.naam,
    documenttype: doc.documenttype,
    fabrikant: doc.fabrikant,
    product: doc.product,
    status: doc.status,
    revisieNummer: doc.revisieNummer,
    koppelingen,
  }, {
    gebouwId: gebouwKoppeling ? gebouwKoppeling.doelId : null,
    flat: { document_id: id, workflow_type: "document", workflow_status: doc.status },
    relaties: [],
    inkortbaarVeld: "product",
  });
};

// ── Klant (CRM) ──────────────────────────────────────────────────────────────
const klantResolver: ContextResolver = async (id) => {
  const [k] = await db.select().from(crmKlantenTable).where(eq(crmKlantenTable.id, id)).limit(1);
  if (!k) return null;

  const contacten = await db
    .select({ naam: crmContactpersonenTable.naam, functie: crmContactpersonenTable.functie, primair: crmContactpersonenTable.primair })
    .from(crmContactpersonenTable)
    .where(eq(crmContactpersonenTable.klantId, id))
    .limit(20);

  return knoop("klant", id, {
    naam: k.naam,
    type: k.type,
    branche: k.branche,
    status: k.status,
    relatieStatus: k.relatieStatus,
    opmerkingen: k.opmerkingen,
    contactpersonen: contacten,
  }, {
    gebouwId: null,
    flat: { klant_id: id, workflow_type: "klant", workflow_status: k.status },
    relaties: [],
    inkortbaarVeld: "opmerkingen",
  });
};

// ── Medewerker (HRM) ─────────────────────────────────────────────────────────
const medewerkerResolver: ContextResolver = async (id) => {
  const [m] = await db.select().from(medewerkersTable).where(eq(medewerkersTable.id, id)).limit(1);
  if (!m) return null;

  let functieNaam: string | null = null;
  if (m.functieId) {
    const [f] = await db
      .select({ naam: functiesTable.naam })
      .from(functiesTable)
      .where(eq(functiesTable.id, m.functieId))
      .limit(1);
    functieNaam = f?.naam ?? null;
  }

  return knoop("medewerker", id, {
    naam: m.naam,
    functie: functieNaam,
    werkmaatschappij: m.werkmaatschappij,
    dienstverband: m.dienstverband,
    actief: m.actief,
  }, {
    gebouwId: null,
    flat: { medewerker_id: id, workflow_type: "medewerker" },
    relaties: [],
  });
};

export const DB_RESOLVERS: ResolverKaart = {
  gebouw: gebouwResolver,
  voorziening: voorzieningResolver,
  onderhoud: onderhoudResolver,
  offerte: offerteResolver,
  dossier: dossierResolver,
  document: documentResolver,
  klant: klantResolver,
  medewerker: medewerkerResolver,
};
