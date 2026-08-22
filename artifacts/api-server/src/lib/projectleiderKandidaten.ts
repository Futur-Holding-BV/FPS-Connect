// PROJ_1200 §3 — helper: actieve medewerkers met exacte functienaam "Projectleider".
//
// Kandidaatregel (cumulatief):
//  1. medewerkers.actief = true
//  2. dienstverband actief vandaag (in_dienst_sinds / uit_dienst_per; lege datums = actief)
//  3. actieve functie exact genaamd "Projectleider" via medewerkers.functie_id
//     OF via enige medewerker_aanstellingen.functie_id
//
// Een medewerker mag GEEN gebruikersaccount hebben en moet toch terugkomen.
// Geeft id, naam en optionele gebruiker_id terug.
//
// Accepteert een optionele DB-executor (transactie) zodat aanroepers de
// kandidaatquery binnen hun eigen transactie kunnen draaien.

import { db, medewerkersTable, medewerkerAanstellingenTable, functiesTable } from "@workspace/db";
import { eq, inArray, and, isNotNull } from "drizzle-orm";
import { medewerkerActiefOp } from "./functieNamen";

export type ProjectleiderKandidaat = {
  id: number;
  naam: string;
  gebruikerId: number | null;
};

export type DbLeezer = Pick<typeof db, "select">;

const FUNCTIENAAM = "Projectleider";

export type ProjectleiderKandidaatOpties = {
  vergrendel?: boolean;
  medewerkerIds?: readonly number[];
};

function alsIsoDatum(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Geeft alle actieve medewerkers terug die vandaag in aanmerking komen als
 * projectleider. Optioneel een Drizzle-transactie meegeven als executor.
 */
export async function haalProjectleiderKandidaten(
  uitvoerder: DbLeezer = db,
  peildatum: Date = new Date(),
  opties: ProjectleiderKandidaatOpties = {},
): Promise<ProjectleiderKandidaat[]> {
  const peil = alsIsoDatum(peildatum);

  // Stap 1: alle actieve medewerkers (actief = true)
  if (opties.medewerkerIds?.length === 0) return [];
  const medewerkerFilter = opties.medewerkerIds
    ? and(
        eq(medewerkersTable.actief, true),
        inArray(medewerkersTable.id, [...opties.medewerkerIds]),
      )
    : eq(medewerkersTable.actief, true);
  const medewerkersQuery = uitvoerder
    .select({
      id: medewerkersTable.id,
      naam: medewerkersTable.naam,
      gebruikerId: medewerkersTable.gebruikerId,
      functieId: medewerkersTable.functieId,
      inDienstSinds: medewerkersTable.inDienstSinds,
      uitDienstPer: medewerkersTable.uitDienstPer,
    })
    .from(medewerkersTable)
    .where(medewerkerFilter);
  const medewerkers = await (opties.vergrendel
    ? medewerkersQuery.for("update")
    : medewerkersQuery);

  // Filter op dienstverbanddatums
  const actiefVandaag = medewerkers.filter((m) =>
    medewerkerActiefOp(m.inDienstSinds, m.uitDienstPer, peil),
  );

  if (actiefVandaag.length === 0) return [];

  // Stap 2: verzamel alle functie-id's (hoofd + aanstellingen)
  const medewerkerIds = actiefVandaag.map((m) => m.id);
  const hoofdFunctieIds = new Set(
    actiefVandaag.map((m) => m.functieId).filter((id): id is number => id != null),
  );

  // Aanstellingen ophalen
  const aanstellingenQuery = uitvoerder
    .select({
      medewerkerId: medewerkerAanstellingenTable.medewerkerId,
      functieId: medewerkerAanstellingenTable.functieId,
    })
    .from(medewerkerAanstellingenTable)
    .where(
      and(
        inArray(medewerkerAanstellingenTable.medewerkerId, medewerkerIds),
        isNotNull(medewerkerAanstellingenTable.functieId),
      ),
    );
  const aanstellingen = await (opties.vergrendel
    ? aanstellingenQuery.for("update")
    : aanstellingenQuery);

  // Bouw een map: medewerkerId → set van functie-id's (hoofd + aanstellingen)
  const functiesPerMedewerker = new Map<number, Set<number>>();
  for (const m of actiefVandaag) {
    const s = new Set<number>();
    if (m.functieId) s.add(m.functieId);
    functiesPerMedewerker.set(m.id, s);
  }
  for (const a of aanstellingen) {
    if (!a.functieId) continue;
    const s = functiesPerMedewerker.get(a.medewerkerId);
    if (s) s.add(a.functieId);
  }

  // Alle unieke functie-id's
  const alleFunctieIds = new Set<number>();
  for (const fids of functiesPerMedewerker.values()) {
    for (const fid of fids) alleFunctieIds.add(fid);
  }

  if (alleFunctieIds.size === 0) return [];

  // Stap 3: vergrendel eerst álle betrokken functies en bepaal daarna welke
  // exact actief "Projectleider" heten. Daardoor kan een functie niet tussen
  // kandidaatcontrole en projectcommit worden geactiveerd, gedeactiveerd of
  // hernoemd.
  const functiesQuery = uitvoerder
    .select({
      id: functiesTable.id,
      naam: functiesTable.naam,
      actief: functiesTable.actief,
    })
    .from(functiesTable)
    .where(inArray(functiesTable.id, [...alleFunctieIds]));
  const functies = await (opties.vergrendel
    ? functiesQuery.for("update")
    : functiesQuery);

  const trefferIds = new Set(
    functies
      .filter((functie) => functie.naam === FUNCTIENAAM && functie.actief)
      .map((functie) => functie.id),
  );
  if (trefferIds.size === 0) return [];

  // Stap 4: filter medewerkers waarvan minstens één functie-id in trefferIds zit
  const kandidaten: ProjectleiderKandidaat[] = [];
  for (const m of actiefVandaag) {
    const fids = functiesPerMedewerker.get(m.id) ?? new Set();
    for (const fid of fids) {
      if (trefferIds.has(fid)) {
        kandidaten.push({ id: m.id, naam: m.naam, gebruikerId: m.gebruikerId ?? null });
        break;
      }
    }
  }

  return kandidaten;
}

/**
 * Valideert of een gegeven medewerker-id een geldige projectleider-kandidaat is.
 * Geeft de kandidaat terug, of null als niet geldig.
 */
export async function valideerProjectleiderKandidaat(
  medewerkerId: number,
  uitvoerder: DbLeezer = db,
  peildatum: Date = new Date(),
  opties: Omit<ProjectleiderKandidaatOpties, "medewerkerIds"> = {},
): Promise<ProjectleiderKandidaat | null> {
  const kandidaten = await haalProjectleiderKandidaten(uitvoerder, peildatum, {
    ...opties,
    medewerkerIds: [medewerkerId],
  });
  return kandidaten.find((k) => k.id === medewerkerId) ?? null;
}
