// MAIL_01 — toegangsmodel voor de gedeelde werkinbox.
//
// Een mailbox is organisatiebezit; wie hem ziet en wat diegene mag staat in
// werk_inbox_mailbox_toegang (lezen < behandelen < beheren). De hoofdbeheerder
// heeft overal 'beheren' — dat volgt uit zijn rol, niet uit een extra
// rechtenstelsel (opdracht §3/§8).

import { db } from "@workspace/db";
import {
  werkInboxMailboxenTable,
  werkInboxMailboxToegangTable,
  gebruikersTable,
  type WerkInboxMailbox,
  type WerkInboxRecht,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

const RANG: Record<WerkInboxRecht, number> = { lezen: 1, behandelen: 2, beheren: 3 };

export function rechtDekt(recht: WerkInboxRecht | null, vereist: WerkInboxRecht): boolean {
  return recht != null && RANG[recht] >= RANG[vereist];
}

export async function isHoofdbeheerder(gebruikerId: number): Promise<boolean> {
  const [g] = await db.select({ rol: gebruikersTable.rol })
    .from(gebruikersTable).where(eq(gebruikersTable.id, gebruikerId)).limit(1);
  return g?.rol === "hoofdbeheerder";
}

/** Effectief recht van een gebruiker op een mailbox (null = geen toegang). */
export async function haalRecht(gebruikerId: number, mailboxId: number): Promise<WerkInboxRecht | null> {
  if (await isHoofdbeheerder(gebruikerId)) return "beheren";
  const [rij] = await db.select({ recht: werkInboxMailboxToegangTable.recht })
    .from(werkInboxMailboxToegangTable)
    .where(and(
      eq(werkInboxMailboxToegangTable.mailboxId, mailboxId),
      eq(werkInboxMailboxToegangTable.gebruikerId, gebruikerId),
    )).limit(1);
  return (rij?.recht as WerkInboxRecht | undefined) ?? null;
}

export interface MailboxMetRecht extends WerkInboxMailbox { recht: WerkInboxRecht }

/** Alle mailboxen die deze gebruiker mag zien, met zijn effectieve recht. */
export async function toegankelijkeMailboxen(gebruikerId: number): Promise<MailboxMetRecht[]> {
  if (await isHoofdbeheerder(gebruikerId)) {
    const alle = await db.select().from(werkInboxMailboxenTable).orderBy(werkInboxMailboxenTable.volgorde, werkInboxMailboxenTable.id);
    return alle.map((m) => ({ ...m, recht: "beheren" as const }));
  }
  const rijen = await db.select({ mailbox: werkInboxMailboxenTable, recht: werkInboxMailboxToegangTable.recht })
    .from(werkInboxMailboxToegangTable)
    .innerJoin(werkInboxMailboxenTable, eq(werkInboxMailboxenTable.id, werkInboxMailboxToegangTable.mailboxId))
    .where(eq(werkInboxMailboxToegangTable.gebruikerId, gebruikerId))
    .orderBy(werkInboxMailboxenTable.volgorde, werkInboxMailboxenTable.id);
  return rijen.map((r) => ({ ...r.mailbox, recht: r.recht as WerkInboxRecht }));
}

/** Mailbox op (genormaliseerd) adres. */
export async function vindMailboxOpAdres(adres: string): Promise<WerkInboxMailbox | null> {
  const [m] = await db.select().from(werkInboxMailboxenTable)
    .where(sql`lower(${werkInboxMailboxenTable.emailAdres}) = ${adres.toLowerCase()}`).limit(1);
  return m ?? null;
}

/**
 * Toegangscheck voor een bericht: zoekt de mailbox bij het adres en geeft het
 * effectieve recht terug. Bestaat de mailbox niet (meer), dan geen toegang —
 * fail-closed (opdracht acceptatie 2: ook niet via een adres in de browser).
 */
export async function rechtOpMailboxAdres(gebruikerId: number, mailboxAdres: string): Promise<{ mailbox: WerkInboxMailbox; recht: WerkInboxRecht } | null> {
  const mailbox = await vindMailboxOpAdres(mailboxAdres);
  if (!mailbox) return null;
  const recht = await haalRecht(gebruikerId, mailbox.id);
  if (!recht) return null;
  return { mailbox, recht };
}

// ── Aanwezigheid (opdracht §5.2) ─────────────────────────────────────────────
// Wie heeft welk bericht open, en wie is een antwoord aan het typen. Bewust
// in-memory: dit is vluchtige samenwerkingstoestand (TTL 20s), geen archief.

export type AanwezigheidsActiviteit = "bekijkt" | "typt";
interface AanwezigheidsEntry { gebruikerId: number; naam: string; activiteit: AanwezigheidsActiviteit; ts: number }

const AANWEZIGHEID_TTL_MS = 20_000;
const aanwezigheid = new Map<string, Map<number, AanwezigheidsEntry>>();

export function meldAanwezigheid(messageId: string, gebruikerId: number, naam: string, activiteit: AanwezigheidsActiviteit | "weg"): void {
  let kamer = aanwezigheid.get(messageId);
  if (activiteit === "weg") { kamer?.delete(gebruikerId); return; }
  if (!kamer) { kamer = new Map(); aanwezigheid.set(messageId, kamer); }
  kamer.set(gebruikerId, { gebruikerId, naam, activiteit, ts: Date.now() });
}

/** Anderen die dit bericht open hebben of typen (verlopen entries opgeruimd). */
export function leesAanwezigheid(messageId: string, exclusiefGebruikerId: number): Array<{ gebruikerId: number; naam: string; activiteit: AanwezigheidsActiviteit }> {
  const kamer = aanwezigheid.get(messageId);
  if (!kamer) return [];
  const nu = Date.now();
  const uit: Array<{ gebruikerId: number; naam: string; activiteit: AanwezigheidsActiviteit }> = [];
  for (const [uid, e] of kamer) {
    if (nu - e.ts > AANWEZIGHEID_TTL_MS) { kamer.delete(uid); continue; }
    if (uid !== exclusiefGebruikerId) uit.push({ gebruikerId: e.gebruikerId, naam: e.naam, activiteit: e.activiteit });
  }
  if (kamer.size === 0) aanwezigheid.delete(messageId);
  return uit;
}
