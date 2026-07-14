import {
  db,
  gebruikersTable,
  medewerkersTable,
  medewerkerAanstellingenTable,
  functiesTable,
  profielenTable,
} from "@workspace/db";
import { eq, inArray, and, isNotNull } from "drizzle-orm";
import {
  bevoegdhedenVoorLegacyRol,
  combineerBevoegdheden,
  type Bevoegdheden,
} from "@workspace/permissies";

/**
 * Centrale bron van waarheid voor effectieve bevoegdheden.
 *
 * Combineert opgeslagen bevoegdheden (gebruikers.bevoegdheden) met
 * functie-profiel-bevoegdheden (medewerker → aanstellingen → functies → profielen).
 *
 * Gebruik ALTIJD deze functies — nooit gebruikers.bevoegdheden direct lezen
 * en als definitieve bevoegdheden behandelen.
 */

export interface GebruikerBasis {
  id: number;
  rol: string;
  storedBevoegdheden: unknown;
}

/**
 * Berekent effectieve bevoegdheden voor een batch gebruikers.
 * Voert maximaal 5 DB-queries uit ongeacht het aantal gebruikers.
 */
export async function berekenEffectieveBevoegdhedenBatch(
  gebruikers: GebruikerBasis[],
): Promise<Map<number, Bevoegdheden>> {
  if (gebruikers.length === 0) return new Map();

  const gebruikerIds = gebruikers.map((g) => g.id);

  const medewerkers = await db
    .select({
      id: medewerkersTable.id,
      gebruikerId: medewerkersTable.gebruikerId,
      functieId: medewerkersTable.functieId,
    })
    .from(medewerkersTable)
    .where(inArray(medewerkersTable.gebruikerId, gebruikerIds));

  const medewerkerIdNaarGebruikerId = new Map<number, number>();
  const gebruikerFunctieIds = new Map<number, Set<number>>();
  const functieIdSet = new Set<number>();

  for (const m of medewerkers) {
    if (!m.gebruikerId) continue;
    medewerkerIdNaarGebruikerId.set(m.id, m.gebruikerId);
    if (m.functieId) {
      functieIdSet.add(m.functieId);
      const s = gebruikerFunctieIds.get(m.gebruikerId) ?? new Set<number>();
      s.add(m.functieId);
      gebruikerFunctieIds.set(m.gebruikerId, s);
    }
  }

  const medewerkerIds = medewerkers.map((m) => m.id);
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
      functieIdSet.add(a.functieId);
      const gebruikerId = medewerkerIdNaarGebruikerId.get(a.medewerkerId);
      if (gebruikerId != null) {
        const s = gebruikerFunctieIds.get(gebruikerId) ?? new Set<number>();
        s.add(a.functieId);
        gebruikerFunctieIds.set(gebruikerId, s);
      }
    }
  }

  const profielIdPerFunctie = new Map<number, number>();
  if (functieIdSet.size > 0) {
    const functies = await db
      .select({ id: functiesTable.id, profielId: functiesTable.profielId })
      .from(functiesTable)
      .where(
        and(inArray(functiesTable.id, [...functieIdSet]), isNotNull(functiesTable.profielId)),
      );
    for (const f of functies) {
      if (f.profielId != null) profielIdPerFunctie.set(f.id, f.profielId);
    }
  }

  const bevoegdhedenPerProfiel = new Map<number, Bevoegdheden>();
  const alleProfielIds = [...new Set(profielIdPerFunctie.values())];
  if (alleProfielIds.length > 0) {
    const profielen = await db
      .select({ id: profielenTable.id, bevoegdheden: profielenTable.bevoegdheden })
      .from(profielenTable)
      .where(inArray(profielenTable.id, alleProfielIds));
    for (const p of profielen) {
      bevoegdhedenPerProfiel.set(p.id, (p.bevoegdheden as Bevoegdheden) ?? {});
    }
  }

  const resultaat = new Map<number, Bevoegdheden>();
  for (const g of gebruikers) {
    const ruwe = (g.storedBevoegdheden as Bevoegdheden | null) ?? {};
    const opgeslagen: Bevoegdheden =
      Object.keys(ruwe).length === 0 ? bevoegdhedenVoorLegacyRol(g.rol) : ruwe;

    const functieBevoegdheden: Bevoegdheden[] = [];
    for (const fid of gebruikerFunctieIds.get(g.id) ?? []) {
      const pid = profielIdPerFunctie.get(fid);
      if (pid != null) {
        const bev = bevoegdhedenPerProfiel.get(pid);
        if (bev) functieBevoegdheden.push(bev);
      }
    }

    resultaat.set(
      g.id,
      functieBevoegdheden.length > 0
        ? combineerBevoegdheden([opgeslagen, ...functieBevoegdheden])
        : opgeslagen,
    );
  }

  return resultaat;
}

/**
 * Berekent effectieve bevoegdheden voor één gebruiker.
 * Gebruik berekenEffectieveBevoegdhedenBatch bij meerdere gebruikers.
 */
export async function berekenEffectieveBevoegdheden(
  gebruikerId: number,
): Promise<Bevoegdheden> {
  const [g] = await db
    .select({ rol: gebruikersTable.rol, bevoegdheden: gebruikersTable.bevoegdheden })
    .from(gebruikersTable)
    .where(eq(gebruikersTable.id, gebruikerId));
  if (!g) return {};

  const kaart = await berekenEffectieveBevoegdhedenBatch([
    { id: gebruikerId, rol: g.rol, storedBevoegdheden: g.bevoegdheden },
  ]);
  return kaart.get(gebruikerId) ?? {};
}
