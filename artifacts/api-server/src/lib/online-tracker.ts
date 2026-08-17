import { db, gebruikersTable } from "@workspace/db";
import { and, eq, gt, ne } from "drizzle-orm";

// ═══════════════════════════════════════════════════════════
// Aanwezigheids-tracker (database-gedragen)
//
// Elke geauthenticeerde API-aanroep ververst (gedebounced) de kolom
// gebruikers.laatst_online. De online-lijst komt rechtstreeks uit de
// database, zodat hij server-herstarts overleeft en ook klopt wanneer
// er meerdere serverprocessen draaien. Vóór aug 2026 was dit een
// in-memory Map — die was na elke herstart leeg, waardoor collega's
// ten onrechte als offline getoond werden.
// ═══════════════════════════════════════════════════════════

const VENSTER_MS = 5 * 60 * 1000; // 5 minuten inactief = offline
const SCHRIJF_MS = 60 * 1000;     // max. één DB-schrijfactie per gebruiker per minuut

// Debounce-administratie: wanneer is laatst_online voor het laatst geschreven?
const laatstGeschreven = new Map<number, number>();

function bepaalInitialen(naam: string): string {
  const woorden = naam.trim().split(/\s+/).filter(Boolean);
  if (woorden.length >= 2) {
    return (woorden[0]![0]! + woorden[woorden.length - 1]![0]!).toUpperCase();
  }
  return naam.slice(0, 2).toUpperCase();
}

/**
 * Meld dat een gebruiker actief is. Debounced: schrijft maximaal elke 60s
 * laatst_online naar de database. Fire-and-forget — gooi nooit een error.
 */
export async function meldActief(userId: number): Promise<void> {
  const nu = Date.now();
  const vorige = laatstGeschreven.get(userId);
  if (vorige !== undefined && nu - vorige < SCHRIJF_MS) return;
  laatstGeschreven.set(userId, nu);

  try {
    await db
      .update(gebruikersTable)
      .set({ laatstOnline: new Date(nu) })
      .where(eq(gebruikersTable.id, userId));
  } catch {
    // Bij een mislukte schrijfactie de debounce terugdraaien zodat de
    // volgende request het opnieuw probeert.
    laatstGeschreven.delete(userId);
  }
}

/**
 * Geeft een lijst van actieve gebruikers (laatst_online binnen 5 minuten),
 * exclusief de aanvrager zelf en gearchiveerde accounts.
 */
export async function haalOnlineGebruikersOp(uitsluitenId: number): Promise<Array<{
  naam: string;
  initialen: string;
  rol: string;
}>> {
  const grens = new Date(Date.now() - VENSTER_MS);
  const rijen = await db
    .select({ naam: gebruikersTable.naam, rol: gebruikersTable.rol })
    .from(gebruikersTable)
    .where(and(
      gt(gebruikersTable.laatstOnline, grens),
      ne(gebruikersTable.id, uitsluitenId),
      eq(gebruikersTable.gearchiveerd, false),
      eq(gebruikersTable.actief, true),
    ))
    .orderBy(gebruikersTable.naam);

  return rijen.map((g) => ({
    naam: g.naam,
    initialen: bepaalInitialen(g.naam),
    rol: g.rol,
  }));
}
