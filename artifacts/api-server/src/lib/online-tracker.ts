import { db, gebruikersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// ═══════════════════════════════════════════════════════════
// In-memory aanwezigheids-tracker
// ═══════════════════════════════════════════════════════════

const VENSTER_MS     = 5 * 60 * 1000; // 5 minuten inactief = offline
const REFRESH_MS     = 60 * 1000;     // naam opnieuw ophalen na 1 minuut

interface OnlineEntry {
  naam:          string;
  initialen:     string;
  rol:           string;
  lastSeen:      number; // Date.now()
  dbOpgehaaldOp: number;
}

const bijhouden = new Map<number, OnlineEntry>();

function bepaalInitialen(naam: string): string {
  const woorden = naam.trim().split(/\s+/).filter(Boolean);
  if (woorden.length >= 2) {
    return (woorden[0]![0]! + woorden[woorden.length - 1]![0]!).toUpperCase();
  }
  return naam.slice(0, 2).toUpperCase();
}

/**
 * Meld dat een gebruiker actief is. Debounced: doet maximaal elke 60s een DB-query
 * per gebruiker. Fire-and-forget — gooi nooit een error.
 */
export async function meldActief(userId: number): Promise<void> {
  const nu = Date.now();
  const bestaand = bijhouden.get(userId);

  if (bestaand && nu - bestaand.dbOpgehaaldOp < REFRESH_MS) {
    bestaand.lastSeen = nu;
    return;
  }

  const [g] = await db
    .select({ naam: gebruikersTable.naam, rol: gebruikersTable.rol })
    .from(gebruikersTable)
    .where(eq(gebruikersTable.id, userId))
    .limit(1);

  if (!g) return;

  bijhouden.set(userId, {
    naam:          g.naam,
    initialen:     bepaalInitialen(g.naam),
    rol:           g.rol,
    lastSeen:      nu,
    dbOpgehaaldOp: nu,
  });
}

/**
 * Geeft een lijst van actieve gebruikers, exclusief de aanvrager zelf.
 * Ruimt tegelijk verlopen entries op.
 */
export function haalOnlineGebruikersOp(uitsluitenId: number): Array<{
  naam: string;
  initialen: string;
  rol: string;
}> {
  const nu = Date.now();
  const resultaat: Array<{ naam: string; initialen: string; rol: string }> = [];

  for (const [id, entry] of bijhouden) {
    if (nu - entry.lastSeen > VENSTER_MS) {
      bijhouden.delete(id);
      continue;
    }
    if (id === uitsluitenId) continue;
    resultaat.push({
      naam:      entry.naam,
      initialen: entry.initialen,
      rol:       entry.rol,
    });
  }

  return resultaat;
}
