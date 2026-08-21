// ADVISEUR_PERSIST_01/02 (task-1202) — server-eigen persistentie + audit voor de
// FPS Bedrijfsadviseur.
//
// Dit bestand bundelt:
//   1. Pure helpers (isolatiesleutel, begrensde historie, klik-veilige
//      citaties, uitkomstbepaling) — deterministisch en los te testen.
//   2. DB-helpers die de server-eigen conversatie ophalen/opslaan en de
//      audittrail wegschrijven.
//
// Kernprincipes:
//   - De conversatie is server-eigendom. Historie komt UITSLUITEND uit de DB,
//     nooit van de client.
//   - Isolatie per actor + effectieve gebruiker + effectieve rol. Een
//     impersonerende beheerder deelt nooit het persoonlijke teamlidgesprek.
//   - Race-veilig: INSERT … ON CONFLICT DO NOTHING + re-select op de UNIQUE
//     index (actor_id, gebruiker_id, effectieve_rol).
//   - actorId ≠ effectieveUserId bij impersonatie: audit bewaart beide.
//   - Alles wordt geaudit: vraag, antwoord, contextgebruik,
//     toolautorisaties/-resultaten, geweigerde aanvragen en de expliciete
//     geen-toegang/geen-data-uitkomst.

import { and, desc, eq, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import {
  db,
  adviseurGesprekkenTable,
  adviseurBerichtenTable,
  adviseurAuditTable,
} from "@workspace/db";
import type { AiContextBron } from "./aiGateway";
import type { AutorisatieSnapshot } from "@workspace/permissies";

// Maximaal aantal historieberichten (user+assistant) dat uit de DB in de
// AI-prompt wordt meegegeven. Begrensd om de context beheersbaar te houden.
export const MAX_HISTORIE_BERICHTEN = 10;

export type HistorieBericht = { rol: "user" | "assistant"; inhoud: string };

// Klik-veilige citatie: een verwijzing naar een bron binnen Connect waar de
// gebruiker daadwerkelijk toegang toe heeft. `href` is een intern app-pad
// (nooit een externe/onvertrouwde URL) zodat de frontend er veilig op kan
// klikken.
export interface Citatie {
  label: string;
  bron: string;
  entiteitstype?: string;
  entiteitId?: number;
  href?: string;
}

// Mogelijke uitkomsten van een vraag — expliciet, voor audit en frontend.
export type AdviseurUitkomst =
  | "beantwoord"
  | "geen_toegang"
  | "geen_data"
  | "verduidelijking"
  | "gateway_onbeschikbaar"
  | "limiet_bereikt"
  | "ai_fout";

// ── Pure helpers ────────────────────────────────────────────────────────────

// Normaliseert actor, effectieve gebruiker, rol en actuele autorisatiesnapshot
// tot één stabiele isolatiesleutel.
export function isolatieSleutel(
  actorId: number,
  effectieveUserId: number,
  effectieveRol: string,
  autorisatieHash: string,
): string {
  return `${actorId}:${effectieveUserId}:${(effectieveRol || "gebruiker").trim().toLowerCase()}:${autorisatieHash}`;
}

function canoniek(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canoniek);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canoniek(item)]),
    );
  }
  return value;
}

/**
 * Niet-omkeerbare vingerafdruk van alle autorisatiedimensies die een
 * gegevensquery kunnen begrenzen. GET en POST gebruiken dezelfde helper.
 */
export function maakAutorisatieHash(snapshot: AutorisatieSnapshot): string {
  return createHash("sha256")
    .update(JSON.stringify(canoniek(snapshot)))
    .digest("hex");
}

// Begrenst de server-sourced historie tot de laatste N berichten, in
// chronologische volgorde (oud → nieuw), en filtert lege/ongeldige rijen weg.
export function begrensHistorie(
  berichten: HistorieBericht[],
  max: number = MAX_HISTORIE_BERICHTEN,
): HistorieBericht[] {
  const schoon = berichten.filter(
    (b) =>
      (b.rol === "user" || b.rol === "assistant") &&
      typeof b.inhoud === "string" &&
      b.inhoud.trim().length > 0,
  );
  return schoon.slice(-max);
}

// Bouwt klik-veilige citaties uit de geautoriseerde contextbronnen én
// tool-resultaten. Alleen bronnen met een herkenbaar entiteitstype + id krijgen
// een intern app-pad; overige bronnen worden als niet-klikbare bronvermelding
// opgenomen. Tool-resultaten met een `bron`-veld worden altijd opgenomen.
const ENTITEIT_HREF: Record<string, (id: number) => string> = {
  gebouw: (id) => `/gebouwen/${id}`,
  voorziening: (id) => `/voorzieningen/${id}`,
  offerte: (id) => `/offertes/${id}`,
  medewerker: (id) => `/personeel/${id}`,
  document: (id) => `/documenten/${id}`,
  dossier: (id) => `/dossiers/${id}`,
  onderhoud: (id) => `/onderhoud/werkbonnen/${id}`,
  klant: (id) => `/crm/${id}`,
  // Projecten worden in de huidige Connect-schil als opdrachten ontsloten.
  project: () => "/opdrachten",
  calculatie: (id) => `/modules/calculatie/${id}`,
  opdracht: (id) => `/opdrachten/${id}`,
  leverancier: (id) => `/leveranciers/${id}`,
  factuur: (id) => `/facturen/${id}`,
};

export function bouwCitaties(
  contextBronnen: AiContextBron[],
  paginaContext?: { object_type?: string; object_id?: number },
  toolResultaten?: Array<{ toolNaam: string; bron?: string; peildatum?: string; href?: string }>,
): Citatie[] {
  const citaties: Citatie[] = [];
  const gezien = new Set<string>();

  // 1. Paginacontext zelf is de primaire klik-veilige citatie als de gebruiker
  //    hem geautoriseerd heeft kunnen zien.
  if (
    paginaContext?.object_type &&
    ENTITEIT_HREF[paginaContext.object_type] &&
    typeof paginaContext.object_id === "number" &&
    Number.isInteger(paginaContext.object_id) &&
    paginaContext.object_id > 0
  ) {
    const type = paginaContext.object_type;
    const id = paginaContext.object_id;
    const sleutel = `${type}:${id}`;
    gezien.add(sleutel);
    citaties.push({
      label: `${type} #${id}`,
      bron: `Gegevens van dit ${type}`,
      entiteitstype: type,
      entiteitId: id,
      href: ENTITEIT_HREF[type](id),
    });
  }

  // 2. Overige geautoriseerde contextbronnen.
  for (const b of contextBronnen) {
    const payload = (b.payload ?? {}) as Record<string, unknown>;
    const type = typeof payload.entiteitstype === "string" ? payload.entiteitstype : undefined;
    const idRuw = payload.entiteitId ?? payload.id;
    const id = typeof idRuw === "number" && Number.isInteger(idRuw) ? idRuw : undefined;
    if (type && id != null && ENTITEIT_HREF[type]) {
      const sleutel = `${type}:${id}`;
      if (gezien.has(sleutel)) continue;
      gezien.add(sleutel);
      citaties.push({
        label: `${type} #${id}`,
        bron: b.type,
        entiteitstype: type,
        entiteitId: id,
        href: ENTITEIT_HREF[type](id),
      });
    } else if (b.type === "kennisbron") {
      const sleutel = "kennisbron";
      if (gezien.has(sleutel)) continue;
      gezien.add(sleutel);
      citaties.push({ label: "Connect-kennisbank", bron: "kennisbron" });
    }
  }

  // 3. Tool-resultaten: elke succesvolle tool-aanroep met een `bron`-veld
  //    levert een citatie. Zo hebben antwoorden met factuurcijfers altijd
  //    een bronverwijzing (vereiste: geen antwoord met getal zonder citatie).
  if (toolResultaten) {
    for (const t of toolResultaten) {
      if (!t.bron) continue;
      const sleutel = `tool:${t.toolNaam}`;
      if (gezien.has(sleutel)) continue;
      gezien.add(sleutel);
      citaties.push({
        label: t.toolNaam,
        bron: t.bron,
        href: t.href ?? undefined,
      });
    }
  }

  return citaties;
}

/** Fail-closed normalisatie van in JSON opgeslagen bronverwijzingen. */
export function normaliseerCitaties(waarde: unknown): Citatie[] {
  if (!Array.isArray(waarde)) return [];
  return waarde.flatMap((item): Citatie[] => {
    if (!item || typeof item !== "object") return [];
    const r = item as Record<string, unknown>;
    if (typeof r.label !== "string" || typeof r.bron !== "string") return [];
    const label = r.label.trim().slice(0, 300);
    const bron = r.bron.trim().slice(0, 500);
    if (!label || !bron) return [];
    const href =
      typeof r.href === "string" && r.href.startsWith("/") && !r.href.startsWith("//")
        ? r.href
        : undefined;
    return [{
      label,
      bron,
      entiteitstype: typeof r.entiteitstype === "string"
        ? r.entiteitstype.slice(0, 100)
        : undefined,
      entiteitId: typeof r.entiteitId === "number" && Number.isInteger(r.entiteitId)
        ? r.entiteitId
        : undefined,
      href,
    }];
  });
}

// ── DB-helpers ───────────────────────────────────────────────────────────────

// Vindt het bestaande gesprek voor actor + effectieve gebruiker + rol + actuele
// autorisatiesnapshot, of maakt er één aan.
export async function vindOfMaakGesprek(
  actorId: number,
  effectieveUserId: number,
  effectieveRol: string,
  autorisatieHash: string,
): Promise<number> {
  const rol = (effectieveRol || "gebruiker").trim().toLowerCase();

  // Probeer in te voegen; bij conflict (race of bestaand) niets doen.
  await db
    .insert(adviseurGesprekkenTable)
    .values({
      actorId,
      gebruikerId: effectieveUserId,
      effectieveRol: rol,
      autorisatieHash,
    })
    .onConflictDoNothing();

  // Selecteer het (zojuist ingevoegde of al bestaande) gesprek.
  const [bestaand] = await db
    .select({ id: adviseurGesprekkenTable.id })
    .from(adviseurGesprekkenTable)
    .where(
      and(
        eq(adviseurGesprekkenTable.actorId, actorId),
        eq(adviseurGesprekkenTable.gebruikerId, effectieveUserId),
        eq(adviseurGesprekkenTable.effectieveRol, rol),
        eq(adviseurGesprekkenTable.autorisatieHash, autorisatieHash),
      ),
    )
    .limit(1);

  if (!bestaand) {
    // Zou niet mogen voorkomen na insert-or-ignore; veiligheidsnet.
    throw new Error(`adviseur: gesprek aanmaken mislukt voor gebruiker ${effectieveUserId} / ${rol}`);
  }
  return bestaand.id;
}

// Laadt de begrensde, server-eigen historie voor een gesprek. Nooit de client.
export async function laadBegrensdeHistorie(
  gesprekId: number,
  max: number = MAX_HISTORIE_BERICHTEN,
): Promise<HistorieBericht[]> {
  const rijen = await db
    .select({ rol: adviseurBerichtenTable.rol, inhoud: adviseurBerichtenTable.inhoud })
    .from(adviseurBerichtenTable)
    .where(eq(adviseurBerichtenTable.gesprekId, gesprekId))
    .orderBy(desc(adviseurBerichtenTable.id))
    .limit(Math.max(1, max));
  return begrensHistorie(
    rijen.reverse().map((r) => ({ rol: r.rol as "user" | "assistant", inhoud: r.inhoud })),
    max,
  );
}

// Laadt de laatste 100 berichten voor weergave, met tijdstempel. Gebruikt door
// GET /adviseur/gesprek; ook de UI-historie is bewust begrensd.
export async function laadVolledigGesprek(gesprekId: number): Promise<
  Array<{
    id: number;
    rol: "user" | "assistant";
    inhoud: string;
    citaties: Citatie[];
    aangemaaktOp: Date;
  }>
> {
  const rijen = await db
    .select({
      id: adviseurBerichtenTable.id,
      rol: adviseurBerichtenTable.rol,
      inhoud: adviseurBerichtenTable.inhoud,
      citaties: adviseurBerichtenTable.citaties,
      aangemaaktOp: adviseurBerichtenTable.aangemaaktOp,
    })
    .from(adviseurBerichtenTable)
    .where(eq(adviseurBerichtenTable.gesprekId, gesprekId))
    .orderBy(desc(adviseurBerichtenTable.id))
    .limit(100);
  return rijen.reverse().map((r) => ({
    id: r.id,
    rol: r.rol as "user" | "assistant",
    inhoud: r.inhoud,
    citaties: normaliseerCitaties(r.citaties),
    aangemaaktOp: r.aangemaaktOp,
  }));
}

// Slaat het vraag- en antwoordbericht op in de server-eigen conversatie en werkt
// bijgewerktOp bij. Alleen aanroepen bij een daadwerkelijk beantwoorde vraag.
export async function bewaarWisseling(
  gesprekId: number,
  vraag: string,
  antwoord: string,
  citaties: Citatie[] = [],
): Promise<void> {
  await db.insert(adviseurBerichtenTable).values([
    { gesprekId, rol: "user", inhoud: vraag },
    {
      gesprekId,
      rol: "assistant",
      inhoud: antwoord,
      citaties: citaties.length > 0 ? citaties : null,
    },
  ]);
  await db
    .update(adviseurGesprekkenTable)
    .set({ bijgewerktOp: new Date() })
    .where(eq(adviseurGesprekkenTable.id, gesprekId));
}

export interface AuditInvoer {
  gesprekId: number | null;
  gebruikerId: number;
  actorId: number;            // echte ingelogde gebruiker (≠ gebruikerId bij impersonatie)
  effectieveRol: string;
  autorisatieHash: string;
  vraag: string;
  antwoord: string | null;
  contextGebruikt: unknown;
  toolAutorisaties: unknown;
  geweigerdeTools: unknown;
  citaties: unknown;
  bronbewijs: unknown | null;
  uitkomst: AdviseurUitkomst;
}

/**
 * Slaat een geslaagde vraag/antwoord-wisseling en de bijbehorende auditregel
 * atomair op. Als één onderdeel faalt, blijft er geen niet-geaudit antwoord in
 * de gesprekshistorie achter.
 */
export async function bewaarWisselingMetAudit(
  gesprekId: number,
  vraag: string,
  antwoord: string,
  citaties: Citatie[],
  audit: AuditInvoer,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(adviseurBerichtenTable).values([
      { gesprekId, rol: "user", inhoud: vraag },
      {
        gesprekId,
        rol: "assistant",
        inhoud: antwoord,
        citaties: citaties.length > 0 ? citaties : null,
      },
    ]);
    await tx
      .update(adviseurGesprekkenTable)
      .set({ bijgewerktOp: new Date() })
      .where(eq(adviseurGesprekkenTable.id, gesprekId));
    await tx.insert(adviseurAuditTable).values({
      gesprekId: audit.gesprekId,
      gebruikerId: audit.gebruikerId,
      actorId: audit.actorId,
      effectieveRol: (audit.effectieveRol || "gebruiker").trim().toLowerCase(),
      autorisatieHash: audit.autorisatieHash,
      vraag: audit.vraag,
      antwoord: audit.antwoord,
      contextGebruikt: audit.contextGebruikt ?? null,
      toolAutorisaties: audit.toolAutorisaties ?? null,
      geweigerdeTools: audit.geweigerdeTools ?? null,
      citaties: audit.citaties ?? null,
      bronbewijs: audit.bronbewijs ?? null,
      uitkomst: audit.uitkomst,
    });
  });
}

// Schrijft één auditregel weg. Faalt nooit de request: fouten worden door de
// aanroeper afgevangen/gelogd.
export async function schrijfAudit(invoer: AuditInvoer): Promise<void> {
  await db.insert(adviseurAuditTable).values({
    gesprekId: invoer.gesprekId,
    gebruikerId: invoer.gebruikerId,
    actorId: invoer.actorId,
    effectieveRol: (invoer.effectieveRol || "gebruiker").trim().toLowerCase(),
    autorisatieHash: invoer.autorisatieHash,
    vraag: invoer.vraag,
    antwoord: invoer.antwoord,
    contextGebruikt: invoer.contextGebruikt ?? null,
    toolAutorisaties: invoer.toolAutorisaties ?? null,
    geweigerdeTools: invoer.geweigerdeTools ?? null,
    citaties: invoer.citaties ?? null,
    bronbewijs: invoer.bronbewijs ?? null,
    uitkomst: invoer.uitkomst,
  });
}
