import {
  db,
  medewerkersTable,
  medewerkerAanstellingenTable,
  functiesTable,
} from "@workspace/db";
import { eq, and, inArray, isNotNull } from "drizzle-orm";
import { medewerkerActiefOp } from "./functieNamen";

/**
 * GEBRUIKERS_01 v2 — centrale berekening van `is_uitvoerend_veld`.
 *
 * Eén bron van waarheid voor de buitendienst-check. Wordt gebruikt door:
 *  - auth-routes (login / me / mobile / taal): server-vlag in de auth-payload;
 *  - GET /gebruikers (lijst): per gebruiker de vlag, zodat "bekijken als"
 *    (impersonatie) de juiste vlag krijgt zonder client-side heuristiek.
 *
 * Bronnen per gebruiker: medewerkers.functie_id (directe koppeling) +
 * medewerker_aanstellingen.functie_id (hoofd + neven).
 *
 * Fail-closed regels (identiek voor single en batch):
 *   - hoofdbeheerder            → false
 *   - geen medewerker-record    → false
 *   - geen functies gevonden    → false
 *   - een functie ontbreekt/DB  → false (onbekende functie)
 *   - een functie inactief       → false
 *   - anders: true als ALLE gevonden actieve functies uitvoerend=true zijn
 */

export interface UitvoerendInvoer {
  id: number;
  rol: string;
}

/**
 * Batch-berekening zonder N+1: hooguit drie queries ongeacht het aantal
 * gebruikers (medewerkers, aanstellingen, functies).
 * Retourneert een Map van gebruiker-id → is_uitvoerend_veld.
 */
export async function berekenIsUitvoerendVeldBatch(
  gebruikers: UitvoerendInvoer[],
): Promise<Map<number, boolean>> {
  const resultaat = new Map<number, boolean>();
  if (gebruikers.length === 0) return resultaat;

  // Standaard fail-closed: iedereen begint op false.
  for (const g of gebruikers) resultaat.set(g.id, false);

  // hoofdbeheerders zijn nooit uitvoerend veld; sla ze over voor DB-werk.
  const nietBeheerders = gebruikers.filter((g) => g.rol !== "hoofdbeheerder");
  if (nietBeheerders.length === 0) return resultaat;

  const gebruikerIds = nietBeheerders.map((g) => g.id);

  // ── Query 1: medewerkers ──────────────────────────────────────────────────
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

  // Een gebruiker zonder medewerker-record blijft false (fail-closed).
  const medewerkerIdNaarGebruiker = new Map<number, number>();
  const functieIdsPerGebruiker = new Map<number, Set<number>>();
  const gebruikersMetMedewerker = new Set<number>();
  const alleFunctieIds = new Set<number>();

  const vandaag = new Date().toISOString().slice(0, 10);
  const actieveMedewerkers = medewerkers.filter(
    (m) =>
      m.actief !== false &&
      medewerkerActiefOp(m.inDienstSinds, m.uitDienstPer, vandaag),
  );

  for (const m of actieveMedewerkers) {
    if (m.gebruikerId == null) continue;
    gebruikersMetMedewerker.add(m.gebruikerId);
    medewerkerIdNaarGebruiker.set(m.id, m.gebruikerId);
    if (m.functieId != null) {
      const s = functieIdsPerGebruiker.get(m.gebruikerId) ?? new Set<number>();
      s.add(m.functieId);
      functieIdsPerGebruiker.set(m.gebruikerId, s);
      alleFunctieIds.add(m.functieId);
    }
  }

  // ── Query 2: aanstellingen ────────────────────────────────────────────────
  const medewerkerIds = actieveMedewerkers.map((m) => m.id);
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
      if (a.functieId == null) continue;
      const gid = medewerkerIdNaarGebruiker.get(a.medewerkerId);
      if (gid == null) continue;
      const s = functieIdsPerGebruiker.get(gid) ?? new Set<number>();
      s.add(a.functieId);
      functieIdsPerGebruiker.set(gid, s);
      alleFunctieIds.add(a.functieId);
    }
  }

  // ── Query 3: functies ─────────────────────────────────────────────────────
  const functieInfo = new Map<number, { uitvoerend: boolean; actief: boolean }>();
  if (alleFunctieIds.size > 0) {
    const functies = await db
      .select({
        id: functiesTable.id,
        uitvoerend: functiesTable.uitvoerend,
        actief: functiesTable.actief,
      })
      .from(functiesTable)
      .where(inArray(functiesTable.id, [...alleFunctieIds]));
    for (const f of functies) {
      functieInfo.set(f.id, { uitvoerend: f.uitvoerend, actief: f.actief });
    }
  }

  // ── Evaluatie per gebruiker ───────────────────────────────────────────────
  for (const g of nietBeheerders) {
    // Fail-closed: geen medewerker-record.
    if (!gebruikersMetMedewerker.has(g.id)) continue;

    const functieIds = functieIdsPerGebruiker.get(g.id);
    // Fail-closed: geen functies.
    if (!functieIds || functieIds.size === 0) continue;

    let alleUitvoerend = true;
    let allesBekendEnActief = true;
    for (const fid of functieIds) {
      const info = functieInfo.get(fid);
      // Onbekende functie (niet in DB) → fail-closed.
      if (!info) {
        allesBekendEnActief = false;
        break;
      }
      // Inactieve functie → fail-closed.
      if (!info.actief) {
        allesBekendEnActief = false;
        break;
      }
      if (info.uitvoerend !== true) alleUitvoerend = false;
    }

    resultaat.set(g.id, allesBekendEnActief && alleUitvoerend);
  }

  return resultaat;
}

/**
 * Single-gebruiker variant. Gebruikt de batch-implementatie zodat de
 * fail-closed-regels op één plek staan.
 */
export async function berekenIsUitvoerendVeld(
  gebruikerId: number,
  rol: string,
): Promise<boolean> {
  const kaart = await berekenIsUitvoerendVeldBatch([{ id: gebruikerId, rol }]);
  return kaart.get(gebruikerId) ?? false;
}
