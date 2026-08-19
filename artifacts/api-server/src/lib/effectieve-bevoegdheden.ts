import {
  db,
  gebruikersTable,
  medewerkersTable,
  medewerkerAanstellingenTable,
  functiesTable,
  profielenTable,
  gebruikerBevoegdheidAfwijkingenTable,
} from "@workspace/db";
import { eq, inArray, and, isNotNull } from "drizzle-orm";
import {
  bevoegdhedenVoorLegacyRol,
  combineerBevoegdheden,
  type Bevoegdheden,
} from "@workspace/permissies";
import { medewerkerActiefOp } from "./functieNamen";

/**
 * Centrale bron van waarheid voor effectieve bevoegdheden.
 *
 * Berekeningsmodel (GEBRUIKERS_01 v2):
 *  1. Baseline = functie→profiel bevoegdheden (hoofd- + nevenaanstellingen, combineerBevoegdheden).
 *  2. Afwijkingen (gebruiker_bevoegdheid_afwijkingen) overrulen de baseline per module.
 *  3. Legacy stored bevoegdheden worden ALLEEN als fallback gebruikt als er
 *     geen functie-profielen en geen afwijkingen zijn (backwards compatibility).
 *
 * Bescherming: bewuste afwijkingen worden NIET overschreven door stille profiel-toepassing.
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
 * Voert maximaal 6 DB-queries uit ongeacht het aantal gebruikers.
 *
 * Model: baseline (functie→profiel) + afwijkingen overrulen per module.
 * Afwijkingen beschermen tegen stille profiel-updates.
 */
export async function berekenEffectieveBevoegdhedenBatch(
  gebruikers: GebruikerBasis[],
): Promise<Map<number, Bevoegdheden>> {
  if (gebruikers.length === 0) return new Map();

  const gebruikerIds = gebruikers.map((g) => g.id);

  // ── Stap 1: Medewerkers ophalen ──────────────────────────────────────────
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

  const vandaag = new Date().toISOString().slice(0, 10);
  const actieveMedewerkers = medewerkers.filter(
    (m) =>
      m.actief !== false &&
      medewerkerActiefOp(m.inDienstSinds, m.uitDienstPer, vandaag),
  );

  for (const m of actieveMedewerkers) {
    if (!m.gebruikerId) continue;
    medewerkerIdNaarGebruikerId.set(m.id, m.gebruikerId);
    if (m.functieId) {
      functieIdSet.add(m.functieId);
      const s = gebruikerFunctieIds.get(m.gebruikerId) ?? new Set<number>();
      s.add(m.functieId);
      gebruikerFunctieIds.set(m.gebruikerId, s);
    }
  }

  // ── Stap 2: Aanstellingen ophalen (hoofd + neven) ────────────────────────
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

  // ── Stap 3: Functies → profiel-id's (alleen actieve functies) ───────────
  const profielIdPerFunctie = new Map<number, number>();
  if (functieIdSet.size > 0) {
    const functies = await db
      .select({ id: functiesTable.id, profielId: functiesTable.profielId })
      .from(functiesTable)
      .where(
        and(
          inArray(functiesTable.id, [...functieIdSet]),
          isNotNull(functiesTable.profielId),
          eq(functiesTable.actief, true),
        ),
      );
    for (const f of functies) {
      if (f.profielId != null) profielIdPerFunctie.set(f.id, f.profielId);
    }
  }

  // ── Stap 4: Profiel-bevoegdheden ophalen ─────────────────────────────────
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

  // ── Stap 5: Afwijkingen per gebruiker ophalen ────────────────────────────
  const afwijkingenPerGebruiker = new Map<number, Map<string, number>>();
  if (gebruikerIds.length > 0) {
    const afwijkingen = await db
      .select({
        gebruikerId: gebruikerBevoegdheidAfwijkingenTable.gebruikerId,
        moduleId: gebruikerBevoegdheidAfwijkingenTable.moduleId,
        niveau: gebruikerBevoegdheidAfwijkingenTable.niveau,
      })
      .from(gebruikerBevoegdheidAfwijkingenTable)
      .where(inArray(gebruikerBevoegdheidAfwijkingenTable.gebruikerId, gebruikerIds));

    for (const a of afwijkingen) {
      const kaart = afwijkingenPerGebruiker.get(a.gebruikerId) ?? new Map<string, number>();
      kaart.set(a.moduleId, a.niveau);
      afwijkingenPerGebruiker.set(a.gebruikerId, kaart);
    }
  }

  // ── Stap 6: Effectieve matrix samenstellen ───────────────────────────────
  const resultaat = new Map<number, Bevoegdheden>();
  for (const g of gebruikers) {
    // Functie-baseline: combineer alle functies van hoofd- en nevenaanstellingen
    const functieBevoegdheden: Bevoegdheden[] = [];
    for (const fid of gebruikerFunctieIds.get(g.id) ?? []) {
      const pid = profielIdPerFunctie.get(fid);
      if (pid != null) {
        const bev = bevoegdhedenPerProfiel.get(pid);
        if (bev) functieBevoegdheden.push(bev);
      }
    }

    // Baseline: functie-profielen combineren
    let baseline: Bevoegdheden;
    if (functieBevoegdheden.length > 0) {
      baseline = combineerBevoegdheden(functieBevoegdheden);
    } else {
      // Geen functie-profielen: gebruik opgeslagen matrix als baseline (legacy)
      const ruwe = (g.storedBevoegdheden as Bevoegdheden | null) ?? {};
      baseline = Object.keys(ruwe).length === 0 ? bevoegdhedenVoorLegacyRol(g.rol) : ruwe;
    }

    // Afwijkingen overrulen de baseline per module
    const afwijkingen = afwijkingenPerGebruiker.get(g.id);
    if (afwijkingen && afwijkingen.size > 0) {
      const effectief: Bevoegdheden = { ...baseline };
      for (const [module, niveau] of afwijkingen) {
        effectief[module] = niveau;
      }
      resultaat.set(g.id, effectief);
    } else {
      resultaat.set(g.id, baseline);
    }
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

/**
 * Berekent de functie-baseline bevoegdheden voor één gebruiker
 * (zonder afwijkingen). Gebruikt om het delta te tonen in de UI.
 */
export async function berekenFunctieBaseline(
  gebruikerId: number,
): Promise<Bevoegdheden> {
  const [g] = await db
    .select({ rol: gebruikersTable.rol })
    .from(gebruikersTable)
    .where(eq(gebruikersTable.id, gebruikerId));
  if (!g) return {};

  // Haal medewerker en aanstellingen op
  const medewerker = await db
    .select({
      id: medewerkersTable.id,
      functieId: medewerkersTable.functieId,
      actief: medewerkersTable.actief,
      inDienstSinds: medewerkersTable.inDienstSinds,
      uitDienstPer: medewerkersTable.uitDienstPer,
    })
    .from(medewerkersTable)
    .where(eq(medewerkersTable.gebruikerId, gebruikerId));

  const vandaag = new Date().toISOString().slice(0, 10);
  const actieveMedewerkers = medewerker.filter(
    (m) =>
      m.actief !== false &&
      medewerkerActiefOp(m.inDienstSinds, m.uitDienstPer, vandaag),
  );
  if (actieveMedewerkers.length === 0) return {};

  const medewerkerIds = actieveMedewerkers.map((m) => m.id);
  const functieIdSet = new Set<number>();

  for (const m of actieveMedewerkers) {
    if (m.functieId) functieIdSet.add(m.functieId);
  }

  const aanstellingen = await db
    .select({ functieId: medewerkerAanstellingenTable.functieId })
    .from(medewerkerAanstellingenTable)
    .where(
      and(
        inArray(medewerkerAanstellingenTable.medewerkerId, medewerkerIds),
        isNotNull(medewerkerAanstellingenTable.functieId),
      ),
    );

  for (const a of aanstellingen) {
    if (a.functieId) functieIdSet.add(a.functieId);
  }

  if (functieIdSet.size === 0) return {};

  const functies = await db
    .select({ id: functiesTable.id, profielId: functiesTable.profielId })
    .from(functiesTable)
    .where(
      and(
        inArray(functiesTable.id, [...functieIdSet]),
        isNotNull(functiesTable.profielId),
        eq(functiesTable.actief, true),
      ),
    );

  const profielIds = functies.map((f) => f.profielId).filter((p): p is number => p != null);
  if (profielIds.length === 0) return {};

  const profielen = await db
    .select({ id: profielenTable.id, bevoegdheden: profielenTable.bevoegdheden })
    .from(profielenTable)
    .where(inArray(profielenTable.id, profielIds));

  return combineerBevoegdheden(profielen.map((p) => (p.bevoegdheden as Bevoegdheden) ?? {}));
}
