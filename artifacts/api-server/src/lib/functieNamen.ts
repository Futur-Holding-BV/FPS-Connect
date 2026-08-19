// GEBRUIKERS_01 v2 — functienamen als organisatorische autoriteit.
//
// Waar routes vroeger gebruikers.functietitels (de vrije-tekst rechtenkolom)
// als bron gebruikten, is de bron nu de functie-/aanstellingsstructuur:
//   1. de aan het account gekoppelde medewerker (medewerkers.gebruiker_id),
//   2. medewerkers.functie_id (hoofdfunctie) + ALLE
//      medewerker_aanstellingen.functie_id (neven-/hoofdaanstellingen),
//   3. uitsluitend ACTIEVE functies (functies.actief = true),
//   4. datumvelden waar ze bestaan (medewerkers.in_dienst_sinds /
//      uit_dienst_per) worden gerespecteerd t.o.v. de peildatum; lege/legacy
//      datums tellen als "actief" zodat bestaande rijen niet stilvallen.
//
// Er bestaat GEEN datumveld op medewerker_aanstellingen, dus voor aanstellingen
// is er niets aanvullends te filteren; de dienstverband-datums op de medewerker
// bepalen of de koppeling telt op de peildatum.
import {
  db,
  medewerkersTable,
  medewerkerAanstellingenTable,
  functiesTable,
} from "@workspace/db";
import { eq, inArray, and, isNotNull } from "drizzle-orm";

/** Peildatum → yyyy-mm-dd (dienstverband-datums zijn tekst-ISO in de DB). */
function alsIsoDatum(peildatum: Date): string {
  return peildatum.toISOString().slice(0, 10);
}

/**
 * Bepaalt of een medewerker op de peildatum "in dienst" is op basis van de
 * (optionele) dienstverband-datums. Lege datums = onbepaald = telt mee
 * (compatibiliteit met legacy-rijen die deze velden niet gezet hebben).
 */
export function medewerkerActiefOp(
  inDienstSinds: string | null,
  uitDienstPer: string | null,
  peil: string,
): boolean {
  if (inDienstSinds && inDienstSinds > peil) return false;
  if (uitDienstPer && uitDienstPer <= peil) return false;
  return true;
}

/**
 * Batch: geeft per gebruiker-id de set actieve functienamen terug.
 * Voert een vast aantal queries uit (geen N+1) ongeacht het aantal gebruikers.
 *
 * @param peildatum Datum waarop de aanstelling actief moet zijn (default nu).
 */
export async function haalActieveFunctieNamenBatch(
  gebruikerIds: number[],
  peildatum: Date = new Date(),
): Promise<Map<number, Set<string>>> {
  const resultaat = new Map<number, Set<string>>();
  if (gebruikerIds.length === 0) return resultaat;

  const peil = alsIsoDatum(peildatum);

  // ── Stap 1: gekoppelde medewerkers + hoofdfunctie ────────────────────────
  const medewerkers = await db
    .select({
      id: medewerkersTable.id,
      gebruikerId: medewerkersTable.gebruikerId,
      functieId: medewerkersTable.functieId,
      actief: medewerkersTable.actief,
      inDienstSinds: medewerkersTable.inDienstSinds,
      uitDienstPer: medewerkersTable.uitDienstPer,
    })
    .from(medewerkersTable)
    .where(inArray(medewerkersTable.gebruikerId, gebruikerIds));

  const medewerkerIdNaarGebruikerId = new Map<number, number>();
  const gebruikerFunctieIds = new Map<number, Set<number>>();
  const functieIdSet = new Set<number>();

  for (const m of medewerkers) {
    if (!m.gebruikerId) continue;
    // Datumvelden respecteren waar ze bestaan; medewerkers.actief = false
    // telt nooit mee (uit dienst / geblokkeerd).
    if (m.actief === false) continue;
    if (!medewerkerActiefOp(m.inDienstSinds, m.uitDienstPer, peil)) continue;

    medewerkerIdNaarGebruikerId.set(m.id, m.gebruikerId);
    if (m.functieId) {
      functieIdSet.add(m.functieId);
      const s = gebruikerFunctieIds.get(m.gebruikerId) ?? new Set<number>();
      s.add(m.functieId);
      gebruikerFunctieIds.set(m.gebruikerId, s);
    }
  }

  // ── Stap 2: alle aanstellingen (hoofd + neven) ───────────────────────────
  const medewerkerIds = [...medewerkerIdNaarGebruikerId.keys()];
  if (medewerkerIds.length > 0) {
    const aanstellingen = await db
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
    for (const a of aanstellingen) {
      if (!a.functieId) continue;
      const gebruikerId = medewerkerIdNaarGebruikerId.get(a.medewerkerId);
      if (gebruikerId == null) continue;
      functieIdSet.add(a.functieId);
      const s = gebruikerFunctieIds.get(gebruikerId) ?? new Set<number>();
      s.add(a.functieId);
      gebruikerFunctieIds.set(gebruikerId, s);
    }
  }

  // ── Stap 3: functie-id → naam, uitsluitend ACTIEVE functies ──────────────
  const naamPerFunctie = new Map<number, string>();
  if (functieIdSet.size > 0) {
    const functies = await db
      .select({ id: functiesTable.id, naam: functiesTable.naam })
      .from(functiesTable)
      .where(
        and(
          inArray(functiesTable.id, [...functieIdSet]),
          eq(functiesTable.actief, true),
        ),
      );
    for (const f of functies) naamPerFunctie.set(f.id, f.naam);
  }

  // ── Stap 4: per gebruiker de namenset samenstellen ───────────────────────
  for (const gebruikerId of gebruikerIds) {
    const namen = new Set<string>();
    for (const fid of gebruikerFunctieIds.get(gebruikerId) ?? []) {
      const naam = naamPerFunctie.get(fid);
      if (naam) namen.add(naam);
    }
    resultaat.set(gebruikerId, namen);
  }

  return resultaat;
}

/**
 * Enkelvoudige variant. Geeft de set actieve functienamen van één gebruiker.
 */
export async function haalActieveFunctieNamen(
  gebruikerId: number,
  peildatum: Date = new Date(),
): Promise<Set<string>> {
  const kaart = await haalActieveFunctieNamenBatch([gebruikerId], peildatum);
  return kaart.get(gebruikerId) ?? new Set<string>();
}

/**
 * Handige helper: heeft de gebruiker (op de peildatum) een van de gegeven
 * functienamen? Vergelijking is exact op naam.
 */
export async function heeftFunctieNaam(
  gebruikerId: number,
  functieNamen: readonly string[],
  peildatum: Date = new Date(),
): Promise<boolean> {
  const namen = await haalActieveFunctieNamen(gebruikerId, peildatum);
  return functieNamen.some((n) => namen.has(n));
}

/**
 * Batch: geeft de gebruiker-id's die (op de peildatum) een van de gegeven
 * functienamen dragen. Voor doelgroep-adressering zonder N+1.
 *
 * @param kandidaatGebruikerIds De pool waarbinnen gezocht wordt. Verplicht:
 *   deze functie leidt de medewerker af vanuit het account, dus we hebben een
 *   set gebruiker-id's nodig als startpunt.
 */
export async function vindGebruikersMetFunctieNaam(
  kandidaatGebruikerIds: number[],
  functieNamen: readonly string[],
  peildatum: Date = new Date(),
): Promise<number[]> {
  if (kandidaatGebruikerIds.length === 0) return [];
  const kaart = await haalActieveFunctieNamenBatch(kandidaatGebruikerIds, peildatum);
  const gezocht = new Set(functieNamen);
  const treffers: number[] = [];
  for (const [gebruikerId, namen] of kaart) {
    for (const naam of namen) {
      if (gezocht.has(naam)) {
        treffers.push(gebruikerId);
        break;
      }
    }
  }
  return treffers;
}
